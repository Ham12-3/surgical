"""
Parts shared by flat-stock instruments: the No. 3 scalpel handle and the
10-15 series blades it carries, and the rounded flat-bar sections that the
retractors in kit_retractor.py are drawn with. An asset script that uses
them names this file on a `# kit: kit_flat.py` line, and build.py prepends
it after kit.py and kit_shapes.py.

Coordinates are the instrument's own, in Blender axes as the asset scripts
use them: working tip at the origin, body up +Z, the flat plane XZ,
thickness along Y. Everything is in metres.

A scalpel is modelled as it sits assembled: the blade lies against one face
of the handle's fitting tongue, its keyhole slot round the raised rib of the
fitting, so the blade's midplane (y = 0) sits FLAT_HANDLE_Y off the handle's.
inst_scalpel_no3_blade10.py shows the pattern.
"""

# The No. 3 handle (Bard-Parker pattern), which takes the 10 to 15 series
# blades: 12.5 cm from the end of the fitting tongue to the top. Heights are
# above the shoulder where the tongue leaves the handle; the shoulder flares
# over FLAT_NO3_FLARE on a smoothstep.
FLAT_NO3_LENGTH = 0.125
FLAT_NO3_FITTING = 0.0165  # the tongue reaches this far below the shoulder
FLAT_NO3_OUTLINE = [(-0.0165, 0.0021), (0.0, 0.0023), (0.0015, 0.0035), (0.008, 0.0036), (0.040, 0.0039), (0.070, 0.0045), (0.1085, 0.0046)]
FLAT_NO3_THICKNESS = [(-0.0165, 0.00065), (0.0, 0.00065), (0.0015, 0.0011), (0.1085, 0.0011)]  # half-thickness
FLAT_NO3_FLARE = (0.0, 0.0015)
FLAT_NO3_TOP_ROUND = 0.0025  # corner radius of the square top end
FLAT_NO3_GRIP = (0.008, 0.038, 0.0011)  # ribbed finger grip: bottom, top, pitch, above the shoulder

# The blade and the fitting it slides onto.
FLAT_BLADE_HALF_T = 0.0002  # a 0.4 mm blade
FLAT_TONGUE_HALF_T = 0.00065
FLAT_HANDLE_Y = -(FLAT_TONGUE_HALF_T + FLAT_BLADE_HALF_T)  # the handle's midplane
FLAT_TANG_HALF = 0.0028  # the blade's tang, over the fitting, is 5.6 mm wide
FLAT_BEVEL = 0.0013  # width of the ground bevel along a cutting edge
FLAT_EDGE_HALF = 0.00003  # half-thickness left at the cutting edge

# The keyhole slot the 10-15 series blades share, as depths below the blade's
# heel (its end against the shoulder): a round-topped wide part nearest the
# heel, where the blade locks, and a long narrow part down the tang.
FLAT_SLOT_TOP = 0.0016
FLAT_SLOT_WIDE = 0.0019  # half-widths
FLAT_SLOT_NARROW = 0.0013
FLAT_SLOT_FLARE = (0.0048, 0.0056)
FLAT_SLOT_BOTTOM = 0.015
FLAT_RIB_GAP = 0.00015  # between the fitting's rib and the slot's edge
FLAT_RIB_TOP = 0.00012  # the rib's crest, just under the blade's face at 0.0002


def flat_lerp(points, z):
    """The value at `z` of (z, value) control points, z increasing: linear
    between them, constant past either end."""
    if z <= points[0][0]:
        return points[0][1]
    for (z0, v0), (z1, v1) in zip(points, points[1:]):
        if z <= z1:
            return v0 + (v1 - v0) * (z - z0) / (z1 - z0)
    return points[-1][1]


def flat_smooth(u):
    """Smoothstep, clamped: 0 below 0, 1 above 1."""
    u = min(max(u, 0.0), 1.0)
    return u * u * (3 - 2 * u)


