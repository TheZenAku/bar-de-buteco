# Jukebox (FBX importado na colecao-asset PROPS-CRIADOS-MANUALMENTE) -> versao de jogo + objeto interativo no mapa.
# A parte brilhante (tubos dos arcos + grade da frente, achados pela textura de emissao do original) vira uma malha
# separada com material proprio, para o jogo trocar a cor em tempo real:
#   A_jukebox        corpo decimado, cor + normal bakeados (mesmo processo do 09_assets.py) + vidro da janela dos discos
#   A_jukebox_luz    parte brilhante: emissiveTexture = mascara em tons de cinza, emissiveFactor = cor
#                    -> no jogo basta mudar material.emissive (a mascara mantem o desenho dos tubos em qualquer cor)
# No mapa (Interativos_Bar, o jogo acha pelo nome):
#   Jukebox               interativo = "jukebox"
#   Jukebox_FX_Luz        malha brilhante (fx = "luz_jukebox")
#   Jukebox_FX_Ponto_Luz  PointLight (KHR_lights_punctual) na frente da jukebox, mesma cor do brilho
# Rodar depois do 06_interior.py (que limpa Interativos_Bar) e do 09_assets.py. O original importado NAO e alterado.
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix

DIR = r"C:\Users\rafael\BarBoteco\scripts"
if DIR not in sys.path:
    sys.path.insert(0, DIR)
import barlib as B

with open(os.path.join(DIR, "09_assets.py"), encoding="utf-8") as f:
    _src = f.read()
A = {}
exec(compile(_src.split("\nsrc_col = ")[0], "09_assets.py", "exec"), A)   # so as funcoes do pipeline (sem rodar o lote)

SRC = "PROPS-CRIADOS-MANUALMENTE"
INTB = "Interativos_Bar"
RAIZ = "jukebox"                  # empty raiz do FBX importado
NOME = "jukebox"
ALTURA_REAL = 1.50                # jukebox classica (Wurlitzer) ~1,50 m, escalada pelo personagem de referencia
TRIS_CORPO = 5000
TEX_CORPO = 1024
TEX_LUZ_MASCARA = 1024
TEX_LUZ_COR = 512
LIMIAR = 0.08                     # pixel da textura de emissao acima disso = parte brilhante
COR_PADRAO = (1.0, 0.42, 0.06)    # ambar (linear): cor inicial do brilho e da luz
FORCA_EMISSAO = 2.0               # -> KHR_materials_emissive_strength (emissiveIntensity no three.js)
VIDRO_LUZ = 0.12                  # base clara lavava a cor do brilho com a luz do salao: escurece o vidro onde brilha
LUZ_W = 30.0                      # PointLight da frente (as do salao tem 130-200 W)
PAREDE_Y = 11.65                  # parede a direita da escada, lado do salao (face virada para -Y)
POS_X = 15.70                     # centro do nicho entre a parede central da escada (14.95) e a parede 16.45


def trocar_malha(me, nome):
    old = bpy.data.meshes.get(nome)
    if old is not None and old != me:
        old.user_remap(me)
        bpy.data.meshes.remove(old)
    me.name = nome
    return me


def submalha(me_src, manter, nome):
    bm = bmesh.new()
    bm.from_mesh(me_src)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not manter[f.index]], context='FACES')
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    return me


def img_de(sock):
    return sock.links[0].from_node.image if sock.is_linked and sock.links[0].from_node.type == 'TEX_IMAGE' else None


def salvar_array(a, nome, px):
    tmp = bpy.data.images.new(nome + "_src", a.shape[1], a.shape[0], alpha=False)
    tmp.pixels.foreach_set(np.ascontiguousarray(a, np.float32).ravel())
    im, _ = A["reduzir"](tmp, px, nome)
    bpy.data.images.remove(tmp)
    if im.packed_file is None:
        im.pack()
    return im


def suavizar(me):
    for p in me.polygons:
        p.use_smooth = True
    if hasattr(me, "use_auto_smooth"):
        me.use_auto_smooth = True
        me.auto_smooth_angle = math.radians(60)


