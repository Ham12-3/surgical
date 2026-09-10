"""
Phase 0 check that the Blender MCP can build, show and remove geometry.

Run block 1, take a viewport screenshot (get_viewport_screenshot), then run
block 2. Run on 2026-09-10 against Blender 5.2.1: the cube measured
1.0 x 1.0 x 1.0 m and rendered in the viewport. Builds no asset.
"""

import bmesh
import bpy

# --- Block 1: a 1 m cube resting on the ground plane, framed in the viewport ---
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
mesh = bpy.data.meshes.new("mcp_check_cube")
bm.to_mesh(mesh)
bm.free()
cube = bpy.data.objects.new("mcp_check_cube", mesh)
cube.location = (0.0, 0.0, 0.5)
bpy.context.scene.collection.objects.link(cube)
bpy.context.view_layer.update()
print("dimensions", [round(d, 4) for d in cube.dimensions])

for other in bpy.context.view_layer.objects:
    other.select_set(False)
cube.select_set(True)
bpy.context.view_layer.objects.active = cube
for window in bpy.context.window_manager.windows:
    for area in window.screen.areas:
        if area.type == "VIEW_3D":
            region = next(r for r in area.regions if r.type == "WINDOW")
            with bpy.context.temp_override(window=window, area=area, region=region):
                bpy.ops.view3d.view_selected()

# --- Block 2: remove it again ---
cube = bpy.data.objects.get("mcp_check_cube")
if cube is not None:
    mesh = cube.data
    bpy.data.objects.remove(cube, do_unlink=True)
    bpy.data.meshes.remove(mesh)
