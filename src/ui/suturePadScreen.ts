import { assessSeries, assessSuture, type SutureRecord } from '../engine/suturing/assess';
import { advanceDrive } from '../engine/suturing/drive';
import { planBite } from '../engine/suturing/geometry';
import { isThrowHit } from '../engine/suturing/knot';
import type { SuturePadConfig } from '../engine/suturing/types';
import type { ModelLibrary } from '../scene/modelLibrary';
import { SuturePadStage } from '../scene/suturePad/suturePadStage';
import { loadSutureProgress, recordSutureResult, saveSutureProgress } from '../store/sutureProgress';
import { element } from './dom';
import { KnotBar } from './knotBar';
import { listenForPadInput } from './suturePadInput';
import {
  actions,
  describeAngle,
  header,
  phaseContent,
  reviewContent,
  summaryContent,
  type WorkingPhase,
} from './suturePadPanels';

type Phase = WorkingPhase | 'review' | 'summary';

/** How far the pointer may stray from the needle's path while driving, in pixels. */
const DRIVE_BAND_PX = 28;
/** Early in the drive a stray pointer is still finding the point, not pushing the needle. */
const DRIVE_GRACE = 0.05;
const ANGLE_STEP = 2;
const ANGLE_MIN = 40;
const ANGLE_MAX = 140;

export interface SuturePadScreenOptions {
  /** Where the screen mounts; it covers the whole of it. */
  host: HTMLElement;
  config: SuturePadConfig;
  models: ModelLibrary;
  storage: Storage | null;
  onExit: () => void;
}

/**
 * The suturing practice pad: simple interrupted sutures, one at a time, each
 * in five phases. Choose where the needle goes in beside the wound; set its
 * angle; drive it through by turning it along its curve; let the thread be
 * drawn through; tie the knot as three timed throws. Each suture is judged
 * as it is tied, and the row for spacing and depth once all are in.
 *
 * The targets and the feedback are not yet reviewed by a clinician, so every
 * panel carries the "Unreviewed content" badge (CLAUDE.md, non-negotiable 2).
 */
export class SuturePadScreen {
  private readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly stage: SuturePadStage;
  private readonly readout = element('div', 'suture__readout');
  private readonly note = element('p', 'suture__hint suture__warn');
  private readonly cleanup: Array<() => void> = [];
  private records: SutureRecord[] = [];
  private phase: Phase = 'aim';
  private alongMm = 0;
  private entryMm = 0;
  private angleDeg = 90;
  private progress = 0;
  private offCurve = false;
  private knot: { bar: KnotBar; elapsed: number; throws: number; hits: number } | null = null;

  constructor(private readonly options: SuturePadScreenOptions) {
    this.root = element('section', 'drill suture');
    this.root.setAttribute('aria-label', 'Suturing practice pad');
    const stageHost = element('div', 'drill__stage');
    this.panel = element('div', 'drill__panel');
    this.root.append(stageHost, this.panel);
    options.host.append(this.root);
    this.stage = new SuturePadStage(stageHost, options.config, options.models);
    this.cleanup.push(
      listenForPadInput(stageHost, {
        hover: (x, y) => {
          if (this.phase === 'aim') this.hover(x, y);
        },
        dragStart: (x, y) => {
          if (this.phase !== 'drive') return false;
          this.drag(x, y);
          return true;
        },
        drag: (x, y) => {
          if (this.phase === 'drive') this.drag(x, y);
        },
        click: () => this.click(),
        wheel: (up) => {
          if (this.phase !== 'angle') return false;
          this.tilt(up ? ANGLE_STEP : -ANGLE_STEP);
          return true;
        },
        key: (key) => this.handleKey(key),
      }),
      this.stage.viewer.onFrame((delta) => this.tick(delta)),
    );
    this.startRun();
  }

  dispose(): void {
    for (const undo of this.cleanup) undo();
    this.stage.dispose();
    this.root.remove();
  }

  private get config(): SuturePadConfig {
    return this.options.config;
  }

  private startRun(): void {
    const { biteMm } = this.config.targets;
    this.records = [];
    this.stage.clearStitches();
    this.alongMm = -this.config.pad.woundLengthMm / 3;
    this.entryMm = (biteMm.min + biteMm.max) / 2;
    this.nextSuture();
  }

  private nextSuture(): void {
    this.phase = 'aim';
    this.angleDeg = 90;
    this.showAim();
    this.stage.newThread();
    this.render();
  }

  private showAim(): void {
    const plan = { entryMm: this.entryMm, angleDeg: this.angleDeg };
    this.stage.aim(planBite(plan, this.config.pad, this.config.needleRadiusMm), this.alongMm);
    this.readout.replaceChildren(
      element('div', '', `In: ${this.entryMm.toFixed(1)} mm from the edge`),
      element('div', '', `Angle: ${describeAngle(this.angleDeg)}`),
    );
  }

  // --- Input ------------------------------------------------------------------

  private click(): void {
    if (this.phase === 'aim') this.lockEntry();
    else if (this.phase === 'angle') this.goIn();
    else if (this.phase === 'knot') this.throwKnot();
  }

