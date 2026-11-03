# Arvores refeitas do zero (substitui as copas de icosfera do 05_props / 24_cidade_props).
# As malhas mantem os NOMES antigos, entao todas as instancias do bairro e da cidade trocam de uma vez:
#   P_Arvore_A (copa verde, LeafSet024)  P_Arvore_B (oiti, LeafSet022)  P_Arvore_Ipe (ipe amarelo florido)
#   K_Eucalipto (15 m, casca de eucalipto)  K_Arbusto (moita sem tronco)
#   LOD1: K_Arvore_LOD1, K_Arvore_Ipe_LOD1, K_Eucalipto_LOD1 (3 cartoes cruzados + tronco)
# Tronco e galhos: tubos curvos com UV continua (casca Poly Haven + normal map).
# Copa: cachos de folhas em cartoes cruzados com textura alpha (pbr_folhagem.png, alphaMode MASK no glTF).
#   Cada cartao tem frente e verso como faces separadas (material de um lado so): nenhum engine escurece o verso.
#   Normais das folhas apontam para fora da copa (iluminacao macia de copa, sem cara de "placa").
# Texturas: rodar antes scripts\33_texturas_pbr.py (Python do sistema).
import math, random
import bpy
from mathutils import Vector, Matrix
import barlib as B

ATLAS = {'verde': (0.0, 0.5, 0.5, 1.0), 'oiti': (0.5, 0.5, 1.0, 1.0), 'ipe': (0.0, 0.0, 0.5, 0.5), 'euc': (0.5, 0.0, 1.0, 0.5)}
TILE_CASCA = 0.9                                            # metros de casca por repeticao da textura


def mat_folhagem():
    m = bpy.data.materials.get("Arv_Folhagem") or bpy.data.materials.new("Arv_Folhagem")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (400, 0)
    bs = nt.nodes.new("ShaderNodeBsdfPrincipled"); bs.location = (100, 0)
    ti = nt.nodes.new("ShaderNodeTexImage"); ti.location = (-300, 0)
    ti.image = B.load_image("pbr_folhagem.png")
    ti.image.alpha_mode = 'STRAIGHT'
    nt.links.new(ti.outputs["Color"], bs.inputs["Base Color"])
    nt.links.new(ti.outputs["Alpha"], bs.inputs["Alpha"])
    nt.links.new(bs.outputs[0], out.inputs["Surface"])
    bs.inputs["Roughness"].default_value = 0.8
    m.blend_method = 'CLIP'
    m.alpha_threshold = 0.45
    m.shadow_method = 'CLIP'
    m.use_backface_culling = True
    m.diffuse_color = (0.25, 0.42, 0.18, 1.0)
    m["tile_u"], m["tile_v"] = 1.0, 1.0
    return m


mat_folhagem()
# impostores LOD2 dos ipes (Sxx_yy_Vegetacao_LOD2): o ipe agora e amarelo, nao roxo
B.material("Folhas_Ipe", tex="pbr_copa_ipe_lod.jpg", tile=(1.5, 1.5), rough=0.9)
B.material("Arv_Casca", tex="pbr_casca.jpg", normal="pbr_casca_n.jpg", rough=0.92, color=(0.85, 0.82, 0.78))
B.material("Arv_Casca_Eucalipto", tex="pbr_casca_eucalipto.jpg", normal="pbr_casca_eucalipto_n.jpg", rough=0.85,
           color=(1.15, 1.1, 1.05))


