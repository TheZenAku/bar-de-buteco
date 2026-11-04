# carro_textura.py - pinta o atlas do carro (21_carro_hatch.py) a partir dos mapas assados no proprio atlas:
# posicao e normal de mundo, id da peca e oclusao ambiente. So numpy (roda no Blender e no Python do sistema).
# Cada texel e pintado em funcao da posicao 3D, entao frisos, grade, lentes, aro e tecidos nao tem costura entre
# ilhas de UV. Cores em sRGB 0..1. A pintura da lataria sai quase branca: o material Carro_Pintura multiplica pela
# cor do carro (baseColorFactor), e o jogo pode trocar a cor sem outra textura.
import numpy as np

C = dict(YC_D=-1.157, YC_T=1.157, ZC=0.29, X_RODA=0.665, Y_WS0=-0.796, Y_CAPF=-1.765, Y_CAPR=1.795)


def _hash(ix, iy, iz):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xFFFF).astype(np.float32) / 65535.0


def ruido(P, freq):
    """value noise 3D suave em [0, 1]"""
    q = P * freq
    i = np.floor(q).astype(np.int64)
    f = q - i
    f = f * f * (3 - 2 * f)
    out = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[..., 0] if dx else 1 - f[..., 0]) * (f[..., 1] if dy else 1 - f[..., 1]) * \
                    (f[..., 2] if dz else 1 - f[..., 2])
                out = out + w * _hash(i[..., 0] + dx, i[..., 1] + dy, i[..., 2] + dz)
    return out


def fbm(P, freq, oit=3):
    s, a, tot = 0.0, 1.0, 0.0
    for _ in range(oit):
        s = s + a * ruido(P, freq)
        tot += a
        freq *= 2.03
        a *= 0.5
    return s / tot


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def cor(*c):
    return np.array(c, np.float32)


def mistura(base, outra, k):
    return base * (1 - k[..., None]) + outra * k[..., None]


def faixa(v, a, b, suave=0.002):
    """1 dentro de [a, b] com borda suave"""
    return sstep(a - suave, a + suave, v) * (1 - sstep(b - suave, b + suave, v))


def circulo(d, r, suave=0.002):
    return 1 - sstep(r - suave, r + suave, d)


def desfocar(A, mascara, passes=2):
    """caixa 3x3 so entre texels cobertos (tira o chuvisco do AO sem vazar para o fundo)"""
    w = mascara.astype(np.float32)
    A = A * w
    for _ in range(passes):
        s = np.zeros_like(A)
        n = np.zeros_like(w)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                s += np.roll(np.roll(A, dy, 0), dx, 1)
                n += np.roll(np.roll(w, dy, 0), dx, 1)
        A = np.where(mascara, s / np.maximum(n, 1e-6), 0.0)
    return A


