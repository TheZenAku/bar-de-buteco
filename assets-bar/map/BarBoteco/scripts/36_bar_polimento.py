# Polimento do bar: refaz os props low poly (P_* do 05_props.py e os moveis unicos do 06_interior.py) com chanfros,
# solidos de revolucao, detalhes e texturas PBR (Poly Haven / procedurais, ver 33_texturas_pbr.py).
# Cada prop mantem nome da malha, dimensoes, origem (no chao) e frente (-Y) do original: posicoes, colisores
# e sombras de contato do 06_interior continuam valendo. Props repetidos saem como instancias de GPU
# (08_export.py: INST_PREFIXOS), entao o GLB nao cresce com a contagem de instancias.
# Os props importados (A_*: mesas, cadeiras, banquetas, copos, long-necks, chopeira, jukebox) ja eram detalhados.
import math, random
import bpy
from mathutils import Vector, Matrix
import barlib as B
import pollib as P

P.materiais()
B.material("Pol_Rotulo", color=(0.86, 0.80, 0.62), rough=0.6)
B.material("Pol_Plastico_Cinza", color=(0.16, 0.17, 0.18), rough=0.6)
B.material("Pol_Display", color=(0.1, 0.4, 0.15), emis=(0.25, 1.0, 0.45), emis_str=2.0, rough=0.3)
B.material("Pol_Esmalte_Verde", color=(0.03, 0.26, 0.10), rough=0.28)
B.material("Pol_LED", color=(1.0, 0.85, 0.6), emis=(1.0, 0.78, 0.5), emis_str=3.0)
R = B.mat_rz
ZP, ZP2 = B.Z_PISO, B.Z_PISO2
IX, ME, BP, V, PB = "Pol_Inox", "Metal_Escuro", "Borracha_Preta", "Plastico_Vermelho", "Plastico_Branco"
MV, ME_, GR, TJ = "Pol_Madeira_Verniz", "Pol_Madeira_Escura", "Pol_Granito", "Pol_Tijolo"
rel = {}
rnd = random.Random(7)


def novo(nome):
    return B.Mesh(nome)


def fim(m):
    antes = P.tris(bpy.data.meshes[m.name]) if m.name in bpy.data.meshes else 0
    me = P.substituir(m.name, m)
    rel[m.name] = (antes, P.tris(me))
    return me


def RX(a):
    return Matrix.Rotation(math.radians(a), 4, 'X')


def RY(a):
    return Matrix.Rotation(math.radians(a), 4, 'Y')


def RZ(a):
    return Matrix.Rotation(math.radians(a), 4, 'Z')


def T(*v):
    return Matrix.Translation(Vector(v))


def SC(x, y, z):
    return Matrix.Diagonal((x, y, z, 1.0))


def puxador(m, x, y, z0, z1, mat=IX, prof=0.03, r=0.007, M=None):
    """Puxador em U vertical saindo da face -Y."""
    P.tubo(m, [(x, y, z0), (x, y - prof, z0 + 0.015), (x, y - prof, z1 - 0.015), (x, y, z1)], r, mat, segs=6, M=M)


# =====================================================================  BALCOES (malhas unicas do 06_interior)
def balcao_trecho(m, M, L, D, z, top, gavetas=True):
    """Corpo do balcao no espaco local: x 0..L ao longo, y 0 (cliente) .. D (balconista), z absoluto."""
    cx = lambda *a, **k: P.caixa(m, *a, M=M, **k)
    cx((0, 0.05, z), (L, D, z + 0.10), GR, r=0.006, skip=('nz',))                       # rodape recuado
    cx((0, 0, z + 0.10), (L, D - 0.02, top), TJ, r=0.006, skip=('nz', 'pz'))
    cx((0, -0.012, top - 0.07), (L, 0.02, top), MV, r=0.008)                           # friso de madeira
    # lado do balconista: portas de armario a cada ~0,6 m
    n = max(1, int(L / 0.62))
    pw = L / n
    for k in range(n):
        x0 = k * pw + 0.02
        cx((x0, D - 0.025, z + 0.13), (x0 + pw - 0.04, D + 0.005, top - 0.03), MV, r=0.008)
        hx = x0 + (0.05 if k % 2 else pw - 0.09)
        P.tubo(m, [(hx, D + 0.005, top - 0.20), (hx, D + 0.03, top - 0.18), (hx, D + 0.03, top - 0.10), (hx, D + 0.005, top - 0.08)],
               0.006, IX, segs=6, M=M)
    # descanso de pe em inox com suportes
    zt = z + 0.20
    P.tubo(m, [(0.05, -0.13, zt), (L - 0.05, -0.13, zt)], 0.022, IX, segs=10, M=M, tampas=True)
    k = 0.25
    while k < L - 0.1:
        P.tubo(m, [(k, -0.13, zt), (k, -0.06, zt + 0.02), (k, 0.0, zt + 0.02)], 0.011, IX, segs=6, M=M)
        k += 1.2


def balcao_novo(nome, x0, x1, y0, y1, z, retorno=None):
    m = novo(nome)
    top = z + 1.06 - ZP
    balcao_trecho(m, R((x0, y1, 0), rz_deg=-90), y1 - y0, x1 - x0, z, top)
    tt = top + 0.04                                        # superficie do granito (= TOPO do 06_interior)
    P.caixa(m, (x0 - 0.13, y0 - (0.13 if retorno else 0.06), top), (x1 + 0.04, y1 + 0.06, tt), GR, r=0.012)
    P.caixa(m, (x0 - 0.13, y0 - (0.13 if retorno else 0.06), top - 0.025), (x0 - 0.02, y1 + 0.06, top), MV, r=0.008)
    if retorno:
        a0, a1, c0, c1 = retorno
        balcao_trecho(m, R((x1, c0, 0)), a1 - x1, c1 - c0, z, top)
        P.caixa(m, (x1 + 0.04, c0 - 0.13, top), (a1, c1 + 0.06, tt), GR, r=0.012, skip=('nx',))
        P.caixa(m, (x1 + 0.04, c0 - 0.13, top - 0.025), (a1, c0 - 0.02, top), MV, r=0.008, skip=('nx',))
    # fita de LED sob a borda do tampo (lado do cliente)
    P.caixa(m, (x0 - 0.10, y0 + 0.05, top - 0.032), (x0 - 0.085, y1 - 0.05, top - 0.026), "Pol_LED", r=0.0)
    return fim(m)


balcao_novo("Interior_Balcao", 17.4, 18.0, 4.6, 10.0, ZP, retorno=(17.4, 23.8, 4.6, 5.2))
balcao_novo("Interior_Balcao_Lounge", 21.0, 21.6, 7.4, 10.6, ZP2)


def aparador(nome, X0, X1, Y0, Y1, z, ztop, prateleiras=()):
    """Movel de fundo de bar encostado na parede x = X1, frente para -X (cristaleira / aparador do lounge)."""
    m = novo(nome)
    Mf = R((X0, Y1, 0), rz_deg=-90)                       # local: x ao longo (Y1 -> Y0), y profundidade (X0 -> X1)
    L, D = Y1 - Y0, X1 - X0
    cx = lambda *a, **k: P.caixa(m, *a, M=Mf, **k)
    cx((0, 0.04, z), (L, D, z + 0.08), ME, r=0.004, skip=('nz', 'py'))
    cx((0, 0, z + 0.08), (L, D, ztop - 0.03), MV, r=0.008, skip=('py',))
    n = max(2, int(L / 0.5))
    pw = L / n
    for k in range(n):                                     # portas almofadadas
        a = k * pw + 0.015
        cx((a, -0.018, z + 0.11), (a + pw - 0.03, 0.0, ztop - 0.07), MV, r=0.01)
        cx((a + 0.05, -0.024, z + 0.17), (a + pw - 0.08, -0.016, ztop - 0.13), ME_, r=0.006)
        hx = a + (pw - 0.07 if k % 2 == 0 else 0.04)
        puxador(m, hx, -0.018, ztop - 0.30, ztop - 0.16, M=Mf, prof=0.025, r=0.006)
    cx((-0.025, -0.03, ztop - 0.03), (L + 0.0, D, ztop), GR, r=0.008, skip=('py',))
    if prateleiras:
        zt = prateleiras[-1] + 0.07
        m.face([Mf @ Vector(p) for p in ((0.04, D - 0.02, ztop), (L - 0.04, D - 0.02, ztop), (L - 0.04, D - 0.02, zt), (0.04, D - 0.02, zt))],
               "Espelho", facing=Mf.to_3x3() @ Vector((0, -1, 0)))
        for y in (0.0, L - 0.04):                         # montantes
            cx((y, 0.05, ztop), (y + 0.04, D - 0.02, zt), MV, r=0.006, skip=('py',))
        for zs in prateleiras:
            cx((0.04, 0.05, zs), (L - 0.04, D - 0.02, zs + 0.03), MV, r=0.005, skip=('py',))
            cx((0.06, 0.06, zs - 0.006), (L - 0.06, 0.075, zs), "Pol_LED", r=0.0)   # LED sob a prateleira
        cx((-0.03, 0.02, zt), (L + 0.03, D, zt + 0.06), MV, r=0.01, skip=('py',))   # cornija
        cx((-0.01, 0.0, zt + 0.06), (L + 0.01, D, zt + 0.09), ME_, r=0.006, skip=('py',))
    return fim(m)


