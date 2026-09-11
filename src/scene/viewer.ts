import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Disposer } from './disposal';
import { colors } from './palette';
import type { PostProcessing } from './postProcessing';

export interface ViewerOptions {
  container: HTMLElement;
  /** Point the orbit controls start focused on. */
  target: THREE.Vector3;
}

export type FrameCallback = (delta: number, elapsed: number) => void;

/**
 * Renderer, camera, orbit controls and the render loop.
 *
 * Owns a `Disposer` that everything else in the scene registers with, so
 * `dispose()` on the way out of a procedure returns all GPU memory in one call.
 */
export class Viewer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly disposer = new Disposer();
  readonly canvas: HTMLCanvasElement;

  private readonly timer = new THREE.Timer();
  private readonly callbacks = new Set<FrameCallback>();
  private frameHandle = 0;
  private running = false;
  private readonly container: HTMLElement;
  private post: PostProcessing | null = null;
  private pixelRatioCap = 1.5;

  constructor(options: ViewerOptions) {
    this.container = options.container;

    this.scene.background = new THREE.Color(colors.wall);
    // A little fog stops the far floor reading as a hard edge without costing
    // anything measurable.
    this.scene.fog = new THREE.Fog(colors.wall, 4, 11);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 40);
    this.camera.position.set(0.6, 1.5, 0.9);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // The scene is fragment-bound, so cost scales with pixel count. Capping at
    // 1.5 keeps a 2x laptop display at 2.25x the pixels of a 1x one instead of
    // 4x, which is the difference between holding 50 fps and not. Quality
    // levels move the cap (quality.ts).
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.pixelRatioCap));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.canvas = this.renderer.domElement;
    this.canvas.classList.add('scene-canvas');
    this.container.appendChild(this.canvas);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.copy(options.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    // Keep the student above the table and within arm's reach of the field:
    // orbiting under the floor or flying across the room is only ever a way to
    // get lost.
    this.controls.minDistance = 0.16;
    this.controls.maxDistance = 2.4;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minPolarAngle = 0.05;
    this.controls.update();

    const resizeObserver = new ResizeObserver(() => this.resize());
    resizeObserver.observe(this.container);
    this.resize();

    this.disposer.add(() => {
      resizeObserver.disconnect();
      this.controls.dispose();
      this.renderer.dispose();
      this.canvas.remove();
    });
  }

  onFrame(callback: FrameCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    // Connecting to the document lets the timer use the Page Visibility API,
    // so returning to a backgrounded tab does not produce one huge delta.
    this.timer.connect(document);
    this.timer.reset();
    const loop = (timestamp?: number): void => {
      this.frameHandle = requestAnimationFrame(loop);
      this.timer.update(timestamp);
      const delta = Math.min(this.timer.getDelta(), 0.1);
      const elapsed = this.timer.getElapsed();
      for (const callback of this.callbacks) callback(delta, elapsed);
      this.controls.update();
      this.renderFrame();
    };
    loop();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    this.timer.disconnect();
  }

  /** Cap the device pixel ratio. Cost scales with pixel count, since the scene is fragment-bound. */
  setPixelRatioCap(cap: number): void {
    this.pixelRatioCap = cap;
    const ratio = Math.min(window.devicePixelRatio, cap);
    this.renderer.setPixelRatio(ratio);
    this.post?.setPixelRatio(ratio);
    this.resize();
  }

  /** Render through a post-processing chain from now on, or plainly again with null. */
  setPostProcessing(post: PostProcessing | null): void {
    this.post?.dispose();
    this.post = post;
    this.resize();
  }

  /** Draw one frame the way the render loop does, post-processing included. */
  renderFrame(): void {
    if (this.post) this.post.render();
    else this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.post?.setSize(width, height);
  }

  dispose(): void {
    this.stop();
    this.callbacks.clear();
    // Before the disposer, which disposes the renderer the chain draws with.
    this.post?.dispose();
    this.post = null;
    this.disposer.dispose();
  }
}
