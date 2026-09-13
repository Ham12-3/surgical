import * as THREE from 'three';

/**
 * The skin's height straight above a point of the table.
 *
 * Everything laid on or cut into the patient reads the skin through this:
 * the drapes settle onto it, the wound's rim sits on it, and the cameras
 * frame it. The body model gives a `HeightField`; the code-built capsule
 * body, kept as the fallback for a model that failed to load, gives a formula.
 */
export interface SkinSurface {
  /** Metres, or null where there is no body under (x, z). */
  heightAt(x: number, z: number): number | null;
  /** Unit normal of the skin over (x, z); straight up where there is no body. */
  normalAt(x: number, z: number): THREE.Vector3;
}

export interface FieldBounds {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

/**
 * The top of a mesh rasterised from above: the highest surface over each
 * cell of a grid. Built once from the body model (27k triangles in a few
 * milliseconds), then read thousands of times by the drapes without a single
 * ray cast, which on a mesh this size would cost a millisecond each.
 */
export class HeightField implements SkinSurface {
  private constructor(
    private readonly x0: number,
    private readonly z0: number,
    private readonly cell: number,
    private readonly columns: number,
    private readonly rows: number,
    /** Row-major, NaN where nothing lies over the cell. */
    private readonly heights: Float32Array,
  ) {}

  static fromObject(root: THREE.Object3D, bounds: FieldBounds, cell = 0.01): HeightField {
    root.updateMatrixWorld(true);
    const columns = Math.max(1, Math.ceil((bounds.x1 - bounds.x0) / cell));
    const rows = Math.max(1, Math.ceil((bounds.z1 - bounds.z0) / cell));
    const heights = new Float32Array(columns * rows).fill(Number.NaN);
    const field = new HeightField(bounds.x0, bounds.z0, cell, columns, rows, heights);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry as THREE.BufferGeometry;
      const position = geometry.getAttribute('position');
      const index = geometry.getIndex();
      const count = index ? index.count : position.count;
      const at = (i: number): number => (index ? index.getX(i) : i);
      for (let i = 0; i + 2 < count; i += 3) {
        a.fromBufferAttribute(position, at(i)).applyMatrix4(object.matrixWorld);
        b.fromBufferAttribute(position, at(i + 1)).applyMatrix4(object.matrixWorld);
        c.fromBufferAttribute(position, at(i + 2)).applyMatrix4(object.matrixWorld);
        field.rasterise(a, b, c);
      }
    });
    return field;
  }

  heightAt(x: number, z: number): number | null {
    // Bilinear between the four nearest cell centres; a neighbour with nothing
    // over it takes the value of the cell under the point, so the surface does
    // not dip toward the edge of the body.
    const u = (x - this.x0) / this.cell - 0.5;
    const v = (z - this.z0) / this.cell - 0.5;
    const i = Math.floor(u);
    const j = Math.floor(v);
    const centre = this.sample(Math.round(u), Math.round(v));
    if (centre === null) return null;
    const fu = u - i;
    const fv = v - j;
    const h = (di: number, dj: number): number => this.sample(i + di, j + dj) ?? centre;
    return (h(0, 0) * (1 - fu) + h(1, 0) * fu) * (1 - fv) + (h(0, 1) * (1 - fu) + h(1, 1) * fu) * fv;
  }

  normalAt(x: number, z: number): THREE.Vector3 {
    const e = this.cell;
    const here = this.heightAt(x, z);
    if (here === null) return new THREE.Vector3(0, 1, 0);
    const slopeX = ((this.heightAt(x + e, z) ?? here) - (this.heightAt(x - e, z) ?? here)) / (2 * e);
    const slopeZ = ((this.heightAt(x, z + e) ?? here) - (this.heightAt(x, z - e) ?? here)) / (2 * e);
    return new THREE.Vector3(-slopeX, 1, -slopeZ).normalize();
  }

  private sample(i: number, j: number): number | null {
    if (i < 0 || j < 0 || i >= this.columns || j >= this.rows) return null;
    const value = this.heights[j * this.columns + i] ?? Number.NaN;
    return Number.isNaN(value) ? null : value;
  }

  private raise(i: number, j: number, y: number): void {
    if (i < 0 || j < 0 || i >= this.columns || j >= this.rows) return;
    const k = j * this.columns + i;
    const current = this.heights[k] ?? Number.NaN;
    if (Number.isNaN(current) || y > current) this.heights[k] = y;
  }

  /** The highest point of a triangle over every cell centre it covers, and over its corners' cells. */
  private rasterise(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void {
    for (const p of [a, b, c]) this.raise(Math.floor((p.x - this.x0) / this.cell), Math.floor((p.z - this.z0) / this.cell), p.y);
    const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - this.x0) / this.cell));
    const i1 = Math.min(this.columns - 1, Math.floor((Math.max(a.x, b.x, c.x) - this.x0) / this.cell));
    const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - this.z0) / this.cell));
    const j1 = Math.min(this.rows - 1, Math.floor((Math.max(a.z, b.z, c.z) - this.z0) / this.cell));
    // Barycentric coordinates in the x/z plane; a triangle seen edge on covers no cell.
    const d00 = (b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z);
    const d01 = (b.x - a.x) * (c.x - a.x) + (b.z - a.z) * (c.z - a.z);
    const d11 = (c.x - a.x) * (c.x - a.x) + (c.z - a.z) * (c.z - a.z);
    const denominator = d00 * d11 - d01 * d01;
    if (Math.abs(denominator) < 1e-12) return;
    for (let j = j0; j <= j1; j += 1) {
      const z = this.z0 + (j + 0.5) * this.cell;
      for (let i = i0; i <= i1; i += 1) {
        const x = this.x0 + (i + 0.5) * this.cell;
        const d20 = (x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z);
        const d21 = (x - a.x) * (c.x - a.x) + (z - a.z) * (c.z - a.z);
        const v = (d11 * d20 - d01 * d21) / denominator;
        const w = (d00 * d21 - d01 * d20) / denominator;
        const u = 1 - v - w;
        if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
        this.raise(i, j, u * a.y + v * b.y + w * c.y);
      }
    }
  }
}

