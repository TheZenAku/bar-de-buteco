# 81a_texturas_empresa.py - Python do SISTEMA (PIL):  python -I 81a_texturas_empresa.py
# Texturas da fabrica EMPRESA BRASIL (81_empresa_brasil.py):
#  1) reduz para 512 px os conjuntos da Poliigon usados na fabrica -> map\texturas_512\empresa_brasil\<Conjunto>\cor.jpg / normal.jpg
#     (normal no formato OpenGL como vem; GLOSS nao e usado - rugosidade fica constante no material, mais leve);
#  2) gera as texturas proprias (desenhadas aqui, sem foto): eb_grade.jpg (piso de grade das plataformas, 512),
#     eb_atlas.png (placas, letreiro, rotulos dos sacos, telas do painel; 1024 porque tem texto - o jogo ainda reduz na qualidade baixa).
#  3) grava _catalogo.json com a cor media LINEAR de cada cor.jpg (o 81 tinge com cor_alvo / media, como o 80).
# Nao toca nos originais. Idempotente (regrava tudo).
import os, json, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SRC = r"C:\Users\rafael\Downloads\poliigon"
OUT = r"C:\Users\rafael\Desktop\BAR\2.0\map\texturas_512\empresa_brasil"
# conjunto da Poliigon -> nome curto UNICO dos arquivos (o exportador glTF nomeia as texturas pelo arquivo: "cor.jpg" repetido
# virava cor-3.jpg / normal-10.jpg no export)
CONJ = {"Poliigon_ConcreteFloorPoured_7656": "piso_concreto", "Poliigon_ConcreteWorn_8690": "patio_concreto",
        "Poliigon_PlasterPainted_7664": "reboco", "Poliigon_MetalPaintedMatte_7037": "metal_pintado",
        "MetalGalvanizedSteelWorn001": "galvanizado", "Poliigon_WoodVeneerOak_7760": "madeira_palete",
        "Poliigon_TilesCeramicWhite_6956": "azulejo", "Poliigon_PlasticMoldWorn_7486": "plastico",
        "Poliigon_PlasticMoldDryBlast_7495": "plastico_jato", "Poliigon_BoucleFabricBubbly_7827": "tecido",
        "FabricPlainNaturalSheer009": "tecido_cru"}
SO_NORMAL = set()
SO_COR = {"madeira_palete", "patio_concreto"}          # normal nao usada no 81
os.makedirs(OUT, exist_ok=True)


def achar(pasta, chaves, evita=()):
    for raiz, _, fs in os.walk(os.path.join(SRC, pasta)):
        for f in sorted(fs):
            fl = f.lower()
            if fl.endswith((".jpg", ".png")) and any(k in fl for k in chaves) and not any(e in fl for e in evita) and "preview" not in fl:
                return os.path.join(raiz, f)


def media_linear(im):
    px = im.convert("RGB").resize((64, 64), Image.BILINEAR).getdata()
    lin = lambda c: (c / 255.0) / 12.92 if c <= 10 else ((c / 255.0 + 0.055) / 1.055) ** 2.4
    s = [0.0, 0.0, 0.0]
    for p in px:
        for i in range(3): s[i] += lin(p[i])
    return [round(v / len(px), 4) for v in s]


cat = {}
import shutil
for c in os.listdir(OUT):                                     # pastas por conjunto da versao anterior
    if os.path.isdir(os.path.join(OUT, c)): shutil.rmtree(os.path.join(OUT, c))
