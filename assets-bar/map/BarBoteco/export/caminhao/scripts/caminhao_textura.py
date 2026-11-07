# caminhao_textura.py - pinta o atlas do caminhao (59_caminhao.py) a partir dos mapas assados no proprio atlas
# (posicao e normal de mundo, id da peca e oclusao ambiente). So numpy. Cada texel e pintado em funcao da posicao 3D,
# entao nao ha costura entre ilhas de UV e o desenho e simetrico (usa |x|). Cores em sRGB 0..1. A pintura da cabine sai
# quase branca: o material Caminhao_Pintura multiplica pela cor escolhida no jogo.
import numpy as np
from carro_textura import ruido, fbm, sstep, cor, mistura, faixa, circulo, desfocar, placa, texto, largura_texto  # noqa

YF, YT, ZC, X_RD = -1.56, 1.56, 0.44, 0.86
X_RT = (0.70, 0.96)
CAB_Y0, CAB_PISO, BAU_PISO = -2.52, 0.96, 1.06


def pintar_atlas(R, PECAS):
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

    out = np.zeros((H, W, 3), np.float32) + 0.5
    g1 = fbm(P, 3.0)
    g2 = ruido(P, 40.0)
    ao = AO[..., None]
    sujeira = sstep(1.5, 0.55, z) * (0.55 + 0.45 * fbm(P, 6.0))
    chao_sujo = sstep(0.9, 0.4, z) * (0.5 + 0.5 * fbm(P * np.array([1, 1, 3]), 8.0))

    def plast(base, gr=0.05, k_ao=0.6):
        v = np.ones((H, W, 3), np.float32) * cor(*base)
        v *= (1 - gr + 2 * gr * g2)[..., None]
        return v * ((1 - k_ao) + k_ao * ao)

    def aplicar(mk, v):
        out[mk] = v[mk]

    # ------------------------------------------------ pintura da cabine (e portas): quase branca, o jogo multiplica pela cor
    for nome in ("pintura", "porta_pintura"):
        mk = m(nome)
        c = np.ones((H, W, 3), np.float32) * 0.94
        c *= (0.965 + 0.05 * g1)[..., None]
        c = mistura(c, cor(0.56, 0.51, 0.44), sujeira * 0.75)
        veio = sstep(0.55, 0.85, fbm(P * np.array([16.0, 0.6, 16.0]), 1.0))
        c = mistura(c, cor(0.62, 0.57, 0.50), 0.45 * veio * sstep(2.2, 1.1, z))
        risco = (np.abs(ruido(P * np.array([70.0, 70.0, 2.0]), 1.0) - 0.5) < 0.0035) | (np.abs(ruido(P * np.array([2.0, 70.0, 70.0]), 1.0) - 0.5) < 0.0035)
        c[risco & (z < 1.9)] *= 0.86
        manchas = sstep(0.52, 0.70, fbm(P, 3.5)) * 0.18
        c = mistura(c, cor(0.70, 0.66, 0.58), manchas)
        ferrugem = sstep(0.58, 0.72, fbm(P, 24.0)) * sstep(1.25, 0.60, z) * (0.4 + 0.6 * (np.abs(ny) < 0.8))
        c = mistura(c, cor(0.42, 0.22, 0.10), 0.65 * ferrugem)
        # saia, caixas de roda e fundo: plastico escuro
        saia = (z < 0.97)
        c[saia] = (cor(0.10, 0.10, 0.105) * (0.8 + 0.4 * g2[saia])[..., None])
        # faixa de borracha na linha de cintura e friso cromado da porta
        lado = np.abs(nx) > 0.6
        c[lado & (faixa(z, 1.040, 1.075, 0.002) > 0.5) & (z >= 0.97)] = cor(0.07, 0.07, 0.075)
        # nichos de farol e grade na frente: plastico preto
        nicho = (y > CAB_Y0 + 0.004) & (y < -2.47) & (z > 0.84) & (z < 1.17) & (ax < 0.97)
        c[nicho] = cor(0.05, 0.05, 0.055)
        # frisos do para-brisa e do vidro: borda preta
        c *= (0.34 + 0.66 * ao)
        # interior das portas visto por fora (aba): igual a pintura
        aplicar(mk, c)
    # ------------------------------------------------ interior da cabine
    mk = m("forro_cab")
    v = np.ones((H, W, 3), np.float32) * cor(0.52, 0.50, 0.46)
    v = mistura(v, cor(0.44, 0.42, 0.39), 0.5 * fbm(P, 12.0))
    teto = (nz < -0.5) & (z > 2.0)
    v[teto] = cor(0.80, 0.78, 0.72) * (0.95 + 0.08 * g2[teto])[..., None]
    piso = (nz > 0.5) & (z < CAB_PISO + 0.05)
    v[piso] = cor(0.11, 0.11, 0.115) * (0.8 + 0.4 * g2[piso])[..., None]
    baixo = (z < 1.50) & ~piso & ~teto
    v[baixo] = cor(0.36, 0.35, 0.33)
    cheio = ((ny > 0.6) & (y < -1.14))              # parede de tras da cabine
    v[cheio & (z > 1.5)] = cor(0.40, 0.38, 0.35)
    aplicar(mk, v * (0.50 + 0.50 * ao))
    mk = m("forro_porta")
    v = np.ones((H, W, 3), np.float32) * cor(0.31, 0.30, 0.28)
    v[z > 1.42] = cor(0.40, 0.38, 0.35)
    v[(z > 1.18) & (z < 1.215)] = cor(0.14, 0.14, 0.15)
    v[z < 1.10] = cor(0.12, 0.12, 0.13)
    aplicar(mk, v * (0.50 + 0.50 * ao))
    mk = m("tapete")
    v = plast((0.06, 0.06, 0.065), 0.10, 0.4)
    ss = np.abs(np.sin(y * 70)) > 0.85
    v[ss] *= 1.5
    aplicar(mk, v)
    mk = m("teto_cab")
    aplicar(mk, plast((0.60, 0.58, 0.53), 0.04, 0.5))
    # ------------------------------------------------ painel, quadro e console
    mk = m("painel")
    v = plast((0.20, 0.20, 0.21), 0.06, 0.6)
    topo = nz > 0.5
    v[topo] = cor(0.12, 0.12, 0.13)
    # quadro de instrumentos: parte da frente da caixa (y ~ -2.41) em frente ao motorista
    frente = (ny > 0.6) & (y > -2.30) & (y < -1.98)
    for xg in (0.40, 0.60):
        d = np.sqrt((x - xg) ** 2 + (z - 1.27) ** 2)
        a = np.arctan2(z - 1.27, x - xg)
        v = mistura(v, cor(0.03, 0.03, 0.035), circulo(d, 0.058, 0.0012) * frente)
        tr = frente & (d > 0.040) & (d < 0.054) & (np.abs(np.sin(a * 12)) < 0.2) & (a > -0.8)
        v[tr] = cor(0.85, 0.85, 0.80)
        pon = frente & (np.abs((x - xg) * np.sin(2.3) - (z - 1.27) * np.cos(2.3)) < 0.002) & (d < 0.045) & \
            ((x - xg) * np.cos(2.3) + (z - 1.27) * np.sin(2.3) > 0)
        v[pon] = cor(0.95, 0.45, 0.10)
        v = mistura(v, cor(0.65, 0.66, 0.68), np.clip(circulo(d, 0.060, 0.0008) - circulo(d, 0.057, 0.0008), 0, 1) * frente)
    for i, cc in enumerate(((0.8, 0.1, 0.1), (0.1, 0.7, 0.2), (0.9, 0.6, 0.1), (0.2, 0.5, 0.9))):
        d = np.sqrt((x - 0.50 - (i - 1.5) * 0.045) ** 2 + (z - 1.22) ** 2)
        v = mistura(v, cor(*cc) * 0.7, circulo(d, 0.007, 0.001) * frente)
    # radio no centro e saidas de ar
    rad = (ny > 0.5) & (ax < 0.12) & (z > 1.17) & (z < 1.30) & (y < -2.05)
    v[rad] = cor(0.08, 0.08, 0.09)
    v[rad & (np.abs(z - 1.24) < 0.02) & (ax < 0.09)] = cor(0.05, 0.22, 0.12)
    aplicar(mk, v * (0.70 + 0.30 * ao))
    aplicar(m("plastico"), plast((0.10, 0.10, 0.105)))
    aplicar(m("volante"), plast((0.045, 0.045, 0.05), 0.04, 0.5))
    aplicar(m("palheta"), plast((0.035, 0.035, 0.04)))
    aplicar(m("borracha"), plast((0.03, 0.03, 0.032), 0.1, 0.4))
    mk = m("banco")
    base = cor(0.30, 0.29, 0.34)
    v = np.ones((H, W, 3), np.float32) * base
    cost = np.abs(np.sin((y + z) * 2 * np.pi / 0.05)) > 0.9
    v[cost] = base * 0.7
    v *= (0.9 + 0.2 * g2)[..., None]
    aplicar(mk, v * (0.55 + 0.45 * ao))
    # ------------------------------------------------ vidro de espelho e cromados
    mk = m("espelho")
    v = np.ones((H, W, 3), np.float32) * cor(0.55, 0.65, 0.74)
    aplicar(mk, v)
    mk = m("cromo")
    v = np.ones((H, W, 3), np.float32) * cor(0.70, 0.71, 0.74)
    v *= (0.8 + 0.25 * sstep(0.3, 1.0, nz * 0.5 + 0.5))[..., None]
    aplicar(mk, v * (0.5 + 0.5 * ao))
    # ------------------------------------------------ grade e para-choques
    mk = m("grade")
    v = np.ones((H, W, 3), np.float32) * cor(0.05, 0.05, 0.055)
    t = (z - 0.91) / 0.045
    v[(np.abs(t - np.round(t)) < 0.20) & (nz > -0.1)] = cor(0.16, 0.16, 0.17)
    aplicar(mk, v * (0.5 + 0.5 * ao))
    mk = m("parachoque")
    v = plast((0.075, 0.075, 0.08), 0.06, 0.55)
    fr = y < 0
    v = mistura(v, cor(0.04, 0.04, 0.045), (faixa(z, 0.62, 0.66, 0.003) * fr))
    # parachoque traseiro: cinza escuro com listras amarelas e pretas nas pontas
    tras = y > 0
    v[tras] = cor(0.16, 0.16, 0.17) * (0.9 + 0.2 * g2[tras])[..., None]
    listra = tras & (ax > 0.93) & (np.sin((z + ax) * 40) > 0)
    v[listra] = cor(0.85, 0.70, 0.08)
    v = mistura(v, cor(0.27, 0.24, 0.20), sstep(0.65, 0.40, z) * 0.45 * fbm(P, 8.0))
    aplicar(mk, v * (0.55 + 0.45 * ao))
    mk = m("estribo")
    v = plast((0.10, 0.10, 0.11), 0.08, 0.5)
    grip = (nz > 0.7) & (np.abs(np.sin(y * 90)) > 0.8)
    v[grip] *= 1.8
    aplicar(mk, v)
    # ------------------------------------------------ rodas, pneus, cubos
    for yc in (YF, YT):
        pass
    cx = np.where(y < 0, X_RD, 0.0)
    r_f = np.sqrt((y - YF) ** 2 + (z - ZC) ** 2)
    r_t = np.sqrt((y - YT) ** 2 + (z - ZC) ** 2)
    frente_roda = y < 0
    dy = np.where(frente_roda, y - YF, y - YT)
    dz = z - ZC
    r = np.sqrt(dy ** 2 + dz ** 2)
    ang = np.arctan2(dz, dy)
    # posicao lateral relativa ao centro do pneu mais proximo
    xc_f = np.full_like(x, X_RD)
    xc_t = np.where(ax < 0.83, X_RT[0], X_RT[1])
    xl = np.where(frente_roda, ax - xc_f, ax - xc_t)
    mk = m("pneu")
    v = np.ones((H, W, 3), np.float32) * cor(0.06, 0.06, 0.063)
    banda = r > 0.43
    lug = banda & (np.abs(np.sin(ang * 26)) < 0.18)
    v[lug] = cor(0.028, 0.028, 0.03)
    v[banda & ((np.abs(xl) < 0.016) | (np.abs(np.abs(xl) - 0.045) < 0.01))] = cor(0.025, 0.025, 0.027)
    flanco = (~banda) & (np.abs(r - 0.37) < 0.004)
    v[flanco] = cor(0.12, 0.12, 0.125)
    letras = (~banda) & (r > 0.30) & (r < 0.33) & (np.abs(np.sin(ang * 70)) > 0.55) & (np.sin(ang * 2.0) > 0.4)
    v[letras] = cor(0.55, 0.55, 0.56) * 0.5
    v = mistura(v, cor(0.24, 0.20, 0.16), sstep(0.30, 0.43, r) * 0.28 * fbm(P, 12.0))
    aplicar(mk, v * (0.5 + 0.5 * ao))
    mk = m("roda")
    v = np.ones((H, W, 3), np.float32) * cor(0.78, 0.79, 0.80)
    v[r > 0.18] = cor(0.70, 0.71, 0.72)
    for k in range(10):                                       # furos de ventilacao/mao
        a = k * np.pi / 5
        d = np.sqrt((dy - 0.150 * np.cos(a)) ** 2 + (dz - 0.150 * np.sin(a)) ** 2)
        v = mistura(v, cor(0.03, 0.03, 0.03), circulo(d, 0.026, 0.002))
    v = mistura(v, cor(0.30, 0.30, 0.32), circulo(r, 0.07, 0.002))
    v = mistura(v, cor(0.45, 0.42, 0.38), 0.22 * fbm(P, 10.0))
    aplicar(mk, v * (0.5 + 0.5 * ao))
    mk = m("cubo")
    v = np.ones((H, W, 3), np.float32) * cor(0.20, 0.20, 0.21)
    v = mistura(v, cor(0.42, 0.40, 0.36), 0.35 * fbm(P, 9.0))
    aplicar(mk, v * (0.5 + 0.5 * ao))
    # ------------------------------------------------ baixos: chassi, eixos, molas, tanque, escape
    mk = m("chassi")
    v = plast((0.05, 0.05, 0.055), 0.10, 0.5)
    v = mistura(v, cor(0.30, 0.20, 0.13), 0.30 * fbm(P, 9.0))
    aplicar(mk, v)
    aplicar(m("eixo"), plast((0.09, 0.09, 0.10), 0.1, 0.5))
    aplicar(m("mola"), mistura(plast((0.06, 0.06, 0.065), 0.1, 0.5), cor(0.28, 0.17, 0.10), 0.35 * fbm(P, 9.0)))
    mk = m("tanque")
    v = np.ones((H, W, 3), np.float32) * cor(0.40, 0.41, 0.43)
    v = mistura(v, cor(0.15, 0.13, 0.11), 0.4 * fbm(P, 8.0))
    aplicar(mk, v * (0.55 + 0.45 * ao))
    mk = m("escape")
    v = mistura(np.ones((H, W, 3), np.float32) * cor(0.22, 0.19, 0.16), cor(0.36, 0.20, 0.10), fbm(P, 16.0))
    aplicar(mk, v * (0.5 + 0.5 * ao))
    # ------------------------------------------------ interior do bau
    mk = m("bau_forro")
    v = np.ones((H, W, 3), np.float32) * cor(0.66, 0.67, 0.67)
    v = mistura(v, cor(0.55, 0.55, 0.54), 0.5 * fbm(P, 10.0))
    piso = (nz > 0.6) & (z < BAU_PISO + 0.02)
    tabua = (np.abs(((ax * 1.0) / 0.16) % 1.0 - 0.5) > 0.47) | (np.abs(((y + 0.3) / 1.22) % 1.0 - 0.5) > 0.49)
    madeira = cor(0.50, 0.35, 0.20) * (0.8 + 0.4 * fbm(P * np.array([6, 1, 6]), 14.0))[..., None]
    v[piso] = madeira[piso]
    v[piso & tabua] = cor(0.20, 0.13, 0.08)
    teto = (nz < -0.6) & (z > 3.0)
    v[teto] = cor(0.80, 0.80, 0.78)
    fundo_f = (ny > 0.6) & (y < -0.85)
    v = mistura(v, cor(0.48, 0.48, 0.47), 0.4 * fundo_f)
    aplicar(mk, v * (0.30 + 0.70 * ao))
    aplicar(m("trilho"), np.ones((H, W, 3), np.float32) * cor(0.40, 0.41, 0.43) * (0.4 + 0.6 * ao))
    mk = m("luz_bau")
    aplicar(mk, np.ones((H, W, 3), np.float32) * cor(0.98, 0.98, 0.92))
    mk = m("refletor")
    aplicar(mk, np.ones((H, W, 3), np.float32) * cor(0.75, 0.08, 0.06) * (0.7 + 0.3 * ao))
    # ------------------------------------------------ carga: papelao, isopor, engradado, barris azuis
    mk = m("carga")
    cel = np.floor(P / np.array([0.30, 0.30, 0.20])).astype(np.int64)
    h = ((cel[..., 0] * 73856093) ^ (cel[..., 1] * 19349663) ^ (cel[..., 2] * 83492791)) & 0xFFF
    k = (h % 10).astype(np.float32)
    papelao = cor(0.60, 0.44, 0.27)
    v = np.ones((H, W, 3), np.float32) * papelao
    v = np.where((k < 3)[..., None], cor(0.65, 0.48, 0.30), v)
    v = np.where(((k >= 3) & (k < 5))[..., None], cor(0.88, 0.87, 0.82), v)       # isopor / branco
    v = np.where(((k >= 5) & (k < 7))[..., None], cor(0.16, 0.30, 0.55), v)       # engradado azul
    v = np.where((k >= 7)[..., None], cor(0.55, 0.40, 0.24), v)
    v *= (0.92 + 0.14 * g2)[..., None]
    fita = (np.abs(((ax * 1.0) % 0.52) - 0.26) < 0.02) | (np.abs(((z - BAU_PISO) % 0.4) - 0.2) < 0.012)
    v[fita & (nz > 0.4) | (fita & (np.abs(nx) > 0.6))] *= 0.75
    barril = (np.abs(nz) < 0.3) & (ny < 0.9) & (y > 0.9)                          # barris (cilindros no fundo)
    v[barril & (z > BAU_PISO)] = cor(0.08, 0.22, 0.52)
    aplicar(mk, v * (0.30 + 0.70 * ao))
    # ------------------------------------------------ lentes (luzes)
    def lente(base, passo_x, passo_z, k=0.85, borda=0.75):
        v = np.ones((H, W, 3), np.float32) * cor(*base)
        sx = np.abs(np.sin(x * np.pi / passo_x)) < 0.25 if passo_x else np.zeros_like(x, bool)
        sz = np.abs(np.sin(z * np.pi / passo_z)) < 0.25 if passo_z else np.zeros_like(x, bool)
        v[sx | sz] *= k
        return v * (borda + (1 - borda) * ao)

    vf = lente((0.88, 0.89, 0.86), 0.012, 0.018, 0.85)
    d = np.sqrt((ax - 0.675) ** 2 + (z - 1.03) ** 2)
    vf = mistura(vf, cor(0.98, 0.97, 0.90), circulo(d, 0.07, 0.01) * 0.7)
    aplicar(m("farol_E", "farol_D"), vf)
    va = lente((1.0, 0.56, 0.08), 0.008, 0.0, 0.8)
    aplicar(m("seta_E", "seta_D"), va)
    aplicar(m("lanterna_E", "lanterna_D"), lente((0.72, 0.06, 0.05), 0.015, 0.015, 0.7))
    aplicar(m("re_E", "re_D"), lente((0.92, 0.92, 0.90), 0.012, 0.012, 0.85))
    out = np.clip(out, 0.0, 1.0)
    out[~cobre] = 0.12
    return out


