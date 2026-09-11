# kit: kit_instruments.py
"""
inst_needle_holder_mayo_hegar: needle holder, Mayo-Hegar pattern, closed on
its ratchet, with a working hinge.

Runs with blender/scripts/kit.py, kit_shapes.py and kit_instruments.py
prepended (see build.py), so their helpers and imports are already in scope.
Draws the `needle_holder` tool mesh (see assets/manifest.json). Coordinates
here are Blender's: tip at the origin, body up +Z, jaws opening along X,
thickness along Y. The kit's app() maps the instrument's own axes (x across
the jaws, y along the body, z through it) onto the same thing, which is what
hinge() and empty() take.

Two rigid halves cross at the box lock, as in the real instrument: each has a
jaw on one side of the midline and its shank and ring on the other. Each hangs
from its own pivot at the screw (`jaw_upper` carries the +x jaw), so turning
the pivots apart opens the jaws and spreads the rings.

Recognisable rather than exact, like the procedural instruments. What a
student needs to read at a glance is short, heavy jaws with a dark grip
insert, a box lock, and a ratchet between the rings.
"""

ASSET = "inst_needle_holder_mayo_hegar"
MATERIALS = ["steel", "steelDark"]
STEEL, DARK = 0, 1

# Heights up the instrument from the tip, in metres. Overall length and ring
# spread match the procedural model, so the tray layout still fits.
JAW_TOP = 0.019
LOCK_BOTTOM, LOCK_TOP = 0.0175, 0.0305
SCREW_Z = 0.024
SHANK_END = (0.0125, 0.098)  # (x, z) where each shank meets its ring
RATCHET_Z = 0.089

# Half the gap between the two jaw halves, filled by the dark grip insert.
INSERT_GAP = 0.00025

# Finger rings: half-width and half-height of the ring's centreline, and the
# angle round the ring (from +x, anticlockwise) where the shank joins it.
RING_A, RING_B = 0.0098, 0.0108
RING_JOIN = math.radians(235)

# Where a needle is gripped, close to the jaw tips. The needle is its own
# model, attached here at run time.
# TODO(clinical review): which side the needle's point faces for a
# right-handed forehand pass has not been checked against a reference.
NEEDLE_Z = 0.0035


def jaw(bm, side):
    # One D-section jaw on the `side` of the midline, tapering to the blunt
    # nose, with its half of the dark grip insert along its inner face.
    zs = [0.0, 0.0002, 0.0005, 0.001, 0.0016, 0.003, 0.006, 0.010, 0.014, JAW_TOP]
    nose = [blunt_nose(z, 0.0016) for z in zs]
    beak = [(0.0017 + 0.0019 * (z / JAW_TOP) ** 1.2) * n for z, n in zip(zs, nose)]
    depth = [(0.0014 + 0.0010 * z / JAW_TOP) * n for z, n in zip(zs, nose)]
    gap = [INSERT_GAP * n for n in nose]
    loft(
        bm,
        [(side * g, 0, z) for g, z in zip(gap, zs)],
        axis=(0, side, 0),  # flips the side direction to -x for the left jaw
        half_width=[b - g for b, g in zip(beak, gap)],
        half_thickness=depth,
        section=half_superellipse(10, 3.0),
        material=STEEL,
    )
    # The insert fills this jaw's half of the gap and just crosses the
    # midline, so the closed jaws show one unbroken dark line; it sits a
    # little below the jaw faces so it reads as a groove.
    loft(
        bm,
        [(side * g / 2, 0, z) for g, z in zip(gap[3:], zs[3:])],
        axis=(0, 1, 0),
        half_width=[g / 2 + 0.00003 for g in gap[3:]],
        half_thickness=[0.86 * d for d in depth[3:]],
        section=superellipse(8, 6.0),
        material=DARK,
    )


def half(bm, side):
    """The shank, ring and ratchet bar on `side`: the handle end of the half
    whose jaw is on the other side."""
    shank(bm, side, (0.0024, 0.0285), (0.0040, 0.066), SHANK_END, (0.0021, 0.0016), (0.0017, 0.0015), STEEL)
    ring_centre = finger_ring(bm, side, SHANK_END, RING_A, RING_B, RING_JOIN, STEEL)
    ratchet_bar(bm, side, RATCHET_Z, STEEL)
    return ring_centre


def build():
    upper = bmesh.new()  # jaw on +x; shank, ring and ratchet bar on -x
    jaw(upper, 1)
    box_lock(upper, LOCK_BOTTOM, LOCK_TOP, SCREW_Z, 0.0048, 0.0029, STEEL, DARK, screw_radius=0.0021)
    ring_centre = half(upper, -1)
    lower = bmesh.new()  # jaw on -x; shank, ring and ratchet bar on +x
    jaw(lower, -1)
    half(lower, 1)

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
        empty("needle_grip", (0.0, NEEDLE_Z, 0.0)),
    ]
