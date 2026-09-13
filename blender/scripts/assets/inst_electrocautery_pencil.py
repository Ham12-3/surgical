# kit: kit_moulded.py
"""
inst_electrocautery_pencil: disposable diathermy (electrosurgical) pencil
with a flat blade electrode, two hand-switch buttons and the start of its
cable.

Runs with kit.py, kit_shapes.py and kit_moulded.py prepended (see build.py).
Draws the `cautery` tool mesh. Coordinates are Blender's: the electrode's tip
at the origin, the pencil up +Z, the buttons on its top face toward -Y (app
+z, where the code-built stand-in puts them).

What sets it apart from a scalpel at a glance: a thick matte plastic body,
not a flat steel handle; a short blunt flat electrode, not a sharp blade; two
light buttons on top; and a cable leaving the back. From the Yankauer: it is
straight, opaque, and less than two thirds the length.

Only a 5 cm stub of cable is modelled, straight up +Z. The app draws the rest
from the `cable_end` node.
"""

ASSET = "inst_electrocautery_pencil"
MATERIALS = ["handle", "paint", "steel"]
BODY, BUTTON, STEEL = 0, 1, 2

BLADE_TOP = 0.016  # the flat of the blade, from its rounded tip
BLADE_HALF_WIDTH, BLADE_HALF_THICKNESS = 0.0016, 0.00025  # wider than the shank: a spatula
SHANK_R = 0.00119  # the electrode's round shank, 3/32 inch
NOSE_Z = 0.025  # where the electrode enters the pencil: 2.5 cm protrudes
BACK_Z = NOSE_Z + 0.16  # the handle is 16 cm long
CABLE_END_Z = BACK_Z + 0.05

# The two buttons' centre heights (cut and coagulate), their size, and how
# far they stand above the raised pad they sit on.
# TODO(clinical review): which button cuts and which coagulates, and their
# order along the pencil, varies by manufacturer; the model draws them alike.
BUTTONS = (0.068, 0.086)
BUTTON_LENGTH, BUTTON_HALF_WIDTH, BUTTON_RISE = 0.013, 0.0037, 0.0012

# The body: (height, half-width across x, half-thickness through y). A cone
# of a nose from the electrode's collet, the fullest part under the fingers,
# then a slow taper to the back.
BODY_STATIONS = [
    (NOSE_Z - 0.0005, 0.0019, 0.0019),
    (NOSE_Z + 0.001, 0.0023, 0.0023),
    (NOSE_Z + 0.004, 0.0027, 0.0027),
    (0.035, 0.0036, 0.0035),
    (0.045, 0.0050, 0.0046),
    (0.055, 0.0060, 0.0054),
    (0.065, 0.0065, 0.0058),
    (0.100, 0.0068, 0.0060),
    (0.140, 0.0066, 0.0058),
    (0.170, 0.0060, 0.0054),
    (0.180, 0.0052, 0.0048),
    (BACK_Z - 0.0015, 0.0042, 0.0040),
    (BACK_Z, 0.0030, 0.0030),
]


def half_thickness_at(z):
    """The body's half-thickness at height `z`, between stations."""
    for (z0, _, t0), (z1, _, t1) in zip(BODY_STATIONS, BODY_STATIONS[1:]):
        if z0 <= z <= z1:
            return t0 + (t1 - t0) * (z - z0) / (z1 - z0)
    return BODY_STATIONS[-1][2]


def electrode(bm):
    # A flat blade with a rounded end, blending into the round shank that
    # the pencil's collet grips.
    zs = [0.0, 0.0001, 0.0003, 0.0006, 0.001, 0.0016, 0.003, 0.006, 0.010, 0.0135, BLADE_TOP, 0.0175, 0.019, NOSE_Z + 0.004]
    flat, round_ = superellipse(16, 5.0), superellipse(16, 2.0)
    blend = [moulded_smoothstep(z, 0.0135, 0.019) for z in zs]
    loft(
        bm,
        [(0, 0, z) for z in zs],
        axis=(0, 1, 0),
        half_width=[(BLADE_HALF_WIDTH + (SHANK_R - BLADE_HALF_WIDTH) * s) * moulded_round(z, BLADE_HALF_WIDTH, 0.12) for z, s in zip(zs, blend)],
        half_thickness=[BLADE_HALF_THICKNESS + (SHANK_R - BLADE_HALF_THICKNESS) * s for s in blend],
        section=[moulded_blend(flat, round_, s) for s in blend],
        material=STEEL,
    )


def body(bm):
    loft(
        bm,
        [(0, 0, z) for z, _, _ in BODY_STATIONS],
        axis=(0, 1, 0),
        half_width=[w for _, w, _ in BODY_STATIONS],
        half_thickness=[t for _, _, t in BODY_STATIONS],
        section=superellipse(24, 2.6),
        material=BODY,
    )


def buttons(bm):
    # A low raised pad on the top face, and the two buttons standing proud
    # of it. slab() takes app coordinates, where the top face (Blender -y) is
    # +z and the pencil's length is y.
    top = half_thickness_at(sum(BUTTONS) / 2)
    pad_bottom, pad_top = BUTTONS[0] - 0.0095, BUTTONS[1] + 0.0095
    slab(bm, (-0.0047, pad_bottom, top - 0.0012), (0.0047, pad_top, top + 0.0004), 0.0014, BODY, along="y")
    for centre in BUTTONS:
        lo = (-BUTTON_HALF_WIDTH, centre - BUTTON_LENGTH / 2, top - 0.0004)
        hi = (BUTTON_HALF_WIDTH, centre + BUTTON_LENGTH / 2, top + 0.0004 + BUTTON_RISE)
        slab(bm, lo, hi, 0.0011, BUTTON, along="y")


def cable(bm):
    # A ribbed strain-relief boot tapering into the cable, straight up +z.
    profile = [(0.0032, 0.0), (0.0032, 0.003), (0.0029, 0.0035), (0.0030, 0.006), (0.0027, 0.0065), (0.0028, 0.009), (0.0025, 0.0095), (0.0026, 0.012), (0.0022, 0.016), (0.0021, 0.02)]
    profile.append((0.0021, CABLE_END_Z - (BACK_Z - 0.002)))
    moulded_revolve(bm, (0, 0, BACK_Z - 0.002), (0, 0, 1), profile, BODY, 18)


def build():
    bm = bmesh.new()
    electrode(bm)
    body(bm)
    buttons(bm)
    cable(bm)
    pencil = finish(bm, ASSET, MATERIALS)
    return [
        pencil,
        # On the pencil's axis under the buttons, where the index finger rests.
        empty("grip_point", (0.0, sum(BUTTONS) / 2, 0.0)),
        empty("cable_end", (0.0, CABLE_END_Z, 0.0)),
    ]
