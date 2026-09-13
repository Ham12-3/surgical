"""
Parts shared by the locking ring-handled clamps (Kelly, mosquito, Babcock,
towel clip, Weitlaner): jaw halves split along a curved centreline,
transverse serrations, and the sums that set a finger ring and a ratchet bar
on a shank. An asset script names this file on a `# kit: kit_clamps.py` line
after kit_instruments.py, and build.py prepends it after that.

Coordinates are the instrument's own, in Blender axes: tip at the origin, body
up +Z, jaws opening along X, thickness along Y. Paths are lists of points in
the XZ plane (y = 0), listed from the tip upward, so the in-plane normal
Y x tangent points to +X. `side` is +1 or -1, the side of the midline a part
is on.
"""


def clamp_lengths(points):
    """Length along a path at each of its points, from its first point."""
    lengths = [0.0]
    for a, b in zip(points, points[1:]):
        lengths.append(lengths[-1] + (Vector(b) - Vector(a)).length)
    return lengths


def clamp_lerp(lengths, values, s):
    """A per-point value (a number or a Vector) at length `s` along a path."""
    if s <= lengths[0]:
        return values[0]
    for i in range(1, len(lengths)):
        if s <= lengths[i]:
            span = lengths[i] - lengths[i - 1]
            f = (s - lengths[i - 1]) / span if span > 0 else 0.0
            return values[i - 1] + (values[i] - values[i - 1]) * f
    return values[-1]


def clamp_normals(points):
    """Unit in-plane normals of an XZ path, Y x tangent (+X for a path
    running up +Z)."""
    normals = []
    count = len(points)
    for i in range(count):
        t = Vector(points[min(i + 1, count - 1)]) - Vector(points[max(i - 1, 0)])
        normals.append(Vector((t.z, 0.0, -t.x)).normalized())
    return normals


def clamp_bezier(p0, p1, p2, ts):
    """Points on a quadratic Bezier through (x, z) points, at the parameters
    `ts`, so stations can crowd where a part rounds off."""
    points = []
    for t in ts:
        a, b, c = (1 - t) ** 2, 2 * t * (1 - t), t * t
        points.append(Vector((a * p0[0] + b * p1[0] + c * p2[0], 0.0, a * p0[1] + b * p1[1] + c * p2[1])))
    return points


def clamp_tip_ts(count, crowd=6):
    """Bezier parameters from 0 to 1 with `crowd` extra stations packed near
    0, where a jaw's nose or a prong's ball end rounds off."""
    near = [0.05 * (k / crowd) ** 2 for k in range(crowd)]
    return near + [0.05 + 0.95 * k / (count - 1) for k in range(count)]


def clamp_jaw(bm, side, centre, beak, depth, gap, material, count=10, exponent=3.0):
    """One D-section jaw half on `side` of a centreline listed from the tip
    up: its flat gripping face `gap` off the centreline, its rounded back
    `beak` off it, and `depth` its half-thickness in Y, all per point. A
    curved jaw is split along its own curve, as a forged one is."""
    normals = clamp_normals(centre)
    loft(
        bm,
        [c + n * (side * g) for c, n, g in zip(centre, normals, gap)],
        axis=(0, side, 0),  # turns the section's x out to this side of the curve
        half_width=[b - g for b, g in zip(beak, gap)],
        half_thickness=depth,
        section=half_superellipse(count, exponent),
        material=material,
    )


def clamp_ridge(bm, side, face, t, y0, y1, pitch, tooth, material):
    """One transverse ridge on the gripping face of the jaw on `side`, from
    y0 to y1 across it: a triangular prism at `face` (a point on the face),
    its crest `tooth` proud of the face towards the midline, its base sunk
    into the jaw and wide enough that neighbours `pitch` apart meet at the
    face. `t` is the jaw's unit tangent there, in the XZ plane."""
    bury = 0.6 * tooth
    half_base = 0.5 * pitch * (tooth + bury) / tooth
    # Swept along Y with t as the loft axis, section x runs along t x Y,
    # which is -(Y x t), so side * p stands p off the face towards the midline.
    loft(
        bm,
        [face + Vector((0.0, y0, 0.0)), face + Vector((0.0, y1, 0.0))],
        axis=t,
        half_width=1.0,
        half_thickness=1.0,
        section=[(-side * bury, -half_base), (-side * bury, half_base), (side * tooth, 0.0)],
        material=material,
    )


