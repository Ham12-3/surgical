import { describe, expect, it } from 'vitest';
import { RESTING_VITALS, describeVitals, stepVitals, vitalsTarget } from '../src/engine/procedure/vitals';

/** Carry the vitals forward a number of seconds in 0.1 s steps. */
function run(seconds: number, bleedMlPerSecond: number, from = RESTING_VITALS) {
  let state = from;
  for (let t = 0; t < seconds * 10; t += 1) state = stepVitals(state, 0.1, { bleedMlPerSecond });
  return state;
}

describe('vitals', () => {
  it('sit still when nothing is bleeding', () => {
    const state = run(60, 0);
    expect(state).toEqual(RESTING_VITALS);
  });

  it('count what is lost and raise the pulse first', () => {
    const state = run(60, 5);
    expect(state.bloodLossMl).toBeCloseTo(300, 5);
    expect(state.heartRate).toBeGreaterThan(RESTING_VITALS.heartRate + 10);
    // Pressure still holding at this loss.
    expect(state.systolic).toBeCloseTo(RESTING_VITALS.systolic, 0);
  });

  it('let the pressure fall once the loss is large', () => {
    const state = run(240, 5);
    expect(state.bloodLossMl).toBeCloseTo(1200, 5);
    expect(state.systolic).toBeLessThan(RESTING_VITALS.systolic - 15);
    expect(state.heartRate).toBeGreaterThan(120);
  });

  it('settle back toward rest once the bleeding stops, minus what was lost', () => {
    const bleeding = run(60, 5);
    const after = run(60, 0, bleeding);
    expect(after.bloodLossMl).toBeCloseTo(bleeding.bloodLossMl, 5);
    expect(after.heartRate).toBeCloseTo(vitalsTarget(after.bloodLossMl).heartRate, 1);
  });

  it('stay inside sane bounds however much is lost', () => {
    const state = run(600, 20);
    expect(state.heartRate).toBeLessThanOrEqual(150);
    expect(state.systolic).toBeGreaterThanOrEqual(62);
    expect(state.spo2).toBeGreaterThanOrEqual(88);
    expect(state.diastolic).toBeLessThan(state.systolic);
  });

  it('read out as a monitor would', () => {
    expect(describeVitals(RESTING_VITALS)).toBe('78 bpm, 122/76, SpO2 98%');
  });
});
