import type { HandlingMove, HandlingSequence } from './types';

/** What a move came to. */
export interface MoveOutcome {
  /** The move was the right one, or a harmless repeat of one already made. */
  readonly ok: boolean;
  /** Set when the move came too early: what to tell the student. */
  readonly fault: string | null;
  /** The sequence is complete. */
  readonly done: boolean;
  /** The move advanced the sequence (a repeat counts). */
  readonly advanced: boolean;
}

/**
 * One instrument being put through its sequence. Moves must come in order;
 * a move made again after it is done is allowed and changes nothing, and a
 * move made too early is a fault, with the sequence's own wording where it
 * has one for that pair.
 */
export class HandlingRun {
  private index = 0;
  private count = 0;

  constructor(readonly sequence: HandlingSequence) {}

  /** The move wanted next, or null once the sequence is complete. */
  get expected(): HandlingMove | null {
    return this.sequence.moves[this.index] ?? null;
  }

  get done(): boolean {
    return this.index >= this.sequence.moves.length;
  }

  /** Moves made so far, counting repeats, over the total wanted: 0 to 1. */
  get progress(): number {
    const total = this.sequence.moves.reduce((sum, move) => sum + move.repeat, 0);
    const made = this.sequence.moves.slice(0, this.index).reduce((sum, move) => sum + move.repeat, 0) + this.count;
    return total === 0 ? 1 : made / total;
  }

  /** Times the expected move has been made so far, for a move with repeats. */
  get countSoFar(): number {
    return this.count;
  }

  /** Whether a move is done, under way, or still to come. */
  status(moveId: string): 'done' | 'current' | 'later' | 'unknown' {
    const at = this.sequence.moves.findIndex((move) => move.id === moveId);
    if (at < 0) return 'unknown';
    if (at < this.index) return 'done';
    return at === this.index ? 'current' : 'later';
  }

  apply(moveId: string): MoveOutcome {
    const at = this.sequence.moves.findIndex((move) => move.id === moveId);
    if (at < 0 || this.done) return { ok: false, fault: null, done: this.done, advanced: false };
    if (at < this.index) return { ok: true, fault: null, done: false, advanced: false };
    if (at > this.index) return { ok: false, fault: this.faultFor(moveId), done: false, advanced: false };

    const move = this.sequence.moves[at];
    this.count += 1;
    if (move && this.count >= move.repeat) {
      this.index += 1;
      this.count = 0;
    }
    return { ok: true, fault: null, done: this.done, advanced: true };
  }

  /** The sequence's wording for making `moveId` before an undone move, else a general one. */
  private faultFor(moveId: string): string {
    const undone = new Set(this.sequence.moves.slice(this.index).map((move) => move.id));
    const rule = this.sequence.faults.find((fault) => fault.move === moveId && undone.has(fault.before));
    if (rule) return rule.feedback;
    const expected = this.expected;
    return expected ? `Not yet: "${expected.label}" comes first.` : 'The sequence is already complete.';
  }
}
