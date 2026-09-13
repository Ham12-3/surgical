# kit: kit_instruments.py
# kit: kit_clamps.py
"""
inst_retractor_weitlaner: Weitlaner self-retaining retractor, 14 cm, arms
together, with a working hinge.

Runs with kit.py, kit_shapes.py, kit_instruments.py and kit_clamps.py
prepended (see build.py). Draws the `weitlaner_retractor` tool mesh.
Coordinates are Blender's: tip at the origin, body up +Z, arms opening along
X, thickness along Y.

Two rigid halves cross at a screw (lap) joint, like scissors: each has an arm
on one side of the midline and its handle and ring on the other, and each
hangs from its own pivot at the screw (`jaw_upper` carries the +x arm), so
spreading the rings spreads the arms. At the joint each half is flat, in its
own layer either side of y = 0; away from it the arms and handles step back
to full thickness on the midline, so the rakes line up.

What tells it apart at a glance: no jaws at all, but two rakes of blunt
prongs curving down and outward, the prongs of one rake sitting between the
other's when shut; and a curved, toothed ratchet bar between the handles,
fixed to one handle and running through a catch on the other. The bar is an
arc about the screw, so the catch rides along it at any opening. The prong
tips are the working end: their midpoint is at the origin.
"""

ASSET = "inst_retractor_weitlaner"
MATERIALS = ["steel", "steelDark"]
STEEL, DARK = 0, 1

TOP = 0.140
PIVOT_Z = 0.062

# Rakes. Each is a bar across Y at the foot of its arm, prongs hanging from
# its underside and hooking out to its own side; one rake's prongs sit in
# the gaps between the other's.
# TODO(clinical review): blunt 3x4 prongs assumed; Weitlaners also come with sharp prongs and other counts.
PRONGS_UPPER = 3  # on the +x arm
PRONGS_LOWER = 4  # on the -x arm
PRONG_PITCH = 0.0032  # between one rake's own prongs
PRONG_RADIUS = 0.00068
PRONG_TIP_X = 0.0058  # how far out to each side the blunt tips reach
PRONG_ROOT = (0.0007, 0.0100)  # (x, z) where each prong leaves its bar
PRONG_HOOK = 0.0032  # height of the Bezier control over the tip: higher curves longer
RAKE_BAR_X = (0.00008, 0.0018)  # the bars all but touch on the midline when shut
RAKE_BAR_Z = (0.0092, 0.0134)
RAKE_ROUND = 0.00075

# Arms, from the rake up into the joint, as (x, z) for the +x side. Each
# widens across Y into its rake over ARM_FOOT (thickness, length).
ARM = ((0.0010, 0.0126), (0.0042, 0.036), (0.0026, PIVOT_Z - 0.0008))
ARM_WIDTH = (0.0009, 0.0014)  # half-size in the ring plane, at the rake and at the joint
ARM_THICK = 0.0013
ARM_FOOT = (0.0021, 0.009)

# Joint: each half's disc sits in its own layer, LAYER half-thick, either
# side of a hair of clearance on y = 0. Bars step down into their layer
# between the two distances in BLEND from the screw.
DISC_RADIUS = 0.0045
LAYER = 0.00074
LAYER_CLEAR = 0.00003
BLEND = (DISC_RADIUS + 0.0005, DISC_RADIUS + 0.0045)

# Handles and rings, as (x, z) for the +x side.
RING_A, RING_B = 0.0085, 0.0095
RING_HW, RING_HT = 0.00145, 0.00135
RING_JOIN = math.radians(235)
RING_INNER = 0.0050
SHANK_END, RING_Z = clamp_ring_join(RING_INNER, TOP, RING_A, RING_B, RING_HW, RING_JOIN)
HANDLE = ((0.0026, PIVOT_Z + 0.0008), (0.0042, 0.096), SHANK_END)
HANDLE_WIDTH = (0.0015, 0.00135)
HANDLE_THICK = 0.0013

# Ratchet bar: an arc RATCHET_RADIUS from the screw, fixed to the +x handle
# and long enough past the catch on the -x handle to hold OPEN_MAX.
RATCHET_RADIUS = 0.021
RATCHET_HALF_WIDTH = 0.0010  # radial
RATCHET_HALF_THICK = 0.0008
TOOTH_HEIGHT = 0.0006
TOOTH_PITCH = 0.0015
OPEN_MAX = math.radians(44)


