"""Garment builder: deformable pieces generated as offset shells of the body topology.

Every garment vertex comes from a body vertex, so it inherits that vertex's canonical skin weights exactly
(same bones, same bind matrices). Shells are smoothed (drape), pushed out of the body (minimum gap) and get
folded hems so their edges read as fabric thickness.
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\s04_rig.py", encoding="utf-8").read().split("RIGS = {}")[0])

REGIONS = json.load(open(os.path.join(CACHE, "body_regions.json"), encoding="utf-8"))["regions"]


def body_data(body):
    ob = bpy.data.objects[f"BAR_Body_{body.capitalize()}"]
    me = ob.data
    V = mesh_arrays(me)
    N = np.zeros(len(V) * 3)
    me.vertices.foreach_get("normal", N)
    N = N.reshape(-1, 3)
    reg = int_array(me.attributes["body_region"].data, "value")
    if "waist" in REGIONS:  # 'waist' is a masking refinement of the pelvis: garments are built as before
        reg = np.where(reg == REGIONS.index("waist"), REGIONS.index("pelvis"), reg)
    shape = np.load(os.path.join(CACHE, f"{body}.npy"))
    joints = compute_joints(shape)
    return ob, V, N, reg, joints


def taubin(P, faces, mask, iterations=10, lam=0.5, mu=-0.53):
    E = set()
    for f in faces:
        for a, b in zip(f, f[1:] + f[:1]):
            E.add((min(a, b), max(a, b)))
    E = np.array(sorted(E))
    for _ in range(iterations):
        P = laplacian_smooth(P, E, mask, 1, lam)
        P = laplacian_smooth(P, E, mask, 1, mu)
    return P


def push_out(P, body_bvh, min_gap):
    """Garment vertices closer than min_gap to the body surface (or inside it) move out along the normal.
    min_gap: scalar or per-vertex array (layering: tops stay outside the bottoms' waistband)."""
    out = P.copy()
    gaps = np.broadcast_to(np.asarray(min_gap, float), (len(P),))
    for i, p in enumerate(P):
        loc, nrm, _, dist = body_bvh.find_nearest(Vector(p))
        if loc is None:
            continue
        d = (Vector(p) - loc).dot(nrm)
        if d < gaps[i]:
            out[i] = np.array(loc + nrm * gaps[i])
    return out


def add_cover(gob, body, regions, min_z=-1e9, max_z=1e9, uv=None, gap=0.0035, reach=0.04, allowed_prefix=None):
    """Close the holes a piece's hidden regions would leave: body faces of `regions` (between min_z and max_z)
    that the piece does not cover along their normal become a thin shell joined to the piece, grown one ring
    so it tucks under the piece edge, skinned with the body weights. uv=None keeps the body atlas UVs (atlas
    textured shells are then painted by their 3D painter like the rest); a tuple maps every loop to that UV."""
    ob, V, N, reg, joints = body_data(body)
    me = ob.data
    gm = gob.data
    bvh = BVHTree.FromPolygons([tuple(v.co) for v in gm.vertices], [tuple(p.vertices) for p in gm.polygons])
    rid = {REGIONS.index(r) for r in regions}
    cand = [p for p in me.polygons if reg[p.index] in rid and min_z < V[list(p.vertices)].mean(0)[2] < max_z]
    def hidden(p):  # centre and every corner must be under the piece: a face can stick out by one corner
        if bvh.ray_cast(Vector(V[list(p.vertices)].mean(0)) + p.normal * 0.001, p.normal, reach)[0] is None:
            return False
        return all(bvh.ray_cast(Vector(V[v] + N[v] * 0.001), Vector(N[v]), reach)[0] is not None for v in p.vertices)

    open_ = {p.index for p in cand if not hidden(p)}
    ring = {v for i in open_ for v in me.polygons[i].vertices}
    sel = [p for p in cand if p.index in open_ or any(v in ring for v in p.vertices)]
    if not sel:
        return 0
    names = [g.name for g in ob.vertex_groups]
    allowed = {i for i, nm in enumerate(names) if allowed_prefix is None or nm.split("_")[0] in allowed_prefix}
    uv_body = me.uv_layers["UVAtlas"].data
    bm = bmesh.new()
    bm.from_mesh(gm)
    uvl = bm.loops.layers.uv.active or bm.loops.layers.uv.verify()
    dl = bm.verts.layers.deform.verify()

    def group(nm):
        return (gob.vertex_groups.get(nm) or gob.vertex_groups.new(name=nm)).index

    new = {}
    for vi in sorted({v for p in sel for v in p.vertices}):
        bv = bm.verts.new(tuple(V[vi] + N[vi] * gap))
        w = sorted(((g.group, g.weight) for g in me.vertices[vi].groups if g.group in allowed), key=lambda kv: -kv[1])[:4]
        if not w:  # no allowed bone on this vertex: its own strongest one
            w = sorted(((g.group, g.weight) for g in me.vertices[vi].groups), key=lambda kv: -kv[1])[:1]
        s = sum(x for _, x in w) or 1.0
        for gi, x in w:
            bv[dl][group(names[gi])] = x / s
        new[vi] = bv
    for p in sel:
        f = bm.faces.new([new[v] for v in p.vertices])
        f.smooth = True
        for l, li in zip(f.loops, p.loop_indices):
            l[uvl].uv = uv if uv is not None else tuple(uv_body[li].uv)
    bm.to_mesh(gm)
    bm.free()
    gob["bar_cover_faces"] = int(gob.get("bar_cover_faces", 0)) + len(sel)
    return len(sel)


def hem_follows_pelvis(ob, bones=("upperleg_l", "upperleg_r"), to="hip"):
    """Tops: the loose hem hangs from the pelvis; thigh influence copied from the skin under it pulled the back
    hem around the buttocks (bodysuit look) and swung the sides with the legs."""
    if not any(ob.vertex_groups.get(b) for b in bones):
        return 0
    tgt = ob.vertex_groups.get(to) or ob.vertex_groups.new(name=to)
    src = {ob.vertex_groups[b].index for b in bones if ob.vertex_groups.get(b)}
    moved = 0
    for v in ob.data.vertices:
        extra = sum(g.weight for g in v.groups if g.group in src)
        if extra <= 0:
            continue
        base = next((g.weight for g in v.groups if g.group == tgt.index), 0.0)
        for i in src:
            ob.vertex_groups[i].remove([v.index])
        tgt.add([v.index], base + extra, "REPLACE")
        moved += 1
    for b in bones:
        g = ob.vertex_groups.get(b)
        if g is not None:
            ob.vertex_groups.remove(g)
    return moved


PUSH_FACES_MAX_DEPTH = 0.03  # a sample deeper than this is matched to another body part (crotch, inner hip)
PUSH_FACES_MAX_STEP = 0.02
PUSH_FACES_EVENTS = {"deep_skipped": 0, "capped": 0}


def push_out_faces(P, F, body_bvh, min_gap, iterations=4, src_normals=None):
    """Vertices can clear the skin while the face between them still cuts a convex area (bust, hips).
    Sample face centres and edge midpoints; when one is too close, push the face's vertices out.
    A sample far inside the body (near the crotch / inner hip) is matched to another body part whose normal
    used to throw hem vertices sideways: there the face moves along its own source-surface normal, with the
    depth clamped. Every step is capped."""
    P = P.copy()
    for _ in range(iterations):
        moved = 0
        push = np.zeros_like(P)
        cnt = np.zeros(len(P))
        for f in F:
            pts = [P[f].mean(0)] + [(P[a] + P[b]) * 0.5 for a, b in zip(f, f[1:] + f[:1])]
            worst = None
            for q in pts:
                loc, nrm, _, _ = body_bvh.find_nearest(Vector(q))
                if loc is None:
                    continue
                d = (Vector(q) - loc).dot(nrm)
                if d < -PUSH_FACES_MAX_DEPTH:
                    PUSH_FACES_EVENTS["deep_skipped"] += 1
                    if src_normals is None:
                        continue
                    own = src_normals[f].mean(0)
                    nrm = Vector(own / max(np.linalg.norm(own), 1e-9))
                    d = -PUSH_FACES_MAX_DEPTH
                if d < min_gap and (worst is None or d < worst[0]):
                    worst = (d, np.array(nrm))
            if worst is not None:
                step = min_gap - worst[0]
                if step > PUSH_FACES_MAX_STEP:
                    PUSH_FACES_EVENTS["capped"] += 1
                    step = PUSH_FACES_MAX_STEP
                for v in f:
                    push[v] += worst[1] * step
                    cnt[v] += 1
                moved += 1
        if not moved:
            break
        m = cnt > 0
        P[m] += push[m] / cnt[m][:, None]
    return P


def boundary_loops(faces):
    edges = {}
    for f in faces:
        for a, b in zip(f, f[1:] + f[:1]):
            k = (min(a, b), max(a, b))
            edges[k] = edges.get(k, 0) + 1
    bnd = [k for k, c in edges.items() if c == 1]
    adj = {}
    for a, b in bnd:
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)
    return bnd, adj


