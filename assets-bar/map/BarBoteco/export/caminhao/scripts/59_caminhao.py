# 59_caminhao.py
# Caminhao bau (VUC, ~6,4 m) para o jogo, refeito do modelo da Tripo (malha unica de 9,8k triangulos soltos, sem simetria).
# A Tripo so serviu de referencia de proporcao. Tudo aqui e procedural, em metros, com malhas fechadas e simetricas.
#
# Roda no Blender MCP com exec (SO_FUNCOES=True carrega so as funcoes) ou em segundo plano:
#   blender.exe -b --factory-startup -P 59_caminhao.py -- --exportar
#
# Convencoes (as mesmas do carro, 21_carro_hatch.py): frente = -Y no Blender = +Z no glTF; origem no chao, no meio do
# entre-eixos; Z para cima; E/D = esquerda/direita do motorista (esquerda = +X), motorista a esquerda.
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SAIDA = r"C:\Users\rafael\BarBoteco\export\caminhao"
BLEND_COPIA = r"C:\Users\rafael\Desktop\BAR\2.0\veiculos\caminhao\caminhao_bau.blend"
SCRIPTS = "C:/Users/rafael/BarBoteco/scripts"
if "--exportar" in ARGS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene
COLS = ["Caminhao", "Caminhao_Colisao", "Cam_TMP"]

# ---------------------------------------------------------------- cotas (metros)
YF, YT = -1.56, 1.56                  # eixos dianteiro / traseiro (entre-eixos 3,12 m)
R_RODA, ZC = 0.44, 0.44               # raio do pneu e altura do centro
X_RD = 0.86                           # bitola dianteira (centro do pneu)
X_RT = (0.70, 0.96)                   # rodas duplas traseiras (interna, externa)
L_PNEU = 0.24
# cabine
CAB_X, CAB_Y0, CAB_Y1 = 1.00, -2.52, -1.08      # meia largura, frente, fundo
CAB_Z0, CAB_Z1 = 0.55, 2.25                     # saia e teto
CAB_PISO = 0.96                                 # piso interno
PAREDE = 0.045                                  # espessura da chapa da cabine
FOLGA = 0.005                                   # folga entre porta e carroceria
# bau
BAU_X, BAU_Y0, BAU_Y1 = 1.10, -1.00, 2.62       # meia largura, frente, traseira
BAU_Z0, BAU_Z1 = 0.92, 2.55                     # fundo e teto (externo)
BAU_PISO = 1.06                                 # piso interno (topo do assoalho)
BAU_PAR = 0.05                                  # parede lateral (miolo; a chapa ondulada soma +0,03)
ONDA = 0.14                                     # passo da ondulacao do aluminio

PECAS = ["pintura", "forro_cab", "porta_pintura", "forro_porta", "bau_chapa", "bau_teto", "bau_forro", "bau_piso",
         "bau_porta", "bau_moldura", "parachoque", "plastico", "borracha", "pneu", "roda", "cubo", "chassi", "eixo",
         "tanque", "escape", "banco", "painel", "volante", "grade", "farol_E", "farol_D", "cromo", "refletor",
         "carga", "carga_fita", "espelho", "palheta", "tapete", "teto_cab", "lanterna_E", "lanterna_D", "seta_E",
         "seta_D", "re_E", "re_D", "placa", "mola", "dobradica", "trilho", "luz_bau", "estribo", "vidro_pintura"]
PID = {n: i for i, n in enumerate(PECAS)}


def tab(t, pts):
    """interpolacao linear numa tabela [(t, v), ...]"""
    if t <= pts[0][0]:
        return pts[0][1]
    if t >= pts[-1][0]:
        return pts[-1][1]
    for i in range(len(pts) - 1):
        t0, t1 = pts[i][0], pts[i + 1][0]
        if t <= t1:
            u = (t - t0) / (t1 - t0)
            return pts[i][1] * (1 - u) + pts[i + 1][1] * u


# ---------------------------------------------------------------- infraestrutura
def colecao(nome):
    col = bpy.data.collections.get(nome)
    if col is None:
        col = bpy.data.collections.new(nome)
        SC.collection.children.link(col)
    return col


def limpar():
    for nome in COLS:
        col = bpy.data.collections.get(nome)
        if col:
            for o in list(col.objects):
                bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.collections.remove(col)
    for dados in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images):
        for d in list(dados):
            if d.users == 0 and d.name.startswith(("Cam_", "TMP_", "Luz_", "Caminhao", "caminhao_")):
                dados.remove(d)


