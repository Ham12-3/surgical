"""
env_or_table: a powered operating table with a four-section pad, side rails,
a central column, a floor base, a gel head ring and the right-hand arm board.

Runs with kit.py and kit_shapes.py prepended (see build.py), so positions are
in app coordinates. Placed at the room origin as it is.

The pad is pinned to the app: its top is TABLE_TOP_Y in
src/scene/models/operatingRoom.ts, its width and length are what the drapes
in drapes.ts hang over, and the arm board carries the forearm in patient.ts.
Change them together.
"""

MATERIALS = ["tableTop", "steel", "steelDark", "paint", "handle"]
PAD, STEEL, FRAME, PAINT, RUBBER = 0, 1, 2, 3, 4

TOP_Y = 0.90  # TABLE_TOP_Y: the surface the patient lies on
PAD_DEPTH = 0.07
HALF_WIDTH = 0.28  # a 0.56 m pad, as the drapes assume
RAIL_X = 0.305  # accessory rails, just outside the pad
BOARD_Z = -0.33  # the arm board's centre along the table: the body model's shoulder line

# Pad sections from head (-z) to foot (+z): start, end and half-width.
SECTIONS = [
    (-1.00, -0.71, 0.19),  # head section, narrower
    (-0.69, 0.10, HALF_WIDTH),  # back
    (0.12, 0.50, HALF_WIDTH),  # seat
    (0.52, 1.00, HALF_WIDTH),  # legs
]


def pads(bm):
    # Soft pads with generously rounded edges, each on a thin steel plate.
    for z0, z1, half in SECTIONS:
        slab(bm, (-half, TOP_Y - PAD_DEPTH, z0), (half, TOP_Y, z1), 0.022, PAD, along="z")
        slab(
            bm,
            (-half + 0.015, TOP_Y - PAD_DEPTH - 0.03, z0 + 0.01),
            (half - 0.015, TOP_Y - PAD_DEPTH + 0.002, z1 - 0.01),
            0.006,
            FRAME,
            along="z",
        )
    # Frame spine joining the sections, over the column.
    slab(bm, (-0.2, TOP_Y - 0.16, -0.95), (0.2, TOP_Y - 0.10, 0.95), 0.01, FRAME, along="z")


def head_ring(bm):
    # Gel head ring. The patient's head (src/scene/models/patient.ts) is
    # centred at z = -0.53 with its underside at y = 0.942, so the ring's top
    # sits just there.
    tube = 0.021
    centre_y = TOP_Y + tube
    steps = 32
    path = [
        app(0.075 * math.cos(a), centre_y, -0.53 + 0.085 * math.sin(a))
        for a in (2 * math.pi * i / steps for i in range(steps))
    ]
    loft(bm, path, app(0, 1, 0), tube, tube, superellipse(10, 2.0), PAD, closed=True)


def rails(bm):
    # Stainless accessory rails along both sides of the long sections, each
    # on a pair of stand-offs from the frame.
    for side in (-1, 1):
        for z0, z1, _half in SECTIONS[1:]:
            slab(
                bm,
                (side * RAIL_X - 0.005, TOP_Y - 0.06, z0 + 0.03),
                (side * RAIL_X + 0.005, TOP_Y - 0.03, z1 - 0.03),
                0.003,
                STEEL,
                along="z",
            )
            for z in (z0 + 0.06, z1 - 0.06):
                slab(
                    bm,
                    (side * (HALF_WIDTH - 0.02), TOP_Y - 0.052, z - 0.012),
                    (side * RAIL_X, TOP_Y - 0.038, z + 0.012),
                    0.003,
                    STEEL,
                    along="x",
                )


def column_and_base(bm):
    # A single column under the back/seat junction, a wider housing for the
    # tilt mechanism under the frame, and a low, wide floor base with a dark
    # bumper and a foot-control pod.
    slab(bm, (-0.15, 0.10, -0.05), (0.15, TOP_Y - 0.16, 0.17), 0.04, PAINT, along="y")
    slab(bm, (-0.19, TOP_Y - 0.26, -0.12), (0.19, TOP_Y - 0.15, 0.24), 0.03, PAINT, along="y")
    slab(bm, (-0.30, 0.02, -0.40), (0.30, 0.12, 0.62), 0.04, PAINT, along="z")
    slab(bm, (-0.31, 0.0, -0.41), (0.31, 0.035, 0.63), 0.012, RUBBER, along="z")
    slab(bm, (-0.10, 0.10, 0.50), (0.10, 0.15, 0.60), 0.015, RUBBER, along="x")


def arm_board(bm):
    # Right-hand arm board (-x), pad top level with the table's, clamped to
    # the side rail at the patient's shoulder line. The right arm of the body
    # model (src/data/bodyLandmarks.json: shoulder at z = -0.33, wrist at
    # x = -0.70) lies along it, so it is 50 cm long, as arm boards are.
    z0, z1 = BOARD_Z - 0.17, BOARD_Z + 0.17
    slab(bm, (-0.82, TOP_Y - 0.045, z0), (-0.315, TOP_Y, z1), 0.015, PAD, along="x")
    slab(bm, (-0.80, TOP_Y - 0.07, z0 + 0.02), (-0.315, TOP_Y - 0.043, z1 - 0.02), 0.005, FRAME, along="x")
    slab(bm, (-0.335, TOP_Y - 0.085, BOARD_Z - 0.05), (-0.295, TOP_Y - 0.02, BOARD_Z + 0.05), 0.006, STEEL, along="y")


def build():
    bm = bmesh.new()
    pads(bm)
    head_ring(bm)
    rails(bm)
    column_and_base(bm)
    arm_board(bm)
    return finish(bm, "env_or_table", MATERIALS)
