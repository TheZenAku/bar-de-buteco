# 61_moto_classica_tripo.py
# Moto classica preta da Tripo com ACABAMENTO, mantendo o DESENHO dela (a malha e a da Tripo; o 60 tinha trocado o
# design pelo da v4 e foi rejeitado).
#  - alinha (a Tripo veio girada 7,6 graus em Z e 3 em Y) e poe em escala real (x1,95): entre-eixos 1,372, rodas r 0,30
#  - rodas da Tripo (ovais, fora do eixo, a traseira fundida no quadro) saem; entram rodas raiadas centradas no eixo
#    (roda_raiada do 60), com cubo grande de tambor como as da referencia
#  - faces separadas por peca movel (direcao, suspensao, balanca, descanso, manetes) e luzes pela cor da textura
#  - textura nova 2048 (UV proprio): cor da Tripo transferida + material por classe (tinta, branco, banco, motor,
#    plastico com grip, preto) com AO, verniz, granulado, desgaste
#  - cor escolhivel: Moto_Pintura (tanque, preto na referencia) e Moto_Pintura2 (pecas brancas); emblema redondo do
#    tanque vira peca 3D (cor propria, aparece em qualquer pintura)
# Rodar: blender.exe -b moto_classica_tripo_original.blend -P 61_moto_classica_tripo.py -- --exportar
#        ... -- --previa   (rotulos por cor, sem bake)
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

SCRIPTS = "C:/Users/rafael/BarBoteco/scripts"
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
_SO7 = globals().get("SO_FUNCOES")
SO_FUNCOES = True
_ARGV = sys.argv
sys.argv = sys.argv[:1]          # os scripts importados zeram a cena com --exportar/--previa: aqui nao pode
# 58 primeiro (so _ilhas/_cor_faces): ele define RAKE em graus, ESC etc., que o 60 sobrescreve com os valores certos
exec(compile(open(SCRIPTS + "/58_moto_fogo.py", encoding="utf-8").read().split("# rotulos de face")[0], "58", "exec"),
     globals())
exec(compile(open(SCRIPTS + "/60_moto_classica.py", encoding="utf-8").read(), "60_moto_classica.py", "exec"), globals())
sys.argv = _ARGV
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SO_FUNCOES = _SO7

SAIDA = r"C:\Users\rafael\BarBoteco\export\moto_classica"
BLEND_COPIA = r"C:\Users\rafael\Desktop\BAR\2.0\veiculos\moto\moto_classica.blend"
COLS = ["Moto_Classica", "Moto_Colisao", "Moto_TMP"]
Q_ALINHA = Quaternion((0.997456, 0.0, -0.02702, 0.06597))
ESC = 1.95
M_ALINHA = (Matrix.Translation((0, 0.0131 * ESC - 0.014, 0)) @ Matrix.Scale(ESC, 4) @ Matrix.Translation((0.026, 0, 0)) @
            Q_ALINHA.to_matrix().to_4x4())
PIVO_BAL = V((0, 0.265, 0.345))
EMB = (-0.169, 0.884, 0.050)          # emblema redondo do tanque: y, z, raio (medido na vista lateral)
for _n in ("branco", "grip", "tripo"):
    if _n not in PECAS:
        PECAS.append(_n)
PID.clear()
PID.update({n: i for i, n in enumerate(PECAS)})
PINTURA2 = ("branco",)
COR_PADRAO2 = (0.86, 0.86, 0.84, 1.0)
DENSIDADE.update({"branco": 1.3, "grip": 1.2, "tripo": 0.8, "motor": 1.0})

# rotulos (face)
R_RODA, R_CORPO, R_DIR, R_SUSP, R_BAL, R_DESC, R_MAN_E, R_MAN_D = 1, 0, 2, 3, 4, 5, 6, 7
L_FAROL, L_SETA_E, L_SETA_D, L_LANT = 10, 11, 12, 13
OSSO_ROT = {R_CORPO: "chassi", R_DIR: "direcao", R_SUSP: "suspensao_diant", R_BAL: "balanca", R_DESC: "descanso",
            R_MAN_E: "manete_embreagem", R_MAN_D: "manete_freio", L_FAROL: "direcao", L_LANT: "chassi"}
