/**
 * Driving the needle through the tissue. The tip's path is drawn on screen,
 * and the student turns the needle by moving the pointer along it: the tip
 * follows as far along the path as the pointer has got. Straying from the
 * path means pushing the needle instead of turning it along its curve, so the
 * tip stops until the pointer is back on the path.
 *
 * Screen-space and pure, so it is tested without a browser.
 */

export interface Point2 {
  readonly x: number;
  readonly y: number;
}

export interface DriveStep {
  /** How far through the bite the tip now is, 0 to 1. */
  readonly progress: number;
  /** The pointer is further than the band from the path. */
  readonly offCurve: boolean;
}

/**
 * Advance the drive for a pointer at `pointer`. `path` samples the tip's
 * route evenly from going in to coming out, in the same pixels as the
 * pointer. The tip moves to the sample nearest the pointer, never backward
 * and at most `maxJump` of the way in one move, so a pointer that cuts
 * across the curve cannot skip the bite.
 */
export function advanceDrive(
  path: readonly Point2[],
  pointer: Point2,
  progress: number,
  bandPx: number,
  maxJump = 0.2,
): DriveStep {
  const last = path.length - 1;
  if (last < 1) return { progress, offCurve: false };
  let nearest = 0;
  let best = Infinity;
  path.forEach((point, index) => {
    const distance = Math.hypot(point.x - pointer.x, point.y - pointer.y);
    if (distance < best) {
      best = distance;
      nearest = index;
    }
  });
  if (best > bandPx) return { progress, offCurve: true };
  const reached = Math.min(nearest / last, progress + maxJump);
  return { progress: Math.min(1, Math.max(progress, reached)), offCurve: false };
}
