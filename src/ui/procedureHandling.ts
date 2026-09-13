import type { HandlingSequence } from '../engine/handling/types';
import type { ProcedureScene } from '../scene/procedureScene';
import type { Aim } from '../scene/tools/toolController';
import { HandlingBar } from './handlingBar';
import type { ProcedureSession, SessionChange } from './procedureSession';
import type { CueName } from './soundCues';

export interface HandlingHandlers {
  /** The skill is complete and the step machine has spoken. */
  onSettled: (change: SessionChange) => void;
  /** A move slipped: the panel shows the mark it cost. */
  onFault: () => void;
  onCue?: ((cue: CueName) => void) | undefined;
}

/**
 * The procedure screen's hand skills: when a click on the target starts a
 * sequence, this locks the instrument where it was aimed, shows the moves as
 * buttons, plays each move on the scene and passes it to the session, and
 * hands the outcome back once the sequence is done.
 */
export class HandlingController {
  private readonly bar: HandlingBar;

  constructor(
    host: HTMLElement,
    private readonly scene: ProcedureScene,
    private readonly session: ProcedureSession,
    private readonly sequences: Readonly<Record<string, HandlingSequence>>,
    private readonly handlers: HandlingHandlers,
  ) {
    this.bar = new HandlingBar(host);
  }

  get active(): boolean {
    return this.session.phase === 'handling';
  }

  /** The session has just entered a hand skill for the step aimed at `aim` with `toolId`. */
  start(aim: Aim): void {
    const run = this.session.handling;
    const sequence = run ? this.sequences[run.sequence.id] : undefined;
    if (!run || !sequence) return;
    this.scene.beginHandling(sequence.id, aim);
    this.bar.show(sequence, run, this.session.mode, (moveId) => this.move(moveId));
  }

  /** Leave the skill unfinished: the instrument is put down and the step stays open. */
  cancel(): void {
    this.session.abandonHandling();
    this.scene.endHandling();
    this.bar.hide();
  }

  dispose(): void {
    this.bar.dispose();
  }

  private move(moveId: string): void {
    const result = this.session.move(moveId);
    const run = this.session.handling;
    if (result.fault) {
      this.handlers.onCue?.('not_accepted');
      if (run) this.bar.update(run, this.session.mode, result.fault);
      this.handlers.onFault();
      return;
    }
    if (result.advanced) this.scene.playMove(moveId);
    if (result.change === null) {
      if (run) this.bar.update(run, this.session.mode, null);
      return;
    }
    this.bar.hide();
    // The instrument is handed back to the pointer once its last move has played.
    this.scene.endHandlingWhenSettled();
    this.handlers.onSettled(result.change);
  }
}
