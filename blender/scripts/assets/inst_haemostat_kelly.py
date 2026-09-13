# kit: kit_instruments.py
# kit: kit_clamps.py
"""
inst_haemostat_kelly: curved Kelly haemostat, 14 cm, shut on its first
ratchet tooth, with a working hinge.

Runs with kit.py, kit_shapes.py, kit_instruments.py and kit_clamps.py
prepended (see build.py). Draws the `kelly_clamp` tool mesh. Coordinates are
Blender's: tip at the origin, body up +Z, jaws opening along X, thickness
along Y.

Two rigid halves cross at the box lock, as in the needle holder: each has a
jaw on one side of the midline and its shank and ring on the other, and each
hangs from its own pivot at the screw (`jaw_upper` carries the +x jaw).

What tells it apart at a glance:
- from the mosquito: longer (14 cm against 12.5), with longer, heavier jaws,
  about a quarter of the length, and a bigger box lock;
- from a Crile, which is otherwise the same instrument: transverse
  serrations on the distal half of the jaws only, the proximal half smooth;
- from the needle holder: long, slim, curved jaws with no dark insert.

The jaws curve in the plane of the rings. The instrument is built about its
straight body axis and then shifted so the curved tip lands on the origin,
where the tool controller puts it; the joint therefore sits at x = -BEND.
"""

ASSET = "inst_haemostat_kelly"
MATERIALS = ["steel", "steelDark"]
STEEL, DARK = 0, 1

# Heights up the instrument from the tip, in metres (14 cm overall).
TOP = 0.140
JAW_TOP = 0.0365  # the jaw roots end inside the box lock
LOCK_BOTTOM, LOCK_TOP = 0.0345, 0.0455
SCREW_Z = 0.040
LOCK_HALF_WIDTH, LOCK_HALF_THICKNESS = 0.0034, 0.0022

# The curve: a quadratic Bezier leaving the box straight down and carrying
# the tip BEND off the body axis, about 20 degrees off it at the tip.
BEND = 0.0062
CURVE_CONTROL = 0.5  # height of the Bezier's control point, as a fraction of JAW_TOP

# Jaw half-sizes, tip to root: `beak` is one half's reach from the midline
# across the ring plane, `depth` its half-thickness in Y.
BEAK_TIP, BEAK_ROOT = 0.00120, 0.0023
DEPTH_TIP, DEPTH_ROOT = 0.00115, 0.0021
NOSE = 0.0015  # length over which the tip rounds off blunt
FACE_GAP = 0.00011  # each gripping face stands this far off the midline

# Serrations on the distal half of the jaws only, in the palette's dark
# steel: the fine grooves read darker than the polished jaw, so the shut
# jaws show a dark zigzag seam over the distal half and a plain one above.
SERRATION_PITCH = 0.0008
SERRATION_TOOTH = 0.00021

# Finger rings: centreline half-width and half-height, section half-sizes,
# where the shank joins (radians from +x), how far the ring's inner edge sits
# off the midline.
RING_A, RING_B = 0.0086, 0.0096
RING_HW, RING_HT = 0.00145, 0.00135
RING_JOIN = math.radians(235)
RING_INNER = 0.0048
SHANK_END, RING_Z = clamp_ring_join(RING_INNER, TOP, RING_A, RING_B, RING_HW, RING_JOIN)
SHANK = ((0.0021, LOCK_TOP - 0.0015), (0.0034, 0.085), SHANK_END)
SHANK_WIDTH, SHANK_THICKNESS = (0.0017, 0.00135), (0.00145, 0.0013)

# Ratchet: height, teeth, pitch, bar depth, tooth height, bar thickness.
RATCHET = (0.1095, 3, 0.0013, 0.0015, 0.00035, 0.0011)


def jaw_profile():
    """The jaw's centreline, tip to root, with its per-point sizes."""
    centre = clamp_bezier((BEND, 0.0), (0.0, CURVE_CONTROL * JAW_TOP), (0.0, JAW_TOP), clamp_tip_ts(22))
    lengths = clamp_lengths(centre)
    total = lengths[-1]
    nose = [blunt_nose(s, NOSE) for s in lengths]
    beak = [(BEAK_TIP + (BEAK_ROOT - BEAK_TIP) * (s / total) ** 1.1) * n for s, n in zip(lengths, nose)]
    depth = [(DEPTH_TIP + (DEPTH_ROOT - DEPTH_TIP) * s / total) * n for s, n in zip(lengths, nose)]
    gap = [FACE_GAP * n for n in nose]
    return centre, beak, depth, gap, total


def jaw(bm, side, profile):
    """The jaw half on `side`, serrated over the distal half of what shows
    below the box. The -x jaw's ridges sit half a pitch on, in the +x jaw's
    valleys."""
    centre, beak, depth, gap, total = profile
    clamp_jaw(bm, side, centre, beak, depth, gap, STEEL)
    showing = total - (JAW_TOP - LOCK_BOTTOM)
    clamp_serrations(
        bm, side, centre, depth, gap, 0.0009, 0.5 * showing,
        SERRATION_PITCH, SERRATION_TOOTH, DARK, phase=0.0 if side > 0 else 0.5,
    )


def handle(bm, side):
    return clamp_handle(
        bm, side, SHANK, SHANK_WIDTH, SHANK_THICKNESS,
        (RING_A, RING_B, RING_JOIN, RING_HW, RING_HT), RATCHET, STEEL,
    )


def build():
    profile = jaw_profile()
    upper = bmesh.new()  # jaw on +x; shank, ring and ratchet bar on -x
    jaw(upper, 1, profile)
    box_lock(upper, LOCK_BOTTOM, LOCK_TOP, SCREW_Z, LOCK_HALF_WIDTH, LOCK_HALF_THICKNESS, STEEL, DARK, screw_radius=0.0016)
    ring_centre = handle(upper, -1)
    lower = bmesh.new()  # jaw on -x; shank, ring and ratchet bar on +x
    jaw(lower, -1, profile)
    handle(lower, 1)
    for bm in (upper, lower):
        clamp_shift(bm, -BEND)

    upper_half = finish(upper, ASSET + "_upper", MATERIALS)
    lower_half = finish(lower, ASSET + "_lower", MATERIALS)
    pivot = (-BEND, SCREW_Z, 0.0)
    return [
        upper_half,
        lower_half,
        hinge("jaw_upper", pivot, [upper_half]),
        hinge("jaw_lower", pivot, [lower_half]),
        # Between the rings, where thumb and ring finger hold it.
        empty("grip_point", (-BEND, ring_centre, 0.0)),
    ]
