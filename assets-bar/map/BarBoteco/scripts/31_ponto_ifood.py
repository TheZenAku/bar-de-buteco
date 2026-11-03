# Ponto de retirada "Highland Bar Delivery" (ponto de iFood da cidade) - etapa 2: modelo.
# Roda com exec no Blender MCP (refaz tudo a cada execucao). Texturas: rodar antes o 30_ponto_ifood_texturas.py.
# Armario inteligente de retirada no lugar do cubo-guia "PONTO DE IFOOD" (colecao PROPS-CRIADOS-MANUALMENTE):
#   base de concreto, gabinete em pintura eletrostatica vermelha com 10 portas numeradas (puxador escovado, LED de
#   status), coluna de atendimento (tela, leitor de QR, prateleira com sacola, porta de servico), letreiro luminoso
#   frente/tras, marquise com fita de LED e placa-bandeira dupla face com o emblema (visivel de quem vem pela rua).
# Frente = -X (para a rua). Origem no centro da base, no topo da calcada. 1 objeto (Ponto_iFood) na colecao
# Exterior_Mobiliario (vai junto com o bairro no 08_export) + caixa COL_Ponto_iFood em Colisores.
# O cubo-guia fica oculto e marcado com pipeline_proprio (o 09_assets nao gera OTM_ dele).
import bpy, bmesh, math, sys
from mathutils import Vector, Matrix
SP = r"C:\Users\rafael\BarBoteco\scripts"
if SP not in sys.path:
    sys.path.insert(0, SP)
import importlib
import barlib as B
importlib.reload(B)

GUIA = "PONTO DE IFOOD"
NOME = "Ponto_iFood"
COLECAO = "Exterior_Mobiliario"
SETOR = "S04_04"
ATLAS = {                                 # mesmas caixas do 30_ponto_ifood_texturas.py (pixels, origem em cima)
    "logo": (0, 0, 512, 512),
    "tela": (512, 0, 768, 384),
    "numeros": (768, 0, 1024, 256),
    "sacola": (768, 256, 1024, 512),
    "kraft": (772, 262, 800, 290),
    "qr": (512, 384, 640, 512),
    "aviso": (640, 384, 768, 512),
    "faixa": (0, 512, 1024, 640),
    "faixa_tras": (0, 640, 1024, 768),
    "lateral": (0, 768, 1024, 1024),
}
EPS = 0.0015                              # afastamento dos adesivos/telas (sem z-fighting)

# ---------------------------------------------------------------- materiais
VERM, GRAF, ACO = "Ifood_Pintura_Vermelha", "Ifood_Pintura_Grafite", "Ifood_Aco_Escovado"
ADES, LUZ = "Ifood_Atlas", "Ifood_Atlas_Luz"
LED, LED_V, LED_R = "Ifood_LED", "Ifood_LED_Verde", "Ifood_LED_Vermelho"
B.material(VERM, color=(0.60, 0.035, 0.03), tex="ponto_ifood_pintura.jpg", tile=(0.6, 0.6), rough=0.42,
           normal="ponto_ifood_pintura_n.jpg", nstr=0.35)
B.material(GRAF, color=(0.075, 0.075, 0.085), tex="ponto_ifood_pintura.jpg", tile=(0.6, 0.6), rough=0.62,
           normal="ponto_ifood_pintura_n.jpg", nstr=0.35)
B.material(ACO, tex="ponto_ifood_escovado.jpg", tile=(0.3, 0.3), rough=0.32, metal=1.0)
B.material(ADES, tex="ponto_ifood_atlas.jpg", rough=0.45)
B.material(LUZ, tex="ponto_ifood_atlas.jpg", rough=0.3, emis_tex=True, emis_str=1.6)
B.material(LED, color=(1.0, 0.86, 0.62), emis=(1.0, 0.86, 0.62), emis_str=6.0)
B.material(LED_V, color=(0.15, 1.0, 0.3), emis=(0.15, 1.0, 0.3), emis_str=4.0)
B.material(LED_R, color=(1.0, 0.08, 0.05), emis=(1.0, 0.08, 0.05), emis_str=4.0)
CONC, BORR = "Concreto", "Borracha_Preta"          # do bar


