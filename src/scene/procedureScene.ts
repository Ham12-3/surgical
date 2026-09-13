import * as THREE from 'three';
import { Viewer } from './viewer';
import { createMaterials } from './palette';
import { createSceneTextures } from './textures';
import { applyStudioEnvironment } from './environment';
import { createOperatingRoom } from './models/operatingRoom';
import { createPatient } from './models/patient';
import { ZoneField, type ZoneHit } from './models/zones';
import { PointerTracker } from './interaction';
import { CameraDirector, type CameraPresetName } from './cameras';
import { ToolController, type Aim } from './tools/toolController';
import { TrayLayout } from './tools/trayLayout';
import { VitalsDisplay } from './models/vitalsDisplay';
import { DELIVERED_ZONE_IDS } from './models/ileocaecum';
import type { AbdomenWound } from './models/abdomenWound';
import { PostProcessing } from './postProcessing';
import { QUALITY } from './quality';
import { ContentLevelControl } from './contentLevel';
import type { ContentLevel, QualityLevel } from '../store/settings';
import type { ModelLibrary } from './modelLibrary';
import { getZoneManifest, type PatientModel, type ZoneManifest } from '../data/zones';
import { pickableZoneIds } from '../data/zones/layers';
import type { WoundStage } from '../data/procedures/appendectomyStage';
import type { ToolIndex } from '../engine/toolCatalogue';
import type { VitalsState } from '../engine/procedure/vitals';

/**
 * Where the Mayo stand sits for each variant: within reach of the operator,
 * which for a limb case means beside the arm board rather than across the
 * patient.
 */
const STAND_POSITION: Record<PatientModel, THREE.Vector3> = {
  forearm: new THREE.Vector3(-0.62, 0, 0.52),
  'abdomen-open': new THREE.Vector3(0.62, 0, 0.42),
  'abdomen-lap': new THREE.Vector3(0.62, 0, 0.3),
};

export interface ProcedureSceneOptions {
  container: HTMLElement;
  model: PatientModel;
  tools: ToolIndex;
  /** Instruments available for this procedure, in tray order. */
  trayToolIds: readonly string[];
  /** Every Blender-exported model, loaded once at startup. */
  models: ModelLibrary;
  /** Starting quality level; setQuality() changes it later. */
  quality: QualityLevel;
  /** How tissue and bleeding are drawn (settings.ts); Reduced unless given. */
  contentLevel?: ContentLevel;
  /** Camera presets and the wound change at once rather than easing. */
  reducedMotion?: boolean;
  /** Fires when the student performs an action on the patient. */
  onAction?: (aim: Aim, toolId: string) => void;
  /** Fires when a tool is picked up from the 3D tray. */
  onToolPicked?: (toolId: string) => void;
  /** Fires every frame with wherever the instrument is aimed. */
  onAim?: (aim: Aim | null) => void;
  /** With no instrument in hand: the zone under the pointer, every frame, highlighted as it is. */
  onZoneHover?: (hit: ZoneHit | null) => void;
  /** With no instrument in hand: a click on a zone. */
  onZoneClick?: (hit: ZoneHit) => void;
}

/**
 * Assembles a full operating room for one procedure and owns its lifetime.
 *
 * This is the seam the engine plugs into: the scene reports aims and actions
 * outward and takes tool, target, wound and vitals instructions inward, but
 * knows nothing about steps, scoring or correctness.
 */
export class ProcedureScene {
  readonly viewer: Viewer;
  readonly zones: ZoneField;
  readonly camera: CameraDirector;

  private readonly toolController: ToolController;
  private readonly tray: TrayLayout;
  private readonly pointer: PointerTracker;
  private readonly options: ProcedureSceneOptions;
  private readonly manifest: ZoneManifest;
  private readonly vitals: VitalsDisplay | null;
  private readonly wound: AbdomenWound | null;
  private readonly surgicalLight: THREE.SpotLight;
  private readonly lift = new THREE.Vector3();
  private readonly content: ContentLevelControl;
  private reducedMotion = false;

  constructor(options: ProcedureSceneOptions) {
    this.options = options;

    this.manifest = getZoneManifest(options.model);

    // The real target is set by the camera preset below, once the patient
    // variant has told us where its field centre is.
    this.viewer = new Viewer({ container: options.container, target: new THREE.Vector3() });
    const disposer = this.viewer.disposer;
    const scene = this.viewer.scene;

    applyStudioEnvironment(this.viewer.renderer, scene, disposer);
    const textures = createSceneTextures(disposer);
    const materials = createMaterials(disposer, textures);
    this.content = new ContentLevelControl(materials);
    const room = createOperatingRoom(materials, disposer, options.models, {
      standPosition: STAND_POSITION[options.model].clone(),
    });
    scene.add(room.group);
    // Drives the monitor's screen, when the room has a monitor to show it on.
    this.vitals = room.hasMonitor ? new VitalsDisplay(materials.screen, disposer) : null;
    this.surgicalLight = room.surgicalLight;

    const patient = createPatient(options.model, materials, disposer);
    scene.add(patient.group);

    // Point the overhead light at this variant's field rather than at the
    // middle of the table, or a limb case is lit from the wrong place.
    room.aimLightAt(patient.fieldCentre);

    this.zones = new ZoneField(this.manifest, materials, disposer);
    scene.add(this.zones.group);

    // Below the skin, zones are only reached through the wound's opening.
    const wound = patient.wound;
    this.wound = wound;
    if (wound) this.zones.setAperture((ray) => wound.admits(ray));

    this.toolController = new ToolController(
      options.tools,
      materials,
      disposer,
      patient.fieldCentre.y,
      options.models,
    );
    scene.add(this.toolController.group);

    this.tray = new TrayLayout(
      options.trayToolIds,
      options.tools,
      materials,
      disposer,
      options.models,
    );
    room.trayAnchor.add(this.tray.group);

    this.pointer = new PointerTracker(this.viewer.canvas, this.viewer.camera, disposer);
    this.camera = new CameraDirector(this.viewer.camera, this.viewer.controls, patient.fieldCentre);
    this.camera.snapTo('surgeon');

    // Any manual camera move wins over an in-flight preset transition.
    const onControlStart = (): void => this.camera.cancel();
    this.viewer.controls.addEventListener('start', onControlStart);
    disposer.add(() => this.viewer.controls.removeEventListener('start', onControlStart));

    disposer.add(this.pointer.onClick(() => this.handleClick()));

    const stopFrame = this.viewer.onFrame((delta) => this.tick(delta));
    disposer.add(stopFrame);

    this.setContentLevel(options.contentLevel ?? 'reduced');
    this.setReducedMotion(options.reducedMotion ?? false);
    this.setQuality(options.quality);
    this.viewer.start();
  }

