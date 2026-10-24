"""Step 22 - outfit showcase renders (validation of combinations, tint colours and face presets)."""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\viz_preview.py", encoding="utf-8").read())
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\viz_materials.py", encoding="utf-8").read())
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\test_poses.py", encoding="utf-8").read())

OUT = os.path.join(ROOT, "renders", "catalog")

OUTFITS = [
    {"male": dict(pieces=["top_shirt", "bottom_jeans", "footwear_shoes", "hair_parted", "facial_mustache", "accessory_glasses"],
                  brows="regular", preset="classico", skin="#cf936d", hair="#201a19", eyes="#704529",
                  colors={"top_shirt": "#d7d5d0", "bottom_jeans": "#385d86", "footwear_shoes": "#493126", "accessory_glasses": "#111820"}),
     "female": dict(pieces=["top_tank", "bottom_skirt", "footwear_flipflops", "hair_long", "accessory_bracelet"],
                    brows="thin", preset="suave", skin="#e8b894", hair="#b88742", eyes="#4e7a9a",
                    colors={"top_tank": "#873e37", "bottom_skirt": "#24363d", "footwear_flipflops": "#51645b", "accessory_bracelet": "#b18c4d"})},
    {"male": dict(pieces=["top_hoodie", "bottom_shorts", "footwear_sneakers", "hair_buzzed", "facial_beard_full", "accessory_cap"],
                  brows="thick", preset="bochechudo", skin="#70412e", hair="#201a19", eyes="#704529",
                  colors={"top_hoodie": "#51645b", "bottom_shorts": "#b18c4d", "footwear_sneakers": "#d7d5d0", "accessory_cap": "#873e37"}),
     "female": dict(pieces=["top_jacket", "bottom_jeans", "footwear_shoes", "hair_ponytail", "accessory_sunglasses"],  # boots+jeans is blocked
                    brows="regular", preset="marcante", skin="#975b3d", hair="#201a19", eyes="#704529",
                    colors={"top_jacket": "#111820", "bottom_jeans": "#385d86", "footwear_shoes": "#493126", "accessory_sunglasses": "#111820"})},
    {"male": dict(pieces=["top_tee", "bottom_jeans", "footwear_sneakers", "hair_medium", "facial_goatee", "accessory_hat"],
                  brows="regular", preset="serio", skin="#e8b894", hair="#75452d", eyes="#567a45",
                  colors={"top_tee": "#24363d", "bottom_jeans": "#24363d", "footwear_sneakers": "#75452d", "accessory_hat": "#b18c4d"}),
     "female": dict(pieces=["top_shirt", "bottom_shorts", "footwear_boots", "hair_bun"],
                    brows="thin", preset="redonda", skin="#f5d6be", hair="#a34c2c", eyes="#567a45",
                    colors={"top_shirt": "#385d86", "bottom_shorts": "#d7d5d0", "footwear_boots": "#873e37"})},
]


def restore_materials():
    for ob in bpy.data.objects:
        for k in [k for k in ob.keys() if k.startswith("bar_pv_src_")]:
            slot = int(k.rsplit("_", 1)[1])
            ob.data.materials[slot] = bpy.data.materials[ob[k]]
            del ob[k]
    for m in list(bpy.data.materials):
        if m.name.startswith("PV_"):
            bpy.data.materials.remove(m)
        elif "bar_prev_color" in m.keys():
            b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            b.inputs["Base Color"].default_value = m["bar_prev_color"]
            del m["bar_prev_color"]


def setup_outfit(outfit):
    restore_materials()
    restore_preview()
    for o in list(bpy.data.objects):
        if o.name.startswith("PREVIEW_"):
            bpy.data.objects.remove(o, do_unlink=True)
    shown = set()
    cfg_colors = {}
    for body, spec in outfit.items():
        hides = []
        for p in spec["pieces"]:
            ob = bpy.data.objects[f"{p}__{body}"]
            hides += [h for h in ob.get("bar_hides", "").split(",") if h]
            shown.add(ob.name)
        pv = preview_body(body, with_waist(hides, spec["pieces"]))
        pv.data.materials.clear()
        pv.data.materials.append(bpy.data.materials[f"CharacterSkin__{body}"])
        shown |= {pv.name, f"BAR_Eyes__{body}", f"BAR_Brows_{spec['brows']}__{body}"}
        presets = json.loads(bpy.data.objects[f"BAR_Body_{body.capitalize()}"]["bar_face_presets"])
        w = presets[spec["preset"]]
        for name in [pv.name, f"BAR_Brows_{spec['brows']}__{body}"] + [f"{p}__{body}" for p in spec["pieces"]]:
            ob = bpy.data.objects[name]
            if ob.data.shape_keys:
                for k in ob.data.shape_keys.key_blocks[1:]:
                    k.value = w.get(k.name, 0.0)
        cfg_colors.update(spec["colors"])
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.hide_render = o.name not in shown
            o.hide_set(o.name not in shown)
    return cfg_colors


