# Mesa de blackjack (meia-lua de cassino) + 4 cadeiras estofadas, no lugar que o jogo usa (Blender MCP, exec):
#   BLACKJACK_TABLE (packages/shared/src/world.ts) = glTF (17,4; 3,45; -7,4) -> Blender (17,4; 7,4; 3,45), rx 0,95 / rz 0,55.
#   Cadeiras em -54/-18/18/54 graus na elipse (rx+0,43; rz+0,42), viradas para o centro, assento a 0,47 m.
#   O dealer fica em glTF z-0,95 (Blender +Y): a borda reta da meia-lua fica desse lado.
# Texturas: 45_texturas_blackjack.py. Os modificadores sao aplicados aqui: o 08_export copia so a malha.
# Tudo comeca com BJ_ e vai para Interior_Superior (fundido em Bar_Mobilia no export). Rodar de novo refaz.
import math, sys
import bmesh, bpy
from mathutils import Vector, Matrix
sys.path.insert(0, r"C:\Users\rafael\BarBoteco\scripts")
import importlib
import barlib as B
importlib.reload(B)

MESA = Vector((17.4, 7.4, B.Z_PISO2))
COL = "Interior_Superior"
PREF = "BJ_"
A, BB, CY = 0.95, 0.97, 0.42          # meia-lua: elipse (A, BB) centrada em (0, CY), metade y <= CY
FX0, FX1, FY0, FY1 = -1.0, 1.0, -0.57, 0.43   # retangulo do bj_feltro.jpg (igual ao 45)
Z_FELTRO = 0.785
Y_DEALER = 0.30                       # o feltro termina aqui; dali ate 0,43 e a borda de madeira do dealer
CADEIRAS_GRAUS = (-54, -18, 18, 54)

# ------------------------------------------------------------------ limpeza
for o in [o for o in bpy.data.objects if o.name.startswith(PREF)]:
    me = o.data
    bpy.data.objects.remove(o, do_unlink=True)
    if me is not None and me.users == 0:
        bpy.data.meshes.remove(me)
for me in [m for m in bpy.data.meshes if m.name.startswith(PREF) and m.users == 0]:
    bpy.data.meshes.remove(me)
col = bpy.data.collections[COL]
tmp = bpy.data.collections.get("_BJ_TMP") or bpy.data.collections.new("_BJ_TMP")
if tmp.name not in bpy.context.scene.collection.children.keys():
    bpy.context.scene.collection.children.link(tmp)

# ------------------------------------------------------------------ materiais
M_FELTRO = B.material("BJ_Feltro", tex="bj_feltro.jpg", normal="bj_feltro_n.jpg", nstr=0.4, rough=0.95)
M_COURO = B.material("BJ_Couro", tex="bj_couro.jpg", normal="bj_couro_n.jpg", nstr=0.8, rough=0.42)
M_MADEIRA = B.material("BJ_Madeira", tex="bj_madeira.jpg", normal="bj_madeira_n.jpg", nstr=0.3, rough=0.22)
M_LATAO = B.material("BJ_Latao", color=(0.78, 0.55, 0.22), rough=0.25, metal=1.0)
M_ACRILICO = B.material("BJ_Acrilico", color=(0.012, 0.012, 0.014), rough=0.08)
M_FICHAS = B.material("BJ_Fichas", tex="bj_fichas.png", rough=0.35)
M_CARTA = B.material("BJ_Carta", tex="bj_carta.jpg", rough=0.4)
M_PAPEL = B.material("BJ_Papel", color=(0.92, 0.90, 0.85), rough=0.6)
T_MAD, T_COURO = 0.6, 0.25            # tamanho do tile (m)


