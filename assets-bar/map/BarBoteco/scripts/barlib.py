"""barlib - utilitarios para construir o Bar da Esquina no Blender.

Geometria low-poly montada via bmesh, UV automatica em escala real (box projection
em metros, usando o tamanho de tile gravado em cada material), materiais simples
compativeis com glTF e colisores em caixas para o jogo.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

ROOT = r"C:\Users\rafael\BarBoteco"
TEX_DIR = os.path.join(ROOT, "texturas")
EXPORT_DIR = os.path.join(ROOT, "export")

# ---------------- cotas gerais (metros, Z para cima) ----------------
Z_CALCADA = 0.15          # topo da calcada (rua em z=0)
Z_PISO = 0.30             # piso do terreo e da varanda
Z_TETO1 = 3.20            # fundo da laje do terreo
Z_PISO2 = 3.45            # piso do pavimento superior
Z_TETO2 = 6.15            # fundo da laje de cobertura
Z_LAJE2 = 6.35            # topo da laje de cobertura
Z_PLAT = 6.80             # topo da platibanda
BX0, BX1, BY0, BY1 = 3.5, 24.0, 3.5, 15.0   # predio principal (terreo e superior)
LOTE_X, LOTE_Y = 32.0, 26.0                 # o bar ocupa o quarteirao inteiro (lote 0..32 x 0..26)
TE, TI = 0.20, 0.15                         # espessura parede externa / interna
ROOF_HI, SLOPE, EAVE = 3.80, 0.25, -0.6     # telhado da varanda
FORRO = 2.75                                # forro de madeira da varanda
MAP_X0, MAP_X1, MAP_Y0, MAP_Y1 = -26.0, 58.0, -26.0, 52.0   # (03_rua redefine com a grade de quadras)
PORTA_W, PORTA_H = 1.10, 2.30               # vao de porta simples (folha = vao - 0.10)
PORTA_DUPLA_W = 1.90                        # vao de porta dupla (corredor do quintal)
# grade do bairro: quadras de 38 x 32 m (com calcada) separadas por ruas de 8 m
QUADRA_W, QUADRA_H, RUA_W = 38.0, 32.0, 8.0
GRADE = range(-2, 3)                        # 5 x 5 quadras jogaveis; anel externo (+-3) so decorativo


def quadra(i, j):
    """Retangulo externo (com calcada) da quadra (i, j). A quadra (0,0) e a do bar."""
    x0 = -3.0 + i * (QUADRA_W + RUA_W)
    y0 = -3.0 + j * (QUADRA_H + RUA_W)
    return x0, x0 + QUADRA_W, y0, y0 + QUADRA_H


def roof_z(d):
    """Altura do telhado da varanda a uma distancia d (m) da parede do pav. superior."""
    return ROOF_HI - d * SLOPE


# ---------------- colecoes ----------------
def coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
    if parent is None:
        parent = bpy.context.scene.collection if name == "Bar_Boteco" else coll("Bar_Boteco")
    elif isinstance(parent, str):
        parent = coll(parent)
    if c.name not in parent.children.keys():
        parent.children.link(c)
    return c


def clear(*names):
    """Remove os objetos de colecoes criadas por estes scripts (para poder re-executar)."""
    for n in names:
        c = bpy.data.collections.get(n)
        if not c:
            continue
        for o in list(c.objects):
            data = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if data is not None and data.users == 0 and not data.name.startswith(("P_", "A_")):
                if isinstance(data, bpy.types.Mesh):
                    bpy.data.meshes.remove(data)
                elif isinstance(data, bpy.types.Light):
                    bpy.data.lights.remove(data)


def clear_colliders(prefix):
    c = bpy.data.collections.get("Colisores")
    if not c:
        return
    for o in list(c.objects):
        if o.name.startswith("COL_" + prefix):
            bpy.data.objects.remove(o, do_unlink=True)


# ---------------- materiais ----------------
def load_image(fname, non_color=False):
    path = os.path.join(TEX_DIR, fname)
    img = bpy.data.images.get(fname)
    if img is None or bpy.path.abspath(img.filepath) != path:
        img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = 'Non-Color' if non_color else 'sRGB'
    return img


def _mix_mul(nt, color_socket, factor):
    mix = nt.nodes.new("ShaderNodeMix")
    mix.location = (-250, 200)
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs[0].default_value = 1.0
    rgba = [s for s in mix.inputs if s.type == 'RGBA']
    nt.links.new(color_socket, rgba[0])
    rgba[1].default_value = (factor[0], factor[1], factor[2], 1.0)
    return [s for s in mix.outputs if s.type == 'RGBA'][0]


def set_blend(m):
    """Transparencia com mistura (Blender 4.0 usa blend_method; 4.2+ usa surface_render_method)."""
    if hasattr(m, "surface_render_method"):
        m.surface_render_method = 'BLENDED'
    else:
        m.blend_method = 'BLEND'
        m.shadow_method = 'NONE'


def material_unlit(name, tex=None, color=(1, 1, 1), tile=(1.0, 1.0)):
    """Material sem iluminacao (ceu/panorama): Emission pura -> KHR_materials_unlit no glTF."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (400, 0)
    em = nt.nodes.new("ShaderNodeEmission"); em.location = (150, 0)
    em.inputs["Strength"].default_value = 1.0
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    if tex:
        ti = nt.nodes.new("ShaderNodeTexImage"); ti.location = (-300, 0)
        ti.image = load_image(tex)
        ti.extension = 'EXTEND'
        nt.links.new(ti.outputs["Color"], em.inputs["Color"])
    else:
        em.inputs["Color"].default_value = (color[0], color[1], color[2], 1.0)
    m.use_backface_culling = False
    m["tile_u"], m["tile_v"] = float(tile[0]), float(tile[1])
    m.diffuse_color = (color[0], color[1], color[2], 1.0)
    return m


