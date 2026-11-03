# Texturas da mesa de truco (Python do sistema: PIL + numpy), usadas pelo 48_mesa_truco.py:
#   tr_feltro.jpg / _n.jpg   feltro violeta com a estampa (2048x2048 = quadrado X,Y -0.42..0.42 da mesa, 1 px ~ 0,4 mm)
#   tr_couro.jpg / _n.jpg    couro berinjela do trilho e dos assentos (tile 0,25 m)
#   tr_madeira.jpg / _n.jpg  imbuia envernizada (tile 0,6 m, veio ao longo de U)
#   tr_cartas.png            atlas 768x360: verso da carta | a vira (7 de ouros) | rotulo da caixa de fosforos
# Coordenadas locais da mesa no Blender (antes da rotacao do TRUCO_TABLE): os lugares ficam em -Y, +X, +Y, -X
# (TRUCO_SEATS em packages/shared/src/world.ts, i = 0..3).
import importlib, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
bj = importlib.import_module("45_texturas_blackjack")   # ruido periodico, normal, rgb, salvar
ruido, normal, rgb, salvar = bj.ruido, bj.normal, bj.rgb, bj.salvar
FONTES = bj.FONTES

R_FELTRO = 0.42                       # meia largura do quadrado do tr_feltro.jpg (igual ao 48)
LUGARES = ((0, -1), (1, 0), (0, 1), (-1, 0))
VIOLETA = (50, 20, 88)
MAGENTA = (234, 47, 220)
OURO = (214, 182, 108)
CREME = (242, 232, 250)


