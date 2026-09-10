import * as THREE from 'three';
import type { Disposer } from '../disposal';
import type { Materials } from '../palette';
import type { ToolMeshKey } from '../../data/toolMeshKeys';
import type { ToolBuilder } from './toolParts';
import type { ToolModels } from './toolModels';
import { openBuilders } from './toolBuildersOpen';
import { lapBuilders } from './toolBuildersLap';

export { TOOL_MESH_KEYS, isToolMeshKey, type ToolMeshKey } from '../../data/toolMeshKeys';

/**
 * Registry of procedural instrument meshes, one builder per archetype named in
 * the `mesh` field of `src/data/tools.json`.
 *
 * Typed as a full `Record<ToolMeshKey, ToolBuilder>`, so adding a key to
 * `toolMeshKeys.ts` without writing its builder is a compile error rather than
 * an instrument that silently fails to appear.
 */
const builders: Record<ToolMeshKey, ToolBuilder> = { ...openBuilders, ...lapBuilders };

/**
 * Build a tool mesh: the Blender model if one is loaded for this key (see
 * `toolModels.ts`), otherwise the procedural builder, which stays as the
 * fallback. Geometries are created per call and registered for disposal;
 * materials come from the shared set and are already registered.
 */
export function createToolMesh(
  key: ToolMeshKey,
  materials: Materials,
  disposer: Disposer,
  models: ToolModels,
): THREE.Group {
  const group = models.instantiate(key, materials) ?? builders[key](materials);
  group.name = `tool-${key}`;
  group.traverse((object) => {
    object.castShadow = true;
  });
  disposer.track(group);
  return group;
}
