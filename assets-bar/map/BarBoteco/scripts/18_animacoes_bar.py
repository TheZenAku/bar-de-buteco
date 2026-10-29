# Animacoes dos personagens do bar (esqueleto Mixamo das skins, 41 ossos), autoradas no rafael-mixamo.fbx na ALTURA REAL
# do modelo (1 unidade do FBX = 1 m -> 1,89 m; o FBX declara "cm", por isso chega com 1,9 cm em quem respeita a unidade).
# Roda no Blender em SEGUNDO PLANO (nao mexe na cena aberta do mapa):
#   "D:\SteamLibrary\steamapps\common\Blender\blender.exe" -b --factory-startup -P 18_animacoes_bar.py -- [grupo ...] [--previa] [--sem-export]
# Grupos (um GLB cada, em export/animacoes/bar_<grupo>.glb, + um FBX por clipe em export/animacoes/fbx/):
#   locomocao  parado_loop, andar_loop, andar_bebado_loop, cair, levantar_chao        (no lugar, frente = +Z no three.js)
#   fumar      fumar_acender, fumar_loop, fumar_apagar        (cigarro, isqueiro, brasa; FX de fumaca na ponta e na boca)
#   vomitar    vomitar                                        (poca; FX de vomito verde)
#   cadeira    sentar, sentado_loop, comer_comecar, comer_loop, comer_terminar, levantar   (espaco da cadeira; puxa a cadeira)
#   mesa       limpar_mesa                                    (espaco da mesa vermelha, pela quina)
#   banheiro   urinar                                         (espaco do vazio Mictorio_Lugar_N; FX do jato)
#   magrao     magrao_chopp, magrao_chopp_escuro, magrao_longneck   (espaco do Balcao_Lugar_Magrao; le anim/bar_ref.blend)
# Cada GLB: esqueleto (sem malha) + props (Prop_*) + emissores (FX_*: a escala e a intensidade) + clipes (faixas NLA de mesmo nome
# em todos os objetos). Extras da cena: "bar_animacoes" (JSON com clipes, loops, quem segue qual osso, FX, entregas).
# O export/animacoes/animacoes_bar.js faz o retarget para qualquer skin Mixamo e cuida de props, FX e cadeiras.
# Metodo (o mesmo do 16_animacoes_palco.py, de onde vem o kit): cada quadro e calculado em Python (quadril e coluna em FK,
# bracos e pernas com IK analitico de 2 ossos, pes com rolagem calcanhar/bola) e gravado direto nas curvas.
import bpy, math, os, sys, json, importlib
import numpy as np
from mathutils import Vector, Matrix, Quaternion

DIR = r"C:\Users\rafael\BarBoteco\scripts"
if DIR not in sys.path:
    sys.path.insert(0, DIR)
K = importlib.import_module("16_animacoes_palco")            # kit: Rig, Pose, Trilha, Caminho, Pe, IK...
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ROOT = r"C:\Users\rafael\BarBoteco"
FBX = r"C:\Users\rafael\Desktop\BAR\2.0\skins\rafael\rafael-mixamo.fbx"
REF = os.path.join(ROOT, "anim", "bar_ref.blend")
SAIDA = os.path.join(ROOT, "export", "animacoes")
K.PREVIA = os.path.join(ROOT, "anim", "previa_bar")
FPS = 30
PFX = K.PFX
X, Y, Z = K.X, K.Y, K.Z
lerp, suave, rampa, rot, giro_z, base, mat, mistura_m = K.lerp, K.suave, K.rampa, K.rot, K.giro_z, K.base, K.mat, K.mistura_m
Trilha, Caminho, Alvo, Pe, misturar, fixo, alvo_mao, em, para_alvo = (K.Trilha, K.Caminho, K.Alvo, K.Pe, K.misturar, K.fixo,
                                                                     K.alvo_mao, K.em, K.para_alvo)
tronco, respirar = K.tronco, K.respirar
# eixos (personagem olhando para -Y): inclinar p/ frente = +X | virar p/ esquerda = +Z | tombar p/ esquerda = +Y
# a esquerda do personagem e +X, a direita -X

K.MAOS.update({                    # (indicador, oposicao do polegar, flexao do polegar)
    "pinca": ((38, 48, 30), 42, 22),          # cigarro entre o polegar e o indicador
    "garfo": ((30, 42, 30), 34, 10),
    "copo": ((48, 58, 40), 32, 12),
    "garrafa": ((58, 68, 44), 40, 18),
    "alavanca": ((72, 86, 62), 52, 28),
    "pano": ((52, 60, 40), 38, 18),
    "apoio": ((6, 6, 3), 10, 0),
    "isqueiro": ((60, 72, 50), 20, 40),
    "bolso": ((25, 30, 20), 20, 10),
})
G = K.G


def per(t, T):
    return (t % T) / float(T)


def cs(a):
    return math.cos(2 * math.pi * a)


def sn(a):
    return math.sin(2 * math.pi * a)


class Seq:
    """Chaves (quadro, valor ou funcao f -> valor[, curva]): a curva vale para o trecho que CHEGA na chave:
    's' suave (padrao), 'a' acelera (queda), 'f' freia, 'l' linear. Valores: float, Vector, tupla, Matrix 4x4, (Matrix, polo)."""

    def __init__(self, *chaves):
        self.k = [(float(c[0]), c[1], c[2] if len(c) > 2 else 's') for c in chaves]

    @staticmethod
    def _v(x, f):
        return x(f) if callable(x) else x

    def __call__(self, f):
        k = self.k
        if f <= k[0][0]:
            return self._v(k[0][1], f)
        for (f0, a, _), (f1, b_, c) in zip(k, k[1:]):
            if f <= f1:
                t = (f - f0) / (f1 - f0) if f1 > f0 else 1.0
                t = {'s': suave(t), 'a': t * t, 'f': 1 - (1 - t) ** 2, 'l': t}[c]
                va, vb = self._v(a, f), self._v(b_, f)
                return va if va is vb else misturar(va, vb, t)
        return self._v(k[-1][1], f)


class Periodica:
    """Chaves (t, valor) num periodo T, interpolacao Catmull-Rom ciclica (sem soluco no loop)."""

    def __init__(self, T, *chaves):
        self.T = float(T)
        self.k = sorted(((float(t), Vector(v) if isinstance(v, (tuple, list, Vector)) else float(v)) for t, v in chaves),
                        key=lambda c: c[0])

    def __call__(self, t):
        T, k = self.T, self.k
        n = len(k)
        t = t % T
        i = max([j for j in range(n) if k[j][0] <= t] or [n - 1])
        t0, v0 = k[i]
        t1, v1 = k[(i + 1) % n]
        if t1 <= t0:
            t1 += T
        tt = t if t >= t0 else t + T
        tm, vm = k[(i - 1) % n]
        tp, vp = k[(i + 2) % n]
        tm = tm if tm < t0 else tm - T
        tp = tp if tp > t1 else tp + T
        h = t1 - t0
        u = (tt - t0) / h
        m0 = (v1 - vm) / (t1 - tm) * h
        m1 = (vp - v0) / (tp - t0) * h
        u2, u3 = u * u, u * u * u
        return v0 * (2 * u3 - 3 * u2 + 1) + m0 * (u3 - 2 * u2 + u) + v1 * (-2 * u3 + 3 * u2) + m1 * (u3 - u2)


# ------------------------------------------------------------------ personagem
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
        pb.scale = (1, 1, 1)
    nativo = dict(loc=arm.location.copy(), rot=arm.rotation_euler.copy(), escala=arm.scale.copy())
    arm.scale = (1.0, 1.0, 1.0)                        # 1 unidade do FBX = 1 m
    bpy.context.view_layer.update()
    co = np.empty(len(corpo.data.vertices) * 3, np.float32)
    corpo.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    Mw = np.array(corpo.matrix_world)
    W = co @ Mw[:3, :3].T + Mw[:3, 3]
    arm.location.z = -W[:, 2].min()
    W[:, 2] -= W[:, 2].min()
    bpy.context.view_layer.update()
    arm.name = arm.data.name = "Personagem"
    corpo.name = "Personagem_Corpo"
    dec = corpo.modifiers.new("previa", 'DECIMATE')     # so para renderizar a previa (a malha nao vai no GLB)
    dec.ratio = 0.12
    corpo.modifiers.move(len(corpo.modifiers) - 1, 0)
    with bpy.context.temp_override(object=corpo, active_object=corpo, selected_objects=[corpo]):
        bpy.ops.object.modifier_apply(modifier="previa")
    mt = bpy.data.materials.new("Pele_Previa")
    mt.diffuse_color = (0.72, 0.62, 0.55, 1.0)
    if not corpo.data.materials:
        corpo.data.materials.append(mt)
    print("personagem: %.3f m (escala 1, nativo %.3f)" % (W[:, 2].max(), nativo["escala"][0]))
    return arm, corpo, nativo, W


class Corpo:
    """Pontos do corpo no repouso, guardados no quadro de um osso (boca na cabeca, bolsos e virilha no quadril)."""

    def __init__(self, rig, W):
        self.rig = rig
        hb = rig.pos_w("Head")
        faixa = W[(W[:, 2] > hb.z + 0.01) & (W[:, 2] < hb.z + 0.07) & (np.abs(W[:, 0]) < 0.025)]
        i = faixa[:, 1].argmin()
        boca = Vector((0.0, float(faixa[i, 1]) + 0.012, float(faixa[i, 2])))
        topo = float(W[:, 2].max())
        quad = rig.pos_w("Hips")
        cint = W[(np.abs(W[:, 2] - (quad.z - 0.02)) < 0.02)]
        frente_q = float(cint[:, 1].min())
        tras_q = float(cint[:, 1].max())
        lado_q = float(np.abs(cint[:, 0]).max())
        self.altura = topo
        self.pts = {
            "boca": ("Head", boca),
            "nariz": ("Head", boca + Vector((0, -0.01, 0.035))),
            "olhos": ("Head", Vector((0.0, boca.y + 0.03, boca.z + 0.075))),
            "orelha_r": ("Head", Vector((-0.075, boca.y + 0.10, boca.z + 0.06))),
            "bolso_r": ("Hips", Vector((-lado_q * 0.80, frente_q + 0.035, quad.z - 0.10))),
            "bolso_l": ("Hips", Vector((lado_q * 0.80, frente_q + 0.035, quad.z - 0.10))),
            "bolso_tras_r": ("Hips", Vector((-lado_q * 0.55, tras_q - 0.01, quad.z - 0.08))),
            "virilha": ("Hips", Vector((0.0, frente_q + 0.01, quad.z - 0.13))),
            "barriga": ("Spine", Vector((0.0, frente_q - 0.01, quad.z + 0.17))),
            "peito": ("Spine2", Vector((0.0, frente_q + 0.005, rig.pos_w("Spine2").z + 0.06))),
        }
        self.local = {}
        for n, (osso, p) in self.pts.items():
            R = rig.rot_w(osso)
            self.local[n] = (osso, R.inverted() @ (p - rig.pos_w(osso)))
        print("corpo: boca %s | bolso_r %s | virilha %s" % (tuple(round(v, 3) for v in boca), tuple(round(v, 3) for v in self.pts["bolso_r"][1]),
                                                       tuple(round(v, 3) for v in self.pts["virilha"][1])))

    def w(self, nome):
        """Ponto no mundo depois de rig.resolver(P)."""
        osso, off = self.local[nome]
        return self.rig.Mw(osso) @ off


class Pose(K.Pose):
    def __init__(self):
        super().__init__()
        self.formas = {}                   # prop -> {shape key: valor}


# ------------------------------------------------------------------ pe com rolagem (calcanhar e bola)
class Pe2(Pe):
    """Como o Pe do 16, mas inclinacao negativa gira no calcanhar (pisada) e positiva na bola (impulso)."""

    def __init__(self, rig, lado, bola, yaw, f0=0):
        super().__init__(rig, lado, bola, yaw, f0)
        A0 = rig.pos_w(self.L + "Foot")
        B0 = rig.pos_w(self.L + "ToeBase")
        self.h0 = Vector((A0.x, A0.y + 0.045, B0.z - 0.012)) - B0           # bola -> calcanhar (no chao, atras do tornozelo)

    def alvo(self, B, yaw, inc, h=0.0, toe=None, polo_frente=0.6):
        Rz = giro_z(yaw)
        fr = Rz @ self.fr0
        R = rot(Z.cross(fr).normalized(), inc) @ Rz
        B = Vector(B) + Z * h
        if inc >= 0:
            tor = B + R @ self.v0
        else:
            hc = B + Rz @ self.h0
            tor = hc + R @ (self.v0 - self.h0)
        polo = tor + (Rz @ -Y) * polo_frente + Z * 0.45 + (Rz @ X) * (0.12 * self.sg)
        chao = max(0.0, 1.0 - h / 0.02)
        dobra = -max(inc, 0.0) * 0.85 * chao if toe is None else toe
        return Alvo(tor, R @ self.fr0, R @ Z, polo), dobra

    def aplicar(self, P, f, inc_extra=0.0, polo_frente=0.6):
        a, d = self.alvo(self.b(f), self.y(f), self.i(f) + inc_extra, self.h(f), polo_frente=polo_frente)
        P.pes[self.lado] = a
        P.fk[self.L + "ToeBase"] = [(self.dobra_dedo, d)]

    def passo(self, f0, f1, bola, yaw, alt=0.06, ergue=24.0, pisa=-14.0):
        """Passo natural: calcanhar sobe na bola, pe voa em arco e pisa de calcanhar, depois assenta."""
        self._seg(f0)
        d = f1 - f0
        fa = f0 + d * 0.22
        self.i.add(fa, ergue)
        self.b.add(f1, Vector(bola), True)
        self.y.add(f1, float(yaw), True)
        self.h.add(lerp(fa, f1, 0.42), alt)
        self.h.add(f1, 0.0, True)
        self.i.add(lerp(fa, f1, 0.5), 4.0)
        self.i.add(f1, pisa, True)
        self.i.add(f1 + max(3.0, d * 0.25), 0.0, True)
        for t in (self.b, self.y, self.h):
            t.add(f1 + max(3.0, d * 0.25), t(f1 + max(3.0, d * 0.25)), True)


class Marcha:
    """Caminhada no lugar (periodica). contatos[s] = [(t_pisa, t_sai, x, yaw, s_pisa)] em quadros dentro do periodo T;
    s = quanto a bola (pe assentado) fica a frente do quadril na pisada. O chao corre para tras a v m/s."""

    def __init__(self, rig, T, v, contatos, alt=0.065, pisa=-16.0, sai=38.0):
        self.rig, self.T, self.v = rig, float(T), v
        self.c = contatos
        self.alt, self.pisa_i, self.sai_i = alt, pisa, sai
        self.balanco_i = Trilha((0.0, sai, True), (0.30, 12.0), (0.66, -2.0), (1.0, pisa, True))
        self.pes = {s: Pe2(rig, s, Pe.bola_em(rig, s, Matrix.Identity(4)), 0.0) for s in "lr"}
        self.z0 = {s: Pe.bola_em(rig, s, Matrix.Identity(4)).z for s in "lr"}

    def estado(self, s, t):
        T, cs_ = self.T, self.c[s]
        t = t % T
        n = len(cs_)
        for k, (tp, ts, x, yw, sp) in enumerate(cs_):
            d = (t - tp) % T
            dur = (ts - tp) % T
            if d <= dur:
                u = d / dur
                pos = sp - self.v * d / FPS
                # pisada: calcanhar -> chao em ~16%; calcanhar sobe a partir de 55%
                if u < 0.16:
                    inc = self.pisa_i * (1 - suave(u / 0.16))
                elif u < 0.55:
                    inc = 0.0
                else:
                    w = (u - 0.55) / 0.45
                    inc = self.sai_i * (w * w * (1.6 - 0.6 * w))
                return dict(x=x, yaw=yw, s=pos, h=0.0, inc=inc, apoio=1.0, u=u)
        # balanco: entre a saida de um contato e a pisada do proximo
        for k, (tp, ts, x, yw, sp) in enumerate(cs_):
            tp2, ts2, x2, yw2, sp2 = cs_[(k + 1) % n]
            dur = (tp2 - ts) % T
            d = (t - ts) % T
            if d <= dur:
                u = d / dur
                s0 = sp - self.v * ((ts - tp) % T) / FPS
                m = -self.v * dur / FPS
                u2, u3 = u * u, u * u * u
                pos = s0 * (2 * u3 - 3 * u2 + 1) + m * (u3 - 2 * u2 + u) + sp2 * (-2 * u3 + 3 * u2) + m * (u3 - u2)
                inc = self.balanco_i(u)
                h = self.alt * math.sin(math.pi * min(1.0, u / 0.92)) ** 1.3 * (1.0 if u < 0.92 else 0.0)
                return dict(x=lerp(x, x2, suave(u)), yaw=lerp(yw, yw2, suave(u)), s=pos, h=h, inc=inc, apoio=0.0, u=u)
        raise ValueError("contatos sem cobertura")

    def aplicar(self, P, t, Rr=None):
        """Pes no quadro de chao Rr (4x4; padrao = origem). Devolve os estados (para o quadril acompanhar)."""
        Rr = Rr if Rr is not None else Matrix.Identity(4)
        out = {}
        for s in "lr":
            e = self.estado(s, t)
            B = Rr @ Vector((e["x"], -e["s"], self.z0[s]))
            yw = math.degrees(Rr.to_euler().z) + e["yaw"]
            a, d = self.pes[s].alvo(B, yw, e["inc"], e["h"], toe=None if e["apoio"] else -max(e["inc"], 0.0) * 0.25)
            P.pes[s] = a
            P.fk[self.pes[s].L + "ToeBase"] = [(self.pes[s].dobra_dedo, d)]
            out[s] = e
        return out


# ------------------------------------------------------------------ ator: corpo a partir de trilhas
OCULTO = Matrix.Diagonal((0.0, 0.0, 0.0, 1.0))


def valor(tr, k, f, d=0.0):
    x = tr.get(k)
    if x is None:
        return d
    return x(f) if callable(x) else x


