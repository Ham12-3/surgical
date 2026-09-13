import { DEFAULT_KEYS, readKeyBindings, type KeyBindings } from './keyBindings';

/**
 * User settings that persist between visits, kept in localStorage.
 *
 * Reads are defensive. Storage can be missing (private windows, blocked site
 * data), throw on access, or hold something an older build wrote, and none of
 * that should stop the app from starting: anything unreadable falls back to
 * its default, field by field.
 */

export const QUALITY_LEVELS = ['low', 'medium', 'high'] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];

/**
 * How tissue and bleeding are drawn: the brief's content levels. Reduced is
 * the default look, muted tissue and a thin dark film where it bleeds.
 * Schematic draws tissues in flat, distinct colours with no blood. The brief's
 * Clinical level, with realistic blood, is not offered (DECISIONS.md, D39).
 */
export const CONTENT_LEVELS = ['reduced', 'schematic'] as const;
export type ContentLevel = (typeof CONTENT_LEVELS)[number];

export interface Settings {
  readonly quality: QualityLevel;
  readonly contentLevel: ContentLevel;
  /** Right and wrong in blue and orange rather than green and red. */
  readonly colourblindSafe: boolean;
  /** The camera and the wound change at once instead of easing. */
  readonly reducedMotion: boolean;
  readonly sound: boolean;
  /** 0 to 1. */
  readonly volume: number;
  /** Every sound cue also written on screen. */
  readonly captions: boolean;
  readonly keys: KeyBindings;
  /** The first-launch disclaimer has been read and acknowledged. */
  readonly disclaimerAccepted: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  quality: 'medium',
  contentLevel: 'reduced',
  colourblindSafe: false,
  reducedMotion: false,
  sound: true,
  volume: 0.6,
  captions: false,
  keys: DEFAULT_KEYS,
  disclaimerAccepted: false,
};

const STORAGE_KEY = 'surgical-trainer.settings.v1';

export function isQualityLevel(value: unknown): value is QualityLevel {
  return typeof value === 'string' && (QUALITY_LEVELS as readonly string[]).includes(value);
}

export function isContentLevel(value: unknown): value is ContentLevel {
  return typeof value === 'string' && (CONTENT_LEVELS as readonly string[]).includes(value);
}

/**
 * The saved settings. `systemReducedMotion` is the operating system's
 * preference, which reduced motion follows until the player saves a choice.
 */
export function loadSettings(storage: Storage | null, systemReducedMotion = false): Settings {
  const defaults: Settings = { ...DEFAULT_SETTINGS, reducedMotion: systemReducedMotion };
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return defaults;
    const record = parsed as Record<string, unknown>;
    const flag = (key: keyof Settings): boolean => {
      const value = record[key];
      return typeof value === 'boolean' ? value : (defaults[key] as boolean);
    };
    const quality = record['quality'];
    const contentLevel = record['contentLevel'];
    const volume = record['volume'];
    return {
      quality: isQualityLevel(quality) ? quality : defaults.quality,
      contentLevel: isContentLevel(contentLevel) ? contentLevel : defaults.contentLevel,
      colourblindSafe: flag('colourblindSafe'),
      reducedMotion: flag('reducedMotion'),
      sound: flag('sound'),
      volume: typeof volume === 'number' && Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : defaults.volume,
      captions: flag('captions'),
      keys: readKeyBindings(record['keys']),
      disclaimerAccepted: flag('disclaimerAccepted'),
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(storage: Storage | null, settings: Settings): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or blocked: the setting still holds for this visit.
  }
}
