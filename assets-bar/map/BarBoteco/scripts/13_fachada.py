# Fachada "Highland Bar" com a logo (C:\Users\rafael\Desktop\BAR\2.0\logo\logo-upscayl.png):
#   Predio_Letreiro          letreiro principal na quina do pavimento superior, de frente para o cruzamento:
#                            acrilico recortado no contorno da logo (face = logo iluminada, lateral = neon magenta),
#                            preso por bracos de aco nas duas paredes
#   Luz_Letreiro (Iluminacao) PointLight atras do letreiro: halo magenta nos tijolos da quina
#   Placa_Highland           as duas placas do beiral da varanda (sul e oeste) trocam o "BAR DA ESQUINA" do atlas por
#                            um painel luminoso proprio: logo no centro + chamadas em neon nas cores da logo
# Texturas geradas em B.TEX_DIR: letreiro_highland.jpg (2048x2048) e placa_highland.jpg (2048x512).
# Rodar depois do 04_predio.py (recria Predio_Placas e limpa Predio_Estrutura) e do 02_materiais.py.
import bpy, math, os, sys
import numpy as np
from mathutils import Vector, Matrix

DIR = r"C:\Users\rafael\BarBoteco\scripts"
if DIR not in sys.path:
    sys.path.insert(0, DIR)
import barlib as B

LOGO = r"C:\Users\rafael\Desktop\BAR\2.0\logo\logo-upscayl.png"
COL = "Predio_Estrutura"
FONTE_FORTE = r"C:\Windows\Fonts\FRADMCN.TTF"      # Franklin Gothic Demi Cond: chamadas grandes
FONTE_LEVE = r"C:\Windows\Fonts\bahnschrift.ttf"   # linhas de apoio
F = np.float32
# cores da logo (sRGB, como ficam gravadas na textura)
FUNDO_A, FUNDO_B = (0.030, 0.018, 0.085), (0.150, 0.030, 0.230)    # azul-noite -> roxo (topo -> base)
MAGENTA, CIANO, AMARELO, LARANJA = (1.0, 0.17, 0.84), (0.16, 0.86, 1.0), (1.0, 0.86, 0.20), (1.0, 0.55, 0.08)
# letreiro da quina
TAM = 2.5                         # lado do quadro da textura (m); a logo ocupa 1 / (1 + 2 * PAD) dele
PAD = 0.05
ESP = 0.10                        # espessura do acrilico
QUINA = Vector((3.5, 3.5))        # faces externas do pavimento superior (paredes x = 3.5 e y = 3.5)
RECUO = 0.42                      # centro do letreiro afastado da quina (m em x e em y)
ZC = 5.05                         # centro do letreiro (base ~3.85, acima do espigao do telhado da varanda)
LUZ_W = 60.0
COR_LUZ = (1.0, 0.06, 0.55)       # linear


# ------------------------------------------------------------------ imagem
def _caixa(a, r, ax):
    if r < 1:
        return a
    pad = [(0, 0)] * a.ndim
    pad[ax] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode='edge'), axis=ax, dtype=np.float64)
    n = a.shape[ax]
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=ax)
    lo = np.take(c, np.arange(0, n), axis=ax)
    return ((hi - lo) / (2 * r + 1)).astype(F)


def borrar(a, r):
    """~gaussiana de raio r (3 passadas de caixa)."""
    k = max(1, int(round(r / 1.73)))
    for _ in range(3):
        a = _caixa(_caixa(a, k, 0), k, 1)
    return a


def dilatar(m, r):
    out = m.copy()
    H, W = m.shape
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy > r * r or (dx == 0 and dy == 0):
                continue
            out[max(-dy, 0):H + min(-dy, 0), max(-dx, 0):W + min(-dx, 0)] |= m[max(dy, 0):H + min(dy, 0), max(dx, 0):W + min(dx, 0)]
    return out


def erodir(m, r):
    return ~dilatar(~m, r)


def reconstruir(semente, mascara):
    """Regiao de `mascara` conectada a `semente` (flood fill)."""
    s = semente & mascara
    while True:
        d = s
        for _ in range(8):
            e = d.copy()
            e[1:] |= d[:-1]; e[:-1] |= d[1:]; e[:, 1:] |= d[:, :-1]; e[:, :-1] |= d[:, 1:]
            d = e & mascara
        if (d == s).all():
            return d
        s = d


