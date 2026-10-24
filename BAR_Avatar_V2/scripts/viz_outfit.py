"""Viewport helper: show one outfit per body (covered regions hidden), solid object colours."""
import bpy

exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\viz_preview.py", encoding="utf-8").read())

COLORS = {"top": (0.25, 0.4, 0.75, 1), "bottom": (0.15, 0.2, 0.32, 1), "footwear": (0.6, 0.18, 0.14, 1),
          "hair": (0.22, 0.14, 0.09, 1), "facial": (0.22, 0.14, 0.09, 1), "acc": (0.1, 0.1, 0.1, 1)}


def show_outfits(outfits, spacing=0.55):
    """outfits: {body: [object names]}"""
    keep = set()
    for i, (body, names) in enumerate(outfits.items()):
        hides = []
        for n in names:
            ob = bpy.data.objects.get(n)
            if ob is None:
                continue
            hides += [h for h in ob.get("bar_hides", "").split(",") if h]
            ob.color = COLORS.get(n.split("_")[0], (0.5, 0.5, 0.5, 1))
            keep.add(n)
        pv = preview_body(body, hides)
        pv.color = (0.85, 0.65, 0.5, 1)
        keep |= {pv.name, f"BAR_Eyes__{body}"}
        bpy.data.objects[f"RIG_{body}"].location = ((i - (len(outfits) - 1) / 2) * 2 * spacing, 0, 0)
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.hide_set(o.name not in keep)
        if o.type in ("ARMATURE", "EMPTY"):
            o.hide_set(True)
    for win in bpy.context.window_manager.windows:
        for area in win.screen.areas:
            if area.type == "VIEW_3D":
                area.spaces[0].shading.type = "SOLID"
                area.spaces[0].shading.color_type = "OBJECT"
    return sorted(keep)
