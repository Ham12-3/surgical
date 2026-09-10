/**
 * Core engine types.
 *
 * NOTHING in `src/engine` may import Three.js or touch the DOM. Positions cross
 * the boundary as plain numbers. This is what lets the procedure logic be
 * unit-tested without a browser or a GPU.
 *
 * Phase 1 defines the tool catalogue and the action vocabulary. Procedure and
 * step types arrive in Phase 2.
 */

/**
 * What a student can do with an instrument.
 *
 * Fixed vocabulary, deliberately small. Some real steps do not map cleanly onto
 * it — skin prep, inserting a port, tying a ligature and bagging a specimen are
 * the four that came up while writing the tool catalogue — and those currently
 * borrow the nearest fitting verb. See the note in `src/data/SCHEMA.md`.
 */
export const ACTION_TYPES = [
  'incise',
  'retract',
  'clamp',
  'cut',
  'suture',
  'irrigate',
  'inspect',
  'inject',
  'select_option',
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export function isActionType(value: string): value is ActionType {
  return (ACTION_TYPES as readonly string[]).includes(value);
}

export type ToolCategory =
  | 'prep'
  | 'injection'
  | 'cutting'
  | 'grasping'
  | 'clamping'
  | 'retracting'
  | 'suturing'
  | 'haemostasis'
  | 'irrigation'
  | 'laparoscopic';

export interface Tool {
  readonly id: string;
  readonly name: string;
  /** Fits the tray button. Kept short enough not to wrap at small sizes. */
  readonly shortName: string;
  readonly category: ToolCategory;
  /** Key into the procedural mesh builders in `src/scene/tools/toolMeshes.ts`. */
  readonly mesh: string;
  /** Actions this instrument can perform at all, before step rules apply. */
  readonly actions: readonly ActionType[];
  readonly description: string;
}

export interface ToolCatalogue {
  readonly version: number;
  readonly tools: readonly Tool[];
}
