import { describe, expect, it } from 'vitest';
import { BADGE_IDS, BADGES, type BadgeId } from '../src/engine/badges';
import { emptyProfile, recordActivity, type Activity, type ProcedureAttempt, type Profile } from '../src/engine/progression';

const NOW = new Date('2026-09-13T10:00:00Z');
const LATER = new Date('2026-09-14T10:00:00Z');

function procedure(overrides: Partial<ProcedureAttempt> = {}): Activity {
  return {
    kind: 'procedure',
    attempt: {
      procedureId: 'open_appendectomy',
      mode: 'practice',
      score: 70,
      passed: true,
      seconds: 600,
      hintsUsed: 2,
      protectedHits: 1,
      finishedAt: NOW.toISOString(),
      ...overrides,
    },
  };
}

function earns(activity: Activity, profile: Profile = emptyProfile()): readonly BadgeId[] {
  return recordActivity(profile, activity, NOW).reward.newBadges;
}

describe('badges', () => {
  it('defines every badge id exactly once', () => {
    expect(BADGES.map((badge) => badge.id).sort()).toEqual([...BADGE_IDS].sort());
  });

  it('awards First Case once, and remembers when', () => {
    const first = recordActivity(emptyProfile(), procedure({ mode: 'learn' }), NOW);
    expect(first.reward.newBadges).toContain('first_case');
    const second = recordActivity(first.profile, procedure({ mode: 'learn' }), LATER);
    expect(second.reward.newBadges).not.toContain('first_case');
    expect(second.profile.badges.first_case).toBe(NOW.toISOString());
  });

  it('awards Instrument Ace only for a full drill', () => {
    expect(earns({ kind: 'drill', percent: 90 })).not.toContain('instrument_ace');
    expect(earns({ kind: 'drill', percent: 100 })).toContain('instrument_ace');
  });

  it('awards Perfect Closure from 90 on the suturing pad', () => {
    expect(earns({ kind: 'suture', score: 89 })).not.toContain('perfect_closure');
    expect(earns({ kind: 'suture', score: 90 })).toContain('perfect_closure');
  });

  it('awards Steady Hands for a marked run with no structure to protect touched', () => {
    expect(earns(procedure({ mode: 'learn', protectedHits: 0 }))).not.toContain('steady_hands');
    expect(earns(procedure({ protectedHits: 1 }))).not.toContain('steady_hands');
    expect(earns(procedure({ protectedHits: 0 }))).toContain('steady_hands');
  });

  it('awards Unassisted for passing Practice without a hint', () => {
    expect(earns(procedure({ hintsUsed: 1 }))).not.toContain('unassisted');
    expect(earns(procedure({ hintsUsed: 0, passed: false }))).not.toContain('unassisted');
    expect(earns(procedure({ hintsUsed: 0 }))).toContain('unassisted');
  });

  it('awards Assessment Passed and Flawless from Assessment only', () => {
    expect(earns(procedure({ mode: 'practice', score: 100 }))).not.toContain('flawless');
    expect(earns(procedure({ mode: 'assessment', score: 70, passed: false }))).not.toContain('assessment_passed');
    const passed = earns(procedure({ mode: 'assessment', score: 85 }));
    expect(passed).toContain('assessment_passed');
    expect(passed).not.toContain('flawless');
    expect(earns(procedure({ mode: 'assessment', score: 100 }))).toContain('flawless');
  });

  it('awards Full Rotation once a procedure is finished in all three modes', () => {
    let profile = emptyProfile();
    profile = recordActivity(profile, procedure({ mode: 'learn' }), NOW).profile;
    expect(earns(procedure({ mode: 'practice' }), profile)).not.toContain('full_rotation');
    profile = recordActivity(profile, procedure({ mode: 'practice' }), NOW).profile;
    expect(earns(procedure({ mode: 'assessment', passed: false }), profile)).toContain('full_rotation');
    expect(earns(procedure({ mode: 'assessment', procedureId: 'another' }), profile)).not.toContain('full_rotation');
  });
});
