import * as THREE from 'three';
import type { Materials } from '../palette';
import { createClothGeometry, type ClothEdges } from '../cloth';
import type { SkinSurface } from './bodySurface';

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
 * over the sides; from the neck down past the feet, so no bare legs show
 * beyond it.
 */
const OUTER = { x0: -0.34, x1: 0.34, z0: -0.42, z1: 0.98 } as const;

/**
 * How far the top sheet falls where it leaves the table, and over what distance.
 */
export const DRAPE_EDGE_SAG = 0.07;
const EDGE_REACH = 0.16;

const UV_DENSITY = 9;
const EPSILON = 1e-6;

interface SheetOptions {
  readonly outer: Window2D;
  readonly window: Window2D | null;
  /** World y the sheet lies at where nothing holds it up. */
  readonly y: number;
  /** What holds the sheet up: the patient, and the table. */
  readonly floor: SkinSurface;
  readonly sag: number;
  readonly sagReach: number;
  readonly foldAmplitude: number;
  readonly foldFrequency: number;
  readonly seed: number;
}

/**
 * A sheet over `outer`, with a window cut out of it, resting on whatever the
 * floor puts under it. Built as up to four panels framing the window, which
 * share one fold pattern computed in world space, so the seams do not show.
 * Only the sheet's outer edges hang free; edges bordering the window rest on
 * the patient.
 */
function addWindowedSheet(group: THREE.Group, material: THREE.Material, options: SheetOptions): void {
  const { outer, window, y, floor } = options;
  const panels: Array<readonly [x0: number, x1: number, z0: number, z1: number]> = window
    ? [
        [outer.x0, outer.x1, outer.z0, window.z0],
        [outer.x0, outer.x1, window.z1, outer.z1],
        [outer.x0, window.x0, window.z0, window.z1],
        [window.x1, outer.x1, window.z0, window.z1],
      ]
    : [[outer.x0, outer.x1, outer.z0, outer.z1]];

  for (const [x0, x1, z0, z1] of panels) {
    const width = x1 - x0;
    const depth = z1 - z0;
    if (width <= 0 || depth <= 0) continue;
    const centreX = (x0 + x1) / 2;
    const centreZ = (z0 + z1) / 2;
    const sagEdges: ClothEdges = {
      minusX: x0 <= outer.x0 + EPSILON,
      plusX: x1 >= outer.x1 - EPSILON,
      minusZ: z0 <= outer.z0 + EPSILON,
      plusZ: z1 >= outer.z1 - EPSILON,
    };
    const geometry = createClothGeometry({
      width,
      depth,
      sag: options.sag,
      sagReach: options.sagReach,
      sagEdges,
      foldAmplitude: options.foldAmplitude,
      foldFrequency: options.foldFrequency,
      seed: options.seed,
      origin: [centreX, centreZ],
      originY: y,
      floor: (x, z) => floor.heightAt(x, z),
      uvDensity: UV_DENSITY,
    });
    const panel = new THREE.Mesh(geometry, material);
    panel.position.set(centreX, y, centreZ);
    panel.receiveShadow = true;
    panel.castShadow = true;
    group.add(panel);
  }
}

/**
 * The trunk drape: a top sheet lying on the table and over the patient,
 * optionally with a window cut out over the operative field, plus skirts
 * hanging down each side of the table.
 */
export function addTrunkDrape(
  group: THREE.Group,
  materials: Materials,
  window: Window2D | null,
  y: number,
  floor: SkinSurface,
  skirts: SkirtHeights = { minusX: 0.34, plusX: 0.34 },
): void {
  addWindowedSheet(group, materials.drape, {
    outer: OUTER,
    window,
    y,
    floor,
    sag: DRAPE_EDGE_SAG,
    sagReach: EDGE_REACH,
    foldAmplitude: 0.0035,
    foldFrequency: 16,
    seed: 0,
  });

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
 * The arm board drape: a sheet over the board and the arm on it, with a
 * window around the laceration where there is one, its outer edges hanging
 * a little off the board.
 */
export function addArmBoardDrape(
  group: THREE.Group,
  materials: Materials,
  board: Window2D,
  window: Window2D | null,
  y: number,
  floor: SkinSurface,
): void {
  addWindowedSheet(group, materials.drape, {
    outer: board,
    window,
    y,
    floor,
    sag: 0.04,
    sagReach: 0.05,
    foldAmplitude: 0.003,
    foldFrequency: 20,
    seed: 3,
  });
}