def remover(*nomes):
    for n in nomes:
        o = bpy.data.objects.get(n)
        if o is not None:
            data = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if isinstance(data, bpy.types.Light) and data.users == 0:
                bpy.data.lights.remove(data)


# ------------------------------------------------------------------ fontes
raiz = bpy.data.objects[RAIZ]
malhas = [o for o in raiz.children_recursive if o.type == 'MESH']
for o in malhas:
    o["pipeline_proprio"] = "12_jukebox.py"         # o 09_assets.py pula estas malhas
corpo_src = max(malhas, key=lambda o: len(o.data.polygons))
vidros_src = [o for o in malhas if o is not corpo_src]
mat_src = corpo_src.data.materials[0]
bs_src = next(n for n in mat_src.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
img_emis, img_cor = img_de(bs_src.inputs["Emission Color"]), img_de(bs_src.inputs["Base Color"])
emis = A["pixels"](img_emis)
mascara = emis[..., :3].max(-1)
mascara = np.clip(mascara / max(float(mascara.max()), 1e-6), 0.0, 1.0)

# ------------------------------------------------------------------ quais faces brilham (amostra da mascara nos cantos + centro da UV)
me_s = corpo_src.data
h, w = mascara.shape
uvs = np.empty(len(me_s.loops) * 2, np.float32)
me_s.uv_layers.active.data.foreach_get("uv", uvs)
uvs = uvs.reshape(-1, 2)
ls = np.empty(len(me_s.polygons), np.int32); me_s.polygons.foreach_get("loop_start", ls)
lt = np.empty(len(me_s.polygons), np.int32); me_s.polygons.foreach_get("loop_total", lt)


def amostra(uv):
    x = np.clip((uv[:, 0] % 1.0) * w, 0, w - 1).astype(int)
    y = np.clip((uv[:, 1] % 1.0) * h, 0, h - 1).astype(int)
    return mascara[y, x]


cantos = [uvs[ls + np.minimum(k, lt - 1)] for k in range(4)]
pico = np.max([amostra(c) for c in cantos + [sum(cantos) / 4]], axis=0)
brilha = pico > LIMIAR

# ------------------------------------------------------------------ corpo: decimado + bake (cor, normal) do original
tmp = bpy.data.objects.new("_tmp_jukebox_corpo", submalha(me_s, ~brilha, "_tmp_jukebox_corpo"))
me_corpo, tris_orig = A["decimar"](tmp, TRIS_CORPO)
me_tmp = tmp.data
bpy.data.objects.remove(tmp)
bpy.data.meshes.remove(me_tmp)
cor, nrm = A["bake_high_low"](corpo_src, me_corpo, NOME, TEX_CORPO)
img_rm = img_de(next(n for n in mat_src.node_tree.nodes if n.type == 'SEPARATE_COLOR').inputs["Color"])
rough, metal = 0.5, 0.0
if img_rm is not None:                               # ORM do original: G = rugosidade, B = metalico
    rm = A["pixels"](img_rm)
    rough, metal = float(rm[..., 1].mean()), float(rm[..., 2].mean())
mat_corpo = A["material_asset"]("A_" + NOME, cor, nrm, round(min(max(rough, 0.05), 1.0), 3),
                                round(metal if metal > 0.2 else 0.0, 3))
for im in (cor, nrm):
    if im.packed_file is None:
        im.pack()
mat_vidro = B.material("A_" + NOME + "_vidro", color=(0.8, 0.85, 0.9), rough=0.05, alpha=0.2)
me_corpo.transform(corpo_src.matrix_world)
me_corpo.materials.clear()                           # antes de juntar o vidro: clear() zera os material_index
me_corpo.materials.append(mat_corpo)
me_corpo.materials.append(mat_vidro)
bm = bmesh.new()
bm.from_mesh(me_corpo)
n0 = len(bm.faces)
for v in vidros_src:
    mv = v.data.copy()
    mv.transform(v.matrix_world)
    bm.from_mesh(mv)
    bpy.data.meshes.remove(mv)
bm.faces.ensure_lookup_table()
for f in bm.faces[n0:]:
    f.material_index = 1
bm.to_mesh(me_corpo)
bm.free()

# ------------------------------------------------------------------ parte brilhante: UV original, mascara cinza x cor
me_luz = submalha(me_s, brilha, "_tmp_jukebox_luz")
me_luz.transform(corpo_src.matrix_world)
base = A["pixels"](img_cor)[..., :3]
lum = (base @ np.array([0.2126, 0.7152, 0.0722], np.float32))[..., None]
m3 = mascara[..., None]
base_luz = base * (1 - m3) + lum * VIDRO_LUZ * m3    # onde brilha: vidro escuro e neutro (o tom vem so do emissive)
img_luz_cor = salvar_array(np.dstack([base_luz, np.ones_like(mascara)]), "A_%s_luz_cor" % NOME, TEX_LUZ_COR)
img_luz_mask = salvar_array(np.dstack([mascara, mascara, mascara, np.ones_like(mascara)]), "A_%s_luz_mascara" % NOME, TEX_LUZ_MASCARA)
mat_luz = bpy.data.materials.get("A_%s_luz" % NOME) or bpy.data.materials.new("A_%s_luz" % NOME)
mat_luz.use_nodes = True
nt = mat_luz.node_tree
nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (500, 0)
bs = nt.nodes.new("ShaderNodeBsdfPrincipled"); bs.location = (200, 0)
nt.links.new(bs.outputs[0], out.inputs["Surface"])
tc = nt.nodes.new("ShaderNodeTexImage"); tc.image = img_luz_cor; tc.location = (-650, 250)
nt.links.new(tc.outputs["Color"], bs.inputs["Base Color"])
tm = nt.nodes.new("ShaderNodeTexImage"); tm.image = img_luz_mask; tm.location = (-650, -150)
nt.links.new(B._mix_mul(nt, tm.outputs["Color"], COR_PADRAO), bs.inputs["Emission Color"])   # -> emissiveFactor
bs.inputs["Emission Strength"].default_value = FORCA_EMISSAO
bs.inputs["Roughness"].default_value = 0.3
bs.inputs["Metallic"].default_value = 0.0
mat_luz.use_backface_culling = True
mat_luz["tile_u"], mat_luz["tile_v"] = 1.0, 1.0
mat_luz.diffuse_color = (*COR_PADRAO, 1.0)
me_luz.materials.clear()
me_luz.materials.append(mat_luz)

# ------------------------------------------------------------------ escala real, origem no centro da base, frente para -Y
ref = next((o for o in bpy.data.collections[SRC].all_objects if o.get("referencia_escala")), None)
fator = 1.0
if ref is not None:
    bb = [ref.matrix_world @ Vector(v) for v in ref.bound_box]
    fator = (max(v.z for v in bb) - min(v.z for v in bb)) / A["ALTURA_HUMANA"]
co = np.vstack([A["coords"](me_corpo), A["coords"](me_luz)])
mn, mx = co.min(0), co.max(0)
ctr = (mn + mx) / 2
s = ALTURA_REAL * fator / (mx[2] - mn[2])
T = Matrix.Scale(s, 4) @ Matrix.Rotation(math.radians(-90), 4, 'Z') @ Matrix.Translation(Vector((-ctr[0], -ctr[1], -mn[2])))
for me in (me_corpo, me_luz):                        # frente do FBX e +X -> -Y (padrao dos assets)
    me.transform(T)
    suavizar(me)
trocar_malha(me_corpo, "A_" + NOME)
trocar_malha(me_luz, "A_%s_luz" % NOME)
co = A["coords"](me_corpo)
mn, mx = co.min(0), co.max(0)
me_corpo["altura_m"] = float(mx[2] - mn[2])
me_corpo["largura_m"] = float(mx[0] - mn[0])
me_corpo["profundidade_m"] = float(mx[1] - mn[1])
me_corpo["origem"] = raiz.name
me_corpo["tipo"] = "objeto"
me_corpo["fx_ponto_luz"] = [0.0, float(mn[1]) - 0.25, float(0.55 * (mx[2] - mn[2]))]
me_corpo.calc_loop_triangles()
me_luz.calc_loop_triangles()
cor_hex = "#%02x%02x%02x" % tuple(int(round(255 * (c ** (1 / 2.2)))) for c in COR_PADRAO)
DESC_LUZ = ("Parte brilhante da jukebox (material A_%s_luz): mude material.emissive para trocar a cor; "
            "emissiveIntensity controla a forca" % NOME)
DESC_PONTO = "PointLight da jukebox: use a mesma cor do emissive de A_%s_luz" % NOME

# ------------------------------------------------------------------ asset (OTM_jukebox + pontos de efeito como filhos)
cat = bpy.data.collections[SRC]
remover("FX_Luz_" + NOME, "FX_Ponto_Luz_" + NOME)
ob = bpy.data.objects.get("OTM_" + NOME) or bpy.data.objects.new("OTM_" + NOME, me_corpo)
if ob.name not in cat.objects:
    cat.objects.link(ob)
ob.data = me_corpo
ob.location = (max((o.location.x for o in cat.objects if o.name.startswith("OTM_") and o is not ob), default=0.2) + 1.3,
               0.0, 0.0)                              # fim da fileira dos OTM_* (o 09_assets.py arruma so os dele)
ob["otimizado"] = True
ob["origem"] = raiz.name
ob["altura_m"] = round(float(me_corpo["altura_m"]), 3)
if ob.asset_data is None:
    ob.asset_mark()
ob.asset_data.description = ("Versao de jogo de '%s' (%d tris + %d tris da parte brilhante, cor trocavel no jogo)"
                             % (raiz.name, len(me_corpo.loop_triangles), len(me_luz.loop_triangles)))
for t in ("otimizado", "bar", "objeto", "luz_dinamica"):
    if t not in ob.asset_data.tags:
        ob.asset_data.tags.new(t)
fl = bpy.data.objects.new("FX_Luz_" + NOME, me_luz)
cat.objects.link(fl)
fl.parent = ob
fl["fx"] = "luz_jukebox"
fl["cor_padrao"] = cor_hex
fl["descricao"] = DESC_LUZ
fp = bpy.data.objects.new("FX_Ponto_Luz_" + NOME, None)
cat.objects.link(fp)
fp.empty_display_type = 'SPHERE'
fp.empty_display_size = 0.08
fp.parent = ob
fp.location = tuple(me_corpo["fx_ponto_luz"])
fp["fx"] = "luz"
fp["descricao"] = DESC_PONTO

# ------------------------------------------------------------------ no mapa: parede a direita da escada, de frente para o salao
remover("Jukebox", "Jukebox_FX_Luz", "Jukebox_FX_Ponto_Luz", "COL_Int_Jukebox")
y = PAREDE_Y - float(me_corpo["profundidade_m"]) / 2 - 0.02
jb = B.inst(me_corpo, "Jukebox", INTB, (POS_X, y, B.Z_PISO), 0)
jb["interativo"] = "jukebox"
B.collider_obj("Int_Jukebox", jb)
jl = bpy.data.objects.new("Jukebox_FX_Luz", me_luz)
jl.parent = jb
jl["fx"] = "luz_jukebox"
jl["cor_padrao"] = cor_hex
jl["descricao"] = DESC_LUZ
B.coll(INTB).objects.link(jl)
ld = bpy.data.lights.get("Jukebox_FX_Ponto_Luz") or bpy.data.lights.new("Jukebox_FX_Ponto_Luz", 'POINT')
ld.energy = LUZ_W
ld.color = COR_PADRAO
ld.shadow_soft_size = 0.15
ld.use_shadow = False
jp = bpy.data.objects.new("Jukebox_FX_Ponto_Luz", ld)
jp.parent = jb
jp.location = tuple(me_corpo["fx_ponto_luz"])
jp["fx"] = "luz_jukebox_ponto"
jp["descricao"] = DESC_PONTO
B.coll(INTB).objects.link(jp)

print("jukebox: corpo %d tris (original %d), parte brilhante %d tris (%d faces do original), %.2f x %.2f x %.2f m, "
      "rough %.2f metal %.2f, cor %s | no mapa em (%.2f, %.2f, %.2f)"
      % (len(me_corpo.loop_triangles), tris_orig, len(me_luz.loop_triangles), int(brilha.sum()),
         me_corpo["largura_m"], me_corpo["profundidade_m"], me_corpo["altura_m"], rough, metal, cor_hex, POS_X, y, B.Z_PISO))
