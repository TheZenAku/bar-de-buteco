# Texturas da mesa de blackjack (Python do sistema: PIL + numpy), usadas pelo 46_mesa_blackjack.py:
#   bj_feltro.jpg / _n.jpg   feltro com a estampa (2048x1024 = retangulo X -1..1, Y -0.57..0.43 da mesa, 1 px ~ 1 mm)
#   bj_couro.jpg / _n.jpg    couro do trilho e das cadeiras (tile 0,25 m)
#   bj_madeira.jpg / _n.jpg  mogno envernizado (tile 0,6 m, veio ao longo de U)
#   bj_fichas.png            4 fichas (topo 256x256 + faixa lateral 256x64 cada)
#   bj_carta.jpg             verso das cartas
# As posicoes dos circulos de aposta seguem as cadeiras do jogo (BLACKJACK_SEATS em packages/shared/src/world.ts).
import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

TEX = r"C:\Users\rafael\BarBoteco\texturas"
FONTES = r"C:\Windows\Fonts"
rng = np.random.default_rng(21)

# ---- geometria compartilhada com o 46 (coordenadas locais da mesa, Blender: +Y = lado do dealer)
FX0, FX1, FY0, FY1 = -1.0, 1.0, -0.57, 0.43     # retangulo coberto pelo feltro.jpg
CENTRO = (0.0, 0.42)                             # centro dos arcos (borda reta do dealer)
CADEIRAS_GRAUS = (-54, -18, 18, 54)
RX, RZ = 0.95, 0.55                              # BLACKJACK_TABLE.rx/rz do jogo


def cadeiras():
    out = []
    for g in CADEIRAS_GRAUS:
        a = math.radians(g)
        out.append(((RX + 0.43) * math.sin(a), -(RZ + 0.42) * math.cos(a)))
    return out


def ponto_aposta(seat, r):
    # no arco de raio r, na direcao CENTRO -> cadeira
    dx, dy = seat[0] - CENTRO[0], seat[1] - CENTRO[1]
    n = math.hypot(dx, dy)
    return CENTRO[0] + dx / n * r, CENTRO[1] + dy / n * r


# ---- ruido periodico (filtro gaussiano no dominio da frequencia: a textura repete sem emenda)
def ruido(h, w, sx, sy=None):
    sy = sx if sy is None else sy
    f = np.fft.fft2(rng.standard_normal((h, w)))
    ky = np.fft.fftfreq(h)[:, None]; kx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (math.pi ** 2) * ((kx * sx) ** 2 + (ky * sy) ** 2))
    r = np.real(np.fft.ifft2(f * g))
    return (r - r.mean()) / (r.std() + 1e-9)


def normal(h, forca):
    gy, gx = np.gradient(h)
    nx, ny, nz = -gx * forca, gy * forca, np.ones_like(h)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    rgb = np.stack([nx / n, ny / n, nz / n], -1) * 0.5 + 0.5
    return Image.fromarray((rgb * 255).clip(0, 255).astype(np.uint8))


def rgb(a):
    return Image.fromarray(np.asarray(a).clip(0, 255).astype(np.uint8))


def salvar(img, nome, q=92):
    p = os.path.join(TEX, nome)
    if nome.endswith(".png"):
        img.save(p, optimize=True)
    else:
        img.convert("RGB").save(p, quality=q, optimize=True)
    print("ok", nome, img.size)


