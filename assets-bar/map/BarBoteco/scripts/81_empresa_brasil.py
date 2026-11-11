# 81_empresa_brasil.py - roda NO Blender (MCP ou segundo plano).  Refaz o lote "EMPRESA BRASIL" (caixa guia do usuario,
# x 331,5-363 / y 48-81,5, setor S07_04, frente para a Rua da Ferrovia) como uma fabrica de alimentos JOGAVEL:
#   galpao 26,5 x 31,1 m (cumeeira 14 m, oitao para a rua com o letreiro), patio com portao de 9 m para o caminhao,
#   baia de carga/descarga interna (o caminhao entra pelo portao de enrolar e para ao lado dos paletes),
#   paletes de materia-prima (MALTE / MIX) e de produto acabado, sala de PREPARO (sem teto, dentro do galpao) com 3 tanques
#   e plataforma de alimentacao, SECADOR spray do chao ao telhado com plataformas em 4,2 m e 8,6 m (escadas de degraus de 20 cm:
#   o jogo sobe no maximo 26 cm por passo), ciclone + chamine, aquecedor de ar, tubulacoes, sala de ENSAQUE com teto ligada
#   ao secador por tubulacao, SALA DE CONTROLE com painel/IHM, utilidades (QGBT, compressor, bancada), sinalizacao.
# Saidas no .blend:
#   colecoes EB_Empresa_Brasil_VISUAL / _COLISAO / _MARCADORES dentro de CITY_S07_04_VISUAL / _COLLISION / _MARKERS
#   (o 28_cidade_export le all_objects: a fabrica sai no setor S07_04); EB_Empresa_Brasil_ESTOQUE (fora da exportacao da
#   cidade: sacos e arranjo dos paletes para o estoque DINAMICO, exportados a parte pelo 81b).
#   Colisao: caixas COL_Cid_* (giro so na vertical). Pisos elevados/degraus = COL_Cid_Plataforma (piso + solido no importador).
# Rodada 2 (10/11): os equipamentos detalhados (paleteira, empilhadeira, balanca, lavatorio, compressor, bombas, quadros,
# console, porta-paletes, tanques abertos com interior e agitador, ensacadeira, cerca eletrica) ficam no 81p_props_fabrica.py,
# executado no namespace deste script; as pecas moveis (agitador, nivel da emulsao) vao para EB_Empresa_Brasil_DINAMICO.
# Antes de construir, apaga o que havia no lote (ilhas de malha dentro do lote em S07_04_Edificios e na base __base70 do 70,
# nos LODs, poste de patio e colisores do lote). Idempotente: refaz tudo o que tem cid_etapa = ETAPA.
import bpy, bmesh, math, json, os
from mathutils import Vector, Matrix

ETAPA = "81_empresa_brasil"
SETOR = "S07_04"
TEX = "//texturas_512/empresa_brasil/"
LOTE = (332.25, 363.05, 47.95, 81.385)          # x0 x1 y0 y1 (inclui os muros do proprio lote; o muro do vizinho norte fica)
FZ = 0.17                                        # piso acabado (o COL_Cid_Quadra do lote esta em 0,15)
V = Vector
STATS = {}


# =============================================================================== colecoes
def colecao(nome, pai):
    c = bpy.data.collections.get(nome)
    if c is None:
        c = bpy.data.collections.new(nome)
    p = bpy.data.collections[pai] if pai else bpy.context.scene.collection
    if c.name not in p.children.keys():
        p.children.link(c)
    return c


CV = colecao("EB_Empresa_Brasil_VISUAL", "CITY_S07_04_VISUAL")
CC = colecao("EB_Empresa_Brasil_COLISAO", "CITY_S07_04_COLLISION")
CM = colecao("EB_Empresa_Brasil_MARCADORES", "CITY_S07_04_MARKERS")
CE = colecao("EB_Empresa_Brasil_ESTOQUE", None)


def limpar_anterior():
    n = 0
    for c in (CV, CC, CM, CE, bpy.data.collections.get("EB_Empresa_Brasil_DINAMICO")):
        if c is None: continue
        for o in list(c.all_objects):
            bpy.data.objects.remove(o, do_unlink=True); n += 1
    for me in list(bpy.data.meshes):
        if me.users == 0 and (me.name.startswith(("EB_", "P_EB_"))):
            bpy.data.meshes.remove(me)
    return n


# =============================================================================== limpeza do lote antigo
def dentro_lote(x, y, folga=0.0):
    return LOTE[0] - folga < x < LOTE[1] + folga and LOTE[2] - folga < y < LOTE[3] + folga


def apagar_ilhas(me, rotulo):
    """Apaga as ilhas (faces ligadas por aresta) cujo centro da caixa esta no lote e que nao passam 0,35 m dele."""
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    visto, apagar, cruzam = set(), [], []
    for f in bm.faces:
        if f.index in visto: continue
        ilha = [f]; visto.add(f.index); k = 0
        while k < len(ilha):
            g = ilha[k]; k += 1
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in visto:
                        visto.add(h.index); ilha.append(h)
        xs = [v.co.x for g in ilha for v in g.verts]; ys = [v.co.y for g in ilha for v in g.verts]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        if dentro_lote((x0 + x1) / 2, (y0 + y1) / 2) and dentro_lote(x0, y0, 0.35) and dentro_lote(x1, y1, 0.35):
            apagar += ilha
        elif x1 > LOTE[0] and x0 < LOTE[1] and y1 > LOTE[2] and y0 < LOTE[3]:
            # cruza a borda: apaga so as faces com centro no lote (chao/calcada continua de fora)
            dentro = [g for g in ilha if dentro_lote(*g.calc_center_median().xy)]
            if dentro and len(dentro) < len(ilha) and (x1 - x0) < 40 and (y1 - y0) < 40:
                cruzam.append((len(ilha), len(dentro), round(x0, 1), round(x1, 1), round(y0, 1), round(y1, 1)))
                apagar += dentro
    n = len(apagar)
    bmesh.ops.delete(bm, geom=list(set(apagar)), context="FACES")
    bm.to_mesh(me); me.update(); bm.free()
    STATS["apagado_" + rotulo] = n
    if cruzam: STATS["cruzam_" + rotulo] = cruzam[:6]
    return n


def limpar_lote():
    ed = bpy.data.objects["S07_04_Edificios"]
    apagar_ilhas(ed.data, "edificios")
    base = bpy.data.meshes.get(ed.data.name + "__base70")
    if base: apagar_ilhas(base, "edificios_base70")
    for nm in ("S07_04_Edificios_LOD1", "S07_04_Silhueta_LOD2", "S07_04_Vegetacao_LOD2"):
        o = bpy.data.objects.get(nm)
        if o: apagar_ilhas(o.data, nm)
    # props/vegetacao/colisores com o centro dentro do lote
    rem = []
    for cn in ("CITY_S07_04_PROPS", "CITY_S07_04_VEGETATION", "CITY_S07_04_COLLISION"):
        for o in list(bpy.data.collections[cn].objects):
            if o.get("cid_etapa") == ETAPA: continue
            nm = o.name.split(".")[0]
            if nm in ("COL_Cid_Chao", "COL_Cid_Quadra", "COL_Cid_Quadra_Faixa", "COL_Cid_Calcada"): continue
            m = o.matrix_basis
            if o.parent: m = o.parent.matrix_world @ o.matrix_parent_inverse @ m
            p = m.translation
            if dentro_lote(p.x, p.y):
                rem.append(o.name); bpy.data.objects.remove(o, do_unlink=True)
    STATS["objetos_removidos"] = rem


# =============================================================================== materiais
CAT = json.load(open(bpy.path.abspath(TEX + "_catalogo.json"), encoding="utf-8"))
PALETA = {k: tuple(v) for k, v in CAT["paleta"].items()}       # retangulo UV (u0, v0, u1, v1) da celula de cada cor
PAL_M = CAT.get("paleta_celula_m", 0.5)
TILE = {}          # metros por repeticao da textura (UV em metros do mundo / TILE)
TROCA_UV = set()   # materiais com u/v trocados (ondulado: ondas na vertical nas paredes e no caimento do telhado)


def imagem(rel, cor=True):
    cam = bpy.path.abspath(rel)
    for im in bpy.data.images:
        if im.filepath and os.path.normcase(bpy.path.abspath(im.filepath)) == os.path.normcase(cam):
            im.colorspace_settings.name = "sRGB" if cor else "Non-Color"
            return im
    im = bpy.data.images.load(rel, check_existing=True)
    im.colorspace_settings.name = "sRGB" if cor else "Non-Color"
    return im


def media_lin(im):
    import numpy as np
    px = np.empty(len(im.pixels), dtype=np.float32); im.pixels.foreach_get(px)
    px = px.reshape(-1, 4)[::7, :3]
    lin = np.where(px <= 0.04045, px / 12.92, ((px + 0.055) / 1.055) ** 2.4)
    return [float(v) for v in lin.mean(axis=0)]


def material(nome, cor=(0.8, 0.8, 0.8), rug=0.5, metal=0.0, tex=None, normal=None, tile=1.0, emis=None, emis_forca=1.0,
             alfa=None, dois_lados=False, emis_tex=False):
    """cor = cor LINEAR desejada; com textura, a tinta = cor / media linear da textura (limitada a 1, como no 80)."""
    m = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (400, 0)
    b = nt.nodes.new("ShaderNodeBsdfPrincipled"); b.location = (100, 0)
    nt.links.new(b.outputs[0], out.inputs[0])
    b.inputs["Roughness"].default_value = rug
    b.inputs["Metallic"].default_value = metal
    if tex:
        im = imagem(tex, True)
        b_ = os.path.basename(tex)
        chave = b_[3:-8] if b_.startswith("eb_") and b_.endswith("_cor.jpg") else None
        media = CAT.get(chave, {}).get("media_linear") if chave else None
        if media is None:
            media = media_lin(im)
        tinta = [min(1.0, c / max(mv, 1e-3)) for c, mv in zip(cor, media)] if cor else [1.0, 1.0, 1.0]
        ti = nt.nodes.new("ShaderNodeTexImage"); ti.image = im; ti.location = (-600, 200)
        if max(abs(t - 1.0) for t in tinta) > 1e-3:
            mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.location = (-250, 200)
            mx.inputs["Factor"].default_value = 1.0
            mx.inputs[7].default_value = (*tinta, 1.0)
            nt.links.new(ti.outputs["Color"], mx.inputs[6])
            nt.links.new(mx.outputs[2], b.inputs["Base Color"])
        else:
            nt.links.new(ti.outputs["Color"], b.inputs["Base Color"])
        if emis_tex:
            nt.links.new(ti.outputs["Color"], b.inputs["Emission Color"])
            b.inputs["Emission Strength"].default_value = emis_forca
        m["eb_tinta"] = tinta
    else:
        b.inputs["Base Color"].default_value = (*cor, 1.0)
    if normal:
        tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = imagem(normal, False); tn.location = (-600, -200)
        nm = nt.nodes.new("ShaderNodeNormalMap"); nm.location = (-250, -200)
        nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    if emis:
        b.inputs["Emission Color"].default_value = (*emis, 1.0)
        b.inputs["Emission Strength"].default_value = emis_forca
    if alfa is not None:
        b.inputs["Alpha"].default_value = alfa
        try: m.surface_render_method = "BLENDED"
        except Exception: pass
        try: m.blend_method = "BLEND"
        except Exception: pass
    m.use_backface_culling = not dois_lados
    m.diffuse_color = (*(cor or (0.8, 0.8, 0.8)), 1.0 if alfa is None else alfa)
    m["cid_etapa"] = ETAPA
    TILE[nome] = tile
    return nome


P = lambda c: TEX + "eb_" + c + "_cor.jpg"          # texturas 512 do 81a (nomes unicos)
N = lambda c: TEX + "eb_" + c + "_normal.jpg"
CF, CW, PL = "piso_concreto", "patio_concreto", "reboco"
MP_, GV, WD = "metal_pintado", "galvanizado", "madeira_palete"


