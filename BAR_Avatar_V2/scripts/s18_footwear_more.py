"""Step 18 - more footwear (lofts) : footwear_shoes (casual low shoe), footwear_boots (ankle boots),
footwear_flipflops (sole + Y strap, the foot stays visible)."""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\s10_footwear.py", encoding="utf-8").read().split("for body in (\"male\", \"female\"):")[0])

MORE = {
    "footwear_shoes": dict(gap=0.006, collar=0.075, sole=0.016, toe_extra=0.016, ring=16, slices=14,
                           opening_len=0.12, instep=0.058, heel_height=0.062, hides=["foot_l", "foot_r"], sock=True),
    # ankle boot: the opening plane must cross the leg below the loft top, otherwise the shin pokes through
    "footwear_boots": dict(gap=0.009, collar=0.20, sole=0.024, toe_extra=0.014, ring=16, slices=16,
                           opening_len=0.06, instep=0.125, heel_height=0.135, hides=["foot_l", "foot_r"]),
}


def build_boot_shaft_profile(opts):
    """Boots: the loft top is allowed to climb around the ankle (cap = collar); the plane cut stays high."""
    return opts


def build_flipflops(body, piece="footwear_flipflops"):
    ob, V, N, reg, joints = body_data(body)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    dl = bm.verts.layers.deform.verify()
    names = [g.name for g in ob.vertex_groups]
    gi = {n: i for i, n in enumerate(names)}
    for side, S in ((1, "L"), (-1, "R")):
        heel, toe_tip, ankle, d, lat = foot_frame(joints, side)
        foot = V[(np.sign(V[:, 0]) == side) & (V[:, 2] < ankle[2] + 0.02)]
        rel = foot - heel
        along, across = rel @ d, rel @ lat
        t0, t1 = along.min() - 0.008, along.max() + 0.010
        n = 12
        outline = []
        for i in range(n):
            t = t0 + (t1 - t0) * i / (n - 1)
            s = np.abs(along - t) < 0.015
            lo, hi = (across[s].min(), across[s].max()) if s.any() else (-0.03, 0.03)
            outline.append((t, lo - 0.006, hi + 0.006))
        # sole slab: top at 9 mm, bottom at 0
        top, bot = [], []
        for t, lo, hi in outline:
            for a in (lo, hi):
                p = heel + d * t + lat * a
                top.append(bm.verts.new((p[0], p[1], 0.009)))
                bot.append(bm.verts.new((p[0], p[1], 0.0)))
        for i in range(n - 1):
            a, b, c, e = 2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2
            for ring, flip in ((top, False), (bot, True)):
                q = (ring[a], ring[e], ring[c], ring[b]) if not flip else (ring[a], ring[b], ring[c], ring[e])
                if side < 0:
                    q = q[::-1]
                f = bm.faces.new(q)
                for l in f.loops:
                    l[uvl].uv = (0.05 + 0.4 * (i / (n - 1)), 0.1 if flip else 0.3)
            for j0, j1 in ((a, e), (c, b)):
                q = (top[j0], bot[j0], bot[j1], top[j1])
                if (j0 == a) != (side < 0):
                    q = q[::-1]
                f = bm.faces.new(q)
                for l in f.loops:
                    l[uvl].uv = (0.05, 0.2)
        for j0, j1 in ((0, 1), (2 * n - 1, 2 * n - 2)):
            q = (top[j0], top[j1], bot[j1], bot[j0])
            if (j0 == 0) == (side < 0):
                q = q[::-1]
            f = bm.faces.new(q)
            for l in f.loops:
                l[uvl].uv = (0.05, 0.2)
        # Y strap: from between the first two toes over the instep to both sides
        toe_gap = heel + d * (t1 - 0.035) + lat * (outline[-3][1] + outline[-3][2]) * 0.5 * 0.2
        anchor_in = heel + d * (t0 + (t1 - t0) * 0.42) + lat * (outline[5][1] - 0.002)
        anchor_out = heel + d * (t0 + (t1 - t0) * 0.42) + lat * (outline[5][2] + 0.002)
        top_pt = heel + d * (t0 + (t1 - t0) * 0.5)
        bvh = BVHTree.FromPolygons([tuple(map(float, v)) for v in V], [tuple(p.vertices) for p in ob.data.polygons])
        for start, end in ((toe_gap, anchor_in), (toe_gap, anchor_out)):
            seg = []
            for k in range(7):
                t = k / 6
                p = start * (1 - t) + end * t
                p = Vector((p[0], p[1], 0.0))
                hz = 0.009 + (top_pt[2] * 0 + 0.045) * math.sin(math.pi * t) * 0.9
                p.z = hz
                loc, nrm, _, _ = bvh.find_nearest(p)
                if loc is not None and k not in (0, 6):
                    p = loc + nrm * 0.004
                seg.append(p)
            for k in range(6):
                a, b = seg[k], seg[k + 1]
                w = 0.006
                side_v = (b - a).cross(Vector((0, 0, 1))).normalized() * w
                vs = [bm.verts.new(a - side_v), bm.verts.new(a + side_v), bm.verts.new(b + side_v), bm.verts.new(b - side_v)]
                f = bm.faces.new(vs)  # thin strap: single face, the material is double sided
                for l in f.loops:
                    l[uvl].uv = (0.75, 0.5)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    for f in bm.faces:
        f.smooth = False
    # rigid per foot: sole and strap follow the foot bone (toe bone for the front third)
    for v in bm.verts:
        side = "l" if v.co.x > 0 else "r"
        heel, toe_tip, ankle, d, lat = foot_frame(joints, 1 if side == "l" else -1)
        t = (np.array(v.co) - heel) @ d
        toe_start = (np.array(jp(joints, f"toe.{side.upper()}", "head")) - heel) @ d
        if t > toe_start + 0.01:
            v[dl][gi[f"toe_{side}"]] = 1.0
        else:
            v[dl][gi[f"foot_{side}"]] = 1.0
    full = f"{piece}__{body}"
    old = bpy.data.objects.get(full)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    me = bpy.data.meshes.new(full)
    fo = bpy.data.objects.new(full, me)
    for nm in names:
        fo.vertex_groups.new(name=nm)
    bm.to_mesh(me)
    bm.free()
    ensure_collection(f"GARMENTS_{body.upper()}").objects.link(fo)
    for g in list(fo.vertex_groups):
        if not any(g.index == e.group for v in me.vertices for e in v.groups):
            fo.vertex_groups.remove(g)
    fo.parent = ob.parent
    m = fo.modifiers.new("Armature", "ARMATURE")
    m.object = ob.parent
    fo["bar_body"] = body
    fo["bar_hides"] = ""
    print(full, "verts", len(me.vertices), "tris", tri_count(me), skin_weights_summary(fo))
    return fo


for body in ("male", "female"):
    for piece, opts in MORE.items():
        build_shoe(body, piece, opts)
    build_flipflops(body)
