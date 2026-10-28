# Animacoes dos musicos do palco (violao, cavaquinho, bateria e vocal), 4 clipes por lugar:
#   <lugar>_sentar_pegar / _comecar_tocar / _tocando_loop / _parar_sair   (vocal: _chegar_pegar / _comecar_cantar / _cantando_loop)
# Esqueleto Mixamo das skins do jogo (41 ossos, dedos so polegar + indicador), autorado no rafael-mixamo.fbx com 1,75 m.
# Roda no Blender em SEGUNDO PLANO (nao mexe na cena aberta do mapa):
#   "D:\SteamLibrary\steamapps\common\Blender\blender.exe" -b --factory-startup -P 16_animacoes_palco.py -- [lugar ...] [--previa] [--sem-export]
# Le anim/palco_ref.blend (gravado pelo 15_palco.py: palco, instrumentos soltos e os vazios Palco_Lugar_*).
# Tudo e montado no espaco do lugar (vazio Palco_Lugar_X na origem, personagem olhando para -Y) e exportado assim:
#   export/animacoes/palco_<lugar>.glb   esqueleto (sem malha) + copia do instrumento (Prop_*) + os 4 clipes; cada clipe
#                                        anima ossos e instrumento juntos. O palco_musicos.js faz o retarget para a skin.
#   export/animacoes/fbx/<clipe>.fbx     so o esqueleto, na escala nativa do FBX do Mixamo (sem instrumento)
# Metodo: cada quadro e calculado em Python (quadril e coluna em FK, bracos e pernas com IK analitico de 2 ossos e polo,
# maos/pes orientados por vetores, dedos em FK) e gravado direto nas curvas; o instrumento e o "mestre" e as maos o seguem.
import bpy, math, os, sys
import numpy as np
from mathutils import Vector, Matrix, Quaternion

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ROOT = r"C:\Users\rafael\BarBoteco"
FBX = r"C:\Users\rafael\Desktop\BAR\2.0\skins\rafael\rafael-mixamo.fbx"
REF = os.path.join(ROOT, "anim", "palco_ref.blend")
SAIDA = os.path.join(ROOT, "export", "animacoes")
PREVIA = os.path.join(ROOT, "anim", "previa")
ALTURA = 1.75
FPS = 30
BPM = 100
BATIDA = FPS * 60.0 / BPM                      # 18 quadros por tempo
PFX = "mixamorig:"
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
# eixos (espaco do mundo, personagem olhando para -Y): inclinar p/ frente = +X | virar p/ esquerda = +Z | tombar p/ esquerda = +Y


# ------------------------------------------------------------------ utilidades
def lerp(a, b, t):
    return a + (b - a) * t


def suave(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def rampa(f, f0, f1):
    """0 antes de f0, 1 depois de f1, suave no meio."""
    return suave((f - f0) / float(f1 - f0)) if f1 > f0 else float(f >= f1)


def rot(eixo, graus):
    return Matrix.Rotation(math.radians(graus), 3, Vector(eixo))


def giro_z(graus):
    return rot(Z, graus)


def base(y, h):
    """Base ortonormal (colunas y, h, y x h) com y exato e h ortogonalizado."""
    y = Vector(y).normalized()
    h = Vector(h)
    h = (h - y * h.dot(y)).normalized()
    return Matrix((y, h, y.cross(h))).transposed()


def mat(pos, R):
    M = R.to_4x4() if R.__len__() == 3 else R.copy()
    M.translation = pos
    return M


def mistura_m(A, Bm, t):
    """Interpola duas matrizes 4x4 rigidas (posicao linear, rotacao slerp)."""
    if t <= 0:
        return A.copy()
    if t >= 1:
        return Bm.copy()
    qa, qb = A.to_quaternion(), Bm.to_quaternion()
    return mat(A.translation.lerp(Bm.translation, t), qa.slerp(qb, t).to_matrix())


class Trilha:
    """Chaves (quadro, valor) com interpolacao cubica (Hermite, tangentes Catmull-Rom sem passar do ponto).
    valor: float, Vector ou tupla. Chave com para=True tem tangente zero (para e recomeca)."""

    def __init__(self, *chaves):
        self.k = []
        for c in chaves:
            self.add(*c)

    def add(self, f, v, para=False):
        v = Vector(v) if isinstance(v, (tuple, list, Vector)) else float(v)
        self.k.append((float(f), v, para))
        self.k.sort(key=lambda c: c[0])
        return self

    def __call__(self, f):
        k = self.k
        if f <= k[0][0]:
            return k[0][1].copy() if isinstance(k[0][1], Vector) else k[0][1]
        if f >= k[-1][0]:
            return k[-1][1].copy() if isinstance(k[-1][1], Vector) else k[-1][1]
        i = max(j for j in range(len(k) - 1) if k[j][0] <= f)
        f0, v0, _ = k[i]
        f1, v1, _ = k[i + 1]
        h = f1 - f0
        t = (f - f0) / h
        m0, m1 = self._tan(i) * h, self._tan(i + 1) * h
        t2, t3 = t * t, t * t * t
        return v0 * (2 * t3 - 3 * t2 + 1) + m0 * (t3 - 2 * t2 + t) + v1 * (-2 * t3 + 3 * t2) + m1 * (t3 - t2)

    def _tan(self, i):
        k = self.k
        zero = k[i][1] * 0.0
        if k[i][2] or i == 0 or i == len(k) - 1:
            return zero
        (fa, va, _), (fb, vb, _), (fc, vc, _) = k[i - 1], k[i], k[i + 1]
        sa, sc = (vb - va) / (fb - fa), (vc - vb) / (fc - fb)
        if isinstance(vb, Vector):
            return Vector([0.0 if a * c <= 0 else 0.5 * (a + c) for a, c in zip(sa, sc)])
        return 0.0 if sa * sc <= 0 else 0.5 * (sa + sc)


# ------------------------------------------------------------------ personagem
class Rig:
    """Esqueleto Mixamo: repouso, FK e IK analitico. Espacos: W = mundo (metros, Z para cima), A = espaco do armature."""

    def __init__(self, arm):
        self.arm = arm
        bpy.context.view_layer.update()
        self.AW = arm.matrix_world.copy()
        self.AWi = self.AW.inverted()
        self.RW = self.AW.to_3x3().normalized()
        self.RWi = self.RW.inverted()
        self.k = self.AW.to_scale()[0]
        bs = arm.data.bones
        self.rest = {b.name[len(PFX):]: b.matrix_local.copy() for b in bs}
        self.pai = {b.name[len(PFX):]: (b.parent.name[len(PFX):] if b.parent else None) for b in bs}
        self.ordem = []
        vistos = set()

        def vis(b):
            if b.name in vistos:
                return
            if b.parent:
                vis(b.parent)
            vistos.add(b.name)
            self.ordem.append(b.name[len(PFX):])
        for b in bs:
            vis(b)
        self.local0 = {n: (self.rest[p].inverted() @ self.rest[n]) if p else self.rest[n] for n, p in self.pai.items()}
        self.cadeias = {}
        for lado, L in (("l", "Left"), ("r", "Right")):
            self.cadeias["braco_" + lado] = (L + "Arm", L + "ForeArm", L + "Hand", -Y)    # cotovelo dobra p/ frente
            self.cadeias["perna_" + lado] = (L + "UpLeg", L + "Leg", L + "Foot", Y)       # joelho: canela vai p/ tras
        self.dobra0 = {}
        for nome, (a, b_, c, frente) in self.cadeias.items():
            ya = self.dir_w(a)
            self.dobra0[nome] = self.RWi @ ya.cross(frente).normalized()
        # maos: dedos = Y do osso, palma = para baixo no T-pose | pes: frente horizontal + cima
        self.palma0 = {s: self.RWi @ -Z for s in "lr"}
        self.pe_frente0 = {}
        for s, L in (("l", "Left"), ("r", "Right")):
            d = self.pos_w(L + "ToeBase") - self.pos_w(L + "Foot")
            d.z = 0
            self.pe_frente0[s] = self.RWi @ d.normalized()

    # repouso no mundo
    def pos_w(self, n):
        return self.AW @ self.rest[n].translation

    def dir_w(self, n):
        return (self.RW @ self.rest[n].to_3x3().normalized() @ Y).normalized()

    def rot_w(self, n):
        return self.RW @ self.rest[n].to_3x3().normalized()

    def comp(self, a, b_):
        return (self.rest[b_].translation - self.rest[a].translation).length

    def q_eixos(self, n, rots):
        """Rotacoes [(eixo do mundo no repouso, graus), ...] -> quaternion local do osso (FK relativo ao pai)."""
        R = self.rest[n].to_3x3().normalized()
        M = Matrix.Identity(3)
        for eixo, g in rots:
            M = Matrix.Rotation(math.radians(g), 3, self.RWi @ Vector(eixo)) @ M
        return (R.inverted() @ M @ R).to_quaternion()

    # ---------------------------------------------------------- resolver um quadro
    def resolver(self, P):
        """P (Pose) -> {osso: (quaternion local, posicao local ou None)}; tambem guarda self.M (espaco A) e self.Mw()."""
        M = {}
        out = {}
        feitos = set()
        for n in self.ordem:
            if n in feitos:
                continue
            p = self.pai[n]
            if p is None:
                Rw = P.quadril_rot @ self.rot_w(n)
                MA = mat(self.AWi @ P.quadril_pos, self.RWi @ Rw)
                M[n] = MA
                bas = self.rest[n].inverted() @ MA
                out[n] = (bas.to_quaternion(), bas.translation.copy())
                continue
            cad = next((c for c, v in self.cadeias.items() if v[0] == n), None)
            if cad is not None and (P.maos if cad.startswith("braco") else P.pes).get(cad[-1]) is not None:
                self._ik(cad, P, M, out)
                feitos.update(self.cadeias[cad][:3])
                continue
            q = P.fk.get(n)
            q = self.q_eixos(n, q) if isinstance(q, list) else (q or Quaternion())
            M[n] = M[p] @ self.local0[n] @ q.to_matrix().to_4x4()
            out[n] = (q, None)
        self.M = M
        return out

    def Mw(self, n):
        """Matriz de pose do osso no mundo (rotacao sem escala) depois de resolver."""
        MA = self.M[n]
        return mat(self.AW @ MA.translation, self.RW @ MA.to_3x3().normalized())

    def _local(self, n, MA, M):
        p = self.pai[n]
        return ((M[p] @ self.local0[n]).inverted() @ MA).to_quaternion()

    def _ik(self, cad, P, M, out):
        a, b_, c, _ = self.cadeias[cad]
        lado = cad[-1]
        p = self.pai[a]
        S = (M[p] @ self.local0[a]).translation
        L1, L2 = self.comp(a, b_), self.comp(b_, c)
        alvo = P.maos[lado] if cad.startswith("braco") else P.pes[lado]
        Wt = self.AWi @ alvo.pos
        polo = self.AWi @ alvo.polo
        d = Wt - S
        D = min(max(d.length, abs(L1 - L2) + 1e-4), (L1 + L2) * 0.9995)
        dn = d.normalized()
        nn = polo - S
        nn = (nn - dn * nn.dot(dn)).normalized()
        aa = (L1 * L1 - L2 * L2 + D * D) / (2 * D)
        hh = math.sqrt(max(L1 * L1 - aa * aa, 0.0))
        E = S + dn * aa + nn * hh
        W = S + dn * D
        H = nn.cross(dn).normalized()
        H0 = self.dobra0[cad]
        Ra = self.rest[a].to_3x3().normalized()
        Rb = self.rest[b_].to_3x3().normalized()
        Ma = mat(S, base(E - S, H) @ base(Ra @ Y, H0).transposed() @ Ra)
        Mb_ = mat(E, base(W - E, H) @ base(Rb @ Y, H0).transposed() @ Rb)
        # extremidade: orientacao pedida no mundo (mao: dedos/palma; pe: frente/cima)
        Rc0 = self.rest[c].to_3x3().normalized()
        if cad.startswith("braco"):
            F0 = base(Rc0 @ Y, self.palma0[lado])
            Fd = base(self.RWi @ alvo.dedos, self.RWi @ alvo.palma)
        else:
            F0 = base(self.pe_frente0[lado], self.RWi @ Z)
            Fd = base(self.RWi @ alvo.dedos, self.RWi @ alvo.palma)
        Rc = Fd @ F0.transposed() @ Rc0
        if cad.startswith("braco"):
            # metade da torcao da mao vai para o antebraco (sem osso de torcao no Mixamo)
            rel = (Mb_.to_3x3() @ self.local0[c].to_3x3()).inverted() @ Rc
            qr = rel.to_quaternion()
            yl = Vector((0, 1, 0))
            proj = Vector((qr.x, qr.y, qr.z)).dot(yl)
            tw = Quaternion((qr.w, 0, proj, 0)).normalized()
            ang = 2 * math.atan2(tw.y, tw.w)
            ang = (ang + math.pi) % (2 * math.pi) - math.pi
            Mb_ = mat(E, Mb_.to_3x3() @ Matrix.Rotation(ang * 0.5, 3, 'Y'))
        Mc = mat(W, Rc)
        M[a], M[b_], M[c] = Ma, Mb_, Mc
        out[a] = (self._local(a, Ma, M), None)
        out[b_] = (self._local(b_, Mb_, M), None)
        out[c] = (self._local(c, Mc, M), None)


class Alvo:
    """Alvo de IK no mundo: pos (punho / tornozelo), dedos + palma (mao) ou frente + cima (pe), polo (cotovelo / joelho)."""

    def __init__(self, pos, dedos, palma, polo):
        self.pos, self.dedos, self.palma, self.polo = Vector(pos), Vector(dedos), Vector(palma), Vector(polo)


class Pose:
    def __init__(self):
        self.quadril_pos = Vector()
        self.quadril_rot = Matrix.Identity(3)
        self.fk = {}
        self.maos = {}
        self.pes = {}
        self.props = {}

    def soma(self, osso, rots):
        self.fk.setdefault(osso, []).extend(rots)


# ------------------------------------------------------------------ dedos (so polegar e indicador no rig)
def dedos(rig, P, lado, ind, pol_op=0.0, pol_dobra=0.0, ind_abre=0.0):
    """ind = flexao do indicador (graus por falange: tupla de 3 ou numero); pol_op = oposicao do polegar (vai p/ baixo
    da palma); pol_dobra = flexao das falanges do polegar."""
    L = "Left" if lado == "l" else "Right"
    if not isinstance(ind, (tuple, list)):
        ind = (ind, ind * 1.1, ind * 0.8)
    palma = -Z
    for k, g in enumerate(ind, 1):
        n = L + "HandIndex%d" % k
        y = rig.dir_w(n)
        rots = [(y.cross(palma).normalized(), g)]
        if k == 1 and ind_abre:
            rots.append((palma, ind_abre if lado == "l" else -ind_abre))
        P.fk[n] = rots
    eixo_mao = rig.dir_w(L + "Hand")
    for k in (1, 2, 3):
        n = L + "HandThumb%d" % k
        y = rig.dir_w(n)
        rots = []
        if k == 1:
            rots.append((eixo_mao, pol_op))
        rots.append((y.cross(palma).normalized(), pol_dobra * (0.6 if k == 1 else 1.0)))
        P.fk[n] = rots


MAOS = {   # (indicador, oposicao do polegar, flexao do polegar)
    "solta": ((14, 16, 10), 12, 8),
    "punho": ((78, 95, 70), 55, 35),
    "segura": ((55, 70, 45), 45, 25),
    "braco": ((60, 75, 40), 25, 10),         # mao esquerda no braco do instrumento (acorde)
    "palheta": ((40, 55, 35), 35, 15),
    "baqueta": ((70, 85, 55), 60, 30),
    "mic": ((62, 78, 52), 50, 30),
    "aberta": ((4, 4, 2), 5, 0),
}


def mao(rig, P, lado, a, b_=None, t=0.0):
    ga = MAOS[a]
    gb = MAOS[b_] if b_ else ga
    ind = tuple(lerp(x, y, t) for x, y in zip(ga[0], gb[0]))
    dedos(rig, P, lado, ind, lerp(ga[1], gb[1], t), lerp(ga[2], gb[2], t))


# ------------------------------------------------------------------ cena
def preparar():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    scn.render.fps, scn.render.fps_base = FPS, 1.0
    bpy.ops.import_scene.fbx(filepath=FBX, automatic_bone_orientation=False, ignore_leaf_bones=False)
    arm = next(o for o in scn.objects if o.type == 'ARMATURE')
    corpo = next(o for o in scn.objects if o.type == 'MESH')
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    arm.animation_data_clear()
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    bpy.context.view_layer.update()
    co = np.empty(len(corpo.data.vertices) * 3, np.float32)
    corpo.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    Mw = np.array(corpo.matrix_world)
    zs = co @ Mw[2, :3] + Mw[2, 3]
    s0 = arm.scale[0]
    alt0 = (zs.max() - zs.min()) / s0                   # altura nativa (unidades do FBX)
    nativo = dict(loc=arm.location.copy(), rot=arm.rotation_euler.copy(), escala=arm.scale.copy())
    k = ALTURA / alt0
    arm.scale = (k, k, k)
    arm.location.z = -zs.min() / s0 * k
    bpy.context.view_layer.update()
    arm.name = "Musico"
    arm.data.name = "Musico"
    corpo.name = "Musico_Corpo"
    dec = corpo.modifiers.new("previa", 'DECIMATE')     # so para renderizar a previa mais rapido (a malha nao e exportada)
    dec.ratio = 0.12
    corpo.modifiers.move(len(corpo.modifiers) - 1, 0)
    with bpy.context.temp_override(object=corpo, active_object=corpo, selected_objects=[corpo]):
        bpy.ops.object.modifier_apply(modifier="previa")
    print("personagem: altura nativa %.3f -> %.2f m (escala %.4f)" % (alt0, ALTURA, k))
    return arm, corpo, nativo


def carregar_palco(lugar):
    """Anexa o palco do palco_ref.blend e poe tudo no espaco do lugar (vazio na origem)."""
    with bpy.data.libraries.load(REF, link=False) as (src, dst):
        dst.objects = list(src.objects)
    scn = bpy.context.scene
    col = bpy.data.collections.new("Palco")
    scn.collection.children.link(col)
    obs = {o.name: o for o in dst.objects if o is not None}
    for o in obs.values():
        col.objects.link(o)
    ancora = obs["Palco_Lugar_" + lugar.capitalize()]
    M_anc = ancora.matrix_basis.copy()
    Ai = M_anc.inverted()
    for o in obs.values():
        if o.parent is None:
            o.matrix_basis = Ai @ o.matrix_basis
    for n in ("Ref_Baqueta_1", "Ref_Baqueta_2"):
        obs[n].hide_render = True
    bpy.context.view_layer.update()
    return obs, M_anc


# ------------------------------------------------------------------ gravar quadros em acoes
class Gravador:
    def __init__(self, rig, nome):
        self.rig, self.nome = rig, nome
        self.q = {n: [] for n in rig.ordem}
        self.loc = []
        self.props = {}

    def quadro(self, P):
        r = self.rig.resolver(P)
        for n, (q, l) in r.items():
            lst = self.q[n]
            if lst and lst[-1].dot(q) < 0:
                q = -q
            lst.append(q.copy())
            if l is not None:
                self.loc.append(l.copy())
        for pn, M in P.props.items():
            self.props.setdefault(pn, []).append(M.copy())

    def acao(self, nome, series, f0=0):
        act = bpy.data.actions.new(nome)
        act.use_fake_user = True
        for path, idx, vals, grupo in series:
            fc = act.fcurves.new(path, index=idx, action_group=grupo)
            fc.keyframe_points.add(len(vals))
            co = np.empty(len(vals) * 2, np.float32)
            co[0::2] = np.arange(f0, f0 + len(vals))
            co[1::2] = vals
            fc.keyframe_points.foreach_set("co", co)
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'
            fc.update()
        return act

    def gravar(self, props_obs):
        series = []
        for n, qs in self.q.items():
            path = 'pose.bones["%s%s"].rotation_quaternion' % (PFX, n)
            arr = np.array([tuple(q) for q in qs], np.float32)
            for i in range(4):
                series.append((path, i, arr[:, i], PFX + n))
        arr = np.array([tuple(v) for v in self.loc], np.float32)
        for i in range(3):
            series.append(('pose.bones["%sHips"].location' % PFX, i, arr[:, i], PFX + "Hips"))
        acoes = {"Musico": self.acao(self.nome, series)}
        for pn, Ms in self.props.items():
            locs = np.array([tuple(M.translation) for M in Ms], np.float32)
            qs = []
            for M in Ms:
                q = M.to_quaternion()
                if qs and Quaternion(qs[-1]).dot(q) < 0:
                    q = -q
                qs.append(tuple(q))
            qs = np.array(qs, np.float32)
            s = [("location", i, locs[:, i], "Objeto") for i in range(3)] + [("rotation_quaternion", i, qs[:, i], "Objeto") for i in range(4)]
            acoes[pn] = self.acao(self.nome + "|" + pn, s)
        return acoes


# ------------------------------------------------------------------ previa (Workbench, folha de contato)
def camera():
    scn = bpy.context.scene
    cam = scn.objects.get("Cam_Previa")
    if cam is None:
        cam = bpy.data.objects.new("Cam_Previa", bpy.data.cameras.new("Cam_Previa"))
        scn.collection.objects.link(cam)
        scn.camera = cam
        cam.data.lens = 50
        scn.render.engine = 'BLENDER_WORKBENCH'
        sh = scn.display.shading
        sh.light, sh.color_type = 'STUDIO', 'TEXTURE'
        sh.show_shadows = True
        sh.show_cavity = False
        scn.display.shadow_shift = 0.1
        scn.view_settings.view_transform = 'Standard'
        scn.world = bpy.data.worlds.new("Previa")
        scn.world.color = (0.18, 0.18, 0.2)
    return cam


def previa(nome, quadros, vistas, alvo=(0, 0, 1.0), dist=3.2, tam=(420, 520)):
    """Renderiza os quadros pedidos de cada vista (direcao do alvo para o olho) e junta numa folha (linhas = vistas)."""
    os.makedirs(PREVIA, exist_ok=True)
    scn = bpy.context.scene
    cam = camera()
    scn.render.resolution_x, scn.render.resolution_y = tam
    scn.render.resolution_percentage = 100
    alvo = Vector(alvo)
    linhas = []
    tmp = os.path.join(PREVIA, "_tmp.png")
    for v in vistas:
        d = Vector(v).normalized()
        cam.location = alvo + d * dist
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        tiles = []
        for f in quadros:
            scn.frame_set(f)
            scn.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            im = bpy.data.images.load(tmp)
            px = np.empty(tam[0] * tam[1] * 4, np.float32)
            im.pixels.foreach_get(px)
            bpy.data.images.remove(im)
            tiles.append(px.reshape(tam[1], tam[0], 4))
        linhas.append(np.concatenate(tiles, 1))
    comp = np.concatenate(linhas[::-1], 0)
    img = bpy.data.images.new("previa", comp.shape[1], comp.shape[0])
    img.pixels.foreach_set(comp.ravel())
    out = os.path.join(PREVIA, nome + ".png")
    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)
    print("PREVIA", out)
    return out