SAIDA_ROT = {L_FAROL: "Luz_Farol", L_SETA_E: "Luz_Seta_E", L_SETA_D: "Luz_Seta_D", L_LANT: "Luz_Lanterna"}


def fonte():
    for o in bpy.data.objects:
        if o.name.startswith("tripo_node"):
            return o
    raise RuntimeError("abra moto_classica_tripo_original.blend")


def alinhada():
    o = fonte()
    r = o.copy()
    r.data = o.data.copy()
    r.name = "TRIPO_alinhada"
    bpy.context.scene.collection.objects.link(r)
    r.rotation_mode = 'XYZ'
    r.matrix_world = Matrix.Identity(4)
    me = r.data
    me.transform(M_ALINHA)
    # as normais customizadas da Tripo nao giram com transform(): saiam facetadas/erradas. Suave + vinco por angulo.
    if "custom_normal" in me.attributes:
        me.attributes.remove(me.attributes["custom_normal"])
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    for nome in ("sharp_edge", "sharp_face"):          # a Tripo e organica: vinco por angulo deixava tudo facetado
        if nome in me.attributes:
            me.attributes.remove(me.attributes[nome])
    # corte reto na borda de baixo do tanque: a cor escolhida (tanque) termina numa linha limpa, nao no serrilhado
    bm = bmesh.new()
    bm.from_mesh(me)
    # a Tripo vem com vertices soltos por face: sem soldar o sombreamento suave nao tem o que media (ficava facetado)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0006)
    reg = [f for f in bm.faces if -0.37 < f.calc_center_median().y < 0.14 and abs(f.calc_center_median().x) < 0.25
           and 0.62 < f.calc_center_median().z < 0.80]
    geo = list({v for f in reg for v in f.verts}) + list({e for f in reg for e in f.edges}) + reg
    bmesh.ops.bisect_plane(bm, geom=geo, plane_co=(0, 0, Z_TANQUE), plane_no=(0, 0, 1))
    bm.to_mesh(me)
    bm.free()
    o.hide_set(True)
    o.hide_render = True
    return r


Z_TANQUE = 0.712
FAROL = (0.0135, -0.5637, 0.8962, 0.0935)     # lente da Tripo alinhada: centro x, y (plano), z e raio do aro
SEM_ATLAS = ("Moto_Placa",)                     # luzes tambem no atlas (antes: cor lisa = "bola" sem acabamento)


