"""
Build the surgeon's gloved right hand from MPFB:

    blender --background --python blender/scripts/build_hand.py -- <repo_root> <review_dir>

Like build_body.py, not a kit script: it runs headless with the MPFB
extension loaded (no --factory-startup). It generates the same adult, poses
the right hand's fingers in a pen grip around an instrument's shaft, bakes
the shape, keeps only the hand and the first stretch of the forearm, and
puts the hand in the app's instrument frame: the point pinched between
thumb and index at the origin, the shaft it grips running up +y, the palm
facing +x. The app hangs it on any instrument's `grip_point`
(src/scene/tools/handRig.ts). It writes:

    public/models/anat_hand_right.glb        the hand, meshopt-compressed
    <review_dir>/anat_hand_right_*.png       review renders, a rod in the grip
    <review_dir>/anat_hand_right_build.txt   the outcome
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
from build_body import MACROS, create_body, mpfb, turn_limb_toward  # noqa: E402
from review import make_camera, pick_engine, shoot, use_studio_world  # noqa: E402

ASSET_ID = "anat_hand_right"
SIDE = "R"
# How much forearm comes with the hand, from the wrist joint.
FOREARM_KEPT = 0.11

# The pen grip: flexion at each joint of each finger, degrees, from the
# knuckle outward. The thumb also swings across the palm (opposition).
FLEX = {
    2: (40.0, 45.0, 25.0),  # index
    3: (50.0, 60.0, 35.0),  # middle
    4: (65.0, 75.0, 40.0),  # ring
    5: (75.0, 80.0, 45.0),  # little
}
THUMB_FLEX = (25.0, 30.0, 20.0)
THUMB_OPPOSITION = 40.0


def bone(armature, name):
    return armature.pose.bones[f"{name}.{SIDE}"]


def rotate_chain(armature, name, axis, degrees):
    """Turn the pose bone `name` and everything below it about its head."""
    root = bone(armature, name)
    head = root.head.copy()
    turn = Matrix.Translation(head) @ Matrix.Rotation(math.radians(degrees), 4, axis.normalized()) @ Matrix.Translation(-head)
    chain = [root] + list(root.children_recursive)
    originals = [(link, link.matrix.copy()) for link in chain]
    for link, original in originals:
        link.matrix = turn @ original
        bpy.context.view_layer.update()


def hand_frame(armature):
    """The hand's own axes from its joints: along the fingers, across the
    knuckles from index to little, and out of the palm."""
    wrist = bone(armature, "wrist").head
    along = (bone(armature, "finger3-1").head - wrist).normalized()
    across = (bone(armature, "finger5-1").head - bone(armature, "finger2-1").head).normalized()
    palm = across.cross(along).normalized()
    # The palm of a right arm hanging at the side faces the body, toward x = 0.
    if (palm.x > 0) != (wrist.x < 0):
        palm = -palm
    return along, across, palm


def pose_fingers(armature):
    along, across, palm = hand_frame(armature)
    # Flexing turns a finger toward the palm: about the knuckle axis, in the
    # sense that carries `along` toward `palm`.
    flex_axis = across if across.cross(along).dot(palm) > 0 else -across
    for finger, angles in FLEX.items():
        for joint, degrees in enumerate(angles, start=1):
            rotate_chain(armature, f"finger{finger}-{joint}", flex_axis, degrees)
    # The thumb swings across the palm first, then curls.
    rotate_chain(armature, "finger1-1", along, THUMB_OPPOSITION if palm.x > 0 else -THUMB_OPPOSITION)
    thumb_along = (bone(armature, "finger1-2").head - bone(armature, "finger1-1").head).normalized()
    thumb_axis = thumb_along.cross(palm).normalized()
    for joint, degrees in enumerate(THUMB_FLEX, start=1):
        rotate_chain(armature, f"finger1-{joint}", thumb_axis, degrees)


def grip_frame(armature):
    """Where the instrument sits: pinched between thumb and index, its shaft
    running up over the web between them. Returns (grip point, shaft
    direction, palm direction) in armature space, from the posed rig."""
    thumb_tip = bone(armature, "finger1-3").tail
    index_tip = bone(armature, "finger2-3").tail
    grip = (thumb_tip + index_tip) / 2
    _along, _across, palm = hand_frame(armature)
    # The shaft rests in the web between thumb and index, on its back: aim
    # the grip's axis a little out of the back of the hand, or the shaft runs
    # through the hand instead of over it.
    web = (bone(armature, "finger2-1").head + bone(armature, "finger1-1").head) / 2 - palm * 0.028
    shaft = (web - grip).normalized()
    return grip, shaft, palm


def keep_hand(body, wrist, forearm_direction):
    """Delete everything but the hand and the first stretch of the forearm, and cap the cut."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    local = body.matrix_world.inverted()
    wrist_local = local @ wrist
    direction = (local.to_3x3() @ forearm_direction).normalized()
    # Keep a cylinder around the forearm's axis: from the cut up the forearm to
    # past the fingertips, and no wider than a hand. Anything else on the body,
    # legs included, lies outside it.
    def kept(v):
        offset = v.co - wrist_local
        along = offset.dot(direction)
        lateral = (offset - direction * along).length
        return -FOREARM_KEPT <= along <= 0.26 and lateral <= 0.09
    doomed = [v for v in bm.verts if not kept(v)]
    bmesh.ops.delete(bm, geom=doomed, context="VERTS")
    boundary = [e for e in bm.edges if e.is_boundary]
    if boundary:
        bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()


