"""
inst_needle_holder_mayo_hegar: needle holder, Mayo-Hegar pattern, closed on
its ratchet, with a working hinge.

Runs with blender/scripts/kit.py and kit_shapes.py prepended (see build.py),
so kit's helpers and imports are already in scope. Draws the `needle_holder`
tool mesh (see assets/manifest.json). Coordinates here are Blender's: tip at
the origin, body up +Z, jaws opening along X, thickness along Y. The kit's
app() maps the instrument's own axes (x across the jaws, y along the body,
z through it) onto the same thing, which is what hinge() and empty() take.

Two rigid halves cross at the box lock, as in the real instrument: each has a
jaw on one side of the midline and its shank and ring on the other. Each hangs
from its own pivot at the screw (`jaw_upper` carries the +x jaw), so turning
the pivots apart opens the jaws and spreads the rings.

Recognisable rather than exact, like the procedural instruments. What a
student needs to read at a glance is short, heavy jaws with a dark grip
insert, a box lock, and a ratchet between the rings.
"""

ASSET = "inst_needle_holder_mayo_hegar"
MATERIALS = ["steel", "steelDark"]
STEEL, DARK = 0, 1

# Heights up the instrument from the tip, in metres. Overall length and ring
# spread match the procedural model, so the tray layout still fits.
JAW_TOP = 0.019
LOCK_BOTTOM, LOCK_TOP = 0.0175, 0.0305
SCREW_Z = 0.024
SHANK_END_X, SHANK_END_Z = 0.0125, 0.098

# Half the gap between the two jaw halves, filled by the dark grip insert.
INSERT_GAP = 0.00025

# Finger rings: half-width and half-height of the ring's centreline, and the
# angle round the ring (from +x, anticlockwise) where the shank joins it.
RING_A, RING_B = 0.0098, 0.0108
RING_JOIN = math.radians(235)
RING_CZ = SHANK_END_Z - RING_B * math.sin(RING_JOIN)  # ring centres' height

# Where a needle is gripped, close to the jaw tips. The needle is its own
# model, attached here at run time.
# TODO(clinical review): which side the needle's point faces for a
# right-handed forehand pass has not been checked against a reference.
NEEDLE_Z = 0.0035


def nose(z, length=0.0016):
    """Quarter-round the last 1.6 mm, so the jaws end blunt, not cut off."""
    d = min(z / length, 1.0)
    return max(0.08, math.sqrt(1 - (1 - d) ** 2))


def lock_rounding(z, radius=0.0013):
    """Scale for the box lock's section near its ends, rounding its edges."""
    d = min(min(z - LOCK_BOTTOM, LOCK_TOP - z) / radius, 1.0)
    return 0.78 + 0.22 * math.sqrt(max(0.0, 1 - (1 - d) ** 2))


def jaw(bm, side):
    # One D-section jaw on the `side` of the midline, tapering to the blunt
    # nose, with its half of the dark grip insert along its inner face.
    zs = [0.0, 0.0002, 0.0005, 0.001, 0.0016, 0.003, 0.006, 0.010, 0.014, JAW_TOP]
    beak = [(0.0017 + 0.0019 * (z / JAW_TOP) ** 1.2) * nose(z) for z in zs]
    depth = [(0.0014 + 0.0010 * z / JAW_TOP) * nose(z) for z in zs]
    gap = [INSERT_GAP * nose(z) for z in zs]
    loft(
        bm,
        [(side * g, 0, z) for g, z in zip(gap, zs)],
        axis=(0, side, 0),  # flips the side direction to -x for the left jaw
        half_width=[b - g for b, g in zip(beak, gap)],
        half_thickness=depth,
        section=half_superellipse(10, 3.0),
        material=STEEL,
    )
    # The insert fills this jaw's half of the gap and just crosses the
    # midline, so the closed jaws show one unbroken dark line; it sits a
    # little below the jaw faces so it reads as a groove.
    loft(
        bm,
        [(side * g / 2, 0, z) for g, z in zip(gap[3:], zs[3:])],
        axis=(0, 1, 0),
        half_width=[g / 2 + 0.00003 for g in gap[3:]],
        half_thickness=[0.86 * d for d in depth[3:]],
        section=superellipse(8, 6.0),
        material=DARK,
    )


