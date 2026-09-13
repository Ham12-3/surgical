# kit: kit_forceps.py
"""
inst_forceps_adson_plain: Adson tissue forceps without teeth (non-toothed),
12 cm, modelled shut, with a working spring.

Runs with blender/scripts/kit.py, kit_shapes.py and kit_forceps.py prepended
(see build.py), so their helpers and imports are already in scope. Draws the
`adson_plain` tool mesh. Coordinates here are Blender's: tip at the origin,
body up +Z, width along X, thickness along Y.

Built as inst_forceps_adson_toothed.py is, on the same Adson outline from
kit_forceps.py: two limbs of flat spring steel joined at the top, each
hanging from its own pivot where the slit between them closes (`jaw_upper`
carries the -Y limb). What sets it apart from the toothed Adson is only the
tip: blunt, rounded ends with fine transverse serrations across the inner
faces, which interleave when shut. From the DeBakey it differs as the toothed
one does: the broad grip, the abrupt shoulder and the short slim tip.
"""

ASSET = "inst_forceps_adson_plain"
MATERIALS = ["steel", "steelDark"]
STEEL, DARK = 0, 1

# The rounded, blunt tip end.
NOSE, NOSE_LEAST, NOSE_THIN = 0.0006, 0.35, 0.8
TOP_ROUND = 0.0042

# Fine serrations across the inner faces of the tips, from just above the
# nose to about 1 cm up. The +Y limb's start half a pitch higher.
SERRATION_BOTTOM, SERRATION_TOP = 0.0003, 0.0102
SERRATION_PITCH = 0.00045


def build():
    profile = forceps_limb_profile(
        forceps_adson_outline(),
        FORCEPS_ADSON_THICKNESS,
        FORCEPS_ADSON_LENGTH,
        FORCEPS_ADSON_JOINT,
        FORCEPS_ADSON_GAP,
        FORCEPS_ADSON_ARCH,
        NOSE,
        TOP_ROUND,
        nose_least=NOSE_LEAST,
        nose_thin=NOSE_THIN,
    )
    grip_bottom, grip_top, pitch = FORCEPS_ADSON_GRIP

    upper = bmesh.new()  # the -Y limb
    forceps_limb(upper, -1, profile, STEEL)
    forceps_grip_serrations(upper, -1, profile, grip_bottom, grip_top, pitch, DARK)
    forceps_tip_serrations(upper, -1, profile, SERRATION_BOTTOM, SERRATION_TOP, SERRATION_PITCH, DARK)

    lower = bmesh.new()  # the +Y limb
    forceps_limb(lower, 1, profile, STEEL)
    forceps_grip_serrations(lower, 1, profile, grip_bottom, grip_top, pitch, DARK)
    half = SERRATION_PITCH / 2
    forceps_tip_serrations(lower, 1, profile, SERRATION_BOTTOM + half, SERRATION_TOP - half, SERRATION_PITCH, DARK)

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