aparador("Interior_Cristaleira", 23.45, 23.8, 5.45, 7.4, ZP, 0.98, prateleiras=(1.38, 1.78, 2.18))
aparador("Interior_Aparador_Lounge", 23.45, 23.8, 8.9, 10.5, ZP2, ZP2 + 0.98)

# =====================================================================  BEBIDAS
for nm, col in (("P_Garrafa_Verde", "Garrafa_Verde"), ("P_Garrafa_Ambar", "Garrafa_Ambar"), ("P_Garrafa_Clara", "Garrafa_Clara")):
    m = novo(nm)
    perfil = [(0.030, 0.0), (0.035, 0.007), (0.035, 0.07), (0.035, 0.165), (0.034, 0.188), (0.024, 0.228), (0.0145, 0.255),
              (0.0135, 0.281), (0.0158, 0.283, 'q'), (0.0158, 0.300)]
    P.torno(m, perfil, col, segs=10, tampa_base=True, tampa_topo=True,
            mats=[col, col, "Pol_Rotulo", col, col, col, col, col, IX])
    fim(m)

for nm, col in (("P_Engradado_Amarelo", "Plastico_Amarelo"), ("P_Engradado_Vermelho", V)):
    m = novo(nm)
    X, Y, H, t = 0.175, 0.155, 0.29, 0.012
    P.caixa(m, (-X, -Y, 0), (X, Y, 0.016), col, r=0.004)
    P.caixa(m, (-X, -Y, 0.016), (X, -Y + t, H - 0.025), col, r=0.003, skip=('nz', 'pz'))
    P.caixa(m, (-X, Y - t, 0.016), (X, Y, H - 0.025), col, r=0.003, skip=('nz', 'pz'))
    P.caixa(m, (-X, -Y + t, 0.016), (-X + t, Y - t, H - 0.025), col, r=0.003, skip=('nz', 'pz', 'ny', 'py'))
    P.caixa(m, (X - t, -Y + t, 0.016), (X, Y - t, H - 0.025), col, r=0.003, skip=('nz', 'pz', 'ny', 'py'))
    for (a, b) in (((-X - 0.004, -Y - 0.004), (X + 0.004, -Y + t)), ((-X - 0.004, Y - t), (X + 0.004, Y + 0.004)),
                   ((-X - 0.004, -Y + t), (-X + t, Y - t)), ((X - t, -Y + t), (X + 0.004, Y - t))):
        P.caixa(m, (a[0], a[1], H - 0.025), (b[0], b[1], H), col, r=0.004)          # borda reforcada
    for x in (-0.12, -0.04, 0.04, 0.12):                                               # nervuras
        for sy in (-1, 1):
            y0, y1 = (sy * Y - 0.006, sy * Y) if sy < 0 else (sy * Y, sy * Y + 0.006)
            m.box((x - 0.008, y0, 0.016), (x + 0.008, y1, H - 0.025), col, skip=('nz', 'pz'))
    for sx in (-1, 1):                                                                 # alcas vazadas
        m.face([(sx * (X + 0.0015), -0.07, 0.215), (sx * (X + 0.0015), 0.07, 0.215), (sx * (X + 0.0015), 0.07, 0.255),
                (sx * (X + 0.0015), -0.07, 0.255)], BP, facing=(sx, 0, 0))
    m.face([(-X + t, -Y + t, 0.235), (X - t, -Y + t, 0.235), (X - t, Y - t, 0.235), (-X + t, Y - t, 0.235)], "Garrafa_Ambar", facing=(0, 0, 1))
    for i in range(6):
        for j in range(4):
            x = -X + t + (i + 0.5) * (2 * X - 2 * t) / 6
            y = -Y + t + (j + 0.5) * (2 * Y - 2 * t) / 4
            m.face([(x + 0.016 * math.cos(math.pi * k / 4), y + 0.016 * math.sin(math.pi * k / 4), 0.262) for k in range(8)],
                   IX, facing=(0, 0, 1))                   # tampinha (de cima e o que se ve; gargalo 3D custava 4x mais)
    fim(m)

m = novo("P_Barril")                                       # barril de chope (inox)
P.torno(m, [(0.17, 0.0), (0.195, 0.004), (0.198, 0.07), (0.206, 0.08), (0.206, 0.10), (0.198, 0.11), (0.202, 0.33), (0.198, 0.55),
            (0.206, 0.56), (0.206, 0.58), (0.198, 0.59), (0.19, 0.61), (0.188, 0.665, 'q'), (0.176, 0.665, 'q'), (0.176, 0.62),
            (0.12, 0.615), (0.03, 0.618)], IX, segs=16, tampa_base=True, tampa_topo=True)
P.torno(m, [(0.03, 0.618), (0.03, 0.64), (0.024, 0.648), (0.024, 0.668)], ME, segs=10, tampa_topo=True)
for s in (-1, 1):                                          # alcas vazadas no aro
    m.face([Vector((s * 0.1, -0.165, 0.635)), Vector((s * 0.03, -0.18, 0.635)), Vector((s * 0.03, -0.18, 0.655)), Vector((s * 0.1, -0.165, 0.655))],
           BP, facing=(0, 1, 0))
fim(m)

# =====================================================================  REFRIGERACAO
m = novo("P_Geladeira_Expositor")
P.caixa(m, (-0.35, -0.30, 0.08), (0.35, 0.33, 1.95), PB, r=0.015, skip=('nz',))
P.caixa(m, (-0.33, -0.28, 0.0), (0.33, 0.31, 0.08), ME, r=0.005, skip=('nz',))
for k in range(5):
    m.box((-0.28, -0.2815, 0.012 + k * 0.013), (0.28, -0.279, 0.018 + k * 0.013), BP, skip=('py',))
P.caixa(m, (-0.35, -0.335, 1.72), (0.35, -0.30, 1.95), V, r=0.012)                    # painel luminoso
P.caixa(m, (-0.30, -0.338, 1.76), (0.30, -0.334, 1.91), "Pol_LED", r=0.0)
for (a, b) in (((-0.35, 0.10), (-0.30, 1.70)), ((0.30, 0.10), (0.35, 1.70)), ((-0.30, 0.10), (0.30, 0.16)), ((-0.30, 1.64), (0.30, 1.70))):
    P.caixa(m, (a[0], -0.335, a[1]), (b[0], -0.30, b[1]), ME, r=0.006)              # moldura da porta
u0, v0, u1, v1 = B.REG['geladeira']
m.face([(-0.30, -0.318, 0.16), (0.30, -0.318, 0.16), (0.30, -0.318, 1.64), (-0.30, -0.318, 1.64)], "Geladeira_Frente",
       uvs=[(u0, v0), (u1, v0), (u1, v1), (u0, v1)], facing=(0, -1, 0))
