import type { SeriesAssessment, SutureAssessment } from '../engine/suturing/assess';
import type { SuturePadConfig, TissueLayer } from '../engine/suturing/types';
import type { SutureProgress } from '../store/sutureProgress';
import { element } from './dom';
import { biteSection, rowDiagram } from './sutureDiagrams';

/**
 * The suturing pad's side panel, piece by piece. Plain DOM builders: the pad
 * screen decides which to show; these only lay out what they are given.
 */

export type ButtonSpec = [label: string, onClick: () => void, quiet: boolean];

const LAYER_NAMES: Record<TissueLayer, string> = {
  skin: 'the skin',
  fat: 'the fat',
  fascia: 'the fascia',
  base: 'the pad backing',
};

/** A panel's header: where the student is, and the "Unreviewed content" badge (CLAUDE.md, non-negotiable 2). */
export function header(text: string): HTMLElement {
  const row = element('div', 'drill__header');
  row.append(element('span', 'drill__count', text), element('span', 'drill__badge', 'Unreviewed content'));
  return row;
}

export function prompt(title: string, instruction: string): HTMLElement[] {
  return [element('h2', 'drill__prompt', title), element('p', 'suture__hint', instruction)];
}

/** The phases of one suture before it is judged. */
export type WorkingPhase = 'aim' | 'angle' | 'drive' | 'pull' | 'knot';

export interface PhaseParts {
  /** Where the needle will go in and at what angle, kept up to date by the screen. */
  readonly readout: HTMLElement;
  /** A warning line the screen fills in, or leaves empty. */
  readonly note: HTMLElement;
  readonly knotBar: HTMLElement | null;
  readonly biteMm: SuturePadConfig['targets']['biteMm'];
  readonly throws: number;
}

/** What the panel shows during each working phase of a suture. */
export function phaseContent(phase: WorkingPhase, parts: PhaseParts): HTMLElement[] {
  switch (phase) {
    case 'aim':
      return [
        ...prompt(
          'Choose where the needle goes in',
          `Move over the near side of the wound and click. Aim for ${parts.biteMm.min} to ${parts.biteMm.max} mm from the edge.`,
        ),
        parts.readout,
        parts.note,
      ];
    case 'angle':
      return [
        ...prompt(
          "Set the needle's angle",
          'Scroll, or press the left and right arrow keys, to tilt the needle. Click or press Enter to go in; Escape to choose again.',
        ),
        parts.readout,
      ];
    case 'drive':
      return [
        ...prompt(
          'Drive the needle through',
          "Press on the needle's point and draw along the dashed curve, turning the needle rather than pushing it.",
        ),
        parts.note,
      ];
    case 'pull':
      return prompt('Drawing the thread through', 'The needle follows its curve out of the far side.');
    case 'knot':
      return [
        ...prompt('Tie the knot', `Press Space, or click, as the marker crosses the middle. ${parts.throws} throws.`),
        parts.knotBar ?? element('div'),
      ];
  }
}

export function actions(buttons: readonly ButtonSpec[]): HTMLElement {
  const row = element('div', 'drill__actions');
  for (const [label, onClick, quiet] of buttons) {
    const button = element('button', quiet ? 'drill__button drill__button--quiet' : 'drill__button', label);
    button.type = 'button';
    button.addEventListener('click', onClick);
    row.append(button);
  }
  return row;
}

/** How the needle leans as it goes in, in words. */
export function describeAngle(angleDeg: number): string {
  const lean = Math.round(angleDeg - 90);
  if (lean === 0) return 'square to the skin';
  return lean < 0 ? `${-lean}° toward the wound` : `${lean}° away from the wound`;
}

/** One suture's result: its score, what to correct, and the bite in cross-section. */
export function reviewContent(assessment: SutureAssessment, number: number, config: SuturePadConfig): HTMLElement[] {
  const { path, faults, score, record } = assessment;
  const verdict = element('div', `drill__verdict drill__verdict--${faults.length === 0 ? 'right' : 'wrong'}`);
  verdict.textContent = faults.length === 0 ? `Suture ${number}: ${score}. Nothing to correct.` : `Suture ${number}: ${score}`;
  const feedback = element('div', 'drill__feedback');
  feedback.append(verdict);
  if (faults.length > 0) {
    const list = element('ul', 'drill__list');
    for (const fault of faults) list.append(element('li', '', config.feedback[fault]));
    feedback.append(list);
  }
  const figures = element('p', 'suture__hint');
  figures.textContent = `In ${record.plan.entryMm.toFixed(1)} mm from the edge, ${describeAngle(record.plan.angleDeg)}; ${
    path.exitMm > 0 ? `out ${path.exitMm.toFixed(1)} mm from the far edge` : 'out inside the wound'
  }; ${path.depthMm.toFixed(1)} mm deep, into ${LAYER_NAMES[path.deepestLayer]}.`;
  const figure = element('figure', 'suture__figure');
  figure.append(biteSection(path, config.pad));
  return [feedback, figure, figures];
}

/** The run's result: the score, the row along the wound, and what to work on. */
export function summaryContent(series: SeriesAssessment, progress: SutureProgress, config: SuturePadConfig): HTMLElement[] {
  const score = element('div', 'drill__score', `${series.score} / 100`);
  const record = element(
    'div',
    'drill__count',
    `Best ${progress.bestScore} over ${progress.attempts} ${progress.attempts === 1 ? 'run' : 'runs'}.`,
  );
  const figure = element('figure', 'suture__figure');
  figure.append(rowDiagram(series.sutures.map((suture) => suture.record.alongMm), config.pad));
  const spacing = element('p', 'suture__hint');
  spacing.textContent = series.spacingsMm.length
    ? `Gaps between sutures: ${series.spacingsMm.map((gap) => gap.toFixed(1)).join(', ')} mm. Bite depths varied by ${series.depthSpreadMm.toFixed(1)} mm.`
    : 'Only one suture, so there is no spacing to measure.';

  const children: HTMLElement[] = [score, record, figure, spacing];
  const notes = [
    ...series.faults.map((fault) => config.feedback[fault]),
    ...series.sutures.flatMap((suture, index) =>
      suture.faults.length ? [`Suture ${index + 1} (${suture.score}): ${config.feedback[suture.faults[0] ?? 'off_curve']}`] : [],
    ),
  ];
  if (notes.length > 0) {
    children.push(element('h2', 'drill__prompt', 'Worth another look'));
    const list = element('ul', 'drill__list');
    for (const note of notes) list.append(element('li', '', note));
    children.push(list);
  } else {
    children.push(element('p', 'drill__count', 'Every suture placed without a fault.'));
  }
  return children;
}
