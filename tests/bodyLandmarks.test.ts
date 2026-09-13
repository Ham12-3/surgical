import { describe, expect, it } from 'vitest';
import bodyLandmarks from '../src/data/bodyLandmarks.json';
import organLandmarks from '../src/data/organLandmarks.json';
import { abdomenOpenZones } from '../src/data/zones/abdomenOpen';
import { forearmZones } from '../src/data/zones/forearm';
import { boxAxes, boxRotationAlongX, cylinderRotation, vec3 } from '../src/data/zones/orient';

/**
 * The landmarks the body and organ builds wrote, and the zones pinned to them:
 * a rebuilt body that lands somewhere unexpected fails here rather than in the
 * theatre.
 */

const marks = bodyLandmarks.landmarks;
const TABLE_TOP_Y = 0.9;

function dist(a: readonly number[], b: readonly number[]): number {
  return Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));
}

describe('body landmarks', () => {
  it('lie in the app frame: umbilicus at z = 0, head toward -z, right toward -x, on the table', () => {
    expect(marks.umbilicus[0]).toBeCloseTo(0, 2);
    expect(marks.umbilicus[2]).toBeCloseTo(0, 2);
    expect(marks.head_top[2]).toBeLessThan(marks.neck[2] ?? 0);
    expect(marks.feet[2]).toBeGreaterThan(marks.hip_right[2] ?? 0);
    expect(marks.asis_right[0]).toBeLessThan(0);
    expect(marks.asis_left[0]).toBeGreaterThan(0);
    // Nothing sinks more than 2 cm into the pads: the back rests on the table
    // and the arm on the board.
    expect(bodyLandmarks.bounds.min[1]).toBeGreaterThan(TABLE_TOP_Y - 0.02);
    expect(bodyLandmarks.bounds.min[1]).toBeLessThan(TABLE_TOP_Y + 0.005);
    expect(marks.umbilicus[1]).toBeGreaterThan(TABLE_TOP_Y + 0.15);
  });

  it("put McBurney's point a third of the way from the right ASIS to the umbilicus, on the skin", () => {
    const expected = vec3(marks.asis_right).map((c, i) => c + ((marks.umbilicus[i] ?? 0) - c) / 3);
    expect(marks.mcburney[0]).toBeCloseTo(expected[0] ?? 0, 3);
    expect(marks.mcburney[2]).toBeCloseTo(expected[2] ?? 0, 3);
    // Raised onto the skin: between the two, not below either.
    expect(marks.mcburney[1]).toBeGreaterThan(Math.min(marks.asis_right[1] ?? 0, marks.umbilicus[1] ?? 0) - 0.005);
  });

  it('lay the right arm out along the board, straight, and resting on it', () => {
    expect(marks.shoulder_right[0]).toBeGreaterThan(marks.elbow_right[0] ?? 0);
    expect(marks.elbow_right[0]).toBeGreaterThan(marks.wrist_right[0] ?? 0);
    // The whole arm lies on one line across the table.
    expect(Math.abs((marks.wrist_right[2] ?? 0) - (marks.shoulder_right[2] ?? 0))).toBeLessThan(0.02);
    // Elbow and wrist close to the board's top, and the forearm skin above them.
    expect(marks.wrist_right[1]).toBeGreaterThan(TABLE_TOP_Y);
    expect(marks.wrist_right[1]).toBeLessThan(TABLE_TOP_Y + 0.06);
    expect(marks.forearm_right_top[1]).toBeGreaterThan(marks.elbow_right[1] ?? 0);
  });
});

