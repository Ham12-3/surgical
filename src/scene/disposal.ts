import type * as THREE from 'three';

/**
 * Tracks GPU resources so a screen can hand them all back on exit.
 *
 * Three.js does not free geometries, materials or textures when an object is
 * removed from a scene graph — that is the caller's job. Leaving a procedure
 * and starting another would otherwise leak a full operating room each time.
 *
 * Everything built in `src/scene/` registers here. `track()` walks a subtree
 * and picks up geometries, materials and any textures hanging off those
 * materials; `add()` takes an explicit teardown function for anything else
 * (render targets, event listeners, controls).
 */
export class Disposer {
  private readonly teardowns: Array<() => void> = [];
  private readonly seen = new WeakSet<object>();

  /** Register an arbitrary teardown callback. Runs in reverse order. */
  add(teardown: () => void): void {
    this.teardowns.push(teardown);
  }

  /** Walk an object subtree and register every geometry, material and texture. */
  track(root: THREE.Object3D): THREE.Object3D {
    root.traverse((object) => {
      const mesh = object as Partial<THREE.Mesh>;
      if (mesh.geometry) this.register(mesh.geometry);
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((m) => this.registerMaterial(m));
      else if (material) this.registerMaterial(material);
    });
    return root;
  }

  private registerMaterial(material: THREE.Material): void {
    // Textures are referenced by name on the material; collect any that look
    // like one rather than enumerating every possible map slot by hand.
    for (const value of Object.values(material as unknown as Record<string, unknown>)) {
      const texture = value as { isTexture?: boolean; dispose?: () => void };
      if (texture && texture.isTexture === true && typeof texture.dispose === 'function') {
        this.register(texture as unknown as { dispose(): void });
      }
    }
    this.register(material);
  }

  /** Register a single disposable, ignoring repeats (shared materials). */
  register(disposable: { dispose(): void }): void {
    if (this.seen.has(disposable)) return;
    this.seen.add(disposable);
    this.teardowns.push(() => disposable.dispose());
  }

  /** Run every teardown, newest first, and empty the list. */
  dispose(): void {
    for (let i = this.teardowns.length - 1; i >= 0; i -= 1) {
      const teardown = this.teardowns[i];
      if (teardown) teardown();
    }
    this.teardowns.length = 0;
  }
}
