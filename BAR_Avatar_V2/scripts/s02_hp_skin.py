"""Step 02 - high resolution skin mesh (Antonia topology without eyes/mouth interior) with a single UV atlas.

Creates object HP_SKIN_neutral in collection WORK_HP with:
  * integer point attribute 'orig_index' (Antonia vertex order, used by joints/weights/shapes)
  * UV map 'UVAtlas': head / body / arms / legs quadrants + a strip for nails
  * face attribute 'region' (0 head, 1 body, 2 arms, 3 legs, 4 nails)
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())

EYE_MATS = {0, 1, 7, 8}
REGION_OF_MAT = {2: 0, 3: 0, 11: 0, 10: 1, 9: 2, 12: 3, 5: 4, 6: 4}
# atlas rectangles (u0, v0, u1, v1) for each region; nails squeezed into a corner strip of the arms quadrant
ATLAS = {0: (0.0, 0.5, 0.5, 1.0), 1: (0.5, 0.5, 1.0, 1.0), 2: (0.0, 0.0, 0.5, 0.5), 3: (0.5, 0.0, 1.0, 0.5)}
NAILS_RECT = (0.004, 0.40, 0.090, 0.49)
NAILS_SRC = (0.08, 0.71, 0.91, 0.98)


def atlas_uv(uv, region):
    if region == 4:
        su0, sv0, su1, sv1 = NAILS_SRC
        u0, v0, u1, v1 = NAILS_RECT
        return (u0 + (uv[0] - su0) / (su1 - su0) * (u1 - u0), v0 + (uv[1] - sv0) / (sv1 - sv0) * (v1 - v0))
    u0, v0, u1, v1 = ATLAS[region]
    return (u0 + uv[0] * (u1 - u0), v0 + uv[1] * (v1 - v0))


def build_hp_skin(shape="neutral"):
    ant = bpy.data.objects["cm_antonia"]
    src = ant.data
    V = np.load(os.path.join(CACHE, f"{shape}.npy"))
    uvl = src.uv_layers["UVMap"].data
    keep = [p for p in src.polygons if p.material_index not in EYE_MATS | MOUTH_INTERIOR_MATS]
    used = sorted({v for p in keep for v in p.vertices})
    remap = {o: i for i, o in enumerate(used)}
    bm = bmesh.new()
    # custom layers first: adding a layer reallocates and invalidates existing element references
    uv_layer = bm.loops.layers.uv.new("UVAtlas")
    reg_layer = bm.faces.layers.int.new("region")
    oi_layer = bm.verts.layers.int.new("orig_index")
    verts = [bm.verts.new(V[o]) for o in used]
    bm.verts.ensure_lookup_table()
    for o, v in zip(used, verts):
        v[oi_layer] = o
    for p in keep:
        f = bm.faces.new([verts[remap[i]] for i in p.vertices])
        region = REGION_OF_MAT[p.material_index]
        f[reg_layer] = region
        for loop, li in zip(f.loops, p.loop_indices):
            loop[uv_layer].uv = atlas_uv(uvl[li].uv, region)
    # close the mouth slit left by removing the interior (lips stay as authored)
    boundary = [e for e in bm.edges if e.is_boundary]
    res = bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
    for f in res["faces"]:
        f[reg_layer] = 0
        for loop in f.loops:
            loop[uv_layer].uv = atlas_uv((0.15, 0.13), 0)  # inside the lip area of the head tile
    print("filled holes:", len(res["faces"]), "boundary edges left:", sum(e.is_boundary for e in bm.edges))
    name = f"HP_SKIN_{shape}"
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ensure_collection("WORK_HP").objects.link(ob)
    print(name, "verts", len(me.vertices), "tris", tri_count(me))
    return ob


HP = build_hp_skin("neutral")