def pintar_atlas(R, PECAS):
    P, N, ID, AO, cobre = R["pos"], R["nor"], R["peca"], R["ao"], R["cobre"]
    AO = desfocar(np.clip(AO, 0.0, 1.0), cobre, 2)
    H, W = ID.shape
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    ax = np.abs(x)
    nx, ny, nz = N[..., 0], N[..., 1], N[..., 2]
    nome_de = {i: n for i, n in enumerate(PECAS)}

    def m(*nomes):
        ids = [i for i, n in nome_de.items() if n in nomes or any(n.startswith(p + "_") for p in nomes)]
        return np.isin(ID, ids) & cobre

    out = np.zeros((H, W, 3), np.float32) + 0.5
    g1 = fbm(P, 3.0)
    g2 = ruido(P, 40.0)
    sujeira = sstep(0.55, 0.27, z) * (0.55 + 0.45 * fbm(P, 6.0))

    # --------------------------------------------------------- pintura (vai multiplicada pela cor do carro)
    pint = m("lataria", "porta", "capo", "tampa", "borda", "capo_interno", "tampa_interna")
    c = np.ones((H, W, 3), np.float32) * 0.94
    c *= (0.965 + 0.05 * g1)[..., None]
    c = mistura(c, cor(0.62, 0.57, 0.50), sujeira * 0.55)
    # caixas de roda: poeira em volta da boca do para-lama
    for yc in (C["YC_D"], C["YC_T"]):
        d = np.sqrt((y - yc) ** 2 + (z - C["ZC"]) ** 2)
        c = mistura(c, cor(0.55, 0.50, 0.44), sstep(0.47, 0.37, d) * (ax > 0.6) * 0.45 * (0.5 + 0.5 * fbm(P, 9.0)))
    lado = np.abs(nx) > 0.55
    # friso lateral de borracha preta (portas e para-lamas)
    friso = lado & (ax > 0.6) & faixa(z, 0.737, 0.773, 0.0015).astype(bool) & (y > -0.83) & (y < 0.845)
    c[friso] = cor(0.055, 0.055, 0.06)
    c[lado & (ax > 0.6) & (faixa(z, 0.770, 0.774, 0.001) > 0.5) & (y > -0.83) & (y < 0.845)] = cor(0.16, 0.16, 0.17)
    # soleira preta entre as rodas e fundo do carro
    sol = (z < 0.338) & (np.abs(y) < 0.80) & (ny * ny < 0.5)
    c[sol] = cor(0.07, 0.07, 0.075) * (0.9 + 0.2 * g2[sol])[..., None]
    fundo = (nz < -0.6) & (z < 0.45)
    c[fundo] = (cor(0.11, 0.105, 0.10) * (0.8 + 0.4 * g1[fundo])[..., None])
    # rebaixo atras da macaneta, tampinha do tanque (lado direito), fechadura e puxador da tampa
    mac = lado & (ax > 0.6) & (faixa(y, 0.225, 0.415, 0.004) * faixa(z, 0.805, 0.856, 0.004) > 0.5)
    c[mac] *= 0.55
    dt = np.sqrt((y - 1.02) ** 2 + (z - 0.80) ** 2)
    tanque = lado & (x < -0.6) & (np.abs(dt - 0.052) < 0.0028)
    c[tanque] = cor(0.25, 0.25, 0.26)
    tras = (ny > 0.6) & (y > 1.7)
    puxa = tras & (np.abs(x) < 0.13) & (faixa(z, 0.825, 0.840, 0.002) > 0.5)
    c[puxa] = cor(0.08, 0.08, 0.085)
    fech = tras & (np.sqrt(x ** 2 + (z - 0.85) ** 2) < 0.011)
    c[fech] = cor(0.55, 0.55, 0.57)
    c[m("capo_interno", "tampa_interna")] *= 0.82
    ao = AO[..., None]
    c *= (0.42 + 0.58 * ao)
    out[pint] = c[pint]

    # --------------------------------------------------------- vidro preto do quebra-vento, plasticos, borrachas
    def plast(base, gr=0.05, k_ao=0.6):
        v = np.ones((H, W, 3), np.float32) * cor(*base)
        v *= (1 - gr + 2 * gr * g2)[..., None]
        return v * ((1 - k_ao) + k_ao * ao)

    for nome, base in (("quebra_vento", (0.05, 0.05, 0.055)), ("plastico", (0.065, 0.065, 0.07)),
                       ("palheta", (0.04, 0.04, 0.045)), ("volante", (0.055, 0.055, 0.06)),
                       ("roda_interna", (0.04, 0.04, 0.04)), ("nicho", (0.09, 0.09, 0.095)),
                       ("macaneta", (0.07, 0.07, 0.075))):
        mk = m(nome)
        out[mk] = plast(base)[mk]
    mk = m("caixa_roda")
    v = plast((0.075, 0.07, 0.065), 0.08, 0.7)
    v = mistura(v, cor(0.30, 0.26, 0.21), 0.35 * fbm(P, 7.0))
    out[mk] = v[mk]
    # para-choques: plastico preto com friso de borracha e poeira embaixo
    mk = m("parachoque")
    v = plast((0.085, 0.085, 0.09), 0.06, 0.55)
    fr = np.where(y < 0, faixa(z, 0.440, 0.470, 0.002), faixa(z, 0.465, 0.495, 0.002))
    v = mistura(v, cor(0.045, 0.045, 0.05), fr)
    v = mistura(v, cor(0.16, 0.16, 0.17), np.where(y < 0, faixa(z, 0.470, 0.474, 0.001), faixa(z, 0.495, 0.499, 0.001)))
    v = mistura(v, cor(0.27, 0.24, 0.20), sstep(0.36, 0.27, z) * 0.5 * fbm(P, 8.0))
    out[mk] = v[mk]
    # cromo e espelho
    mk = m("cromo")
    v = np.ones((H, W, 3), np.float32) * cor(0.70, 0.71, 0.74)
    v *= (0.8 + 0.25 * sstep(0.3, 1.0, nz * 0.5 + 0.5))[..., None]
    out[mk] = (v * (0.5 + 0.5 * ao))[mk]
    mk = m("espelho")
    v = mistura(np.ones((H, W, 3), np.float32) * cor(0.30, 0.32, 0.30), cor(0.66, 0.74, 0.82),
                sstep(0.86, 0.98, z) + (z > 1.1))
    out[mk] = v[mk]
    # escapamento
    mk = m("escapamento")
    v = mistura(np.ones((H, W, 3), np.float32) * cor(0.24, 0.20, 0.17), cor(0.36, 0.20, 0.10), fbm(P, 20.0))
    out[mk] = (v * (0.5 + 0.5 * ao))[mk]

    # --------------------------------------------------------- grade com frisos horizontais e emblema
    mk = m("grade")
    v = np.ones((H, W, 3), np.float32) * cor(0.035, 0.035, 0.04)
    t = (z - 0.585) / 0.022
    friso_g = (np.abs(t - np.round(t)) < 0.22) & (z > 0.58) & (z < 0.69)
    v[friso_g] = cor(0.15, 0.15, 0.16)
    moldura = (ax > 0.365) | (z < 0.580) | (z > 0.690)
    v[moldura] = cor(0.10, 0.10, 0.11)
    de = np.sqrt(x ** 2 + (z - 0.637) ** 2)
    v = mistura(v, cor(0.75, 0.76, 0.78), circulo(de, 0.030, 0.0015))
    v = mistura(v, cor(0.10, 0.17, 0.42), circulo(de, 0.023, 0.0015))
    # um "H" cromado no emblema (Highland)
    hh = ((np.abs(np.abs(x) - 0.009) < 0.0028) & (np.abs(z - 0.637) < 0.014)) | \
         ((np.abs(x) < 0.009) & (np.abs(z - 0.637) < 0.0025))
    v[hh] = cor(0.80, 0.81, 0.83)
    out[mk] = (v * (0.55 + 0.45 * ao))[mk]

    # --------------------------------------------------------- pneus e rodas (as 4 usam a roda dianteira esquerda)
    dy, dz = y - C["YC_D"], z - C["ZC"]
    r = np.sqrt(dy ** 2 + dz ** 2)
    ang = np.arctan2(dz, dy)
    xl = x - C["X_RODA"]
    mk = m("pneu")
    v = np.ones((H, W, 3), np.float32) * cor(0.065, 0.065, 0.068)
    banda = r > 0.272
    sulco = banda & ((np.abs(np.abs(xl) - 0.032) < 0.006) | (np.abs(np.sin(ang * 22)) < 0.16) & (np.abs(xl) < 0.075))
    v[sulco] = cor(0.025, 0.025, 0.027)
    flanco = (~banda) & (np.abs(r - 0.248) < 0.004)
    v[flanco] = cor(0.11, 0.11, 0.115)
    letras = (~banda) & (xl > 0) & (np.abs(r - 0.226) < 0.007) & (np.abs(np.sin(ang * 60)) > 0.55) & \
             ((np.sin(ang * 2.0) > 0.35) | (np.sin(ang * 2.0) < -0.75))
    v[letras] = cor(0.10, 0.10, 0.105)
    v = mistura(v, cor(0.22, 0.19, 0.16), sstep(0.24, 0.29, r) * 0.25 * fbm(P, 12.0))
    out[mk] = (v * (0.5 + 0.5 * ao))[mk]
    mk = m("roda")
    v = np.ones((H, W, 3), np.float32) * cor(0.60, 0.61, 0.62)
    v[(r > 0.176)] = cor(0.52, 0.53, 0.54)
    for k in range(8):                                    # furos de ventilacao
        a = k * np.pi / 4 + np.pi / 8
        d = np.sqrt((dy - 0.138 * np.cos(a)) ** 2 + (dz - 0.138 * np.sin(a)) ** 2)
        v = mistura(v, cor(0.03, 0.03, 0.03), circulo(d, 0.018, 0.0015))
        v = mistura(v, cor(0.35, 0.35, 0.36), np.clip(circulo(d, 0.022, 0.0015) - circulo(d, 0.018, 0.0015), 0, 1))
    for k in range(4):                                    # porcas
        a = k * np.pi / 2
        d = np.sqrt((dy - 0.074 * np.cos(a)) ** 2 + (dz - 0.074 * np.sin(a)) ** 2)
        v = mistura(v, cor(0.30, 0.30, 0.31), circulo(d, 0.010, 0.0012))
    v = mistura(v, cor(0.70, 0.71, 0.72), circulo(r, 0.048, 0.002))
    v = mistura(v, cor(0.18, 0.18, 0.19), circulo(r, 0.012, 0.0015))
    v = mistura(v, cor(0.40, 0.37, 0.33), 0.25 * fbm(P, 10.0))
    out[mk] = (v * (0.45 + 0.55 * ao))[mk]

    # --------------------------------------------------------- cofre do motor
    mk = m("motor")
    v = np.ones((H, W, 3), np.float32) * cor(0.34, 0.34, 0.36)
    v[z > 0.61] = cor(0.13, 0.13, 0.14)
    v = mistura(v, cor(0.16, 0.13, 0.10), 0.45 * fbm(P, 9.0))
    v[(y > C["Y_WS0"] - 0.05)] = cor(0.16, 0.16, 0.17)              # corta-fogo
    out[mk] = (v * (0.4 + 0.6 * ao))[mk]
    mk = m("bateria")
    v = np.ones((H, W, 3), np.float32) * cor(0.07, 0.07, 0.08)
    topo = nz > 0.7
    v[topo] = cor(0.22, 0.22, 0.24)
    for xt, cc in ((0.42, (0.7, 0.08, 0.06)), (0.52, (0.05, 0.05, 0.05))):
        d = np.sqrt((x - xt) ** 2 + (y + 1.42) ** 2)
        v[topo & (d < 0.014)] = cor(*cc)
    out[mk] = (v * (0.5 + 0.5 * ao))[mk]
    mk = m("radiador")
    v = np.ones((H, W, 3), np.float32) * cor(0.06, 0.06, 0.065)
    v[(np.sin(z * 900) > 0.2)] = cor(0.13, 0.13, 0.14)
    out[mk] = v[mk]

    # --------------------------------------------------------- interior
    mk = m("painel")
    v = plast((0.10, 0.10, 0.11), 0.05, 0.6)
    frente = (ny > 0.6) & (y > -0.48) & (y < -0.43)
    for xv in (-0.08, 0.08, 0.58, -0.58):                            # difusores de ar
        cx = frente & (np.abs(x - xv) < (0.055 if abs(xv) < 0.1 else 0.045)) & (np.abs(z - 0.785) < 0.028)
        lam = np.abs(np.sin(z * 260)) > 0.55
        v[cx] = cor(0.03, 0.03, 0.035)
        v[cx & lam] = cor(0.12, 0.12, 0.13)
    porta_luvas = frente & (np.abs(np.abs(x + 0.36) - 0.17) < 0.0025) & (z > 0.645) & (z < 0.745) | \
        frente & (x < -0.19) & (x > -0.53) & (np.abs(np.abs(z - 0.695) - 0.05) < 0.0025)
    v[porta_luvas] = cor(0.04, 0.04, 0.045)
    out[mk] = v[mk]
    mk = m("quadro")
    v = np.ones((H, W, 3), np.float32) * cor(0.025, 0.025, 0.03)
    for xg in (0.275, 0.445):                                        # velocimetro e conta-giros
        d = np.sqrt((x - xg) ** 2 + (z - 0.800) ** 2)
        a = np.arctan2(z - 0.8, x - xg)
        v = mistura(v, cor(0.06, 0.06, 0.07), circulo(d, 0.046, 0.0012))
        traco = (d > 0.034) & (d < 0.042) & (np.abs(np.sin(a * 12)) < 0.22) & (a > -0.75)
        v[traco] = cor(0.85, 0.85, 0.80)
        v = mistura(v, cor(0.65, 0.65, 0.68), np.clip(circulo(d, 0.047, 0.0008) - circulo(d, 0.044, 0.0008), 0, 1))
        pon = (np.abs((x - xg) * np.sin(2.4) - (z - 0.8) * np.cos(2.4)) < 0.0018) & (d < 0.036) & \
              ((x - xg) * np.cos(2.4) + (z - 0.8) * np.sin(2.4) > 0)
        v[pon] = cor(0.95, 0.45, 0.10)
    for i, cc in enumerate(((0.8, 0.1, 0.1), (0.1, 0.7, 0.2), (0.9, 0.6, 0.1), (0.2, 0.4, 0.9))):
        d = np.sqrt((x - 0.32 - i * 0.03) ** 2 + (z - 0.752) ** 2)
        v = mistura(v, cor(*cc) * 0.6, circulo(d, 0.005, 0.001))
    # radio no console
    rad = (z < 0.70)
    vr = np.ones((H, W, 3), np.float32) * cor(0.10, 0.10, 0.11)
    tela = rad & (np.abs(x) < 0.05) & (np.abs(z - (C["ZC"] + 0.32)) < 0.011)
    vr[tela] = cor(0.05, 0.22, 0.12)
    for xb in (-0.075, 0.075):
        d = np.sqrt((x - xb) ** 2 + (z - (C["ZC"] + 0.32)) ** 2)
        vr = mistura(vr, cor(0.30, 0.30, 0.32), circulo(d, 0.012, 0.001))
    fita = rad & (np.abs(x) < 0.07) & (np.abs(z - (C["ZC"] + 0.285)) < 0.006)
    vr[fita] = cor(0.02, 0.02, 0.02)
    v = np.where(rad[..., None], vr, v)
    out[mk] = v[mk]
    mk = m("banco")
    base = cor(0.30, 0.265, 0.235)
    v = np.ones((H, W, 3), np.float32) * base
    xs = np.where(y < 0.5, np.where(x > 0, x - 0.36, x + 0.36), np.where(x > 0, x - 0.33, x + 0.33))
    miolo = np.abs(xs) < 0.16
    listra = (np.sin((z if True else y) * 2 * np.pi / 0.03) > 0.0)
    listra = np.where(np.abs(nz) > 0.6, np.sin(y * 2 * np.pi / 0.03) > 0, np.sin(z * 2 * np.pi / 0.03) > 0)
    v[miolo & listra] = base * 0.86
    v[miolo & ~listra] = base * 1.06
    v[~miolo] = base * 0.80
    v *= (0.9 + 0.2 * g2)[..., None]
    out[mk] = (v * (0.38 + 0.62 * ao))[mk]
    mk = m("tampao")
    v = plast((0.12, 0.12, 0.125), 0.12, 0.6)
    out[mk] = v[mk]
    mk = m("quebra_sol")
    v = np.ones((H, W, 3), np.float32) * cor(0.70, 0.67, 0.61) * (0.6 + 0.4 * ao)
    out[mk] = v[mk]
    # forro da carroceria (lado de dentro): carpete, teto, colunas, cofre e porta-malas
    mk = m("forro")
    v = np.ones((H, W, 3), np.float32) * cor(0.40, 0.38, 0.35)
    v[z < 0.78] = cor(0.27, 0.255, 0.24)
    piso = (nz > 0.6) & (z < 0.45)
    v[piso] = cor(0.13, 0.13, 0.14) * (0.8 + 0.4 * g2[piso])[..., None]
    teto = (nz < -0.4) & (z > 1.05)
    v[teto] = cor(0.76, 0.73, 0.67) * (0.95 + 0.08 * g2[teto])[..., None]
    cofre = y < C["Y_WS0"] - 0.01
    v[cofre] = cor(0.17, 0.17, 0.18)
    porta_malas = (y > 1.12) & (z < 0.90)
    v[porta_malas & piso] = cor(0.11, 0.11, 0.12)
    out[mk] = (v * (0.35 + 0.65 * ao))[mk]
    mk = m("forro_porta")
    v = np.ones((H, W, 3), np.float32) * cor(0.29, 0.27, 0.25)
    v[z > 0.865] = cor(0.40, 0.38, 0.35)
    v[faixa(z, 0.70, 0.735, 0.003) > 0.5] = cor(0.16, 0.155, 0.15)
    v[z < 0.44] = cor(0.13, 0.13, 0.14)
    d = np.sqrt((y + 0.42) ** 2 + (z - 0.46) ** 2)
    alto_f = (d < 0.065) & (np.sin(y * 500) * np.sin(z * 500) > 0.2)
    v[alto_f] = cor(0.06, 0.06, 0.065)
    v[(np.abs(y + 0.33) < 0.035) & (np.abs(z - 0.80) < 0.012)] = cor(0.60, 0.61, 0.63)          # puxador
    d = np.sqrt((y - 0.05) ** 2 + (z - 0.62) ** 2)
    v = mistura(v, cor(0.10, 0.10, 0.10), circulo(d, 0.03, 0.002))                             # manivela
    out[mk] = (v * (0.35 + 0.65 * ao))[mk]

    # --------------------------------------------------------- lentes (luzes)
    def lente(base, passo_x, passo_z, k=0.85, borda=0.75):
        v = np.ones((H, W, 3), np.float32) * cor(*base)
        sx = np.abs(np.sin(x * np.pi / passo_x)) < 0.25 if passo_x else np.zeros_like(x, bool)
        sz = np.abs(np.sin(z * np.pi / passo_z)) < 0.25 if passo_z else np.zeros_like(x, bool)
        v[sx | sz] *= k
        return v * (borda + (1 - borda) * ao)

    vf = lente((0.84, 0.86, 0.84), 0.012, 0.018, 0.82)
    d = np.sqrt((ax - 0.51 * 0.95) ** 2 + (z - 0.64) ** 2)
    vf = mistura(vf, cor(0.95, 0.95, 0.92), circulo(d, 0.035, 0.01) * 0.6)
    out[m("farol")] = vf[m("farol")]
    va = lente((1.0, 0.56, 0.08), 0.008, 0.0, 0.8)
    out[m("seta_frente")] = va[m("seta_frente")]
    out[m("seta_tras")] = va[m("seta_tras")]
    out[m("lente_seta_lateral")] = va[m("lente_seta_lateral")]
    vl = lente((0.72, 0.06, 0.05), 0.015, 0.015, 0.7)
    out[m("lanterna")] = vl[m("lanterna")]
    vr_ = lente((0.90, 0.90, 0.88), 0.012, 0.012, 0.85)
    out[m("re")] = vr_[m("re")]

    out = np.clip(out, 0.0, 1.0)
    # fora das ilhas: cinza escuro neutro
    out[~cobre] = 0.12
    return out


