import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import manifestJson from '../assets/manifest.json';
import {
  ManifestError,
  TRIANGLE_BUDGETS,
  isModelMaterialKey,
  parseAssetManifest,
} from '../src/data/assetManifest';

/**
 * `npm run assets`: the checks every model in assets/manifest.json must pass.
 *
 * Reads the glTF JSON straight out of each .glb rather than loading it, so it
 * runs in plain Node. A model that broke one of these would still load, and
 * just look or behave wrong: steel with no brushed grain, an instrument
 * hovering off its tip, a hinge the app cannot find.
 */

interface GltfPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
  mode?: number;
}

interface GltfJson {
  extensionsRequired?: string[];
  materials?: Array<{ name?: string }>;
  meshes?: Array<{ primitives: GltfPrimitive[] }>;
  nodes?: Array<{
    name?: string;
    mesh?: number;
    translation?: number[];
    rotation?: number[];
    scale?: number[];
    matrix?: number[];
  }>;
  accessors?: Array<{ count: number; min?: number[]; max?: number[] }>;
  images?: unknown[];
  textures?: unknown[];
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"
const TRIANGLES = 4; // glTF primitive mode

/** Extensions the app's loader can decode: meshopt, via three's bundled decoder. */
const SUPPORTED_EXTENSIONS: readonly string[] = ['EXT_meshopt_compression', 'KHR_mesh_quantization'];

/** A binary glTF is a 12-byte header, then chunks; the first is the JSON. */
function readGlbJson(bytes: Uint8Array): GltfJson {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('not a .glb file');
  if (view.getUint32(4, true) !== 2) throw new Error('not glTF 2.0');
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== JSON_CHUNK) throw new Error('first chunk is not JSON');
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as GltfJson;
}

const manifest = parseAssetManifest(manifestJson);
const licences = new TextDecoder().decode(
  readFileSync(new URL('../assets/licenses.md', import.meta.url)),
);

describe('parseAssetManifest', () => {
  const entry = {
    id: 'inst_probe',
    file: 'models/inst_probe.glb',
    category: 'instrument',
    requiredNodes: [],
    source: 'test',
    license: 'original',
    version: 1,
  };
  const manifestOf = (...assets: object[]) => ({ version: 1, assets });

  it('accepts the shipped manifest', () => {
    expect(manifest.assets.length).toBeGreaterThan(0);
  });

  it('rejects an id without its category prefix', () => {
    const bad = manifestOf({ ...entry, id: 'probe', file: 'models/probe.glb' });
    expect(() => parseAssetManifest(bad)).toThrow(ManifestError);
    expect(() => parseAssetManifest(bad)).toThrow(/inst_/);
  });

  it('rejects a file path that does not follow the id', () => {
    const bad = manifestOf({ ...entry, file: 'models/other.glb' });
    expect(() => parseAssetManifest(bad)).toThrow(/models\/inst_probe\.glb/);
  });

  it('rejects a tool mesh on anything but an instrument', () => {
    const prop = {
      ...entry,
      id: 'prop_probe',
      file: 'models/prop_probe.glb',
      category: 'prop',
      meshKey: 'scalpel',
    };
    expect(() => parseAssetManifest(manifestOf(prop))).toThrow(/meshKey/);
  });

  it('rejects an unknown tool mesh', () => {
    expect(() => parseAssetManifest(manifestOf({ ...entry, meshKey: 'spoon' }))).toThrow(/spoon/);
  });

  it('rejects duplicate ids, and two models for one tool mesh', () => {
    expect(() => parseAssetManifest(manifestOf(entry, entry))).toThrow(/duplicate/);
    const other = { ...entry, id: 'inst_probe_two', file: 'models/inst_probe_two.glb' };
    const clash = manifestOf({ ...entry, meshKey: 'scalpel' }, { ...other, meshKey: 'scalpel' });
    expect(() => parseAssetManifest(clash)).toThrow(/already drawn/);
  });
});

describe.each(manifest.assets)('$id', (asset) => {
  const url = new URL(`../public/${asset.file}`, import.meta.url);
  // Read lazily, so a missing file fails the first test below rather than
  // crashing the whole file while tests are being collected.
  const bytes = (): Uint8Array => readFileSync(url);
  const gltf = (): GltfJson => readGlbJson(bytes());
  const primitives = (): GltfPrimitive[] =>
    (gltf().meshes ?? []).flatMap((mesh) => mesh.primitives);

  it('has its exported .glb in public/', () => {
    expect(existsSync(url)).toBe(true);
  });

  it(`stays within the ${asset.category} triangle budget`, () => {
    const { accessors = [] } = gltf();
    expect(primitives().filter((p) => (p.mode ?? TRIANGLES) !== TRIANGLES)).toEqual([]);
    const triangles = primitives().reduce(
      (sum, p) => sum + (accessors[p.indices ?? p.attributes.POSITION ?? -1]?.count ?? 0) / 3,
      0,
    );
    // Printed rather than stored in the manifest, so the figures never go stale.
    console.info(`${asset.id}: ${triangles} triangles, ${Math.round(bytes().byteLength / 1024)} KB`);
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThanOrEqual(TRIANGLE_BUDGETS[asset.category]);
  });

  it('has every named node the app needs', () => {
    const names = new Set((gltf().nodes ?? []).map((node) => node.name));
    expect(asset.requiredNodes.filter((name) => !names.has(name))).toEqual([]);
  });

  it('needs no glTF extension the loader cannot decode', () => {
    const required = gltf().extensionsRequired ?? [];
    expect(required.filter((name) => !SUPPORTED_EXTENSIONS.includes(name))).toEqual([]);
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

  // The bounds check reads vertex positions directly, which is only the
  // model's real extent if no node moves, turns or scales its mesh.
  it('bakes every transform into the vertices', () => {
    const moved = (gltf().nodes ?? []).filter(
      (node) =>
        node.mesh !== undefined && (node.translation ?? node.rotation ?? node.scale ?? node.matrix),
    );
    expect(moved).toEqual([]);
  });

  it('is listed in assets/licenses.md', () => {
    expect(licences).toContain(`| ${asset.id} |`);
  });

  if (asset.category === 'instrument') {
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
  }
});