def box_lock(bm):
    # The box where the halves cross, with a screw head on each face and two
    # seams marking where the other half passes through it. It belongs to the
    # upper half; turning about the screw, it only spins in place.
    ends = [0.0, 0.00015, 0.0004, 0.0008, 0.0013]
    zs = [LOCK_BOTTOM + e for e in ends]
    zs += [(LOCK_BOTTOM + LOCK_TOP) / 2] + [LOCK_TOP - e for e in reversed(ends)]
    loft(
        bm,
        [(0, 0, z) for z in zs],
        axis=(0, 1, 0),
        half_width=[0.0048 * lock_rounding(z) for z in zs],
        half_thickness=[0.0029 * lock_rounding(z) for z in zs],
        section=superellipse(24, 5.0),
        material=STEEL,
    )
    for face in (1, -1):
        dome = [0.0021, 0.0021, 0.0019, 0.0013, 0.0004]
        loft(
            bm,
            [(0, face * y, SCREW_Z) for y in (0.0026, 0.0029, 0.0031, 0.0033, 0.00345)],
            axis=(0, 0, 1),
            half_width=dome,
            half_thickness=dome,
            section=superellipse(16, 2.0),
            material=DARK,
        )
        # The block's face sits at y = 0.00283 this far off the midline, so
        # these stand about 0.1 mm proud of it.
        for x in (-0.0031, 0.0031):
            loft(
                bm,
                [(x, face * 0.00285, z) for z in (0.0188, 0.0292)],
                axis=(0, 1, 0),
                half_width=0.00016,
                half_thickness=0.00008,
                section=superellipse(8, 4.0),
                material=DARK,
            )


def shank(bm, side):
    # A shank from inside the box lock out to the ring on `side`, thinning
    # slightly as it goes, as forged shanks do.
    points = bezier(
        (side * 0.0024, 0, 0.0285),
        (side * 0.0040, 0, 0.066),
        (side * SHANK_END_X, 0, SHANK_END_Z),
        22,
    )
    along = path_t(points)
    loft(
        bm,
        points,
        axis=(0, 1, 0),
        half_width=[0.0021 - 0.0005 * t for t in along],
        half_thickness=[0.0017 - 0.0002 * t for t in along],
        section=superellipse(14, 3.5),
        material=STEEL,
    )


def ring(bm, side):
    # An oval finger ring, placed so the shank's end lands on its centreline
    # at RING_JOIN and is buried inside it there.
    cx = side * (SHANK_END_X - RING_A * math.cos(RING_JOIN))
    steps = 44
    points = [
        (cx + RING_A * math.cos(a), 0, RING_CZ + RING_B * math.sin(a))
        for a in (2 * math.pi * i / steps for i in range(steps))
    ]
    loft(
        bm,
        points,
        axis=(0, 1, 0),
        half_width=0.0016,
        half_thickness=0.0015,
        section=superellipse(12, 2.6),
        material=STEEL,
        closed=True,
    )


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


def ratchet(bm, side):
    # The toothed bar off the shank on `side`. The two bars sit face to face
    # in y with their teeth interleaved: the lock that holds the jaws shut.
    if side > 0:
        plate(bm, toothed_bar(0.0105, -0.0030, 0.0912, 0.0894, 0.0886, 5), 0.0001, 0.0014, STEEL)
    else:
        plate(bm, toothed_bar(-0.0105, 0.0030, 0.0868, 0.0886, 0.0894, 5), -0.0014, -0.0001, STEEL)


def build():
    upper = bmesh.new()  # jaw on +x; shank, ring and ratchet bar on -x
    jaw(upper, 1)
    box_lock(upper)
    shank(upper, -1)
    ring(upper, -1)
    ratchet(upper, -1)
    lower = bmesh.new()  # jaw on -x; shank, ring and ratchet bar on +x
    jaw(lower, -1)
    shank(lower, 1)
    ring(lower, 1)
    ratchet(lower, 1)

    upper_half = finish(upper, ASSET + "_upper", MATERIALS)
    lower_half = finish(lower, ASSET + "_lower", MATERIALS)
    pivot = (0.0, SCREW_Z, 0.0)
    return [
        upper_half,
        lower_half,
        hinge("jaw_upper", pivot, [upper_half]),
        hinge("jaw_lower", pivot, [lower_half]),
        # Between the rings, where thumb and ring finger hold it.
        empty("grip_point", (0.0, RING_CZ, 0.0)),
        empty("needle_grip", (0.0, NEEDLE_Z, 0.0)),
    ]
