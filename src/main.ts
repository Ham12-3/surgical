import './ui/styles.css';
import toolsJson from './data/tools.json';
import manifestJson from '../assets/manifest.json';
import { parseToolCatalogue, ToolIndex } from './engine/toolCatalogue';
import { ProcedureScene } from './scene/procedureScene';
import { createAppShell } from './ui/appShell';
import { ToolTray } from './ui/toolTray';
import { DrillScreen } from './ui/drillScreen';
import { isPatientModel, patientModels, type PatientModel } from './data/zones';
import { parseAssetManifest } from './data/assetManifest';
import { ModelLibrary } from './scene/modelLibrary';
import { loadSettings, saveSettings, type QualityLevel, type Settings } from './store/settings';
import type { CameraPresetName } from './scene/cameras';

/**
 * Phase 1 harness.
 *
 * There is no procedure engine yet, so this mounts one patient variant at a
 * time and lets you pick up instruments and aim them. The model dropdown is
 * scaffolding for checking all three variants; Phase 3 replaces it with the
 * home screen and a real procedure.
 */

/**
 * Which instruments appear on the tray for each variant. These move into the
 * procedure JSON in Phase 2 — a procedure declares its own tray.
 */
const TRAY_BY_MODEL: Record<PatientModel, readonly string[]> = {
  forearm: [
    'antiseptic_swab',
    'local_anesthetic',
    'irrigation_syringe',
    'toothed_forceps',
    'needle_holder',
    'suture_scissors',
    'gauze_swab',
  ],
  'abdomen-open': [
    'antiseptic_swab',
    'scalpel',
    'electrocautery',
    'mayo_scissors',
    'metzenbaum_scissors',
    'army_navy_retractor',
    'richardson_retractor',
    'babcock_forceps',
    'kelly_clamp',
    'needle_holder',
  ],
  'abdomen-lap': [
    'veress_needle',
    'trocar_10mm',
    'trocar_5mm',
    'laparoscope',
    'lap_grasper',
    'maryland_dissector',
    'hook_cautery',
    'clip_applier',
    'lap_scissors',
    'retrieval_bag',
  ],
};

const container = document.querySelector<HTMLElement>('#app');
if (!container) throw new Error('#app container is missing from index.html');

const catalogue = parseToolCatalogue(toolsJson);
const tools = new ToolIndex(catalogue);

// Every model listed in assets/manifest.json is fetched once, before anything
// is mounted, so building the room and the tools stays synchronous. A model
// that fails to load falls back to a code-built stand-in rather than stopping
// the app.
const manifest = parseAssetManifest(manifestJson);
// Dev only: `?models=off` skips the models, so the code-built stand-ins can be
// profiled against them in the same build and page state.
const skipModels =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get('models') === 'off';
const models = await ModelLibrary.load(skipModels ? [] : manifest.assets, import.meta.env.BASE_URL);

