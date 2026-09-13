import { isToolMeshKey, type ToolMeshKey } from './toolMeshKeys';

/**
 * The asset manifest, `assets/manifest.json`: every model the app loads, what
 * it is, where it came from, and which named parts it must contain.
 *
 * Only authored facts live in the manifest. Triangle counts and file sizes are
 * measured from the .glb by `npm run assets` (tests/assetManifest.test.ts), so
 * they cannot drift from the file. Validated here rather than trusted, like
 * tools.json, and kept free of Three.js so that check runs in plain Node.
 */

export const ASSET_CATEGORIES = ['instrument', 'anatomy', 'environment', 'prop'] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

/** Every id starts with its category's prefix, so a file name says what it is. */
export const ID_PREFIXES: Record<AssetCategory, string> = {
  instrument: 'inst_',
  anatomy: 'anat_',
  environment: 'env_',
  prop: 'prop_',
};

/**
 * Most triangles a single model may have. The instrument, hero (anatomy) and
 * prop figures come from the brief; environment pieces get the hero budget
 * until a real one is measured (DECISIONS.md, D9).
 */
export const TRIANGLE_BUDGETS: Record<AssetCategory, number> = {
  instrument: 15_000,
  anatomy: 60_000,
  environment: 60_000,
  prop: 5_000,
};

/**
 * Palette materials a model may name (keys of `Materials` in
 * src/scene/palette.ts). The scene swaps each model material for the shared one
 * of the same name, so a model wears the app's steel and environment
 * reflections rather than whatever Blender exported.
 */
export const MODEL_MATERIAL_KEYS = [
  'steel',
  'steelDark',
  'steelSatin',
  'handle',
  'plastic',
  'gauze',
  'suture',
  'paint',
  'tableTop',
  'wall',
  'floor',
  'lightLens',
  'screen',
  'drape',
  'drapeDark',
  // Tissue, since Phase 6 brings the body and organs in as models (D43).
  'skin',
  'subcutaneous',
  'muscle',
  'fascia',
  'bowel',
  'artery',
  'wound',
] as const;

export type ModelMaterialKey = (typeof MODEL_MATERIAL_KEYS)[number];

/** The pivot nodes a hinged instrument carries (blender/scripts/kit_shapes.py, hinge()). */
export const HINGE_NODES = ['jaw_upper', 'jaw_lower'] as const;

/**
 * The axis a hinge's pivots turn about, in the instrument's own frame. `z`,
 * the thickness axis, is the default: jaws that open in the plane of the
 * rings. `x` is for thumb forceps, whose limbs face each other through the
 * thickness and spring apart along it, so they lie flat on the tray.
 */
export const HINGE_AXES = ['z', 'x'] as const;
export type HingeAxis = (typeof HINGE_AXES)[number];

export function isModelMaterialKey(value: string): value is ModelMaterialKey {
  return (MODEL_MATERIAL_KEYS as readonly string[]).includes(value);
}

export interface AssetEntry {
  id: string;
  /** Relative to the site root, and always `models/<id>.glb`. */
  file: string;
  category: AssetCategory;
  /** Instruments and props (a gauze swab) only: the tools.json mesh this model draws. */
  meshKey?: ToolMeshKey;
  /** Named nodes the app animates or hit-tests, such as `jaw_upper` or `grip_point`. */
  requiredNodes: string[];
  /** Hinged instruments only: how far the jaws open, in degrees, from shut to fully open. */
  hingeDegrees?: number;
  /** Hinged instruments only: the axis the pivots turn about, `z` when not given. */
  hingeAxis?: HingeAxis;
  /** Where it came from, such as the bpy script that builds it. */
  source: string;
  license: string;
  version: number;
}

export interface AssetManifest {
  version: number;
  assets: AssetEntry[];
}

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

function isAssetCategory(value: string): value is AssetCategory {
  return (ASSET_CATEGORIES as readonly string[]).includes(value);
}

function requireString(value: unknown, field: string, context: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ManifestError(`${context}: "${field}" must be a non-empty string`);
  }
  return value;
}

