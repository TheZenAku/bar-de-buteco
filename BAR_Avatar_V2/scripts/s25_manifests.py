"""Step 25 - manifests (export/manifests/*.json) and export/validation/export-report.json.

Run headless on the saved master; nothing is saved:
  blender -b source/BAR_Avatar_V2_master.blend --python scripts/s25_manifests.py
Inputs: the exported GLB/PNG files themselves, validation/validation-report.json (independent validator),
validation/animation-report-blender.json, source/cache/{compat_measurements,face_presets,body_regions}.json,
the material defaults written in s07/s11/s21 and the master scene (piece metadata, coverage ray casts).
Every path written to the manifests is relative to the export root (the folder that contains manifests/).
"""
exec(open(r"C:\Users\rafael\BAR_Avatar_V2\scripts\bar_lib.py", encoding="utf-8").read())
exec(open(os.path.join(ROOT, "scripts", "glb_tools.py"), encoding="utf-8").read())
import ast
import hashlib
import datetime
from collections import defaultdict

CATALOG_VERSION = "2.0.0"
SCHEMA = "bar-avatar-v2"
BODIES = ("male", "female")
CATEGORY = {"hair": "HAIR", "facial": "FACIAL_HAIR", "top": "TOP", "bottom": "BOTTOM", "footwear": "FOOTWEAR", "accessory": "ACCESSORY"}
FOLDER = {"hair": "hair", "facial": "facial_hair", "top": "tops", "bottom": "bottoms", "footwear": "footwear", "accessory": "accessories"}
SLOT = {"hair": "hair", "facial": "facialHair", "top": "top", "bottom": "bottom", "footwear": "footwear", "accessory": "accessory"}
COLOR_FIELD = {"hair": "hairColor", "facial": "hairColor", "top": "topColor", "bottom": "bottomColor",
               "footwear": "footwearColor", "accessory": "accessoryColor"}
NAMES = {
    "top_tee": "Camiseta básica", "top_tee_print": "Camiseta estampada", "top_shirt": "Camisa casual", "top_tank": "Regata",
    "top_hoodie": "Moletom", "top_jacket": "Jaqueta",
    "bottom_jeans": "Calça jeans", "bottom_pants": "Calça casual", "bottom_shorts": "Shorts", "bottom_skirt": "Saia",
    "footwear_sneakers": "Tênis", "footwear_shoes": "Sapato casual", "footwear_boots": "Bota", "footwear_flipflops": "Chinelo",
    "hair_short": "Cabelo curto", "hair_buzzed": "Cabelo raspado", "hair_parted": "Cabelo repartido", "hair_medium": "Cabelo médio",
    "hair_long": "Cabelo longo", "hair_ponytail": "Cabelo preso (rabo de cavalo)", "hair_bun": "Coque", "hair_wavy": "Cabelo ondulado",
    "facial_beard_short": "Barba curta", "facial_beard_full": "Barba cheia", "facial_goatee": "Cavanhaque", "facial_mustache": "Bigode",
    "accessory_glasses": "Óculos", "accessory_sunglasses": "Óculos escuros", "accessory_cap": "Boné", "accessory_hat": "Chapéu",
    "accessory_bracelet": "Pulseira",
}
MATERIAL_CATEGORY = {
    "top_tee": "Fabric", "top_tee_print": "Fabric", "top_shirt": "Fabric", "top_tank": "Fabric", "top_hoodie": "Fabric",
    "top_jacket": "Fabric", "bottom_jeans": "Denim", "bottom_pants": "Fabric", "bottom_shorts": "Fabric", "bottom_skirt": "Fabric",
    "footwear_sneakers": "Fabric", "footwear_shoes": "Leather", "footwear_boots": "Leather", "footwear_flipflops": "Rubber",
    "accessory_glasses": "Metal", "accessory_sunglasses": "Metal", "accessory_cap": "Fabric", "accessory_hat": "Fabric",
    "accessory_bracelet": "Metal",
}
VARIANTS = {"top_tee_print": "top_tee", "bottom_pants": "bottom_jeans"}  # texture-only variants (shared geometry)
CLIP_ALIASES = {"SeatedIdle": "Sit", "Interact": "Use", "Faint": "Fallen"}
SOCKET_PURPOSE = {
    "socket_hand_l": "mão esquerda (objetos segurados)", "socket_hand_r": "mão direita (objetos segurados, bengala)",
    "socket_palm_l": "centro da palma esquerda", "socket_palm_r": "centro da palma direita",
    "socket_head_top": "fixação de chapéu/boné", "socket_glasses": "fixação de óculos", "socket_mouth": "boca (copo/garrafa)",
    "socket_eye_l": "olho esquerdo", "socket_eye_r": "olho direito", "socket_hip": "referência do quadril",
    "socket_foot_l": "referência do pé esquerdo", "socket_foot_r": "referência do pé direito",
    "socket_wrist_l": "pulso esquerdo (pulseira)", "socket_wrist_r": "pulso direito",
}
REQUIRES_TOP = {"bottom_skirt"}
REGION_RULES = [{"region": "waist", "hideWhen": {"allOf": ["TOP", "BOTTOM"]},
                 "reason": "faixa de faces que cruza a barra das blusas e o cós das calças/saia no corpo decimado: "
                           "nenhuma das duas cobre sozinha; juntas cobrem (medido por raios em cantos e centro)"}]
SOCK_PIECES = {"footwear_sneakers": "meia branca", "footwear_shoes": "meia escura"}
FLOOR_TOLERANCE = 0.025  # body mesh may dip this much (heel/toe corners rolling on the floor); lying clips sit at >= 0
VAL = os.path.join(EXPORT, "validation")
MAN = os.path.join(EXPORT, "manifests")
TODAY = datetime.date.today().isoformat()


def load(p):
    return json.load(open(p, encoding="utf-8"))


REPORT = load(os.path.join(VAL, "validation-report.json"))
RAW = {r["file"]: r for r in REPORT["raw_gltf"]}
ANIM_BLENDER = {a["action"]: a for a in load(os.path.join(VAL, "animation-report-blender.json"))}
COMPAT = load(os.path.join(CACHE, "compat_measurements.json"))
FACES = load(os.path.join(CACHE, "face_presets.json"))
REGIONS = load(os.path.join(CACHE, "body_regions.json"))["regions"]


