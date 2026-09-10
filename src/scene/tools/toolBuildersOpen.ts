import * as THREE from 'three';
import type { ToolMeshKey } from '../../data/toolMeshKeys';
import { lathe, plate, roundedRectShape, taperedStripShape, taperedTube } from '../geometry';
import {
  at,
  box,
  curvedNeedle,
  cylinder,
  jaws,
  ringHandles,
  scalpelBlade,
  shaft,
  type ToolBuilder,
} from './toolParts';

/**
 * Builders for open-surgery instruments.
 *
 * These are recognisable rather than exact. A student should be able to tell a
 * needle holder from a haemostat at a glance in the tray, which mostly comes
 * down to jaw length and heaviness, so those are what the builders vary.
 */
export const openBuilders = {
  scalpel: (m) => {
    const group = new THREE.Group();
    group.add(scalpelBlade(m));
    // Flat steel handle with a darker grip panel, so it does not read as one bar.
    const handle = new THREE.Mesh(plate(roundedRectShape(0.0078, 0.086, 0.002), 0.0024), m.steel);
    handle.position.y = 0.027;
    const grip = new THREE.Mesh(plate(roundedRectShape(0.0058, 0.042, 0.0015), 0.003), m.steelDark);
    grip.position.y = 0.062;
    group.add(handle, grip);
    return group;
  },

  scissors: (m) => {
    const group = new THREE.Group();
    group.add(jaws(m, 0.034, 0.0026), shaft(m, 0.033, 0.038, 0.0032), ringHandles(m, 0.071));
    return group;
  },

  forceps: (m) => {
    // Two limbs of flat spring steel facing each other across z: joined at the
    // top, sprung slightly apart at the tips.
    const group = new THREE.Group();
    const limbGeometry = plate(taperedStripShape(0.11, 0.0074, 0.0016), 0.0013);
    const splay = Math.atan(0.0023 / 0.11);
    for (const side of [-1, 1]) {
      const limb = new THREE.Mesh(limbGeometry, m.steel);
      // Rotating about x tilts the limb in z: 3.5 mm out at the tip, closing to
      // 1.2 mm where the limbs meet at the top.
      limb.rotation.x = -side * splay;
      limb.position.z = side * 0.0035;
      group.add(limb);
      // Serrated finger grips across the broad part of each limb.
      for (const y of [0.055, 0.063, 0.071, 0.079]) {
        const surface = side * (0.0035 - y * Math.tan(splay) + 0.0009);
        group.add(at(box(0.0058, 0.0012, 0.0006, m.steelDark), 0, y, surface));
      }
    }
    group.add(at(box(0.0074, 0.006, 0.0038, m.steel), 0, 0.108));
    return group;
  },

  clamp: (m) => {
    const group = new THREE.Group();
    group.add(
      jaws(m, 0.028, 0.0034, 0.16),
      shaft(m, 0.027, 0.036, 0.0036),
      ringHandles(m, 0.063),
    );
    return group;
  },

  needle_holder: (m) => {
    // Short heavy jaws with a darker carbide insert: grip, not reach.
    const group = new THREE.Group();
    group.add(jaws(m, 0.017, 0.0044));
    group.add(at(box(0.0034, 0.01, 0.0036, m.steelDark), 0, 0.006));
    const needle = curvedNeedle(m);
    needle.position.set(0, 0.008, 0.0065);
    group.add(needle, shaft(m, 0.016, 0.046, 0.004), ringHandles(m, 0.062));
    return group;
  },

  retractor: (m) => {
    // A blade going into the wound, a lip turned toward +z to hook the tissue,
    // and a flat handle above. All bevelled plate, so the edges catch light.
    const group = new THREE.Group();
    const blade = new THREE.Mesh(plate(roundedRectShape(0.026, 0.03, 0.003), 0.0022), m.steel);
    const lip = new THREE.Mesh(plate(roundedRectShape(0.026, 0.013, 0.003), 0.0022), m.steel);
    lip.rotation.x = Math.PI / 2;
    const handle = new THREE.Mesh(plate(roundedRectShape(0.015, 0.1, 0.005), 0.0028), m.steel);
    handle.position.y = 0.028;
    group.add(blade, lip, handle);
    return group;
  },

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
} satisfies Partial<Record<ToolMeshKey, ToolBuilder>>;
