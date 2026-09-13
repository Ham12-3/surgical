import { describe, expect, it } from 'vitest';
import { emptyProfile, recordActivity } from '../src/engine/progression';
import { clearProfile, loadProfile, saveProfile } from '../src/store/profile';
import { blockedStorage, memoryStorage } from './fixtures/storage';

const KEY = 'surgical-trainer.profile.v1';
const NOW = new Date('2026-09-13T10:00:00Z');

describe('profile store', () => {
  it('starts empty with no storage, or nothing stored', () => {
    expect(loadProfile(null)).toEqual(emptyProfile());
    expect(loadProfile(memoryStorage())).toEqual(emptyProfile());
  });

  it('keeps a profile between visits', () => {
    const storage = memoryStorage();
    let profile = recordActivity(emptyProfile(), { kind: 'drill', percent: 100 }, NOW).profile;
    profile = recordActivity(
      profile,
      {
        kind: 'procedure',
        attempt: {
          procedureId: 'open_appendectomy',
          mode: 'learn',
          score: 100,
          passed: true,
          seconds: 400,
          hintsUsed: 3,
          protectedHits: 0,
          finishedAt: NOW.toISOString(),
        },
      },
      NOW,
    ).profile;
    saveProfile(storage, profile);
    expect(loadProfile(storage)).toEqual(profile);
  });

  it('falls back field by field for anything it cannot read', () => {
    const stored = {
      xp: -4,
      drill: { runs: 2, best: 250 },
      suture: 'lots',
      procedures: { open_appendectomy: { learn: { runs: 1, best: 100, passed: 'yes' } } },
      badges: { first_case: NOW.toISOString(), made_up: NOW.toISOString(), flawless: 7 },
      recent: [{ procedureId: 'open_appendectomy', mode: 'surgery', finishedAt: 'x' }, 'nonsense'],
    };
    const profile = loadProfile(memoryStorage({ [KEY]: JSON.stringify(stored) }));
    expect(profile.xp).toBe(0);
    expect(profile.drill).toEqual({ runs: 2, best: 100 });
    expect(profile.suture).toEqual({ runs: 0, best: 0 });
    expect(profile.procedures['open_appendectomy']?.learn).toEqual({ runs: 1, best: 100, passed: false });
    expect(profile.procedures['open_appendectomy']?.assessment).toEqual({ runs: 0, best: 0, passed: false });
    expect(profile.badges).toEqual({ first_case: NOW.toISOString() });
    expect(profile.recent).toEqual([]);
    expect(loadProfile(memoryStorage({ [KEY]: 'not json' }))).toEqual(emptyProfile());
  });

  it('survives storage that throws, and can be cleared', () => {
    expect(loadProfile(blockedStorage())).toEqual(emptyProfile());
    expect(() => saveProfile(blockedStorage(), emptyProfile())).not.toThrow();
    expect(() => clearProfile(blockedStorage())).not.toThrow();

    const storage = memoryStorage();
    saveProfile(storage, { ...emptyProfile(), xp: 500 });
    clearProfile(storage);
    expect(loadProfile(storage).xp).toBe(0);
  });
});
