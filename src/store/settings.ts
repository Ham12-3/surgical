/**
 * User settings that persist between visits, kept in localStorage.
 *
 * Reads are defensive. Storage can be missing (private windows, blocked site
 * data), throw on access, or hold something an older build wrote, and none of
 * that should stop the app from starting: anything unreadable falls back to
 * the defaults.
 */

export const QUALITY_LEVELS = ['low', 'medium', 'high'] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];

export interface Settings {
  quality: QualityLevel;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = { quality: 'medium' };

const STORAGE_KEY = 'surgical-trainer.settings.v1';

export function isQualityLevel(value: unknown): value is QualityLevel {
  return typeof value === 'string' && (QUALITY_LEVELS as readonly string[]).includes(value);
}

export function loadSettings(storage: Storage | null): Settings {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    const quality =
      typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>)['quality'] : undefined;
    return { quality: isQualityLevel(quality) ? quality : DEFAULT_SETTINGS.quality };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage: Storage | null, settings: Settings): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or blocked: the setting still holds for this visit.
  }
}
