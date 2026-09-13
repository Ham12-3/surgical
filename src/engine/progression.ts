import type { Report } from './procedure/report';
import type { ProcedureMode } from './procedure/types';
import { LEVEL_XP_STEP, XP_AWARDS } from './scoring';
import { BADGES, type BadgeId } from './badges';

/**
 * Progression: experience, levels, rank titles, badges and the record of what
 * the student has finished, kept together as one plain `Profile`.
 *
 * Pure, like the rest of the engine: `recordActivity` returns a new profile
 * and what the run earned, and src/store/profile.ts reads and writes it. The
 * award sizes sit with the other tuning numbers in scoring.ts.
 *
 * The ranks borrow the brief's titles for training grades as a game's levels.
 * They say how much of the simulator someone has worked through and nothing
 * about clinical competence; the home screen says so.
 */

export interface ModeRecord {
  readonly runs: number;
  /** Best report score, 0 to 100. Learn is not marked, but its score is kept. */
  readonly best: number;
  /** Passed at least once. Learn has no fail state, so finishing it counts. */
  readonly passed: boolean;
}

export type ProcedureRecord = Readonly<Record<ProcedureMode, ModeRecord>>;

export interface ProcedureAttempt {
  readonly procedureId: string;
  readonly mode: ProcedureMode;
  readonly score: number;
  readonly passed: boolean;
  readonly seconds: number;
  readonly hintsUsed: number;
  /** Steps on which a structure to protect was touched. */
  readonly protectedHits: number;
  /** When the run finished, as an ISO date and time. */
  readonly finishedAt: string;
}

export interface SkillRecord {
  readonly runs: number;
  /** Best score or percentage, 0 to 100. */
  readonly best: number;
}

export interface Profile {
  readonly xp: number;
  readonly procedures: Readonly<Record<string, ProcedureRecord>>;
  readonly drill: SkillRecord;
  readonly suture: SkillRecord;
  /** Each badge earned, and when, as an ISO date and time. */
  readonly badges: Readonly<Partial<Record<BadgeId, string>>>;
  /** The latest procedure runs, newest first. */
  readonly recent: readonly ProcedureAttempt[];
}

/** Something finished that counts toward progression. */
export type Activity =
  | { readonly kind: 'procedure'; readonly attempt: ProcedureAttempt }
  | { readonly kind: 'drill'; readonly percent: number }
  | { readonly kind: 'suture'; readonly score: number };

/** How many procedure runs the profile keeps for the home screen. */
export const RECENT_LIMIT = 10;

export const RANKS = ['Medical Student', 'Foundation Doctor', 'Core Trainee', 'Registrar', 'Consultant'] as const;
export type Rank = (typeof RANKS)[number];
/** The level each rank in RANKS starts at. */
export const RANK_START_LEVELS: readonly number[] = [1, 3, 6, 10, 15];

export function emptyModeRecord(): ModeRecord {
  return { runs: 0, best: 0, passed: false };
}

export function emptyProcedureRecord(): ProcedureRecord {
  return { learn: emptyModeRecord(), practice: emptyModeRecord(), assessment: emptyModeRecord() };
}

export function emptyProfile(): Profile {
  return { xp: 0, procedures: {}, drill: { runs: 0, best: 0 }, suture: { runs: 0, best: 0 }, badges: {}, recent: [] };
}

/** Experience needed to reach a level: each level asks LEVEL_XP_STEP more than the one before it. */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level));
  return (LEVEL_XP_STEP * (n - 1) * n) / 2;
}

export function levelForXp(xp: number): number {
  const total = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  let level = 1;
  while (xpForLevel(level + 1) <= total) level += 1;
  return level;
}

export function rankForLevel(level: number): Rank {
  let rank: Rank = RANKS[0];
  RANKS.forEach((title, index) => {
    if (level >= (RANK_START_LEVELS[index] ?? Infinity)) rank = title;
  });
  return rank;
}