# ------------------------------------------------------------------ coreografia: ferramentas
class Caminho:
    """Chaves (quadro, funcao f -> valor): entre duas chaves mistura suave o valor das duas funcoes no mesmo quadro.
    Valor: Matrix 4x4 rigida, (Matrix, polo) de mao, tupla de numeros, Vector ou float."""

    def __init__(self, *chaves):
        self.k = sorted(chaves, key=lambda c: c[0])

    def __call__(self, f):
        k = self.k
        if f <= k[0][0]:
            return k[0][1](f)
        if f >= k[-1][0]:
            return k[-1][1](f)
        i = max(j for j in range(len(k) - 1) if k[j][0] <= f)
        (f0, a), (f1, b_) = k[i], k[i + 1]
        if a is b_:
            return a(f)
        return misturar(a(f), b_(f), suave((f - f0) / (f1 - f0)))


def misturar(a, b_, t):
    if isinstance(a, Matrix):
        return mistura_m(a, b_, t)
    if isinstance(a, tuple) and isinstance(a[0], Matrix):
        return (mistura_m(a[0], b_[0], t), a[1].lerp(b_[1], t))
    if isinstance(a, tuple):
        return tuple(lerp(x, y, t) for x, y in zip(a, b_))
    if isinstance(a, Vector):
        return a.lerp(b_, t)
    return lerp(a, b_, t)


def fixo(v):
    return lambda f: v


def alvo_mao(pos, dedos_, palma, polo):
    return (mat(Vector(pos), base(dedos_, palma)), Vector(polo))


def em(Mi, hm):
    return (Mi @ hm[0], Mi @ hm[1])


def para_alvo(hm):
    H, polo = hm
    return Alvo(H.translation, H.col[0].to_3d(), H.col[1].to_3d(), polo)


def orienta(braco_dir, frente):
    """Matriz 3x3 de instrumento: Z local = direcao do braco, -Y local = normal do tampo (frente)."""
    zg = Vector(braco_dir).normalized()
    yg = -Vector(frente)
    yg = (yg - zg * yg.dot(zg)).normalized()
    return Matrix((yg.cross(zg), yg, zg)).transposed()


