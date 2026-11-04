# 55_moto_v3.py
# Moto naked 250 cc Highland Bar Delivery v3 (estilo PS2/PS3): refeita a partir da moto da Tripo.
#  - paineis do corpo (tanque, banco, paralama dianteiro) = secoes tiradas da referencia por raycast: malha limpa e
#    densa em quads, simetrica, suavizada (a forma e a da Tripo, a topologia e nossa)
#  - rodas, pneus (banda de rodagem em geometria), aros de 6 raios, discos, coroa, descanso, luzes = procedurais
#  - o resto (garfo, guidao, motor, quadro, balanca, escapamento, amortecedores, rabeta...) = faces da Tripo com o
#    esterçamento desfeito, soldadas, em quads sempre que possivel, normais conferidas, cada peca no seu osso
#  - o bau/bag de entrega e outro modelo (56_moto_bag.py -> moto_bag.glb): a moto sai sem ele
# Rodar: blender.exe -b --factory-startup -P 55_moto_v3.py -- --exportar [--sem-bake]
# Convencoes: frente = -Y (= +Z no glTF), esquerda do piloto = +X, Z para cima, origem no chao entre os eixos.
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

SCRIPTS = "C:/Users/rafael/BarBoteco/scripts"
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if "--exportar" in ARGS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
_SO = globals().get("SO_FUNCOES")
SO_FUNCOES = True
exec(compile(open(SCRIPTS + "/54_moto_tripo.py", encoding="utf-8").read(), "54_moto_tripo.py", "exec"), globals())
SO_FUNCOES = _SO
import moto_ref as mr

SAIDA = r"C:\Users\rafael\BarBoteco\export\moto_v3"
BLEND_COPIA = r"C:\Users\rafael\Desktop\BAR\2.0\veiculos\moto\moto_delivery_v3.blend"
COLS = ["Moto_Delivery", "Moto_Colisao", "Moto_TMP"]
SC = bpy.context.scene

# ---------------------------------------------------------------- cotas (metros)
YF, YT, ZC = -0.686, 0.675, 0.300
R_PNEU = 0.300
RAKE = math.radians(27.0)
AX = V((0, math.sin(RAKE), math.cos(RAKE)))
AXLE_F = V((0, YF, ZC))
AXLE_T = V((0, YT, ZC))
PIVO_BAL = V((0, 0.30, 0.38))
PIVO_DESC = V((0.115, 0.15, 0.30))

PECAS = ["tinta", "banco", "pneu", "aro", "raio", "cubo", "disco", "cromo", "aco", "aluminio", "motor", "aleta", "quadro",
         "borracha", "plastico", "escapamento", "corrente", "farol_casco", "farol_vidro", "mostrador", "painel",
         "espelho_vidro", "espelho_casco", "mola", "amortecedor", "bagageiro", "pinca", "coroa", "tambor", "pedal",
         "manete", "ponteiro", "lente", "placa", "preto", "dourado", "ref_claro", "ref_medio", "ref_escuro", "ref_tinta",
         "ref_laranja"]
PID = {n: i for i, n in enumerate(PECAS)}
PINTURA = ("tinta", "ref_tinta")
COR_PADRAO = (0.78, 0.055, 0.045, 1.0)
DENSIDADE.update({"tinta": 1.4, "banco": 1.5, "aluminio": 0.9, "ref_claro": 0.9, "ref_medio": 0.7, "ref_escuro": 0.6,
                  "ref_tinta": 1.0, "ref_laranja": 0.8, "farol_vidro": 1.0, "preto": 0.5, "dourado": 0.6, "pneu": 0.5,
                  "aro": 0.8, "raio": 1.2, "disco": 1.2, "coroa": 0.8})

# ---------------------------------------------------------------- referencia
REF = {}


def carregar_ref():
    ob, cols, grp = mr.preparar()
    me = ob.data
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    REF.update(ob=ob, cols=cols, grp=grp, co=co.reshape(-1, 3))
    REF["pv"] = np.array([p.vertices[:3] for p in me.polygons])
    REF["ctr"] = REF["co"][REF["pv"]].mean(1)
    REF["verts"] = [V(v) for v in REF["co"]]
    comp = -np.ones(len(me.vertices), int)
    viz = [[] for _ in me.vertices]
    for e in me.edges:
        viz[e.vertices[0]].append(e.vertices[1])
        viz[e.vertices[1]].append(e.vertices[0])
    c = 0
    for v in range(len(comp)):
        if comp[v] >= 0:
            continue
        pilha = [v]
        comp[v] = c
        while pilha:
            x = pilha.pop()
            for w in viz[x]:
                if comp[w] < 0:
                    comp[w] = c
                    pilha.append(w)
        c += 1
    REF["comp"] = comp[REF["pv"][:, 0]]
    ob.hide_set(True)
    ob.hide_render = True
    REF["bvh_all"] = bvh_faces(np.ones(len(REF["pv"]), bool))
    return REF


def bvh_faces(mask):
    idx = np.where(mask)[0]
    return BVHTree.FromPolygons(REF["verts"], [tuple(int(k) for k in REF["pv"][i]) for i in idx])


def bvh_grupo(nome):
    return bvh_faces(REF["grp"] == nome)


def limites_grupo(nome):
    v = REF["co"][np.unique(REF["pv"][REF["grp"] == nome].ravel())]
    return v.min(0), v.max(0)


# ---------------------------------------------------------------- loft por secoes polares tiradas da referencia
def _suavizar(r, passes=1, k=0.25):
    r = np.array(r, float)
    for _ in range(passes):
        a = r.copy()
        a[1:-1] = r[1:-1] * (1 - 2 * k) + k * (r[:-2] + r[2:])
        b = a * (1 - 2 * k) + k * (np.roll(a, 1, 1) + np.roll(a, -1, 1))
        b[0], b[-1] = a[0], a[-1]
        r = b
    return r


