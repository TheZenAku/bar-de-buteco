# moto_textura3.py - texturas da moto v3 geradas so com numpy: pinta cada texel do atlas pela posicao 3D assada
# (posicao, normal, id da peca, oclusao ambiente e cor da referencia da Tripo amostrada na superficie mais proxima).
# Sem costuras entre ilhas de UV; decalques (letras, frisos, emblemas), costuras do banco, banda do pneu, escovado do
# aluminio, cromo com reflexo falso, discos furados, desgaste nas quinas e poeira. Saidas: albedo e mapa metal/rugosidade
# (glTF: G = rugosidade, B = metal). O vermelho da tinta ja vai assado no albedo (decalques com cor real).
import numpy as np
import carro_textura as ct

ruido, fbm, sstep, cor, mistura, faixa, circulo, desfocar = (ct.ruido, ct.fbm, ct.sstep, ct.cor, ct.mistura, ct.faixa,
                                                             ct.circulo, ct.desfocar)
YF, YT, ZC = -0.686, 0.675, 0.300

# fonte 5x7 (maiusculas e numeros usados nos decalques)
G = {
    "A": [".111.", "1...1", "1...1", "11111", "1...1", "1...1", "1...1"],
    "B": ["1111.", "1...1", "1...1", "1111.", "1...1", "1...1", "1111."],
    "C": [".111.", "1...1", "1....", "1....", "1....", "1...1", ".111."],
    "D": ["1111.", "1...1", "1...1", "1...1", "1...1", "1...1", "1111."],
    "E": ["11111", "1....", "1....", "1111.", "1....", "1....", "11111"],
    "G": [".111.", "1...1", "1....", "1.111", "1...1", "1...1", ".111."],
    "H": ["1...1", "1...1", "1...1", "11111", "1...1", "1...1", "1...1"],
    "I": ["111", ".1.", ".1.", ".1.", ".1.", ".1.", "111"],
    "L": ["1....", "1....", "1....", "1....", "1....", "1....", "11111"],
    "N": ["1...1", "11..1", "1.1.1", "1..11", "1...1", "1...1", "1...1"],
    "O": [".111.", "1...1", "1...1", "1...1", "1...1", "1...1", ".111."],
    "R": ["1111.", "1...1", "1...1", "1111.", "1.1..", "1..1.", "1...1"],
    "S": [".1111", "1....", "1....", ".111.", "....1", "....1", "1111."],
    "T": ["11111", "..1..", "..1..", "..1..", "..1..", "..1..", "..1.."],
    "V": ["1...1", "1...1", "1...1", "1...1", "1...1", ".1.1.", "..1.."],
    "Y": ["1...1", "1...1", ".1.1.", "..1..", "..1..", "..1..", "..1.."],
    "0": [".111.", "1...1", "1..11", "1.1.1", "11..1", "1...1", ".111."],
    "1": ["..1..", ".11..", "..1..", "..1..", "..1..", "..1..", ".111."],
    "2": [".111.", "1...1", "....1", "...1.", "..1..", ".1...", "11111"],
    "3": ["1111.", "....1", "....1", ".111.", "....1", "....1", "1111."],
    "5": ["11111", "1....", "1111.", "....1", "....1", "1...1", ".111."],
    "8": [".111.", "1...1", "1...1", ".111.", "1...1", "1...1", ".111."],
    "9": [".111.", "1...1", "1...1", ".1111", "....1", "...1.", ".11.."],
    "/": ["....1", "...1.", "...1.", "..1..", ".1...", ".1...", "1...."],
    "-": [".....", ".....", ".....", "11111", ".....", ".....", "....."],
    " ": ["...", "...", "...", "...", "...", "...", "..."],
}


