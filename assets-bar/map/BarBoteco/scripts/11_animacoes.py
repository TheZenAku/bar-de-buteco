# Animacoes de urinar (masculina: de pe no mictorio / feminina: sentada no vaso) para o esqueleto AccuRig
# padrao Unreal (root, pelvis, spine_01..05, upperarm_l, thigh_l...). Personagem na origem olhando para -Y.
# Metodo: alvos de IK para maos e pes (pes fixos no chao, joelhos/cotovelos resolvidos pelo IK) + FK na coluna,
# pescoco e cabeca; no fim tudo e "bakeado" em keyframes puros de osso (o que o jogo le) e os alvos sao removidos.
import bpy, math, os
from mathutils import Vector, Quaternion, Matrix

SAIDA = r"C:\Users\rafael\Desktop\BAR\animacoes"
FBX = r"C:\Users\rafael\Desktop\BAR\Meshy_AI_Green_Screen_T_Pose_Man_20261021_texture.fbm\Meshy_AI_Karate_Green_Screen_S_1021190905_texture.fbx"
os.makedirs(SAIDA, exist_ok=True)
# Preparacao (cena, import e rig de IK) e geracao rodam em execucoes separadas: avaliar o depsgraph na mesma
# chamada que importou/copiou o armature e mexeu no modo de edicao derruba o Blender 4.0 (copy-on-write).
preparou = False
scn = bpy.data.scenes.get("Animacoes")
if scn is None:                                 # cena propria com o personagem rigado (AccuRig, nomes padrao UE)
    mapa = bpy.context.window.scene
    scn = bpy.data.scenes.new("Animacoes")
    scn["cena_mapa"] = mapa.name
    bpy.context.window.scene = scn
    with bpy.context.temp_override(scene=scn, view_layer=scn.view_layers[0]):
        bpy.ops.import_scene.fbx(filepath=FBX, automatic_bone_orientation=False, ignore_leaf_bones=True)
    preparou = True
orig = next(o for o in scn.objects if o.type == 'ARMATURE' and o.name != "Rig_IK")   # esqueleto do jogo -> recebe a animacao
# rig auxiliar so para resolver o IK: copia do esqueleto com as pontas das cadeias nas articulacoes
# (o FBX do AccuRig traz pontas soltas, e o IK do Blender leva a PONTA do osso ate o alvo)
arm = scn.objects.get("Rig_IK")
if arm is None:
    arm = orig.copy()
    arm.data = orig.data.copy()
    arm.animation_data_clear()
    arm.name = arm.data.name = "Rig_IK"
    scn.collection.objects.link(arm)
    vl_anim = scn.view_layers[0]
    vl_anim.objects.active = arm
    with bpy.context.temp_override(scene=scn, view_layer=vl_anim, active_object=arm, object=arm,
                                   selected_objects=[arm], selected_editable_objects=[arm]):
        bpy.ops.object.mode_set(mode='EDIT')
        eb = arm.data.edit_bones
        for e in eb:
            e.use_connect = False
        for s in "lr":
            for pai, filho in (("thigh", "calf"), ("calf", "foot"), ("upperarm", "lowerarm"), ("lowerarm", "hand")):
                eb[pai + "_" + s].tail = eb[filho + "_" + s].head
            # dobradicas: eixo Z local = eixo da articulacao (joelho dobra em torno de X do mundo; cotovelo no plano braco/antebraco)
            eb["calf_" + s].align_roll(Vector((1, 0, 0)))
            u, f = eb["upperarm_" + s].vector, eb["lowerarm_" + s].vector
            eb["lowerarm_" + s].align_roll(u.cross(f).normalized())
        bpy.ops.object.mode_set(mode='OBJECT')
    arm.hide_set(True)
    preparou = True
AW = arm.matrix_world
AWI = AW.inverted()
UN = 1.0 / AW.to_scale()[0]                     # metros -> unidades do armature (escala 0.01)
B_ = arm.data.bones


def w(bn, ponto='head'):
    b = B_[bn]
    return AW @ (b.head_local if ponto == 'head' else b.tail_local)


