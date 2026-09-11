import * as THREE from 'three';
import { Viewer } from '../viewer';
import { applyStudioEnvironment } from '../environment';
import { createMaterials, type Materials } from '../palette';
import { createSceneTextures } from '../textures';
import type { ModelLibrary } from '../modelLibrary';
import type { SuturePadConfig } from '../../engine/suturing/types';
import { bitePoint, type BitePath } from '../../engine/suturing/geometry';
import type { Point2 } from '../../engine/suturing/drive';
import { MM, createSuturePad, padDepthMm, padToWorld } from './padModel';
import { NeedleRig } from './needleRig';
import { ThreadRig } from './threadRig';
import { createStitch } from './stitchMesh';

/** Samples along a bite, for the guide line and the drive. */
const PATH_SAMPLES = 48;
/** The needle hovers this far above the skin while the student aims it. */
const HOVER = 0.0012;
/** The holder lets go before its jaws come this close to the skin. */
const RELEASE_HEIGHT = 0.0015;
/** Drawing the needle out after a bite: along its curve, then up and away. */
const PULL_TURN_S = 0.6;
const PULL_LIFT_S = 0.45;
const PULL_LIFT = new THREE.Vector3(0.012, 0.028, 0);
const GUIDE_COLOUR = 0x8fe3f2;

/**
 * The suturing pad's 3D view: the pad on a draped table, the needle holder and
 * needle, the thread, and the stitches placed so far. It knows the geometry of
 * a bite but nothing of scoring; the pad screen (src/ui/suturePadScreen.ts)
 * runs the phases and asks it to show each one.
 */
export class SuturePadStage {
  readonly viewer: Viewer;
  private readonly materials: Materials;
  private readonly rig: NeedleRig;
  private readonly thread: ThreadRig;
  private readonly stitches = new THREE.Group();
  private readonly guide: THREE.Line;
  private readonly guidePoints: THREE.Vector3[] = [];
  private readonly marker: THREE.Mesh;
  private readonly raycaster = new THREE.Raycaster();
  private readonly skin = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly scratch = new THREE.Vector3();
  private bite: { path: BitePath; alongMm: number } | null = null;
  private pull: { elapsed: number; done: () => void } | null = null;

