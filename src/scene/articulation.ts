import * as THREE from 'three';
import { HINGE_NODES } from '../data/assetManifest';

/**
 * Opening and closing a hinged instrument model.
 *
 * A hinged model carries two pivot nodes at its joint, `jaw_upper` and
 * `jaw_lower` (blender/scripts/kit_shapes.py, hinge()), each holding one half
 * of the instrument: `jaw_upper` the half whose jaw is on +x, `jaw_lower` the
 * other. Turning them apart about their local z, the instrument's thickness
 * axis, swings each jaw outward and each ring the opposite way, as the real
 * joint does. With the tip below the pivot, a positive turn about z carries a
 * +x jaw further out, hence the signs below.
 */
export class Hinge {
  private constructor(
    private readonly upper: THREE.Object3D,
    private readonly lower: THREE.Object3D,
    private readonly halfAngle: number,
  ) {}

  /** The hinge in a model instance that opens through `degrees`, or null if it has none. */
  static find(root: THREE.Object3D, degrees: number): Hinge | null {
    const [upperName, lowerName] = HINGE_NODES;
    const upper = root.getObjectByName(upperName);
    const lower = root.getObjectByName(lowerName);
    if (!upper || !lower) return null;
    return new Hinge(upper, lower, THREE.MathUtils.degToRad(degrees) / 2);
  }

  /** 0 is shut, as modelled; 1 is fully open. */
  set(opening: number): void {
    const angle = this.halfAngle * THREE.MathUtils.clamp(opening, 0, 1);
    this.upper.rotation.z = angle;
    this.lower.rotation.z = -angle;
  }
}
