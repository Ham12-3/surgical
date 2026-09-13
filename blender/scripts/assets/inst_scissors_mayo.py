# kit: kit_instruments.py
# kit: kit_scissors.py
"""
inst_scissors_mayo: curved Mayo scissors, about 15.5 cm, shown shut, with a
working hinge.

Runs with blender/scripts/kit.py, kit_shapes.py, kit_instruments.py and
kit_scissors.py prepended (see build.py), so their helpers and imports are
already in scope. Draws the `mayo_scissors` tool mesh. Coordinates here are
Blender's: tip at the origin, body up +Z, blades opening along X, thickness
along Y.

Two rigid halves cross at a flat screw joint, as in the real instrument: each
has its blade, its share of the joint and the root of its shank in its own
layer through the thickness, and its shank and ring on the other side of the
midline. Each hangs from its own pivot at the screw (`jaw_upper` carries the
half whose blade swings to +x), so turning the pivots apart opens the blades
and spreads the rings.

What tells a Mayo from its look-alikes at a glance: a heavy build, with
broad, thick blades about a third of its length ending in blunt,
semi-rounded tips, curved to one side, and a big joint. A Metzenbaum is
slimmer, with short fine blades on long shanks; the straight suture scissors
share this pattern but their blades run straight; haemostats and needle
holders have a box lock and a ratchet where scissors have a flat screw joint.

The blades curve toward +x. Which blade lies uppermost relative to the curve
(the right- or left-handed pattern) follows no checked reference.
"""

# TODO(clinical review): the handed pattern (which blade lies uppermost relative to the curve) has not been checked against a reference instrument.

ASSET = "inst_scissors_mayo"
MATERIALS = ["steel", "steelDark"]
STEEL, DARK = 0, 1

# Heights up the instrument from the tip, in metres: 15.5 cm overall, with
# the screw 5.5 cm up, so the blades are about a third of the length.
SCREW_Z = 0.0555

# How far the curve carries the tips sideways from the instrument's axis, and
# the height where the curve starts, just below the joint.
BEND = 0.0065
BEND_TOP = 0.051

# One blade: (tip, root) half-width and full thickness, and the length of its
# nose, shorter than the tip's half-width so the end is blunt rather than a
# full semicircle. BLADE_POWER under 1 keeps the blade broad toward the tip.
BLADE_WIDTH = (0.0020, 0.0046)
BLADE_THICKNESS = (0.0009, 0.00195)
NOSE = 0.0016
BLADE_POWER = 0.8

# Each half's share of the joint: a flat round plate on the screw.
JOINT_R, JOINT_T = 0.0052, 0.0020
SCREW_RADIUS = 0.0021

# Shanks: Bezier (x, z) points as for the +x side, (start, end) half-sizes,
# and the stretch (path fractions) over which each moves onto y = 0.
SHANK_START = (0.0014, 0.0545)
SHANK_CONTROL = (0.0048, 0.104)
SHANK_END = (0.0118, 0.1346)
SHANK_WIDTH = (0.0026, 0.0018)
SHANK_THICKNESS = (0.0016, 0.00145)
SHANK_BLEND = (0.22, 0.5)

# Finger rings: half-width and half-height of the centreline, where the shank
# joins it (radians from +x, anticlockwise), and the ring's half-sizes.
RING_A, RING_B = 0.0092, 0.0102
RING_JOIN = math.radians(235)
RING_WIRE = (0.0017, 0.0015)


def half(bm, layer, side):
    """One half: its blade and joint plate in `layer`, its shank and ring on
    `side`. Returns the height of the ring's centre."""
    zs = scissor_blade_heights(SCREW_Z, NOSE, 26)
    xs = scissor_curve_x(zs, BEND, BEND_TOP)
    scissor_blade(bm, layer, zs, xs, BLADE_WIDTH, BLADE_THICKNESS, NOSE, STEEL, BLADE_POWER)
    face_y = scissor_joint(bm, layer, SCREW_Z, JOINT_R, JOINT_T, STEEL)
    scissor_screw(bm, SCREW_Z, face_y, SCREW_RADIUS, DARK)
    # The shank root is a shade thinner than the joint plate, so its faces
    # stay buried inside the plate rather than fighting with it.
    scissor_shank(bm, side, layer, SHANK_START, SHANK_CONTROL, SHANK_END, SHANK_WIDTH, SHANK_THICKNESS, 0.9 * JOINT_T, SHANK_BLEND, STEEL)
    return finger_ring(bm, side, SHANK_END, RING_A, RING_B, RING_JOIN, STEEL, RING_WIRE[0], RING_WIRE[1])


def build():
    upper = bmesh.new()  # blade in +y, swings to +x; shank and ring on -x
    half(upper, 1, -1)
    lower = bmesh.new()  # blade in -y, swings to -x; shank and ring on +x
    ring_centre = half(lower, -1, 1)
    # Built about x = 0 with the tips at +BEND; shift so the tips sit on the
    # origin, where the tool controller drops the working end.
    for part in (upper, lower):
        bmesh.ops.translate(part, vec=Vector((-BEND, 0.0, 0.0)), verts=part.verts[:])

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
