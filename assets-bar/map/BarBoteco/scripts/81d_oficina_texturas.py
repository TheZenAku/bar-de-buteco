# 81d_oficina_texturas.py - Python do SISTEMA (PIL):  python -I 81d_oficina_texturas.py   (depois do 81a e do 81c)
# eb_oficina.png (1024 x 512) da fabrica EMPRESA BRASIL:
#   PAINEL   (0,0)-(1024,384): chapa perfurada do painel de ferramentas (2,4 x 0,9 m) com a silhueta pintada de cada ferramenta;
#            as posicoes vao para _catalogo.json["oficina_ferramentas"] e o 81p pendura a ferramenta 3D no mesmo lugar.
#   PLACA_EXTINTOR, ROTULO_PQS, PLACA_HIDRANTE, VIDRO_INCENDIO, ETQ_GAVETA: placas e rotulos (padrao brasileiro: vermelho,
#   pictograma branco).  Regioes em _catalogo.json["oficina"].
import os, json, math
from PIL import Image, ImageDraw, ImageFont

OUT = r"C:\Users\rafael\Desktop\BAR\2.0\map\texturas_512\empresa_brasil"
W, H = 1024, 512
T = Image.new("RGB", (W, H), (200, 200, 200))
d = ImageDraw.Draw(T)
REG = {}
PXM = 1024 / 2.4                                         # px por metro no painel


def fonte(px, bold=True):
    for n in (("arialbd.ttf",) if bold else ("arial.ttf",)) + ("segoeui.ttf",):
        for c in (n, "C:/Windows/Fonts/" + n):
            try: return ImageFont.truetype(c, px)
            except Exception: pass
    return ImageFont.load_default()


def txt(x, y, s, cor, px, bold=True, a="mm"):
    d.text((x, y), s, font=fonte(px, bold), fill=cor, anchor=a)


# ---------------------------------------------------------------- painel perfurado com silhuetas
REG["PAINEL"] = [0, 0, 1024, 384]
d.rectangle([0, 0, 1023, 383], fill=(222, 224, 222))
passo = 0.0254 * PXM
y = passo / 2
while y < 384:
    x = passo / 2
    while x < 1024:
        d.ellipse([x - 2.2, y - 2.2, x + 2.2, y + 2.2], fill=(70, 72, 72))
        x += passo
    y += passo
d.rectangle([0, 0, 1023, 383], outline=(150, 152, 150), width=6)
# (tipo, x_m, z_m a partir do topo do painel, tamanho_m, angulo_graus) - x de -1.2 a 1.2, z de 0 (topo) a 0.9
FERR = [("martelo", -1.0, 0.12, 0.32, 0), ("martelo", -0.82, 0.12, 0.28, 0),
        ("chave_comb", -0.62, 0.10, 0.15, 0), ("chave_comb", -0.55, 0.10, 0.18, 0), ("chave_comb", -0.48, 0.10, 0.21, 0),
        ("chave_comb", -0.41, 0.10, 0.24, 0), ("chave_comb", -0.34, 0.10, 0.27, 0),
        ("fenda", -0.18, 0.12, 0.20, 0), ("fenda", -0.12, 0.12, 0.23, 0), ("fenda", -0.06, 0.12, 0.25, 0),
        ("fenda", 0.0, 0.12, 0.23, 0), ("fenda", 0.06, 0.12, 0.20, 0),
        ("alicate", 0.2, 0.12, 0.20, 0), ("alicate", 0.32, 0.12, 0.18, 0),
        ("inglesa", 0.47, 0.10, 0.25, 0), ("inglesa", 0.58, 0.10, 0.20, 0),
        ("serra", 0.86, 0.12, 0.40, 0), ("trena", 1.07, 0.45, 0.08, 0),
        ("chave_comb", -0.62, 0.50, 0.12, 0), ("chave_comb", -0.56, 0.50, 0.14, 0), ("chave_comb", -0.5, 0.50, 0.16, 0),
        ("fenda", -0.25, 0.52, 0.16, 0), ("fenda", -0.19, 0.52, 0.16, 0), ("alicate", 0.05, 0.50, 0.16, 0),
        ("martelo", 0.3, 0.48, 0.26, 0), ("inglesa", 0.62, 0.50, 0.30, 0)]
