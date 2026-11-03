# Geladeira expositora Highland refeita (substitui P_Geladeira_Expositor do 36_bar_polimento; as 4 instancias trocam juntas).
# Visual da geladeira path_fridge do usuario (Desktop\BAR\2.0\Geladeira de Cerveja): corpo preto, laterais com a arte
# synthwave + logo Highland Bar, letreiro "CERVEJA GELADA" iluminado, porta de vidro com neon azul/rosa, grade neon
# no rodape e o interior iluminado cheio de latas (rotulos do usuario) e long necks.
# Mesmo envelope do prop antigo (0,70 x 0,66 x 1,95 m, origem no chao, frente -Y): posicoes, colisores e sombras
# do 06_interior continuam valendo. Atlas: 41_geladeira_textura.py (rode antes). Materiais Pgn_*: 38.
import math, random
from mathutils import Vector, Matrix
import barlib as B
import pollib as P

B.material("Geladeira_Arte", tex="geladeira_highland.jpg", rough=0.3, emis_tex=True, emis_str=0.7)
B.material("Geladeira_Latas", tex="geladeira_highland.jpg", rough=0.3, emis_tex=True, emis_str=0.3)   # latas iluminadas pelo LED interno
B.material("Gel_Neon_Ciano", color=(0.1, 0.6, 1.0), emis=(0.1, 0.75, 1.0), emis_str=4.0, rough=0.3)
B.material("Gel_Neon_Rosa", color=(1.0, 0.1, 0.6), emis=(1.0, 0.05, 0.65), emis_str=4.0, rough=0.3)
B.material("Gel_LED", color=(0.9, 0.95, 1.0), emis=(0.85, 0.92, 1.0), emis_str=5.0, rough=0.3)
B.material("Gel_Rotulo", color=(0.86, 0.80, 0.62), rough=0.6)
PP, PB, MP, IX = "Pgn_Plastico_Preto", "Pgn_Plastico_Branco", "Pgn_Metal_Preto", "Pgn_Inox"
ART, LAT = "Geladeira_Arte", "Geladeira_Latas"
AW, AH = 2048, 1024
rnd = random.Random(5)


def T(*v):
    return Matrix.Translation(Vector(v))


def RX(a):
    return Matrix.Rotation(math.radians(a), 4, 'X')


def uvr(x0, y0, x1, y1, ins=2):
    """Retangulo do atlas em pixels -> (u0, v0, u1, v1)."""
    return ((x0 + ins) / AW, 1 - (y1 - ins) / AH, (x1 - ins) / AW, 1 - (y0 + ins) / AH)