# ---------------------------------------------------------------- placa Mercosul (sem PIL: fonte de blocos 5x7)
FONTE = {
    "B": ["1111.", "1...1", "1...1", "1111.", "1...1", "1...1", "1111."],
    "A": [".111.", "1...1", "1...1", "11111", "1...1", "1...1", "1...1"],
    "R": ["1111.", "1...1", "1...1", "1111.", "1.1..", "1..1.", "1...1"],
    "S": [".1111", "1....", "1....", ".111.", "....1", "....1", "1111."],
    "I": ["111", ".1.", ".1.", ".1.", ".1.", ".1.", "111"],
    "L": ["1....", "1....", "1....", "1....", "1....", "1....", "11111"],
    "H": ["1...1", "1...1", "1...1", "11111", "1...1", "1...1", "1...1"],
    "1": ["..1..", ".11..", "..1..", "..1..", "..1..", "..1..", ".111."],
    "2": [".111.", "1...1", "....1", "...1.", "..1..", ".1...", "11111"],
    "6": [".111.", "1....", "1....", "1111.", "1...1", "1...1", ".111."],
    "0": [".111.", "1...1", "1..11", "1.1.1", "11..1", "1...1", ".111."],
    "C": [".111.", "1...1", "1....", "1....", "1....", "1...1", ".111."],
    " ": ["....", "....", "....", "....", "....", "....", "...."],
}


