# Numeracao das mesas de cliente: porta-guardanapo numerado no centro de cada mesa + marcador para o jogo.
#   Numeracao_Mesa_NN      porta-guardanapo (instancia de A_numeracao_mesa, gerado pelo 09_assets.py) na colecao da mesa
#   Numeracao_Mesa_NN_Num  o numero nas duas placas (frente branca e verso cinza): quads com UV no atlas numeros_mesa.png
#   Mesa_NN                marcador (colecao Mesas, exportada como no proprio: o jogo acha pelo nome) no topo da mesa,
#                          extras: mesa = N, area, andar, lugares
# Ordem: terreo (salao 1-11 da frente para o fundo, varanda 12-20 contornando o L, quintal 21-31), superior 32-33,
# terraco 34-39. A placa fica virada para o balcao (alinhada aos lados da mesa) e o numero tambem vai no verso.
# Rodar depois do 06_interior.py / 07_exterior.py (recriam as mesas) e do 09_assets.py.
import bpy, math, os, re, sys
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

DIR = r"C:\Users\rafael\BarBoteco\scripts"
if DIR not in sys.path:
    sys.path.insert(0, DIR)
import barlib as B

ASSET = "A_numeracao_mesa"
TIPOS = ("Mesa", "Mesa_Madeira")                  # mesas de cliente (fora: Mesa_Inox da cozinha, Mesa_Escritorio)
LUGARES_FIXOS = {"Mesa_Madeira": 6}               # mesa de piquenique: bancos embutidos, 3 lugares por lado
AREAS = [("Interior_Terreo", "salao", 0), ("Varanda_Mobiliario", "varanda", 0), ("Quintal_Mobiliario", "quintal", 0),
         ("Interior_Superior", "superior", 1), ("Terraco_Mobiliario", "terraco", 1)]
COL_MARC = "Mesas"
FONTE = r"C:\Windows\Fonts\seguibl.ttf"           # Segoe UI Black
ATLAS, CEL = 1024, 128                            # 8 x 8 numeros
RECUO_PLACA = 0.07                                # margem do numero dentro da placa (fora dos algarismos o quad e transparente)
F = np.float32


def base(n):
    return re.sub(r"\.\d+$", "", n)


def ordem(area, objs):
    if area == "varanda":                         # L: braco oeste de norte para sul, depois frente sul de oeste para leste
        return sorted(objs, key=lambda o: (0, -o.location.y) if (o.location.x < 3.0 and o.location.y > 3.0) else (1, o.location.x))
    linhas = []                                   # demais: fileiras (y) da frente para o fundo, cada uma de oeste para leste
    for o in sorted(objs, key=lambda o: o.location.y):
        if linhas and abs(o.location.y - linhas[-1][0].location.y) < 0.6:
            linhas[-1].append(o)
        else:
            linhas.append([o])
    return [o for ln in linhas for o in sorted(ln, key=lambda o: o.location.x)]


# ------------------------------------------------------------------ atlas dos numeros (preto, fundo transparente)
def atlas_numeros(n):
    import gpu, blf
    fid = blf.load(FONTE)
    size = 160.0
    while True:                                   # mesmo tamanho para todos: o "88" cabe na celula
        blf.size(fid, size)
        if blf.dimensions(fid, "88")[0] <= CEL * 0.92 or size < 20:
            break
        size -= 2
    _, cap = blf.dimensions(fid, "8")
    off = gpu.types.GPUOffScreen(ATLAS, ATLAS)
    with off.bind():
        fb = gpu.state.active_framebuffer_get()
        fb.clear(color=(0.0, 0.0, 0.0, 1.0))
        with gpu.matrix.push_pop():
            gpu.matrix.load_matrix(Matrix.Identity(4))
            gpu.matrix.load_projection_matrix(Matrix(((2 / ATLAS, 0, 0, -1), (0, 2 / ATLAS, 0, -1), (0, 0, 1, 0), (0, 0, 0, 1))))
            blf.color(fid, 1, 1, 1, 1)
            for k in range(1, n + 1):
                c, r = (k - 1) % 8, (k - 1) // 8
                txt = str(k)
                tw = blf.dimensions(fid, txt)[0]
                blf.position(fid, c * CEL + (CEL - tw) / 2, ATLAS - (r * CEL + CEL / 2) - cap / 2, 0)
                blf.draw(fid, txt)
        buf = fb.read_color(0, 0, ATLAS, ATLAS, 4, 0, 'FLOAT')
    off.free()
    buf.dimensions = ATLAS * ATLAS * 4
    try:
        m = np.array(buf, dtype=F).reshape(ATLAS, ATLAS, 4)[..., 0]
    except Exception:
        m = np.array(buf.to_list(), dtype=F).reshape(ATLAS, ATLAS, 4)[..., 0]
    rgba = np.zeros((ATLAS, ATLAS, 4), F)              # linha 0 = baixo (como o Blender guarda)
    rgba[..., :3] = 0.02
    rgba[..., 3] = m
    nome = "numeros_mesa.png"
    path = os.path.join(B.TEX_DIR, nome)
    old = bpy.data.images.get(nome)                    # embutida no .blend: refaz do zero (o material e recriado abaixo)
    if old is not None:
        bpy.data.images.remove(old)
    tmp = bpy.data.images.new(nome + "_gen", ATLAS, ATLAS, alpha=True)
    tmp.pixels.foreach_set(rgba.ravel())
    tmp.filepath_raw = path
    tmp.file_format = 'PNG'
    tmp.save()
    bpy.data.images.remove(tmp)
    im = bpy.data.images.load(path)
    im.name = nome
    im.alpha_mode = 'STRAIGHT'
    im.pack()
    return im