def rotular(r):
    me = r.data
    ilha, co, lp, st, tot = _ilhas(me)
    c = np.array([p.center[:] for p in me.polygons])
    x, y, z = c[:, 0], c[:, 1], c[:, 2]
    ax = np.abs(x)
    lab = np.zeros(len(c), np.int8)
    dF = np.hypot(y - YF, z - ZC)
    dR = np.hypot(y - YT, z - ZC)
    roda = ((dF < 0.315) & (ax < 0.062)) | ((dF < 0.13) & (ax < 0.078)) | \
           ((dR < 0.315) & (ax < 0.062)) | ((dR < 0.13) & (ax < 0.085))
    lab[roda] = R_RODA
    esp = np.bincount(ilha)
    for k in range(len(esp)):          # ilha quase toda dentro da roda sai inteira (raios, aro, cubo da Tripo)
        f = ilha == k
        if roda[f].mean() > 0.6:      # mas o paralama que veio na mesma ilha do pneu fica
            lab[f & (np.minimum(dF, dR) < 0.318)] = R_RODA
    livre = lab == R_CORPO
    # suspensao: perna do garfo + paralama (em volta da roda dianteira, abaixo de z 0.62)
    grande = esp[ilha] > 1500
    lab[livre & (dF < 0.43) & (z < 0.62) & ((y < -0.38) | ~grande)] = R_SUSP      # sem o coletor (y > -0.38)
    # direcao: corredor da coluna para a frente (garfo, farol, setas, painel) + guidao/espelhos acima do tanque
    NFv = np.array([0.0, math.cos(RAKE), -math.sin(RAKE)])
    dperp = (c - np.array(AXLE_F)) @ NFv
    livre = lab == R_CORPO
    grande = esp[ilha] > 1500        # na ilha do quadro so a frente da coluna e as bengalas (nao corta o tanque)
    lab[livre & (z > 0.45) & (y < -0.25) & np.where(grande, (dperp < 0.0) | ((ax > 0.075) & (dperp < 0.03) & (z < 0.98)),
                                                     dperp < 0.035)] = R_DIR
    lab[livre & (z > 0.99) & (y < -0.05)] = R_DIR
    # balanca: faixa entre o pivo e o eixo traseiro (inclui corrente)
    t = np.clip((y - PIVO_BAL.y) / (YT - PIVO_BAL.y), 0, 1.2)
    zl = PIVO_BAL.z + (ZC - PIVO_BAL.z) * t
    livre = lab == R_CORPO
    lab[livre & (y > PIVO_BAL.y - 0.03) & (y < YT + 0.06) & (np.abs(z - zl) < 0.05) & (ax < 0.14)] = R_BAL
    # ilhas pequenas: descanso (no chao, lado +X) e manetes (alongadas em X no guidao)
    for k in range(len(esp)):
        f = ilha == k
        p = c[f]
        mn, mx = p.min(0), p.max(0)
        if esp[k] < 200 and mn[2] < 0.16 and mx[2] < 0.36 and mn[0] > 0.10 and mx[1] < 0.2 and mn[1] > -0.05:
            lab[f] = R_DESC
        elif esp[k] < 130 and mn[2] > 0.98 and mx[2] < 1.13 and (mx[0] - mn[0]) > 0.13 and abs(p[:, 0].mean()) > 0.3                 and mx[1] < -0.27:
            lab[f] = R_MAN_E if p[:, 0].mean() > 0 else R_MAN_D
    # luzes pela cor da textura
    cores, quente, img, uv = _cor_faces(me, st, tot)
    R_, G_, B_ = cores[:, 0], cores[:, 1], cores[:, 2]
    laranja = (R_ > 0.55) & (G_ > 0.18) & (G_ < 0.62) & (B_ < 0.25) & (R_ > 1.4 * G_)
    amarelo = (R_ > 0.6) & (G_ > 0.55) & (B_ < 0.35)
    vermelho = (R_ > 0.14) & (R_ > 1.5 * G_) & (R_ > 1.5 * B_)
    nor = np.array([p.normal[:] for p in me.polygons])
    dl = np.hypot(x - FAROL[0], z - FAROL[2])
    lab[(nor[:, 1] < -0.9) & (np.abs(y - FAROL[1]) < 0.012) & (dl < FAROL[3] + 0.004) & (lab == R_DIR)] = L_FAROL
    lab[laranja & (ax > 0.08) & (x > 0)] = L_SETA_E
    lab[laranja & (ax > 0.08) & (x < 0)] = L_SETA_D
    lab[vermelho & (y > 0.84) & (z > 0.70) & (z < 0.78)] = L_LANT
    print("faces por rotulo:", {int(k): int((lab == k).sum()) for k in np.unique(lab)})
    return lab, cores, c