for c, curto in CONJ.items():
    d = OUT
    fc = achar(c, ("basecolor", "_col_"), ("metalness.jpg_",))
    fn = achar(c, ("_normal", "_nrm_"), ("nrm16",))
    e = {}
    if fc and curto not in SO_NORMAL:
        im = Image.open(fc).convert("RGB").resize((512, 512), Image.LANCZOS)
        if curto == "azulejo":                                       # azulejo branco de industria: clareia, mantendo o rejunte
            g_ = im.convert("L"); vs_ = sorted(g_.getdata()); claro = vs_[int(len(vs_) * 0.6)]
            im = Image.merge("RGB", [c_.point(lambda v, o_=o_: max(0, min(255, int(250 - (claro - v) * 1.6) + o_))) for c_, o_ in zip(im.split(), (0, 0, 2))])
            # rejunte: no original e uma linha MAIS CLARA (picos do perfil de colunas/linhas); aqui vira cinza, 3 px
            px_ = g_.load(); W_ = g_.size[0]
            col_ = [sum(px_[x, y] for y in range(0, W_, 2)) for x in range(W_)]
            md_ = sum(col_) / W_; mx_ = max(col_)
            picos_ = [i for i in range(W_) if col_[i] > md_ + (mx_ - md_) * 0.5 and col_[i] == max(col_[max(0, i - 8):i + 9])] + [0]
            dr_ = ImageDraw.Draw(im)
            for q in picos_:
                for o in (-1, 0, 1):
                    dr_.line([((q + o) % W_, 0), ((q + o) % W_, W_ - 1)], fill=(196, 198, 198) if o == 0 else (214, 215, 214))
                    dr_.line([(0, (q + o) % W_), (W_ - 1, (q + o) % W_)], fill=(196, 198, 198) if o == 0 else (214, 215, 214))
        im.save(os.path.join(d, "eb_%s_cor.jpg" % curto), quality=88, optimize=True)
        e["cor"] = os.path.basename(fc); e["media_linear"] = media_linear(im)
    if fn and curto not in SO_COR:
        im = Image.open(fn)
        if im.mode not in ("RGB", "L"): im = im.convert("RGB")
        if im.mode == "I;16" or im.mode == "I": im = im.point(lambda v: v / 256).convert("RGB")
        im = im.convert("RGB").resize((512, 512), Image.LANCZOS)
        im.save(os.path.join(d, "eb_%s_normal.jpg" % curto), quality=92, optimize=True)
        e["normal"] = os.path.basename(fn)
    e["origem"] = c
    cat[curto] = e
    print(c, e)

# ---------------------------------------------------------------- grade das plataformas (512, repete a cada 0,5 m)
g = Image.new("RGB", (512, 512), (24, 24, 26))
dr = ImageDraw.Draw(g)
passo, barra = 32, 7                      # 16 barras portantes por textura (3 cm) e travessas a cada 4
for i in range(16):
    x = i * passo + 4
    dr.rectangle([x, 0, x + barra, 511], fill=(150, 152, 150))
    dr.line([x, 0, x, 511], fill=(190, 192, 188))
for j in range(4):
    y = j * 128 + 60
    dr.rectangle([0, y, 511, y + 5], fill=(138, 140, 138))
    dr.line([0, y, 511, y], fill=(185, 186, 182))
g = g.filter(ImageFilter.GaussianBlur(0.6))
g.save(os.path.join(OUT, "eb_grade.jpg"), quality=90)
cat["eb_grade"] = {"media_linear": media_linear(g)}

# ---------------------------------------------------------------- inox escovado (512, repete a cada 1,6 m)
import random
random.seed(81)
ino = Image.new("L", (512, 512), 0)
pi = ino.load()
for y in range(512):
    base = 178 + random.randint(-6, 6)
    for x in range(512):
        pi[x, y] = max(0, min(255, base + random.randint(-14, 14)))
