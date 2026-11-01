# Cidade - atlas unico (1024 px) com letreiros ficticios, elementos de fachada e placas de transito.
# Reaproveita o metodo do 01_texturas.py (numpy + texto via blf/GPUOffScreen). Gera texturas\atlas_cidade.jpg.
import bpy, os, sys
import numpy as np
from mathutils import Matrix
SP = r"C:\Users\rafael\BarBoteco\scripts"
if SP not in sys.path:
    sys.path.insert(0, SP)
import barlib as B

F = np.float32
rng = np.random.default_rng(2026)
S = 1024


def vnoise(h, w, cy, cx):
    g = rng.random((cy, cx)).astype(F)

    def idx(n, c):
        x = np.arange(n, dtype=F) * (c / n)
        i0 = np.floor(x).astype(np.int64)
        t = x - i0
        t = t * t * (3 - 2 * t)
        return i0 % c, (i0 + 1) % c, t.astype(F)
    x0, x1, tx = idx(w, cx)
    y0, y1, ty = idx(h, cy)
    a = g[:, x0] * (1 - tx) + g[:, x1] * tx
    return a[y0, :] * (1 - ty)[:, None] + a[y1, :] * ty[:, None]


def render_text(items):
    import gpu, blf
    off = gpu.types.GPUOffScreen(S, S)
    with off.bind():
        fb = gpu.state.active_framebuffer_get()
        fb.clear(color=(0.0, 0.0, 0.0, 1.0))
        with gpu.matrix.push_pop():
            gpu.matrix.load_matrix(Matrix.Identity(4))
            gpu.matrix.load_projection_matrix(Matrix(((2 / S, 0, 0, -1), (0, 2 / S, 0, -1), (0, 0, 1, 0), (0, 0, 0, 1))))
            for (txt, x, y, size, maxw) in items:
                size = float(size)
                blf.size(0, size)
                tw, th = blf.dimensions(0, txt)
                while maxw and tw > maxw and size > 6:
                    size -= 1; blf.size(0, size); tw, th = blf.dimensions(0, txt)
                _, cap = blf.dimensions(0, "H")
                blf.color(0, 1, 1, 1, 1)
                for ox, oy in ((0, 0), (1, 0), (0, 1), (1, 1)):
                    blf.position(0, x - tw / 2 + ox, S - y - cap / 2 + oy, 0)
                    blf.draw(0, txt)
        buf = fb.read_color(0, 0, S, S, 4, 0, 'FLOAT')
    off.free()
    buf.dimensions = S * S * 4
    try:
        arr = np.array(buf, dtype=F)
    except Exception:
        arr = np.array(buf.to_list(), dtype=F)
    return arr.reshape(S, S, 4)[::-1, :, 0].copy()


def paint(A, mask, color):
    A[:] = A * (1 - mask[..., None]) + np.asarray(color, F) * mask[..., None]


A = np.zeros((S, S, 3), F)
yy, xx = np.mgrid[0:S, 0:S].astype(F)
grain = vnoise(S, S, 64, 64) * 0.5 + vnoise(S, S, 256, 256) * 0.5
BR, PR, AM = [], [], []                       # texto branco, preto, amarelo


def placa(x0, y0, w, h, cor, txt, lst, tam=56, borda=(0.95, 0.95, 0.92)):
    A[y0:y0 + h, x0:x0 + w] = np.asarray(cor, F) * (0.9 + 0.1 * grain[y0:y0 + h, x0:x0 + w])[..., None]
    A[y0:y0 + 5, x0:x0 + w] = borda; A[y0 + h - 5:y0 + h, x0:x0 + w] = borda
    lst.append((txt, x0 + w / 2, y0 + h / 2, tam, w - 30))


