"""
Shared helpers for building Surgical Trainer instruments in Blender.

Each script in blender/instruments/ runs with this file prepended, both when
sent through the Blender MCP and when rebuilt headless by build.py. The MCP
runs in safe mode, which allows no imports beyond bpy, bmesh, mathutils and
the pure-python stdlib, no exec or file access, and no calls except to named
defs, builtins and module attributes. So this is one flat file of top-level
functions rather than an importable package, and sizes are passed as lists
rather than as functions.

Conventions, matching the procedural builders in src/scene/tools/:

- Units are metres.
- The working tip sits at the origin and the body runs up Blender +Z, with the
  jaws opening along X and thickness along Y. The glTF exporter converts Z-up
  to Y-up, which lands the model on three's convention: tip at the origin,
  body up +y, working plane XY.
- Material names are keys of the app's shared palette (src/scene/palette.ts).
  The app swaps in its own materials on load; the values here only make the
  model read correctly in Blender's viewport.
- UVs run u along each part's length, measured in metres, because the app's
  brushed-steel roughness map streaks along u.
"""

import math

import bmesh
import bpy
from mathutils import Vector

# Tiles of the app's brushed-steel roughness map per metre of surface.
UV_PER_METRE = 40.0

# Edges that fold more than this shade sharp; anything gentler shades smooth.
SHARP_ANGLE = math.radians(35)

# Viewport stand-ins for the app's palette: linear RGB, metalness, roughness.
PALETTE = {
    "steel": ((0.658, 0.701, 0.730), 1.0, 0.22),
    "steelDark": ((0.262, 0.301, 0.342), 0.95, 0.38),
    "handle": ((0.025, 0.032, 0.041), 0.0, 0.42),
}


def superellipse(count, exponent=4.0):
    """Closed unit section |x|^e + |y|^e = 1, anticlockwise from +x.

    Exponent 2 is a circle; around 4 is the rounded-square section of forged
    flat stock.
    """
    points = []
    for i in range(count):
        angle = 2 * math.pi * i / count
        c, s = math.cos(angle), math.sin(angle)
        points.append(
            (math.copysign(abs(c) ** (2 / exponent), c), math.copysign(abs(s) ** (2 / exponent), s))
        )
    return points


def half_superellipse(count, exponent=4.0):
    """The x >= 0 half of a superellipse, closed by a flat face on x = 0.

    For jaw halves that meet face to face along the instrument's midline.
    """
    points = []
    for i in range(count + 1):
        angle = -math.pi / 2 + math.pi * i / count
        c, s = math.cos(angle), math.sin(angle)
        points.append((abs(c) ** (2 / exponent), math.copysign(abs(s) ** (2 / exponent), s)))
    return points


def bezier(p0, p1, p2, count):
    """Points along a quadratic Bezier, evenly spaced in its parameter."""
    p0, p1, p2 = Vector(p0), Vector(p1), Vector(p2)
    steps = [i / (count - 1) for i in range(count)]
    return [(1 - t) ** 2 * p0 + 2 * t * (1 - t) * p1 + t * t * p2 for t in steps]


