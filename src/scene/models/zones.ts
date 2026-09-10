import * as THREE from 'three';
import type { Disposer } from '../disposal';
import type { Materials } from '../palette';
import type { ZoneManifest, ZoneSpec } from '../../data/zones';
import { chooseZoneHit, type ZoneCandidate } from './zonePick';

export interface ZoneHit {
  id: string;
  label: string;
  /** World-space point where the ray met the zone. */
  point: THREE.Vector3;
  /** Distance from the zone's centre, normalised: 0 at centre, 1 at the edge. */
  offset: number;
  avoid: boolean;
}

/**
 * The invisible hit-test layer over the patient.
 *
 * Zone meshes are built with `visible = false`. Three's raycaster does not
 * check visibility, so they still hit-test while costing nothing to render.
 * Highlighting a zone simply turns one of them visible with a translucent
 * material.
 */
export class ZoneField {
  readonly group = new THREE.Group();

  private readonly meshes = new Map<string, THREE.Mesh>();
  private readonly specs = new Map<string, ZoneSpec>();
  private highlighted: string | null = null;

  constructor(manifest: ZoneManifest, materials: Materials, disposer: Disposer) {
    this.group.name = `zones-${manifest.model}`;

    for (const spec of manifest.zones) {
      const mesh = new THREE.Mesh(geometryFor(spec), materials.zoneHighlight);
      mesh.position.set(...spec.position);
      if (spec.rotation) mesh.rotation.set(...spec.rotation);
      mesh.visible = false;
      mesh.userData['zoneId'] = spec.id;
      this.group.add(mesh);
      this.meshes.set(spec.id, mesh);
      this.specs.set(spec.id, spec);
    }

    disposer.track(this.group);
  }

  get ids(): string[] {
    return [...this.meshes.keys()];
  }

  has(id: string): boolean {
    return this.meshes.has(id);
  }

  label(id: string): string | undefined {
    return this.specs.get(id)?.label;
  }

  /**
   * Resolve a ray to a single zone.
   *
   * Zones overlap by design (a wound edge sits inside the broader periwound
   * skin), so nearest-hit alone often gives the wrong answer, and highest
   * priority alone lets a zone behind the target steal the click. The rule
   * that balances the two lives in `zonePick.ts`, where it is unit-tested.
   */
  pick(raycaster: THREE.Raycaster): ZoneHit | null {
    const intersections = raycaster.intersectObjects(this.group.children, false);
    const hits: THREE.Intersection[] = [];
    const candidates: ZoneCandidate[] = [];

    for (const intersection of intersections) {
      const id = intersection.object.userData['zoneId'] as string | undefined;
      if (!id) continue;
      hits.push(intersection);
      candidates.push({
        id,
        distance: intersection.distance,
        priority: this.specs.get(id)?.priority ?? 0,
      });
    }

    const best = hits[chooseZoneHit(candidates)];
    if (!best) return null;
    const id = best.object.userData['zoneId'] as string;
    const spec = this.specs.get(id);
    if (!spec) return null;

    return {
      id,
      label: spec.label,
      point: best.point.clone(),
      offset: this.normalisedOffset(spec, best.point),
      avoid: spec.avoid === true,
    };
  }

  /**
   * How far off-centre a hit landed, as a 0..1 fraction of the zone's radius.
   * Steps with a precision tolerance compare against this.
   */
  private normalisedOffset(spec: ZoneSpec, point: THREE.Vector3): number {
    const centre = new THREE.Vector3(...spec.position);
    const distance = centre.distanceTo(point);
    const radius = boundingRadius(spec);
    return radius > 0 ? Math.min(1, distance / radius) : 0;
  }

  /** Show one zone translucently, or clear the highlight with `null`. */
  highlight(id: string | null): void {
    if (this.highlighted === id) return;
    if (this.highlighted) {
      const previous = this.meshes.get(this.highlighted);
      if (previous) previous.visible = false;
    }
    this.highlighted = id;
    if (id) {
      const mesh = this.meshes.get(id);
      if (mesh) mesh.visible = true;
    }
  }

  /** World position of a zone's centre, for snapping a tool to its target. */
  centreOf(id: string): THREE.Vector3 | null {
    const spec = this.specs.get(id);
    return spec ? new THREE.Vector3(...spec.position) : null;
  }

  /** Rough radius of a zone in metres, or 0 if there is no such zone. */
  radiusOf(id: string): number {
    const spec = this.specs.get(id);
    return spec ? boundingRadius(spec) : 0;
  }
}

function geometryFor(spec: ZoneSpec): THREE.BufferGeometry {
  const [a, b] = spec.size;
  switch (spec.shape) {
    case 'box':
      return new THREE.BoxGeometry(spec.size[0], spec.size[1], spec.size[2]);
    case 'sphere':
      return new THREE.SphereGeometry(a, 12, 8);
    case 'cylinder':
      return new THREE.CylinderGeometry(a, a, b, 12);
  }
}

/** Rough radius of a zone, used to normalise precision offsets. */
function boundingRadius(spec: ZoneSpec): number {
  const [a, b, c] = spec.size;
  switch (spec.shape) {
    case 'box':
      return Math.max(a, b, c) / 2;
    case 'sphere':
      return a;
    case 'cylinder':
      return Math.max(a, b / 2);
  }
}
