"""Step 17 - hair styles and facial hair (both bodies), material CharacterHair (shared strand texture).

HAIR: hair_short (s09), hair_buzzed, hair_parted, hair_medium, hair_long, hair_ponytail, hair_bun, hair_wavy
FACIAL_HAIR: facial_beard_short, facial_beard_full, facial_goatee, facial_mustache
Shells come from the head/neck/back faces (weights copied from the body); medium/long styles hang from the
widest skull ring (drape) so they fall instead of hugging the neck; ponytail and bun add rigid head parts.
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\s09_shell_pieces.py", encoding="utf-8").read().split("SPECS = {")[0])


def face_landmarks(joints, L):
    p = lambda b, e="head": np.array(jp(joints, b, e))
    F = dict(L)
    F.update({"mouth": (p("lip.T.L") + p("lip.B.L")) / 2, "mouth_corner_x": abs(p("lip.T.L.001", "tail")[0]),
              "nose_bottom": p("nose.004")[2], "nose_tip_y": p("nose.001", "tail")[1], "chin_z": p("chin")[2],
              "jaw_angle": p("jaw.L"), "cheek_z": p("cheek.B.L.001")[2], "ear_front_y": p("ear.L")[1] - 0.012,
              "ear_top": p("ear.L.002")[2], "ear_bottom": p("ear.L.003", "tail")[2], "temple": p("temple.L"),
              "head_center_y": p("spine.006")[1], "neck_top": p("spine.006")[2] - 0.035})
    return F


def head_uv_transform(body):
    """Hair shells reuse body atlas UVs: remap the head islands to the full strand texture."""
    ob = bpy.data.objects[f"BAR_Body_{body.capitalize()}"]
    me = ob.data
    reg = int_array(me.attributes["body_region"].data, "value")
    uv = np.zeros(len(me.loops) * 2)
    me.uv_layers["UVAtlas"].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    li = np.concatenate([np.arange(p.loop_start, p.loop_start + p.loop_total) for p in me.polygons if REGIONS[reg[p.index]] in ("head", "neck")])
    lo, hi = uv[li].min(0), uv[li].max(0)
    span = np.maximum(hi - lo, 1e-6)
    return lambda u: (float((u[0] - lo[0]) / span[0]), float((u[1] - lo[1]) / span[1]))


def drape_from_skull(P, F, factor=1.0, start=None, bins=28):
    """Below the widest skull ring the hair hangs straight (outward only)."""
    zc = start if start is not None else F["ear_top"] + 0.01
    cy = F["head_center_y"]
    rel = P[:, [0, 1]] - np.array([0.0, cy])
    ang = np.arctan2(rel[:, 1], rel[:, 0])
    r = np.linalg.norm(rel, axis=1)
    b = ((ang + np.pi) / (2 * np.pi) * bins).astype(int) % bins
    band = (P[:, 2] > zc - 0.015) & (P[:, 2] < zc + 0.025)
    ring = np.zeros(bins)
    for k in range(bins):
        s = band & (b == k)
        ring[k] = r[s].max() if s.any() else 0
    for _ in range(3):
        ring = np.maximum(ring, (np.roll(ring, 1) + np.roll(ring, -1)) * 0.5 * 0.98)
    # only behind the eyes: pushing the temple strands out turns the style into a helmet
    w = smoothstep(zc, zc - 0.06, P[:, 2]) * smoothstep(F["eye_y"] + 0.005, F["eye_y"] + 0.045, P[:, 1])
    target = ring[b] * factor
    new_r = np.where(r < target, r + (target - r) * w, r)
    out = P.copy()
    out[:, 0] = rel[:, 0] / np.maximum(r, 1e-9) * new_r
    out[:, 1] = cy + rel[:, 1] / np.maximum(r, 1e-9) * new_r
    return out


def neck_half_width(body, z, band=0.01):
    """Half width (x) of the neck column at height z, from the body's own neck-region vertices."""
    ob, V, N, reg, joints = body_data(body)
    neck = REGIONS.index("neck")
    vs = {v for p in ob.data.polygons if reg[p.index] == neck for v in p.vertices}
    P = V[sorted(vs)]
    P = P[np.abs(P[:, 2] - z) < band]
    return float(np.percentile(np.abs(P[:, 0]), 95))


HAIR_BONES = {"head", "neck", "spine_03", "spine_02", "spine_01", "hip"}


