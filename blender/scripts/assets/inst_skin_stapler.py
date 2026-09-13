# kit: kit_moulded.py
"""
inst_skin_stapler: disposable skin stapler, about 15 cm, with a pistol grip,
a squeeze trigger, and a narrow staple head with a clear window at the front.

Runs with kit.py, kit_shapes.py and kit_moulded.py prepended (see build.py).
Draws the `skin_stapler` tool mesh. Coordinates are Blender's: the centre of
the staple head's front edge at the origin, the body running up +Z from it,
the grip and trigger hanging off the +X side, thickness along Y. The staple
line crosses the wound, so the head is wide along Y and narrow along X.

Nothing else on the tray looks like it: a chunky light moulded body whose
grip flows out of its back, a dark trigger nested just in front of the grip,
and a clear nose with a steel front edge. One staple waits inside the clear
head, visible through the app's translucent plastic.
"""

ASSET = "inst_skin_stapler"
MATERIALS = ["paint", "handle", "plastic", "steel"]
BODY, TRIGGER, WINDOW, STEEL = 0, 1, 2, 3

# The body: (height, centre x, half-width across x, half-thickness through
# y). A rounded front face the head stands out of, then it deepens toward
# the grip side while its top line (-x) stays nearly straight, as a pistol's
# does, and rounds off at the back where the grip leaves it.
BODY_STATIONS = [
    (0.0160, 0.0010, 0.0040, 0.0060),
    (0.0170, 0.0010, 0.0052, 0.0074),
    (0.0190, 0.0012, 0.0062, 0.0085),
    (0.0220, 0.0015, 0.0068, 0.0092),
    (0.0300, 0.0030, 0.0085, 0.0100),
    (0.0420, 0.0055, 0.0115, 0.0110),
    (0.0550, 0.0075, 0.0140, 0.0118),
    (0.0700, 0.0088, 0.0158, 0.0122),
    (0.0900, 0.0092, 0.0165, 0.0124),
    (0.1100, 0.0090, 0.0165, 0.0124),
    (0.1220, 0.0086, 0.0158, 0.0120),
    (0.1290, 0.0080, 0.0140, 0.0112),
    (0.1330, 0.0074, 0.0110, 0.0094),
    (0.1352, 0.0068, 0.0070, 0.0065),
    (0.1360, 0.0064, 0.0030, 0.0030),
]

# The clear head: (height, half-width across x, half-width along y).
HEAD_STATIONS = [(0.0025, 0.0020, 0.0052), (0.004, 0.0022, 0.0056), (0.008, 0.0026, 0.0060), (0.014, 0.0032, 0.0063), (0.020, 0.0038, 0.0066), (0.026, 0.0045, 0.0068)]
EDGE_HALF_X, EDGE_HALF_Y, EDGE_TOP = 0.0018, 0.0048, 0.0035  # the steel front edge

# The loaded staple, an open rectangle in the YZ plane behind the front edge:
# half its crown's width, the crown's height and the height its legs reach.
# TODO(clinical review): staple size (regular or wide) is assumed "wide", about 6.9 mm.
STAPLE_HALF_W, STAPLE_CROWN_Z, STAPLE_LEG_Z, STAPLE_R = 0.0034, 0.0068, 0.0042, 0.00026

# Grip and trigger centrelines, as quadratic Bezier (x, z) control points,
# each running out from inside the body; their (start, end) half-sizes across
# the line and through y; and how much extra width flares their roots into
# the body, like a moulded fillet. The grip leaves the back of the body and
# rakes back like a pistol grip; the trigger nests about 6 mm in front of it.
GRIP = ((0.010, 0.114), (0.045, 0.117), (0.085, 0.138))
GRIP_WIDTH, GRIP_THICKNESS, GRIP_FLARE = (0.0145, 0.0125), (0.0112, 0.0100), 0.007
TRIGGER_LINE = ((0.016, 0.086), (0.045, 0.092), (0.074, 0.108))
TRIGGER_WIDTH, TRIGGER_THICKNESS, TRIGGER_FLARE = (0.0085, 0.0070), (0.0090, 0.0082), 0.003
# Bezier parameters along each: closer together where the flare peaks and at
# the rounded free end. The fifth is the middle, where the hand grips.
ALONG = [0.0, 0.1, 0.2, 0.33, 0.5, 0.62, 0.74, 0.84, 0.91, 0.955, 0.98, 0.994, 1.0]
FLARE_PEAK, FLARE_GONE = 0.2, 0.5  # fractions along a limb