def classe_peca(lab, cores, c):
    """material de cada face (para a pintura procedural): pelo brilho da cor da Tripo + regiao"""
    x, y, z = c[:, 0], c[:, 1], c[:, 2]
    ax = np.abs(x)
    lum = cores.mean(1)
    claro = lum > 0.52
    escuro = lum < 0.22
    # branco/preto/metal POR PECA (face + voto da vizinhanca): a Tripo pintou sombra nas pecas brancas (garfo,
    # paralama, painel lateral); por pixel a sombra virava cinza/preto. Na pintura a cor da Tripo so da o detalhe.
    pc = np.full(len(c), PID["aco"], np.int32)
    pc[lum >= 0.40] = PID["branco"]
    pc[lum < 0.22] = PID["preto"]
    motor = (y > -0.25) & (y < 0.30) & (z > 0.12) & (z < 0.58) & (ax < 0.16) & ~escuro
    pc[motor] = PID["motor"]
    tanque = (y > -0.36) & (y < 0.13) & (z > Z_TANQUE) & (ax < 0.22) & ~claro & (lab == R_CORPO)
    pc[tanque] = PID["tinta"]
    grip = (y > -0.36) & (y < 0.02) & (z > 0.50) & (z <= Z_TANQUE) & (ax < 0.22) & ~claro & (lab == R_CORPO)
    pc[grip] = PID["grip"]
    banco = (y > 0.10) & (y < 0.82) & (z > 0.76) & (ax < 0.17) & ~claro & (lab == R_CORPO)
    pc[banco] = PID["banco"]
    # paralama dianteiro e todo branco (a Tripo pintou sombra preta no topo dele)
    dF = np.hypot(y - YF, z - ZC)
    pc[(lab == R_SUSP) & (dF > 0.29) & (dF < 0.42) & (ax < 0.09)] = PID["branco"]
    # voto da vizinhança (2 passes): tira faces isoladas de outra classe dentro de uma peca
    viz = [set() for _ in range(len(c))]
    for f in me_faces_adj(MESH_ROT):
        a_, b_ = f
        viz[a_].add(b_)
        viz[b_].add(a_)
    for _ in range(2):
        novo = pc.copy()
        for i, vs in enumerate(viz):
            if lab[i] >= 10 or len(vs) < 2:
                continue
            vals, cnt = np.unique(pc[list(vs)], return_counts=True)
            j = np.argmax(cnt)
            if vals[j] != pc[i] and cnt[j] >= 0.6 * len(vs) and vals[j] != PID["lente"]:
                novo[i] = vals[j]
        pc = novo
    pc[lab >= 10] = PID["lente"]
    return pc


def me_faces_adj(me):
    """pares de faces que dividem uma aresta"""
    dono = {}
    pares = []
    for p in me.polygons:
        for ek in p.edge_keys:
            if ek in dono:
                pares.append((dono[ek], p.index))
            else:
                dono[ek] = p.index
    return pares


def separar(r, lab, pc):
    """uma malha por (osso, saida) com o atributo peca; rodas da Tripo descartadas"""
    me = r.data
    lay = me.attributes.new("peca", 'INT', 'FACE')
    lay.data.foreach_set("value", pc)
    grupos = {}
    for k in np.unique(lab):
        if k == R_RODA:
            continue
        osso = OSSO_ROT.get(int(k), "direcao" if k in (L_SETA_E, L_SETA_D) else "chassi")
        saida = SAIDA_ROT.get(int(k), "Moto")
        grupos.setdefault((osso, saida), []).append(int(k))
    c = np.array([p.center[:] for p in me.polygons])
    for (osso, saida), ks in grupos.items():
        sel = np.isin(lab, ks)
        if saida.startswith("Luz_Seta"):      # setas de tras ficam no chassi
            for nome, m_ in (("frente", c[:, 1] < 0), ("tras", c[:, 1] >= 0)):
                s2 = sel & m_
                if s2.any():
                    _parte_faces(r, s2, "Tripo_%s_%s" % (saida, nome), "direcao" if nome == "frente" else "chassi", saida)
            continue
        _parte_faces(r, sel, "Tripo_%s_%s" % (osso, saida), osso, saida)


def _parte_faces(r, sel, nome, osso, saida):
    bm = bmesh.new()
    bm.from_mesh(r.data)
    bm.faces.ensure_lookup_table()
    tira = [f for f in bm.faces if not sel[f.index]]
    bmesh.ops.delete(bm, geom=tira, context='FACES')
    me = bpy.data.meshes.new("Moto_" + nome)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("Moto_" + nome, me)
    COL.objects.link(ob)
    OBJS[nome] = ob
    OSSO_DE[nome] = osso
    SAIDA_DE[nome] = saida


def preparar_uv_tripo():
    """UV da Tripo vira 'UV_tripo' (fonte da cor); o atlas novo vai num UVMap novo (ativo)"""
    for k, ob in OBJS.items():
        me = ob.data
        if not k.startswith("Tripo_"):
            continue
        me.uv_layers[0].name = "UV_tripo"
        novo = me.uv_layers.new(name="UVMap")
        me.uv_layers.active = novo
        smart_uv(ob)


