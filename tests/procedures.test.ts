import { describe, expect, it } from 'vitest';
import catalogueJson from '../src/data/tools.json';
import { loadProcedure, procedureIds } from '../src/data/procedures';
import { getZoneManifest, isPatientModel } from '../src/data/zones';
import { parseToolCatalogue, ToolIndex } from '../src/engine/toolCatalogue';
import { CAMERA_PRESETS } from '../src/scene/cameras';

/**
 * The shipped procedures against the real catalogue, zones and camera presets:
 * a typo'd zone or instrument fails here rather than never matching at runtime.
 */

const tools = new ToolIndex(parseToolCatalogue(catalogueJson));
const catalogue = { toolIds: tools.ids, cameraPresets: Object.keys(CAMERA_PRESETS) };

describe.each(procedureIds)('procedure %s', (id) => {
  const procedure = loadProcedure(id, catalogue);

  it('parses against the real catalogue, zones and camera presets', () => {
    expect(procedure.id).toBe(id);
    expect(procedure.steps.length).toBeGreaterThan(0);
  });

  it('says what is still to be checked while it is unreviewed', () => {
    if (procedure.reviewed) return;
    expect(procedure.todo.length).toBeGreaterThan(0);
  });

  it('puts every instrument a step can use on the tray', () => {
    const missing = procedure.steps.flatMap((step) =>
      step.instruments.filter((toolId) => !procedure.trayToolIds.includes(toolId)).map((toolId) => `${step.id}: ${toolId}`),
    );
    expect(missing).toEqual([]);
  });

  it('only asks an instrument for an action it can do', () => {
    const wrong = procedure.steps.flatMap((step) =>
      step.instruments.filter((toolId) => !tools.supports(toolId, step.action)).map((toolId) => `${step.id}: ${toolId} ${step.action}`),
    );
    expect(wrong).toEqual([]);
  });

  it('never aims a step at a structure to protect', () => {
    expect(isPatientModel(procedure.model)).toBe(true);
    if (!isPatientModel(procedure.model)) return;
    const avoid = new Set(getZoneManifest(procedure.model).zones.filter((zone) => zone.avoid).map((zone) => zone.id));
    expect(procedure.steps.filter((step) => avoid.has(step.target.zoneId)).map((step) => step.id)).toEqual([]);
  });

  it('gives every quiz a single right answer', () => {
    for (const step of procedure.steps) {
      if (!step.quiz) continue;
      expect(new Set(step.quiz.options).size).toBe(step.quiz.options.length);
    }
  });
});
