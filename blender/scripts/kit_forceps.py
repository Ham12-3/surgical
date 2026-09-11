"""
Parts shared by thumb (spring) forceps: Adson, DeBakey and their kin. An
asset script that uses them names this file on a `# kit: kit_forceps.py`
line, and build.py prepends it after kit.py and kit_shapes.py.

Coordinates are the instrument's own, in Blender axes as the asset scripts
use them: tip at the origin, body up +Z, width along X, thickness along Y.
`side` is +1 or -1: which side of the midline, along Y, a limb is on.

Thumb forceps are two limbs of flat spring steel facing each other through
the thickness and joined at the top, so they lie flat on a tray. They are
modelled shut: the limbs' inner faces converge from a narrow slit under the
joint to meet at the tips. Each limb carries its own half of the joint block,
split on the midline, and hangs from its own pivot where the slit closes
(hinge() in kit_shapes.py). Turned apart about x, the two halves of the block
only press into each other above the pivot, so the joint never opens a crack.
inst_forceps_adson_toothed.py shows the pattern.
"""

# The Adson outline, shared by the toothed and plain patterns, in metres:
# 12 cm long, a slim tip section about 3.5 cm long, a short shoulder, then
# the broad flat grip, rounded off at the top by the profile.
FORCEPS_ADSON_LENGTH = 0.120
FORCEPS_ADSON_SHOULDER = (0.034, 0.044)  # heights where the shoulder starts and ends
FORCEPS_ADSON_JOINT = 0.109  # where the slit closes under the joint block: the pivot
FORCEPS_ADSON_GAP = 0.0008  # each inner face's distance from the midline at the slit's top
FORCEPS_ADSON_ARCH = 0.0015  # height of the slit's rounded top
FORCEPS_ADSON_THICKNESS = [(0.0, 0.00085), (0.034, 0.00115), (0.046, 0.0013), (0.120, 0.0013)]
FORCEPS_ADSON_GRIP = (0.054, 0.098, 0.0012)  # serrated finger area: bottom, top, pitch


def forceps_adson_outline():
    """(height, half-width) control points of an Adson limb, tip to top:
    1.5 mm wide at the tip, about 2.4 mm where the shoulder starts, 9.5 mm
    across the grip. The shoulder is a smoothstep, concave where it leaves
    the tip section and convex where it meets the grip."""
    narrow, broad = 0.0012, 0.00465
    bottom, top = FORCEPS_ADSON_SHOULDER
    points = [(0.0, 0.00075), (0.012, 0.00087), (0.024, 0.00102), (bottom, narrow)]
    for k in range(1, 9):
        u = k / 8
        points.append((bottom + (top - bottom) * u, narrow + (broad - narrow) * u * u * (3 - 2 * u)))
    points += [(0.060, 0.0048), (0.082, 0.00478), (0.100, 0.00458), (FORCEPS_ADSON_LENGTH, 0.00425)]
    return points


def forceps_lerp(points, z):
    """The value at height `z` of a profile given as (z, value) pairs, heights
    increasing: linear between them, constant past either end."""
    if z <= points[0][0]:
        return points[0][1]
    for (z0, v0), (z1, v1) in zip(points, points[1:]):
        if z <= z1:
            return v0 + (v1 - v0) * (z - z0) / (z1 - z0)
    return points[-1][1]


def forceps_round(d, length, least=0.08):
    """Scale for a section `d` from an end, rounding the last `length` on a
    quarter circle; `least` is the scale right at the end (kit_instruments'
    blunt_nose, with that made a parameter)."""
    k = min(max(d / length, 0.0), 1.0)
    return max(least, math.sqrt(1 - (1 - k) ** 2))


def forceps_section(half_width, y0, y1, r0, r1, segments=3):
    """A limb's cross-section at one height, in absolute units: x from
    -half_width to half_width and y from y0 up to y1, with the corners on the
    y0 face rounded to r0 and those on the y1 face to r1. Anticlockwise from
    +x and always 4 * (segments + 1) points, so it can change along a loft."""
    half_h = (y1 - y0) / 2
    r0 = max(1e-5, min(r0, 0.98 * half_width, 0.98 * half_h))
    r1 = max(1e-5, min(r1, 0.98 * half_width, 0.98 * half_h))
    corners = (
        (half_width - r1, y1 - r1, r1, 0.0),
        (r1 - half_width, y1 - r1, r1, 90.0),
        (r0 - half_width, y0 + r0, r0, 180.0),
        (half_width - r0, y0 + r0, r0, 270.0),
    )
    points = []
    for cx, cy, r, start in corners:
        for k in range(segments + 1):
            a = math.radians(start + 90.0 * k / segments)
            points.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return points


