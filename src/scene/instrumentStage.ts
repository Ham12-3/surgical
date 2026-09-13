import * as THREE from 'three';
import { Hinge } from './articulation';
import { applyStudioEnvironment } from './environment';
import type { ModelLibrary } from './modelLibrary';
import { createMaterials, type Materials } from './palette';
import { createSceneTextures } from './textures';
import { createToolMesh, type ToolMeshKey } from './tools/toolMeshes';
import { Viewer } from './viewer';

/**
 * One instrument on a turntable, for the identification drill.
 *
 * The instrument lies across the view, tip to the left, and rocks slowly about
 * its long axis so both faces and its thickness show; a hinged model opens and
 * closes as it turns. The student can orbit and zoom it too. It has its own
 * Viewer, materials and lights, so it runs with the procedure scene torn down.
 */
export class InstrumentStage {
  private readonly viewer: Viewer;
  private readonly materials: Materials;
  /** Rocks the instrument; the instrument sits in it, centred. */
  private readonly pivot = new THREE.Group();
  private shown: { group: THREE.Group; hinge: Hinge | null } | null = null;
  private elapsed = 0;

  constructor(
    container: HTMLElement,
    private readonly models: ModelLibrary,
  ) {
    this.viewer = new Viewer({ container, target: new THREE.Vector3() });
    const { camera, controls, disposer, renderer, scene } = this.viewer;
    scene.fog = null;
    controls.enablePan = false;
    controls.minDistance = 0.04;
    controls.maxDistance = 1.2;
    controls.minPolarAngle = 0.15;
    controls.maxPolarAngle = Math.PI * 0.85;
    camera.near = 0.005;
    camera.updateProjectionMatrix();

    applyStudioEnvironment(renderer, scene, disposer);
    this.materials = createMaterials(disposer, createSceneTextures(disposer));
    scene.add(new THREE.HemisphereLight(0xdfe9f2, 0x30363f, 0.5));
    const key = new THREE.DirectionalLight(0xfff4e2, 1.6);
    key.position.set(0.4, 1, 0.8);
    scene.add(key, this.pivot);

    disposer.add(this.viewer.onFrame((delta) => this.tick(delta)));
    this.viewer.start();
  }

  /** Put an instrument on the turntable in place of the last one. */
  show(mesh: ToolMeshKey): void {
    this.clear();
    // Registered with the stage's disposer, which owns the shared materials
    // too; clear() frees each instrument's geometry as soon as it goes.
    const group = createToolMesh(mesh, this.materials, this.viewer.disposer, this.models);
    // Tip to the left, body to the right, jaws opening up and down: the view a
    // textbook plate gives, with the ring plane facing the camera.
    group.rotation.z = -Math.PI / 2;
    const box = new THREE.Box3().setFromObject(group);
    group.position.sub(box.getCenter(new THREE.Vector3()));
    this.pivot.add(group);

    this.shown = { group, hinge: Hinge.find(group, this.models.toolEntry(mesh)) };
    this.elapsed = 0;
    this.frame(box.getSize(new THREE.Vector3()).length() / 2);
  }

  dispose(): void {
    this.clear();
    this.viewer.dispose();
  }

  private frame(radius: number): void {
    const { camera, controls } = this.viewer;
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    // Far enough back that the whole instrument stays in frame as it rocks,
    // including in a frame taller than it is wide on a narrow screen.
    const distance = (radius / Math.tan(halfFov) / Math.min(1, camera.aspect)) * 0.95;
    controls.target.set(0, 0, 0);
    camera.position.set(0, radius * 0.35, distance);
    controls.update();
  }

  private tick(delta: number): void {
    this.elapsed += delta;
    const t = this.elapsed;
    this.pivot.rotation.x = Math.sin(t * 0.6) * 0.5;
    this.pivot.rotation.y = Math.sin(t * 0.37) * 0.3;
    // Open, hold, close, hold: a slow cycle that shows what the hinge does.
    this.shown?.hinge?.set(Math.max(0, Math.sin(t * 0.9)) ** 2);
  }

  private clear(): void {
    if (!this.shown) return;
    this.pivot.remove(this.shown.group);
    this.shown.group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    this.shown = null;
  }
}