class Ator:
    """Base dos grupos. Trilhas (tr) por quadro: raiz (Vector no chao), yaw (graus), quad (desvio do quadril no quadro de
    chao: x esquerda, -y frente, z cima), pelve / pelve_lado / pelve_giro (graus), H (4x4 do quadril no mundo, peso wH),
    inc / giro / lado / pesc / cab / cab_giro / cab_lado (coluna e cabeca), ombros (encolher), resp (amplitude da respiracao),
    mao_l / mao_r ((Matrix, polo)), dedos_l / dedos_r (tupla de 5), props {nome: f -> Matrix}, formas {prop: f -> dict}."""
    PROPS = {}            # nome -> construtor da malha (ou None = emissor/vazio)
    FX = {}               # emissor -> tipo de efeito no JS
    ANCORA = None
    CLIPES = []

    def __init__(self, rig, cp):
        self.rig, self.cp = rig, cp
        self.H0 = rig.pos_w("Hips")
        self.braco = (rig.pos_w("LeftHand") - rig.pos_w("LeftArm")).length
        self.ctx = {}
        self.info = {}                    # clipe -> extras para o JS
        self.clipe_atual = None
        self.pe_aux = {s: Pe2(rig, s, Pe.bola_em(rig, s, Matrix.Identity(4)), 0.0) for s in "lr"}

    # ---------------------------------------------------------- pes como (M, polo): X = frente do pe, Y = cima do pe
    def pe_em(self, s, B, yaw, inc=0.0, h=0.0, polo_frente=0.6):
        a, _ = self.pe_aux[s].alvo(B, yaw, inc, h, polo_frente=polo_frente)
        return (mat(a.pos, base(a.dedos, a.palma)), a.polo)

    def pe_fn(self, pe):
        """Pe2 (com trilhas de passos) -> funcao f -> (M, polo), para misturar com alvos livres num Caminho."""
        def fn(f):
            a, _ = pe.alvo(pe.b(f), pe.y(f), pe.i(f), pe.h(f))
            return (mat(a.pos, base(a.dedos, a.palma)), a.polo)
        return fn

    def bola(self, s, x=None, y=0.0, R=None):
        b = Pe.bola_em(self.rig, s, R if R is not None else Matrix.Identity(4))
        if x is not None:
            b.x = x
        b.y += y
        return b

    # ---------------------------------------------------------- extras dos clipes
    def _ci(self):
        return self.info.setdefault(self.clipe_atual, {})

    def segue(self, prop, f0, f1, osso):
        """O JS corrige o prop pela mao/cabeca real do personagem entre f0 e f1 (proporcoes diferentes da autoria)."""
        self._ci().setdefault("segue", {}).setdefault(prop, []).append([int(f0), int(f1), osso])

    def marca(self, chave, valor_):
        self._ci()[chave] = valor_

    # ---------------------------------------------------------- corpo
    def corpo(self, f, tr):
        rig = self.rig
        P = Pose()
        rp = Vector(valor(tr, "raiz", f, Vector()))
        yaw = valor(tr, "yaw", f, 0.0)
        Rz = giro_z(yaw)
        Rf = mat(rp, Rz)
        q = Vector(valor(tr, "quad", f, Vector()))
        Hp = Rf @ (self.H0 + q)
        Hr = Rz @ rot(Z, valor(tr, "pelve_giro", f)) @ rot(X, valor(tr, "pelve", f)) @ rot(Y, valor(tr, "pelve_lado", f))
        if "H" in tr:
            w = valor(tr, "wH", f, 1.0)
            if w > 0:
                M = mistura_m(mat(Hp, Hr), tr["H"](f), w)
                Hp, Hr = M.translation.copy(), M.to_3x3().normalized()
        P.quadril_pos, P.quadril_rot = Hp, Hr
        self.ctx["Rf"], self.ctx["Rz"], self.ctx["yaw"] = Rf, Rz, yaw
        tronco(P, *(valor(tr, k, f) for k in ("inc", "giro", "lado", "pesc", "cab", "cab_giro", "cab_lado")))
        r = respirar(f + valor(tr, "fase_resp", f), valor(tr, "periodo_resp", f, 72.0)) * valor(tr, "resp", f, 1.0)
        P.soma("Spine1", [(X, -0.8 * r)])
        P.soma("Spine2", [(X, -0.8 * r)])
        for s, L, sg in (("l", "Left", 1), ("r", "Right", -1)):
            P.fk[L + "Shoulder"] = [(Y, valor(tr, "ombros", f) * sg + valor(tr, "ombro_" + s, f) * sg),
                                    (Z, valor(tr, "ombro_frente_" + s, f) * sg)]
        rig.resolver(P)
        for s, L in (("l", "Left"), ("r", "Right")):
            self.ctx["ombro_" + s] = rig.Mw(L + "Arm").translation.copy()
        self.ctx["cabeca"] = rig.Mw("Head")
        self.ctx["Hw"] = rig.Mw("Hips")
        self.ctx["peito"] = rig.Mw("Spine2")
        return P

    def finalizar(self, P, f, tr, pes=None, marcha=None, Rr=None):
        if marcha is not None:
            marcha.aplicar(P, f, Rr)
        elif pes is not None:
            for s in "lr":
                pes[s].aplicar(P, f, polo_frente=valor(tr, "polo_joelho", f, 0.6))
        for s, L in (("l", "Left"), ("r", "Right")):           # pe com alvo livre ((M, polo) como as maos): deitado, sentado...
            pf = tr.get("pe_" + s)
            if pf is not None:
                P.pes[s] = para_alvo(pf(f))
                P.fk[L + "ToeBase"] = [(self.pe_aux[s].dobra_dedo, valor(tr, "dedo_" + s, f))]
        if tr.get("joelhos"):                                   # maos que dependem das pernas (apoio no joelho)
            self.rig.resolver(P)
            for s, L in (("l", "Left"), ("r", "Right")):
                self.ctx["joelho_" + s] = self.rig.Mw(L + "Leg").translation.copy()
                self.ctx["coxa_" + s] = self.rig.Mw(L + "UpLeg").translation.copy()
        for s in "lr":
            m = tr.get("mao_" + s)
            if m is not None:
                P.maos[s] = para_alvo(m(f))
            d = tr.get("dedos_" + s)
            if d is not None:
                K.aplicar_dedos(self.rig, P, s, d(f))
        for pn in self.PROPS:
            fn = tr.get("props", {}).get(pn)
            P.props[pn] = fn(f) if fn is not None else OCULTO.copy()
        for pn, fn in tr.get("formas", {}).items():
            P.formas[pn] = fn(f)
        return P

    # ---------------------------------------------------------- maos relativas ao corpo (quadro de chao com yaw)
    def rel(self, lado, off, dd, pa, polo=(0.30, 0.45, -0.25), ombro=True):
        """Alvo de mao: off/dd/pa/polo no quadro do corpo (x esquerda, -y frente, z cima); x espelhado para a direita."""
        sg = 1 if lado == "l" else -1
        sx = lambda v: Vector((v[0] * sg, v[1], v[2]))

        def fn(f):
            Rz = self.ctx["Rz"]
            O = self.ctx["ombro_" + lado] if ombro else self.ctx["Rf"].translation
            return alvo_mao(O + Rz @ sx(off), Rz @ sx(dd), Rz @ sx(pa), O + Rz @ sx(polo))
        return fn

    def solta(self, lado, frente=0.045, fora=0.035, desce=None):
        d = self.braco * 0.955 if desce is None else desce
        return self.rel(lado, (fora, -frente, -d), (0.06, -0.12, -1), (-1, 0.25, 0), (0.30, 0.45, -0.25))

    def no_mundo(self, M, polo):
        """Alvo fixo no mundo (M: 4x4 com X = dedos e Y = palma, polo: Vector)."""
        return lambda f: (M, Vector(polo))

    def extras(self):
        return {}

    def vistas(self, clip):
        """(direcoes da camera, alvo, distancia) da previa."""
        return [(0.35, -1.0, 0.25), (1.0, -0.1, 0.15)], Vector((0, 0, 0.95)), 3.6


# ------------------------------------------------------------------ gravar quadros em acoes
class Gravador(K.Gravador):
    """Ossos como no 16; props com posicao, rotacao e ESCALA (escala 0 = escondido; nos FX_* a escala e a intensidade);
    shape keys dos props em acoes do datablock de chaves."""

    def __init__(self, rig, nome):
        super().__init__(rig, nome)
        self.formas = {}

    def quadro(self, P):
        super().quadro(P)
        for pn, d in P.formas.items():
            self.formas.setdefault(pn, []).append(dict(d))

    def gravar(self, objs):
        series = []
        for n, qs in self.q.items():
            path = 'pose.bones["%s%s"].rotation_quaternion' % (PFX, n)
            arr = np.array([tuple(q) for q in qs], np.float32)
            for i in range(4):
                series.append((path, i, arr[:, i], PFX + n))
        arr = np.array([tuple(v) for v in self.loc], np.float32)
        for i in range(3):
            series.append(('pose.bones["%sHips"].location' % PFX, i, arr[:, i], PFX + "Hips"))
        acoes = {"Personagem": self.acao(self.nome, series)}
        for pn, Ms in self.props.items():
            locs, qs, ss = [], [], []
            for M in Ms:
                l, q, s = M.decompose()
                if s.length < 1e-6:
                    q = Quaternion(qs[-1]) if qs else Quaternion()
                if qs and Quaternion(qs[-1]).dot(q) < 0:
                    q = -q
                locs.append(tuple(l))
                qs.append(tuple(q))
                ss.append(tuple(s))
            locs, qs, ss = (np.array(a, np.float32) for a in (locs, qs, ss))
            s = [("location", i, locs[:, i], "Objeto") for i in range(3)] + \
                [("rotation_quaternion", i, qs[:, i], "Objeto") for i in range(4)] + [("scale", i, ss[:, i], "Objeto") for i in range(3)]
            acoes[pn] = self.acao(self.nome + "|" + pn, s)
        for pn, ds in self.formas.items():
            chaves = sorted({k for d in ds for k in d})
            s = [('key_blocks["%s"].value' % k, 0, np.array([d.get(k, 0.0) for d in ds], np.float32), "Formas") for k in chaves]
            acoes[pn + "|formas"] = self.acao(self.nome + "|" + pn + "|formas", s)
        return acoes


# ------------------------------------------------------------------ rodar um grupo
def criar_props(est):
    props = {}
    for pn, construtor in est.PROPS.items():
        dado = construtor() if construtor is not None else None
        o = bpy.data.objects.new(pn, dado)
        if dado is None:
            o.empty_display_type = 'SINGLE_ARROW'
            o.empty_display_size = 0.05
        bpy.context.scene.collection.objects.link(o)
        o.rotation_mode = 'QUATERNION'
        if pn in est.FX:
            o["fx"] = est.FX[pn]
        props[pn] = o
    return props


def gerar(grupo, so=None):
    arm, corpo, nativo, W = preparar()
    rig = K.Rig(arm)
    cp = Corpo(rig, W)
    est = GRUPOS[grupo](rig, cp)
    props = criar_props(est)
    acoes = {}
    for clip in est.CLIPES:
        if so and clip not in so:
            continue
        est.clipe_atual = clip
        est.ctx = {}
        poses = getattr(est, "clipe_" + clip)()
        g = Gravador(rig, clip)
        for P in poses:
            g.quadro(P)
        acoes[clip] = g.gravar(props)
        loop = clip.endswith("_loop")
        est.info.setdefault(clip, {}).update(quadros=len(poses), loop=loop)
        if loop:
            erro = max((a - b).length for a, b in zip(g.loc[:1], g.loc[-1:]))
            print("  %-22s %4d quadros (%.2f s) loop, quadril fecha com erro %.4f m" % (clip, len(poses), (len(poses) - 1) / FPS, erro))
        else:
            print("  %-22s %4d quadros (%.2f s)" % (clip, len(poses), (len(poses) - 1) / FPS))
    return dict(arm=arm, corpo=corpo, nativo=nativo, est=est, props=props, acoes=acoes, grupo=grupo, rig=rig, cp=cp)


def mostrar(r, clip):
    acts = r["acoes"][clip]
    r["arm"].animation_data_create()
    r["arm"].animation_data.action = acts["Personagem"]
    for pn, o in r["props"].items():
        o.animation_data_create()
        o.animation_data.action = acts.get(pn)
        if o.data is not None and getattr(o.data, "shape_keys", None):
            o.data.shape_keys.animation_data_create()
            o.data.shape_keys.animation_data.action = acts.get(pn + "|formas")
    n = len(acts["Personagem"].fcurves[0].keyframe_points)
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 0, n - 1
    return n


def chao_previa(tam=12.0):
    if "Chao_Previa" in bpy.data.objects:
        return
    me = bpy.data.meshes.new("Chao_Previa")
    s = tam / 2
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    o = bpy.data.objects.new("Chao_Previa", me)
    mt = bpy.data.materials.new("Chao_Previa")
    mt.diffuse_color = (0.42, 0.40, 0.38, 1)
    me.materials.append(mt)
    bpy.context.scene.collection.objects.link(o)


def previas(r, so=None, quadros=None):
    est = r["est"]
    chao_previa()
    if hasattr(est, "preparar_previa"):
        est.preparar_previa(r)
    for clip in r["acoes"]:
        if so and clip not in so:
            continue
        n = mostrar(r, clip)
        vistas, alvo, dist = est.vistas(clip)
        qs = (quadros or {}).get(clip) or [int(round(i * (n - 1) / 7.0)) for i in range(8)]
        # opcoes de inspecao: --quadros=10,20,30  --alvo=x,y,z  --dist=1.2  --vistas=x,y,z;x,y,z
        for a in ARGS:
            if a.startswith("--quadros="):
                qs = [min(int(v), n - 1) for v in a[10:].split(",")]
            elif a.startswith("--alvo="):
                alvo = Vector([float(v) for v in a[7:].split(",")])
            elif a.startswith("--dist="):
                dist = float(a[7:])
            elif a.startswith("--vistas="):
                vistas = [tuple(float(v) for v in t.split(",")) for t in a[9:].split(";")]
        K.previa(clip, qs, vistas, alvo=tuple(alvo), dist=dist, tam=(300, 380))


def exportar_fbx(r):
    """Um FBX por clipe: so o esqueleto, na transformacao nativa do FBX do Mixamo (igual a skin: cm declarado, valores em m)."""
    pasta = os.path.join(SAIDA, "fbx")
    os.makedirs(pasta, exist_ok=True)
    scn, arm, nat = bpy.context.scene, r["arm"], r["nativo"]
    arm.animation_data_create()
    guarda = (arm.location.copy(), arm.rotation_euler.copy(), arm.scale.copy())
    arm.location, arm.rotation_euler, arm.scale = nat["loc"], nat["rot"], nat["escala"]
    nome_cena = scn.name
    try:
        for clip, acts in r["acoes"].items():
            # o exportador grava como "repouso" dos ossos a pose do quadro atual: uma chave de repouso fora do clipe (quadro -10)
            # faz o FBX sair com o mesmo repouso (pose T) da skin, como os FBX "sem skin" do Mixamo
            act = acts["Personagem"].copy()
            for fc in act.fcurves:
                rep = 1.0 if (fc.data_path.endswith("rotation_quaternion") and fc.array_index == 0) else 0.0
                kp = fc.keyframe_points.insert(-10, rep, options={'FAST'})
                kp.interpolation = 'CONSTANT'
                fc.update()
            arm.animation_data.action = act
            n = len(acts["Personagem"].fcurves[0].keyframe_points)
            scn.frame_start, scn.frame_end = 0, n - 1
            scn.frame_set(-10)
            scn.name = clip                                    # o FBX nomeia o take com o nome da cena
            K._so([arm])
            bpy.ops.export_scene.fbx(filepath=os.path.join(pasta, clip + ".fbx"), use_selection=True, object_types={'ARMATURE'},
                                     add_leaf_bones=False, use_armature_deform_only=False, bake_anim=True,
                                     bake_anim_use_all_actions=False, bake_anim_use_nla_strips=False,
                                     bake_anim_force_startend_keying=True, bake_anim_step=1.0, bake_anim_simplify_factor=0.0)
            arm.animation_data.action = None
            bpy.data.actions.remove(act)
    finally:
        scn.name = nome_cena
        arm.location, arm.rotation_euler, arm.scale = guarda
        arm.animation_data.action = None


def exportar_glb(r):
    """bar_<grupo>.glb: esqueleto (sem malha) + props + clipes (faixa NLA com o nome do clipe em cada objeto e nas shape keys)."""
    os.makedirs(SAIDA, exist_ok=True)
    scn, arm, props, est = bpy.context.scene, r["arm"], r["props"], r["est"]
    objs = [arm] + list(props.values())
    alvos = []
    for o in objs:
        alvos.append((o, None))
        if o.data is not None and getattr(o.data, "shape_keys", None):
            alvos.append((o.data.shape_keys, o.name))
    for idb, _ in alvos:
        idb.animation_data_create()
        idb.animation_data.action = None
        for t in list(idb.animation_data.nla_tracks):
            idb.animation_data.nla_tracks.remove(t)
    for clip, acts in r["acoes"].items():
        for idb, chave in alvos:
            if chave is not None:
                act = acts.get(chave + "|formas")
            else:
                act = acts["Personagem"] if idb is arm else acts.get(idb.name)
            if act is None:
                continue
            t = idb.animation_data.nla_tracks.new()
            t.name = clip
            t.strips.new(clip, int(act.frame_range[0]), act)
    for o in list(scn.objects):
        if o not in objs:
            bpy.data.objects.remove(o, do_unlink=True)              # malha da previa, chao, camera, cena de referencia
    for o in props.values():                                        # repouso dos props no GLB = escondido (fora de um clipe nao aparece)
        o.parent = None
        o.location, o.rotation_quaternion, o.scale = (0, 0, 0), (1, 0, 0, 0), (0, 0, 0)
        if o.data is not None and getattr(o.data, "shape_keys", None):
            for kb in o.data.shape_keys.key_blocks:
                kb.value = 0.0
    info = dict(grupo=r["grupo"], fps=FPS, altura_m=round(r["cp"].altura, 3), ancora=est.ANCORA,
                clipes={c: est.info.get(c, {}) for c in r["acoes"]}, props=list(props), fx=est.FX)
    info.update(est.extras())
    scn["bar_animacoes"] = json.dumps(info, ensure_ascii=True)
    K._so(objs)
    out = os.path.join(SAIDA, "bar_%s.glb" % r["grupo"])
    props_rna = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    op = dict(filepath=out, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='NLA_TRACKS',
              export_force_sampling=True, export_frame_step=1, export_anim_slide_to_zero=True, export_optimize_animation_size=False,
              export_optimize_animation_keep_anim_armature=True, export_optimize_animation_keep_anim_object=True,
              export_def_bones=False, export_skins=True, export_morph=True, export_morph_animation=True, export_morph_normal=False,
              export_materials='EXPORT', export_image_format='AUTO', export_cameras=False, export_lights=False, export_extras=True,
              export_yup=True, export_apply=False, export_texcoord=True, export_normals=True, will_save_settings=False)
    bpy.ops.export_scene.gltf(**{k: v for k, v in op.items() if k in props_rna})
    print("GLB", out, "%.0f KB" % (os.path.getsize(out) / 1024))
    return out


