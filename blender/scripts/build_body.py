"""
Build the patient's body from MPFB, the MakeHuman plugin for Blender:

    blender --background --python blender/scripts/build_body.py -- <repo_root> <review_dir>

Not a kit script: it uses MPFB's services and the file system, so it cannot
go through the MCP's safe mode, and it runs without --factory-startup so the
MPFB extension (installed from extensions.blender.org, DECISIONS.md D43)
loads. MPFB's output is CC0.

It generates an adult, poses the right arm out onto the arm board and the
left arm at the side, bakes the shape, drops MakeHuman's clothing and eye
"helper" geometry, lays the body supine in the app's frame (head toward app
-z, patient's right toward -x, back on the table top at y = 0.9, umbilicus
at z = 0) and writes:

    public/models/anat_body_patient.glb     the body, meshopt-compressed
    src/data/bodyLandmarks.json             landmarks in app metres
    <review_dir>/anat_body_patient_*.png    review renders, landmarks marked
    <review_dir>/anat_body_patient_build.txt  the outcome (the launcher prints nothing)

TODO(clinical review): the surface landmarks (umbilicus, anterior superior
iliac spines, McBurney's point) are worked out from the mesh and the rig's
joints by the rules in `landmarks()`; they are approximations to check.
"""

import json
import math
import sys
import traceback
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
from review import make_camera, pick_engine, shoot, use_studio_world  # noqa: E402

ASSET_ID = "anat_body_patient"
TABLE_TOP_Y = 0.9  # src/scene/models/roomLayout.ts
ARM_ABDUCTION_DEG = 85.0
# The arm hangs from a shoulder joint that sits well above the back, so it
# drops a little toward the table to rest on the arm board's pad.
ARM_DROOP_DEG = 9.0

# An average adult, in MPFB's own terms (0 to 1 on each axis). Male, because
# the BodyParts3D organs that go with the body come from a male dataset.
MACROS = {"gender": 1.0, "age": 0.5, "muscle": 0.5, "weight": 0.5, "height": 0.5, "proportions": 0.5}


def mpfb():
    """MPFB's service classes, imported from the extension once it is loaded."""
    from bl_ext.blender_org.mpfb.services.exportservice import ExportService
    from bl_ext.blender_org.mpfb.services.humanservice import HumanService
    from bl_ext.blender_org.mpfb.services.rigservice import RigService
    from bl_ext.blender_org.mpfb.services.targetservice import TargetService

    return HumanService, RigService, ExportService, TargetService


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def create_body(HumanService, TargetService):
    macros = TargetService.get_default_macro_info_dict()
    macros.update(MACROS)
    body = HumanService.create_human(
        mask_helpers=True, detailed_helpers=True, extra_vertex_groups=True, feet_on_ground=True, scale=0.1, macro_detail_dict=macros
    )
    body.name = ASSET_ID
    return body


def facing(armature):
    """+1 if the standing body faces +y, -1 if it faces -y: the toes point forward."""
    bones = armature.pose.bones
    forward = bones["toe1-1.L"].head.y - bones["foot.L"].head.y
    return 1 if forward > 0 else -1


def turn_limb_toward(armature, name, target):
    """Turn the whole limb below the pose bone `name`, rigidly about its head,
    so the bone points along `target` (armature space).

    Every bone in the chain gets the same turn, set from the parent down, so
    the limb keeps its shape whatever the rig's bones inherit."""
    bone = armature.pose.bones[name]
    current = (bone.tail - bone.head).normalized()
    target = Vector(target).normalized()
    axis = current.cross(target)
    if axis.length < 1e-6:
        return
    angle = math.acos(max(-1.0, min(1.0, current.dot(target))))
    head = bone.head.copy()
    turn = Matrix.Translation(head) @ Matrix.Rotation(angle, 4, axis.normalized()) @ Matrix.Translation(-head)
    chain = [bone] + list(bone.children_recursive)
    originals = [(link, link.matrix.copy()) for link in chain]
    for link, original in originals:
        link.matrix = turn @ original
        bpy.context.view_layer.update()