def glove_material():
    material = bpy.data.materials.get("glove") or bpy.data.materials.new("glove")
    material.use_nodes = True
    principled = next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if principled is not None:
        principled.inputs["Base Color"].default_value = (0.86, 0.88, 0.86, 1.0)
        principled.inputs["Roughness"].default_value = 0.4
    return material


def add_empty(name, location):
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_size = 0.01
    empty.location = location
    bpy.context.scene.collection.objects.link(empty)
    return empty


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


def review_renders(hand, review_dir):
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    world = use_studio_world()
    engine = pick_engine(scene)
    camera = make_camera(scene)
    # A 1 cm rod up the grip's axis, standing in for an instrument's shaft.
    bpy.ops.mesh.primitive_cylinder_add(radius=0.004, depth=0.24, location=(0.0, 0.0, 0.06))
    rod = bpy.context.active_object
    material = bpy.data.materials.new("rod")
    material.use_nodes = True
    principled = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    principled.inputs["Base Color"].default_value = (0.2, 0.2, 0.22, 1.0)
    principled.inputs["Metallic"].default_value = 1.0
    principled.inputs["Roughness"].default_value = 0.3
    rod.data.materials.append(material)
    corners = [hand.matrix_world @ Vector(c) for c in hand.bound_box]
    low = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    high = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    centre = (low + high) / 2
    radius = max((high - low).length / 2, 0.05)
    names = []
    for number, (yaw, pitch) in enumerate([(35.0, 20.0), (215.0, 25.0), (120.0, 60.0), (0.0, -20.0)], start=1):
        name = f"{ASSET_ID}_{number}.png"
        shoot(scene, camera, centre, radius, yaw, pitch, review_dir / name)
        names.append(name)
    return engine, world, names


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    repo, review_dir = Path(args[0]), Path(args[1])
    review_dir.mkdir(parents=True, exist_ok=True)
    report_path = review_dir / f"{ASSET_ID}_build.txt"
    try:
        HumanService, RigService, ExportService, TargetService = mpfb()
        for obj in list(bpy.data.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        body = create_body(HumanService, TargetService)
        body.name = ASSET_ID
        armature = HumanService.add_builtin_rig(body, "default", import_weights=True)
        pose_fingers(armature)
        grip, shaft, palm = grip_frame(armature)
        wrist = bone(armature, "wrist").head.copy()
        elbow = bone(armature, "lowerarm01").head.copy()
        forearm_direction = (wrist - elbow).normalized()
        world = armature.matrix_world
        grip, wrist, elbow = world @ grip, world @ wrist, world @ elbow
        shaft = (world.to_3x3() @ shaft).normalized()
        palm = (world.to_3x3() @ palm).normalized()

        RigService.apply_pose_as_rest_pose(armature)
        for modifier in list(body.modifiers):
            if modifier.type == "ARMATURE":
                body.modifiers.remove(modifier)
        bpy.data.objects.remove(armature, do_unlink=True)
        ExportService.bake_modifiers_remove_helpers(body, bake_masks=True, bake_subdiv=False, remove_helpers=True, also_proxy=False)
        body.vertex_groups.clear()
        keep_hand(body, wrist, forearm_direction)
        body.data.materials.clear()
        body.data.materials.append(glove_material())

        # Into the instrument frame: Blender z is the app's y (the shaft), x the
        # palm's direction, and the third axis follows.
        z_axis = shaft
        x_axis = (palm - palm.dot(z_axis) * z_axis).normalized()
        y_axis = z_axis.cross(x_axis).normalized()
        frame = Matrix.Translation(grip) @ Matrix(((x_axis.x, y_axis.x, z_axis.x, 0), (x_axis.y, y_axis.y, z_axis.y, 0), (x_axis.z, y_axis.z, z_axis.z, 0), (0, 0, 0, 1)))
        into = frame.inverted()
        body.matrix_world = into @ body.matrix_world
        bpy.ops.object.select_all(action="DESELECT")
        body.select_set(True)
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        wrist_local = into @ wrist

        grip_point = add_empty("grip_point", (0.0, 0.0, 0.0))
        wrist_node = add_empty("wrist", wrist_local)
        models_dir = repo / "public" / "models"
        models_dir.mkdir(parents=True, exist_ok=True)
        export_glb([body, grip_point, wrist_node], models_dir / f"{ASSET_ID}.glb")

        triangles = sum(len(p.vertices) - 2 for p in body.data.polygons)
        engine, world_name, rendered = review_renders(body, review_dir)
        report_path.write_text(
            f"ok engine={engine} world={world_name} triangles={triangles} vertices={len(body.data.vertices)}\n"
            f"wrist (blender, from the grip): {[round(c, 4) for c in wrist_local]}\n"
            f"macros {json.dumps(MACROS)}\nrendered {' '.join(rendered)}\n",
            encoding="utf-8",
        )
    except Exception:
        report_path.write_text("failed\n" + traceback.format_exc(), encoding="utf-8")


if __name__ == "__main__":
    main()
