# Atlas da geladeira expositora Highland (usado pelo 42_geladeira_expositor.py). Roda FORA do Blender:
#   python -I scripts\41_geladeira_textura.py
# Fontes (do usuario): Desktop\BAR\2.0\logo\logo.png e Desktop\BAR\2.0\Geladeira de Cerveja\textures\
#   (arte synthwave da geladeira path_fridge e rotulos das latas).
# Gera texturas\geladeira_highland.jpg, 2048 x 1024 px (origem no canto superior esquerdo):
#   lateral   x    0- 340, y   0-1024   fundo synthwave + logo (as duas laterais)
#   testeira  x  350-1374, y   0- 340   letreiro do topo: logo + "CERVEJA GELADA"
#   grade     x  350-1374, y 350- 582   grade neon do rodape (palmeira)
#   rotulos   x  350-2048, y 600-1024   9 latas em 5 x 2 celulas de 339 x 212
#   fundo     x 1390-2048, y   0- 582   parede interna iluminada (degrade azul/magenta)
import os
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = r"C:\Users\rafael\Desktop\BAR\2.0"
GEL = os.path.join(SRC, "Geladeira de Cerveja", "textures")
OUT = os.path.join(ROOT, "texturas", "geladeira_highland.jpg")
ROTULOS = ("budwiser.jpeg", "modelo.jpeg", "labbat.jpeg", "labatt50.jpeg", "cokecan.jpeg",
           "Pepsi.png", "sprite.jpeg", "Dr-Pepper.jpeg", "gingerale.jpeg")
REG = {"lateral": (0, 0, 340, 1024), "testeira": (350, 0, 1374, 340), "grade": (350, 350, 1374, 582),
       "fundo": (1390, 0, 2048, 582)}
CEL = (339, 212)

arte = Image.open(os.path.join(GEL, "path_fridge_openPBR_shader1_BaseColor.1001.png")).convert("RGB")
logo = Image.open(os.path.join(SRC, "logo", "logo.png")).convert("RGBA")
atlas = Image.new("RGB", (2048, 1024), (6, 6, 10))


def caixa(nome):
    x0, y0, x1, y1 = REG[nome]
    return x1 - x0, y1 - y0, (x0, y0)


def logo_em(fundo, larg, cy):
    lg = logo.resize((larg, larg), Image.LANCZOS)
    fundo.paste(lg, ((fundo.size[0] - larg) // 2, int(cy - larg / 2)), lg)


# lateral: painel synthwave (sol, palmeiras, reflexo) + logo com o casal
w, h, pos = caixa("lateral")
bg = arte.crop((742, 376, 910, 1026)).resize((w, h), Image.LANCZOS)
logo_em(bg, int(w * 0.98), h * 0.40)
atlas.paste(bg, pos)

# testeira: faixa do por do sol escurecida, logo no centro e "CERVEJA" / "GELADA" nas laterais
w, h, pos = caixa("testeira")
bg = arte.crop((0, 432, 290, 529)).resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(3))
bg = ImageEnhance.Brightness(bg).enhance(0.55)
logo_em(bg, int(h * 0.98), h / 2)
dr = ImageDraw.Draw(bg)
fonte = ImageFont.truetype(r"C:\Windows\Fonts\impact.ttf", 88)
for txt, cx in (("CERVEJA", w * 0.17), ("GELADA", w * 0.83)):
    cam = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    dc = ImageDraw.Draw(cam)
    dc.text((cx, h / 2), txt, font=fonte, anchor="mm", fill=(40, 220, 255, 255))
    bg.paste(cam.filter(ImageFilter.GaussianBlur(9)), (0, 0), cam.filter(ImageFilter.GaussianBlur(9)))   # brilho neon
    dr.text((cx, h / 2), txt, font=fonte, anchor="mm", fill=(235, 252, 255), stroke_width=3, stroke_fill=(255, 40, 190))
atlas.paste(bg, pos)

# grade do rodape: neon com a palmeira
w, h, pos = caixa("grade")
atlas.paste(arte.crop((292, 795, 765, 935)).resize((w, h), Image.LANCZOS), pos)

# parede interna iluminada: degrade claro com leve azul/magenta
w, h, pos = caixa("fundo")
fd = Image.new("RGB", (w, h))
for y in range(h):
    t = y / (h - 1)
    c = (int(200 + 40 * t), int(225 - 25 * t), 255)
    ImageDraw.Draw(fd).line([(0, y), (w, y)], fill=c)
atlas.paste(fd, pos)

# rotulos das latas (cada um ocupa a volta inteira da lata)
for i, n in enumerate(ROTULOS):
    r = Image.open(os.path.join(GEL, n)).convert("RGB").resize(CEL, Image.LANCZOS)
    atlas.paste(r, (350 + (i % 5) * CEL[0], 600 + (i // 5) * CEL[1]))

atlas.save(OUT, quality=88, optimize=True, progressive=True)
print(OUT, os.path.getsize(OUT) // 1024, "KB")
