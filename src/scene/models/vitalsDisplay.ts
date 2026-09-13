import * as THREE from 'three';
import type { Disposer } from '../disposal';
import { RESTING_VITALS, type VitalsState } from '../../engine/procedure/vitals';

/**
 * The patient monitor's display: a small canvas drawn in code and shown on the
 * monitor model's `screen` face through the palette's screen material.
 *
 * The numbers come from the procedure's vitals model through `setVitals`, and
 * the traces beat at the heart rate shown. That model is schematic and
 * unreviewed (src/engine/procedure/vitals.ts), so the screen stays marked DEMO.
 * Only the strip the sweep has just crossed is redrawn, 15 times a second,
 * which keeps the canvas work and the texture upload small.
 */

// 13:9, the shape of the model's screen (blender/scripts/assets/env_vitals_monitor.py).
const WIDTH = 416;
const HEIGHT = 288;
const TRACE_LEFT = 10;
const TRACE_RIGHT = 272;
const SWEEP_SECONDS = 5;
const REDRAW_INTERVAL = 1 / 15;
const BACKGROUND = '#05080b';

/** Breathing is not modelled; the rate shown and traced stays at rest. */
const RESPIRATORY_RATE = 14;
const BREATH_SECONDS = 60 / RESPIRATORY_RATE;

interface Channel {
  label: string;
  colour: string;
  /** Canvas y of the trace's zero line, and pixels per unit of signal. */
  baseline: number;
  gain: number;
  /** The signal at a time in seconds and a running count of heartbeats. */
  wave: (seconds: number, beats: number) => number;
  lastY: number;
}

function bump(x: number, centre: number, width: number, height: number): number {
  return height * Math.exp(-(((x - centre) / width) ** 2));
}

function fraction(value: number): number {
  return value - Math.floor(value);
}

/** A stylised lead II complex, one per beat: P wave, QRS, T wave. */
function ecg(_seconds: number, beats: number): number {
  const p = fraction(beats);
  return (
    bump(p, 0.16, 0.035, 0.12) -
    bump(p, 0.3, 0.008, 0.12) +
    bump(p, 0.32, 0.01, 1) -
    bump(p, 0.345, 0.012, 0.28) +
    bump(p, 0.58, 0.06, 0.26)
  );
}

/** Pulse trace: a quick upstroke and a slower fall with a small notch, after each beat. */
function pleth(_seconds: number, beats: number): number {
  const p = fraction(beats + 0.75);
  return bump(p, 0.22, 0.09, 1) + bump(p, 0.42, 0.08, 0.35);
}

function respiration(seconds: number): number {
  return Math.sin((2 * Math.PI * seconds) / BREATH_SECONDS);
}

/** The readings as the screen shows them, rounded, so a redraw only happens when one changes. */
function readouts(vitals: VitalsState): ReadonlyArray<readonly [string, string, string, number]> {
  return [
    ['HR', String(Math.round(vitals.heartRate)), '#39e07a', 10],
    ['SpO2', String(Math.round(vitals.spo2)), '#35c8f0', 80],
    ['NIBP', `${Math.round(vitals.systolic)}/${Math.round(vitals.diastolic)}`, '#e8eef2', 150],
    ['RR', String(RESPIRATORY_RATE), '#f4d35e', 210],
  ];
}

export class VitalsDisplay {
  private readonly context: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly channels: Channel[] = [
    { label: 'II', colour: '#39e07a', baseline: 84, gain: 40, wave: ecg, lastY: 84 },
    { label: 'Pleth', colour: '#35c8f0', baseline: 176, gain: 34, wave: pleth, lastY: 176 },
    { label: 'Resp', colour: '#f4d35e', baseline: 246, gain: 14, wave: respiration, lastY: 246 },
  ];
  private vitals: VitalsState = RESTING_VITALS;
  private shown = '';
  private seconds = 0;
  /** Heartbeats so far, counted at whatever rate each moment had, so a changing rate never jumps the trace. */
  private beats = 0;
  private sinceRedraw = 0;
  private sweepX = TRACE_LEFT;

