# Ponto de retirada "Highland Bar Delivery" (ponto de iFood da cidade) - etapa 1: texturas.
# Roda no Python do sistema (precisa de numpy + Pillow; o Python do Blender nao tem Pillow):
#   python 30_ponto_ifood_texturas.py
# Gera em texturas\ (JPG leves, repetiveis onde faz sentido):
#   ponto_ifood_pintura.jpg / _n.jpg   512 px  pintura eletrostatica (cinza claro: a cor vem do fator do material)
#   ponto_ifood_escovado.jpg           512 px  aco escovado (puxadores, prateleira, frisos)
#   ponto_ifood_atlas.jpg             1024 px  logo, tela, faixa do letreiro, numeros das portas, QR, sacola
# Atlas (pixels, origem no canto superior esquerdo) - o 31_ponto_ifood.py usa as mesmas caixas (ATLAS abaixo)
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

TEX = r"C:\Users\rafael\BarBoteco\texturas"
LOGO = r"C:\Users\rafael\Desktop\BAR\2.0\logo\Emblema Neon Highland Bar Delivery.png"
FONTES = r"C:\Windows\Fonts"
ATLAS = {
    "logo": (0, 0, 512, 512),
    "tela": (512, 0, 768, 384),
    "numeros": (768, 0, 1024, 256),      # 4 x 4 celulas de 64 px: "01".."10"
    "sacola": (768, 256, 1024, 512),
    "qr": (512, 384, 640, 512),
    "aviso": (640, 384, 768, 512),
    "faixa": (0, 512, 1024, 640),        # letreiro frontal (8:1)
    "faixa_tras": (0, 640, 1024, 768),
    "lateral": (0, 768, 1024, 1024),     # faixa de velocidade das laterais (4:1)
}
VERMELHO = (196, 18, 18)
VERMELHO_ESC = (60, 6, 6)
AMARELO = (255, 196, 40)
rng = np.random.default_rng(7)


def fonte(nome, px):
    return ImageFont.truetype(os.path.join(FONTES, nome), px)


def ruido(n, corte, aniso=(1.0, 1.0)):
    """Ruido repetivel (filtro passa-baixa no dominio da frequencia), normalizado em 0..1."""
    f = np.fft.fft2(rng.standard_normal((n, n)))
    ky, kx = np.meshgrid(np.fft.fftfreq(n), np.fft.fftfreq(n), indexing="ij")
    k = np.sqrt((kx * aniso[0]) ** 2 + (ky * aniso[1]) ** 2)
    a = np.real(np.fft.ifft2(f * np.exp(-(k / corte) ** 2)))
    return (a - a.min()) / (a.max() - a.min())


def normal_de(h, forca):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * forca
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * forca
    n = np.dstack((-dx, dy, np.ones_like(h)))
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8))


def salvar(img, nome, q=88):
    img.convert("RGB").save(os.path.join(TEX, nome), quality=q, optimize=True)
    print("%-28s %4d px %6.1f KB" % (nome, img.size[0], os.path.getsize(os.path.join(TEX, nome)) / 1024))


# ---------------------------------------------------------------- pintura eletrostatica
N = 512
manchas = ruido(N, 0.012)
casca = ruido(N, 0.18)                                   # "casca de laranja" da tinta a po
risco = np.zeros((N, N))
for _ in range(26):                                      # riscos finos de uso (poucos, curtos)
    x, y = rng.integers(0, N, 2)
    ang, L = rng.uniform(0, np.pi), rng.integers(12, 60)
    for t in range(L):
        risco[int(y + t * np.sin(ang)) % N, int(x + t * np.cos(ang)) % N] = rng.uniform(0.4, 1.0)
risco = np.array(Image.fromarray((risco * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))) / 255.0
v = 0.90 + (manchas - 0.5) * 0.10 + (casca - 0.5) * 0.03 + risco * 0.10
salvar(Image.fromarray((np.clip(v, 0, 1) * 255).astype(np.uint8)), "ponto_ifood_pintura.jpg")
salvar(normal_de(casca * 0.6 - risco * 0.8, 2.5), "ponto_ifood_pintura_n.jpg", q=92)

