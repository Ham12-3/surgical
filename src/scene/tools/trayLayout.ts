import * as THREE from 'three';
import type { Disposer } from '../disposal';
import type { Materials } from '../palette';
import type { ToolIndex } from '../../engine/toolCatalogue';
import { createToolMesh, isToolMeshKey } from './toolMeshes';
import type { ModelLibrary } from '../modelLibrary';

/**
 * Instruments laid out on the Mayo stand.
 *
 * These are display copies, separate from the instrument the student is
 * holding: the tray should still look laid out while a tool is in use. They are
 * also clickable, so the 3D tray works as a second way to pick up a tool
 * alongside the DOM tray and the number keys.
 *
 * Long laparoscopic instruments are scaled down on the tray so a 33 cm shaft
 * does not overhang the stand. Nothing about the held instrument changes.
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

    const spacing = 0.055;
    const startX = -((toolIds.length - 1) * spacing) / 2;

    toolIds.forEach((toolId, index) => {
      const tool = tools.get(toolId);
      if (!tool || !isToolMeshKey(tool.mesh)) return;

      const mesh = createToolMesh(tool.mesh, materials, disposer, models);
      // Lay the instrument flat, tip pointing away from the surgeon.
      mesh.rotation.set(-Math.PI / 2, 0, 0);
      mesh.position.set(startX + index * spacing, 0.004, 0.04);

      if (tool.category === 'laparoscopic') mesh.scale.setScalar(0.55);

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
