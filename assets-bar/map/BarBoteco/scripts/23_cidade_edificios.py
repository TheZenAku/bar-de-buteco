# Cidade - etapa 2: lotes e construcoes (LOD0 + LOD1 + silhueta LOD2), pontos de interesse e colisores por volume.
# Malhas fundidas por setor e por material compartilhado; objetos repetidos (caixa d'agua, antena, ar-condicionado,
# carreta, bomba de combustivel...) entram como instancias de malha vinculada. Re-executavel (cid_etapa == "edificios").
import bpy, math, random, json, os, sys
from mathutils import Vector, Matrix
SP = r"C:\Users\rafael\BarBoteco\scripts"
if SP not in sys.path:
    sys.path.insert(0, SP)
import importlib
import barlib as B
import cidadelib as C
importlib.reload(C)

ETAPA = "edificios"
ZC = C.ZC
C.materiais()
print("removidos:", C.limpar_etapa(ETAPA))
G, Q = C.plano()
MM = C.Malhas(ETAPA)
DEST = {"Edificios": "VISUAL", "Lotes": "VISUAL", "Edificios_LOD1": "LOD", "Silhueta_LOD2": "LOD"}
AT, CA = "Atlas_Bairro", "Cid_Atlas"
RG = {'J': [(0, 0, 128, 128), (128, 0, 256, 128), (256, 0, 384, 128), (384, 0, 512, 128)],
      'porta': (512, 0, 640, 256), 'porta_ferro': (640, 0, 768, 256), 'garagem': (768, 0, 1024, 256),
      'padaria': (0, 256, 512, 384), 'farmacia': (512, 256, 1024, 384), 'mercadinho': (0, 384, 512, 512),
      'acougue': (512, 384, 1024, 512), 'oficina': (0, 512, 512, 640), 'lavarapido': (512, 512, 1024, 640),
      'bardoze': (0, 768, 512, 896)}
RC = {'prefeitura': (0, 0, 1024, 128), 'terminal': (0, 128, 512, 256), 'ubs': (512, 128, 1024, 256),
      'emef': (0, 256, 512, 384), 'supermercado': (512, 256, 1024, 384), 'transportes': (0, 384, 512, 512),
      'metalurgica': (512, 384, 1024, 512), 'salao': (0, 512, 256, 640), 'lanches': (256, 512, 512, 640),
      'borracharia': (512, 512, 768, 640), 'papelaria': (768, 512, 1024, 640), 'matconst': (0, 640, 256, 768),
      'autopecas': (256, 640, 512, 768), 'sorveteria': (512, 640, 768, 768), 'mercearia': (768, 640, 1024, 768),
      'basculante': (0, 768, 128, 896), 'vitrine': (128, 768, 384, 896), 'enrolar': (384, 768, 512, 896),
      'doca': (512, 768, 640, 896), 'veneziana': (640, 768, 768, 896), 'pichacao': (768, 768, 896, 896),
      'distrito': (768, 896, 1024, 1024)}
LOJAS = [(CA, 'salao'), (CA, 'lanches'), (CA, 'borracharia'), (CA, 'papelaria'), (CA, 'mercearia'), (CA, 'sorveteria'),
         (AT, 'padaria'), (AT, 'farmacia'), (AT, 'mercadinho'), (AT, 'acougue'), (AT, 'bardoze'), (AT, 'oficina')]
LOJAS_AV = [(CA, 'matconst'), (CA, 'autopecas'), (CA, 'borracharia'), (AT, 'lavarapido'), (AT, 'oficina'), (CA, 'lanches'),
            (AT, 'farmacia'), (AT, 'mercadinho')]
GALPOES = ["Cid_Galpao", "Cid_Galpao_Azul", "Cid_Galpao_Verde", "Cid_Galpao_Creme"]
REGISTRO = {"lotes": [], "portoes": [], "pois": {}, "arvores_poi": [], "bancos": [], "postes_poi": [], "pontos_onibus": [],
            "marcadores": [], "luzes": []}
stats = {}


def conta(k):
    stats[k] = stats.get(k, 0) + 1


def uv(at_reg):
    u0, v0, u1, v1 = B.arect(*at_reg)
    return [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]


# ============================================================== lote (referencial local: x ao longo da frente, y para dentro)
class Lote:
    def __init__(self, A, u, w, d, q, via='local', esq=(False, False)):
        self.A, self.u, self.n = A.copy(), u.normalized(), C.perp(u.normalized())
        self.w, self.d, self.q, self.via, self.esq = w, d, q, via, esq
        self.zona = q.zona
        self.base = 0.0                         # desnivel do lote (m acima da calcada)
        self.M = Matrix(((self.u.x, self.n.x, 0, A.x), (self.u.y, self.n.y, 0, A.y), (0, 0, 1, ZC), (0, 0, 0, 1)))
        c = self.P(w / 2, d / 2)
        self.setor = C.setor_de(c.x, c.y)
        self.rot = math.degrees(math.atan2(self.u.y, self.u.x))

    def P(self, x, y):
        return self.A + self.u * x + self.n * y

    def W(self, x, y, z):
        p = self.P(x, y)
        return (p.x, p.y, ZC + z)

    def m(self, tipo="Edificios"):
        return MM.get(tipo, self.setor)


def caixa(L, x0, y0, z0, x1, y1, z1, mat, mats=None, skip=(), uvr=None, tipo="Edificios"):
    L.m(tipo).box((x0, y0, z0), (x1, y1, z1), mat, mats=mats, skip=skip, M=L.M, uvrects=uvr)


def decal(L, lado, plano, c, w, z0, z1, mat, reg=None, off=0.02, tipo="Edificios"):
    """lado: F (frente, normal -y), T (fundos, +y), E (esquerda, -x), D (direita, +x)."""
    if lado == 'F':
        y = plano - off
        pts = [(c - w / 2, y, z0), (c + w / 2, y, z0), (c + w / 2, y, z1), (c - w / 2, y, z1)]
    elif lado == 'T':
        y = plano + off
        pts = [(c + w / 2, y, z0), (c - w / 2, y, z0), (c - w / 2, y, z1), (c + w / 2, y, z1)]
    elif lado == 'E':
        x = plano - off
        pts = [(x, c + w / 2, z0), (x, c - w / 2, z0), (x, c - w / 2, z1), (x, c + w / 2, z1)]
    else:
        x = plano + off
        pts = [(x, c - w / 2, z0), (x, c + w / 2, z0), (x, c + w / 2, z1), (x, c - w / 2, z1)]
    L.m(tipo).face([L.W(*p) for p in pts], mat, uvs=uv(reg) if reg else None)


def plano_local(L, pts, z, mat, tipo="Edificios"):
    L.m(tipo).face([L.W(x, y, z) for (x, y) in pts], mat, facing=(0, 0, 1))


def telhado(L, x0, y0, x1, y1, z, h, mat="Telha", o=0.45, tipo="Edificios", forro=True):
    X0, X1, Y0, Y1 = x0 - o, x1 + o, y0 - o, y1 + o
    zt = z + h
    m = L.m(tipo)
    eu = (L.u.x, L.u.y, 0.0)
    ev = (L.n.x, L.n.y, 0.0)
    W = L.W
    if (X1 - X0) >= (Y1 - Y0):
        d = (Y1 - Y0) / 2; ym = (Y0 + Y1) / 2
        m.roof_face([W(X0, Y0, z), W(X1, Y0, z), W(X1 - d, ym, zt), W(X0 + d, ym, zt)], mat, eu)
        m.roof_face([W(X1, Y1, z), W(X0, Y1, z), W(X0 + d, ym, zt), W(X1 - d, ym, zt)], mat, eu)
        m.roof_face([W(X0, Y1, z), W(X0, Y0, z), W(X0 + d, ym, zt)], mat, ev)
        m.roof_face([W(X1, Y0, z), W(X1, Y1, z), W(X1 - d, ym, zt)], mat, ev)
    else:
        d = (X1 - X0) / 2; xm = (X0 + X1) / 2
        m.roof_face([W(X0, Y1, z), W(X0, Y0, z), W(xm, Y0 + d, zt), W(xm, Y1 - d, zt)], mat, ev)
        m.roof_face([W(X1, Y0, z), W(X1, Y1, z), W(xm, Y1 - d, zt), W(xm, Y0 + d, zt)], mat, ev)
        m.roof_face([W(X0, Y0, z), W(X1, Y0, z), W(xm, Y0 + d, zt)], mat, eu)
        m.roof_face([W(X1, Y1, z), W(X0, Y1, z), W(xm, Y1 - d, zt)], mat, eu)
    if forro:
        m.face([W(X0, Y0, z - 0.02), W(X0, Y1, z - 0.02), W(X1, Y1, z - 0.02), W(X1, Y0, z - 0.02)], "Madeira_Escura",
               facing=(0, 0, -1))


def telhado_2aguas(L, x0, y0, x1, y1, z, h, mat, cor, o=0.4, tipo="Edificios"):
    """Cumeeira ao longo de x (oitoes nas laterais)."""
    m = L.m(tipo)
    W = L.W
    ym = (y0 + y1) / 2
    eu = (L.u.x, L.u.y, 0.0)
    m.roof_face([W(x0 - o, y0 - o, z), W(x1 + o, y0 - o, z), W(x1 + o, ym, z + h), W(x0 - o, ym, z + h)], mat, eu)
    m.roof_face([W(x1 + o, y1 + o, z), W(x0 - o, y1 + o, z), W(x0 - o, ym, z + h), W(x1 + o, ym, z + h)], mat, eu)
    for x, s in ((x0, -1), (x1, 1)):
        m.face([W(x, y0, z), W(x, y1, z), W(x, ym, z + h)], cor, facing=(L.u.x * s, L.u.y * s, 0))


def telhado_1agua(L, x0, y0, x1, y1, z_alto, z_baixo, mat, o=0.3, tipo="Edificios"):
    """Cai para +y (fundos)."""
    W = L.W
    L.m(tipo).roof_face([W(x0 - o, y0 - o, z_alto), W(x1 + o, y0 - o, z_alto), W(x1 + o, y1 + o, z_baixo),
                         W(x0 - o, y1 + o, z_baixo)], mat, (L.u.x, L.u.y, 0.0))


def lods(L, x0, y0, x1, y1, h, cor, topo="Telha", hr=0.0):
    """LOD1: volume + cobertura simples; LOD2: caixa unica (silhueta)."""
    caixa(L, x0, y0, L.base, x1, y1, L.base + h, cor, mats={'pz': topo if hr <= 0 else cor}, skip=('nz',), tipo="Edificios_LOD1")
    if hr > 0:
        W = L.W
        m = L.m("Edificios_LOD1")
        ym = (y0 + y1) / 2
        z = L.base + h
        eu = (L.u.x, L.u.y, 0.0)
        m.roof_face([W(x0, y0, z), W(x1, y0, z), W(x1, ym, z + hr), W(x0, ym, z + hr)], topo, eu)
        m.roof_face([W(x1, y1, z), W(x0, y1, z), W(x0, ym, z + hr), W(x1, ym, z + hr)], topo, eu)
    caixa(L, x0, y0, L.base, x1, y1, L.base + h + hr * 0.5, cor, mats={'pz': topo}, skip=('nz',), tipo="Silhueta_LOD2")


def colisor(L, nome, x0, y0, z0, x1, y1, z1):
    C.colisor(nome, (x0, y0, z0), (x1, y1, z1), ETAPA, M=L.M, setor=L.setor)


def inst(L, proto, nome, x, y, z, rot=0.0, scale=None):
    p = L.P(x, y)
    return C.inst(proto, nome, "PROPS", (p.x, p.y, ZC + z), L.rot + rot, ETAPA, scale=scale, setor=L.setor)


