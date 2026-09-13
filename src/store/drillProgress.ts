import type { DrillResult } from '../engine/drill';

/**
 * The instrument drill's record, kept in localStorage: how many runs, the
 * best and latest score, and how often each instrument has been missed, so the
 * drill can say what to review.
 *
 * Read defensively, like settings.ts: missing or unreadable storage gives a
 * fresh record rather than an error.
 */

export interface DrillProgress {
  attempts: number;
  bestPercent: number;
  lastPercent: number | null;
  /** Times each tool id has been answered wrongly, across all runs. */
  misses: Record<string, number>;
}

const STORAGE_KEY = 'surgical-trainer.drill.v1';

export function emptyProgress(): DrillProgress {
  return { attempts: 0, bestPercent: 0, lastPercent: null, misses: {} };
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function loadDrillProgress(storage: Storage | null): DrillProgress {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return emptyProgress();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return emptyProgress();
    const record = parsed as Record<string, unknown>;
    const misses: Record<string, number> = {};
    const rawMisses = record['misses'];
    if (typeof rawMisses === 'object' && rawMisses !== null) {
      for (const [toolId, count] of Object.entries(rawMisses)) {
        if (isCount(count)) misses[toolId] = count;
      }
    }
    const last = record['lastPercent'];
    return {
      attempts: isCount(record['attempts']) ? record['attempts'] : 0,
      bestPercent: isCount(record['bestPercent']) ? Math.min(record['bestPercent'], 100) : 0,
      lastPercent: isCount(last) ? Math.min(last, 100) : null,
      misses,
    };
  } catch {
    return emptyProgress();
  }
}

/** Fold a finished run into the record. Pure: returns a new record. */
export function recordDrillResult(progress: DrillProgress, result: DrillResult): DrillProgress {
  const misses = { ...progress.misses };
  for (const toolId of result.missed) misses[toolId] = (misses[toolId] ?? 0) + 1;
  return {
    attempts: progress.attempts + 1,
    bestPercent: Math.max(progress.bestPercent, result.percent),
    lastPercent: result.percent,
    misses,
  };
}

export function saveDrillProgress(storage: Storage | null, progress: DrillProgress): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage full or blocked: the run still counts on screen.
  }
}
