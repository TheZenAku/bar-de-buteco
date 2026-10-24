"""Step 06 - eyes and eyebrows for each body (rigid to the head bone).

Eyes : low poly spheres fitted to Antonia's eyeball geometry of each body shape; UV = frontal projection
       into eye_v2.png (RGB detail, A = iris tint mask).
Brows: short quad strips projected onto the face surface; use the shared hair material so they follow
       the hair colour. Styles: regular / thin / thick.
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())

EYE_SCLERA_MATS = (8, 0)  # sclera + cornea islands in the Antonia mesh
BROW_STYLES = {
    # (inner width, peak width, outer width) in metres and arch lift
    "regular": ((0.0075, 0.0070, 0.0040), 0.0065),
    "thin": ((0.0045, 0.0042, 0.0025), 0.0075),
    "thick": ((0.0100, 0.0095, 0.0060), 0.0050),
}


def eye_vertex_sets():
    me = bpy.data.objects["cm_antonia"].data
    left, right = set(), set()
    for p in me.polygons:
        if p.material_index in EYE_SCLERA_MATS:
            for v in p.vertices:
                (left if me.vertices[v].co.x > 0 else right).add(v)
    return sorted(left), sorted(right)


def make_eye(name, center, radius, col, rig, segments=12, rings=8):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    # sphere poles on Z: rotate so a pole looks forward (-Y)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, "X"))
    for f in bm.faces:
        f.smooth = True
        for l in f.loops:
            co = l.vert.co
            # frontal projection: the iris sits at the front pole; back hemisphere maps to sclera
            if co.y <= 0:
                l[uv].uv = (0.5 + 0.5 * co.x / radius, 0.5 + 0.5 * co.z / radius)
            else:
                l[uv].uv = (0.5 + 0.98 * math.copysign(0.5, co.x) if abs(co.x) > 1e-6 else 0.99, 0.5)
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(center))
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    return ob


def brow_strip(side, eye_c, eye_r, style, bvh, n=7):
    widths, lift = BROW_STYLES[style]
    s = 1 if side == "l" else -1
    x0, x1 = eye_c.x - s * eye_r * 1.25, eye_c.x + s * eye_r * 1.75
    base_z = eye_c.z + eye_r * 1.45
    verts, faces = [], []
    for i in range(n):
        t = i / (n - 1)
        x = x0 + (x1 - x0) * t
        arch = math.sin(min(1.0, t / 0.65) * math.pi / 2) if t < 0.65 else 1 - (t - 0.65) / 0.35 * 0.55
        z = base_z + lift * arch - 0.002 * t
        w = np.interp(t, [0, 0.45, 1], widths)
        for dz in (-w * 0.45, w * 0.55):
            origin = Vector((x, eye_c.y - 0.08, z + dz))
            hit, nrm, _, _ = bvh.ray_cast(origin, Vector((0, 1, 0)), 0.2)
            if hit is None:
                hit, nrm = Vector((x, eye_c.y - 0.012, z + dz)), Vector((0, -1, 0))
            verts.append(hit + nrm * 0.0026)  # closer than ~2.5 mm lets the brow ridge poke through
        if i:
            a = 2 * (i - 1)
            faces.append((a, a + 2, a + 3, a + 1) if s > 0 else (a, a + 1, a + 3, a + 2))
    return verts, faces


def head_only_weights(ob):
    g = ob.vertex_groups.new(name="head")
    g.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")


def build(body):
    shape = np.load(os.path.join(CACHE, f"{body}.npy"))
    rig = bpy.data.objects[f"RIG_{body}"]
    body_ob = bpy.data.objects[f"BAR_Body_{body.capitalize()}"]
    col = ensure_collection(f"BODY_{body.upper()}")
    for o in list(bpy.data.objects):  # previous builds (possibly orphaned when the rig was rebuilt)
        if o.name.split(".")[0] in (f"BAR_Eyes__{body}", f"BAR_Eye_L__{body}", f"BAR_Eye_R__{body}") or \
                (o.name.startswith("BAR_Brows_") and o.name.split(".")[0].endswith(f"__{body}")):
            bpy.data.objects.remove(o, do_unlink=True)
    left, right = eye_vertex_sets()
    eyes = []
    for side, ids in (("l", left), ("r", right)):
        P = shape[ids]
        c = P.mean(0)
        r = float(np.linalg.norm(P - c, axis=1).max())
        eyes.append((side, Vector(c), r))
    eye_obs = [make_eye(f"BAR_Eye_{side.upper()}__{body}", c, r * 0.96, col, rig) for side, c, r in eyes]
    # join both eyes in one mesh (one draw call)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in eye_obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = eye_obs[0]
    bpy.ops.object.join()
    eyes_ob = eye_obs[0]
    eyes_ob.name = eyes_ob.data.name = f"BAR_Eyes__{body}"
    # brows projected on the low poly face (rest pose, armature disabled while sampling)
    dg = bpy.context.evaluated_depsgraph_get()
    mod = body_ob.modifiers["Armature"]
    mod.show_viewport = False
    dg.update()
    bvh = BVHTree.FromObject(body_ob, bpy.context.evaluated_depsgraph_get())
    mod.show_viewport = True
    brow_obs = []
    for style in BROW_STYLES:
        V, F = [], []
        for side, c, r in eyes:
            v, f = brow_strip(side, c, r, style, bvh)
            off = len(V)
            V += v
            F += [tuple(i + off for i in q) for q in f]
        ob = new_mesh_object(f"BAR_Brows_{style}__{body}", V, F, col)
        uvl = ob.data.uv_layers.new(name="UVMap")
        for poly in ob.data.polygons:
            for k, li in enumerate(poly.loop_indices):
                uvl.data[li].uv = ((0.05, 0.05), (0.95, 0.05), (0.95, 0.95), (0.05, 0.95))[k]
        brow_obs.append(ob)
    for ob in [eyes_ob] + brow_obs:
        for p in ob.data.polygons:
            p.use_smooth = True
        ob.parent = rig
        head_only_weights(ob)
        m = ob.modifiers.new("Armature", "ARMATURE")
        m.object = rig
        ob["bar_body"] = body
    print(body, "eyes tris", tri_count(eyes_ob.data), "brows", [tri_count(o.data) for o in brow_obs])
    return eyes_ob, brow_obs


for body in ("female", "male"):
    build(body)
