import type { Tool } from './types';

/**
 * The instrument identification drill: an instrument on screen, its name to
 * pick from a short list, then what it is for.
 *
 * Pure logic with no DOM and no Three.js, so it is tested directly. Randomness
 * is passed in, and a seeded generator makes a run reproducible.
 */

export interface DrillQuestion {
  /** The instrument on screen. */
  readonly toolId: string;
  /** Tool ids to choose from, the answer among them, in display order. */
  readonly options: readonly string[];
}

export interface DrillAnswer {
  readonly toolId: string;
  readonly chosenId: string;
}

export interface DrillResult {
  readonly correct: number;
  readonly total: number;
  /** 0 to 100, rounded. */
  readonly percent: number;
  /** Tools answered wrongly, in the order they came up: what to review. */
  readonly missed: readonly string[];
}

export const DRILL_DEFAULTS = { questionCount: 10, optionCount: 4 } as const;

/** Uniform in [0, 1), like Math.random. */
export type Random = () => number;

/** Mulberry32: a small seeded generator, plenty for shuffling a quiz. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates, into a new array. */
export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const held = result[i] as T;
    result[i] = result[j] as T;
    result[j] = held;
  }
  return result;
}

/**
 * Build a drill over `tools`: one question per instrument, none repeated.
 *
 * Wrong options come from the instrument's own category first, because telling
 * a Metzenbaum from a Mayo is the lesson and telling scissors from a retractor
 * is not. A tool drawn with the same mesh as the answer is never offered: two
 * syringes that look identical on screen would make the question unanswerable.
 */
export function createDrill(
  tools: readonly Tool[],
  random: Random,
  questionCount: number = DRILL_DEFAULTS.questionCount,
  optionCount: number = DRILL_DEFAULTS.optionCount,
): DrillQuestion[] {
  const asked = shuffle(tools, random).slice(0, Math.min(questionCount, tools.length));
  return asked.map((tool) => {
    const candidates = tools.filter((other) => other.id !== tool.id && other.mesh !== tool.mesh);
    const sameCategory = shuffle(
      candidates.filter((other) => other.category === tool.category),
      random,
    );
    const elsewhere = shuffle(
      candidates.filter((other) => other.category !== tool.category),
      random,
    );
    const distractors = [...sameCategory, ...elsewhere].slice(0, optionCount - 1);
    if (distractors.length < optionCount - 1) {
      throw new Error(
        `not enough distinct instruments to give "${tool.id}" ${optionCount} options`,
      );
    }
    return {
      toolId: tool.id,
      options: shuffle([tool.id, ...distractors.map((other) => other.id)], random),
    };
  });
}

export function scoreDrill(answers: readonly DrillAnswer[]): DrillResult {
  const missed = answers.filter((answer) => answer.chosenId !== answer.toolId).map((answer) => answer.toolId);
  const correct = answers.length - missed.length;
  return {
    correct,
    total: answers.length,
    percent: answers.length === 0 ? 0 : Math.round((100 * correct) / answers.length),
    missed,
  };
}