def render_outfits(pose=None, action=None, frame=0, tag="idle"):
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        pass
    scene.eevee.taa_render_samples = 24
    scene.render.resolution_x, scene.render.resolution_y = 1000, 760
    if scene.world is None:
        scene.world = bpy.data.worlds.new("BAR_validation_world")
    scene.world.use_nodes = True
    bg = next(n for n in scene.world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.32, 0.27, 0.22, 1)
    bg.inputs[1].default_value = 1.1
    cam = bpy.data.objects.get("VAL_CAM") or bpy.data.objects.new("VAL_CAM", bpy.data.cameras.new("VAL_CAM"))
    if cam.name not in scene.collection.objects:
        scene.collection.objects.link(cam)
    sun = bpy.data.objects.get("VAL_SUN") or bpy.data.objects.new("VAL_SUN", bpy.data.lights.new("VAL_SUN", "SUN"))
    if sun.name not in scene.collection.objects:
        scene.collection.objects.link(sun)
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(55), 0, math.radians(25))
    scene.camera = cam
    cam.data.lens = 42
    paths = []
    for i, outfit in enumerate(OUTFITS):
        colors = setup_outfit(outfit)
        for body, spec in outfit.items():
            rig = bpy.data.objects[f"RIG_{body}"]
            rig.location = (-0.45 if body == "female" else 0.45, 0, 0)
            rig.animation_data_create()
            if action:
                rig.animation_data.action = bpy.data.actions[f"{action}__{body}"]
            else:
                rig.animation_data.action = None
                apply_pose(rig, pose or "rest")
        cfg = dict(DEFAULT_CFG)
        cfg["colors"] = colors
        # one tint config per body: apply twice with each body's own skin/hair/eye colours
        restore_preview()
        for body, spec in outfit.items():
            c = {"skinTone": spec["skin"], "outfitColor": "#24363d", "hairColor": spec["hair"], "eyeColor": spec["eyes"], "colors": colors}
            apply_body_preview(body, c)
        scene.frame_set(frame)
        for name, pos in (("front", (0.6, -3.7, 1.15)), ("back", (-0.8, 3.6, 1.2))):
            cam.location = pos
            cam.rotation_euler = (Vector((0, 0, 0.92)) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
            p = os.path.join(OUT, f"outfit_{i + 1:02d}_{tag}_{name}.png")
            scene.render.filepath = p
            bpy.ops.render.render(write_still=True)
            paths.append(os.path.relpath(p, ROOT).replace("\\", "/"))
    cleanup()
    return paths


def apply_body_preview(body, cfg):
    cache = {}
    for ob in bpy.data.objects:
        if ob.type != "MESH" or not ob.data.materials or ob.hide_render:
            continue
        if not (ob.name.endswith(f"__{body}") or ob.name == f"BAR_Body_{body.capitalize()}"):
            continue
        for slot, src in enumerate(ob.data.materials):
            if src is None or src.name.startswith("PV_") or not src.use_nodes:
                continue
            if not any(n.type == "TEX_IMAGE" for n in src.node_tree.nodes):
                continue
            key = src.name
            if key not in cache:
                n = src.name
                if n.startswith("CharacterSkin"):
                    cache[key] = pv_material(src, hex_lin(cfg["skinTone"]), hex_lin(cfg["outfitColor"]))
                elif n == "CharacterEyes":
                    cache[key] = pv_material(src, hex_lin(cfg["eyeColor"]), (1, 1, 1, 1))
                elif n == "CharacterHair":
                    cache[key] = pv_material(src, hex_lin(cfg["hairColor"]), hex_lin(cfg["hairColor"]))
                elif n.startswith("CharacterClothing-"):
                    piece = n.split("-", 1)[1].split("__")[0]
                    cache[key] = pv_material(src, hex_lin(cfg["colors"].get(piece, "#888888")), (1, 1, 1, 1))
                else:
                    continue
                cache[key].name = f"PV_{body}_{src.name}"
            ob[f"bar_pv_src_{slot}"] = src.name
            ob.data.materials[slot] = cache[key]
    # untextured accessory frames: tint the base colour directly (restored in cleanup)
    for ob in bpy.data.objects:
        if ob.type == "MESH" and ob.name.endswith(f"__{body}") and ob.name.startswith("accessory_") and not ob.hide_render:
            m = ob.data.materials[0]
            b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            m["bar_prev_color"] = list(b.inputs["Base Color"].default_value)
            b.inputs["Base Color"].default_value = hex_lin(cfg["colors"].get(ob.name.split("__")[0], "#888888"))


def cleanup():
    for ob in bpy.data.objects:
        for k in [k for k in ob.keys() if k.startswith("bar_pv_src_")]:
            slot = int(k.rsplit("_", 1)[1])
            ob.data.materials[slot] = bpy.data.materials[ob[k]]
            del ob[k]
    for m in list(bpy.data.materials):
        if m.name.startswith("PV_"):
            bpy.data.materials.remove(m)
        elif "bar_prev_color" in m.keys():
            b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            b.inputs["Base Color"].default_value = m["bar_prev_color"]
            del m["bar_prev_color"]
    restore_preview()
    for o in list(bpy.data.objects):
        if o.name.startswith(("PREVIEW_", "VAL_")):
            bpy.data.objects.remove(o, do_unlink=True)
    for o in bpy.data.objects:
        o.hide_render = False
        if o.type == "MESH" and o.data.shape_keys:
            for k in o.data.shape_keys.key_blocks[1:]:
                k.value = 0.0
    for body in ("male", "female"):
        rig = bpy.data.objects[f"RIG_{body}"]
        if rig.animation_data:
            rig.animation_data.action = None
        apply_pose(rig, "rest")


if __name__ == "__main__" or True:
    PATHS = render_outfits(action="Idle", frame=30, tag="idle")
    print(PATHS)
