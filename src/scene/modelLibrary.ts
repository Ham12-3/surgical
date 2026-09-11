import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { Materials } from './palette';
import type { ToolMeshKey } from '../data/toolMeshKeys';
import {
  isModelMaterialKey,
  type AssetEntry,
  type ModelMaterialKey,
} from '../data/assetManifest';

/**
 * Every model in `assets/manifest.json`, loaded once at startup.
 *
 * The loaded scenes are kept as prototypes and never added to a scene, so they
 * never reach the GPU and need no disposal. Each copy handed out gets its own
 * geometry, which the caller registers with that procedure's Disposer exactly
 * like a procedural mesh, and wears the procedure's shared palette materials
 * in place of the ones Blender exported. That keeps modelled and code-built
 * parts in the same materials and environment reflections, and keeps the
 * material count flat.
 */
export class ModelLibrary {
  private constructor(
    private readonly prototypes: ReadonlyMap<string, THREE.Group>,
    private readonly toolAssets: ReadonlyMap<ToolMeshKey, string>,
  ) {}

  /**
   * Fetch every listed model. One that fails to load is logged and skipped, so
   * the scene falls back to a code-built stand-in where it has one, rather
   * than the whole app failing to start.
   */
  static async load(assets: readonly AssetEntry[], baseUrl: string): Promise<ModelLibrary> {
    // Exports are meshopt-compressed (blender/scripts/kit.py). The decoder
    // ships with three and carries its own WebAssembly, so nothing extra is served.
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const settled = await Promise.allSettled(
      assets.map(async (asset) =>
        prepare(asset.id, (await loader.loadAsync(baseUrl + asset.file)).scene),
      ),
    );

    const prototypes = new Map<string, THREE.Group>();
    const toolAssets = new Map<ToolMeshKey, string>();
    settled.forEach((result, index) => {
      const asset = assets[index];
      if (!asset) return;
      if (result.status === 'rejected') {
        console.warn(`Model "${asset.id}" did not load.`, result.reason);
        return;
      }
      prototypes.set(asset.id, result.value);
      if (asset.meshKey) toolAssets.set(asset.meshKey, asset.id);
    });
    return new ModelLibrary(prototypes, toolAssets);
  }

  /** Ids of every model that loaded, in manifest order. */
  get ids(): string[] {
    return [...this.prototypes.keys()];
  }

  /** A fresh copy of model `id` in the given materials, or null if it did not load. */
  instantiate(id: string, materials: Materials): THREE.Group | null {
    const prototype = this.prototypes.get(id);
    if (!prototype) return null;

    const group = prototype.clone();
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry = object.geometry.clone();
      object.material = materials[object.userData.paletteKey as ModelMaterialKey];
    });
    return group;
  }

  /** The model that draws a tool mesh archetype, or null to use its procedural builder. */
  instantiateTool(key: ToolMeshKey, materials: Materials): THREE.Group | null {
    const id = this.toolAssets.get(key);
    return id === undefined ? null : this.instantiate(id, materials);
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
