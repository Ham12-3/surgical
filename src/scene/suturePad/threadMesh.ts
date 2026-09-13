import * as THREE from 'three';
import type { Disposer } from '../disposal';

/**
 * A thin tube through a run of points, rebuilt in place every frame: the
 * thread drawn along a rope simulation (src/engine/rope.ts).
 *
 * The ring at each point is squared to the tube by carrying the previous
 * ring's orientation forward and dropping its component along the new
 * direction (parallel transport). Taking it from the curve's bend instead
 * would spin the rings wherever the thread straightens out.
 */
export class ThreadMesh {
  readonly mesh: THREE.Mesh;
  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private readonly geometry: THREE.BufferGeometry;

  constructor(
    private readonly count: number,
    private readonly radius: number,
    material: THREE.Material,
    disposer: Disposer,
    private readonly ring = 6,
  ) {
    this.positions = new Float32Array(count * ring * 3);
    this.normals = new Float32Array(count * ring * 3);
    const indices: number[] = [];
    for (let i = 0; i < count - 1; i += 1) {
      for (let j = 0; j < ring; j += 1) {
        const a = i * ring + j;
        const b = i * ring + ((j + 1) % ring);
        // Wound so the faces point outward: round the ring, then along it.
        indices.push(a, b, a + ring, b, b + ring, a + ring);
      }
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setIndex(indices);
    this.mesh = new THREE.Mesh(this.geometry, material);
    // Its bounds change every frame, and the thread is never far from the middle of the view.
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    disposer.register(this.geometry);
  }

  /** Wrap the tube round `points`: x, y, z for each of the `count` points. */
  update(points: ArrayLike<number>): void {
    const here = new THREE.Vector3();
    const ahead = new THREE.Vector3();
    const behind = new THREE.Vector3();
    const tangent = new THREE.Vector3(1, 0, 0);
    const normal = new THREE.Vector3();
    const binormal = new THREE.Vector3();
    const read = (index: number, out: THREE.Vector3): THREE.Vector3 =>
      out.set(points[index * 3] ?? 0, points[index * 3 + 1] ?? 0, points[index * 3 + 2] ?? 0);

    for (let i = 0; i < this.count; i += 1) {
      read(i, here);
      read(Math.min(i + 1, this.count - 1), ahead).sub(read(Math.max(i - 1, 0), behind));
      if (ahead.lengthSq() > 1e-18) tangent.copy(ahead).normalize();
      if (i === 0) normal.set(Math.abs(tangent.y) > 0.9 ? 1 : 0, Math.abs(tangent.y) > 0.9 ? 0 : 1, 0);
      normal.addScaledVector(tangent, -normal.dot(tangent));
      if (normal.lengthSq() < 1e-12) normal.set(0, 0, 1).addScaledVector(tangent, -tangent.z);
      normal.normalize();
      binormal.crossVectors(tangent, normal);

      for (let j = 0; j < this.ring; j += 1) {
        const angle = (j / this.ring) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const nx = normal.x * cos + binormal.x * sin;
        const ny = normal.y * cos + binormal.y * sin;
        const nz = normal.z * cos + binormal.z * sin;
        const k = (i * this.ring + j) * 3;
        this.normals[k] = nx;
        this.normals[k + 1] = ny;
        this.normals[k + 2] = nz;
        this.positions[k] = here.x + nx * this.radius;
        this.positions[k + 1] = here.y + ny * this.radius;
        this.positions[k + 2] = here.z + nz * this.radius;
      }
    }
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
  }
}
