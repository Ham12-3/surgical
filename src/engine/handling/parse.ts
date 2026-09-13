import type { HandlingCatalogue, HandlingFault, HandlingMove, HandlingSequence } from './types';

/** Validation for src/data/handling.json, in the procedure parser's spirit: checked, not trusted. */
export class HandlingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HandlingError';
  }
}

type Json = Record<string, unknown>;

function object(value: unknown, context: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HandlingError(`${context}: expected an object`);
  }
  return value as Json;
}

function text(record: Json, field: string, context: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new HandlingError(`${context}: "${field}" must be a non-empty string`);
  }
  return value;
}

function texts(record: Json, field: string, context: string): string[] {
  const value = record[field];
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string' && item.length > 0)) {
    throw new HandlingError(`${context}: "${field}" must be a list of non-empty strings`);
  }
  return value;
}

function parseMove(raw: unknown, context: string): HandlingMove {
  const record = object(raw, context);
  const repeat = record['repeat'];
  if (repeat !== undefined && (typeof repeat !== 'number' || !Number.isInteger(repeat) || repeat < 1)) {
    throw new HandlingError(`${context}: "repeat" must be a whole number of at least 1`);
  }
  const tip = record['tip'];
  return {
    id: text(record, 'id', context),
    label: text(record, 'label', context),
    repeat: typeof repeat === 'number' ? repeat : 1,
    ...(typeof tip === 'string' && tip.length > 0 ? { tip } : {}),
  };
}

function parseSequence(id: string, raw: unknown): HandlingSequence {
  const context = `handling "${id}"`;
  const record = object(raw, context);
  const rawMoves = record['moves'];
  if (!Array.isArray(rawMoves) || rawMoves.length === 0) throw new HandlingError(`${context}: "moves" must be a non-empty list`);
  const moves = rawMoves.map((move, index) => parseMove(move, `${context}.moves[${index}]`));
  const ids = new Set<string>();
  for (const move of moves) {
    if (ids.has(move.id)) throw new HandlingError(`${context}: duplicate move "${move.id}"`);
    ids.add(move.id);
  }
  const rawFaults = record['faults'] ?? [];
  if (!Array.isArray(rawFaults)) throw new HandlingError(`${context}: "faults" must be a list`);
  const faults: HandlingFault[] = rawFaults.map((fault, index) => {
    const where = `${context}.faults[${index}]`;
    const entry = object(fault, where);
    const move = text(entry, 'move', where);
    const before = text(entry, 'before', where);
    for (const name of [move, before]) {
      if (!ids.has(name)) throw new HandlingError(`${where}: no move "${name}" in this sequence`);
    }
    if (moves.findIndex((m) => m.id === move) <= moves.findIndex((m) => m.id === before)) {
      throw new HandlingError(`${where}: "${move}" is not after "${before}", so it cannot be made too early`);
    }
    return { move, before, feedback: text(entry, 'feedback', where) };
  });
  const todo = record['todo'];
  return { id, title: text(record, 'title', context), moves, faults, ...(typeof todo === 'string' && todo.length > 0 ? { todo } : {}) };
}

export function parseHandling(raw: unknown): HandlingCatalogue {
  const root = object(raw, 'handling');
  const reviewed = root['reviewed'];
  if (typeof reviewed !== 'boolean') throw new HandlingError('handling: "reviewed" must be true or false');
  const rawSequences = object(root['sequences'], 'handling.sequences');
  const sequences: Record<string, HandlingSequence> = {};
  for (const [id, sequence] of Object.entries(rawSequences)) sequences[id] = parseSequence(id, sequence);
  if (Object.keys(sequences).length === 0) throw new HandlingError('handling: no sequences');
  return {
    reviewed,
    references: texts(root, 'references', 'handling'),
    todo: root['todo'] === undefined ? [] : texts(root, 'todo', 'handling'),
    sequences,
  };
}
