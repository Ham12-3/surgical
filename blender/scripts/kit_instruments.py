"""
Parts shared by ring-handled instruments: needle holders, haemostats,
scissors, towel clips, self-retaining retractors. An asset script that uses
them names this file on a `# kit: kit_instruments.py` line, and build.py
prepends it after kit.py and kit_shapes.py.

Coordinates are the instrument's own, in Blender axes as the asset scripts
use them: tip at the origin, body up +Z, jaws opening along X, thickness
along Y. `side` is +1 or -1, the side of the midline a part is on.

A ring-handled instrument is two rigid halves crossing at a joint, each with
its jaw on one side of the midline and its shank and ring on the other, each
hung from its own pivot at the joint with hinge() (kit_shapes.py).
inst_needle_holder_mayo_hegar.py shows the pattern.
"""


def blunt_nose(z, length):
    """Scale for a section `z` from a tip, rounding the last `length` on a
    quarter circle, so a jaw or blade ends blunt rather than cut off."""
    d = min(z / length, 1.0)
    return max(0.08, math.sqrt(1 - (1 - d) ** 2))


def end_rounding(z, bottom, top, radius, least=0.78):
    """Scale for a block's section near its ends at `bottom` and `top`,
    rounding its edges over `radius`; `least` is the scale right at an end."""
    d = min(min(z - bottom, top - z) / radius, 1.0)
    return least + (1 - least) * math.sqrt(max(0.0, 1 - (1 - d) ** 2))


def screw_head(bm, z, face_y, radius, material, x=0.0):
    """A domed screw head on each face of a joint at height `z`. It starts
    just inside the face at `face_y` and stands about a quarter of its radius
    proud of it."""
    heights = [-0.143, 0.0, 0.095, 0.19, 0.262]
    dome = [radius * k for k in (1.0, 1.0, 0.905, 0.619, 0.19)]
    for face in (1, -1):
        loft(
            bm,
            [(x, face * (face_y + radius * k), z) for k in heights],
            axis=(0, 0, 1),
            half_width=dome,
            half_thickness=dome,
            section=superellipse(16, 2.0),
            material=material,
        )


def box_lock(bm, bottom, top, screw_z, half_width, half_thickness, material, dark, screw_radius, rounding=0.0013):
    """The box where the halves of a haemostat or needle holder cross, with a
    screw head on each face and two seams marking where the other half passes
    through it. Build it into the half whose jaw is on +x: turning about the
    screw, it only spins in place."""
    ends = [rounding * k for k in (0.0, 0.115, 0.31, 0.615, 1.0)]
    zs = [bottom + e for e in ends]
    zs += [(bottom + top) / 2] + [top - e for e in reversed(ends)]
    loft(
        bm,
        [(0, 0, z) for z in zs],
        axis=(0, 1, 0),
        half_width=[half_width * end_rounding(z, bottom, top, rounding) for z in zs],
        half_thickness=[half_thickness * end_rounding(z, bottom, top, rounding) for z in zs],
        section=superellipse(24, 5.0),
        material=material,
    )
    screw_head(bm, screw_z, half_thickness, screw_radius, dark)
    # The seams stand 0.02 mm proud of the block's face where they cross it,
    # which on the exponent-5 section is a little inside half_thickness.
    seam_x = 0.646 * half_width
    face_y = half_thickness * (1 - (seam_x / half_width) ** 5) ** 0.2 + 0.00002
    for face in (1, -1):
        for x in (-seam_x, seam_x):
            loft(
                bm,
                [(x, face * face_y, z) for z in (bottom + rounding, top - rounding)],
                axis=(0, 1, 0),
                half_width=0.00016,
                half_thickness=0.00008,
                section=superellipse(8, 4.0),
                material=dark,
            )


def shank(bm, side, start, control, end, width, thickness, material, count=22):
    """A forged shank on `side`, from inside the joint out to its ring, along
    a quadratic Bezier through (x, z) points given as for side +1. `width`
    and `thickness` are (start, end) half-sizes: forged shanks thin slightly
    as they go."""
    points = bezier(
        (side * start[0], 0, start[1]),
        (side * control[0], 0, control[1]),
        (side * end[0], 0, end[1]),
        count,
    )
    along = path_t(points)
    loft(
        bm,
        points,
        axis=(0, 1, 0),
        half_width=[width[0] + (width[1] - width[0]) * t for t in along],
        half_thickness=[thickness[0] + (thickness[1] - thickness[0]) * t for t in along],
        section=superellipse(14, 3.5),
        material=material,
    )


def finger_ring(bm, side, join, a, b, join_angle, material, half_width=0.0016, half_thickness=0.0015, steps=44):
    """An oval finger ring on `side`, placed so a shank ending at `join` ((x,
    z) as for side +1) lands on the ring's centreline at `join_angle`
    (radians anticlockwise from +x, as for side +1) and is buried in it
    there. `a` and `b` are the centreline's half-width and half-height.
    Returns the height of the ring's centre, where the hand grips."""
    cz = join[1] - b * math.sin(join_angle)
    cx = side * (join[0] - a * math.cos(join_angle))
    points = [
        (cx + a * math.cos(t), 0, cz + b * math.sin(t))
        for t in (2 * math.pi * i / steps for i in range(steps))
    ]
    loft(
        bm,
        points,
        axis=(0, 1, 0),
        half_width=half_width,
        half_thickness=half_thickness,
        section=superellipse(12, 2.6),
        material=material,
        closed=True,
    )
    return cz


def toothed_bar(root, tip, z_back, z_base, z_teeth, count, pitch=0.0014):
    """Outline of a ratchet bar running from x = root out to x = tip: a
    straight back edge, and teeth along the other edge nearest the tip."""
    step = 1 if tip > root else -1
    outline = [(root, z_back), (tip, z_back)]
    x = tip
    for _ in range(count):
        outline.append((x, z_teeth))  # the square face of a tooth
        x -= step * pitch
        outline.append((x, z_base))  # its sloped back
    outline.append((root, z_base))
    return outline


def ratchet_bar(bm, side, z_mid, material, root_x=0.0105, tip_x=0.003, count=5, pitch=0.0014, depth=0.0018, tooth=0.0004, thickness=0.0013, clearance=0.0001):
    """The toothed bar off the shank on `side`, running from x = root_x on its
    own side across the midline to tip_x on the other. The two bars sit face
    to face either side of y = 0 with their teeth interleaved about `z_mid`
    (the +1 bar above, teeth down; the -1 bar below, teeth up): the lock
    that holds the jaws shut."""
    s = 1 if side > 0 else -1
    outline = toothed_bar(
        s * root_x,
        -s * tip_x,
        z_mid + s * (tooth + depth),
        z_mid + s * tooth,
        z_mid - s * tooth,
        count,
        pitch,
    )
    if s > 0:
        plate(bm, outline, clearance, clearance + thickness, material)
    else:
        plate(bm, outline, -clearance - thickness, -clearance, material)