def forceps_limb_profile(outline, thickness, length, joint, gap, arch, nose, top, start=0.0, nose_least=0.08, nose_thin=1.0, step=0.008):
    """Where a limb's faces lie, station by station from its tip end at
    `start` to its top at `length`: (z, half_width, inner, outer), inner and
    outer being the faces' distances from the midline.

    `outline` and `thickness` are (z, value) control points for the limb's
    half-width and thickness. Stations fall on every control point, so the
    straight runs between them stay straight. Below the slit the inner face
    runs straight from the midline at the tip to `gap` at the slit's top, and
    the outer face stands the limb's thickness outside it. The slit ends in a
    round arch `arch` tall that closes at `joint`; above that the inner face
    lies on the midline, which makes the limb's half of the joint block. The
    tip end is rounded over `nose` (to `nose_least` of its width and
    `nose_thin` of its thickness right at the end), the top end over `top`.
    """
    arch_start = joint - arch
    heights = [start, length]
    for degrees in (15, 30, 45, 60, 75):
        a = math.radians(degrees)
        heights.append(start + nose * (1 - math.cos(a)))
        heights.append(length - top * (1 - math.cos(a)))
    for degrees in (0, 30, 55, 75, 90):
        heights.append(arch_start + arch * math.sin(math.radians(degrees)))
    heights += [z for z, _ in outline] + [z for z, _ in thickness]
    heights = sorted(set(round(z, 7) for z in heights if start <= z <= length))
    # Split long straight runs, so no quad is much longer than `step`.
    stations = [heights[0]]
    for z in heights[1:]:
        last = stations[-1]
        count = max(1, math.ceil((z - last) / step))
        stations += [last + (z - last) * i / count for i in range(1, count + 1)]

    profile = []
    for z in stations:
        half_width = forceps_lerp(outline, z) * forceps_round(z - start, nose, nose_least) * forceps_round(length - z, top)
        straight = gap * min(z, arch_start) / arch_start
        if z <= arch_start:
            inner = straight
        elif z < joint:
            k = (z - arch_start) / arch
            inner = gap * math.sqrt(max(0.0, 1.0 - k * k))
        else:
            inner = 0.0
        t = forceps_lerp(thickness, z) * forceps_round(z - start, nose, nose_thin)
        profile.append((z, half_width, inner, straight + t))
    return profile


def forceps_profile_at(profile, z):
    """A limb's (half_width, inner, outer) at height `z`, linear between the
    stations of a profile from forceps_limb_profile()."""
    last = len(profile) - 2
    for i in range(last + 1):
        a, b = profile[i], profile[i + 1]
        if z <= b[0] or i == last:
            k = min(max((z - a[0]) / (b[0] - a[0]), 0.0), 1.0)
            return (a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k)


def forceps_limb(bm, side, profile, material, outer_radius=0.00045, inner_radius=0.00015):
    """Loft the limb on `side` through a profile from forceps_limb_profile().
    The outer face's edges are rounded to `outer_radius`, the inner face's
    to `inner_radius`; on the joint block that smaller rounding of the two
    halves is the seam where they meet."""
    sections = []
    for z, half_width, inner, outer in profile:
        if side > 0:
            sections.append(forceps_section(half_width, inner, outer, inner_radius, outer_radius))
        else:
            sections.append(forceps_section(half_width, -outer, -inner, outer_radius, inner_radius))
    # The path runs up the Z axis, so each section is a horizontal slice in
    # absolute (x, y) and loft() needs no scaling.
    loft(bm, [(0.0, 0.0, z) for z, _, _, _ in profile], (0, 1, 0), 1.0, 1.0, sections, material)


def forceps_ridge(bm, x0, x1, y, z, facing, height, length, material, bury=0.5):
    """A straight ridge across a limb face from x0 to x1 at height `z`: its
    foot on the face at `y`, `length` long from front to back, standing
    `height` proud towards `facing` (+1 or -1 along Y) with a flat crest, and
    sunk `bury` of its height into the face so no crack shows where the face
    tilts. Grip serrations and tip teeth are rows of these."""
    # loft() turns section x toward axis x path, here +Z x +X = +Y, so a
    # path run the other way makes the ridge stand towards -Y.
    ends = [(x0, y, z), (x1, y, z)] if facing > 0 else [(x1, y, z), (x0, y, z)]
    section = [(-bury, -1.0), (1.0, -0.35), (1.0, 0.35), (-bury, 1.0)]
    loft(bm, ends, (0, 0, 1), height, length / 2, section, material)