# =========================================================== feltro
def feltro():
    W, H = 2048, 1024
    S = 2                                         # desenha a estampa em 2x e reduz (antisserrilhado)
    fibra = ruido(H, W, 0.6) * 0.55 + ruido(H, W, 2.5) * 0.3 + ruido(H, W, 40) * 0.35
    base = np.array([26, 86, 54], float)
    cor = base[None, None, :] * (1 + 0.07 * fibra[..., None])
    # escurece de leve perto do trilho (uso e sombra do estofado)
    ys, xs = np.mgrid[0:H, 0:W]
    X = FX0 + (xs + 0.5) / W * (FX1 - FX0); Y = FY1 - (ys + 0.5) / H * (FY1 - FY0)
    d = np.hypot(X - CENTRO[0], (Y - CENTRO[1]) * 0.95 / 0.97)
    cor *= (1 - 0.18 * np.clip((d - 0.62) / 0.26, 0, 1) ** 2)[..., None]
    img = rgb(cor)

    tinta = Image.new("L", (W * S, H * S), 0)    # mascara da estampa dourada
    creme = Image.new("L", (W * S, H * S), 0)    # mascara da estampa creme
    dt, dc = ImageDraw.Draw(tinta), ImageDraw.Draw(creme)

    def px(x, y):
        return ((x - FX0) / (FX1 - FX0) * W * S, (FY1 - y) / (FY1 - FY0) * H * S)

    def m(v):                                     # metros -> px (escala 2x)
        return v / (FX1 - FX0) * W * S

    def arco(draw, r, a0, a1, larg):
        cx, cy = px(*CENTRO); rr = m(r)
        # angulos do PIL: 0 = +x da imagem, sentido horario (y da imagem para baixo)
        draw.arc([cx - rr, cy - rr, cx + rr, cy + rr], a0, a1, fill=255, width=max(1, int(m(larg))))

    def texto_arco(mask, txt, r, fonte, alt, espaco=1.0):
        f = ImageFont.truetype(os.path.join(FONTES, fonte), int(m(alt)))
        largs = [f.getlength(c) * espaco for c in txt]
        total = sum(largs)
        ang = -total / 2 / m(r)                   # comeca a esquerda (angulo a partir do -Y da mesa)
        cx, cy = px(*CENTRO)
        for c, lw in zip(txt, largs):
            meio = ang + lw / 2 / m(r)
            if c != " ":
                g = Image.new("L", (int(lw * 2 + 8), int(m(alt) * 2)), 0)
                ImageDraw.Draw(g).text((g.width / 2, g.height / 2), c, font=f, fill=255, anchor="mm")
                g = g.rotate(math.degrees(meio), resample=Image.BICUBIC, expand=True)
                # ponto no arco inferior: abaixo do centro (y da imagem cresce para baixo)
                gx = cx + m(r) * math.sin(meio); gy = cy + m(r) * math.cos(meio)
                mask.paste(255, (int(gx - g.width / 2), int(gy - g.height / 2)), g)
            ang += lw / m(r)

    # faixa do seguro
    arco(dt, 0.475, 25, 155, 0.004)
    arco(dt, 0.540, 25, 155, 0.004)
    texto_arco(tinta, "SEGURO PAGA 2 PARA 1", 0.5075, "georgiab.ttf", 0.030, 1.12)
    texto_arco(creme, "BLACKJACK PAGA 3 PARA 2", 0.37, "georgiab.ttf", 0.038, 1.06)
    texto_arco(tinta, "O DEALER PARA EM 17  \u2022  A SORTE PUXA UMA CADEIRA", 0.435, "georgia.ttf", 0.020, 1.08)
    # filete externo, acompanhando o trilho
    arco(dt, 0.80, 6, 174, 0.003)

    # circulos de aposta, um na frente de cada cadeira
    fs = ImageFont.truetype(os.path.join(FONTES, "georgiab.ttf"), int(m(0.032)))
    for i, s in enumerate(cadeiras()):
        bx, by = ponto_aposta(s, 0.665)
        cx, cy = px(bx, by)
        for r, w in ((0.072, 0.0045), (0.060, 0.0022)):
            rr = m(r); dt.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=255, width=int(m(w)))
        # numero do lugar, girado para quem esta sentado
        ang = math.degrees(math.atan2(s[0] - CENTRO[0], CENTRO[1] - s[1]))
        g = Image.new("L", (int(m(0.06)), int(m(0.06))), 0)
        ImageDraw.Draw(g).text((g.width / 2, g.height / 2), str(i + 1), font=fs, fill=255, anchor="mm")
        g = g.rotate(ang, resample=Image.BICUBIC, expand=True)
        creme.paste(255, (int(cx - g.width / 2), int(cy - g.height / 2)), g)

    # naipes e marca perto do dealer
    fn = ImageFont.truetype(os.path.join(FONTES, "seguisym.ttf"), int(m(0.05)))
    for k, (c, msk) in enumerate(zip("\u2660\u2665\u2663\u2666", (creme, tinta, creme, tinta))):
        x = (-0.09 + k * 0.06); cx, cy = px(x, 0.165)
        ImageDraw.Draw(msk).text((cx, cy), c, font=fn, fill=255, anchor="mm")
    fl = ImageFont.truetype(os.path.join(FONTES, "BOD_B.TTF"), int(m(0.034)))
    cx, cy = px(0, 0.235)
    dc.text((cx, cy), "HIGHLAND  BAR", font=fl, fill=255, anchor="mm")

    def aplicar(img, mask, cor, opac):
        mask = mask.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
        a = np.asarray(mask, float)[..., None] / 255 * opac
        # a tinta pega a textura do feltro (serigrafia): modula pela fibra
        tex = (1 + 0.10 * fibra[..., None])
        out = np.asarray(img, float) * (1 - a) + np.array(cor, float) * tex * a
        return rgb(out)

    img = aplicar(img, tinta, (206, 172, 98), 0.92)
    img = aplicar(img, creme, (232, 218, 182), 0.95)
    salvar(img, "bj_feltro.jpg")
    salvar(normal(fibra * 0.6, 0.35).resize((1024, 512), Image.LANCZOS), "bj_feltro_n.jpg", 85)   # fibra: 2 mm/px basta