ino = ino.filter(ImageFilter.BoxBlur(0)).resize((512, 512))
ino = ino.transform((512, 512), Image.AFFINE, (1, 0, 0, 0, 1, 0)).filter(ImageFilter.GaussianBlur(0.4))
# riscos longos na horizontal (escovado): borra so em x
ino = ino.resize((64, 512), Image.BILINEAR).resize((512, 512), Image.BICUBIC)
ruido = Image.effect_noise((512, 512), 10).filter(ImageFilter.GaussianBlur(18))
ino = Image.blend(ino, ruido.point(lambda v: 150 + v // 3), 0.25)
Image.merge("RGB", (ino, ino, ino.point(lambda v: min(255, v + 4)))).save(os.path.join(OUT, "eb_inox.jpg"), quality=90)
cat["eb_inox"] = {"media_linear": media_linear(Image.open(os.path.join(OUT, "eb_inox.jpg")))}
# ---------------------------------------------------------------- azulejo branco 15 x 15 cm (512 = 4 x 4 pecas = 0,6 m)
az = Image.new("RGB", (512, 512), (168, 170, 168))
da = ImageDraw.Draw(az)
for i in range(4):
    for j in range(4):
        t = 236 + random.randint(-5, 4)
        da.rectangle([i * 128 + 3, j * 128 + 3, i * 128 + 124, j * 128 + 124], fill=(t, t, t - 2))
        da.line([i * 128 + 6, j * 128 + 6, i * 128 + 60, j * 128 + 6], fill=(250, 250, 250), width=2)
az = az.filter(ImageFilter.GaussianBlur(0.7))
az.save(os.path.join(OUT, "eb_azulejo.jpg"), quality=90)
cat["eb_azulejo"] = {"media_linear": media_linear(az)}

# ---------------------------------------------------------------- atlas 1024 (celulas de 128; ver ATLAS no 81)
A = Image.new("RGBA", (1024, 1024), (255, 255, 255, 255))
d = ImageDraw.Draw(A)


def fonte(px, bold=True):
    for nome in (("arialbd.ttf", "Arial Bold") if bold else ("arial.ttf", "Arial")):
        try: return ImageFont.truetype(nome, px)
        except Exception: pass
    for nome in ("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/segoeuib.ttf"):
        try: return ImageFont.truetype(nome, px)
        except Exception: pass
    return ImageFont.load_default()


def texto(box, s, cor, px, bold=True, fundo=None, borda=None):
    x0, y0, x1, y1 = box
    if fundo: d.rectangle(box, fill=fundo)
    if borda: d.rectangle(box, outline=borda, width=max(2, px // 10))
    linhas = s.split("\n")
    while True:                                     # encolhe ate caber (margem de 8% de cada lado)
        f = fonte(px, bold)
        hs = [d.textbbox((0, 0), l, font=f) for l in linhas]
        alt = sum(b[3] - b[1] for b in hs) + (len(linhas) - 1) * px * 0.25
        larg = max(b[2] - b[0] for b in hs)
        if px <= 8 or (larg <= (x1 - x0) * 0.86 and alt <= (y1 - y0) * 0.84): break
        px -= 1
    y = (y0 + y1) / 2 - alt / 2
    for l, b in zip(linhas, hs):
        w = b[2] - b[0]
        d.text(((x0 + x1) / 2 - w / 2 - b[0], y - b[1]), l, font=f, fill=cor)
        y += (b[3] - b[1]) + px * 0.25


VERDE, AMAR, AZUL, BRANCO, PRETO = (0, 122, 61), (255, 205, 0), (20, 50, 140), (250, 250, 248), (25, 25, 25)
# linha 0 (y 0-128): letreiro EMPRESA BRASIL (1024 x 128)
d.rectangle([0, 0, 1023, 127], fill=VERDE)
d.rectangle([0, 100, 1023, 127], fill=AMAR)
d.ellipse([18, 10, 104, 96], fill=AMAR); d.ellipse([34, 26, 88, 80], fill=AZUL)
d.arc([30, 38, 92, 74], 200, 340, fill=BRANCO, width=4)
texto((110, 4, 1020, 100), "EMPRESA BRASIL", BRANCO, 78)
texto((110, 100, 1020, 127), "INDÚSTRIA DE ALIMENTOS", VERDE, 20)
# linha 1 (y 128-256): placas de setor 256x128 cada
for i, (s, fd, cf) in enumerate([("PREPARO", VERDE, BRANCO), ("ENSAQUE", VERDE, BRANCO),
                                 ("SALA DE\nCONTROLE", AZUL, BRANCO), ("SECADOR", (90, 90, 95), AMAR)]):
    texto((i * 256 + 4, 132, i * 256 + 252, 252), s, cf, 44 if "\n" not in s else 36, fundo=fd, borda=BRANCO)
# linha 2 (y 256-384): MALTE / MIX / PRODUTO ACABADO / CARGA E DESCARGA
for i, (s, fd, cf) in enumerate([("MATÉRIA-PRIMA\nMALTE", (150, 95, 30), BRANCO), ("MATÉRIA-PRIMA\nMIX", (180, 60, 40), BRANCO),
                                 ("PRODUTO\nACABADO", VERDE, AMAR), ("CARGA E\nDESCARGA", AMAR, PRETO)]):
    texto((i * 256 + 4, 260, i * 256 + 252, 380), s, cf, 34, fundo=fd, borda=BRANCO)
# linha 3 (y 384-512): seguranca (128 cada): EPI, extintor, alta temperatura, piso, saida, tanque 1-3
seg = [("USO\nOBRIGATÓRIO\nDE EPI", (0, 90, 170), BRANCO, 18), ("EXTINTOR", (200, 20, 20), BRANCO, 22),
       ("CUIDADO\nALTA\nTEMPERATURA", AMAR, PRETO, 17), ("SAÍDA", VERDE, BRANCO, 30),
       ("TANQUE\n01", (230, 230, 230), AZUL, 30), ("TANQUE\n02", (230, 230, 230), AZUL, 30),
       ("TANQUE\n03", (230, 230, 230), AZUL, 30), ("LAVE AS\nMÃOS", (0, 90, 170), BRANCO, 22)]
for i, (s, fd, cf, px) in enumerate(seg):
    texto((i * 128 + 3, 387, i * 128 + 125, 509), s, cf, px, fundo=fd, borda=PRETO)
# linha 4 (y 512-640): faixa zebrada (0-512) e piso "CARGA/DESCARGA" em amarelo (512-1024)
for k in range(-128, 512, 32):
    d.polygon([(k, 640), (k + 16, 640), (k + 144, 512), (k + 128, 512)], fill=AMAR)
d.rectangle([0, 512, 511, 639], outline=None)
for k in range(-128, 512, 32):
    d.polygon([(k + 16, 640), (k + 32, 640), (k + 160, 512), (k + 144, 512)], fill=PRETO)
texto((512, 512, 1023, 639), "CARGA E DESCARGA", AMAR, 54, fundo=(60, 62, 60))
# linha 5-6 (y 640-896): rotulos dos sacos (256x256 cada): MALTE, MIX, PRODUTO, (trama lisa)
def saco(x0, cor_fundo, cor_txt, titulo, sub, papel=False):
    box = (x0, 640, x0 + 255, 895)
    d.rectangle(box, fill=cor_fundo)
    if not papel:                                              # trama de rafia
        for k in range(box[1], box[3], 4): d.line([box[0], k, box[2], k], fill=tuple(max(0, c - 18) for c in cor_fundo))
        for k in range(box[0], box[2], 4): d.line([k, box[1], k, box[3]], fill=tuple(max(0, c - 10) for c in cor_fundo))
    d.rectangle([x0 + 20, 690, x0 + 235, 845], fill=(250, 250, 245) if papel else None, outline=cor_txt, width=4)
    texto((x0 + 24, 694, x0 + 231, 790), titulo, cor_txt, 46)
    texto((x0 + 24, 790, x0 + 231, 842), sub, cor_txt, 20, bold=False)
saco(0, (236, 226, 196), (130, 80, 20), "MALTE", "25 kg - matéria-prima")
saco(256, (226, 232, 238), (170, 40, 30), "MIX", "25 kg - matéria-prima")
saco(512, (196, 160, 110), VERDE, "EMPRESA\nBRASIL", "produto em pó - 25 kg", papel=True)
d.rectangle([768, 640, 1023, 895], fill=(196, 160, 110))           # kraft liso (costas do saco)
for k in range(640, 896, 3): d.line([768, k, 1023, k], fill=(186, 151, 103))
# linha 7 (y 896-1024): telas do painel (IHM) 256x128 cada: secador, tanques, alarmes, ensaque
def tela(x0, titulo, desenho):
    box = (x0 + 2, 898, x0 + 253, 1021)
    d.rectangle(box, fill=(12, 22, 40)); d.rectangle([x0 + 2, 898, x0 + 253, 914], fill=(30, 70, 140))
    d.text((x0 + 8, 899), titulo, font=fonte(12), fill=BRANCO)
    desenho(x0)
def t_secador(x0):
    d.rectangle([x0 + 100, 925, x0 + 150, 975], outline=(160, 200, 255), width=2)
    d.polygon([(x0 + 100, 975), (x0 + 150, 975), (x0 + 128, 1005), (x0 + 122, 1005)], outline=(160, 200, 255))
    d.line([x0 + 30, 935, x0 + 100, 935], fill=(255, 120, 40), width=3)
    d.text((x0 + 10, 940), "185 C", font=fonte(14), fill=(255, 140, 60))
    d.text((x0 + 160, 940), "SAIDA\n 82 C", font=fonte(13), fill=(120, 255, 140))
    d.line([x0 + 150, 990, x0 + 240, 990], fill=(120, 255, 140), width=3)
def t_tanques(x0):
    for i in range(3):
        bx = x0 + 22 + i * 78
        d.rectangle([bx, 925, bx + 50, 1005], outline=(160, 200, 255), width=2)
        nv = [0.7, 0.45, 0.85][i]
        d.rectangle([bx + 3, 1002 - int(74 * nv), bx + 47, 1002], fill=(60, 140, 230))
        d.text((bx + 8, 1006), "T0%d" % (i + 1), font=fonte(11), fill=BRANCO)
def t_alarmes(x0):
    for i, (s, c) in enumerate([("SECADOR OK", (90, 220, 110)), ("BOMBA ALTA PRESSÃO OK", (90, 220, 110)),
                                ("FILTRO MANGAS: DP ALTO", (255, 190, 40)), ("ENSAQUE PARADO", (255, 80, 70))]):
        d.ellipse([x0 + 10, 924 + i * 23, x0 + 22, 936 + i * 23], fill=c)
        d.text((x0 + 30, 922 + i * 23), s, font=fonte(13, False), fill=BRANCO)
def t_ensaque(x0):
    d.text((x0 + 12, 925), "SACOS/H  148", font=fonte(18), fill=(120, 255, 140))
    d.text((x0 + 12, 952), "PESO  25,02 kg", font=fonte(18), fill=BRANCO)
    for i in range(20):
        h = 10 + int(30 * (0.5 + 0.5 * math.sin(i * 0.7)))
        d.rectangle([x0 + 14 + i * 11, 1012 - h, x0 + 22 + i * 11, 1012], fill=(60, 140, 230))
tela(0, "SECADOR SPRAY", t_secador); tela(256, "TANQUES DE PREPARO", t_tanques)
tela(512, "ALARMES", t_alarmes); tela(768, "ENSAQUE", t_ensaque)
A.convert("RGB").save(os.path.join(OUT, "eb_atlas.png"), optimize=True)
# ---------------------------------------------------------------- paleta TEXTURIZADA (atlas 1024 = 8 x 8 celulas de 128 px)
# Cada cor dos equipamentos e uma celula com a textura da Poliigon do tipo de superficie (metal pintado, plastico, plastico
# jateado, tecido, papel, galvanizado) tingida pela cor; eb_paleta_n.png tem as normais na mesma posicao. O 81 projeta cada
# face dentro da sua celula (CEL_M metros por celula). LEDs e luzes ficam lisos. 1 material (+1 emissivo) para tudo.
CEL, CEL_M = 128, 0.5
PALETA = {"amarelo": ("metal", (0.90, 0.55, 0.01)), "cinza": ("metal", (0.16, 0.18, 0.20)), "azul": ("metal", (0.02, 0.07, 0.30)),
          "verde": ("metal", (0.01, 0.20, 0.06)), "vermelho": ("metal", (0.55, 0.02, 0.02)), "preto": ("plastico", (0.015, 0.015, 0.016)),
          "borracha": ("jato", (0.02, 0.02, 0.02)), "tinta_amarela": ("metal", (0.85, 0.55, 0.0)), "tinta_verde": ("metal", (0.0, 0.19, 0.045)),
          "kraft": ("papel", (0.40, 0.27, 0.14)), "luz": ("liso", (1.0, 0.96, 0.88)), "led_verde": ("liso", (0.1, 1.0, 0.2)),
          "led_vermelho": ("liso", (1.0, 0.05, 0.03)), "led_amarelo": ("liso", (1.0, 0.7, 0.05)), "visor": ("liso", (1.0, 0.55, 0.2)),
          "branco": ("plastico", (0.85, 0.85, 0.84)), "laranja": ("metal", (0.85, 0.20, 0.0)), "azul_rack": ("metal", (0.02, 0.10, 0.42)),
          "cinza_claro": ("metal", (0.52, 0.54, 0.55)), "cinza_medio": ("metal", (0.28, 0.29, 0.30)), "grafite": ("plastico", (0.05, 0.055, 0.06)),
          "bege": ("tecido", (0.55, 0.47, 0.34)), "verde_claro": ("metal", (0.05, 0.40, 0.08)), "vermelho_vivo": ("metal", (0.80, 0.03, 0.02)),
          "azul_claro": ("metal", (0.10, 0.30, 0.65)), "cobre": ("galv", (0.55, 0.22, 0.08)), "nylon": ("jato", (0.70, 0.66, 0.55)),
          "poliuretano": ("jato", (0.75, 0.45, 0.05)), "led_azul": ("liso", (0.1, 0.4, 1.0)), "led_branco": ("liso", (0.95, 0.95, 1.0)),
          "tela_off": ("liso", (0.01, 0.012, 0.015)), "creme": ("plastico", (0.75, 0.70, 0.58)), "aluminio": ("galv", (0.62, 0.63, 0.64)),
          "latao": ("galv", (0.60, 0.42, 0.10)), "verde_motor": ("metal", (0.03, 0.18, 0.12)), "azul_motor": ("metal", (0.03, 0.10, 0.28)),
          "tecido": ("tecido", (0.035, 0.037, 0.042)), "tampo": ("plastico", (0.42, 0.43, 0.44)), "gabinete": ("metal", (0.20, 0.21, 0.22)),
          "papel": ("papel", (0.85, 0.85, 0.82)), "mdf": ("papel", (0.33, 0.22, 0.12)), "plastico_preto": ("jato", (0.02, 0.021, 0.023))}
FONTE = {"metal": "metal_pintado", "plastico": "plastico", "jato": "plastico_jato", "tecido": "tecido", "papel": "tecido_cru",
         "galv": "galvanizado"}
CONTRASTE = {"metal": 0.55, "plastico": 0.6, "jato": 0.7, "tecido": 0.9, "papel": 0.5, "galv": 0.8}
srgb = lambda c: int(round(255 * (12.92 * c if c <= 0.0031308 else 1.055 * max(c, 0) ** (1 / 2.4) - 0.055)))
lin = lambda v: (v / 255.0) / 12.92 if v <= 10 else ((v / 255.0 + 0.055) / 1.055) ** 2.4
LUT_LIN = [lin(v) for v in range(256)]
_det = {}


def detalhe(tipo):
    """Luminancia linear da textura, normalizada para media 1 e com o contraste do tipo (lista CEL x CEL)."""
    if tipo in _det: return _det[tipo]
    im = Image.open(os.path.join(OUT, "eb_%s_cor.jpg" % FONTE[tipo])).convert("L").resize((CEL, CEL), Image.LANCZOS)
    v = [LUT_LIN[x] for x in im.getdata()]
    m = sum(v) / len(v)
    k = CONTRASTE[tipo]
    _det[tipo] = [max(0.45, min(1.6, 1.0 + k * (x / m - 1.0))) for x in v]
    return _det[tipo]


def normal_cel(tipo):
    f = os.path.join(OUT, "eb_%s_normal.jpg" % FONTE[tipo])
    return Image.open(f).convert("RGB").resize((CEL, CEL), Image.LANCZOS)


pal = Image.new("RGB", (8 * CEL, 8 * CEL), (128, 128, 128))
paln = Image.new("RGB", (8 * CEL, 8 * CEL), (128, 128, 255))
cat["paleta"] = {}
for i, (nome, (tipo, cor)) in enumerate(PALETA.items()):
    cx, cy = i % 8, i // 8
    x0, y0 = cx * CEL, cy * CEL
    if tipo == "liso":
        Image.Image.paste(pal, tuple(srgb(c) for c in cor), (x0, y0, x0 + CEL, y0 + CEL))
    else:
        dd = detalhe(tipo)
        cel = Image.new("RGB", (CEL, CEL))
        cel.putdata([tuple(srgb(c * f) for c in cor) for f in dd])
        pal.paste(cel, (x0, y0))
        paln.paste(normal_cel(tipo), (x0, y0))
    # retangulo UV util (com 6 px de margem: o mipmap nao puxa a celula vizinha de perto)
    g_ = 6
    cat["paleta"][nome] = [(x0 + g_) / (8.0 * CEL), 1.0 - (y0 + CEL - g_) / (8.0 * CEL), (x0 + CEL - g_) / (8.0 * CEL), 1.0 - (y0 + g_) / (8.0 * CEL)]
cat["paleta_celula_m"] = CEL_M
pal.save(os.path.join(OUT, "eb_paleta.png"), optimize=True)
paln.save(os.path.join(OUT, "eb_paleta_n.png"), optimize=True)

# ---------------------------------------------------------------- epoxi branco (piso do preparo, sala de controle e ensaque) e isopainel
base = Image.open(os.path.join(OUT, "eb_piso_concreto_cor.jpg")).convert("L")
ep = base.point(lambda v: int(214 + (v - 120) * 0.22)).convert("RGB")
ep = Image.merge("RGB", [c.point(lambda v, o=o: max(0, min(255, v + o))) for c, o in zip(ep.split(), (0, 1, 3))])
ep.save(os.path.join(OUT, "eb_epoxi_cor.jpg"), quality=90)
cat["epoxi"] = {"media_linear": media_linear(ep)}
mp = Image.open(os.path.join(OUT, "eb_metal_pintado_cor.jpg")).convert("L")
vals = list(mp.getdata()); mmed = sum(vals) / len(vals)
iso = mp.point(lambda v: int(max(0, min(255, 205 + (v - mmed) * 1.6)))).convert("RGB")
iso = Image.merge("RGB", [c.point(lambda v, o=o: max(0, min(255, v + o))) for c, o in zip(iso.split(), (-2, 0, 2))])
iso.save(os.path.join(OUT, "eb_isopainel_cor.jpg"), quality=90)
cat["isopainel"] = {"media_linear": media_linear(iso)}
with open(os.path.join(OUT, "_catalogo.json"), "w", encoding="utf-8") as f:
    json.dump(cat, f, ensure_ascii=False, indent=1)
tot = sum(os.path.getsize(os.path.join(r, x)) for r, _, fs in os.walk(OUT) for x in fs)
print("ok:", OUT, "%.2f MB" % (tot / 1e6))
