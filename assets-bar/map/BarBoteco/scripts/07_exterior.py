# Bairro ampliado (5x5 quadras jogaveis + anel externo em LOD), mobiliario urbano, fiacao, carros,
# profundidade estilo AAA (predios distantes, morros, panorama 360, sombras de contato), luzes e marcadores.
import math, random
import bpy
from mathutils import Vector, Matrix
import barlib as B

VZ, MOB, LUZ, MK, DIST = "Exterior_Vizinhanca", "Exterior_Mobiliario", "Iluminacao", "Marcadores", "Exterior_Distante"
for c in (VZ, MOB, LUZ, MK, DIST):
    B.coll(c)
B.clear(VZ, MOB, LUZ, MK, DIST)
B.clear_colliders("Viz")
B.clear_colliders("Ext")
ZC, ZP, ZP2 = B.Z_CALCADA, B.Z_PISO, B.Z_PISO2
RING = 3
q = B.quadra
rnd = random.Random(2026)
CORES = ["Reboco_Branco", "Reboco_Creme", "Reboco_Azul", "Reboco_Verde", "Reboco_Rosa", "Reboco_Ocre", "Reboco_Branco"]
AT = "Atlas_Bairro"
RG = {  # regioes do atlas do bairro (pixels, origem no topo)
    'J': [(0, 0, 128, 128), (128, 0, 256, 128), (256, 0, 384, 128), (384, 0, 512, 128)],
    'porta': (512, 0, 640, 256), 'porta_ferro': (640, 0, 768, 256), 'garagem': (768, 0, 1024, 256),
    'padaria': (0, 256, 512, 384), 'farmacia': (512, 256, 1024, 384), 'mercadinho': (0, 384, 512, 512),
    'acougue': (512, 384, 1024, 512), 'oficina': (0, 512, 512, 640), 'lavarapido': (512, 512, 1024, 640),
    'escola': (0, 640, 1024, 768), 'bardoze': (0, 768, 512, 896), 'praca': (768, 896, 1024, 1024),
}
LOJAS = ['padaria', 'farmacia', 'mercadinho', 'acougue', 'bardoze', 'lavarapido', 'oficina']

# ---------------------------------------------------------------- construtores por quadra (chunks)
_meshes = {}


def mesh(kind, i, j):
    k = (kind, i, j)
    if k not in _meshes:
        _meshes[k] = B.Mesh("%s_%d_%d" % (kind, i, j))
    return _meshes[k]


