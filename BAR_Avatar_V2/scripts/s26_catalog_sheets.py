"""Step 26 - catalogue sheets for visual QA: every piece on its body in the Idle pose (arms down, frame 30),
with the regions it hides removed as in game. Workbench, flat colours per category. One sheet per category and
body in renders/catalog/sheet_<category>_<body>.png; rows follow the order printed (and listed in README.md)."""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\viz_grid.py", encoding="utf-8").read())
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\viz_preview.py", encoding="utf-8").read())

POSE = ("Idle", 30)
SKIN = (0.86, 0.68, 0.55, 1)
COLOR = {"hair": (0.33, 0.21, 0.13, 1), "facial": (0.25, 0.16, 0.1, 1), "top": (0.25, 0.4, 0.75, 1), "bottom": (0.18, 0.24, 0.38, 1),
         "footwear": (0.6, 0.18, 0.14, 1), "accessory": (0.85, 0.65, 0.2, 1)}
HEAD = [("front", (0, -1, 0.05)), ("side", (1, 0, 0.05)), ("back", (0, 1, 0.1))]
SHEETS = {
    "hair": (["hair_short", "hair_buzzed", "hair_parted", "hair_medium", "hair_long", "hair_ponytail", "hair_bun", "hair_wavy"], "head", 0.85, HEAD),
    "facial": (["facial_beard_short", "facial_beard_full", "facial_goatee", "facial_mustache"], "head", 0.6,
               [("front", (0, -1, 0.0)), ("3q", (0.8, -1, 0.0))]),
    "tops": (["top_tee", "top_shirt", "top_tank", "top_hoodie", "top_jacket"], "chest", 1.7, [("front", (0, -1, 0.05)), ("back", (0, 1, 0.05))]),
    "bottoms": (["bottom_jeans", "bottom_shorts", "bottom_skirt"], "knee", 2.0, [("front", (0.3, -1, 0.0)), ("back", (-0.3, 1, 0.0))]),
    "footwear": (["footwear_sneakers", "footwear_shoes", "footwear_boots", "footwear_flipflops"], "feet", 0.9,
                 [("3q", (0.7, -1, 0.35)), ("side", (1, 0, 0.15))]),
    "accessories": (["accessory_glasses", "accessory_sunglasses", "accessory_cap", "accessory_hat", "accessory_bracelet"], None, 0.75,
                    [("front", (0, -1, 0.05)), ("3q", (0.9, -1, 0.15))]),
}


def target(rig, where, piece=""):
    pb = rig.pose.bones
    w = lambda b, end="head": rig.matrix_world @ (pb[b].head if end == "head" else pb[b].tail)
    if where is None:
        where = "wrist" if piece == "accessory_bracelet" else "head"
    if where == "head":
        return tuple(w("head") + Vector((0, 0, 0.09)))
    if where == "chest":
        return tuple(w("spine_02") + Vector((0, 0, 0.05)))
    if where == "knee":
        return tuple(w("lowerleg_l") * 0.5 + w("lowerleg_r") * 0.5 + Vector((0, 0, 0.15)))
    if where == "feet":
        return tuple(w("foot_l") * 0.5 + w("foot_r") * 0.5 + Vector((0, -0.04, 0.0)))
    if where == "wrist":
        return tuple(w("lowerarm_l", "tail"))
    raise KeyError(where)


def show(body, pieces, shape=None):
    """Preview body (covered regions removed) + pieces; everything else hidden from the render."""
    hides = []
    for p in pieces:
        hides += [h for h in bpy.data.objects[f"{p}__{body}"].get("bar_hides", "").split(",") if h]
    pv = preview_body(body, with_waist(hides, pieces))
    pv.color = SKIN
    shown = {pv.name, f"BAR_Eyes__{body}", f"BAR_Brows_regular__{body}"} | {f"{p}__{body}" for p in pieces}
    for p in pieces:
        bpy.data.objects[f"{p}__{body}"].color = COLOR[p.split("_")[0]]
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.hide_render = o.name not in shown
    weights = shape or {}
    for name in [pv.name, f"BAR_Brows_regular__{body}"] + [f"{p}__{body}" for p in pieces]:
        ob = bpy.data.objects[name]
        if ob.data.shape_keys:
            for k in ob.data.shape_keys.key_blocks[1:]:
                k.value = weights.get(k.name, 0.0)
    return pv


def sheet(name, body, rows, where, dist, views, cell=(300, 300)):
    rig = bpy.data.objects[f"RIG_{body}"]
    rig.animation_data_create()
    rig.animation_data.action = bpy.data.actions[f"{POSE[0]}__{body}"]
    bpy.context.scene.frame_set(POSE[1])
    out_rows = []
    for label, pieces, shape in rows:
        pv = show(body, pieces, shape)
        bpy.context.view_layer.update()
        tgt = Vector(target(rig, where, pieces[0] if pieces else ""))
        cells = []
        for _, d in views:
            d = Vector(d).normalized()
            p = render_shot("_cell", tuple(tgt + d * dist), tuple(tgt), lens=50, size=cell, folder="_tmp")
            cells.append(load_png(p))
        out_rows.append(np.concatenate(cells, 1))
        bpy.data.objects.remove(pv, do_unlink=True)
    out = os.path.join(RENDERS, "catalog", f"{name}.png")
    save_png_array(out, np.concatenate(out_rows[::-1], 0))  # image rows are bottom-up
    return out, [r[0] for r in rows]


def restore():
    for body in ("male", "female"):
        rig = bpy.data.objects[f"RIG_{body}"]
        rig.animation_data.action = None
        for pb in rig.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
    for o in bpy.data.objects:
        o.hide_render = False
        if o.type == "MESH" and o.data.shape_keys:
            for k in o.data.shape_keys.key_blocks[1:]:
                k.value = 0.0
    bpy.context.scene.frame_set(0)


def run():
    done = {}
    locs = {b: bpy.data.objects[f"RIG_{b}"].location.copy() for b in ("male", "female")}
    try:
        for body in ("male", "female"):
            bpy.data.objects[f"RIG_{body}"].location = (0, 0, 0)
            for cat, (items, where, dist, views) in SHEETS.items():
                items = [p for p in items if bpy.data.objects.get(f"{p}__{body}")]
                done[f"sheet_{cat}_{body}"] = sheet(f"sheet_{cat}_{body}", body, [(p, [p], None) for p in items], where, dist, views)
            presets = json.loads(bpy.data.objects[f"BAR_Body_{body.capitalize()}"]["bar_face_presets"])
            done[f"sheet_face_presets_{body}"] = sheet(f"sheet_face_presets_{body}", body, [(k, [], v) for k, v in presets.items()],
                                                       "head", 0.6, [("front", (0, -1, 0.0)), ("3q", (0.8, -1, 0.0))])
    finally:
        restore()
        for b, l in locs.items():
            bpy.data.objects[f"RIG_{b}"].location = l
    return done


SHEETS_DONE = run()
for k, (path, rows) in SHEETS_DONE.items():
    print(k, "rows (top to bottom):", rows)