# ================================================================== LOCOMOCAO (no lugar: o jogo move o personagem)
class Locomocao(Ator):
    CLIPES = ["parado_loop", "andar_loop", "andar_bebado_loop", "cair", "levantar_chao"]
    V_ANDAR, T_ANDAR = 0.85, 36                 # 0,85 m/s, 100 passos por minuto (passo de 0,51 m)
    V_BEBADO, T_BEBADO = 0.55, 84

    def extras(self):
        return {"velocidade": {"andar_loop": self.V_ANDAR, "andar_bebado_loop": self.V_BEBADO}}

    def pes_parado(self, larg=0.115, abre=7.0, recua_r=0.0):
        pes = {}
        for s, sg in (("l", 1), ("r", -1)):
            b = Pe.bola_em(self.rig, s, Matrix.Identity(4))
            b.x = larg * sg
            if s == "r":
                b.y += recua_r
            pes[s] = Pe2(self.rig, s, b, abre * sg)
        return pes

    # ---------------------------------------------------------- parado (6 s)
    def clipe_parado_loop(self):
        N = 180
        olhar = Periodica(N, (0, 0.0), (40, 0.0), (62, 14.0), (92, 11.0), (112, -7.0), (140, -5.0), (160, 0.0))
        tr = dict(
            quad=lambda f: Vector((0.013 * sn(f / N), 0.0, -0.014 + 0.003 * cs(2 * f / N))),
            pelve_lado=lambda f: -1.8 * sn(f / N), lado=lambda f: 1.4 * sn(f / N), pelve=2.0,
            inc=lambda f: 2.0 + 0.6 * sn(2 * f / N), cab=lambda f: 1.0 + 2.0 * sn(f / N + 0.2),
            cab_giro=olhar, cab_lado=lambda f: -1.5 * sn(f / N), giro=lambda f: 0.25 * olhar(f),
            periodo_resp=90.0, resp=1.1,
            mao_l=self.balanca("l", N), mao_r=self.balanca("r", N),
            dedos_l=fixo(G("solta")), dedos_r=fixo(G("solta")),
        )
        pes = self.pes_parado()
        return [self.finalizar(self.corpo(f, tr), f, tr, pes) for f in range(N + 1)]

    def balanca(self, lado, N, amp=0.012):
        sg = 1 if lado == "l" else -1
        base_ = self.solta(lado)

        def fn(f):
            M, polo = base_(f)
            M = M.copy()
            M.translation += self.ctx["Rz"] @ Vector((0.004 * sg, -amp * sn(f / N + 0.15 * sg), 0.0))
            return M, polo
        return fn

    # ---------------------------------------------------------- andar (ciclo de 2 passos, no lugar)
    def braco_marcha(self, lado, frente_fn, fora=0.045, solto=1.0):
        """Braco balancando: frente_fn(f) = quanto a mao vai a frente (m); cotovelo dobra mais na ida."""
        def fn(f):
            fw = frente_fn(f)
            d = self.braco * 0.955
            sobe = 0.045 * max(fw, 0.0) / 0.13 + 0.012 * (fw / 0.13) ** 2
            return self.rel(lado, (fora + 0.01 * abs(fw) / 0.13, -fw - 0.02, -d + sobe), (0.07, -0.10 - fw * 1.6 * solto, -1),
                            (-1, 0.30 - fw * 1.2, 0.0), (0.30, 0.50, -0.20))(f)
        return fn

    def clipe_andar_loop(self):
        T, v = self.T_ANDAR, self.V_ANDAR
        S = 0.36
        c = {"l": [(0.0, 0.6 * T, 0.105, 5.0, S)], "r": [(0.5 * T, 1.1 * T % T, -0.105, -5.0, S)]}
        m = Marcha(self.rig, T, v, c, alt=0.062)
        fi = lambda f: per(f, T)
        tr = dict(
            quad=lambda f: Vector((0.020 * sn(fi(f)), 0.006 * cs(2 * (fi(f) - 0.10)), -0.036 + 0.011 * cs(2 * (fi(f) - 0.30)))),
            pelve_giro=lambda f: -5.0 * cs(fi(f)), pelve_lado=lambda f: -3.5 * sn(fi(f)), pelve=lambda f: 2.0 + 1.0 * cs(2 * fi(f)),
            inc=lambda f: 4.0 + 1.2 * cs(2 * (fi(f) - 0.08)), giro=lambda f: 8.0 * cs(fi(f) - 0.02), lado=lambda f: 2.2 * sn(fi(f)),
            cab_giro=lambda f: -3.0 * cs(fi(f) - 0.02), cab=lambda f: -2.0 - 1.2 * cs(2 * (fi(f) - 0.08)), cab_lado=lambda f: -1.6 * sn(fi(f)),
            ombro_frente_l=lambda f: -3.0 * cs(fi(f) - 0.07), ombro_frente_r=lambda f: -3.0 * cs(fi(f) - 0.07),
            periodo_resp=36.0, resp=0.7,
            mao_r=self.braco_marcha("r", lambda f: 0.13 * cs(fi(f) - 0.07) + 0.015),
            mao_l=self.braco_marcha("l", lambda f: -0.13 * cs(fi(f) - 0.07) + 0.015),
            dedos_l=fixo(misturar(G("solta"), G("segura"), 0.25)), dedos_r=fixo(misturar(G("solta"), G("segura"), 0.25)),
        )
        return [self.finalizar(self.corpo(f, tr), f, tr, marcha=m) for f in range(T + 1)]

    # ---------------------------------------------------------- andar bebado (4 passos irregulares, cambaleando)
    def clipe_andar_bebado_loop(self):
        T, v = self.T_BEBADO, self.V_BEBADO
        c = {"l": [(0.0, 26.0, 0.150, 13.0, 0.30), (42.0, 68.0, 0.050, -3.0, 0.33)],
             "r": [(19.0, 45.0, -0.040, -9.0, 0.24), (60.0, 3.0, -0.175, -17.0, 0.27)]}
        m = Marcha(self.rig, T, v, c, alt=0.05, pisa=-10.0, sai=30.0)
        P_ = lambda *k: Periodica(T, *k)
        qx = P_((8, 0.080), (26, 0.004), (33, -0.040), (50, 0.032), (60, 0.010), (73, -0.105))
        qy = P_((0, 0.02), (16, -0.02), (40, 0.01), (58, -0.03), (76, 0.02))
        qz = P_((0, -0.080), (10, -0.055), (19, -0.075), (30, -0.050), (42, -0.074), (52, -0.052), (61, -0.088), (73, -0.055))
        bra_l = P_((0, -0.08), (20, 0.10), (42, -0.05), (58, 0.04), (66, -0.02), (76, -0.10))
        bra_r = P_((0, 0.10), (20, -0.06), (42, 0.08), (60, -0.10), (72, 0.02))
        afasta_l = P_((0, 0.06), (30, 0.05), (60, 0.08), (68, 0.26), (76, 0.20))
        sobe_l = P_((0, 0.0), (58, 0.0), (68, 0.17), (78, 0.08))
        tr = dict(
            quad=lambda f: Vector((qx(f), qy(f), qz(f))),
            pelve_giro=P_((0, -8.0), (19, 6.0), (42, -4.0), (60, 10.0)), pelve_lado=P_((8, -5.0), (28, 3.0), (50, -2.5), (70, 7.0)),
            pelve=4.0,
            inc=P_((0, 11.0), (20, 15.0), (42, 10.0), (62, 17.0), (76, 9.0)), lado=P_((12, -6.0), (33, 4.5), (54, -3.0), (76, 9.0)),
            giro=P_((0, 6.0), (20, -6.0), (42, 4.0), (62, -9.0)),
            cab=P_((0, 9.0), (14, 16.0), (30, 5.0), (46, 13.0), (64, 3.0), (78, 12.0)),
            cab_lado=P_((6, 9.0), (26, -7.0), (48, 6.0), (70, -11.0)), cab_giro=P_((0, -4.0), (30, 6.0), (60, -8.0)),
            pesc=4.0, resp=1.6, periodo_resp=42.0,
            mao_l=lambda f: self.braco_bebado("l", bra_l(f), 0.07 + afasta_l(f), sobe_l(f))(f),
            mao_r=lambda f: self.braco_bebado("r", bra_r(f), 0.08, 0.0)(f),
            dedos_l=fixo(misturar(G("solta"), G("aberta"), 0.4)), dedos_r=fixo(G("solta")),
        )
        return [self.finalizar(self.corpo(f, tr), f, tr, marcha=m) for f in range(T + 1)]

    def braco_bebado(self, lado, fw, fora, sobe):
        d = self.braco * 0.93
        return self.rel(lado, (fora, -fw - 0.03, -d + sobe + 0.03 * abs(fw) / 0.1), (0.25 + fora, -0.12 - fw, -1),
                        (-1, 0.25, 0.1), (0.35, 0.45, -0.20))

    def vistas(self, clip):
        if clip in ("cair", "levantar_chao"):
            return [(0.35, -1.0, 0.45), (1.0, 0.0, 0.25)], Vector((0, 0.45, 0.6)), 4.2
        return [(0.25, -1.0, 0.2), (1.0, 0.0, 0.12)], Vector((0, 0, 0.95)), 3.4

    # ---------------------------------------------------------- cair (perde o equilibrio para tras, cai sentado e deita)
    def deitado(self):
        """Pose do fim do cair = comeco do levantar_chao: de costas, cabeca para +Y, bracos abertos, palmas para cima."""
        H = mat(Vector((0.0, 0.50, 0.112)), giro_z(4.0) @ rot(X, -86.0) @ rot(Y, 3.0))
        pes, maos = {}, {}
        for s, sg in (("l", 1), ("r", -1)):
            tor = Vector((0.17 * sg, -0.29 + (0.04 if s == "r" else 0.0), 0.075))
            pes[s] = (mat(tor, base(Vector((0.38 * sg, -0.42, 0.82)), Vector((0.0, 0.85, 0.45)))), tor + Vector((0.12 * sg, 0.35, 0.6)))
            p = Vector((0.50 * sg, 0.82, 0.035))
            maos[s] = (mat(p, base(Vector((0.70 * sg, -0.62, -0.04)), Vector((0, 0, 1)))), p + Vector((0.05 * sg, 0.45, 0.0)))
        return dict(H=H, pes=pes, maos=maos, tronco=dict(inc=0.0, lado=2.0, giro=-3.0, cab=-6.0, cab_giro=26.0, cab_lado=8.0))

    def sentado_chao(self, y_pes=0.0, inc_pelve=-25.0):
        """Sentado no chao com os joelhos para cima, pes assentados perto da posicao de pe (origem)."""
        H = mat(Vector((0.0, 0.40, 0.158)), rot(X, inc_pelve))
        pes = {s: self.pe_em(s, self.bola(s, 0.15 * sg, y_pes), 9.0 * sg, polo_frente=0.2) for s, sg in (("l", 1), ("r", -1))}
        return H, pes

    def clipe_cair(self):
        N = 84
        D = self.deitado()
        Hs, pes_s = self.sentado_chao(y_pes=0.03)
        M0 = mat(self.H0 + Vector((0, 0, -0.011)), rot(X, 2.0))
        Hd = mat(Vector((0.0, 0.36, 0.158)), rot(X, -32.0))
        H = Seq((0, M0), (10, mat(self.H0 + Vector((0.012, -0.015, -0.02)), rot(X, 5.0) @ rot(Y, -3.0))),
                (24, mat(self.H0 + Vector((0.0, 0.10, -0.06)), rot(X, -8.0) @ rot(Y, 2.0))),
                (29, mat(self.H0 + Vector((0.0, 0.20, -0.25)), rot(X, -16.0)), 'a'), (35, Hd, 'a'),
                (37, mat(Hd.translation + Vector((0, 0.01, 0.018)), rot(X, -36.0)), 'f'), (40, Hd, 's'),
                (58, D["H"], 's'), (N, D["H"]))
        Rp = Matrix.Identity(4)
        pr = Pe2(self.rig, "r", self.bola("r", -0.115), -7.0)
        pr.passo(13, 22, self.bola("r", -0.13, 0.20), -12.0, alt=0.04, ergue=8.0, pisa=4.0)
        pl = Pe2(self.rig, "l", self.bola("l", 0.115), 7.0)
        pl.ir(20, 27, inc=10.0)
        sent2 = {s: (mat(Vector((0.16 * sg, -0.10, 0.085)), base(Vector((0.2 * sg, -0.75, 0.6)), Vector((0, 0.6, 0.75)))),
                     Vector((0.16 * sg, 0.15, 0.9))) for s, sg in (("l", 1), ("r", -1))}
        ombro = lambda s: (lambda f: self.ctx["ombro_" + s])
        apoio = {}
        for s, sg in (("l", 1), ("r", -1)):
            p = Vector((0.27 * sg, 0.84, 0.035))
            apoio[s] = (mat(p, base(Vector((0.25 * sg, 1.0, -0.05)), Vector((0, 0, -1)))), p + Vector((0.35 * sg, 0.30, 0.45)))
        tr = dict(
            H=H, wH=1.0,
            inc=Seq((0, 2.0), (10, 6.0), (20, 16.0), (29, 10.0), (35, -10.0), (40, -12.0), (52, -4.0), (58, D["tronco"]["inc"])),
            lado=Seq((0, 0.0), (12, -3.0), (30, 2.0), (58, D["tronco"]["lado"])),
            giro=Seq((0, 0.0), (22, 5.0), (40, 0.0), (58, D["tronco"]["giro"])),
            cab=Seq((0, 3.0), (8, 9.0), (16, -4.0), (26, 14.0), (34, 20.0), (44, 16.0), (52, 8.0), (56, -8.0, 'a'), (59, -3.0), (64, D["tronco"]["cab"])),
            cab_giro=Seq((0, 0.0), (8, -6.0), (16, 4.0), (50, 0.0), (64, D["tronco"]["cab_giro"])),
            cab_lado=Seq((0, 0.0), (6, 8.0), (14, -5.0), (30, 0.0), (64, D["tronco"]["cab_lado"])),
            resp=Seq((0, 1.2), (40, 2.0), (N, 1.4)), periodo_resp=60.0,
            mao_l=Seq((0, self.solta("l")), (10, self.solta("l")),
                      (20, self.rel("l", (0.24, -0.30, -0.10), (0.5, -1.0, 0.1), (0.2, 0.0, -1.0), (0.4, 0.3, -0.3))),
                      (33, fixo(apoio["l"])), (40, fixo(apoio["l"])), (58, fixo(D["maos"]["l"]))),
            mao_r=Seq((0, self.solta("r")), (12, self.solta("r")),
                      (22, self.rel("r", (0.28, -0.26, -0.02), (0.5, -1.0, 0.3), (0.2, 0.0, -1.0), (0.4, 0.3, -0.3))),
                      (33, fixo(apoio["r"])), (40, fixo(apoio["r"])), (58, fixo(D["maos"]["r"]))),
            dedos_l=Seq((0, G("solta")), (18, G("aberta")), (40, G("aberta")), (58, G("solta"))),
            dedos_r=Seq((0, G("solta")), (18, G("aberta")), (40, G("aberta")), (58, G("solta"))),
            pe_l=Seq((0, self.pe_fn(pl)), (26, self.pe_fn(pl)), (35, fixo(pes_s["l"])), (46, fixo(sent2["l"])), (60, fixo(D["pes"]["l"]))),
            pe_r=Seq((0, self.pe_fn(pr)), (26, self.pe_fn(pr)), (35, fixo(pes_s["r"])), (48, fixo(sent2["r"])), (62, fixo(D["pes"]["r"]))),
        )
        return [self.finalizar(self.corpo(f, tr), f, tr) for f in range(N)]

    # ---------------------------------------------------------- levantar do chao (senta, agacha e fica de pe na origem)
    def clipe_levantar_chao(self):
        N = 150
        D = self.deitado()
        Hs, pes_s = self.sentado_chao(y_pes=0.0, inc_pelve=-22.0)
        Hag = mat(Vector((0.0, 0.17, 0.43)), rot(X, 28.0))                 # agachado em cima dos pes
        Hfim = mat(self.H0 + Vector((0, 0, -0.011)), rot(X, 2.0))
        H = Seq((0, D["H"]), (16, D["H"]), (42, Hs), (64, Hs), (72, mat(Vector((0.0, 0.33, 0.20)), rot(X, -2.0))),
                (84, Hag), (90, Hag), (112, mat(self.H0 + Vector((0.0, 0.01, -0.03)), rot(X, 8.0))),
                (122, mat(self.H0 + Vector((-0.02, 0.0, -0.02)), rot(X, 1.0) @ rot(Y, 3.0))),
                (134, mat(self.H0 + Vector((0.012, 0.0, -0.013)), rot(Y, -2.0))), (146, Hfim), (N, Hfim))
        empurra = {}
        chao_frente = {}
        joelho = {}
        for s, sg in (("l", 1), ("r", -1)):
            p = Vector((0.30 * sg, 0.62, 0.035))
            empurra[s] = (mat(p, base(Vector((0.15 * sg, -1.0, -0.1)), Vector((0, 0, -1)))), p + Vector((0.40 * sg, 0.25, 0.5)))
            q = Vector((0.27 * sg, -0.02, 0.035))
            chao_frente[s] = (mat(q, base(Vector((0.1 * sg, -1.0, -0.1)), Vector((0, 0, -1)))), q + Vector((0.45 * sg, 0.25, 0.5)))
        joelho["r"] = self.rel("r", (0.02, -0.30, -0.38), (0.0, -0.4, -1.0), (0.0, 1.0, -0.2), (0.4, 0.3, -0.2))
        tr = dict(
            H=H, wH=Seq((0, 1.0), (134, 1.0), (148, 0.0)), quad=Vector((0, 0, -0.011)), pelve=2.0,
            inc=Seq((0, 0.0), (16, 4.0), (36, 28.0), (46, 22.0), (60, 18.0), (74, 38.0), (86, 46.0), (98, 34.0), (112, 12.0),
                    (124, 0.0), (136, 4.0), (148, 2.0)),
            lado=Seq((0, D["tronco"]["lado"]), (30, 0.0), (66, 0.0), (80, -4.0), (100, 3.0), (120, -2.0), (136, 1.5), (148, 0.0)),
            giro=Seq((0, D["tronco"]["giro"]), (30, 0.0), (76, -6.0), (100, 0.0)),
            cab=Seq((0, D["tronco"]["cab"]), (12, -6.0), (22, 24.0), (40, 12.0), (52, 18.0), (64, 6.0), (86, -10.0), (110, 0.0),
                    (124, 8.0), (140, 3.0)),
            cab_giro=Seq((0, D["tronco"]["cab_giro"]), (14, 26.0), (24, 0.0), (48, 0.0), (52, 14.0), (56, -12.0), (60, 10.0), (64, 0.0),
                         (120, 0.0), (128, -8.0), (140, 0.0)),
            cab_lado=Seq((0, D["tronco"]["cab_lado"]), (24, 0.0), (120, 0.0), (126, 6.0), (138, -3.0), (148, 0.0)),
            resp=1.6, periodo_resp=60.0,
            mao_l=Seq((0, fixo(D["maos"]["l"])), (18, fixo(D["maos"]["l"])), (30, fixo(empurra["l"])), (42, fixo(empurra["l"])),
                      (54, self.rel("l", (0.06, -0.30, -0.18), (-0.3, -0.6, -0.8), (-0.6, 0.2, 0.0), (0.4, 0.2, -0.3))),
                      (66, self.rel("l", (0.06, -0.30, -0.18), (-0.3, -0.6, -0.8), (-0.6, 0.2, 0.0), (0.4, 0.2, -0.3))),
                      (78, fixo(chao_frente["l"])), (90, fixo(chao_frente["l"])), (106, self.solta("l", fora=0.10)), (N, self.solta("l"))),
            mao_r=Seq((0, fixo(D["maos"]["r"])), (20, fixo(D["maos"]["r"])), (32, fixo(empurra["r"])), (44, fixo(empurra["r"])),
                      (56, self.rel("r", (0.06, -0.30, -0.18), (-0.3, -0.6, -0.8), (-0.6, 0.2, 0.0), (0.4, 0.2, -0.3))),
                      (66, self.rel("r", (0.06, -0.30, -0.18), (-0.3, -0.6, -0.8), (-0.6, 0.2, 0.0), (0.4, 0.2, -0.3))),
                      (78, fixo(chao_frente["r"])), (88, fixo(chao_frente["r"])), (98, joelho["r"]), (106, joelho["r"]),
                      (120, self.solta("r", fora=0.08)), (N, self.solta("r"))),
            dedos_l=Seq((0, G("solta")), (24, G("aberta")), (46, G("aberta")), (54, G("solta")), (72, G("aberta")), (96, G("aberta")),
                        (110, G("solta"))),
            dedos_r=Seq((0, G("solta")), (24, G("aberta")), (46, G("aberta")), (54, G("solta")), (72, G("aberta")), (94, G("segura")),
                        (108, G("segura")), (120, G("solta"))),
            pe_l=Seq((0, fixo(D["pes"]["l"])), (18, fixo(D["pes"]["l"])), (40, fixo(pes_s["l"])), (N, fixo(pes_s["l"]))),
            pe_r=Seq((0, fixo(D["pes"]["r"])), (20, fixo(D["pes"]["r"])), (42, fixo(pes_s["r"])), (N, fixo(pes_s["r"]))),
        )
        # de pe no fim: os pes vao para a base do parado_loop (mesma largura e abertura)
        fim = self.pes_parado()
        for s in "lr":
            a = tr["pe_" + s]
            tr["pe_" + s] = Seq((0, a), (110, a), (132, self.pe_fn(fim[s])))
        return [self.finalizar(self.corpo(f, tr), f, tr) for f in range(N)]


# ------------------------------------------------------------------ malhas e materiais dos props
import bmesh


def material_prop(nome, cor, rough=0.5, metal=0.0, emis=None, forca=1.0, alpha=None):
    m = bpy.data.materials.get(nome)
    if m is not None:
        return m
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    bs = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value = (cor[0], cor[1], cor[2], 1.0)
    bs.inputs["Roughness"].default_value = rough
    bs.inputs["Metallic"].default_value = metal
    if emis is not None:
        bs.inputs["Emission Color"].default_value = (emis[0], emis[1], emis[2], 1.0)
        bs.inputs["Emission Strength"].default_value = forca
    if alpha is not None:
        bs.inputs["Alpha"].default_value = alpha
        m.blend_method = 'BLEND'
        m.shadow_method = 'NONE'
    m.diffuse_color = (cor[0], cor[1], cor[2], 1.0 if alpha is None else max(alpha, 0.35))
    return m


class Malha:
    """Geometria simples de prop (bmesh), origem e eixos escolhidos por quem monta."""

    def __init__(self, nome):
        self.nome, self.bm, self.mats = nome, bmesh.new(), []

    def _faces(self, geo, mat, liso=True):
        if mat not in self.mats:
            self.mats.append(mat)
        mi = self.mats.index(mat)
        vs = [g for g in geo if isinstance(g, bmesh.types.BMVert)]
        fs = {f for v in vs for f in v.link_faces}
        for f in fs:
            f.material_index = mi
            f.smooth = liso
        return self

    def cil(self, r, z0, z1, mat, segs=12, r2=None, M=None, tampas=True, liso=True):
        M = (M or Matrix.Identity(4)) @ Matrix.Translation((0, 0, (z0 + z1) / 2))
        g = bmesh.ops.create_cone(self.bm, cap_ends=tampas, cap_tris=False, segments=segs, radius1=r,
                                  radius2=r if r2 is None else r2, depth=z1 - z0, matrix=M)
        return self._faces(g["verts"], mat, liso)

    def esfera(self, r, mat, M=None, sub=2, escala=(1, 1, 1)):
        M = (M or Matrix.Identity(4)) @ Matrix.Diagonal((escala[0], escala[1], escala[2], 1.0))
        g = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r, matrix=M)
        return self._faces(g["verts"], mat)

    def caixa(self, mn, mx, mat, M=None):
        mn, mx = Vector(mn), Vector(mx)
        c, s = (mn + mx) / 2, mx - mn
        M = (M or Matrix.Identity(4)) @ Matrix.Translation(c) @ Matrix.Diagonal((s.x, s.y, s.z, 1.0))
        g = bmesh.ops.create_cube(self.bm, size=1.0, matrix=M)
        return self._faces(g["verts"], mat, liso=False)

    def torno(self, perfil, mat, segs=24, M=None, liso=True):
        """Superficie de revolucao em Z a partir de [(r, z), ...] (r = 0 fecha no eixo)."""
        M = M or Matrix.Identity(4)
        aneis = []
        for r, z in perfil:
            aneis.append([self.bm.verts.new(M @ Vector((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z)))
                          for i in range(segs)])
        novos = []
        for a, b_ in zip(aneis[:-1], aneis[1:]):
            for i in range(segs):
                j = (i + 1) % segs
                novos.append(self.bm.faces.new((a[i], a[j], b_[j], b_[i])))
        if mat not in self.mats:
            self.mats.append(mat)
        for f in novos:
            f.material_index = self.mats.index(mat)
            f.smooth = liso
        return self

    def fim(self):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-6)
        me = bpy.data.meshes.new(self.nome)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        return me


