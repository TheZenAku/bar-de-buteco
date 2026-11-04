# moto_textura.py - pinta o atlas da moto (54_moto_tripo.py) a partir dos mapas assados no proprio atlas:
# posicao e normal de mundo, id da peca e oclusao ambiente. So numpy (roda no Blender e no Python do sistema).
# Cada texel e pintado em funcao da posicao 3D, entao pneu, aro, disco, mostrador e frisos nao tem costura entre
# ilhas de UV. Cores em sRGB 0..1. A pintura (tanque, carenagem) sai quase branca: o material Moto_Pintura multiplica
# pela cor da moto (baseColorFactor), e o jogo pode trocar a cor sem outra textura.
import numpy as np
import carro_textura as ct

ruido, fbm, sstep, cor, mistura, faixa, circulo, desfocar = (ct.ruido, ct.fbm, ct.sstep, ct.cor, ct.mistura, ct.faixa,
                                                             ct.circulo, ct.desfocar)
YF, YT, ZC = -0.69, 0.69, 0.29
PAINEL_C = np.array([0.0, -0.372, 1.068], np.float32)
PAINEL_N = np.array([0.0, 0.8, 0.6], np.float32)
# eixos do mostrador: direita da tela = -X (o piloto olha para -Y), cima da tela = -e2
E_DIR = np.array([-1.0, 0.0, 0.0], np.float32)
E_CIMA = np.array([0.0, -0.6, 0.8], np.float32)
VARREDURA = 270.0          # graus do zero (7h30) ate o fundo de escala (4h30), no sentido horario
ZERO_CW = 225.0            # angulo horario, a partir de 12h, do zero da escala


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
    g3 = fbm(P, 14.0)
    ao = AO[..., None]
    suj = sstep(0.60, 0.20, z) * (0.5 + 0.5 * fbm(P, 7.0))          # poeira de rua subindo do chao

    def solido(base, gr=0.05, k_ao=0.6):
        v = np.ones((H, W, 3), np.float32) * cor(*base)
        v *= (1 - gr + 2 * gr * g2)[..., None]
        return v * ((1 - k_ao) + k_ao * ao)

    # ------------------------------------------------------------ pintura (multiplicada pela cor da moto)
    mk = m("tanque", "carenagem")
    c = np.ones((H, W, 3), np.float32) * 0.95
    c *= (0.96 + 0.06 * g1)[..., None]
    c = mistura(c, cor(0.55, 0.50, 0.44), suj * 0.5)
    # tanque: joelheiras de borracha, frisos e emblema redondo dos dois lados
    tq = m("tanque") & (np.abs(nx) > 0.35)
    dj = np.sqrt(((y + 0.065) / 0.095) ** 2 + ((z - 0.835) / 0.068) ** 2)
    joelho = tq & (ax > 0.080) & (dj < 1.0)
    c = mistura(c, cor(0.11, 0.10, 0.10), (joelho * sstep(1.0, 0.8, dj)).astype(np.float32))
    c[tq & (faixa(z, 0.918, 0.926, 0.0015) > 0.5) & (ax > 0.07) & (y > -0.27) & (y < 0.10)] = cor(0.93, 0.88, 0.70)
    c[tq & (faixa(z, 0.742, 0.748, 0.0015) > 0.5) & (ax > 0.09) & (y > -0.22) & (y < 0.08)] = cor(0.93, 0.88, 0.70)
    d = np.sqrt((y + 0.115) ** 2 + (z - 0.865) ** 2)
    emb = tq & (ax > 0.10) & (d < 0.050)
    c = mistura(c, cor(0.93, 0.88, 0.70), (emb & (d > 0.042)).astype(np.float32))
    c = mistura(c, cor(0.07, 0.06, 0.06), (emb & (d <= 0.042)).astype(np.float32))
    h_ = emb & (d < 0.030) & (((np.abs(y + 0.115 - 0.011) < 0.0045) | (np.abs(y + 0.115 + 0.011) < 0.0045)) &
                              (np.abs(z - 0.865) < 0.025) | (np.abs(z - 0.865) < 0.0045))
    c[h_] = cor(0.93, 0.88, 0.70)
    # bordas dos para-lamas: faixa preta de borracha embaixo do dianteiro
    fr = m("carenagem") & (np.abs(y - YF) < 0.35) & (np.abs(nz) < 0.3)
    c[fr & (z < 0.30)] = cor(0.05, 0.05, 0.055)
    c *= (0.45 + 0.55 * ao)
    out[mk] = c[mk]

    # ------------------------------------------------------------ banco: vinil preto com costura losangular
    mk = m("banco")
    v = np.ones((H, W, 3), np.float32) * cor(0.040, 0.040, 0.044)
    topo = nz > 0.35
    pasp = (np.abs(((y * 0.9 + x * 1.6) / 0.07) % 1.0 - 0.5) < 0.035) | (np.abs(((y * 0.9 - x * 1.6) / 0.07) % 1.0 - 0.5) < 0.035)
    v[topo & pasp] = cor(0.012, 0.012, 0.014)
    miolo = np.abs(x) < 0.085
    v[topo & miolo & ~pasp] = cor(0.058, 0.058, 0.064)
    cost = (np.abs(ax - 0.118) < 0.0025) | (np.abs(z - 0.745) < 0.0022) & ~topo
    v[cost] = cor(0.30, 0.28, 0.24)
    v *= (0.85 + 0.3 * g2)[..., None]
    out[mk] = (v * (0.35 + 0.65 * ao))[mk]

    # ------------------------------------------------------------ pneus (frente e tras, cada um no seu centro)
    yc = np.where(y < 0, YF, YT)
    dy, dz = y - yc, z - ZC
    r = np.sqrt(dy ** 2 + dz ** 2)
    ang = np.arctan2(dz, dy)
    mk = m("pneu")
    v = np.ones((H, W, 3), np.float32) * cor(0.050, 0.050, 0.054)
    banda = r > 0.262
    ch = np.abs(np.sin(ang * 26 + ax * 55)) < 0.20                       # blocos em V
    sulco = banda & (ch & (ax > 0.012) | (ax < 0.009) | (np.abs(ax - 0.038) < 0.004))
    v[sulco] = cor(0.016, 0.016, 0.018)
    v[banda & ~sulco] = cor(0.075, 0.075, 0.08)
    v[(r < 0.222) & ~banda] = cor(0.13, 0.13, 0.14)
    flanco = ~banda
    v[flanco & (np.abs(r - 0.236) < 0.0035)] = cor(0.12, 0.12, 0.125)
    v[flanco & (np.abs(r - 0.247) < 0.0020)] = cor(0.10, 0.10, 0.105)
    letras = flanco & (r > 0.222) & (r < 0.232) & (np.abs(np.sin(ang * 70)) > 0.55) & \
        ((np.sin(ang * 2.0 + 0.7) > 0.30) | (np.sin(ang * 2.0 + 0.7) < -0.82))
    v[letras] = cor(0.58, 0.58, 0.56)
    v = mistura(v, cor(0.26, 0.22, 0.18), sstep(0.24, 0.29, r) * 0.28 * g3 * (0.4 + suj))
    out[mk] = (v * (0.45 + 0.55 * ao))[mk]

    # ------------------------------------------------------------ aro de liga, raios, cubo, disco, tambor, coroa
    mk = m("aro")
    v = np.ones((H, W, 3), np.float32) * cor(0.72, 0.73, 0.76)
    v[r < 0.205] = cor(0.50, 0.51, 0.54)                                      # dentro do aro
    v[np.abs(r - 0.226) < 0.0025] = cor(0.86, 0.87, 0.89)                     # friso polido da borda
    v = mistura(v, cor(0.30, 0.27, 0.23), 0.22 * g3)
    out[mk] = (v * (0.65 + 0.35 * ao))[mk]
    mk = m("raio")
    v = np.ones((H, W, 3), np.float32) * cor(0.86, 0.87, 0.90)
    v *= (0.85 + 0.25 * sstep(0.2, 1.0, np.abs(nx)))[..., None]
    v = mistura(v, cor(0.30, 0.27, 0.23), 0.15 * g3)
    out[mk] = (v * (0.7 + 0.3 * ao))[mk]
    mk = m("cubo")
    v = solido((0.52, 0.53, 0.56), 0.08, 0.6)
    out[mk] = v[mk]
    mk = m("disco")
    v = np.ones((H, W, 3), np.float32) * cor(0.52, 0.53, 0.55)
    nb = 12
    a2 = ((ang / (2 * np.pi)) * nb) % 1.0 - 0.5
    for rr in (0.095, 0.125):                                                  # furos
        dd = np.sqrt(((a2) * 2 * np.pi * rr / nb) ** 2 + (r - rr) ** 2)
        v = mistura(v, cor(0.02, 0.02, 0.02), circulo(dd, 0.0075, 0.0012) * (np.abs(r - rr) < 0.02))
    v[r < 0.085] = cor(0.16, 0.16, 0.17)
    v[np.abs(r - 0.1485) < 0.0020] = cor(0.75, 0.76, 0.78)
    v = mistura(v, cor(0.40, 0.18, 0.08), 0.30 * sstep(0.12, 0.15, r) * g3)   # queimado na pista de frenagem
    out[mk] = v[mk]
    mk = m("tambor")
    v = solido((0.42, 0.43, 0.45), 0.08, 0.6)
    v[np.abs(r - 0.099) < 0.003] = cor(0.12, 0.12, 0.13)
    out[mk] = v[mk]
    mk = m("coroa")
    v = np.ones((H, W, 3), np.float32) * cor(0.52, 0.52, 0.54)
    dente = (r > 0.092) & (np.abs(((ang / (2 * np.pi)) * 40) % 1.0 - 0.5) < 0.22)
    v[dente] = cor(0.20, 0.20, 0.22)
    v[(r < 0.068)] = cor(0.25, 0.25, 0.27)
    out[mk] = (v * (0.45 + 0.55 * ao))[mk]

    # ------------------------------------------------------------ metais: cromo, aco, escapamento
    mk = m("cromo")
    ref = 0.5 + 0.5 * nz
    v = np.ones((H, W, 3), np.float32) * cor(0.74, 0.76, 0.80)
    v *= (0.55 + 0.55 * sstep(0.1, 0.95, ref))[..., None]
    v = mistura(v, cor(0.30, 0.34, 0.40), sstep(0.5, 0.2, ref) * 0.6)
    out[mk] = (v * (0.5 + 0.5 * ao))[mk]
    mk = m("aco")
    v = solido((0.40, 0.41, 0.44), 0.10, 0.6)
    v = mistura(v, cor(0.28, 0.24, 0.20), 0.3 * g3)
    out[mk] = v[mk]
    mk = m("escapamento")
    v = np.ones((H, W, 3), np.float32) * cor(0.68, 0.69, 0.72)
    v *= (0.55 + 0.5 * sstep(0.1, 0.95, 0.5 + 0.5 * nz))[..., None]
    queimado = (y < 0.22) & (np.abs(x) < 0.14)
    v = mistura(v, cor(0.36, 0.28, 0.40), queimado * 0.55 * g1)
    v[(y > 0.97)] = cor(0.12, 0.11, 0.11)                                       # ponteira
    v[(y > 0.31) & (y < 0.325)] = cor(0.20, 0.20, 0.21)                         # abracadeira
    v[(y > 0.88) & (y < 0.90)] = cor(0.22, 0.22, 0.23)
    out[mk] = (v * (0.4 + 0.6 * ao))[mk]

    # ------------------------------------------------------------ motor
    mk = m("motor")
    v = np.ones((H, W, 3), np.float32) * cor(0.46, 0.47, 0.49)
    v = mistura(v, cor(0.15, 0.15, 0.16), (z > 0.52).astype(np.float32) * sstep(0.50, 0.56, z))   # cilindro/cabecote escuros
    v = mistura(v, cor(0.30, 0.27, 0.24), 0.35 * g1)
    d = np.sqrt((ax - 0.100) ** 2 + (y - 0.060) ** 2 + (z - 0.420) ** 2)
    v = mistura(v, cor(0.62, 0.63, 0.65), circulo(np.sqrt((y - 0.060) ** 2 + (z - 0.420) ** 2), 0.066, 0.002) * (x > 0.085))
    v = mistura(v, cor(0.15, 0.15, 0.16), circulo(np.sqrt((y - 0.060) ** 2 + (z - 0.420) ** 2), 0.014, 0.002) * (x > 0.085))
    v[(faixa(z, 0.288, 0.296, 0.001) > 0.5) & (np.abs(x) < 0.101)] = cor(0.08, 0.08, 0.09)       # carter
    v = mistura(v, cor(0.22, 0.22, 0.24), ((ny > 0.8) & (y > 0.2)) * 0.6)
    out[mk] = (v * (0.38 + 0.62 * ao))[mk]
    mk = m("aleta")
    v = solido((0.58, 0.59, 0.61), 0.06, 0.7)
    out[mk] = v[mk]

    # ------------------------------------------------------------ quadro, pecas pretas e borrachas
    for nome, base, gr, k in (("quadro", (0.030, 0.030, 0.036), 0.05, 0.5), ("plastico", (0.062, 0.062, 0.068), 0.07, 0.6),
                              ("borracha", (0.028, 0.028, 0.030), 0.10, 0.5), ("bagageiro", (0.045, 0.045, 0.05), 0.08, 0.6),
                              ("descanso", (0.050, 0.050, 0.054), 0.08, 0.6), ("lanterna_casco", (0.04, 0.04, 0.045), 0.06, 0.6),
                              ("espelho_casco", (0.05, 0.05, 0.055), 0.05, 0.6), ("manete", (0.14, 0.14, 0.15), 0.08, 0.6),
                              ("pedal", (0.34, 0.34, 0.36), 0.10, 0.6), ("amortecedor", (0.16, 0.16, 0.17), 0.08, 0.6)):
        mk = m(nome)
        out[mk] = solido(base, gr, k)[mk]
    mk = m("corrente")
    v = solido((0.10, 0.10, 0.11), 0.08, 0.6)
    v[np.abs(np.sin(y * 260)) > 0.78] = cor(0.34, 0.34, 0.36)
    v = mistura(v, cor(0.30, 0.18, 0.06), 0.35 * g1)
    out[mk] = v[mk]
    mk = m("mola")
    v = solido((0.80, 0.58, 0.10), 0.05, 0.7)
    out[mk] = v[mk]
    mk = m("pinca")
    v = solido((0.66, 0.54, 0.16), 0.05, 0.7)
    out[mk] = v[mk]

    # ------------------------------------------------------------ farol, painel, espelhos
    mk = m("farol_casco")
    ref = 0.5 + 0.5 * nz
    v = np.ones((H, W, 3), np.float32) * cor(0.70, 0.72, 0.75)
    v *= (0.55 + 0.55 * sstep(0.1, 0.95, ref))[..., None]
    v[(ny > 0.9) & (np.sqrt((y + 0.5) ** 2) < 1)] *= 0.9
    out[mk] = (v * (0.45 + 0.55 * ao))[mk]
    mk = m("painel")
    out[mk] = solido((0.045, 0.045, 0.05), 0.05, 0.5)[mk]
    mk = m("espelho_vidro")
    v = mistura(np.ones((H, W, 3), np.float32) * cor(0.40, 0.46, 0.52), cor(0.82, 0.90, 0.96), sstep(0.2, 0.9, ax * 0 + (z - 1.19) * 18 + 0.5))
    out[mk] = v[mk]
    # mostrador: escala, numeros em tracos, zona vermelha e miolo; o ponteiro e outra peca
    mk = m("mostrador")
    pv = P - PAINEL_C
    rr = (pv * E_DIR).sum(-1)
    uu = (pv * E_CIMA).sum(-1)
    rad = np.sqrt(rr ** 2 + uu ** 2)
    acw = (np.degrees(np.arctan2(rr, uu)) - ZERO_CW) % 360.0               # graus desde o zero, no sentido horario
    v = np.ones((H, W, 3), np.float32) * cor(0.035, 0.036, 0.04)
    v = mistura(v, cor(0.07, 0.07, 0.08), circulo(rad, 0.040, 0.002))
    na = 12
    passo = VARREDURA / na
    f = (acw / passo) % 1.0
    dentro = acw <= VARREDURA + 0.5
    maior = (np.abs(f - 0.5) > 0.5 - 0.06) & dentro
    menor = (np.abs(((acw / (passo / 2)) % 1.0) - 0.5) > 0.5 - 0.07) & dentro
    v[maior & (rad > 0.031) & (rad < 0.043)] = cor(0.92, 0.92, 0.86)
    v[menor & ~maior & (rad > 0.036) & (rad < 0.043)] = cor(0.70, 0.70, 0.66)
    v[(acw > VARREDURA - 2 * passo) & dentro & (rad > 0.043) & (rad < 0.046)] = cor(0.85, 0.10, 0.08)
    v[(acw <= VARREDURA) & (rad > 0.0455) & (rad < 0.0475)] = cor(0.55, 0.55, 0.52)
    # numeros estilizados (blocos) a cada 20 km/h
    for k in range(0, na + 1, 2):
        a = np.radians(ZERO_CW + k * passo)
        cx, cy = 0.021 * np.sin(a), 0.021 * np.cos(a)
        blk = (np.abs(rr - cx) < 0.0042) & (np.abs(uu - cy) < 0.0060) & (np.abs(((rr - cx) * 200 + (uu - cy) * 90)) % 2.0 < 1.1)
        v[blk] = cor(0.88, 0.88, 0.82)
    v = mistura(v, cor(0.62, 0.62, 0.64), circulo(rad, 0.0075, 0.0015))
    v = mistura(v, cor(0.85, 0.50, 0.12), np.clip(circulo(rad, 0.050, 0.0006) - circulo(rad, 0.048, 0.0006), 0, 1) * 0)
    out[mk] = v[mk]
    mk = m("ponteiro")
    out[mk] = solido((0.95, 0.35, 0.08), 0.02, 0.2)[mk]

    out = np.clip(out, 0.0, 1.0)
    out[~cobre] = 0.12
    return out


