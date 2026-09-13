/**
 * The rule for choosing one zone when a ray passes through several.
 *
 * Kept free of Three.js so it can be unit-tested directly; `ZoneField.pick`
 * feeds it the raycaster's hits.
 */

/**
 * How far behind the nearest hit another zone can be and still compete on
 * priority, in metres.
 *
 * Zones overlap by design: a wound edge sits inside the periwound skin, which
 * sits inside the forearm skin, and their top surfaces are up to about 9 mm
 * apart vertically, roughly 12 mm along a ray at the working camera angle.
 * Those should compete, so the specific zone beats the general one it sits in.
 *
 * But a zone further back along the ray is behind what the student is
 * pointing at. Aiming at the near wound edge from the surgeon camera, the ray
 * carries on into the wound bed about 23 mm behind it; when priority alone
 * decided, the bed won and the near edge could not be clicked at all.
 */
export const PRIORITY_DEPTH_WINDOW = 0.015;

/**
 * Slack for floating-point error at the window boundary. Ray distances are
 * sums of floats, so a hit meant to sit exactly on the boundary can come out
 * a few 1e-17 beyond it (0.4 + 0.015 is 0.41500000000000004) and would
 * otherwise be excluded.
 */
const BOUNDARY_TOLERANCE = 1e-9;

export interface ZoneCandidate {
  id: string;
  /** Distance along the ray to where it met this zone, in metres. */
  distance: number;
  priority: number;
}

/**
 * Index of the winning candidate, or -1 if there are none.
 *
 * Only candidates within `window` of the nearest hit are considered, boundary
 * included. Among those, the highest priority wins, and equal priorities go to
 * the nearest.
 * Candidates do not need to be sorted, and the same zone may appear more than
 * once (a ray enters and leaves a double-sided mesh).
 */
export function chooseZoneHit(
  candidates: readonly ZoneCandidate[],
  window = PRIORITY_DEPTH_WINDOW,
): number {
  let nearest = Infinity;
  for (const candidate of candidates) nearest = Math.min(nearest, candidate.distance);

  let best = -1;
  candidates.forEach((candidate, index) => {
    if (candidate.distance - nearest > window + BOUNDARY_TOLERANCE) return;
    const current = candidates[best];
    if (
      !current ||
      candidate.priority > current.priority ||
      (candidate.priority === current.priority && candidate.distance < current.distance)
    ) {
      best = index;
    }
  });
  return best;
}
