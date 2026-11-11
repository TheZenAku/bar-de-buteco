# 81c_telas_empresa.py - Python do SISTEMA (PIL):  python -I 81c_telas_empresa.py   (depois do 81a)
# Desenha as texturas de detalhe da fabrica EMPRESA BRASIL (81_empresa_brasil.py):
#   eb_telas.png (1024 x 1024): telas da IHM/supervisorio (sinotico, secador com tendencia, tanques, alarmes, ensaque),
#       displays LCD (balanca, ensacadeira, inversor), teclado e teclado numerico, etiquetas de painel, placa de cerca eletrica,
#       placa de alta tensao, manometro, plaqueta de motor, grelha de ventilacao, regua de nivel (cubicagem) do tanque.
#   eb_xadrez.jpg (512): chapa xadrez (piso da balanca, degraus).
# As regioes (px, origem em cima a esquerda) vao para _catalogo.json["telas"]; o 81 le de la. Regrava tudo (idempotente).
import os, json, math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = r"C:\Users\rafael\Desktop\BAR\2.0\map\texturas_512\empresa_brasil"
random.seed(811)
W = 1024
T = Image.new("RGB", (W, W), (20, 20, 22))
d = ImageDraw.Draw(T)
REG = {}


def fonte(px, bold=True, mono=False):
    nomes = (["consolab.ttf", "consola.ttf"] if mono else []) + (["arialbd.ttf"] if bold else ["arial.ttf"]) + ["segoeui.ttf"]
    for n in nomes:
        for cam in (n, "C:/Windows/Fonts/" + n):
            try: return ImageFont.truetype(cam, px)
            except Exception: pass
    return ImageFont.load_default()


def txt(x, y, s, cor, px, bold=True, mono=False, ancora="la"):
    d.text((x, y), s, font=fonte(px, bold, mono), fill=cor, anchor=ancora)


def caixa_valor(x, y, w, h, s, cor=(80, 255, 120), px=14):
    d.rectangle([x, y, x + w, y + h], fill=(5, 8, 12), outline=(70, 80, 95))
    txt(x + w - 4, y + h / 2, s, cor, px, True, True, "rm")


FUNDO, CAB, LINHA, TXT, VERDE, AMAR, VERM, AZUL = (14, 22, 34), (22, 60, 120), (60, 140, 220), (215, 225, 235), (70, 220, 110), (255, 200, 40), (240, 70, 60), (90, 170, 255)
INOX, INOX_E = (150, 160, 170), (95, 105, 115)


def moldura_tela(x0, y0, w, h, titulo, nome):
    REG[nome] = [x0, y0, x0 + w, y0 + h]
    d.rectangle([x0, y0, x0 + w - 1, y0 + h - 1], fill=FUNDO)
    d.rectangle([x0, y0, x0 + w - 1, y0 + 22], fill=CAB)
    txt(x0 + 8, y0 + 4, "EMPRESA BRASIL", (255, 210, 60), 13)
    txt(x0 + 140, y0 + 4, titulo, (255, 255, 255), 13)
    txt(x0 + w - 8, y0 + 4, "10/11/2026  14:52:07   OPERADOR", (200, 215, 235), 11, False, False, "ra")
    # rodape com botoes de navegacao
    by = y0 + h - 22
    d.rectangle([x0, by, x0 + w - 1, y0 + h - 1], fill=(10, 16, 26))
    for i, b in enumerate(["SINÓTICO", "TANQUES", "SECADOR", "ENSAQUE", "ALARMES", "TENDENCIAS"]):
        bx = x0 + 6 + i * ((w - 12) / 6)
        ativo = b.replace("Ó", "O") == titulo.split()[0].replace("Ó", "O")
        d.rounded_rectangle([bx, by + 3, bx + (w - 12) / 6 - 5, y0 + h - 4], 3, fill=(40, 90, 170) if ativo else (32, 40, 52), outline=(80, 100, 130))
        txt(bx + ((w - 12) / 6 - 5) / 2, by + 11, b, (230, 235, 245), 10, True, False, "mm")