def janelas(L, lado, plano, a0, a1, z0, andares, rr, livres=(), reg_list=None, larg=None, alt=1.15, pe=2.8):
    larg_tot = a1 - a0
    if larg_tot < 1.2:
        return
    n = max(1, int(larg_tot / 2.6))
    reg = rr.choice(reg_list or RG['J'])
    mat = CA if reg_list and reg in [RC['veneziana'], RC['basculante']] else AT
    for k in range(n):
        c = a0 + larg_tot * (k + 0.5) / n
        for f in range(andares):
            za = z0 + 1.0 + f * pe
            if f == 0 and any(abs(c - x) < 1.4 for x in livres):
                continue
            wj = larg or (1.2 if rr.random() < 0.7 else 1.5)
            decal(L, lado, plano, c, wj, za, za + alt, mat, reg)


def portao(L, x0, x1, hm, y=0.0):
    caixa(L, x0, y + 0.05, 0.02, x1, y + 0.10, hm - 0.05, "Portao_Verde",
          mats={'ny': AT, 'py': AT}, uvr={'ny': B.arect(*RG['garagem']), 'py': B.arect(*RG['garagem'])})
    p = L.P((x0 + x1) / 2, -0.9)
    REGISTRO["portoes"].append([round(p.x, 2), round(p.y, 2), round(x1 - x0, 2)])


def muro_frente(L, hm, cor, aberturas, y=0.0, colide=True):
    """Muro no alinhamento com portoes (aberturas: lista (x0,x1))."""
    s = 0.0
    for (a, b_) in sorted(aberturas) + [(L.w, L.w)]:
        if a - s > 0.05:
            caixa(L, s, y, 0.0, a, y + 0.15, L.base + hm, cor, mats={'pz': "Concreto"}, skip=('nz',))
        if b_ > a:
            portao(L, a, b_, L.base + hm, y)
        s = b_
    if colide:
        colisor(L, "Cid_Muro", 0, y, 0, L.w, y + 0.15, L.base + hm)
    caixa(L, 0, y, 0, L.w, y + 0.15, L.base + hm, cor, skip=('nz', 'ny', 'py', 'nx', 'px'), tipo="Edificios_LOD1")


def plataforma(L, dz, x0=0.0, x1=None, y0=0.15, y1=None, mat_topo="Grama"):
    """Lote em aclive: plato com muro de arrimo na frente."""
    x1 = L.w if x1 is None else x1
    y1 = L.d if y1 is None else y1
    caixa(L, x0, y0, 0.0, x1, y1, dz, "Concreto", mats={'pz': mat_topo}, skip=('nz',))
    colisor(L, "Cid_Plato", x0, y0, 0.0, x1, y1, dz)


# ============================================================== tipologias
def casa_popular(L, rr):
    w, d = L.w, L.d
    cor = rr.choice(C.CORES_CASA)
    recuo = 0.0 if rr.random() < 0.3 else rr.uniform(1.5, 4.0)
    gl = rr.choice((0.0, 0.0, rr.uniform(0.8, 1.2)))
    gr = 0.0 if gl > 0 else rr.choice((0.0, rr.uniform(0.8, 1.2)))
    prof = min(rr.uniform(7.0, 11.0), d - recuo - 2.0)
    if prof < 5.0:
        return casa_mini(L, rr)
    andares = 2 if rr.random() < 0.2 else 1
    h = 2.9 if andares == 1 else 5.6
    hx0, hx1, hy0, hy1 = gl, w - gr, recuo, recuo + prof
    cob = rr.random()
    plana = cob < 0.35
    caixa(L, hx0, hy0, 0.0, hx1, hy1, h, cor, skip=('nz',) if plana else ('nz', 'pz'))
    colisor(L, "Cid_Casa", hx0, hy0, 0.0, hx1, hy1, h)
    hr = 0.0
    if plana:
        caixa(L, hx0 - 0.05, hy0 - 0.05, h, hx1 + 0.05, hy1 + 0.05, h + 0.45, cor, mats={'pz': "Concreto"}, skip=('nz',))
        inst(L, "P_Caixa_Agua_Casa", "Caixa_Agua", hx0 + 1.3, (hy0 + hy1) / 2, h + 0.45, rr.uniform(0, 90))
        if andares == 1 and rr.random() < 0.25:                         # comodo em cima da laje, tijolo aparente
            caixa(L, hx1 - min(4.0, hx1 - hx0), hy0 + 2.0, h + 0.45, hx1, min(hy1, hy0 + 6.0), h + 3.0, "Tijolo", skip=('nz',))
            telhado_1agua(L, hx1 - min(4.0, hx1 - hx0), hy0 + 2.0, hx1, min(hy1, hy0 + 6.0), h + 3.15, h + 2.85, "Cid_Fibrocimento")
            conta("puxadinho_laje")
    elif cob < 0.75:
        hr = rr.uniform(1.0, 1.5)
        telhado(L, hx0, hy0, hx1, hy1, h, hr, rr.choice(("Telha", "Telha", "Cid_Telha_Velha")))
    else:
        hr = rr.uniform(1.0, 1.4)
        telhado_2aguas(L, hx0, hy0, hx1, hy1, h, hr, rr.choice(("Telha", "Cid_Fibrocimento", "Cid_Telha_Velha")), cor)
    if rr.random() < 0.3:
        inst(L, "P_Antena", "Antena", (hx0 + hx1) / 2, (hy0 + hy1) / 2, h + (0.45 if plana else hr * 0.8), rr.uniform(0, 360))
    lods(L, hx0, hy0, hx1, hy1, h, cor, "Concreto" if plana else "Telha", 0 if plana else hr)
    # fachada
    garagem = (hx1 - hx0) >= 7.5 and rr.random() < 0.6
    gc = hx1 - 1.9 if garagem else None
    pc = hx0 + 1.2
    livres = [x for x in (pc, gc) if x is not None]
    janelas(L, 'F', hy0, hx0 + 0.4, hx1 - 0.4, 0.0, andares, rr, livres=livres)
    decal(L, 'F', hy0, pc, 0.95, 0.0, 2.15, AT, RG['porta'] if rr.random() < 0.6 else RG['porta_ferro'])
    if garagem and recuo < 0.5:
        decal(L, 'F', hy0, gc, 2.8, 0.0, 2.3, AT, RG['garagem'])
    if L.esq[0]:
        janelas(L, 'E', hx0, hy0 + 0.6, hy1 - 0.6, 0.0, andares, rr)
    if L.esq[1]:
        janelas(L, 'D', hx1, hy0 + 0.6, hy1 - 0.6, 0.0, andares, rr)
    if rr.random() < 0.3:
        inst(L, "P_AC", "Ar_Condicionado", (hx0 + hx1) / 2 + rr.uniform(-1, 1), hy0, 2.3 + (2.7 if andares == 2 else 0), 0.0)
    # puxadinho / edicula nos fundos
    if rr.random() < 0.5 and hy1 + 3.5 < d - 0.5:
        py1 = min(d - 0.6, hy1 + rr.uniform(3.0, 5.0))
        px0, px1 = hx0, hx0 + (hx1 - hx0) * rr.uniform(0.6, 1.0)
        cpx = "Tijolo" if rr.random() < 0.3 else cor
        caixa(L, px0, hy1, 0.0, px1, py1, 2.6, cpx, skip=('nz', 'pz'))
        telhado_1agua(L, px0, hy1, px1, py1, 2.75, 2.45, "Cid_Fibrocimento")
        colisor(L, "Cid_Casa", px0, hy1, 0.0, px1, py1, 2.6)
        conta("puxadinho")
    elif rr.random() < 0.3 and d - hy1 > 6.0:
        ex0, ex1 = hx1 - min(4.5, hx1 - hx0), hx1
        caixa(L, ex0, d - 4.2, 0.0, ex1, d - 0.6, 2.5, cor, skip=('nz', 'pz'))
        telhado_1agua(L, ex0, d - 4.2, ex1, d - 0.6, 2.65, 2.35, "Cid_Fibrocimento")
        colisor(L, "Cid_Casa", ex0, d - 4.2, 0.0, ex1, d - 0.6, 2.5)
        conta("edicula")
    # muro e portoes
    if recuo >= 0.5:
        hm = rr.uniform(1.6, 2.2)
        cm = rr.choice(C.CORES_CASA + ["Cid_Reboco_Sujo", "Cid_Reboco_Sujo", "Tijolo"])
        ab = [(pc - 0.55, pc + 0.55)]
        if garagem:
            ab.append((gc - 1.5, gc + 1.5))
        muro_frente(L, hm, cm, ab)
        caixa(L, 0, 0.15, 0.0, 0.12, hy0, hm, cm, skip=('nz',))       # divisa lateral ate a casa
        if rr.random() < 0.08:
            decal(L, 'F', 0.0, w * 0.3, 1.6, 0.4, 1.5, CA, RC['pichacao'], off=0.03)
        if garagem:
            plano_local(L, [(gc - 1.4, 0.15), (gc + 1.4, 0.15), (gc + 1.4, hy0), (gc - 1.4, hy0)], 0.01, "Concreto")
    conta("casa_popular")


def casa_mini(L, rr):
    """Lote raso: casinha de frente de rua."""
    cor = rr.choice(C.CORES_CASA)
    h = 2.8
    y1 = max(3.0, L.d - 0.8)
    caixa(L, 0.0, 0.0, 0.0, L.w, y1, h, cor, mats={'pz': "Concreto"}, skip=('nz',))
    caixa(L, -0.03, -0.03, h, L.w + 0.03, y1 + 0.03, h + 0.4, cor, mats={'pz': "Concreto"}, skip=('nz',))
    colisor(L, "Cid_Casa", 0.0, 0.0, 0.0, L.w, y1, h + 0.4)
    decal(L, 'F', 0.0, 1.2, 0.95, 0.0, 2.15, AT, RG['porta'])
    janelas(L, 'F', 0.0, 2.2, L.w - 0.3, 0.0, 1, rr)
    lods(L, 0.0, 0.0, L.w, y1, h + 0.4, cor, "Concreto")
    conta("casa_mini")