# =========================================================== feltro
def feltro():
    N, S = 2048, 2
    fibra = ruido(N, N, 0.6) * 0.55 + ruido(N, N, 2.5) * 0.3 + ruido(N, N, 50) * 0.35
    cor = np.array(VIOLETA, float)[None, None, :] * (1 + 0.08 * fibra[..., None])
    ys, xs = np.mgrid[0:N, 0:N]
    X = -R_FELTRO + (xs + 0.5) / N * 2 * R_FELTRO; Y = R_FELTRO - (ys + 0.5) / N * 2 * R_FELTRO
    d = np.hypot(X, Y)
    # centro mais claro (luz de cima, como o .tc-felt do jogo) e escurece perto do trilho
    cor *= (1.12 - 0.12 * np.clip(d / 0.30, 0, 1))[..., None]
    cor *= (1 - 0.22 * np.clip((d - 0.30) / 0.11, 0, 1) ** 2)[..., None]
    img = rgb(cor)

    mascaras = {k: Image.new("L", (N * S, N * S), 0) for k in ("ouro", "magenta", "creme")}
    dr = {k: ImageDraw.Draw(v) for k, v in mascaras.items()}

    def px(x, y):
        return ((x + R_FELTRO) / (2 * R_FELTRO) * N * S, (R_FELTRO - y) / (2 * R_FELTRO) * N * S)

    def m(v):
        return v / (2 * R_FELTRO) * N * S

    def anel(k, r, larg):
        cx, cy = px(0, 0); rr = m(r)
        dr[k].ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=255, width=max(1, int(m(larg))))

    def texto(k, txt, x, y, fonte, alt, ang=0.0, espaco=0.0):
        f = ImageFont.truetype(os.path.join(FONTES, fonte), int(m(alt)))
        larg = int(f.getlength(txt) + m(espaco) * len(txt) + m(alt))
        g = Image.new("L", (larg, int(m(alt) * 2)), 0)
        if espaco:
            gd = ImageDraw.Draw(g); cx = (larg - (f.getlength(txt) + m(espaco) * (len(txt) - 1))) / 2
            for c in txt:
                gd.text((cx, g.height / 2), c, font=f, fill=255, anchor="lm"); cx += f.getlength(c) + m(espaco)
        else:
            ImageDraw.Draw(g).text((g.width / 2, g.height / 2), txt, font=f, fill=255, anchor="mm")
        g = g.rotate(ang, resample=Image.BICUBIC, expand=True)
        cx, cy = px(x, y)
        mascaras[k].paste(255, (int(cx - g.width / 2), int(cy - g.height / 2)), g)

    def texto_circulo(k, partes, r, fonte, alt):
        """Texto em volta do centro, lido de fora (base virada para o centro). partes = [(texto, mascara)]."""
        f = ImageFont.truetype(os.path.join(FONTES, fonte), int(m(alt)))
        fs = ImageFont.truetype(os.path.join(FONTES, "seguisym.ttf"), int(m(alt)))
        cars = [(c, kk, fs if c in "♠♥♣♦" else f) for txt, kk in partes for c in txt]
        larg = [ff.getlength(c) for c, _, ff in cars]
        esc = 2 * math.pi * m(r) / sum(larg)                 # espaca para fechar o circulo
        ang = 0.0
        cx0, cy0 = px(0, 0)
        for (c, kk, ff), lw in zip(cars, larg):
            meio = ang + lw * esc / 2 / m(r)
            if c != " ":
                g = Image.new("L", (int(lw * 2 + 8), int(m(alt) * 2)), 0)
                ImageDraw.Draw(g).text((g.width / 2, g.height / 2), c, font=ff, fill=255, anchor="mm")
                # topo da letra para fora: no arco de baixo nao gira; avancando no sentido anti-horario da imagem
                g = g.rotate(math.degrees(meio), resample=Image.BICUBIC, expand=True)
                gx = cx0 + m(r) * math.sin(meio); gy = cy0 + m(r) * math.cos(meio)
                mascaras[kk].paste(255, (int(gx - g.width / 2), int(gy - g.height / 2)), g)
            ang += lw * esc / m(r)

    # aneis de fora: filete de ouro junto do trilho, faixa das manilhas e o neon
    anel("ouro", 0.395, 0.0025)
    manilhas = (("ZAP  ", "creme"), ("♣", "ouro"), ("  COPAS  ", "creme"), ("♥", "magenta"), ("  ESPADILHA  ", "creme"),
                ("♠", "ouro"), ("  PICA-FUMO  ", "creme"), ("♦", "magenta"), ("  ", "creme"))
    texto_circulo("creme", list(manilhas) * 2, 0.367, "georgiab.ttf", 0.020)       # duas voltas da frase
    anel("ouro", 0.340, 0.002)
    anel("magenta", 0.327, 0.0055)

    # um lugar de carta na frente de cada jogador (retangulo de canto redondo, com o naipe)
    for i, (ux, uy) in enumerate(LUGARES):
        cx, cy = 0.225 * ux, 0.225 * uy
        w, h = (0.070, 0.098) if ux == 0 else (0.098, 0.070)
        a, b = px(cx - w / 2, cy + h / 2), px(cx + w / 2, cy - h / 2)
        dr["ouro"].rounded_rectangle([a, b], radius=m(0.008), outline=255, width=int(m(0.0022)))
        a, b = px(cx - w / 2 + 0.006, cy + h / 2 - 0.006), px(cx + w / 2 - 0.006, cy - h / 2 + 0.006)
        dr["ouro"].rounded_rectangle([a, b], radius=m(0.005), outline=255, width=int(m(0.0010)))
        naipe = "♣♥♠♦"[i]
        ang = math.degrees(math.atan2(ux, -uy))              # de pe para quem senta ali
        texto("magenta" if i % 2 else "creme", naipe, cx, cy, "seguisym.ttf", 0.040, ang)

    # logo do centro
    anel("magenta", 0.150, 0.0040)
    anel("ouro", 0.138, 0.0015)
    anel("ouro", 0.162, 0.0015)
    texto("creme", "TRUCO", 0, -0.004, "BOD_B.TTF", 0.070, espaco=0.004)
    texto("ouro", "HIGHLAND  BAR", 0, 0.062, "georgiab.ttf", 0.017, espaco=0.002)
    texto("ouro", "SEIS  •  NOVE  •  DOZE", 0, -0.064, "georgia.ttf", 0.014, espaco=0.0015)
    for k, (c, kk) in enumerate(zip("♣♥♠♦", ("creme", "magenta", "creme", "magenta"))):
        a = math.radians(45 + 90 * k)
        texto(kk, c, 0.150 * math.cos(a), 0.150 * math.sin(a), "seguisym.ttf", 0.026, math.degrees(a) - 90)

    # o neon nao cobre o miolo dos naipes do anel
    for k, msk in mascaras.items():
        mascaras[k] = msk.resize((N, N), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))

    def aplicar(img, mask, cor, opac, brilho=0.0):
        a = np.asarray(mask, float)[..., None] / 255 * opac
        tex = (1 + 0.10 * fibra[..., None])
        out = np.asarray(img, float) * (1 - a) + np.array(cor, float) * tex * a
        if brilho:     # halo suave do neon em volta da tinta magenta
            halo = np.asarray(mask.filter(ImageFilter.GaussianBlur(14)), float)[..., None] / 255
            out += np.array(cor, float) * halo * brilho
        return rgb(out)

    img = aplicar(img, mascaras["magenta"], MAGENTA, 0.95, 0.22)
    img = aplicar(img, mascaras["ouro"], OURO, 0.92)
    img = aplicar(img, mascaras["creme"], CREME, 0.95)
    salvar(img, "tr_feltro.jpg")
    salvar(normal(fibra * 0.6, 0.35).resize((1024, 1024), Image.LANCZOS), "tr_feltro_n.jpg", 85)


