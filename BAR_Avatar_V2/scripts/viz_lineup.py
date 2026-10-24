"""Viewport/render helper: static rest-pose lineup of pieces (temporary objects sharing mesh data, never exported)."""
import bpy


def clear_lineup():
    for o in list(bpy.data.objects):
        if o.name.startswith("LINEUP_"):
            bpy.data.objects.remove(o, do_unlink=True)
    for o in bpy.data.objects:
        if "bar_lineup_hidden" in o.keys():
            o.hide_render = bool(o["bar_lineup_hidden"])
            del o["bar_lineup_hidden"]


def lineup(body, names, spacing=0.32, extra=(), color_of=None):
    clear_lineup()
    col = bpy.data.collections.get("LINEUP") or bpy.data.collections.new("LINEUP")
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    base = [bpy.data.objects[f"BAR_Body_{body.capitalize()}"], bpy.data.objects[f"BAR_Eyes__{body}"]] + \
           [bpy.data.objects[e] for e in extra]
    made = []
    for i, n in enumerate(names):
        pieces = [bpy.data.objects[x] for x in (n if isinstance(n, (list, tuple)) else [n]) if x]
        for src in base + pieces:
            o = bpy.data.objects.new(f"LINEUP_{i}_{src.name}", src.data)
            o.location = (i * spacing, 0, 0)
            o.color = (color_of(src.name) if color_of else (0.8, 0.6, 0.5, 1))
            col.objects.link(o)
            made.append(o.name)
    for o in bpy.data.objects:
        if not o.name.startswith("LINEUP_") and o.type != "CAMERA":
            o["bar_lineup_hidden"] = o.hide_render
            o.hide_render = True
    for o in bpy.context.view_layer.objects:
        if not o.name.startswith("LINEUP_"):
            o.hide_set(True)
    for win in bpy.context.window_manager.windows:
        for area in win.screen.areas:
            if area.type == "VIEW_3D":
                area.spaces[0].shading.type = "SOLID"
                area.spaces[0].shading.color_type = "OBJECT"
    return made