def straighten_elbow(armature, side):
    """MPFB's base pose holds the elbows bent about 42 degrees with the
    forearms forward. On the table the arms lie straight: turn the forearm
    and hand on from the elbow along the upper arm's line."""
    upper = armature.pose.bones[f"upperarm02.{side}"]
    turn_limb_toward(armature, f"lowerarm01.{side}", upper.tail - upper.head)


def pose_arms(armature, forward_sign):
    """Right arm out onto the arm board, left arm down at the side, both straight."""
    bones = armature.pose.bones
    right_sign = 1.0 if bones["upperarm01.R"].head.x > 0 else -1.0
    out = math.radians(ARM_ABDUCTION_DEG)
    droop = math.radians(ARM_DROOP_DEG)
    # Standing frame: x across the body, y front to back, z up. Supine, the
    # table is behind the body, so drooping toward it is a lean backward.
    right = Vector((right_sign * math.sin(out) * math.cos(droop), -forward_sign * math.sin(droop), -math.cos(out)))
    left = Vector((-right_sign * math.sin(math.radians(6.0)), 0.0, -math.cos(math.radians(6.0))))
    for side, direction in (("R", right), ("L", left)):
        turn_limb_toward(armature, f"upperarm01.{side}", direction)
        straighten_elbow(armature, side)


def joint_positions(armature):
    """World-space heads of the joints the landmarks use, in the posed rig."""
    world = armature.matrix_world
    names = [
        "root", "pelvis.L", "pelvis.R", "spine01", "spine02", "spine03", "spine04", "spine05", "neck01", "head",
        "upperarm01.L", "upperarm01.R", "lowerarm01.L", "lowerarm01.R", "wrist.L", "wrist.R",
        "upperleg01.L", "upperleg01.R", "lowerleg01.L", "lowerleg01.R", "foot.L", "foot.R",
    ]
    joints = {}
    for name in names:
        bone = armature.pose.bones.get(name)
        if bone is not None:
            joints[name] = world @ bone.head
    return joints


def lay_supine(body, joints, forward_sign):
    """Rotate and place the standing body as the app's patient: face up, head toward +y (app -z)."""
    turn = Matrix.Rotation(math.radians(-90.0), 4, "X")
    if forward_sign > 0:
        turn = turn @ Matrix.Rotation(math.pi, 4, "Z")
    body.matrix_world = turn @ body.matrix_world
    for name in joints:
        joints[name] = turn @ joints[name]
    bpy.context.view_layer.update()
    # The back rests on the table. Only the trunk counts for the lowest point:
    # the right arm hangs a little lower on its way down to the arm board.
    trunk = [body.matrix_world @ v.co for v in body.data.vertices]
    lowest = min(p.z for p in trunk if abs(p.x) < 0.12)
    shift = Vector((0.0, 0.0, TABLE_TOP_Y - lowest))
    body.matrix_world = Matrix.Translation(shift) @ body.matrix_world
    for name in joints:
        joints[name] = joints[name] + shift
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def skin_above(body, x, y):
    """The skin surface's z straight above (x, y), or None where there is no body."""
    hit, location, _normal, _index = body.ray_cast(Vector((x, y, 2.0)), Vector((0.0, 0.0, -1.0)))
    return location.z if hit else None


def find_umbilicus(body, joints):
    """The navel: the dimple on the anterior midline between the hips and the chest.

    The midline's skin height is read along the body in 5 mm steps; the navel
    is the deepest local dip. If the mesh has no dip there, the umbilicus is
    put 13 cm along from the hip joints, which is what an adult's iliac crest
    plane is near, and the report says so."""
    hips_y = (joints["upperleg01.L"].y + joints["upperleg01.R"].y) / 2
    chest_y = joints["spine04"].y if "spine04" in joints else hips_y + 0.3
    step = 0.005
    profile = []
    y = hips_y + 0.04
    while y < chest_y - 0.02:
        z = skin_above(body, 0.0, y)
        if z is not None:
            profile.append((y, z))
        y += step
    best = None
    for i in range(6, len(profile) - 6):
        y, z = profile[i]
        around = max(profile[i - 6][1], profile[i + 6][1])
        depth = around - z
        if depth > 0.002 and all(z <= profile[j][1] for j in range(i - 6, i + 7)):
            if best is None or depth > best[2]:
                best = (y, z, depth)
    if best is not None:
        return Vector((0.0, best[0], best[1])), "dimple"
    y = hips_y + 0.13
    return Vector((0.0, y, skin_above(body, 0.0, y) or TABLE_TOP_Y + 0.2)), "fallback"


