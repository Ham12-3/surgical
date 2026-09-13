import * as THREE from 'three';
import type { Disposer } from './disposal';
import type { SceneTextures } from './textures';

/**
 * Shared colours and materials.
 *
 * Every mesh in the scene pulls from this one set rather than newing up its own
 * material. That keeps the look consistent and means disposal is a handful of
 * objects instead of hundreds.
 *
 * Materials are physically based and lean on the environment map set up in
 * `environment.ts`: the steel is fully metallic and gets its look almost
 * entirely from reflections, and exposed tissue carries a thin clearcoat,
 * because moist tissue catching the light is what reads as tissue rather than
 * painted clay. Colours stay muted and textbook-like — students use this in
 * libraries and on shared screens.
 *
 * The scene is fragment-bound, so the per-pixel physical features (sheen,
 * clearcoat) are reserved for materials that cover little of the screen.
 * Measured on the forearm view, clearcoat cost ~5 ms and sheen ~2.5 ms a frame
 * while they sat on the skin and drapes. Profile with `__trainer.profile()` in
 * the dev console before putting either back on a large surface.
 */
export const colors = {
  floor: 0x1f252c,
  wall: 0x161a20,
  lightWarm: 0xfff4e2,
} as const;

export interface Materials {
  floor: THREE.Material;
  steel: THREE.Material;
  steelDark: THREE.Material;
  /** Satin stainless for trays, rough enough that the lamp's reflection spreads rather than clipping. */
  steelSatin: THREE.Material;
  handle: THREE.Material;
  tableTop: THREE.Material;
  drape: THREE.Material;
  drapeDark: THREE.Material;
  skin: THREE.Material;
  /** The body model's skin: the same look, with the pores scaled for its UV atlas. */
  skinBody: THREE.Material;
  subcutaneous: THREE.Material;
  muscle: THREE.Material;
  fascia: THREE.Material;
  bowel: THREE.Material;
  liver: THREE.Material;
  gallbladder: THREE.Material;
  duct: THREE.Material;
  artery: THREE.Material;
  wound: THREE.Material;
  suture: THREE.Material;
  /** Woven cotton: swabs and sponges. */
  gauze: THREE.Material;
  /** Translucent barrel for syringes and trocar heads. */
  plastic: THREE.Material;
  /** The surgeon's glove. */
  glove: THREE.Material;
  lightLens: THREE.Material;
  /** Powder-coated equipment: table column and base, stands, housings. */
  paint: THREE.Material;
  /** Theatre wall panels. */
  wall: THREE.Material;
  /** Monitor screen. The vitals display draws onto its map. */
  screen: THREE.MeshBasicMaterial;
  /** Translucent overlay used when a zone is highlighted as the step target. */
  zoneHighlight: THREE.Material;
}

/** Moist tissue: matte base with a thin glossy coat on top. */
function tissue(color: number, roughness: number, wetness: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    clearcoat: wetness,
    clearcoatRoughness: 0.3,
  });
}

