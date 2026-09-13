import type { Report } from '../engine/procedure/report';
import type { MistakeCode, StepOutcome } from '../engine/procedure/run';
import { PROCEDURE_MODES, type Procedure, type ProcedureMode, type ProcedureStep } from '../engine/procedure/types';
import { describeVitals, type VitalsState } from '../engine/procedure/vitals';
import { MODE_RULES } from '../engine/scoring';
import { element } from './dom';
import { DISCLAIMER_TEXT } from './disclaimer';
import { actions, prompt, type ButtonSpec } from './suturePadPanels';

/**
 * The procedure screen's side panel, piece by piece: choosing a mode, the step
 * under way, a step's question, and the report card. Plain DOM builders; the
 * screen decides which to show.
 */

const MODE_TEXT: Record<ProcedureMode, { readonly title: string; readonly description: string }> = {
  learn: {
    title: 'Learn',
    description: 'Guided. The target is highlighted, instruments are named and hints are there when you ask. Not marked.',
  },
  practice: {
    title: 'Practice',
    description: `Hints when you ask, and a mark at the end. Pass mark ${MODE_RULES.practice.passMark}.`,
  },
  assessment: {
    title: 'Assessment',
    description: `No hints, no highlighting, and the instruments are not named. Pass mark ${MODE_RULES.assessment.passMark}.`,
  },
};

const MISTAKE_TEXT: Record<MistakeCode, string> = {
  protected_structure: 'a structure to protect',
  wrong_instrument: 'wrong instrument',
  wrong_action: 'wrong action',
  wrong_place: 'wrong place',
  off_target: 'off target',
};

export function modeTitle(mode: ProcedureMode): string {
  return MODE_TEXT[mode].title;
}

export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** The monitor's readings and, in the timed modes, the clock. */
export function readoutLines(vitals: VitalsState, seconds: number | null): HTMLElement[] {
  const lines = [element('div', '', describeVitals(vitals)), element('div', '', `Blood lost: ${Math.round(vitals.bloodLossMl)} ml`)];
  if (seconds !== null) lines.push(element('div', '', `Time: ${formatTime(seconds)}`));
  return lines;
}

/** Why a mode cannot be chosen yet (progression.ts, isModeUnlocked). */
export const LOCKED_TEXT = 'Opens once you have finished this procedure in Learn or Practice.';

/** Before a run: what the procedure is, the three modes, and what is still to be checked. */
export function modeChoice(
  procedure: Procedure,
  onPick: (mode: ProcedureMode) => void,
  isUnlocked: (mode: ProcedureMode) => boolean = () => true,
): HTMLElement[] {
  const intro = element(
    'p',
    'suture__hint',
    `${procedure.steps.length} steps, about ${procedure.estimatedMinutes} minutes. Pick up an instrument from the tray, or press its number, then click where it acts.`,
  );
  const options = element('div', 'drill__options');
  for (const mode of PROCEDURE_MODES) {
    const button = element('button', 'drill__option procedure__mode');
    button.type = 'button';
    const open = isUnlocked(mode);
    button.disabled = !open;
    const text = open ? MODE_TEXT[mode].description : LOCKED_TEXT;
    button.append(element('strong', '', MODE_TEXT[mode].title), element('span', 'procedure__mode-text', text));
    button.addEventListener('click', () => onPick(mode));
    options.append(button);
  }
  const flagged = procedure.steps.filter((step) => step.todo).length;
  const caution = element(
    'p',
    'suture__hint suture__warn',
    procedure.reviewed
      ? ''
      : `Not yet checked by a clinician. ${flagged} of the steps, and ${procedure.todo.length} points about the whole procedure, are flagged for review.`,
  );
  const references = element('ul', 'drill__list');
  for (const reference of procedure.references) references.append(element('li', '', reference));
  return [element('h2', 'drill__prompt', procedure.title), intro, options, caution, element('div', 'drill__count', 'Further reading'), references];
}

export interface StepFeedback {
  readonly ok: boolean;
  readonly text: string;
  /** Why the step just finished matters, where the mode shows it. */
  readonly why: string | null;
}

/** What to tell the student about a click. Assessment says whether a step was accepted and nothing about why. */
export function describeOutcome(outcome: StepOutcome, mode: ProcedureMode): StepFeedback {
  if (mode === 'assessment') return { ok: outcome.ok, text: outcome.ok ? 'Step done.' : 'Not accepted.', why: null };
  return { ok: outcome.ok, text: outcome.feedback, why: outcome.ok ? outcome.explainWhy : null };
}

export function feedbackBox(feedback: StepFeedback): HTMLElement {
  const box = element('div', 'drill__feedback');
  box.append(element('div', `drill__verdict drill__verdict--${feedback.ok ? 'right' : 'wrong'}`, feedback.text));
  if (feedback.why) box.append(element('p', 'suture__hint', feedback.why));
  return box;
}

export interface StepView {
  readonly procedure: Procedure;
  readonly step: ProcedureStep;
  readonly mode: ProcedureMode;
  readonly completed: ReadonlySet<string>;
  readonly feedback: StepFeedback | null;
  readonly hints: readonly string[];
  /** The instrument to name, in the modes that name it. */
  readonly suggestedTool: string | null;
  /** Lines the screen keeps up to date between renders. */
  readonly readouts: HTMLElement;
  readonly zone: HTMLElement;
}

