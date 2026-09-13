"""
Build the ileocaecal organs from BodyParts3D:

    blender --background --factory-startup --python blender/scripts/build_organs.py -- <repo_root> <review_dir> [raw]

Reads the STL files in blender/source/bodyparts3d (BodyParts3D 3.0, CC BY-SA
2.1 JP, DECISIONS.md D43), turns them from the dataset's frame into the
app's, cuts the colon down to the caecum and the start of the ascending
colon and the ileum down to its terminal loop, reduces each to budget, places
the set under the body's McBurney's point (src/data/bodyLandmarks.json), and
writes:

    public/models/anat_ileocaecum.glb       caecum, appendix and ileum as named nodes
    <review_dir>/anat_ileocaecum_*.png      review renders
    <review_dir>/anat_ileocaecum_build.txt  the outcome (the launcher prints nothing)

BodyParts3D's frame, read off the imported colon (its width runs along x,
its depth along y and its height along z, at a standing person's abdomen
height): x toward the patient's left, y toward the back, z up, in
millimetres, the LPS convention. The app has x toward the patient's left, y
up, z toward the feet, so app = (x, -y, -z) in metres.

With `raw` it only imports, measures and renders with axis arrows, which is
how that frame was read off.

TODO(clinical review): the organs come from one adult male's scan and are
placed under a different body by one landmark, at a fixed depth below the
skin, so their position is stylised, as the code-built ones were.

Not a kit script: it reads files, so it cannot go through the MCP's safe mode.
"""

import json
import math
import sys
import traceback
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
from review import make_camera, pick_engine, shoot, use_studio_world  # noqa: E402

ASSET_ID = "anat_ileocaecum"
SOURCES = {
    "appendix": "FMA14542_appendix.stl",
    "caecum": "FMA14543nsn_colon.stl",
    "ileum": "FMA7208_ileum.stl",
}
MM = 0.001
TRIANGLE_BUDGETS = {"appendix": 1500, "caecum": 9000, "ileum": 9000}
# How far below the skin at McBurney's point the base of the appendix sits.
# The ileum bulges about 3.5 cm in front of the base, which leaves it just
# under the wall's deepest layer (peritoneum, 3.7 cm down in abdomenWound.ts).
DEPTH_BELOW_SKIN = 0.075
# The base sits this far back along the incision from McBurney's point, so
# the 4.5 cm appendix lies within the 7 cm opening once turned along it.
ALONG_BACK = 0.015
# The wound's opening, as abdomenWound.ts holds it: half its length along the
# incision and half its width across, once retracted. Each organ's bounds
# within it are written out for the zones.
OPENING_HALF_LENGTH = 0.035
OPENING_HALF_WIDTH = 0.025
# The terminal ileum is packed away from the field, as a surgeon does with a
# swab: this far across the incision away from the opening, and down.
# TODO(clinical review): a stylised displacement; without it the ileum lies
# over the mesoappendix and nothing beneath it can be reached.
ILEUM_PACKED_ACROSS = 0.035
ILEUM_PACKED_DOWN = 0.008
# Colon kept: this far up the ascending colon from the appendix base.
ASCENDING_KEPT = 0.09
# Ileum kept: within this distance of where it joins the caecum, so the
# terminal ileum shows and the rest of the small bowel does not crowd the field.
ILEUM_KEPT = 0.065


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def lps_to_blender_app():
    """LPS (x left, y posterior, z superior) to the app frame in Blender's axes.

    The app's axes in Blender terms (kit.py): app x is Blender x, app y (up)
    is Blender z, app z (toward the feet) is Blender -y. Supine, the
    patient's anterior is app +y, the feet app +z, the left app +x. So LPS x
    stays x; LPS anterior (-y) goes up, Blender +z; LPS superior (+z) goes
    toward the head, app -z, which is Blender +y."""
    return Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))