def logo_rgba(px):
    """Logo reduzida para px x px, RGBA float, linha 0 = topo."""
    src = bpy.data.images.load(LOGO, check_existing=True)
    im = src.copy()
    im.scale(px, px)
    a = np.empty(px * px * 4, F)
    im.pixels.foreach_get(a)
    bpy.data.images.remove(im)
    if src.users == 0:
        bpy.data.images.remove(src)
    return a.reshape(px, px, 4)[::-1].copy()


def sobre(rgb, cor, m):
    m = np.asarray(m, F)[..., None]
    return rgb * (1 - m) + np.asarray(cor, F) * m


def neon(rgb, m, cor, halo=1.0, r1=5, r2=20):
    """Tubo de neon: brilho colorido em volta e miolo quase branco."""
    cor = np.asarray(cor, F)
    rgb = rgb + cor * (borrar(m, r1) * 0.85 + borrar(m, r2) * 0.55)[..., None] * halo
    return sobre(rgb, cor * 0.45 + 0.55, m)


def retangulo_arredondado(H, W, x0, y0, x1, y1, raio, largura):
    yy, xx = np.mgrid[0:H, 0:W].astype(F) + 0.5
    cx, cy, hx, hy = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 - raio, (y1 - y0) / 2 - raio
    qx, qy = np.abs(xx - cx) - hx, np.abs(yy - cy) - hy
    d = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - raio
    return np.clip(largura / 2 - np.abs(d) + 0.5, 0, 1).astype(F)


def textos(W, H, itens):
    """Mascara dos textos (linha 0 = topo). itens: (texto, fonte, x_centro, y_centro, tamanho_px, largura_max, espacamento)."""
    import gpu, blf
    off = gpu.types.GPUOffScreen(W, H)
    with off.bind():
        fb = gpu.state.active_framebuffer_get()
        fb.clear(color=(0.0, 0.0, 0.0, 1.0))
        with gpu.matrix.push_pop():
            gpu.matrix.load_matrix(Matrix.Identity(4))
            gpu.matrix.load_projection_matrix(Matrix(((2 / W, 0, 0, -1), (0, 2 / H, 0, -1), (0, 0, 1, 0), (0, 0, 0, 1))))
            for (txt, fonte, x, y, size, maxw, track) in itens:
                fid = blf.load(fonte)
                size = float(size)
                while True:
                    blf.size(fid, size)
                    larg = [blf.dimensions(fid, ch)[0] for ch in txt]
                    tw = sum(larg) + track * (len(txt) - 1)
                    if not maxw or tw <= maxw or size <= 8:
                        break
                    size -= 2
                _, cap = blf.dimensions(fid, "H")
                px, yb = x - tw / 2, H - y - cap / 2
                blf.color(fid, 1, 1, 1, 1)
                for ch, w in zip(txt, larg):
                    blf.position(fid, px, yb, 0)
                    blf.draw(fid, ch)
                    px += w + track
        buf = fb.read_color(0, 0, W, H, 4, 0, 'FLOAT')
    off.free()
    buf.dimensions = W * H * 4
    try:
        arr = np.array(buf, dtype=F)
    except Exception:
        arr = np.array(buf.to_list(), dtype=F)
    return arr.reshape(H, W, 4)[::-1, :, 0].copy()


def salvar(nome, rgb, qualidade=92):
    h, w = rgb.shape[:2]
    rgba = np.ones((h, w, 4), F)
    rgba[..., :3] = np.clip(rgb, 0, 1)
    tmp = bpy.data.images.new(nome + "_gen", w, h, alpha=False)
    tmp.pixels.foreach_set(np.ascontiguousarray(rgba[::-1]).ravel())
    path = os.path.join(B.TEX_DIR, nome)
    tmp.filepath_raw = path
    tmp.file_format = 'JPEG'
    try:
        tmp.save(filepath=path, quality=qualidade)
    except TypeError:
        tmp.save()
    bpy.data.images.remove(tmp)
    im = bpy.data.images.get(nome)
    if im is not None:
        im.reload()


