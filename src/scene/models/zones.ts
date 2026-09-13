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
  private pickable: ReadonlySet<string> | null = null;
  private aperture: ((ray: THREE.Ray) => boolean) | null = null;

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

  /** Limit picking to these zones (src/data/zones/layers.ts), or null for all of them. */
  setPickable(ids: ReadonlySet<string> | null): void {
    this.pickable = ids;
  }

  /**
   * How a ray gets below the skin. With a test set, a ray it does not admit
   * reaches no zone deeper than layer 0; the appendectomy's wound admits the
   * rays that pass through its opening.
   */
  setAperture(admits: ((ray: THREE.Ray) => boolean) | null): void {
    this.aperture = admits;
  }

  /** Move zones with the anatomy they sit on, by `offset` from where the manifest puts them. */
  displace(ids: readonly string[], offset: THREE.Vector3): void {
    for (const id of ids) {
      const mesh = this.meshes.get(id);
      const spec = this.specs.get(id);
      if (!mesh || !spec) continue;
      mesh.position.set(...spec.position).add(offset);
      mesh.updateMatrixWorld();
    }
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
    const admitted = this.aperture ? this.aperture(raycaster.ray) : true;
    const hits: THREE.Intersection[] = [];
    const candidates: ZoneCandidate[] = [];

    for (const intersection of intersections) {
      const id = intersection.object.userData['zoneId'] as string | undefined;
      if (!id) continue;
      if (this.pickable && !this.pickable.has(id)) continue;
      if (!admitted && (this.specs.get(id)?.layer ?? 0) > 0) continue;
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
      offset: this.normalisedOffset(id, spec, raycaster.ray),
      avoid: spec.avoid === true,
    };
  }

  /**
   * How far off-centre the student aimed, as a 0..1 fraction of the zone's
   * radius. Steps with a precision tolerance compare against this.
   *
   * It is how close the ray passes to the zone's centre, not how far the hit
   * point is from it: a ray meets a sphere on its surface, a radius from the
   * centre wherever it is aimed, so measuring the hit point read about 1 for
   * every click on a sphere and no tolerance under 1 could ever be met.
   */
  private normalisedOffset(id: string, spec: ZoneSpec, ray: THREE.Ray): number {
    const centre = this.centreOf(id) ?? new THREE.Vector3(...spec.position);
    const radius = boundingRadius(spec);
    return radius > 0 ? Math.min(1, ray.distanceToPoint(centre) / radius) : 0;
  }

  /** A zone kept highlighted whatever the pointer is over (Learn's target), or null. */
  private pinned: string | null = null;
  /** Whether the zone under the pointer is shown; Assessment gives nothing away. */
  private hoverShown = true;
  private hovered: string | null = null;

  setPinned(id: string | null): void {
    this.pinned = id;
    this.refreshHighlight();
  }

  setHoverShown(shown: boolean): void {
    this.hoverShown = shown;
    this.refreshHighlight();
  }

  /** The zone under the pointer, or null; shown translucently unless a zone is pinned or hover is off. */
  highlight(id: string | null): void {
    this.hovered = id;
    this.refreshHighlight();
  }

  private refreshHighlight(): void {
    const id = this.pinned ?? (this.hoverShown ? this.hovered : null);
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

  /** World position of a zone's centre, wherever it has been moved, for snapping a tool to it. */
  centreOf(id: string): THREE.Vector3 | null {
    const mesh = this.meshes.get(id);
    return mesh ? mesh.position.clone() : null;
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
