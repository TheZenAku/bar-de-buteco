# moto_textura_classica.py - texturas da moto classica (60_moto_classica.py), so numpy, a partir do bake de dados
# (posicao, normal, peca, AO). Usa a pintura da v4 (pneus, motor, quadro, relogios, suspensao...) e refaz/acrescenta:
#  - tinta/carenagem NEUTRA (quase branca): o material Moto_Pintura multiplica pela cor escolhida. Casca de laranja,
#    variacao larga, AO, lascas e riscos finos que escurecem; nada de decalque claro (sumiria nas cores escuras: os
#    frisos dourados e os emblemas sao geometria com cor propria)
#  - cromados (aro, alca, farol, escapamento, coletor azulado no calor), raios de aco, niples, cubo/tambor de aluminio
#    fundido com aletas, sanfonas e joelheiras de borracha com frisos, emblema oval (cromo + esmalte preto + letreiro),
#    plaqueta "CL 150", refletor do farol com aneis, banco de vinil com gomos transversais e vivo
# Saidas: albedo e metal/rugosidade (glTF: G = rugosidade, B = metal).
import math
import numpy as np
import moto_textura3 as mt3
import moto_textura4 as mt4
from moto_textura3 import (ruido, fbm, sstep, cor, mistura, faixa, circulo, desfocar, mascara_texto, largura_texto)

YF, YT, ZC = -0.686, 0.686, 0.300