def mascara_texto(u, v, txt, h_letra, espaco=1.0):
    """mascara 0/1 de um texto em coordenadas (u, v) de um plano: u para a direita (metros), v para cima; origem no canto
    inferior esquerdo do texto; h_letra = altura em metros"""
    px = h_letra / 7.0
    out = np.zeros(u.shape, bool)
    x0 = 0.0
    for ch in txt:
        g = G[ch]
        w = len(g[0])
        for j, linha in enumerate(g):
            for i, c in enumerate(linha):
                if c == "1":
                    out |= (u >= x0 + i * px) & (u < x0 + (i + 1) * px) & (v >= (6 - j) * px) & (v < (7 - j) * px)
        x0 += (w + espaco) * px
    return out


def largura_texto(txt, h_letra, espaco=1.0):
    return sum((len(G[c][0]) + espaco) * h_letra / 7.0 for c in txt) - espaco * h_letra / 7.0


def pintar(R, PECAS):
    P, N, ID, AO, cobre, RC = R["pos"], R["nor"], R["peca"], R["ao"], R["cobre"], R["ref"]
    AO = desfocar(np.clip(AO, 0.0, 1.0), cobre, 2)
    H, W = ID.shape
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    ax = np.abs(x)
    nx, ny, nz = N[..., 0], N[..., 1], N[..., 2]
    nome_de = {i: n for i, n in enumerate(PECAS)}

    def m(*nomes):
        ids = [i for i, n in nome_de.items() if n in nomes]
        return np.isin(ID, ids) & cobre

    out = np.zeros((H, W, 3), np.float32) + 0.5
    pbr = np.zeros((H, W, 3), np.float32)
    pbr[..., 1] = 0.7
    ao = AO[..., None]
    g1 = fbm(P, 3.0)
    g2 = ruido(P, 45.0)
    g3 = fbm(P, 14.0)
    g4 = ruido(P, 160.0)
    suj = sstep(0.55, 0.12, z) * (0.45 + 0.55 * fbm(P, 7.0))
    # curvatura a partir das normais assadas (so entre texels da mesma peca): quinas vivas
    curv = np.zeros((H, W), np.float32)
    for dy, dx in ((0, 1), (1, 0)):
        vz = np.roll(np.roll(cobre, -dy, 0), -dx, 1) & cobre & (np.roll(np.roll(ID, -dy, 0), -dx, 1) == ID)
        d = np.abs(N - np.roll(np.roll(N, -dy, 0), -dx, 1)).sum(-1)
        curv = np.maximum(curv, np.where(vz, d, 0.0))
    curv = desfocar(curv, cobre, 1)
    quina = sstep(0.05, 0.28, curv)
    refL = RC.mean(-1)

    def marca(msk, rgb, rough, metal):
        out[msk] = rgb[msk]
        pbr[..., 1][msk] = rough if np.isscalar(rough) else rough[msk]
        pbr[..., 2][msk] = metal if np.isscalar(metal) else metal[msk]

    def liso(base, gr=0.05):
        v = np.ones((H, W, 3), np.float32) * cor(*base)
        return v * (1 - gr + 2 * gr * g2)[..., None]

    # ------------------------------------------------------------ tinta (tanque, paralama, tampas e rabeta)
    mk = m("tinta", "ref_tinta")
    c = np.ones((H, W, 3), np.float32) * cor(0.80, 0.060, 0.048)          # vermelho Highland assado na textura
    c *= (0.95 + 0.07 * g1 + 0.04 * nz)[..., None]
    c = mistura(c, cor(0.45, 0.33, 0.26), suj * 0.40)
    flanco = (ax > 0.085) & (np.abs(nx) > 0.35)
    # tanque: joelheiras de borracha, frisos e letreiro nos dois lados
    tq = m("tinta") & (z > 0.62) & (y > -0.40) & (y < 0.20)
    dj = np.sqrt(((y - 0.035) / 0.090) ** 2 + ((z - 0.775) / 0.062) ** 2)
    joelho = tq & flanco & (dj < 1.0) & (ax > 0.10)
    c = mistura(c, cor(0.12, 0.115, 0.115), (joelho * sstep(1.0, 0.82, dj)).astype(np.float32))
    c[tq & flanco & (ax > 0.10) & (dj > 1.0) & (dj < 1.11)] = cor(0.95, 0.88, 0.68)     # vivo creme em volta da joelheira
    c[joelho & (dj < 0.9)] *= (0.85 + 0.3 * g4[joelho & (dj < 0.9)])[..., None]
    friso1 = tq & flanco & (faixa(z, 0.690, 0.697, 0.0012) > 0.5) & (y > -0.33) & (y < 0.12)
    c[friso1] = cor(0.95, 0.88, 0.68)
    friso2 = tq & flanco & (faixa(z, 0.703, 0.706, 0.0010) > 0.5) & (y > -0.32) & (y < 0.11)
    c[friso2] = cor(0.95, 0.88, 0.68)
    # letreiro HIGHLAND (cada lado le de frente para tras)
    h_l = 0.027
    wtxt = largura_texto("HIGHLAND", h_l)
    for sgn in (1, -1):
        face = tq & (x * sgn > 0.075) & (z > 0.752) & (z < 0.800)
        uu = (y + 0.335) if sgn > 0 else (-0.115 - y)
        vv = z - 0.7625
        t = mascara_texto(uu, vv, "HIGHLAND", h_l)
        c[face & t] = cor(0.96, 0.90, 0.72)
    # emblema redondo no peito do tanque (cima, em frente a tampa): anel + H
    de = np.sqrt((y + 0.30) ** 2 + (x) ** 2)
    top = tq & (nz > 0.55)
    # bordas gastas (primer cinza onde a quina esta viva) so no tanque e paralama
    gasto = quina * sstep(0.55, 0.8, g3) * (0.4 + suj)
    c = mistura(c, cor(0.60, 0.60, 0.62), gasto * 0.55)
    # paralama dianteiro: friso creme nas bordas e fundo escurecido
    pf = m("tinta") & (z < 0.64) & (y < -0.30)
    c[pf & (faixa(ax, 0.0725, 0.0755, 0.0008) > 0.5)] = cor(0.95, 0.88, 0.68)
    c = c * (0.40 + 0.60 * ao)
    marca(mk, c, 0.26 + 0.12 * g3, 0.0)

    # ------------------------------------------------------------ banco: vinil preto com costura losangular e viez
    mk = m("banco")
    v = np.ones((H, W, 3), np.float32) * cor(0.048, 0.048, 0.052)
    topo = nz > 0.30
    d1 = np.abs(((y * 1.2 + x * 2.0) / 0.075) % 1.0 - 0.5)
    d2 = np.abs(((y * 1.2 - x * 2.0) / 0.075) % 1.0 - 0.5)
    rego = ((d1 < 0.045) | (d2 < 0.045)) & topo & (ax < 0.105)
    almof = (np.minimum(d1, d2) > 0.10) & topo & (ax < 0.105)
    v[almof] = cor(0.070, 0.070, 0.076)
    v[rego] = cor(0.016, 0.016, 0.018)
    pesp = topo & (np.abs(ax - 0.108) < 0.0035)
    v[pesp] = cor(0.34, 0.31, 0.26)                       # costura de linha amarelada no vinco lateral
    v = mistura(v, cor(0.10, 0.10, 0.11), np.clip((nz - 0.3) * 0.6, 0, 1) * 0.35 * g1)
    v *= (0.85 + 0.30 * g2)[..., None]
    v = mistura(v, cor(0.17, 0.15, 0.13), quina * 0.5 * sstep(0.55, 0.8, g3))
    marca(mk, v * (0.30 + 0.70 * ao), 0.55 - 0.12 * nz.clip(0, 1), 0.0)

    # ------------------------------------------------------------ pneus
    yc = np.where(y < 0, YF, YT)
    dy, dz = y - yc, z - ZC
    r = np.sqrt(dy ** 2 + dz ** 2)
    ang = np.arctan2(dz, dy)
    mk = m("pneu")
    v = np.ones((H, W, 3), np.float32) * cor(0.052, 0.052, 0.056)
    banda = r > 0.272
    v[banda] = cor(0.070, 0.070, 0.076)
    lat = np.abs(x)
    v[banda & (lat > 0.045)] *= 0.9
    flanco_p = ~banda
    v[flanco_p & (np.abs(r - 0.262) < 0.0035)] = cor(0.115, 0.115, 0.12)       # friso do ombro
    v[flanco_p & (np.abs(r - 0.236) < 0.0018)] = cor(0.095, 0.095, 0.10)
    letras = flanco_p & (r > 0.238) & (r < 0.256)
    # texto "HIGHLAND 90/90-18 TUBELESS" em volta do flanco: u = angulo (m), v = raio
    a0 = 0.35                                              # onde o letreiro comeca (radianos)
    arco_t = np.where(x > 0, (ang - a0), (a0 + 0.9 - ang)) * 0.247
    t1 = mascara_texto(arco_t, r - 0.2395, "HIGHLAND", 0.014)
    letras = letras & t1 & (np.abs(x) > 0.02)
    v[letras] = cor(0.50, 0.50, 0.48)
    v = mistura(v, cor(0.30, 0.26, 0.21), sstep(0.26, 0.30, r) * 0.30 * g3 * (0.3 + suj))
    v = mistura(v, cor(0.05, 0.05, 0.055), sstep(0.2, 0.0, r - 0.22) * 0.0)
    marca(mk, v * (0.40 + 0.60 * ao), 0.90, 0.0)

    # ------------------------------------------------------------ aro, raios, cubo, discos, tambor, coroa (aluminio)
    brush = 0.5 + 0.5 * np.sin(ang * 260.0 + g2 * 4.0)
    for nome, base in (("aro", (0.78, 0.80, 0.83)), ("raio", (0.86, 0.88, 0.91)), ("cubo", (0.66, 0.68, 0.72))):
        mk = m(nome)
        v = np.ones((H, W, 3), np.float32) * cor(*base)
        v *= (0.93 + 0.08 * brush)[..., None]
        v *= (0.80 + 0.30 * sstep(0.1, 0.9, 0.5 + 0.5 * nx * np.where(x > 0, 1, -1)))[..., None]
        v = mistura(v, cor(0.12, 0.12, 0.13), (nome == "aro") * sstep(0.2025, 0.1995, r) * 0.55)    # dentro do aro escuro
        v = mistura(v, cor(0.85, 0.87, 0.90), quina * 0.5)
        v = mistura(v, cor(0.33, 0.30, 0.27), 0.25 * g3 * (0.3 + suj))
        marca(mk, v * (0.70 + 0.30 * ao), 0.40, 0.40)
    mk = m("disco")
    v = np.ones((H, W, 3), np.float32) * cor(0.60, 0.61, 0.63)
    nb = 14
    a2 = ((ang / (2 * np.pi)) * nb) % 1.0 - 0.5
    for rr in (0.118, 0.148):
        dd = np.sqrt((a2 * 2 * np.pi * rr / nb) ** 2 + (r - rr) ** 2)
        v = mistura(v, cor(0.025, 0.025, 0.025), circulo(dd, 0.0085, 0.0012) * (np.abs(r - rr) < 0.02))
    v[r < 0.101] = cor(0.30, 0.30, 0.32)
    v = mistura(v, cor(0.45, 0.30, 0.18), 0.30 * sstep(0.125, 0.15, r) * g3)
    v[np.abs(r - 0.168) < 0.0015] = cor(0.82, 0.83, 0.85)
    marca(mk, v * (0.70 + 0.30 * ao), 0.42, 0.40)
    mk = m("tambor")
    v = liso((0.46, 0.47, 0.50), 0.08)
    v[np.abs(np.sin(r * 360)) > 0.9] *= 0.65
    marca(mk, v * (0.6 + 0.4 * ao), 0.5, 0.40)
    mk = m("coroa")
    v = liso((0.28, 0.28, 0.30), 0.08)
    v = mistura(v, cor(0.60, 0.60, 0.62), sstep(0.095, 0.108, r) * 0.7)
    marca(mk, v * (0.6 + 0.4 * ao), 0.45, 0.40)

    # ------------------------------------------------------------ cromo / aco / borracha / plastico
    mk = m("cromo")
    ref = 0.5 + 0.5 * nz
    v = np.ones((H, W, 3), np.float32) * cor(0.76, 0.79, 0.84)
    v *= (0.42 + 0.78 * sstep(0.15, 0.95, ref))[..., None]
    v = mistura(v, cor(0.22, 0.26, 0.32), sstep(0.5, 0.25, ref) * 0.7)
    v = mistura(v, cor(0.95, 0.95, 0.97), sstep(0.88, 0.97, ref) * 0.6)
    marca(mk, v * (0.6 + 0.4 * ao), 0.14, 0.55)
    for nome, base, rough, metal in (("aco", (0.40, 0.41, 0.44), 0.5, 0.35), ("borracha", (0.026, 0.026, 0.028), 0.9, 0.0),
                                     ("plastico", (0.060, 0.060, 0.066), 0.6, 0.0), ("preto", (0.040, 0.040, 0.045), 0.45, 0.2),
                                     ("pedal", (0.38, 0.38, 0.40), 0.5, 0.35)):
        mk = m(nome)
        v = liso(base, 0.08)
        v = mistura(v, cor(0.25, 0.22, 0.19), 0.2 * g3 * suj)
        marca(mk, v * (0.45 + 0.55 * ao), rough, metal)

    # ------------------------------------------------------------ pecas herdadas da Tripo: cor da referencia como guia
    lum = np.clip(refL / 0.55, 0.0, 1.4)
    mk = m("ref_claro")
    brush2 = 0.5 + 0.5 * np.sin((y + z * 0.6) * 520.0 + g2 * 5.0)
    v = np.ones((H, W, 3), np.float32) * cor(0.66, 0.68, 0.71)
    v *= (0.55 + 0.45 * np.clip(lum, 0.3, 1.2))[..., None] * (0.96 + 0.05 * brush2)[..., None]
    v = mistura(v, cor(0.88, 0.89, 0.92), quina * 0.55)
    v = mistura(v, cor(0.30, 0.27, 0.24), 0.30 * g3 * (0.3 + suj))
    marca(mk, v * (0.65 + 0.35 * ao), 0.42 + 0.12 * g3, 0.35)
    mk = m("ref_medio")
    v = np.ones((H, W, 3), np.float32) * cor(0.30, 0.31, 0.34)
    v *= (0.5 + 0.7 * np.clip(lum, 0.2, 1.3))[..., None]
    v = mistura(v, cor(0.60, 0.61, 0.64), quina * 0.5)
    v = mistura(v, cor(0.22, 0.18, 0.15), 0.25 * g3 * (0.3 + suj))
    marca(mk, v * (0.55 + 0.45 * ao), 0.55, 0.30)
    mk = m("ref_escuro")
    v = np.ones((H, W, 3), np.float32) * cor(0.050, 0.050, 0.055)
    v *= (0.6 + 0.9 * np.clip(lum, 0.0, 1.0))[..., None]
    v = mistura(v, cor(0.22, 0.22, 0.24), quina * 0.4)
    marca(mk, v * (0.45 + 0.55 * ao), 0.65, 0.1)

    out = np.clip(out, 0.0, 1.0)
    out[~cobre] = 0.12
    pbr = np.clip(pbr, 0.0, 1.0)
    pbr[~cobre] = (0.0, 0.7, 0.0)
    return out, pbr


# ---------------------------------------------------------------- placa (reuso da v2)
def placa(*a, **k):
    import moto_textura as mt2
    return mt2.placa(*a, **k)