def tanque_desenho(x, y, w, h, nivel, tag, temp=None, rpm=None):
    d.rounded_rectangle([x, y, x + w, y + h], 10, fill=(40, 46, 54), outline=INOX, width=2)
    ny = y + h - 4 - (h - 8) * nivel
    d.rounded_rectangle([x + 3, ny, x + w - 3, y + h - 3], 8, fill=(150, 95, 45))
    d.line([x + 3, ny, x + w - 3, ny], fill=(210, 160, 100), width=2)
    # agitador
    d.line([x + w / 2, y - 14, x + w / 2, y + h - 14], fill=(180, 190, 200), width=2)
    d.rectangle([x + w / 2 - 9, y - 26, x + w / 2 + 9, y - 12], fill=(40, 90, 200), outline=(120, 160, 230))
    for k in (0.55, 0.85):
        yy = y + h * k
        d.polygon([(x + w / 2, yy), (x + w / 2 - 16, yy - 5), (x + w / 2 - 16, yy + 3)], fill=(180, 190, 200))
        d.polygon([(x + w / 2, yy), (x + w / 2 + 16, yy + 5), (x + w / 2 + 16, yy - 3)], fill=(180, 190, 200))
    txt(x + w / 2, y + h + 4, tag, TXT, 11, True, False, "ma")
    caixa_valor(x + 2, y + 8, w - 4, 16, "%d %%" % round(nivel * 100), (255, 255, 255), 12)
    if temp is not None: caixa_valor(x + 2, y + 27, w - 4, 16, "%.1f C" % temp, (255, 170, 80), 12)
    if rpm is not None: caixa_valor(x + 2, y + 46, w - 4, 16, "%d rpm" % rpm, (120, 200, 255), 12)


def bomba(x, y, r, ligada=True, tag=""):
    c = VERDE if ligada else (120, 120, 120)
    d.ellipse([x - r, y - r, x + r, y + r], fill=(25, 30, 38), outline=c, width=2)
    d.polygon([(x - r * 0.45, y - r * 0.6), (x - r * 0.45, y + r * 0.6), (x + r * 0.7, y)], fill=c)
    if tag: txt(x, y + r + 3, tag, TXT, 10, True, False, "ma")


def valvula(x, y, s=7, aberta=True, vert=False):
    c = VERDE if aberta else VERM
    if vert: d.polygon([(x - s, y - s), (x + s, y - s), (x - s, y + s), (x + s, y + s)], fill=c)
    else: d.polygon([(x - s, y - s), (x - s, y + s), (x + s, y - s), (x + s, y + s)], fill=c)


def cano(pts, cor=(120, 180, 230), w=4, fluxo=True):
    d.line(pts, fill=cor, width=w, joint="curve")
    if fluxo:
        for a, b in zip(pts, pts[1:]):
            mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
            ang = math.atan2(b[1] - a[1], b[0] - a[0])
            p = [(mx + 6 * math.cos(ang), my + 6 * math.sin(ang)), (mx + 6 * math.cos(ang + 2.5), my + 6 * math.sin(ang + 2.5)),
                 (mx + 6 * math.cos(ang - 2.5), my + 6 * math.sin(ang - 2.5))]
            d.polygon(p, fill=(255, 255, 255))


def secador_desenho(x, y, w, h):
    d.rectangle([x, y, x + w, y + h * 0.6], fill=(40, 46, 54), outline=INOX, width=2)
    d.polygon([(x, y + h * 0.6), (x + w, y + h * 0.6), (x + w * 0.56, y + h), (x + w * 0.44, y + h)], fill=(40, 46, 54), outline=INOX)
    d.polygon([(x + w * 0.2, y), (x + w * 0.8, y), (x + w * 0.62, y - 14), (x + w * 0.38, y - 14)], fill=(60, 66, 74), outline=INOX)
    # spray (gotas)
    for i in range(28):
        a = random.uniform(-1.0, 1.0); r_ = random.uniform(4, h * 0.45)
        px_, py_ = x + w / 2 + math.sin(a) * r_ * 0.8, y + 8 + math.cos(a) * r_ * 0.7
        d.ellipse([px_ - 1, py_ - 1, px_ + 1, py_ + 1], fill=(220, 190, 150))


