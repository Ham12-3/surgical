import './ui/styles.css';
import toolsJson from './data/tools.json';
import manifestJson from '../assets/manifest.json';
import { parseToolCatalogue, ToolIndex } from './engine/toolCatalogue';
import { ProcedureScene } from './scene/procedureScene';
import { createAppShell } from './ui/appShell';
import { ToolTray } from './ui/toolTray';
import { isPatientModel, patientModels, type PatientModel } from './data/zones';
import { parseAssetManifest } from './data/assetManifest';
import { ModelLibrary } from './scene/modelLibrary';
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

let scene: ProcedureScene | null = null;
let tray: ToolTray | null = null;
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

/** Tear down whatever is mounted and build the given variant from scratch. */
function mount(model: PatientModel): void {
  // Disposing before building keeps peak GPU memory at one room, not two.
  tray?.dispose();
  scene?.dispose();

  const trayToolIds = TRAY_BY_MODEL[model];

  scene = new ProcedureScene({
    container: shell.sceneHost,
    model,
    tools,
    trayToolIds,
    models,
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
      const { renderer, scene: threeScene, camera } = scene.viewer;
      scene.viewer.controls.update();
      renderer.render(threeScene, camera);
    },
    profile(frames = 60) {
      if (!scene) return null;
      const { renderer, scene: threeScene, camera, canvas } = scene.viewer;
      const gl = renderer.getContext();
      const pixel = new Uint8Array(4);
      renderer.render(threeScene, camera);
      const start = performance.now();
      for (let i = 0; i < frames; i += 1) {
        renderer.render(threeScene, camera);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      }
      const msPerFrame = (performance.now() - start) / frames;
      return {
        msPerFrame: round(msPerFrame),
        fps: round(1000 / msPerFrame),
        canvas: [canvas.width, canvas.height],
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      };
    },
  };
}