def fundo(H, W):
    t = (np.arange(H, dtype=F) / (H - 1))[:, None, None]
    rgb = np.broadcast_to(np.asarray(FUNDO_A, F) * (1 - t) + np.asarray(FUNDO_B, F) * t, (H, W, 3)).copy()
    yy, xx = np.mgrid[0:H, 0:W].astype(F)
    vinheta = 1 - 0.35 * (((xx / W - 0.5) * 2) ** 2 * 0.5 + ((yy / H - 0.5) * 2) ** 2 * 0.5)
    return rgb * vinheta[..., None]


# ------------------------------------------------------------------ 1) letreiro da quina: textura + contorno
S = 2048
L = int(round(S / (1 + 2 * PAD)))
o = (S - L) // 2
lg = logo_rgba(L)
alfa = np.zeros((S, S), F)
alfa[o:o + L, o:o + L] = lg[..., 3]
rgb = fundo(S, S) * 0.6
rgb = rgb + np.asarray(MAGENTA, F) * (borrar(alfa, 26) * 0.75)[..., None] * (1 - alfa)[..., None]
cor_logo = np.zeros((S, S, 3), F)
cor_logo[o:o + L, o:o + L] = lg[..., :3]
rgb = rgb * (1 - alfa[..., None]) + cor_logo * alfa[..., None]
salvar("letreiro_highland.jpg", rgb)

