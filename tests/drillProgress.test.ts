import { describe, expect, it } from 'vitest';
import {
  emptyProgress,
  loadDrillProgress,
  recordDrillResult,
  saveDrillProgress,
} from '../src/store/drillProgress';

/** An in-memory Storage, so these run in plain Node without jsdom. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const KEY = 'surgical-trainer.drill.v1';

describe('drill progress', () => {
  it('starts empty with no storage or nothing stored', () => {
    expect(loadDrillProgress(null)).toEqual(emptyProgress());
    expect(loadDrillProgress(memoryStorage())).toEqual(emptyProgress());
  });

  it('keeps the best score, the latest score and a running count of misses', () => {
    let progress = recordDrillResult(emptyProgress(), { correct: 8, total: 10, percent: 80, missed: ['a', 'b'] });
    progress = recordDrillResult(progress, { correct: 6, total: 10, percent: 60, missed: ['a'] });
    expect(progress).toEqual({ attempts: 2, bestPercent: 80, lastPercent: 60, misses: { a: 2, b: 1 } });
  });

  it('survives a round trip through storage', () => {
    const storage = memoryStorage();
    const progress = recordDrillResult(emptyProgress(), { correct: 9, total: 10, percent: 90, missed: ['x'] });
    saveDrillProgress(storage, progress);
    expect(loadDrillProgress(storage)).toEqual(progress);
  });

  it('drops anything malformed rather than trusting it', () => {
    expect(loadDrillProgress(memoryStorage({ [KEY]: 'not json' }))).toEqual(emptyProgress());
    const tampered = memoryStorage({
      [KEY]: JSON.stringify({ attempts: -3, bestPercent: 250, lastPercent: 'x', misses: { a: 2, b: -1, c: 'n' } }),
    });
    expect(loadDrillProgress(tampered)).toEqual({ attempts: 0, bestPercent: 100, lastPercent: null, misses: { a: 2 } });
  });

  it('survives storage that throws', () => {
    const blocked = memoryStorage();
    blocked.getItem = () => {
      throw new Error('blocked');
    };
    blocked.setItem = () => {
      throw new Error('blocked');
    };
    expect(loadDrillProgress(blocked)).toEqual(emptyProgress());
    expect(() => saveDrillProgress(blocked, emptyProgress())).not.toThrow();
  });
});