# ------------------------------------------------------------------ small readers
def defaults():
    """Default (sRGB) colours exactly as written by the material steps."""
    d = {}
    for fn in ("s11_piece_materials.py", "s21_catalog_materials.py"):
        tree = ast.parse(open(os.path.join(ROOT, "scripts", fn), encoding="utf-8").read())
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == "DEFAULTS" for t in node.targets):
                d.update(ast.literal_eval(node.value))
            if (isinstance(node, ast.Call) and getattr(node.func, "attr", None) == "update"
                    and getattr(node.func.value, "id", None) == "DEFAULTS"):
                d.update(ast.literal_eval(node.args[0]))
    tree = ast.parse(open(os.path.join(ROOT, "scripts", "s07_materials.py"), encoding="utf-8").read())
    for node in tree.body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", None) in ("DEFAULT_SKIN", "DEFAULT_HAIR"):
            d[node.targets[0].id] = ast.literal_eval(node.value)
    return d


def hexc(c):
    return "#%02x%02x%02x" % tuple(int(round(max(0.0, min(1.0, x)) * 255)) for x in c[:3])


CT = {5120: "<i1", 5121: "<u1", 5122: "<i2", 5123: "<u2", 5125: "<u4", 5126: "<f4"}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def acc(js, bin_, i):
    a = js["accessors"][i]
    v = js["bufferViews"][a["bufferView"]]
    dt = np.dtype(CT[a["componentType"]])
    n = NC[a["type"]]
    item = dt.itemsize * n
    stride = v.get("byteStride", item)
    start = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    raw = bytes(bin_[start:start + stride * (a["count"] - 1) + item])
    if stride == item:
        return np.frombuffer(raw, dtype=dt).reshape(a["count"], n)
    return np.stack([np.frombuffer(raw[k * stride:k * stride + item], dtype=dt) for k in range(a["count"])])


def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def node_world(js):
    nodes = js["nodes"]
    parent = {c: i for i, nd in enumerate(nodes) for c in nd.get("children", [])}
    local = []
    for nd in nodes:
        if "matrix" in nd:
            local.append(np.array(nd["matrix"]).reshape(4, 4).T)
            continue
        M = np.eye(4)
        M[:3, :3] = quat_mat(nd.get("rotation", [0, 0, 0, 1])) @ np.diag(nd.get("scale", [1, 1, 1]))
        M[:3, 3] = nd.get("translation", [0, 0, 0])
        local.append(M)
    world = {}

    def w(i):
        if i not in world:
            world[i] = (w(parent[i]) @ local[i]) if i in parent else local[i]
        return world[i]

    for i in range(len(nodes)):
        w(i)
    return world, parent


def png_size(path):
    with open(path, "rb") as fh:
        head = fh.read(24)
    return list(struct.unpack(">II", head[16:24]))


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


r3 = lambda v: [round(float(x), 4) for x in v]


# ------------------------------------------------------------------ measurements from the exported files
def rig_data(body):
    """Joints and sockets of the exported rig GLB (glTF space: +Y up, metres)."""
    js, _ = read_glb(os.path.join(EXPORT, "rigs", f"bar_humanoid_v2_{body}.glb"))
    world, parent = node_world(js)
    names = [n.get("name") for n in js["nodes"]]
    skin = js["skins"][0]
    joints = [names[j] for j in skin["joints"]]
    jset = set(joints)
    arm = [i for i, n in enumerate(names) if n == RIG_ID]
    bones = []
    for k, j in enumerate(skin["joints"]):
        nd = js["nodes"][j]
        bones.append({"index": k, "name": names[j], "parent": names[parent[j]] if parent.get(j) is not None and names[parent[j]] in jset else None,
                      "restLocal": {"translation": r3(nd.get("translation", [0, 0, 0])), "rotation": r3(nd.get("rotation", [0, 0, 0, 1]))},
                      "restWorldPosition": r3(world[j][:3, 3])})
    sockets = []
    for i, n in enumerate(names):
        if n and n.startswith("socket_"):
            R = world[i][:3, :3]
            sockets.append({"name": n, "parentBone": names[parent[i]], "restWorldPosition": r3(world[i][:3, 3]),
                            "localTranslation": r3(js["nodes"][i].get("translation", [0, 0, 0])),
                            "restWorldRotationIsIdentity": bool(np.abs(R - np.eye(3)).max() < 1e-4)})
    pos = {b["name"]: np.array(b["restWorldPosition"]) for b in bones}
    return {"armature_nodes": len(arm), "joints": joints, "bones": bones, "sockets": sorted(sockets, key=lambda s: s["name"]), "pos": pos}


def body_mesh_data(body):
    """Height and the region attribute (TEXCOORD_1) read back from bodies/<body>.glb."""
    js, bin_ = read_glb(os.path.join(EXPORT, "bodies", f"{body}.glb"))
    node = next(n for n in js["nodes"] if n.get("name") == "BAR_Body")
    prim = js["meshes"][node["mesh"]]["primitives"][0]
    P = acc(js, bin_, prim["attributes"]["POSITION"])
    uv1 = acc(js, bin_, prim["attributes"]["TEXCOORD_1"])
    idx = acc(js, bin_, prim["indices"]).reshape(-1, 3)
    reg = np.floor(uv1[:, 0] * 32).astype(int)
    tri_reg = reg[idx]
    uniform = bool((tri_reg == tri_reg[:, :1]).all())
    per_region = np.bincount(tri_reg[:, 0], minlength=len(REGIONS))
    return {"height_m": round(float(P[:, 1].max() - P[:, 1].min()), 4), "floor_y_m": round(float(P[:, 1].min()), 4),
            "region_check": {"triangles": int(len(idx)), "per_triangle_uniform": uniform,
                             "v_is_half": bool(np.allclose(uv1[:, 1], 0.5, atol=1e-4)),
                             "ids_in_range": bool(reg.min() >= 0 and reg.max() < len(REGIONS)),
                             "triangles_per_region": {REGIONS[i]: int(c) for i, c in enumerate(per_region[:len(REGIONS)])}}}


