import { describe, expect, it } from 'vitest';
import suturePadJson from '../src/data/drills/suturePad.json';
import { parseSuturePadConfig } from '../src/engine/suturing/config';
import { bitePoint, layerAt, planBite } from '../src/engine/suturing/geometry';

const config = parseSuturePadConfig(suturePadJson);
const { pad, needleRadiusMm: radius } = config;

describe('planBite', () => {
  // The shipped pad: 2 mm gap, skin 3, fat 9, fascia 2; an 8 mm needle.
  it('goes a full radius deep and comes out level when square to the skin', () => {
    const path = planBite({ entryMm: 7, angleDeg: 90 }, pad, radius);
    expect(path.entryX).toBeCloseTo(-8);
    expect(path.centreX).toBeCloseTo(0);
    expect(path.centreDepth).toBeCloseTo(0);
    expect(path.depthMm).toBeCloseTo(8);
    expect(path.deepestLayer).toBe('fat');
    expect(path.exitMm).toBeCloseTo(7);
    expect(path.sweepDeg).toBe(180);
  });

  it('stays shallow and comes out short when the needle leans toward the wound', () => {
    const path = planBite({ entryMm: 7, angleDeg: 45 }, pad, radius);
    expect(path.depthMm).toBeCloseTo(8 * (1 - Math.SQRT1_2));
    expect(path.deepestLayer).toBe('skin');
    expect(path.exitMm).toBeCloseTo(-8 + 16 * Math.SQRT1_2 - 1);
  });

  it('goes deeper when the needle leans away from the wound', () => {
    const path = planBite({ entryMm: 7, angleDeg: 130 }, pad, radius);
    expect(path.depthMm).toBeCloseTo(8 * (1 - Math.cos((130 * Math.PI) / 180)));
    expect(path.deepestLayer).toBe('fascia');
    expect(path.centreDepth).toBeGreaterThan(0);
  });

  it('comes back up inside the wound when it goes in too far from the edge', () => {
    expect(planBite({ entryMm: 16, angleDeg: 90 }, pad, radius).exitMm).toBeLessThanOrEqual(0);
  });
});

describe('bitePoint', () => {
  const path = planBite({ entryMm: 6, angleDeg: 80 }, pad, radius);

  it('starts at the entry and ends at the exit, both on the skin', () => {
    const start = bitePoint(path, 0);
    const end = bitePoint(path, 1);
    expect(start.x).toBeCloseTo(path.entryX);
    expect(start.depth).toBeCloseTo(0);
    expect(end.x).toBeCloseTo(path.exitMm + pad.woundGapMm / 2);
    expect(end.depth).toBeCloseTo(0);
  });

  it('is deepest halfway, under the arc centre', () => {
    const middle = bitePoint(path, 0.5);
    expect(middle.x).toBeCloseTo(path.centreX);
    expect(middle.depth).toBeCloseTo(path.depthMm);
  });

  it('stays below the skin all the way through', () => {
    for (let t = 0.05; t < 1; t += 0.05) expect(bitePoint(path, t).depth).toBeGreaterThan(0);
  });
});

describe('layerAt', () => {
  it('reads the layers top down, each boundary belonging to the layer above', () => {
    expect(layerAt(3, pad)).toBe('skin');
    expect(layerAt(3.01, pad)).toBe('fat');
    expect(layerAt(12, pad)).toBe('fat');
    expect(layerAt(12.5, pad)).toBe('fascia');
    expect(layerAt(14.5, pad)).toBe('base');
  });
});