  private handleKey(key: string): boolean {
    if (this.phase === 'angle') {
      if (key === 'ArrowLeft' || key === 'a') this.tilt(-ANGLE_STEP);
      else if (key === 'ArrowRight' || key === 'd') this.tilt(ANGLE_STEP);
      else if (key === 'Enter') this.goIn();
      else if (key === 'Escape' || key === 'Backspace') this.backToAim();
      else return false;
      return true;
    }
    if (this.phase === 'knot' && key === ' ') {
      this.throwKnot();
      return true;
    }
    if (key === 'Enter' && this.phase === 'review') {
      this.afterReview();
      return true;
    }
    if (key === 'Enter' && this.phase === 'summary') {
      this.startRun();
      return true;
    }
    return false;
  }

  // --- Phases -----------------------------------------------------------------

  private hover(clientX: number, clientY: number): void {
    const pick = this.stage.pickSkin(clientX, clientY);
    const halfGap = this.config.pad.woundGapMm / 2;
    if (!pick || pick.xMm > -halfGap) {
      this.note.textContent = pick ? 'Go in on the near side of the wound, the side closest to you.' : '';
      return;
    }
    this.note.textContent = '';
    this.entryMm = -pick.xMm - halfGap;
    this.alongMm = pick.alongMm;
    this.showAim();
  }

  private lockEntry(): void {
    this.phase = 'angle';
    this.render();
  }

  private backToAim(): void {
    this.phase = 'aim';
    this.render();
  }

  private tilt(step: number): void {
    this.angleDeg = Math.min(ANGLE_MAX, Math.max(ANGLE_MIN, this.angleDeg + step));
    this.showAim();
  }

  private goIn(): void {
    this.phase = 'drive';
    this.progress = 0;
    this.offCurve = false;
    this.stage.beginDrive();
    this.render();
  }

  private drag(clientX: number, clientY: number): void {
    const step = advanceDrive(this.stage.drivePath(), { x: clientX, y: clientY }, this.progress, DRIVE_BAND_PX);
    if (step.offCurve && this.progress > DRIVE_GRACE) {
      this.offCurve = true;
      this.note.textContent = 'Turn the needle along its curve: follow the dashed line.';
    } else if (!step.offCurve) {
      this.note.textContent = '';
    }
    this.progress = step.progress;
    this.stage.setDrive(this.progress);
    if (this.progress < 1) return;
    this.phase = 'pull';
    this.render();
    this.stage.pullThrough(() => this.startKnot());
  }

  private startKnot(): void {
    this.phase = 'knot';
    this.knot = { bar: new KnotBar(this.config.knot), elapsed: 0, throws: 0, hits: 0 };
    this.render();
  }

  private throwKnot(): void {
    const knot = this.knot;
    if (!knot) return;
    const hit = isThrowHit(knot.elapsed, this.config.knot);
    knot.bar.mark(knot.throws, hit);
    knot.throws += 1;
    if (hit) knot.hits += 1;
    // Each throw starts a fresh sweep, so three quick presses in one pass of
    // the window cannot count as three good throws.
    knot.elapsed = 0;
    knot.bar.update(0);
    if (knot.throws >= this.config.knot.throws) this.finishSuture(knot.hits);
  }

  private finishSuture(knotHits: number): void {
    const record: SutureRecord = {
      alongMm: this.alongMm,
      plan: { entryMm: this.entryMm, angleDeg: this.angleDeg },
      offCurve: this.offCurve,
      knotHits,
    };
    this.records.push(record);
    this.stage.placeStitch();
    this.knot = null;
    this.phase = 'review';
    const number = this.records.length;
    const last = number >= this.config.sutureCount;
    this.panel.replaceChildren(
      header(`Suture ${number} of ${this.config.sutureCount}`),
      ...reviewContent(assessSuture(record, this.config), number, this.config),
      actions([
        [last ? 'See results' : 'Next suture', () => this.afterReview(), false],
        ['Leave the pad', () => this.options.onExit(), true],
      ]),
    );
  }

  private afterReview(): void {
    if (this.records.length < this.config.sutureCount) {
      this.nextSuture();
      return;
    }
    const series = assessSeries(this.records, this.config);
    const progress = recordSutureResult(loadSutureProgress(this.options.storage), series.score);
    saveSutureProgress(this.options.storage, progress);
    this.phase = 'summary';
    this.panel.replaceChildren(
      header('Results'),
      ...summaryContent(series, progress, this.config),
      actions([
        ['Try again', () => this.startRun(), false],
        ['Back to theatre', () => this.options.onExit(), true],
      ]),
    );
  }

  private tick(delta: number): void {
    if (this.phase === 'knot' && this.knot) {
      this.knot.elapsed += delta * 1000;
      this.knot.bar.update(this.knot.elapsed);
    }
  }

  /** The panel for the working phase of a suture; review and summary build their own. */
  private render(): void {
    const phase = this.phase;
    if (phase === 'review' || phase === 'summary') return;
    this.note.textContent = '';
    this.panel.replaceChildren(
      header(`Suture ${this.records.length + 1} of ${this.config.sutureCount}`),
      ...phaseContent(phase, {
        readout: this.readout,
        note: this.note,
        knotBar: this.knot?.bar.element ?? null,
        biteMm: this.config.targets.biteMm,
        throws: this.config.knot.throws,
      }),
      actions([['Leave the pad', () => this.options.onExit(), true]]),
    );
  }
}
