"""Step 23 - animation contact sheet (6 frames per clip, dressed character) for visual QA."""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\viz_grid.py", encoding="utf-8").read())
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\viz_preview.py", encoding="utf-8").read())

CLIP_ORDER = ["Idle", "Walk", "Run", "Sit", "Drink", "Dance", "Wave", "Use", "DrunkIdle", "DrunkWalk", "Fallen",
              "Recover", "Wait", "CardsSit", "AngrySit", "Pose", "OldCaneWalk", "OldCaneHold"]
OUTFIT = ["top_tee", "bottom_jeans", "footwear_sneakers", "hair_short"]
COL = {"top": (0.25, 0.4, 0.75, 1), "bottom": (0.15, 0.2, 0.32, 1), "footwear": (0.6, 0.18, 0.14, 1), "hair": (0.22, 0.14, 0.09, 1)}


def contact_sheet(body="male", clips=CLIP_ORDER, n=6, cell=(170, 230)):
    rig = bpy.data.objects[f"RIG_{body}"]
    rig.location = (0, 0, 0)
    hides = []
    shown = set()
    for p in OUTFIT:
        ob = bpy.data.objects[f"{p}__{body}"]
        hides += [h for h in ob.get("bar_hides", "").split(",") if h]
        ob.color = COL[p.split("_")[0]]
        shown.add(ob.name)
    pv = preview_body(body, with_waist(hides, OUTFIT))
    pv.color = (0.86, 0.68, 0.55, 1)
    shown |= {pv.name, f"BAR_Eyes__{body}"}
    hidden_before = {}
    for o in bpy.data.objects:
        hidden_before[o.name] = o.hide_render
        if o.type == "MESH":
            o.hide_render = o.name not in shown
    rows = []
    for clip in clips:
        act = bpy.data.actions[f"{clip}__{body}"]
        rig.animation_data_create()
        rig.animation_data.action = act
        last = int(act.frame_range[1])
        cells = []
        for k in range(n):
            f = int(round(k * last / max(n - 1, 1)))
            bpy.context.scene.frame_set(f)
            hip = rig.matrix_world @ rig.pose.bones["hip"].head
            tgt = (hip.x, hip.y, max(0.55, hip.z - 0.05))
            p = render_shot("_cell", (tgt[0] + 2.0, tgt[1] - 3.0, 1.2), tgt, lens=45, size=cell, folder="_tmp")
            cells.append(load_png(p))
        rows.append(np.concatenate(cells, 1))
    rig.animation_data.action = None
    for o in bpy.data.objects:
        if o.name in hidden_before:
            o.hide_render = hidden_before[o.name]
    bpy.data.objects.remove(pv, do_unlink=True)
    sheet = np.concatenate(rows[::-1], 0)
    out = os.path.join(RENDERS, "validation", f"animation_contact_sheet_{body}.png")
    save_png_array(out, sheet)
    return out


if __name__ == "__main__" or True:
    print(contact_sheet("male"))