# =========================================================== couro
def couro():
    N = 1024
    # celulas: ridges de varios ruidos (|n| invertido) = vincos do couro
    h = np.zeros((N, N))
    for s, p in ((3.0, 0.5), (6.0, 0.35), (12.0, 0.25)):
        h += (1 - np.abs(ruido(N, N, s))) * p
    h += ruido(N, N, 60) * 0.25
    h = (h - h.mean()) / h.std()
    base = np.array([58, 15, 14], float)        # bordo escuro
    cor = base * (1 + 0.10 * h[..., None]) * (1 + 0.08 * ruido(N, N, 120)[..., None])
    salvar(rgb(cor), "bj_couro.jpg")
    salvar(normal(h, 0.9).resize((512, 512), Image.LANCZOS), "bj_couro_n.jpg", 88)


# =========================================================== madeira (mogno)
def madeira():
    W, H = 1024, 1024
    warp = ruido(H, W, 120, 30) * 2.5
    ys = np.mgrid[0:H, 0:W][0].astype(float)
    veio = np.sin((ys + warp * 4) / H * 2 * math.pi * 22) * 0.5 + 0.5
    veio = veio ** 3
    fibra = ruido(H, W, 40, 0.8)                  # risquinhos longos ao longo de U
    poros = ruido(H, W, 6, 0.6)
    t = np.clip(0.45 + 0.22 * veio + 0.14 * fibra + 0.06 * poros + 0.06 * ruido(H, W, 200, 60), 0, 1)
    escuro = np.array([30, 12, 7], float); claro = np.array([88, 38, 20], float)
    cor = escuro + (claro - escuro) * t[..., None]
    salvar(rgb(cor), "bj_madeira.jpg")
    salvar(normal(fibra * 0.5 + poros * 0.3, 0.25), "bj_madeira_n.jpg")


# =========================================================== fichas
FICHAS = [((168, 28, 34), "5"), ((28, 112, 62), "25"), ((24, 24, 28), "100"), ((40, 66, 150), "500")]


def fichas():
    T = 256
    img = Image.new("RGBA", (T * 4, T + 64), (0, 0, 0, 255))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(os.path.join(FONTES, "georgiab.ttf"), 54)
    for k, (cor, val) in enumerate(FICHAS):
        x0 = k * T; cx, cy = x0 + T / 2, T / 2
        d.rectangle([x0, 0, x0 + T - 1, T - 1], fill=cor)
        # insertos brancos na borda
        for i in range(6):
            a0 = i * 60 - 12
            d.pieslice([cx - 126, cy - 126, cx + 126, cy + 126], a0, a0 + 24, fill=(238, 232, 220))
        d.ellipse([cx - 98, cy - 98, cx + 98, cy + 98], fill=cor)
        d.ellipse([cx - 84, cy - 84, cx + 84, cy + 84], outline=(226, 196, 120), width=4)
        d.ellipse([cx - 70, cy - 70, cx + 70, cy + 70], fill=(236, 228, 208))
        d.text((cx, cy), val, font=f, fill=cor, anchor="mm")
        # lateral: cor com 6 tracos brancos
        d.rectangle([x0, T, x0 + T - 1, T + 63], fill=cor)
        for i in range(6):
            xx = x0 + i * T / 6 + 14
            d.rectangle([xx, T + 10, xx + 9, T + 53], fill=(238, 232, 220))
        d.rectangle([x0, T, x0 + T - 1, T + 3], fill=(10, 10, 10)); d.rectangle([x0, T + 60, x0 + T - 1, T + 63], fill=(10, 10, 10))
    salvar(img.convert("RGB"), "bj_fichas.png")


# =========================================================== verso da carta
def carta():
    W, H = 256, 360
    img = Image.new("RGB", (W, H), (246, 242, 232))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([14, 14, W - 15, H - 15], 10, fill=(150, 24, 32))
    for i in range(-H, W + H, 18):
        d.line([i, 20, i + H, 20 + H], fill=(176, 44, 50), width=3)
        d.line([i, H - 20, i + H, H - 20 - H], fill=(176, 44, 50), width=3)
    d.rounded_rectangle([14, 14, W - 15, H - 15], 10, outline=(246, 242, 232), width=5)
    d.rectangle([0, 0, W, 13], fill=(246, 242, 232)); d.rectangle([0, H - 13, W, H], fill=(246, 242, 232))
    d.rectangle([0, 0, 13, H], fill=(246, 242, 232)); d.rectangle([W - 13, 0, W, H], fill=(246, 242, 232))
    f = ImageFont.truetype(os.path.join(FONTES, "BOD_B.TTF"), 40)
    d.ellipse([W / 2 - 46, H / 2 - 46, W / 2 + 46, H / 2 + 46], fill=(246, 242, 232))
    d.text((W / 2, H / 2), "HB", font=f, fill=(150, 24, 32), anchor="mm")
    salvar(img, "bj_carta.jpg")


if __name__ == "__main__":
    feltro(); couro(); madeira(); fichas(); carta()
    print("bet points", [tuple(round(v, 3) for v in ponto_aposta(s, 0.665)) for s in cadeiras()])