P.tubo(m, [(0.315, -0.335, 0.55), (0.315, -0.372, 0.58), (0.315, -0.372, 1.27), (0.315, -0.335, 1.30)], 0.011, IX, segs=8)
fim(m)

m = novo("P_Freezer")                                      # freezer horizontal de tampa
P.caixa(m, (-0.65, -0.32, 0.06), (0.65, 0.32, 0.775), PB, r=0.02, skip=('nz',))
m.box((-0.645, -0.322, 0.772), (0.645, 0.322, 0.782), BP, skip=('nz', 'pz'))
P.caixa(m, (-0.655, -0.326, 0.782), (0.655, 0.326, 0.85), PB, r=0.025)
P.caixa(m, (-0.24, -0.358, 0.79), (0.24, -0.322, 0.825), ME, r=0.008)                 # puxador
P.caixa(m, (-0.45, -0.327, 0.28), (0.45, -0.318, 0.62), V, r=0.006)                   # painel da marca
P.caixa(m, (-0.40, -0.329, 0.33), (0.40, -0.326, 0.57), "Plastico_Amarelo", r=0.0)
P.caixa(m, (-0.62, -0.29, 0.0), (0.62, 0.29, 0.06), ME, r=0.004, skip=('nz',))
for k in range(8):
    m.box((0.66 - 0.002, -0.24 + k * 0.06, 0.10), (0.652, -0.22 + k * 0.06, 0.30), BP, skip=('nx',))
fim(m)

# =====================================================================  ILUMINACAO / TETO (origem no teto)
m = novo("P_Luminaria_Tubular")
P.caixa(m, (-0.62, -0.09, -0.045), (0.62, 0.09, 0.0), PB, r=0.008, skip=('pz',))
for y in (-0.045, 0.045):
    P.tubo(m, [(-0.585, y, -0.058), (0.585, y, -0.058)], 0.0135, "Lampada", segs=8, tampas=True)
for x in (-0.6, 0.6):
    P.caixa(m, (x - 0.02, -0.075, -0.075), (x + 0.02, 0.075, -0.045), PB, r=0.004)
fim(m)

m = novo("P_Ventilador_Teto")
P.torno(m, [(0.012, -0.075), (0.03, -0.065), (0.045, -0.015), (0.04, 0.0)], PB, segs=12)
P.tubo(m, [(0, 0, -0.07), (0, 0, -0.35)], 0.011, PB, segs=8)
P.torno(m, [(0.02, -0.49), (0.07, -0.478), (0.112, -0.445), (0.118, -0.405), (0.10, -0.372), (0.05, -0.355), (0.015, -0.35)], PB,
        segs=16, tampa_base=True)
P.torno(m, [(0.06, -0.522), (0.075, -0.505), (0.06, -0.49)], "Lampada", segs=12, tampa_base=True)
for k in range(3):
    Mb = R((0, 0, -0.43), rz_deg=k * 120)
    P.caixa(m, (0.06, -0.015, -0.006), (0.21, 0.015, 0.004), ME, r=0.003, M=Mb)
    Mp = Mb @ RX(10)
    pts = [(0.17, -0.055, 0), (0.70, -0.07, 0), (0.72, -0.05, 0), (0.725, 0.0, 0), (0.72, 0.05, 0), (0.70, 0.07, 0), (0.17, 0.055, 0)]
    m.face([Mp @ Vector((x, y, 0.004)) for (x, y, _) in pts], MV, facing=Mp.to_3x3() @ Vector((0, 0, 1)))
    m.face([Mp @ Vector((x, y, -0.004)) for (x, y, _) in pts], MV, facing=Mp.to_3x3() @ Vector((0, 0, -1)))
    for i in range(len(pts) - 1):
        (xa, ya, _), (xb, yb, _) = pts[i], pts[i + 1]
        m.face([Mp @ Vector(p) for p in ((xa, ya, -0.004), (xb, yb, -0.004), (xb, yb, 0.004), (xa, ya, 0.004))], MV,
               away=Mp @ Vector((0.45, 0, 0)))
fim(m)

m = novo("P_Luminaria_Pendente")                           # pendente esmaltado sobre a sinuca
P.tubo(m, [(0, 0, 0), (0, 0, -0.74)], 0.004, "Fio", segs=4)
P.torno(m, [(0.025, -0.76), (0.025, -0.73), (0.012, -0.72)], ME, segs=10, tampa_topo=True)
P.torno(m, [(0.25, -0.975), (0.245, -0.95), (0.18, -0.87), (0.075, -0.785), (0.05, -0.76)], "Pol_Esmalte_Verde", segs=20, tampa_topo=True)
P.torno(m, [(0.044, -0.762), (0.068, -0.786), (0.172, -0.871), (0.236, -0.951), (0.242, -0.97)], PB, segs=20)   # casca interna afastada (sem z-fighting)
P.torno(m, [(0.005, -0.90), (0.045, -0.87), (0.055, -0.83), (0.03, -0.80), (0.022, -0.785)], "Lampada", segs=12, tampa_base=True)
fim(m)

m = novo("P_Lampada_Varanda")
P.tubo(m, [(0, 0, 0), (0, 0, -0.30)], 0.004, "Fio", segs=4)
P.torno(m, [(0.022, -0.36), (0.026, -0.335), (0.026, -0.305), (0.012, -0.298)], ME, segs=10, tampa_topo=True)
P.torno(m, [(0.004, -0.472), (0.045, -0.452), (0.06, -0.418), (0.055, -0.388), (0.03, -0.367), (0.022, -0.36)], "Lampada", segs=12,
        tampa_base=True)
fim(m)

m = novo("P_Lampada_Varal")
P.torno(m, [(0.014, -0.04), (0.016, -0.02), (0.016, 0.0)], ME, segs=8, tampa_topo=True)
P.torno(m, [(0.004, -0.135), (0.03, -0.12), (0.042, -0.092), (0.036, -0.062), (0.017, -0.045), (0.014, -0.04)], "Lampada", segs=10,
        tampa_base=True)
fim(m)

# =====================================================================  SALAO
m = novo("P_TV")
P.caixa(m, (-0.56, -0.045, 0.0), (0.56, -0.008, 0.66), "Pol_Plastico_Preto", r=0.008)
P.caixa(m, (-0.30, -0.012, 0.13), (0.30, 0.0, 0.50), ME, r=0.006)
u0, v0, u1, v1 = B.REG['tv']
# tela 1,06 x 0,60 m (z 0,03..0,63) como a do 05_props: o jogo poe o plano do video com esse tamanho, 6 mm na frente;
# tela maior que ele deixa a borda verde da imagem do campo aparecendo em volta do video
m.face([(-0.53, -0.0455, 0.03), (0.53, -0.0455, 0.03), (0.53, -0.0455, 0.63), (-0.53, -0.0455, 0.63)], "Tela_TV",
       uvs=[(u0, v0), (u1, v0), (u1, v1), (u0, v1)], facing=(0, -1, 0))
P.caixa(m, (-0.04, -0.047, 0.005), (0.04, -0.044, 0.012), "Pol_Display", r=0.0)
fim(m)

m = novo("P_Caixa_Registradora")
P.caixa(m, (-0.18, -0.18, 0.0), (0.18, 0.18, 0.09), ME, r=0.01)
P.caixa(m, (-0.16, -0.186, 0.015), (0.16, -0.178, 0.075), "Pol_Plastico_Cinza", r=0.004)
P.caixa(m, (-0.03, -0.192, 0.035), (0.03, -0.184, 0.05), IX, r=0.002)
Mk = T(0, -0.04, 0.09) @ RX(-14)
P.caixa(m, (-0.16, -0.13, 0.0), (0.16, 0.09, 0.035), ME, r=0.008, M=Mk)
for i in range(5):
    for j in range(4):
        x = -0.12 + i * 0.06
        y = -0.10 + j * 0.05
        m.box((x - 0.02, y - 0.016, 0.035), (x + 0.02, y + 0.016, 0.047), "Pol_Plastico_Cinza" if i < 4 else V, skip=('nz',), M=Mk)
