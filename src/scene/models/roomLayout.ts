import * as THREE from 'three';

/** Height of the table top in metres. Everything else is placed relative to it. */
export const TABLE_TOP_Y = 0.9;

/** Where the operative field sits by default. Cameras and the overhead light aim here. */
export const FIELD_CENTRE = new THREE.Vector3(0, TABLE_TOP_Y + 0.12, 0);