CIG = 0.082                                      # comprimento do cigarro (filtro na origem, ponta em +Z)


def m_cigarro():
    m = Malha("Cigarro")
    m.cil(0.0042, 0.0, 0.022, material_prop("Cigarro_Filtro", (0.78, 0.48, 0.20), 0.7), segs=10)
    m.cil(0.0042, 0.022, CIG, material_prop("Cigarro_Papel", (0.95, 0.94, 0.90), 0.8), segs=10)
    m.caixa((-0.0043, -0.0043, 0.0215), (0.0043, 0.0043, 0.0225), material_prop("Cigarro_Anel", (0.85, 0.72, 0.30), 0.4, 0.6))
    return m.fim()


def m_brasa():
    return Malha("Brasa").esfera(0.0048, material_prop("Brasa", (1.0, 0.30, 0.04), 0.6, emis=(1.0, 0.32, 0.05), forca=6.0),
                                 escala=(1, 1, 0.7)).fim()


def m_isqueiro():
    m = Malha("Isqueiro")
    metal = material_prop("Isqueiro_Metal", (0.75, 0.75, 0.76), 0.3, 1.0)
    m.caixa((-0.012, -0.0065, 0.0), (0.012, 0.0065, 0.056), material_prop("Isqueiro_Plastico", (0.75, 0.08, 0.06), 0.35))
    m.caixa((-0.0115, -0.006, 0.056), (0.0115, 0.006, 0.068), metal)
    m.cil(0.004, -0.004, 0.004, metal, segs=10, M=Matrix.Translation((0.005, 0, 0.066)) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
    return m.fim()


def m_chama():
    mt = material_prop("Chama", (1.0, 0.72, 0.22), 0.9, emis=(1.0, 0.70, 0.20), forca=8.0, alpha=0.85)
    m = Malha("Chama")
    m.esfera(0.0055, mt, M=Matrix.Translation((0, 0, 0.006)), escala=(1, 1, 1.2))
    m.cil(0.0055, 0.006, 0.030, mt, r2=0.0002, segs=10)
    return m.fim()


def escala(M, s):
    """M com escala uniforme s (s ~ 0 = escondido)."""
    return M @ Matrix.Diagonal((s, s, s, 1.0)) if s > 1e-3 else OCULTO.copy()


# ================================================================== FUMAR (no lugar)
class Fumar(Ator):
    CLIPES = ["fumar_acender", "fumar_loop", "fumar_apagar"]
    PROPS = {"Prop_Cigarro": m_cigarro, "Prop_Brasa": m_brasa, "Prop_Isqueiro": m_isqueiro, "Prop_Chama": m_chama,
             "FX_Fumaca_Ponta": None, "FX_Fumaca_Boca": None}
    FX = {"FX_Fumaca_Ponta": "fumaca", "FX_Fumaca_Boca": "fumaca_boca"}

    # cigarro na mao direita (pinca polegar-indicador), no quadro do alvo da mao (X dedos, Y palma, Z lado do polegar):
    # filtro do lado da palma, ponta saindo pelas costas da mao
    L_CIG = mat(Vector((0.098, 0.020, 0.020)), Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0))))
    # isqueiro na mao esquerda (punho): Z do isqueiro para o lado do polegar (-Z do quadro da mao esquerda)
    L_ISQ = mat(Vector((0.070, 0.032, -0.012)), Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0))))

    def __init__(self, rig, cp):
        super().__init__(rig, cp)
        # cigarro na boca, no quadro da cabeca: filtro nos labios, aponta para a frente, um pouco para baixo e para a direita
        Rh = rig.rot_w("Head")
        osso, boca = cp.local["boca"]
        d = Vector((-0.18, -0.95, -0.26)).normalized()
        xz = (Vector((0, 0, 1)) - d * d.z).normalized()
        R = Matrix((xz, d.cross(xz), d)).transposed()
        self.L_BOCA = mat(boca + Rh.inverted() @ (d * -0.006), Rh.inverted() @ R)

    # ---------------------------------------------------------- quadros dos props
    def cig_mao(self, mao_fn):
        return lambda f: mao_fn(f)[0] @ self.L_CIG

    def cig_boca(self, f):
        return self.ctx["cabeca"] @ self.L_BOCA

    def mao_cig_boca(self, rolagem=65.0):
        """Alvo da mao direita que poe o filtro do cigarro (na mao) nos labios."""
        def fn(f):
            Mc = self.ctx["cabeca"] @ self.L_BOCA @ mat(Vector(), rot(Z, rolagem))
            H = Mc @ self.L_CIG.inverted()
            return (H, H.translation + self.ctx["Rz"] @ Vector((-0.35, 0.10, -0.35)))
        return fn

    def ponta(self, Mcig):
        return Mcig @ Vector((0, 0, CIG))

    def fx_ponta(self, cig_fn, inten):
        return lambda f: escala(mat(self.ponta(cig_fn(f)), Matrix.Identity(3)), valor({"i": inten}, "i", f))

    def fx_boca(self, inten):
        def fn(f):
            i = valor({"i": inten}, "i", f)
            if i <= 1e-3:
                return OCULTO.copy()
            d = (self.ctx["cabeca"].to_3x3() @ (self.rig.rot_w("Head").inverted() @ Vector((0.0, -0.92, 0.38)))).normalized()
            return escala(mat(self.cp.w("boca"), Z.rotation_difference(d).to_matrix()), i)
        return fn

    def brasa(self, cig_fn, tam):
        def fn(f):
            s = valor({"s": tam}, "s", f)
            if s <= 1e-3:
                return OCULTO.copy()
            return cig_fn(f) @ Matrix.Translation((0, 0, CIG - 0.0015)) @ Matrix.Diagonal((s, s, 1.0 + (s - 1.0) * 1.6, 1.0))
        return fn

    def isq(self, mao_fn, vis):
        return lambda f: escala(mao_fn(f)[0] @ self.L_ISQ, valor({"v": vis}, "v", f))

    # ---------------------------------------------------------- poses
    def descanso(self):
        """Mao do cigarro na altura da cintura, antebraco para a frente, palma para cima e para dentro."""
        return self.rel("r", (0.0, -0.20, -0.31), (-0.30, -0.80, 0.40), (-0.50, 0.05, 0.85), (0.35, 0.30, -0.40))

    def bolso(self, lado):
        sg = 1 if lado == "l" else -1

        def fn(f):
            q = self.cp.w("bolso_" + lado)
            Rz = self.ctx["Rz"]
            dd = Rz @ Vector((0.10 * sg, -0.25, -1.0))
            pa = Rz @ Vector((-1.0 * sg, 0.0, 0.0))
            pos = q - dd.normalized() * 0.055 + Rz @ Vector((0.012 * sg, 0.0, 0.0))
            return alvo_mao(pos, dd, pa, pos + Rz @ Vector((0.35 * sg, 0.30, 0.10)))
        return fn

    def balanca(self, lado, N, amp=0.012):
        sg = 1 if lado == "l" else -1
        base_ = self.solta(lado)

        def fn(f):
            M, polo = base_(f)
            M = M.copy()
            M.translation += self.ctx["Rz"] @ Vector((0.004 * sg, -amp * sn(f / N + 0.15 * sg), 0.0))
            return M, polo
        return fn

    def mao_concha(self):
        """Mao direita em concha do lado da chama (protege do vento)."""
        def fn(f):
            p = (self.ctx["cabeca"] @ self.L_BOCA) @ Vector((0, 0, CIG + 0.005))
            Rz = self.ctx["Rz"]
            dd = Rz @ Vector((0.55, -0.35, 0.75))
            pa = Rz @ Vector((0.85, 0.0, -0.25))
            pos = p + Rz @ Vector((-0.045, 0.02, -0.06)) - dd.normalized() * 0.07
            return alvo_mao(pos, dd, pa, pos + Rz @ Vector((-0.30, 0.25, -0.35)))
        return fn

    def mao_acender(self):
        """Isqueiro em pe, com o topo 3 cm abaixo da ponta do cigarro (na boca)."""
        def fn(f):
            p = self.ponta(self.cig_boca(f))
            Rz = self.ctx["Rz"]
            xl = (Rz @ Vector((-1.0, -0.35, 0.0))).normalized()
            Ml = mat(p - Z * (0.068 + 0.030), Matrix((xl, Z.cross(xl), Z)).transposed())
            H = Ml @ self.L_ISQ.inverted()
            return (H, H.translation + Rz @ Vector((0.35, 0.15, -0.35)))
        return fn

    def tr_base(self):
        return dict(quad=Vector((0.0, 0.0, -0.011)), pelve=2.0, inc=2.0, cab=2.0, periodo_resp=60.0)

    def pes(self):
        return {s: Pe2(self.rig, s, self.bola(s, 0.115 * sg), 7.0 * sg) for s, sg in (("l", 1), ("r", -1))}

    # ---------------------------------------------------------- 1) tira o cigarro do bolso, acende e da a primeira tragada
    def clipe_fumar_acender(self):
        N = 190
        desc = self.descanso()
        boca = self.mao_cig_boca()
        mao_r = Seq((0, self.solta("r")), (10, self.solta("r")), (26, self.bolso("r")), (34, self.bolso("r")),
                    (54, boca), (60, boca), (70, self.rel("r", (-0.02, -0.24, -0.20), (-0.4, -0.5, 0.75), (-0.8, 0.2, 0.2), (0.3, 0.3, -0.4))),
                    (86, self.mao_concha()), (112, self.mao_concha()), (124, boca), (130, boca), (152, desc), (N, desc))
        cig_mao = self.cig_mao(mao_r)
        cig = Seq((0, OCULTO.copy()), (29, OCULTO.copy(), "l"), (30, cig_mao, "l"), (54, cig_mao), (58, self.cig_boca),
                  (124, self.cig_boca), (130, cig_mao), (N, cig_mao))
        acende = self.mao_acender()
        mao_l = Seq((0, self.solta("l")), (44, self.solta("l")), (58, self.bolso("l")), (64, self.bolso("l")), (84, acende),
                    (112, acende), (134, self.bolso("l")), (140, self.bolso("l")), (158, self.solta("l")), (N, self.solta("l")))
        lit = Trilha((0, 0.0, True), (99, 0.0, True), (104, 1.0, True))
        chama = Trilha((0, 0.0, True), (93, 0.0, True), (95, 1.0, True), (112, 1.0, True), (114, 0.0, True))
        isq = self.isq(mao_l, Trilha((0, 0.0, True), (61, 0.0, True), (62, 1.0, True), (138, 1.0, True), (139, 0.0, True)))
        tr = self.tr_base()
        tr.update(
            inc=Seq((0, 2.0), (22, 6.0), (36, 4.0), (56, 3.0), (90, 6.0), (110, 6.0), (126, 2.0), (N, 2.0)),
            cab=Seq((0, 2.0), (20, 16.0), (36, 4.0), (54, 0.0), (84, 8.0), (96, 10.0), (110, 6.0), (130, -8.0), (150, -4.0), (170, 2.0)),
            cab_giro=Seq((0, 0.0), (18, -14.0), (34, -6.0), (52, 0.0), (60, 6.0), (70, 0.0), (130, 0.0), (150, 8.0), (172, 0.0)),
            lado=Seq((0, 0.0), (20, -3.0), (40, 0.0), (60, 2.0), (74, 0.0)),
            resp=Seq((0, 1.0), (96, 1.0), (108, 2.6), (126, 2.4), (150, 1.0)),
            ombros=Seq((0, 0.0), (98, 0.0), (108, 4.0), (126, 0.0)),
            mao_r=mao_r, mao_l=mao_l,
            dedos_r=Seq((0, G("solta")), (22, G("bolso")), (30, G("pinca")), (60, G("pinca")), (70, G("solta")), (84, G("aberta")),
                        (114, G("aberta")), (122, G("solta")), (128, G("pinca")), (N, G("pinca"))),
            dedos_l=Seq((0, G("solta")), (54, G("bolso")), (62, G("isqueiro")), (91, G("isqueiro")),
                        (93, misturar(G("isqueiro"), G("punho"), 0.6)), (95, G("isqueiro")), (138, G("isqueiro")),
                        (144, G("solta")), (N, G("solta"))),
            props={"Prop_Cigarro": cig, "Prop_Brasa": self.brasa(cig, lit), "Prop_Isqueiro": isq,
                   "FX_Fumaca_Ponta": self.fx_ponta(cig, Trilha((0, 0.0, True), (102, 0.0, True), (108, 0.55), (N, 0.35, True))),
                   "FX_Fumaca_Boca": self.fx_boca(Trilha((0, 0.0, True), (130, 0.0, True), (134, 1.0), (152, 0.6), (162, 0.0, True))),
                   "Prop_Chama": lambda f: escala(isq(f) @ Matrix.Translation((0, 0, 0.068)), chama(f)) if chama(f) > 1e-3 else OCULTO.copy()},
        )
        for k in ("Prop_Cigarro", "Prop_Brasa", "FX_Fumaca_Ponta"):
            self.segue(k, 30, 54, "RightHand")
            self.segue(k, 58, 124, "Head")
            self.segue(k, 130, N - 1, "RightHand")
        for k in ("Prop_Isqueiro", "Prop_Chama"):
            self.segue(k, 62, 138, "LeftHand")
        self.segue("FX_Fumaca_Boca", 0, N - 1, "Head")
        pes = self.pes()
        return [self.finalizar(self.corpo(f, tr), f, tr, pes) for f in range(N)]

    # ---------------------------------------------------------- 2) loop: traga, segura, solta a fumaca, bate a cinza
    def clipe_fumar_loop(self):
        N = 240
        desc = self.descanso()
        boca = self.mao_cig_boca()
        bate = Trilha((0, 0.0, True), (172, 0.0, True), (176, 1.0), (180, 0.0), (184, 1.0), (189, 0.0, True))

        def desc_bate(f):
            M, polo = desc(f)
            b = bate(f)
            return (M @ mat(Vector((0, -0.006 * b, 0)), Matrix.Rotation(math.radians(-14 * b), 3, "Z")), polo)
        mao_r = Seq((0, desc_bate), (32, desc_bate), (56, boca), (92, boca), (118, desc_bate), (N, desc_bate))
        cig = self.cig_mao(mao_r)
        traga = Trilha((0, 1.0, True), (58, 1.0, True), (66, 1.6), (88, 1.7), (100, 1.0, True))
        tr = self.tr_base()
        tr.update(
            quad=lambda f: Vector((0.012 * sn(f / N), 0.0, -0.012 + 0.003 * cs(2 * f / N))),
            pelve_lado=lambda f: -1.8 * sn(f / N), lado=lambda f: 1.3 * sn(f / N),
            inc=Periodica(N, (0, 2.0), (50, 3.0), (90, 2.5), (130, 0.0), (160, 1.0), (200, 2.0)),
            cab=Periodica(N, (0, 2.0), (40, 4.0), (60, 1.0), (92, 2.0), (118, 3.0), (130, -10.0), (160, -6.0), (190, 4.0), (215, 2.0)),
            cab_giro=Periodica(N, (0, 0.0), (20, 0.0), (36, -6.0), (95, -2.0), (120, 0.0), (140, 10.0), (165, 6.0), (195, 0.0)),
            cab_lado=Periodica(N, (0, 0.0), (130, 0.0), (150, -4.0), (175, 0.0)),
            resp=Periodica(N, (0, 1.0), (56, 1.0), (70, 2.8), (100, 2.6), (124, 1.2), (150, 2.4), (175, 1.0)),
            ombros=Periodica(N, (0, 0.0), (58, 0.0), (90, 4.0), (124, 3.0), (150, 0.0)),
            mao_r=mao_r, mao_l=self.balanca("l", N),
            dedos_r=lambda f: misturar(G("pinca"), (70, 82, 60, 42, 22), bate(f)),
            dedos_l=fixo(G("solta")),
            props={"Prop_Cigarro": cig, "Prop_Brasa": self.brasa(cig, traga),
                   "FX_Fumaca_Ponta": self.fx_ponta(cig, lambda f: 0.35 + 0.35 * (traga(f) - 1.0)),
                   "FX_Fumaca_Boca": self.fx_boca(Periodica(N, (0, 0.0), (126, 0.0), (132, 1.0), (152, 0.7), (166, 0.0), (200, 0.0)))},
        )
        for k in ("Prop_Cigarro", "Prop_Brasa", "FX_Fumaca_Ponta"):
            self.segue(k, 0, N, "RightHand")
        self.segue("FX_Fumaca_Boca", 0, N, "Head")
        pes = self.pes()
        return [self.finalizar(self.corpo(f, tr), f, tr, pes) for f in range(N + 1)]

    # ---------------------------------------------------------- 3) ultima tragada, joga no chao e pisa
    def clipe_fumar_apagar(self):
        N = 160
        desc = self.descanso()
        boca = self.mao_cig_boca()
        joga = self.rel("r", (0.10, -0.30, -0.36), (0.1, -0.9, -0.6), (-0.3, 0.3, -0.9), (0.30, 0.35, -0.40))
        mao_r = Seq((0, desc), (18, desc), (40, boca), (62, boca), (80, desc), (88, joga), (96, self.solta("r")), (N, self.solta("r")))
        cig_mao = self.cig_mao(mao_r)
        chao = Vector((-0.17, -0.36, 0.0042))
        Mchao = mat(chao, rot(Z, 64.0) @ rot(Y, 90.0))
        M0 = {}

        def voo(f):                                   # sai da mao no 92, arco ate o chao no 104, rola ate parar no 110
            if "m" not in M0:
                M0["m"] = cig_mao(92)
            if f <= 104:
                t = (f - 92) / 12.0
                p = M0["m"].translation.lerp(chao + Vector((0.03, 0.04, 0.0)), t) + Z * (0.10 * math.sin(math.pi * t))
                q = M0["m"].to_quaternion().slerp(Mchao.to_quaternion(), t)
                return mat(p, q.to_matrix())
            t = suave((f - 104) / 6.0)
            return mat((chao + Vector((0.03, 0.04, 0))).lerp(chao, t), Mchao.to_3x3())
        pisa = Trilha((0, 0.0, True), (120, 0.0, True), (124, 1.0, True))

        def amassado(f):
            s = pisa(f)
            return voo(min(f, 110)) @ Matrix.Diagonal((1.0 - 0.35 * s, 1.0 - 0.55 * s, 1.0 - 0.15 * s, 1.0))
        cig = Seq((0, cig_mao), (92, cig_mao, "l"), (93, amassado, "l"), (N, amassado))
        traga = Trilha((0, 1.0, True), (42, 1.0, True), (50, 1.7), (60, 1.6), (70, 1.0, True))
        tr = self.tr_base()
        tr.update(
            inc=Seq((0, 2.0), (40, 3.0), (64, 2.0), (90, 8.0), (104, 4.0), (116, 12.0), (140, 10.0), (156, 2.0)),
            cab=Seq((0, 2.0), (40, 2.0), (64, 4.0), (76, -8.0), (90, 14.0), (110, 26.0), (140, 24.0), (156, 2.0)),
            cab_giro=Seq((0, 0.0), (90, -8.0), (110, -4.0), (140, 0.0)),
            resp=Seq((0, 1.0), (44, 1.0), (56, 2.6), (72, 2.2), (100, 1.0)),
            mao_r=mao_r, mao_l=self.balanca("l", 160),
            dedos_r=Seq((0, G("pinca")), (88, G("pinca")), (93, G("aberta")), (104, G("solta"))),
            dedos_l=fixo(G("solta")),
            props={"Prop_Cigarro": cig, "Prop_Brasa": self.brasa(cig, lambda f: traga(f) * (1.0 - rampa(f, 126, 130))),
                   "FX_Fumaca_Ponta": self.fx_ponta(cig, lambda f: (0.35 + 0.35 * (traga(f) - 1.0)) * (1.0 - rampa(f, 124, 132))),
                   "FX_Fumaca_Boca": self.fx_boca(Trilha((0, 0.0, True), (72, 0.0, True), (76, 1.0), (98, 0.6), (108, 0.0, True)))},
        )
        for k in ("Prop_Cigarro", "Prop_Brasa", "FX_Fumaca_Ponta"):
            self.segue(k, 0, 92, "RightHand")
        self.segue("FX_Fumaca_Boca", 0, N - 1, "Head")
        self.marca("fica", ["Prop_Cigarro"])
        pes = self.pes()
        # pe direito vai em cima da bituca e gira duas vezes (amassa), depois volta
        br = pes["r"].b(0)
        alvo = Vector((chao.x, chao.y + 0.08, br.z))
        pes["r"].passo(106, 118, alvo, -20.0, alt=0.05)
        pes["r"].y.add(126, -2.0).add(132, -24.0).add(138, -4.0).add(142, -14.0, True)
        pes["r"].passo(144, 156, br, -7.0, alt=0.04)
        tr["quad"] = Seq((0, Vector((0, 0, -0.011))), (106, Vector((0, 0, -0.011))), (120, Vector((-0.03, -0.06, -0.025))),
                         (142, Vector((-0.03, -0.06, -0.025))), (156, Vector((0, 0, -0.011))))
        return [self.finalizar(self.corpo(f, tr), f, tr, pes) for f in range(N)]

    def vistas(self, clip):
        return [(0.55, -1.0, 0.2), (1.0, -0.25, 0.15)], Vector((0, -0.05, 1.25)), 2.4


