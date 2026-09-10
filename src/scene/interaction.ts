import * as THREE from 'three';
import type { Disposer } from './disposal';

/** How far the pointer may travel between down and up and still count as a click. */
const CLICK_SLOP_PX = 6;
const CLICK_MAX_MS = 400;

/**
 * Pointer tracking and ray casting.
 *
 * The fiddly part is telling a click from an orbit drag: the same left button
 * does both. A press only becomes a click if the pointer barely moved and was
 * released quickly, otherwise it was the student turning the camera and must
 * not also fire an action into the patient.
 */
export class PointerTracker {
  readonly raycaster = new THREE.Raycaster();

  private readonly ndc = new THREE.Vector2();
  private over = false;
  private downAt = 0;
  private readonly downPosition = { x: 0, y: 0 };
  private readonly clickHandlers = new Set<() => void>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.Camera,
    disposer: Disposer,
  ) {
    const onPointerMove = (event: PointerEvent): void => {
      const rect = this.canvas.getBoundingClientRect();
      this.ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      this.over = true;
    };
    const onPointerLeave = (): void => {
      this.over = false;
    };
    const onPointerDown = (event: PointerEvent): void => {
      this.downAt = performance.now();
      this.downPosition.x = event.clientX;
      this.downPosition.y = event.clientY;
    };
    const onPointerUp = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      const travelled = Math.hypot(
        event.clientX - this.downPosition.x,
        event.clientY - this.downPosition.y,
      );
      const elapsed = performance.now() - this.downAt;
      if (travelled > CLICK_SLOP_PX || elapsed > CLICK_MAX_MS) return;
      for (const handler of [...this.clickHandlers]) handler();
    };

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    disposer.add(() => {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      this.clickHandlers.clear();
    });
  }

  /** True while the pointer is over the canvas. */
  get isOver(): boolean {
    return this.over;
  }

  /** Point the internal raycaster at wherever the pointer currently is. */
  refresh(): boolean {
    if (!this.over) return false;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return true;
  }

  /** Fires only on a real click, never at the end of an orbit drag. */
  onClick(handler: () => void): () => void {
    this.clickHandlers.add(handler);
    return () => this.clickHandlers.delete(handler);
  }

  /**
   * Where the ray meets a horizontal plane at height `y`. Used to keep the
   * held instrument somewhere sensible when the pointer is off the patient.
   */
  intersectHorizontalPlane(y: number, out: THREE.Vector3): boolean {
    const { origin, direction } = this.raycaster.ray;
    if (Math.abs(direction.y) < 1e-6) return false;
    const distance = (y - origin.y) / direction.y;
    if (distance < 0) return false;
    out.copy(origin).addScaledVector(direction, distance);
    return true;
  }
}
