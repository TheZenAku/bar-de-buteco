# 97_ribeiro_placeholders.py - Blender (cena "PROPS FA_ARMAS"): 6 props low-poly da RIBEIRO Usinagem e Ferramentaria (placeholders do machine-shop).
# Rodar no Blender aberto (exec) DEPOIS de 97a_atlas_ribeiro.py (python do sistema). Idempotente: apaga e refaz a colecao RB_PROPS_RIBEIRO.
#   exec(open(r"C:\Users\rafael\BarBoteco\scripts\97_ribeiro_placeholders.py", encoding="utf-8").read())   # constroi
#   RB_EXPORTAR()                                                                                           # 6 GLBs em SAIDA + relatorio
# Convencoes: metros, +Z para cima, frente do objeto em -Y (o glTF vira +Z), origem do no raiz no centro do piso da bandeja/gabarito.
# Todo o desenho e ficticio e NAO funcional: sem municao, sem carregador, sem mecanismo interno, cano e bocal tampados por plugue verde.
# Atlas unico 512 (cor + normal + metal/rugosidade) vindo da Poliigon (97a). Animacoes Idle/Operate por trilhas NLA (merge por nome no glTF).
import bpy, bmesh, math, json, os, struct, io, contextlib
from mathutils import Vector, Matrix, Euler

CENA = "PROPS FA_ARMAS"
COLECAO = "RB_PROPS_RIBEIRO"
ATLAS_DIR = r"C:\Users\rafael\Desktop\BAR\2.0\map\texturas_512\ribeiro"
SAIDA = os.environ.get("RB_SAIDA", r"C:\Users\rafael\BarBoteco\export\farm_armas\placeholders")
FPS = 24
MARG = 2  # px de margem dentro de cada ladrilho do atlas

with open(os.path.join(ATLAS_DIR, "ribeiro_atlas.json"), encoding="utf-8") as _fh:
    _ATL = json.load(_fh)
TILES, NPX = _ATL["tiles"], _ATL["size"]


def uvpx(tile, px, py):
    x, y, w, h = TILES[tile]
    return ((x + px) / NPX, 1.0 - (y + py) / NPX)


def eixo_matriz(eixo):
    """matriz que leva o eixo Z local para o eixo pedido"""
    if eixo == "x":
        return Matrix.Rotation(math.radians(90), 4, "Y")
    if eixo == "y":
        return Matrix.Rotation(math.radians(-90), 4, "X")
    return Matrix()


class Solido:
    def __init__(s, M, tipo, ext):
        s.Minv, s.tipo, s.ext = M.inverted(), tipo, ext

    def contem(s, p):
        q = s.Minv @ p
        if s.tipo == "caixa":
            return all(abs(q[i]) < s.ext[i] / 2 for i in range(3))
        r1, r2, h = s.ext
        if abs(q.z) >= h / 2:
            return False
        r = r1 + (r2 - r1) * (q.z / h + 0.5)
        return math.hypot(q.x, q.y) < r