def sombra_blob(i, j, x, y, z, rx, ry, rot=0.0):
    m = mesh("Sombras", i, j)
    a = math.radians(rot)
    ca, sa = math.cos(a), math.sin(a)
    pts = [(x + u * rx * ca - v * ry * sa, y + u * rx * sa + v * ry * ca, z + 0.012) for (u, v) in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    m.face(pts, "Sombra_Contato", uvs=[(0.0, 0.0), (0.5, 0.0), (0.5, 1.0), (0.0, 1.0)], facing=(0, 0, 1))


def sombra_faixa(i, j, p0, p1, nrm, z, w=0.45):
    """Faixa de oclusao (AO) no chao ao longo da base de uma parede; nrm aponta para fora da parede."""
    m = mesh("Sombras", i, j)
    a, b_ = Vector((p0[0], p0[1], z + 0.012)), Vector((p1[0], p1[1], z + 0.012))
    n = Vector((nrm[0], nrm[1], 0)).normalized() * w
    m.face([a, b_, b_ + n, a + n], "Sombra_Contato", uvs=[(0.5, 0), (0.5, 1), (1.0, 1), (1.0, 0)], facing=(0, 0, 1))


def decal(m, fac, plano, c, w, za, zb, mat, reg=None, off=0.02):
    """Quad na fachada fac ('S','N','W','E') do plano dado; reg = regiao do atlas (UV)."""
    uv = None
    if reg:
        u0, v0, u1, v1 = B.arect(*reg)
        uv = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    if fac == 'S':
        y = plano - off
        pts = [(c - w / 2, y, za), (c + w / 2, y, za), (c + w / 2, y, zb), (c - w / 2, y, zb)]
    elif fac == 'N':
        y = plano + off
        pts = [(c + w / 2, y, za), (c - w / 2, y, za), (c - w / 2, y, zb), (c + w / 2, y, zb)]
    elif fac == 'W':
        x = plano - off
        pts = [(x, c + w / 2, za), (x, c - w / 2, za), (x, c - w / 2, zb), (x, c + w / 2, zb)]
    else:
        x = plano + off
        pts = [(x, c - w / 2, za), (x, c + w / 2, za), (x, c + w / 2, zb), (x, c - w / 2, zb)]
    m.face(pts, mat, uvs=uv)


def telhado_4aguas(b, x0, y0, x1, y1, z, h, o=0.45):
    X0, X1, Y0, Y1 = x0 - o, x1 + o, y0 - o, y1 + o
    zt = z + h
    if (X1 - X0) >= (Y1 - Y0):
        d = (Y1 - Y0) / 2; ym = (Y0 + Y1) / 2
        b.roof_face([(X0, Y0, z), (X1, Y0, z), (X1 - d, ym, zt), (X0 + d, ym, zt)], "Telha", (1, 0, 0))
        b.roof_face([(X1, Y1, z), (X0, Y1, z), (X0 + d, ym, zt), (X1 - d, ym, zt)], "Telha", (1, 0, 0))
        b.roof_face([(X0, Y1, z), (X0, Y0, z), (X0 + d, ym, zt)], "Telha", (0, 1, 0))
        b.roof_face([(X1, Y0, z), (X1, Y1, z), (X1 - d, ym, zt)], "Telha", (0, 1, 0))
    else:
        d = (X1 - X0) / 2; xm = (X0 + X1) / 2
        b.roof_face([(X0, Y1, z), (X0, Y0, z), (xm, Y0 + d, zt), (xm, Y1 - d, zt)], "Telha", (0, 1, 0))
        b.roof_face([(X1, Y0, z), (X1, Y1, z), (xm, Y1 - d, zt), (xm, Y0 + d, zt)], "Telha", (0, 1, 0))
        b.roof_face([(X0, Y0, z), (X1, Y0, z), (xm, Y0 + d, zt)], "Telha", (1, 0, 0))
        b.roof_face([(X1, Y1, z), (X0, Y1, z), (xm, Y1 - d, zt)], "Telha", (1, 0, 0))
    for (p, q_) in (((X0, Y0), (X1, Y0)), ((X1, Y0), (X1, Y1)), ((X1, Y1), (X0, Y1)), ((X0, Y1), (X0, Y0))):
        b.face([(p[0], p[1], z - 0.12), (q_[0], q_[1], z - 0.12), (q_[0], q_[1], z), (p[0], p[1], z)], "Madeira_Escura",
               away=((X0 + X1) / 2, (Y0 + Y1) / 2, z))                  # testeira do beiral
    b.face([(X0, Y0, z - 0.12), (X1, Y0, z - 0.12), (X1, Y1, z - 0.12), (X0, Y1, z - 0.12)], "Reboco_Branco", facing=(0, 0, -1))


def fachada_janelas(m, fac, plano, a0, a1, z0, andares, rr, porta_c=None, garagem_c=None):
    """Distribui janelas texturizadas ao longo da fachada (a0..a1 = intervalo na direcao da fachada)."""
    larg = a1 - a0
    n = max(1, int(larg / 2.6))
    var = rr.choice(RG['J'])
    for k in range(n):
        c = a0 + larg * (k + 0.5) / n
        for f in range(andares):
            za = z0 + 1.0 + f * 2.8
            livre = all(abs(c - x) > 1.3 for x in (porta_c, garagem_c) if x is not None) or f > 0
            if livre:
                wj = 1.2 if rr.random() < 0.7 else 1.5
                decal(m, fac, plano, c, wj, za, za + 1.15, AT, var)
                decal(m, fac, plano, c, wj + 0.12, za - 0.06, za, "Concreto", None, off=0.04)      # peitoril
    if porta_c is not None:
        decal(m, fac, plano, porta_c, 0.95, z0, z0 + 2.15, AT, RG['porta'] if rr.random() < 0.7 else RG['porta_ferro'])
    if garagem_c is not None:
        decal(m, fac, plano, garagem_c, 2.8, z0, z0 + 2.3, AT, RG['garagem'])


def casa(i, j, lote, fac, rr, lod=False, esquina=None):
    """Casa num lote (x0, x1, y0, y1); fac = lado da rua ('S' ou 'N'); esquina = 'W'/'E' se for lote de esquina."""
    x0, x1, y0, y1 = lote
    m = mesh("Viz_Casas", i, j)
    mu = mesh("Viz_Muros", i, j)
    wl = x1 - x0
    recuo = rr.uniform(2.2, 4.0)
    gl = 0.0 if rr.random() < 0.4 else rr.uniform(0.4, 1.2)
    gr = 0.0 if rr.random() < 0.4 else rr.uniform(0.4, 1.2)
    if esquina == 'W':
        gl = max(gl, 1.5)
    if esquina == 'E':
        gr = max(gr, 1.5)
    prof = min(rr.uniform(7.5, 10.0), (y1 - y0) - recuo - 0.6)
    andares = 2 if rr.random() < 0.3 else 1
    h = 2.95 if andares == 1 else 5.75
    cor = rr.choice(CORES)
    hx0, hx1 = x0 + gl, x1 - gr
    if fac == 'S':
        hy0, hy1 = y0 + recuo, y0 + recuo + prof
        frente_y, muro_y = hy0, y0
    else:
        hy1, hy0 = y1 - recuo, y1 - recuo - prof
        frente_y, muro_y = hy1, y1
    z1 = ZC + h
    plana = rr.random() < 0.38
    m.box((hx0, hy0, ZC), (hx1, hy1, z1), cor, skip=('nz',) if plana else ('nz', 'pz'))
    if not lod:
        B.add_collider("Viz_Casa", (hx0, hy0, ZC), (hx1, hy1, z1))
    if plana:
        m.box((hx0 - 0.05, hy0 - 0.05, z1), (hx1 + 0.05, hy1 + 0.05, z1 + 0.5), cor, mats={'pz': "Concreto"}, skip=('nz',))
        if not lod:
            B.inst("P_Caixa_Agua_Casa", "Caixa_Agua_Casa", MOB, (hx0 + 1.4, (hy0 + hy1) / 2, z1 + 0.5), rr.uniform(0, 90))
            if rr.random() < 0.35:
                B.inst("P_Antena", "Antena", MOB, (hx1 - 1.0, (hy0 + hy1) / 2, z1 + 0.5), rr.uniform(0, 360))
    else:
        telhado_4aguas(m, hx0, hy0, hx1, hy1, z1, rr.uniform(1.1, 1.7))
        if not lod and rr.random() < 0.25:
            B.inst("P_Antena", "Antena", MOB, ((hx0 + hx1) / 2, (hy0 + hy1) / 2, z1 + 0.6), rr.uniform(0, 360))
    garagem = wl >= 9.0 and andares == 1 and rr.random() < 0.7
    gc = (hx1 - 1.9) if garagem else None
    pc = hx0 + 1.3
    if lod:
        for k in range(2):
            decal(m, fac, frente_y, hx0 + (hx1 - hx0) * (k + 0.5) / 2, 1.3, ZC + 1.0, ZC + 2.1, AT, RG['J'][rr.randrange(4)])
        return
    fachada_janelas(m, fac, frente_y, hx0 + 0.4, hx1 - 0.4, ZC, andares, rr, porta_c=pc, garagem_c=gc)
    if esquina:                                   # fachada lateral voltada para a rua transversal
        xs = hx0 if esquina == 'W' else hx1
        fachada_janelas(m, esquina, xs, hy0 + 0.6, hy1 - 0.6, ZC, andares, rr)
    if rr.random() < 0.35:
        B.inst("P_AC", "Ar_Condicionado", MOB, ((hx0 + hx1) / 2 + rr.uniform(-1, 1), frente_y + (-0.0 if fac == 'S' else 0.0), ZC + 2.3 + (2.8 if andares == 2 else 0)),
               0.0 if fac == 'S' else 180.0)
    # muro da frente com portao social e de garagem (abertos na geometria, fechados com portao)
    hm = rr.uniform(1.6, 2.1)
    cm = rr.choice(CORES)
    s_porta = (pc - 0.6 - x0, pc + 0.6 - x0)
    abert = [s_porta] + ([(gc - 1.5 - x0, gc + 1.5 - x0)] if gc else [])
    if fac == 'S':
        Mm = mu.wall((x0, muro_y), (x1, muro_y), ZC, ZC + hm, 0.15, cm, cm, mat_e="Concreto", cut_ends=False, name="Viz_Muro",
                     openings=[(a, b_, ZC, ZC + hm) for (a, b_) in sorted(abert)])
    else:
        Mm = mu.wall((x1, muro_y), (x0, muro_y), ZC, ZC + hm, 0.15, cm, cm, mat_e="Concreto", cut_ends=False, name="Viz_Muro",
                     openings=[(wl - b_, wl - a, ZC, ZC + hm) for (a, b_) in sorted(abert)])
    for (a, b_) in abert:
        s0, s1 = (a, b_) if fac == 'S' else (wl - b_, wl - a)
        reg = RG['garagem']
        u0, v0, u1, v1 = B.arect(*reg)
        mu.box((s0, 0.05, ZC + 0.02), (s1, 0.10, ZC + hm - 0.05), "Portao_Verde", M=Mm,
               mats={'ny': AT, 'py': AT}, uvrects={'ny': (u0, v0, u1, v1), 'py': (u0, v0, u1, v1)})
        B.add_collider("Viz_Portao", (s0, 0.0, ZC), (s1, 0.15, ZC + hm), Mm)
    nrm_rua = (0, -1) if fac == 'S' else (0, 1)
    sombra_faixa(i, j, (x0, muro_y + (0 if fac == 'S' else 0)), (x1, muro_y), nrm_rua, ZC, 0.35)
    sombra_faixa(i, j, (hx0, frente_y), (hx1, frente_y), nrm_rua, ZC, 0.5)
    # muros laterais (divisas) ate a casa
    if fac == 'S':
        mu.box((x0, y0 + 0.15, ZC), (x0 + 0.12, hy0, ZC + hm), cm, skip=('nz',))
    else:
        mu.box((x0, hy1, ZC), (x0 + 0.12, y1 - 0.15, ZC + hm), cm, skip=('nz',))


def loja(i, j, lote, fac, tipo, rr, esquina=None, andares=1):
    """Comercio de esquina: sem recuo, portas de enrolar, placa e toldo."""
    x0, x1, y0, y1 = lote
    m = mesh("Viz_Casas", i, j)
    prof = min(11.0, (y1 - y0) - 1.0)
    h = 3.8 if andares == 1 else 6.4
    if fac == 'S':
        hy0, hy1, fy = y0 + 0.15, y0 + 0.15 + prof, y0 + 0.15
    else:
        hy1, hy0, fy = y1 - 0.15, y1 - 0.15 - prof, y1 - 0.15
    cor = rr.choice(["Reboco_Creme", "Reboco_Branco", "Reboco_Ocre", "Reboco_Azul"])
    m.box((x0 + 0.1, hy0, ZC), (x1 - 0.1, hy1, ZC + h), cor, skip=('nz',))
    m.box((x0 + 0.05, hy0 - 0.05, ZC + h), (x1 - 0.05, hy1 + 0.05, ZC + h + 0.5), cor, mats={'pz': "Concreto"}, skip=('nz',))
    B.add_collider("Viz_Loja", (x0 + 0.1, hy0, ZC), (x1 - 0.1, hy1, ZC + h))
    larg = x1 - x0 - 0.6
    n = max(1, int(larg / 3.4))
    for k in range(n):
        c = x0 + 0.3 + larg * (k + 0.5) / n
        decal(m, fac, fy, c, 2.9, ZC, ZC + 2.6, "Metal_Ondulado" if k % 2 else "Janela_Escura")
        decal(m, fac, fy, c, 3.0, ZC + 2.6, ZC + 2.75, "Metal_Escuro", off=0.03)
    cx = (x0 + x1) / 2
    decal(m, fac, fy, cx, min(larg, 6.0), ZC + 2.85, ZC + 3.55, AT, RG[tipo], off=0.06)
    if andares == 2:
        fachada_janelas(m, fac, fy, x0 + 0.5, x1 - 0.5, ZC + 2.8, 1, rr)
    sgn = -1 if fac == 'S' else 1
    to = mesh("Viz_Casas", i, j)                                   # toldo
    ya, yb = fy, fy + sgn * 1.2
    to.face([(x0 + 0.4, ya, ZC + 2.75), (x1 - 0.4, ya, ZC + 2.75), (x1 - 0.4, yb, ZC + 2.45), (x0 + 0.4, yb, ZC + 2.45)],
            "Plastico_Vermelho" if tipo in ('acougue', 'bardoze') else "Caixa_Agua", facing=(0, 0, 1))
    to.face([(x0 + 0.4, ya, ZC + 2.74), (x1 - 0.4, ya, ZC + 2.74), (x1 - 0.4, yb, ZC + 2.44), (x0 + 0.4, yb, ZC + 2.44)],
            "Plastico_Vermelho" if tipo in ('acougue', 'bardoze') else "Caixa_Agua", facing=(0, 0, -1))
    if esquina:
        xs = x0 + 0.1 if esquina == 'W' else x1 - 0.1
        for k in range(2):
            c = hy0 + (hy1 - hy0) * (k + 0.5) / 2
            decal(m, esquina, xs, c, 2.6, ZC, ZC + 2.6, "Metal_Ondulado")
    sombra_faixa(i, j, (x0, fy), (x1, fy), (0, sgn), ZC, 0.5)
    B.inst("P_Caixa_Agua_Casa", "Caixa_Agua_Casa", MOB, (x1 - 1.6, (hy0 + hy1) / 2, ZC + h + 0.5), 0)


def quadra_residencial(i, j, rr, lod=False, forcar=None, excluir_x=None):
    """forcar: {(lado, indice_do_lote): tipo_de_loja} (indice negativo conta do fim); excluir_x: (xa, xb) sem casas."""
    x0, x1, y0, y1 = q(i, j)
    lx0, lx1, ly0, ly1 = x0 + 3, x1 - 3, y0 + 3, y1 - 3
    meio = (ly0 + ly1) / 2
    forcar = forcar or {}
    for fac in ('S', 'N'):
        larguras, tot = [], lx1 - lx0
        while tot > 0.01:
            w = rr.uniform(7.5, 11.0)
            if tot - w < 7.5:
                w = tot
            larguras.append(w); tot -= w
        x = lx0
        for k, w in enumerate(larguras):
            lote = (x, x + w, ly0, meio) if fac == 'S' else (x, x + w, meio, ly1)
            esq = 'W' if k == 0 else ('E' if k == len(larguras) - 1 else None)
            if excluir_x and x < excluir_x[1] and x + w > excluir_x[0]:
                x += w; continue
            tipo = forcar.get((fac, k)) or forcar.get((fac, k - len(larguras)))
            if tipo is None and not lod and esq and rr.random() < 0.15:
                tipo = rr.choice(LOJAS)
            if tipo and not lod:
                loja(i, j, lote, fac, tipo, rr, esquina=esq, andares=2 if rr.random() < 0.4 else 1)
            else:
                casa(i, j, lote, fac, rr, lod=lod, esquina=esq)
            x += w


# ---------------------------------------------------------------- quadras especiais
def praca(i, j):
    x0, x1, y0, y1 = q(i, j)
    lx0, lx1, ly0, ly1 = x0 + 3, x1 - 3, y0 + 3, y1 - 3
    m = mesh("Praca", i, j)
    cx, cy = (lx0 + lx1) / 2, (ly0 + ly1) / 2
    m.face([(lx0, ly0, ZC), (lx1, ly0, ZC), (lx1, ly1, ZC), (lx0, ly1, ZC)], "Pedra_Portuguesa", facing=(0, 0, 1))
    canteiros = [(lx0 + 2, cx - 4.5, ly0 + 2, cy - 4.0), (cx + 4.5, lx1 - 2, ly0 + 2, cy - 4.0),
                 (lx0 + 2, cx - 4.5, cy + 4.0, ly1 - 2), (cx + 4.5, lx1 - 2, cy + 4.0, ly1 - 2)]
    for (a0, a1, b0, b1) in canteiros:
        m.box((a0, b0, ZC), (a1, b1, ZC + 0.18), "Concreto", mats={'pz': "Grama"}, skip=('nz',))
        B.add_collider("Ext_Canteiro", (a0, b0, ZC), (a1, b1, ZC + 0.18))
        for k in range(3):
            tx, ty = rnd.uniform(a0 + 2, a1 - 2), rnd.uniform(b0 + 1.8, b1 - 1.8)
            B.inst(rnd.choice(("P_Arvore_A", "P_Arvore_B", "P_Arvore_Ipe")), "Arvore_Praca", MOB, (tx, ty, ZC + 0.18), rnd.uniform(0, 360))
            sombra_blob(i, j, tx, ty, ZC + 0.18, 2.3, 2.3)
            B.add_collider("Ext_Arvore", (tx - 0.15, ty - 0.15, ZC), (tx + 0.15, ty + 0.15, ZC + 2.5))
        for (bx, by, r) in ((a0 + (a1 - a0) / 2, b0 - 0.6, 180), (a0 + (a1 - a0) / 2, b1 + 0.6, 0)):
            B.inst("P_Banco_Praca", "Banco_Praca", MOB, (bx, by, ZC), r)
            sombra_blob(i, j, bx, by, ZC, 1.1, 0.5, r)
    # coreto octogonal no centro
    co = mesh("Praca", i, j)
    R_, n = 3.6, 8
    ring = [(cx + R_ * math.cos(2 * math.pi * k / n + math.pi / 8), cy + R_ * math.sin(2 * math.pi * k / n + math.pi / 8)) for k in range(n)]
    co.prism(ring, ZC, ZC + 0.7, "Concreto", top_mat="Piso_Ceramico")
    B.add_collider("Ext_Coreto", (cx - 3.3, cy - 3.3, ZC), (cx + 3.3, cy + 3.3, ZC + 0.7))
    for k, (px, py) in enumerate(ring):
        ix, iy = cx + (px - cx) * 0.93, cy + (py - cy) * 0.93
        co.cyl(0.11, 2.9, "Metal_Branco", segs=8, M=B.mat_rz((ix, iy, ZC + 0.7)))
        nx_, ny_ = ring[(k + 1) % n]
        jx, jy = cx + (nx_ - cx) * 0.93, cy + (ny_ - cy) * 0.93
        if k != 5:                                             # vao de entrada voltado para o sul (escada)
            co.tube((ix, iy, ZC + 1.6), (jx, jy, ZC + 1.6), 0.03, "Metal_Branco", segs=5)
            B.add_collider("Ext_Coreto_GC", (min(ix, jx) - 0.04, min(iy, jy) - 0.04, ZC + 0.7),
                           (max(ix, jx) + 0.04, max(iy, jy) + 0.04, ZC + 1.65))
    topo = (cx, cy, ZC + 5.3)
    rr_ = [(cx + (px - cx) * 1.15, cy + (py - cy) * 1.15) for (px, py) in ring]
    for k in range(n):
        a, b_ = rr_[k], rr_[(k + 1) % n]
        co.roof_face([(a[0], a[1], ZC + 3.6), (b_[0], b_[1], ZC + 3.6), topo], "Telha", (b_[0] - a[0], b_[1] - a[1], 0))
    co.face([(x, y, ZC + 3.6) for (x, y) in reversed(rr_)], "Forro", facing=(0, 0, -1))
    co.prism([(cx - 1.2, cy - 4.3), (cx + 1.2, cy - 4.3), (cx + 1.2, cy - 3.4), (cx - 1.2, cy - 3.4)], ZC, ZC + 0.35, "Concreto")
    sombra_blob(i, j, cx, cy, ZC, 4.6, 4.6)
    # luminarias da praca
    lp = mesh("Praca", i, j)
    for (lx, ly) in ((cx - 7, cy), (cx + 7, cy), (cx, cy - 7.5), (cx, cy + 7.5), (lx0 + 1, ly0 + 1), (lx1 - 1, ly1 - 1), (lx0 + 1, ly1 - 1), (lx1 - 1, ly0 + 1)):
        lp.cyl(0.06, 3.6, "Metal_Escuro", segs=8, M=B.mat_rz((lx, ly, ZC)))
        lp.sphere("Lampada", B.mat_rz((lx, ly, ZC + 3.8), scale=(0.22, 0.22, 0.22)), subdiv=1)
        B.add_collider("Ext_Luminaria", (lx - 0.08, ly - 0.08, ZC), (lx + 0.08, ly + 0.08, ZC + 3.6))
    B.inst("P_Banca_Jornal", "Banca_Jornal", MOB, (lx0 + 2.2, ly0 + 1.8, ZC), 0)
    B.add_collider("Ext_Banca", (lx0 + 0.8, ly0 + 0.2, ZC), (lx0 + 3.6, ly0 + 2.9, ZC + 2.6))
    pl = mesh("Praca", i, j)
    pl.box((cx - 1.2, ly0 + 0.3, ZC), (cx + 1.2, ly0 + 0.45, ZC + 1.2), "Concreto",
           mats={'ny': AT}, uvrects={'ny': B.arect(*RG['praca'])})
    return (cx, cy)


def igreja(i, j):
    x0, x1, y0, y1 = q(i, j)
    lx0, lx1, ly0 = x0 + 3, x1 - 3, y0 + 3
    m = mesh("Igreja", i, j)
    cx = (lx0 + lx1) / 2
    ax0, ax1, ay0, ay1 = cx - 7, cx + 7, ly0 + 5, ly0 + 26
    hn = 9.0
    m.box((ax0, ay0, ZC), (ax1, ay1, ZC + hn), "Reboco_Branco", skip=('nz', 'pz'))
    B.add_collider("Viz_Igreja", (ax0, ay0, ZC), (ax1, ay1, ZC + hn))
    zr = ZC + hn + 4.2
    m.roof_face([(ax0 - 0.4, ay0 - 0.3, ZC + hn), (ax0 - 0.4, ay1 + 0.3, ZC + hn), (cx, ay1 + 0.3, zr), (cx, ay0 - 0.3, zr)], "Telha", (0, 1, 0))
    m.roof_face([(ax1 + 0.4, ay1 + 0.3, ZC + hn), (ax1 + 0.4, ay0 - 0.3, ZC + hn), (cx, ay0 - 0.3, zr), (cx, ay1 + 0.3, zr)], "Telha", (0, 1, 0))
    for y in (ay0, ay1):
        m.face([(ax0, y, ZC + hn), (ax1, y, ZC + hn), (cx, y, zr - 0.3)], "Reboco_Branco", facing=(0, -1 if y == ay0 else 1, 0))
    # torre central com sino e cruz
    t0, t1 = cx - 2.2, cx + 2.2
    m.box((t0, ay0 - 3.4, ZC), (t1, ay0 + 0.6, ZC + 20.0), "Reboco_Branco", skip=('nz',))
    B.add_collider("Viz_Igreja", (t0, ay0 - 3.4, ZC), (t1, ay0 + 0.6, ZC + 20.0))
    for z in (ZC + 9.5, ZC + 19.6):
        m.box((t0 - 0.12, ay0 - 3.52, z), (t1 + 0.12, ay0 + 0.72, z + 0.35), "Reboco_Azul")
    for fac, pl_ in (('S', ay0 - 3.4), ('N', ay0 + 0.6)):
        decal(m, fac, pl_, cx, 1.6, ZC + 15.8, ZC + 18.6, "Janela_Escura")
    for fac, pl_ in (('W', t0), ('E', t1)):
        decal(m, fac, pl_, ay0 - 1.4, 1.6, ZC + 15.8, ZC + 18.6, "Janela_Escura")
    apex = (cx, ay0 - 1.4, ZC + 25.0)
    base = [(t0 - 0.1, ay0 - 3.5), (t1 + 0.1, ay0 - 3.5), (t1 + 0.1, ay0 + 0.7), (t0 - 0.1, ay0 + 0.7)]
    for k in range(4):
        a, b_ = base[k], base[(k + 1) % 4]
        m.face([(a[0], a[1], ZC + 20.35), (b_[0], b_[1], ZC + 20.35), apex], "Reboco_Azul", away=(cx, ay0 - 1.4, ZC + 20.4))
    m.box((cx - 0.06, ay0 - 1.46, ZC + 25.0), (cx + 0.06, ay0 - 1.34, ZC + 26.8), "Plastico_Amarelo")
    m.box((cx - 0.45, ay0 - 1.46, ZC + 26.0), (cx + 0.45, ay0 - 1.34, ZC + 26.12), "Plastico_Amarelo")
    decal(m, 'S', ay0 - 3.4, cx, 2.0, ZC, ZC + 3.4, AT, RG['porta'])
    for xw in (ax0 + 2.0, ax1 - 2.0):
        decal(m, 'S', ay0, xw, 1.2, ZC + 3.0, ZC + 6.0, "Janela_Escura")
    for fac, pl_ in (('W', ax0), ('E', ax1)):
        for k in range(5):
            decal(m, fac, pl_, ay0 + 2.5 + k * 4.0, 1.1, ZC + 3.0, ZC + 6.4, "Janela_Escura")
    # adro (escadaria e patio)
    m.prism([(t0 - 3, ly0 + 0.2), (t1 + 3, ly0 + 0.2), (t1 + 3, ay0 - 3.4), (t0 - 3, ay0 - 3.4)], ZC, ZC + 0.3, "Concreto",
            top_mat="Pedra_Portuguesa")
    B.add_collider("Viz_Adro", (t0 - 3, ly0 + 0.2, ZC), (t1 + 3, ay0 - 3.4, ZC + 0.3))
    sombra_faixa(i, j, (ax0, ay0), (t0, ay0), (0, -1), ZC, 0.6)
    sombra_faixa(i, j, (t1, ay0), (ax1, ay0), (0, -1), ZC, 0.6)


def campinho(i, j):
    x0, x1, y0, y1 = q(i, j)
    lx0, lx1, ly0, ly1 = x0 + 3, x1 - 3, y0 + 3, y1 - 3
    m = mesh("Campinho", i, j)
    m.face([(lx0, ly0, ZC), (lx1, ly0, ZC), (lx1, ly1, ZC), (lx0, ly1, ZC)], "Grama", facing=(0, 0, 1))
    fx0, fx1, fy0, fy1 = lx0 + 3, lx1 - 3, ly0 + 4, ly1 - 3
    m.face([(fx0, fy0, ZC + 0.01), (fx1, fy0, ZC + 0.01), (fx1, fy1, ZC + 0.01), (fx0, fy1, ZC + 0.01)], "Terra_Batida", facing=(0, 0, 1))
    zl = ZC + 0.016
    for (a, b_, c, d) in ((fx0 + 0.5, fy0 + 0.5, fx1 - 0.5, fy0 + 0.6), (fx0 + 0.5, fy1 - 0.6, fx1 - 0.5, fy1 - 0.5),
                          (fx0 + 0.5, fy0 + 0.5, fx0 + 0.6, fy1 - 0.5), (fx1 - 0.6, fy0 + 0.5, fx1 - 0.5, fy1 - 0.5),
                          ((fx0 + fx1) / 2 - 0.05, fy0 + 0.5, (fx0 + fx1) / 2 + 0.05, fy1 - 0.5)):
        m.face([(a, b_, zl), (c, b_, zl), (c, d, zl), (a, d, zl)], "Pintura_Branca", facing=(0, 0, 1))
    cxm, cym = (fx0 + fx1) / 2, (fy0 + fy1) / 2
    circ = [(cxm + 3.0 * math.cos(2 * math.pi * k / 24), cym + 3.0 * math.sin(2 * math.pi * k / 24)) for k in range(25)]
    for k in range(24):
        a, b_ = circ[k], circ[k + 1]
        nrm = Vector((b_[1] - a[1], -(b_[0] - a[0]), 0)).normalized() * 0.1
        m.face([(a[0], a[1], zl), (b_[0], b_[1], zl), (b_[0] + nrm.x, b_[1] + nrm.y, zl), (a[0] + nrm.x, a[1] + nrm.y, zl)],
               "Pintura_Branca", facing=(0, 0, 1))
    B.inst("P_Trave", "Trave", MOB, (fx0 + 0.6, cym, ZC), 180)
    B.inst("P_Trave", "Trave", MOB, (fx1 - 0.6, cym, ZC), 0)
    for (tx, rot) in ((fx0 + 0.6, 180), (fx1 - 0.6, 0)):
        B.add_collider("Ext_Trave", (tx - 0.06, cym - 1.56, ZC), (tx + 0.06, cym - 1.44, ZC + 2.0))
        B.add_collider("Ext_Trave", (tx - 0.06, cym + 1.44, ZC), (tx + 0.06, cym + 1.56, ZC + 2.0))
    # alambrado (postes + travessas) em volta do campo
    al = mesh("Campinho", i, j)
    per = [(fx0 - 0.8, fy0 - 0.8), (fx1 + 0.8, fy0 - 0.8), (fx1 + 0.8, fy1 + 0.8), (fx0 - 0.8, fy1 + 0.8)]
    for k in range(4):
        a, b_ = Vector(per[k]), Vector(per[(k + 1) % 4])
        if k == 0:
            a = a + Vector((3.2, 0))                         # portao do alambrado (canto sudoeste)
        L = (b_ - a).length
        n = int(L / 3.0)
        for s in range(n + 1):
            p = a.lerp(b_, s / n)
            al.cyl(0.04, 3.2, "Metal_Escuro", segs=6, M=B.mat_rz((p.x, p.y, ZC)), caps=(False, True))
        for z in (ZC + 1.0, ZC + 3.15):
            al.tube((a.x, a.y, z), (b_.x, b_.y, z), 0.025, "Metal_Escuro", segs=4)
        B.add_collider("Ext_Alambrado", (min(a.x, b_.x) - 0.05, min(a.y, b_.y) - 0.05, ZC), (max(a.x, b_.x) + 0.05, max(a.y, b_.y) + 0.05, ZC + 3.2))
    # arquibancada de concreto
    for k in range(4):
        al.box((cxm - 8, ly0 + 0.2 + k * 0.7, ZC), (cxm + 8, ly0 + 0.9 + k * 0.7, ZC + 0.45 * (4 - k)), "Concreto", skip=('nz',))
    B.add_collider("Ext_Arquibancada", (cxm - 8, ly0 + 0.2, ZC), (cxm + 8, ly0 + 3.0, ZC + 1.8))
    for (tx, ty) in ((lx0 + 1.5, ly1 - 1.5), (lx1 - 1.5, ly1 - 1.5), (lx0 + 1.5, ly0 + 1.5), (lx1 - 1.5, ly0 + 1.5)):
        B.inst("P_Arvore_B", "Arvore_Campinho", MOB, (tx, ty, ZC), rnd.uniform(0, 360))
        sombra_blob(i, j, tx, ty, ZC, 2.4, 2.4)
    return (cxm, cym)


def escola(i, j):
    x0, x1, y0, y1 = q(i, j)
    lx0, lx1, ly0, ly1 = x0 + 3, x1 - 3, y0 + 3, y1 - 3
    mu = mesh("Escola", i, j)
    for (p0, p1) in (((lx0, ly0), (lx1, ly0)), ((lx1, ly0), (lx1, ly1)), ((lx1, ly1), (lx0, ly1))):
        mu.wall(p0, p1, ZC, ZC + 2.3, 0.2, "Reboco_Azul", "Reboco_Branco", mat_e="Concreto", cut_ends=False, name="Viz_Muro_Escola")
    Mw = mu.wall((lx0, ly1), (lx0, ly0), ZC, ZC + 2.3, 0.2, "Reboco_Azul", "Reboco_Branco", mat_e="Concreto", cut_ends=False,
                 name="Viz_Muro_Escola", openings=[(10.0, 14.0, ZC, ZC + 2.3)])
    mu.box((lx0 - 0.25, ly1 - 15.6, ZC + 2.3), (lx0 + 0.25, ly1 - 8.4, ZC + 3.4), "Reboco_Azul", mats={'nx': AT},
           uvrects={'nx': B.arect(*RG['escola'])})
    # predio em L, 2 pavimentos
    m = mesh("Escola", i, j)
    blocos = [(lx0 + 12, lx1 - 1, ly1 - 9, ly1 - 1), (lx1 - 9, lx1 - 1, ly0 + 1, ly1 - 9)]
    for (a0, a1, b0, b1) in blocos:
        m.box((a0, b0, ZC), (a1, b1, ZC + 6.4), "Reboco_Branco", skip=('nz',))
        m.box((a0 - 0.1, b0 - 0.1, ZC + 6.4), (a1 + 0.1, b1 + 0.1, ZC + 6.9), "Reboco_Azul", skip=('nz',))
        B.add_collider("Viz_Escola", (a0, b0, ZC), (a1, b1, ZC + 6.4))
    a0, a1, b0, b1 = blocos[0]
    for k in range(int((a1 - a0) / 2.4)):
        c = a0 + 1.2 + k * 2.4
        for f in range(2):
            decal(m, 'S', b0, c, 1.6, ZC + 1.1 + f * 3.1, ZC + 2.4 + f * 3.1, AT, RG['J'][3])
    a0, a1, b0, b1 = blocos[1]
    for k in range(int((b1 - b0) / 2.4)):
        c = b0 + 1.2 + k * 2.4
        for f in range(2):
            decal(m, 'W', a0, c, 1.6, ZC + 1.1 + f * 3.1, ZC + 2.4 + f * 3.1, AT, RG['J'][3])
    # quadra poliesportiva
    qx0, qx1, qy0, qy1 = lx0 + 3, lx0 + 21, ly0 + 2, ly0 + 13
    m.face([(qx0, qy0, ZC + 0.01), (qx1, qy0, ZC + 0.01), (qx1, qy1, ZC + 0.01), (qx0, qy1, ZC + 0.01)], "Caixa_Agua", facing=(0, 0, 1))
    zl = ZC + 0.016
    for (a, b_, c, d) in ((qx0 + 0.4, qy0 + 0.4, qx1 - 0.4, qy0 + 0.5), (qx0 + 0.4, qy1 - 0.5, qx1 - 0.4, qy1 - 0.4),
                          (qx0 + 0.4, qy0 + 0.4, qx0 + 0.5, qy1 - 0.4), (qx1 - 0.5, qy0 + 0.4, qx1 - 0.4, qy1 - 0.4),
                          ((qx0 + qx1) / 2 - 0.05, qy0 + 0.4, (qx0 + qx1) / 2 + 0.05, qy1 - 0.4)):
        m.face([(a, b_, zl), (c, b_, zl), (c, d, zl), (a, d, zl)], "Pintura_Branca", facing=(0, 0, 1))
    for (tx, r) in ((qx0 + 0.6, 180), (qx1 - 0.6, 0)):
        B.inst("P_Trave", "Trave", MOB, (tx, (qy0 + qy1) / 2, ZC), r, scale=(0.7, 1.0, 1.0))
    m.tube((lx0 + 6, ly1 - 3, ZC), (lx0 + 6, ly1 - 3, ZC + 8), 0.05, "Metal_Branco", segs=6)          # mastro
    m.box((lx0 + 6.05, ly1 - 3.02, ZC + 6.9), (lx0 + 7.5, ly1 - 2.98, ZC + 7.9), "Feltro_Verde")
    return ((qx0 + qx1) / 2, (qy0 + qy1) / 2)


# ---------------------------------------------------------------- gera o bairro
ESPECIAIS = {(0, 1): 'praca', (0, 2): 'igreja', (1, -1): 'campinho', (1, 1): 'escola'}
FORCAR = {(1, 0): {('S', 0): 'padaria', ('S', 1): 'acougue', ('N', 0): 'farmacia'},
          (-1, 0): {('S', -1): 'acougue'},
          (-1, 1): {('S', -1): 'oficina', ('S', -2): 'lavarapido'},
          (-1, -1): {('N', -1): 'mercadinho'},
          (0, -1): {('N', 1): 'bardoze'}}
pontos = {}
for i in range(-RING, RING + 1):
    for j in range(-RING, RING + 1):
        if (i, j) == (0, 0):
            continue
        lod = abs(i) == RING or abs(j) == RING
        rr = random.Random(hash((i, j, 7)) & 0xffffffff)
        tipo = ESPECIAIS.get((i, j))
        if tipo == 'praca':
            pontos['Ponto_Praca'] = praca(i, j)
        elif tipo == 'campinho':
            pontos['Ponto_Campinho'] = campinho(i, j)
        elif tipo == 'escola':
            pontos['Ponto_Escola'] = escola(i, j)
        elif tipo == 'igreja':
            igreja(i, j)
            cxg = (q(i, j)[0] + q(i, j)[1]) / 2
            pontos['Ponto_Igreja'] = (cxg, q(i, j)[2] + 4.0)
            quadra_residencial(i, j, rr, excluir_x=(cxg - 10.5, cxg + 10.5))
        else:
            quadra_residencial(i, j, rr, lod=lod, forcar=FORCAR.get((i, j), {}))


# ---------------------------------------------------------------- mobiliario urbano
def I(proto, x, y, z=ZC, rot=0.0, collide=False, nome=None, scale=None):
    o = B.inst(proto, nome or proto[2:], MOB, (x, y, z), rot, scale=scale)
    if collide:
        B.collider_obj("Ext_" + proto[2:], o)
    return o


def bloco_de(x, y):
    for i in range(-RING, RING + 1):
        for j in range(-RING, RING + 1):
            x0, x1, y0, y1 = q(i, j)
            if x0 - 4 <= x <= x1 + 4 and y0 - 4 <= y <= y1 + 4:
                return i, j
    return 0, 0


def arvore(x, y, rr, z=ZC):
    k = rr.random()
    proto = "P_Arvore_Ipe" if k < 0.15 else ("P_Arvore_A" if k < 0.58 else "P_Arvore_B")
    I(proto, x, y, z, rr.uniform(0, 360), nome="Arvore")
    I("P_Canteiro", x, y, z, 0, nome="Canteiro")
    B.add_collider("Ext_Arvore", (x - 0.15, y - 0.15, z), (x + 0.15, y + 0.15, z + 2.5))
    sombra_blob(*bloco_de(x, y), x, y, z, 2.2, 2.2)


# arvores nas calcadas (a quadra do bar mantem o arranjo da referencia)
bar_arv = [(2.6, -2.1), (13.2, -2.1), (20.8, -2.1), (28.0, -2.1), (-2.1, 4.3), (-2.1, 10.8), (-2.1, 17.0), (-2.1, 25.0),
           (3.5, 28.1), (11.0, 28.1), (18.5, 28.1), (31.0, 28.1), (34.1, 5.5), (34.1, 16.0), (34.1, 22.5)]
rt = random.Random(5)
for (x, y) in bar_arv:
    arvore(x, y, rt)
for i in range(-RING, RING + 1):
    for j in range(-RING, RING + 1):
        if (i, j) in ((0, 0), (0, 1)):
            continue
        x0, x1, y0, y1 = q(i, j)
        lados = []
        if j > -RING and (abs(i) < RING or True):
            lados.append(('S', x0, x1, y0 + 0.9))
        if j < RING:
            lados.append(('N', x0, x1, y1 - 0.9))
        if i > -RING:
            lados.append(('W', y0, y1, x0 + 0.9))
        if i < RING:
            lados.append(('E', y0, y1, x1 - 0.9))
        lod = abs(i) == RING or abs(j) == RING
        for (fac, a0, a1, c) in lados:
            if lod and not ((fac == 'S' and j == RING) or (fac == 'N' and j == -RING) or (fac == 'W' and i == RING) or (fac == 'E' and i == -RING)):
                continue
            t = a0 + 7.0 + rt.uniform(0, 3)
            while t < a1 - 7.0:
                if fac in ('S', 'N'):
                    arvore(t, c, rt)
                else:
                    arvore(c, t, rt)
                t += rt.uniform(10.0, 15.0)

# postes: lados S e W de cada quadra jogavel (cada rua fica com postes de um lado), fiacao continua
postes = {}
for i in range(-RING + 1, RING + 1):
    for j in range(-RING + 1, RING + 1):
        x0, x1, y0, y1 = q(i, j)
        if i < RING:                                         # lado S: quadras das colunas jogaveis
            lista = [(x0 + 1.1, y0 + 1.1, 225)]
            for k in range(1, 3):
                lista.append((x0 + (x1 - x0) * k / 3, y0 + 0.38, -90))
            postes[('S', i, j)] = lista
        if j < RING:                                         # lado W: quadras das linhas jogaveis
            lista = [(x0 + 1.1, y0 + 1.1, 225)]
            for k in range(1, 3):
                lista.append((x0 + 0.38, y0 + (y1 - y0) * k / 3, 180))
            postes[('W', i, j)] = lista
feitos = set()
fios = B.Mesh("Ext_Fiacao")
fio_por_poste = {}


def pontos_fio(x, y, r):
    a = math.radians(r)
    ly = Vector((-math.sin(a), math.cos(a), 0))
    base = Vector((x, y, ZC))
    return [base + ly * s + Vector((0, 0, 9.43)) for s in (-0.8, 0.0, 0.8)] + [base + Vector((0, 0, 7.75))]


def vao(pa, pb, n=6):
    for a, c in zip(pa, pb):
        L = (c - a).length
        if L < 0.5:
            continue
        sag = 0.25 + 0.012 * L
        pts = [a.lerp(c, t / n) - Vector((0, 0, sag * 4 * (t / n) * (1 - t / n))) for t in range(n + 1)]
        hz = Vector((0, 0, 0.012))                    # fita vertical de dupla face (1/3 dos vertices de um tubo)
        fios.face([pts[0] - hz] + [p - hz for p in pts[1:]] + [p + hz for p in reversed(pts)], "Fio")


rp = random.Random(11)
cnt = 0
for key, lista in postes.items():
    for (x, y, r) in lista:
        k2 = (round(x, 2), round(y, 2))
        if k2 not in feitos:
            feitos.add(k2)
            cnt += 1
            proto = "P_Poste_Trafo" if cnt % 5 == 0 else ("P_Poste_Luz" if rp.random() < 0.8 else "P_Poste")
            I(proto, x, y, ZC, r, nome="Poste")
            B.add_collider("Ext_Poste", (x - 0.17, y - 0.17, ZC), (x + 0.17, y + 0.17, ZC + 10.0))
            sombra_blob(*bloco_de(x, y), x, y, ZC, 0.5, 0.5)
    for k in range(len(lista) - 1):
        vao(pontos_fio(*lista[k]), pontos_fio(*lista[k + 1]))
    fac, i, j = key
    if fac == 'S':
        nxt = postes.get(('S', i + 1, j))
        if nxt:
            vao(pontos_fio(*lista[-1]), pontos_fio(*nxt[0]))
    else:
        nxt = postes.get(('W', i, j + 1)) or postes.get(('S', i, j + 1))
        if nxt:
            vao(pontos_fio(*lista[-1]), pontos_fio(*nxt[0]))
vao([pontos_fio(*postes[('S', 0, 0)][1])[3]], [Vector((12.6, 3.42, 6.0))], n=5)        # ramal de entrada do bar
fios.box((12.45, 3.36, 5.7), (12.75, 3.5, 6.1), "Metal_Escuro", skip=('py',))
fios.build(MOB)

# carros estacionados junto ao meio-fio
CARROS = ["P_Carro_Prata", "P_Carro_Vermelho", "P_Carro_Branco", "P_Carro_Azul", "P_Carro_Preto",
          "P_Sedan_Prata", "P_Sedan_Branco", "P_Sedan_Preto"]
rc = random.Random(21)


def carro(x, y, rot, proto=None):
    o = I(proto or rc.choice(CARROS), x, y, 0.0, rot, collide=True, nome="Carro")
    sombra_blob(*bloco_de(x, y), x, y, 0.0, 2.4, 1.15, rot)
    return o


carro(18.5, -4.0, 180, "P_Carro_Prata"); carro(-4.0, 19.5, 90, "P_Carro_Vermelho")
carro(36.0, 6.0, -90, "P_Carro_Prata"); carro(14.0, 30.0, 0, "P_Carro_Vermelho")
for i in range(-RING + 1, RING):
    for j in range(-RING + 1, RING):
        if (i, j) == (0, 0):
            continue
        x0, x1, y0, y1 = q(i, j)
        for (fac, a0, a1) in (('S', x0, x1), ('N', x0, x1), ('W', y0, y1), ('E', y0, y1)):
            usados = []
            for _ in range(rc.choice((0, 1, 1, 2))):
                t = rc.uniform(a0 + 9, a1 - 9)
                if any(abs(t - u) < 5.5 for u in usados):
                    continue
                usados.append(t)
                if fac == 'S':
                    carro(t, y0 - 1.05, 180)
                elif fac == 'N':
                    carro(t, y1 + 1.05, 0)
                elif fac == 'W':
                    carro(x0 - 1.05, t, 90)
                else:
                    carro(x1 + 1.05, t, -90)

# pontos de onibus, orelhoes, placas de rua, lixeiras
for (x, y, r) in ((-1.6, q(0, 1)[2] + 16.0, -90), (q(1, 0)[0] + 1.6, 12.0, -90), (16.0, q(0, -1)[3] - 1.6, 180)):
    I("P_Ponto_Onibus", x, y, ZC, r, collide=True, nome="Ponto_Onibus")
pontos['Ponto_Onibus'] = (-1.6, q(0, 1)[2] + 16.0)
for (x, y, r) in ((q(0, 1)[0] + 1.2, q(0, 1)[2] + 2.0, 90), (q(1, 0)[0] + 1.2, -1.0, 0), (-12.0, q(-1, 0)[3] - 1.2, 0), (24.0, q(0, -1)[3] - 1.0, 180)):
    I("P_Orelhao", x, y, ZC, r, nome="Orelhao")
    B.add_collider("Ext_Orelhao", (x - 0.4, y - 0.4, ZC), (x + 0.4, y + 0.4, ZC + 2.2))
k = 0
for i in range(-RING + 1, RING):
    for j in range(-RING + 1, RING):
        x0, x1, y0, y1 = q(i, j)
        k += 1
        x, y = x1 - 1.0, y1 - 1.0
        I("P_Placa_Rua_A" if k % 2 else "P_Placa_Rua_B", x, y, ZC, 0, nome="Placa_Rua")
        if rc.random() < 0.5:
            I("P_Lixeira", x0 + 6.5, y0 + 0.6, ZC, 0, collide=True, nome="Lixeira")
I("P_Lixeira", 16.5, -2.4, ZC, 0, collide=True)

# carrinho de espeto (asset feito a mao) como objeto interativo: no proprio, com os pontos de efeito como filhos
INT = "Interativos"
B.coll(INT)
B.clear(INT)
B.clear_colliders("Int_")


def carrinho_espeto(nome, x, y, rot):
    me = bpy.data.meshes.get("A_carrinhoespeto")
    if me is None:                                           # fallback: prototipo antigo
        return I("P_Carrinho_Churrasco", x, y, ZC, rot, collide=True)
    car = B.inst(me, nome, INT, (x, y, ZC), rot)
    car["interativo"] = "carrinho_espeto"
    B.collider_obj("Int_" + nome, car)
    sombra_blob(*bloco_de(x, y), x, y, ZC, 0.62, 0.48, rot)
    for chave, sufixo, disp in (("fx_fogo", "FX_Fogo", 'SPHERE'), ("fx_fumaca", "FX_Fumaca", 'SINGLE_ARROW')):
        if chave not in me:
            continue
        e = bpy.data.objects.new("%s_%s" % (nome, sufixo), None)
        e.empty_display_type = disp
        e.empty_display_size = 0.12 if disp == 'SPHERE' else 0.3
        e.parent = car
        e.location = tuple(me[chave])
        e["fx"] = "fogo" if chave == "fx_fogo" else "fumaca"
        B.coll(INT).objects.link(e)
    mb = bpy.data.meshes.get("A_carrinhoespeto_brasas")
    if mb is not None:
        pb = bpy.data.objects.new("%s_FX_Brasas" % nome, mb)
        pb.parent = car
        pb["fx"] = "brasas"
        B.coll(INT).objects.link(pb)
    return car


carrinho_espeto("Carrinho_Espeto", 8.7, -1.5, 188)

# cavaletes fechando as saidas do mapa (ruas que atravessam o limite jogavel)
PX0, PX1 = q(-RING, 0)[1], q(RING, 0)[0]
PY0, PY1 = q(0, -RING)[3], q(0, RING)[2]
for j in range(-RING, RING):
    ya, yb = q(0, j)[3], q(0, j + 1)[2]
    for xb in (PX0 + 0.6, PX1 - 0.6):
        for s in range(4):
            I("P_Cavalete", xb, ya + 1.0 + s * 2.0, 0.0, 90, nome="Cavalete")
        I("P_Cone", xb + (1.2 if xb < 0 else -1.2), (ya + yb) / 2, 0.0, 0, nome="Cone")
for i in range(-RING, RING):
    xa, xb_ = q(i, 0)[1], q(i + 1, 0)[0]
    for yb in (PY0 + 0.6, PY1 - 0.6):
        for s in range(4):
            I("P_Cavalete", xa + 1.0 + s * 2.0, yb, 0.0, 0, nome="Cavalete")
        I("P_Cone", (xa + xb_) / 2, yb + (1.2 if yb < 0 else -1.2), 0.0, 0, nome="Cone")

# ---------------------------------------------------------------- profundidade: predios distantes, morros, panorama
CX, CY = (q(-RING, 0)[0] + q(RING, 0)[1]) / 2, (q(0, -RING)[2] + q(0, RING)[3]) / 2
MX0, MX1, MY0, MY1 = q(-RING, 0)[0], q(RING, 0)[1], q(0, -RING)[2], q(0, RING)[3]
dist = B.Mesh("Distante_Predios")
rd = random.Random(99)
n_pred = 0
while n_pred < 150:
    a = rd.uniform(0, 2 * math.pi)
    r = rd.uniform(200, 360)
    x, y = CX + r * math.cos(a), CY + r * math.sin(a)
    if MX0 - 12 < x < MX1 + 12 and MY0 - 12 < y < MY1 + 12:
        continue
    w, d = rd.uniform(10, 26), rd.uniform(10, 22)
    h = rd.uniform(6, 16) if rd.random() < 0.6 else rd.uniform(20, 55) * (r / 300)
    dist.box((x - w / 2, y - d / 2, -0.1), (x + w / 2, y + d / 2, h), "Predios_Distantes", skip=('nz',), M=None)
    n_pred += 1
dist.build(DIST)
ch = B.Mesh("Distante_Chao")
nseg = 48
ch.face([(CX + 900 * math.cos(2 * math.pi * k / nseg), CY + 900 * math.sin(2 * math.pi * k / nseg), -0.04) for k in range(nseg)],
        "Chao_Distante", facing=(0, 0, 1))
ch.build(DIST)
mo = B.Mesh("Distante_Morros")
for k in range(7):
    a = 2 * math.pi * k / 7 + rd.uniform(-0.25, 0.25)
    r = rd.uniform(430, 560)
    x, y = CX + r * math.cos(a), CY + r * math.sin(a)
    rx_, ry_, h = rd.uniform(110, 190), rd.uniform(90, 150), rd.uniform(45, 110)
    M = Matrix.Translation((x, y, -12.0)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Diagonal((rx_, ry_, h, 1.0))
    mo.sphere("Morro_Distante", M, subdiv=3, jitter=h * 0.10, rng=rd)     # relevo irregular (cristas e vales)
    for _ in range(2):                                                    # morrotes secundarios colados
        a2 = a + rd.uniform(-0.18, 0.18)
        r2 = r + rd.uniform(-60, 60)
        M2 = Matrix.Translation((CX + r2 * math.cos(a2), CY + r2 * math.sin(a2), -10.0)) @ Matrix.Rotation(rd.uniform(0, 6.3), 4, 'Z') \
            @ Matrix.Diagonal((rx_ * rd.uniform(0.4, 0.7), ry_ * rd.uniform(0.4, 0.7), h * rd.uniform(0.5, 0.8), 1.0))
        mo.sphere("Morro_Distante", M2, subdiv=2, jitter=h * 0.08, rng=rd)
mo.build(DIST)
pan = B.Mesh("Distante_Panorama")
RP, Z0p, Z1p, nseg = 760.0, -40.0, 220.0, 64
for k in range(nseg):
    a0, a1 = 2 * math.pi * k / nseg, 2 * math.pi * (k + 1) / nseg
    p0 = (CX + RP * math.cos(a0), CY + RP * math.sin(a0)); p1 = (CX + RP * math.cos(a1), CY + RP * math.sin(a1))
    u0, u1 = k / nseg, (k + 1) / nseg
    pan.face([(p0[0], p0[1], Z0p), (p1[0], p1[1], Z0p), (p1[0], p1[1], Z1p), (p0[0], p0[1], Z1p)], "Ceu_Panorama",
             uvs=[(u0, 0.0), (u1, 0.0), (u1, 1.0), (u0, 1.0)], facing=(-math.cos(a0), -math.sin(a0), 0))
    pan.face([(p1[0], p1[1], Z1p), (p0[0], p0[1], Z1p), (CX, CY, Z1p + 160)], "Ceu_Panorama",
             uvs=[(u1, 0.995), (u0, 0.995), ((u0 + u1) / 2, 0.999)], facing=(0, 0, -1))
pan.build(DIST)

# ---------------------------------------------------------------- sombras de contato (finaliza por quadra)
# predio do bar: faixa de AO nas bases das fachadas
for (p0, p1, n_, z_) in (((3.5, 3.5), (23.8, 3.5), (0, -1), ZP), ((3.5, 3.5), (3.5, 15.0), (-1, 0), ZP),
                         ((3.5, 15.0), (23.8, 15.0), (0, 1), ZP), ((23.8, 15.0), (32.0, 15.0), (0, 1), ZP),
                         ((23.8, 0.0), (32.0, 0.0), (0, -1), ZC), ((32.0, 0.0), (32.0, 15.0), (1, 0), ZC)):
    sombra_faixa(0, 0, p0, p1, n_, z_, 0.5)
for key, b_ in list(_meshes.items()):
    kind = key[0]
    if not b_.bm.faces:
        b_.bm.free()
        continue
    col = MOB if kind == "Sombras" else VZ
    b_.build(col)

# ---------------------------------------------------------------- luzes (sol + pontos do bar)
def luz(nome, tipo, loc, energia, cor=(1.0, 0.92, 0.8), raio=0.2, rot=None):
    ld = bpy.data.lights.new(nome, tipo)
    ld.energy = energia
    ld.color = cor
    if tipo == 'SUN':
        ld.angle = math.radians(1.5)
    else:
        ld.shadow_soft_size = raio
    o = bpy.data.objects.new(nome, ld)
    o.location = loc
    if rot:
        o.rotation_euler = [math.radians(v) for v in rot]
    B.coll(LUZ).objects.link(o)
    return o


luz("Sol", 'SUN', (10, -10, 25), 3.5, (1.0, 0.95, 0.88), rot=(40, 0, -35))
for (n, loc, e, cor) in (("Luz_Salao_1", (7.0, 6.8, 3.0), 200, None), ("Luz_Salao_2", (12.5, 6.8, 3.0), 200, None),
                         ("Luz_Bar", (20.8, 8.0, 3.0), 130, None), ("Luz_Cozinha", (27.8, 4.5, 3.0), 130, None),
                         ("Luz_Fundos", (12.0, 13.2, 3.0), 90, None), ("Luz_Jogos", (10.3, 7.6, 5.4), 220, None),
                         ("Luz_Lounge", (20.5, 8.0, 5.9), 110, None), ("Luz_Varanda_Sul", (11.0, 1.8, 2.55), 160, None),
                         ("Luz_Varanda_Oeste", (1.8, 9.0, 2.55), 100, None), ("Luz_Quintal_1", (6.0, 20.0, 2.7), 170, None),
                         ("Luz_Quintal_2", (14.5, 20.0, 2.7), 170, None), ("Luz_Palco", (26.6, 22.6, 3.9), 220, (1.0, 0.75, 0.85)),
                         ("Luz_Terraco", (28.0, 7.5, 6.2), 130, None)):
    luz(n, 'POINT', loc, e, cor or (1.0, 0.92, 0.8))
w = bpy.context.scene.world or bpy.data.worlds.new("World")
bpy.context.scene.world = w
w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs[0].default_value = (0.55, 0.70, 0.90, 1.0)
bg.inputs[1].default_value = 0.8
w.mist_settings.start = 70.0
w.mist_settings.depth = 450.0
scn = bpy.context.scene
scn["nevoa"] = {"cor": [0.80, 0.85, 0.90], "inicio_m": 70.0, "fim_m": 520.0, "ignorar_materiais": ["Ceu_Panorama"]}
scn["camera_far_minimo_m"] = 1100.0
scn["area_jogavel"] = [PX0, PY0, PX1, PY1]

# ---------------------------------------------------------------- marcadores para o jogo
marc = [("Spawn_Jogador", (12.0, -1.6, ZC), 90), ("Ponto_Balcao", (16.4, 7.5, ZP), 0), ("Ponto_Sinuca", (10.3, 9.6, ZP2), 0),
        ("Ponto_Lounge", (19.8, 7.4, ZP2), 0), ("Ponto_Terraco", (28.0, 8.7, ZP2), 0), ("Ponto_Palco", (26.6, 19.8, ZP), 90),
        ("Ponto_Churrasqueira", (4.5, 23.9, ZP), 90), ("Ponto_Cozinha", (28.5, 3.0, ZP), 0),
        ("Ponto_Carga_Descarga", (36.5, 10.7, 0.0), 180), ("Ponto_Portao_Quintal", (-1.5, 21.0, ZC), 0)]
for n, (x, y) in pontos.items():
    marc.append((n, (x, y, ZC + (0.18 if n == 'Ponto_Praca' else 0.0) + (0.7 if n == 'Ponto_Praca' else 0.0)), 0))
for (n, loc, rot) in marc:
    e = bpy.data.objects.new(n, None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = 0.5
    e.location = loc
    e.rotation_euler = (0, 0, math.radians(rot))
    B.coll(MK).objects.link(e)
print("bairro ok: objetos viz %d | mob %d | dist %d | colisores %d" % (len(B.coll(VZ).objects), len(B.coll(MOB).objects),
                                                                    len(B.coll(DIST).objects), len(B.coll("Colisores").objects)))
