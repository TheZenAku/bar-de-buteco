"""Step 10 - footwear as parametric lofts around each foot (no toe gaps, flat sole).

Cross sections are measured from the body's own rest foot vertices, so the shoe fits each body variant.
Weights: interpolated from the nearest body surface point (foot/toe/lowerleg bones of the same rig).
UV: (u = heel->toe, v = around the section), texture 512x256 with RGB detail and A = tint mask.
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\garment_lib.py", encoding="utf-8").read())

FOOTWEAR = {
    # gap around the foot, collar height above ground (m), opening radius scale, sole thickness
    "footwear_sneakers": dict(gap=0.007, collar=0.10, sole=0.022, toe_extra=0.012, ring=16, slices=14,
                              opening_len=0.13, instep=0.072, heel_height=0.08, hides=["foot_l", "foot_r"], sock=True),
}


def foot_frame(joints, side):
    S = "L" if side > 0 else "R"
    heel = np.array(jp(joints, f"heel.02.{S}", "head"))
    toe_tip = np.array(jp(joints, f"toe.{S}", "tail"))
    ankle = np.array(jp(joints, f"foot.{S}", "head"))
    d = toe_tip - heel
    d[2] = 0
    d /= np.linalg.norm(d)
    lat = np.cross(d, [0, 0, 1])
    lat /= np.linalg.norm(lat)
    return heel, toe_tip, ankle, d, lat


def section_profile(V, side, heel, toe_tip, ankle, d, lat, slices, gap, collar, toe_extra):
    foot = V[(np.sign(V[:, 0]) == side) & (V[:, 2] < ankle[2] + 0.06)]
    rel = foot - heel
    along = rel @ d
    across = rel @ lat
    # real toe tips, not the toe bone: the shoe must cover the longest toe
    start = float(along.min()) - 0.006
    length = float(along.max()) + toe_extra - start
    ts = np.linspace(start, start + length, slices)
    prof = []
    for i, t in enumerate(ts):
        w = 0.012 if 0 < i < slices - 1 else 0.008
        sel = np.abs(along - t) < w
        if sel.sum() < 3:
            sel = np.abs(along - t) < 2 * w
        a = across[sel]
        z = foot[sel][:, 2]
        lo, hi = (a.min(), a.max()) if len(a) else (-0.02, 0.02)
        top = z.max() if len(z) else 0.04
        prof.append([t, lo - gap, hi + gap, min(top + gap, collar)])
    P = np.array(prof)
    # smooth the profile along the foot, round the toe and the heel
    for _ in range(2):
        P[1:-1, 1:] = (P[:-2, 1:] + 2 * P[1:-1, 1:] + P[2:, 1:]) / 4
    n = len(P)
    taper = np.ones(n)
    taper[-3:] = [0.97, 0.9, 0.7]   # round toe box, not a pointed toe
    taper[:2] = [0.7, 0.93]
    mid = (P[:, 1] + P[:, 2]) / 2
    half = (P[:, 2] - P[:, 1]) / 2 * taper
    P[:, 1], P[:, 2] = mid - half, mid + half
    P[-4:, 3] = np.maximum(P[-4:, 3], [0.058, 0.055, 0.05, 0.042])
    P[-1, 3] = min(P[-1, 3], 0.042)
    return P


def ring_points(t, lo, hi, top, ring, heel, d, lat, sole):
    pts = []
    cx = (lo + hi) / 2
    hw = (hi - lo) / 2
    cz = top / 2
    hz = top / 2
    for k in range(ring):
        ang = 2 * math.pi * k / ring - math.pi / 2  # k = 0 at the bottom centre
        c, s = math.cos(ang), math.sin(ang)
        x = cx + hw * math.copysign(abs(c) ** 0.55, c)
        z = cz + hz * math.copysign(abs(s) ** 0.7, s)
        z = max(z, 0.0)
        if z < sole:  # outsole lip
            x = cx + (x - cx) * 1.04
        pts.append(heel + d * t + lat * x + np.array([0, 0, z - heel[2]]))
    return pts


def build_shoe(body, piece, opts):
    ob, V, N, reg, joints = body_data(body)
    me = ob.data
    ring, slices = opts["ring"], opts["slices"]
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    all_verts = []
    for side in (1, -1):
        heel, toe_tip, ankle, d, lat = foot_frame(joints, side)
        prof = section_profile(V, side, heel, toe_tip, ankle, d, lat, slices, opts["gap"], opts["collar"], opts["toe_extra"])
        rings = []
        for t, lo, hi, top in prof:
            rings.append([bm.verts.new(tuple(p)) for p in ring_points(t, lo, hi, top, ring, heel, d, lat, opts["sole"])])
        back = bm.verts.new(tuple(heel + d * (prof[0, 0] - 0.006) + lat * (prof[0, 1] + prof[0, 2]) / 2 + np.array([0, 0, prof[0, 3] * 0.45 - heel[2]])))
        front = bm.verts.new(tuple(heel + d * (prof[-1, 0] + 0.008) + lat * (prof[-1, 1] + prof[-1, 2]) / 2 + np.array([0, 0, 0.016 - heel[2]])))
        n = len(rings)
        faces = []
        for i in range(n - 1):
            for k in range(ring):
                a, b = rings[i][k], rings[i][(k + 1) % ring]
                c, e = rings[i + 1][(k + 1) % ring], rings[i + 1][k]
                f = bm.faces.new((a, b, c, e) if side > 0 else (a, e, c, b))
                u0, u1 = i / (n - 1), (i + 1) / (n - 1)
                v0, v1 = k / ring, (k + 1) / ring
                uvs = ((u0, v0), (u0, v1), (u1, v1), (u1, v0)) if side > 0 else ((u0, v0), (u1, v0), (u1, v1), (u0, v1))
                for l, uv in zip(f.loops, uvs):
                    l[uvl].uv = (uv[0] * 0.98 + 0.01, uv[1] * 0.98 + 0.01)
        for k in range(ring):
            a, b = rings[0][k], rings[0][(k + 1) % ring]
            f = bm.faces.new((b, a, back) if side > 0 else (a, b, back))
            for l in f.loops:
                l[uvl].uv = (0.01, 0.01 + 0.98 * (k + 0.5) / ring)
            a, b = rings[-1][k], rings[-1][(k + 1) % ring]
            f = bm.faces.new((a, b, front) if side > 0 else (b, a, front))
            for l in f.loops:
                l[uvl].uv = (0.99, 0.01 + 0.98 * (k + 0.5) / ring)
        all_verts += [v for r in rings for v in r] + [back, front]
    # low-top opening: slanted plane from the heel collar down to the instep, limited to the rear of the shoe
    for side in (1, -1):
        heel, toe_tip, ankle, d, lat = foot_frame(joints, side)
        a = heel + d * -0.01 + np.array([0, 0, opts["heel_height"] - heel[2]])
        b = heel + d * opts["opening_len"] + np.array([0, 0, opts["instep"] - heel[2]])
        ab = b - a
        n = np.cross(lat, ab)
        n = n / np.linalg.norm(n) * (1 if np.cross(lat, ab)[2] > 0 else -1)
        if n[2] < 0:
            n = -n
        faces = [f for f in bm.faces if (f.calc_center_median().x > 0) == (side > 0)
                 and (np.array(f.calc_center_median()) - heel) @ d < opts["opening_len"] + 0.03]
        geom = faces + list({e for f in faces for e in f.edges}) + list({v for f in faces for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector(a), plane_no=Vector(n), clear_outer=True, dist=1e-5)
    bmesh.ops.delete(bm, geom=[e for e in bm.edges if not e.link_faces], context="EDGES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    body_bvh = BVHTree.FromPolygons([tuple(map(float, v)) for v in V], [tuple(p.vertices) for p in me.polygons])
    dl0 = bm.verts.layers.deform.verify()
    add_hems(bm, uvl, dl0, body_bvh, 0.006)
    for f in bm.faces:
        f.smooth = True
    # weights from the nearest body surface (foot / toe / lowerleg only)
    dl = bm.verts.layers.deform.verify()
    names = [g.name for g in ob.vertex_groups]
    allowed = {i for i, nm in enumerate(names) if nm.split("_")[0] in ("foot", "toe", "lowerleg")}
    foot_faces = [p for p in me.polygons if REGIONS[reg[p.index]].startswith(("foot", "shin_b"))]
    tri = []
    for p in foot_faces:
        vs = list(p.vertices)
        for k in range(1, len(vs) - 1):
            tri.append((vs[0], vs[k], vs[k + 1]))
    bvh = BVHTree.FromPolygons([tuple(map(float, v)) for v in V], tri)
    Wb = np.zeros((len(V), len(names)))
    for v in me.vertices:
        for g in v.groups:
            Wb[v.index, g.group] = g.weight
    for v in bm.verts:
        loc, nrm, ti, _ = bvh.find_nearest(v.co)
        a, b, c = (Vector(V[i]) for i in tri[ti])
        from mathutils.geometry import barycentric_transform
        w = np.zeros(len(names))
        bc = barycentric_weights(loc, a, b, c)
        for k, vi in enumerate(tri[ti]):
            w += bc[k] * Wb[vi]
        for j in range(len(names)):
            if j not in allowed:
                w[j] = 0
        order = np.argsort(-w)[:4]
        s = w[order].sum()
        for j in order:
            if w[j] / s > 0.01:
                v[dl][int(j)] = float(w[j] / s)
    full = f"{piece}__{body}"
    old = bpy.data.objects.get(full)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    sme = bpy.data.meshes.new(full)
    sob = bpy.data.objects.new(full, sme)
    for nm in names:
        sob.vertex_groups.new(name=nm)
    bm.to_mesh(sme)
    bm.free()
    ensure_collection(f"GARMENTS_{body.upper()}").objects.link(sob)
    for g in list(sob.vertex_groups):
        if not any(g.index == e.group for v in sme.vertices for e in v.groups):
            sob.vertex_groups.remove(g)
    sob.parent = ob.parent
    m = sob.modifiers.new("Armature", "ARMATURE")
    m.object = ob.parent
    sob["bar_body"] = body
    sob["bar_hides"] = ",".join(opts["hides"])
    if opts.get("sock"):
        add_sock(sob, body)
    print(full, "verts", len(sme.vertices), "tris", tri_count(sme), skin_weights_summary(sob))
    return sob


SOCK_UV = (0.5, 0.012)  # inside the sole band of the loft textures (A = 0): white sock on sneakers, dark on shoes


def add_sock(sob, body, min_z=0.04):
    """Low shoes hide the whole foot region, which climbs above their opening: without this the hidden ankle
    left a hole between shoe and leg. The uncovered foot faces become a thin sock in the fixed colour of the
    sole band; below min_z the faces are toes/sole inside the shoe (a ray can slip between toes and miss)."""
    n = add_cover(sob, body, ["foot_l", "foot_r"], min_z=min_z, uv=SOCK_UV, allowed_prefix=("foot", "toe", "lowerleg"))
    sob["bar_sock_faces"] = n
    return n


def barycentric_weights(p, a, b, c):
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
    den = d00 * d11 - d01 * d01
    if abs(den) < 1e-18:
        return (1.0, 0.0, 0.0)
    v = (d11 * d20 - d01 * d21) / den
    w = (d00 * d21 - d01 * d20) / den
    return (1 - v - w, v, w)


for body in ("male", "female"):
    for piece, opts in FOOTWEAR.items():
        build_shoe(body, piece, opts)
