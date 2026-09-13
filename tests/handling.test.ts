import { describe, expect, it } from 'vitest';
import handlingJson from '../src/data/handling.json';
import { HandlingError, parseHandling } from '../src/engine/handling/parse';
import { HandlingRun } from '../src/engine/handling/run';

const catalogue = parseHandling(handlingJson);

describe('parseHandling', () => {
  it('accepts the shipped sequences, unreviewed and referenced', () => {
    expect(catalogue.reviewed).toBe(false);
    expect(catalogue.references.length).toBeGreaterThan(0);
    expect(Object.keys(catalogue.sequences)).toEqual(expect.arrayContaining(['prep_skin', 'infiltrate', 'irrigate', 'grasp_edge']));
    expect(catalogue.sequences['prep_skin']?.moves.find((move) => move.id === 'wipe')?.repeat).toBe(3);
    expect(catalogue.sequences['infiltrate']?.moves.map((move) => move.repeat)).toEqual([1, 1, 1, 1, 1]);
  });

  it('rejects a fault naming a move that cannot come too early', () => {
    const bad = {
      reviewed: false,
      references: ['a'],
      sequences: {
        x: {
          title: 'X',
          moves: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
          faults: [{ move: 'a', before: 'b', feedback: 'no' }],
        },
      },
    };
    expect(() => parseHandling(bad)).toThrow(HandlingError);
    expect(() => parseHandling(bad)).toThrow(/not after/);
  });

  it('rejects a duplicate move, an unknown move in a fault, and a bad repeat', () => {
    const base = { reviewed: false, references: ['a'] };
    const dup = { ...base, sequences: { x: { title: 'X', moves: [{ id: 'a', label: 'A' }, { id: 'a', label: 'A' }] } } };
    expect(() => parseHandling(dup)).toThrow(/duplicate move/);
    const unknown = { ...base, sequences: { x: { title: 'X', moves: [{ id: 'a', label: 'A' }], faults: [{ move: 'z', before: 'a', feedback: 'f' }] } } };
    expect(() => parseHandling(unknown)).toThrow(/no move "z"/);
    const repeat = { ...base, sequences: { x: { title: 'X', moves: [{ id: 'a', label: 'A', repeat: 0 }] } } };
    expect(() => parseHandling(repeat)).toThrow(/repeat/);
  });
});

describe('HandlingRun', () => {
  const infiltrate = catalogue.sequences['infiltrate']!;
  const prep = catalogue.sequences['prep_skin']!;

  it('walks the moves in order and finishes on the last', () => {
    const run = new HandlingRun(infiltrate);
    expect(run.expected?.id).toBe('position');
    for (const move of ['position', 'insert', 'aspirate', 'inject']) {
      expect(run.apply(move)).toMatchObject({ ok: true, advanced: true, done: false, fault: null });
    }
    expect(run.apply('withdraw')).toMatchObject({ ok: true, done: true });
    expect(run.done).toBe(true);
    expect(run.expected).toBeNull();
    expect(run.progress).toBe(1);
  });

  it('names an early move with the sequence\'s own wording', () => {
    const run = new HandlingRun(infiltrate);
    run.apply('position');
    run.apply('insert');
    const early = run.apply('inject');
    expect(early.ok).toBe(false);
    expect(early.fault).toMatch(/Draw back/);
    expect(run.expected?.id).toBe('aspirate');
  });

  it('falls back to a general message for an early move without its own', () => {
    const run = new HandlingRun({ id: 'x', title: 'X', faults: [], moves: [{ id: 'a', label: 'First', repeat: 1 }, { id: 'b', label: 'Second', repeat: 1 }] });
    expect(run.apply('b').fault).toMatch(/"First" comes first/);
  });

  it('counts a repeated move up to its repeat, and allows a done move again', () => {
    const run = new HandlingRun(prep);
    run.apply('lower');
    expect(run.apply('wipe')).toMatchObject({ ok: true, advanced: true, done: false });
    expect(run.countSoFar).toBe(1);
    run.apply('wipe');
    expect(run.expected?.id).toBe('wipe');
    run.apply('wipe');
    expect(run.expected?.id).toBe('lift');
    expect(run.apply('lower')).toMatchObject({ ok: true, advanced: false });
    expect(run.progress).toBeCloseTo(4 / 5, 5);
  });

  it('reports each move\'s status for the buttons', () => {
    const run = new HandlingRun(prep);
    run.apply('lower');
    expect(run.status('lower')).toBe('done');
    expect(run.status('wipe')).toBe('current');
    expect(run.status('lift')).toBe('later');
    expect(run.status('nope')).toBe('unknown');
  });

  it('ignores an unknown move and anything after completion', () => {
    const run = new HandlingRun(prep);
    expect(run.apply('nope')).toMatchObject({ ok: false, fault: null, advanced: false });
    for (const move of ['lower', 'wipe', 'wipe', 'wipe', 'lift']) run.apply(move);
    expect(run.apply('wipe')).toMatchObject({ ok: false, done: true, advanced: false });
  });
});
