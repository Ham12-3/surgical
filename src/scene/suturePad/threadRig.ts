import * as THREE from 'three';
import type { Disposer } from '../disposal';
import type { Materials } from '../palette';
import { createRope, pinPoint, stepRope, type Rope, type RopeStep } from '../../engine/rope';
import { taperedTube } from '../geometry';
import { ThreadMesh } from './threadMesh';
import { THREAD_RADIUS } from './stitchMesh';

const LINK = 0.005;
/** The tail left behind the needle: 20 cm. */
const TAIL_POINTS = 40;
/** From where the needle came out up to the needle as it is drawn away: 6.5 cm. */
const LEAD_POINTS = 14;
const STEP: RopeStep = { gravity: 9.81, damping: 0.985, iterations: 12, substeps: 4 };

const steady = (): number => 1;

/**
 * The suture thread. Until the needle is through, a rope from its swage trails
 * over the pad. Once it is through, three pieces: the tail from where the
 * needle went in, the stretch inside the tissue (seen only across the wound),
 * and a lead from where it came out up to the needle as it is drawn away.
 */
export class ThreadRig {
  readonly group = new THREE.Group();
  private readonly tail: Rope;
  private readonly lead: Rope;
  private readonly tailMesh: ThreadMesh;
  private readonly leadMesh: ThreadMesh;
  private inside: THREE.Mesh | null = null;
  private through = false;

  constructor(
    private readonly materials: Materials,
    disposer: Disposer,
    /** Height of whatever the thread would lie on at (x, z): the pad, or the table beyond it. */
    private readonly floorAt: (x: number, z: number) => number,
  ) {
    this.group.name = 'thread';
    this.tail = createRope(TAIL_POINTS, LINK, { x: 0, y: 0.01, z: 0 }, { x: -1, y: 0, z: 0 });
    this.lead = createRope(LEAD_POINTS, LINK, { x: 0, y: 0.01, z: 0 }, { x: 1, y: 0, z: 0 });
    this.tailMesh = new ThreadMesh(TAIL_POINTS, THREAD_RADIUS, materials.suture, disposer);
    this.leadMesh = new ThreadMesh(LEAD_POINTS, THREAD_RADIUS, materials.suture, disposer);
    this.leadMesh.mesh.visible = false;
    this.group.add(this.tailMesh.mesh, this.leadMesh.mesh);
    disposer.add(() => this.clearInside());
  }

  /** Lay a fresh thread out from the swage, trailing back toward the student, for the next bite. */
  reset(swage: THREE.Vector3): void {
    for (let i = 0; i < TAIL_POINTS; i += 1) {
      const x = swage.x - LINK * i;
      const y = Math.max(swage.y - LINK * i, this.floorAt(x, swage.z) + THREAD_RADIUS);
      pinPoint(this.tail, i, { x, y, z: swage.z });
      this.tail.pinned[i] = 0;
    }
    pinPoint(this.tail, 0, swage);
    this.through = false;
    this.leadMesh.mesh.visible = false;
    this.clearInside();
  }

  /**
   * The needle is through: pin the tail where it went in, draw the thread
   * along the bite, and start the lead from where it came out to the swage.
   */
  passThrough(entry: THREE.Vector3, exit: THREE.Vector3, bite: THREE.Vector3[], swage: THREE.Vector3): void {
    pinPoint(this.tail, 0, entry);
    this.clearInside();
    this.inside = new THREE.Mesh(
      taperedTube(new THREE.CatmullRomCurve3(bite), THREAD_RADIUS, steady, 24, 6),
      this.materials.suture,
    );
    this.group.add(this.inside);

    for (let i = 0; i < LEAD_POINTS; i += 1) {
      const k = i / (LEAD_POINTS - 1);
      pinPoint(this.lead, i, {
        x: exit.x + (swage.x - exit.x) * k,
        y: exit.y + (swage.y - exit.y) * k,
        z: exit.z + (swage.z - exit.z) * k,
      });
      this.lead.pinned[i] = 0;
    }
    pinPoint(this.lead, 0, exit);
    pinPoint(this.lead, LEAD_POINTS - 1, swage);
    this.through = true;
    this.leadMesh.mesh.visible = true;
  }

  /** Keep the thread's needle end on the swage. */
  followNeedle(swage: THREE.Vector3): void {
    if (this.through) pinPoint(this.lead, LEAD_POINTS - 1, swage);
    else pinPoint(this.tail, 0, swage);
  }

  step(dt: number): void {
    stepRope(this.tail, dt, STEP);
    this.settle(this.tail);
    this.tailMesh.update(this.tail.position);
    if (this.through) {
      stepRope(this.lead, dt, STEP);
      this.settle(this.lead);
      this.leadMesh.update(this.lead.position);
    }
  }

  /** Lift any free point that has sunk into what it lies on. */
  private settle(rope: Rope): void {
    for (let i = 0; i < rope.count; i += 1) {
      if (rope.pinned[i]) continue;
      const k = i * 3;
      const floor = this.floorAt(rope.position[k] ?? 0, rope.position[k + 2] ?? 0) + THREAD_RADIUS;
      if ((rope.position[k + 1] ?? 0) < floor) rope.position[k + 1] = floor;
    }
  }

  private clearInside(): void {
    if (!this.inside) return;
    this.group.remove(this.inside);
    this.inside.geometry.dispose();
    this.inside = null;
  }
}
