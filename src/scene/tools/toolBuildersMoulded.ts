import * as THREE from 'three';
import type { ToolMeshKey } from '../../data/toolMeshKeys';
import { lathe, plate, roundedRectShape, taperedTube } from '../geometry';
import { at, box, cylinder, ringHandles, shaft, type ToolBuilder } from './toolParts';

/**
 * Builders for the moulded, turned and cloth items on an open tray: syringes,
 * swabs, the cautery pencil, the suction tip and the skin stapler. Like the
 * steel instruments in `toolBuildersOpen.ts`, these are the stand-ins for
 * missing Blender models.
 */
export const mouldedBuilders = {
  syringe: (m) => {
    const group = new THREE.Group();
    group.add(at(cylinder(0.00042, 0.00042, 0.027, m.steel, 8), 0, 0.0135));
    group.add(
      new THREE.Mesh(
        lathe([
          [0.0009, 0.026],
          [0.0033, 0.029],
          [0.0039, 0.036],
          [0, 0.036],
        ]),
        m.steelDark,
      ),
    );
    // Barrel with a finger flange. Translucent, so the plunger seal shows.
    const barrel = lathe(
      [
        [0.0042, 0.036],
        [0.0079, 0.039],
        [0.0079, 0.098],
        [0.0125, 0.0985],
        [0.0125, 0.101],
        [0.0072, 0.101],
      ],
      28,
    );
    group.add(new THREE.Mesh(barrel, m.plastic));
    group.add(at(cylinder(0.0074, 0.0074, 0.004, m.handle, 20), 0, 0.078));
    group.add(at(cylinder(0.0022, 0.0022, 0.042, m.handle, 10), 0, 0.1));
    group.add(at(cylinder(0.0105, 0.0105, 0.0024, m.handle, 24), 0, 0.1215));
    return group;
  },

  swab: (m) => {
    // Sponge-holding forceps with a folded gauze swab in the jaws.
    const group = new THREE.Group();
    const swab = new THREE.Mesh(new THREE.SphereGeometry(0.012, 18, 14), m.gauze);
    swab.scale.set(1, 0.85, 0.9);
    swab.position.y = 0.011;
    group.add(swab, shaft(m, 0.018, 0.12, 0.0023), ringHandles(m, 0.138, 0.01));
    return group;
  },

  gauze: (m) =>
    // A folded swab lying in the working plane like every instrument, so it
    // lies flat on the tray.
    new THREE.Group().add(new THREE.Mesh(plate(roundedRectShape(0.075, 0.075, 0.008), 0.004), m.gauze)),

  cautery: (m) => {
    const group = new THREE.Group();
    group.add(at(box(0.0022, 0.016, 0.0006, m.steel), 0, 0.008));
    const pencil = lathe(
      [
        [0.0012, 0.015],
        [0.004, 0.022],
        [0.0062, 0.035],
        [0.0068, 0.09],
        [0.0058, 0.112],
        [0.0032, 0.118],
        [0, 0.119],
      ],
      22,
    );
    group.add(new THREE.Mesh(pencil, m.handle));
    // Cut and coagulate buttons along the top of the pencil.
    for (const y of [0.05, 0.064]) group.add(at(box(0.0045, 0.009, 0.0022, m.steelDark), 0, y, 0.0066));
    const cable = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.117, 0),
      new THREE.Vector3(0, 0.135, -0.006),
      new THREE.Vector3(0.004, 0.15, -0.03),
    ]);
    group.add(new THREE.Mesh(taperedTube(cable, 0.0026, () => 1, 16, 8), m.handle));
    return group;
  },

  suction: (m) => {
    // Rigid suction: guarded bulbous tip, gently angled tube, fluted grip.
    const group = new THREE.Group();
    const tip = lathe(
      [
        [0, 0],
        [0.0028, 0.0008],
        [0.0037, 0.0042],
        [0.0029, 0.0085],
      ],
      16,
    );
    group.add(new THREE.Mesh(tip, m.steel));
    const tube = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.008, 0),
      new THREE.Vector3(0, 0.05, -0.004),
      new THREE.Vector3(0, 0.092, 0.01),
    );
    group.add(new THREE.Mesh(taperedTube(tube, 0.003, () => 1, 20, 10), m.steel));
    const grip = new THREE.Mesh(
      lathe([
        [0.0033, 0],
        [0.0062, 0.008],
        [0.0066, 0.04],
        [0.0046, 0.05],
        [0.0046, 0.058],
      ]),
      m.handle,
    );
    grip.position.set(0, 0.09, 0.01);
    group.add(grip);
    return group;
  },

  skin_stapler: (m) =>
    // Staple head at the tip, the moulded body above it, the trigger behind.
    new THREE.Group().add(
      at(box(0.014, 0.012, 0.01, m.plastic), 0, 0.006),
      at(box(0.018, 0.075, 0.024, m.handle), 0, 0.049),
      at(box(0.012, 0.05, 0.008, m.steelDark), 0, 0.06, -0.018),
    ),
} satisfies Partial<Record<ToolMeshKey, ToolBuilder>>;