def pin_hair_weights(ob, collar_z):
    """Hair follows head, neck and spine only: shoulder/arm influence (copied from the body under the hair)
    moves to neck above the collar and to spine_03 below it."""
    names = {g.index: g.name for g in ob.vertex_groups}
    for n in ("neck", "spine_03"):
        if ob.vertex_groups.get(n) is None:
            ob.vertex_groups.new(name=n)
    gid = {g.name: g.index for g in ob.vertex_groups}
    moved = 0
    for v in ob.data.vertices:
        w = {names.get(e.group, ob.vertex_groups[e.group].name): e.weight for e in v.groups}
        extra = sum(x for n, x in w.items() if n not in HAIR_BONES)
        if extra <= 0:
            continue
        moved += 1
        tgt = "neck" if (ob.matrix_world @ v.co).z > collar_z else "spine_03"
        keep = {n: x for n, x in w.items() if n in HAIR_BONES}
        keep[tgt] = keep.get(tgt, 0.0) + extra
        top = sorted(keep.items(), key=lambda kv: -kv[1])[:4]
        s = sum(x for _, x in top)
        for n in w:
            ob.vertex_groups[n].remove([v.index])
        for n, x in top:
            ob.vertex_groups[gid[n]].add([v.index], x / s, "REPLACE")
    for g in list(ob.vertex_groups):  # drop groups no vertex uses any more
        if not any(g.index == e.group for v in ob.data.vertices for e in v.groups):
            ob.vertex_groups.remove(g)
    return moved


def nape_gap(F, base=0.006):
    """Medium/long hair behind and below the skull stays outside hoods and jacket collars."""
    def f(P):
        below = smoothstep(F["neck_top"] + 0.02, F["neck_top"] - 0.01, P[:, 2])
        back = smoothstep(F["head_center_y"] - 0.01, F["head_center_y"] + 0.03, P[:, 1])
        return base + (HAIR_OVER_COLLAR_GAP - base) * below * back
    return f


def scalp_select(F, front_drop=0.0, nape=0.02, over_ear=0.028, sideburn=True):
    ear = F["ear"]

    def select(region, c):
        if region != "head":
            return False
        x, y, z = c
        if y < F["eye_y"] + 0.03:
            return z > F["eye_z"] + 0.055 - front_drop - 0.02 * smoothstep(0.03, 0.07, abs(x))
        if abs(x) > 0.05 and y < ear[1] + 0.01:
            return z > ear[2] - (0.005 if sideburn else -0.02)
        if y < ear[1] + 0.035 and abs(x) > 0.055:
            return z > ear[2] + over_ear
        return z > F["head_z"] - nape
    return select


