"""Step 11 - textures + materials for the modular pieces (tint-mask contract, see s07).

Clothing textures: RGB = neutral detail (multiplied by the chosen colour where A = 1), A = 1 tintable fabric,
A = 0 fixed-colour parts (metal button, white sole/laces). Materials are named CharacterClothing-<piece_id>.
Pieces built from the body atlas UVs use 512 px textures in the same atlas layout.
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\s07_materials.py", encoding="utf-8").read().split("BROW_STYLES_NAMES = ")[0])
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\garment_lib.py", encoding="utf-8").read())

DEFAULTS = {"top_tee": (0.22, 0.365, 0.525), "bottom_jeans": (0.20, 0.27, 0.40), "footwear_sneakers": (0.53, 0.24, 0.22)}
RNG = np.random.default_rng(11)


def value_noise(P, scale, seed=0):
    """Cheap deterministic 3D noise for fabric detail."""
    k = np.array([12.9898, 78.233, 37.719]) * (seed + 1)
    g = np.floor(P * scale)
    h = np.sin(g @ k) * 43758.5453
    return h - np.floor(h)


def tee_paint(L, body):
    hem_z = L["waist"] - 0.045
    sleeve_x = L["ua_mid"] + 0.02

    def paint(P, region):
        x, y, z = P.T
        ax = np.abs(x)
        v = 0.93 + 0.04 * (value_noise(P, 400) - 0.5) + 0.02 * (value_noise(P, 90, 3) - 0.5)
        band = (z < hem_z + 0.018) | ((ax > sleeve_x - 0.016) & (ax > L["shoulder_x"] + 0.03))
        v = np.where(band, v * 0.86, v)
        rib = (z > L["collar"] - 0.006) & (ax < 0.09)
        v = np.where(rib, v * (0.80 + 0.05 * np.sin(x * 900)), v)
        seam = (np.abs(ax - (L["shoulder_x"] - 0.01)) < 0.004) & (z < L["chest_low"] + 0.12)
        v = np.where(seam, v * 0.85, v)
        rgb = np.repeat(v[:, None], 3, 1)
        return np.concatenate([rgb, np.ones((len(P), 1))], 1)
    return paint


def jeans_paint(L, joints, body):
    top_z = L["waist"] + 0.012
    legs = {}
    for side, S in ((1, "L"), (-1, "R")):
        legs[side] = (np.array(jp(joints, f"thigh.{S}", "head")), np.array(jp(joints, f"shin.{S}", "head")),
                      np.array(jp(joints, f"foot.{S}", "head")))

    def paint(P, region):
        x, y, z = P.T
        ax = np.abs(x)
        twill = 0.5 + 0.5 * np.sin((x * 0.7 + z) * 1400 + np.sign(x) * y * 400)
        v = 0.86 + 0.05 * twill + 0.04 * (value_noise(P, 300) - 0.5)
        v += 0.05 * np.clip(1 - np.abs(z - L["knee_z"]) / 0.12, 0, 1) * (y < 0)  # faded knees
        a = np.ones(len(P))
        rgb = np.repeat(v[:, None], 3, 1)
        # outseam: lateral side of each leg
        for side, (hip, knee, ankle) in legs.items():
            c, _ = seg_closest(P, hip, ankle)
            rel = P - c
            lat = rel[:, 0] * side / np.maximum(np.linalg.norm(rel[:, :2], axis=1), 1e-6)
            on = (np.sign(x) == side) & (z < L["crotch"] + 0.06) & (lat > 0.97)
            rgb[on] *= 0.78
        waistband = z > top_z - 0.035
        rgb[waistband] *= 0.9
        rgb[np.abs(z - (top_z - 0.035)) < 0.0025] *= 0.7
        fly = (ax < 0.012) & (y < 0) & (z > L["crotch"] + 0.02) & (z < top_z - 0.035) & (np.abs(ax - 0.010) < 0.0025)
        rgb[fly] *= 0.7
        pocket_f = (y < 0) & (np.abs(np.hypot(ax - 0.13, z - (top_z - 0.01)) - 0.075) < 0.003) & (ax < 0.13) & (z < top_z - 0.035)
        rgb[pocket_f] *= 0.72
        bp = (y > 0.04) & (ax > 0.035) & (ax < 0.125) & (z < top_z - 0.06) & (z > top_z - 0.20)
        edge = bp & ((np.abs(ax - 0.035) < 0.004) | (np.abs(ax - 0.125) < 0.004) | (np.abs(z - (top_z - 0.06)) < 0.004)
                     | (np.abs(z - (top_z - 0.20) - 0.4 * np.abs(ax - 0.08)) < 0.004))
        rgb[edge] = np.array([0.95, 0.85, 0.6]) * 0.9  # stitching (keeps tint where a = 1)
        button = (ax < 0.009) & (y < 0) & (np.abs(z - (top_z - 0.017)) < 0.009)
        rgb[button] = np.array([0.72, 0.52, 0.30])
        a[button] = 0.0
        return np.concatenate([rgb, a[:, None]], 1)
    return paint


def sneaker_paint_uv(size_u=512, size_v=256):
    """Painted directly in the loft UV space: u heel->toe, v around the section (0 = bottom centre)."""
    uu, vv = np.meshgrid((np.arange(size_u) + 0.5) / size_u, (np.arange(size_v) + 0.5) / size_v)
    u = (uu - 0.01) / 0.98
    v = (vv - 0.01) / 0.98
    ring_angle = v * 2 * np.pi - np.pi / 2
    height = np.sin(ring_angle)  # -1 bottom, +1 top
    rgb = np.ones((size_v, size_u, 3)) * 0.9
    a = np.ones((size_v, size_u))
    noise = np.random.default_rng(3).normal(0, 0.015, (size_v, size_u))
    rgb += noise[..., None]
    sole = height < -0.45
    rgb[sole] = 0.96
    a[sole] = 0.0
    sole_line = np.abs(height + 0.45) < 0.05
    rgb[sole_line] = 0.55
    a[sole_line] = 0.0
    side_stripe = (np.abs(np.abs(height) - 0.05) < 0.08) & (u > 0.35) & (u < 0.78) & (np.cos(ring_angle) != 0)
    rgb[side_stripe] = 0.97
    a[side_stripe] = 0.0
    laces = (height > 0.86) & (u > 0.38) & (u < 0.74) & (np.sin(u * 2 * np.pi * 14) > 0.2)
    rgb[laces] = 0.98
    a[laces] = 0.0
    toe_cap = (u > 0.88) & (height > -0.45)
    rgb[toe_cap] *= 0.9
    heel_tab = (u < 0.06) & (height > 0.3)
    rgb[heel_tab] *= 0.75
    img = np.concatenate([np.clip(rgb, 0, 1), a[..., None]], 2)
    return img


def clothing_material(piece, img, default, roughness, double_sided=True, body=None):
    """Per-body textures need per-body materials in Blender (suffix __<body> is stripped on export)."""
    name = f"CharacterClothing-{piece}" + (f"__{body}" if body else "")
    mat = principled_material(name, img, (1, 1, 1), roughness=roughness)
    tex = next(n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE")
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    mix = mat.node_tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    mat.node_tree.links.new(tex.outputs["Color"], mix.inputs[6])
    mix.inputs[7].default_value = (*srgb_to_linear(default), 1.0)
    mat.node_tree.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    mat.use_backface_culling = not double_sided
    mat.diffuse_color = (*srgb_to_linear(default), 1.0)
    return mat


def build_piece_materials():
    hair = bpy.data.materials["CharacterHair"]
    hair.use_backface_culling = False
    for body in ("male", "female"):
        _, _, _, _, joints = body_data(body)
        L = landmarks_for(joints)
        tee = bpy.data.objects[f"top_tee__{body}"]
        img = save_png(f"top_tee_{body}.png", rasterize(tee, 512, tee_paint(L, body)), 512)
        assign(tee, clothing_material("top_tee", img, DEFAULTS["top_tee"], 0.9, body=body))
        jeans = bpy.data.objects[f"bottom_jeans__{body}"]
        img = save_png(f"bottom_jeans_{body}.png", rasterize(jeans, 512, jeans_paint(L, joints, body)), 512)
        assign(jeans, clothing_material("bottom_jeans", img, DEFAULTS["bottom_jeans"], 0.85, body=body))
        assign(bpy.data.objects[f"hair_short__{body}"], hair)
    im = save_png("footwear_sneakers.png", sneaker_paint_uv(), 512, 256)
    mat = clothing_material("footwear_sneakers", im, DEFAULTS["footwear_sneakers"], 0.6, double_sided=False)
    for body in ("male", "female"):
        assign(bpy.data.objects[f"footwear_sneakers__{body}"], mat)
    for name in ("CharacterSkin__male", "CharacterSkin__female", "CharacterEyes"):
        bpy.data.materials[name].use_backface_culling = True
    print("piece materials ok")


build_piece_materials()