def uv_celula(k):
    c, r = (k - 1) % 8, (k - 1) // 8
    e = 4 / ATLAS
    u0, u1 = c * CEL / ATLAS + e, (c + 1) * CEL / ATLAS - e
    v1, v0 = 1 - r * CEL / ATLAS - e, 1 - (r + 1) * CEL / ATLAS + e
    return u0, v0, u1, v1


def material_numero(im):
    m = bpy.data.materials.get("Numero_Mesa") or bpy.data.materials.new("Numero_Mesa")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (400, 0)
    bs = nt.nodes.new("ShaderNodeBsdfPrincipled"); bs.location = (100, 0)
    nt.links.new(bs.outputs[0], out.inputs["Surface"])
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = im; t.location = (-400, 0)
    nt.links.new(t.outputs["Color"], bs.inputs["Base Color"])
    nt.links.new(t.outputs["Alpha"], bs.inputs["Alpha"])
    bs.inputs["Roughness"].default_value = 0.5
    if hasattr(m, "blend_method"):                     # 4.0: CLIP -> alphaMode MASK no glTF
        m.blend_method = 'CLIP'
        m.alpha_threshold = 0.5
        m.shadow_method = 'CLIP'
    m.use_backface_culling = True
    m["tile_u"], m["tile_v"] = 1.0, 1.0
    m.diffuse_color = (0.02, 0.02, 0.02, 1.0)
    return m