def assar_ref(img_tripo, px):
    """cor da textura da Tripo transferida para o atlas novo (bake EMIT pelo UV_tripo)"""
    alvo = [ob for k, ob in OBJS.items() if k.startswith("Tripo_")]
    sc = bpy.context.scene
    try:
        sc.render.engine = 'CYCLES'
    except TypeError as e:
        print(e)
    sc.cycles.samples = 1
    sc.render.bake.margin = 4
    img = bpy.data.images.new("TMP_ref", px, px, alpha=True, float_buffer=True)
    mat = bpy.data.materials.new("TMP_ref")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emi = nt.nodes.new("ShaderNodeEmission")
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = "UV_tripo"
    tx = nt.nodes.new("ShaderNodeTexImage")
    tx.image = img_tripo
    alvo_tx = nt.nodes.new("ShaderNodeTexImage")
    alvo_tx.image = img
    nt.nodes.active = alvo_tx
    nt.links.new(uvn.outputs[0], tx.inputs[0])
    nt.links.new(tx.outputs[0], emi.inputs[0])
    nt.links.new(emi.outputs[0], out.inputs[0])
    for ob in alvo:
        ob.data.materials.clear()
        ob.data.materials.append(mat)
    selecionar_so(alvo)
    bpy.ops.object.bake(type='EMIT')
    a = np.empty(px * px * 4, np.float32)
    img.pixels.foreach_get(a)
    a = a.reshape(px, px, 4)[..., :3].copy()
    for ob in alvo:
        ob.data.materials.clear()
        ob.data.uv_layers.remove(ob.data.uv_layers["UV_tripo"])
    bpy.data.materials.remove(mat)
    bpy.data.images.remove(img)
    return a       # linear


def emblema_3d(r):
    """emblema redondo do tanque (era so textura na Tripo): disco fino colado no tanque por raycast, nos dois lados"""
    bvh = BVHTree.FromObject(r, bpy.context.evaluated_depsgraph_get())
    p = P()
    ey, ez, er = EMB
    for lado in (1, -1):
        aneis = []
        for f in (1.0, 0.94, 0.6, 0.3):
            anel = []
            for k in range(32):
                a = 2 * math.pi * k / 32
                yy, zz = ey + er * f * math.cos(a), ez + er * f * math.sin(a)
                h = bvh.ray_cast(V((lado * 0.5, yy, zz)), V((-lado, 0, 0)), 1.0)[0]
                anel.append((h.x if h else lado * 0.15, yy, zz))
            aneis.append(anel)
        xc = bvh.ray_cast(V((lado * 0.5, ey, ez)), V((-lado, 0, 0)), 1.0)[0].x
        fora = [[p.bm.verts.new((q[0] + lado * (0.0045 if i else 0.0030), q[1], q[2])) for q in an] for i, an in enumerate(aneis)]
        dentro = [p.bm.verts.new((aneis[0][k][0] + lado * 0.0008, aneis[0][k][1], aneis[0][k][2])) for k in range(32)]
        cf = p.bm.verts.new((xc + lado * 0.0048, ey, ez))
        cd = p.bm.verts.new((xc + lado * 0.0008, ey, ez))
        for a_, b_ in zip(fora, fora[1:]):
            p.ligar(a_, b_, "emblema")
        p.ligar(dentro, fora[0], "emblema")
        for k in range(32):
            k2 = (k + 1) % 32
            p.face([fora[-1][k], fora[-1][k2], cf], "emblema")
            p.face([dentro[k2], dentro[k], cd], "emblema")
    parte("Emblema_Tanque", "chassi", p)
    INFO["emblema_redondo"] = EMB
    INFO["farol"] = FAROL


def lente_farol():
    """o disco da lente da Tripo era um poligono de 20 faces: vira um vidro redondo NO MESMO LUGAR e do mesmo tamanho
    (encaixado no aro da propria moto, quase plano: 4 mm de abaulado) + aro cromado fino por cima da emenda"""
    chave = "Tripo_direcao_Luz_Farol"
    ob = OBJS.pop(chave, None)
    if ob:
        bpy.data.objects.remove(ob)
        del OSSO_DE[chave], SAIDA_DE[chave]
    cx, cy, cz, R = FAROL
    c = V((cx, cy, cz))
    fr = V((0, -1, 0))
    lf = P()
    lf.lathe_uv([(R, -.003), (R, .001), (R * 0.80, .0035), (R * 0.45, .0050), (.001, .0055)], c, fr, 48, "lente",
                ref=(0, 0, 1))
    parte("Farol_Lente", "direcao", lf, "Luz_Farol")
    ar = P()
    ar.lathe_uv([(R - .004, .0015), (R + .002, .0035), (R + .010, .0010), (R + .011, -.006), (R - .004, -.006)], c, fr,
                48, "cromo", ref=(0, 0, 1), fechar=True)
    parte("Farol_Aro", "direcao", ar)


