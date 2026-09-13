# kit: kit_moulded.py
"""
inst_suction_yankauer: Yankauer suction tip, the disposable clear-plastic
kind, about 26 cm long.

Runs with kit.py, kit_shapes.py and kit_moulded.py prepended (see build.py).
Draws the `suction` tool mesh. Coordinates are Blender's: working tip at the
origin, body up +Z, the bend in the XZ plane.

What makes it read as a Yankauer at a glance, and not a diathermy pencil: its
length, the gentle bend near the tip, the bulbous guarded tip with a ring of
small side holes round its open end, a thick ribbed hand grip, and the barbed
hose connector at the far end. All of it is clear polymer (`plastic`); the
holes and the mouths of the tip and connector are dark insets, which read as
openings through the app's translucent plastic.

The plain, unvented pattern: some handles also carry a thumb port that the
user covers to start suction, and that is left out here.
"""

ASSET = "inst_suction_yankauer"
MATERIALS = ["plastic", "handle"]
CLEAR, DARK = 0, 1

# The tube: a straight tip section angled off the handle's line, a gentle
# bend, then straight up into the grip.
TIP_ANGLE = math.radians(30)  # between the tip section and the handle
TIP_RUN = 0.045  # from the tip to the start of the bend, along the tip section
BEND_RADIUS = 0.09
TUBE_R, TUBE_TIP_R = 0.0034, 0.0027  # the tube tapers from the grip to the bulb

# Heights up the handle's line, in metres.
GRIP_BOTTOM, GRIP_TOP = 0.14, 0.222  # the ribbed part of the grip
CONNECTOR_TOP = 0.26

# The bulb, measured along the tip section from its open end.
OPENING_R = 0.0015  # the central opening
RIM_R = 0.0022  # outer edge of the flat rim round it
BULB_R = 0.0048  # widest, the guard that holds tissue off the opening
DOME_H = 0.005  # rim to widest
NECK_H = 0.0132  # where the bulb has narrowed onto the tube
HOLE_R = 0.0007
HOLE_T = 1.0  # where on the dome the side holes sit (see bulb())


def tip_axis():
    """Unit vector up the tip section from its open end, leaning toward the
    handle's line on -x, and the unit vector square to it in the bend plane."""
    return Vector((-math.sin(TIP_ANGLE), 0.0, math.cos(TIP_ANGLE))), Vector((math.cos(TIP_ANGLE), 0.0, math.sin(TIP_ANGLE)))


def tube_path():
    """Centreline from inside the bulb to inside the grip, and the x of the
    handle's line. The bend turns the tip direction u to +z on an arc about a
    centre on the +x side of the tip section."""
    u, n = tip_axis()
    points = [u * s for s in (0.009, 0.025, TIP_RUN)]
    centre = u * TIP_RUN + n * BEND_RADIUS
    steps = 12
    for k in range(1, steps + 1):
        phi = TIP_ANGLE * k / steps
        points.append(centre - BEND_RADIUS * Vector((math.cos(TIP_ANGLE - phi), 0.0, math.sin(TIP_ANGLE - phi))))
    handle_x, bend_top = points[-1].x, points[-1].z
    points += [Vector((handle_x, 0.0, z)) for z in (bend_top + 0.02, GRIP_BOTTOM - 0.01)]
    return points, handle_x


