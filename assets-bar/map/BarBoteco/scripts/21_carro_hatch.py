# 21_carro_hatch.py
# Carro hatch 3 portas (anos 80, estilo PS2/PS3) para o jogo no PlayCanvas, refeito a partir do modelo da Tripo
# (Downloads\highcar.glb: 1 malha de 10k triangulos soltos, sem simetria, rodas coladas, vidro pintado, sem interior).
# A malha da Tripo so serve de referencia: as medidas abaixo sairam dela (raycast + vistas ortograficas), ja em
# escala real (3,70 m de comprimento; a largura da Tripo vinha ~15% exagerada e foi corrigida para 1,60 m).
#
# Roda com exec no Blender MCP (refaz tudo; a referencia fica na colecao "Carro_Referencia") ou em segundo plano:
#   "D:\SteamLibrary\steamapps\common\Blender\blender.exe" -b --factory-startup -P 21_carro_hatch.py -- --exportar
#
# Convencoes (iguais as da moto, 20_moto_delivery.py):
#   frente = -Y no Blender = +Z no glTF/PlayCanvas; origem no chao, no meio do entre-eixos; Z para cima
#   E/D = esquerda/direita do motorista (esquerda = +X); motorista sentado a esquerda
#
# Carroceria = grade de quads (estacoes ao longo de Y x linhas de contorno k0..k23 em meia secao, x >= 0):
#   k0..k8   assoalho (centro -> quina de baixo)        k9  soleira          k10 linha das caixas de roda
#   k11..k14 lateral ate o ombro                        k15 cintura          k16..k19 vidro lateral (base..topo)
#   k20 borda do teto / coluna A / coluna C            k21 borda do para-brisa/vigia   k22, k23 meio e centro
# No capo as linhas k16..k23 deitam sobre o capo; atras da vigia deitam sobre a borda da tampa. As pontas (frente e
# traseira) fecham com uma grade 8x7 cujas colunas caem nas divisas de farol, grade, lanterna e placa.
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
for _a in ARGS:
    if _a.startswith("--guardar-bake="):
        GUARDAR_BAKE = _a.split("=", 1)[1]
GLB_FONTE = r"C:\Users\rafael\Downloads\highcar.glb"
SAIDA = r"C:\Users\rafael\BarBoteco\export\carro"
BLEND_COPIA = r"C:\Users\rafael\Desktop\BAR\2.0\veiculos\carro\carro_hatch.blend"
SCRIPTS = "C:/Users/rafael/BarBoteco/scripts"
if "--exportar" in ARGS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene
COLS = ["Carro_Hatch", "Carro_Colisao", "Carro_TMP"]

# ---------------------------------------------------------------- cotas (metros)
Y_CAPF, Y_CAPR = -1.765, 1.795          # face da frente / da traseira (sem para-choques)
YC_D, YC_T, ZC = -1.157, 1.157, 0.29    # centro das rodas (entre-eixos 2,31 m)
R_ARCO = 0.365                          # raio da caixa de roda
R_RODA, L_PNEU, X_RODA = 0.285, 0.175, 0.665
X_CAIXA = 0.50                          # parede interna da caixa de roda
Y_WS0, Y_WS1 = -0.796, -0.13            # base / topo do para-brisa
Y_P0, Y_P1, Y_B = -0.71, 0.48, 0.53     # porta (frente, tras) e fim da coluna B
Y_W0 = -0.55                            # inicio do vidro da porta (antes: quebra-vento preto do retrovisor)
Y_RF1, Y_HG1 = 1.24, 1.66               # fim do teto (dobradica da tampa) / base da vigia
Z_CINTURA = 0.875
ANG_ARCO = (8, 35, 62, 90, 118, 145, 172)


def tab(t, pts):
    """interpolacao Catmull-Rom numa tabela [(t, v), ...] (v escalar ou tupla)"""
    if t <= pts[0][0]:
        return pts[0][1]
    if t >= pts[-1][0]:
        return pts[-1][1]
    n = len(pts)
    for i in range(n - 1):
        t0, t1 = pts[i][0], pts[i + 1][0]
        if t <= t1:
            u = (t - t0) / (t1 - t0)
            p1, p2 = pts[i][1], pts[i + 1][1]
            if i > 0:
                p0 = pts[i - 1][1]
                m1 = 0.0 if (p1 - p0) * (p2 - p1) <= 0 else (p2 - p0) / (t1 - pts[i - 1][0]) * (t1 - t0)
            else:
                m1 = p2 - p1
            if i + 2 < n:
                p3 = pts[i + 2][1]
                m2 = 0.0 if (p2 - p1) * (p3 - p2) <= 0 else (p3 - p1) / (pts[i + 2][0] - t0) * (t1 - t0)
            else:
                m2 = p2 - p1
            u2, u3 = u * u, u * u * u
            return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2
    return pts[-1][1]


def lerp(a, b, u):
    return a + (b - a) * u


# topo da carroceria na linha de centro (capo, para-brisa, teto, vigia, borda da tampa)
ZTOPO = [(-1.765, .745), (-1.70, .757), (-1.60, .781), (-1.50, .807), (-1.40, .829), (-1.20, .866), (-1.00, .895),
         (-0.796, .930), (-0.60, 1.062), (-0.40, 1.190), (-0.20, 1.315), (-0.13, 1.350), (0.00, 1.372), (0.20, 1.387),
         (0.40, 1.395), (0.60, 1.396), (0.80, 1.394), (1.00, 1.388), (1.15, 1.377), (1.24, 1.360), (1.30, 1.322),
         (1.40, 1.205), (1.50, 1.105), (1.60, 1.010), (1.66, .972), (1.72, .948), (1.76, .935), (1.795, .918)]
# abaulamento transversal: queda = c * (x / 0,5)^3
CAMBER = [(-1.765, .010), (-0.796, .014), (-0.13, .040), (1.24, .040), (1.66, .030), (1.795, .020)]
CAMBER_EXP = [(-1.765, 2.0), (-0.796, 2.0), (-0.45, 3.0), (1.795, 3.0)]   # capo mais redondo nas quinas
# afinamento em planta (multiplica todos os x)
LARG = [(-1.765, .950), (-1.73, .975), (-1.66, .990), (-1.55, .997), (-1.40, 1.0), (1.40, 1.0), (1.50, .987),
        (1.60, .968), (1.70, .946), (1.75, .930), (1.795, .905)]
# fundo
ZFUNDO = [(-1.765, .30), (-1.70, .272), (0.90, .272), (1.30, .305), (1.60, .335), (1.795, .36)]
# meia largura da lateral (abaixo da cintura) e do vidro lateral, em funcao de z
LADO = [(.26, .680), (.30, .704), (.40, .722), (.52, .745), (.63, .756), (.72, .752), (.80, .736), (.85, .716),
        (.885, .696)]
VIDRO = [(.88, .672), (.905, .664), (1.00, .627), (1.10, .592), (1.20, .552), (1.27, .522), (1.345, .490)]
# soleira
ZSOLEIRA = [(-1.765, .30), (-1.50, .31), (-0.80, .33), (0.80, .33), (1.50, .35), (1.795, .36)]

# pontas: colunas da grade das pontas (x antes do afinamento), de fora para o centro
TOPO_FRENTE = [.725, .705, .670, .630, .520, .390, .260, .130, 0.0]       # k15..k23 na frente
TOPO_TRAS = [.725, .715, .700, .640, .570, .550, .360, .190, 0.0]         # k15..k23 atras
Z_LADO_FRENTE = [.30, .38, .45, .57, .640, .700, .712]                   # k8..k14 na face da frente
Z_LADO_TRAS = [.36, .45, .53, .61, .710, .800, .835]                     # k8..k14 na face de tras
CAPO_BASE = [.655, .640, .625, .610, .575, .290, 0.0]                     # k17..k23 na base do para-brisa
FRACOES_LADO = [0.0, .15, .40, .64, .84, 1.0]                            # k9..k14 entre soleira e ombro


def ztopo(y):
    return tab(y, ZTOPO)


def zsup(y, x):
    """altura da superficie de cima (capo/vidros/teto/tampa) na meia largura x"""
    return ztopo(y) - tab(y, CAMBER) * (abs(x) / 0.5) ** tab(y, CAMBER_EXP)


def larg(y):
    return tab(y, LARG)


def y_ponta(y0, x, frente):
    """as faces das pontas sao levemente abauladas em planta"""
    return y0 + 0.035 * (x / 0.74) ** 2 if frente else y0 - 0.030 * (x / 0.735) ** 2


# ---------------------------------------------------------------- estacoes
def estacoes():
    est = [dict(y=Y_CAPF, tipo="capF"), dict(y=-1.73), dict(y=-1.66), dict(y=-1.545)]
    for a in ANG_ARCO:
        est.append(dict(y=YC_D - R_ARCO * math.cos(math.radians(a)), tipo="arco", ang=a))
    est += [dict(y=-0.765), dict(y=Y_P0), dict(y=Y_W0), dict(y=-0.40), dict(y=-0.25), dict(y=Y_WS1), dict(y=0.05),
            dict(y=0.27), dict(y=Y_P1), dict(y=Y_B), dict(y=0.68), dict(y=0.77)]
    for a in ANG_ARCO:
        est.append(dict(y=YC_T - R_ARCO * math.cos(math.radians(a)), tipo="arco", ang=a))
        if a == 90:   # coluna C: borda de tras do vidro lateral inclinada; teto termina aqui
            est.append(dict(y=1.30, tipo="arco", ang=math.degrees(math.acos((YC_T - 1.30) / R_ARCO)), linhas={17: 1.25, 18: 1.19, 19: 1.13, 20: Y_RF1, 21: Y_RF1, 22: Y_RF1,
                                             23: Y_RF1}))
    est += [dict(y=1.545), dict(y=1.60), dict(y=Y_HG1), dict(y=1.71), dict(y=1.755), dict(y=Y_CAPR, tipo="capR")]
    return est


def lado_xz(y, z):
    return tab(z, LADO) * larg(y) if z <= 0.885 else tab(z, VIDRO) * larg(y)


def linhas_topo(y):
    """(x, z) de k20..k23 + z da coluna (k20) para as regioes do para-brisa, teto e vigia"""
    w = larg(y)
    if y < Y_WS1:
        u = (y - Y_WS0) / (Y_WS1 - Y_WS0)
        xs = [lerp(.610, .490, u), lerp(.575, .450, u), lerp(.290, .225, u), 0.0]
    elif y <= Y_RF1:
        xs = [.490, .400, .220, 0.0]
    else:
        u = min((y - Y_RF1) / (Y_HG1 - Y_RF1), 1.0)
        xs = [lerp(.490, .575, u), lerp(.400, .520, u), lerp(.220, .260, u), 0.0]
    return [(x * w, zsup(y, x * w)) for x in xs]


