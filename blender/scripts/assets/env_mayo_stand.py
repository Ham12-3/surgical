"""
env_mayo_stand: a Mayo instrument stand. A flat tray with a raised rim,
cantilevered on an arm from a height-adjustable post, over a U-shaped base on
four casters.

Runs with kit.py and kit_shapes.py prepended (see build.py), so positions are
in app coordinates. The origin is on the floor under the tray's centre and the
post stands at the tray's +x end; the room turns the stand so the post is on
the side away from the table (src/scene/models/operatingRoom.ts).

The tray surface is pinned to the app: instruments are laid out on the
`tray_anchor` node, at the height the code-built stand in
src/scene/models/roomFallbacks.ts uses.
"""

MATERIALS = ["steelDark", "steel", "handle"]
TRAY, STEEL, RUBBER = 0, 1, 2

TABLE_TOP_Y = 0.90
TRAY_FLOOR_Y = TABLE_TOP_Y + 0.15  # the tray's inside surface
HALF_X, HALF_Z = 0.25, 0.17  # a 0.50 x 0.34 m tray
POST_X = 0.30  # the post, just beyond the tray's +x end


def tray(bm):
    # Floor plate and a rim standing 1.8 cm proud all round. Satin
    # (steelDark) rather than polished: a mirror tray under the lamp reflects
    # it straight back and clips to white.
    base_y = TRAY_FLOOR_Y - 0.006
    top = TRAY_FLOOR_Y + 0.018
    rim = 0.008
    slab(bm, (-HALF_X, base_y, -HALF_Z), (HALF_X, TRAY_FLOOR_Y, HALF_Z), 0.004, TRAY, along="x")
    for z in (-HALF_Z, HALF_Z - rim):
        slab(bm, (-HALF_X, base_y, z), (HALF_X, top, z + rim), 0.003, TRAY, along="x")
    for x in (-HALF_X, HALF_X - rim):
        slab(bm, (x, base_y, -HALF_Z + rim), (x + rim, top, HALF_Z - rim), 0.003, TRAY, along="z")


def arm(bm):
    # A flat arm from the post's head in under the tray, and two cross-pieces
    # the tray rests on.
    y0, y1 = TRAY_FLOOR_Y - 0.03, TRAY_FLOOR_Y - 0.006
    slab(bm, (-0.18, y0, -0.02), (POST_X + 0.02, y1, 0.02), 0.004, STEEL, along="x")
    for x in (-0.16, 0.12):
        slab(bm, (x, y0, -0.14), (x + 0.04, y1, 0.14), 0.004, STEEL, along="z")


def post(bm):
    # Outer tube from the base, a thinner inner tube telescoping out of it up
    # to the arm, and the height-lock knob at the joint.
    outer = [(0.024, 0.0), (0.024, 0.66), (0.027, 0.67), (0.027, 0.71), (0.02, 0.72)]
    lathe_part(bm, (POST_X, 0.05, 0.0), (0, 1, 0), outer, STEEL, 20)
    rise = TRAY_FLOOR_Y - 0.70
    inner = [(0.017, 0.0), (0.017, rise - 0.03), (0.022, rise - 0.02), (0.022, rise - 0.005)]
    lathe_part(bm, (POST_X, 0.70, 0.0), (0, 1, 0), inner, STEEL, 18)
    knob = [(0.001, 0.0), (0.012, 0.004), (0.012, 0.06), (0.018, 0.065), (0.018, 0.085), (0.001, 0.09)]
    lathe_part(bm, (POST_X, 0.69, 0.0), (1, 0, 0), knob, RUBBER, 14)


def caster(bm, x, z):
    # Swivel housing and a dark wheel, its axle along z, touching the floor.
    slab(bm, (x - 0.015, 0.03, z - 0.012), (x + 0.015, 0.048, z + 0.012), 0.004, STEEL, along="x")
    wheel = [(0.024, 0.0), (0.025, 0.003), (0.025, 0.015), (0.024, 0.018)]
    lathe_part(bm, (x, 0.025, z - 0.009), (0, 0, 1), wheel, RUBBER, 16)


def base(bm):
    # U-shaped base: two legs running back under the tray from a cross-bar at
    # the post end, stopping short of the table's own base, on four casters.
    for z in (-0.21, 0.21):
        slab(bm, (-0.22, 0.045, z - 0.018), (POST_X + 0.03, 0.075, z + 0.018), 0.006, STEEL, along="x")
    slab(bm, (POST_X - 0.03, 0.045, -0.21), (POST_X + 0.03, 0.075, 0.21), 0.006, STEEL, along="z")
    socket = [(0.045, 0.0), (0.035, 0.02), (0.026, 0.03)]
    lathe_part(bm, (POST_X, 0.075, 0.0), (0, 1, 0), socket, STEEL, 20)
    for x in (-0.19, POST_X):
        for z in (-0.21, 0.21):
            caster(bm, x, z)


def build():
    bm = bmesh.new()
    tray(bm)
    arm(bm)
    post(bm)
    base(bm)
    stand = finish(bm, "env_mayo_stand", MATERIALS)
    anchor = empty("tray_anchor", (0.0, TRAY_FLOOR_Y + 0.002, 0.0))
    return [stand, anchor]
