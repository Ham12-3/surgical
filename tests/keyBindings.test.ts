import { describe, expect, it } from 'vitest';
import {
  actionForKey,
  DEFAULT_KEYS,
  describeKey,
  KEY_ACTIONS,
  readKeyBindings,
  rebind,
} from '../src/store/keyBindings';

describe('key bindings', () => {
  it('finds the action for a key, whatever its case', () => {
    expect(actionForKey(DEFAULT_KEYS, '3')).toEqual({ kind: 'tool', slot: 2 });
    expect(actionForKey(DEFAULT_KEYS, '0')).toEqual({ kind: 'tool', slot: 9 });
    expect(actionForKey(DEFAULT_KEYS, 'H')).toEqual({ kind: 'hint' });
    expect(actionForKey(DEFAULT_KEYS, 'Escape')).toEqual({ kind: 'pause' });
    expect(actionForKey(DEFAULT_KEYS, 'x')).toBeNull();
  });

  it('lists every action once', () => {
    expect(KEY_ACTIONS).toHaveLength(12);
    expect(new Set(KEY_ACTIONS.map((action) => JSON.stringify(action))).size).toBe(12);
  });

  it('binds a free key', () => {
    const next = rebind(DEFAULT_KEYS, { kind: 'hint' }, 'Q');
    expect(next.hint).toBe('q');
    expect(next.tools).toEqual(DEFAULT_KEYS.tools);
  });

  it('swaps a key that is already in use', () => {
    const next = rebind(DEFAULT_KEYS, { kind: 'hint' }, '1');
    expect(next.hint).toBe('1');
    expect(next.tools[0]).toBe('h');
    const moved = rebind(DEFAULT_KEYS, { kind: 'tool', slot: 0 }, '2');
    expect(moved.tools.slice(0, 2)).toEqual(['2', '1']);
  });

  it('refuses the keys other controls use, and changes nothing for a key already bound to the action', () => {
    expect(rebind(DEFAULT_KEYS, { kind: 'pause' }, 'Enter')).toBe(DEFAULT_KEYS);
    expect(rebind(DEFAULT_KEYS, { kind: 'tool', slot: 0 }, ' ')).toBe(DEFAULT_KEYS);
    expect(rebind(DEFAULT_KEYS, { kind: 'hint' }, 'h')).toEqual(DEFAULT_KEYS);
  });

  it('names keys as the screen shows them', () => {
    expect([' ', 'Escape', 'h', 'ArrowLeft', 'F2'].map(describeKey)).toEqual(['Space', 'Esc', 'H', 'Left', 'F2']);
  });

  it('reads a stored set, or the defaults if any of it is wrong', () => {
    const swapped = rebind(DEFAULT_KEYS, { kind: 'hint' }, '1');
    expect(readKeyBindings(JSON.parse(JSON.stringify(swapped)))).toEqual(swapped);
    expect(readKeyBindings({ ...DEFAULT_KEYS, hint: 'Q' }).hint).toBe('q');
    expect(readKeyBindings({ ...DEFAULT_KEYS, hint: '1' })).toBe(DEFAULT_KEYS);
    expect(readKeyBindings({ ...DEFAULT_KEYS, tools: ['1', '2'] })).toBe(DEFAULT_KEYS);
    expect(readKeyBindings({ ...DEFAULT_KEYS, pause: 'Enter' })).toBe(DEFAULT_KEYS);
    expect(readKeyBindings('nonsense')).toBe(DEFAULT_KEYS);
  });
});
