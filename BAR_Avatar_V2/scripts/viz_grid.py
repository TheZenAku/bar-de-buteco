"""Render one close-up per item (rest pose) and compose a labelled grid image (validation/catalogue sheets)."""
import bpy
import os
import numpy as np

exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\viz_lineup.py", encoding="utf-8").read())
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\viz_render.py", encoding="utf-8").read())


def load_png(path):
    im = bpy.data.images.load(path, check_existing=False)
    a = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)
    bpy.data.images.remove(im)
    return a


def save_png_array(path, a):
    h, w = a.shape[:2]
    im = bpy.data.images.new("_grid", w, h, alpha=True)
    im.pixels.foreach_set(a.astype(np.float32).ravel())
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()
    bpy.data.images.remove(im)


def grid_sheet(name, body, items, views, target_z=1.6, dist=0.75, lens=50, cell=(380, 380), color_of=None, extra=()):
    """items: object names (or '' for bare); views: list of (label, direction vector)."""
    rows = []
    for it in items:
        lineup(body, [it] if it else [""], spacing=0, color_of=color_of, extra=extra)
        cells = []
        for vname, d in views:
            d = np.array(d, float)
            d /= np.linalg.norm(d)
            pos = tuple(np.array([0, 0, target_z]) + d * dist)
            p = render_shot(f"_cell", pos, (0, 0, target_z), lens=lens, size=cell, folder="_tmp")
            cells.append(load_png(p))
        rows.append(np.concatenate(cells, 1))
    clear_lineup()
    sheet = np.concatenate(rows[::-1], 0)  # image rows are bottom-up
    out = os.path.join(RENDERS, "catalog", f"{name}.png")
    save_png_array(out, sheet)
    return out
