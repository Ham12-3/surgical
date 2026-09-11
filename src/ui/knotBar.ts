import { markerPosition } from '../engine/suturing/knot';
import type { KnotSpec } from '../engine/suturing/types';
import { element } from './dom';

/**
 * The knot's timing bar: a marker sweeping back and forth along a track, the
 * window at its middle, and a dot for each throw that fills in as it lands or
 * slips. The timing itself is judged by the engine (knot.ts).
 */
export class KnotBar {
  readonly element: HTMLElement;
  private readonly marker: HTMLElement;
  private readonly dots: HTMLElement[] = [];

  constructor(private readonly spec: KnotSpec) {
    this.element = element('div', 'suture__knot');
    const track = element('div', 'suture__knot-track');
    const zone = element('div', 'suture__knot-window');
    // The marker's -1..1 maps onto 0..100% of the track.
    zone.style.left = `${(1 - spec.window) * 50}%`;
    zone.style.width = `${spec.window * 100}%`;
    this.marker = element('div', 'suture__knot-marker');
    track.append(zone, this.marker);

    const throws = element('div', 'suture__throws');
    throws.setAttribute('aria-label', `${spec.throws} throws`);
    for (let i = 0; i < spec.throws; i += 1) {
      const dot = element('span', 'suture__throw');
      this.dots.push(dot);
      throws.append(dot);
    }
    this.element.append(track, throws);
    this.update(0);
  }

  /** Place the marker `ms` into the knot. */
  update(ms: number): void {
    this.marker.style.left = `${((markerPosition(ms, this.spec.periodMs) + 1) / 2) * 100}%`;
  }

  /** Fill in throw `index` as landed or slipped. */
  mark(index: number, hit: boolean): void {
    this.dots[index]?.classList.add(hit ? 'suture__throw--hit' : 'suture__throw--miss');
  }
}
