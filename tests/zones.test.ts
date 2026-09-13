import { describe, expect, it } from 'vitest';
import { patientModels, zoneManifests, zoneIds } from '../src/data/zones';
import type { ZoneSpec } from '../src/data/zones';

/**
 * Structural checks on the zone manifests.
 *
 * The check that matters most, that every zone a procedure's steps target
 * exists in that procedure's manifest, is in procedures.test.ts.
 */
describe('zone manifests', () => {
  it.each(patientModels)('%s has unique zone ids', (model) => {
    const ids = zoneIds(zoneManifests[model]);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it.each(patientModels)('%s declares its own model name', (model) => {
    expect(zoneManifests[model].model).toBe(model);
  });

  it.each(patientModels)('%s gives every zone a usable size', (model) => {
    const bad = zoneManifests[model].zones.filter((zone) => !hasUsableSize(zone));
    expect(bad.map((zone) => zone.id)).toEqual([]);
  });

  it.each(patientModels)('%s gives every zone a human-readable label', (model) => {
    const bad = zoneManifests[model].zones.filter((zone) => zone.label.trim().length === 0);
    expect(bad.map((zone) => zone.id)).toEqual([]);
  });

  it.each(patientModels)('%s keeps zones above the table top', (model) => {
    // A zone below y = 0.9 would be inside the table, which always means a
    // transcription slip rather than a deliberate choice.
    const bad = zoneManifests[model].zones.filter((zone) => zone.position[1] < 0.9);
    expect(bad.map((zone) => `${zone.id}@y=${zone.position[1]}`)).toEqual([]);
  });
});

/** Only the dimensions a shape actually uses have to be positive. */
function hasUsableSize(zone: ZoneSpec): boolean {
  const [a, b, c] = zone.size;
  switch (zone.shape) {
    case 'box':
      return a > 0 && b > 0 && c > 0;
    case 'sphere':
      return a > 0;
    case 'cylinder':
      return a > 0 && b > 0;
  }
}