  constructor(container: HTMLElement, private readonly config: SuturePadConfig, models: ModelLibrary) {
    this.viewer = new Viewer({ container, target: new THREE.Vector3(0.002, -0.002, 0) });
    const { camera, controls, disposer, renderer, scene } = this.viewer;
    scene.fog = null;
    // From the student's side of the pad (-x), looking down at the wound, which runs across the view.
    camera.near = 0.01;
    // Close enough that a millimetre is a few pixels at a laptop's resolution.
    camera.position.set(-0.12, 0.11, 0.015);
    camera.updateProjectionMatrix();
    controls.minDistance = 0.1;
    controls.maxDistance = 0.45;
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = 1.25;
    controls.minAzimuthAngle = -Math.PI / 2 - 0.7;
    controls.maxAzimuthAngle = -Math.PI / 2 + 0.7;
    controls.update();

    applyStudioEnvironment(renderer, scene, disposer);
    this.materials = createMaterials(disposer, createSceneTextures(disposer));
    this.addLights(scene);

    const { pad } = config;
    const tableY = -padDepthMm(pad) * MM;
    const table = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), this.materials.drape);
    table.rotation.x = -Math.PI / 2;
    table.position.y = tableY - 0.0002;
    table.receiveShadow = true;
    disposer.register(table.geometry);
    scene.add(table, createSuturePad(pad, this.materials, disposer), this.stitches);

    this.rig = new NeedleRig(this.materials, disposer, models);
    const halfWidth = (pad.widthMm / 2) * MM;
    const halfLength = (pad.lengthMm / 2) * MM;
    this.thread = new ThreadRig(this.materials, disposer, (x, z) =>
      Math.abs(x) <= halfWidth && Math.abs(z) <= halfLength ? 0 : tableY,
    );
    scene.add(this.rig.pivot, this.thread.group);

    const guideGeometry = new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: PATH_SAMPLES }, () => new THREE.Vector3()),
    );
    const guideMaterial = new THREE.LineDashedMaterial({
      color: GUIDE_COLOUR,
      dashSize: 0.0012,
      gapSize: 0.0008,
      depthTest: false,
      transparent: true,
    });
    this.guide = new THREE.Line(guideGeometry, guideMaterial);
    this.guide.renderOrder = 10;
    this.guide.visible = false;
    const markerGeometry = new THREE.RingGeometry(0.0006, 0.001, 20);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: GUIDE_COLOUR, depthTest: false, transparent: true });
    this.marker = new THREE.Mesh(markerGeometry, markerMaterial);
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.renderOrder = 10;
    scene.add(this.guide, this.marker);
    for (const disposable of [guideGeometry, guideMaterial, markerGeometry, markerMaterial]) disposer.register(disposable);

    disposer.add(this.viewer.onFrame((delta) => this.tick(delta)));
    this.viewer.start();
  }

  /** The point on the skin under a pointer, in the pad's frame (mm), or null off the pad. */
  pickSkin(clientX: number, clientY: number): { xMm: number; alongMm: number } | null {
    const rect = this.viewer.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.viewer.camera);
    const hit = this.raycaster.ray.intersectPlane(this.skin, this.scratch);
    if (!hit) return null;
    const { widthMm, lengthMm } = this.config.pad;
    const xMm = hit.x / MM;
    const alongMm = hit.z / MM;
    return Math.abs(xMm) <= widthMm / 2 && Math.abs(alongMm) <= lengthMm / 2 ? { xMm, alongMm } : null;
  }

  /** Hover the needle ready to go in along `path`, and ring the spot on the skin. */
  aim(path: BitePath, alongMm: number): void {
    this.bite = { path, alongMm };
    this.rig.regrip();
    const centre = padToWorld(path.centreX, path.centreDepth, alongMm);
    centre.y += HOVER;
    this.rig.place(centre, this.tipAngle(path, 0));
    padToWorld(path.entryX, 0, alongMm, this.marker.position).y += 0.0002;
    this.marker.visible = true;
    this.guide.visible = false;
  }

  /** Show the path the tip will take through the current bite, and hold the camera still for the drive. */
  beginDrive(): void {
    const bite = this.requireBite();
    this.guidePoints.length = 0;
    for (let i = 0; i < PATH_SAMPLES; i += 1) {
      const point = bitePoint(bite.path, i / (PATH_SAMPLES - 1));
      this.guidePoints.push(padToWorld(point.x, point.depth, bite.alongMm));
    }
    this.guide.geometry.setFromPoints(this.guidePoints);
    this.guide.computeLineDistances();
    this.guide.visible = true;
    this.marker.visible = false;
    this.viewer.controls.enabled = false;
    this.setDrive(0);
  }

  /** The current bite's path in client pixels, for advanceDrive(). */
  drivePath(): Point2[] {
    const rect = this.viewer.canvas.getBoundingClientRect();
    return this.guidePoints.map((point) => {
      const v = this.scratch.copy(point).project(this.viewer.camera);
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
    });
  }

  /** Turn the needle `t` of the way through the bite. */
  setDrive(t: number): void {
    const bite = this.requireBite();
    this.rig.place(padToWorld(bite.path.centreX, bite.path.centreDepth, bite.alongMm), this.tipAngle(bite.path, t));
    // The jaws let go before they would reach the skin; the needle's curve carries it on.
    if (this.rig.holding && this.rig.grip(this.scratch).y < RELEASE_HEIGHT) this.rig.release(this.viewer.scene);
  }

  /** Draw the needle out along its curve and away, pulling the thread through, then call `done`. */
  pullThrough(done: () => void): void {
    const bite = this.requireBite();
    const halfGap = this.config.pad.woundGapMm / 2;
    const entry = padToWorld(bite.path.entryX, 0, bite.alongMm);
    const exit = padToWorld(bite.path.exitMm + halfGap, 0, bite.alongMm);
    this.guide.visible = false;
    this.thread.passThrough(entry, exit, [...this.guidePoints], this.rig.swage(new THREE.Vector3()));
    this.pull = { elapsed: 0, done };
  }

  /** Leave a tied stitch at the current bite and let the camera move again. */
  placeStitch(): void {
    const bite = this.requireBite();
    const halfGap = this.config.pad.woundGapMm / 2;
    const entry = padToWorld(bite.path.entryX, 0, bite.alongMm);
    const exit = padToWorld(bite.path.exitMm + halfGap, 0, bite.alongMm);
    this.stitches.add(createStitch(entry, exit, this.materials, this.viewer.disposer));
    this.viewer.controls.enabled = true;
  }

  /** Lay a fresh thread from the needle, for the next bite. */
  newThread(): void {
    this.thread.reset(this.rig.swage(new THREE.Vector3()));
  }

  /** Take every stitch off the pad, for a fresh run. */
  clearStitches(): void {
    for (const stitch of [...this.stitches.children]) {
      this.stitches.remove(stitch);
      stitch.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
    }
  }

  dispose(): void {
    this.viewer.dispose();
  }

  private requireBite(): { path: BitePath; alongMm: number } {
    if (!this.bite) throw new Error('no bite has been aimed yet');
    return this.bite;
  }

  /**
   * The tip's angle round the needle's centre `t` of the way through a bite,
   * in the world's x, y plane. The engine measures its angle with depth
   * downward (bitePoint), so this one is its mirror image.
   */
  private tipAngle(path: BitePath, t: number): number {
    const half = (path.sweepDeg * Math.PI) / 360;
    return -(Math.PI / 2 + half - 2 * half * t);
  }

  private tick(delta: number): void {
    if (this.pull && this.bite) {
      this.pull.elapsed += delta;
      const { path, alongMm } = this.bite;
      // Turn on until the swage has come out where the tip did, then lift away.
      const end = 1 + (this.rig.arc * 180) / Math.PI / path.sweepDeg;
      const turned = Math.min(this.pull.elapsed / PULL_TURN_S, 1);
      const lifted = smooth((this.pull.elapsed - PULL_TURN_S) / PULL_LIFT_S);
      const centre = padToWorld(path.centreX, path.centreDepth, alongMm).addScaledVector(PULL_LIFT, lifted);
      this.rig.place(centre, this.tipAngle(path, 1 + (end - 1) * turned));
      if (!this.rig.holding && this.rig.grip(this.scratch).y > RELEASE_HEIGHT) this.rig.regrip();
      if (this.pull.elapsed >= PULL_TURN_S + PULL_LIFT_S) {
        const { done } = this.pull;
        this.pull = null;
        done();
      }
    }
    this.thread.followNeedle(this.rig.swage(this.scratch));
    this.thread.step(delta);
  }

  private addLights(scene: THREE.Scene): void {
    scene.add(new THREE.HemisphereLight(0xdfe9f2, 0x30363f, 0.55));
    const fill = new THREE.DirectionalLight(0xd8e4f0, 0.45);
    fill.position.set(-0.4, 0.5, 0.3);
    scene.add(fill);
    // A lamp overhead and a little toward the student, the only shadow caster:
    // the needle's shadow on the skin is what shows how high it is.
    const lamp = new THREE.SpotLight(0xfff4e2, 1, 0, Math.PI / 7, 0.6, 2);
    lamp.position.set(-0.12, 0.45, 0.08);
    lamp.target.position.set(0, 0, 0);
    // About the field's illuminance at the pad (see the asset viewer's spot).
    lamp.intensity = 3 * lamp.position.lengthSq();
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    lamp.shadow.bias = -0.0004;
    lamp.shadow.camera.near = 0.2;
    lamp.shadow.camera.far = 0.8;
    scene.add(lamp, lamp.target);
    this.viewer.disposer.add(() => lamp.dispose());
  }
}

function smooth(u: number): number {
  const k = Math.min(Math.max(u, 0), 1);
  return k * k * (3 - 2 * k);
}
