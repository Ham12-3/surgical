import * as THREE from 'three';
import type { Disposer } from '../disposal';
import type { Materials } from '../palette';
import { WALL_LAYERS, type WallLayer, type WoundStage } from '../../data/procedures/appendectomyStage';
import { bothEnds, taperedTube } from '../geometry';
import { INCISION_AXIS, WOUND_CENTRE, torsoTopY, woundFrame } from './abdomenFrame';
import { DELIVERY_LIFT, Ileocaecum } from './ileocaecum';
import { SkinOpening } from './skinOpening';

/**
 * The open appendectomy's wound: an opening in the skin over McBurney's point,
 * the layers of the abdominal wall under it, and the ileocaecal region below.
 *
 * The wall pieces live in a shell laid on the skin's tangent plane at the
 * wound, x along the incision and z across it. The sides of the wound are two
 * bands, fat over muscle, whose top edge sits on the skin exactly round the
 * opening. Each layer is a pair of half-ellipse flaps meeting on the incision
 * line; opening a layer slides its flaps apart, under wound edges that the
 * skin hides. Below the peritoneum a closed cavity keeps the view from
 * reaching through the body.
 *
 * TODO(clinical review): the incision's length and the layers' depths are
 * stylised.
 */

const HALF_LENGTH = 0.035;
const HALF_WIDTH_OPEN = 0.02;
/** However narrow the slit, a ray is let in as if it were this wide, so it can be aimed at. */
const MIN_AIM_HALF_WIDTH = 0.012;
const FLAP_SLIDE = 0.024;
const EASE_PER_SECOND = 6;
const RING = 32;
/** Faceting of the torso capsule puts its surface up to about 1 mm off the true curve. */
const RIM_LIFT = 0.0015;

const FLAPS = [
  { layer: 'fat', depth: -0.012, material: 'subcutaneous' },
  { layer: 'externalOblique', depth: -0.018, material: 'fascia' },
  { layer: 'internalOblique', depth: -0.028, material: 'muscle' },
  { layer: 'peritoneum', depth: -0.037, material: 'fascia' },
] as const satisfies ReadonlyArray<{ layer: WallLayer; depth: number; material: keyof Materials }>;

interface Wall {
  readonly mesh: THREE.Mesh;
  /** Shell height of the band's top, or 'skin' to follow the skin. */
  readonly top: number | 'skin';
  readonly bottom: number;
}

function layerValues(value: number): Record<WallLayer, number> {
  return { skin: value, fat: value, externalOblique: value, internalOblique: value, peritoneum: value };
}

/** The skin's normal at the wound, from the torso's shape. */
function skinNormal(): THREE.Vector3 {
  const h = 0.002;
  const at = (dx: number, dz: number): number => torsoTopY(WOUND_CENTRE.x + dx, WOUND_CENTRE.z + dz) ?? WOUND_CENTRE.y;
  const slopeX = (at(h, 0) - at(-h, 0)) / (2 * h);
  const slopeZ = (at(0, h) - at(0, -h)) / (2 * h);
  return new THREE.Vector3(-slopeX, 1, -slopeZ).normalize();
}

export class AbdomenWound {
  readonly group = new THREE.Group();
  readonly skin: SkinOpening;
  readonly organs: Ileocaecum;

  private readonly shell = new THREE.Group();
  private readonly shellInverse: THREE.Matrix4;
  private readonly cavity = new THREE.Group();
  private readonly walls: Wall[];
  private readonly flaps: Array<{ readonly layer: WallLayer; readonly halves: readonly THREE.Mesh[] }> = [];
  private readonly marker: THREE.Mesh;
  private readonly pool: THREE.Mesh;
  private readonly poolMaterial: THREE.MeshStandardMaterial;
  private readonly target = layerValues(0);
  private readonly current = layerValues(0);
  private liftTarget = 0;
  private lift = 0;
  private bleedTarget = 0;
  private bleed = 0;
  private bloodShown = true;
  private instant = false;
  private readonly scratch = new THREE.Vector3();

