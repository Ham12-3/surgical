import type * as THREE from 'three';
import { PostProcessing } from './postProcessing';
import { QUALITY } from './quality';
import type { Viewer } from './viewer';
import type { QualityLevel } from '../store/settings';

/**
 * Apply a quality level (quality.ts) to a running viewer without rebuilding
 * the room: the pixel-ratio cap, the lamp's shadow and its map size, and
 * whether the frame goes through the post-processing chain.
 */
export function applyQuality(viewer: Viewer, lamp: THREE.SpotLight, level: QualityLevel): void {
  const settings = QUALITY[level];
  viewer.setPixelRatioCap(settings.pixelRatioCap);

  lamp.castShadow = settings.shadows;
  if (lamp.shadow.mapSize.x !== settings.shadowMapSize) {
    lamp.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
    // A shadow map is sized when it is created; drop it so it is rebuilt.
    lamp.shadow.map?.dispose();
    lamp.shadow.map = null;
  }

  const wantsPost = settings.bloom || settings.ambientOcclusion;
  const { renderer, scene, camera } = viewer;
  viewer.setPostProcessing(wantsPost ? new PostProcessing(renderer, scene, camera, settings) : null);
}
