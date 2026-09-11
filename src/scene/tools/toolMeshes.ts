import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Disposer } from '../disposal';
import type { Materials } from '../palette';
import type { ToolMeshKey } from '../../data/toolMeshKeys';
import type { ToolBuilder } from './toolParts';
import type { ModelLibrary } from '../modelLibrary';
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
 * `../modelLibrary.ts`), otherwise the procedural builder, which stays as the
 * fallback. Geometries are created per call and registered for disposal;
 * materials come from the shared set and are already registered.
 */
export function createToolMesh(
  key: ToolMeshKey,
  materials: Materials,
  disposer: Disposer,
  models: ModelLibrary,
): THREE.Group {
  const group = models.instantiateTool(key, materials) ?? mergeByMaterial(builders[key](materials));
  group.name = `tool-${key}`;
  group.traverse((object) => {
    object.castShadow = true;
  });
  disposer.track(group);
  return group;
}

/** The vertex data every procedural part carries; anything else would stop parts merging. */
const MERGED_ATTRIBUTES = ['position', 'normal', 'uv'];

/**
 * Merge a procedural instrument's parts into one mesh per material.
 *
 * A builder makes a dozen or so small meshes, and each is a draw call, twice
 * over with the lamp's shadow pass. Merged, an instrument draws as two or three
 * meshes, as the Blender models do, which is what keeps a full tray in the wide
 * view under the 150-call budget. The builder's own geometries never reach the
 * GPU and are disposed here; if anything cannot merge, the parts are returned
 * as built.
 */
function mergeByMaterial(built: THREE.Group): THREE.Group {
  built.updateMatrixWorld(true);
  const toRoot = built.matrixWorld.clone().invert();
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const sources = new Set<THREE.BufferGeometry>();
  let mirrored = false;

  built.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const transform = new THREE.Matrix4().multiplyMatrices(toRoot, object.matrixWorld);
    // A mirrored part would come out inside-out once its transform is baked in.
    if (transform.determinant() < 0) mirrored = true;
    const source = object.geometry as THREE.BufferGeometry;
    sources.add(source);
    const part = source.index ? source.toNonIndexed() : source.clone();
    for (const name of Object.keys(part.attributes)) {
      if (!MERGED_ATTRIBUTES.includes(name)) part.deleteAttribute(name);
    }
    part.clearGroups();
    part.applyMatrix4(transform);
    const material = object.material as THREE.Material;
    parts.set(material, [...(parts.get(material) ?? []), part]);
  });

  const meshes: THREE.Mesh[] = [];
  for (const [material, geometries] of parts) {
    const geometry = mirrored ? null : mergeGeometries(geometries);
    for (const part of geometries) part.dispose();
    if (!geometry) {
      for (const mesh of meshes) mesh.geometry.dispose();
      return built;
    }
    meshes.push(new THREE.Mesh(geometry, material));
  }

  for (const source of sources) source.dispose();
  const merged = new THREE.Group();
  merged.add(...meshes);
  return merged;
}
