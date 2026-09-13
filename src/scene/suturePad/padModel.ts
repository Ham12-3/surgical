import * as THREE from 'three';
import type { Disposer } from '../disposal';
import type { Materials } from '../palette';
import type { PadDimensions } from '../../engine/suturing/types';
import { mergeByMaterial } from '../mergeByMaterial';

/** Metres per millimetre: the engine works in millimetres, the scene in metres. */
export const MM = 0.001;

/**
 * A point in the pad's frame, which is the engine's cross-section carried
 * along the wound: `xMm` across the wound from its midline (+ is the far side,
 * away from the student), `depthMm` below the skin, `alongMm` along the wound
 * from its middle. The pad sits with its skin at y = 0 and its middle at the
 * origin, so this is also the world point, in metres.
 */
export function padToWorld(xMm: number, depthMm: number, alongMm: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(xMm * MM, -depthMm * MM, alongMm * MM);
}

/** Total thickness of the pad, skin to the underside of its backing. */
export function padDepthMm(pad: PadDimensions): number {
  return pad.skinMm + pad.fatMm + pad.fasciaMm + pad.baseMm;
}

/**
 * The practice pad: skin over fat over fascia over a backing, with a straight
 * wound cut through the skin into the fat along its middle.
 *
 * Built as a stack of boxes per layer. Above the wound's floor each layer is
 * cut into a block either side of the wound and one across each end beyond it,
 * so the wound is the gap between them and its walls show the layers the
 * needle passes through; below the floor each layer runs whole. Merged, the
 * pad draws as one call per material.
 */
export function createSuturePad(pad: PadDimensions, materials: Materials, disposer: Disposer): THREE.Group {
  const parts = new THREE.Group();
  const halfWidth = pad.widthMm / 2;
  const halfLength = pad.lengthMm / 2;
  const halfGap = pad.woundGapMm / 2;
  const halfWound = pad.woundLengthMm / 2;

  /** A box from x0 to x1 across, z0 to z1 along, between two depths below the skin (all mm). */
  const block = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    top: number,
    bottom: number,
    material: THREE.Material,
  ): void => {
    const geometry = new THREE.BoxGeometry((x1 - x0) * MM, (bottom - top) * MM, (z1 - z0) * MM);
    const mesh = new THREE.Mesh(geometry, material);
    padToWorld((x0 + x1) / 2, (top + bottom) / 2, (z0 + z1) / 2, mesh.position);
    parts.add(mesh);
  };

  const layers: Array<[thickness: number, material: THREE.Material]> = [
    [pad.skinMm, materials.skin],
    [pad.fatMm, materials.subcutaneous],
    [pad.fasciaMm, materials.fascia],
    [pad.baseMm, materials.paint],
  ];
  let top = 0;
  for (const [thickness, material] of layers) {
    const bottom = top + thickness;
    const cutBottom = Math.min(bottom, pad.woundDepthMm);
    if (top < cutBottom) {
      block(-halfWidth, -halfGap, -halfWound, halfWound, top, cutBottom, material);
      block(halfGap, halfWidth, -halfWound, halfWound, top, cutBottom, material);
      block(-halfWidth, halfWidth, -halfLength, -halfWound, top, cutBottom, material);
      block(-halfWidth, halfWidth, halfWound, halfLength, top, cutBottom, material);
    }
    const wholeTop = Math.max(top, pad.woundDepthMm);
    if (wholeTop < bottom) block(-halfWidth, halfWidth, -halfLength, halfLength, wholeTop, bottom, material);
    top = bottom;
  }

  const merged = mergeByMaterial(parts);
  merged.name = 'suture-pad';
  merged.traverse((object) => {
    object.castShadow = true;
    object.receiveShadow = true;
  });
  disposer.track(merged);
  return merged;
}
