# Texturas do bar a partir das gratuitas da Poliigon (https://www.poliigon.com/textures/free).
# Roda FORA do Blender, com o Python do sistema:
#   python -I scripts\37_texturas_poliigon.py [pasta_dos_downloads]
# A Poliigon exige login (conta gratuita). Duas formas de baixar a lista POLIIGON abaixo:
#   - addon da Poliigon no Blender (logado): os assets vao para ~\Poliigon\Library (lido por padrao);
#   - site: zips numa pasta (padrao: Downloads\poliigon). Zip ou pasta extraida, tanto faz.
# O script acha cada asset pelo numero (ex.: 7760) no caminho, pelo nome do asset na Poliigon (NOMES) ou pelo nome
# do slot (ex.: uma pasta chamada pol_azulejo). Com pasta na linha de comando, le so ela.
# Gera em texturas\: pol_*.jpg (1024 px) e pol_*_n.jpg (normal OpenGL) + texturas\pol_status.json.
# Slot sem download ainda: copia a textura antiga equivalente (o bar continua renderizando) e marca "provisoria".
# 38_materiais_poliigon.py liga essas imagens aos materiais e acerta a escala das UVs (tamanho fisico abaixo).
import io, json, math, os, re, shutil, sys, zipfile
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, "texturas")
HOME = os.path.expanduser("~")
DLS = sys.argv[1:] or [os.path.join(HOME, "Poliigon", "Library"), os.path.join(HOME, "Downloads", "poliigon")]
Q = 86
N = 1024

# asset Poliigon: (id, slug da pagina, tamanho fisico em metros)
POLIIGON = {
    7787: ("reclaimed-running-bond-brick-wall-texture-orange", 2.5),
    7664: ("plain-painted-plaster-texture-white", 0.3),
    7656: ("mottled-matte-panel-concrete-ground-texture", 2.5),
    8690: ("smooth-troweled-microcement-texture-cool-grey", 2.5),
    7760: ("slip-match-oak-wood-veneer-texture", 2.5),
    4186: ("ash-wood-board-texture-light-beige", 2.5),
    5204: ("square-ceramic-glossy-tile-texture-ivory", 1.45),
    5377: ("square-terracotta-matte-tile-texture-beige", 2.5),
    7380: ("large-chips-galaxy-terrazzo-texture-black", 2.0),
    7174: ("matte-brushed-metal-texture", 2.5),
    7037: ("matte-metal-texture-black", 2.5),
    3129: ("lightly-worn-galvanised-metal-texture", 0.75),
    7642: ("uniform-rusted-surface-texture", 0.3),
    7658: ("cotton-towel-texture-white", 0.3),
    7827: ("bubbly-rows-boucle-fabric-texture", 0.3),
    6565: ("plain-sheer-drapery-fabric-texture-white", 0.28),
    7486: ("worn-abs-plastic-texture-gray", 0.3),
    7495: ("dry-blast-mold-plastic-texture-black", 0.3),
    4585: ("flat-grass-texture", 2.5),
    7006: ("small-rocks-on-dirt-texture", 3.0),
    2561: ("rough-asphalt-texture-gray", 1.0),
}
# nome do asset na Poliigon (pasta da biblioteca do addon; os antigos nao tem o numero no nome)
NOMES = {5204: "TilesZelligeSquaresWeathered001", 5377: "TilesTerracottaBeigeSquareStacked001", 7380: "TerrazzoSlab028",
         3129: "MetalGalvanizedSteelWorn001", 7658: "TowelCotton001", 6565: "FabricPlainNaturalSheer009",
         7006: "GroundDirtRocky020", 2561: "CityStreetAsphaltGenericClean001"}
# palavras para achar os assets antigos (nome de arquivo sem o numero, ex.: MetalGalvanizedWorn001_COL_1K.jpg)
CHAVES = {3129: ("galvani",), 2561: ("asphalt",), 4186: ("ash", "wood"), 4585: ("grass",)}


