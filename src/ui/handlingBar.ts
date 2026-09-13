import type { HandlingRun } from '../engine/handling/run';
import type { HandlingSequence } from '../engine/handling/types';
import type { ProcedureMode } from '../engine/procedure/types';
import { MODE_RULES } from '../engine/scoring';
import { element } from './dom';

/**
 * The buttons for a hand skill's moves, along the foot of the view above the
 * tray. Learn lights the move that comes next and shows how it is done;
 * Practice shows the moves in order without pointing; Assessment shows them
 * in alphabetical order, so the order itself is what is being tested.
 */
export class HandlingBar {
  readonly element = element('div', 'handling-bar');
  private readonly title = element('div', 'handling-bar__title');
  private readonly buttons = element('div', 'handling-bar__moves');
  private readonly note = element('div', 'handling-bar__note');
  private onMove: ((moveId: string) => void) | null = null;

  constructor(host: HTMLElement) {
    this.element.setAttribute('role', 'toolbar');
    this.element.setAttribute('aria-label', 'Hand skill');
    this.element.hidden = true;
    this.element.append(this.title, this.buttons, this.note);
    host.append(this.element);
  }

  show(sequence: HandlingSequence, run: HandlingRun, mode: ProcedureMode, onMove: (moveId: string) => void): void {
    this.onMove = onMove;
    this.title.textContent = sequence.title;
    const moves = MODE_RULES[mode].hints ? [...sequence.moves] : [...sequence.moves].sort((a, b) => a.label.localeCompare(b.label));
    this.buttons.replaceChildren(
      ...moves.map((move) => {
        const button = element('button', 'drill__button drill__button--quiet handling-bar__move', move.label);
        button.type = 'button';
        button.dataset['move'] = move.id;
        button.addEventListener('click', () => this.onMove?.(move.id));
        return button;
      }),
    );
    this.element.hidden = false;
    this.update(run, mode, null);
  }

  /** Reflect the run: which moves are done, which comes next, and what a slip was. */
  update(run: HandlingRun, mode: ProcedureMode, fault: string | null): void {
    const guided = MODE_RULES[mode].hints;
    for (const button of this.buttons.querySelectorAll<HTMLButtonElement>('button')) {
      const id = button.dataset['move'] ?? '';
      const status = run.status(id);
      button.classList.toggle('handling-bar__move--done', status === 'done');
      button.classList.toggle('handling-bar__move--next', guided && status === 'current');
      const move = run.sequence.moves.find((m) => m.id === id);
      if (move && move.repeat > 1 && status === 'current') button.textContent = `${move.label} (${run.countSoFar}/${move.repeat})`;
      else if (move) button.textContent = move.label;
    }
    const expected = run.expected;
    if (fault) {
      this.note.textContent = fault;
      this.note.className = 'handling-bar__note handling-bar__note--fault';
    } else if (guided && expected) {
      this.note.textContent = expected.tip ?? expected.label;
      this.note.className = 'handling-bar__note';
    } else {
      this.note.textContent = '';
      this.note.className = 'handling-bar__note';
    }
  }

  hide(): void {
    this.element.hidden = true;
    this.onMove = null;
  }

  dispose(): void {
    this.element.remove();
  }
}