def curve(control):
    """Points along a quadratic Bezier through three (x, z) control points."""
    (x0, z0), (x1, z1), (x2, z2) = control
    return [
        ((1 - t) ** 2 * x0 + 2 * t * (1 - t) * x1 + t * t * x2, 0.0, (1 - t) ** 2 * z0 + 2 * t * (1 - t) * z1 + t * t * z2)
        for t in ALONG
    ]


def limb(bm, control, width, thickness, flare, exponent, end_radius, material):
    """A moulded grip or lever along `control`, tapering from (start, end)
    half-sizes, flared at its root and rounded over `end_radius` at its
    free end."""
    points = curve(control)
    along = path_t(points)
    length = sum((Vector(b) - Vector(a)).length for a, b in zip(points, points[1:]))
    ends = [moulded_round((1 - t) * length, end_radius, 0.3) for t in along]
    # The flare swells from nothing inside the body to its fullest about
    # where the limb comes out through the body's surface, then fades: only
    # the fillet shows, and the buried root never pokes through the body.
    roots = [flare * min(t / FLARE_PEAK, 1.0) * (1 - moulded_smoothstep(t, FLARE_PEAK, FLARE_GONE)) for t in along]
    loft(
        bm,
        points,
        axis=(0, 1, 0),
        half_width=[(width[0] + (width[1] - width[0]) * t + r) * e for t, r, e in zip(along, roots, ends)],
        half_thickness=[(thickness[0] + (thickness[1] - thickness[0]) * t + 0.25 * r) * (0.5 + 0.5 * e) for t, r, e in zip(along, roots, ends)],
        section=superellipse(20, exponent),
        material=material,
    )


def head(bm):
    loft(
        bm,
        [(0, 0, z) for z, _, _ in HEAD_STATIONS],
        axis=(0, 1, 0),
        half_width=[w for _, w, _ in HEAD_STATIONS],
        half_thickness=[t for _, _, t in HEAD_STATIONS],
        section=superellipse(20, 3.5),
        material=WINDOW,
    )
    # The steel front edge the staple is formed against; slab() takes app
    # coordinates, where the head's width (Blender y) is z.
    slab(bm, (-EDGE_HALF_X, 0.0, -EDGE_HALF_Y), (EDGE_HALF_X, EDGE_TOP, EDGE_HALF_Y), 0.0006, STEEL, along="z")


def staple(bm):
    # Two legs down toward the front edge and the crown across the top,
    # with small rounded corners.
    corner = 0.0006
    w, top = STAPLE_HALF_W, STAPLE_CROWN_Z
    points = [(0, -w, STAPLE_LEG_Z), (0, -w, top - corner)]
    points += [(0, -w + corner + corner * math.cos(a), top - corner + corner * math.sin(a)) for a in (0.875 * math.pi, 0.75 * math.pi, 0.625 * math.pi)]
    points += [(0, w - corner + corner * math.cos(a), top - corner + corner * math.sin(a)) for a in (0.375 * math.pi, 0.25 * math.pi, 0.125 * math.pi)]
    points += [(0, w, top - corner), (0, w, STAPLE_LEG_Z)]
    loft(bm, points, (1, 0, 0), STAPLE_R, STAPLE_R, superellipse(8, 2.0), STEEL)


def build():
    bm = bmesh.new()
    loft(
        bm,
        [(x, 0, z) for z, x, _, _ in BODY_STATIONS],
        axis=(0, 1, 0),
        half_width=[w for _, _, w, _ in BODY_STATIONS],
        half_thickness=[t for _, _, _, t in BODY_STATIONS],
        section=superellipse(24, 3.0),
        material=BODY,
    )
    head(bm)
    staple(bm)
    limb(bm, GRIP, GRIP_WIDTH, GRIP_THICKNESS, GRIP_FLARE, 2.6, 0.010, BODY)
    limb(bm, TRIGGER_LINE, TRIGGER_WIDTH, TRIGGER_THICKNESS, TRIGGER_FLARE, 3.0, 0.007, TRIGGER)
    stapler = finish(bm, ASSET, MATERIALS)
    grip = curve(GRIP)[4]  # halfway along the grip
    return [stapler, empty("grip_point", (grip[0], grip[2], 0.0))]