export function stepContent(view: StepView): HTMLElement[] {
  const children: HTMLElement[] = [...prompt(view.step.title, view.step.objective)];
  if (view.suggestedTool) children.push(element('p', 'drill__count', `Instrument: ${view.suggestedTool}`));
  children.push(view.zone);
  if (view.feedback) children.push(feedbackBox(view.feedback));
  if (view.hints.length > 0) {
    const list = element('ul', 'drill__list');
    for (const hint of view.hints) list.append(element('li', '', hint));
    children.push(list);
  }
  children.push(view.readouts, stepList(view));
  return children;
}

/** The steps so far and the one under way; the steps still to come only where the mode shows the way. */
function stepList(view: StepView): HTMLElement {
  const showAhead = MODE_RULES[view.mode].hints;
  const list = element('ol', 'procedure__steps');
  view.procedure.steps.forEach((step, index) => {
    const done = view.completed.has(step.id);
    const current = step.id === view.step.id;
    if (!showAhead && !done && !current) return;
    const state = done ? ' procedure__step--done' : current ? ' procedure__step--current' : '';
    list.append(element('li', `procedure__step${state}`, `${index + 1}. ${step.title}`));
  });
  return list;
}

export interface QuizView {
  readonly step: ProcedureStep;
  readonly chosen: string | null;
  /** Show which answer was right; Assessment only records the answer. */
  readonly reveal: boolean;
  readonly onAnswer: (option: string) => void;
}

export function quizContent(view: QuizView): HTMLElement[] {
  const quiz = view.step.quiz;
  if (!quiz) return [];
  const options = element('div', 'drill__options');
  for (const option of quiz.options) {
    const button = element('button', 'drill__option', option);
    button.type = 'button';
    if (view.chosen !== null) {
      button.disabled = true;
      if (view.reveal && option === quiz.answer) button.classList.add('drill__option--right');
      else if (option === view.chosen) button.classList.add(view.reveal ? 'drill__option--wrong' : 'procedure__option--chosen');
    }
    button.addEventListener('click', () => view.onAnswer(option));
    options.append(button);
  }
  const children = [...prompt('Question', quiz.question), options];
  if (view.chosen !== null) {
    const verdict = !view.reveal ? 'Answer recorded.' : view.chosen === quiz.answer ? 'Right.' : `The answer is: ${quiz.answer}.`;
    children.push(element('p', 'suture__hint', verdict));
  }
  return children;
}

/** The report card: the mark, the four headings, each step, and what to go over again. */
export function reportContent(report: Report): HTMLElement[] {
  const children: HTMLElement[] = [];
  if (report.scored) {
    children.push(element('div', 'drill__score', `${report.score} / 100`));
    const verdict = report.passed ? `Passed. The pass mark is ${report.passMark}.` : `Not a pass yet. The pass mark is ${report.passMark}.`;
    children.push(element('div', `drill__verdict drill__verdict--${report.passed ? 'right' : 'wrong'}`, verdict));
  } else {
    children.push(element('p', 'suture__hint', 'Learn is not marked. The breakdown shows what to look at again.'));
  }

  const scores = element('dl', 'procedure__scores');
  const headings: ReadonlyArray<readonly [string, number]> = [
    ['Accuracy', report.accuracy],
    ['Tissue handling', report.tissueHandling],
    ['Efficiency', report.efficiency],
    ['Knowledge', report.knowledge],
  ];
  for (const [label, value] of headings) scores.append(element('dt', '', label), element('dd', '', String(value)));
  children.push(scores);
  children.push(element('p', 'drill__count', `Time ${formatTime(report.seconds)}. Blood lost ${report.bloodLossMl} ml (a schematic figure).`));

  const steps = element('ol', 'procedure__steps');
  for (const line of report.steps) {
    const item = element('li', `procedure__step${line.mistakes.length ? ' procedure__step--missed' : ' procedure__step--done'}`);
    const note = line.mistakes.map((code) => MISTAKE_TEXT[code]).join(', ');
    item.append(element('span', '', line.title), element('span', 'procedure__step-score', note ? `${line.score}: ${note}` : String(line.score)));
    steps.append(item);
  }
  children.push(element('h2', 'drill__prompt', 'Step by step'), steps);

  if (report.review.length > 0) {
    const review = element('ul', 'drill__list');
    for (const text of report.review) review.append(element('li', '', text));
    children.push(element('h2', 'drill__prompt', 'What to review'), review);
  }
  return children;
}

/** The pause menu over the whole screen, with the disclaimer (CLAUDE.md, non-negotiable 1). */
export function pauseOverlay(buttons: readonly ButtonSpec[]): HTMLElement {
  const overlay = element('div', 'modal');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Paused');
  const card = element('div', 'modal__card');
  card.append(
    element('h2', 'drill__prompt', 'Paused'),
    element('p', 'suture__hint', 'The clock and the vitals have stopped.'),
    element('p', 'suture__hint suture__warn', DISCLAIMER_TEXT),
    actions(buttons),
  );
  overlay.append(card);
  return overlay;
}
