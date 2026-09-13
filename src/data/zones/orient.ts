/**
 * Small vector sums for zone specs pinned to landmarks (bodyLandmarks.json,
 * organLandmarks.json). Zone data may not import Three.js, and the Euler
 * angles here are worked out for three's 'XYZ' order, which the zone meshes
 * are built with (src/scene/models/zones.ts).
 */

export type Vec3 = readonly [number, number, number];

/** A landmark from JSON, which comes as a plain number array. */
export function vec3(values: readonly number[]): Vec3 {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l > 0 ? scale(a, 1 / l) : [0, 1, 0];
}

export function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return add(scale(a, 1 - t), scale(b, t));
}

/** `a` with its part along the unit vector `axis` removed. */
export function projectOnPlane(a: Vec3, axis: Vec3): Vec3 {
  return sub(a, scale(axis, dot(a, axis)));
}

/**
 * Euler XYZ turning a cylinder's +y axis onto `direction` (unit): three's
 * XYZ matrix sends +y to (-sin z, cos x cos z, sin x cos z), so
 * z = asin(-dx) and x = atan2(dz, dy), with cos z kept positive.
 */
export function cylinderRotation(direction: Vec3): Vec3 {
  const [dx, dy, dz] = normalize(direction);
  return [Math.atan2(dz, dy), 0, Math.asin(Math.max(-1, Math.min(1, -dx)))];
}

/**
 * Euler XYZ laying a box's long (x) axis along `direction` (unit): with no
 * x turn, three's XYZ matrix sends +x to (cos y cos z, sin z, -cos z sin y),
 * so z = asin(dy) and y = atan2(-dz, dx).
 */
export function boxRotationAlongX(direction: Vec3): Vec3 {
  const [dx, dy, dz] = normalize(direction);
  return [0, Math.atan2(-dz, dx), Math.asin(Math.max(-1, Math.min(1, dy)))];
}

/** Where `direction`'s x axis points once turned by `boxRotationAlongX(direction)`: the box's own x, y and z axes. */
export function boxAxes(direction: Vec3): { readonly x: Vec3; readonly y: Vec3; readonly z: Vec3 } {
  const [, ry, rz] = boxRotationAlongX(direction);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  // Columns of Rx(0) Ry(ry) Rz(rz).
  return {
    x: [cy * cz, sz, -sy * cz],
    y: [-cy * sz, cz, sy * sz],
    z: [sy, 0, cy],
  };
}