def bar(bm, side, layer_side, path, width, thickness, foot=None, steps=24):
    """A forged bar on `side` along a Bezier through (x, z) points given as
    for side +1: full thickness on the midline, except within BLEND of the
    screw, where it steps into its half's layer (`layer_side`) so the two
    halves cross without meeting. `foot` (thickness, length) widens its
    start across Y, where an arm runs into its rake."""
    start, control, end = path
    points = bezier((side * start[0], 0, start[1]), (side * control[0], 0, control[1]), (side * end[0], 0, end[1]), steps)
    along = path_t(points)
    lengths = clamp_lengths(points)
    ys, hs = [], []
    for p, s in zip(points, lengths):
        d = math.hypot(p.x, p.z - PIVOT_Z)
        b = min(1.0, max(0.0, (BLEND[1] - d) / (BLEND[1] - BLEND[0])))
        b = b * b * (3 - 2 * b)  # smoothstep, so the step has no crease
        h = thickness
        if foot is not None:
            f = max(0.0, 1 - s / foot[1])
            h = thickness + (foot[0] - thickness) * f * f
        ys.append(layer_side * (LAYER_CLEAR + LAYER) * b)
        hs.append(h * (1 - b) + LAYER * b)
    loft(
        bm,
        [Vector((p.x, y, p.z)) for p, y in zip(points, ys)],
        axis=(0, 1, 0),
        half_width=[width[0] + (width[1] - width[0]) * t for t in along],
        half_thickness=hs,
        section=superellipse(14, 3.5),
        material=STEEL,
    )


def disc(bm, layer_side):
    """This half's round of the lap joint, in its own layer."""
    profile = [(DISC_RADIUS - 0.0003, 0.0), (DISC_RADIUS, 0.0003), (DISC_RADIUS, 2 * LAYER - 0.0003), (DISC_RADIUS - 0.0003, 2 * LAYER)]
    # lathe_part takes app coordinates: Blender (x, y, z) is app (x, z, -y).
    lathe_part(bm, (0.0, PIVOT_Z, -layer_side * LAYER_CLEAR), (0.0, 0.0, -layer_side), profile, STEEL, segments=28)


def rake(bm, side, count):
    """The rake at the foot of the arm on `side`: its bar, and `count` blunt
    prongs curving down and out to `side`, centred on y = 0."""
    span = (count - 1) * PRONG_PITCH
    half = 0.5 * span + PRONG_RADIUS + 0.0006
    xs = sorted((side * RAKE_BAR_X[0], side * RAKE_BAR_X[1]))
    # slab takes app corners: Blender (x, y, z) is app (x, z, -y).
    slab(bm, (xs[0], RAKE_BAR_Z[0], -half), (xs[1], RAKE_BAR_Z[1], half), RAKE_ROUND, STEEL, along="z")
    centre = clamp_bezier(
        (side * PRONG_TIP_X, 0.0), (side * PRONG_ROOT[0], PRONG_HOOK), (side * PRONG_ROOT[0], PRONG_ROOT[1]),
        clamp_tip_ts(10, 5),
    )
    lengths = clamp_lengths(centre)
    # Slightly slimmer towards the tip, which rounds off in a blunt dome.
    radii = [PRONG_RADIUS * (0.85 + 0.15 * min(1.0, s / 0.004)) * blunt_nose(s, 0.0006) for s in lengths]
    for k in range(count):
        y = -0.5 * span + k * PRONG_PITCH
        loft(
            bm,
            [c + Vector((0.0, y, 0.0)) for c in centre],
            axis=(0, 1, 0),
            half_width=radii,
            half_thickness=radii,
            section=superellipse(8, 2.0),
            material=STEEL,
        )


def handle_angle(radius):
    """Angle from +z about the screw at which the +x handle's centreline is
    `radius` from the screw: where the ratchet bar roots, and (mirrored)
    where the catch sits on the other handle."""
    start, control, end = HANDLE
    points = bezier((start[0], 0, start[1]), (control[0], 0, control[1]), (end[0], 0, end[1]), 80)
    for a, b in zip(points, points[1:]):
        da, db = math.hypot(a.x, a.z - PIVOT_Z), math.hypot(b.x, b.z - PIVOT_Z)
        if (da - radius) * (db - radius) <= 0:
            f = (radius - da) / (db - da) if db != da else 0.0
            return math.atan2(a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f - PIVOT_Z)
    return 0.0