def loja_esquina(L, rr, andares=None, recuo=0.0, placas=LOJAS):
    w, d = L.w, L.d
    andares = andares or (2 if rr.random() < 0.45 else 1)
    prof = min(rr.uniform(10.0, 16.0), d - recuo - 0.5)
    if prof < 5:
        return casa_mini(L, rr)
    h = 3.8 if andares == 1 else 6.6
    cor = rr.choice(["Reboco_Creme", "Reboco_Branco", "Reboco_Ocre", "Cid_Reboco_Amarelo", "Cid_Reboco_Salmao", "Reboco_Azul"])
    y0 = recuo
    caixa(L, 0.1, y0, 0.0, w - 0.1, y0 + prof, h, cor, skip=('nz',))
    caixa(L, 0.05, y0 - 0.05, h, w - 0.05, y0 + prof + 0.05, h + 0.6, cor, mats={'pz': "Concreto"}, skip=('nz',))
    colisor(L, "Cid_Loja", 0.1, y0, 0.0, w - 0.1, y0 + prof, h + 0.6)
    lods(L, 0.1, y0, w - 0.1, y0 + prof, h + 0.6, cor, "Concreto")
    larg = w - 0.6
    n = max(1, int(larg / 3.4))
    for k in range(n):
        c = 0.3 + larg * (k + 0.5) / n
        reg = RC['vitrine'] if rr.random() < 0.6 else RC['enrolar']
        decal(L, 'F', y0, c, min(3.0, larg / n - 0.2), 0.0, 2.6, CA, reg)
        decal(L, 'F', y0, c, min(3.1, larg / n - 0.1), 2.6, 2.75, "Metal_Escuro", off=0.03)
    at, reg = rr.choice(placas)
    decal(L, 'F', y0, w / 2, min(larg, 5.5), 2.85, 3.55, at, (RG if at == AT else RC)[reg], off=0.06)
    if andares == 2:
        janelas(L, 'F', y0, 0.5, w - 0.5, 2.8, 1, rr, reg_list=[RC['veneziana']] + RG['J'], pe=2.8)
        if rr.random() < 0.5:                                             # sacada
            caixa(L, 1.0, y0 - 0.9, 3.75, w - 1.0, y0, 3.9, "Concreto")
            caixa(L, 1.0, y0 - 0.9, 3.9, w - 1.0, y0 - 0.8, 4.8, cor)
    if rr.random() < 0.55:                                               # toldo
        mat = rr.choice(("Plastico_Vermelho", "Caixa_Agua", "Plastico_Amarelo", "Feltro_Verde"))
        W = L.W
        L.m().face([W(0.4, y0, 2.78), W(w - 0.4, y0, 2.78), W(w - 0.4, y0 - 1.2, 2.45), W(0.4, y0 - 1.2, 2.45)], mat, facing=(0, 0, 1))
        L.m().face([W(0.4, y0, 2.77), W(w - 0.4, y0, 2.77), W(w - 0.4, y0 - 1.2, 2.44), W(0.4, y0 - 1.2, 2.44)], mat, facing=(0, 0, -1))
    for lado, xs in (('E', 0.1), ('D', w - 0.1)):
        if (lado == 'E' and L.esq[0]) or (lado == 'D' and L.esq[1]):
            for k in range(2):
                decal(L, lado, xs, y0 + prof * (k + 0.5) / 2, 2.6, 0.0, 2.6, CA, RC['enrolar'])
    inst(L, "P_Caixa_Agua_Casa", "Caixa_Agua", w - 1.6, y0 + prof / 2, h + 0.6, 0)
    if recuo > 2.0:
        plano_local(L, [(0, 0.15), (w, 0.15), (w, recuo), (0, recuo)], 0.01, "Asfalto")
        for k in range(int(w / 2.6)):
            x = 1.3 + k * 2.6
            plano_local(L, [(x - 0.06, 0.6), (x + 0.06, 0.6), (x + 0.06, recuo - 0.3), (x - 0.06, recuo - 0.3)], 0.02, "Pintura_Branca")
    conta("loja")


def casa_media(L, rr):
    w, d = L.w, L.d
    if rr.random() < 0.10:
        L.base = 0.0
        return terreno_vazio(L, rr)
    if rr.random() < 0.06:
        L.base = 0.0
        return em_construcao(L, rr)
    cor = rr.choice(C.CORES_CASA)
    recuo = rr.uniform(4.0, 6.0)
    gl, gr = rr.uniform(1.2, 1.8), rr.uniform(3.0, 3.6)
    if rr.random() < 0.5:
        gl, gr = gr, gl
    prof = min(rr.uniform(9.0, 13.0), d - recuo - 3.0)
    if prof < 6:
        L.base = 0.0
        return casa_popular(L, rr)
    andares = 2 if rr.random() < 0.35 else 1
    h = 3.0 if andares == 1 else 5.9
    b = L.base
    hx0, hx1, hy0, hy1 = gl, w - gr, recuo, recuo + prof
    if b > 0:
        plataforma(L, b)
    tipo = rr.random()
    plana = tipo < 0.3
    caixa(L, hx0, hy0, b, hx1, hy1, b + h, cor, skip=('nz',) if plana else ('nz', 'pz'))
    colisor(L, "Cid_Casa", hx0, hy0, b, hx1, hy1, b + h)
    hr = 0.0
    if plana:
        caixa(L, hx0 - 0.5, hy0 - 0.5, b + h, hx1 + 0.5, hy1 + 0.5, b + h + 0.35, "Reboco_Branco", mats={'pz': "Concreto"})
        inst(L, "P_Caixa_Agua_Casa", "Caixa_Agua", hx1 - 1.5, (hy0 + hy1) / 2, b + h + 0.35, 0)
    elif tipo < 0.8:
        hr = rr.uniform(1.3, 1.9)
        telhado(L, hx0, hy0, hx1, hy1, b + h, hr, "Telha", o=0.6)
    else:
        hr = rr.uniform(1.4, 1.8)
        telhado_2aguas(L, hx0, hy0, hx1, hy1, b + h, hr, "Telha", cor, o=0.5)
    lods(L, hx0, hy0, hx1, hy1, h, cor, "Concreto" if plana else "Telha", hr)
    pc = hx0 + 1.5
    janelas(L, 'F', hy0, hx0 + 0.5, hx1 - 0.5, b, andares, rr, livres=[pc], larg=1.6, alt=1.25, pe=2.9)
    decal(L, 'F', hy0, pc, 1.0, b, b + 2.2, AT, RG['porta'])
    if L.esq[0]:
        janelas(L, 'E', hx0, hy0 + 0.6, hy1 - 0.6, b, andares, rr)
    if L.esq[1]:
        janelas(L, 'D', hx1, hy0 + 0.6, hy1 - 0.6, b, andares, rr)
    # garagem lateral coberta (do lado do recuo maior)
    if gr > gl:
        gx0, gx1 = hx1 + 0.2, w - 0.3
    else:
        gx0, gx1 = 0.3, hx0 - 0.2
    caixa(L, gx0, hy0 + 0.5, b + 2.5, gx1, hy0 + 6.0, b + 2.65, "Cid_Telha_Metal")
    for (x, y) in ((gx0 + 0.1, hy0 + 0.6), (gx1 - 0.1, hy0 + 0.6)):
        L.m().cyl(0.06, 2.5, "Metal_Escuro", segs=6, M=Matrix.Translation(Vector(L.W(x, y, b))))
    plano_local(L, [(gx0, 0.15), (gx1, 0.15), (gx1, hy0 + 6.0), (gx0, hy0 + 6.0)], b + 0.01, "Concreto")
    hm = rr.choice((1.1, 1.8, 2.0))
    cm = rr.choice(C.CORES_CASA)
    gc = (gx0 + gx1) / 2
    muro_frente(L, hm, cm, [(pc - 0.55, pc + 0.55), (gc - 1.5, gc + 1.5)])
    if hm < 1.3:                                                         # muro baixo + cerca viva
        xa, xb = (pc + 0.7, gx0 - 0.3) if gx0 > pc else (gx1 + 0.3, w - 0.3)
        if xb - xa > 1.0:
            caixa(L, xa, 0.3, b + hm, xb, 0.9, b + hm + 0.7, "Folhas")
    if b > 0:                                                            # escada do portao social
        for k in range(int(b / 0.18)):
            caixa(L, pc - 0.6, 0.15 + k * 0.3, 0.0, pc + 0.6, 0.45 + k * 0.3, (k + 1) * 0.18, "Concreto", skip=('nz',))
    conta("casa_media")


def terreno_vazio(L, rr):
    plano_local(L, [(0.2, 0.2), (L.w - 0.2, 0.2), (L.w - 0.2, L.d - 0.2), (0.2, L.d - 0.2)], 0.01,
                rr.choice(("Cid_Grama_Seca", "Terra_Batida", "Cid_Grama_Seca")))
    for x in (0.2, L.w - 0.2):                                            # mourao de cerca
        for k in range(int(L.d / 4)):
            caixa(L, x - 0.06, 0.2 + k * 4, 0.0, x + 0.06, 0.32 + k * 4, 1.3, "Madeira_Escura")
    conta("terreno_vazio")


def em_construcao(L, rr):
    w, d = L.w, L.d
    x0, x1, y0, y1 = 1.5, w - 1.5, 4.0, min(d - 3, 15.0)
    plano_local(L, [(0.2, 0.2), (w - 0.2, 0.2), (w - 0.2, d - 0.2), (0.2, d - 0.2)], 0.01, "Terra_Batida")
    for (x, y) in ((x0, y0), (x1, y0), (x1, y1), (x0, y1), ((x0 + x1) / 2, y0), ((x0 + x1) / 2, y1)):
        caixa(L, x - 0.12, y - 0.12, 0.0, x + 0.12, y + 0.12, 3.0, "Concreto")
    caixa(L, x0 - 0.12, y0 - 0.12, 2.8, x1 + 0.12, y1 + 0.12, 3.05, "Concreto")
    for (a, b_, c_, e_) in ((x0, y0, x1, y0 + 0.14), (x0, y1 - 0.14, x1, y1), (x0, y0, x0 + 0.14, y1)):
        caixa(L, a, b_, 0.0, c_, e_, rr.uniform(0.8, 1.8), "Tijolo", skip=('nz',))
    colisor(L, "Cid_Obra", x0 - 0.12, y0 - 0.12, 0.0, x1 + 0.12, y1 + 0.12, 3.05)
    L.m().cyl(1.2, 0.8, "Terra", segs=8, r2=0.05, M=Matrix.Translation(Vector(L.W(w - 2.0, 2.0, 0.0))))
    caixa(L, 0, 0.0, 0.0, w, 0.06, 2.2, "Cid_Fibrocimento")                # tapume
    colisor(L, "Cid_Muro", 0, 0.0, 0.0, w, 0.06, 2.2)
    lods(L, x0, y0, x1, y1, 3.05, "Concreto", "Concreto")
    conta("em_construcao")


def sobrado_centro(L, rr):
    w, d = L.w, L.d
    andares = rr.choice((1, 2, 2, 2, 3, 3))
    h = 3.6 + (andares - 1) * 2.9
    prof = min(d - 0.3, rr.uniform(12.0, 20.0))
    cor = rr.choice(C.CORES_CASA + ["Reboco_Marrom"])
    caixa(L, 0.0, 0.0, 0.0, w, prof, h, cor, skip=('nz',))
    caixa(L, -0.04, -0.04, h, w + 0.04, prof + 0.04, h + 0.8, cor, mats={'pz': "Concreto"}, skip=('nz',))   # platibanda
    caixa(L, -0.03, -0.03, 0.0, w + 0.03, -0.0, 0.5, "Cid_Reboco_Sujo")                                    # rodape
    colisor(L, "Cid_Sobrado", 0.0, 0.0, 0.0, w, prof, h + 0.8)
    lods(L, 0.0, 0.0, w, prof, h + 0.8, cor, "Concreto")
    n = max(1, int((w - 0.4) / 3.3))
    for k in range(n):
        c = 0.2 + (w - 0.4) * (k + 0.5) / n
        decal(L, 'F', 0.0, c, min(3.0, (w - 0.4) / n - 0.25), 0.0, 2.7, CA, RC['vitrine'] if rr.random() < 0.65 else RC['enrolar'])
    at, reg = rr.choice(LOJAS)
    decal(L, 'F', 0.0, w / 2, min(w - 0.6, 5.5), 2.85, 3.45, at, (RG if at == AT else RC)[reg], off=0.06)
    if andares > 1:
        janelas(L, 'F', 0.0, 0.4, w - 0.4, 3.6 - 1.0, andares - 1, rr, reg_list=[RC['veneziana'], RG['J'][0], RG['J'][1]],
                larg=1.3, alt=1.5, pe=2.9)
        if rr.random() < 0.5:
            for f in range(andares - 1):
                z = 3.6 + f * 2.9
                caixa(L, 0.6, -0.8, z, w - 0.6, 0.0, z + 0.12, "Concreto")
                caixa(L, 0.6, -0.8, z + 0.12, w - 0.6, -0.72, z + 1.0, cor)
    if L.esq[0]:
        janelas(L, 'E', 0.0, 1.0, prof - 1.0, 3.6 - 1.0, andares - 1, rr, pe=2.9)
    if L.esq[1]:
        janelas(L, 'D', w, 1.0, prof - 1.0, 3.6 - 1.0, andares - 1, rr, pe=2.9)
    inst(L, "P_Caixa_Agua_Casa", "Caixa_Agua", w / 2, prof * 0.6, h + 0.8, rr.uniform(0, 90))
    if rr.random() < 0.35:
        inst(L, "P_AC", "Ar_Condicionado", w * 0.3, 0.0, 3.9, 0.0)
    conta("sobrado")


