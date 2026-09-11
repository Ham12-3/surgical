import * as THREE from 'three';
import type { Disposer } from '../disposal';
import type { ModelLibrary } from '../modelLibrary';
import type { Materials } from '../palette';
import { colors } from '../palette';
import {
  fallbackFloor,
  fallbackLampHousing,
  fallbackMayoStand,
  fallbackTable,
} from './roomFallbacks';
import { FIELD_CENTRE } from './roomLayout';

export { FIELD_CENTRE, TABLE_TOP_Y } from './roomLayout';

/** Lamp distance above whatever field it is aimed at, in metres. */
const LAMP_HEIGHT = 0.94;

/**
 * Free-standing equipment, in room coordinates: the vitals monitor at the head
 * end of the table, and the back table off to the side, clear of the working
 * camera views.
 */
const MONITOR_POSITION = new THREE.Vector3(0.62, 0, -1.15);
const BACK_TABLE_POSITION = new THREE.Vector3(1.35, 0, -0.1);

export interface OperatingRoomOptions {
  /**
   * Where the Mayo stand goes. It belongs within reach of whoever is operating,
   * which is beside the arm board for a limb case and beside the abdomen
   * otherwise.
   */
  standPosition: THREE.Vector3;
}

export interface OperatingRoom {
  group: THREE.Group;
  /** Anchor on the Mayo stand where instrument meshes are laid out. */
  trayAnchor: THREE.Object3D;
  /** The overhead surgical light, so a step can dim or re-aim it. */
  surgicalLight: THREE.SpotLight;
  /** Whether a vitals monitor stands in the room, so the scene knows to drive its screen. */
  hasMonitor: boolean;
  /** Point the overhead light at this variant's operative field. */
  aimLightAt(point: THREE.Vector3): void;
}

/**
 * The theatre: shell, operating table, Mayo stand, surgical light, vitals
 * monitor and back table. Each comes from its Blender model in
 * assets/manifest.json, or from a code-built stand-in in roomFallbacks.ts if
 * the model failed to load. The monitor and back table have no stand-in and
 * are left out without their models.
 *
 * Only the overhead spot casts shadows, and its map is kept small. Shadows are
 * the single biggest cost in this scene and one soft pool under the instruments
 * reads as an operating theatre well enough.
 */
export function createOperatingRoom(
  materials: Materials,
  disposer: Disposer,
  models: ModelLibrary,
  options: OperatingRoomOptions,
): OperatingRoom {
  const group = new THREE.Group();
  group.name = 'operating-room';

  const shell = models.instantiate('env_theatre_shell', materials) ?? fallbackFloor(materials);
  // Walls and floor sit behind everything else. Drawn first, every pixel of
  // them is shaded and then painted over; drawn last, the depth test skips
  // whatever the table, patient and drapes already cover. That measured 3 to
  // 4 ms a frame in the surgeon and wide views.
  shell.traverse((object) => {
    object.renderOrder = 1;
  });
  group.add(shell);
  // Only the floor takes shadows. The walls are too far from the lamp to catch
  // one, and would pay for the shadow lookup on every pixel they cover.
  group.getObjectByName('floor')?.traverse((object) => {
    object.receiveShadow = true;
  });

  const table = models.instantiate('env_or_table', materials) ?? fallbackTable(materials);
  castAndReceive(table);
  group.add(table);

  const stand = models.instantiate('env_mayo_stand', materials) ?? fallbackMayoStand(materials);
  stand.position.copy(options.standPosition);
  // The model has its post on the +x end. Turn it so the post stands on the
  // side away from the table, whichever side of the table the stand is on.
  if (options.standPosition.x < 0) stand.rotation.y = Math.PI;
  castAndReceive(stand);
  group.add(stand);

  // Instruments are laid out square to the room whichever way the stand faces,
  // so the anchor takes the tray surface's position but not its turn.
  const trayAnchor = new THREE.Object3D();
  (stand.getObjectByName('tray_anchor') ?? stand).getWorldPosition(trayAnchor.position);
  group.add(trayAnchor);

  const monitor = models.instantiate('env_vitals_monitor', materials);
  if (monitor) {
    monitor.position.copy(MONITOR_POSITION);
    group.add(monitor);
  }
  const backTable = models.instantiate('env_back_table', materials);
  if (backTable) {
    backTable.position.copy(BACK_TABLE_POSITION);
    group.add(backTable);
  }

  // --- Overhead surgical light ----------------------------------------------
  const lamp = models.instantiate('env_surgical_light', materials) ?? fallbackLampHousing(materials);
  // Where the main lens sits relative to the model's origin. The spot light
  // goes at the lens and the housing hangs around it.
  const lensOffset = new THREE.Vector3();
  lamp.getObjectByName('lens_main')?.getWorldPosition(lensOffset);
  group.add(lamp);

  // --- Lighting --------------------------------------------------------------
  // The environment map supplies most of the ambient light, so these are just
  // enough to lift the shadows and give the room some direction.
  const hemisphere = new THREE.HemisphereLight(0xdfe9f2, 0x30363f, 0.3);
  group.add(hemisphere);

  const fill = new THREE.DirectionalLight(0xd8e4f0, 0.4);
  fill.position.set(-2.2, 2.4, 2.0);
  group.add(fill);

  // A RectAreaLight models the broad lamp face more faithfully, but it measured
  // as the most expensive thing in the frame: about 10 ms of a 33 ms frame at
  // 1336x914, more than sheen and clearcoat combined. A wide-penumbra spot over
  // the environment lighting reads almost the same for a fraction of the cost.
  //
  // Three's lights are in physical units: with the default inverse-square
  // decay, illuminance at the field is intensity / distance squared, so the
  // small-looking number is right for a lamp about 0.95 m up.
  const surgicalLight = new THREE.SpotLight(colors.lightWarm, 2.6, 6, Math.PI / 5.5, 0.85, 2);
  surgicalLight.castShadow = true;
  surgicalLight.shadow.mapSize.set(1024, 1024);
  surgicalLight.shadow.camera.near = 0.3;
  surgicalLight.shadow.camera.far = 4;
  surgicalLight.shadow.bias = -0.0012;
  surgicalLight.shadow.radius = 3;
  group.add(surgicalLight);
  group.add(surgicalLight.target);
  disposer.add(() => surgicalLight.dispose());

  const aimLightAt = (point: THREE.Vector3): void => {
    surgicalLight.target.position.copy(point);
    surgicalLight.target.updateMatrixWorld();
    // Keep the lamp a fixed distance above the field, the way a surgeon pulls
    // it down to the working height. At a fixed room height the abdomen, 13 cm
    // higher than a forearm on the arm board, got about 35% more light and
    // washed out. The housing moves with it so light and source agree.
    surgicalLight.position.set(point.x, point.y + LAMP_HEIGHT, point.z - 0.1);
    lamp.position.copy(surgicalLight.position).sub(lensOffset);
  };
  aimLightAt(FIELD_CENTRE.clone());

  disposer.track(group);
  return { group, trayAnchor, surgicalLight, hasMonitor: monitor !== null, aimLightAt };
}

/** Near the lamp, equipment both casts and catches the shadow. */
function castAndReceive(root: THREE.Object3D): void {
  root.traverse((object) => {
    object.castShadow = true;
    object.receiveShadow = true;
  });
}
