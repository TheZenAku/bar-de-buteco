# 19_fumar_mixamo.py
# Props, fumaca e iluminacao para a animacao "Smoking" do Mixamo (Downloads\Smoking.fbx: so o esqueleto, 538 quadros
# a 30 fps). Roda com exec no Blender MCP, na cena onde o FBX foi importado (objeto "Armature"). Refaz tudo a cada
# execucao (apaga o que criou antes) e nao mexe na animacao.
#
# Roteiro lido da animacao (quadros):
#    20-146  maco na mao esquerda (sai do bolso, volta para o bolso)
#    38-118  cigarro na pinca da mao direita (puxa do maco e leva a boca)
#   118-255  cigarro na boca; isqueiro na mao esquerda 150-245, chama 185-221, acende no 199, tragadas 194-220 e 231-249
#   255-351  cigarro entre o indicador e o medio; baforadas 259-300 e 298-322
#   351-364  joga no chao; 375 pisa (apaga) e gira o pe ate ~412
#
# Cria:
#   Manequim_Referencia  manequim simples preso aos ossos (so referencia visual; pode esconder ou apagar)
#   Props_Fumar          Prop_Maco, Prop_Cigarro, Prop_Brasa, Prop_Isqueiro, Prop_Chama (chaves por quadro, escondido =
#                        escala 1e-4, como no 18), Luz_Brasa e Luz_Chama (energia por quadro)
#   FX_Fumar             FX_Fumaca_Ponta / FX_Fumaca_Boca (vazios: escala = intensidade, +Z = direcao, como no 18)
#                        FX_Trajeto_Ponta / FX_Trajeto_Boca (1 vertice por quadro com "inten" e "dir")
#                        Fumaca_Ponta (fios de fumaca: curvas GN) e Fumaca_Boca (baforada: volume GN). Os dois sao funcao
#                        pura do quadro (sem simulacao/cache): da para pular no timeline e renderizar fora de ordem.
#   Cena_Fumar           luzes de bar, chao, parede, 3 cameras trocadas por marcadores, ajustes do EEVEE
#
# Para o jogo (segundo plano, nao mexe na cena aberta; importa o Smoking.fbx numa cena vazia e refaz tudo):
#   "D:\SteamLibrary\steamapps\common\Blender\blender.exe" -b --factory-startup -P 19_fumar_mixamo.py -- --exportar
#   -> export/animacoes/bar_fumar_mixamo.glb (clipe "fumar_mixamo", formato do 18: esqueleto + Prop_* + FX_* + extras
#      "bar_animacoes") e export/animacoes/fbx/fumar_mixamo.fbx (o FBX original, so esqueleto). No JS: p.fumarCigarro().
#   A fumaca de Geometry Nodes e as luzes ficam so no Blender; no jogo a fumaca sai das particulas do animacoes_bar.js.
import bpy, bmesh, math, os, sys, json, shutil
from mathutils import Vector, Matrix, Quaternion, noise as mnoise

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
FBX_SMOKING = r"C:\Users\rafael\Downloads\Smoking.fbx"
SAIDA = r"C:\Users\rafael\BarBoteco\export\animacoes"
CLIPE = "fumar_mixamo"
if "--exportar" in ARGS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=FBX_SMOKING)
    bpy.context.scene.render.fps, bpy.context.scene.render.fps_base = 30, 1.0

SC = bpy.context.scene
ARM = bpy.data.objects["Armature"]
MW = ARM.matrix_world.copy()
F0 = 1
F1 = int(round(ARM.animation_data.action.frame_range[1]))
FPS = SC.render.fps / SC.render.fps_base
ESCONDIDO = 1e-4

L_CIG = 0.084                     # comprimento do cigarro (filtro na origem, ponta em +Z)
R_CIG = 0.0039
H_ISQ = 0.071                     # altura do isqueiro ate a saida do gas
COLS = ["Manequim_Referencia", "Props_Fumar", "FX_Fumar", "Cena_Fumar"]

# ---------------------------------------------------------------- roteiro
SOLTA = 351                       # larga o cigarro
PISA = 375                        # pe em cima da bituca (a sola encosta no chao no 375)
ACENDE = 199
TRAGADAS = [(194, 199, 213, 220), (231, 235, 244, 249)]
BAFORADAS = [(259, 262, 284, 300, 1.0), (298, 304, 310, 322, 0.45)]
CHAMA = (185, 221)