def galpao(L, rr, cor=None, marca=None, docas=None):
    w, d = L.w, L.d
    if rr.random() < 0.15 and marca is None:
        plano_local(L, [(0.3, 0.3), (w - 0.3, 0.3), (w - 0.3, d - 0.3), (0.3, d - 0.3)], 0.01, rr.choice(("Cid_Grama_Seca", "Terra_Batida")))
        muro_ind(L, rr, portao_larg=6.0)
        conta("lote_industrial_vazio")
        return
    cor = cor or rr.choice(GALPOES)
    patio = rr.uniform(10.0, 16.0)
    gx0, gx1 = 4.0, w - 4.0
    gy0, gy1 = patio, min(d - 4.0, patio + rr.uniform(22.0, 55.0))
    if gy1 - gy0 < 12:
        gy1 = d - 2.0
    hg = rr.uniform(8.0, 12.0)
    hc = 2.6
    caixa(L, gx0, gy0, 0.0, gx1, gy1, hc, "Cid_Concreto_Pre", skip=('nz', 'pz'))
    caixa(L, gx0, gy0, hc, gx1, gy1, hg, cor, skip=('nz', 'pz'))
    hr = (gx1 - gx0) * 0.08
    W = L.W
    m = L.m()
    xm = (gx0 + gx1) / 2
    o = 0.6
    ev = (L.n.x, L.n.y, 0.0)
    m.roof_face([W(gx0 - o, gy1 + o, hg), W(gx0 - o, gy0 - o, hg), W(xm, gy0 - o, hg + hr), W(xm, gy1 + o, hg + hr)], "Cid_Telha_Metal", ev)
    m.roof_face([W(gx1 + o, gy0 - o, hg), W(gx1 + o, gy1 + o, hg), W(xm, gy1 + o, hg + hr), W(xm, gy0 - o, hg + hr)], "Cid_Telha_Metal", ev)
    for y, s in ((gy0, -1), (gy1, 1)):
        m.face([W(gx0, y, hg), W(gx1, y, hg), W(xm, y, hg + hr)], cor, facing=(L.n.x * s, L.n.y * s, 0))
    colisor(L, "Cid_Galpao", gx0, gy0, 0.0, gx1, gy1, hg + hr)
    lods(L, gx0, gy0, gx1, gy1, hg, cor, "Cid_Telha_Metal", hr)
    nd = docas if docas is not None else max(1, min(5, int((gx1 - gx0 - 10) / 5.0)))
    for k in range(nd):                                                  # docas na frente
        c = gx0 + 3.5 + k * 5.0
        if c > gx1 - 8:
            break
        decal(L, 'F', gy0, c, 3.2, 1.2, 4.6, CA, RC['doca'])
        caixa(L, c - 2.0, gy0 - 2.5, 0.0, c + 2.0, gy0, 1.2, "Concreto", skip=('nz',))
        colisor(L, "Cid_Doca", c - 2.0, gy0 - 2.5, 0.0, c + 2.0, gy0, 1.2)
    for k in range(int((gx1 - gx0) / 6)):                                # basculantes
        c = gx0 + 3 + k * 6
        decal(L, 'F', gy0, c, 2.4, hg - 3.2, hg - 1.4, CA, RC['basculante'])
        decal(L, 'T', gy1, c, 2.4, hg - 3.2, hg - 1.4, CA, RC['basculante'])
    # escritorio na frente (2 pavimentos)
    ex1 = min(gx1, w - 4.0)
    ex0 = ex1 - min(12.0, (gx1 - gx0) * 0.35)
    ey0, ey1 = gy0 - 7.0, gy0
    if ey0 > 2.0:
        ce = rr.choice(("Reboco_Branco", "Cid_Reboco_Cinza", "Reboco_Creme"))
        caixa(L, ex0, ey0, 0.0, ex1, ey1, 6.4, ce, mats={'pz': "Concreto"}, skip=('nz',))
        colisor(L, "Cid_Escritorio", ex0, ey0, 0.0, ex1, ey1, 6.4)
        lods(L, ex0, ey0, ex1, ey1, 6.4, ce, "Concreto")
        for f in range(2):
            decal(L, 'F', ey0, (ex0 + ex1) / 2, ex1 - ex0 - 1.2, 1.0 + f * 3.1, 2.4 + f * 3.1, "Janela_Escura")
        if marca:
            decal(L, 'F', ey0, (ex0 + ex1) / 2, min(ex1 - ex0, 9.0), 6.5, 7.6, CA, RC[marca], off=0.05)
            caixa(L, (ex0 + ex1) / 2 - 4.6, ey0 + 0.1, 6.4, (ex0 + ex1) / 2 + 4.6, ey0 + 0.3, 7.7, "Metal_Escuro")
    # patio asfaltado com vagas
    plano_local(L, [(0.3, 0.3), (w - 0.3, 0.3), (w - 0.3, gy0 - 0.05), (0.3, gy0 - 0.05)], 0.01, "Asfalto")
    for k in range(int((ex0 - 2.0) / 2.6) if ey0 > 2.0 else 0):
        x = 1.5 + k * 2.6
        plano_local(L, [(x - 0.06, ey0 + 1.5), (x + 0.06, ey0 + 1.5), (x + 0.06, gy0 - 0.5), (x - 0.06, gy0 - 0.5)], 0.02, "Pintura_Branca")
    muro_ind(L, rr)
    REGISTRO["postes_poi"].append([*L.P(1.5, patio * 0.5), 'alto'])
    conta("galpao")


def muro_ind(L, rr, portao_larg=8.0):
    w, d = L.w, L.d
    pg = rr.uniform(3.0, max(3.5, w * 0.35))
    ab = [(pg, pg + portao_larg)]
    s = 0.0
    for (a, b_) in ab + [(w, w)]:
        if a - s > 0.05:
            caixa(L, s, 0.0, 0.0, a, 0.15, 2.4, "Cid_Concreto_Pre", skip=('nz',))
            colisor(L, "Cid_Muro", s, 0.0, 0.0, a, 0.15, 2.4)
        s = b_
    caixa(L, pg, 0.05, 2.25, pg + portao_larg, 0.1, 2.4, "Metal_Escuro")        # trilho do portao de correr (aberto)
    for (x0_, x1_) in ((0.0, 0.15), (w - 0.15, w)):                             # divisas
        caixa(L, x0_, 0.15, 0.0, x1_, d - 0.2, 2.4, "Cid_Concreto_Pre", skip=('nz',))
        colisor(L, "Cid_Muro", x0_, 0.15, 0.0, x1_, d - 0.2, 2.4)
    caixa(L, 0.15, d - 0.35, 0.0, w - 0.15, d - 0.2, 2.4, "Cid_Concreto_Pre", skip=('nz',))
    colisor(L, "Cid_Muro", 0.15, d - 0.35, 0.0, w - 0.15, d - 0.2, 2.4)
    gx = pg + portao_larg + 0.4                                                  # guarita
    if gx + 3.0 < w:
        caixa(L, gx, 0.3, 0.0, gx + 2.6, 2.9, 2.7, "Reboco_Branco", skip=('nz',))
        caixa(L, gx - 0.3, 0.0, 2.7, gx + 2.9, 3.2, 2.9, "Concreto", skip=('nz',))
        decal(L, 'F', 0.3, gx + 1.3, 2.2, 1.0, 2.1, "Janela_Escura")
        colisor(L, "Cid_Guarita", gx, 0.3, 0.0, gx + 2.6, 2.9, 2.9)
    p = L.P(pg + portao_larg / 2, -1.0)
    REGISTRO["portoes"].append([round(p.x, 2), round(p.y, 2), portao_larg])
    caixa(L, 0.0, 0.0, 0.0, w, 0.15, 2.4, "Cid_Concreto_Pre", skip=('nz', 'ny', 'py', 'nx', 'px'), tipo="Edificios_LOD1")


# ============================================================== loteamento por frente de rua
def frentes(q):
    """Trechos continuos de frente para rua (no anel da calcada interna), com o tipo de via de maior classe."""
    n = len(q.nos)
    segs = []
    for i in range(n):
        if not q.real[i]:
            segs.append(None)
            continue
        a, b = C.segmentos(q, q.calc, i)
        segs.append((a, b, q.tipos[i]))
    runs = []
    usados = set()
    inicio = None
    for i in range(n):
        if segs[i] is not None and (segs[i - 1] is None or _quebra(segs[i - 1], segs[i])):
            inicio = i
            break
    if inicio is None:
        if all(s is not None for s in segs):
            inicio = 0
        else:
            return []
    for k in range(n):
        i = (inicio + k) % n
        if segs[i] is None or i in usados:
            continue
        pts = [segs[i][0], segs[i][1]]
        tipos = [segs[i][2]]
        usados.add(i)
        j = (i + 1) % n
        while j not in usados and segs[j] is not None and not _quebra(segs[(j - 1) % n], segs[j]):
            if (segs[j][0] - pts[-1]).length > 0.05:
                pts.append(segs[j][0])
            pts.append(segs[j][1])
            tipos.append(segs[j][2])
            usados.add(j)
            j = (j + 1) % n
        tipo = max(tipos, key=lambda t: C.VIA[t]['cls'])
        Lr = sum((b - a).length for a, b in zip(pts[:-1], pts[1:]))
        runs.append({"pts": pts, "tipo": tipo, "L": Lr})
    return runs


def _quebra(s0, s1):
    d0 = (s0[1] - s0[0])
    d1 = (s1[1] - s1[0])
    if d0.length < 1e-6 or d1.length < 1e-6:
        return False
    return d0.normalized().dot(d1.normalized()) < math.cos(math.radians(25))


def ponto_em(pts, s):
    acc = 0.0
    for a, b in zip(pts[:-1], pts[1:]):
        L = (b - a).length
        if acc + L >= s:
            return a.lerp(b, (s - acc) / L if L > 1e-9 else 0)
        acc += L
    return pts[-1]


def prof_disp(p, nrm, poly):
    best = 1e9
    far = p + nrm * 1000
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        r = C.inter_seg(p + nrm * 0.05, far, a, b)
        if r:
            best = min(best, r[0] * 1000)
    return best


PARAM = {   # zona -> (largura min, max, profundidade)
    "OLARIA": (7.5, 10.5, 21.0), "CONCEICAO": (11.0, 15.0, 28.0), "CENTRO": (6.5, 11.0, 20.0), "INDUSTRIAL": (32.0, 58.0, 72.0)}


