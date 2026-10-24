"""Step 21 - textures and materials for the whole catalogue (tint-mask contract of s07/s11).

* shell pieces paint in their atlas UVs from 3D predicates; hems/cuffs/collars are found generically from the
  real mesh boundary (distance in 3D), so every garment gets its bands without hand placement
* loft pieces (skirt, shoes, boots, flip-flops) paint directly in their own UV space
* texture-only variants: top_tee_print (tee geometry), bottom_pants (jeans geometry)
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\s11_piece_materials.py", encoding="utf-8").read().split("build_piece_materials()\n")[0])
from mathutils.kdtree import KDTree

DEFAULTS.update({
    "top_shirt": (0.85, 0.82, 0.74), "top_tank": (0.92, 0.92, 0.9), "top_hoodie": (0.33, 0.35, 0.38),
    "top_jacket": (0.16, 0.2, 0.18), "top_tee_print": (0.13, 0.13, 0.14), "bottom_shorts": (0.55, 0.5, 0.38),
    "bottom_pants": (0.47, 0.42, 0.33), "bottom_skirt": (0.2, 0.27, 0.4), "footwear_shoes": (0.32, 0.2, 0.12),
    "footwear_boots": (0.36, 0.24, 0.14), "footwear_flipflops": (0.2, 0.45, 0.35), "accessory_glasses": (0.1, 0.1, 0.11),
    "accessory_sunglasses": (0.08, 0.08, 0.09), "accessory_cap": (0.55, 0.12, 0.1), "accessory_hat": (0.62, 0.52, 0.36),
    "accessory_bracelet": (0.75, 0.62, 0.3),
})


def hem_tree(ob):
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    pts = [v.co.copy() for v in bm.verts if v.is_boundary]
    bm.free()
    kd = KDTree(max(len(pts), 1))
    for i, p in enumerate(pts):
        kd.insert(p, i)
    kd.balance()
    return kd, len(pts)


def hem_distance(kd, n, P):
    if n == 0:
        return np.full(len(P), 1.0)
    return np.array([kd.find(Vector(p))[2] for p in P])


def fabric(P, scale=400, amp=0.04, base=0.93):
    return base + amp * (value_noise(P, scale) - 0.5) + 0.02 * (value_noise(P, 90, 3) - 0.5)


def painter(piece, ob, L, joints, body):
    kd, n = hem_tree(ob)

    def common(P, band=0.016, factor=0.86, base=0.93, scale=400, amp=0.04):
        v = fabric(P, scale, amp, base)
        d = hem_distance(kd, n, P)
        v = np.where(d < band, v * factor, v)
        v = np.where(np.abs(d - band) < 0.0015, v * 0.8, v)  # stitch line
        return v

    def out(v, a=None, rgb=None):
        rgb = np.repeat(v[:, None], 3, 1) if rgb is None else rgb
        a = np.ones(len(v)) if a is None else a
        return np.concatenate([rgb, a[:, None]], 1)

    if piece == "top_shirt":
        def paint(P, region):
            x, y, z = P.T
            v = common(P, band=0.014)
            plack = (np.abs(x) < 0.016) & (y < 0) & (z < L["collar"] + 0.02)
            v = np.where(plack, v * 0.95, v)
            v = np.where(plack & (np.abs(np.abs(x) - 0.016) < 0.0015), v * 0.8, v)
            buttons = (np.abs(x) < 0.006) & (y < 0) & (np.abs(((z - L["waist"]) % 0.075) - 0.037) < 0.0055) & (z < L["collar"] - 0.01)
            pocket = (x > 0.04) & (x < 0.11) & (y < 0) & (z > L["chest_low"] + 0.02) & (z < L["chest_low"] + 0.12)
            pocket_edge = pocket & ((np.abs(x - 0.04) < 0.002) | (np.abs(x - 0.11) < 0.002) | (np.abs(z - (L["chest_low"] + 0.12)) < 0.003) | (np.abs(z - (L["chest_low"] + 0.02)) < 0.002))
            v = np.where(pocket_edge, v * 0.78, v)
            a = np.ones(len(P))
            rgb = np.repeat(v[:, None], 3, 1)
            rgb[buttons] = 0.95
            a[buttons] = 0.0
            return out(v, a, rgb)
        return paint
    if piece == "top_tank":
        def paint(P, region):
            v = common(P, band=0.01, factor=0.88)
            v *= 0.97 + 0.03 * np.sin(P[:, 0] * 700)  # rib knit
            return out(v)
        return paint
    if piece == "top_hoodie":
        def paint(P, region):
            x, y, z = P.T
            v = common(P, band=0.035, factor=0.85, scale=250, amp=0.05)
            pocket = (np.abs(x) < 0.11) & (y < 0) & (z > L["waist"] - 0.06) & (z < L["waist"] + 0.09) & (np.abs(x) < 0.11 - 0.6 * np.clip(z - L["waist"] - 0.03, 0, None))
            v = np.where(pocket, v * 0.92, v)
            edge = pocket & ~((np.abs(x) < 0.105 - 0.6 * np.clip(z - L["waist"] - 0.03, 0, None)) & (z > L["waist"] - 0.055) & (z < L["waist"] + 0.085))
            v = np.where(edge, v * 0.75, v)
            strings = (np.abs(np.abs(x) - 0.03) < 0.004) & (y < 0) & (z > L["chest_low"] + 0.06) & (z < L["collar"] - 0.005)
            a = np.ones(len(P))
            rgb = np.repeat(v[:, None], 3, 1)
            rgb[strings] = 0.93
            a[strings] = 0.0
            return out(v, a, rgb)
        return paint
    if piece == "top_jacket":
        def paint(P, region):
            x, y, z = P.T
            v = common(P, band=0.04, factor=0.8, scale=600, amp=0.03)
            quilt = 0.97 + 0.03 * np.sign(np.sin((z - L["waist"]) * 120))
            v *= np.where(np.abs(x) < L["shoulder_x"], quilt, 1.0)
            zipper = (np.abs(x) < 0.006) & (y < 0)
            pockets = (np.abs(np.abs(x) - 0.08) < 0.03) & (y < 0) & (np.abs(z - (L["waist"] + 0.04)) < 0.003)
            v = np.where(pockets, v * 0.7, v)
            a = np.ones(len(P))
            rgb = np.repeat(v[:, None], 3, 1)
            rgb[zipper] = np.array([0.72, 0.72, 0.7]) * (0.85 + 0.15 * (np.sin(z[zipper] * 900) > 0))[:, None]
            a[zipper] = 0.0
            return out(v, a, rgb)
        return paint
    if piece == "top_tee_print":
        base = tee_paint(L, body)

        def paint(P, region):
            o = base(P, region)
            x, y, z = P.T
            cz = L["chest_low"] + 0.03
            # stylised beer mug + "BAR" bars on the chest (fixed colours, a = 0)
            mug = (np.abs(x) < 0.045) & (y < 0) & (z > cz - 0.06) & (z < cz + 0.035)
            foam = (np.abs(x) < 0.05) & (y < 0) & (z >= cz + 0.035) & (z < cz + 0.06) & (np.sin(x * 220) * 0.006 + cz + 0.05 > z)
            handle = (y < 0) & (np.abs(np.hypot(x - 0.062, z - (cz - 0.012)) - 0.022) < 0.006)
            stripes = mug & (np.abs(((x + 0.045) % 0.03) - 0.015) < 0.003)
            o[mug, :3] = np.array([0.95, 0.68, 0.12])
            o[stripes, :3] = np.array([0.98, 0.82, 0.3])
            o[handle, :3] = np.array([0.95, 0.68, 0.12])
            o[foam, :3] = 0.97
            o[mug | foam | handle, 3] = 0.0
            return o
        return paint
    if piece == "bottom_shorts":
        jp_ = jeans_paint(L, joints, body)

        def paint(P, region):
            o = jp_(P, region)
            v = common(P, band=0.022, factor=0.88, scale=500, amp=0.03)
            o[:, :3] = np.minimum(o[:, :3], v[:, None]) * 0.5 + o[:, :3] * 0.5
            x, y, z = P.T
            cargo = (np.abs(x) > 0.16) & (z > L["thigh_mid"] - 0.0) & (z < L["thigh_mid"] + 0.12)
            o[cargo, :3] *= 0.92
            return o
        return paint
    if piece == "bottom_pants":
        top_z = L["waist"] + 0.012

        def paint(P, region):
            x, y, z = P.T
            v = 0.9 + 0.03 * np.sin((x + z) * 900) + 0.03 * (value_noise(P, 300) - 0.5)
            v = np.where(z > top_z - 0.03, v * 0.92, v)
            loops = (z > top_z - 0.03) & (np.abs(((np.arctan2(y, x) + np.pi) % 0.7) - 0.35) < 0.02)
            v = np.where(loops, v * 0.8, v)
            crease = (y < 0) & (np.abs(np.abs(x) - 0.105) < 0.0025) & (z < L["crotch"] - 0.05)
            v = np.where(crease, v * 0.88, v)
            return out(v)
        return paint
    raise KeyError(piece)


def uv_painter(piece, size_u, size_v):
    uu, vv = np.meshgrid((np.arange(size_u) + 0.5) / size_u, (np.arange(size_v) + 0.5) / size_v)
    u = (uu - 0.01) / 0.98
    v = (vv - 0.01) / 0.98
    rgb = np.ones((size_v, size_u, 3)) * 0.9 + np.random.default_rng(5).normal(0, 0.012, (size_v, size_u, 1))
    a = np.ones((size_v, size_u))
    if piece == "bottom_skirt":
        hem = v < 0.06
        rgb[hem] *= 0.85
        rgb[np.abs(v - 0.06) < 0.006] *= 0.75
        band = v > 0.9
        rgb[band] *= 0.9
        seams = np.abs(((u + 0.0) % 0.25) - 0.125) < 0.003
        rgb[seams] *= 0.85
    elif piece in ("footwear_shoes", "footwear_boots"):
        ang = v * 2 * np.pi - np.pi / 2
        h = np.sin(ang)
        sole = h < -0.5
        rgb[sole] = 0.22
        a[sole] = 0.0
        welt = np.abs(h + 0.5) < 0.05
        rgb[welt] = 0.35
        a[welt] = 0.0
        if piece == "footwear_boots":
            laces = (h > 0.75) & (u > 0.25) & (u < 0.6) & (np.sin(u * 2 * np.pi * 12) > 0.3)
            rgb[laces] = 0.15
            a[laces] = 0.0
            stitch = np.abs(u - 0.62) < 0.008
            rgb[stitch] *= 0.8
        else:
            apron = (h > 0.4) & (u > 0.7) & (np.abs(u - 0.7) < 0.01)
            rgb[apron] *= 0.75
        rgb *= (0.95 + 0.05 * np.random.default_rng(9).random((size_v, size_u, 1)))
    elif piece == "footwear_flipflops":
        sole = u < 0.5
        rgb[sole] = 0.85
        rgb[sole & (v < 0.2)] = 0.25
    return np.concatenate([np.clip(rgb, 0, 1), a[..., None]], 2)


def accessory_material(piece, metallic=0.0, roughness=0.5, lens=None):
    mats = []
    frame = bpy.data.materials.get(f"CharacterClothing-{piece}") or bpy.data.materials.new(f"CharacterClothing-{piece}")
    frame.use_nodes = True
    bsdf = next(n for n in frame.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*srgb_to_linear(DEFAULTS[piece]), 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    frame.diffuse_color = (*srgb_to_linear(DEFAULTS[piece]), 1)
    frame.use_backface_culling = False
    mats.append(frame)
    if lens:
        lm = bpy.data.materials.get(f"CharacterLens-{piece}") or bpy.data.materials.new(f"CharacterLens-{piece}")
        lm.use_nodes = True
        b = next(n for n in lm.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        b.inputs["Base Color"].default_value = (*srgb_to_linear(lens[:3]), 1)
        b.inputs["Alpha"].default_value = lens[3]
        b.inputs["Roughness"].default_value = 0.05
        lm.blend_method = "BLEND"
        lm.use_backface_culling = False
        lm.show_transparent_back = True
        mats.append(lm)
    return mats


SHELL_PIECES = ["top_shirt", "top_tank", "top_hoodie", "top_jacket", "bottom_shorts"]
VARIANTS = {"top_tee_print": "top_tee", "bottom_pants": "bottom_jeans"}
LOFTS = {"bottom_skirt": (512, 256, ("female",)), "footwear_shoes": (512, 256, ("male", "female")),
         "footwear_boots": (512, 256, ("male", "female")), "footwear_flipflops": (256, 128, ("male", "female"))}
ROUGH = {"top_jacket": 0.55, "footwear_shoes": 0.45, "footwear_boots": 0.5, "footwear_flipflops": 0.7}


def build():
    for body in ("male", "female"):
        _, _, _, _, joints = body_data(body)
        L = landmarks_for(joints)
        for piece in SHELL_PIECES:
            ob = bpy.data.objects[f"{piece}__{body}"]
            img = save_png(f"{piece}_{body}.png", rasterize(ob, 512, painter(piece, ob, L, joints, body)), 512)
            assign(ob, clothing_material(piece, img, DEFAULTS[piece], ROUGH.get(piece, 0.9), body=body))
        for variant, geo in VARIANTS.items():  # texture override files only; geometry is shared
            ob = bpy.data.objects[f"{geo}__{body}"]
            save_png(f"{variant}_{body}.png", rasterize(ob, 512, painter(variant, ob, L, joints, body)), 512)
    for piece, (su, sv, bodies) in LOFTS.items():
        img = save_png(f"{piece}.png", uv_painter(piece, su, sv), su, sv)
        mat = clothing_material(piece, img, DEFAULTS[piece], ROUGH.get(piece, 0.85), double_sided=piece in ("bottom_skirt", "footwear_flipflops"))
        for body in bodies:
            assign(bpy.data.objects[f"{piece}__{body}"], mat)
    hair = bpy.data.materials["CharacterHair"]
    for ob in bpy.data.objects:
        if ob.type == "MESH" and ob.name.split("__")[0].startswith(("hair_", "facial_")):
            assign(ob, hair)
    acc = {"accessory_glasses": dict(metallic=0.2, roughness=0.35, lens=(0.75, 0.85, 0.9, 0.22)),
           "accessory_sunglasses": dict(metallic=0.2, roughness=0.3, lens=(0.05, 0.06, 0.07, 0.86)),
           "accessory_cap": dict(roughness=0.85), "accessory_hat": dict(roughness=0.8),
           "accessory_bracelet": dict(metallic=0.9, roughness=0.3)}
    for piece, kw in acc.items():
        mats = accessory_material(piece, **kw)
        for body in ("male", "female"):
            ob = bpy.data.objects[f"{piece}__{body}"]
            idx = [p.material_index for p in ob.data.polygons]
            ob.data.materials.clear()  # also zeroes every polygon's material_index (lens faces use slot 1)
            for m in mats:
                ob.data.materials.append(m)
            ob.data.polygons.foreach_set("material_index", idx)
    print("catalogue materials ok")


build()