# ---------------------------------------------------------------- utilitarios de geometria
def caixa(m, mn, mx, mat, r=0.0, segs=2, M=None):
    """Caixa com quinas arredondadas (bevel real na malha)."""
    a, b = Vector(mn), Vector(mx)
    mn = Vector((min(a.x, b.x), min(a.y, b.y), min(a.z, b.z)))      # limites em qualquer ordem
    mx = Vector((max(a.x, b.x), max(a.y, b.y), max(a.z, b.z)))
    S = Matrix.Translation((mn + mx) / 2) @ Matrix.Diagonal((mx.x - mn.x, mx.y - mn.y, mx.z - mn.z, 1.0))
    vs = bmesh.ops.create_cube(m.bm, size=1.0, matrix=(M @ S) if M is not None else S)["verts"]
    mi = m._mi(mat)
    for f in {f for v in vs for f in v.link_faces}:
        f.material_index = mi
        f.smooth = True
    if r > 0:
        ed = list({e for v in vs for e in v.link_edges})
        bmesh.ops.bevel(m.bm, geom=ed, offset=r, offset_type='OFFSET', segments=segs, profile=0.5,
                        affect='EDGES', clamp_overlap=True)


def uvr(k):
    x0, y0, x1, y1 = ATLAS[k]
    return x0 / 1024, 1 - y1 / 1024, x1 / 1024, 1 - y0 / 1024


def quad(m, c, n, w, h, mat, rect=None, up=(0, 0, 1)):
    """Retangulo w x h centrado em c, virado para n; rect = (u0, v0, u1, v1) do atlas, sem espelhar."""
    c, n, up = Vector(c), Vector(n).normalized(), Vector(up)
    r = up.cross(n).normalized()
    pts = [c - r * w / 2 - up * h / 2, c + r * w / 2 - up * h / 2, c + r * w / 2 + up * h / 2, c - r * w / 2 + up * h / 2]
    uvs = None
    if rect:
        u0, v0, u1, v1 = rect
        uvs = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    return m.face(pts, mat, uvs=uvs)


def placa_xz(m, poly, y0, y1, mat):
    """Chapa: poligono no plano XZ extrudado de y0 a y1 (mao-francesa da prateleira)."""
    ctr = Vector((sum(p[0] for p in poly) / len(poly), (y0 + y1) / 2, sum(p[1] for p in poly) / len(poly)))
    m.face([(x, y0, z) for x, z in poly], mat, away=ctr)
    m.face([(x, y1, z) for x, z in poly], mat, away=ctr)
    for i in range(len(poly)):
        (xa, za), (xb, zb) = poly[i], poly[(i + 1) % len(poly)]
        m.face([(xa, y0, za), (xb, y0, zb), (xb, y1, zb), (xa, y1, za)], mat, away=ctr)


def cilindro_x(m, y, z, x0, x1, r, mat, segs=12):
    """Cilindro deitado no eixo X (de x1 para x0, x0 < x1)."""
    M = Matrix.Translation((x1, y, z)) @ Matrix.Rotation(math.radians(-90), 4, 'Y')
    m.cyl(r, x1 - x0, mat, segs=segs, M=M)


# ---------------------------------------------------------------- limpeza (idempotente)
for n in (NOME, "COL_" + NOME):
    o = bpy.data.objects.get(n)
    if o is not None:
        bpy.data.objects.remove(o, do_unlink=True)
me_old = bpy.data.meshes.get(NOME)
if me_old is not None and me_old.users == 0:
    bpy.data.meshes.remove(me_old)

guia = bpy.data.objects[GUIA]
gbb = [guia.matrix_world @ Vector(v) for v in guia.bound_box]
BASE = Vector((sum(v.x for v in gbb) / 8, sum(v.y for v in gbb) / 8, min(v.z for v in gbb)))   # centro da base do cubo

