import type { QualityLevel } from './store/settings';
import type { App } from './ui/app';
import { ProcedureScreen } from './ui/procedureScreen';
import { SuturePadScreen } from './ui/suturePadScreen';

/**
 * The dev-only console handle, `window.__trainer`, loaded by main.ts only on
 * the dev server, so production builds leave it out.
 *
 * `profile()` renders frames synchronously and stalls on `readPixels` after
 * each, so the timing covers the whole GPU frame rather than just queuing
 * draw calls. That works even when the page is hidden and requestAnimationFrame
 * has stopped, which is exactly when you cannot eyeball a frame counter.
 */
export function installDevHandle(app: App): void {
  const round = (value: number): number => Math.round(value * 10) / 10;
  (window as unknown as { __trainer: unknown }).__trainer = {
    app,
    get scene() {
      return app.activeScene;
    },
    /** The suturing pad, while it is open: for scripted checks from the console. */
    get suturePad(): SuturePadScreen | null {
      const screen = app.currentScreen;
      return screen instanceof SuturePadScreen ? screen : null;
    },
    /** The procedure screen, while it is open; its `session` holds the run. */
    get procedure(): ProcedureScreen | null {
      const screen = app.currentScreen;
      return screen instanceof ProcedureScreen ? screen : null;
    },
    renderOnce(): void {
      const scene = app.activeScene;
      if (!scene) return;
      scene.viewer.controls.update();
      scene.viewer.renderFrame();
    },
    /** Switch the scene's quality from the console, to profile one level against another. */
    setQuality(level: QualityLevel): void {
      app.activeScene?.setQuality(level);
    },
    profile(frames = 60) {
      const scene = app.activeScene;
      if (!scene) return null;
      const { viewer } = scene;
      const { renderer, canvas } = viewer;
      const gl = renderer.getContext();
      const pixel = new Uint8Array(4);
      viewer.renderFrame();
      const start = performance.now();
      for (let i = 0; i < frames; i += 1) {
        viewer.renderFrame();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      }
      const msPerFrame = (performance.now() - start) / frames;
      // Post-processing renders several times a frame, and the counters
      // normally reset on each, so count one whole frame by hand.
      renderer.info.autoReset = false;
      renderer.info.reset();
      viewer.renderFrame();
      const { calls, triangles } = renderer.info.render;
      renderer.info.autoReset = true;
      return {
        msPerFrame: round(msPerFrame),
        fps: round(1000 / msPerFrame),
        canvas: [canvas.width, canvas.height],
        drawCalls: calls,
        triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      };
    },
  };
}
