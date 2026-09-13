import { describe, expect, it } from 'vitest';
import catalogueJson from '../src/data/tools.json';
import { parseToolCatalogue, ToolIndex } from '../src/engine/toolCatalogue';
import { NO_MORE_HINTS, ProcedureSession } from '../src/ui/procedureSession';
import { testProcedure } from './fixtures/procedure';

const tools = new ToolIndex(parseToolCatalogue(catalogueJson));

/** A Practice session on the second step, the one that bleeds. */
function onBleedingStep(): ProcedureSession {
  const session = new ProcedureSession(testProcedure, tools);
  session.start('practice');
  session.act('scalpel', 'skin_line', 0, false);
  session.answer('#10');
  session.continueAfterQuiz();
  return session;
}

describe('ProcedureSession', () => {
  it('waits for a mode, then plays through a question and the steps to the report', () => {
    const session = new ProcedureSession(testProcedure, tools);
    expect(session.phase).toBe('choose');
    expect(session.act('scalpel', 'skin_line', 0, false)).toBe('ignored');

    session.start('practice');
    expect(session.phase).toBe('step');
    expect(session.act('kelly_clamp', 'skin_line', 0, false)).toBe('refused');
    expect(session.outcome?.mistake).toBe('wrong_instrument');
    expect(session.act('scalpel', 'skin_line', 0.1, false)).toBe('quiz');
    expect(session.continueAfterQuiz()).toBe('ignored');
    expect(session.answer('#15')).toBe(false);
    expect(session.answer('#10')).toBeNull();
    expect(session.continueAfterQuiz()).toBe('next-step');
    expect(session.act('kelly_clamp', 'deep_layer', 0.2, false)).toBe('finished');
    expect(session.phase).toBe('report');
    expect(session.report()).toMatchObject({ mode: 'practice', knowledge: 0 });
    expect([...session.completed()]).toEqual(['cut_skin', 'clamp_vessel']);
  });

  it('bleeds only while a step is open', () => {
    const session = onBleedingStep();
    expect(session.bleedMlPerSecond).toBe(4);
    session.tick(1);
    expect(session.vitals.bloodLossMl).toBeCloseTo(4);
    session.act('kelly_clamp', 'deep_layer', 0, false);
    expect(session.bleedMlPerSecond).toBe(0);
  });

  it('stops the clock, the bleeding and every input while paused', () => {
    const idle = new ProcedureSession(testProcedure, tools);
    idle.setPaused(true);
    expect(idle.paused).toBe(false);

    const session = onBleedingStep();
    session.tick(1);
    session.setPaused(true);
    expect(session.tick(5)).toBe(false);
    expect(session.vitals.bloodLossMl).toBeCloseTo(4);
    expect(session.run?.elapsedSeconds).toBe(1);
    expect(session.act('kelly_clamp', 'deep_layer', 0, false)).toBe('ignored');
    expect(session.hint()).toBeNull();
    session.setPaused(false);
    expect(session.act('kelly_clamp', 'deep_layer', 0, false)).toBe('finished');
  });

  it('shows the hints in turn, says once that there are no more, and clears them when the step is done', () => {
    const session = new ProcedureSession(testProcedure, tools);
    session.start('learn');
    expect(session.hint()).toBe('Follow the line.');
    expect(session.hint()).toBe('One smooth stroke.');
    expect(session.hint()).toBeNull();
    expect(session.hint()).toBeNull();
    expect(session.hints).toEqual(['Follow the line.', 'One smooth stroke.', NO_MORE_HINTS]);
    session.act('scalpel', 'skin_line', 0, false);
    expect(session.hints).toEqual([]);
  });

  it('gives no hints in Assessment', () => {
    const session = new ProcedureSession(testProcedure, tools);
    session.start('assessment');
    expect(session.hint()).toBeNull();
    expect(session.hints).toEqual([]);
  });

  it('starts afresh from a finished run', () => {
    const session = onBleedingStep();
    session.tick(2);
    session.start('learn');
    expect(session.vitals.bloodLossMl).toBe(0);
    expect(session.outcome).toBeNull();
    expect(session.run?.stepNumber).toBe(1);
  });
});