  constructor(materials: Materials, disposer: Disposer) {
    this.group.name = 'abdomen-wound';
    this.skin = new SkinOpening(materials.skin, WOUND_CENTRE, INCISION_AXIS, disposer);

    woundFrame(this.shell);
    this.shell.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), skinNormal()));
    this.shell.updateMatrix();
    this.shellInverse = this.shell.matrix.clone().invert();

    this.walls = [this.addWall(materials.subcutaneous, 'skin', -0.018), this.addWall(materials.muscle, -0.018, -0.037)];

    for (const flap of FLAPS) {
      const halves = [-1, 1].map((side) => {
        // A half circle from angle 0 covers +y, which laying it flat turns to -z.
        const half = new THREE.Mesh(new THREE.CircleGeometry(1, 20, side < 0 ? 0 : Math.PI, Math.PI), materials[flap.material]);
        half.rotation.x = -Math.PI / 2;
        half.scale.set(HALF_LENGTH * 1.15, HALF_WIDTH_OPEN * 1.4, 1);
        half.position.y = flap.depth;
        half.userData['side'] = side;
        half.receiveShadow = true;
        this.shell.add(half);
        return half;
      });
      this.flaps.push({ layer: flap.layer, halves });
    }

    // Blood welling in the wound: a thin, dark film, never a pool that fills.
    this.poolMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a1616,
      roughness: 0.25,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(1, 24), this.poolMaterial);
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = -0.0112;
    this.shell.add(this.pool);

    // The cavity stays level, like the organs: a closed, inside-out drum. Its
    // rim is kept low: on the patient's right, where the flank falls away
    // fastest, a rim at -0.025 stood 2 mm proud of the skin and showed as a
    // dark arc beside the wound.
    woundFrame(this.cavity);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 28, 1, true), materials.wound);
    turnInsideOut(drum.geometry);
    drum.scale.set(0.05, 0.066, 0.04);
    drum.position.y = -0.034 - 0.033;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 28), materials.wound);
    floor.rotation.x = -Math.PI / 2;
    floor.scale.set(0.05, 0.04, 1);
    floor.position.y = -0.1;
    this.cavity.add(drum, floor);

    this.organs = new Ileocaecum(materials);
    this.marker = this.buildMarker(materials.suture);
    this.group.add(this.shell, this.cavity, this.organs.group, this.marker);
    this.apply();
    disposer.track(this.group);
  }

  setStage(stage: WoundStage): void {
    for (const layer of WALL_LAYERS) this.target[layer] = stage.layers[layer];
    this.liftTarget = stage.caecumDelivered ? DELIVERY_LIFT : 0;
    this.organs.setStage(stage);
  }

  /** Blood welling now, millilitres a second; shown as a film that darkens a little. */
  setBleeding(mlPerSecond: number): void {
    this.bleedTarget = this.bloodShown ? Math.min(0.45, Math.max(mlPerSecond, 0) * 0.3) : 0;
  }

  /** The Schematic content level shows no blood at all. */
  setBloodShown(shown: boolean): void {
    this.bloodShown = shown;
    if (!shown) this.bleed = this.bleedTarget = 0;
  }

  /** With reduced motion the layers and the caecum move at once rather than easing. */
  setInstant(instant: boolean): void {
    this.instant = instant;
  }

  /** How far the caecum is lifted into the wound right now, for its zones to follow. */
  get deliveryLift(): number {
    return this.lift;
  }

  update(delta: number): void {
    const k = this.instant ? 1 : 1 - Math.exp(-EASE_PER_SECOND * Math.max(delta, 0));
    for (const layer of WALL_LAYERS) this.current[layer] += (this.target[layer] - this.current[layer]) * k;
    this.lift += (this.liftTarget - this.lift) * k;
    this.bleed += (this.bleedTarget - this.bleed) * k * 0.5;
    this.apply();
  }

  /** Whether a ray enters the body through the wound's opening rather than through skin. */
  admits(ray: THREE.Ray): boolean {
    const skin = Math.max(this.current.skin, this.target.skin);
    if (skin <= 0.002 || Math.abs(ray.direction.y) < 1e-6) return false;
    const t = (WOUND_CENTRE.y - ray.origin.y) / ray.direction.y;
    if (t < 0) return false;
    const x = ray.origin.x + ray.direction.x * t - WOUND_CENTRE.x;
    const z = ray.origin.z + ray.direction.z * t - WOUND_CENTRE.z;
    const along = (x * INCISION_AXIS.x + z * INCISION_AXIS.y) / HALF_LENGTH;
    const across = (-x * INCISION_AXIS.y + z * INCISION_AXIS.x) / Math.max(HALF_WIDTH_OPEN * skin, MIN_AIM_HALF_WIDTH);
    return along * along + across * across <= 1;
  }

  private apply(): void {
    const open = this.current.skin > 0.002;
    const halfWidth = Math.max(HALF_WIDTH_OPEN * this.current.skin, 0.0005);
    this.skin.set(open ? HALF_LENGTH : 0, open ? halfWidth : 0);
    this.marker.visible = !open;

    for (const wall of this.walls) {
      wall.mesh.visible = open;
      if (open) this.shapeWall(wall, halfWidth);
    }
    for (const flap of this.flaps) {
      const slide = this.current[flap.layer] * FLAP_SLIDE;
      for (const half of flap.halves) {
        half.visible = open;
        half.position.z = (half.userData['side'] as number) * slide;
      }
    }

    const deep = open && this.current.peritoneum > 0.01;
    this.cavity.visible = deep;
    this.organs.group.visible = deep;
    this.organs.group.position.y = WOUND_CENTRE.y + this.lift;

    this.poolMaterial.opacity = this.bleed;
    this.pool.visible = open && this.bleed > 0.01;
    this.pool.scale.set(HALF_LENGTH * 0.85, halfWidth * 0.9, 1);
  }

  private addWall(material: THREE.Material, top: number | 'skin', bottom: number): Wall {
    const count = (RING + 1) * 2;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const uv = new Float32Array(count * 2);
    const index: number[] = [];
    for (let i = 0; i <= RING; i += 1) {
      uv.set([i / RING, 1, i / RING, 0], i * 4);
      // Wound so the faces look inward: top i, bottom i, top i+1, and so on.
      if (i < RING) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(index);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    // The vertices move as the wound opens and the bounds are never recomputed.
    mesh.frustumCulled = false;
    this.shell.add(mesh);
    return { mesh, top, bottom };
  }

  /**
   * Fit a band to the opening. Its top edge goes on the skin exactly round the
   * ellipse the skin material cuts, which is measured in world x/z, and is then
   * carried into the tilted shell; the bottom edge hangs straight below it.
   * Built in the shell's own axes, the rim fell short of the cut at the ends of
   * the incision and left a sliver of nothing showing.
   */
  private shapeWall(wall: Wall, halfWidth: number): void {
    const position = wall.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const normal = wall.mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i <= RING; i += 1) {
      const angle = (i / RING) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const along = HALF_LENGTH * cos;
      const across = halfWidth * sin;
      const x = WOUND_CENTRE.x + INCISION_AXIS.x * along - INCISION_AXIS.y * across;
      const z = WOUND_CENTRE.z + INCISION_AXIS.y * along + INCISION_AXIS.x * across;
      const rim = this.scratch.set(x, (torsoTopY(x, z) ?? WOUND_CENTRE.y) + RIM_LIFT, z).applyMatrix4(this.shellInverse);
      position.setXYZ(i * 2, rim.x, wall.top === 'skin' ? rim.y : wall.top, rim.z);
      position.setXYZ(i * 2 + 1, rim.x, wall.bottom, rim.z);
      // Inward and square to the ellipse, near enough in the shell's axes.
      const nx = -cos / HALF_LENGTH;
      const nz = -sin / halfWidth;
      const length = Math.hypot(nx, nz);
      normal.setXYZ(i * 2, nx / length, 0, nz / length);
      normal.setXYZ(i * 2 + 1, nx / length, 0, nz / length);
    }
    position.needsUpdate = true;
    normal.needsUpdate = true;
  }

  /** The incision line drawn on intact skin, lying on the curve of the torso. */
  private buildMarker(material: THREE.Material): THREE.Mesh {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i += 1) {
      const along = -HALF_LENGTH + (i / 8) * HALF_LENGTH * 2;
      const x = WOUND_CENTRE.x + INCISION_AXIS.x * along;
      const z = WOUND_CENTRE.z + INCISION_AXIS.y * along;
      points.push(new THREE.Vector3(x, (torsoTopY(x, z) ?? WOUND_CENTRE.y) + 0.0008, z));
    }
    return new THREE.Mesh(taperedTube(new THREE.CatmullRomCurve3(points), 0.0008, bothEnds(0.1), 32, 6), material);
  }
}

/** Reverse a geometry's winding and normals, so it is seen from inside. */
function turnInsideOut(geometry: THREE.BufferGeometry): void {
  const index = geometry.getIndex();
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const second = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, second);
    }
  }
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < normal.count; i += 1) normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
}