class Pe:
    """Pe guiado pela bola do pe (onde os dedos dobram): passos com arco, giro (yaw) e inclinacao em torno da bola."""

    def __init__(self, rig, lado, bola, yaw, f0=0):
        L = "Left" if lado == "l" else "Right"
        self.rig, self.lado, self.L, self.sg = rig, lado, L, (1 if lado == "l" else -1)
        self.v0 = rig.pos_w(L + "Foot") - rig.pos_w(L + "ToeBase")       # bola -> tornozelo (repouso, olhando -Y)
        self.fr0 = rig.RW @ rig.pe_frente0[lado]
        d = rig.pos_w(L + "Toe_End") - rig.pos_w(L + "ToeBase")
        self.dobra_dedo = Z.cross(Vector((d.x, d.y, 0)).normalized())
        self.b = Trilha((f0, Vector(bola), True))
        self.y = Trilha((f0, float(yaw), True))
        self.i = Trilha((f0, 0.0, True))
        self.h = Trilha((f0, 0.0, True))

    @staticmethod
    def bola_em(rig, lado, R):
        """Bola do pe em repouso no quadro de chao R (4x4)."""
        return R @ rig.pos_w(("Left" if lado == "l" else "Right") + "ToeBase")

    def _seg(self, f):
        for t in (self.b, self.y, self.i, self.h):
            t.add(f, t(f), True)

    def passo(self, f0, f1, bola, yaw, alt=0.055):
        self._seg(f0)
        self.b.add(f1, Vector(bola), True)
        self.y.add(f1, float(yaw), True)
        self.h.add(lerp(f0, f1, 0.45), alt)
        self.h.add(f1, 0.0, True)
        self.i.add(lerp(f0, f1, 0.22), 20.0)
        self.i.add(lerp(f0, f1, 0.78), -4.0)
        self.i.add(f1, 0.0, True)

    def ir(self, f0, f1, bola=None, yaw=None, inc=None, arco=0.0):
        self._seg(f0)
        if bola is not None:
            self.b.add(f1, Vector(bola), True)
        if yaw is not None:
            self.y.add(f1, float(yaw), True)
        if inc is not None:
            self.i.add(f1, float(inc), True)
        if arco:
            self.h.add(lerp(f0, f1, 0.5), arco)
        self.h.add(f1, 0.0, True)

    def aplicar(self, P, f, inc_extra=0.0, polo_frente=0.6):
        B = self.b(f) + Z * self.h(f)
        Rz = giro_z(self.y(f))
        fr = Rz @ self.fr0
        inc = self.i(f) + inc_extra
        R = rot(Z.cross(fr).normalized(), inc) @ Rz
        tor = B + R @ self.v0
        polo = tor + (Rz @ -Y) * polo_frente + Z * 0.45 + (Rz @ X) * (0.12 * self.sg)
        P.pes[self.lado] = Alvo(tor, R @ self.fr0, R @ Z, polo)
        chao = max(0.0, 1.0 - self.h(f) / 0.02)
        P.fk[self.L + "ToeBase"] = [(self.dobra_dedo, -max(inc, 0.0) * 0.85 * chao)]


def tronco(P, inc=0.0, giro=0.0, lado=0.0, pesc=0.0, cab=0.0, cab_giro=0.0, cab_lado=0.0):
    """Coluna: inclinacao (+ frente), giro (+ esquerda), lado (+ tomba p/ esquerda); pescoco/cabeca idem."""
    for n, k in (("Spine", 0.30), ("Spine1", 0.35), ("Spine2", 0.35)):
        P.soma(n, [(X, inc * k), (Z, giro * k), (Y, lado * k)])
    P.soma("Neck", [(X, pesc * 0.5 + cab * 0.3), (Z, cab_giro * 0.4), (Y, cab_lado * 0.4)])
    P.soma("Head", [(X, pesc * 0.5 + cab * 0.7), (Z, cab_giro * 0.6), (Y, cab_lado * 0.6)])


def respirar(f, periodo=72):
    return math.sin(2 * math.pi * f / periodo)


def bracos_soltos(rig, P, Rz, f=0.0, afasta=0.0):
    """Bracos caidos ao lado do corpo (precisa de rig.resolver(P) antes, para achar os ombros)."""
    for s, L, sg in (("l", "Left", 1), ("r", "Right", -1)):
        Sh = rig.Mw(L + "Arm").translation
        bal = 0.006 * math.sin(2 * math.pi * f / 96 + sg)
        P.maos[s] = Alvo(Sh + Rz @ Vector(((0.035 + afasta) * sg, -0.045 + bal, -0.405)), Rz @ Vector((0.06 * sg, -0.12, -1)),
                         Rz @ Vector((-sg, 0.25, 0)), Sh + Rz @ Vector((0.30 * sg, 0.45, -0.25)))
        mao(rig, P, s, "solta")


def G(nome):
    g = MAOS[nome]
    return tuple(g[0]) + (g[1], g[2])


def aplicar_dedos(rig, P, lado, t):
    dedos(rig, P, lado, t[:3], t[3], t[4])


# ------------------------------------------------------------------ violao e cavaquinho
ALT_BANQ = 0.66                                    # assento das banquetas do palco (15_palco.py)
H_SENT = Vector((0.0, 0.02, 0.152))                # quadril (osso Hips) sentado, no quadro do assento
DEGRAU = {"baixo": (0.173, 0.160), "alto": (0.332, 0.147)}   # altura (banqueta sem escala) e raio do eixo do apoio
CORDAS = {
    "violao": dict(banqueta="Palco_Banqueta_Esq", inst="Palco_Violao", prop="Prop_Violao",
                   L=0.49, r1=0.18, r2=0.135, T=0.10, escala=0.65, larg=0.054,
                   cintura=(-0.13, -0.235, 0.205), meia=0.12, braco=(1.0, -0.20, 0.40), frente=(0.06, -1.0, 0.22),
                   acordes=(3, 5, 2, 3), amp=0.030, rasgo_z=0.05, inc=7.0),
    "cavaquinho": dict(banqueta="Palco_Banqueta_Dir", inst="Palco_Cavaquinho", prop="Prop_Cavaquinho",
                       L=0.30, r1=0.112, r2=0.083, T=0.065, escala=0.34, larg=0.044,
                       cintura=(-0.07, -0.215, 0.30), meia=0.075, braco=(1.0, -0.28, 0.62), frente=(0.10, -1.0, 0.12),
                       acordes=(2, 4, 5, 2), amp=0.022, rasgo_z=0.03, inc=4.0),
}


