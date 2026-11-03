# Texturas PBR do polimento (arvores, churrasqueira, props do bar). Roda FORA do Blender, com o Python do sistema:
#   python -I scripts\33_texturas_pbr.py [pasta_downloads]
# Fontes (todas CC0, gratuitas):
#   Poly Haven  https://polyhaven.com   cascas, tijolo, madeiras, la (base do feltro)
#   ambientCG   https://ambientcg.com   folhas soltas (LeafSet) usadas para montar o atlas de folhagem
# (Poliigon exige login para baixar; por isso as equivalentes CC0 acima.)
# Gera em texturas\: pbr_*.jpg (1024 px, cor + normal OpenGL) e pbr_folhagem.png (atlas 2x2 com alpha):
#   [0,0] copa verde (LeafSet024)   [1,0] copa oiti (LeafSet022)
#   [0,1] ipe amarelo (flores)      [1,1] eucalipto (LeafSet013)
# Granito preto, inox escovado e carvao sao procedurais (numpy), sem download.
import io, json, math, os, random, sys, urllib.request, zipfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, "texturas")
DL = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get("TEMP", "."), "barboteco_cc0")
os.makedirs(DL, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 BarBoteco-pipeline"}
Q = 86                                                      # qualidade jpg (peso x nitidez)


def baixar(url, dest):
    if not os.path.exists(dest):
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
            f.write(r.read())
    return dest


def polyhaven(pid, mapas=("Diffuse", "nor_gl"), res="1k"):
    d = os.path.join(DL, "ph_" + pid)
    os.makedirs(d, exist_ok=True)
    req = urllib.request.Request("https://api.polyhaven.com/files/" + pid, headers=UA)
    files = json.load(urllib.request.urlopen(req, timeout=60))
    out = {}
    for m in mapas:
        url = files[m][res]["jpg"]["url"]
        out[m] = baixar(url, os.path.join(d, os.path.basename(url)))
    return out


def ambientcg(aid, res="1K"):
    d = os.path.join(DL, "acg_" + aid)
    os.makedirs(d, exist_ok=True)
    z = baixar("https://ambientcg.com/get?file=%s_%s-JPG.zip" % (aid, res), os.path.join(d, aid + ".zip"))
    out = {}
    with zipfile.ZipFile(z) as zf:
        for n in zf.namelist():
            for k in ("Color", "Opacity", "NormalGL"):
                if n.endswith("_%s.jpg" % k):
                    out[k] = Image.open(io.BytesIO(zf.read(n))).copy()
    return out


def salvar(img, nome, tam=1024):
    img = img.convert("RGB")
    if img.size != (tam, tam):
        img = img.resize((tam, tam), Image.LANCZOS)
    p = os.path.join(TEX, nome)
    img.save(p, quality=Q, optimize=True, progressive=True)
    print("  %-32s %5d KB" % (nome, os.path.getsize(p) // 1024))


def ph_par(pid, nome, tam=1024, ajuste=None, normal=True):
    f = polyhaven(pid)
    cor = Image.open(f["Diffuse"])
    if ajuste:
        cor = ajuste(cor)
    salvar(cor, "pbr_%s.jpg" % nome, tam)
    if normal:                                              # normal quase plano so traz ruido de jpg: nao exporta
        salvar(Image.open(f["nor_gl"]), "pbr_%s_n.jpg" % nome, tam)


# ------------------------------------------------------------------ Poly Haven
print("Poly Haven:")
ph_par("bark_brown_02", "casca")
ph_par("eucalyptus_bark", "casca_eucalipto")
def tijolo_claro(img):                                     # red_brick_03 e escuro: aproxima do tijolo aparente do bar
    img = ImageEnhance.Brightness(img).enhance(1.35)
    return ImageEnhance.Color(img).enhance(1.15)


ph_par("red_brick_03", "tijolo", ajuste=tijolo_claro)
ph_par("wood_table_001", "madeira_verniz", normal=False)
ph_par("fine_grained_wood", "madeira_escura", normal=False)
ph_par("brown_planks_09", "madeira_rustica")
# (couro: cor lisa no material Pol_Couro; a textura brown_leather chuviscava no brilho)


def verde_feltro(img):                                      # la laranja -> feltro de sinuca
    g = np.asarray(img.convert("L"), dtype=np.float32) / 255.0
    g = 0.75 + (g - g.mean()) * 0.9
    base = np.array([0.05, 0.36, 0.17])
    return Image.fromarray(np.clip(g[..., None] * base * 255, 0, 255).astype(np.uint8))


ph_par("caban", "feltro", tam=512, ajuste=verde_feltro, normal=False)

# ------------------------------------------------------------------ procedurais
rng = np.random.default_rng(7)


def ruido(n, escalas):
    acc = np.zeros((n, n), np.float32)
    for s, w in escalas:
        small = rng.random((max(2, n // s), max(2, n // s))).astype(np.float32)
        acc += w * np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((n, n), Image.BICUBIC), np.float32) / 255
    return acc / sum(w for _, w in escalas)


N = 1024
# granito preto (Sao Gabriel): fundo quase preto, graos cinza/brancos e brilhos de mica
g = 0.055 + 0.03 * ruido(N, ((64, 1), (16, 0.6), (4, 0.4)))
graos = rng.random((N, N))
g = np.where(graos > 0.985, 0.35 + 0.35 * rng.random((N, N)), g)
g = np.where(graos > 0.9975, 0.85, g)
img = Image.fromarray(np.clip(g * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
img = Image.merge("RGB", [img, img, img.point(lambda v: min(255, int(v * 1.06)))])
salvar(img, "pbr_granito.jpg")

# inox escovado: riscos horizontais
lin = rng.random((N, 1)).astype(np.float32)
risc = np.asarray(Image.fromarray((lin * 255).astype(np.uint8)).resize((N, N), Image.BILINEAR), np.float32) / 255
fino = np.asarray(Image.fromarray((rng.random((N, N // 16)) * 255).astype(np.uint8)).resize((N, N), Image.BILINEAR), np.float32) / 255
v = 0.70 + 0.10 * risc + 0.06 * fino + 0.04 * ruido(N, ((128, 1),))
salvar(Image.fromarray(np.clip(v * 255, 0, 255).astype(np.uint8)), "pbr_inox.jpg", 512)

# carvao em brasa (fundo da churrasqueira): pedacos (celulas de Voronoi) escuros com frestas alaranjadas
M_ = 512
pts = rng.random((260, 2)) * M_
yy, xx = np.mgrid[0:M_, 0:M_].astype(np.float32)
d1 = np.full((M_, M_), 1e9, np.float32)
d2 = np.full((M_, M_), 1e9, np.float32)
for px, py in pts:
    for ox in (-M_, 0, M_):                                 # repete nas bordas (textura sem emenda)
        for oy in (-M_, 0, M_):
            d = np.hypot(xx - px - ox, yy - py - oy)
            d2 = np.where(d < d1, d1, np.minimum(d2, d))
            d1 = np.minimum(d1, d)
fresta = np.clip(1.0 - (d2 - d1) / 3.0, 0, 1)
c = ruido(M_, ((32, 1), (8, 0.7), (2, 0.3)))
brasa = fresta * np.clip((c - 0.35) * 2.5, 0, 1)
sombra = 0.55 + 0.45 * np.clip(d1 / 14.0, 0, 1)             # pedacos levemente abaulados
rgb = np.stack([0.05 + 1.0 * brasa, 0.045 + 0.35 * brasa, 0.04 + 0.05 * brasa], -1) * (0.75 + 0.5 * c[..., None])
rgb = rgb * np.where(brasa[..., None] > 0.05, 1.0, sombra[..., None])
salvar(Image.fromarray(np.clip(rgb * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)), "pbr_carvao.jpg", 512)


# ------------------------------------------------------------------ atlas de folhagem (ambientCG LeafSet)
def folhas_soltas(aid):
    """Recorta cada folha do LeafSet (componentes da mascara de opacidade) -> lista de RGBA."""
    s = ambientcg(aid)
    cor, op = s["Color"].convert("RGB"), s["Opacity"].convert("L")
    a = np.asarray(op) > 128
    lab = np.zeros(a.shape, np.int32)
    n = 0
    H, W = a.shape
    for y0 in range(0, H, 3):                                 # flood fill simples (folhas sao poucas e grandes)
        for x0 in range(0, W, 3):
            if a[y0, x0] and not lab[y0, x0]:
                n += 1
                pilha = [(y0, x0)]
                lab[y0, x0] = n
                while pilha:
                    y, x = pilha.pop()
                    for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                        if 0 <= yy < H and 0 <= xx < W and a[yy, xx] and not lab[yy, xx]:
                            lab[yy, xx] = n
                            pilha.append((yy, xx))
    out = []
    rgba = cor.copy()
    rgba.putalpha(op)
    for k in range(1, n + 1):
        ys, xs = np.nonzero(lab == k)
        if len(ys) < 400:
            continue
        out.append(rgba.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)))
    print("  %s: %d folhas" % (aid, len(out)))
    return out


def galhos(dr, cx, cy, r, rnd, cor=(78, 58, 40, 255), n=5):
    pts = []
    for _ in range(n):
        a = rnd.uniform(-2.4, -0.7)                           # galhos saindo de baixo para cima/para os lados
        L = r * rnd.uniform(0.55, 0.95)
        x1, y1 = cx + math.cos(a) * L, cy + 0.85 * r + math.sin(a) * L
        dr.line([(cx, cy + 0.95 * r), (x1, y1)], fill=cor, width=max(2, int(r * 0.025)))
        for t in np.linspace(0.25, 1.0, 6):
            pts.append((cx + (x1 - cx) * t, cy + 0.95 * r + (y1 - cy - 0.95 * r) * t))
    return pts


def cacho(folhas, tam, rnd, n, esc, tint=(1, 1, 1), flores=False):
    """Um cacho de folhas (galhinhos + folhas sobrepostas) num quadrado tam x tam com alpha."""
    im = Image.new("RGBA", (tam, tam), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    cx = cy = tam / 2
    r = tam * 0.46
    pts = galhos(dr, cx, cy, r, rnd)
    ordem = []
    for _ in range(n):
        ang = rnd.uniform(0, 2 * math.pi)
        rr = r * (rnd.random() ** 0.5) * 0.86
        x, y = cx + math.cos(ang) * rr, cy + math.sin(ang) * rr * 0.92
        if pts and rnd.random() < 0.5:
            x, y = rnd.choice(pts)
        ordem.append((y, x))
    ordem.sort()                                             # de cima para baixo: as de baixo ficam na frente
    for (y, x) in ordem:
        d = math.hypot(x - cx, y - cy) / r
        if flores:
            fl = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
            fd = ImageDraw.Draw(fl)
            base = (rnd.randint(235, 255), rnd.randint(185, 215), rnd.randint(10, 40))
            for k in range(5):
                a = k * 2 * math.pi / 5 + rnd.uniform(-0.2, 0.2)
                px, py = 32 + math.cos(a) * 13, 32 + math.sin(a) * 13
                fd.ellipse([px - 12, py - 10, px + 12, py + 10], fill=base + (255,))
            fd.ellipse([24, 24, 40, 40], fill=(196, 120, 20, 255))
            fl = fl.filter(ImageFilter.GaussianBlur(0.6))
            s = esc * rnd.uniform(0.7, 1.15)
            f = fl.resize((max(4, int(64 * s)), max(4, int(64 * s))), Image.LANCZOS).rotate(rnd.uniform(0, 360), expand=True)
        else:
            f = rnd.choice(folhas)
            s = esc * rnd.uniform(0.65, 1.1) / max(f.size)
            f = f.resize((max(4, int(f.size[0] * s * 160)), max(4, int(f.size[1] * s * 160))), Image.LANCZOS)
            ang = math.degrees(math.atan2(y - (cy + 0.9 * r), x - cx)) - 90 + rnd.uniform(-40, 40)
            f = f.rotate(-ang, expand=True, resample=Image.BICUBIC)
        luz = (1.05 - 0.35 * d) * rnd.uniform(0.82, 1.08)    # centro mais claro, bordas e fundo mais escuros
        if flores:
            luz = 0.88 + 0.22 * rnd.random()
        rgb = np.asarray(f, np.float32)
        rgb[..., :3] *= np.array(tint, np.float32) * luz
        f = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
        im.alpha_composite(f, (int(x - f.size[0] / 2), int(y - f.size[1] / 2)))
    return im


rnd = random.Random(11)
print("ambientCG:")
f24 = folhas_soltas("LeafSet024")
f22 = folhas_soltas("LeafSet022")
f13 = folhas_soltas("LeafSet013")
C = 512
atlas = Image.new("RGBA", (2 * C, 2 * C), (0, 0, 0, 0))
atlas.alpha_composite(cacho(f24, C, rnd, 420, 0.34, tint=(0.80, 0.92, 0.70)), (0, 0))
atlas.alpha_composite(cacho(f22, C, rnd, 340, 0.42, tint=(0.75, 0.88, 0.68)), (C, 0))
atlas.alpha_composite(cacho(f24, C, rnd, 1100, 0.46, flores=True), (0, C))
atlas.alpha_composite(cacho(f13, C, rnd, 260, 0.52, tint=(0.62, 0.80, 0.82)), (C, C))
# borda de cor: os pixels transparentes recebem a cor media das folhas vizinhas (o mipmap nao escurece o contorno)
arr = np.asarray(atlas, np.float32) / 255
al = arr[..., 3:4]
pre = Image.fromarray((arr[..., :3] * al * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10))
den = Image.fromarray((al[..., 0] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10))
fundo = np.asarray(pre, np.float32) / np.maximum(np.asarray(den, np.float32)[..., None], 1.0) * 255
rgb = np.where(al > 0.03, arr[..., :3] * 255, np.clip(fundo, 0, 255))
final = Image.fromarray(np.dstack([rgb, arr[..., 3] * 255]).astype(np.uint8), "RGBA")
# impostor LOD2 do ipe (octaedro opaco de longe): o cacho amarelo sobre fundo amarelo, sem alpha
lod = Image.new("RGBA", (C, C), (196, 150, 24, 255))
lod.alpha_composite(atlas.crop((0, C, C, 2 * C)))
salvar(lod, "pbr_copa_ipe_lod.jpg", 256)
p = os.path.join(TEX, "pbr_folhagem.png")
final = final.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)   # PNG com paleta: 1,2 MB -> ~0,2 MB
final.save(p, optimize=True)
print("  %-32s %5d KB" % ("pbr_folhagem.png", os.path.getsize(p) // 1024))
print("ok")