def lotear(q, rr, dmin_borda=0.0):
    runs = frentes(q)
    runs.sort(key=lambda r: (-C.VIA[r["tipo"]]['cls'], -r["L"]))
    poly = q.poly_int
    lotes = []
    quads = []
    wmin, wmax, D = PARAM[q.zona]
    for r in runs:
        pts, Lr = r["pts"], r["L"]
        av = C.VIA[r["tipo"]]['cls'] >= 2
        s = 0.0
        primeiro = True
        while s < Lr - wmin * 0.8:
            w = rr.uniform(wmin, wmax)
            if av and q.zona in ("OLARIA", "CONCEICAO"):
                w = rr.uniform(11.0, 16.0)
            if Lr - s - w < wmin:
                w = Lr - s
            A = ponto_em(pts, s)
            Bp = ponto_em(pts, s + w)
            u = Bp - A
            if u.length < 3.0:
                break
            wr = u.length
            u.normalize()
            nrm = C.perp(u)
            disp = min(prof_disp(A.lerp(Bp, 0.5), nrm, poly), prof_disp(A + u * 0.3, nrm, poly), prof_disp(Bp - u * 0.3, nrm, poly))
            d = D if disp > 2 * D + 6 else max(8.0, disp / 2 - 0.1)
            if dmin_borda > 0:
                d = min(d, disp - dmin_borda)
            ok = False
            for frac in (1.0, 0.8, 0.62):
                dd = d * frac
                if dd < 7.5:
                    break
                quad = [A + u * 0.05, Bp - u * 0.05, Bp - u * 0.05 + nrm * dd, A + u * 0.05 + nrm * dd]
                if not all(C.dentro(p, poly) or C.dist_poly(p, poly) < 0.08 for p in quad):
                    continue
                if any(C.obb_sobrepoe(quad, o_) for o_ in quads):
                    continue
                ok = True
                break
            if ok:
                quads.append(quad)
                esq = (primeiro, s + w >= Lr - 0.5)
                lotes.append(Lote(A, u, wr, dd, q, r["tipo"], esq))
                s += w
                primeiro = False
            else:
                s += 1.5
                primeiro = False
    return lotes


# ============================================================== pontos de interesse (quadras inteiras)
def quadro_poi(q, rr=None):
    """Referencial de lote cobrindo a maior caixa inscrita da quadra, com a frente voltada para a via mais importante."""
    c, u, a, b = C.obb_inscrito(q.poly_int, q.poly_ext)
    n = C.perp(u)
    best = None
    for i in range(len(q.nos)):
        if not q.real[i]:
            continue
        s0, s1 = C.segmentos(q, q.calc, i)
        mid = (s0 + s1) / 2
        sc = C.VIA[q.tipos[i]]['cls'] * 1000 - (mid - c).length
        if best is None or sc > best[0]:
            best = (sc, mid)
    alvo = best[1] - c
    cand = [(n, a, b), (-n, a, b), (u, b, a), (-u, b, a)]               # (direcao da frente, larg, prof)
    fr, wl, dl = max(cand, key=lambda t: t[0].dot(alvo))
    ux = C.perp(fr)                                                      # perp(ux) = -fr: o lote cresce para dentro
    A = c + fr * (dl / 2) - ux * (wl / 2)
    return Lote(A, ux, wl, dl, q, 'poi')


def poi_prefeitura(q, rr):
    L = quadro_poi(q)
    w, d = L.w, L.d
    plano_local(L, [(0.1, 0.1), (w - 0.1, 0.1), (w - 0.1, d - 0.1), (0.1, d - 0.1)], 0.01, "Pedra_Portuguesa")
    bx0, bx1, by0, by1 = w / 2 - 13, w / 2 + 13, d - 18.0, d - 2.0
    cor = "Reboco_Creme"
    caixa(L, bx0, by0, 0.0, bx1, by1, 8.2, cor, skip=('nz',))
    caixa(L, bx0 - 0.3, by0 - 0.3, 8.2, bx1 + 0.3, by1 + 0.3, 9.4, "Reboco_Branco", mats={'pz': "Concreto"}, skip=('nz',))
    caixa(L, bx0 - 0.1, by0 - 0.1, 0.0, bx1 + 0.1, by1 + 0.1, 0.8, "Reboco_Marrom", skip=('nz', 'pz'))
    colisor(L, "Cid_Prefeitura", bx0, by0, 0.0, bx1, by1, 9.4)
    lods(L, bx0, by0, bx1, by1, 9.4, cor, "Concreto")
    for f in range(2):
        for k in range(10):
            c = bx0 + 1.6 + k * 2.53
            if abs(c - w / 2) < 3.5:
                continue
            decal(L, 'F', by0, c, 1.2, 1.2 + f * 4.0, 3.4 + f * 4.0, AT, RG['J'][2])
    # portico com colunas e frontao
    px0, px1 = w / 2 - 4.5, w / 2 + 4.5
    caixa(L, px0, by0 - 4.0, 0.0, px1, by0, 0.6, "Concreto", mats={'pz': "Pedra_Portuguesa"}, skip=('nz',))
    for k in range(4):
        x = px0 + 0.8 + k * (px1 - px0 - 1.6) / 3
        L.m().cyl(0.35, 6.6, "Reboco_Branco", segs=10, M=Matrix.Translation(Vector(L.W(x, by0 - 3.3, 0.6))))
    caixa(L, px0 - 0.3, by0 - 4.0, 7.2, px1 + 0.3, by0, 8.4, "Reboco_Branco")
    W = L.W
    L.m().face([W(px0 - 0.3, by0 - 4.0, 8.4), W(px1 + 0.3, by0 - 4.0, 8.4), W(w / 2, by0 - 4.0, 10.2)], "Reboco_Branco", facing=(-L.n.x, -L.n.y, 0))
    L.m().roof_face([W(px0 - 0.3, by0 - 4.0, 8.4), W(w / 2, by0 - 4.0, 10.2), W(w / 2, by0, 10.2), W(px0 - 0.3, by0, 8.4)], "Telha", (L.n.x, L.n.y, 0))
    L.m().roof_face([W(w / 2, by0 - 4.0, 10.2), W(px1 + 0.3, by0 - 4.0, 8.4), W(px1 + 0.3, by0, 8.4), W(w / 2, by0, 10.2)], "Telha", (L.n.x, L.n.y, 0))
    colisor(L, "Cid_Portico", px0, by0 - 4.0, 0.0, px1, by0, 0.6)
    decal(L, 'F', by0, w / 2, 2.2, 0.6, 3.6, AT, RG['porta'])
    decal(L, 'F', by0 - 4.0, w / 2, 8.6, 7.4, 8.2, CA, RC['prefeitura'], off=0.04)
    for k, mat in enumerate(("Feltro_Verde", "Plastico_Amarelo", "Caixa_Agua")):          # mastros e bandeiras
        x = w / 2 - 3 + k * 3
        L.m().tube(Vector(L.W(x, by0 - 9.0, 0.0)), Vector(L.W(x, by0 - 9.0, 9.0)), 0.05, "Metal_Branco", segs=6)
        caixa(L, x + 0.05, by0 - 9.02, 7.6, x + 1.6, by0 - 8.98, 8.7, mat)
        colisor(L, "Cid_Mastro", x - 0.08, by0 - 9.08, 0.0, x + 0.08, by0 - 8.92, 9.0)
    for (x, y) in ((4.0, 4.0), (w - 4.0, 4.0), (4.0, by0 - 6), (w - 4.0, by0 - 6)):
        REGISTRO["arvores_poi"].append([*L.P(x, y), 'ipe'])
    for x in (w / 2 - 8, w / 2 + 8):
        REGISTRO["bancos"].append([*L.P(x, 6.0), L.rot + 180])
    REGISTRO["luzes"].append(["Luz_Prefeitura", *L.W(w / 2, by0 - 5.0, 6.0), 400.0])
    REGISTRO["marcadores"].append(["Ponto_Prefeitura", *L.W(w / 2, by0 - 6.0, 0.0), L.rot + 90])
    conta("POI_prefeitura")


def poi_terminal(q, rr):
    L = quadro_poi(q)
    w, d = L.w, L.d
    plano_local(L, [(0.1, 0.1), (w - 0.1, 0.1), (w - 0.1, d - 0.1), (0.1, d - 0.1)], 0.01, "Asfalto")
    for k in range(3):                                                   # plataformas (ilhas) e cobertura
        y0 = 6.0 + k * 9.0
        if y0 + 3 > d - 9:
            break
        caixa(L, 3.0, y0, 0.0, w - 3.0, y0 + 3.0, 0.25, "Concreto", skip=('nz',))
        colisor(L, "Cid_Plataforma", 3.0, y0, 0.0, w - 3.0, y0 + 3.0, 0.25)
        caixa(L, 2.0, y0 - 1.5, 4.6, w - 2.0, y0 + 4.5, 4.85, "Cid_Telha_Metal", mats={'nz': "Metal_Branco"})
        for x in (4.0, w / 2, w - 4.0):
            L.m().cyl(0.15, 4.6, "Metal_Branco", segs=8, M=Matrix.Translation(Vector(L.W(x, y0 + 1.5, 0.0))))
            colisor(L, "Cid_Pilar", x - 0.15, y0 + 1.35, 0.0, x + 0.15, y0 + 1.65, 4.6)
        for x in (w / 2 - 6, w / 2 + 6):
            REGISTRO["bancos"].append([*L.P(x, y0 + 1.5), L.rot])
        lods(L, 2.0, y0 - 1.5, w - 2.0, y0 + 4.5, 0.25, "Concreto", "Cid_Telha_Metal")
    bx0, bx1, by0, by1 = 4.0, w - 4.0, d - 8.0, d - 1.0
    caixa(L, bx0, by0, 0.0, bx1, by1, 4.0, "Reboco_Branco", mats={'pz': "Concreto"}, skip=('nz',))
    colisor(L, "Cid_Terminal", bx0, by0, 0.0, bx1, by1, 4.0)
    lods(L, bx0, by0, bx1, by1, 4.0, "Reboco_Branco", "Concreto")
    for k in range(4):
        decal(L, 'F', by0, bx0 + 3 + k * (bx1 - bx0 - 6) / 3, 2.8, 0.0, 2.6, CA, RC['vitrine'])
    decal(L, 'F', by0, (bx0 + bx1) / 2, 8.0, 3.0, 3.9, CA, RC['terminal'], off=0.05)
    p = L.P(w / 2, 4.0)
    REGISTRO["pontos_onibus"].append([p.x, p.y, L.rot + 180, True])
    REGISTRO["luzes"].append(["Luz_Terminal", *L.W(w / 2, 10.0, 4.4), 350.0])
    REGISTRO["marcadores"].append(["Ponto_Terminal", *L.W(w / 2, 7.5, 0.25), L.rot + 90])
    conta("POI_terminal")


