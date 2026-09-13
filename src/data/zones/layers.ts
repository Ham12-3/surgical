import type { ZoneManifest } from './types';

/**
 * Which zones can be picked while a step targets `targetZoneId`: every zone on
 * the target's layer, and any structure to protect on the layer just beneath
 * it, which is where a slip lands. With no step under way, or a target the
 * manifest does not have, every zone (null).
 *
 * Without this, a deep zone would be clicked straight through the layers
 * still closed over it, and a superficial one would steal clicks meant for the
 * layer the student has just exposed.
 */
export function pickableZoneIds(manifest: ZoneManifest, targetZoneId: string | null): ReadonlySet<string> | null {
  if (targetZoneId === null) return null;
  const target = manifest.zones.find((zone) => zone.id === targetZoneId);
  if (!target) return null;
  const layer = target.layer ?? 0;
  return new Set(
    manifest.zones
      .filter((zone) => {
        const depth = zone.layer ?? 0;
        return depth === layer || (zone.avoid === true && depth === layer + 1);
      })
      .map((zone) => zone.id),
  );
}