def anel_cabine(y, z9, z14, arco=None):
    """meia secao para estacoes entre a base do para-brisa e a base da vigia"""
    w = larg(y)
    pts = [None] * 24
    zb = tab(y, ZFUNDO)
    if arco is None:
        for k, x in enumerate([0, .09, .18, .27, .36, .45, .54, .62]):
            pts[k] = (x * w, zb)
        pts[8] = (.68 * w, zb)
        zs = [lerp(z9, z14, f) for f in FRACOES_LADO]
    else:
        za = arco
        for k in range(8):
            pts[k] = (X_CAIXA * 0.88 * k / 7, zb)
        pts[8] = (X_CAIXA, zb + 0.02)
        zs = [za, za] + [lerp(za, z14, f) for f in (.27, .54, .78, 1.0)]
    for i, z in enumerate(zs):
        pts[9 + i] = (lado_xz(y, z), z)
    if arco is not None:
        pts[9] = (X_CAIXA, arco)
    # cintura e vidro / coluna
    topo = linhas_topo(y)
    zA = topo[0][1]
    z15 = min(Z_CINTURA, zA - 0.03)
    pts[15] = (lado_xz(y, min(z15, .885)), z15)
    span = zA - z15
    z16, z19 = z15 + min(0.03, 0.2 * span), zA - min(0.08, 0.2 * span)
    for i, z in enumerate([z16, lerp(z16, z19, 1 / 3), lerp(z16, z19, 2 / 3), z19]):
        pts[16 + i] = (tab(z, VIDRO) * w, z)
    pts[20:24] = topo
    return pts


def anel_capo(y, z9, arco=None):
    """meia secao no trecho do capo (y <= base do para-brisa)"""
    w = larg(y)
    zhe = zsup(y, .665 * w)
    pts = anel_cabine(y, z9, zhe - 0.07, arco) if arco is not None else None
    # perto da face da frente o ombro fica vivo e as linhas da lateral encostam nas da grade da frente
    uf = min(max((y - Y_CAPF) / 0.25, 0.0), 1.0)
    uf = uf * uf * (3 - 2 * uf)
    q14, q15, q16 = lerp(.010, .070, uf), lerp(.005, .030, uf), lerp(.002, .006, uf)
    if pts is None:
        pts = [None] * 24
        zb = tab(y, ZFUNDO)
        for k, x in enumerate([0, .09, .18, .27, .36, .45, .54, .62]):
            pts[k] = (x * w, zb)
        pts[8] = (.68 * w, zb)
        for i, f in enumerate(FRACOES_LADO):
            z = lerp(z9, zhe - q14, f)
            if 1 <= i <= 4:
                z = lerp(Z_LADO_FRENTE[i + 1], z, uf)
            pts[9 + i] = (tab(z, LADO) * w, z)
    pts[14] = (.740 * w, zhe - q14)
    pts[15] = (.725 * w, zhe - q15)
    pts[16] = (.700 * w, zhe - q16)
    u = (y - Y_CAPF) / (Y_WS0 - Y_CAPF)
    for i in range(7):
        x = lerp(TOPO_FRENTE[2 + i], CAPO_BASE[i], u) * w
        pts[17 + i] = (x, zsup(y, x))
    return pts


def anel_ponta(y0, frente):
    """anel das faces de frente/tras: trilho de baixo, lateral e de cima com as mesmas colunas"""
    w = larg(y0)
    topo = TOPO_FRENTE if frente else TOPO_TRAS
    zl = Z_LADO_FRENTE if frente else Z_LADO_TRAS
    pts = [None] * 24
    for c in range(9):
        x = topo[8 - c] * w
        pts[c] = (x, zl[0])
    for i in range(1, 7):
        pts[8 + i] = ((.74 if frente else .735) * w, zl[i])
    pts[8] = (topo[0] * w * 0.985, zl[0])
    for i, x in enumerate(topo):
        xx = x * w
        dz = (0.0 if frente else -0.008) if i == 0 else (0.0 if frente else -0.003) if i == 1 else 0.0
        pts[15 + i] = (xx, zsup(y0, xx) + dz)
    return pts


def anel(est):
    y, tipo = est["y"], est.get("tipo")
    z9 = tab(y, ZSOLEIRA)
    if tipo == "capF":
        return anel_ponta(y, True)
    if tipo == "capR":
        return anel_ponta(y, False)
    arco = None
    if tipo == "arco":
        arco = ZC + R_ARCO * math.sin(math.radians(est["ang"]))
    if y <= Y_WS0 + 1e-6:
        return anel_capo(y, z9, arco)
    if y < Y_HG1 - 1e-6:
        return anel_cabine(y, z9, 0.80, arco)
    # borda da tampa: mistura a secao da base da vigia com a da face de tras
    a = anel_cabine(Y_HG1, z9, 0.80)
    b = anel_ponta(Y_CAPR, False)
    u = (y - Y_HG1) / (Y_CAPR - Y_HG1)
    u = u * u * (3 - 2 * u)
    return [(lerp(p[0], q[0], u), lerp(p[1], q[1], u)) for p, q in zip(a, b)]


def grade_carroceria():
    """devolve P[i][k] (Vector) da meia carroceria e a lista de estacoes"""
    est = estacoes()
    n = len(est)
    Y = np.array([[e["y"]] * 24 for e in est], float)
    for i, e in enumerate(est):
        for k, yy in e.get("linhas", {}).items():
            Y[i, k] = yy
    for k in range(24):                       # cada linha precisa andar sempre para tras
        for i in range(n - 2, -1, -1):
            Y[i, k] = min(Y[i, k], Y[i + 1, k] - 0.025)
    P = []
    for i, e in enumerate(est):
        linha = []
        for k in range(24):
            ee = dict(e)
            ee["y"] = Y[i, k]
            x, z = anel(ee)[k]
            y = Y[i, k]
            if e.get("tipo") == "capF":
                y = y_ponta(Y_CAPF, x, True)
            elif e.get("tipo") == "capR":
                y = y_ponta(Y_CAPR, x, False)
            if e.get("tipo") == "arco" and k == 10:
                pass
            linha.append(Vector((x, y, z)))
        P.append(linha)
    return P, est


def grade_ponta(anel_pts, frente):
    """grade 9 colunas x 8 linhas que fecha a ponta: coluna c liga k_c (baixo) a k_(23-c) (cima)"""
    G = []
    zl = [anel_pts[8 + j].z for j in range(8)]
    for j in range(8):
        t = (zl[j] - zl[0]) / (zl[7] - zl[0])
        linha = []
        for c in range(9):
            if j == 0:
                linha.append(anel_pts[c].copy())
                continue
            if j == 7:
                linha.append(anel_pts[23 - c].copy())
                continue
            if c == 8:
                linha.append(anel_pts[8 + j].copy())
                continue
            b, a = anel_pts[c], anel_pts[23 - c]
            x = lerp(b.x, a.x, t)
            z = lerp(b.z, a.z, t)
            y = y_ponta(Y_CAPF if frente else Y_CAPR, x, frente)
            linha.append(Vector((x, y, z)))
        G.append(linha)
    return G


# ---------------------------------------------------------------- utilitarios de malha
def colecao(nome):
    col = bpy.data.collections.get(nome)
    if col is None:
        col = bpy.data.collections.new(nome)
        SC.collection.children.link(col)
    return col


def limpar():
    for nome in COLS:
        col = bpy.data.collections.get(nome)
        if col:
            for o in list(col.objects):
                bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.collections.remove(col)
    for dados in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images):
        for d in list(dados):
            if d.users == 0 and d.name.startswith(("Carro_", "TMP_", "Luz_", "carro_")):
                dados.remove(d)


def objeto(bm, nome, col):
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(nome, me)
    col.objects.link(ob)
    return ob


class Malha:
    """bmesh com vertices indexados por chave; faces recebem uma etiqueta de peca (atributo 'peca')"""

    def __init__(self):
        self.bm = bmesh.new()
        self.vs = {}
        self.lay = self.bm.faces.layers.int.new("peca")

    def v(self, chave, co):
        if chave not in self.vs:
            self.vs[chave] = self.bm.verts.new(co)
        return self.vs[chave]

    def f(self, vs, peca):
        try:
            face = self.bm.faces.new(vs)
        except ValueError:
            return None
        face[self.lay] = peca
        return face


# pecas da carroceria (etiquetas das faces)
PECAS = ["lataria", "porta_E", "capo", "tampa", "vidro_para_brisa", "vidro_porta_E", "vidro_lateral_E",
         "vidro_vigia", "farol_E", "seta_frente_E", "grade", "lanterna_E", "placa_tras", "quebra_vento_E",
         "caixa_roda", "porta_D", "vidro_porta_D", "vidro_lateral_D", "farol_D", "seta_frente_D", "lanterna_D",
         "quebra_vento_D", "nicho", "seta_tras_E", "seta_tras_D", "re_E", "re_D", "forro", "forro_porta",
         "capo_interno", "tampa_interna", "borda",
         "pneu", "roda", "roda_interna", "parachoque", "placa", "espelho", "plastico", "banco", "painel", "volante",
         "tapete", "motor", "bateria", "radiador", "cromo", "escapamento", "palheta", "quadro", "macaneta",
         "lente_seta_lateral", "tampao", "quebra_sol"]
PID = {n: i for i, n in enumerate(PECAS)}


def peca_da_face(i, k, est):
    """peca de cada quad da grade (estacao i..i+1, linha k..k+1) da meia carroceria (lado E, x > 0)"""
    y0, y1 = est[i]["y"], est[i + 1]["y"]
    ym = (y0 + y1) / 2
    arco = est[i].get("tipo") == "arco" and est[i + 1].get("tipo") == "arco"
    if arco and k in (8, 9):
        return "caixa_roda"
    if k >= 17 and y1 <= Y_WS0 + 1e-6:
        return "capo"
    if k >= 21 and Y_WS0 - 1e-6 <= y0 and y1 <= Y_WS1 + 1e-6:
        return "vidro_para_brisa"
    if k >= 21 and Y_RF1 - 0.03 <= y0 and y1 <= Y_HG1 + 1e-6 and ym > Y_RF1:
        return "vidro_vigia"
    if k >= 20 and ym > Y_RF1:
        return "tampa"
    if Y_P0 - 1e-6 <= y0 and y1 <= Y_P1 + 1e-6 and 9 <= k <= 19:
        if 16 <= k <= 18:
            return "quebra_vento_E" if y1 <= Y_W0 + 1e-6 else "vidro_porta_E"
        return "porta_E"
    if Y_B - 1e-6 <= y0 and 16 <= k <= 18 and est[i + 1]["y"] <= 1.30 + 1e-6 and ym < 1.35:
        return "vidro_lateral_E"
    return "lataria"


