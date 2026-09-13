import * as THREE from 'three';
import type { Materials } from '../palette';
import type { WoundStage } from '../../data/procedures/appendectomyStage';
import { bothEnds, taperedTube } from '../geometry';
import { woundFrame } from './abdomenFrame';

/**
 * The caecum, appendix and mesoappendix under the appendectomy wound, loops of
 * small bowel beside them, and the clamps and ties the steps put on.
 *
 * Built in the wound frame (abdomenFrame.ts): x along the incision, z across
 * it, y up from the skin at McBurney's point. The layer-5 zones in
 * src/data/zones/abdomenOpen.ts are these positions in world coordinates.
 *
 * TODO(clinical review): stylised shapes and sizes. The appendix is drawn short
 * enough to lie within the wound, and the mesoappendix as a flat fold beside
 * it; the clamps and ties are markers, not instrument models.
 */

/** Zones that ride up with the caecum when it is delivered into the wound. */
export const DELIVERED_ZONE_IDS = [
  'caecum',
  'appendix_base',
  'appendix_body',
  'appendix_tip',
  'mesoappendix',
] as const;

/** How far the caecum comes up when delivered: into the wound, still below the skin. */
export const DELIVERY_LIFT = 0.025;

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

const APPENDIX_PATH = [v(0.012, -0.06, 0), v(0.028, -0.057, -0.006), v(0.036, -0.054, -0.02)];
const BOWEL_PATHS = [
  [v(-0.022, -0.07, -0.03), v(0, -0.066, -0.036), v(0.02, -0.07, -0.026), v(0.036, -0.072, -0.034)],
  [v(-0.026, -0.078, -0.021), v(0.002, -0.075, -0.019), v(0.03, -0.079, -0.017)],
];

/** The mesoappendix before and after it is divided: only the pedicle by the clamp is left. */
const MESO_WHOLE = { x: 0.022, scale: 1 };
const MESO_PEDICLE = { x: 0.017, scale: 0.45 };

/** The base clamp crushes at the base, then moves along for the tie to sit in its groove. */
const BASE_CLAMP_CRUSH = v(0.015, -0.0595, -0.0005);
const BASE_CLAMP_MOVED = v(0.022, -0.058, -0.003);

export class Ileocaecum {
  readonly group = new THREE.Group();

  private readonly appendix: THREE.Mesh;
  private readonly meso = new THREE.Group();
  private readonly mesoClamp: THREE.Mesh;
  private readonly mesoTie: THREE.Mesh;
  private readonly baseClamp: THREE.Mesh;
  private readonly baseTie: THREE.Mesh;
  private readonly stump: THREE.Mesh;

  constructor(materials: Materials) {
    this.group.name = 'ileocaecum';
    woundFrame(this.group);

    const caecum = new THREE.Mesh(new THREE.SphereGeometry(0.026, 24, 16), materials.bowel);
    caecum.scale.set(1.15, 0.85, 1);
    caecum.position.set(-0.012, -0.069, 0.004);

    this.appendix = new THREE.Mesh(
      taperedTube(new THREE.CatmullRomCurve3(APPENDIX_PATH), 0.0042, bothEnds(0.15), 24, 10),
      materials.bowel,
    );

    // A fatty fold with the appendicular artery running in it.
    this.meso.position.set(MESO_WHOLE.x, -0.064, 0.008);
    const fold = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.0016, 0.014), materials.subcutaneous);
    const artery = new THREE.Mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 0.024, 8), materials.artery);
    artery.rotation.z = Math.PI / 2;
    artery.position.set(0, 0.0015, 0.002);
    this.meso.add(fold, artery);

    // Clamp jaws lie across what they hold; ties ring the pedicle or the
    // appendix, both of which run along x.
    const clamp = (): THREE.Mesh => new THREE.Mesh(new THREE.BoxGeometry(0.0026, 0.0026, 0.022), materials.steel);
    const tie = (): THREE.Mesh => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0052, 0.0008, 6, 18), materials.suture);
      ring.rotation.y = Math.PI / 2;
      return ring;
    };
    this.mesoClamp = clamp();
    this.mesoClamp.position.set(0.012, -0.062, 0.008);
    this.mesoTie = tie();
    this.mesoTie.position.set(0.011, -0.0635, 0.008);
    this.baseClamp = clamp();
    this.baseTie = tie();
    this.baseTie.position.set(0.015, -0.0595, -0.0005);
    this.stump = new THREE.Mesh(new THREE.SphereGeometry(0.0048, 12, 8), materials.bowel);
    this.stump.position.set(0.014, -0.0598, 0);

    const bowel = BOWEL_PATHS.map(
      (path) =>
        new THREE.Mesh(taperedTube(new THREE.CatmullRomCurve3(path), 0.009, bothEnds(0.06), 24, 12), materials.bowel),
    );

    const parts = [caecum, this.appendix, fold, this.mesoClamp, this.mesoTie, this.baseClamp, this.baseTie, this.stump, ...bowel];
    for (const part of parts) {
      part.castShadow = true;
      part.receiveShadow = true;
    }
    this.group.add(caecum, this.appendix, this.meso, this.mesoClamp, this.mesoTie, this.baseClamp, this.baseTie, this.stump, ...bowel);
  }

  setStage(stage: WoundStage): void {
    const meso = stage.mesoappendix;
    const base = stage.appendixBase;

    const pedicle = meso === 'divided' || meso === 'tied' ? MESO_PEDICLE : MESO_WHOLE;
    this.meso.position.x = pedicle.x;
    this.meso.scale.x = pedicle.scale;
    this.mesoClamp.visible = meso === 'clamped' || meso === 'divided';
    this.mesoTie.visible = meso === 'tied';

    this.appendix.visible = base !== 'removed';
    this.baseClamp.visible = base === 'crushed' || base === 'tied';
    this.baseClamp.position.copy(base === 'tied' ? BASE_CLAMP_MOVED : BASE_CLAMP_CRUSH);
    this.baseTie.visible = base === 'tied' || base === 'removed';
    this.stump.visible = base === 'removed';
  }
}
