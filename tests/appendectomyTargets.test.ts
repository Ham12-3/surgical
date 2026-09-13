import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import appendectomyJson from '../src/data/procedures/openAppendectomy.json';
import { woundStage } from '../src/data/procedures/appendectomyStage';
import { abdomenOpenZones } from '../src/data/zones/abdomenOpen';
import { pickableZoneIds } from '../src/data/zones/layers';
import { Disposer } from '../src/scene/disposal';
import { DELIVERED_ZONE_IDS, DELIVERY_LIFT } from '../src/scene/models/ileocaecum';
import type { Materials } from '../src/scene/palette';
import { ZoneField } from '../src/scene/models/zones';

/**
 * Every step's target can be clicked: aimed straight down at its centre, with
 * the zones the step allows and the caecum lifted when it has been delivered,
 * the pick lands on that zone and within the step's tolerance.
 *
 * Zones overlap, and the higher priority wins, so a zone laid over another
 * silently takes its clicks. The browser run found two that did (the
 * appendicular artery and the appendix body, both over the mesoappendix);
 * this finds the next one without a browser.
 */

const materials = { zoneHighlight: new THREE.MeshBasicMaterial() } as unknown as Materials;
const zones = new ZoneField(abdomenOpenZones, materials, new Disposer());
zones.group.updateMatrixWorld(true);

function downOnto(point: THREE.Vector3): THREE.Raycaster {
  const raycaster = new THREE.Raycaster();
  raycaster.set(new THREE.Vector3(point.x, 2, point.z), new THREE.Vector3(0, -1, 0));
  return raycaster;
}

describe('open appendectomy targets', () => {
  it('can each be picked when their step comes', () => {
    const done = new Set<string>();
    const missed: string[] = [];
    for (const step of appendectomyJson.steps) {
      const { zoneId } = step.target;
      const tolerance = 'tolerance' in step.target ? step.target.tolerance : 1;
      zones.setPickable(pickableZoneIds(abdomenOpenZones, zoneId));
      const lift = woundStage(done).caecumDelivered ? DELIVERY_LIFT : 0;
      zones.displace(DELIVERED_ZONE_IDS, new THREE.Vector3(0, lift, 0));

      const centre = zones.centreOf(zoneId);
      const hit = centre ? zones.pick(downOnto(centre)) : null;
      if (hit?.id !== zoneId || hit.offset > tolerance) missed.push(`${step.id}: aimed at ${zoneId}, picked ${hit?.id ?? 'nothing'}`);
      done.add(step.id);
    }
    expect(missed).toEqual([]);
  });
});
