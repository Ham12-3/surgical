import * as THREE from 'three';

/**
 * Draped cloth as displaced, subdivided planes.
 *
 * A drape is not a slab. It lies flat where it is supported and falls away
 * where it is not, with soft folds that are deepest where it hangs. This
 * builds that shape directly: a subdivided plane in XZ whose vertices drop
 * toward the unsupported edges, plus low-frequency folds weighted toward those
 * same edges. No physics simulation — the shape is static, so it is computed
 * once at build time.
 */

export interface ClothEdges {
  minusX?: boolean;
  plusX?: boolean;
  minusZ?: boolean;
  plusZ?: boolean;
}

export interface ClothOptions {
  width: number;
  depth: number;
  /**
   * Vertical drop at a fully hanging edge, in metres. Negative raises the edge
   * instead, for cloth lying flat that rises up over something it meets.
   */
  sag?: number;
  /** Which edges hang free. Unlisted edges stay level. */
  sagEdges?: ClothEdges;
  /** Distance in metres from a hanging edge over which the cloth falls. */
  sagReach?: number;
  /** Fold height in metres. */
  foldAmplitude?: number;
  /** Folds per metre. */
  foldFrequency?: number;
  /** Shifts the fold pattern, so separate sheets do not match exactly. */
  seed?: number;
  /**
   * World (x, z) of the panel centre. Folds and weave are computed in world
   * space, so panels cut from the same sheet line up at their seams.
   */
  origin?: readonly [x: number, z: number];
  /** Texture repeats per metre, so weave density matches across panels. */
  uvDensity?: number;
  segments?: number;
  /**
   * What the cloth lies over: the height of the body or the table under
   * world (x, z), or null where there is nothing. Where it is higher than
   * the cloth would hang, the cloth rests on it, `floorClearance` above.
   */
  floor?: (x: number, z: number) => number | null;
  floorClearance?: number;
  /** World y the panel is placed at, which `floor` heights are measured against. */
  originY?: number;
}

const smoothstep = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

export function createClothGeometry(options: ClothOptions): THREE.BufferGeometry {
  const {
    width,
    depth,
    sag = 0,
    sagEdges = {},
    sagReach = 0.15,
    foldAmplitude = 0.004,
    foldFrequency = 14,
    seed = 0,
    origin = [0, 0],
    uvDensity = 9,
    floor,
    floorClearance = 0.008,
    originY = 0,
  } = options;

  // Enough subdivision for smooth folds, scaled with panel size so a small
  // panel does not waste vertices and a large one does not facet.
  const longest = Math.max(width, depth);
  const segments = options.segments ?? Math.max(8, Math.round(longest * 60));
  const segX = Math.max(2, Math.round((segments * width) / longest));
  const segZ = Math.max(2, Math.round((segments * depth) / longest));

  const geometry = new THREE.PlaneGeometry(width, depth, segX, segZ);
  // PlaneGeometry is built in XY facing +z; lay it flat facing up.
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const halfW = width / 2;
  const halfD = depth / 2;
  const [originX, originZ] = origin;
  const phase = seed * 1.7;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);

    // How close this vertex is to each hanging edge: 1 at the edge, 0 once it
    // is further than `sagReach` away.
    const near = (distance: number): number => smoothstep(1 - distance / sagReach);
    let hang = 0;
    if (sagEdges.minusX) hang = Math.max(hang, near(x + halfW));
    if (sagEdges.plusX) hang = Math.max(hang, near(halfW - x));
    if (sagEdges.minusZ) hang = Math.max(hang, near(z + halfD));
    if (sagEdges.plusZ) hang = Math.max(hang, near(halfD - z));

    // Squared, so the fall starts gently and steepens toward the edge — the
    // way unsupported fabric curves over whatever is holding it up.
    const drop = sag * hang * hang;

    // Folds: two crossed sine waves at slightly different angles, in world
    // coordinates, with amplitude growing where the cloth hangs. A small
    // floor keeps a hint of texture even where it lies flat.
    const wx = x + originX;
    const wz = z + originZ;
    const fold =
      Math.sin(wx * foldFrequency + phase + Math.sin(wz * foldFrequency * 0.4) * 0.8) * 0.6 +
      Math.sin(wz * foldFrequency * 0.7 - phase * 0.6 + wx * 3) * 0.4;
    const foldHeight = fold * foldAmplitude * (0.2 + hang * 0.8);

    // Whatever is under the cloth holds it up: a body lifts the sheet over
    // itself, and the sheet lies on the table beside it.
    let y = -drop + foldHeight;
    const under = floor?.(wx, wz) ?? null;
    if (under !== null) y = Math.max(y, under + floorClearance - originY + Math.abs(foldHeight) * 0.5);
    position.setY(i, y);
    uv.setXY(i, wx * uvDensity, wz * uvDensity);
  }

  position.needsUpdate = true;
  uv.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