def m_poca():
    """Poca de vomito: mancha irregular rasa + pedacos (origem no chao, centro da mancha)."""
    import random
    rnd = random.Random(7)
    m = Malha("Poca_Vomito")
    mt = material_prop("Vomito", (0.46, 0.60, 0.13), 0.18)
    mt2 = material_prop("Vomito_Pedacos", (0.62, 0.56, 0.20), 0.45)
    segs = 28
    raios = [0.20 * (1.0 + 0.22 * math.sin(3 * a) + 0.12 * math.sin(7 * a + 1.3) + 0.05 * rnd.uniform(-1, 1))
             for a in (2 * math.pi * i / segs for i in range(segs))]
    perfil_z = [(0.0, 0.006), (0.55, 0.0055), (0.85, 0.004), (1.0, 0.0012)]
    aneis = []
    centro = m.bm.verts.new((0.0, 0.0, 0.0065))
    for k, (fr, z) in enumerate(perfil_z[1:]):
        aneis.append([m.bm.verts.new((raios[i] * fr * math.cos(2 * math.pi * i / segs) + 0.06,
                                      raios[i] * fr * math.sin(2 * math.pi * i / segs) * 0.85, z)) for i in range(segs)])
    fs = [m.bm.faces.new((centro, aneis[0][i], aneis[0][(i + 1) % segs])) for i in range(segs)]
    for a, b_ in zip(aneis[:-1], aneis[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            fs.append(m.bm.faces.new((a[i], b_[i], b_[j], a[j])))
    m.mats.append(mt)
    for f in fs:
        f.smooth = True
        f.material_index = 0
    centro.co.x = 0.06
    for i in range(14):
        a, r = rnd.uniform(0, 2 * math.pi), rnd.uniform(0.0, 0.14)
        m.esfera(rnd.uniform(0.008, 0.016), mt2, M=Matrix.Translation((0.06 + r * math.cos(a), r * math.sin(a) * 0.85, 0.006)),
                 sub=1, escala=(1.0, rnd.uniform(0.7, 1.3), 0.45))
    return m.fim()


# ================================================================== VOMITAR (no lugar)
class Vomitar(Ator):
    CLIPES = ["vomitar"]
    PROPS = {"Prop_Poca": m_poca, "FX_Vomito": None}
    FX = {"FX_Vomito": "vomito"}

    def maos_joelhos(self, lado):
        sg = 1 if lado == "l" else -1

        def fn(f):
            J = self.ctx["joelho_" + lado]
            C = self.ctx["coxa_" + lado]
            coxa = (J - C).normalized()
            Rz = self.ctx["Rz"]
            p = J - coxa * 0.08 + Z * 0.065 + Rz @ Vector((-0.015 * sg, 0.0, 0.0))
            dd = (coxa * 0.6 + Rz @ Vector((-0.45 * sg, 0.0, -0.75))).normalized()
            pa = Rz @ Vector((0.15 * sg, 0.55, -0.82))
            return alvo_mao(p - dd * 0.07, dd, pa, p + Rz @ Vector((0.45 * sg, 0.35, 0.25)))
        return fn

    def na_barriga(self, lado):
        sg = 1 if lado == "l" else -1

        def fn(f):
            b = self.cp.w("barriga")
            Rz = self.ctx["Rz"]
            dd = Rz @ Vector((-1.0 * sg, -0.15, -0.25))
            pa = Rz @ Vector((0.0, 1.0, 0.05))
            p = b + Rz @ Vector((0.06 * sg, -0.03, 0.0)) - dd.normalized() * 0.08
            return alvo_mao(p, dd, pa, p + Rz @ Vector((0.40 * sg, 0.25, -0.20)))
        return fn

    def limpa_boca(self, lado="r"):
        """Costas da mao/antebraco passando na boca (de dentro para fora)."""
        sg = 1 if lado == "l" else -1
        t = Trilha((0, 0.0, True), (166, 0.0, True), (180, 1.0, True))

        def fn(f):
            b = self.cp.w("boca")
            Rz = self.ctx["Rz"]
            u = t(f)
            dd = Rz @ Vector((-1.0 * sg, -0.2, 0.25))
            pa = Rz @ Vector((0.0, 0.0, -1.0))
            p = b + Rz @ Vector((lerp(0.05, -0.10, u) * sg, -0.05, -0.03)) - dd.normalized() * 0.05
            return alvo_mao(p, dd, pa, p + Rz @ Vector((0.30 * sg, 0.15, -0.40)))
        return fn

    def clipe_vomitar(self):
        N = 220
        heave = lambda f: sum(a * math.exp(-((f - c) / w) ** 2) for c, a, w in ((60, 1.0, 4.0), (86, 1.3, 5.0), (96, 0.8, 4.0),
                                                                                    (124, 1.0, 4.5), (143, 0.4, 2.5)))
        vom = Trilha((0, 0.0, True), (82, 0.0, True), (85, 1.0), (96, 0.9), (101, 0.0, True), (121, 0.0, True), (123, 0.7),
                     (130, 0.4), (133, 0.0, True), (141, 0.0, True), (142, 0.25), (145, 0.0, True))
        curva = Trilha((0, 0.0, True), (30, 0.0, True), (52, 1.0, True), (150, 1.0, True), (178, 0.0, True))
        joel = self.maos_joelhos
        tr = dict(
            joelhos=True,
            quad=lambda f: Vector((0.0, 0.10 * curva(f), -0.011 - 0.10 * curva(f) - 0.012 * heave(f))),
            pelve=lambda f: 2.0 + 18.0 * curva(f),
            inc=lambda f: 2.0 + 34.0 * curva(f) + 9.0 * heave(f) + Seq((0, 0.0), (10, 6.0), (24, 3.0))(f),
            pesc=lambda f: -6.0 * heave(f),
            cab=lambda f: Seq((0, 2.0), (12, 10.0), (26, 6.0), (52, -18.0), (150, -18.0), (178, 4.0), (196, -4.0), (N, 2.0))(f) + 10.0 * heave(f),
            cab_giro=Seq((0, 0.0), (160, 0.0), (184, 10.0), (192, -10.0), (200, 6.0), (210, 0.0)),
            ombros=lambda f: 7.0 * heave(f) + 2.0 * curva(f),
            resp=lambda f: 1.2 + 1.6 * curva(f), periodo_resp=40.0,
            mao_l=Seq((0, self.solta("l")), (8, self.solta("l")), (20, self.na_barriga("l")), (34, self.na_barriga("l")), (52, joel("l")),
                      (156, joel("l")), (176, self.na_barriga("l")), (200, self.na_barriga("l")), (N, self.solta("l"))),
            mao_r=Seq((0, self.solta("r")), (14, self.solta("r")), (26, self.limpa_boca("r")), (32, self.limpa_boca("r")), (54, joel("r")),
                      (150, joel("r")), (164, self.limpa_boca("r")), (184, self.limpa_boca("r")), (204, self.solta("r")), (N, self.solta("r"))),
            dedos_l=Seq((0, G("solta")), (16, G("aberta")), (N, G("aberta"))),
            dedos_r=Seq((0, G("solta")), (20, G("punho")), (34, G("aberta")), (160, G("aberta")), (166, G("punho")), (190, G("solta"))),
        )
        bocas = {}

        def fx(f):
            i = vom(f)
            if i <= 1e-3:
                return OCULTO.copy()
            d = (self.ctx["cabeca"].to_3x3() @ (self.rig.rot_w("Head").inverted() @ Vector((0.0, -0.75, -0.66)))).normalized()
            return escala(mat(self.cp.w("boca"), Z.rotation_difference(d).to_matrix()), i)
        poca_t = Trilha((0, 0.0, True), (88, 0.0, True), (100, 0.72), (124, 0.78), (134, 1.0, True))
        P_poca = mat(Vector((0.0, -0.50, 0.0)), rot(Z, -12.0))
        tr["props"] = {"FX_Vomito": fx, "Prop_Poca": lambda f: escala(P_poca, poca_t(f))}
        self.segue("FX_Vomito", 0, N - 1, "Head")
        self.marca("fica", ["Prop_Poca"])
        pes = {s: Pe2(self.rig, s, self.bola(s, 0.13 * sg), 9.0 * sg) for s, sg in (("l", 1), ("r", -1))}
        pes["r"].passo(26, 38, self.bola("r", -0.17, 0.08), -12.0, alt=0.03)        # abre a base para se curvar
        pes["r"].passo(182, 196, self.bola("r", -0.115), -7.0, alt=0.03)
        pes["l"].passo(190, 204, self.bola("l", 0.115), 7.0, alt=0.03)
        return [self.finalizar(self.corpo(f, tr), f, tr, pes) for f in range(N)]

    def vistas(self, clip):
        return [(0.55, -1.0, 0.25), (1.0, -0.1, 0.12)], Vector((0, -0.15, 0.85)), 3.3


# ------------------------------------------------------------------ cena de referencia (anim/bar_ref.blend, gravada pelo 17)
def carregar_ref(nomes, ancora):
    """Anexa objetos do bar_ref.blend e poe tudo no espaco da ancora (nome de objeto ou Matrix do mundo). So para previa e
    para tirar medidas: o export apaga tudo que nao e personagem/prop."""
    with bpy.data.libraries.load(REF, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if any(n == x or n.startswith(x + ".") or (x.endswith("*") and n.startswith(x[:-1]))
                                                     for x in nomes)]
    obs = {o.name: o for o in dst.objects if o is not None}
    for o in obs.values():
        bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.update()
    M = obs[ancora].matrix_world.copy() if isinstance(ancora, str) else ancora
    Mi = M.inverted()
    for o in obs.values():
        if o.parent is None:
            o.matrix_world = Mi @ o.matrix_world
    bpy.context.view_layer.update()
    return obs, M


def m_prato():
    m = Malha("Prato")
    branco = material_prop("Prato_Louca", (0.95, 0.95, 0.93), 0.22)
    m.torno([(0.0, 0.0), (0.060, 0.0), (0.074, 0.004), (0.108, 0.012), (0.124, 0.020), (0.122, 0.023), (0.104, 0.016),
             (0.070, 0.0095), (0.0, 0.0095)], branco, segs=32)
    return m.fim()


def m_batatas():
    import random
    rnd = random.Random(3)
    m = Malha("Batatas")
    cores = [material_prop("Batata", (0.93, 0.72, 0.30), 0.55), material_prop("Batata_Torrada", (0.82, 0.55, 0.20), 0.55)]
    for i in range(30):
        a, r = rnd.uniform(0, 2 * math.pi), rnd.uniform(0.0, 0.065)
        L = rnd.uniform(0.045, 0.072)
        z = 0.012 + rnd.uniform(0.0, 0.024) * (1.0 - r / 0.07)
        M = Matrix.Translation((r * math.cos(a), r * math.sin(a), z)) @ Matrix.Rotation(rnd.uniform(0, 2 * math.pi), 4, "Z") \
            @ Matrix.Rotation(rnd.uniform(-0.25, 0.25), 4, "Y")
        m.caixa((-L / 2, -0.0045, -0.0045), (L / 2, 0.0045, 0.0045), cores[i % 5 == 0], M=M)
    return m.fim()


def m_garfo():
    """Garfo com a origem na pegada; +X para os dentes, +Z para o lado de cima (concavo)."""
    m = Malha("Garfo")
    inox = material_prop("Inox_Talher", (0.80, 0.80, 0.82), 0.25, 1.0)
    m.caixa((-0.075, -0.0065, -0.0018), (0.055, 0.0065, 0.0018), inox)
    m.caixa((0.055, -0.0045, -0.0015), (0.078, 0.0045, 0.0015), inox, M=Matrix.Rotation(math.radians(-8), 4, "Y"))
    m.caixa((0.077, -0.011, 0.0), (0.084, 0.011, 0.003), inox)
    for k in range(4):
        y = -0.0085 + k * 0.0057
        m.caixa((0.084, y - 0.0012, 0.0005), (0.118, y + 0.0012, 0.0025), inox, M=Matrix.Rotation(math.radians(6), 4, "Y"))
    return m.fim()


def m_garfada():
    m = Malha("Garfada")
    mt = material_prop("Batata", (0.93, 0.72, 0.30), 0.55)
    m.caixa((-0.025, -0.0045, -0.0045), (0.030, 0.0045, 0.0045), mt, M=Matrix.Rotation(math.radians(70), 4, "Z"))
    m.caixa((-0.022, -0.0045, -0.0045), (0.026, 0.0045, 0.0045), mt, M=Matrix.Translation((0.004, 0.0, 0.007)) @ Matrix.Rotation(math.radians(110), 4, "Z"))
    return m.fim()


# ================================================================== CADEIRA (espaco da cadeira: origem na base, frente = -Y)
class Cadeira(Ator):
    """Cadeira vermelha das mesas (assento a 0,44 m, encosto ate 0,87 m). A cadeira e um vazio animado (Prop_Cadeira):
    o JS move a instancia de A_cadeira-vermelha do mapa com ele."""
    CLIPES = ["sentar", "sentado_loop", "comer_comecar", "comer_loop", "comer_terminar", "levantar"]
    PROPS = {"Prop_Cadeira": None, "Prop_Prato": m_prato, "Prop_Batatas": m_batatas, "Prop_Garfo": m_garfo, "Prop_Garfada": m_garfada}
    ANCORA = "cadeira"
    H_SENT = mat(Vector((0.0, 0.005, 0.565)), rot(X, -9.0))        # quadril sentado no quadro da cadeira
    PUXA = 0.40                                                     # quanto a cadeira sai para tras
    INICIO = Vector((-0.56, 0.02, 0.0))                             # em pe ao lado da cadeira (lado direito de quem senta)
    TOPO = 0.778                                                    # tampo da mesa vermelha
    BORDA = -0.595 + 0.416                                          # borda da mesa no quadro da cadeira (y)
    PRATO = mat(Vector((0.0, -0.37, 0.7795)), rot(Z, 8.0))
    GARFO_MESA = mat(Vector((-0.165, -0.33, 0.7815)), rot(Z, -96.0))
    L_GARFO = mat(Vector((0.072, 0.020, 0.004)), rot(Z, 12.0) @ rot(X, 90.0))   # garfo no quadro da mao direita

    def __init__(self, rig, cp):
        super().__init__(rig, cp)
        self.obs, self.M_anc = carregar_ref(["Mesa.005", "Cadeira.020", "Cadeira.021", "Cadeira.022", "Cadeira.023"], "Cadeira.020")
        self.obs["Cadeira.020"].hide_render = True                  # quem aparece e a copia que segue o Prop_Cadeira
        vis = bpy.data.objects.new("Previa_Cadeira", self.obs["Cadeira.020"].data)
        bpy.context.scene.collection.objects.link(vis)
        self.vis_cadeira = vis
        self.Hs_pe = self.H0 + Vector((0, 0, -0.011))

    # ---------------------------------------------------------- cadeira e pontos nela
    def cad(self, y, giro=0.0):
        return mat(Vector((0.0, y, 0.0)), rot(Z, giro))

    def H_cad(self, C, sobe=0.0, extra=None):
        H = C @ self.H_SENT
        if sobe:
            H = Matrix.Translation(Z * sobe) @ H
        return H @ extra if extra is not None else H

    def mao_encosto(self, C_fn, lado="l"):
        sg = 1 if lado == "l" else -1

        def fn(f):
            C = C_fn(f)
            p = C @ Vector((-0.10 * sg, 0.25, 0.835))
            dd = C.to_3x3() @ Vector((0.25 * sg, 0.55, -0.80))
            pa = C.to_3x3() @ Vector((0.0, 0.35, -0.94))
            return alvo_mao(p - dd.normalized() * 0.05, dd, pa, p + C.to_3x3() @ Vector((0.35 * sg, -0.10, 0.10)))
        return fn

    def mao_assento(self, C_fn, lado):
        sg = 1 if lado == "l" else -1

        def fn(f):
            C = C_fn(f)
            p = C @ Vector((0.285 * sg, -0.13, 0.415))
            dd = C.to_3x3() @ Vector((-0.45 * sg, 0.0, -0.9))
            pa = C.to_3x3() @ Vector((-0.95 * sg, 0.0, 0.25))
            return alvo_mao(p - dd.normalized() * 0.06, dd, pa, p + C.to_3x3() @ Vector((0.35 * sg, 0.30, 0.30)))
        return fn

    def mao_borda(self, lado, dy=0.0):
        """Mao na borda da mesa (para empurrar a cadeira para tras)."""
        sg = 1 if lado == "l" else -1
        p = Vector((0.20 * sg, self.BORDA - 0.035 + dy, self.TOPO + 0.025))
        M = mat(p, base(Vector((-0.25 * sg, -0.95, -0.15)), Vector((0.0, 0.1, -1.0))))
        return fixo((M, p + Vector((0.35 * sg, 0.30, -0.25))))

    def antebraco_mesa(self, lado="l"):
        sg = 1 if lado == "l" else -1
        p = Vector((0.13 * sg, -0.285, self.TOPO + 0.028))
        M = mat(p, base(Vector((-0.40 * sg, -0.92, -0.05)), Vector((0.08 * sg, 0.0, -1.0))))
        return fixo((M, p + Vector((0.22 * sg, 0.30, -0.12))))

    def mao_coxa(self, lado):
        sg = 1 if lado == "l" else -1

        def fn(f):
            J, C = self.ctx["joelho_" + lado], self.ctx["coxa_" + lado]
            coxa = (J - C).normalized()
            p = C.lerp(J, 0.62) + Z * 0.085 + Vector((0.01 * sg, 0, 0))
            dd = (coxa + Vector((-0.25 * sg, 0, -0.35))).normalized()
            return alvo_mao(p - dd * 0.06, dd, Vector((0.05 * sg, 0.0, -1.0)), p + Vector((0.35 * sg, 0.30, 0.10)))
        return fn

    def pes_sentado(self, C=None, avanca=0.0):
        """Pes no chao debaixo da mesa (cadeira em C; 'avanca' tira os pes da posicao final)."""
        C = C if C is not None else Matrix.Identity(4)
        out = {}
        for s, sg in (("l", 1), ("r", -1)):
            b = C @ Vector((0.135 * sg, -0.50 + avanca, 0.0))
            b.z = Pe.bola_em(self.rig, s, Matrix.Identity(4)).z
            out[s] = b
        return out

    def tr_sentado(self):
        """Pose base sentado na cadeira no lugar (fim do sentar, comeco do levantar)."""
        return dict(H=lambda f: self.H_cad(Matrix.Identity(4)), wH=1.0, inc=7.0, cab=4.0, pesc=2.0, joelhos=True,
                    mao_l=self.antebraco_mesa("l"), mao_r=self.mao_coxa("r"),
                    dedos_l=fixo(G("solta")), dedos_r=fixo(G("solta")), periodo_resp=80.0, resp=1.0)

    def pes_fixos_sentado(self):
        bs = self.pes_sentado()
        return {s: Pe2(self.rig, s, bs[s], 6.0 * sg) for s, sg in (("l", 1), ("r", -1))}

    def props_cadeira(self, C_fn, prato=0.0):
        d = {"Prop_Cadeira": C_fn}
        return d

    # ---------------------------------------------------------- 1) sentar: puxa a cadeira, entra, senta e chega para a frente
    def clipe_sentar(self):
        N = 210
        P0, PX = self.INICIO, self.PUXA
        cy = Seq((0, 0.0), (32, 0.0), (58, PX), (146, PX), (158, PX * 0.52, "f"), (166, PX * 0.52), (178, 0.0, "f"), (N, 0.0))
        cg = Seq((0, 0.0), (32, 0.0), (58, -5.0), (146, -5.0), (158, -2.0), (178, 0.0))
        C = lambda f: self.cad(cy(f), cg(f))
        raiz = Seq((0, P0), (34, P0), (58, P0 + Vector((0, 0.30, 0))), (70, P0 + Vector((0, 0.30, 0))),
                   (84, Vector((-0.26, 0.15, 0.0))), (100, Vector((0.0, 0.02, 0.0))), (N, Vector((0.0, 0.02, 0.0))))
        hop = lambda f: 0.022 * (math.exp(-((f - 152) / 4.0) ** 2) + math.exp(-((f - 172) / 4.0) ** 2))
        sent = Seq((0, 0.0), (102, 0.0), (132, 1.0, "a"), (N, 1.0))
        tr = dict(
            raiz=raiz, quad=Seq((0, Vector((0, 0, -0.011))), (24, Vector((0, 0.03, -0.03))), (60, Vector((0, 0.03, -0.03))),
                                (76, Vector((0, 0, -0.015))), (N, Vector((0, 0, -0.015)))),
            H=lambda f: self.H_cad(C(f), sobe=hop(f)), wH=sent,
            inc=Seq((0, 2.0), (22, 18.0), (40, 22.0), (58, 12.0), (70, 4.0), (100, 4.0), (116, 28.0), (132, 18.0), (146, 16.0),
                    (160, 20.0), (178, 18.0), (196, 7.0)),
            giro=Seq((0, 0.0), (22, 18.0), (56, 14.0), (70, 0.0)),
            cab=Seq((0, 2.0), (14, 22.0), (40, 18.0), (64, 4.0), (100, 6.0), (116, 14.0), (136, 2.0), (180, 8.0), (196, 4.0)),
            cab_giro=Seq((0, 0.0), (10, 22.0), (40, 10.0), (64, 26.0), (84, 18.0), (100, 0.0), (116, -6.0), (136, 0.0)),
            pesc=Seq((0, 0.0), (130, 0.0), (160, 2.0)), resp=1.1, periodo_resp=80.0, joelhos=True,
            mao_l=Seq((0, self.solta("l")), (14, self.solta("l")), (30, self.mao_encosto(C, "l")), (58, self.mao_encosto(C, "l")),
                      (72, self.solta("l")), (104, self.solta("l")), (122, self.mao_assento(C, "l")), (178, self.mao_assento(C, "l")),
                      (198, self.antebraco_mesa("l"))),
            mao_r=Seq((0, self.solta("r")), (108, self.solta("r")), (126, self.mao_assento(C, "r")), (178, self.mao_assento(C, "r")),
                      (200, self.mao_coxa("r"))),
            dedos_l=Seq((0, G("solta")), (22, G("aberta")), (30, G("segura")), (58, G("segura")), (66, G("solta")), (116, G("aberta")),
                        (124, G("segura")), (178, G("segura")), (192, G("solta"))),
            dedos_r=Seq((0, G("solta")), (118, G("aberta")), (128, G("segura")), (178, G("segura")), (192, G("solta"))),
            props={"Prop_Cadeira": C},
        )
        pes = {s: Pe2(self.rig, s, self.bola(s, P0.x + 0.115 * sg), 7.0 * sg) for s, sg in (("l", 1), ("r", -1))}
        R = lambda f: mat(raiz(f), Matrix.Identity(3))
        # dois passos para tras puxando a cadeira, tres de lado ate a frente do assento
        pes["r"].passo(36, 46, self.bola("r", P0.x - 0.115, 0.30), -7.0, alt=0.035, ergue=8.0, pisa=3.0)
        pes["l"].passo(44, 56, self.bola("l", P0.x + 0.115, 0.30), 7.0, alt=0.035, ergue=8.0, pisa=3.0)
        pes["l"].passo(70, 82, self.bola("l", -0.14, 0.17), 4.0, alt=0.045)
        pes["r"].passo(78, 90, self.bola("r", -0.30, 0.08), -10.0, alt=0.04)
        pes["l"].passo(88, 99, self.bola("l", 0.12, 0.02), 7.0, alt=0.045)
        pes["r"].passo(94, 104, self.bola("r", -0.115, 0.02), -7.0, alt=0.04)
        # pes deslizam para baixo da mesa enquanto a cadeira chega para a frente
        bs = self.pes_sentado()
        meio = self.pes_sentado(avanca=0.18)
        pes["l"].ir(124, 140, bola=self.bola("l", 0.13, -0.06), yaw=6.0)
        pes["r"].ir(126, 142, bola=self.bola("r", -0.13, -0.06), yaw=-6.0)
        pes["l"].ir(148, 158, bola=meio["l"], arco=0.015)
        pes["r"].ir(149, 159, bola=meio["r"], arco=0.015)
        pes["l"].ir(168, 178, bola=bs["l"], yaw=6.0, arco=0.015)
        pes["r"].ir(169, 179, bola=bs["r"], yaw=-6.0, arco=0.015)
        self.marca("assento", round(0.44, 3))
        return [self.finalizar(self.corpo(f, tr), f, tr, pes) for f in range(N)]

    # ---------------------------------------------------------- 2) sentado sem fazer nada (8 s)
    def clipe_sentado_loop(self):
        N = 240
        tr = self.tr_sentado()
        olha = Periodica(N, (0, 0.0), (30, 0.0), (52, 24.0), (90, 20.0), (110, -4.0), (150, -26.0), (178, -22.0), (200, 0.0))
        bate = lambda f: (1.0 if 196 <= f <= 228 else 0.0) * (0.5 - 0.5 * math.cos(2 * math.pi * (f - 196) / 8.0))
        tr.update(
            inc=Periodica(N, (0, 7.0), (60, 6.0), (120, 9.0), (170, 6.0)), cab_giro=olha, giro=lambda f: 0.25 * olha(f),
            cab=Periodica(N, (0, 4.0), (40, 2.0), (90, 6.0), (130, 10.0), (160, 2.0), (210, 6.0)),
            cab_lado=Periodica(N, (0, 0.0), (60, 4.0), (120, -3.0), (180, 2.0)),
            lado=Periodica(N, (0, 0.0), (80, 2.0), (160, -2.0)),
            ombros=Periodica(N, (0, 0.0), (120, 0.0), (132, 6.0), (150, 0.0), (180, 0.0)),
            resp=Periodica(N, (0, 1.0), (118, 1.0), (134, 2.4), (156, 1.0)),
            dedos_r=lambda f: misturar(G("solta"), (55, 65, 45, 12, 8), bate(f)),
        )
        tr["H"] = lambda f: self.H_cad(Matrix.Identity(4), extra=mat(Vector((0.004 * sn(f / N), 0, 0)), rot(Y, 1.2 * sn(f / N))))
        tr["props"] = {"Prop_Cadeira": fixo(Matrix.Identity(4))}
        pes = self.pes_fixos_sentado()
        pes["r"].i = Trilha((0, 0.0, True), (60, 0.0, True), (70, 14.0), (80, 0.0), (90, 14.0), (100, 0.0, True))   # bate o pe
        return [self.finalizar(self.corpo(f, tr), f, tr, pes) for f in range(N + 1)]

    # ---------------------------------------------------------- comer: garfo na mao direita, porcao de batata no prato
    def garfo_na_mao(self, mao_fn):
        return lambda f: mao_fn(f)[0] @ self.L_GARFO

    def mao_pelo_garfo(self, Mg_fn, polo_off=(-0.30, 0.30, -0.35)):
        def fn(f):
            H = Mg_fn(f) @ self.L_GARFO.inverted()
            return (H, H.translation + Vector(polo_off))
        return fn

    def garfo_prato(self, k):
        """Garfo espetando a batata k do prato (ponta dos dentes no monte, cabo para cima e para a direita)."""
        pts = [Vector((0.02, -0.02, 0.028)), Vector((-0.03, 0.01, 0.024)), Vector((0.01, 0.035, 0.022))]
        p = self.PRATO @ pts[k % len(pts)]
        d = Vector((0.30, -0.45, -0.84)).normalized()
        zf = (Vector((0.4, 0.6, 0.2)) - d * d.dot(Vector((0.4, 0.6, 0.2)))).normalized()
        R = Matrix((d, zf.cross(d), zf)).transposed()
        return fixo(mat(p - R @ Vector((0.112, 0, 0)), R))

    def garfo_boca(self, f):
        b = self.cp.w("boca") + self.ctx["cabeca"].to_3x3() @ (self.rig.rot_w("Head").inverted() @ Vector((0.0, -0.012, -0.004)))
        d = Vector((0.30, 0.70, 0.55)).normalized()
        zf = (Z - d * d.z).normalized()
        R = Matrix((d, zf.cross(d), zf)).transposed()
        return mat(b - R @ Vector((0.108, 0, 0)), R)

    def garfo_pronto(self):
        """Garfo parado acima do prato (entre uma garfada e outra)."""
        p = self.PRATO @ Vector((-0.06, 0.07, 0.09))
        d = Vector((0.25, -0.55, -0.50)).normalized()
        zf = (Z - d * d.z).normalized()
        return fixo(mat(p, Matrix((d, zf.cross(d), zf)).transposed()))

    def tr_comendo(self):
        tr = self.tr_sentado()
        tr.update(inc=12.0, cab=14.0, mao_l=self.mao_prato_l(), dedos_l=fixo(G("aberta")), dedos_r=fixo(G("garfo")))
        return tr

    def mao_prato_l(self):
        p = self.PRATO @ Vector((0.135, 0.01, 0.022))
        M = mat(p + Vector((0.05, 0.04, 0.0)), base(Vector((-0.55, -0.80, -0.20)), Vector((0.0, 0.05, -1.0))))
        return fixo((M, p + Vector((0.30, 0.30, -0.25))))

    def props_mesa(self, garfo_fn, garfada=0.0):
        g = lambda f: valor({"g": garfada}, "g", f)
        return {"Prop_Cadeira": fixo(Matrix.Identity(4)), "Prop_Prato": fixo(self.PRATO), "Prop_Batatas": fixo(self.PRATO),
                "Prop_Garfo": garfo_fn, "Prop_Garfada": lambda f: escala(garfo_fn(f) @ Matrix.Translation((0.098, 0.0, 0.006)), g(f))}

    def clipe_comer_comecar(self):
        N = 80
        base_tr = self.tr_sentado()
        pega = self.mao_pelo_garfo(fixo(self.GARFO_MESA))
        pronto = self.mao_pelo_garfo(self.garfo_pronto())
        mao_r = Seq((0, base_tr["mao_r"]), (8, base_tr["mao_r"]), (26, pega), (34, pega), (58, pronto), (N, pronto))
        garfo = Seq((0, fixo(self.GARFO_MESA)), (32, fixo(self.GARFO_MESA), "l"), (33, self.garfo_na_mao(mao_r), "l"),
                    (N, self.garfo_na_mao(mao_r)))
        tr = self.tr_sentado()
        tr.update(inc=Seq((0, 7.0), (28, 14.0), (60, 12.0)), cab=Seq((0, 4.0), (18, 22.0), (40, 18.0), (64, 14.0)),
                  cab_giro=Seq((0, 0.0), (20, -8.0), (48, 0.0)),
                  mao_r=mao_r, mao_l=Seq((0, self.antebraco_mesa("l")), (30, self.antebraco_mesa("l")), (60, self.mao_prato_l())),
                  dedos_r=Seq((0, G("solta")), (20, G("aberta")), (32, G("garfo"))), dedos_l=Seq((0, G("solta")), (40, G("solta")), (60, G("aberta"))),
                  props=self.props_mesa(garfo))
        self.segue("Prop_Garfo", 33, N - 1, "RightHand")
        return [self.finalizar(self.corpo(f, tr), f, tr, self.pes_fixos_sentado()) for f in range(N)]

    def clipe_comer_loop(self):
        N = 210
        pronto = self.mao_pelo_garfo(self.garfo_pronto())
        boca = self.mao_pelo_garfo(self.garfo_boca, polo_off=(-0.30, 0.10, -0.40))
        p0, p1 = self.mao_pelo_garfo(self.garfo_prato(0)), self.mao_pelo_garfo(self.garfo_prato(2))
        mao_r = Seq((0, pronto), (14, pronto), (28, p0), (36, p0), (58, boca), (66, boca), (88, pronto), (114, pronto), (128, p1),
                    (136, p1), (158, boca), (166, boca), (188, pronto), (N, pronto))
        garfo = self.garfo_na_mao(mao_r)
        garfada = Trilha((0, 0.0, True), (32, 0.0, True), (33, 1.0, True), (62, 1.0, True), (63, 0.0, True), (132, 0.0, True), (133, 1.0, True),
                         (162, 1.0, True), (163, 0.0, True))
        mast = lambda f: sum(math.sin(2 * math.pi * (f - c) / 9.0) * (c <= f <= c + 36) for c in (66, 166)) + \
            sum(math.sin(2 * math.pi * (f - c) / 9.0) * (c <= f <= c + 18) for c in (-34,))
        tr = self.tr_comendo()
        tr.update(
            inc=Periodica(N, (0, 12.0), (30, 16.0), (58, 18.0), (90, 12.0), (130, 16.0), (158, 18.0), (190, 12.0)),
            cab=lambda f: Periodica(N, (0, 16.0), (30, 24.0), (58, 6.0), (90, 12.0), (130, 24.0), (158, 6.0), (190, 14.0))(f) + 1.5 * mast(f),
            pesc=Periodica(N, (0, 2.0), (58, 8.0), (80, 2.0), (158, 8.0), (180, 2.0)),
            cab_giro=Periodica(N, (0, 0.0), (90, 0.0), (104, 14.0), (116, 0.0), (190, 0.0), (200, -8.0)),
            mao_r=mao_r,
            props=self.props_mesa(garfo, garfada),
        )
        tr["H"] = lambda f: self.H_cad(Matrix.Identity(4), extra=mat(Vector((0, -0.012 * (math.sin(math.pi * f / (N / 2.0)) ** 2), 0)), Matrix.Identity(3)))
        for k in ("Prop_Garfo", "Prop_Garfada"):
            self.segue(k, 0, N, "RightHand")
        return [self.finalizar(self.corpo(f, tr), f, tr, self.pes_fixos_sentado()) for f in range(N + 1)]

    def clipe_comer_terminar(self):
        N = 100
        pronto = self.mao_pelo_garfo(self.garfo_pronto())
        no_prato = mat(self.PRATO @ Vector((-0.02, 0.06, 0.03)), rot(Z, -60.0) @ rot(Y, 8.0))
        solta_g = self.mao_pelo_garfo(fixo(no_prato))
        base_tr = self.tr_sentado()
        limpa = self.rel("r", (-0.10, -0.12, 0.06), (-0.9, -0.2, 0.35), (0.1, 0.1, -1.0), (0.30, 0.20, -0.40))
        mao_r = Seq((0, pronto), (10, pronto), (28, solta_g), (34, solta_g), (52, limpa), (60, limpa), (82, base_tr["mao_r"]), (N, base_tr["mao_r"]))
        garfo = Seq((0, self.garfo_na_mao(mao_r)), (32, self.garfo_na_mao(mao_r), "l"), (33, fixo(no_prato), "l"), (N, fixo(no_prato)))
        tr = self.tr_sentado()
        tr.update(inc=Seq((0, 12.0), (30, 14.0), (56, 8.0), (80, 4.0), (N, 7.0)), cab=Seq((0, 14.0), (30, 18.0), (56, 0.0), (80, 6.0), (N, 4.0)),
                  ombros=Seq((0, 0.0), (66, 0.0), (76, 5.0), (90, 0.0)), resp=Seq((0, 1.0), (64, 1.0), (76, 2.4), (92, 1.0)),
                  mao_r=mao_r, mao_l=Seq((0, self.mao_prato_l()), (40, self.mao_prato_l()), (70, self.antebraco_mesa("l"))),
                  dedos_r=Seq((0, G("garfo")), (30, G("garfo")), (36, G("aberta")), (50, misturar(G("solta"), G("punho"), 0.4)), (84, G("solta"))),
                  dedos_l=Seq((0, G("aberta")), (50, G("aberta")), (70, G("solta"))),
                  props=self.props_mesa(garfo))
        self.segue("Prop_Garfo", 0, 32, "RightHand")
        self.marca("fica", ["Prop_Prato", "Prop_Batatas", "Prop_Garfo"])
        return [self.finalizar(self.corpo(f, tr), f, tr, self.pes_fixos_sentado()) for f in range(N)]

    # ---------------------------------------------------------- levantar: empurra a cadeira, levanta, sai e guarda a cadeira
    def clipe_levantar(self):
        N = 200
        P0, PX = self.INICIO, self.PUXA
        cy = Seq((0, 0.0), (18, 0.0), (34, PX * 0.85, "f"), (124, PX * 0.85), (156, 0.0), (N, 0.0))
        cg = Seq((0, 0.0), (34, -4.0), (124, -4.0), (156, 0.0))
        C = lambda f: self.cad(cy(f), cg(f))
        sent = Seq((0, 1.0), (40, 1.0), (70, 0.0), (N, 0.0))
        raiz = Seq((0, Vector((0.0, 0.10, 0.0))), (70, Vector((0.0, 0.10, 0.0))), (88, Vector((-0.26, 0.24, 0.0))),
                   (108, P0 + Vector((0, 0.34, 0))), (126, P0 + Vector((0, 0.34, 0))), (156, P0), (N, P0))
        base_tr = self.tr_sentado()
        tr = dict(
            raiz=raiz, quad=Seq((0, Vector((0, 0, -0.015))), (100, Vector((0, 0, -0.015))), (126, Vector((0, 0.03, -0.03))),
                                (150, Vector((0, 0.03, -0.03))), (176, Vector((0, 0, -0.011)))),
            H=lambda f: self.H_cad(C(f)), wH=sent, joelhos=True,
            inc=Seq((0, 7.0), (14, 10.0), (32, 2.0), (46, 30.0), (60, 24.0), (74, 6.0), (100, 4.0), (126, 20.0), (150, 18.0), (176, 2.0)),
            giro=Seq((0, 0.0), (100, 0.0), (126, 16.0), (152, 12.0), (174, 0.0)),
            cab=Seq((0, 4.0), (30, -2.0), (50, 12.0), (74, 2.0), (126, 18.0), (156, 12.0), (180, 2.0)),
            cab_giro=Seq((0, 0.0), (72, 0.0), (90, -10.0), (110, 20.0), (156, 14.0), (182, 0.0)),
            resp=1.1, periodo_resp=80.0,
            mao_l=Seq((0, base_tr["mao_l"]), (10, base_tr["mao_l"]), (20, self.mao_borda("l")), (34, self.mao_borda("l", 0.03)),
                      (52, self.solta("l")), (110, self.solta("l")), (126, self.mao_encosto(C, "l")), (156, self.mao_encosto(C, "l")),
                      (174, self.solta("l"))),
            mao_r=Seq((0, base_tr["mao_r"]), (10, base_tr["mao_r"]), (22, self.mao_borda("r")), (34, self.mao_borda("r", 0.03)),
                      (54, self.solta("r")), (N, self.solta("r"))),
            dedos_l=Seq((0, G("solta")), (16, G("aberta")), (40, G("aberta")), (52, G("solta")), (118, G("aberta")), (126, G("segura")),
                        (156, G("segura")), (166, G("solta"))),
            dedos_r=Seq((0, G("solta")), (16, G("aberta")), (40, G("aberta")), (54, G("solta"))),
            props={"Prop_Cadeira": C},
        )
        bs = self.pes_sentado()
        pes = {s: Pe2(self.rig, s, bs[s], 6.0 * sg) for s, sg in (("l", 1), ("r", -1))}
        pes["l"].ir(18, 34, bola=self.pes_sentado(avanca=0.20)["l"], arco=0.01)
        pes["r"].ir(19, 35, bola=self.pes_sentado(avanca=0.20)["r"], arco=0.01)
        pes["l"].ir(38, 50, bola=self.bola("l", 0.13, 0.04), yaw=7.0, arco=0.03)
        pes["r"].ir(40, 52, bola=self.bola("r", -0.13, 0.06), yaw=-7.0, arco=0.03)
        pes["r"].passo(72, 84, self.bola("r", -0.33, 0.20), -9.0, alt=0.045)
        pes["l"].passo(80, 92, self.bola("l", -0.17, 0.26), 5.0, alt=0.045)
        pes["r"].passo(90, 102, self.bola("r", P0.x - 0.115, 0.34), -7.0, alt=0.045)
        pes["l"].passo(98, 110, self.bola("l", P0.x + 0.115, 0.34), 7.0, alt=0.045)
        pes["l"].passo(130, 142, self.bola("l", P0.x + 0.115, 0.16), 7.0, alt=0.035)
        pes["r"].passo(140, 152, self.bola("r", P0.x - 0.115, 0.0), -7.0, alt=0.035)
        pes["l"].passo(152, 164, self.bola("l", P0.x + 0.115, 0.0), 7.0, alt=0.035)
        return [self.finalizar(self.corpo(f, tr), f, tr, pes) for f in range(N)]

    def vistas(self, clip):
        if clip in ("sentar", "levantar"):
            return [(-0.75, -1.0, 0.45), (-1.0, 0.25, 0.25)], Vector((-0.2, -0.05, 0.75)), 3.4
        return [(-0.45, -1.0, 0.35), (-1.0, 0.15, 0.2)], Vector((0.0, -0.20, 0.85)), 2.6

    def preparar_previa(self, r):
        """Copia visivel da cadeira segue o Prop_Cadeira (so na previa)."""
        self.vis_cadeira.parent = r["props"]["Prop_Cadeira"]


def m_pano():
    """Pano de prato embolado (origem no meio da face de baixo; X para a frente dos dedos)."""
    m = Malha("Pano")
    mt = material_prop("Pano", (0.86, 0.88, 0.90), 0.85)
    lista = material_prop("Pano_Listra", (0.20, 0.38, 0.72), 0.85)
    m.esfera(0.06, mt, M=Matrix.Translation((0, 0, 0.016)), sub=2, escala=(1.15, 0.85, 0.30))
    m.esfera(0.035, lista, M=Matrix.Translation((0.03, 0.01, 0.026)) @ Matrix.Rotation(0.5, 4, "Z"), sub=1, escala=(1.4, 0.7, 0.45))
    m.esfera(0.03, mt, M=Matrix.Translation((-0.04, -0.015, 0.024)), sub=1, escala=(1.2, 1.0, 0.5))
    return m.fim()


# ================================================================== MESA (espaco da mesa vermelha: centro no chao, quina +X+Y)
class Mesa(Ator):
    """Limpar a mesa pela quina +X+Y (o JS gira o clipe de 90 em 90 graus para usar a quina mais perto)."""
    CLIPES = ["limpar_mesa"]
    PROPS = {"Prop_Pano": m_pano}
    ANCORA = "mesa"
    TOPO = 0.778
    L_PANO = mat(Vector((0.070, 0.030, 0.0)), Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0))) @ rot(X, 180.0))

    def __init__(self, rig, cp):
        super().__init__(rig, cp)
        self.obs, M = carregar_ref(["Mesa.005", "Cadeira.020", "Cadeira.021", "Cadeira.022", "Cadeira.023", "Mesa_06"], "Mesa_06")
        # ancora = marcador da mesa (topo) descido ate o chao
        for o in self.obs.values():
            if o.parent is None:
                o.matrix_world = Matrix.Translation((0, 0, self.TOPO)) @ o.matrix_world
        bpy.context.view_layer.update()

    def pano_em(self, p, giro=0.0):
        R = rot(Z, giro) @ Matrix(((0.707, -0.707, 0), (0.707, 0.707, 0), (0, 0, 1))).transposed()
        return mat(Vector((p[0], p[1], self.TOPO + 0.001)), R)

    def mao_no_pano(self, pano_fn):
        def fn(f):
            H = pano_fn(f) @ self.L_PANO.inverted()
            return (H, H.translation + self.ctx["Rz"] @ Vector((-0.35, 0.30, 0.25)))
        return fn

    def clipe_limpar_mesa(self):
        N = 270
        yaw = -45.0
        raiz = Vector((0.66, 0.66, 0.0))
        c1, c2 = Vector((0.12, 0.17)), Vector((0.25, -0.03))

        def circulo(c, f0, voltas, per=30.0, r=0.10):
            def fn(f):
                a = 2 * math.pi * min(max((f - f0) / per, 0.0), voltas)
                p = Vector((c.x + r * math.cos(a) * 1.15, c.y + r * math.sin(a), 0.0))
                return self.pano_em(p, giro=8.0 * math.sin(a))
            return fn
        varre = lambda f: self.pano_em(Vector((0.02, 0.02, 0)).lerp(Vector((0.36, 0.36, 0)), suave((f - 186) / 22.0)))
        bolso = self.rel("r", (0.0, 0.0, 0.0), (0, 0, -1), (1, 0, 0))

        def mao_bolso(f):
            q = self.cp.w("bolso_tras_r")
            Rz = self.ctx["Rz"]
            dd = Rz @ Vector((0.0, 0.25, -1.0))
            pa = Rz @ Vector((0.0, -1.0, -0.2))
            p = q - dd.normalized() * 0.05 + Rz @ Vector((0.0, 0.02, 0.0))
            return alvo_mao(p, dd, pa, p + Rz @ Vector((-0.35, 0.10, 0.25)))
        pano_mesa = Seq((0, circulo(c1, 64, 2.0)), (124, circulo(c1, 64, 2.0)), (132, circulo(c2, 134, 1.6)), (182, circulo(c2, 134, 1.6)),
                        (186, varre), (N, varre))
        mao_pano = self.mao_no_pano(pano_mesa)
        dobra = self.rel("r", (-0.06, -0.24, -0.26), (-0.5, -0.7, 0.2), (-0.3, 0.2, -1.0), (0.30, 0.30, -0.35))
        mao_r = Seq((0, self.solta("r")), (12, self.solta("r")), (28, mao_bolso), (34, mao_bolso), (56, mao_pano), (210, mao_pano),
                    (226, dobra), (234, dobra), (248, mao_bolso), (254, mao_bolso), (266, self.solta("r")))
        pano = Seq((0, OCULTO.copy()), (31, OCULTO.copy(), "l"), (32, lambda f: mao_r(f)[0] @ self.L_PANO, "l"),
                   (56, pano_mesa), (210, pano_mesa), (226, lambda f: mao_r(f)[0] @ self.L_PANO), (251, lambda f: mao_r(f)[0] @ self.L_PANO, "l"),
                   (252, OCULTO.copy(), "l"), (N, OCULTO.copy()))
        apoio_p = Vector((0.33, 0.27, self.TOPO + 0.025))
        apoio = fixo((mat(apoio_p, base(Vector((-0.80, -0.55, -0.1)), Vector((0, 0, -1)))), apoio_p + Vector((0.45, 0.10, -0.15))))
        dentro = Seq((0, 0.0), (34, 0.0), (56, 1.0), (204, 1.0), (226, 0.0))
        circ_corpo = lambda f: (math.sin(2 * math.pi * (f - 64) / 30.0) if 64 <= f <= 182 else 0.0)
        tr = dict(
            raiz=raiz, yaw=yaw,
            quad=lambda f: Vector((-0.02 * circ_corpo(f), -0.06 * dentro(f), -0.011 - 0.07 * dentro(f))),
            pelve=lambda f: 2.0 + 22.0 * dentro(f), pelve_giro=lambda f: -6.0 * dentro(f),
            inc=lambda f: 2.0 + 34.0 * dentro(f) + 2.0 * circ_corpo(f),
            giro=lambda f: -10.0 * dentro(f) + 4.0 * circ_corpo(f), lado=lambda f: 3.0 * dentro(f),
            cab=lambda f: Seq((0, 2.0), (20, 14.0), (34, 6.0), (56, -12.0), (204, -12.0), (230, 10.0), (250, 4.0))(f),
            cab_giro=Seq((0, 0.0), (14, -30.0), (34, -20.0), (56, 0.0), (210, 0.0), (240, 10.0), (262, 0.0)),
            resp=1.2, periodo_resp=60.0,
            mao_r=mao_r,
            mao_l=Seq((0, self.solta("l")), (36, self.solta("l")), (56, apoio), (200, apoio), (222, self.solta("l"))),
            dedos_r=Seq((0, G("solta")), (24, G("bolso")), (32, G("pano")), (60, G("apoio")), (206, G("apoio")), (220, G("pano")),
                        (250, G("pano")), (258, G("solta"))),
            dedos_l=Seq((0, G("solta")), (48, G("apoio")), (206, G("apoio")), (220, G("solta"))),
            props={"Prop_Pano": pano},
        )
        self.segue("Prop_Pano", 32, 56, "RightHand")
        self.segue("Prop_Pano", 210, 251, "RightHand")
        pes = {s: Pe2(self.rig, s, self.bola(s, 0.12 * sg, 0.0, R=mat(raiz, giro_z(yaw))), yaw + 8.0 * sg) for s, sg in (("l", 1), ("r", -1))}
        R = mat(raiz, giro_z(yaw))
        pes["l"].passo(40, 52, self.bola("l", 0.14, -0.05, R=R), yaw + 10.0, alt=0.03)
        pes["l"].passo(222, 236, self.bola("l", 0.12, 0.0, R=R), yaw + 8.0, alt=0.03)
        self.marca("topo", self.TOPO)
        return [self.finalizar(self.corpo(f, tr), f, tr, pes) for f in range(N)]

    def vistas(self, clip):
        return [(1.0, -1.0, 0.45), (-1.0, 1.0, 0.45)], Vector((0.35, 0.35, 0.85)), 3.2