def coverage(body):
    """Fraction of each body region (by area) whose outward normal ray meets the piece within 15 cm (rest pose)."""
    bo = bpy.data.objects[f"BAR_Body_{body.capitalize()}"]
    me = bo.data
    uv = me.uv_layers["UVRegion"].data
    mw = bo.matrix_world
    nm = mw.to_3x3().inverted().transposed()
    faces = [(int(uv[p.loop_start].uv[0] * 32), mw @ p.center, (nm @ p.normal).normalized(), p.area) for p in me.polygons]
    total = defaultdict(float)
    for r, _, _, a in faces:
        total[r] += a
    out = {}
    for o in bpy.data.objects:
        if o.type != "MESH" or not o.name.endswith(f"__{body}") or o.name.split("_")[0] not in CATEGORY:
            continue
        pid = o.name[: -len(body) - 2]
        V = [o.matrix_world @ v.co for v in o.data.vertices]
        bvh = BVHTree.FromPolygons(V, [tuple(p.vertices) for p in o.data.polygons])
        hit = defaultdict(float)
        for r, c, n, a in faces:
            if bvh.ray_cast(c + n * 0.001, n, 0.15)[0] is not None:
                hit[r] += a
        out[pid] = {REGIONS[r]: round(hit[r] / total[r], 2) for r in sorted(hit) if hit[r] / total[r] >= 0.02}
    return out


# ------------------------------------------------------------------ validation states
def piece_validation(pid, body, path):
    raw = RAW.get(path)
    reimp = REPORT["blender_reimport"][body]
    checks = reimp["checks"]
    errors = [e for e in reimp["errors"] if e.startswith(pid + ":")] + (raw["errors"] if raw else ["file missing"])
    in_reimport = pid in checks.get("pieces", {}) or pid in checks.get("accessories_on_sockets", {})
    skin = COMPAT["bodies"][body]["skin"].get(pid)
    warnings = []
    if pid in REQUIRES_TOP:  # only valid with a top: measured with the 'waist' band hidden, as worn
        alone = skin
        skin = COMPAT["bodies"][body]["skin_with_top"].get(pid, skin)
        warnings.append(f"exige uma peça TOP: sozinha a faixa 'waist' fica visível e atravessa o cós "
                        f"({alone['worst_standing']} pares em pé)")
    if skin and skin["status"] == "minor_clipping":
        warnings.append(f"interseção com pele visível: até {skin['worst_standing']} pares de triângulos em pé "
                        f"({', '.join(k for k, v in skin['per_pose'].items() if v > 10 and k != 'Sit')})")
    if skin and skin["status"] == "by_design":
        warnings.append(skin.get("note", "by design"))
    if skin and skin["seated"] > 10:
        warnings.append(f"sentado (Sit): {skin['seated']} pares contra a pele (limite de skinning linear)")
    blender = "failed" if skin and skin["status"] == "blocked" else "approved" if skin else "not_tested"
    tests_b = ["pesos normalizados <= 4 influências (export)", "interseção contra pele visível em rest/Walk/Sit/Dance/Drink/Wave"
               + (" (com TOP: 'waist' oculto)" if pid in REQUIRES_TOP else "")]
    tests_g = ["leitura do GLB (acessores, pesos, morphs, materiais, URIs)", "reimportação em cena limpa (--factory-startup)"]
    if pid in checks.get("pieces", {}):
        tests_g.append("montada no esqueleto único do corpo; juntas de repouso idênticas (dif. 0 m)")
    if pid in checks.get("accessories_on_sockets", {}):
        a = checks["accessories_on_sockets"][pid]
        tests_g.append(f"fixada em {a['socket']}; erro máx. do centro vs master {a['max_center_error_m'] * 1000:.2f} mm em rest/Walk/Dance")
    gltf = "failed" if errors else "approved" if in_reimport else "not_tested"
    state = "failed" if "failed" in (blender, gltf) else "approved_gltf_reimport" if gltf == "approved" else "approved_blender"
    return {"state": state, "blender": blender, "gltfReimport": gltf, "playcanvas": "pending",
            "testsBlender": tests_b, "testsGltf": tests_g, "warnings": warnings, "errors": errors}


# ------------------------------------------------------------------ catalog
def materials_for(pid, cat, raw, dflt, variant_of=None):
    out = []
    for m in raw["materials"]:
        name = m["name"]
        e = {"name": name, "alphaMode": m["alphaMode"], "doubleSided": m["doubleSided"]}
        if name.startswith("CharacterLens-"):
            e.update(role="lens", category="Glass", configurable=False,
                     note="cor e transparência fixas (BLEND); não aplicar cor do jogador (mesma regra do legado)")
        elif name == "CharacterHair":
            e.update(role="hair", category="Hair", configurable=True, colorField="hairColor", rule="albedo = tex.rgb * hairColor",
                     shader="diffuse padrão do PlayCanvas (material.diffuse multiplica o mapa)", defaultColor=hexc(dflt["DEFAULT_HAIR"]),
                     texture="textures/hair_v2.png")
        else:
            textured = m["baseColorTexture"]
            key = variant_of or pid
            e.update(role="clothing", category=MATERIAL_CATEGORY.get(key, "Fabric"), configurable=True, colorField=COLOR_FIELD[cat],
                     defaultColor=hexc(dflt[key]) if key in dflt else None)
            if textured:
                e.update(rule="albedo = tex.rgb * mix(vec3(1.0), color, tex.a)",
                         shader="chunk diffusePS 'clothing' (INTEGRATION_CODEX §8); A=1 tecido tingível, A=0 partes de cor fixa",
                         texture="embedded" if not variant_of else f"textures/{pid}_{{body}}.png (override do baseColor)")
            else:
                e.update(rule="albedo = color", shader="diffuse padrão (sem textura)", metallic=m.get("metallic"))
        out.append(e)
    return out