# ================================================================ utilidades
def suave(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def janela(f, a, b, c, d):
    if f <= a or f >= d:
        return 0.0
    if f < b:
        return suave((f - a) / (b - a))
    if f <= c:
        return 1.0
    return 1.0 - suave((f - c) / (d - c))


def tragada(f):
    return max(janela(f, *t) for t in TRAGADAS)


def ruido(f, semente, vel=0.23):
    return mnoise.noise(Vector((f * vel, semente * 7.31, 0.37)))


def nm(M):
    l, r, s = M.decompose()
    return Matrix.LocRotScale(l, r, None)


def mat(loc, R):
    return Matrix.Translation(loc) @ R.to_4x4()


def base_xyz(x, y, z):
    return Matrix((x, y, z)).transposed()


def quadro_z(z, ref):
    """Rotacao com Z = z e X o mais perto possivel de ref."""
    z = z.normalized()
    x = ref - z * ref.dot(z)
    if x.length < 1e-6:
        x = Vector((1, 0, 0)) - z * z.x
    x.normalize()
    return base_xyz(x, z.cross(x), z)


def oculto(M):
    l, r, s = M.decompose()
    return Matrix.LocRotScale(l, r, Vector((ESCONDIDO,) * 3))


def mistura(Ma, Mb, w):
    la, qa, sa = Ma.decompose()
    lb, qb, sb = Mb.decompose()
    return Matrix.LocRotScale(la.lerp(lb, w), qa.slerp(qb, w), sa.lerp(sb, w))


def colecao(nome):
    c = bpy.data.collections.get(nome) or bpy.data.collections.new(nome)
    if c.name not in SC.collection.children:
        SC.collection.children.link(c)
    return c


def apagar_dados(d):
    if d is None or d.users:
        return
    for bloco in (bpy.data.meshes, bpy.data.lights, bpy.data.cameras, bpy.data.curves):
        if bloco.get(d.name) == d:
            bloco.remove(d)
            return


def limpar():
    for nome in COLS:
        c = bpy.data.collections.get(nome)
        if not c:
            continue
        for ob in list(c.objects):
            d = ob.data
            bpy.data.objects.remove(ob)
            apagar_dados(d)
    for nome in ("Cam_Analise",):
        ob = bpy.data.objects.get(nome)
        if ob:
            d = ob.data
            bpy.data.objects.remove(ob)
            apagar_dados(d)
    for a in list(bpy.data.actions):
        if a.users == 0 and a.name.endswith("_Acao"):
            bpy.data.actions.remove(a)
    for nome in ("FX_Fios_Fumaca", "FX_Baforada"):
        g = bpy.data.node_groups.get(nome)
        if g:
            bpy.data.node_groups.remove(g)


def novo_objeto(nome, dados, col):
    ob = bpy.data.objects.new(nome, dados)
    col.objects.link(ob)
    return ob


def mat_novo(nome):
    m = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
    m.use_nodes = True
    m.node_tree.nodes.clear()
    if m.animation_data:
        m.animation_data_clear()
    if m.node_tree.animation_data:
        m.node_tree.animation_data_clear()
    return m


class Nos:
    """Mini-DSL para montar arvores de nos (shader e geometry nodes)."""

    def __init__(self, arvore):
        self.t = arvore
        self.k = 0

    def no(self, tipo, **props):
        n = self.t.nodes.new(tipo)
        for k, v in props.items():
            setattr(n, k, v)
        n.location = ((self.k % 10) * 200.0, -(self.k // 10) * 260.0)
        self.k += 1
        return n

    def liga(self, a, b):
        self.t.links.new(a, b)

    def por(self, sock, v):
        if v is None:
            return
        if isinstance(v, bpy.types.NodeSocket):
            self.liga(v, sock)
        else:
            sock.default_value = v

    @staticmethod
    def ent(n, nome):
        for s in n.inputs:
            if s.name == nome and s.enabled:
                return s
        raise KeyError(nome)

    @staticmethod
    def sai(n, nome):
        for s in n.outputs:
            if s.name == nome and s.enabled:
                return s
        raise KeyError(nome)

    def m(self, op, a, b=None, c=None, clamp=False):
        n = self.no("ShaderNodeMath", operation=op, use_clamp=clamp)
        self.por(n.inputs[0], a)
        self.por(n.inputs[1], b)
        self.por(n.inputs[2], c)
        return n.outputs[0]

    def v(self, op, a, b=None, esc=None):
        n = self.no("ShaderNodeVectorMath", operation=op)
        self.por(n.inputs[0], a)
        self.por(n.inputs[1], b)
        if esc is not None:
            self.por(n.inputs[3], esc)
        return n.outputs["Value" if op in ("LENGTH", "DOT_PRODUCT", "DISTANCE") else "Vector"]

    def xyz(self, x, y, z):
        n = self.no("ShaderNodeCombineXYZ")
        for i, c in enumerate((x, y, z)):
            self.por(n.inputs[i], c)
        return n.outputs[0]

    def sep(self, vec):
        n = self.no("ShaderNodeSeparateXYZ")
        self.por(n.inputs[0], vec)
        return n.outputs

    def faixa(self, val, a, b, c=0.0, d=1.0, suave_=True):
        n = self.no("ShaderNodeMapRange", data_type='FLOAT', interpolation_type='SMOOTHSTEP' if suave_ else 'LINEAR')
        n.clamp = True
        for i, x in enumerate((val, a, b, c, d)):
            self.por(n.inputs[i], x)
        return n.outputs[0]

    def ruido(self, vec, w, escala=1.0, detalhe=2.0, rug=0.5):
        n = self.no("ShaderNodeTexNoise", noise_dimensions='4D')
        self.por(n.inputs["Vector"], vec)
        self.por(n.inputs["W"], w)
        n.inputs["Scale"].default_value = escala
        n.inputs["Detail"].default_value = detalhe
        n.inputs["Roughness"].default_value = rug
        return n


# ================================================================ chaves por quadro
def curva(act, caminho, i, f_ini, vals, grupo=None):
    fc = act.fcurves.new(caminho, index=i, action_group=grupo) if grupo else act.fcurves.new(caminho, index=i)
    n = len(vals)
    fc.keyframe_points.add(n)
    co = [0.0] * (2 * n)
    for k, v in enumerate(vals):
        co[2 * k] = f_ini + k
        co[2 * k + 1] = v
    fc.keyframe_points.foreach_set("co", co)
    fc.keyframe_points.foreach_set("interpolation", [1] * n)       # LINEAR
    fc.update()


def acao(id_, nome):
    ad = id_.animation_data_create()
    ad.action = bpy.data.actions.new(nome + "_Acao")
    return ad.action


def gravar(ob, mats, extra=None):
    """mats: matriz de mundo por quadro (F0..F1). extra: {data_path: valores} (props custom do objeto)."""
    ob.rotation_mode = 'QUATERNION'
    act = acao(ob, ob.name)
    canais = {}
    qa = None
    for M in mats:
        l, q, s = M.decompose()
        if qa is not None and q.dot(qa) < 0:
            q.negate()
        qa = q
        for i in range(3):
            canais.setdefault(("location", i), []).append(l[i])
            canais.setdefault(("scale", i), []).append(s[i])
        for i in range(4):
            canais.setdefault(("rotation_quaternion", i), []).append(q[i])
    for (cam, i), vals in canais.items():
        curva(act, cam, i, F0, vals, "Object Transforms")
    for cam, vals in (extra or {}).items():
        curva(act, cam, 0, F0, vals)


# ================================================================ manequim de referencia
def manequim():
    col = colecao("Manequim_Referencia")

    def mat_simples(nome, cor, rough):
        m = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
        m.use_nodes = True
        bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = (*cor, 1)
        bsdf.inputs["Roughness"].default_value = rough
        m.diffuse_color = (*cor, 1)
        return m

    MATS = [mat_simples("Manequim_Pele", (0.55, 0.38, 0.29), 0.55), mat_simples("Manequim_Camisa", (0.10, 0.13, 0.19), 0.8),
            mat_simples("Manequim_Calca", (0.07, 0.08, 0.11), 0.85), mat_simples("Manequim_Sapato", (0.03, 0.025, 0.02), 0.4)]
    PELE, CAMISA, CALCA, SAPATO = range(4)

    def W(n):
        b = ARM.data.bones["mixamorig:" + n]
        return MW @ b.head_local, MW @ b.tail_local

    def dir_z(d):
        return d.normalized().to_track_quat('Z', 'Y').to_matrix()

    def elips(bm, c, r, mi, rot=None, segs=20, aneis=12):
        g = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=aneis, radius=1.0)
        R = rot if rot is not None else Matrix.Identity(3)
        bmesh.ops.transform(bm, matrix=Matrix.Translation(c) @ R.to_4x4() @ Matrix.Diagonal((*r, 1)), verts=g["verts"])
        for f in {f for v in g["verts"] for f in v.link_faces}:
            f.material_index = mi

    def capsula(bm, p0, p1, r0, r1, mi, segs=14):
        g = bmesh.ops.create_cone(bm, cap_ends=False, segments=segs, radius1=r0, radius2=r1, depth=(p1 - p0).length)
        bmesh.ops.transform(bm, matrix=Matrix.Translation((p0 + p1) / 2) @ dir_z(p1 - p0).to_4x4(), verts=g["verts"])
        for f in {f for v in g["verts"] for f in v.link_faces}:
            f.material_index = mi
        elips(bm, p0, (r0, r0, r0), mi, segs=segs, aneis=8)
        elips(bm, p1, (r1, r1, r1), mi, segs=segs, aneis=8)

    def peca(osso, constroi):
        bm = bmesh.new()
        constroi(bm)
        me = bpy.data.meshes.new("Man_" + osso)
        bm.to_mesh(me)
        bm.free()
        for m in MATS:
            me.materials.append(m)
        for p in me.polygons:
            p.use_smooth = True
        ob = novo_objeto("Man_" + osso, me, col)
        b = ARM.data.bones["mixamorig:" + osso]
        ob.parent = ARM
        ob.parent_type = 'BONE'
        ob.parent_bone = b.name
        ob.matrix_parent_inverse = (MW @ b.matrix_local @ Matrix.Translation((0, b.length, 0))).inverted()
        ob.matrix_basis = Matrix.Identity(4)
        ob.hide_select = True

    peca("Hips", lambda bm: elips(bm, Vector((0, 0.005, 0.99)), (0.165, 0.115, 0.11), CALCA))
    peca("Spine", lambda bm: elips(bm, Vector((0, -0.005, 1.16)), (0.150, 0.105, 0.10), CAMISA))
    peca("Spine1", lambda bm: elips(bm, Vector((0, -0.012, 1.29)), (0.158, 0.110, 0.11), CAMISA))
    peca("Spine2", lambda bm: elips(bm, Vector((0, -0.020, 1.43)), (0.175, 0.115, 0.12), CAMISA))
    peca("Neck", lambda bm: capsula(bm, Vector((0, -0.022, 1.50)), Vector((0, -0.030, 1.62)), 0.052, 0.048, PELE))

    def cabeca(bm):
        elips(bm, Vector((0, -0.035, 1.728)), (0.084, 0.100, 0.132), PELE)          # cranio
        elips(bm, Vector((0, -0.078, 1.612)), (0.056, 0.056, 0.040), PELE)          # mandibula
        elips(bm, Vector((0, -0.137, 1.676)), (0.012, 0.020, 0.017), PELE)          # nariz
        elips(bm, Vector((0, -0.127, 1.629)), (0.024, 0.008, 0.0065), PELE)         # labios
        for sx in (-1, 1):
            elips(bm, Vector((0.033 * sx, -0.131, 1.712)), (0.012, 0.006, 0.008), SAPATO)   # olhos
            elips(bm, Vector((0.082 * sx, -0.030, 1.700)), (0.012, 0.022, 0.030), PELE)     # orelhas
        elips(bm, Vector((0, -0.020, 1.785)), (0.088, 0.102, 0.095), SAPATO)        # cabelo
    peca("Head", cabeca)

    for s in ("Left", "Right"):
        h, t = W(s + "Shoulder")
        peca(s + "Shoulder", lambda bm, h=h, t=t: capsula(bm, h + Vector((0, 0, -0.01)), t, 0.06, 0.058, CAMISA))
        h, t = W(s + "Arm")
        peca(s + "Arm", lambda bm, h=h, t=t: capsula(bm, h, t, 0.055, 0.042, CAMISA))
        h, t = W(s + "ForeArm")

        def antebraco(bm, h=h, t=t):
            capsula(bm, h, t - (t - h).normalized() * 0.03, 0.042, 0.032, CAMISA)
            capsula(bm, t - (t - h).normalized() * 0.035, t, 0.032, 0.028, PELE)
        peca(s + "ForeArm", antebraco)
        h, t = W(s + "Hand")
        i1 = W(s + "HandIndex1")[0]
        peca(s + "Hand", lambda bm, h=h, i1=i1: elips(bm, h.lerp(i1, 0.55), (0.068, 0.046, 0.020), PELE))
        for dedo in ("Thumb", "Index"):
            for k in (1, 2, 3):
                h = W("%sHand%s%d" % (s, dedo, k))[0]
                t4 = W("%sHand%s%d" % (s, dedo, k + 1))[0]

                def falange(bm, h=h, t4=t4, dedo=dedo):
                    if dedo == "Index":
                        # "luva" de quatro dedos: o esqueleto so tem a cadeia do indicador
                        for off in (-0.024, -0.008, 0.008, 0.024):
                            rr = 0.0095 if abs(off) < 0.02 else 0.0085
                            capsula(bm, h + Vector((0, off, 0)), t4 + Vector((0, off, 0)), rr, rr * 0.95, PELE, segs=10)
                    else:
                        capsula(bm, h, t4, 0.012, 0.010, PELE, segs=10)
                peca("%sHand%s%d" % (s, dedo, k), falange)
        h, t = W(s + "UpLeg")
        peca(s + "UpLeg", lambda bm, h=h, t=t: capsula(bm, h + Vector((0, 0, -0.02)), t, 0.085, 0.060, CALCA))
        h, t = W(s + "Leg")
        peca(s + "Leg", lambda bm, h=h, t=t: capsula(bm, h, t, 0.058, 0.042, CALCA))
        h, t = W(s + "Foot")

        def pe(bm, h=h, t=t):
            d = t - h
            d.z = 0
            c = Vector((h.x, h.y, 0.05)).lerp(Vector((t.x, t.y, 0.045)), 0.45)
            elips(bm, c, (0.045, 0.040, 0.13), SAPATO, rot=dir_z(d), segs=16, aneis=10)
        peca(s + "Foot", pe)
        h, t = W(s + "ToeBase")

        def dedao(bm, h=h, t=t):
            d = t - h
            d.z = 0
            elips(bm, h.lerp(t, 0.5) + Vector((0, 0, 0.028)), (0.043, 0.028, 0.065), SAPATO, rot=dir_z(d), segs=16, aneis=10)
        peca(s + "ToeBase", dedao)


# ================================================================ leitura da pose
OSSOS = ["Head", "LeftHand", "RightHand", "RightHandIndex1", "RightHandIndex3", "RightHandIndex4", "RightHandThumb4",
         "LeftHandThumb4", "LeftHandIndex4", "RightFoot", "RightToeBase"]
REST = {n: nm(MW @ ARM.data.bones["mixamorig:" + n].matrix_local) for n in OSSOS}
POSE = {}


def ler_pose():
    atual = SC.frame_current
    for f in range(F0, F1 + 1):
        SC.frame_set(f)
        POSE[f] = {n: nm(MW @ ARM.pose.bones["mixamorig:" + n].matrix) for n in OSSOS}
    SC.frame_set(atual)


def rel(f, n):
    """Leva pontos da pose de repouso (mundo) para a pose do quadro f, presos ao osso n."""
    return POSE[f][n] @ REST[n].inverted()


def pt(f, n):
    return POSE[f][n].translation


# ================================================================ quadros dos props
LABIO = Vector((0.012, -0.130, 1.628))              # canto esquerdo da boca (pose de repouso da cabeca)
D_NAT = Vector((0.18, -0.92, -0.30)).normalized()   # cigarro na boca: para frente, um pouco para baixo e para a esquerda
LAB_EX = Vector((0.0, -0.134, 1.628))
D_EX = Vector((0.0, -0.95, -0.32)).normalized()     # baforada: para frente e um pouco para baixo
VG_P = Vector((-0.838, -0.038, 1.478))              # entre o indicador e o medio (repouso, mao direita em T)
VG_D = Vector((-0.42, 0.0, 0.906)).normalized()     # atravessa os dedos da palma para as costas da mao


def maco(f):
    a, c = pt(f, "LeftHandThumb4"), pt(f, "LeftHandIndex4")
    g = rel(f, "LeftHand").to_3x3() @ Vector((1, 0, 0))
    u = (c - a).normalized()
    z = (g - u * g.dot(u)).normalized()
    M = mat((a + c) / 2 - z * 0.012, base_xyz(u, z.cross(u), z))
    return M if 20 <= f <= 146 else oculto(M)


def isq_base(f):
    a, c = pt(f, "LeftHandThumb4"), pt(f, "LeftHandIndex4")
    g = rel(f, "LeftHand").to_3x3() @ Vector((1, 0, 0))
    u = (c - a).normalized()
    z = (g + Vector((0, 0, 0.6))).normalized()
    R = quadro_z(z, u)
    topo = (a + c) / 2 + z * 0.006
    return mat(topo - z * H_ISQ, R)


def isqueiro(f):
    M = isq_base(f)
    return M if 150 <= f <= 245 else oculto(M)


def chama_base(f):
    return isq_base(f) @ Vector((0, 0, H_ISQ + 0.001))


def cig_pinca(f):
    a, c = pt(f, "RightHandThumb4"), pt(f, "RightHandIndex4")
    g = (c - pt(f, "RightHandIndex3")).normalized()
    u = (c - a).normalized()
    ax = (g - u * g.dot(u)).normalized()
    palma = rel(f, "RightHand").to_3x3() @ Vector((0, 0, -1))
    m = (a + c) / 2 + palma * 0.003
    return mat(m + ax * 0.056, quadro_z(-ax, u))


def cig_boca(f):
    H = rel(f, "Head")
    lab = H @ LABIO
    d = (H.to_3x3() @ D_NAT).normalized()
    w = janela(f, 176, 188, 214, 226)                  # leva a ponta ate a chama enquanto acende
    if w > 0:
        d = d.lerp((chama_base(f) - lab).normalized(), w).normalized()
    return mat(lab - d * 0.007, quadro_z(d, H.to_3x3() @ Vector((1, 0, 0))))


def cig_v(f):
    M_rep = mat(VG_P - VG_D * 0.020, quadro_z(VG_D, Vector((0, 1, 0))))
    return rel(f, "RightHandIndex1") @ M_rep


QUEDA = {}


def preparar_queda():
    M0 = cig_v(SOLTA)
    p0 = M0.translation.copy()
    v = (cig_v(SOLTA + 1).translation - cig_v(SOLTA - 1).translation) / 2.0
    g = -9.81 / FPS ** 2
    a, b, c = 0.5 * g, v.z, p0.z - R_CIG
    T = (-b - math.sqrt(b * b - 4 * a * c)) / (2 * a)
    bola, pe = pt(396, "RightToeBase"), pt(396, "RightFoot")
    frente = Vector((bola.x - pe.x, bola.y - pe.y, 0)).normalized()
    alvo = bola + frente * 0.02
    vh = Vector((alvo.x - p0.x, alvo.y - p0.y, 0))
    yaw = math.atan2(vh.y, vh.x) + math.radians(70)
    z = Vector((math.cos(yaw), math.sin(yaw), 0))
    R_fim = base_xyz(Vector((0, 0, 1)), z.cross(Vector((0, 0, 1))), z)
    origem = Vector((alvo.x, alvo.y, R_CIG)) - z * (L_CIG / 2)
    fwd_rep = REST["RightToeBase"].translation - REST["RightFoot"].translation
    QUEDA.update(M0=M0, p0=p0, v=v, g=g, T=T, vh=vh / T, z=z, R_fim=R_fim, origem=origem, frente_rep=fwd_rep)


def yaw_pe(f):
    d = rel(f, "RightFoot").to_3x3() @ QUEDA["frente_rep"]
    return math.atan2(d.y, d.x)


def cig_chao(f):
    Q = QUEDA
    t = f - SOLTA
    if t <= Q["T"]:
        s = t / Q["T"]
        p = Q["p0"] + Q["vh"] * t + Vector((0, 0, Q["v"].z * t + 0.5 * Q["g"] * t * t))
        p.z = max(p.z, R_CIG)
        q = Q["M0"].to_quaternion().slerp(Q["R_fim"].to_quaternion(), suave(s))
        q = q @ Quaternion((1, 0, 0), 2 * math.pi * 1.0 * s)
        fim = Q["origem"]
        p = p.lerp(fim, suave((s - 0.8) / 0.2))          # encaixa no ponto de pouso
        return Matrix.LocRotScale(p, q, None)
    R = Q["R_fim"].copy()
    centro = Q["origem"] + Q["z"] * (L_CIG / 2)
    tq = f - SOLTA - Q["T"]
    pulo = 0.006 * math.sin(math.pi * min(tq, 5) / 5) if tq < 5 else 0.0
    sx = sy = 1.0
    if f >= PISA:
        k = suave((f - PISA) / 3.0)
        sx, sy = 1 - 0.58 * k, 1 + 0.28 * k
        giro = (yaw_pe(min(f, 414)) - yaw_pe(PISA + 4)) * 0.6 if f > PISA + 4 else 0.0
        R = Matrix.Rotation(giro, 3, 'Z') @ R
    z = R.col[2].to_3d()
    origem = centro - z * (L_CIG / 2)
    origem.z = R_CIG * sx + pulo
    return mat(origem, R) @ Matrix.Diagonal((sx, sy, 1.0, 1.0))


def cig(f):
    if f < 38:
        return oculto(cig_pinca(38))
    if f < 108:
        return cig_pinca(f)
    if f < 118:
        return mistura(cig_pinca(f), cig_boca(f), suave((f - 108) / 10.0))
    if f < 251:
        return cig_boca(f)
    if f < 259:
        return mistura(cig_boca(f), cig_v(f), suave((f - 251) / 8.0))
    if f <= SOLTA:
        return cig_v(f)
    return cig_chao(f)


def ponta(f):
    return cig(f) @ Vector((0, 0, L_CIG + 0.0012))


# ---------------------------------------------------------------- intensidades
def brilho(f):
    if f < ACENDE:
        return 0.0
    v = (1.0 + 3.5 * tragada(f)) * (1.0 + 0.18 * ruido(f, 1, 0.31))
    if ACENDE <= f < ACENDE + 22:
        v = max(v, 2.5 * janela(f, ACENDE, ACENDE + 2, ACENDE + 6, ACENDE + 22) + 1.0)
    return v * suave((f - ACENDE) / 3.0) * (1.0 - suave((f - PISA) / 4.0))


def inten_ponta(f):
    if f < ACENDE + 2:
        return 0.0
    if f >= PISA:
        return 1.6 * janela(f, PISA, PISA + 1, PISA + 3, PISA + 9)
    return (1.0 - 0.65 * tragada(f)) * suave((f - ACENDE - 2) / 6.0)


def inten_boca(f):
    return max(k * janela(f, a, b, c, d) for a, b, c, d, k in BAFORADAS)


def chama_on(f):
    a, b = CHAMA
    return suave((f - a) / 2.0) * (1.0 - suave((f - (b - 2)) / 2.5))


def chama(f):
    e = chama_on(f)
    base = chama_base(f)
    if e < 1e-3:
        return oculto(mat(base, Matrix.Identity(3)))
    puxa = tragada(f)
    d = Vector((0, 0, 1)) + (ponta(f) - base).normalized() * 1.3 * puxa
    d += Vector((ruido(f, 3, 0.9), ruido(f, 4, 0.9), 0)) * 0.12
    alto = e * (1 + 0.16 * ruido(f, 5, 1.1)) * (1 + 0.35 * puxa)
    larg = e * (1 + 0.07 * ruido(f, 6, 1.3))
    return mat(base, quadro_z(d, Vector((1, 0, 0)))) @ Matrix.Diagonal((larg, larg, alto, 1.0))


def boca_ex(f):
    H = rel(f, "Head")
    return H @ LAB_EX, (H.to_3x3() @ D_EX).normalized()


# ================================================================ malhas dos props
def cil(bm, r, z0, z1, mi, segs=16, tampa0=None, tampa1=None, sx=1.0, sy=1.0):
    v0 = [bm.verts.new((r * sx * math.cos(2 * math.pi * i / segs), r * sy * math.sin(2 * math.pi * i / segs), z0)) for i in range(segs)]
    v1 = [bm.verts.new((r * sx * math.cos(2 * math.pi * i / segs), r * sy * math.sin(2 * math.pi * i / segs), z1)) for i in range(segs)]
    for i in range(segs):
        f = bm.faces.new((v0[i], v0[(i + 1) % segs], v1[(i + 1) % segs], v1[i]))
        f.material_index = mi
        f.smooth = True
    if tampa0 is not None:
        bm.faces.new(list(reversed(v0))).material_index = tampa0
    if tampa1 is not None:
        bm.faces.new(v1).material_index = tampa1
    return v0, v1


def revolve(bm, perfil, mi, segs=14):
    aneis = []
    for r, z in perfil:
        if r < 1e-6:
            aneis.append([bm.verts.new((0, 0, z))])
        else:
            aneis.append([bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z)) for i in range(segs)])
    for A, B in zip(aneis, aneis[1:]):
        for i in range(segs):
            if len(A) == 1:
                f = bm.faces.new((A[0], B[(i + 1) % segs], B[i]))
            elif len(B) == 1:
                f = bm.faces.new((A[i], A[(i + 1) % segs], B[0]))
            else:
                f = bm.faces.new((A[i], A[(i + 1) % segs], B[(i + 1) % segs], B[i]))
            f.material_index = mi
            f.smooth = True


