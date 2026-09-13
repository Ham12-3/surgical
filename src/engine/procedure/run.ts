import { HINT_PENALTY, MISTAKE_PENALTIES, MODE_RULES } from '../scoring';
import type { ActionType } from '../types';
import type { Procedure, ProcedureMode, ProcedureStep } from './types';

/**
 * Playing a procedure: which step is current, whether what the student just
 * did was right, and what it cost.
 *
 * This is the engine half of the contract in CLAUDE.md: the scene hands over a
 * flat `ToolAction` and gets a `StepOutcome` back. No Three.js type crosses it,
 * which is what lets the whole thing be tested without a browser.
 */

export interface ToolAction {
  readonly toolId: string;
  readonly zoneId: string | null;
  readonly action: ActionType;
  /** 0 at the zone's centre, 1 at its edge. */
  readonly offset: number;
  /** The zone is one the student must not act on. */
  readonly avoid: boolean;
}

export const MISTAKE_CODES = [
  'protected_structure',
  'wrong_instrument',
  'wrong_action',
  'wrong_place',
  'off_target',
] as const;
export type MistakeCode = (typeof MISTAKE_CODES)[number];

/** What to say when the step itself names no feedback for a mistake. */
const DEFAULT_FEEDBACK: Readonly<Record<MistakeCode, string>> = {
  protected_structure: 'That is a structure to protect. Come off it before you do anything else.',
  wrong_instrument: 'That is not the instrument this step calls for.',
  wrong_action: 'That instrument can do that, but it is not what this step asks for.',
  wrong_place: 'Not there. Read the step again and find the right place.',
  off_target: 'The right place, but not accurately enough. Take your time and go again.',
};

export function describeMistake(code: MistakeCode): string {
  return DEFAULT_FEEDBACK[code];
}

export interface StepOutcome {
  readonly ok: boolean;
  readonly feedback: string;
  /** Why the step matters, once it is done. */
  readonly explainWhy: string | null;
  readonly mistake: MistakeCode | null;
  /** Points this action cost; always 0 in Learn. */
  readonly penalty: number;
  readonly advanced: boolean;
  readonly finished: boolean;
}

export interface StepRecord {
  readonly stepId: string;
  readonly completed: boolean;
  readonly attempts: number;
  /** Each distinct mistake once, in the order it was first made. */
  readonly mistakes: readonly MistakeCode[];
  readonly hintsUsed: number;
  readonly quizCorrect: boolean | null;
  readonly seconds: number;
  /** 0 to 100 for this step, whatever the mode. */
  readonly score: number;
}

interface Tally {
  readonly stepId: string;
  completed: boolean;
  attempts: number;
  mistakes: MistakeCode[];
  hintsUsed: number;
  quizCorrect: boolean | null;
  seconds: number;
}

export class ProcedureRun {
  private readonly rules: (typeof MODE_RULES)[ProcedureMode];
  private readonly tallies: Tally[];
  private position = 0;
  private hintsGiven = 0;
  private elapsed = 0;

  constructor(
    readonly procedure: Procedure,
    readonly mode: ProcedureMode,
  ) {
    this.rules = MODE_RULES[mode];
    this.tallies = procedure.steps.map((step) => ({
      stepId: step.id,
      completed: false,
      attempts: 0,
      mistakes: [],
      hintsUsed: 0,
      quizCorrect: null,
      seconds: 0,
    }));
  }

  get step(): ProcedureStep | null {
    return this.procedure.steps[this.position] ?? null;
  }

  /** 1-based, and never past the last step. */
  get stepNumber(): number {
    return Math.min(this.position + 1, this.procedure.steps.length);
  }

  get finished(): boolean {
    return this.position >= this.procedure.steps.length;
  }

  get elapsedSeconds(): number {
    return this.elapsed;
  }

  /** The instrument to name for this step, where the mode gives that away. */
  get suggestedTool(): string | null {
    return this.rules.hints ? (this.step?.instruments[0] ?? null) : null;
  }