def forceps_grip_serrations(bm, side, profile, bottom, top, pitch, material, height=0.00012, length=0.0006, margin=0.0006):
    """Transverse ridges across the outer face of the limb on `side`, every
    `pitch` from `bottom` to `top`: the serrated finger grip. Each stops
    `margin` short of the edges, on the flat of the face."""
    for i in range(int(round((top - bottom) / pitch)) + 1):
        z = bottom + i * pitch
        half_width, inner, outer = forceps_profile_at(profile, z)
        reach = half_width - margin
        forceps_ridge(bm, -reach, reach, side * outer, z, side, height, length, material)


def forceps_tip_serrations(bm, side, profile, bottom, top, pitch, material, height=0.00007, length=0.00024, margin=0.00022):
    """Fine transverse ridges across the inner face of the tip on `side`,
    standing towards the other limb, every `pitch` from `bottom` to `top`.
    Start the other limb's half a pitch higher and, shut, they interleave."""
    for i in range(int(round((top - bottom) / pitch)) + 1):
        z = bottom + i * pitch
        half_width, inner, outer = forceps_profile_at(profile, z)
        reach = half_width - margin
        forceps_ridge(bm, -reach, reach, side * inner, z, -side, height, length, material)


def forceps_tooth_rows(bm, side, profile, rows, bottom, top, pitch, material, tooth=0.00016, height=0.0001, length=0.00026):
    """Longitudinal rows of small teeth on the inner face of the tip on
    `side`, standing towards the other limb: the DeBakey pattern. `rows`
    lists each row's centre x; each tooth is a short transverse ridge
    reaching `tooth` either side of it, one every `pitch` up the row."""
    count = int(round((top - bottom) / pitch)) + 1
    for x in rows:
        for i in range(count):
            z = bottom + i * pitch
            half_width, inner, outer = forceps_profile_at(profile, z)
            forceps_ridge(bm, x - tooth, x + tooth, side * inner, z, -side, height, length, material)


def forceps_face_height(half_width, face, radius, x):
    """How far from the midline a limb's face lies at `x` across it: `face`
    on the flat, falling away round an edge rounded to `radius`."""
    flat = half_width - radius
    if abs(x) <= flat:
        return face
    dx = min(abs(x) - flat, radius)
    return face - (radius - math.sqrt(max(0.0, radius * radius - dx * dx)))


def forceps_tooth(bm, side, profile, x, half_width, band, reach, material, overlap=0.0003, outer_radius=0.00045):
    """One tooth of a toothed tip, on the limb on `side`, centred at `x`: the
    limb's end below `band` turned in as a hook, its point `reach` past the
    midline, inside the other limb's side. Seen from the edge it drops from
    the limb's square end down the line of its outer face, runs in along the
    bottom to the point, and climbs back to the inner face at `band`. It
    narrows to that point across its width too, so from below it is a
    triangle. The other limb's teeth stand either side of it, or it between
    them, so shut they mesh; none reaches above `band`, where the other
    limb's end is. It runs `overlap` up into its own limb, so it never floats.
    `outer_radius` is the limb's, so the tooth follows its rounded edge."""
    limb_half, inner, outer = forceps_profile_at(profile, band)
    r = min(outer_radius, 0.98 * limb_half, 0.49 * (outer - inner))
    top = band + overlap
    points, sections = [], []
    for u in (-1.0, -0.5, 0.0, 0.5, 1.0):
        at = x + u * half_width
        face = forceps_face_height(limb_half, outer, r, at) - 0.00002
        point = reach * (1.0 - 0.7 * abs(u))
        # (distance from the midline towards this limb's side, height)
        hook = [(face, top), (face, 0.35 * band), (0.6 * face, 0.0), (-point, 0.25 * band), (0.0, band), (0.0, top)]
        points.append((at, 0.0, 0.0))
        sections.append([(side * y, z) for y, z in hook])
    # The path runs along x; with axis Z, loft() lays section x along +Y and
    # section y along Z, both unscaled, so each section is the hook itself.
    loft(bm, points, (0, 0, 1), 1.0, 1.0, sections, material)
