import * as THREE from 'three';
import type { Materials } from '../palette';
import { TABLE_TOP_Y } from './roomLayout';

/**
 * Code-built stand-ins for the theatre's Blender models, used when one fails
 * to load. Each carries the named nodes its model has (`floor`, `tray_anchor`,
 * `lens_main`), so the room assembles the same way from either.
 */

/** A plain floor, when the theatre shell is missing. */
export function fallbackFloor(materials: Materials): THREE.Mesh {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), materials.floor);
  floor.name = 'floor';
  floor.rotation.x = -Math.PI / 2;
  return floor;
}

/** Table top, a single central column, a wide base and the right-hand arm board. */
export function fallbackTable(materials: Materials): THREE.Group {
  const table = new THREE.Group();
  table.name = 'operating-table';

  const top = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.06, 2.0), materials.tableTop);
  top.position.y = TABLE_TOP_Y - 0.03;
  table.add(top);

  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.13, TABLE_TOP_Y - 0.1, 16),
    materials.steelDark,
  );
  column.position.y = (TABLE_TOP_Y - 0.1) / 2 + 0.04;
  table.add(column);

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.9), materials.steelDark);
  base.position.y = 0.04;
  table.add(base);

  // Arm board on the patient's right, which is where the forearm procedure works.
  const armBoard = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.36), materials.tableTop);
  armBoard.position.set(-0.42, TABLE_TOP_Y - 0.02, 0);
  table.add(armBoard);
  return table;
}

/** Mayo stand: a tray on a post, origin on the floor under the tray's centre. */
export function fallbackMayoStand(materials: Materials): THREE.Group {
  const stand = new THREE.Group();
  stand.name = 'mayo-stand';

  const trayHeight = TABLE_TOP_Y + 0.14;
  // Satin rather than polished steel: a mirror-finish tray under the lamp
  // reflects it straight back and clips to white.
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.34), materials.steelDark);
  tray.position.y = trayHeight;
  stand.add(tray);

  // Shallow lip so instruments read as sitting in a tray rather than on a slab.
  const lipGeometry = new THREE.BoxGeometry(0.5, 0.02, 0.012);
  for (const z of [-0.164, 0.164]) {
    const lip = new THREE.Mesh(lipGeometry, materials.steelDark);
    lip.position.set(0, trayHeight + 0.018, z);
    stand.add(lip);
  }

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, trayHeight, 12), materials.steelDark);
  post.position.y = trayHeight / 2;
  stand.add(post);

  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 20), materials.steelDark);
  foot.position.y = 0.01;
  stand.add(foot);

  const trayAnchor = new THREE.Object3D();
  trayAnchor.name = 'tray_anchor';
  trayAnchor.position.set(0, trayHeight + 0.012, 0);
  stand.add(trayAnchor);
  return stand;
}

/** A single-dome surgical light, built around its lens at the origin. */
export function fallbackLampHousing(materials: Materials): THREE.Group {
  const rig = new THREE.Group();
  rig.name = 'surgical-light';

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.6),
    materials.steel,
  );
  dome.position.y = 0.11;
  dome.rotation.x = Math.PI;
  rig.add(dome);

  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.27, 24), materials.lightLens);
  lens.rotation.x = -Math.PI / 2;
  rig.add(lens);

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 10), materials.steelDark);
  arm.position.y = 0.46;
  rig.add(arm);

  const lensNode = new THREE.Object3D();
  lensNode.name = 'lens_main';
  rig.add(lensNode);
  return rig;
}
