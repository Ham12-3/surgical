/**
 * Types for the suturing practice pad (src/data/drills/suturePad.json).
 *
 * Distances are millimetres throughout the engine; the scene converts to
 * metres. The cross-section a bite is worked out in runs square to the wound:
 * x across it from its midline (+x is the far side) and depth below the skin.
 */

export const TISSUE_LAYERS = ['skin', 'fat', 'fascia', 'base'] as const;
export type TissueLayer = (typeof TISSUE_LAYERS)[number];

/** What can go wrong with one suture, or with the row of them. */
export const SUTURE_FAULTS = [
  'outside_wound',
  'missed_far_side',
  'too_shallow',
  'too_deep',
  'angle_toward',
  'angle_away',
  'bite_narrow',
  'bite_wide',
  'asymmetric',
  'off_curve',
  'knot_loose',
  'spacing_tight',
  'spacing_wide',
  'spacing_uneven',
  'depth_uneven',
] as const;
export type SutureFault = (typeof SUTURE_FAULTS)[number];

export interface Range {
  readonly min: number;
  readonly max: number;
}

export interface PadDimensions {
  /** Across the wound. */
  readonly widthMm: number;
  /** Along the wound. */
  readonly lengthMm: number;
  readonly skinMm: number;
  readonly fatMm: number;
  readonly fasciaMm: number;
  /** The pad's backing, under the fascia. */
  readonly baseMm: number;
  readonly woundLengthMm: number;
  /** How far apart the two edges of the wound sit. */
  readonly woundGapMm: number;
  readonly woundDepthMm: number;
}

export interface SutureTargets {
  /** Between the needle's path and the skin as it goes in, on the wound side: 90 is square. */
  readonly entryAngleDeg: Range;
  /** How far from the near edge the needle goes in. */
  readonly biteMm: Range;
  /** Most the exit may differ from the entry in its distance from the edge. */
  readonly symmetryMm: number;
  /** The layer the deepest point of a bite should reach. */
  readonly depthLayer: TissueLayer;
  /** Gap between neighbouring sutures along the wound. */
  readonly spacingMm: Range;
  /** Most the gaps may differ from one another. */
  readonly spacingSpreadMm: number;
  /** Most the bites' depths may differ from one another. */
  readonly depthSpreadMm: number;
}

export interface KnotSpec {
  readonly throws: number;
  /** One full sweep of the marker, there and back. */
  readonly periodMs: number;
  /** Half-width of the target at the middle, as a fraction of the marker's half-travel. */
  readonly window: number;
}

export interface SuturePadConfig {
  readonly version: number;
  readonly id: string;
  readonly title: string;
  /** False until a qualified clinician has checked it (CLAUDE.md, non-negotiable 2). */
  readonly reviewed: boolean;
  readonly references: readonly string[];
  /** What a clinician still has to confirm. */
  readonly todo: readonly string[];
  readonly pad: PadDimensions;
  readonly needleRadiusMm: number;
  readonly sutureCount: number;
  readonly targets: SutureTargets;
  readonly knot: KnotSpec;
  readonly feedback: Readonly<Record<SutureFault, string>>;
}