def build():
    dflt = defaults()
    rigs = {b: rig_data(b) for b in BODIES}
    bodies_mesh = {b: body_mesh_data(b) for b in BODIES}
    cover = {b: coverage(b) for b in BODIES}
    meta = {}
    for o in bpy.data.objects:
        for b in BODIES:
            if o.type == "MESH" and o.name.endswith(f"__{b}") and o.name.split("_")[0] in CATEGORY:
                meta[(o.name[: -len(b) - 2], b)] = o
    pieces = {}
    for (pid, b), ob in sorted(meta.items()):
        cat = pid.split("_")[0]
        path = f"{FOLDER[cat]}/{pid}_{b}.glb"
        raw = RAW[path]
        rigid = cat == "accessory"
        hides = [h for h in str(ob.get("bar_hides", "")).split(",") if h]
        deps = sorted({os.path.normpath(os.path.join(FOLDER[cat], im["uri"])).replace("\\", "/")
                       for im in raw["images"] if not im["embedded"]})
        entry = pieces.setdefault(pid, {
            "id": pid, "name": NAMES.get(pid, pid), "category": CATEGORY[cat], "slot": SLOT[cat],
            "attachment": "socket" if rigid else "skinned", "rigId": RIG_ID, "boneContractVersion": RIG_CONTRACT_VERSION,
            "meshNode": pid, "socket": ob.get("bar_socket") if rigid else None, "hidesRegions": hides,
            "bodies": {}})
        if pid in SOCK_PIECES:
            entry["notes"] = [f"inclui {SOCK_PIECES[pid]} (faces da região foot acima da abertura do calçado, cor fixa da faixa da sola, A=0)"]
        if pid in REQUIRES_TOP:
            entry["requiresCategory"] = ["TOP"]
        mats = materials_for(pid, cat, raw, dflt)
        entry["configurableMaterials"] = mats
        entry["bodies"][b] = {
            "path": path, "sizeBytes": os.path.getsize(os.path.join(EXPORT, path)), "triangles": raw["triangles_total"],
            "primitives": sum(len(m["primitives"]) for m in raw["meshes"]),
            "morphTargets": sorted({t for m in raw["meshes"] for t in m["morph_targets"]}, key=FACES["targets"].index) if any(m["morph_targets"] for m in raw["meshes"]) else [],
            "coversRegions": cover[b].get(pid, {}),
            "dependencies": ([f"bodies/{b}.glb#{RIG_ID}"] if not rigid else [f"bodies/{b}.glb#{ob.get('bar_socket')}"]) + deps,
            "validation": piece_validation(pid, b, path)}
    # texture-only variants: same mesh file, baseColor override
    tv = {b: REPORT["blender_reimport"][b]["checks"]["renders"].get("texture_variants", {}) for b in BODIES}
    for variant, base in VARIANTS.items():
        src = pieces[base]
        cat = base.split("_")[0]
        e = {k: v for k, v in src.items() if k != "bodies"}
        e.update(id=variant, name=NAMES[variant], variantOf=base)
        e["configurableMaterials"] = materials_for(variant, cat, RAW[src["bodies"]["male"]["path"]], dflt, variant_of=variant)
        e["bodies"] = {}
        for b, sb in src["bodies"].items():
            tex = f"textures/{variant}_{b}.png"
            t = tv[b].get(variant)
            ok = bool(t) and t["base_image_size"] == t["override_size"]
            val = dict(sb["validation"])
            val["testsGltf"] = sb["validation"]["testsGltf"] + [
                f"override {tex} aplicado sobre {t['material'] if t else '?'} do GLB reimportado; mesmo tamanho ({t['override_size'] if t else '?'}); render masked"]
            if not ok:
                val.update(state="failed", gltfReimport="failed")
            e["bodies"][b] = dict(sb, textureOverride={"material": f"CharacterClothing-{base}", "baseColorTexture": tex,
                                                       "size": png_size(os.path.join(EXPORT, tex))},
                                  dependencies=sb["dependencies"] + [tex], validation=val)
        pieces[variant] = e
    order = ["top", "bottom", "footwear", "hair", "facial", "accessory"]
    plist = sorted(pieces.values(), key=lambda p: (order.index(p["id"].split("_")[0]), p["id"]))
    # bodies
    bodies = []
    for b in BODIES:
        raw = RAW[f"bodies/{b}.glb"]
        rd = rigs[b]
        p = rd["pos"]
        leg = float(np.linalg.norm(p["upperleg_l"] - p["lowerleg_l"]) + np.linalg.norm(p["lowerleg_l"] - p["foot_l"]))
        meshes = {m["node"]: m for m in raw["meshes"]}
        bodies.append({
            "id": b, "name": "Corpo masculino" if b == "male" else "Corpo feminino",
            "path": f"bodies/{b}.glb", "rig": f"rigs/bar_humanoid_v2_{b}.glb", "animations": f"animations/humanoid_v2_{b}.glb",
            "rigId": RIG_ID, "boneContractVersion": RIG_CONTRACT_VERSION, "armatureNode": RIG_ID,
            "measurements": {"heightM": bodies_mesh[b]["height_m"], "floorYM": bodies_mesh[b]["floor_y_m"],
                             "hipJointYM": round(float(p["hip"][1]), 4), "upperlegLYM": round(float(p["upperleg_l"][1]), 4),
                             "legLengthM": round(leg, 4), "eyeYM": next(s["restWorldPosition"][1] for s in rd["sockets"] if s["name"] == "socket_eye_l"),
                             "shoulderWidthM": round(float(abs(p["upperarm_l"][0] - p["upperarm_r"][0])), 4)},
            "meshes": {"body": "BAR_Body", "eyes": "BAR_Eyes",
                       "brows": {"regular": "BAR_Brows_regular", "thin": "BAR_Brows_thin", "thick": "BAR_Brows_thick"}},
            "triangles": {n: sum(pr["triangles"] for pr in m["primitives"]) for n, m in meshes.items()},
            "morphTargets": FACES["targets"],
            "morphTargetMaxDeltaM": {k: round(v, 4) for k, v in FACES["max_delta_m"][b].items()},
            "morphTargetsAlsoOn": ["BAR_Brows_regular", "BAR_Brows_thin", "BAR_Brows_thick", "facial_* (todas as peças de barba)"],
            "facePresets": FACES["presets"][b],
            "materials": [
                {"name": "CharacterSkin", "role": "skin", "category": "Skin", "configurable": True, "colorField": "skinTone",
                 "secondaryColorField": "outfitColor", "rule": "albedo = tex.rgb * mix(outfitColor, skinTone, tex.a)",
                 "shader": "mesmo chunk skinDiffuse do legado (character-materials.ts)", "defaultColor": hexc(dflt["DEFAULT_SKIN"]),
                 "texture": "embedded skin_{body}", "textureSize": png_size(os.path.join(EXPORT, "textures", f"skin_{b}.png"))},
                {"name": "CharacterEyes", "role": "eyes", "category": "Eyes", "configurable": True, "colorField": "eyeColor",
                 "rule": "albedo = tex.rgb * mix(vec3(1.0), eyeColor, tex.a)",
                 "shader": "chunk eyes NOVO: íris pela máscara alfa (o chunk legado detecta a íris por luminância e NÃO serve)",
                 "texture": "textures/eye_v2.png"},
                {"name": "CharacterHair", "role": "brows", "category": "Hair", "configurable": True, "colorField": "hairColor",
                 "rule": "albedo = tex.rgb * hairColor", "texture": "textures/hair_v2.png"}],
            "regionMask": {"attribute": "TEXCOORD_1", "encoding": "u = (regionId + 0.5) / 32, v = 0.5", **bodies_mesh[b]["region_check"]},
            "dependencies": ["textures/hair_v2.png", "textures/eye_v2.png"],
            "validation": {"state": "approved_gltf_reimport" if not raw["errors"] and not REPORT["blender_reimport"][b]["errors"] else "failed",
                           "blender": "approved", "gltfReimport": "approved" if not raw["errors"] else "failed", "playcanvas": "pending",
                           "errors": raw["errors"]},
        })
    catalog = {
        "schema": f"{SCHEMA}/avatar-catalog", "catalogVersion": CATALOG_VERSION, "generated": TODAY, "generator": "scripts/s25_manifests.py",
        "rigId": RIG_ID, "boneContractVersion": RIG_CONTRACT_VERSION,
        "pathBase": "raiz do export (pasta que contém manifests/); nenhum caminho absoluto",
        "units": "metros; glTF +Y para cima; personagem olha para +Z; lado esquerdo do personagem em +X",
        "validationStates": {"approved_blender": "aprovado no Blender", "approved_gltf_reimport": "aprovado em reimportação glTF",
                             "pending_playcanvas": "pendente de validação no PlayCanvas (todas as entradas)", "failed": "reprovado"},
        "colorFields": {"skinTone": "CharacterSkin (A=1)", "outfitColor": "CharacterSkin (A=0, roupa de baixo base)", "eyeColor": "CharacterEyes (A=1)",
                        "hairColor": "CharacterHair (cabelo, sobrancelhas, barba)", "topColor": "TOP", "bottomColor": "BOTTOM",
                        "footwearColor": "FOOTWEAR", "accessoryColor": "ACCESSORY (exceto lentes)"},
        "sharedTextures": sorted(f"textures/{f}" for f in os.listdir(os.path.join(EXPORT, "textures"))),
        "regionRules": REGION_RULES,
        "hiddenRegionsAlgorithm": "hidden = união de pieces[*].hidesRegions das peças vestidas + regiões de regionRules cuja condição vale",
        "bodies": bodies, "pieces": plist,
    }
    return catalog, rigs, bodies_mesh


