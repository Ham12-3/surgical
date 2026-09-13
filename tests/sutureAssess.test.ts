import { describe, expect, it } from 'vitest';
import suturePadJson from '../src/data/drills/suturePad.json';
import { parseSuturePadConfig } from '../src/engine/suturing/config';
import { assessSeries, assessSuture, type SutureRecord } from '../src/engine/suturing/assess';

const config = parseSuturePadConfig(suturePadJson);

/** A suture done well on the shipped pad: square to the skin, 7 mm from the edge. */
function suture(overrides: Partial<SutureRecord> = {}): SutureRecord {
  return { alongMm: 0, plan: { entryMm: 7, angleDeg: 90 }, offCurve: false, knotHits: 3, ...overrides };
}

describe('assessSuture', () => {
  it('finds nothing wrong with a square, level, well-tied bite', () => {
    const result = assessSuture(suture(), config);
    expect(result.faults).toEqual([]);
    expect(result.score).toBe(100);
  });

  it('flags a bite that leans toward the wound as shallow, tilted and uneven', () => {
    const result = assessSuture(suture({ plan: { entryMm: 7, angleDeg: 45 } }), config);
    expect(result.faults).toEqual(['too_shallow', 'angle_toward', 'asymmetric']);
    expect(result.score).toBe(50);
  });

  it('flags a bite that leans away as too deep', () => {
    const result = assessSuture(suture({ plan: { entryMm: 7, angleDeg: 130 } }), config);
    expect(result.faults).toEqual(['too_deep', 'angle_away', 'asymmetric']);
  });

  it('flags a bite that never reaches the far edge, and does not also call it uneven', () => {
    const result = assessSuture(suture({ plan: { entryMm: 16, angleDeg: 90 } }), config);
    expect(result.faults).toEqual(['missed_far_side', 'bite_wide']);
    expect(result.score).toBe(30);
  });

  it('flags a bite close to the edge', () => {
    expect(assessSuture(suture({ plan: { entryMm: 4, angleDeg: 90 } }), config).faults).toContain('bite_narrow');
  });

  it('scores a bite beside no wound as zero', () => {
    const result = assessSuture(suture({ alongMm: 40 }), config);
    expect(result.faults).toContain('outside_wound');
    expect(result.score).toBe(0);
  });

  it('flags a dragged needle and a slipped throw', () => {
    const result = assessSuture(suture({ offCurve: true, knotHits: 2 }), config);
    expect(result.faults).toEqual(['off_curve', 'knot_loose']);
    expect(result.score).toBe(80);
  });
});

describe('assessSeries', () => {
  it('passes five even sutures', () => {
    const result = assessSeries([-20, -10, 0, 10, 20].map((alongMm) => suture({ alongMm })), config);
    expect(result.spacingsMm).toEqual([10, 10, 10, 10]);
    expect(result.faults).toEqual([]);
    expect(result.score).toBe(100);
  });

  it('measures spacing in order along the wound, whatever order they were placed in', () => {
    const result = assessSeries([10, -20, 20, 0, -10].map((alongMm) => suture({ alongMm })), config);
    expect(result.spacingsMm).toEqual([10, 10, 10, 10]);
  });

  it('flags close, wide and uneven spacing', () => {
    const result = assessSeries([-20, -17, 0, 10, 20].map((alongMm) => suture({ alongMm })), config);
    expect(result.spacingsMm).toEqual([3, 17, 10, 10]);
    expect(result.faults).toEqual(['spacing_tight', 'spacing_wide', 'spacing_uneven']);
    expect(result.score).toBe(70);
  });

  it('flags bites that go to different depths', () => {
    const records = [-20, -10, 0, 10].map((alongMm) => suture({ alongMm }));
    records.push(suture({ alongMm: 20, plan: { entryMm: 7, angleDeg: 70 } }));
    const result = assessSeries(records, config);
    expect(result.depthSpreadMm).toBeCloseTo(8 * Math.cos((70 * Math.PI) / 180));
    expect(result.faults).toEqual(['depth_uneven']);
  });

  it('scores an empty row as zero', () => {
    const result = assessSeries([], config);
    expect(result.spacingsMm).toEqual([]);
    expect(result.score).toBe(0);
  });
});
