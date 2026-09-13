import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { abdomenOpenZones } from '../src/data/zones/abdomenOpen';
import { Disposer } from '../src/scene/disposal';
import type { Materials } from '../src/scene/palette';
import { ZoneField } from '../src/scene/models/zones';

/**
 * How far off-centre a pick lands. The step machine compares this with a
 * step's tolerance, so a click dead on a target has to read near 0 whatever
 * shape the zone is, and a click near its edge near 1.
 */

const disposer = new Disposer();
const materials = { zoneHighlight: new THREE.MeshBasicMaterial() } as unknown as Materials;
const zones = new ZoneField(abdomenOpenZones, materials, disposer);
zones.group.updateMatrixWorld(true);
zones.setPickable(new Set(['mcburney_point']));

/** A ray straight down onto (x, z), from well above the patient. */
function downOnto(x: number, z: number): THREE.Raycaster {
  const raycaster = new THREE.Raycaster();
  raycaster.set(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0));
  return raycaster;
}

/** The same point seen at the surgeon camera's slant rather than from overhead. */
function slantOnto(target: THREE.Vector3): THREE.Raycaster {
  const origin = target.clone().add(new THREE.Vector3(0.03, 0.3, 0.29));
  const raycaster = new THREE.Raycaster();
  raycaster.set(origin, target.clone().sub(origin).normalize());
  return raycaster;
}

describe('zone pick offset', () => {
  it('reads 0 for a click dead on a sphere, from above or at a slant', () => {
    const centre = new THREE.Vector3(-0.09, 1.099, 0.11);
    expect(zones.pick(downOnto(centre.x, centre.z))?.offset).toBeCloseTo(0, 5);
    expect(zones.pick(slantOnto(centre))?.offset).toBeCloseTo(0, 5);
  });

  it('grows toward 1 as the click moves out to the edge', () => {
    // The zone's radius is 3 cm.
    expect(zones.pick(downOnto(-0.09 + 0.015, 0.11))?.offset).toBeCloseTo(0.5, 5);
    expect(zones.pick(downOnto(-0.09 + 0.027, 0.11))?.offset).toBeCloseTo(0.9, 5);
  });
});