def loft_ref(bvh, ys, lados=30, raio_max=0.45, suav=1, cz_fixo=None):
    """aneis (n, m, 3) de pontos sobre a superficie da referencia: raios de fora para o centro de cada secao Y = const.
    Simetrico em torno de x = 0 (a referencia tem ~1 cm de assimetria)."""
    n, m = len(ys), lados
    th = [2 * math.pi * (k + 0.5) / m for k in range(m)]
    R = np.zeros((n, m))
    CZ = np.zeros(n)
    for i, y in enumerate(ys):
        topo = bvh.ray_cast(V((0, y, 2.0)), V((0, 0, -1)), 2.0)[0]
        base = bvh.ray_cast(V((0, y, -1.0)), V((0, 0, 1)), 3.0)[0]
        if cz_fixo is not None:
            cz = cz_fixo[i]
        elif topo is not None and base is not None:
            cz = (topo.z + base.z) / 2
        else:
            cz = CZ[i - 1] if i else 0.7
        CZ[i] = cz
        for k, t in enumerate(th):
            d = V((math.cos(t), 0, math.sin(t)))
            h = bvh.ray_cast(V((0, y, cz)) + d * raio_max, -d, raio_max * 1.02)[0]
            R[i, k] = (h - V((0, y, cz))).dot(d) if h is not None else (R[i - 1, k] * 0.96 if i else 0.02)
    esp = np.array([m // 2 - 1 - k for k in range(m)]) % m
    R = (R + R[:, esp]) / 2
    R = _suavizar(R, suav)
    an = np.zeros((n, m, 3))
    for i, y in enumerate(ys):
        for k, t in enumerate(th):
            an[i, k] = (R[i, k] * math.cos(t), y, CZ[i] + R[i, k] * math.sin(t))
    return an


def espacar(y0, y1, n, forte=True):
    """estacoes mais juntas nas pontas (as curvas fortes ficam la)"""
    return [y0 + (y1 - y0) * ((0.5 - 0.5 * math.cos(math.pi * i / (n - 1))) if forte else i / (n - 1)) for i in range(n)]


def malha_de_aneis(p, an, peca, ponta_a=((0.18, 0.80), (0.36, 0.52), (0.50, 0.22)),
                   ponta_b=((0.18, 0.80), (0.36, 0.52), (0.50, 0.22))):
    """quads entre aneis consecutivos; as pontas fecham arredondando (aneis encolhidos e deslocados) e tampa plana"""
    n, m, _ = an.shape
    aneis = [p.anel([V(q) for q in an[i]]) for i in range(n)]

    def fecho(ring, sentido, tampa):
        c = V(ring.mean(0))
        s = 0.25 * (np.ptp(ring[:, 0]) + np.ptp(ring[:, 2]))
        return [p.anel([c + (V(q) - c) * f + V((0, sentido * d * s, 0)) for q in ring]) for d, f in tampa]
    sa = -1 if an[0, 0, 1] < an[-1, 0, 1] else 1
    ca = list(reversed(fecho(an[0], sa, ponta_a))) if ponta_a else []
    cb = fecho(an[-1], -sa, ponta_b) if ponta_b else []
    seq = ca + aneis + cb
    for a, b in zip(seq, seq[1:]):
        p.ligar(a, b, peca)
    p.face(list(reversed(seq[0])), peca)
    p.face(seq[-1], peca)


def uv_cilindrico(me, info):
    """info[(vertice)] = (u, v) ja calculado por quem criou; so distribui nos loops"""
    uvl = me.uv_layers.new(name="UVMap")
    for pl in me.polygons:
        for li in pl.loop_indices:
            uvl.data[li].uv = info[me.loops[li].vertex_index]


# ---------------------------------------------------------------- secoes projetadas a mao com as cotas medidas na referencia
def secao_super(w, zt, zb, expo_t, expo_b, lados=34):
    """anel (lados, 2) de pontos (x, z) de uma superelipse assimetrica: expoente no topo e na base"""
    cz = (zt + zb) / 2
    h = (zt - zb) / 2
    pts = []
    for k in range(lados):
        t = 2 * math.pi * (k + 0.5) / lados
        c, s_ = math.cos(t), math.sin(t)
        e = expo_t if s_ >= 0 else expo_b
        pts.append((w * math.copysign(abs(c) ** (2 / e), c), cz + h * math.copysign(abs(s_) ** (2 / e), s_)))
    return pts


def aneis_de_tabela(tab_, lados=34, passes=1):
    """tab_: lista de dicts (y, zt, zb, w, et, eb) -> aneis (n, lados, 3); passes de suavizacao nas cotas"""
    ys = [t["y"] for t in tab_]
    cot = {k: np.array([t[k] for t in tab_], float) for k in ("zt", "zb", "w", "et", "eb")}
    for k in cot:
        a = cot[k]
        for _ in range(passes):
            b = a.copy()
            b[1:-1] = 0.25 * a[:-2] + 0.5 * a[1:-1] + 0.25 * a[2:]
            a = b
        cot[k] = a
    an = np.zeros((len(ys), lados, 3))
    for i, y in enumerate(ys):
        for k, (x, z) in enumerate(secao_super(cot["w"][i], cot["zt"][i], cot["zb"][i], cot["et"][i], cot["eb"][i], lados)):
            an[i, k] = (x, y, z)
    return an


def interpolar(tab_, n):
    """reamostra a tabela em n estacoes (mais juntas nas pontas) por interpolacao linear das cotas"""
    ys0 = np.array([t["y"] for t in tab_])
    ys = np.array(espacar(ys0[0], ys0[-1], n))
    out = []
    for y in ys:
        d = {"y": float(y)}
        for k in ("zt", "zb", "w", "et", "eb"):
            d[k] = float(np.interp(y, ys0, [t[k] for t in tab_]))
        out.append(d)
    return out


# tanque: cotas medidas por raycast na referencia (y, topo, base, meia-largura)
TANQUE = [(-0.378, .752, .705, .062, 2.8, 2.4), (-0.362, .792, .685, .105, 2.8, 2.4), (-0.335, .838, .662, .146, 2.7, 2.4),
          (-0.300, .862, .648, .158, 2.6, 2.4), (-0.250, .872, .641, .162, 2.5, 2.4), (-0.200, .882, .640, .164, 2.4, 2.4),
          (-0.150, .889, .644, .161, 2.4, 2.4), (-0.100, .892, .652, .153, 2.4, 2.4), (-0.050, .893, .660, .141, 2.4, 2.4),
          (0.000, .886, .669, .131, 2.4, 2.4), (0.050, .868, .679, .120, 2.5, 2.4), (0.100, .838, .692, .109, 2.6, 2.4),
          (0.140, .806, .708, .100, 2.8, 2.4), (0.172, .760, .726, .088, 3.0, 2.4)]
# banco: topo medido (sobe na cauda), espessura do estofado, largura
BANCO = [(0.140, .790, .730, .060, 3.0, 4.0), (0.172, .801, .726, .080, 3.0, 4.0), (0.220, .801, .716, .098, 3.0, 4.0),
         (0.300, .800, .710, .106, 3.0, 4.0), (0.380, .799, .709, .115, 3.0, 4.0), (0.450, .807, .717, .121, 3.0, 4.0),
         (0.520, .825, .735, .122, 3.0, 4.0), (0.600, .855, .767, .121, 3.0, 4.0), (0.680, .877, .792, .117, 3.0, 4.0),
         (0.760, .895, .815, .113, 3.0, 4.0), (0.840, .912, .837, .112, 3.0, 4.0), (0.900, .922, .852, .114, 3.0, 4.0),
         (0.935, .926, .868, .108, 3.2, 4.0)]


def _tab(lst):
    return [dict(zip(("y", "zt", "zb", "w", "et", "eb"), t)) for t in lst]


def tanque():
    an = aneis_de_tabela(interpolar(_tab(TANQUE), 36), lados=36, passes=2)
    p = P()
    malha_de_aneis(p, an, "tinta", ponta_a=((0.10, 0.84), (0.22, 0.58), (0.32, 0.30)),
                   ponta_b=((0.14, 0.84), (0.30, 0.55), (0.44, 0.25)))
    parte("Tanque", "chassi", p)
    # bocal e tampa
    ytc = -0.095
    zt = float(np.interp(ytc, [t[0] for t in TANQUE], [t[1] for t in TANQUE]))
    tc = P()
    tc.revolucao([(0.046, 0.0), (0.048, 0.006), (0.040, 0.012), (0.030, 0.017), (0.0, 0.017)], V((0, ytc, zt - 0.004)),
                 (0, 0, 1), 24, "cromo")
    parte("Tampa_Tanque", "chassi", tc)
    return an


def banco():
    an = aneis_de_tabela(interpolar(_tab(BANCO), 40), lados=36, passes=2)
    p = P()
    malha_de_aneis(p, an, "banco", ponta_a=((0.12, 0.88), (0.26, 0.62), (0.38, 0.30)),
                   ponta_b=((0.12, 0.88), (0.26, 0.62), (0.38, 0.30)))
    parte("Banco", "chassi", p)
    # base do banco (plastico preto) um pouco menor, por baixo
    tb = [dict(t, zt=t["zb"] + 0.014, zb=t["zb"] - 0.020, w=t["w"] * 0.92, et=3.0, eb=3.0) for t in interpolar(_tab(BANCO), 24)]
    pb = P()
    malha_de_aneis(pb, aneis_de_tabela(tb, lados=24, passes=2), "plastico", ponta_a=((0.2, 0.7),), ponta_b=((0.2, 0.7),))
    parte("Banco_Base", "chassi", pb)
    return an


# ---------------------------------------------------------------- lathe com UV cilindrico (uma ilha por peca de revolucao)
def lathe_uv(self, perfil, centro, eixo_v, lados, peca, mod=None, fechar=False, ref=(0, 0, 1), escala_u=1.0):
    """perfil [(raio, a)] em torno do eixo; mod(i, k) -> fator do raio (banda de rodagem); UV: u = angulo, v = arco"""
    bm = self.bm
    uvl = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
    ex = V(eixo_v).normalized()
    e1 = V(ref) - ex * V(ref).dot(ex)
    if e1.length < 1e-3:
        e1 = V((1, 0, 0)) - ex * ex[0]
    e1.normalize()
    e2 = ex.cross(e1)
    c = V(centro)
    n = len(perfil)
    arco_ = [0.0]
    for i in range(1, n):
        arco_.append(arco_[-1] + math.hypot(perfil[i][0] - perfil[i - 1][0], perfil[i][1] - perfil[i - 1][1]))
    if fechar:
        arco_.append(arco_[-1] + math.hypot(perfil[0][0] - perfil[-1][0], perfil[0][1] - perfil[-1][1]))
    circ_ = 2 * math.pi * max(r for r, _ in perfil) * escala_u
    aneis = []
    for i, (r, a) in enumerate(perfil):
        ring = []
        for k in range(lados):
            t = 2 * math.pi * k / lados
            f = mod(i, k) if mod else 1.0
            ring.append(bm.verts.new(c + ex * a + (e1 * math.cos(t) + e2 * math.sin(t)) * (r * f)))
        aneis.append(ring)
    pares = list(zip(range(n - 1), range(1, n))) + ([(n - 1, 0)] if fechar else [])
    for i, j in pares:
        va = arco_[i]
        vb = arco_[i + 1] if j else arco_[-1]
        for k in range(lados):
            k2 = (k + 1) % lados
            try:
                f = bm.faces.new([aneis[i][k], aneis[i][k2], aneis[j][k2], aneis[j][k]])
            except ValueError:
                continue
            f[self.lay] = PID[peca]
            u0, u1 = k / lados * circ_, (k + 1) / lados * circ_
            for lp, (u, vv) in zip(f.loops, ((u0, va), (u1, va), (u1, vb), (u0, vb))):
                lp[uvl].uv = (u, vv)
    return aneis


P.lathe_uv = lathe_uv


# ---------------------------------------------------------------- rodas
def roda_v3(nome, yc, larg, osso, disco=0, tambor=0, coroa=0, raios=6, rw=0.036):
    """pneu com banda de rodagem em geometria, aro de liga, 6 raios, cubo, freio. Eixo X; disco/coroa no lado +X"""
    p = P()
    L = larg / 2
    c = V((0, yc, ZC))
    R = R_PNEU
    lados = 96
    lat = [-.72, -.54, -.36, -.18, 0.0, .18, .36, .54, .72]
    lado_a = [(.210, -.78), (.224, -.87), (.248, -.96), (.270, -1.0), (.285, -.93), (.292, -.82)]
    perfil = [(r, a * L) for r, a in lado_a]
    perfil += [(R - 0.007 * (f / .72) ** 2, f * L) for f in lat]
    perfil += [(r, -a * L) for r, a in reversed(lado_a)]
    base = len(lado_a)

    def mod(i, k):
        j = i - base
        if 0 <= j < len(lat) and j != 4:
            return 1.0 if ((k + abs(j - 4) * 2) % 6) < 3 else 0.972
        return 1.0
    p.lathe_uv(perfil, c, (1, 0, 0), lados, "pneu", mod=mod)
    ext = [(.2265, -rw * 1.12), (.2265, -rw * 0.98), (.2160, -rw * 0.86), (.2010, -rw * 0.62), (.2010, rw * 0.62),
           (.2160, rw * 0.86), (.2265, rw * 0.98), (.2265, rw * 1.12)]
    interno = [(r - 0.010, a * 0.92) for r, a in reversed(ext)]
    p.lathe_uv(ext + interno, c, (1, 0, 0), 48, "aro", fechar=True)
    for k in range(raios):
        a = 2 * math.pi * (k + 0.5) / raios
        d = V((0, math.sin(a), math.cos(a)))
        est = [(c + d * 0.050, 0.056, 0.036), (c + d * 0.085, 0.044, 0.030), (c + d * 0.130, 0.036, 0.026),
               (c + d * 0.175, 0.036, 0.027), (c + d * 0.205, 0.050, 0.034)]
        p.varrer(circ(8, 3.4), est, "raio", up=(1, 0, 0))
    p.lathe_uv([(.030, -.074), (.043, -.064), (.050, -.044), (.056, -.026), (.060, 0.0), (.056, .026), (.050, .044),
                (.043, .064), (.030, .074)], c, (1, 0, 0), 28, "cubo")
    p.lathe_uv([(.018, -.098), (.021, -.094), (.021, -.080), (.018, -.078)], c, (1, 0, 0), 14, "aco", fechar=True)
    p.lathe_uv([(.018, .098), (.021, .094), (.021, .080), (.018, .078)], c, (1, 0, 0), 14, "aco", fechar=True)
    p.cilindro(c + V((0.012, 0.02, 0.205)), c + V((0.012, 0.025, 0.232)), 0.008, "borracha", 8)
    if disco:
        s = disco
        p.lathe_uv([(.064, s * .052), (.100, s * .058), (.104, s * .0625), (.100, s * .0625), (.064, s * .0585)], c,
                   (1, 0, 0), 40, "disco", fechar=True)
        p.lathe_uv([(.100, s * .0605), (.168, s * .0605), (.168, s * .0655), (.100, s * .0655)], c, (1, 0, 0), 64,
                   "disco", fechar=True)
    if tambor:
        s = tambor
        p.lathe_uv([(.050, s * .046), (.098, s * .048), (.108, s * .060), (.110, s * .088), (.074, s * .092),
                    (.050, s * .078)], c, (1, 0, 0), 40, "tambor", fechar=True)
    if coroa:
        s = coroa
        p.lathe_uv([(.064, s * .056), (.108, s * .060), (.112, s * .066), (.108, s * .0705), (.064, s * .0655)], c, (1, 0, 0),
                   76, "coroa", mod=lambda i, k: ((1.0 if k % 2 == 0 else 0.935) if i in (1, 2, 3) else 1.0), fechar=True)
    parte(nome, osso, p)


# ---------------------------------------------------------------- paralama dianteiro: casca em arco, solida
def casca_arco(p, centro, R, a0, a1, hw_fn, esp, n, m, peca, coroa=0.010):
    """arco em torno de um eixo X: a de a0 a a1 graus (da vertical, + para tras), largura hw_fn(a), espessura esp"""
    ao, ai = [], []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        d = V((0, math.sin(a), math.cos(a)))
        hw = hw_fn(math.degrees(a))
        fo, fi = [], []
        for j in range(m + 1):
            u = -1 + 2 * j / m
            r = R - coroa * u * u
            fo.append(p.bm.verts.new(V((hw * u, 0, 0)) + V(centro) + d * r))
            fi.append(p.bm.verts.new(V((hw * u, 0, 0)) + V(centro) + d * (r - esp)))
        ao.append(fo)
        ai.append(fi)
    for i in range(n):
        for j in range(m):
            p.face([ao[i][j], ao[i][j + 1], ao[i + 1][j + 1], ao[i + 1][j]], peca)
            p.face([ai[i][j], ai[i + 1][j], ai[i + 1][j + 1], ai[i][j + 1]], peca)
    for j in (0, m):
        for i in range(n):
            p.face([ao[i][j], ao[i + 1][j], ai[i + 1][j], ai[i][j]], peca)
    for i in (0, n):
        for j in range(m):
            p.face([ao[i][j], ai[i][j], ai[i][j + 1], ao[i][j + 1]], peca)


def paralama_diant():
    p = P()
    casca_arco(p, AXLE_F, 0.326, -34, 84, lambda a: 0.082 + 0.010 * (abs(a - 25) / 60) ** 2, 0.011, 30, 10, "tinta")
    parte("Paralama_Diant", "suspensao_diant", p)


POS_LUZ = {}


# ---------------------------------------------------------------- pecas herdadas da Tripo (garfo, guidao, motor, quadro...)
def _bbox_componentes():
    comp, pv, co = REF["comp"], REF["pv"], REF["co"]
    nc = comp.max() + 1
    mn = np.full((nc, 3), 9.0)
    mx = np.full((nc, 3), -9.0)
    for k in range(3):
        v = co[pv[:, k]]
        np.minimum.at(mn, comp, v)
        np.maximum.at(mx, comp, v)
    return mn, mx


def osso_do_componente(mn, mx):
    c = (mn + mx) / 2
    if mx[1] - mn[1] > 0.55:
        return "chassi"
    if (c[1] < -0.30 and c[2] > 0.62) or (c[2] > 0.88 and c[1] < -0.15):
        return "direcao"
    if c[1] < -0.33 and c[2] <= 0.62:
        return "suspensao_diant"
    if c[1] > 0.32 and c[2] < 0.47 and abs(c[0]) < 0.2:
        return "balanca"
    return "chassi"


def classe_cor(c):
    lum = float(c.mean())
    if c[0] > 0.30 and c[0] > 1.8 * c[1] and c[0] > 1.8 * c[2]:
        return "ref_tinta"
    if lum >= 0.40:
        return "ref_claro"
    if lum >= 0.25:
        return "ref_medio"
    return "ref_escuro"


def herdar():
    """as faces da referencia que nao foram refeitas viram pecas limpas: soldadas, em quads quando da, uma malha por
    osso; lentes (farol, setas, lanterna) saem em malhas proprias para o jogo acender"""
    pv, cols, grp, ctr, comp = REF["pv"], REF["cols"], REF["grp"], REF["ctr"], REF["comp"]
    co = REF["co"]
    mnc, mxc = _bbox_componentes()
    osso_c = [osso_do_componente(mnc[i], mxc[i]) for i in range(len(mnc))]
    laranja = (cols[:, 0] > 0.45) & (cols[:, 1] > 0.2) & (cols[:, 1] < 0.62) & (cols[:, 2] < 0.30) & (cols[:, 0] > 1.3 * cols[:, 1])
    claro = (cols.mean(1) > 0.35) & ~laranja
    farol = claro & (ctr[:, 1] > -0.565) & (ctr[:, 1] < -0.515) & (ctr[:, 2] > 0.74) & (ctr[:, 2] < 0.90) & (np.abs(ctr[:, 0]) < 0.14)
    fr_lar = laranja & (ctr[:, 1] < -0.40) & (ctr[:, 2] > 0.78) & (ctr[:, 2] < 0.90)
    tr_lar = laranja & (ctr[:, 1] > 0.60) & (ctr[:, 2] > 0.70) & (ctr[:, 2] < 0.90)
    saidas = {}
    excl = np.isin(grp, ["roda_d", "roda_t", "paralama_d", "tanque", "banco"])
    # sobras da Tripo dentro do volume do banco e do tanque novos (z-fighting): fora
    for tab_, folga in ((BANCO, 0.02), (TANQUE, 0.02)):
        ty = [t[0] for t in tab_]
        zb_ = np.interp(ctr[:, 1], ty, [t[2] for t in tab_]) - 0.01
        zt_ = np.interp(ctr[:, 1], ty, [t[1] for t in tab_]) + 0.012
        w_ = np.interp(ctr[:, 1], ty, [t[3] for t in tab_]) + folga
        dentro = (ctr[:, 1] > ty[0]) & (ctr[:, 1] < ty[-1]) & (ctr[:, 2] > zb_) & (ctr[:, 2] < zt_) & (np.abs(ctr[:, 0]) < w_)
        excl = excl | (dentro & (grp != "rabeta"))
    for i in range(len(pv)):
        if excl[i]:
            continue
        osso = "chassi" if grp[i] == "rabeta" else osso_c[comp[i]]
        if farol[i]:
            saida, peca, osso = "Luz_Farol", "lente", "direcao"
        elif fr_lar[i]:
            saida, peca, osso = "Luz_Seta_" + ("E" if ctr[i, 0] > 0 else "D"), "lente", "direcao"
        elif tr_lar[i] and abs(ctr[i, 0]) > 0.14:
            saida, peca, osso = "Luz_Seta_" + ("E" if ctr[i, 0] > 0 else "D"), "lente", "chassi"
        elif tr_lar[i]:
            saida, peca, osso = "Luz_Lanterna", "lente", "chassi"
        else:
            saida = "Moto"
            peca = "ref_tinta" if grp[i] == "rabeta" else classe_cor(cols[i])
        saidas.setdefault((osso, saida), []).append((i, peca))
    for (osso, saida), lista in saidas.items():
        if saida.startswith('Luz_'):
            POS_LUZ[(osso, saida)] = np.mean([ctr[i] for i, _ in lista], axis=0)
    n_tri = 0
    for (osso, saida), lista in saidas.items():
        p = P()
        vmap = {}
        for i, peca in lista:
            vs = []
            for k in pv[i]:
                k = int(k)
                if k not in vmap:
                    vmap[k] = p.bm.verts.new(V(co[k]))
                vs.append(vmap[k])
            if len(set(vs)) == 3:
                p.face(vs, peca)
        bmesh.ops.remove_doubles(p.bm, verts=p.bm.verts[:], dist=0.0008)
        bmesh.ops.dissolve_degenerate(p.bm, dist=0.0003, edges=p.bm.edges[:])
        bmesh.ops.join_triangles(p.bm, faces=p.bm.faces[:], angle_face_threshold=0.30, angle_shape_threshold=0.75)
        n_tri += len(p.bm.faces)
        ob = parte("Ref_%s_%s" % (osso, saida), osso, p, saida, orientar=False)
    print("herdadas:", n_tri, "faces em", len(saidas), "malhas")


# ---------------------------------------------------------------- descanso lateral e placa (procedurais)
def descanso_v3():
    p = P()
    pv = PIVO_DESC
    p.cilindro(pv - V((0.022, 0, 0)), pv + V((0.034, 0, 0)), 0.036, "preto", 12)
    p.tubo([pv + V((0.022, 0, 0)), pv + V((0.110, 0.150, 0)), pv + V((0.215, 0.275, 0))], 0.028, "preto", 8,
           up=(0, 0, 1), suavizar=2, tampa=True)
    p.caixa(pv + V((0.228, 0.290, 0)), (0.078, 0.056, 0.032), "borracha", chanfro=0.007, seg=2)
    parte("Descanso", "descanso", p)


def placa_v3(y=1.020, z=0.620):
    """placa Mercosul de moto 20 x 17 cm (textura propria) + suporte"""
    pl = P()
    rot = Matrix.Rotation(math.radians(-12), 4, 'X')
    pl.caixa((0, y, z), (0.200, 0.004, 0.170), "placa", rot=rot)
    parte("Placa", "chassi", pl, "Moto_Placa", orientar=False)
    me = OBJS["Placa"].data
    uvl = me.uv_layers.new(name="UVMap")
    inv = rot.inverted()
    for pol in me.polygons:
        fr = pol.normal.y > 0.5
        for li in pol.loop_indices:
            q = inv @ (me.vertices[me.loops[li].vertex_index].co - V((0, y, z)))
            uvl.data[li].uv = ((0.1 - q.x) / 0.2, (q.z + 0.085) / 0.17) if fr else (0.0, 0.0)


def luz_freio():
    """lente interna da lanterna: acende mais forte no freio"""
    c = POS_LUZ.get(("chassi", "Luz_Lanterna"), np.array([0, 0.89, 0.83]))
    p = P()
    p.caixa((0, c[1] + 0.012, c[2] - 0.004), (0.060, 0.016, 0.026), "lente", chanfro=0.004, seg=2)
    parte("Luz_Freio", "chassi", p, "Luz_Freio")


def pontos_da_referencia():
    """pontos de encaixe medidos nas faces da referencia corrigida"""
    co = REF["co"]
    out = {}
    for sgn, lado in ((1, "E"), (-1, "D")):
        sel = (co[:, 2] > 0.90) & (co[:, 2] < 1.03) & (co[:, 1] < -0.15) & (co[:, 1] > -0.5) & (sgn * co[:, 0] > 0.14)
        q = co[sel]
        ponta = q[np.argmax(sgn * q[:, 0])]
        reg = q[(sgn * q[:, 0] > sgn * ponta[0] * 1 - 0.115) & (sgn * q[:, 0] < sgn * ponta[0] - 0.02)] if False else q[(sgn * q[:, 0] > abs(ponta[0]) - 0.115) & (sgn * q[:, 0] < abs(ponta[0]) - 0.02)]
        out["mao_" + lado] = (sgn * (abs(ponta[0]) - 0.065), float(reg[:, 1].mean()), float(reg[:, 2].mean()))
    sel = (co[:, 1] > 0.88) & (co[:, 2] < 0.55) & (co[:, 0] < -0.05)
    q = co[sel]
    out["escape"] = (float(q[:, 0].mean()), float(q[:, 1].max()), float(q[:, 2].mean()))
    return out


def ossos_da_moto():
    cima = V((0, 0, 1))
    pr = pontos_da_referencia()
    ossos = []

    def osso(nome, cab, cau, pai, deforma=True):
        ossos.append((nome, V(cab), V(cau), pai, deforma))
    osso("raiz", (0, 0, 0), (0, 0, 0.25), None)
    osso("chassi", (0, 0, 0.55), (0, 0, 0.80), "raiz")
    osso("direcao", AXLE_F + AX * 0.60, AXLE_F + AX * 0.85, "chassi")
    osso("suspensao_diant", AXLE_F, AXLE_F + AX * 0.20, "direcao")
    osso("roda_dianteira", AXLE_F, AXLE_F + V((0, 0, 0.12)), "suspensao_diant")
    osso("balanca", PIVO_BAL, PIVO_BAL + V((0, 0, 0.12)), "chassi")
    osso("roda_traseira", AXLE_T, AXLE_T + V((0, 0, 0.12)), "balanca")
    osso("descanso", PIVO_DESC, PIVO_DESC + V((0, 0, 0.08)), "chassi")
    lf = POS_LUZ.get(("direcao", "Luz_Farol"), np.array([0, -0.55, 0.82]))
    lt = POS_LUZ.get(("chassi", "Luz_Lanterna"), np.array([0, 0.89, 0.83]))
    sf = {l: POS_LUZ.get(("direcao", "Luz_Seta_" + l), np.array([0.2 if l == "E" else -0.2, -0.5, 0.83])) for l in "ED"}
    st = {l: POS_LUZ.get(("chassi", "Luz_Seta_" + l), np.array([0.19 if l == "E" else -0.19, 0.88, 0.76])) for l in "ED"}
    pontos = {
        "ponto_piloto": ("chassi", (0, 0.300, 0.803)),
        "ponto_garupa": ("chassi", (0, 0.640, 0.868)),
        "ponto_mao_E": ("direcao", pr["mao_E"]), "ponto_mao_D": ("direcao", pr["mao_D"]),
        "ponto_pe_E": ("chassi", (0.235, 0.115, 0.300)), "ponto_pe_D": ("chassi", (-0.235, 0.115, 0.300)),
        "ponto_pe_garupa_E": ("chassi", (0.215, 0.560, 0.365)), "ponto_pe_garupa_D": ("chassi", (-0.215, 0.560, 0.365)),
        "ponto_farol": ("direcao", (0, lf[1] - 0.01, lf[2])), "ponto_farol_alto": ("direcao", (0, lf[1] - 0.01, lf[2] + 0.02)),
        "ponto_seta_frente_E": ("direcao", tuple(sf["E"])), "ponto_seta_frente_D": ("direcao", tuple(sf["D"])),
        "ponto_seta_tras_E": ("chassi", tuple(st["E"])), "ponto_seta_tras_D": ("chassi", tuple(st["D"])),
        "ponto_lanterna": ("chassi", (0, lt[1] + 0.01, lt[2])), "ponto_freio": ("chassi", (0, lt[1] + 0.025, lt[2])),
        "ponto_luz_placa": ("chassi", (0, 1.03, 0.70)), "ponto_placa": ("chassi", (0, 1.025, 0.620)),
        "ponto_escapamento": ("chassi", pr["escape"]),
        "ponto_tanque": ("chassi", (0, -0.095, 0.895)), "ponto_buzina": ("direcao", (0, -0.45, 0.62)),
        "ponto_motor": ("chassi", (0, 0.0, 0.42)),
        "ponto_bau": ("chassi", (0, 0.700, 0.885)),
        "ponto_descanso_chao": ("raiz", (0.34, 0.45, 0.0)),
        "ponto_contato_diant": ("raiz", (0, YF, 0.0)), "ponto_contato_tras": ("raiz", (0, YT, 0.0)),
        "ponto_camera": ("chassi", (0, 0.35, 1.55)),
    }
    for nome, (pai, pos) in pontos.items():
        osso(nome, pos, V(pos) + cima * 0.06, pai, False)
    return ossos


COR_LUZ.clear()
COR_LUZ.update({"Luz_Farol": (0.86, 0.88, 0.82), "Luz_Seta_E": (0.90, 0.50, 0.06), "Luz_Seta_D": (0.90, 0.50, 0.06),
                "Luz_Lanterna": (0.60, 0.04, 0.03), "Luz_Freio": (0.72, 0.03, 0.025)})


def montar_geometria_v3():
    carregar_ref()
    roda_v3("Roda_Dianteira", YF, 0.100, "roda_dianteira", disco=1)
    roda_v3("Roda_Traseira", YT, 0.130, "roda_traseira", tambor=-1, coroa=1, rw=0.044)
    paralama_diant()
    tanque()
    banco()
    herdar()
    luz_freio()
    descanso_v3()
    placa_v3()


# ---------------------------------------------------------------- UV: atlas unico (pecas de revolucao ja trazem UV cilindrico)
def uv_atlas(objs):
    obs = [o for k, o in objs.items() if not SAIDA_DE[k].startswith(SEM_ATLAS)]
    for ob in obs:
        if not ob.data.uv_layers:
            smart_uv(ob)
    ilhas = preparar_ilhas(obs)
    esc = empacotar(ilhas)
    print("atlas: %.0f px/m (pintura), %d ilhas em %d objetos" % (esc, len(ilhas), len(obs)))
    return esc


def amostrar_ref(R, passo=2):
    """cor da referencia (Tripo) na superficie mais proxima de cada texel coberto do atlas"""
    pos, cob = R["pos"], R["cobre"]
    H, W = cob.shape
    out = np.zeros((H, W, 3), np.float32) + 0.2
    bvh, cols = REF["bvh_all"], REF["cols"]
    sub = cob[::passo, ::passo]
    ii, jj = np.where(sub)
    for i, j in zip(ii, jj):
        loc, nor, idx, dist = bvh.find_nearest(V(pos[i * passo, j * passo]))
        if idx is not None:
            out[i * passo:(i + 1) * passo, j * passo:(j + 1) * passo] = cols[idx]
    return out


# ---------------------------------------------------------------- materiais (cor + metal/rugosidade)
def material_pbr(nome, img, img_mr, cor=None):
    mat = bpy.data.materials.get(nome)
    if mat:
        bpy.data.materials.remove(mat)
    mat = bpy.data.materials.new(nome)
    mat.use_nodes = True
    nt = mat.node_tree
    bs = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    saida = tex.outputs[0]
    if cor is not None:
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type, mix.blend_type = 'RGBA', 'MULTIPLY'
        mix.inputs[0].default_value = 1.0
        nt.links.new(tex.outputs[0], mix.inputs[6])
        mix.inputs[7].default_value = cor
        saida = mix.outputs[2]
    nt.links.new(saida, bs.inputs["Base Color"])
    tm = nt.nodes.new("ShaderNodeTexImage")
    tm.image = img_mr
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(tm.outputs[0], sep.inputs[0])
    nt.links.new(sep.outputs[1], bs.inputs["Roughness"])
    nt.links.new(sep.outputs[2], bs.inputs["Metallic"])
    mat.use_backface_culling = False
    return mat


def materiais(saidas, atlas, mr_img, img_placa):
    m_moto = material_pbr("Moto_Atlas", atlas, mr_img, None)
    for nome, ob in saidas.items():
        me = ob.data
        me.materials.clear()
        if nome == "Moto":
            me.materials.append(m_moto)
        elif nome == "Moto_Placa":
            me.materials.append(material_textura("Moto_Placa", img_placa, None, 0.45))
        else:
            me.materials.append(material_luz(nome))


def montar_rig_e_saidas(col, atlas, mr_img, img_placa):
    rig = criar_rig(col, ossos_da_moto())
    for chave, ob in OBJS.items():
        pele(ob, OSSO_DE[chave], rig)
    grupos = {}
    for chave, ob in OBJS.items():
        grupos.setdefault(SAIDA_DE[chave], []).append(ob)
    saidas = {nome: juntar(obs, nome, col) for nome, obs in grupos.items()}
    materiais(saidas, atlas, mr_img, img_placa)
    for ob in saidas.values():
        for mod in ob.modifiers:
            if mod.type == 'ARMATURE':
                mod.object = rig
        if ob.parent != rig:
            ob.parent = rig
    return rig, saidas


def colisao_v3(col):
    """casco convexo da moto sem os espelhos nem as pontas do guidao (|x| <= 0,30), reduzido para a fisica"""
    bm = bmesh.new()
    for k, ob in OBJS.items():
        if SAIDA_DE[k] != "Moto" or k in ("Descanso",):
            continue
        for v in ob.data.vertices:
            if abs(v.co.x) <= 0.30 and v.co.z < 1.02:
                bm.verts.new(v.co)
    bmesh.ops.convex_hull(bm, input=bm.verts[:])
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    me = bpy.data.meshes.new("Moto_Colisao")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("Moto_Colisao", me)
    col.objects.link(ob)
    mod = ob.modifiers.new("reduz", 'DECIMATE')
    mod.ratio = 0.12
    dg = bpy.context.evaluated_depsgraph_get()
    novo = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    velho = ob.data
    ob.data = novo
    bpy.data.meshes.remove(velho)
    novo.name = "Moto_Colisao"
    novo.materials.clear()
    return ob


if not globals().get("SO_FUNCOES"):
    import importlib
    import moto_textura3
    importlib.reload(moto_textura3)
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    limpar()
    os.makedirs(SAIDA, exist_ok=True)
    COL = colecao("Moto_Delivery")
    montar_geometria_v3()
    suavizar(OBJS.values())
    uv_atlas(OBJS)
    tri = sum(len(p.vertices) - 2 for ob in OBJS.values() for p in ob.data.polygons)
    print("triangulos:", tri)
    ATLAS_PNG = os.path.join(SAIDA, "moto_atlas.png")
    MR_PNG = os.path.join(SAIDA, "moto_metal_rugosidade.png")
    PLACA_PNG = os.path.join(SAIDA, "moto_placa.png")
    if ("--exportar" in ARGS and "--sem-bake" not in ARGS) or globals().get("ASSAR") or not os.path.exists(ATLAS_PNG):
        R = bake_dados(OBJS, ATLAS_PX, 64 if "--exportar" in ARGS else globals().get("AMOSTRAS_AO", 32))
        R["ref"] = amostrar_ref(R)
        npz = [a.split("=", 1)[1] for a in ARGS if a.startswith("--guardar-bake=")]
        if npz:
            np.savez_compressed(npz[0], **R)
        albedo, mrmap = moto_textura3.pintar(R, PECAS)
        salvar_png(albedo, ATLAS_PNG, "moto_atlas_tmp")
        salvar_png(mrmap, MR_PNG, "moto_mr_tmp")
        import moto_textura as mt2
        salvar_png(mt2.placa()[::-1], PLACA_PNG, "moto_placa_tmp")
    ATLAS = carregar_img(ATLAS_PNG, "moto_atlas")
    MRIMG = carregar_img(MR_PNG, "moto_mr")
    MRIMG.colorspace_settings.name = 'Non-Color'
    PLACA = carregar_img(PLACA_PNG, "moto_placa")
    COL_COLI = colecao("Moto_Colisao")
    COLI = colisao_v3(COL_COLI)
    RIG, SAIDAS_OBS = montar_rig_e_saidas(COL, ATLAS, MRIMG, PLACA)
    tri = sum(len(p.vertices) - 2 for ob in SAIDAS_OBS.values() for p in ob.data.polygons)
    print("triangulos finais:", tri, "| colisao:", sum(len(p.vertices) - 2 for p in COLI.data.polygons))
    if "--exportar" in ARGS or globals().get("EXPORTAR"):
        exportar([RIG] + list(SAIDAS_OBS.values()), os.path.join(SAIDA, "moto_delivery.glb"))
        exportar([COLI], os.path.join(SAIDA, "moto_delivery_colisao.glb"))
        os.makedirs(os.path.dirname(BLEND_COPIA), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=BLEND_COPIA, copy=True)
        print("copia", BLEND_COPIA)
