import * as THREE from 'three';
import type { Disposer } from '../disposal';
import type { Materials } from '../palette';
import type { ModelLibrary } from '../modelLibrary';
import bodyLandmarks from '../../data/bodyLandmarks.json';
import { FOREARM_WOUND_CENTRE } from '../../data/zones/forearm';
import type { PatientModel } from '../../data/zones';
import { TABLE_TOP_Y } from './operatingRoom';
import { addArmBoardDrape, addTrunkDrape } from './drapes';
import { capsuleSurface, OPEN_FIELD_CENTRE, TORSO, UMBILICUS, WOUND_CENTRE } from './abdomenFrame';
import { AbdomenWound } from './abdomenWound';
import { flatSurface, HeightField, highestOf, slopeLimited, type SkinSurface } from './bodySurface';
import { ForearmWound } from './forearmWound';
import { Ileocaecum } from './ileocaecum';

export interface Patient {
  group: THREE.Group;
  /** Point the camera frames for this variant, in world coordinates. */
  fieldCentre: THREE.Vector3;
  /** The wound the appendectomy opens, for that variant; null for the others. */
  wound: AbdomenWound | null;
  /** The laceration, for the forearm variant; null for the others. */
  forearmWound: ForearmWound | null;
  /** The skin's height over the table, from the body.  */
  surface: SkinSurface;
}

/** The sheet lies on the table and rides up over whatever is on it. */
const DRAPE_Y = TABLE_TOP_Y + 0.012;
/** The table under the drape: its pad, and the arm board on the patient's right. */
const TABLE_FOOTPRINT = { x0: -0.305, x1: 0.305, z0: -1.0, z1: 1.0 } as const;
const BOARD = { x0: -0.82, x1: -0.315, z0: -0.5, z1: -0.16 } as const;

const vec = ([x = 0, y = 0, z = 0]: readonly number[]): THREE.Vector3 => new THREE.Vector3(x, y, z);

/**
 * The patient: the body model (anat_body_patient, from MPFB, DECISIONS.md
 * D43) laid supine on the table by its build, with the right arm out on the
 * arm board, and the wound of the variant being played. Zones are pinned to
 * the same landmarks the build wrote (src/data/bodyLandmarks.json).
 *
 * If the model did not load, a body of capsules stands in for it, so the
 * theatre still opens; the zones then sit where the real body would be.
 */
