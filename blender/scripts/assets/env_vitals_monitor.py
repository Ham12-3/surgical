"""
env_vitals_monitor: a patient monitor on a roll stand. A housing with a dark
front bezel, a carry handle and a control knob, on a pole over a five-leg
base with casters.

Runs with kit.py and kit_shapes.py prepended (see build.py). The origin is on
the floor under the pole and the screen faces +z. The screen is its own node,
`screen`: one face with UVs running 0..1 across it and the palette's `screen`
material, so the app can draw the live display onto it
(src/scene/models/vitalsDisplay.ts). Its 13:9 shape matches that canvas.
"""

MATERIALS = ["paint", "handle", "steel"]
PAINT, BEZEL, STEEL = 0, 1, 2

SCREEN_W, SCREEN_H = 0.26, 0.18  # a panel of roughly 12 inches
SCREEN_CENTRE_Y = 1.45
FRONT_Z = 0.056  # the bezel's front face


def base(bm):
    # Five legs radiating from a hub, each with a caster under its foot. Each
    # leg is built along +x and turned into place.
    wheel = [(0.024, 0.0), (0.025, 0.003), (0.025, 0.015), (0.024, 0.018)]
    for k in range(5):
        first = len(bm.verts)
        slab(bm, (0.02, 0.06, -0.018), (0.30, 0.085, 0.018), 0.008, STEEL, along="x")
        slab(bm, (0.272, 0.03, -0.012), (0.298, 0.062, 0.012), 0.004, STEEL, along="x")
        lathe_part(bm, (0.285, 0.025, -0.009), (0, 0, 1), wheel, BEZEL, 14)
        place_part(bm, first, (0.0, 0.0, 0.0), (0.0, 1.0, 0.0), 72.0 * k + 18.0)
    lathe_part(bm, (0.0, 0.05, 0.0), (0, 1, 0), [(0.06, 0.0), (0.06, 0.04), (0.03, 0.06)], STEEL, 20)


def pole(bm):
    # The pole, and a bracket from its head up into the back of the monitor.
    shaft = [(0.02, 0.0), (0.016, 0.02), (0.016, 1.12), (0.02, 1.14), (0.001, 1.16)]
    lathe_part(bm, (0.0, 0.1, 0.0), (0, 1, 0), shaft, STEEL, 18)
    slab(bm, (-0.03, 1.24, -0.03), (0.03, SCREEN_CENTRE_Y - 0.135, 0.03), 0.006, STEEL, along="y")


def monitor(bm):
    # Housing, a dark bezel standing proud of its front, a carry handle on top
    # and a rotary knob low on the bezel, clear of the screen.
    top, bottom = SCREEN_CENTRE_Y + 0.14, SCREEN_CENTRE_Y - 0.14
    slab(bm, (-0.175, bottom, -0.045), (0.175, top, 0.045), 0.018, PAINT, along="x")
    slab(bm, (-0.168, bottom + 0.006, 0.03), (0.168, top - 0.006, FRONT_Z), 0.01, BEZEL, along="x")
    for x in (-0.09, 0.09):
        slab(bm, (x - 0.012, top - 0.005, -0.012), (x + 0.012, top + 0.03, 0.012), 0.006, BEZEL, along="y")
    slab(bm, (-0.105, top + 0.02, -0.013), (0.105, top + 0.038, 0.013), 0.008, BEZEL, along="x")
    knob = [(0.014, 0.0), (0.014, 0.012), (0.012, 0.016), (0.001, 0.017)]
    lathe_part(bm, (0.14, bottom + 0.028, FRONT_Z - 0.004), (0, 0, 1), knob, PAINT, 18)


def screen():
    # A lone face just in front of the bezel, facing +z. Kept out of the
    # normal recalculation, which cannot tell a lone face's front from its back.
    bm = bmesh.new()
    half_w, half_h = SCREEN_W / 2, SCREEN_H / 2
    z = FRONT_Z + 0.0005
    corners = [
        (-half_w, SCREEN_CENTRE_Y - half_h, z),
        (half_w, SCREEN_CENTRE_Y - half_h, z),
        (half_w, SCREEN_CENTRE_Y + half_h, z),
        (-half_w, SCREEN_CENTRE_Y + half_h, z),
    ]
    screen_quad(bm, corners, 0)
    return finish(bm, "screen", ["screen"], recalc=False)


def build():
    bm = bmesh.new()
    base(bm)
    pole(bm)
    monitor(bm)
    stand = finish(bm, "env_vitals_monitor", MATERIALS)
    return [stand, screen()]