def criar_materiais():
    M = {}
    M["piso"] = material("EB_Piso_Epoxi", (0.21, 0.235, 0.215), 0.32, tex=P(CF), normal=N(CF), tile=2.5)
    M["patio"] = material("EB_Patio_Concreto", (0.33, 0.33, 0.31), 0.85, tex=P(CW), tile=3.0)
    M["alv_ext"] = material("EB_Alvenaria_Externa", (0.30, 0.31, 0.32), 0.85, tex=P(PL), normal=N(PL), tile=2.0)
    M["alv_int"] = material("EB_Alvenaria_Interna", (0.62, 0.63, 0.62), 0.8, tex=P(PL), normal=N(PL), tile=2.0)
    M["muro"] = material("EB_Muro_Reboco", (0.55, 0.50, 0.40), 0.9, tex=P(PL), normal=N(PL), tile=2.0)
    M["chapa_ext"] = material("EB_Chapa_Fachada", (0.62, 0.64, 0.65), 0.45, 0.3, tex="//texturas_512/metal_ondulado.jpg", tile=2.0)
    M["chapa_int"] = material("EB_Chapa_Interna", (0.42, 0.43, 0.44), 0.5, 0.5, tex="//texturas_512/metal_ondulado.jpg", tile=2.0)
    M["telha"] = material("EB_Telha_Metalica", (0.36, 0.37, 0.38), 0.5, 0.5, tex="//texturas_512/metal_ondulado.jpg", tile=2.0)
    TROCA_UV.update({"EB_Chapa_Fachada", "EB_Chapa_Interna", "EB_Telha_Metalica"})
    M["policarb"] = material("EB_Telha_Translucida", (0.42, 0.47, 0.47), 0.25, 0.0)
    M["policarb_luz"] = material("EB_Telha_Translucida_Luz", (0.80, 0.83, 0.82), 0.3, emis=(0.75, 0.78, 0.76), emis_forca=0.9)
    M["inox"] = material("EB_Aco_Inox", (0.62, 0.63, 0.64), 0.22, 1.0, tex=TEX + "eb_inox.jpg", tile=1.6)
    M["galv"] = material("EB_Aco_Galvanizado", (0.42, 0.43, 0.43), 0.45, 0.9, tex=P(GV), normal=N(GV), tile=1.2)
    M["grade"] = material("EB_Piso_Grade", None, 0.5, 0.8, tex=TEX + "eb_grade.jpg", tile=0.5)
    material("EB_Paleta", None, 0.45, 0.25, tex=TEX + "eb_paleta.png", normal=TEX + "eb_paleta_n.png", tile=1.0)
    material("EB_Paleta_Luz", None, 0.4, 0.0, tex=TEX + "eb_paleta.png", emis_tex=True, emis_forca=3.0, tile=1.0)
    for nome in ("amarelo", "cinza", "azul", "verde", "vermelho", "preto", "borracha", "tinta_amarela", "tinta_verde", "kraft"):
        M[nome] = "EB_Paleta#" + nome
    for nome in ("luz", "led_verde", "led_vermelho", "led_amarelo", "visor"):
        M[nome] = "EB_Paleta_Luz#" + nome
    M["isopainel"] = material("EB_Isopainel", None, 0.38, 0.15, tex=TEX + "eb_isopainel_cor.jpg", normal=N(MP_), tile=1.0)
    M["azulejo"] = material("EB_Azulejo", None, 0.12, tex=P("azulejo"), normal=N("azulejo"), tile=0.8)
    M["epoxi"] = material("EB_Epoxi_Branco", None, 0.16, tex=TEX + "eb_epoxi_cor.jpg", normal=N(CF), tile=3.0)
    M["madeira"] = material("EB_Madeira_Palete", (0.42, 0.29, 0.17), 0.85, tex=P(WD), tile=0.9)
    M["vidro"] = material("EB_Vidro", (0.55, 0.65, 0.70), 0.05, alfa=0.22, dois_lados=True)
    M["vidro_esc"] = material("EB_Vidro_Escuro", (0.025, 0.035, 0.045), 0.08, 0.5)
    M["cortina"] = material("EB_Cortina_PVC", (0.55, 0.70, 0.78), 0.2, alfa=0.35, dois_lados=True)
    M["atlas"] = material("EB_Atlas", None, 0.6, tex=TEX + "eb_atlas.png", tile=1.0)
    M["telas"] = material("EB_Telas", None, 0.25, tex=TEX + "eb_telas.png", emis_tex=True, emis_forca=1.4, tile=1.0)
    M["telas_f"] = material("EB_Telas_Fosco", None, 0.55, tex=TEX + "eb_telas.png", tile=1.0)
    M["oficina"] = material("EB_Oficina", None, 0.6, tex=TEX + "eb_oficina.png", tile=1.0)
    M["xadrez"] = material("EB_Chapa_Xadrez", (0.42, 0.43, 0.44), 0.45, 0.7, tex=TEX + "eb_xadrez.jpg", tile=0.4)
    M["emulsao"] = material("EB_Emulsao", (0.36, 0.22, 0.11), 0.2)
    M["tela"] = material("EB_Atlas_Tela", None, 0.2, tex=TEX + "eb_atlas.png", emis_tex=True, emis_forca=1.6, tile=1.0)
    M["isolamento"] = M["galv"]
    return M


# =============================================================================== kit de geometria
REG = {  # regioes do atlas (px, origem em cima a esquerda) - ver 81a
    "letreiro": (0, 0, 1024, 128), "PREPARO": (4, 132, 252, 252), "ENSAQUE": (260, 132, 508, 252), "SALA": (516, 132, 764, 252),
    "SECADOR": (772, 132, 1020, 252), "MP_MALTE": (4, 260, 252, 380), "MP_MIX": (260, 260, 508, 380), "PA": (516, 260, 764, 380),
    "CARGA": (772, 260, 1020, 380), "EPI": (3, 387, 125, 509), "EXTINTOR": (131, 387, 253, 509), "QUENTE": (259, 387, 381, 509),
    "SAIDA": (387, 387, 509, 509), "T1": (515, 387, 637, 509), "T2": (643, 387, 765, 509), "T3": (771, 387, 893, 509),
    "LAVE": (899, 387, 1021, 509), "ZEBRA": (0, 512, 512, 640), "PISO_CARGA": (512, 512, 1024, 640),
    "SACO_MALTE": (0, 640, 256, 896), "SACO_MIX": (256, 640, 512, 896), "SACO_PROD": (512, 640, 768, 896), "KRAFT": (768, 640, 1024, 896),
    "TELA_SEC": (2, 898, 254, 1022), "TELA_TANQ": (258, 898, 510, 1022), "TELA_ALARM": (514, 898, 766, 1022), "TELA_ENS": (770, 898, 1022, 1022)}


def reg_uv(r, u, v):
    x0, y0, x1, y1 = REG[r]
    return ((x0 + 1 + (x1 - x0 - 2) * u) / 1024.0, 1.0 - (y1 - 1 - (y1 - y0 - 2) * v) / 1024.0)


def filetar(pts, R):
    """Troca cada quina do caminho por um arco de raio <= R (cotovelo), amostrado a cada ~15 graus."""
    P_ = [V(p) for p in pts]; out = [P_[0]]
    for i in range(1, len(P_) - 1):
        d1 = P_[i] - P_[i - 1]; L1_ = d1.length; d2 = P_[i + 1] - P_[i]; L2_ = d2.length
        if L1_ < 1e-6 or L2_ < 1e-6: continue
        d1.normalize(); d2.normalize()
        cs = max(-1.0, min(1.0, d1.dot(d2))); th = math.acos(cs)
        if th < 1e-3: out.append(P_[i]); continue
        Rr = min(R, 0.45 * min(L1_, L2_) / math.tan(th / 2))
        Lt = Rr * math.tan(th / 2)
        nin = d2 - d1 * cs
        if nin.length < 1e-6: out.append(P_[i]); continue
        nin.normalize()
        A_ = P_[i] - d1 * Lt; C_ = A_ + nin * Rr
        m_ = max(2, int(math.ceil(th / math.radians(15))))
        for j in range(m_ + 1):
            ph = th * j / m_
            out.append(C_ + (-nin * math.cos(ph) + d1 * math.sin(ph)) * Rr)
    out.append(P_[-1])
    return out


class K:
    """Acumula geometria de um objeto (coordenadas do mundo, objeto na origem)."""

    def __init__(s, nome, col=None):
        s.nome = nome; s.col = col if col is not None else CV
        s.bm = bmesh.new(); s.uv = s.bm.loops.layers.uv.new("UVMap"); s.mats = []

    def mi(s, m):
        m = m.split("#")[0]
        if m not in s.mats: s.mats.append(m)
        return s.mats.index(m)

    def _pal(s, faces, m):
        """Cor da paleta: cada face e projetada (caixa) dentro da celula da cor no atlas eb_paleta.png (PAL_M metros por
        celula). Face que cabe numa celula mantem a fase do mundo (faces vizinhas continuam a textura); maior, e reduzida."""
        u0, v0, u1, v1 = PALETA[m.split("#")[1]]
        for f in faces:
            f.normal_update()
            n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
            pts = []
            for l in f.loops:
                p = l.vert.co
                a, b = (p.x, p.y) if ax == 2 else ((p.y, p.z) if ax == 0 else (p.x, p.z))
                pts.append((a / PAL_M, b / PAL_M))
            amin = min(q[0] for q in pts); bmin = min(q[1] for q in pts)
            amax = max(q[0] for q in pts); bmax = max(q[1] for q in pts)
            fa, fb = math.floor(amin), math.floor(bmin)
            if amax - fa <= 0.999 and bmax - fb <= 0.999: oa, ob, sc = fa, fb, 1.0
            else: oa, ob, sc = amin, bmin, min(1.0, 0.999 / max(amax - amin, 1e-6), 0.999 / max(bmax - bmin, 1e-6))
            for l, (a, b) in zip(f.loops, pts):
                l[s.uv].uv = (u0 + (a - oa) * sc * (u1 - u0), v0 + (b - ob) * sc * (v1 - v0))

    def _uv_caixa(s, f, m):
        if "#" in m: return s._pal([f], m)
        t = TILE.get(m, 1.0)
        n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            p = l.vert.co
            if ax == 2: u, v = p.x * (1 if n.z >= 0 else -1), p.y
            elif ax == 0: u, v = p.y * (1 if n.x >= 0 else -1), p.z
            else: u, v = -p.x * (1 if n.y >= 0 else -1), p.z
            if m in TROCA_UV and ax != 2: u, v = v, u
            if m in TROCA_UV and ax == 2: u, v = p.y, p.x
            l[s.uv].uv = (u / t, v / t)

    def _orientar(s, faces, c):
        for f in faces:
            f.normal_update()
            if (f.calc_center_median() - c).dot(f.normal) < 0:
                f.normal_flip()

    def face(s, pts, m, uvs=None):
        vs = [s.bm.verts.new(p) for p in pts]
        f = s.bm.faces.new(vs); f.material_index = s.mi(m); f.normal_update()
        if uvs is None: s._uv_caixa(f, m)
        else:
            for l, uv in zip(f.loops, uvs): l[s.uv].uv = uv
        return f

    def solido(s, pts, faces_idx, m, mats=None):
        """Poliedro CONVEXO: pts e listas de indices; normais para fora pelo centroide."""
        vs = [s.bm.verts.new(p) for p in pts]
        c = sum((V(p) for p in pts), V()) / len(pts)
        fs = []
        for i, idx in enumerate(faces_idx):
            f = s.bm.faces.new([vs[j] for j in idx])
            mm = (mats[i] if mats and i < len(mats) and mats[i] else m)
            f.material_index = s.mi(mm); fs.append((f, mm))
        s._orientar([f for f, _ in fs], c)
        for f, mm in fs: s._uv_caixa(f, mm)
        return fs

    def caixaM(s, M, m, lados="xXyYzZ", mats=None):
        c = [M @ V((x, y, z)) for x in (-.5, .5) for y in (-.5, .5) for z in (-.5, .5)]
        F = {"x": (0, 1, 3, 2), "X": (4, 6, 7, 5), "y": (0, 4, 5, 1), "Y": (2, 3, 7, 6), "z": (0, 2, 6, 4), "Z": (1, 5, 7, 3)}
        idx = [F[k] for k in lados]
        mm = [(mats or {}).get(k) for k in lados]
        if len(lados) == 6:
            return s.solido(c, idx, m, mm)
        cen = sum(c, V()) / 8
        vs = [s.bm.verts.new(p) for p in c]
        out = []
        for k, ii in zip(lados, idx):
            f = s.bm.faces.new([vs[j] for j in ii]); mk = (mats or {}).get(k) or m
            f.material_index = s.mi(mk); out.append((f, mk))
        s._orientar([f for f, _ in out], cen)
        for f, mk in out: s._uv_caixa(f, mk)
        return out

    def caixa(s, x0, y0, z0, x1, y1, z1, m, lados="xXyYzZ", mats=None):
        if x1 < x0: x0, x1 = x1, x0
        if y1 < y0: y0, y1 = y1, y0
        if z1 < z0: z0, z1 = z1, z0
        M = Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)) @ Matrix.Diagonal((x1 - x0, y1 - y0, z1 - z0, 1))
        return s.caixaM(M, m, lados, mats)

    def caixa_giro(s, cx, cy, z0, sx, sy, z1, yaw, m, lados="xXyYzZ"):
        M = Matrix.Translation((cx, cy, (z0 + z1) / 2)) @ Matrix.Rotation(yaw, 4, "Z") @ Matrix.Diagonal((sx, sy, z1 - z0, 1))
        return s.caixaM(M, m, lados)

    def viga(s, p0, p1, w, h, m, up=V((0, 0, 1))):
        p0, p1 = V(p0), V(p1)
        d = p1 - p0; L = d.length
        if L < 1e-6: return
        x = d / L
        u = up if abs(x.dot(up)) < 0.98 else V((0, 1, 0))
        y = u.cross(x).normalized(); z = x.cross(y)
        R = Matrix((x, y, z)).transposed().to_4x4()
        return s.caixaM(Matrix.Translation((p0 + p1) / 2) @ R @ Matrix.Diagonal((L, w, h, 1)), m)

    def torno(s, base, eixo, perfil, n, m, tampa0=True, tampa1=True, ang0=0.0):
        """Solido de revolucao: perfil [(raio, altura)] com altura crescente (superficie externa)."""
        base = V(base); z = V(eixo).normalized()
        x = V((1, 0, 0)) if abs(z.x) < 0.9 else V((0, 1, 0))
        x = (x - z * x.dot(z)).normalized(); y = z.cross(x)
        if ang0:
            x, y = x * math.cos(ang0) + y * math.sin(ang0), -x * math.sin(ang0) + y * math.cos(ang0)
        t = TILE.get(m, 1.0); mi = s.mi(m)
        aneis, vparam, acum, prev = [], {}, 0.0, None
        rmed = max(r for r, _ in perfil) or 0.1
        for r, h in perfil:
            c = base + z * h
            if prev is not None: acum += math.hypot(r - prev[0], h - prev[1])
            prev = (r, h)
            if r < 1e-5:
                v = s.bm.verts.new(c); vparam[v] = (0.0, acum / t); aneis.append(("p", v))
            else:
                ring = []
                for i in range(n + 1):
                    a = 2 * math.pi * i / n
                    v = s.bm.verts.new(c + (x * math.cos(a) + y * math.sin(a)) * r)
                    vparam[v] = (i / n * 2 * math.pi * rmed / t, acum / t); ring.append(v)
                aneis.append(("r", ring))
        fs = []
        for (ta, a), (tb, b) in zip(aneis, aneis[1:]):
            for i in range(n):
                if ta == "r" and tb == "r": q = [a[i], a[i + 1], b[i + 1], b[i]]
                elif ta == "p" and tb == "r": q = [a, b[i + 1], b[i]]
                elif ta == "r" and tb == "p": q = [a[i], a[i + 1], b]
                else: continue
                try: f = s.bm.faces.new(q)
                except ValueError: continue
                f.material_index = mi; fs.append(f)
        for f in fs:
            for l in f.loops: l[s.uv].uv = vparam[l.vert]
        caps = []
        if tampa0 and aneis[0][0] == "r": caps.append((list(reversed(aneis[0][1][:n])), base + z * perfil[0][1]))
        if tampa1 and aneis[-1][0] == "r": caps.append((aneis[-1][1][:n], base + z * perfil[-1][1]))
        for vs, c in caps:
            f = s.bm.faces.new(vs); f.material_index = mi
            for l in f.loops:
                d = l.vert.co - c; l[s.uv].uv = (d.dot(x) / t, d.dot(y) / t)
            fs.append(f)
        for f in fs: f.normal_update()
        if "#" in m: s._pal(fs, m)
        return fs

    def cil(s, p0, p1, r, m, n=12, tampas=True, r1=None):
        p0, p1 = V(p0), V(p1); d = p1 - p0
        return s.torno(p0, d, [(r, 0.0), (r if r1 is None else r1, d.length)], n, m, tampas, tampas)

    def esfera(s, c, r, m, n=10, aneis=6):
        perf = [(r * math.sin(math.pi * k / aneis), -r * math.cos(math.pi * k / aneis)) for k in range(aneis + 1)]
        perf[0] = (0.0, -r); perf[-1] = (0.0, r)
        return s.torno(V(c), V((0, 0, 1)), perf, n, m, False, False)

    def varrer(s, caminho, r, m, n=12, tampas=True):
        """Tubo continuo ao longo de um caminho (aneis com transporte paralelo; curvas ja amostradas)."""
        P_ = [V(p) for p in caminho]
        Tg = []
        for i in range(len(P_)):
            if i == 0: t = P_[1] - P_[0]
            elif i == len(P_) - 1: t = P_[-1] - P_[-2]
            else: t = (P_[i] - P_[i - 1]).normalized() + (P_[i + 1] - P_[i]).normalized()
            Tg.append(t.normalized())
        nr = V((0, 0, 1)) if abs(Tg[0].z) < 0.9 else V((1, 0, 0))
        nr = (nr - Tg[0] * nr.dot(Tg[0])).normalized()
        tt = TILE.get(m, 1.0); mi = s.mi(m)
        aneis, acum, criadas = [], 0.0, []
        for i, (p, t) in enumerate(zip(P_, Tg)):
            if i > 0:
                acum += (P_[i] - P_[i - 1]).length
                q = nr - t * nr.dot(t)
                nr = q.normalized() if q.length > 1e-6 else nr
            b = t.cross(nr)
            esc = 1.0
            if 0 < i < len(P_) - 1:
                esc = 1.0 / max(0.6, (P_[i] - P_[i - 1]).normalized().dot(t))
            ring = []
            for k in range(n + 1):
                a = 2 * math.pi * k / n
                ring.append((s.bm.verts.new(p + (nr * math.cos(a) + b * math.sin(a)) * r * esc), (k / n * 2 * math.pi * r / tt, acum / tt)))
            aneis.append(ring)
        for A, B in zip(aneis, aneis[1:]):
            for k in range(n):
                f = s.bm.faces.new([A[k][0], A[k + 1][0], B[k + 1][0], B[k][0]]); f.material_index = mi; criadas.append(f)
                for l, uv in zip(f.loops, (A[k][1], A[k + 1][1], B[k + 1][1], B[k][1])): l[s.uv].uv = uv
        if tampas:
            for ring, sg in ((aneis[0], -1), (aneis[-1], 1)):
                vs = [v for v, _ in ring[:n]]
                f = s.bm.faces.new(vs if sg > 0 else list(reversed(vs))); f.material_index = mi; criadas.append(f)
                for l in f.loops: l[s.uv].uv = (l.vert.co.x / tt, l.vert.co.y / tt)
        if "#" in m: s._pal(criadas, m)

    def tubo(s, pts, r, m, n=10, juntas=True, flanges=False, raio_curva=None):
        pts = [V(p) for p in pts]
        s.varrer(filetar(pts, raio_curva or max(2.0 * r, 0.12)), r, m, n)
        if flanges:
            for a, b in zip(pts, pts[1:]):
                d = (b - a); L = d.length
                if L < 0.6: continue
                d.normalize()
                for p in (a + d * 0.2, b - d * 0.2):
                    s.cil(p - d * 0.025, p + d * 0.025, r * 1.6, m, n, True)

    def placa(s, c, du, dv, w, h, reg, m="EB_Atlas", verso=False):
        c, du, dv = V(c), V(du).normalized(), V(dv).normalized()
        pts = [c - du * w / 2 - dv * h / 2, c + du * w / 2 - dv * h / 2, c + du * w / 2 + dv * h / 2, c - du * w / 2 + dv * h / 2]
        uvs = [reg_uv(reg, 0, 0), reg_uv(reg, 1, 0), reg_uv(reg, 1, 1), reg_uv(reg, 0, 1)]
        f = s.face(pts, m, uvs)
        if verso:
            nrm = du.cross(dv)
            pts2 = [p - nrm * 0.004 for p in (c + du * w / 2 - dv * h / 2, c - du * w / 2 - dv * h / 2, c - du * w / 2 + dv * h / 2, c + du * w / 2 + dv * h / 2)]
            s.face(pts2, m, uvs)
        return f

    def fechar(s, suave_ang=None):
        me = bpy.data.meshes.new(s.nome)
        s.bm.to_mesh(me); s.bm.free()
        for nm in s.mats: me.materials.append(bpy.data.materials[nm])
        if suave_ang:
            for p in me.polygons: p.use_smooth = True
            try: me.set_sharp_from_angle(angle=math.radians(suave_ang))
            except Exception: pass
        o = bpy.data.objects.new(s.nome, me)
        o["cid_etapa"] = ETAPA; o["setor"] = SETOR
        s.col.objects.link(o)
        me.calc_loop_triangles()
        STATS.setdefault("tris", {})[s.nome] = len(me.loop_triangles)
        return o


