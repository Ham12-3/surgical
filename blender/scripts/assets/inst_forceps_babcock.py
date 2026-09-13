# kit: kit_instruments.py
# kit: kit_clamps.py
"""
inst_forceps_babcock: Babcock tissue forceps, 16 cm, shut on its first
ratchet tooth, with a working hinge.

Runs with kit.py, kit_shapes.py, kit_instruments.py and kit_clamps.py
prepended (see build.py). Draws the `babcock_forceps` tool mesh. Coordinates
are Blender's: tip at the origin, body up +Z, jaws opening along X, thickness
along Y.

Two rigid halves cross at a box lock, as in the haemostats, each hung from its
own pivot at the screw (`jaw_upper` carries the +x jaw). What tells it apart
at a glance:
- long, slender jaws, about a third of the length, that bow apart and leave
  a long lens-shaped gap between them, meeting only at the tips;
- the tips: a broad, rounded, spade-shaped head on each jaw, flared much
  wider than the jaw, with a window through it and fine transverse ridges
  on its gripping face.

The heads are frames round their windows, broad across the ring plane (in
Y) and thin through it (in X), so their gripping faces meet square to the
opening direction, broad enough to encircle bowel or appendix without
crushing it. Straight instrument: the heads meet on the midline at the
origin.
"""

ASSET = "inst_forceps_babcock"
MATERIALS = ["steel", "steelDark"]
STEEL, DARK = 0, 1

# Heights up the instrument from the tip, in metres (16 cm overall).
TOP = 0.160
JAW_TOP = 0.0525  # the jaw roots end inside the box lock
LOCK_BOTTOM, LOCK_TOP = 0.0510, 0.0630
SCREW_Z = 0.0570
LOCK_HALF_WIDTH, LOCK_HALF_THICKNESS = 0.0034, 0.0023

# Heads: a flat frame round a window, in the YZ plane. Its centreline is a
# superellipse (exponent HEAD_SQUARE), flatter across the tip than an
# ellipse, HEAD_WIDE across at the widest and narrowing by HEAD_NARROW into
# the jaw: a spade rather than a ring. The frame's in-plane half-width is
# heaviest along the tip, where the ridges are, and lightest at the top,
# which keeps the window a slot. The gripping face stands FACE_GAP off the
# midline; the flat-faced section makes it a plate, not a wire.
FACE_GAP = 0.0001
HEAD_THICK = 0.00050  # half-thickness through the head, along X
HEAD_WIDE = 0.0030
HEAD_NARROW = 0.40
HEAD_HALF_H = 0.0032
HEAD_SQUARE = 2.5
HEAD_BARS = (0.0011, 0.0010, 0.0007)  # frame half-width at the tip, the sides, the top
HEAD_STEPS = 40
HEAD_X = FACE_GAP + HEAD_THICK
HEAD_ZC = HEAD_BARS[0] + HEAD_HALF_H  # the frame's outer edge touches z = 0
HEAD_TOP = HEAD_ZC + HEAD_HALF_H

# Fine transverse ridges on the gripping face, over the distal two thirds
# of the head, the -x head's half a pitch on from the +x head's.
RIDGE_PITCH = 0.00055
RIDGE_TOOTH = 0.00012
RIDGE_TOP = 0.0060

# Jaws: from the top of each head up into the box, bowing out by BOW.
JAW_ROOT_X = 0.0016
BOW = 0.0042
JAW_STEPS = 24
JAW_HALF_X = (0.00060, 0.0011)  # in the ring plane, at the head and at the box
JAW_HALF_Y = (0.00080, 0.0013)  # across it

# Finger rings, shanks and ratchet, as in the haemostats.
RING_A, RING_B = 0.0088, 0.0098
RING_HW, RING_HT = 0.00145, 0.00135
RING_JOIN = math.radians(235)
RING_INNER = 0.0050
SHANK_END, RING_Z = clamp_ring_join(RING_INNER, TOP, RING_A, RING_B, RING_HW, RING_JOIN)
SHANK = ((0.0021, LOCK_TOP - 0.0015), (0.0034, 0.104), SHANK_END)
SHANK_WIDTH, SHANK_THICKNESS = (0.0017, 0.00135), (0.00145, 0.0013)
RATCHET = (0.1295, 3, 0.0013, 0.0015, 0.00035, 0.0011)


def head_loop():
    """The head frame's centreline as (y, z) pairs round the window, and the
    frame's in-plane half-width at each."""
    low, side, top = HEAD_BARS
    points, bars = [], []
    for i in range(HEAD_STEPS):
        a = 2 * math.pi * i / HEAD_STEPS
        c, s = math.cos(a), math.sin(a)
        width = HEAD_WIDE * (1 - HEAD_NARROW * (1 + s) / 2)
        y = width * math.copysign(abs(c) ** (2 / HEAD_SQUARE), c)
        z = HEAD_ZC + HEAD_HALF_H * math.copysign(abs(s) ** (2 / HEAD_SQUARE), s)
        points.append((y, z))
        bars.append(side + (low - side) * max(0.0, -s) ** 2 + (top - side) * max(0.0, s) ** 2)
    return points, bars


