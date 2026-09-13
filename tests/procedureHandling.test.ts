import { describe, expect, it } from 'vitest';
import handlingJson from '../src/data/handling.json';
import catalogueJson from '../src/data/tools.json';
import { parseHandling } from '../src/engine/handling/parse';
import { parseProcedure } from '../src/engine/procedure/parse';
import { parseToolCatalogue, ToolIndex } from '../src/engine/toolCatalogue';
import { ProcedureSession } from '../src/ui/procedureSession';
import { rawProcedure, testContext } from './fixtures/procedure';

/** The session with a hand skill on a step: the aim first, then the moves, then the step. */

const tools = new ToolIndex(parseToolCatalogue(catalogueJson));
const sequences = parseHandling(handlingJson).sequences;

const withSkill = (() => {
  const steps = JSON.parse(JSON.stringify(rawProcedure.steps)) as Array<Record<string, unknown>>;
  steps[0] = { ...steps[0], handling: 'prep_skin' };
  return parseProcedure({ ...rawProcedure, steps }, testContext);
})();

function started(mode: 'learn' | 'practice' | 'assessment' = 'practice'): ProcedureSession {
  const session = new ProcedureSession(withSkill, tools, sequences);
  session.start(mode);
  return session;
}

describe('a step with a hand skill', () => {
  it('starts the skill on a good aim and records the step only once it is done', () => {
    const session = started();
    expect(session.act('scalpel', 'skin_line', 0.1, false)).toBe('handling');
    expect(session.phase).toBe('handling');
    expect(session.handling?.expected?.id).toBe('lower');
    expect(session.completed().size).toBe(0);
    expect(session.move('lower')).toMatchObject({ ok: true, advanced: true, change: null, penalty: 0 });
    for (let i = 0; i < 3; i += 1) session.move('wipe');
    const last = session.move('lift');
    expect(last.done).toBe(true);
    // The first fixture step has a quiz, so the skill's completion leads there.
    expect(last.change).toBe('quiz');
    expect(session.phase).toBe('quiz');
    expect(session.completed().has('cut_skin')).toBe(true);
  });

  it('refuses a bad aim before any move, as an ordinary click would', () => {
    const session = started();
    expect(session.act('kelly_clamp', 'skin_line', 0.1, false)).toBe('refused');
    expect(session.outcome?.mistake).toBe('wrong_instrument');
    expect(session.phase).toBe('step');
  });

  it('charges an early move once as poor handling, and the skill goes on', () => {
    const session = started();
    session.act('scalpel', 'skin_line', 0.1, false);
    const slip = session.move('wipe');
    expect(slip).toMatchObject({ ok: false, penalty: 10 });
    expect(slip.fault).toMatch(/Lower it first/);
    expect(session.fault).toMatch(/Lower it first/);
    expect(session.move('lift')).toMatchObject({ ok: false, penalty: 0 });
    expect(session.move('lower')).toMatchObject({ ok: true, penalty: 0 });
    expect(session.fault).toBeNull();
    for (let i = 0; i < 3; i += 1) session.move('wipe');
    session.move('lift');
    expect(session.run?.results()[0]?.mistakes).toEqual(['poor_handling']);
    expect(session.run?.results()[0]?.score).toBe(90);
  });

  it('costs nothing in Learn but is still recorded', () => {
    const session = started('learn');
    session.act('scalpel', 'skin_line', 0.1, false);
    expect(session.move('lift').penalty).toBe(0);
    expect(session.run?.results()[0]?.mistakes).toEqual(['poor_handling']);
  });

  it('keeps the clock running and ignores clicks and moves while paused', () => {
    const session = started();
    session.act('scalpel', 'skin_line', 0.1, false);
    expect(session.tick(2)).toBe(true);
    session.setPaused(true);
    expect(session.move('lower').ok).toBe(false);
    expect(session.tick(2)).toBe(false);
    session.setPaused(false);
    expect(session.act('scalpel', 'skin_line', 0.1, false)).toBe('ignored');
    expect(session.move('lower').ok).toBe(true);
  });

  it('can be abandoned, leaving the step open to be aimed again', () => {
    const session = started();
    session.act('scalpel', 'skin_line', 0.1, false);
    session.move('lower');
    session.abandonHandling();
    expect(session.phase).toBe('step');
    expect(session.handling).toBeNull();
    expect(session.act('scalpel', 'skin_line', 0.1, false)).toBe('handling');
    expect(session.handling?.expected?.id).toBe('lower');
  });

  it('plays a step whose skill is not in the catalogue as an ordinary click', () => {
    const session = new ProcedureSession(withSkill, tools, {});
    session.start('practice');
    expect(session.act('scalpel', 'skin_line', 0.1, false)).toBe('quiz');
  });
});
