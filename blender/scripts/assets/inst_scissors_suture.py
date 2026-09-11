# kit: kit_instruments.py
# kit: kit_scissors.py
"""
inst_scissors_suture: straight suture scissors, about 14.5 cm, shown shut,
with a working hinge.

Runs with blender/scripts/kit.py, kit_shapes.py, kit_instruments.py and
kit_scissors.py prepended (see build.py), so their helpers and imports are
already in scope. Draws the `suture_scissors` tool mesh. Coordinates here are
Blender's: tip at the origin, body up +Z, blades opening along X, thickness
along Y.

Built on the straight Mayo pattern: heavy, straight blades about a third of
its length with blunt, semi-rounded tips, a flat screw joint and plain rings.
Two rigid halves cross at the screw, each with its blade, its share of the
joint and the root of its shank in its own layer through the thickness, and
its shank and ring on the other side of the midline. Each hangs from its own
pivot at the screw (`jaw_upper` carries the half whose blade swings to +x).

What tells it from its look-alikes at a glance: blades that run dead
straight, where the Mayo and Metzenbaum curve, and a heavier build than the
Metzenbaum's short fine blades on long shanks. It is a centimetre shorter
than the curved Mayo. Haemostats and needle holders have a box lock and a
ratchet where scissors have a flat screw joint.
"""

# TODO(clinical review): straight Mayo pattern assumed for the tray's "suture scissors" (short straight scissors kept for cutting suture ends only).

ASSET = "inst_scissors_suture"
MATERIALS = ["steel", "steelDark"]
STEEL, DARK = 0, 1

# Heights up the instrument from the tip, in metres: 14.5 cm overall, with
# the screw 5.1 cm up, so the blades are about a third of the length.
SCREW_Z = 0.051

# One blade: (tip, root) half-width and full thickness, and the length of its
# nose, shorter than the tip's half-width so the end is blunt rather than a
# full semicircle. BLADE_POWER under 1 keeps the blade broad toward the tip.
BLADE_WIDTH = (0.0019, 0.0043)
BLADE_THICKNESS = (0.00085, 0.00185)
NOSE = 0.0015
BLADE_POWER = 0.8

# Each half's share of the joint: a flat round plate on the screw.
JOINT_R, JOINT_T = 0.0049, 0.0019
SCREW_RADIUS = 0.0020

# Shanks: Bezier (x, z) points as for the +x side, (start, end) half-sizes,
# and the stretch (path fractions) over which each moves onto y = 0.
SHANK_START = (0.0013, 0.050)
SHANK_CONTROL = (0.0045, 0.098)
SHANK_END = (0.0112, 0.1256)
SHANK_WIDTH = (0.0025, 0.0018)
SHANK_THICKNESS = (0.00155, 0.0014)
SHANK_BLEND = (0.22, 0.5)

# Finger rings: half-width and half-height of the centreline, where the shank
# joins it (radians from +x, anticlockwise), and the ring's half-sizes.
RING_A, RING_B = 0.0090, 0.0100
RING_JOIN = math.radians(235)
RING_WIRE = (0.0016, 0.0015)


def half(bm, layer, side):
    """One half: its blade and joint plate in `layer`, its shank and ring on
    `side`. Returns the height of the ring's centre."""
    zs = scissor_blade_heights(SCREW_Z, NOSE, 22)
    xs = scissor_curve_x(zs, 0.0, SCREW_Z)  # straight
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