def rodas_e_freios():
    roda_raiada("Roda_Dianteira", YF, 0.082, "roda_dianteira", 1, 0.084)
    roda_raiada("Roda_Traseira", YT, 0.100, "roda_traseira", -1, 0.084, coroa=True)
    espelho_freio("Tambor_Dianteiro", AXLE_F, 1, 0.084, "suspensao_diant", V((0.064, YF + 0.100, ZC + 0.020)),
                  math.radians(40))
    espelho_freio("Tambor_Traseiro", AXLE_T, -1, 0.084, "balanca", V((-0.064, YT - 0.100, ZC - 0.030)),
                  math.radians(150))


def ossos_tripo():
    cima = V((0, 0, 1))
    ossos = []

    def osso(nome, cab, cau, pai, deforma=True):
        ossos.append((nome, V(cab), V(cau), pai, deforma))
    osso("raiz", (0, 0, 0), (0, 0, 0.25), None)
    osso("chassi", (0, 0, 0.55), (0, 0, 0.80), "raiz")
    osso("direcao", AXLE_F + AX * 0.66, AXLE_F + AX * 0.90, "chassi")
    osso("suspensao_diant", AXLE_F, AXLE_F + AX * 0.20, "direcao")
    osso("roda_dianteira", AXLE_F, AXLE_F + cima * 0.12, "suspensao_diant")
    osso("balanca", PIVO_BAL, PIVO_BAL + cima * 0.12, "chassi")
    osso("roda_traseira", AXLE_T, AXLE_T + cima * 0.12, "balanca")
    for nome, piv in PIVOS.items():
        pai = "direcao" if nome.startswith("manete") else "chassi"
        osso(nome, piv, V(piv) + cima * 0.05, pai)
    for nome, (pai, pos) in PONTOS_T.items():
        osso(nome, pos, V(pos) + cima * 0.06, pai, False)
    return ossos


PIVOS = {}
PONTOS_T = {}


