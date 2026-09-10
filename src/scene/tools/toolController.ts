import * as THREE from 'three';
import type { Disposer } from '../disposal';
import type { Materials } from '../palette';
import type { PointerTracker } from '../interaction';
import type { ZoneField } from '../models/zones';
import type { ToolIndex } from '../../engine/toolCatalogue';
import { createToolMesh, isToolMeshKey } from './toolMeshes';
import type { ToolModels } from './toolModels';

/** Zones at or below this radius are point targets that a tool snaps onto. */
const SNAP_RADIUS_LIMIT = 0.025;

/** How the held instrument is angled, as if held in a right hand from the near side. */
const HOLD_TILT_X = 0.5;
const HOLD_TILT_Z = -0.42;

export interface Aim {
  zoneId: string | null;
  /** 0 at the zone centre, 1 at its edge. Meaningless when zoneId is null. */
  offset: number;
  point: THREE.Vector3;
  snapped: boolean;
  /** True when the aimed-at zone is flagged as a structure to avoid. */
  avoid: boolean;
}

/**
 * The instrument the student is holding.
 *
 * Meshes are built once per tool id and cached — swapping tools during a
 * procedure should not allocate. Only one is parented into the scene at a time.
 *
 * Snapping is deliberately selective. Point targets (a wound apex, a port site)
 * pull the tip to their centre so the student is not fighting the mouse for
 * sub-millimetre accuracy. Long targets like a wound edge do not snap, because
 * where along the edge the stitch goes is exactly what the step is testing.
 */
export class ToolController {
  readonly group = new THREE.Group();

  private readonly cache = new Map<string, THREE.Group>();
  private readonly reticle: THREE.Mesh;
  private held: THREE.Group | null = null;
  private selectedId: string | null = null;
  private targetZone: string | null = null;
  private readonly aim: Aim = {
    zoneId: null,
    offset: 0,
    point: new THREE.Vector3(),
    snapped: false,
    avoid: false,
  };
  private readonly scratch = new THREE.Vector3();

  constructor(
    private readonly tools: ToolIndex,
    private readonly materials: Materials,
    private readonly disposer: Disposer,
    private readonly fieldHeight: number,
    private readonly models: ToolModels,
  ) {
    this.group.name = 'held-tool';

    // A flat ring under the tip: the clearest possible read of where an action
    // will land, and one draw call.
    const reticleGeometry = new THREE.RingGeometry(0.006, 0.008, 20);
    const reticleMaterial = new THREE.MeshBasicMaterial({
      color: 0x8fe3f2,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    this.reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
    this.reticle.rotation.x = -Math.PI / 2;
    this.reticle.renderOrder = 10;
    this.reticle.visible = false;
    this.group.add(this.reticle);

    disposer.register(reticleGeometry);
    disposer.register(reticleMaterial);
  }

  get selected(): string | null {
    return this.selectedId;
  }

  /** Swap the held instrument, or pass null to put everything down. */
  select(toolId: string | null): void {
    if (this.selectedId === toolId) return;
    if (this.held) this.held.visible = false;
    this.selectedId = toolId;

    if (!toolId) {
      this.held = null;
      this.reticle.visible = false;
      return;
    }

    const mesh = this.meshFor(toolId);
    this.held = mesh;
    if (mesh) {
      mesh.visible = true;
      mesh.rotation.set(HOLD_TILT_X, 0, HOLD_TILT_Z);
    }
  }

  /** The zone the current step wants, so the controller knows what to snap to. */
  setTargetZone(zoneId: string | null): void {
    this.targetZone = zoneId;
  }

  /**
   * Follow the pointer. Returns where the instrument is currently aimed, which
   * is what gets packaged into a `ToolAction` when the student clicks.
   */
  update(pointer: PointerTracker, zones: ZoneField): Aim | null {
    if (!this.held || !pointer.refresh()) {
      this.reticle.visible = false;
      this.aim.zoneId = null;
      return null;
    }

    const hit = zones.pick(pointer.raycaster);
    if (hit) {
      this.aim.zoneId = hit.id;
      this.aim.offset = hit.offset;
      this.aim.avoid = hit.avoid;
      this.aim.point.copy(hit.point);
      this.aim.snapped = false;

      // Snap only for small point targets, and only for the zone this step
      // actually wants — snapping onto the wrong zone would hide the mistake.
      if (hit.id === this.targetZone && zones.radiusOf(hit.id) <= SNAP_RADIUS_LIMIT) {
        const centre = zones.centreOf(hit.id);
        if (centre) {
          this.aim.point.copy(centre);
          this.aim.offset = 0;
          this.aim.snapped = true;
        }
      }
    } else if (pointer.intersectHorizontalPlane(this.fieldHeight, this.scratch)) {
      this.aim.zoneId = null;
      this.aim.offset = 1;
      this.aim.avoid = false;
      this.aim.snapped = false;
      this.aim.point.copy(this.scratch);
    } else {
      this.reticle.visible = false;
      this.aim.zoneId = null;
      return null;
    }

    this.held.position.copy(this.aim.point);
    this.reticle.position.copy(this.aim.point);
    this.reticle.position.y += 0.0015;
    this.reticle.visible = this.aim.zoneId !== null;
    this.reticle.scale.setScalar(this.aim.snapped ? 1.35 : 1);

    return this.aim;
  }

  /** Build (once) and cache the mesh for a tool id. */
  private meshFor(toolId: string): THREE.Group | null {
    const cached = this.cache.get(toolId);
    if (cached) return cached;

    const tool = this.tools.get(toolId);
    if (!tool || !isToolMeshKey(tool.mesh)) {
      console.warn(`No mesh archetype "${tool?.mesh ?? '?'}" for tool "${toolId}"`);
      return null;
    }

    const mesh = createToolMesh(tool.mesh, this.materials, this.disposer, this.models);
    mesh.visible = false;
    this.cache.set(toolId, mesh);
    this.group.add(mesh);
    return mesh;
  }
}