S_L, S_R = w("upperarm_l"), w("upperarm_r")
L_BRACO = (w("lowerarm_l") - S_L).length + (w("hand_l") - w("lowerarm_l")).length
PE_L, PE_R = w("foot_l"), w("foot_r")
PELV = w("pelvis")


def limpar():
    for pb in arm.pose.bones:
        for c in list(pb.constraints):
            pb.constraints.remove(c)
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)
    for o in [o for o in scn.objects if o.name.startswith("IK_")]:
        bpy.data.objects.remove(o, do_unlink=True)
    arm.animation_data_create()
    arm.animation_data.action = None


def alvo(nome, pos, rot=None):
    e = bpy.data.objects.new("IK_" + nome, None)
    scn.collection.objects.link(e)
    e.empty_display_size = 0.05
    e.location = pos
    if rot is not None:
        e.rotation_mode = 'QUATERNION'
        e.rotation_quaternion = rot
    return e


def _ang(u, v, n):
    a = u.angle(v)
    return -a if u.cross(v).dot(n) < 0 else a


def pole_angle(base, ikb, pole_world):
    """Angulo de pole que mantem a cadeia no plano do pole (formula classica, espaco do armature)."""
    bb, bi = B_[base], B_[ikb]
    pole = AWI @ pole_world
    normal = (bi.tail_local - bb.head_local).cross(pole - bb.head_local)
    proj = normal.cross(bb.tail_local - bb.head_local)
    x_arm = bb.matrix_local.to_3x3() @ Vector((1, 0, 0))          # Bone.x_axis esta no espaco do pai, nao do armature
    return _ang(x_arm, proj, bb.tail_local - bb.head_local)


def ik(osso_ik, base, alvo_obj, pole_obj):
    pb = arm.pose.bones[osso_ik]
    pb.lock_ik_x = pb.lock_ik_y = True                       # so dobra em torno de Z (dobradica)
    pb.use_ik_limit_z = True
    vb, vi = B_[base].tail_local - B_[base].head_local, B_[osso_ik].tail_local - B_[osso_ik].head_local
    flex_rep = vb.angle(vi)                                  # flexao ja presente no repouso
    pb.ik_min_z, pb.ik_max_z = -flex_rep + math.radians(2), math.radians(145)
    c = pb.constraints.new('IK')
    c.target, c.pole_target, c.chain_count = alvo_obj, pole_obj, 2
    c.pole_angle = pole_angle(base, osso_ik, pole_obj.location)
    return c


def _avalia():
    bpy.context.view_layer.update()
    return arm.evaluated_get(bpy.context.evaluated_depsgraph_get())


def _erro_polo(ae, base, osso_ik, alvo_obj, pole_obj):
    """Angulo (em torno do eixo raiz->alvo) entre a articulacao do meio e o pole."""
    H = AW @ ae.pose.bones[base].head
    K = AW @ ae.pose.bones[osso_ik].head
    d = (alvo_obj.location - H).normalized()
    kp = (K - H) - d * (K - H).dot(d)
    pp = (pole_obj.location - H) - d * (pole_obj.location - H).dot(d)
    return kp.angle(pp) if kp.length > 1e-6 and pp.length > 1e-6 else math.pi


def pe_fixo(lado, alvo_obj):
    """Pe mantem a orientacao de repouso no mundo (fica chato no chao mesmo com o joelho dobrado)."""
    c = arm.pose.bones["foot_" + lado].constraints.new('COPY_ROTATION')
    c.target = alvo_obj
    c.owner_space = c.target_space = 'WORLD'


def q_rest(bn, rots):
    """Rotacoes (eixo no espaco de repouso do mundo, graus) -> quaternion local do osso."""
    R = B_[bn].matrix_local.to_3x3().normalized()
    M = Matrix.Identity(3)
    for eixo, g in rots:
        M = Quaternion(Vector(eixo).normalized(), math.radians(g)).to_matrix() @ M
    return (R.inverted() @ M @ R).to_quaternion()