# letreiros (ficticios)
placa(0, 0, 1024, 128, (0.10, 0.22, 0.45), "PREFEITURA MUNICIPAL", BR, 70)
placa(0, 128, 512, 128, (0.05, 0.45, 0.25), "TERMINAL CENTRAL", BR)
placa(512, 128, 512, 128, (0.92, 0.92, 0.90), "UBS JARDIM CONCEIÇÃO", PR, 48, borda=(0.05, 0.45, 0.25))
placa(0, 256, 512, 128, (0.10, 0.28, 0.62), "EMEF JARDIM CONCEIÇÃO", BR, 48)
placa(512, 256, 512, 128, (0.80, 0.10, 0.08), "SUPERMERCADO BOA COMPRA", AM, 46)
placa(0, 384, 512, 128, (0.95, 0.55, 0.05), "TRANSPORTES RODOVALE", BR, 46)
placa(512, 384, 512, 128, (0.25, 0.27, 0.30), "METALÚRGICA PAULISTA", BR, 46)
for k, (txt, cor, lst) in enumerate((("SALÃO", (0.75, 0.25, 0.55), BR), ("LANCHES", (0.90, 0.75, 0.10), PR),
                                     ("BORRACHARIA", (0.10, 0.10, 0.10), AM), ("PAPELARIA", (0.15, 0.45, 0.75), BR))):
    placa(k * 256, 512, 256, 128, cor, txt, lst, 44)
for k, (txt, cor, lst) in enumerate((("MAT. CONSTRUÇÃO", (0.85, 0.40, 0.05), BR), ("AUTO PEÇAS", (0.70, 0.08, 0.08), BR),
                                     ("SORVETERIA", (0.55, 0.80, 0.90), PR), ("MERCEARIA", (0.20, 0.50, 0.20), BR))):
    placa(k * 256, 640, 256, 128, cor, txt, lst, 40)
# fachadas 128 px (linha 768)
R = A[768:896, 0:128]                                    # janela basculante industrial
R[:] = (0.55, 0.57, 0.58)
for gy in range(8, 128, 30):
    R[gy:gy + 24, 8:120] = (0.35 + 0.15 * (gy / 128), 0.45, 0.52)
    R[gy + 22:gy + 24, 8:120] = (0.25, 0.25, 0.25)
R = A[768:896, 128:384]                                  # vitrine de loja aberta
R[:] = (0.12, 0.13, 0.14)
R[10:118, 10:246] = (0.85, 0.82, 0.70)
for k in range(10):
    c = rng.random(3).astype(F) * 0.7 + 0.2
    R[60 + (k % 2) * 25:80 + (k % 2) * 25, 20 + k * 22:36 + k * 22] = c
R[10:118, 125:131] = (0.12, 0.13, 0.14)
R = A[768:896, 384:512]                                  # porta de enrolar fechada
R[:] = (0.62, 0.63, 0.64)
for gy in range(0, 128, 8):
    R[gy:gy + 2, :] = (0.42, 0.43, 0.44)
R[110:118, 50:78] = (0.25, 0.25, 0.25)
R = A[768:896, 512:640]                                  # portao de doca (seccional)
R[:] = (0.80, 0.80, 0.78)
for gy in range(0, 128, 21):
    R[gy:gy + 3, :] = (0.5, 0.5, 0.5)
R[:, 0:6] = (0.95, 0.75, 0.1); R[:, 122:128] = (0.95, 0.75, 0.1)
R = A[768:896, 640:768]                                  # janela de sobrado com veneziana
R[:] = (0.92, 0.92, 0.88)
R[8:120, 8:120] = (0.45, 0.30, 0.18)
for gy in range(12, 118, 7):
    R[gy:gy + 2, 10:118] = (0.30, 0.20, 0.12)
R[8:120, 62:66] = (0.92, 0.92, 0.88)
R = A[768:896, 768:896]                                  # muro com pichacao
R[:] = (0.78, 0.76, 0.72)
for k in range(6):
    x = 10 + k * 19
    R[40 + k * 3:80 - k * 2, x:x + 5] = (0.1, 0.1, 0.12)
    R[40 + k * 3:44 + k * 3, x:x + 16] = (0.1, 0.1, 0.12)