def pintar(R, PECAS, INFO):
    mt3.YF, mt3.YT, mt3.ZC = YF, YT, ZC
    out, pbr = mt4.pintar(R, PECAS, INFO)
    P, N, ID, AO, cobre = R["pos"], R["nor"], R["peca"], R["ao"], R["cobre"]
    AO = desfocar(np.clip(AO, 0.0, 1.0), cobre, 2)
    H, W = ID.shape
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    ax = np.abs(x)
    nx, ny, nz = N[..., 0], N[..., 1], N[..., 2]
    nome_de = {i: n for i, n in enumerate(PECAS)}

    def m(*nomes):
        ids = [i for i, n in nome_de.items() if n in nomes]
        return np.isin(ID, ids) & cobre

    ao = AO[..., None]
    g1 = fbm(P, 3.0)
    g2 = ruido(P, 45.0)
    g3 = fbm(P, 14.0)
    g4 = ruido(P, 160.0)
    g5 = ruido(P, 420.0)
    suj = sstep(0.55, 0.12, z) * (0.45 + 0.55 * fbm(P, 7.0))
    curv = np.zeros((H, W), np.float32)
    for dy, dx in ((0, 1), (1, 0)):
        vz = np.roll(np.roll(cobre, -dy, 0), -dx, 1) & cobre & (np.roll(np.roll(ID, -dy, 0), -dx, 1) == ID)
        d = np.abs(N - np.roll(np.roll(N, -dy, 0), -dx, 1)).sum(-1)
        curv = np.maximum(curv, np.where(vz, d, 0.0))
    curv = desfocar(curv, cobre, 1)
    quina = sstep(0.05, 0.28, curv)
    yc = np.where(y < 0, YF, YT)
    r_roda = np.sqrt((y - yc) ** 2 + (z - ZC) ** 2)
    ang = np.arctan2(z - ZC, y - yc)

    def marca(msk, rgb, rough, metal):
        out[msk] = rgb[msk]
        pbr[..., 1][msk] = rough if np.isscalar(rough) else rough[msk]
        pbr[..., 2][msk] = metal if np.isscalar(metal) else metal[msk]

    def liso(base, gr=0.05):
        v = np.ones((H, W, 3), np.float32) * cor(*base)
        return v * (1 - gr + 2 * gr * g2)[..., None]

    def cromado(base=(0.78, 0.80, 0.85), escuro=(0.20, 0.24, 0.30)):
        """reflexo falso: ceu claro em cima, chao escuro em baixo, linha do horizonte e brilho especular"""
        ref = 0.5 + 0.5 * nz
        v = np.ones((H, W, 3), np.float32) * cor(*base)
        v *= (0.40 + 0.80 * sstep(0.15, 0.95, ref))[..., None]
        v = mistura(v, cor(*escuro), sstep(0.52, 0.30, ref) * 0.75)
        v = mistura(v, cor(0.30, 0.27, 0.24), sstep(0.30, 0.10, ref) * 0.5)      # chao (marrom do asfalto)
        v = mistura(v, cor(0.97, 0.97, 0.99), sstep(0.86, 0.97, ref) * 0.65)
        v = mistura(v, cor(0.10, 0.11, 0.13), faixa(ref, 0.50, 0.53, 0.01) * 0.6)  # horizonte
        return v

    # ------------------------------------------------------------ pintura neutra (multiplicada pela cor no material)
    mk = m("tinta", "carenagem")
    v = np.ones((H, W, 3), np.float32) * cor(0.90, 0.90, 0.90)
    v *= (0.965 + 0.035 * g4 + 0.015 * g5)[..., None]          # casca de laranja do verniz
    v *= (0.97 + 0.04 * g1)[..., None]                          # variacao larga (demao)
    lasca = quina * sstep(0.62, 0.80, g3) * sstep(0.45, 0.75, g2)
    v = mistura(v, cor(0.30, 0.30, 0.31), lasca * 0.65)        # lascas ate o primer
    risco = sstep(0.78, 0.86, ruido(P * np.array([1.0, 9.0, 1.0], np.float32), 60.0)) * sstep(0.55, 0.75, g1) * 0.25
    v = mistura(v, cor(0.62, 0.62, 0.62), risco)                # riscos finos de uso
    v = mistura(v, cor(0.70, 0.66, 0.60), suj * 0.18)          # poeira baixa
    v = v * (0.36 + 0.64 * ao)
    rough = 0.20 + 0.10 * g3 + 0.25 * suj * g1 + 0.3 * lasca
    marca(mk, v, rough, 0.0)

    # ------------------------------------------------------------ frisos dourados, emblemas
    mk = m("friso")
    v = liso((0.88, 0.70, 0.34), 0.06)
    v = mistura(v, cor(0.55, 0.42, 0.20), sstep(0.6, 0.85, g3) * 0.3)
    marca(mk, v * (0.55 + 0.45 * ao), 0.30, 0.35)
    mk = m("emblema")
    v = cromado()
    ey, ez, ea, eb = INFO.get("emblema", (-0.248, 0.872, 0.046, 0.029))
    e = np.sqrt(((y - ey) / ea) ** 2 + ((z - ez) / eb) ** 2)
    tq = mk & (z > 0.80)
    campo = tq & (e < 0.80) & (ax > 0.10)
    v[campo] = cor(0.025, 0.025, 0.030)
    v[tq & (np.abs(e - 0.86) < 0.025)] *= 0.55                  # sulco entre o aro e o esmalte
    # letreiro HIGHLAND no esmalte (le da frente para tras dos dois lados) + traco em cima e embaixo
    hl = 0.0105
    wt = largura_texto("HIGHLAND", hl)
    for sgn in (1, -1):
        uu = (y - (ey - wt / 2)) if sgn > 0 else ((ey + wt / 2) - y)
        vv = z - (ez - hl / 2)
        t = campo & (x * sgn > 0) & mascara_texto(uu, vv, "HIGHLAND", hl, 0.9)
        v[t] = cromado()[t]
        lin = campo & (x * sgn > 0) & (np.abs(y - ey) < wt / 2) & ((np.abs(z - (ez + 0.0115)) < 0.0012) |
                                                                    (np.abs(z - (ez - 0.0115)) < 0.0012))
        v[lin] = cor(0.78, 0.62, 0.30)
    # plaqueta da tampa lateral: cromo escovado com "CL 150" em preto
    pl = mk & (z < 0.75)
    hl2 = 0.012
    wt2 = largura_texto("CL 150", hl2)
    for sgn in (1, -1):
        uu = (y - (0.210 - wt2 / 2)) if sgn > 0 else ((0.210 + wt2 / 2) - y)
        vv = z - (0.656 - hl2 / 2)
        t = pl & (x * sgn > 0) & (ax > 0.1205) & mascara_texto(uu, vv, "CL 150", hl2, 1.0)
        v[t] = cor(0.03, 0.03, 0.035)
    marca(mk, v * (0.65 + 0.35 * ao), np.where(campo, 0.15, 0.12), np.where(campo, 0.0, 0.55))

    # ------------------------------------------------------------ cromados
    mk = m("aro")
    v = cromado()
    v = mistura(v, cor(0.15, 0.15, 0.16), sstep(0.2185, 0.2150, r_roda) * 0.75)   # fundo do canal escurecido
    v = mistura(v, cor(0.42, 0.33, 0.25), sstep(0.65, 0.85, g3) * 0.25 * (0.4 + suj))   # pontinhos de ferrugem
    marca(mk, v * (0.60 + 0.40 * ao), 0.12 + 0.1 * g3, 0.55)
    mk = m("alca")
    marca(mk, cromado() * (0.60 + 0.40 * ao), 0.12, 0.55)
    mk = m("escapamento")
    v = cromado()
    v = mistura(v, cor(0.62, 0.52, 0.30), sstep(0.30, 0.26, y) * 0.35)          # amarelado perto da curva
    ponta = sstep(0.86, 0.93, y)
    v = mistura(v, cor(0.10, 0.09, 0.08), ponta * 0.45 * (0.5 + 0.5 * g3))       # fuligem na ponteira
    v = mistura(v, cor(0.40, 0.36, 0.32), 0.25 * suj * g3)
    marca(mk, v * (0.60 + 0.40 * ao), 0.12 + 0.12 * ponta, 0.55)
    mk = m("farol_refl")
    rr = np.sqrt(x ** 2 + (z - 0.884) ** 2)
    v = cromado((0.88, 0.89, 0.92), (0.45, 0.47, 0.50))
    v *= (0.86 + 0.14 * (0.5 + 0.5 * np.sin(rr * 520.0)))[..., None]
    v[rr < 0.012] = cor(0.95, 0.93, 0.85)                     # lampada
    marca(mk, v, 0.08, 0.55)

    # ------------------------------------------------------------ rodas raiadas: raios, niples, cubo e tambor
    mk = m("raio_arame")
    v = liso((0.74, 0.76, 0.79), 0.06)
    v *= (0.80 + 0.30 * sstep(0.2, 0.9, 0.5 + 0.5 * nz))[..., None]
    v = mistura(v, cor(0.38, 0.32, 0.26), 0.30 * g3 * (0.3 + suj))
    marca(mk, v * (0.70 + 0.30 * ao), 0.30, 0.55)
    mk = m("niple")
    marca(mk, liso((0.62, 0.63, 0.66), 0.08) * (0.6 + 0.4 * ao), 0.35, 0.50)
    mk = m("cubo", "tambor")
    fund = 0.5 + 0.5 * g4
    v = np.ones((H, W, 3), np.float32) * cor(0.60, 0.61, 0.63)
    v *= (0.88 + 0.12 * fund + 0.06 * g3)[..., None]            # aluminio fundido (granulado)
    v = mistura(v, cor(0.84, 0.85, 0.87), quina * 0.6)          # arestas polidas
    v = mistura(v, cor(0.30, 0.26, 0.22), 0.30 * g1 * (0.3 + suj))
    marca(mk, v * (0.35 + 0.65 * ao), 0.48 + 0.08 * g3, 0.45)

    # ------------------------------------------------------------ borrachas com frisos
    mk = m("sanfona")
    v = liso((0.030, 0.030, 0.032), 0.08)
    v = mistura(v, cor(0.11, 0.11, 0.115), quina * 0.5)
    v = mistura(v, cor(0.30, 0.27, 0.23), 0.25 * g3 * sstep(0.62, 0.40, z))
    marca(mk, v * (0.40 + 0.60 * ao), 0.82, 0.0)
    mk = m("joelheira")
    v = liso((0.034, 0.034, 0.036), 0.06)
    frisos = faixa(((z - 0.77) / 0.0075) % 1.0, 0.0, 0.35, 0.08)
    lado = ax > 0.12
    v = mistura(v, cor(0.012, 0.012, 0.013), frisos * lado * 0.8)
    v = mistura(v, cor(0.12, 0.12, 0.12), quina * 0.4)
    marca(mk, v * (0.45 + 0.55 * ao), 0.78 - 0.15 * frisos, 0.0)

    # ------------------------------------------------------------ banco: vinil com gomos transversais, vivo e costura
    mk = m("banco")
    v = np.ones((H, W, 3), np.float32) * cor(0.040, 0.040, 0.044)
    topo = nz > 0.45
    piloto = (y > 0.15) & (y < 0.40)
    garupa = (y > 0.53) & (y < 0.74)
    gomo = ((y - 0.15) / 0.034) % 1.0
    gomo_g = ((y - 0.53) / 0.034) % 1.0
    zona = topo & (ax < 0.098) & (piloto | garupa)
    g_ = np.where(piloto, gomo, gomo_g)
    v[zona] *= (0.80 + 0.45 * np.sin(g_[zona] * np.pi))[..., None]       # abaulado de cada gomo
    v[zona & ((g_ < 0.05) | (g_ > 0.95))] = cor(0.010, 0.010, 0.012)     # vinco costurado
    vivo = (nz > 0.20) & (nz < 0.55) & (ax > 0.07)
    v[vivo] = cor(0.022, 0.022, 0.024)
    v[vivo & (np.abs(nz - 0.37) < 0.035)] = cor(0.090, 0.088, 0.085)     # vivo (piping)
    cost = topo & (np.abs(ax - 0.102) < 0.0016) & (np.sin(y * 900.0) > 0)
    v[cost] = cor(0.20, 0.19, 0.17)                                      # costura tracejada
    v = mistura(v, cor(0.11, 0.11, 0.12), np.clip((nz - 0.3) * 0.6, 0, 1) * 0.35 * g1)
    v *= (0.86 + 0.28 * g2)[..., None]
    v = mistura(v, cor(0.17, 0.15, 0.13), quina * 0.4 * sstep(0.55, 0.8, g3))
    cinta = (np.abs(y - 0.505) < 0.017) & (nz > 0.0)
    rough_b = np.where(cinta, 0.75, 0.50 - 0.10 * nz.clip(0, 1))
    marca(mk, v * (0.32 + 0.68 * ao), rough_b, 0.0)

    out = np.clip(out, 0.0, 1.0)
    out[~cobre] = 0.12
    pbr = np.clip(pbr, 0.0, 1.0)
    pbr[~cobre] = (0.0, 0.7, 0.0)
    return out, pbr