# =============================================================================== colisao e marcadores
def col(tipo, x0, y0, z0, x1, y1, z1):
    cub = bpy.data.meshes.get("COL_cubo")
    o = bpy.data.objects.new("COL_Cid_" + tipo, cub)
    o.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    o.scale = (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))
    o.display_type = "WIRE"; o.hide_render = True
    o["cid_etapa"] = ETAPA; o["setor"] = SETOR
    CC.objects.link(o)
    return o


def col_giro(tipo, cx, cy, z0, sx, sy, z1, yaw):
    o = col(tipo, cx - sx / 2, cy - sy / 2, z0, cx + sx / 2, cy + sy / 2, z1)
    o.rotation_euler = (0, 0, yaw)
    return o


def marcador(nome, x, y, z, yaw_graus=0.0, **props):
    o = bpy.data.objects.new(nome, None)
    o.empty_display_type = "ARROWS"; o.empty_display_size = 0.5
    o.location = (x, y, z); o.rotation_euler = (0, 0, math.radians(yaw_graus))
    o["cid_etapa"] = ETAPA; o["setor"] = SETOR
    for k, v in props.items(): o[k] = v
    CM.objects.link(o)
    return o


# =============================================================================== medidas gerais
GX0, GX1, GY0, GY1 = 333.5, 360.0, 49.2, 80.3          # galpao (face externa)
T = 0.2
IX0, IX1, IY0, IY1 = GX0 + T, GX1 - T, GY0 + T, GY1 - T
BEIRAL, CUME = 12.0, 14.0
YC = (GY0 + GY1) / 2                                    # cumeeira ao longo de x (oitoes para leste/oeste)
INCL = (CUME - BEIRAL) / (YC - GY0)
ZBLOCO = 1.4                                            # alvenaria embaixo, chapa em cima
PORTA_CAM = (50.4, 55.4, 5.2)                           # portao de enrolar no oitao leste (y0, y1, altura)
PORTA_PES = (58.2, 59.4, 2.3)
PILAR_X = [340.1, 346.75, 353.4]                       # tesouras / pilares das fachadas longas
PILAR_Y = [57.0, 72.5]                                  # pilares dos oitoes
CHORD = 11.4                                            # banzo inferior das tesouras


def z_telhado(y):
    return CUME - abs(y - YC) * INCL


# =============================================================================== patio, muros, portao
def patio_e_muros(M):
    k = K("EB_Patio_Muros")
    x0, x1, y0, y1 = 332.47, 362.85, 48.15, 81.23
    for a in ((x0, y0, GX0, y1), (GX1, y0, x1, y1), (GX0, y0, GX1, GY0), (GX0, GY1, GX1, y1)):
        k.caixa(a[0], a[1], 0.10, a[2], a[3], FZ, M["patio"], lados="Z")
    # faixas amarelas no patio (borda do portao e caminho de pedestre)
    k.caixa(GX1 + 0.3, 48.5, FZ, GX1 + 0.4, 57.6, FZ + 0.004, M["tinta_amarela"], lados="Z")
    for yy in (48.6, 57.5):
        k.caixa(GX1 + 0.3, yy, FZ, 362.6, yy + 0.1, FZ + 0.004, M["tinta_amarela"], lados="Z")
    # muros: 2,4 m, pilaretes a cada 3 m, capa
    H, E = 2.55, 0.15

    def muro(ax, ay, bx, by):
        horiz = abs(by - ay) < 1e-6
        if horiz:
            k.caixa(ax, ay - E / 2, 0.15, bx, ay + E / 2, H, M["muro"])
            k.caixa(ax - 0.02, ay - E / 2 - 0.04, H, bx + 0.02, ay + E / 2 + 0.04, H + 0.06, M["alv_int"])
            k.caixa(ax, ay - E / 2 - 0.005, 0.15, bx, ay + E / 2 + 0.005, 0.45, M["alv_ext"])
            L = bx - ax; n = max(1, int(round(L / 3.0)))
            for i in range(n + 1):
                x = ax + L * i / n
                k.caixa(x - 0.15, ay - 0.15, 0.15, x + 0.15, ay + 0.15, H + 0.12, M["muro"])
                k.caixa(x - 0.18, ay - 0.18, H + 0.12, x + 0.18, ay + 0.18, H + 0.18, M["alv_int"])
            col("Muro", ax, ay - E / 2, 0.15, bx, ay + E / 2, H)
        else:
            k.caixa(ax - E / 2, ay, 0.15, ax + E / 2, by, H, M["muro"])
            k.caixa(ax - E / 2 - 0.04, ay - 0.02, H, ax + E / 2 + 0.04, by + 0.02, H + 0.06, M["alv_int"])
            k.caixa(ax - E / 2 - 0.005, ay, 0.15, ax + E / 2 + 0.005, by, 0.45, M["alv_ext"])
            L = by - ay; n = max(1, int(round(L / 3.0)))
            for i in range(n + 1):
                y = ay + L * i / n
                k.caixa(ax - 0.15, y - 0.15, 0.15, ax + 0.15, y + 0.15, H + 0.12, M["muro"])
                k.caixa(ax - 0.18, y - 0.18, H + 0.12, ax + 0.18, y + 0.18, H + 0.18, M["alv_int"])
            col("Muro", ax - E / 2, ay, 0.15, ax + E / 2, by, H)

    muro(332.4, 48.075, 362.92, 48.075)          # sul
    muro(332.4, 81.305, 362.92, 81.305)          # norte (o do vizinho fica do outro lado)
    muro(332.395, 48.15, 332.395, 81.23)         # oeste
    muro(362.925, 57.8, 362.925, 81.23)          # leste (rua), depois do portao
    # pilares do portao (y 48,4 - 57,6) + placa
    for yy in (48.15, 57.5):
        k.caixa(362.6, yy, 0.15, 363.0, yy + 0.4, 3.0, M["alv_ext"])
        k.caixa(362.55, yy - 0.05, 3.0, 363.05, yy + 0.45, 3.08, M["alv_int"])
        col("Muro", 362.6, yy, 0.15, 363.0, yy + 0.4, 3.0)
    # portao de correr (aberto, estacionado por dentro do muro leste)
    g = K("EB_Portao")
    gx = 362.42
    g.caixa(gx - 0.04, 57.9, 0.22, gx + 0.04, 67.3, 0.32, M["verde"])
    g.caixa(gx - 0.04, 57.9, 2.28, gx + 0.04, 67.3, 2.36, M["verde"])
    for i in range(48):
        y = 58.0 + i * 0.19
        g.caixa(gx - 0.012, y, 0.32, gx + 0.012, y + 0.024, 2.28, M["verde"])
    for y in (57.9, 62.6, 67.22):
        g.caixa(gx - 0.04, y, 0.22, gx + 0.04, y + 0.08, 2.36, M["verde"])
    for y in (58.4, 66.8):
        g.cil((gx, y, 0.19), (gx, y, 0.25), 0.07, M["preto"], 10)
    g.caixa(gx - 0.03, 57.6, FZ, gx + 0.03, 67.5, FZ + 0.03, M["galv"])       # trilho
    g.fechar()
    col("Muro", gx - 0.05, 57.9, 0.15, gx + 0.05, 67.3, 2.36)
    # totem com a marca
    t = K("EB_Totem")
    t.caixa(361.7, 60.8, FZ, 362.1, 62.2, 2.9, M["verde"])
    t.caixa(361.65, 60.75, 2.9, 362.15, 62.25, 2.98, M["alv_int"])
    for xf, du in ((362.105, (0, 1, 0)), (361.695, (0, -1, 0))):
        t.placa((xf, 61.5, 2.45), du, (0, 0, 1), 1.36, 0.17, "letreiro")
        t.placa((xf, 61.5, 1.75), du, (0, 0, 1), 1.2, 0.58, "PA")
    t.fechar()
    col("EB_Equipamento", 361.7, 60.8, 0.15, 362.1, 62.2, 2.9)
    k.fechar()


