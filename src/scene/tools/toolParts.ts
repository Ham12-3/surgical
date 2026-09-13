import * as THREE from 'three';
import type { Materials } from '../palette';
import { lathe, plate, taperedTube, toTip } from '../geometry';

/**
 * Shared parts for building instruments.
 *
 * Every instrument is modelled with its working tip at the local origin and its
 * body extending up +y, with the jaws opening along x (so the instrument's
 * working plane is XY). The tool controller can then drop any tool onto a
 * target point without knowing its shape.
 */

export type ToolBuilder = (materials: Materials) => THREE.Group;

export function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  material: THREE.Material,
  segments = 14,
): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material,
  );
}

export function box(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
}

export function at<T extends THREE.Object3D>(object: T, x: number, y: number, z = 0): T {
  object.position.set(x, y, z);
  return object;
}

/**
 * Finger rings, curved limbs, ratchet and pivot: the top half shared by
 * scissors, haemostats, needle holders and sponge forceps. Sits above
 * `shaftTop`.
 *
 * Limbs are tapered tubes on a bezier so they sweep out to the rings the way
 * forged instruments do, then flattened, because they are flat stock rather
 * than round rod.
 */
export function ringHandles(materials: Materials, shaftTop: number, spread = 0.011): THREE.Group {
  const group = new THREE.Group();
  const ringGeometry = new THREE.TorusGeometry(0.0115, 0.0024, 10, 28);

  for (const side of [-1, 1]) {
    const start = new THREE.Vector3(side * 0.0016, shaftTop, 0);
    const control = new THREE.Vector3(side * spread * 0.35, shaftTop + 0.022, 0);
    const end = new THREE.Vector3(side * spread * 1.3, shaftTop + 0.04, 0);
    const limb = new THREE.Mesh(
      taperedTube(new THREE.QuadraticBezierCurve3(start, control, end), 0.0026, toTip(0.8), 16, 8),
      materials.steel,
    );
    limb.scale.z = 0.7;
    group.add(limb);

    // Ring set on the end of the limb, continuing its direction of travel, in
    // the same plane the jaws open in.
    const ring = new THREE.Mesh(ringGeometry, materials.steel);
    ring.position.set(end.x + side * 0.0058, end.y + 0.0099, 0);
    group.add(ring);

    // Ratchet teeth just below the rings: what lets a haemostat lock shut.
    const ratchet = box(0.0016, 0.007, 0.0034, materials.steelDark);
    ratchet.position.set(side * spread * 1.05, shaftTop + 0.033, 0);
    ratchet.rotation.z = side * 0.4;
    group.add(ratchet);
  }

  // Box lock and screw where the two halves cross.
  const pivot = new THREE.Mesh(
    lathe(
      [
        [0, -0.0035],
        [0.0048, -0.0035],
        [0.0053, -0.0025],
        [0.0053, 0.0025],
        [0.0048, 0.0035],
        [0, 0.0035],
      ],
      16,
    ),
    materials.steelDark,
  );
  pivot.rotation.x = Math.PI / 2;
  pivot.position.y = shaftTop;
  group.add(pivot);
  return group;
}

/**
 * A pair of jaws tapering to the tip at the origin. `curve` bends both jaws to
 * one side, `thickness` sets how heavy they are — a Metzenbaum and a Kelly
 * differ mostly in those two numbers.
 */
export function jaws(
  materials: Materials,
  length: number,
  thickness: number,
  curve = 0,
): THREE.Group {
  const group = new THREE.Group();
  const bend = curve * length * 0.5;
  for (const side of [-1, 1]) {
    const base = new THREE.Vector3(side * thickness * 0.75, length, 0);
    const control = new THREE.Vector3(side * thickness * 0.6 + bend * 0.2, length * 0.45, 0);
    const tip = new THREE.Vector3(side * thickness * 0.3 + bend, 0, 0);
    const jaw = new THREE.Mesh(
      taperedTube(
        new THREE.QuadraticBezierCurve3(base, control, tip),
        thickness * 0.75,
        toTip(0.4),
        14,
        8,
      ),
      materials.steel,
    );
    jaw.scale.z = 0.8;
    group.add(jaw);
  }
  // Shift so the midpoint of the curved tips sits on the origin. The base moves
  // by the same couple of millimetres, which the pivot hides.
  group.position.x = -bend;
  return group;
}

/** Straight round shaft between `base` and `base + length`. */
export function shaft(
  materials: Materials,
  base: number,
  length: number,
  radius = 0.0045,
): THREE.Mesh {
  return at(cylinder(radius, radius, length, materials.steel), 0, base + length / 2);
}

/**
 * A curved suture needle, as held in a needle holder's jaws. A partial torus
 * is exactly what a 3/8-circle needle is.
 */
export function curvedNeedle(materials: Materials, radius = 0.008): THREE.Mesh {
  const needle = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.00068, 6, 24, Math.PI * 0.75),
    materials.steel,
  );
  needle.rotation.set(0, Math.PI / 2, Math.PI * 0.6);
  return needle;
}

/**
 * A small curved scalpel blade: convex cutting belly on one side, straight
 * spine on the other, tip at the origin. Stylised on a #15 profile.
 */
export function scalpelBlade(materials: Materials): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.0068, 0.0035, 0.006, 0.016);
  shape.lineTo(0.0045, 0.03);
  shape.lineTo(-0.0024, 0.03);
  shape.lineTo(-0.0024, 0.012);
  shape.quadraticCurveTo(-0.002, 0.003, 0, 0);
  return new THREE.Mesh(plate(shape, 0.0005, 0.00012), materials.steel);
}