def carroceria_meia():
    P, est = grade_carroceria()
    m = Malha()
    n = len(est)
    for i in range(n):
        for k in range(24):
            m.v(("g", i, k), P[i][k])
    for i in range(n - 1):
        for k in range(23):
            vs = [m.vs[("g", i, k)], m.vs[("g", i, k + 1)], m.vs[("g", i + 1, k + 1)], m.vs[("g", i + 1, k)]]
            m.f(vs, PID[peca_da_face(i, k, est)])
    # pontas
    for frente, i in ((True, 0), (False, n - 1)):
        G = grade_ponta(P[i], frente)
        for j in range(8):
            for c in range(9):
                if j == 0:
                    m.vs[("p", frente, j, c)] = m.vs[("g", i, c)]
                elif j == 7:
                    m.vs[("p", frente, j, c)] = m.vs[("g", i, 23 - c)]
                elif c == 8:
                    m.vs[("p", frente, j, c)] = m.vs[("g", i, 8 + j)]
                else:
                    m.v(("p", frente, j, c), G[j][c])
        for j in range(7):
            for c in range(8):
                vs = [m.vs[("p", frente, j, c)], m.vs[("p", frente, j, c + 1)],
                      m.vs[("p", frente, j + 1, c + 1)], m.vs[("p", frente, j + 1, c)]]
                if frente:
                    vs.reverse()
                xm = sum(v.co.x for v in vs) / 4
                zm = sum(v.co.z for v in vs) / 4
                peca = "lataria"
                if frente and j in (3, 4):
                    peca = "grade" if c < 3 else ("farol_E" if c < 5 else ("seta_frente_E" if c == 5 else "lataria"))
                if not frente:
                    if j in (3, 4) and 4 <= c < 7:
                        peca = "lanterna_E"
                    elif j >= 3 and c < 3:
                        peca = "tampa"
                    if j == 4 and c == 0:
                        peca = "placa_tras"
                m.f(vs, PID[peca])
    return m.bm, P, est


def espelhar(bm):
    """duplica a meia malha em -X, solda o centro e troca _E por _D nas pecas do outro lado"""
    lay = bm.faces.layers.int["peca"]
    orientar_para_fora(bm)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    dup = bmesh.ops.duplicate(bm, geom=geom)
    novos_v = [e for e in dup["geom"] if isinstance(e, bmesh.types.BMVert)]
    novas_f = [e for e in dup["geom"] if isinstance(e, bmesh.types.BMFace)]
    bmesh.ops.scale(bm, vec=(-1, 1, 1), verts=novos_v)
    bmesh.ops.reverse_faces(bm, faces=novas_f)
    for f in novas_f:
        nome = PECAS[f[lay]]
        if nome.endswith("_E"):
            f[lay] = PID[nome[:-2] + "_D"]
    centro = [v for v in bm.verts if abs(v.co.x) < 1e-5]
    bmesh.ops.remove_doubles(bm, verts=centro, dist=1e-5)
    bm.normal_update()
    return bm


def orientar_para_fora(bm):
    """a ordem dos vertices ja e coerente por construcao; so confere o sentido pela face mais alta"""
    bm.normal_update()
    topo = max(bm.faces, key=lambda f: f.calc_center_median().z)
    if topo.normal.z < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.normal_update()



# ---------------------------------------------------------------- pecas da carroceria
GRUPOS = {
    "Carroceria": ["lataria", "caixa_roda", "grade", "nicho"],
    "Porta_E": ["porta_E", "quebra_vento_E"], "Porta_D": ["porta_D", "quebra_vento_D"],
    "Capo": ["capo"], "Tampa": ["tampa", "placa_tras"],
    "Vidro_Fixo": ["vidro_para_brisa", "vidro_lateral_E", "vidro_lateral_D"],
    "Vidro_Porta_E": ["vidro_porta_E"], "Vidro_Porta_D": ["vidro_porta_D"], "Vidro_Vigia": ["vidro_vigia"],
    "Luz_Farol": ["farol_E", "farol_D"], "Luz_Seta_E": ["seta_frente_E", "seta_tras_E"],
    "Luz_Seta_D": ["seta_frente_D", "seta_tras_D"], "Luz_Lanterna": ["lanterna_E", "lanterna_D"],
    "Luz_Re": ["re_E", "re_D"],
}
PAINEIS_MOVEIS = ("Porta_E", "Porta_D", "Capo", "Tampa")
FOLGA = 0.004                     # vao entre painel movel e carroceria
PROF_NICHO = {"luz": 0.012, "grade": 0.020, "placa": 0.008}
INTERNO = {"lataria": "forro", "caixa_roda": "caixa_roda", "grade": "nicho", "nicho": "nicho", "porta_E": "forro_porta",
           "porta_D": "forro_porta", "quebra_vento_E": "forro_porta", "quebra_vento_D": "forro_porta",
           "capo": "capo_interno", "tampa": "tampa_interna", "placa_tras": "tampa_interna"}


def nichos(bm):
    """afunda faroes, setas, lanternas, grade e placa; as paredes viram 'nicho' e o fundo continua sendo a peca"""
    lay = bm.faces.layers.int["peca"]
    regioes = [(["farol_E", "seta_frente_E"], "luz"), (["farol_D", "seta_frente_D"], "luz"), (["lanterna_E"], "luz"),
               (["lanterna_D"], "luz"), (["grade"], "grade"), (["placa_tras"], "placa")]
    for nomes, tipo in regioes:
        ids = {PID[n] for n in nomes}
        faces = [f for f in bm.faces if f[lay] in ids]
        if not faces:
            continue
        n = sum((f.normal * f.calc_area() for f in faces), Vector()).normalized()
        ret = bmesh.ops.extrude_face_region(bm, geom=faces)
        # o extrude do bmesh deixa as faces originais (o operador do Blender e que as apaga)
        bmesh.ops.delete(bm, geom=faces, context='FACES_ONLY')
        vs = [g for g in ret["geom"] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, vec=-n * PROF_NICHO[tipo], verts=vs)
        vset = set(vs)
        bmesh.ops.delete(bm, geom=[e for e in bm.edges if not e.link_faces], context='EDGES')
        for f in {f for v in vs if v.is_valid for f in v.link_faces}:
            f.normal_update()
            if not (all(v in vset for v in f.verts) and f.normal.dot(n) > 0.5):
                f[lay] = PID["nicho"]
    # lanterna: linha de baixo = re (por dentro) e seta (por fora); linha de cima = lanterna/freio
    for f in bm.faces:
        nome = PECAS[f[lay]]
        if nome.startswith("lanterna_"):
            c = f.calc_center_median()
            if c.z < 0.705:
                lado = nome[-2:]
                f[lay] = PID[("re" if abs(c.x) < 0.635 * larg(Y_CAPR) else "seta_tras") + lado]
    bm.normal_update()


def separar(bm, col):
    lay = bm.faces.layers.int["peca"]
    grupo_de = {PID[n]: g for g, ns in GRUPOS.items() for n in ns}
    arestas = [e for e in bm.edges if len({grupo_de[f[lay]] for f in e.link_faces}) > 1]
    bmesh.ops.split_edges(bm, edges=arestas)
    objs = {}
    for g in GRUPOS:
        b = bm.copy()
        lb = b.faces.layers.int["peca"]
        bmesh.ops.delete(b, geom=[f for f in b.faces if grupo_de[f[lb]] != g], context='FACES')
        bmesh.ops.delete(b, geom=[v for v in b.verts if not v.link_faces], context='VERTS')
        if b.faces:
            objs[g] = objeto(b, "Carro_" + g, col)
        else:
            b.free()
    bm.free()
    return objs


def encolher_bordas(ob, d):
    """afasta a borda do painel para dentro, ao longo da superficie (vao entre painel e carroceria)"""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    mov = {}
    for v in bm.verts:
        bordas = [e for e in v.link_edges if e.is_boundary]
        if len(bordas) != 2:
            continue
        dirs = []
        for e in bordas:
            f = e.link_faces[0]
            t = (e.other_vert(v).co - v.co).normalized()
            dentro = f.normal.cross(t)
            if dentro.dot(f.calc_center_median() - v.co) < 0:
                dentro = -dentro
            dirs.append(dentro)
        dd = (dirs[0] + dirs[1])
        if dd.length > 1e-6:
            dd.normalize()
            cosm = max(dd.dot(dirs[0]), 0.4)
            mov[v] = dd * (d / cosm)
    for v, dv in mov.items():
        v.co += dv
    bm.to_mesh(ob.data)
    bm.free()


def afundar_vidro(ob, d):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    for v in bm.verts:
        v.co -= v.normal * d
    bm.to_mesh(ob.data)
    bm.free()


def espessura(ob, t):
    """casca com espessura (Solidify aplicado): faces de dentro viram forro/painel interno, bordas viram 'borda'"""
    me = ob.data
    while len(me.materials) < 3:
        me.materials.append(None)
    mod = ob.modifiers.new("espessura", 'SOLIDIFY')
    mod.thickness, mod.offset = t, -1.0
    mod.use_rim, mod.use_even_offset, mod.use_quality_normals = True, False, True
    mod.thickness_clamp = 0.5                 # sem pontas nas dobras finas (caixas de roda, quinas das pontas)
    mod.material_offset, mod.material_offset_rim = 1, 2
    dg = bpy.context.evaluated_depsgraph_get()
    novo = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    velho = ob.data
    ob.data = novo
    bpy.data.meshes.remove(velho)
    novo.name = ob.name
    lay = novo.attributes["peca"]
    for p in novo.polygons:
        if p.material_index == 1:
            lay.data[p.index].value = PID[INTERNO.get(PECAS[lay.data[p.index].value], "forro")]
        elif p.material_index == 2:
            lay.data[p.index].value = PID["borda"]
        p.material_index = 0
    novo.materials.clear()


def montar_carroceria(col):
    bm, P, est = carroceria_meia()
    espelhar(bm)
    nichos(bm)
    objs = separar(bm, col)
    for g in PAINEIS_MOVEIS:
        encolher_bordas(objs[g], FOLGA)
    for g, ob in objs.items():
        if g.startswith("Vidro"):
            afundar_vidro(ob, 0.010)
        elif g.startswith("Luz"):
            pass
        else:
            espessura(ob, 0.025 if g == "Carroceria" else 0.03)
    return objs, P, est