def objeto(bm, nome, col, peca=None):
    """bmesh -> objeto; 'peca' (nome) etiqueta todas as faces"""
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(nome, me)
    col.objects.link(ob)
    if peca:
        etiquetar(ob, peca)
    return ob


def etiquetar(ob, peca):
    me = ob.data
    at = me.attributes.get("peca") or me.attributes.new("peca", 'INT', 'FACE')
    at.data.foreach_set("value", [PID[peca]] * len(me.polygons))


def renomear_pecas(ob, mapa):
    """troca etiquetas de peca (nome -> nome) nas faces do objeto"""
    me = ob.data
    at = me.attributes["peca"].data
    de = {PID[a]: PID[b] for a, b in mapa.items()}
    at.foreach_set("value", [de.get(at[i].value, at[i].value) for i in range(len(me.polygons))])


def etiquetar_slots(ob, mapa):
    """material_index (sobrevive a booleanas) -> atributo peca"""
    me = ob.data
    at = me.attributes.get("peca") or me.attributes.new("peca", 'INT', 'FACE')
    at.data.foreach_set("value", [PID[mapa.get(p.material_index, mapa[0])] for p in me.polygons])
    me.polygons.foreach_set("material_index", [0] * len(me.polygons))


def slot(ob, indice):
    me = ob.data
    me.polygons.foreach_set("material_index", [indice] * len(me.polygons))