def clamp_serrations(bm, side, centre, depth, gap, lo, hi, pitch, tooth, material, phase=0.0, cover=0.97):
    """Transverse ridges (clamp_ridge) across the gripping face of the jaw
    half on `side`, every `pitch` from length `lo` to `hi` along the
    centreline. `phase` (a fraction of the pitch) staggers one jaw's ridges
    into the other's valleys, so the shut jaws show one zigzag seam, as real
    serrations mesh. `cover` keeps the ridge ends inside the face's edges."""
    lengths = clamp_lengths(centre)
    normals = clamp_normals(centre)
    first = lo + phase * pitch
    count = int((hi - first) / pitch) + 1 if hi > first else 0
    for k in range(count):
        s = first + k * pitch
        c = clamp_lerp(lengths, centre, s)
        n = clamp_lerp(lengths, normals, s).normalized()
        t = Vector((-n.z, 0.0, n.x))  # the jaw's tangent, back from n = Y x t
        face = c + n * (side * clamp_lerp(lengths, gap, s))
        w = cover * clamp_lerp(lengths, depth, s)
        clamp_ridge(bm, side, face, t, -w, w, pitch, tooth, material)


def clamp_ring_join(inner_x, top_z, a, b, half_width, join_angle):
    """Where a shank must end, (x, z) as for side +1, for finger_ring() to
    set a ring with its inner edge `inner_x` off the midline and its top at
    `top_z`. Returns the join and the ring centre's height."""
    cx = inner_x + a + half_width
    cz = top_z - b - half_width
    return (cx + a * math.cos(join_angle), cz + b * math.sin(join_angle)), cz


def clamp_shank_x(start, control, end, z, count=80):
    """x of a shank's centreline (start, control, end as shank() takes them,
    side +1) at height z: where a ratchet bar or a catch roots on it."""
    points = bezier((start[0], 0, start[1]), (control[0], 0, control[1]), (end[0], 0, end[1]), count)
    for a, b in zip(points, points[1:]):
        if (a.z - z) * (b.z - z) <= 0:
            f = (z - a.z) / (b.z - a.z) if b.z != a.z else 0.0
            return a.x + (b.x - a.x) * f
    return points[-1].x


def clamp_handle(bm, side, path, width, thickness, ring, ratchet, material):
    """The shank, finger ring and ratchet bar on `side`: the handle end of
    the half whose jaw is on the other side.

    path: shank (start, control, end) as (x, z) points for side +1.
    width, thickness: shank half-sizes (at the joint, at the ring).
    ring: (a, b, join_angle, half_width, half_thickness) for finger_ring().
    ratchet: (z_mid, count, pitch, depth, tooth, thickness), or None. Its bar
    roots inside the shank and runs across the midline far enough for the
    two bars' teeth to overlap evenly about it.
    Returns the ring centre's height, where the hand grips."""
    start, control, end = path
    shank(bm, side, start, control, end, width, thickness, material)
    a, b, join_angle, ring_w, ring_t = ring
    centre_z = finger_ring(bm, side, end, a, b, join_angle, material, ring_w, ring_t)
    if ratchet is not None:
        z_mid, count, pitch, depth, tooth, bar = ratchet
        root_z = z_mid + (tooth + 0.5 * depth) * (1 if side > 0 else -1)
        root = clamp_shank_x(start, control, end, root_z)
        ratchet_bar(
            bm, side, z_mid, material,
            root_x=root, tip_x=0.5 * count * pitch, count=count, pitch=pitch,
            depth=depth, tooth=tooth, thickness=bar,
        )
    return centre_z


def clamp_shift(bm, dx, dz=0.0):
    """Move everything built so far `dx` along X and `dz` along Z. A curved
    clamp is built about its body axis, then shifted to put its curved tip
    on the origin."""
    bmesh.ops.translate(bm, vec=Vector((dx, 0.0, dz)), verts=bm.verts[:])


def clamp_lowest(bms):
    """The lowest z of everything built so far in the bmeshes `bms`: how far
    a rounded working end dips below the height it was drawn to."""
    return min(v.co.z for bm in bms for v in bm.verts)
