"""
env_surgical_light: a ceiling-mounted surgical light with a main head and a
smaller satellite head, each on its own arm from a central drop tube.

Runs with kit.py and kit_shapes.py prepended (see build.py). The origin is the
centre of the main head's lens face, which faces straight down, and a
`lens_main` node marks it. The app puts its spot light there, hangs the model
around it, and moves the whole light to follow the operative field
(src/scene/models/operatingRoom.ts). The drop tube runs well above the ceiling
so it still disappears into it wherever the light moves.
"""

MATERIALS = ["paint", "lightLens", "steelDark", "handle", "steel"]
PAINT, LENS, RING, GRIP, STEEL = 0, 1, 2, 3, 4

AXIS_X, AXIS_Z = 0.5, -0.35  # the drop tube, off to one side of the field
# Ceiling height above the main lens: a 3.0 m ceiling over the forearm case,
# whose lamp hangs 0.94 m above a field at y = 0.99.
CEILING_ABOVE_LENS = 1.07
FIELD_FROM_LENS = (0.0, -0.94, 0.1)  # the operative field, seen from the main lens
SATELLITE = (0.75, 0.22, 0.25)  # satellite head centre, from the main lens
YOKE_TOP = 0.31  # where a head's arm joins it, above its lens


def lamp_head(bm, radius):
    """A head centred on the origin, lens face down at y = 0: a domed white
    housing, a glowing lens with two dark reflector rings on it, a sterile
    handle in the middle, and a short yoke on top."""
    housing = [
        (radius, 0.004),
        (radius + 0.012, 0.02),
        (radius + 0.004, 0.055),
        (radius * 0.78, 0.095),
        (radius * 0.35, 0.118),
        (0.001, 0.124),
    ]
    lathe_part(bm, (0.0, 0.0, 0.0), (0, 1, 0), housing, PAINT, 36)
    lathe_part(bm, (0.0, -0.004, 0.0), (0, 1, 0), [(radius - 0.02, 0.0), (radius - 0.02, 0.009)], LENS, 36)
    steps = 36
    for fraction in (0.35, 0.68):
        ring = [
            app(fraction * radius * math.cos(a), -0.0055, fraction * radius * math.sin(a))
            for a in (2 * math.pi * i / steps for i in range(steps))
        ]
        loft(bm, ring, app(0, 1, 0), 1.0, 1.0, rounded_rect(0.005, 0.0016, 0.001), RING, closed=True)
    grip = [(0.026, 0.0), (0.021, 0.012), (0.018, 0.10), (0.023, 0.108), (0.001, 0.114)]
    lathe_part(bm, (0.0, -0.004, 0.0), (0, -1, 0), grip, GRIP, 18)
    yoke = [(0.028, 0.0), (0.024, 0.02), (0.024, YOKE_TOP - 0.14), (0.001, YOKE_TOP - 0.12)]
    lathe_part(bm, (0.0, 0.12, 0.0), (0, 1, 0), yoke, PAINT, 16)


def tilt_towards(target):
    """Axis and angle that turn a straight-down lens to face `target`, a
    point given relative to the head."""
    d = Vector(target).normalized()
    down = Vector((0.0, -1.0, 0.0))
    axis = down.cross(d).normalized()
    return (axis.x, axis.y, axis.z), math.degrees(down.angle(d))


def joint(bm, centre):
    # A ball joint where an arm meets a yoke, hiding the change of direction.
    ball = [(0.001, 0.0), (0.03, 0.008), (0.04, 0.03), (0.03, 0.052), (0.001, 0.06)]
    lathe_part(bm, (centre[0], centre[1] - 0.03, centre[2]), (0, 1, 0), ball, STEEL, 16)


def arm(bm, start, end):
    """A spring arm from `start` to `end`: out level from the drop tube, then
    curving down to the head, all in one vertical plane."""
    bend = (start[0] + (end[0] - start[0]) * 0.8, start[1], start[2] + (end[2] - start[2]) * 0.8)
    points = bezier(start, bend, end, 18)
    dx, dz = end[0] - start[0], end[2] - start[2]
    length = math.hypot(dx, dz)
    # A level axis square to the arm's plane, so its section never twists.
    axis = app(-dz / length, 0.0, dx / length)
    loft(bm, [app(p.x, p.y, p.z) for p in points], axis, 1.0, 1.0, rounded_rect(0.032, 0.026, 0.012), PAINT)


def mounting(bm):
    # Drop tube from well above the ceiling down to the arm hubs, the ceiling
    # canopy it hangs from, and a hub where each arm leaves the tube.
    lathe_part(bm, (AXIS_X, 0.52, AXIS_Z), (0, 1, 0), [(0.045, 0.0), (0.036, 0.03), (0.036, 0.95)], PAINT, 20)
    canopy = [(0.001, 0.0), (0.2, 0.004), (0.2, 0.03), (0.16, 0.045), (0.001, 0.048)]
    lathe_part(bm, (AXIS_X, CEILING_ABOVE_LENS - 0.048, AXIS_Z), (0, 1, 0), canopy, PAINT, 32)
    hub = [(0.05, 0.0), (0.055, 0.01), (0.055, 0.05), (0.05, 0.06)]
    for y in (0.6, 0.8):
        lathe_part(bm, (AXIS_X, y - 0.03, AXIS_Z), (0, 1, 0), hub, STEEL, 20)


def build():
    bm = bmesh.new()
    lamp_head(bm, 0.30)

    # The satellite head is built at the origin, turned to face the field,
    # then moved out to its place.
    target = [f - s for f, s in zip(FIELD_FROM_LENS, SATELLITE)]
    axis, angle = tilt_towards(target)
    first = len(bm.verts)
    lamp_head(bm, 0.22)
    place_part(bm, first, SATELLITE, axis, angle)
    turn = Matrix.Rotation(math.radians(angle), 3, Vector(axis))
    top = Vector(SATELLITE) + turn @ Vector((0.0, YOKE_TOP, 0.0))

    mounting(bm)
    arm(bm, (AXIS_X, 0.6, AXIS_Z), (0.0, YOKE_TOP, 0.0))
    arm(bm, (AXIS_X, 0.8, AXIS_Z), (top.x, top.y, top.z))
    joint(bm, (0.0, YOKE_TOP, 0.0))
    joint(bm, (top.x, top.y, top.z))

    light = finish(bm, "env_surgical_light", MATERIALS)
    lens = empty("lens_main", (0.0, 0.0, 0.0))
    return [light, lens]