class Arv:
    """Malha montada em listas (vertices, faces, UV e normal por canto) -> custom split normals no final."""

    def __init__(self, nome):
        self.nome = nome
        self.v, self.f, self.uv, self.n, self.mi = [], [], [], [], []
        self.mats = []

    def _m(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def tubo(self, pts, raios, mat, segs=6, v0=0.0):
        """Tubo ao longo de uma polilinha (aneis por transporte paralelo), UV u em volta, v ao longo."""
        pts = [Vector(p) for p in pts]
        mi = self._m(mat)
        t0 = (pts[1] - pts[0]).normalized()
        ref = Vector((1, 0, 0)) if abs(t0.x) < 0.9 else Vector((0, 1, 0))
        nx = t0.cross(ref).normalized()
        rep = max(1, round(2 * math.pi * raios[0] / TILE_CASCA))
        aneis, v, tan_ant = [], v0, t0
        for i, p in enumerate(pts):
            if i == 0:
                t = t0
            elif i == len(pts) - 1:
                t = (p - pts[i - 1]).normalized()
            else:
                t = ((p - pts[i - 1]).normalized() + (pts[i + 1] - p).normalized()).normalized()
            nx = (nx - t * nx.dot(t)).normalized()           # transporte paralelo (sem torcao)
            ny = t.cross(nx)
            if i:
                v += (p - pts[i - 1]).length / TILE_CASCA
            anel = []
            for k in range(segs + 1):
                a = 2 * math.pi * k / segs
                d = nx * math.cos(a) + ny * math.sin(a)
                self.v.append(p + d * raios[i])
                anel.append((len(self.v) - 1, d, (k / segs * rep, v)))
            aneis.append(anel)
        for i in range(len(aneis) - 1):
            A, Bn = aneis[i], aneis[i + 1]
            for k in range(segs):
                c = (A[k], A[k + 1], Bn[k + 1], Bn[k])
                self.f.append([x[0] for x in c])
                self.uv.append([x[2] for x in c])
                self.n.append([x[1] for x in c])
                self.mi.append(mi)
        return v

    def cartao(self, base, up, lado, larg, alt, cel, nrm_fn, mat="Arv_Folhagem"):
        """Quad com frente e verso (faces separadas). nrm_fn(p) -> normal da copa naquele ponto."""
        u0, v0, u1, v1 = ATLAS[cel]
        mi = self._m(mat)
        cs = [base - lado * larg / 2, base + lado * larg / 2, base + lado * larg / 2 + up * alt, base - lado * larg / 2 + up * alt]
        uvs = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
        ns = [nrm_fn(p) for p in cs]
        for lado_ in (1, -1):                               # verso com vertices proprios (validate apagaria face duplicada)
            idx = []
            for p in cs:
                self.v.append(p.copy())
                idx.append(len(self.v) - 1)
            self.f.append(idx[::lado_]); self.uv.append(uvs[::lado_]); self.n.append(ns[::lado_]); self.mi.append(mi)

    def malha(self):
        me = bpy.data.meshes.get(self.nome)
        if me is None:
            me = bpy.data.meshes.new(self.nome)
        else:
            me.clear_geometry()
            me.materials.clear()
        me.from_pydata([tuple(p) for p in self.v], [], self.f)
        for mn in self.mats:
            me.materials.append(bpy.data.materials[mn])
        uvl = me.uv_layers.get("UVMap") or me.uv_layers.new(name="UVMap")
        lns = [(0.0, 0.0, 1.0)] * len(me.loops)
        for poly, uvs, ns, mi in zip(me.polygons, self.uv, self.n, self.mi):
            poly.material_index = mi
            poly.use_smooth = True
            for li, uv, n in zip(poly.loop_indices, uvs, ns):
                uvl.data[li].uv = uv
                lns[li] = tuple(n)
        if hasattr(me, "use_auto_smooth"):
            me.use_auto_smooth = True
            me.auto_smooth_angle = math.pi
        me.normals_split_custom_set(lns)
        me.validate(clean_customdata=False)
        me.update()
        return me


def arvore(nome, seed, cel, h_tronco, r_tronco, centro, raios, n_cachos, tam, n_galhos=4, casca="Arv_Casca",
           torto=0.15, dens_galhos=2, sem_tronco=False, pendente=0.0):
    rnd = random.Random(seed)
    a = Arv(nome)
    c = Vector(centro)
    rx, ry, rz = raios

    def nrm(p):                                              # normal "de copa": do centro para fora (elipsoide)
        d = Vector(((p.x - c.x) / rx, (p.y - c.y) / ry, (p.z - c.z) / rz))
        if d.length < 1e-4:
            return Vector((0, 0, 1))
        return (d.normalized() + Vector((0, 0, 0.35))).normalized()

    topo = Vector((0, 0, 0))
    if not sem_tronco:
        # tronco com base alargada e leve curvatura
        n_tr = 5
        pts, rs = [], []
        lean = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0)) * torto
        for i in range(n_tr + 1):
            t = i / n_tr
            ond = Vector((math.sin(t * 2.6 + seed) * torto * 0.6, math.cos(t * 2.1 + seed) * torto * 0.6, 0))
            pts.append(Vector((0, 0, -0.12 + t * (h_tronco + 0.12))) + lean * t * t + ond * t)
            rs.append(r_tronco * (1.45 - 0.45 * t) if i == 0 else r_tronco * (1.0 - 0.28 * t))
        a.tubo(pts, rs, casca, segs=8)
        topo = pts[-1]
        rt = rs[-1]
        # lider central ate o centro da copa
        a.tubo([topo, topo.lerp(c, 0.5) + Vector((rnd.uniform(-.2, .2), rnd.uniform(-.2, .2), 0)), c + Vector((0, 0, rz * 0.45))],
               [rt * 0.95, rt * 0.6, rt * 0.2], casca, segs=6)
        # galhos principais (pernadas) abrindo para a copa
        az0 = rnd.uniform(0, 2 * math.pi)
        for g in range(n_galhos):
            az = az0 + 2 * math.pi * g / n_galhos + rnd.uniform(-0.35, 0.35)
            dirh = Vector((math.cos(az), math.sin(az), 0))
            alcance = rnd.uniform(0.55, 0.8)
            fim = c + Vector((dirh.x * rx * alcance, dirh.y * ry * alcance, rnd.uniform(-0.15, 0.35) * rz))
            ini = topo + Vector((0, 0, rnd.uniform(-0.25, 0.05)))
            meio = ini.lerp(fim, 0.45) + Vector((0, 0, -0.15 * (fim - ini).length * 0.3 + 0.2))
            pts_g = [ini, meio, fim]
            a.tubo(pts_g, [rt * 0.75, rt * 0.5, rt * 0.22], casca, segs=6)
            for s in range(dens_galhos):                      # galhos secundarios
                p0 = meio.lerp(fim, rnd.uniform(0.2, 0.8))
                d2 = (dirh * rnd.uniform(0.4, 0.9) + Vector((rnd.uniform(-.6, .6), rnd.uniform(-.6, .6), rnd.uniform(0.3, 0.9)))).normalized()
                p1 = p0 + d2 * rnd.uniform(0.7, 1.2) * min(rx, rz)
                e = Vector(((p1.x - c.x) / rx, (p1.y - c.y) / ry, (p1.z - c.z) / rz)).length
                if e > 0.7:                                   # a ponta fica dentro da folhagem
                    p1 = c + (p1 - c) * (0.7 / e)
                a.tubo([p0, p0.lerp(p1, 0.5) + Vector((0, 0, 0.08)), p1], [rt * 0.25, rt * 0.16, rt * 0.06], casca, segs=4)
    # cachos de folhas: pontos numa casca do elipsoide (mais densos por fora), cartoes cruzados
    pts_c = []
    tent = 0
    while len(pts_c) < n_cachos and tent < 5000:
        tent += 1
        d = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1)))
        if d.length < 1e-3:
            continue
        d.normalize()
        if d.z < -0.75 and not sem_tronco:                   # embaixo da copa fica mais aberto (ve-se o tronco)
            continue
        r = rnd.uniform(0.15, 0.62)
        p = c + Vector((d.x * rx * r, d.y * ry * r, d.z * rz * r))
        if sem_tronco and p.z < tam * 0.3:
            continue
        if any((p - q).length < tam * 0.22 for q in pts_c):
            continue
        pts_c.append(p)
    for p in pts_c:
        o = Vector(((p.x - c.x) / rx, (p.y - c.y) / ry, (p.z - c.z) / rz))
        o = o.normalized() if o.length > 1e-3 else Vector((0, 0, 1))
        up = (o * 0.8 + Vector((0, 0, 0.55 - pendente)) + Vector((rnd.uniform(-.3, .3), rnd.uniform(-.3, .3), rnd.uniform(-.2, .2)))).normalized()
        if pendente and up.z < -0.2:
            up = (up + Vector((0, 0, 0.3))).normalized()
        ref = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
        lado = up.cross(ref)
        if lado.length < 1e-3:
            lado = up.cross(Vector((1, 0, 0)))
        lado.normalize()
        s = tam * rnd.uniform(0.85, 1.15)
        base = p - up * s * 0.42
        a.cartao(base, up, lado, s, s, cel, nrm)
        a.cartao(base, up, up.cross(lado).normalized(), s, s, cel, nrm)
    me = a.malha()
    print("%-18s %5d tris  %d cachos" % (nome, sum(len(f) - 2 for f in a.f), len(pts_c)))
    return me


