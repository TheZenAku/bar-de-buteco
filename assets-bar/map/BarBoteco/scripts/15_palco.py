# Palco do quintal (musica ao vivo), refeito:
#   estrutura de trelica de aluminio Q30 (4 torres + quadro no topo) com cobertura de lona em arco e testeira com a logo,
#   telao de LED 16:9 pendurado na trelica do fundo, PA (sub + caixa no pedestal), retornos, backline (bateria, amp de
#   guitarra, rig de baixo), violao e cavaquinho nos suportes, pandeiro, case com mesa de som, pedestais com o microfone
#   virado para o musico, refletores, cabos e tapete.
# No mapa:
#   Palco (colecao)        parte estatica (o 08_export.py junta no lote Bar_Mobilia)
#   Telao_Tela             (Interativos_Bar: no proprio no glTF) plano 16:9 de 5,76 x 3,24 m com origem no centro, virado
#                          para a plateia (-Y no Blender = +Z local no three.js), UV 0..1 na tela inteira.
#                          extras: interativo = "telao", largura_m, altura_m, proporcao, resolucao
#   Palco_FX_Luz           (Interativos_Bar) lentes dos refletores coloridos + fita de LED da borda, material Palco_Luz:
#                          o jogo troca a cor mudando material.emissive
#   Luz_Palco              (Iluminacao, criada no 07) vira a luz branca de frente; Luz_Palco_Cor = contraluz colorida
#   Palco_Violao, Palco_Cavaquinho, Palco_Baquetas
#                          (Interativos_Bar) instrumentos soltos dos suportes: o jogo esconde enquanto alguem toca
#                          (as animacoes do 16_animacoes_palco.py trazem a copia que vai para a mao)
#   Palco_Lugar_Violao / _Cavaquinho / _Bateria / _Vocal
#                          (Interativos_Bar) vazios no piso do palco: onde o personagem fica em pe no comeco e no fim das
#                          animacoes de cada lugar, de frente para -Y local (+Z no three.js). extras: lugar, animacoes, clipes
# Grava anim/palco_ref.blend (palco + soltos + lugares) para o 16_animacoes_palco.py.
# Texturas geradas em B.TEX_DIR: telao_highland.jpg (tela em espera), palco_testeira.jpg, palco_grade.jpg,
# palco_tecido.jpg, palco_tapete.jpg (usa as funcoes de imagem do 13_fachada.py).
# Rodar depois do 04_predio.py, 06_interior.py e 07_exterior.py (recriam predio, mobilia e luzes).
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix

DIR = r"C:\Users\rafael\BarBoteco\scripts"
if DIR not in sys.path:
    sys.path.insert(0, DIR)
import barlib as B

with open(os.path.join(DIR, "13_fachada.py"), encoding="utf-8") as f:
    _src = f.read()
IM = {}
exec(compile(_src.split("\n# ------------------------------------------------------------------ 1)")[0], "13_fachada.py", "exec"), IM)

COL, INTB, LUZ, QT = "Palco", "Interativos_Bar", "Iluminacao", "Quintal_Mobiliario"
ZP = B.Z_PISO
ZS = ZP + 0.6                                   # piso do palco
PX0, PX1, PY0, PY1 = 21.5, 31.8, 21.6, 25.8     # tablado (encostado nos muros leste e norte)
XC = (PX0 + PX1) / 2
TQ = 0.29                                       # trelica Q30: lado
TX0, TX1, TY0, TY1 = 21.8, 31.5, 21.9, 25.5     # eixos das 4 torres
ZT0 = 5.30                                      # base do quadro de trelica do topo
ZT1 = ZT0 + TQ
CORDA = TQ / 2 - 0.024                          # distancia do eixo da trelica ao eixo de cada banzo
NX, NY, GAB_W, GAB_H = 9, 9, 0.64, 0.36         # telao: 9 x 9 gabinetes de 640 x 360 mm = 5,76 x 3,24 m (16:9)
TEL_W, TEL_H = NX * GAB_W, NY * GAB_H
TEL_Y, TEL_Z1 = 25.30, 5.10                     # face da tela / topo
TEL_Z0 = TEL_Z1 - TEL_H
COR_FX = (1.0, 0.06, 0.55)                      # magenta da logo (linear): cor inicial das lentes e da contraluz
AL, ESC, CR, BOR = "Aluminio_Trelica", "Metal_Escuro", "Cromado", "Borracha_Preta"
F = np.float32


# ------------------------------------------------------------------ texturas
def com_logo(rgb, px, x0, y0, halo=30):
    H, W = rgb.shape[:2]
    lg = IM["logo_rgba"](px)
    a = np.zeros((H, W), F)
    a[y0:y0 + px, x0:x0 + px] = lg[..., 3]
    rgb = rgb + np.asarray(IM["MAGENTA"], F) * (IM["borrar"](a, halo) * 0.8)[..., None] * (1 - a)[..., None]
    c = np.zeros((H, W, 3), F)
    c[y0:y0 + px, x0:x0 + px] = lg[..., :3]
    return rgb * (1 - a[..., None]) + c * a[..., None]


def neon_quente(rgb, m, y0, y1):
    """Letras em neon amarelo -> laranja (como o "BAR" da logo), degrade entre as linhas y0 e y1."""
    gy = np.clip((np.arange(rgb.shape[0], dtype=F) - y0) / max(y1 - y0, 1), 0, 1)[:, None, None]
    q = np.asarray(IM["AMARELO"], F) * (1 - gy) + np.asarray(IM["LARANJA"], F) * gy
    rgb = rgb + q * (IM["borrar"](m, 6) * 0.85 + IM["borrar"](m, 24) * 0.6)[..., None]
    return rgb * (1 - m[..., None]) + (q * 0.5 + 0.5) * m[..., None]


def ruido(H, W, r, seed):
    g = np.random.default_rng(seed).random((H, W)).astype(F)
    g = IM["borrar"](g, r)
    return (g - g.min()) / max(float(g.max() - g.min()), 1e-6)


