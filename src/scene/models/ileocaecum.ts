import * as THREE from 'three';
import organLandmarks from '../../data/organLandmarks.json';
import type { WoundStage } from '../../data/procedures/appendectomyStage';
import type { Disposer } from '../disposal';
import type { ModelLibrary } from '../modelLibrary';
import type { Materials } from '../palette';

/**
 * The caecum, appendix and terminal ileum under the appendectomy wound, from
 * the BodyParts3D model (anat_ileocaecum, DECISIONS.md D43), with the
 * mesoappendix, its artery, and the clamps and ties the steps put on, built
 * here around the appendix as the organ model's landmarks place it.
 *
 * The model is already in the app's frame under McBurney's point, so nothing
 * here is in the wound frame; delivering the caecum lifts the whole group.
 *
 * TODO(clinical review): the mesoappendix is a stylised fold, and the clamps
 * and ties are markers, not instrument models.
 */

/** Zones that ride up with the caecum when it is delivered into the wound. */
export const DELIVERED_ZONE_IDS = ['caecum', 'appendix_base', 'appendix_body', 'appendix_tip', 'mesoappendix'] as const;

/** How far the caecum comes up when delivered: into the wound, still below the skin. */
export const DELIVERY_LIFT = 0.025;

const vec = ([x = 0, y = 0, z = 0]: readonly number[]): THREE.Vector3 => new THREE.Vector3(x, y, z);
const BASE = vec(organLandmarks.appendix.base);
const TIP = vec(organLandmarks.appendix.tip);
const LENGTH = TIP.distanceTo(BASE);
/** Base to tip. */
const ALONG = TIP.clone().sub(BASE).normalize();
/** The side the mesoappendix hangs from: toward where the ileum joins the caecum. */
const TOWARD = vec(organLandmarks.ileum.junction).sub(BASE).projectOnPlane(ALONG).normalize();
/** The fold's normal. */
const NORMAL = new THREE.Vector3().crossVectors(TOWARD, ALONG).normalize();

/** The mesoappendix before and after it is divided: only the pedicle by the clamp is left. */
const MESO_WHOLE = { offset: 0.012, scale: 1 };
const MESO_PEDICLE = { offset: 0.006, scale: 0.45 };

/** A point along the appendix (0 base, 1 tip), out toward the mesentery, and off the fold's plane. */
function at(along: number, toward = 0, off = 0): THREE.Vector3 {
  return BASE.clone().addScaledVector(ALONG, along * LENGTH).addScaledVector(TOWARD, toward).addScaledVector(NORMAL, off);
}

/** Orientation with local x along the appendix, z toward the mesentery, y off the fold. */
const FOLD_ORIENTATION = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ALONG, NORMAL, TOWARD));

export class Ileocaecum {
  readonly group = new THREE.Group();

  /** What comes up when the caecum is delivered: the caecum, the appendix and what is on it. The packed-off ileum stays. */
  private readonly lifted = new THREE.Group();
  private readonly appendix: THREE.Object3D | null;
  private readonly meso = new THREE.Group();
  private readonly mesoClamp: THREE.Mesh;
  private readonly mesoTie: THREE.Mesh;
  private readonly baseClamp: THREE.Mesh;
  private readonly baseTie: THREE.Mesh;
  private readonly stump: THREE.Mesh;

  /** The organs from the model, or null if it did not load: the wound then shows only its cavity. */
  static create(materials: Materials, models: ModelLibrary, disposer: Disposer): Ileocaecum | null {
    const organs = models.instantiate('anat_ileocaecum', materials);
    if (!organs) return null;
    const built = new Ileocaecum(materials, organs);
    disposer.track(built.group);
    return built;
  }

  private constructor(materials: Materials, organs: THREE.Group) {
    this.group.name = 'ileocaecum';
    organs.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    this.appendix = organs.getObjectByName('appendix') ?? null;
    const ileum = organs.getObjectByName('ileum');
    if (ileum) this.group.add(ileum);
    this.lifted.add(organs);
    this.group.add(this.lifted);

    // A fatty fold hanging off the appendix, with the appendicular artery in it.
    const fold = new THREE.Mesh(new THREE.BoxGeometry(LENGTH * 0.9, 0.0016, 0.02), materials.subcutaneous);
    fold.position.z = 0.01;
    const artery = new THREE.Mesh(new THREE.CylinderGeometry(0.0011, 0.0011, LENGTH * 0.88, 8), materials.artery);
    artery.rotation.z = Math.PI / 2;
    artery.position.set(0, 0.0015, 0.008);
    this.meso.add(fold, artery);
    this.meso.quaternion.copy(FOLD_ORIENTATION);

    // Clamp jaws lie across what they hold; ties ring it.
    const clamp = (): THREE.Mesh => {
      const jaws = new THREE.Mesh(new THREE.BoxGeometry(0.0026, 0.0026, 0.022), materials.steel);
      jaws.quaternion.copy(FOLD_ORIENTATION);
      return jaws;
    };
    const tie = (axis: THREE.Vector3): THREE.Mesh => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0052, 0.0008, 6, 18), materials.suture);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
      return ring;
    };
    this.mesoClamp = clamp();
    this.mesoClamp.position.copy(at(0.35, 0.014));
    this.mesoTie = tie(TOWARD);
    this.mesoTie.position.copy(at(0.3, 0.012));
    this.baseClamp = clamp();
    this.baseTie = tie(ALONG);
    this.baseTie.position.copy(at(0.1));
    this.stump = new THREE.Mesh(new THREE.SphereGeometry(0.0048, 12, 8), materials.bowel);
    this.stump.position.copy(at(0.05));

    for (const part of [fold, this.mesoClamp, this.mesoTie, this.baseClamp, this.baseTie, this.stump]) {
      part.castShadow = true;
      part.receiveShadow = true;
    }
    this.lifted.add(this.meso, this.mesoClamp, this.mesoTie, this.baseClamp, this.baseTie, this.stump);
    this.setStage({
      layers: { skin: 0, fat: 0, externalOblique: 0, internalOblique: 0, peritoneum: 0 },
      caecumDelivered: false,
      mesoappendix: 'intact',
      appendixBase: 'intact',
    });
  }

  setStage(stage: WoundStage): void {
    const meso = stage.mesoappendix;
    const base = stage.appendixBase;

    const pedicle = meso === 'divided' || meso === 'tied' ? MESO_PEDICLE : MESO_WHOLE;
    this.meso.position.copy(at(0.5, pedicle.offset, -0.002));
    this.meso.scale.x = pedicle.scale;
    this.mesoClamp.visible = meso === 'clamped' || meso === 'divided';
    this.mesoTie.visible = meso === 'tied';

    if (this.appendix) this.appendix.visible = base !== 'removed';
    this.baseClamp.visible = base === 'crushed' || base === 'tied';
    // The clamp crushes at the base, then moves along for the tie to sit in its groove.
    this.baseClamp.position.copy(base === 'tied' ? at(0.24) : at(0.08));
    this.baseTie.visible = base === 'tied' || base === 'removed';
    this.stump.visible = base === 'removed';
  }

  /** How far the caecum is lifted into the wound. */
  setLift(lift: number): void {
    this.lifted.position.y = lift;
  }
}
