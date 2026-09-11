# kit: kit_forceps.py
"""
inst_forceps_adson_toothed: Adson tissue forceps with 1x2 teeth, 12 cm,
modelled shut, with a working spring.

Runs with blender/scripts/kit.py, kit_shapes.py and kit_forceps.py prepended
(see build.py), so their helpers and imports are already in scope. Draws the
`adson_toothed` tool mesh. Coordinates here are Blender's: tip at the origin,
body up +Z, width along X, thickness along Y.

Two limbs of flat spring steel face each other through the thickness and
join at the top, as in the real instrument. Each limb carries its half of the
joint block and hangs from its own pivot where the slit between them closes:
`jaw_upper` carries the -Y limb (app +z) and `jaw_lower` the +Y limb. The app
turns them apart about x, which springs the tips open.

What a student reads at a glance, and what sets it apart from the plain Adson
and the DeBakey: the broad serrated grip ending in an abrupt shoulder, the
short slim tip section, and at the tip the limbs' ends turned in as hooked
teeth, a single tooth on one limb meshing between two on the other.
"""

ASSET = "inst_forceps_adson_toothed"
MATERIALS = ["steel", "steelDark"]
STEEL, DARK = 0, 1

# The teeth are the bottom BAND of each limb, turned in towards the other;
# above it the limbs end square.
BAND = 0.0012
TOOTH_REACH = 0.0007  # how far each tooth's point crosses the midline
ONE_TOOTH = 0.00026  # half-width of the single tooth, on the midline
TWO_TEETH_X, TWO_TEETH = 0.00049, 0.0002  # centres (either side) and half-width of the pair
END_ROUND = 0.0002  # with nose_least 1 the end keeps its full width: square

TOP_ROUND = 0.0042  # the top end is rounded off nearly to a semicircle


def build():
    profile = forceps_limb_profile(
        forceps_adson_outline(),
        FORCEPS_ADSON_THICKNESS,
        FORCEPS_ADSON_LENGTH,
        FORCEPS_ADSON_JOINT,
        FORCEPS_ADSON_GAP,
        FORCEPS_ADSON_ARCH,
        END_ROUND,
        TOP_ROUND,
        start=BAND,
        nose_least=1.0,
    )
    grip_bottom, grip_top, pitch = FORCEPS_ADSON_GRIP

    upper = bmesh.new()  # the -Y limb, with the single tooth
    forceps_limb(upper, -1, profile, STEEL)
    forceps_grip_serrations(upper, -1, profile, grip_bottom, grip_top, pitch, DARK)
    forceps_tooth(upper, -1, profile, 0.0, ONE_TOOTH, BAND, TOOTH_REACH, STEEL)

    lower = bmesh.new()  # the +Y limb, with the pair the single tooth fits between
    forceps_limb(lower, 1, profile, STEEL)
    forceps_grip_serrations(lower, 1, profile, grip_bottom, grip_top, pitch, DARK)
    for x in (-TWO_TEETH_X, TWO_TEETH_X):
        forceps_tooth(lower, 1, profile, x, TWO_TEETH, BAND, TOOTH_REACH, STEEL)

    upper_limb = finish(upper, ASSET + "_upper", MATERIALS)
    lower_limb = finish(lower, ASSET + "_lower", MATERIALS)
    pivot = (0.0, FORCEPS_ADSON_JOINT, 0.0)
    return [
        upper_limb,
        lower_limb,
        hinge("jaw_upper", pivot, [upper_limb]),
        hinge("jaw_lower", pivot, [lower_limb]),
        # Mid-way up the serrated finger area, where thumb and fingers press.
        empty("grip_point", (0.0, (grip_bottom + grip_top) / 2, 0.0)),
    ]