def caixa(bm, c, tam, mi, bisel=0.0):
    g = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(c) @ Matrix.Diagonal((*tam, 1)), verts=g["verts"])
    faces = {f for v in g["verts"] for f in v.link_faces}
    for f in faces:
        f.material_index = mi
    if bisel > 0:
        arestas = list({e for f in faces for e in f.edges})
        res = bmesh.ops.bevel(bm, geom=arestas, offset=bisel, segments=2, profile=0.5, affect='EDGES')
        for f in res["faces"]:
            f.material_index = mi
            f.smooth = True


def fazer_malha(nome, mats, constroi):
    bm = bmesh.new()
    constroi(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    return me


# ================================================================ materiais
def principled(nome, cor, rough=0.5, metal=0.0, coat=0.0):
    m = mat_novo(nome)
    nos = m.node_tree.nodes
    out = nos.new("ShaderNodeOutputMaterial")
    b = nos.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*cor, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Coat Weight"].default_value = coat
    m.node_tree.links.new(b.outputs[0], out.inputs["Surface"])
    m.diffuse_color = (*cor, 1)
    return m, b


def mat_filtro():
    m, b = principled("Cig_Filtro", (0.80, 0.50, 0.22), 0.65)
    N = Nos(m.node_tree)
    tc = N.no("ShaderNodeTexCoord")
    nz = N.no("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 900.0
    nz.inputs["Detail"].default_value = 2.0
    N.liga(tc.outputs["Object"], nz.inputs["Vector"])
    mx = N.no("ShaderNodeMix", data_type='RGBA')
    N.liga(N.faixa(nz.outputs["Fac"], 0.45, 0.62), N.ent(mx, "Factor"))
    N.ent(mx, "A").default_value = (0.82, 0.52, 0.24, 1)
    N.ent(mx, "B").default_value = (0.55, 0.30, 0.11, 1)
    N.liga(N.sai(mx, "Result"), b.inputs["Base Color"])
    return m


def mat_brasa():
    m, b = principled("Brasa", (0.1, 0.09, 0.085), 0.95)
    N = Nos(m.node_tree)
    tc = N.no("ShaderNodeTexCoord")
    at = N.no("ShaderNodeAttribute", attribute_type='OBJECT', attribute_name="brilho")
    nz = N.no("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 1400.0
    nz.inputs["Detail"].default_value = 3.0
    N.liga(tc.outputs["Object"], nz.inputs["Vector"])
    trinca = N.faixa(nz.outputs["Fac"], 0.47, 0.60)
    z = N.sep(tc.outputs["Object"])[2]
    anel = N.faixa(z, L_CIG - 0.0034, L_CIG - 0.0012, 1.0, 0.0)
    forca = N.m('MULTIPLY', at.outputs["Fac"], N.m('ADD', N.m('ADD', N.m('MULTIPLY', trinca, 0.9), anel), 0.12))
    N.liga(N.m('MULTIPLY', forca, 7.0), b.inputs["Emission Strength"])
    b.inputs["Emission Color"].default_value = (1.0, 0.27, 0.035, 1)
    mx = N.no("ShaderNodeMix", data_type='RGBA')
    N.liga(N.faixa(nz.outputs["Fac"], 0.35, 0.65), N.ent(mx, "Factor"))
    N.ent(mx, "A").default_value = (0.05, 0.045, 0.042, 1)
    N.ent(mx, "B").default_value = (0.42, 0.41, 0.39, 1)
    N.liga(N.sai(mx, "Result"), b.inputs["Base Color"])
    return m


def transparente(m, cor_viewport):
    # HASHED e nao BLEND: no EEVEE 4.0 o desfoque (DOF) da camera estoura a tela em branco com materiais BLEND
    m.blend_method = 'HASHED'
    m.shadow_method = 'NONE'
    m.use_backface_culling = False
    m.diffuse_color = cor_viewport               # no modo solido aparece translucido


def mat_chama():
    m = mat_novo("Chama")
    transparente(m, (1.0, 0.7, 0.3, 0.8))
    N = Nos(m.node_tree)
    out = N.no("ShaderNodeOutputMaterial")
    tc = N.no("ShaderNodeTexCoord")
    h = N.m('DIVIDE', N.sep(tc.outputs["Object"])[2], 0.029)
    rampa = N.no("ShaderNodeValToRGB")
    N.liga(h, rampa.inputs["Fac"])
    els = rampa.color_ramp.elements
    els[0].position, els[0].color = 0.0, (0.10, 0.25, 1.0, 1)
    els[1].position, els[1].color = 1.0, (1.0, 0.30, 0.06, 1)
    for pos, cor in ((0.20, (0.30, 0.40, 1.0, 1)), (0.32, (1.0, 0.80, 0.40, 1)), (0.70, (1.0, 0.55, 0.16, 1))):
        e = els.new(pos)
        e.color = cor
    lw = N.no("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.35
    borda = N.m('POWER', N.m('SUBTRACT', 1.0, lw.outputs["Facing"]), 1.4)
    alfa = N.m('MULTIPLY', borda, N.m('MULTIPLY', N.faixa(h, 0.0, 0.25, 0.35, 1.0), N.faixa(h, 0.7, 1.0, 1.0, 0.0)), clamp=True)
    em = N.no("ShaderNodeEmission")
    em.inputs["Strength"].default_value = 14.0
    N.liga(rampa.outputs["Color"], em.inputs["Color"])
    tr = N.no("ShaderNodeBsdfTransparent")
    mix = N.no("ShaderNodeMixShader")
    N.liga(alfa, mix.inputs[0])
    N.liga(tr.outputs[0], mix.inputs[1])
    N.liga(em.outputs[0], mix.inputs[2])
    N.liga(mix.outputs[0], out.inputs["Surface"])
    return m


def mat_fio():
    m = mat_novo("Fumaca_Fio")
    transparente(m, (0.85, 0.86, 0.9, 0.25))
    N = Nos(m.node_tree)
    out = N.no("ShaderNodeOutputMaterial")

    def attr(nome):
        return N.no("ShaderNodeAttribute", attribute_type='GEOMETRY', attribute_name=nome).outputs["Fac"]
    idade, inten, nasc = attr("idade"), attr("inten"), attr("nasc")
    lw = N.no("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.5
    miolo = N.m('POWER', N.m('SUBTRACT', 1.0, lw.outputs["Facing"], clamp=True), 1.8)
    nasce = N.faixa(idade, 0.0, 0.02)
    some = N.m('POWER', N.faixa(idade, 0.12, 0.9, 1.0, 0.0), 1.5)
    # falhas que andam com a fumaca (nasc) e se abrem com a idade: o fio vira fiapos
    nz = N.ruido(N.xyz(N.m('MULTIPLY', nasc, 0.09), N.m('MULTIPLY', idade, 2.0), 0.0), 0.0, escala=1.0, detalhe=2.0)
    nz2 = N.ruido(N.xyz(N.m('MULTIPLY', nasc, 0.4), N.m('MULTIPLY', idade, 6.0), 3.0), 0.0, escala=1.0, detalhe=1.0)
    falhas = N.m('MULTIPLY', N.faixa(nz.outputs["Fac"], 0.35, 0.65, 0.05, 1.3),
                 N.faixa(nz2.outputs["Fac"], N.m('MULTIPLY', idade, 0.45), N.m('ADD', N.m('MULTIPLY', idade, 0.45), 0.2), 0.0, 1.0))
    alfa = N.m('MULTIPLY', N.m('MINIMUM', inten, 1.0), N.m('MULTIPLY', nasce, some))
    alfa = N.m('MULTIPLY', alfa, N.m('MULTIPLY', miolo, falhas))
    alfa = N.m('MULTIPLY', alfa, 0.5, clamp=True)
    cor = (0.78, 0.80, 0.85, 1)
    tl = N.no("ShaderNodeBsdfTranslucent")
    tl.inputs["Color"].default_value = cor
    df = N.no("ShaderNodeBsdfDiffuse")
    df.inputs["Color"].default_value = cor
    lit = N.no("ShaderNodeMixShader")
    lit.inputs[0].default_value = 0.45
    N.liga(tl.outputs[0], lit.inputs[1])
    N.liga(df.outputs[0], lit.inputs[2])
    tr = N.no("ShaderNodeBsdfTransparent")
    mix = N.no("ShaderNodeMixShader")
    N.liga(alfa, mix.inputs[0])
    N.liga(tr.outputs[0], mix.inputs[1])
    N.liga(lit.outputs[0], mix.inputs[2])
    N.liga(mix.outputs[0], out.inputs["Surface"])
    return m


def mat_baforada():
    m = mat_novo("Fumaca_Baforada")
    N = Nos(m.node_tree)
    out = N.no("ShaderNodeOutputMaterial")
    pv = N.no("ShaderNodeVolumePrincipled")
    pv.inputs["Color"].default_value = (0.82, 0.82, 0.84, 1)
    pv.inputs["Anisotropy"].default_value = 0.35
    geo = N.no("ShaderNodeNewGeometry")                 # posicao de mundo (o objeto e uma malha vazia: sem espaco de textura)
    nz = N.ruido(geo.outputs["Position"], 0.0, escala=32.0, detalhe=6.0, rug=0.62)
    fc = nz.inputs["W"].driver_add("default_value")
    fc.driver.expression = "frame/40"
    fios = N.faixa(nz.outputs["Fac"], 0.42, 0.66)
    N.liga(N.m('MULTIPLY', fios, 4.0), pv.inputs["Density"])
    N.liga(pv.outputs[0], out.inputs["Volume"])
    return m


# ================================================================ props
def criar_props():
    col = colecao("Props_Fumar")
    papel, _ = principled("Cig_Papel", (0.92, 0.91, 0.87), 0.55)
    anel, _ = principled("Cig_Anel", (0.83, 0.66, 0.30), 0.35, 0.6)
    tabaco, _ = principled("Cig_Tabaco", (0.30, 0.17, 0.07), 0.9)
    filtro = mat_filtro()

    def cigarro(bm):
        cil(bm, R_CIG, 0.0, 0.024, 0, segs=18, tampa0=0)
        cil(bm, R_CIG * 1.01, 0.0236, 0.0244, 2, segs=18)
        cil(bm, R_CIG, 0.024, L_CIG, 1, segs=18, tampa1=3)
    ob_cig = novo_objeto("Prop_Cigarro", fazer_malha("Prop_Cigarro", [filtro, papel, anel, tabaco], cigarro), col)

    def brasa(bm):
        z0 = L_CIG - 0.0035
        perfil = [(R_CIG * 1.03, z0), (R_CIG * 1.04, L_CIG - 0.0004), (R_CIG * 0.9, L_CIG + 0.0006),
                  (R_CIG * 0.55, L_CIG + 0.0012), (0.0, L_CIG + 0.0014)]
        revolve(bm, perfil, 0, segs=18)
    ob_brasa = novo_objeto("Prop_Brasa", fazer_malha("Prop_Brasa", [mat_brasa()], brasa), col)
    ob_brasa["brilho"] = 0.0

    branco, _ = principled("Maco_Branco", (0.86, 0.85, 0.81), 0.35, coat=0.3)
    verm, _ = principled("Maco_Vermelho", (0.58, 0.04, 0.03), 0.3, coat=0.3)
    dourado, _ = principled("Maco_Dourado", (0.80, 0.62, 0.26), 0.3, 0.8)

    def maco_m(bm):
        caixa(bm, Vector((0, 0, -0.019)), (0.055, 0.022, 0.050), 0, 0.0012)
        caixa(bm, Vector((0, 0, 0.0255)), (0.0556, 0.0224, 0.037), 1, 0.0012)
        caixa(bm, Vector((0, 0, 0.0065)), (0.0558, 0.0226, 0.0015), 2)
    ob_maco = novo_objeto("Prop_Maco", fazer_malha("Prop_Maco", [branco, verm, dourado], maco_m), col)

    plast, _ = principled("Isqueiro_Plastico", (0.70, 0.06, 0.05), 0.28, coat=0.5)
    metal, _ = principled("Isqueiro_Metal", (0.72, 0.72, 0.74), 0.28, 1.0)
    preto, _ = principled("Isqueiro_Preto", (0.03, 0.03, 0.03), 0.5)

    def isq_m(bm):
        cil(bm, 0.012, 0.0, 0.058, 0, segs=24, tampa0=0, tampa1=0, sy=0.5)
        caixa(bm, Vector((0, 0, 0.064)), (0.022, 0.0112, 0.0125), 1, 0.0008)
        v0, v1 = cil(bm, 0.0046, -0.003, 0.003, 2, segs=14, tampa0=2, tampa1=2)
        bmesh.ops.transform(bm, matrix=Matrix.Translation((0.0035, 0, 0.0705)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'), verts=v0 + v1)
        caixa(bm, Vector((-0.0045, 0, 0.0595)), (0.009, 0.0124, 0.004), 0, 0.0008)
    ob_isq = novo_objeto("Prop_Isqueiro", fazer_malha("Prop_Isqueiro", [plast, metal, preto], isq_m), col)

    def chama_m(bm):
        revolve(bm, [(0.0, 0.0), (0.0032, 0.0018), (0.0044, 0.0055), (0.0042, 0.010), (0.0031, 0.017),
                     (0.0016, 0.023), (0.0, 0.029)], 0, segs=16)
    ob_chama = novo_objeto("Prop_Chama", fazer_malha("Prop_Chama", [mat_chama()], chama_m), col)

    luzes = {}
    # raios grandes de proposito: a luz fica a milimetros do papel/labios e uma luz pontual ali estoura a imagem
    for nome, cor, raio in (("Luz_Brasa", (1.0, 0.33, 0.07), 0.008), ("Luz_Chama", (1.0, 0.62, 0.26), 0.012)):
        ld = bpy.data.lights.new(nome, 'POINT')
        ld.color = cor
        ld.shadow_soft_size = raio
        ld.energy = 0.0
        ld.use_custom_distance = True
        ld.cutoff_distance = 2.0
        luzes[nome] = novo_objeto(nome, ld, col)
    for ob in (ob_cig, ob_brasa, ob_maco, ob_isq, ob_chama):
        ob["prop"] = True
    return ob_cig, ob_brasa, ob_maco, ob_isq, ob_chama, luzes


# ================================================================ arvores de fumaca (geometry nodes)
def interface(t, specs):
    t.interface.new_socket("Geometry", in_out='OUTPUT', socket_type='NodeSocketGeometry')
    for nome, tipo, val in specs:
        s = t.interface.new_socket(nome, in_out='INPUT', socket_type=tipo)
        if val is not None:
            s.default_value = val


def amostrar(N, traj, campo, tipo, indice):
    s = N.no("GeometryNodeSampleIndex", data_type=tipo, domain='POINT', clamp=True)
    N.liga(traj, s.inputs["Geometry"])
    N.liga(campo, N.ent(s, "Value"))
    N.liga(indice, s.inputs["Index"])
    return N.sai(s, "Value")


def trajeto(N, G, nasc):
    """Posicao, intensidade e direcao do emissor no quadro (fracionario) de nascimento da parcela."""
    info = N.no("GeometryNodeObjectInfo", transform_space='ORIGINAL')
    N.liga(G["Trajeto"], info.inputs["Object"])
    traj = info.outputs["Geometry"]
    idx = N.m('SUBTRACT', nasc, float(F0))
    i0 = N.m('FLOOR', idx)
    fr = N.m('SUBTRACT', idx, i0)
    i1 = N.m('ADD', i0, 1.0)
    pos = N.no("GeometryNodeInputPosition").outputs[0]
    a_in = N.no("GeometryNodeInputNamedAttribute", data_type='FLOAT')
    a_in.inputs["Name"].default_value = "inten"
    a_dir = N.no("GeometryNodeInputNamedAttribute", data_type='FLOAT_VECTOR')
    a_dir.inputs["Name"].default_value = "dir"

    def lerp_v(campo):
        p0, p1 = amostrar(N, traj, campo, 'FLOAT_VECTOR', i0), amostrar(N, traj, campo, 'FLOAT_VECTOR', i1)
        return N.v('ADD', p0, N.v('SCALE', N.v('SUBTRACT', p1, p0), esc=fr))
    n0 = amostrar(N, traj, N.sai(a_in, "Attribute"), 'FLOAT', i0)
    n1 = amostrar(N, traj, N.sai(a_in, "Attribute"), 'FLOAT', i1)
    inten = N.m('ADD', n0, N.m('MULTIPLY', N.m('SUBTRACT', n1, n0), fr))
    return lerp_v(pos), inten, lerp_v(N.sai(a_dir, "Attribute"))


def centrado(N, cor, k):
    return N.v('SCALE', N.v('SUBTRACT', cor, (0.5, 0.5, 0.5)), esc=k)


def arvore_fios():
    t = bpy.data.node_groups.new("FX_Fios_Fumaca", 'GeometryNodeTree')
    interface(t, [("Trajeto", 'NodeSocketObject', None), ("Vida", 'NodeSocketFloat', 96.0), ("Pontos", 'NodeSocketInt', 240),
                  ("Fios", 'NodeSocketInt', 3), ("Subida", 'NodeSocketFloat', 0.11), ("Aceleracao", 'NodeSocketFloat', 0.10),
                  ("Turbulencia", 'NodeSocketFloat', 0.10), ("Vento", 'NodeSocketVector', (0.03, 0.02, 0.0)),
                  ("Raio_Inicio", 'NodeSocketFloat', 0.0007), ("Raio_Fim", 'NodeSocketFloat', 0.016),
                  ("Material", 'NodeSocketMaterial', None)])
    N = Nos(t)
    G = N.no("NodeGroupInput").outputs
    go = N.no("NodeGroupOutput")
    linha = N.no("GeometryNodeCurvePrimitiveLine")
    linha.inputs["End"].default_value = (0, 0, 1)
    res = N.no("GeometryNodeResampleCurve", mode='COUNT')
    N.liga(linha.outputs[0], res.inputs["Curve"])
    N.liga(G["Pontos"], res.inputs["Count"])
    dup = N.no("GeometryNodeDuplicateElements", domain='SPLINE')
    N.liga(res.outputs[0], dup.inputs["Geometry"])
    N.liga(G["Fios"], dup.inputs["Amount"])
    st = N.no("GeometryNodeStoreNamedAttribute", data_type='INT', domain='CURVE')
    N.liga(dup.outputs["Geometry"], st.inputs["Geometry"])
    st.inputs["Name"].default_value = "fio"
    N.liga(dup.outputs["Duplicate Index"], N.ent(st, "Value"))
    geo = st.outputs[0]

    # cada ponto da curva e uma parcela de fumaca: idade cresce ao longo da curva, nasceu no quadro (agora - idade)
    sp = N.no("GeometryNodeSplineParameter")
    idade_q = N.m('MULTIPLY', sp.outputs["Index"], N.m('DIVIDE', G["Vida"], N.m('SUBTRACT', G["Pontos"], 1.0)))
    tseg = N.m('DIVIDE', idade_q, FPS)
    agora = N.no("GeometryNodeInputSceneTime").outputs["Frame"]
    nasc = N.m('SUBTRACT', agora, idade_q)
    P, inten, _ = trajeto(N, G, nasc)
    a_fio = N.no("GeometryNodeInputNamedAttribute", data_type='INT')
    a_fio.inputs["Name"].default_value = "fio"
    fio = N.sai(a_fio, "Attribute")

    sobe = N.m('ADD', N.m('MULTIPLY', G["Subida"], tseg), N.m('MULTIPLY', N.m('MULTIPLY', 0.5, G["Aceleracao"]), N.m('MULTIPLY', tseg, tseg)))
    desloc = N.v('ADD', N.v('SCALE', G["Vento"], esc=tseg), N.xyz(0.0, 0.0, sobe))
    x = N.m('DIVIDE', tseg, N.m('DIVIDE', G["Vida"], FPS))
    amp = N.m('MULTIPLY', G["Turbulencia"], N.m('POWER', x, 1.25))
    viz = N.xyz(N.m('MULTIPLY', nasc, 0.035), N.m('MULTIPLY', fio, 3.17), 0.0)
    r1 = N.ruido(viz, N.m('MULTIPLY', tseg, 0.45), escala=1.0, detalhe=1.0)
    r2 = N.ruido(viz, N.m('MULTIPLY', tseg, 0.90), escala=4.0, detalhe=2.0)
    turb = N.v('ADD', centrado(N, r1.outputs["Color"], 4.0), centrado(N, r2.outputs["Color"], 1.4))
    turb = N.v('SCALE', N.v('MULTIPLY', turb, (1.0, 1.0, 0.35)), esc=amp)
    ang = N.m('MULTIPLY', fio, 2.4)
    afasta = N.v('SCALE', N.xyz(N.m('COSINE', ang), N.m('SINE', ang), 0.0),
                 esc=N.m('MULTIPLY', N.m('MINIMUM', fio, 1.0), N.m('MULTIPLY', tseg, 0.03)))
    pos = N.v('ADD', N.v('ADD', P, desloc), N.v('ADD', turb, afasta))
    setp = N.no("GeometryNodeSetPosition")
    N.liga(geo, setp.inputs["Geometry"])
    N.liga(pos, setp.inputs["Position"])
    geo = setp.outputs[0]

    idade = N.m('DIVIDE', idade_q, G["Vida"])
    for nome, val in (("idade", idade), ("inten", N.m('MULTIPLY', inten, N.m('SUBTRACT', 1.0, N.m('MULTIPLY', fio, 0.28)))),
                      ("nasc", nasc)):
        s = N.no("GeometryNodeStoreNamedAttribute", data_type='FLOAT', domain='POINT')
        N.liga(geo, s.inputs["Geometry"])
        s.inputs["Name"].default_value = nome
        N.liga(val, N.ent(s, "Value"))
        geo = s.outputs[0]
    raio = N.m('ADD', G["Raio_Inicio"], N.m('MULTIPLY', N.m('SUBTRACT', G["Raio_Fim"], G["Raio_Inicio"]), N.m('POWER', idade, 1.25)))
    sr = N.no("GeometryNodeSetCurveRadius")
    N.liga(geo, sr.inputs["Curve"])
    N.liga(raio, sr.inputs["Radius"])
    # tira os trechos sem fumaca (antes de acender / depois de apagar); depois daqui nada pode depender do indice
    a_int = N.no("GeometryNodeInputNamedAttribute", data_type='FLOAT')
    a_int.inputs["Name"].default_value = "inten"
    apaga = N.no("GeometryNodeDeleteGeometry", domain='POINT')
    N.liga(sr.outputs[0], apaga.inputs["Geometry"])
    N.liga(N.m('LESS_THAN', N.sai(a_int, "Attribute"), 0.004), apaga.inputs["Selection"])
    circ = N.no("GeometryNodeCurvePrimitiveCircle", mode='RADIUS')
    circ.inputs["Resolution"].default_value = 7
    circ.inputs["Radius"].default_value = 1.0
    cm = N.no("GeometryNodeCurveToMesh")
    N.liga(apaga.outputs[0], cm.inputs["Curve"])
    N.liga(circ.outputs["Curve"], cm.inputs["Profile Curve"])
    ss = N.no("GeometryNodeSetShadeSmooth")
    N.liga(cm.outputs[0], ss.inputs["Geometry"])
    sm = N.no("GeometryNodeSetMaterial")
    N.liga(ss.outputs[0], sm.inputs["Geometry"])
    N.liga(G["Material"], sm.inputs["Material"])
    N.liga(sm.outputs[0], go.inputs[0])
    return t


def arvore_baforada():
    t = bpy.data.node_groups.new("FX_Baforada", 'GeometryNodeTree')
    interface(t, [("Trajeto", 'NodeSocketObject', None), ("Vida", 'NodeSocketFloat', 90.0), ("Taxa", 'NodeSocketInt', 16),
                  ("Velocidade", 'NodeSocketFloat', 1.1), ("Freio", 'NodeSocketFloat', 0.32), ("Abertura", 'NodeSocketFloat', 0.06),
                  ("Subida", 'NodeSocketFloat', 0.05), ("Aceleracao", 'NodeSocketFloat', 0.06), ("Turbulencia", 'NodeSocketFloat', 0.10),
                  ("Raio_Inicio", 'NodeSocketFloat', 0.012), ("Raio_Fim", 'NodeSocketFloat', 0.075),
                  ("Voxel", 'NodeSocketFloat', 0.005), ("Densidade", 'NodeSocketFloat', 1.0), ("Material", 'NodeSocketMaterial', None)])
    N = Nos(t)
    G = N.no("NodeGroupInput").outputs
    go = N.no("NodeGroupOutput")
    idx = N.no("GeometryNodeInputIndex").outputs[0]
    idade_q = N.m('DIVIDE', idx, G["Taxa"])
    agora = N.no("GeometryNodeInputSceneTime").outputs["Frame"]
    nasc = N.m('SUBTRACT', agora, idade_q)
    pid = N.m('ROUND', N.m('MULTIPLY', nasc, G["Taxa"]))          # identidade da parcela (fixa enquanto ela envelhece)
    P, inten, D = trajeto(N, G, nasc)
    tseg = N.m('DIVIDE', idade_q, FPS)
    anda = N.m('MULTIPLY', N.m('MULTIPLY', G["Velocidade"], G["Freio"]),
               N.m('SUBTRACT', 1.0, N.m('EXPONENT', N.m('DIVIDE', N.m('MULTIPLY', tseg, -1.0), G["Freio"]))))

    def aleat(tipo, semente, mn, mx):
        r = N.no("FunctionNodeRandomValue", data_type=tipo)
        N.por(N.ent(r, "Min"), mn)
        N.por(N.ent(r, "Max"), mx)
        N.liga(pid, r.inputs["ID"])
        r.inputs["Seed"].default_value = semente
        return N.sai(r, "Value")
    rv = aleat('FLOAT_VECTOR', 11, (-1.0, -1.0, -1.0), (1.0, 1.0, 1.0))
    rf = aleat('FLOAT', 5, 0.3, 1.0)
    rr = aleat('FLOAT', 7, 0.7, 1.3)
    espalha = N.v('SCALE', N.v('NORMALIZE', rv), esc=N.m('MULTIPLY', N.m('MULTIPLY', G["Abertura"], N.m('POWER', tseg, 0.75)), rf))
    sobe = N.m('ADD', N.m('MULTIPLY', G["Subida"], tseg), N.m('MULTIPLY', N.m('MULTIPLY', 0.5, G["Aceleracao"]), N.m('MULTIPLY', tseg, tseg)))
    nz = N.ruido(N.xyz(N.m('MULTIPLY', pid, 0.011), 0.0, 0.0), N.m('MULTIPLY', tseg, 0.6), escala=1.5, detalhe=2.0)
    turb = N.v('SCALE', centrado(N, nz.outputs["Color"], 4.0), esc=N.m('MULTIPLY', G["Turbulencia"], tseg))
    pos = N.v('ADD', N.v('ADD', P, N.v('SCALE', D, esc=anda)), N.v('ADD', espalha, N.v('ADD', turb, N.xyz(0.0, 0.0, sobe))))
    x = N.m('DIVIDE', idade_q, G["Vida"])
    raio = N.m('ADD', G["Raio_Inicio"], N.m('MULTIPLY', N.m('SUBTRACT', G["Raio_Fim"], G["Raio_Inicio"]), N.m('POWER', x, 0.6)))
    raio = N.m('MULTIPLY', raio, N.faixa(x, 0.62, 1.0, 1.0, 0.0))             # no fim da vida encolhe (se desfaz)
    # baforada fraca = nuvem menor, mas sem virar bolinhas soltas; abaixo de 0.06 nao sai nada
    tam = N.m('MULTIPLY', N.m('ADD', N.m('MULTIPLY', inten, 0.6), 0.55, clamp=True), N.m('GREATER_THAN', inten, 0.06))
    raio = N.m('MULTIPLY', N.m('MULTIPLY', raio, rr), tam)
    pts = N.no("GeometryNodePoints")
    N.liga(N.m('MULTIPLY', G["Vida"], G["Taxa"]), pts.inputs["Count"])
    N.liga(pos, pts.inputs["Position"])
    N.liga(raio, pts.inputs["Radius"])
    apaga = N.no("GeometryNodeDeleteGeometry", domain='POINT')
    N.liga(pts.outputs[0], apaga.inputs["Geometry"])
    N.liga(N.m('LESS_THAN', N.no("GeometryNodeInputRadius").outputs[0], 0.0015), apaga.inputs["Selection"])
    vol = N.no("GeometryNodePointsToVolume", resolution_mode='VOXEL_SIZE')
    N.liga(apaga.outputs[0], vol.inputs["Points"])
    N.liga(G["Densidade"], vol.inputs["Density"])
    N.liga(G["Voxel"], vol.inputs["Voxel Size"])
    N.liga(N.no("GeometryNodeInputRadius").outputs[0], vol.inputs["Radius"])
    sm = N.no("GeometryNodeSetMaterial")
    N.liga(vol.outputs[0], sm.inputs["Geometry"])
    N.liga(G["Material"], sm.inputs["Material"])
    N.liga(sm.outputs[0], go.inputs[0])
    return t


def objeto_gn(nome, arvore, valores, col):
    ob = novo_objeto(nome, bpy.data.meshes.new(nome), col)
    md = ob.modifiers.new("Fumaca", 'NODES')
    md.node_group = arvore
    for item in arvore.interface.items_tree:
        if item.item_type == 'SOCKET' and item.in_out == 'INPUT' and item.name in valores:
            md[item.identifier] = valores[item.name]
    return ob


def malha_trajeto(nome, pos, inten, dirs, col):
    me = bpy.data.meshes.new(nome)
    me.from_pydata([tuple(p) for p in pos], [], [])
    a = me.attributes.new("inten", 'FLOAT', 'POINT')
    a.data.foreach_set("value", inten)
    d = me.attributes.new("dir", 'FLOAT_VECTOR', 'POINT')
    d.data.foreach_set("vector", [c for v in dirs for c in v])
    ob = novo_objeto(nome, me, col)
    ob.hide_render = True
    ob.hide_set(True)
    return ob


def vazio_fx(nome, tipo, desc, col):
    e = novo_objeto(nome, None, col)
    e.empty_display_type = 'SINGLE_ARROW'
    e.empty_display_size = 0.05
    e["fx"] = tipo
    e["descricao"] = desc
    return e


# ================================================================ cena: luzes, chao, cameras, render
def mirar(ob, alvo):
    ob.rotation_euler = (Vector(alvo) - ob.location).to_track_quat('-Z', 'Y').to_euler()


def criar_cena(ob_cig):
    col = colecao("Cena_Fumar")
    for nome, tipo, tam, energia, cor, loc, alvo in (
            ("Luz_Chave", 'AREA', 0.7, 30.0, (1.0, 0.74, 0.50), (1.5, -1.4, 2.4), (0.05, -0.15, 1.45)),
            ("Luz_Recorte_Dir", 'AREA', 0.5, 70.0, (0.78, 0.87, 1.0), (-1.3, 1.1, 2.1), (0.0, -0.1, 1.45)),
            ("Luz_Recorte_Esq", 'AREA', 0.5, 45.0, (1.0, 0.82, 0.62), (1.4, 1.2, 1.9), (0.1, -0.1, 1.5)),
            ("Luz_Preenchimento", 'AREA', 1.5, 6.0, (0.55, 0.65, 0.95), (-1.6, -1.8, 1.3), (0.0, -0.1, 1.2)),
            ("Luz_Parede", 'SPOT', 0.15, 45.0, (1.0, 0.60, 0.32), (0.8, 0.6, 2.8), (0.6, 1.6, 1.4))):
        ld = bpy.data.lights.new(nome, tipo)
        ld.energy = energia
        ld.color = cor
        if tipo == 'AREA':
            ld.size = tam
        else:
            ld.shadow_soft_size = tam
            ld.spot_size = math.radians(70)
            ld.spot_blend = 0.6
        ob = novo_objeto(nome, ld, col)
        ob.location = loc
        mirar(ob, alvo)

    chao_m, b = principled("Chao_Bar", (0.055, 0.045, 0.038), 0.45)
    N = Nos(chao_m.node_tree)
    tc = N.no("ShaderNodeTexCoord")
    nz = N.no("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 3.0
    nz.inputs["Detail"].default_value = 8.0
    N.liga(tc.outputs["Object"], nz.inputs["Vector"])
    mx = N.no("ShaderNodeMix", data_type='RGBA')
    N.liga(nz.outputs["Fac"], N.ent(mx, "Factor"))
    N.ent(mx, "A").default_value = (0.035, 0.028, 0.024, 1)
    N.ent(mx, "B").default_value = (0.075, 0.062, 0.052, 1)
    N.liga(N.sai(mx, "Result"), b.inputs["Base Color"])
    N.liga(N.faixa(nz.outputs["Fac"], 0.3, 0.7, 0.35, 0.65), b.inputs["Roughness"])
    me = bpy.data.meshes.new("Chao")
    me.from_pydata([(-4, -4, 0), (4, -4, 0), (4, 4, 0), (-4, 4, 0)], [], [(0, 1, 2, 3)])
    me.materials.append(chao_m)
    novo_objeto("Chao", me, col)

    parede_m, b = principled("Parede_Tijolo", (0.12, 0.06, 0.045), 0.9)
    N = Nos(parede_m.node_tree)
    tc = N.no("ShaderNodeTexCoord")
    tj = N.no("ShaderNodeTexBrick")
    tj.inputs["Scale"].default_value = 1.0
    tj.inputs["Brick Width"].default_value = 0.22
    tj.inputs["Row Height"].default_value = 0.075
    tj.inputs["Mortar Size"].default_value = 0.008
    tj.inputs["Color1"].default_value = (0.13, 0.055, 0.035, 1)
    tj.inputs["Color2"].default_value = (0.09, 0.045, 0.032, 1)
    tj.inputs["Mortar"].default_value = (0.05, 0.045, 0.04, 1)
    mp = N.no("ShaderNodeMapping")
    N.liga(tc.outputs["Object"], mp.inputs["Vector"])
    mp.inputs["Rotation"].default_value = (math.pi / 2, 0, 0)
    N.liga(mp.outputs[0], tj.inputs["Vector"])
    N.liga(tj.outputs["Color"], b.inputs["Base Color"])
    me = bpy.data.meshes.new("Parede")
    me.from_pydata([(-4, 1.6, 0), (4, 1.6, 0), (4, 1.6, 3.5), (-4, 1.6, 3.5)], [], [(0, 1, 2, 3)])
    me.materials.append(parede_m)
    novo_objeto("Parede", me, col)

    w = SC.world or bpy.data.worlds.new("World")
    SC.world = w
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.006, 0.006, 0.007, 1)
    bg.inputs["Strength"].default_value = 1.0

    cams = {}
    cabeca = bpy.data.objects.get("Man_Head")
    for nome, loc, alvo, lente, fstop, foco in (
            ("Camera_Medio", (0.95, -1.95, 1.52), (0.05, -0.18, 1.33), 50, 2.8, cabeca),
            ("Camera_Perto", (-0.29, -0.71, 1.68), (0.11, -0.23, 1.52), 50, 2.0, ob_cig),     # cigarro de perfil ao acender
            ("Camera_Geral", (1.35, -3.10, 1.25), (-0.08, -0.20, 0.85), 35, 4.0, bpy.data.objects.get("Man_Hips"))):
        cd = bpy.data.cameras.new(nome)
        cd.lens = lente
        cd.dof.use_dof = True
        cd.dof.aperture_fstop = fstop
        cd.dof.focus_object = foco
        ob = novo_objeto(nome, cd, col)
        ob.location = loc
        mirar(ob, alvo)
        cams[nome] = ob
    for m in list(SC.timeline_markers):
        if m.name.startswith("Cam_"):
            SC.timeline_markers.remove(m)
    for f, nome in ((1, "Camera_Medio"), (168, "Camera_Perto"), (236, "Camera_Medio"), (338, "Camera_Geral"), (434, "Camera_Medio")):
        mk = SC.timeline_markers.new("Cam_" + nome.split("_")[1], frame=f)
        mk.camera = cams[nome]
    SC.camera = cams["Camera_Medio"]

    SC.frame_start, SC.frame_end = F0, F1
    ee = SC.eevee
    for k, v in (("taa_render_samples", 64), ("taa_samples", 16), ("use_soft_shadows", True), ("shadow_cube_size", '2048'),
                 ("shadow_cascade_size", '2048'), ("use_shadow_high_bitdepth", True), ("use_gtao", True), ("gtao_distance", 0.35),
                 ("use_bloom", True), ("bloom_threshold", 0.9), ("bloom_intensity", 0.03), ("bloom_radius", 5.5),
                 ("bloom_clamp", 4.0),
                 ("use_bokeh_jittered", True),       # o DOF normal do EEVEE 4.0 estoura em branco com o volume da baforada
                 ("volumetric_tile_size", '2'), ("volumetric_samples", 96), ("volumetric_start", 0.3), ("volumetric_end", 8.0),
                 ("use_volumetric_lights", True), ("use_volumetric_shadows", False)):
        try:
            setattr(ee, k, v)
        except (AttributeError, TypeError) as e:
            print("eevee", k, e)
    try:
        SC.cycles.transparent_max_bounces = 32
    except AttributeError:
        pass
    try:
        SC.view_settings.view_transform = 'AgX'
        SC.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError as e:
        print("cor", e)


# ================================================================ principal
def principal():
    limpar()
    manequim()
    ler_pose()
    preparar_queda()
    ob_cig, ob_brasa, ob_maco, ob_isq, ob_chama, luzes = criar_props()
    Q = range(F0, F1 + 1)

    m_cig = [cig(f) for f in Q]
    gravar(ob_cig, m_cig)
    gravar(ob_brasa, [M if f >= ACENDE else oculto(M) for f, M in zip(Q, m_cig)],
           {'["brilho"]': [brilho(f) for f in Q]})
    gravar(ob_maco, [maco(f) for f in Q])
    gravar(ob_isq, [isqueiro(f) for f in Q])
    gravar(ob_chama, [chama(f) for f in Q])

    pontas = [ponta(f) for f in Q]
    gravar(luzes["Luz_Brasa"], [Matrix.Translation(M @ Vector((0, 0, L_CIG + 0.009))) for M in m_cig])
    curva(acao(luzes["Luz_Brasa"].data, "Luz_Brasa_Dados"), "energy", 0, F0, [0.03 * brilho(f) for f in Q])
    gravar(luzes["Luz_Chama"], [Matrix.Translation(chama_base(f) + Vector((0, 0, 0.012))) for f in Q])
    curva(acao(luzes["Luz_Chama"].data, "Luz_Chama_Dados"), "energy", 0, F0,
          [0.4 * chama_on(f) * (1 + 0.2 * ruido(f, 8, 1.2)) for f in Q])

    # FX: vazios no padrao do 18 + trajetos para os geometry nodes
    col = colecao("FX_Fumar")
    ip = [inten_ponta(f) for f in Q]
    ib = [inten_boca(f) for f in Q]
    bocas = [boca_ex(f) for f in Q]
    e_p = vazio_fx("FX_Fumaca_Ponta", "fumaca", "Ponta do cigarro: emissor de fumaca; escala = intensidade", col)
    e_b = vazio_fx("FX_Fumaca_Boca", "fumaca_boca", "Boca: baforada; +Z = direcao, escala = intensidade", col)
    gravar(e_p, [Matrix.LocRotScale(p, None, Vector((max(i, ESCONDIDO),) * 3)) for p, i in zip(pontas, ip)])
    gravar(e_b, [Matrix.LocRotScale(p, quadro_z(d, Vector((1, 0, 0))).to_quaternion(), Vector((max(i, ESCONDIDO),) * 3))
                 for (p, d), i in zip(bocas, ib)])
    t_p = malha_trajeto("FX_Trajeto_Ponta", pontas, ip, [Vector((0, 0, 1))] * len(pontas), col)
    t_b = malha_trajeto("FX_Trajeto_Boca", [p for p, d in bocas], ib, [d for p, d in bocas], col)
    objeto_gn("Fumaca_Ponta", arvore_fios(), {"Trajeto": t_p, "Material": mat_fio()}, col)
    objeto_gn("Fumaca_Boca", arvore_baforada(), {"Trajeto": t_b, "Material": mat_baforada()}, col)

    criar_cena(ob_cig)

    # diagnostico
    salto = max((m_cig[k + 1].translation - m_cig[k].translation).length for k in range(37, SOLTA - F0))
    print("cigarro: maior salto entre quadros ate soltar = %.3f m" % salto)
    for f in (190, 196, 200, 206, 212):
        b = chama_base(f)
        print("quadro %d: chama-ponta %.3f m" % (f, (ponta(f) - b).length))
    print("queda: %.1f quadros, pousa em %s" % (QUEDA["T"], tuple(round(c, 3) for c in QUEDA["origem"])))
    SC.frame_set(205)


# ================================================================ export para o jogo (so em segundo plano: altera a cena)
def exportar():
    """bar_fumar_mixamo.glb no formato do 18: esqueleto (sem malha) + props + FX + clipe (faixa NLA) + extras para o JS."""
    os.makedirs(os.path.join(SAIDA, "fbx"), exist_ok=True)
    nomes = ["Prop_Maco", "Prop_Cigarro", "Prop_Brasa", "Prop_Isqueiro", "Prop_Chama", "FX_Fumaca_Ponta", "FX_Fumaca_Boca"]
    props = [bpy.data.objects[n] for n in nomes]

    # o glTF nao leva shader procedural nem a prop "brilho": materiais simples, emissivo fixo na brasa e na chama
    def simples(nome, cor, rough, emis=None, forca=0.0, alfa=1.0):
        m, b = principled(nome, cor, rough)
        if emis:
            b.inputs["Emission Color"].default_value = (*emis, 1)
            b.inputs["Emission Strength"].default_value = forca
        if alfa < 1:
            b.inputs["Alpha"].default_value = alfa
            m.blend_method = 'BLEND'
    simples("Cig_Filtro", (0.78, 0.48, 0.20), 0.7)
    simples("Brasa", (0.12, 0.11, 0.10), 0.95, (1.0, 0.30, 0.05), 5.0)
    simples("Chama", (1.0, 0.65, 0.25), 0.9, (1.0, 0.62, 0.22), 6.0, 0.85)

    # com o emissivo fixo, a brasa some quando o pe apaga o cigarro (fica a bituca)
    brasa = bpy.data.objects["Prop_Brasa"]
    velha = brasa.animation_data.action
    gravar(brasa, [M if ACENDE <= f < PISA + 4 else oculto(M) for f, M in ((f, cig(f)) for f in range(F0, F1 + 1))])
    bpy.data.actions.remove(velha)

    objs = [ARM] + props
    for o in objs:
        ad = o.animation_data
        act = ad.action
        ad.action = None
        for t in list(ad.nla_tracks):
            ad.nla_tracks.remove(t)
        t = ad.nla_tracks.new()
        t.name = CLIPE
        t.strips.new(CLIPE, int(act.frame_range[0]), act)
    SC.frame_set(F0)
    for o in props:                                 # repouso dos props no GLB = escondido (fora do clipe nao aparece)
        o.location, o.rotation_quaternion, o.scale = (0, 0, 0), (1, 0, 0, 0), (0, 0, 0)

    def faixa(a, b, osso):                          # quadros do JS comecam em 0
        return [a - F0, b - F0, osso]
    cig_seg = [faixa(38, 112, "RightHand"), faixa(114, 253, "Head"), faixa(257, SOLTA, "RightHand")]
    ossos = ARM.data.bones
    info = dict(grupo=CLIPE, fps=int(FPS), ancora=None, fonte="Mixamo Smoking.fbx",
                altura_m=round((MW @ ossos["mixamorig:HeadTop_End"].head_local).z, 3),
                quadril_m=round((MW @ ossos["mixamorig:Hips"].head_local).z, 3),
                # mira: no personagem real a mao do isqueiro nao cai no mesmo lugar; o JS gira o cigarro (pelo filtro) para a chama
                clipes={CLIPE: dict(quadros=F1 - F0 + 1, loop=False, fica=["Prop_Cigarro"],
                                    mira={"Prop_Cigarro": dict(faixas=[faixa(176, 226, "Prop_Chama")],
                                                               junto=["Prop_Brasa", "FX_Fumaca_Ponta"])},
                                    segue={"Prop_Maco": [faixa(20, 146, "LeftHand")], "Prop_Cigarro": cig_seg,
                                           "Prop_Brasa": cig_seg, "FX_Fumaca_Ponta": cig_seg,
                                           "Prop_Isqueiro": [faixa(150, 245, "LeftHand")], "Prop_Chama": [faixa(150, 245, "LeftHand")],
                                           "FX_Fumaca_Boca": [faixa(F0, F1, "Head")]})},
                props=nomes, fx={"FX_Fumaca_Ponta": "fumaca", "FX_Fumaca_Boca": "fumaca_boca"})
    SC["bar_animacoes"] = json.dumps(info, ensure_ascii=True)

    for o in SC.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = ARM
    out = os.path.join(SAIDA, "bar_%s.glb" % CLIPE)
    props_rna = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    op = dict(filepath=out, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='NLA_TRACKS',
              export_force_sampling=True, export_frame_step=1, export_anim_slide_to_zero=True, export_optimize_animation_size=False,
              export_optimize_animation_keep_anim_armature=True, export_optimize_animation_keep_anim_object=True,
              export_def_bones=False, export_skins=True, export_morph=False, export_materials='EXPORT', export_image_format='AUTO',
              export_cameras=False, export_lights=False, export_extras=True, export_yup=True, export_apply=False,
              export_texcoord=True, export_normals=True, will_save_settings=False)
    bpy.ops.export_scene.gltf(**{k: v for k, v in op.items() if k in props_rna})
    print("GLB", out, "%.0f KB" % (os.path.getsize(out) / 1024))
    fbx = os.path.join(SAIDA, "fbx", CLIPE + ".fbx")
    shutil.copy2(FBX_SMOKING, fbx)
    print("FBX", fbx, "(copia do Smoking.fbx: so o esqueleto, unidades do Mixamo)")
    print("extras", json.dumps({k: v for k, v in info.items() if k != "clipes"}))


principal()
if "--exportar" in ARGS:
    exportar()