def material(name, color=(0.8, 0.8, 0.8), tex=None, tile=(1.0, 1.0), rough=0.8, metal=0.0,
             normal=None, nstr=1.0, emis=None, emis_tex=False, emis_str=1.0, alpha=None,
             double=False):
    """Principled BSDF simples. Com textura, `color` vira fator multiplicativo (baseColorFactor)."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (500, 0)
    bs = nt.nodes.new("ShaderNodeBsdfPrincipled"); bs.location = (200, 0)
    nt.links.new(bs.outputs[0], out.inputs["Surface"])
    bs.inputs["Roughness"].default_value = rough
    bs.inputs["Metallic"].default_value = metal
    if tex:
        ti = nt.nodes.new("ShaderNodeTexImage"); ti.location = (-650, 200)
        ti.image = load_image(tex)
        col = ti.outputs["Color"]
        if tuple(round(c, 4) for c in color[:3]) != (1.0, 1.0, 1.0):
            col = _mix_mul(nt, col, color)
        nt.links.new(col, bs.inputs["Base Color"])
        if emis_tex:
            nt.links.new(ti.outputs["Color"], bs.inputs["Emission Color"])
            bs.inputs["Emission Strength"].default_value = emis_str
    else:
        bs.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    if emis is not None:
        bs.inputs["Emission Color"].default_value = (emis[0], emis[1], emis[2], 1.0)
        bs.inputs["Emission Strength"].default_value = emis_str
    if normal:
        tn = nt.nodes.new("ShaderNodeTexImage"); tn.location = (-650, -250)
        tn.image = load_image(normal, non_color=True)
        nm = nt.nodes.new("ShaderNodeNormalMap"); nm.location = (-250, -250)
        nm.inputs["Strength"].default_value = nstr
        nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bs.inputs["Normal"])
    if alpha is not None:
        bs.inputs["Alpha"].default_value = alpha
        set_blend(m)
    m.use_backface_culling = not double
    m["tile_u"], m["tile_v"] = float(tile[0]), float(tile[1])
    m.diffuse_color = (color[0], color[1], color[2], 1.0 if alpha is None else alpha)
    return m


# ---------------- atlas de placas (1024 px, origem no canto superior esquerdo) ----------------
ATLAS = 1024


def arect(x0, y0, x1, y1, inset=2):
    x0 += inset; y0 += inset; x1 -= inset; y1 -= inset
    return (x0 / ATLAS, 1 - y1 / ATLAS, x1 / ATLAS, 1 - y0 / ATLAS)


REG = {
    'placa': arect(0, 0, 1024, 256),
    'tv': arect(0, 256, 512, 512),
    'geladeira': arect(512, 256, 768, 768),
    'cardapio': arect(768, 256, 1024, 768),
    'wc_m': arect(0, 512, 256, 640),
    'wc_f': arect(256, 512, 512, 640),
    'cozinha': arect(0, 640, 256, 704),
    'escritorio': arect(256, 640, 512, 704),
    'deposito': arect(0, 704, 256, 768),
    'lavabo': arect(256, 704, 512, 768),
    'placa2': arect(0, 768, 1024, 1024),
}


# ---------------- geometria ----------------
def newell(pts):
    n = Vector((0, 0, 0))
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n.normalized() if n.length > 1e-12 else Vector((0, 0, 1))


def signed_area(poly):
    s = 0.0
    for i in range(len(poly)):
        x0, y0 = poly[i]; x1, y1 = poly[(i + 1) % len(poly)]
        s += x0 * y1 - x1 * y0
    return s / 2


def arc(cx, cy, r, a0, a1, segs):
    """Pontos de um arco (graus), inclusive extremos."""
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / segs)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / segs))) for i in range(segs + 1)]


def mat_rz(loc=(0, 0, 0), rz_deg=0.0, rx_deg=0.0, ry_deg=0.0, scale=None):
    M = Matrix.Translation(Vector(loc)) @ Matrix.Rotation(math.radians(rz_deg), 4, 'Z') \
        @ Matrix.Rotation(math.radians(ry_deg), 4, 'Y') @ Matrix.Rotation(math.radians(rx_deg), 4, 'X')
    if scale is not None:
        M = M @ Matrix.Diagonal((*scale, 1.0))
    return M


CORNERS = [(i & 1, (i >> 1) & 1, (i >> 2) & 1) for i in range(8)]
SIDES = {'nx': (0, 4, 6, 2), 'px': (1, 3, 7, 5), 'ny': (0, 1, 5, 4),
         'py': (2, 6, 7, 3), 'nz': (0, 2, 3, 1), 'pz': (4, 5, 7, 6)}
SIDE_UV = {'ny': ((0, 0), (1, 0), (1, 1), (0, 1)), 'px': ((0, 0), (1, 0), (1, 1), (0, 1)),
           'py': ((1, 0), (1, 1), (0, 1), (0, 0)), 'nx': ((1, 0), (1, 1), (0, 1), (0, 0)),
           'pz': ((0, 0), (1, 0), (1, 1), (0, 1)), 'nz': ((0, 1), (1, 1), (1, 0), (0, 0))}


class Mesh:
    """Acumula geometria num bmesh e gera um objeto com UV automatica em metros."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.fl = self.bm.faces.layers.int.new("uvfix")
        self.mats = []

    def _mi(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def face(self, pts, mat, uvs=None, smooth=False, facing=None, away=None):
        pts = [Vector(p) for p in pts]
        if facing is not None or away is not None:
            n = newell(pts)
            ref = Vector(facing) if facing is not None else (sum(pts, Vector()) / len(pts) - Vector(away))
            if n.dot(ref) < 0:
                pts.reverse()
                if uvs:
                    uvs = list(reversed(uvs))
        f = self.bm.faces.new([self.bm.verts.new(p) for p in pts])
        f.material_index = self._mi(mat)
        f.smooth = smooth
        if uvs:
            for l, uv in zip(f.loops, uvs):
                l[self.uv].uv = uv
            f[self.fl] = 1
        return f

    def box(self, mn, mx, mat, mats=None, skip=(), M=None, uvrects=None):
        a, b = Vector(mn), Vector(mx)
        mn = Vector((min(a.x, b.x), min(a.y, b.y), min(a.z, b.z)))      # limites em qualquer ordem (evita caixa ao avesso)
        mx = Vector((max(a.x, b.x), max(a.y, b.y), max(a.z, b.z)))
        pts = []
        for c in CORNERS:
            p = Vector((mx.x if c[0] else mn.x, mx.y if c[1] else mn.y, mx.z if c[2] else mn.z))
            pts.append(M @ p if M is not None else p)
        vs = [self.bm.verts.new(p) for p in pts]
        out = []
        for side, idx in SIDES.items():
            if side in skip:
                continue
            f = self.bm.faces.new([vs[i] for i in idx])
            f.material_index = self._mi((mats or {}).get(side, mat))
            if uvrects and side in uvrects:
                u0, v0, u1, v1 = uvrects[side]
                for l, (a, b) in zip(f.loops, SIDE_UV[side]):
                    l[self.uv].uv = (u0 + (u1 - u0) * a, v0 + (v1 - v0) * b)
                f[self.fl] = 1
            out.append(f)
        unused = [v for v in vs if not v.link_faces]
        for v in unused:
            self.bm.verts.remove(v)
        return out

    def cyl(self, r, h, mat, segs=8, r2=None, M=None, caps=(True, True), smooth=True,
            cap_mat=None, a0=None):
        r2 = r if r2 is None else r2
        a0 = math.pi / segs if a0 is None else a0
        M = M if M is not None else Matrix.Identity(4)
        bot, top = [], []
        for i in range(segs):
            a = a0 + 2 * math.pi * i / segs
            ca, sa = math.cos(a), math.sin(a)
            bot.append(M @ Vector((r * ca, r * sa, 0)))
            top.append(M @ Vector((r2 * ca, r2 * sa, h)))
        vb = [self.bm.verts.new(p) for p in bot]
        mi = self._mi(mat)
        if r2 < 1e-6:
            apex = self.bm.verts.new(M @ Vector((0, 0, h)))
            for i in range(segs):
                f = self.bm.faces.new((vb[i], vb[(i + 1) % segs], apex))
                f.material_index = mi; f.smooth = smooth
        else:
            vt = [self.bm.verts.new(p) for p in top]
            for i in range(segs):
                j = (i + 1) % segs
                f = self.bm.faces.new((vb[i], vb[j], vt[j], vt[i]))
                f.material_index = mi; f.smooth = smooth
        cm = self._mi(cap_mat or mat)
        if caps[0]:
            f = self.bm.faces.new([self.bm.verts.new(p) for p in reversed(bot)]); f.material_index = cm
        if caps[1] and r2 > 1e-6:
            f = self.bm.faces.new([self.bm.verts.new(p) for p in top]); f.material_index = cm

    def tube(self, p0, p1, r, mat, segs=6, caps=(False, False), smooth=True):
        """Cilindro entre dois pontos (fios, tubos, galhos)."""
        p0 = Vector(p0); p1 = Vector(p1)
        d = p1 - p0
        L = d.length
        if L < 1e-6:
            return
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        M = Matrix.Translation(p0) @ q.to_matrix().to_4x4()
        self.cyl(r, L, mat, segs=segs, M=M, caps=caps, smooth=smooth)

    def sphere(self, mat, M, subdiv=1, smooth=True, jitter=0.0, rng=None):
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=subdiv, radius=1.0, matrix=M, calc_uvs=False)
        verts = res['verts']
        if jitter and rng is not None:
            ctr = sum((v.co for v in verts), Vector()) / len(verts)
            for v in verts:
                v.co += (v.co - ctr).normalized() * (rng.random() - 0.5) * 2 * jitter
        mi = self._mi(mat)
        for f in {f for v in verts for f in v.link_faces}:
            f.material_index = mi; f.smooth = smooth

    def prism(self, poly, z0, z1, mat, top_mat=None, side_mat=None, bottom=False, sides=True):
        poly = list(poly)
        if signed_area(poly) < 0:
            poly.reverse()
        self.face([(x, y, z1) for x, y in poly], top_mat or mat)
        if bottom:
            self.face([(x, y, z0) for x, y in reversed(poly)], mat)
        if sides:
            n = len(poly)
            for i in range(n):
                (xa, ya), (xb, yb) = poly[i], poly[(i + 1) % n]
                self.face([(xa, ya, z0), (xb, yb, z0), (xb, yb, z1), (xa, ya, z1)], side_mat or mat)

    def roof_face(self, pts, mat, eave_dir):
        """Face inclinada de telhado com UV alinhada: u ao longo do beiral, v subindo a agua."""
        pts = [Vector(p) for p in pts]
        n = newell(pts)
        if n.z < 0:
            pts.reverse(); n = -n
        e = Vector(eave_dir).normalized()
        s = n.cross(e)
        if s.z < 0:
            e = -e; s = -s
        m = bpy.data.materials[mat]
        tu, tv = m.get("tile_u", 1.0), m.get("tile_v", 1.0)
        return self.face(pts, mat, uvs=[(p.dot(e) / tu, p.dot(s) / tv) for p in pts])

    def wall(self, p0, p1, z0, z1, t, mat_a, mat_b, mat_e=None, openings=(), cut_ends=True,
             skip_top=False, collide=True, name="Parede"):
        """Parede de p0 a p1 (2D). Espessura t para a esquerda do sentido p0->p1.
        mat_a: face na linha p0-p1; mat_b: face oposta; mat_e: topo/vaos.
        openings: (s0, s1, z_baixo, z_topo) com s medido a partir de p0."""
        a = Vector((p0[0], p0[1], 0)); b = Vector((p1[0], p1[1], 0))
        d = b - a; L = d.length; d.normalize()
        n = Vector((-d.y, d.x, 0))
        M = Matrix(((d.x, n.x, 0, a.x), (d.y, n.y, 0, a.y), (0, 0, 1, 0), (0, 0, 0, 1)))
        mat_e = mat_e or mat_b
        cut0, cut1 = (cut_ends, cut_ends) if isinstance(cut_ends, bool) else cut_ends
        pieces = []
        s = 0.0
        for (s0, s1, zb, zt) in sorted(openings):
            if s0 > s + 1e-6:
                pieces.append((s, s0, z0, z1))
            if zb > z0 + 1e-6:
                pieces.append((s0, s1, z0, zb))
            if zt < z1 - 1e-6:
                pieces.append((s0, s1, zt, z1))
            s = s1
        if s < L - 1e-6:
            pieces.append((s, L, z0, z1))
        for (sa, sb, za, zb) in pieces:
            skip = ['nz'] if za <= z0 + 1e-6 else []
            if cut0 and sa <= 1e-6:
                skip.append('nx')
            if cut1 and sb >= L - 1e-6:
                skip.append('px')
            if skip_top and zb >= z1 - 1e-6:
                skip.append('pz')
            self.box((sa, 0, za), (sb, t, zb), mat_e, mats={'ny': mat_a, 'py': mat_b}, skip=skip, M=M)
            if collide:
                add_collider(name, (sa, 0, za), (sb, t, zb), M)
        return M

    # --------- finalizacao ---------
    def _auto_uv(self):
        bm = self.bm
        bm.normal_update()
        tiles = []
        for mn in self.mats:
            m = bpy.data.materials.get(mn)
            tiles.append((m.get("tile_u", 1.0), m.get("tile_v", 1.0)) if m else (1.0, 1.0))
        for f in bm.faces:
            if f[self.fl]:
                continue
            tu, tv = tiles[f.material_index]
            n = f.normal
            ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
            for l in f.loops:
                p = l.vert.co
                if az >= ax and az >= ay:
                    u, v = p.x, (p.y if n.z >= 0 else -p.y)
                elif ax >= ay:
                    u, v = (p.y if n.x >= 0 else -p.y), p.z
                else:
                    u, v = (-p.x if n.y >= 0 else p.x), p.z
                l[self.uv].uv = (u / tu, v / tv)

    def mesh(self):
        self._auto_uv()
        self.bm.faces.layers.int.remove(self.fl)
        old = bpy.data.meshes.get(self.name)
        if old is not None and old.users == 0:
            bpy.data.meshes.remove(old)
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for mn in self.mats:
            me.materials.append(bpy.data.materials[mn])
        return me

    def build(self, collection, location=(0, 0, 0)):
        me = self.mesh()
        ob = bpy.data.objects.new(self.name, me)
        ob.location = location
        (coll(collection) if isinstance(collection, str) else collection).objects.link(ob)
        return ob


