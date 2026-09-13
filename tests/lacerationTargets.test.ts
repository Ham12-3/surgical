import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import lacerationJson from '../src/data/procedures/lacerationRepair.json';
import { FOREARM_WOUND_CENTRE, forearmZones } from '../src/data/zones/forearm';
import { CAMERA_PRESETS, isCameraPreset, type CameraPresetName } from '../src/scene/cameras';
import { Disposer } from '../src/scene/disposal';
import { ZoneField } from '../src/scene/models/zones';
import type { Materials } from '../src/scene/palette';

/**
 * Every laceration repair target can be clicked from the camera in use at
 * that step, over a fair share of the view, the way the appendectomy's are
 * checked (D37, D42). The forearm has no wound opening, so every zone is
 * always in reach; what this guards is a zone laid over another.
 */

const GRID = 40;
const MIN_SHARE = 0.002;
const ASPECT = 956 / 914;
const materials = new Proxy({}, { get: () => new THREE.MeshStandardMaterial() }) as Materials;

function view(preset: CameraPresetName): THREE.PerspectiveCamera {
  const { offset, lookAt } = CAMERA_PRESETS[preset];
  const [cx = 0, cy = 0, cz = 0] = FOREARM_WOUND_CENTRE;
  const camera = new THREE.PerspectiveCamera(42, ASPECT, 0.05, 40);
  camera.position.set(cx + offset[0], cy + offset[1], cz + offset[2]);
  camera.lookAt(cx + lookAt[0], cy + lookAt[1], cz + lookAt[2]);
  camera.updateMatrixWorld();
  return camera;
}

function share(zones: ZoneField, camera: THREE.PerspectiveCamera, zoneId: string): number {
  const raycaster = new THREE.Raycaster();
  let count = 0;
  for (let i = 0; i < GRID; i += 1) {
    for (let j = 0; j < GRID; j += 1) {
      raycaster.setFromCamera(new THREE.Vector2(((i + 0.5) / GRID) * 2 - 1, ((j + 0.5) / GRID) * 2 - 1), camera);
      if (zones.pick(raycaster)?.id === zoneId) count += 1;
    }
  }
  return count / (GRID * GRID);
}

describe('laceration repair targets', () => {
  it("can each be clicked from the camera in use at that step", () => {
    const zones = new ZoneField(forearmZones, materials, new Disposer());
    zones.group.updateMatrixWorld(true);
    let preset: CameraPresetName = 'surgeon';
    const short: string[] = [];
    for (const step of lacerationJson.steps) {
      if ('camera' in step && typeof step.camera === 'string' && isCameraPreset(step.camera)) preset = step.camera;
      const value = share(zones, view(preset), step.target.zoneId);
      if (value < MIN_SHARE) short.push(`${step.id}: ${step.target.zoneId} from ${preset} covers ${(value * 100).toFixed(2)}% of the view`);
    }
    expect(short).toEqual([]);
  }, 30_000);
});