P.caixa(m, (-0.12, 0.08, 0.09), (0.12, 0.14, 0.26), ME, r=0.01)
P.caixa(m, (-0.10, 0.072, 0.20), (0.10, 0.082, 0.245), "Pol_Display", r=0.002)
fim(m)

m = novo("P_Estufa")                                       # estufa de salgados
P.caixa(m, (-0.35, -0.2, 0.0), (0.35, 0.2, 0.08), IX, r=0.01, skip=('nz',))
P.caixa(m, (-0.35, -0.2, 0.40), (0.35, 0.2, 0.425), IX, r=0.006)
for sx in (-1, 1):
    P.caixa(m, (sx * 0.35 - (0.012 if sx > 0 else 0), -0.2, 0.08), (sx * 0.35 + (0.0 if sx > 0 else 0.012), 0.2, 0.40), IX, r=0.003)
arco = [(-0.19 + 0.12 * (1 - math.cos(a)), 0.08 + 0.32 * math.sin(a)) for a in [math.pi / 2 * k / 5 for k in range(6)]]
for i in range(5):
    (ya, za), (yb, zb) = arco[i], arco[i + 1]
    m.face([(-0.338, ya, za), (0.338, ya, za), (0.338, yb, zb), (-0.338, yb, zb)], "Vidro", facing=(0, -1, 0.3))
m.face([(-0.338, 0.19, 0.08), (0.338, 0.19, 0.08), (0.338, 0.19, 0.40), (-0.338, 0.19, 0.40)], "Vidro", facing=(0, 1, 0))
P.caixa(m, (-0.335, -0.10, 0.22), (0.335, 0.18, 0.228), IX, r=0.002)
P.caixa(m, (-0.30, -0.02, 0.393), (0.30, 0.02, 0.40), "Pol_LED", r=0.0)
for i in range(5):                                         # coxinhas (prateleira de baixo)
    for j in range(2):
        P.torno(m, [(0.018, 0.0), (0.027, 0.013), (0.023, 0.036), (0.008, 0.052)], "Salgado", segs=8, tampa_base=True, tampa_topo=True,
                M=T(-0.24 + i * 0.12 + 0.02 * j, -0.06 + j * 0.11, 0.08))
for i in range(4):                                         # pasteis (prateleira de cima)
    P.caixa(m, (-0.055, -0.035, 0.0), (0.055, 0.035, 0.018), "Salgado", r=0.008, M=T(-0.21 + i * 0.14, 0.04, 0.228) @ RZ(rnd.uniform(-20, 20)))
fim(m)

m = novo("P_Lixeira")
P.torno(m, [(0.155, 0.0), (0.17, 0.008), (0.19, 0.60), (0.198, 0.608, 'q'), (0.198, 0.64)], "Pol_Plastico_Cinza", segs=16,
        tampa_base=True)
P.torno(m, [(0.205, 0.638), (0.205, 0.668), (0.185, 0.705), (0.12, 0.732), (0.0, 0.74)], "Pol_Plastico_Cinza", segs=16, tampa_base=True)
m.face([(-0.09, -0.165, 0.69), (0.09, -0.165, 0.69), (0.07, -0.13, 0.718), (-0.07, -0.13, 0.718)], BP, facing=(0, -1, 0.6))
fim(m)

m = novo("P_Extintor")
P.torno(m, [(0.07, 0.0), (0.08, 0.012), (0.08, 0.16), (0.08, 0.30), (0.08, 0.40), (0.072, 0.45), (0.045, 0.475), (0.025, 0.482)], V,
        segs=14, tampa_base=True, mats=[V, V, "Pol_Rotulo", V, V, V, V])
P.torno(m, [(0.022, 0.482), (0.022, 0.515), (0.018, 0.53)], ME, segs=10, tampa_topo=True)
P.caixa(m, (-0.012, -0.11, 0.515), (0.012, 0.0, 0.53), ME, r=0.003, M=RX(-8))
P.caixa(m, (-0.012, -0.10, 0.495), (0.012, 0.0, 0.508), ME, r=0.003)
P.torno(m, [(0.018, 0.0), (0.018, 0.01)], PB, segs=10, tampa_topo=True, M=T(0.0, -0.02, 0.50) @ RX(90))
P.tubo(m, [(0.02, 0, 0.50), (0.07, 0, 0.49), (0.092, 0, 0.44), (0.094, 0, 0.30), (0.09, 0, 0.16)], 0.011, BP, segs=6, tampas=True)
fim(m)

# =====================================================================  JOGOS / LOUNGE (pavimento superior)
m = novo("P_Sinuca")
for (x, y) in ((-0.88, -0.40), (0.88, -0.40), (-0.88, 0.40), (0.88, 0.40)):
    P.torno(m, [(0.075, 0.0), (0.075, 0.04, 'q'), (0.06, 0.06), (0.045, 0.16), (0.058, 0.30), (0.042, 0.45), (0.052, 0.55), (0.065, 0.62)],
            MV, segs=10, tampa_base=True, M=T(x, y, 0))
P.caixa(m, (-1.0, -0.5, 0.60), (1.0, 0.5, 0.775), MV, r=0.012)
m.face([(-0.98, -0.48, 0.80), (0.98, -0.48, 0.80), (0.98, 0.48, 0.80), (-0.98, 0.48, 0.80)], "Pol_Feltro", facing=(0, 0, 1))
m.box((-1.0, -0.5, 0.775), (1.0, 0.5, 0.80), ME, skip=('nz', 'pz'))
for (a, b) in (((-1.1, -0.6), (1.1, -0.48)), ((-1.1, 0.48), (1.1, 0.6)), ((-1.1, -0.48), (-0.98, 0.48)), ((0.98, -0.48), (1.1, 0.48))):
    P.caixa(m, (a[0], a[1], 0.775), (b[0], b[1], 0.865), MV, r=0.014)
for (a, b) in (((-0.94, -0.48), (-0.06, -0.45)), ((0.06, -0.48), (0.94, -0.45)), ((-0.94, 0.45), (-0.06, 0.48)), ((0.06, 0.45), (0.94, 0.48)),
               ((-0.98, -0.42), (-0.95, 0.42)), ((0.95, -0.42), (0.98, 0.42))):
    P.caixa(m, (a[0], a[1], 0.80), (b[0], b[1], 0.84), "Pol_Feltro", r=0.008)          # tabelas
for (x, y) in ((-1.0, -0.5), (0.0, -0.52), (1.0, -0.5), (-1.0, 0.5), (0.0, 0.52), (1.0, 0.5)):
    P.torno(m, [(0.052, 0.79), (0.055, 0.868)], BP, segs=12, tampa_base=True, M=T(x, y, 0))
for x in (-0.75, -0.5, -0.25, 0.25, 0.5, 0.75):                                       # marcadores (diamantes)
    for y in (-0.55, 0.55):
        m.box((x - 0.012, y - 0.006, 0.865), (x + 0.012, y + 0.006, 0.867), "Louca_Branca", skip=('nz',))
cores = ("Plastico_Amarelo", V, "Caixa_Agua", "Garrafa_Verde", "Plastico_Laranja", BP, "Garrafa_Ambar", "Plastico_Amarelo", V, "Caixa_Agua")
k = 0
for fila in range(4):                                      # triangulo de bolas + bola branca
    for j in range(fila + 1):
        x = 0.45 + fila * 0.05
        y = (j - fila / 2) * 0.058
        P.esfera(m, cores[k % len(cores)], R((x, y, 0.828), scale=(0.028, 0.028, 0.028)))
        k += 1
P.esfera(m, "Louca_Branca", R((-0.5, 0.0, 0.828), scale=(0.028, 0.028, 0.028)))
P.torno(m, [(0.014, 0.0), (0.012, 0.5), (0.008, 1.38), (0.0072, 1.42, 'q'), (0.0072, 1.44)], MV, segs=8, tampa_base=True, tampa_topo=True,
        mats=["Pol_Plastico_Preto", MV, "Louca_Branca", "Caixa_Agua"], M=T(-0.9, -0.30, 0.818) @ RZ(6) @ RY(90))