class Cordas:
    """Lugar com banqueta + instrumento no suporte. Espaco do lugar: personagem comeca na origem olhando para -Y, de
    frente para o suporte; pega o instrumento, vira para a plateia, senta pelo lado e toca."""
    N = {"sentar_pegar": 150, "comecar_tocar": 90, "tocando_loop": 144, "parar_sair": 165}

    def __init__(self, rig, obs, nome, yaw_lugar):
        self.rig, self.nome = rig, nome
        c = self.c = CORDAS[nome]
        self.Mi0 = obs[c["inst"]].matrix_world.copy()
        self.Mbanq = obs[c["banqueta"]].matrix_world.copy()
        self.C = self.Mbanq.translation.copy()
        self.C.z = 0.0
        # sentado olha para -Y do mundo; no espaco do lugar o giro vai para o lado em que o banco fica
        ys = (-yaw_lugar + 180.0) % 360.0 - 180.0
        fw = giro_z(ys) @ -Y
        s = 1.0 if (-self.C).dot(giro_z(ys) @ X) > 0 else -1.0
        # banco a esquerda de quem esta de frente para a plateia (s < 0) -> vira pela direita (giro negativo)
        if s < 0 and ys > 0:
            ys -= 360.0
        if s > 0 and ys < 0:
            ys += 360.0
        self.ys = ys
        self.S = mat(self.C + Z * ALT_BANQ, giro_z(ys))
        self.fwS, self.ltS = giro_z(ys) @ -Y, giro_z(ys) @ X
        self.lado_banco = s
        self.Gp = self.C + self.ltS * (s * 0.36)            # onde fica em pe antes de sentar (ao lado do banco)
        self.perto = "l" if s < 0 else "r"                  # pe do lado do banco
        self.longe = "r" if s < 0 else "l"
        self.H0 = rig.pos_w("Hips")
        self.Hf0 = mat(self.S @ H_SENT, giro_z(ys) @ rot(X, -8))
        self.zb = 0.2 * c["L"]
        self.zn = self.zb + c["escala"]
        self.zh = c["L"] - c["r2"] * 1.05
        self.k = c["L"] / 0.49                                # escala das pegadas em relacao ao violao
        # pose do instrumento no colo (quadro do assento S: x esquerda, y tras, z cima): cintura do corpo na coxa direita
        R = orienta(giro_z(ys) @ Vector(c["braco"]), giro_z(ys) @ Vector(c["frente"]))
        cint = self.S @ Vector(c["cintura"])
        o = cint - R @ Vector((c["meia"], 0, 0.55 * c["L"]))
        self.Mcolo0 = mat(o, R)
        self.ctx = {}

    # ---------------------------------------------------------- geometria do instrumento (local)
    def traste(self, n):
        return self.zn - self.c["escala"] * (1 - 2 ** (-n / 12.0))

    def g_braco_pegar(self, f=None):
        """Mao esquerda fechada em volta do braco, sempre do lado do peito (gira em volta do braco quando o
        instrumento vira na mao). Precisa de ctx['Mi'] e dos ombros do quadro."""
        k, T = self.k, self.c["T"]
        z = self.zn - 0.07 * k
        eixo = Vector((0.0, -T / 2 + 0.011, z))
        peito = (self.ctx["ombro_l"] + self.ctx["ombro_r"]) / 2 - Z * 0.15
        pl = self.ctx["Mi"].inverted() @ peito - eixo
        th = math.atan2(pl.x, -pl.y)
        Rn = Matrix.Rotation(th, 3, 'Z')
        return alvo_mao(eixo + Rn @ Vector((-0.05, -0.06, 0)), Rn @ Vector((1, 0.15, 0)), Rn @ Vector((0, 1, 0)),
                        eixo + Rn @ Vector((-0.35, -0.30, -0.40)))

    def g_corpo_pegar(self):
        """Mao direita na borda -X do bojo de baixo (em cima, quando o instrumento esta no colo ou carregado)."""
        c = self.c
        r1, T = c["r1"], c["T"]
        return alvo_mao((-(r1 + 0.025), -T / 2 + 0.005, 0.9 * r1), (0.2, 1.0, -0.15), (1, 0, 0), (-(r1 + 0.13), 0.35, 0.9 * r1 - 0.5))

    def g_traste(self, n, solto=0.0):
        z = self.traste(n) - 0.012
        T = self.c["T"]
        return alvo_mao((0.064 * self.k ** 0.5, -T / 2 + 0.035 - solto * 0.015, z - 0.022), (-0.45, -0.85, 0.22), (-1, 0.35, 0.05),
                        (0.42, -0.05, z - 0.18))

    def g_rasgo(self, s=0.0, sobe=0.0, gira=0.0):
        """Mao direita sobre as cordas: s em [-1, 1] atravessa as cordas (graves -> agudas), sobe = afasta do tampo."""
        c = self.c
        pos = Vector((-0.012 + s * c["amp"], -c["T"] / 2 - 0.058 - sobe * 0.05, self.zh + c["rasgo_z"] + sobe * 0.03))
        dd = rot(Z, -18 * s + gira) @ Vector((0.88, 0.0, -0.42))
        return alvo_mao(pos, dd, (0, 1, 0), (-0.30, 0.30, 0.05))

    # ---------------------------------------------------------- quadros
    def m_erguido(self):
        d = -self.Mi0.translation.copy()
        d.z = 0
        d.normalize()
        M = self.Mi0.copy()
        M.translation += d * 0.11 + Z * 0.08
        return M

    R_CARREGAR = orienta(Vector((0.65, -0.10, 0.75)), Vector((0.0, -1.0, 0.1)))

    def p_carregar(self):
        """Base do corpo do instrumento junto da barriga, do lado direito (bracos curtos: tudo perto e alto)."""
        return Vector((-0.12, -0.21, 0.74 + (1 - self.k) * 0.18))

    def m_carregar(self, f):
        """Instrumento carregado na frente da barriga (segue o quadro de chao do corpo)."""
        return self.ctx["Rc"] @ mat(self.p_carregar(), self.R_CARREGAR)

    def m_girando(self, f0, f1, ida=True):
        """Durante o giro o instrumento vai junto na frente do corpo, mas a orientacao vai direto (no mundo) do
        suporte para a de carregar ja virado para a plateia (sem rodar com o corpo e voltar)."""
        R_fim = (giro_z(self.ys) @ self.R_CARREGAR).to_quaternion()
        R_erg = self.m_erguido().to_quaternion()

        def fn(f):
            t = rampa(f, f0, f1)
            q = R_erg.slerp(R_fim, t) if ida else R_fim.slerp(R_erg, t)
            return mat(self.ctx["Rc"] @ self.p_carregar(), q.to_matrix())
        return fn

    def m_colo(self, f):
        return self.ctx["Hf"] @ self.Hf0.inverted() @ self.Mcolo0 @ self.ctx.get("ajuste", Matrix.Identity(4))

    def solta(self, lado):
        sg = 1 if lado == "l" else -1

        def fn(f):
            Sh = self.ctx["ombro_" + lado]
            Rz = self.ctx["Rf"].to_3x3()
            return alvo_mao(Sh + Rz @ Vector((0.035 * sg, -0.045, -0.405)), Rz @ Vector((0.06 * sg, -0.12, -1)), Rz @ Vector((-sg, 0.25, 0)),
                            Sh + Rz @ Vector((0.30 * sg, 0.45, -0.25)))
        return fn

    def no_inst(self, grip):
        return lambda f: em(self.ctx["Mi"], grip(f) if callable(grip) else grip)

    def degrau(self, direcao, nivel, lateral=0.0):
        """Ponto em cima do apoio da banqueta na direcao dada (espaco do lugar), deslocado 'lateral' ao longo do apoio."""
        Ri = self.Mbanq.to_3x3().normalized().inverted()
        d = Ri @ direcao
        a = math.atan2(d.y, d.x)
        m = math.radians(90 * round((math.degrees(a) - 0.0) / 90.0))      # pernas nas diagonais: apoios de frente p/ eixos
        z0, r_mid = DEGRAU[nivel]
        r = r_mid / max(math.cos(a - m), 0.6)
        p = Vector((r * math.cos(a), r * math.sin(a), z0 + 0.012 / 0.8125))
        tang = Vector((-math.sin(m), math.cos(m), 0)) * lateral
        return self.Mbanq @ (p + tang)

    # ---------------------------------------------------------- montar um quadro
    def corpo(self, f, tr, sent=0.0):
        """Quadril e coluna a partir das trilhas do clipe (tr) e do peso 'sentado'."""
        rig = self.rig
        P = Pose()
        rp, ry = tr["raiz"](f), tr["yaw"](f)
        Rf = mat(rp, giro_z(ry))
        hp_pe = Rf @ (self.H0 + tr["quad"](f))
        hp_s = self.S @ (H_SENT + tr["quad_s"](f) if "quad_s" in tr else H_SENT)
        yaw = lerp(ry, self.ys, sent)
        P.quadril_pos = hp_pe.lerp(hp_s, sent)
        P.quadril_rot = giro_z(yaw) @ rot(X, -8.0 * sent + (tr["pelve"](f) if "pelve" in tr else 0.0))
        self.ctx["Rf"] = Rf
        self.ctx["Hf"] = mat(P.quadril_pos, P.quadril_rot)
        # quadro de chao que acompanha o quadril (o que se carrega vai junto quando o corpo desliza para o banco)
        hp = P.quadril_pos
        off = giro_z(yaw) @ Vector((self.H0.x, self.H0.y, 0.0))
        self.ctx["Rc"] = mat(Vector((hp.x, hp.y, 0.0)) - off, giro_z(yaw))
        tronco(P, *((tr[k](f) if k in tr else 0.0) for k in ("inc", "giro", "lado", "pesc", "cab", "cab_giro", "cab_lado")))
        r = respirar(f + tr.get("fase_resp", 0))
        P.soma("Spine1", [(X, -0.8 * r)])
        P.soma("Spine2", [(X, -0.8 * r)])
        rig.resolver(P)
        for s, L in (("l", "Left"), ("r", "Right")):
            self.ctx["ombro_" + s] = rig.Mw(L + "Arm").translation
        return P

    def finalizar(self, P, f, tr, pes, inc_pe=None):
        self.ctx["Mi"] = tr["inst"](f)
        P.props[self.c["prop"]] = self.ctx["Mi"]
        for s in "lr":
            P.maos[s] = para_alvo(tr["mao_" + s](f))
            aplicar_dedos(self.rig, P, s, tr["dedos_" + s](f))
            pes[s].aplicar(P, f, inc_extra=(inc_pe[s](f) if inc_pe and s in inc_pe else 0.0))
        return P

    # ---------------------------------------------------------- poses compartilhadas entre clipes
    INC_PE_DEGRAU = -8.0                                  # pe no apoio: calcanhar um pouco abaixo da bola

    def pes_parado(self):
        R = mat(Vector(), Matrix.Identity(3))
        return {s: Pe(self.rig, s, Pe.bola_em(self.rig, s, R), 0.0) for s in "lr"}

    def pes_banco(self):
        """Bolas dos pes nos apoios da banqueta: direito no alto (coxa sobe p/ apoiar o instrumento), esquerdo no baixo."""
        d_r = (self.fwS - self.ltS * 0.45).normalized()
        d_l = (self.fwS + self.ltS * 0.45).normalized()
        return {"r": self.degrau(d_r, "alto") + Z * 0.008, "l": self.degrau(d_l, "baixo") + Z * 0.008}

    def pronto_vals(self):
        return dict(inc=self.c["inc"] + 1.0, cab=2.0, grip_l=misturar(G("braco"), G("solta"), 0.6),
                    grip_r=misturar(G("palheta"), G("solta"), 0.5))

    def lv(self, t):
        """Valores do loop no tempo t (quadros; periodico em 144)."""
        b = BATIDA
        A = 0.86 + 0.14 * math.cos(2 * math.pi * t / b)
        s = A * math.sin(2 * math.pi * t / (b / 2))
        gira = 10 * math.cos(2 * math.pi * t / (b / 2))
        ac = self.c["acordes"]
        i = int(math.floor(t / 36.0)) % 4
        u = (t % 36.0 - 31.0) / 5.0
        n = ac[i]
        solto = 0.0
        if u > 0:
            n = lerp(ac[i], ac[(i + 1) % 4], suave(u))
            solto = math.sin(math.pi * u)
        return dict(s=s, gira=gira, n=n, solto=solto,
                    cab=4.0 + 3.0 * (0.5 + 0.5 * math.cos(2 * math.pi * t / b)),
                    cab_giro=12.0 * math.sin(math.pi * t / 144.0) ** 2,
                    cab_lado=2.0 * math.sin(2 * math.pi * t / 72.0),
                    inc=self.c["inc"] + 1.5 * math.sin(2 * math.pi * t / 36.0),
                    lado=1.5 * math.sin(2 * math.pi * t / 72.0),
                    giro=2.0 * math.sin(2 * math.pi * t / 72.0 + 1.0),
                    tap=9.0 * (0.5 - 0.5 * math.cos(2 * math.pi * t / b)),
                    pula=0.004 * (0.5 + 0.5 * math.cos(2 * math.pi * t / b)))

    def trilhas_sentado(self):
        Gp = self.Gp
        return dict(raiz=fixo(Gp), yaw=fixo(self.ys), quad=fixo(Vector()))

    # ---------------------------------------------------------- 1) pega o instrumento, vira e senta
    def clipe_sentar_pegar(self):
        rig, N, ys, O = self.rig, self.N["sentar_pegar"], self.ys, Vector()
        sg = 1.0 if ys > 0 else -1.0                       # sentido do giro (+ esquerda)
        pv = self.pronto_vals()
        tr = dict(
            raiz=Trilha((0, O, True), (52, O, True), (96, self.Gp, True)),
            yaw=Trilha((0, 0.0, True), (50, 0.0, True), (96, ys, True)),
            quad=Trilha((0, (0, 0, 0), True), (12, (0, 0, 0)), (30, (0, 0.05, -0.05)), (40, (0, 0.05, -0.05)), (56, (0, 0.01, -0.012)),
                        (96, (0, 0, -0.012)), (112, (0, 0, -0.03)), (150, (0, 0, -0.03), True)),
            inc=Trilha((0, 2.0, True), (12, 3.0), (30, 26.0), (40, 25.0), (58, 6.0), (96, 4.0), (112, 5.0), (132, pv["inc"]), (150, pv["inc"], True)),
            cab=Trilha((0, 10.0, True), (14, 14.0), (32, 16.0), (56, 10.0), (76, 0.0), (110, -2.0), (138, pv["cab"]), (150, pv["cab"], True)),
            giro=Trilha((0, 0.0, True), (56, 0.0), (70, 12 * sg), (90, 8 * sg), (102, 0.0), (150, 0.0, True)),
            cab_giro=Trilha((0, 0.0, True), (54, 0.0), (66, 28 * sg), (86, 18 * sg), (104, 0.0), (126, 18.0), (142, 0.0), (150, 0.0, True)),
            inst=Caminho((0, fixo(self.Mi0)), (34, fixo(self.Mi0)), (52, fixo(self.m_erguido())), (64, self.m_girando(52, 96)),
                         (96, self.m_girando(52, 96)), (104, self.m_carregar), (122, self.m_carregar), (146, self.m_colo)),
            mao_l=Caminho((0, self.solta("l")), (12, self.solta("l")), (30, self.no_inst(self.g_braco_pegar)),
                          (122, self.no_inst(self.g_braco_pegar)), (146, self.no_inst(self.g_traste(5, solto=1.0)))),
            # a esquerda tira do suporte sozinha; a direita segura o corpo quando o instrumento ja esta na frente
            mao_r=Caminho((0, self.solta("r")), (62, self.solta("r")), (82, self.no_inst(self.g_corpo_pegar())),
                          (124, self.no_inst(self.g_corpo_pegar())), (148, self.no_inst(self.g_rasgo(0.0, sobe=0.5)))),
            dedos_l=Caminho((0, fixo(G("solta"))), (22, fixo(G("solta"))), (30, fixo(G("segura"))), (124, fixo(G("segura"))),
                            (142, fixo(pv["grip_l"]))),
            dedos_r=Caminho((0, fixo(G("solta"))), (72, fixo(G("solta"))), (82, fixo(G("segura"))), (124, fixo(G("segura"))),
                            (146, fixo(pv["grip_r"]))),
        )
        sent = Trilha((0, 0.0, True), (98, 0.0, True), (122, 1.0, True))
        pes = self.pes_parado()
        primeiro = "r" if ys < 0 else "l"
        seq = [primeiro, "l" if primeiro == "r" else "r"] * 3
        for (f0, f1), s in zip(((54, 64), (62, 72), (70, 80), (78, 88), (86, 96)), seq):
            fr = min(f1 + 3, 96)
            pes[s].passo(f0, f1, Pe.bola_em(rig, s, mat(tr["raiz"](fr), giro_z(tr["yaw"](fr)))), tr["yaw"](fr), alt=0.045)
        sgp = 1 if self.perto == "l" else -1
        chao = {self.perto: self.C + self.fwS * 0.36 + self.ltS * (0.06 * sgp), self.longe: self.C + self.fwS * 0.33 - self.ltS * (0.15 * sgp)}
        for s in chao:
            chao[s].z = Pe.bola_em(rig, s, Matrix.Identity(4)).z
        pes[self.perto].passo(98, 109, chao[self.perto], ys, alt=0.05)
        pes[self.longe].passo(104, 115, chao[self.longe], ys, alt=0.05)
        bb = self.pes_banco()
        pes["r"].ir(124, 137, bola=bb["r"], inc=self.INC_PE_DEGRAU, arco=0.07)
        pes["l"].ir(129, 141, bola=bb["l"], inc=self.INC_PE_DEGRAU, arco=0.05)
        out = []
        for f in range(N):
            P = self.corpo(f, tr, sent(f))
            out.append(self.finalizar(P, f, tr, pes))
        return out

    # ---------------------------------------------------------- 2) ajeita e comeca a tocar (termina no quadro 0 do loop)
    def clipe_comecar_tocar(self):
        N = self.N["comecar_tocar"]
        pv = self.pronto_vals()
        L0 = lambda f: self.lv(f - N)                       # loop "adiantado": no ultimo quadro vale lv(0)
        w = Trilha((0, 0.0, True), (64, 0.0, True), (82, 1.0, True))
        aj = Trilha((0, 0.0, True), (8, 1.0), (20, 0.0, True))

        def mistura_loop(k, base_):
            return lambda f: lerp(base_(f) if callable(base_) else base_, L0(f)[k], w(f))
        nod = lambda f: 6.0 * sum(math.exp(-((f - fb) / 4.0) ** 2) for fb in (18, 36, 54))
        tr = self.trilhas_sentado()
        tr.update(
            inc=mistura_loop("inc", Trilha((0, pv["inc"], True), (14, pv["inc"] - 2), (40, self.c["inc"]))),
            cab=mistura_loop("cab", lambda f: Trilha((0, pv["cab"], True), (24, 12.0), (44, 5.0))(f) + nod(f)),
            cab_giro=mistura_loop("cab_giro", Trilha((0, 0.0, True), (16, 22.0), (34, 6.0), (60, 0.0))),
            cab_lado=mistura_loop("cab_lado", 0.0), lado=mistura_loop("lado", 0.0), giro=mistura_loop("giro", 0.0),
            quad_s=lambda f: Vector((0, 0, 0.004 * aj(f) + L0(f)["pula"] * w(f))),
            inst=self.m_colo,
        )
        notas = Trilha((0, 5.0, True), (14, 5.0), (30, float(self.c["acordes"][0]), True))
        solto = Trilha((0, 1.0, True), (14, 1.0), (22, 1.6), (30, 0.0, True))
        tr["mao_l"] = lambda f: em(self.ctx["Mi"], self.g_traste(notas(f), solto=solto(f)))
        a_r = Trilha((0, 0.0, True), (62, 0.0, True), (84, 1.0, True))
        sobe = Trilha((0, 0.5, True), (20, 0.5), (36, 0.9), (60, 0.6), (80, 0.0, True))

        def mao_r(f):
            v = L0(f)
            return em(self.ctx["Mi"], self.g_rasgo(v["s"] * a_r(f), sobe=sobe(f), gira=v["gira"] * a_r(f)))
        tr["mao_r"] = mao_r
        tr["dedos_l"] = lambda f: misturar(pv["grip_l"], G("braco"), rampa(f, 18, 30))
        tr["dedos_r"] = lambda f: misturar(pv["grip_r"], G("palheta"), rampa(f, 20, 40))
        bb = self.pes_banco()
        pes = {s: Pe(self.rig, s, bb[s], self.ys) for s in "lr"}
        for s in "lr":
            pes[s].i = Trilha((0, self.INC_PE_DEGRAU, True))
        tap = {"r": lambda f: 9.0 * sum(math.exp(-((f - fb) / 3.5) ** 2) for fb in (27, 45, 63)) * (1 - w(f)) + L0(f)["tap"] * w(f)}
        out = []
        for f in range(N):
            self.ctx["ajuste"] = mat(Vector((0, 0, 0.012 * aj(f))), rot(Y, 3.0 * aj(f)))
            P = self.corpo(f, tr, 1.0)
            out.append(self.finalizar(P, f, tr, pes, inc_pe=tap))
        self.ctx["ajuste"] = Matrix.Identity(4)
        return out

    # ---------------------------------------------------------- 3) tocando (loop de 2 compassos)
    def clipe_tocando_loop(self):
        N = self.N["tocando_loop"]
        tr = self.trilhas_sentado()
        for k in ("inc", "cab", "cab_giro", "cab_lado", "lado", "giro"):
            tr[k] = (lambda kk: (lambda f: self.lv(f)[kk]))(k)
        tr["quad_s"] = lambda f: Vector((0, 0, self.lv(f)["pula"]))
        tr["inst"] = self.m_colo
        tr["mao_l"] = lambda f: em(self.ctx["Mi"], self.g_traste(self.lv(f)["n"], solto=self.lv(f)["solto"]))
        tr["mao_r"] = lambda f: em(self.ctx["Mi"], self.g_rasgo(self.lv(f)["s"], gira=self.lv(f)["gira"]))
        tr["dedos_l"] = lambda f: misturar(G("braco"), G("solta"), 0.6 * self.lv(f)["solto"])
        tr["dedos_r"] = fixo(G("palheta"))
        bb = self.pes_banco()
        pes = {s: Pe(self.rig, s, bb[s], self.ys) for s in "lr"}
        for s in "lr":
            pes[s].i = Trilha((0, self.INC_PE_DEGRAU, True))
        tap = {"r": lambda f: self.lv(f)["tap"]}
        out = []
        for f in range(N + 1):                                # ultimo = primeiro: o loop fecha sem soluco
            P = self.corpo(f, tr, 1.0)
            out.append(self.finalizar(P, f, tr, pes, inc_pe=tap))
        return out

    # ---------------------------------------------------------- 4) ultima batida, levanta, devolve no suporte e sai
    def clipe_parar_sair(self):
        rig, N, ys, O = self.rig, self.N["parar_sair"], self.ys, Vector()
        sg = 1.0 if ys > 0 else -1.0
        w = Trilha((0, 1.0, True), (10, 1.0), (16, 0.0, True))          # peso do loop no comeco
        L0 = self.lv

        def do_loop(k, depois):
            return lambda f: lerp(depois(f) if callable(depois) else depois, L0(f)[k], w(f))
        tr = dict(
            raiz=Trilha((0, self.Gp, True), (76, self.Gp, True), (120, O, True)),
            yaw=Trilha((0, ys, True), (74, ys, True), (118, 0.0, True)),
            quad=Trilha((0, (0, 0, -0.03), True), (60, (0, 0, -0.03)), (76, (0, 0, -0.012)), (118, (0, 0.01, -0.012)), (128, (0, 0.05, -0.05)),
                        (140, (0, 0.05, -0.05)), (154, (0, 0, 0)), (164, (0, 0, 0), True)),
            inc=do_loop("inc", Trilha((0, self.c["inc"], True), (16, self.c["inc"] - 3), (26, self.c["inc"] + 6), (40, self.c["inc"] + 2),
                                      (62, 5.0), (78, 4.0), (118, 6.0), (130, 26.0), (140, 25.0), (154, 3.0), (164, 2.0, True))),
            cab=do_loop("cab", Trilha((0, 4.0, True), (16, -4.0), (24, 14.0), (34, 2.0), (60, 4.0), (90, 0.0), (118, 12.0), (134, 16.0),
                                      (152, 11.0), (164, 10.0, True))),
            cab_giro=do_loop("cab_giro", Trilha((0, 0.0, True), (40, 0.0), (80, -28 * sg), (100, -18 * sg), (120, 0.0), (164, 0.0, True))),
            giro=do_loop("giro", Trilha((0, 0.0, True), (78, 0.0), (92, -12 * sg), (108, -8 * sg), (120, 0.0), (164, 0.0, True))),
            lado=do_loop("lado", 0.0), cab_lado=do_loop("cab_lado", 0.0),
            quad_s=lambda f: Vector((0, 0, L0(f)["pula"] * w(f))),
            inst=Caminho((0, self.m_colo), (40, self.m_colo), (64, self.m_carregar), (76, self.m_carregar),
                         (80, self.m_girando(78, 118, ida=False)), (118, self.m_girando(78, 118, ida=False)),
                         (128, fixo(self.m_erguido())), (142, fixo(self.Mi0)), (164, fixo(self.Mi0))),
            fase_resp=-164,
        )
        sent = Trilha((0, 1.0, True), (52, 1.0, True), (76, 0.0, True))
        batida = Trilha((0, 0.0, True), (9, 0.0), (14, 1.0), (22, 1.0), (30, 0.0, True))   # ultima batida para baixo e mao sai
        n0 = float(self.c["acordes"][0])

        def mao_r_toca(f):
            v = L0(f)
            b_ = batida(f)
            s = lerp(v["s"] * w(f), 1.7, b_) if f >= 9 else v["s"]
            return em(self.ctx["Mi"], self.g_rasgo(s, sobe=1.4 * rampa(f, 14, 26), gira=v["gira"] * w(f)))

        def mao_l_toca(f):
            v = L0(f)
            return em(self.ctx["Mi"], self.g_traste(v["n"] if f < 12 else n0, solto=max(v["solto"] * w(f), 1.2 * rampa(f, 13, 20))))
        # a direita solta o corpo antes do suporte: so a esquerda (no braco) poe o instrumento de volta
        tr["mao_r"] = Caminho((0, mao_r_toca), (30, mao_r_toca), (44, self.no_inst(self.g_corpo_pegar())), (98, self.no_inst(self.g_corpo_pegar())),
                              (114, self.solta("r")), (164, self.solta("r")))
        tr["mao_l"] = Caminho((0, mao_l_toca), (24, mao_l_toca), (40, self.no_inst(self.g_braco_pegar)), (142, self.no_inst(self.g_braco_pegar)),
                              (156, self.solta("l")), (164, self.solta("l")))
        tr["dedos_l"] = Caminho((0, lambda f: misturar(G("braco"), G("solta"), 0.6 * L0(f)["solto"])), (13, fixo(G("braco"))),
                                (20, fixo(G("solta"))), (32, fixo(G("solta"))), (40, fixo(G("segura"))), (142, fixo(G("segura"))),
                                (150, fixo(G("solta"))), (164, fixo(G("solta"))))
        tr["dedos_r"] = Caminho((0, fixo(G("palheta"))), (22, fixo(G("palheta"))), (32, fixo(G("solta"))), (38, fixo(G("solta"))),
                                (44, fixo(G("segura"))), (98, fixo(G("segura"))), (108, fixo(G("solta"))), (164, fixo(G("solta"))))
        bb = self.pes_banco()
        pes = {s: Pe(rig, s, bb[s], ys) for s in "lr"}
        for s in "lr":
            pes[s].i = Trilha((0, self.INC_PE_DEGRAU, True))
        sgp = 1 if self.perto == "l" else -1
        chao = {self.perto: self.C + self.fwS * 0.36 + self.ltS * (0.06 * sgp), self.longe: self.C + self.fwS * 0.33 - self.ltS * (0.15 * sgp)}
        for s in chao:
            chao[s].z = Pe.bola_em(rig, s, Matrix.Identity(4)).z
        pes["l"].ir(44, 55, bola=chao["l"], inc=0.0, arco=0.04)
        pes["r"].ir(48, 59, bola=chao["r"], inc=0.0, arco=0.05)
        Rg = mat(self.Gp, giro_z(ys))
        pes[self.longe].passo(62, 72, Pe.bola_em(rig, self.longe, Rg), ys, alt=0.045)
        pes[self.perto].passo(66, 77, Pe.bola_em(rig, self.perto, Rg), ys, alt=0.045)
        primeiro = "l" if ys < 0 else "r"
        seq = [primeiro, "l" if primeiro == "r" else "r"] * 3
        for (f0, f1), s in zip(((80, 90), (88, 98), (96, 106), (104, 114), (112, 122)), seq):
            fr = min(f1 + 3, 120)
            pes[s].passo(f0, f1, Pe.bola_em(rig, s, mat(tr["raiz"](fr), giro_z(tr["yaw"](fr)))), tr["yaw"](fr), alt=0.045)
        R0 = Matrix.Identity(4)
        for s in "lr":
            pes[s].ir(124, 132, bola=Pe.bola_em(rig, s, R0), yaw=0.0, inc=0.0)
        tap = {"r": lambda f: L0(f)["tap"] * w(f)}
        out = []
        for f in range(N):
            P = self.corpo(f, tr, sent(f))
            out.append(self.finalizar(P, f, tr, pes, inc_pe=tap))
        return out


