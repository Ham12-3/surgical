import * as THREE from 'three';
import { HINGE_NODES, type AssetEntry, type HingeAxis } from '../data/assetManifest';

/**
 * Opening and closing a hinged instrument model.
 *
 * A hinged model carries two pivot nodes at its joint, `jaw_upper` and
 * `jaw_lower` (blender/scripts/kit_shapes.py, hinge()), each holding one half
 * of the instrument. Most turn about their local z, the instrument's
 * thickness axis: `jaw_upper` holds the half whose jaw is on +x, and turning
 * the pivots apart swings each jaw outward and each ring the opposite way, as
 * the real joint does. With the tip below the pivot, a positive turn about z
 * carries a +x jaw further out.
 *
 * Thumb forceps (hinge axis x) have their limbs facing each other through the
 * thickness instead, hinged where they join at the top: `jaw_upper` holds the
 * +z limb, and with its tip below the pivot a negative turn about x carries
 * it further out. Springy steel bends along its length rather than at a
 * joint, but over a few degrees the difference does not show.
 */
export class Hinge {
  private constructor(
    private readonly upper: THREE.Object3D,
    private readonly lower: THREE.Object3D,
    private readonly halfAngle: number,
    private readonly axis: HingeAxis,
  ) {}

  /** The hinge in an instance of the model `entry` describes, or null if it has none. */
  static find(
    root: THREE.Object3D,
    entry: Pick<AssetEntry, 'hingeDegrees' | 'hingeAxis'> | undefined,
  ): Hinge | null {
    if (entry?.hingeDegrees === undefined) return null;
    const [upperName, lowerName] = HINGE_NODES;
    const upper = root.getObjectByName(upperName);
    const lower = root.getObjectByName(lowerName);
    if (!upper || !lower) return null;
    const halfAngle = THREE.MathUtils.degToRad(entry.hingeDegrees) / 2;
    return new Hinge(upper, lower, halfAngle, entry.hingeAxis ?? 'z');
  }

  /** 0 is shut, as modelled; 1 is fully open. */
  set(opening: number): void {
    const angle = this.halfAngle * THREE.MathUtils.clamp(opening, 0, 1);
    if (this.axis === 'z') {
      this.upper.rotation.z = angle;
      this.lower.rotation.z = -angle;
    } else {
      this.upper.rotation.x = -angle;
      this.lower.rotation.x = angle;
    }
  }
}