/** Build the shared material set and register all of it for disposal. */
export function createMaterials(disposer: Disposer, textures: SceneTextures): Materials {
  // Capsule and sphere UVs run 0..1 around the whole body part, so the pore
  // texture repeats a few times to land at a believable scale. The body
  // model's atlas spreads the whole body over one UV square, so its pores
  // need many more repeats to come out the same size.
  textures.skinNormal.repeat.set(4, 4);
  const bodyPores = textures.skinNormal.clone();
  bodyPores.repeat.set(90, 90);
  bodyPores.needsUpdate = true;
  disposer.register(bodyPores);

  // Drapes cover more of the screen than anything else, so they get the
  // cheapest material that still reads as fabric: standard rather than
  // physical, with the weave carried by the normal map.
  const drapeBase = {
    roughness: 0.9,
    normalMap: textures.clothNormal,
    normalScale: new THREE.Vector2(0.6, 0.6),
    side: THREE.DoubleSide,
  } as const;

  const materials: Materials = {
    floor: new THREE.MeshStandardMaterial({ color: colors.floor, roughness: 0.55 }),

    // Polished instrument steel. Near-white base because metal takes its
    // colour from what it reflects; the brushed map breaks up the highlight.
    steel: new THREE.MeshPhysicalMaterial({
      color: 0xd4dade,
      metalness: 1,
      roughness: 0.22,
      roughnessMap: textures.brushedRoughness,
    }),
    steelDark: new THREE.MeshPhysicalMaterial({
      color: 0x8c959e,
      metalness: 0.95,
      roughness: 0.38,
      roughnessMap: textures.brushedRoughness,
    }),
    // The brushed map holds absolute roughness, around 0.22, and three
    // multiplies it by `roughness`; 2.2 lands this near 0.48. At the other
    // steels' factors the tray under the lamp clipped to white.
    steelSatin: new THREE.MeshPhysicalMaterial({
      color: 0xa4adb5,
      metalness: 1,
      roughness: 2.2,
      roughnessMap: textures.brushedRoughness,
    }),
    handle: new THREE.MeshPhysicalMaterial({
      color: 0x2c3239,
      roughness: 0.42,
      clearcoat: 0.3,
      clearcoatRoughness: 0.4,
    }),
    tableTop: new THREE.MeshStandardMaterial({ color: 0x3a434d, roughness: 0.6 }),

    drape: new THREE.MeshStandardMaterial({ ...drapeBase, color: 0x3a6978 }),
    drapeDark: new THREE.MeshStandardMaterial({ ...drapeBase, color: 0x2c5260 }),

    // Skin: soft sheen approximates the way light scatters just under the
    // surface, which is the main thing separating skin from painted plastic,
    // so it earns its cost. It had a 0.06 clearcoat too, which was invisible
    // but still paid for the full clearcoat pass on every skin pixel.
    skin: new THREE.MeshPhysicalMaterial({
      color: 0xd8a284,
      roughness: 0.58,
      sheen: 0.35,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color(0xffd9c6),
      normalMap: textures.skinNormal,
      normalScale: new THREE.Vector2(0.28, 0.28),
    }),
    skinBody: new THREE.MeshPhysicalMaterial({
      color: 0xd8a284,
      roughness: 0.58,
      sheen: 0.35,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color(0xffd9c6),
      normalMap: bodyPores,
      normalScale: new THREE.Vector2(0.28, 0.28),
    }),

    subcutaneous: tissue(0xe4c58f, 0.5, 0.35),
    muscle: tissue(0x9a4e47, 0.52, 0.45),
    fascia: tissue(0xe2dac9, 0.38, 0.5),
    bowel: tissue(0xc98d74, 0.42, 0.6),
    liver: tissue(0x7a3c37, 0.36, 0.7),
    gallbladder: tissue(0x5f7a46, 0.3, 0.75),
    duct: tissue(0xa9b67a, 0.36, 0.6),
    artery: tissue(0x9e3a3a, 0.4, 0.55),
    // Moist rather than bloody: a deep muted red with a clear sheen.
    wound: tissue(0x8b3f3a, 0.4, 0.6),

    suture: new THREE.MeshPhysicalMaterial({ color: 0x1b1f26, roughness: 0.38 }),
    gauze: new THREE.MeshPhysicalMaterial({
      color: 0xf0ede4,
      roughness: 0.95,
      sheen: 0.4,
      sheenColor: new THREE.Color(0xffffff),
      normalMap: textures.clothNormal,
      normalScale: new THREE.Vector2(0.9, 0.9),
    }),
    // Nitrile: a pale, faintly glossy skin over the hand, with no pores.
    glove: new THREE.MeshPhysicalMaterial({ color: 0xd3dbd8, roughness: 0.42, sheen: 0.2, sheenRoughness: 0.5 }),
    plastic: new THREE.MeshPhysicalMaterial({
      color: 0xe8eef2,
      roughness: 0.08,
      clearcoat: 1,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    }),
    // Brighter than white (linear values above 1): tone mapping still shows it
    // as white, and it is the only thing above the High level's bloom threshold.
    lightLens: new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(2.4, 2.2, 1.9) }),
    paint: new THREE.MeshStandardMaterial({ color: 0xb9bec2, roughness: 0.45 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x3c4750, roughness: 0.85 }),
    // Unlit and outside tone mapping, so the display shows its own colours at
    // the same brightness under any lighting, as a backlit screen does. Near
    // black until something draws on it.
    screen: new THREE.MeshBasicMaterial({ color: 0x06090c, toneMapped: false }),
    zoneHighlight: new THREE.MeshBasicMaterial({
      color: 0x6fd3e8,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  };

  for (const material of Object.values(materials)) disposer.register(material);
  return materials;
}
