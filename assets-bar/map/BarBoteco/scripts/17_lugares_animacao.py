# Pecas e pontos do mapa usados pelas animacoes do bar (18_animacoes_bar.py). Roda no Blender do mapa (exec pelo MCP).
#   Freezer_Bar_Tampa      tampa do freezer de long-necks atras do balcao, no proprio (Interativos_Bar, origem na dobradica):
#                          some enquanto a animacao do magrao abre a copia dela. O corpo vira oco, com long-necks dentro.
#   Copo_Bandeja           copo de chopp de boca para baixo na bandeja ao lado da chopeira (some enquanto o magrao usa a copia)
#   Balcao_Lugar_Magrao    onde o magrao fica atendendo, de frente para o cliente (+Z local no three.js)
#   Balcao_Entrega         ponto do tampo onde a bebida e entregue
#   Mictorio_Lugar_N       em pe na frente de cada mictorio (+Z local = para o mictorio)
# As cadeiras e mesas nao precisam de nada: o modulo JS acha cada cadeira nas instancias A_cadeira-vermelha do glTF.
# Corrige tambem o rafael-mixamo do asset: o FBX diz "centimetros" mas os valores estao em metros (chega com 1,9 cm).
# Grava anim/bar_ref.blend para o 18_animacoes_bar.py. Rodar depois do 06_interior.py e do 15_palco.py (limpam Interativos_Bar).
import bpy, math, os, sys
from mathutils import Vector, Matrix

DIR = r"C:\Users\rafael\BarBoteco\scripts"
if DIR not in sys.path:
    sys.path.insert(0, DIR)
import barlib as B

T0, S1, INTB, MARC = "Interior_Terreo", "Interior_Superior", "Interativos_Bar", "Marcadores"
ZP = B.Z_PISO
REF = os.path.join(B.ROOT, "anim", "bar_ref.blend")
FREEZER_XY = (20.2, 5.53)                       # freezer horizontal atras do retorno do balcao (06_interior.py)
LUGAR_MAGRAO = (18.40, 7.75)                    # atras do balcao, na frente da banqueta do Ponto_Balcao
ENTREGA = (17.74, 7.75)
BANDEJA = (17.88, 8.66)                         # ao lado da chopeira (17.70, 9.20), rente a borda do balconista
CHOPP_PERFIL = [(0.0, 0.0), (0.0335, 0.0), (0.0345, 0.006), (0.036, 0.03), (0.0405, 0.08), (0.0455, 0.13), (0.048, 0.162)]
PAREDE = 0.0025                                  # copo: mesma forma do A_copo, vidro de 2,5 mm e fundo de 9 mm
FUNDO = 0.009
MEUS = ("Freezer_Bar_Tampa", "Copo_Bandeja", "Balcao_Lugar_Magrao", "Balcao_Entrega", "Bandeja_Copos", "Freezer_Bar_LongNeck",
        "Bandeja_Copo")


def limpar():
    for o in list(bpy.data.objects):
        if o.name.startswith(MEUS) or o.name.startswith("Mictorio_Lugar_"):
            bpy.data.objects.remove(o, do_unlink=True)


def materiais():
    B.material("Copo_Vidro", color=(0.92, 0.96, 0.95), rough=0.04, alpha=0.24, double=True)
    B.material("Gelo_Freezer", color=(0.80, 0.88, 0.93), rough=0.35)
    B.material("Freezer_Interno", color=(0.86, 0.89, 0.91), rough=0.5)