SOMBRA = (40, 42, 44)


def px(xm, zm): return ((xm + 1.2) * PXM, zm * PXM)


for tipo, xm, zm, L, ang in FERR:
    x0, y0 = px(xm, zm)
    Lp = L * PXM
    if tipo == "martelo":
        d.rectangle([x0 - 5, y0, x0 + 5, y0 + Lp], fill=SOMBRA)
        d.rectangle([x0 - 22, y0 - 6, x0 + 22, y0 + 8], fill=SOMBRA)
    elif tipo == "chave_comb":
        d.rectangle([x0 - 3, y0, x0 + 3, y0 + Lp], fill=SOMBRA)
        d.ellipse([x0 - 8, y0 - 8, x0 + 8, y0 + 8], fill=SOMBRA)
        d.polygon([(x0 - 8, y0 + Lp), (x0 + 8, y0 + Lp), (x0 + 9, y0 + Lp + 12), (x0 - 9, y0 + Lp + 12)], fill=SOMBRA)
    elif tipo == "fenda":
        d.rounded_rectangle([x0 - 7, y0, x0 + 7, y0 + Lp * 0.45], 4, fill=SOMBRA)
        d.rectangle([x0 - 2, y0, x0 + 2, y0 + Lp], fill=SOMBRA)
    elif tipo == "alicate":
        d.polygon([(x0 - 4, y0), (x0 + 4, y0), (x0 + 14, y0 + Lp), (x0 + 6, y0 + Lp), (x0, y0 + Lp * 0.35)], fill=SOMBRA)
        d.polygon([(x0 - 4, y0), (x0 + 4, y0), (x0 - 6, y0 + Lp), (x0 - 14, y0 + Lp), (x0, y0 + Lp * 0.35)], fill=SOMBRA)
    elif tipo == "inglesa":
        d.rectangle([x0 - 5, y0 + 18, x0 + 5, y0 + Lp], fill=SOMBRA)
        d.ellipse([x0 - 16, y0 - 4, x0 + 16, y0 + 26], fill=SOMBRA)
    elif tipo == "serra":
        d.line([x0 - Lp / 2, y0, x0 + Lp / 2, y0], fill=SOMBRA, width=8)
        d.line([x0 - Lp / 2, y0, x0 - Lp / 2, y0 + 40], fill=SOMBRA, width=8)
        d.line([x0 + Lp / 2, y0, x0 + Lp / 2, y0 + 40], fill=SOMBRA, width=8)
        d.line([x0 - Lp / 2, y0 + 40, x0 + Lp / 2, y0 + 40], fill=SOMBRA, width=4)
    elif tipo == "trena":
        d.rounded_rectangle([x0 - Lp / 2, y0 - Lp / 2, x0 + Lp / 2, y0 + Lp / 2], 8, fill=SOMBRA)
txt(512, 352, "QUADRO DE FERRAMENTAS - DEVOLVA AO LUGAR", (180, 30, 30), 18)

# ---------------------------------------------------------------- placa de extintor (padrao: fundo vermelho, pictograma branco)
REG["PLACA_EXTINTOR"] = [0, 384, 128, 512]
d.rectangle([0, 384, 127, 511], fill=(200, 16, 22))
d.rectangle([4, 388, 123, 507], outline=(255, 255, 255), width=2)
cx, cy = 64, 438
d.rounded_rectangle([cx - 13, cy - 26, cx + 13, cy + 34], 9, fill=(255, 255, 255))      # cilindro
d.rectangle([cx - 5, cy - 34, cx + 5, cy - 25], fill=(255, 255, 255))                   # valvula
d.polygon([(cx + 4, cy - 34), (cx + 26, cy - 40), (cx + 26, cy - 34), (cx + 6, cy - 29)], fill=(255, 255, 255))   # gatilho
d.line([(cx - 5, cy - 30), (cx - 24, cy - 20), (cx - 26, cy + 10)], fill=(255, 255, 255), width=4)               # mangueira
d.polygon([(cx - 30, cy + 8), (cx - 22, cy + 8), (cx - 24, cy + 20), (cx - 28, cy + 20)], fill=(255, 255, 255))
txt(64, 492, "EXTINTOR", (255, 255, 255), 17)

