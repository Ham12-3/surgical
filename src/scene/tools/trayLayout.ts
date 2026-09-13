import * as THREE from 'three';
import type { Disposer } from '../disposal';
import type { Materials } from '../palette';
import type { ToolIndex } from '../../engine/toolCatalogue';
import { createToolMesh, isToolMeshKey } from './toolMeshes';
import type { ModelLibrary } from '../modelLibrary';

/**
 * Space left between neighbouring instruments on the tray, in metres: the
 * gap they get when there is room, and the least they are squeezed to.
 */
const GAP = 0.012;
const MIN_GAP = 0.002;

/**
 * The Mayo stand's tray is 0.50 m wide and 0.34 m deep
 * (blender/scripts/assets/env_mayo_stand.py). The row keeps inside its rims,
 * and the tips come no further forward than 2 cm inside the front one.
 */
const USABLE_WIDTH = 0.47;
const MAX_TIP_Z = 0.15;

/**
 * Instruments laid out on the Mayo stand.
 *
 * These are display copies, separate from the instrument the student is
 * holding: the tray should still look laid out while a tool is in use. They are
 * also clickable, so the 3D tray works as a second way to pick up a tool
 * alongside the DOM tray and the number keys.
 *
 * They lie side by side in the order given, each taking as much room as it is
 * wide (a gauze pad takes seven times a pair of forceps), with the tips in a
 * line and each resting on its lowest point. Long laparoscopic instruments are
 * scaled down on the tray so a 33 cm shaft does not overhang the stand.
 * Nothing about the held instrument changes.
 */
export class TrayLayout {
  readonly group = new THREE.Group();

  private readonly byMesh = new Map<THREE.Object3D, string>();

  constructor(
    toolIds: readonly string[],
    tools: ToolIndex,
    materials: Materials,
    disposer: Disposer,
    models: ModelLibrary,
  ) {
    this.group.name = 'tray-instruments';

    const laid: Array<{ toolId: string; mesh: THREE.Group; box: THREE.Box3 }> = [];
    for (const toolId of toolIds) {
      const tool = tools.get(toolId);
      if (!tool || !isToolMeshKey(tool.mesh)) continue;

      // Tray copies never open, so they come merged: a couple of draw calls
      // each instead of one per part.
      const mesh = createToolMesh(tool.mesh, materials, disposer, models, { merged: true });
      // Lay the instrument flat, tip pointing away from the surgeon.
      mesh.rotation.set(-Math.PI / 2, 0, 0);
      if (tool.category === 'laparoscopic') mesh.scale.setScalar(0.55);
      mesh.updateMatrixWorld(true);
      laid.push({ toolId, mesh, box: new THREE.Box3().setFromObject(mesh) });
    }

    // The row is centred across the tray, the gaps narrowing when a full tray
    // needs the room. Tips sit far enough forward that the longest instrument
    // is centred front to back, so nothing hangs off the back.
    const widths = laid.map(({ box }) => box.max.x - box.min.x);
    const instrumentsWidth = widths.reduce((sum, width) => sum + width, 0);
    const gaps = Math.max(1, laid.length - 1);
    const gap = THREE.MathUtils.clamp((USABLE_WIDTH - instrumentsWidth) / gaps, MIN_GAP, GAP);
    const rowWidth = instrumentsWidth + gap * (laid.length - 1);
    if (rowWidth > USABLE_WIDTH) {
      console.warn(
        `The tray's ${laid.length} instruments need ${(rowWidth * 100).toFixed(0)} cm; the tray has ${USABLE_WIDTH * 100}.`,
      );
    }
    const longest = Math.max(0, ...laid.map(({ box }) => box.max.z - box.min.z));
    const tipZ = Math.min(longest / 2, MAX_TIP_Z);

    let left = -rowWidth / 2;
    laid.forEach(({ toolId, mesh, box }, index) => {
      mesh.position.set(left - box.min.x, -box.min.y, tipZ);
      left += (widths[index] ?? 0) + gap;
      this.group.add(mesh);
      // Register every descendant, because the raycaster reports the leaf mesh
      // it actually hit, not the group.
      mesh.traverse((object) => this.byMesh.set(object, toolId));
    });
  }

  /** Which tool, if any, the ray touches. */
  pick(raycaster: THREE.Raycaster): string | null {
    const hits = raycaster.intersectObjects(this.group.children, true);
    for (const hit of hits) {
      const toolId = this.byMesh.get(hit.object);
      if (toolId) return toolId;
    }
    return null;
  }
}