N = 512                                              # contorno do recorte numa grade de 512
a5 = alfa.reshape(N, S // N, N, S // N).mean((1, 3))
m = a5 > 0.5
m = erodir(dilatar(m, 16), 16)                       # fecha os vaos entre palmeiras / letras (recorte de placa, nao de estencil)
borda = np.zeros_like(m)
borda[0, :] = borda[-1, :] = borda[:, 0] = borda[:, -1] = True
m = ~reconstruir(borda, ~m)                          # sem furos
ctr = np.argwhere(m).mean(0)
semente = np.zeros_like(m)
semente[int(ctr[0]), int(ctr[1])] = True
m = reconstruir(semente, m)                          # so a peca principal
m = dilatar(m, 6)                                    # margem de ~3 cm em volta da logo
ms = borrar(m.astype(F), 2)
NA = 900
ang = np.linspace(0, 2 * math.pi, NA, endpoint=False)
raios = np.arange(0, N * 0.75, 0.25, dtype=F)
cy, cx = ctr
X = cx + np.cos(ang)[:, None] * raios[None]
Y = cy - np.sin(ang)[:, None] * raios[None]          # linha cresce para baixo: angulo anti-horario na imagem
xi = np.clip(X, 0, N - 1.001); yi = np.clip(Y, 0, N - 1.001)
x0i, y0i = xi.astype(int), yi.astype(int)
fx, fy = xi - x0i, yi - y0i
val = (ms[y0i, x0i] * (1 - fx) * (1 - fy) + ms[y0i, x0i + 1] * fx * (1 - fy) +
       ms[y0i + 1, x0i] * (1 - fx) * fy + ms[y0i + 1, x0i + 1] * fx * fy)
dentro = val >= 0.5
ult = dentro.shape[1] - 1 - np.argmax(dentro[:, ::-1], axis=1)
v0 = val[np.arange(NA), ult]
v1 = val[np.arange(NA), np.minimum(ult + 1, len(raios) - 1)]
r_borda = raios[ult] + 0.25 * np.clip((v0 - 0.5) / np.maximum(v0 - v1, 1e-6), 0, 1)
pts = np.stack([cx + np.cos(ang) * r_borda, cy - np.sin(ang) * r_borda], 1)


def simplificar(p, tol):
    """Douglas-Peucker num poligono fechado."""
    def dp(seg):
        a, b = seg[0], seg[-1]
        ab = b - a
        n = np.hypot(*ab) + 1e-9
        d = np.abs(ab[0] * (seg[:, 1] - a[1]) - ab[1] * (seg[:, 0] - a[0])) / n
        i = int(d.argmax())
        if d[i] <= tol or len(seg) < 3:
            return [a]
        return dp(seg[:i + 1]) + dp(seg[i:])
    k = int(np.hypot(*(p - p[0]).T).argmax())
    return np.array(dp(np.vstack([p[:k + 1]])) + dp(np.vstack([p[k:], p[:1]])))


poly = simplificar(pts, 0.45)
uv = np.stack([poly[:, 0] / N, 1 - poly[:, 1] / N], 1)          # UV com v para cima

# ------------------------------------------------------------------ 2) placas do beiral: textura
W2, H2 = 2048, 512
rgb = fundo(H2, W2)
rgb = neon(rgb, retangulo_arredondado(H2, W2, 18, 18, W2 - 18, H2 - 18, 44, 9), MAGENTA, halo=0.9)
rgb = neon(rgb, retangulo_arredondado(H2, W2, 40, 40, W2 - 40, H2 - 40, 26, 4), CIANO, halo=0.7, r1=4, r2=12)
LH = 500
lg2 = logo_rgba(LH)
lx, ly = (W2 - LH) // 2, (H2 - LH) // 2
a2 = np.zeros((H2, W2), F)
a2[ly:ly + LH, lx:lx + LH] = lg2[..., 3]
rgb = rgb + np.asarray(MAGENTA, F) * (borrar(a2, 18) * 0.8)[..., None] * (1 - a2)[..., None]
c2 = np.zeros((H2, W2, 3), F)
c2[ly:ly + LH, lx:lx + LH] = lg2[..., :3]
rgb = rgb * (1 - a2[..., None]) + c2 * a2[..., None]
xe, xd = (lx + 40) / 2 + 8, (W2 + lx + LH - 40) / 2 - 8          # centro dos blocos de texto (esq. / dir.)
grandes = textos(W2, H2, [("CHOPP GELADO", FONTE_FORTE, xe, 200, 150, 650, 6),
                          ("M\u00daSICA AO VIVO", FONTE_FORTE, xd, 200, 150, 650, 6)])
pequenos = textos(W2, H2, [("PETISCOS \u2022 ESPETINHOS", FONTE_LEVE, xe, 338, 74, 600, 8),
                           ("SINUCA \u2022 PEBOLIM \u2022 DARDOS", FONTE_LEVE, xd, 338, 74, 600, 8)])
gy = (np.arange(H2, dtype=F) / H2)[:, None, None]
quente = np.asarray(AMARELO, F) * (1 - gy) + np.asarray(LARANJA, F) * gy   # amarelo -> laranja como o "BAR" da logo
rgb = rgb + quente * (borrar(grandes, 6) * 0.85 + borrar(grandes, 24) * 0.6)[..., None]
rgb = rgb * (1 - grandes[..., None]) + (quente * 0.5 + 0.5) * grandes[..., None]
rgb = neon(rgb, pequenos, CIANO, halo=0.8, r1=4, r2=14)
salvar("placa_highland.jpg", rgb)

# ------------------------------------------------------------------ 3) materiais (luminosos: base escurecida + emissao = textura)
# base iluminada + emissao passando de 1 lava as cores da logo no sol: base a 20%, emissao um pouco abaixo de 1
mat_letreiro = B.material("Letreiro_Highland", color=(0.2, 0.2, 0.2), tex="letreiro_highland.jpg", rough=0.25,
                          emis_tex=True, emis_str=0.9)
mat_placa = B.material("Placa_Highland", color=(0.2, 0.2, 0.2), tex="placa_highland.jpg", rough=0.3,
                       emis_tex=True, emis_str=0.85)
B.material("Neon_Magenta", color=(0.9, 0.1, 0.6), rough=0.3, emis=(1.0, 0.024, 0.67), emis_str=3.0)
for nm in ("letreiro_highland.jpg", "placa_highland.jpg"):
    im = bpy.data.images[nm]
    if im.packed_file is None:
        im.pack()

# ------------------------------------------------------------------ 4) letreiro da quina: malha
for n in ("Predio_Letreiro",):
    ob = bpy.data.objects.get(n)
    if ob is not None:
        me = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if me.users == 0:
            bpy.data.meshes.remove(me)
frente = Vector((-1.0, -1.0, 0.0)).normalized()     # de frente para o cruzamento
lado = Vector((1.0, -1.0, 0.0)).normalized()        # "direita" de quem olha o letreiro
cima = Vector((0.0, 0.0, 1.0))
C = Vector((QUINA.x - RECUO, QUINA.y - RECUO, ZC))
fr = [C + lado * ((u - 0.5) * TAM) + cima * ((v - 0.5) * TAM) for u, v in uv]
tr = [p - frente * ESP for p in fr]
meio = C - frente * (ESP / 2)
m3 = B.Mesh("Predio_Letreiro")
m3.face(fr, "Letreiro_Highland", uvs=[tuple(x) for x in uv], facing=frente)
m3.face(tr, "Metal_Escuro", facing=-frente)
for i in range(len(fr)):
    j = (i + 1) % len(fr)
    m3.face([fr[i], fr[j], tr[j], tr[i]], "Neon_Magenta", uvs=[(0, 0), (1, 0), (1, 1), (0, 1)], away=meio)
# bracos de aco (tubo quadrado 6 cm) do verso do letreiro ate as duas paredes, com chapa de fixacao
s_braco = (RECUO + 0.35) * math.sqrt(2) - ESP
bracos = []
for sinal, eixo in ((1, 'y'), (-1, 'x')):            # +lado -> parede sul (y = 3.5); -lado -> parede oeste (x = 3.5)
    for dz in (-0.45, 0.45):
        p = C - frente * ESP + lado * (sinal * s_braco) + cima * dz
        if eixo == 'y':
            m3.box((p.x - 0.03, p.y, p.z - 0.03), (p.x + 0.03, QUINA.y, p.z + 0.03), "Metal_Escuro")
            m3.box((p.x - 0.10, QUINA.y - 0.012, p.z - 0.10), (p.x + 0.10, QUINA.y, p.z + 0.10), "Metal_Escuro")
        else:
            m3.box((p.x, p.y - 0.03, p.z - 0.03), (QUINA.x, p.y + 0.03, p.z + 0.03), "Metal_Escuro")
            m3.box((QUINA.x - 0.012, p.y - 0.10, p.z - 0.10), (QUINA.x, p.y + 0.10, p.z + 0.10), "Metal_Escuro")
        bracos.append(tuple(round(c, 2) for c in p))
let = m3.build(COL)

lz = bpy.data.objects.get("Luz_Letreiro")
if lz is None:
    lz = bpy.data.objects.new("Luz_Letreiro", bpy.data.lights.get("Luz_Letreiro") or bpy.data.lights.new("Luz_Letreiro", 'POINT'))
    B.coll("Iluminacao").objects.link(lz)
lz.data.energy = LUZ_W
lz.data.color = COR_LUZ
lz.data.shadow_soft_size = 0.5
lz.data.use_shadow = False
lz.location = (QUINA.x - 0.10, QUINA.y - 0.10, ZC)    # dentro da quina: banha os tijolos, sem mancha no verso da chapa

# ------------------------------------------------------------------ 5) placas do beiral: troca a regiao 'placa' do atlas pela textura propria
pl = bpy.data.objects["Predio_Placas"]
me = pl.data
if "Placa_Highland" not in [m.name for m in me.materials if m]:
    me.materials.append(mat_placa)
i_novo = [m.name if m else None for m in me.materials].index("Placa_Highland")
i_atlas = [m.name if m else None for m in me.materials].index("Atlas_Placas") if "Atlas_Placas" in [m.name if m else None for m in me.materials] else -1
uvl = me.uv_layers.active.data
trocadas = 0
for p in me.polygons:
    if p.material_index not in (i_atlas, i_novo):
        continue
    us = [uvl[li].uv[0] for li in p.loop_indices]
    vs = [uvl[li].uv[1] for li in p.loop_indices]
    if p.material_index == i_atlas and min(vs) < 0.74:          # regiao 'placa' = faixa de cima do atlas (v 0.75..1)
        continue
    if p.material_index == i_novo and (max(us) > 1.001 or min(vs) < -0.001):
        continue
    u0, u1, v0_, v1_ = min(us), max(us), min(vs), max(vs)
    for li in p.loop_indices:
        u, v = uvl[li].uv
        uvl[li].uv = ((u - u0) / (u1 - u0), (v - v0_) / (v1_ - v0_))
    p.material_index = i_novo
    trocadas += 1

print("letreiro: %d vertices no contorno, %.2f x %.2f m, centro (%.2f, %.2f, %.2f), bracos %s | placas trocadas: %d"
      % (len(fr), TAM * (uv[:, 0].max() - uv[:, 0].min()), TAM * (uv[:, 1].max() - uv[:, 1].min()), C.x, C.y, C.z, bracos, trocadas))