def texto(img, txt, x0, y0, esc, cor_t):
    x = x0
    for ch in txt:
        g = FONTE[ch]
        for j, linha in enumerate(g):
            for i, c in enumerate(linha):
                if c == "1":
                    img[y0 + j * esc:y0 + (j + 1) * esc, x + i * esc:x + (i + 1) * esc] = cor_t
        x += (len(g[0]) + 1) * esc
    return x


def largura_texto(txt, esc):
    return sum((len(FONTE[c][0]) + 1) * esc for c in txt) - esc


def placa(texto_placa="BAR1H26", w=512, h=168):
    """placa Mercosul 40 x 13 cm (linha de cima = topo da imagem)"""
    img = np.ones((h, w, 3), np.float32) * 0.96
    img[:4], img[-4:], img[:, :4], img[:, -4:] = 0.1, 0.1, 0.1, 0.1
    img[4:34, 4:-4] = (0.05, 0.20, 0.55)
    esc = 3
    lt = largura_texto("BRASIL", esc)
    texto(img, "BRASIL", (w - lt) // 2, 9, esc, (0.97, 0.97, 0.97))
    img[10:28, 14:38] = (0.10, 0.45, 0.22)                     # bandeirinha (verde) simplificada
    img[14:24, 20:32] = (0.95, 0.80, 0.10)
    esc = 12
    lt = largura_texto(texto_placa, esc)
    texto(img, texto_placa, (w - lt) // 2, 50, esc, (0.05, 0.05, 0.06))
    return img