def chave_fk(f, poses):
    for bn, rots in poses.items():
        pb = arm.pose.bones[bn]
        pb.rotation_quaternion = q_rest(bn, rots)
        pb.keyframe_insert("rotation_quaternion", frame=f)


def chave_pelvis(f, delta_m, rots=()):
    pb = arm.pose.bones["pelvis"]
    R = B_["pelvis"].matrix_local.to_3x3().normalized()
    pb.location = R.inverted() @ (Vector(delta_m) * UN)
    pb.keyframe_insert("location", frame=f)
    pb.rotation_quaternion = q_rest("pelvis", rots)
    pb.keyframe_insert("rotation_quaternion", frame=f)


def chave_alvo(obj, f, pos):
    obj.location = pos
    obj.keyframe_insert("location", frame=f)


def alcance(ombro, x, y, frac=0.93):
    """Altura z em que o punho alcanca (x, y) com o braco a 'frac' do comprimento (cotovelo levemente dobrado)."""
    d2 = (frac * L_BRACO) ** 2 - (x - ombro.x) ** 2 - (y - ombro.y) ** 2
    return ombro.z - math.sqrt(max(d2, 0.0))


X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)        # inclinar p/ frente = +X | olhar p/ esquerda = +Z


def montar_rig():
    limpar()
    alvos = {}
    for lado, S, sg in (("l", S_L, 1), ("r", S_R, -1)):
        mao = alvo("mao_" + lado, (S.x + sg * 0.04, S.y + 0.02, alcance(S, S.x + sg * 0.04, S.y + 0.02, 0.96)))
        cot = alvo("cotovelo_" + lado, (S.x + sg * 0.25, S.y + 0.45, S.z - 0.30))
        ik("lowerarm_" + lado, "upperarm_" + lado, mao, cot)
        P = PE_L if lado == "l" else PE_R
        rot_pe = (AW @ B_["foot_" + lado].matrix_local).to_quaternion()
        pe = alvo("pe_" + lado, P, rot_pe)
        joe = alvo("joelho_" + lado, (P.x + sg * 0.05, P.y - 0.6, 0.5))
        ik("calf_" + lado, "thigh_" + lado, pe, joe)
        pe_fixo(lado, pe)
        alvos.update({"mao_" + lado: mao, "cot_" + lado: cot, "pe_" + lado: pe, "joelho_" + lado: joe})
    calibrar_polos(alvos)
    return alvos


def calibrar_polos(alvos):
    """Pose de teste com joelhos e cotovelos bem dobrados (sentado, maos a frente): escolhe o pole_angle que poe a
    articulacao do meio no plano do pole. A formula analitica erra com os eixos do AccuRig."""
    pel = arm.pose.bones["pelvis"]
    R = B_["pelvis"].matrix_local.to_3x3().normalized()
    pel.location = R.inverted() @ (Vector((0, 0.20, 0.57 - PELV.z)) * UN)
    guard = {k: o.location.copy() for k, o in alvos.items()}
    for lado, S, sg in (("l", S_L, 1), ("r", S_R, -1)):
        alvos["mao_" + lado].location = (S.x - sg * 0.05, S.y - 0.22, S.z - 0.22)
    for lado in "lr":
        for osso_ik, base, alvo_obj, pole_obj in (("calf_" + lado, "thigh_" + lado, alvos["pe_" + lado], alvos["joelho_" + lado]),
                                                  ("lowerarm_" + lado, "upperarm_" + lado, alvos["mao_" + lado], alvos["cot_" + lado])):
            c = arm.pose.bones[osso_ik].constraints["IK"]
            melhor = None
            for passo, faixa in ((10.0, None), (1.0, 10)):
                centro = 0.0 if melhor is None else melhor[1]
                angs = [-180 + passo * i for i in range(int(360 / passo))] if faixa is None else \
                       [centro + passo * i for i in range(-faixa, faixa + 1)]
                for ang in angs:
                    c.pole_angle = math.radians(ang)
                    e = _erro_polo(_avalia(), base, osso_ik, alvo_obj, pole_obj)
                    if melhor is None or e < melhor[0]:
                        melhor = (e, ang)
            c.pole_angle = math.radians(melhor[1])
            CALIB[osso_ik] = (round(melhor[1], 1), round(math.degrees(melhor[0]), 1))
    for k, p in guard.items():
        alvos[k].location = p
    pel.location = (0, 0, 0)
    _avalia()


