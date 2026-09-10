import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Disposer } from './disposal';

/**
 * Image-based lighting from a procedurally built room.
 *
 * This is the biggest single realism lever in the scene. Without an
 * environment map, a metallic material has nothing to reflect and renders as
 * flat grey, indistinguishable from plastic. `RoomEnvironment` is a small box
 * room with bright panels that three builds in code — no HDR file download —
 * and `PMREMGenerator` prefilters it into the mip chain physical materials
 * sample from.
 *
 * It is lighting only. The visible background stays the dark theatre colour.
 */
export function applyStudioEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  disposer: Disposer,
  intensity = 0.55,
): void {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  // A little blur softens the room's hard panel edges in reflections, which
  // would otherwise read as a window reflected in every instrument.
  const target = pmrem.fromScene(room, 0.035);

  scene.environment = target.texture;
  scene.environmentIntensity = intensity;

  // The source room and the generator are only needed to bake the map.
  room.dispose();
  pmrem.dispose();

  disposer.add(() => {
    scene.environment = null;
    target.dispose();
  });
}