# ---------------------------------------------------------------- acessorios
class Construtor:
    """bmesh de pecas soltas; cada face recebe a etiqueta 'peca'"""

    def __init__(self):
        self.bm = bmesh.new()
        self.lay = self.bm.faces.layers.int.new("peca")

    def _marcar(self, faces, peca):
        for f in faces:
            f[self.lay] = PID[peca]

    def caixa(self, centro, tam, peca, chanfro=0.0, M=None, pecas_faces=None):
        """caixa (com chanfro opcional); M = rotacao aplicada em torno do centro; pecas_faces = {'+y': peca, ...}"""
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        vs = r["verts"]
        bmesh.ops.scale(self.bm, vec=tam, verts=vs)
        faces = list({f for v in vs for f in v.link_faces})
        self._marcar(faces, peca)
        self.bm.normal_update()
        if pecas_faces:
            for f in faces:
                for eixo, pc in pecas_faces.items():
                    i, sinal = "xyz".index(eixo[1]), (1 if eixo[0] == "+" else -1)
                    if f.normal[i] * sinal > 0.9:
                        f[self.lay] = PID[pc]
        if chanfro > 0:
            es = list({e for v in vs for e in v.link_edges})
            ret = bmesh.ops.bevel(self.bm, geom=vs + es, offset=chanfro, segments=1, affect='EDGES', profile=0.5)
            self._marcar(ret["faces"], peca)
            vs = list({v for f in faces + ret["faces"] if f.is_valid for v in f.verts})
        if M is not None:
            bmesh.ops.transform(self.bm, matrix=M, verts=vs)
        bmesh.ops.translate(self.bm, vec=Vector(centro), verts=vs)
        return vs

    def cilindro(self, p0, p1, r, peca, lados=8, tampas=(True, True), peca_tampa=None, r1=None):
        p0, p1 = Vector(p0), Vector(p1)
        eixo = (p1 - p0).normalized()
        u = eixo.orthogonal().normalized()
        v = eixo.cross(u)
        r1 = r if r1 is None else r1
        circ = [(u * math.cos(2 * math.pi * i / lados) + v * math.sin(2 * math.pi * i / lados)) for i in range(lados)]
        A0 = [self.bm.verts.new(p0 + d * r) for d in circ]
        A1 = [self.bm.verts.new(p1 + d * r1) for d in circ]
        for i in range(lados):
            j = (i + 1) % lados
            f = self.bm.faces.new([A0[i], A0[j], A1[j], A1[i]])
            f[self.lay] = PID[peca]
        if tampas[0]:
            f = self.bm.faces.new(list(reversed(A0)))
            f[self.lay] = PID[peca_tampa or peca]
        if tampas[1]:
            f = self.bm.faces.new(A1)
            f[self.lay] = PID[peca_tampa or peca]

    def perfil_varrido(self, perfil, caminho, normais, peca, fechar_pontas=True):
        """varre um perfil [(fora, z)] ao longo de um caminho em planta [(x, y)] com normais para fora [(nx, ny)]"""
        aneis = []
        for (x, y), (nx, ny) in zip(caminho, normais):
            aneis.append([self.bm.verts.new((x + nx * o, y + ny * o, z)) for o, z in perfil])
        for a, b in zip(aneis, aneis[1:]):
            for k in range(len(perfil) - 1):
                f = self.bm.faces.new([a[k], a[k + 1], b[k + 1], b[k]])
                f[self.lay] = PID[peca]
        if fechar_pontas:
            f = self.bm.faces.new(aneis[-1])
            f[self.lay] = PID[peca]
        return aneis

    def objeto(self, nome, col, espelhar_x=False, soldar=False, orientar=True):
        bm = self.bm
        if espelhar_x:
            geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
            dup = bmesh.ops.duplicate(bm, geom=geom)
            nv = [e for e in dup["geom"] if isinstance(e, bmesh.types.BMVert)]
            nf = [e for e in dup["geom"] if isinstance(e, bmesh.types.BMFace)]
            bmesh.ops.scale(bm, vec=(-1, 1, 1), verts=nv)
            bmesh.ops.reverse_faces(bm, faces=nf)
            if soldar:
                bmesh.ops.remove_doubles(bm, verts=[v for v in bm.verts if abs(v.co.x) < 1e-4], dist=1e-4)
        if orientar:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        ob = objeto(bm, nome, col)
        self.bm = None
        return ob


def orientar_caminho(caminho):
    """normais horizontais para fora (para longe do centro do carro) de um caminho em planta"""
    ns = []
    for i in range(len(caminho)):
        a = Vector(caminho[max(i - 1, 0)] + (0,))
        b = Vector(caminho[min(i + 1, len(caminho) - 1)] + (0,))
        t = (b - a).normalized()
        n = Vector((t.y, -t.x, 0))
        cx, cy = caminho[i]
        if n.x * cx + n.y * cy * 0.4 < 0:
            n = -n
        ns.append((n.x, n.y))
    return ns


def rodas(col):
    """pneu + roda de aco estampada + tambor escuro; eixo X, lado de fora = +X (espelhada no lado D)"""
    c = Construtor()
    lados = 20
    R, L = R_RODA, L_PNEU / 2
    pneu = [(.192, -L * .80), (.235, -L * 1.0), (.268, -L * .97), (.283, -L * .72), (R, -L * .25), (R, L * .25),
            (.283, L * .72), (.268, L * .97), (.235, L * 1.0), (.192, L * .80)]
    roda = [(.192, L * .80), (.180, L * .70), (.150, L * .55), (.100, L * .58), (.072, L * .78), (.050, L * .82)]

    def anel(r, x):
        return [c.bm.verts.new((x, math.cos(2 * math.pi * i / lados) * r, math.sin(2 * math.pi * i / lados) * r))
                for i in range(lados)]

    def tira(a, b, peca):
        for i in range(lados):
            j = (i + 1) % lados
            f = c.bm.faces.new([a[i], a[j], b[j], b[i]])
            f[c.lay] = PID[peca]
    aneis = [anel(r, x) for r, x in pneu]
    for a, b in zip(aneis, aneis[1:]):
        tira(a, b, "pneu")
    ar = [aneis[-1]] + [anel(r, x) for r, x in roda[1:]]
    for a, b in zip(ar, ar[1:]):
        tira(a, b, "roda")
    f = c.bm.faces.new(list(ar[-1]))
    f[c.lay] = PID["roda"]
    tambor = anel(.13, -L * .1)
    tira(tambor, aneis[0], "roda_interna")
    f = c.bm.faces.new(list(reversed(tambor)))
    f[c.lay] = PID["roda_interna"]
    bmesh.ops.recalc_face_normals(c.bm, faces=c.bm.faces)
    bm = c.bm
    obs = {}
    for nome, (x, y) in {"roda_dianteira_E": (X_RODA, YC_D), "roda_dianteira_D": (-X_RODA, YC_D),
                         "roda_traseira_E": (X_RODA, YC_T), "roda_traseira_D": (-X_RODA, YC_T)}.items():
        b = bm.copy()
        if x < 0:
            bmesh.ops.scale(b, vec=(-1, 1, 1), verts=b.verts)
            bmesh.ops.reverse_faces(b, faces=b.faces)
        bmesh.ops.translate(b, vec=(x, y, ZC), verts=b.verts)
        obs[nome] = objeto(b, "Carro_R" + nome[1:], col)
    bm.free()
    return obs


def parachoques(col):
    c = Construtor()
    # perfil (para fora, z) do encosto na carroceria ate a frente; caminho em planta do centro ate a caixa de roda
    perfil_f = [(-.01, .575), (.040, .578), (.068, .560), (.075, .515), (.078, .400), (.072, .330), (.050, .275),
                (-.01, .270)]
    caminho_f = [(0, -1.765), (.18, -1.764), (.36, -1.760), (.52, -1.752), (.62, -1.738), (.69, -1.715),
                 (.725, -1.675), (.742, -1.62), (.748, -1.565)]
    c.perfil_varrido(perfil_f, caminho_f, orientar_caminho(caminho_f), "parachoque")
    perfil_t = [(-.01, .600), (.035, .602), (.062, .585), (.070, .540), (.072, .420), (.066, .360), (.045, .330),
                (-.01, .325)]
    caminho_t = [(0, 1.795), (.18, 1.794), (.36, 1.790), (.52, 1.782), (.62, 1.770), (.685, 1.748), (.715, 1.71),
                 (.73, 1.65), (.735, 1.57)]
    c.perfil_varrido(perfil_t, caminho_t, orientar_caminho(caminho_t), "parachoque")
    return c.objeto("Carro_Parachoques", col, espelhar_x=True, soldar=True)


def placas(col):
    """placas Mercosul 40 x 13 cm: frente no para-choque, tras no nicho da tampa. Objetos e material proprios: o
    jogo troca a textura pela placa do veiculo"""
    obs = {}
    for nome, y, z, frente in (("Placa_Frente", -1.765 - 0.080, .415, True),
                               ("Placa_Tras", Y_CAPR - PROF_NICHO["placa"] + 0.004, .755, False)):
        c = Construtor()
        c.caixa((0, y, z), (0.40, 0.006, 0.13), "plastico", chanfro=0.002,
                pecas_faces={"-y": "placa"} if frente else {"+y": "placa"})
        obs[nome] = c.objeto("Carro_" + nome, col, orientar=False)
    return obs


def retrovisores(col):
    obs = {}
    for lado, s in (("E", 1), ("D", -1)):
        c = Construtor()
        c.caixa((s * 0.715, -0.625, 0.925), (0.05, 0.10, 0.05), "plastico", chanfro=0.008)
        c.caixa((s * 0.795, -0.600, 0.935), (0.135, 0.065, 0.095), "plastico", chanfro=0.018,
                pecas_faces={"+y": "espelho"})
        obs[lado] = c.objeto("Carro_Retrovisor_" + lado, col, orientar=False)
    return obs


def macanetas(col):
    obs = {}
    for lado, s in (("E", 1), ("D", -1)):
        c = Construtor()
        x = lado_xz(0.32, 0.83) + 0.004
        c.caixa((s * x, 0.32, 0.83), (0.014, 0.17, 0.032), "macaneta", chanfro=0.005)
        obs[lado] = c.objeto("Carro_Macaneta_" + lado, col, orientar=False)
    return obs


def palhetas(col):
    """3 limpadores; cada um e um objeto com 'pivo' (cabeca do osso limpador_E, limpador_D, limpador_traseiro)"""
    obs = {}
    base = [("limpador_E", 0.47, Y_WS0 + 0.035, -1, 0.50), ("limpador_D", -0.08, Y_WS0 + 0.035, -1, 0.46),
            ("limpador_traseiro", 0.0, Y_HG1 - 0.035, 1, 0.36)]
    for nome, x, y, s, comp in base:
        piv = Vector((x, y, zsup(y, x) + 0.012))
        c = Construtor()
        c.cilindro(piv + Vector((0, 0, -0.012)), piv + Vector((0, 0, 0.010)), 0.016, "plastico", lados=8)
        y_off = 0.03 if s < 0 else -0.03
        a0 = piv + Vector((0, 0, 0.004))
        a1 = piv + Vector((s * comp, y_off, 0.0))
        dirb = a1 - a0
        M = Matrix.Rotation(math.atan2(dirb.y, dirb.x), 4, 'Z')
        c.caixa((a0 + a1) / 2, (dirb.length, 0.012, 0.007), "palheta", M=M)
        p0 = a1 + Vector((-s * comp * 0.42, 0, 0.004))
        p1 = a1 + Vector((s * comp * 0.08, 0, 0.004))
        c.caixa((p0 + p1) / 2, ((p1 - p0).length, 0.009, 0.014), "palheta", M=M)
        ob = c.objeto("Carro_L" + nome[1:], col, orientar=False)
        # deita na inclinacao do vidro em torno do pivo
        dz = zsup(y + 0.05, 0.2) - zsup(y - 0.05, 0.2)
        R = Matrix.Translation(piv) @ Matrix.Rotation(math.atan2(dz, 0.10), 4, 'X') @ Matrix.Translation(-piv)
        ob.data.transform(R)
        ob["pivo"] = tuple(piv)
        obs[nome] = ob
    return obs


