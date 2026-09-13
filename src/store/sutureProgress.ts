/**
 * The suturing pad's record, kept in localStorage: runs finished, and the best
 * and latest score. Read defensively, like the drill's: missing or unreadable
 * storage gives a fresh record rather than an error.
 */

export interface SutureProgress {
  attempts: number;
  bestScore: number;
  lastScore: number | null;
}

const STORAGE_KEY = 'surgical-trainer.suture-pad.v1';

export function emptySutureProgress(): SutureProgress {
  return { attempts: 0, bestScore: 0, lastScore: null };
}

function isScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
}

export function loadSutureProgress(storage: Storage | null): SutureProgress {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return emptySutureProgress();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return emptySutureProgress();
    const record = parsed as Record<string, unknown>;
    const attempts = record['attempts'];
    const last = record['lastScore'];
    return {
      attempts: typeof attempts === 'number' && Number.isInteger(attempts) && attempts >= 0 ? attempts : 0,
      bestScore: isScore(record['bestScore']) ? record['bestScore'] : 0,
      lastScore: isScore(last) ? last : null,
    };
  } catch {
    return emptySutureProgress();
  }
}

/** Fold a finished run into the record. Pure: returns a new record. */
export function recordSutureResult(progress: SutureProgress, score: number): SutureProgress {
  return {
    attempts: progress.attempts + 1,
    bestScore: Math.max(progress.bestScore, score),
    lastScore: score,
  };
}

export function saveSutureProgress(storage: Storage | null, progress: SutureProgress): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage full or blocked: the run still counts on screen.
  }
}
