import { describe, expect, it } from 'vitest';
import { advanceDrive } from '../src/engine/suturing/drive';

// A path along the x axis, 100 px long, sampled every 10 px.
const path = Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 0 }));

describe('advanceDrive', () => {
  it('moves the tip to where the pointer has got along the path', () => {
    expect(advanceDrive(path, { x: 20, y: 3 }, 0, 8)).toEqual({ progress: 0.2, offCurve: false });
  });

  it('never moves the tip backward', () => {
    expect(advanceDrive(path, { x: 30, y: 0 }, 0.6, 8).progress).toBe(0.6);
  });

  it('cannot skip ahead more than a jump at a time', () => {
    expect(advanceDrive(path, { x: 90, y: 0 }, 0, 8).progress).toBeCloseTo(0.2);
    expect(advanceDrive(path, { x: 90, y: 0 }, 0, 8, 1).progress).toBeCloseTo(0.9);
  });

  it('holds the tip and reports it when the pointer leaves the path', () => {
    expect(advanceDrive(path, { x: 50, y: 30 }, 0.4, 8)).toEqual({ progress: 0.4, offCurve: true });
  });

  it('finishes at 1', () => {
    expect(advanceDrive(path, { x: 100, y: 0 }, 0.9, 8).progress).toBe(1);
  });
});
