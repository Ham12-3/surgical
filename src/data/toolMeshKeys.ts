/**
 * The mesh archetypes an instrument can be drawn as.
 *
 * Kept here, free of Three.js, so `tools.json` can be validated against it in a
 * plain Node test. `src/scene/tools/toolMeshes.ts` holds the actual builders and
 * is typed against this list, so adding a key without a builder is a compile
 * error rather than a missing instrument at runtime.
 */
export const TOOL_MESH_KEYS = [
  'swab',
  'syringe',
  'scalpel',
  'scissors',
  'forceps',
  'clamp',
  'retractor',
  'needle_holder',
  'cautery',
  'suction',
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
