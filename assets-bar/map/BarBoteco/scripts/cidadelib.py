"""cidadelib - base da cidade expandida (800 x 800 m) em volta do Bar da Esquina.

Plano viario como grafo planar: as ruas sao polilinhas com largura/tipo; o codigo acha os cruzamentos, monta os
nos e as faces (quadras). Cada quadra recebe meio-fio, calcada e lotes; cada rua vira faixas de asfalto entre
as quadras vizinhas e "aventais" nos cruzamentos. Tudo e repartido em setores de 100 x 100 m (CITY_Sxx_yy,
xx = coluna oeste->leste, yy = linha sul->norte), cada um com subcolecoes VISUAL/COLLISION/ROADS/PROPS/
VEGETATION/LOD/MARKERS, para o jogo carregar por streaming.

Convencoes herdadas do barlib: 1 unidade = 1 m, Z para cima, rua em z=0, calcada em z=0,15, colisores em caixas
COL_* (malha COL_cubo, escala = tamanho), prototipos instanciados por malha vinculada.
"""
import bpy, bmesh, math, random, os, json
from mathutils import Vector, Matrix
import barlib as B

HALF = 400.0                       # area jogavel: -400..400 (800 x 800 m = 0,64 km2)
SETOR = 100.0
NS = 8
ZC = B.Z_CALCADA
P = (-141.0, 173.0, -123.0, 149.0)  # bairro original (quadras 7x7 do 03_rua/07_exterior) - preservado
VX = [-99.0, -53.0, -7.0, 39.0, 85.0, 131.0]   # ruas N-S do bairro original (eixo)
HY = [-87.0, -47.0, -7.0, 33.0, 73.0, 113.0]   # ruas L-O do bairro original (eixo)
RAIZ = "CIDADE"
SUBS = ("VISUAL", "COLLISION", "ROADS", "PROPS", "VEGETATION", "LOD", "MARKERS")

# tipos de via: largura do leito (m), calcada de cada lado (m), raio da esquina (m), classe (prioridade)
VIA = {
    'virt':    dict(w=0.0,  calc=0.0, r=0.0,  cls=0),
    'antiga':  dict(w=8.0,  calc=3.0, r=3.0,  cls=1),
    'centro':  dict(w=8.0,  calc=3.0, r=3.0,  cls=1),
    'local':   dict(w=9.0,  calc=2.6, r=4.0,  cls=1),
    'local10': dict(w=10.0, calc=2.8, r=4.0,  cls=1),
    'rot':     dict(w=9.0,  calc=3.0, r=0.0,  cls=3),
    'col':     dict(w=11.0, calc=3.0, r=5.0,  cls=2),
    'ind_loc': dict(w=12.0, calc=3.0, r=9.0,  cls=2),
    'anel':    dict(w=14.0, calc=3.5, r=6.0,  cls=3),
    'ind':     dict(w=16.0, calc=3.0, r=10.0, cls=3),
    'av':      dict(w=20.0, calc=4.0, r=7.0,  cls=4, canteiro=3.0),
}


# ============================================================== geometria 2D
def V(p):
    return Vector((p[0], p[1]))


def area(poly):
    s = 0.0
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        s += a[0] * b[1] - b[0] * a[1]
    return s / 2.0


def centroide(poly):
    A = area(poly)
    if abs(A) < 1e-9:
        return Vector((sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly)))
    cx = cy = 0.0
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        c = a[0] * b[1] - b[0] * a[1]
        cx += (a[0] + b[0]) * c
        cy += (a[1] + b[1]) * c
    return Vector((cx / (6 * A), cy / (6 * A)))