# ------------------------------------------------------------------ bateria
# pontos no espaco local da bateria (15_palco.py: BANCO_BAT, CAIXA, SURDO, ATAQUE, CONDUCAO); baterista olha para -Y
BAT = dict(banco=(0.05, 0.70, 0.555), caixa=(0.16, 0.39, 0.735), tom1=(0.14, 0.127, 0.875), tom2=(-0.16, 0.14, 0.905),
           conducao=(-0.35, 0.23, 0.975), ataque=(0.33, 0.18, 1.04), bumbo=(0.0, 0.34, 0.035), chimbal=(0.52, 0.52, 0.035))
BAQ = 0.406 - 0.135                                # da pegada ate a ponta da baqueta


def quadro_baq(grip, dirz, palma):
    """Matriz da baqueta: origem na pegada, Z para a ponta, X = normal da palma de quem segura."""
    z = Vector(dirz).normalized()
    x = Vector(palma)
    x = (x - z * x.dot(z)).normalized()
    return mat(Vector(grip), Matrix((x, z.cross(x), z)).transposed())


def mao_da_baqueta(Ms, lado):
    """Alvo da mao (punho, dedos, palma, cotovelo) que segura a baqueta Ms; lado 'd' (direita) ou 'e'."""
    zs, palma, grip = Ms.col[2].to_3d(), Ms.col[0].to_3d(), Ms.translation
    t = zs.cross(palma).normalized() * (1 if lado == "d" else -1)          # lado do polegar
    a = math.radians(40)
    dd = zs * math.cos(a) - t * math.sin(a)
    punho = grip - dd * 0.055 - palma * 0.02
    sg = -1 if lado == "d" else 1
    return alvo_mao(punho, dd, palma, punho + Vector((0.28 * sg, 0.22, -0.22)))


def palma_toque(lado):
    return Vector((0.45 if lado == "d" else -0.45, 0.0, -0.85))


class Toques:
    """Ponta e pegada de uma baqueta a partir das batidas [(t, ponto, altura do preparo)]: depois de cada batida a
    baqueta volta um pouco (rebote), paira e sobe no preparo da proxima. periodo: repete as batidas (loop)."""

    def __init__(self, pivo, batidas, periodo=None):
        self.pivo = Vector(pivo)
        bs = sorted(batidas, key=lambda b: b[0])
        if periodo:
            bs = [(t - periodo, p, h) for t, p, h in bs] + bs + [(t + periodo, p, h) for t, p, h in bs]
        self.b = [(float(t), Vector(p), h, self.grip_de(Vector(p))) for t, p, h in bs]

    def grip_de(self, ponta):
        d = (ponta - self.pivo).normalized()
        return ponta - d * BAQ

    def __call__(self, t):
        b = self.b
        if t <= b[0][0]:
            return b[0][1] + Z * 0.025, b[0][3] + Z * 0.01
        if t >= b[-1][0]:
            return b[-1][1] + Z * 0.025, b[-1][3] + Z * 0.01
        i = max(j for j in range(len(b) - 1) if b[j][0] <= t)
        ta, A, hA, GA = b[i]
        tb, Bp, hB, GB = b[i + 1]
        dur = tb - ta
        if dur <= 10.0:
            u = (t - ta) / dur
            h = min(hB, 0.0135 * dur) * math.sin(math.pi * u)
            s = suave(u)
        else:
            P = min(11.0, dur * 0.5)
            reb = 0.05 * math.sin(math.pi * min((t - ta) / 6.0, 1.0)) if t - ta < 6.0 else 0.0
            w = (t - (tb - P)) / P
            prep = hB * math.sin(math.pi * w) if 0.0 < w < 1.0 else 0.0
            paira = 0.025 * rampa(t, ta + 3, ta + 8) * (1 - rampa(t, tb - P, tb - P * 0.5))
            h = max(reb, prep, paira)
            s = suave((t - ta - 3.0) / max(dur - 3.0 - P * 0.4, 1.0))
        return A.lerp(Bp, s) + Z * h, GA.lerp(GB, s) + Z * (0.35 * h)


# ------------------------------------------------------------------ vocal (pedestal reto)
BOCA_EM_PE = Vector((0.0, 0.20, 1.56))             # boca de quem canta, relativa ao pe do pedestal (15_palco.py)
MIC_ANG = 30.0