def escapamento(col):
    c = Construtor()
    c.cilindro((-0.42, 1.35, 0.25), (-0.42, 1.86, 0.25), 0.028, "escapamento", lados=10, tampas=(True, False))
    c.cilindro((-0.42, 1.80, 0.25), (-0.42, 1.8001, 0.25), 0.026, "roda_interna", lados=10, tampas=(False, True))
    return c.objeto("Carro_Escapamento", col, orientar=False)


def cofre_motor(col):
    """o basico que aparece com o capo aberto: motor, filtro de ar, bateria, radiador, parede corta-fogo"""
    c = Construtor()
    c.caixa((0.02, -1.22, 0.47), (0.56, 0.42, 0.30), "motor", chanfro=0.03)
    c.caixa((0.02, -1.22, 0.655), (0.48, 0.30, 0.07), "motor", chanfro=0.02)
    c.cilindro((0.02, -1.25, 0.69), (0.02, -1.25, 0.75), 0.16, "plastico", lados=14)
    c.caixa((0.47, -1.48, 0.55), (0.18, 0.24, 0.20), "bateria", chanfro=0.01)
    c.caixa((-0.47, -1.45, 0.63), (0.16, 0.16, 0.16), "plastico", chanfro=0.02)
    c.caixa((0.0, -1.66, 0.55), (0.98, 0.05, 0.36), "radiador")
    zt = zsup(Y_WS0, 0.0)
    c.caixa((0.0, Y_WS0 + 0.012, (0.29 + zt) / 2), (1.30, 0.025, zt - 0.29), "motor")
    return c.objeto("Carro_Cofre_Motor", col, orientar=False)


def interior(col):
    c = Construtor()
    zp = tab(0.0, ZFUNDO) + 0.025               # piso da cabine (face de cima do forro do assoalho)
    # painel: perfil (y, z) varrido em x de -0,70 a 0,70 (fechado nas pontas)
    perfil = [(Y_WS0 + 0.02, zsup(Y_WS0, 0.2) - 0.015), (-0.60, 0.895), (-0.50, 0.880), (-0.46, 0.850),
              (-0.45, 0.740), (-0.47, 0.640), (-0.56, 0.560), (-0.70, 0.520), (Y_WS0 + 0.03, 0.50)]
    xs = [-0.70, -0.55, -0.20, 0.0, 0.20, 0.55, 0.70]
    fil = [[c.bm.verts.new((x, y, z)) for (y, z) in perfil] for x in xs]
    for a, b in zip(fil, fil[1:]):
        for k in range(len(perfil) - 1):
            f = c.bm.faces.new([a[k], b[k], b[k + 1], a[k + 1]])
            f[c.lay] = PID["painel"]
    for f_ in (c.bm.faces.new(fil[0]), c.bm.faces.new(list(reversed(fil[-1])))):
        f_[c.lay] = PID["painel"]
    # capelinha do quadro de instrumentos (motorista a esquerda = +x) e mostradores
    c.caixa((0.36, -0.55, 0.91), (0.40, 0.14, 0.07), "painel", chanfro=0.015)
    c.caixa((0.36, -0.462, 0.80), (0.34, 0.012, 0.11), "quadro")
    # console central (radio na frente), tunel, alavanca de cambio e freio de mao
    c.caixa((0.0, -0.40, zp + 0.17), (0.24, 0.14, 0.34), "painel", chanfro=0.02, pecas_faces={"+y": "quadro"})
    c.caixa((0.0, -0.08, zp + 0.08), (0.20, 0.55, 0.16), "painel", chanfro=0.02)
    c.cilindro((0.0, -0.20, zp + 0.16), (0.0, -0.24, zp + 0.36), 0.009, "cromo", lados=6)
    c.caixa((0.0, -0.245, zp + 0.37), (0.04, 0.045, 0.045), "plastico", chanfro=0.012)
    c.caixa((0.0, 0.10, zp + 0.20), (0.035, 0.22, 0.03), "plastico", chanfro=0.008,
            M=Matrix.Rotation(math.radians(-18), 4, 'X'))
    # pedais (embreagem, freio, acelerador)
    for x, lw in ((0.27, 0.06), (0.37, 0.06), (0.46, 0.05)):
        c.caixa((x, -0.66, zp + 0.10), (lw, 0.012, 0.07 if x < 0.4 else 0.10), "plastico",
                M=Matrix.Rotation(math.radians(-25), 4, 'X'))
    # bancos dianteiros e banco de tras inteirico
    for x in (0.36, -0.36):
        incl = Matrix.Rotation(math.radians(-14), 4, 'X')
        c.caixa((x, -0.02, zp + 0.17), (0.48, 0.50, 0.13), "banco", chanfro=0.03)
        c.caixa((x, 0.25, zp + 0.52), (0.47, 0.10, 0.58), "banco", chanfro=0.035, M=incl)
        c.caixa((x, 0.31, zp + 0.92), (0.25, 0.08, 0.17), "banco", chanfro=0.03, M=incl)
        for dx in (-0.08, 0.08):
            c.cilindro((x + dx, 0.29, zp + 0.78), (x + dx, 0.30, zp + 0.86), 0.006, "cromo", lados=5)
        c.caixa((x, -0.02, zp + 0.06), (0.36, 0.42, 0.07), "plastico")
    c.caixa((0.0, 0.80, zp + 0.13), (1.22, 0.48, 0.15), "banco", chanfro=0.035)
    c.caixa((0.0, 1.07, zp + 0.42), (1.22, 0.10, 0.50), "banco", chanfro=0.035,
            M=Matrix.Rotation(math.radians(-12), 4, 'X'))
    # tampao do porta-malas
    c.caixa((0.0, 1.40, 0.905), (1.12, 0.48, 0.012), "tampao")
    # quebra-sois e retrovisor interno
    for x in (0.36, -0.36):
        y = Y_WS1 + 0.12
        c.caixa((x, y, zsup(y, x) - 0.045), (0.36, 0.16, 0.016), "quebra_sol", chanfro=0.004,
                M=Matrix.Rotation(math.radians(8), 4, 'X'))
    y = Y_WS1 + 0.02
    c.caixa((0.0, y, zsup(y, 0) - 0.10), (0.22, 0.03, 0.065), "plastico", chanfro=0.008,
            pecas_faces={"+y": "espelho"})
    c.cilindro((0.0, y, zsup(y, 0) - 0.07), (0.0, y - 0.01, zsup(y, 0) - 0.01), 0.008, "plastico", lados=5)
    return c.objeto("Carro_Interior", col, orientar=False)


VOLANTE = dict(centro=Vector((0.36, -0.30, 0.86)), incl=28.0, raio=0.185)


def volante(col):
    """volante montado no plano XY (eixo +Z para o motorista) e girado para o lugar; objeto do osso 'volante'"""
    c = Construtor()
    lados, tubo = 18, 0.017
    R = VOLANTE["raio"]
    aneis = []
    for i in range(lados):
        a = 2 * math.pi * i / lados
        rad = Vector((math.cos(a), math.sin(a), 0))
        aneis.append([c.bm.verts.new(rad * R + (rad * math.cos(2 * math.pi * j / 6) +
                                                Vector((0, 0, math.sin(2 * math.pi * j / 6)))) * tubo)
                      for j in range(6)])
    for i in range(lados):
        a, b = aneis[i], aneis[(i + 1) % lados]
        for j in range(6):
            k = (j + 1) % 6
            f = c.bm.faces.new([a[j], b[j], b[k], a[k]])
            f[c.lay] = PID["volante"]
    c.cilindro((0, 0, -0.035), (0, 0, 0.02), 0.055, "volante", lados=10)
    for ang in (0, 180, 270):
        a = math.radians(ang)
        d = Vector((math.cos(a), math.sin(a), 0))
        c.caixa(d * (R / 2 + 0.02), (R - 0.03, 0.032, 0.012), "volante", M=Matrix.Rotation(a, 4, 'Z'))
    c.cilindro((0, 0, -0.03), (0, 0, -0.30), 0.03, "plastico", lados=8, tampas=(False, True))
    M = Matrix.Translation(VOLANTE["centro"]) @ Matrix.Rotation(math.radians(-90 + VOLANTE["incl"]), 4, 'X')
    bmesh.ops.transform(c.bm, matrix=M, verts=c.bm.verts)
    return c.objeto("Carro_Volante", col, orientar=False)


def setas_laterais(col):
    c = Construtor()
    for s in (1, -1):
        y, z = -1.43, 0.66
        c.caixa((s * (lado_xz(y, z) + 0.002), y, z), (0.008, 0.06, 0.025), "lente_seta_lateral", chanfro=0.003)
    return c.objeto("Carro_Setas_Laterais", col, orientar=False)


def suavizar(obs, angulo=40.0):
    """sombreamento suave com vinco nas quinas (auto smooth do 4.0 -> normais divididas no glTF)"""
    for ob in obs:
        me = ob.data
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        if hasattr(me, "use_auto_smooth"):
            me.use_auto_smooth = True
            me.auto_smooth_angle = math.radians(angulo)
        me.update()


def montar_acessorios(col):
    obs = {}
    obs.update(rodas(col))
    obs["Parachoques"] = parachoques(col)
    obs.update(placas(col))
    obs.update({"Retrovisor_" + k: v for k, v in retrovisores(col).items()})
    obs.update({"Macaneta_" + k: v for k, v in macanetas(col).items()})
    obs.update(palhetas(col))
    obs["Escapamento"] = escapamento(col)
    obs["Cofre_Motor"] = cofre_motor(col)
    obs["Interior"] = interior(col)
    obs["Volante"] = volante(col)
    obs["Setas_Laterais"] = setas_laterais(col)
    return obs


