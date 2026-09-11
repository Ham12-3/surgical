# kit: kit_instruments.py
# kit: kit_clamps.py
"""
inst_haemostat_mosquito: curved Halsted mosquito haemostat, 12.5 cm, shut on
its first ratchet tooth, with a working hinge.

Runs with kit.py, kit_shapes.py, kit_instruments.py and kit_clamps.py
prepended (see build.py). Draws the `mosquito_clamp` tool mesh. Coordinates
are Blender's: tip at the origin, body up +Z, jaws opening along X, thickness
along Y.

The same pattern as inst_haemostat_kelly.py, two rigid halves crossing at a
box lock, each hung from its own pivot at the screw (`jaw_upper` carries the
+x jaw), built delicate:
- shorter overall (12.5 cm against the Kelly's 14), on slimmer shanks, with
  a smaller box lock and rings;
- very fine, slender jaws that taper almost to a point, curved in the plane
  of the rings;
- serrated over the whole length of the jaws, where the Kelly is serrated
  over the distal half only.

As with the Kelly, it is built about its straight body axis and then shifted
so the curved tip lands on the origin; the joint sits at x = -BEND.
"""

ASSET = "inst_haemostat_mosquito"
MATERIALS = ["steel", "steelDark"]
STEEL, DARK = 0, 1

# Heights up the instrument from the tip, in metres (12.5 cm overall).
TOP = 0.125
JAW_TOP = 0.0235  # the jaw roots end inside the box lock
LOCK_BOTTOM, LOCK_TOP = 0.0220, 0.0305
SCREW_Z = 0.02625
LOCK_HALF_WIDTH, LOCK_HALF_THICKNESS = 0.0027, 0.0017

# The curve: leaves the box straight down and carries the tip BEND off the
# body axis, about 20 degrees off it at the tip, as the Kelly's.
BEND = 0.0040
CURVE_CONTROL = 0.5

# Jaw half-sizes, tip to root (see the Kelly): about half the Kelly's at
# the tip, which is what makes a mosquito look fine.
BEAK_TIP, BEAK_ROOT = 0.00055, 0.00160
DEPTH_TIP, DEPTH_ROOT = 0.00060, 0.00140
NOSE = 0.0008
FACE_GAP = 0.00009

# Serrations over the whole jaw, finer than the Kelly's.
SERRATION_PITCH = 0.0006
SERRATION_TOOTH = 0.00017

# Finger rings and shanks, as in the Kelly but lighter.
RING_A, RING_B = 0.0080, 0.0090
RING_HW, RING_HT = 0.0013, 0.0012
RING_JOIN = math.radians(235)
RING_INNER = 0.0045
SHANK_END, RING_Z = clamp_ring_join(RING_INNER, TOP, RING_A, RING_B, RING_HW, RING_JOIN)
SHANK = ((0.0017, LOCK_TOP - 0.0012), (0.0028, 0.071), SHANK_END)
SHANK_WIDTH, SHANK_THICKNESS = (0.00135, 0.00115), (0.00115, 0.00105)

# Ratchet: height, teeth, pitch, bar depth, tooth height, bar thickness.
RATCHET = (0.0965, 3, 0.0011, 0.0013, 0.0003, 0.0009)


def jaw_profile():
    """The jaw's centreline, tip to root, with its per-point sizes."""
    centre = clamp_bezier((BEND, 0.0), (0.0, CURVE_CONTROL * JAW_TOP), (0.0, JAW_TOP), clamp_tip_ts(20))
    lengths = clamp_lengths(centre)
    total = lengths[-1]
    nose = [blunt_nose(s, NOSE) for s in lengths]
    beak = [(BEAK_TIP + (BEAK_ROOT - BEAK_TIP) * (s / total) ** 1.3) * n for s, n in zip(lengths, nose)]
    depth = [(DEPTH_TIP + (DEPTH_ROOT - DEPTH_TIP) * (s / total) ** 1.1) * n for s, n in zip(lengths, nose)]
    gap = [FACE_GAP * n for n in nose]
    return centre, beak, depth, gap, total


def jaw(bm, side, profile):
    """The jaw half on `side`, serrated from the nose to the box."""
    centre, beak, depth, gap, total = profile
    clamp_jaw(bm, side, centre, beak, depth, gap, STEEL)
    showing = total - (JAW_TOP - LOCK_BOTTOM)
    clamp_serrations(
        bm, side, centre, depth, gap, 0.0006, showing - 0.0004,
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
    box_lock(
        upper, LOCK_BOTTOM, LOCK_TOP, SCREW_Z, LOCK_HALF_WIDTH, LOCK_HALF_THICKNESS,
        STEEL, DARK, screw_radius=0.0012, rounding=0.001,
    )
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
