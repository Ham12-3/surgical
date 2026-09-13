import { describe, expect, it } from 'vitest';
import { buildReport } from '../src/engine/procedure/report';
import { ProcedureRun } from '../src/engine/procedure/run';
import { RESTING_VITALS } from '../src/engine/procedure/vitals';
import {
  attemptFromReport,
  emptyProfile,
  isModeUnlocked,
  levelForXp,
  levelProgress,
  rankForLevel,
  RECENT_LIMIT,
  recordActivity,
  xpFor,
  xpForLevel,
  type ProcedureAttempt,
} from '../src/engine/progression';
import { goodClamp, goodIncision, testProcedure } from './fixtures/procedure';

const NOW = new Date('2026-09-13T10:00:00Z');

function attempt(overrides: Partial<ProcedureAttempt> = {}): ProcedureAttempt {
  return {
    procedureId: 'test_procedure',
    mode: 'practice',
    score: 80,
    passed: true,
    seconds: 300,
    hintsUsed: 0,
    protectedHits: 0,
    finishedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe('levels and ranks', () => {
  it('asks a hundred more experience for each level than the one before', () => {
    expect([1, 2, 3, 4, 5].map((level) => xpForLevel(level))).toEqual([0, 100, 300, 600, 1000]);
    expect([0, 99, 100, 299, 300, 999, 1000].map(levelForXp)).toEqual([1, 1, 2, 2, 3, 4, 5]);
  });

  it('never goes below level 1 for a bad total', () => {
    expect(levelForXp(-50)).toBe(1);
    expect(levelForXp(Number.NaN)).toBe(1);
  });

  it('names the rank a level has reached', () => {
    expect([1, 2, 3, 5, 6, 9, 10, 14, 15, 40].map(rankForLevel)).toEqual([
      'Medical Student',
      'Medical Student',
      'Foundation Doctor',
      'Foundation Doctor',
      'Core Trainee',
      'Core Trainee',
      'Registrar',
      'Registrar',
      'Consultant',
      'Consultant',
    ]);
  });

  it('says how far through its level a total is', () => {
    expect(levelProgress(200)).toMatchObject({ level: 2, rank: 'Medical Student', levelStartXp: 100, nextLevelXp: 300, fraction: 0.5 });
  });
});

describe('experience', () => {
  it('awards a procedure run by its mode, whether it passed, and its mark', () => {
    expect(xpFor({ kind: 'procedure', attempt: attempt({ mode: 'learn', score: 100 }) })).toBe(50);
    expect(xpFor({ kind: 'procedure', attempt: attempt({ mode: 'practice', score: 80 }) })).toBe(115);
    expect(xpFor({ kind: 'procedure', attempt: attempt({ mode: 'assessment', score: 60, passed: false }) })).toBe(110);
    expect(xpFor({ kind: 'procedure', attempt: attempt({ mode: 'assessment', score: 100 }) })).toBe(200);
  });

  it('awards the drills by their result', () => {
    expect(xpFor({ kind: 'drill', percent: 100 })).toBe(30);
    expect(xpFor({ kind: 'suture', score: 90 })).toBe(47);
  });

  it('holds a score outside 0 to 100 to that range', () => {
    expect(xpFor({ kind: 'drill', percent: 400 })).toBe(30);
    expect(xpFor({ kind: 'drill', percent: -5 })).toBe(10);
    expect(xpFor({ kind: 'suture', score: Number.NaN })).toBe(20);
  });
});

describe('recordActivity', () => {
  it('counts a procedure run and keeps the best mark and any pass', () => {
    let profile = emptyProfile();
    profile = recordActivity(profile, { kind: 'procedure', attempt: attempt({ score: 90 }) }, NOW).profile;
    profile = recordActivity(profile, { kind: 'procedure', attempt: attempt({ score: 40, passed: false }) }, NOW).profile;
    expect(profile.procedures['test_procedure']?.practice).toEqual({ runs: 2, best: 90, passed: true });
    expect(profile.procedures['test_procedure']?.assessment).toEqual({ runs: 0, best: 0, passed: false });
  });

  it('counts the drills and keeps their best', () => {
    let profile = emptyProfile();
    profile = recordActivity(profile, { kind: 'drill', percent: 70 }, NOW).profile;
    profile = recordActivity(profile, { kind: 'drill', percent: 50 }, NOW).profile;
    profile = recordActivity(profile, { kind: 'suture', score: 65 }, NOW).profile;
    expect(profile.drill).toEqual({ runs: 2, best: 70 });
    expect(profile.suture).toEqual({ runs: 1, best: 65 });
  });

  it('keeps only the latest runs, newest first', () => {
    let profile = emptyProfile();
    for (let i = 0; i < RECENT_LIMIT + 3; i += 1) {
      profile = recordActivity(profile, { kind: 'procedure', attempt: attempt({ seconds: i }) }, NOW).profile;
    }
    expect(profile.recent).toHaveLength(RECENT_LIMIT);
    expect(profile.recent[0]?.seconds).toBe(RECENT_LIMIT + 2);
  });

  it('reports the experience gained and the level before and after', () => {
    const start = { ...emptyProfile(), xp: 90 };
    const { profile, reward } = recordActivity(start, { kind: 'procedure', attempt: attempt({ score: 80 }) }, NOW);
    expect(profile.xp).toBe(205);
    expect(reward).toMatchObject({ xpGained: 115, before: { level: 1 }, after: { level: 2 } });
  });

  it('leaves the profile it was given unchanged', () => {
    const start = emptyProfile();
    recordActivity(start, { kind: 'procedure', attempt: attempt() }, NOW);
    expect(start).toEqual(emptyProfile());
  });
});

describe('attemptFromReport', () => {
  it('takes the mark, the hints and the structures touched from the report', () => {
    const run = new ProcedureRun(testProcedure, 'practice');
    run.nextHint();
    run.perform({ ...goodIncision, zoneId: 'artery', avoid: true });
    run.perform(goodIncision);
    run.perform(goodClamp);
    const report = buildReport(testProcedure, 'practice', run.results(), RESTING_VITALS, 125.4);
    expect(attemptFromReport(report, NOW)).toEqual({
      procedureId: 'test_procedure',
      mode: 'practice',
      score: report.score,
      passed: report.passed,
      seconds: 125,
      hintsUsed: 1,
      protectedHits: 1,
      finishedAt: '2026-09-13T10:00:00.000Z',
    });
  });
});

describe('isModeUnlocked', () => {
  it('opens Assessment once the procedure is finished in Learn or Practice', () => {
    const fresh = emptyProfile();
    expect(isModeUnlocked(fresh, 'test_procedure', 'learn')).toBe(true);
    expect(isModeUnlocked(fresh, 'test_procedure', 'practice')).toBe(true);
    expect(isModeUnlocked(fresh, 'test_procedure', 'assessment')).toBe(false);
    const learnt = recordActivity(fresh, { kind: 'procedure', attempt: attempt({ mode: 'learn' }) }, NOW).profile;
    expect(isModeUnlocked(learnt, 'test_procedure', 'assessment')).toBe(true);
    expect(isModeUnlocked(learnt, 'another_procedure', 'assessment')).toBe(false);
  });
});
