# Mesa de truco redonda + 4 cadeiras, no lugar que o jogo usa (Blender MCP, exec):
#   TRUCO_TABLE (packages/shared/src/world.ts) = glTF (5,82; 3,45; -5,16), rotation -3,052, radius 0,52
#   -> Blender (5,82; 5,16; 3,45), rotacao Z = rotation (a rotacao em Y do glTF vira a mesma em Z do Blender).
#   TRUCO_SEATS: a 0,52 + 0,42 do centro, nos eixos locais da mesa (-Y, +X, +Y, -X no Blender), viradas para o centro.
#   O baralho e a vira ficam onde o BarScene.ts desenhava (local glTF (0,2; -0,14) e (0,11; -0,17)).
# Texturas: 47_texturas_truco.py. Os modificadores sao aplicados aqui: o 08_export copia so a malha.
# Tudo comeca com TR_ e vai para Interior_Superior (fundido em Bar_Mobilia no export). Rodar de novo refaz.
import math, sys
import bmesh, bpy
from mathutils import Vector, Matrix
sys.path.insert(0, r"C:\Users\rafael\BarBoteco\scripts")
import importlib
import barlib as B
importlib.reload(B)

MESA = Vector((5.82, 5.16, B.Z_PISO2))
ROTACAO = -3.052
RAIO = 0.52
COL = "Interior_Superior"
PREF = "TR_"
R_FELTRO = 0.42                       # meia largura do quadrado do tr_feltro.jpg (igual ao 47)
Z_FELTRO = 0.785

# ------------------------------------------------------------------ limpeza
for o in [o for o in bpy.data.objects if o.name.startswith(PREF)]:
    me = o.data
    bpy.data.objects.remove(o, do_unlink=True)
    if me is not None and me.users == 0:
        bpy.data.meshes.remove(me)
for me in [m for m in bpy.data.meshes if m.name.startswith(PREF) and m.users == 0]:
    bpy.data.meshes.remove(me)
col = bpy.data.collections[COL]
tmp = bpy.data.collections.get("_TR_TMP") or bpy.data.collections.new("_TR_TMP")
if tmp.name not in bpy.context.scene.collection.children.keys():
    bpy.context.scene.collection.children.link(tmp)

# ------------------------------------------------------------------ materiais
M_FELTRO = B.material("TR_Feltro", tex="tr_feltro.jpg", normal="tr_feltro_n.jpg", nstr=0.4, rough=0.95)
M_COURO = B.material("TR_Couro", tex="tr_couro.jpg", normal="tr_couro_n.jpg", nstr=0.8, rough=0.40)
M_MADEIRA = B.material("TR_Madeira", tex="tr_madeira.jpg", normal="tr_madeira_n.jpg", nstr=0.3, rough=0.25)
M_LATAO = B.material("TR_Latao", color=(0.78, 0.55, 0.22), rough=0.25, metal=1.0)
M_CARTAS = B.material("TR_Cartas", tex="tr_cartas.png", rough=0.4)
M_PAPEL = B.material("TR_Papel", color=(0.90, 0.88, 0.84), rough=0.6)
M_PALITO = B.material("TR_Palito", color=(0.80, 0.62, 0.38), rough=0.7)
M_CABECA = B.material("TR_Cabeca", color=(0.55, 0.06, 0.05), rough=0.5)
T_MAD, T_COURO = 0.6, 0.25            # tamanho do tile (m)


# ------------------------------------------------------------------ malha (mesmas ferramentas do 46)
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
        bmesh.ops.remove_doubles(s.bm, verts=s.bm.verts, dist=1e-5)
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
    for p in o.data.polygons:
        p.use_smooth = True
    if split:
        md = o.modifiers.new("split", 'EDGE_SPLIT')
        md.split_angle = math.radians(split); md.use_edge_sharp = True
        avaliar(o)
    return o


def uv_caixa(o, tile):
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


def caixa(nome, mn, mx, m, bevel=0.004, seg=2, cortes_x=(), cortes_y=(), tile=T_MAD, deform=None, split=35):
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
    return assentar(o, split)