class Vocal:
    """Microfone principal: chega ao pedestal, segura o microfone (direita) e o pedestal (esquerda), canta gesticulando."""
    N = {"chegar_pegar": 90, "comecar_cantar": 72, "cantando_loop": 144, "parar_sair": 100}
    PROPS = {}

    def __init__(self, rig, obs):
        self.rig = rig
        Mp = obs["Palco_Pedestal_Vocal"].matrix_world.copy()
        self.pe = Mp.translation.copy()
        a = Mp.to_3x3() @ Vector((0, math.cos(math.radians(MIC_ANG)), math.sin(math.radians(MIC_ANG))))
        boca = Mp @ BOCA_EM_PE
        ponta = boca - a * (0.07 + 0.158)
        ponta.x, ponta.y = self.pe.x, self.pe.y
        self.a = a
        self.cabo_mic = ponta + a * (0.02 + 0.05)                      # meio do corpo do microfone
        self.boca = boca
        self.H0 = rig.pos_w("Hips")
        self.fw, self.lt = -Y, X
        self.raiz_canta = Vector((0.0, -0.07, 0.0))
        self.alvo_previa = Vector((0.0, -0.15, 1.05))
        self.ctx = {}

    def mao_mic(self, f=None):
        dd = Vector((0.0, -0.5, 0.866))
        pa = Vector((1.0, 0.0, 0.0))
        dd = (dd - self.a * dd.dot(self.a)).normalized()
        punho = self.cabo_mic - dd * 0.05 - pa * 0.028
        return alvo_mao(punho, dd, pa, punho + Vector((-0.25, 0.25, -0.30)))

    def mao_pedestal(self, f=None):
        p = Vector((self.pe.x, self.pe.y, 1.12))
        dd, pa = Vector((0, -1, 0)), Vector((-1, 0, 0))
        punho = p - dd * 0.05 - pa * 0.026
        return alvo_mao(punho, dd, pa, punho + Vector((0.30, 0.25, -0.25)))

    def rel_ombro(self, lado, off, dd, pa, polo=(0.30, 0.30, -0.25)):
        def fn(f):
            Sh = self.ctx["ombro_" + lado]
            return alvo_mao(Sh + Vector(off), Vector(dd), Vector(pa), Sh + Vector(polo))
        return fn

    def solta(self, lado):
        sg = 1 if lado == "l" else -1
        return self.rel_ombro(lado, (0.035 * sg, -0.045, -0.405), (0.06 * sg, -0.12, -1), (-sg, 0.25, 0), (0.30 * sg, 0.45, -0.25))

    def gestos(self):
        """Mao esquerda no loop: sobe na frente (palma p/ cima), abre para o lado, volta ao peito, desce (periodo 144)."""
        sol = self.solta("l")
        frente = self.rel_ombro("l", (0.08, -0.30, -0.14), (0.15, -1.0, 0.25), (0.1, -0.2, 1.0))
        abre = self.rel_ombro("l", (0.30, -0.20, -0.10), (1.0, -0.5, 0.15), (0.2, -1.0, 0.25), (0.40, 0.20, -0.25))
        peito = self.rel_ombro("l", (-0.13, -0.15, -0.16), (-1.0, -0.1, 0.35), (0.0, 1.0, 0.0), (0.30, 0.10, -0.30))
        return Caminho((0, sol), (8, sol), (30, frente), (40, frente), (62, abre), (74, abre), (96, peito), (112, peito), (136, sol), (144, sol)), \
            Caminho((0, fixo(G("solta"))), (14, fixo(G("aberta"))), (90, fixo(G("aberta"))), (100, fixo(G("segura"))), (116, fixo(G("segura"))),
                    (132, fixo(G("solta"))), (144, fixo(G("solta"))))

    def lv(self, t):
        b = BATIDA
        return dict(inc=11.0 + 1.0 * math.sin(2 * math.pi * t / 72), cab=-4.0 + 2.0 * (0.5 + 0.5 * math.cos(2 * math.pi * t / b)),
                    cab_lado=3.0 * math.sin(2 * math.pi * t / 72), giro=4.0 * math.sin(2 * math.pi * (t - 20) / 144),
                    lado=2.0 * math.sin(2 * math.pi * t / 72), cab_giro=-3.0 * math.sin(2 * math.pi * (t - 20) / 144),
                    balanco=0.022 * math.sin(2 * math.pi * t / 72), dobra=0.010 * (0.5 + 0.5 * math.cos(2 * math.pi * t / b)))

    def corpo(self, f, tr):
        rig = self.rig
        P = Pose()
        rp = tr["raiz"](f)
        bal = tr["balanco"](f) if "balanco" in tr else 0.0
        P.quadril_pos = rp + self.H0 + tr["quad"](f) + Vector((bal, 0, -abs(bal) * 0.3))
        P.quadril_rot = rot(Y, -bal * 90.0) @ rot(Z, bal * 60.0)
        self.ctx["Rf"] = mat(rp, Matrix.Identity(3))
        tronco(P, *((tr[k](f) if k in tr else 0.0) for k in ("inc", "giro", "lado", "pesc", "cab", "cab_giro", "cab_lado")))
        r = respirar(f + tr.get("fase_resp", 0))
        P.soma("Spine1", [(X, -0.8 * r)])
        P.soma("Spine2", [(X, -0.8 * r - (tr["peito"](f) if "peito" in tr else 0.0))])
        for s, L in (("l", "Left"), ("r", "Right")):
            P.fk[L + "Shoulder"] = [(Y, (tr["ombros"](f) if "ombros" in tr else 0.0) * (1 if s == "l" else -1))]
        rig.resolver(P)
        for s, L in (("l", "Left"), ("r", "Right")):
            self.ctx["ombro_" + s] = rig.Mw(L + "Arm").translation
        return P

    def finalizar(self, P, f, tr, pes):
        for s in "lr":
            P.maos[s] = para_alvo(tr["mao_" + s](f))
            aplicar_dedos(self.rig, P, s, tr["dedos_" + s](f))
            pes[s].aplicar(P, f)
        return P

    def pes_cantando(self):
        R = mat(self.raiz_canta, Matrix.Identity(3))
        pes = {s: Pe(self.rig, s, Pe.bola_em(self.rig, s, R), 0.0) for s in "lr"}
        pes["r"].b = Trilha((0, Pe.bola_em(self.rig, "r", R) + Vector((-0.02, 0.06, 0)), True))   # pe direito meio passo atras
        pes["r"].y = Trilha((0, -10.0, True))
        return pes

    # ---------------------------------------------------------- 1) chega e pega o microfone
    def clipe_chegar_pegar(self):
        rig, N, O = self.rig, self.N["chegar_pegar"], Vector()
        tr = dict(
            raiz=Trilha((0, O, True), (10, O, True), (32, self.raiz_canta, True)),
            quad=Trilha((0, (0, 0, 0), True), (32, (0, 0.03, -0.01)), (N, (0, 0.03, -0.01), True)),
            inc=Trilha((0, 2.0, True), (12, 3.0), (34, 9.0), (46, 10.0), (64, 7.0), (N, 7.0, True)),
            cab=Trilha((0, 10.0, True), (16, 14.0), (36, 6.0), (52, -4.0), (64, 2.0), (74, -3.0), (N, -2.0, True)),
            cab_giro=Trilha((0, 0.0, True), (46, 0.0), (56, 14.0), (68, -10.0), (80, 0.0), (N, 0.0, True)),
            mao_r=Caminho((0, self.solta("r")), (12, self.solta("r")), (34, self.mao_mic), (N, self.mao_mic)),
            mao_l=Caminho((0, self.solta("l")), (22, self.solta("l")), (42, self.mao_pedestal), (N, self.mao_pedestal)),
            dedos_r=Caminho((0, fixo(G("solta"))), (26, fixo(G("aberta"))), (34, fixo(G("mic"))), (N, fixo(G("mic")))),
            dedos_l=Caminho((0, fixo(G("solta"))), (34, fixo(G("aberta"))), (42, fixo(G("segura"))), (N, fixo(G("segura")))),
        )
        pes = {s: Pe(rig, s, Pe.bola_em(rig, s, Matrix.Identity(4)), 0.0) for s in "lr"}
        alvo = self.pes_cantando()
        pes["l"].passo(10, 22, alvo["l"].b(0), 0.0, alt=0.05)
        pes["r"].passo(18, 31, alvo["r"].b(0), -10.0, alt=0.05)
        out = []
        for f in range(N):
            P = self.corpo(f, tr)
            out.append(self.finalizar(P, f, tr, pes))
        return out

    def trilhas_canta(self):
        return dict(raiz=fixo(self.raiz_canta), quad=fixo(Vector((0, 0.03, -0.01))))

    # ---------------------------------------------------------- 2) respira, chega no microfone e comeca a cantar
    def clipe_comecar_cantar(self):
        N = self.N["comecar_cantar"]
        L0 = lambda f: self.lv(f - N)
        w = Trilha((0, 0.0, True), (40, 0.0, True), (64, 1.0, True))
        mix = lambda k, base_: (lambda f: lerp(base_(f) if callable(base_) else base_, L0(f)[k], w(f)))
        tr = self.trilhas_canta()
        ges, ges_d = self.gestos()
        tr.update(
            inc=mix("inc", Trilha((0, 7.0, True), (16, 3.0), (34, 12.0), (N, 11.0))),
            cab=mix("cab", Trilha((0, -2.0, True), (16, -10.0), (34, -2.0), (N, -3.0))),
            peito=Trilha((0, 0.0, True), (16, 5.0), (30, 0.0, True)),
            ombros=Trilha((0, 0.0, True), (16, 6.0), (30, 0.0, True)),
            cab_lado=mix("cab_lado", 0.0), giro=mix("giro", 0.0), lado=mix("lado", 0.0), cab_giro=mix("cab_giro", 0.0),
            balanco=lambda f: L0(f)["balanco"] * w(f),
            mao_r=self.mao_mic, dedos_r=fixo(G("mic")),
            mao_l=Caminho((0, self.mao_pedestal), (30, self.mao_pedestal), (50, self.solta("l")), (58, lambda f: ges(f - N)), (N, lambda f: ges(f - N))),
            dedos_l=Caminho((0, fixo(G("segura"))), (32, fixo(G("segura"))), (42, fixo(G("solta"))), (58, lambda f: ges_d(f - N)), (N, lambda f: ges_d(f - N))),
        )
        pes = self.pes_cantando()
        out = []
        for f in range(N):
            P = self.corpo(f, tr)
            out.append(self.finalizar(P, f, tr, pes))
        return out

    # ---------------------------------------------------------- 3) cantando (loop)
    def clipe_cantando_loop(self):
        N = self.N["cantando_loop"]
        tr = self.trilhas_canta()
        for k in ("inc", "cab", "cab_lado", "giro", "lado", "cab_giro", "balanco"):
            tr[k] = (lambda kk: (lambda f: self.lv(f)[kk]))(k)
        tr["quad"] = lambda f: Vector((0, 0.03, -0.01 - self.lv(f)["dobra"]))
        ges, ges_d = self.gestos()
        tr.update(mao_r=self.mao_mic, dedos_r=fixo(G("mic")), mao_l=ges, dedos_l=ges_d)
        pes = self.pes_cantando()
        out = []
        for f in range(N + 1):
            P = self.corpo(f, tr)
            out.append(self.finalizar(P, f, tr, pes))
        return out

    # ---------------------------------------------------------- 4) agradece e sai
    def clipe_parar_sair(self):
        rig, N, O = self.rig, self.N["parar_sair"], Vector()
        w = Trilha((0, 1.0, True), (6, 1.0), (18, 0.0, True))
        mix = lambda k, depois: (lambda f: lerp(depois(f) if callable(depois) else depois, self.lv(f)[k], w(f)))
        ges, ges_d = self.gestos()
        aceno = lambda f: self.rel_ombro("l", (0.16, -0.12, 0.30), (math.sin(f * 0.55) * 0.35, -0.1, 1.0), (0.0, -1.0, 0.1), (0.40, 0.10, -0.10))(f)
        tr = dict(
            raiz=Trilha((0, self.raiz_canta, True), (48, self.raiz_canta, True), (70, O, True)),
            quad=Trilha((0, (0, 0.03, -0.01), True), (48, (0, 0.03, -0.01)), (70, (0, 0, 0), True)),
            inc=mix("inc", Trilha((0, 11.0, True), (16, 2.0), (36, 4.0), (52, 6.0), (72, 2.0), (N, 2.0, True))),
            cab=mix("cab", Trilha((0, -3.0, True), (16, -8.0), (30, 4.0), (40, -2.0), (66, 8.0), (N, 10.0, True))),
            cab_giro=mix("cab_giro", Trilha((0, 0.0, True), (20, 10.0), (34, -10.0), (48, 0.0), (N, 0.0, True))),
            cab_lado=mix("cab_lado", 0.0), giro=mix("giro", 0.0), lado=mix("lado", 0.0),
            balanco=lambda f: self.lv(f)["balanco"] * w(f),
            mao_r=Caminho((0, self.mao_mic), (38, self.mao_mic), (56, self.solta("r")), (N, self.solta("r"))),
            mao_l=Caminho((0, ges), (6, ges), (20, aceno), (40, aceno), (60, self.solta("l")), (N, self.solta("l"))),
            dedos_r=Caminho((0, fixo(G("mic"))), (38, fixo(G("mic"))), (46, fixo(G("aberta"))), (58, fixo(G("solta"))), (N, fixo(G("solta")))),
            dedos_l=Caminho((0, ges_d), (6, ges_d), (18, fixo(G("aberta"))), (40, fixo(G("aberta"))), (56, fixo(G("solta"))), (N, fixo(G("solta")))),
            fase_resp=-N,
        )
        pes = self.pes_cantando()
        R0 = Matrix.Identity(4)
        pes["r"].passo(46, 58, Pe.bola_em(rig, "r", R0), 0.0, alt=0.05)
        pes["l"].passo(56, 69, Pe.bola_em(rig, "l", R0), 0.0, alt=0.05)
        out = []
        for f in range(N):
            P = self.corpo(f, tr)
            out.append(self.finalizar(P, f, tr, pes))
        return out


