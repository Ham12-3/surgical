import { describe, expect, it } from 'vitest';
import appendectomyJson from '../src/data/procedures/openAppendectomy.json';
import { SLIT, STAGE_STEP_IDS, WALL_LAYERS, woundStage } from '../src/data/procedures/appendectomyStage';

const stepIds = appendectomyJson.steps.map((step) => step.id);

/** Every step up to and including `id`, as a student who has just finished it. */
function through(id: string): Set<string> {
  const index = stepIds.indexOf(id);
  expect(index).toBeGreaterThanOrEqual(0);
  return new Set(stepIds.slice(0, index + 1));
}

describe('woundStage', () => {
  it('only names steps the procedure has', () => {
    expect(STAGE_STEP_IDS.filter((id) => !stepIds.includes(id))).toEqual([]);
  });

  it('starts intact', () => {
    const stage = woundStage(new Set());
    for (const layer of WALL_LAYERS) expect(stage.layers[layer]).toBe(0);
    expect(stage).toMatchObject({ caecumDelivered: false, mesoappendix: 'intact', appendixBase: 'intact' });
  });

  it('slits the skin, and holds it open once the retractor is in', () => {
    expect(woundStage(through('skin_incision')).layers).toMatchObject({ skin: SLIT, fat: 0 });
    expect(woundStage(through('split_internal_oblique')).layers).toEqual({
      skin: 1,
      fat: 1,
      externalOblique: 1,
      internalOblique: 1,
      peritoneum: 0,
    });
  });

  it('has every layer open once the peritoneum is', () => {
    const stage = woundStage(through('open_peritoneum'));
    for (const layer of WALL_LAYERS) expect(stage.layers[layer]).toBe(1);
  });

  it('shows what has been done to the appendix', () => {
    expect(woundStage(through('divide_mesoappendix'))).toMatchObject({ caecumDelivered: true, mesoappendix: 'divided' });
    expect(woundStage(through('tie_appendix_base'))).toMatchObject({ mesoappendix: 'tied', appendixBase: 'tied' });
    expect(woundStage(through('remove_appendix')).appendixBase).toBe('removed');
  });

  it('closes from the inside out', () => {
    expect(woundStage(through('close_peritoneum')).layers).toMatchObject({ peritoneum: 0, internalOblique: 1, skin: 1 });
    expect(woundStage(through('close_external_oblique')).layers).toMatchObject({ externalOblique: 0, skin: 1, fat: 1 });
  });

  it('ends closed, with the caecum back and the appendix out', () => {
    const stage = woundStage(new Set(stepIds));
    for (const layer of WALL_LAYERS) expect(stage.layers[layer]).toBe(0);
    expect(stage).toMatchObject({ caecumDelivered: false, appendixBase: 'removed' });
  });
});
