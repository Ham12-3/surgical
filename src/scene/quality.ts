import type { QualityLevel } from '../store/settings';

/**
 * What each quality level turns on, and what each measured on the target
 * laptop's integrated graphics at 1336x914 on a 1x display:
 *
 * - Medium, the default: the look the scene was tuned at, about 17 ms a frame.
 * - Low: no lamp shadow and a 1x pixel ratio. On a 1x display it measures the
 *   same as Medium; the pixel-ratio cap is what helps HiDPI screens and phones.
 * - High: the brief's post-processing, ambient occlusion and bloom, at about
 *   53 ms a frame, so it is meant for dedicated graphics. Its ambient
 *   occlusion draws the scene a second time for normals, which also doubles
 *   the draw calls.
 */
export interface QualitySettings {
  /** Upper bound on the device pixel ratio. The scene is fragment-bound, so this is the big lever. */
  pixelRatioCap: number;
  shadows: boolean;
  shadowMapSize: number;
  /** Soft glow on the lamp lenses, light panels and the hottest steel highlights. */
  bloom: boolean;
  /** Ground-truth ambient occlusion: contact darkening in creases and under instruments. */
  ambientOcclusion: boolean;
}

export const QUALITY: Record<QualityLevel, QualitySettings> = {
  low: { pixelRatioCap: 1, shadows: false, shadowMapSize: 512, bloom: false, ambientOcclusion: false },
  medium: { pixelRatioCap: 1.5, shadows: true, shadowMapSize: 1024, bloom: false, ambientOcclusion: false },
  high: { pixelRatioCap: 2, shadows: true, shadowMapSize: 2048, bloom: true, ambientOcclusion: true },
};