# ------------------------------------------------------------------ placas do porta-guardanapo (grade de raios na malha de jogo)
def placas(me):
    """Retangulos (x0, x1, z0, z1, y) da placa branca da frente (-Y) e da cinza do verso (+Y), em coordenadas do asset."""
    me.calc_loop_triangles()
    V = [v.co.copy() for v in me.vertices]
    bvh = BVHTree.FromPolygons(V, [t.vertices[:] for t in me.loop_triangles])
    uvl = me.uv_layers.active.data
    bs = next(n for n in me.materials[0].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    img = bs.inputs["Base Color"].links[0].from_node.image
    w, h = img.size
    px = np.empty(w * h * 4, F)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    co = np.array([tuple(v) for v in V])
    xs = np.linspace(co[:, 0].min(), co[:, 0].max(), 140)
    zs = np.linspace(co[:, 2].min(), co[:, 2].max(), 110)
    out = {}
    for lado, y0, d in (("frente", co[:, 1].min() - 0.1, 1.0), ("verso", co[:, 1].max() + 0.1, -1.0)):
        prof = np.full((len(zs), len(xs)), np.nan)
        clara = np.zeros(prof.shape, bool)
        for j, z in enumerate(zs):
            for i, x in enumerate(xs):
                loc, _, ti, _ = bvh.ray_cast(Vector((x, y0, z)), Vector((0, d, 0)))
                if loc is None:
                    continue
                t = me.loop_triangles[ti]
                a, b_, c = (V[k] for k in t.vertices)
                uv = barycentric_transform(loc, a, b_, c, *(Vector((*uvl[l].uv, 0)) for l in t.loops))
                cor = px[min(h - 1, max(0, int(uv.y * h))), min(w - 1, max(0, int(uv.x * w))), :3]
                prof[j, i] = loc.y
                clara[j, i] = cor.mean() > (0.75 if lado == "frente" else 0.45) and cor.max() - cor.min() < 0.12
        ext = np.nanmin(prof[clara]) if d > 0 else np.nanmax(prof[clara])
        m = clara & (np.abs(prof - ext) < 0.0015)          # camada mais externa: a placa (moldura e guardanapo ficam atras)
        cols = np.nonzero(m.sum(0) >= 0.6 * m.sum(0).max())[0]
        rows = np.nonzero(m.sum(1) >= 0.6 * m.sum(1).max())[0]
        out[lado] = (xs[cols.min()], xs[cols.max()], zs[rows.min()], zs[rows.max()], float(np.median(prof[m])))
    return out


def malha_numero(nome, k, pl):
    u0, v0, u1, v1 = uv_celula(k)
    m = B.Mesh(nome)
    for lado, (x0, x1, z0, z1, y) in pl.items():
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        a = min(x1 - x0, z1 - z0) * (0.5 - RECUO_PLACA)
        if lado == "frente":                              # quem olha de -Y tem a direita em +X
            y -= 0.0008
            pts = [(cx - a, y, cz - a), (cx + a, y, cz - a), (cx + a, y, cz + a), (cx - a, y, cz + a)]
            n = (0, -1, 0)
        else:                                             # quem olha de +Y tem a direita em -X
            y += 0.0008
            pts = [(cx + a, y, cz - a), (cx - a, y, cz - a), (cx - a, y, cz + a), (cx + a, y, cz + a)]
            n = (0, 1, 0)
        m.face(pts, "Numero_Mesa", uvs=[(u0, v0), (u1, v0), (u1, v1), (u0, v1)], facing=n)
    return m.mesh()


# ------------------------------------------------------------------ limpeza (para re-executar)
for o in list(bpy.data.objects):
    if o.name.startswith("Numeracao_Mesa_"):
        bpy.data.objects.remove(o, do_unlink=True)
B.clear(COL_MARC)
for me in list(bpy.data.meshes):
    if me.name.startswith("Numero_Mesa_") and me.users == 0:
        bpy.data.meshes.remove(me)

me_porta = bpy.data.meshes[ASSET]
pl = placas(me_porta)
mesas = []
for col, area, andar in AREAS:
    c = bpy.data.collections.get(col)
    if c is None:
        continue
    for o in ordem(area, [o for o in c.objects if o.type == 'MESH' and base(o.name) in TIPOS]):
        mesas.append((o, col, area, andar))
im = atlas_numeros(max(len(mesas), 1))
material_numero(im)

sc = bpy.context.scene
dg = bpy.context.evaluated_depsgraph_get()
balcao = bpy.data.objects["Ponto_Balcao"].location
cadeiras = [o for o in bpy.data.objects if o.type == 'MESH' and base(o.name) in ("Cadeira", "Banqueta") and o.visible_get()]
marc = B.coll(COL_MARC)
rel = []
def topo(mesa, xy):
    p = mesa.location
    ok, loc, _, _, hit, _ = sc.ray_cast(dg, Vector((xy.x, xy.y, p.z + 1.2)), Vector((0, 0, -1)), distance=1.5)
    if ok and hit == mesa:
        return loc.z
    return p.z + mesa.data.get("topo_z", 0.75) * mesa.scale.z


def obstruido(xy, z):
    """Algo atravessando o tampo neste ponto (ex.: mastro do guarda-sol): raios curtos na horizontal."""
    for a in range(0, 360, 45):
        d = Vector((math.cos(math.radians(a)), math.sin(math.radians(a)), 0))
        if sc.ray_cast(dg, Vector((xy.x, xy.y, z + 0.06)), d, distance=0.09)[0]:
            return True
    return False


for k, (mesa, col, area, andar) in enumerate(mesas, 1):
    p = mesa.location
    z = topo(mesa, p.xy)
    # porta-guardanapo alinhado aos lados da mesa, placa da frente (-Y local) para o lado mais voltado ao balcao
    alvo = (balcao.xy - p.xy).normalized() if (balcao.xy - p.xy).length > 1e-3 else Vector((0, -1))
    rz = max((mesa.rotation_euler.z + q * math.pi / 2 for q in range(4)),
             key=lambda a: Vector((math.sin(a), -math.cos(a))).dot(alvo))
    xy = p.xy.copy()
    if obstruido(xy, z):                                   # mastro no centro: vai para a frente dele (mastro atras da placa)
        xy = p.xy + Vector((math.sin(rz), -math.cos(rz))) * 0.16
    zp = topo(mesa, xy)
    nn = "%02d" % k
    porta = B.inst(me_porta, "Numeracao_Mesa_" + nn, col, (xy.x, xy.y, zp), math.degrees(rz))
    num = B.inst(malha_numero("Numero_Mesa_" + nn, k, pl), "Numeracao_Mesa_%s_Num" % nn, col, (xy.x, xy.y, zp), math.degrees(rz))
    lugares = LUGARES_FIXOS.get(base(mesa.name)) or sum(
        1 for c in cadeiras if (c.location.xy - p.xy).length < 1.0 and abs(c.location.z - p.z) < 0.5)
    e = bpy.data.objects.new("Mesa_" + nn, None)
    e.empty_display_type = 'PLAIN_AXES'
    e.empty_display_size = 0.3
    e.location = (p.x, p.y, z)
    e.rotation_euler = (0, 0, rz)
    e["mesa"] = k
    e["area"] = area
    e["andar"] = andar
    e["lugares"] = lugares
    marc.objects.link(e)
    mesa["mesa"] = k                                       # tambem na propria mesa (no Blender; no glTF ela vira lote)
    rel.append("%2d %-8s %-17s lugares %d%s" % (k, area, mesa.name, lugares, "  (deslocado: mastro no centro)" if xy != p.xy else ""))

print("placas do porta-guardanapo:", {k: tuple(round(v, 4) for v in r) for k, r in pl.items()})
print("%d mesas numeradas:" % len(mesas))
print("\n".join(rel))