def poi_escola(q, rr, nome="emef"):
    L = quadro_poi(q)
    w, d = L.w, L.d
    for (p0, p1) in (((0.3, 0.3), (w - 0.3, 0.3)), ((w - 0.3, 0.3), (w - 0.3, d - 0.3)), ((w - 0.3, d - 0.3), (0.3, d - 0.3)), ((0.3, d - 0.3), (0.3, 0.3))):
        a_, b_ = Vector(p0), Vector(p1)
        ax = (b_ - a_)
        mm = Matrix(((ax.normalized().x, -ax.normalized().y, 0, 0), (ax.normalized().y, ax.normalized().x, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)))
    # muro com portao
    s = 0.3
    for (a, b_) in ((w / 2 - 2.5, w / 2 + 2.5), (w, w)):
        caixa(L, s, 0.3, 0.0, min(a, w - 0.3), 0.5, 2.3, "Reboco_Azul", mats={'py': "Reboco_Branco"}, skip=('nz',))
        colisor(L, "Cid_Muro", s, 0.3, 0.0, min(a, w - 0.3), 0.5, 2.3)
        s = b_
    for (x0_, x1_) in ((0.3, 0.5), (w - 0.5, w - 0.3)):
        caixa(L, x0_, 0.5, 0.0, x1_, d - 0.3, 2.3, "Reboco_Azul", skip=('nz',))
        colisor(L, "Cid_Muro", x0_, 0.5, 0.0, x1_, d - 0.3, 2.3)
    caixa(L, 0.5, d - 0.5, 0.0, w - 0.5, d - 0.3, 2.3, "Reboco_Azul", skip=('nz',))
    colisor(L, "Cid_Muro", 0.5, d - 0.5, 0.0, w - 0.5, d - 0.3, 2.3)
    caixa(L, w / 2 - 4.5, 0.25, 2.3, w / 2 + 4.5, 0.55, 3.4, "Reboco_Azul", mats={'ny': CA}, uvr={'ny': B.arect(*RC[nome])})
    blocos = [(2.0, w - 2.0, d - 12.0, d - 2.0), (w - 12.0, w - 2.0, d * 0.45, d - 12.0)]
    for (a0, a1, b0, b1) in blocos:
        caixa(L, a0, b0, 0.0, a1, b1, 6.4, "Reboco_Branco", skip=('nz',))
        caixa(L, a0 - 0.1, b0 - 0.1, 6.4, a1 + 0.1, b1 + 0.1, 6.9, "Reboco_Azul", mats={'pz': "Concreto"}, skip=('nz',))
        colisor(L, "Cid_Escola", a0, b0, 0.0, a1, b1, 6.9)
        lods(L, a0, b0, a1, b1, 6.9, "Reboco_Branco", "Concreto")
    a0, a1, b0, b1 = blocos[0]
    for k in range(int((a1 - a0) / 2.4)):
        for f in range(2):
            decal(L, 'F', b0, a0 + 1.2 + k * 2.4, 1.6, 1.1 + f * 3.1, 2.4 + f * 3.1, AT, RG['J'][3])
    qx0, qx1, qy0, qy1 = 3.0, min(w - 15.0, 31.0), 4.0, min(d * 0.45, 22.0)
    plano_local(L, [(qx0, qy0), (qx1, qy0), (qx1, qy1), (qx0, qy1)], 0.01, "Caixa_Agua")
    for (a, b_, c_, e_) in ((qx0 + 0.4, qy0 + 0.4, qx1 - 0.4, qy0 + 0.5), (qx0 + 0.4, qy1 - 0.5, qx1 - 0.4, qy1 - 0.4),
                            ((qx0 + qx1) / 2 - 0.05, qy0 + 0.4, (qx0 + qx1) / 2 + 0.05, qy1 - 0.4)):
        plano_local(L, [(a, b_), (c_, b_), (c_, e_), (a, e_)], 0.016, "Pintura_Branca")
    for (x, r) in ((qx0 + 0.6, 180), (qx1 - 0.6, 0)):
        inst(L, "P_Trave", "Trave", x, (qy0 + qy1) / 2, 0.0, r, scale=(0.7, 1.0, 1.0))
    L.m().tube(Vector(L.W(w - 5, 3.0, 0)), Vector(L.W(w - 5, 3.0, 8.0)), 0.05, "Metal_Branco", segs=6)
    REGISTRO["arvores_poi"] += [[*L.P(x, d * 0.4), 'b'] for x in (w * 0.15, w * 0.35)]
    REGISTRO["marcadores"].append(["Ponto_Escola_Conceicao", *L.W(w / 2, 1.5, 0.0), L.rot + 90])
    REGISTRO["placas_escola"] = REGISTRO.get("placas_escola", []) + [[*L.P(w / 2 - 8, -2.0), L.rot]]
    conta("POI_escola")


def poi_ubs(q, rr):
    L = quadro_poi(q)
    w, d = L.w, L.d
    plano_local(L, [(0.2, 0.2), (w - 0.2, 0.2), (w - 0.2, d - 0.2), (0.2, d - 0.2)], 0.01, "Grama")
    bx0, bx1, by0, by1 = 6.0, w - 6.0, 12.0, min(d - 6.0, 28.0)
    caixa(L, bx0, by0, 0.0, bx1, by1, 3.8, "Reboco_Branco", skip=('nz',))
    caixa(L, bx0 - 0.4, by0 - 0.4, 3.8, bx1 + 0.4, by1 + 0.4, 4.3, "Feltro_Verde", mats={'pz': "Concreto"}, skip=('nz',))
    colisor(L, "Cid_UBS", bx0, by0, 0.0, bx1, by1, 4.3)
    lods(L, bx0, by0, bx1, by1, 4.3, "Reboco_Branco", "Concreto")
    janelas(L, 'F', by0, bx0 + 1, bx1 - 1, 0.0, 1, rr, livres=[w / 2], larg=1.8)
    decal(L, 'F', by0, w / 2, 2.4, 0.0, 2.6, AT, RG['porta_ferro'])
    caixa(L, w / 2 - 3.5, by0 - 4.0, 2.9, w / 2 + 3.5, by0, 3.1, "Concreto")              # cobertura da entrada
    for x in (w / 2 - 3.2, w / 2 + 3.2):
        L.m().cyl(0.1, 2.9, "Metal_Branco", segs=6, M=Matrix.Translation(Vector(L.W(x, by0 - 3.7, 0.0))))
    decal(L, 'F', by0 - 0.5, w / 2, 7.0, 4.35, 5.2, CA, RC['ubs'], off=0.0)
    caixa(L, w / 2 - 3.6, by0 - 0.55, 4.3, w / 2 + 3.6, by0 - 0.45, 5.25, "Metal_Escuro")
    plano_local(L, [(bx0, 1.0), (bx1, 1.0), (bx1, by0 - 4.5), (bx0, by0 - 4.5)], 0.015, "Asfalto")
    muro_frente(L, 1.1, "Reboco_Branco", [(w / 2 - 1.0, w / 2 + 1.0), (bx0 + 2, bx0 + 7)])
    REGISTRO["arvores_poi"] += [[*L.P(x, y), 'a'] for (x, y) in ((3, d - 5), (w - 3, d - 5), (3, 6), (w - 3, 6))]
    REGISTRO["marcadores"].append(["Ponto_UBS", *L.W(w / 2, by0 - 2.0, 0.0), L.rot + 90])
    conta("POI_ubs")


def poi_praca(q, rr, nome="Ponto_Praca_Conceicao"):
    L = quadro_poi(q)
    w, d = L.w, L.d
    C_ = MM.get("Lotes", q.c.x, q.c.y)
    C_.face([(p.x, p.y, ZC + 0.01) for p in q.poly_int], "Grama", facing=(0, 0, 1))
    cx, cy = w / 2, d / 2
    for (a, b_, c_, e_) in ((cx - 1.5, 0.0, cx + 1.5, d), (0.0, cy - 1.5, w, cy + 1.5)):
        plano_local(L, [(a, b_), (c_, b_), (c_, e_), (a, e_)], 0.02, "Pedra_Portuguesa")
    R_ = 6.0
    ring = [(cx + R_ * math.cos(2 * math.pi * k / 12), cy + R_ * math.sin(2 * math.pi * k / 12)) for k in range(12)]
    plano_local(L, ring, 0.025, "Pedra_Portuguesa")
    # quiosque central
    rq = [(cx + 2.4 * math.cos(2 * math.pi * k / 8 + math.pi / 8), cy + 2.4 * math.sin(2 * math.pi * k / 8 + math.pi / 8)) for k in range(8)]
    L.m().prism([tuple(L.P(x, y)) for (x, y) in rq], ZC, ZC + 2.6, "Madeira")
    tp = Vector(L.W(cx, cy, 4.2))
    for k in range(8):
        a_, b_ = rq[k], rq[(k + 1) % 8]
        A_ = L.W(cx + (a_[0] - cx) * 1.35, cy + (a_[1] - cy) * 1.35, 2.6)
        B_ = L.W(cx + (b_[0] - cx) * 1.35, cy + (b_[1] - cy) * 1.35, 2.6)
        L.m().roof_face([A_, B_, tuple(tp)], "Telha", (B_[0] - A_[0], B_[1] - A_[1], 0))
    colisor(L, "Cid_Quiosque", cx - 2.2, cy - 2.2, 0.0, cx + 2.2, cy + 2.2, 2.6)
    lods(L, cx - 2.4, cy - 2.4, cx + 2.4, cy + 2.4, 2.6, "Madeira", "Telha", 1.6)
    # parquinho
    px, py = w * 0.25, d * 0.25
    plano_local(L, [(px - 6, py - 5), (px + 6, py - 5), (px + 6, py + 5), (px - 6, py + 5)], 0.03, "Terra_Batida")
    brinquedos(L, px, py)
    for (x, y) in ((cx - 4, cy + 3.5), (cx + 4, cy - 3.5), (cx - 4, cy - 3.5), (cx + 4, cy + 3.5)):
        REGISTRO["bancos"].append([*L.P(x, y), L.rot + (0 if y < cy else 180)])
    for (x, y) in ((w * 0.12, d * 0.8), (w * 0.35, d * 0.85), (w * 0.7, d * 0.8), (w * 0.88, d * 0.6), (w * 0.8, d * 0.2),
                   (w * 0.6, d * 0.12), (w * 0.12, d * 0.55), (w * 0.88, d * 0.88)):
        REGISTRO["arvores_poi"].append([*L.P(x, y), rr.choice(('a', 'b', 'ipe'))])
    for (x, y) in ((cx - 7, cy), (cx + 7, cy), (cx, cy - 7), (cx, cy + 7)):
        REGISTRO["postes_poi"].append([*L.P(x, y), 'praca'])
    REGISTRO["luzes"].append(["Luz_" + nome[6:], *L.W(cx, cy, 3.5), 250.0])
    REGISTRO["marcadores"].append([nome, *L.W(cx, cy, 0.0), 0])
    conta("POI_praca")


def brinquedos(L, px, py):
    for k in range(2):                                                   # balanco
        x = px - 3.5 + k * 1.6
        for s in (-1, 1):
            L.m().tube(Vector(L.W(x - 0.8, py + s * 0.9, 0)), Vector(L.W(x - 0.8, py, 2.4)), 0.05, "Plastico_Vermelho", segs=5)
        L.m().tube(Vector(L.W(x - 0.8, py, 2.4)), Vector(L.W(x + 0.8, py, 2.4)), 0.05, "Plastico_Vermelho", segs=5)
    caixa(L, px + 1.0, py - 0.5, 0.0, px + 2.2, py + 0.5, 1.6, "Plastico_Amarelo")        # escorregador
    W = L.W
    L.m().face([W(px + 2.2, py - 0.45, 1.6), W(px + 5.0, py - 0.45, 0.2), W(px + 5.0, py + 0.45, 0.2), W(px + 2.2, py + 0.45, 1.6)],
               "Plastico_Laranja", facing=(0, 0, 1))
    colisor(L, "Cid_Brinquedo", px - 4.5, py - 1.0, 0.0, px + 5.0, py + 1.0, 2.4)