fim(m)

m = novo("P_Pebolim")
P.caixa(m, (-0.6, -0.36, 0.62), (0.6, 0.36, 0.72), MV, r=0.01)
for (a, b) in (((-0.6, -0.36), (0.6, -0.33)), ((-0.6, 0.33), (0.6, 0.36)), ((-0.6, -0.33), (-0.57, 0.33)), ((0.57, -0.33), (0.6, 0.33))):
    P.caixa(m, (a[0], a[1], 0.72), (b[0], b[1], 0.92), MV, r=0.008)
m.face([(-0.57, -0.33, 0.80), (0.57, -0.33, 0.80), (0.57, 0.33, 0.80), (-0.57, 0.33, 0.80)], "Pol_Feltro", facing=(0, 0, 1))
m.face([(-0.003, -0.33, 0.801), (0.003, -0.33, 0.801), (0.003, 0.33, 0.801), (-0.003, 0.33, 0.801)], "Louca_Branca", facing=(0, 0, 1))
for sx in (-1, 1):
    m.face([(sx * 0.569, -0.08, 0.80), (sx * 0.569, 0.08, 0.80), (sx * 0.569, 0.08, 0.86), (sx * 0.569, -0.08, 0.86)], BP, facing=(-sx, 0, 0))
for (x, y) in ((-0.52, -0.28), (0.52, -0.28), (-0.52, 0.28), (0.52, 0.28)):
    P.caixa(m, (x - 0.045, y - 0.045, 0.0), (x + 0.045, y + 0.045, 0.62), MV, r=0.01)
for sx in (-1, 1):
    P.caixa(m, (sx * 0.52 - 0.02, -0.28, 0.12), (sx * 0.52 + 0.02, 0.28, 0.16), MV, r=0.006)
qtd = (1, 2, 3, 5, 5, 3, 2, 1)
for i in range(8):
    x = -0.49 + i * 0.14
    P.tubo(m, [(x, -0.56, 0.875), (x, 0.56, 0.875)], 0.007, IX, segs=6)
    yh = -0.60 if i % 2 else 0.52
    P.torno(m, [(0.017, 0.0), (0.019, 0.02), (0.017, 0.08)], "Pol_Plastico_Preto", segs=8, tampa_base=True, tampa_topo=True,
            M=T(x, yh, 0.875) @ RX(-90))
    time_ = V if i in (0, 1, 3, 5) else "Caixa_Agua"
    for k in range(qtd[i]):
        y = (k - (qtd[i] - 1) / 2) * 0.12
        P.caixa(m, (x - 0.014, y - 0.011, 0.81), (x + 0.014, y + 0.011, 0.875), time_, r=0.004)
        m.box((x - 0.009, y - 0.009, 0.875), (x + 0.009, y + 0.009, 0.895), "Pol_Rotulo")
P.esfera(m, "Louca_Branca", R((0.07, 0.05, 0.815), scale=(0.015, 0.015, 0.015)), u=10, v=6)
fim(m)

m = novo("P_Sofa")                                         # sofa de couro
CO = "Pol_Couro"
P.caixa(m, (-0.9, -0.40, 0.08), (0.9, 0.40, 0.30), CO, r=0.03)
for x in (-0.395, 0.395):
    P.caixa(m, (x - 0.39, -0.39, 0.30), (x + 0.39, 0.20, 0.45), CO, r=0.045, seg=2)
    P.caixa(m, (x - 0.39, 0.06, 0.45), (x + 0.39, 0.25, 0.83), CO, r=0.05, seg=2, M=T(0, 0.16, 0.45) @ RX(-8) @ T(0, -0.16, -0.45))
P.caixa(m, (-0.9, 0.22, 0.30), (0.9, 0.40, 0.70), CO, r=0.04, seg=2)
for s in (-1, 1):
    P.caixa(m, (s * 0.9 - (0.17 if s > 0 else 0), -0.40, 0.30), (s * 0.9 + (0.0 if s > 0 else 0.17), 0.40, 0.64), CO, r=0.06, seg=2)
for (x, y) in ((-0.82, -0.32), (0.82, -0.32), (-0.82, 0.32), (0.82, 0.32)):
    P.torno(m, [(0.025, 0.0), (0.03, 0.08)], ME, segs=8, tampa_base=True, M=T(x, y, 0))
fim(m)

m = novo("P_Alvo_Dardos")                                  # alvo no centro, parede em y = 0, frente -Y
P.caixa(m, (-0.32, -0.035, -0.32), (0.32, 0.0, 0.32), MV, r=0.01, skip=('py',))
Mf = T(0, -0.035, 0) @ RX(90)                              # plano do alvo: local z -> -Y
P.torno(m, [(0.235, 0.0), (0.235, 0.03, 'q'), (0.225, 0.035)], BP, segs=40, M=Mf)
aneis = ((0.0, 0.0064, 'b'), (0.0064, 0.016, 'g'), (0.016, 0.099, 's'), (0.099, 0.107, 't'), (0.107, 0.162, 's'), (0.162, 0.170, 't'),
         (0.170, 0.225, 'n'))
for k in range(20):
    a0, a1 = math.radians(-9 + 18 * k), math.radians(9 + 18 * k)
    for (r0, r1, tipo) in aneis:
        if tipo == 'b':
            mat = V
        elif tipo == 'g':
            mat = "Garrafa_Verde"
        elif tipo == 's':
            mat = BP if k % 2 else "Pol_Rotulo"
        elif tipo == 't':
            mat = V if k % 2 else "Garrafa_Verde"
        else:
            mat = BP
        pts = [(r0 * math.cos(a0), r0 * math.sin(a0)), (r1 * math.cos(a0), r1 * math.sin(a0)),
               (r1 * math.cos(a1), r1 * math.sin(a1)), (r0 * math.cos(a1), r0 * math.sin(a1))]
        if r0 < 1e-6:
            pts = pts[1:]
        m.face([Mf @ Vector((x, y, 0.036)) for (x, y) in pts], mat, facing=(0, -1, 0))
for (x, z, a) in ((0.03, 0.05, 10), (-0.06, -0.02, -15), (0.08, -0.07, 5)):    # 3 dardos espetados
    P.tubo(m, [(x, -0.07, z), (x + 0.004, -0.17, z + 0.012)], [0.004, 0.006], "Pol_Inox", segs=6)
    P.tubo(m, [(x + 0.004, -0.17, z + 0.012), (x + 0.006, -0.20, z + 0.016)], 0.003, V, segs=4)
    m.face([(x + 0.004, -0.17, z + 0.012), (x + 0.006, -0.21, z + 0.016), (x + 0.006, -0.21, z + 0.035)], V, facing=(1, 0, 0))
    m.face([(x + 0.006, -0.21, z + 0.016), (x + 0.004, -0.17, z + 0.012), (x + 0.006, -0.21, z + 0.035)], V, facing=(-1, 0, 0))
fim(m)

m = novo("P_Suporte_Tacos")
P.caixa(m, (-0.38, -0.05, 1.20), (0.38, 0.0, 1.30), MV, r=0.01, skip=('py',))
P.caixa(m, (-0.38, -0.085, 0.10), (0.38, 0.0, 0.17), MV, r=0.01, skip=('py',))
for i in range(6):
    x = -0.30 + i * 0.12
    P.torno(m, [(0.0145, 0.0), (0.0138, 0.40), (0.011, 0.72), (0.0078, 1.36), (0.0075, 1.39, 'q'), (0.0075, 1.41)], MV, segs=8,
            tampa_base=True, tampa_topo=True, mats=["Pol_Plastico_Preto", MV, "Madeira", "Louca_Branca", "Caixa_Agua"],
            M=T(x, -0.05, 0.13) @ RX(-1.2))
fim(m)

m = novo("P_Vaso_Planta")                                  # vaso de ceramica com planta (cartoes de folhagem)
P.torno(m, [(0.18, 0.0), (0.21, 0.02), (0.265, 0.40), (0.29, 0.415, 'q'), (0.29, 0.45), (0.265, 0.455, 'q'), (0.255, 0.43)],
        "Ceramica_Vaso", segs=18, tampa_base=True)
