# kit: kit_flat.py
"""
inst_scalpel_no3_blade10: a No. 3 scalpel handle carrying a #10 blade, the
general-purpose blade for skin incisions. Draws the `scalpel` tool mesh.

Runs with blender/scripts/kit.py, kit_shapes.py and kit_flat.py prepended
(see build.py). Coordinates here are Blender's: the blade's point at the
origin, body up +Z, the flat plane XZ, thickness along Y.

What a student reads at a glance, and what sets it apart from the #15 on the
same handle: a large blade, about 3.3 cm from the point to the handle, with
a long convex cutting belly swelling to nearly 8 mm wide, a straight back,
and the ground bevel running the length of the edge. The flat steel handle
has a ribbed finger grip near the blade and the blade's keyhole slot shows
the fitting's rib through it.
"""

ASSET = "inst_scalpel_no3_blade10"
MATERIALS = ["steel", "steelSatin", "steelDark"]
STEEL, SATIN, DARK = 0, 1, 2

EXPOSED = 0.033  # from the point to the heel, against the handle's shoulder
BELLY = 0.0078  # widest across, back to edge
BELLY_AT = 0.015  # height of the widest point
EDGE_HEEL = (0.0195, 0.022)  # where the edge ends, curving in to the tang
DROOP = (0.00055, 0.007)  # the back leans in this far at the point, over this height


def back_x(z):
    """The back, from the handle's axis: straight down the tang's side, then
    leaning in a little to the point."""
    lean, over = DROOP
    k = max(0.0, 1.0 - z / over)
    return -FLAT_TANG_HALF + lean * k * k


def edge_x(z):
    """The cutting side: a convex belly from the point to its widest, easing
    in a little, then curving in to the tang where the edge ends."""
    if z <= BELLY_AT:
        return back_x(z) + BELLY * math.sin(0.5 * math.pi * z / BELLY_AT)
    start, end = EDGE_HEEL
    widest = -FLAT_TANG_HALF + BELLY
    at_heel = widest - 0.0004  # the belly eases in this much before the heel
    if z <= start:
        return widest - (widest - at_heel) * ((z - BELLY_AT) / (start - BELLY_AT)) ** 2
    return FLAT_TANG_HALF + (at_heel - FLAT_TANG_HALF) * (1.0 - flat_smooth((z - start) / (end - start)))


def edge_half(z):
    """Ground to an edge up to the heel of the edge, square above it."""
    start, end = EDGE_HEEL
    return FLAT_EDGE_HALF + (FLAT_BLADE_HALF_T - FLAT_EDGE_HALF) * flat_smooth((z - start) / (end - start + 0.0005))


def build():
    heights = [EXPOSED * i / 120 for i in range(121)]
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
