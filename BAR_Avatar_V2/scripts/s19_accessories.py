"""Step 19 - rigid accessories (attachment to standard sockets).

accessory_glasses, accessory_sunglasses -> socket_glasses
accessory_cap, accessory_hat           -> socket_head_top
accessory_bracelet                     -> socket_wrist_l
In the master file each accessory is weighted 100 % to the socket's parent bone (so previews animate);
the export writes a non-skinned mesh in the socket's local frame (identity rotation in the rest pose).
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\s17_hair.py", encoding="utf-8").read().split("HAIR_STYLES = [")[0])
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\s04_rig.py", encoding="utf-8").read().split("RIGS = {}")[0])

ACCESSORIES = {
    "accessory_glasses": "socket_glasses", "accessory_sunglasses": "socket_glasses",
    "accessory_cap": "socket_head_top", "accessory_hat": "socket_head_top", "accessory_bracelet": "socket_wrist_l",
}
SOCKET_BONE = {"socket_glasses": "head", "socket_head_top": "head", "socket_wrist_l": "lowerarm_l"}


def new_rigid_object(body, piece, bm, bone, mats=1):
    rig = bpy.data.objects[f"RIG_{body}"]
    full = f"{piece}__{body}"
    old = bpy.data.objects.get(full)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    me = bpy.data.meshes.new(full)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(full, me)
    ensure_collection(f"ACCESSORIES_{body.upper()}").objects.link(ob)
    g = ob.vertex_groups.new(name=bone)
    g.add(list(range(len(me.vertices))), 1.0, "REPLACE")
    ob.parent = rig
    m = ob.modifiers.new("Armature", "ARMATURE")
    m.object = rig
    ob["bar_body"] = body
    ob["bar_socket"] = ACCESSORIES[piece]
    ob["bar_hides"] = ""
    for p in me.polygons:
        p.use_smooth = True
    print(full, "verts", len(me.vertices), "tris", tri_count(me))
    return ob


def head_halfwidth(V, z, y0, y1):
    s = (np.abs(V[:, 2] - z) < 0.012) & (V[:, 1] > y0) & (V[:, 1] < y1)
    return float(np.abs(V[s][:, 0]).max()) if s.any() else 0.08


def rounded_rect(cx, cz, hw, hh, n=16, k=4.0):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        pts.append((cx + hw * math.copysign(abs(c) ** (2 / k), c), cz + hh * math.copysign(abs(s) ** (2 / k), s)))
    return pts


def build_glasses(body, piece="accessory_glasses", sun=False):
    ob, V, N, reg, joints = body_data(body)
    eye_l, eye_r = jp(joints, "eye.L", "head"), jp(joints, "eye.R", "head")
    hw, hh = (0.027, 0.021) if sun else (0.0235, 0.0165)
    y_front = min(eye_l.y, eye_r.y) - 0.026
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    frame_faces, lens_faces = [], []
    rims = {}
    for side, e in (("l", eye_l), ("r", eye_r)):
        cx, cz = e.x + (0.002 if side == "l" else -0.002), e.z + 0.002
        outer = rounded_rect(cx, cz, hw + 0.004, hh + 0.004)
        inner = rounded_rect(cx, cz, hw, hh)
        n = len(outer)
        fo = [bm.verts.new((x, y_front, z)) for x, z in outer]
        fi = [bm.verts.new((x, y_front, z)) for x, z in inner]
        bo = [bm.verts.new((x, y_front + 0.004, z)) for x, z in outer]
        bi = [bm.verts.new((x, y_front + 0.004, z)) for x, z in inner]
        for i in range(n):
            j = (i + 1) % n
            for quad in ((fo[i], fo[j], fi[j], fi[i]), (bo[j], bo[i], bi[i], bi[j]), (fo[j], fo[i], bo[i], bo[j]), (fi[i], fi[j], bi[j], bi[i])):
                frame_faces.append(bm.faces.new(quad))
        # lens: fan inside the inner loop, slightly behind the front
        c = bm.verts.new((cx, y_front + 0.0015 + (0.0 if not sun else 0.0), cz))
        ring = [bm.verts.new((x, y_front + 0.0015, z)) for x, z in inner]
        for i in range(n):
            lens_faces.append(bm.faces.new((ring[i], ring[(i + 1) % n], c)))
        rims[side] = (cx, cz, fo, bo)
    # bridge
    l_in = min(rims["l"][2], key=lambda v: v.co.x)
    r_in = max(rims["r"][2], key=lambda v: v.co.x)
    mid = (l_in.co + r_in.co) / 2 + Vector((0, 0, 0.004))
    w = 0.0025
    for a, b in ((r_in.co, mid), (mid, l_in.co)):
        q = [bm.verts.new(a + Vector((0, 0, -w))), bm.verts.new(b + Vector((0, 0, -w))),
             bm.verts.new(b + Vector((0, 0.004, w))), bm.verts.new(a + Vector((0, 0.004, w)))]
        frame_faces.append(bm.faces.new(q))
        q2 = [bm.verts.new(a + Vector((0, 0, w))), bm.verts.new(b + Vector((0, 0, w))),
              bm.verts.new(b + Vector((0, 0.004, -w))), bm.verts.new(a + Vector((0, 0.004, -w)))]
        frame_faces.append(bm.faces.new(q2[::-1]))
    # temples to the ears, just outside the head
    ear = jp(joints, "ear.L", "head")
    for side, s in (("l", 1), ("r", -1)):
        cx, cz, fo, bo = rims[side]
        hinge = max(fo, key=lambda v: v.co.x * s).co + Vector((0, 0.003, 0.006))
        half = head_halfwidth(V, hinge.z, hinge.y, ear.y + 0.03) + 0.006
        back = Vector((s * half, ear.y + 0.025, ear.z + 0.022))
        midp = Vector((s * (half + 0.002), (hinge.y + back.y) / 2, hinge.z))
        path = [hinge, midp, back, back + Vector((0, 0.018, -0.02))]
        for a, b in zip(path, path[1:]):
            q = [bm.verts.new(a + Vector((0, 0, -0.003))), bm.verts.new(b + Vector((0, 0, -0.003))),
                 bm.verts.new(b + Vector((0, 0, 0.003))), bm.verts.new(a + Vector((0, 0, 0.003)))]
            if s < 0:
                q = q[::-1]
            frame_faces.append(bm.faces.new(q))
    for f in frame_faces:
        f.material_index = 0
        for l in f.loops:
            l[uvl].uv = (0.25, 0.5)
    for f in lens_faces:
        f.material_index = 1
        for l in f.loops:
            l[uvl].uv = (0.75, 0.5)
    bmesh.ops.recalc_face_normals(bm, faces=frame_faces)
    return new_rigid_object(body, piece, bm, "head")


def build_cap(body, piece="accessory_cap"):
    ob, V, N, reg, joints = body_data(body)
    L = landmarks_for(joints)
    F = face_landmarks(joints, L)
    ear = F["ear"]
    front_z = F["eye_z"] + 0.048
    back_z = ear[2] + 0.005

    def select(region, c):
        return region == "head" and c[2] > min(front_z, back_z) - 0.03

    def offset(P, N):
        top = smoothstep(F["eye_z"] + 0.04, F["head_top"] - 0.01, P[:, 2])
        return 0.024 + 0.016 * top

    cy = F["head_center_y"]
    tilt = (back_z - front_z) / 0.2
    cap, _ = build_shell(body, piece, select, offset, cuts=[((0, cy, (front_z + back_z) / 2), (0, -tilt * 0, 1.0), None)] if False else
                         [((0, cy - 0.1, front_z), (0, tilt, -1.0), None)],
                         min_gap=0.02, smooth_iters=20, hem_depth=0.006, relax_boundary_iters=4)
    # brim: half annulus in front of the band, slightly drooping
    bm = bmesh.new()
    bm.from_mesh(cap.data)
    uvl = bm.loops.layers.uv[0]
    dl = bm.verts.layers.deform.verify()
    band = [v for v in bm.verts if v.is_boundary and v.co.y < cy - 0.02]
    band.sort(key=lambda v: math.atan2(v.co.y - cy, v.co.x))
    if len(band) >= 4:
        rows = []
        for t in (0.0, 1.0):
            row = []
            for v in band:
                d = Vector((v.co.x, v.co.y - cy, 0))
                ang_w = max(0.0, -d.normalized().y)  # longer at the centre front
                out = d.normalized() * (0.075 * ang_w ** 0.6 * t)
                p = v.co + out + Vector((0, 0, -0.012 * t * ang_w))
                nv = bm.verts.new(p)
                row.append(nv)
            rows.append(row)
        for i in range(len(band) - 1):
            for top_off, flip in ((0.0, False), (-0.004, True)):
                a, b = rows[0][i].co, rows[0][i + 1].co
                c, d = rows[1][i + 1].co, rows[1][i].co
                vs = [bm.verts.new(p + Vector((0, 0, top_off))) for p in (a, b, c, d)]
                f = bm.faces.new(vs if not flip else vs[::-1])
                for l in f.loops:
                    l[uvl].uv = (0.5, 0.05)
        for row in rows:
            for v in row:
                bm.verts.remove(v)
    bm.normal_update()
    bm.to_mesh(cap.data)
    bm.free()
    to_rigid(cap, "head")
    cap["bar_socket"] = ACCESSORIES[piece]
    return cap


def build_hat(body, piece="accessory_hat"):
    ob, V, N, reg, joints = body_data(body)
    L = landmarks_for(joints)
    F = face_landmarks(joints, L)
    cy = F["head_center_y"] + 0.005
    base_z = F["eye_z"] + 0.05
    bins = 24
    head = V[(V[:, 2] > base_z - 0.01) & (V[:, 2] < base_z + 0.02)]
    rel = head[:, [0, 1]] - np.array([0, cy])
    ang = np.arctan2(rel[:, 1], rel[:, 0])
    r = np.linalg.norm(rel, axis=1)
    b = ((ang + np.pi) / (2 * np.pi) * bins).astype(int) % bins
    ring = np.array([r[b == k].max() if (b == k).any() else 0.08 for k in range(bins)])
    for _ in range(3):
        ring = np.maximum(ring, (np.roll(ring, 1) + np.roll(ring, -1)) / 2 * 0.98)
    ring = ring + 0.03
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    levels = [(base_z, 1.0), (base_z + 0.05, 0.98), (base_z + 0.095, 0.93), (base_z + 0.115, 0.82)]
    rings_v = []
    for z, s in levels:
        rings_v.append([bm.verts.new((ring[k] * s * math.cos(-math.pi + (k + .5) * 2 * math.pi / bins),
                                      cy + ring[k] * s * math.sin(-math.pi + (k + .5) * 2 * math.pi / bins), z)) for k in range(bins)])
    for i in range(len(rings_v) - 1):
        for k in range(bins):
            f = bm.faces.new((rings_v[i][k], rings_v[i][(k + 1) % bins], rings_v[i + 1][(k + 1) % bins], rings_v[i + 1][k]))
            for l in f.loops:
                l[uvl].uv = (k / bins, 0.6 + 0.1 * i)
    top = bm.verts.new((0, cy, base_z + 0.105))  # pinched crown top
    for k in range(bins):
        f = bm.faces.new((rings_v[-1][k], rings_v[-1][(k + 1) % bins], top))
        for l in f.loops:
            l[uvl].uv = (k / bins, 0.95)
    # brim: two rings (top/bottom) out to +0.075 m, edge slightly curled up
    inner_t = rings_v[0]
    outer_t = [bm.verts.new((v.co.x + (v.co.x) / max(math.hypot(v.co.x, v.co.y - cy), 1e-6) * 0.075,
                             cy + (v.co.y - cy) + (v.co.y - cy) / max(math.hypot(v.co.x, v.co.y - cy), 1e-6) * 0.075,
                             base_z + 0.012)) for v in inner_t]
    inner_b = [bm.verts.new(v.co + Vector((0, 0, -0.004))) for v in inner_t]
    outer_b = [bm.verts.new(v.co + Vector((0, 0, -0.004))) for v in outer_t]
    for k in range(bins):
        j = (k + 1) % bins
        for quad in ((inner_t[k], outer_t[k], outer_t[j], inner_t[j]), (inner_b[j], outer_b[j], outer_b[k], inner_b[k]),
                     (outer_t[k], outer_b[k], outer_b[j], outer_t[j])):
            f = bm.faces.new(quad)
            for l in f.loops:
                l[uvl].uv = (k / bins, 0.2)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return new_rigid_object(body, piece, bm, "head")


def build_bracelet(body, piece="accessory_bracelet"):
    ob, V, N, reg, joints = body_data(body)
    wrist, elbow = jp(joints, "hand.L", "head"), jp(joints, "forearm.L", "head")
    c = wrist.lerp(elbow, 0.08)
    near = V[(np.abs(V[:, 0] - c.x) < 0.01)]
    rr = float(np.median(np.linalg.norm(near[:, 1:] - np.array([c.y, c.z]), axis=1)))
    R = float(np.max(np.linalg.norm(near[:, 1:] - np.array([c.y, c.z]), axis=1))) + 0.006
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    nu, nv = 16, 6
    grid = []
    for i in range(nu):
        a = 2 * math.pi * i / nu
        row = []
        for j in range(nv):
            b = 2 * math.pi * j / nv
            rad = R + 0.004 * math.cos(b)
            row.append(bm.verts.new((c.x + 0.0045 * math.sin(b), c.y + rad * math.cos(a), c.z + rad * math.sin(a))))
        grid.append(row)
    for i in range(nu):
        for j in range(nv):
            f = bm.faces.new((grid[i][j], grid[(i + 1) % nu][j], grid[(i + 1) % nu][(j + 1) % nv], grid[i][(j + 1) % nv]))
            for l in f.loops:
                l[uvl].uv = (i / nu, j / nv)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    del rr
    return new_rigid_object(body, piece, bm, "lowerarm_l")


def to_rigid(ob, bone):
    for g in list(ob.vertex_groups):
        ob.vertex_groups.remove(g)
    g = ob.vertex_groups.new(name=bone)
    g.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
    ob["bar_hides"] = ""


def build_accessories(bodies=("male", "female")):
    out = []
    for body in bodies:
        rig = bpy.data.objects[f"RIG_{body}"]
        add_sockets(rig, compute_joints(np.load(os.path.join(CACHE, f"{body}.npy"))), np.load(os.path.join(CACHE, f"{body}.npy")))
        out.append(build_glasses(body, "accessory_glasses"))
        out.append(build_glasses(body, "accessory_sunglasses", sun=True))
        out.append(build_cap(body))
        out.append(build_hat(body))
        out.append(build_bracelet(body))
    return out


if __name__ == "__main__" or True:
    ACC = build_accessories()