# ---------------- instancias / prototipos ----------------
def proto(name):
    return bpy.data.meshes[name]


def inst(mesh, name, collection, loc, rot=0.0, scale=None):
    me = proto(mesh) if isinstance(mesh, str) else mesh
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = (0, 0, math.radians(rot))
    if scale is not None:
        o.scale = scale if hasattr(scale, '__len__') else (scale, scale, scale)
    (coll(collection) if isinstance(collection, str) else collection).objects.link(o)
    return o


# ---------------- colisores (caixas) ----------------
def add_collider(name, mn, mx, M=None):
    c = coll("Colisores")
    me = bpy.data.meshes.get("COL_cubo")
    if me is None:
        me = bpy.data.meshes.new("COL_cubo")
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
    mn = Vector(mn); mx = Vector(mx)
    ctr = (mn + mx) / 2
    size = Vector((max(mx.x - mn.x, 0.01), max(mx.y - mn.y, 0.01), max(mx.z - mn.z, 0.01)))
    o = bpy.data.objects.new("COL_" + name, me)
    M = M if M is not None else Matrix.Identity(4)
    o.matrix_world = M @ Matrix.Translation(ctr) @ Matrix.Diagonal((size.x, size.y, size.z, 1.0))
    o.display_type = 'WIRE'
    o.hide_render = True
    c.objects.link(o)
    return o


def collider_obj(name, ob, pad=0.0):
    """Colisor a partir da caixa local de um objeto (respeita rotacao/escala)."""
    bb = [Vector(c) for c in ob.bound_box]
    mn = Vector((min(v.x for v in bb) - pad, min(v.y for v in bb) - pad, min(v.z for v in bb)))
    mx = Vector((max(v.x for v in bb) + pad, max(v.y for v in bb) + pad, max(v.z for v in bb)))
    ob_m = ob.matrix_basis if ob.parent is None else ob.matrix_world
    return add_collider(name, mn, mx, ob_m.copy())


# ---------------- texto -> malha (marcacoes de rua) ----------------
def text_mesh(name, body, size=1.0, align='CENTER', res=2):
    cu = bpy.data.curves.new(name + "_crv", 'FONT')
    cu.body = body
    cu.size = size
    cu.align_x = align
    cu.align_y = 'CENTER'
    cu.resolution_u = res
    ob = bpy.data.objects.new(name + "_tmp", cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    me.name = name
    return me
