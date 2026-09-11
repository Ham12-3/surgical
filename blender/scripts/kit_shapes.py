"""
Shape helpers for hard-surface equipment, prepended after kit.py: rounded
boxes, turned parts, a drawable screen face, named empties, a 1.8 m reference
person for scale checks, and the review camera.

Positions here are in app coordinates, the ones src/scene uses: x across the
table, y up, z along the table toward the patient's feet. Blender is Z-up and
the glTF exporter maps Blender (x, y, z) to three (x, z, -y), so app (x, y, z)
is Blender (x, -z, y). app() does that conversion. It is a proper rotation, so
cross products and face winding survive it.
"""

from mathutils import Euler, Matrix


def app(x, y, z):
    """Blender coordinates of an app-space point or direction."""
    return Vector((x, -z, y))


def rounded_rect(half_w, half_h, radius, corner_segments=3):
    """Closed section in absolute units: a rectangle with rounded corners,
    anticlockwise from the right-hand edge. The radius stops just short of
    the smaller half-size, so neighbouring corners never share a point."""
    r = max(1e-5, min(radius, 0.98 * half_w, 0.98 * half_h))
    corners = (
        (half_w - r, half_h - r, 0.0),
        (-half_w + r, half_h - r, 90.0),
        (-half_w + r, -half_h + r, 180.0),
        (half_w - r, -half_h + r, 270.0),
    )
    points = []
    for cx, cy, start in corners:
        for k in range(corner_segments + 1):
            angle = math.radians(start + 90.0 * k / corner_segments)
            points.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    return points


def slab(bm, lo, hi, radius, material=0, along="x", corner_segments=3, uv_scale=UV_PER_METRE):
    """A box between app-space corners `lo` and `hi` with every edge rounded
    to `radius`, swept along one app axis ("x", "y" or "z"). `uv_scale`
    passes through to loft().

    The ends are rounded by rings on a quarter circle: at angle a from the end
    face, a ring sits r(1 - cos a) in from the end and its section is the
    inner rectangle grown by r sin a. Starting at 22.5 degrees keeps the end
    cap a real face, at the cost of well under a millimetre of length.
    """
    low = [min(a, b) for a, b in zip(lo, hi)]
    high = [max(a, b) for a, b in zip(lo, hi)]
    k = "xyz".index(along)
    u, v = [i for i in range(3) if i != k]
    half_u = (high[u] - low[u]) / 2
    half_v = (high[v] - low[v]) / 2
    r = min(radius, 0.98 * half_u, 0.98 * half_v, 0.49 * (high[k] - low[k]))
    centre = [(a + b) / 2 for a, b in zip(low, high)]
    thickness_axis = [0.0, 0.0, 0.0]
    thickness_axis[v] = 1.0

    rounding = []
    for degrees in (22.5, 45.0, 67.5, 90.0):
        a = math.radians(degrees)
        rounding.append((r * (1 - math.cos(a)), r * math.sin(a)))
    stations = [(low[k] + d, g) for d, g in rounding]
    stations += [(high[k] - d, g) for d, g in reversed(rounding)]

    points, sections = [], []
    for position, grow in stations:
        p = list(centre)
        p[k] = position
        points.append(app(p[0], p[1], p[2]))
        sections.append(rounded_rect(half_u - r + grow, half_v - r + grow, grow, corner_segments))
    loft(
        bm,
        points,
        app(thickness_axis[0], thickness_axis[1], thickness_axis[2]),
        1.0,
        1.0,
        sections,
        material,
        uv_scale=uv_scale,
    )


def lathe_part(bm, base, direction, profile, material=0, segments=20):
    """A turned part: `profile` lists (radius, distance) pairs going along
    `direction` from app-space `base`, distances strictly increasing. A tiny
    radius at either end closes it off."""
    d = app(direction[0], direction[1], direction[2]).normalized()
    start = app(base[0], base[1], base[2])
    reference = Vector((0.0, 0.0, 1.0)) if abs(d.z) < 0.9 else Vector((1.0, 0.0, 0.0))
    axis = d.cross(reference).normalized()
    points = [start + d * h for r, h in profile]
    radii = [max(r, 1e-5) for r, h in profile]
    loft(bm, points, axis, radii, radii, superellipse(segments, 2.0), material)


def place_part(bm, first_vert, offset, axis=(0.0, 1.0, 0.0), degrees=0.0):
    """Turn every vertex added since `first_vert` (len(bm.verts) taken before
    building the part) about app-space `axis` through the origin, then move
    it by app-space `offset`. For parts built at the origin and set at an
    angle, such as a tilted lamp head."""
    verts = list(bm.verts)[first_vert:]
    if degrees:
        rotation = Matrix.Rotation(math.radians(degrees), 3, app(axis[0], axis[1], axis[2]))
        bmesh.ops.rotate(bm, cent=Vector((0.0, 0.0, 0.0)), matrix=rotation, verts=verts)
    bmesh.ops.translate(bm, vec=app(offset[0], offset[1], offset[2]), verts=verts)