export interface LevelProgress {
  readonly xp: number;
  readonly level: number;
  readonly rank: Rank;
  readonly levelStartXp: number;
  readonly nextLevelXp: number;
  /** How far through the current level, 0 to 1. */
  readonly fraction: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const levelStartXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const fraction = Math.min(1, Math.max(0, (xp - levelStartXp) / (nextLevelXp - levelStartXp)));
  return { xp, level, rank: rankForLevel(level), levelStartXp, nextLevelXp, fraction };
}

/** A score held to 0..100, so a bad value can never award or cost a fortune. */
function points(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

export function xpFor(activity: Activity): number {
  switch (activity.kind) {
    case 'procedure': {
      const { mode, passed, score } = activity.attempt;
      const award = XP_AWARDS.procedure[mode];
      return Math.round(award.finish + (passed ? award.pass : 0) + points(score) * award.perPoint);
    }
    case 'drill':
      return Math.round(XP_AWARDS.drill.finish + points(activity.percent) * XP_AWARDS.drill.perPoint);
    case 'suture':
      return Math.round(XP_AWARDS.suture.finish + points(activity.score) * XP_AWARDS.suture.perPoint);
  }
}

/** What a finished procedure run adds to the profile, from its report card. */
export function attemptFromReport(report: Report, now: Date): ProcedureAttempt {
  return {
    procedureId: report.procedureId,
    mode: report.mode,
    score: report.score,
    passed: report.passed,
    seconds: Math.round(report.seconds),
    hintsUsed: report.steps.reduce((sum, line) => sum + line.hintsUsed, 0),
    protectedHits: report.steps.filter((line) => line.mistakes.includes('protected_structure')).length,
    finishedAt: now.toISOString(),
  };
}

/**
 * Assessment opens once the procedure has been finished in Learn or Practice,
 * so nobody's first sight of a procedure is the marked, unaided version.
 */
export function isModeUnlocked(profile: Profile, procedureId: string, mode: ProcedureMode): boolean {
  if (mode !== 'assessment') return true;
  const record = profile.procedures[procedureId];
  return record !== undefined && (record.learn.runs > 0 || record.practice.runs > 0);
}

export interface RunReward {
  readonly xpGained: number;
  readonly before: LevelProgress;
  readonly after: LevelProgress;
  readonly newBadges: readonly BadgeId[];
}

/** Count a finished activity: its record, its experience, and any badge it earns for the first time. */
export function recordActivity(
  profile: Profile,
  activity: Activity,
  now: Date,
): { readonly profile: Profile; readonly reward: RunReward } {
  const xpGained = xpFor(activity);
  const counted: Profile = { ...applyActivity(profile, activity), xp: profile.xp + xpGained };
  const newBadges = BADGES.filter((badge) => profile.badges[badge.id] === undefined && badge.earned(counted, activity)).map(
    (badge) => badge.id,
  );
  const badges: Partial<Record<BadgeId, string>> = { ...profile.badges };
  for (const id of newBadges) badges[id] = now.toISOString();
  return {
    profile: { ...counted, badges },
    reward: { xpGained, before: levelProgress(profile.xp), after: levelProgress(counted.xp), newBadges },
  };
}

function bump(record: SkillRecord, value: number): SkillRecord {
  return { runs: record.runs + 1, best: Math.max(record.best, Math.round(points(value))) };
}

function applyActivity(profile: Profile, activity: Activity): Profile {
  switch (activity.kind) {
    case 'procedure': {
      const { attempt } = activity;
      const record = profile.procedures[attempt.procedureId] ?? emptyProcedureRecord();
      const previous = record[attempt.mode];
      const mode: ModeRecord = {
        runs: previous.runs + 1,
        best: Math.max(previous.best, Math.round(points(attempt.score))),
        passed: previous.passed || attempt.passed,
      };
      const updated: ProcedureRecord = { ...record, [attempt.mode]: mode };
      return {
        ...profile,
        procedures: { ...profile.procedures, [attempt.procedureId]: updated },
        recent: [attempt, ...profile.recent].slice(0, RECENT_LIMIT),
      };
    }
    case 'drill':
      return { ...profile, drill: bump(profile.drill, activity.percent) };
    case 'suture':
      return { ...profile, suture: bump(profile.suture, activity.score) };
  }
}