CALIB = {}


def maos_neutras():
    return {lado: Vector((S.x + sg * 0.04, S.y + 0.02, alcance(S, S.x + sg * 0.04, S.y + 0.02, 0.96)))
            for lado, S, sg in (("l", S_L, 1), ("r", S_R, -1))}


def respiracao(f0, f1, amp=1.0, periodo=90, base=None):
    base = base or {}
    f = f0
    while f <= f1:
        t = math.sin(2 * math.pi * (f - f0) / periodo)
        poses = {bn: list(r) for bn, r in base.items()}
        poses.setdefault("spine_03", []).append((X, -amp * t))
        poses.setdefault("spine_05", []).append((X, 0.5 * amp * t))
        chave_fk(f, poses)
        f += periodo // 4


def _ordem(ossos):
    out, vistos = [], set()

    def vis(b):
        if b.name in vistos:
            return
        if b.parent:
            vis(b.parent)
        vistos.add(b.name)
        out.append(b)
    for b in ossos:
        vis(b)
    return out


def bake(nome, f0, f1):
    """Retarget quadro a quadro: delta de rotacao (pose x repouso, espaco do armature) de cada osso do rig de IK
    aplicado ao repouso do osso original; depois converte para a base local (eixos originais) e grava keyframes."""
    old = bpy.data.actions.get(nome)
    if old is not None:
        bpy.data.actions.remove(old)
    orig.animation_data_create()
    act = bpy.data.actions.new(nome)
    orig.animation_data.action = act
    for pb in orig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        for c in list(pb.constraints):
            pb.constraints.remove(c)
    ordem = _ordem(orig.data.bones)
    rest_o = {b.name: b.matrix_local.copy() for b in orig.data.bones}
    rest_i = {b.name: b.matrix_local.copy() for b in arm.data.bones}
    for f in range(f0, f1 + 1):
        scn.frame_set(f)
        alvo_m = {}
        for b in ordem:
            pi = arm.pose.bones.get(b.name)
            if pi is None:
                Mi = rest_o[b.name]
                alvo_m[b.name] = (alvo_m[b.parent.name] @ rest_o[b.parent.name].inverted() @ Mi) if b.parent else Mi
                continue
            P = pi.matrix                                                        # pose do rig de IK (armature space)
            D = P.to_3x3() @ rest_i[b.name].to_3x3().inverted()                  # delta de rotacao desde o repouso
            M = (D @ rest_o[b.name].to_3x3()).to_4x4()
            M.translation = P.translation
            alvo_m[b.name] = M
        for b in ordem:
            pb = orig.pose.bones[b.name]
            M = alvo_m[b.name]
            if b.parent:
                base = (rest_o[b.parent.name].inverted() @ rest_o[b.name]).inverted() @ alvo_m[b.parent.name].inverted() @ M
            else:
                base = rest_o[b.name].inverted() @ M
            pb.rotation_quaternion = base.to_quaternion()
            pb.keyframe_insert("rotation_quaternion", frame=f)
            if b.name in ("pelvis", "root"):
                pb.location = base.translation
                pb.keyframe_insert("location", frame=f)
    act.use_fake_user = True
    act["fps"] = 30
    act["fps_info"] = "30 fps, %d quadros" % (f1 - f0 + 1)
    # limpa o rig de IK (acao de construcao, restricoes e alvos)
    pre = arm.animation_data.action if arm.animation_data else None
    if pre is not None:
        arm.animation_data.action = None
        bpy.data.actions.remove(pre)
    for pb in arm.pose.bones:
        for c in list(pb.constraints):
            pb.constraints.remove(c)
    for o in [o for o in scn.objects if o.name.startswith("IK_")]:
        if o.animation_data and o.animation_data.action:
            bpy.data.actions.remove(o.animation_data.action)
        bpy.data.objects.remove(o, do_unlink=True)
    return act


