import * as THREE from 'three';
import type { Disposer } from '../disposal';
import type { Materials } from '../palette';
import type { PatientModel } from '../../data/zones';
import { TABLE_TOP_Y } from './operatingRoom';
import { addArmBoardDrape, addTrunkDrape } from './drapes';
import { bothEnds, taperedTube } from '../geometry';

export interface Patient {
  group: THREE.Group;
  /** Point the camera frames for this variant, in world coordinates. */
  fieldCentre: THREE.Vector3;
}

/** Height of the anterior abdominal wall. Zone specs are pinned to this. */
const ABDOMEN_TOP_Y = 1.12;
const TORSO_CENTRE_Y = 1.01;
/** The trunk drape must clear the torso, or the body pokes through the sheet. */
const TRUNK_DRAPE_Y = ABDOMEN_TOP_Y + 0.012;

/**
 * A stylised supine patient, built entirely from primitives.
 *
 * The body is deliberately simple: capsules and spheres, no attempt at
 * realistic surface anatomy. What has to be right is the *position* of the
 * named zones relative to visible landmarks, because that is what the student
 * is being asked to learn. Everything else is set dressing that should not
 * distract from the field.
 */
export function createPatient(
  model: PatientModel,
  materials: Materials,
  disposer: Disposer,
): Patient {
  const group = new THREE.Group();
  group.name = `patient-${model}`;

  addBody(group, materials, model);

  let fieldCentre: THREE.Vector3;
  if (model === 'forearm') {
    addRightArmOnBoard(group, materials);
    addForearmWound(group, materials);
    // The trunk is covered completely for a limb case; the only window is the
    // one over the wound, on the arm board's own drape.
    // The arm leaves the trunk on the -x side with its top at y = 0.99, and the
    // skirt starts where the sheet finishes falling, about 1.06. It is cut to
    // stop just above the arm rather than hanging through it.
    addTrunkDrape(group, materials, null, TRUNK_DRAPE_Y, { minusX: 0.065, plusX: 0.34 });
    addArmBoardDrape(group, materials);
    fieldCentre = new THREE.Vector3(-0.42, 0.99, 0);
  } else if (model === 'abdomen-open') {
    // No internal anatomy yet: organs drawn under intact skin poked out
    // through the flank. Phase 4 adds the opened abdomen and the
    // laparoscope's interior view; the zones are already in place.
    addTrunkDrape(group, materials, { x0: -0.15, x1: 0.08, z0: -0.02, z1: 0.23 }, TRUNK_DRAPE_Y);
    fieldCentre = new THREE.Vector3(-0.09, ABDOMEN_TOP_Y, 0.11);
  } else {
    addTrunkDrape(group, materials, { x0: -0.15, x1: 0.08, z0: -0.2, z1: 0.06 }, TRUNK_DRAPE_Y);
    fieldCentre = new THREE.Vector3(-0.05, ABDOMEN_TOP_Y - 0.02, -0.09);
  }

  disposer.track(group);
  return { group, fieldCentre };
}

/** Head, trunk, legs and the left arm — the parts every variant shares. */
function addBody(group: THREE.Group, materials: Materials, model: PatientModel): void {
  // Trunk: a capsule laid along z and flattened vertically reads as a supine
  // torso far better than a box, for the same one draw call.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.34, 10, 28), materials.skin);
  torso.rotation.x = Math.PI / 2;
  torso.scale.set(1, 1, 0.62);
  torso.position.set(0, TORSO_CENTRE_Y, -0.06);
  torso.castShadow = true;
  torso.receiveShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.098, 28, 20), materials.skin);
  head.position.set(0, TORSO_CENTRE_Y + 0.03, -0.53);
  head.scale.set(0.92, 1, 1.12);
  head.castShadow = true;
  group.add(head);

  const legGeometry = new THREE.CapsuleGeometry(0.075, 0.5, 4, 12);
  for (const x of [-0.09, 0.09]) {
    const leg = new THREE.Mesh(legGeometry, materials.skin);
    leg.rotation.x = Math.PI / 2;
    leg.position.set(x, TABLE_TOP_Y + 0.075, 0.62);
    leg.castShadow = true;
    group.add(leg);
  }

  // The left arm is tucked at the side in every variant. The right arm is only
  // built out onto a board for the forearm procedure.
  const armGeometry = new THREE.CapsuleGeometry(0.048, 0.42, 4, 10);
  const leftArm = new THREE.Mesh(armGeometry, materials.skin);
  leftArm.rotation.x = Math.PI / 2;
  leftArm.position.set(0.2, TABLE_TOP_Y + 0.05, 0.05);
  leftArm.castShadow = true;
  group.add(leftArm);

  if (model !== 'forearm') {
    const rightArm = new THREE.Mesh(armGeometry, materials.skin);
    rightArm.rotation.x = Math.PI / 2;
    rightArm.position.set(-0.2, TABLE_TOP_Y + 0.05, 0.05);
    rightArm.castShadow = true;
    group.add(rightArm);
  }
}

