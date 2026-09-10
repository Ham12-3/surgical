import type { ZoneManifest } from './types';

const HALF_PI = Math.PI / 2;

/**
 * Right forearm on the arm board, with a roughly 9 cm laceration running along
 * the long axis of the limb. Used by the wound suturing procedure.
 *
 * The arm is abducted onto a board at x = -0.42 (the patient's right) whose top
 * surface is at y = 0.90, so the limb runs along the x axis: elbow toward the
 * body at +x, hand outboard at -x. The forearm is a cylinder of radius 0.045 m
 * resting on the board, centred at (-0.42, 0.945, 0), putting the skin the
 * student works on at about y = 0.99.
 *
 * "Near" and "far" edges are named from the surgeon's default viewpoint, which
 * looks across the board from +z: the near edge is the +z side.
 */
export const forearmZones: ZoneManifest = {
  model: 'forearm',
  zones: [
    {
      id: 'forearm_skin',
      label: 'Forearm skin',
      shape: 'cylinder',
      position: [-0.42, 0.945, 0],
      size: [0.05, 0.3, 0],
      rotation: [0, 0, HALF_PI],
      priority: -1,
    },
    {
      id: 'periwound_skin',
      label: 'Skin around the wound',
      shape: 'box',
      position: [-0.42, 0.977, 0],
      size: [0.17, 0.025, 0.085],
      priority: 0,
    },
    {
      id: 'wound_bed',
      label: 'Wound bed',
      shape: 'box',
      position: [-0.42, 0.983, 0],
      size: [0.092, 0.024, 0.013],
      priority: 3,
    },
    {
      id: 'wound_edge_near',
      label: 'Near wound edge',
      shape: 'box',
      position: [-0.42, 0.987, 0.014],
      size: [0.092, 0.022, 0.016],
      priority: 2,
    },
    {
      id: 'wound_edge_far',
      label: 'Far wound edge',
      shape: 'box',
      position: [-0.42, 0.987, -0.014],
      size: [0.092, 0.022, 0.016],
      priority: 2,
    },
    {
      id: 'wound_apex_proximal',
      label: 'Proximal wound apex',
      shape: 'sphere',
      position: [-0.375, 0.985, 0],
      size: [0.017, 0, 0],
      priority: 4,
    },
    {
      id: 'wound_apex_distal',
      label: 'Distal wound apex',
      shape: 'sphere',
      position: [-0.465, 0.985, 0],
      size: [0.017, 0, 0],
      priority: 4,
    },
  ],
};