def path_t(points, closed=False):
    """How far along a path each point sits, 0 to 1 by length.

    For shaping per-point size lists, e.g.
    [0.002 - 0.0005 * t for t in path_t(points)].
    """
    points = [Vector(p) for p in points]
    lengths = [0.0]
    for a, b in zip(points, points[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    total = lengths[-1] + ((points[0] - points[-1]).length if closed else 0.0)
    return [length / total if total > 0 else 0.0 for length in lengths]


def _size(size, index):
    """A size given as a constant or as a per-point list."""
    if isinstance(size, (list, tuple)):
        return size[index]
    return size


def loft(bm, points, axis, half_width, half_thickness, section, material=0, closed=False, caps=True):
    """Sweep a unit cross-section along a path, adding the result to `bm`.

    Section x maps to the side direction (in the path's plane, square to the
    path) scaled by half_width; section y maps to the fixed `axis` scaled by
    half_thickness. Sizes may be numbers or per-point lists (see path_t).

    Every part here lies in a single plane, so a fixed axis square to that
    plane gives a frame that never twists, unlike a Frenet frame.
    """
    points = [Vector(p) for p in points]
    axis = Vector(axis).normalized()
    count = len(points)

    lengths = [0.0]
    for a, b in zip(points, points[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    total = lengths[-1] + ((points[0] - points[-1]).length if closed else 0.0)

    rings = []
    for i, point in enumerate(points):
        if closed:
            tangent = points[(i + 1) % count] - points[i - 1]
        else:
            tangent = points[min(i + 1, count - 1)] - points[max(i - 1, 0)]
        side = axis.cross(tangent).normalized()
        w = _size(half_width, i)
        h = _size(half_thickness, i)
        rings.append([bm.verts.new(point + side * (x * w) + axis * (y * h)) for x, y in section])

    uv_layer = bm.loops.layers.uv.verify()
    n = len(section)

    # Distance around each ring, with the closing vertex counted again at the
    # end so the last face's texture does not wrap back to zero.
    arounds = []
    for ring in rings:
        distances = [0.0]
        for j in range(n):
            distances.append(distances[-1] + (ring[(j + 1) % n].co - ring[j].co).length)
        arounds.append(distances)

    for i in range(count if closed else count - 1):
        a, b = i, (i + 1) % count
        u0 = lengths[i] * UV_PER_METRE
        u1 = (lengths[i + 1] if i + 1 < count else total) * UV_PER_METRE
        for j in range(n):
            k = (j + 1) % n
            face = bm.faces.new((rings[a][j], rings[b][j], rings[b][k], rings[a][k]))
            face.material_index = material
            corners = (
                (u0, arounds[a][j]),
                (u1, arounds[b][j]),
                (u1, arounds[b][j + 1]),
                (u0, arounds[a][j + 1]),
            )
            for loop, (u, v) in zip(face.loops, corners):
                loop[uv_layer].uv = (u, v * UV_PER_METRE)

    if caps and not closed:
        for ring in (list(reversed(rings[0])), rings[-1]):
            face = bm.faces.new(ring)
            face.material_index = material
            for loop in face.loops:
                co = loop.vert.co
                loop[uv_layer].uv = (co.x * UV_PER_METRE, (co.y + co.z) * UV_PER_METRE)


def plate(bm, outline, y0, y1, material=0):
    """Extrude a flat outline of (x, z) points between y0 and y1.

    For small flat stock such as ratchet bars. The outline may be concave;
    Blender's triangulation handles that on export.
    """
    front = [bm.verts.new((x, y1, z)) for x, z in outline]
    back = [bm.verts.new((x, y0, z)) for x, z in outline]
    faces = [bm.faces.new(front), bm.faces.new(list(reversed(back)))]
    count = len(outline)
    for j in range(count):
        k = (j + 1) % count
        faces.append(bm.faces.new((back[j], back[k], front[k], front[j])))

    uv_layer = bm.loops.layers.uv.verify()
    for face in faces:
        face.material_index = material
        for loop in face.loops:
            co = loop.vert.co
            loop[uv_layer].uv = ((co.x + co.y) * UV_PER_METRE, co.z * UV_PER_METRE)


def palette_material(key):
    """The Blender material for a palette key, created on first use."""
    color, metallic, roughness = PALETTE[key]
    material = bpy.data.materials.get(key) or bpy.data.materials.new(key)
    material.diffuse_color = (*color, 1.0)
    material.metallic = metallic
    material.roughness = roughness
    if material.node_tree is None:
        material.use_nodes = True
    bsdf = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
    return material


def finish(bm, name, materials):
    """Turn the built geometry into a mesh object called `name`.

    Replaces any earlier build of the same name, so a script can be rerun
    while iterating. `materials` lists palette keys in slot order, matching
    the material indices the parts were built with.
    """
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for face in bm.faces:
        face.smooth = True
    for edge in bm.edges:
        edge.smooth = edge.calc_face_angle(math.pi) < SHARP_ANGLE

    old = bpy.data.objects.get(name)
    if old is not None:
        old_mesh = old.data
        bpy.data.objects.remove(old, do_unlink=True)
        if old_mesh.users == 0:
            bpy.data.meshes.remove(old_mesh)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for key in materials:
        mesh.materials.append(palette_material(key))

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def export_glb(obj, directory, key):
    """Write just `obj` to <directory>/<key>.glb, Y-up, without textures."""
    for other in bpy.context.view_layer.objects:
        other.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=directory.rstrip("/\\") + "/" + key + ".glb",
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_image_format="NONE",
        export_texcoords=True,
        export_normals=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_extras=False,
    )


def build_and_export(key, directory):
    """Build the instrument whose script follows this file, and export it.

    `build` is defined by that script; both share one namespace.
    """
    obj = build()  # noqa: F821 - defined by the instrument script
    export_glb(obj, directory, key)
    return obj
