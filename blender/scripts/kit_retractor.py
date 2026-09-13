"""
Parts for hand-held retractors bent from flat bar. A script that uses them
names both kits, `# kit: kit_flat.py` and then `# kit: kit_retractor.py`,
because the strap and the loop here are drawn with flat_section() from
kit_flat.py. The names keep the flat-stock family's `flat_` prefix.

Coordinates are the instrument's own, in Blender axes as the asset scripts
use them: working edge at the origin, handle up +Z, the bar bent in the YZ
plane with its width along X. Everything is in metres.
"""


def flat_turtle(start, heading, moves):
    """A path in the YZ plane as (0, y, z) points, with the distance along it
    to each: from `start` (y, z) heading `heading` degrees (0 is +Y, 90 is
    +Z), each move (length, turn, step) runs `length` while turning `turn`
    degrees evenly, a point at least every `step` and every 7.5 degrees."""
    y, z = start
    a = math.radians(heading)
    points, lengths = [(0.0, y, z)], [0.0]
    for length, turn, step in moves:
        count = max(1, math.ceil(length / step), math.ceil(abs(turn) / 7.5))
        ds, da = length / count, math.radians(turn) / count
        # Each chord of an arc runs along the arc's middle heading.
        chord = ds if da == 0 else 2.0 * ds / da * math.sin(da / 2)
        for i in range(count):
            y += chord * math.cos(a + da / 2)
            z += chord * math.sin(a + da / 2)
            a += da
            points.append((0.0, y, z))
            lengths.append(lengths[-1] + ds)
    return points, lengths


def flat_point_at(points, lengths, s):
    """The point `s` along a path from flat_turtle(), as a Vector."""
    for i in range(len(points) - 1):
        if s <= lengths[i + 1] or i == len(points) - 2:
            k = min(max((s - lengths[i]) / (lengths[i + 1] - lengths[i]), 0.0), 1.0)
            return Vector(points[i]).lerp(Vector(points[i + 1]), k)


def flat_corner(half_width, d, radius):
    """Half-width `d` from a square end whose corners are rounded to `radius`."""
    k = max(0.0, radius - d)
    return half_width - radius + math.sqrt(max(0.0, radius * radius - k * k))


def flat_strap(bm, points, half_t, half_widths, material, radius=0.0005):
    """Flat bar along a path in the YZ plane, `half_t` thick either side of
    the path and `half_widths` (one per point) across along X, its edges
    rounded to `radius`. With axis X, loft() lays section x square to the
    path within the YZ plane and section y along X."""
    sections = [flat_section(half_t, w, radius) for w in half_widths]
    loft(bm, points, (1, 0, 0), 1.0, 1.0, sections, material)


def flat_loop(bm, y, z0, z1, half_width, band, half_t, material, radius=0.0006):
    """A closed finger loop lying in the XZ plane at `y`: a stadium from z0 to
    z1 and `half_width` across, outside, bent from a band `band` wide in the
    plane and `half_t` thick either side of y."""
    r = half_width - band / 2  # the band's centreline round each end
    low, high = z0 + half_width, z1 - half_width
    rails = max(1, math.ceil((high - low) / 0.008))
    ends = [math.pi * i / 16 for i in range(16)]
    points = [(r, y, low + (high - low) * i / rails) for i in range(rails)]
    points += [(r * math.cos(a), y, high + r * math.sin(a)) for a in ends]
    points += [(-r, y, high - (high - low) * i / rails) for i in range(rails)]
    points += [(-r * math.cos(a), y, low - r * math.sin(a)) for a in ends]
    loft(bm, points, (0, 1, 0), 1.0, 1.0, flat_section(band / 2, half_t, radius), material, closed=True)


def flat_seat(bm):
    """Move everything so its lowest point is at z = 0 and, of the lowest
    vertices, the one furthest toward -Y is at y = 0: the working edge on the
    origin. Returns the move, for placing nodes."""
    verts = list(bm.verts)
    low = min(v.co.z for v in verts)
    y0 = min(v.co.y for v in verts if v.co.z < low + 0.00005)
    shift = Vector((0.0, -y0, -low))
    bmesh.ops.translate(bm, vec=shift, verts=verts)
    return shift