# ================================================================== BANHEIRO (espaco do Mictorio_Lugar_N: mictorio a frente)
class Banheiro(Ator):
    CLIPES = ["urinar"]
    PROPS = {"FX_Urina": None}
    FX = {"FX_Urina": "urina"}
    ANCORA = "mictorio"

    def __init__(self, rig, cp):
        super().__init__(rig, cp)
        self.obs, M = carregar_ref(["Mictorio", "Mictorio_Lugar_1"], "Mictorio_Lugar_1")
        # parede atras do mictorio (so previa)
        me = bpy.data.meshes.new("Parede_Previa")
        me.from_pydata([(-1.2, -0.64, 0), (1.2, -0.64, 0), (1.2, -0.64, 2.4), (-1.2, -0.64, 2.4)], [], [(0, 1, 2, 3)])
        o = bpy.data.objects.new("Parede_Previa", me)
        mt = bpy.data.materials.new("Parede_Previa")
        mt.diffuse_color = (0.75, 0.78, 0.80, 1)
        me.materials.append(mt)
        bpy.context.scene.collection.objects.link(o)

    def ziper(self, lado, desce=0.0):
        sg = 1 if lado == "l" else -1

        def fn(f):
            v = self.cp.w("virilha")
            Rz = self.ctx["Rz"]
            d = valor({"d": desce}, "d", f)
            dd = Rz @ Vector((-0.45 * sg, -0.15, -0.88))
            pa = Rz @ Vector((-0.15 * sg, 0.95, 0.0))
            p = v + Rz @ Vector((0.035 * sg, -0.035, 0.07 - d)) - dd.normalized() * 0.075
            return alvo_mao(p, dd, pa, p + Rz @ Vector((0.40 * sg, 0.25, -0.05)))
        return fn

    def cintura(self, lado):
        sg = 1 if lado == "l" else -1

        def fn(f):
            Hw = self.ctx["Hw"]
            Rz = self.ctx["Rz"]
            p = Hw.translation + Rz @ Vector((0.205 * sg, 0.0, 0.035))
            dd = Rz @ Vector((-0.30 * sg, -0.75, -0.55))
            pa = Rz @ Vector((-1.0 * sg, 0.1, 0.0))
            return alvo_mao(p - dd.normalized() * 0.06, dd, pa, p + Rz @ Vector((0.40 * sg, 0.30, 0.0)))
        return fn

    def clipe_urinar(self):
        N = 345
        jato = Trilha((0, 0.0, True), (88, 0.0, True), (94, 1.0), (180, 0.95), (226, 0.75), (238, 0.0, True), (244, 0.35), (247, 0.0, True),
                      (252, 0.25), (254, 0.0, True))
        sacode = lambda f: (0.025 * math.sin(2 * math.pi * (f - 258) / 7.0) if 258 <= f <= 278 else 0.0)

        def segura(f):
            M, polo = self.ziper("r", -0.01)(f)
            M = M.copy()
            M.translation += Z * sacode(f)
            return M, polo
        descarga = Vector((0.0, -0.585, 1.20))

        def mao_descarga(f):
            dd = Vector((0.15, -1.0, 0.25))
            pa = Vector((0.0, -0.3, -1.0))
            p = descarga - dd.normalized() * 0.095
            return alvo_mao(p, dd, pa, p + Vector((-0.40, 0.30, -0.20)))
        tr = dict(
            quad=Seq((0, Vector((0, 0, -0.011))), (24, Vector((0, -0.02, -0.014))), (296, Vector((0, -0.02, -0.014))),
                     (310, Vector((0, -0.08, -0.02))), (324, Vector((0, -0.08, -0.02))), (340, Vector((0, 0, -0.011)))),
            pelve=Seq((0, 2.0), (80, 4.0), (296, 4.0), (340, 2.0)),
            inc=Seq((0, 2.0), (30, 12.0), (70, 10.0), (96, 4.0), (250, 4.0), (260, 8.0), (296, 10.0), (312, 22.0), (324, 20.0), (340, 2.0)),
            cab=Seq((0, 2.0), (30, 28.0), (70, 26.0), (100, 18.0), (120, -16.0), (150, -20.0), (170, -6.0), (200, -14.0), (236, 14.0),
                    (280, 26.0), (300, 6.0), (318, 0.0), (340, 2.0)),
            cab_giro=Seq((0, 0.0), (120, 0.0), (140, 24.0), (158, 18.0), (176, -16.0), (196, -10.0), (214, 0.0)),
            cab_lado=Seq((0, 0.0), (110, 0.0), (130, 6.0), (190, 4.0), (214, 0.0)),
            ombros=Seq((0, 0.0), (120, 0.0), (128, 6.0), (140, 0.0)), resp=Seq((0, 1.0), (118, 1.0), (128, 2.6), (146, 1.0)),
            periodo_resp=70.0,
            mao_r=Seq((0, self.solta("r")), (14, self.solta("r")), (34, self.ziper("r")), (40, self.ziper("r")),
                      (54, self.ziper("r", 0.07)), (70, segura), (282, segura), (288, self.ziper("r", 0.07)), (300, self.ziper("r")),
                      (310, mao_descarga), (320, mao_descarga), (338, self.solta("r")), (N, self.solta("r"))),
            mao_l=Seq((0, self.solta("l")), (16, self.solta("l")), (34, self.ziper("l")), (58, self.ziper("l")), (78, self.cintura("l")),
                      (276, self.cintura("l")), (290, self.ziper("l")), (300, self.ziper("l")), (316, self.solta("l")), (N, self.solta("l"))),
            dedos_r=Seq((0, G("solta")), (30, G("pinca")), (60, G("pinca")), (70, G("segura")), (282, G("segura")), (290, G("pinca")),
                        (302, G("pinca")), (310, misturar(G("aberta"), G("segura"), 0.3)), (322, misturar(G("aberta"), G("segura"), 0.3)),
                        (334, G("solta"))),
            dedos_l=Seq((0, G("solta")), (30, G("pinca")), (60, G("pinca")), (78, G("aberta")), (276, G("aberta")), (290, G("pinca")),
                        (302, G("pinca")), (312, G("solta"))),
        )

        def fx(f):
            i = jato(f)
            if i <= 1e-3:
                return OCULTO.copy()
            Hw = self.ctx["Hw"]
            p = self.cp.w("virilha") + self.ctx["Rz"] @ Vector((0.0, -0.045, 0.012))
            d = (Hw.to_3x3() @ (self.rig.rot_w("Hips").inverted() @ Vector((0.0, -0.94, 0.33)))).normalized()
            return escala(mat(p, Z.rotation_difference(d).to_matrix()), i)
        tr["props"] = {"FX_Urina": fx}
        self.segue("FX_Urina", 0, N - 1, "Hips")
        pes = {s: Pe2(self.rig, s, self.bola(s, 0.12 * sg), 7.0 * sg) for s, sg in (("l", 1), ("r", -1))}
        pes["l"].passo(10, 22, self.bola("l", 0.15, -0.05), 9.0, alt=0.03)
        pes["r"].passo(18, 30, self.bola("r", -0.15, -0.05), -9.0, alt=0.03)
        pes["r"].passo(328, 340, self.bola("r", -0.12), -7.0, alt=0.03)
        pes["l"].passo(332, 344, self.bola("l", 0.12), 7.0, alt=0.03)
        return [self.finalizar(self.corpo(f, tr), f, tr, pes) for f in range(N)]

    def vistas(self, clip):
        return [(1.0, -0.15, 0.25), (-0.6, 1.0, 0.45)], Vector((0.0, -0.20, 1.0)), 2.8