# =============================================================================== galpao
def galpao(M):
    k = K("EB_Galpao_Paredes")
    mats_lado = lambda ext, inn, eixo, sinal: None

    def parede_x(x0, x1, ya, yb, z0, z1, ext_lado):
        """Parede ao longo de y (oitao leste/oeste). ext_lado 'x' (oeste) ou 'X' (leste)."""
        inn = "X" if ext_lado == "x" else "x"
        if z0 < ZBLOCO:
            zb = min(z1, ZBLOCO)
            k.caixa(x0, ya, z0, x1, yb, zb, M["alv_ext"], mats={ext_lado: M["alv_ext"], inn: M["alv_int"]})
        if z1 > ZBLOCO:
            za = max(z0, ZBLOCO)
            k.caixa(x0, ya, za, x1, yb, z1, M["chapa_ext"], mats={ext_lado: M["chapa_ext"], inn: M["chapa_int"]})

    def parede_y(xa, xb, y0, y1, z0, z1, ext_lado):
        inn = "Y" if ext_lado == "y" else "y"
        if z0 < ZBLOCO:
            k.caixa(xa, y0, z0, xb, y1, min(z1, ZBLOCO), M["alv_ext"], mats={ext_lado: M["alv_ext"], inn: M["alv_int"]})
        if z1 > ZBLOCO:
            k.caixa(xa, y0, max(z0, ZBLOCO), xb, y1, z1, M["chapa_ext"], mats={ext_lado: M["chapa_ext"], inn: M["chapa_int"]})

    z0 = 0.15
    # fachadas longas (sul e norte) ate o beiral
    parede_y(GX0, GX1, GY0, IY0, z0, BEIRAL, "y")
    parede_y(GX0, GX1, IY1, GY1, z0, BEIRAL, "Y")
    col("EB_Parede", GX0, GY0, z0, GX1, IY0, BEIRAL)
    col("EB_Parede", GX0, IY1, z0, GX1, GY1, BEIRAL)
    # oitao oeste (inteiro)
    parede_x(GX0, IX0, IY0, IY1, z0, BEIRAL, "x")
    col("EB_Parede", GX0, IY0, z0, IX0, IY1, BEIRAL)
    # oitao leste com o portao de enrolar e a porta de pedestre
    cy0, cy1, ch = PORTA_CAM
    py0, py1, ph = PORTA_PES
    segs = [(IY0, cy0, 0), (cy0, cy1, ch), (cy1, py0, 0), (py0, py1, ph), (py1, IY1, 0)]
    for ya, yb, zb in segs:
        parede_x(IX1, GX1, ya, yb, zb if zb else z0, BEIRAL, "X")
        if zb == 0: col("EB_Parede", IX1, ya, z0, GX1, yb, BEIRAL)
    # triangulos dos oitoes (acima do beiral)
    for xa, xb, ext, mi in ((GX0, IX0, "x", 0), (IX1, GX1, "X", 1)):
        pts = [V((xa, GY0, BEIRAL)), V((xa, GY1, BEIRAL)), V((xa, YC, CUME - 0.12)),
               V((xb, GY0, BEIRAL)), V((xb, GY1, BEIRAL)), V((xb, YC, CUME - 0.12))]
        mats = [M["chapa_ext"] if ext == "x" else M["chapa_int"], M["chapa_int"] if ext == "x" else M["chapa_ext"], None, None, None]
        k.solido(pts, [(0, 1, 2), (3, 4, 5), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], M["chapa_ext"], mats)
    # pilares de concreto pre-moldado (fora) e colunas de aco (dentro)
    for x in [GX0] + PILAR_X + [GX1]:
        for y, s in ((GY0, -1), (GY1, 1)):
            xa = max(GX0 - 0.1, x - 0.2) if x != GX0 else GX0 - 0.15
            xb = min(GX1 + 0.1, x + 0.2) if x != GX1 else GX1 + 0.15
            k.caixa(xa, y if s > 0 else y - 0.25, 0.15, xb, y + 0.25 if s > 0 else y, BEIRAL + 0.05, M["alv_ext"])
    for y in PILAR_Y + [YC]:
        for x, s in ((GX0, -1), (GX1, 1)):
            if y == YC and x == GX1: continue      # o letreiro ocupa o meio do oitao leste
            k.caixa(x if s > 0 else x - 0.25, y - 0.2, 0.15, x + 0.25 if s > 0 else x, y + 0.2, z_telhado(y) - 0.05, M["alv_ext"])
    est = K("EB_Galpao_Estrutura")
    for x in PILAR_X:
        for y0_, y1_ in ((IY0, IY0 + 0.22), (IY1 - 0.22, IY1)):
            est.caixa(x - 0.15, y0_, 0.15, x + 0.15, y1_, CHORD, M["cinza"])
            col("EB_Coluna", x - 0.15, y0_, 0.15, x + 0.15, y1_, 3.0)
    for y in PILAR_Y:
        for x0_, x1_ in ((IX0, IX0 + 0.22), (IX1 - 0.22, IX1)):
            est.caixa(x0_, y - 0.15, 0.15, x1_, y + 0.15, z_telhado(y) - 0.3, M["cinza"])
            col("EB_Coluna", x0_, y - 0.15, 0.15, x1_, y + 0.15, 3.0)
    # rufo verde na transicao bloco/chapa e faixa verde/amarela alta
    for (xa, ya, xb, yb) in ((GX0 - 0.03, GY0 - 0.03, GX1 + 0.03, GY0), (GX0 - 0.03, GY1, GX1 + 0.03, GY1 + 0.03),
                             (GX0 - 0.03, GY0, GX0, GY1), (GX1, GY0, GX1 + 0.03, cy0), (GX1, cy1, GX1 + 0.03, py0), (GX1, py1, GX1 + 0.03, GY1)):
        k.caixa(xa, ya, ZBLOCO - 0.02, xb, yb, ZBLOCO + 0.1, M["tinta_verde"])
    for (xa, ya, xb, yb) in ((GX0 - 0.03, GY0 - 0.03, 339.9, GY0), (353.6, GY0 - 0.03, GX1 + 0.03, GY0), (GX0 - 0.03, GY1, GX1 + 0.03, GY1 + 0.03),
                             (GX0 - 0.03, GY0, GX0, GY1), (GX1, GY0, GX1 + 0.03, YC - 6.8), (GX1, YC + 6.8, GX1 + 0.03, GY1)):
        k.caixa(xa, ya, BEIRAL - 1.6, xb, yb, BEIRAL - 1.1, M["tinta_verde"])
        k.caixa(xa, ya, BEIRAL - 1.1, xb, yb, BEIRAL - 0.95, M["tinta_amarela"])
    # janelas altas (faixa de basculantes) nas fachadas longas: vidro escuro + caixilhos, dos dois lados da parede
    jan = K("EB_Galpao_Janelas")
    bays = [GX0] + PILAR_X + [GX1]
    for xa, xb in zip(bays, bays[1:]):
        xa += 0.5; xb -= 0.5
        for y, s in ((GY0, -1), (GY1, 1), (IY0, 1), (IY1, -1)):
            yy = y + s * 0.006
            zj0, zj1 = 7.4, 9.6
            jan.face([V((xa, yy, zj0)), V((xb, yy, zj0)), V((xb, yy, zj1)), V((xa, yy, zj1))][:: (1 if s < 0 else -1)], M["vidro_esc"])
            nmont = int((xb - xa) / 1.2)
            for i in range(nmont + 1):
                xm = xa + (xb - xa) * i / nmont
                jan.caixa(xm - 0.03, yy - 0.03 if s < 0 else yy, zj0, xm + 0.03, yy if s < 0 else yy + 0.03, zj1, M["cinza"])
            for zz in (zj0, (zj0 + zj1) / 2, zj1):
                jan.caixa(xa - 0.03, yy - 0.035 if s < 0 else yy, zz - 0.03, xb + 0.03, yy if s < 0 else yy + 0.035, zz + 0.03, M["cinza"])
    jan.fechar()
    # portao de enrolar (aberto): requadro zebrado, caixa do rolo, guias, cobertura externa
    pt = K("EB_Portao_Enrolar")
    for y in (cy0, cy1):
        s = -1 if y == cy0 else 1
        pt.caixa(IX1 - 0.12, y - (0.12 if s < 0 else 0), 0.15, GX1 + 0.05, y + (0.12 if s > 0 else 0), ch + 0.05, M["amarelo"])
        pt.placa((GX1 + 0.056, y + s * 0.06, 0.9), (0, 1, 0), (0, 0, 1), 0.12, 1.5, "ZEBRA")
        pt.caixa(IX1 - 0.3, y + s * 0.0 - 0.06, 0.15, IX1 - 0.12, y + 0.06, ch, M["galv"])      # guia
    pt.caixa(IX1 - 0.65, cy0 - 0.3, ch, IX1 - 0.02, cy1 + 0.3, ch + 0.62, M["galv"])          # caixa do rolo
    pt.cil((IX1 - 0.35, cy1 + 0.3, ch + 0.3), (IX1 - 0.35, cy1 + 0.55, ch + 0.3), 0.18, M["azul"], 12)  # motor
    pt.caixa(GX1, cy0 - 0.6, ch + 0.45, GX1 + 1.6, cy1 + 0.6, ch + 0.58, M["galv"])            # marquise
    for y in (cy0 - 0.5, cy1 + 0.5):
        pt.viga((GX1 + 1.5, y, ch + 0.58), (GX1 + 0.02, y, ch + 1.9), 0.04, 0.04, M["galv"])
    pt.cil((GX1 + 0.15, (cy0 + cy1) / 2, ch + 0.3), (GX1 + 0.4, (cy0 + cy1) / 2, ch + 0.3), 0.12, M["preto"], 10)  # refletor
    pt.cil((GX1 + 0.4, (cy0 + cy1) / 2, ch + 0.3), (GX1 + 0.41, (cy0 + cy1) / 2, ch + 0.3), 0.1, M["luz"], 10)
    # porta de pedestre (folha aberta para fora) + marquise + placa SAIDA por dentro
    pt.caixa(IX1 - 0.05, py0 - 0.08, 0.15, GX1 + 0.05, py0, ph + 0.08, M["cinza"])
    pt.caixa(IX1 - 0.05, py1, 0.15, GX1 + 0.05, py1 + 0.08, ph + 0.08, M["cinza"])
    pt.caixa(IX1 - 0.05, py0 - 0.08, ph, GX1 + 0.05, py1 + 0.08, ph + 0.08, M["cinza"])
    pt.caixa(GX1 + 0.02, py1 + 0.02, 0.2, GX1 + 1.12, py1 + 0.06, ph - 0.02, M["cinza"])      # folha a 90 graus
    pt.caixa(GX1 + 0.85, py1 + 0.06, 1.0, GX1 + 0.95, py1 + 0.1, 1.06, M["galv"])            # macaneta
    pt.caixa(GX1, py0 - 0.4, ph + 0.35, GX1 + 1.0, py1 + 0.4, ph + 0.45, M["galv"])
    pt.placa((IX1 - 0.06, (py0 + py1) / 2, ph + 0.35), (0, -1, 0), (0, 0, 1), 0.5, 0.5, "SAIDA")
    pt.fechar()
    col("EB_Parede", GX1, py1 + 0.02, 0.15, GX1 + 1.12, py1 + 0.06, ph)
    # letreiros: oitao leste e fachada sul
    lt = K("EB_Letreiros")
    lt.caixa(GX1 + 0.02, YC - 6.6, 9.7, GX1 + 0.12, YC + 6.6, 11.4, M["verde"])
    lt.placa((GX1 + 0.125, YC, 10.55), (0, 1, 0), (0, 0, 1), 13.0, 1.625, "letreiro")
    lt.caixa(346.75 - 6.6, GY0 - 0.38, 10.1, 346.75 + 6.6, GY0 - 0.28, 11.8, M["verde"])
    lt.placa((346.75, GY0 - 0.385, 10.95), (1, 0, 0), (0, 0, 1), 13.0, 1.625, "letreiro")
    for xb_ in (342.0, 345.0, 348.5, 351.5):
        for zb_ in (10.4, 11.5):
            lt.caixa(xb_ - 0.04, GY0 - 0.3, zb_ - 0.04, xb_ + 0.04, GY0, zb_ + 0.04, M["galv"])
    lt.placa((GX1 + 0.01, cy1 + 0.75, 3.3), (0, 1, 0), (0, 0, 1), 1.0, 0.5, "CARGA")
    lt.fechar()
    k.fechar()
    # piso interno (epoxi) + soleiras
    p = K("EB_Piso")
    p.caixa(IX0, IY0, 0.12, IX1, IY1, FZ, M["piso"], lados="Z")
    p.caixa(IX1, cy0, 0.12, GX1, cy1, FZ, M["piso"], lados="Z")
    p.caixa(IX1, py0, 0.12, GX1, py1, FZ, M["piso"], lados="Z")
    p.fechar()
    # telhado: duas aguas, chapa com espessura (face de baixo visivel de dentro), translucidas, lanternim, calhas
    tl = K("EB_Telhado")
    BE = 0.5                                     # beiral
    for sgn in (-1, 1):
        ya = YC; yb = (GY0 - BE) if sgn < 0 else (GY1 + BE)
        za, zb = CUME, z_telhado(GY0) - BE * INCL
        xa, xb = GX0 - 0.35, GX1 + 0.35
        pts = [V((xa, ya, za)), V((xb, ya, za)), V((xb, yb, zb)), V((xa, yb, zb)),
               V((xa, ya, za - 0.12)), V((xb, ya, za - 0.12)), V((xb, yb, zb - 0.12)), V((xa, yb, zb - 0.12))]
        tl.solido(pts, [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], M["telha"],
                  [M["telha"], M["chapa_int"], M["galv"], M["galv"], M["galv"], M["galv"]])
        # faixas translucidas (3 por agua), por cima e por baixo
        for xc in (338.2, 346.75, 355.3):
            for frac0, frac1 in ((0.18, 0.42), (0.55, 0.8)):
                y0_ = ya + (yb - ya) * frac0; y1_ = ya + (yb - ya) * frac1
                z0_ = za + (zb - za) * frac0; z1_ = za + (zb - za) * frac1
                q = [V((xc - 1.0, y0_, z0_ + 0.004)), V((xc + 1.0, y0_, z0_ + 0.004)), V((xc + 1.0, y1_, z1_ + 0.004)), V((xc - 1.0, y1_, z1_ + 0.004))]
                tl.face(q if sgn > 0 else q[::-1], M["policarb"])
                q2 = [p_ - V((0, 0, 0.128)) for p_ in q]
                tl.face(q2[::-1] if sgn > 0 else q2, M["policarb_luz"])
        # calha + condutores
        yg = yb - sgn * 0.0
        tl.caixa(xa, yg - 0.12 if sgn > 0 else yg, zb - 0.32, xb, yg if sgn > 0 else yg + 0.12, zb - 0.1, M["galv"])
        for xd in (GX0 + 0.3, GX1 - 0.3):
            yd = (GY1 + 0.12) if sgn > 0 else (GY0 - 0.12)
            tl.cil((xd, yd, 0.2), (xd, yd, zb - 0.3), 0.055, M["galv"], 8)
    # lanternim na cumeeira
    tl.caixa(GX0 + 0.5, YC - 0.75, CUME - 0.05, GX1 - 0.5, YC + 0.75, CUME + 0.45, M["vidro_esc"], lados="yY")
    for xx in [GX0 + 0.5 + i * 1.5 for i in range(18)]:
        tl.caixa(xx, YC - 0.78, CUME - 0.05, xx + 0.06, YC + 0.78, CUME + 0.45, M["galv"])
    pts = [V((GX0 + 0.3, YC - 1.05, CUME + 0.38)), V((GX1 - 0.3, YC - 1.05, CUME + 0.38)), V((GX1 - 0.3, YC, CUME + 0.6)), V((GX0 + 0.3, YC, CUME + 0.6)),
           V((GX0 + 0.3, YC + 1.05, CUME + 0.38)), V((GX1 - 0.3, YC + 1.05, CUME + 0.38))]
    tl.solido(pts, [(0, 1, 2, 3), (3, 2, 5, 4), (0, 3, 4), (1, 5, 2), (0, 4, 5, 1)], M["telha"])
    tl.fechar()
    # tesouras + tercas (banzo inferior em 11,4)
    for x in PILAR_X:
        y_ = [IY0 + i * (IY1 - IY0) / 14 for i in range(15)]
        est.viga((x, IY0, CHORD), (x, IY1, CHORD), 0.1, 0.14, M["cinza"])
        for sgn, ya_, yb_ in ((-1, IY0, YC), (1, YC, IY1)):
            est.viga((x, ya_, z_telhado(ya_) - 0.18), (x, yb_, z_telhado(yb_) - 0.18), 0.1, 0.14, M["cinza"])
        for i, yy in enumerate(y_):
            zt = z_telhado(yy) - 0.18
            est.viga((x, yy, CHORD), (x, yy, zt), 0.07, 0.07, M["cinza"])
            if i < len(y_) - 1:
                y2 = y_[i + 1]
                if yy < YC: est.viga((x, yy, zt), (x, y2, CHORD), 0.06, 0.06, M["cinza"])
                else: est.viga((x, yy, CHORD), (x, y2, z_telhado(y2) - 0.18), 0.06, 0.06, M["cinza"])
    for sgn in (-1, 1):
        for i in range(10):
            yy = YC + sgn * (0.6 + i * (YC - IY0 - 0.6) / 9.6)
            if not (IY0 < yy < IY1): continue
            est.caixa(IX0, yy - 0.05, z_telhado(yy) - 0.33, IX1, yy + 0.05, z_telhado(yy) - 0.13, M["cinza"])
    # contraventamento em X nos vaos das pontas
    for xa_, xb_ in ((IX0, PILAR_X[0]), (PILAR_X[-1], IX1)):
        est.viga((xa_, IY0 + 1, z_telhado(IY0 + 1) - 0.36), (xb_, YC - 1, z_telhado(YC - 1) - 0.36), 0.03, 0.03, M["cinza"])
        est.viga((xb_, IY0 + 1, z_telhado(IY0 + 1) - 0.36), (xa_, YC - 1, z_telhado(YC - 1) - 0.36), 0.03, 0.03, M["cinza"])
    est.fechar()


