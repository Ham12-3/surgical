import type { PadDimensions, TissueLayer } from './types';

/**
 * The path one bite takes through the pad, worked out in the cross-section
 * square to the wound (see types.ts for its axes).
 *
 * The needle is a rigid arc of radius r, turned about its own centre as the
 * wrist rotates, so its tip follows a circle. Going in at angle a to the skin
 * (measured on the wound side, 90 is square), the circle's centre lies r from
 * the entry point, square to the needle's path: on the skin when a = 90,
 * above it when the needle leans toward the wound, below it when it leans
 * away. By symmetry the tip comes back up where the circle meets the skin
 * again, 2 r sin(a) further on, and its deepest point is r (1 - cos a) down.
 *
 * So the entry distance and the angle together decide the depth and where
 * the needle comes out, as they do with a real curved needle. Regrasping the
 * needle part-way through is not modelled (DECISIONS.md).
 */

/** What the player chose for one bite. */
export interface BitePlan {
  /** How far from the near wound edge the needle goes in, mm. */
  readonly entryMm: number;
  /** Between the needle's path and the skin as it goes in, on the wound side: 90 is square. */
  readonly angleDeg: number;
}

export interface BitePath {
  /** Where the needle goes in, across the wound from its midline (negative: the near side). */
  readonly entryX: number;
  readonly centreX: number;
  /** Negative when the circle's centre is above the skin. */
  readonly centreDepth: number;
  readonly radius: number;
  /** How far the needle turns between going in and coming out, degrees. */
  readonly sweepDeg: number;
  /** The deepest point below the skin. */
  readonly depthMm: number;
  readonly deepestLayer: TissueLayer;
  /**
   * How far from the far edge the needle comes out. Zero or less means it
   * came back up inside the wound and never caught the far edge.
   */
  readonly exitMm: number;
}

/** The layer at a depth below the skin. */
export function layerAt(depthMm: number, pad: PadDimensions): TissueLayer {
  if (depthMm <= pad.skinMm) return 'skin';
  if (depthMm <= pad.skinMm + pad.fatMm) return 'fat';
  if (depthMm <= pad.skinMm + pad.fatMm + pad.fasciaMm) return 'fascia';
  return 'base';
}

export function planBite(plan: BitePlan, pad: PadDimensions, radius: number): BitePath {
  const a = (plan.angleDeg * Math.PI) / 180;
  const halfGap = pad.woundGapMm / 2;
  const entryX = -(halfGap + plan.entryMm);
  const depthMm = radius * (1 - Math.cos(a));
  return {
    entryX,
    centreX: entryX + radius * Math.sin(a),
    centreDepth: -radius * Math.cos(a),
    radius,
    sweepDeg: 2 * plan.angleDeg,
    depthMm,
    deepestLayer: layerAt(depthMm, pad),
    exitMm: entryX + 2 * radius * Math.sin(a) - halfGap,
  };
}

/**
 * The tip's position `t` of the way through a bite, from going in (0) to
 * coming out (1). On the circle it starts at angle 90 + a from the +x axis
 * (depth measured downward) and turns back through 90, its deepest point, to
 * 90 - a.
 */
export function bitePoint(path: BitePath, t: number): { x: number; depth: number } {
  const half = (path.sweepDeg * Math.PI) / 360;
  const phi = Math.PI / 2 + half - 2 * half * t;
  return {
    x: path.centreX + path.radius * Math.cos(phi),
    depth: path.centreDepth + path.radius * Math.sin(phi),
  };
}