R[90:96, 10:118] = (0.2, 0.25, 0.55)
placa(896, 768, 128, 128, (0.10, 0.35, 0.65), "BUS", BR, 40)
# placas de transito 128 px (linha 896)
cx, cy = 64.0, 960.0
r = np.hypot(xx[896:1024, 0:128] - 64, yy[896:1024, 0:128] - 960)
A[896:1024, 0:128] = (0.95, 0.95, 0.95)
ang = np.arctan2(yy[896:1024, 0:128] - 960, xx[896:1024, 0:128] - 64)
octo = r * np.cos((np.mod(ang + np.pi / 8, np.pi / 4)) - np.pi / 8) < 60
A[896:1024, 0:128][octo] = (0.78, 0.06, 0.06)
BR.append(("PARE", 64, 960, 38, 110))
for k, (fundo, txt, lst, aro) in enumerate((((0.95, 0.95, 0.95), "40", PR, (0.8, 0.06, 0.06)),
                                            ((0.95, 0.95, 0.95), "E", PR, (0.8, 0.06, 0.06)))):
    x0 = 128 + k * 128
    rr_ = np.hypot(xx[896:1024, x0:x0 + 128] - (x0 + 64), yy[896:1024, x0:x0 + 128] - 960)
    A[896:1024, x0:x0 + 128] = (0.95, 0.95, 0.95)
    A[896:1024, x0:x0 + 128][rr_ < 60] = aro
    A[896:1024, x0:x0 + 128][rr_ < 48] = fundo
    lst.append((txt, x0 + 64, 960, 52, 90))
A[896:1024, 256:384][np.abs((xx[896:1024, 256:384] - 320) - (yy[896:1024, 256:384] - 960)) < 7] = (0.8, 0.06, 0.06)
A[896:1024, 384:512] = (0.95, 0.95, 0.95)                # lombada (losango amarelo)
dia = np.abs(xx[896:1024, 384:512] - 448) + np.abs(yy[896:1024, 384:512] - 960) < 60
A[896:1024, 384:512][dia] = (0.10, 0.10, 0.10)
dia2 = np.abs(xx[896:1024, 384:512] - 448) + np.abs(yy[896:1024, 384:512] - 960) < 52
A[896:1024, 384:512][dia2] = (0.95, 0.78, 0.08)
PR.append(("LOMBADA", 448, 960, 18, 70))
placa(512, 896, 128, 128, (0.10, 0.35, 0.65), "→", BR, 70)                     # sentido unico
placa(640, 896, 128, 128, (0.95, 0.78, 0.08), "ESCOLA", PR, 26, borda=(0.1, 0.1, 0.1))
placa(768, 896, 256, 128, (0.05, 0.40, 0.20), "DISTRITO INDUSTRIAL", BR, 30)
paint(A, render_text(BR), (0.97, 0.97, 0.95))
paint(A, render_text(PR), (0.06, 0.06, 0.06))
paint(A, render_text(AM), (1.0, 0.85, 0.15))

rgba = np.ones((S, S, 4), F)
rgba[..., :3] = np.clip(A, 0, 1)
rgba = np.ascontiguousarray(rgba[::-1])
nome = "atlas_cidade.jpg"
path = os.path.join(B.TEX_DIR, nome)
tmp = bpy.data.images.new(nome + "_gen", S, S, alpha=False)
tmp.pixels.foreach_set(rgba.ravel())
tmp.filepath_raw = path
tmp.file_format = 'JPEG'
try:
    tmp.save(filepath=path, quality=90)
except TypeError:
    tmp.save()
bpy.data.images.remove(tmp)
old = bpy.data.images.get(nome)
if old:
    old.reload()
print("atlas ok:", path, os.path.getsize(path) // 1024, "KB")
