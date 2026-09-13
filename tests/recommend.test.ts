import { describe, expect, it } from 'vitest';
import { emptyProfile, recordActivity, type Activity, type Profile } from '../src/engine/progression';
import { recommendNext } from '../src/engine/recommend';
import type { ProcedureMode } from '../src/engine/procedure/types';

const NOW = new Date('2026-09-13T10:00:00Z');
const IDS = ['open_appendectomy'];

function finish(mode: ProcedureMode, score: number, passed = true): Activity {
  return {
    kind: 'procedure',
    attempt: {
      procedureId: 'open_appendectomy',
      mode,
      score,
      passed,
      seconds: 600,
      hintsUsed: 0,
      protectedHits: 0,
      finishedAt: NOW.toISOString(),
    },
  };
}

function after(...activities: Activity[]): Profile {
  return activities.reduce((profile, activity) => recordActivity(profile, activity, NOW).profile, emptyProfile());
}

describe('recommendNext', () => {
  it('starts with the instruments, then suturing', () => {
    expect(recommendNext(emptyProfile(), IDS).kind).toBe('drill');
    expect(recommendNext(after({ kind: 'drill', percent: 40 }), IDS).kind).toBe('suture');
  });

  it('then works through each procedure in Learn, Practice and Assessment', () => {
    const skills: Activity[] = [
      { kind: 'drill', percent: 90 },
      { kind: 'suture', score: 85 },
    ];
    expect(recommendNext(after(...skills), IDS)).toMatchObject({ kind: 'procedure', mode: 'learn' });
    expect(recommendNext(after(...skills, finish('learn', 100)), IDS)).toMatchObject({ mode: 'practice' });
    // A failed Practice run is not a pass, so Practice is still next.
    expect(recommendNext(after(...skills, finish('learn', 100), finish('practice', 40, false)), IDS)).toMatchObject({
      mode: 'practice',
    });
    expect(recommendNext(after(...skills, finish('learn', 100), finish('practice', 70)), IDS)).toMatchObject({
      mode: 'assessment',
    });
  });

  it('once everything is passed, goes back to the lowest best mark', () => {
    const passedAll = [finish('learn', 100), finish('practice', 90), finish('assessment', 82)];
    const weakSuturing = after({ kind: 'drill', percent: 90 }, { kind: 'suture', score: 55 }, ...passedAll);
    expect(recommendNext(weakSuturing, IDS)).toMatchObject({ kind: 'suture' });
    expect(recommendNext(weakSuturing, IDS).reason).toMatch(/55/);

    const strong = after({ kind: 'drill', percent: 100 }, { kind: 'suture', score: 95 }, ...passedAll);
    expect(recommendNext(strong, IDS)).toMatchObject({ kind: 'procedure', mode: 'assessment' });
  });
});