# ---------------------------------------------------------------- UV (atlas unico)
ATLAS_PX = 2048
MARGEM_PX = 6
SEM_ATLAS = ("Carro_Vidro_", "Carro_Placa_")          # vidro sem textura; placas tem textura propria
# densidade relativa de texel por peca (1 = lataria); o que quase nao aparece ganha menos pixels
DENSIDADE = {"forro": 0.55, "caixa_roda": 0.25, "nicho": 0.35, "motor": 0.35, "bateria": 0.35, "radiador": 0.3,
             "escapamento": 0.3, "roda_interna": 0.3, "tampao": 0.4, "banco": 0.75, "painel": 0.8, "quadro": 2.2,
             "volante": 0.7, "pneu": 0.9, "roda": 1.6, "capo_interno": 0.4, "tampa_interna": 0.45,
             "forro_porta": 0.8, "parachoque": 0.8, "grade": 1.6, "farol_E": 2.2, "farol_D": 2.2,
             "lanterna_E": 1.8, "lanterna_D": 1.8, "re_E": 1.8, "re_D": 1.8, "seta_frente_E": 1.8,
             "seta_frente_D": 1.8, "seta_tras_E": 1.8, "seta_tras_D": 1.8, "borda": 0.5, "plastico": 0.6,
             "palheta": 0.3, "cromo": 0.4, "quebra_sol": 0.4, "espelho": 0.6, "macaneta": 0.6}
DENS_FUNDO = 0.18                                       # faces viradas para baixo, rente ao chao


def selecionar_so(obs, ativo=None):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in obs:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = ativo or obs[0]


def smart_uv(ob, angulo=58):
    selecionar_so([ob])
    if not ob.data.uv_layers:
        ob.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angulo), island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')


def ilhas_uv(ob):
    """ilhas = faces ligadas por arestas cujos UVs coincidem dos dois lados"""
    me = ob.data
    uv = me.uv_layers.active.data
    pai = list(range(len(me.polygons)))

    def raiz(i):
        while pai[i] != i:
            pai[i] = pai[pai[i]]
            i = pai[i]
        return i
    aresta = {}
    for p in me.polygons:
        n = p.loop_total
        for j in range(n):
            l0, l1 = p.loop_start + j, p.loop_start + (j + 1) % n
            v0, v1 = me.loops[l0].vertex_index, me.loops[l1].vertex_index
            chave = (min(v0, v1), max(v0, v1))
            u0, u1 = tuple(uv[l0].uv), tuple(uv[l1].uv)
            if v0 > v1:
                u0, u1 = u1, u0
            if chave in aresta:
                q, w0, w1 = aresta[chave]
                if abs(w0[0] - u0[0]) + abs(w0[1] - u0[1]) + abs(w1[0] - u1[0]) + abs(w1[1] - u1[1]) < 1e-5:
                    a, b = raiz(p.index), raiz(q)
                    if a != b:
                        pai[a] = b
            else:
                aresta[chave] = (p.index, u0, u1)
    grupos = {}
    for p in me.polygons:
        grupos.setdefault(raiz(p.index), []).append(p.index)
    return list(grupos.values())


def preparar_ilhas(obs):
    """normaliza cada ilha para metros x densidade; devolve lista de ilhas (ob, faces, loops, uv locais, w, h)"""
    ilhas = []
    for ob in obs:
        me = ob.data
        uv = me.uv_layers.active.data
        lay = me.attributes["peca"].data
        for faces in ilhas_uv(ob):
            a3 = sum(me.polygons[f].area for f in faces)
            loops = [l for f in faces for l in me.polygons[f].loop_indices]
            pts = np.array([uv[l].uv[:] for l in loops], float)
            auv = 0.0
            for f in faces:
                p = me.polygons[f]
                q = np.array([uv[l].uv[:] for l in p.loop_indices])
                x, y = q[:, 0], q[:, 1]
                auv += 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))
            if a3 < 1e-9 or auv < 1e-12:
                continue
            # densidade da ilha: media ponderada pela area das pecas
            dens, peso = 0.0, 0.0
            for f in faces:
                p = me.polygons[f]
                nome = PECAS[lay[f].value]
                d = DENSIDADE.get(nome, 1.0)
                if p.normal.z < -0.7 and p.center.z < 0.45 and nome in ("lataria", "forro", "caixa_roda"):
                    d = DENS_FUNDO
                dens += d * p.area
                peso += p.area
            dens /= peso
            pts = (pts - pts.min(0)) * math.sqrt(a3 / auv) * dens
            w, h = pts.max(0)
            if h > w * 1.15:                       # deita ilhas altas (prateleiras rendem mais): gira 90 graus
                pts = np.stack([pts[:, 1], w - pts[:, 0]], 1)
                w, h = pts.max(0)
            ilhas.append(dict(ob=ob, loops=loops, pts=pts, w=float(w), h=float(h)))
    return ilhas


def _skyline(ilhas, esc, px, m):
    """empacotamento skyline (canto de baixo a esquerda) com rotacao de 90 graus; None se nao couber"""
    linha = [[0, 0, px]]                      # segmentos [x, y, largura] do horizonte
    pos = []
    for il in ilhas:
        melhor = None
        for rot in (False, True):
            w = (il["h"] if rot else il["w"]) * esc + m
            h = (il["w"] if rot else il["h"]) * esc + m
            if w > px:
                continue
            for i in range(len(linha)):
                x = linha[i][0]
                if x + w > px:
                    break
                # altura de apoio sobre os segmentos cobertos
                y, j, resto = 0, i, w
                while resto > 0:
                    y = max(y, linha[j][1])
                    resto -= linha[j][2]
                    j += 1
                if y + h > px:
                    continue
                if melhor is None or (y + h, x) < (melhor[0], melhor[1]):
                    melhor = (y + h, x, y, w, h, rot, i)
        if melhor is None:
            return None
        topo, x, y, w, h, rot, i = melhor
        pos.append((x, y, rot))
        # atualiza o horizonte
        novo = [x, topo, w]
        fim = x + w
        nl = [s_ for s_ in linha[:i]]
        nl.append(novo)
        for s_ in linha[i:]:
            sx, sy, sw = s_
            if sx + sw <= fim:
                continue
            if sx < fim:
                nl.append([fim, sy, sx + sw - fim])
            else:
                nl.append(s_)
        # junta vizinhos da mesma altura
        linha = []
        for s_ in nl:
            if linha and linha[-1][1] == s_[1]:
                linha[-1][2] += s_[2]
            else:
                linha.append(list(s_))
    return pos


def empacotar(ilhas, px=ATLAS_PX, margem_px=MARGEM_PX):
    """procura a maior escala (pixels por metro de lataria) em que todas as ilhas cabem no atlas"""
    ordem = sorted(ilhas, key=lambda i: -max(i["h"], i["w"]) * min(i["h"], i["w"]) ** 0.5)
    lo, hi = 50.0, 2000.0
    pos = None
    for _ in range(18):
        meio = (lo + hi) / 2
        r = _skyline(ordem, meio, px, margem_px)
        if r is None:
            hi = meio
        else:
            lo, pos = meio, r
    if pos is None:
        pos = _skyline(ordem, lo, px, margem_px)
    for il, (x, y, rot) in zip(ordem, pos):
        uv = il["ob"].data.uv_layers.active.data
        p = il["pts"] * lo
        if rot:
            p = np.stack([il["h"] * lo - p[:, 1], p[:, 0]], 1)
        p = (p + np.array([x + margem_px / 2, y + margem_px / 2])) / px
        for l, q in zip(il["loops"], p):
            uv[l].uv = (float(q[0]), float(q[1]))
    return lo


def copiar_roda(base, alvos):
    """as 4 rodas usam as mesmas UVs: a malha da roda base e copiada e levada para o lugar de cada uma"""
    cb = Vector((X_RODA, YC_D, ZC))
    for ob in alvos:
        cent = sum((v.co for v in ob.data.vertices), Vector()) / len(ob.data.vertices)
        me = base.data.copy()
        me.name = ob.name
        espelhada = cent.x < 0
        M = Matrix.Translation(Vector((cent.x, cent.y, ZC)))
        if espelhada:
            M = M @ Matrix.Scale(-1, 4, Vector((1, 0, 0)))
        me.transform(M @ Matrix.Translation(-cb))
        if espelhada:
            me.flip_normals()
        velho = ob.data
        ob.data = me
        bpy.data.meshes.remove(velho)


def uv_atlas(objs):
    obs = [o for o in objs.values() if not o.name.startswith(SEM_ATLAS)]
    rodas_obs = [objs[k] for k in ("roda_dianteira_D", "roda_traseira_E", "roda_traseira_D")]
    base = objs["roda_dianteira_E"]
    for ob in obs:
        if ob in rodas_obs:
            continue
        smart_uv(ob)
    ilhas = preparar_ilhas([o for o in obs if o not in rodas_obs])
    esc = empacotar(ilhas)
    copiar_roda(base, rodas_obs)
    # placas: a face da placa ocupa a textura inteira da placa; o resto num canto escuro
    for nome, z0, frente in (("Placa_Frente", .415, True), ("Placa_Tras", .755, False)):
        me = objs[nome].data
        uvl = me.uv_layers.new(name="UVMap")
        lay = me.attributes["peca"].data
        for p in me.polygons:
            placa = PECAS[lay[p.index].value] == "placa"
            for li in p.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                u = (co.x + 0.2) / 0.4
                uvl.data[li].uv = ((u if frente else 1 - u), (co.z - z0 + 0.065) / 0.13) if placa else (0.0, 0.0)
    print("atlas: %.0f px/m (lataria)" % esc)
    return esc


# ---------------------------------------------------------------- bake de dados (posicao, normal, peca, AO)
def _img_dados(nome, px):
    img = bpy.data.images.get(nome)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(nome, px, px, alpha=True, float_buffer=True, is_data=True)
    img.colorspace_settings.name = 'Non-Color'
    return img


def _mat_bake(img):
    mat = bpy.data.materials.get("TMP_bake") or bpy.data.materials.new("TMP_bake")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emi = nt.nodes.new("ShaderNodeEmission")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    att = nt.nodes.new("ShaderNodeAttribute")
    att.attribute_name, att.attribute_type = "peca", 'GEOMETRY'
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.nodes.active = tex
    nt.links.new(emi.outputs[0], out.inputs[0])
    return mat, nt, emi, geo, att