def landmarks(body, joints):
    """Surface landmarks in Blender's frame, from the joints and the skin. TODO(clinical review)."""
    marks = {}
    umbilicus, how = find_umbilicus(body, joints)
    marks["umbilicus"] = umbilicus
    for side, key in (("right", "R"), ("left", "L")):
        hip = joints[f"upperleg01.{key}"]
        # The anterior superior iliac spine sits above and a little lateral of
        # the hip joint; its skin point is straight above that.
        x = hip.x + (0.015 if hip.x > 0 else -0.015)
        y = hip.y + 0.045
        marks[f"asis_{side}"] = Vector((x, y, skin_above(body, x, y) or hip.z))
    asis = marks["asis_right"]
    mcburney = asis + (umbilicus - asis) / 3
    marks["mcburney"] = Vector((mcburney.x, mcburney.y, skin_above(body, mcburney.x, mcburney.y) or mcburney.z))
    marks["shoulder_right"] = joints["upperarm01.R"]
    marks["elbow_right"] = joints["lowerarm01.R"]
    marks["wrist_right"] = joints["wrist.R"]
    forearm_mid = (joints["lowerarm01.R"] + joints["wrist.R"]) / 2
    marks["forearm_right_top"] = Vector((forearm_mid.x, forearm_mid.y, skin_above(body, forearm_mid.x, forearm_mid.y) or forearm_mid.z))
    marks["hip_right"] = joints["upperleg01.R"]
    marks["hip_left"] = joints["upperleg01.L"]
    marks["neck"] = joints["neck01"]
    crown = max(body.data.vertices, key=lambda v: v.co.y).co
    sole = min(body.data.vertices, key=lambda v: v.co.y).co
    marks["head_top"] = Vector(crown)
    marks["feet"] = Vector(sole)
    return marks, how


def to_app(v):
    """Blender (x, y, z) to the app's (x, y, z): app y is up, app z runs toward the feet."""
    return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]


def skin_material():
    material = bpy.data.materials.get("skin") or bpy.data.materials.new("skin")
    material.use_nodes = True
    principled = next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if principled is not None:
        principled.inputs["Base Color"].default_value = (0.82, 0.60, 0.50, 1.0)
        principled.inputs["Roughness"].default_value = 0.55
    return material


def export_glb(body, path):
    """The kit's export settings (kit.py export_glb): Y-up, meshopt, no textures."""
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
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


def add_marker(name, position, radius=0.012):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=position, segments=12, ring_count=8)
    marker = bpy.context.active_object
    marker.name = f"mark_{name}"
    material = bpy.data.materials.get("marker") or bpy.data.materials.new("marker")
    material.diffuse_color = (1.0, 0.1, 0.1, 1.0)
    marker.data.materials.append(material)
    return marker