def hair_spec(style, F, joints, body):
    ear = F["ear"]
    if style == "hair_buzzed":
        select = scalp_select(F, front_drop=-0.004)
        # thinner than ~4 mm lets the decimated scalp poke through between shell vertices
        offset = lambda P, N: np.full(len(P), 0.0048)
        return dict(select=select, offset=offset, relax_boundary_iters=6, min_gap=0.0042, smooth_iters=4, hem_depth=0.0)
    if style == "hair_parted":
        select = scalp_select(F, front_drop=0.006)

        def offset(P, N):
            top = smoothstep(F["eye_z"] + 0.03, F["head_top"] - 0.02, P[:, 2])
            side = smoothstep(0.03, -0.06, P[:, 0])  # volume swept to the character's right
            part = np.exp(-((P[:, 0] - 0.028) / 0.012) ** 2) * top  # part line on the left
            return 0.007 + 0.018 * top + 0.010 * side * top - 0.008 * part
        return dict(select=select, offset=offset, relax_boundary_iters=6, min_gap=0.004, smooth_iters=12, hem_depth=0.004)
    if style in ("hair_medium", "hair_wavy", "hair_long"):
        long_ = style == "hair_long"
        bottom = F["chin_z"] - 0.005 if not long_ else F["collar"] - 0.13
        neck_x = neck_half_width(body, F["chin_z"]) + 0.006

        def select(region, c):
            x, y, z = c
            if region == "head":
                if y < F["eye_y"] + 0.03:  # forehead: hairline, slightly lower fringe
                    return z > F["eye_z"] + 0.045 - 0.02 * smoothstep(0.03, 0.07, abs(x))
                if y < F["ear_front_y"] - 0.004:  # cheeks / face stay clear, the crown above stays covered
                    return (abs(x) > 0.062 and z > F["eye_z"] - 0.01) or z > F["eye_z"] + 0.045
                return z > bottom - 0.03
            if region == "neck":  # back half only: the hair must not wrap the throat
                # and only the neck column: the near-horizontal trapezius slope, lifted by the offset above the
                # cut plane, used to survive as a flat flap weighted to the shoulders ("wings" once arms drop)
                return y > (0.015 if long_ else -0.01) and z > bottom - 0.04 and abs(x) < neck_x
            if long_ and region in ("chest", "shoulder_l", "shoulder_r"):
                # rounded (parabolic) lower edge, narrower than the shoulder blades
                return y > 0.035 and abs(x) < 0.095 and z > bottom + 9.0 * x * x - 0.02
            return False

        def offset(P, N):
            top = smoothstep(F["eye_z"] + 0.03, F["head_top"] - 0.02, P[:, 2])
            # on the upper back the hair must lie outside tees, shirts and jackets (their offset is <= 2.4 cm)
            back = smoothstep(F["collar"] + 0.03, F["collar"] - 0.03, P[:, 2]) if long_ else 0.0
            return 0.010 + 0.016 * top + 0.020 * back

        def loosen(P, B):
            P = drape_from_skull(P, F, 1.02 if style != "hair_wavy" else 1.07)
            if style == "hair_wavy":
                rel = P[:, [0, 1]] - np.array([0.0, F["head_center_y"]])
                ang = np.arctan2(rel[:, 1], rel[:, 0])
                r = np.linalg.norm(rel, axis=1)
                below = smoothstep(F["ear_top"], F["ear_top"] - 0.05, P[:, 2])
                wave = 0.007 * np.sin(ang * 9 + P[:, 2] * 60) * below
                P[:, 0] += rel[:, 0] / np.maximum(r, 1e-9) * wave
                P[:, 1] += rel[:, 1] / np.maximum(r, 1e-9) * wave
            return P
        cuts = [] if long_ else [((0, 0, bottom), (0, 0, -1), None)]
        return dict(select=select, offset=offset, loosen=loosen, cuts=cuts, relax_boundary_iters=5 if long_ else 4,
                    relax_filter=None if long_ else (lambda c: c[1] < F["eye_y"] + 0.05),
                    min_gap=nape_gap(F), smooth_iters=14, hem_depth=0.008)
    if style in ("hair_ponytail", "hair_bun"):
        select = scalp_select(F, front_drop=-0.002, nape=0.03)

        def offset(P, N):
            top = smoothstep(F["eye_z"] + 0.03, F["head_top"] - 0.02, P[:, 2])
            return 0.006 + 0.007 * top
        return dict(select=select, offset=offset, relax_boundary_iters=6, min_gap=0.004, smooth_iters=10, hem_depth=0.004)
    raise KeyError(style)


def facial_spec(style, F, joints, body):
    mz = F["mouth"][2]
    mx = F["mouth_corner_x"]

    def lips(c):
        return abs(c[0]) < mx + 0.004 and abs(c[2] - mz) < 0.0105 and c[1] < F["mouth"][1] + 0.02

    def lower_face(region, c):
        x, y, z = c
        if region == "neck":
            return y < -0.015 and z > F["neck_top"] - 0.045
        if region != "head" or y > F["ear_front_y"] - 0.004 or lips(c):
            return False
        if z > F["nose_bottom"] - 0.002:  # above the upper lip: only the cheeks below the cheekbone
            return abs(x) > 0.045 and z < F["cheek_z"] - 0.005
        return True

    def goatee(region, c):
        x, y, z = c
        if region != "head" or lips(c) or y > F["mouth"][1] + 0.035:
            return False
        if z > F["nose_bottom"] - 0.002:
            return False
        return abs(x) < mx + 0.008 and z > F["chin_z"] - 0.012

    def mustache(region, c):
        x, y, z = c
        if region != "head" or lips(c) or y > F["mouth"][1] + 0.02:
            return False
        return abs(x) < mx + 0.006 and mz + 0.006 < z < F["nose_bottom"] - 0.001

    table = {
        "facial_beard_full": (lower_face, lambda P, N: 0.006 + 0.010 * smoothstep(F["mouth"][2], F["chin_z"] - 0.01, P[:, 2])),
        "facial_beard_short": (lower_face, lambda P, N: np.full(len(P), 0.0045)),
        "facial_goatee": (goatee, lambda P, N: 0.005 + 0.008 * smoothstep(F["mouth"][2], F["chin_z"] - 0.01, P[:, 2])),
        "facial_mustache": (mustache, lambda P, N: np.full(len(P), 0.0065)),
    }
    select, offset = table[style]
    # decimated faces are ~1 cm wide: shells thinner than ~4 mm let the skin poke through
    return dict(select=select, offset=offset, relax_boundary_iters=4, min_gap=0.0038, smooth_iters=6, hem_depth=0.002)