class Malha:
    """Um objeto = um bmesh. Coordenadas no referencial da RAIZ (piso da bandeja no z=0). Tudo vira geometria cozida (sem escala/rotacao no objeto)."""

    def __init__(s, nome):
        s.nome, s.bm, s.solidos = nome, bmesh.new(), []
        s.uv = s.bm.loops.layers.uv.new("UVMap")
        s.lay = s.bm.faces.layers.int.new("sol")

    # ---------------------------------------------------------------- primitivas
    def _novas(s, antes):
        return [f for f in s.bm.faces if f not in antes]

    def _mt(s, c, rot, M):
        Mt = Matrix.Translation(c) @ Euler(tuple(math.radians(a) for a in rot), "XYZ").to_matrix().to_4x4()
        return (M @ Mt) if M is not None else Mt

    def caixa(s, c, sz, tile="aco", rot=(0, 0, 0), bev=None, M=None, etq=None):
        # chanfro de 1 segmento em toda caixa >= 5 mm (aresta viva demais denuncia placeholder); bev=0 desliga, bev=x forca
        if bev is None:
            bev = 0.0 if (etq or min(sz) < 0.005) else min(0.0015, 0.3 * min(sz))
        Mt = s._mt(c, rot, M)
        antes = set(s.bm.faces)
        bmesh.ops.create_cube(s.bm, size=1.0, matrix=Mt @ Matrix.Diagonal((sz[0], sz[1], sz[2], 1.0)))
        novas = s._novas(antes)
        if bev > 0:
            ed = list({e for f in novas for e in f.edges})
            bmesh.ops.bevel(s.bm, geom=ed, offset=bev, offset_type="OFFSET", segments=1, affect="EDGES")
            novas = s._novas(antes)
        sid = len(s.solidos)
        s.solidos.append(Solido(Mt, "caixa", sz))
        s._uv_caixa(novas, Mt, sz, tile, etq)
        for f in novas:
            f[s.lay] = sid
        return novas

    def cb(s, x, y, z0, sx, sy, sz, tile="aco", **kw):
        """caixa com a face de baixo em z0"""
        return s.caixa((x, y, z0 + sz / 2), (sx, sy, sz), tile, **kw)

    def etiqueta(s, c, w, h, tile, M=None, rot=(0, 0, 0), esp=0.0012):
        """chapinha fina com a etiqueta do atlas na face -Y (u para +X, v para +Z)"""
        return s.caixa(c, (w, esp, h), "preto", rot=rot, M=M, etq=tile)

    def _uv_caixa(s, faces, Mt, sz, tile, etq):
        Minv = Mt.inverted()
        R = Minv.to_3x3()
        tx, ty, tw, th = TILES[tile if not etq else "preto"]
        lado = min(tw, th) - 2 * MARG
        dens = lado / max(sz)
        for f in faces:
            n = R @ f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            if etq and ax == 1 and n[1] < 0:
                ex, ey, ew, eh = TILES[etq]
                for l in f.loops:
                    q = Minv @ l.vert.co
                    u = min(max(q.x / sz[0] + 0.5, 0.0), 1.0)
                    v = min(max(0.5 - q.z / sz[2], 0.0), 1.0)
                    l[s.uv].uv = uvpx(etq, MARG + u * (ew - 2 * MARG), MARG + v * (eh - 2 * MARG))
                continue
            if etq:
                for l in f.loops:
                    l[s.uv].uv = uvpx("preto", tw / 2, th / 2)
                continue
            a, b = {0: (1, 2), 1: (0, 2), 2: (0, 1)}[ax]
            for l in f.loops:
                q = Minv @ l.vert.co
                l[s.uv].uv = uvpx(tile, MARG + (q[a] + sz[a] / 2) * dens, MARG + (sz[b] / 2 - q[b]) * dens)

    def cil(s, c, r, h, tile="aco", eixo="z", seg=16, r2=None, rot=(0, 0, 0), M=None, caps=True):
        r2 = r if r2 is None else r2
        Mt = s._mt(c, rot, M) @ eixo_matriz(eixo)
        antes = set(s.bm.faces)
        bmesh.ops.create_cone(s.bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r, radius2=r2, depth=h, matrix=Mt, calc_uvs=False)
        novas = s._novas(antes)
        sid = len(s.solidos)
        s.solidos.append(Solido(Mt, "cil", (r, r2, h)))
        Minv = Mt.inverted()
        R = max(r, r2)
        tx, ty, tw, th = TILES[tile]
        lado = min(tw, th) - 2 * MARG
        dens = lado / max(R * (2 * math.pi + 2 * math.pi / seg), h, 2 * R)
        for f in novas:
            f[s.lay] = sid
            qs = [Minv @ l.vert.co for l in f.loops]
            cap = len({round(q.z, 6) for q in qs}) == 1
            if cap:
                for l, q in zip(f.loops, qs):
                    l[s.uv].uv = uvpx(tile, MARG + (q.x + R) * dens, MARG + (R - q.y) * dens)
                f.smooth = False
            else:
                f.smooth = True
                ctr = sum((q for q in qs), Vector()) / len(qs)
                pc = math.atan2(ctr.y, ctr.x)
                for l, q in zip(f.loops, qs):
                    d = (math.atan2(q.y, q.x) - pc + math.pi) % (2 * math.pi) - math.pi
                    u = (pc + math.pi + d) + math.pi / seg
                    l[s.uv].uv = uvpx(tile, MARG + u * R * dens, MARG + (h / 2 - q.z) * dens)
        for f in novas:  # aresta entre tampa e lateral fica viva
            for e in f.edges:
                if any(not g.smooth for g in e.link_faces) and any(g.smooth for g in e.link_faces):
                    e.smooth = False
        return novas

    def helice(s, c, R, r, voltas, passo, tile="aco", eixo="x", lados=5, passos=14, M=None):
        """mola helicoidal (eixo local Z -> eixo pedido), secao poligonal fechada nas pontas"""
        Mt = s._mt(c, (0, 0, 0), M) @ eixo_matriz(eixo)
        n, L = int(voltas * passos), voltas * passo
        antes = set(s.bm.faces)
        aneis, info = [], {}
        for k in range(n + 1):
            t = k / n
            ang = 2 * math.pi * voltas * t
            P = Vector((R * math.cos(ang), R * math.sin(ang), -L / 2 + L * t))
            er = Vector((math.cos(ang), math.sin(ang), 0))
            ez = Vector((0, 0, 1))
            anel = []
            for a in range(lados):
                al = 2 * math.pi * a / lados
                v = s.bm.verts.new(Mt @ (P + r * (math.cos(al) * er + math.sin(al) * ez)))
                info[v] = (k, a)
                anel.append(v)
            aneis.append(anel)
        fs = []
        for k in range(n):
            for a in range(lados):
                a2 = (a + 1) % lados
                f = s.bm.faces.new((aneis[k][a], aneis[k][a2], aneis[k + 1][a2], aneis[k + 1][a]))
                fs.append((f, k, a))
        c0 = s.bm.faces.new(aneis[0])
        c1 = s.bm.faces.new(list(reversed(aneis[-1])))
        novas = s._novas(antes)
        bmesh.ops.recalc_face_normals(s.bm, faces=novas)
        tx, ty, tw, th = TILES[tile]
        lado = min(tw, th) - 2 * MARG
        for f, k, a in fs:
            f.smooth = True
            f[s.lay] = -1
            for l in f.loops:
                kk, aa = info[l.vert]
                if a == lados - 1 and aa == 0:
                    aa = lados
                l[s.uv].uv = uvpx(tile, MARG + kk / n * lado, MARG + aa / lados * lado)
        for f in (c0, c1):
            f[s.lay] = -1
            f.smooth = False
            for l in f.loops:
                l[s.uv].uv = uvpx(tile, tw / 2, th / 2)
        return novas

    def furar(s, c, sz, furos, tile="aco", bev=0.0022):
        """placa retangular com furos passantes (boolean exato avaliado no depsgraph) + chanfro de 1 segmento; UV plana por normal"""
        tmp = Malha("tmp_placa")
        tmp.caixa(c, sz, tile)
        me = bpy.data.meshes.new("tmp_placa")
        tmp.bm.to_mesh(me)
        tmp.bm.free()
        ob = bpy.data.objects.new("tmp_placa", me)
        cutter = Malha("tmp_furos")
        for (fx, fy, fr) in furos:
            cutter.cil((fx, fy, c[2]), fr, sz[2] + 0.04, "aco", seg=20)
        mc = bpy.data.meshes.new("tmp_furos")
        cutter.bm.to_mesh(mc)
        cutter.bm.free()
        oc = bpy.data.objects.new("tmp_furos", mc)
        col = bpy.context.scene.collection
        col.objects.link(ob)
        col.objects.link(oc)
        bo = ob.modifiers.new("furos", "BOOLEAN")
        bo.operation, bo.operand_type, bo.object, bo.solver = "DIFFERENCE", "OBJECT", oc, "EXACT"
        bv = ob.modifiers.new("chanfro", "BEVEL")
        bv.width, bv.segments, bv.limit_method, bv.angle_limit = bev, 1, "ANGLE", math.radians(40)
        bpy.context.view_layer.update()
        ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me2 = bpy.data.meshes.new_from_object(ev)
        antes = set(s.bm.faces)
        t2 = bmesh.new()
        t2.from_mesh(me2)
        t2.verts.ensure_lookup_table()
        mp = {}
        for v in t2.verts:
            mp[v] = s.bm.verts.new(v.co)
        for f in t2.faces:
            nf = s.bm.faces.new([mp[v] for v in f.verts])
            nf.smooth = abs(f.normal.z) < 0.05 and abs(f.normal.x) + abs(f.normal.y) > 0.99 and False
        t2.free()
        for o_ in (ob, oc):
            col.objects.unlink(o_)
            bpy.data.objects.remove(o_)
        for m_ in (me, mc, me2):
            bpy.data.meshes.remove(m_)
        novas = s._novas(antes)
        sid = len(s.solidos)
        s.solidos.append(Solido(Matrix.Translation(c), "caixa", sz))
        mx = max(sz)
        tx, ty, tw, th = TILES[tile]
        dens = (min(tw, th) - 2 * MARG) / mx
        for f in novas:
            f[s.lay] = sid
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            a, b = {0: (1, 2), 1: (0, 2), 2: (0, 1)}[ax]
            for l in f.loops:
                q = l.vert.co - Vector(c)
                l[s.uv].uv = uvpx(tile, MARG + (q[a] + sz[a] / 2) * dens, MARG + (sz[b] / 2 - q[b]) * dens)
        return novas

    # ---------------------------------------------------------------- limpeza e objeto
    def limpar(s):
        """remove faces totalmente cobertas por OUTRO solido do mesmo objeto (centro + cantos recuados, deslocados 1 mm para fora)"""
        morrer = []
        for f in s.bm.faces:
            sid = f[s.lay]
            ctr = f.calc_center_median()
            n = f.normal
            pts = [ctr] + [ctr + (v.co - ctr) * 0.9 for v in f.verts]
            coberto = True
            for p in pts:
                q = p + n * 0.001
                if not any(sol.contem(q) for i, sol in enumerate(s.solidos) if i != sid):
                    coberto = False
                    break
            if coberto:
                morrer.append(f)
        if morrer:
            bmesh.ops.delete(s.bm, geom=morrer, context="FACES")
        solto = [v for v in s.bm.verts if not v.link_faces]
        if solto:
            bmesh.ops.delete(s.bm, geom=solto, context="VERTS")
        return len(morrer)

    def objeto(s, nome, pai, origem=(0, 0, 0), col=None):
        s.limpar()
        bmesh.ops.triangulate(s.bm, faces=list(s.bm.faces), quad_method="BEAUTY", ngon_method="BEAUTY")   # o exportador so calcula tangentes em triangulos
        o = Vector(origem)
        bmesh.ops.translate(s.bm, verts=list(s.bm.verts), vec=-o)
        me = bpy.data.meshes.new(nome)
        s.bm.to_mesh(me)
        s.bm.free()
        ob = bpy.data.objects.new(nome, me)
        (col or bpy.context.scene.collection).objects.link(ob)
        pai_o = Vector(pai["rb_o"]) if pai is not None and "rb_o" in pai.keys() else Vector()
        ob.parent = pai
        ob.location = o - pai_o
        ob["rb_o"] = tuple(o)
        me.materials.append(MAT)
        return ob