/** Right arm abducted onto the board: upper arm, forearm along x, and hand. */
function addRightArmOnBoard(group: THREE.Group, materials: Materials): void {
  // Runs from the shoulder out to an elbow at x = -0.27, which is exactly
  // where the forearm capsule begins. Overlapping any further would bury the
  // inboard drape sleeve inside the upper arm.
  const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.116, 4, 10), materials.skin);
  upperArm.rotation.z = Math.PI / 2;
  upperArm.position.set(-0.16, TABLE_TOP_Y + 0.055, 0);
  upperArm.castShadow = true;
  group.add(upperArm);

  // Matches the forearm cylinder the zone manifest is pinned to: radius 0.045,
  // centred at (-0.42, 0.945, 0), axis along x.
  const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.21, 10, 24), materials.skin);
  forearm.rotation.z = Math.PI / 2;
  forearm.position.set(-0.42, 0.945, 0);
  forearm.castShadow = true;
  forearm.receiveShadow = true;
  group.add(forearm);

  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), materials.skin);
  hand.scale.set(1.5, 0.6, 1);
  hand.position.set(-0.59, 0.94, 0);
  hand.castShadow = true;
  group.add(hand);
}

/**
 * The laceration: a dark bed between two pale, everted edges, running along x
 * for 9 cm on the forearm and closing to a point at each apex.
 *
 * Built from tapered tubes on a gently wandering path. A laceration is never
 * ruler-straight, and that wander does more for realism than any amount of
 * surface detail. It stays within about 2 mm of the midline, so the wound
 * never strays out of its hit-test zones.
 *
 * The forearm is a closed capsule, so a groove below its surface would be
 * invisible; instead the edges sit just proud of the skin and the bed sits a
 * little lower between them. Deliberately clean and shallow: the teaching
 * point is two edges that need approximating, not an injury.
 */
const WOUND_WANDER = [0, 0.0016, -0.0008, 0.0014, 0] as const;

function woundPath(offsetZ: number): THREE.CatmullRomCurve3 {
  const xs = [-0.046, -0.023, 0, 0.023, 0.046];
  return new THREE.CatmullRomCurve3(
    xs.map((x, i) => new THREE.Vector3(x, 0, offsetZ + (WOUND_WANDER[i] ?? 0))),
  );
}

function addForearmWound(group: THREE.Group, materials: Materials): void {
  // Built around the origin and then placed, so flattening with scale.y does
  // not also drag the geometry toward the world origin.
  const bed = new THREE.Mesh(taperedTube(woundPath(0), 0.0055, bothEnds(0.12), 40, 12), materials.wound);
  bed.scale.y = 0.4;
  bed.position.set(-0.42, 0.9892, 0);
  group.add(bed);

  for (const side of [1, -1]) {
    const edge = new THREE.Mesh(
      taperedTube(woundPath(side * 0.0095), 0.0038, bothEnds(0.08), 40, 10),
      materials.subcutaneous,
    );
    edge.scale.y = 0.6;
    edge.position.set(-0.42, 0.9898, 0);
    group.add(edge);
  }
}
