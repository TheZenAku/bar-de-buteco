# Gera as texturas procedurais (tileaveis) em C:\Users\rafael\BarBoteco\texturas
import bpy, os, math
import numpy as np
from mathutils import Matrix
import barlib as B

os.makedirs(B.TEX_DIR, exist_ok=True)
rng = np.random.default_rng(1907)
F = np.float32


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


def fbm(h, w, cy, cx, octv=5, pers=0.5):
    tot = np.zeros((h, w), F); amp = 1.0; norm = 0.0
    for o in range(octv):
        ccy, ccx = cy * 2 ** o, cx * 2 ** o
        if ccy > h or ccx > w:
            break
        tot += amp * vnoise(h, w, ccy, ccx); norm += amp; amp *= pers
    return tot / norm


def lerp(a, b, t):
    a = np.asarray(a, F); b = np.asarray(b, F)
    return a + (b - a) * np.asarray(t, F)[..., None]


def gray(v, tint=(1.0, 1.0, 1.0)):
    return np.stack([v * tint[0], v * tint[1], v * tint[2]], -1)


def save(name, rgb, quality=90):
    h, w = rgb.shape[:2]
    rgba = np.ones((h, w, 4), F)
    rgba[..., :3] = np.clip(rgb, 0, 1)
    rgba = np.ascontiguousarray(rgba[::-1])
    old = bpy.data.images.get(name)
    if old is not None:
        old.name = name + "_old"
    tmp = bpy.data.images.new(name + "_gen", w, h, alpha=False)
    tmp.pixels.foreach_set(rgba.ravel())
    path = os.path.join(B.TEX_DIR, name)
    tmp.filepath_raw = path
    tmp.file_format = 'JPEG'
    try:
        tmp.save(filepath=path, quality=quality)
    except TypeError:
        tmp.save()
    bpy.data.images.remove(tmp)
    img = bpy.data.images.load(path)
    img.name = name
    if old is not None:
        old.user_remap(img)
        bpy.data.images.remove(old)
    return img


