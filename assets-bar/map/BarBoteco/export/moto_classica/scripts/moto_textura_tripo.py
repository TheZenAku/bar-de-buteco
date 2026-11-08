# moto_textura_tripo.py - textura da moto classica da Tripo (61_moto_classica_tripo.py). A cor da Tripo (R["ref"],
# transferida para o atlas novo) guia o desenho; cada classe ganha material de verdade por cima:
#  tinta/branco = verniz neutro (o material multiplica pela cor escolhida), grip = plastico texturizado das carenagens,
#  banco = vinil, motor = aluminio fundido, aco/preto = metal e plastico com o detalhe da Tripo, emblema redondo.
# Rodas raiadas, tambores e o resto: moto_textura_classica (que usa a v4/v3).
import numpy as np
import moto_textura_classica as mtc
from moto_textura3 import ruido, fbm, sstep, cor, mistura, desfocar, mascara_texto, largura_texto


def pintar(R, PECAS, INFO):
    out, pbr = mtc.pintar(R, PECAS, INFO)
    P, N, ID, AO, cobre = R["pos"], R["nor"], R["peca"], R["ao"], R["cobre"]
    AO = desfocar(np.clip(AO, 0.0, 1.0), cobre, 2)
    ao = AO[..., None]
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    nz = N[..., 2]
    ref = np.clip(R["ref"], 0, 1) ** (1 / 2.2)                       # bake linear -> sRGB
    for c in range(3):
        ref[..., c] = desfocar(ref[..., c], cobre, 1)
    lum = ref.mean(-1)
    nome_de = {i: n for i, n in enumerate(PECAS)}

    def m(*nomes):
        return np.isin(ID, [i for i, n in nome_de.items() if n in nomes]) & cobre

    def detalhe(msk, lo, hi):
        """luminancia da Tripo normalizada na peca (0..1): mantem o desenho (tampas, parafusos, vincos)"""
        v = lum[msk]
        a, b = np.percentile(v, lo), np.percentile(v, hi)
        d = np.zeros_like(lum)
        d[msk] = np.clip((v - a) / max(b - a, 1e-3), 0, 1)
        return d

    g1, g2, g3, g4 = fbm(P, 3.0), ruido(P, 45.0), fbm(P, 14.0), ruido(P, 160.0)
    g5 = ruido(P, 420.0)
    suj = sstep(0.55, 0.12, z) * (0.45 + 0.55 * fbm(P, 7.0))
    H, W = ID.shape
    um = np.ones((H, W, 3), np.float32)

    def marca(msk, rgb, rough, metal):
        out[msk] = rgb[msk]
        pbr[..., 1][msk] = rough if np.isscalar(rough) else rough[msk]
        pbr[..., 2][msk] = metal if np.isscalar(metal) else metal[msk]

    # pintura neutra (tanque e pecas brancas): casca de laranja, lascas, riscos, poeira baixa
    for nome in ("tinta",):
        mk = m(nome)
        if not mk.any():
            continue
        v = um * 0.90 * (0.965 + 0.035 * g4 + 0.015 * g5)[..., None] * (0.97 + 0.04 * g1)[..., None]
        risco = sstep(0.78, 0.86, ruido(P * np.array([1.0, 9.0, 1.0], np.float32), 60.0)) * sstep(0.55, 0.75, g1) * 0.25
        v = mistura(v, cor(0.60, 0.60, 0.60), risco)
        v = mistura(v, cor(0.68, 0.64, 0.58), suj * 0.20)
        marca(mk, v * (0.36 + 0.64 * ao), 0.20 + 0.10 * g3 + 0.25 * suj * g1, 0.0)

    # carenagens sob o tanque: plastico preto com textura de grip (losangos finos) e o desenho da Tripo
    mk = m("grip")
    if mk.any():
        d = detalhe(mk, 5, 95)
        los = (np.abs(((y * 1.0 + z) / 0.006) % 1.0 - 0.5) + np.abs(((y - z) / 0.006) % 1.0 - 0.5))
        v = um * cor(0.050, 0.050, 0.054) * (0.75 + 0.5 * sstep(0.35, 0.65, los))[..., None]
        v *= (0.85 + 0.3 * d)[..., None]
        marca(mk, v * (0.40 + 0.60 * ao), 0.70, 0.0)

    # banco: vinil preto liso com granulado e brilho no alto
    mk = m("banco")
    if mk.any():
        d = detalhe(mk, 5, 95)
        v = um * cor(0.045, 0.045, 0.048) * (0.80 + 0.35 * d)[..., None] * (0.88 + 0.24 * g4)[..., None]
        v = mistura(v, cor(0.12, 0.12, 0.13), np.clip((nz - 0.3) * 0.6, 0, 1) * 0.30 * g1)
        marca(mk, v * (0.35 + 0.65 * ao), 0.48 - 0.10 * np.clip(nz, 0, 1), 0.0)

    # motor: aluminio fundido; a luminancia da Tripo vira o desenho das tampas
    mk = m("motor")
    if mk.any():
        d = detalhe(mk, 3, 97)
        v = um * cor(0.62, 0.63, 0.65) * (0.50 + 0.65 * d)[..., None] * (0.90 + 0.12 * g4 + 0.05 * g3)[..., None]
        v = mistura(v, cor(0.33, 0.29, 0.24), 0.30 * suj * g1)
        marca(mk, v * (0.35 + 0.65 * ao), 0.45 + 0.10 * g3, 0.45)

    # pecas brancas, pretas e de metal da Tripo (classe por peca, decidida no 61): a cor base e a da classe; da Tripo
    # so entra o DETALHE fino (parafusos, vincos, frisos) - a sombra larga que ela pintou e removida (passa-alta)
    lum_suave = lum.copy()
    for _ in range(6):
        lum_suave = desfocar(lum_suave, cobre, 3)
    fino = np.clip(lum - lum_suave, -0.25, 0.25)
    for nome, base, gan, rough, metal in (("branco", (0.88, 0.88, 0.86), 1.2, 0.22, 0.0),
                                          ("preto", (0.040, 0.040, 0.044), 2.5, 0.40, 0.05),
                                          ("aco", (0.50, 0.51, 0.54), 1.4, 0.38, 0.45)):
        mk = m(nome)
        if not mk.any():
            continue
        v = um * cor(*base) * np.clip(1.0 + gan * fino, 0.35, 1.5)[..., None] * \
            (0.965 + 0.035 * g4 + 0.015 * g5)[..., None]
        v = mistura(v, cor(0.62, 0.58, 0.52) if nome == "branco" else cor(0.22, 0.20, 0.17), suj * 0.25)
        marca(mk, v * (0.38 + 0.62 * ao), rough + 0.15 * g3 * suj, metal)

    # lentes: farol = vidro sobre refletor (aneis + prismas + lampada); setas e lanterna = cor da Tripo com prismas
    mk = m("lente")
    if mk.any():
        fx, fy, fz, fr = INFO["farol"]
        far = mk & (y < -0.50)
        dr = np.sqrt((x - fx) ** 2 + (z - fz) ** 2) / fr
        v = um * cor(0.80, 0.82, 0.84)
        v *= (0.92 + 0.08 * (0.5 + 0.5 * np.cos(dr * 44.0)))[..., None]              # aneis do refletor (sutis)
        prisma = 0.5 + 0.5 * np.cos((x - fx) * 900.0)
        v *= (0.92 + 0.10 * prisma * (dr < 0.8))[..., None]                           # prismas verticais do vidro
        v = mistura(v, cor(0.97, 0.95, 0.88), sstep(0.16, 0.06, dr))                  # lampada no centro
        v = mistura(v, cor(0.35, 0.36, 0.38), sstep(0.88, 1.0, dr) * 0.6)             # sombra do aro
        out[far] = v[far]
        pbr[..., 1][far] = 0.06
        pbr[..., 2][far] = 0.30
        out_ = mk & ~far
        cel = 0.85 + 0.15 * (0.5 + 0.5 * np.sin(x * 700.0) * np.sin(z * 700.0 + y * 300.0))
        v2 = np.clip(ref / np.maximum(ref.max(-1, keepdims=True), 1e-3) * 0.85, 0, 1) * cel[..., None]
        out[out_] = v2[out_]
        pbr[..., 1][out_] = 0.15
        pbr[..., 2][out_] = 0.0

    # emblema redondo do tanque: aro cromado, esmalte branco, filete preto e letreiro
    mk = m("emblema")
    if mk.any():
        ey, ez, er = INFO["emblema_redondo"]
        dd = np.sqrt((y - ey) ** 2 + (z - ez) ** 2) / er
        ref_c = 0.5 + 0.5 * nz
        v = um * cor(0.80, 0.82, 0.86) * (0.45 + 0.75 * sstep(0.2, 0.9, ref_c))[..., None]
        esmalte = dd < 0.90
        v[esmalte] = cor(0.93, 0.92, 0.88)
        v[esmalte & (dd > 0.80) & (dd < 0.85)] = cor(0.03, 0.03, 0.035)
        hl = 0.014
        wt = largura_texto("HIGHLAND", hl)
        for sgn in (1, -1):
            uu = (y - (ey - wt / 2)) if sgn > 0 else ((ey + wt / 2) - y)
            t = esmalte & (x * sgn > 0) & mascara_texto(uu, z - (ez - hl / 2), "HIGHLAND", hl, 0.9)
            v[t] = cor(0.05, 0.05, 0.06)
            v[esmalte & (x * sgn > 0) & (np.abs(y - ey) < wt / 2) &
              ((np.abs(z - ez - 0.013) < 0.0012) | (np.abs(z - ez + 0.013) < 0.0012))] = cor(0.05, 0.05, 0.06)
        marca(mk, v * (0.65 + 0.35 * ao), np.where(esmalte, 0.18, 0.12), np.where(esmalte, 0.0, 0.55))

    out = np.clip(out, 0.0, 1.0)
    out[~cobre] = 0.12
    return out, pbr