# ---------------------------------------------------------------- 1) SINOTICO (512 x 256)
def tela_sinotico(X, Y):
    moldura_tela(X, Y, 512, 256, "SINÓTICO GERAL", "TELA_SINOTICO")
    for i, (nv, t) in enumerate(((0.72, 62.4), (0.41, 58.9), (0.88, 64.1))):
        tanque_desenho(X + 18 + i * 62, Y + 70, 46, 84, nv, "TQ-10%d" % (i + 1), t)
    cano([(X + 41, Y + 168), (X + 41, Y + 182), (X + 230, Y + 182)], w=4)
    for i in range(3): valvula(X + 41 + i * 62, Y + 175, 5, i != 1, True)
    bomba(X + 238, Y + 182, 11, True, "B-201")
    cano([(X + 249, Y + 182), (X + 270, Y + 182), (X + 270, Y + 48), (X + 318, Y + 48)], (240, 200, 120))
    bomba(X + 270, Y + 120, 10, True, "BAP-301")
    secador_desenho(X + 300, Y + 58, 70, 120)
    txt(X + 335, Y + 182, "SD-301", TXT, 11, True, False, "ma")
    caixa_valor(X + 300, Y + 32, 70, 15, "185.2 C", (255, 140, 60), 12)
    # ar quente
    cano([(X + 290, Y + 40), (X + 316, Y + 40)], (255, 120, 50), 5, False)
    # ciclone
    d.polygon([(X + 400, Y + 70), (X + 430, Y + 70), (X + 430, Y + 110), (X + 418, Y + 140), (X + 412, Y + 140), (X + 400, Y + 110)], fill=(40, 46, 54), outline=INOX)
    txt(X + 415, Y + 144, "CI-302", TXT, 10, True, False, "ma")
    cano([(X + 370, Y + 100), (X + 400, Y + 100)], (200, 200, 200), 3)
    cano([(X + 335, Y + 186), (X + 335, Y + 205), (X + 455, Y + 205), (X + 455, Y + 150)], (230, 200, 140), 4)
    # ensacadeira
    d.rectangle([X + 440, Y + 100, X + 490, Y + 148], fill=(30, 70, 40), outline=(90, 200, 120), width=2)
    d.polygon([(X + 450, Y + 148), (X + 480, Y + 148), (X + 468, Y + 165), (X + 462, Y + 165)], fill=INOX_E)
    txt(X + 465, Y + 84, "EN-401", TXT, 10, True, False, "ma")
    caixa_valor(X + 438, Y + 168, 56, 15, "148 sc/h", VERDE, 11)
    # faixa de alarme
    d.rectangle([X + 4, Y + 214, X + 508, Y + 231], fill=(70, 50, 10), outline=AMAR)
    txt(X + 10, Y + 217, "! FILTRO DE MANGAS CI-302: DIFERENCIAL DE PRESSÃO ALTO (18 mbar)", AMAR, 11)


# ---------------------------------------------------------------- 2) SECADOR com tendencia (512 x 256)
def tela_secador(X, Y):
    moldura_tela(X, Y, 512, 256, "SECADOR SPRAY SD-301", "TELA_SECADOR")
    secador_desenho(X + 20, Y + 60, 80, 130)
    linhas = [("TEMP. ENTR. AR", "185.2 C", (255, 140, 60)), ("TEMP. SAÍDA AR", "82.4 C", (255, 200, 80)),
              ("PRESSÃO BICO", "210 bar", (120, 200, 255)), ("VAZÃO PRODUTO", "1.24 m3/h", VERDE),
              ("UMIDADE PÓ", "3.1 %", VERDE), ("ROTAÇÃO EXAUSTOR", "1480 rpm", (200, 200, 255))]
    for i, (a, b, c) in enumerate(linhas):
        txt(X + 116, Y + 34 + i * 26, a, TXT, 10, False)
        caixa_valor(X + 116, Y + 47 + i * 26 - 1, 92, 14, b, c, 11)
    # grafico de tendencia
    gx0, gy0, gx1, gy1 = X + 228, Y + 34, X + 504, Y + 222
    d.rectangle([gx0, gy0, gx1, gy1], fill=(6, 10, 16), outline=(70, 80, 95))
    for i in range(1, 6): d.line([gx0, gy0 + i * (gy1 - gy0) / 6, gx1, gy0 + i * (gy1 - gy0) / 6], fill=(30, 40, 52))
    for i in range(1, 8): d.line([gx0 + i * (gx1 - gx0) / 8, gy0, gx0 + i * (gx1 - gx0) / 8, gy1], fill=(30, 40, 52))
    txt(gx0 + 4, gy0 + 2, "TENDÊNCIA - ÚLTIMA HORA", TXT, 10)
    for cor, base, amp, ruido in (((255, 140, 60), 0.25, 0.05, 0.015), ((255, 210, 80), 0.62, 0.06, 0.02), ((120, 200, 255), 0.45, 0.1, 0.03)):
        pts = []
        for i in range(70):
            t = i / 69
            v = base + amp * math.sin(t * 7 + base * 10) + random.uniform(-ruido, ruido)
            pts.append((gx0 + 2 + t * (gx1 - gx0 - 4), gy0 + 14 + v * (gy1 - gy0 - 20)))
        d.line(pts, fill=cor, width=2)
    for i, h in enumerate(("13:52", "14:07", "14:22", "14:37", "14:52")):
        txt(gx0 + i * (gx1 - gx0) / 4, gy1 + 2, h, (160, 170, 185), 9, False, False, "ma" if 0 < i < 4 else ("la" if i == 0 else "ra"))
    # botoes de comando
    for i, (b, c) in enumerate((("PARTIR", (30, 120, 50)), ("PARAR", (150, 30, 30)), ("CIP", (40, 80, 150)))):
        d.rounded_rectangle([X + 20 + i * 64, Y + 202, X + 78 + i * 64, Y + 226], 4, fill=c, outline=(200, 210, 220))
        txt(X + 49 + i * 64, Y + 214, b, (255, 255, 255), 11, True, False, "mm")