# ------------------------------------------------------------------ rafael-mixamo do asset (escala)
def personagem():
    arm = bpy.data.objects.get("rafael-mixamo")
    if arm is None or arm.type != 'ARMATURE':
        return
    corpos = [c for c in arm.children if c.type == 'MESH']
    dg = bpy.context.evaluated_depsgraph_get()

    def alturas():
        dg.update()
        return [(c.evaluated_get(dg).matrix_world @ Vector(v)).z for c in corpos for v in c.evaluated_get(dg).bound_box]
    arm.scale = (1.0, 1.0, 1.0)                  # 1 unidade do FBX = 1 m (o importador poe 0,01 por causa do "cm" declarado)
    arm.location = (-1.6, 0.0, 0.0)              # ao lado da fileira OTM_* (a referencia "rafael" fica na origem)
    arm.location.z = -min(alturas())             # pes no chao
    zs = alturas()
    for o in [arm] + corpos:
        o["pipeline_proprio"] = "18_animacoes_bar.py"         # o 09_assets.py nao processa
    arm["altura_m"] = round(max(zs) - min(zs), 3)
    arm["descricao"] = ("Esqueleto de autoria das animacoes (Mixamo, 41 ossos). O FBX declara centimetros mas os valores "
                        "estao em metros: importe com escala 100 (ou ponha escala 1 no armature) para ficar com %.2f m" % arm["altura_m"])
    print("rafael-mixamo: %.3f m" % arm["altura_m"])


