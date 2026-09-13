import * as THREE from 'three';
import type { Disposer } from './disposal';

/**
 * Procedurally generated textures.
 *
 * Everything here is computed into a `DataTexture` at startup — no files, no
 * downloads. They are small (256px) and tiling, so the cost is a few
 * milliseconds once and a couple of hundred kilobytes of VRAM.
 *
 * These matter more than they sound. A perfectly smooth surface reads as
 * plastic no matter how good its geometry is; the fine normal detail is most
 * of what separates "a capsule painted skin colour" from skin.
 */

/** Deterministic hash so the textures look identical on every run and machine. */
function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Value noise with smooth interpolation, tiling over `period`. */
function valueNoise(x: number, y: number, period: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  // Smoothstep the fractional part so cells blend without visible seams.
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const wrap = (n: number): number => ((n % period) + period) % period;
  const a = hash2(wrap(xi), wrap(yi));
  const b = hash2(wrap(xi + 1), wrap(yi));
  const c = hash2(wrap(xi), wrap(yi + 1));
  const d = hash2(wrap(xi + 1), wrap(yi + 1));

  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** Sum several octaves of value noise for detail at more than one scale. */
function fbm(x: number, y: number, period: number, octaves: number): number {
  let total = 0;
  let amplitude = 1;
  let normalisation = 0;
  let frequency = 1;
  for (let i = 0; i < octaves; i += 1) {
    total += valueNoise(x * frequency, y * frequency, period * frequency) * amplitude;
    normalisation += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / normalisation;
}

/**
 * Turn a height field into a tangent-space normal map.
 *
 * Central differences on the height give the surface slope; `strength` scales
 * how pronounced the bumps read.
 */
function heightsToNormalTexture(
  heights: Float32Array,
  size: number,
  strength: number,
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number): number => {
    const wx = ((x % size) + size) % size;
    const wy = ((y % size) + size) % size;
    return heights[wy * size + wx] ?? 0;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const length = Math.hypot(dx, dy, 1);
      const index = (y * size + x) * 4;
      data[index] = Math.round(((dx / length) * 0.5 + 0.5) * 255);
      data[index + 1] = Math.round(((dy / length) * 0.5 + 0.5) * 255);
      data[index + 2] = Math.round((1 / length) * 255);
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Single-channel data written into all three colour channels, for maps like roughness. */
function greyTexture(values: Float32Array, size: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    const value = Math.round(Math.min(1, Math.max(0, values[i] ?? 0)) * 255);
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Skin: fine irregular pore detail at two scales, so it reads as skin close up
 * and stays subtle at working distance.
 */
export function createSkinNormal(size = 256): THREE.DataTexture {
  const heights = new Float32Array(size * size);
  const period = 16;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x / size) * period;
      const v = (y / size) * period;
      // Coarse dermal undulation plus a fine pore layer on top.
      heights[y * size + x] = fbm(u, v, period, 3) * 0.6 + fbm(u * 4, v * 4, period * 4, 2) * 0.4;
    }
  }
  return heightsToNormalTexture(heights, size, 2.2);
}

/**
 * Cloth: an over-under weave from two out-of-phase sine ridges, roughened with
 * noise so it does not read as a perfect grid.
 */
export function createClothNormal(size = 256, threads = 48): THREE.DataTexture {
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x / size) * threads * Math.PI * 2;
      const v = (y / size) * threads * Math.PI * 2;
      // Each thread rises where its neighbour dips, which is what a weave is.
      const warp = Math.sin(u) * Math.cos(v * 0.5);
      const weft = Math.sin(v) * Math.cos(u * 0.5);
      const noise = fbm((x / size) * 12, (y / size) * 12, 12, 2) * 0.35;
      heights[y * size + x] = (warp + weft) * 0.32 + noise;
    }
  }
  return heightsToNormalTexture(heights, size, 1.1);
}

/**
 * Brushed steel: fine streaks along one axis. Instruments are polished along
 * their length, and that directionality is a strong cue that a surface is
 * metal rather than grey plastic.
 */
export function createBrushedRoughness(size = 256, base = 0.22, variance = 0.16): THREE.DataTexture {
  const values = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    // Streaks are constant along x and vary along y, giving a brushed grain.
    const streak = fbm(0.5, (y / size) * 90, 90, 3);
    for (let x = 0; x < size; x += 1) {
      const grain = fbm((x / size) * 6, (y / size) * 40, 40, 2);
      values[y * size + x] = base + (streak * 0.7 + grain * 0.3 - 0.5) * variance * 2;
    }
  }
  return greyTexture(values, size);
}

export interface SceneTextures {
  skinNormal: THREE.DataTexture;
  clothNormal: THREE.DataTexture;
  brushedRoughness: THREE.DataTexture;
}

/** Build every procedural texture once and register them for disposal. */
export function createSceneTextures(disposer: Disposer): SceneTextures {
  const textures: SceneTextures = {
    skinNormal: createSkinNormal(),
    clothNormal: createClothNormal(),
    brushedRoughness: createBrushedRoughness(),
  };
  for (const texture of Object.values(textures)) disposer.register(texture);
  return textures;
}
