"""Step 15 - Blender-side validation renders (clothing in motion and stress poses). Not exported."""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\viz_preview.py", encoding="utf-8").read())
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\viz_materials.py", encoding="utf-8").read())
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\test_poses.py", encoding="utf-8").read())

OUT = os.path.join(ROOT, "renders", "validation")
os.makedirs(OUT, exist_ok=True)
OUTFIT = ["top_tee", "bottom_jeans", "footwear_sneakers", "hair_short"]
BROWS = {"male": "thick", "female": "regular"}


def worn_hides(body):
    hides = []
    for p in OUTFIT:
        ob = bpy.data.objects[f"{p}__{body}"]
        hides += [h for h in ob.get("bar_hides", "").split(",") if h]
    return with_waist(hides, OUTFIT)


def setup():
    restore_preview()
    shown = set()
    for i, body in enumerate(("female", "male")):
        pv = preview_body(body, worn_hides(body))
        pv.data.materials.clear()
        pv.data.materials.append(bpy.data.materials[f"CharacterSkin__{body}"])
        bpy.data.objects[f"RIG_{body}"].location = (-0.5 if body == "female" else 0.5, 0, 0)
        shown |= {pv.name, f"BAR_Eyes__{body}", f"BAR_Brows_{BROWS[body]}__{body}"} | {f"{p}__{body}" for p in OUTFIT}
    apply_preview(DEFAULT_CFG)
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.hide_set(o.name not in shown)
            o.hide_render = o.name not in shown
        if o.type in ("ARMATURE", "EMPTY"):
            o.hide_set(True)
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        pass
    scene.eevee.taa_render_samples = 16
    scene.render.resolution_x, scene.render.resolution_y = 900, 700
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("BAR_validation_world")
    scene.world.use_nodes = True
    bg = next(n for n in scene.world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.35, 0.33, 0.30, 1)
    bg.inputs[1].default_value = 1.2
    cam = bpy.data.objects.get("VAL_CAM") or bpy.data.objects.new("VAL_CAM", bpy.data.cameras.new("VAL_CAM"))
    if cam.name not in scene.collection.objects:
        scene.collection.objects.link(cam)
    scene.camera = cam
    sun = bpy.data.objects.get("VAL_SUN") or bpy.data.objects.new("VAL_SUN", bpy.data.lights.new("VAL_SUN", "SUN"))
    if sun.name not in scene.collection.objects:
        scene.collection.objects.link(sun)
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    return cam


def shoot(cam, name, pos, target=(0, 0, 0.9), lens=40):
    cam.data.lens = lens
    cam.location = pos
    cam.rotation_euler = (Vector(target) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
    p = os.path.join(OUT, f"blender_{name}.png")
    bpy.context.scene.render.filepath = p
    bpy.ops.render.render(write_still=True)
    return os.path.relpath(p, ROOT).replace("\\", "/")


def pose_both(name=None, action=None, frame=0):
    for body in ("male", "female"):
        rig = bpy.data.objects[f"RIG_{body}"]
        rig.animation_data_create()
        if action:
            rig.animation_data.action = bpy.data.actions[f"{action}__{body}"]
        else:
            rig.animation_data.action = None
            apply_pose(rig, name)
    bpy.context.scene.frame_set(frame)


def run():
    cam = setup()
    shots = []
    pose_both("rest")
    shots.append(shoot(cam, "tpose_front", (0, -4.6, 1.0)))
    shots.append(shoot(cam, "tpose_back", (0, 4.6, 1.0)))
    pose_both(action="Idle", frame=40)
    shots.append(shoot(cam, "idle_3q", (2.6, -3.6, 1.2)))
    for f in (4, 13, 22):
        pose_both(action="Walk", frame=f)
        shots.append(shoot(cam, f"walk_side_{f:02d}", (4.4, -0.4, 1.0)))
    for p in ("sit", "arms_up", "stress"):
        pose_both(p)
        shots.append(shoot(cam, f"pose_{p}_3q", (2.8, -3.4, 1.1)))
    pose_both("rest")
    for body in ("male", "female"):
        bpy.data.objects[f"RIG_{body}"].animation_data.action = None
    restore_preview()
    for o in list(bpy.data.objects):
        if o.name.startswith(("PREVIEW_", "VAL_")):
            bpy.data.objects.remove(o, do_unlink=True)
    for o in bpy.data.objects:
        o.hide_render = False
    return shots


SHOTS = run()
print(SHOTS)
