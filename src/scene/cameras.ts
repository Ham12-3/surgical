import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Named camera angles a step can call for.
 *
 * Offsets are relative to the variant's field centre, in metres, so the same
 * preset name works for a forearm on an arm board and for an abdomen. A step's
 * JSON names a preset; the scene resolves it here.
 */
export const CAMERA_PRESETS = {
  /** Default working view, over the surgeon's shoulder. */
  surgeon: { offset: [0.03, 0.30, 0.29], lookAt: [0, -0.01, 0] },
  /** Straight down, for judging placement and spacing along a wound. */
  overhead: { offset: [0.001, 0.5, 0.0], lookAt: [0, 0, 0] },
  /** From the far side of the table, as the assistant sees it. */
  assistant: { offset: [0.0, 0.28, -0.31], lookAt: [0, -0.01, 0] },
  /** Close in on the field for fine work. */
  close: { offset: [0.03, 0.15, 0.15], lookAt: [0, 0, 0] },
  /**
   * Almost straight down into an opened wound: the brief's loupe view. Deep
   * structures are only in reach from above, since from a slant the rays to
   * them cross the skin outside the opening (tests/woundReach.test.ts).
   */
  loupe: { offset: [0, 0.18, 0.05], lookAt: [0, -0.03, 0] },
  /** Pulled back far enough to show the patient, table and tray together. */
  wide: { offset: [0.85, 0.9, 1.1], lookAt: [0.15, -0.12, 0] },
} as const satisfies Record<string, { offset: readonly number[]; lookAt: readonly number[] }>;

export type CameraPresetName = keyof typeof CAMERA_PRESETS;

export function isCameraPreset(value: string): value is CameraPresetName {
  return Object.prototype.hasOwnProperty.call(CAMERA_PRESETS, value);
}

/** The view for a layer of the open abdomen: close on the skin, the loupe once the wound is open. */
export function woundCamera(layer: number): CameraPresetName {
  return layer > 0 ? 'loupe' : 'close';
}

/**
 * Eases the camera and its orbit target toward a preset.
 *
 * Uses a critically-damped-feeling exponential approach rather than a fixed
 * duration tween: it is frame-rate independent, needs no tween library, and
 * reads as a smooth settle. A drag on the orbit controls cancels the move so
 * the camera never fights the student for control.
 */
export class CameraDirector {
  private readonly desiredPosition = new THREE.Vector3();
  private readonly desiredTarget = new THREE.Vector3();
  private moving = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly controls: OrbitControls,
    private fieldCentre: THREE.Vector3,
  ) {}

  setFieldCentre(centre: THREE.Vector3): void {
    this.fieldCentre = centre.clone();
  }

  /** Jump straight to a preset, with no transition. */
  snapTo(name: CameraPresetName): void {
    this.resolve(name);
    this.camera.position.copy(this.desiredPosition);
    this.controls.target.copy(this.desiredTarget);
    this.controls.update();
    this.moving = false;
  }

  /** Ease toward a preset over the next second or so. */
  moveTo(name: CameraPresetName): void {
    this.resolve(name);
    this.moving = true;
  }

  /** Called when the student grabs the camera: they win, the transition stops. */
  cancel(): void {
    this.moving = false;
  }

  update(delta: number): void {
    if (!this.moving) return;

    // Fraction of the remaining distance to close each second.
    const alpha = 1 - Math.pow(0.0015, delta);
    this.camera.position.lerp(this.desiredPosition, alpha);
    this.controls.target.lerp(this.desiredTarget, alpha);

    if (
      this.camera.position.distanceToSquared(this.desiredPosition) < 1e-6 &&
      this.controls.target.distanceToSquared(this.desiredTarget) < 1e-6
    ) {
      this.camera.position.copy(this.desiredPosition);
      this.controls.target.copy(this.desiredTarget);
      this.moving = false;
    }
  }

  private resolve(name: CameraPresetName): void {
    const preset = CAMERA_PRESETS[name];
    this.desiredPosition.set(
      this.fieldCentre.x + preset.offset[0],
      this.fieldCentre.y + preset.offset[1],
      this.fieldCentre.z + preset.offset[2],
    );
    this.desiredTarget.set(
      this.fieldCentre.x + preset.lookAt[0],
      this.fieldCentre.y + preset.lookAt[1],
      this.fieldCentre.z + preset.lookAt[2],
    );
  }
}