def flat_blend(points, z, span):
    """flat_lerp(), but smoothstepped across the (lo, hi) `span`, so a
    shoulder there leaves and meets its neighbours without a crease."""
    lo, hi = span
    if lo < z < hi:
        a, b = flat_lerp(points, lo), flat_lerp(points, hi)
        return a + (b - a) * flat_smooth((z - lo) / (hi - lo))
    return flat_lerp(points, z)


def flat_round(d, length, least=0.08):
    """Scale for a section `d` from an end, rounding the last `length` on a
    quarter circle, down to `least` right at the end."""
    k = min(max(d / length, 0.0), 1.0)
    return max(least, math.sqrt(1 - (1 - k) ** 2))


def flat_section(half_a, half_b, radius, inset=0.0004, segments=3):
    """rounded_rect() with two more points on each straight side, `inset` in
    from its ends (at thirds on a short side). Smooth shading then rounds
    only the edges and keeps a broad face flat, where one long quad across
    it would shade like a shallow cylinder."""
    r = max(1e-5, min(radius, 0.98 * half_a, 0.98 * half_b))
    centres = ((half_a - r, half_b - r), (r - half_a, half_b - r), (r - half_a, r - half_b), (half_a - r, r - half_b))
    points = []
    for i, (cx, cy) in enumerate(centres):
        arc = [math.radians(90.0 * (i + k / segments)) for k in range(segments + 1)]
        points += [(cx + r * math.cos(a), cy + r * math.sin(a)) for a in arc]
        # The straight side from this corner's arc to the next one's.
        nx, ny = centres[(i + 1) % 4]
        a = math.radians(90.0 * (i + 1))
        p0 = Vector((cx + r * math.cos(a), cy + r * math.sin(a)))
        p1 = Vector((nx + r * math.cos(a), ny + r * math.sin(a)))
        side = (p1 - p0).length
        t = inset / side if side > 3 * inset else 1.0 / 3.0
        points += [tuple(p0.lerp(p1, t)), tuple(p0.lerp(p1, 1.0 - t))]
    return points


def flat_stations(z0, z1, keys, step):
    """Sorted heights from z0 to z1 through every key height between them,
    with no gap longer than `step`, so curves in a profile keep their shape."""
    heights = sorted(set(round(z, 7) for z in [z0, z1] + list(keys) if z0 <= z <= z1))
    stations = [heights[0]]
    for z in heights[1:]:
        last = stations[-1]
        count = max(1, math.ceil((z - last) / step))
        stations += [last + (z - last) * i / count for i in range(1, count + 1)]
    return stations


def flat_ridge(bm, x0, x1, y, z, facing, height, length, material, bury=0.5):
    """A straight ridge across a face from x0 to x1 at height `z`: its foot on
    the face at `y`, `length` long from front to back, standing `height`
    proud towards `facing` (+1 or -1 along Y) with a flat crest, sunk `bury`
    of its height into the face. Grip ribs are rows of these."""
    # loft() turns section x toward axis x path, here +Z x +X = +Y, so a path
    # run the other way makes the ridge stand towards -Y.
    ends = [(x0, y, z), (x1, y, z)] if facing > 0 else [(x1, y, z), (x0, y, z)]
    section = [(-bury, -1.0), (1.0, -0.35), (1.0, 0.35), (-bury, 1.0)]
    loft(bm, ends, (0, 0, 1), height, length / 2, section, material)