def rig_contract(rigs, bodies_mesh):
    cross = REPORT["cross_file_skin_contract"]
    bones = []
    for k, bm in enumerate(rigs["male"]["bones"]):
        bf = rigs["female"]["bones"][k]
        assert bm["name"] == bf["name"] and bm["parent"] == bf["parent"]
        bones.append({"index": k, "name": bm["name"], "parent": bm["parent"], "deform": bm["name"] != "root",
                      "restWorldPosition": {"male": bm["restWorldPosition"], "female": bf["restWorldPosition"]},
                      "restLocal": {"male": bm["restLocal"], "female": bf["restLocal"]}})
    pm = rigs["male"]["pos"]
    facing = {"toe_l_minus_foot_l_z": round(float(pm["toe_l"][2] - pm["foot_l"][2]), 4), "hand_l_x": round(float(pm["hand_l"][0]), 4)}
    sockets = []
    for s in rigs["male"]["sockets"]:
        f = next(x for x in rigs["female"]["sockets"] if x["name"] == s["name"])
        sockets.append({"name": s["name"], "purpose": SOCKET_PURPOSE.get(s["name"], ""), "parentBone": s["parentBone"],
                        "restWorldPosition": {"male": s["restWorldPosition"], "female": f["restWorldPosition"]},
                        "localTranslation": {"male": s["localTranslation"], "female": f["localTranslation"]},
                        "restWorldRotationIsIdentity": s["restWorldRotationIsIdentity"] and f["restWorldRotationIsIdentity"]})
    return {
        "schema": f"{SCHEMA}/rig-contract", "rigId": RIG_ID, "contractVersion": RIG_CONTRACT_VERSION, "generated": TODAY,
        "armatureNode": RIG_ID, "rootJoint": "root", "jointCount": len(bones),
        "files": {b: {"rig": f"rigs/bar_humanoid_v2_{b}.glb", "body": f"bodies/{b}.glb", "animations": f"animations/humanoid_v2_{b}.glb"} for b in BODIES},
        "conventions": {
            "units": "metros (1 unidade = 1 m), sem escala em nós",
            "upAxis": "+Y (glTF)", "characterFacing": "+Z (glTF) — igual ao legado (câmera do CharacterPreview em +Z)",
            "characterLeft": "+X", "restPose": "T-pose (braços ao longo de ±X, palmas para baixo)",
            "rootAtOrigin": True, "groundY": "pés em y≈0 (" + ", ".join(f"{b}: {bodies_mesh[b]['floor_y_m']}" for b in BODIES) + ")",
            "measuredFacing": facing,
            "jointOrientation": "rotação local de repouso de cada junta = orientação do osso do Blender (eixo Y ao longo do osso); as animações substituem a rotação local",
            "maxInfluences": 4, "weightsNormalized": True,
            "blenderOnlyBones": "nenhum: todos os 53 nós de junta são exportados; o rig de origem (metarig/Rigify) não é exportado",
            "constraints": "nenhuma (ações assadas por osso)",
        },
        "bindMatrices": {
            "perBody": "masculino e feminino têm proporções e inverseBindMatrices diferentes: peças, rigs e bancos são por corpo",
            "sameBodyAcrossFiles": {b: {"files": len(cross[b]["files"]) + 1, "maxAbsDiff": max(f["ibm_max_abs_diff"] for f in cross[b]["files"]),
                                        "sameJointOrder": all(f.get("same_joint_order", False) for f in cross[b]["files"]),
                                        "errors": cross[b]["errors"]} for b in BODIES},
            "jointNamesIdenticalBetweenBodies": True,
        },
        "bones": bones,
        "gameBonesUsed": {"BarScene.SKIN_BONES": ["head", "upperarm_l", "lowerarm_l", "upperarm_r", "lowerarm_r", "hand_l", "middle_01_l",
                                                   "hand_r", "middle_01_r", "upperleg_l", "lowerleg_l", "upperleg_r", "lowerleg_r", "foot_l", "foot_r"],
                          "note": "todos existem com o mesmo nome; BONE_ALIASES não é necessário para V2"},
        "sockets": sockets,
        "regions": [{"id": i, "name": n, "u": round((i + 0.5) / 32, 6)} for i, n in enumerate(REGIONS)],
        "regionEncoding": "TEXCOORD_1 do BAR_Body: u = (id + 0.5) / 32, v = 0.5; uniforme por triângulo (verificado no GLB)",
        "regionRules": REGION_RULES,
    }