describe('organ landmarks', () => {
  it("put the appendix base just under McBurney's point, 4 to 8 cm below the skin", () => {
    // A little back along the incision, so the appendix lies within the opening.
    const across = Math.hypot((organLandmarks.appendix.base[0] ?? 0) - (marks.mcburney[0] ?? 0), (organLandmarks.appendix.base[2] ?? 0) - (marks.mcburney[2] ?? 0));
    expect(across).toBeLessThan(0.02);
    const depth = (marks.mcburney[1] ?? 0) - (organLandmarks.appendix.base[1] ?? 0);
    expect(depth).toBeGreaterThan(0.04);
    expect(depth).toBeLessThan(0.08);
  });

  it('keep every organ below the abdominal wall', () => {
    const wallBottom = (marks.mcburney[1] ?? 0) - 0.037;
    for (const organ of [organLandmarks.caecum, organLandmarks.ileum, organLandmarks.appendix]) {
      expect(organ.bounds.max[1]).toBeLessThan(wallBottom + 0.005);
    }
  });

  it('give the appendix a plausible length', () => {
    const length = dist(organLandmarks.appendix.base, organLandmarks.appendix.tip);
    expect(length).toBeGreaterThan(0.03);
    expect(length).toBeLessThan(0.12);
  });
});

describe('zones pinned to the landmarks', () => {
  it('centre the abdominal zones on the landmarks', () => {
    const byId = new Map(abdomenOpenZones.zones.map((zone) => [zone.id, zone]));
    expect(byId.get('mcburney_point')?.position).toEqual(vec3(marks.mcburney));
    expect(byId.get('umbilicus')?.position).toEqual(vec3(marks.umbilicus));
    expect(byId.get('appendix_base')?.position).toEqual(vec3(organLandmarks.appendix.base));
    expect(byId.get('appendix_tip')?.position).toEqual(vec3(organLandmarks.appendix.tip));
  });

  it('centre the forearm wound on the mid-forearm skin, along the limb', () => {
    const byId = new Map(forearmZones.zones.map((zone) => [zone.id, zone]));
    const bed = byId.get('wound_bed');
    expect(bed).toBeDefined();
    expect(dist(bed?.position ?? [0, 0, 0], marks.forearm_right_top)).toBeLessThan(0.012);
    const proximal = byId.get('wound_apex_proximal')?.position ?? [0, 0, 0];
    const distal = byId.get('wound_apex_distal')?.position ?? [0, 0, 0];
    // The proximal apex is nearer the elbow, the distal nearer the wrist.
    expect(dist(proximal, marks.elbow_right)).toBeLessThan(dist(distal, marks.elbow_right));
    expect(dist(proximal, distal)).toBeCloseTo(0.09, 2);
  });
});

describe('orient', () => {
  const rotate = (euler: readonly [number, number, number], v: readonly [number, number, number]): [number, number, number] => {
    // Three's XYZ order: Rx Ry Rz applied to v.
    const [a, b, c] = euler;
    const rz = [v[0] * Math.cos(c) - v[1] * Math.sin(c), v[0] * Math.sin(c) + v[1] * Math.cos(c), v[2]];
    const ry = [rz[0]! * Math.cos(b) + rz[2]! * Math.sin(b), rz[1]!, -rz[0]! * Math.sin(b) + rz[2]! * Math.cos(b)];
    return [ry[0]!, ry[1]! * Math.cos(a) - ry[2]! * Math.sin(a), ry[1]! * Math.sin(a) + ry[2]! * Math.cos(a)];
  };

  it.each([
    [0.98, 0.17, 0.1],
    [-0.9, -0.2, -0.05],
    [0.2, 0.9, 0.3],
    [0, 0, 1],
  ] as const)('turns a cylinder and a box onto (%f, %f, %f)', (x, y, z) => {
    const length = Math.hypot(x, y, z);
    const d: [number, number, number] = [x / length, y / length, z / length];
    const cylinderAxis = rotate(cylinderRotation(d), [0, 1, 0]);
    const boxAxis = rotate(boxRotationAlongX(d), [1, 0, 0]);
    for (let i = 0; i < 3; i += 1) {
      expect(cylinderAxis[i]).toBeCloseTo(d[i]!, 5);
      expect(boxAxis[i]).toBeCloseTo(d[i]!, 5);
    }
    const axes = boxAxes(d);
    for (let i = 0; i < 3; i += 1) expect(axes.x[i]).toBeCloseTo(d[i]!, 5);
  });
});