function parseEntry(raw: unknown, index: number): AssetEntry {
  if (typeof raw !== 'object' || raw === null) {
    throw new ManifestError(`asset at index ${index}: expected an object`);
  }
  const record = raw as Record<string, unknown>;
  const id = requireString(record['id'], 'id', `asset at index ${index}`);
  const context = `asset "${id}"`;
  if (!/^[a-z][a-z0-9_]*$/.test(id)) {
    throw new ManifestError(`${context}: ids are snake_case`);
  }

  const category = requireString(record['category'], 'category', context);
  if (!isAssetCategory(category)) {
    throw new ManifestError(`${context}: unknown category "${category}"`);
  }
  const prefix = ID_PREFIXES[category];
  if (!id.startsWith(prefix)) {
    throw new ManifestError(`${context}: ${category} ids start with "${prefix}"`);
  }

  const file = requireString(record['file'], 'file', context);
  if (file !== `models/${id}.glb`) {
    throw new ManifestError(`${context}: file should be "models/${id}.glb", not "${file}"`);
  }

  const requiredNodes = record['requiredNodes'];
  if (
    !Array.isArray(requiredNodes) ||
    !requiredNodes.every((node): node is string => typeof node === 'string' && node.length > 0)
  ) {
    throw new ManifestError(`${context}: "requiredNodes" must be an array of node names`);
  }

  const version = record['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new ManifestError(`${context}: "version" must be a whole number from 1`);
  }

  const entry: AssetEntry = {
    id,
    file,
    category,
    requiredNodes,
    source: requireString(record['source'], 'source', context),
    license: requireString(record['license'], 'license', context),
    version,
  };

  const meshKey = record['meshKey'];
  if (meshKey !== undefined) {
    if (category !== 'instrument' && category !== 'prop') {
      throw new ManifestError(`${context}: only instruments and props have a meshKey`);
    }
    if (typeof meshKey !== 'string' || !isToolMeshKey(meshKey)) {
      throw new ManifestError(`${context}: unknown meshKey "${String(meshKey)}"`);
    }
    entry.meshKey = meshKey;
  }

  const hingeDegrees = record['hingeDegrees'];
  if (hingeDegrees !== undefined) {
    if (category !== 'instrument') {
      throw new ManifestError(`${context}: only instruments have a hinge`);
    }
    if (typeof hingeDegrees !== 'number' || !(hingeDegrees > 0 && hingeDegrees <= 90)) {
      throw new ManifestError(`${context}: "hingeDegrees" must be more than 0 and at most 90`);
    }
    const missing = HINGE_NODES.filter((name) => !requiredNodes.includes(name));
    if (missing.length > 0) {
      throw new ManifestError(`${context}: a hinged model must require ${missing.join(' and ')}`);
    }
    entry.hingeDegrees = hingeDegrees;
  }

  const hingeAxis = record['hingeAxis'];
  if (hingeAxis !== undefined) {
    if (entry.hingeDegrees === undefined) {
      throw new ManifestError(`${context}: "hingeAxis" needs a "hingeDegrees"`);
    }
    if (typeof hingeAxis !== 'string' || !(HINGE_AXES as readonly string[]).includes(hingeAxis)) {
      throw new ManifestError(`${context}: "hingeAxis" must be one of ${HINGE_AXES.join(', ')}`);
    }
    entry.hingeAxis = hingeAxis as HingeAxis;
  }
  return entry;
}

export function parseAssetManifest(raw: unknown): AssetManifest {
  if (typeof raw !== 'object' || raw === null) {
    throw new ManifestError('manifest: expected an object');
  }
  const record = raw as Record<string, unknown>;
  const version = record['version'];
  if (typeof version !== 'number') {
    throw new ManifestError('manifest: "version" must be a number');
  }
  const rawAssets = record['assets'];
  if (!Array.isArray(rawAssets)) {
    throw new ManifestError('manifest: "assets" must be an array');
  }

  const assets = rawAssets.map(parseEntry);
  const ids = new Set<string>();
  const drawnBy = new Map<ToolMeshKey, string>();
  for (const asset of assets) {
    if (ids.has(asset.id)) throw new ManifestError(`duplicate asset id "${asset.id}"`);
    ids.add(asset.id);
    if (asset.meshKey === undefined) continue;
    const other = drawnBy.get(asset.meshKey);
    if (other) {
      throw new ManifestError(
        `asset "${asset.id}": tool mesh "${asset.meshKey}" is already drawn by "${other}"`,
      );
    }
    drawnBy.set(asset.meshKey, asset.id);
  }

  return { version, assets };
}