def segment_distance(y, z, a, b):
    """Distance from (y, z) to the segment a-b, in the head's plane."""
    dy, dz = b[0] - a[0], b[1] - a[1]
    length2 = dy * dy + dz * dz
    f = 0.0 if length2 == 0 else max(0.0, min(1.0, ((y - a[0]) * dy + (z - a[1]) * dz) / length2))
    return math.hypot(y - a[0] - f * dy, z - a[1] - f * dz)


def frame_runs(loop, bars, z, cover=0.8, samples=140):
    """Where a line across the head at height z lies on the frame: (y0, y1)
    runs within `cover` of the frame's half-width of its centreline, so a
    ridge crosses the frame and stops short of the window and the rim."""
    limit = HEAD_WIDE + HEAD_BARS[0]
    count = len(loop)
    runs, start, last = [], None, 0.0
    for k in range(samples + 1):
        y = -limit + 2 * limit * k / samples
        near = False
        for i in range(count):
            j = (i + 1) % count
            if segment_distance(y, z, loop[i], loop[j]) < cover * 0.5 * (bars[i] + bars[j]):
                near = True
                break
        if near and start is None:
            start = y
        elif not near and start is not None:
            runs.append((start, last))
            start = None
        last = y
    if start is not None:
        runs.append((start, last))
    return runs


def head(bm, side, loop, bars):
    """The fenestrated head on `side`: the frame, then its ridges."""
    loft(
        bm,
        [(side * HEAD_X, y, z) for y, z in loop],
        axis=(1, 0, 0),  # the frame lies in the YZ plane; its thickness runs along X
        half_width=bars,
        half_thickness=HEAD_THICK,
        section=superellipse(12, 5.0),
        material=STEEL,
        closed=True,
    )
    first = 0.0005 + (0.0 if side > 0 else 0.5 * RIDGE_PITCH)  # the lowest ridge's base stays above the rim
    for k in range(int((RIDGE_TOP - first) / RIDGE_PITCH) + 1):
        z = first + k * RIDGE_PITCH
        for y0, y1 in frame_runs(loop, bars, z):
            if y1 - y0 > 0.0003:
                clamp_ridge(bm, side, Vector((side * FACE_GAP, 0.0, z)), Vector((0.0, 0.0, 1.0)), y0, y1, RIDGE_PITCH, RIDGE_TOOTH, DARK)


def jaw(bm, side):
    """The slender jaw on `side`, from inside the top of its head up into the
    box, bowed out between them."""
    z0, z1 = HEAD_TOP - 0.0002, JAW_TOP
    points, along = [], []
    for i in range(JAW_STEPS):
        u = i / (JAW_STEPS - 1)
        x = HEAD_X * (1 - u) + JAW_ROOT_X * u + BOW * math.sin(math.pi * u)
        points.append((side * x, 0.0, z0 + (z1 - z0) * u))
        along.append(u)
    loft(
        bm,
        points,
        axis=(0, 1, 0),
        half_width=[JAW_HALF_X[0] + (JAW_HALF_X[1] - JAW_HALF_X[0]) * u for u in along],
        half_thickness=[JAW_HALF_Y[0] + (JAW_HALF_Y[1] - JAW_HALF_Y[0]) * u for u in along],
        section=superellipse(12, 3.0),
        material=STEEL,
    )


def handle(bm, side):
    return clamp_handle(
        bm, side, SHANK, SHANK_WIDTH, SHANK_THICKNESS,
        (RING_A, RING_B, RING_JOIN, RING_HW, RING_HT), RATCHET, STEEL,
    )


def build():
    loop, bars = head_loop()
    upper = bmesh.new()  # jaw and head on +x; shank, ring and ratchet bar on -x
    head(upper, 1, loop, bars)
    jaw(upper, 1)
    box_lock(upper, LOCK_BOTTOM, LOCK_TOP, SCREW_Z, LOCK_HALF_WIDTH, LOCK_HALF_THICKNESS, STEEL, DARK, screw_radius=0.0016)
    ring_centre = handle(upper, -1)
    lower = bmesh.new()  # jaw and head on -x; shank, ring and ratchet bar on +x
    head(lower, -1, loop, bars)
    jaw(lower, -1)
    handle(lower, 1)

    upper_half = finish(upper, ASSET + "_upper", MATERIALS)
    lower_half = finish(lower, ASSET + "_lower", MATERIALS)
    pivot = (0.0, SCREW_Z, 0.0)
    return [
        upper_half,
        lower_half,
        hinge("jaw_upper", pivot, [upper_half]),
        hinge("jaw_lower", pivot, [lower_half]),
        # Between the rings, where thumb and ring finger hold it.
        empty("grip_point", (0.0, ring_centre, 0.0)),
    ]