export function createPatient(model: PatientModel, materials: Materials, disposer: Disposer, models: ModelLibrary): Patient {
  const group = new THREE.Group();
  group.name = `patient-${model}`;

  const body = models.instantiate('anat_body_patient', materials);
  let surface: SkinSurface;
  let skin: THREE.Material = materials.skin;
  let bodyMesh: THREE.Mesh | null = null;
  if (body) {
    body.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        bodyMesh ??= object;
      }
    });
    group.add(body);
    const [x0 = -0.6, , z0 = -0.7] = bodyLandmarks.bounds.min;
    const [x1 = 0.6, , z1 = 1.1] = bodyLandmarks.bounds.max;
    surface = HeightField.fromObject(body, { x0: x0 - 0.02, x1: x1 + 0.02, z0: z0 - 0.02, z1: z1 + 0.02 }, 0.01);
    skin = materials.skinBody;
  } else {
    console.warn('The body model did not load; the theatre shows a stand-in body.');
    bodyMesh = addCapsuleBody(group, materials);
    surface = capsuleSurface();
  }
  // What the sheets lie over: the body and the table, falling off both at the
  // slope cloth hangs at rather than straight down at their edges.
  const table = flatSurface(TABLE_TOP_Y);
  const underDrape = slopeLimited(
    highestOf(surface, {
      heightAt: (x, z) => (x >= TABLE_FOOTPRINT.x0 && x <= TABLE_FOOTPRINT.x1 && z >= TABLE_FOOTPRINT.z0 && z <= TABLE_FOOTPRINT.z1 ? TABLE_TOP_Y : null),
      normalAt: () => new THREE.Vector3(0, 1, 0),
    }),
  );
  const underBoard = slopeLimited(highestOf(surface, table));

  let wound: AbdomenWound | null = null;
  let forearmWound: ForearmWound | null = null;
  let fieldCentre: THREE.Vector3;
  if (model === 'forearm') {
    forearmWound = new ForearmWound(materials);
    group.add(forearmWound.group);
    // The trunk is covered completely for a limb case; the only window is the
    // one over the wound, on the arm board's own drape. The skirt on the arm
    // board side is short, so it does not hang through the arm.
    addTrunkDrape(group, materials, null, DRAPE_Y, underDrape, { minusX: 0.065, plusX: 0.34 });
    const w = FOREARM_WOUND_CENTRE;
    addArmBoardDrape(group, materials, BOARD, { x0: w[0] - 0.08, x1: w[0] + 0.08, z0: w[2] - 0.05, z1: w[2] + 0.05 }, DRAPE_Y, underBoard);
    fieldCentre = vec(w);
  } else if (model === 'abdomen-open') {
    // The skin material cuts the wound open (skinOpening.ts), and the lamp's
    // shadow is cut the same way.
    wound = new AbdomenWound(materials, disposer, surface, Ileocaecum.create(materials, models, disposer), skin);
    group.add(wound.group);
    if (bodyMesh) {
      bodyMesh.material = wound.skin.material;
      bodyMesh.customDepthMaterial = wound.skin.depthMaterial;
    }
    const c = WOUND_CENTRE;
    addTrunkDrape(group, materials, { x0: c.x - 0.06, x1: c.x + 0.17, z0: c.z - 0.13, z1: c.z + 0.12 }, DRAPE_Y, underDrape, { minusX: 0.065, plusX: 0.34 });
    addArmBoardDrape(group, materials, BOARD, null, DRAPE_Y, underBoard);
    fieldCentre = OPEN_FIELD_CENTRE.clone();
  } else {
    addTrunkDrape(group, materials, { x0: -0.15, x1: 0.08, z0: -0.2, z1: 0.06 }, DRAPE_Y, underDrape, { minusX: 0.065, plusX: 0.34 });
    addArmBoardDrape(group, materials, BOARD, null, DRAPE_Y, underBoard);
    fieldCentre = new THREE.Vector3(-0.05, UMBILICUS.y - 0.02, -0.09);
  }

  disposer.track(group);
  return { group, fieldCentre, wound, forearmWound, surface };
}

/** The stand-in body for a model that did not load: trunk, head, legs and arms as capsules. Returns the trunk. */
function addCapsuleBody(group: THREE.Group, materials: Materials): THREE.Mesh {
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(TORSO.radius, TORSO.halfLength * 2, 10, 28), materials.skin);
  torso.rotation.x = Math.PI / 2;
  torso.scale.set(1, 1, TORSO.flatten);
  torso.position.set(0, TORSO.centreY, TORSO.centreZ);
  torso.castShadow = true;
  torso.receiveShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.098, 28, 20), materials.skin);
  head.position.set(0, TORSO.centreY + 0.03, -0.53);
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

  // The left arm lies at the side; the right arm out along the arm board.
  const armGeometry = new THREE.CapsuleGeometry(0.048, 0.42, 4, 10);
  const leftArm = new THREE.Mesh(armGeometry, materials.skin);
  leftArm.rotation.x = Math.PI / 2;
  leftArm.position.set(0.2, TABLE_TOP_Y + 0.05, 0.05);
  leftArm.castShadow = true;
  group.add(leftArm);
  const rightArm = new THREE.Mesh(armGeometry, materials.skin);
  rightArm.rotation.z = Math.PI / 2;
  rightArm.position.set(-0.45, TABLE_TOP_Y + 0.05, -0.33);
  rightArm.castShadow = true;
  group.add(rightArm);
  return torso;
}