def medir_pivos_e_pontos():
    """pivos das pecas moveis e pontos de encaixe medidos nas proprias faces"""
    def bb(chave):
        ob = OBJS.get(chave)
        if not ob:
            return None
        p = np.array([v.co[:] for v in ob.data.vertices])
        return p.min(0), p.max(0), p
    d = bb("Tripo_descanso_Moto")
    if d:
        mn, mx, p = d
        topo = p[p[:, 2] > mx[2] - 0.03].mean(0)
        PIVOS["descanso"] = tuple(topo)
    for nome, chave, s in (("manete_embreagem", "Tripo_manete_embreagem_Moto", 1), ("manete_freio", "Tripo_manete_freio_Moto", -1)):
        d = bb(chave)
        if d:
            mn, mx, p = d
            dentro = p[np.argmin(np.abs(p[:, 0]))]          # ponta junto do guidao = pino
            PIVOS[nome] = tuple(dentro)
    luz = {}
    for k, ob in OBJS.items():
        if SAIDA_DE[k].startswith("Luz_"):
            p = np.array([v.co[:] for v in ob.data.vertices])
            luz[k] = (p.min(0) + p.max(0)) / 2, p
    def ponto_luz(prefixo, frente_y):
        for k, (cc, p) in luz.items():
            if k.startswith(prefixo):
                q = p[np.argmin(p[:, 1])] if frente_y else p[np.argmax(p[:, 1])]
                return tuple(V((cc[0], q[1] - 0.01 if frente_y else q[1] + 0.01, cc[2])))
        return None
    far = ponto_luz("Tripo_Luz_Farol", True) or (0, -0.57, 0.884)
    lan = ponto_luz("Tripo_Luz_Lanterna", False) or (0, 0.88, 0.73)
    seta = {}
    for k, (cc, p) in luz.items():
        if "Seta" in k:
            seta[("E" if cc[0] > 0 else "D", "frente" if cc[1] < 0 else "tras")] = tuple(cc)
    mao = {}
    gr = np.array([v.co[:] for k, ob in OBJS.items() if OSSO_DE[k] == "direcao" for v in ob.data.vertices])
    for s, l in ((1, "E"), (-1, "D")):
        q = gr[(gr[:, 2] > 1.0) & (gr[:, 2] < 1.12) & (s * gr[:, 0] > 0.25) & (s * gr[:, 0] < 0.42) & (gr[:, 1] > -0.35)]
        mao[l] = tuple(q.mean(0)) if len(q) else (s * 0.33, -0.25, 1.05)
    pts = {
        "ponto_piloto": ("chassi", (0, 0.30, 0.845)), "ponto_garupa": ("chassi", (0, 0.58, 0.910)),
        "ponto_mao_E": ("direcao", mao["E"]), "ponto_mao_D": ("direcao", mao["D"]),
        "ponto_pe_E": ("chassi", (0.22, 0.17, 0.32)), "ponto_pe_D": ("chassi", (-0.22, 0.17, 0.32)),
        "ponto_pe_garupa_E": ("chassi", (0.20, 0.50, 0.40)), "ponto_pe_garupa_D": ("chassi", (-0.20, 0.50, 0.40)),
        "ponto_farol": ("direcao", far), "ponto_farol_alto": ("direcao", tuple(V(far) + V((0, 0, 0.02)))),
        "ponto_lanterna": ("chassi", lan), "ponto_freio": ("chassi", lan),
        "ponto_placa": ("chassi", (0, 0.985, 0.58)), "ponto_luz_placa": ("chassi", (0, 0.95, 0.66)),
        "ponto_escapamento": ("chassi", (0.17, 0.86, 0.47)), "ponto_tanque": ("chassi", (0, -0.118, 0.99)),
        "ponto_motor": ("chassi", (0, -0.03, 0.40)), "ponto_bau": ("chassi", (0, 0.70, 0.93)),
        "ponto_buzina": ("chassi", (0, -0.40, 0.62)),
        "ponto_contato_diant": ("raiz", (0, YF, 0.0)), "ponto_contato_tras": ("raiz", (0, YT, 0.0)),
        "ponto_camera": ("chassi", (0, 0.35, 1.60)),
    }
    for (l, onde), cc in seta.items():
        pts["ponto_seta_%s_%s" % (onde, l)] = ("direcao" if onde == "frente" else "chassi", cc)
    if "descanso" in PIVOS:
        pv = PIVOS["descanso"]
        pts["ponto_descanso_chao"] = ("raiz", (pv[0] + 0.10, pv[1] + 0.05, 0.0))
    PONTOS_T.update(pts)
    print("pivos", {k: tuple(round(a, 3) for a in v) for k, v in PIVOS.items()})


ossos_da_moto = ossos_tripo


def materiais(saidas, atlas, mr_img, img_placa):
    m1 = material_pintura(atlas, mr_img, COR_PADRAO)
    m3 = material_pbr("Moto_Atlas", atlas, mr_img, None)
    for nome, ob in saidas.items():
        me = ob.data
        me.materials.clear()
        if nome == "Moto":
            for m_ in (m1, m3):
                me.materials.append(m_)
            lay = me.attributes["peca"].data
            i1 = {PID[n] for n in PINTURA}
            me.polygons.foreach_set("material_index", [0 if lay[p.index].value in i1 else 1 for p in me.polygons])
        else:          # luzes: mesma textura da moto; o jogo acende pelo emissive (moto.luz)
            me.materials.append(m3)