# ---------------------------------------------------------------- 3) TANQUES (512 x 256)
def tela_tanques(X, Y):
    moldura_tela(X, Y, 512, 256, "TANQUES DE PREPARO", "TELA_TANQUES")
    dados = ((0.72, 62.4, 120, 4520, "MISTURANDO"), (0.41, 58.9, 0, 2570, "CARREGANDO"), (0.88, 64.1, 95, 5540, "PRONTO"))
    for i, (nv, t, rpm, litros, est) in enumerate(dados):
        x = X + 14 + i * 166
        d.rounded_rectangle([x, Y + 30, x + 156, Y + 206], 6, fill=(20, 30, 44), outline=(60, 80, 110))
        txt(x + 78, Y + 34, "TQ-10%d" % (i + 1), (255, 255, 255), 14, True, False, "ma")
        tanque_desenho(x + 10, Y + 72, 56, 100, nv, "", None, None)
        for j, (a, b, c) in enumerate((("NIVEL", "%d %%" % round(nv * 100), (255, 255, 255)), ("VOLUME", "%d L" % litros, VERDE),
                                       ("TEMP.", "%.1f C" % t, (255, 170, 80)), ("AGITADOR", "%d rpm" % rpm, (120, 200, 255)),
                                       ("RECEITA", "MIX-04", AMAR))):
            txt(x + 74, Y + 56 + j * 26, a, (170, 185, 205), 10, False)
            caixa_valor(x + 74, Y + 67 + j * 26, 76, 13, b, c, 11)
        cor = {"MISTURANDO": (40, 120, 200), "CARREGANDO": (200, 140, 20), "PRONTO": (30, 140, 60)}[est]
        d.rounded_rectangle([x + 8, Y + 184, x + 148, Y + 201], 3, fill=cor)
        txt(x + 78, Y + 192, est, (255, 255, 255), 11, True, False, "mm")
    txt(X + 14, Y + 214, "CUBICAGEM: 6.84 m3 por tanque  |  1 saco de 25 kg = ~ 21 L de emulsao", (180, 195, 215), 10, False)


# ---------------------------------------------------------------- 4) ALARMES (512 x 256)
def tela_alarmes(X, Y):
    moldura_tela(X, Y, 512, 256, "ALARMES E EVENTOS", "TELA_ALARMES")
    d.rectangle([X + 6, Y + 28, X + 506, Y + 44], fill=(30, 44, 64))
    for cx, h in ((10, "DATA/HORA"), (122, "TAG"), (190, "DESCRIÇÃO"), (420, "PRIOR."), (470, "ESTADO")):
        txt(X + cx, Y + 31, h, (200, 215, 235), 10)
    linhas = [("10/11 14:51:33", "CI-302", "FILTRO DE MANGAS - DP ALTO", "ALTA", AMAR, "ATIVO"),
              ("10/11 14:47:02", "EN-401", "ENSACADEIRA PARADA - FALTA SACO", "MEDIA", (255, 150, 60), "ATIVO"),
              ("10/11 14:40:18", "TQ-102", "NIVEL BAIXO", "BAIXA", AZUL, "RECON."),
              ("10/11 14:22:51", "BAP-301", "PRESSÃO BICO 230 bar", "ALTA", VERM, "NORMAL."),
              ("10/11 13:58:10", "SD-301", "TEMPERATURA SAÍDA 95 C", "ALTA", VERM, "NORMAL."),
              ("10/11 13:31:44", "B-201", "BOMBA PARTIU", "EVENTO", (160, 170, 180), "-"),
              ("10/11 13:30:02", "TQ-101", "AGITADOR LIGADO", "EVENTO", (160, 170, 180), "-"),
              ("10/11 12:15:27", "QGBT-01", "QUEDA DE TENSÃO FASE R", "MEDIA", (255, 150, 60), "NORMAL.")]
    for i, (a, b, c, p, cor, e) in enumerate(linhas):
        y = Y + 47 + i * 19
        if i % 2 == 0: d.rectangle([X + 6, y - 1, X + 506, y + 16], fill=(18, 28, 42))
        if e == "ATIVO": d.rectangle([X + 6, y - 1, X + 9, y + 16], fill=cor)
        txt(X + 12, y + 2, a, TXT, 10, False, True); txt(X + 122, y + 2, b, (255, 255, 255), 10)
        txt(X + 190, y + 2, c, cor if e == "ATIVO" else TXT, 10, e == "ATIVO"); txt(X + 420, y + 2, p, cor, 10)
        txt(X + 470, y + 2, e, TXT, 10, False)
    for i, b in enumerate(("RECONHECER", "RECONHECER TODOS", "SILENCIAR")):
        d.rounded_rectangle([X + 8 + i * 120, Y + 204, X + 120 + i * 120, Y + 226], 4, fill=(50, 60, 75), outline=(140, 150, 170))
        txt(X + 64 + i * 120, Y + 215, b, (255, 255, 255), 10, True, False, "mm")


