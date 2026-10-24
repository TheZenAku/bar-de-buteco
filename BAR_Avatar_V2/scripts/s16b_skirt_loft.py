"""Step 16b - A-line skirt as a single procedural tube (female body).

Rings from the waistband to above the knee; each ring follows the body's own cross-section (binned by angle)
plus a gap, then flares (A-line) and never goes inside the legs. Weights: hip at the top, blended to both
thighs by height and side (no tearing between the legs). UV: u around, v down -> 512x256 texture.
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\s16_catalog_shells.py", encoding="utf-8").read().split("CATALOG_SHELLS = {")[0])

BINS = 48  # finer sectors: less bulge over the lumbar curve (tops layer over the waistband)


def section_radius(V, cy, z, dz, bins=BINS):
    band = V[np.abs(V[:, 2] - z) < dz]
    rel = band[:, [0, 1]] - np.array([0.0, cy])
    ang = np.arctan2(rel[:, 1], rel[:, 0])
    r = np.linalg.norm(rel, axis=1)
    b = ((ang + np.pi) / (2 * np.pi) * bins).astype(int) % bins
    out = np.zeros(bins)
    for k in range(bins):
        s = b == k
        out[k] = r[s].max() if s.any() else 0.0
    for _ in range(3):  # fill empty bins / smooth
        out = np.maximum(out, (np.roll(out, 1) + np.roll(out, -1)) * 0.5 * 0.97)
        out = (np.roll(out, 1) + 2 * out + np.roll(out, -1)) / 4
    return out


def build_skirt(body="female", piece="bottom_skirt", rings=9, gap=0.008, flare=0.42):
    ob, V, N, reg, joints = body_data(body)
    L = landmarks_for(joints)
    top_z, hem_z = L["waist"] + 0.01, L["knee_z"] + 0.07
    cy = float(np.median(V[(np.abs(V[:, 2] - L["hip_z"]) < 0.05) & (np.abs(V[:, 0]) < 0.2)][:, 1]))
    zs = np.linspace(top_z, hem_z, rings)
    hip_r = section_radius(V, cy, L["hip_z"] - 0.02, 0.04) + gap
    profiles = []
    for z in zs:
        body_r = section_radius(V, cy, z, 0.025) + gap
        t = np.clip((L["hip_z"] - z) / max(L["hip_z"] - hem_z, 1e-6), 0, 1)
        r = np.maximum(body_r, hip_r * (1 + flare * t) if z < L["hip_z"] else body_r)
        profiles.append(r)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    grid = []
    for i, (z, r) in enumerate(zip(zs, profiles)):
        row = []
        for k in range(BINS):
            a = -np.pi + (k + 0.5) / BINS * 2 * np.pi
            row.append(bm.verts.new((r[k] * math.cos(a), cy + r[k] * math.sin(a), z)))
        grid.append(row)
    for i in range(rings - 1):
        for k in range(BINS):
            a, b = grid[i][k], grid[i][(k + 1) % BINS]
            c, d = grid[i + 1][(k + 1) % BINS], grid[i + 1][k]
            f = bm.faces.new((a, d, c, b))
            f.smooth = True
            u0, u1 = k / BINS, (k + 1) / BINS
            v0, v1 = 1 - i / (rings - 1), 1 - (i + 1) / (rings - 1)
            for l, uv in zip(f.loops, ((u0, v0), (u0, v1), (u1, v1), (u1, v0))):
                l[uvl].uv = (0.01 + 0.98 * uv[0], 0.01 + 0.98 * uv[1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # normals must point away from the axis
    f0 = bm.faces[0]
    c = f0.calc_center_median()
    if f0.normal.dot(Vector((c.x, c.y - cy, 0))) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    bvh = BVHTree.FromPolygons([tuple(map(float, v)) for v in V], [tuple(p.vertices) for p in ob.data.polygons])
    dl = bm.verts.layers.deform.verify()
    add_hems(bm, uvl, dl, bvh, 0.009)
    full = f"{piece}__{body}"
    old = bpy.data.objects.get(full)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    me = bpy.data.meshes.new(full)
    bm.to_mesh(me)
    bm.free()
    sk = bpy.data.objects.new(full, me)
    ensure_collection(f"GARMENTS_{body.upper()}").objects.link(sk)
    for n in ("hip", "upperleg_l", "upperleg_r", "spine_01"):
        sk.vertex_groups.new(name=n)
    gi = {g.name: g.index for g in sk.vertex_groups}
    for v in me.vertices:
        z, x = v.co.z, v.co.x
        if z >= L["hip_z"]:
            w = {"hip": 1.0} if z < L["waist"] else {"hip": 0.7, "spine_01": 0.3}
        else:
            t = min(1.0, (L["hip_z"] - z) / max(L["hip_z"] - hem_z, 1e-6))
            # strong leg influence towards the hem, sharp left/right split: each half follows its own thigh
            side = 0.5 + 0.5 * math.tanh(x / 0.03)
            leg = 0.85 * t ** 0.8
            w = {"hip": 1 - leg, "upperleg_l": leg * side, "upperleg_r": leg * (1 - side)}
        s = sum(w.values())
        for n, x_ in w.items():
            if x_ / s > 0.01:
                sk.vertex_groups[gi[n]].add([v.index], x_ / s, "REPLACE")
    sk.parent = ob.parent
    m = sk.modifiers.new("Armature", "ARMATURE")
    m.object = ob.parent
    sk["bar_body"] = body
    sk["bar_hides"] = "pelvis,thigh_a_l,thigh_a_r"
    print(full, "verts", len(me.vertices), "tris", tri_count(me), skin_weights_summary(sk))
    return sk


SKIRT = build_skirt()
