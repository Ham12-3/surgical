"""
Headless review renders for the realism checklist, without the Blender MCP:

    blender --background --factory-startup --python blender/scripts/review.py -- <id> <out_dir> [<hinge_degrees> [<axis>]]

Builds the asset from its script, with the kit prepended as build.py does,
stands a scale reference beside it, and renders three angles to
<out_dir>/<id>_<n>.png under Blender's bundled interior.exr. Instruments and
props get a 10 cm ruler: next to the 1.8 m figure a 15 cm instrument would be
a few pixels tall. Environment and anatomy get the figure.

Instruments also get <id>_tip.png, a close-up of the working end, where
instruments that look alike differ, and <id>_tip_side.png, the same end seen
side on through the thickness, where jaws, teeth and blade edges meet. Props
get <id>_close_<n>.png, the three angles again framed on the prop alone: a
suture needle is a speck beside the 10 cm ruler. Given a hinge angle (and the
hinge's axis, "z" unless it says "x"), the jaw_upper and jaw_lower pivots are
then turned apart as the app turns them and <id>_open.png,
<id>_open_tip.png and <id>_open_tip_side.png are rendered too, to check the
halves swing about the joint.

Blender prints nothing through the Store launcher, so the outcome (engine,
triangles, or the error) is written to <out_dir>/<id>_review.txt.
"""

import math
import sys
import traceback
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True  # no __pycache__ left in the repo
from build import asset_source  # noqa: E402 - found through the path set just above

ANGLES = [(35.0, 20.0), (215.0, 25.0), (120.0, 60.0)]  # yaw and pitch, degrees, as review_view()
TIP_ANGLE = (35.0, 25.0)
TIP_SIDE = (90.0, 5.0)  # from +x, looking across the thickness


def load_asset(asset_id):
    """Run the asset's script with its kit prepended; return its namespace."""
    source, script = asset_source(asset_id)
    namespace = {"__name__": f"review_{asset_id}"}
    exec(compile(source, str(script), "exec"), namespace)
    return namespace


def clear_startup_scene():
    for name in ("Cube", "Light", "Camera"):
        obj = bpy.data.objects.get(name)
        if obj is not None:
            bpy.data.objects.remove(obj, do_unlink=True)


def use_studio_world():
    """Light the scene with the same bundled HDRI the MCP reviews use.

    The studio-light list knows where Blender installed the file; asking
    bpy.utils.system_resource for it returned an empty path on the Store
    build. Without it the world falls back to a flat grey."""
    world = bpy.context.scene.world or bpy.data.worlds.new("review")
    bpy.context.scene.world = world
    nodes, links = world.node_tree.nodes, world.node_tree.links
    background = next(node for node in nodes if node.type == "BACKGROUND")
    light = bpy.context.preferences.studio_lights.get("interior.exr")
    if light is None or not light.path:
        background.inputs["Color"].default_value = (0.18, 0.18, 0.18, 1.0)
        return "flat grey"
    environment = nodes.new("ShaderNodeTexEnvironment")
    environment.image = bpy.data.images.load(light.path)
    links.new(environment.outputs["Color"], background.inputs["Color"])
    # Light with the HDRI, but show the camera a plain backdrop, so the model
    # reads against grey rather than against the photo of a room.
    backdrop = nodes.new("ShaderNodeBackground")
    backdrop.inputs["Color"].default_value = (0.16, 0.17, 0.18, 1.0)
    light_path = nodes.new("ShaderNodeLightPath")
    mix = nodes.new("ShaderNodeMixShader")
    output = next(node for node in nodes if node.type == "OUTPUT_WORLD")
    links.new(light_path.outputs["Is Camera Ray"], mix.inputs[0])
    links.new(background.outputs["Background"], mix.inputs[1])
    links.new(backdrop.outputs["Background"], mix.inputs[2])
    links.new(mix.outputs["Shader"], output.inputs["Surface"])
    return "interior.exr"


def pick_engine(scene):
    """EEVEE when it is available headless, otherwise Workbench, which always is."""
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = engine
            scene.eevee.taa_render_samples = 16
            return engine
        except (TypeError, AttributeError):
            continue
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    return "BLENDER_WORKBENCH"


def bounds(objects):
    """World-space bounding box of mesh objects, as (min, max) vectors."""
    corners = [obj.matrix_world @ Vector(corner) for obj in objects if obj.type == "MESH" for corner in obj.bound_box]
    low = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    high = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    return low, high


def add_reference(namespace, asset_id, low, high):
    """A 10 cm ruler beside an instrument or prop, the 1.8 m figure beside anything else."""
    if asset_id.startswith(("inst_", "prop_")):
        bm = namespace["bmesh"].new()
        # The ruler stands in app space beside the model's +x side: a bar with
        # a tick every centimetre and a longer one at 5.
        x = high.x + 0.02
        z = -(low.y + high.y) / 2  # app z of the model's centre
        namespace["slab"](bm, (x, 0.0, z - 0.002), (x + 0.004, 0.1, z + 0.002), 0.0005, 0, along="y")
        for cm in range(11):
            reach = 0.006 if cm % 5 == 0 else 0.0035
            y = cm * 0.01
            namespace["slab"](bm, (x + 0.004, y - 0.0004, z - 0.001), (x + 0.004 + reach, y + 0.0004, z + 0.001), 0.0002, 0, along="x")
        return namespace["finish"](bm, "ref_ruler_10cm", ["paint"])
    person = namespace["reference_human"](x=0.0, z=0.0)
    person.location = Vector((high.x + 0.5, 0.0, 0.0))
    return person