def ligar_cores(rig):
    for prop, no, mat, cor_, desc in (("cor_pintura", "COR_PINTURA", "Moto_Pintura", COR_PADRAO, "cor do tanque"),):
        rig[prop] = list(cor_)
        rig.id_properties_ui(prop).update(subtype='COLOR', min=0.0, max=1.0, soft_min=0.0, soft_max=1.0, description=desc)
        m = bpy.data.materials[mat]
        for i in range(3):
            dr = m.node_tree.driver_add('nodes["%s"].outputs[0].default_value' % no, i).driver
            dr.type = 'AVERAGE'
            v = dr.variables.new()
            v.targets[0].id_type = 'OBJECT'
            v.targets[0].id = rig
            v.targets[0].data_path = '["%s"][%d]' % (prop, i)


def montar():
    r = alinhada()
    lab, cores, c = rotular(r)
    global MESH_ROT
    MESH_ROT = r.data
    pc = classe_peca(lab, cores, c)
    img_tripo = r.data.materials[0].node_tree.nodes and next(n.image for n in r.data.materials[0].node_tree.nodes
                                                             if n.type == "TEX_IMAGE")
    separar(r, lab, pc)
    rodas_e_freios()
    emblema_3d(r)
    lente_farol()
    bpy.data.objects.remove(r)
    medir_pivos_e_pontos()
    return lab, img_tripo


CORES_PREVIA.update({"branco": (0.85, 0.85, 0.83), "grip": (0.05, 0.05, 0.05), "tinta": (0.02, 0.02, 0.022)})


if not globals().get("SO_FUNCOES"):
    import importlib
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    limpar()
    COL = colecao("Moto_Classica")
    lab, IMG_TRIPO = montar()
    for k, ob in OBJS.items():
        if not k.startswith("Tripo_"):
            continue
        ob.data.polygons.foreach_set("use_smooth", [True] * len(ob.data.polygons))
    suavizar([ob for k, ob in OBJS.items() if not k.startswith("Tripo_")])
    tri = sum(len(p.vertices) - 2 for ob in OBJS.values() for p in ob.data.polygons)
    print("triangulos:", tri)
    for k, ob in OBJS.items():
        print("  %-36s %-18s %-14s %6d faces" % (k, OSSO_DE[k], SAIDA_DE[k], len(ob.data.polygons)))
    if "--previa" in ARGS:
        previa(OBJS)
        bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\rafael\Desktop\BAR\2.0\veiculos\moto\moto_classica_previa.blend",
                                    copy=True)
    else:
        import moto_textura_tripo as mtt
        importlib.reload(mtt)
        os.makedirs(SAIDA, exist_ok=True)
        preparar_uv_tripo()
        uv_atlas_classica(OBJS)
        REF_COR = assar_ref(IMG_TRIPO, ATLAS_PX)
        R = bake_dados(OBJS, ATLAS_PX, 64)
        R["ref"] = REF_COR
        albedo, mrmap = mtt.pintar(R, PECAS, INFO)
        ATLAS_PNG = os.path.join(SAIDA, "moto_classica_atlas.png")
        MR_PNG = os.path.join(SAIDA, "moto_classica_metal_rugosidade.png")
        salvar_png(albedo, ATLAS_PNG, "moto_atlas_tmp")
        salvar_png(mrmap, MR_PNG, "moto_mr_tmp")
        ATLAS = carregar_img(ATLAS_PNG, "moto_classica_atlas")
        MRIMG = carregar_img(MR_PNG, "moto_classica_mr")
        MRIMG.colorspace_settings.name = 'Non-Color'
        COLI = colisao_v3(colecao("Moto_Colisao"))
        COLI.hide_set(True)
        RIG, SAIDAS_OBS = montar_rig_e_saidas(COL, ATLAS, MRIMG, None)
        RIG.name = "Moto_Rig"
        ligar_cores(RIG)
        fonte().hide_set(True)
        tri = sum(len(p.vertices) - 2 for ob in SAIDAS_OBS.values() for p in ob.data.polygons)
        print("triangulos finais:", tri)
        if "--exportar" in ARGS:
            exportar([RIG] + list(SAIDAS_OBS.values()), os.path.join(SAIDA, "moto_classica.glb"))
            exportar([COLI], os.path.join(SAIDA, "moto_classica_colisao.glb"))
            bpy.ops.wm.save_as_mainfile(filepath=BLEND_COPIA, copy=True)
            print("copia", BLEND_COPIA)