def bake_dados(objs, px=ATLAS_PX, amostras_ao=48):
    """assa no atlas: posicao (mundo), normal (mundo), id da peca e oclusao ambiente; devolve arrays numpy"""
    alvo = [o for o in objs.values() if not o.name.startswith(SEM_ATLAS)]
    copias = {objs[k] for k in ("roda_dianteira_D", "roda_traseira_E", "roda_traseira_D")}
    alvo = [o for o in alvo if o not in copias]
    vidros = [o for o in objs.values() if o.name.startswith("Carro_Vidro_")]
    sc = bpy.context.scene
    motor_antes = sc.render.engine
    try:
        sc.render.engine = 'CYCLES'
    except TypeError as e:
        print(e)
    sc.cycles.device = 'CPU'
    sc.cycles.use_denoising = False
    sc.render.bake.margin = 4
    sc.render.bake.margin_type = 'EXTEND'
    sc.render.bake.use_clear = True
    # chao para a oclusao de baixo
    chao = bpy.data.objects.new("TMP_chao", bpy.data.meshes.new("TMP_chao"))
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6.0)
    bm.to_mesh(chao.data)
    bm.free()
    sc.collection.objects.link(chao)
    for o in vidros:
        o.hide_render = True
    img = _img_dados("TMP_bake_dados", px)
    mat, nt, emi, geo, att = _mat_bake(img)
    guardados = {o.name: [m for m in o.data.materials] for o in alvo}
    for o in alvo:
        o.data.materials.clear()
        o.data.materials.append(mat)
    selecionar_so(alvo)
    res = {}

    def ler():
        a = np.empty(px * px * 4, np.float32)
        img.pixels.foreach_get(a)
        return a.reshape(px, px, 4).copy()

    def ligar(saida):
        for l in list(nt.links):
            if l.to_node == emi:
                nt.links.remove(l)
        nt.links.new(saida, emi.inputs[0])

    sc.cycles.samples = 1
    # posicao codificada (p + 4) / 8 (emissao em float nao guarda negativo com seguranca)
    vm = nt.nodes.new("ShaderNodeVectorMath")
    vm.operation = 'MULTIPLY_ADD'
    vm.inputs[1].default_value = (0.125, 0.125, 0.125)
    vm.inputs[2].default_value = (0.5, 0.5, 0.5)
    nt.links.new(geo.outputs["Position"], vm.inputs[0])
    ligar(vm.outputs[0])
    bpy.ops.object.bake(type='EMIT')
    a = ler()
    res["pos"] = a[..., :3] * 8.0 - 4.0
    res["cobre"] = a[..., 3] > 0.5
    vn = nt.nodes.new("ShaderNodeVectorMath")
    vn.operation = 'MULTIPLY_ADD'
    vn.inputs[1].default_value = (0.5, 0.5, 0.5)
    vn.inputs[2].default_value = (0.5, 0.5, 0.5)
    nt.links.new(geo.outputs["True Normal"], vn.inputs[0])
    ligar(vn.outputs[0])
    bpy.ops.object.bake(type='EMIT')
    res["nor"] = ler()[..., :3] * 2.0 - 1.0
    mm = nt.nodes.new("ShaderNodeMath")
    mm.operation = 'DIVIDE'
    mm.inputs[1].default_value = 256.0
    nt.links.new(att.outputs["Fac"], mm.inputs[0])
    ligar(mm.outputs[0])
    bpy.ops.object.bake(type='EMIT')
    res["peca"] = np.rint(ler()[..., 0] * 256.0).astype(np.int32)
    # oclusao ambiente (com o chao e sem os vidros)
    sc.cycles.samples = amostras_ao
    if sc.world is None:
        sc.world = bpy.data.worlds.new("TMP_mundo")
    sc.world.light_settings.distance = 0.45
    bpy.ops.object.bake(type='AO')
    res["ao"] = ler()[..., 0]
    # limpeza
    for o in alvo:
        o.data.materials.clear()
        for m in guardados[o.name]:
            o.data.materials.append(m)
    for o in vidros:
        o.hide_render = False
    bpy.data.objects.remove(chao, do_unlink=True)
    bpy.data.materials.remove(mat)
    bpy.data.images.remove(img)
    try:
        sc.render.engine = motor_antes
    except TypeError:
        pass
    return res


# ---------------------------------------------------------------- rig, pele rigida, materiais e export
# osso de cada objeto (pele rigida: 100% num osso)
OSSO_DO_OBJETO = {
    "Porta_E": "porta_E", "Vidro_Porta_E": "porta_E", "Retrovisor_E": "porta_E", "Macaneta_E": "porta_E",
    "Porta_D": "porta_D", "Vidro_Porta_D": "porta_D", "Retrovisor_D": "porta_D", "Macaneta_D": "porta_D",
    "Capo": "capo", "Tampa": "tampa_traseira", "Vidro_Vigia": "tampa_traseira", "Placa_Tras": "tampa_traseira",
    "Volante": "volante", "limpador_E": "limpador_E", "limpador_D": "limpador_D",
    "limpador_traseiro": "limpador_traseiro", "roda_dianteira_E": "roda_dianteira_E",
    "roda_dianteira_D": "roda_dianteira_D", "roda_traseira_E": "roda_traseira_E", "roda_traseira_D": "roda_traseira_D",
}
PINTURA = ("lataria", "porta_E", "porta_D", "capo", "tampa", "borda", "capo_interno", "tampa_interna")
COR_PADRAO = (0.80, 0.79, 0.76, 1.0)          # prata-gelo do modelo de referencia (o jogo pode trocar)
# malhas do GLB: nome -> objetos de origem (as luzes separadas para o jogo acender cada grupo)
SAIDAS = {
    "Carro": None,                              # todo o resto (2 materiais: Carro_Pintura e Carro_Atlas)
    "Carro_Vidros": ("Vidro_Fixo", "Vidro_Porta_E", "Vidro_Porta_D", "Vidro_Vigia"),
    "Carro_Placas": ("Placa_Frente", "Placa_Tras"),
    "Luz_Farol": ("Luz_Farol",), "Luz_Lanterna": ("Luz_Lanterna",), "Luz_Re": ("Luz_Re",),
    "Luz_Seta_E": ("Luz_Seta_E", "Setas_Laterais_E"), "Luz_Seta_D": ("Luz_Seta_D", "Setas_Laterais_D"),
}


def centro_faces(ob, filtro):
    me = ob.data
    pts = [p.center.copy() for p in me.polygons if filtro(p.center)]
    return sum(pts, Vector()) / len(pts) if pts else None


def separar_por_lado(ob, col):
    """Carro_Setas_Laterais vira dois objetos (E e D) para cada seta piscar sozinha"""
    obs = {}
    for lado, s in (("E", 1), ("D", -1)):
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().x * s < 0], context='FACES')
        obs[lado] = objeto(bm, ob.name + "_" + lado, col)
    bpy.data.objects.remove(ob, do_unlink=True)
    return obs


def ossos_do_carro(objs):
    zp = tab(0.0, ZFUNDO) + 0.025
    cima = Vector((0, 0, 1))
    C = VOLANTE["centro"]
    eixo_col = Matrix.Rotation(math.radians(-90 + VOLANTE["incl"]), 3, 'X') @ Vector((0, 0, 1))
    v_plano = Matrix.Rotation(math.radians(-90 + VOLANTE["incl"]), 3, 'X') @ Vector((0, 1, 0))
    R = VOLANTE["raio"]
    ossos = [  # nome, cabeca, cauda, pai, deforma
        ("raiz", Vector((0, 0, 0)), Vector((0, 0, 0.25)), None, True),
        ("chassi", Vector((0, 0, 0.55)), Vector((0, 0, 0.80)), "raiz", True),
        ("porta_E", Vector((0.735, Y_P0 + 0.005, 0.45)), Vector((0.735, Y_P0 + 0.005, 0.75)), "chassi", True),
        ("porta_D", Vector((-0.735, Y_P0 + 0.005, 0.45)), Vector((-0.735, Y_P0 + 0.005, 0.75)), "chassi", True),
        ("capo", Vector((0, Y_WS0 - 0.02, zsup(Y_WS0, 0) - 0.02)), Vector((0, Y_WS0 - 0.02, zsup(Y_WS0, 0) + 0.18)),
         "chassi", True),
        ("tampa_traseira", Vector((0, Y_RF1, zsup(Y_RF1, 0) - 0.01)), Vector((0, Y_RF1, zsup(Y_RF1, 0) + 0.19)),
         "chassi", True),
        ("volante", C.copy(), C + eixo_col * 0.12, "chassi", True),
        ("direcao_E", Vector((X_RODA, YC_D, ZC)), Vector((X_RODA, YC_D, ZC + 0.20)), "raiz", False),
        ("direcao_D", Vector((-X_RODA, YC_D, ZC)), Vector((-X_RODA, YC_D, ZC + 0.20)), "raiz", False),
        ("roda_dianteira_E", Vector((X_RODA, YC_D, ZC)), Vector((X_RODA, YC_D, ZC + 0.15)), "direcao_E", True),
        ("roda_dianteira_D", Vector((-X_RODA, YC_D, ZC)), Vector((-X_RODA, YC_D, ZC + 0.15)), "direcao_D", True),
        ("roda_traseira_E", Vector((X_RODA, YC_T, ZC)), Vector((X_RODA, YC_T, ZC + 0.15)), "raiz", True),
        ("roda_traseira_D", Vector((-X_RODA, YC_T, ZC)), Vector((-X_RODA, YC_T, ZC + 0.15)), "raiz", True),
    ]
    for nome in ("limpador_E", "limpador_D", "limpador_traseiro"):
        ob = objs[nome]
        piv = Vector(ob["pivo"])
        y = piv.y
        dz = zsup(y + 0.05, 0.2) - zsup(y - 0.05, 0.2)
        n = Matrix.Rotation(math.atan2(dz, 0.10), 3, 'X') @ Vector((0, 0, 1))
        ossos.append((nome, piv, piv + n * 0.08, "tampa_traseira" if nome.endswith("traseiro") else "chassi", True))
    # pontos de encaixe (sem deformacao, apontando para cima = rotacao identidade no glTF)
    luz = {k: objs[k] for k in ("Luz_Farol", "Luz_Lanterna", "Luz_Re", "Luz_Seta_E", "Luz_Seta_D")}
    pontos = {
        "ponto_motorista": ("chassi", Vector((0.36, 0.02, zp + 0.245))),
        "ponto_passageiro": ("chassi", Vector((-0.36, 0.02, zp + 0.245))),
        "ponto_tras_E": ("chassi", Vector((0.33, 0.78, zp + 0.215))),
        "ponto_tras_D": ("chassi", Vector((-0.33, 0.78, zp + 0.215))),
        "ponto_olhos": ("chassi", Vector((0.36, 0.10, 1.17))),
        "ponto_mao_E": ("volante", C + Vector((1, 0, 0)) * R * 0.94 + v_plano * R * 0.34),
        "ponto_mao_D": ("volante", C - Vector((1, 0, 0)) * R * 0.94 + v_plano * R * 0.34),
        "ponto_pe_E": ("chassi", Vector((0.27, -0.63, zp + 0.08))),
        "ponto_pe_D": ("chassi", Vector((0.43, -0.63, zp + 0.08))),
        "ponto_porta_E": ("raiz", Vector((1.15, -0.15, 0.0))),
        "ponto_porta_D": ("raiz", Vector((-1.15, -0.15, 0.0))),
        "ponto_farol_E": ("chassi", centro_faces(luz["Luz_Farol"], lambda c: c.x > 0)),
        "ponto_farol_D": ("chassi", centro_faces(luz["Luz_Farol"], lambda c: c.x < 0)),
        "ponto_lanterna_E": ("chassi", centro_faces(luz["Luz_Lanterna"], lambda c: c.x > 0)),
        "ponto_lanterna_D": ("chassi", centro_faces(luz["Luz_Lanterna"], lambda c: c.x < 0)),
        "ponto_re_E": ("chassi", centro_faces(luz["Luz_Re"], lambda c: c.x > 0)),
        "ponto_re_D": ("chassi", centro_faces(luz["Luz_Re"], lambda c: c.x < 0)),
        "ponto_seta_frente_E": ("chassi", centro_faces(luz["Luz_Seta_E"], lambda c: c.y < 0)),
        "ponto_seta_frente_D": ("chassi", centro_faces(luz["Luz_Seta_D"], lambda c: c.y < 0)),
        "ponto_seta_tras_E": ("chassi", centro_faces(luz["Luz_Seta_E"], lambda c: c.y > 0)),
        "ponto_seta_tras_D": ("chassi", centro_faces(luz["Luz_Seta_D"], lambda c: c.y > 0)),
        "ponto_placa_frente": ("chassi", Vector((0, -1.765 - 0.084, 0.415))),
        "ponto_placa_tras": ("tampa_traseira", Vector((0, Y_CAPR - 0.002, 0.755))),
        "ponto_escapamento": ("chassi", Vector((-0.42, 1.86, 0.25))),
        "ponto_luz_interna": ("chassi", Vector((0, 0.30, zsup(0.30, 0) - 0.03))),
        "ponto_porta_malas": ("chassi", Vector((0, 1.42, 0.93))),
    }
    for nome, (pai, pos) in pontos.items():
        ossos.append((nome, pos, pos + cima * 0.06, pai, False))
    return ossos


