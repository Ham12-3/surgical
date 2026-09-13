import { ProcedureError, parseProcedure } from '../../engine/procedure/parse';
import type { Procedure } from '../../engine/procedure/types';
import { handlingIds } from '../handling';
import { getZoneManifest, isPatientModel, patientModels, zoneIds } from '../zones';
import lacerationRepairJson from './lacerationRepair.json';
import openAppendectomyJson from './openAppendectomy.json';

/**
 * Every playable procedure, by id, and the one place their JSON is validated.
 *
 * The zones come from here, because a procedure names its own model. The
 * instrument ids and camera presets are handed in: the catalogue is already
 * parsed by whoever calls this, and the presets live in the scene, which data
 * code does not import.
 */

const SOURCES = {
  open_appendectomy: openAppendectomyJson,
  laceration_repair: lacerationRepairJson,
} as const satisfies Record<string, unknown>;

export type ProcedureId = keyof typeof SOURCES;

export const procedureIds = Object.keys(SOURCES) as ProcedureId[];

export interface ProcedureCatalogue {
  readonly toolIds: Iterable<string>;
  readonly cameraPresets: Iterable<string>;
}

export function loadProcedure(id: ProcedureId, catalogue: ProcedureCatalogue): Procedure {
  const raw: unknown = SOURCES[id];
  const model = typeof raw === 'object' && raw !== null ? (raw as { model?: unknown }).model : undefined;
  if (typeof model !== 'string' || !isPatientModel(model)) {
    throw new ProcedureError(`procedure "${id}": unknown patient model "${String(model)}"`);
  }
  return parseProcedure(raw, {
    toolIds: new Set(catalogue.toolIds),
    zoneIds: new Set(zoneIds(getZoneManifest(model))),
    cameraPresets: new Set(catalogue.cameraPresets),
    patientModels: new Set(patientModels),
    handlingIds: new Set(handlingIds),
  });
}