m.face([(0.258 * math.cos(2 * math.pi * k / 18), 0.258 * math.sin(2 * math.pi * k / 18), 0.42) for k in range(18)], "Terra",
       facing=(0, 0, 1))
u0, v0, u1, v1 = (0.5, 0.5, 1.0, 1.0)
rp = random.Random(4)
for k in range(5):
    ang = k * 72 + rp.uniform(-15, 15)
    incl = rp.uniform(8, 22)
    Mc = T(0, 0, 0.40) @ RZ(ang) @ RX(incl)
    s = rp.uniform(0.85, 1.05)
    cs = [Mc @ Vector((-0.42 * s, 0, 0)), Mc @ Vector((0.42 * s, 0, 0)), Mc @ Vector((0.42 * s, 0, 1.05 * s)), Mc @ Vector((-0.42 * s, 0, 1.05 * s))]
    uvs = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    m.face(cs, "Arv_Folhagem", uvs=uvs)
    m.face(cs[::-1], "Arv_Folhagem", uvs=uvs[::-1])
fim(m)

m = novo("P_Guarda_Sol")
P.torno(m, [(0.22, 0.0), (0.22, 0.05, 'q'), (0.08, 0.10), (0.035, 0.12)], "Concreto", segs=16, tampa_base=True)
P.tubo(m, [(0, 0, 0.1), (0, 0, 2.52)], 0.021, "Metal_Branco", segs=8)
P.torno(m, [(0.03, 1.40), (0.03, 1.48)], "Metal_Branco", segs=8, tampa_base=True, tampa_topo=True)
copa = [(1.245, 2.02), (1.0, 2.16), (0.62, 2.31), (0.2, 2.43), (0.035, 2.46)]
P.torno(m, copa, "Plastico_Amarelo", segs=16, smooth=False, tampa_topo=True)
P.torno(m, [(0.035, 2.455), (0.2, 2.425), (0.62, 2.305), (1.0, 2.155), (1.24, 2.015)], "Plastico_Branco", segs=16, smooth=False)
P.torno(m, [(1.245, 1.94), (1.245, 2.02)], V, segs=16, smooth=False)
for k in range(8):                                         # varetas
    a = math.radians(22.5 * 2 * k + 11.25)
    P.tubo(m, [(0, 0, 2.2), (1.0 * math.cos(a), 1.0 * math.sin(a), 2.14), (1.22 * math.cos(a), 1.22 * math.sin(a), 2.01)], 0.006,
           "Metal_Branco", segs=4)
P.torno(m, [(0.03, 2.46), (0.02, 2.52), (0.008, 2.56)], "Metal_Branco", segs=8, tampa_topo=True)
fim(m)

m = novo("P_Mesa_Madeira")                                 # mesa de piquenique (quintal)
MR = "Pol_Madeira_Rustica"
P.ripas(m, (-0.9, -0.40, 0.725), (0.9, 0.40, 0), 5, 0.15, 0.045, MR, r=0.006)
for sy in (-1, 1):
    P.ripas(m, (-0.9, sy * 0.62 - 0.15, 0.42), (0.9, sy * 0.62 + 0.15, 0), 2, 0.14, 0.04, MR, r=0.006)
for x in (-0.68, 0.68):
    P.caixa(m, (x - 0.035, -0.77, 0.36), (x + 0.035, 0.77, 0.42), MR, r=0.006)
    P.caixa(m, (x - 0.035, -0.38, 0.67), (x + 0.035, 0.38, 0.725), MR, r=0.006)
    for sy in (-1, 1):
        p0, p1 = Vector((x, sy * 0.66, 0.0)), Vector((x, sy * 0.18, 0.70))
        d = p1 - p0
        ang = math.degrees(math.atan2(d.y, d.z))
        Ml = T(*((p0 + p1) / 2)) @ RX(-ang)
        P.caixa(m, (-0.035, -0.045, -d.length / 2), (0.035, 0.045, d.length / 2), MR, r=0.006, M=Ml)
fim(m)

# =====================================================================  BANHEIROS
LB = "Louca_Branca"
m = novo("P_Vaso")
Mv = T(0, -0.08, 0) @ SC(1.0, 1.3, 1.0)
P.torno(m, [(0.10, 0.0), (0.112, 0.02), (0.095, 0.15), (0.13, 0.30), (0.168, 0.36, 'q'), (0.172, 0.378, 'q'), (0.15, 0.38), (0.12, 0.33),
            (0.06, 0.27), (0.045, 0.22)], LB, segs=20, tampa_base=True, tampa_topo=True, M=Mv)
P.torno(m, [(0.11, 0.384), (0.168, 0.386), (0.176, 0.396), (0.166, 0.405), (0.12, 0.404), (0.108, 0.395)], PB, segs=20, M=Mv)
P.caixa(m, (-0.08, -0.02, 0.28), (0.08, 0.14, 0.42), LB, r=0.03, seg=2)
P.caixa(m, (-0.19, 0.12, 0.40), (0.19, 0.28, 0.80), LB, r=0.025, seg=2)
P.caixa(m, (-0.20, 0.115, 0.80), (0.20, 0.285, 0.83), LB, r=0.012)
P.torno(m, [(0.022, 0.83), (0.022, 0.84)], IX, segs=10, tampa_topo=True, M=T(0, 0.2, 0))
P.caixa(m, (-0.165, 0.085, 0.40), (0.165, 0.112, 0.79), PB, r=0.03, seg=2)
fim(m)

m = novo("P_Mictorio")
P.caixa(m, (-0.17, -0.28, 0.50), (0.17, 0.0, 1.10), LB, r=0.06, seg=3, skip=('py',))
m.face([(-0.12, -0.282, 0.60), (0.12, -0.282, 0.60), (0.12, -0.282, 1.0), (-0.12, -0.282, 1.0)], "Pol_Plastico_Cinza", facing=(0, -1, 0))
P.torno(m, [(0.022, 0.0), (0.022, 0.004)], "Pol_Inox", segs=10, tampa_topo=True, M=T(0, -0.10, 0.535))
P.tubo(m, [(0, -0.04, 1.10), (0, -0.04, 1.32), (0, -0.0, 1.34)], 0.015, IX, segs=8)
P.torno(m, [(0.03, 1.22), (0.03, 1.28)], IX, segs=10, tampa_base=True, tampa_topo=True, M=T(0, -0.04, 0))
fim(m)

m = novo("P_Pia_Banheiro")
P.torno(m, [(0.09, 0.0), (0.075, 0.05), (0.06, 0.40), (0.065, 0.68), (0.1, 0.77)], LB, segs=14, tampa_base=True, M=T(0, -0.16, 0))
Mb = T(0, -0.22, 0) @ SC(1.0, 0.82, 1.0)
P.torno(m, [(0.17, 0.765), (0.245, 0.82), (0.258, 0.86), (0.258, 0.88, 'q'), (0.236, 0.886, 'q'), (0.21, 0.86), (0.12, 0.818),
            (0.03, 0.805)], LB, segs=22, tampa_base=True, tampa_topo=True, M=Mb)
P.torno(m, [(0.022, 0.88), (0.022, 0.93), (0.016, 0.94)], IX, segs=10, tampa_topo=True, M=T(0, -0.04, 0))
P.tubo(m, [(0, -0.04, 0.93), (0, -0.07, 0.975), (0, -0.13, 0.975), (0, -0.15, 0.95)], 0.009, IX, segs=8)
P.caixa(m, (-0.31, -0.02, 1.14), (0.31, 0.0, 1.76), "Pol_Madeira_Escura", r=0.006, skip=('py',))
m.face([(-0.28, -0.0205, 1.17), (0.28, -0.0205, 1.17), (0.28, -0.0205, 1.73), (-0.28, -0.0205, 1.73)], "Espelho", facing=(0, -1, 0))
fim(m)