def criar_rig(col, ossos):
    arm = bpy.data.armatures.new("Carro_Rig")
    arm.display_type = 'STICK'
    rig = bpy.data.objects.new("Carro_Rig", arm)
    col.objects.link(rig)
    rig.show_in_front = True
    selecionar_so([rig])
    bpy.ops.object.mode_set(mode='EDIT')
    for nome, cabeca, cauda, pai, deforma in ossos:
        b = arm.edit_bones.new(nome)
        b.head, b.tail, b.roll = cabeca, cauda, 0.0
        b.use_deform = deforma
        if pai:
            b.parent = arm.edit_bones[pai]
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def pele(ob, osso, rig):
    ob.vertex_groups.clear()
    vg = ob.vertex_groups.new(name=osso)
    vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    mod = ob.modifiers.new("Armature", 'ARMATURE')
    mod.object = rig
    ob.parent = rig


def juntar(obs, nome, col):
    obs = [o for o in obs if o]
    selecionar_so(obs, obs[0])
    if len(obs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = nome
    ob.data.name = nome
    return ob


def _no_principled(mat):
    return next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def material_textura(nome, img, cor=None, rugosidade=0.7, emissao=False, metal=0.0):
    mat = bpy.data.materials.get(nome)
    if mat:
        bpy.data.materials.remove(mat)
    mat = bpy.data.materials.new(nome)
    mat.use_nodes = True
    nt = mat.node_tree
    bs = _no_principled(mat)
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.location = (-600, 200)
    saida = tex.outputs[0]
    if cor is not None:                          # textura x cor (vira baseColorFactor no glTF)
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type, mix.blend_type = 'RGBA', 'MULTIPLY'
        mix.inputs[0].default_value = 1.0
        mix.location = (-300, 200)
        nt.links.new(tex.outputs[0], mix.inputs[6])
        mix.inputs[7].default_value = cor
        saida = mix.outputs[2]
    nt.links.new(saida, bs.inputs["Base Color"])
    bs.inputs["Roughness"].default_value = rugosidade
    bs.inputs["Metallic"].default_value = metal
    mat.use_backface_culling = True             # casca de fora e forro de dentro sao faces de um lado so
    if emissao:
        nt.links.new(tex.outputs[0], bs.inputs["Emission Color"])
        bs.inputs["Emission Strength"].default_value = 1.0
    return mat


def material_vidro():
    mat = bpy.data.materials.get("Carro_Vidro")
    if mat:
        bpy.data.materials.remove(mat)
    mat = bpy.data.materials.new("Carro_Vidro")
    mat.use_nodes = True
    bs = _no_principled(mat)
    bs.inputs["Base Color"].default_value = (0.045, 0.065, 0.075, 1.0)
    bs.inputs["Alpha"].default_value = 0.38
    bs.inputs["Roughness"].default_value = 0.05
    mat.blend_method = 'BLEND'
    mat.use_backface_culling = False
    return mat


def materiais(saidas, atlas, img_placa):
    m_pint = material_textura("Carro_Pintura", atlas, COR_PADRAO, 0.38)
    m_atlas = material_textura("Carro_Atlas", atlas, None, 0.75)
    m_placa = material_textura("Carro_Placa", img_placa, None, 0.45)
    m_vidro = material_vidro()
    for nome, ob in saidas.items():
        me = ob.data
        me.materials.clear()
        if nome == "Carro":
            me.materials.append(m_pint)
            me.materials.append(m_atlas)
            lay = me.attributes["peca"].data
            ids = {PID[n] for n in PINTURA}
            idx = [0 if lay[p.index].value in ids else 1 for p in me.polygons]
            me.polygons.foreach_set("material_index", idx)
        elif nome == "Carro_Vidros":
            me.materials.append(m_vidro)
        elif nome == "Carro_Placas":
            me.materials.append(m_placa)
        else:                                    # luzes: um material por grupo (o jogo acende cada um)
            me.materials.append(material_textura(nome, atlas, None, 0.25, emissao=True))


def colisao(fontes, col):
    """casco convexo da lataria (portas, capo, tampa, para-choques; sem espelhos), reduzido para fisica"""
    bm = bmesh.new()
    for ob in fontes:
        for v in ob.data.vertices:
            bm.verts.new(ob.matrix_world @ v.co)
    bmesh.ops.convex_hull(bm, input=bm.verts[:])
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    ob = objeto(bm, "Carro_Colisao", col)
    mod = ob.modifiers.new("reduz", 'DECIMATE')
    mod.ratio = 0.3
    dg = bpy.context.evaluated_depsgraph_get()
    novo = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    velho = ob.data
    ob.data = novo
    bpy.data.meshes.remove(velho)
    novo.name = "Carro_Colisao"
    novo.materials.clear()
    return ob


def exportar(objs, caminho):
    selecionar_so(objs)
    bpy.ops.export_scene.gltf(filepath=caminho, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=False, export_animations=False, export_skins=True, export_def_bones=False,
                              export_image_format='JPEG', export_jpeg_quality=90, export_image_quality=90,
                              export_normals=True, export_texcoords=True, export_tangents=False, export_extras=False,
                              export_materials='EXPORT', export_rest_position_armature=True)
    for o in objs:
        o.select_set(False)
    print("exportado", caminho, os.path.getsize(caminho) // 1024, "KB")


def montar_rig_e_saidas(objs, col, atlas, img_placa):
    lat = separar_por_lado(objs.pop("Setas_Laterais"), col)
    objs["Setas_Laterais_E"], objs["Setas_Laterais_D"] = lat["E"], lat["D"]
    rig = criar_rig(col, ossos_do_carro(objs))
    for chave, ob in objs.items():
        pele(ob, OSSO_DO_OBJETO.get(chave, "chassi"), rig)
    usados = set()
    saidas = {}
    for nome, fontes in SAIDAS.items():
        if fontes is None:
            continue
        saidas[nome] = juntar([objs[f] for f in fontes], nome, col)
        usados |= set(fontes)
    saidas["Carro"] = juntar([ob for k, ob in objs.items() if k not in usados], "Carro", col)
    materiais(saidas, atlas, img_placa)
    for ob in saidas.values():
        for mod in ob.modifiers:
            if mod.type == 'ARMATURE':
                mod.object = rig
        if ob.parent != rig:
            ob.parent = rig
    return rig, saidas


def salvar_png(rgb, caminho, nome):
    h, w = rgb.shape[:2]
    img = bpy.data.images.get(nome)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(nome, w, h, alpha=False)
    rgba = np.ones((h, w, 4), np.float32)
    rgba[..., :3] = np.clip(rgb, 0, 1)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = caminho
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def carregar_img(caminho, nome):
    img = bpy.data.images.get(nome)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.load(caminho)
    img.name = nome
    return img


if not globals().get("SO_FUNCOES"):
    import importlib
    if SCRIPTS not in sys.path:
        sys.path.insert(0, SCRIPTS)
    import carro_textura
    importlib.reload(carro_textura)
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    limpar()
    os.makedirs(SAIDA, exist_ok=True)
    COL = colecao("Carro_Hatch")
    OBJS, P, EST = montar_carroceria(COL)
    OBJS.update(montar_acessorios(COL))
    suavizar(OBJS.values())
    uv_atlas(OBJS)
    for g, ob in OBJS.items():
        print("  %-18s %5d faces" % (g, len(ob.data.polygons)))
    ATLAS_PNG = os.path.join(SAIDA, "carro_atlas.png")
    PLACA_PNG = os.path.join(SAIDA, "carro_placa.png")
    if "--exportar" in ARGS or globals().get("ASSAR") or not os.path.exists(ATLAS_PNG):
        R = bake_dados(OBJS, ATLAS_PX, 64 if "--exportar" in ARGS else globals().get("AMOSTRAS_AO", 64))
        if globals().get("GUARDAR_BAKE"):
            np.savez_compressed(GUARDAR_BAKE, **R)
        salvar_png(carro_textura.pintar_atlas(R, PECAS), ATLAS_PNG, "carro_atlas_tmp")
        salvar_png(carro_textura.placa()[::-1], PLACA_PNG, "carro_placa_tmp")
    ATLAS = carregar_img(ATLAS_PNG, "carro_atlas")
    PLACA = carregar_img(PLACA_PNG, "carro_placa")
    COL_COLI = colecao("Carro_Colisao")
    COLI = colisao([OBJS[k] for k in ("Carroceria", "Porta_E", "Porta_D", "Capo", "Tampa", "Parachoques")], COL_COLI)
    RIG, SAIDAS_OBS = montar_rig_e_saidas(OBJS, COL, ATLAS, PLACA)
    tri = sum(len(p.vertices) - 2 for ob in SAIDAS_OBS.values() for p in ob.data.polygons)
    print("triangulos:", tri, "| colisao:", sum(len(p.vertices) - 2 for p in COLI.data.polygons))
    if "--exportar" in ARGS or globals().get("EXPORTAR"):
        exportar([RIG] + list(SAIDAS_OBS.values()), os.path.join(SAIDA, "carro_hatch.glb"))
        exportar([COLI], os.path.join(SAIDA, "carro_hatch_colisao.glb"))
        os.makedirs(os.path.dirname(BLEND_COPIA), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=BLEND_COPIA, copy=True)
        print("copia", BLEND_COPIA)
