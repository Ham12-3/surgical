import { isActionType, type ActionType } from '../types';
import type { CommonError, Procedure, ProcedureStep, StepQuiz, StepTarget } from './types';

/**
 * Validation for a procedure's JSON, in the same spirit as the tool
 * catalogue's: checked rather than trusted, and a bad field throws with the
 * step it came from in the message.
 *
 * What counts as a known instrument, zone or camera preset is passed in, so
 * the engine stays free of the scene and the data it validates against can be
 * whatever the caller has loaded.
 */

export class ProcedureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProcedureError';
  }
}

export interface ProcedureContext {
  readonly toolIds: ReadonlySet<string>;
  readonly zoneIds: ReadonlySet<string>;
  readonly cameraPresets: ReadonlySet<string>;
  readonly patientModels: ReadonlySet<string>;
}

type Json = Record<string, unknown>;

function object(value: unknown, context: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProcedureError(`${context}: expected an object`);
  }
  return value as Json;
}

function text(record: Json, field: string, context: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new ProcedureError(`${context}: "${field}" must be a non-empty string`);
  }
  return value;
}

function optionalText(record: Json, field: string, context: string): string | undefined {
  return record[field] === undefined ? undefined : text(record, field, context);
}

function texts(record: Json, field: string, context: string): string[] {
  const value = record[field];
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string' && item.length > 0)) {
    throw new ProcedureError(`${context}: "${field}" must be a list of non-empty strings`);
  }
  return value;
}

function number(record: Json, field: string, context: string): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ProcedureError(`${context}: "${field}" must be a positive number`);
  }
  return value;
}

function parseTarget(raw: unknown, context: string, known: ProcedureContext): StepTarget {
  const record = object(raw, `${context}.target`);
  const zoneId = text(record, 'zoneId', `${context}.target`);
  if (!known.zoneIds.has(zoneId)) {
    throw new ProcedureError(`${context}.target: no zone "${zoneId}" in this procedure's model`);
  }
  const tolerance = record['tolerance'];
  if (tolerance === undefined) return { zoneId };
  if (typeof tolerance !== 'number' || !(tolerance > 0 && tolerance <= 1)) {
    throw new ProcedureError(`${context}.target: "tolerance" must be more than 0 and at most 1`);
  }
  return { zoneId, tolerance };
}

function parseErrors(raw: unknown, context: string): CommonError[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new ProcedureError(`${context}: "commonErrors" must be a list`);
  return raw.map((entry, index) => {
    const record = object(entry, `${context}.commonErrors[${index}]`);
    return {
      code: text(record, 'code', `${context}.commonErrors[${index}]`),
      feedback: text(record, 'feedback', `${context}.commonErrors[${index}]`),
    };
  });
}

function parseQuiz(raw: unknown, context: string): StepQuiz | undefined {
  if (raw === undefined) return undefined;
  const record = object(raw, `${context}.quiz`);
  const options = texts(record, 'options', `${context}.quiz`);
  if (options.length < 2) throw new ProcedureError(`${context}.quiz: needs at least two options`);
  const answer = text(record, 'answer', `${context}.quiz`);
  if (!options.includes(answer)) {
    throw new ProcedureError(`${context}.quiz: the answer "${answer}" is not one of the options`);
  }
  return { question: text(record, 'question', `${context}.quiz`), options, answer };
}

function parseStep(raw: unknown, index: number, known: ProcedureContext): ProcedureStep {
  const record = object(raw, `step at index ${index}`);
  const id = text(record, 'id', `step at index ${index}`);
  const context = `step "${id}"`;

  const instruments = texts(record, 'instruments', context);
  for (const toolId of instruments) {
    if (!known.toolIds.has(toolId)) throw new ProcedureError(`${context}: no instrument "${toolId}" in the catalogue`);
  }

  const action = text(record, 'action', context);
  if (!isActionType(action)) throw new ProcedureError(`${context}: unknown action "${action}"`);

  const camera = optionalText(record, 'camera', context);
  if (camera !== undefined && !known.cameraPresets.has(camera)) {
    throw new ProcedureError(`${context}: unknown camera preset "${camera}"`);
  }

  const step: ProcedureStep = {
    id,
    title: text(record, 'title', context),
    objective: text(record, 'objective', context),
    explanation: text(record, 'explanation', context),
    instruments,
    action: action as ActionType,
    target: parseTarget(record['target'], context, known),
    hints: record['hints'] === undefined ? [] : texts(record, 'hints', context),
    commonErrors: parseErrors(record['commonErrors'], context),
  };

  const quiz = parseQuiz(record['quiz'], context);
  const todo = optionalText(record, 'todo', context);
  const bleed = record['bleedMlPerSecond'];
  if (bleed !== undefined && (typeof bleed !== 'number' || !(bleed > 0))) {
    throw new ProcedureError(`${context}: "bleedMlPerSecond" must be a positive number`);
  }
  return {
    ...step,
    ...(camera === undefined ? {} : { camera }),
    ...(quiz === undefined ? {} : { quiz }),
    ...(todo === undefined ? {} : { todo }),
    ...(bleed === undefined ? {} : { bleedMlPerSecond: bleed as number }),
  };
}

export function parseProcedure(raw: unknown, known: ProcedureContext): Procedure {
  const root = object(raw, 'procedure');
  const id = text(root, 'id', 'procedure');
  const context = `procedure "${id}"`;

  const model = text(root, 'model', context);
  if (!known.patientModels.has(model)) throw new ProcedureError(`${context}: unknown patient model "${model}"`);

  const reviewed = root['reviewed'];
  if (typeof reviewed !== 'boolean') throw new ProcedureError(`${context}: "reviewed" must be true or false`);

  const trayToolIds = texts(root, 'trayToolIds', context);
  for (const toolId of trayToolIds) {
    if (!known.toolIds.has(toolId)) throw new ProcedureError(`${context}: no tray instrument "${toolId}" in the catalogue`);
  }

  const rawSteps = root['steps'];
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    throw new ProcedureError(`${context}: "steps" must be a non-empty list`);
  }
  const steps = rawSteps.map((step, index) => parseStep(step, index, known));
  const seen = new Set<string>();
  for (const step of steps) {
    if (seen.has(step.id)) throw new ProcedureError(`${context}: duplicate step id "${step.id}"`);
    seen.add(step.id);
    // Every instrument a step needs has to be within reach.
    if (!step.instruments.some((toolId) => trayToolIds.includes(toolId))) {
      throw new ProcedureError(`step "${step.id}": none of its instruments are on the tray`);
    }
  }

  return {
    id,
    title: text(root, 'title', context),
    difficulty: number(root, 'difficulty', context),
    estimatedMinutes: number(root, 'estimatedMinutes', context),
    model,
    reviewed,
    references: texts(root, 'references', context),
    todo: root['todo'] === undefined ? [] : texts(root, 'todo', context),
    trayToolIds,
    steps,
  };
}