# =====================================================================  COZINHA / DEPOSITO
m = novo("P_Fogao")                                        # fogao industrial 4 bocas
P.caixa(m, (-0.45, -0.40, 0.12), (0.45, 0.40, 0.80), IX, r=0.01, skip=('nz',))
P.caixa(m, (-0.45, -0.40, 0.80), (0.45, 0.40, 0.82), ME, r=0.004)
for (x, y) in ((-0.40, -0.35), (0.40, -0.35), (-0.40, 0.35), (0.40, 0.35)):
    P.torno(m, [(0.022, 0.0), (0.028, 0.02, 'q'), (0.02, 0.025), (0.02, 0.12)], ME, segs=8, tampa_base=True, M=T(x, y, 0))
for (x, y) in ((-0.21, -0.18), (0.21, -0.18), (-0.21, 0.18), (0.21, 0.18)):
    P.torno(m, [(0.075, 0.82), (0.075, 0.835, 'q'), (0.055, 0.84), (0.05, 0.85)], ME, segs=12, tampa_topo=True, M=T(x, y, 0))
    P.tubo(m, [(x - 0.17, y - 0.16, 0.865), (x + 0.17, y - 0.16, 0.865), (x + 0.17, y + 0.16, 0.865), (x - 0.17, y + 0.16, 0.865),
               (x - 0.17, y - 0.16, 0.865)], 0.008, ME, segs=4)
    P.tubo(m, [(x - 0.17, y, 0.865), (x + 0.17, y, 0.865)], 0.007, ME, segs=4)
    P.tubo(m, [(x, y - 0.16, 0.865), (x, y + 0.16, 0.865)], 0.007, ME, segs=4)
for x in (-0.3, -0.1, 0.1, 0.3):
    P.torno(m, [(0.024, 0.0), (0.024, 0.02), (0.016, 0.035)], "Pol_Plastico_Preto", segs=10, tampa_topo=True, M=T(x, -0.40, 0.74) @ RX(90))
P.caixa(m, (-0.40, -0.408, 0.20), (0.40, -0.398, 0.66), IX, r=0.006)
m.face([(-0.30, -0.409, 0.32), (0.30, -0.409, 0.32), (0.30, -0.409, 0.55), (-0.30, -0.409, 0.55)], "Janela_Escura", facing=(0, -1, 0))
P.tubo(m, [(-0.30, -0.408, 0.62), (-0.30, -0.44, 0.62), (0.30, -0.44, 0.62), (0.30, -0.408, 0.62)], 0.009, IX, segs=6)
fim(m)

m = novo("P_Coifa")
b0 = [(-0.5, -0.45, 0), (0.5, -0.45, 0), (0.5, 0.45, 0), (-0.5, 0.45, 0)]
t0 = [(-0.15, -0.15, 0.42), (0.15, -0.15, 0.42), (0.15, 0.15, 0.42), (-0.15, 0.15, 0.42)]
for i in range(4):
    m.face([b0[i], b0[(i + 1) % 4], t0[(i + 1) % 4], t0[i]], IX, away=(0, 0, 0.1))
P.caixa(m, (-0.51, -0.46, -0.10), (0.51, 0.46, 0.0), IX, r=0.008, skip=('nz',))
m.face([(-0.47, -0.43, -0.098), (-0.47, 0.43, -0.098), (0.47, 0.43, -0.098), (0.47, -0.43, -0.098)], ME, facing=(0, 0, -1))
for k in range(9):                                          # filtros (aletas)
    x = -0.42 + k * 0.105
    m.box((x - 0.012, -0.40, -0.099), (x + 0.012, 0.40, -0.096), "Pol_Inox", skip=('pz',))
P.caixa(m, (-0.16, -0.16, 0.42), (0.16, 0.16, 0.46), IX, r=0.006)
P.caixa(m, (-0.15, -0.15, 0.46), (0.15, 0.15, 1.40), IX, r=0.006, skip=('nz', 'pz'))
for z in (0.8, 1.2):
    P.caixa(m, (-0.155, -0.155, z), (0.155, 0.155, z + 0.015), ME, r=0.002)
fim(m)

m = novo("P_Pia_Cozinha")
P.caixa(m, (-0.75, -0.28, 0.0), (0.75, 0.30, 0.08), ME, r=0.004, skip=('nz',))
P.caixa(m, (-0.75, -0.30, 0.08), (0.75, 0.30, 0.86), IX, r=0.008, skip=('nz',))
for k in range(3):
    x0 = -0.73 + k * 0.49
    P.caixa(m, (x0, -0.312, 0.12), (x0 + 0.47, -0.298, 0.82), IX, r=0.006)
    puxador(m, x0 + (0.41 if k % 2 else 0.06), -0.312, 0.62, 0.76, r=0.006)
ax0, ax1, ay0, ay1 = -0.58, -0.02, -0.21, 0.19
P.caixa(m, (-0.77, -0.32, 0.86), (ax0, 0.31, 0.90), IX, r=0.006)
P.caixa(m, (ax1, -0.32, 0.86), (0.77, 0.31, 0.90), IX, r=0.006)
P.caixa(m, (ax0, -0.32, 0.86), (ax1, ay0, 0.90), IX, r=0.004, skip=('nx', 'px'))
P.caixa(m, (ax0, ay1, 0.86), (ax1, 0.31, 0.90), IX, r=0.004, skip=('nx', 'px'))
P.caixa(m, (-0.77, 0.27, 0.90), (0.77, 0.31, 1.0), IX, r=0.006)                         # espelho traseiro
zc = 0.70
for (p0, p1) in (((ax0, ay0), (ax1, ay0)), ((ax1, ay0), (ax1, ay1)), ((ax1, ay1), (ax0, ay1)), ((ax0, ay1), (ax0, ay0))):
    m.face([(p0[0], p0[1], zc), (p1[0], p1[1], zc), (p1[0], p1[1], 0.90), (p0[0], p0[1], 0.90)], "Pol_Inox",
           facing=Vector(((ax0 + ax1) / 2 - p0[0], (ay0 + ay1) / 2 - p0[1], 0)))
m.face([(ax0, ay0, zc), (ax1, ay0, zc), (ax1, ay1, zc), (ax0, ay1, zc)], "Pol_Inox", facing=(0, 0, 1))
P.torno(m, [(0.03, 0.0), (0.03, 0.002)], ME, segs=10, tampa_topo=True, M=T((ax0 + ax1) / 2, (ay0 + ay1) / 2, zc + 0.001))
P.torno(m, [(0.028, 0.90), (0.028, 0.93, 'q'), (0.017, 0.94), (0.017, 0.96)], IX, segs=12, tampa_topo=True, M=T(-0.30, 0.24, 0))
arco = [(-0.30, 0.24, 0.95), (-0.30, 0.24, 1.16)]
for k in range(1, 8):
    a_ = math.pi * k / 7
    arco.append((-0.30, 0.24 - 0.09 + 0.09 * math.cos(a_), 1.16 + 0.09 * math.sin(a_)))
arco.append((-0.30, 0.06, 1.10))
P.tubo(m, arco, 0.011, IX, segs=8)
fim(m)

m = novo("P_Mesa_Inox")
P.caixa(m, (-0.7, -0.3, 0.86), (0.7, 0.3, 0.90), IX, r=0.008)
P.caixa(m, (-0.66, -0.27, 0.18), (0.66, 0.27, 0.20), IX, r=0.004)
for (x, y) in ((-0.66, -0.27), (0.66, -0.27), (-0.66, 0.27), (0.66, 0.27)):
    P.torno(m, [(0.022, 0.0), (0.02, 0.02, 'q'), (0.019, 0.025), (0.019, 0.86)], IX, segs=10, tampa_base=True, M=T(x, y, 0))
fim(m)