def arvore_lod1(nome, cel, h_tronco, r_tronco, centro, raios, casca="Arv_Casca"):
    """LOD1: tronco de 5 lados + 3 cartoes verticais cruzados (frente e verso) com o cacho inteiro."""
    a = Arv(nome)
    c = Vector(centro)
    a.tubo([(0, 0, -0.1), (0, 0, h_tronco), c], [r_tronco * 1.2, r_tronco * 0.8, r_tronco * 0.3], casca, segs=5)
    rx, _, rz = raios

    def nrm(p):
        d = Vector(((p.x - c.x) / rx, (p.y - c.y) / rx, (p.z - c.z) / rz))
        return (d.normalized() + Vector((0, 0, 0.35))).normalized() if d.length > 1e-4 else Vector((0, 0, 1))
    for k in range(3):
        ang = math.pi * k / 3
        lado = Vector((math.cos(ang), math.sin(ang), 0))
        a.cartao(c - Vector((0, 0, rz * 1.05)), Vector((0, 0, 1)), lado, rx * 2.2, rz * 2.2, cel, nrm)
    me = a.malha()
    print("%-18s %5d tris" % (nome, sum(len(f) - 2 for f in a.f)))
    return me


ESPECIES = {
    #              seed  cel     h_tr  r_tr   centro           raios             n   tam (lado do cartao, m)
    "P_Arvore_A":   dict(seed=11, cel='verde', h_tronco=2.2, r_tronco=0.15, centro=(0, 0, 4.0), raios=(2.5, 2.5, 1.75), n_cachos=17, tam=2.9),
    "P_Arvore_B":   dict(seed=23, cel='oiti', h_tronco=1.9, r_tronco=0.17, centro=(0, 0, 3.8), raios=(2.4, 2.4, 2.0), n_cachos=19, tam=2.8,
                         n_galhos=5),
    "P_Arvore_Ipe": dict(seed=37, cel='ipe', h_tronco=2.6, r_tronco=0.16, centro=(0, 0, 4.5), raios=(2.7, 2.7, 1.5), n_cachos=18, tam=2.7,
                         torto=0.35),
    "K_Eucalipto":  dict(seed=5, cel='euc', h_tronco=9.0, r_tronco=0.22, centro=(0, 0, 12.0), raios=(2.4, 2.4, 3.2), n_cachos=16, tam=3.0,
                         casca="Arv_Casca_Eucalipto", torto=0.25, n_galhos=4, dens_galhos=1, pendente=0.35),
    "K_Arbusto":    dict(seed=9, cel='verde', h_tronco=0, r_tronco=0, centro=(0, 0, 0.95), raios=(1.4, 1.4, 0.8), n_cachos=7, tam=1.9,
                         sem_tronco=True),
}
for nome, kw in ESPECIES.items():
    seed = kw.pop("seed")
    arvore(nome, seed, **kw)
    kw["seed"] = seed
arvore_lod1("K_Arvore_LOD1", 'verde', 2.2, 0.15, (0, 0, 4.0), (2.5, 2.5, 1.75))
arvore_lod1("K_Arvore_Ipe_LOD1", 'ipe', 2.6, 0.16, (0, 0, 4.5), (2.7, 2.7, 1.5))
arvore_lod1("K_Eucalipto_LOD1", 'euc', 9.0, 0.22, (0, 0, 12.0), (2.4, 2.4, 3.2), casca="Arv_Casca_Eucalipto")
for n in ("K_Arvore_LOD1", "K_Arvore_Ipe_LOD1", "K_Eucalipto_LOD1", "K_Arbusto", "K_Eucalipto"):
    bpy.data.meshes[n].use_fake_user = True
