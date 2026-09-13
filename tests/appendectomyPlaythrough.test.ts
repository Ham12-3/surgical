import { describe, expect, it } from 'vitest';
import catalogueJson from '../src/data/tools.json';
import { loadProcedure } from '../src/data/procedures';
import { woundStage } from '../src/data/procedures/appendectomyStage';
import { getZoneManifest } from '../src/data/zones';
import { pickableZoneIds } from '../src/data/zones/layers';
import { buildReport } from '../src/engine/procedure/report';
import { ProcedureRun, type ToolAction } from '../src/engine/procedure/run';
import { PROCEDURE_MODES, type ProcedureStep } from '../src/engine/procedure/types';
import { RESTING_VITALS, stepVitals } from '../src/engine/procedure/vitals';
import { parseToolCatalogue, ToolIndex } from '../src/engine/toolCatalogue';
import { CAMERA_PRESETS } from '../src/scene/cameras';

/**
 * The whole open appendectomy, played through the engine the way the
 * procedure screen plays it: the brief asks for a browser test of this, and
 * this is the part of one that does not need a browser (DECISIONS.md, D36).
 */

const tools = new ToolIndex(parseToolCatalogue(catalogueJson));
const procedure = loadProcedure('open_appendectomy', {
  toolIds: tools.ids,
  cameraPresets: Object.keys(CAMERA_PRESETS),
});
const manifest = getZoneManifest('abdomen-open');

function correctAction(step: ProcedureStep): ToolAction {
  return {
    toolId: step.instruments[0] ?? '',
    zoneId: step.target.zoneId,
    action: step.action,
    offset: 0.1,
    avoid: false,
  };
}

describe.each(PROCEDURE_MODES)('open appendectomy in %s', (mode) => {
  it('plays from the first incision to closed skin', () => {
    const run = new ProcedureRun(procedure, mode);
    let vitals = RESTING_VITALS;
    let played = 0;

    for (let step = run.step; step; step = run.step) {
      // Whatever the step is aiming at, the scene lets the student pick it.
      expect(pickableZoneIds(manifest, step.target.zoneId)?.has(step.target.zoneId)).toBe(true);
      for (let i = 0; i < 20; i += 1) {
        vitals = stepVitals(vitals, 0.5, { bleedMlPerSecond: run.bleedMlPerSecond });
        run.tick(0.5);
      }
      if (step.quiz) run.answerQuiz(step.id, step.quiz.answer);
      expect(run.perform(correctAction(step)).ok).toBe(true);
      played += 1;
    }

    expect(played).toBe(procedure.steps.length);
    const report = buildReport(procedure, mode, run.results(), vitals, run.elapsedSeconds);
    expect(report).toMatchObject({ passed: true, accuracy: 100, knowledge: 100, efficiency: 100 });
    // Only the fat bleeds, for the ten seconds that step is open.
    expect(report.bloodLossMl).toBe(10);

    const done = new Set(run.results().filter((record) => record.completed).map((record) => record.stepId));
    const stage = woundStage(done);
    expect(stage.layers.skin).toBe(0);
    expect(stage.appendixBase).toBe('removed');
  });
});

describe('open appendectomy mistakes', () => {
  it('names a slip into the small bowel while the peritoneum is opened', () => {
    const run = new ProcedureRun(procedure, 'practice');
    for (let step = run.step; step && step.id !== 'open_peritoneum'; step = run.step) run.perform(correctAction(step));
    expect(pickableZoneIds(manifest, 'peritoneum')?.has('small_bowel')).toBe(true);

    const slip = run.perform({ toolId: 'metzenbaum_scissors', zoneId: 'small_bowel', action: 'cut', offset: 0.2, avoid: true });
    expect(slip).toMatchObject({ ok: false, mistake: 'protected_structure', penalty: 40 });
    expect(slip.feedback).toMatch(/small bowel/);
  });

  it('fails an Assessment with the wrong instrument at every step', () => {
    const run = new ProcedureRun(procedure, 'assessment');
    for (let step = run.step; step; step = run.step) {
      const wrong = procedure.trayToolIds.find((toolId) => !step.instruments.includes(toolId)) ?? '';
      run.perform({ ...correctAction(step), toolId: wrong });
      run.perform(correctAction(step));
    }
    const report = buildReport(procedure, 'assessment', run.results(), RESTING_VITALS, run.elapsedSeconds);
    expect(report.passed).toBe(false);
    expect(report.review.length).toBe(procedure.steps.length);
  });
});
