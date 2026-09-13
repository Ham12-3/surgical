import * as THREE from 'three';

/**
 * Where the open appendectomy's wound sits on the patient, shared by the torso
 * it is cut into (patient.ts), the wound (abdomenWound.ts) and the organs
 * beneath it (ileocaecum.ts).
 */

/** The torso: a capsule along z, flattened top to bottom. */
export const TORSO = {
  centreY: 1.01,
  centreZ: -0.06,
  radius: 0.17,
  /** Half the length of the capsule's straight part. */
  halfLength: 0.17,
  /** Depth over width. */
  flatten: 0.62,
} as const;

/** Height of the torso's upper surface over (x, z), or null where there is no torso. */
export function torsoTopY(x: number, z: number): number | null {
  const intoCap = Math.max(Math.abs(z - TORSO.centreZ) - TORSO.halfLength, 0);
  const squared = TORSO.radius ** 2 - x ** 2 - intoCap ** 2;
  return squared > 0 ? TORSO.centreY + Math.sqrt(squared) * TORSO.flatten : null;
}

const MCBURNEY_X = -0.09;
const MCBURNEY_Z = 0.11;

/** The skin at McBurney's point, where the wound is centred. */
export const WOUND_CENTRE = new THREE.Vector3(MCBURNEY_X, torsoTopY(MCBURNEY_X, MCBURNEY_Z) ?? 1.099, MCBURNEY_Z);

/**
 * The incision's direction in x/z. McBurney's point is a third of the way from
 * the right anterior superior iliac spine to the umbilicus (x = z = 0), which
 * puts the spine at (-0.135, 0.165); the incision runs square to that line,
 * from above and outside to below and in.
 *
 * TODO(clinical review): this draws a gridiron incision. Whether to teach it or
 * a transverse Lanz incision is open (the skin_incision step's todo).
 */
export const INCISION_AXIS = new THREE.Vector2(0.165, 0.135).normalize();

/** Turn about y that lays a frame's x along the incision. */
export const INCISION_TURN = -Math.atan2(INCISION_AXIS.y, INCISION_AXIS.x);

/** Put an object in the wound frame: at the wound, x along the incision, z across it, y up. */
export function woundFrame(object: THREE.Object3D): void {
  object.position.copy(WOUND_CENTRE);
  object.rotation.set(0, INCISION_TURN, 0);
}
