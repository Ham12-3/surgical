import type { MistakeCode } from './procedure/run';
import type { ProcedureMode } from './procedure/types';
import type { SutureFault } from './suturing/types';

/**
 * Scoring constants, all in one place (CLAUDE.md, "Scoring"): the suturing
 * pad's, and the procedure step machine's.
 */

/**
 * The modes as configuration rather than as three code paths. Learn never
 * fails anyone: mistakes are still recorded and explained, but cost nothing.
 */
export const MODE_RULES: Readonly<
  Record<
    ProcedureMode,
    {
      /** Hints can be asked for. */
      readonly hints: boolean;
      /** The tray shows instrument names. */
      readonly toolLabels: boolean;
      /** The step's target zone is highlighted in the scene. */
      readonly highlightTarget: boolean;
      /** Mistakes and hints come off the score. */
      readonly scored: boolean;
      /** Time is counted and shown. */
      readonly timed: boolean;
      readonly passMark: number;
    }
  >
> = {
  learn: { hints: true, toolLabels: true, highlightTarget: true, scored: false, timed: false, passMark: 0 },
  practice: { hints: true, toolLabels: true, highlightTarget: false, scored: true, timed: true, passMark: 60 },
  assessment: { hints: false, toolLabels: false, highlightTarget: false, scored: true, timed: true, passMark: 80 },
};

/**
 * Points off a step's 100 for each distinct mistake, counted once per step
 * however many times it is repeated: thinking aloud with the wrong instrument
 * costs once, not once a click.
 */
export const MISTAKE_PENALTIES: Readonly<Record<MistakeCode, number>> = {
  protected_structure: 40,
  wrong_place: 20,
  wrong_instrument: 15,
  wrong_action: 15,
  off_target: 10,
};

/** Points off a step for each hint asked for, where the mode scores them. */
export const HINT_PENALTY = 5;

/**
 * How the report card's headings make up the overall mark. Accuracy carries
 * most of it: doing the right thing in the right place is the point.
 */
export const REPORT_WEIGHTS = {
  accuracy: 0.6,
  tissueHandling: 0.15,
  efficiency: 0.15,
  knowledge: 0.1,
} as const;

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