REG["ROTULO_PQS"] = [128, 384, 256, 512]
d.rectangle([128, 384, 255, 511], fill=(246, 246, 240))
d.rectangle([128, 384, 255, 404], fill=(200, 16, 22))
txt(192, 394, "PÓ QUÍMICO", (255, 255, 255), 13)
txt(192, 418, "ABC  6 kg", (20, 20, 20), 17)
for i, s in enumerate(("1 RETIRE O PINO", "2 APONTE P/ BASE", "3 APERTE O GATILHO", "4 VARRA A BASE")):
    txt(134, 440 + i * 14, s, (40, 40, 40), 10, True, "lm")
d.rectangle([134, 496, 250, 506], fill=(0, 120, 60))
txt(192, 501, "INMETRO  VAL 11/2027", (255, 255, 255), 8)

REG["PLACA_HIDRANTE"] = [256, 384, 384, 512]
d.rectangle([256, 384, 383, 511], fill=(200, 16, 22))
d.rectangle([260, 388, 379, 507], outline=(255, 255, 255), width=2)
for r in (30, 22, 14):
    d.ellipse([320 - r, 440 - r, 320 + r, 440 + r], outline=(255, 255, 255), width=4)
d.line([(320, 440), (350, 470), (362, 470)], fill=(255, 255, 255), width=5)
txt(320, 492, "HIDRANTE", (255, 255, 255), 17)

REG["VIDRO_INCENDIO"] = [384, 384, 640, 448]
d.rectangle([384, 384, 639, 447], fill=(200, 16, 22))
txt(512, 416, "INCÊNDIO", (255, 255, 255), 40)
REG["ETQ_GAVETA"] = [384, 448, 640, 512]
d.rectangle([384, 448, 639, 511], fill=(250, 250, 248))
for i, s in enumerate(("PARAFUSOS", "ROLAMENT.", "VEDAÇÕES", "ELÉTRICA")):
    d.rectangle([386 + i * 64, 450, 446 + i * 64, 509], outline=(60, 60, 60), width=2)
    txt(416 + i * 64, 480, s, (20, 20, 20), 8)
# piso demarcado (vermelho com borda amarela) e faixa zebrada de equipamento de incendio
REG["PISO_INCENDIO"] = [640, 384, 768, 512]
d.rectangle([640, 384, 767, 511], fill=(235, 190, 0))
d.rectangle([652, 396, 755, 499], fill=(190, 20, 20))
# grelha do ralo linear (inox escovado, fendas transversais; 256 x 80 px = 0,5 x 0,156 m)
import random
random.seed(7)
REG["GRELHA_RALO"] = [768, 384, 1024, 464]
for y in range(384, 464):
    base = 176 + random.randint(-5, 5)
    d.line([(768, y), (1023, y)], fill=(base, base + 2, base + 4))
for i in range(22):
    x = 774 + i * 11.4
    d.rounded_rectangle([x, 392, x + 5, 455], 2, fill=(18, 19, 21))
    d.line([(x + 6, 392), (x + 6, 455)], fill=(215, 218, 222))
d.rectangle([768, 384, 1023, 463], outline=(120, 124, 128), width=3)
REG["CAIXA_RALO"] = [768, 464, 848, 512]
d.rectangle([768, 464, 847, 511], fill=(170, 172, 176))
d.ellipse([776, 466, 840, 510], fill=(20, 21, 23))
for i in range(5):
    d.line([(780 + i * 13, 468), (780 + i * 13, 508)], fill=(185, 188, 192), width=3)
T.save(os.path.join(OUT, "eb_oficina.png"), optimize=True)

cat_p = os.path.join(OUT, "_catalogo.json")
cat = json.load(open(cat_p, encoding="utf-8"))
cat["oficina"] = REG
cat["oficina_ferramentas"] = FERR
json.dump(cat, open(cat_p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("oficina:", len(REG), "regioes,", len(FERR), "ferramentas")