def build_shell(body, name, select_face, offset, min_gap=0.004, smooth_iters=8, smooth_mask=None,
                hem_depth=0.006, loosen=None, uv_transform=None, col=None, post=None, cuts=(),
                loop_shapers=(), relax_boundary_iters=0, relax_filter=None):
    """select_face(region_name, centroid) -> bool ; offset(P_body, N_body) -> (n,) metres.
    cuts: [(plane_co, plane_no, limit(face_center)->bool)] - geometry on the +normal side is removed, which
    gives straight hems instead of the decimated face boundary."""
    ob, V, N, reg, joints = body_data(body)
    me = ob.data
    uv_body = me.uv_layers["UVAtlas"].data
    faces_sel = [p for p in me.polygons if select_face(REGIONS[reg[p.index]], V[list(p.vertices)].mean(0))]
    used = sorted({v for p in faces_sel for v in p.vertices})
    gid = {v: i for i, v in enumerate(used)}
    src = np.array(used)
    F = [[gid[v] for v in p.vertices] for p in faces_sel]
    P = V[src] + N[src] * offset(V[src], N[src])[:, None]
    if loosen is not None:
        P = loosen(P, V[src])
    mask = np.ones(len(P)) if smooth_mask is None else smooth_mask(V[src])
    P = taubin(P, F, mask, smooth_iters)
    bvh = BVHTree.FromPolygons([tuple(map(float, v)) for v in V], [tuple(p.vertices) for p in me.polygons])
    gap = min_gap(P) if callable(min_gap) else min_gap
    P = push_out(P, bvh, gap)
    P = push_out_faces(P, F, bvh, (float(np.min(gap)) if np.ndim(gap) else gap) * 0.8, src_normals=N[src])
    if callable(min_gap):  # the face pass may smooth the layered band in again: re-apply the per-vertex gap
        P = push_out(P, bvh, min_gap(P))
    min_gap = float(np.min(gap)) if np.ndim(gap) else gap
    if post is not None:
        P = post(P, V[src], src)
    # ---- bmesh with uv + skin weights so that plane cuts interpolate both
    bone_names = [g.name for g in ob.vertex_groups]
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVAtlas")
    dl = bm.verts.layers.deform.verify()
    verts = []
    for i, p in enumerate(P):
        v = bm.verts.new(tuple(p))
        for g in me.vertices[int(src[i])].groups:
            v[dl][g.group] = g.weight
        verts.append(v)
    bm.verts.ensure_lookup_table()
    for p, f in zip(faces_sel, F):
        face = bm.faces.new([verts[i] for i in f])
        face.smooth = True
        for loop, li in zip(face.loops, p.loop_indices):
            uv = tuple(uv_body[li].uv)
            loop[uvl].uv = uv_transform(uv) if uv_transform else uv
    for co, no, limit in cuts:
        geom_faces = [f for f in bm.faces if limit is None or limit(np.array(f.calc_center_median()))]
        geom = list({e for f in geom_faces for e in f.edges}) + geom_faces + list({v for f in geom_faces for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector(co), plane_no=Vector(no), clear_outer=True, dist=1e-5)
    # drop loose leftovers of the cuts (tiny islands)
    islands = sorted(mesh_islands(bm), key=len, reverse=True)
    if len(islands) > 1:
        min_size = max(8, len(islands[0]) // 20)
        dead = [f for isl in islands if len(isl) < min_size for f in isl]
        if dead:
            bmesh.ops.delete(bm, geom=dead, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    for loop_fn in loop_shapers:
        loop_fn(bm)
    if relax_boundary_iters:
        relax_boundary(bm, relax_boundary_iters, bvh, min_gap, loop_filter=relax_filter)
    # ---- folded hems on the (now clean) boundary
    add_hems(bm, uvl, dl, bvh, hem_depth)
    # ---- weights: max 4 influences, normalised
    for v in bm.verts:
        w = sorted(v[dl].items(), key=lambda kv: -kv[1])
        keep = [(g, x) for g, x in w[:4] if x > 0.01] or w[:1]
        s = sum(x for _, x in keep)
        v[dl].clear()
        for g, x in keep:
            v[dl][g] = x / s
    full = f"{name}__{body}"
    old = bpy.data.objects.get(full)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    gme = bpy.data.meshes.new(full)
    gob = bpy.data.objects.new(full, gme)
    for nm in bone_names:  # vertex group order must match the deform layer indices
        gob.vertex_groups.new(name=nm)
    bm.to_mesh(gme)
    bm.free()
    (col or ensure_collection(f"GARMENTS_{body.upper()}")).objects.link(gob)
    for g in list(gob.vertex_groups):  # drop groups this piece does not use
        if not any(g.index == e.group for v in gme.vertices for e in v.groups):
            gob.vertex_groups.remove(g)
    gob.parent = ob.parent
    m = gob.modifiers.new("Armature", "ARMATURE")
    m.object = ob.parent
    gob["bar_body"] = body
    return gob, joints


def boundary_vertex_loops(bm):
    """Ordered boundary loops as lists of BMVert."""
    bm.verts.index_update()
    nb = {}
    for e in bm.edges:
        if e.is_boundary:
            a, b = e.verts
            nb.setdefault(a, []).append(b)
            nb.setdefault(b, []).append(a)
    loops, seen = [], set()
    for start in nb:
        if start in seen:
            continue
        loop, prev, cur = [start], None, start
        seen.add(start)
        while True:
            nxt = [v for v in nb[cur] if v is not prev and v not in seen]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            seen.add(cur)
            loop.append(cur)
        loops.append(loop)
    return loops


def relax_boundary(bm, iterations, body_bvh, min_gap, factor=0.5, loop_filter=None):
    for _ in range(iterations):
        for loop in boundary_vertex_loops(bm):
            n = len(loop)
            if n < 4:
                continue
            if loop_filter is not None and not loop_filter(np.array(sum((v.co for v in loop), Vector()) / n)):
                continue
            new = [((loop[i - 1].co + loop[(i + 1) % n].co) * 0.5) for i in range(n)]
            for v, p in zip(loop, new):
                v.co = v.co.lerp(p, factor)
    for v in bm.verts:
        loc, nrm, _, _ = body_bvh.find_nearest(v.co)
        if loc is not None and (v.co - loc).dot(nrm) < min_gap:
            v.co = loc + nrm * min_gap


def ellipse_loop_shaper(center_xy, radii, z_of_y, pick_radius=0.12):
    """Reshape the boundary loop closest to center_xy onto an ellipse (x/y radii) with height z_of_y(y)."""
    cx, cy = center_xy

    def shaper(bm):
        best, best_d = None, 1e9
        for loop in boundary_vertex_loops(bm):
            c = sum((v.co for v in loop), Vector()) / len(loop)
            d = math.hypot(c.x - cx, c.y - cy)
            if d < best_d and len(loop) > 5:
                best, best_d = loop, d
        if best is None or best_d > pick_radius:
            return
        for v in best:
            ang = math.atan2(v.co.y - cy, v.co.x - cx)
            x = cx + radii[0] * math.cos(ang)
            y = cy + radii[1] * math.sin(ang)
            v.co = Vector((x, y, z_of_y(y)))
    return shaper


def layer_gap(z_limit, base_gap, layer_gap_m, blend=0.03, below=True):
    """Per-vertex minimum skin gap: inside the layering band (below/above z_limit) the piece keeps
    layer_gap_m so it stays outside the pieces worn under it (waistbands, collars, hoods)."""
    def f(P):
        z = P[:, 2]
        w = smoothstep(z_limit + blend, z_limit, z) if below else smoothstep(z_limit - blend, z_limit, z)
        return base_gap + (layer_gap_m - base_gap) * w
    return f


TOP_OVER_BOTTOM_GAP = 0.022   # bottoms keep <= 0.013 m at the waistband
HAIR_OVER_COLLAR_GAP = 0.045  # hoodie hood / jacket collar reach ~0.04 m behind the neck


def mesh_islands(bm):
    bm.faces.index_update()
    seen, out = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        bm.faces.ensure_lookup_table()
        stack, comp = [f], []
        seen.add(f.index)
        while stack:
            x = stack.pop()
            comp.append(x)
            for e in x.edges:
                for g in e.link_faces:
                    if g.index not in seen:
                        seen.add(g.index)
                        stack.append(g)
        out.append(comp)
    return out


def add_hems(bm, uvl, dl, body_bvh, depth):
    """Duplicate every boundary loop inwards and bridge it: reads as a fabric fold. The fold depth is limited
    to 60 % of the local clearance to the skin so the fold never enters the body; fold faces are tagged with
    the face attribute 'bar_hem' (interior surfaces, ignored by the clipping metric)."""
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    boundary = [e for e in bm.edges if e.is_boundary]
    hem_layer = bm.faces.layers.int.get("bar_hem") or bm.faces.layers.int.new("bar_hem")
    if not boundary or depth <= 0:
        return
    inner = {}
    bm.normal_update()
    for v in {v for e in boundary for v in e.verts}:
        # fold along the garment's own normal: the nearest body point can be on another limb (armpit)
        d = -v.normal if v.normal.length > 1e-6 else Vector((0, 0, 0))
        loc, nrm, _, dist = body_bvh.find_nearest(v.co)
        clearance = (v.co - loc).dot(nrm) if loc is not None else depth * 2
        dv = min(depth, max(0.0015, 0.6 * clearance))
        nv = bm.verts.new(v.co + d * dv)
        for g, x in v[dl].items():
            nv[dl][g] = x
        inner[v] = nv
    for e in boundary:
        f_own = e.link_faces[0]
        # keep winding consistent with the owning face
        loop = next(l for l in f_own.loops if l.edge == e)
        a, b = loop.vert, loop.link_loop_next.vert
        uva, uvb = loop[uvl].uv.copy(), loop.link_loop_next[uvl].uv.copy()
        try:
            nf = bm.faces.new([b, a, inner[a], inner[b]])
        except ValueError:
            continue
        nf.smooth = True
        nf[hem_layer] = 1
        for l, uv in zip(nf.loops, (uvb, uva, uva, uvb)):
            l[uvl].uv = uv


def landmarks_for(joints):
    p = lambda b, e="head": np.array(jp(joints, b, e))
    L = {
        "collar": p("spine.004")[2], "chest_low": p("spine.003")[2] - 0.035, "waist": p("spine")[2] + 0.085,
        "hip_z": p("thigh.L")[2], "crotch": p("thigh.L")[2] - 0.08, "knee_z": p("shin.L")[2],
        "ankle_z": p("foot.L")[2], "shoulder_x": abs(p("upper_arm.L")[0]), "elbow_x": abs(p("forearm.L")[0]),
        "wrist_x": abs(p("hand.L")[0]), "eye_z": p("eye.L")[2], "eye_y": p("eye.L")[1],
        "head_z": p("spine.006")[2], "head_top": p("spine.006", "tail")[2], "ear": p("ear.L"),
        "ear_tail": p("ear.L", "tail"), "toe_y": p("toe.L", "tail")[1], "heel_y": p("heel.02.L")[1],
        "foot_x": abs(p("foot.L")[0]),
    }
    L["ua_mid"] = L["shoulder_x"] + 0.5 * (L["elbow_x"] - L["shoulder_x"])
    L["thigh_mid"] = L["crotch"] - 0.42 * (L["crotch"] - L["knee_z"])
    return L


def skin_weights_summary(ob):
    me = ob.data
    worst = 0
    zero = 0
    for v in me.vertices:
        s = sum(g.weight for g in v.groups)
        worst = max(worst, len(v.groups))
        if s < 1e-6:
            zero += 1
    return {"max_influences": worst, "unweighted": zero}
