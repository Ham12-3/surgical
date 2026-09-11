import * as THREE from 'three';
import type { Disposer } from '../disposal';

/**
 * The patient monitor's display: a small canvas drawn in code and shown on the
 * monitor model's `screen` face through the palette's screen material.
 *
 * A placeholder until a vitals model drives it (the brief puts that with the
 * appendectomy): steady resting values and generic scrolling traces, marked
 * DEMO so nobody takes them for a reading. Only the strip the sweep has just
 * crossed is redrawn, 15 times a second, which keeps the canvas work and the
 * texture upload small.
 */

// 13:9, the shape of the model's screen (blender/scripts/assets/env_vitals_monitor.py).
const WIDTH = 416;
const HEIGHT = 288;
const TRACE_LEFT = 10;
const TRACE_RIGHT = 272;
const SWEEP_SECONDS = 5;
const REDRAW_INTERVAL = 1 / 15;
const BACKGROUND = '#05080b';

const BEAT_SECONDS = 60 / 72;
const BREATH_SECONDS = 60 / 14;

interface Channel {
  label: string;
  colour: string;
  /** Canvas y of the trace's zero line, and pixels per unit of signal. */
  baseline: number;
  gain: number;
  wave: (seconds: number) => number;
  lastY: number;
}

function bump(x: number, centre: number, width: number, height: number): number {
  return height * Math.exp(-(((x - centre) / width) ** 2));
}

/** A stylised lead II complex, one per beat: P wave, QRS, T wave. */
function ecg(seconds: number): number {
  const p = (seconds / BEAT_SECONDS) % 1;
  return (
    bump(p, 0.16, 0.035, 0.12) -
    bump(p, 0.3, 0.008, 0.12) +
    bump(p, 0.32, 0.01, 1) -
    bump(p, 0.345, 0.012, 0.28) +
    bump(p, 0.58, 0.06, 0.26)
  );
}

/** Pulse trace: a quick upstroke and a slower fall with a small notch, after each beat. */
function pleth(seconds: number): number {
  const p = (seconds / BEAT_SECONDS + 0.75) % 1;
  return bump(p, 0.22, 0.09, 1) + bump(p, 0.42, 0.08, 0.35);
}

function respiration(seconds: number): number {
  return Math.sin((2 * Math.PI * seconds) / BREATH_SECONDS);
}

export class VitalsDisplay {
  private readonly context: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly channels: Channel[] = [
    { label: 'II', colour: '#39e07a', baseline: 84, gain: 40, wave: ecg, lastY: 84 },
    { label: 'Pleth', colour: '#35c8f0', baseline: 176, gain: 34, wave: pleth, lastY: 176 },
    { label: 'Resp', colour: '#f4d35e', baseline: 246, gain: 14, wave: respiration, lastY: 246 },
  ];
  private seconds = 0;
  private sinceRedraw = 0;
  private sweepX = TRACE_LEFT;

  constructor(material: THREE.MeshBasicMaterial, disposer: Disposer) {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No 2D canvas for the vitals display');
    this.context = context;
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

  update(delta: number): void {
    this.seconds += delta;
    this.sinceRedraw += delta;
    if (this.sinceRedraw < REDRAW_INTERVAL) return;
    this.drawSweep(this.sinceRedraw);
    this.sinceRedraw = 0;
    this.texture.needsUpdate = true;
  }

  /** Background and numbers: everything that does not move. */
  private drawReadouts(): void {
    const c = this.context;
    c.fillStyle = BACKGROUND;
    c.fillRect(0, 0, WIDTH, HEIGHT);
    c.strokeStyle = '#1c2630';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(TRACE_RIGHT + 8, 8);
    c.lineTo(TRACE_RIGHT + 8, HEIGHT - 8);
    c.stroke();

    c.textBaseline = 'top';
    const readouts = [
      ['HR', '72', '#39e07a', 10],
      ['SpO2', '98', '#35c8f0', 80],
      ['NIBP', '118/76', '#e8eef2', 150],
      ['RR', '14', '#f4d35e', 210],
    ] as const;
    for (const [label, value, colour, y] of readouts) {
      c.fillStyle = colour;
      c.font = '600 12px system-ui, sans-serif';
      c.fillText(label, TRACE_RIGHT + 18, y);
      c.font = `700 ${value.length > 3 ? 26 : 38}px system-ui, sans-serif`;
      c.fillText(value, TRACE_RIGHT + 18, y + 15);
    }
    c.fillStyle = '#ff9f43';
    c.font = '700 11px system-ui, sans-serif';
    c.fillText('DEMO', WIDTH - 44, HEIGHT - 20);
  }

  /** Carry the sweep on by `elapsed` seconds of trace, clearing just ahead of it. */
  private drawSweep(elapsed: number): void {
    const c = this.context;
    const pxPerSecond = (TRACE_RIGHT - TRACE_LEFT) / SWEEP_SECONDS;
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
        const t = this.seconds - (to - x) / pxPerSecond;
        channel.lastY = channel.baseline - channel.gain * channel.wave(t);
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