# ---------------------------------------------------------------- aco escovado
fios = ruido(N, 0.25, aniso=(0.02, 1.0))                 # estrias horizontais
v = 0.62 + (fios - 0.5) * 0.22 + (ruido(N, 0.02) - 0.5) * 0.08
salvar(Image.fromarray((np.clip(v, 0, 1) * 255).astype(np.uint8)), "ponto_ifood_escovado.jpg")

# ---------------------------------------------------------------- atlas
A = Image.new("RGB", (1024, 1024), VERMELHO_ESC)
d = ImageDraw.Draw(A)
logo = Image.open(LOGO).convert("RGBA")


def caixa(k):
    return ATLAS[k]


def fundo_logo(w, h):
    """Fundo escuro com brilho vermelho radial (o emblema e neon)."""
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
    g = np.clip(1.0 - r, 0, 1) ** 1.5
    a = np.dstack([18 + g * 120, 4 + g * 10, 6 + g * 8]).astype(np.uint8)
    return Image.fromarray(a).convert("RGBA")


# logo (placa-bandeira e laterais)
x0, y0, x1, y1 = caixa("logo")
bg = fundo_logo(x1 - x0, y1 - y0)
lg = logo.resize((x1 - x0 - 16, y1 - y0 - 16), Image.LANCZOS)
bg.alpha_composite(lg, (8, 8))
A.paste(bg.convert("RGB"), (x0, y0))

# tela do totem (retrato 2:3)
x0, y0, x1, y1 = caixa("tela")
w, h = x1 - x0, y1 - y0
t = Image.new("RGB", (w, h), (14, 12, 16))
td = ImageDraw.Draw(t)
td.rectangle((0, 0, w, 54), fill=VERMELHO)
mini = logo.resize((48, 48), Image.LANCZOS)
t.paste(mini, (4, 3), mini)
td.text((58, 10), "HIGHLAND BAR", font=fonte("ariblk.ttf", 17), fill=(255, 255, 255))
td.text((58, 31), "DELIVERY", font=fonte("arialbd.ttf", 14), fill=AMARELO)
td.text((w / 2, 80), "RETIRE SEU PEDIDO", font=fonte("arialbd.ttf", 18), fill=(255, 255, 255), anchor="mm")
td.text((w / 2, 104), "digite o código ou leia o QR", font=fonte("segoeuib.ttf", 12), fill=(170, 170, 180), anchor="mm")
for i in range(4):                                       # campo do codigo
    bx = 34 + i * 49
    td.rounded_rectangle((bx, 122, bx + 40, 168), 6, outline=AMARELO if i == 2 else (90, 90, 100), width=2)
    if i < 2:
        td.text((bx + 20, 145), "47"[i], font=fonte("ariblk.ttf", 24), fill=(255, 255, 255), anchor="mm")