m = B.Mesh(NOME)
HD, HW = 0.31, 0.65                       # meia profundidade (X) e meia largura (Y) do gabinete
XF = -0.318                               # face do painel frontal (grafite), atras das portas
XP = -0.334                               # face das portas

# ---------------------------------------------------------------- base, rodape e gabinete
caixa(m, (-0.37, -0.71, 0.0), (0.37, 0.71, 0.07), CONC, r=0.012)
caixa(m, (-0.28, -0.62, 0.07), (0.28, 0.62, 0.17), GRAF, r=0.006)
caixa(m, (-HD, -HW, 0.17), (HD, HW, 2.02), VERM, r=0.03, segs=3)
caixa(m, (XF, -0.615, 0.20), (-0.30, 0.615, 1.94), GRAF, r=0.004)          # painel frontal (frestas escuras)

# ---------------------------------------------------------------- portas do armario (2 colunas x 5 linhas)
G = 0.007
ALT = [0.40, 0.38, 0.32, 0.31, 0.31]      # de baixo para cima
Y0, Y1 = -0.165, 0.605
CW = (Y1 - Y0 - G) / 2
OCUPADAS = {3, 7}
for r, h in enumerate(ALT):
    z0 = 0.21 + sum(ALT[:r]) + G / 2
    z1 = z0 + h - G
    zm = (z0 + z1) / 2
    for c in range(2):
        ya = Y1 - CW if c == 0 else Y0           # c = 0: coluna da esquerda de quem olha (+Y)
        yb = ya + CW
        num = (len(ALT) - 1 - r) * 2 + c + 1
        caixa(m, (XP, ya, z0), (XF, yb, z1), VERM, r=0.004)
        # numero (canto superior esquerdo de quem olha)
        k = num - 1
        nx0, ny0, _, _ = ATLAS["numeros"]
        u0, v0 = (nx0 + (k % 4) * 64 + 2) / 1024, 1 - (ny0 + (k // 4) * 64 + 62) / 1024
        quad(m, (XP - EPS, yb - 0.045, z1 - 0.04), (-1, 0, 0), 0.05, 0.05, ADES, rect=(u0, v0, u0 + 60 / 1024, v0 + 60 / 1024))
        # puxador vertical (barra + 2 apoios) e LED de status, na borda direita de quem olha (-Y)
        yh = ya + 0.035
        caixa(m, (-0.358, yh - 0.007, zm - 0.06), (-0.348, yh + 0.007, zm + 0.06), ACO, r=0.0035)
        for dz in (-0.045, 0.045):
            caixa(m, (-0.348, yh - 0.005, zm + dz - 0.005), (XP, yh + 0.005, zm + dz + 0.005), ACO)
        caixa(m, (XP - 0.004, yh - 0.006, zm + 0.085), (XP, yh + 0.006, zm + 0.097),
              LED_R if num in OCUPADAS else LED_V, r=0.0015, segs=1)
        if r == 0:                                # ventilacao nas portas grandes de baixo
            for i in range(4):
                zs = z0 + 0.04 + i * 0.022
                caixa(m, (XP - 0.002, ya + 0.08, zs), (XP, yb - 0.08, zs + 0.008), GRAF)

# ---------------------------------------------------------------- coluna de atendimento (-Y)
CY0, CY1 = -0.605, -0.185
CYM = (CY0 + CY1) / 2
# porta de servico com fechadura + adesivos (QR e instrucoes)
caixa(m, (XP, CY0, 0.21 + G / 2), (XF, CY1, 0.88), VERM, r=0.004)
cilindro_x(m, CY1 - 0.04, 0.80, XP - 0.008, XP, 0.012, ACO)
quad(m, (XP - EPS, CYM - 0.075, 0.70), (-1, 0, 0), 0.10, 0.10, ADES, rect=uvr("qr"))
quad(m, (XP - EPS, CYM + 0.065, 0.70), (-1, 0, 0), 0.11, 0.11, ADES, rect=uvr("aviso"))
# prateleira dobravel de aco com aba e maos-francesas
caixa(m, (-0.56, -0.59, 0.905), (XF, -0.20, 0.925), ACO, r=0.004)
caixa(m, (-0.565, -0.59, 0.905), (-0.55, -0.20, 0.945), ACO, r=0.004)
for yb in (-0.57, -0.23):
    placa_xz(m, [(XF, 0.905), (-0.52, 0.905), (XF, 0.72)], yb - 0.004, yb + 0.004, GRAF)
# leitor de QR (corpo grafite, janela vermelha acesa)
caixa(m, (-0.39, -0.36, 1.00), (XF, -0.22, 1.10), GRAF, r=0.01)
caixa(m, (-0.3915, -0.34, 1.035), (-0.385, -0.24, 1.065), LED_R, r=0.002, segs=1)
# tela touch com moldura de borracha
caixa(m, (-0.355, -0.56, 1.14), (XF, -0.23, 1.64), BORR, r=0.012, segs=3)
quad(m, (-0.355 - EPS, CYM, 1.39), (-1, 0, 0), 0.26, 0.39, LUZ, rect=uvr("tela"))
# plaquinha do emblema no topo da coluna
caixa(m, (XP, CY0, 1.665), (XF, CY1, 1.93), VERM, r=0.004)
quad(m, (XP - EPS, CYM, 1.7975), (-1, 0, 0), 0.24, 0.24, ADES, rect=uvr("logo"))

# ---------------------------------------------------------------- sacola kraft lacrada na prateleira
SX0, SX1, SY0, SY1, SZ0, SZ1 = -0.53, -0.42, -0.56, -0.38, 0.925, 1.145
kr = uvr("kraft")
sm = Vector(((SX0 + SX1) / 2, (SY0 + SY1) / 2, (SZ0 + SZ1) / 2))
quad(m, (SX0, sm.y, sm.z), (-1, 0, 0), SY1 - SY0, SZ1 - SZ0, ADES, rect=uvr("sacola"))
quad(m, (SX1, sm.y, sm.z), (1, 0, 0), SY1 - SY0, SZ1 - SZ0, ADES, rect=uvr("sacola"))
quad(m, (sm.x, SY0, sm.z), (0, -1, 0), SX1 - SX0, SZ1 - SZ0, ADES, rect=kr)
quad(m, (sm.x, SY1, sm.z), (0, 1, 0), SX1 - SX0, SZ1 - SZ0, ADES, rect=kr)
quad(m, (sm.x, sm.y, SZ1), (0, 0, 1), SY1 - SY0, SX1 - SX0, ADES, rect=kr, up=(1, 0, 0))
# dobra do topo + lacre vermelho
FX0, FX1 = sm.x - 0.022, sm.x + 0.022
fm = Vector((sm.x, sm.y, SZ1 + 0.02))
quad(m, (FX0, fm.y, fm.z), (-1, 0, 0), SY1 - SY0, 0.04, ADES, rect=kr)
quad(m, (FX1, fm.y, fm.z), (1, 0, 0), SY1 - SY0, 0.04, ADES, rect=kr)
quad(m, (fm.x, SY0, fm.z), (0, -1, 0), FX1 - FX0, 0.04, ADES, rect=kr)
quad(m, (fm.x, SY1, fm.z), (0, 1, 0), FX1 - FX0, 0.04, ADES, rect=kr)
quad(m, (fm.x, fm.y, SZ1 + 0.04), (0, 0, 1), SY1 - SY0, FX1 - FX0, ADES, rect=kr, up=(1, 0, 0))
caixa(m, (FX0 - 0.002, sm.y - 0.025, SZ1 + 0.005), (FX0, sm.y + 0.025, SZ1 + 0.035), VERM)

# ---------------------------------------------------------------- laterais (+Y/-Y) e traseira (+X)
for s in (-1, 1):
    y = s * (HW + EPS)
    quad(m, (0, y, 1.55), (0, s, 0), 0.50, 0.50, ADES, rect=uvr("logo"))
    quad(m, (0, y, 1.17), (0, s, 0), 0.54, 0.135, ADES, rect=uvr("lateral"))
# porta de manutencao traseira (frestas grafite) e grelha de ventilacao
XT = HD + 0.001
for (ya, yb, za, zb) in ((-0.55, 0.55, 0.30, 0.306), (-0.55, 0.55, 1.844, 1.85),
                         (-0.55, -0.544, 0.30, 1.85), (0.544, 0.55, 0.30, 1.85)):
    caixa(m, (HD - 0.001, ya, za), (XT + 0.001, yb, zb), GRAF)
cilindro_x(m, 0.47, 1.05, HD, HD + 0.008, 0.012, ACO)
for i in range(6):
    zs = 0.40 + i * 0.03
    caixa(m, (HD - 0.001, -0.30, zs), (XT + 0.003, 0.30, zs + 0.012), GRAF)

# ---------------------------------------------------------------- letreiro luminoso, marquise e fita de LED
caixa(m, (-0.33, -0.67, 2.02), (0.33, 0.67, 2.27), VERM, r=0.015, segs=2)
quad(m, (-0.33 - EPS, 0, 2.145), (-1, 0, 0), 1.28, 0.16, LUZ, rect=uvr("faixa"))
quad(m, (0.33 + EPS, 0, 2.145), (1, 0, 0), 1.28, 0.16, LUZ, rect=uvr("faixa_tras"))
caixa(m, (-0.72, -0.78, 2.27), (0.38, 0.78, 2.31), GRAF, r=0.008)                  # marquise
caixa(m, (-0.745, -0.785, 2.245), (-0.715, 0.785, 2.33), VERM, r=0.006)            # testeira vermelha
caixa(m, (-0.70, -0.74, 2.262), (-0.68, 0.74, 2.27), LED, r=0.003, segs=1)         # fita de LED sob a marquise
for s in (-1, 1):                                    # tirantes de aco (presos nas laterais, por fora do letreiro)
    m.tube((-0.27, s * 0.662, 1.95), (-0.66, s * 0.725, 2.27), 0.011, ACO, segs=10)
    caixa(m, (-0.30, s * 0.65, 1.925), (-0.24, s * 0.656, 1.975), ACO, r=0.002, segs=1)

# ---------------------------------------------------------------- placa-bandeira dupla face (emblema)
for x in (-0.24, 0.24):
    m.cyl(0.022, 0.13, ACO, segs=12, M=Matrix.Translation((x, 0, 2.30)))
caixa(m, (-0.37, -0.05, 2.42), (0.37, 0.05, 3.16), VERM, r=0.02, segs=3)
for s in (-1, 1):
    quad(m, (0, s * (0.05 + EPS), 2.79), (0, s, 0), 0.68, 0.68, LUZ, rect=uvr("logo"))

# ---------------------------------------------------------------- objeto, colisor, setor
me = m.mesh()
if hasattr(me, "use_auto_smooth"):
    me.use_auto_smooth = True
    me.auto_smooth_angle = math.radians(35)
ob = bpy.data.objects.new(NOME, me)
ob.location = BASE
ob["setor"] = SETOR
bpy.data.collections[COLECAO].objects.link(ob)
col = B.add_collider(NOME, BASE + Vector((-0.37, -0.71, 0.0)), BASE + Vector((0.37, 0.71, 2.33)))
col["setor"] = SETOR
guia.hide_set(True)
guia.hide_render = True
guia["pipeline_proprio"] = True
me.calc_loop_triangles()
print("%s: %d tris, %d materiais, base em %s" % (NOME, len(me.loop_triangles), len(me.materials), tuple(round(v, 3) for v in BASE)))
