"""Step 07a - repack the body UV atlas without overlaps (keeps Antonia's seams/island shapes).

Antonia's tiles were authored per material; squeezed into one atlas some islands overlapped, which made the
baked AO bleed between body parts. Islands are re-averaged (uniform texel density), the head islands get
1.6x density, then packed. The result is copied to every body (shared topology, same loop order).
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())


def repack(ob, head_scale=1.6, margin=0.004):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.hide_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    me = ob.data
    me.uv_layers.active = me.uv_layers["UVAtlas"]
    reg = int_array(me.attributes["region"].data, "value")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.context.scene.tool_settings.use_uv_select_sync = True
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode="OBJECT")
    # enlarge head islands (region 0 = head in the source atlas) around their own centre
    uv = np.zeros(len(me.loops) * 2)
    me.uv_layers["UVAtlas"].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    head_loops = np.concatenate([np.arange(p.loop_start, p.loop_start + p.loop_total) for p in me.polygons if reg[p.index] == 0])
    c = uv[head_loops].mean(0)
    uv[head_loops] = c + (uv[head_loops] - c) * head_scale
    me.uv_layers["UVAtlas"].data.foreach_set("uv", uv.ravel())
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.scene.tool_settings.use_uv_select_sync = False


def copy_uv(src, dst, layer="UVAtlas"):
    a = np.zeros(len(src.data.loops) * 2)
    src.data.uv_layers[layer].data.foreach_get("uv", a)
    assert len(dst.data.loops) == len(src.data.loops)
    dst.data.uv_layers[layer].data.foreach_set("uv", a)


def overlap_ratio(ob, S=512):
    me = ob.data
    me.calc_loop_triangles()
    uv = np.zeros(len(me.loops) * 2)
    me.uv_layers["UVAtlas"].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2) * S
    cover = np.zeros((S, S), np.int32)
    for lt in me.loop_triangles:
        t = uv[list(lt.loops)]
        x0, y0 = np.maximum(np.floor(t.min(0)).astype(int), 0)
        x1, y1 = np.minimum(np.ceil(t.max(0)).astype(int), S - 1)
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        P = np.stack([xs.ravel(), ys.ravel()], 1)
        a, b, c = t
        v0, v1 = b - a, c - a
        den = v0[0] * v1[1] - v1[0] * v0[1]
        if abs(den) < 1e-12:
            continue
        d = P - a
        w1 = (d[:, 0] * v1[1] - v1[0] * d[:, 1]) / den
        w2 = (v0[0] * d[:, 1] - d[:, 0] * v0[1]) / den
        inside = (w1 >= 0) & (w2 >= 0) & (w1 + w2 <= 1)
        px = (P[inside] - 0.5).astype(int)
        cover[px[:, 1], px[:, 0]] += 1
    used = (cover > 0).sum()
    return float((cover > 1).sum() / max(used, 1)), float(used / S / S)


male = bpy.data.objects["BAR_Body_Male"]
print("before: overlap, usage", overlap_ratio(male))
repack(male)
for name in ("BAR_Body_Female", "LP_TOPO"):
    copy_uv(male, bpy.data.objects[name])
print("after: overlap, usage", overlap_ratio(male))
