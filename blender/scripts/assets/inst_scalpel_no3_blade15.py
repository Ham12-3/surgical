# kit: kit_flat.py
"""
inst_scalpel_no3_blade15: a No. 3 scalpel handle carrying a #15 blade, the
small blade for short, precise incisions. Draws the `scalpel_15` tool mesh.

Runs with blender/scripts/kit.py, kit_shapes.py and kit_flat.py prepended
(see build.py). Coordinates here are Blender's: the blade's point at the
origin, body up +Z, the flat plane XZ, thickness along Y.

What sets it apart from the #10 on the same handle: a much smaller blade,
about 2.5 cm from the point to the handle and no wider than its tang, with
only a short curved cutting edge near the point; the keyhole slot fills most
of the blade. The handle, fitting and slot are the #10's (kit_flat.py).
"""

ASSET = "inst_scalpel_no3_blade15"
MATERIALS = ["steel", "steelSatin", "steelDark"]
STEEL, SATIN, DARK = 0, 1, 2

EXPOSED = 0.025  # from the point to the heel, against the handle's shoulder
BELLY = 0.0055  # widest across the curved edge, back to edge
BELLY_AT = 0.007  # height where the curve meets the straight side
STRAIGHT_BY = 0.011  # the straight side has eased out to the tang's width here
EDGE_END = (0.009, 0.0105)  # the grind runs out over this, up the straight side
DROOP = (0.0003, 0.003)  # the back leans in this far at the point, over this height


def back_x(z):
    """The back, from the handle's axis: straight in line with the tang,
    leaning in a little to the point."""
    lean, over = DROOP
    k = max(0.0, 1.0 - z / over)
    return -FLAT_TANG_HALF + lean * k * k


def edge_x(z):
    """The cutting side: a short convex curve from the point, then straight
    up to the tang, easing out to its width."""
    if z <= BELLY_AT:
        return back_x(z) + BELLY * math.sin(0.5 * math.pi * z / BELLY_AT)
    widest = -FLAT_TANG_HALF + BELLY
    return widest + (FLAT_TANG_HALF - widest) * flat_smooth((z - BELLY_AT) / (STRAIGHT_BY - BELLY_AT))


def edge_half(z):
    """Ground to an edge round the curve, square up the straight side."""
    start, end = EDGE_END
    return FLAT_EDGE_HALF + (FLAT_BLADE_HALF_T - FLAT_EDGE_HALF) * flat_smooth((z - start) / (end - start))


def build():
    heights = [EXPOSED * i / 100 for i in range(101)]
    back = [(z, back_x(z)) for z in heights]
    edge = [(z, edge_x(z), edge_half(z)) for z in heights]
    x_axis = -back_x(0.0)  # puts the point on the origin

    bm = bmesh.new()
    flat_no3_handle(bm, x_axis, EXPOSED, STEEL, DARK)
    flat_no3_rib(bm, x_axis, EXPOSED, STEEL)
    flat_blade(bm, x_axis, EXPOSED, back, edge, SATIN, STEEL)
    scalpel = finish(bm, ASSET, MATERIALS)

    grip_bottom, grip_top, _ = FLAT_NO3_GRIP
    return [
        scalpel,
        # Mid-way along the ribbed finger grip, on the handle's midplane.
        empty("grip_point", (x_axis, EXPOSED + (grip_bottom + grip_top) / 2, -FLAT_HANDLE_Y)),
        empty("blade_tip", (0.0, 0.0, 0.0)),
    ]
