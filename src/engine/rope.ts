/**
 * A thread as a chain of points joined by links of fixed length, stepped
 * with Verlet integration: each point keeps its last position, so its speed
 * is implicit and a constraint that moves a point also changes its speed.
 * The links are then relaxed a few times a step. That is stable at game
 * frame rates and needs no springs, the brief's "simple rope physics".
 *
 * Plain numbers and no Three.js, so it is tested directly. Units are the
 * caller's (the scene uses metres, y up).
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Rope {
  readonly count: number;
  /** Rest length of each link. */
  readonly segment: number;
  /** x, y, z of each point in turn. */
  readonly position: Float64Array;
  readonly previous: Float64Array;
  /** 1 where a point is held in place (by the needle, or where it passes through tissue). */
  readonly pinned: Uint8Array;
}

export interface RopeStep {
  /** Downward acceleration, in the caller's units per second squared. */
  readonly gravity: number;
  /** Speed kept from one step to the next, just below 1. */
  readonly damping: number;
  /** Times the links are relaxed each substep; more is stiffer. */
  readonly iterations: number;
  /**
   * Steps each frame is split into. Gravity moves a point g dt^2 in a step,
   * over a quarter of a centimetre link at 60 frames a second, more than the
   * relaxation can take back; four substeps make that a sixteenth.
   */
  readonly substeps?: number;
  /** Nothing unpinned goes below this height: the surface the thread lies on. */
  readonly floor?: number;
}

/** A straight rope of `count` points from `start`, laid out along `direction`. */
export function createRope(count: number, segment: number, start: Vec3, direction: Vec3): Rope {
  if (count < 2) throw new Error('a rope needs at least two points');
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const position = new Float64Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    position[i * 3] = start.x + (direction.x / length) * segment * i;
    position[i * 3 + 1] = start.y + (direction.y / length) * segment * i;
    position[i * 3 + 2] = start.z + (direction.z / length) * segment * i;
  }
  return { count, segment, position, previous: position.slice(), pinned: new Uint8Array(count) };
}

export function pointOf(rope: Rope, index: number): Vec3 {
  const k = index * 3;
  return { x: rope.position[k] ?? 0, y: rope.position[k + 1] ?? 0, z: rope.position[k + 2] ?? 0 };
}

/** Hold point `index` at `point`, at rest there, until released. */
export function pinPoint(rope: Rope, index: number, point: Vec3): void {
  const k = index * 3;
  rope.position[k] = point.x;
  rope.position[k + 1] = point.y;
  rope.position[k + 2] = point.z;
  rope.previous[k] = point.x;
  rope.previous[k + 1] = point.y;
  rope.previous[k + 2] = point.z;
  rope.pinned[index] = 1;
}

export function releasePoint(rope: Rope, index: number): void {
  rope.pinned[index] = 0;
}

export function stepRope(rope: Rope, dt: number, step: RopeStep): void {
  const substeps = Math.max(1, Math.floor(step.substeps ?? 1));
  for (let s = 0; s < substeps; s += 1) substep(rope, dt / substeps, step);
}

function substep(rope: Rope, dt: number, step: RopeStep): void {
  const { position: p, previous: q, pinned, count } = rope;
  const drop = step.gravity * dt * dt;

  for (let i = 0; i < count; i += 1) {
    if (pinned[i]) continue;
    for (let axis = 0; axis < 3; axis += 1) {
      const k = i * 3 + axis;
      const now = p[k] ?? 0;
      const before = q[k] ?? 0;
      q[k] = now;
      p[k] = now + (now - before) * step.damping - (axis === 1 ? drop : 0);
    }
  }

  for (let pass = 0; pass < step.iterations; pass += 1) {
    // Sweep the links each way in turn, so a correction travels the whole
    // chain in a pass or two whichever end is pinned.
    const forward = pass % 2 === 0;
    for (let n = 0; n < count - 1; n += 1) relaxLink(rope, forward ? n : count - 2 - n);
    if (step.floor !== undefined) {
      for (let i = 0; i < count; i += 1) {
        const k = i * 3 + 1;
        if (!pinned[i] && (p[k] ?? 0) < step.floor) p[k] = step.floor;
      }
    }
  }
}

/** Move the two ends of link `i` to its rest length, all of it onto a free end when the other is pinned. */
function relaxLink(rope: Rope, i: number): void {
  const { position: p, pinned, segment } = rope;
  const weightA = pinned[i] ? 0 : 1;
  const weightB = pinned[i + 1] ? 0 : 1;
  if (weightA + weightB === 0) return;
  const a = i * 3;
  const b = a + 3;
  const dx = (p[b] ?? 0) - (p[a] ?? 0);
  const dy = (p[b + 1] ?? 0) - (p[a + 1] ?? 0);
  const dz = (p[b + 2] ?? 0) - (p[a + 2] ?? 0);
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 1e-12) return;
  const shift = (distance - segment) / distance / (weightA + weightB);
  p[a] = (p[a] ?? 0) + dx * shift * weightA;
  p[a + 1] = (p[a + 1] ?? 0) + dy * shift * weightA;
  p[a + 2] = (p[a + 2] ?? 0) + dz * shift * weightA;
  p[b] = (p[b] ?? 0) - dx * shift * weightB;
  p[b + 1] = (p[b + 1] ?? 0) - dy * shift * weightB;
  p[b + 2] = (p[b + 2] ?? 0) - dz * shift * weightB;
}

/** The worst link's stretch or slack, as a fraction of its rest length. */
export function linkError(rope: Rope): number {
  let worst = 0;
  for (let i = 0; i < rope.count - 1; i += 1) {
    const a = pointOf(rope, i);
    const b = pointOf(rope, i + 1);
    const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    worst = Math.max(worst, Math.abs(length - rope.segment) / rope.segment);
  }
  return worst;
}
