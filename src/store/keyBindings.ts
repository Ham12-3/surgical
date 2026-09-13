/**
 * Remappable keys, which the brief asks for: the ten instrument slots on the
 * tray, asking for a hint, and pausing a procedure. Pure, so rebinding and
 * reading a stored set are tested without a browser.
 *
 * A key does one thing: binding a key that is already in use swaps the two.
 */

export const TOOL_SLOT_COUNT = 10;

export interface KeyBindings {
  /** Keys for the tray's first ten instruments, in tray order. */
  readonly tools: readonly string[];
  readonly hint: string;
  readonly pause: string;
}

export type KeyAction =
  | { readonly kind: 'tool'; readonly slot: number }
  | { readonly kind: 'hint' }
  | { readonly kind: 'pause' };

export const DEFAULT_KEYS: KeyBindings = {
  tools: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  hint: 'h',
  pause: 'Escape',
};

export const KEY_ACTIONS: readonly KeyAction[] = [
  ...Array.from({ length: TOOL_SLOT_COUNT }, (_, slot): KeyAction => ({ kind: 'tool', slot })),
  { kind: 'hint' },
  { kind: 'pause' },
];

/**
 * Keys that cannot be bound: Enter and Space answer and move on in the drills
 * and dialogs, Tab moves focus, and modifiers are not keys on their own.
 */
const RESERVED = new Set(['Enter', ' ', 'Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Dead', 'Unidentified', 'Process']);

/** Letters are bound whatever their case, so Shift or Caps Lock never breaks a binding. */
export function normaliseKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

export function isBindable(key: string): boolean {
  const normal = normaliseKey(key);
  return normal.length > 0 && !RESERVED.has(normal);
}

export function sameAction(a: KeyAction, b: KeyAction): boolean {
  if (a.kind === 'tool' && b.kind === 'tool') return a.slot === b.slot;
  return a.kind === b.kind;
}

export function keyFor(bindings: KeyBindings, action: KeyAction): string {
  switch (action.kind) {
    case 'tool':
      return bindings.tools[action.slot] ?? '';
    case 'hint':
      return bindings.hint;
    case 'pause':
      return bindings.pause;
  }
}

export function actionForKey(bindings: KeyBindings, key: string): KeyAction | null {
  const normal = normaliseKey(key);
  return KEY_ACTIONS.find((action) => keyFor(bindings, action) === normal) ?? null;
}

function withKey(bindings: KeyBindings, action: KeyAction, key: string): KeyBindings {
  switch (action.kind) {
    case 'tool':
      return { ...bindings, tools: bindings.tools.map((current, slot) => (slot === action.slot ? key : current)) };
    case 'hint':
      return { ...bindings, hint: key };
    case 'pause':
      return { ...bindings, pause: key };
  }
}

/** Bind `key` to `action`. A key in use moves the other action onto this one's old key; a reserved key changes nothing. */
export function rebind(bindings: KeyBindings, action: KeyAction, key: string): KeyBindings {
  if (!isBindable(key)) return bindings;
  const normal = normaliseKey(key);
  const previous = keyFor(bindings, action);
  const holder = actionForKey(bindings, normal);
  const next = withKey(bindings, action, normal);
  return holder && !sameAction(holder, action) ? withKey(next, holder, previous) : next;
}

/** A key's name as the screen shows it. */
export function describeKey(key: string): string {
  if (key === ' ') return 'Space';
  if (key === 'Escape') return 'Esc';
  if (key.startsWith('Arrow')) return key.slice('Arrow'.length);
  return key.length === 1 ? key.toUpperCase() : key;
}

/** A stored set of bindings, or the defaults if any of it is missing, reserved or used twice. */
export function readKeyBindings(raw: unknown): KeyBindings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_KEYS;
  const record = raw as Record<string, unknown>;
  const tools = record['tools'];
  if (!Array.isArray(tools) || tools.length !== TOOL_SLOT_COUNT) return DEFAULT_KEYS;
  const keys: unknown[] = [...tools, record['hint'], record['pause']];
  if (!keys.every((key): key is string => typeof key === 'string' && isBindable(key))) return DEFAULT_KEYS;
  const normal = keys.map(normaliseKey);
  if (new Set(normal).size !== normal.length) return DEFAULT_KEYS;
  return {
    tools: normal.slice(0, TOOL_SLOT_COUNT),
    hint: normal[TOOL_SLOT_COUNT] ?? DEFAULT_KEYS.hint,
    pause: normal[TOOL_SLOT_COUNT + 1] ?? DEFAULT_KEYS.pause,
  };
}