def texturas():
    rr = IM["retangulo_arredondado"]
    # telao em espera (2048 x 1152 = 16:9)
    W, H = 2048, 1152
    rgb = IM["fundo"](H, W)
    rgb = IM["neon"](rgb, rr(H, W, 30, 30, W - 30, H - 30, 46, 8), IM["MAGENTA"], halo=0.8)
    rgb = IM["neon"](rgb, rr(H, W, 56, 56, W - 56, H - 56, 30, 4), IM["CIANO"], halo=0.6, r1=4, r2=12)
    rgb = com_logo(rgb, 690, (W - 690) // 2, 76)
    g = IM["textos"](W, H, [("M\u00daSICA AO VIVO", IM["FONTE_FORTE"], W / 2, 898, 196, 1500, 10)])
    rgb = neon_quente(rgb, g, 830, 966)
    p = IM["textos"](W, H, [("SEXTA E S\u00c1BADO  \u2022  SAMBA, PAGODE E MPB", IM["FONTE_LEVE"], W / 2, 1036, 62, 1500, 8)])
    rgb = IM["neon"](rgb, p, IM["CIANO"], halo=0.8, r1=4, r2=14)
    IM["salvar"]("telao_highland.jpg", rgb)
    # testeira (placa em cima da trelica da frente, 6,4 x 0,8 m)
    W, H = 2048, 256
    rgb = IM["fundo"](H, W)
    rgb = IM["neon"](rgb, rr(H, W, 10, 10, W - 10, H - 10, 26, 6), IM["MAGENTA"], halo=0.9, r1=4, r2=14)
    rgb = com_logo(rgb, 236, (W - 236) // 2, 10, halo=14)
    xe, xd = (W - 236) / 4 + 12, W - (W - 236) / 4 - 12
    g = IM["textos"](W, H, [("M\u00daSICA AO VIVO", IM["FONTE_FORTE"], xe, 128, 116, 760, 5)])
    rgb = neon_quente(rgb, g, 76, 180)
    c = IM["textos"](W, H, [("SAMBA \u2022 PAGODE \u2022 MPB", IM["FONTE_FORTE"], xd, 128, 116, 760, 5)])
    rgb = IM["neon"](rgb, c, IM["CIANO"], halo=0.9, r1=5, r2=18)
    IM["salvar"]("palco_testeira.jpg", rgb)
    # grade de chapa perfurada das caixas (repete a cada 25 cm: furos de 11 mm em passo de 16 mm, fileiras alternadas)
    n, ps = 256, 16.0
    yy, xx = np.mgrid[0:n, 0:n].astype(F) + 0.5
    lin = np.floor(yy / ps)
    off = (lin % 2) * ps / 2
    cx = (np.floor((xx - off) / ps) + 0.5) * ps + off
    furo = np.clip(5.4 - np.hypot(xx - cx, yy - (lin + 0.5) * ps) + 0.5, 0, 1)
    metal = 0.20 + 0.04 * ruido(n, n, 3, 1)
    v = metal * (1 - furo) + 0.012 * furo
    IM["salvar"]("palco_grade.jpg", np.dstack([v, v, v * 1.03]))
    # tela de amplificador (preta com fios prateados, repete a cada 12 cm)
    fio_h = 0.5 + 0.5 * np.cos(2 * np.pi * yy / 4)
    fio_v = 0.5 + 0.5 * np.cos(2 * np.pi * xx / 4)
    trama = np.where(((xx // 4 + yy // 4) % 2) == 0, fio_h, fio_v)
    faixa = 0.5 + 0.5 * np.sin(2 * np.pi * (xx + yy) / 32)
    v = 0.035 + 0.16 * trama * (0.55 + 0.45 * faixa) + 0.02 * ruido(n, n, 1, 2)
    IM["salvar"]("palco_tecido.jpg", np.dstack([v, v, v * 1.05]))
    # tapete persa da bateria (2,1 x 1,6 m)
    H, W = 768, 1024
    yy, xx = np.mgrid[0:H, 0:W].astype(F) + 0.5
    rgb = np.zeros((H, W, 3), F) + np.asarray((0.40, 0.055, 0.065), F)
    rgb *= (0.82 + 0.25 * ruido(H, W, 2, 3))[..., None]
    borda = np.minimum(np.minimum(xx, W - xx), np.minimum(yy, H - yy))
    azul, bege = np.asarray((0.07, 0.08, 0.20), F), np.asarray((0.78, 0.66, 0.45), F)

    def pinta(rgb, m, cor):
        return rgb * (1 - m[..., None]) + cor * m[..., None]
    faixa = (borda > 22) & (borda < 92)
    rgb = pinta(rgb, faixa.astype(F), azul)
    for b0 in (22, 92, 104):
        rgb = pinta(rgb, np.clip(3.0 - np.abs(borda - b0), 0, 1), bege)
    ao_longo = np.where(np.minimum(yy, H - yy) < np.minimum(xx, W - xx), xx, yy)    # coordenada ao longo da faixa
    los = np.abs(((ao_longo % 46) - 23)) + np.abs(borda - 57)                        # losangos na faixa
    rgb = pinta(rgb, (np.clip(22 - los, 0, 1) * faixa).astype(F), bege * 0.85)
    rgb = pinta(rgb, (np.clip(12 - los, 0, 1) * faixa).astype(F), np.asarray((0.45, 0.06, 0.07), F))
    cxm, cym = W / 2, H / 2
    med = np.abs(xx - cxm) / 300 + np.abs(yy - cym) / 210
    rgb = pinta(rgb, np.clip((1 - med) * 120, 0, 1), azul)
    rgb = pinta(rgb, np.clip(3.0 - np.abs(med - 1) * 300, 0, 1), bege)
    rgb = pinta(rgb, np.clip((0.55 - med) * 120, 0, 1), np.asarray((0.50, 0.07, 0.08), F))
    rgb = pinta(rgb, np.clip(2.5 - np.abs(med - 0.55) * 300, 0, 1), bege)
    rgb = pinta(rgb, np.clip((0.18 - med) * 120, 0, 1), bege * 0.9)
    for (qx, qy) in ((104, 104), (W - 104, 104), (104, H - 104), (W - 104, H - 104)):
        q = np.abs(xx - qx) / 150 + np.abs(yy - qy) / 110
        rgb = pinta(rgb, np.clip((1 - q) * 120, 0, 1) * (borda > 104), azul)
        rgb = pinta(rgb, np.clip(2.5 - np.abs(q - 1) * 150, 0, 1) * (borda > 104), bege)
    IM["salvar"]("palco_tapete.jpg", rgb * (0.9 + 0.1 * ruido(H, W, 1, 4))[..., None])


def materiais():
    B.material(AL, color=(0.78, 0.79, 0.81), rough=0.3, metal=1.0)
    B.material(CR, color=(0.92, 0.92, 0.94), rough=0.12, metal=1.0)
    B.material("Lona_Palco", color=(0.035, 0.036, 0.04), rough=0.7, double=True)
    B.material("Saia_Palco", color=(0.012, 0.012, 0.014), rough=0.95)
    B.material("Piso_Palco", color=(0.40, 0.34, 0.30), tex="madeira.jpg", tile=(1.2, 1.2), rough=0.55)
    B.material("Gabinete_Caixa", color=(0.028, 0.028, 0.03), rough=0.75)
    B.material("Grade_Caixa", tex="palco_grade.jpg", tile=(0.25, 0.25), rough=0.5, metal=0.6)
    B.material("Grade_Mic", color=(0.55, 0.56, 0.58), rough=0.45, metal=0.9)
    B.material("Tolex", color=(0.03, 0.03, 0.03), rough=0.8)
    B.material("Tecido_Amp", tex="palco_tecido.jpg", tile=(0.12, 0.12), rough=0.9)
    B.material("Casco_Bateria", color=(0.30, 0.012, 0.022), rough=0.15, metal=0.45)
    B.material("Pele_Bateria", color=(0.86, 0.84, 0.78), rough=0.6)
    pb = B.material("Pele_Bumbo", tex="letreiro_highland.jpg", rough=0.45)
    for nd in pb.node_tree.nodes:
        if nd.type == 'TEX_IMAGE':
            nd.extension = 'EXTEND'                     # fora do quadro da logo repete a borda escura
    B.material("Prato_Bronze", color=(0.80, 0.58, 0.28), rough=0.25, metal=1.0, double=True)
    B.material("Madeira_Violao", color=(0.62, 0.33, 0.11), rough=0.22)
    B.material("Madeira_Baqueta", color=(0.70, 0.50, 0.29), rough=0.45)
    B.material("Cortina_Palco", color=(0.008, 0.008, 0.01), rough=0.95, double=True)
    B.material("Madeira_Jacaranda", color=(0.16, 0.06, 0.03), rough=0.25)
    B.material("Tapete_Palco", tex="palco_tapete.jpg", rough=0.95)
    B.material("Telao_Gabinete", color=(0.05, 0.05, 0.055), rough=0.5, metal=0.6)
    B.material("Telao_Tela", color=(0.05, 0.05, 0.05), tex="telao_highland.jpg", rough=0.35, emis_tex=True, emis_str=1.0)
    B.material("Placa_Palco", color=(0.2, 0.2, 0.2), tex="palco_testeira.jpg", rough=0.3, emis_tex=True, emis_str=0.85)
    B.material("Palco_Luz", color=(0.08, 0.08, 0.08), rough=0.3, emis=COR_FX, emis_str=4.0)
    B.material("Cabo_Palco", color=(0.015, 0.015, 0.017), rough=0.55)
    B.material("Cinta_Carga", color=(0.55, 0.05, 0.04), rough=0.8)
    B.material("Visor_Mesa", color=(0.02, 0.05, 0.08), rough=0.2, emis=(0.10, 0.45, 0.9), emis_str=1.5)
    for nm in ("telao_highland.jpg", "palco_testeira.jpg", "palco_grade.jpg", "palco_tecido.jpg", "palco_tapete.jpg"):
        im = bpy.data.images[nm]
        if im.packed_file is not None:
            im.unpack(method='REMOVE')
            im = bpy.data.images[nm]
        im.reload()
        im.pack()


# ------------------------------------------------------------------ geometria
def Rm(loc=(0, 0, 0), rz=0.0, rx=0.0, ry=0.0):
    return B.mat_rz(loc, rz, rx, ry)


def tubo(m, M, p0, p1, r, mat, segs=10, caps=(False, False)):
    m.tube(M @ Vector(p0), M @ Vector(p1), r, mat, segs=segs, caps=caps)


def para(a):
    """Matriz que leva o Z local para a direcao a."""
    return Vector((0, 0, 1)).rotation_difference(Vector(a).normalized()).to_matrix().to_4x4()


def _lado(n):
    ax = max(range(3), key=lambda i: abs(n[i]))
    return ("px", "py", "pz")[ax] if n[ax] > 0 else ("nx", "ny", "nz")[ax]


_PECA = [0]


def _acabar(m, M, vs, mat, r, mats):
    """Material por lado e chanfro. Devolve as faces principais (o bevel recria as faces: acha de novo pela marca + normal)."""
    lay = m.bm.faces.layers.int.get("peca") or m.bm.faces.layers.int.new("peca")
    _PECA[0] += 1
    pid = _PECA[0]
    inv = M.to_3x3().inverted_safe()
    fs = list({f for v in vs for f in v.link_faces})
    normais = []
    for f in fs:
        f.normal_update()
        f[lay] = pid
        f.material_index = m._mi((mats or {}).get(_lado((inv @ f.normal).normalized()), mat))
        normais.append(f.normal.copy())
    if r <= 0:
        return fs
    es = list({e for v in vs for e in v.link_edges})
    res = bmesh.ops.bevel(m.bm, geom=list(vs) + es, offset=r, offset_type='OFFSET', segments=1, profile=0.5,
                          affect='EDGES', clamp_overlap=True)
    vs2 = set(res['verts']) | {v for f in res['faces'] for v in f.verts}
    out = []
    for f in {f for v in vs2 for f in v.link_faces if f[lay] == pid}:
        f.normal_update()
        if any(f.normal.dot(n) > 0.999 for n in normais):
            out.append(f)
    return out


def _sem_marca(m):
    lay = m.bm.faces.layers.int.get("peca")
    if lay is not None:
        m.bm.faces.layers.int.remove(lay)


def caixa(m, M, mn, mx, mat, r=0.0, mats=None):
    """Caixa nas coordenadas locais de M, arestas chanfradas em r; mats = {'ny': mat, ...} por lado (local)."""
    mn, mx = Vector(mn), Vector(mx)
    c, s = (mn + mx) / 2, mx - mn
    res = bmesh.ops.create_cube(m.bm, size=1.0, matrix=M @ Matrix.Translation(c) @ Matrix.Diagonal((s.x, s.y, s.z, 1.0)))
    return _acabar(m, M, res['verts'], mat, r, mats)


def solido(m, M, poly, a0, a1, eixo, mat, r=0.0, mats=None):
    """Prisma do poligono 2D extrudado ao longo de `eixo` de a0 a a1: 'x' -> poly em (y, z), 'y' -> (x, z), 'z' -> (x, y)."""
    if B.signed_area(poly) < 0:
        poly = list(reversed(poly))

    def p3(u, v, a):
        return M @ (Vector((a, u, v)) if eixo == 'x' else Vector((u, a, v)) if eixo == 'y' else Vector((u, v, a)))
    bm = m.bm
    v0 = [bm.verts.new(p3(u, v, a0)) for u, v in poly]
    v1 = [bm.verts.new(p3(u, v, a1)) for u, v in poly]
    n = len(poly)
    fs = [bm.faces.new(list(reversed(v0))), bm.faces.new(v1)]
    fs += [bm.faces.new((v0[i], v0[(i + 1) % n], v1[(i + 1) % n], v1[i])) for i in range(n)]
    if eixo == 'y':                                   # (x, z) com extrusao em y troca a orientacao
        bmesh.ops.reverse_faces(bm, faces=fs)
    return _acabar(m, M, v0 + v1, mat, r, mats)


def face_para(M, fs, d):
    inv = M.to_3x3().inverted_safe()
    d = Vector(d).normalized()
    return max((f for f in fs if f.is_valid), key=lambda f: (inv @ f.normal).normalized().dot(d) + f.calc_area() * 1e-3)


def grade(m, f, mat, borda=0.025, fundo=0.008):
    """Rebaixa a face (moldura de `borda`) e poe a grade no miolo."""
    bmesh.ops.inset_individual(m.bm, faces=[f], thickness=borda, depth=-fundo, use_even_offset=True)
    f.material_index = m._mi(mat)


def torno(m, M, perfil, mat, segs=24):
    """Superficie de revolucao em torno do Z local. perfil [(r, z), ...]; o lado de fora fica a direita de quem percorre."""
    bm = m.bm
    aneis = []
    for (r, z) in perfil:
        if r < 1e-6:
            aneis.append([bm.verts.new(M @ Vector((0, 0, z)))])
        else:
            aneis.append([bm.verts.new(M @ Vector((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z)))
                          for i in range(segs)])
    mi = m._mi(mat)
    for a, b in zip(aneis, aneis[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            q = [a[i % len(a)], b[i % len(b)], b[j % len(b)], a[j % len(a)]]
            q = [v for k, v in enumerate(q) if v not in q[:k]]
            f = bm.faces.new(q)
            f.material_index = mi
            f.smooth = True


def disco(m, M, r, z, mat, segs=24, frente=1, uv=None):
    pts = [M @ Vector((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z)) for i in range(segs)]
    uvs = [uv(math.cos(2 * math.pi * i / segs), math.sin(2 * math.pi * i / segs)) for i in range(segs)] if uv else None
    m.face(pts, mat, uvs=uvs, facing=M.to_3x3() @ Vector((0, 0, frente)))


def curva(ctrl, n=6):
    """Catmull-Rom pelos pontos de controle."""
    P = [Vector(p) for p in ctrl]
    out = []
    for i in range(len(P) - 1):
        p0, p1, p2, p3 = P[max(i - 1, 0)], P[i], P[i + 1], P[min(i + 2, len(P) - 1)]
        for k in range(n):
            t = k / n
            out.append(0.5 * ((2 * p1) + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3))
    out.append(P[-1])
    return out


def cabo(m, pts, r, mat, segs=6, n=6):
    """Tubo continuo (aneis transportados ao longo da curva) pelos pontos de controle."""
    pts = curva(pts, n) if n > 1 else [Vector(p) for p in pts]
    bm = m.bm
    mi = m._mi(mat)
    aneis = []
    a = None
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        if a is None:
            a = t.cross(Vector((0, 0, 1)))
            if a.length < 1e-3:
                a = t.cross(Vector((1, 0, 0)))
        a = (a - t * a.dot(t)).normalized()
        b = t.cross(a)
        aneis.append([bm.verts.new(p + (a * math.cos(2 * math.pi * k / segs) + b * math.sin(2 * math.pi * k / segs)) * r)
                      for k in range(segs)])
    for A, Bn in zip(aneis, aneis[1:]):
        for k in range(segs):
            j = (k + 1) % segs
            f = bm.faces.new((A[k], A[j], Bn[j], Bn[k]))
            f.material_index = mi
            f.smooth = True


def suave(me, ang):
    for p in me.polygons:
        p.use_smooth = True
    if hasattr(me, "use_auto_smooth"):
        me.use_auto_smooth = True
        me.auto_smooth_angle = math.radians(ang)


def construir(m, ang=35, col=COL):
    _sem_marca(m)
    ob = m.build(col)
    suave(ob.data, ang)
    return ob


def prototipo(m, ang=35):
    _sem_marca(m)
    me = m.mesh()
    suave(me, ang)
    return me


def tripe(m, M, x, y, zc, rp, ztopo, r=0.011, mat=CR, a0=90):
    """Base de tripe (pernas de zc ate o chao num raio rp) + coluna ate ztopo."""
    for k in range(3):
        a = math.radians(a0 + 120 * k)
        px, py = x + rp * math.cos(a), y + rp * math.sin(a)
        tubo(m, M, (x + 0.02 * math.cos(a), y + 0.02 * math.sin(a), zc), (px, py, 0.014), 0.0075, mat, segs=8)
        m.cyl(0.013, 0.016, BOR, segs=10, M=M @ Matrix.Translation((px, py, 0.0)))
    tubo(m, M, (x, y, 0.08), (x, y, ztopo), r, mat, segs=12, caps=(False, True))
    m.cyl(r + 0.009, 0.045, mat, segs=12, M=M @ Matrix.Translation((x, y, zc - 0.025)))


# ------------------------------------------------------------------ pecas (origem no chao, frente para -Y)
def caixa_pa():
    m = B.Mesh("PL_PA")
    I = Matrix.Identity(4)
    fs = caixa(m, I, (-0.31, -0.36, 0.012), (0.31, 0.36, 0.592), "Gabinete_Caixa", r=0.012)    # sub 18"
    grade(m, face_para(I, fs, (0, -1, 0)), "Grade_Caixa")
    for sx in (-1, 1):
        caixa(m, I, (sx * 0.312 - 0.004, -0.07, 0.40), (sx * 0.312 + 0.004, 0.07, 0.45), BOR)       # alcas
        for sy in (-1, 1):
            m.cyl(0.025, 0.012, BOR, segs=12, M=Rm((sx * 0.25, sy * 0.30, 0.0)))
    m.cyl(0.032, 0.016, CR, segs=14, M=Rm((0, 0, 0.592)))
    tubo(m, I, (0, 0, 0.60), (0, 0, 1.02), 0.0175, ESC, segs=12)                                  # pedestal
    m.cyl(0.024, 0.05, ESC, segs=12, M=Rm((0, 0, 0.98)))
    tubo(m, I, (0.024, 0, 1.005), (0.06, 0, 1.005), 0.006, ESC, segs=8, caps=(False, True))
    tubo(m, I, (0, 0, 1.02), (0, 0, 1.34), 0.015, ESC, segs=12)
    m.cyl(0.03, 0.035, ESC, segs=14, M=Rm((0, 0, 1.31)))
    trap = [(-0.21, -0.19), (0.21, -0.19), (0.14, 0.18), (-0.14, 0.18)]
    fs = solido(m, I, trap, 1.34, 2.02, 'z', "Gabinete_Caixa", r=0.012)                          # caixa 12" + driver
    grade(m, face_para(I, fs, (0, -1, 0)), "Grade_Caixa")
    caixa(m, I, (-0.05, -0.186, 1.955), (0.05, -0.181, 1.975), "Inox")                           # plaqueta
    cabo(m, [(-0.08, 0.0, 2.015), (-0.07, 0.0, 2.05), (0.0, 0.0, 2.065), (0.07, 0.0, 2.05), (0.08, 0.0, 2.015)], 0.009, BOR, segs=8)
    return prototipo(m)


def retorno():
    m = B.Mesh("PL_Retorno")
    I = Matrix.Identity(4)
    perfil = [(-0.22, 0.0), (0.22, 0.0), (0.22, 0.31), (0.05, 0.31), (-0.22, 0.10)]
    fs = solido(m, I, perfil, -0.28, 0.28, 'x', "Gabinete_Caixa", r=0.01)
    grade(m, face_para(I, fs, (0, -0.62, 0.78)), "Grade_Caixa", borda=0.022)
    caixa(m, I, (-0.06, 0.12, 0.31), (0.06, 0.19, 0.316), BOR)                                    # alca
    return prototipo(m)


def amp_guitarra():
    m = B.Mesh("PL_Amp_Guitarra")
    I = Matrix.Identity(4)
    caixa(m, I, (-0.31, -0.13, 0.02), (0.31, 0.13, 0.50), "Tolex", r=0.016)
    caixa(m, I, (-0.29, -0.136, 0.05), (0.29, -0.128, 0.385), "Tecido_Amp", r=0.003)
    caixa(m, I, (-0.29, -0.136, 0.395), (0.29, -0.128, 0.48), CR, r=0.002)                        # painel
    for i in range(8):
        x = -0.24 + i * 0.062
        m.cyl(0.0125, 0.02, BOR, segs=12, M=Rm((x, -0.136, 0.437), rx=90), cap_mat="Plastico_Branco")
    m.sphere("Plastico_Vermelho", Rm((0.26, -0.138, 0.437)) @ Matrix.Diagonal((0.008, 0.008, 0.008, 1)), subdiv=1)
    caixa(m, I, (-0.25, -0.139, 0.31), (-0.13, -0.136, 0.345), "Inox")                            # logo
    for sx in (-1, 1):
        for sz in (0.02, 0.47):
            caixa(m, I, (sx * 0.31 - 0.03, -0.135, sz), (sx * 0.31 + 0.03, 0.135, sz + 0.035), BOR, r=0.006)   # cantoneiras
        m.cyl(0.02, 0.02, BOR, segs=10, M=Rm((sx * 0.25, 0.0, 0.0)))
    cabo(m, [(-0.1, 0.0, 0.50), (-0.09, 0.0, 0.535), (0.0, 0.0, 0.545), (0.09, 0.0, 0.535), (0.1, 0.0, 0.50)], 0.01, BOR, segs=8)
    return prototipo(m)


def amp_baixo():
    m = B.Mesh("PL_Amp_Baixo")
    I = Matrix.Identity(4)
    fs = caixa(m, I, (-0.30, -0.22, 0.0), (0.30, 0.22, 0.62), "Tolex", r=0.016)                   # caixa 4 x 10"
    grade(m, face_para(I, fs, (0, -1, 0)), "Grade_Caixa", borda=0.03)
    caixa(m, I, (-0.30, -0.15, 0.625), (0.30, 0.15, 0.78), ESC, r=0.008)                          # cabecote
    caixa(m, I, (-0.28, -0.156, 0.645), (0.28, -0.148, 0.76), "Inox", r=0.002)
    for i in range(9):
        m.cyl(0.011, 0.018, BOR, segs=12, M=Rm((-0.22 + i * 0.05, -0.156, 0.71), rx=90))
    caixa(m, I, (0.235, -0.16, 0.665), (0.255, -0.155, 0.685), "Lampada")
    for sx in (-1, 1):
        cabo(m, [(sx * 0.2 - 0.05, -0.05, 0.78), (sx * 0.2 - 0.04, -0.05, 0.81), (sx * 0.2 + 0.04, -0.05, 0.81),
                 (sx * 0.2 + 0.05, -0.05, 0.78)], 0.007, CR, segs=8, n=3)
    return prototipo(m)


def tambor(m, M, r, d, casco, aro, lugs, pele="Pele_Bateria", pele_frente=None, uv_frente=None, haste=True):
    """Tambor com eixo no Z local de M: z = 0 pele de frente/de baixo, z = d pele de batida."""
    n = 28
    m.cyl(r, d, casco, segs=n, M=M, caps=(False, False))
    disco(m, M, r, d, pele, segs=n)
    disco(m, M, r, 0.0, pele_frente or pele, segs=n, frente=-1, uv=uv_frente)
    e = 0.009
    torno(m, M, [(r, d), (r, d + 0.012), (r + e, d + 0.012), (r + e, d - 0.018)], aro, segs=n)
    torno(m, M, [(r + e, 0.018), (r + e, -0.012), (r, -0.012), (r, 0.0)], aro, segs=n)
    h = min(0.035, d * 0.28)
    for i in range(lugs):
        Ml = M @ Matrix.Rotation(2 * math.pi * (i + 0.5) / lugs, 4, 'Z')
        caixa(m, Ml, (r - 0.002, -0.008, d / 2 - h), (r + 0.016, 0.008, d / 2 + h), CR, r=0.003)
        if haste:
            for z0, z1 in ((d / 2 + h, d - 0.016), (d / 2 - h, 0.016)):
                tubo(m, Ml, (r + 0.013, 0, z0), (r + 0.013, 0, z1), 0.0032, CR, segs=6)


PRATO = [(0.0, 0.026), (0.018, 0.025), (0.04, 0.016), (0.052, 0.010)]


def prato(m, M, R):
    torno(m, M, PRATO + [(R * 0.6, 0.004), (R, 0.0)], "Prato_Bronze", segs=28)
    m.cyl(0.012, 0.02, BOR, segs=10, M=M @ Matrix.Translation((0, 0, 0.026)))


def bateria():
    m = B.Mesh("PL_Bateria")
    I = Matrix.Identity(4)
    k = 0.56                                          # raio da logo na pele de frente (em UV)
    tambor(m, Rm((0, -0.20, 0.29), rx=-90), 0.28, 0.40, "Casco_Bateria", "Casco_Bateria", 10, pele_frente="Pele_Bumbo",
           uv_frente=lambda c, s: (0.5 + k * c, 0.5 - k * s))                                     # bumbo 22"
    for sx in (-1, 1):
        tubo(m, I, (sx * 0.2, -0.12, 0.12), (sx * 0.36, -0.24, 0.006), 0.009, CR)                  # esporas
        m.cyl(0.014, 0.012, BOR, segs=10, M=Rm((sx * 0.36, -0.24, 0.0)))
    caixa(m, I, (-0.06, 0.22, 0.0), (0.06, 0.52, 0.01), ESC)                                       # pedal
    caixa(m, Rm((0, 0.26, 0.012), rx=12), (-0.045, 0.0, 0.0), (0.045, 0.25, 0.012), AL, r=0.002)
    for sx in (-1, 1):
        tubo(m, I, (sx * 0.06, 0.25, 0.0), (sx * 0.06, 0.25, 0.22), 0.008, CR)
    tubo(m, I, (-0.06, 0.25, 0.22), (0.06, 0.25, 0.22), 0.008, CR)
    tubo(m, I, (0, 0.25, 0.22), (0, 0.235, 0.33), 0.004, CR)
    m.sphere("Plastico_Branco", Rm((0, 0.232, 0.345)) @ Matrix.Diagonal((0.03, 0.022, 0.03, 1)), subdiv=2)
    # tons 10" e 12" no suporte do bumbo, inclinados para o baterista
    tubo(m, I, (0, 0.0, 0.565), (0, 0.02, 0.68), 0.013, CR)
    for (c, r, d, ry) in (((0.155, 0.04, 0.80), 0.127, 0.20, -9), ((-0.175, 0.05, 0.82), 0.152, 0.22, 9)):
        Mt = Rm(c, rx=-22, ry=ry) @ Matrix.Translation((0, 0, -d / 2))
        tambor(m, Mt, r, d, "Casco_Bateria", CR, 6)
        tubo(m, I, (0, 0.02, 0.68), (c[0] * 0.6, c[1], 0.70), 0.01, CR)
    # surdo 16" com tres pes (alto: pele a SURDO_Z, ao alcance de quem senta no banco)
    fx, fy = SURDO
    tambor(m, Rm((fx, fy, SURDO_Z - 0.36)), 0.203, 0.36, "Casco_Bateria", CR, 8)
    for a in (40, 160, 280):
        ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
        tubo(m, I, (fx + 0.225 * ca, fy + 0.225 * sa, SURDO_Z - 0.10), (fx + 0.30 * ca, fy + 0.30 * sa, 0.014), 0.008, CR)
        m.cyl(0.014, 0.016, BOR, segs=10, M=Rm((fx + 0.30 * ca, fy + 0.30 * sa, 0.0)))
    # caixa 14" (casco cromado) na estante, entre os joelhos e acima das coxas de quem senta no banco
    sx_, sy_ = CAIXA
    zc = CAIXA_Z - 0.07
    tambor(m, Rm((sx_, sy_, zc), rx=-6) @ Matrix.Translation((0, 0, -0.07)), 0.178, 0.14, CR, CR, 10)
    tripe(m, I, sx_, sy_, 0.20, 0.25, zc - 0.12, a0=30)
    for a in (90, 210, 330):
        ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
        tubo(m, I, (sx_, sy_, zc - 0.12), (sx_ + 0.15 * ca, sy_ + 0.15 * sa, zc - 0.08), 0.006, CR)
    # chimbal 14"
    hx, hy = 0.52, 0.42
    tripe(m, I, hx, hy, 0.24, 0.26, 0.84, a0=60)
    tubo(m, I, (hx, hy, 0.84), (hx, hy, 0.96), 0.004, CR, segs=6)
    torno(m, Rm((hx, hy, 0.86), rx=180), PRATO + [(0.178 * 0.6, 0.004), (0.178, 0.0)], "Prato_Bronze", segs=28)
    prato(m, Rm((hx, hy, 0.875)), 0.178)
    caixa(m, Rm((hx, hy + 0.05, 0.014), rx=10), (-0.04, 0.0, 0.0), (0.04, 0.24, 0.012), AL, r=0.002)
    # ataque 16" e conducao 20" em estantes girafa (perto: os personagens tem braco curto)
    for (base, topo, ponta, R, rx, ry) in ((ATAQUE[0], 0.96, ATAQUE[1], 0.203, -14, -10),
                                         (CONDUCAO[0], 0.90, CONDUCAO[1], 0.254, -10, 12)):
        tripe(m, I, base[0], base[1], 0.24, 0.28, topo)
        tubo(m, I, (base[0], base[1], topo), (ponta[0], ponta[1], ponta[2] - 0.03), 0.008, CR)
        prato(m, Rm(ponta, rx=rx, ry=ry), R)
    # banco do baterista
    bx, by = BANCO_BAT
    tripe(m, I, bx, by, 0.14, 0.27, 0.47, r=0.02, mat=ESC)
    torno(m, Rm((bx, by, 0)), [(0.0, 0.555), (0.14, 0.552), (0.165, 0.54), (0.172, 0.52), (0.172, 0.48),
                               (0.16, 0.468), (0.0, 0.468)], "Tolex", segs=24)
    return prototipo(m, ang=40)


# bateria (local: baterista olha para -Y). Pecas usadas pelo 16_animacoes_palco.py: banco, surdo (baquetas), conducao
BANCO_BAT = (0.05, 0.70)
CAIXA, CAIXA_Z = (0.16, 0.34), 0.73                    # centro e altura da pele da caixa
SURDO, SURDO_Z = (-0.56, 0.30), 0.66
ATAQUE = ((0.62, -0.18), (0.40, 0.06, 1.06))           # (base da estante, centro do prato)
CONDUCAO = ((-0.70, -0.04), (-0.46, 0.10, 0.98))


def microfone(m, M, a, base):
    """Microfone de mao (tipo SM58): base = conector, a = direcao para a boca."""
    Mm = M @ Matrix.Translation(Vector(base)) @ para(a)
    m.cyl(0.0105, 0.105, ESC, segs=14, r2=0.0175, M=Mm)
    m.cyl(0.019, 0.014, CR, segs=14, r2=0.021, M=Mm @ Matrix.Translation((0, 0, 0.105)))
    m.sphere("Grade_Mic", Mm @ Matrix.Translation((0, 0, 0.138)) @ Matrix.Diagonal((0.026, 0.026, 0.026, 1)), subdiv=2)
    m.cyl(0.0095, 0.02, BOR, segs=10, M=Mm @ Matrix.Translation((0, 0, -0.02)))                   # conector XLR


FIM_CABO = (0.12, 0.02, 0.0075)                     # onde o cabo do microfone chega no chao (local do pedestal)


# bocas medidas nas animacoes do 16_animacoes_palco.py (personagem de 1,75 m), relativas ao pe do pedestal:
BOCA_SENTADO = Vector((0.0, 0.728, 1.568))          # tocando na banqueta (0,73 m atras do girafa)
BOCA_EM_PE = Vector((0.0, 0.20, 1.56))              # cantando inclinado para o pedestal reto


def pedestal_girafa():
    """Pedestal girafa para musico sentado: microfone 9 cm a frente da boca de quem toca na banqueta, apontado para ela."""
    m = B.Mesh("PL_Pedestal_Girafa")
    I = Matrix.Identity(4)
    grelha = BOCA_SENTADO - Vector((0, 0.09, 0.02))
    a = (BOCA_SENTADO - grelha).normalized()
    ponta = grelha - a * 0.088
    zp = ponta.z - ponta.y * math.tan(math.radians(25))           # braco subindo 25 graus ate o microfone
    tripe(m, I, 0, 0, 0.20, 0.30, 0.80, r=0.0125, mat=ESC)
    m.cyl(0.02, 0.05, BOR, segs=12, M=Rm((0, 0, 0.78)))
    tubo(m, I, (0, 0, 0.80), (0, 0, zp), 0.0095, ESC, segs=12)
    m.cyl(0.02, 0.07, BOR, segs=12, M=Rm((-0.035, 0, zp), ry=90))
    piv = Vector((0, 0, zp))
    d = (ponta - piv).normalized()
    tras = piv - d * 0.30
    tubo(m, I, tras, ponta, 0.0085, ESC, segs=12, caps=(True, True))
    m.cyl(0.022, 0.06, ESC, segs=12, M=Matrix.Translation(tras) @ para(d) @ Matrix.Translation((0, 0, -0.03)))
    base = ponta - a * 0.05
    m.cyl(0.016, 0.03, BOR, segs=12, M=Matrix.Translation(ponta) @ para(a) @ Matrix.Translation((0, 0, -0.015)))   # cachimbo
    microfone(m, I, a, base)
    c0 = base - a * 0.035
    cabo(m, [c0, c0 + Vector((0.01, -0.05, -0.10)), Vector((0.02, ponta.y * 0.25, zp - 0.02)), Vector((0.025, 0.02, zp - 0.17)),
             Vector((0.025, 0.02, 0.45)), Vector((0.05, 0.02, 0.12)), Vector((0.09, 0.02, 0.02)), Vector(FIM_CABO)],
         0.0042, "Cabo_Palco", segs=6, n=5)
    return prototipo(m, ang=40)


def pedestal_reto():
    """Pedestal reto de base redonda para o vocal em pe: microfone apontando para +Y e para cima, na boca do cantor."""
    m = B.Mesh("PL_Pedestal_Reto")
    I = Matrix.Identity(4)
    a = Vector((0, math.cos(math.radians(30)), math.sin(math.radians(30))))
    ponta = BOCA_EM_PE - a * (0.07 + 0.158)
    ponta.y = 0.0
    torno(m, I, [(0.0, 0.024), (0.12, 0.021), (0.15, 0.010), (0.15, 0.0), (0.0, 0.0)], ESC, segs=28)
    tubo(m, I, (0, 0, 0.02), (0, 0, 0.95), 0.0125, ESC, segs=12)
    m.cyl(0.02, 0.05, BOR, segs=12, M=Rm((0, 0, 0.93)))
    tubo(m, I, (0, 0, 0.95), ponta, 0.0095, ESC, segs=12)
    m.cyl(0.016, 0.03, BOR, segs=12, M=Matrix.Translation(ponta) @ para(a) @ Matrix.Translation((0, 0, -0.01)))
    base = ponta + a * 0.02
    microfone(m, I, a, base)
    c0 = base - a * 0.035
    cabo(m, [c0, c0 + Vector((0.0, -0.03, -0.08)), Vector((0.02, -0.02, 1.15)), Vector((0.022, 0.0, 0.7)),
             Vector((0.03, 0.0, 0.2)), Vector((0.07, 0.02, 0.03)), Vector(FIM_CABO)], 0.0042, "Cabo_Palco", segs=6, n=5)
    return prototipo(m, ang=40)


def contorno_corpo(L, r1, r2, k, n=72):
    """Contorno (x, z) do corpo do violao: uniao suave de dois circulos (bojo de baixo r1, de cima r2), z de 0 a L."""
    c1, c2 = r1, L - r2

    def sdf(x, z):
        a = math.hypot(x, z - c1) - r1
        b = math.hypot(x, z - c2) - r2
        h = min(max(0.5 + 0.5 * (b - a) / k, 0.0), 1.0)
        return b * (1 - h) + a * h - k * h * (1 - h)
    zc = (c1 + c2) / 2
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        lo, hi = 0.0, L
        for _ in range(36):
            mid = (lo + hi) / 2
            if sdf(math.cos(t) * mid, zc + math.sin(t) * mid) < 0:
                lo = mid
            else:
                hi = mid
        pts.append((math.cos(t) * lo, zc + math.sin(t) * lo))
    return pts


def violao(m, M, L, r1, r2, T, escala, larg, boca, cravelhas, cabeca=0.19):
    """Corpo no plano XZ (tampo virado para -Y), base em z = 0, braco subindo em +Z."""
    solido(m, M, contorno_corpo(L, r1, r2, 0.04), -T / 2, T / 2, 'y', "Madeira_Jacaranda", r=0.004, mats={'ny': "Madeira_Violao"})
    zb = L * 0.20                                                       # cavalete
    zn = zb + escala                                                    # pestana
    zh = L - r2 * 1.05                                                  # boca
    Mt = M @ Matrix.Translation((0, -T / 2 - 0.0012, 0)) @ Matrix.Rotation(math.radians(90), 4, 'X')
    disco(m, Mt @ Matrix.Translation((0, zh, 0)), boca, 0.0, BOR, segs=24)
    torno(m, Mt @ Matrix.Translation((0, zh, 0.0004)), [(boca, 0.0), (boca + 0.014, 0.0)], "Madeira_Escura", segs=24)
    caixa(m, M, (-larg * 1.6, -T / 2 - 0.008, zb - 0.012), (larg * 1.6, -T / 2 + 0.001, zb + 0.012), "Madeira_Jacaranda", r=0.002)
    caixa(m, M, (-larg * 1.2, -T / 2 - 0.011, zb - 0.003), (larg * 1.2, -T / 2 - 0.007, zb + 0.002), "Plastico_Branco")
    caixa(m, M, (-larg / 2, -T / 2 + 0.002, L - 0.02), (larg / 2, -T / 2 + 0.028, zn), "Madeira_Jacaranda", r=0.004)     # braco
    caixa(m, M, (-larg / 2 + 0.001, -T / 2 - 0.006, L - 0.075), (larg / 2 - 0.001, -T / 2 + 0.002, zn), "Madeira_Escura")  # escala
    caixa(m, M, (-larg * 0.55, -T / 2 + 0.002, L - 0.03), (larg * 0.55, T / 2 - 0.01, L + 0.03), "Madeira_Jacaranda", r=0.004)  # salto
    caixa(m, M, (-larg / 2, -T / 2 - 0.009, zn - 0.004), (larg / 2, -T / 2 + 0.002, zn), "Plastico_Branco")              # pestana
    Mh = M @ Matrix.Translation((0, -T / 2 + 0.004, zn)) @ Matrix.Rotation(math.radians(-14), 4, 'X')
    caixa(m, Mh, (-larg * 0.68, 0.0, 0.0), (larg * 0.68, 0.02, cabeca), "Madeira_Jacaranda", r=0.003)                    # mao
    for i in range(cravelhas):
        z = cabeca * (0.25 + 0.6 * i / max(cravelhas - 1, 1))
        for sx in (-1, 1):
            tubo(m, Mh, (sx * larg * 0.68, 0.012, z), (sx * (larg * 0.68 + 0.022), 0.012, z), 0.0035, CR, segs=6)
            caixa(m, Mh, (sx * (larg * 0.68 + 0.02) - 0.006, 0.006, z - 0.009), (sx * (larg * 0.68 + 0.032) + 0.006, 0.018, z + 0.009),
                  "Plastico_Branco", r=0.002)
    return zn


def instrumento_suporte(nome, L, r1, r2, T, escala, larg, boca, cravelhas, cabeca):
    """Devolve (suporte, instrumento, Mg): malhas separadas (o instrumento fica num no proprio para o musico pegar) e a
    posicao do instrumento no suporte (espaco local do suporte; origem do instrumento = base do corpo, ver violao())."""
    mi = B.Mesh(nome)
    I = Matrix.Identity(4)
    Mg = Rm((0, 0.0, 0.10), rx=-12)
    zn = violao(mi, I, L, r1, r2, T, escala, larg, boca, cravelhas, cabeca)
    m = B.Mesh(nome.replace("PL_", "PL_Suporte_"))
    # suporte em A: bercos de borracha, pes da frente, haste ate o garfo do braco
    for sx in (-1, 1):
        tubo(m, I, (sx * 0.20, -0.16, 0.012), (sx * 0.08, 0.02, 0.09), 0.009, ESC)
        tubo(m, I, (sx * 0.08, -0.07, 0.092), (sx * 0.08, 0.06, 0.092), 0.013, BOR, caps=(True, True))
        m.cyl(0.014, 0.014, BOR, segs=10, M=Rm((sx * 0.20, -0.16, 0.0)))
    tubo(m, I, (-0.08, 0.02, 0.09), (0.08, 0.02, 0.09), 0.009, ESC)
    garfo = Mg @ Vector((0, T / 2 + 0.035, L + (zn - L) * 0.45))
    tubo(m, I, (0, 0.05, 0.09), garfo - Vector((0, 0, 0.03)), 0.011, ESC)
    tubo(m, I, (0, 0.30, 0.012), (0, 0.06 + (garfo.y - 0.06) * 0.45, 0.09 + (garfo.z - 0.12) * 0.45), 0.009, ESC)
    m.cyl(0.014, 0.014, BOR, segs=10, M=Rm((0, 0.30, 0.0)))
    for sx in (-1, 1):
        tubo(m, I, garfo - Vector((sx * 0.035, 0, 0.03)), garfo + Vector((-sx * 0.035, 0, 0.03)), 0.008, BOR, caps=(True, True))
    return prototipo(m), prototipo(mi), Mg


BAQ_C = 0.135                                       # baqueta 5A: 406 mm, origem no ponto de pegada (13,5 cm do cabo)


def baqueta(m, M):
    """Baqueta ao longo do Z local de M: cabo em z = -BAQ_C, ponta (oliva) em z = 0,406 - BAQ_C."""
    z1 = 0.406 - BAQ_C
    torno(m, M, [(0.0, -BAQ_C), (0.0062, -BAQ_C), (0.0073, -BAQ_C + 0.0015), (0.0073, 0.10), (0.0056, 0.19), (0.0034, z1 - 0.018),
                 (0.0046, z1 - 0.011), (0.0047, z1 - 0.006), (0.0038, z1 - 0.002), (0.0, z1)], "Madeira_Baqueta", segs=10)


def baquetas_no_surdo():
    """Par de baquetas deitado no surdo (espaco local da bateria): ponta na pele, cabo apoiado no aro e virado para o banco."""
    c, banco = Vector(SURDO), Vector(BANCO_BAT)
    u = (banco - c).normalized()
    v = Vector((-u.y, u.x))
    out = []
    for lat, avanco in ((-0.021, 0.0), (0.021, 0.016)):
        ponta = c - u * (0.11 - avanco) + v * lat
        s = 0.11 - avanco + math.sqrt(0.207 ** 2 - lat ** 2)          # distancia da ponta ate onde a baqueta toca o aro
        z_ponta, z_aro = SURDO_Z + 0.0045, SURDO_Z + 0.012 + 0.0073
        d = Vector((-u.x, -u.y, -(z_aro - z_ponta) / s)).normalized()   # Z da baqueta: do cabo para a ponta
        x = Vector((v.x, v.y, 0.0))
        y = d.cross(x).normalized()
        o = Vector((ponta.x, ponta.y, z_ponta)) - d * (0.406 - BAQ_C)
        M = Matrix((x, y, d)).transposed().to_4x4()
        M.translation = o
        out.append(M)
    return out


def pandeiro():
    m = B.Mesh("PL_Pandeiro")
    I = Matrix.Identity(4)
    torno(m, I, [(0.118, 0.052), (0.127, 0.052), (0.127, 0.0), (0.118, 0.0), (0.118, 0.052)], "Madeira", segs=32)
    disco(m, I, 0.118, 0.053, "Pele_Bateria", segs=32)
    for i in range(5):
        a = 2 * math.pi * i / 5
        for z in (0.017, 0.031):
            m.cyl(0.024, 0.003, CR, segs=12, M=Rm((0.123 * math.cos(a), 0.123 * math.sin(a), z)))
    return prototipo(m)


def mesa_som():
    """Case de estrada com a mesa de som (operador do lado -Y)."""
    m = B.Mesh("PL_Mesa_Som")
    I = Matrix.Identity(4)
    caixa(m, I, (-0.38, -0.28, 0.10), (0.38, 0.28, 0.70), "Gabinete_Caixa", r=0.004)
    for z in (0.10, 0.70):                                                                                # perfis de aluminio
        for s in (-1, 1):
            caixa(m, I, (-0.38, s * 0.28 - 0.012, z - 0.012), (0.38, s * 0.28 + 0.012, z + 0.012), AL)
            caixa(m, I, (s * 0.38 - 0.012, -0.28, z - 0.012), (s * 0.38 + 0.012, 0.28, z + 0.012), AL)
    for sx in (-1, 1):
        for sy in (-1, 1):
            caixa(m, I, (sx * 0.38 - 0.012, sy * 0.28 - 0.012, 0.10), (sx * 0.38 + 0.012, sy * 0.28 + 0.012, 0.70), AL)
            for z in (0.10, 0.70):
                caixa(m, I, (sx * 0.38 - 0.022, sy * 0.28 - 0.022, z - 0.022), (sx * 0.38 + 0.022, sy * 0.28 + 0.022, z + 0.022), CR, r=0.006)
            caixa(m, I, (sx * 0.31 - 0.03, sy * 0.21 - 0.03, 0.075), (sx * 0.31 + 0.03, sy * 0.21 + 0.03, 0.088), ESC)   # rodizios
            m.cyl(0.035, 0.024, BOR, segs=14, M=Rm((sx * 0.31 - 0.012, sy * 0.21, 0.035), ry=90))
            tubo(m, I, (sx * 0.31, sy * 0.21, 0.075), (sx * 0.31, sy * 0.21, 0.04), 0.008, ESC)
        caixa(m, I, (sx * 0.385, -0.08, 0.40), (sx * 0.392, 0.08, 0.46), CR, r=0.003)                    # alcas
    for sx in (-1, 1):
        caixa(m, I, (sx * 0.2 - 0.03, -0.292, 0.62), (sx * 0.2 + 0.03, -0.284, 0.66), CR, r=0.002)       # fechos
    perfil = [(-0.21, 0.70), (0.21, 0.70), (0.21, 0.80), (-0.21, 0.74)]
    solido(m, I, perfil, -0.27, 0.27, 'x', ESC, r=0.006)
    al = math.atan2(0.06, 0.42)
    Mt = Rm((0, -0.21, 0.74), rx=math.degrees(al))
    tampas = ("Plastico_Vermelho", "Plastico_Branco", "Plastico_Branco", "Plastico_Amarelo")
    for i in range(8):
        x = -0.22 + i * 0.045
        for j, s in enumerate((0.385, 0.335, 0.285, 0.235)):
            m.cyl(0.0075, 0.012, BOR, segs=10, M=Mt @ Matrix.Translation((x, s, 0.0)), cap_mat=tampas[j])
        caixa(m, Mt, (x - 0.012, 0.165, 0.0), (x + 0.012, 0.185, 0.006), "Plastico_Branco")             # mute
        caixa(m, Mt, (x - 0.002, 0.03, 0.0), (x + 0.002, 0.14, 0.002), BOR)                               # trilho do fader
        f = 0.06 + 0.05 * ((i * 37) % 7) / 7
        caixa(m, Mt, (x - 0.008, f - 0.01, 0.0), (x + 0.008, f + 0.01, 0.014), "Plastico_Branco", r=0.002)
    caixa(m, Mt, (0.15, 0.29, 0.0), (0.25, 0.39, 0.004), "Visor_Mesa")
    for x in (0.17, 0.23):
        caixa(m, Mt, (x - 0.002, 0.03, 0.0), (x + 0.002, 0.14, 0.002), BOR)
        caixa(m, Mt, (x - 0.009, 0.10, 0.0), (x + 0.009, 0.12, 0.016), "Plastico_Vermelho", r=0.002)
    return prototipo(m)


def caixa_multicabo():
    m = B.Mesh("PL_Multicabo")
    I = Matrix.Identity(4)
    caixa(m, I, (-0.15, -0.09, 0.0), (0.15, 0.09, 0.14), ESC, r=0.008)
    for i in range(8):
        disco(m, Rm((-0.105 + (i % 4) * 0.07, -0.0905, 0.05 + (i // 4) * 0.05), rx=90), 0.012, 0.0, "Inox", segs=12)
    cabo(m, [(-0.06, 0.0, 0.14), (-0.05, 0.0, 0.17), (0.05, 0.0, 0.17), (0.06, 0.0, 0.14)], 0.008, BOR, segs=8, n=3)
    cabo(m, [(0.0, 0.09, 0.05), (0.0, 0.25, 0.008), (0.12, 0.6, 0.008), (0.6, 0.75, 0.008)], 0.012, BOR, segs=8)   # multicabo
    return prototipo(m)


# ------------------------------------------------------------------ refletores (montados no mundo)
def mira(p, alvo):
    d = Vector(alvo) - Vector(p)
    return math.atan2(-d.x, d.y), math.atan2(-math.hypot(d.x, d.y), d.z)


def par_led(mc, mfx, p, alvo, cor_fx=True):
    """PAR de LED preso pela garra no banzo da trelica em p, mirando alvo."""
    p = Vector(p)
    piv = p + Vector((0, 0, -0.20))
    phi, th = mira(piv, alvo)
    Mz = Matrix.Translation(p) @ Matrix.Rotation(phi, 4, 'Z')
    caixa(mc, Mz, (-0.03, -0.035, -0.055), (0.03, 0.035, 0.035), ESC, r=0.004)
    tubo(mc, Mz, (0, 0, -0.055), (0, 0, -0.08), 0.01, ESC)
    caixa(mc, Mz, (-0.145, -0.02, -0.095), (0.145, 0.02, -0.08), ESC)
    for sx in (-1, 1):
        caixa(mc, Mz, (sx * 0.137 - 0.006, -0.02, -0.225), (sx * 0.137 + 0.006, 0.02, -0.08), ESC)
        mc.cyl(0.02, 0.014, BOR, segs=12, M=Mz @ Matrix.Translation((sx * 0.143, 0, -0.20)) @ Matrix.Rotation(sx * math.pi / 2, 4, 'Y'))
    Mb = Mz @ Matrix.Translation((0, 0, -0.20)) @ Matrix.Rotation(th, 4, 'X')
    mc.cyl(0.112, 0.17, ESC, segs=20, r2=0.118, M=Mb @ Matrix.Translation((0, 0, -0.10)))
    torno(mc, Mb, [(0.095, 0.07), (0.095, 0.086), (0.124, 0.086), (0.124, 0.06)], ESC, segs=20)
    disco(mfx if cor_fx else mc, Mb, 0.095, 0.075, "Palco_Luz" if cor_fx else "Lampada", segs=20)


def cabeca_movel(mc, mfx, p, alvo):
    """Moving head pendurado de cabeca para baixo no banzo em p."""
    p = Vector(p)
    piv = p + Vector((0, 0, -0.40))
    phi, th = mira(piv, alvo)
    Mz = Matrix.Translation(p) @ Matrix.Rotation(phi, 4, 'Z')
    for sx in (-1, 1):
        caixa(mc, Mz, (sx * 0.08 - 0.025, -0.035, -0.06), (sx * 0.08 + 0.025, 0.035, 0.035), ESC, r=0.004)
    caixa(mc, Mz, (-0.16, -0.12, -0.19), (0.16, 0.12, -0.06), ESC, r=0.012)
    caixa(mc, Mz, (-0.12, -0.121, -0.15), (-0.02, -0.119, -0.10), "Visor_Mesa")
    mc.cyl(0.10, 0.03, ESC, segs=20, M=Mz @ Matrix.Translation((0, 0, -0.22)))
    for sx in (-1, 1):
        caixa(mc, Mz, (sx * 0.125 - 0.018, -0.055, -0.45), (sx * 0.125 + 0.018, 0.055, -0.21), ESC, r=0.008)
    Mb = Mz @ Matrix.Translation((0, 0, -0.40)) @ Matrix.Rotation(th, 4, 'X')
    mc.cyl(0.10, 0.25, ESC, segs=20, r2=0.088, M=Mb @ Matrix.Translation((0, 0, -0.12)))
    torno(mc, Mb, [(0.074, 0.13), (0.074, 0.142), (0.096, 0.142), (0.096, 0.12)], ESC, segs=20)
    disco(mfx, Mb, 0.074, 0.134, "Palco_Luz", segs=20)


def barra_led(mc, mfx, p, rz):
    M = Rm(p, rz)
    caixa(mc, M, (-0.25, -0.06, 0.0), (0.25, 0.06, 0.012), ESC)
    Mb = M @ Matrix.Translation((0, 0, 0.03)) @ Matrix.Rotation(math.radians(20), 4, 'X')
    caixa(mc, Mb, (-0.25, -0.045, -0.02), (0.25, 0.045, 0.06), ESC, r=0.006)
    caixa(mfx, Mb, (-0.235, -0.03, 0.06), (0.235, 0.03, 0.064), "Palco_Luz")


def trelica(m, p0, p1, up, rc=0.024, rd=0.009, passo=0.5, mat=AL):
    """Trelica quadrada (4 banzos + diagonais em zigue-zague nas 4 faces) de p0 a p1."""
    p0, p1 = Vector(p0), Vector(p1)
    u = p1 - p0
    L = u.length
    u.normalize()
    w = Vector(up)
    w = (w - u * w.dot(u)).normalized()
    v = w.cross(u)
    cs = [(-CORDA, -CORDA), (CORDA, -CORDA), (CORDA, CORDA), (-CORDA, CORDA)]

    def C(k, s):
        return p0 + u * s + v * cs[k][0] + w * cs[k][1]
    for k in range(4):
        m.tube(C(k, 0), C(k, L), rc, mat, segs=10, caps=(True, True))
    n = max(1, round(L / passo))
    for k in range(4):
        k2 = (k + 1) % 4
        for i in range(n):
            a_, b_ = (k, k2) if i % 2 == 0 else (k2, k)
            m.tube(C(a_, L * i / n), C(b_, L * (i + 1) / n), rd, mat, segs=6)
        for s in (0.03, L - 0.03):
            m.tube(C(k, s), C(k2, s), rd, mat, segs=6)


# ------------------------------------------------------------------ limpeza (palco antigo + rodadas anteriores)
def remover(o):
    me = o.data
    bpy.data.objects.remove(o, do_unlink=True)
    if me is not None and getattr(me, "users", 1) == 0 and not me.name.startswith(("P_", "A_")):
        if isinstance(me, bpy.types.Mesh):
            bpy.data.meshes.remove(me)
        elif isinstance(me, bpy.types.Light):
            bpy.data.lights.remove(me)


def no_palco(p):
    return PX0 - 0.1 <= p.x <= PX1 + 0.1 and PY0 - 0.3 <= p.y <= PY1 + 0.1 and p.z >= ZS - 0.05


def palco_antigo(qm):
    """Copia do bloco 'palco coberto' que saiu do 04_predio.py: serve para achar e apagar essas faces do Predio_Quintal."""
    qm.box((21.5, 21.6, ZP), (31.8, 25.8, ZP + 0.6), "Metal_Escuro", mats={'pz': "Madeira"}, skip=('nz', 'py', 'px'))
    qm.box((20.9, 22.2, ZP), (21.5, 23.4, ZP + 0.2), "Madeira", skip=('nz', 'px'))
    qm.box((21.2, 22.2, ZP + 0.2), (21.5, 23.4, ZP + 0.4), "Madeira", skip=('nz', 'px'))
    for (x, y, z1) in ((21.7, 21.8, 4.3), (31.6, 21.8, 4.3), (21.7, 25.6, 4.62), (31.6, 25.6, 4.62)):
        qm.tube((x, y, ZP + 0.6), (x, y, z1), 0.06, "Metal_Escuro", segs=6)
    roof = [(21.3, 21.4, 4.30), (32.0, 21.4, 4.30), (32.0, 25.95, 4.66), (21.3, 25.95, 4.66)]
    qm.face(roof, "Metal_Ondulado", facing=(0, -0.1, 1))
    qm.face([(x, y, z - 0.01) for (x, y, z) in roof], "Metal_Ondulado", facing=(0, 0.1, -1))
    qm.box((21.7, 21.75, 4.05), (31.6, 21.85, 4.15), "Metal_Escuro")
    qm.box((22.8, 25.62, ZP + 0.85), (30.2, 25.68, ZP + 2.70), "Metal_Escuro", uvrects={'ny': B.REG['placa2']}, mats={'ny': "Atlas_Placas"})


def assinatura(cos):
    return tuple(sorted((round(c.x, 3), round(c.y, 3), round(c.z, 3)) for c in cos))


def apagar_faces(ob, teste):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    mw = ob.matrix_world
    fora = [f for f in bm.faces if teste(f, [mw @ v.co for v in f.verts])]
    bmesh.ops.delete(bm, geom=fora, context='FACES')
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return len(fora)


def limpar():
    B.coll(COL)
    B.clear(COL)
    B.clear_colliders("Palco")
    for n in ("Telao_Tela", "Palco_FX_Luz", "Luz_Palco_Cor") + SOLTOS:
        o = bpy.data.objects.get(n)
        if o is not None:
            remover(o)
    for o in [o for o in bpy.data.objects if o.name.startswith("Palco_Lugar_")]:
        bpy.data.objects.remove(o, do_unlink=True)
    n_obj = 0
    qc = bpy.data.collections.get(QT)
    if qc is not None:
        for o in list(qc.objects):
            if not o.name.startswith("Sombras_") and no_palco(o.matrix_world.translation):
                remover(o)
                n_obj += 1
    n_col = 0
    for o in list(bpy.data.collections["Colisores"].objects):
        if o.name.startswith("COL_Predio_Palco") or (o.name.startswith("COL_Mob_") and no_palco(o.matrix_world.translation)):
            bpy.data.objects.remove(o, do_unlink=True)
            n_col += 1
    n_sombra = 0
    so = bpy.data.objects.get("Sombras_" + QT)
    if so is not None:
        n_sombra = apagar_faces(so, lambda f, cs: no_palco(sum(cs, Vector()) / len(cs)))
    rep = B.Mesh("_palco_antigo")
    palco_antigo(rep)
    sig = {assinatura([v.co for v in f.verts]) for f in rep.bm.faces}
    rep.bm.free()
    n_predio = 0
    pq = bpy.data.objects.get("Predio_Quintal")
    if pq is not None:
        n_predio = apagar_faces(pq, lambda f, cs: assinatura(cs) in sig)
    print("palco antigo removido: %d objetos, %d colisores, %d sombras, %d faces do Predio_Quintal (de %d)"
          % (n_obj, n_col, n_sombra, n_predio, len(sig)))


# ------------------------------------------------------------------ montagem
def plissado(m, p0, p1, nrm, z0, z1, mat, passo=0.0175, amp=0.016):
    """Faixa vertical de tecido de p0 a p1 com pregas (vertices compartilhados: sombreado suave), frente para nrm."""
    a, b_ = Vector(p0), Vector(p1)
    n = int((b_ - a).length / passo)
    bot, top = [], []
    for i in range(n + 1):
        q = a + (b_ - a) * (i / n) + Vector(nrm) * (amp * math.cos(math.pi * i / 2))
        bot.append(m.bm.verts.new((q.x, q.y, z0)))
        top.append(m.bm.verts.new((q.x, q.y, z1)))
    mi = m._mi(mat)
    for i in range(n):
        f = m.bm.faces.new((bot[i], bot[i + 1], top[i + 1], top[i]))
        f.normal_update()
        if f.normal.dot(Vector((nrm[0], nrm[1], 0))) < 0:
            f.normal_flip()
        f.material_index = mi


def estrutura():
    e = B.Mesh("Palco_Estrutura")
    e.box((PX0, PY0, ZP), (PX1, PY1, ZS), "Saia_Palco", mats={'pz': "Piso_Palco"}, skip=('nz', 'py', 'px'))
    e.box((PX0 - 0.015, PY0 - 0.015, ZS - 0.04), (PX1, PY0 + 0.012, ZS + 0.006), ESC)              # cantoneiras da borda
    e.box((PX0 - 0.015, PY0 + 0.012, ZS - 0.04), (PX0 + 0.012, PY1, ZS + 0.006), ESC)
    # escada de chapa (lado oeste): degraus de aluminio, espelhos e laterais pretos, corrimao dos dois lados
    for (xa, xb, zt) in ((20.9, 21.2, ZP + 0.2), (21.2, 21.5, ZP + 0.4)):
        e.box((xa - 0.01, 22.22, zt - 0.03), (xb, 23.38, zt), AL)
        e.box((xa, 22.22, zt - 0.2), (xa + 0.012, 23.38, zt - 0.03), ESC)
    perfil = [(20.9, ZP), (21.5, ZP), (21.5, ZP + 0.4), (21.2, ZP + 0.4), (21.2, ZP + 0.2), (20.9, ZP + 0.2)]
    for y0 in (22.2, 23.38):
        solido(e, Matrix.Identity(4), perfil, y0, y0 + 0.02, 'y', ESC)
    for y in (22.21, 23.39):
        for (x, z) in ((20.96, ZP + 0.2), (21.44, ZP + 0.4)):
            e.tube((x, y, z), (x, y, z + 0.92), 0.02, ESC, segs=10, caps=(False, True))
        cabo(e, [(20.96, y, ZP + 1.12), (21.44, y, ZP + 1.32), (21.62, y, ZS + 0.92)], 0.022, ESC, segs=10, n=1)
        e.tube((21.62, y, ZS), (21.62, y, ZS + 0.92), 0.02, ESC, segs=10, caps=(False, True))
    B.add_collider("Palco", (PX0, PY0, ZP), (PX1, PY1, ZS))
    B.add_collider("Palco_Degrau", (20.9, 22.2, ZP), (21.5, 23.4, ZP + 0.2))
    B.add_collider("Palco_Degrau", (21.2, 22.2, ZP + 0.2), (21.5, 23.4, ZP + 0.4))
    for y in (22.21, 23.39):
        B.add_collider("Palco_Corrimao", (20.9, y - 0.03, ZP), (21.65, y + 0.03, ZS + 0.94))
    # tapete da bateria
    e.box((28.65, 23.62, ZS), (30.75, 25.22, ZS + 0.006), "Tapete_Palco", uvrects={'pz': (0.0, 0.0, 1.0, 1.0)}, skip=('nz',))
    construir(e)
    # tecido plissado: saia de veludo (frente e lateral oeste) e cortina preta de fundo (esconde o muro e o portao)
    s = B.Mesh("Palco_Saia")
    plissado(s, (PX0 - 0.03, PY0 - 0.03), (PX1, PY0 - 0.03), (0, -1), ZP + 0.005, ZS - 0.04, "Saia_Palco")
    plissado(s, (PX0 - 0.03, PY0 - 0.03), (PX0 - 0.03, PY1), (-1, 0), ZP + 0.005, ZS - 0.04, "Saia_Palco")
    plissado(s, (PX0, 25.72), (PX1, 25.72), (0, -1), ZS + 0.015, ZT1, "Cortina_Palco", passo=0.03, amp=0.03)
    s.tube((PX0, 25.72, ZT1 + 0.01), (PX1, 25.72, ZT1 + 0.01), 0.02, ESC, segs=8, caps=(True, True))
    construir(s, ang=89)
    # fita de LED na borda (cor do palco)
    FX.box((PX0, PY0 - 0.017, ZS - 0.034), (PX1, PY0 - 0.015, ZS - 0.022), "Palco_Luz")


def trelicas():
    t = B.Mesh("Palco_Trelica")
    I = Matrix.Identity(4)
    zc = ZT0 + TQ / 2
    for (x, y) in ((TX0, TY0), (TX1, TY0), (TX0, TY1), (TX1, TY1)):
        caixa(t, I, (x - 0.30, y - 0.30, ZS), (x + 0.30, y + 0.30, ZS + 0.012), ESC)                 # sapata
        caixa(t, I, (x - 0.16, y - 0.16, ZS + 0.012), (x + 0.16, y + 0.16, ZS + 0.07), AL)
        trelica(t, (x, y, ZS + 0.07), (x, y, ZT0), (0, 1, 0))
        caixa(t, I, (x - 0.155, y - 0.155, ZT0), (x + 0.155, y + 0.155, ZT0 + 0.31), AL)            # cubo de canto
        B.add_collider("Palco_Torre", (x - 0.16, y - 0.16, ZS), (x + 0.16, y + 0.16, ZT1))
    trelica(t, (TX0 + 0.155, TY0, zc), (TX1 - 0.155, TY0, zc), (0, 0, 1))
    trelica(t, (TX0 + 0.155, TY1, zc), (TX1 - 0.155, TY1, zc), (0, 0, 1))
    trelica(t, (TX0, TY0 + 0.155, zc), (TX0, TY1 - 0.155, zc), (0, 0, 1))
    trelica(t, (TX1, TY0 + 0.155, zc), (TX1, TY1 - 0.155, zc), (0, 0, 1))
    # arcos e tercas da cobertura
    for x in (TX0, XC, TX1):
        ys = [TY0 + (TY1 - TY0) * i / 12 for i in range(13)]
        cabo(t, [(x, y, arco_z(y) - 0.045) for y in ys], 0.03, AL, segs=10, n=1)
        for y in (TY0, TY1):
            t.tube((x, y, ZT1 - 0.02), (x, y, arco_z(y) - 0.045), 0.03, AL, segs=10)
    for y in [TY0 + (TY1 - TY0) * i / 6 for i in range(1, 6)]:
        t.tube((TX0, y, arco_z(y) - 0.06), (TX1, y, arco_z(y) - 0.06), 0.02, AL, segs=8, caps=(True, True))
    construir(t, ang=65)


YR0, YR1, ZR0, FLECHA = 21.45, 25.95, ZT1 + 0.03, 0.70
YM = (YR0 + YR1) / 2
RAIO = (((YR1 - YR0) / 2) ** 2 + FLECHA ** 2) / (2 * FLECHA)
ZCEN = ZR0 + FLECHA - RAIO


def arco_z(y):
    return ZCEN + math.sqrt(max(RAIO ** 2 - (y - YM) ** 2, 0.0))


def cobertura():
    c = B.Mesh("Palco_Cobertura")
    XR0, XR1 = 21.40, 31.90
    a0 = math.asin((YR0 - YM) / RAIO)
    ys = [YM + RAIO * math.sin(a0 + (-2 * a0) * i / 18) for i in range(19)]
    arco = [(y, arco_z(y)) for y in ys]
    for (ya, za), (yb, zb) in zip(arco, arco[1:]):
        c.face([(XR0, ya, za), (XR1, ya, za), (XR1, yb, zb), (XR0, yb, zb)], "Lona_Palco", facing=(0, 0, 1))
    for x, s in ((XR0, -1), (XR1, 1)):
        c.face([(x, y, z) for (y, z) in arco], "Lona_Palco", facing=(s, 0, 0))
    for y in (YR0, YR1):
        c.tube((XR0, y, ZR0), (XR1, y, ZR0), 0.02, "Lona_Palco", segs=8, caps=(True, True))
    cabo(c, [(XR0, y, z) for (y, z) in arco], 0.02, "Lona_Palco", segs=8, n=1)
    cabo(c, [(XR1, y, z) for (y, z) in arco], 0.02, "Lona_Palco", segs=8, n=1)
    # testeira com a logo na frente da trelica
    c.box((XC - 3.2, 21.36, ZT1 - 0.04), (XC + 3.2, 21.40, ZT1 + 0.76), ESC, mats={'ny': "Placa_Palco"},
          uvrects={'ny': (0.0, 0.0, 1.0, 1.0)})
    yb = TY0 - CORDA
    for x in (XC - 2.8, XC, XC + 2.8):
        c.tube((x, 21.40, ZT1 - 0.016), (x, yb, ZT1 - 0.024), 0.012, ESC, segs=8)
        c.tube((x, 21.40, ZT1 + 0.55), (x, yb, ZT1 - 0.024), 0.012, ESC, segs=8)
    construir(c)


def telao():
    t = B.Mesh("Palco_Telao")
    I = Matrix.Identity(4)
    x0 = XC - TEL_W / 2
    for i in range(NX):
        for j in range(NY):
            gx, gz = x0 + i * GAB_W, TEL_Z0 + j * GAB_H
            t.box((gx + 0.003, TEL_Y + 0.004, gz + 0.003), (gx + GAB_W - 0.003, TEL_Y + 0.085, gz + GAB_H - 0.003),
                  "Telao_Gabinete", skip=('ny',))
            t.box((gx + 0.22, TEL_Y + 0.085, gz + 0.12), (gx + 0.42, TEL_Y + 0.105, gz + 0.24), ESC, skip=('ny',))
            for sx in (0.08, GAB_W - 0.08):
                t.box((gx + sx - 0.012, TEL_Y + 0.085, gz + 0.16), (gx + sx + 0.012, TEL_Y + 0.11, gz + 0.20), ESC, skip=('ny',))
    b = 0.035
    for (mn, mx) in (((x0 - b, TEL_Z0 - b), (x0 + TEL_W + b, TEL_Z0)), ((x0 - b, TEL_Z1), (x0 + TEL_W + b, TEL_Z1 + b)),
                     ((x0 - b, TEL_Z0), (x0, TEL_Z1)), ((x0 + TEL_W, TEL_Z0), (x0 + TEL_W + b, TEL_Z1))):
        caixa(t, I, (mn[0], TEL_Y - 0.012, mn[1]), (mx[0], TEL_Y + 0.09, mx[1]), "Telao_Gabinete")
    caixa(t, I, (x0 - 0.05, TEL_Y, TEL_Z1 + b), (x0 + TEL_W + 0.05, TEL_Y + 0.09, TEL_Z1 + 0.11), ESC, r=0.006)   # flybar
    yc, zc = TY1 - CORDA, ZT0 + 0.024
    for xs in (x0 + 0.45, x0 + 2.1, x0 + TEL_W - 2.1, x0 + TEL_W - 0.45):
        caixa(t, I, (xs - 0.03, TEL_Y + 0.03, TEL_Z1 + 0.11), (xs + 0.03, TEL_Y + 0.06, TEL_Z1 + 0.15), CR, r=0.005)
        for s in (-1, 1):
            t.tube((xs + s * 0.025, TEL_Y + 0.045, TEL_Z1 + 0.15), (xs + s * 0.02, yc, zc + 0.03), 0.011, "Cinta_Carga", segs=6)
        t.tube((xs - 0.03, yc, zc + 0.036), (xs + 0.03, yc, zc + 0.036), 0.011, "Cinta_Carga", segs=6)
    construir(t)
    # a tela: no proprio, origem no centro, UV 0..1 (u para a direita de quem assiste, v para cima)
    tm = B.Mesh("Telao_Tela")
    w, h = TEL_W / 2, TEL_H / 2
    tm.face([(-w, 0, -h), (w, 0, -h), (w, 0, h), (-w, 0, h)], "Telao_Tela", uvs=[(0, 0), (1, 0), (1, 1), (0, 1)], facing=(0, -1, 0))
    tela = tm.build(INTB, location=(XC, TEL_Y, TEL_Z0 + h))
    tela["interativo"] = "telao"
    tela["largura_m"] = round(TEL_W, 3)
    tela["altura_m"] = round(TEL_H, 3)
    tela["proporcao"] = "16:9"
    tela["resolucao"] = [1920, 1080]
    tela["descricao"] = ("Telao do palco: plano 16:9 virado para a plateia (+Z local no three.js), UV 0..1. Video: VideoTexture "
                         "no material (flipY = false) ou iframe do YouTube via CSS3DRenderer alinhado a este no")
    return tela


def pecas():
    pa, ret = caixa_pa(), retorno()
    amp_g, amp_b = amp_guitarra(), amp_baixo()
    bat, girafa, reto = bateria(), pedestal_girafa(), pedestal_reto()
    vio, vio_i, mg_vio = instrumento_suporte("PL_Violao", 0.49, 0.18, 0.135, 0.10, 0.65, 0.054, 0.043, 3, 0.19)
    cav, cav_i, mg_cav = instrumento_suporte("PL_Cavaquinho", 0.30, 0.112, 0.083, 0.065, 0.34, 0.044, 0.027, 2, 0.13)
    pan, mesa, mc = pandeiro(), mesa_som(), caixa_multicabo()
    banq = bpy.data.meshes.get("A_banqueta") or bpy.data.meshes.get("P_Banqueta")
    alt_banq = float(banq.get("altura_m", 0.81)) if banq else 0.81
    obs = {}

    def put(me, nome, x, y, rot=0.0, z=ZS, colide=False, sombra=None):
        o = B.inst(me, nome, COL, (x, y, z), rot)
        obs[nome] = o
        if colide:
            B.collider_obj(nome, o)
        if sombra:
            SOMBRAS.append((x, y, z, sombra[0], sombra[1], rot))
        return o
    put(pa, "Palco_PA_Esq", 22.40, 22.10, 8, colide=True, sombra=(0.42, 0.48))
    put(pa, "Palco_PA_Dir", 30.90, 22.10, -8, colide=True, sombra=(0.42, 0.48))
    for k, x in enumerate((24.55, 26.65, 28.75), 1):
        put(ret, "Palco_Retorno_%d" % k, x, 21.98, 180, colide=True, sombra=(0.38, 0.30))
    put(bat, "Palco_Bateria", 29.75, 24.25, -8, z=ZS + 0.006, sombra=(0.95, 0.85))
    B.add_collider("Palco_Bateria", (-0.85, -0.45, 0.0), (0.85, 1.05, 1.2), obs["Palco_Bateria"].matrix_basis.copy())
    put(amp_g, "Palco_Amp_Guitarra", 23.05, 25.05, 8, colide=True, sombra=(0.40, 0.22))
    put(amp_b, "Palco_Amp_Baixo", 24.35, 25.06, 0, colide=True, sombra=(0.40, 0.31))
    put(mesa, "Palco_Mesa_Som", 22.45, 24.20, -90, colide=True, sombra=(0.50, 0.38))
    put(mc, "Palco_Multicabo", XC, 24.95, 0, sombra=(0.20, 0.13))
    put(reto, "Palco_Pedestal_Vocal", XC, 22.45, 0)
    put(girafa, "Palco_Pedestal_Esq", 24.62, 22.57, 0)
    put(girafa, "Palco_Pedestal_Dir", 28.68, 22.57, 0)
    if banq is not None:
        # banqueta de bar mais baixa (assento a ALT_BANQ): o musico senta sem subir no banco, pes no apoio
        for nome, x, rz in (("Palco_Banqueta_Esq", 24.60, 20), ("Palco_Banqueta_Dir", 28.70, -35)):
            put(banq, nome, x, 23.30, rz).scale.z = ALT_BANQ / alt_banq
    put(pan, "Palco_Pandeiro", 24.35, 25.06, 15, z=ZS + 0.781)                  # em cima do cabecote do baixo (banqueta livre)
    put(vio, "Palco_Suporte_Violao", 23.95, 23.70, 18)                          # atras e a direita de quem senta
    put(cav, "Palco_Suporte_Cavaquinho", 29.35, 23.70, -18)                     # espelho do violao
    # soltos (Interativos_Bar, nos proprios no glTF): o jogo esconde enquanto o musico usa a copia que vem na animacao
    solto(vio_i, "Palco_Violao", obs["Palco_Suporte_Violao"].matrix_basis @ mg_vio, "violao")
    solto(cav_i, "Palco_Cavaquinho", obs["Palco_Suporte_Cavaquinho"].matrix_basis @ mg_cav, "cavaquinho")
    mb = B.Mesh("PL_Baquetas")
    for M in baquetas_no_surdo():
        baqueta(mb, M)
    solto(prototipo(mb), "Palco_Baquetas", obs["Palco_Bateria"].matrix_basis.copy(), "baquetas")
    m1 = B.Mesh("PL_Baqueta")
    baqueta(m1, Matrix.Identity(4))
    prototipo(m1)
    # lugares dos musicos: onde o personagem fica em pe no comeco e no fim das animacoes (frente = -Y local)
    giro = Matrix.Rotation(math.pi, 4, 'Z')
    lugar("violao", obs["Palco_Suporte_Violao"].matrix_basis @ Matrix.Translation((0, -LUGAR_VIO, 0)) @ giro,
          "Palco_Banqueta_Esq", "Palco_Violao")
    lugar("cavaquinho", obs["Palco_Suporte_Cavaquinho"].matrix_basis @ Matrix.Translation((0, -LUGAR_CAV, 0)) @ giro,
          "Palco_Banqueta_Dir", "Palco_Cavaquinho")
    lugar("bateria", obs["Palco_Bateria"].matrix_basis @ Matrix.Translation(LUGAR_BAT), "Palco_Bateria", "Palco_Baquetas")
    lugar("vocal", obs["Palco_Pedestal_Vocal"].matrix_basis @ Matrix.Translation((0, LUGAR_VOC, 0)), "", "")
    return obs


SOLTOS = ("Palco_Violao", "Palco_Cavaquinho", "Palco_Baquetas")
ALT_BANQ = 0.66                                        # assento das banquetas do palco (a do bar tem 0,81 m)
LUGAR_VIO, LUGAR_CAV, LUGAR_VOC = 0.42, 0.36, 0.42     # distancia do lugar ate o suporte / pedestal
LUGAR_BAT = (BANCO_BAT[0] - 0.45, BANCO_BAT[1], 0.0)   # local da bateria: em pe ao lado (a direita) do banco
CLIPES = ("sentar_pegar", "comecar_tocar", "tocando_loop", "parar_sair")


def solto(me, nome, M, tipo):
    o = bpy.data.objects.new(nome, me)
    B.coll(INTB).objects.link(o)
    o.matrix_world = M
    o["interativo"] = "instrumento"
    o["instrumento"] = tipo
    o["descricao"] = "Fica no palco; some enquanto alguem toca (a animacao traz a copia que vai para a mao)"
    return o


def lugar(nome, M, assento, instrumento):
    e = bpy.data.objects.new("Palco_Lugar_" + nome.capitalize(), None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = 0.3
    e.matrix_world = M
    e["interativo"] = "palco_lugar"
    e["lugar"] = nome
    e["animacoes"] = "palco_%s.glb" % nome
    clipes = ("chegar_pegar", "comecar_cantar", "cantando_loop", "parar_sair") if nome == "vocal" else CLIPES
    e["clipes"] = ",".join("%s_%s" % (nome, c) for c in clipes)
    if assento:
        e["assento"] = assento
    if instrumento:
        e["instrumento"] = instrumento
    e["descricao"] = "Personagem em pe aqui, de frente para +Z local (three.js), no comeco e no fim das animacoes"
    B.coll(INTB).objects.link(e)
    return e


SOMBRAS = []


def cabos(obs):
    c = B.Mesh("Palco_Cabos")
    z = ZS + 0.0075
    caixa_y = 24.95 - 0.09

    def mundo(nome, p):
        return obs[nome].matrix_basis @ Vector(p)       # objetos recem-criados: matrix_world so atualiza no depsgraph

    def rota(p0, ctrl, xs, r=0.0045):
        pts = [Vector(p0)] + [Vector((x, y, z)) for (x, y) in ctrl] + [Vector((xs, caixa_y - 0.04, z)), Vector((xs, caixa_y - 0.01, ZS + 0.05))]
        cabo(c, pts, r, "Cabo_Palco", segs=6, n=5)
    p = mundo("Palco_Pedestal_Esq", FIM_CABO)
    rota(p, [(p.x + 0.35, p.y + 0.3), (25.25, 23.9), (26.2, 24.5)], XC - 0.105)
    p = mundo("Palco_Pedestal_Vocal", FIM_CABO)
    rota(p, [(p.x + 0.1, p.y + 0.5), (XC + 0.25, 23.6), (XC + 0.05, 24.4)], XC - 0.035)
    p = mundo("Palco_Pedestal_Dir", FIM_CABO)
    rota(p, [(p.x + 0.2, p.y + 0.35), (28.1, 23.95), (27.2, 24.5)], XC + 0.035)
    for k, (dx, ctrl) in enumerate(((-0.105, [(24.0, 22.2), (23.7, 23.4), (25.6, 24.6)]),
                                    (0.105, [(26.25, 22.2), (25.95, 23.3), (26.55, 24.3)]),
                                    (0.035, [(29.3, 22.2), (29.6, 23.0), (27.6, 24.55)])), 1):
        p0 = mundo("Palco_Retorno_%d" % k, (0.2, -0.18, 0.06))
        p1 = mundo("Palco_Retorno_%d" % k, (0.3, -0.2, 0.0075))
        cabo(c, [p0, p1] + [Vector((x, y, z)) for (x, y) in ctrl] + [Vector((XC + dx, caixa_y - 0.04, z)),
                                                                     Vector((XC + dx, caixa_y - 0.01, ZS + 0.1))], 0.0045, "Cabo_Palco", n=5)
    for nome, ctrl in (("Palco_Amp_Guitarra", [(23.2, 25.45), (23.0, 25.7)]), ("Palco_Amp_Baixo", [(24.5, 25.5), (24.9, 25.72)]),
                       ("Palco_PA_Esq", [(22.2, 22.75), (21.95, 23.1)]), ("Palco_PA_Dir", [(31.1, 22.75), (31.35, 23.2)]),
                       ("Palco_Mesa_Som", [(22.2, 24.9), (22.3, 25.6)])):
        p0 = mundo(nome, (0.15, 0.10 if "PA" not in nome else 0.36, 0.2))
        p1 = mundo(nome, (0.15, 0.25 if "PA" not in nome else 0.42, 0.0075))
        cabo(c, [p0, p1] + [Vector((x, y, z)) for (x, y) in ctrl], 0.0055, "Cabo_Palco", n=5)
    construir(c, ang=70)


def sombras():
    s = B.Mesh("Palco_Sombras")
    for (x, y, z, rx, ry, rot) in SOMBRAS:
        a = math.radians(rot)
        ca, sa = math.cos(a), math.sin(a)
        pts = [(x + u * rx * ca - v * ry * sa, y + u * rx * sa + v * ry * ca, z + 0.004) for (u, v) in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        s.face(pts, "Sombra_Contato", uvs=[(0.0, 0.0), (0.5, 0.0), (0.5, 1.0), (0.0, 1.0)], facing=(0, 0, 1))
    construir(s)


def iluminacao():
    il = B.Mesh("Palco_Iluminacao")
    zb = ZT0 + 0.024
    for x in (23.0, 24.3, 25.6, 27.7, 29.0, 30.3):                         # frente: luz branca na banda
        par_led(il, FX, (x, TY0 + CORDA, zb), (x + (XC - x) * 0.3, 23.4, ZS + 1.3), cor_fx=False)
    for x in (22.45, 23.25, 30.05, 30.85):                                  # fundo (fora do telao): contra, para a plateia
        par_led(il, FX, (x, TY1 - CORDA, zb), (x + (XC - x) * 0.25, 19.5, ZP))
    for (x, sx) in ((TX0 + CORDA, 1), (TX1 - CORDA, -1)):                    # laterais: moving heads cruzando o palco
        for y in (22.95, 24.35):
            cabeca_movel(il, FX, (x, y, zb), (XC + sx * 1.6, 20.6, ZP))
    for (x, y) in ((22.25, 24.92), (31.07, 24.92)):                         # chao: barras de LED lavando as torres
        barra_led(il, FX, (x, y, ZS), 90)
    construir(il, ang=40)


def luzes():
    lp = bpy.data.objects.get("Luz_Palco")
    if lp is not None and lp.type == 'LIGHT':
        lp.location = (XC, 21.2, 4.9)
        lp.data.energy = 260
        lp.data.color = (1.0, 0.9, 0.78)
        lp.data.shadow_soft_size = 0.4
    ld = bpy.data.lights.get("Luz_Palco_Cor") or bpy.data.lights.new("Luz_Palco_Cor", 'POINT')
    ld.energy = 140
    ld.color = COR_FX
    ld.shadow_soft_size = 0.3
    ld.use_shadow = False
    lc = bpy.data.objects.new("Luz_Palco_Cor", ld)
    lc.location = (XC, 24.75, 4.75)
    lc["fx"] = "luz_palco_ponto"
    lc["descricao"] = "Contraluz do palco: mesma cor do emissive de Palco_Luz"
    B.coll(LUZ).objects.link(lc)


REF = os.path.join(B.ROOT, "anim", "palco_ref.blend")


def referencia(m_bateria):
    """palco_ref.blend: palco, soltos e lugares para o 16_animacoes_palco.py (roda no Blender em segundo plano).
    As baquetas vao tambem separadas (Ref_Baqueta_1/2, fora da cena): cada uma vira um objeto na animacao."""
    os.makedirs(os.path.dirname(REF), exist_ok=True)
    dados = set(bpy.data.collections[COL].objects)
    dados |= {o for o in bpy.data.collections[INTB].objects if o.name.startswith(("Palco_", "Telao_"))}
    tmp = []
    for k, M in enumerate(baquetas_no_surdo(), 1):
        o = bpy.data.objects.new("Ref_Baqueta_%d" % k, bpy.data.meshes["PL_Baqueta"])
        o.matrix_world = m_bateria @ M
        tmp.append(o)
    try:
        bpy.data.libraries.write(REF, dados | set(tmp), path_remap='ABSOLUTE', compress=True)
    finally:
        for o in tmp:
            bpy.data.objects.remove(o, do_unlink=True)


# ------------------------------------------------------------------ rodar
limpar()
texturas()
materiais()
FX = B.Mesh("Palco_FX_Luz")
estrutura()
trelicas()
cobertura()
tela = telao()
obs = pecas()
cabos(obs)
sombras()
iluminacao()
fx = construir(FX, col=INTB)
fx["fx"] = "luz_palco"
fx["cor_padrao"] = "#%02x%02x%02x" % tuple(int(round(255 * (c ** (1 / 2.2)))) for c in COR_FX)
fx["descricao"] = "Lentes dos refletores coloridos e fita de LED do palco (material Palco_Luz): mude material.emissive"
luzes()
referencia(obs["Palco_Bateria"].matrix_basis)
tris = 0
for o in list(bpy.data.collections[COL].objects) + [tela, fx]:
    o.data.calc_loop_triangles()
    tris += len(o.data.loop_triangles)
print("palco: %d objetos, %d tris | telao %.2f x %.2f m, centro (%.2f, %.2f, %.2f), base %.2f m acima do piso do palco"
      % (len(bpy.data.collections[COL].objects) + 2, tris, TEL_W, TEL_H, tela.location.x, tela.location.y, tela.location.z,
         TEL_Z0 - ZS))