def add_ponytail(ob, F, joints, bun=False):
    """Rigid head part appended to the cap: tapered tube (ponytail) or sphere (bun) + elastic band."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    uvl = bm.loops.layers.uv.get("UVAtlas") or bm.loops.layers.uv.new("UVAtlas")
    dl = bm.verts.layers.deform.verify()
    head_g = ob.vertex_groups.get("head") or ob.vertex_groups.new(name="head")
    hg = head_g.index
    cy = F["head_center_y"]
    if bun:
        c = Vector((0.0, cy + 0.075, F["head_top"] - 0.035))
        geom = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.048)
        new_v = geom["verts"]
        for v in new_v:
            v.co = Vector((v.co.x, v.co.y * 0.85, v.co.z * 0.8)) + c
    else:
        base = Vector((0.0, cy + 0.085, F["eye_z"] + 0.045))
        segs, sides = 7, 8
        rings = []
        for i in range(segs + 1):
            t = i / segs
            ctr = base + Vector((0, 0.035 * t + 0.03 * math.sin(t * 2.2), -0.24 * t))
            rad = 0.026 * (1 - 0.55 * t) + 0.004
            ring = []
            for k in range(sides):
                a = 2 * math.pi * k / sides
                ring.append(bm.verts.new(ctr + Vector((rad * math.cos(a), rad * math.sin(a) * 0.8, 0))))
            rings.append(ring)
        new_v = [v for r in rings for v in r]
        for i in range(segs):
            for k in range(sides):
                f = bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]))
                for l, uv in zip(f.loops, ((k / sides, 1 - i / segs), ((k + 1) / sides, 1 - i / segs), ((k + 1) / sides, 1 - (i + 1) / segs), (k / sides, 1 - (i + 1) / segs))):
                    l[uvl].uv = uv
        tip = bm.verts.new(rings[-1][0].co.lerp(rings[-1][sides // 2].co, 0.5) + Vector((0, 0, -0.02)))
        new_v.append(tip)
        for k in range(sides):
            f = bm.faces.new((rings[-1][k], rings[-1][(k + 1) % sides], tip))
            for l in f.loops:
                l[uvl].uv = (k / sides, 0.0)
    for v in new_v:
        v[dl].clear()
        v[dl][hg] = 1.0
    for f in bm.faces:
        f.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data)
    bm.free()


HAIR_STYLES = ["hair_buzzed", "hair_parted", "hair_medium", "hair_long", "hair_ponytail", "hair_bun", "hair_wavy"]
FACIAL = ["facial_beard_short", "facial_beard_full", "facial_goatee", "facial_mustache"]


def build_hair(styles=HAIR_STYLES + FACIAL, bodies=("male", "female")):
    out = []
    for body in bodies:
        _, _, _, _, joints = body_data(body)
        L = landmarks_for(joints)
        F = face_landmarks(joints, L)
        uvt = head_uv_transform(body)
        for style in styles:
            spec = facial_spec(style, F, joints, body) if style.startswith("facial_") else hair_spec(style, F, joints, body)
            select, offset = spec.pop("select"), spec.pop("offset")
            ob, _ = build_shell(body, style, select, offset, uv_transform=uvt, **spec)
            if style in ("hair_ponytail", "hair_bun"):
                add_ponytail(ob, F, joints, bun=style == "hair_bun")
            if style.startswith("hair_"):
                pin_hair_weights(ob, F["collar"])
            ob["bar_hides"] = ""
            print(style, body, "verts", len(ob.data.vertices), "tris", tri_count(ob.data), skin_weights_summary(ob))
            out.append(ob)
    # the short style from s09 gets the same strand UV mapping
    for body in bodies:
        hs = bpy.data.objects.get(f"hair_short__{body}")
        if hs:
            remap_hair_uv(hs, head_uv_transform(body))
            pin_hair_weights(hs, landmarks_for(body_data(body)[4])["collar"])
    return out


def remap_hair_uv(ob, uvt):
    if ob.get("bar_uv_remapped"):
        return
    uv = ob.data.uv_layers[0].data
    for d in uv:
        d.uv = uvt(tuple(d.uv))
    ob["bar_uv_remapped"] = True


if __name__ == "__main__" or True:
    HAIR = build_hair()
