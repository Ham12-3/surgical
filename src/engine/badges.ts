import { PROCEDURE_MODES } from './procedure/types';
import type { Activity, Profile } from './progression';

/**
 * Badges: one-off marks for moments worth celebrating in the simulator.
 *
 * Each is judged when an activity finishes, against the profile as it stands
 * with that activity counted, and is awarded once. They only measure what the
 * simulator can see (marks, hints, structures touched), which is why the
 * brief's "Zero Breach", a sterile-technique badge, is not here: sterility is
 * not modelled (DECISIONS.md, D38).
 */

export const BADGE_IDS = [
  'first_case',
  'instrument_ace',
  'perfect_closure',
  'steady_hands',
  'unassisted',
  'assessment_passed',
  'flawless',
  'full_rotation',
] as const;
export type BadgeId = (typeof BADGE_IDS)[number];

export interface BadgeDefinition {
  readonly id: BadgeId;
  readonly title: string;
  readonly description: string;
  readonly earned: (profile: Profile, activity: Activity) => boolean;
}

/** The suturing pad score that earns Perfect Closure. */
export const PERFECT_CLOSURE_SCORE = 90;

export const BADGES: readonly BadgeDefinition[] = [
  {
    id: 'first_case',
    title: 'First Case',
    description: 'Finish a procedure in any mode.',
    earned: (_profile, activity) => activity.kind === 'procedure',
  },
  {
    id: 'instrument_ace',
    title: 'Instrument Ace',
    description: 'Name every instrument in an identification drill.',
    earned: (_profile, activity) => activity.kind === 'drill' && activity.percent >= 100,
  },
  {
    id: 'perfect_closure',
    title: 'Perfect Closure',
    description: `Score ${PERFECT_CLOSURE_SCORE} or more on the suturing pad.`,
    earned: (_profile, activity) => activity.kind === 'suture' && activity.score >= PERFECT_CLOSURE_SCORE,
  },
  {
    id: 'steady_hands',
    title: 'Steady Hands',
    description: 'Finish a Practice or Assessment run without touching a structure to protect.',
    earned: (_profile, activity) =>
      activity.kind === 'procedure' && activity.attempt.mode !== 'learn' && activity.attempt.protectedHits === 0,
  },
  {
    id: 'unassisted',
    title: 'Unassisted',
    description: 'Pass Practice without asking for a hint.',
    earned: (_profile, activity) =>
      activity.kind === 'procedure' &&
      activity.attempt.mode === 'practice' &&
      activity.attempt.passed &&
      activity.attempt.hintsUsed === 0,
  },
  {
    id: 'assessment_passed',
    title: 'Assessment Passed',
    description: 'Pass a procedure in Assessment.',
    earned: (_profile, activity) =>
      activity.kind === 'procedure' && activity.attempt.mode === 'assessment' && activity.attempt.passed,
  },
  {
    id: 'flawless',
    title: 'Flawless',
    description: 'Score 100 in Assessment.',
    earned: (_profile, activity) =>
      activity.kind === 'procedure' && activity.attempt.mode === 'assessment' && activity.attempt.score >= 100,
  },
  {
    id: 'full_rotation',
    title: 'Full Rotation',
    description: 'Finish one procedure in Learn, Practice and Assessment.',
    earned: (profile, activity) => {
      if (activity.kind !== 'procedure') return false;
      const record = profile.procedures[activity.attempt.procedureId];
      return record !== undefined && PROCEDURE_MODES.every((mode) => record[mode].runs > 0);
    },
  },
];

export function badgeById(id: BadgeId): BadgeDefinition | undefined {
  return BADGES.find((badge) => badge.id === id);
}
