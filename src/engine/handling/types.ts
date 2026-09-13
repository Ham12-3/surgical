/**
 * Hand skills: the moves an instrument is put through on the patient, in
 * order, once it has been aimed. A step names a sequence; the run
 * (`run.ts`) checks each move the student makes against it.
 */

export interface HandlingMove {
  readonly id: string;
  /** What the button says. */
  readonly label: string;
  /** How the hand does it, one line, shown in Learn. */
  readonly tip?: string;
  /** Times the move is made before the sequence goes on; 1 unless given. */
  readonly repeat: number;
}

/** Making `move` while `before` is still undone is this fault. */
export interface HandlingFault {
  readonly move: string;
  readonly before: string;
  readonly feedback: string;
}

export interface HandlingSequence {
  readonly id: string;
  readonly title: string;
  readonly moves: readonly HandlingMove[];
  readonly faults: readonly HandlingFault[];
  /** What a clinician still has to check (CLAUDE.md, non-negotiable 2). */
  readonly todo?: string;
}

export interface HandlingCatalogue {
  /** False until a qualified clinician has checked the sequences. */
  readonly reviewed: boolean;
  readonly references: readonly string[];
  readonly todo: readonly string[];
  readonly sequences: Readonly<Record<string, HandlingSequence>>;
}
