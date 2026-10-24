"""Step 03 - low poly topology from the high resolution skin (region-wise collapse decimation).

Input : HP_SKIN_neutral (s02)
Output: LP_TOPO (decimated copy, same UV atlas / region attribute), saved to cache as lp_topo.npz
Budgets are per region so the face keeps its features and the hands stay cheap.
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())

# (name, selector over vertex positions, decimate ratio)
REGION_RATIOS = [
    ("face", lambda c: (c[:, 2] > 1.50) & (c[:, 1] < 0.005) & (np.abs(c[:, 0]) < 0.08), 0.20),
    ("skull", lambda c: (c[:, 2] > 1.45), 0.10),
    ("hands", lambda c: np.abs(c[:, 0]) > 0.60, 0.07),
    ("feet", lambda c: c[:, 2] < 0.10, 0.07),
    ("body", lambda c: np.ones(len(c), bool), 0.115),
]


def decimate_regions(src, name="LP_TOPO"):
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    ob = src.copy()
    ob.data = src.data.copy()
    ob.name = name
    ob.data.name = name
    for m in list(ob.modifiers):
        ob.modifiers.remove(m)
    for g in list(ob.vertex_groups):
        ob.vertex_groups.remove(g)
    ensure_collection("WORK_LP").objects.link(ob)
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    # mesh.decimate counts quads and triangles as one face each when it rescales the ratio for a
    # partial selection, so a mixed mesh distorts later passes: work on an all-triangle mesh.
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data)
    bm.free()
    for region, selector, ratio in REGION_RATIOS:
        me = ob.data
        co = mesh_arrays(me)
        inside = selector(co)
        hidden = np.zeros(len(me.polygons), bool)
        me.polygons.foreach_get("hide", hidden)
        # faces fully inside the region; earlier regions are hidden and therefore left untouched
        sel_f = np.array([bool(inside[list(p.vertices)].all()) for p in me.polygons]) & ~hidden
        sel_v = np.zeros(len(co), bool)
        for p, s in zip(me.polygons, sel_f):
            if s:
                sel_v[list(p.vertices)] = True
        me.polygons.foreach_set("select", sel_f)
        me.vertices.foreach_set("select", sel_v)
        me.edges.foreach_set("select", np.array([sel_v[e.vertices[0]] and sel_v[e.vertices[1]] for e in me.edges]))
        me.update()
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_mode(type="FACE")
        bpy.ops.mesh.decimate(ratio=ratio, use_symmetry=True, symmetry_axis="X")
        bpy.ops.object.mode_set(mode="OBJECT")
        # hide the finished region (by position, the operator does not keep a selection)
        me = ob.data
        co = mesh_arrays(me)
        inside = selector(co)
        hf = np.zeros(len(me.polygons), bool)
        me.polygons.foreach_get("hide", hf)
        hv = np.zeros(len(co), bool)
        me.vertices.foreach_get("hide", hv)
        for i, p in enumerate(me.polygons):
            if inside[list(p.vertices)].all():
                hf[i] = True
                hv[list(p.vertices)] = True
        me.polygons.foreach_set("hide", hf)
        me.vertices.foreach_set("hide", hv)
        me.edges.foreach_set("hide", np.array([hv[e.vertices[0]] and hv[e.vertices[1]] for e in me.edges]))
        me.update()
        print(f"{region:6s} ratio {ratio}: total tris {tri_count(ob.data)} verts {len(ob.data.vertices)}")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.reveal(select=True)
    bpy.ops.mesh.select_all(action="SELECT")
    # rebuild quads where the pair is nearly planar: cleaner shading and deformation
    bpy.ops.mesh.tris_convert_to_quads(face_threshold=math.radians(30), shape_threshold=math.radians(35), uvs=True)
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


def fix_degenerate_uvs(ob, max_span=0.15):
    """Collapse decimation can leave a few tiny faces (nostrils) with UVs spanning the whole atlas.
    Give each loop of such a face the UV that its vertex has in a healthy neighbouring face."""
    me = ob.data
    uv = np.zeros(len(me.loops) * 2)
    me.uv_layers["UVAtlas"].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    bad = set()
    for p in me.polygons:
        us = uv[list(p.loop_indices)]
        if (us.max(0) - us.min(0)).max() > max_span:
            bad.add(p.index)
    good_uv = {}
    for p in me.polygons:
        if p.index in bad:
            continue
        for v, li in zip(p.vertices, p.loop_indices):
            good_uv.setdefault(v, uv[li])
    for p in me.polygons:
        if p.index not in bad:
            continue
        known = [good_uv[v] for v in p.vertices if v in good_uv]
        fallback = np.mean(known, 0) if known else uv[p.loop_start]
        for v, li in zip(p.vertices, p.loop_indices):
            uv[li] = good_uv.get(v, fallback)
    me.uv_layers["UVAtlas"].data.foreach_set("uv", uv.ravel())
    print("fixed degenerate uv faces:", len(bad))


def project_zero_area_uvs(ob, size=0.05):
    """Faces whose loops share one UV point (the mouth closure filled in s02) form a zero-area island that
    pack_islands would blow up across the atlas. Give them a small planar (x/z) projection instead."""
    me = ob.data
    uv = np.zeros(len(me.loops) * 2)
    me.uv_layers["UVAtlas"].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    co = mesh_arrays(me)
    flat = [p for p in me.polygons if np.ptp(uv[list(p.loop_indices)], axis=0).max() < 1e-6]
    if not flat:
        return 0
    vs = sorted({v for p in flat for v in p.vertices})
    # best-fit plane (PCA): an axis-aligned projection collapses vertices that differ only in depth
    P = co[vs] - co[vs].mean(0)
    _, _, vt = np.linalg.svd(P, full_matrices=False)
    q = P @ vt[:2].T
    lo, hi = q.min(0), q.max(0)
    k = size / max((hi - lo).max(), 1e-6)
    pos = {v: (0.01 + (q[i, 0] - lo[0]) * k, 0.01 + (q[i, 1] - lo[1]) * k) for i, v in enumerate(vs)}
    for p in flat:
        for v, li in zip(p.vertices, p.loop_indices):
            uv[li] = pos[v]
    me.uv_layers["UVAtlas"].data.foreach_set("uv", uv.ravel())
    print("zero-area uv faces projected:", len(flat))
    return len(flat)


def unfold(ob, max_angle=110.0, iterations=6):
    """Collapse decimation leaves a few folded triangles (elbow tip, ears, lip corners) that render as dark
    slivers. Relax only the vertices of faces whose normal opposes their neighbours."""
    for it in range(iterations):
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.normal_update()
        bad_v = set()
        for f in bm.faces:
            nb = [g for e in f.edges for g in e.link_faces if g is not f]
            if nb:
                avg = sum((g.normal for g in nb), Vector())
                if avg.length > 1e-9 and math.degrees(f.normal.angle(avg.normalized(), 0)) > max_angle:
                    bad_v.update(f.verts)
        if not bad_v:
            bm.free()
            break
        new = {v: sum((e.other_vert(v).co for e in v.link_edges), Vector()) / len(v.link_edges) for v in bad_v}
        for v, p in new.items():
            v.co = v.co.lerp(p, 0.5)
        bm.to_mesh(ob.data)
        bm.free()
        print(f"unfold pass {it}: relaxed {len(bad_v)} vertices")


LP = decimate_regions(bpy.data.objects["HP_SKIN_neutral"])
unfold(LP)
project_zero_area_uvs(LP)
fix_degenerate_uvs(LP)
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\s07a_repack_uv.py", encoding="utf-8").read().split("male = bpy.data")[0])
print("LP uv overlap/usage before repack", overlap_ratio(LP))
repack(LP)
fix_degenerate_uvs(LP, max_span=0.12)  # collinear micro-islands can still be stretched by the packer
print("LP uv overlap/usage after repack", overlap_ratio(LP))
LP.hide_set(True)
