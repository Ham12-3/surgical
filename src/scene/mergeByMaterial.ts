import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** The vertex data every part carries; anything else would stop parts merging. */
const MERGED_ATTRIBUTES = ['position', 'normal', 'uv'];

/**
 * Merge a group's meshes into one mesh per material, with their transforms
 * baked in.
 *
 * Each mesh is a draw call, twice over with the lamp's shadow pass. A
 * procedural instrument is a dozen or so small meshes and a hinged model a
 * handful; merged, either draws as two or three. That is what keeps a full
 * tray in the wide view under the 150-call budget, at the price of the hinge,
 * which a tray copy never uses.
 *
 * The group's own geometries are disposed, so pass a group whose geometry
 * nothing else shares. If anything cannot merge, the group comes back as it
 * was.
 */
export function mergeByMaterial(built: THREE.Group): THREE.Group {
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
