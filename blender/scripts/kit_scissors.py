"""
Parts for the scissors family: Metzenbaum, Mayo and suture scissors. An asset
script names this file on a `# kit: kit_scissors.py` line after
`# kit: kit_instruments.py`, whose blunt_nose() and finger_ring() it uses.

Coordinates are the instrument's own, in Blender axes: tip at the origin,
body up +Z, blades opening along X, thickness along Y.

Scissors are ring-handled like haemostats, but the halves meet differently:
there is no box lock and no ratchet. The halves are stacked through the
thickness instead. Each half has its blade, its flat share of the joint and
the root of its shank in its own layer on one side of y = 0 (`layer`, +1 or
-1), the blades sliding face to face across y = 0, and a countersunk screw
through the joint is the pivot. Above the joint each shank sweeps out to its
ring on the other side of the midline (`side`, as in kit_instruments.py) and
moves back onto y = 0, so the two rings lie in one plane.

A half is built with its axis on x = 0. For curved blades, move the whole half
afterwards so the tip, not the joint, sits at the origin.
"""

# Gap either side of y = 0 where the two halves slide on each other.
SCISSOR_CLEARANCE = 0.00002


def scissor_blade_section():
    """One blade's section, x across it and y through it: the flat inner face
    on y = 0, the cutting edge at x = -1, a steep bevel from it up to the
    outer face, which is all but flat so it reflects like ground steel rather
    than a rod, and a rounded spine over the last fifth toward x = +1. The
    bevel meets the outer face at well over finish()'s 35 degrees at every
    width here, so it shades as a crisp line along the edge. Lofted with axis
    (0, layer, 0) the section turns with the layer, so each blade's edge lands
    on the side that meets the other blade."""
    return [
        (-1.0, 0.0), (-0.45, 0.0), (0.2, 0.0), (0.8, 0.0),
        (0.93, 0.06), (0.99, 0.22), (1.0, 0.45), (0.98, 0.66),
        (0.92, 0.84), (0.8, 0.96), (0.6, 1.0), (0.1, 0.99),
        (-0.4, 0.96), (-0.64, 0.93), (-0.98, 0.14),
    ]


def scissor_blade_heights(top, nose, count):
    """Heights up a blade from its tip (z = 0) to `top`: close together over
    the rounded `nose`, evenly spaced above it."""
    zs = [nose * k for k in (0.0, 0.03, 0.1, 0.22, 0.4, 0.62, 0.84)]
    steps = count - len(zs)
    return zs + [nose + (top - nose) * i / (steps - 1) for i in range(steps)]


def scissor_curve_x(zs, bend, bend_top):
    """x of a blade's centreline at each height: `bend` at the tip, easing to
    0 at `bend_top` on a parabola, so the blade leaves the joint straight and
    curves more the nearer it gets to the tip. A bend of 0 is straight."""
    return [bend * (1 - min(z / bend_top, 1.0)) ** 2 for z in zs]


def scissor_blade(bm, layer, zs, xs, width, thickness, nose, material, power=1.0):
    """One blade in its half's layer, along the centreline (xs, zs) from the
    tip up into the joint. `width` is its (tip, root) half-width, `thickness`
    its (tip, root) full thickness from the inner face; both taper toward the
    tip, the width as (z / top) ** power, and round off over `nose`."""
    top = zs[-1]
    rounding = [blunt_nose(z, nose) for z in zs]
    loft(
        bm,
        [(x, layer * SCISSOR_CLEARANCE, z) for x, z in zip(xs, zs)],
        axis=(0, layer, 0),
        half_width=[(width[0] + (width[1] - width[0]) * (z / top) ** power) * r for z, r in zip(zs, rounding)],
        half_thickness=[(thickness[0] + (thickness[1] - thickness[0]) * z / top) * r for z, r in zip(zs, rounding)],
        section=scissor_blade_section(),
        material=material,
    )


def scissor_joint(bm, layer, z, radius, thickness, material):
    """This half's share of the joint: a flat round plate on the screw at
    height `z`, `thickness` deep in its layer, with its outer edge rounded on
    a quarter circle. Round rather than oval, so the two plates keep one
    outline as the halves turn on the screw. Returns the (signed) y of its
    outer face."""
    r = 0.4 * thickness
    ys, insets = [0.0], [0.0]
    for degrees in (0.0, 40.0, 65.0, 82.0):
        a = math.radians(degrees)
        ys.append(thickness - r + r * math.sin(a))
        insets.append(r * (1 - math.cos(a)))
    loft(
        bm,
        [(0.0, layer * (SCISSOR_CLEARANCE + y), z) for y in ys],
        axis=(0, 0, 1),
        half_width=[radius - d for d in insets],
        half_thickness=[radius - d for d in insets],
        section=superellipse(28, 2.0),
        material=material,
    )
    return layer * (SCISSOR_CLEARANCE + ys[-1])


def scissor_screw(bm, z, face_y, radius, material):
    """The countersunk screw where it shows on the joint face at `face_y`
    (signed): a flat head sunk into the face, standing a hair proud of it
    with a chamfered rim."""
    out = 1 if face_y > 0 else -1
    heights = [-0.0004, 0.0, 0.00006, 0.0001]
    radii = [radius * k for k in (1.0, 1.0, 0.94, 0.8)]
    loft(
        bm,
        [(0.0, face_y + out * h, z) for h in heights],
        axis=(0, 0, 1),
        half_width=radii,
        half_thickness=radii,
        section=superellipse(20, 2.0),
        material=material,
    )


def scissor_shank(bm, side, layer, start, control, end, width, thickness, root, blend, material, count=24):
    """A shank on `side`, from inside the joint out to its ring, along a
    quadratic Bezier through (x, z) points given as for side +1. `width` and
    `thickness` are its (start, end) half-sizes once it is on y = 0.

    It leaves the joint in its half's layer, `root` thick, so it passes the
    other half's shank without touching; between the path fractions in `blend`
    (by when the two shanks have parted sideways) it eases onto y = 0 and
    grows to its full thickness."""
    points = bezier(
        (side * start[0], 0, start[1]),
        (side * control[0], 0, control[1]),
        (side * end[0], 0, end[1]),
        count,
    )
    along = path_t(points)
    ys, half_t = [], []
    for t in along:
        k = min(max((t - blend[0]) / (blend[1] - blend[0]), 0.0), 1.0)
        k = k * k * (3 - 2 * k)  # smoothstep, so the shank bends in and out of the move
        full = thickness[0] + (thickness[1] - thickness[0]) * t
        half_t.append(root / 2 + (full - root / 2) * k)
        ys.append(layer * (SCISSOR_CLEARANCE + root / 2) * (1 - k))
    loft(
        bm,
        [(p.x, y, p.z) for p, y in zip(points, ys)],
        axis=(0, 1, 0),
        half_width=[width[0] + (width[1] - width[0]) * t for t in along],
        half_thickness=half_t,
        section=superellipse(14, 3.2),
        material=material,
    )