def clip_table():
    """The authored clip table of s12 (the action property keeps only the parsed hip mode, not the travel factor)."""
    tree = ast.parse(open(os.path.join(ROOT, "scripts", "s12_retarget.py"), encoding="utf-8").read())
    table = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "CLIPS")
    return {k: {"source": v[0], "trimS": v[1], "loop": v[2], "hipMode": v[3], "tailBlendFrames": v[4], "groundFix": v[5]} for k, v in table.items()}


DERIVED_CLIPS = {"Pose": ("static", "nenhum: quadro neutro estático (Idle quadro 0)"),
                 "OldCaneHold": ("mean", "nenhum: Idle com o braço direito da caminhada com bengala")}


def animation_catalog():
    acts = {a.name: a for a in bpy.data.actions}
    table = clip_table()
    clips = []
    banks = {b: {a["name"]: a for a in RAW[f"animations/humanoid_v2_{b}.glb"]["animations"]} for b in BODIES}
    for name in REPORT["blender_reimport"]["male"]["checks"]["animation_roundtrip"]:
        act = acts[f"{name}__male"]
        loop = bool(act.get("bar_loop", False))
        per = {}
        for b in BODIES:
            ab = ANIM_BLENDER[f"{name}__{b}"]
            g = banks[b][name]
            rt = REPORT["blender_reimport"][b]["checks"]["animation_roundtrip"][name]
            hip_mode = acts[f"{name}__{b}"].get("bar_hip_mode", "")
            in_place = not hip_mode.startswith("start")
            crit = {"no_nan": not ab["nan"], "unit_quaternions": ab["quat_norm_max_error"] < 1e-3,
                    "loop_seam": (ab["loop_seam_max_rot_deg"] <= 1.0 and ab["loop_seam_max_pos_m"] <= 0.005) if loop else None,
                    "feet_above_ground": ab["lowest_foot_joint_m"] >= -0.01,
                    "body_mesh_above_floor": ab["lowest_body_mesh_m"] >= -FLOOR_TOLERANCE,
                    "in_place": (ab["hip_net_horizontal_travel_m"] <= 0.01) if in_place else None}
            b_ok = all(v for v in crit.values() if v is not None)
            g_ok = rt["max_joint_error_m"] <= 0.003 and rt["frames"] == rt["expected_frames"] and not g["scale_targets"] and set(g["translation_targets"]) <= {"hip"}
            per[b] = {"durationS": g["duration_s"], "frames": rt["frames"], "keys": g["keys"], "channels": g["channels"],
                      "hipSwayRangeM": {"x": ab["hip_horizontal_range_m"][0], "z": ab["hip_horizontal_range_m"][1]},
                      "hipVerticalRangeM": ab["hip_vertical_range_m"], "hipNetTravelM": ab["hip_net_horizontal_travel_m"],
                      "lowestFootJointM": ab["lowest_foot_joint_m"], "lowestBodyMeshM": ab["lowest_body_mesh_m"],
                      "maxRotStepPerFrameDeg": ab["max_rot_step_per_frame_deg"],
                      "loopSeam": {"rotDeg": ab["loop_seam_max_rot_deg"], "posM": ab["loop_seam_max_pos_m"]} if loop else None,
                      "validation": {"state": "failed" if not (b_ok and g_ok) else "approved_gltf_reimport",
                                     "blender": "approved" if b_ok else "failed", "blenderCriteria": crit,
                                     "gltfReimport": "approved" if g_ok else "failed",
                                     "gltfReimportMaxJointErrorM": rt["max_joint_error_m"], "playcanvas": "pending"}}
        t = table.get(name, {})
        hip_mode = t.get("hipMode") or DERIVED_CLIPS[name][0]
        travel = hip_mode.split(":")[1] if ":" in hip_mode else "1.0"
        root_motion = ("nenhum: in-place, deriva horizontal removida" if hip_mode == "drift" else
                       "nenhum: in-place, quadril centrado na média" if hip_mode == "mean" and name not in DERIVED_CLIPS else
                       DERIVED_CLIPS[name][1] if name in DERIVED_CLIPS else
                       f"deslocamento visual relativo ao início ({float(travel) * 100:.0f} % do deslocamento da fonte); "
                       "a posição autoritativa continua no servidor")
        clips.append({
            "name": name, "aliases": sorted(k for k, v in CLIP_ALIASES.items() if v == name), "gltfAnimation": name,
            "loop": loop, "fps": int(act.get("bar_fps", 30)), "source": act.get("bar_source", ""),
            "sourceTrimS": t.get("trimS"), "tailBlendFrames": t.get("tailBlendFrames"),
            "groundFix": "malha do corpo (s12b)" if name in ("Fallen", "Recover") else "juntas dos pés (s12)" if t.get("groundFix") else "não",
            "rootMotion": root_motion, "hipMode": hip_mode, "channels": "rotação de 53 juntas + translação do 'hip'; sem escala",
            "bodies": per,
        })
    return {
        "schema": f"{SCHEMA}/animation-catalog", "catalogVersion": CATALOG_VERSION, "generated": TODAY, "rigId": RIG_ID,
        "boneContractVersion": RIG_CONTRACT_VERSION, "fps": 30,
        "banks": {b: f"animations/humanoid_v2_{b}.glb" for b in BODIES},
        "bankNote": "um banco por corpo (rotações calibradas por corpo e altura do quadril própria); cada glTF animation = um clipe",
        "keyframeReduction": "chaves redundantes removidas com tolerância 0,1° / 0,3 mm; erro máx. de junta após reimportação <= 3 mm",
        "criteria": {"loop_seam": "loops: 1º e último quadro iguais (<= 1° e <= 5 mm)", "in_place": "clipes in-place: deslocamento líquido do quadril <= 1 cm",
                     "feet_above_ground": "juntas dos pés >= -1 cm", "body_mesh_above_floor": f"malha do corpo deformada >= -{FLOOR_TOLERANCE * 100:.1f} cm (cantos de calcanhar/ponta do pé)",
                     "gltfReimport": "reimportado no corpo exportado: erro máx. de junta <= 3 mm em 0/25/50/75/100 %, mesmo nº de quadros, sem canais de escala, translação só no hip"},
        "aliases": CLIP_ALIASES,
        "gameOneShots": ["Drink", "Fallen", "Wave", "Use", "Recover"],
        "notIncluded": {"Kick": "exclusivo da skin Rafael", "Bartend": "exclusivo do Seu Zé (Magrão)", "Shuffle": "dealer",
                        "carta-distribui / carta-recomeco": "dealer"},
        "clips": clips,
    }