# ------------------------------------------------------------------ malha
class Malha:
    def __init__(s):
        s.bm = bmesh.new()
        s.uv = s.bm.loops.layers.uv.new("UVMap")
        s.mats = []

    def mi(s, m):
        if m not in s.mats:
            s.mats.append(m)
        return s.mats.index(m)

    def quad(s, vs, uvs, m, smooth=True):
        f = s.bm.faces.new(vs)
        f.material_index = s.mi(m); f.smooth = smooth
        for l, uv in zip(f.loops, uvs):
            l[s.uv].uv = uv
        return f

    def grade(s, P, UV, mats):
        """P[i][j] pontos 3D; UV[i][j]; mats[j] = material do segmento j..j+1 do perfil."""
        V = [[s.bm.verts.new(p) for p in row] for row in P]
        for i in range(len(P) - 1):
            for j in range(len(P[0]) - 1):
                s.quad((V[i][j], V[i + 1][j], V[i + 1][j + 1], V[i][j + 1]),
                       (UV[i][j], UV[i + 1][j], UV[i + 1][j + 1], UV[i][j + 1]), mats[j])
        return V

    def tampar(s, m, uv_fn):
        """Fecha os furos (pontas de varreduras e tornos) e projeta a UV nas tampas."""
        bmesh.ops.remove_doubles(s.bm, verts=s.bm.verts, dist=1e-5)     # costuras primeiro
        antes = set(s.bm.faces)
        bmesh.ops.holes_fill(s.bm, edges=[e for e in s.bm.edges if e.is_boundary], sides=512)
        for f in s.bm.faces:
            if f not in antes:
                f.material_index = s.mi(m); f.smooth = False
                for l in f.loops:
                    l[s.uv].uv = uv_fn(l.vert.co)

    def objeto(s, nome, split=35.0, normais=True):
        bmesh.ops.remove_doubles(s.bm, verts=s.bm.verts, dist=1e-5)
        if normais:
            bmesh.ops.recalc_face_normals(s.bm, faces=s.bm.faces)
        me = bpy.data.meshes.new(nome)
        s.bm.to_mesh(me); s.bm.free()
        for m in s.mats:
            me.materials.append(m)
        o = bpy.data.objects.new(nome, me)
        tmp.objects.link(o)
        return assentar(o, split)


def avaliar(o):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    velho = o.data
    o.modifiers.clear()
    o.data = me
    if velho.users == 0:
        bpy.data.meshes.remove(velho)
    return o


def assentar(o, split):
    """Sombreado suave com quinas vivas reais (edge split aplicado): nao depende do auto smooth depois do join."""
    for p in o.data.polygons:
        p.use_smooth = True
    if split:
        md = o.modifiers.new("split", 'EDGE_SPLIT')
        md.split_angle = math.radians(split); md.use_edge_sharp = True
        avaliar(o)
    return o


def uv_caixa(o, tile):
    """Projecao por eixo dominante (veio da madeira ao longo do maior lado da peca)."""
    me = o.data
    uv = me.uv_layers.get("UVMap") or me.uv_layers.new(name="UVMap")
    dims = o.dimensions
    for p in me.polygons:
        n = p.normal
        ax = max(range(3), key=lambda k: abs(n[k]))
        for li in p.loop_indices:
            c = me.vertices[me.loops[li].vertex_index].co
            a, b = [c[k] for k in range(3) if k != ax]
            eixos = [k for k in range(3) if k != ax]
            if dims[eixos[1]] > dims[eixos[0]]:
                a, b = b, a
            uv.data[li].uv = (a / tile, b / tile)