# ===================================================================== MASCULINA (de pe, mictorio a ~35 cm a frente)
def animacao_masculina():
    a = montar_rig()
    N = 230
    neutro = maos_neutras()
    zg_r = alcance(S_R, -0.05, -0.17, 0.95)
    zg_l = alcance(S_L, 0.06, -0.16, 0.95)
    seg_r, seg_l = Vector((-0.05, -0.17, zg_r)), Vector((0.06, -0.16, zg_l + 0.015))
    solta = neutro["l"] + Vector((-0.01, -0.03, 0.01))                    # mao esquerda solta ao lado do corpo
    for k in ("l", "r"):
        chave_alvo(a["mao_" + k], 1, neutro[k]); chave_alvo(a["mao_" + k], 12, neutro[k])
    chave_alvo(a["mao_r"], 34, seg_r); chave_alvo(a["mao_l"], 34, seg_l)       # mao na frente do quadril
    chave_alvo(a["mao_l"], 62, seg_l)
    chave_alvo(a["mao_l"], 80, solta)                                           # segura so com a direita
    chave_alvo(a["mao_l"], 150, solta)
    chave_alvo(a["mao_l"], 168, seg_l)
    chave_alvo(a["mao_r"], 168, seg_r)
    for k, f in enumerate(range(172, 190, 3)):                                  # sacudida
        chave_alvo(a["mao_r"], f, seg_r + Vector((0, 0, 0.012 if k % 2 == 0 else -0.010)))
    chave_alvo(a["mao_r"], 192, seg_r)
    ziper = {"r": Vector((-0.01, -0.165, zg_r + 0.05)), "l": Vector((0.03, -0.16, zg_l + 0.06))}
    chave_alvo(a["mao_r"], 200, ziper["r"]); chave_alvo(a["mao_l"], 200, ziper["l"])
    for k in ("l", "r"):
        chave_alvo(a["mao_" + k], 218, neutro[k]); chave_alvo(a["mao_" + k], N, neutro[k])
    # cotovelos: abertos para fora/tras durante o gesto
    for k, sg, S in (("l", 1, S_L), ("r", -1, S_R)):
        c = a["cot_" + k]
        p0 = c.location.copy()
        chave_alvo(c, 1, p0); chave_alvo(c, 12, p0)
        chave_alvo(c, 34, (S.x + sg * 0.45, S.y + 0.25, S.z - 0.25))
        chave_alvo(c, 200, (S.x + sg * 0.45, S.y + 0.25, S.z - 0.25))
        chave_alvo(c, 218, p0); chave_alvo(c, N, p0)
    cot_solto = (S_L.x + 0.25, S_L.y + 0.45, S_L.z - 0.30)
    chave_alvo(a["cot_l"], 80, cot_solto)
    chave_alvo(a["cot_l"], 150, cot_solto)
    # quadril: leve transferencia de peso
    chave_pelvis(1, (0, 0, 0)); chave_pelvis(30, (0, -0.015, 0))
    chave_pelvis(90, (0.018, -0.02, -0.005), [(Y, -1.5)]); chave_pelvis(150, (0.012, -0.02, -0.005), [(Y, -1.0)])
    chave_pelvis(200, (0, -0.012, 0)); chave_pelvis(N, (0, 0, 0))
    # coluna / cabeca (FK)
    def cab(pitch=0.0, yaw=0.0, incl=0.0):
        return {"spine_02": [(X, incl * 0.3)], "spine_04": [(X, incl * 0.4)], "neck_01": [(X, pitch * 0.4), (Z, yaw * 0.4)],
                "head": [(X, pitch * 0.6), (Z, yaw * 0.6)]}
    for f, p in ((1, cab()), (12, cab(8)), (34, cab(22, 0, 4)), (70, cab(18, 0, 6)), (95, cab(-2, 18, 7)), (125, cab(-4, -10, 7)),
                 (150, cab(14, 0, 5)), (180, cab(24, 0, 4)), (200, cab(20, 0, 3)), (218, cab(4)), (N, cab())):
        chave_fk(f, p)
    return bake("urinar_masculino", 1, N), N


