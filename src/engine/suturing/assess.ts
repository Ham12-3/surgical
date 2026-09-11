import { SUTURE_PENALTIES } from '../scoring';
import { planBite, type BitePath, type BitePlan } from './geometry';
import { TISSUE_LAYERS, type SutureFault, type SuturePadConfig } from './types';

/**
 * Judging sutures against the pad's targets: each one on its own, then the
 * row of them for spacing and for how consistent the bites' depths are, the
 * brief's two accuracy measures for suturing.
 */

/** Everything the player did for one suture. */
export interface SutureRecord {
  /** Where along the wound the needle went in, from the wound's middle, mm. */
  readonly alongMm: number;
  readonly plan: BitePlan;
  /** Whether the drive pushed the needle off its curve (the pad screen judges this). */
  readonly offCurve: boolean;
  /** Knot throws that landed inside the marker's window. */
  readonly knotHits: number;
}

export interface SutureAssessment {
  readonly record: SutureRecord;
  readonly path: BitePath;
  /** In the order worth telling the player. */
  readonly faults: readonly SutureFault[];
  /** 0 to 100. */
  readonly score: number;
}

export interface SeriesAssessment {
  readonly sutures: readonly SutureAssessment[];
  /** Gaps between neighbouring sutures, in order along the wound, mm. */
  readonly spacingsMm: readonly number[];
  /** Deepest bite less shallowest, among those that caught both edges. */
  readonly depthSpreadMm: number;
  /** Faults of the row as a whole, on top of each suture's own. */
  readonly faults: readonly SutureFault[];
  /** 0 to 100: the sutures' mean, less the row's faults. */
  readonly score: number;
}

function penalty(faults: readonly SutureFault[]): number {
  return faults.reduce((sum, fault) => sum + SUTURE_PENALTIES[fault], 0);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function assessSuture(record: SutureRecord, config: SuturePadConfig): SutureAssessment {
  const { pad, targets } = config;
  const { plan } = record;
  const path = planBite(plan, pad, config.needleRadiusMm);
  const faults: SutureFault[] = [];

  if (Math.abs(record.alongMm) > pad.woundLengthMm / 2) faults.push('outside_wound');
  const caught = path.exitMm > 0;
  if (!caught) faults.push('missed_far_side');

  const reached = TISSUE_LAYERS.indexOf(path.deepestLayer);
  const wanted = TISSUE_LAYERS.indexOf(targets.depthLayer);
  if (reached < wanted) faults.push('too_shallow');
  if (reached > wanted) faults.push('too_deep');

  if (plan.angleDeg < targets.entryAngleDeg.min) faults.push('angle_toward');
  if (plan.angleDeg > targets.entryAngleDeg.max) faults.push('angle_away');
  if (plan.entryMm < targets.biteMm.min) faults.push('bite_narrow');
  if (plan.entryMm > targets.biteMm.max) faults.push('bite_wide');
  if (caught && Math.abs(plan.entryMm - path.exitMm) > targets.symmetryMm) faults.push('asymmetric');

  if (record.offCurve) faults.push('off_curve');
  if (record.knotHits < config.knot.throws) faults.push('knot_loose');

  return { record, path, faults, score: clampScore(100 - penalty(faults)) };
}

export function assessSeries(records: readonly SutureRecord[], config: SuturePadConfig): SeriesAssessment {
  const sutures = records.map((record) => assessSuture(record, config));
  const along = records.map((record) => record.alongMm).sort((a, b) => a - b);
  const spacingsMm = along.slice(1).map((value, index) => value - (along[index] ?? value));
  const { spacingMm, spacingSpreadMm, depthSpreadMm } = config.targets;

  const faults: SutureFault[] = [];
  if (spacingsMm.some((gap) => gap < spacingMm.min)) faults.push('spacing_tight');
  if (spacingsMm.some((gap) => gap > spacingMm.max)) faults.push('spacing_wide');
  if (spacingsMm.length > 1 && Math.max(...spacingsMm) - Math.min(...spacingsMm) > spacingSpreadMm) {
    faults.push('spacing_uneven');
  }

  const depths = sutures.filter((suture) => suture.path.exitMm > 0).map((suture) => suture.path.depthMm);
  const spread = depths.length > 1 ? Math.max(...depths) - Math.min(...depths) : 0;
  if (spread > depthSpreadMm) faults.push('depth_uneven');

  const mean = sutures.length === 0 ? 0 : sutures.reduce((sum, suture) => sum + suture.score, 0) / sutures.length;
  return { sutures, spacingsMm, depthSpreadMm: spread, faults, score: clampScore(mean - penalty(faults)) };
}