def compatibility():
    out = {"schema": f"{SCHEMA}/compatibility", "catalogVersion": CATALOG_VERSION, "generated": TODAY,
           "metric": COMPAT["metric"] + " entre as malhas deformadas", "poses": COMPAT["poses"], "thresholds": COMPAT["thresholds"],
           "statusMeaning": {"ok": f"<= {COMPAT['thresholds']['ok']} pares em todas as poses em pé",
                             "minor_clipping": f"<= {COMPAT['thresholds']['minor']} pares no pior caso em pé: permitido, com clipping pequeno visível",
                             "blocked": f"> {COMPAT['thresholds']['minor']} pares: o editor deve impedir a combinação",
                             "by_design": "interseção intencional e oculta (ex.: sola do pé dentro do chinelo)",
                             "untested": "par não medido: tratar como não validado"},
           "seatedNote": "'Sit' é medido e publicado em 'seated', mas não entra no status (skinning linear sem simulação de tecido; mesa e cadeira escondem a maior parte)",
           "measuredCategoryPairs": ["TOP|BOTTOM", "HAIR|ACCESSORY", "HAIR|TOP", "FACIAL_HAIR|TOP", "FOOTWEAR|BOTTOM",
                                     "FACIAL_HAIR|ACCESSORY", "HAIR|FACIAL_HAIR", "ACCESSORY|TOP", "ACCESSORY|ACCESSORY"],
           "unmeasuredCategoryPairs": ["FOOTWEAR|TOP", "FOOTWEAR|ACCESSORY", "FACIAL_HAIR|BOTTOM", "HAIR|BOTTOM", "HAIR|FOOTWEAR"],
           "unmeasuredNote": "pares de regiões que não se tocam na pose de repouso nem nos clipes medidos; não presumir compatibilidade em clipes novos",
           "rules": [], "pairs": {}, "pieceVsSkin": {}}
    R = out["rules"]
    R.append({"type": "onePerSlot", "slots": ["top", "bottom", "footwear", "hair", "facialHair"],
              "note": "no máximo uma peça por slot; 'none' permitido em todos"})
    R.append({"type": "socketExclusive", "socket": "socket_glasses", "pieces": ["accessory_glasses", "accessory_sunglasses"],
              "note": "medido: bloqueado (mesmo volume)"})
    R.append({"type": "socketExclusive", "socket": "socket_head_top", "pieces": ["accessory_cap", "accessory_hat"],
              "note": "medido: bloqueado (mesmo volume)"})
    R.append({"type": "bodyRestriction", "piece": "bottom_skirt", "bodies": ["female"], "note": "só existe bottoms/bottom_skirt_female.glb"})
    for b in BODIES:
        for pid in sorted(REQUIRES_TOP):
            if pid in COMPAT["bodies"][b]["skin"]:
                R.append({"type": "requiresCategory", "piece": pid, "requires": "TOP", "body": b,
                          "measured": {"alone": COMPAT["bodies"][b]["skin"][pid]["worst_standing"],
                                       "withTop": COMPAT["bodies"][b]["skin_with_top"][pid]["worst_standing"]},
                          "note": "sem TOP a faixa 'waist' fica visível e atravessa o cós da saia"})
    R.append({"type": "regionRule", **REGION_RULES[0]})
    for v, base in VARIANTS.items():
        R.append({"type": "inherits", "piece": v, "from": base, "note": "variante só de textura: mesma malha, mesma compatibilidade"})
    blocked = defaultdict(dict)
    for b in BODIES:
        out["pairs"][b] = {}
        for k, v in sorted(COMPAT["bodies"][b]["pairs"].items()):
            out["pairs"][b][k] = {"status": v["status"], "worstStanding": v["worst_standing"], "seated": v["seated"], "perPose": v["per_pose"]}
            if v["status"] == "blocked":
                blocked[k][b] = v["worst_standing"]
        out.setdefault("pieceVsSkinWithTop", {})[b] = {k: {"status": v["status"], "worstStanding": v["worst_standing"], "seated": v["seated"],
                                                          "perPose": v["per_pose"]} for k, v in sorted(COMPAT["bodies"][b].get("skin_with_top", {}).items())}
        out["pieceVsSkin"][b] = {k: {"status": v["status"], "worstStanding": v["worst_standing"], "seated": v["seated"], "perPose": v["per_pose"],
                                     **({"note": v["note"]} if "note" in v else {})} for k, v in sorted(COMPAT["bodies"][b]["skin"].items())}
    socket_pairs = {"accessory_glasses|accessory_sunglasses", "accessory_cap|accessory_hat"}
    for k, per in sorted(blocked.items()):
        if k in socket_pairs:
            continue
        a, b_ = k.split("|")
        R.append({"type": "blocked", "a": a, "b": b_, "bodies": sorted(per), "measuredWorstStanding": per})
    # pairs that are blocked on one body only are minor on the other: keep the per-body table authoritative
    return out


