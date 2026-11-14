# 97a_atlas_ribeiro.py - Python do SISTEMA (python -I): atlas PBR 512x512 dos props da RIBEIRO (cor + normal + metal/rugosidade).
# Fontes: Downloads\poliigon (galvanizado, tinta fosca, plastico jateado), reduzidas para 512. Um atlas so; os 6 GLBs usam o mesmo layout.
# Saida: Desktop\BAR\2.0\map\texturas_512\ribeiro\ribeiro_atlas_cor.jpg / _n.jpg / _mr.jpg (G = rugosidade, B = metalico) + ribeiro_atlas.json
# Normais em OpenGL (como a Poliigon entrega e o glTF espera). Idempotente.
import os, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

SRC = r"C:\Users\rafael\Downloads\poliigon"
OUT = r"C:\Users\rafael\Desktop\BAR\2.0\map\texturas_512\ribeiro"
FONTE = r"C:\Windows\Fonts\arialbd.ttf"
os.makedirs(OUT, exist_ok=True)
N = 512

# retangulos (x, y, w, h) em pixels, origem no canto SUPERIOR esquerdo da imagem
TILES = {
    "aco":       (0, 0, 256, 256),      # aco escovado cinza (galvanizado Poliigon)
    "aco_escuro": (256, 0, 256, 256),   # aco escuro / gabaritos (tinta fosca Poliigon escurecida)
    "aluminio":  (0, 256, 160, 160),    # aluminio fosco
    "polimero":  (160, 256, 160, 160),  # polimero grafite (plastico jateado Poliigon)
    "verde":     (320, 256, 64, 64),    # seguranca #34d399
    "espuma":    (384, 256, 64, 64),    # berco / espuma tecnica
    "preto":     (448, 256, 64, 64),    # borracha / furos
    "badge_op":  (320, 320, 96, 96),    # selo OP
    "etq_ribeiro": (0, 416, 256, 32),
    "etq_peca":    (0, 448, 256, 32),
    "etq_semmun":  (0, 480, 256, 32),
}


def achar(pasta, chaves):
    for raiz, _, fs in os.walk(os.path.join(SRC, pasta)):
        for f in sorted(fs):
            fl = f.lower()
            if any(c in fl for c in chaves) and fl.endswith((".jpg", ".png")) and "preview" not in fl and "nrm16" not in fl:
                return os.path.join(raiz, f)
    raise FileNotFoundError(f"{pasta}: {chaves}")


def ler(p, modo, tam):
    return np.asarray(Image.open(p).convert(modo).resize(tam, Image.LANCZOS), np.float32) / 255.0


def fonte(pasta):
    cor = achar(pasta, ["basecolor", "_col_"])
    nrm = achar(pasta, ["_normal", "_nrm_"])
    rug = achar(pasta, ["roughness"])
    return cor, nrm, rug


def lum(c):
    return (c * np.array([0.2126, 0.7152, 0.0722], np.float32)).sum(-1, keepdims=True)


cor_img = np.zeros((N, N, 3), np.float32)
nrm_img = np.zeros((N, N, 3), np.float32); nrm_img[..., :] = (0.5, 0.5, 1.0)
mr_img = np.zeros((N, N, 3), np.float32); mr_img[..., 0] = 1.0


def colar(nome, cor, nrm, rug, met):
    x, y, w, h = TILES[nome]
    cor_img[y:y + h, x:x + w] = cor
    if nrm is not None:
        nrm_img[y:y + h, x:x + w] = nrm
    mr_img[y:y + h, x:x + w, 1] = rug
    mr_img[y:y + h, x:x + w, 2] = met


def tile(pasta, tam, chaves_extra=None):
    c, n, r = fonte(pasta)
    return ler(c, "RGB", tam), ler(n, "RGB", tam), ler(r, "L", tam)[..., 0]


def tingir(base, alvo, contraste=1.0):
    """Mantem a variacao da foto (luminancia relativa a media) e leva a cor media para 'alvo' (sRGB 0-1)."""
    l = lum(base)
    rel = 1.0 + (l - l.mean()) / max(l.mean(), 1e-3) * contraste
    return np.clip(np.array(alvo, np.float32) * rel, 0, 1)


