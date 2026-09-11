import * as THREE from 'three';
import type { Disposer } from '../disposal';
import type { Materials } from '../palette';
import { taperedTube } from '../geometry';
import { mergeByMaterial } from '../mergeByMaterial';

/** The suture thread's radius, shared with the live thread. */
export const THREAD_RADIUS = 0.00028;

const steady = (): number => 1;

/**
 * A finished interrupted suture as it lies on the pad: the loop across the
 * wound from where the needle went in to where it came out, the knot beside
 * the entry, and its two cut ends. Static, and merged into one draw call.
 */
export function createStitch(
  entry: THREE.Vector3,
  exit: THREE.Vector3,
  materials: Materials,
  disposer: Disposer,
): THREE.Group {
  const parts = new THREE.Group();
  const across = exit.clone().sub(entry);
  const lift = new THREE.Vector3(0, 0.0011, 0);
  const loop = new THREE.CatmullRomCurve3([
    entry.clone(),
    entry.clone().addScaledVector(across, 0.3).add(lift),
    entry.clone().addScaledVector(across, 0.7).add(lift),
    exit.clone(),
  ]);
  parts.add(new THREE.Mesh(taperedTube(loop, THREAD_RADIUS, steady, 24, 6), materials.suture));

  const outward = across.clone().setY(0).normalize();
  const knotAt = entry.clone().addScaledVector(outward, -0.0012).add(new THREE.Vector3(0, 0.0007, 0));
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.0009, 10, 8), materials.suture);
  knot.scale.set(1, 0.7, 1.3);
  knot.position.copy(knotAt);
  parts.add(knot);

  // The cut ends splay from the knot, one each way along the wound.
  for (const side of [-1, 1]) {
    const end = new THREE.CatmullRomCurve3([
      knotAt.clone(),
      knotAt.clone().addScaledVector(outward, -0.0022).add(new THREE.Vector3(0, 0.0005, side * 0.0022)),
      knotAt.clone().addScaledVector(outward, -0.0036).add(new THREE.Vector3(0, 0.0002, side * 0.0036)),
    ]);
    parts.add(new THREE.Mesh(taperedTube(end, THREAD_RADIUS, steady, 8, 6), materials.suture));
  }

  const merged = mergeByMaterial(parts);
  merged.name = 'stitch';
  merged.traverse((object) => {
    object.castShadow = true;
  });
  disposer.track(merged);
  return merged;
}
