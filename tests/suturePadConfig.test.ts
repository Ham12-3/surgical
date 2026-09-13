import { describe, expect, it } from 'vitest';
import suturePadJson from '../src/data/drills/suturePad.json';
import { SuturePadConfigError, parseSuturePadConfig } from '../src/engine/suturing/config';
import { SUTURE_FAULTS } from '../src/engine/suturing/types';

const base = suturePadJson as unknown as Record<string, unknown>;
const section = (name: string): Record<string, unknown> => base[name] as Record<string, unknown>;

describe('parseSuturePadConfig', () => {
  it('accepts the shipped pad, which is marked as not yet reviewed', () => {
    const config = parseSuturePadConfig(suturePadJson);
    expect(config.reviewed).toBe(false);
    expect(config.todo.length).toBeGreaterThan(0);
    expect(config.sutureCount).toBe(5);
    expect(Object.keys(config.feedback).sort()).toEqual([...SUTURE_FAULTS].sort());
  });

  it('wants feedback for every fault', () => {
    const feedback = { ...section('feedback') };
    delete feedback['depth_uneven'];
    expect(() => parseSuturePadConfig({ ...base, feedback })).toThrow(SuturePadConfigError);
    expect(() => parseSuturePadConfig({ ...base, feedback })).toThrow(/depth_uneven/);
  });

  it('rejects a range whose min is not below its max', () => {
    const targets = { ...section('targets'), biteMm: { min: 9, max: 5 } };
    expect(() => parseSuturePadConfig({ ...base, targets })).toThrow(/min/);
  });

  it('rejects an unknown target layer', () => {
    const targets = { ...section('targets'), depthLayer: 'bone' };
    expect(() => parseSuturePadConfig({ ...base, targets })).toThrow(/bone/);
  });

  it('rejects a wound longer than the pad, or one cut into the backing', () => {
    expect(() => parseSuturePadConfig({ ...base, pad: { ...section('pad'), woundLengthMm: 200 } })).toThrow(/shorter/);
    expect(() => parseSuturePadConfig({ ...base, pad: { ...section('pad'), woundDepthMm: 30 } })).toThrow(/backing/);
  });

  it('rejects a knot window of the whole bar', () => {
    expect(() => parseSuturePadConfig({ ...base, knot: { ...section('knot'), window: 1 } })).toThrow(/window/);
  });

  it('insists on being told whether it has been reviewed', () => {
    expect(() => parseSuturePadConfig({ ...base, reviewed: 'no' })).toThrow(/reviewed/);
  });
});
