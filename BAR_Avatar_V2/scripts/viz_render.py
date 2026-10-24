"""Render helper with an explicit camera (validation images in BAR_Avatar_V2/renders)."""
import bpy
import os
from mathutils import Vector

RENDERS = r"C:\Users\rafael\BAR_Avatar_V2\renders"


def render_shot(name, cam_pos, target, lens=50, size=(1600, 700), engine="BLENDER_WORKBENCH", color="OBJECT", folder="catalog"):
    scene = bpy.context.scene
    prev = scene.render.engine
    try:
        scene.render.engine = engine
    except TypeError:
        scene.render.engine = "BLENDER_WORKBENCH"
    if scene.render.engine == "BLENDER_WORKBENCH":
        scene.display.shading.light = "STUDIO"
        scene.display.shading.color_type = color
        scene.display.shading.show_shadows = False
        scene.display.shading.show_cavity = True
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    cam = bpy.data.objects.get("SHOT_CAM") or bpy.data.objects.new("SHOT_CAM", bpy.data.cameras.new("SHOT_CAM"))
    if cam.name not in scene.collection.objects:
        scene.collection.objects.link(cam)
    cam.data.lens = lens
    cam.location = cam_pos
    cam.rotation_euler = (Vector(target) - Vector(cam_pos)).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    os.makedirs(os.path.join(RENDERS, folder), exist_ok=True)
    path = os.path.join(RENDERS, folder, f"{name}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    scene.render.engine = prev
    return path
