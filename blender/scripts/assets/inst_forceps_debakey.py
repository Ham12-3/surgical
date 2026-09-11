# kit: kit_forceps.py
"""
inst_forceps_debakey: DeBakey atraumatic tissue forceps, about 15.5 cm,
modelled shut, with a working spring.

Runs with blender/scripts/kit.py, kit_shapes.py and kit_forceps.py prepended
(see build.py), so their helpers and imports are already in scope. Draws the
`debakey_forceps` tool mesh. Coordinates here are Blender's: tip at the
origin, body up +Z, width along X, thickness along Y.

Two limbs of flat spring steel joined at the top, each hanging from its own
pivot where the slit between them closes (`jaw_upper` carries the -Y limb),
built as inst_forceps_adson_toothed.py is.

What a student reads at a glance, against the Adsons: longer, and slim all
the way, with no shoulder: the limbs taper gently over most of their length
to tips about 2 mm wide. At the tips, fine longitudinal rows of small teeth
that interlock, one central row on one limb between two rows on the other
(the DeBakey pattern), and a serrated finger grip up the handle.
"""

ASSET = "inst_forceps_debakey"
MATERIALS = ["steel", "steelDark"]
STEEL, DARK = 0, 1

LENGTH = 0.155
JOINT = 0.143  # where the slit closes under the joint block: the pivot
GAP = 0.0008  # each inner face's distance from the midline at the slit's top
ARCH = 0.0015

# (height, half-width): 2 mm across at the tip, widening evenly to about
# 6.3 mm across the grip, with no shoulder anywhere.
OUTLINE = [
    (0.0, 0.0010),
    (0.015, 0.00108),
    (0.030, 0.00126),
    (0.045, 0.00152),
    (0.060, 0.00185),
    (0.075, 0.00222),
    (0.090, 0.0026),
    (0.105, 0.00292),
    (0.120, 0.00312),
    (0.135, 0.00318),
    (LENGTH, 0.00305),
]
THICKNESS = [(0.0, 0.0011), (0.040, 0.00122), (0.080, 0.0013), (LENGTH, 0.0013)]
NOSE, NOSE_LEAST, NOSE_THIN = 0.0008, 0.3, 0.8
TOP_ROUND = 0.003

GRIP_BOTTOM, GRIP_TOP, GRIP_PITCH = 0.088, 0.134, 0.0013

# The jaw pattern: rows of small teeth up the inner faces of the tips, one
# row on the midline of the -Y limb, two either side of it on the +Y limb.
# TODO(clinical review): how far up the tips the pattern runs (2.2 cm here)
# and its tooth pitch have not been checked against a reference instrument.
ROW_BOTTOM, ROW_TOP, ROW_PITCH = 0.0008, 0.022, 0.0004
ONE_ROW = [0.0]
TWO_ROWS = [-0.00048, 0.00048]


def build():
    profile = forceps_limb_profile(
        OUTLINE, THICKNESS, LENGTH, JOINT, GAP, ARCH, NOSE, TOP_ROUND,
        nose_least=NOSE_LEAST, nose_thin=NOSE_THIN,
    )

    upper = bmesh.new()  # the -Y limb, with the single row
    forceps_limb(upper, -1, profile, STEEL)
    forceps_grip_serrations(upper, -1, profile, GRIP_BOTTOM, GRIP_TOP, GRIP_PITCH, DARK)
    forceps_tooth_rows(upper, -1, profile, ONE_ROW, ROW_BOTTOM, ROW_TOP, ROW_PITCH, DARK)

    lower = bmesh.new()  # the +Y limb, with the two rows the single one fits between
    forceps_limb(lower, 1, profile, STEEL)
    forceps_grip_serrations(lower, 1, profile, GRIP_BOTTOM, GRIP_TOP, GRIP_PITCH, DARK)
    forceps_tooth_rows(lower, 1, profile, TWO_ROWS, ROW_BOTTOM, ROW_TOP, ROW_PITCH, DARK)

    upper_limb = finish(upper, ASSET + "_upper", MATERIALS)
    lower_limb = finish(lower, ASSET + "_lower", MATERIALS)
    pivot = (0.0, JOINT, 0.0)
    return [
        upper_limb,
        lower_limb,
        hinge("jaw_upper", pivot, [upper_limb]),
        hinge("jaw_lower", pivot, [lower_limb]),
        # Mid-way up the serrated finger area, where thumb and fingers press.
        empty("grip_point", (0.0, (GRIP_BOTTOM + GRIP_TOP) / 2, 0.0)),
    ]
