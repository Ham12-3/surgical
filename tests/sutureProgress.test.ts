import { describe, expect, it } from 'vitest';
import {
  emptySutureProgress,
  loadSutureProgress,
  recordSutureResult,
  saveSutureProgress,
} from '../src/store/sutureProgress';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('suture progress', () => {
  it('starts empty with no storage, or with nothing stored', () => {
    expect(loadSutureProgress(null)).toEqual(emptySutureProgress());
    expect(loadSutureProgress(memoryStorage())).toEqual(emptySutureProgress());
  });

  it('keeps the best score and the latest', () => {
    const once = recordSutureResult(emptySutureProgress(), 72);
    const twice = recordSutureResult(once, 64);
    expect(twice).toEqual({ attempts: 2, bestScore: 72, lastScore: 64 });
  });

  it('survives a save and a load', () => {
    const storage = memoryStorage();
    saveSutureProgress(storage, { attempts: 3, bestScore: 88, lastScore: 81 });
    expect(loadSutureProgress(storage)).toEqual({ attempts: 3, bestScore: 88, lastScore: 81 });
  });

  it('treats unreadable or out-of-range values as missing', () => {
    const storage = memoryStorage();
    storage.setItem('surgical-trainer.suture-pad.v1', '{"attempts":-1,"bestScore":140,"lastScore":"x"}');
    expect(loadSutureProgress(storage)).toEqual(emptySutureProgress());
    storage.setItem('surgical-trainer.suture-pad.v1', 'not json');
    expect(loadSutureProgress(storage)).toEqual(emptySutureProgress());
  });
});