# aco escovado cinza: galvanizado desbotado
c, n, r = tile("MetalGalvanizedSteelWorn001", (256, 256))
colar("aco", tingir(c, (0.80, 0.82, 0.83), 0.9), n, np.clip(r * 0.85 + 0.12, 0, 1), 0.6)
# aco escuro: tinta fosca escurecida
c, n, r = tile("Poliigon_MetalPaintedMatte_7037", (256, 256))
colar("aco_escuro", tingir(c, (0.48, 0.51, 0.51), 1.0), n, np.clip(r * 0.7 + 0.2, 0, 1), 0.3)
# aluminio fosco: galvanizado claro e menos contrastado
c, n, r = tile("MetalGalvanizedSteelWorn001", (160, 160))
colar("aluminio", tingir(c, (0.90, 0.91, 0.92), 0.5), n * 0.5 + 0.25, np.clip(r * 0.5 + 0.35, 0, 1), 0.6)
# polimero grafite
c, n, r = tile("Poliigon_PlasticMoldDryBlast_7495", (160, 160))
colar("polimero", tingir(c, (0.28, 0.30, 0.29), 1.2), n, np.clip(r * 0.6 + 0.35, 0, 1), 0.0)
# verde de seguranca (#34d399), espuma e borracha
verde = np.array([0x34, 0xD3, 0x99], np.float32) / 255.0
c, n, r = tile("Poliigon_MetalPaintedMatte_7037", (64, 64))
colar("verde", tingir(c, verde, 0.25), None, 0.45, 0.0)
colar("espuma", tingir(c, (0.38, 0.40, 0.39), 0.5), None, 0.9, 0.0)
colar("preto", tingir(c, (0.03, 0.033, 0.033), 0.3), None, 0.85, 0.0)

# selo OP e etiquetas (texto em Latin-1: Ç/Ã ok)
def texto(nome, txt, fundo, frente, tam_fonte, borda=None):
    x, y, w, h = TILES[nome]
    im = Image.new("RGB", (w, h), tuple(int(v * 255) for v in fundo))
    d = ImageDraw.Draw(im)
    if borda is not None:
        d.rectangle([0, 0, w - 1, h - 1], outline=tuple(int(v * 255) for v in borda), width=max(2, h // 16))
    f = ImageFont.truetype(FONTE, tam_fonte)
    bb = d.textbbox((0, 0), txt, font=f)
    d.text(((w - (bb[2] - bb[0])) / 2 - bb[0], (h - (bb[3] - bb[1])) / 2 - bb[1]), txt, font=f, fill=tuple(int(v * 255) for v in frente))
    cor_img[y:y + h, x:x + w] = np.asarray(im, np.float32) / 255.0
    mr_img[y:y + h, x:x + w, 1] = 0.55
    mr_img[y:y + h, x:x + w, 2] = 0.0


texto("badge_op", "OP", (0.04, 0.05, 0.05), verde, 60, borda=verde)
texto("etq_ribeiro", "RIBEIRO", (0.05, 0.06, 0.06), (0.92, 0.94, 0.93), 24, borda=verde)
texto("etq_peca", "PEÇA EM PROCESSO", (0.05, 0.06, 0.06), verde, 20, borda=verde)
texto("etq_semmun", "SEM MUNIÇÃO", verde, (0.03, 0.05, 0.04), 22)

def salvar(arr, nome, q):
    Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB").save(os.path.join(OUT, nome), quality=q, subsampling=0)

salvar(cor_img, "ribeiro_atlas_cor.jpg", 92)
salvar(nrm_img, "ribeiro_atlas_n.jpg", 94)
salvar(mr_img, "ribeiro_atlas_mr.jpg", 94)
with open(os.path.join(OUT, "ribeiro_atlas.json"), "w", encoding="utf-8") as fh:
    json.dump({"size": N, "tiles": TILES}, fh, indent=1)
print("atlas ok ->", OUT)