# ---------------------------------------------------------------- placa Mercosul de moto (20 x 17 cm, duas linhas)
def placa(linha1="BAR", linha2="1H26", w=400, h=340):
    img = np.ones((h, w, 3), np.float32) * 0.96
    img[:5], img[-5:], img[:, :5], img[:, -5:] = 0.1, 0.1, 0.1, 0.1
    img[5:60, 5:-5] = (0.05, 0.20, 0.55)
    esc = 5
    lt = ct.largura_texto("BRASIL", esc)
    ct.texto(img, "BRASIL", (w - lt) // 2, 14, esc, (0.97, 0.97, 0.97))
    img[18:46, 18:62] = (0.10, 0.45, 0.22)
    img[24:40, 28:52] = (0.95, 0.80, 0.10)
    for txt, y0 in ((linha1, 76), (linha2, 192)):
        esc = 16
        lt = ct.largura_texto(txt, esc)
        ct.texto(img, txt, (w - lt) // 2, y0, esc, (0.05, 0.05, 0.06))
    return img


# ---------------------------------------------------------------- bau: logo dos dois lados e atras, vermelho liso no resto
def _ler_logo(caminho):
    try:
        from PIL import Image
        im = Image.open(caminho).convert("RGBA")
        return np.asarray(im, np.float32) / 255.0
    except ImportError:
        import bpy
        img = bpy.data.images.load(caminho)
        img.colorspace_settings.name = 'Non-Color'
        w, h = img.size
        a = np.empty(w * h * 4, np.float32)
        img.pixels.foreach_get(a)
        bpy.data.images.remove(img)
        return a.reshape(h, w, 4)[::-1].copy()


def _redimensionar(a, w, h):
    """amostragem por area (caixa) simples; a em (H, W, 4)"""
    H0, W0 = a.shape[:2]
    ys = (np.arange(h) + 0.5) * H0 / h
    xs = (np.arange(w) + 0.5) * W0 / w
    # media de blocos quando reduz muito
    fy, fx = max(1, int(H0 / h)), max(1, int(W0 / w))
    out = np.zeros((h, w, 4), np.float32)
    n = 0
    for dy in range(fy):
        for dx in range(fx):
            yy = np.clip((ys - fy / 2 + dy + 0.5).astype(int), 0, H0 - 1)
            xx = np.clip((xs - fx / 2 + dx + 0.5).astype(int), 0, W0 - 1)
            out += a[yy][:, xx]
            n += 1
    return out / n


def textura_bau(caminho_logo, px=1024):
    q = px // 2
    base = np.ones((px, px, 3), np.float32) * cor(0.74, 0.050, 0.040)
    yy, xx = np.mgrid[0:px, 0:px]
    base *= (0.93 + 0.10 * ruido(np.stack([xx / 90.0, yy / 90.0, xx * 0], -1).astype(np.float32), 1.0))[..., None]
    logo = _ler_logo(caminho_logo)
    # (coluna0, linha0, largura do logo em px, altura em px): o logo fica quadrado no mundo (0,27 m) apesar do esticar
    for c0, r0, lw, lh in ((0, 0, int(q * 0.27 / 0.42), int(q * 0.27 / 0.30)),
                           (q, 0, int(q * 0.27 / 0.42), int(q * 0.27 / 0.30)),
                           (0, q, int(q * 0.22 / 0.42), int(q * 0.22 / 0.30))):
        im = _redimensionar(logo, lw, lh)
        x0 = c0 + (q - lw) // 2
        y0 = r0 + (q - lh) // 2
        a = im[..., 3:4]
        base[y0:y0 + lh, x0:x0 + lw] = base[y0:y0 + lh, x0:x0 + lw] * (1 - a) + im[..., :3] * a
    # lado D (quadrante 2): o mapeamento ja espelha o eixo Y, entao a imagem fica como esta
    return np.clip(base, 0, 1)
