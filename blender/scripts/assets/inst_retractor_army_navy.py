# kit: kit_flat.py
# kit: kit_retractor.py
"""
inst_retractor_army_navy: Army-Navy retractor, about 21.5 cm, double-ended.
Draws the `army_navy_retractor` tool mesh.

Runs with blender/scripts/kit.py, kit_shapes.py, kit_flat.py and
kit_retractor.py prepended
(see build.py). Coordinates here are Blender's: body up +Z, the bar's flat
faces toward +-Y, the blades turned toward -Y (app +z, toward the tissue).

One strip of flat steel: a straight bar with a right-angled blade bent at
each end, both turned to the same side, the lower one wider and deeper than
the upper. The free edge of the lower blade is the working tip, on the
origin. What sets it apart from the Richardson: two small, shallow blades
and a plain bar with no loop; from the self-retaining Weitlaner: no rings,
no hinge, no ratchet.

Blade sizes vary by maker; these are a common pattern, about 16 x 24 mm and
13.5 x 18.6 mm (width x depth from the bar's inner face). Each blade opens
5 degrees past square, so the lower blade's free edge is its lowest point.
The blades are modelled plain, without a turned lip.
"""

# TODO(clinical review): blade widths and depths, the plain (unlipped) blade
# ends and the solid, unslotted bar are a common pattern as best known, not
# checked against a maker's drawing.

ASSET = "inst_retractor_army_navy"
MATERIALS = ["steelSatin"]
SATIN = 0

HALF_T = 0.0009  # 1.8 mm stock
BAR_HALF = 0.006  # the bar is 12 mm wide
LOWER = (0.008, 0.0214)  # half-width and straight run of the lower (working) blade
UPPER = (0.00675, 0.016)  # and of the upper blade
BAR = 0.2022  # straight run of the bar, for 21.5 cm overall
OPEN = 5.0  # degrees past a right angle at each bend
BEND_R = 0.0039  # centreline radius of each bend: 3 mm inside
FLARE = 0.012  # the bar widens into each blade over this, next to the bend
CORNER = 0.003  # the blades' free corners are rounded to this


def build():
    turn = 90.0 - OPEN
    bend = BEND_R * math.radians(turn)
    # From the lower blade's free edge, heading toward the bar and rising a
    # little, round the lower bend, up the bar, round the upper bend and out
    # along the upper blade.
    moves = [
        (CORNER, 0.0, 0.0005),
        (LOWER[1] - CORNER, 0.0, 0.002),
        (bend, turn, 0.002),
        (FLARE, 0.0, 0.0015),
        (BAR - 2 * FLARE, 0.0, 0.01),
        (FLARE, 0.0, 0.0015),
        (bend, turn, 0.002),
        (UPPER[1] - CORNER, 0.0, 0.002),
        (CORNER, 0.0, 0.0005),
    ]
    points, lengths = flat_turtle((0.0, 0.0), OPEN, moves)
    bar_start = LOWER[1] + bend
    bar_end = bar_start + BAR
    total = lengths[-1]

    half_widths = []
    for s in lengths:
        if s < bar_start + FLARE:
            w = LOWER[0] + (BAR_HALF - LOWER[0]) * flat_smooth((s - bar_start) / FLARE)
        else:
            w = BAR_HALF + (UPPER[0] - BAR_HALF) * flat_smooth((s - bar_end + FLARE) / FLARE)
        half_widths.append(flat_corner(flat_corner(w, s, CORNER), total - s, CORNER))

    bm = bmesh.new()
    flat_strap(bm, points, HALF_T, half_widths, SATIN)
    shift = flat_seat(bm)
    retractor = finish(bm, ASSET, MATERIALS)

    # Mid-way along the bar, on its centreline; empty() takes app coordinates.
    mid = flat_point_at(points, lengths, (bar_start + bar_end) / 2) + shift
    return [retractor, empty("grip_point", (mid.x, mid.z, -mid.y))]
