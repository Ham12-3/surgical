import type { ZoneManifest } from './types';
import { forearmZones } from './forearm';
import { abdomenOpenZones } from './abdomenOpen';
import { abdomenLapZones } from './abdomenLap';

export type { ZoneManifest, ZoneSpec, ZoneShape } from './types';
export { zoneIds } from './types';

/** Every patient model variant, keyed by the `model` a procedure asks for. */
export const zoneManifests = {
  forearm: forearmZones,
  'abdomen-open': abdomenOpenZones,
  'abdomen-lap': abdomenLapZones,
} as const satisfies Record<string, ZoneManifest>;

export type PatientModel = keyof typeof zoneManifests;

export const patientModels = Object.keys(zoneManifests) as PatientModel[];

export function isPatientModel(value: string): value is PatientModel {
  return Object.prototype.hasOwnProperty.call(zoneManifests, value);
}

export function getZoneManifest(model: PatientModel): ZoneManifest {
  return zoneManifests[model];
}
