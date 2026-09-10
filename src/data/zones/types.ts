/**
 * Anatomical zone definitions.
 *
 * These are plain data on purpose. `src/scene/models/zones.ts` turns each spec
 * into an invisible hit-test mesh, while the engine and its tests only ever
 * touch the `id` strings. Nothing here may import Three.js.
 *
 * World layout these coordinates assume (metres):
 *   - floor at y = 0, operating table top at y = 0.90
 *   - patient supine, head toward -z, feet toward +z
 *   - therefore the patient's right side is toward -x, their left toward +x
 *
 * Positions are true world coordinates, not offsets from a shared origin. Each
 * patient variant declares its own `fieldCentre` for the camera to frame, so a
 * limb on an arm board can sit where it really would rather than being dragged
 * to the origin.
 */

export type ZoneShape = 'box' | 'sphere' | 'cylinder';

export interface ZoneSpec {
  readonly id: string;
  /** Shown in the HUD and on hover. Written for a student, not a coder. */
  readonly label: string;
  readonly shape: ZoneShape;
  readonly position: readonly [x: number, y: number, z: number];
  /**
   * Dimensions, interpreted per shape:
   *   box      [width(x), height(y), depth(z)]
   *   sphere   [radius, unused, unused]
   *   cylinder [radius, height, unused]  (axis is +y before rotation)
   */
  readonly size: readonly [number, number, number];
  /** Euler XYZ in radians, applied after positioning. */
  readonly rotation?: readonly [number, number, number];
  /**
   * Zones overlap: a wound edge sits inside the broader periwound skin. When a
   * ray hits several at about the same depth, the highest priority wins, so
   * specific beats general. A zone further back along the ray never wins on
   * priority alone; see `src/scene/models/zonePick.ts`. Defaults to 0.
   */
  readonly priority?: number;
  /**
   * Structures the student must NOT act on. Hitting one is always a mistake,
   * even if the tool and the step order were right — this is how "you clipped
   * the common bile duct" becomes teachable rather than invisible.
   */
  readonly avoid?: boolean;
}

export interface ZoneManifest {
  readonly model: string;
  readonly zones: readonly ZoneSpec[];
}

/** Zone ids of a manifest, for validation and lookup. */
export function zoneIds(manifest: ZoneManifest): readonly string[] {
  return manifest.zones.map((zone) => zone.id);
}