def make_camera(scene):
    data = bpy.data.cameras.new("review")
    data.lens = 35
    camera = bpy.data.objects.new("review", data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera


def shoot(scene, camera, centre, radius, yaw, pitch, path):
    """Render the sphere at `centre` from `yaw` and `pitch` degrees to `path`.

    A 35 mm lens on a 16:9 frame sees about 32 degrees vertically; 3.8 radii
    back keeps the whole sphere in frame."""
    a, p = math.radians(yaw), math.radians(pitch)
    direction = Vector((math.sin(a) * math.cos(p), -math.cos(a) * math.cos(p), math.sin(p)))
    camera.data.clip_start = radius * 0.01
    camera.data.clip_end = radius * 100
    camera.location = centre + direction * radius * 3.8
    camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def tip_view(low, high):
    """Centre and radius of a close-up on an instrument's working end: the
    bottom fifth of its length, around the tip at the origin."""
    length = high.z - low.z
    return Vector((0.0, 0.0, low.z + 0.11 * length)), max(0.12 * length, 0.008)


def open_hinge(degrees, axis):
    """Turn the jaw_upper and jaw_lower pivots apart as the app does
    (src/scene/articulation.ts), in Blender axes. App z is Blender -y, so the
    app's +half about z is -half about Blender y; app x is Blender x, and the
    app turns jaw_upper by -half about it. Either way jaw_upper's Blender
    angle is -half."""
    half = math.radians(degrees) / 2
    index = 1 if axis == "z" else 0
    for name, sign in (("jaw_upper", -1), ("jaw_lower", 1)):
        node = bpy.data.objects.get(name)
        if node is None:
            raise RuntimeError(f"no {name} pivot to open")
        node.rotation_euler[index] = sign * half
    bpy.context.view_layer.update()


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    asset_id, out_dir = args[0], Path(args[1])
    hinge_degrees = float(args[2]) if len(args) > 2 else None
    hinge_axis = args[3] if len(args) > 3 else "z"
    out_dir.mkdir(parents=True, exist_ok=True)
    report = out_dir / f"{asset_id}_review.txt"
    try:
        clear_startup_scene()
        namespace = load_asset(asset_id)
        built = namespace["build"]()
        objects = list(built) if isinstance(built, (list, tuple)) else [built]
        triangles = sum(len(p.vertices) - 2 for obj in objects if obj.type == "MESH" for p in obj.data.polygons)
        low, high = bounds(objects)
        reference = add_reference(namespace, asset_id, low, high)

        scene = bpy.context.scene
        scene.render.resolution_x, scene.render.resolution_y = 960, 540
        world = use_studio_world()
        engine = pick_engine(scene)
        camera = make_camera(scene)
        whole_low, whole_high = bounds(objects + [reference])
        centre = (whole_low + whole_high) / 2
        radius = max((whole_high - whole_low).length / 2, 0.05)
        # Each shot: centre, radius, yaw, pitch, file name, and whether the
        # scale reference shows. Close-ups leave it out: side on, the ruler
        # stands between the camera and the tip.
        shots = []
        for number, (yaw, pitch) in enumerate(ANGLES, start=1):
            shots.append((centre, radius, yaw, pitch, f"{asset_id}_{number}.png", True))
        if asset_id.startswith("inst_"):
            tip_centre, tip_radius = tip_view(low, high)
            shots.append((tip_centre, tip_radius, *TIP_ANGLE, f"{asset_id}_tip.png", False))
            shots.append((tip_centre, tip_radius, *TIP_SIDE, f"{asset_id}_tip_side.png", False))
        elif asset_id.startswith("prop_"):
            own_centre = (low + high) / 2
            own_radius = max((high - low).length / 2, 0.004)
            for number, (yaw, pitch) in enumerate(ANGLES, start=1):
                shots.append((own_centre, own_radius, yaw, pitch, f"{asset_id}_close_{number}.png", False))

        def render(batch):
            for *view, name, with_reference in batch:
                reference.hide_render = not with_reference
                shoot(scene, camera, *view, out_dir / name)
            return [shot[4] for shot in batch]

        rendered = render(shots)
        if hinge_degrees is not None:
            open_hinge(hinge_degrees, hinge_axis)
            tip_centre, tip_radius = tip_view(low, high)
            rendered += render([
                (centre, radius, *ANGLES[0], f"{asset_id}_open.png", True),
                (tip_centre, tip_radius, *TIP_ANGLE, f"{asset_id}_open_tip.png", False),
                (tip_centre, tip_radius, *TIP_SIDE, f"{asset_id}_open_tip_side.png", False),
            ])

        size = high - low
        report.write_text(
            f"ok engine={engine} world={world} triangles={triangles} "
            f"size_m={size.x:.3f}x{size.y:.3f}x{size.z:.3f} (blender x, y, z)\n"
            f"rendered {' '.join(rendered)}\n",
            encoding="utf-8",
        )
    except Exception:
        report.write_text("failed\n" + traceback.format_exc(), encoding="utf-8")


main()
