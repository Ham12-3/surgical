# kit: kit_instruments.py
# kit: kit_scissors.py
"""
inst_scissors_metzenbaum: curved Metzenbaum dissecting scissors, about
14.5 cm, shown shut, with a working hinge.

Runs with blender/scripts/kit.py, kit_shapes.py, kit_instruments.py and
kit_scissors.py prepended (see build.py), so their helpers and imports are
already in scope. Draws the `metzenbaum_scissors` tool mesh. Coordinates here
are Blender's: tip at the origin, body up +Z, blades opening along X,
thickness along Y.

Two rigid halves cross at a flat screw joint, as in the real instrument: each
has its blade, its share of the joint and the root of its shank in its own
layer through the thickness, and its shank and ring on the other side of the
midline. Each hangs from its own pivot at the screw (`jaw_upper` carries the
half whose blade swings to +x), so turning the pivots apart opens the blades
and spreads the rings.

What tells a Metzenbaum from its look-alikes at a glance: long, slender
shanks and short, fine blades, about a quarter of its length, curving gently
to one side and ending in small rounded tips. Mayo scissors have broad, heavy
blades a third of their length; haemostats and needle holders have jaws, a
box lock and a ratchet where scissors have a flat screw joint and nothing
between the rings.

The blades curve toward +x. Which blade lies uppermost relative to the curve
(the right- or left-handed pattern) follows no checked reference.
"""

# TODO(clinical review): the handed pattern (which blade lies uppermost relative to the curve) has not been checked against a reference instrument.

ASSET = "inst_scissors_metzenbaum"
MATERIALS = ["steel", "steelDark"]
STEEL, DARK = 0, 1

# Heights up the instrument from the tip, in metres: 14.5 cm overall, with
# the screw about 4 cm up, so the blades are about a quarter of the length.
SCREW_Z = 0.0395

# How far the curve carries the tips sideways from the instrument's axis, and
# the height where the curve starts, just below the joint.
BEND = 0.0045
BEND_TOP = 0.036

# One blade: (tip, root) half-width and full thickness, and the length of its
# rounded nose. Fine: under 2 mm across at the tip.
BLADE_WIDTH = (0.0009, 0.0028)
BLADE_THICKNESS = (0.0005, 0.0013)
NOSE = 0.0009

# Each half's share of the joint: a flat round plate on the screw.
JOINT_R, JOINT_T = 0.0034, 0.00135
SCREW_RADIUS = 0.0015

# Shanks: Bezier (x, z) points as for the +x side, (start, end) half-sizes,
# and the stretch (path fractions) over which each moves onto y = 0. Long and
# slim, parting in a narrow V until they turn out into the rings.
SHANK_START = (0.0010, 0.0385)
SHANK_CONTROL = (0.0034, 0.092)
SHANK_END = (0.0103, 0.1257)
SHANK_WIDTH = (0.0017, 0.00135)
SHANK_THICKNESS = (0.00115, 0.00108)
SHANK_BLEND = (0.22, 0.5)

# Finger rings: half-width and half-height of the centreline, where the shank
# joins it (radians from +x, anticlockwise), and the ring's half-sizes.
RING_A, RING_B = 0.0088, 0.0098
RING_JOIN = math.radians(235)
RING_WIRE = (0.00145, 0.00125)


def half(bm, layer, side):
    """One half: its blade and joint plate in `layer`, its shank and ring on
    `side`. Returns the height of the ring's centre."""
    zs = scissor_blade_heights(SCREW_Z, NOSE, 26)
    xs = scissor_curve_x(zs, BEND, BEND_TOP)
    scissor_blade(bm, layer, zs, xs, BLADE_WIDTH, BLADE_THICKNESS, NOSE, STEEL)
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
