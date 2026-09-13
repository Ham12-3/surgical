import './ui/styles.css';
import toolsJson from './data/tools.json';
import suturePadJson from './data/drills/suturePad.json';
import manifestJson from '../assets/manifest.json';
import { parseToolCatalogue, ToolIndex } from './engine/toolCatalogue';
import { parseSuturePadConfig } from './engine/suturing/config';
import { ProcedureScene } from './scene/procedureScene';
import { createAppShell, type AppScreen } from './ui/appShell';
import { ToolTray } from './ui/toolTray';
import { DrillScreen } from './ui/drillScreen';
import { SuturePadScreen } from './ui/suturePadScreen';
import { ProcedureScreen } from './ui/procedureScreen';
import { isPatientModel, patientModels, type PatientModel } from './data/zones';
import { loadProcedure } from './data/procedures';
import { parseAssetManifest } from './data/assetManifest';
import { ModelLibrary } from './scene/modelLibrary';
import { loadSettings, saveSettings, type QualityLevel, type Settings } from './store/settings';
import { CAMERA_PRESETS, type CameraPresetName } from './scene/cameras';

/**
 * The app: the theatre, with the instrument drill, the suturing pad and the
 * open appendectomy each opened from the top bar in its place.
 *
 * The theatre on its own is still the Phase 1 harness: it mounts one patient
 * variant at a time and lets you pick up instruments and aim them, with the
 * model dropdown as scaffolding until the home screen arrives in Phase 5.
 */

/**
 * Which instruments appear on the theatre's tray for the variants no procedure
 * has claimed yet. The open abdomen uses the appendectomy's own tray.
 */
const TRAY_BY_MODEL: Record<Exclude<PatientModel, 'abdomen-open'>, readonly string[]> = {
  forearm: [
    'antiseptic_swab',
    'local_anesthetic',
    'irrigation_syringe',
    'toothed_forceps',
    'needle_holder',
    'suture_scissors',
    'gauze_swab',
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
const appendectomy = loadProcedure('open_appendectomy', {
  toolIds: tools.ids,
  cameraPresets: Object.keys(CAMERA_PRESETS),
});

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
let suturePad: SuturePadScreen | null = null;
let procedure: ProcedureScreen | null = null;
let screen: AppScreen = 'theatre';
let currentModel: PatientModel | null = null;
const suturePadConfig = parseSuturePadConfig(suturePadJson);

// The brief's starting set is the open instruments; the laparoscopic ones join
// the drill with their own phase.
const drillTools = catalogue.tools.filter((tool) => tool.category !== 'laparoscopic');
let currentPreset: CameraPresetName = 'surgeon';

/** Whichever 3D scene is showing: the theatre's, or the procedure's. */
function activeScene(): ProcedureScene | null {
  return scene ?? procedure?.scene ?? null;
}

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
  if (isPatientModel(model) && screen === 'theatre') mount(model);
});

shell.setQuality(settings.quality);
shell.onQualityChange((quality) => {
  settings = { ...settings, quality };
  saveSettings(storage, settings);
  activeScene()?.setQuality(quality);
});

shell.onDrill(() => showScreen(screen === 'drill' ? 'theatre' : 'drill'));
shell.onSuturePad(() => showScreen(screen === 'suture' ? 'theatre' : 'suture'));
shell.onProcedure(() => showScreen(screen === 'procedure' ? 'theatre' : 'procedure'));

/**
 * Swap what fills the app: the theatre, the instrument drill, the suturing
 * pad or the appendectomy. Whatever was showing is torn down first, so only
 * one renderer holds the graphics card at a time.
 */
function showScreen(next: AppScreen): void {
  if (next === screen) return;
  tray?.dispose();
  scene?.dispose();
  drill?.dispose();
  suturePad?.dispose();
  procedure?.dispose();
  tray = null;
  scene = null;
  drill = null;
  suturePad = null;
  procedure = null;
  screen = next;
  shell.setScreen(next);
  const onExit = (): void => showScreen('theatre');
  if (next === 'drill') drill = new DrillScreen({ host: shell.root, tools: drillTools, models, storage, onExit });
  else if (next === 'suture') {
    suturePad = new SuturePadScreen({ host: shell.root, config: suturePadConfig, models, storage, onExit });
  } else if (next === 'procedure') {
    procedure = new ProcedureScreen({
      host: shell.root,
      procedure: appendectomy,
      tools,
      models,
      quality: settings.quality,
      onExit,
    });
  } else if (currentModel) mount(currentModel);
}

/** Tear down whatever is mounted and build the given variant from scratch. */
function mount(model: PatientModel): void {
  // Disposing before building keeps peak GPU memory at one room, not two.
  tray?.dispose();
  scene?.dispose();
  currentModel = model;

  const trayToolIds = model === 'abdomen-open' ? appendectomy.trayToolIds : TRAY_BY_MODEL[model];

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
      // The theatre on its own judges nothing: the appendectomy screen hands
      // its clicks to the step machine. Here they are only reported.
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

  // Nothing drives the target zone here; highlight one so the snapping
  // behaviour is visible while checking the scene by hand.
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
      return activeScene();
    },
    /** The suturing pad, while it is open: for scripted checks from the console. */
    get suturePad(): SuturePadScreen | null {
      return suturePad;
    },
    /** The appendectomy screen, while it is open: for scripted checks from the console. */
    get procedure(): ProcedureScreen | null {
      return procedure;
    },
    renderOnce(): void {
      const active = activeScene();
      if (!active) return;
      active.viewer.controls.update();
      active.viewer.renderFrame();
    },
    /** Switch quality from the console, to profile one level against another. */
    setQuality(level: QualityLevel): void {
      activeScene()?.setQuality(level);
    },
    profile(frames = 60) {
      const active = activeScene();
      if (!active) return null;
      const { viewer } = active;
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
