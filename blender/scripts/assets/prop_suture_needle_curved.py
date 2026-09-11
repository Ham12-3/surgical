# kit: kit_moulded.py
"""
prop_suture_needle_curved: a 3/8-circle curved suture needle with a
reverse-cutting point, about 19 mm along its arc.

Runs with kit.py, kit_shapes.py and kit_moulded.py prepended (see build.py).
A prop with no tool mesh of its own: the app attaches it to the needle
holder's jaws. It lies in the Blender XZ plane with its origin where the
needle holder grips it, two thirds of the way along the arc from the point;
the arc's centre is straight above that, so the needle hangs in a smile with
the point up at +x and the swaged end up at -x.

What reads at a glance is the curve and the difference between its ends: a
sharp triangular point at one, a slightly thicker blunt swage, where the
thread enters, at the other. In between the round body flattens a little on
its inner and outer curves, the faces the needle holder's jaws close on.
"""

# TODO(clinical review): point type (reverse cutting assumed), needle size, and the grip position (two thirds from the point, as the catalogue's needle holder description says) need confirming.
# The flats are assumed to face the inner and outer curves, where the jaws
# bear when the needle is held square to the needle holder; that is also
# unchecked.

ASSET = "prop_suture_needle_curved"
MATERIALS = ["steel", "suture"]
STEEL, THREAD = 0, 1

RADIUS = 0.008  # of the circle the needle follows
ARC = math.radians(135)  # 3/8 of a circle
WIRE_R = 0.00036  # a 0.72 mm wire
GRIP_FROM_POINT = 2 / 3

# Fractions of the arc from the point.
POINT_END = 0.08  # the point tapers to full size over this much
TRIANGLE_END, ROUND_START = 0.07, 0.18  # the cutting edges fade into the round body
FLAT_IN, FLAT_OUT = (0.30, 0.45), (0.82, 0.90)  # where the flattening comes and goes
SWAGE = (0.90, 0.93)  # the swage thickens over this span
FLAT = 0.84  # half-size across the flats, as a fraction of round
SWAGE_GROWTH = 0.12
SIDES = 15  # section points: a multiple of 3, for the triangle's corners
TRIANGLE_SCALE = 1.0  # the triangle's corner radius, in wire radii: inscribed in the wire

# The arc's angles about its centre (0, 0, RADIUS). The grip sits at the
# bottom (-90 degrees), so the point is two thirds of the arc round from it.
POINT_ANGLE = -math.pi / 2 + GRIP_FROM_POINT * ARC


def arc_point(t):
    """The centreline a fraction `t` of the way from the point to the swage."""
    angle = POINT_ANGLE - t * ARC
    return Vector((RADIUS * math.cos(angle), 0.0, RADIUS + RADIUS * math.sin(angle)))


def needle(bm):
    ts = [(i / 55) ** 1.25 for i in range(56)]
    ts = sorted(set(ts[:-1] + [0.925, 0.95, 0.975, 0.99, 0.997, 1.0]))
    length = RADIUS * ARC
    triangle = [(x * TRIANGLE_SCALE, y * TRIANGLE_SCALE) for x, y in moulded_triangle(SIDES)]
    circle = superellipse(SIDES, 2.0)
    sizes, radial, sections = [], [], []
    for t in ts:
        taper = max(0.04, min(1.0, t / POINT_END) ** 0.8)
        swage = 1 + SWAGE_GROWTH * moulded_smoothstep(t, SWAGE[0], SWAGE[1])
        chamfer = moulded_round((1 - t) * length, 0.00015, 0.8)
        size = WIRE_R * taper * swage * chamfer
        flat = 1 - (1 - FLAT) * moulded_smoothstep(t, FLAT_IN[0], FLAT_IN[1]) * (1 - moulded_smoothstep(t, FLAT_OUT[0], FLAT_OUT[1]))
        sizes.append(size)
        radial.append(size * flat)
        sections.append(moulded_blend(triangle, circle, moulded_smoothstep(t, TRIANGLE_END, ROUND_START)))
    # With the axis along -y and the path running from point to swage, the
    # section's +x is radially outward, so the triangle's corner on +x puts
    # the third cutting edge on the outer curve: a reverse-cutting point.
    loft(bm, [arc_point(t) for t in ts], (0, -1, 0), radial, sizes, sections, STEEL)

    # A dark disc on the swaged end, where the thread goes in.
    end = arc_point(1.0)
    direction = (end - arc_point(0.995)).normalized()
    disc = [(0.0, -0.00004), (0.62 * WIRE_R, -0.00004), (0.62 * WIRE_R, 0.00003), (0.0, 0.00003)]
    moulded_revolve(bm, end, direction, disc, THREAD, 12)


def build():
    bm = bmesh.new()
    # The needle lies in the XZ plane, so every ring has a vertex on y = 0;
    # finish() moves those off zero, or the export would snap them to a
    # half-millimetre grid (kit.py, ZERO_NUDGE).
    needle(bm)
    obj = finish(bm, ASSET, MATERIALS)
    tip, swage = arc_point(0.0), arc_point(1.0)
    # empty() takes app coordinates, where Blender (x, 0, z) is (x, z, 0).
    return [obj, empty("needle_tip", (tip.x, tip.z, 0.0)), empty("swage", (swage.x, swage.z, 0.0))]
