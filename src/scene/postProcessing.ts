import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export interface PostProcessingOptions {
  bloom: boolean;
  ambientOcclusion: boolean;
}

/**
 * Ambient occlusion computed at half resolution and scaled up as it is
 * blended. The effect is soft to begin with, so the loss barely shows, and on
 * the target laptop at 1336x914 it cut the pass from about 35 ms to 17 ms.
 * Fewer samples made no difference; the cost is in pixels.
 */
class HalfResolutionGTAOPass extends GTAOPass {
  override setSize(width: number, height: number): void {
    super.setSize(Math.ceil(width / 2), Math.ceil(height / 2));
  }
}

/**
 * The High quality level's chain: the scene, ambient occlusion, bloom, then
 * tone mapping and colour conversion in OutputPass.
 *
 * It renders into a multisampled half-float target, so the scene keeps its
 * antialiasing and bloom sees brightness above 1 instead of clipped white.
 * OutputPass applies the renderer's own tone mapping settings, so apart from
 * the two effects the picture matches Medium.
 *
 * Measured at 1336x914 on the target laptop, over Medium's 17 ms: bloom and
 * the chain around it about 16 ms, half-resolution ambient occlusion about
 * 17 ms more.
 */
export class PostProcessing {
  private readonly composer: EffectComposer;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    options: PostProcessingOptions,
  ) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));

    if (options.ambientOcclusion) {
      const ao = new HalfResolutionGTAOPass(scene, camera, Math.ceil(size.x / 2), Math.ceil(size.y / 2));
      // A radius in metres sized to the field: creases in the drapes, under the
      // instruments on the tray, and where the patient meets the table.
      ao.updateGtaoMaterial({ radius: 0.12, distanceFallOff: 1, thickness: 1, scale: 1 });
      ao.blendIntensity = 0.8;
      this.composer.addPass(ao);
    }
    if (options.bloom) {
      // A threshold above white: the lamp lenses and ceiling panels, drawn
      // brighter than white (palette.ts), glow, and so do the hottest glints
      // on polished steel. At 0.92 the lamp's reflection in the Mayo tray
      // bloomed into a blob.
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.35, 0.4, 1.1));
    }
    this.composer.addPass(new OutputPass());
  }

  render(): void {
    this.composer.render();
  }

  /** In CSS pixels, like the renderer; the composer applies its pixel ratio. */
  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  setPixelRatio(ratio: number): void {
    this.composer.setPixelRatio(ratio);
  }

  dispose(): void {
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
  }
}