  constructor(material: THREE.MeshBasicMaterial, disposer: Disposer) {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No 2D canvas for the vitals display');
    this.context = context;
    context.fillStyle = BACKGROUND;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    this.drawReadouts();

    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    // The screen's UVs come from glTF, where v runs top to bottom, so the
    // canvas must go up unflipped or the display shows upside down.
    this.texture.flipY = false;
    disposer.register(this.texture);

    material.map = this.texture;
    material.color.set(0xffffff);
    material.needsUpdate = true;
  }

  setVitals(vitals: VitalsState): void {
    this.vitals = vitals;
    if (readouts(vitals).map(([, value]) => value).join() === this.shown) return;
    this.drawReadouts();
    this.texture.needsUpdate = true;
  }

  update(delta: number): void {
    this.seconds += delta;
    this.beats += (delta * this.vitals.heartRate) / 60;
    this.sinceRedraw += delta;
    if (this.sinceRedraw < REDRAW_INTERVAL) return;
    this.drawSweep(this.sinceRedraw);
    this.sinceRedraw = 0;
    this.texture.needsUpdate = true;
  }

  /** The numbers panel on the right, leaving the traces alone. */
  private drawReadouts(): void {
    const c = this.context;
    c.fillStyle = BACKGROUND;
    c.fillRect(TRACE_RIGHT + 4, 0, WIDTH - TRACE_RIGHT - 4, HEIGHT);
    c.strokeStyle = '#1c2630';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(TRACE_RIGHT + 8, 8);
    c.lineTo(TRACE_RIGHT + 8, HEIGHT - 8);
    c.stroke();

    c.textBaseline = 'top';
    const values = readouts(this.vitals);
    for (const [label, value, colour, y] of values) {
      c.fillStyle = colour;
      c.font = '600 12px system-ui, sans-serif';
      c.fillText(label, TRACE_RIGHT + 18, y);
      c.font = `700 ${value.length > 3 ? 26 : 38}px system-ui, sans-serif`;
      c.fillText(value, TRACE_RIGHT + 18, y + 15);
    }
    c.fillStyle = '#ff9f43';
    c.font = '700 11px system-ui, sans-serif';
    c.fillText('DEMO', WIDTH - 44, HEIGHT - 20);
    this.shown = values.map(([, value]) => value).join();
  }

  /** Carry the sweep on by `elapsed` seconds of trace, clearing just ahead of it. */
  private drawSweep(elapsed: number): void {
    const c = this.context;
    const pxPerSecond = (TRACE_RIGHT - TRACE_LEFT) / SWEEP_SECONDS;
    const beatsPerSecond = this.vitals.heartRate / 60;
    const from = this.sweepX;
    const to = Math.min(TRACE_RIGHT, from + elapsed * pxPerSecond);

    // A real monitor overwrites its oldest trace, leaving a small gap ahead of
    // the sweep; clearing a little past `to` makes that gap.
    c.fillStyle = BACKGROUND;
    c.fillRect(from, 0, Math.min(to + 12, TRACE_RIGHT + 2) - from, HEIGHT);

    c.lineWidth = 1.6;
    for (const channel of this.channels) {
      c.strokeStyle = channel.colour;
      c.beginPath();
      c.moveTo(from, channel.lastY);
      for (let x = from + 1; x <= to; x += 1) {
        const back = (to - x) / pxPerSecond;
        channel.lastY = channel.baseline - channel.gain * channel.wave(this.seconds - back, this.beats - back * beatsPerSecond);
        c.lineTo(x, channel.lastY);
      }
      c.stroke();
    }

    // Labels sit on the traces, so put them back after the sweep crosses them.
    c.font = '600 11px system-ui, sans-serif';
    for (const channel of this.channels) {
      c.fillStyle = channel.colour;
      c.fillText(channel.label, TRACE_LEFT, channel.baseline - channel.gain - 14);
    }

    this.sweepX = to >= TRACE_RIGHT ? TRACE_LEFT : to;
  }
}