m = novo("P_Geladeira_Cozinha")
P.caixa(m, (-0.35, -0.33, 0.05), (0.35, 0.35, 1.80), PB, r=0.02, skip=('nz',))
P.caixa(m, (-0.345, -0.355, 1.215), (0.345, -0.33, 1.79), PB, r=0.015)
P.caixa(m, (-0.345, -0.355, 0.06), (0.345, -0.33, 1.20), PB, r=0.015)
P.tubo(m, [(0.28, -0.355, 1.27), (0.28, -0.385, 1.29), (0.28, -0.385, 1.56), (0.28, -0.355, 1.58)], 0.011, IX, segs=8)
P.tubo(m, [(0.28, -0.355, 0.75), (0.28, -0.385, 0.77), (0.28, -0.385, 1.10), (0.28, -0.355, 1.12)], 0.011, IX, segs=8)
P.caixa(m, (-0.33, -0.31, 0.0), (0.33, 0.33, 0.05), ME, r=0.004, skip=('nz',))
fim(m)

m = novo("P_Prateleira")                                   # estante de aco (deposito)
for (x, y) in ((-0.6, -0.2), (0.6, -0.2), (-0.6, 0.2), (0.6, 0.2)):
    P.caixa(m, (x - 0.017, y - 0.017, 0.0), (x + 0.017, y + 0.017, 1.8), ME, r=0.004, skip=('nz',))
for z in (0.10, 0.60, 1.10, 1.60):
    P.caixa(m, (-0.6, -0.2, z), (0.6, 0.2, z + 0.025), "Pol_Inox", r=0.004)
    P.caixa(m, (-0.6, -0.205, z - 0.03), (0.6, -0.195, z + 0.025), ME, r=0.002)
for sx in (-1, 1):                                         # travamento em X nas laterais
    P.tubo(m, [(sx * 0.6, -0.2, 0.15), (sx * 0.6, 0.2, 1.55)], 0.005, ME, segs=4)
    P.tubo(m, [(sx * 0.6, 0.2, 0.15), (sx * 0.6, -0.2, 1.55)], 0.005, ME, segs=4)
fim(m)

m = novo("P_Caixa_Papelao")
P.caixa(m, (-0.2, -0.15, 0.0), (0.2, 0.15, 0.30), "Papelao", r=0.006, skip=('nz',))
m.box((-0.003, -0.152, 0.30), (0.003, 0.152, 0.301), BP, skip=('nz',))
m.box((-0.2, -0.03, 0.30), (0.2, 0.03, 0.302), "Pol_Rotulo", skip=('nz',))
for sx in (-1, 1):
    m.box((sx * 0.2 - (0.001 if sx < 0 else 0), -0.03, 0.22), (sx * 0.2 + (0.001 if sx > 0 else 0), 0.03, 0.30), "Pol_Rotulo")
fim(m)

# =====================================================================  ESCRITORIO / LOUNGE
D = MV
m = novo("P_Cofre")
P.caixa(m, (-0.25, -0.25, 0.0), (0.25, 0.25, 0.60), ME, r=0.012, skip=('nz',))
P.caixa(m, (-0.22, -0.262, 0.04), (0.22, -0.248, 0.56), ME, r=0.006)
P.torno(m, [(0.055, 0.0), (0.055, 0.015, 'q'), (0.045, 0.025)], IX, segs=16, tampa_topo=True, M=T(0.05, -0.262, 0.36) @ RX(90))
P.tubo(m, [(-0.15, -0.262, 0.30), (-0.15, -0.29, 0.31), (-0.15, -0.29, 0.39), (-0.15, -0.262, 0.40)], 0.008, IX, segs=6)
fim(m)

m = novo("P_Mesa_Escritorio")
P.caixa(m, (-0.6, -0.3, 0.72), (0.6, 0.3, 0.75), D, r=0.006)
P.caixa(m, (-0.6, -0.28, 0.0), (-0.57, 0.28, 0.72), D, r=0.004, skip=('nz', 'pz'))
P.caixa(m, (0.15, -0.28, 0.05), (0.6, 0.28, 0.72), D, r=0.006, skip=('pz',))
P.caixa(m, (-0.57, 0.26, 0.35), (0.15, 0.28, 0.72), D, r=0.004, skip=('pz',))
for (z0, z1) in ((0.06, 0.28), (0.29, 0.50), (0.51, 0.71)):
    P.caixa(m, (0.16, -0.29, z0), (0.59, -0.276, z1), MV, r=0.004)
    P.caixa(m, (0.33, -0.302, (z0 + z1) / 2 - 0.008), (0.43, -0.29, (z0 + z1) / 2 + 0.008), IX, r=0.003)
P.caixa(m, (-0.27, 0.12, 0.85), (0.27, 0.15, 1.15), "Pol_Plastico_Preto", r=0.006)
m.face([(-0.25, 0.119, 0.87), (0.25, 0.119, 0.87), (0.25, 0.119, 1.13), (-0.25, 0.119, 1.13)], "Janela_Escura", facing=(0, -1, 0))
P.torno(m, [(0.012, 0.75), (0.012, 0.85)], ME, segs=6, M=T(0, 0.14, 0))
P.caixa(m, (-0.08, 0.08, 0.75), (0.08, 0.18, 0.762), ME, r=0.004)
P.caixa(m, (-0.21, -0.18, 0.75), (0.21, -0.04, 0.768), "Pol_Plastico_Preto", r=0.004)
P.caixa(m, (0.28, -0.13, 0.75), (0.34, -0.03, 0.775), "Pol_Plastico_Preto", r=0.01)
fim(m)

m = novo("P_Cadeira_Escritorio")
TC = "Tecido_Marrom"
P.caixa(m, (-0.24, -0.23, 0.44), (0.24, 0.23, 0.53), TC, r=0.04, seg=2)
P.caixa(m, (-0.22, 0.19, 0.58), (0.22, 0.26, 1.0), TC, r=0.04, seg=2, M=T(0, 0.22, 0.58) @ RX(-8) @ T(0, -0.22, -0.58))
P.caixa(m, (-0.03, 0.17, 0.48), (0.03, 0.23, 0.62), ME, r=0.008)
for s in (-1, 1):                                          # bracos
    P.tubo(m, [(s * 0.25, 0.05, 0.50), (s * 0.27, 0.05, 0.66), (s * 0.27, -0.15, 0.66)], 0.012, ME, segs=6)
    P.caixa(m, (s * 0.27 - 0.03, -0.20, 0.655), (s * 0.27 + 0.03, 0.02, 0.68), "Pol_Plastico_Preto", r=0.008)
P.torno(m, [(0.026, 0.10), (0.026, 0.30, 'q'), (0.019, 0.31), (0.019, 0.44)], ME, segs=10, tampa_topo=True)
for k in range(5):
    a = math.radians(k * 72 + 90)
    ca, sa = math.cos(a), math.sin(a)
    P.tubo(m, [(0, 0, 0.10), (0.29 * ca, 0.29 * sa, 0.06)], [0.02, 0.014], ME, segs=6)
    P.torno(m, [(0.025, 0.0), (0.025, 0.012)], "Pol_Plastico_Preto", segs=8, tampa_base=True, tampa_topo=True,
            M=T(0.29 * ca, 0.29 * sa, 0.025) @ RZ(k * 72 + 90) @ RX(90) @ T(0, 0, -0.006))
fim(m)

m = novo("P_Estante")
P.caixa(m, (-0.45, -0.175, 0), (-0.43, 0.175, 1.8), D, r=0.004)
P.caixa(m, (0.43, -0.175, 0), (0.45, 0.175, 1.8), D, r=0.004)
P.caixa(m, (-0.43, 0.155, 0), (0.43, 0.175, 1.8), D, r=0.003, skip=('py',))
for z in (0.0, 0.45, 0.9, 1.35, 1.78):
    P.caixa(m, (-0.43, -0.175, z), (0.43, 0.155, z + 0.02), D, r=0.004)
re_ = random.Random(5)
for z in (0.02, 0.47, 0.92, 1.37):
    x = -0.41
    while x < 0.3:
        w = re_.uniform(0.06, 0.25)
        h = re_.uniform(0.22, 0.38)
        mat = re_.choice(("Papelao", "Caixa_Agua", V, PB, "Papelao", "Pol_Couro"))
        P.caixa(m, (x, -0.12, z), (x + w, 0.13, z + h), mat, r=0.006, skip=('nz',))
        x += w + re_.uniform(0.0, 0.05)
fim(m)
print("polimento ok")