# =============================================================================== luminarias (instancias)
def luminarias(M):
    me_nome = "P_EB_Luminaria"
    k = K(me_nome)
    k.cil((0, 0, 0.0), (0, 0, 0.9), 0.006, M["preto"], 4, True)
    k.cil((0, 0, -0.2), (0, 0, 0.0), 0.11, M["cinza"], 12)
    k.torno(V((0, 0, -0.55)), V((0, 0, 1)), [(0.28, 0.0), (0.27, 0.03), (0.12, 0.35)], 16, M["galv"], False, False)
    k.cil((0, 0, -0.52), (0, 0, -0.5), 0.25, M["luz"], 16)
    o = k.fechar(30)
    me = o.data; bpy.data.objects.remove(o)
    pos = [(x, y) for x in (337.0, 343.4, 350.0, 356.6) for y in (52.5, 58.5, 64.5, 70.5, 76.5)
           if not (x >= 350 and y >= 70)]
    for i, (x, y) in enumerate(pos):
        ob = bpy.data.objects.new("EB_Luminaria_%02d" % (i + 1), me)
        ob.location = (x, y, CHORD - 0.95)
        ob["cid_etapa"] = ETAPA; ob["setor"] = SETOR
        CV.objects.link(ob)
    STATS["luminarias"] = len(pos)


# =============================================================================== guarda-corpo, escada, plataforma
def guarda(k, M, a, b, z, alt=1.1, passo=1.4, colisao=True, rodape=True, mat="amarelo"):
    a, b = V((a[0], a[1], z)), V((b[0], b[1], z))
    d = b - a; L = d.length
    if L < 0.05: return
    n = max(1, int(math.ceil(L / passo)))
    for i in range(n + 1):
        p = a + d * (i / n)
        k.caixa(p.x - 0.025, p.y - 0.025, z, p.x + 0.025, p.y + 0.025, z + alt, M[mat])
    k.viga(a + V((0, 0, alt)), b + V((0, 0, alt)), 0.05, 0.05, M[mat])
    k.viga(a + V((0, 0, alt * 0.5)), b + V((0, 0, alt * 0.5)), 0.035, 0.035, M[mat])
    if rodape:
        k.viga(a + V((0, 0, 0.06)), b + V((0, 0, 0.06)), 0.01, 0.1, M[mat])
    if colisao:
        x0, x1 = sorted((a.x, b.x)); y0, y1 = sorted((a.y, b.y))
        col("EB_Guarda", x0 - 0.03, y0 - 0.03, z, x1 + 0.03, y1 + 0.03, z + alt)


def escada(k, M, x0, x1, ya, n, z0, z1, run=0.27, colisao_base=None, guarda_lados=(True, True)):
    """Escada subindo no sentido +y a partir de ya. n degraus; o n-esimo fica na altura z1 (patamar)."""
    h = (z1 - z0) / n
    zb = z0 if colisao_base is None else colisao_base
    for i in range(1, n):
        yy0 = ya + (i - 1) * run; yy1 = yy0 + run; zt = z0 + i * h
        k.caixa(x0, yy0, zt - 0.04, x1, yy1, zt, M["grade"], mats={"y": M["amarelo"]})
        col("Plataforma", x0, yy0, zb, x1, yy1, zt)
    yt = ya + (n - 1) * run
    for xx, lado in ((x0 - 0.04, 0), (x1 + 0.04, 1)):
        k.viga((xx, ya - 0.15, z0 - 0.05), (xx, yt + 0.05, z1 - 0.05), 0.05, 0.22, M["amarelo"])
        if guarda_lados[lado]:
            for yy, zz in ((ya + 0.1, z0 + h), ((ya + yt) / 2, z0 + (z1 - z0) * 0.5), (yt, z1)):
                k.caixa(xx - 0.025, yy - 0.025, zz, xx + 0.025, yy + 0.025, zz + 1.0, M["amarelo"])
            k.viga((xx, ya + 0.1, z0 + h + 1.0), (xx, yt, z1 + 1.0), 0.05, 0.05, M["amarelo"])
            k.viga((xx, ya + 0.1, z0 + h + 0.5), (xx, yt, z1 + 0.5), 0.035, 0.035, M["amarelo"])
            col("EB_Guarda", xx - 0.03, ya, zb, xx + 0.03, yt, z1 + 1.0)
    return ya + (n - 1) * run


def deck(k, M, x0, y0, x1, y1, z, borda=True):
    k.caixa(x0, y0, z - 0.05, x1, y1, z, M["grade"], mats={"x": M["galv"], "X": M["galv"], "y": M["galv"], "Y": M["galv"]})
    if borda:
        for (a, b) in (((x0, y0), (x1, y0)), ((x0, y1), (x1, y1)), ((x0, y0), (x0, y1)), ((x1, y0), (x1, y1))):
            k.viga((a[0], a[1], z - 0.15), (b[0], b[1], z - 0.15), 0.08, 0.2, M["galv"])
    col("Plataforma", x0, y0, z - 0.1, x1, y1, z)


# =============================================================================== estoque: paletes, sacos
def malha_palete(M):
    k = K("P_EB_Palete")
    for i in range(7):                                  # tabuas de cima (1,2 m no sentido y)
        x = -0.5 + 0.05 + i * (0.9 / 6)
        k.caixa(x - 0.05, -0.6, 0.122, x + 0.05, 0.6, 0.144, M["madeira"])
    for x in (-0.45, 0.0, 0.45):
        k.caixa(x - 0.05, -0.6, 0.1, x + 0.05, 0.6, 0.122, M["madeira"])       # longarina
        for y in (-0.55, 0.0, 0.55):
            k.caixa(x - 0.05, y - 0.05, 0.022, x + 0.05, y + 0.05, 0.1, M["madeira"])
        k.caixa(x - 0.05, -0.6, 0.0, x + 0.05, 0.6, 0.022, M["madeira"])
    o = k.fechar(); me = o.data; bpy.data.objects.remove(o)
    return me


def malha_saco(nome, reg, M, comp=0.70, larg=0.45, alt=0.15):
    """Saco de 25 kg deitado (almofada): superquadrica 16x10; o rotulo vai em cima e embaixo (projecao planar)."""
    k = K(nome)
    nu, nv, e = 16, 10, 0.32
    sp = lambda w, ex: math.copysign(abs(w) ** ex, w)
    vs = []
    for j in range(nv + 1):
        ph = -math.pi / 2 + math.pi * j / nv
        linha = []
        for i in range(nu):
            th = -math.pi + 2 * math.pi * i / nu
            x = comp / 2 * sp(math.cos(ph), e) * sp(math.cos(th), 0.25)
            y = larg / 2 * sp(math.cos(ph), e) * sp(math.sin(th), 0.25)
            z = alt / 2 * sp(math.sin(ph), 0.6)
            # cantos "costurados": achata nas pontas do comprimento
            z *= 1.0 - 0.55 * (abs(x) / (comp / 2)) ** 6
            linha.append(V((x, y, z + alt / 2)))
        vs.append(linha)
    bmv = [[k.bm.verts.new(p) for p in linha] for linha in vs]
    mi = k.mi(M["atlas"])
    fs = []
    for j in range(nv):
        for i in range(nu):
            a, b = bmv[j][i], bmv[j][(i + 1) % nu]; c, d = bmv[j + 1][(i + 1) % nu], bmv[j + 1][i]
            q = [a, b, c, d]
            uniq = []
            for v in q:
                if all((v.co - w.co).length > 1e-6 for w in uniq): uniq.append(v)
            if len(uniq) < 3: continue
            try: f = k.bm.faces.new(uniq)
            except ValueError: continue
            f.material_index = mi; fs.append(f)
    bmesh.ops.remove_doubles(k.bm, verts=k.bm.verts, dist=1e-5)
    k._orientar([f for f in k.bm.faces], V((0, 0, alt / 2)))
    for f in k.bm.faces:
        for l in f.loops:
            p = l.vert.co
            l[k.uv].uv = reg_uv(reg, min(1, max(0, p.x / comp + 0.5)), min(1, max(0, p.y / larg + 0.5)))
    o = k.fechar(40); me = o.data; bpy.data.objects.remove(o)
    return me


ARRANJO = []        # (x, y, z, giro graus) de 18 sacos num palete 1,0 x 1,2: 3 por camada (2 no comprimento + 1 atravessado), 6 camadas
for cam in range(6):
    zc = 0.144 + cam * 0.15
    sy = 1 if cam % 2 == 0 else -1
    for (x, y, g) in ((-0.24, -0.24 * sy, 90.0), (0.24, -0.24 * sy, 90.0), (0.0, 0.355 * sy, 0.0)):
        ARRANJO.append((x, y, zc, g))


