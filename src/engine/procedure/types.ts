import type { ActionType } from '../types';
import type { MistakeCode } from './run';

/**
 * A procedure: the steps a student works through, and everything the screens
 * need to teach and judge them. Plain data, validated in parse.ts and played
 * by run.ts; nothing here knows about Three.js or the DOM.
 */

/** The brief's first three modes; the drills are their own screens. */
export const PROCEDURE_MODES = ['learn', 'practice', 'assessment'] as const;
export type ProcedureMode = (typeof PROCEDURE_MODES)[number];

export interface StepTarget {
  /** Anatomical zone the step acts on (src/data/zones). */
  readonly zoneId: string;
  /** How far off the zone's centre the action may land: 0 is dead centre, 1 its edge. */
  readonly tolerance?: number;
}

/** A mistake worth naming, with what to tell the student when they make it. */
export interface CommonError {
  /** One of the mistakes the step machine can tell apart, so the wording is always reachable. */
  readonly code: MistakeCode;
  readonly feedback: string;
}

export interface StepQuiz {
  readonly question: string;
  readonly options: readonly string[];
  /** One of `options`. */
  readonly answer: string;
}

export interface ProcedureStep {
  readonly id: string;
  readonly title: string;
  /** What to do, in one line. */
  readonly objective: string;
  /** Why it matters: shown once the step is done, and throughout in Learn. */
  readonly explanation: string;
  /** Instruments that do this step; the first is the one Learn mode names. */
  readonly instruments: readonly string[];
  readonly action: ActionType;
  readonly target: StepTarget;
  /** Camera preset the scene moves to as the step starts. */
  readonly camera?: string;
  readonly hints: readonly string[];
  readonly commonErrors: readonly CommonError[];
  readonly quiz?: StepQuiz;
  /** What a clinician still has to check about this step (CLAUDE.md, non-negotiable 2). */
  readonly todo?: string;
  /** Blood welling up while this step is undone, millilitres a second. */
  readonly bleedMlPerSecond?: number;
}

export interface Procedure {
  readonly id: string;
  readonly title: string;
  /** 1 to 5, for the home screen. */
  readonly difficulty: number;
  readonly estimatedMinutes: number;
  /** Patient variant the scene builds (src/data/zones). */
  readonly model: string;
  /** False until a qualified clinician has checked it (CLAUDE.md, non-negotiable 2). */
  readonly reviewed: boolean;
  readonly references: readonly string[];
  readonly todo: readonly string[];
  /** Instruments on the tray, in order. */
  readonly trayToolIds: readonly string[];
  readonly steps: readonly ProcedureStep[];
}
