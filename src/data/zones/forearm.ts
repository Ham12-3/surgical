import bodyLandmarks from '../bodyLandmarks.json';
import { add, boxAxes, boxRotationAlongX, cylinderRotation, mix, normalize, scale, sub, vec3 } from './orient';
import type { ZoneManifest, ZoneSpec } from './types';

/**
 * Right forearm on the arm board, with a roughly 9 cm laceration running along
 * the long axis of the limb. Used by the wound suturing procedure.
 *
 * The arm is the body model's, turned out onto the arm board by its build
 * (blender/scripts/build_body.py): elbow toward the body, hand outboard, the
 * limb sloping a little down to the board. Its joints and the skin point on
 * top of the mid-forearm come from src/data/bodyLandmarks.json, so a rebuilt
 * body moves these zones with it. The wound is centred on that skin point
 * and runs along the limb.
 *
 * "Near" and "far" edges are named from the surgeon's default viewpoint, which
 * looks across the board from +z: the near edge is the +z side.
 */

const ELBOW = vec3(bodyLandmarks.landmarks.elbow_right);
const WRIST = vec3(bodyLandmarks.landmarks.wrist_right);
/** The skin on top of the mid-forearm: the wound's centre. */
export const FOREARM_WOUND_CENTRE = vec3(bodyLandmarks.landmarks.forearm_right_top);
/** From the elbow toward the hand. */
export const FOREARM_AXIS = normalize(sub(WRIST, ELBOW));
export const FOREARM_ROTATION = boxRotationAlongX(FOREARM_AXIS);
const AXES = boxAxes(FOREARM_AXIS);
/** Across the limb, toward the surgeon (+z side). */
const ACROSS: readonly [number, number, number] = AXES.z[2] >= 0 ? AXES.z : scale(AXES.z, -1);
const UP = AXES.y;

export const WOUND_LENGTH = 0.09;
const HALF_LENGTH = WOUND_LENGTH / 2;

/** A point `along` the limb from the wound's centre, `across` it toward the surgeon, `up` off the skin. */
function at(along: number, across: number, up: number): readonly [number, number, number] {
  return add(add(add(FOREARM_WOUND_CENTRE, scale(FOREARM_AXIS, along)), scale(ACROSS, across)), scale(UP, up));
}

function box(id: string, label: string, centre: readonly [number, number, number], size: readonly [number, number, number], priority: number): ZoneSpec {
  return { id, label, shape: 'box', position: centre, size, rotation: FOREARM_ROTATION, priority };
}

export const forearmZones: ZoneManifest = {
  model: 'forearm',
  zones: [
    {
      // On the joints' line, sized so its top meets the skin at the wound:
      // higher, it would take every pick meant for the wound behind it.
      id: 'forearm_skin',
      label: 'Forearm skin',
      shape: 'cylinder',
      position: mix(ELBOW, WRIST, 0.5),
      size: [0.04, 0.3, 0],
      rotation: cylinderRotation(FOREARM_AXIS),
      priority: -1,
    },
    box('periwound_skin', 'Skin around the wound', at(0, 0, -0.013), [0.17, 0.025, 0.085], 0),
    box('wound_bed', 'Wound bed', at(0, 0, -0.007), [0.092, 0.024, 0.013], 3),
    box('wound_edge_near', 'Near wound edge', at(0, 0.014, -0.003), [0.092, 0.022, 0.016], 2),
    box('wound_edge_far', 'Far wound edge', at(0, -0.014, -0.003), [0.092, 0.022, 0.016], 2),
    {
      id: 'wound_apex_proximal',
      label: 'Proximal wound apex',
      shape: 'sphere',
      position: at(-HALF_LENGTH, 0, -0.005),
      size: [0.017, 0, 0],
      priority: 4,
    },
    {
      id: 'wound_apex_distal',
      label: 'Distal wound apex',
      shape: 'sphere',
      position: at(HALF_LENGTH, 0, -0.005),
      size: [0.017, 0, 0],
      priority: 4,
    },
  ],
};