# =============================================================================== baia do caminhao, pisos marcados, utilidades
def piso_marcacao(M):
    k = K("EB_Piso_Marcacao")
    cy0, cy1, _ = PORTA_CAM
    # baia de carga/descarga: contorno, zebrado na soleira, texto
    k.caixa(336.0, 55.75, FZ, IX1, 55.85, FZ + 0.003, M["tinta_amarela"], lados="Z")
    k.caixa(336.0, 49.75, FZ, 336.1, 55.85, FZ + 0.003, M["tinta_amarela"], lados="Z")
    k.face([V((IX1 - 1.2, cy0, FZ + 0.004)), V((IX1, cy0, FZ + 0.004)), V((IX1, cy1, FZ + 0.004)), V((IX1 - 1.2, cy1, FZ + 0.004))], M["atlas"],
           [reg_uv("ZEBRA", 0, 0), reg_uv("ZEBRA", 0, 1), reg_uv("ZEBRA", 1, 1), reg_uv("ZEBRA", 1, 0)])
    k.placa((347.5, 52.6, FZ + 0.004), (1, 0, 0), (0, 1, 0), 6.0, 1.5, "PISO_CARGA")
    # setas de entrada/saida
    for xx in (352.0, 342.0):
        k.face([V((xx, 52.0, FZ + 0.004)), V((xx + 0.8, 51.4, FZ + 0.004)), V((xx + 0.8, 52.6, FZ + 0.004))], M["tinta_amarela"])
    # corredores de pedestre (faixas 10 cm)
    for (x0, y0, x1, y1) in ((342.6, 56.1, 342.7, 62.2), (345.1, 56.1, 345.2, 62.2), (349.8, 56.1, 349.9, 67.3),
                             (351.3, 56.1, 351.4, 60.5), (342.6, 56.1, 351.4, 56.2)):
        k.caixa(x0, y0, FZ, x1, y1, FZ + 0.003, M["tinta_amarela"], lados="Z")
    k.fechar()


def balizadores(M):
    k = K("P_EB_Balizador")
    k.torno(V((0, 0, 0)), V((0, 0, 1)), [(0.09, 0.0), (0.09, 0.95), (0.06, 1.02), (0.0, 1.04)], 12, M["amarelo"], True, False)
    for zz in (0.55, 0.75):
        k.cil((0, 0, zz), (0, 0, zz + 0.08), 0.093, M["preto"], 12, False)
    o = k.fechar(35); me = o.data; bpy.data.objects.remove(o)
    pos = [(IX1 - 0.4, PORTA_CAM[0] - 0.35), (IX1 - 0.4, PORTA_CAM[1] + 0.35), (342.65, 56.0), (345.15, 56.0),
           (351.35, 56.0), (336.0, 56.0)]
    for i, (x, y) in enumerate(pos):
        o = bpy.data.objects.new("EB_Balizador_%02d" % (i + 1), me)
        o.location = (x, y, FZ); o["cid_etapa"] = ETAPA; o["setor"] = SETOR; CV.objects.link(o)
        col("EB_Equipamento", x - 0.1, y - 0.1, 0.15, x + 0.1, y + 0.1, 1.05)


# extintores(M): no 81p (extintor de parede com placa e piso demarcado)


# =============================================================================== paredes internas (isopainel)
def piso_epoxi(k, M, x0, y0, x1, y1, cove=0.06):
    """Piso de epoxi branco (sobre o piso do galpao) com rodape sanitario em meia-cana chanfrada nas quatro paredes."""
    z = FZ + 0.003
    k.caixa(x0, y0, FZ, x1, y1, z, M["epoxi"], lados="Z")
    for (ax, ay, bx, by, nx, ny) in ((x0, y0, x1, y0, 0, 1), (x1, y1, x0, y1, 0, -1), (x0, y1, x0, y0, 1, 0), (x1, y0, x1, y1, -1, 0)):
        a, b, d = V((ax, ay, z)), V((bx, by, z)), V((nx, ny, 0))
        k.face([a + V((0, 0, cove)), b + V((0, 0, cove)), b + d * cove, a + d * cove], M["epoxi"])


def parede_painel(k, M, x0, y0, x1, y1, z0, z1, int_lado, int_mat):
    """Painel 0,1 m: face externa isopainel; a face interna (lado int_lado) com int_mat."""
    k.caixa(x0, y0, z0, x1, y1, z1, M["isopainel"], mats={int_lado: int_mat})
    col("EB_Parede", x0, y0, 0.15, x1, y1, z1)


def janela_painel(k, M, eixo, c0, c1, fixo, z0, z1, esp=0.1):
    """Janela com caixilho e vidro numa parede (eixo 'x' = parede ao longo de x em y=fixo)."""
    if eixo == "x":
        k.caixa(c0, fixo - esp / 2, z0 - 0.05, c1, fixo + esp / 2, z0, M["galv"])
        k.caixa(c0, fixo - esp / 2, z1, c1, fixo + esp / 2, z1 + 0.05, M["galv"])
        for c in (c0, c1, (c0 + c1) / 2):
            k.caixa(c - 0.03, fixo - esp / 2, z0, c + 0.03, fixo + esp / 2, z1, M["galv"])
        k.face([V((c0, fixo, z0)), V((c1, fixo, z0)), V((c1, fixo, z1)), V((c0, fixo, z1))], M["vidro"])
    else:
        k.caixa(fixo - esp / 2, c0, z0 - 0.05, fixo + esp / 2, c1, z0, M["galv"])
        k.caixa(fixo - esp / 2, c0, z1, fixo + esp / 2, c1, z1 + 0.05, M["galv"])
        for c in (c0, c1, (c0 + c1) / 2):
            k.caixa(fixo - esp / 2, c - 0.03, z0, fixo + esp / 2, c + 0.03, z1, M["galv"])
        k.face([V((fixo, c0, z0)), V((fixo, c1, z0)), V((fixo, c1, z1)), V((fixo, c0, z1))], M["vidro"])


def cortina(k, M, eixo, c0, c1, fixo, z0, z1):
    n = int((c1 - c0) / 0.18)
    for i in range(n):
        a = c0 + i * (c1 - c0) / n; b = a + (c1 - c0) / n + 0.03
        off = 0.01 * (i % 2)
        if eixo == "x":
            k.face([V((a, fixo + off, z0 + 0.06)), V((min(b, c1), fixo + off, z0 + 0.06)), V((min(b, c1), fixo + off, z1)), V((a, fixo + off, z1))], M["cortina"])
        else:
            k.face([V((fixo + off, a, z0 + 0.06)), V((fixo + off, min(b, c1), z0 + 0.06)), V((fixo + off, min(b, c1), z1)), V((fixo + off, a, z1))], M["cortina"])
    if eixo == "x": k.caixa(c0 - 0.05, fixo - 0.04, z1, c1 + 0.05, fixo + 0.04, z1 + 0.06, M["galv"])
    else: k.caixa(fixo - 0.04, c0 - 0.05, z1, fixo + 0.04, c1 + 0.05, z1 + 0.06, M["galv"])


# preparo
PX0, PX1, PY0, PY1, PH = IX0, 345.2, 62.3, 73.2, 3.0
PREP_PORTA = (342.8, 344.4)
TANQUES = [(337.0, 70.3), (340.3, 70.3), (343.6, 70.3)]
TR = 1.1
PLAT_P = (335.6, 67.25, 345.0, 68.9, 2.0)               # plataforma de alimentacao (x0 y0 x1 y1 z)
# sala de controle
SX0, SX1, SY0, SY1, SH = 345.2, 349.8, 62.3, 67.4, 3.0      # corredor x 349,8-351,4 leva a area do secador
SALA_PORTA = (346.0, 347.0)
# ensaque
EX0, EX1, EY0, EY1, EH = 351.4, IX1, 60.6, 67.4, 3.3
ENS_PORTA = (352.6, 355.2)          # 2,6 m: passa a paleteira com palete
ENS_MAQ = (357.9, 65.2)


def preparo(M):
    k = K("EB_Preparo_Sala")
    z0 = FZ
    a, b = PREP_PORTA
    parede_painel(k, M, PX0, PY0, a, PY0 + 0.1, z0, PH, "Y", M["azulejo"])
    parede_painel(k, M, b, PY0, PX1, PY0 + 0.1, z0, PH, "Y", M["azulejo"])
    k.caixa(a, PY0, 2.3, b, PY0 + 0.1, PH, M["isopainel"], mats={"Y": M["azulejo"]})
    parede_painel(k, M, PX0, PY1 - 0.1, PX1, PY1, z0, PH, "y", M["azulejo"])
    # parede leste (compartilhada com a sala de controle) com janela
    parede_painel(k, M, PX1 - 0.1, PY0 + 0.1, PX1, 63.5, z0, PH, "x", M["azulejo"])
    parede_painel(k, M, PX1 - 0.1, 66.0, PX1, PY1 - 0.1, z0, PH, "x", M["azulejo"])
    k.caixa(PX1 - 0.1, 63.5, z0, PX1, 66.0, 1.1, M["isopainel"], mats={"x": M["azulejo"]})
    k.caixa(PX1 - 0.1, 63.5, 2.3, PX1, 66.0, PH, M["isopainel"], mats={"x": M["azulejo"]})
    col("EB_Parede", PX1 - 0.1, 63.5, 0.15, PX1, 66.0, PH)
    janela_painel(k, M, "y", 63.5, 66.0, PX1 - 0.05, 1.1, 2.3)
    # azulejo na parede do galpao (lado oeste do preparo)
    k.face([V((IX0 + 0.004, PY0 + 0.1, z0)), V((IX0 + 0.004, PY1 - 0.1, z0)), V((IX0 + 0.004, PY1 - 0.1, PH)), V((IX0 + 0.004, PY0 + 0.1, PH))], M["azulejo"])
    # arremate no topo dos paineis
    for (x0, y0, x1, y1) in ((PX0, PY0 - 0.02, PX1, PY0 + 0.12), (PX0, PY1 - 0.12, PX1, PY1 + 0.02), (PX1 - 0.12, PY0, PX1 + 0.02, PY1)):
        k.caixa(x0, y0, PH, x1, y1, PH + 0.05, M["galv"])
    cortina(k, M, "x", a, b, PY0 + 0.05, z0, 2.3)
    k.placa(((a + b) / 2, PY0 - 0.006, 2.65), (1, 0, 0), (0, 0, 1), 1.1, 0.53, "PREPARO")
    k.placa((b + 0.42, PY0 - 0.006, 1.6), (1, 0, 0), (0, 0, 1), 0.36, 0.36, "EPI")
    piso_epoxi(k, M, PX0 + 0.004, PY0 + 0.1, PX1 - 0.1, PY1 - 0.1)
    # ralo linear sanitario no piso (grelha de inox com fendas, moldura e caixa sifonada na ponta)
    ralo_linear(k, PX0 + 1.2, PX1 - 1.9, 64.28)
    k.fechar()

    tanques(M)
    lavatorio(M)

    # plataforma de alimentacao + escada
    pl = K("EB_Preparo_Plataforma")
    x0, y0, x1, y1, z = PLAT_P
    deck(pl, M, x0, y0, x1, y1, z)
    for xx in (x0 + 0.1, (x0 + x1) / 2, x1 - 1.3):
        for yy in (y0 + 0.1, y1 - 0.1):
            pl.caixa(xx - 0.05, yy - 0.05, FZ, xx + 0.05, yy + 0.05, z - 0.05, M["amarelo"])
    sx0, sx1 = x1 - 1.2, x1 - 0.05
    ya = y0 - 9 * 0.25
    escada(pl, M, sx0, sx1, ya, 10, 0.15, z, run=0.25, guarda_lados=(True, False))
    guarda(pl, M, (x0, y0), (sx0 - 0.05, y0), z)
    guarda(pl, M, (x0, y0), (x0, y1), z)
    gaps = [(x0, TANQUES[0][0] - TR + 0.15)] + [(TANQUES[i][0] + TR - 0.15, TANQUES[i + 1][0] - TR + 0.15) for i in range(2)] + [(TANQUES[2][0] + TR - 0.15, x1)]
    for ga, gb in gaps:
        guarda(pl, M, (ga, y1), (gb, y1), z)
    pl.fechar()


