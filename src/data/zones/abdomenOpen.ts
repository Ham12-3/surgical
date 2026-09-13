import bodyLandmarks from '../bodyLandmarks.json';
import organLandmarks from '../organLandmarks.json';
import { add, boxRotationAlongX, cylinderRotation, length, mix, normalize, projectOnPlane, scale, sub, vec3 } from './orient';
import type { ZoneManifest, ZoneSpec } from './types';

/**
 * Supine abdomen for the open appendectomy, opened through a right lower
 * quadrant muscle-splitting incision.
 *
 * Every position is pinned to the body model through the landmarks its build
 * wrote (src/data/bodyLandmarks.json, from blender/scripts/build_body.py) and
 * to the organ model through its (organLandmarks.json, build_organs.py), so
 * a rebuilt body moves the zones with it. Patient's right is -x.
 *
 * The layers stack downward under McBurney's point: skin (layer 0),
 * subcutaneous fat (1), external oblique (2), internal oblique and
 * transversus (3), peritoneum (4), then the caecum and appendix (5). The
 * layer depths match the wound's flaps (src/scene/models/abdomenWound.ts).
 * While a step is under way only its target's layer can be picked
 * (layers.ts), and the scene only lets a ray reach below the skin through
 * the wound's opening.
 *
 * TODO(clinical review): the landmarks are worked out from the mesh and the
 * rig, the wall's layer depths are stylised, and the organs are one scan's
 * placed under another body (DECISIONS.md, D43).
 */

const UMBILICUS = vec3(bodyLandmarks.landmarks.umbilicus);
const MCBURNEY = vec3(bodyLandmarks.landmarks.mcburney);
const SKIN_Y = MCBURNEY[1];

const APPENDIX_BASE = vec3(organLandmarks.appendix.base);
const APPENDIX_TIP = vec3(organLandmarks.appendix.tip);
const APPENDIX_DIRECTION = normalize(sub(APPENDIX_TIP, APPENDIX_BASE));
const APPENDIX_LENGTH = length(sub(APPENDIX_TIP, APPENDIX_BASE));
const APPENDIX_MIDDLE = mix(APPENDIX_BASE, APPENDIX_TIP, 0.5);
/** The side of the appendix its mesentery hangs from: toward where the ileum joins the caecum. */
const TOWARD_MESENTERY = normalize(projectOnPlane(sub(vec3(organLandmarks.ileum.junction), APPENDIX_BASE), APPENDIX_DIRECTION));

function boundsBox(id: string, label: string, bounds: { min: number[]; max: number[] }, extra: Partial<ZoneSpec>, margin = 0): ZoneSpec {
  const low = vec3(bounds.min);
  const high = vec3(bounds.max);
  return {
    id,
    label,
    shape: 'box',
    position: mix(low, high, 0.5),
    size: [high[0] - low[0] + margin, high[1] - low[1] + margin, high[2] - low[2] + margin],
    ...extra,
  };
}

/** A wall layer under McBurney's point: a slab `depth` below the skin there. */
function layer(id: string, label: string, index: number, depth: number, thickness: number, width: number, depthAlong: number): ZoneSpec {
  return {
    id,
    label,
    shape: 'box',
    position: [MCBURNEY[0], SKIN_Y - depth, MCBURNEY[2]],
    size: [width, thickness, depthAlong],
    priority: 2,
    layer: index,
  };
}

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
      // Thick enough to meet the skin over the whole belly, which rises and falls along it.
      position: [0, UMBILICUS[1] - 0.02, 0],
      size: [0.34, 0.06, 0.6],
      priority: -1,
    },
    {
      id: 'umbilicus',
      label: 'Umbilicus',
      shape: 'sphere',
      position: UMBILICUS,
      size: [0.018, 0, 0],
      priority: 2,
    },
    {
      id: 'mcburney_point',
      label: "McBurney's point",
      shape: 'sphere',
      position: MCBURNEY,
      size: [0.03, 0, 0],
      priority: 3,
    },
    layer('subcutaneous_fat', 'Subcutaneous fat', 1, 0.009, 0.012, 0.12, 0.14),
    layer('external_oblique', 'External oblique aponeurosis', 2, 0.017, 0.008, 0.11, 0.13),
    layer('internal_oblique', 'Internal oblique and transversus', 3, 0.027, 0.012, 0.1, 0.12),
    layer('peritoneum', 'Peritoneum', 4, 0.036, 0.006, 0.09, 0.11),
    // The caecum and the ileum run on under the wall; only what lies within
    // the opening can be reached, so their zones cover that part (the organ
    // build measures it as `exposed`), or the whole organ if none does.
    boundsBox('caecum', 'Caecum', organLandmarks.caecum.exposed ?? organLandmarks.caecum.bounds, { priority: 2, layer: 5 }, 0.006),
    {
      // Big enough that its top comes within the pick's depth window of the
      // caecum dome above it (zonePick.ts), so its priority decides.
      id: 'appendix_base',
      label: 'Base of appendix',
      shape: 'sphere',
      position: APPENDIX_BASE,
      size: [0.014, 0, 0],
      priority: 4,
      layer: 5,
    },
    {
      id: 'appendix_body',
      label: 'Body of appendix',
      shape: 'cylinder',
      position: APPENDIX_MIDDLE,
      size: [0.008, APPENDIX_LENGTH + 0.002, 0],
      rotation: cylinderRotation(APPENDIX_DIRECTION),
      priority: 3,
      layer: 5,
    },
    {
      id: 'appendix_tip',
      label: 'Tip of appendix',
      shape: 'sphere',
      position: APPENDIX_TIP,
      size: [0.009, 0, 0],
      priority: 4,
      layer: 5,
    },
    {
      // The fold beside the appendix, on its mesentery side, as the scene draws it (ileocaecum.ts).
      id: 'mesoappendix',
      label: 'Mesoappendix',
      shape: 'box',
      position: add(add(APPENDIX_MIDDLE, scale(TOWARD_MESENTERY, 0.012)), [0, -0.002, 0]),
      size: [APPENDIX_LENGTH * 0.9, 0.012, 0.024],
      rotation: boxRotationAlongX(APPENDIX_DIRECTION),
      // Above the caecum it lies against, which would otherwise take its picks.
      priority: 3,
      layer: 5,
    },
    boundsBox('small_bowel', 'Small bowel', organLandmarks.ileum.exposed ?? organLandmarks.ileum.bounds, { priority: 1, avoid: true, layer: 5 }, 0.01),
  ],
};