COPO_FUNDO, COPO_TOPO, COPO_R0, COPO_RT = 0.009, 0.156, 0.031, 0.0455      # interior do P_Copo_Chopp (17_lugares_animacao.py)
ESPUMA = 0.030
RZ90 = rot(Z, -90.0)                             # copo/garrafa na mao: eixo X para a frente de quem olha para -Y
R_VIRADO = Matrix(((0, -1, 0), (-1, 0, 0), (0, 0, -1))).transposed()   # copo de boca para baixo (X para a frente)


def m_liquido(nome, cor, escuro=False):
    """Chopp dentro do copo (quadro do copo: fundo na origem, eixo +Z). Shape keys: nivel (0 = vazio, 1 = cheio),
    inclina_x / inclina_y (superficie na horizontal com o copo inclinado: peso = -up.x/up.z, -up.y/up.z do mundo no copo),
    espuma (colarinho de 3 cm)."""
    seg = 20
    liq = material_prop(nome + "_Liquido", cor, 0.15, emis=tuple(c * 0.25 for c in cor), forca=1.0)
    esp = material_prop("Chopp_Espuma", (0.97, 0.94, 0.86), 0.7)
    vs = [(0.0, 0.0, COPO_FUNDO)]
    for k in range(3):                                   # aneis: fundo, superficie (S), topo da espuma (F)
        for i in range(seg):
            a = 2 * math.pi * i / seg
            vs.append((COPO_R0 * math.cos(a), COPO_R0 * math.sin(a), COPO_FUNDO))
    vs.append((0.0, 0.0, COPO_FUNDO))                    # centro do topo
    A = lambda k, i: 1 + k * seg + (i % seg)
    top = len(vs) - 1
    faces, mats = [], []
    for i in range(seg):
        faces.append((0, A(0, i + 1), A(0, i)))
        mats.append(0)
        faces.append((A(0, i), A(0, i + 1), A(1, i + 1), A(1, i)))
        mats.append(0)
        faces.append((A(1, i), A(1, i + 1), A(2, i + 1), A(2, i)))
        mats.append(1)
        faces.append((A(2, i), A(2, i + 1), top))
        mats.append(1)
    me = bpy.data.meshes.new(nome)
    me.from_pydata(vs, [], faces)
    me.materials.append(liq)
    me.materials.append(esp)
    for p, mi in zip(me.polygons, mats):
        p.material_index = mi
        p.use_smooth = True
    o = bpy.data.objects.new("_tmp_" + nome, me)
    bpy.context.scene.collection.objects.link(o)
    o.shape_key_add(name="Basis")
    kn, kx, ky, ke = (o.shape_key_add(name=n) for n in ("nivel", "inclina_x", "inclina_y", "espuma"))
    for kb in (kn, kx, ky, ke):
        kb.slider_min, kb.slider_max = -3.0, 3.0
    for k in (1, 2):
        for i in range(seg):
            a = 2 * math.pi * i / seg
            j = A(k, i)
            kn.data[j].co = (COPO_RT * math.cos(a), COPO_RT * math.sin(a), COPO_TOPO)
            kx.data[j].co.z += COPO_RT * math.cos(a)
            ky.data[j].co.z += COPO_RT * math.sin(a)
            if k == 2:
                ke.data[j].co.z += ESPUMA
    kn.data[top].co.z = COPO_TOPO
    ke.data[top].co.z += ESPUMA
    bpy.data.objects.remove(o, do_unlink=True)
    return me


def m_jato():
    """Jato de chopp: origem na bica, comprimento 1 m para -Z (escala Z = comprimento)."""
    m = Malha("Jato_Chopp")
    m.cil(0.0034, -1.0, 0.0, material_prop("Jato_Chopp", (0.95, 0.70, 0.22), 0.1, emis=(0.6, 0.38, 0.08), forca=1.0), segs=8,
          r2=0.0028, tampas=False)
    return m.fim()


