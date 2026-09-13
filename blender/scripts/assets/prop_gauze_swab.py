# kit: kit_moulded.py
"""
prop_gauze_swab: a folded surgical gauze swab, 7.5 cm square and about
3.5 mm thick.

Runs with kit.py, kit_shapes.py and kit_moulded.py prepended (see build.py).
Draws the `gauze` tool mesh. It lies in the Blender XZ plane, thin through Y,
with its origin at the centre of its bottom edge and the swab standing up +Z
from there.

A soft pad rather than a card: every edge is a rounded fold (a folded swab
shows no cut edges), the faces undulate a little as woven cotton does, and a
faint ridge across the front marks a folded layer's edge under the top ply.
The weave itself comes from the app's cloth normal map, so UVs run at cloth
scale rather than steel's.
"""

ASSET = "prop_gauze_swab"
MATERIALS = ["gauze"]

SIDE = 0.075
HALF_THICK = 0.00175
EDGE_R = 0.0024  # the folded edges round over this far in from the rim
STEP = 0.005  # grid spacing across the flat of the swab
CLOTH_UV = 9.0  # texture tiles per metre, for the cloth weave
FOLD_X = 0.0125  # the folded layer's edge showing through the front ply
RIDGE = 0.0005
CREASE = 0.0003  # a shallow crease across the middle, where it was folded
BOW = 0.0012  # how far the swab bows out of flat across its width
EDGE_WANDER = 0.0005  # how far the rim wanders from a straight line


def stations(length):
    """Grid positions from 0 to `length`: close together over the rounded
    edge, so the fold shades smoothly, and STEP apart across the middle."""
    edge = [EDGE_R * k for k in (0.0, 0.04, 0.15, 0.4, 1.0)]
    count = round((length - 2 * EDGE_R) / STEP)
    middle = [EDGE_R + (length - 2 * EDGE_R) * k / count for k in range(1, count)]
    return edge + middle + [length - e for e in reversed(edge)]


def build():
    xs = [s - SIDE / 2 for s in stations(SIDE)]
    zs = stations(SIDE)
    front, back = [], []
    for x in xs:
        front_row, back_row = [], []
        for z in zs:
            d = min(x + SIDE / 2, SIDE / 2 - x, z, SIDE - z)
            # Full thickness over the middle, falling on a quarter ellipse to
            # nothing at the rim, where the two faces meet in a rounded fold.
            dx = min(x + SIDE / 2, SIDE / 2 - x)
            dz = min(z, SIDE - z)
            puff = 1 + 0.14 * math.sin(x * 126 + 0.7) * math.sin(z * 146 + 1.3)
            thick = HALF_THICK * moulded_round(dx, EDGE_R) * moulded_round(dz, EDGE_R) * puff
            # A slight bow and an undulation both faces share, so the
            # thickness holds while the swab stops looking like card.
            wave = BOW * (2 * x / SIDE) ** 2 + 0.0006 * math.sin(x * 105 + 0.4) * math.cos(z * 90 + 0.9) + 0.0002 * math.sin(z * 300 + x * 80)
            inner = moulded_round(d, 0.006)  # the fold marks fade out toward the rim
            ridge = RIDGE * math.exp(-(((x - FOLD_X) / 0.002) ** 2)) * inner
            crease = CREASE * math.exp(-(((z - SIDE / 2) / 0.0015) ** 2)) * inner
            front_row.append(wave + thick + ridge - crease)
            back_row.append(wave - thick + crease)
        front.append(front_row)
        back.append(back_row)
    bm = bmesh.new()
    moulded_sheet(bm, xs, zs, front, back, 0, CLOTH_UV)
    # Let every point wander a little in the plane, so the folded edges are
    # not ruler straight, then set the bottom edge's lowest point back on z = 0.
    for v in bm.verts:
        x, z = v.co.x, v.co.z
        v.co.x += EDGE_WANDER * (math.sin(z * 170 + 0.3) + 0.6 * math.sin(z * 410 + 1.1))
        v.co.z += EDGE_WANDER * (math.sin(x * 150 + 2.0) + 0.6 * math.sin(x * 380 + 0.5))
    moulded_seat(bm)
    return [finish(bm, ASSET, MATERIALS)]
