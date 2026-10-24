"""Step 05 - low poly bodies (shared topology) with canonical skin weights.

* binds every LP_TOPO vertex to the high resolution neutral surface (triangle, barycentric, normal offset)
* rebuilds that vertex on each body shape (female / male), so both bodies share topology and UVs
* interpolates Antonia's authored DEF weights and folds them into BAR_HUMANOID_V2 bones
  (max 4 influences, normalised)
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())

FINGER_SRC = {"f_index": "index", "f_middle": "middle", "f_ring": "ring", "f_pinky": "pinky", "thumb": "thumb"}


def canonical_bone(def_name):
    """Antonia rigify DEF bone -> BAR_HUMANOID_V2 bone."""
    n = def_name.split("-", 1)[1]
    side = "l" if ".L" in n else "r" if ".R" in n else None
    base = n.split(".")[0]
    spine = {"spine": "hip", "spine.001": "spine_01", "spine.002": "spine_02", "spine.003": "spine_03",
             "spine.004": "neck", "spine.005": "neck", "spine.006": "head"}
    if n in spine:
        return spine[n]
    if base in ("pelvis",):
        return "hip"
    if base == "abdomen":
        return "spine_01" if n == "abdomen" else "spine_02"
    if base in ("breast", "chest_expand"):
        return "spine_03"
    if base == "shoulder":
        return f"shoulder_{side}"
    if base == "upper_arm":
        return f"upperarm_{side}"
    if base == "forearm":
        return f"lowerarm_{side}"
    if base in ("hand", "palm"):
        return f"hand_{side}"
    if base in FINGER_SRC:
        k = n.split(".")[1]
        return f"{FINGER_SRC[base]}_{k}_{side}"
    if base in ("thigh", "thigh-lateral", "thigh-medial"):
        return f"upperleg_{side}"
    if base in ("shin", "knee"):
        return f"lowerleg_{side}"
    if base == "foot":
        return f"foot_{side}"
    if base in ("toe", "toe_bend", "big_toe"):
        return f"toe_{side}"
    return "head"  # face, eyes, teeth, tongue, ears ...


def hp_triangles(hp):
    me = hp.data
    me.calc_loop_triangles()
    oi = int_array(me.attributes["orig_index"].data, "value")
    tris = int_array(me.loop_triangles, "vertices", 3)
    assert tris.min() >= 0 and tris.max() < len(me.vertices)
    return tris, oi


def bind(lp, hp):
    """For each LP vertex: original vertex ids (3), barycentric (3), signed offset along the surface normal."""
    tris, oi = hp_triangles(hp)
    Vh = mesh_arrays(hp.data)
    bvh = BVHTree.FromPolygons([tuple(map(float, v)) for v in Vh], [tuple(map(int, t)) for t in tris])
    Vl = mesh_arrays(lp.data)
    ids = np.zeros((len(Vl), 3), dtype=np.int64)
    bary = np.zeros((len(Vl), 3))
    off = np.zeros(len(Vl))
    for i, p in enumerate(Vl):
        loc, nrm, ti, dist = bvh.find_nearest(Vector(p))
        a, b, c = (Vector(Vh[k]) for k in tris[ti])
        w = barycentric(Vector(loc), a, b, c)
        ids[i] = oi[tris[ti]]
        bary[i] = w
        off[i] = (Vector(p) - loc).dot(nrm)
    np.savez(os.path.join(CACHE, "lp_binding.npz"), ids=ids, bary=bary, off=off)
    print("binding: max |offset|", np.abs(off).max().round(4), "mean", np.abs(off).mean().round(5))
    return ids, bary, off


def barycentric(p, a, b, c):
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11 = v0.dot(v0), v0.dot(v1), v1.dot(v1)
    d20, d21 = v2.dot(v0), v2.dot(v1)
    den = d00 * d11 - d01 * d01
    if abs(den) < 1e-18:
        return (1.0, 0.0, 0.0)
    v = (d11 * d20 - d01 * d21) / den
    w = (d00 * d21 - d01 * d20) / den
    return (1.0 - v - w, v, w)


def rebuild(shape, ids, bary, off):
    A, B, C = shape[ids[:, 0]], shape[ids[:, 1]], shape[ids[:, 2]]
    P = A * bary[:, :1] + B * bary[:, 1:2] + C * bary[:, 2:3]
    N = np.cross(B - A, C - A)
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
    return P + N * off[:, None]


def canonical_weights(ids, bary, bone_names):
    W = load_def_weights()
    n_orig = int(ids.max()) + 1
    col = {b: i for i, b in enumerate(bone_names)}
    M = np.zeros((max(n_orig, 36030), len(bone_names)))
    for def_name, (idx, w) in W.items():
        M[idx, col[canonical_bone(def_name)]] += w
    s = M.sum(1, keepdims=True)
    M = np.divide(M, s, out=np.zeros_like(M), where=s > 1e-9)
    L = M[ids[:, 0]] * bary[:, :1] + M[ids[:, 1]] * bary[:, 1:2] + M[ids[:, 2]] * bary[:, 2:3]
    # keep the 4 strongest influences, renormalise
    order = np.argsort(-L, axis=1)
    keep = np.zeros_like(L, dtype=bool)
    rows = np.arange(len(L))[:, None]
    keep[rows, order[:, :4]] = True
    L = np.where(keep, L, 0.0)
    L[L < 0.01] = 0.0
    s = L.sum(1, keepdims=True)
    assert (s > 0).all(), "vertex without influence"
    return L / s


def make_body(body, lp, rig, ids, bary, off):
    shape = np.load(os.path.join(CACHE, f"{body}.npy"))
    name = f"BAR_Body_{body.capitalize()}"
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    me = lp.data.copy()
    me.name = name
    set_mesh_co(me, rebuild(shape, ids, bary, off))
    ob = bpy.data.objects.new(name, me)
    ensure_collection(f"BODY_{body.upper()}").objects.link(ob)
    bones = [b.name for b in rig.data.bones if b.use_deform]
    L = canonical_weights(ids, bary, bones)
    for j, b in enumerate(bones):
        g = ob.vertex_groups.new(name=b)
        nz = np.nonzero(L[:, j])[0]
        for v in nz:
            g.add([int(v)], float(L[v, j]), "REPLACE")
    ob.parent = rig
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    for p in me.polygons:
        p.use_smooth = True
    ob["bar_body"] = body
    print(name, "verts", len(me.vertices), "tris", tri_count(me), "max infl", int((L > 0).sum(1).max()))
    return ob


LP = bpy.data.objects["LP_TOPO"]
HP = bpy.data.objects["HP_SKIN_neutral"]
IDS, BARY, OFF = bind(LP, HP)
BODIES = {b: make_body(b, LP, bpy.data.objects[f"RIG_{b}"], IDS, BARY, OFF) for b in ("female", "male")}