def dentro(pt, poly):
    x, y = pt[0], pt[1]
    ins = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i][0], poly[i][1]
        xj, yj = poly[j][0], poly[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi:
            ins = not ins
        j = i
    return ins


def dist_seg(p, a, b):
    ab = b - a
    L2 = ab.length_squared
    if L2 < 1e-12:
        return (p - a).length, 0.0
    t = max(0.0, min(1.0, (p - a).dot(ab) / L2))
    return (p - (a + ab * t)).length, t


def inter_seg(p, p2, q, q2, eps=1e-7):
    r = p2 - p
    s = q2 - q
    den = r.x * s.y - r.y * s.x
    if abs(den) < 1e-10:
        return None
    qp = q - p
    t = (qp.x * s.y - qp.y * s.x) / den
    u = (qp.x * r.y - qp.y * r.x) / den
    if -eps <= t <= 1 + eps and -eps <= u <= 1 + eps:
        return t, u
    return None


def inter_retas(p, d, q, e):
    den = d.x * e.y - d.y * e.x
    if abs(den) < 1e-10:
        return None
    t = ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / den
    return p + d * t


def perp(u):
    return Vector((-u.y, u.x))


def dist_poly(p, poly):
    return min(dist_seg(p, V(poly[i]), V(poly[(i + 1) % len(poly)]))[0] for i in range(len(poly)))


def obb_sobrepoe(A, Bq):
    """SAT entre dois quadrilateros convexos (listas de 4 Vectors 2D)."""
    for poly in (A, Bq):
        for i in range(len(poly)):
            e = poly[(i + 1) % len(poly)] - poly[i]
            ax = Vector((-e.y, e.x))
            pa = [ax.dot(p) for p in A]
            pb = [ax.dot(p) for p in Bq]
            if max(pa) <= min(pb) + 1e-4 or max(pb) <= min(pa) + 1e-4:
                return False
    return True


# ============================================================== setores e colecoes
def setor_de(x, y):
    ix = int(math.floor((x + HALF) / SETOR))
    iy = int(math.floor((y + HALF) / SETOR))
    return min(NS - 1, max(0, ix)), min(NS - 1, max(0, iy))


def nome_setor(ix, iy):
    return "CITY_S%02d_%02d" % (ix, iy)


def pref(ix, iy):
    return "S%02d_%02d" % (ix, iy)


def coll(name, parent):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
    if isinstance(parent, str):
        parent = bpy.data.collections[parent] if parent in bpy.data.collections else coll(parent, bpy.context.scene.collection)
    if c.name not in parent.children.keys():
        parent.children.link(c)
    return c


def raiz():
    return coll(RAIZ, bpy.context.scene.collection)


def sub(ix, iy, s):
    nm = nome_setor(ix, iy)
    sc = coll(nm, raiz())
    if s is None:
        return sc
    return coll(nm + "_" + s, sc)


def criar_setores():
    raiz()
    for ix in range(NS):
        for iy in range(NS):
            sc = sub(ix, iy, None)
            sc["setor"] = [ix, iy]
            sc["limites_xy"] = [-HALF + ix * SETOR, -HALF + iy * SETOR, -HALF + (ix + 1) * SETOR, -HALF + (iy + 1) * SETOR]
            for s in SUBS:
                sub(ix, iy, s)


def esconder_subs():
    """Colisores e LODs ocultos na viewport (como a colecao Colisores do bar)."""
    def acha(lc, nome):
        if lc.collection.name == nome:
            return lc
        for ch in lc.children:
            r = acha(ch, nome)
            if r:
                return r
    vl = bpy.context.view_layer.layer_collection
    for ix in range(NS):
        for iy in range(NS):
            for s in ("COLLISION", "LOD"):
                lc = acha(vl, nome_setor(ix, iy) + "_" + s)
                if lc:
                    lc.hide_viewport = True


def limpar_etapa(etapa):
    """Remove tudo que uma etapa criou (re-executavel)."""
    n = 0
    for o in list(bpy.data.objects):
        if o.get("cid_etapa") == etapa:
            data = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            n += 1
            if isinstance(data, bpy.types.Mesh) and data.users == 0 and not data.name.startswith(("P_", "A_", "K_", "COL_")):
                bpy.data.meshes.remove(data)
            elif isinstance(data, bpy.types.Light) and data.users == 0:
                bpy.data.lights.remove(data)
    return n


def marcar(o, etapa, ix=None, iy=None):
    o["cid_etapa"] = etapa
    if ix is not None:
        o["setor"] = pref(ix, iy)
    return o


# ============================================================== acumuladores de malha por setor
class Malhas:
    """Uma B.Mesh por (tipo, setor); build() cria os objetos nas subcolecoes certas."""
    DESTINO = {}   # tipo -> subcolecao

    def __init__(self, etapa):
        self.etapa = etapa
        self.m = {}

    def get(self, tipo, x, y=None):
        if y is None:
            ix, iy = x
        else:
            ix, iy = setor_de(x, y)
        k = (tipo, ix, iy)
        if k not in self.m:
            self.m[k] = B.Mesh("%s_%s" % (pref(ix, iy), tipo))
        return self.m[k]

    def build(self, destino):
        objs = []
        for (tipo, ix, iy), mb in sorted(self.m.items(), key=lambda kv: (kv[0][1], kv[0][2], kv[0][0])):
            if not mb.bm.faces:
                mb.bm.free()
                continue
            ob = mb.build(sub(ix, iy, destino.get(tipo, "VISUAL")))
            marcar(ob, self.etapa, ix, iy)
            objs.append(ob)
        self.m = {}
        return objs


# ============================================================== colisores e instancias por setor
def _cubo():
    me = bpy.data.meshes.get("COL_cubo")
    if me is None:
        me = bpy.data.meshes.new("COL_cubo")
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
    return me


def colisor(nome, mn, mx, etapa, M=None, setor=None):
    """Caixa de colisao (mesma convencao do barlib.add_collider) na subcolecao COLLISION do setor."""
    mn = Vector(mn); mx = Vector(mx)
    ctr = (mn + mx) / 2
    size = Vector((max(mx.x - mn.x, 0.01), max(mx.y - mn.y, 0.01), max(mx.z - mn.z, 0.01)))
    M = M if M is not None else Matrix.Identity(4)
    mw = M @ Matrix.Translation(ctr) @ Matrix.Diagonal((size.x, size.y, size.z, 1.0))
    wc = mw.translation
    ix, iy = setor if setor else setor_de(wc.x, wc.y)
    o = bpy.data.objects.new("COL_" + nome, _cubo())
    o.matrix_world = mw
    o.display_type = 'WIRE'
    o.hide_render = True
    sub(ix, iy, "COLLISION").objects.link(o)
    return marcar(o, etapa, ix, iy)


def colisor_obb(nome, c, u, larg, prof, z0, z1, etapa, setor=None):
    """Caixa orientada: centro c (2D), eixo u (2D unitario) ao longo de 'larg', 'prof' na perpendicular."""
    M = Matrix(((u.x, -u.y, 0, c.x), (u.y, u.x, 0, c.y), (0, 0, 1, 0), (0, 0, 0, 1)))
    return colisor(nome, (-larg / 2, -prof / 2, z0), (larg / 2, prof / 2, z1), etapa, M=M, setor=setor)


def inst(mesh, nome, sub_nome, loc, rot, etapa, scale=None, setor=None):
    me = bpy.data.meshes[mesh] if isinstance(mesh, str) else mesh
    ix, iy = setor if setor else setor_de(loc[0], loc[1])
    o = bpy.data.objects.new("%s_%s" % (pref(ix, iy), nome), me)
    o.location = loc
    o.rotation_euler = (0, 0, math.radians(rot))
    if scale is not None:
        o.scale = scale if hasattr(scale, '__len__') else (scale, scale, scale)
    sub(ix, iy, sub_nome).objects.link(o)
    return marcar(o, etapa, ix, iy)


# ============================================================== materiais (compartilhados; so texturas que ja existem + 1 atlas)
def materiais():
    M = B.material
    R = "reboco.jpg"
    for nome, cor in (("Cid_Reboco_Amarelo", (0.96, 0.82, 0.45)), ("Cid_Reboco_Salmao", (0.93, 0.66, 0.55)),
                      ("Cid_Reboco_Cinza", (0.70, 0.70, 0.68)), ("Cid_Reboco_Lilas", (0.76, 0.70, 0.86)),
                      ("Cid_Reboco_Sujo", (0.60, 0.56, 0.50)), ("Cid_Reboco_Turquesa", (0.55, 0.80, 0.78))):
        M(nome, color=cor, tex=R, tile=(2.0, 2.0), rough=0.9)
    M("Cid_Asfalto_Remendo", color=(0.52, 0.52, 0.55), tex="asfalto.jpg", tile=(4.0, 4.0), rough=0.9)
    M("Cid_Pintura_Amarela", color=(0.93, 0.70, 0.08), rough=0.6)
    M("Cid_Sarjeta", color=(0.60, 0.60, 0.58), tex="concreto.jpg", tile=(1.5, 1.5), rough=0.9)
    M("Cid_Cimentado", color=(0.80, 0.78, 0.74), tex="concreto.jpg", tile=(3.0, 3.0), rough=0.9)
    M("Cid_Grama_Seca", color=(0.95, 0.85, 0.55), tex="grama.jpg", tile=(2.0, 2.0), rough=0.95)
    M("Cid_Fibrocimento", color=(0.70, 0.70, 0.68), tex="metal_ondulado.jpg", tile=(0.5, 0.5), rough=0.85)
    M("Cid_Telha_Velha", color=(0.72, 0.62, 0.56), tex="telha.jpg", normal="telha_n.jpg", tile=(1.0, 1.2), rough=0.8)
    for nome, cor in (("Cid_Galpao", (0.82, 0.84, 0.86)), ("Cid_Galpao_Azul", (0.42, 0.55, 0.72)),
                      ("Cid_Galpao_Verde", (0.46, 0.62, 0.50)), ("Cid_Galpao_Creme", (0.86, 0.80, 0.66))):
        M(nome, color=cor, tex="metal_ondulado.jpg", tile=(0.5, 0.5), rough=0.6, metal=0.25)
    M("Cid_Telha_Metal", color=(0.74, 0.75, 0.77), tex="metal_ondulado.jpg", tile=(0.5, 0.5), rough=0.5, metal=0.35)
    M("Cid_Concreto_Pre", color=(0.80, 0.79, 0.76), tex="concreto.jpg", tile=(4.0, 4.0), rough=0.9)
    M("Cid_Brita", color=(0.62, 0.60, 0.58), tex="terra_batida.jpg", tile=(1.5, 1.5), rough=1.0)
    M("Cid_Trilho", color=(0.32, 0.30, 0.29), rough=0.4, metal=0.8)
    M("Cid_Cana", color=(0.72, 0.88, 0.42), tex="grama.jpg", tile=(6.0, 6.0), rough=0.9)
    M("Cid_Mata", color=(0.42, 0.58, 0.36), tex="folhas.jpg", tile=(3.0, 3.0), rough=0.9)
    M("Cid_Eucalipto", color=(0.58, 0.66, 0.52), tex="folhas.jpg", tile=(1.5, 1.5), rough=0.9)
    M("Cid_Agua", color=(0.20, 0.30, 0.26), rough=0.12)
    if os.path.exists(os.path.join(B.TEX_DIR, "atlas_cidade.jpg")):
        M("Cid_Atlas", tex="atlas_cidade.jpg", rough=0.7)
    for m in bpy.data.materials:
        if m.name.startswith("Cid_"):
            m["cid"] = True


CORES_CASA = ["Reboco_Branco", "Reboco_Creme", "Reboco_Azul", "Reboco_Verde", "Reboco_Rosa", "Reboco_Ocre",
              "Cid_Reboco_Amarelo", "Cid_Reboco_Salmao", "Cid_Reboco_Cinza", "Cid_Reboco_Lilas", "Cid_Reboco_Turquesa"]
MAT_CALC = {"CENTRO": "Pedra_Portuguesa", "OLARIA": "Cid_Cimentado", "CONCEICAO": "Concreto", "INDUSTRIAL": "Concreto"}
MAT_CHAO = {"CENTRO": "Concreto", "OLARIA": "Cid_Cimentado", "CONCEICAO": "Grama", "INDUSTRIAL": "Cid_Concreto_Pre"}


# ============================================================== preservacao do bar
COLS_BAR = ["Predio_Estrutura", "Portas", "Interior_Terreo", "Interior_Superior", "Varanda_Mobiliario", "Iluminacao",
            "Marcadores", "Quintal_Mobiliario", "Terraco_Mobiliario", "Interativos", "Interativos_Bar", "Mesas", "Palco",
            "Props_Mesas_Removidos", "Exterior_Rua", "Exterior_Vizinhanca", "Exterior_Mobiliario", "Colisores"]


def hash_bar():
    """Assinatura do mapa original (nomes, transformacoes e malhas), sem os itens de limite que viraram obsoletos."""
    import hashlib
    h = hashlib.md5()
    n = 0
    for cn in COLS_BAR:
        c = bpy.data.collections.get(cn)
        if not c:
            continue
        for o in sorted(c.objects, key=lambda o: o.name):
            if o.get("obsoleto"):
                continue
            h.update(o.name.encode())
            h.update(str([round(v, 4) for row in o.matrix_basis for v in row]).encode())
            h.update((o.data.name if o.data else "").encode())
            n += 1
    return h.hexdigest(), n


# ============================================================== zonas
ZONAS = ("CENTRO", "OLARIA", "CONCEICAO", "INDUSTRIAL")


def zona_de(x, y):
    x0, x1, y0, y1 = P
    if x0 - 14 <= x <= x1 + 14 and y0 - 16 <= y <= y1 + 13:
        return "CENTRO"                         # bairro original + anel em volta
    if x > 186:
        return "INDUSTRIAL"
    if -151 < x < 186 and 159 < y < 265:
        return "CENTRO"                         # centro novo (comercial/civico)
    if y < -136 or (x < -151 and y < -47):
        return "OLARIA"
    return "CONCEICAO"


# ============================================================== plano viario
def _onda(a, amp, per, fase=0.0):
    return amp * math.sin(a / per + fase)


def plano_vias():
    """Lista de (pontos, tipo, atributos). Coordenadas aproximadas: o grafo encaixa as pontas nas ruas vizinhas."""
    R = []

    def add(pts, tipo, **kw):
        R.append(([tuple(map(float, p)) for p in pts], tipo, kw))

    H = HALF
    x0, x1, y0, y1 = P
    # limites (virtuais: delimitam quadras, nao viram rua)
    add([(-H, -H), (H, -H), (H, H), (-H, H), (-H, -H)], 'virt', borda=True)
    add([(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)], 'virt', antigo=True)

    # ---- Avenida Principal (boulevard com canteiro): Distrito Industrial -> sul do Centro -> Jardim Conceicao
    arco = [(-230 + 60 * math.cos(math.radians(a)), -76 + 60 * math.sin(math.radians(a))) for a in range(-90, -181, -15)]
    add([(372, -136), (-230, -136)] + arco[1:] + [(-290, 188)], 'av', nome="Avenida Principal")
    # rotatoria no fim da avenida (Jardim Conceicao)
    rc = (-290.0, 200.0)
    add([(rc[0] + 12 * math.cos(math.radians(a)), rc[1] + 12 * math.sin(math.radians(a))) for a in range(-90, 271, 30)],
        'rot', nome="Rotatoria do Jardim")
    # ---- anel em volta do bairro original
    add([(-151, -136), (-151, 345)], 'anel', nome="Av. Perimetral Oeste")
    add([(-151, 159), (184, 159)], 'anel', nome="Av. Perimetral Norte")
    add([(184, -352), (184, 345)], 'ind', nome="Av. da Industria")
    # ---- continuacoes das ruas do bairro original (bocas de 8 m) atravessando o anel
    for x in VX:
        add([(x, y0), (x, -136)], 'antiga')
        add([(x, y1), (x, 159)], 'antiga')
        add([(x, 159), (x, 265)], 'centro', mao_unica=(1 if VX.index(x) % 2 == 0 else -1), eixo='y')
    for y in HY:
        add([(x0, y), (-151, y)], 'antiga')
        add([(x1, y), (184, y)], 'antiga')
    add([(-151, 212), (184, 212)], 'centro', mao_unica=1, eixo='x', nome="Rua do Comercio")

    # ---- Parque Olaria (sul): grade levemente ondulada
    def y_ol(base, x):
        return base + _onda(x, 2.2, 55.0, base)

    XS_OL = [-355, -220, -151, -99, -53, -7, 39, 85, 131, 184]
    for base, tipo in ((-190, 'local'), (-244, 'col'), (-298, 'local')):
        add([(x, y_ol(base, x)) for x in XS_OL], tipo, nome="Olaria %d" % base)
    add([(-355, -352), (-220, -352), (-151, -352), (-99, -352), (-7, -352), (85, -352), (184, -352)], 'local10', nome="Rua do Contorno Sul")
    for x, tipo, yfim in ((-220, 'local', -352), (-151, 'col', -352), (-99, 'local', -352), (-7, 'col', -352),
                          (85, 'local', -352), (-53, 'local', -190), (39, 'local', -190), (131, 'local', -190)):
        pts = [(x, -136)]
        yant = -136.0
        for base in (-190, -244, -298, -352):
            if base < yfim - 1:
                break
            yb = y_ol(base, x) if base != -352 else -352.0
            if tipo == 'local':                              # ondula entre os cruzamentos, nao neles
                pts.append((x + _onda(base, 2.0, 40.0, x), (yant + yb) / 2))
            pts.append((x, yb))
            yant = yb
        add(pts, tipo)
    pa = (-230 + 60 * math.cos(math.radians(-135)), -76 + 60 * math.sin(math.radians(-135)))   # sai perpendicular a curva
    add([pa, (-300, -146), (-356, -150)], 'local', nome="Olaria Oeste")
    add([(-151, -87), (-218, -87)], 'local')
    # ---- contorno oeste (local, ondulado) de ponta a ponta
    add([(-355, -352), (-357, -298), (-357, -244), (-355, -190), (-356, -150), (-358, -87), (-355, -47), (-357, 32),
         (-355, 113), (-354, 200), (-356, 280), (-355, 345)], 'local10', nome="Rua do Contorno Oeste")

    # ---- Jardim Conceicao (oeste + norte): ruas sinuosas
    add([(-220, -136), (-218, -87), (-222, -47), (-217, 33), (-224, 113), (-219, 200), (-222, 278), (-220, 345)], 'local',
        nome="Rua das Paineiras")
    add([(-151, -47), (-185, -45), (-220, -47), (-255, -50), (-290, -49), (-325, -46), (-355, -47)], 'col', nome="Rua da Divisa")
    add([(-151, 33), (-185, 37), (-220, 33), (-255, 27), (-290, 30), (-322, 36), (-355, 32)], 'local')
    add([(-151, 113), (-188, 109), (-220, 114), (-255, 120), (-290, 116), (-325, 110), (-355, 113)], 'local')
    add([(-151, 200), (-185, 204), (-220, 201), (-250, 198), (-278, 200)], 'col', nome="Rua da Rotatoria")
    add([(-302, 200), (-330, 196), (-355, 200)], 'local')
    add([(-355, 280), (-322, 284), (-290, 283), (-255, 281), (-220, 278), (-185, 270), (-151, 265), (184, 265)], 'col',
        nome="Rua Coletora Norte")
    add([(-290, 212), (-289, 250), (-290, 283), (-288, 345)], 'local')
    for x in (-53, 39, 131):
        add([(x, 265), (x + 4, 305), (x, 345)], 'local')
    add([(-355, 345), (-288, 345), (-220, 345), (-151, 345), (-53, 345), (39, 345), (131, 345), (184, 345)], 'local10',
        nome="Rua do Contorno Norte")

    # ---- Distrito Industrial (leste, junto a ferrovia)
    add([(290, -352), (290, 345)], 'ind', nome="Av. dos Galpoes")
    add([(372, -352), (372, 345)], 'ind_loc', nome="Rua da Ferrovia")
    add([(184, -352), (290, -352), (372, -352)], 'ind_loc')
    add([(184, 345), (290, 345), (372, 345)], 'ind_loc')
    for y in (-244, -47, 33, 159, 265):
        add([(184, y if y != -244 else y_ol(-244, 184)), (290, y), (372, y)], 'ind_loc')

    # ---- conexoes virtuais com a borda (dividem a faixa externa em quadras)
    for x in (-220, -99, -7, 85, 184, 290):
        add([(x, -352), (x, -H)], 'virt')
    for x in (-220, -151, -53, 39, 131, 184, 290):
        add([(x, 345), (x, H)], 'virt')
    for y in (-244, -150, -47, 113, 200, 280):
        add([(-355 if y not in (-244,) else -357, y), (-H, y)], 'virt')
    for y in (-244, -136, -47, 33, 159, 265):
        add([(372, y), (H, y)], 'virt')
    add([(-355, -352), (-H, -H)], 'virt')
    add([(-355, 345), (-H, H)], 'virt')
    add([(372, -352), (H, -H)], 'virt')
    add([(372, 345), (H, H)], 'virt')
    return R


# ============================================================== grafo planar
class Grafo:
    def __init__(self, vias, snap=2.5, merge=0.9):
        self.vias = vias
        segs = []
        for vi, (pts, tipo, kw) in enumerate(vias):
            for a, b in zip(pts[:-1], pts[1:]):
                if (V(a) - V(b)).length > 1e-6:
                    segs.append([V(a), V(b), vi])
        # 1) encaixa pontas soltas de polilinhas nas ruas vizinhas
        for vi, (pts, tipo, kw) in enumerate(vias):
            if pts[0] == pts[-1]:
                continue
            for end in (0, -1):
                p = V(pts[end])
                best = None
                for s in segs:
                    if s[2] == vi:
                        continue
                    d, t = dist_seg(p, s[0], s[1])
                    if d < snap and (best is None or d < best[0]):
                        best = (d, s, t)
                if best is None:
                    continue
                d, s, t = best
                if (p - s[0]).length < snap:
                    alvo = s[0]
                elif (p - s[1]).length < snap:
                    alvo = s[1]
                else:
                    alvo = s[0].lerp(s[1], t)
                for s2 in segs:
                    if s2[2] != vi:
                        continue
                    if (s2[0] - p).length < 1e-6:
                        s2[0] = alvo.copy()
                    if (s2[1] - p).length < 1e-6:
                        s2[1] = alvo.copy()
        # 2) cruzamentos
        cortes = [[0.0, 1.0] for _ in segs]
        for i in range(len(segs)):
            a, a2, _ = segs[i]
            mnx, mxx = min(a.x, a2.x) - 0.1, max(a.x, a2.x) + 0.1
            mny, mxy = min(a.y, a2.y) - 0.1, max(a.y, a2.y) + 0.1
            for j in range(i + 1, len(segs)):
                b, b2, _ = segs[j]
                if max(b.x, b2.x) < mnx or min(b.x, b2.x) > mxx or max(b.y, b2.y) < mny or min(b.y, b2.y) > mxy:
                    continue
                r = inter_seg(a, a2, b, b2)
                if r:
                    cortes[i].append(min(1.0, max(0.0, r[0])))
                    cortes[j].append(min(1.0, max(0.0, r[1])))
        # 3) nos (fundindo pontos proximos)
        self.nos = []
        grade = {}

        def no(p):
            k = (int(math.floor(p.x / merge)), int(math.floor(p.y / merge)))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for idx in grade.get((k[0] + dx, k[1] + dy), ()):
                        if (self.nos[idx] - p).length < merge:
                            return idx
            self.nos.append(p.copy())
            grade.setdefault(k, []).append(len(self.nos) - 1)
            return len(self.nos) - 1

        arestas = {}
        for (a, a2, vi), cs in zip(segs, cortes):
            cs = sorted(set(round(c, 9) for c in cs))
            ids = []
            for c in cs:
                n = no(a.lerp(a2, c))
                if not ids or ids[-1] != n:
                    ids.append(n)
            for u, v in zip(ids[:-1], ids[1:]):
                k = (min(u, v), max(u, v))
                tipo = vias[vi][1]
                old = arestas.get(k)
                if old is None or VIA[tipo]['cls'] > VIA[vias[old][1]]['cls'] or (old is not None and vias[old][1] == 'virt'):
                    arestas[k] = vi
        # 4) contrai arestas curtas (vertice de polilinha a poucos metros de um cruzamento)
        grau = {}
        for (u, v) in arestas:
            grau[u] = grau.get(u, 0) + 1
            grau[v] = grau.get(v, 0) + 1
        pai = list(range(len(self.nos)))

        def raiz_(i):
            while pai[i] != i:
                pai[i] = pai[pai[i]]
                i = pai[i]
            return i
        for (u, v) in arestas:
            if (self.nos[u] - self.nos[v]).length < 4.0:
                ru, rv = raiz_(u), raiz_(v)
                if ru != rv:
                    if grau.get(rv, 0) > grau.get(ru, 0):
                        ru, rv = rv, ru
                    pai[rv] = ru
        self.arestas = {}          # (u,v) com u<v -> via index
        for (u, v), vi in arestas.items():
            u, v = raiz_(u), raiz_(v)
            if u == v:
                continue
            k = (min(u, v), max(u, v))
            old = self.arestas.get(k)
            if old is None or VIA[vias[vi][1]]['cls'] > VIA[vias[old][1]]['cls']:
                self.arestas[k] = vi
        self.viz = {i: [] for i in range(len(self.nos))}
        for (u, v) in self.arestas:
            self.viz[u].append(v)
            self.viz[v].append(u)
        for i in self.viz:
            p = self.nos[i]
            self.viz[i].sort(key=lambda j: math.atan2(self.nos[j].y - p.y, self.nos[j].x - p.x))
        self._faces()

    def tipo(self, u, v):
        return self.vias[self.arestas[(min(u, v), max(u, v))]][1]

    def attr(self, u, v):
        return self.vias[self.arestas[(min(u, v), max(u, v))]][2]

    def real(self, u, v):
        return self.tipo(u, v) != 'virt'

    def _faces(self):
        usado = set()
        self.faces = []
        for (a, b) in list(self.arestas):
            for (u, v) in ((a, b), (b, a)):
                if (u, v) in usado:
                    continue
                ciclo = []
                cu, cv = u, v
                ok = True
                for _ in range(5000):
                    usado.add((cu, cv))
                    ciclo.append(cu)
                    nb = self.viz[cv]
                    k = nb.index(cu)
                    w = nb[(k - 1) % len(nb)]
                    cu, cv = cv, w
                    if (cu, cv) == (u, v):
                        break
                else:
                    ok = False
                if ok:
                    self.faces.append(ciclo)
        self.semi = {}               # (u,v) -> (face, indice)
        for fi, f in enumerate(self.faces):
            for i in range(len(f)):
                self.semi[(f[i], f[(i + 1) % len(f)])] = (fi, i)

    def pontas(self):
        """Nos de grau 1 em ruas reais (ruas sem saida)."""
        out = []
        for n, nb in self.viz.items():
            reais = [m for m in nb if self.real(n, m)]
            if len(reais) == 1 and len(nb) == 1:
                out.append(n)
        return out


# ============================================================== quadras: meio-fio, calcada, esquinas
def _canto(a, b, c, d0, d1, raio, lim0, lim1):
    """Pontos do meio-fio no vertice b entre as arestas a->b e b->c (face a esquerda), afastadas d0 e d1."""
    u0 = (b - a).normalized()
    u1 = (c - b).normalized()
    n0, n1 = perp(u0), perp(u1)
    p0, p1 = b + n0 * d0, b + n1 * d1
    cr = u0.x * u1.y - u0.y * u1.x
    dt = u0.dot(u1)
    if abs(cr) < 0.07 and dt > 0:
        if abs(d0 - d1) < 1e-3:
            return [(p0 + p1) / 2]
        return [p0, p1]
    if dt < -0.995:                                     # ponta morta (nao deveria ocorrer)
        return [p0 + u0 * max(d0, 0.5), p1 - u1 * max(d1, 0.5)]
    C = inter_retas(p0, u0, p1, u1)
    if C is None:
        return [p0, p1]
    if cr > 0:                                          # esquina convexa da quadra
        phi = math.acos(max(-1.0, min(1.0, dt)))        # angulo de giro
        if raio > 0.05:
            t = raio * math.tan(phi / 2)
            t = min(t, lim0, lim1)
            if t > 0.05:
                Ti, To = C - u0 * t, C + u1 * t
                pts = []
                for k in range(5):
                    s = k / 4
                    pts.append(Ti * (1 - s) ** 2 + C * 2 * (1 - s) * s + To * s * s)
                return pts
        if phi > math.radians(130):                     # bico muito agudo: chanfra
            m = min(2.5, lim0, lim1)
            return [C - u0 * m, C + u1 * m]
    return [C]


class Quadra:
    pass


def anel_de(q, extra, fil=True):
    """Anel paralelo ao eixo das ruas: afastamento = meia largura + extra(tipo) nas arestas reais (0 nas virtuais).
    Esquinas arredondadas com raio concentrico ao do meio-fio. Retorna uma lista de pontos por vertice."""
    pts, tipos, L = q.pts, q.tipos, q.L
    n = len(pts)
    cantos = []
    for i in range(n):
        a, b, cc = pts[i - 1], pts[i], pts[(i + 1) % n]
        t0, t1 = tipos[i - 1], tipos[i]
        e0 = extra(t0) if t0 != 'virt' else 0.0
        e1 = extra(t1) if t1 != 'virt' else 0.0
        d0 = VIA[t0]['w'] / 2 + e0
        d1 = VIA[t1]['w'] / 2 + e1
        r = 0.0 if (t0 == 'virt' or t1 == 'virt' or not fil) else max(0.0, min(VIA[t0]['r'], VIA[t1]['r']) - e0)
        cantos.append(_canto(a, b, cc, d0, d1, r, 0.45 * L[i - 1], 0.45 * L[i]))
    return cantos


def achatar(cs):
    out = []
    for cl in cs:
        for p in cl:
            if not out or (out[-1] - p).length > 0.01:
                out.append(p)
    if len(out) > 1 and (out[0] - out[-1]).length < 0.01:
        out.pop()
    return out


def obb_inscrito(poly, contorno=None, folga=0.05):
    """Maior caixa orientada (alinhada a uma das arestas longas) que cabe no poligono. -> (centro, u, larg, prof)."""
    contorno = contorno or poly
    n = len(poly)
    arestas = sorted(range(n), key=lambda i: -(V(poly[(i + 1) % n]) - V(poly[i])).length)[:4]
    c0 = centroide(poly)
    best = None
    for i in arestas:
        u = (V(poly[(i + 1) % n]) - V(poly[i])).normalized()
        w = perp(u)
        pu = [V(p).dot(u) for p in poly]
        pw = [V(p).dot(w) for p in poly]
        cu, cw = (min(pu) + max(pu)) / 2, (min(pw) + max(pw)) / 2
        hu, hw = (max(pu) - min(pu)) / 2, (max(pw) - min(pw)) / 2
        ctr = u * cu + w * cw
        for k in range(30):
            s = 1.0 - k * 0.03
            cc = c0.lerp(ctr, s)
            cs = [cc + u * (sx * hu * s) + w * (sy * hw * s) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            if all(dentro(p, contorno) or dist_poly(p, contorno) < folga for p in cs):
                ar = (2 * hu * s) * (2 * hw * s)
                if best is None or ar > best[0]:
                    best = (ar, cc, u, 2 * hu * s, 2 * hw * s)
                break
    if best is None:
        return None
    return best[1:]


def pecas_via(G, Q, u, v, passo=20.0):
    """Faixas do leito da rua u->v entre as quadras vizinhas: lista de (L0, L1, R1, R0) (L = lado esquerdo)."""
    fl, il = G.semi[(u, v)]
    fr, ir = G.semi[(v, u)]
    ql, qr = Q[fl], Q[fr]
    if ql.externa or ql.antiga or qr.externa or qr.antiga:
        return []
    sL, eL = segmentos(ql, ql.ext, il)
    sR, eR = segmentos(qr, qr.ext, ir)
    n = max(1, int(math.ceil(max((eL - sL).length, (sR - eR).length) / passo)))
    out = []
    for k in range(n):
        f0, f1 = k / n, (k + 1) / n
        out.append((sL.lerp(eL, f0), sL.lerp(eL, f1), eR.lerp(sR, f1), eR.lerp(sR, f0)))
    return out


def montar_quadras(G):
    """Para cada face: poligono do meio-fio (externo), da guia e da calcada interna, por aresta e por canto."""
    Q = []
    x0, x1, y0, y1 = P
    for fi, f in enumerate(G.faces):
        pts = [G.nos[i] for i in f]
        A = area(pts)
        q = Quadra()
        q.id = fi
        q.nos = f
        q.area_eixo = A
        q.externa = A <= 0
        c = centroide(pts) if A > 0 else Vector((0, 0))
        q.c = c
        q.antiga = (A > 0 and x0 - 0.5 < c.x < x1 + 0.5 and y0 - 0.5 < c.y < y1 + 0.5 and A > 50000)
        q.ilha = all(G.tipo(f[i], f[(i + 1) % len(f)]) == 'rot' for i in range(len(f)))
        Q.append(q)
        if q.externa or q.antiga:
            continue
        n = len(f)
        tipos = [G.tipo(f[i], f[(i + 1) % n]) for i in range(n)]
        q.tipos = tipos
        q.real = [t != 'virt' for t in tipos]
        q.pts = pts
        q.L = [(pts[(i + 1) % n] - pts[i]).length for i in range(n)]
        q.ext = anel_de(q, lambda t: 0.0)
        q.guia = anel_de(q, lambda t: 0.15)
        q.calc = anel_de(q, lambda t: VIA[t]['calc'])
        q.sarj = anel_de(q, lambda t: -0.45)
        q.poly_ext = achatar(q.ext)
        q.poly_int = achatar(q.calc)
        ai = area(q.poly_int) if len(q.poly_int) >= 3 else -1
        q.toda_calcada = ai < 25.0 or any(not dentro(p, q.poly_ext) and dist_poly(p, q.poly_ext) > 0.3
                                          for p in q.poly_int[::max(1, len(q.poly_int) // 12)])
        q.area = area(q.poly_ext) if len(q.poly_ext) >= 3 else 0.0
        q.zona = zona_de(c.x, c.y)
    return Q


def segmentos(q, cantos, i):
    """Trecho reto do anel `cantos` ao longo da aresta i (fim do canto i -> inicio do canto i+1)."""
    n = len(cantos)
    return cantos[i][-1], cantos[(i + 1) % n][0]


def faixa(m, A, Bp, z, mat, zb=None, uvs=None):
    """Tira de quads entre duas polilinhas A e B (mesma direcao), na altura z."""
    if len(A) < len(Bp):
        A = _reamostra(A, len(Bp))
    elif len(Bp) < len(A):
        Bp = _reamostra(Bp, len(A))
    for k in range(len(A) - 1):
        quad = [A[k], A[k + 1], Bp[k + 1], Bp[k]]
        if abs(area(quad)) < 0.003:
            continue
        m.face([(p.x, p.y, z) for p in quad], mat, facing=(0, 0, 1))


def _reamostra(P_, n):
    if len(P_) == 1:
        return [P_[0]] * n
    L = [0.0]
    for a, b in zip(P_[:-1], P_[1:]):
        L.append(L[-1] + (b - a).length)
    out = []
    for k in range(n):
        s = L[-1] * k / (n - 1)
        for j in range(len(P_) - 1):
            if L[j + 1] >= s - 1e-9:
                t = 0 if L[j + 1] - L[j] < 1e-9 else (s - L[j]) / (L[j + 1] - L[j])
                out.append(P_[j].lerp(P_[j + 1], t))
                break
    return out


def cortar(a, b, passo):
    """Divide o segmento a-b em pedacos de no maximo `passo` metros (fracoes)."""
    n = max(1, int(math.ceil((b - a).length / passo)))
    return [k / n for k in range(n + 1)]


def plano():
    """Grafo + quadras (deterministico; cada etapa recalcula)."""
    G = Grafo(plano_vias())
    Q = montar_quadras(G)
    return G, Q