def poligono(pts, o, U, V, W, w0, w1, r=0.0, seg=2, fechado=True):
    seg = max(seg, 4)
    """extrusao de um poligono (u, v) -> o + u*U + v*V, de w0 a w1 ao longo de W; bevel opcional nas arestas"""
    bm = bmesh.new()
    vs = [bm.verts.new(Vector(o) + U * u + V * v + W * w0) for u, v in pts]
    f = bm.faces.new(vs)
    ex = bmesh.ops.extrude_face_region(bm, geom=[f])
    nv = [g for g in ex["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=W * (w1 - w0), verts=nv)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if r > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=r, segments=seg, profile=0.65, affect='EDGES', clamp_overlap=True)
    return bm


X_, Y_, Z_ = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def prisma_x(pts_yz, x0, x1, r=0.0, seg=2):
    """perfil no plano YZ extrudado em X (cabine, portas, longarinas)"""
    return poligono(pts_yz, (0, 0, 0), Y_, Z_, X_, x0, x1, r, seg)


def prisma_y(pts_xz, y0, y1, r=0.0, seg=2):
    """perfil no plano XZ extrudado em Y (chapa ondulada lateral)"""
    return poligono(pts_xz, (0, 0, 0), X_, Z_, Y_, y0, y1, r, seg)


def caixa(c, s, r=0.0, seg=2):
    seg = max(seg, 3)
    """caixa centrada em c com dimensoes s; bevel r"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * s[0], v.co.y * s[1], v.co.z * s[2])) + Vector(c)
    if r > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=r, segments=seg, profile=0.7, affect='EDGES', clamp_overlap=True)
    return bm


def cilindro(p0, p1, r, n=16, r1=None, tampas=True):
    """cilindro (ou cone) entre dois pontos"""
    n = int(n * 1.6)
    p0, p1 = Vector(p0), Vector(p1)
    eixo = p1 - p0
    L = eixo.length
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=tampas, segments=n, radius1=r, radius2=r if r1 is None else r1, depth=L)
    q = Vector((0, 0, 1)).rotation_difference(eixo.normalized())
    bmesh.ops.rotate(bm, verts=bm.verts[:], cent=(0, 0, 0), matrix=q.to_matrix())
    bmesh.ops.translate(bm, vec=(p0 + p1) / 2, verts=bm.verts[:])
    return bm


def girar(perfil, eixo_p, eixo_d, passos=28):
    """revolve um perfil [(raio, posicao)] ao redor de um eixo (ponto, direcao)"""
    d = Vector(eixo_d).normalized()
    p = Vector(eixo_p)
    base = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((0, 1, 0))).normalized()
    bm = bmesh.new()
    vs = [bm.verts.new(p + base * r + d * a) for r, a in perfil]
    for i in range(len(vs) - 1):
        bm.edges.new((vs[i], vs[i + 1]))
    bmesh.ops.spin(bm, geom=bm.verts[:] + bm.edges[:], cent=p, axis=d, angle=math.tau, steps=passos, use_merge=True,
                   use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def aplicar_booleana(ob, cortador, op='DIFFERENCE'):
    m = ob.modifiers.new("B", 'BOOLEAN')
    m.object, m.operation, m.solver = cortador, op, 'EXACT'
    dg = bpy.context.evaluated_depsgraph_get()
    novo = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.remove(m)
    velho = ob.data
    ob.data = novo
    bpy.data.meshes.remove(velho)
    novo.name = ob.name


def cortar(ob, bms, col_tmp, op='DIFFERENCE'):
    """aplica a booleana com cada bmesh da lista (os bmesh sao consumidos)"""
    for i, bm in enumerate(bms):
        c = objeto(bm, "Cam_cortador", col_tmp)
        aplicar_booleana(ob, c, op)
        me = c.data
        bpy.data.objects.remove(c, do_unlink=True)
        bpy.data.meshes.remove(me)


def espelhar_x(ob, nome, col):
    """copia espelhada em X (normais viradas de volta para fora)"""
    novo = ob.copy()
    novo.data = ob.data.copy()
    novo.name = nome
    novo.data.name = nome
    col.objects.link(novo)
    novo.data.transform(Matrix.Scale(-1, 4, X_))
    novo.data.flip_normals()
    return novo


def unir_bm(bms):
    """junta uma lista de bmesh em um so"""
    out = bmesh.new()
    me = bpy.data.meshes.new("Cam_tmp")
    for bm in bms:
        bm.to_mesh(me)
        out.from_mesh(me)
        bm.free()
    bpy.data.meshes.remove(me)
    return out


def deslocar(bm, v):
    bmesh.ops.translate(bm, vec=Vector(v), verts=bm.verts[:])
    return bm


def girar_bm(bm, graus, eixo, centro=(0, 0, 0)):
    bmesh.ops.rotate(bm, verts=bm.verts[:], cent=centro, matrix=Matrix.Rotation(math.radians(graus), 3, eixo))
    return bm


def ondulado_x(z0, z1, x_base, x_out, y0, y1, passo=ONDA, lado=1):
    """chapa ondulada na parede lateral: ondas horizontais (perfil x vs z), extrudada ao longo de Y.
    lado=+1 para o lado E (+X), -1 para o D. x_base = rente a parede, x_out = crista"""
    n = max(2, int(round((z1 - z0) / passo)))
    p = (z1 - z0) / n
    topo = []
    for i in range(n):
        za = z0 + i * p
        topo += [(x_base, za), (x_base + (x_out - x_base) * 0.15, za + p * 0.12), (x_out, za + p * 0.32),
                 (x_out, za + p * 0.62), (x_base + (x_out - x_base) * 0.15, za + p * 0.82)]
    topo += [(x_base, z1)]
    atras = [(x_base - 0.012, z1), (x_base - 0.012, z0)]
    pts = [(x * lado, z) for x, z in topo + atras]
    if lado < 0:
        pts = pts[::-1]
    return prisma_y(pts, y0, y1)


def ondulado_y(y0, y1, z0, z1, y_base, y_out, x0, x1, passo=ONDA):
    """chapa ondulada horizontal na traseira (porta de enrolar): perfil (y vs z), extrudada em X"""
    n = max(2, int(round((z1 - z0) / passo)))
    p = (z1 - z0) / n
    topo = []
    for i in range(n):
        za = z0 + i * p
        topo += [(y_base, za), (y_base + (y_out - y_base) * 0.2, za + p * 0.12), (y_out, za + p * 0.34),
                 (y_out, za + p * 0.64), (y_base + (y_out - y_base) * 0.2, za + p * 0.82)]
    topo += [(y_base, z1)]
    atras = [(y_base - 0.014, z1), (y_base - 0.014, z0)]
    return prisma_x(topo + atras, x0, x1)


# ---------------------------------------------------------------- partes (executam no mesmo espaco de nomes)
if "SO_FUNCOES" not in globals():           # execucao direta (blender -P): carrega as partes e roda
    for _f in ("59a_cabine.py", "59b_bau.py", "59c_chassi.py", "59d_montagem.py", "59e_final.py"):
        exec(compile(open(os.path.join(SCRIPTS, _f), encoding="utf8").read(), _f, "exec"), globals())