# ---------------------------------------------------------------- 5) ENSAQUE (256 x 128) e IHM do painel (256 x 128)
def tela_ensaque(X, Y, w=256, h=128, nome="TELA_ENSAQUE"):
    REG[nome] = [X, Y, X + w, Y + h]
    d.rectangle([X, Y, X + w - 1, Y + h - 1], fill=FUNDO)
    d.rectangle([X, Y, X + w - 1, Y + 16], fill=CAB)
    txt(X + 5, Y + 2, "EN-401 ENSACADEIRA", (255, 255, 255), 11)
    txt(X + w - 5, Y + 2, "AUTO", VERDE, 11, True, False, "ra")
    txt(X + 8, Y + 22, "PESO", (170, 185, 205), 10, False)
    txt(X + 8, Y + 34, "25.02", (80, 255, 120), 30, True, True)
    txt(X + 112, Y + 48, "kg", (80, 255, 120), 13)
    txt(X + 150, Y + 22, "META 25.00 kg", TXT, 10, False)
    txt(X + 150, Y + 36, "SACOS/H  148", TXT, 10, False)
    txt(X + 150, Y + 50, "LOTE  0459", TXT, 10, False)
    txt(X + 150, Y + 64, "TOTAL  1.236", TXT, 10, False)
    for i in range(22):
        hh = 8 + int(22 * (0.5 + 0.5 * math.sin(i * 0.7)) + random.randint(-3, 3))
        d.rectangle([X + 8 + i * 6, Y + 106 - hh, X + 12 + i * 6, Y + 106], fill=(60, 140, 230))
    d.line([X + 8, Y + 80, X + 140, Y + 80], fill=AMAR)
    for i, (b, c) in enumerate((("INICIAR", (30, 120, 50)), ("PARAR", (150, 30, 30)))):
        d.rounded_rectangle([X + 152 + i * 50, Y + 84, X + 198 + i * 50, Y + 106], 3, fill=c)
        txt(X + 175 + i * 50, Y + 95, b, (255, 255, 255), 9, True, False, "mm")
    d.rectangle([X, Y + h - 16, X + w - 1, Y + h - 1], fill=(10, 16, 26))
    txt(X + 5, Y + h - 14, "OK - PRONTO PARA ENSACAR", VERDE, 10)


def lcd(X, Y, w, h, valor, unidade, nome, cor=(170, 255, 140), fundo=(18, 40, 22)):
    REG[nome] = [X, Y, X + w, Y + h]
    d.rectangle([X, Y, X + w - 1, Y + h - 1], fill=(30, 32, 34))
    d.rectangle([X + 6, Y + 6, X + w - 7, Y + h - 7], fill=fundo)
    txt(X + w - 50, Y + h / 2, valor, cor, int(h * 0.62), True, True, "rm")
    txt(X + w - 12, Y + h / 2 + 4, unidade, cor, int(h * 0.3), True, False, "rm")
    for i, s in enumerate(("ZERO", "TARA", "BRUTO")):
        txt(X + 12, Y + 9 + i * (h - 18) / 3, s, cor if i == 2 else (60, 110, 60), int(h * 0.15), True)


def teclado(X, Y, w, h, nome):
    REG[nome] = [X, Y, X + w, Y + h]
    d.rectangle([X, Y, X + w - 1, Y + h - 1], fill=(35, 36, 40))
    linhas = [14, 14, 13, 12, 11]
    kw = (w - 20) / 15.5
    for r, n in enumerate(linhas):
        for c in range(n):
            x = X + 6 + c * kw + r * kw * 0.25
            y = Y + 6 + r * (h - 12) / 5
            d.rounded_rectangle([x, y, x + kw - 2, y + (h - 12) / 5 - 2], 2, fill=(18, 18, 20), outline=(60, 62, 66))
    d.rounded_rectangle([X + 6 + 3 * kw, Y + h - 6 - (h - 12) / 5, X + 6 + 10 * kw, Y + h - 8], 2, fill=(18, 18, 20), outline=(60, 62, 66))


