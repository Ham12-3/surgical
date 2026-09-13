import * as THREE from 'three';
import { FOREARM_ROTATION, FOREARM_WOUND_CENTRE } from '../../data/zones/forearm';
import { bothEnds, taperedTube } from '../geometry';
import type { Materials } from '../palette';

/**
 * The laceration: a dark bed between two pale, everted edges, running 9 cm
 * along the forearm and closing to a point at each apex, on the skin at the
 * wound centre the zones use.
 *
 * Built from tapered tubes on a gently wandering path. A laceration is never
 * ruler-straight, and that wander does more for realism than any amount of
 * surface detail. It stays within about 2 mm of the midline, so the wound
 * never strays out of its hit-test zones. The edges sit just proud of the
 * skin and the bed a little lower between them. Deliberately clean and
 * shallow: the teaching point is two edges that need approximating, not an
 * injury.
 *
 * Grasped with forceps, the near edge lifts and turns outward (`evert`).
 */
const WOUND_WANDER = [0, 0.0016, -0.0008, 0.0014, 0] as const;

function woundPath(offsetZ: number): THREE.CatmullRomCurve3 {
  const xs = [-0.046, -0.023, 0, 0.023, 0.046];
  return new THREE.CatmullRomCurve3(xs.map((x, i) => new THREE.Vector3(x, 0, offsetZ + (WOUND_WANDER[i] ?? 0))));
}

export class ForearmWound {
  readonly group = new THREE.Group();
  private readonly nearEdge: THREE.Mesh;

  constructor(materials: Materials) {
    // Built along its own x with the skin at y = 0, then laid along the limb.
    const [x = 0, y = 0, z = 0] = FOREARM_WOUND_CENTRE;
    this.group.position.set(x, y, z);
    this.group.rotation.set(...FOREARM_ROTATION);
    this.group.name = 'forearm-wound';

    // Flattening with scale.y happens about each tube's own origin, which is why
    // they are placed after being built around it.
    const bed = new THREE.Mesh(taperedTube(woundPath(0), 0.0055, bothEnds(0.12), 40, 12), materials.wound);
    bed.scale.y = 0.4;
    bed.position.y = -0.0008;
    this.group.add(bed);
    const edges = [1, -1].map((side) => {
      const edge = new THREE.Mesh(taperedTube(woundPath(side * 0.0095), 0.0038, bothEnds(0.08), 40, 10), materials.subcutaneous);
      edge.scale.y = 0.6;
      edge.position.y = -0.0002;
      this.group.add(edge);
      return edge;
    });
    // The near edge is on the +z side, toward the surgeon (src/data/zones/forearm.ts).
    this.nearEdge = edges[0]!;
  }

  /** Lift the near edge with the forceps: 0 lying flat, 1 held up and turned out. */
  evert(amount: number): void {
    const k = THREE.MathUtils.clamp(amount, 0, 1);
    this.nearEdge.position.y = -0.0002 + 0.006 * k;
    this.nearEdge.position.z = 0.003 * k;
    this.nearEdge.rotation.x = -0.6 * k;
  }
}