def export_report(catalog):
    files = []
    for root, _, fs in os.walk(EXPORT):
        for f in sorted(fs):
            p = os.path.join(root, f)
            rel_ = os.path.relpath(p, EXPORT).replace("\\", "/")
            if rel_ == "validation/export-report.json":
                continue
            e = {"path": rel_, "sizeBytes": os.path.getsize(p), "sha256": sha256(p)}
            if f.endswith(".glb"):
                r = RAW.get(rel_)
                if r:
                    e.update(triangles=r["triangles_total"], primitives=sum(len(m["primitives"]) for m in r["meshes"]),
                             skins=len(r["skins"]), animations=len(r["animations"]),
                             embeddedImages=[i["name"] for i in r["images"] if i["embedded"]],
                             externalImages=[i["uri"] for i in r["images"] if not i["embedded"]], errors=r["errors"])
            if f.endswith(".png"):
                e["pixels"] = png_size(p)
            files.append(e)
    # triangle budget per complete character (body + eyes + one brow style + pieces)
    pieces = {p["id"]: p for p in catalog["pieces"]}
    budget = {}
    for body in catalog["bodies"]:
        b = body["id"]
        base = body["triangles"]["BAR_Body"] + body["triangles"]["BAR_Eyes"] + max(body["triangles"][n] for n in body["meshes"]["brows"].values())
        def tris(pid):
            return pieces[pid]["bodies"][b]["triangles"] if b in pieces[pid]["bodies"] else 0
        heavy = {}
        for slot in ("top", "bottom", "footwear", "hair", "facialHair"):
            cands = [p for p in pieces.values() if p["slot"] == slot and b in p["bodies"]]
            best = max(cands, key=lambda p: tris(p["id"]))
            heavy[slot] = (best["id"], tris(best["id"]))
        for sock in ("socket_glasses", "socket_head_top", "socket_wrist_l"):
            cands = [p for p in pieces.values() if p.get("socket") == sock and b in p["bodies"]]
            best = max(cands, key=lambda p: tris(p["id"]))
            heavy[sock] = (best["id"], tris(best["id"]))
        outfits = REPORT["blender_reimport"][b]["checks"]["renders"]
        val_outfits = {"validacao_1": outfits["outfit"], "validacao_2_variantes": outfits["variant_outfit"]}
        budget[b] = {"baseBodyEyesBrows": base, "heaviestPerSlot": {k: {"piece": v[0], "triangles": v[1]} for k, v in heavy.items()},
                     "upperBoundAllSlotsHeaviest": base + sum(v[1] for v in heavy.values()),
                     "validationOutfits": {k: {"pieces": v, "triangles": base + sum(tris(p) for p in v),
                                               "drawCalls": 3 + sum(pieces[p]["bodies"][b]["primitives"] for p in v)}
                                           for k, v in val_outfits.items()},
                     "note": "triângulos enviados (regiões ocultas por máscara continuam no buffer; são descartadas por alpha test)"}
    tex = [f for f in files if f["path"].startswith("textures/")]
    return {"schema": f"{SCHEMA}/export-report", "catalogVersion": CATALOG_VERSION, "generated": TODAY,
            "generator": "scripts/s25_manifests.py", "blender": bpy.app.version_string, "gltfExporter": next(iter(RAW.values()))["generator"],
            "exportRoot": "BAR_Avatar_V2/export (caminhos relativos)",
            "counts": {k: sum(1 for f in files if f["path"].startswith(k + "/")) for k in
                       ("rigs", "bodies", "hair", "facial_hair", "tops", "bottoms", "footwear", "accessories", "animations", "textures", "manifests", "validation")},
            "glbFiles": sum(1 for f in files if f["path"].endswith(".glb")),
            "totalBytes": sum(f["sizeBytes"] for f in files),
            "glbBytes": sum(f["sizeBytes"] for f in files if f["path"].endswith(".glb")),
            "textureNote": "texturas compartilhadas (hair_v2, eye_v2) externas em textures/; demais embutidas no GLB da peça e também copiadas em textures/ (fonte e overrides)",
            "textureGpuEstimateBytes": {f["path"]: int(f["pixels"][0] * f["pixels"][1] * 4 * 4 / 3) for f in tex},
            "triangleBudget": {"target": [8000, 15000], **budget},
            "validationSummary": {"validatorErrorsTotal": REPORT["errors_total"], "filesChecked": REPORT["files_checked"],
                                  "materialsVsMaster": REPORT.get("materials_vs_master", {}).get("checked_nodes")},
            "files": files}


def main():
    catalog, rigs, bodies_mesh = build()
    rc = rig_contract(rigs, bodies_mesh)
    ac = animation_catalog()
    cp = compatibility()
    save_json(os.path.join(MAN, "avatar-catalog.json"), catalog)
    save_json(os.path.join(MAN, "rig-contract.json"), rc)
    save_json(os.path.join(MAN, "animation-catalog.json"), ac)
    save_json(os.path.join(MAN, "compatibility.json"), cp)
    er = export_report(catalog)
    save_json(os.path.join(VAL, "export-report.json"), er)
    # self-checks: valid JSON, no absolute paths, every referenced path exists
    problems = []
    for fn in ("avatar-catalog.json", "rig-contract.json", "animation-catalog.json", "compatibility.json"):
        text = open(os.path.join(MAN, fn), encoding="utf-8").read()
        json.loads(text)
        if ":\\" in text or ":/" in text.replace("https:/", "") or "/Users/" in text:
            problems.append(f"{fn}: absolute path")
    refs = set()
    for p in catalog["pieces"]:
        for b, e in p["bodies"].items():
            refs.add(e["path"])
            refs.update(d.split("#")[0] for d in e["dependencies"])
    for b in catalog["bodies"]:
        refs.update([b["path"], b["rig"], b["animations"]] + b["dependencies"])
    refs.update(catalog["sharedTextures"])
    for r in sorted(refs):
        if not os.path.isfile(os.path.join(EXPORT, r)):
            problems.append(f"missing referenced file {r}")
    print("MANIFESTS pieces", len(catalog["pieces"]), "bodies", len(catalog["bodies"]), "clips", len(ac["clips"]),
          "rules", len(cp["rules"]), "files", len(er["files"]), "refs", len(refs), "problems", problems)
    for b in BODIES:
        print("BUDGET", b, json.dumps(er["triangleBudget"][b]))
        print("REGION", b, {k: v for k, v in bodies_mesh[b]["region_check"].items() if k != "triangles_per_region"})
    states = defaultdict(int)
    for p in catalog["pieces"]:
        for b, e in p["bodies"].items():
            states[e["validation"]["state"]] += 1
    print("STATES pieces", dict(states), "clips", {c["name"]: [c["bodies"][b]["validation"]["state"] for b in BODIES] for c in ac["clips"]})
    print("FACING", rc["conventions"]["measuredFacing"], "sockets identity", all(s["restWorldRotationIsIdentity"] for s in rc["sockets"]))


main()