def flat_no3_handle(bm, x_axis, shoulder, steel, dark):
    """The No. 3 handle on the vertical line x = `x_axis`, its shoulder at
    height `shoulder`: flat bar with rounded edges, the fitting tongue below
    the shoulder, a ribbed finger grip on both faces, and a square top end
    with rounded corners. The fitting's rib is flat_no3_rib()."""
    bottom = -FLAT_NO3_FITTING
    top = FLAT_NO3_LENGTH - FLAT_NO3_FITTING
    tip_round, r_top = 0.0012, FLAT_NO3_TOP_ROUND
    keys = [p[0] for p in FLAT_NO3_OUTLINE + FLAT_NO3_THICKNESS]
    lo, hi = FLAT_NO3_FLARE
    keys += [lo + (hi - lo) * k / 6 for k in range(7)]
    for degrees in (15, 30, 45, 60, 75):
        a = math.radians(degrees)
        keys += [bottom + tip_round * (1 - math.cos(a)), top - r_top * (1 - math.cos(a))]
    points, sections = [], []
    for h in flat_stations(bottom, top, keys, 0.004):
        half_w = flat_blend(FLAT_NO3_OUTLINE, h, FLAT_NO3_FLARE) * flat_round(h - bottom, tip_round, 0.35)
        half_t = flat_blend(FLAT_NO3_THICKNESS, h, FLAT_NO3_FLARE)
        d = h - (top - r_top)
        if d > 0:  # the top's corners, a quarter circle each side
            half_w += math.sqrt(max(0.0, r_top * r_top - d * d)) - r_top
        points.append((x_axis, FLAT_HANDLE_Y, shoulder + h))
        sections.append(flat_section(half_w, half_t, min(0.0006, 0.6 * half_t)))
    # The path runs up Z, so section x lies along +X and section y along +Y.
    loft(bm, points, (0, 1, 0), 1.0, 1.0, sections, steel)

    grip_bottom, grip_top, pitch = FLAT_NO3_GRIP
    for i in range(int(round((grip_top - grip_bottom) / pitch)) + 1):
        h = grip_bottom + i * pitch
        reach = flat_blend(FLAT_NO3_OUTLINE, h, FLAT_NO3_FLARE) - 0.0009
        half_t = flat_blend(FLAT_NO3_THICKNESS, h, FLAT_NO3_FLARE)
        for side in (-1, 1):
            y = FLAT_HANDLE_Y + side * half_t
            flat_ridge(bm, x_axis - reach, x_axis + reach, y, shoulder + h, side, 0.00012, 0.0005, dark)


def flat_slot_half(d, inset=0.0):
    """Half-width of the blade's keyhole slot at depth `d` below the heel,
    shrunk by `inset` all round; 0 outside it."""
    wide, narrow = FLAT_SLOT_WIDE - inset, FLAT_SLOT_NARROW - inset
    top_c = FLAT_SLOT_TOP + FLAT_SLOT_WIDE  # centres of the two round ends
    bottom_c = FLAT_SLOT_BOTTOM - FLAT_SLOT_NARROW
    if d < top_c:
        return math.sqrt(max(0.0, wide * wide - (top_c - d) ** 2))
    if d > bottom_c:
        return math.sqrt(max(0.0, narrow * narrow - (d - bottom_c) ** 2))
    lo, hi = FLAT_SLOT_FLARE
    return wide + (narrow - wide) * flat_smooth((d - lo) / (hi - lo))


def flat_slot_keys(inset=0.0):
    """Depths where the slot's outline turns: round its ends every 15 degrees,
    and along the flare."""
    top_c = FLAT_SLOT_TOP + FLAT_SLOT_WIDE
    bottom_c = FLAT_SLOT_BOTTOM - FLAT_SLOT_NARROW
    keys = []
    for degrees in range(0, 91, 15):
        c = math.cos(math.radians(degrees))
        keys += [top_c - (FLAT_SLOT_WIDE - inset) * c, bottom_c + (FLAT_SLOT_NARROW - inset) * c]
    lo, hi = FLAT_SLOT_FLARE
    return keys + [lo + (hi - lo) * k / 4 for k in range(5)]


def flat_no3_rib(bm, x_axis, heel, material):
    """The fitting's raised rib, as much of it as shows through the blade's
    slot: FLAT_RIB_GAP inside the slot's edge, its crest just under the
    blade's face, its foot sunk into the tongue. `heel` is the height of the
    blade's heel, which is the handle's shoulder."""
    foot = -FLAT_BLADE_HALF_T - 0.00005
    centre, half_t = (FLAT_RIB_TOP + foot) / 2, (FLAT_RIB_TOP - foot) / 2
    d0, d1 = FLAT_SLOT_TOP + FLAT_RIB_GAP + 0.00002, FLAT_SLOT_BOTTOM - FLAT_RIB_GAP - 0.00002
    depths = flat_stations(d0, d1, flat_slot_keys(FLAT_RIB_GAP), 0.001)
    points, sections = [], []
    for d in reversed(depths):  # bottom to top, so the path runs up +Z
        half_w = max(flat_slot_half(d, FLAT_RIB_GAP), 0.00012)
        points.append((x_axis, centre, heel - d))
        sections.append(rounded_rect(half_w, half_t, 0.0001, 2))
    loft(bm, points, (0, 1, 0), 1.0, 1.0, sections, material)


