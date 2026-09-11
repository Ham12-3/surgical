/**
 * The meshes an instrument can be drawn with.
 *
 * Each open instrument has its own, so two instruments never look alike on
 * screen (DECISIONS.md, D23); the laparoscopic ones still share archetypes
 * until their phase. Kept here, free of Three.js, so `tools.json` can be
 * validated against it in a plain Node test. `src/scene/tools/toolMeshes.ts`
 * holds the builders and is typed against this list, so adding a key without a
 * builder is a compile error rather than a missing instrument at runtime.
 */
export const TOOL_MESH_KEYS = [
  'swab',
  'gauze',
  'syringe',
  'scalpel',
  'scalpel_15',
  'metzenbaum_scissors',
  'mayo_scissors',
  'suture_scissors',
  'adson_toothed',
  'adson_plain',
  'debakey_forceps',
  'babcock_forceps',
  'kelly_clamp',
  'mosquito_clamp',
  'towel_clip',
  'army_navy_retractor',
  'richardson_retractor',
  'weitlaner_retractor',
  'needle_holder',
  'cautery',
  'suction',
  'skin_stapler',
  'needle',
  'trocar',
  'laparoscope',
  'lap_instrument',
  'clip_applier',
  'bag',
] as const;

export type ToolMeshKey = (typeof TOOL_MESH_KEYS)[number];

export function isToolMeshKey(value: string): value is ToolMeshKey {
  return (TOOL_MESH_KEYS as readonly string[]).includes(value);
}
