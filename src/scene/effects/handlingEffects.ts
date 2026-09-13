import * as THREE from 'three';
import type { Disposer } from '../disposal';
import type { SkinSurface } from '../models/bodySurface';
import type { Materials } from '../palette';

/**
 * What the hand skills leave on the patient: the antiseptic's tint spreading
 * outward, the bleb of anaesthetic under the skin, the irrigation stream and
 * the wet skin it leaves. All restrained: a tint, a small dome, a thin
 * stream; nothing graphic (CLAUDE.md, visual tone).
 */

/** A radial fall-off for the decals: solid in the middle, gone at the rim. */
function radialAlpha(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      const a = Math.max(0, Math.min(1, 1 - (r - 0.55) / 0.45));
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(a * 255);
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

/** A disc laid on the skin, following its height, that grows as it is painted. */
class Decal {
  readonly mesh: THREE.Mesh;
  private readonly centre = new THREE.Vector3();
  private radius = 0;

  constructor(color: number, opacity: number, alphaMap: THREE.Texture, private readonly surface: SkinSurface, disposer: Disposer) {
    const geometry = new THREE.PlaneGeometry(1, 1, 24, 24);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.35,
      transparent: true,
      opacity,
      alphaMap,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    disposer.register(geometry);
    disposer.register(material);
  }

  placeAt(point: THREE.Vector3): void {
    this.centre.copy(point);
    this.setRadius(0);
  }

  get currentRadius(): number {
    return this.radius;
  }

  /** Rebuilt at each size: the vertices sit on the skin under them, so a scale would sink the rim. */
  setRadius(radius: number): void {
    this.radius = radius;
    this.mesh.visible = radius > 0.001;
    if (!this.mesh.visible) return;
    const position = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const uv = this.mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i += 1) {
      const u = uv.getX(i) - 0.5;
      const v = uv.getY(i) - 0.5;
      const x = this.centre.x + u * radius * 2;
      const z = this.centre.z - v * radius * 2;
      const y = (this.surface.heightAt(x, z) ?? this.centre.y) + 0.0006;
      position.setXYZ(i, x, y, z);
    }
    position.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mesh.geometry.computeBoundingSphere();
  }
}

export class HandlingEffects {
  readonly group = new THREE.Group();
  private readonly stain: Decal;
  private readonly wet: Decal;
  private readonly wheal: THREE.Mesh;
  private readonly stream: THREE.Mesh;
  private readonly whealNormal = new THREE.Vector3(0, 1, 0);

  constructor(materials: Materials, private readonly surface: SkinSurface, disposer: Disposer) {
    this.group.name = 'handling-effects';
    const alpha = radialAlpha();
    disposer.register(alpha);
    // Iodine-brown tint, and the faint sheen saline leaves.
    this.stain = new Decal(0xb8681c, 0.42, alpha, surface, disposer);
    this.wet = new Decal(0xd8ecf5, 0.22, alpha, surface, disposer);

    const whealGeometry = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    this.wheal = new THREE.Mesh(whealGeometry, materials.skinBody);
    this.wheal.visible = false;
    this.wheal.castShadow = true;
    disposer.register(whealGeometry);

    // A thin translucent column from the syringe's tip to the wound.
    const streamGeometry = new THREE.CylinderGeometry(0.0012, 0.002, 1, 8, 1, true);
    streamGeometry.translate(0, -0.5, 0);
    const streamMaterial = new THREE.MeshPhysicalMaterial({ color: 0xdff3fb, transparent: true, opacity: 0.55, roughness: 0.1, depthWrite: false });
    this.stream = new THREE.Mesh(streamGeometry, streamMaterial);
    this.stream.visible = false;
    disposer.register(streamGeometry);
    disposer.register(streamMaterial);

    this.group.add(this.stain.mesh, this.wet.mesh, this.wheal, this.stream);
  }

  /** Where the next skill acts: the decals and the bleb centre here. */
  placeAt(point: THREE.Vector3): void {
    this.stain.placeAt(point);
    this.wet.placeAt(point);
    this.whealNormal.copy(this.surface.normalAt(point.x, point.z));
    this.wheal.position.copy(point);
    this.wheal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.whealNormal);
  }

  /** The antiseptic's tint, spreading outward with each wipe; `radius` in metres. */
  setStainRadius(radius: number): void {
    this.stain.setRadius(radius);
  }

  get stainRadius(): number {
    return this.stain.currentRadius;
  }

  setWetRadius(radius: number): void {
    this.wet.setRadius(radius);
  }

  get wetRadius(): number {
    return this.wet.currentRadius;
  }

  /** The bleb of anaesthetic under the skin, 0 to 1: a 1.2 cm dome, 4 mm high, at 1. */
  setWheal(amount: number): void {
    const k = THREE.MathUtils.clamp(amount, 0, 1);
    this.wheal.visible = k > 0.02;
    this.wheal.scale.set(0.012 * k, 0.004 * k, 0.012 * k);
  }

  /** The stream from `from` down to `to`, or hidden. */
  setStream(from: THREE.Vector3 | null, to: THREE.Vector3 | null): void {
    if (!from || !to) {
      this.stream.visible = false;
      return;
    }
    const length = from.distanceTo(to);
    this.stream.visible = length > 0.003;
    this.stream.position.copy(from);
    this.stream.scale.set(1, length, 1);
    this.stream.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
  }

  /** Clear everything, for a new run. */
  reset(): void {
    this.stain.setRadius(0);
    this.wet.setRadius(0);
    this.setWheal(0);
    this.setStream(null, null);
  }
}