def flat_blade_section(x0, x1, half_t, bevel, edge):
    """A slice across a blade from x0 to x1: square on the x0 side, ground
    over `bevel` on the x1 side down to half-thickness `edge` at x1 (pass
    `half_t` for a square x1 side too). Anticlockwise from the x1 side and
    always six points, so it can change along a loft."""
    b = min(bevel, 0.45 * (x1 - x0))
    return [(x1, -edge), (x1, edge), (x1 - b, half_t), (x0, half_t), (x0, -half_t), (x1 - b, -half_t)]


def flat_blade_sides(back, edge, x_axis, z):
    """(back x, edge x, edge half-thickness) of a blade at height `z`, from
    its control points (see flat_blade)."""
    x0 = x_axis + flat_lerp(back, z)
    x1 = x_axis + flat_lerp([(p[0], p[1]) for p in edge], z)
    e = flat_lerp([(p[0], p[2]) for p in edge], z)
    return x0, max(x1, x0 + 0.00002), e


def flat_blade(bm, x_axis, heel, back, edge, satin, steel, step=0.0008):
    """A 10-15 series blade, its point at the origin and its heel at height
    `heel`, lying on y = 0. `back` lists (z, x) points of the blunt back and
    `edge` (z, x, half-thickness) points of the other side, x measured from
    the handle's axis at `x_axis`: where that side is a cutting edge its
    half-thickness is FLAT_EDGE_HALF, and elsewhere FLAT_BLADE_HALF_T.

    Built as a loft up from the point to the slot, one either side of the
    slot, and one over the heel. Flats are `satin`, the ground bevel `steel`.
    """
    h = FLAT_BLADE_HALF_T
    first = len(bm.faces)
    slot_bottom, slot_top = heel - FLAT_SLOT_BOTTOM, heel - FLAT_SLOT_TOP
    keys = [p[0] for p in back] + [p[0] for p in edge] + [heel - d for d in flat_slot_keys()]
    keys += [0.0001, 0.0003, 0.0006, 0.001, 0.0015]  # the point's sharp curve

    points, sections = [], []
    for z in flat_stations(0.0, slot_bottom, keys, step):
        x0, x1, e = flat_blade_sides(back, edge, x_axis, z)
        points.append((0.0, 0.0, z))
        sections.append(flat_blade_section(x0, x1, h, FLAT_BEVEL, min(e, h)))
    loft(bm, points, (0, 1, 0), 1.0, 1.0, sections, satin)

    points, left, right = [], [], []
    for z in flat_stations(slot_bottom, slot_top, keys, step):
        x0, x1, e = flat_blade_sides(back, edge, x_axis, z)
        s = flat_slot_half(heel - z)
        points.append((0.0, 0.0, z))
        left.append(flat_blade_section(x0, x_axis - s, h, FLAT_BEVEL, h))
        right.append(flat_blade_section(x_axis + s, x1, h, FLAT_BEVEL, min(e, h)))
    loft(bm, points, (0, 1, 0), 1.0, 1.0, left, satin)
    loft(bm, points, (0, 1, 0), 1.0, 1.0, right, satin)

    points, sections = [], []
    for z in flat_stations(slot_top, heel, keys, step):
        x0, x1, e = flat_blade_sides(back, edge, x_axis, z)
        points.append((0.0, 0.0, z))
        sections.append(flat_blade_section(x0, x1, h, FLAT_BEVEL, h))
    loft(bm, points, (0, 1, 0), 1.0, 1.0, sections, satin)

    # The bevel's faces are the only ones tilted a little off the flat.
    for face in list(bm.faces)[first:]:
        face.normal_update()
        if 0.2 < abs(face.normal.y) < 0.9999:
            face.material_index = steel
