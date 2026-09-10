import type { ToolMeshKey } from './toolMeshKeys';

/**
 * Instruments modelled in Blender rather than built in code.
 *
 * Each key here has a script at `blender/instruments/<key>.py` whose export
 * lives at `public/models/instruments/<key>.glb`. Keys not listed still use
 * their procedural builder in `src/scene/tools/`, which is also the fallback
 * if a model fails to load. Kept free of Three.js so a plain Node test can
 * check every listed model exists and follows the scene's conventions.
 */
export const TOOL_MODEL_KEYS = ['needle_holder'] as const satisfies readonly ToolMeshKey[];

/**
 * Palette materials a model may name. The scene swaps each model material for
 * the shared one of the same name, so a model wears the app's steel (and its
 * environment reflections) rather than whatever Blender exported.
 */
export const MODEL_MATERIAL_KEYS = [
  'steel',
  'steelDark',
  'handle',
  'plastic',
  'gauze',
  'suture',
] as const;

export type ModelMaterialKey = (typeof MODEL_MATERIAL_KEYS)[number];

export function isModelMaterialKey(value: string): value is ModelMaterialKey {
  return (MODEL_MATERIAL_KEYS as readonly string[]).includes(value);
}

/** Where a model is served from, relative to the site root (Vite serves `public/` there). */
export function toolModelPath(key: ToolMeshKey): string {
  return `models/instruments/${key}.glb`;
}