  /** The zone for the scene to highlight, where the mode allows it. */
  get highlightZone(): string | null {
    return this.rules.highlightTarget ? (this.step?.target.zoneId ?? null) : null;
  }

  /** Blood welling up right now: a step that bleeds until it is done. */
  get bleedMlPerSecond(): number {
    return this.step?.bleedMlPerSecond ?? 0;
  }

  tick(seconds: number): void {
    if (this.finished || seconds <= 0) return;
    this.elapsed += seconds;
    const tally = this.tallies[this.position];
    if (tally) tally.seconds += seconds;
  }

  /** The next hint for this step, or null where the mode gives none or they have run out. */
  nextHint(): string | null {
    const step = this.step;
    const tally = this.tallies[this.position];
    if (!this.rules.hints || !step || !tally) return null;
    const hint = step.hints[this.hintsGiven];
    if (hint === undefined) return null;
    this.hintsGiven += 1;
    tally.hintsUsed += 1;
    return hint;
  }

  /** Answer a step's quiz. Returns whether it was right, or null if that step has none. */
  answerQuiz(stepId: string, option: string): boolean | null {
    const index = this.procedure.steps.findIndex((step) => step.id === stepId);
    const step = this.procedure.steps[index];
    const tally = this.tallies[index];
    if (!step?.quiz || !tally) return null;
    const correct = option === step.quiz.answer;
    tally.quizCorrect = correct;
    return correct;
  }

  perform(action: ToolAction): StepOutcome {
    const step = this.step;
    const tally = this.tallies[this.position];
    if (!step || !tally) {
      return {
        ok: false,
        feedback: 'The procedure is already finished.',
        explainWhy: null,
        mistake: null,
        penalty: 0,
        advanced: false,
        finished: true,
      };
    }

    tally.attempts += 1;
    const mistake = judge(step, action);
    if (mistake) {
      return {
        ok: false,
        feedback: feedbackFor(step, mistake),
        explainWhy: null,
        mistake,
        penalty: this.chargeFor(tally, mistake),
        advanced: false,
        finished: false,
      };
    }

    tally.completed = true;
    this.position += 1;
    this.hintsGiven = 0;
    return {
      ok: true,
      feedback: `${step.title}: done.`,
      explainWhy: step.explanation,
      mistake: null,
      penalty: 0,
      advanced: true,
      finished: this.finished,
    };
  }

  results(): readonly StepRecord[] {
    return this.tallies.map((tally) => ({
      stepId: tally.stepId,
      completed: tally.completed,
      attempts: tally.attempts,
      mistakes: [...tally.mistakes],
      hintsUsed: tally.hintsUsed,
      quizCorrect: tally.quizCorrect,
      seconds: tally.seconds,
      score: scoreOf(tally),
    }));
  }

  /** A distinct mistake costs once a step, however often it is repeated. */
  private chargeFor(tally: Tally, mistake: MistakeCode): number {
    if (tally.mistakes.includes(mistake)) return 0;
    tally.mistakes.push(mistake);
    return this.rules.scored ? MISTAKE_PENALTIES[mistake] : 0;
  }
}

function judge(step: ProcedureStep, action: ToolAction): MistakeCode | null {
  if (action.avoid) return 'protected_structure';
  if (!step.instruments.includes(action.toolId)) return 'wrong_instrument';
  if (action.action !== step.action) return 'wrong_action';
  if (action.zoneId !== step.target.zoneId) return 'wrong_place';
  if (action.offset > (step.target.tolerance ?? 1)) return 'off_target';
  return null;
}

/** A step's own wording for a mistake, or the general one. */
function feedbackFor(step: ProcedureStep, mistake: MistakeCode): string {
  return step.commonErrors.find((error) => error.code === mistake)?.feedback ?? DEFAULT_FEEDBACK[mistake];
}

function scoreOf(tally: Tally): number {
  const lost = tally.mistakes.reduce((sum, mistake) => sum + MISTAKE_PENALTIES[mistake], 0);
  return Math.max(0, Math.min(100, 100 - lost - tally.hintsUsed * HINT_PENALTY));
}