def screen_quad(bm, corners, material=0):
    """One flat face with UVs 0..1 across it, for a surface the app draws on.

    `corners` are app-space points listed anticlockwise as seen from the
    front: bottom-left, bottom-right, top-right, top-left. Build it into its
    own bmesh and finish() it with recalc=False, so that winding survives.
    """
    verts = [bm.verts.new(app(c[0], c[1], c[2])) for c in corners]
    face = bm.faces.new(verts)
    face.material_index = material
    uv_layer = bm.loops.layers.uv.verify()
    for loop, uv in zip(face.loops, ((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0))):
        loop[uv_layer].uv = uv


def empty(name, location):
    """A named empty at an app-space point. It exports as a glTF node the app
    looks up by name, such as a lamp lens or a tray surface."""
    old = bpy.data.objects.get(name)
    if old is not None:
        bpy.data.objects.remove(old, do_unlink=True)
    obj = bpy.data.objects.new(name, None)
    obj.location = app(location[0], location[1], location[2])
    obj.empty_display_size = 0.05
    bpy.context.scene.collection.objects.link(obj)
    return obj


def reference_human(x=0.9, z=0.6, height=1.8):
    """A plain 1.8 m stand-in person at app (x, 0, z), for the scale check in
    the realism checklist. Built for review screenshots; never exported."""
    s = height / 1.8
    bm = bmesh.new()
    for side in (-1, 1):
        legs = [(0.001, 0.0), (0.05 * s, 0.01 * s), (0.06 * s, 0.45 * s), (0.08 * s, 0.85 * s), (0.02 * s, 0.9 * s)]
        lathe_part(bm, (x + side * 0.1 * s, 0.0, z), (0, 1, 0), legs, 0)
        arms = [(0.001, 0.0), (0.035 * s, 0.02 * s), (0.045 * s, 0.4 * s), (0.05 * s, 0.66 * s), (0.001, 0.7 * s)]
        lathe_part(bm, (x + side * 0.23 * s, 0.78 * s, z), (0, 1, 0), arms, 0)
    torso = [(0.12 * s, 0.0), (0.16 * s, 0.2 * s), (0.2 * s, 0.6 * s), (0.08 * s, 0.68 * s), (0.06 * s, 0.72 * s)]
    lathe_part(bm, (x, 0.82 * s, z), (0, 1, 0), torso, 0)
    head = [(0.001, 0.0), (0.07 * s, 0.03 * s), (0.1 * s, 0.12 * s), (0.08 * s, 0.22 * s), (0.001, 0.25 * s)]
    lathe_part(bm, (x, 1.55 * s, z), (0, 1, 0), head, 0)
    return finish(bm, "ref_human_1800", ["paint"])


def review_view(yaw_deg, pitch_deg, distance, target, studio="interior.exr"):
    """Point every 3D viewport at an app-space target, from `yaw_deg` round
    the vertical and `pitch_deg` above the horizon, in Material Preview under
    one of Blender's bundled HDRIs (no download)."""
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type != "VIEW_3D":
                continue
            space = area.spaces.active
            space.shading.type = "MATERIAL"
            space.shading.studio_light = studio
            space.clip_start = 0.005
            space.clip_end = 100.0
            view = space.region_3d
            view.view_perspective = "PERSP"
            view.view_location = app(target[0], target[1], target[2])
            view.view_distance = distance
            rotation = Euler((math.radians(90 - pitch_deg), 0.0, math.radians(yaw_deg)), "XYZ")
            view.view_rotation = rotation.to_quaternion()


def review_shots(path_prefix, shots, studio="interior.exr"):
    """Render the viewport from each (yaw, pitch, distance, target) in `shots`
    to <path_prefix>_<n>.png: the realism checklist's three angles, in one
    call rather than a screenshot round trip per angle."""
    scene = bpy.context.scene
    scene.render.resolution_percentage = 50
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type != "VIEW_3D":
                continue
            region = next(r for r in area.regions if r.type == "WINDOW")
            for number, (yaw, pitch, distance, target) in enumerate(shots, start=1):
                review_view(yaw, pitch, distance, target, studio)
                scene.render.filepath = path_prefix + "_" + str(number) + ".png"
                with bpy.context.temp_override(window=window, area=area, region=region):
                    bpy.ops.render.opengl(write_still=True, view_context=True)
            return