def import_stl(path, name):
    bpy.ops.wm.stl_import(filepath=str(path))
    obj = bpy.context.selected_objects[0]
    obj.name = name
    obj.data.name = name
    obj.matrix_world = lps_to_blender_app() @ Matrix.Scale(MM, 4)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def measure(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    low = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    high = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    centre = sum(vs, Vector()) / len(vs)
    return {
        "triangles": sum(len(p.vertices) - 2 for p in obj.data.polygons),
        "vertices": len(vs),
        "min": [round(c, 4) for c in low],
        "max": [round(c, 4) for c in high],
        "centroid": [round(c, 4) for c in centre],
    }


def nearest_point(obj, target):
    """The vertex of `obj` nearest `target` (both world space)."""
    return min((obj.matrix_world @ v.co for v in obj.data.vertices), key=lambda p: (p - target).length)


def keep_where(obj, predicate):
    """Delete the faces whose centre fails `predicate` (object space), and fill the holes left."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    doomed = [f for f in bm.faces if not predicate(f.calc_center_median())]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    boundary = [e for e in bm.edges if e.is_boundary]
    if boundary:
        bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def keep_connected_to(obj, point):
    """Keep only the piece of `obj` that is joined to its vertex nearest `point` (world space).

    The colon is one mesh from caecum to rectum, and a plane cut through it
    keeps every part on the kept side, including a stretch of sigmoid that
    crosses the midline."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    local = obj.matrix_world.inverted() @ point
    start = min(bm.verts, key=lambda v: (v.co - local).length)
    seen = {start}
    frontier = [start]
    while frontier:
        vert = frontier.pop()
        for edge in vert.link_edges:
            other = edge.other_vert(vert)
            if other not in seen:
                seen.add(other)
                frontier.append(other)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v not in seen], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def box_uvs(obj):
    """UVs by box projection: each face mapped along the axis its normal
    faces most, at 4 repeats a metre. Scan data carries none, and the app's
    asset check wants a UV set on every primitive."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        n = face.normal
        axis = max(range(3), key=lambda i: abs(n[i]))
        for loop in face.loops:
            co = loop.vert.co
            u, v = [c for i, c in enumerate(co) if i != axis]
            loop[layer].uv = (u * 4.0, v * 4.0)
    bm.to_mesh(obj.data)
    bm.free()


def decimate(obj, target_triangles):
    triangles = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if triangles <= target_triangles:
        return
    modifier = obj.modifiers.new("reduce", "DECIMATE")
    modifier.ratio = target_triangles / triangles
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def bowel_material():
    material = bpy.data.materials.get("bowel") or bpy.data.materials.new("bowel")
    material.use_nodes = True
    principled = next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if principled is not None:
        principled.inputs["Base Color"].default_value = (0.79, 0.55, 0.45, 1.0)
        principled.inputs["Roughness"].default_value = 0.42
    return material


def export_glb(objects, path):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=str(path),
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
        export_meshopt_compression_enable=True,
    )


def axis_arrows(low):
    """Red +x, green +y, blue +z, 10 cm each, from the set's low corner."""
    for axis, colour in ((Vector((1, 0, 0)), (1, 0, 0, 1)), (Vector((0, 1, 0)), (0, 1, 0, 1)), (Vector((0, 0, 1)), (0, 0, 1, 1))):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.004, depth=0.1, location=low + axis * 0.05)
        arrow = bpy.context.active_object
        arrow.rotation_euler = axis.to_track_quat("Z", "Y").to_euler()
        material = bpy.data.materials.new("axis")
        material.use_nodes = True
        principled = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        principled.inputs["Base Color"].default_value = colour
        arrow.data.materials.append(material)


def opening_ring(centre, axis_app):
    """The wound's opening drawn over the organs: a ring at the skin, in Blender axes."""
    bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.03, major_segments=48, minor_segments=8, location=centre)
    ring = bpy.context.active_object
    ring.scale = (OPENING_HALF_LENGTH, OPENING_HALF_WIDTH, 0.02)
    # App x/z of the incision is Blender x/-y.
    ring.rotation_euler = (0.0, 0.0, math.atan2(-axis_app.y, axis_app.x))
    material = bpy.data.materials.new("opening")
    material.use_nodes = True
    principled = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    principled.inputs["Base Color"].default_value = (1.0, 1.0, 0.2, 1.0)
    ring.data.materials.append(material)


def exposed_bounds(obj, centre, axis_app):
    """Bounds, in Blender axes, of the object's vertices lying within the opening seen from above, or None."""
    ax, az = axis_app.x, axis_app.y
    inside = []
    for v in obj.data.vertices:
        p = obj.matrix_world @ v.co
        dx, dz = p.x - centre.x, -p.y - (-centre.y)
        along = (dx * ax + dz * az) / OPENING_HALF_LENGTH
        across = (-dx * az + dz * ax) / OPENING_HALF_WIDTH
        if along * along + across * across <= 1.0:
            inside.append(p)
    if not inside:
        return None
    return {
        "min": [round(min(p.x for p in inside), 4), round(min(p.y for p in inside), 4), round(min(p.z for p in inside), 4)],
        "max": [round(max(p.x for p in inside), 4), round(max(p.y for p in inside), 4), round(max(p.z for p in inside), 4)],
        "share": round(len(inside) / len(obj.data.vertices), 3),
    }


