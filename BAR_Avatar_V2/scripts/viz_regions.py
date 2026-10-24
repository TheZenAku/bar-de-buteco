"""Viewport helper: colour body faces by region groups (validation only, not exported)."""
import bpy, json, os, colorsys

def show_regions(ob, groups, default=(0.6, 0.6, 0.6)):
    me = ob.data
    regions = json.load(open(r"C:\Users\rafael\BAR_Avatar_V2\source\cache\body_regions.json"))["regions"]
    color_of = {}
    for (names, rgb) in groups:
        for n in names:
            color_of[regions.index(n)] = rgb
    ca = me.color_attributes.get("_region_vis") or me.color_attributes.new("_region_vis", 'BYTE_COLOR', 'CORNER')
    cols = []
    for p in me.polygons:
        r = me.attributes["body_region"].data[p.index].value
        rgb = color_of.get(r, default)
        cols += [rgb[0], rgb[1], rgb[2], 1.0] * p.loop_total
    ca.data.foreach_set("color", cols)
    me.color_attributes.active_color = ca
    for win in bpy.context.window_manager.windows:
        for area in win.screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces[0].shading.color_type = 'VERTEX'

def all_regions_palette():
    regions = json.load(open(r"C:\Users\rafael\BAR_Avatar_V2\source\cache\body_regions.json"))["regions"]
    return [([n], colorsys.hsv_to_rgb(i / len(regions), 0.75, 0.95)) for i, n in enumerate(regions)]
