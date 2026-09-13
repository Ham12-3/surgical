import * as THREE from 'three';
import bodyLandmarks from '../../data/bodyLandmarks.json';
import type { SkinSurface } from './bodySurface';

/**
 * Where the open appendectomy's wound sits on the patient, shared by the
 * wound (abdomenWound.ts), the organs (ileocaecum.ts) and the cameras.
 *
 * The positions are the body model's landmarks (src/data/bodyLandmarks.json,
 * written by blender/scripts/build_body.py). TODO(clinical review): they are
 * worked out from the mesh and the rig's joints.
 */

function landmark(name: keyof typeof bodyLandmarks.landmarks): THREE.Vector3 {
  const [x = 0, y = 0, z = 0] = bodyLandmarks.landmarks[name];
  return new THREE.Vector3(x, y, z);
}

/** The skin at McBurney's point, where the wound is centred. */
export const WOUND_CENTRE = landmark('mcburney');
export const UMBILICUS = landmark('umbilicus');
const ASIS_RIGHT = landmark('asis_right');

/** What the cameras frame for the open abdomen: just over the wound. */
export const OPEN_FIELD_CENTRE = new THREE.Vector3(WOUND_CENTRE.x, WOUND_CENTRE.y + 0.02, WOUND_CENTRE.z);

/**
 * The incision's direction in x/z: square to the line from the right anterior
 * superior iliac spine to the umbilicus, from above and outside to below and
 * in, as a gridiron incision runs.
 *
 * TODO(clinical review): whether to teach this or a transverse Lanz incision
 * is open (the skin_incision step's todo).
 */
export const INCISION_AXIS = new THREE.Vector2(UMBILICUS.z - ASIS_RIGHT.z, ASIS_RIGHT.x - UMBILICUS.x).normalize();

/** Turn about y that lays a frame's x along the incision. */
export const INCISION_TURN = -Math.atan2(INCISION_AXIS.y, INCISION_AXIS.x);

/** Put an object in the wound frame: at the wound, x along the incision, z across it, y up. */
export function woundFrame(object: THREE.Object3D): void {
  object.position.copy(WOUND_CENTRE);
  object.rotation.set(0, INCISION_TURN, 0);
}

/**
 * The code-built torso (patient.ts), a capsule along z flattened top to
 * bottom, kept as the fallback for a body model that did not load.
 */
export const TORSO = {
  centreY: 1.01,
  centreZ: -0.06,
  radius: 0.17,
  /** Half the length of the capsule's straight part. */
  halfLength: 0.17,
  /** Depth over width. */
  flatten: 0.62,
} as const;

/** Height of the capsule torso's upper surface over (x, z), or null where there is no torso. */
export function torsoTopY(x: number, z: number): number | null {
  const intoCap = Math.max(Math.abs(z - TORSO.centreZ) - TORSO.halfLength, 0);
  const squared = TORSO.radius ** 2 - x ** 2 - intoCap ** 2;
  return squared > 0 ? TORSO.centreY + Math.sqrt(squared) * TORSO.flatten : null;
}

/** The capsule torso as a skin surface. */
export function capsuleSurface(): SkinSurface {
  const h = 0.002;
  return {
    heightAt: torsoTopY,
    normalAt(x, z) {
      const here = torsoTopY(x, z);
      if (here === null) return new THREE.Vector3(0, 1, 0);
      const slopeX = ((torsoTopY(x + h, z) ?? here) - (torsoTopY(x - h, z) ?? here)) / (2 * h);
      const slopeZ = ((torsoTopY(x, z + h) ?? here) - (torsoTopY(x, z - h) ?? here)) / (2 * h);
      return new THREE.Vector3(-slopeX, 1, -slopeZ).normalize();
    },
  };
}
