import { MODE_RULES, REPORT_WEIGHTS } from '../scoring';
import { describeMistake, type MistakeCode, type StepRecord } from './run';
import type { Procedure, ProcedureMode } from './types';
import type { VitalsState } from './vitals';

/**
 * The report card: the brief's headings (accuracy, tissue handling,
 * efficiency, knowledge) worked out from what the run recorded, a step by step
 * breakdown, and what to go over again.
 */

export interface ReportLine {
  readonly stepId: string;
  readonly title: string;
  readonly completed: boolean;
  readonly score: number;
  readonly mistakes: readonly MistakeCode[];
  readonly hintsUsed: number;
  readonly quizCorrect: boolean | null;
  readonly seconds: number;
}

export interface Report {
  readonly procedureId: string;
  readonly title: string;
  readonly mode: ProcedureMode;
  /** Learn records mistakes but never fails anyone, so its score is not shown as a mark. */
  readonly scored: boolean;
  readonly passMark: number;
  readonly passed: boolean;
  readonly score: number;
  readonly accuracy: number;
  readonly tissueHandling: number;
  readonly efficiency: number;
  readonly knowledge: number;
  readonly seconds: number;
  readonly bloodLossMl: number;
  readonly steps: readonly ReportLine[];
  /** Steps worth going over again, the worst first. */
  readonly review: readonly string[];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function countMistake(records: readonly StepRecord[], code: MistakeCode): number {
  return records.filter((record) => record.mistakes.includes(code)).length;
}

export function buildReport(
  procedure: Procedure,
  mode: ProcedureMode,
  records: readonly StepRecord[],
  vitals: VitalsState,
  seconds: number,
): Report {
  const titles = new Map(procedure.steps.map((step) => [step.id, step.title]));
  const steps: ReportLine[] = records.map((record) => ({
    stepId: record.stepId,
    title: titles.get(record.stepId) ?? record.stepId,
    completed: record.completed,
    score: record.score,
    mistakes: record.mistakes,
    hintsUsed: record.hintsUsed,
    quizCorrect: record.quizCorrect,
    seconds: record.seconds,
  }));

  const reached = records.filter((record) => record.completed || record.attempts > 0);
  const accuracy = reached.length
    ? clamp(reached.reduce((sum, record) => sum + record.score, 0) / reached.length)
    : 0;

  // Tissue handling: acting on a protected structure is the serious one;
  // sloppy placement counts for less.
  const tissueHandling = clamp(
    100 -
      countMistake(records, 'protected_structure') * 30 -
      countMistake(records, 'off_target') * 10 -
      countMistake(records, 'poor_handling') * 10,
  );

  // Efficiency: the estimate is par. Twice the estimate loses half of it, and
  // reaching for the wrong instrument costs a little as well.
  const par = procedure.estimatedMinutes * 60;
  const over = par > 0 ? Math.max(0, seconds / par - 1) : 0;
  const efficiency = clamp(100 - Math.min(over, 1) * 50 - countMistake(records, 'wrong_instrument') * 5);

  const answered = records.filter((record) => record.quizCorrect !== null);
  const knowledge = answered.length
    ? clamp((answered.filter((record) => record.quizCorrect === true).length / answered.length) * 100)
    : 100;

  const score = clamp(
    accuracy * REPORT_WEIGHTS.accuracy +
      tissueHandling * REPORT_WEIGHTS.tissueHandling +
      efficiency * REPORT_WEIGHTS.efficiency +
      knowledge * REPORT_WEIGHTS.knowledge,
  );

  const review = steps
    .filter((line) => line.mistakes.length > 0)
    .sort((a, b) => a.score - b.score)
    .map((line) => `${line.title}: ${describeMistake(line.mistakes[0] ?? 'off_target')}`);

  const rules = MODE_RULES[mode];
  return {
    procedureId: procedure.id,
    title: procedure.title,
    mode,
    scored: rules.scored,
    passMark: rules.passMark,
    passed: !rules.scored || score >= rules.passMark,
    score,
    accuracy,
    tissueHandling,
    efficiency,
    knowledge,
    seconds,
    bloodLossMl: Math.round(vitals.bloodLossMl),
    steps,
    review,
  };
}