class Bateria:
    """Banco da bateria: chega pelo lado direito do banco, senta, pega as baquetas no surdo e toca."""
    N = {"sentar_pegar": 130, "comecar_tocar": 90, "tocando_loop": 144, "parar_sair": 120}
    PROPS = {"Prop_Baqueta_D": "Ref_Baqueta_1", "Prop_Baqueta_E": "Ref_Baqueta_2"}

    def __init__(self, rig, obs):
        self.rig = rig
        Mk = obs["Palco_Bateria"].matrix_world.copy()
        self.p = {k: Mk @ Vector(v) for k, v in BAT.items()}
        self.T = self.p["banco"]
        self.Hs = self.T + Vector((0.0, 0.03, 0.152))
        self.H0 = rig.pos_w("Hips")
        self.fw, self.lt = -Y, X
        self.alvo_previa = self.T + Vector((0, -0.25, 0.45))
        self.raiz_lado = Vector((self.T.x - 0.25, 0.0, 0.0))            # em pe ao lado do banco antes de sentar
        b1, b2 = obs["Ref_Baqueta_1"].matrix_world, obs["Ref_Baqueta_2"].matrix_world
        self.D0 = quadro_baq(b1.translation, b1.col[2].to_3d(), -Z)
        self.E0 = quadro_baq(b2.translation, b2.col[2].to_3d(), -Z)
        self.rel_E = self.D0.inverted() @ self.E0
        self.piv = {"d": self.T + Vector((-0.20, -0.11, 0.42)), "e": self.T + Vector((0.20, -0.11, 0.42))}
        c = self.p["caixa"]
        self.pronto = {"d": self.baq_em("d", c + Vector((-0.05, 0.0, 0.03))), "e": self.baq_em("e", c + Vector((0.05, 0.02, 0.03)))}
        self.ctx = {}

    def baq_em(self, lado, ponta):
        g = Toques(self.piv[lado], [(0, ponta, 0)]).grip_de(Vector(ponta))
        return quadro_baq(g, Vector(ponta) - g, palma_toque(lado))

    def baq_toques(self, toques, lado, t):
        ponta, grip = toques(t)
        return quadro_baq(grip, ponta - grip, palma_toque(lado))

    # ---------------------------------------------------------- loop (2 compassos, virada no fim, ataque no 1)
    def batidas(self):
        p = self.p
        b = BATIDA
        d = [(i * b / 2, p["conducao"], 0.07) for i in range(12)]
        d[0] = (0.0, p["conducao"], 0.15)
        d += [(108, p["caixa"], 0.08), (117, p["caixa"], 0.06), (130.5, p["tom2"], 0.07), (139.5, p["tom2"], 0.06)]
        e = [(0.0, p["ataque"], 0.20), (18, p["caixa"], 0.16), (54, p["caixa"], 0.16), (90, p["caixa"], 0.16),
             (112.5, p["caixa"], 0.06), (121.5, p["caixa"], 0.06), (126, p["tom1"], 0.07), (135, p["tom1"], 0.06)]
        return Toques(self.piv["d"], d, 144), Toques(self.piv["e"], e, 144)

    def lv(self, t):
        b = BATIDA
        bump = lambda tc, w=3.0: sum(math.exp(-(((t - tc + k * 144) / w) ** 2)) for k in (-1, 0, 1))
        bumbo = sum(bump(tc, 2.5) for tc in (0, 36, 45, 72, 108, 117))
        chimbal = sum(bump(tc, 3.0) for tc in (18, 54, 90, 126))
        return dict(cab=9.0 + 3.0 * (0.5 + 0.5 * math.cos(2 * math.pi * t / b)),
                    inc=9.0 + 1.0 * math.cos(2 * math.pi * t / b) + 3.0 * rampa(t % 144, 104, 112) * (1 - rampa(t % 144, 138, 144)),
                    giro=-4.0 * rampa(t % 144, 124, 130) * (1 - rampa(t % 144, 140, 144)) + 1.5 * math.sin(2 * math.pi * t / 72),
                    cab_giro=6.0 * math.sin(2 * math.pi * t / 144), lado=1.0 * math.sin(2 * math.pi * t / 72),
                    pula=0.004 * (0.5 + 0.5 * math.cos(2 * math.pi * t / b)), bumbo=-10.0 * bumbo, chimbal=-8.0 * chimbal)

    # ---------------------------------------------------------- quadro
    def corpo(self, f, tr, sent):
        rig = self.rig
        P = Pose()
        rp = tr["raiz"](f)
        Rf = mat(rp, Matrix.Identity(3))
        hp_pe = Rf @ (self.H0 + tr["quad"](f))
        hp_s = self.Hs + (tr["quad_s"](f) if "quad_s" in tr else Vector())
        P.quadril_pos = hp_pe.lerp(hp_s, sent)
        P.quadril_rot = rot(X, -5.0 * sent + (tr["pelve"](f) if "pelve" in tr else 0.0)) @ rot(Y, tr["pelve_lado"](f) if "pelve_lado" in tr else 0.0)
        self.ctx["Rf"] = Rf
        tronco(P, *((tr[k](f) if k in tr else 0.0) for k in ("inc", "giro", "lado", "pesc", "cab", "cab_giro", "cab_lado")))
        r = respirar(f + tr.get("fase_resp", 0))
        P.soma("Spine1", [(X, -0.8 * r)])
        P.soma("Spine2", [(X, -0.8 * r)])
        rig.resolver(P)
        for s, L in (("l", "Left"), ("r", "Right")):
            self.ctx["ombro_" + s] = rig.Mw(L + "Arm").translation
        return P

    def solta(self, lado):
        sg = 1 if lado == "l" else -1

        def fn(f):
            Sh = self.ctx["ombro_" + lado]
            return alvo_mao(Sh + Vector((0.035 * sg, -0.045, -0.405)), Vector((0.06 * sg, -0.12, -1)), Vector((-sg, 0.25, 0)),
                            Sh + Vector((0.30 * sg, 0.45, -0.25)))
        return fn

    def finalizar(self, P, f, tr, pes, inc_pe=None):
        D, E = tr["baq_d"](f), tr["baq_e"](f)
        P.props["Prop_Baqueta_D"], P.props["Prop_Baqueta_E"] = D, E
        self.ctx["D"], self.ctx["E"] = D, E
        for s in "lr":
            P.maos[s] = para_alvo(tr["mao_" + s](f))
            aplicar_dedos(self.rig, P, s, tr["dedos_" + s](f))
            pes[s].aplicar(P, f, inc_extra=(inc_pe[s](f) if inc_pe and s in inc_pe else 0.0))
        return P

    def mao_baq(self, lado):
        k = "D" if lado == "d" else "E"
        return lambda f: mao_da_baqueta(self.ctx[k], lado)

    def pes_pedais(self):
        return {"r": self.p["bumbo"], "l": self.p["chimbal"]}

    def pes_sentado(self):
        pp = self.pes_pedais()
        pes = {s: Pe(self.rig, s, pp[s], -12.0 if s == "l" else 0.0) for s in "lr"}
        pes["r"].i = Trilha((0, 14.0, True))
        pes["l"].i = Trilha((0, 10.0, True))
        return pes

    def trilhas_sentado(self):
        return dict(raiz=fixo(self.raiz_lado), quad=fixo(Vector()))

    # ---------------------------------------------------------- 1) senta e pega as baquetas no surdo
    def clipe_sentar_pegar(self):
        rig, N, O = self.rig, self.N["sentar_pegar"], Vector()
        D_mao = quadro_baq(self.T + Vector((-0.06, -0.30, 0.40)), Vector((0.55, -0.75, 0.05)), Vector((0.15, 0.0, -1.0)))
        D = Caminho((0, fixo(self.D0)), (80, fixo(self.D0)), (96, fixo(D_mao)), (112, fixo(self.pronto["d"])), (N, fixo(self.pronto["d"])))
        E_junto = lambda f: D(f) @ self.rel_E
        E = Caminho((0, fixo(self.E0)), (80, fixo(self.E0)), (81, E_junto), (98, E_junto), (114, fixo(self.pronto["e"])), (N, fixo(self.pronto["e"])))
        tr = dict(
            raiz=Trilha((0, O, True), (10, O, True), (30, self.raiz_lado, True)),
            quad=Trilha((0, (0, 0, 0), True), (30, (0, 0, -0.01)), (N, (0, 0, -0.01), True)),
            quad_s=Trilha((0, (0, 0, 0), True), (66, (0, 0, 0)), (78, (-0.03, 0.01, -0.01)), (92, (0, 0, 0)), (N, (0, 0, 0), True)),
            inc=Trilha((0, 2.0, True), (12, 4.0), (32, 6.0), (46, 14.0), (60, 8.0), (78, 20.0), (90, 12.0), (112, 9.0), (N, 9.0, True)),
            lado=Trilha((0, 0.0, True), (60, 0.0), (78, -16.0), (90, -6.0), (104, 0.0), (N, 0.0, True)),
            giro=Trilha((0, 0.0, True), (60, 0.0), (78, -22.0), (92, -8.0), (106, 0.0), (N, 0.0, True)),
            cab=Trilha((0, 10.0, True), (14, 14.0), (40, 16.0), (62, 10.0), (78, 26.0), (96, 18.0), (116, 8.0), (N, 9.0, True)),
            cab_giro=Trilha((0, 0.0, True), (6, 20.0), (26, 26.0), (44, 0.0), (62, -12.0), (78, -24.0), (96, 0.0), (118, -4.0), (N, 0.0, True)),
            baq_d=D, baq_e=E,
            mao_r=Caminho((0, self.solta("r")), (60, self.solta("r")), (80, self.mao_baq("d")), (N, self.mao_baq("d"))),
            mao_l=Caminho((0, self.solta("l")), (86, self.solta("l")), (98, self.mao_baq("e")), (N, self.mao_baq("e"))),
            dedos_r=Caminho((0, fixo(G("solta"))), (72, fixo(G("solta"))), (80, fixo(G("baqueta"))), (N, fixo(G("baqueta")))),
            dedos_l=Caminho((0, fixo(G("solta"))), (90, fixo(G("solta"))), (98, fixo(G("baqueta"))), (N, fixo(G("baqueta")))),
        )
        sent = Trilha((0, 0.0, True), (30, 0.0, True), (52, 1.0, True))
        R0 = Matrix.Identity(4)
        Rl = mat(self.raiz_lado, Matrix.Identity(3))
        pes = {s: Pe(rig, s, Pe.bola_em(rig, s, R0), 0.0) for s in "lr"}
        pes["l"].passo(10, 21, Pe.bola_em(rig, "l", Rl), 0.0, alt=0.05)
        pes["r"].passo(18, 29, Pe.bola_em(rig, "r", Rl), 0.0, alt=0.05)
        pp = self.pes_pedais()
        pes["r"].ir(46, 58, bola=pp["r"], inc=14.0, arco=0.08)
        pes["l"].ir(50, 62, bola=pp["l"], yaw=-12.0, inc=10.0, arco=0.08)
        out = []
        for f in range(N):
            P = self.corpo(f, tr, sent(f))
            out.append(self.finalizar(P, f, tr, pes))
        return out

    # ---------------------------------------------------------- 2) contagem batendo as baquetas e entra no "1"
    def clipe_comecar_tocar(self):
        N = self.N["comecar_tocar"]
        td, te = self.batidas()
        cliques = (18, 36, 54, 72)
        sep = lambda f: 1.0 - max(math.exp(-((f - c) / 2.6) ** 2) for c in cliques)
        X0 = self.T + Vector((0.0, -0.30, 1.20))

        def baq_contagem(lado):
            sg = -1 if lado == "d" else 1

            def fn(f):
                s = sep(f)
                g = X0 + Vector((0.13 * sg + 0.03 * sg * s, 0.06, -0.24))
                d = Vector((-0.45 * sg + 0.25 * sg * s, -0.25, 1.0))
                return quadro_baq(g, d, Vector((-sg * 0.8, 0.5, 0.0)))
            return fn
        lp = lambda lado, toq: (lambda f: self.baq_toques(toq, lado, f - N))
        D = Caminho((0, fixo(self.pronto["d"])), (6, fixo(self.pronto["d"])), (14, baq_contagem("d")), (74, baq_contagem("d")), (84, lp("d", td)), (N, lp("d", td)))
        E = Caminho((0, fixo(self.pronto["e"])), (6, fixo(self.pronto["e"])), (14, baq_contagem("e")), (74, baq_contagem("e")), (84, lp("e", te)), (N, lp("e", te)))
        w = Trilha((0, 0.0, True), (70, 0.0, True), (86, 1.0, True))
        L0 = lambda f: self.lv(f - N)
        mix = lambda k, base_: (lambda f: lerp(base_(f) if callable(base_) else base_, L0(f)[k], w(f)))
        nod = lambda f: 5.0 * sum(math.exp(-((f - c) / 4.0) ** 2) for c in cliques)
        tr = self.trilhas_sentado()
        tr.update(
            inc=mix("inc", Trilha((0, 9.0, True), (14, 5.0), (60, 5.0), (N, 9.0, True))),
            cab=mix("cab", lambda f: Trilha((0, 9.0, True), (14, 0.0), (60, 2.0), (N, 9.0, True))(f) + nod(f)),
            cab_giro=mix("cab_giro", 0.0), giro=mix("giro", 0.0), lado=mix("lado", 0.0),
            quad_s=lambda f: Vector((0, 0, L0(f)["pula"] * w(f))),
            baq_d=D, baq_e=E, mao_r=self.mao_baq("d"), mao_l=self.mao_baq("e"),
            dedos_r=fixo(G("baqueta")), dedos_l=fixo(G("baqueta")),
        )
        pes = self.pes_sentado()
        inc = {"r": lambda f: L0(f)["bumbo"] * w(f), "l": lambda f: -8.0 * (1 - sep(f)) * (1 - w(f)) + L0(f)["chimbal"] * w(f)}
        out = []
        for f in range(N):
            P = self.corpo(f, tr, 1.0)
            out.append(self.finalizar(P, f, tr, pes, inc_pe=inc))
        return out

    # ---------------------------------------------------------- 3) groove
    def clipe_tocando_loop(self):
        N = self.N["tocando_loop"]
        td, te = self.batidas()
        tr = self.trilhas_sentado()
        for k in ("inc", "cab", "cab_giro", "giro", "lado"):
            tr[k] = (lambda kk: (lambda f: self.lv(f)[kk]))(k)
        tr.update(quad_s=lambda f: Vector((0, 0, self.lv(f)["pula"])),
                  baq_d=lambda f: self.baq_toques(td, "d", f), baq_e=lambda f: self.baq_toques(te, "e", f),
                  mao_r=self.mao_baq("d"), mao_l=self.mao_baq("e"), dedos_r=fixo(G("baqueta")), dedos_l=fixo(G("baqueta")))
        pes = self.pes_sentado()
        inc = {"r": lambda f: self.lv(f)["bumbo"], "l": lambda f: self.lv(f)["chimbal"]}
        out = []
        for f in range(N + 1):
            P = self.corpo(f, tr, 1.0)
            out.append(self.finalizar(P, f, tr, pes, inc_pe=inc))
        return out

    # ---------------------------------------------------------- 4) batida final, devolve as baquetas e sai
    def clipe_parar_sair(self):
        rig, N, O = self.rig, self.N["parar_sair"], Vector()
        td, te = self.batidas()
        p = self.p
        fim_d = Toques(self.piv["d"], [(0, p["conducao"], 0.15), (9, p["conducao"], 0.07), (16, p["caixa"], 0.22)])
        fim_e = Toques(self.piv["e"], [(0, p["ataque"], 0.20), (16, p["ataque"], 0.22)])
        sobe_d = quadro_baq(self.T + Vector((-0.22, -0.20, 1.10)), Vector((-0.2, -0.3, 1.0)), Vector((0.8, 0.4, 0)))
        sobe_e = quadro_baq(self.T + Vector((0.22, -0.20, 1.10)), Vector((0.2, -0.3, 1.0)), Vector((-0.8, 0.4, 0)))
        D_mao = quadro_baq(self.T + Vector((-0.06, -0.30, 0.40)), Vector((0.55, -0.75, 0.05)), Vector((0.15, 0.0, -1.0)))
        D = Caminho((0, lambda f: self.baq_toques(fim_d, "d", f)), (16, lambda f: self.baq_toques(fim_d, "d", f)), (30, fixo(sobe_d)),
                    (40, fixo(sobe_d)), (52, fixo(D_mao)), (58, fixo(D_mao)), (74, fixo(self.D0)), (N, fixo(self.D0)))
        E_junto = lambda f: D(f) @ self.rel_E
        E = Caminho((0, lambda f: self.baq_toques(fim_e, "e", f)), (16, lambda f: self.baq_toques(fim_e, "e", f)), (30, fixo(sobe_e)),
                    (40, fixo(sobe_e)), (54, E_junto), (N, E_junto))
        sent = Trilha((0, 1.0, True), (78, 1.0, True), (96, 0.0, True))
        tr = dict(
            raiz=Trilha((0, self.raiz_lado, True), (98, self.raiz_lado, True), (114, O, True)),
            quad=Trilha((0, (0, 0, -0.01), True), (98, (0, 0, -0.01)), (114, (0, 0, 0), True)),
            quad_s=Trilha((0, (0, 0, 0), True), (56, (0, 0, 0)), (66, (-0.03, 0.01, -0.01)), (76, (0, 0, 0)), (N, (0, 0, 0), True)),
            inc=Trilha((0, self.lv(0)["inc"], True), (14, 14.0), (30, 0.0), (44, 4.0), (66, 20.0), (78, 10.0), (92, 12.0), (106, 4.0), (N, 2.0, True)),
            cab=Trilha((0, self.lv(0)["cab"], True), (16, 14.0), (30, -8.0), (42, 4.0), (66, 24.0), (82, 10.0), (104, 8.0), (N, 10.0, True)),
            lado=Trilha((0, self.lv(0)["lado"], True), (52, 0.0), (66, -14.0), (78, 0.0), (N, 0.0, True)),
            giro=Trilha((0, self.lv(0)["giro"], True), (52, 0.0), (66, -20.0), (80, 0.0), (N, 0.0, True)),
            cab_giro=Trilha((0, self.lv(0)["cab_giro"], True), (30, 0.0), (66, -22.0), (84, 0.0), (100, 18.0), (112, 0.0), (N, 0.0, True)),
            baq_d=D, baq_e=E,
            mao_r=Caminho((0, self.mao_baq("d")), (74, self.mao_baq("d")), (88, self.solta("r")), (N, self.solta("r"))),
            mao_l=Caminho((0, self.mao_baq("e")), (50, self.mao_baq("e")), (64, self.solta("l")), (N, self.solta("l"))),
            dedos_r=Caminho((0, fixo(G("baqueta"))), (74, fixo(G("baqueta"))), (82, fixo(G("solta"))), (N, fixo(G("solta")))),
            dedos_l=Caminho((0, fixo(G("baqueta"))), (52, fixo(G("baqueta"))), (58, fixo(G("solta"))), (N, fixo(G("solta")))),
            fase_resp=-N,
        )
        pes = self.pes_sentado()
        R0 = Matrix.Identity(4)
        Rl = mat(self.raiz_lado, Matrix.Identity(3))
        pes["l"].ir(80, 90, bola=Pe.bola_em(rig, "l", Rl), yaw=0.0, inc=0.0, arco=0.06)
        pes["r"].ir(84, 94, bola=Pe.bola_em(rig, "r", Rl), yaw=0.0, inc=0.0, arco=0.06)
        pes["r"].passo(98, 108, Pe.bola_em(rig, "r", R0), 0.0, alt=0.05)
        pes["l"].passo(104, 114, Pe.bola_em(rig, "l", R0), 0.0, alt=0.05)
        inc = {"r": lambda f: -10.0 * math.exp(-((f - 16) / 2.5) ** 2) + self.lv(f)["bumbo"] * (1 - rampa(f, 4, 10))}
        out = []
        for f in range(N):
            P = self.corpo(f, tr, sent(f))
            out.append(self.finalizar(P, f, tr, pes, inc_pe=inc))
        return out


