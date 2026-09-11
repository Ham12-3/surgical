import { describe, expect, it } from 'vitest';
import { isThrowHit, markerPosition } from '../src/engine/suturing/knot';

const SPEC = { throws: 3, periodMs: 1600, window: 0.2 };

describe('markerPosition', () => {
  it('sweeps from one end to the other and back at a steady speed', () => {
    expect(markerPosition(0, 1600)).toBeCloseTo(-1);
    expect(markerPosition(400, 1600)).toBeCloseTo(0);
    expect(markerPosition(800, 1600)).toBeCloseTo(1);
    expect(markerPosition(1200, 1600)).toBeCloseTo(0);
    expect(markerPosition(1600, 1600)).toBeCloseTo(-1);
  });

  it('keeps sweeping for times before the start', () => {
    expect(markerPosition(-400, 1600)).toBeCloseTo(0);
  });
});

describe('isThrowHit', () => {
  it('lands only while the marker is inside the middle window', () => {
    expect(isThrowHit(400, SPEC)).toBe(true);
    expect(isThrowHit(1200, SPEC)).toBe(true);
    expect(isThrowHit(470, SPEC)).toBe(true);
    expect(isThrowHit(500, SPEC)).toBe(false);
    expect(isThrowHit(0, SPEC)).toBe(false);
  });
});
