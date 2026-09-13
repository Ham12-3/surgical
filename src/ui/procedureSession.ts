import { HandlingRun, type MoveOutcome } from '../engine/handling/run';
import type { HandlingSequence } from '../engine/handling/types';
import { buildReport, type Report } from '../engine/procedure/report';
import { ProcedureRun, type StepOutcome, type ToolAction } from '../engine/procedure/run';
import type { Procedure, ProcedureMode, ProcedureStep } from '../engine/procedure/types';
import { RESTING_VITALS, stepVitals, type VitalsState } from '../engine/procedure/vitals';
import { MODE_RULES } from '../engine/scoring';
import type { ToolIndex } from '../engine/toolCatalogue';

/**
 * One procedure run behind the procedure screen, without the DOM or the
 * scene: the step machine, the vitals, the hints shown so far, a question
 * waiting for its answer, a hand skill under way, and whether the run is
 * paused. The screen draws whatever this says, which keeps the rules of play
 * testable in plain Node.
 */

export type SessionPhase = 'choose' | 'step' | 'handling' | 'quiz' | 'report';

/** What a click, a move or a Continue led to, so the screen knows what to redraw. */
export type SessionChange = 'ignored' | 'refused' | 'handling' | 'quiz' | 'next-step' | 'finished';

export interface PendingQuiz {
  readonly step: ProcedureStep;
  readonly chosen: string | null;
}

export interface MoveResult extends MoveOutcome {
  /** Points the slip cost, if any. */
  readonly penalty: number;
  /** What completing the sequence led to, once it is done. */
  readonly change: SessionChange | null;
}

export const NO_MORE_HINTS = 'No more hints for this step.';

export class ProcedureSession {
  private currentPhase: SessionPhase = 'choose';
  private currentMode: ProcedureMode = 'learn';
  private currentRun: ProcedureRun | null = null;
  private currentVitals: VitalsState = RESTING_VITALS;
  private lastOutcome: StepOutcome | null = null;
  private shownHints: string[] = [];
  private pendingQuiz: PendingQuiz | null = null;
  private currentHandling: HandlingRun | null = null;
  private pendingAction: ToolAction | null = null;
  private lastFault: string | null = null;
  private isPaused = false;

  constructor(
    readonly procedure: Procedure,
    private readonly tools: ToolIndex,
    private readonly sequences: Readonly<Record<string, HandlingSequence>> = {},
  ) {}

  get phase(): SessionPhase {
    return this.currentPhase;
  }

  get mode(): ProcedureMode {
    return this.currentMode;
  }

  get rules(): (typeof MODE_RULES)[ProcedureMode] {
    return MODE_RULES[this.currentMode];
  }

  get run(): ProcedureRun | null {
    return this.currentRun;
  }

  get vitals(): VitalsState {
    return this.currentVitals;
  }

  /** What the last click on the patient came to. */
  get outcome(): StepOutcome | null {
    return this.lastOutcome;
  }

  get hints(): readonly string[] {
    return this.shownHints;
  }

  get quiz(): PendingQuiz | null {
    return this.pendingQuiz;
  }

  /** The hand skill under way, while the phase is 'handling'. */
  get handling(): HandlingRun | null {
    return this.currentHandling;
  }

  /** The last slip in the hand skill, until the next move. */
  get fault(): string | null {
    return this.lastFault;
  }

  get paused(): boolean {
    return this.isPaused;
  }

  private get underWay(): boolean {
    return this.currentPhase === 'step' || this.currentPhase === 'handling';
  }

  /** Blood welling in the wound now: whatever the open step bleeds. */
  get bleedMlPerSecond(): number {
    return this.underWay ? (this.currentRun?.bleedMlPerSecond ?? 0) : 0;
  }

  /** Back to choosing a mode, with nothing under way. */
  reset(): void {
    this.currentPhase = 'choose';
    this.currentRun = null;
    this.currentVitals = RESTING_VITALS;
    this.lastOutcome = null;
    this.shownHints = [];
    this.pendingQuiz = null;
    this.currentHandling = null;
    this.pendingAction = null;
    this.lastFault = null;
    this.isPaused = false;
  }

  start(mode: ProcedureMode): void {
    this.reset();
    this.currentMode = mode;
    this.currentRun = new ProcedureRun(this.procedure, mode);
    this.currentPhase = this.currentRun.step ? 'step' : 'report';
  }

  /** Only a run under way can be paused. */
  setPaused(paused: boolean): void {
    this.isPaused = paused && (this.underWay || this.currentPhase === 'quiz');
  }

  completed(): ReadonlySet<string> {
    return new Set((this.currentRun?.results() ?? []).filter((record) => record.completed).map((record) => record.stepId));
  }

