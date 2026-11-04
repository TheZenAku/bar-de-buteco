# moto_textura4.py - texturas da moto v4 (57_moto_v4.py): usa a pintura da v3 (tanque, banco, pneus, rodas, cromo,
# aco, borracha, plastico) e pinta as pecas que a v4 passou a modelar: quadro, motor, aletas, coletor, silencioso,
# corrente, farol, relogios (escala, numeros, faixa vermelha), espelhos, molas, amortecedores, pinca, manetes, balanca,
# carenagens (tampas laterais e rabeta com decalque e friso), parafusos, cabos, refletor.
# Saidas: albedo e metal/rugosidade (glTF G = rugosidade, B = metal), tudo por numpy a partir do bake de dados.
import math
import numpy as np
import moto_textura3 as mt3
from moto_textura3 import (ruido, fbm, sstep, cor, mistura, faixa, circulo, desfocar, mascara_texto, largura_texto, G)

G.update({
    "4": ["...1.", "..11.", ".1.1.", "1..1.", "11111", "...1.", "...1."],
    "6": [".111.", "1....", "1....", "1111.", "1...1", "1...1", ".111."],
    "7": ["11111", "....1", "...1.", "..1..", ".1...", ".1...", ".1..."],
    "K": ["1...1", "1..1.", "1.1..", "11...", "1.1..", "1..1.", "1...1"],
    "M": ["1...1", "11.11", "1.1.1", "1.1.1", "1...1", "1...1", "1...1"],
    "X": ["1...1", "1...1", ".1.1.", "..1..", ".1.1.", "1...1", "1...1"],
    "P": ["1111.", "1...1", "1...1", "1111.", "1....", "1....", "1...."],
    "U": ["1...1", "1...1", "1...1", "1...1", "1...1", "1...1", ".111."],
    "W": ["1...1", "1...1", "1...1", "1.1.1", "1.1.1", "11.11", "1...1"],
})

# rabeta (y, zb) para o friso
RAB_Y = [0.44, 0.48, 0.55, 0.65, 0.75, 0.85, 0.905]
RAB_ZB = [.655, .662, .675, .695, .719, .746, .764]


