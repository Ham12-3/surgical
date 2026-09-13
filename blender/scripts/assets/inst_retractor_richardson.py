# kit: kit_flat.py
# kit: kit_retractor.py
"""
inst_retractor_richardson: Richardson retractor, about 24 cm. Draws the
`richardson_retractor` tool mesh.

Runs with blender/scripts/kit.py, kit_shapes.py, kit_flat.py and
kit_retractor.py prepended
(see build.py). Coordinates here are Blender's: body up +Z, the shaft's flat
faces toward +-Y, the blade turned toward -Y (app +z, toward the tissue).

A flat shaft bent at the bottom into one broad, deep blade at a right angle,
its end turned up as a lip toward the handle side to hold the tissue edge;
at the top the shaft widens into a hollow, open finger loop. What sets it
apart from the Army-Navy: a single blade twice as broad and much deeper, the
lip, and the loop handle; from the self-retaining Weitlaner: no rings, no
hinge, no ratchet.

Sizes vary by maker; this is a mid-size pattern, a 32 mm wide blade about
45 mm deep from the shaft's inner face to the lip. The blade opens 5 degrees
past square. The origin is the lowest point of the blade, where the lip
turns up, about 5 mm in from the lip's free edge: the manifest check wants
the lowest point on y = 0.
"""

# TODO(clinical review): the lip's direction and angle (here turned up 40
# degrees toward the handle side, to hook under the wound edge) and the blade
# being flat across its width are the common pattern as best known, not
# checked against a maker's drawing.

ASSET = "inst_retractor_richardson"
MATERIALS = ["steelSatin"]
SATIN = 0

HALF_T = 0.001  # 2 mm stock
BLADE_HALF = 0.016  # the blade is 32 mm wide
BLADE = 0.036  # straight run of the blade, between the lip and the bend
LIP = (0.004, 40.0, 0.004)  # the lip's straight length, degrees turned up, bend radius
OPEN = 5.0  # degrees past a right angle at the bend
BEND_R = 0.005  # centreline radius of the bend: 4 mm inside
SHAFT_HALF = 0.007  # the shaft is 14 mm wide
SHAFT = 0.1614  # from the bend up into the loop, for 24 cm overall
NECK = 0.022  # the blade narrows into the shaft over this, above the bend
LOOP_FLARE = (0.015, 0.011)  # the shaft widens to this half-width over its last 15 mm
# The loop: outer half-width, length, band width, half-thickness. Its opening
# is 20 x 63 mm, room for two or three fingers.
LOOP = (0.016, 0.075, 0.006, 0.0012)
CORNER = 0.005  # the blade's free corners are rounded to this


def build():
    lip_length, lip_turn, lip_radius = LIP
    lip_bend = lip_radius * math.radians(lip_turn)
    turn = 90.0 - OPEN
    bend = BEND_R * math.radians(turn)
    # From the lip's free edge, down round the lip, along the blade rising a
    # little toward the shaft, round the bend and up the shaft.
    heading = 180.0 + OPEN - lip_turn + 180.0
    moves = [
        (lip_length, 0.0, 0.0007),
        (lip_bend, lip_turn, 0.0007),
        (BLADE, 0.0, 0.002),
        (bend, turn, 0.002),
        (NECK, 0.0, 0.0015),
        (SHAFT - NECK - LOOP_FLARE[0], 0.0, 0.01),
        (LOOP_FLARE[0], 0.0, 0.0015),
    ]
    points, lengths = flat_turtle((0.0, 0.0), heading, moves)
    shaft_start = lip_length + lip_bend + BLADE + bend
    total = lengths[-1]

    half_widths = []
    for s in lengths:
        if s < shaft_start + NECK:
            w = BLADE_HALF + (SHAFT_HALF - BLADE_HALF) * flat_smooth((s - shaft_start) / NECK)
        else:
            flare, widest = LOOP_FLARE
            w = SHAFT_HALF + (widest - SHAFT_HALF) * flat_smooth((s - total + flare) / flare)
        half_widths.append(flat_corner(w, s, CORNER))

    bm = bmesh.new()
    flat_strap(bm, points, HALF_T, half_widths, SATIN)
    # The loop sits so the shaft's end is buried in its lower band, just
    # below the opening.
    half_width, length, band, loop_half_t = LOOP
    _, y, top = points[-1]
    z0 = top - band + 0.0005
    flat_loop(bm, y, z0, z0 + length, half_width, band, loop_half_t, SATIN)
    shift = flat_seat(bm)
    retractor = finish(bm, ASSET, MATERIALS)

    # In the middle of the loop, where the fingers close round it; empty()
    # takes app coordinates.
    grip = Vector((0.0, y, z0 + length / 2)) + shift
    return [retractor, empty("grip_point", (grip.x, grip.z, -grip.y))]