# =========================================================== couro berinjela
def couro():
    N = 1024
    h = np.zeros((N, N))
    for s, p in ((3.0, 0.5), (6.0, 0.35), (12.0, 0.25)):
        h += (1 - np.abs(ruido(N, N, s))) * p
    h += ruido(N, N, 60) * 0.25
    h = (h - h.mean()) / h.std()
    base = np.array([34, 14, 38], float)
    cor = base * (1 + 0.12 * h[..., None]) * (1 + 0.10 * ruido(N, N, 120)[..., None])
    salvar(rgb(cor), "tr_couro.jpg")
    salvar(normal(h, 0.9).resize((512, 512), Image.LANCZOS), "tr_couro_n.jpg", 88)


# =========================================================== imbuia
def madeira():
    W, H = 1024, 1024
    warp = ruido(H, W, 120, 30) * 2.5 + ruido(H, W, 30, 8) * 0.6
    ys = np.mgrid[0:H, 0:W][0].astype(float)
    veio = np.sin((ys + warp * 5) / H * 2 * math.pi * 18) * 0.5 + 0.5
    veio = veio ** 4
    fibra = ruido(H, W, 40, 0.8)
    poros = ruido(H, W, 5, 0.5)
    manchas = ruido(H, W, 220, 70)
    t = np.clip(0.42 + 0.30 * veio + 0.12 * fibra + 0.07 * poros + 0.10 * manchas, 0, 1)
    escuro = np.array([22, 13, 8], float); claro = np.array([96, 62, 34], float)
    cor = escuro + (claro - escuro) * t[..., None]
    salvar(rgb(cor), "tr_madeira.jpg")
    salvar(normal(fibra * 0.5 + poros * 0.35 - veio * 0.3, 0.25), "tr_madeira_n.jpg")