def arc_point(phi, r):
    """(x, z) at angle `phi` from +z and distance `r` from the screw."""
    return (r * math.sin(phi), PIVOT_Z + r * math.cos(phi))


def ratchet(bm, phi_root, phi_catch):
    """The curved bar on the +x handle, from inside it across past the
    catch, with sawteeth on its outer edge where the catch rides."""
    phi_end = phi_catch - OPEN_MAX
    r_in, r_out = RATCHET_RADIUS - RATCHET_HALF_WIDTH, RATCHET_RADIUS + RATCHET_HALF_WIDTH
    tooth = TOOTH_PITCH / r_out  # one tooth, in radians
    teeth_from = phi_catch + tooth
    outline = []
    smooth = max(2, int((phi_root - teeth_from) / math.radians(4)) + 1)
    for k in range(smooth):
        outline.append(arc_point(phi_root + (teeth_from - phi_root) * k / smooth, r_out))
    teeth = int((teeth_from - phi_end) / tooth)
    for k in range(teeth):
        phi = teeth_from - k * tooth
        outline.append(arc_point(phi, r_out))  # the valley
        outline.append(arc_point(phi - 0.75 * tooth, r_out + TOOTH_HEIGHT))  # the crest
    outline.append(arc_point(teeth_from - teeth * tooth, r_out))
    outline.append(arc_point(phi_end, r_out))
    back = max(2, int((phi_root - phi_end) / math.radians(4)) + 1)
    for k in range(back + 1):
        outline.append(arc_point(phi_end + (phi_root - phi_end) * k / back, r_in))
    plate(bm, outline, -RATCHET_HALF_THICK, RATCHET_HALF_THICK, STEEL)


def catch(bm, phi_catch):
    """The catch on the -x handle: a sleeve round the bar, following its arc."""
    r = RATCHET_RADIUS + 0.5 * TOOTH_HEIGHT
    points = [arc_point(phi_catch + math.radians(d), r) for d in (4.5, 2.0, -2.0, -4.5)]
    loft(
        bm,
        [Vector((x, 0.0, z)) for x, z in points],
        axis=(0, 1, 0),
        half_width=1.0,
        half_thickness=1.0,
        section=rounded_rect(RATCHET_HALF_WIDTH + 0.5 * TOOTH_HEIGHT + 0.0007, RATCHET_HALF_THICK + 0.0006, 0.0005),
        material=STEEL,
    )


def half(bm, side, prongs):
    """Rake, arm and disc on `side`, handle and ring on the other side; the
    disc in the layer on the same side of y = 0 as the arm is of x = 0."""
    rake(bm, side, prongs)
    bar(bm, side, side, ARM, ARM_WIDTH, ARM_THICK, foot=ARM_FOOT)
    disc(bm, side)
    bar(bm, -side, side, HANDLE, HANDLE_WIDTH, HANDLE_THICK)
    return finger_ring(bm, -side, SHANK_END, RING_A, RING_B, RING_JOIN, STEEL, RING_HW, RING_HT)


def build():
    phi_root = handle_angle(RATCHET_RADIUS)
    upper = bmesh.new()  # arm on +x; handle, ring and catch on -x
    ring_centre = half(upper, 1, PRONGS_UPPER)
    screw_head(upper, PIVOT_Z, LAYER_CLEAR + 2 * LAYER, 0.0020, DARK)
    catch(upper, -phi_root)
    lower = bmesh.new()  # arm on -x; handle, ring and ratchet bar on +x
    half(lower, -1, PRONGS_LOWER)
    ratchet(lower, phi_root, -phi_root)
    # The prongs' blunt domes dip a fraction of a millimetre below the tips'
    # centreline; lift the whole instrument so its lowest point, the working
    # end, sits on the origin.
    lift = -clamp_lowest([upper, lower])
    for bm in (upper, lower):
        clamp_shift(bm, 0.0, lift)

    upper_half = finish(upper, ASSET + "_upper", MATERIALS)
    lower_half = finish(lower, ASSET + "_lower", MATERIALS)
    pivot = (0.0, PIVOT_Z + lift, 0.0)
    return [
        upper_half,
        lower_half,
        hinge("jaw_upper", pivot, [upper_half]),
        hinge("jaw_lower", pivot, [lower_half]),
        # Between the rings, where thumb and ring finger hold it.
        empty("grip_point", (0.0, ring_centre + lift, 0.0)),
    ]
