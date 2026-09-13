import * as THREE from 'three';
import type { Materials } from '../palette';
import type { ToolMeshKey } from '../../data/toolMeshKeys';
import { lathe, plate, roundedRectShape } from '../geometry';
import { at, box, cylinder, jaws, type ToolBuilder } from './toolParts';

/**
 * Builders for laparoscopic instruments.
 *
 * Nearly all of them are the same three parts — a small working tip, a long
 * 5 or 10 mm shaft, and a handle — so the shared handle parts live here and
 * each builder mostly chooses a tip.
 */

/** Rotation knob where the shaft meets the handle, with shallow grip ribs. */
function rotationKnob(m: Materials, y: number): THREE.Mesh {
  return new THREE.Mesh(
    lathe([
      [0.0028, y],
      [0.0066, y + 0.003],
      [0.007, y + 0.006],
      [0.0064, y + 0.008],
      [0.007, y + 0.01],
      [0.0066, y + 0.013],
      [0.0045, y + 0.016],
    ]),
    m.handle,
  );
}

/** Pistol grip with finger and thumb loops, the standard laparoscopic handle. */
function pistolHandle(m: Materials, y: number): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(plate(roundedRectShape(0.016, 0.052, 0.005), 0.012), m.handle);
  body.position.y = y;
  const loop = new THREE.TorusGeometry(0.0105, 0.0028, 10, 24);
  const finger = at(new THREE.Mesh(loop, m.handle), 0.004, y + 0.063);
  const thumb = at(new THREE.Mesh(loop, m.handle), -0.016, y + 0.038);
  group.add(body, finger, thumb);
  return group;
}

export const lapBuilders = {
  needle: (m) => {
    // Veress needle: fine shaft with a blunt spring-loaded stylet, hub and stopcock.
    const group = new THREE.Group();
    const needle = lathe(
      [
        [0, 0],
        [0.0009, 0.003],
        [0.0009, 0.1],
      ],
      10,
    );
    group.add(new THREE.Mesh(needle, m.steel));
    const hub = lathe([
      [0.0016, 0.1],
      [0.0056, 0.104],
      [0.006, 0.122],
      [0.0042, 0.128],
      [0, 0.128],
    ]);
    group.add(new THREE.Mesh(hub, m.handle), at(box(0.013, 0.003, 0.003, m.steelDark), 0.006, 0.115));
    return group;
  },

  trocar: (m) => {
    const group = new THREE.Group();
    // Obturator tip protruding below the cannula.
    const obturator = lathe(
      [
        [0, 0],
        [0.0052, 0.012],
      ],
      18,
    );
    const cannula = lathe(
      [
        [0.0057, 0.009],
        [0.006, 0.012],
        [0.006, 0.086],
      ],
      22,
    );
    const head = lathe(
      [
        [0.006, 0.085],
        [0.0125, 0.09],
        [0.0135, 0.106],
        [0.0105, 0.112],
        [0.004, 0.114],
        [0, 0.114],
      ],
      26,
    );
    group.add(
      new THREE.Mesh(obturator, m.steelDark),
      new THREE.Mesh(cannula, m.steel),
      new THREE.Mesh(head, m.handle),
    );
    // Insufflation side port with its stopcock lever.
    const port = at(cylinder(0.0028, 0.0028, 0.016, m.steelDark, 10), 0.019, 0.097);
    port.rotation.z = Math.PI / 2;
    group.add(port, at(box(0.003, 0.011, 0.0025, m.steelDark), 0.026, 0.101));
    return group;
  },

  laparoscope: (m) => {
    const group = new THREE.Group();
    group.add(at(cylinder(0.0042, 0.0042, 0.0012, m.handle, 16), 0, 0.0006));
    group.add(at(cylinder(0.005, 0.005, 0.3, m.steel, 18), 0, 0.15));
    const eyepiece = lathe(
      [
        [0.005, 0.3],
        [0.007, 0.304],
        [0.007, 0.315],
        [0.0135, 0.32],
        [0.0145, 0.338],
        [0.012, 0.345],
        [0, 0.345],
      ],
      26,
    );
    group.add(new THREE.Mesh(eyepiece, m.handle));
    // Light cable post, angled off the side of the eyepiece.
    const lightPost = at(cylinder(0.0036, 0.0036, 0.024, m.steelDark, 10), 0.014, 0.31);
    lightPost.rotation.z = Math.PI / 2.6;
    group.add(lightPost);
    return group;
  },

  lap_instrument: (m) => {
    const group = new THREE.Group();
    group.add(jaws(m, 0.014, 0.0022), at(cylinder(0.0026, 0.0026, 0.3, m.steel), 0, 0.164));
    group.add(rotationKnob(m, 0.312), pistolHandle(m, 0.326));
    return group;
  },

  clip_applier: (m) => {
    const group = new THREE.Group();
    // A titanium clip loaded in the jaws, open end toward the tip.
    for (const side of [-1, 1]) group.add(at(box(0.0014, 0.01, 0.0026, m.steel), side * 0.0027, 0.005));
    group.add(at(box(0.0068, 0.0014, 0.0026, m.steel), 0, 0.0102));
    const housing = lathe(
      [
        [0.0034, 0.009],
        [0.0048, 0.018],
        [0.0048, 0.03],
      ],
      18,
    );
    group.add(new THREE.Mesh(housing, m.steelDark));
    group.add(at(cylinder(0.0048, 0.0048, 0.28, m.steel, 16), 0, 0.17));
    group.add(rotationKnob(m, 0.308), pistolHandle(m, 0.322));
    return group;
  },

  bag: (m) => {
    // Retrieval bag on its introducer: translucent pouch, sprung mouth, shaft.
    const group = new THREE.Group();
    const pouch = lathe(
      [
        [0, 0],
        [0.012, 0.004],
        [0.018, 0.018],
        [0.017, 0.034],
        [0.012, 0.042],
        [0.0085, 0.046],
      ],
      24,
    );
    group.add(new THREE.Mesh(pouch, m.plastic));
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.0085, 0.0009, 6, 24), m.steel);
    mouth.rotation.x = Math.PI / 2;
    mouth.position.y = 0.046;
    group.add(mouth, at(cylinder(0.0042, 0.0042, 0.16, m.steel), 0, 0.126));
    const grip = lathe([
      [0.0042, 0.206],
      [0.009, 0.212],
      [0.009, 0.245],
      [0.006, 0.252],
      [0, 0.253],
    ]);
    group.add(new THREE.Mesh(grip, m.handle));
    return group;
  },
} satisfies Partial<Record<ToolMeshKey, ToolBuilder>>;