def review_renders(objects, review_dir, tag, opening=None):
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    world = use_studio_world()
    engine = pick_engine(scene)
    camera = make_camera(scene)
    corners = [o.matrix_world @ Vector(c) for o in objects for c in o.bound_box]
    low = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    high = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    axis_arrows(low)
    if opening is not None:
        opening_ring(*opening)
    centre = (low + high) / 2
    radius = max((high - low).length / 2, 0.05)
    names = []
    for number, (yaw, pitch) in enumerate([(35.0, 20.0), (215.0, 25.0), (0.0, 89.0)], start=1):
        name = f"{ASSET_ID}_{tag}_{number}.png"
        shoot(scene, camera, centre, radius, yaw, pitch, review_dir / name)
        names.append(name)
    return engine, world, names


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    repo, review_dir = Path(args[0]), Path(args[1])
    raw = len(args) > 2 and args[2] == "raw"
    review_dir.mkdir(parents=True, exist_ok=True)
    report_path = review_dir / f"{ASSET_ID}_build.txt"
    try:
        clear_scene()
        source_dir = repo / "blender" / "source" / "bodyparts3d"
        objects = {name: import_stl(source_dir / file, name) for name, file in SOURCES.items()}
        lines = []
        if not raw:
            appendix, caecum, ileum = objects["appendix"], objects["caecum"], objects["ileum"]
            # The appendix's base is its end nearest the colon; its tip the far end.
            colon_points = [caecum.matrix_world @ v.co for v in caecum.data.vertices]
            appendix_points = [appendix.matrix_world @ v.co for v in appendix.data.vertices]
            base = min(appendix_points, key=lambda p: min((p - q).length for q in colon_points[::40]))
            tip = max(appendix_points, key=lambda p: (p - base).length)
            # Keep the caecum and the first stretch of the ascending colon: the
            # colon on the patient's right (Blender -x), and not far toward the
            # head (Blender +y) of the appendix base.
            keep_where(caecum, lambda c: c.x < 0.03 and c.y < base.y + ASCENDING_KEPT)
            keep_connected_to(caecum, base)
            kept_colon = [caecum.matrix_world @ v.co for v in caecum.data.vertices][::10]
            ileum_points = [ileum.matrix_world @ v.co for v in ileum.data.vertices][::5]
            junction = min(ileum_points, key=lambda p: min((p - q).length for q in kept_colon))
            keep_where(ileum, lambda c: (c - junction).length < ILEUM_KEPT)
            keep_connected_to(ileum, junction)
            for name, obj in objects.items():
                decimate(obj, TRIANGLE_BUDGETS[name])
                box_uvs(obj)
            # Place: turn the set about the appendix base so the appendix runs
            # along the incision (the same line abdomenFrame.ts draws, square to
            # the ASIS-umbilicus line), then put the base under McBurney's point,
            # a little back along the incision, at depth. The scan's appendix
            # points medially; the gridiron opening is only 4 cm wide, so an
            # appendix across it could not be reached through it.
            landmarks = json.loads((repo / "src" / "data" / "bodyLandmarks.json").read_text(encoding="utf-8"))["landmarks"]
            mx, my, mz = landmarks["mcburney"]
            ax, _, az = landmarks["asis_right"]
            ux, _, uz = landmarks["umbilicus"]
            axis = Vector((az - uz, ux - ax)).normalized()  # app x, z: lateral-superior to medial-inferior
            # Blender x, y hold app x, -z; both directions in that plane.
            current = Vector((tip.x - base.x, tip.y - base.y)).normalized()
            wanted = Vector((axis.x, -axis.y))
            turn = math.atan2(wanted.y, wanted.x) - math.atan2(current.y, current.x)
            pivot = Matrix.Translation(base) @ Matrix.Rotation(turn, 4, "Z") @ Matrix.Translation(-base)
            tip = pivot @ tip
            junction = pivot @ junction
            target = Vector((mx - ALONG_BACK * axis.x, -(mz - ALONG_BACK * axis.y), my - DEPTH_BELOW_SKIN))  # app (x, y, z) to Blender (x, -z, y)
            shift = Matrix.Translation(target - base)
            for obj in objects.values():
                obj.matrix_world = shift @ pivot @ obj.matrix_world
                # transform_apply works on the selection, not the active object.
                bpy.ops.object.select_all(action="DESELECT")
                obj.select_set(True)
                bpy.context.view_layer.objects.active = obj
                bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
                obj.data.materials.clear()
                obj.data.materials.append(bowel_material())
            # Pack the ileum off: across the incision, away from the side it
            # already lies on, and a little deeper.
            junction = shift @ junction
            across_app = Vector((-axis.y, axis.x))  # app x, z square to the incision
            side = -1.0 if ((junction.x - target.x) * across_app.x + (-junction.y + target.y) * across_app.y) < 0 else 1.0
            packed = Vector((side * ILEUM_PACKED_ACROSS * across_app.x, -side * ILEUM_PACKED_ACROSS * across_app.y, -ILEUM_PACKED_DOWN))
            ileum.matrix_world = Matrix.Translation(packed) @ ileum.matrix_world
            bpy.ops.object.select_all(action="DESELECT")
            ileum.select_set(True)
            bpy.context.view_layer.objects.active = ileum
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            junction = junction + packed
            export_glb(list(objects.values()), repo / "public" / "models" / f"{ASSET_ID}.glb")
            lines.append(f"appendix base app {[round(c, 4) for c in (base.x, base.z, -base.y)]} -> placed at app {[round(c, 4) for c in (target.x, target.z, -target.y)]}, turned {math.degrees(turn):.1f} deg")
            lines.append(f"appendix length {(tip - base).length:.3f} m")
            # Where the organs ended up, for the zones (src/data/zones/abdomenOpen.ts)
            # and the wound's markers to pin to. App frame: (x, y up, z toward the feet).
            def app(v):
                return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
            def app_bounds(info):
                low, high = info["min"], info["max"]
                return {"min": [low[0], low[2], -high[1]], "max": [high[0], high[2], -low[1]]}
            placed = {name: measure(obj) for name, obj in objects.items()}
            base_now, tip_now = target, shift @ tip
            skin = Vector((mx, -mz, my))  # McBurney's point, Blender axes
            exposed = {name: exposed_bounds(obj, skin, axis) for name, obj in objects.items()}
            def app_exposed(name):
                info = exposed[name]
                return None if info is None else {**app_bounds(info), "share": info["share"]}
            def app_centroid(name):
                c = placed[name]["centroid"]
                return [c[0], c[2], -c[1]]
            organ_landmarks = {
                "model": ASSET_ID,
                "source": "BodyParts3D 3.0 via build_organs.py, placed under bodyLandmarks.json's mcburney",
                "units": "metres, app frame: y up, patient lies along z with the head toward -z, right toward -x",
                "opening": {"halfLength": OPENING_HALF_LENGTH, "halfWidth": OPENING_HALF_WIDTH},
                "appendix": {"base": app(base_now), "tip": app(tip_now), "centroid": app_centroid("appendix"), "bounds": app_bounds(placed["appendix"]), "exposed": app_exposed("appendix")},
                "caecum": {"centroid": app_centroid("caecum"), "bounds": app_bounds(placed["caecum"]), "exposed": app_exposed("caecum")},
                "ileum": {"junction": app(junction), "centroid": app_centroid("ileum"), "bounds": app_bounds(placed["ileum"]), "exposed": app_exposed("ileum")},
            }
            opening = (skin, axis)
            (repo / "src" / "data" / "organLandmarks.json").write_text(json.dumps(organ_landmarks, indent=2) + "\n", encoding="utf-8")
        measured = {name: measure(obj) for name, obj in objects.items()}
        lines += [f"{name}: {json.dumps(info)}" for name, info in measured.items()]
        engine, world, rendered = review_renders(list(objects.values()), review_dir, "raw" if raw else "placed", None if raw else opening)
        report_path.write_text(
            f"ok engine={engine} world={world} raw={raw}\n" + "\n".join(lines) + f"\nrendered {' '.join(rendered)}\n",
            encoding="utf-8",
        )
    except Exception:
        report_path.write_text("failed\n" + traceback.format_exc(), encoding="utf-8")


if __name__ == "__main__":
    main()
