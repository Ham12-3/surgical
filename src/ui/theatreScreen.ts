import type { PatientModel } from '../data/zones';
import type { ToolIndex } from '../engine/toolCatalogue';
import type { CameraPresetName } from '../scene/cameras';
import type { ModelLibrary } from '../scene/modelLibrary';
import { ProcedureScene } from '../scene/procedureScene';
import type { Settings } from '../store/settings';
import type { AppShell } from './appShell';
import { ToolTray } from './toolTray';

/**
 * Trays for the variants no procedure has claimed yet: Phase 1 scaffolding,
 * kept so each patient variant can still be looked at. The open abdomen uses
 * the appendectomy's own tray, which is passed in.
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

export interface TheatreScreenOptions {
  shell: AppShell;
  model: PatientModel;
  tools: ToolIndex;
  models: ModelLibrary;
  settings: Settings;
  preset: CameraPresetName;
  /** The open abdomen's instruments: the appendectomy's tray. */
  openAbdomenTray: readonly string[];
}

/**
 * The operating theatre with nothing to judge: pick up the instruments, aim
 * them, and look at each patient variant. What is under the instrument shows
 * in the status panel, and a click on the patient is only logged.
 */
export class TheatreScreen {
  readonly scene: ProcedureScene;
  private readonly tray: ToolTray;

  constructor(options: TheatreScreenOptions) {
    const { shell, model, tools, settings } = options;
    const trayToolIds = model === 'abdomen-open' ? options.openAbdomenTray : TRAY_BY_MODEL[model];
    this.scene = new ProcedureScene({
      container: shell.sceneHost,
      model,
      tools,
      trayToolIds,
      models: options.models,
      quality: settings.quality,
      contentLevel: settings.contentLevel,
      reducedMotion: settings.reducedMotion,
      onAim: (aim) => {
        if (!aim || !aim.zoneId) {
          shell.status.setZone(null, false);
          shell.status.setHint('');
          return;
        }
        shell.status.setZone(this.scene.zones.label(aim.zoneId) ?? aim.zoneId, aim.avoid);
        shell.status.setHint(aim.snapped ? 'Snapped to target' : `Offset from centre: ${(aim.offset * 100).toFixed(0)}%`);
      },
      onToolPicked: (toolId) => this.tray.setSelected(toolId),
      onAction: (aim, toolId) => {
        console.info(`[action] ${tools.get(toolId)?.name ?? toolId} on ${aim.zoneId} (offset ${aim.offset.toFixed(2)})`);
      },
    });
    this.tray = new ToolTray({
      tools,
      toolIds: trayToolIds,
      keys: settings.keys.tools,
      onSelect: (toolId) => this.scene.setTool(toolId),
    });
    shell.mountTray(this.tray.element);
    this.scene.setCameraPreset(options.preset, false);
    // Nothing is judged here; a target is set so snapping can be checked by hand.
    this.scene.setTargetZone(model === 'forearm' ? 'wound_apex_proximal' : null);
  }

  dispose(): void {
    this.tray.dispose();
    this.scene.dispose();
  }
}
