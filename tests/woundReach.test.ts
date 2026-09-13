import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import appendectomyJson from '../src/data/procedures/openAppendectomy.json';
import { layerStage, woundStage, type WoundStage } from '../src/data/procedures/appendectomyStage';
import { abdomenOpenZones } from '../src/data/zones/abdomenOpen';
import { pickableZoneIds, zoneIdsOnLayer } from '../src/data/zones/layers';
import { quizzable } from '../src/engine/anatomyQuiz';
import { CAMERA_PRESETS, isCameraPreset, woundCamera, type CameraPresetName } from '../src/scene/cameras';
import { Disposer } from '../src/scene/disposal';
import { OPEN_FIELD_CENTRE } from '../src/scene/models/abdomenFrame';
import { AbdomenWound } from '../src/scene/models/abdomenWound';
import { DELIVERED_ZONE_IDS } from '../src/scene/models/ileocaecum';
import { ZoneField } from '../src/scene/models/zones';
import type { Materials } from '../src/scene/palette';

/**
 * Every target can be clicked from the camera the student has at that moment,
 * through the wound as it is then, over a fair share of the view.
 *
 * Checking each target's centre from straight above (appendectomyTargets.test.ts)
 * missed this: from the "close" camera the procedure left the student with, the
 * rays to the mesoappendix, the target of four steps, all crossed the skin
 * outside the opening, so it could not be clicked at all. This aims across a
 * grid of the whole view instead, the way a student's clicks would land.
 */

const GRID = 48;
/** The smallest share of the view a target may cover and still count as clickable. */
const MIN_SHARE = 0.002;
/** The procedure screen's view beside its panel, at 1336 x 914. */
const ASPECT = 956 / 914;
/** A grid of picks for every step takes a few seconds, more when the suite runs in parallel. */
const TIMEOUT_MS = 30_000;

// Nothing is drawn, so any material will do.
const materials = new Proxy({}, { get: () => new THREE.MeshStandardMaterial() }) as Materials;

function rig(): { zones: ZoneField; wound: AbdomenWound } {
  const disposer = new Disposer();
  const zones = new ZoneField(abdomenOpenZones, materials, disposer);
  const wound = new AbdomenWound(materials, disposer);
  zones.setAperture((ray) => wound.admits(ray));
  return { zones, wound };
}

function settle(zones: ZoneField, wound: AbdomenWound, stage: WoundStage): void {
  wound.setStage(stage);
  for (let i = 0; i < 120; i += 1) wound.update(1 / 30);
  zones.displace(DELIVERED_ZONE_IDS, new THREE.Vector3(0, wound.deliveryLift, 0));
  zones.group.updateMatrixWorld(true);
}

function view(preset: CameraPresetName): THREE.PerspectiveCamera {
  const { offset, lookAt } = CAMERA_PRESETS[preset];
  const camera = new THREE.PerspectiveCamera(42, ASPECT, 0.05, 40);
  camera.position.set(OPEN_FIELD_CENTRE.x + offset[0], OPEN_FIELD_CENTRE.y + offset[1], OPEN_FIELD_CENTRE.z + offset[2]);
  camera.lookAt(OPEN_FIELD_CENTRE.x + lookAt[0], OPEN_FIELD_CENTRE.y + lookAt[1], OPEN_FIELD_CENTRE.z + lookAt[2]);
  camera.updateMatrixWorld();
  return camera;
}

/** The share of the view on which a click picks `zoneId`. */
function share(zones: ZoneField, camera: THREE.PerspectiveCamera, zoneId: string): number {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let count = 0;
  for (let i = 0; i < GRID; i += 1) {
    for (let j = 0; j < GRID; j += 1) {
      ndc.set(((i + 0.5) / GRID) * 2 - 1, ((j + 0.5) / GRID) * 2 - 1);
      raycaster.setFromCamera(ndc, camera);
      if (zones.pick(raycaster)?.id === zoneId) count += 1;
    }
  }
  return count / (GRID * GRID);
}

function describeShort(what: string, zoneId: string, preset: string, value: number): string {
  return `${what}: ${zoneId} from ${preset} covers ${(value * 100).toFixed(2)}% of the view`;
}

describe('reaching into the open abdomen', () => {
  it("lets each appendectomy step's target be clicked from the camera in use at that step", () => {
    const { zones, wound } = rig();
    const done = new Set<string>();
    // The procedure screen starts on the surgeon's view; a step with a camera moves it.
    let preset: CameraPresetName = 'surgeon';
    const short: string[] = [];
    for (const step of appendectomyJson.steps) {
      if ('camera' in step && isCameraPreset(step.camera)) preset = step.camera;
      settle(zones, wound, woundStage(done));
      zones.setPickable(pickableZoneIds(abdomenOpenZones, step.target.zoneId));
      const value = share(zones, view(preset), step.target.zoneId);
      if (value < MIN_SHARE) short.push(describeShort(step.id, step.target.zoneId, preset, value));
      done.add(step.id);
    }
    expect(short).toEqual([]);
  }, TIMEOUT_MS);

  it('lets each structure the explorer asks about be clicked from its camera for that layer', () => {
    const { zones, wound } = rig();
    const structures = quizzable(
      abdomenOpenZones.zones
        .filter((zone) => (zone.priority ?? 0) >= 0)
        .map((zone) => ({ id: zone.id, label: zone.label, layer: zone.layer ?? 0 })),
    );
    const short: string[] = [];
    for (const structure of structures) {
      const preset = woundCamera(structure.layer);
      settle(zones, wound, layerStage(structure.layer));
      zones.setPickable(zoneIdsOnLayer(abdomenOpenZones, structure.layer));
      const value = share(zones, view(preset), structure.id);
      if (value < MIN_SHARE) short.push(describeShort('quiz', structure.id, preset, value));
    }
    expect(short).toEqual([]);
  }, TIMEOUT_MS);
});