// Settings persist in localStorage, which can be missing or throw (private
// windows, blocked site data); the app then runs on the defaults.
const storage = ((): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
let settings: Settings = loadSettings(storage);

let scene: ProcedureScene | null = null;
let tray: ToolTray | null = null;
let drill: DrillScreen | null = null;
let currentModel: PatientModel | null = null;

// The brief's starting set is the open instruments; the laparoscopic ones join
// the drill with their own phase.
const drillTools = catalogue.tools.filter((tool) => tool.category !== 'laparoscopic');
let currentPreset: CameraPresetName = 'surgeon';

const shell = createAppShell(
  container,
  (name) => {
    currentPreset = name;
    shell.setActivePreset(name);
    scene?.setCameraPreset(name);
  },
  patientModels,
);

shell.onModelChange((model) => {
  if (isPatientModel(model)) mount(model);
});

shell.setQuality(settings.quality);
shell.onQualityChange((quality) => {
  settings = { ...settings, quality };
  saveSettings(storage, settings);
  scene?.setQuality(quality);
});

shell.onDrill(() => (drill ? leaveDrill() : enterDrill()));

/**
 * Swap the theatre for the drill. The procedure scene is torn down first, so
 * only one renderer holds the graphics card at a time.
 */
function enterDrill(): void {
  tray?.dispose();
  scene?.dispose();
  tray = null;
  scene = null;
  shell.setDrillActive(true);
  drill = new DrillScreen({ host: shell.root, tools: drillTools, models, storage, onExit: leaveDrill });
}

function leaveDrill(): void {
  drill?.dispose();
  drill = null;
  shell.setDrillActive(false);
  if (currentModel) mount(currentModel);
}

/** Tear down whatever is mounted and build the given variant from scratch. */
function mount(model: PatientModel): void {
  // Disposing before building keeps peak GPU memory at one room, not two.
  tray?.dispose();
  scene?.dispose();
  currentModel = model;

  const trayToolIds = TRAY_BY_MODEL[model];

  scene = new ProcedureScene({
    container: shell.sceneHost,
    model,
    tools,
    trayToolIds,
    models,
    quality: settings.quality,
    onAim: (aim) => {
      if (!aim || !aim.zoneId) {
        shell.status.setZone(null, false);
        shell.status.setHint('');
        return;
      }
      const label = scene?.zones.label(aim.zoneId) ?? aim.zoneId;
      shell.status.setZone(label, aim.avoid);
      shell.status.setHint(
        aim.snapped ? 'Snapped to target' : `Offset from centre: ${(aim.offset * 100).toFixed(0)}%`,
      );
    },
    onToolPicked: (toolId) => tray?.setSelected(toolId),
    onAction: (aim, toolId) => {
      // Phase 1 has no engine to judge this, so just report it. Phase 3 turns
      // this callback into a ToolAction and hands it to the step machine.
      const tool = tools.get(toolId);
      console.info(
        `[action] ${tool?.name ?? toolId} on ${aim.zoneId} (offset ${aim.offset.toFixed(2)})`,
      );
    },
  });

  tray = new ToolTray({
    tools,
    toolIds: trayToolIds,
    onSelect: (toolId) => scene?.setTool(toolId),
  });
  shell.mountTray(tray.element);

  scene.setCameraPreset(currentPreset, false);
  shell.setActivePreset(currentPreset);

  // Nothing drives the target zone until the engine exists; highlight one so
  // the snapping behaviour is visible while checking the scene by hand.
  const firstPointTarget = model === 'forearm' ? 'wound_apex_proximal' : null;
  scene.setTargetZone(firstPointTarget);
}

const initial = patientModels[0];
if (initial) mount(initial);

/**
 * Dev-only console handle, stripped from production builds.
 *
 * `profile()` renders frames synchronously and stalls on `readPixels` after
 * each, so the timing covers the whole GPU frame rather than just queuing
 * draw calls. That works even when the page is hidden and requestAnimationFrame
 * has stopped, which is exactly when you cannot eyeball a frame counter.
 */
if (import.meta.env.DEV) {
  const round = (value: number): number => Math.round(value * 10) / 10;
  (window as unknown as { __trainer: unknown }).__trainer = {
    get scene(): ProcedureScene | null {
      return scene;
    },
    renderOnce(): void {
      if (!scene) return;
      scene.viewer.controls.update();
      scene.viewer.renderFrame();
    },
    /** Switch quality from the console, to profile one level against another. */
    setQuality(level: QualityLevel): void {
      scene?.setQuality(level);
    },
    profile(frames = 60) {
      if (!scene) return null;
      const { viewer } = scene;
      const { renderer, canvas } = viewer;
      const gl = renderer.getContext();
      const pixel = new Uint8Array(4);
      viewer.renderFrame();
      const start = performance.now();
      for (let i = 0; i < frames; i += 1) {
        viewer.renderFrame();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      }
      const msPerFrame = (performance.now() - start) / frames;
      // Post-processing renders several times a frame, and the counters
      // normally reset on each, so count one whole frame by hand.
      renderer.info.autoReset = false;
      renderer.info.reset();
      viewer.renderFrame();
      const { calls, triangles } = renderer.info.render;
      renderer.info.autoReset = true;
      return {
        msPerFrame: round(msPerFrame),
        fps: round(1000 / msPerFrame),
        canvas: [canvas.width, canvas.height],
        drawCalls: calls,
        triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      };
    },
  };
}