R_LAT, R_TEST, R_GRADE, R_FUNDO = uvr(0, 0, 340, 1024), uvr(350, 0, 1374, 340), uvr(350, 350, 1374, 582), uvr(1390, 0, 2048, 582)
R_ROT = [uvr(350 + (i % 5) * 339, 600 + (i // 5) * 212, 350 + (i % 5 + 1) * 339, 600 + (i // 5 + 1) * 212) for i in range(9)]


def painel(m, pts, mat, r):
    """Quad com o retangulo r do atlas (pts em ordem: baixo-esq, baixo-dir, cima-dir, cima-esq de quem olha)."""
    u0, v0, u1, v1 = r
    m.face(pts, mat, uvs=[(u0, v0), (u1, v0), (u1, v1), (u0, v1)])


def lata(m, x, y, z, rot, h=0.122, r=0.033, segs=10):
    """Lata com rotulo em volta (u) e tampa de aluminio; centro do rotulo virado para -Y."""
    u0, v0, u1, v1 = rot
    bm = m.bm
    vb, vt = [], []
    for k in range(segs + 1):                               # costura com verts duplicados (UV continua)
        a = math.radians(-270) + 2 * math.pi * k / segs
        vb.append(Vector((x + r * math.cos(a), y + r * math.sin(a), z)))
        vt.append(Vector((x + r * math.cos(a), y + r * math.sin(a), z + h)))
    for k in range(segs):
        uu0, uu1 = u0 + (u1 - u0) * k / segs, u0 + (u1 - u0) * (k + 1) / segs
        m.face([vb[k], vb[k + 1], vt[k + 1], vt[k]], LAT, uvs=[(uu0, v0), (uu1, v0), (uu1, v1), (uu0, v1)], smooth=True)
    topo = [Vector((x + 0.88 * r * math.cos(2 * math.pi * k / segs), y + 0.88 * r * math.sin(2 * math.pi * k / segs), z + h + 0.006))
            for k in range(segs)]
    m.face(topo, IX, facing=(0, 0, 1))
    for k in range(segs):                                   # ombro da lata
        j = (k + 1) % segs
        m.face([vt[k], vt[k + 1] if k + 1 < segs else vt[0], topo[j], topo[k]], IX, smooth=True, facing=(vt[k] - Vector((x, y, z))))


m = B.Mesh("P_Geladeira_Expositor")
X0, X1, YF, YB, Z0, Z1 = -0.35, 0.35, -0.30, 0.33, 0.0, 1.95
ZI0, ZI1, XI, YI0, YI1 = 0.20, 1.68, 0.31, -0.29, 0.29             # cavidade interna
# ------------------------------------------------------------ carcaca preta
P.caixa(m, (X0, YF, ZI0 - 0.02), (-XI, YB, Z1), PP, r=0.012)
P.caixa(m, (XI, YF, ZI0 - 0.02), (X1, YB, Z1), PP, r=0.012)
P.caixa(m, (-XI, YI1, ZI0), (XI, YB, ZI1), PP, r=0.0, skip=('ny',))
P.caixa(m, (-XI, YF, ZI1), (XI, YB, Z1), PP, r=0.008, mats={'nz': "Gel_LED"})
P.caixa(m, (-0.34, -0.325, Z0), (0.34, 0.32, ZI0), PP, r=0.008)                       # rodape
# laterais com a arte (de quem olha de fora: esquerda -> direita)
ZA0, ZA1 = 0.10, 1.92
painel(m, [(X0 - 0.002, YB - 0.02, ZA0), (X0 - 0.002, YF + 0.01, ZA0), (X0 - 0.002, YF + 0.01, ZA1), (X0 - 0.002, YB - 0.02, ZA1)], ART, R_LAT)
painel(m, [(X1 + 0.002, YF + 0.01, ZA0), (X1 + 0.002, YB - 0.02, ZA0), (X1 + 0.002, YB - 0.02, ZA1), (X1 + 0.002, YF + 0.01, ZA1)], ART, R_LAT)
# letreiro do topo e grade do rodape
P.caixa(m, (X0, -0.335, 1.68), (X1, YF, Z1), PP, r=0.01)
painel(m, [(-0.335, -0.337, 1.70), (0.335, -0.337, 1.70), (0.335, -0.337, 1.93), (-0.335, -0.337, 1.93)], ART, R_TEST)
painel(m, [(-0.33, -0.327, 0.02), (0.33, -0.327, 0.02), (0.33, -0.327, 0.18), (-0.33, -0.327, 0.18)], ART, R_GRADE)
# interior: fundo iluminado, paredes brancas, piso
painel(m, [(-XI, YI1 - 0.001, ZI0), (XI, YI1 - 0.001, ZI0), (XI, YI1 - 0.001, ZI1), (-XI, YI1 - 0.001, ZI1)], ART, R_FUNDO)
m.face([(-XI + 0.001, YF, ZI0), (-XI + 0.001, YI1, ZI0), (-XI + 0.001, YI1, ZI1), (-XI + 0.001, YF, ZI1)], PB, facing=(1, 0, 0))
m.face([(XI - 0.001, YF, ZI0), (XI - 0.001, YI1, ZI0), (XI - 0.001, YI1, ZI1), (XI - 0.001, YF, ZI1)], PB, facing=(-1, 0, 0))
m.face([(-XI, YF, ZI0 + 0.001), (XI, YF, ZI0 + 0.001), (XI, YI1, ZI0 + 0.001), (-XI, YI1, ZI0 + 0.001)], PB, facing=(0, 0, 1))
for s in (-1, 1):                                                                      # fitas de LED verticais
    P.caixa(m, (s * (XI - 0.004) - 0.004, YF + 0.01, ZI0 + 0.02), (s * (XI - 0.004) + 0.004, YF + 0.02, ZI1 - 0.02), "Gel_LED", r=0.0)

# ------------------------------------------------------------ prateleiras e bebidas
NIVEIS = (ZI0, 0.555, 0.91, 1.265)
for z in NIVEIS[1:]:
    P.caixa(m, (-XI + 0.005, YI0 + 0.02, z - 0.008), (XI - 0.005, YI1 - 0.01, z), IX, r=0.002)
    P.caixa(m, (-XI + 0.005, YI0 + 0.01, z - 0.03), (XI - 0.005, YI0 + 0.022, z + 0.012), "Gel_Rotulo", r=0.002)   # etiqueta de preco
for nv, z in enumerate(NIVEIS[:3]):
    for c in range(5):
        x = -0.24 + c * 0.12
        rot = R_ROT[(nv * 5 + c) % 9]
        for (y, alt) in ((-0.205, 2), (-0.13, 2), (-0.055, 1)):
            for a in range(alt):
                lata(m, x + rnd.uniform(-0.004, 0.004), y, z + a * 0.128 + 0.001, rot)
for row, y in enumerate((-0.20, -0.11)):                                               # long necks na prateleira de cima
    for c in range(6):
        x = -0.25 + c * 0.1
        vidro = "Garrafa_Verde" if (c + row) % 3 == 0 else "Garrafa_Ambar"
        P.torno(m, [(0.0, 0.0), (0.029, 0.0), (0.031, 0.01), (0.031, 0.05, 'q'), (0.0315, 0.05), (0.0315, 0.12, 'q'), (0.031, 0.12),
                    (0.03, 0.15), (0.014, 0.19), (0.012, 0.225), (0.014, 0.23, 'q'), (0.0, 0.232)],
                vidro, segs=10, M=T(x, y, NIVEIS[3]),
                mats=[vidro, vidro, vidro, "Gel_Rotulo", "Gel_Rotulo", vidro, vidro, vidro, vidro, "Pgn_Plastico_Vermelho", "Pgn_Plastico_Vermelho"])

# ------------------------------------------------------------ porta de vidro com neon
YP0, YP1 = -0.335, -0.302
for (a, b) in (((X0 + 0.005, 0.20), (-0.30, 1.68)), ((0.30, 0.20), (X1 - 0.005, 1.68)), ((-0.30, 0.20), (0.30, 0.25)), ((-0.30, 1.63), (0.30, 1.68))):
    P.caixa(m, (a[0], YP0, a[1]), (b[0], YP1, b[1]), MP, r=0.006)
P.caixa(m, (-0.302, YP0 - 0.002, 0.25), (-0.294, YP0 + 0.004, 1.63), "Gel_Neon_Ciano", r=0.0)
P.caixa(m, (0.294, YP0 - 0.002, 0.25), (0.302, YP0 + 0.004, 1.63), "Gel_Neon_Rosa", r=0.0)
P.caixa(m, (-0.30, YP0 - 0.002, 1.622), (0.30, YP0 + 0.004, 1.63), "Gel_Neon_Rosa", r=0.0)
P.caixa(m, (-0.30, YP0 - 0.002, 0.25), (0.30, YP0 + 0.004, 0.258), "Gel_Neon_Ciano", r=0.0)
m.face([(-0.30, -0.318, 0.25), (0.30, -0.318, 0.25), (0.30, -0.318, 1.63), (-0.30, -0.318, 1.63)], "Vidro", facing=(0, -1, 0))
P.tubo(m, [(0.322, YP0, 0.62), (0.322, -0.372, 0.65), (0.322, -0.372, 1.30), (0.322, YP0, 1.33)], 0.011, IX, segs=8)
for z in (0.32, 1.55):                                                                 # dobradicas
    P.caixa(m, (X0 - 0.004, -0.34, z), (X0 + 0.03, -0.31, z + 0.06), MP, r=0.003)

me = P.substituir("P_Geladeira_Expositor", m)
print("P_Geladeira_Expositor: %d tris" % P.tris(me), [x.name for x in me.materials])