# ===================================================================== material (atlas unico)
def material():
    m = bpy.data.materials.get("RB_Atlas") or bpy.data.materials.new("RB_Atlas")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (500, 0)
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.location = (200, 0)
    nt.links.new(b.outputs[0], out.inputs[0])

    def img(arq, srgb):
        nome = arq
        im = bpy.data.images.get(nome)
        if im is None:
            im = bpy.data.images.load(os.path.join(ATLAS_DIR, arq))
            im.name = nome
        im.reload()
        im.colorspace_settings.name = "sRGB" if srgb else "Non-Color"
        return im

    tc = nt.nodes.new("ShaderNodeTexImage"); tc.image = img("ribeiro_atlas_cor.jpg", True); tc.location = (-700, 300)
    tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = img("ribeiro_atlas_n.jpg", False); tn.location = (-700, -100)
    tm = nt.nodes.new("ShaderNodeTexImage"); tm.image = img("ribeiro_atlas_mr.jpg", False); tm.location = (-700, -500)
    for t in (tc, tn, tm):
        t.interpolation = "Linear"
        t.extension = "EXTEND"
    nm = nt.nodes.new("ShaderNodeNormalMap"); nm.location = (-350, -100)
    sp = nt.nodes.new("ShaderNodeSeparateColor"); sp.location = (-350, -500)
    nt.links.new(tc.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    nt.links.new(tm.outputs["Color"], sp.inputs["Color"])
    nt.links.new(sp.outputs["Green"], b.inputs["Roughness"]); nt.links.new(sp.outputs["Blue"], b.inputs["Metallic"])
    m.use_backface_culling = False
    return m


# ===================================================================== animacao
def _fcurves(act):
    for lay in act.layers:
        for strip in lay.strips:
            for cb in strip.channelbags:
                for fc in cb.fcurves:
                    yield fc


def animar(ob, clip, fim, loc=None, rot=None, esc=None, linear=False):
    """loc: {frame: (dx,dy,dz)} deslocamento sobre o repouso; rot: {frame: (rx,ry,rz graus)} sobre o repouso; esc: {frame: fator}.
    Primeiro e ultimo quadro de cada canal tem que coincidir (laco sem salto). Vira uma trilha NLA com o nome do clipe."""
    ad = ob.animation_data_create()
    ad.action = None
    rl, rr, rs = ob.location.copy(), ob.rotation_euler.copy(), ob.scale.copy()
    for nome, d in (("loc", loc), ("rot", rot), ("esc", esc)):
        if d:
            ks = sorted(d)
            assert ks[0] == 0 and ks[-1] == fim, (ob.name, clip, nome, ks)
            a0, a1 = d[ks[0]], d[ks[-1]]
            ok = (a0 == a1) if nome == "esc" else all(abs(((x - y) + 180) % 360 - 180) < 1e-6 for x, y in zip(a0, a1)) if nome == "rot" else tuple(a0) == tuple(a1)
            assert ok, (ob.name, clip, nome, "nao fecha")
    for f in sorted(set(loc or {}) | set(rot or {}) | set(esc or {})):
        if loc and f in loc:
            ob.location = rl + Vector(loc[f]); ob.keyframe_insert("location", frame=f)
        if rot and f in rot:
            ob.rotation_euler = (rr[0] + math.radians(rot[f][0]), rr[1] + math.radians(rot[f][1]), rr[2] + math.radians(rot[f][2])); ob.keyframe_insert("rotation_euler", frame=f)
        if esc and f in esc:
            ob.scale = rs * esc[f]; ob.keyframe_insert("scale", frame=f)
    ob.location, ob.rotation_euler, ob.scale = rl, rr, rs
    act = ad.action
    act.name = f"{ob.name}__{clip}"
    for fc in _fcurves(act):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR" if linear else "BEZIER"
            if not linear:
                kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"
        fc.update()
    tr = ad.nla_tracks.new()
    tr.name = clip
    st = tr.strips.new(clip, 0, act)
    st.name = clip
    ad.action = None


# ===================================================================== pecas reutilizaveis
def bandeja(m, w, d, h, parede=0.02, base=0.02, tile="aco_escuro", bev=0.002):
    m.cb(0, 0, 0, w, d, base, tile, bev=bev)
    m.cb(0, -(d - parede) / 2, base, w, parede, h - base, tile)
    m.cb(0, (d - parede) / 2, base, w, parede, h - base, tile)
    m.cb(-(w - parede) / 2, 0, base, parede, d - 2 * parede, h - base, tile)
    m.cb((w - parede) / 2, 0, base, parede, d - 2 * parede, h - base, tile)


def parafuso_sext(m, x, y, z, r=0.007, h=0.004, tile="aco"):
    m.cil((x, y, z + h / 2), r, h, tile, seg=6)


def arma_ficticia(m, M, com_etiquetas=True):
    """Arma FICTICIA, maciça e nao funcional (sem boca de cano aberta, sem janela de ejecao, sem carregador): peso de vitrine.
    Referencial: +X frente (bocal tampado por plugue verde), +Z em cima, +Y lateral. M leva isso para a raiz."""
    m.caixa((0.005, 0, 0.062), (0.27, 0.032, 0.03), "aco", bev=0.002, M=M)             # corpo superior
    m.caixa((-0.01, 0, 0.032), (0.24, 0.028, 0.03), "polimero", bev=0.002, M=M)          # corpo inferior
    m.caixa((0.085, 0, 0.026), (0.07, 0.026, 0.018), "polimero", M=M)                    # protecao dianteira
    m.caixa((-0.09, 0, -0.012), (0.04, 0.03, 0.12), "polimero", rot=(0, 14, 0), bev=0.002, M=M)  # empunhadura
    m.caixa((-0.015, 0, 0.0065), (0.05, 0.024, 0.021), "polimero", M=M)                 # guarda maciça (so volume)
    m.cil((0.1575, 0, 0.062), 0.0085, 0.035, "aco", eixo="x", seg=14, M=M)              # cano macico
    m.cil((0.18, 0, 0.062), 0.0068, 0.01, "verde", eixo="x", seg=12, M=M)               # plugue de seguranca (bocal tampado)
    m.caixa((0.12, 0, 0.081), (0.01, 0.006, 0.008), "aco_escuro", M=M)
    m.caixa((-0.115, 0, 0.081), (0.014, 0.012, 0.008), "aco_escuro", M=M)
    m.caixa((-0.03, 0, 0.0792), (0.075, 0.012, 0.003), "verde", M=M)                     # bandeirola verde de seguranca
    for i in range(6):                                                                   # estrias do ferrolho (so relevo)
        for sy in (-1, 1):
            m.caixa((-0.118 + i * 0.0085, sy * 0.0166, 0.062), (0.0035, 0.0012, 0.024), "aco_escuro", bev=0, M=M)
    m.cil((0.141, 0, 0.062), 0.0108, 0.005, "aco_escuro", eixo="x", seg=14, M=M)         # colar do cano
    m.caixa((-0.1045, 0, -0.0742), (0.046, 0.034, 0.008), "aco_escuro", rot=(0, 14, 0), M=M)   # base da empunhadura
    m.caixa((-0.092, 0.0156, -0.015), (0.03, 0.0012, 0.07), "aco_escuro", rot=(0, 14, 0), bev=0, M=M)   # painel lateral
    for i in range(3):                                                                   # trilho da protecao dianteira
        m.caixa((0.06 + i * 0.015, 0, 0.0145), (0.004, 0.02, 0.006), "aco_escuro", M=M)
    for i in range(4):                                                                   # estrias da empunhadura
        m.caixa((-0.108 + i * 0.0035, 0.0157, -0.045 - i * 0.0), (0.0025, 0.0012, 0.03), "preto", rot=(0, 14, 0), bev=0, M=M)
    if com_etiquetas:
        m.etiqueta((0.0, -0.0166, 0.062), 0.07, 0.00875, "etq_ribeiro", M=M)
        m.etiqueta((-0.092, -0.0156, -0.015), 0.06, 0.0075, "etq_semmun", M=M, rot=(0, 14, 0))


# ===================================================================== ASSET 1 - PREPARACAO
def a_prep(root, col):
    fx = Malha("fixo")
    bandeja(fx, 0.70, 0.46, 0.05)
    fx.cb(-0.06, 0, 0.02, 0.012, 0.42, 0.025, "aco_escuro")
    fx.cb(-0.198, 0, 0.02, 0.264, 0.012, 0.025, "aco_escuro")
    fx.etiqueta((-0.17, -0.2306, 0.035), 0.16, 0.02, "etq_ribeiro")
    fx.etiqueta((0.22, -0.2306, 0.035), 0.03, 0.03, "badge_op")
    fx.cb(0.26, 0.22, 0.05, 0.04, 0.016, 0.012, "aco_escuro", bev=0.002)   # base do indicador
    RB_obj = fx.objeto("RB_Bandeja", root, col=col)
    mov = bpy.data.objects.new("RB_PREPARACAO_MOVEL", None); col.objects.link(mov); mov.parent = root; mov["rb_o"] = (0, 0, 0)
    pecas = []

    def tarugo(nome, x, r, tile, seg=24):
        m = Malha(nome); m.cil((x, 0, 0.02 + r), r, 0.38, tile, eixo="y", seg=seg)
        pecas.append(m.objeto(nome, mov, (x, 0, 0.02 + r), col))
    tarugo("RB_Tarugo_Aco_1", 0.02, 0.022, "aco")
    tarugo("RB_Tarugo_Aco_2", 0.07, 0.022, "aco")
    tarugo("RB_Tarugo_Aluminio", 0.125, 0.025, "aluminio")
    for nome, c, sz, tile, rot in (("RB_Chapa_Aco", (0.235, 0.09, 0.026), (0.20, 0.14, 0.012), "aco", (0, 0, 4)), ("RB_Chapa_Pequena", (0.235, -0.10, 0.024), (0.12, 0.09, 0.008), "aluminio", (0, 0, -6))):
        m = Malha(nome); m.caixa(c, sz, tile, rot=rot, bev=0.0012)
        pecas.append(m.objeto(nome, mov, c, col))
    for i, y in enumerate((0.07, 0.15)):
        nome = f"RB_Mola_{i + 1}"; c = (-0.20, y, 0.02 + 0.016 + 0.0028)
        m = Malha(nome); m.helice(c, 0.016, 0.0028, 10, 0.02, "aco", "x", lados=5, passos=14)
        pecas.append(m.objeto(nome, mov, c, col))
    for i, x in enumerate((-0.285, -0.205, -0.125)):
        nome = f"RB_Bloco_Polimero_{i + 1}"; c = (x, -0.11, 0.04)
        m = Malha(nome); m.caixa(c, (0.075, 0.075, 0.04), "polimero", bev=0.003)
        pecas.append(m.objeto(nome, mov, c, col))
    m = Malha("lampada"); m.cil((0.26, 0.22, 0.069), 0.011, 0.014, "verde", seg=14)
    lamp = m.objeto("RB_Prep_Indicador", mov, (0.26, 0.22, 0.069), col)
    # Operate 36 quadros: as pecas sobem 8 mm em sequencia e assentam; indicador pulsa 2x
    for i, p in enumerate(pecas):
        d = (i % 5) * 2
        animar(p, "Operate", 36, loc={0: (0, 0, 0), 6 + d: (0, 0, 0.008), 20 + d: (0, 0, -0.0012), 28 + d: (0, 0, 0), 36: (0, 0, 0)})
    animar(lamp, "Operate", 36, esc={0: 1.0, 9: 1.35, 18: 1.0, 27: 1.35, 36: 1.0})
    animar(lamp, "Idle", 48, esc={0: 1.0, 24: 1.18, 48: 1.0})
    for i, p in enumerate(pecas[:4]):
        animar(p, "Idle", 48, loc={0: (0, 0, 0), 24: (0, 0, 0.0005), 48: (0, 0, 0)})
    return [RB_obj, mov]


# ===================================================================== ASSET 2 - CORTE
def a_corte(root, col):
    fx = Malha("fixo")
    fx.cb(0, 0, 0, 0.70, 0.46, 0.03, "aco_escuro", bev=0.002)
    for y in (-0.17, 0.17):
        fx.cb(0, y, 0.03, 0.62, 0.02, 0.042, "aco", bev=0.0015)
    fx.cb(0, 0.095, 0.03, 0.50, 0.03, 0.035, "aco_escuro", bev=0.0015)          # batente
    fx.cb(0, -0.095, 0.03, 0.30, 0.03, 0.035, "aco", bev=0.0015)                # garra
    fx.cb(0, -0.14, 0.03, 0.07, 0.03, 0.045, "aco_escuro", bev=0.0015)          # suporte do fuso
    fx.cil((0, -0.1175, 0.0525), 0.008, 0.015, "aco", eixo="y", seg=12)
    fx.cil((0, -0.14, 0.0775), 0.005, 0.06, "aco", eixo="x", seg=10)
    fx.cb(0, 0, 0.03, 0.36, 0.16, 0.03, "aco", bev=0.002)                       # blank preso
    fx.cb(0.06, 0, 0.06, 0.012, 0.16, 0.0016, "verde")                          # linha de corte
    for x, y, sz, rot, t in ((-0.27, -0.06, (0.05, 0.03, 0.008), 20, "aluminio"), (-0.26, 0.07, (0.04, 0.025, 0.006), -35, "aco"), (0.29, -0.04, (0.045, 0.03, 0.007), 10, "aluminio")):
        fx.caixa((x, y, 0.03 + sz[2] / 2), sz, t, rot=(0, 0, rot), bev=0.001)   # aparas grandes
    for x in (-0.28, 0.28):
        for y in (-0.19, 0.19):
            parafuso_sext(fx, x, y, 0.03)
    for x in (-0.18, -0.06, 0.06, 0.18):                                         # parafusos do batente e da garra (sob o gabarito, que corre a z=0,072)
        parafuso_sext(fx, x, 0.095, 0.065)
    for x in (-0.1, 0.0, 0.1):
        parafuso_sext(fx, x, -0.095, 0.065)
    for k in range(41):                                                          # escala graduada na borda da mesa (so relevo)
        for y in (-0.2125, 0.2125):
            fx.cb(-0.3 + k * 0.015, y, 0.03, 0.0014 if k % 5 else 0.002, 0.016 if k % 5 == 0 else 0.01, 0.0012, "preto", bev=0)
    for x in (-0.3, 0.3):                                                        # grampos de fixacao da mesa
        for y in (-0.19, 0.19):
            fx.cb(x, y, 0.03, 0.05, 0.03, 0.012, "aco_escuro")
            fx.cil((x, y, 0.054), 0.007, 0.03, "aco", seg=12)
    for x, y, a in ((-0.32, 0.0, 12), (0.31, 0.07, -25), (0.27, -0.09, 40)):    # aparas menores
        fx.caixa((x, y, 0.0345), (0.03, 0.012, 0.009), "aluminio", rot=(0, 0, a))
    fx.etiqueta((-0.2, -0.2306, 0.015), 0.12, 0.015, "etq_ribeiro")
    fx.etiqueta((0.07, -0.2306, 0.015), 0.16, 0.02, "etq_peca")
    fx.etiqueta((0.24, -0.2306, 0.015), 0.02, 0.02, "badge_op")
    RB_obj = fx.objeto("RB_Gabarito_Fixo", root, col=col)
    mov = bpy.data.objects.new("RB_CORTE_MOVEL", None); col.objects.link(mov); mov.parent = root; mov["rb_o"] = (0, 0, 0)
    g = Malha("gab")
    xg = 0.06
    g.cb(xg - 0.035, 0, 0.072, 0.05, 0.36, 0.014, "aluminio", bev=0.0015)
    g.cb(xg + 0.035, 0, 0.072, 0.05, 0.36, 0.014, "aluminio", bev=0.0015)
    g.cb(xg, -0.15, 0.086, 0.12, 0.03, 0.012, "aluminio", bev=0.0015)
    g.cil((xg, -0.15, 0.109), 0.01, 0.022, "aco_escuro", seg=14)
    for y in (-0.19, 0.19):
        g.cb(xg - 0.035, y, 0.086, 0.012, 0.012, 0.004, "verde")
    gab = g.objeto("RB_Gabarito_Corte", mov, (xg, 0, 0.072), col)
    animar(gab, "Operate", 30, loc={0: (0, 0, 0), 9: (0.03, 0, 0), 15: (0.03, 0, 0), 27: (0, 0, 0), 30: (0, 0, 0)})
    animar(gab, "Idle", 48, loc={0: (0, 0, 0), 24: (0.0008, 0, 0), 48: (0, 0, 0)})
    return [RB_obj, mov]


# ===================================================================== ASSET 3 - USINAGEM
def a_usin(root, col):
    fx = Malha("fixo")
    fx.cb(0, 0, 0, 0.50, 0.34, 0.025, "aco_escuro", bev=0.002)
    for y in (-0.08, 0.08):
        fx.cb(0, y, 0.025, 0.46, 0.012, 0.0015, "preto")
    for x in (-0.22, 0.22):
        for y in (-0.15, 0.15):
            parafuso_sext(fx, x, y, 0.025)
    fx.cb(-0.21, 0.13, 0.025, 0.04, 0.04, 0.01, "aco_escuro", bev=0.002)       # base do indicador
    fx.cil((-0.21, 0.13, 0.07), 0.007, 0.07, "aco", seg=12)
    fx.cil((-0.21, 0.13, 0.11), 0.016, 0.01, "aco_escuro", seg=16)
    fx.helice((0.0, 0.125, 0.040), 0.012, 0.003, 12, 0.016, "aco_escuro", "x", lados=5, passos=14)   # mangueira de refrigeracao (espiral)
    for k, (x, y, a) in enumerate(((-0.17, 0.02, 10), (-0.19, -0.09, -30), (0.2, -0.12, 25), (0.17, 0.11, 60), (-0.1, -0.13, 5))):
        fx.caixa((x, y, 0.025 + 0.003), (0.014, 0.008, 0.006), "aluminio", rot=(0, 0, a))   # cavacos
    fx.etiqueta((-0.12, -0.1706, 0.0125), 0.1, 0.0125, "etq_ribeiro")
    fx.etiqueta((0.06, -0.1706, 0.0125), 0.12, 0.015, "etq_peca")
    fx.etiqueta((0.2, -0.1706, 0.0125), 0.018, 0.018, "badge_op")
    RB_obj = fx.objeto("RB_Base_Morsa", root, col=col)
    mov = bpy.data.objects.new("RB_USINAGEM_MOVEL", None); col.objects.link(mov); mov.parent = root; mov["rb_o"] = (0, 0, 0)
    v = Malha("morsa")
    v.cb(0, 0, 0.025, 0.40, 0.20, 0.035, "aco_escuro", bev=0.002)               # leito
    v.cb(-0.14, 0, 0.06, 0.06, 0.20, 0.06, "aco", bev=0.002)                    # mordente fixo
    v.cb(0.14, 0, 0.06, 0.06, 0.20, 0.06, "aco", bev=0.002)                     # mordente movel
    v.cil((0.22, 0, 0.09), 0.011, 0.10, "aco", eixo="x", seg=14)                # fuso
    for x in (0.19, 0.21, 0.23):
        v.cil((x, 0, 0.09), 0.0135, 0.004, "aco_escuro", eixo="x", seg=14)
    v.cil((0.27, 0, 0.09), 0.006, 0.09, "aco", eixo="y", seg=10)                # manipulo
    for y in (-0.045, 0.045):
        v.cil((0.27, y, 0.09), 0.01, 0.012, "aco_escuro", eixo="y", seg=10)
    # corpo semi-usinado (canais e rebaixos)
    v.cb(0, 0, 0.06, 0.22, 0.14, 0.03, "aluminio", bev=0.0015)
    v.cb(-0.075, 0, 0.09, 0.07, 0.14, 0.04, "aluminio", bev=0.0015)
    v.cb(0.075, 0, 0.09, 0.07, 0.14, 0.04, "aluminio", bev=0.0015)
    v.cb(0, 0.03, 0.09, 0.08, 0.08, 0.012, "aco_escuro")                        # rebaixo
    v.cil((0, -0.03, 0.1), 0.025, 0.02, "aluminio", seg=20)                     # ressalto
    v.cb(0, 0.065, 0.09, 0.08, 0.01, 0.02, "aluminio")
    for x in (-0.075, 0.075):
        v.cb(x, 0, 0.13, 0.012, 0.12, 0.0015, "preto")                          # canais de fresa
        for y in (-0.045, 0.045):
            v.cil((x + 0.02, y, 0.1308), 0.006, 0.0016, "preto", seg=14)         # furos de fixacao (so desenho)
    for x in (-0.14, 0.14):
        for y in (-0.06, 0.06):
            parafuso_sext(v, x, y, 0.12, r=0.008, h=0.005)                       # parafusos dos mordentes
    for k in range(31):                                                          # escala graduada na face do leito
        v.cb(-0.15 + k * 0.01, -0.1006, 0.04, 0.0014 if k % 5 else 0.002, 0.0012, 0.012 if k % 5 == 0 else 0.007, "preto", bev=0)
    vib = v.objeto("RB_Morsa_Peca", mov, (0, 0, 0.06), col)
    ind = Malha("ind")
    ind.cb(-0.21 + 0.008, 0.13, 0.12, 0.034, 0.008, 0.01, "verde", bev=0.001)
    ind.cil((-0.21 - 0.012, 0.13, 0.125), 0.006, 0.01, "aco_escuro", seg=10)
    ind.cil((-0.21, 0.13, 0.12), 0.014, 0.004, "aco_escuro", seg=16)
    ib = ind.objeto("RB_Usin_Indicador", mov, (-0.21, 0.13, 0.12), col)
    ds = {}
    for i in range(11):
        ds[i * 3] = (0.0004 * (1 if i % 2 == 0 else -1) * (0 if i in (0, 10) else 1), 0.0003 * (-1 if i % 2 == 0 else 1) * (0 if i in (0, 10) else 1), 0)
    rs = {i * 3: (0, 0, (0.25 if i % 2 == 0 else -0.25) * (0 if i in (0, 10) else 1)) for i in range(11)}
    animar(vib, "Operate", 30, loc=ds, rot=rs, linear=True)
    animar(ib, "Operate", 30, rot={0: (0, 0, 0), 30: (0, 0, 360)}, linear=True)
    animar(vib, "Idle", 48, loc={0: (0, 0, 0), 24: (0, 0, 0.0003), 48: (0, 0, 0)})
    animar(ib, "Idle", 48, rot={0: (0, 0, 0), 12: (0, 0, 40), 24: (0, 0, 0), 36: (0, 0, -40), 48: (0, 0, 0)})
    return [RB_obj, mov]


# ===================================================================== ASSET 4 - FURACAO / ACABAMENTO
def a_fura(root, col):
    fx = Malha("fixo")
    fx.cb(0, 0, 0, 0.70, 0.46, 0.03, "aco_escuro", bev=0.002)
    for y in (-0.085, 0.085):
        fx.cb(0, y, 0.03, 0.42, 0.035, 0.03, "aco", bev=0.0015)                 # apoios do gabarito
    for x in (-0.30, 0.30):
        fx.cb(x, 0, 0.03, 0.04, 0.04, 0.34, "aco_escuro", bev=0.0015)           # colunas do portico
    fx.cb(0, 0, 0.34, 0.56, 0.04, 0.03, "aco", bev=0.0015)                      # viga
    for x in (-0.30, 0.30):
        fx.cb(x, 0, 0.03, 0.08, 0.08, 0.01, "aco_escuro", bev=0.001)
    for x in (-0.32, 0.32):
        for y in (-0.2, 0.2):
            parafuso_sext(fx, x, y, 0.03)
    # rebarbador e broca reserva ao lado
    fx.cil((0.17, -0.14, 0.042), 0.012, 0.10, "polimero", eixo="x", seg=14)
    fx.cil((0.25, -0.14, 0.042), 0.004, 0.06, "aco", eixo="x", seg=8)
    fx.caixa((0.295, -0.14, 0.036), (0.03, 0.002, 0.012), "aco", rot=(0, 0, 0))
    fx.cil((0.20, -0.185, 0.035), 0.005, 0.08, "aco", eixo="x", seg=8)
    for sx in (-1, 1):                                                           # esquadros do portico
        fx.caixa((sx * 0.252, 0, 0.312), (0.07, 0.03, 0.012), "aco", rot=(0, sx * 45, 0))
    for x in (-0.19, -0.06, 0.06, 0.19):                                         # parafusos dos apoios
        for y in (-0.085, 0.085):
            parafuso_sext(fx, x, y, 0.06)
    for k in range(41):                                                          # escala graduada na borda da mesa
        fx.cb(-0.3 + k * 0.015, -0.2125, 0.03, 0.0014 if k % 5 else 0.002, 0.016 if k % 5 == 0 else 0.01, 0.0012, "preto", bev=0)
    fx.helice((-0.22, -0.15, 0.045), 0.012, 0.003, 9, 0.02, "aco_escuro", "x", lados=5, passos=14)   # mola de reserva
    for k, (x, y, a) in enumerate(((-0.1, -0.17, 15), (0.05, -0.18, -35), (0.3, 0.12, 20), (-0.31, 0.15, 70))):
        fx.caixa((x, y, 0.03 + 0.004), (0.016, 0.01, 0.008), "aluminio", rot=(0, 0, a))   # cavacos
    fx.etiqueta((-0.2, -0.2306, 0.015), 0.12, 0.015, "etq_ribeiro")
    fx.etiqueta((0.04, -0.2306, 0.015), 0.16, 0.02, "etq_peca")
    fx.etiqueta((0.24, -0.2306, 0.015), 0.02, 0.02, "badge_op")
    RB_obj = fx.objeto("RB_Gabarito_Furacao", root, col=col)
    pc = Malha("peca")
    pc.furar((0, 0, 0.075), (0.40, 0.20, 0.03), [(-0.12, 0, 0.012), (0, 0, 0.012), (0.12, 0, 0.012), (-0.17, 0, 0.006), (0.17, 0, 0.006)], "aco")
    RB_peca = pc.objeto("RB_Peca_Furada", root, (0, 0, 0.075), col)
    mov = bpy.data.objects.new("RB_FURACAO_MOVEL", None); col.objects.link(mov); mov.parent = root; mov["rb_o"] = (0, 0, 0)
    cx = -0.12
    ca = Malha("carro")
    ca.cb(cx, 0, 0.28, 0.09, 0.07, 0.06, "aco", bev=0.002)
    ca.cil((cx, 0, 0.25), 0.022, 0.06, "aco_escuro", seg=18)
    carro = ca.objeto("RB_Carro", mov, (cx, 0, 0.31), col)
    qu = Malha("quill")
    qu.cil((cx, 0, 0.24), 0.014, 0.06, "aco", seg=14)
    qu.cil((cx, 0, 0.20), 0.016, 0.02, "aco_escuro", seg=14)
    quill = qu.objeto("RB_Quill", carro, (cx, 0, 0.21), col)
    br = Malha("broca")
    br.cil((cx, 0, 0.1695), 0.0035, 0.042, "aco", seg=8)
    for i in range(6):
        br.caixa((cx, 0, 0.152 + i * 0.0062), (0.011, 0.0032, 0.0062), "aco", rot=(0, 0, i * 28))
    br.cil((cx, 0, 0.144), 0.0035, 0.008, "aco", seg=8, r2=0.0006)
    broca = br.objeto("RB_Broca", quill, (cx, 0, 0.165), col)
    x1, x2 = 0.12, 0.24
    animar(carro, "Operate", 48, loc={0: (0, 0, 0), 10: (0, 0, 0), 14: (x1, 0, 0), 24: (x1, 0, 0), 28: (x2, 0, 0), 38: (x2, 0, 0), 48: (0, 0, 0)})
    dz = -0.047
    animar(quill, "Operate", 48, loc={0: (0, 0, 0), 2: (0, 0, 0), 5: (0, 0, dz), 8: (0, 0, 0), 16: (0, 0, 0), 19: (0, 0, dz), 22: (0, 0, 0), 30: (0, 0, 0), 33: (0, 0, dz), 36: (0, 0, 0), 48: (0, 0, 0)})
    animar(broca, "Operate", 48, rot={0: (0, 0, 0), 48: (0, 0, 1440)}, linear=True)
    animar(carro, "Idle", 48, loc={0: (0, 0, 0), 24: (0, 0, 0.0008), 48: (0, 0, 0)})
    return [RB_obj, RB_peca, mov]


# ===================================================================== ASSET 5 - MONTAGEM
def a_mont(root, col):
    fx = Malha("fixo")
    bandeja(fx, 0.70, 0.50, 0.05)
    fx.cb(0, -0.02, 0.02, 0.66, 0.012, 0.025, "aco_escuro")
    for x in (-0.12, 0.14):
        fx.cb(x, -0.122, 0.02, 0.012, 0.216, 0.025, "aco_escuro")
    fx.etiqueta((-0.17, -0.2506, 0.035), 0.16, 0.02, "etq_ribeiro")
    fx.etiqueta((0.14, -0.2506, 0.035), 0.16, 0.02, "etq_semmun")
    # corpo (carcaça) + carenagem: pecas soltas, nao montadas
    fx.caixa((-0.16, 0.08, 0.035), (0.26, 0.036, 0.03), "polimero", bev=0.002)
    fx.caixa((-0.16, 0.08, 0.06), (0.22, 0.03, 0.02), "aco_escuro", bev=0.0015)
    fx.caixa((-0.035, 0.08, 0.04), (0.012, 0.03, 0.04), "polimero", bev=0.001)
    fx.caixa((-0.28, 0.08, 0.075), (0.012, 0.01, 0.008), "aco_escuro")
    fx.caixa((0.15, 0.185, 0.034), (0.22, 0.032, 0.028), "aco", bev=0.002)          # carenagem superior
    fx.caixa((0.0, 0.185, 0.0505), (0.012, 0.012, 0.005), "aco_escuro")
    fx.caixa((0.19, 0.185, 0.051), (0.014, 0.012, 0.006), "aco_escuro")
    fx.etiqueta((0.15, 0.185 - 0.0166, 0.034), 0.07, 0.00875, "etq_ribeiro", rot=(0, 0, 0))
    RB_obj = fx.objeto("RB_Bandeja_Tecnica", root, col=col)
    # mola e fixadores (estaticos)
    m = Malha("mola"); c = (-0.23, -0.125, 0.0388); m.helice(c, 0.016, 0.0028, 9, 0.02, "aco", "x", lados=5, passos=14)
    RB_mola = m.objeto("RB_Montagem_Mola", root, c, col)
    f = Malha("fix")
    for i, x in enumerate((-0.085, -0.05, -0.015, 0.02, 0.055)):
        f.cil((x, -0.125, 0.0245), 0.004, 0.06, "aco", eixo="y", seg=8)
        f.cil((x, -0.125 + 0.033, 0.0245), 0.0085, 0.006, "aco_escuro", eixo="y", seg=10)
    for x in (0.08, 0.1, 0.12):
        f.cil((x, -0.06, 0.0235), 0.0035, 0.05, "aluminio", eixo="y", seg=8)
    for i, y in enumerate((-0.2, -0.15, -0.1)):
        f.cil((0.20, y, 0.024), 0.01, 0.008, "aco", seg=6)
        f.cil((0.27, y, 0.021), 0.012, 0.002, "aluminio", seg=14)
    RB_fix = f.objeto("RB_Montagem_Fixadores", root, (0, -0.125, 0.0245), col)
    mov = bpy.data.objects.new("RB_MONTAGEM_MOVEL", None); col.objects.link(mov); mov.parent = root; mov["rb_o"] = (0, 0, 0)
    cn = Malha("cano")
    cn.cil((0.15, 0.08, 0.0315), 0.0115, 0.22, "aco", eixo="x", seg=20)
    cn.cil((0.264, 0.08, 0.0315), 0.009, 0.008, "verde", eixo="x", seg=12)
    cn.cil((0.05, 0.08, 0.035), 0.015, 0.02, "aco_escuro", eixo="x", seg=16)
    cano = cn.objeto("RB_Montagem_Cano", mov, (0.15, 0.08, 0.0315), col)
    gp = Malha("grip")
    gp.caixa((-0.17, 0.175, 0.0375), (0.12, 0.04, 0.035), "polimero", bev=0.003)
    gp.caixa((-0.17, 0.175, 0.0575), (0.1, 0.03, 0.005), "aco_escuro")
    grip = gp.objeto("RB_Montagem_Empunhadura", mov, (-0.17, 0.175, 0.0375), col)
    animar(cano, "Operate", 36, loc={0: (0, 0, 0), 14: (-0.05, 0, 0), 22: (-0.05, 0, 0), 34: (0, 0, 0), 36: (0, 0, 0)})
    animar(grip, "Operate", 36, loc={0: (0, 0, 0), 12: (0, -0.035, 0.012), 22: (0, -0.035, 0.012), 34: (0, 0, 0), 36: (0, 0, 0)})
    animar(cano, "Idle", 48, loc={0: (0, 0, 0), 24: (0, 0, 0.0006), 48: (0, 0, 0)})
    animar(grip, "Idle", 48, loc={0: (0, 0, 0), 24: (0, 0, 0.0006), 48: (0, 0, 0)})
    return [RB_obj, RB_mola, RB_fix, mov]


# ===================================================================== ASSET 6 - PRODUTO FINAL
def a_final(root, col):
    fx = Malha("fixo")
    fx.cb(0, 0, 0, 0.70, 0.40, 0.02, "aco_escuro", bev=0.002)
    fx.cb(0, -0.19, 0.02, 0.70, 0.02, 0.05, "aco_escuro", bev=0.002)
    fx.cb(0, 0.19, 0.02, 0.70, 0.02, 0.05, "aco_escuro", bev=0.002)
    for x in (-0.34, 0.34):
        fx.cb(x, 0, 0.02, 0.02, 0.36, 0.05, "aco_escuro", bev=0.002)
    for x in (-0.25, 0.25):
        fx.cb(x, -0.206, 0.03, 0.04, 0.012, 0.03, "verde", bev=0.001)           # trincos
        fx.cb(x, 0.206, 0.03, 0.05, 0.012, 0.03, "aco", bev=0.001)              # dobradicas
        fx.cil((x, 0.212, 0.0475), 0.007, 0.05, "aco", eixo="x", seg=14)         # eixo da dobradica
    for x in (-0.34, 0.34):
        for y in (-0.19, 0.19):
            fx.cb(x, y, 0.07, 0.03, 0.03, 0.008, "aco", bev=0.001)               # cantoneiras
    for i in range(10):                                                          # rebites da borda da caixa
        for y in (-0.19, 0.19):
            fx.cil((-0.3 + i * 0.0667, y, 0.0715), 0.0045, 0.003, "aco", seg=10)
    for x in (-0.358, 0.358):                                                    # alcas laterais
        fx.cb(x, 0, 0.045, 0.008, 0.12, 0.008, "aco", bev=0.001)
        for y in (-0.06, 0.06):
            fx.cb(x + (0.006 if x > 0 else -0.006) * 0, y, 0.037, 0.008, 0.008, 0.016, "aco", bev=0.001)
    fx.etiqueta((-0.12, -0.2006, 0.045), 0.20, 0.025, "etq_ribeiro")
    fx.etiqueta((0.12, -0.2006, 0.045), 0.20, 0.025, "etq_semmun")
    RB_obj = fx.objeto("RB_Caixa_Transporte", root, col=col)
    mov = bpy.data.objects.new("RB_PRODUTOFINAL_MOVEL", None); col.objects.link(mov); mov.parent = root; mov["rb_o"] = (0, 0, 0)
    ESC = 1.2   # a arma de vitrine e ampliada 20% para ler bem a 3-15 m
    bc = Malha("berco")
    bc.cb(0, 0, 0.02, 0.60, 0.30, 0.025, "espuma", bev=0.003)
    for x, y in ((-0.205, -0.075), (-0.205, 0.075), (0.21, -0.075), (0.21, 0.075)):
        bc.cb(x, y, 0.045, 0.02, 0.02, 0.014, "espuma", bev=0.002)             # batentes da espuma
    for y in (-0.1, 0.1):
        bc.cb(0.0, y, 0.045, 0.02, 0.012, 0.049, "aco", bev=0.001)              # montantes da cinta
    bc.cb(0.0, 0.0, 0.088, 0.018, 0.212, 0.006, "aco_escuro")                    # cinta
    berco = bc.objeto("RB_Berco", mov, (0, 0, 0.0325), col)
    xw, yw, zw = -0.03, -0.012, 0.045 + 0.016 * ESC
    base = Matrix.Translation((xw, yw, zw)) @ Matrix.Rotation(math.radians(-90), 4, "X") @ Matrix.Scale(ESC, 4)
    am = Malha("arma")
    arma_ficticia(am, base)
    arma = am.objeto("RB_Arma_Final", berco, (xw, yw, zw), col)
    animar(berco, "Operate", 48, loc={0: (0, 0, 0), 8: (0, 0, 0.005), 40: (0, 0, 0.005), 48: (0, 0, 0)}, rot={0: (0, 0, 0), 12: (0, 0, 2), 24: (0, 0, 0), 36: (0, 0, -2), 48: (0, 0, 0)})
    animar(berco, "Idle", 48, loc={0: (0, 0, 0), 24: (0, 0, 0.0015), 48: (0, 0, 0)})
    return [RB_obj, mov]


ASSETS = [
    ("RB_PH_PREPARACAO", "ribeiro_preparacao_blank.glb", a_prep),
    ("RB_PH_CORTE", "ribeiro_peca_cortada.glb", a_corte),
    ("RB_PH_USINAGEM", "ribeiro_peca_usinagem.glb", a_usin),
    ("RB_PH_FURACAO_ACABAMENTO", "ribeiro_peca_furacao.glb", a_fura),
    ("RB_PH_MONTAGEM", "ribeiro_kit_montagem.glb", a_mont),
    ("RB_PH_PRODUTO_FINAL", "ribeiro_arma_final_caixa.glb", a_final),
]


# ===================================================================== construir
def limpar_tudo():
    col = bpy.data.collections.get(COLECAO)
    if col:
        for o in list(col.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(col)
    for o in list(bpy.data.objects):
        if o.name.startswith(("T_empty", "tmp_")):
            bpy.data.objects.remove(o, do_unlink=True)
    for me in list(bpy.data.meshes):
        if me.users == 0 and me.name.startswith(("RB_", "tmp_")):
            bpy.data.meshes.remove(me)
    for ac in list(bpy.data.actions):
        if ac.users == 0 and ("__" in ac.name or ac.name.startswith("T_empty")):
            bpy.data.actions.remove(ac)


def construir():
    global MAT
    sc = bpy.data.scenes[CENA]
    bpy.context.window.scene = sc
    limpar_tudo()
    MAT = material()
    col = bpy.data.collections.new(COLECAO)
    sc.collection.children.link(col)
    sc.render.fps = FPS
    sc.frame_start, sc.frame_end = 0, 48
    for i, (nome, arq, fn) in enumerate(ASSETS):
        root = bpy.data.objects.new(nome, None)
        root.empty_display_type = "PLAIN_AXES"; root.empty_display_size = 0.05
        col.objects.link(root)
        root["rb_o"] = (0, 0, 0)
        fn(root, col)
        root.location = (i * 1.0, 0, 0)
    bpy.context.view_layer.update()
    return relatorio()


def RB_CLIPE(clipe=None):
    """para conferir no viewport/captura: so a trilha 'clipe' toca (None = todas ligadas, como sai do construir)"""
    for o in bpy.data.collections[COLECAO].objects:
        if o.animation_data:
            for t in o.animation_data.nla_tracks:
                t.mute = clipe is not None and t.name != clipe
    bpy.context.view_layer.update()


def descendentes(o):
    out = [o]
    for c in o.children:
        out += descendentes(c)
    return out


def relatorio():
    sc = bpy.data.scenes[CENA]
    dg = bpy.context.evaluated_depsgraph_get()
    linhas = []
    for nome, arq, fn in ASSETS:
        root = bpy.data.objects[nome]
        tris, lo, hi = 0, Vector((1e9,) * 3), Vector((-1e9,) * 3)
        for o in descendentes(root):
            if o.type != "MESH":
                continue
            me = o.data
            me.calc_loop_triangles()
            tris += len(me.loop_triangles)
            mw = o.matrix_world
            for v in me.vertices:
                p = mw @ v.co - root.matrix_world.translation
                for k in range(3):
                    lo[k], hi[k] = min(lo[k], p[k]), max(hi[k], p[k])
        d = hi - lo
        linhas.append(f"{nome}: {tris} tris, bbox {d.x:.3f} x {d.y:.3f} x {d.z:.3f} m (x {lo.x:.3f}..{hi.x:.3f}, y {lo.y:.3f}..{hi.y:.3f}, z {lo.z:.3f}..{hi.z:.3f})")
    return "\n".join(linhas)


# ===================================================================== exportar
def RB_EXPORTAR(somente=None):
    sc = bpy.data.scenes[CENA]
    bpy.context.window.scene = sc
    os.makedirs(SAIDA, exist_ok=True)
    sc.frame_set(0)   # reavalia as trilhas NLA recem criadas (sem isso, exportando na mesma chamada do construir(), os clipes saem com nome de acao)
    props = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    # use_active_scene: sem isso o exportador leva as OUTRAS cenas do .blend (a Animacoes tem um rig inteiro)
    base = dict(export_format="GLB", use_selection=True, use_active_scene=True,
                export_apply=True, export_animations=True, export_animation_mode="NLA_TRACKS",
                export_force_sampling=True, export_tangents=True, export_normals=True, export_texcoords=True, export_materials="EXPORT",
                export_cameras=False, export_lights=False, export_yup=True, export_extras=False, export_image_format="AUTO",
                export_vertex_color="NONE")   # NAO passar export_nla_strips: na 5.3 isso troca os nomes dos clipes pelos nomes das acoes
    kw0 = {k: v for k, v in base.items() if k in props}
    saidas = []
    for nome, arq, fn in ASSETS:
        if somente and nome not in somente:
            continue
        root = bpy.data.objects[nome]
        loc0 = root.location.copy()
        root.location = (0, 0, 0)
        bpy.context.view_layer.update()
        for o in bpy.data.objects:
            o.select_set(False)
        for o in descendentes(root):
            o.select_set(True)
        bpy.context.view_layer.objects.active = root
        caminho = os.path.join(SAIDA, arq)
        with contextlib.redirect_stdout(io.StringIO()):
            r = bpy.ops.export_scene.gltf(filepath=caminho, **kw0)
        root.location = loc0
        saidas.append(f"{arq}: {r} {os.path.getsize(caminho) if os.path.exists(caminho) else 'AUSENTE'} bytes")
    bpy.context.view_layer.update()
    return "\n".join(saidas)


# ===================================================================== capturas 3/4 (camera e luzes TEMPORARIAS, apagadas no fim; nunca entram no GLB)
RELATORIOS = os.environ.get("RB_RELATORIOS", r"C:\Users\rafael\Desktop\BAR\2.0\map\relatorios\ribeiro_placeholders")


def RB_CAPTURAS(frame=0, somente=None, res=(960, 720), dir_cam=(0.62, -0.78, 0.62), sufixo=""):
    sc = bpy.data.scenes[CENA]
    bpy.context.window.scene = sc
    os.makedirs(RELATORIOS, exist_ok=True)
    mundo0, cam0, eng0 = sc.world, sc.camera, sc.render.engine
    rx0, ry0, fp0, fr0 = sc.render.resolution_x, sc.render.resolution_y, sc.render.filepath, sc.frame_current
    eng = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in eng else [e for e in eng if "EEVEE" in e][0]
    sc.render.resolution_x, sc.render.resolution_y = res
    w = bpy.data.worlds.new("tmp_mundo_rb")
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.30, 0.33, 0.36, 1)
    bg.inputs["Strength"].default_value = 1.0
    sc.world = w
    temp = []

    def novo(o):
        sc.collection.objects.link(o)
        temp.append(o)
        return o
    sol = novo(bpy.data.objects.new("tmp_sol", bpy.data.lights.new("tmp_sol", "SUN")))
    sol.data.energy = 3.2
    sol.rotation_euler = (math.radians(50), 0, math.radians(35))
    cam_d = bpy.data.cameras.new("tmp_cam")
    cam_d.lens = 50
    cam = novo(bpy.data.objects.new("tmp_cam", cam_d))
    sc.camera = cam
    saidas = []
    for nome, arq, fn in ASSETS:
        if somente and nome not in somente:
            continue
        root = bpy.data.objects[nome]
        sc.frame_set(frame)
        bpy.context.view_layer.update()
        lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
        meus = descendentes(root)
        for o in meus:
            if o.type == "MESH":
                for v in o.data.vertices:
                    p = o.matrix_world @ v.co
                    for k in range(3):
                        lo[k], hi[k] = min(lo[k], p[k]), max(hi[k], p[k])
        ctr = (lo + hi) / 2
        diag = (hi - lo).length
        cam.location = ctr + Vector(dir_cam).normalized() * diag * 1.55
        cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
        ocultos = []
        for o in bpy.data.collections[COLECAO].objects:
            if o not in meus and not o.hide_render:
                o.hide_render = True
                ocultos.append(o)
        sc.render.filepath = os.path.join(RELATORIOS, nome + sufixo + ".png")
        bpy.ops.render.render(write_still=True)
        for o in ocultos:
            o.hide_render = False
        saidas.append(sc.render.filepath)
    for o in temp:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        (bpy.data.lights if isinstance(data, bpy.types.Light) else bpy.data.cameras).remove(data)
    sc.world, sc.camera, sc.render.engine = mundo0, cam0, eng0
    sc.render.resolution_x, sc.render.resolution_y, sc.render.filepath = rx0, ry0, fp0
    bpy.data.worlds.remove(w)
    sc.frame_set(fr0)
    return "\n".join(saidas)


print(construir())
