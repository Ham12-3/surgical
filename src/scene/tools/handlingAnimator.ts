import * as THREE from 'three';
import type { Hinge } from '../articulation';
import type { HandlingEffects } from '../effects/handlingEffects';
import type { ForearmWound } from '../models/forearmWound';
import { HOLD_TILT_X, HOLD_TILT_Z } from './toolController';

/** What a move changes, from where it starts to where it ends, over how long. */
interface Tween {
  readonly duration: number;
  readonly apply: (k: number) => void;
  readonly then?: () => void;
  elapsed: number;
}

/** How high the instrument hovers over the skin before it is lowered. */
const HOVER = 0.03;
/** The needle's angle to the skin once positioned for infiltration: shallow. */
const NEEDLE_TILT = 1.15;
const NEEDLE_DEPTH = 0.009;
/** The irrigation syringe hovers this far off the wound, aiming down into it. */
const IRRIGATION_HEIGHT = 0.035;
const IRRIGATION_TILT = 0.85;

const smooth = (k: number): number => k * k * (3 - 2 * k);

/**
 * Plays a hand skill's moves on the held instrument: lowering it onto the
 * skin, wiping, angling and advancing the needle, working the plunger,
 * flushing, closing the forceps and lifting an edge. The instrument's
 * position is composed each frame from the locked aim point, so the moves
 * layer without fighting each other.
 *
 * The moves are those in src/data/handling.json; one this class does not
 * know plays as a small pause so the sequence still goes on.
 */
export class HandlingAnimator {
  private tool: THREE.Group | null = null;
  private hinge: Hinge | null = null;
  private plunger: THREE.Object3D | null = null;
  private sequenceId = '';
  private readonly base = new THREE.Vector3();
  private readonly normal = new THREE.Vector3(0, 1, 0);
  private hover = HOVER;
  private insertion = 0;
  private tilt = HOLD_TILT_X;
  private plungerTravel = 0;
  private plungerRest = 0;
  private wipeTurn = 0;
  private wipeRadius = 0;
  private edgeLift = 0;
  private streaming = false;
  private wipes = 0;
  private instant = false;
  private readonly queue: Tween[] = [];
  private readonly scratch = new THREE.Vector3();
  private readonly shaft = new THREE.Vector3();

  constructor(
    private readonly effects: HandlingEffects,
    private readonly forearmWound: ForearmWound | null,
  ) {}

  get active(): boolean {
    return this.tool !== null;
  }

  /** Moves still playing out. */
  get busy(): boolean {
    return this.queue.length > 0;
  }

  /** With reduced motion every move lands at once. */
  setInstant(instant: boolean): void {
    this.instant = instant;
  }

  begin(sequenceId: string, tool: THREE.Group, hinge: Hinge | null, point: THREE.Vector3, normal: THREE.Vector3): void {
    this.end();
    this.tool = tool;
    this.hinge = hinge;
    this.sequenceId = sequenceId;
    this.base.copy(point);
    this.normal.copy(normal);
    this.plunger = tool.getObjectByName('plunger') ?? null;
    this.plungerRest = this.plunger?.position.y ?? 0;
    this.hover = HOVER;
    this.insertion = 0;
    this.tilt = HOLD_TILT_X;
    this.plungerTravel = 0;
    this.wipeRadius = 0;
    this.wipes = 0;
    this.edgeLift = 0;
    this.streaming = false;
    this.effects.placeAt(point);
    this.hinge?.set(1);
    this.place();
  }

