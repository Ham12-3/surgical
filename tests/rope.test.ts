import { describe, expect, it } from 'vitest';
import { createRope, linkError, pinPoint, pointOf, releasePoint, stepRope } from '../src/engine/rope';

// What the pad's thread uses: four substeps a frame (see RopeStep.substeps).
const STEP = { gravity: 9.81, damping: 0.99, iterations: 24, substeps: 4 } as const;

describe('rope', () => {
  it('starts straight, every link at its rest length', () => {
    const rope = createRope(20, 0.01, { x: 0, y: 0.5, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(linkError(rope)).toBeCloseTo(0);
    expect(pointOf(rope, 19).x).toBeCloseTo(0.19);
  });

  it('hangs from a pinned end without stretching, and the pin holds', () => {
    const rope = createRope(20, 0.01, { x: 0, y: 0.5, z: 0 }, { x: 1, y: 0, z: 0 });
    pinPoint(rope, 0, { x: 0, y: 0.5, z: 0 });
    for (let i = 0; i < 300; i += 1) stepRope(rope, 1 / 60, STEP);
    const top = pointOf(rope, 0);
    const end = pointOf(rope, 19);
    expect(top).toEqual({ x: 0, y: 0.5, z: 0 });
    // Swung down under the pin, about its own length below it.
    expect(end.y).toBeLessThan(0.5 - 0.15);
    expect(Math.abs(end.x)).toBeLessThan(0.08);
    expect(linkError(rope)).toBeLessThan(0.05);
    expect([...rope.position].every(Number.isFinite)).toBe(true);
  });

  it('comes to rest on the floor rather than through it', () => {
    const rope = createRope(12, 0.01, { x: 0, y: 0.05, z: 0 }, { x: 1, y: 0, z: 0 });
    for (let i = 0; i < 240; i += 1) stepRope(rope, 1 / 60, { ...STEP, floor: 0 });
    for (let i = 0; i < 12; i += 1) expect(pointOf(rope, i).y).toBeGreaterThanOrEqual(-1e-9);
    expect(pointOf(rope, 6).y).toBeLessThan(0.001);
  });

  it('lets go of a released point', () => {
    const rope = createRope(5, 0.01, { x: 0, y: 0.5, z: 0 }, { x: 1, y: 0, z: 0 });
    pinPoint(rope, 4, { x: 0.04, y: 0.5, z: 0 });
    releasePoint(rope, 4);
    for (let i = 0; i < 30; i += 1) stepRope(rope, 1 / 60, STEP);
    expect(pointOf(rope, 4).y).toBeLessThan(0.5);
  });

  it('needs at least two points', () => {
    expect(() => createRope(1, 0.01, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toThrow(/two points/);
  });
});
