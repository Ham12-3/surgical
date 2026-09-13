import * as THREE from 'three';

/**
 * Geometry helpers for the shapes the built-in primitives do not cover well:
 * tubes that taper, turned (lathed) profiles, and flat bevelled plates.
 *
 * Between them these cover nearly every surgical instrument and most soft
 * tissue. An instrument is mostly turned parts (handles, shafts, barrels),
 * tapered parts (jaws, tips) and flat stock (blades, retractors, forceps
 * limbs); tissue is mostly tubes that narrow at their ends.
 */

/** Radius multiplier along a tube, where t runs 0 at the start to 1 at the end. */
export type Taper = (t: number) => number;

/** Full radius at the start, narrowing to `tipScale` at the far end. */
export const toTip =
  (tipScale: number): Taper =>
  (t) =>
    1 - (1 - tipScale) * t * t;

/** Narrow at both ends and full in the middle, like a laceration or a vessel. */
export const bothEnds =
  (endScale = 0): Taper =>
  (t) =>
    endScale + (1 - endScale) * Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.6);

/**
 * A tube along a curve whose radius varies along its length.
 *
 * Builds a normal `TubeGeometry` and then scales each ring of vertices toward
 * its centre on the curve. `TubeGeometry` lays vertices out ring by ring —
 * (tubularSegments + 1) rings of (radialSegments + 1) — and samples ring
 * centres with `getPointAt`, so the same sampling recovers each centre here.
 *
 * The original radial normals are kept rather than recomputed: for the gentle
 * tapers used here they are visually correct, and recomputing them would put a
 * hard seam down the tube where its first and last radial vertices meet.
 */
export function taperedTube(
  curve: THREE.Curve<THREE.Vector3>,
  radius: number,
  taper: Taper,
  tubularSegments = 24,
  radialSegments = 10,
): THREE.TubeGeometry {
  const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const centre = new THREE.Vector3();
  const vertex = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i += 1) {
    const t = i / tubularSegments;
    curve.getPointAt(t, centre);
    const scale = Math.max(0, taper(t));
    for (let j = 0; j <= radialSegments; j += 1) {
      const index = i * (radialSegments + 1) + j;
      vertex.fromBufferAttribute(position, index).sub(centre).multiplyScalar(scale).add(centre);
      position.setXYZ(index, vertex.x, vertex.y, vertex.z);
    }
  }

  position.needsUpdate = true;
  return geometry;
}

/**
 * A turned part from a profile of [radius, height] pairs, listed bottom to
 * top. A radius of 0 at either end closes it off.
 */
export function lathe(
  profile: ReadonlyArray<readonly [radius: number, height: number]>,
  segments = 20,
): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    profile.map(([radius, height]) => new THREE.Vector2(radius, height)),
    segments,
  );
}

/**
 * A flat part cut from a 2D outline in XY, extruded to `thickness` along z with
 * softened edges, and centred on z = 0. The bevel is what makes flat steel
 * catch a highlight along its edge instead of looking like card.
 */
export function plate(
  shape: THREE.Shape,
  thickness: number,
  bevel = thickness * 0.3,
): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-5, thickness - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 2,
    curveSegments: 10,
  });
  geometry.translate(0, 0, -thickness / 2 + bevel);
  return geometry;
}

/** Rounded rectangle, centred on x and running from y = 0 up to `height`. */
export function roundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const r = Math.min(radius, width / 2, height / 2);
  const x0 = -width / 2;
  const x1 = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x0 + r, 0);
  shape.lineTo(x1 - r, 0);
  shape.quadraticCurveTo(x1, 0, x1, r);
  shape.lineTo(x1, height - r);
  shape.quadraticCurveTo(x1, height, x1 - r, height);
  shape.lineTo(x0 + r, height);
  shape.quadraticCurveTo(x0, height, x0, height - r);
  shape.lineTo(x0, r);
  shape.quadraticCurveTo(x0, 0, x0 + r, 0);
  return shape;
}

/** A strip narrowing from `baseWidth` at y = length to a rounded tip at y = 0. */
export function taperedStripShape(length: number, baseWidth: number, tipWidth: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-tipWidth / 2, 0);
  shape.quadraticCurveTo(0, -tipWidth * 0.4, tipWidth / 2, 0);
  shape.lineTo(baseWidth / 2, length);
  shape.lineTo(-baseWidth / 2, length);
  shape.closePath();
  return shape;
}

/**
 * Multiply a geometry's UVs in place. Built-in primitives map 0..1 across the
 * whole surface, so a tiling texture needs scaling to land at a real-world size.
 */
export function scaleUvs(geometry: THREE.BufferGeometry, su: number, sv: number): void {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
}
