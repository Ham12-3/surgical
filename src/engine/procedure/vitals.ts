/**
 * A schematic vitals model: heart rate, blood pressure, oxygen saturation and
 * blood lost. It exists so that bleeding the student has not dealt with shows
 * on the monitor and in the report, not to model a real patient's physiology.
 *
 * TODO(clinical review): every figure below is a teaching approximation. The
 * compensation this shows (a rising pulse first, the pressure holding until
 * losses are large, then falling) is the shape taught for class I to III
 * haemorrhage, but the thresholds and rates need checking, and the monitor
 * carries the DEMO marking while they do.
 */

export interface VitalsState {
  readonly heartRate: number;
  readonly systolic: number;
  readonly diastolic: number;
  readonly spo2: number;
  readonly bloodLossMl: number;
}

export interface VitalsInput {
  /** Blood welling up right now, millilitres a second. */
  readonly bleedMlPerSecond: number;
}

export const RESTING_VITALS: VitalsState = {
  heartRate: 78,
  systolic: 122,
  diastolic: 76,
  spo2: 98,
  bloodLossMl: 0,
};

/** Losses above this many millilitres start to drop the pressure. */
const COMPENSATED_ML = 750;
/** Losses above this start to drop the saturation too. */
const SEVERE_ML = 1500;
/** Systolic minus diastolic at rest, and the narrowest it is allowed to get. */
const RESTING_PULSE_PRESSURE = RESTING_VITALS.systolic - RESTING_VITALS.diastolic;
const NARROWEST_PULSE_PRESSURE = 20;
/** How fast a reading closes on where the loss is driving it, per second. */
const SETTLE_PER_SECOND = 0.35;

function approach(value: number, target: number, seconds: number): number {
  const alpha = 1 - Math.pow(1 - SETTLE_PER_SECOND, Math.max(seconds, 0));
  return value + (target - value) * alpha;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Where the readings are heading for a given blood loss. */
export function vitalsTarget(bloodLossMl: number): Omit<VitalsState, 'bloodLossMl'> {
  const loss = Math.max(bloodLossMl, 0);
  // Pulse climbs from the start; pressure holds while it can, then falls away.
  const heartRate = clamp(RESTING_VITALS.heartRate + loss * 0.045, RESTING_VITALS.heartRate, 150);
  const overCompensated = Math.max(loss - COMPENSATED_ML, 0);
  const systolic = clamp(RESTING_VITALS.systolic - overCompensated * 0.05, 62, RESTING_VITALS.systolic);
  // The diastolic follows the systolic down with the gap between them
  // narrowing, and never crosses it. TODO(clinical review): the narrowing
  // rate and floor are placeholders.
  const pulsePressure = clamp(
    RESTING_PULSE_PRESSURE - overCompensated * 0.02,
    NARROWEST_PULSE_PRESSURE,
    RESTING_PULSE_PRESSURE,
  );
  const diastolic = clamp(systolic - pulsePressure, 40, RESTING_VITALS.diastolic);
  const spo2 = clamp(RESTING_VITALS.spo2 - Math.max(loss - SEVERE_ML, 0) * 0.006, 88, RESTING_VITALS.spo2);
  return { heartRate, systolic, diastolic, spo2 };
}

/** Carry the vitals forward by `seconds`, with whatever is bleeding now. */
export function stepVitals(state: VitalsState, seconds: number, input: VitalsInput): VitalsState {
  const bloodLossMl = state.bloodLossMl + Math.max(input.bleedMlPerSecond, 0) * Math.max(seconds, 0);
  const target = vitalsTarget(bloodLossMl);
  return {
    heartRate: approach(state.heartRate, target.heartRate, seconds),
    systolic: approach(state.systolic, target.systolic, seconds),
    diastolic: approach(state.diastolic, target.diastolic, seconds),
    spo2: approach(state.spo2, target.spo2, seconds),
    bloodLossMl,
  };
}

/** How the vitals read as a phrase, for the report and the HUD. */
export function describeVitals(state: VitalsState): string {
  return `${Math.round(state.heartRate)} bpm, ${Math.round(state.systolic)}/${Math.round(state.diastolic)}, SpO2 ${Math.round(state.spo2)}%`;
}