def caixa(nome, mn, mx, m, bevel=0.004, seg=2, cortes_x=(), cortes_y=(), tile=T_MAD, deform=None):
    """Caixa com bevel aplicado; cortes_x subdivide em X (para curvar com deform)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector(((mn[i] + mx[i]) / 2 + v.co[i] * (mx[i] - mn[i]) for i in range(3)))
    for x in cortes_x:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(x, 0, 0), plane_no=(1, 0, 0))
    for y in cortes_y:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, y, 0), plane_no=(0, 1, 0))
    me = bpy.data.meshes.new(nome); bm.to_mesh(me); bm.free()
    me.materials.append(m)
    o = bpy.data.objects.new(nome, me); tmp.objects.link(o)
    if bevel:
        md = o.modifiers.new("bevel", 'BEVEL')
        md.width = bevel; md.segments = seg; md.limit_method = 'ANGLE'; md.angle_limit = math.radians(30)
        avaliar(o)
    if deform:
        for v in o.data.vertices:
            v.co = deform(v.co.copy())
        o.data.update()
    uv_caixa(o, tile)
    return assentar(o, 35)


def torno(nome, perfil, mats, centro=(0, 0, 0), segs=32, tile=T_MAD, tampa=None):
    """Peca torneada: perfil [(r, z)] de baixo para cima; veio ao longo da altura (U)."""
    s = Malha()
    P, UV = [], []
    for i in range(segs + 1):
        a = 2 * math.pi * i / segs
        row, rowuv, acc = [], [], 0.0
        for j, (r, z) in enumerate(perfil):
            if j:
                acc += math.hypot(r - perfil[j - 1][0], z - perfil[j - 1][1])
            row.append(Vector((centro[0] + r * math.cos(a), centro[1] + r * math.sin(a), centro[2] + z)))
            rowuv.append((acc / tile, a * 0.05 / tile))
        P.append(row); UV.append(rowuv)
    s.grade(P, UV, mats)
    s.tampar(tampa or mats[-1], lambda c: ((c.x - centro[0]) / tile, (c.y - centro[1]) / tile))
    return s.objeto(nome, split=40)


def tubo(s, pts, r, m, segs=12, tile=T_MAD):
    """Tubo ao longo de pts (varredura com quadro paralelo)."""
    P, UV, acc = [], [], 0.0
    up = Vector((0, 0, 1))
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        ref = up if abs(t.dot(up)) < 0.9 else Vector((1, 0, 0))
        n1 = t.cross(ref).normalized(); n2 = t.cross(n1)
        if i:
            acc += (p - pts[i - 1]).length
        P.append([p + (n1 * math.cos(2 * math.pi * k / segs) + n2 * math.sin(2 * math.pi * k / segs)) * r for k in range(segs + 1)])
        UV.append([(acc / tile, (2 * math.pi * r * k / segs) / tile) for k in range(segs + 1)])
    # grade: i ao longo do tubo, j ao redor
    s.grade(P, UV, [m] * segs)


def juntar(nome, objs):
    objs = [o for o in objs if o]
    with bpy.context.temp_override(active_object=objs[0], object=objs[0], selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    o = objs[0]; o.name = nome; o.data.name = nome
    return o


# ------------------------------------------------------------------ contorno da meia-lua
def borda(t, d=0.0):
    """Ponto da meia-lua no angulo t (0 = lado dos jogadores), recuado d para dentro; e a normal externa."""
    n = Vector((math.sin(t) / A, -math.cos(t) / BB)).normalized()
    p = Vector((A * math.sin(t), CY - BB * math.cos(t)))
    return p - n * d, n


def varrer(s, caminho, perfil, mats, tile_u, tile_v):
    """caminho [(p2d, normal externa)], perfil [(d para dentro, z)]."""
    P, UV, acc = [], [], 0.0
    for i, (p, n) in enumerate(caminho):
        if i:
            acc += (p - caminho[i - 1][0]).length
        row, rowuv, pv = [], [], 0.0
        for j, (d, z) in enumerate(perfil):
            if j:
                pv += math.hypot(d - perfil[j - 1][0], z - perfil[j - 1][1])
            q = p - n * d
            row.append(Vector((q.x, q.y, z))); rowuv.append((acc / tile_u, pv / tile_v))
        P.append(row); UV.append(rowuv)
    return s.grade(P, UV, mats)


N_ARCO = 128
ARCO = [borda(-math.pi / 2 + math.pi * i / N_ARCO) for i in range(N_ARCO + 1)]

# ------------------------------------------------------------------ mesa
pecas = []

# trilho estofado de couro (perfil fechado; as pontas encostam na borda do dealer)
PERFIL_TRILHO = [(0.122, 0.784), (0.121, 0.797), (0.114, 0.812), (0.100, 0.825), (0.080, 0.834), (0.056, 0.838),
                 (0.034, 0.835), (0.016, 0.826), (0.005, 0.811), (0.0, 0.795), (0.002, 0.778), (0.010, 0.766),
                 (0.030, 0.762), (0.122, 0.762), (0.122, 0.784)]
s = Malha()
varrer(s, ARCO, PERFIL_TRILHO, [M_COURO] * (len(PERFIL_TRILHO) - 1), T_COURO, T_COURO)
s.tampar(M_LATAO, lambda c: (c.x, c.z))
pecas.append(s.objeto("BJ_Trilho", split=50))

# filete de latao entre o feltro e o trilho, e friso de latao embaixo do trilho
for nome, d, z, r in (("BJ_Filete", 0.124, 0.787, 0.0045), ("BJ_Friso", 0.012, 0.761, 0.004)):
    s = Malha()
    tubo(s, [Vector((p.x, p.y, z)) for p, _ in (borda(-math.pi / 2 + math.pi * i / N_ARCO, d) for i in range(N_ARCO + 1))], r, M_LATAO, segs=8)
    s.tampar(M_LATAO, lambda c: (0, 0))
    pecas.append(s.objeto(nome, split=0))

# feltro: meia-lua recuada 0,105 m (fica por baixo do trilho), cortada na borda do dealer
s = Malha()
pts = []
for i in range(N_ARCO + 1):
    p, _ = borda(-math.pi / 2 + math.pi * i / N_ARCO, 0.105)
    pts.append(p)
contorno = []
for a, b in zip(pts, pts[1:]):
    if a.y <= Y_DEALER:
        contorno.append(a)
    if (a.y - Y_DEALER) * (b.y - Y_DEALER) < 0:
        k = (Y_DEALER - a.y) / (b.y - a.y)
        contorno.append(a.lerp(b, k))
vs = [s.bm.verts.new((p.x, p.y, Z_FELTRO)) for p in contorno]
f = s.bm.faces.new(vs)
f.material_index = s.mi(M_FELTRO); f.smooth = False
for l in f.loops:
    l[s.uv].uv = ((l.vert.co.x - FX0) / (FX1 - FX0), (l.vert.co.y - FY0) / (FY1 - FY0))
if f.normal.z < 0:
    f.normal_flip()
bmesh.ops.triangulate(s.bm, faces=[f], quad_method='BEAUTY', ngon_method='BEAUTY')
pecas.append(s.objeto("BJ_Feltro", split=0, normais=False))

# saia de madeira: contorno inteiro (arco + lado reto do dealer), com moldura embaixo
caminho = [borda(-math.pi / 2 + math.pi * i / N_ARCO) for i in range(1, N_ARCO)]
canto_d = (Vector((A, CY)), Vector((1, 1)))      # quina: normal em esquadria (offset certo nos dois lados)
canto_e = (Vector((-A, CY)), Vector((-1, 1)))
caminho = [canto_e] + caminho + [canto_d]
for k in range(1, 8):
    caminho.append((Vector((A - 2 * A * k / 8, CY)), Vector((0, 1))))
caminho.append(canto_e)
PERFIL_SAIA = [(0.050, 0.770), (0.028, 0.770), (0.028, 0.668), (0.022, 0.660), (0.022, 0.652), (0.030, 0.644),
               (0.050, 0.640), (0.050, 0.770)]
s = Malha()
varrer(s, caminho, PERFIL_SAIA, [M_MADEIRA] * (len(PERFIL_SAIA) - 1), T_MAD, T_MAD)
pecas.append(s.objeto("BJ_Saia", split=40))

# fundo da mesa (visto de baixo)
s = Malha()
vs = [s.bm.verts.new((p.x - n.x * 0.045, p.y - n.y * 0.045, 0.70)) for p, n in caminho[:-1]]
f = s.bm.faces.new(vs); f.material_index = s.mi(M_MADEIRA)
for l in f.loops:
    l[s.uv].uv = (l.vert.co.x / T_MAD, l.vert.co.y / T_MAD)
if f.normal.z > 0:
    f.normal_flip()
bmesh.ops.triangulate(s.bm, faces=[f], quad_method='BEAUTY', ngon_method='BEAUTY')
pecas.append(s.objeto("BJ_Fundo", split=0, normais=False))

# borda do dealer com bandeja de fichas embutida
YB0, YB1, ZB0, ZB1 = Y_DEALER, 0.432, 0.752, 0.792
XT = 0.32
TY0, TY1 = 0.316, 0.416
for nome, mn, mx in (("BJ_Dealer_E", (-0.935, YB0, ZB0), (-XT, YB1, ZB1)), ("BJ_Dealer_D", (XT, YB0, ZB0), (0.935, YB1, ZB1)),
                     ("BJ_Dealer_F", (-XT, YB0, ZB0), (XT, TY0, ZB1)), ("BJ_Dealer_T", (-XT, TY1, ZB0), (XT, YB1, ZB1))):
    pecas.append(caixa(nome, mn, mx, M_MADEIRA, bevel=0.005, seg=3))
pecas.append(caixa("BJ_Bandeja", (-XT, TY0, ZB0), (XT, TY1, 0.758), M_ACRILICO, bevel=0))
for k in range(9):
    x = -XT + 2 * XT * k / 8
    pecas.append(caixa("BJ_Divisoria", (x - 0.002, TY0, 0.758), (x + 0.002, TY1, 0.776), M_ACRILICO, bevel=0.0015, seg=1))

# fichas na bandeja: um rolo por divisoria, cada ficha com a faixa lateral do atlas
FICHA_R, FICHA_E, SEG_F = 0.019, 0.0034, 14
cores = [0, 0, 1, 1, 2, 2, 3, 3]
s = Malha()
for k in range(8):
    cx = -XT + 2 * XT * (k + 0.5) / 8
    cz = 0.758 + FICHA_R
    n = int((TY1 - TY0 - 0.006) / FICHA_E) - (k % 3) * 2      # alturas desiguais, como numa banca de verdade
    y0 = TY0 + 0.003
    cor = cores[k]
    aneis = []
    for i in range(n + 1):
        y = y0 + i * FICHA_E
        aneis.append([s.bm.verts.new((cx + FICHA_R * math.cos(2 * math.pi * a / SEG_F), y, cz + FICHA_R * math.sin(2 * math.pi * a / SEG_F)))
                      for a in range(SEG_F)])
    for i in range(n):
        for a in range(SEG_F):
            b = (a + 1) % SEG_F
            u0 = (cor + a / SEG_F) / 4; u1 = (cor + (a + 1) / SEG_F) / 4
            s.quad((aneis[i][a], aneis[i][b], aneis[i + 1][b], aneis[i + 1][a]),
                   ((u0, 0.002), (u1, 0.002), (u1, 0.198), (u0, 0.198)), M_FICHAS)
    for anel in (aneis[0], aneis[-1]):
        f = s.bm.faces.new(anel); f.material_index = s.mi(M_FICHAS); f.smooth = False
        for l in f.loops:
            c = l.vert.co
            l[s.uv].uv = ((cor * 256 + 128 + (c.x - cx) / FICHA_R * 120) / 1024, 1 - (128 - (c.z - cz) / FICHA_R * 120) / 320)
pecas.append(s.objeto("BJ_Fichas", split=60))


# sapato de cartas (lado esquerdo do dealer, +X) e porta-descarte (direito, -X)
def prisma(nome, perfil_xz, y0, y1, m, origem, bevel=0.003):
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z)) for x, z in perfil_xz]
    b = [bm.verts.new((x, y1, z)) for x, z in perfil_xz]
    bm.faces.new(a); bm.faces.new(b[::-1])
    for i in range(len(a)):
        j = (i + 1) % len(a)
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.translate(bm, verts=bm.verts, vec=origem)
    me = bpy.data.meshes.new(nome); bm.to_mesh(me); bm.free(); me.materials.append(m)
    o = bpy.data.objects.new(nome, me); tmp.objects.link(o)
    md = o.modifiers.new("bevel", 'BEVEL'); md.width = bevel; md.segments = 2
    md.limit_method = 'ANGLE'; md.angle_limit = math.radians(30)
    avaliar(o); uv_caixa(o, 0.3)
    return assentar(o, 35)


SAP = Vector((0.47, 0.17, Z_FELTRO + 0.006))
pecas.append(prisma("BJ_Sapato", [(0, 0), (0.17, 0), (0.17, 0.078), (0.062, 0.078), (0.0, 0.03)], -0.055, 0.055, M_ACRILICO, SAP))
# cartas aparecendo na rampa do sapato e a base de latao
s = Malha()
inc = math.atan2(0.078 - 0.03, 0.062)
w0, w1 = SAP + Vector((0.006, 0, 0.032)), SAP + Vector((0.058, 0, 0.078))
nrm = Vector((-math.sin(inc), 0, math.cos(inc))) * 0.0015
q = [w0 + Vector((0, -0.04, 0)) + nrm, w1 + Vector((0, -0.04, 0)) + nrm, w1 + Vector((0, 0.04, 0)) + nrm, w0 + Vector((0, 0.04, 0)) + nrm]
s.quad([s.bm.verts.new(v) for v in q], [(0.08, 0.05), (0.08, 0.70), (0.92, 0.70), (0.92, 0.05)], M_CARTA, smooth=False)
pecas.append(s.objeto("BJ_Sapato_Carta", split=0, normais=False))
pecas.append(caixa("BJ_Sapato_Base", (SAP.x - 0.004, -0.06 + SAP.y, Z_FELTRO), (SAP.x + 0.174, 0.06 + SAP.y, SAP.z), M_LATAO, bevel=0.002, seg=2))

DESC = Vector((-0.56, 0.17, Z_FELTRO))
for nome, mn, mx in (("BJ_Descarte_F", (-0.055, -0.045, 0), (0.055, -0.040, 0.05)), ("BJ_Descarte_T", (-0.055, 0.040, 0), (0.055, 0.045, 0.07)),
                     ("BJ_Descarte_E", (-0.055, -0.045, 0), (-0.050, 0.045, 0.07)), ("BJ_Descarte_D", (0.050, -0.045, 0), (0.055, 0.045, 0.07)),
                     ("BJ_Descarte_B", (-0.055, -0.045, 0), (0.055, 0.045, 0.004))):
    pecas.append(caixa(nome, DESC + Vector(mn), DESC + Vector(mx), M_ACRILICO, bevel=0.0015, seg=1))
pilha = caixa("BJ_Descarte_Pilha", DESC + Vector((-0.046, -0.036, 0.004)), DESC + Vector((0.046, 0.036, 0.034)), M_PAPEL, bevel=0.0015, seg=1)
pecas.append(pilha)
s = Malha()
zc = DESC.z + 0.0345
q = [(DESC.x - 0.044, DESC.y - 0.032), (DESC.x + 0.044, DESC.y - 0.032), (DESC.x + 0.044, DESC.y + 0.032), (DESC.x - 0.044, DESC.y + 0.032)]
s.quad([s.bm.verts.new((x, y, zc)) for x, y in q], [(0.05, 0.04), (0.05, 0.96), (0.95, 0.96), (0.95, 0.04)], M_CARTA, smooth=False)
pecas.append(s.objeto("BJ_Descarte_Carta", split=0, normais=False))

# duas colunas torneadas com base redonda e aneis de latao
PERFIL_COLUNA = [(0.200, 0.0), (0.205, 0.010), (0.200, 0.024), (0.175, 0.038), (0.120, 0.055), (0.075, 0.075),
                 (0.070, 0.085), (0.072, 0.097), (0.052, 0.115), (0.044, 0.20), (0.046, 0.30), (0.058, 0.335),
                 (0.064, 0.350), (0.058, 0.365), (0.046, 0.40), (0.042, 0.52), (0.050, 0.585), (0.070, 0.615),
                 (0.095, 0.640), (0.100, 0.700)]
MAT_COLUNA = [M_MADEIRA] * (len(PERFIL_COLUNA) - 1)
for j in (5, 6, 11, 12):                     # aneis de latao
    MAT_COLUNA[j] = M_LATAO
for x in (-0.42, 0.42):
    pecas.append(torno("BJ_Coluna", PERFIL_COLUNA, MAT_COLUNA, centro=(x, 0.10, 0), segs=32))

mesa = juntar(PREF + "Mesa", pecas)
mesa.location = MESA

# ------------------------------------------------------------------ cadeira (frente para -Y, encosto em +Y)
pecas = []
LX, LY = 0.185, 0.175                        # pernas
Z_ASS = 0.40                                 # topo da estrutura do assento


def poste(z):
    """Centro do pe traseiro (sobe inclinado para tras acima do assento)."""
    return LY + max(0.0, z - Z_ASS) * 0.11


PERFIL_PERNA = [(0.017, 0.0), (0.019, 0.004), (0.019, 0.030), (0.016, 0.034), (0.017, 0.10), (0.021, 0.20), (0.022, 0.26),
                (0.025, 0.285), (0.021, 0.31), (0.024, Z_ASS)]
MAT_PERNA = [M_LATAO, M_LATAO, M_LATAO] + [M_MADEIRA] * (len(PERFIL_PERNA) - 4)
for sx in (-1, 1):
    pecas.append(torno("BJ_Perna", PERFIL_PERNA, MAT_PERNA, centro=(sx * LX, -LY, 0), segs=14))
    pecas.append(torno("BJ_Perna", PERFIL_PERNA, MAT_PERNA, centro=(sx * LX, LY, 0), segs=14))
    # pe traseiro continua ate o topo do encosto
    s = Malha()
    tubo(s, [Vector((sx * (LX - 0.012 * k / 10), poste(Z_ASS - 0.02 + 0.56 * k / 10), Z_ASS - 0.02 + 0.56 * k / 10)) for k in range(11)],
         0.019, M_MADEIRA, segs=14)
    s.tampar(M_MADEIRA, lambda c: (c.x / T_MAD, c.y / T_MAD))
    pecas.append(s.objeto("BJ_Poste", split=40))
    # travessas laterais
    s = Malha()
    tubo(s, [Vector((sx * LX, -LY, 0.15)), Vector((sx * LX, LY, 0.15))], 0.010, M_MADEIRA, segs=10)
    s.tampar(M_MADEIRA, lambda c: (0, 0))
    pecas.append(s.objeto("BJ_Travessa", split=40))
s = Malha()
tubo(s, [Vector((-LX, 0, 0.15)), Vector((LX, 0, 0.15))], 0.010, M_MADEIRA, segs=10)
s.tampar(M_MADEIRA, lambda c: (0, 0))
pecas.append(s.objeto("BJ_Travessa", split=40))
# travessa de apoio dos pes, na frente, em latao
s = Malha()
tubo(s, [Vector((-LX, -LY, 0.11)), Vector((LX, -LY, 0.11))], 0.008, M_LATAO, segs=10)
s.tampar(M_LATAO, lambda c: (0, 0))
pecas.append(s.objeto("BJ_Apoio_Pes", split=40))

# quadro do assento e almofada (abaulada) com tachas de latao
pecas.append(caixa("BJ_Quadro", (-0.215, -0.205, 0.345), (0.215, 0.205, Z_ASS + 0.005), M_MADEIRA, bevel=0.006, seg=3))


def abaular(c):
    if c.z > 0.44:
        k = (1 - (c.x / 0.228) ** 2) * (1 - (c.y / 0.218) ** 2)
        c.z += 0.009 * max(0.0, k) * min(1.0, (c.z - 0.44) / 0.02)
    return c


pecas.append(caixa("BJ_Almofada", (-0.228, -0.218, Z_ASS), (0.228, 0.218, 0.462), M_COURO, bevel=0.024, seg=5,
                   cortes_x=[-0.228 + 0.456 * k / 8 for k in range(1, 8)], cortes_y=[-0.218 + 0.436 * k / 8 for k in range(1, 8)],
                   tile=T_COURO, deform=abaular))
s = Malha()
for x, y in ([(-0.20 + 0.04 * k, -0.2185) for k in range(11)] + [(sx * 0.2285, -0.18 + 0.04 * k) for sx in (-1, 1) for k in range(10)]):
    nrm = Vector((0, -1, 0)) if abs(y + 0.2185) < 1e-6 else Vector((math.copysign(1, x), 0, 0))
    c = Vector((x, y, 0.425))
    t1 = Vector((0, 0, 1)); t2 = nrm.cross(t1)
    aneis = []
    for i, (rr, h) in enumerate(((0.0055, 0.0), (0.0048, 0.0025), (0.0028, 0.0043), (0.0, 0.0050))):
        aneis.append([s.bm.verts.new(c + nrm * h + (t1 * math.cos(2 * math.pi * a / 8) + t2 * math.sin(2 * math.pi * a / 8)) * rr) for a in range(8)])
    for i in range(3):
        for a in range(8):
            b = (a + 1) % 8
            s.quad((aneis[i][a], aneis[i][b], aneis[i + 1][b], aneis[i + 1][a]), ((0, 0),) * 4, M_LATAO)
pecas.append(s.objeto("BJ_Tachas", split=0, normais=False))


# encosto: travessa de baixo, almofada curva e travessa de cima (curvadas em planta, inclinadas como os postes)
def curvar(c):
    c.y = c.y + poste(c.z) - LY + (LX ** 2 - c.x ** 2) / (2 * 0.55)     # nas pontas encosta nos postes
    return c


cortes = [-0.18 + 0.36 * k / 10 for k in range(1, 10)]
pecas.append(caixa("BJ_Encosto_Baixo", (-0.175, LY - 0.012, 0.525), (0.175, LY + 0.012, 0.565), M_MADEIRA, bevel=0.005, seg=3,
                   cortes_x=cortes, deform=curvar))
pecas.append(caixa("BJ_Encosto", (-0.172, LY - 0.016, 0.575), (0.172, LY + 0.026, 0.855), M_COURO, bevel=0.016, seg=4,
                   cortes_x=cortes, tile=T_COURO, deform=curvar))
pecas.append(caixa("BJ_Encosto_Topo", (-0.215, LY - 0.016, 0.862), (0.215, LY + 0.016, 0.945), M_MADEIRA, bevel=0.012, seg=4,
                   cortes_x=[-0.215 + 0.43 * k / 12 for k in range(1, 12)], deform=curvar))
cadeira = juntar(PREF + "Cadeira", pecas)
me_cadeira = cadeira.data

# ------------------------------------------------------------------ no mapa
for o in (mesa,):
    tmp.objects.unlink(o); col.objects.link(o)
bpy.data.objects.remove(cadeira, do_unlink=True)
for i, g in enumerate(CADEIRAS_GRAUS):
    a = math.radians(g)
    dx, dy = (A + 0.43) * math.sin(a), -(0.55 + 0.42) * math.cos(a)
    o = bpy.data.objects.new(PREF + "Cadeira_%d" % (i + 1), me_cadeira)
    col.objects.link(o)
    o.location = MESA + Vector((dx, dy, 0))
    o.rotation_euler = (0, 0, math.atan2(-dx, dy))     # frente (-Y local) para o centro da mesa
bpy.data.collections.remove(tmp)
for me in [m for m in bpy.data.meshes if m.users == 0 and m.name.startswith(PREF)]:
    bpy.data.meshes.remove(me)

tri = lambda me: sum(len(p.vertices) - 2 for p in me.polygons)
print("mesa", tri(mesa.data), "tris; cadeira", tri(me_cadeira), "tris x4")