def poi_lazer_olaria(q, rr):
    """Area de bem-estar e lazer: pista de caminhada, academia ao ar livre, parquinho."""
    L = quadro_poi(q)
    w, d = L.w, L.d
    MM.get("Lotes", q.c.x, q.c.y).face([(p.x, p.y, ZC + 0.01) for p in q.poly_int], "Grama", facing=(0, 0, 1))
    m0, m1 = 3.0, 5.0
    pista_ext = [(m0, m0), (w - m0, m0), (w - m0, d - m0), (m0, d - m0)]
    pista_int = [(m0 + 2, m0 + 2), (w - m0 - 2, m0 + 2), (w - m0 - 2, d - m0 - 2), (m0 + 2, d - m0 - 2)]
    for k in range(4):
        a0, a1 = pista_ext[k], pista_ext[(k + 1) % 4]
        b0, b1 = pista_int[k], pista_int[(k + 1) % 4]
        plano_local(L, [a0, a1, b1, b0], 0.02, "Terra_Batida")
    # academia ao ar livre (aparelhos simples)
    ax, ay = w * 0.3, d * 0.5
    plano_local(L, [(ax - 7, ay - 5), (ax + 7, ay - 5), (ax + 7, ay + 5), (ax - 7, ay + 5)], 0.03, "Concreto")
    for k in range(6):
        x = ax - 5 + (k % 3) * 5
        y = ay - 2.5 + (k // 3) * 5
        L.m().tube(Vector(L.W(x - 0.7, y, 0)), Vector(L.W(x - 0.7, y, 1.6)), 0.06, "Plastico_Amarelo", segs=6)
        L.m().tube(Vector(L.W(x + 0.7, y, 0)), Vector(L.W(x + 0.7, y, 1.6)), 0.06, "Plastico_Amarelo", segs=6)
        L.m().tube(Vector(L.W(x - 0.7, y, 1.6)), Vector(L.W(x + 0.7, y, 1.6)), 0.05, "Caixa_Agua", segs=6)
        caixa(L, x - 0.3, y - 0.3, 0.3, x + 0.3, y + 0.3, 0.45, "Caixa_Agua")
    colisor(L, "Cid_Academia", ax - 6, ay - 3.5, 0.0, ax + 6, ay + 3.5, 1.6)
    px, py = w * 0.72, d * 0.5
    plano_local(L, [(px - 7, py - 6), (px + 7, py - 6), (px + 7, py + 6), (px - 7, py + 6)], 0.03, "Terra_Batida")
    brinquedos(L, px, py)
    for x in (w * 0.15, w * 0.5, w * 0.85):
        for y in (m0 + 3.5, d - m0 - 3.5):
            REGISTRO["bancos"].append([*L.P(x, y), L.rot + (180 if y > d / 2 else 0)])
    for k in range(10):
        x = m0 + 1 + k * (w - 2 * m0 - 2) / 9
        REGISTRO["arvores_poi"].append([*L.P(x, 1.2), rr.choice(('a', 'b'))])
        REGISTRO["arvores_poi"].append([*L.P(x, d - 1.2), rr.choice(('a', 'b', 'ipe'))])
    for (x, y) in ((w * 0.5, d * 0.5), (m0 + 1, d / 2), (w - m0 - 1, d / 2), (w * 0.3, m0 + 1), (w * 0.7, d - m0 - 1)):
        REGISTRO["postes_poi"].append([*L.P(x, y), 'praca'])
    REGISTRO["luzes"].append(["Luz_Lazer_Olaria", *L.W(w / 2, d / 2, 4.0), 250.0])
    REGISTRO["marcadores"].append(["Ponto_Lazer_Olaria", *L.W(w / 2, d / 2, 0.0), 0])
    conta("POI_lazer_olaria")


def poi_campo(q, rr):
    L = quadro_poi(q)
    w, d = L.w, L.d
    MM.get("Lotes", q.c.x, q.c.y).face([(p.x, p.y, ZC + 0.01) for p in q.poly_int], "Terra_Batida", facing=(0, 0, 1))
    fx0, fx1, fy0, fy1 = 4.0, w - 4.0, 6.0, d - 3.0
    plano_local(L, [(fx0, fy0), (fx1, fy0), (fx1, fy1), (fx0, fy1)], 0.02, "Grama")
    zl = 0.026
    for (a, b_, c_, e_) in ((fx0 + 0.5, fy0 + 0.5, fx1 - 0.5, fy0 + 0.6), (fx0 + 0.5, fy1 - 0.6, fx1 - 0.5, fy1 - 0.5),
                            (fx0 + 0.5, fy0 + 0.5, fx0 + 0.6, fy1 - 0.5), (fx1 - 0.6, fy0 + 0.5, fx1 - 0.5, fy1 - 0.5),
                            ((fx0 + fx1) / 2 - 0.05, fy0 + 0.5, (fx0 + fx1) / 2 + 0.05, fy1 - 0.5)):
        plano_local(L, [(a, b_), (c_, b_), (c_, e_), (a, e_)], zl, "Pintura_Branca")
    cym = (fy0 + fy1) / 2
    for (x, r) in ((fx0 + 0.6, 180), (fx1 - 0.6, 0)):
        inst(L, "P_Trave", "Trave", x, cym, 0.0, r)
        colisor(L, "Cid_Trave", x - 0.06, cym - 1.6, 0.0, x + 0.06, cym + 1.6, 2.0)
    per = [(fx0 - 0.8, fy0 - 0.8), (fx1 + 0.8, fy0 - 0.8), (fx1 + 0.8, fy1 + 0.8), (fx0 - 0.8, fy1 + 0.8)]
    for k in range(4):                                                   # alambrado
        a_, b_ = Vector(per[k]), Vector(per[(k + 1) % 4])
        if k == 0:
            a_ = a_ + Vector((4.0, 0))
        n = max(1, int((b_ - a_).length / 3.0))
        for s in range(n + 1):
            p = a_.lerp(b_, s / n)
            L.m().cyl(0.04, 4.0, "Metal_Escuro", segs=5, M=Matrix.Translation(Vector(L.W(p.x, p.y, 0.0))), caps=(False, True))
        for z in (1.0, 2.5, 3.95):
            L.m().tube(Vector(L.W(a_.x, a_.y, z)), Vector(L.W(b_.x, b_.y, z)), 0.025, "Metal_Escuro", segs=4)
        colisor(L, "Cid_Alambrado", min(a_.x, b_.x) - 0.05, min(a_.y, b_.y) - 0.05, 0.0, max(a_.x, b_.x) + 0.05, max(a_.y, b_.y) + 0.05, 4.0)
    for k in range(3):
        caixa(L, w / 2 - 9, 0.4 + k * 0.8, 0.0, w / 2 + 9, 1.2 + k * 0.8, 0.45 * (3 - k), "Concreto", skip=('nz',))
    colisor(L, "Cid_Arquibancada", w / 2 - 9, 0.4, 0.0, w / 2 + 9, 2.8, 1.35)
    caixa(L, 1.0, 0.5, 0.0, 6.0, 4.5, 2.8, "Reboco_Verde", mats={'pz': "Concreto"}, skip=('nz',))   # vestiario
    colisor(L, "Cid_Vestiario", 1.0, 0.5, 0.0, 6.0, 4.5, 2.8)
    lods(L, fx0, fy0, fx1, fy1, 0.05, "Grama", "Grama")
    for (x, y) in ((fx0 - 2.5, fy0), (fx1 + 2.5, fy0), (fx0 - 2.5, fy1), (fx1 + 2.5, fy1)):
        REGISTRO["postes_poi"].append([*L.P(x, y), 'alto'])
    REGISTRO["marcadores"].append(["Ponto_Campo_Olaria", *L.W(w / 2, cym, 0.0), 0])
    conta("POI_campo")


def poi_supermercado(q, rr):
    L = quadro_poi(q)
    w, d = L.w, L.d
    plano_local(L, [(0.2, 0.2), (w - 0.2, 0.2), (w - 0.2, d - 0.2), (0.2, d - 0.2)], 0.01, "Asfalto")
    bx0, bx1 = 4.0, w - 4.0
    by0, by1 = d * 0.45, d - 4.0
    cor = "Reboco_Branco"
    caixa(L, bx0, by0, 0.0, bx1, by1, 7.5, cor, skip=('nz',))
    caixa(L, bx0 - 0.1, by0 - 0.1, 7.5, bx1 + 0.1, by1 + 0.1, 8.5, "Plastico_Vermelho", mats={'pz': "Concreto"}, skip=('nz',))
    colisor(L, "Cid_Supermercado", bx0, by0, 0.0, bx1, by1, 8.5)
    lods(L, bx0, by0, bx1, by1, 8.5, cor, "Concreto")
    decal(L, 'F', by0, w / 2, min(16.0, w - 12), 0.0, 3.0, "Janela_Escura")
    decal(L, 'F', by0, w / 2, min(18.0, w - 10), 5.8, 7.3, CA, RC['supermercado'], off=0.05)
    caixa(L, w / 2 - 9, by0 - 3.0, 3.2, w / 2 + 9, by0, 3.4, "Concreto")
    for k in range(int((w - 8) / 2.6)):
        x = 4 + k * 2.6
        for (ya, yb) in ((3.0, 8.0), (by0 - 9.5, by0 - 4.5)):
            if yb < by0 - 3:
                plano_local(L, [(x - 0.06, ya), (x + 0.06, ya), (x + 0.06, yb), (x - 0.06, yb)], 0.02, "Pintura_Branca")
    REGISTRO["postes_poi"] += [[*L.P(x, by0 * 0.5), 'alto'] for x in (w * 0.25, w * 0.75)]
    REGISTRO["marcadores"].append(["Ponto_Supermercado", *L.W(w / 2, by0 - 2.0, 0.0), L.rot + 90])
    conta("POI_supermercado")


def poi_posto(q, rr):
    L = quadro_poi(q)
    w, d = L.w, L.d
    plano_local(L, [(0.2, 0.2), (w - 0.2, 0.2), (w - 0.2, d - 0.2), (0.2, d - 0.2)], 0.01, "Cid_Concreto_Pre")
    cx0, cx1, cy0, cy1 = w / 2 - 10, w / 2 + 10, 7.0, 19.0
    caixa(L, cx0, cy0, 5.2, cx1, cy1, 6.2, "Pintura_Branca", mats={'ny': "Plastico_Vermelho", 'py': "Plastico_Vermelho",
                                                                  'nx': "Plastico_Vermelho", 'px': "Plastico_Vermelho"})
    for (x, y) in ((cx0 + 3, cy0 + 3), (cx1 - 3, cy0 + 3), (cx0 + 3, cy1 - 3), (cx1 - 3, cy1 - 3)):
        caixa(L, x - 0.3, y - 0.3, 0.0, x + 0.3, y + 0.3, 5.2, "Metal_Branco")
        colisor(L, "Cid_Pilar", x - 0.3, y - 0.3, 0.0, x + 0.3, y + 0.3, 5.2)
    for k in range(3):
        x = cx0 + 5 + k * 5
        caixa(L, x - 1.6, (cy0 + cy1) / 2 - 0.6, 0.0, x + 1.6, (cy0 + cy1) / 2 + 0.6, 0.2, "Concreto", skip=('nz',))
        inst(L, "K_Bomba", "Bomba", x, (cy0 + cy1) / 2, 0.2, 0.0)
        colisor(L, "Cid_Bomba", x - 0.6, (cy0 + cy1) / 2 - 0.4, 0.0, x + 0.6, (cy0 + cy1) / 2 + 0.4, 1.9)
    lods(L, cx0, cy0, cx1, cy1, 6.2, "Pintura_Branca", "Pintura_Branca")
    sx0, sx1, sy0, sy1 = w / 2 - 8, w / 2 + 8, cy1 + 6, min(d - 3, cy1 + 16)
    caixa(L, sx0, sy0, 0.0, sx1, sy1, 3.6, "Reboco_Branco", mats={'pz': "Concreto"}, skip=('nz',))
    colisor(L, "Cid_Conveniencia", sx0, sy0, 0.0, sx1, sy1, 3.6)
    lods(L, sx0, sy0, sx1, sy1, 3.6, "Reboco_Branco", "Concreto")
    decal(L, 'F', sy0, w / 2 - 3, 6.0, 0.0, 2.6, CA, RC['vitrine'])
    decal(L, 'F', sy0, w / 2 + 3, 4.0, 2.7, 3.5, CA, RC['lanches'], off=0.05)
    caixa(L, 2.0, 1.0, 0.0, 2.6, 1.6, 7.0, "Plastico_Vermelho")                    # totem
    colisor(L, "Cid_Totem", 2.0, 1.0, 0.0, 2.6, 1.6, 7.0)
    REGISTRO["luzes"].append(["Luz_Posto", *L.W(w / 2, (cy0 + cy1) / 2, 5.0), 300.0])
    REGISTRO["marcadores"].append(["Ponto_Posto", *L.W(w / 2, (cy0 + cy1) / 2, 0.0), L.rot + 90])
    conta("POI_posto")


def poi_bosque(q, rr):
    MM.get("Lotes", q.c.x, q.c.y).face([(p.x, p.y, ZC + 0.01) for p in q.poly_int], "Grama", facing=(0, 0, 1))
    L = quadro_poi(q)
    w, d = L.w, L.d
    pts = [(w * 0.1, 1.0), (w * 0.3, d * 0.4), (w * 0.55, d * 0.55), (w * 0.8, d * 0.45), (w * 0.95, d - 1.0)]
    for a_, b_ in zip(pts[:-1], pts[1:]):
        A_, B_ = Vector(a_), Vector(b_)
        u_ = (B_ - A_).normalized()
        n_ = Vector((-u_.y, u_.x)) * 1.1
        plano_local(L, [A_ - n_, B_ - n_, B_ + n_, A_ + n_], 0.02, "Terra_Batida")
    rb = random.Random(77)
    k = 0
    while k < 70:
        x, y = rb.uniform(2, w - 2), rb.uniform(2, d - 2)
        p = L.P(x, y)
        if not C.dentro(p, q.poly_int):
            continue
        if any(C.dist_seg(Vector((x, y)), Vector(a_), Vector(b_))[0] < 2.5 for a_, b_ in zip(pts[:-1], pts[1:])):
            continue
        REGISTRO["arvores_poi"].append([p.x, p.y, rb.choice(('a', 'b', 'b', 'ipe'))])
        k += 1
    for k in range(4):
        a_ = Vector(pts[k]).lerp(Vector(pts[k + 1]), 0.5)
        REGISTRO["bancos"].append([*L.P(a_.x + 1.8, a_.y), L.rot + 90])
    REGISTRO["marcadores"].append(["Ponto_Bosque_Conceicao", *L.W(w / 2, d / 2, 0.0), 0])
    conta("POI_bosque")


def poi_subestacao(q, rr):
    L = quadro_poi(q)
    w, d = L.w, L.d
    plano_local(L, [(0.5, 0.5), (w - 0.5, 0.5), (w - 0.5, d - 0.5), (0.5, d - 0.5)], 0.01, "Cid_Brita")
    muro_ind(L, rr, portao_larg=6.0)
    for i in range(3):
        for j in range(2):
            x, y = 10 + i * (w - 20) / 2, 14 + j * (d - 26)
            caixa(L, x - 2.0, y - 1.5, 0.0, x + 2.0, y + 1.5, 3.2, "Metal_Escuro")
            for k in range(3):
                L.m().cyl(0.12, 1.4, "Louca_Branca", segs=6, M=Matrix.Translation(Vector(L.W(x - 1.2 + k * 1.2, y, 3.2))))
            colisor(L, "Cid_Trafo", x - 2.0, y - 1.5, 0.0, x + 2.0, y + 1.5, 4.6)
    for y in (8.0, d - 8.0):                                             # portico de linhas
        for x in (5.0, w - 5.0):
            caixa(L, x - 0.25, y - 0.25, 0.0, x + 0.25, y + 0.25, 12.0, "Cid_Concreto_Pre")
            colisor(L, "Cid_Portico", x - 0.25, y - 0.25, 0.0, x + 0.25, y + 0.25, 12.0)
        caixa(L, 5.0, y - 0.2, 11.4, w - 5.0, y + 0.2, 11.8, "Metal_Escuro")
    caixa(L, w - 14, d - 10, 0.0, w - 4, d - 4, 3.2, "Reboco_Branco", mats={'pz': "Concreto"}, skip=('nz',))
    colisor(L, "Cid_Casa_Comando", w - 14, d - 10, 0.0, w - 4, d - 4, 3.2)
    lods(L, 5.0, 8.0, w - 5.0, d - 8.0, 4.6, "Metal_Escuro", "Cid_Brita")
    REGISTRO["marcadores"].append(["Ponto_Subestacao", *L.W(w / 2, -1.5, 0.0), L.rot + 90])
    conta("POI_subestacao")


def poi_ferrovia(q, rr):
    """Faixa tecnica da ferrovia junto ao limite leste: brita, trilhos, cerca de concreto do lado da rua."""
    MM.get("Lotes", q.c.x, q.c.y).face([(p.x, p.y, ZC + 0.005) for p in q.poly_int], "Cid_Brita", facing=(0, 0, 1))
    xs = [p.x for p in q.poly_int]
    ys = [p.y for p in q.poly_int]
    y0, y1 = min(ys) + 0.3, max(ys) - 0.3
    x0 = min(xs)
    m = MM.get("Lotes", q.c.x, q.c.y)
    for xr in (393.0, 396.0):                                            # dois trilhos (bitola larga) + dormentes
        for dx in (-0.8, 0.8):
            m.box((xr + dx - 0.04, y0, ZC), (xr + dx + 0.04, y1, ZC + 0.18), "Cid_Trilho", skip=('nz',))
    y = y0
    while y < y1 - 0.3:
        m.box((391.8, y, ZC), (397.2, y + 0.25, ZC + 0.08), "Madeira_Escura", skip=('nz',))
        y += 1.6
    m.box((x0 + 0.3, y0, ZC), (x0 + 0.45, y1, ZC + 2.4), "Cid_Concreto_Pre", skip=('nz',))
    C.colisor("Cid_Cerca_Ferrovia", (x0 + 0.3, y0, ZC), (x0 + 0.45, y1, ZC + 2.4), ETAPA)
    conta("POI_ferrovia")


# ============================================================== distribuicao
POIS = {(16, 186): poi_prefeitura, (62, 186): poi_terminal, (-186, 156): poi_escola, (-186, 74): poi_ubs,
        (-255, 158): poi_praca, (-53, -270): poi_lazer_olaria, (39, -271): poi_campo, (-322, -98): poi_supermercado,
        (-251, -88): poi_posto, (-101, 305): poi_bosque, (331, 305): poi_subestacao,
        (237, 96): lambda q, rr: poi_galpao_marca(q, rr, 'transportes', "Cid_Galpao_Azul", 8),
        (237, -191): lambda q, rr: poi_galpao_marca(q, rr, 'metalurgica', "Cid_Galpao", 3)}


def poi_galpao_marca(q, rr, marca, cor, docas):
    L = quadro_poi(q)
    galpao(L, rr, cor=cor, marca=marca, docas=docas)
    if marca == 'transportes':
        for k in range(5):                                               # carretas estacionadas no patio
            inst(L, "K_Carreta", "Carreta", 6.0 + k * 3.6, 6.5, 0.0, 0.0)
            colisor(L, "Cid_Carreta", 6.0 + k * 3.6 - 1.3, 0.5, 0.0, 6.0 + k * 3.6 + 1.3, 12.5, 4.0)
    else:
        L.m().cyl(0.9, 22.0, "Cid_Concreto_Pre", segs=10, r2=0.7, M=Matrix.Translation(Vector(L.W(L.w - 8.0, L.d - 10.0, 0.0))))
        colisor(L, "Cid_Chamine", L.w - 9.0, L.d - 11.0, 0.0, L.w - 7.0, L.d - 9.0, 22.0)
    REGISTRO["marcadores"].append(["Ponto_" + marca.capitalize(), *L.W(L.w / 2, 4.0, 0.0), L.rot + 90])


def kit():
    """Malhas do kit (instanciadas): bomba de combustivel, carreta."""
    if "K_Bomba" not in bpy.data.meshes:
        m = B.Mesh("K_Bomba")
        m.box((-0.45, -0.3, 0), (0.45, 0.3, 1.7), "Pintura_Branca", mats={'ny': "Plastico_Vermelho", 'py': "Plastico_Vermelho"})
        m.box((-0.5, -0.32, 1.45), (0.5, 0.32, 1.75), "Plastico_Vermelho")
        m.mesh()
    if "K_Carreta" not in bpy.data.meshes:
        m = B.Mesh("K_Carreta")
        m.box((-1.25, -6.0, 1.2), (1.25, 6.0, 4.0), "Cid_Galpao", mats={'ny': "Metal_Escuro"})
        for y in (-4.6, -3.4, 4.0):
            for x in (-1.0, 1.0):
                m.cyl(0.5, 0.35, "Borracha_Preta", segs=8, M=Matrix.Translation((x - 0.17, y, 0.5)) @ Matrix.Rotation(math.radians(90), 4, 'Y'))
        m.box((-0.15, 3.0, 0.4), (0.15, 6.0, 1.2), "Metal_Escuro")
        m.mesh()
    for k in ("K_Bomba", "K_Carreta"):
        bpy.data.meshes[k].use_fake_user = True


def borda(q):
    return any(abs(G.nos[i].x) >= C.HALF - 0.5 or abs(G.nos[i].y) >= C.HALF - 0.5 for i in q.nos)


kit()
alvo_poi = {}
for (px, py), fn in POIS.items():
    best = min((q for q in Q if not (q.externa or q.antiga or q.toda_calcada or q.ilha)), key=lambda q: (q.c.x - px) ** 2 + (q.c.y - py) ** 2)
    alvo_poi[best.id] = fn
n_lotes = 0
for q in Q:
    if q.externa or q.antiga or q.toda_calcada or q.ilha:
        continue
    rr = random.Random(9000 + q.id)
    if q.id in alvo_poi:
        alvo_poi[q.id](q, rr)
        continue
    if q.zona == "INDUSTRIAL" and q.c.x > 377:
        poi_ferrovia(q, rr)
        continue
    na_borda = borda(q)
    lotes = lotear(q, rr, dmin_borda=14.0 if na_borda and q.zona != "INDUSTRIAL" else 0.0)
    aclive = q.zona == "CONCEICAO" and rr.random() < 0.45
    for L in lotes:
        n_lotes += 1
        cls = C.VIA[L.via]['cls']
        if aclive and L.zona == "CONCEICAO":
            L.base = rr.choice((0.0, 0.45, 0.8, 1.15))
        if L.zona == "INDUSTRIAL":
            galpao(L, rr)
        elif L.zona == "CENTRO":
            sobrado_centro(L, rr)
        elif cls >= 3 or (cls >= 2 and rr.random() < 0.35):
            loja_esquina(L, rr, recuo=rr.choice((0.0, 5.0, 6.0)), placas=LOJAS_AV)
        elif L.zona == "OLARIA":
            if (L.esq[0] or L.esq[1]) and rr.random() < 0.3:
                loja_esquina(L, rr)
            else:
                casa_popular(L, rr)
        else:
            if (L.esq[0] or L.esq[1]) and rr.random() < 0.15:
                loja_esquina(L, rr)
            else:
                casa_media(L, rr)
        c = L.P(L.w / 2, L.d / 2)
        REGISTRO["lotes"].append({"setor": C.pref(*L.setor), "zona": L.zona, "via": L.via, "c": [round(c.x, 1), round(c.y, 1)],
                                  "frente": [round(L.A.x, 2), round(L.A.y, 2)], "u": [round(L.u.x, 4), round(L.u.y, 4)],
                                  "w": round(L.w, 2), "d": round(L.d, 2), "desnivel": L.base})

objs = MM.build(DEST)
for o in objs:
    o["lod"] = 1 if o.name.endswith("_LOD1") else (2 if o.name.endswith("_LOD2") else 0)
with open(os.path.join(B.EXPORT_DIR, "cidade", "cidade_lotes.json"), "w", encoding="utf-8") as f:
    json.dump(REGISTRO, f, ensure_ascii=False)
print("edificios ok: lotes %d | objetos %d | %s" % (n_lotes, len(objs), sorted(stats.items())))