# --------------------------------------------------------------- ajustes de cor (aplicados depois do download)
def escurecer_madeira(img):                                # carvalho claro -> madeira escura envernizada (balcao, moveis)
    a = np.asarray(img.convert("RGB"), np.float32) / 255
    a = a ** 1.6 * np.array([0.62, 0.42, 0.30])
    return Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))


def verde_feltro(img):                                     # toalha de algodao branca -> feltro verde de sinuca
    g = np.asarray(img.convert("L"), np.float32) / 255
    g = 0.78 + (g - g.mean()) * 0.8
    return Image.fromarray(np.clip(g[..., None] * np.array([0.05, 0.36, 0.17]) * 255, 0, 255).astype(np.uint8))


def clarear(img, alvo=0.85):                               # plastico cinza -> mapa claro (a cor vem do fator do material)
    a = np.asarray(img.convert("RGB"), np.float32) / 255
    a = np.clip(alvo + (a - a.mean()) * 0.8, 0, 1)
    return Image.fromarray((a * 255).astype(np.uint8))


def ondular(img):                                          # chapa galvanizada lisa -> telha/portao de metal ondulado
    a = np.asarray(img.convert("RGB"), np.float32) / 255
    x = np.arange(a.shape[1], dtype=np.float32) / a.shape[1]
    onda = np.sin(x * 2 * math.pi * 8)                     # 8 ondas por tile (0,5 m -> ondas de 6 cm)
    luz = 0.80 + 0.20 * onda
    return Image.fromarray(np.clip(a * luz[None, :, None] * 255, 0, 255).astype(np.uint8))


