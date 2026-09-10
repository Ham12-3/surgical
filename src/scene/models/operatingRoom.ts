import * as THREE from 'three';
import type { Disposer } from '../disposal';
import type { Materials } from '../palette';
import { colors } from '../palette';

/** Height of the table top in metres. Everything else is placed relative to it. */
export const TABLE_TOP_Y = 0.9;

/** Lamp distance above whatever field it is aimed at, in metres. */
const LAMP_HEIGHT = 0.94;
/** Field height the lamp housing geometry was modelled around. */
const RIG_DESIGN_FIELD_Y = 0.99;

/** Where the operative field sits. Cameras and the overhead light aim here. */
export const FIELD_CENTRE = new THREE.Vector3(0, TABLE_TOP_Y + 0.12, 0);

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
  /** Point the overhead light at this variant's operative field. */
  aimLightAt(point: THREE.Vector3): void;
}

/**
 * The room: floor, operating table, Mayo instrument stand, and the lighting rig.
 *
 * Only the overhead spot casts shadows, and its map is kept small. Shadows are
 * the single biggest cost in this scene and one soft pool under the instruments
 * reads as an operating theatre well enough.
 */
export function createOperatingRoom(
  materials: Materials,
  disposer: Disposer,
  options: OperatingRoomOptions,
): OperatingRoom {
  const group = new THREE.Group();
  group.name = 'operating-room';

  // --- Floor -----------------------------------------------------------------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), materials.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // --- Operating table -------------------------------------------------------
  const table = new THREE.Group();
  table.name = 'operating-table';

  const top = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.06, 2.0), materials.tableTop);
  top.position.y = TABLE_TOP_Y - 0.03;
  top.castShadow = true;
  top.receiveShadow = true;
  table.add(top);

  // Single central column and a wide base, as on a modern powered table.
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.13, TABLE_TOP_Y - 0.1, 16),
    materials.steelDark,
  );
  column.position.y = (TABLE_TOP_Y - 0.1) / 2 + 0.04;
  column.castShadow = true;
  table.add(column);

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.9), materials.steelDark);
  base.position.y = 0.04;
  base.castShadow = true;
  table.add(base);

  // Arm board on the patient's right, which is where the forearm procedure works.
  const armBoard = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.36), materials.tableTop);
  armBoard.position.set(-0.42, TABLE_TOP_Y - 0.02, 0);
  armBoard.castShadow = true;
  armBoard.receiveShadow = true;
  table.add(armBoard);

  group.add(table);

  // --- Mayo instrument stand -------------------------------------------------
  const stand = new THREE.Group();
  stand.name = 'mayo-stand';
  stand.position.copy(options.standPosition);

  const trayHeight = TABLE_TOP_Y + 0.14;
  // Satin rather than polished steel: a mirror-finish tray under the lamp
  // reflects it straight back and clips to white.
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.34), materials.steelDark);
  tray.position.y = trayHeight;
  tray.castShadow = true;
  tray.receiveShadow = true;
  stand.add(tray);

  // Shallow lip so instruments read as sitting in a tray rather than on a slab.
  const lipGeometry = new THREE.BoxGeometry(0.5, 0.02, 0.012);
  for (const z of [-0.164, 0.164]) {
    const lip = new THREE.Mesh(lipGeometry, materials.steelDark);
    lip.position.set(0, trayHeight + 0.018, z);
    stand.add(lip);
  }

  const standPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, trayHeight, 12),
    materials.steelDark,
  );
  standPost.position.y = trayHeight / 2;
  stand.add(standPost);

  const standFoot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.02, 20),
    materials.steelDark,
  );
  standFoot.position.y = 0.01;
  stand.add(standFoot);

  const trayAnchor = new THREE.Object3D();
  trayAnchor.position.set(0, trayHeight + 0.012, 0);
  stand.add(trayAnchor);

  group.add(stand);

  // --- Overhead surgical light ----------------------------------------------
  const lightRig = new THREE.Group();
  lightRig.name = 'surgical-light';

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.6),
    materials.steel,
  );
  dome.position.set(0, 2.05, -0.1);
  dome.rotation.x = Math.PI;
  lightRig.add(dome);

  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.27, 24), materials.lightLens);
  lens.position.set(0, 1.94, -0.1);
  lens.rotation.x = -Math.PI / 2;
  lightRig.add(lens);

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 10), materials.steelDark);
  arm.position.set(0, 2.4, -0.1);
  lightRig.add(arm);

  group.add(lightRig);

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
  surgicalLight.position.set(0, 1.93, -0.1);
  surgicalLight.target.position.copy(FIELD_CENTRE);
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
    lightRig.position.set(point.x, point.y - RIG_DESIGN_FIELD_Y, point.z - 0.1);
    lens.position.set(0, 1.94, 0);
    dome.position.set(0, 2.05, 0);
    arm.position.set(0, 2.4, 0);
  };
  aimLightAt(FIELD_CENTRE.clone());

  disposer.track(group);
  return { group, trayAnchor, surgicalLight, aimLightAt };
}
