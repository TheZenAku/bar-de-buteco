"""Step 07 - textures and glTF-safe materials for bodies, eyes and brows.

Texture contract (all baseColor textures are sRGB PNG, OPAQUE materials; alpha is a tint mask, not opacity):
  skin_<body>.png  RGB = neutral detail (lips, nails, lid line, baked AO)  A = 1 skin / 0 base outfit (underwear)
  eye_v2.png       RGB = sclera/iris/pupil detail                          A = 1 iris (tinted by eye colour)
  hair_v2.png      RGB = light grey strand detail, tinted by hair colour   A = 1
Material names (exported): CharacterSkin, CharacterEyes, CharacterHair.
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\s04_rig.py", encoding="utf-8").read().split("RIGS = {}")[0])

TEX_DIR = os.path.join(EXPORT, "textures")
os.makedirs(TEX_DIR, exist_ok=True)
DEFAULT_SKIN = (0.81, 0.576, 0.427)   # '#cf936d' (game default skin tone)
DEFAULT_HAIR = (0.286, 0.192, 0.149)  # '#493126'


def srgb_to_linear(c):
    c = np.asarray(c, float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


# ------------------------------------------------------------------ rasteriser
def rasterize(ob, size, paint):
    """Evaluate paint(points (N,3), region (N,)) -> rgba (N,4) for every texel covered by the mesh UVs."""
    me = ob.data
    me.calc_loop_triangles()
    V = mesh_arrays(me)
    uvs = np.zeros(len(me.loops) * 2)
    me.uv_layers.active.data.foreach_get("uv", uvs)
    uvs = uvs.reshape(-1, 2) * size
    reg = np.zeros(len(me.polygons), dtype=np.int32)
    if "region" in me.attributes:
        me.attributes["region"].data.foreach_get("value", reg)
    img = np.zeros((size, size, 4))
    filled = np.zeros((size, size), bool)
    for lt in me.loop_triangles:
        tri_uv = uvs[list(lt.loops)]
        tri_p = V[list(lt.vertices)]
        x0, y0 = np.floor(tri_uv.min(0)).astype(int)
        x1, y1 = np.ceil(tri_uv.max(0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, size - 1), min(y1, size - 1)
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        P = np.stack([xs.ravel(), ys.ravel()], 1)
        a, b, c = tri_uv
        v0, v1 = b - a, c - a
        den = v0[0] * v1[1] - v1[0] * v0[1]
        if abs(den) < 1e-12:
            continue
        d = P - a
        w1 = (d[:, 0] * v1[1] - v1[0] * d[:, 1]) / den
        w2 = (v0[0] * d[:, 1] - d[:, 0] * v0[1]) / den
        w0 = 1 - w1 - w2
        inside = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
        if not inside.any():
            continue
        W = np.stack([w0, w1, w2], 1)[inside]
        pts = W @ tri_p
        px = (P[inside] - 0.5).astype(int)
        col = paint(pts, np.full(len(pts), reg[lt.polygon_index]))
        img[px[:, 1], px[:, 0]] = col
        filled[px[:, 1], px[:, 0]] = True
    return dilate(img, filled, 6)


def dilate(img, filled, steps):
    img, filled = img.copy(), filled.copy()
    for _ in range(steps):
        acc = np.zeros_like(img)
        cnt = np.zeros(filled.shape)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            f = np.roll(np.roll(filled, dy, 0), dx, 1)
            acc += np.roll(np.roll(img, dy, 0), dx, 1) * f[..., None]
            cnt += f
        grow = (~filled) & (cnt > 0)
        img[grow] = acc[grow] / cnt[grow][:, None]
        filled |= grow
    return img


def save_png(name, rgba, size, height=None):
    """Always a fresh datablock: writing pixels into an image already loaded from a file left its buffer
    unchanged in Blender 4.0.2 and save() re-wrote the stale content."""
    path = os.path.join(TEX_DIR, name)
    height = height or size
    old = bpy.data.images.get(name)
    if old:
        old.name = name + "_stale"
        bpy.data.images.remove(old)
    im = bpy.data.images.new(name, size, height, alpha=True)
    im.pixels.foreach_set(np.clip(rgba, 0, 1).astype(np.float32).ravel())
    im.filepath_raw = path
    im.file_format = "PNG"
    im.alpha_mode = "STRAIGHT"
    im.save()
    im.filepath = path
    im.reload()
    return im


# ------------------------------------------------------------------ skin
def skin_painter(body, joints):
    jpos = lambda b, e: np.array(jp(joints, b, e))
    crotch_z = jpos("thigh.L", "head")[2] - 0.075
    waist_top = jpos("spine", "head")[2] + (0.035 if body == "male" else 0.025)
    eye_l, eye_r = jpos("eye.L", "head"), jpos("eye.R", "head")
    lips = np.mean([jpos(n, "head") for n in ("lip.T.L", "lip.T.R", "lip.B.L", "lip.B.R")], 0)
    breast = jpos("breast.L", "head")

    def paint(P, region):
        n = len(P)
        rgb = np.ones((n, 3)) * 0.97
        a = np.ones(n)
        x, y, z = P[:, 0], P[:, 1], P[:, 2]
        ax = np.abs(x)
        # briefs: waist band down to a leg opening that rises towards the hips
        leg_line = crotch_z + 0.55 * np.clip(ax - 0.015, 0, None) * (1.0 if body == "male" else 1.25)
        briefs = (z < waist_top) & (z > leg_line - 0.01) & (ax < 0.24) & (z > crotch_z - 0.04)
        if body == "female":
            under = breast[2] - 0.055
            top_front = breast[2] + 0.045
            band = (z > under) & (z < top_front) & (y < breast[1] + 0.03) & (ax < 0.2)
            back_band = (z > under) & (z < under + 0.04) & (y >= breast[1] + 0.03) & (ax < 0.2)
            straps = (np.abs(ax - 0.085) < 0.011) & (z > top_front - 0.01) & (z < jpos("shoulder.L", "tail")[2] + 0.04) & (ax < 0.15)
            bra = (band | back_band | straps) & (region == 1)
            briefs |= bra
        a[briefs] = 0.0
        seam = briefs & ((np.abs(z - waist_top) < 0.008) | (np.abs(z - leg_line) < 0.006))
        rgb[seam] *= 0.82
        # lips
        d = ((x - lips[0]) / 0.026) ** 2 + ((z - lips[2]) / 0.010) ** 2
        lip = (d < 1.0) & (y < lips[1] + 0.02) & (region == 0)
        rgb[lip] *= np.array([0.86, 0.66, 0.66]) if body == "female" else np.array([0.90, 0.74, 0.72])
        # lid line around the eye openings
        for e in (eye_l, eye_r):
            r = np.sqrt(((x - e[0]) / 1.25) ** 2 + (z - e[2]) ** 2)
            lid = (r > 0.0105) & (r < 0.0145) & (y < e[1] + 0.006) & (region == 0)
            upper = lid & (z > e[2] - 0.002)
            rgb[upper] *= 0.55 if body == "female" else 0.68
            rgb[lid & ~upper] *= 0.86
        # nails
        rgb[region == 4] = np.array([1.0, 0.93, 0.91])
        return np.concatenate([rgb, a[:, None]], 1)

    return paint


def bake_ao(ob, size):
    name = f"_ao_{ob.name}"
    im = bpy.data.images.get(name) or bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    mat = bpy.data.materials.new(f"_bake_{ob.name}")
    mat.use_nodes = True
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = im
    mat.node_tree.nodes.active = node
    old_mats = list(ob.data.materials)
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    scene = bpy.context.scene
    prev_engine = scene.render.engine
    try:
        scene.render.engine = "CYCLES"
    except TypeError as e:
        raise RuntimeError(f"Cycles unavailable for AO bake: {e}")
    scene.cycles.samples = 48
    scene.render.bake.margin = 8
    # occluders: only this body and its own eyes (other bodies stand within arm's reach in the scene)
    keep = {ob.name, f"BAR_Eyes__{ob.get('bar_body')}"}
    hidden = [o for o in scene.objects if o.type == "MESH" and o.name not in keep and not o.hide_render]
    for o in hidden:
        o.hide_render = True
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.hide_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    try:
        bpy.ops.object.bake(type="AO", use_clear=True, margin=8)
    finally:
        for o in hidden:
            o.hide_render = False
        scene.render.engine = prev_engine
    ob.data.materials.clear()
    for m in old_mats:
        ob.data.materials.append(m)
    bpy.data.materials.remove(mat)
    ao = np.array(im.pixels[:]).reshape(size, size, 4)[..., 0]
    bpy.data.images.remove(im)
    return ao


def principled_material(name, image, base_factor, roughness=0.8, metallic=0.0, alpha_blend=None):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    bsdf.inputs["Base Color"].default_value = (*srgb_to_linear(base_factor), 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if image is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = image
        tex.interpolation = "Linear"
        if any(abs(c - 1.0) > 1e-4 for c in base_factor):
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs[0].default_value = 1.0
            nt.links.new(tex.outputs["Color"], mix.inputs[6])
            mix.inputs[7].default_value = (*srgb_to_linear(base_factor), 1.0)
            nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
        else:
            nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if alpha_blend is not None:
        bsdf.inputs["Alpha"].default_value = alpha_blend
        mat.blend_method = "BLEND"
    mat.diffuse_color = (*srgb_to_linear(base_factor), 1.0)
    return mat


def assign(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)


# ------------------------------------------------------------------ eyes / hair
def eye_texture(size=256):
    yy, xx = np.mgrid[0:size, 0:size]
    u = (xx + 0.5) / size * 2 - 1
    v = (yy + 0.5) / size * 2 - 1
    r = np.sqrt(u * u + v * v)
    ang = np.arctan2(v, u)
    rgb = np.ones((size, size, 3)) * np.array([0.95, 0.94, 0.92])
    a = np.zeros((size, size))
    iris_r, pupil_r = 0.52, 0.19
    iris = r < iris_r
    streak = 0.86 + 0.14 * np.sin(ang * 23) * np.sin(ang * 7 + r * 20)
    shade = np.clip(1.05 - 0.55 * (r / iris_r) ** 3, 0.5, 1.0)
    rgb[iris] = (np.ones(3) * (streak * shade)[..., None])[iris]
    rgb[iris & (r > iris_r - 0.05)] *= 0.45  # limbal ring
    a[iris] = 1.0
    rgb[r < pupil_r] = 0.03
    a[r < pupil_r] = 0.0
    hl = np.sqrt((u + 0.17) ** 2 + (v - 0.2) ** 2) < 0.08
    rgb[hl] = 0.98
    a[hl] = 0.0
    sclera_shadow = np.clip((r - 0.75) / 0.25, 0, 1)
    rgb[~iris] *= (1 - 0.25 * sclera_shadow[..., None])[~iris]
    return np.concatenate([rgb, a[..., None]], 2)


def hair_texture(size=512, seed=7):
    rng = np.random.default_rng(seed)
    cols = rng.normal(0, 1, size)
    for _ in range(3):
        cols = (np.roll(cols, 1) + cols + np.roll(cols, -1)) / 3
    fine = rng.normal(0, 1, (size, size)) * 0.04
    yy = np.linspace(0, 1, size)[:, None]
    strands = 0.80 + 0.12 * cols[None, :] / np.abs(cols).max() + fine
    strands *= 0.92 + 0.08 * np.sin(yy * 40 + cols[None, :] * 3)
    g = np.clip(strands, 0.55, 1.0)
    rgb = np.repeat(g[..., None], 3, 2)
    return np.concatenate([rgb, np.ones((size, size, 1))], 2)


def build_all():
    eye_img = save_png("eye_v2.png", eye_texture(), 256)
    hair_img = save_png("hair_v2.png", hair_texture(), 512)
    mats = {"eyes": principled_material("CharacterEyes", eye_img, (1, 1, 1), roughness=0.25),
            "hair": principled_material("CharacterHair", hair_img, DEFAULT_HAIR, roughness=0.7)}
    for body in ("female", "male"):
        shape = np.load(os.path.join(CACHE, f"{body}.npy"))
        joints = compute_joints(shape)
        ob = bpy.data.objects[f"BAR_Body_{body.capitalize()}"]
        size = 1024
        paint = rasterize(ob, size, skin_painter(body, joints))
        ao = bake_ao(ob, size)
        ao = 0.55 + 0.45 * np.clip(ao, 0, 1) ** 0.8
        paint[..., :3] *= ao[..., None]
        img = save_png(f"skin_{body}.png", paint, size)
        skin = principled_material(f"CharacterSkin__{body}", img, (1, 1, 1), roughness=0.72)
        assign(ob, skin)
        assign(bpy.data.objects[f"BAR_Eyes__{body}"], mats["eyes"])
        for style in BROW_STYLES_NAMES:
            assign(bpy.data.objects[f"BAR_Brows_{style}__{body}"], mats["hair"])
        print(body, "skin texture", img.filepath)
    return mats


BROW_STYLES_NAMES = ("regular", "thin", "thick")
MATS = build_all()