def teclado_num(X, Y, w, h, nome):
    REG[nome] = [X, Y, X + w, Y + h]
    d.rectangle([X, Y, X + w - 1, Y + h - 1], fill=(190, 195, 200))
    rot = ["1", "2", "3", "F1", "4", "5", "6", "F2", "7", "8", "9", "TARA", "<", "0", ".", "OK"]
    for i, s in enumerate(rot):
        c, r = i % 4, i // 4
        x = X + 6 + c * (w - 12) / 4; y = Y + 6 + r * (h - 12) / 4
        cor = (40, 140, 60) if s == "OK" else ((200, 60, 40) if s == "<" else (60, 64, 70))
        d.rounded_rectangle([x, y, x + (w - 12) / 4 - 4, y + (h - 12) / 4 - 4], 4, fill=cor)
        txt(x + ((w - 12) / 4 - 4) / 2, y + ((h - 12) / 4 - 4) / 2, s, (255, 255, 255), 13 if len(s) < 3 else 9, True, False, "mm")


def etiqueta(X, Y, w, h, s, nome, fundo=(245, 245, 240), cor=(20, 20, 20)):
    REG[nome] = [X, Y, X + w, Y + h]
    d.rectangle([X, Y, X + w - 1, Y + h - 1], fill=fundo, outline=(80, 80, 80), width=2)
    px = int(h * 0.5)
    f = fonte(px)
    while d.textlength(s, font=f) > w - 10 and px > 8:
        px -= 1; f = fonte(px)
    txt(X + w / 2, Y + h / 2, s, cor, px, True, False, "mm")


def placa_cerca(X, Y, w, h):
    REG["CERCA"] = [X, Y, X + w, Y + h]
    d.rectangle([X, Y, X + w - 1, Y + h - 1], fill=(255, 205, 0))
    d.rectangle([X + 3, Y + 3, X + w - 4, Y + h - 4], outline=(20, 20, 20), width=3)
    # raio
    rx, ry = X + 40, Y + h / 2
    d.polygon([(rx - 6, ry - 34), (rx + 14, ry - 34), (rx + 2, ry - 4), (rx + 16, ry - 4), (rx - 14, ry + 36), (rx - 4, ry + 4), (rx - 18, ry + 4)], fill=(20, 20, 20))
    txt(X + 150, Y + 24, "CUIDADO", (20, 20, 20), 26, True, False, "mm")
    txt(X + 150, Y + 62, "CERCA", (200, 20, 20), 30, True, False, "mm")
    txt(X + 150, Y + 98, "ELETRIFICADA", (200, 20, 20), 22, True, False, "mm")


def placa_alta_tensao(X, Y, s):
    REG["ALTA_TENSAO"] = [X, Y, X + s, Y + s]
    d.rectangle([X, Y, X + s - 1, Y + s - 1], fill=(250, 250, 245))
    d.polygon([(X + s / 2, Y + 6), (X + s - 10, Y + s * 0.66), (X + 10, Y + s * 0.66)], fill=(255, 205, 0), outline=(20, 20, 20))
    d.line([(X + s / 2, Y + 6), (X + s - 10, Y + s * 0.66), (X + 10, Y + s * 0.66), (X + s / 2, Y + 6)], fill=(20, 20, 20), width=4)
    cx, cy = X + s / 2, Y + s * 0.44
    d.polygon([(cx - 3, cy - 22), (cx + 9, cy - 22), (cx + 1, cy - 2), (cx + 10, cy - 2), (cx - 8, cy + 24), (cx - 3, cy + 3), (cx - 12, cy + 3)], fill=(20, 20, 20))
    txt(X + s / 2, Y + s * 0.79, "PERIGO", (200, 20, 20), 17, True, False, "mm")
    txt(X + s / 2, Y + s * 0.96, "ALTA TENSÃO", (20, 20, 20), 11, True, False, "mb")


def manometro(X, Y, s):
    REG["MANOMETRO"] = [X, Y, X + s, Y + s]
    d.rectangle([X, Y, X + s - 1, Y + s - 1], fill=(30, 30, 30))
    cx, cy, r = X + s / 2, Y + s / 2, s / 2 - 4
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(245, 245, 240), outline=(120, 120, 120), width=3)
    d.arc([cx - r + 10, cy - r + 10, cx + r - 10, cy + r - 10], 30, 45, fill=(220, 30, 30), width=8)
    for i in range(11):
        a = math.radians(135 + i * 27)
        d.line([cx + math.cos(a) * (r - 16), cy + math.sin(a) * (r - 16), cx + math.cos(a) * (r - 6), cy + math.sin(a) * (r - 6)], fill=(20, 20, 20), width=2)
        txt(cx + math.cos(a) * (r - 27), cy + math.sin(a) * (r - 27), str(i), (20, 20, 20), 11, True, False, "mm")
    txt(cx, cy + r * 0.45, "bar", (20, 20, 20), 12, False, False, "mm")
    a = math.radians(135 + 6.8 * 27)
    d.line([cx, cy, cx + math.cos(a) * (r - 14), cy + math.sin(a) * (r - 14)], fill=(200, 20, 20), width=4)
    d.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=(40, 40, 40))


