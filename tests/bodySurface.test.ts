import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { flatSurface, HeightField, highestOf, slopeLimited } from '../src/scene/models/bodySurface';

/**
 * The height field the drapes and the wound read the skin through: a mesh
 * rasterised from above, and the slope limit that keeps a sheet from falling
 * straight down at the body's edge.
 */

/** A 20 cm box, 10 cm tall, sitting on y = 1 at the origin, as a mesh. */
function box(): THREE.Object3D {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.2));
  mesh.position.set(0, 1.05, 0);
  const root = new THREE.Group();
  root.add(mesh);
  return root;
}

describe('HeightField', () => {
  const field = HeightField.fromObject(box(), { x0: -0.3, x1: 0.3, z0: -0.3, z1: 0.3 }, 0.01);

  it('reads the top of a mesh over it, and nothing beside it', () => {
    expect(field.heightAt(0, 0)).toBeCloseTo(1.1, 5);
    expect(field.heightAt(0.08, -0.08)).toBeCloseTo(1.1, 5);
    expect(field.heightAt(0.2, 0.2)).toBeNull();
    expect(field.heightAt(-0.25, 0)).toBeNull();
  });

  it('stays level right up to the edge rather than dipping toward the gap', () => {
    expect(field.heightAt(0.095, 0)).toBeCloseTo(1.1, 3);
  });

  it('gives a flat top an upward normal', () => {
    const normal = field.normalAt(0, 0);
    expect(normal.y).toBeCloseTo(1, 5);
  });

  it('follows a sloped face', () => {
    const slope = new THREE.Group();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4, 1, 1));
    plane.rotation.x = -Math.PI / 2 + Math.atan(0.5); // rises 0.5 in y per metre of z
    plane.position.y = 1;
    slope.add(plane);
    const sloped = HeightField.fromObject(slope, { x0: -0.3, x1: 0.3, z0: -0.3, z1: 0.3 }, 0.01);
    const a = sloped.heightAt(0, -0.1);
    const b = sloped.heightAt(0, 0.1);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(Math.abs((b ?? 0) - (a ?? 0))).toBeCloseTo(0.1, 2);
  });
});

describe('slopeLimited', () => {
  // The edge at exactly 0.1 lands on a sample, so the fall is measured from it.
  const step = highestOf(flatSurface(0.9), {
    heightAt: (x) => (Math.abs(x) <= 0.1 + 1e-9 ? 1.1 : null),
    normalAt: () => new THREE.Vector3(0, 1, 0),
  });
  const limited = slopeLimited(step, 1.0, 0.3, 0.01, 8);

  it('leaves the top and the far floor where they are', () => {
    expect(limited.heightAt(0, 0)).toBeCloseTo(1.1, 5);
    expect(limited.heightAt(0.5, 0)).toBeCloseTo(0.9, 5);
  });

  it('falls from the edge at the given slope instead of straight down', () => {
    // 5 cm past the edge, one to one: 5 cm lower than the top.
    expect(limited.heightAt(0.15, 0)).toBeCloseTo(1.05, 2);
    expect(limited.heightAt(0.25, 0)).toBeCloseTo(0.95, 2);
  });
});
