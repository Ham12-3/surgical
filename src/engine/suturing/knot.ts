import type { KnotSpec } from './types';

/**
 * The knot, as a timed input: a marker sweeps back and forth across a bar,
 * and each throw lands if the key goes down while the marker is inside the
 * window at the middle.
 */

/**
 * Where the marker is `ms` after it set off: -1 at the start, sweeping at a
 * steady speed to +1 by half a period and back to -1 by a whole one.
 */
export function markerPosition(ms: number, periodMs: number): number {
  const phase = (((ms % periodMs) + periodMs) % periodMs) / periodMs;
  return phase < 0.5 ? -1 + 4 * phase : 3 - 4 * phase;
}

export function isThrowHit(ms: number, spec: KnotSpec): boolean {
  return Math.abs(markerPosition(ms, spec.periodMs)) <= spec.window;
}