  act(toolId: string, zoneId: string | null, offset: number, avoid: boolean): SessionChange {
    const run = this.currentRun;
    const step = run?.step;
    if (this.isPaused || this.currentPhase !== 'step' || !run || !step || !zoneId) return 'ignored';
    // A click carries no action of its own: the instrument does what the step
    // asks if it can, and otherwise the first thing it does (DECISIONS.md, D36).
    const tools = this.tools;
    const action = tools.supports(toolId, step.action) ? step.action : (tools.get(toolId)?.actions[0] ?? step.action);
    const toolAction: ToolAction = { toolId, zoneId, action, offset, avoid };

    // A step with a hand skill is aimed first, then played move by move; the
    // step machine judges the aim now and records the step once the skill is done.
    const sequence = step.handling === undefined ? undefined : this.sequences[step.handling];
    if (sequence && run.check(toolAction) === null) {
      this.currentPhase = 'handling';
      this.currentHandling = new HandlingRun(sequence);
      this.pendingAction = toolAction;
      this.lastFault = null;
      this.lastOutcome = null;
      return 'handling';
    }
    return this.settle(run.perform(toolAction), step);
  }

  /** A move of the hand skill under way. */
  move(moveId: string): MoveResult {
    const handling = this.currentHandling;
    const run = this.currentRun;
    const step = run?.step;
    const pending = this.pendingAction;
    if (this.isPaused || this.currentPhase !== 'handling' || !handling || !run || !step || !pending) {
      return { ok: false, fault: null, done: false, advanced: false, penalty: 0, change: null };
    }
    const outcome = handling.apply(moveId);
    this.lastFault = outcome.fault;
    const penalty = outcome.fault ? run.noteMistake('poor_handling') : 0;
    if (!outcome.done) return { ...outcome, penalty, change: null };
    this.currentHandling = null;
    this.pendingAction = null;
    this.currentPhase = 'step';
    return { ...outcome, penalty, change: this.settle(run.perform(pending), step) };
  }

  /** Give up on the hand skill: the step stays open, to be aimed again. */
  abandonHandling(): void {
    if (this.currentPhase !== 'handling') return;
    this.currentHandling = null;
    this.pendingAction = null;
    this.lastFault = null;
    this.currentPhase = 'step';
  }

  /** Whether the answer was right, or null when there is no unanswered question. */
  answer(option: string): boolean | null {
    const quiz = this.pendingQuiz;
    const run = this.currentRun;
    if (this.isPaused || this.currentPhase !== 'quiz' || !quiz || quiz.chosen !== null || !run) return null;
    const correct = run.answerQuiz(quiz.step.id, option);
    this.pendingQuiz = { ...quiz, chosen: option };
    return correct;
  }

  continueAfterQuiz(): SessionChange {
    if (this.isPaused || this.currentPhase !== 'quiz' || (this.pendingQuiz?.chosen ?? null) === null) return 'ignored';
    this.pendingQuiz = null;
    return this.moveOn();
  }

  /** The next hint, if the mode gives hints; once they run out, says so once. */
  hint(): string | null {
    const run = this.currentRun;
    if (this.isPaused || !this.underWay || !run) return null;
    const next = run.nextHint();
    if (next) this.shownHints.push(next);
    else if (this.rules.hints && this.shownHints.at(-1) !== NO_MORE_HINTS) this.shownHints.push(NO_MORE_HINTS);
    return next;
  }

  /** Carry the clock and the vitals on. Returns false while nothing is running. */
  tick(delta: number): boolean {
    const run = this.currentRun;
    if (this.isPaused || !this.underWay || !run) return false;
    run.tick(delta);
    this.currentVitals = stepVitals(this.currentVitals, delta, { bleedMlPerSecond: run.bleedMlPerSecond });
    return true;
  }

  report(): Report | null {
    const run = this.currentRun;
    if (this.currentPhase !== 'report' || !run) return null;
    return buildReport(this.procedure, this.currentMode, run.results(), this.currentVitals, run.elapsedSeconds);
  }

  /** What the step machine said about an action, and where that leaves the run. */
  private settle(outcome: StepOutcome, step: ProcedureStep): SessionChange {
    this.lastOutcome = outcome;
    if (!outcome.advanced) return 'refused';
    this.shownHints = [];
    if (step.quiz) {
      this.currentPhase = 'quiz';
      this.pendingQuiz = { step, chosen: null };
      return 'quiz';
    }
    return this.moveOn();
  }

  private moveOn(): SessionChange {
    if (this.currentRun?.step) {
      this.currentPhase = 'step';
      return 'next-step';
    }
    this.currentPhase = 'report';
    return 'finished';
  }
}