# ===================================================================== FEMININA (sentada no vaso que fica atras dela)
def animacao_feminina():
    a = montar_rig()
    N = 320
    neutro = maos_neutras()
    SENTO_Z = 0.43 + 0.14                                     # assento (~0,43 m) + distancia pelvis->assento
    dz = SENTO_Z - PELV.z
    RECUO = 0.28                                              # quadril vai 28 cm para tras: coxas na horizontal
    sentada = (0, RECUO, dz)
    quadril = {"l": Vector((S_L.x - 0.02, S_L.y + 0.02, PELV.z - 0.05)), "r": Vector((S_R.x + 0.02, S_R.y + 0.02, PELV.z - 0.05))}
    coxa_baixo = {"l": Vector((0.14, -0.02, PELV.z - 0.25)), "r": Vector((-0.14, -0.02, PELV.z - 0.25))}
    coxa_sent = {"l": Vector((0.15, 0.02, SENTO_Z + 0.02)), "r": Vector((-0.15, 0.02, SENTO_Z + 0.02))}
    papel = Vector((S_R.x - 0.22, RECUO - 0.06, SENTO_Z + 0.06))
    for k in ("l", "r"):
        m = a["mao_" + k]
        chave_alvo(m, 1, neutro[k]); chave_alvo(m, 12, neutro[k])
        chave_alvo(m, 26, quadril[k])                              # maos no cos da roupa
        chave_alvo(m, 48, coxa_baixo[k])                           # abaixa a roupa
        chave_alvo(m, 72, coxa_sent[k]); chave_alvo(m, 200, coxa_sent[k])
        chave_alvo(m, 258, coxa_sent[k])
        chave_alvo(m, 268, coxa_baixo[k] + Vector((0, 0, 0.12)))
        chave_alvo(m, 292, quadril[k])                             # sobe a roupa ao levantar
        chave_alvo(m, 306, neutro[k]); chave_alvo(m, N, neutro[k])
    chave_alvo(a["mao_r"], 214, papel); chave_alvo(a["mao_r"], 226, papel + Vector((0, 0, -0.08)))   # pega o papel
    chave_alvo(a["mao_r"], 242, coxa_sent["r"])
    # pes: um pouco mais afastados e a frente quando sentada
    for k, sg, P in (("l", 1, PE_L), ("r", -1, PE_R)):
        pe = a["pe_" + k]
        chave_alvo(pe, 1, P); chave_alvo(pe, 40, P)
        chave_alvo(pe, 70, P + Vector((sg * 0.03, -0.04, 0))); chave_alvo(pe, 262, P + Vector((sg * 0.03, -0.04, 0)))
        chave_alvo(pe, 290, P); chave_alvo(pe, N, P)
        j = a["joelho_" + k]
        chave_alvo(j, 1, j.location.copy()); chave_alvo(j, N, j.location.copy())
        c = a["cot_" + k]
        p0 = c.location.copy()
        chave_alvo(c, 1, p0); chave_alvo(c, 20, (P.x + sg * 0.45, 0.30, 1.05)); chave_alvo(c, 296, (P.x + sg * 0.45, 0.30, 1.05))
        chave_alvo(c, 308, p0); chave_alvo(c, N, p0)
    # senta / levanta (quadril desce e vai para tras, com leve retroversao)
    chave_pelvis(1, (0, 0, 0)); chave_pelvis(30, (0, 0.02, -0.04))
    chave_pelvis(58, (0, RECUO * 0.75, dz * 0.80), [(X, -3)]); chave_pelvis(72, sentada, [(X, -4)])
    chave_pelvis(150, (0.005, RECUO, dz), [(X, -5), (Y, 1)]); chave_pelvis(255, sentada, [(X, -4)])
    chave_pelvis(272, (0, RECUO * 0.75, dz * 0.75), [(X, -2)]); chave_pelvis(296, (0, 0.02, -0.03)); chave_pelvis(N, (0, 0, 0))

    def corpo(incl=0.0, pitch=0.0, yaw=0.0):
        return {"spine_02": [(X, incl * 0.35)], "spine_03": [(X, incl * 0.35)], "spine_04": [(X, incl * 0.3)],
                "neck_01": [(X, pitch * 0.4), (Z, yaw * 0.4)], "head": [(X, pitch * 0.6), (Z, yaw * 0.6)]}
    for f, p in ((1, corpo()), (26, corpo(10, 14)), (48, corpo(30, 18)), (72, corpo(30, 10)), (110, corpo(27, 6, 0)),
                 (140, corpo(27, 0, 22)), (170, corpo(27, 4, -18)), (200, corpo(29, 12)), (226, corpo(32, 10, -25)),
                 (245, corpo(29, 8)), (258, corpo(32, 6)), (272, corpo(40, 12)), (296, corpo(8, 8)), (N, corpo())):
        chave_fk(f, p)
    return bake("urinar_feminino", 1, N), N


