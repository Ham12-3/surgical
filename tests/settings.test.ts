import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../src/store/settings';

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

const KEY = 'surgical-trainer.settings.v1';

describe('settings', () => {
  it('starts at medium quality with no storage, or nothing stored', () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.quality).toBe('medium');
  });

  it('keeps a saved quality level between visits', () => {
    const storage = memoryStorage();
    saveSettings(storage, { quality: 'high' });
    expect(loadSettings(storage).quality).toBe('high');
  });

  it('falls back to the default for anything it cannot read', () => {
    expect(loadSettings(memoryStorage({ [KEY]: 'not json' })).quality).toBe('medium');
    expect(loadSettings(memoryStorage({ [KEY]: '{"quality":"ultra"}' })).quality).toBe('medium');
    expect(loadSettings(memoryStorage({ [KEY]: 'null' })).quality).toBe('medium');
  });

  it('survives storage that throws, as blocked site data does', () => {
    const blocked = memoryStorage();
    blocked.getItem = () => {
      throw new Error('blocked');
    };
    blocked.setItem = () => {
      throw new Error('blocked');
    };
    expect(loadSettings(blocked)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(blocked, { quality: 'low' })).not.toThrow();
  });
});
