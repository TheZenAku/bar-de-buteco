"""pollib - geometria "polida" sobre o barlib (churrasqueira e props do bar, scripts 35 e 36).

  caixa(m, mn, mx, mat, r)   caixa com cantos chanfrados (bevel de 1 segmento): pega luz nas arestas
  torno(m, perfil, mat)      solido de revolucao com UV continua (garrafas, barril, lixeira, vasos, luminarias)
  tubo(m, pts, r, mat)       tubo liso ao longo de uma polilinha (torneiras, puxadores, grelha, pes curvos)
  materiais()                materiais Pol_* com as texturas PBR do 33_texturas_pbr.py
  substituir(nome, m)        troca a geometria de uma malha existente mantendo o datablock (instancias atualizam)
"""
import math
import bpy, bmesh
from mathutils import Vector, Matrix
import barlib as B

SIDE_OF = (('px', Vector((1, 0, 0))), ('nx', Vector((-1, 0, 0))), ('py', Vector((0, 1, 0))),
           ('ny', Vector((0, -1, 0))), ('pz', Vector((0, 0, 1))), ('nz', Vector((0, 0, -1))))


def materiais():
    B.material("Pol_Tijolo", tex="pbr_tijolo.jpg", normal="pbr_tijolo_n.jpg", tile=(1.2, 1.2), rough=0.9)
    B.material("Pol_Tijolo_Fuligem", tex="pbr_tijolo.jpg", normal="pbr_tijolo_n.jpg", tile=(1.2, 1.2), rough=0.95,
               color=(0.26, 0.23, 0.21))
    B.material("Pol_Granito", tex="pbr_granito.jpg", tile=(1.0, 1.0), rough=0.22)
    B.material("Pol_Inox", tex="pbr_inox.jpg", tile=(0.6, 0.6), rough=0.3, metal=0.9)
    B.material("Pol_Ferro", color=(0.045, 0.045, 0.05), rough=0.5, metal=0.6)
    B.material("Pol_Carvao", tex="pbr_carvao.jpg", tile=(0.5, 0.5), rough=0.95, emis_tex=True, emis_str=1.5)
    B.material("Pol_Madeira_Verniz", tex="pbr_madeira_verniz.jpg", tile=(1.0, 1.0), rough=0.38)
    B.material("Pol_Madeira_Escura", tex="pbr_madeira_escura.jpg", tile=(1.0, 1.0), rough=0.45)
    B.material("Pol_Madeira_Rustica", tex="pbr_madeira_rustica.jpg", normal="pbr_madeira_rustica_n.jpg", tile=(1.6, 1.6), rough=0.8)
    B.material("Pol_Couro", color=(0.16, 0.065, 0.032), rough=0.5)
    B.material("Pol_Feltro", tex="pbr_feltro.jpg", tile=(0.5, 0.5), rough=0.95)
    B.material("Pol_Carne", color=(0.20, 0.07, 0.03), rough=0.4)
    B.material("Pol_Lenha_Topo", color=(0.52, 0.37, 0.22), rough=0.9)
    B.material("Pol_Plastico_Preto", color=(0.025, 0.025, 0.028), rough=0.55)


def _lado(n):
    return max(SIDE_OF, key=lambda s: n.dot(s[1]))[0]


def caixa(m, mn, mx, mat, r=0.008, M=None, mats=None, skip=(), seg=1):
    """Caixa com arestas chanfradas. mats/skip por lado ('px','nx','py','ny','pz','nz') como em barlib.Mesh.box."""
    a, b = Vector(mn), Vector(mx)
    lo = Vector((min(a.x, b.x), min(a.y, b.y), min(a.z, b.z)))
    hi = Vector((max(a.x, b.x), max(a.y, b.y), max(a.z, b.z)))
    size = hi - lo
    r = min(r, min(size) * 0.45)
    if r <= 1e-5:
        return m.box(lo, hi, mat, mats=mats, skip=skip, M=M)
    bm2 = bmesh.new()
    bmesh.ops.create_cube(bm2, size=1.0)
    bmesh.ops.scale(bm2, vec=size, verts=bm2.verts)
    bmesh.ops.translate(bm2, vec=(lo + hi) / 2, verts=bm2.verts)
    bmesh.ops.bevel(bm2, geom=list(bm2.edges), offset=r, segments=seg, affect='EDGES', profile=0.5, clamp_overlap=True)
    bm2.normal_update()
    M = M if M is not None else Matrix.Identity(4)
    for f in bm2.faces:
        side = _lado(f.normal)
        if side in skip and f.normal.dot(dict(SIDE_OF)[side]) > 0.999:
            continue
        m.face([M @ v.co for v in f.verts], (mats or {}).get(side, mat))
    bm2.free()


