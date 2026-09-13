import * as THREE from 'three';
import type { Disposer } from '../disposal';
import type { Materials } from '../palette';
import type { ModelLibrary } from '../modelLibrary';
import { Hinge } from '../articulation';
import { createToolMesh } from '../tools/toolMeshes';

const NEEDLE_ID = 'prop_suture_needle_curved';
/** How far up the needle holder's body from its tip it grips, if its model lacks the `needle_grip` node. */
const GRIP_FALLBACK = 0.0035;
/** Radius of the code-built needle used when the model is missing. */
const FALLBACK_RADIUS = 0.008;
/** A 3/8 circle needle: the arc from the swage round to the point. */
const FALLBACK_ARC = (Math.PI * 3) / 4;

/**
 * The needle holder with the curved needle in its jaws.
 *
 * The rig turns about the needle's own centre, so the tip follows the needle's
 * circle, which is how a bite's path is worked out
 * (src/engine/suturing/geometry.ts). The needle lies in the plane across the
 * wound (x, y) with its point leading as the rig turns anticlockwise about z,
 * seen from +z. The holder lies along the wound, square to the needle's plane,
 * its jaws closing across the wire, and turns with the needle as the wrist
 * would.
 *
 * TODO(clinical review): which way the needle's point faces in the jaws for a
 * right-handed forehand pass (see the needle holder's Blender script).
 */
export class NeedleRig {
  /** At the needle's centre; turning it about z turns the needle along its curve. */
  readonly pivot = new THREE.Group();
  readonly radius: number;
  /** The needle's arc from swage to point, radians. */
  readonly arc: number;

  /** The needle, centred on its circle, point at angle `tipAngle` in its x, y plane. */
  private readonly frame = new THREE.Group();
  private readonly holder: THREE.Group;
  private readonly holderHome = new THREE.Matrix4();
  private readonly tipLocal = new THREE.Vector3();
  private readonly swageLocal = new THREE.Vector3();
  private readonly gripLocal = new THREE.Vector3();
  private readonly tipAngle: number;
  private readonly hinge: Hinge | null;
  private gripping = true;

  constructor(materials: Materials, disposer: Disposer, models: ModelLibrary) {
    this.pivot.name = 'needle-rig';
    this.pivot.add(this.frame);

    const needle = models.instantiate(NEEDLE_ID, materials);
    if (needle) {
      disposer.track(needle);
      const tip = nodePosition(needle, 'needle_tip') ?? new THREE.Vector3(FALLBACK_RADIUS, FALLBACK_RADIUS, 0);
      const swage = nodePosition(needle, 'swage') ?? new THREE.Vector3(-FALLBACK_RADIUS, FALLBACK_RADIUS, 0);
      // The model's origin is where the holder grips it.
      const centre = circumcentre(tip, new THREE.Vector3(), swage);
      needle.position.copy(centre).negate();
      this.frame.add(needle);
      this.tipLocal.copy(tip).sub(centre);
      this.swageLocal.copy(swage).sub(centre);
      this.gripLocal.copy(centre).negate();
    } else {
      const geometry = new THREE.TorusGeometry(FALLBACK_RADIUS, 0.00036, 6, 32, FALLBACK_ARC);
      disposer.register(geometry);
      const wire = new THREE.Mesh(geometry, materials.steel);
      wire.rotation.z = -FALLBACK_ARC;
      this.frame.add(wire);
      this.tipLocal.set(FALLBACK_RADIUS, 0, 0);
      this.swageLocal.set(Math.cos(-FALLBACK_ARC), Math.sin(-FALLBACK_ARC), 0).multiplyScalar(FALLBACK_RADIUS);
      this.gripLocal.set(0, -FALLBACK_RADIUS, 0);
    }
    this.radius = this.tipLocal.length();
    this.tipAngle = Math.atan2(this.tipLocal.y, this.tipLocal.x);
    const swageAngle = Math.atan2(this.swageLocal.y, this.swageLocal.x);
    this.arc = (((this.tipAngle - swageAngle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    this.frame.traverse((object) => {
      object.castShadow = true;
    });

    this.holder = createToolMesh('needle_holder', materials, disposer, models);
    const gripInHolder = nodePosition(this.holder, 'needle_grip') ?? new THREE.Vector3(0, GRIP_FALLBACK, 0);
    // Body (its +y) along the wound, +z; jaws (opening along its x) across the
    // wire, which runs along x where it is gripped at the bottom of the circle.
    const basis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(1, 0, 0),
    );
    this.holder.quaternion.setFromRotationMatrix(basis);
    this.holder.position.copy(this.gripLocal).sub(gripInHolder.applyQuaternion(this.holder.quaternion));
    this.holder.updateMatrix();
    this.holderHome.copy(this.holder.matrix);
    this.frame.add(this.holder);
    this.hinge = Hinge.find(this.holder, models.toolEntry('needle_holder'));
  }

  /** Put the needle's centre at `centre` and turn it so its point is `angle` round it (radians, from +x toward +y). */
  place(centre: THREE.Vector3, angle: number): void {
    this.pivot.position.copy(centre);
    this.pivot.rotation.set(0, 0, angle - this.tipAngle);
    this.pivot.updateMatrixWorld(true);
  }

  tip(out: THREE.Vector3): THREE.Vector3 {
    return this.frame.localToWorld(out.copy(this.tipLocal));
  }

  swage(out: THREE.Vector3): THREE.Vector3 {
    return this.frame.localToWorld(out.copy(this.swageLocal));
  }

  /** Where the jaws hold the needle, whether or not they are holding it now. */
  grip(out: THREE.Vector3): THREE.Vector3 {
    return this.frame.localToWorld(out.copy(this.gripLocal));
  }

  get holding(): boolean {
    return this.gripping;
  }

  /** Open the jaws and leave the holder where it is, as the needle is driven on along its curve. */
  release(scene: THREE.Object3D): void {
    if (!this.gripping) return;
    scene.attach(this.holder);
    this.hinge?.set(0.5);
    this.gripping = false;
  }

  /** Take hold of the needle again where it was first gripped. */
  regrip(): void {
    if (this.gripping) return;
    this.frame.add(this.holder);
    this.holder.matrix.copy(this.holderHome);
    this.holder.matrix.decompose(this.holder.position, this.holder.quaternion, this.holder.scale);
    this.hinge?.set(0);
    this.gripping = true;
  }
}

/** A named node's position relative to `root`, or null if it has none. */
function nodePosition(root: THREE.Object3D, name: string): THREE.Vector3 | null {
  const node = root.getObjectByName(name);
  if (!node) return null;
  root.updateMatrixWorld(true);
  return root.worldToLocal(node.getWorldPosition(new THREE.Vector3()));
}

/** Centre of the circle through three points in the x, y plane. */
function circumcentre(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): THREE.Vector3 {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  return new THREE.Vector3(
    (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
    0,
  );
}
