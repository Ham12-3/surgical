import { BADGE_IDS, type BadgeId } from '../engine/badges';
import { PROCEDURE_MODES, type ProcedureMode } from '../engine/procedure/types';
import {
  emptyProfile,
  RECENT_LIMIT,
  type ModeRecord,
  type ProcedureAttempt,
  type ProcedureRecord,
  type Profile,
  type SkillRecord,
} from '../engine/progression';

/**
 * The student's profile (src/engine/progression.ts), kept in localStorage.
 * There is no account: the profile belongs to this browser (DECISIONS.md, D38).
 *
 * Read defensively, like settings.ts: missing or unreadable storage gives a
 * fresh profile, and any field an older build or a hand edit got wrong falls
 * back to its empty value rather than stopping the app.
 */

const STORAGE_KEY = 'surgical-trainer.profile.v1';

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function score(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0;
}

function readSkill(raw: unknown): SkillRecord {
  return isObject(raw) ? { runs: count(raw['runs']), best: score(raw['best']) } : { runs: 0, best: 0 };
}

function readMode(raw: unknown): ModeRecord {
  return isObject(raw)
    ? { runs: count(raw['runs']), best: score(raw['best']), passed: raw['passed'] === true }
    : { runs: 0, best: 0, passed: false };
}

function readProcedure(raw: unknown): ProcedureRecord {
  const record = isObject(raw) ? raw : {};
  return { learn: readMode(record['learn']), practice: readMode(record['practice']), assessment: readMode(record['assessment']) };
}

function isMode(value: unknown): value is ProcedureMode {
  return typeof value === 'string' && (PROCEDURE_MODES as readonly string[]).includes(value);
}

function readAttempt(raw: unknown): ProcedureAttempt | null {
  if (!isObject(raw)) return null;
  const procedureId = raw['procedureId'];
  const mode = raw['mode'];
  const finishedAt = raw['finishedAt'];
  if (typeof procedureId !== 'string' || !isMode(mode) || typeof finishedAt !== 'string') return null;
  return {
    procedureId,
    mode,
    score: score(raw['score']),
    passed: raw['passed'] === true,
    seconds: count(raw['seconds']),
    hintsUsed: count(raw['hintsUsed']),
    protectedHits: count(raw['protectedHits']),
    finishedAt,
  };
}

function readBadges(raw: unknown): Partial<Record<BadgeId, string>> {
  const badges: Partial<Record<BadgeId, string>> = {};
  if (!isObject(raw)) return badges;
  for (const id of BADGE_IDS) {
    const earnedAt = raw[id];
    if (typeof earnedAt === 'string') badges[id] = earnedAt;
  }
  return badges;
}

export function loadProfile(storage: Storage | null): Profile {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return emptyProfile();
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return emptyProfile();

    const procedures: Record<string, ProcedureRecord> = {};
    const rawProcedures = parsed['procedures'];
    if (isObject(rawProcedures)) {
      for (const [id, record] of Object.entries(rawProcedures)) procedures[id] = readProcedure(record);
    }
    const rawRecent = parsed['recent'];
    const recent = Array.isArray(rawRecent)
      ? rawRecent.map(readAttempt).filter((attempt): attempt is ProcedureAttempt => attempt !== null)
      : [];

    return {
      xp: count(parsed['xp']),
      procedures,
      drill: readSkill(parsed['drill']),
      suture: readSkill(parsed['suture']),
      badges: readBadges(parsed['badges']),
      recent: recent.slice(0, RECENT_LIMIT),
    };
  } catch {
    return emptyProfile();
  }
}

export function saveProfile(storage: Storage | null, profile: Profile): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Storage full or blocked: the progress still shows for this visit.
  }
}

/** Start again from nothing, for the settings screen's reset. */
export function clearProfile(storage: Storage | null): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Blocked storage has nothing to clear.
  }
}