def plaqueta_motor(X, Y, w, h):
    REG["PLAQUETA"] = [X, Y, X + w, Y + h]
    d.rectangle([X, Y, X + w - 1, Y + h - 1], fill=(200, 200, 195), outline=(90, 90, 90), width=2)
    for i, s in enumerate(("MOTOR TRIFÁSICO", "7,5 cv  220/380 V  60 Hz", "1750 rpm   IP55   FS 1,15", "N. 0459-2026")):
        txt(X + 5, Y + 4 + i * (h - 8) / 4, s, (25, 25, 25), int((h - 8) / 4 * 0.62), i == 0)


def grelha(X, Y, w, h):
    REG["GRELHA"] = [X, Y, X + w, Y + h]
    d.rectangle([X, Y, X + w - 1, Y + h - 1], fill=(170, 172, 170))
    d.rectangle([X + 6, Y + 6, X + w - 7, Y + h - 7], fill=(150, 152, 150))
    for i in range(12):
        y = Y + 10 + i * (h - 20) / 12
        d.rectangle([X + 10, y, X + w - 11, y + (h - 20) / 24], fill=(30, 32, 34))


def regua(X, Y, w, h):
    """Regua de nivel do tanque (cubicagem): 0 a 6.800 L de baixo para cima."""
    REG["REGUA"] = [X, Y, X + w, Y + h]
    d.rectangle([X, Y, X + w - 1, Y + h - 1], fill=(235, 235, 230))
    for i in range(69):
        y = Y + h - 6 - i * (h - 12) / 68
        grande = i % 10 == 0
        d.line([X + 2, y, X + (w * 0.7 if grande else w * 0.35), y], fill=(20, 20, 20), width=2 if grande else 1)
        if grande:
            txt(X + w - 3, y - 1, "%d" % (i * 100), (200, 20, 20), 11, True, False, "rb")
    txt(X + w / 2, Y + 4, "L", (20, 20, 20), 12, True, False, "ma")


