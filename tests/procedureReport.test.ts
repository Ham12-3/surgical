import { describe, expect, it } from 'vitest';
import { ProcedureRun } from '../src/engine/procedure/run';
import { buildReport } from '../src/engine/procedure/report';
import { RESTING_VITALS } from '../src/engine/procedure/vitals';
import { goodClamp, goodIncision, testProcedure } from './fixtures/procedure';

/** Play the whole procedure, optionally making a mess of it first. */
function play(mode: 'learn' | 'practice' | 'assessment', spoil = false): ProcedureRun {
  const run = new ProcedureRun(testProcedure, mode);
  if (spoil) {
    run.perform({ ...goodIncision, zoneId: 'artery', avoid: true });
    run.perform({ ...goodIncision, toolId: 'kelly_clamp' });
  }
  run.answerQuiz('cut_skin', spoil ? '#15' : '#10');
  run.tick(60);
  run.perform(goodIncision);
  run.tick(60);
  run.perform(goodClamp);
  return run;
}

describe('buildReport', () => {
  it('marks a clean, quick run full', () => {
    const run = play('practice');
    const report = buildReport(testProcedure, 'practice', run.results(), RESTING_VITALS, run.elapsedSeconds);
    expect(report.score).toBe(100);
    expect(report.accuracy).toBe(100);
    expect(report.tissueHandling).toBe(100);
    expect(report.efficiency).toBe(100);
    expect(report.knowledge).toBe(100);
    expect(report.passed).toBe(true);
    expect(report.review).toEqual([]);
    expect(report.steps).toHaveLength(2);
  });

  it('marks down the headings the mistakes belong to', () => {
    const run = play('practice', true);
    const report = buildReport(testProcedure, 'practice', run.results(), { ...RESTING_VITALS, bloodLossMl: 240 }, run.elapsedSeconds);
    expect(report.accuracy).toBeLessThan(100);
    // A protected structure, so tissue handling takes the hit.
    expect(report.tissueHandling).toBe(70);
    // The wrong instrument costs a little efficiency.
    expect(report.efficiency).toBe(95);
    expect(report.knowledge).toBe(0);
    expect(report.bloodLossMl).toBe(240);
    expect(report.review[0]).toMatch(/Cut the skin/);
  });

  it('loses efficiency for taking far too long', () => {
    const run = play('practice');
    const report = buildReport(testProcedure, 'practice', run.results(), RESTING_VITALS, 30 * 60);
    expect(report.efficiency).toBe(50);
    expect(report.seconds).toBe(1800);
  });

  it('passes Learn whatever happens, and says it is not scored', () => {
    const run = play('learn', true);
    const report = buildReport(testProcedure, 'learn', run.results(), RESTING_VITALS, run.elapsedSeconds);
    expect(report.scored).toBe(false);
    expect(report.passed).toBe(true);
    expect(report.passMark).toBe(0);
    // The mistakes are still there to learn from.
    expect(report.review.length).toBeGreaterThan(0);
  });

  it('holds Assessment to the higher pass mark', () => {
    const run = play('assessment', true);
    const report = buildReport(testProcedure, 'assessment', run.results(), RESTING_VITALS, run.elapsedSeconds);
    expect(report.passMark).toBe(80);
    expect(report.passed).toBe(report.score >= 80);
  });
});