# ================================================================== MAGRAO (espaco do Balcao_Lugar_Magrao: cliente a frente)
class Magrao(Ator):
    CLIPES = ["magrao_chopp", "magrao_chopp_escuro", "magrao_longneck"]
    PROPS = {"Prop_Copo": lambda: bpy.data.meshes["P_Copo_Chopp"], "Prop_Chopp": lambda: m_liquido("Chopp_Claro", (0.88, 0.55, 0.10)),
             "Prop_Chopp_Escuro": lambda: m_liquido("Chopp_Escuro", (0.24, 0.09, 0.03)), "Prop_Jato": m_jato,
             "Prop_LongNeck": lambda: bpy.data.meshes["A_long-neck"], "Prop_Tampa_Freezer": lambda: bpy.data.meshes["P_Freezer_Bar_Tampa"]}
    ANCORA = "Balcao_Lugar_Magrao"
    # copo na mao esquerda: dedos em volta, polegar para cima (eixo do copo = -Z do quadro da mao esquerda), pegada a 7 cm do fundo
    L_COPO = mat(Vector((0.070, 0.050, 0.070)), Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1))))
    # long-neck na mao direita pelo gargalo (eixo da garrafa = +Z do quadro da mao direita = lado do polegar)
    L_LN = mat(Vector((0.066, 0.030, -0.185)), Matrix.Identity(3))

    def __init__(self, rig, cp):
        super().__init__(rig, cp)
        self.obs, M = carregar_ref(["Interior_Balcao", "Chopeira", "Chopeira_FX_Torneira_1", "Chopeira_FX_Torneira_2", "Estufa",
                                    "Caixa_Registradora", "Freezer", "Freezer.001", "Freezer_Bar_Tampa", "Bandeja_Copos", "Copo_Bandeja",
                                    "Bandeja_Copo*", "Freezer_Bar_LongNeck*", "Banqueta.003", "Banqueta.004", "Banqueta.005",
                                    "Balcao_Entrega", "Balcao_Lugar_Magrao"], "Balcao_Lugar_Magrao")
        ob = self.obs
        self.Mch = ob["Chopeira"].matrix_world.copy()
        fx = bpy.data.meshes["A_chopeira"]["fx_torneiras"]
        self.bica = {k: ob["Chopeira_FX_Torneira_%d" % k].matrix_world.translation.copy() for k in (1, 2)}
        self.alavanca = {k: self.Mch @ Vector((fx[k - 1][0], -0.178, 0.47)) for k in (1, 2)}
        self.G_band = ob["Copo_Bandeja"].matrix_world.copy()
        self.ent = ob["Balcao_Entrega"].matrix_world.translation.copy()
        self.M_tampa = ob["Freezer_Bar_Tampa"].matrix_world.copy()
        self.M_fz = ob["Freezer"].matrix_world.copy()
        self.ln0 = mat(self.M_fz @ Vector((0.15, -0.20, 0.40)), Matrix.Identity(3))   # long-neck do buraco do freezer (17_lugares)
        for k in (1, 2):
            print("  torneira %d: bica %s alavanca %s" % (k, tuple(round(v, 3) for v in self.bica[k]), tuple(round(v, 3) for v in self.alavanca[k])))
        print("  copo da bandeja %s | entrega %s | dobradica %s" % (tuple(round(v, 3) for v in self.G_band.translation),
                                                                    tuple(round(v, 3) for v in self.ent), tuple(round(v, 3) for v in self.M_tampa.translation)))
        for n in ("Copo_Bandeja", "Freezer_Bar_Tampa"):
            ob[n].hide_render = True                    # na previa aparecem as copias animadas (no jogo o JS esconde estes)

    # ---------------------------------------------------------- utilidades
    def andar(self, pes, raiz, yaw, janelas, primeiro, larg=0.115, alt=0.05):
        s = primeiro
        for fa, fb in janelas:
            R = mat(raiz(fb), giro_z(yaw(fb)))
            sg = 1 if s == "l" else -1
            r0 = Pe.bola_em(self.rig, s, Matrix.Identity(4))
            b = R @ Vector((larg * sg, r0.y, 0.0))
            b.z = r0.z
            pes[s].passo(fa, fb, b, yaw(fb) + 7.0 * sg, alt=alt)
            s = "r" if s == "l" else "l"

    def mao_por(self, prop_fn, L, polo):
        """Alvo da mao que poe o prop (preso na mao pelo quadro L) em prop_fn(f)."""
        def fn(f):
            H = prop_fn(f) @ L.inverted()
            return (H, H.translation + self.ctx["Rz"] @ Vector(polo))
        return fn

    def copo_sob_bica(self, k, ang_fn):
        """Copo inclinado ang graus (boca para longe do balconista, fundo perto da mao), bica dentro da boca: o jato bate na parede."""
        def fn(f):
            a = ang_fn(f)
            R = rot(X, a) @ RZ90
            zg = R @ Z
            borda = self.bica[k] - Z * 0.022 + Vector((0.0, 0.022 * (a / 45.0), 0.0))
            return mat(borda - zg * 0.162, R)
        return fn

    def copo_carregado(self):
        return lambda f: self.ctx["Rf"] @ mat(Vector((0.06, -0.30, 1.02)), RZ90)

    def liquido(self, copo_fn, nivel, espuma):
        def fn(f):
            Mg = copo_fn(f)
            n, e = valor({"n": nivel}, "n", f), valor({"e": espuma}, "e", f)
            up = (Mg.to_3x3().normalized().inverted() @ Z).normalized()
            wx, wy = -up.x / max(up.z, 0.2), -up.y / max(up.z, 0.2)
            lim = n * (COPO_TOPO - COPO_FUNDO) / COPO_RT
            wx, wy = max(-lim, min(lim, wx)), max(-lim, min(lim, wy))
            return {"nivel": n, "inclina_x": wx, "inclina_y": wy, "espuma": e}
        return fn

    def jato(self, k, copo_fn, nivel, on):
        """Comprimento do jato: da bica ate a superficie do chopp (ou a parede de dentro do copo)."""
        def fn(f):
            i = valor({"i": on}, "i", f)
            if i <= 1e-3:
                return OCULTO.copy()
            Mg = copo_fn(f)
            Mi = Mg.inverted()
            n = valor({"n": nivel}, "n", f)
            zs = COPO_FUNDO + n * (COPO_TOPO - COPO_FUNDO)
            up = (Mg.to_3x3().normalized().inverted() @ Z).normalized()
            wx, wy = -up.x / max(up.z, 0.2), -up.y / max(up.z, 0.2)
            P = self.bica[k]
            L = 0.30
            for t in np.arange(0.0, 0.30, 0.002):
                q = Mi @ (P - Z * t)
                r = (q.x * q.x + q.y * q.y) ** 0.5
                rin = COPO_R0 + (COPO_RT - COPO_R0) * max(0.0, min(1.0, q.z / COPO_TOPO))
                if q.z < 0.17 and (q.z <= zs + wx * q.x + wy * q.y or (r >= rin and q.z > 0.0)):
                    L = t
                    break
            return mat(P, Matrix.Identity(3)) @ Matrix.Diagonal((i, i, max(L, 0.005), 1.0))
        return fn

    def mao_alavanca(self, k, puxa_fn):
        """Mao direita na alavanca da torneira: puxa (+) para o balconista abre o chopp, empurra (-) faz o creme."""
        def fn(f):
            p = self.alavanca[k] + Vector((0.0, 0.035 * valor({"p": puxa_fn}, "p", f), 0.0))
            dd = Vector((0.45, -0.35, 0.82))
            pa = Vector((-0.20, -0.95, 0.10))
            return alvo_mao(p - dd.normalized() * 0.075 - pa.normalized() * 0.02, dd, pa, p + Vector((-0.40, 0.35, -0.30)))
        return fn

    # ---------------------------------------------------------- chopp
    def chopp(self, k, liquido_nome):
        N = 420
        O = Vector((0.0, 0.0, 0.0))
        gb = self.G_band.translation
        Rb = Vector((gb.x - 0.17, -0.14, 0.0))
        Rc = Vector((self.bica[k].x - 0.09, -0.14, 0.0))
        R1 = Vector((0.0, -0.14, 0.0))
        raiz = Seq((0, O), (30, O), (64, Rb), (100, Rb), (118, Rc), (292, Rc), (334, R1), (372, R1), (394, O), (N, O))
        yaw = Seq((0, 0.0), (28, 0.0), (38, -70.0), (54, -70.0), (66, 0.0), (292, 0.0), (300, 75.0), (326, 75.0), (338, 0.0), (N, 0.0))
        ang = Seq((0, 45.0), (176, 45.0), (246, 0.0), (N, 0.0))
        nivel = Seq((0, 0.0), (152, 0.0), (160, 0.05, "l"), (250, 0.86), (N, 0.86))
        esp = Seq((0, 0.0), (190, 0.0), (250, 0.18), (262, 0.20), (282, 1.0), (N, 1.0))
        jorra = Trilha((0, 0.0, True), (150, 0.0, True), (153, 1.0, True), (250, 1.0, True), (253, 0.0, True), (266, 0.0, True),
                       (268, 0.55, True), (280, 0.55, True), (283, 0.0, True))
        puxa = Trilha((0, 0.0, True), (146, 0.0, True), (152, 1.0, True), (250, 1.0, True), (255, 0.0, True), (264, 0.0, True), (268, -1.0, True),
                      (280, -1.0, True), (285, 0.0, True))
        sob_bica = self.copo_sob_bica(k, ang)
        virado = lambda f: mat(self.G_band.translation, R_VIRADO)
        erguido = lambda f: self.ctx["Rf"] @ mat(Vector((0.16, -0.36, 1.04)), RZ90)
        P_ent = lambda f: mat(self.ent + Vector((0.0, -0.035 * rampa(f, 352, 362), 0.0)), RZ90)
        carregado = self.copo_carregado()
        copo = Seq((0, virado), (78, virado), (96, erguido), (112, erguido), (138, sob_bica), (286, sob_bica), (300, carregado),
                   (330, carregado), (350, P_ent), (N, P_ent))
        segura_copo = self.mao_por(copo, self.L_COPO, (0.35, 0.25, -0.30))
        mao_l = Seq((0, self.solta("l")), (60, self.solta("l")), (78, segura_copo),
                    (362, segura_copo),
                    (380, self.solta("l")), (N, self.solta("l")))
        # o copo segue a mao entre a bandeja e o balcao (pegada fixa), so o que esta parado fica no mundo
        copo_final = Seq((0, virado), (78, virado), (79, lambda f: mao_l(f)[0] @ self.L_COPO), (361, lambda f: mao_l(f)[0] @ self.L_COPO),
                         (362, P_ent), (N, P_ent))
        mao_r = Seq((0, self.solta("r")), (126, self.solta("r")), (142, self.mao_alavanca(k, puxa)), (286, self.mao_alavanca(k, puxa)),
                    (302, self.solta("r")), (N, self.solta("r")))
        perto = Seq((0, 0.0), (66, 0.0), (80, 1.0), (96, 0.3), (112, 0.3), (136, 1.0), (288, 1.0), (300, 0.2), (334, 0.2), (352, 1.1),
                    (366, 1.1), (386, 0.0))
        tr = dict(
            raiz=raiz, yaw=yaw,
            quad=lambda f: Vector((0.0, 0.07 * perto(f), -0.011 - 0.035 * perto(f))),
            pelve=lambda f: 2.0 + 14.0 * perto(f),
            inc=lambda f: 3.0 + 26.0 * perto(f) + Seq((0, 0.0), (8, 4.0), (20, 0.0))(f),
            cab=lambda f: Seq((0, 2.0), (8, 14.0), (16, 0.0), (22, 10.0), (30, 2.0), (66, 6.0), (80, 8.0), (140, -6.0), (290, -6.0), (306, 2.0),
                              (346, -10.0), (366, -6.0), (384, 6.0), (392, -4.0), (404, 2.0))(f),
            cab_giro=Seq((0, 0.0), (28, -30.0), (60, -10.0), (80, 0.0), (292, 0.0), (300, 20.0), (330, 0.0), (384, 0.0), (396, 6.0), (410, 0.0)),
            giro=Seq((0, 0.0), (96, 0.0), (110, 10.0), (130, 0.0)),
            resp=1.0, periodo_resp=70.0,
            mao_l=mao_l, mao_r=mao_r,
            dedos_l=Seq((0, G("solta")), (68, G("aberta")), (78, G("copo")), (362, G("copo")), (370, G("aberta")), (386, G("solta"))),
            dedos_r=Seq((0, G("solta")), (132, G("aberta")), (142, G("alavanca")), (286, G("alavanca")), (294, G("aberta")), (306, G("solta"))),
            props={"Prop_Copo": copo_final, liquido_nome: copo_final,
                   "Prop_Jato": self.jato(k, copo_final, nivel, jorra)},
            formas={liquido_nome: self.liquido(copo_final, nivel, esp)},
        )
        for pn in ("Prop_Copo", liquido_nome):
            self.segue(pn, 79, 361, "LeftHand")
        self.marca("substitui", {"Copo_Bandeja": "Prop_Copo"})
        self.marca("entrega", ["Prop_Copo", liquido_nome])
        self.marca("bebida", "chopp_escuro" if "Escuro" in liquido_nome else "chopp")
        pes = {s: Pe2(self.rig, s, self.bola(s, 0.115 * sg), 7.0 * sg) for s, sg in (("l", 1), ("r", -1))}
        self.andar(pes, raiz, yaw, [(30, 40), (38, 48), (46, 56), (54, 64), (60, 68)], "r")
        self.andar(pes, raiz, yaw, [(100, 110), (108, 118)], "r", alt=0.035)
        self.andar(pes, raiz, yaw, [(292, 302), (300, 310), (308, 318), (316, 326), (324, 334), (330, 338)], "l")
        self.andar(pes, raiz, yaw, [(372, 382), (380, 390), (386, 394)], "l", alt=0.035)
        return [self.finalizar(self.corpo(f, tr), f, tr, pes) for f in range(N)]

    def clipe_magrao_chopp(self):
        return self.chopp(1, "Prop_Chopp")

    def clipe_magrao_chopp_escuro(self):
        return self.chopp(2, "Prop_Chopp_Escuro")

    # ---------------------------------------------------------- long-neck do freezer
    def clipe_magrao_longneck(self):
        N = 400
        O = Vector((0.0, 0.0, 0.0))
        hz = self.M_tampa.translation
        fz = self.M_fz.translation
        Rf_ = Vector((fz.x - 0.66, fz.y + 0.02, 0.0))              # de frente para a frente do freezer (que olha para -X da ancora)
        R1 = Vector((0.0, -0.14, 0.0))
        raiz = Seq((0, O), (30, O), (88, Rf_), (238, Rf_), (300, R1), (338, R1), (366, O), (N, O))
        yaw = Seq((0, 0.0), (26, 0.0), (40, 60.0), (76, 90.0), (90, 90.0), (238, 90.0), (250, 40.0), (288, 0.0), (N, 0.0))
        ab = Seq((0, 0.0), (96, 0.0), (112, 58.0), (118, 80.0, "f"), (122, 76.0), (126, 82.0), (176, 82.0), (186, 62.0), (200, 4.0, "a"),
                 (203, 0.0), (206, 1.5), (209, 0.0), (N, 0.0))
        tampa = lambda f: self.M_tampa @ mat(Vector(), rot(X, -ab(f)))
        puxador = lambda f: tampa(f) @ Vector((0.0, -0.665, 0.03))

        def mao_tampa(f):
            p = puxador(f)
            Rt = tampa(f).to_3x3()
            dd = Rt @ Vector((0.0, 0.35, -0.94))
            pa = Rt @ Vector((0.0, 0.94, 0.35))
            return alvo_mao(p - dd.normalized() * 0.07, dd, pa, p + self.ctx["Rz"] @ Vector((0.40, 0.35, -0.10)))
        ln_freezer = lambda f: self.ln0
        sobe = lambda f: self.ln0 @ Matrix.Translation((0, 0, 0.50))
        carregada = lambda f: self.ctx["Rf"] @ mat(Vector((-0.10, -0.28, 0.98)), RZ90)
        P_ent = lambda f: mat(self.ent + Vector((0.0, -0.03 * rampa(f, 326, 334), 0.0)), RZ90)
        garrafa = Seq((0, ln_freezer), (146, ln_freezer), (166, sobe), (180, carregada), (304, carregada), (322, P_ent), (N, P_ent))
        mao_r = Seq((0, self.solta("r")), (126, self.solta("r")), (146, self.mao_por(garrafa, self.L_LN, (-0.35, 0.30, -0.10))),
                    (334, self.mao_por(garrafa, self.L_LN, (-0.35, 0.30, -0.10))), (352, self.solta("r")), (N, self.solta("r")))
        garrafa_final = Seq((0, ln_freezer), (146, ln_freezer), (147, lambda f: mao_r(f)[0] @ self.L_LN), (333, lambda f: mao_r(f)[0] @ self.L_LN),
                            (334, P_ent), (N, P_ent))
        mao_l = Seq((0, self.solta("l")), (88, self.solta("l")), (98, mao_tampa), (112, mao_tampa), (124, self.solta("l", frente=0.10)),
                    (172, self.solta("l", frente=0.10)), (184, mao_tampa), (199, mao_tampa), (212, self.solta("l")), (N, self.solta("l")))
        perto = Seq((0, 0.0), (88, 0.0), (100, 0.9), (112, 0.4), (126, 0.4), (146, 1.7), (152, 1.7), (172, 0.5), (186, 0.9), (200, 0.7),
                    (214, 0.0), (304, 0.0), (326, 1.1), (338, 1.1), (356, 0.0))
        tr = dict(
            raiz=raiz, yaw=yaw,
            quad=lambda f: Vector((0.0, 0.08 * perto(f), -0.011 - 0.06 * max(perto(f) - 0.8, 0.0) - 0.02 * perto(f))),
            pelve=lambda f: 2.0 + 14.0 * perto(f),
            inc=lambda f: 3.0 + 26.0 * perto(f) + Seq((0, 0.0), (8, 4.0), (20, 0.0))(f),
            cab=Seq((0, 2.0), (8, 14.0), (16, 0.0), (22, 10.0), (30, 2.0), (90, 8.0), (146, -10.0), (176, 4.0), (300, 2.0), (322, -8.0),
                    (340, -4.0), (360, 6.0), (372, -4.0), (384, 2.0)),
            cab_giro=Seq((0, 0.0), (26, 30.0), (60, 20.0), (90, 0.0), (240, 0.0), (252, -20.0), (290, 0.0)),
            resp=1.0, periodo_resp=70.0,
            mao_l=mao_l, mao_r=mao_r,
            dedos_l=Seq((0, G("solta")), (92, G("aberta")), (98, G("segura")), (112, G("segura")), (122, G("aberta")), (130, G("solta")),
                        (176, G("aberta")), (184, G("segura")), (199, G("segura")), (208, G("solta"))),
            dedos_r=Seq((0, G("solta")), (136, G("aberta")), (146, G("garrafa")), (334, G("garrafa")), (342, G("aberta")), (356, G("solta"))),
            props={"Prop_LongNeck": garrafa_final, "Prop_Tampa_Freezer": tampa},
        )
        self.segue("Prop_LongNeck", 147, 333, "RightHand")
        self.marca("substitui", {"Freezer_Bar_Tampa": "Prop_Tampa_Freezer"})
        self.marca("entrega", ["Prop_LongNeck"])
        self.marca("bebida", "longneck")
        pes = {s: Pe2(self.rig, s, self.bola(s, 0.115 * sg), 7.0 * sg) for s, sg in (("l", 1), ("r", -1))}
        self.andar(pes, raiz, yaw, [(30, 40), (38, 48), (46, 56), (54, 64), (62, 72), (70, 80), (78, 88), (84, 92)], "l")
        self.andar(pes, raiz, yaw, [(238, 248), (246, 256), (254, 264), (262, 272), (270, 280), (278, 288), (286, 296), (292, 302)], "r")
        self.andar(pes, raiz, yaw, [(338, 348), (346, 356), (354, 364)], "l", alt=0.035)
        return [self.finalizar(self.corpo(f, tr), f, tr, pes) for f in range(N)]

    def vistas(self, clip):
        if clip == "magrao_longneck":
            return [(-1.0, 0.6, 0.55), (0.3, -1.0, 0.6)], Vector((0.9, 0.9, 0.9)), 5.0
        return [(1.0, -0.45, 0.45), (-0.3, 1.0, 0.45)], Vector((-0.7, -0.25, 0.95)), 3.8


GRUPOS = {"locomocao": Locomocao, "fumar": Fumar, "vomitar": Vomitar, "cadeira": Cadeira, "mesa": Mesa, "banheiro": Banheiro, "magrao": Magrao}


if __name__ == "__main__":
    nomes = [a for a in ARGS if not a.startswith("--")]
    grupos = [a for a in nomes if a in GRUPOS] or list(GRUPOS)
    so = [a for a in nomes if a not in GRUPOS] or None            # nomes de clipe soltos: so esses
    for grupo in grupos:
        print("==", grupo)
        r = gerar(grupo, so)
        if "--previa" in ARGS:
            previas(r, so)
        if "--sem-export" not in ARGS:
            exportar_fbx(r)
            exportar_glb(r)
