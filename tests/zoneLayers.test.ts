import { describe, expect, it } from 'vitest';
import { abdomenOpenZones } from '../src/data/zones/abdomenOpen';
import { forearmZones } from '../src/data/zones/forearm';
import { pickableZoneIds } from '../src/data/zones/layers';
import { INCISION_TURN } from '../src/scene/models/abdomenFrame';

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

  it("lays its boxes along the incision the scene draws", () => {
    const turned = abdomenOpenZones.zones.filter((zone) => zone.shape === 'box' && zone.rotation);
    expect(turned.length).toBeGreaterThan(0);
    for (const zone of turned) expect(zone.rotation?.[1]).toBeCloseTo(INCISION_TURN, 3);
  });
});
