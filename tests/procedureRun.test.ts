import { describe, expect, it } from 'vitest';
import { ProcedureRun } from '../src/engine/procedure/run';
import { goodClamp, goodIncision, testProcedure } from './fixtures/procedure';

describe('ProcedureRun', () => {
  it('starts on the first step and finishes after the last', () => {
    const run = new ProcedureRun(testProcedure, 'practice');
    expect(run.step?.id).toBe('cut_skin');
    expect(run.stepNumber).toBe(1);
    const first = run.perform(goodIncision);
    expect(first).toMatchObject({ ok: true, advanced: true, finished: false });
    expect(first.explainWhy).toBe(testProcedure.steps[0]?.explanation);
    expect(run.step?.id).toBe('clamp_vessel');
    expect(run.perform(goodClamp)).toMatchObject({ ok: true, finished: true });
    expect(run.finished).toBe(true);
    expect(run.perform(goodIncision)).toMatchObject({ ok: false, finished: true });
  });

  it('names the mistake and does not advance', () => {
    const run = new ProcedureRun(testProcedure, 'practice');
    const wrongTool = run.perform({ ...goodIncision, toolId: 'kelly_clamp' });
    expect(wrongTool).toMatchObject({ ok: false, mistake: 'wrong_instrument', penalty: 15, advanced: false });
    expect(run.perform({ ...goodIncision, action: 'cut' }).mistake).toBe('wrong_action');
    expect(run.perform({ ...goodIncision, zoneId: 'deep_layer' }).mistake).toBe('wrong_place');
    expect(run.perform({ ...goodIncision, offset: 0.9 }).mistake).toBe('off_target');
    expect(run.perform({ ...goodIncision, zoneId: 'artery', avoid: true }).mistake).toBe('protected_structure');
    expect(run.step?.id).toBe('cut_skin');
  });

  it('uses the step\'s own wording for a mistake when it has one', () => {
    const run = new ProcedureRun(testProcedure, 'practice');
    expect(run.perform({ ...goodIncision, zoneId: 'deep_layer' }).feedback).toBe('Stay on the marked line.');
    expect(run.perform({ ...goodIncision, toolId: 'kelly_clamp' }).feedback).toMatch(/not the instrument/);
  });

  it('charges a repeated mistake once per step', () => {
    const run = new ProcedureRun(testProcedure, 'practice');
    expect(run.perform({ ...goodIncision, toolId: 'kelly_clamp' }).penalty).toBe(15);
    expect(run.perform({ ...goodIncision, toolId: 'toothed_forceps' }).penalty).toBe(0);
    expect(run.results()[0]?.mistakes).toEqual(['wrong_instrument']);
    expect(run.results()[0]?.attempts).toBe(2);
    expect(run.results()[0]?.score).toBe(85);
  });

  it('never charges in Learn, but still records what happened', () => {
    const run = new ProcedureRun(testProcedure, 'learn');
    expect(run.perform({ ...goodIncision, toolId: 'kelly_clamp' }).penalty).toBe(0);
    expect(run.results()[0]?.mistakes).toEqual(['wrong_instrument']);
    expect(run.results()[0]?.score).toBe(85);
  });

  it('gives hints and the target in Learn, and neither in Assessment', () => {
    const learn = new ProcedureRun(testProcedure, 'learn');
    expect(learn.suggestedTool).toBe('scalpel');
    expect(learn.highlightZone).toBe('skin_line');
    expect(learn.nextHint()).toBe('Follow the line.');
    expect(learn.nextHint()).toBe('One smooth stroke.');
    expect(learn.nextHint()).toBeNull();
    expect(learn.results()[0]?.hintsUsed).toBe(2);

    const assessment = new ProcedureRun(testProcedure, 'assessment');
    expect(assessment.suggestedTool).toBeNull();
    expect(assessment.highlightZone).toBeNull();
    expect(assessment.nextHint()).toBeNull();
  });

  it('starts the hints again on the next step', () => {
    const run = new ProcedureRun(testProcedure, 'practice');
    expect(run.nextHint()).toBe('Follow the line.');
    run.perform(goodIncision);
    expect(run.nextHint()).toBe('The clamp is instrument 3.');
  });

  it('counts time against the step that is open', () => {
    const run = new ProcedureRun(testProcedure, 'practice');
    run.tick(4);
    run.perform(goodIncision);
    run.tick(6);
    expect(run.elapsedSeconds).toBe(10);
    expect(run.results()[0]?.seconds).toBe(4);
    expect(run.results()[1]?.seconds).toBe(6);
    run.perform(goodClamp);
    run.tick(5);
    expect(run.elapsedSeconds).toBe(10);
  });

  it('records quiz answers against their step', () => {
    const run = new ProcedureRun(testProcedure, 'practice');
    expect(run.answerQuiz('cut_skin', '#15')).toBe(false);
    expect(run.answerQuiz('cut_skin', '#10')).toBe(true);
    expect(run.answerQuiz('clamp_vessel', '#10')).toBeNull();
    expect(run.results()[0]?.quizCorrect).toBe(true);
    expect(run.results()[1]?.quizCorrect).toBeNull();
  });

  it('reports what is bleeding while a step is undone', () => {
    const run = new ProcedureRun(testProcedure, 'practice');
    expect(run.bleedMlPerSecond).toBe(0);
    run.perform(goodIncision);
    expect(run.bleedMlPerSecond).toBe(4);
    run.perform(goodClamp);
    expect(run.bleedMlPerSecond).toBe(0);
  });
});
