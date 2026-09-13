import { describe, expect, it } from 'vitest';
import { ProcedureError, parseProcedure } from '../src/engine/procedure/parse';
import { rawProcedure, testContext } from './fixtures/procedure';

const base = rawProcedure as unknown as Record<string, unknown>;
const steps = (): Record<string, unknown>[] => JSON.parse(JSON.stringify(base['steps'])) as Record<string, unknown>[];

function withFirstStep(change: Record<string, unknown>): unknown {
  const list = steps();
  list[0] = { ...list[0], ...change };
  return { ...base, steps: list };
}

describe('parseProcedure', () => {
  it('accepts the test procedure and keeps what the screens need', () => {
    const procedure = parseProcedure(rawProcedure, testContext);
    expect(procedure.reviewed).toBe(false);
    expect(procedure.steps).toHaveLength(2);
    expect(procedure.steps[0]?.target.tolerance).toBe(0.6);
    expect(procedure.steps[0]?.quiz?.answer).toBe('#10');
    expect(procedure.steps[1]?.bleedMlPerSecond).toBe(4);
    expect(procedure.steps[1]?.camera).toBeUndefined();
  });

  it('rejects a step aimed at a zone the model does not have', () => {
    expect(() => parseProcedure(withFirstStep({ target: { zoneId: 'elbow' } }), testContext)).toThrow(/elbow/);
  });

  it('rejects an instrument that is not in the catalogue, or not on the tray', () => {
    expect(() => parseProcedure(withFirstStep({ instruments: ['spanner'] }), testContext)).toThrow(/spanner/);
    expect(() => parseProcedure(withFirstStep({ instruments: ['needle_holder'] }), testContext)).toThrow(/on the tray/);
  });

  it('rejects an unknown action or camera preset', () => {
    expect(() => parseProcedure(withFirstStep({ action: 'cauterise' }), testContext)).toThrow(/cauterise/);
    expect(() => parseProcedure(withFirstStep({ camera: 'from-the-ceiling' }), testContext)).toThrow(/from-the-ceiling/);
  });

  it('rejects a tolerance outside its range', () => {
    expect(() => parseProcedure(withFirstStep({ target: { zoneId: 'skin_line', tolerance: 0 } }), testContext)).toThrow(
      /tolerance/,
    );
  });

  it('rejects a quiz whose answer is not one of its options', () => {
    const quiz = { question: 'Which blade?', options: ['#10', '#15'], answer: '#11' };
    expect(() => parseProcedure(withFirstStep({ quiz }), testContext)).toThrow(/not one of the options/);
  });

  it('rejects duplicate step ids', () => {
    const list = steps();
    const first = list[0];
    expect(() => parseProcedure({ ...base, steps: [first, first] }, testContext)).toThrow(/duplicate step id/);
  });

  it('insists on being told whether it has been reviewed', () => {
    expect(() => parseProcedure({ ...base, reviewed: 'not yet' }, testContext)).toThrow(ProcedureError);
    expect(() => parseProcedure({ ...base, reviewed: 'not yet' }, testContext)).toThrow(/reviewed/);
  });

  it('rejects an unknown patient model', () => {
    expect(() => parseProcedure({ ...base, model: 'left-knee' }, testContext)).toThrow(/left-knee/);
  });
});