teclas = "123456789<0>"
for i, c in enumerate(teclas):
    cx, cy = 50 + (i % 3) * 78, 200 + (i // 3) * 40
    td.rounded_rectangle((cx - 32, cy - 16, cx + 32, cy + 16), 6, fill=(38, 36, 44))
    td.text((cx, cy), {"<": "x", ">": "ok"}.get(c, c), font=fonte("arialbd.ttf", 16), fill=(230, 230, 235), anchor="mm")
td.rounded_rectangle((18, 360 - 4, w - 18, 380), 4, fill=VERMELHO)
td.text((w / 2, 368), "ABRIR PORTA", font=fonte("ariblk.ttf", 12), fill=(255, 255, 255), anchor="mm")
A.paste(t, (x0, y0))

# numeros das portas (branco sobre grafite)
x0, y0, x1, y1 = caixa("numeros")
for i in range(16):
    cx, cy = x0 + (i % 4) * 64, y0 + (i // 4) * 64
    d.rectangle((cx, cy, cx + 63, cy + 63), fill=(22, 22, 26))
    if i < 10:
        d.text((cx + 32, cy + 33), "%02d" % (i + 1), font=fonte("ariblk.ttf", 34), fill=(245, 245, 245), anchor="mm")

# estampa da sacola kraft
x0, y0, x1, y1 = caixa("sacola")
w, h = x1 - x0, y1 - y0
kr = (ruido(w, 0.3) - 0.5) * 18
s = np.dstack([181 + kr, 136 + kr * 0.8, 92 + kr * 0.6]).clip(0, 255).astype(np.uint8)
sac = Image.fromarray(s).convert("RGBA")
sd = ImageDraw.Draw(sac)
sd.ellipse((48, 40, 208, 200), fill=(170, 14, 14, 255))
sac.alpha_composite(logo.resize((150, 150), Image.LANCZOS), (53, 45))
sd.text((w / 2, 226), "HIGHLAND BAR DELIVERY", font=fonte("ariblk.ttf", 15), fill=(120, 10, 10, 255), anchor="mm")
A.paste(sac.convert("RGB"), (x0, y0))

# QR (padrao aleatorio com os 3 marcadores)
x0, y0, x1, y1 = caixa("qr")
d.rectangle((x0, y0, x1 - 1, y1 - 1), fill=(250, 250, 250))
m = 21
cel = (x1 - x0 - 16) / m
q = rng.random((m, m)) > 0.5
for (a, b) in ((0, 0), (0, m - 7), (m - 7, 0)):
    q[a:a + 7, b:b + 7] = False
    q[a, b:b + 7] = q[a + 6, b:b + 7] = q[a:a + 7, b] = q[a:a + 7, b + 6] = True
    q[a + 2:a + 5, b + 2:b + 5] = True
for r in range(m):
    for c in range(m):
        if q[r, c]:
            d.rectangle((x0 + 8 + c * cel, y0 + 8 + r * cel, x0 + 8 + (c + 1) * cel - 1, y0 + 8 + (r + 1) * cel - 1), fill=(10, 10, 10))

# adesivo de instrucoes
x0, y0, x1, y1 = caixa("aviso")
d.rectangle((x0, y0, x1 - 1, y1 - 1), fill=AMARELO)
d.rectangle((x0 + 4, y0 + 4, x1 - 5, y1 - 5), outline=(20, 20, 20), width=3)
for i, txt in enumerate(("ENTREGADOR", "1 LEIA O QR", "2 PEGUE", "3 FECHE")):
    d.text((x0 + 64, y0 + 24 + i * 27), txt, font=fonte("ariblk.ttf", 13 if i else 14), fill=(20, 20, 20), anchor="mm")


def faixa(k, sub):
    x0, y0, x1, y1 = caixa(k)
    w, h = x1 - x0, y1 - y0
    f = Image.new("RGBA", (w, h), (12, 4, 4, 255))
    fd = ImageDraw.Draw(f)
    for i in range(6):                                   # linhas de velocidade (como no emblema)
        yy = 22 + i * 17
        fd.line((0, yy, 150 - i * 14, yy), fill=(230, 60 + i * 25, 20, 255), width=4)
        fd.line((w - 150 + i * 14, yy, w, yy), fill=(230, 60 + i * 25, 20, 255), width=4)
    mini = logo.resize((h - 10, h - 10), Image.LANCZOS)
    f.alpha_composite(mini, (160, 5))
    fd.text((w / 2 + 70, 50), "HIGHLAND BAR", font=fonte("ariblk.ttf", 58), fill=(255, 255, 255, 255), anchor="mm")
    fd.text((w / 2 + 70, 100), sub, font=fonte("ariblk.ttf", 30), fill=AMARELO + (255,), anchor="mm")
    A.paste(f.convert("RGB"), (x0, y0))


faixa("faixa", "DELIVERY  \u2022  PONTO DE RETIRADA")
faixa("faixa_tras", "DELIVERY  \u2022  PE\u00c7A PELO APP")

# faixa lateral: vermelho com linhas de velocidade amarelas (decoracao das laterais e traseira)
x0, y0, x1, y1 = caixa("lateral")
w, h = x1 - x0, y1 - y0
yy, xx = np.mgrid[0:h, 0:w]
gr = np.clip(xx / w, 0, 1)
lat = np.dstack([150 + gr * 60, 12 + gr * 8, 12 + gr * 6]).astype(np.uint8)
lt = Image.fromarray(lat).convert("RGBA")
ld = ImageDraw.Draw(lt)
for i in range(9):
    yy0 = 30 + i * 24
    ld.line((w * 0.30 + i * 30, yy0, w, yy0), fill=(255, 150 + i * 10, 30, 255), width=6 if i % 2 else 3)
A.paste(lt.convert("RGB"), (x0, y0))

salvar(A, "ponto_ifood_atlas.jpg", q=90)
