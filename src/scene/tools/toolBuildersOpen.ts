import * as THREE from 'three';
import type { ToolMeshKey } from '../../data/toolMeshKeys';
import { plate, roundedRectShape, taperedStripShape } from '../geometry';
import { at, box, jaws, ringHandles, scalpelBlade, shaft, type ToolBuilder } from './toolParts';

/**
 * Builders for the steel open-surgery instruments: the code-built stand-ins
 * drawn when an instrument's Blender model is missing or fails to load, and
 * with `?models=off` for profiling one against the other.
 *
 * These are recognisable rather than exact. Every instrument has its own key,
 * but look-alikes share a builder with different proportions: jaw length,
 * heaviness and curve are most of what tells them apart at tray distance.
 */

/** A number 3 handle carrying a blade scaled from the #15 profile. */
function scalpel(bladeScale: number): ToolBuilder {
  return (m) => {
    const blade = scalpelBlade(m);
    blade.scale.setScalar(bladeScale);
    // Flat steel handle with a darker grip panel, so it does not read as one bar.
    const base = 0.03 * bladeScale - 0.003;
    const handle = new THREE.Mesh(plate(roundedRectShape(0.0078, 0.086, 0.002), 0.0024), m.steel);
    handle.position.y = base;
    const grip = new THREE.Mesh(plate(roundedRectShape(0.0058, 0.042, 0.0015), 0.003), m.steelDark);
    grip.position.y = base + 0.035;
    return new THREE.Group().add(blade, handle, grip);
  };
}

/** Ring-handled scissors with blades `blade` long; `curve` 0 is straight. */
function scissors(blade: number, thickness: number, curve: number): ToolBuilder {
  return (m) =>
    new THREE.Group().add(
      jaws(m, blade, thickness, curve),
      shaft(m, blade - 0.001, 0.072 - blade, 0.0032),
      ringHandles(m, 0.071),
    );
}

/** A locking clamp with jaws `jaw` long, whose handles start at `top`. */
function clamp(jaw: number, thickness: number, curve: number, top = 0.063): ToolBuilder {
  return (m) =>
    new THREE.Group().add(
      jaws(m, jaw, thickness, curve),
      shaft(m, jaw - 0.001, top - jaw + 0.001, 0.0036),
      ringHandles(m, top),
    );
}

/**
 * Thumb forceps: two limbs of flat spring steel facing each other across z,
 * joined at the top and sprung slightly apart at the tips. `width` is the
 * broad grip, `tip` the width at the tip.
 */
function forceps(length: number, width: number, tip: number): ToolBuilder {
  return (m) => {
    const group = new THREE.Group();
    const limbGeometry = plate(taperedStripShape(length, width, tip), 0.0013);
    const splay = Math.atan(0.0023 / length);
    for (const side of [-1, 1]) {
      const limb = new THREE.Mesh(limbGeometry, m.steel);
      // Rotating about x tilts the limb in z: 3.5 mm out at the tip, closing to
      // 1.2 mm where the limbs meet at the top.
      limb.rotation.x = -side * splay;
      limb.position.z = side * 0.0035;
      group.add(limb);
      // Serrated finger grips across the broad part of each limb.
      for (const along of [0.5, 0.57, 0.64, 0.71]) {
        const y = along * length;
        const surface = side * (0.0035 - y * Math.tan(splay) + 0.0009);
        group.add(at(box(width * 0.78, 0.0012, 0.0006, m.steelDark), 0, y, surface));
      }
    }
    group.add(at(box(width, 0.006, 0.0038, m.steel), 0, length - 0.002));
    return group;
  };
}

/**
 * A handheld retractor: a blade going into the wound with a lip turned toward
 * +z to hook the tissue, and a flat handle above. All bevelled plate, so the
 * edges catch light. An Army-Navy has a second, smaller blade at the top.
 */
function retractor(width: number, depth: number, lip: number, handle: number, doubleEnded = false): ToolBuilder {
  return (m) => {
    const blade = new THREE.Mesh(plate(roundedRectShape(width, depth, 0.003), 0.0022), m.steel);
    const hook = new THREE.Mesh(plate(roundedRectShape(width, lip, 0.003), 0.0022), m.steel);
    hook.rotation.x = Math.PI / 2;
    const bar = new THREE.Mesh(plate(roundedRectShape(0.015, handle, 0.005), 0.0028), m.steel);
    bar.position.y = depth - 0.002;
    const group = new THREE.Group().add(blade, hook, bar);
    if (doubleEnded) {
      const end = new THREE.Mesh(plate(roundedRectShape(width * 0.8, lip * 1.4, 0.003), 0.0022), m.steel);
      end.rotation.x = Math.PI / 2;
      end.position.y = depth - 0.002 + handle;
      group.add(end);
    }
    return group;
  };
}

export const openBuilders = {
  scalpel: scalpel(1.3),
  scalpel_15: scalpel(1),
  metzenbaum_scissors: scissors(0.026, 0.0022, 0.2),
  mayo_scissors: scissors(0.036, 0.003, 0.14),
  suture_scissors: scissors(0.034, 0.0028, 0),
  adson_toothed: forceps(0.12, 0.0095, 0.0015),
  adson_plain: forceps(0.12, 0.0095, 0.0018),
  debakey_forceps: forceps(0.155, 0.0056, 0.002),
  kelly_clamp: clamp(0.028, 0.0034, 0.16),
  mosquito_clamp: clamp(0.02, 0.0024, 0.22, 0.05),
  babcock_forceps: clamp(0.05, 0.0026, 0, 0.078),
  towel_clip: clamp(0.014, 0.0026, 0.8, 0.036),
  army_navy_retractor: retractor(0.016, 0.022, 0.012, 0.19, true),
  richardson_retractor: retractor(0.032, 0.04, 0.016, 0.19),

  needle_holder: (m) =>
    // Short heavy jaws with a darker carbide insert: grip, not reach.
    new THREE.Group().add(
      jaws(m, 0.017, 0.0044),
      at(box(0.0034, 0.01, 0.0036, m.steelDark), 0, 0.006),
      shaft(m, 0.016, 0.046, 0.004),
      ringHandles(m, 0.062),
    ),

  weitlaner_retractor: (m) => {
    // Two arms ending in rakes of short prongs, the ring handles above.
    const group = new THREE.Group();
    for (const side of [-1, 1]) {
      group.add(at(box(0.003, 0.03, 0.0026, m.steel), side * 0.004, 0.02));
      for (const z of [-0.004, 0, 0.004]) {
        group.add(at(box(0.0015, 0.007, 0.0015, m.steel), side * 0.0045, 0.0035, z));
      }
    }
    return group.add(ringHandles(m, 0.036));
  },
} satisfies Partial<Record<ToolMeshKey, ToolBuilder>>;
