import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYS } from '../src/store/keyBindings';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../src/store/settings';
import { blockedStorage, memoryStorage } from './fixtures/storage';

const KEY = 'surgical-trainer.settings.v1';

describe('settings', () => {
  it('starts from the defaults with no storage, or nothing stored', () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({
      quality: 'medium',
      contentLevel: 'reduced',
      colourblindSafe: false,
      reducedMotion: false,
      sound: true,
      captions: false,
      disclaimerAccepted: false,
    });
    expect(DEFAULT_SETTINGS.keys).toEqual(DEFAULT_KEYS);
  });

  it('follows the system reduced-motion preference until a choice is saved', () => {
    expect(loadSettings(memoryStorage(), true).reducedMotion).toBe(true);
    const storage = memoryStorage();
    saveSettings(storage, { ...DEFAULT_SETTINGS, reducedMotion: false });
    expect(loadSettings(storage, true).reducedMotion).toBe(false);
  });

  it('keeps every setting between visits', () => {
    const storage = memoryStorage();
    const chosen: Settings = {
      quality: 'high',
      contentLevel: 'schematic',
      colourblindSafe: true,
      reducedMotion: true,
      sound: false,
      volume: 0.25,
      captions: true,
      keys: { ...DEFAULT_KEYS, hint: 'q' },
      disclaimerAccepted: true,
    };
    saveSettings(storage, chosen);
    expect(loadSettings(storage)).toEqual(chosen);
  });

  it('falls back field by field for anything it cannot read', () => {
    const stored = {
      quality: 'ultra',
      contentLevel: 'clinical',
      colourblindSafe: 'yes',
      volume: 7,
      keys: { tools: ['1'], hint: 'h', pause: 'Escape' },
      disclaimerAccepted: true,
    };
    expect(loadSettings(memoryStorage({ [KEY]: JSON.stringify(stored) }))).toEqual({
      ...DEFAULT_SETTINGS,
      volume: 1,
      disclaimerAccepted: true,
    });
    expect(loadSettings(memoryStorage({ [KEY]: 'not json' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memoryStorage({ [KEY]: 'null' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('reads a save from before Phase 5, which only had the quality level', () => {
    expect(loadSettings(memoryStorage({ [KEY]: '{"quality":"low"}' }))).toEqual({ ...DEFAULT_SETTINGS, quality: 'low' });
  });

  it('survives storage that throws, as blocked site data does', () => {
    expect(loadSettings(blockedStorage())).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(blockedStorage(), DEFAULT_SETTINGS)).not.toThrow();
  });
});