def bulb(bm):
    """The guarded tip, turned about the tip axis: a hollow mouth, a flat rim,
    a dome out to the widest point, then a neck narrowing onto the tube."""
    u, n = tip_axis()
    a, b = BULB_R - RIM_R, DOME_H  # half-axes of the quarter-ellipse dome
    profile = [(OPENING_R, 0.0025), (OPENING_R, 0.0004), (OPENING_R + 0.00025, 0.00003)]
    for k in range(8):
        t = (math.pi / 2) * k / 7
        profile.append((RIM_R + a * math.sin(t), b * (1 - math.cos(t))))
    profile += [(BULB_R, 0.0068), (0.0045, 0.0086), (0.0038, 0.0103), (0.0032, 0.0118), (TUBE_TIP_R + 0.00015, NECK_H), (TUBE_TIP_R + 0.00015, NECK_H + 0.001)]
    moulded_revolve(bm, (0, 0, 0), u, profile, CLEAR, 24)
    # A dark floor just inside the mouth, so it reads as an opening.
    floor = [(0.0, 0.0023), (OPENING_R * 0.97, 0.0023), (OPENING_R * 0.97, 0.00245), (0.0, 0.00245)]
    moulded_revolve(bm, (0, 0, 0), u, floor, DARK, 16)

    # Four small side holes round the dome, near the rim: the guard vents.
    # On the dome a point is (RIM_R + a sin t, b (1 - cos t)) in (radius,
    # height), and its outward normal is along (sin t / a, -cos t / b).
    r = RIM_R + a * math.sin(HOLE_T)
    h = b * (1 - math.cos(HOLE_T))
    nr, nh = math.sin(HOLE_T) / a, -math.cos(HOLE_T) / b
    length = math.hypot(nr, nh)
    nr, nh = nr / length, nh / length
    side = u.cross(n)  # the third direction, square to the bend plane
    hole = [(0.0, -0.00025), (HOLE_R, -0.00025), (HOLE_R, 0.00003), (0.0, 0.00003)]
    for k in range(4):
        angle = math.pi / 4 + k * math.pi / 2
        radial = n * math.cos(angle) + side * math.sin(angle)
        point = u * h + radial * r
        moulded_revolve(bm, point, radial * nr + u * nh, hole, DARK, 10)


def grip_and_connector(bm, handle_x):
    """The hand grip, a flare off the tube into moulded rings, and the barbed
    hose connector above it, open at the end."""
    profile = [(TUBE_R + 0.0002, GRIP_BOTTOM - 0.018), (0.0039, GRIP_BOTTOM - 0.013), (0.0050, GRIP_BOTTOM - 0.008), (0.0058, GRIP_BOTTOM - 0.003)]
    profile += moulded_ribs(GRIP_BOTTOM, GRIP_TOP, 12, 0.0060, 0.0067)
    profile += [(0.0061, GRIP_TOP + 0.004), (0.0057, GRIP_TOP + 0.007), (0.0049, GRIP_TOP + 0.009)]
    # Three barbs that grip the tubing: each steps out sharply toward the
    # grip and ramps in toward the open end, so tubing slides on and stays.
    z = GRIP_TOP + 0.0105
    for _ in range(3):
        profile += [(0.0048, z), (0.0041, z + 0.0068)]
        z += 0.007
    profile += [(0.0038, CONNECTOR_TOP - 0.0004), (0.0034, CONNECTOR_TOP), (0.0026, CONNECTOR_TOP), (0.0026, CONNECTOR_TOP - 0.006)]
    moulded_revolve(bm, (handle_x, 0, 0), (0, 0, 1), profile, CLEAR, 22)
    floor = [(0.0, CONNECTOR_TOP - 0.0058), (0.0025, CONNECTOR_TOP - 0.0058), (0.0025, CONNECTOR_TOP - 0.0056), (0.0, CONNECTOR_TOP - 0.0056)]
    moulded_revolve(bm, (handle_x, 0, 0), (0, 0, 1), floor, DARK, 14)


def build():
    bm = bmesh.new()
    points, handle_x = tube_path()
    radii = [TUBE_TIP_R + (TUBE_R - TUBE_TIP_R) * t for t in path_t(points)]
    loft(bm, points, (0, 1, 0), radii, radii, superellipse(16, 2.0), CLEAR)
    bulb(bm)
    grip_and_connector(bm, handle_x)
    # The rim of the slanted tip dips about a millimetre below its centre;
    # lift the whole so that lowest edge, not the axis, touches the origin.
    lift = moulded_seat(bm)
    suction = finish(bm, ASSET, MATERIALS)
    return [
        suction,
        # Midway up the ribbed grip, on the handle's line.
        empty("grip_point", (handle_x, lift + (GRIP_BOTTOM + GRIP_TOP) / 2, 0.0)),
    ]