def sala_controle(M):
    k = K("EB_Sala_Controle")
    z0 = FZ
    a, b = SALA_PORTA
    parede_painel(k, M, SX0, SY0, a, SY0 + 0.1, z0, SH, "Y", M["alv_int"])
    parede_painel(k, M, b, SY0, SX1, SY0 + 0.1, z0, SH, "Y", M["alv_int"])
    k.caixa(a, SY0, 2.3, b, SY0 + 0.1, SH, M["isopainel"])
    # parede norte com janelao para o secador
    jx0, jx1 = 346.0, 349.2
    parede_painel(k, M, SX0, SY1 - 0.1, jx0, SY1, z0, SH, "y", M["alv_int"])
    parede_painel(k, M, jx1, SY1 - 0.1, SX1, SY1, z0, SH, "y", M["alv_int"])
    k.caixa(jx0, SY1 - 0.1, z0, jx1, SY1, 1.0, M["isopainel"], mats={"y": M["alv_int"]})
    k.caixa(jx0, SY1 - 0.1, 2.4, jx1, SY1, SH, M["isopainel"], mats={"y": M["alv_int"]})
    col("EB_Parede", jx0, SY1 - 0.1, 0.15, jx1, SY1, SH)
    janela_painel(k, M, "x", jx0, jx1, SY1 - 0.05, 1.0, 2.4)
    # parede leste (para o ensaque) com janela
    parede_painel(k, M, SX1 - 0.1, SY0 + 0.1, SX1, 63.6, z0, SH, "x", M["alv_int"])
    parede_painel(k, M, SX1 - 0.1, 65.8, SX1, SY1 - 0.1, z0, SH, "x", M["alv_int"])
    k.caixa(SX1 - 0.1, 63.6, z0, SX1, 65.8, 1.1, M["isopainel"], mats={"x": M["alv_int"]})
    k.caixa(SX1 - 0.1, 63.6, 2.3, SX1, 65.8, SH, M["isopainel"], mats={"x": M["alv_int"]})
    col("EB_Parede", SX1 - 0.1, 63.6, 0.15, SX1, 65.8, SH)
    piso_epoxi(k, M, SX0, SY0 + 0.1, SX1 - 0.1, SY1 - 0.1)
    # laje (teto) com luminarias embutidas
    k.caixa(SX0 - 0.05, SY0 - 0.05, SH, SX1 + 0.05, SY1 + 0.05, SH + 0.12, M["isopainel"])
    for xx in (346.5, 348.6):
        for yy in (63.7, 66.0):
            k.face([V((xx - 0.3, yy - 0.3, SH - 0.004)), V((xx - 0.3, yy + 0.3, SH - 0.004)), V((xx + 0.3, yy + 0.3, SH - 0.004)), V((xx + 0.3, yy - 0.3, SH - 0.004))], M["luz"])
    k.placa(((a + b) / 2 + 1.2, SY0 - 0.006, 2.65), (1, 0, 0), (0, 0, 1), 1.1, 0.53, "SALA")
    # ar-condicionado split na parede oeste
    k.caixa(SX0 + 0.1, 64.0, 2.35, SX0 + 0.33, 65.0, 2.65, M["isopainel"])
    k.caixa(SX0 + 0.33, 64.05, 2.38, SX0 + 0.335, 64.95, 2.44, M["preto"])
    k.placa((350.6, 61.2, 3.1), (1, 0, 0), (0, 0, 1), 1.0, 0.48, "SECADOR", verso=True); k.caixa(350.08, 61.18, 3.34, 351.12, 61.22, 3.37, M["galv"]); k.cil((350.2, 61.2, 3.37), (350.2, 61.2, CHORD), 0.005, M["preto"], 4); k.cil((351.0, 61.2, 3.37), (351.0, 61.2, CHORD), 0.005, M["preto"], 4)
    k.fechar(35)
    sala_controle_mobilia(M)


def ensaque(M):
    k = K("EB_Ensaque_Sala")
    z0 = FZ
    a, b = ENS_PORTA
    parede_painel(k, M, EX0, EY0, a, EY0 + 0.1, z0, EH, "Y", M["alv_int"])
    parede_painel(k, M, b, EY0, EX1, EY0 + 0.1, z0, EH, "Y", M["alv_int"])
    k.caixa(a, EY0, 2.45, b, EY0 + 0.1, EH, M["isopainel"])
    parede_painel(k, M, EX0, EY1 - 0.1, EX1, EY1, z0, EH, "y", M["alv_int"])
    parede_painel(k, M, EX0, EY0 + 0.1, EX0 + 0.1, 63.6, z0, EH, "X", M["alv_int"])
    parede_painel(k, M, EX0, 65.8, EX0 + 0.1, EY1 - 0.1, z0, EH, "X", M["alv_int"])
    k.caixa(EX0, 63.6, z0, EX0 + 0.1, 65.8, 1.1, M["isopainel"], mats={"X": M["alv_int"]})
    k.caixa(EX0, 63.6, 2.3, EX0 + 0.1, 65.8, EH, M["isopainel"], mats={"X": M["alv_int"]})
    col("EB_Parede", EX0, 63.6, 0.15, EX0 + 0.1, 65.8, EH)
    janela_painel(k, M, "y", 63.6, 65.8, EX0 - 0.0, 1.1, 2.3, esp=0.3)
    piso_epoxi(k, M, EX0 + 0.1, EY0 + 0.1, EX1 - 0.06, EY1 - 0.1)
    # tetinho (laje leve) + luminarias
    k.caixa(EX0 - 0.05, EY0 - 0.05, EH, EX1, EY1 + 0.05, EH + 0.12, M["isopainel"])
    k.caixa(EX1 - 0.06, EY0 + 0.1, FZ, EX1, EY1 - 0.1, EH, M["isopainel"])
    for xx in (353.0, 357.4):
        for yy in (62.4, 65.6):
            k.face([V((xx - 0.6, yy - 0.15, EH - 0.004)), V((xx - 0.6, yy + 0.15, EH - 0.004)), V((xx + 0.6, yy + 0.15, EH - 0.004)), V((xx + 0.6, yy - 0.15, EH - 0.004))], M["luz"])
    cortina(k, M, "x", a, b, EY0 + 0.05, z0, 2.45)
    k.placa(((a + b) / 2, EY0 - 0.006, 2.9), (1, 0, 0), (0, 0, 1), 1.1, 0.53, "ENSAQUE")
    k.placa((b + 0.5, EY0 - 0.006, 1.6), (1, 0, 0), (0, 0, 1), 0.4, 0.4, "EPI")
    k.fechar()
    ensacadeira(M)


# =============================================================================== secador spray
DX, DY, DR = 352.6, 73.9, 2.3
L1 = (348.1, 69.4, 357.1, 78.4, 4.2)
L1_FURO = (350.1, 71.4, 355.1, 76.4)
L2 = (349.1, 70.4, 356.1, 77.4, 8.6)
L2_FURO = (350.2, 71.5, 355.0, 76.3)
ESC1 = (346.7, 347.9, 70.0)          # x0 x1 y_inicio (sobe para +y)
ESC2 = (357.1, 358.2, 70.6)
CICLONE = (357.9, 78.7)
AQUEC = (344.2, 77.6, 346.6, 79.8)


def secador(M):
    k = K("EB_Secador_Camara")
    # camara: saida, cone, cilindro, teto conico, distribuidor de ar
    k.torno(V((DX, DY, 0.0)), V((0, 0, 1)),
            [(0.2, 1.05), (0.2, 1.4), (DR, 4.0), (DR, 9.3), (1.35, 9.65), (1.35, 10.4), (0.0, 10.42)], 40, M["inox"], True, False)
    for zz in (4.6, 5.9, 7.2, 8.5):
        k.cil((DX, DY, zz), (DX, DY, zz + 0.07), DR + 0.035, M["inox"], 40, True)
    k.cil((DX, DY, 3.9), (DX, DY, 4.08), DR + 0.12, M["galv"], 40, True)                    # anel de apoio
    for a_ in range(8):                                                                      # orelhas de apoio
        ang = math.radians(22.5 + a_ * 45)
        px, py = DX + math.cos(ang) * (DR + 0.12), DY + math.sin(ang) * (DR + 0.12)
        k.caixa_giro(px, py, 3.7, 0.3, 0.06, 4.08, ang, M["galv"])
    k.cil((DX, DY, 10.4), (DX, DY, 11.0), 0.35, M["azul"], 16)                               # motor do atomizador
    k.cil((DX, DY, 11.0), (DX, DY, 11.15), 0.3, M["preto"], 16)
    # visores (iluminados) em 5,6 m e 9,0 m e porta de inspecao na plataforma
    for zz in (5.6, 9.0):
        for a_ in range(4):
            ang = math.radians(a_ * 90 + 45)
            d = V((math.cos(ang), math.sin(ang), 0))
            p = V((DX, DY, zz)) + d * (DR - 0.02)
            k.cil(p, p + d * 0.1, 0.14, M["inox"], 12)
            k.cil(p + d * 0.1, p + d * 0.105, 0.1, M["visor"], 12, True)
    pd = V((DX, DY - DR - 0.01, 4.95))
    k.caixa(DX - 0.45, DY - DR - 0.1, 4.45, DX + 0.45, DY - DR + 0.05, 5.45, M["inox"])
    k.cil((DX + 0.32, DY - DR - 0.12, 4.95), (DX + 0.32, DY - DR - 0.2, 4.95), 0.05, M["preto"], 8)
    k.placa((DX, DY - DR - 0.105, 6.3), (1, 0, 0), (0, 0, 1), 0.6, 0.6, "QUENTE")
    k.placa((DX, L1[1] - 0.045, L1[4] + 0.72), (1, 0, 0), (0, 0, 1), 1.4, 0.68, "SECADOR", verso=True)
    # valvula rotativa na saida + motor
    k.caixa(DX - 0.25, DY - 0.25, 0.6, DX + 0.25, DY + 0.25, 1.05, M["inox"])
    k.cil((DX + 0.25, DY, 0.82), (DX + 0.55, DY, 0.82), 0.12, M["azul"], 12)
    k.caixa(DX - 0.3, DY - 0.3, FZ, DX + 0.3, DY + 0.3, 0.6, M["cinza"])
    k.fechar(30)
    col("EB_Equipamento", DX - 1.25, DY - 1.25, 0.15, DX + 1.25, DY + 1.25, 4.0)

    # estrutura: colunas, contraventamento, plataformas, escadas, guarda-corpos
    e = K("EB_Secador_Plataformas")
    cols_l1 = [(DX - 3.0, DY - 3.0), (DX + 3.0, DY - 3.0), (DX - 3.0, DY + 3.0), (DX + 3.0, DY + 3.0),
               (L1[0] + 0.15, L1[1] + 0.15), (L1[2] - 0.15, L1[1] + 0.15), (L1[0] + 0.15, L1[3] - 0.15), (L1[2] - 0.15, L1[3] - 0.15),
               (ESC2[1] - 0.12, L1[1] + 0.15)]
    for i, (x, y) in enumerate(cols_l1):
        zt = (L2[4] - 0.2) if i < 4 else (L1[4] - 0.2)          # as 4 internas seguem ate a plataforma de cima
        e.caixa(x - 0.13, y - 0.13, FZ, x + 0.13, y + 0.13, zt, M["amarelo"])
        e.caixa(x - 0.2, y - 0.2, FZ, x + 0.2, y + 0.2, FZ + 0.02, M["galv"])
        col("EB_Coluna", x - 0.13, y - 0.13, 0.15, x + 0.13, y + 0.13, zt)
    for (a, b) in (((DX - 3.0, DY - 3.0), (DX + 3.0, DY - 3.0)), ((DX - 3.0, DY + 3.0), (DX + 3.0, DY + 3.0))):
        e.viga((a[0], a[1], 0.6), (b[0], b[1], 3.7), 0.06, 0.06, M["amarelo"])
        e.viga((b[0], b[1], 0.6), (a[0], a[1], 3.7), 0.06, 0.06, M["amarelo"])
    x0, y0, x1, y1, z = L1
    fx0, fy0, fx1, fy1 = L1_FURO
    for (a, b, c, d) in ((x0, y0, x1, fy0), (x0, fy1, x1, y1), (x0, fy0, fx0, fy1), (fx1, fy0, x1, fy1)):
        deck(e, M, a, b, c, d, z)
    deck(e, M, x1, y0, ESC2[1], ESC2[2], z)                                    # base da escada 2
    # escada 1 (piso -> 4,2) e patamar
    n1 = 21
    yt1 = escada(e, M, ESC1[0], ESC1[1], ESC1[2], n1, 0.15, z)
    deck(e, M, ESC1[0], yt1, x0, yt1 + 1.4, z)
    guarda(e, M, (ESC1[0], yt1), (ESC1[0], yt1 + 1.4), z)
    guarda(e, M, (ESC1[0], yt1 + 1.4), (x0, yt1 + 1.4), z)
    # guarda-corpo externo da L1 (aberturas: patamar da escada 1 a oeste, escada 2 a leste)
    guarda(e, M, (x0, y0), (ESC2[1], y0), z)
    guarda(e, M, (x0, y1), (x1, y1), z)
    guarda(e, M, (x0, y0), (x0, yt1), z)
    guarda(e, M, (x0, yt1 + 1.4), (x0, y1), z)
    guarda(e, M, (x1, ESC2[2]), (x1, y1), z, colisao=False)
    col("EB_Guarda", x1 - 0.03, ESC2[2], z, x1 + 0.03, y1, z + 1.1)
    guarda(e, M, (ESC2[1], y0), (ESC2[1], ESC2[2]), z)
    # guarda-corpo do furo (em volta da camara)
    for (a, b) in (((fx0, fy0), (fx1, fy0)), ((fx0, fy1), (fx1, fy1)), ((fx0, fy0), (fx0, fy1)), ((fx1, fy0), (fx1, fy1))):
        guarda(e, M, a, b, z)
    # escada 2 (4,2 -> 8,6) e patamar ligado a L2
    n2 = 22
    yt2 = escada(e, M, ESC2[0], ESC2[1], ESC2[2], n2, z, L2[4], colisao_base=z - 0.05)
    lx0, ly0, lx1, ly1, lz = L2
    deck(e, M, lx1, yt2, ESC2[1], yt2 + 1.3, lz)
    guarda(e, M, (ESC2[1], yt2), (ESC2[1], yt2 + 1.3), lz)
    guarda(e, M, (lx1, yt2 + 1.3), (ESC2[1], yt2 + 1.3), lz)
    guarda(e, M, (lx1, yt2), (ESC2[0], yt2), lz)
    # L2 em volta do topo da camara
    lfx0, lfy0, lfx1, lfy1 = L2_FURO
    for (a, b, c, d) in ((lx0, ly0, lx1, lfy0), (lx0, lfy1, lx1, ly1), (lx0, lfy0, lfx0, lfy1), (lfx1, lfy0, lx1, lfy1)):
        deck(e, M, a, b, c, d, lz)
    for (a, b) in (((DX - 3.0, DY - 3.0), (DX + 3.0, DY - 3.0)), ((DX - 3.0, DY + 3.0), (DX + 3.0, DY + 3.0)),
                   ((DX - 3.0, DY - 3.0), (DX - 3.0, DY + 3.0)), ((DX + 3.0, DY - 3.0), (DX + 3.0, DY + 3.0))):
        e.viga((a[0], a[1], lz - 0.52), (b[0], b[1], lz - 0.52), 0.12, 0.25, M["amarelo"])      # vigas da L2
    e.caixa(ESC2[1] - 0.2, yt2 + 1.1, FZ, ESC2[1], yt2 + 1.3, lz - 0.2, M["amarelo"])            # pilar do patamar 2
    col("EB_Coluna", ESC2[1] - 0.2, yt2 + 1.1, 0.15, ESC2[1], yt2 + 1.3, lz - 0.2)
    guarda(e, M, (lx0, ly0), (lx1, ly0), lz)
    guarda(e, M, (lx0, ly0), (lx0, ly1), lz)
    guarda(e, M, (lx0, ly1), (lx1, ly1), lz)
    guarda(e, M, (lx1, ly0), (lx1, yt2), lz)
    for (a, b) in (((lfx0, lfy0), (lfx1, lfy0)), ((lfx0, lfy1), (lfx1, lfy1)), ((lfx0, lfy0), (lfx0, lfy1)), ((lfx1, lfy0), (lfx1, lfy1))):
        guarda(e, M, a, b, lz)
    e.fechar()
    # marcadores de inspecao
    for nome, (x, y, zz, g) in {"S": (DX, fy0 - 0.6, z, 90), "N": (DX, fy1 + 0.6, z, -90), "O": (fx0 - 0.6, DY, z, 0), "L": (fx1 + 0.6, DY, z, 180)}.items():
        marcador("Ponto_EB_Secador_Inspecao_" + nome, x, y, zz, g, funcao="visor da camara (5,6 m)")
    marcador("Ponto_EB_Secador_Topo", DX, lfy0 - 0.5, lz, 90, funcao="topo do secador / atomizador")
    marcador("Ponto_EB_Secador_Base", DX, DY - 1.9, FZ, 90, funcao="valvula rotativa de descarga")

    # aquecedor de ar, dutos, ciclone, chamines, bomba de alta pressao, linhas de produto
    u = K("EB_Secador_Utilidades")
    ax0, ay0, ax1, ay1 = AQUEC
    u.caixa(ax0, ay0, FZ, ax1, ay1, 2.4, M["verde"])
    u.caixa(ax0 - 0.05, ay0 - 0.05, 2.4, ax1 + 0.05, ay1 + 0.05, 2.48, M["galv"])
    u.cil((ax0, (ay0 + ay1) / 2, 1.2), (ax0 - 0.6, (ay0 + ay1) / 2, 1.2), 0.3, M["azul"], 14)        # queimador
    u.cil((ax0 - 0.6, (ay0 + ay1) / 2, 1.2), (ax0 - 0.75, (ay0 + ay1) / 2, 1.2), 0.2, M["preto"], 14)
    u.caixa(ax1 - 0.9, ay0 - 0.25, 1.4, ax1 - 0.1, ay0, 2.2, M["galv"])                            # filtro de entrada
    u.placa(((ax0 + ax1) / 2, ay0 - 0.006, 1.7), (1, 0, 0), (0, 0, 1), 0.5, 0.5, "QUENTE")
    hx, hy = 345.4, 78.7
    u.tubo([(hx, hy, 2.48), (hx, hy, 10.8), (351.6, hy, 10.8), (351.6, 76.0, 10.8), (351.6, 74.7, 10.05)], 0.35, M["isolamento"], 16, flanges=True, raio_curva=0.8)
    u.tubo([(344.6, 79.4, 2.48), (344.6, 79.4, z_telhado(79.4) + 1.3)], 0.15, M["galv"], 10, juntas=False)
    u.torno(V((344.6, 79.4, z_telhado(79.4) + 1.3)), V((0, 0, 1)), [(0.3, 0.05), (0.0, 0.3)], 10, M["galv"], True, False)
    col("EB_Equipamento", ax0 - 0.8, ay0 - 0.3, 0.15, ax1, ay1, 2.48)
    # ciclone + exaustor + chamine (sai pelo telhado)
    cx, cy = CICLONE
    u.torno(V((cx, cy, 0.0)), V((0, 0, 1)), [(0.12, 1.0), (0.12, 1.25), (0.7, 2.6), (0.7, 5.0), (0.32, 5.25), (0.32, 6.4)], 24, M["inox"], True, True)
    for a_ in range(4):
        ang = math.radians(45 + a_ * 90)
        px, py = cx + math.cos(ang) * 0.68, cy + math.sin(ang) * 0.68
        u.caixa(px - 0.05, py - 0.05, FZ, px + 0.05, py + 0.05, 2.75, M["amarelo"])
    u.cil((cx, cy, 2.6), (cx, cy, 2.75), 0.76, M["amarelo"], 24)
    u.caixa(cx - 0.5, cy - 0.35, 6.4, cx + 0.5, cy + 0.35, 7.2, M["azul"])                      # exaustor
    u.cil((cx - 0.5, cy, 6.8), (cx - 0.85, cy, 6.8), 0.22, M["azul"], 12)
    u.tubo([(cx, cy, 7.2), (cx, cy, z_telhado(cy) + 2.4)], 0.35, M["galv"], 16, juntas=False)
    u.torno(V((cx, cy, z_telhado(cy) + 2.4)), V((0, 0, 1)), [(0.6, 0.15), (0.0, 0.45)], 16, M["galv"], True, False)
    col("EB_Equipamento", cx - 0.8, cy - 0.8, 0.15, cx + 0.8, cy + 0.8, 6.4)
    # duto da camara ao ciclone (sob a L1)
    u.tubo([(DX + 1.55, DY + 0.5, 3.3), (cx, DY + 0.5, 3.3), (cx, cy - 0.68, 3.3)], 0.3, M["inox"], 14)
    # linha de finos do ciclone e linha de produto ate o ensaque (passa sobre o teto do ensaque e desce na moega)
    mx, my = ENS_MAQ
    u.tubo([(cx, cy, 1.0), (cx, cy, 0.7), (cx - 0.95, cy, 0.7), (cx - 0.95, cy, 2.6), (355.2, cy, 2.6), (355.2, DY, 2.6)], 0.06, M["inox"], 10)
    u.tubo([(DX, DY, 0.82), (355.2, DY, 0.82), (355.2, DY, 3.75), (355.2, my, 3.75), (mx, my, 3.75), (mx, my, 3.18)], 0.08, M["inox"], 12, flanges=True)
    u.caixa(355.0, DY - 0.35, 1.2, 355.4, DY + 0.35, 1.8, M["azul"])                           # soprador de transporte
    for yy in (71.0, 68.4):
        u.viga((355.2, yy, 3.68), (355.2, yy, L1[4] - 0.2), 0.03, 0.03, M["galv"])            # tirantes
    # bomba de alta pressao (alimenta o atomizador): BAP-301 do 81p; a linha da bomba sanitaria chega em (348.95, 69.05, 3.6)
    suc, dis = bomba_alta_pressao(M, 349.15, 68.7, 0.0)
    u.tubo([(348.95, 69.05, 3.6), (348.95, 69.05, suc.z), (suc.x, 69.05, suc.z), suc], 0.035, M["inox"], 12, raio_curva=0.12)
    u.tubo([dis, (dis.x, dis.y, 1.35), (349.85, dis.y, 1.35), (349.85, 69.2, 1.35), (349.85, 69.2, 11.2), (DX, 69.2, 11.2), (DX, DY - 0.2, 11.2),
            (DX, DY - 0.2, 11.15)], 0.03, M["inox"], 10, raio_curva=0.15)
    marcador("Ponto_EB_Bomba_Alta_Pressao", 349.15, 67.87, FZ, 90, funcao="bomba de alimentacao do secador")
    u.fechar(35)


