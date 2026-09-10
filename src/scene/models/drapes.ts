import * as THREE from 'three';
import type { Materials } from '../palette';
import { createClothGeometry } from '../cloth';
import { scaleUvs } from '../geometry';
import { TABLE_TOP_Y } from './operatingRoom';

export interface Window2D {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface SkirtHeights {
  minusX: number;
  plusX: number;
}

/**
 * Footprint of the trunk drape. A little wider than the table so it can hang
 * over the sides; from the neck (the head sits at z = -0.53 and would poke
 * through the sheet) down past the feet, so no bare legs show beyond it.
 */
const OUTER = { x0: -0.34, x1: 0.34, z0: -0.42, z1: 0.98 } as const;

/**
 * How far the top sheet falls where it leaves the flank of the torso, and over
 * what distance. The torso is 0.17 m either side of the midline, so a 0.16 m
 * reach from the 0.34 m outer edge keeps the whole fall outside the body.
 */
export const DRAPE_EDGE_SAG = 0.07;
const EDGE_REACH = 0.16;

const UV_DENSITY = 9;
/** Where the drape tucks against the side of the forearm, just above its axis. */
const LIMB_SIDE_Y = 0.952;
const FOREARM_AXIS_Y = 0.945;
const EPSILON = 1e-6;

/**
 * The trunk drape: a top sheet, optionally with a window cut out over the
 * operative field, plus skirts hanging down each side of the table.
 *
 * The windowed sheet is built as up to four panels framing the window. They
 * share one fold pattern computed in world space, so the seams between them
 * do not show.
 */
export function addTrunkDrape(
  group: THREE.Group,
  materials: Materials,
  window: Window2D | null,
  y: number,
  skirts: SkirtHeights = { minusX: 0.34, plusX: 0.34 },
): void {
  const panels: Array<readonly [x0: number, x1: number, z0: number, z1: number]> = window
    ? [
        [OUTER.x0, OUTER.x1, OUTER.z0, window.z0],
        [OUTER.x0, OUTER.x1, window.z1, OUTER.z1],
        [OUTER.x0, window.x0, window.z0, window.z1],
        [window.x1, OUTER.x1, window.z0, window.z1],
      ]
    : [[OUTER.x0, OUTER.x1, OUTER.z0, OUTER.z1]];

  for (const [x0, x1, z0, z1] of panels) {
    const width = x1 - x0;
    const depth = z1 - z0;
    if (width <= 0 || depth <= 0) continue;

    const centreX = (x0 + x1) / 2;
    const centreZ = (z0 + z1) / 2;
    const geometry = createClothGeometry({
      width,
      depth,
      sag: DRAPE_EDGE_SAG,
      sagReach: EDGE_REACH,
      // Only the sheet's outer edges hang free. Edges bordering the window
      // rest on the patient.
      sagEdges: {
        minusX: x0 <= OUTER.x0 + EPSILON,
        plusX: x1 >= OUTER.x1 - EPSILON,
        minusZ: z0 <= OUTER.z0 + EPSILON,
        plusZ: z1 >= OUTER.z1 - EPSILON,
      },
      foldAmplitude: 0.0035,
      foldFrequency: 16,
      origin: [centreX, centreZ],
      uvDensity: UV_DENSITY,
    });
    const panel = new THREE.Mesh(geometry, materials.drape);
    panel.position.set(centreX, y, centreZ);
    panel.receiveShadow = true;
    panel.castShadow = true;
    group.add(panel);
  }

  // Skirts hang from where the top sheet finishes falling. Heights are per side
  // because on the arm board side a full-length skirt would hang straight
  // through the patient's arm where it leaves the trunk.
  const skirtTop = y - DRAPE_EDGE_SAG;
  for (const [x, height, side] of [
    [OUTER.x0, skirts.minusX, -1],
    [OUTER.x1, skirts.plusX, 1],
  ] as const) {
    if (height <= 0) continue;
    // Built flat then stood up with a quarter turn about z. That maps the
    // plane's local x onto world y, so the bottom of the skirt is local -x on
    // the left side and local +x on the right, and that is the edge whose
    // folds should be deepest.
    const geometry = createClothGeometry({
      width: height,
      depth: OUTER.z1 - OUTER.z0,
      sagEdges: side < 0 ? { minusX: true } : { plusX: true },
      sagReach: height,
      foldAmplitude: 0.009,
      foldFrequency: 22,
      seed: 7 + side,
      uvDensity: UV_DENSITY,
    });
    const skirt = new THREE.Mesh(geometry, materials.drapeDark);
    skirt.rotation.z = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    skirt.position.set(x, skirtTop - height / 2, (OUTER.z0 + OUTER.z1) / 2);
    skirt.receiveShadow = true;
    group.add(skirt);
  }
}

/**
 * The arm board drape, with a window around the laceration.
 *
 * Either side of the window along the limb, the drape is a half-sleeve wrapped
 * over the forearm. In front and behind, it lies flat on the board and rises
 * steeply where it meets the limb, which is the profile real fabric takes when
 * it is laid over an arm.
 */
export function addArmBoardDrape(group: THREE.Group, materials: Materials): void {
  // Sleeves over the limb either side of the window (window spans x -0.50 to
  // -0.34). A cylinder is built around +y; a quarter turn about z lays its axis
  // along x and turns the theta range 0..PI into the upper half.
  const sleeveRadius = 0.049;
  const sleeveLength = 0.075;
  for (const cx of [-0.5375, -0.3025]) {
    const geometry = new THREE.CylinderGeometry(
      sleeveRadius,
      sleeveRadius,
      sleeveLength,
      20,
      1,
      true,
      0,
      Math.PI,
    );
    scaleUvs(geometry, Math.PI * sleeveRadius * UV_DENSITY, sleeveLength * UV_DENSITY);
    const sleeve = new THREE.Mesh(geometry, materials.drape);
    sleeve.rotation.z = Math.PI / 2;
    sleeve.position.set(cx, FOREARM_AXIS_Y, 0);
    sleeve.receiveShadow = true;
    group.add(sleeve);
  }

  // Board panels: lying on the board, lifted toward the limb with a negative
  // sag on their inner edge. The edge is tucked against the side of the
  // forearm at about its mid-height rather than pulled up to the crown: pulled
  // to the crown it tents into a wall, and over the hand, where the limb is
  // lower, it floats in mid air. Tucked, the limb's upper curve stays visible.
  const boardY = TABLE_TOP_Y + 0.006;
  const depth = 0.13;
  for (const side of [1, -1]) {
    const geometry = createClothGeometry({
      width: 0.4,
      depth,
      sag: -(LIMB_SIDE_Y - boardY),
      sagEdges: side > 0 ? { minusZ: true } : { plusZ: true },
      sagReach: 0.05,
      foldAmplitude: 0.003,
      foldFrequency: 20,
      seed: 3 + side,
      origin: [-0.42, side * (0.05 + depth / 2)],
      uvDensity: UV_DENSITY,
    });
    const panel = new THREE.Mesh(geometry, materials.drape);
    panel.position.set(-0.42, boardY, side * (0.05 + depth / 2));
    panel.receiveShadow = true;
    group.add(panel);
  }
}
