import { describe, expect, it } from 'vitest';
import { abdomenOpenZones } from '../src/data/zones/abdomenOpen';
import { forearmZones } from '../src/data/zones/forearm';
import { deepestLayer, pickableZoneIds, zoneIdsOnLayer } from '../src/data/zones/layers';
import { patientModels, zoneManifests } from '../src/data/zones';

describe('layers of a manifest', () => {
  it('lists the zones on one layer', () => {
    expect([...zoneIdsOnLayer(abdomenOpenZones, 4)]).toEqual(['peritoneum']);
    expect(zoneIdsOnLayer(abdomenOpenZones, 5).has('mesoappendix')).toBe(true);
    expect(zoneIdsOnLayer(abdomenOpenZones, 0).has('caecum')).toBe(false);
  });

  it('names every layer of a model that names its layers', () => {
    expect(deepestLayer(abdomenOpenZones)).toBe(5);
    for (const model of patientModels) {
      const names = zoneManifests[model].layerNames;
      if (names) expect(names).toHaveLength(deepestLayer(zoneManifests[model]) + 1);
    }
  });
});

describe('pickableZoneIds', () => {
  it('leaves every zone pickable with no step under way', () => {
    expect(pickableZoneIds(abdomenOpenZones, null)).toBeNull();
    expect(pickableZoneIds(abdomenOpenZones, 'no_such_zone')).toBeNull();
  });

  it("offers the target's own layer and nothing deeper", () => {
    const skin = pickableZoneIds(abdomenOpenZones, 'mcburney_point');
    expect(skin?.has('abdominal_skin')).toBe(true);
    expect(skin?.has('umbilicus')).toBe(true);
    expect(skin?.has('subcutaneous_fat')).toBe(false);
    expect(skin?.has('caecum')).toBe(false);
  });

  it('includes the structure to protect just beneath the layer being cut', () => {
    const peritoneum = pickableZoneIds(abdomenOpenZones, 'peritoneum');
    expect(peritoneum?.has('peritoneum')).toBe(true);
    expect(peritoneum?.has('small_bowel')).toBe(true);
    expect(peritoneum?.has('caecum')).toBe(false);
    expect(peritoneum?.has('internal_oblique')).toBe(false);
  });

  it('offers the whole ileocaecal region together', () => {
    const deep = pickableZoneIds(abdomenOpenZones, 'mesoappendix');
    for (const id of ['caecum', 'appendix_base', 'appendix_body', 'small_bowel']) {
      expect(deep?.has(id)).toBe(true);
    }
    expect(deep?.has('peritoneum')).toBe(false);
  });

  it('changes nothing for a model without layers', () => {
    const first = forearmZones.zones[0];
    expect(first).toBeDefined();
    const ids = pickableZoneIds(forearmZones, first?.id ?? null);
    expect(ids?.size).toBe(forearmZones.zones.length);
  });
});

describe('abdomen-open layers', () => {
  it('puts each layer below the one above it', () => {
    const byLayer = new Map<number, number[]>();
    for (const zone of abdomenOpenZones.zones) {
      const layer = zone.layer ?? 0;
      byLayer.set(layer, [...(byLayer.get(layer) ?? []), zone.position[1]]);
    }
    const layers = [...byLayer.keys()].sort((a, b) => a - b);
    for (let i = 1; i < layers.length; i += 1) {
      const above = byLayer.get(layers[i - 1] ?? 0) ?? [];
      const below = byLayer.get(layers[i] ?? 0) ?? [];
      expect(Math.max(...below)).toBeLessThan(Math.min(...above));
    }
  });

  it('keeps the wall layers level under the skin, and the organs lie as the model places them', () => {
    const wall = abdomenOpenZones.zones.filter((zone) => (zone.layer ?? 0) > 0 && (zone.layer ?? 0) < 5);
    expect(wall.length).toBe(4);
    for (const zone of wall) expect(zone.rotation).toBeUndefined();
    const mesoappendix = abdomenOpenZones.zones.find((zone) => zone.id === 'mesoappendix');
    expect(mesoappendix?.rotation?.[0]).toBe(0);
  });
});