# =============================================================================== LOD
def lod(M):
    def caixa_lod(nome):
        o = bpy.data.objects.get(nome)
        if o is None: return
        me = o.data
        slots = [s.name for s in o.material_slots]
        bm = bmesh.new(); bm.from_mesh(me)
        def mi(nm):
            return slots.index(nm) if nm in slots else 0
        def add(pts, faces, m):
            vs = [bm.verts.new(p) for p in pts]
            c = sum((V(p) for p in pts), V()) / len(pts)
            for idx in faces:
                try: f = bm.faces.new([vs[i] for i in idx])
                except ValueError: continue
                f.material_index = mi(m); f.normal_update()
                if (f.calc_center_median() - c).dot(f.normal) < 0: f.normal_flip()
        x0, y0, x1, y1 = GX0, GY0, GX1, GY1
        cx = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
        add([V((x, y, 0.15)) for x, y in cx] + [V((x, y, BEIRAL)) for x, y in cx],
            [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)], "Reboco_Branco")
        add([V((x0 - 0.3, y0 - 0.5, BEIRAL - 0.05)), V((x1 + 0.3, y0 - 0.5, BEIRAL - 0.05)), V((x1 + 0.3, y1 + 0.5, BEIRAL - 0.05)), V((x0 - 0.3, y1 + 0.5, BEIRAL - 0.05)),
             V((x0 - 0.3, YC, CUME)), V((x1 + 0.3, YC, CUME))],
            [(0, 1, 5, 4), (3, 2, 5, 4), (0, 4, 3), (1, 2, 5), (0, 1, 2, 3)], "Cid_Telha_Metal")
        bm.to_mesh(me); me.update(); bm.free()
    caixa_lod("S07_04_Edificios_LOD1")
    caixa_lod("S07_04_Silhueta_LOD2")


# =============================================================================== principal
POSTE_DE, POSTE_PARA = 53.0, 60.17


def mover_poste_portao():
    """O poste com trafo da Rua da Ferrovia (x 365,55, y 53) ficava no caminho do caminhao para o portao: vai para y 60,17
    (ponto ja amostrado da fiacao); os vertices dos fios nas duas amostras trocam de altura (fixacao <-> flecha)."""
    p = bpy.data.objects.get("S07_04_Poste.001")
    if p is None or abs(p.location.y - POSTE_DE) > 0.05: return "poste ja movido"
    dy = POSTE_PARA - POSTE_DE
    p.location.y += dy
    for o in bpy.data.collections["CITY_S07_04_COLLISION"].objects:
        if o.name.startswith("COL_Cid_Poste") and abs(o.location.x - 365.55) < 0.05 and abs(o.location.y - POSTE_DE) < 0.05:
            o.location.y += dy
    f = bpy.data.objects["S07_04_Fiacao"].data
    a = sorted([v for v in f.vertices if abs(v.co.x - 365.55) < 0.05 and abs(v.co.y - POSTE_DE) < 0.02], key=lambda v: v.co.z)
    b = sorted([v for v in f.vertices if abs(v.co.x - 365.55) < 0.05 and abs(v.co.y - POSTE_PARA) < 0.02], key=lambda v: v.co.z)
    if len(a) == len(b):
        za = [v.co.z for v in a]; zb = [v.co.z for v in b]
        for v, z in zip(a, zb): v.co.z = z
        for v, z in zip(b, za): v.co.z = z
    f.update()
    return "poste movido (%d vertices de fio)" % (len(a) + len(b))


_p81p = r"C:\Users\rafael\BarBoteco\scripts\81p_props_fabrica.py"
exec(compile(open(_p81p, encoding="utf-8").read(), _p81p, "exec"), globals())


def principal():
    t0 = __import__("time").time()
    STATS["removidos_81"] = limpar_anterior()
    if not bpy.data.objects["S07_04_Edificios"].get("eb81_lote_limpo"):
        limpar_lote()
        bpy.data.objects["S07_04_Edificios"]["eb81_lote_limpo"] = True
    STATS["poste"] = mover_poste_portao()
    M = criar_materiais()
    patio_e_muros(M)
    cerca(M)
    galpao(M)
    luminarias(M)
    vagas = estoque(M)
    piso_marcacao(M)
    balizadores(M)
    extintores(M)
    utilidades(M)
    preparo(M)
    sala_controle(M)
    ensaque(M)
    secador(M)
    if not bpy.data.objects["S07_04_Edificios_LOD1"].get("eb81_lod"):
        lod(M)
        for nm in ("S07_04_Edificios_LOD1", "S07_04_Silhueta_LOD2"):
            if bpy.data.objects.get(nm): bpy.data.objects[nm]["eb81_lod"] = True
    marcador("Ponto_EB_Portao", 361.6, 53.0, FZ, 180, funcao="portao de veiculos (Rua da Ferrovia)")
    marcador("Ponto_EB_Doca", 348.5, 52.6, FZ, 0, funcao="vaga do caminhao na baia interna (traseira para oeste ou leste)")
    marcador("Ponto_EB_Entrada_Pessoal", 360.7, 58.8, FZ, 180, funcao="porta de pedestre")
    marcador("Ponto_EB_Balanca", BALANCA[0], BALANCA[1], FZ + 0.097, 0, funcao="balanca de plataforma")
    # a caixa guia do usuario: fica oculta (nao e exportada por nenhum script)
    g = bpy.data.objects.get("EMPRESA BRASIL")
    if g: g.hide_set(True)
    for m in list(bpy.data.materials):
        if m.get("cid_etapa") == ETAPA and m.users == 0:
            bpy.data.materials.remove(m)
    tris = sum(STATS.get("tris", {}).values())
    STATS["tris_total_unicos"] = tris
    STATS["segundos"] = round(__import__("time").time() - t0, 1)
    return STATS


if __name__ == "__main__" or globals().get("RODAR", True):
    r = principal()
    print(json.dumps({k: v for k, v in r.items() if k != "tris"}, ensure_ascii=False))
    print("tris por objeto:", sorted(r.get("tris", {}).items(), key=lambda kv: -kv[1])[:14])
