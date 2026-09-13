import * as THREE from 'three';
import type { Disposer } from '../disposal';

/**
 * A copy of the skin material with an elliptical opening cut out of it, for the
 * torso over the appendectomy wound.
 *
 * The torso is one closed capsule, so the wound cannot be a hole in its
 * geometry. Instead the fragment shader discards whatever lies inside an
 * ellipse seen from straight above, and a matching depth material does the
 * same for the lamp's shadow, so light still reaches into the wound.
 *
 * The ellipse lies in world x/z, centred on the wound, with one radius along
 * the incision and one across it. Either radius at 0 means intact skin.
 */

const HEADER = /* glsl */ `
uniform vec3 uOpeningCentre;
uniform vec2 uOpeningAxis;
uniform vec2 uOpeningRadii;
varying vec3 vOpeningWorld;
`;

// Only the upper surface near the wound is cut: the check on height keeps the
// underside of the torso, directly below, intact.
const DISCARD = /* glsl */ `
if (uOpeningRadii.x > 0.0 && uOpeningRadii.y > 0.0 && vOpeningWorld.y > uOpeningCentre.y - 0.05) {
  vec2 rel = vOpeningWorld.xz - uOpeningCentre.xz;
  float along = dot(rel, uOpeningAxis) / uOpeningRadii.x;
  float across = dot(rel, vec2(-uOpeningAxis.y, uOpeningAxis.x)) / uOpeningRadii.y;
  if (along * along + across * across < 1.0) discard;
}
`;

interface OpeningUniforms {
  [name: string]: THREE.IUniform;
  uOpeningCentre: THREE.IUniform<THREE.Vector3>;
  uOpeningAxis: THREE.IUniform<THREE.Vector2>;
  uOpeningRadii: THREE.IUniform<THREE.Vector2>;
}

export class SkinOpening {
  readonly material: THREE.Material;
  /** For the torso's `customDepthMaterial`, so its shadow has the same hole. */
  readonly depthMaterial: THREE.MeshDepthMaterial;

  private readonly uniforms: OpeningUniforms;

  constructor(skin: THREE.Material, centre: THREE.Vector3, axis: THREE.Vector2, disposer: Disposer) {
    this.uniforms = {
      uOpeningCentre: { value: centre.clone() },
      uOpeningAxis: { value: axis.clone().normalize() },
      uOpeningRadii: { value: new THREE.Vector2(0, 0) },
    };
    // The shadow pass's own depth material uses the default packing, so this
    // one must too.
    this.material = cut(skin.clone(), this.uniforms, 'skin-opening');
    this.depthMaterial = cut(new THREE.MeshDepthMaterial(), this.uniforms, 'skin-opening-depth');
    disposer.register(this.material);
    disposer.register(this.depthMaterial);
  }

  /** Half the opening's length along the incision and half its width across, in metres. */
  set(halfLength: number, halfWidth: number): void {
    this.uniforms.uOpeningRadii.value.set(halfLength, halfWidth);
  }
}

function cut<T extends THREE.Material>(material: T, uniforms: OpeningUniforms, key: string): T {
  material.onBeforeCompile = (shader) => {
    // The same uniform objects go into both programs, so one set() moves both.
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOpeningWorld;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvOpeningWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${HEADER}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${DISCARD}`);
  };
  material.customProgramCacheKey = () => key;
  return material;
}