def aluminio(px=1024):
    """ladrilho de aluminio (1 m x 1 m, repete): escovado ao longo de u (sentido da ondulacao) + manchas verticais.
    Tudo periodico: o ruido usa grade que fecha em si mesma."""
    u = (np.arange(px, dtype=np.float32) + 0.5) / px
    U, V = np.meshgrid(u, u)

    def per(fx, fy, semente):
        rng = np.random.default_rng(semente)
        g = rng.random((int(fy), int(fx))).astype(np.float32)
        # interpola grade periodica
        ix, iy = U * fx, V * fy
        x0, y0 = np.floor(ix).astype(int) % int(fx), np.floor(iy).astype(int) % int(fy)
        x1, y1 = (x0 + 1) % int(fx), (y0 + 1) % int(fy)
        tx, ty = ix - np.floor(ix), iy - np.floor(iy)
        tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
        return (g[y0, x0] * (1 - tx) + g[y0, x1] * tx) * (1 - ty) + (g[y1, x0] * (1 - tx) + g[y1, x1] * tx) * ty

    escovado = per(1, 220, 1) * 0.6 + per(3, 600, 2) * 0.4
    base = 0.74 + 0.05 * (escovado - 0.5)
    mancha = per(12, 2, 4) * 0.7 + per(30, 3, 5) * 0.3                       # veios verticais suaves (chuva)
    suj = np.clip((mancha - 0.45) * 1.4, 0, 1) * 0.08
    gran = per(256, 256, 6)
    rng = np.random.default_rng(11)
    c = base - suj + 0.015 * (gran - 0.5)
    amassado = per(6, 6, 7)
    c = c - 0.10 * np.clip((amassado - 0.55) * 3.0, 0, 1) + 0.05 * np.clip((0.35 - amassado) * 3.0, 0, 1)
    for _ in range(90):                                              # riscos finos (periodicos)
        x0, y0 = rng.random(), rng.random()
        L = rng.random() * 0.25 + 0.03
        ang = rng.random() * 3.14159
        for t_ in np.linspace(0, 1, int(L * px)):
            xx = int(((x0 + np.cos(ang) * L * t_) % 1.0) * px)
            yy = int(((y0 + np.sin(ang) * L * t_) % 1.0) * px)
            c[yy, xx] -= 0.10
    c = c - 0.06 * np.clip((per(3, 40, 9) - 0.6) * 4.0, 0, 1)         # veios de ferrugem escuros
    out = np.stack([c * 0.99, c * 1.0, c * 1.02], -1)
    return np.clip(out, 0, 1).astype(np.float32)