# ------------------------------------------------------------------ copo de chopp (vidro transparente)
def malha_copo():
    nome = "P_Copo_Chopp"
    if nome in bpy.data.meshes:
        return bpy.data.meshes[nome]
    m = B.Mesh(nome)
    fora = CHOPP_PERFIL[1:]
    dentro = [(r - PAREDE, z) for r, z in fora[2:]][::-1] + [(fora[1][0] - PAREDE, FUNDO)]
    perfil = [(0.0, 0.0)] + fora + [(fora[-1][0] - PAREDE * 0.5, fora[-1][1])] + dentro + [(0.0, FUNDO)]
    seg = 20
    anel = []
    for r, z in perfil:
        anel.append([m.bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)])
    mi = m._mi("Copo_Vidro")
    for a, b_ in zip(anel[:-1], anel[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            f = m.bm.faces.new((a[i], a[j], b_[j], b_[i])) if len({a[i], a[j], b_[j], b_[i]}) == 4 else None
            if f:
                f.material_index = mi
                f.smooth = True
    import bmesh
    bmesh.ops.remove_doubles(m.bm, verts=m.bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(m.bm, faces=m.bm.faces)
    return m.mesh()


# ------------------------------------------------------------------ freezer do bar: corpo oco + tampa separada
def freezer():
    fz = next(o for o in bpy.data.objects if o.data is not None and o.data.name in ("P_Freezer", "P_Freezer_Bar")
              and (o.location.xy - Vector(FREEZER_XY)).length < 0.05)
    me = bpy.data.meshes.get("P_Freezer_Bar")
    if me is None:
        m = B.Mesh("P_Freezer_Bar")
        e = 0.045                                                  # parede
        m.box((-0.60, -0.30, 0), (0.60, 0.30, 0.06), "Metal_Escuro", skip=('nz', 'pz'))
        m.box((-0.65, -0.32, 0.06), (0.65, -0.32 + e, 0.775), "Plastico_Branco", skip=('nz',))
        m.box((-0.65, 0.32 - e, 0.06), (0.65, 0.32, 0.775), "Plastico_Branco", skip=('nz',))
        for x0 in (-0.65, 0.65 - e):
            m.box((x0, -0.32 + e, 0.06), (x0 + e, 0.32 - e, 0.775), "Plastico_Branco", skip=('nz', 'ny', 'py'))
        m.box((-0.65 + e, -0.32 + e, 0.06), (0.65 - e, 0.32 - e, 0.40), "Gelo_Freezer", skip=('nz', 'nx', 'px', 'ny', 'py'))
        for (a, b_) in (((-0.65, -0.32), (0.65, -0.32 + e)), ((-0.65, 0.32 - e), (0.65, 0.32)),
                        ((-0.65, -0.32 + e), (-0.65 + e, 0.32 - e)), ((0.65 - e, -0.32 + e), (0.65, 0.32 - e))):
            m.box((a[0], a[1], 0.775), (b_[0], b_[1], 0.782), "Borracha_Preta", skip=('nz',))
        for y0, y1 in ((-0.32 + e, -0.32 + e + 0.002), (0.32 - e - 0.002, 0.32 - e)):          # forro interno
            m.box((-0.65 + e, y0, 0.40), (0.65 - e, y1, 0.775), "Freezer_Interno", skip=('nz', 'pz', 'nx', 'px'))
        m.box((-0.40, -0.325, 0.30), (0.40, -0.32, 0.62), "Plastico_Vermelho", skip=('py',))
        me = m.mesh()
    fz.data = me
    # long-necks em pe no gelo (fileiras); fica um buraco na frente, a direita de quem abre: a que o magrao pega
    for o in list(bpy.data.objects):
        if o.name.startswith("Freezer_Bar_LongNeck"):
            bpy.data.objects.remove(o, do_unlink=True)
    M = fz.matrix_world.copy()
    k = 0
    for i in range(12):
        for j in range(5):
            x, y = -0.54 + i * 0.098, -0.20 + j * 0.10
            if abs(x - 0.15) < 0.05 and j == 0:                    # buraco (ver PEGA_LONGNECK no 18)
                continue
            o = bpy.data.objects.new("Freezer_Bar_LongNeck", bpy.data.meshes["A_long-neck"])
            o.matrix_world = M @ Matrix.Translation((x, y, 0.40)) @ Matrix.Rotation(math.radians((i * 47 + j * 83) % 360), 4, 'Z')
            B.coll(T0).objects.link(o)
            k += 1
    # tampa: origem na dobradica (fundo do freezer, em cima); abre girando em -X local
    mt = bpy.data.meshes.get("P_Freezer_Bar_Tampa")
    if mt is None:
        m = B.Mesh("P_Freezer_Bar_Tampa")
        m.box((-0.65, -0.64, 0.0), (0.65, 0.0, 0.07), "Plastico_Branco", mats={'nz': "Freezer_Interno"})
        m.box((-0.62, -0.61, -0.006), (0.62, -0.03, 0.0), "Borracha_Preta", skip=('pz',))
        m.box((-0.25, -0.675, 0.004), (0.25, -0.64, 0.046), "Metal_Escuro", skip=('py',))
        mt = m.mesh()
    t = bpy.data.objects.new("Freezer_Bar_Tampa", mt)
    t.matrix_world = M @ Matrix.Translation((0.0, 0.32, 0.78))
    B.coll(INTB).objects.link(t)
    t["interativo"] = "freezer_tampa"
    t["descricao"] = ("Tampa do freezer de long-necks (origem na dobradica, abre girando em X local). Some enquanto o magrao "
                      "usa a copia animada (Prop_Tampa_Freezer do bar_magrao.glb)")
    print("freezer: corpo oco + %d long-necks + tampa" % k)
    return fz, t


# ------------------------------------------------------------------ bandeja de copos ao lado da chopeira
def bandeja():
    me = malha_copo()
    m = B.Mesh("Bandeja_Copos")
    x, y = BANDEJA
    z = 1.10                                                        # tampo de granito do balcao
    m.box((x - 0.12, y - 0.17, z), (x + 0.12, y + 0.17, z + 0.008), "Borracha_Preta", skip=('nz',))
    ob = m.build(T0)
    copos = []
    for i in range(2):
        for j in range(3):
            p = (x - 0.055 + i * 0.11, y - 0.11 + j * 0.11, z + 0.008 + 0.162)
            nome = "Copo_Bandeja" if (i == 1 and j == 2) else "Bandeja_Copo"     # o do canto do balconista, perto da chopeira
            o = bpy.data.objects.new(nome, me)
            o.matrix_world = Matrix.Translation(p) @ Matrix.Rotation(math.pi, 4, 'X')
            B.coll(INTB if nome == "Copo_Bandeja" else T0).objects.link(o)
            copos.append(o)
    cb = bpy.data.objects["Copo_Bandeja"]
    cb["interativo"] = "copo_chopp"
    cb["descricao"] = "Copo de chopp limpo na bandeja: some enquanto o magrao usa a copia animada (Prop_Copo do bar_magrao.glb)"
    return [ob] + copos


# ------------------------------------------------------------------ marcadores
def vazio(nome, col, pos, yaw, tam=0.25, **extras):
    e = bpy.data.objects.new(nome, None)
    e.empty_display_type = 'SINGLE_ARROW'
    e.empty_display_size = tam
    e.location = pos
    e.rotation_euler = (0.0, 0.0, math.radians(yaw))
    B.coll(col).objects.link(e)
    for k, v in extras.items():
        e[k] = v
    return e


def marcadores():
    # personagem olha para -Y do vazio no Blender (= +Z no three.js); magrao olha para o cliente (-X do mundo)
    out = [vazio("Balcao_Lugar_Magrao", INTB, (LUGAR_MAGRAO[0], LUGAR_MAGRAO[1], ZP), -90.0, interativo="balcao_lugar",
                 animacoes="bar_magrao.glb", clipes="magrao_chopp,magrao_chopp_escuro,magrao_longneck",
                 substitui="Copo_Bandeja,Freezer_Bar_Tampa",
                 descricao="Magrao em pe aqui, de frente para o cliente (+Z local), no comeco e no fim das animacoes de atender"),
           vazio("Balcao_Entrega", INTB, (ENTREGA[0], ENTREGA[1], 1.10), -90.0, tam=0.1, interativo="balcao_entrega",
                 descricao="Onde o magrao deixa a bebida no tampo do balcao")]
    k = 0
    for o in sorted((o for o in bpy.data.objects if o.data is not None and o.data.name == "P_Mictorio"),
                    key=lambda o: (round(o.location.z, 1), o.location.y)):
        k += 1
        M = o.matrix_world @ Matrix.Translation((0.0, -0.64, 0.0)) @ Matrix.Rotation(math.pi, 4, 'Z')
        e = vazio("Mictorio_Lugar_%d" % k, INTB, M.translation, math.degrees(M.to_euler().z), interativo="mictorio_lugar",
                  animacoes="bar_banheiro.glb", clipes="urinar", andar=0 if o.location.z < 2 else 1,
                  descricao="Personagem em pe aqui olhando para o mictorio (+Z local) no comeco e no fim da animacao")
        out.append(e)
    return out


# ------------------------------------------------------------------ referencia para o gerador (Blender em 2o plano)
def referencia(extra):
    os.makedirs(os.path.dirname(REF), exist_ok=True)
    nomes = {"Interior_Balcao", "Chopeira", "Chopeira_FX_Torneira_1", "Chopeira_FX_Torneira_2", "Estufa", "Caixa_Registradora",
             "Freezer", "Freezer.001", "Mesa.005", "Cadeira.020", "Cadeira.021", "Cadeira.022", "Cadeira.023", "Mesa_06",
             "Banqueta.003", "Banqueta.004", "Banqueta.005", "Ponto_Balcao", "Lixeira.001"}
    dados = {bpy.data.objects[n] for n in nomes if n in bpy.data.objects} | set(extra)
    dados |= {o for o in bpy.data.objects if o.name.startswith(("Freezer_Bar_LongNeck", "Mictorio_Lugar_"))}
    mict = min((o for o in bpy.data.objects if o.data is not None and o.data.name == "P_Mictorio"), key=lambda o: o.location.z)
    dados.add(mict)
    bpy.data.libraries.write(REF, dados, path_remap='ABSOLUTE', compress=True)
    print("REF", REF, len(dados), "objetos")


# sempre na cena do mapa (a janela pode estar mostrando outra cena, ex. a "Animacoes" do 11_animacoes.py)
MAPA = next(s for s in bpy.data.scenes if "Bar_Boteco" in s.collection.children)
with bpy.context.temp_override(scene=MAPA, view_layer=MAPA.view_layers[0]):
    limpar()
    materiais()
    personagem()
    fz, tampa = freezer()
    band = bandeja()
    marc = marcadores()
    referencia([tampa] + band + marc)