def torno(nome, perfil, mats, centro=(0, 0, 0), segs=32, tile=T_MAD, tampa=None):
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
    s.grade(P, UV, [m] * segs)


def juntar(nome, objs):
    objs = [o for o in objs if o]
    with bpy.context.temp_override(active_object=objs[0], object=objs[0], selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    o = objs[0]; o.name = nome; o.data.name = nome
    return o


def girar(o, ang, desloc=(0, 0, 0)):
    o.data.transform(Matrix.Translation(Vector(desloc)) @ Matrix.Rotation(ang, 4, 'Z'))
    o.data.update()
    return o


# ------------------------------------------------------------------ contorno redondo
N_ARCO = 128


def circulo(d=0.0):
    """[(ponto 2D no raio RAIO - d, normal externa)] fechado (o ultimo repete o primeiro)."""
    out = []
    for i in range(N_ARCO + 1):
        t = 2 * math.pi * i / N_ARCO
        n = Vector((math.cos(t), math.sin(t)))
        out.append((n * (RAIO - d), n))
    return out


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


def disco(s, raio, z, m, uv_fn, para_cima=True):
    vs = [s.bm.verts.new((raio * math.cos(2 * math.pi * i / N_ARCO), raio * math.sin(2 * math.pi * i / N_ARCO), z)) for i in range(N_ARCO)]
    f = s.bm.faces.new(vs); f.material_index = s.mi(m); f.smooth = False
    for l in f.loops:
        l[s.uv].uv = uv_fn(l.vert.co)
    if (f.normal.z < 0) == para_cima:
        f.normal_flip()
    bmesh.ops.triangulate(s.bm, faces=[f], quad_method='BEAUTY', ngon_method='BEAUTY')


# ------------------------------------------------------------------ mesa
pecas = []

# trilho estofado de couro (perfil do 46, um pouco mais estreito para a mesa de 1,04 m)
PERFIL_TRILHO = [(0.112, 0.784), (0.111, 0.797), (0.105, 0.811), (0.092, 0.824), (0.073, 0.833), (0.051, 0.837),
                 (0.031, 0.834), (0.015, 0.825), (0.005, 0.810), (0.0, 0.795), (0.002, 0.778), (0.010, 0.766),
                 (0.030, 0.762), (0.112, 0.762), (0.112, 0.784)]
s = Malha()
varrer(s, circulo(), PERFIL_TRILHO, [M_COURO] * (len(PERFIL_TRILHO) - 1), T_COURO, T_COURO)
pecas.append(s.objeto("TR_Trilho", split=50))

# filete de latao entre o feltro e o trilho, e friso de latao embaixo do trilho
for nome, d, z, r in (("TR_Filete", 0.114, 0.787, 0.0045), ("TR_Friso", 0.012, 0.761, 0.004)):
    s = Malha()
    tubo(s, [Vector((p.x, p.y, z)) for p, _ in circulo(d)], r, M_LATAO, segs=8)
    pecas.append(s.objeto(nome, split=0))

# feltro (fica por baixo do trilho)
s = Malha()
disco(s, RAIO - 0.100, Z_FELTRO, M_FELTRO, lambda c: ((c.x + R_FELTRO) / (2 * R_FELTRO), (c.y + R_FELTRO) / (2 * R_FELTRO)))
pecas.append(s.objeto("TR_Feltro", split=0, normais=False))

# saia de imbuia com moldura embaixo, e o fundo
PERFIL_SAIA = [(0.050, 0.770), (0.028, 0.770), (0.028, 0.668), (0.022, 0.660), (0.022, 0.652), (0.030, 0.644),
               (0.050, 0.640), (0.050, 0.770)]
s = Malha()
varrer(s, circulo(), PERFIL_SAIA, [M_MADEIRA] * (len(PERFIL_SAIA) - 1), T_MAD, T_MAD)
pecas.append(s.objeto("TR_Saia", split=40))
s = Malha()
disco(s, RAIO - 0.045, 0.70, M_MADEIRA, lambda c: (c.x / T_MAD, c.y / T_MAD), para_cima=False)
pecas.append(s.objeto("TR_Fundo", split=0, normais=False))

# coluna torneada com dois aneis de latao, sobre um cubo onde encaixam os quatro pes
PERFIL_COLUNA = [(0.092, 0.020), (0.100, 0.035), (0.100, 0.105), (0.088, 0.122), (0.070, 0.140), (0.064, 0.160),
                 (0.070, 0.168), (0.070, 0.186), (0.060, 0.200), (0.050, 0.240), (0.047, 0.330), (0.056, 0.395),
                 (0.064, 0.410), (0.064, 0.430), (0.056, 0.445), (0.046, 0.500), (0.048, 0.560), (0.060, 0.600),
                 (0.090, 0.640), (0.125, 0.668), (0.130, 0.700)]
MAT_COLUNA = [M_MADEIRA] * (len(PERFIL_COLUNA) - 1)
for j in (5, 6, 11, 12, 13):
    MAT_COLUNA[j] = M_LATAO
pecas.append(torno("TR_Coluna", PERFIL_COLUNA, MAT_COLUNA, segs=40))

# pes em curva (nas diagonais, longe dos pes de quem senta), com sapata de latao
X0P, X1P = 0.07, 0.385


def pe_curvo(c):
    t = min(1.0, max(0.0, (c.x - X0P) / (X1P - X0P)))
    topo = 0.115 - 0.080 * t ** 0.75                     # o pe desce em curva ate a ponta
    if c.z > 0.02:
        c.z = 0.02 + (c.z - 0.02) / (0.115 - 0.02) * (topo - 0.02)
    c.y *= 1 - 0.30 * t
    return c


for k in range(4):
    ang = math.radians(45 + 90 * k)
    pe = caixa("TR_Pe", (X0P - 0.04, -0.034, 0.012), (X1P, 0.034, 0.115), M_MADEIRA, bevel=0.008, seg=3,
               cortes_x=[X0P + (X1P - X0P) * i / 10 for i in range(10)], deform=pe_curvo, split=40)
    pecas.append(girar(pe, ang))
    sap = caixa("TR_Sapata", (X1P - 0.05, -0.026, 0.0), (X1P + 0.004, 0.026, 0.014), M_LATAO, bevel=0.003, seg=2)
    pecas.append(girar(sap, ang))

# baralho e vira (verso e face do atlas tr_cartas.png: 3 celulas de 256x360)
CARTA_W, CARTA_H, CARTA_R = 0.064, 0.090, 0.0045


def cartao(nome, cx, cy, ang, z0, z1, celula):
    """Carta (ou monte) de canto redondo: topo com a celula do atlas, laterais de papel."""
    s = Malha()
    pts = []
    for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oy = qx * (CARTA_W / 2 - CARTA_R), qy * (CARTA_H / 2 - CARTA_R)
        for i in range(5):
            a = math.radians(a0 + 90 * i / 4)
            pts.append((ox + CARTA_R * math.cos(a), oy + CARTA_R * math.sin(a)))
    rot = Matrix.Rotation(ang, 2)
    w = [rot @ Vector(p) + Vector((cx, cy)) for p in pts]
    baixo = [s.bm.verts.new((p.x, p.y, z0)) for p in w]
    cima = [s.bm.verts.new((p.x, p.y, z1)) for p in w]
    n = len(w)
    for i in range(n):
        j = (i + 1) % n
        s.quad((baixo[i], baixo[j], cima[j], cima[i]), ((0.95, 0.02),) * 4, M_PAPEL, smooth=False)
    for vs, z in ((cima, z1), (baixo[::-1], z0)):
        f = s.bm.faces.new(vs); f.material_index = s.mi(M_CARTAS if z == z1 else M_PAPEL); f.smooth = False
        for l, p in zip(f.loops, pts if z == z1 else pts[::-1]):
            u = (p[0] / CARTA_W + 0.5) * (236 / 256) + 10 / 256
            v = (p[1] / CARTA_H + 0.5) * (340 / 360) + 10 / 360
            l[s.uv].uv = ((celula + u) / 3, v)
    return s.objeto(nome, split=0)


pecas.append(cartao("TR_Baralho", 0.20, 0.14, math.radians(8), Z_FELTRO, Z_FELTRO + 0.013, 0))
pecas.append(cartao("TR_Vira", 0.11, 0.17, math.radians(-14), Z_FELTRO, Z_FELTRO + 0.0008, 1))

# caixa de fosforos e os palitos dos tentos (marcador de pontos de boteco)
CX_F, CY_F, ANG_F = -0.165, -0.205, math.radians(28)
cx_f = caixa("TR_Fosforos", (-0.0265, -0.018, Z_FELTRO), (0.0265, 0.018, Z_FELTRO + 0.016), M_CARTAS, bevel=0.0012, seg=1)
uv = cx_f.data.uv_layers["UVMap"]
for p in cx_f.data.polygons:
    for li in p.loop_indices:
        c = cx_f.data.vertices[cx_f.data.loops[li].vertex_index].co
        if p.normal.z > 0.5:        # rotulo
            uv.data[li].uv = ((512 + 10 + (c.x / 0.053 + 0.5) * 236) / 768, 1 - (10 + (0.5 - c.y / 0.036) * 160) / 360)
        elif abs(p.normal.y) > 0.5:  # lixa nas laterais compridas
            uv.data[li].uv = ((512 + 10 + (c.x / 0.053 + 0.5) * 236) / 768, 1 - (195 + (c.z - Z_FELTRO) / 0.016 * 150) / 360)
        else:                       # vermelho
            uv.data[li].uv = (700 / 768, 1 - 180 / 360)
pecas.append(girar(cx_f, ANG_F, (CX_F, CY_F, 0)))
PALITOS = [(-0.235, -0.150, 12), (-0.228, -0.141, 9), (-0.221, -0.131, 15), (-0.120, -0.262, -64), (-0.108, -0.258, -60)]
for x, y, g in PALITOS:
    pal = caixa("TR_Palito", (-0.022, -0.001, Z_FELTRO), (0.020, 0.001, Z_FELTRO + 0.002), M_PALITO, bevel=0, tile=0.1)
    cab = caixa("TR_Cabeca", (0.019, -0.0016, Z_FELTRO), (0.025, 0.0016, Z_FELTRO + 0.0028), M_CABECA, bevel=0.0008, seg=1, tile=0.1)
    pecas += [girar(pal, math.radians(g), (x, y, 0)), girar(cab, math.radians(g), (x, y, 0))]

mesa = juntar(PREF + "Mesa", pecas)
mesa.location = MESA
mesa.rotation_euler = (0, 0, ROTACAO)

# ------------------------------------------------------------------ cadeira (frente para -Y, encosto em +Y), assento a 0,47 m
pecas = []
LX, LY = 0.185, 0.175
Z_ASS = 0.40


def poste(z):
    return LY + max(0.0, z - Z_ASS) * 0.11


PERFIL_PERNA = [(0.017, 0.0), (0.019, 0.004), (0.019, 0.030), (0.016, 0.034), (0.017, 0.10), (0.021, 0.20), (0.022, 0.26),
                (0.025, 0.285), (0.021, 0.31), (0.024, Z_ASS)]
MAT_PERNA = [M_LATAO, M_LATAO, M_LATAO] + [M_MADEIRA] * (len(PERFIL_PERNA) - 4)
for sx in (-1, 1):
    pecas.append(torno("TR_Perna", PERFIL_PERNA, MAT_PERNA, centro=(sx * LX, -LY, 0), segs=14))
    pecas.append(torno("TR_Perna", PERFIL_PERNA, MAT_PERNA, centro=(sx * LX, LY, 0), segs=14))
    s = Malha()
    tubo(s, [Vector((sx * (LX - 0.012 * k / 10), poste(Z_ASS - 0.02 + 0.53 * k / 10), Z_ASS - 0.02 + 0.53 * k / 10)) for k in range(11)],
         0.019, M_MADEIRA, segs=14)
    s.tampar(M_MADEIRA, lambda c: (c.x / T_MAD, c.y / T_MAD))
    pecas.append(s.objeto("TR_Poste", split=40))
    s = Malha()
    tubo(s, [Vector((sx * LX, -LY, 0.15)), Vector((sx * LX, LY, 0.15))], 0.010, M_MADEIRA, segs=10)
    s.tampar(M_MADEIRA, lambda c: (0, 0))
    pecas.append(s.objeto("TR_Travessa", split=40))
s = Malha()
tubo(s, [Vector((-LX, 0, 0.15)), Vector((LX, 0, 0.15))], 0.010, M_MADEIRA, segs=10)
s.tampar(M_MADEIRA, lambda c: (0, 0))
pecas.append(s.objeto("TR_Travessa", split=40))
s = Malha()
tubo(s, [Vector((-LX, -LY, 0.11)), Vector((LX, -LY, 0.11))], 0.008, M_LATAO, segs=10)
s.tampar(M_LATAO, lambda c: (0, 0))
pecas.append(s.objeto("TR_Apoio_Pes", split=40))

pecas.append(caixa("TR_Quadro", (-0.215, -0.205, 0.345), (0.215, 0.205, Z_ASS + 0.005), M_MADEIRA, bevel=0.006, seg=3))


def abaular(c):
    if c.z > 0.44:
        k = (1 - (c.x / 0.228) ** 2) * (1 - (c.y / 0.218) ** 2)
        c.z += 0.009 * max(0.0, k) * min(1.0, (c.z - 0.44) / 0.02)
    return c


pecas.append(caixa("TR_Almofada", (-0.228, -0.218, Z_ASS), (0.228, 0.218, 0.462), M_COURO, bevel=0.024, seg=5,
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
pecas.append(s.objeto("TR_Tachas", split=0, normais=False))


# encosto vazado: travessa de baixo, tres ripas e a travessa de cima larga (curvadas em planta, inclinadas como os postes)
def curvar(c):
    c.y = c.y + poste(c.z) - LY + (LX ** 2 - c.x ** 2) / (2 * 0.55)
    return c


pecas.append(caixa("TR_Encosto_Baixo", (-0.175, LY - 0.012, 0.525), (0.175, LY + 0.012, 0.560), M_MADEIRA, bevel=0.005, seg=3,
                   cortes_x=[-0.18 + 0.36 * k / 10 for k in range(1, 10)], deform=curvar))
for x0, x1 in ((-0.115, -0.075), (-0.032, 0.032), (0.075, 0.115)):
    pecas.append(caixa("TR_Ripa", (x0, LY - 0.008, 0.555), (x1, LY + 0.008, 0.815), M_MADEIRA, bevel=0.004, seg=2,
                       cortes_x=[x0 + (x1 - x0) * k / 3 for k in range(1, 3)], deform=curvar))
pecas.append(caixa("TR_Encosto_Topo", (-0.215, LY - 0.016, 0.805), (0.215, LY + 0.016, 0.925), M_MADEIRA, bevel=0.012, seg=4,
                   cortes_x=[-0.215 + 0.43 * k / 12 for k in range(1, 12)], deform=curvar))
cadeira = juntar(PREF + "Cadeira", pecas)
me_cadeira = cadeira.data

# ------------------------------------------------------------------ no mapa
tmp.objects.unlink(mesa); col.objects.link(mesa)
bpy.data.objects.remove(cadeira, do_unlink=True)
D = RAIO + 0.42
for i in range(4):                     # TRUCO_SEATS: glTF dx = D sin a, dz = D cos a -> Blender (dx, -dz)
    a = ROTACAO + i * math.pi / 2
    dx, dy = D * math.sin(a), -D * math.cos(a)
    o = bpy.data.objects.new(PREF + "Cadeira_%d" % (i + 1), me_cadeira)
    col.objects.link(o)
    o.location = MESA + Vector((dx, dy, 0))
    o.rotation_euler = (0, 0, math.atan2(-dx, dy))     # frente (-Y local) para o centro da mesa
bpy.data.collections.remove(tmp)
for me in [m for m in bpy.data.meshes if m.users == 0 and m.name.startswith(PREF)]:
    bpy.data.meshes.remove(me)

tri = lambda me: sum(len(p.vertices) - 2 for p in me.polygons)
print("mesa", tri(mesa.data), "tris; cadeira", tri(me_cadeira), "tris x4")