  /** Put an instrument in the student's hand, or null to put it down. */
  setTool(toolId: string | null): void {
    this.toolController.select(toolId);
  }

  get heldTool(): string | null {
    return this.toolController.selected;
  }

  /**
   * Tell the scene which zone the current step wants, so that only that
   * zone's layer can be picked, and, with `snap`, so a small target pulls the
   * instrument's tip to its centre. Snapping shows where the target is, so
   * only the modes that give that away ask for it. Null lifts both.
   */
  setTargetZone(zoneId: string | null, snap = true): void {
    this.toolController.setTargetZone(snap ? zoneId : null);
    this.zones.setPickable(pickableZoneIds(this.manifest, zoneId));
  }

  /** Keep one zone highlighted (Learn's target), or null to highlight only what is under the pointer. */
  setPinnedZone(zoneId: string | null): void {
    this.zones.setPinned(zoneId);
  }

  /** Whether the zone under the pointer is highlighted at all. */
  setHoverHighlight(shown: boolean): void {
    this.zones.setHoverShown(shown);
  }

  /** Show the wound as it is after the steps done so far; ignored by variants without one. */
  setWoundStage(stage: WoundStage): void {
    this.wound?.setStage(stage);
  }

  /** Blood welling in the wound now, millilitres a second. */
  setBleeding(mlPerSecond: number): void {
    this.wound?.setBleeding(mlPerSecond);
  }

  /** Put the vitals model's readings on the monitor. */
  setVitals(vitals: VitalsState): void {
    this.vitals?.setVitals(vitals);
  }

  setCameraPreset(name: CameraPresetName, animate = true): void {
    if (animate && !this.reducedMotion) this.camera.moveTo(name);
    else this.camera.snapTo(name);
  }

  /** Schematic colours the tissues flat and hides the blood; Reduced puts the palette back. */
  setContentLevel(level: ContentLevel): void {
    this.content.apply(level);
    this.wound?.setBloodShown(level !== 'schematic');
  }

  /** With reduced motion, camera presets and the wound change at once. */
  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.wound?.setInstant(reduced);
  }

  /** Apply a quality level (quality.ts) live, without rebuilding the room. */
  setQuality(level: QualityLevel): void {
    const settings = QUALITY[level];
    this.viewer.setPixelRatioCap(settings.pixelRatioCap);

    const light = this.surgicalLight;
    light.castShadow = settings.shadows;
    if (light.shadow.mapSize.x !== settings.shadowMapSize) {
      light.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
      // A shadow map is sized when it is created; drop it so it is rebuilt.
      light.shadow.map?.dispose();
      light.shadow.map = null;
    }

    const wantsPost = settings.bloom || settings.ambientOcclusion;
    const { renderer, scene, camera } = this.viewer;
    this.viewer.setPostProcessing(wantsPost ? new PostProcessing(renderer, scene, camera, settings) : null);
  }

  dispose(): void {
    this.viewer.dispose();
  }

  private tick(delta: number): void {
    this.camera.update(delta);
    this.vitals?.update(delta);
    if (this.wound) {
      this.wound.update(delta);
      // The caecum's zones ride up with it when it is delivered.
      this.zones.displace(DELIVERED_ZONE_IDS, this.lift.set(0, this.wound.deliveryLift, 0));
    }
    const aim = this.toolController.update(this.pointer, this.zones);
    const hover = !aim && this.options.onZoneHover && this.pointer.refresh() ? this.zones.pick(this.pointer.raycaster) : null;
    this.zones.highlight(aim?.zoneId ?? hover?.id ?? null);
    this.options.onAim?.(aim);
    this.options.onZoneHover?.(hover);
  }

  /**
   * A click either picks an instrument off the 3D tray or performs an action on
   * the patient. The tray is checked first; it sits well clear of the field, so
   * the two never compete for the same pixel.
   */
  private handleClick(): void {
    if (!this.pointer.refresh()) return;

    const trayPick = this.tray.pick(this.pointer.raycaster);
    if (trayPick) {
      this.toolController.select(trayPick);
      this.options.onToolPicked?.(trayPick);
      return;
    }

    const held = this.toolController.selected;
    if (!held) {
      const hit = this.options.onZoneClick ? this.zones.pick(this.pointer.raycaster) : null;
      if (hit) this.options.onZoneClick?.(hit);
      return;
    }
    const aim = this.toolController.update(this.pointer, this.zones);
    if (!aim || !aim.zoneId) return;
    // The controller reuses one Aim object per frame, so hand out a copy rather
    // than a reference that will be overwritten before the listener reads it.
    this.options.onAction?.({ ...aim, point: aim.point.clone() }, held);
  }
}
