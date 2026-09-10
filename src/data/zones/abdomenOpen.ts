import type { ZoneManifest } from './types';

/**
 * Supine abdomen for the open appendectomy, opened through a right lower
 * quadrant muscle-splitting incision.
 *
 * Torso is centred at (0, 1.01, 0), 0.36 m wide and 0.22 m deep, so the
 * anterior abdominal wall sits at about y = 1.12. Patient's right is -x.
 * McBurney's point is placed about one third of the way along a line from the
 * right anterior superior iliac spine to the umbilicus, which lands near
 * (-0.09, 1.10, 0.11).
 *
 * PROVISIONAL. Zone ids and placement are refined in Phase 4 alongside the
 * appendectomy step content; treat the deeper layers as approximate stylised
 * positions rather than anatomy to learn spatial relationships from.
 */
export const abdomenOpenZones: ZoneManifest = {
  model: 'abdomen-open',
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
      position: [-0.09, 1.108, 0.11],
      size: [0.03, 0, 0],
      priority: 3,
    },
    {
      id: 'external_oblique',
      label: 'External oblique aponeurosis',
      shape: 'box',
      position: [-0.09, 1.096, 0.11],
      size: [0.11, 0.012, 0.13],
      priority: 2,
    },
    {
      id: 'internal_oblique',
      label: 'Internal oblique and transversus',
      shape: 'box',
      position: [-0.09, 1.082, 0.11],
      size: [0.1, 0.012, 0.12],
      priority: 2,
    },
    {
      id: 'peritoneum',
      label: 'Peritoneum',
      shape: 'box',
      position: [-0.09, 1.07, 0.11],
      size: [0.09, 0.01, 0.11],
      priority: 2,
    },
    {
      id: 'caecum',
      label: 'Caecum',
      shape: 'sphere',
      position: [-0.085, 1.045, 0.115],
      size: [0.045, 0, 0],
      priority: 2,
    },
    {
      id: 'appendix_base',
      label: 'Base of appendix',
      shape: 'sphere',
      position: [-0.07, 1.04, 0.14],
      size: [0.016, 0, 0],
      priority: 4,
    },
    {
      id: 'appendix_body',
      label: 'Body of appendix',
      shape: 'cylinder',
      position: [-0.05, 1.042, 0.165],
      size: [0.009, 0.07, 0],
      rotation: [0, 0, Math.PI / 2.4],
      priority: 3,
    },
    {
      id: 'appendix_tip',
      label: 'Tip of appendix',
      shape: 'sphere',
      position: [-0.028, 1.045, 0.19],
      size: [0.012, 0, 0],
      priority: 4,
    },
    {
      id: 'mesoappendix',
      label: 'Mesoappendix',
      shape: 'box',
      position: [-0.058, 1.03, 0.163],
      size: [0.05, 0.024, 0.05],
      priority: 2,
    },
    {
      id: 'appendicular_artery',
      label: 'Appendicular artery',
      shape: 'cylinder',
      position: [-0.062, 1.026, 0.155],
      size: [0.004, 0.05, 0],
      rotation: [0, 0, Math.PI / 2.4],
      priority: 4,
    },
    {
      id: 'small_bowel',
      label: 'Small bowel',
      shape: 'box',
      position: [0.0, 1.03, 0.06],
      size: [0.12, 0.05, 0.14],
      priority: 1,
      avoid: true,
    },
  ],
};