# ---------------------------------------------------------------- composicao
tela_sinotico(0, 0); tela_secador(512, 0); tela_tanques(0, 256); tela_alarmes(512, 256)
tela_ensaque(0, 512)
lcd(256, 512, 256, 64, "25.02", "kg", "LCD_BALANCA")
lcd(256, 576, 256, 64, "48.6", "Hz", "LCD_INVERSOR", (255, 120, 40), (35, 14, 6))
tela_ensaque(512, 512, 256, 128, "IHM_PAINEL")
teclado(768, 512, 256, 128, "TECLADO")
teclado_num(0, 640, 128, 128, "TECLADO_NUM")
for i, s in enumerate(("QGBT-01", "QGBT-02", "QGBT-03", "QGBT-04", "CCM SECADOR", "CCM PREPARO", "CCM ENSAQUE", "PAINEL IHM")):
    etiqueta(128 + (i % 4) * 128, 640 + (i // 4) * 64, 128, 64, s, "ETQ_" + s.replace(" ", "_").replace("-", "_"))
placa_cerca(640, 640, 256, 128)
placa_alta_tensao(896, 640, 128)
manometro(0, 768, 128)
plaqueta_motor(128, 768, 128, 64)
grelha(128, 832, 128, 64)
for i, (s, f, c) in enumerate((("LIGA", (30, 130, 50), (255, 255, 255)), ("DESLIGA", (170, 30, 30), (255, 255, 255)),
                               ("EMERGÊNCIA", (255, 205, 0), (20, 20, 20)), ("REMOTO / LOCAL", (30, 30, 30), (255, 255, 255)),
                               ("CHAVE GERAL", (30, 30, 30), (255, 255, 255)), ("REARME", (40, 80, 160), (255, 255, 255)))):
    etiqueta(256 + (i % 3) * 128, 768 + (i // 3) * 32, 128, 32, s, "BOT_" + str(i), f, c)
regua(640, 768, 64, 256)
etiqueta(704, 768, 192, 64, "TQ-101  6.800 L", "ETQ_TQ1")
etiqueta(704, 832, 192, 64, "TQ-102  6.800 L", "ETQ_TQ2")
etiqueta(704, 896, 192, 64, "TQ-103  6.800 L", "ETQ_TQ3")
etiqueta(256, 832, 384, 64, "BOMBA DE ALTA PRESSÃO  BAP-301", "ETQ_BAP")
etiqueta(256, 896, 384, 64, "COMPRESSOR DE AR  CP-501", "ETQ_CP")
etiqueta(0, 896, 256, 64, "B-201 BOMBA SANITÁRIA", "ETQ_B201")
etiqueta(0, 960, 256, 64, "EN-401 ENSACADEIRA", "ETQ_EN")
etiqueta(256, 960, 384, 64, "CENTRAL DE CHOQUE - 10.000 V", "ETQ_CERCA")
etiqueta(896, 768, 128, 64, "ESTOQUE A1", "ETQ_RACK")


def folha(X, Y, w, h):
    """Folha A4 de checklist de turno (prancheta da sala de controle)."""
    REG["FOLHA"] = [X, Y, X + w, Y + h]
    d.rectangle([X, Y, X + w - 1, Y + h - 1], fill=(246, 245, 238))
    txt(X + 6, Y + 5, "EMPRESA BRASIL", (0, 110, 55), 9)
    txt(X + 6, Y + 16, "CHECKLIST DE TURNO", (20, 20, 20), 10)
    d.line([X + 5, Y + 29, X + w - 6, Y + 29], fill=(60, 60, 60))
    itens = ["Nivel TQ-101/102/103", "Temp. secador", "Pressao BAP-301", "Filtro de mangas", "Balanca aferida",
             "Lacre dos sacos", "Limpeza CIP", "EPI da equipe", "Extintores", "Estoque MP"]
    for i, it in enumerate(itens):
        y = Y + 36 + i * 14
        d.rectangle([X + 6, y, X + 14, y + 8], outline=(40, 40, 40))
        if i % 3 != 2: d.line([X + 7, y + 4, X + 9, y + 7, X + 14, y - 1], fill=(20, 40, 160), width=2)
        txt(X + 18, y - 1, it, (30, 30, 30), 8, False)
    d.line([X + 6, Y + h - 18, X + 70, Y + h - 18], fill=(60, 60, 60))
    for i in range(5):
        d.arc([X + 10 + i * 9, Y + h - 30, X + 22 + i * 9, Y + h - 20], 200, 340, fill=(20, 40, 160), width=1)
    txt(X + 6, Y + h - 14, "Operador", (80, 80, 80), 8, False)


folha(896, 832, 128, 192)
REG["LCD_TELEFONE"] = [704, 960, 896, 1024]
d.rectangle([704, 960, 895, 1023], fill=(150, 175, 160))
txt(710, 965, "RAMAL 201 - CONTROLE", (25, 35, 30), 12, True)
txt(710, 983, "10/11  14:52", (25, 35, 30), 17, True, True)
txt(830, 1006, "LINHA 1", (25, 35, 30), 10, True)
T.save(os.path.join(OUT, "eb_telas.png"), optimize=True)

# ---------------------------------------------------------------- chapa xadrez (512, repete a cada 0,4 m)
X = Image.new("L", (512, 512), 120)
dx = ImageDraw.Draw(X)
passo = 64
for j in range(9):
    for i in range(9):
        cx, cy = i * passo + (passo / 2 if j % 2 else 0), j * passo
        horiz = (i + j) % 2 == 0
        for sx in (0, passo / 2):
            px_, py_ = cx + sx - passo / 4, cy + (passo / 4 if sx else 0)
            if horiz: dx.rounded_rectangle([px_ - 14, py_ - 4, px_ + 14, py_ + 4], 4, fill=200)
            else: dx.rounded_rectangle([px_ - 4, py_ - 14, px_ + 4, py_ + 14], 4, fill=200)
X = X.filter(ImageFilter.GaussianBlur(1.0))
ruido = Image.effect_noise((512, 512), 18).filter(ImageFilter.GaussianBlur(2))
X = Image.blend(X, ruido, 0.15)
Image.merge("RGB", (X, X, X.point(lambda v: min(255, v + 5)))).save(os.path.join(OUT, "eb_xadrez.jpg"), quality=90)

cat_p = os.path.join(OUT, "_catalogo.json")
cat = json.load(open(cat_p, encoding="utf-8"))
cat["telas"] = REG
im = Image.open(os.path.join(OUT, "eb_xadrez.jpg")).convert("RGB").resize((64, 64))
lin = lambda c: (c / 255.0) / 12.92 if c <= 10 else ((c / 255.0 + 0.055) / 1.055) ** 2.4
px = list(im.getdata())
cat["eb_xadrez"] = {"media_linear": [round(sum(lin(p[i]) for p in px) / len(px), 4) for i in range(3)]}
json.dump(cat, open(cat_p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("telas:", len(REG), "regioes ->", os.path.join(OUT, "eb_telas.png"))
