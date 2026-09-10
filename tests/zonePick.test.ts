import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { chooseZoneHit, PRIORITY_DEPTH_WINDOW } from '../src/scene/models/zonePick';
import { ZoneField } from '../src/scene/models/zones';
import { Disposer } from '../src/scene/disposal';
import { CAMERA_PRESETS } from '../src/scene/cameras';
import { forearmZones } from '../src/data/zones/forearm';
import type { Materials } from '../src/scene/palette';

describe('chooseZoneHit', () => {
  it('returns -1 when nothing was hit', () => {
    expect(chooseZoneHit([])).toBe(-1);
  });

  it('prefers the nearest hit when priorities are equal', () => {
    const hits = [
      { id: 'far', distance: 0.41, priority: 1 },
      { id: 'near', distance: 0.4, priority: 1 },
    ];
    expect(chooseZoneHit(hits)).toBe(1);
  });

  it('lets a more specific zone win when it overlaps the nearest hit', () => {
    // General skin met first, the wound edge 5 mm further along the same ray.
    const hits = [
      { id: 'skin', distance: 0.4, priority: 0 },
      { id: 'edge', distance: 0.405, priority: 2 },
    ];
    expect(chooseZoneHit(hits)).toBe(1);
  });

  it('does not let a zone behind the target take the pick on priority', () => {
    // The distances from the real bug: near edge at 0.3994 m, bed behind it.
    const hits = [
      { id: 'edge', distance: 0.3994, priority: 2 },
      { id: 'bed', distance: 0.4225, priority: 3 },
    ];
    expect(chooseZoneHit(hits)).toBe(0);
  });

  it('includes a candidate exactly at the edge of the depth window', () => {
    const hits = [
      { id: 'skin', distance: 0.4, priority: 0 },
      { id: 'edge', distance: 0.4 + PRIORITY_DEPTH_WINDOW, priority: 2 },
    ];
    expect(chooseZoneHit(hits)).toBe(1);
  });
});

/**
 * Real raycasts against the shipped forearm zones, from the camera the student
 * starts with. The first case reproduces the bug found by driving clicks in the
 * running app: aiming at the near wound edge registered as the wound bed.
 */
describe('ZoneField.pick on the forearm from the surgeon camera', () => {
  const materials = { zoneHighlight: new THREE.MeshBasicMaterial() } as unknown as Materials;
  const field = new ZoneField(forearmZones, materials, new Disposer());
  // The app gets world matrices from the renderer; with no renderer, update
  // them by hand or every ray misses.
  field.group.updateMatrixWorld(true);

  const fieldCentre = new THREE.Vector3(-0.42, 0.99, 0);
  const [ox, oy, oz] = CAMERA_PRESETS.surgeon.offset;
  const eye = fieldCentre.clone().add(new THREE.Vector3(ox, oy, oz));

  const aimAt = (x: number, y: number, z: number): string | null => {
    const direction = new THREE.Vector3(x, y, z).sub(eye).normalize();
    return field.pick(new THREE.Raycaster(eye.clone(), direction))?.id ?? null;
  };

  it('resolves the near wound edge rather than the bed behind it', () => {
    expect(aimAt(-0.42, 0.987, 0.016)).toBe('wound_edge_near');
  });

  it('resolves the far wound edge', () => {
    expect(aimAt(-0.42, 0.987, -0.016)).toBe('wound_edge_far');
  });

  it('resolves the wound bed when aimed at it', () => {
    expect(aimAt(-0.42, 0.989, 0)).toBe('wound_bed');
  });

  it('resolves skin beside the wound as periwound, not general forearm skin', () => {
    expect(aimAt(-0.42, 0.985, 0.03)).toBe('periwound_skin');
  });

  it('resolves the proximal apex over the wound it sits on', () => {
    expect(aimAt(-0.375, 0.985, 0)).toBe('wound_apex_proximal');
  });
});