def normal_from_height(hgt, strength):
    dx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 0.5 * strength
    dy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * 0.5 * strength
    n = np.stack([-dx, dy, np.ones_like(hgt)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def voronoi(S, N, jit_amt=0.7):
    cs = S / N
    jit = (rng.random((N, N, 2)) * jit_amt + (1 - jit_amt) / 2).astype(F)
    yy, xx = np.mgrid[0:S, 0:S].astype(F)
    ci = np.floor(xx / cs).astype(np.int32); cj = np.floor(yy / cs).astype(np.int32)
    d1 = np.full((S, S), 1e9, F); d2 = d1.copy(); idx = np.zeros((S, S), np.int32)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            gx = ci + ox; gy = cj + oy
            wx = gx % N; wy = gy % N
            px = (gx + jit[wy, wx, 0]) * cs; py = (gy + jit[wy, wx, 1]) * cs
            d = np.hypot(xx - px, yy - py)
            closer = d < d1
            d2 = np.where(closer, d1, np.minimum(d2, d))
            idx = np.where(closer, wy * N + wx, idx)
            d1 = np.where(closer, d, d1)
    return d1, d2, idx, jit, cs


# ---------------------------------------------------------------- tijolo a vista
def tex_tijolo():
    S = 1024; course = 64; blen = 256; mort = 7
    yy, xx = np.mgrid[0:S, 0:S]
    row = yy // course
    xs = (xx + (row % 2) * (blen // 2)) % S
    col = xs // blen
    ix = xs % blen; iy = yy % course
    nrow, ncol = S // course, S // blen
    r1 = rng.random((nrow, ncol)).astype(F); r2 = rng.random((nrow, ncol)).astype(F)
    base = lerp((0.55, 0.25, 0.14), (0.76, 0.42, 0.25), r1[row, col])
    base = np.where((r2[row, col] < 0.14)[..., None], base * 0.78, base)
    grain = fbm(S, S, 32, 32, 4)
    speck = rng.random((S, S)).astype(F)
    base = base * (0.86 + 0.24 * grain)[..., None] * (0.94 + 0.08 * speck)[..., None]
    ex = np.minimum(ix - mort, blen - 1 - ix).astype(F)
    ey = np.minimum(iy - mort, course - 1 - iy).astype(F)
    e = np.clip(np.minimum(ex, ey) / 5.0, 0, 1)
    base = base * (0.78 + 0.22 * e)[..., None]
    mortar = (ix < mort) | (iy < mort)
    mcol = lerp((0.52, 0.49, 0.44), (0.70, 0.67, 0.61), fbm(S, S, 64, 64, 3))
    rgb = np.where(mortar[..., None], mcol, base)
    hgt = (np.where(mortar, 0.0, 0.6 + 0.4 * e) + 0.05 * grain).astype(F)
    save("tijolo.jpg", rgb)
    save("tijolo_n.jpg", normal_from_height(hgt, 3.0), 95)


# ---------------------------------------------------------------- telha colonial (capa e canal)
def tex_telha():
    S = 1024; ncol = 4; ncourse = 3          # textura = 1.0 m (u) x 1.2 m (v)
    yy, xx = np.mgrid[0:S, 0:S].astype(F)
    u = xx / S * ncol
    ci = np.floor(u).astype(np.int32); fu = u - ci
    capa_w = 0.30
    dc = np.abs(fu - 0.5)
    capa = dc < capa_w                                          # meia-cana convexa (capa)
    hc = np.sqrt(np.clip(1 - (dc / capa_w) ** 2, 0, 1))
    dn = np.minimum(fu, 1 - fu)                                 # canal concavo entre as capas
    hn = -0.35 * np.sqrt(np.clip(1 - (dn / (0.5 - capa_w + 0.02)) ** 2, 0, 1))
    prof = np.where(capa, 0.3 + 0.7 * hc, 0.3 + hn)
    jit = (rng.random((ncol, 2)).astype(F) - 0.5) * 0.10        # fiadas levemente irregulares
    vv = (S - 1 - yy) / S * ncourse + jit[ci % ncol, capa.astype(np.int32)]
    cr = np.floor(vv).astype(np.int32); t = vv - cr
    hgt = (prof + 0.30 * (1.0 - t)).astype(F)
    du = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * (S / ncol) * 0.08
    lam = np.clip(0.82 - 0.45 * du, 0.35, 1.15)                  # sombreamento pelo perfil
    shadow = 1.0 - 0.55 * np.clip((t - 0.82) / 0.18, 0, 1) ** 1.5
    rnd = rng.random((ncourse, ncol, 2)).astype(F)
    tv = rnd[cr % ncourse, ci % ncol, capa.astype(np.int32)]
    base = lerp((0.50, 0.22, 0.12), (0.72, 0.37, 0.21), tv)
    canal = np.where(capa, 0.62 + 0.48 * hc ** 0.7, 0.72)
    dirt = 0.72 + 0.38 * fbm(S, S, 8, 8, 5)
    rgb = base * (canal * shadow * dirt * lam)[..., None]
    rgb = rgb * (0.93 + 0.07 * rng.random((S, S)).astype(F))[..., None]
    save("telha.jpg", rgb)
    save("telha_n.jpg", normal_from_height(hgt, 6.0), 95)


# ---------------------------------------------------------------- reboco / concreto
def tex_reboco():
    S = 512
    v = (0.90 + 0.13 * (fbm(S, S, 4, 4, 6) - 0.5) + 0.06 * (fbm(S, S, 32, 32, 3) - 0.5)
         + 0.04 * (rng.random((S, S)).astype(F) - 0.5))
    save("reboco.jpg", gray(v, (1.0, 0.985, 0.96)))


def tex_concreto():
    S = 512
    v = 0.66 + 0.20 * (fbm(S, S, 4, 4, 6) - 0.5) + 0.08 * (fbm(S, S, 48, 48, 2) - 0.5)
    v = v + 0.05 * (rng.random((S, S)).astype(F) - 0.5)
    v = np.where(rng.random((S, S)) > 0.992, v * 0.6, v)
    save("concreto.jpg", gray(v, (1.0, 0.99, 0.965)))


# ---------------------------------------------------------------- madeira / forro
def wood(h, w, rings, offset=None):
    yy, xx = np.mgrid[0:h, 0:w].astype(F)
    warp = fbm(h, w, 3, 12, 4)
    off = 0.0 if offset is None else offset
    g = 0.5 + 0.5 * np.sin(2 * np.pi * (xx / w * rings + warp * 4.0 + off))
    g = g ** 3
    fine = fbm(h, w, 4, 128, 3)
    t = np.clip(g * 0.75 + (fine - 0.5) * 0.5 + 0.1, 0, 1)
    return lerp((0.66, 0.40, 0.21), (0.44, 0.24, 0.11), t)


def tex_madeira():
    save("madeira.jpg", wood(512, 512, 14))


def tex_forro():
    S = 512; pw = 64
    yy, xx = np.mgrid[0:S, 0:S]
    plank = xx // pw
    off = rng.random(S // pw).astype(F)[plank] * 7.0
    rgb = wood(S, S, 22, off)
    tint = (0.86 + 0.18 * rng.random(S // pw).astype(F))[plank]
    rgb = rgb * tint[..., None]
    gap = (xx % pw) < 2
    rgb = np.where(gap[..., None], rgb * 0.35, rgb)
    save("forro.jpg", rgb)


# ---------------------------------------------------------------- pedra portuguesa (ondas)
def tex_pedra():
    S = 1024; N = 56                          # textura = 2 m x 2 m, pedras de ~3,5 cm
    d1, d2, idx, jit, cs = voronoi(S, N)
    cx = (np.arange(N)[None, :] + jit[..., 0]) / N
    cy = (np.arange(N)[:, None] + jit[..., 1]) / N
    wave = np.sin(2 * np.pi * (3 * cy + 0.22 * np.sin(2 * np.pi * 2 * cx)))
    black = (wave > 0.66).ravel()
    tone = rng.random(N * N).astype(F)
    is_b = black[idx]; tn = tone[idx]
    rgb = np.where(is_b[..., None], lerp((0.07, 0.07, 0.08), (0.20, 0.19, 0.19), tn),
                   lerp((0.72, 0.70, 0.66), (0.90, 0.88, 0.84), tn))
    dome = np.clip(1.0 - (d1 / (cs * 0.75)) ** 2, 0, 1)
    rgb = rgb * (0.80 + 0.20 * dome)[..., None]
    mortar = np.clip(((d2 - d1) - 0.8) / 1.6, 0, 1)
    grout = lerp((0.30, 0.29, 0.27), (0.42, 0.40, 0.37), fbm(S, S, 16, 16, 3))
    rgb = grout + (rgb - grout) * mortar[..., None]
    rgb = rgb * (0.80 + 0.25 * fbm(S, S, 4, 4, 5))[..., None]
    save("pedra_portuguesa.jpg", rgb)


# ---------------------------------------------------------------- asfalto
def tex_asfalto():
    S = 512
    v = (0.21 + 0.06 * (fbm(S, S, 4, 4, 6) - 0.5) + 0.08 * (rng.random((S, S)).astype(F) - 0.5)
         + 0.04 * (fbm(S, S, 64, 64, 2) - 0.5))
    v = np.where(rng.random((S, S)) > 0.97, v + 0.12, v)
    save("asfalto.jpg", gray(v, (1.0, 1.0, 1.02)))


# ---------------------------------------------------------------- piso ceramico / azulejo
def tiles(S, n, grout_px, c0, c1, gcol, marble=0.0):
    ts = S / n
    yy, xx = np.mgrid[0:S, 0:S].astype(F)
    ti = np.floor(xx / ts).astype(np.int32); tj = np.floor(yy / ts).astype(np.int32)
    fx = xx - ti * ts; fy = yy - tj * ts
    tone = rng.random((n, n)).astype(F)[tj % n, ti % n]
    rgb = lerp(c0, c1, tone)
    if marble:
        mb = fbm(S, S, 6, 6, 6)
        veins = np.abs(np.sin((xx + yy) / S * 8 * np.pi + mb * 7)) ** 0.35
        rgb = rgb * (1 - marble + marble * veins)[..., None]
    e = np.clip(np.minimum(np.minimum(fx, ts - fx), np.minimum(fy, ts - fy)) / 4.0, 0, 1)
    rgb = rgb * (0.90 + 0.10 * e)[..., None]
    grout = (fx < grout_px) | (fy < grout_px)
    return np.where(grout[..., None], np.asarray(gcol, F), rgb)


def tex_piso():
    save("piso_ceramico.jpg", tiles(512, 3, 2.0, (0.70, 0.64, 0.55), (0.83, 0.78, 0.69), (0.45, 0.42, 0.38), 0.12))


def tex_azulejo():
    save("azulejo.jpg", tiles(512, 6, 2.0, (0.88, 0.90, 0.89), (0.95, 0.96, 0.95), (0.66, 0.66, 0.63), 0.0))


# ---------------------------------------------------------------- folhagem / metal
def tex_folhas():
    S = 512
    d1, d2, idx, jit, cs = voronoi(S, 40, 0.9)
    tone = rng.random(40 * 40).astype(F)[idx]
    rgb = lerp((0.07, 0.17, 0.05), (0.30, 0.47, 0.13), tone)
    shade = np.clip(1.0 - d1 / (cs * 0.9), 0, 1)
    rgb = rgb * (0.55 + 0.55 * shade)[..., None]
    rgb = np.where(((d2 - d1) < 1.2)[..., None], rgb * 0.35, rgb)
    rgb = rgb * (0.75 + 0.35 * fbm(S, S, 4, 4, 4))[..., None]
    save("folhas.jpg", rgb)


def tex_metal():
    S = 256
    yy, xx = np.mgrid[0:S, 0:S].astype(F)
    ribs = 0.5 + 0.5 * np.sin(2 * np.pi * yy / S * 8)
    v = 0.52 + 0.28 * ribs
    v = v * (0.88 + 0.14 * fbm(S, S, 2, 32, 3))
    save("metal_ondulado.jpg", gray(v, (0.96, 0.98, 1.0)))


# ---------------------------------------------------------------- atlas das placas
def render_text(S, items):
    """items: (texto, x, y_centro, tamanho_px, negrito, alinhamento, largura_max). Origem top-left."""
    import gpu, blf
    off = gpu.types.GPUOffScreen(S, S)
    with off.bind():
        fb = gpu.state.active_framebuffer_get()
        fb.clear(color=(0.0, 0.0, 0.0, 1.0))
        with gpu.matrix.push_pop():
            gpu.matrix.load_matrix(Matrix.Identity(4))
            gpu.matrix.load_projection_matrix(Matrix(((2 / S, 0, 0, -1), (0, 2 / S, 0, -1), (0, 0, 1, 0), (0, 0, 0, 1))))
            for (txt, x, y, size, bold, align, maxw) in items:
                size = float(size)
                blf.size(0, size)
                tw, th = blf.dimensions(0, txt)
                while maxw and tw > maxw and size > 6:
                    size -= 1; blf.size(0, size); tw, th = blf.dimensions(0, txt)
                _, cap = blf.dimensions(0, "H")
                if align == 'C':
                    x = x - tw / 2
                elif align == 'R':
                    x = x - tw
                yb = S - y - cap / 2
                blf.color(0, 1, 1, 1, 1)
                offs = [(0, 0)] if not bold else [(0, 0), (1, 0), (0, 1), (1, 1)] + ([(2, 0), (2, 1)] if size > 40 else [])
                for ox, oy in offs:
                    blf.position(0, x + ox, yb + oy, 0)
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


def rect(A, x0, y0, x1, y1, color):
    A[y0:y1, x0:x1] = color


def tex_atlas():
    S = 1024
    A = np.zeros((S, S, 3), F)
    yy, xx = np.mgrid[0:S, 0:S].astype(F)
    grain = fbm(S, S, 16, 16, 4)
    Y, W, K = [], [], []           # textos amarelos, brancos, pretos

    # --- A: placa principal (vermelha, borda amarela)
    reg = A[0:256]
    reg[:] = lerp((0.50, 0.04, 0.03), (0.68, 0.08, 0.05), 1 - yy[0:256] / 256) * (0.92 + 0.1 * grain[0:256])[..., None]
    t, c = 22, (0.45, 0.03, 0.02)                       # filete escuro sob a borda amarela
    reg[:t, :] = c; reg[256 - t:, :] = c; reg[:, :t] = c; reg[:, S - t:] = c
    rect(A, 0, 0, S, 14, (0.95, 0.75, 0.10)); rect(A, 0, 242, S, 256, (0.95, 0.75, 0.10))
    rect(A, 0, 0, 14, 256, (0.95, 0.75, 0.10)); rect(A, S - 14, 0, S, 256, (0.95, 0.75, 0.10))
    Y.append(("BAR DA ESQUINA", 512, 105, 118, True, 'C', 940))
    W.append(("PETISCOS  \u2022  CHOPP GELADO  \u2022  SINUCA", 512, 200, 46, True, 'C', 900))

    # --- G: banner do palco do quintal (roxo)
    reg = A[768:1024]
    reg[:] = lerp((0.10, 0.03, 0.20), (0.26, 0.07, 0.40), 1 - (yy[768:1024] - 768) / 256) * (0.92 + 0.1 * grain[768:1024])[..., None]
    rect(A, 0, 768, S, 780, (0.95, 0.75, 0.10)); rect(A, 0, 1012, S, 1024, (0.95, 0.75, 0.10))
    rect(A, 0, 768, 12, 1024, (0.95, 0.75, 0.10)); rect(A, S - 12, 768, S, 1024, (0.95, 0.75, 0.10))
    Y.append(("M\u00daSICA AO VIVO", 512, 860, 104, True, 'C', 940))
    W.append(("SEXTA E S\u00c1BADO  \u2022  SAMBA, PAGODE E MPB", 512, 955, 42, True, 'C', 920))

    # --- B: TV com jogo de futebol
    x0, y0, x1, y1 = 0, 256, 512, 512
    stripes = ((xx[y0:y1, x0:x1] // 46) % 2).astype(F)
    A[y0:y1, x0:x1] = lerp((0.10, 0.42, 0.12), (0.14, 0.52, 0.16), stripes)
    L = (0.92, 0.95, 0.92)
    fx0, fy0, fx1, fy1 = 24, 284, 488, 496
    rect(A, fx0, fy0, fx1, fy0 + 3, L); rect(A, fx0, fy1 - 3, fx1, fy1, L)
    rect(A, fx0, fy0, fx0 + 3, fy1, L); rect(A, fx1 - 3, fy0, fx1, fy1, L)
    rect(A, 255, fy0, 258, fy1, L)
    d = np.hypot(xx - 256, yy - 390)
    A[(np.abs(d - 42) < 1.6) & (yy >= 256) & (yy < 512) & (xx < 512)] = L
    for bx0, bx1 in ((fx0, fx0 + 70), (fx1 - 70, fx1)):
        rect(A, bx0, 340, bx1, 343, L); rect(A, bx0, 437, bx1, 440, L)
        xb = bx1 - 3 if bx0 == fx0 else bx0
        rect(A, xb, 340, xb + 3, 440, L)
    prng = np.random.default_rng(7)
    for i in range(18):
        px = int(prng.uniform(40, 470)); py = int(prng.uniform(300, 480))
        c = (0.95, 0.85, 0.10) if i % 2 else (0.10, 0.25, 0.75)
        A[(np.hypot(xx - px, yy - py) < 5) & (yy >= 256) & (yy < 512) & (xx < 512)] = c
    A[(np.hypot(xx - 300, yy - 402) < 3.5) & (yy < 512) & (xx < 512)] = (1, 1, 1)
    rect(A, 14, 262, 196, 292, (0.05, 0.05, 0.08)); rect(A, 14, 262, 62, 292, (0.85, 0.1, 0.1))
    W.append(("AO VIVO", 38, 277, 14, True, 'C', 44))
    W.append(("BRA 2 x 1 ARG", 128, 277, 17, True, 'C', 124))

    # --- C: geladeira expositora (porta de vidro com bebidas)
    gx0, gy0 = 512, 256
    G = A[256:768, 512:768]
    G[:] = (0.03, 0.03, 0.035)
    rect(A, gx0 + 10, gy0 + 10, gx0 + 246, gy0 + 62, (0.70, 0.05, 0.05))
    W.append(("CERVEJA GELADA", gx0 + 128, gy0 + 36, 24, True, 'C', 220))
    iy0, iy1, ix0, ix1 = gy0 + 70, gy0 + 502, gx0 + 12, gx0 + 244
    tt = np.clip((yy[iy0:iy1, ix0:ix1] - iy0) / (iy1 - iy0), 0, 1)
    A[iy0:iy1, ix0:ix1] = lerp((0.55, 0.62, 0.70), (0.16, 0.20, 0.25), tt)
    shelves = [gy0 + 175, gy0 + 285, gy0 + 395, gy0 + 497]
    kinds = [('lata', [(0.78, 0.08, 0.06), (0.80, 0.80, 0.82)]),
             ('long', [(0.30, 0.14, 0.03), (0.06, 0.30, 0.08)]),
             ('lata', [(0.10, 0.25, 0.70), (0.85, 0.65, 0.10), (0.10, 0.45, 0.15)]),
             ('600', [(0.28, 0.12, 0.02)])]
    for sy, (kind, cols) in zip(shelves, kinds):
        rect(A, ix0, sy, ix1, sy + 5, (0.62, 0.64, 0.68))
        x = ix0 + 6; k = 0
        while True:
            w = {'lata': 24, 'long': 20, '600': 28}[kind]
            if x + w > ix1 - 4:
                break
            c = np.asarray(cols[k % len(cols)], F)
            if kind == 'lata':
                parts = [(x, sy - 52, x + w, sy)]
            elif kind == 'long':
                parts = [(x, sy - 56, x + w, sy), (x + 6, sy - 84, x + w - 6, sy - 56)]
            else:
                parts = [(x, sy - 62, x + w, sy), (x + 9, sy - 92, x + w - 9, sy - 62)]
            for (a0, b0, a1, b1) in parts:
                sx = np.arange(a0, a1, dtype=F)
                prof = 0.55 + 0.55 * np.sin(np.pi * (sx - a0 + 0.5) / (a1 - a0))
                A[b0:b1, a0:a1] = c * prof[None, :, None]
            if kind != 'lata':
                top = parts[-1]
                rect(A, top[0], top[1] - 4, top[2], top[1], (0.85, 0.70, 0.20))
            else:
                rect(A, x, sy - 52, x + w, sy - 49, (0.85, 0.85, 0.88))
            x += w + 4; k += 1
    refl = (((xx[256:768, 512:768] - 512) + (yy[256:768, 512:768] - 256) * 0.6) % 320) < 60
    G[refl] = G[refl] * 0.85 + 0.15
    G[:10, :] = (0.03, 0.03, 0.035); G[-10:, :] = (0.03, 0.03, 0.035)
    G[:, :10] = (0.03, 0.03, 0.035); G[:, -10:] = (0.03, 0.03, 0.035)
    rect(A, 512 + 228, 256 + 220, 512 + 236, 256 + 360, (0.55, 0.56, 0.58))   # puxador

    # --- D: cardapio (lousa)
    cx0, cy0 = 768, 256
    A[256:768, 768:1024] = lerp((0.08, 0.11, 0.10), (0.15, 0.19, 0.17), fbm(512, 256, 8, 4, 4))
    wd = (0.45, 0.28, 0.12)
    rect(A, 768, 256, 1024, 268, wd); rect(A, 768, 756, 1024, 768, wd)
    rect(A, 768, 256, 780, 768, wd); rect(A, 1012, 256, 1024, 768, wd)
    W.append(("CARD\u00c1PIO", cx0 + 128, cy0 + 42, 34, True, 'C', 220))
    rect(A, 800, cy0 + 66, 992, cy0 + 68, (0.8, 0.8, 0.75))
    menu = [("Por\u00e7\u00e3o de fritas", "25"), ("Calabresa acebolada", "32"), ("Frango a passarinho", "35"),
            ("Torresmo", "22"), ("Pastel (6 un.)", "20"), ("Mandioca frita", "24"),
            ("Cerveja 600 ml", "12"), ("Chopp", "9"), ("Refrigerante", "6"),
            ("Caipirinha", "15"), ("Dose de cacha\u00e7a", "5")]
    for i, (item, preco) in enumerate(menu):
        yc = cy0 + 100 + i * 36
        W.append((item, cx0 + 22, yc, 16, False, 'L', 165))
        Y.append(("R$ " + preco, cx0 + 236, yc, 16, True, 'R', 60))

    # --- E/F: placas de portas
    rect(A, 0, 512, 256, 640, (0.10, 0.28, 0.65)); rect(A, 256, 512, 512, 640, (0.72, 0.18, 0.38))
    W.append(("MASCULINO", 128, 576, 34, True, 'C', 230))
    W.append(("FEMININO", 384, 576, 34, True, 'C', 230))
    for (x0, y0, txt) in ((0, 640, "COZINHA"), (256, 640, "ESCRIT\u00d3RIO"), (0, 704, "DEP\u00d3SITO"), (256, 704, "LAVABO")):
        rect(A, x0, y0, x0 + 256, y0 + 64, (0.88, 0.88, 0.84))
        rect(A, x0 + 4, y0 + 4, x0 + 252, y0 + 6, (0.2, 0.2, 0.2)); rect(A, x0 + 4, y0 + 58, x0 + 252, y0 + 60, (0.2, 0.2, 0.2))
        K.append((txt, x0 + 128, y0 + 32, 26, True, 'C', 230))

    paint(A, render_text(S, Y), (1.0, 0.82, 0.15))
    paint(A, render_text(S, W), (0.97, 0.97, 0.95))
    paint(A, render_text(S, K), (0.08, 0.08, 0.08))
    save("atlas_placas.jpg", A, 92)


def save_png(name, rgba):
    """RGBA (top-down) -> PNG com alfa."""
    h, w = rgba.shape[:2]
    a = np.ascontiguousarray(np.clip(rgba, 0, 1)[::-1]).astype(F)
    old = bpy.data.images.get(name)
    if old is not None:
        old.name = name + "_old"
    tmp = bpy.data.images.new(name + "_gen", w, h, alpha=True)
    tmp.pixels.foreach_set(a.ravel())
    path = os.path.join(B.TEX_DIR, name)
    tmp.filepath_raw = path
    tmp.file_format = 'PNG'
    tmp.save()
    bpy.data.images.remove(tmp)
    img = bpy.data.images.load(path)
    img.name = name
    img.alpha_mode = 'STRAIGHT'
    if old is not None:
        old.user_remap(img)
        bpy.data.images.remove(old)
    return img


def vnoise_wrapx(h, w, cy, cx):
    return vnoise(h, w, cy, cx)        # ja e periodico nas duas direcoes


# ---------------------------------------------------------------- grama / terra batida / ipe
def tex_grama():
    S = 512
    n1 = fbm(S, S, 8, 8, 5); n2 = rng.random((S, S)).astype(F)
    blades = 0.5 + 0.5 * np.sin(np.mgrid[0:S, 0:S][1] * 0.9 + fbm(S, S, 64, 16, 2) * 9)
    t = np.clip(0.45 * n1 + 0.25 * n2 + 0.3 * blades, 0, 1)
    rgb = lerp((0.16, 0.30, 0.07), (0.36, 0.52, 0.16), t)
    rgb = rgb * (0.85 + 0.25 * fbm(S, S, 3, 3, 4))[..., None]
    rgb = np.where((fbm(S, S, 6, 6, 4) > 0.68)[..., None], rgb * 0.75 + np.array((0.12, 0.1, 0.05), F), rgb)
    save("grama.jpg", rgb)


def tex_terra():
    S = 512
    n = fbm(S, S, 4, 4, 6); p = rng.random((S, S)).astype(F)
    rgb = lerp((0.42, 0.28, 0.17), (0.62, 0.45, 0.30), np.clip(n * 0.8 + p * 0.2, 0, 1))
    rgb = np.where((p > 0.985)[..., None], rgb * 0.6, rgb)
    save("terra_batida.jpg", rgb)


def tex_ipe():
    S = 512
    d1, d2, idx, jit, cs = voronoi(S, 48, 0.9)
    tone = rng.random(48 * 48).astype(F)[idx]
    flor = lerp((0.62, 0.20, 0.45), (0.92, 0.48, 0.72), tone)
    folha = lerp((0.10, 0.22, 0.07), (0.25, 0.40, 0.12), tone)
    rgb = np.where((rng.random(48 * 48)[idx] < 0.18)[..., None], folha, flor)
    shade = np.clip(1.0 - d1 / (cs * 0.9), 0, 1)
    rgb = rgb * (0.55 + 0.55 * shade)[..., None]
    rgb = np.where(((d2 - d1) < 1.2)[..., None], rgb * 0.4, rgb)
    save("folhas_ipe.jpg", rgb * (0.8 + 0.3 * fbm(S, S, 4, 4, 4))[..., None])


# ---------------------------------------------------------------- brasas (emissivo do carrinho de espeto)
def tex_brasa():
    S = 256
    d1, d2, idx, jit, cs = voronoi(S, 14, 0.9)
    calor = rng.random(14 * 14).astype(F)[idx]
    centro = np.clip(1.0 - d1 / (cs * 0.75), 0, 1)
    t = np.clip(calor * 0.7 + centro * 0.5, 0, 1)
    rgb = lerp((0.25, 0.03, 0.0), (1.0, 0.55, 0.12), t ** 1.4)
    rgb = np.where(((d2 - d1) < 1.6)[..., None], np.array((0.04, 0.02, 0.02), F), rgb)        # carvao entre as brasas
    save("brasa.jpg", rgb * (0.8 + 0.3 * fbm(S, S, 4, 4, 3))[..., None])


# ---------------------------------------------------------------- sombra de contato (blob + faixa de AO)
def tex_sombra():
    W, H = 256, 128
    yy, xx = np.mgrid[0:H, 0:W].astype(F)
    rgba = np.zeros((H, W, 4), F)
    rgba[..., :3] = 1.0
    r = np.hypot((xx[:, :128] - 64) / 62, (yy[:, :128] - 64) / 62)
    rgba[:, :128, 3] = np.clip(1 - r, 0, 1) ** 1.6 * 0.85
    t = (xx[:, 128:] - 128) / 127
    rgba[:, 128:, 3] = (1 - np.clip(t, 0, 1)) ** 2.2 * 0.6
    save_png("sombra_contato.png", rgba)


# ---------------------------------------------------------------- favela/casario (para morros e panorama)
def casario(h, w, dens, haze, seed=0):
    rr = np.random.default_rng(seed)
    out = np.zeros((h, w, 3), F)
    mask = np.zeros((h, w), F)
    cores = np.array([(0.85, 0.80, 0.72), (0.80, 0.52, 0.36), (0.88, 0.70, 0.55), (0.70, 0.72, 0.75),
                      (0.90, 0.88, 0.82), (0.72, 0.42, 0.30), (0.78, 0.66, 0.50)], F)
    for _ in range(int(dens * w * h / 60)):
        x, y = rr.integers(0, w), rr.integers(0, h)
        bw, bh = rr.integers(3, 9), rr.integers(3, 7)
        c = cores[rr.integers(0, len(cores))] * rr.uniform(0.75, 1.05)
        out[y:y + bh, x:x + bw] = c
        out[y:y + 1, x:x + bw] = c * 0.6
        if rr.random() < 0.5:
            out[y + 1:y + 2, x + 1:x + 2] = (0.12, 0.12, 0.14)
        mask[y:y + bh, x:x + bw] = 1.0
    return out * (1 - haze) + haze * np.array((0.75, 0.80, 0.86), F), mask


def tex_morro():
    H, W = 512, 1024
    base = lerp((0.24, 0.34, 0.20), (0.40, 0.48, 0.30), fbm(H, W, 4, 8, 5))
    cas, m = casario(H, W, 1.1, 0.18, seed=4)
    dens = np.clip((fbm(H, W, 3, 6, 4) - 0.35) * 3, 0, 1)
    rgb = base * (1 - m * dens)[..., None] + cas * (m * dens)[..., None]
    haze = np.array((0.70, 0.77, 0.84), F)
    save("morro.jpg", rgb * 0.72 + haze * 0.28)


def tex_predios_dist():
    S = 512
    rgb = lerp((0.62, 0.64, 0.66), (0.78, 0.78, 0.77), fbm(S, S, 2, 2, 3))
    yy, xx = np.mgrid[0:S, 0:S]
    win = ((xx % 32) > 8) & ((xx % 32) < 26) & ((yy % 32) > 10) & ((yy % 32) < 24)
    tone = rng.random((S // 32 + 1, S // 32 + 1)).astype(F)[yy // 32, xx // 32]
    wcol = lerp((0.22, 0.28, 0.36), (0.55, 0.62, 0.70), tone)
    rgb = np.where(win[..., None], wcol, rgb)
    rgb = np.where(((yy % 128) < 4)[..., None], rgb * 0.8, rgb)
    haze = np.array((0.72, 0.78, 0.86), F)
    save("predios_distantes.jpg", rgb * 0.7 + haze * 0.3)


# ---------------------------------------------------------------- panorama 360 (ceu + nuvens + montanhas + morros + cidade)
def tex_panorama():
    H, W = 1024, 4096
    HR = 842                                         # linha do horizonte (altura do olho)
    yy, xx = np.mgrid[0:H, 0:W].astype(F)
    t = np.clip(yy / HR, 0, 1)
    ceu = lerp((0.30, 0.52, 0.84), (0.80, 0.86, 0.93), t ** 1.6)
    chao = np.array((0.60, 0.62, 0.60), F)
    img = np.where((yy < HR)[..., None], ceu, chao)
    # nuvens (mais achatadas perto do horizonte)
    nv = fbm(H, W, 6, 24, 6)
    nv2 = fbm(H, W, 3, 12, 4)
    banda = np.clip(1 - np.abs(yy - 430) / 360, 0, 1)
    c = np.clip((nv * 0.65 + nv2 * 0.35 - 0.52) * 4.0, 0, 1) * banda
    sombra_n = np.clip((np.roll(nv, -6, 0) - nv) * 6, 0, 1)
    cor_n = lerp((1.0, 1.0, 1.0), (0.78, 0.80, 0.86), sombra_n)
    img = img * (1 - c[..., None]) + cor_n * c[..., None]
    # perfis (periodicos em x)
    def perfil(cx, amp, base_, seed):
        r1 = np.random.default_rng(seed).random(cx)
        x = np.arange(W) * cx / W
        i0 = np.floor(x).astype(int) % cx; i1 = (i0 + 1) % cx; f = x - np.floor(x)
        f = f * f * (3 - 2 * f)
        return base_ + amp * (r1[i0] * (1 - f) + r1[i1] * f)
    m1 = perfil(14, 120, 50, 1) + perfil(60, 25, 0, 2)
    m2 = perfil(26, 70, 20, 3) + perfil(110, 12, 0, 4)
    serra = (yy > (HR - m1)[None, :]) & (yy < HR)
    img = np.where(serra[..., None], lerp((0.55, 0.64, 0.76), (0.66, 0.73, 0.82), (yy - (HR - m1)) / 120.0) * np.ones(1, F), img)
    cas, mk = casario(H, W, 1.4, 0.35, seed=8)
    morro = (yy > (HR - m2)[None, :]) & (yy < HR)
    verde = lerp((0.42, 0.52, 0.50), (0.55, 0.62, 0.62), fbm(H, W, 8, 32, 4))
    dens = np.clip((fbm(H, W, 4, 16, 3) - 0.3) * 3, 0, 1) * mk
    mor = verde * (1 - dens[..., None]) + cas * dens[..., None]
    img = np.where(morro[..., None], mor * 0.78 + np.array((0.72, 0.78, 0.85), F) * 0.22, img)
    # cidade no horizonte
    rr = np.random.default_rng(12)
    x = 0
    while x < W:
        bw = int(rr.integers(10, 46)); bh = int(rr.integers(8, 70) * (1.6 if rr.random() < 0.08 else 1.0))
        col = np.array((0.60, 0.64, 0.70), F) * rr.uniform(0.85, 1.08)
        img[HR - bh:HR, x:x + bw] = col
        for wy in range(HR - bh + 3, HR - 2, 5):
            img[wy:wy + 2, x + 2:x + bw - 2:4] = col * 0.82
        x += bw + int(rr.integers(0, 6))
    neb = np.clip(1 - np.abs(yy - HR) / 140, 0, 1) ** 2 * 0.45                     # neblina no horizonte
    img = img * (1 - neb[..., None]) + np.array((0.82, 0.86, 0.90), F) * neb[..., None]
    save("panorama.jpg", img, 88)


# ---------------------------------------------------------------- atlas do bairro (janelas, portas, placas de comercio e de rua)
def tex_atlas_bairro():
    S = 1024
    A = np.zeros((S, S, 3), F)
    yy, xx = np.mgrid[0:S, 0:S].astype(F)
    Y, W_, K = [], [], []
    # janelas 128x128
    for k in range(4):
        x0 = k * 128
        R = A[0:128, x0:x0 + 128]
        fr = (0.92, 0.92, 0.9) if k != 2 else (0.35, 0.22, 0.12)
        R[:] = fr
        gl = lerp((0.30, 0.42, 0.52), (0.62, 0.72, 0.80), 1 - yy[0:128, 0:128] / 128)
        refl = ((xx[0:128, 0:128] + yy[0:128, 0:128] * 0.7) % 90) < 22
        gl = np.where(refl[..., None], gl * 0.8 + 0.2, gl)
        R[10:118, 10:118] = gl[10:118, 10:118]
        R[10:118, 62:66] = fr
        if k == 1:                                   # cortina
            R[14:114, 14:50] = lerp((0.85, 0.75, 0.55), (0.95, 0.88, 0.70), (xx[14:114, 14:50] % 8) / 8)
        if k == 3:                                   # grade de ferro
            for gx in range(18, 118, 14):
                R[10:118, gx:gx + 3] = (0.12, 0.12, 0.12)
            R[60:63, 10:118] = (0.12, 0.12, 0.12)
    # porta de madeira 128x256 e porta de ferro/vidro
    R = A[0:256, 512:640]
    R[:] = lerp((0.42, 0.24, 0.12), (0.30, 0.16, 0.08), fbm(256, 128, 8, 2, 3))
    for (a, b_) in ((20, 110), (130, 236)):
        R[a:b_, 16:112] = R[a:b_, 16:112] * 0.8
    R[120:132, 96:108] = (0.8, 0.7, 0.3)
    R = A[0:256, 640:768]
    R[:] = (0.18, 0.20, 0.22)
    R[12:244, 12:116] = lerp((0.35, 0.45, 0.55), (0.6, 0.68, 0.75), 1 - yy[0:232, 0:104] / 232)
    for gx in range(20, 116, 12):
        R[12:244, gx:gx + 2] = (0.1, 0.1, 0.1)
    # portao de garagem 256x256
    R = A[0:256, 768:1024]
    R[:] = (0.20, 0.30, 0.24)
    for gx in range(0, 256, 16):
        R[:, gx:gx + 4] = (0.12, 0.2, 0.15)
    R[120:128, :] = (0.1, 0.15, 0.12)
    # placas de comercio 512x128
    placas = [((0, 256), "PADARIA PÃO QUENTE", (0.75, 0.40, 0.08), Y), ((512, 256), "FARMÁCIA POPULAR", (0.05, 0.50, 0.25), W_),
              ((0, 384), "MERCADINHO DO BAIRRO", (0.10, 0.25, 0.60), Y), ((512, 384), "AÇOUGUE BOI GORDO", (0.65, 0.06, 0.06), W_),
              ((0, 512), "OFICINA MECÂNICA", (0.95, 0.75, 0.05), K), ((512, 512), "LAVA-RÁPIDO", (0.05, 0.55, 0.70), W_),
              ((0, 768), "BAR DO ZÉ", (0.15, 0.15, 0.15), Y)]
    for (x0, y0), txt, cor, lst in placas:
        A[y0:y0 + 128, x0:x0 + 512] = np.asarray(cor, F) * (0.9 + 0.1 * fbm(128, 512, 2, 8, 2))[..., None]
        A[y0:y0 + 6, x0:x0 + 512] = (0.95, 0.95, 0.92); A[y0 + 122:y0 + 128, x0:x0 + 512] = (0.95, 0.95, 0.92)
        lst.append((txt, x0 + 256, y0 + 64, 56, True, 'C', 480))
    A[640:768, 0:1024] = (0.10, 0.28, 0.62)
    A[640:648, :] = (1, 1, 1); A[760:768, :] = (1, 1, 1)
    W_.append(("ESCOLA ESTADUAL PROF. ANTÔNIO CARLOS", 512, 704, 58, True, 'C', 980))
    # placas de rua 256x64
    for (x0, y0), nm in (((512, 768), "R. DAS FLORES"), ((768, 768), "R. SÃO JOSÉ"), ((512, 832), "AV. BRASIL"), ((768, 832), "R. DA PAZ")):
        A[y0:y0 + 64, x0:x0 + 256] = (0.08, 0.22, 0.55)
        A[y0 + 4:y0 + 6, x0 + 4:x0 + 252] = (1, 1, 1); A[y0 + 58:y0 + 60, x0 + 4:x0 + 252] = (1, 1, 1)
        W_.append((nm, x0 + 128, y0 + 32, 28, True, 'C', 236))
    A[896:1024, 0:256] = (0.05, 0.30, 0.65)
    W_.append(("ÔNIBUS", 128, 960, 46, True, 'C', 230))
    d = ((xx[896:1024, 256:512] + yy[896:1024, 256:512]) // 32) % 2
    A[896:1024, 256:512] = np.where(d[..., None] == 0, np.array((0.85, 0.08, 0.06), F), np.array((0.95, 0.95, 0.95), F))
    A[896:1024, 512:768] = (0.90, 0.75, 0.10)
    K.append(("BANCA", 640, 940, 44, True, 'C', 230)); K.append(("JORNAIS • REVISTAS", 640, 990, 20, True, 'C', 230))
    A[896:1024, 768:1024] = (0.32, 0.24, 0.16)
    Y.append(("PRAÇA DA", 896, 935, 30, True, 'C', 230)); Y.append(("MATRIZ", 896, 985, 44, True, 'C', 230))
    paint(A, render_text(S, Y), (1.0, 0.85, 0.2))
    paint(A, render_text(S, W_), (0.97, 0.97, 0.95))
    paint(A, render_text(S, K), (0.08, 0.08, 0.08))
    save("atlas_bairro.jpg", A, 92)


import sys
SO_NOVAS = globals().get("SO_NOVAS", False)
import time
t0 = time.time()
base = [] if SO_NOVAS else [tex_tijolo, tex_telha, tex_reboco, tex_concreto, tex_madeira, tex_forro, tex_pedra,
                            tex_asfalto, tex_piso, tex_azulejo, tex_folhas, tex_metal, tex_atlas]
novas = [tex_grama, tex_terra, tex_ipe, tex_sombra, tex_morro, tex_predios_dist, tex_panorama, tex_atlas_bairro, tex_brasa]
SO_TEX = globals().get("SO_TEX")                      # opcional: gerar so algumas (ex.: {"tex_brasa"})
for fn in base + novas:
    if SO_TEX and fn.__name__ not in SO_TEX:
        continue
    fn()
print("texturas ok em %.1fs:" % (time.time() - t0), sorted(os.listdir(B.TEX_DIR)))
