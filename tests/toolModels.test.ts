import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { isToolMeshKey } from '../src/data/toolMeshKeys';
import {
  TOOL_MODEL_KEYS,
  isModelMaterialKey,
  toolModelPath,
} from '../src/data/toolModels';

/**
 * Checks each Blender-exported instrument against the conventions the scene
 * relies on, reading the glTF JSON straight out of the .glb. A model that
 * broke one would still load, and just look wrong: steel with no brushed
 * grain, an instrument hovering off its tip, or one a hundred times too big.
 */

interface GltfJson {
  materials?: Array<{ name?: string }>;
  meshes?: Array<{
    primitives: Array<{ attributes: Record<string, number>; material?: number }>;
  }>;
  nodes?: Array<{
    mesh?: number;
    translation?: number[];
    rotation?: number[];
    scale?: number[];
    matrix?: number[];
  }>;
  accessors?: Array<{ min?: number[]; max?: number[] }>;
  images?: unknown[];
  textures?: unknown[];
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"

/** A binary glTF is a 12-byte header, then chunks; the first is the JSON. */
function readGlbJson(bytes: Uint8Array): GltfJson {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('not a .glb file');
  if (view.getUint32(4, true) !== 2) throw new Error('not glTF 2.0');
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== JSON_CHUNK) throw new Error('first chunk is not JSON');
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as GltfJson;
}

function modelUrl(key: string): URL {
  return new URL(`../public/models/instruments/${key}.glb`, import.meta.url);
}

describe('instrument model list', () => {
  it('only names real mesh archetypes, once each', () => {
    expect(TOOL_MODEL_KEYS.filter((key) => !isToolMeshKey(key))).toEqual([]);
    expect(new Set(TOOL_MODEL_KEYS).size).toBe(TOOL_MODEL_KEYS.length);
  });

  it('points the scene at the same files this test reads', () => {
    for (const key of TOOL_MODEL_KEYS) {
      expect(modelUrl(key).href.endsWith(`/public/${toolModelPath(key)}`)).toBe(true);
    }
  });
});

describe.each([...TOOL_MODEL_KEYS])('%s model', (key) => {
  const url = modelUrl(key);
  // Read lazily, so a missing file fails the first test below rather than
  // crashing the whole file while tests are being collected.
  const gltf = (): GltfJson => readGlbJson(readFileSync(url));
  const primitives = () => (gltf().meshes ?? []).flatMap((mesh) => mesh.primitives);

  it('has an exported .glb', () => {
    expect(existsSync(url)).toBe(true);
  });

  it('names only palette materials, and uses one on every primitive', () => {
    const names = (gltf().materials ?? []).map((material) => material.name ?? '(unnamed)');
    expect(names.filter((name) => !isModelMaterialKey(name))).toEqual([]);
    expect(primitives().filter((primitive) => primitive.material === undefined)).toEqual([]);
  });

  // The palette's steel carries a brushed roughness map. Without UVs it samples
  // a single texel and the steel goes flat.
  it('carries normals and UVs on every primitive', () => {
    const missing = primitives().filter(
      ({ attributes }) => attributes.NORMAL === undefined || attributes.TEXCOORD_0 === undefined,
    );
    expect(missing).toEqual([]);
  });

  it('embeds no images, since textures are generated in code', () => {
    expect(gltf().images ?? []).toEqual([]);
    expect(gltf().textures ?? []).toEqual([]);
  });

  // The bounds check below reads vertex positions directly, which is only the
  // model's real extent if no node moves, turns or scales its mesh.
  it('bakes every transform into the vertices', () => {
    const moved = (gltf().nodes ?? []).filter(
      (node) =>
        node.mesh !== undefined && (node.translation ?? node.rotation ?? node.scale ?? node.matrix),
    );
    expect(moved).toEqual([]);
  });

  it('sits tip at the origin, body up +y, sized in metres', () => {
    const { accessors = [] } = gltf();
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const primitive of primitives()) {
      const position = accessors[primitive.attributes.POSITION ?? -1];
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis] ?? Infinity, position?.min?.[axis] ?? Infinity);
        max[axis] = Math.max(max[axis] ?? -Infinity, position?.max?.[axis] ?? -Infinity);
      }
    }
    const [width = 0, height = 0, depth = 0] = max.map((value, axis) => value - (min[axis] ?? 0));

    expect(min[1]).toBeCloseTo(0, 3);
    expect(height).toBeGreaterThan(width);
    expect(height).toBeGreaterThan(depth);
    // Instruments run from a few centimetres to about 35 cm (a laparoscope).
    // Outside this range the model was almost certainly exported in cm or mm.
    expect(height).toBeGreaterThan(0.03);
    expect(height).toBeLessThan(0.5);
  });
});