def torno(m, perfil, mat, segs=16, M=None, smooth=True, tampa_base=False, tampa_topo=False, a0=0.0, mats=None, mat_tampa=None):
    """Solido de revolucao em torno de Z. perfil: [(r, z)] de baixo para cima; (r, z, 'q') cria quina viva ali.
    mats: lista opcional com o material de cada trecho (len(perfil)-1)."""
    M = M if M is not None else Matrix.Identity(4)
    bm, uvl = m.bm, m.uv
    tile = bpy.data.materials[mat].get("tile_v", 1.0) if bpy.data.materials.get(mat) else 1.0
    rmax = max(p[0] for p in perfil)
    rep = max(1, round(2 * math.pi * rmax / tile))

    def anel(r, z):
        return [bm.verts.new(M @ Vector((r * math.cos(a0 + 2 * math.pi * k / segs), r * math.sin(a0 + 2 * math.pi * k / segs), z)))
                for k in range(segs)]
    v_acc = 0.0
    prev = anel(perfil[0][0], perfil[0][1])
    primeiro = prev
    for i in range(1, len(perfil)):
        r0, z0 = perfil[i - 1][0], perfil[i - 1][1]
        r1, z1 = perfil[i][0], perfil[i][1]
        cur = anel(r1, z1)
        dv = math.hypot(r1 - r0, z1 - z0) / tile
        mi = m._mi(mats[i - 1] if mats else mat)
        for k in range(segs):
            j = (k + 1) % segs
            f = bm.faces.new((prev[k], prev[j], cur[j], cur[k]))
            f.material_index = mi
            f.smooth = smooth
            u0, u1 = k / segs * rep, (k + 1) / segs * rep
            for l, uv in zip(f.loops, ((u0, v_acc), (u1, v_acc), (u1, v_acc + dv), (u0, v_acc + dv))):
                l[uvl].uv = uv
            f[m.fl] = 1
        v_acc += dv
        if len(perfil[i]) > 2:                               # quina viva: o proximo trecho comeca num anel novo
            cur = anel(r1, z1)
        prev = cur
    for (ring, cima, r) in ((primeiro, False, perfil[0][0]), (prev, True, perfil[-1][0])):
        if (cima and tampa_topo or not cima and tampa_base) and r > 1e-5:
            vs = ring if cima else list(reversed(ring))
            f = bm.faces.new(vs)
            f.material_index = m._mi(mat_tampa or ((mats[-1] if cima else mats[0]) if mats else mat))
            f.smooth = False


def tubo(m, pts, r, mat, segs=8, smooth=True, tampas=False, M=None):
    """Tubo de raio r (ou lista de raios) ao longo da polilinha pts, aneis sem torcao."""
    M = M if M is not None else Matrix.Identity(4)
    pts = [M @ Vector(p) for p in pts]
    rs = r if isinstance(r, (list, tuple)) else [r] * len(pts)
    bm, uvl = m.bm, m.uv
    t0 = (pts[1] - pts[0]).normalized()
    ref = Vector((1, 0, 0)) if abs(t0.x) < 0.9 else Vector((0, 1, 0))
    nx = t0.cross(ref).normalized()
    aneis, v = [], 0.0
    for i, p in enumerate(pts):
        if i == 0:
            t = t0
        elif i == len(pts) - 1:
            t = (p - pts[i - 1]).normalized()
        else:
            t = ((p - pts[i - 1]).normalized() + (pts[i + 1] - p).normalized()).normalized()
        nx = (nx - t * nx.dot(t)).normalized()
        ny = t.cross(nx)
        if i:
            v += (p - pts[i - 1]).length
        aneis.append(([bm.verts.new(p + (nx * math.cos(2 * math.pi * k / segs) + ny * math.sin(2 * math.pi * k / segs)) * rs[i])
                       for k in range(segs)], v))
    mi = m._mi(mat)
    for i in range(len(aneis) - 1):
        (A, va), (Bn, vb) = aneis[i], aneis[i + 1]
        for k in range(segs):
            j = (k + 1) % segs
            f = bm.faces.new((A[k], A[j], Bn[j], Bn[k]))
            f.material_index = mi
            f.smooth = smooth
            for l, uv in zip(f.loops, ((k / segs, va), ((k + 1) / segs, va), ((k + 1) / segs, vb), (k / segs, vb))):
                l[uvl].uv = uv
            f[m.fl] = 1
    if tampas:
        for ring, rev in ((aneis[0][0], True), (aneis[-1][0], False)):
            f = bm.faces.new(list(reversed(ring)) if rev else ring)
            f.material_index = mi


def esfera(m, mat, M, u=12, v=8):
    """Esfera UV lisa (bolas, puxadores). M posiciona e escala a esfera de raio 1."""
    res = bmesh.ops.create_uvsphere(m.bm, u_segments=u, v_segments=v, radius=1.0, matrix=M, calc_uvs=False)
    mi = m._mi(mat)
    for f in {f for vv in res['verts'] for f in vv.link_faces}:
        f.material_index = mi
        f.smooth = True


def ripas(m, p0, p1, n, larg, esp, mat, eixo='x', r=0.004):
    """n ripas paralelas cobrindo o retangulo p0..p1 (no plano XY, espessura esp em Z a partir de p0.z)."""
    x0, y0, z0 = p0
    x1, y1, _ = p1
    if eixo == 'x':
        passo = (y1 - y0 - larg) / max(1, n - 1)
        for k in range(n):
            caixa(m, (x0, y0 + k * passo, z0), (x1, y0 + k * passo + larg, z0 + esp), mat, r=r)
    else:
        passo = (x1 - x0 - larg) / max(1, n - 1)
        for k in range(n):
            caixa(m, (x0 + k * passo, y0, z0), (x0 + k * passo + larg, y1, z0 + esp), mat, r=r)


def substituir(nome, m):
    """Gera a malha do Mesh m e copia para o datablock existente `nome` (todas as instancias trocam juntas)."""
    m._auto_uv()
    m.bm.faces.layers.int.remove(m.fl)
    me = bpy.data.meshes.get(nome)
    if me is None:
        me = bpy.data.meshes.new(nome)
    else:
        me.clear_geometry()
        me.materials.clear()
    m.bm.to_mesh(me)
    m.bm.free()
    for mn in m.mats:
        me.materials.append(bpy.data.materials[mn])
    if hasattr(me, "use_auto_smooth"):
        me.use_auto_smooth = True
        me.auto_smooth_angle = math.radians(40)
    me.update()
    return me


def tris(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)
