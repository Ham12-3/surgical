# kit: kit_instruments.py
# kit: kit_clamps.py
"""
inst_towel_clip_backhaus: Backhaus towel clip, 11 cm, shut on its first
ratchet tooth, with a working hinge.

Runs with kit.py, kit_shapes.py, kit_instruments.py and kit_clamps.py
prepended (see build.py). Draws the `towel_clip` tool mesh. Coordinates are
Blender's: tip at the origin, body up +Z, jaws opening along X, thickness
along Y.

Two rigid halves cross at a small box joint, as in the haemostats, each
hung from its own pivot at the screw (`jaw_upper` carries the +x jaw). What tells
it apart at a glance: short, stout jaws curved so strongly that together
they trace a near-circle under the joint, ending in sharp points that meet
on the midline at the bottom of it. It is also the smallest of the ringed
clamps, at 11 cm.

The joint is drawn as a box lock, which many Backhaus clips have; others
have a plain screw joint.
"""

ASSET = "inst_towel_clip_backhaus"
MATERIALS = ["steel", "steelDark"]
STEEL, DARK = 0, 1

# Heights up the instrument from the tip, in metres (11 cm overall).
TOP = 0.110
LOCK_BOTTOM, LOCK_TOP = 0.0126, 0.0212
SCREW_Z = 0.0169
LOCK_HALF_WIDTH, LOCK_HALF_THICKNESS = 0.0030, 0.0019

# Jaws (tines): each follows one side of a circle of centreline radius
# RADIUS standing on the origin, from the top of it (hidden in the box, where
# the two tines meet) round to just short of the bottom, where the points
# meet. The inner edges leave a round opening about 11 mm across.
RADIUS = 0.0066
TINE_START = math.radians(90)
TINE_END = math.radians(-89.3)
TINE_STEPS = 40
TINE_WIDTH = 0.00105  # half-size in the ring plane, at the root
TINE_THICK = 0.00100  # half-size across it
TAPER = 0.42  # the last fraction of the tine that tapers to its point

# Finger rings, shanks and ratchet: as the haemostats, scaled down.
RING_A, RING_B = 0.0078, 0.0088
RING_HW, RING_HT = 0.0013, 0.0012
RING_JOIN = math.radians(235)
RING_INNER = 0.0042
SHANK_END, RING_Z = clamp_ring_join(RING_INNER, TOP, RING_A, RING_B, RING_HW, RING_JOIN)
SHANK = ((0.0019, LOCK_TOP - 0.0013), (0.0030, 0.058), SHANK_END)
SHANK_WIDTH, SHANK_THICKNESS = (0.00155, 0.00125), (0.0013, 0.0012)
RATCHET = (0.0825, 3, 0.0012, 0.0014, 0.0003, 0.0010)


def tine(bm, side):
    """The curved jaw on `side`, from its point up round the circle into the
    box. Stations crowd towards the point, where it tapers."""
    thetas = [TINE_END + (TINE_START - TINE_END) * u for u in clamp_tip_ts(TINE_STEPS - 6, 6)]
    points = [Vector((side * RADIUS * math.cos(a), 0.0, RADIUS + RADIUS * math.sin(a))) for a in thetas]
    lengths = clamp_lengths(points)
    zone = TAPER * lengths[-1]
    scale = [max(0.04, min(1.0, s / zone) ** 0.75) for s in lengths]
    loft(
        bm,
        points,
        axis=(0, 1, 0),
        half_width=[TINE_WIDTH * k for k in scale],
        half_thickness=[TINE_THICK * k for k in scale],
        section=superellipse(12, 2.4),
        material=STEEL,
    )


def handle(bm, side):
    return clamp_handle(
        bm, side, SHANK, SHANK_WIDTH, SHANK_THICKNESS,
        (RING_A, RING_B, RING_JOIN, RING_HW, RING_HT), RATCHET, STEEL,
    )


def build():
    upper = bmesh.new()  # tine on +x; shank, ring and ratchet bar on -x
    tine(upper, 1)
    box_lock(
        upper, LOCK_BOTTOM, LOCK_TOP, SCREW_Z, LOCK_HALF_WIDTH, LOCK_HALF_THICKNESS,
        STEEL, DARK, screw_radius=0.0014, rounding=0.0011,
    )
    ring_centre = handle(upper, -1)
    lower = bmesh.new()  # tine on -x; shank, ring and ratchet bar on +x
    tine(lower, -1)
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