def review_renders(body, marks, review_dir):
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    world = use_studio_world()
    engine = pick_engine(scene)
    camera = make_camera(scene)
    for name in ("umbilicus", "asis_right", "asis_left", "mcburney", "forearm_right_top", "shoulder_right", "elbow_right", "wrist_right"):
        add_marker(name, marks[name])
    # A slab where the table top is, so the body's height over it can be judged.
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, TABLE_TOP_Y - 0.02))
    slab = bpy.context.active_object
    slab.scale = (0.6, 2.1, 0.02)
    slab.name = "table_slab"

    low = Vector((min(v.co.x for v in body.data.vertices), min(v.co.y for v in body.data.vertices), min(v.co.z for v in body.data.vertices)))
    high = Vector((max(v.co.x for v in body.data.vertices), max(v.co.y for v in body.data.vertices), max(v.co.z for v in body.data.vertices)))
    centre = (low + high) / 2
    radius = (high - low).length / 2
    shots = [
        (centre, radius, 25.0, 55.0, f"{ASSET_ID}_1.png"),
        (centre, radius, 90.0, 12.0, f"{ASSET_ID}_2.png"),
        (centre, radius, 200.0, 40.0, f"{ASSET_ID}_3.png"),
        (marks["mcburney"], 0.22, 20.0, 60.0, f"{ASSET_ID}_abdomen.png"),
        (marks["forearm_right_top"], 0.22, 120.0, 55.0, f"{ASSET_ID}_forearm.png"),
    ]
    for centre_, radius_, yaw, pitch, name in shots:
        shoot(scene, camera, centre_, radius_, yaw, pitch, review_dir / name)
    return engine, world, [shot[4] for shot in shots]


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    repo = Path(args[0])
    review_dir = Path(args[1])
    review_dir.mkdir(parents=True, exist_ok=True)
    report_path = review_dir / f"{ASSET_ID}_build.txt"
    try:
        HumanService, RigService, ExportService, TargetService = mpfb()
        clear_scene()
        body = create_body(HumanService, TargetService)
        armature = HumanService.add_builtin_rig(body, "default", import_weights=True)
        forward_sign = facing(armature)
        pose_arms(armature, forward_sign)
        joints = joint_positions(armature)
        RigService.apply_pose_as_rest_pose(armature)
        for modifier in list(body.modifiers):
            if modifier.type == "ARMATURE":
                body.modifiers.remove(modifier)
        bpy.data.objects.remove(armature, do_unlink=True)
        ExportService.bake_modifiers_remove_helpers(body, bake_masks=True, bake_subdiv=False, remove_helpers=True, also_proxy=False)
        body.vertex_groups.clear()
        body.data.materials.clear()
        body.data.materials.append(skin_material())

        lay_supine(body, joints, forward_sign)
        marks, umbilicus_how = landmarks(body, joints)
        # The umbilicus goes to app z = 0, where the theatre's zones expect the abdomen.
        shift = Vector((0.0, -marks["umbilicus"].y, 0.0))
        body.matrix_world = Matrix.Translation(shift) @ body.matrix_world
        bpy.ops.object.transform_apply(location=True)
        for name in marks:
            marks[name] = marks[name] + shift
        for name in joints:
            joints[name] = joints[name] + shift

        models_dir = repo / "public" / "models"
        models_dir.mkdir(parents=True, exist_ok=True)
        export_glb(body, models_dir / f"{ASSET_ID}.glb")

        triangles = sum(len(p.vertices) - 2 for p in body.data.polygons)
        low = Vector((min(v.co.x for v in body.data.vertices), min(v.co.y for v in body.data.vertices), min(v.co.z for v in body.data.vertices)))
        high = Vector((max(v.co.x for v in body.data.vertices), max(v.co.y for v in body.data.vertices), max(v.co.z for v in body.data.vertices)))
        landmarks_out = {
            "model": ASSET_ID,
            "source": "MPFB 2.0.17 basemesh, macros " + json.dumps(MACROS),
            "units": "metres, app frame: y up, patient lies along z with the head toward -z, right toward -x",
            "umbilicusMethod": umbilicus_how,
            "landmarks": {name: to_app(v) for name, v in marks.items()},
            "joints": {name: to_app(v) for name, v in joints.items()},
            "bounds": {"min": to_app(Vector((low.x, low.y, low.z))), "max": to_app(Vector((high.x, high.y, high.z)))},
        }
        # App bounds: y and z swap with a sign, so min and max of z trade places.
        landmarks_out["bounds"] = {
            "min": [round(low.x, 4), round(low.z, 4), round(-high.y, 4)],
            "max": [round(high.x, 4), round(high.z, 4), round(-low.y, 4)],
        }
        data_path = repo / "src" / "data" / "bodyLandmarks.json"
        data_path.write_text(json.dumps(landmarks_out, indent=2) + "\n", encoding="utf-8")

        engine, world, rendered = review_renders(body, marks, review_dir)
        size = high - low
        report_path.write_text(
            f"ok engine={engine} world={world} triangles={triangles} vertices={len(body.data.vertices)} "
            f"size_m={size.x:.3f}x{size.y:.3f}x{size.z:.3f} (blender x, y, z) facing={forward_sign} umbilicus={umbilicus_how}\n"
            + "\n".join(f"{name}: app {to_app(v)}" for name, v in marks.items())
            + f"\nrendered {' '.join(rendered)}\n",
            encoding="utf-8",
        )
    except Exception:
        report_path.write_text("failed\n" + traceback.format_exc(), encoding="utf-8")


if __name__ == "__main__":
    main()
