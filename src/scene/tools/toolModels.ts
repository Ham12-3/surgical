import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { Materials } from '../palette';
import type { ToolMeshKey } from '../../data/toolMeshKeys';
import {
  isModelMaterialKey,
  type AssetEntry,
  type ModelMaterialKey,
} from '../../data/assetManifest';

/**
 * Instrument models from `assets/manifest.json`, loaded once at startup.
 *
 * The loaded scenes are kept as prototypes and never added to a scene, so they
 * never reach the GPU and need no disposal. Each instrument built from one
 * gets its own copy of the geometry, which `createToolMesh` registers with
 * that procedure's Disposer exactly like a procedural mesh, and wears the
 * procedure's shared palette materials in place of the ones Blender exported.
 * That keeps modelled and procedural instruments in the same brushed steel and
 * environment reflections, and keeps the material count flat.
 */
export class ToolModels {
  private constructor(private readonly prototypes: ReadonlyMap<ToolMeshKey, THREE.Group>) {}

  /**
   * Fetch the model of every manifest entry that draws a tool mesh. One that
   * fails to load is logged and skipped, so that instrument falls back to its
   * procedural builder rather than the whole app failing to start.
   */
  static async load(assets: readonly AssetEntry[], baseUrl: string): Promise<ToolModels> {
    // Exports are meshopt-compressed (blender/scripts/kit.py). The decoder
    // ships with three and carries its own WebAssembly, so nothing extra is served.
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const instruments = assets.filter(
      (asset): asset is AssetEntry & { meshKey: ToolMeshKey } => asset.meshKey !== undefined,
    );
    const settled = await Promise.allSettled(
      instruments.map(async (asset) =>
        prepare(asset.id, (await loader.loadAsync(baseUrl + asset.file)).scene),
      ),
    );

    const prototypes = new Map<ToolMeshKey, THREE.Group>();
    settled.forEach((result, index) => {
      const asset = instruments[index];
      if (!asset) return;
      if (result.status === 'fulfilled') prototypes.set(asset.meshKey, result.value);
      else {
        console.warn(
          `Model "${asset.id}" did not load; using the procedural ${asset.meshKey}.`,
          result.reason,
        );
      }
    });
    return new ToolModels(prototypes);
  }

  /** A fresh copy of the model for `key` in the given materials, or null if none is loaded. */
  instantiate(key: ToolMeshKey, materials: Materials): THREE.Group | null {
    const prototype = this.prototypes.get(key);
    if (!prototype) return null;

    const group = prototype.clone();
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry = object.geometry.clone();
      object.material = materials[object.userData.paletteKey as ModelMaterialKey];
    });
    return group;
  }
}

/** Note which palette material each mesh asks for, rejecting any the palette lacks. */
function prepare(id: string, scene: THREE.Group): THREE.Group {
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const name = (object.material as THREE.Material).name;
    if (!isModelMaterialKey(name)) {
      throw new Error(`Model "${id}" uses material "${name}", which is not a palette key`);
    }
    object.userData.paletteKey = name;
  });
  return scene;
}