/** A level skin at one height, for tests and for a body that did not load. */
export function flatSurface(height: number): SkinSurface {
  return { heightAt: () => height, normalAt: () => new THREE.Vector3(0, 1, 0) };
}

/**
 * A surface no steeper than cloth hangs: each point is at least as high as
 * any neighbour's height less `maxSlope` times the distance to it. Laid
 * straight on the body's height field, a sheet drops vertically at the
 * body's silhouette, and a cloth grid turns that cliff into sawteeth; this
 * is the slope the sheet falls at instead. `reach` is how far out the fall
 * is followed, in steps of `step`, along `directions` spokes.
 */
export function slopeLimited(surface: SkinSurface, maxSlope = 1.2, reach = 0.16, step = 0.016, directions = 12): SkinSurface {
  const spokes = Array.from({ length: directions }, (_, i) => {
    const angle = (i / directions) * Math.PI * 2;
    return [Math.cos(angle), Math.sin(angle)] as const;
  });
  const limited = (x: number, z: number): number | null => {
    let best = surface.heightAt(x, z);
    for (const [dx, dz] of spokes) {
      for (let distance = step; distance <= reach; distance += step) {
        const height = surface.heightAt(x + dx * distance, z + dz * distance);
        if (height === null) continue;
        const hanging = height - maxSlope * distance;
        if (best === null || hanging > best) best = hanging;
      }
    }
    return best;
  };
  return {
    heightAt: limited,
    normalAt(x, z) {
      const e = step;
      const here = limited(x, z);
      if (here === null) return new THREE.Vector3(0, 1, 0);
      const slopeX = ((limited(x + e, z) ?? here) - (limited(x - e, z) ?? here)) / (2 * e);
      const slopeZ = ((limited(x, z + e) ?? here) - (limited(x, z - e) ?? here)) / (2 * e);
      return new THREE.Vector3(-slopeX, 1, -slopeZ).normalize();
    },
  };
}

/** The higher of two surfaces, for the table under the body. */
export function highestOf(...surfaces: readonly SkinSurface[]): SkinSurface {
  return {
    heightAt(x, z) {
      let best: number | null = null;
      for (const surface of surfaces) {
        const height = surface.heightAt(x, z);
        if (height !== null && (best === null || height > best)) best = height;
      }
      return best;
    },
    normalAt(x, z) {
      let best: SkinSurface | null = null;
      let top: number | null = null;
      for (const surface of surfaces) {
        const height = surface.heightAt(x, z);
        if (height !== null && (top === null || height > top)) {
          top = height;
          best = surface;
        }
      }
      return best ? best.normalAt(x, z) : new THREE.Vector3(0, 1, 0);
    },
  };
}
