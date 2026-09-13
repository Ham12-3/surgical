"""
env_theatre_shell: the operating theatre around the table. Panelled walls with
a handrail and floor coving, a sliding door, a wall display, storage cabinets,
and a ceiling with a laminar-airflow canopy over the table and light panels
around it.

Runs with kit.py and kit_shapes.py prepended (see build.py). The origin is the
room origin: the table stands on it and the patient lies along +z. The floor
is its own node, `floor`, the one surface the lamp's shadow is drawn on
(src/scene/models/operatingRoom.ts).
"""

MATERIALS = ["wall", "handle", "paint", "steel", "floor", "lightLens", "steelDark"]
WALL, DARK, PAINT, STEEL, FLOOR, GLOW, SATIN = 0, 1, 2, 3, 4, 5, 6

X0, X1 = -3.2, 3.2  # a 6.4 x 7.0 m room with a 3 m ceiling
Z0, Z1 = -3.4, 3.6
CEILING = 3.0
WALL_T = 0.1
PANEL = 1.2  # wall panel width between joints
CANOPY = 1.5  # half-width of the laminar-airflow canopy over the table


def walls(bm):
    # Four walls, floor to ceiling, just outside the room's footprint.
    slab(bm, (X0 - WALL_T, 0.0, Z0 - WALL_T), (X1 + WALL_T, CEILING, Z0), 0.01, WALL, along="x")
    slab(bm, (X0 - WALL_T, 0.0, Z1), (X1 + WALL_T, CEILING, Z1 + WALL_T), 0.01, WALL, along="x")
    slab(bm, (X0 - WALL_T, 0.0, Z0), (X0, CEILING, Z1), 0.01, WALL, along="z")
    slab(bm, (X1, 0.0, Z0), (X1 + WALL_T, CEILING, Z1), 0.01, WALL, along="z")


def trim(bm):
    # Panel joints up every wall, a bumper rail at bed height, and coving
    # where the floor turns up the wall so there is no corner to clean.
    s, proud = 0.006, 0.002
    x = X0 + PANEL
    while x < X1 - 0.3:
        for face, sign in ((Z0, 1), (Z1, -1)):
            slab(bm, (x - s, 0.08, face), (x + s, CEILING, face + sign * proud), 0.001, DARK, along="y")
        x += PANEL
    z = Z0 + PANEL
    while z < Z1 - 0.3:
        for face, sign in ((X0, 1), (X1, -1)):
            slab(bm, (face, 0.08, z - s), (face + sign * proud, CEILING, z + s), 0.001, DARK, along="y")
        z += PANEL
    for face, sign in ((Z0, 1), (Z1, -1)):
        slab(bm, (X0, 0.85, face), (X1, 0.95, face + sign * 0.03), 0.01, PAINT, along="x")
        slab(bm, (X0, 0.0, face), (X1, 0.08, face + sign * 0.02), 0.01, FLOOR, along="x")
    for face, sign in ((X0, 1), (X1, -1)):
        slab(bm, (face, 0.85, Z0), (face + sign * 0.03, 0.95, Z1), 0.01, PAINT, along="z")
        slab(bm, (face, 0.0, Z0), (face + sign * 0.02, 0.08, Z1), 0.01, FLOOR, along="z")


def door(bm):
    # A sliding door on the -x wall: steel frame, a satin steel panel (a
    # painted one was the brightest thing in the room and pulled the eye off
    # the table), vision window, kick plate and pull handle, each standing a
    # little proud of the last.
    z0, z1, top = -0.2, 1.4, 2.2
    front = X0 + 0.06
    slab(bm, (X0, 0.0, z0 - 0.06), (X0 + 0.05, top + 0.06, z1 + 0.06), 0.01, STEEL, along="z")
    slab(bm, (X0 + 0.02, 0.01, z0), (front, top, z1), 0.012, SATIN, along="z")
    slab(bm, (front - 0.005, 1.35, 0.35), (front + 0.005, 1.75, 0.85), 0.01, DARK, along="z")
    slab(bm, (front - 0.005, 0.05, z0 + 0.05), (front + 0.005, 0.35, z1 - 0.05), 0.004, STEEL, along="z")
    slab(bm, (front, 0.9, z1 - 0.12), (front + 0.03, 1.3, z1 - 0.08), 0.01, STEEL, along="y")


def wall_display(bm):
    # A wall-mounted display at the head end, dark when idle.
    slab(bm, (-0.2, 1.35, Z0), (1.0, 2.05, Z0 + 0.04), 0.015, PAINT, along="x")
    slab(bm, (-0.16, 1.39, Z0 + 0.035), (0.96, 2.01, Z0 + 0.05), 0.006, DARK, along="x")


def cabinets(bm):
    # Two recessed storage cabinets with glass doors on the +x wall.
    for z0 in (-2.4, -1.3):
        slab(bm, (X1 - 0.42, 0.0, z0), (X1, 1.9, z0 + 1.0), 0.01, PAINT, along="y")
        for door_z in (z0 + 0.05, z0 + 0.52):
            slab(bm, (X1 - 0.43, 1.0, door_z), (X1 - 0.415, 1.85, door_z + 0.43), 0.006, DARK, along="y")


def ceiling(bm):
    # Ceiling, the laminar-airflow canopy over the table with a grid of
    # diffuser panels and a lit border, and four light panels around it.
    slab(bm, (X0, CEILING, Z0), (X1, CEILING + 0.04, Z1), 0.005, PAINT, along="x")
    low = CEILING - 0.12
    slab(bm, (-CANOPY, low, -CANOPY), (CANOPY, CEILING, CANOPY), 0.01, PAINT, along="x")
    for k in range(1, 5):
        v = -CANOPY + k * 0.6
        slab(bm, (v - 0.004, low - 0.003, -CANOPY), (v + 0.004, low + 0.002, CANOPY), 0.001, DARK, along="z")
        slab(bm, (-CANOPY, low - 0.003, v - 0.004), (CANOPY, low + 0.002, v + 0.004), 0.001, DARK, along="x")
    for a, b in ((-CANOPY - 0.14, -CANOPY - 0.06), (CANOPY + 0.06, CANOPY + 0.14)):
        slab(bm, (-CANOPY, CEILING - 0.01, a), (CANOPY, CEILING, b), 0.002, GLOW, along="x")
        slab(bm, (a, CEILING - 0.01, -CANOPY), (b, CEILING, CANOPY), 0.002, GLOW, along="z")
    for x, z in ((-2.3, -2.4), (2.3, -2.4), (-2.3, 2.6), (2.3, 2.6)):
        slab(bm, (x - 0.3, CEILING - 0.012, z - 0.6), (x + 0.3, CEILING, z + 0.6), 0.004, GLOW, along="z")


def floor():
    bm = bmesh.new()
    slab(bm, (X0, -0.02, Z0), (X1, 0.0, Z1), 0.002, 0, along="x")
    return finish(bm, "floor", ["floor"])


def build():
    bm = bmesh.new()
    walls(bm)
    trim(bm)
    door(bm)
    wall_display(bm)
    cabinets(bm)
    ceiling(bm)
    shell = finish(bm, "env_theatre_shell", MATERIALS)
    return [shell, floor()]
