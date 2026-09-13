import * as THREE from 'three';
import type { ContentLevel } from '../store/settings';
import type { Materials } from './palette';

/**
 * The content level's effect on the shared tissue materials (settings.ts).
 *
 * Schematic draws each exposed tissue in a flat, distinct colour, in the usual
 * anatomy-atlas convention (fat yellow, muscle red, fascia white, bowel pink,
 * artery red), and takes the wet sheen off, so the layers read apart at a
 * glance. Reduced puts the palette's own colours back. Hiding the blood is the
 * wound's job (abdomenWound.ts).
 */

const SCHEMATIC_COLOURS: Partial<Record<keyof Materials, number>> = {
  subcutaneous: 0xf2cb3a,
  muscle: 0xc4453a,
  fascia: 0xf4f2ea,
  bowel: 0xee9fb6,
  artery: 0xe0322e,
  liver: 0x9a4436,
  gallbladder: 0x4f9d4a,
  duct: 0x8bc34a,
  wound: 0x3b3646,
};

interface Swatch {
  readonly key: keyof Materials;
  readonly material: THREE.MeshStandardMaterial;
  readonly colour: THREE.Color;
  readonly clearcoat: number;
}

export class ContentLevelControl {
  private readonly swatches: Swatch[] = [];

  constructor(materials: Materials) {
    for (const key of Object.keys(SCHEMATIC_COLOURS) as Array<keyof Materials>) {
      const material = materials[key];
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      const clearcoat = material instanceof THREE.MeshPhysicalMaterial ? material.clearcoat : 0;
      this.swatches.push({ key, material, colour: material.color.clone(), clearcoat });
    }
  }

  apply(level: ContentLevel): void {
    const schematic = level === 'schematic';
    for (const { key, material, colour, clearcoat } of this.swatches) {
      const flat = SCHEMATIC_COLOURS[key];
      material.color.set(schematic && flat !== undefined ? flat : colour);
      // Crossing zero changes the shader, which three recompiles on its own.
      if (material instanceof THREE.MeshPhysicalMaterial) material.clearcoat = schematic ? 0 : clearcoat;
    }
  }
}
