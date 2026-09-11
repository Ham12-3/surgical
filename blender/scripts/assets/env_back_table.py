"""
env_back_table: the stainless back table, draped for use, with a rimmed
instrument tray and a stack of folded towels on it.

Runs with kit.py and kit_shapes.py prepended (see build.py). The origin is on
the floor under the table's centre, with its long side along z. The room
stands it off to the side of the operating table
(src/scene/models/operatingRoom.ts).
"""

MATERIALS = ["steel", "steelDark", "drape", "drapeDark", "handle", "gauze"]
STEEL, SATIN, DRAPE, SKIRT, RUBBER, TOWEL = 0, 1, 2, 3, 4, 5

TOP_Y = 0.90
HALF_X, HALF_Z = 0.35, 0.75  # a 0.7 x 1.5 m top
# Cloth weave tiles per metre, matching the patient drapes (UV_DENSITY in
# src/scene/models/drapes.ts), so the fabric reads the same.
CLOTH_UV = 9.0
SKIRT_BOTTOM = 0.55


def frame(bm):
    # Top frame, a lower shelf, and four square legs on casters.
    slab(bm, (-HALF_X, TOP_Y - 0.04, -HALF_Z), (HALF_X, TOP_Y, HALF_Z), 0.006, STEEL, along="z")
    slab(
        bm,
        (-HALF_X + 0.01, 0.28, -HALF_Z + 0.03),
        (HALF_X - 0.01, 0.30, HALF_Z - 0.03),
        0.004,
        STEEL,
        along="z",
    )
    wheel = [(0.029, 0.0), (0.03, 0.003), (0.03, 0.019), (0.029, 0.022)]
    for x in (-HALF_X + 0.03, HALF_X - 0.03):
        for z in (-HALF_Z + 0.04, HALF_Z - 0.04):
            slab(bm, (x - 0.015, 0.065, z - 0.015), (x + 0.015, TOP_Y - 0.03, z + 0.015), 0.004, STEEL, along="y")
            slab(bm, (x - 0.018, 0.035, z - 0.014), (x + 0.018, 0.068, z + 0.014), 0.004, STEEL, along="x")
            lathe_part(bm, (x, 0.03, z - 0.011), (0, 0, 1), wheel, RUBBER, 16)


def drape(bm):
    # The sterile sheet over the top, hanging part way down on every side.
    edge_x, edge_z = HALF_X + 0.04, HALF_Z + 0.04
    top = TOP_Y + 0.006
    t = 0.004
    slab(bm, (-edge_x, TOP_Y, -edge_z), (edge_x, top, edge_z), 0.002, DRAPE, along="z", uv_scale=CLOTH_UV)
    for z in (-edge_z, edge_z - t):
        slab(bm, (-edge_x, SKIRT_BOTTOM, z), (edge_x, top, z + t), 0.0015, SKIRT, along="x", uv_scale=CLOTH_UV)
    for x in (-edge_x, edge_x - t):
        slab(bm, (x, SKIRT_BOTTOM, -edge_z + t), (x + t, top, edge_z - t), 0.0015, SKIRT, along="z", uv_scale=CLOTH_UV)


def items(bm):
    # A rimmed instrument tray and a stack of folded towels on the sheet.
    y = TOP_Y + 0.006
    x0, x1, z0, z1 = -0.28, 0.2, -0.62, -0.30
    rim = 0.006
    slab(bm, (x0, y, z0), (x1, y + 0.006, z1), 0.003, SATIN, along="x")
    for z in (z0, z1 - rim):
        slab(bm, (x0, y, z), (x1, y + 0.05, z + rim), 0.002, SATIN, along="x")
    for x in (x0, x1 - rim):
        slab(bm, (x, y, z0 + rim), (x + rim, y + 0.05, z1 - rim), 0.002, SATIN, along="z")
    for k in range(3):
        lift, shift = y + 0.026 * k, 0.008 * k
        slab(
            bm,
            (-0.2 + shift, lift, 0.2 - shift),
            (0.1 + shift, lift + 0.024, 0.42 - shift),
            0.008,
            TOWEL,
            along="x",
            uv_scale=20.0,
        )


def build():
    bm = bmesh.new()
    frame(bm)
    drape(bm)
    items(bm)
    return finish(bm, "env_back_table", MATERIALS)