# =========================================================== cartas e fosforos
def cartas():
    W, H = 256, 360
    img = Image.new("RGB", (W * 3, H), (246, 242, 236))
    verso = Image.new("RGB", (W, H), (246, 242, 236))
    d = ImageDraw.Draw(verso)
    # verso: violeta com losangos magenta e o HB (desenhado a parte para as listras nao invadirem a vira)
    d.rounded_rectangle([14, 14, W - 15, H - 15], 10, fill=(58, 20, 98))
    for i in range(-H, W + H, 20):
        d.line([i, 14, i + H, 14 + H], fill=(120, 34, 150), width=3)
        d.line([i, H - 14, i + H, H - 14 - H], fill=(120, 34, 150), width=3)
    d.rectangle([0, 0, W, 13], fill=(246, 242, 236)); d.rectangle([0, H - 13, W, H], fill=(246, 242, 236))
    d.rectangle([0, 0, 13, H], fill=(246, 242, 236)); d.rectangle([W - 13, 0, W, H], fill=(246, 242, 236))
    d.rounded_rectangle([14, 14, W - 15, H - 15], 10, outline=(214, 182, 108), width=4)
    d.rounded_rectangle([24, 24, W - 25, H - 25], 6, outline=(234, 47, 220), width=2)
    d.ellipse([W / 2 - 48, H / 2 - 48, W / 2 + 48, H / 2 + 48], fill=(246, 242, 236), outline=(214, 182, 108), width=4)
    d.text((W / 2, H / 2), "HB", font=ImageFont.truetype(os.path.join(FONTES, "BOD_B.TTF"), 42), fill=(58, 20, 98), anchor="mm")
    img.paste(verso, (0, 0))
    d = ImageDraw.Draw(img)

    # vira: 7 de ouros
    x0 = W
    vermelho = (196, 28, 52)
    d.rounded_rectangle([x0 + 6, 6, x0 + W - 7, H - 7], 12, outline=(200, 194, 186), width=2)
    fv = ImageFont.truetype(os.path.join(FONTES, "georgiab.ttf"), 44)
    fn = ImageFont.truetype(os.path.join(FONTES, "seguisym.ttf"), 34)
    fg = ImageFont.truetype(os.path.join(FONTES, "seguisym.ttf"), 46)
    canto = Image.new("RGBA", (60, 90), (0, 0, 0, 0)); dc = ImageDraw.Draw(canto)
    dc.text((30, 24), "7", font=fv, fill=vermelho, anchor="mm"); dc.text((30, 64), "♦", font=fn, fill=vermelho, anchor="mm")
    img.paste(canto, (x0 + 12, 12), canto)
    c2 = canto.rotate(180); img.paste(c2, (x0 + W - 72, H - 102), c2)
    for px_, py_ in ((0.32, 0.22), (0.68, 0.22), (0.5, 0.36), (0.32, 0.5), (0.68, 0.5), (0.32, 0.78), (0.68, 0.78)):
        d.text((x0 + px_ * W, py_ * H), "♦", font=fg, fill=vermelho, anchor="mm")

    # rotulo da caixa de fosforos
    x0 = 2 * W
    d.rectangle([x0, 0, x0 + W, H], fill=(206, 36, 40))
    d.rectangle([x0 + 10, 10, x0 + W - 11, 170], fill=(244, 206, 70))
    d.rectangle([x0 + 18, 18, x0 + W - 19, 162], outline=(30, 30, 30), width=3)
    ff = ImageFont.truetype(os.path.join(FONTES, "BOD_B.TTF"), 40)
    d.text((x0 + W / 2, 70), "FÓSFOROS", font=ff, fill=(30, 30, 30), anchor="mm")
    d.text((x0 + W / 2, 125), "★ HIGHLAND BAR ★", font=ImageFont.truetype(os.path.join(FONTES, "seguisym.ttf"), 24),
           fill=(30, 30, 30), anchor="mm")
    # lixa (lateral) na faixa de baixo
    lixa = (rgb(np.full((150, W - 20, 3), 70.0) * (1 + 0.35 * ruido(150, W - 20, 0.7)[..., None])))
    img.paste(lixa, (x0 + 10, 195))
    salvar(img, "tr_cartas.png")


if __name__ == "__main__":
    feltro(); couro(); madeira(); cartas()
