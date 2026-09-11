import type { SutureFault } from './suturing/types';

/**
 * Scoring constants, all in one place (CLAUDE.md, "Scoring"). The suturing
 * pad's are here from Phase 3; the procedure step machine's join them in
 * Phase 4.
 */

/**
 * Points off a suture's 100 for each fault, or off the row's mean for the
 * row's own faults (spacing and depth consistency). A bite that misses the far
 * edge, or sits beside no wound, cannot count as a suture at all.
 */
export const SUTURE_PENALTIES: Readonly<Record<SutureFault, number>> = {
  outside_wound: 100,
  missed_far_side: 60,
  too_shallow: 25,
  too_deep: 25,
  angle_toward: 10,
  angle_away: 10,
  bite_narrow: 10,
  bite_wide: 10,
  asymmetric: 15,
  off_curve: 10,
  knot_loose: 10,
  spacing_tight: 10,
  spacing_wide: 10,
  spacing_uneven: 10,
  depth_uneven: 10,
};
