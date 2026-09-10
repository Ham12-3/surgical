import type { ZoneManifest } from './types';

/**
 * Supine abdomen for the laparoscopic cholecystectomy: four port sites on the
 * abdominal wall, plus the structures seen on the laparoscope view once the
 * gallbladder is retracted.
 *
 * Patient's right is -x, head is -z, so the gallbladder and liver sit in the
 * right upper quadrant at negative x and negative z.
 *
 * PROVISIONAL. Placement is stylised for teaching the sequence and the
 * relationships between structures, not for learning true spatial anatomy.
 * The safety-critical zones here (cystic duct, cystic artery, common bile duct,
 * Calot's triangle) are refined in Phase 4 with the step content and carry
 * TODO flags there until reviewed.
 */
export const abdomenLapZones: ZoneManifest = {
  model: 'abdomen-lap',
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
      id: 'umbilical_port_site',
      label: 'Umbilical port site',
      shape: 'sphere',
      position: [0, 1.122, 0.0],
      size: [0.022, 0, 0],
      priority: 3,
    },
    {
      id: 'epigastric_port_site',
      label: 'Epigastric port site',
      shape: 'sphere',
      position: [0.01, 1.12, -0.13],
      size: [0.02, 0, 0],
      priority: 3,
    },
    {
      id: 'midclavicular_port_site',
      label: 'Right midclavicular port site',
      shape: 'sphere',
      position: [-0.085, 1.11, -0.09],
      size: [0.02, 0, 0],
      priority: 3,
    },
    {
      id: 'axillary_port_site',
      label: 'Right anterior axillary port site',
      shape: 'sphere',
      position: [-0.13, 1.085, -0.05],
      size: [0.02, 0, 0],
      priority: 3,
    },
    {
      id: 'liver_edge',
      label: 'Edge of the liver',
      shape: 'box',
      position: [-0.07, 1.06, -0.14],
      size: [0.16, 0.05, 0.12],
      priority: 1,
    },
    {
      id: 'gallbladder_fundus',
      label: 'Fundus of the gallbladder',
      shape: 'sphere',
      position: [-0.105, 1.05, -0.09],
      size: [0.022, 0, 0],
      priority: 3,
    },
    {
      id: 'gallbladder_body',
      label: 'Body of the gallbladder',
      shape: 'cylinder',
      position: [-0.085, 1.048, -0.115],
      size: [0.018, 0.06, 0],
      rotation: [Math.PI / 2.6, 0, Math.PI / 5],
      priority: 2,
    },
    {
      id: 'hartmann_pouch',
      label: "Hartmann's pouch (infundibulum)",
      shape: 'sphere',
      position: [-0.062, 1.046, -0.142],
      size: [0.018, 0, 0],
      priority: 3,
    },
    {
      id: 'calot_triangle',
      label: "Calot's triangle",
      shape: 'box',
      position: [-0.048, 1.04, -0.152],
      size: [0.035, 0.025, 0.035],
      priority: 3,
    },
    {
      id: 'cystic_duct',
      label: 'Cystic duct',
      shape: 'cylinder',
      position: [-0.042, 1.036, -0.148],
      size: [0.005, 0.03, 0],
      rotation: [0, 0, Math.PI / 2.6],
      priority: 4,
    },
    {
      id: 'cystic_artery',
      label: 'Cystic artery',
      shape: 'cylinder',
      position: [-0.05, 1.043, -0.157],
      size: [0.004, 0.028, 0],
      rotation: [0, 0, Math.PI / 2.2],
      priority: 4,
    },
    {
      id: 'common_bile_duct',
      label: 'Common bile duct',
      shape: 'cylinder',
      position: [-0.022, 1.03, -0.13],
      size: [0.006, 0.07, 0],
      rotation: [Math.PI / 8, 0, 0],
      priority: 4,
      avoid: true,
    },
    {
      id: 'gallbladder_bed',
      label: 'Gallbladder bed (liver surface)',
      shape: 'box',
      position: [-0.088, 1.058, -0.12],
      size: [0.06, 0.02, 0.07],
      priority: 2,
    },
    {
      id: 'duodenum',
      label: 'Duodenum',
      shape: 'box',
      position: [-0.01, 1.028, -0.1],
      size: [0.05, 0.03, 0.07],
      priority: 1,
      avoid: true,
    },
  ],
};
