/** How far the pointer may travel between down and up and still count as a click. */
const CLICK_SLOP_PX = 6;
const CLICK_MAX_MS = 400;

/** What the pad screen does with the student's input. */
export interface PadInputHandlers {
  /** The pointer moved over the view without dragging. */
  hover(clientX: number, clientY: number): void;
  /** A press: return true to start a drag (the needle drive) instead of leaving it to the camera. */
  dragStart(clientX: number, clientY: number): boolean;
  drag(clientX: number, clientY: number): void;
  /** A real click: pressed and let go without moving, so not the end of an orbit or a drag. */
  click(): void;
  /** A scroll: return true to take it from the camera's zoom. */
  wheel(up: boolean): boolean;
  /** A key, without modifiers: return true if it was used. */
  key(key: string): boolean;
}

/**
 * Turn the DOM events on the pad's view into the few things the pad screen
 * cares about, telling a click from a camera orbit the way the theatre's
 * PointerTracker does. Returns the function that stops listening.
 */
export function listenForPadInput(host: HTMLElement, handlers: PadInputHandlers): () => void {
  let pressed = { x: 0, y: 0, time: 0 };
  let dragging = false;

  const down = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    pressed = { x: event.clientX, y: event.clientY, time: performance.now() };
    if (!handlers.dragStart(event.clientX, event.clientY)) return;
    dragging = true;
    try {
      host.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks: the drag still works while it stays over the view.
    }
  };
  const move = (event: PointerEvent): void => {
    if (dragging) handlers.drag(event.clientX, event.clientY);
    else handlers.hover(event.clientX, event.clientY);
  };
  const up = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (dragging) {
      dragging = false;
      return;
    }
    const moved = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
    if (moved <= CLICK_SLOP_PX && performance.now() - pressed.time <= CLICK_MAX_MS) handlers.click();
  };
  // Captured before the camera's own listener on the canvas, so a scroll the
  // screen takes never reaches the zoom.
  const wheel = (event: WheelEvent): void => {
    if (!handlers.wheel(event.deltaY < 0)) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const key = (event: KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (handlers.key(event.key)) event.preventDefault();
  };

  host.addEventListener('pointerdown', down);
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerup', up);
  host.addEventListener('wheel', wheel, { capture: true, passive: false });
  window.addEventListener('keydown', key);
  return () => {
    host.removeEventListener('pointerdown', down);
    host.removeEventListener('pointermove', move);
    host.removeEventListener('pointerup', up);
    host.removeEventListener('wheel', wheel, { capture: true });
    window.removeEventListener('keydown', key);
  };
}
