import type { ZoneManifest } from './types';

/**
 * Supine abdomen for the open appendectomy, opened through a right lower
 * quadrant muscle-splitting incision.
 *
 * Torso is centred at (0, 1.01, 0), 0.34 m wide and 0.21 m deep, and its skin
 * over McBurney's point is at y = 1.099. Patient's right is -x. McBurney's
 * point is a third of the way from the right anterior superior iliac spine to
 * the umbilicus, which lands at (-0.09, 1.099, 0.11).
 *
 * The layers stack downward under that point: skin (layer 0), subcutaneous
 * fat (1), external oblique (2), internal oblique and transversus (3),
 * peritoneum (4), then the caecum and appendix (5). While a step is under way
 * only its target's layer can be picked (layers.ts), and the scene only lets a
 * ray reach below the skin through the wound's opening.
 *
 * The layer-5 positions are the wound frame's (src/scene/models/abdomenFrame.ts
 * and ileocaecum.ts) turned into world coordinates. A rotation of -0.6857 about
 * y is that frame's turn, which lays a box along the incision.
 *
 * TODO(clinical review): the depths and the shapes of the deeper structures
 * are stylised, not anatomy to learn spatial relationships from.
 */
export const abdomenOpenZones: ZoneManifest = {
  model: 'abdomen-open',
  layerNames: [
    'Skin',
    'Subcutaneous fat',
    'External oblique aponeurosis',
    'Internal oblique and transversus',
    'Peritoneum',
    'Caecum and appendix',
  ],
  zones: [
    {
      id: 'abdominal_skin',
      label: 'Abdominal skin',
      shape: 'box',
      position: [0, 1.115, 0],
      size: [0.34, 0.02, 0.6],
      priority: -1,
    },
    {
      id: 'umbilicus',
      label: 'Umbilicus',
      shape: 'sphere',
      position: [0, 1.122, 0],
      size: [0.018, 0, 0],
      priority: 2,
    },
    {
      id: 'mcburney_point',
      label: "McBurney's point",
      shape: 'sphere',
      position: [-0.09, 1.099, 0.11],
      size: [0.03, 0, 0],
      priority: 3,
    },
    {
      id: 'subcutaneous_fat',
      label: 'Subcutaneous fat',
      shape: 'box',
      position: [-0.09, 1.09, 0.11],
      size: [0.12, 0.012, 0.14],
      priority: 2,
      layer: 1,
    },
    {
      id: 'external_oblique',
      label: 'External oblique aponeurosis',
      shape: 'box',
      position: [-0.09, 1.082, 0.11],
      size: [0.11, 0.008, 0.13],
      priority: 2,
      layer: 2,
    },
    {
      id: 'internal_oblique',
      label: 'Internal oblique and transversus',
      shape: 'box',
      position: [-0.09, 1.072, 0.11],
      size: [0.1, 0.012, 0.12],
      priority: 2,
      layer: 3,
    },
    {
      id: 'peritoneum',
      label: 'Peritoneum',
      shape: 'box',
      position: [-0.09, 1.063, 0.11],
      size: [0.09, 0.006, 0.11],
      priority: 2,
      layer: 4,
    },
    {
      id: 'caecum',
      label: 'Caecum',
      shape: 'sphere',
      position: [-0.102, 1.03, 0.106],
      size: [0.028, 0, 0],
      priority: 2,
      layer: 5,
    },
    {
      id: 'appendix_base',
      label: 'Base of appendix',
      shape: 'sphere',
      position: [-0.081, 1.039, 0.118],
      size: [0.01, 0, 0],
      priority: 4,
      layer: 5,
    },
    {
      // On the straight line from base to tip. Centred on the drawn curve's
      // midpoint instead, it sat over the mesoappendix and took its clicks.
      id: 'appendix_body',
      label: 'Body of appendix',
      shape: 'cylinder',
      position: [-0.0682, 1.0429, 0.1188],
      size: [0.008, 0.0282, 0],
      rotation: [0.0944, -0.0712, -1.2923],
      priority: 3,
      layer: 5,
    },
    {
      id: 'appendix_tip',
      label: 'Tip of appendix',
      shape: 'sphere',
      position: [-0.0556, 1.0464, 0.1201],
      size: [0.01, 0, 0],
      priority: 4,
      layer: 5,
    },
    {
      id: 'mesoappendix',
      label: 'Mesoappendix',
      shape: 'box',
      position: [-0.078, 1.035, 0.13],
      size: [0.03, 0.01, 0.018],
      rotation: [0, -0.6857, 0],
      priority: 2,
      layer: 5,
    },
    // No zone for the appendicular artery: it runs inside the mesoappendix, and
    // a zone of its own took every click aimed at the mesoappendix. The steps
    // act on the mesoappendix as a whole; the artery is still drawn.
    {
      id: 'small_bowel',
      label: 'Small bowel',
      shape: 'box',
      position: [-0.067, 1.031, 0.09],
      size: [0.06, 0.03, 0.022],
      rotation: [0, -0.6857, 0],
      priority: 1,
      avoid: true,
      layer: 5,
    },
  ],
};