def pintar(R, PECAS, INFO):
    out, pbr = mt3.pintar(R, PECAS)
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
    suj = sstep(0.55, 0.12, z) * (0.45 + 0.55 * fbm(P, 7.0))
    curv = np.zeros((H, W), np.float32)
    for dy, dx in ((0, 1), (1, 0)):
        vz = np.roll(np.roll(cobre, -dy, 0), -dx, 1) & cobre & (np.roll(np.roll(ID, -dy, 0), -dx, 1) == ID)
        d = np.abs(N - np.roll(np.roll(N, -dy, 0), -dx, 1)).sum(-1)
        curv = np.maximum(curv, np.where(vz, d, 0.0))
    curv = desfocar(curv, cobre, 1)
    quina = sstep(0.05, 0.28, curv)
    um = np.ones((H, W), np.float32)

    def marca(msk, rgb, rough, metal):
        out[msk] = rgb[msk]
        pbr[..., 1][msk] = rough if np.isscalar(rough) else rough[msk]
        pbr[..., 2][msk] = metal if np.isscalar(metal) else metal[msk]

    def liso(base, gr=0.05):
        v = np.ones((H, W, 3), np.float32) * cor(*base)
        return v * (1 - gr + 2 * gr * g2)[..., None]

    def cromado(base=(0.76, 0.79, 0.84)):
        ref = 0.5 + 0.5 * nz
        v = np.ones((H, W, 3), np.float32) * cor(*base)
        v *= (0.42 + 0.78 * sstep(0.15, 0.95, ref))[..., None]
        v = mistura(v, cor(0.22, 0.26, 0.32), sstep(0.5, 0.25, ref) * 0.7)
        v = mistura(v, cor(0.95, 0.95, 0.97), sstep(0.88, 0.97, ref) * 0.6)
        return v

    # ------------------------------------------------------------ carenagens (tampas laterais e rabeta): vermelho + decalque
    mk = m("carenagem")
    c = np.ones((H, W, 3), np.float32) * cor(0.80, 0.060, 0.048)
    c *= (0.95 + 0.07 * g1 + 0.04 * nz)[..., None]
    c = mistura(c, cor(0.45, 0.33, 0.26), suj * 0.35)
    lado = (ax > 0.085) & (np.abs(nx) > 0.45)
    tampa = mk & lado & (y > 0.05) & (y < 0.43) & (z < 0.675)
    # "DELIVERY" na tampa lateral, lendo de frente para tras nos dois lados
    h_l = 0.020
    wtxt = largura_texto("DELIVERY", h_l)
    for sgn in (1, -1):
        face = tampa & (x * sgn > 0.08)
        uu = (y - 0.150) if sgn > 0 else (0.150 + wtxt - y)
        vv = z - 0.585
        c[face & mascara_texto(uu, vv, "DELIVERY", h_l)] = cor(0.96, 0.90, 0.72)
        # duas faixas creme abaixo do letreiro
        c[face & (faixa(z - 0.574 + (y - 0.15) * 0.05, 0.0, 0.0035, 0.0008) > 0.5) & (y > 0.13) & (y < 0.36)] = \
            cor(0.95, 0.88, 0.68)
    # friso creme ao longo da rabeta (acompanha a borda de baixo)
    rab = mk & (y > 0.44) & lado
    zb = np.interp(y, RAB_Y, RAB_ZB)
    c[rab & (faixa(z - zb, 0.020, 0.0245, 0.0008) > 0.5) & (y < 0.90)] = cor(0.95, 0.88, 0.68)
    gasto = quina * sstep(0.55, 0.8, g3) * (0.4 + suj)
    c = mistura(c, cor(0.60, 0.60, 0.62), gasto * 0.45)
    marca(mk, c * (0.40 + 0.60 * ao), 0.26 + 0.12 * g3, 0.0)

    # ------------------------------------------------------------ quadro: pintura preta brilhante
    mk = m("quadro")
    v = liso((0.030, 0.030, 0.034), 0.10)
    v = mistura(v, cor(0.16, 0.16, 0.18), quina * 0.45)
    v = mistura(v, cor(0.24, 0.20, 0.16), 0.35 * g3 * suj)
    marca(mk, v * (0.45 + 0.55 * ao), 0.30 + 0.25 * suj * g3, 0.10)

    # ------------------------------------------------------------ motor: aluminio fundido, aletas, partes escuras
    mk = m("motor")
    v = np.ones((H, W, 3), np.float32) * cor(0.62, 0.63, 0.65)
    v *= (0.90 + 0.14 * g3 + 0.05 * g4)[..., None]
    v = mistura(v, cor(0.82, 0.83, 0.85), quina * 0.6)
    v = mistura(v, cor(0.33, 0.29, 0.24), 0.35 * suj * g1)
    marca(mk, v * (0.35 + 0.65 * ao), 0.46 + 0.10 * g3, 0.45)
    mk = m("aleta")
    v = np.ones((H, W, 3), np.float32) * cor(0.58, 0.59, 0.61)
    v = mistura(v, cor(0.86, 0.87, 0.89), quina * 0.75)
    v = mistura(v, cor(0.30, 0.26, 0.22), 0.25 * g1)
    marca(mk, v * (0.20 + 0.80 * ao ** 1.4), 0.48, 0.45)
    mk = m("motor_escuro")
    v = liso((0.16, 0.16, 0.17), 0.08)
    v = mistura(v, cor(0.40, 0.40, 0.42), quina * 0.4)
    marca(mk, v * (0.30 + 0.70 * ao), 0.55, 0.30)

    # ------------------------------------------------------------ escapamento: coletor cromado azulado no calor, silencioso preto
    mk = m("coletor")
    v = cromado((0.74, 0.76, 0.80))
    calor = sstep(0.30, 0.50, z) * sstep(-0.10, -0.24, y)
    v = mistura(v, cor(0.62, 0.50, 0.26), calor * 0.55)
    v = mistura(v, cor(0.28, 0.30, 0.52), sstep(0.42, 0.55, z) * sstep(-0.18, -0.25, y) * 0.55)
    v = mistura(v, cor(0.30, 0.26, 0.21), 0.25 * g3 * suj)
    marca(mk, v * (0.55 + 0.45 * ao), 0.20 + 0.15 * g3, 0.55)
    mk = m("escapamento")
    v = liso((0.050, 0.050, 0.054), 0.12)
    v = mistura(v, cor(0.20, 0.19, 0.18), quina * 0.35)
    v = mistura(v, cor(0.30, 0.24, 0.18), 0.3 * g3 * sstep(0.30, 0.20, y))
    marca(mk, v * (0.45 + 0.55 * ao), 0.55, 0.25)

    # ------------------------------------------------------------ corrente: elos alternados (passo 12,7 mm)
    mk = m("corrente")
    elo = 0.5 + 0.5 * np.sin(2 * np.pi * (y + z * 0.3) / 0.0127)
    v = np.ones((H, W, 3), np.float32) * cor(0.16, 0.15, 0.14)
    v = mistura(v, cor(0.44, 0.43, 0.42), sstep(0.55, 0.85, elo))
    v = mistura(v, cor(0.30, 0.20, 0.12), 0.35 * g3)
    marca(mk, v * (0.45 + 0.55 * ao), 0.50, 0.45)

    # ------------------------------------------------------------ farol, painel, espelhos, plasticos pretos brilhantes
    mk = m("farol_casco", "espelho_casco")
    v = liso((0.030, 0.030, 0.034), 0.06)
    v = mistura(v, cor(0.20, 0.20, 0.22), quina * 0.4)
    marca(mk, v * (0.45 + 0.55 * ao), 0.30, 0.05)
    mk = m("painel")
    v = liso((0.040, 0.040, 0.044), 0.06)
    marca(mk, v * (0.5 + 0.5 * ao), 0.55, 0.05)
    mk = m("espelho_vidro")
    v = np.ones((H, W, 3), np.float32) * cor(0.52, 0.60, 0.68)
    v = mistura(v, cor(0.82, 0.86, 0.90), sstep(0.0, 0.6, (z - 1.10) / 0.12 + 0.3 * g1))
    v = mistura(v, cor(0.25, 0.27, 0.30), sstep(0.35, 0.0, (z - 1.10) / 0.12))
    marca(mk, v, 0.06, 0.55)

    # ------------------------------------------------------------ relogios: fundo preto, escala, numeros, faixa vermelha
    mk = m("mostrador")
    v = np.ones((H, W, 3), np.float32) * cor(0.020, 0.020, 0.024)
    for c_, n_, e1, e2, tipo in INFO.get("relogios", []):
        c_, e1, e2 = np.array(c_), np.array(e1), np.array(e2)
        q = P - c_
        ur = -(q @ e1)                 # direita de quem olha
        vr = -(q @ e2)                 # para cima de quem olha
        rr = np.sqrt(ur ** 2 + vr ** 2)
        perto = mk & (rr < 0.045) & (np.abs(q @ np.array(n_)) < 0.004)
        angv = np.degrees(np.arctan2(vr, ur))
        s = ((225.0 - angv) % 360.0) / 270.0
        dentro = s <= 1.0
        nmaj = 8 if tipo == "velocimetro" else 6
        fr = (s * nmaj * 2) % 1.0
        maior = ((s * nmaj) % 1.0 < 0.035) | ((s * nmaj) % 1.0 > 0.965)
        menor = (fr < 0.05) | (fr > 0.95)
        traco = dentro & ((maior & (rr > 0.0310) & (rr < 0.0395)) | (menor & (rr > 0.0345) & (rr < 0.0395)))
        arco = dentro & (rr > 0.0392) & (rr < 0.0400)
        vermelho = dentro & (s > 0.78) & (rr > 0.0335) & (rr < 0.0395) if tipo == "conta_giros" else np.zeros_like(dentro)
        v[perto & (traco | arco)] = cor(0.92, 0.92, 0.90)
        v[perto & vermelho & ~traco] = cor(0.75, 0.06, 0.04)
        # numeros
        rotulos = ["0", "20", "40", "60", "80", "100", "120", "140", "160"] if tipo == "velocimetro" else \
            ["0", "2", "4", "6", "8", "10", "12"]
        hl = 0.0050
        for k, t in enumerate(rotulos):
            a = math.radians(225.0 - 270.0 * k / (len(rotulos) - 1))
            cx, cy = 0.0245 * math.cos(a), 0.0245 * math.sin(a)
            wt = largura_texto(t, hl)
            msk_t = mascara_texto(ur - (cx - wt / 2), vr - (cy - hl / 2), t, hl, 0.8)
            v[perto & msk_t] = cor(0.92, 0.92, 0.90)
        legenda = "KM/H" if tipo == "velocimetro" else "X1000"
        hl2 = 0.0036
        wt = largura_texto(legenda, hl2)
        v[perto & mascara_texto(ur + wt / 2, vr + 0.016, legenda, hl2, 0.8)] = cor(0.70, 0.70, 0.68)
        if tipo == "velocimetro":   # hodometro
            odo = perto & (np.abs(ur) < 0.011) & (vr > -0.030) & (vr < -0.0235)
            v[odo] = cor(0.06, 0.06, 0.06)
            v[odo & mascara_texto(ur + 0.0095, vr + 0.0290, "01870", 0.0042, 0.6)] = cor(0.90, 0.90, 0.88)
    marca(mk, v, 0.25, 0.0)
    mk = m("ponteiro")
    marca(mk, liso((0.95, 0.32, 0.05), 0.02), 0.4, 0.0)

    # ------------------------------------------------------------ suspensao: cromo, molas, aluminio, pinca, manetes
    mk = m("amortecedor")
    marca(mk, cromado() * (0.6 + 0.4 * ao), 0.14, 0.55)
    mk = m("mola")
    v = liso((0.10, 0.10, 0.11), 0.05)
    v = mistura(v, cor(0.45, 0.46, 0.50), sstep(0.5, 0.95, 0.5 + 0.5 * nz) * 0.6)
    marca(mk, v * (0.5 + 0.5 * ao), 0.28, 0.40)
    mk = m("aluminio")
    brush = 0.5 + 0.5 * np.sin((y * 0.8 + z) * 700.0 + g2 * 5.0)
    v = np.ones((H, W, 3), np.float32) * cor(0.56, 0.57, 0.60)
    v *= (0.93 + 0.06 * brush + 0.06 * g3)[..., None]
    v = mistura(v, cor(0.80, 0.81, 0.84), quina * 0.5)
    v = mistura(v, cor(0.30, 0.26, 0.22), 0.30 * g3 * suj)
    marca(mk, v * (0.50 + 0.50 * ao), 0.40, 0.45)
    mk = m("pinca")
    v = liso((0.20, 0.20, 0.22), 0.08)
    v = mistura(v, cor(0.45, 0.45, 0.47), quina * 0.5)
    marca(mk, v * (0.4 + 0.6 * ao), 0.5, 0.35)
    mk = m("manete")
    v = liso((0.70, 0.71, 0.74), 0.05)
    v = mistura(v, cor(0.90, 0.91, 0.93), quina * 0.5)
    marca(mk, v * (0.55 + 0.45 * ao), 0.30, 0.50)
    mk = m("parafuso")
    v = liso((0.58, 0.59, 0.61), 0.08)
    v = mistura(v, cor(0.82, 0.83, 0.85), quina * 0.6)
    marca(mk, v * (0.45 + 0.55 * ao), 0.35, 0.50)
    mk = m("cabo")
    marca(mk, liso((0.022, 0.022, 0.024), 0.06) * (0.5 + 0.5 * ao), 0.62, 0.0)
    mk = m("lente_refl")
    hexa = (np.sin(x * 900) * np.sin(z * 900 + y * 300)) > 0
    v = liso((0.55, 0.035, 0.03), 0.03)
    v[hexa] *= 0.7
    marca(mk, v, 0.15, 0.0)

    out = np.clip(out, 0.0, 1.0)
    out[~cobre] = 0.12
    pbr = np.clip(pbr, 0.0, 1.0)
    pbr[~cobre] = (0.0, 0.7, 0.0)
    return out, pbr
