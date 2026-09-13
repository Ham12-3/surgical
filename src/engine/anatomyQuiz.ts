import { shuffle, type Random } from './drill';

/**
 * The anatomy explorer's quiz: a structure is named, and the student finds it
 * with a click. Pure and seeded like the instrument drill, so a run can be
 * replayed in a test.
 *
 * Only structures that share their layer with another are asked about: one
 * alone on its layer is found by clicking anywhere in the opening, which tests
 * nothing.
 */

export interface QuizStructure {
  readonly id: string;
  readonly label: string;
  /** Depth, from the skin at 0 (src/data/zones). */
  readonly layer: number;
}

export interface AnatomyQuizResult {
  readonly correct: number;
  readonly total: number;
  /** Labels of the structures not found, in the order they were asked. */
  readonly missed: readonly string[];
}

export const ANATOMY_QUIZ_LENGTH = 6;

export function quizzable(structures: readonly QuizStructure[]): QuizStructure[] {
  const perLayer = new Map<number, number>();
  for (const structure of structures) perLayer.set(structure.layer, (perLayer.get(structure.layer) ?? 0) + 1);
  return structures.filter((structure) => (perLayer.get(structure.layer) ?? 0) > 1);
}

/** A quiz of distinct structures, asked from the surface inward so the view only ever opens further. */
export function createAnatomyQuiz(
  structures: readonly QuizStructure[],
  random: Random,
  length: number = ANATOMY_QUIZ_LENGTH,
): QuizStructure[] {
  return shuffle(quizzable(structures), random)
    .slice(0, length)
    .sort((a, b) => a.layer - b.layer);
}

/** `answers` are the ids clicked, one per question, in order. */
export function scoreAnatomyQuiz(questions: readonly QuizStructure[], answers: readonly string[]): AnatomyQuizResult {
  const missed = questions.filter((question, index) => answers[index] !== question.id).map((question) => question.label);
  return { correct: questions.length - missed.length, total: questions.length, missed };
}