def normal_ondulado(tam):
    x = np.arange(tam, dtype=np.float32) / tam
    dz = np.cos(x * 2 * math.pi * 8) * 0.55                # derivada da onda
    nx, nz = -dz / np.sqrt(1 + dz ** 2), 1 / np.sqrt(1 + dz ** 2)
    rgb = np.stack([np.broadcast_to(nx, (tam, tam)), np.zeros((tam, tam)), np.broadcast_to(nz, (tam, tam))], -1)
    return Image.fromarray(np.clip((rgb * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8))


# slot de saida: (asset, normal?, ajuste, tile em metros, provisoria)
# tile = metros cobertos por uma repeticao da imagem (o 38 reescala as UVs para casar)
SLOTS = {
    "pol_tijolo":         (7787, True,  None,              2.5,  "pbr_tijolo.jpg"),
    "pol_reboco":         (7664, False, None,              0.6,  "reboco.jpg"),
    "pol_concreto":       (7656, False, None,              2.5,  "concreto.jpg"),
    "pol_microcimento":   (8690, False, None,              2.5,  "concreto.jpg"),
    "pol_carvalho":       (7760, False, None,              2.5,  "pbr_madeira_verniz.jpg"),
    "pol_madeira_escura": (7760, False, escurecer_madeira, 2.5,  "pbr_madeira_escura.jpg"),
    "pol_freixo":         (4186, False, None,              2.5,  "forro.jpg"),
    "pol_azulejo":        (5204, False, None,              1.45, "azulejo.jpg"),
    "pol_piso":           (5377, False, None,              2.5,  "piso_ceramico.jpg"),
    "pol_granito":        (7380, False, None,              2.0,  "pbr_granito.jpg"),
    "pol_inox":           (7174, False, None,              2.5,  "pbr_inox.jpg"),
    "pol_metal_preto":    (7037, False, None,              2.5,  None),
    "pol_metal_ondulado": (3129, False, ondular,           0.5,  "metal_ondulado.jpg"),
    "pol_ferrugem":       (7642, False, None,              0.3,  None),
    "pol_feltro":         (7658, False, verde_feltro,      0.3,  "pbr_feltro.jpg"),
    "pol_tapete":         (7827, False, None,              0.3,  "palco_tapete.jpg"),
    "pol_tecido":         (6565, False, None,              0.28, "palco_tecido.jpg"),
    "pol_plastico":       (7486, False, clarear,              0.3,  None),
    "pol_plastico_preto": (7495, False, None,              0.3,  None),
    "pol_grama":          (4585, False, None,              2.5,  "grama.jpg"),
    "pol_terra":          (7006, True,  None,              3.0,  "terra_batida.jpg"),
    "pol_asfalto":        (2561, False, None,              1.0,  "asfalto.jpg"),
}

# --------------------------------------------------------------- leitura dos downloads
RES = ("1K", "2K", "3K", "4K", "6K", "8K")


def _ordem_res(nome):
    for i, r in enumerate(RES):
        if re.search(r"(^|[_\-/ ])%s([_\-. /]|$)" % r, nome, re.I):
            return i
    return len(RES)


def _tipo(nome):
    b = os.path.basename(nome).lower()
    if not b.endswith((".jpg", ".jpeg", ".png", ".tif", ".tiff")) or "preview" in b or "sphere" in b or "cube" in b:
        return None
    if re.search(r"(basecolor|base_color|albedo|diffuse|_col[_.]|_color[_.])", b):
        return "cor"
    if re.search(r"(normal|_nrm[_.])", b):
        return "normal_dx" if re.search(r"(dx|directx)", b) else "normal"
    return None


def arquivos_do_asset(aid, slot):
    """{'cor': (bytes, nome), 'normal': ...} juntando zips e arquivos soltos das pastas DLS que pertencem ao asset."""
    alvo = re.compile(r"(^|[^0-9])%d([^0-9]|$)" % aid)
    chaves = CHAVES.get(aid, ())
    nome = NOMES.get(aid, "").lower()

    def pertence(caminho):
        c = caminho.lower().replace("\\", "/")
        if alvo.search(c) or slot in c or (nome and nome in c):
            return True
        return bool(chaves) and all(k in c for k in chaves)
    cand = {}
    for base, raiz, nomes in ((d, r, n) for d in DLS if os.path.isdir(d) for r, _, n in os.walk(d)):
        for n in nomes:
            p = os.path.join(raiz, n)
            rel = os.path.relpath(p, base)
            if n.lower().endswith(".zip"):
                try:
                    zf = zipfile.ZipFile(p)
                except zipfile.BadZipFile:
                    continue
                zip_ok = pertence(rel)
                for zn in zf.namelist():
                    t = _tipo(zn)
                    if t and (zip_ok or pertence(zn)):
                        cand.setdefault(t, []).append((_ordem_res(zn), zn, lambda zf=zf, zn=zn: zf.read(zn)))
            else:
                t = _tipo(n)
                if t and pertence(rel):
                    cand.setdefault(t, []).append((_ordem_res(rel), rel, lambda p=p: open(p, "rb").read()))
    out = {}
    for t, lst in cand.items():
        lst.sort(key=lambda c: (c[0], c[1]))
        out[t] = (lst[0][2](), lst[0][1])
    if "normal" not in out and "normal_dx" in out:            # DirectX -> OpenGL: inverte o verde
        dados, nome = out["normal_dx"]
        im = Image.open(io.BytesIO(dados)).convert("RGB")
        r, g, b = im.split()
        buf = io.BytesIO()
        Image.merge("RGB", (r, g.point(lambda v: 255 - v), b)).save(buf, "PNG")
        out["normal"] = (buf.getvalue(), nome + " (DX->GL)")
    return out


# texturas quase lisas saem menores (economia de memoria no jogo; medido no 43_texturas_bar.py)
TAM = {"pol_plastico.jpg": 256, "pol_plastico_preto.jpg": 256, "pol_metal_preto.jpg": 256, "pol_inox.jpg": 256,
       "pol_feltro.jpg": 256, "pol_metal_ondulado_n.jpg": 256, "pol_reboco.jpg": 128,
       "pol_metal_ondulado.jpg": 512, "pol_madeira_escura.jpg": 512}


def salvar(img, nome):
    img = img.convert("RGB")
    lado = TAM.get(nome, N)
    if img.size != (lado, lado):
        img = img.resize((lado, lado), Image.LANCZOS)
    p = os.path.join(TEX, nome)
    img.save(p, quality=Q, optimize=True, progressive=True)
    return os.path.getsize(p) // 1024


# --------------------------------------------------------------- provisorias geradas (slots sem textura antiga)
rng = np.random.default_rng(3)


def ruido(n, escalas):
    acc = np.zeros((n, n), np.float32)
    for s, w in escalas:
        small = rng.random((max(2, n // s), max(2, n // s))).astype(np.float32)
        acc += w * np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((n, n), Image.BICUBIC), np.float32) / 255
    return acc / sum(w for _, w in escalas)


def provisoria_gerada(slot):
    base = {"pol_metal_preto": (0.07, 0.07, 0.075), "pol_ferrugem": (0.36, 0.17, 0.08),
            "pol_plastico": (0.85, 0.85, 0.85), "pol_plastico_preto": (0.06, 0.06, 0.065)}[slot]
    v = 0.9 + 0.2 * ruido(N, ((64, 1), (8, 0.5)))
    return Image.fromarray(np.clip(v[..., None] * np.array(base) * 255, 0, 255).astype(np.uint8))


# --------------------------------------------------------------- principal
status = {}
faltando = {}
for d in DLS:
    print("Downloads Poliigon em:", d, "(existe)" if os.path.isdir(d) else "(nao existe)")
for slot, (aid, usa_normal, ajuste, tile, antiga) in SLOTS.items():
    slug, fis = POLIIGON[aid]
    arqs = arquivos_do_asset(aid, slot)
    info = {"asset": aid, "url": "https://www.poliigon.com/texture/%s/%d" % (slug, aid), "tile": tile, "fisico": fis}
    if "cor" in arqs:
        cor = Image.open(io.BytesIO(arqs["cor"][0])).convert("RGB")
        if tile < fis:                                     # tile menor que a foto: usa um recorte do canto (k x k repeticoes)
            k = max(1, round(fis / tile))
            info["tile"] = tile = fis / k
            if k > 1:
                cor = cor.crop((0, 0, cor.size[0] // k, cor.size[1] // k))
        if ajuste:
            cor = ajuste(cor)
        kb = salvar(cor, slot + ".jpg")
        info.update(origem="poliigon", arquivo=arqs["cor"][1])
        nrm = None
        if slot == "pol_metal_ondulado":
            nrm = normal_ondulado(N)
        elif usa_normal and "normal" in arqs:
            nrm = Image.open(io.BytesIO(arqs["normal"][0])).convert("RGB")
            if np.asarray(nrm.convert("L"), np.float32).std() < 3.0:   # normal quase plano: so chuvisco de jpg
                nrm = None
        if nrm is not None:
            salvar(nrm, slot + "_n.jpg")
            info["normal"] = slot + "_n.jpg"
        print("  %-20s Poliigon %5d  %4d KB  <- %s" % (slot, aid, kb, arqs["cor"][1]))
    else:
        faltando[aid] = info["url"]
        img = Image.open(os.path.join(TEX, antiga)) if antiga else provisoria_gerada(slot)
        salvar(img, slot + ".jpg")
        if slot == "pol_metal_ondulado":
            salvar(normal_ondulado(N), slot + "_n.jpg")
            info["normal"] = slot + "_n.jpg"
        elif usa_normal and antiga and os.path.exists(os.path.join(TEX, antiga.replace(".jpg", "_n.jpg"))):
            shutil.copyfile(os.path.join(TEX, antiga.replace(".jpg", "_n.jpg")), os.path.join(TEX, slot + "_n.jpg"))
            info["normal"] = slot + "_n.jpg"
        info.update(origem="provisoria", arquivo=antiga or "gerada")
        print("  %-20s PROVISORIA (%s) - falta Poliigon %d" % (slot, antiga or "gerada", aid))
    status[slot] = info

with open(os.path.join(TEX, "pol_status.json"), "w", encoding="utf8") as f:
    json.dump(status, f, indent=1, ensure_ascii=False)
if faltando:
    print("\nFaltam %d downloads da Poliigon (conta gratuita), salve os zips em %s:" % (len(faltando), DLS[-1]))
    for aid, url in sorted(faltando.items()):
        print("  ", url)
print("ok")