# ------------------------------------------------------------------ montar, conferir e exportar
def gerar(lugar):
    arm, corpo, nativo = preparar()
    rig = Rig(arm)
    obs, M_anc = carregar_palco(lugar)
    yaw_lugar = math.degrees(M_anc.to_euler().z)
    if lugar == "bateria":
        est = Bateria(rig, obs)
        fontes = {pn: obs[src] for pn, src in Bateria.PROPS.items()}
        obs["Palco_Baquetas"].hide_render = True
    elif lugar == "vocal":
        est = Vocal(rig, obs)
        fontes = {}
    else:
        est = Cordas(rig, obs, lugar, yaw_lugar)
        fontes = {est.c["prop"]: obs[est.c["inst"]]}
    props = {}
    for pn, src in fontes.items():
        o = bpy.data.objects.new(pn, src.data)
        bpy.context.scene.collection.objects.link(o)
        o.rotation_mode = 'QUATERNION'
        src.hide_render = src.hide_viewport = True
        props[pn] = o
    acoes = {}
    for clip, n in est.N.items():
        poses = getattr(est, "clipe_" + clip)()
        g = Gravador(rig, "%s_%s" % (lugar, clip))
        for P in poses:
            g.quadro(P)
        acoes[clip] = g.gravar(props)
        print("  %-14s %d quadros (%.1f s)" % (clip, len(poses), (len(poses) - 1) / FPS))
    return dict(arm=arm, corpo=corpo, nativo=nativo, est=est, props=props, acoes=acoes, obs=obs)


def mostrar(r, clip):
    acts = r["acoes"][clip]
    r["arm"].animation_data_create()
    r["arm"].animation_data.action = acts["Musico"]
    for pn, o in r["props"].items():
        o.animation_data_create()
        o.animation_data.action = acts.get(pn)
    n = len(acts["Musico"].fcurves[0].keyframe_points)
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 0, n - 1
    return n


def previas(r, lugar, quadros=None):
    est = r["est"]
    if isinstance(est, Cordas):
        alvo = est.C + Z * 1.0 + est.fwS * 0.05
        vistas = [tuple(est.fwS * 1.0 + est.ltS * 0.35 + Z * 0.25), tuple(-est.ltS * est.lado_banco + Z * 0.15)]
    else:
        alvo = est.alvo_previa
        vistas = [tuple(est.fw + est.lt * 0.35 + Z * 0.3), tuple(est.fw * 0.5 - est.lt + Z * 0.25)]
    for clip in est.N:
        n = mostrar(r, clip)
        qs = (quadros or {}).get(clip) or [int(round(i * (n - 1) / 7.0)) for i in range(8)]
        previa("%s_%s" % (lugar, clip), qs, vistas, alvo=tuple(alvo), dist=2.9, tam=(300, 380))


def _so(objs):
    vl = bpy.context.view_layer
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    vl.objects.active = objs[0]


def exportar_fbx(r, lugar):
    """Um FBX por clipe: so o esqueleto, na transformacao nativa do FBX do Mixamo (escala 0,01, origem no quadril)."""
    pasta = os.path.join(SAIDA, "fbx")
    os.makedirs(pasta, exist_ok=True)
    scn, arm, nat = bpy.context.scene, r["arm"], r["nativo"]
    arm.animation_data_create()
    guarda = (arm.location.copy(), arm.rotation_euler.copy(), arm.scale.copy())
    arm.location, arm.rotation_euler, arm.scale = nat["loc"], nat["rot"], nat["escala"]
    nome_cena = scn.name
    try:
        for clip, acts in r["acoes"].items():
            nome = "%s_%s" % (lugar, clip)
            arm.animation_data.action = acts["Musico"]
            n = len(acts["Musico"].fcurves[0].keyframe_points)
            scn.frame_start, scn.frame_end = 0, n - 1
            scn.name = nome                                   # o FBX nomeia o take com o nome da cena
            _so([arm])
            bpy.ops.export_scene.fbx(filepath=os.path.join(pasta, nome + ".fbx"), use_selection=True, object_types={'ARMATURE'},
                                     add_leaf_bones=False, use_armature_deform_only=False, bake_anim=True,
                                     bake_anim_use_all_actions=False, bake_anim_use_nla_strips=False,
                                     bake_anim_force_startend_keying=True, bake_anim_step=1.0, bake_anim_simplify_factor=0.0)
    finally:
        scn.name = nome_cena
        arm.location, arm.rotation_euler, arm.scale = guarda
        arm.animation_data.action = None


def exportar_glb(r, lugar):
    """palco_<lugar>.glb: esqueleto (sem malha) + instrumentos + 4 clipes; cada clipe anima ossos e instrumentos juntos
    (uma faixa de NLA com o nome do clipe em cada objeto: o exportador junta as de mesmo nome)."""
    os.makedirs(SAIDA, exist_ok=True)
    scn, arm, props = bpy.context.scene, r["arm"], r["props"]
    objs = [arm] + list(props.values())
    for o in objs:
        o.animation_data_create()
        o.animation_data.action = None
        for t in list(o.animation_data.nla_tracks):
            o.animation_data.nla_tracks.remove(t)
    nomes = []
    for clip, acts in r["acoes"].items():
        nome = "%s_%s" % (lugar, clip)
        nomes.append(nome)
        for o in objs:
            act = acts["Musico"] if o is arm else acts.get(o.name)
            if act is None:
                continue
            t = o.animation_data.nla_tracks.new()
            t.name = nome
            t.strips.new(nome, int(act.frame_range[0]), act)
    corpo = r.get("corpo")
    if corpo is not None and corpo.name in bpy.data.objects:
        bpy.data.objects.remove(corpo, do_unlink=True)      # a malha da previa nao vai no arquivo
    scn["lugar"] = lugar
    scn["clipes"] = ",".join(nomes)
    scn["fps"] = FPS
    scn["altura_personagem_m"] = ALTURA
    scn["props"] = ",".join(props)
    scn["descricao"] = "Espaco do vazio Palco_Lugar_%s (origem no piso, personagem olhando para +Z). Esqueleto Mixamo." % lugar.capitalize()
    _so(objs)
    out = os.path.join(SAIDA, "palco_%s.glb" % lugar)
    props_rna = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    op = dict(filepath=out, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='NLA_TRACKS',
              export_force_sampling=True, export_frame_step=1, export_anim_slide_to_zero=True, export_optimize_animation_size=False,
              export_def_bones=False, export_skins=True, export_morph=False, export_materials='EXPORT', export_image_format='AUTO',
              export_cameras=False, export_lights=False, export_extras=True, export_yup=True, export_apply=False,
              export_texcoord=True, export_normals=True, will_save_settings=False)
    bpy.ops.export_scene.gltf(**{k: v for k, v in op.items() if k in props_rna})
    print("GLB", out, "%.0f KB" % (os.path.getsize(out) / 1024))
    return out


if __name__ == "__main__":
    lugares = [a for a in ARGS if not a.startswith("--")] or ["violao", "cavaquinho", "bateria", "vocal"]
    for lugar in lugares:
        print("==", lugar)
        r = gerar(lugar)
        if "--previa" in ARGS:
            previas(r, lugar)
        if "--sem-export" not in ARGS:
            exportar_fbx(r, lugar)
            exportar_glb(r, lugar)
