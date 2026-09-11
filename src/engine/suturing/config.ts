import {
  SUTURE_FAULTS,
  TISSUE_LAYERS,
  type KnotSpec,
  type PadDimensions,
  type Range,
  type SutureFault,
  type SuturePadConfig,
  type SutureTargets,
  type TissueLayer,
} from './types';

/**
 * Validation for the suturing pad's JSON. Like the tool catalogue it is
 * checked rather than trusted, and a bad field throws with its path in the
 * message.
 */
export class SuturePadConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SuturePadConfigError';
  }
}

type Json = Record<string, unknown>;

function object(value: unknown, context: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SuturePadConfigError(`${context}: expected an object`);
  }
  return value as Json;
}

function positive(record: Json, field: string, context: string): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new SuturePadConfigError(`${context}: "${field}" must be a positive number`);
  }
  return value;
}

function count(record: Json, field: string, context: string): number {
  const value = positive(record, field, context);
  if (!Number.isInteger(value)) throw new SuturePadConfigError(`${context}: "${field}" must be a whole number`);
  return value;
}

function text(record: Json, field: string, context: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new SuturePadConfigError(`${context}: "${field}" must be a non-empty string`);
  }
  return value;
}

function texts(record: Json, field: string, context: string): string[] {
  const value = record[field];
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string' && item.length > 0)) {
    throw new SuturePadConfigError(`${context}: "${field}" must be a list of non-empty strings`);
  }
  return value;
}

function range(record: Json, field: string, context: string): Range {
  const where = `${context}.${field}`;
  const raw = object(record[field], where);
  const min = positive(raw, 'min', where);
  const max = positive(raw, 'max', where);
  if (min >= max) throw new SuturePadConfigError(`${where}: "min" must be below "max"`);
  return { min, max };
}

function parsePad(raw: unknown): PadDimensions {
  const record = object(raw, 'pad');
  const pad: PadDimensions = {
    widthMm: positive(record, 'widthMm', 'pad'),
    lengthMm: positive(record, 'lengthMm', 'pad'),
    skinMm: positive(record, 'skinMm', 'pad'),
    fatMm: positive(record, 'fatMm', 'pad'),
    fasciaMm: positive(record, 'fasciaMm', 'pad'),
    baseMm: positive(record, 'baseMm', 'pad'),
    woundLengthMm: positive(record, 'woundLengthMm', 'pad'),
    woundGapMm: positive(record, 'woundGapMm', 'pad'),
    woundDepthMm: positive(record, 'woundDepthMm', 'pad'),
  };
  if (pad.woundLengthMm >= pad.lengthMm) {
    throw new SuturePadConfigError('pad: the wound must be shorter than the pad');
  }
  if (pad.woundDepthMm >= pad.skinMm + pad.fatMm + pad.fasciaMm) {
    throw new SuturePadConfigError('pad: the wound must stop above the pad backing');
  }
  return pad;
}

function parseTargets(raw: unknown): SutureTargets {
  const record = object(raw, 'targets');
  const depthLayer = text(record, 'depthLayer', 'targets');
  if (!(TISSUE_LAYERS as readonly string[]).includes(depthLayer)) {
    throw new SuturePadConfigError(`targets: unknown depthLayer "${depthLayer}"`);
  }
  return {
    entryAngleDeg: range(record, 'entryAngleDeg', 'targets'),
    biteMm: range(record, 'biteMm', 'targets'),
    symmetryMm: positive(record, 'symmetryMm', 'targets'),
    depthLayer: depthLayer as TissueLayer,
    spacingMm: range(record, 'spacingMm', 'targets'),
    spacingSpreadMm: positive(record, 'spacingSpreadMm', 'targets'),
    depthSpreadMm: positive(record, 'depthSpreadMm', 'targets'),
  };
}

function parseKnot(raw: unknown): KnotSpec {
  const record = object(raw, 'knot');
  const window = positive(record, 'window', 'knot');
  if (window >= 1) throw new SuturePadConfigError('knot: "window" must be below 1');
  return { throws: count(record, 'throws', 'knot'), periodMs: positive(record, 'periodMs', 'knot'), window };
}

export function parseSuturePadConfig(raw: unknown): SuturePadConfig {
  const root = object(raw, 'suture pad');
  const version = root['version'];
  if (typeof version !== 'number') throw new SuturePadConfigError('suture pad: "version" must be a number');
  const reviewed = root['reviewed'];
  if (typeof reviewed !== 'boolean') throw new SuturePadConfigError('suture pad: "reviewed" must be true or false');

  const feedbackRecord = object(root['feedback'], 'feedback');
  const feedback = {} as Record<SutureFault, string>;
  for (const fault of SUTURE_FAULTS) feedback[fault] = text(feedbackRecord, fault, 'feedback');

  return {
    version,
    id: text(root, 'id', 'suture pad'),
    title: text(root, 'title', 'suture pad'),
    reviewed,
    references: texts(root, 'references', 'suture pad'),
    todo: texts(root, 'todo', 'suture pad'),
    pad: parsePad(root['pad']),
    needleRadiusMm: positive(object(root['needle'], 'needle'), 'radiusMm', 'needle'),
    sutureCount: count(root, 'sutureCount', 'suture pad'),
    targets: parseTargets(root['targets']),
    knot: parseKnot(root['knot']),
    feedback,
  };
}