  /** Queue the animation for a move of the current sequence. */
  play(moveId: string): void {
    const key = `${this.sequenceId}.${moveId}`;
    switch (key) {
      case 'prep_skin.lower':
      case 'grasp_edge.lower':
        this.tween(0.45, this.lerp('hover', 0.002));
        return;
      case 'prep_skin.wipe': {
        this.wipes += 1;
        const radius = Math.min(0.02 + this.wipes * 0.014, 0.06);
        const from = this.effects.stainRadius;
        this.tween(0.9, (k) => {
          this.wipeTurn = k * Math.PI * 2;
          this.wipeRadius = radius * Math.sin(k * Math.PI);
          this.effects.setStainRadius(from + (radius + 0.01 - from) * k);
        }, () => {
          this.wipeRadius = 0;
        });
        return;
      }
      case 'prep_skin.lift':
      case 'irrigate.lift':
        this.tween(0.4, this.lerp('hover', HOVER), () => this.tween(0.3, this.lerp('tilt', HOLD_TILT_X)));
        return;
      case 'infiltrate.position':
        this.tween(0.5, this.lerp('tilt', NEEDLE_TILT));
        this.tween(0.4, this.lerp('hover', 0.004));
        return;
      case 'infiltrate.insert':
        this.tween(0.5, this.lerp('insertion', NEEDLE_DEPTH));
        return;
      case 'infiltrate.aspirate':
        this.tween(0.35, this.lerp('plungerTravel', 0.004));
        return;
      case 'infiltrate.inject':
        this.tween(1.4, (k) => {
          this.plungerTravel = 0.004 - 0.022 * k;
          this.effects.setWheal(k);
        });
        return;
      case 'infiltrate.withdraw':
        this.tween(0.4, this.lerp('insertion', 0), () => {
          this.tween(0.4, this.lerp('hover', HOVER));
          this.tween(0.4, this.lerp('tilt', HOLD_TILT_X));
        });
        return;
      case 'irrigate.position':
        this.tween(0.5, this.lerp('tilt', IRRIGATION_TILT));
        this.tween(0.4, this.lerp('hover', IRRIGATION_HEIGHT));
        return;
      case 'irrigate.flush': {
        const from = this.effects.wetRadius;
        this.tween(1.0, (k) => {
          this.streaming = k < 0.85;
          this.plungerTravel = -0.024 * Math.min(1, k / 0.85);
          this.effects.setWetRadius(from + (0.04 - from) * k);
        }, () => {
          this.streaming = false;
          this.tween(0.3, this.lerp('plungerTravel', 0));
        });
        return;
      }
      case 'grasp_edge.pinch':
        this.tween(0.3, (k) => this.hinge?.set(1 - k));
        return;
      case 'grasp_edge.lift':
        this.tween(0.5, (k) => {
          this.hover = 0.002 + 0.007 * k;
          this.edgeLift = k;
        });
        return;
      case 'grasp_edge.release':
        this.tween(0.3, (k) => {
          this.hinge?.set(k);
          this.edgeLift = 1 - k;
        }, () => this.tween(0.4, this.lerp('hover', HOVER)));
        return;
      default:
        // A move the animator does not know: a beat, so the sequence reads as done.
        this.tween(0.25, () => undefined);
    }
  }

  /** Put the instrument down where it was and clear what is in flight; the tint and the bleb stay. */
  end(): void {
    this.queue.length = 0;
    this.effects.setStream(null, null);
    if (this.tool) {
      this.tool.position.copy(this.base);
      this.tool.rotation.set(HOLD_TILT_X, 0, HOLD_TILT_Z);
      if (this.plunger) this.plunger.position.y = this.plungerRest;
    }
    this.forearmWound?.evert(0);
    this.hinge?.set(1);
    this.tool = null;
    this.hinge = null;
    this.plunger = null;
  }

  update(delta: number): void {
    const tween = this.queue[0];
    if (tween) {
      tween.elapsed += delta;
      const k = this.instant ? 1 : Math.min(1, tween.elapsed / tween.duration);
      tween.apply(smooth(k));
      if (k >= 1) {
        this.queue.shift();
        tween.then?.();
      }
    }
    if (this.tool) this.place();
  }

  private lerp(field: 'hover' | 'insertion' | 'tilt' | 'plungerTravel', to: number): (k: number) => void {
    const from = this[field];
    return (k) => {
      this[field] = from + (to - from) * k;
    };
  }

  private tween(duration: number, apply: (k: number) => void, then?: () => void): void {
    this.queue.push({ duration, apply, elapsed: 0, ...(then ? { then } : {}) });
  }

  /** Compose the instrument's transform from the locked point and the moves' state. */
  private place(): void {
    const tool = this.tool;
    if (!tool) return;
    tool.rotation.set(this.tilt, 0, HOLD_TILT_Z);
    tool.updateMatrix();
    // The shaft's direction in the world: the instrument's +y, turned as it is held.
    this.shaft.set(0, 1, 0).applyQuaternion(tool.quaternion);
    tool.position.copy(this.base).addScaledVector(this.normal, this.hover).addScaledVector(this.shaft, -this.insertion);
    if (this.wipeRadius > 0) {
      tool.position.x += Math.cos(this.wipeTurn) * this.wipeRadius;
      tool.position.z += Math.sin(this.wipeTurn) * this.wipeRadius;
    }
    if (this.plunger) this.plunger.position.y = this.plungerRest + this.plungerTravel;
    this.forearmWound?.evert(this.edgeLift);
    if (this.streaming) {
      this.effects.setStream(this.scratch.copy(tool.position), this.base);
    } else {
      this.effects.setStream(null, null);
    }
  }
}