def exportar(nome, n):
    """<nome>.glb (esqueleto + clipe, sem malha) e <nome>.fbx (idem), 30 fps, no lugar (sem deslocamento do root)."""
    orig.animation_data.action = bpy.data.actions[nome]
    scn.frame_start, scn.frame_end = 1, n
    scn.render.fps, scn.render.fps_base = 30, 1.0
    scn.frame_set(1)
    vl = scn.view_layers[0]
    for o in scn.objects:
        o.select_set(False, view_layer=vl)
    orig.hide_set(False, view_layer=vl)
    orig.select_set(True, view_layer=vl)
    vl.objects.active = orig
    extras = {k: scn[k] for k in list(scn.keys()) if k.startswith("blendermcp")}
    for k in extras:
        del scn[k]
    nome_cena = scn.name
    try:
        with bpy.context.temp_override(scene=scn, view_layer=vl, active_object=orig, object=orig,
                                       selected_objects=[orig], selected_editable_objects=[orig]):
            props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
            op = dict(filepath=os.path.join(SAIDA, nome + ".glb"), export_format='GLB', use_selection=True,
                      export_animations=True, export_animation_mode='ACTIVE_ACTIONS', export_frame_range=True,
                      export_force_sampling=True, export_anim_slide_to_zero=True, export_optimize_animation_size=True,
                      export_optimize_animation_keep_anim_armature=True, export_def_bones=False, export_skins=True,
                      export_morph=False, export_materials='NONE', export_cameras=False, export_lights=False,
                      export_extras=False, export_yup=True, will_save_settings=False)
            bpy.ops.export_scene.gltf(**{k: v for k, v in op.items() if k in props})
            scn.name = nome                                   # o FBX nomeia o take com o nome da cena
            bpy.ops.export_scene.fbx(filepath=os.path.join(SAIDA, nome + ".fbx"), use_selection=True,
                                     object_types={'ARMATURE'}, add_leaf_bones=False, use_armature_deform_only=False,
                                     bake_anim=True, bake_anim_use_all_actions=False, bake_anim_use_nla_strips=False,
                                     bake_anim_force_startend_keying=True, bake_anim_step=1.0,
                                     bake_anim_simplify_factor=0.0)
    finally:
        scn.name = nome_cena
        for k, v in extras.items():
            scn[k] = v


if preparou:
    print("cena 'Animacoes' e Rig_IK preparados; rode o script de novo para gerar e exportar as animacoes")
else:
    resultado = {}
    for fn in (animacao_masculina, animacao_feminina):
        act, n = fn()
        resultado[act.name] = (n, round(n / 30.0, 1))
    limpar()
    arm.hide_set(True)                                        # rig de IK fica oculto e fora do export (so o "Armature" vai)
    for nome, (n, _) in resultado.items():
        exportar(nome, n)
    print("acoes:", resultado)
    print("polos calibrados (graus, erro):", CALIB)
