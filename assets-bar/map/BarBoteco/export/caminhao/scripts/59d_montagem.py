# 59d_montagem.py - montagem, UV (atlas unico), bake de dados, rig, materiais, colisao e export (exec dentro do 59_caminhao.py)
import ast, re

# ---------------------------------------------------------------- funcoes genericas reaproveitadas do carro (21_carro_hatch.py)
CARRO_PY = os.path.join(SCRIPTS, "21_carro_hatch.py")
ATLAS_PX = 2048
MARGEM_PX = 6
SEM_ATLAS = ("Cam_Vidro_", "Cam_Placa_")
DENSIDADE = {"pintura": 0.9, "porta_pintura": 0.9, "forro_cab": 0.55, "forro_porta": 0.6, "bau_chapa": 0.42, "bau_teto": 0.35,
             "bau_forro": 0.45, "bau_porta": 0.40, "bau_moldura": 0.5, "parachoque": 0.8, "plastico": 0.6, "borracha": 0.4,
             "pneu": 0.8, "roda": 1.0, "cubo": 0.6, "chassi": 0.25, "eixo": 0.25, "tanque": 0.35, "escape": 0.25, "banco": 0.8,
             "painel": 0.7, "volante": 0.8, "grade": 1.0, "farol_E": 2.0, "seta_E": 1.6, "seta_D": 1.6, "cromo": 0.5,
             "refletor": 1.0, "carga": 0.35, "espelho": 0.7, "palheta": 0.3, "tapete": 0.5, "lanterna_E": 1.6, "re_E": 1.6,
             "mola": 0.2, "estribo": 0.4, "trilho": 0.4, "luz_bau": 0.5, "placa": 1.0}
DENS_FUNDO = 0.2


def _carregar_genericas():
    src = open(CARRO_PY, encoding="utf8").read()
    arvore = ast.parse(src)
    nomes = {"selecionar_so", "smart_uv", "ilhas_uv", "preparar_ilhas", "_skyline", "empacotar", "_img_dados", "_mat_bake",
             "salvar_png", "carregar_img", "bake_dados"}
    ns = dict(bpy=bpy, bmesh=bmesh, math=math, os=os, np=np, Vector=Vector, Matrix=Matrix, PECAS=PECAS, ATLAS_PX=ATLAS_PX,
              MARGEM_PX=MARGEM_PX, DENSIDADE=DENSIDADE, DENS_FUNDO=DENS_FUNDO, SEM_ATLAS=SEM_ATLAS)
    for no in arvore.body:
        if isinstance(no, ast.FunctionDef) and no.name in nomes:
            codigo = ast.get_source_segment(src, no)
            if no.name == "bake_dados":      # alvos e vidros vem prontos
                codigo = re.sub(r"    alvo = \[o for o in objs\.values\(\).*?startswith\(\"Carro_Vidro_\"\)\]\n",
                                "    alvo, vidros = list(objs['alvo']), list(objs['vidros'])\n", codigo, flags=re.S)
            exec(compile(codigo, "carro_generica_" + no.name, "exec"), ns)
    return ns


GEN = _carregar_genericas()
selecionar_so, smart_uv, preparar_ilhas, empacotar = GEN["selecionar_so"], GEN["smart_uv"], GEN["preparar_ilhas"], GEN["empacotar"]
bake_dados, salvar_png, carregar_img = GEN["bake_dados"], GEN["salvar_png"], GEN["carregar_img"]

# ---------------------------------------------------------------- montagem
# aluminio: material proprio com textura que se repete (1 m por ladrilho); nao entra no atlas
ALU_CHAVES = ("BauChapa_E", "BauChapa_D", "BauFrente", "BauTeto", "PortaBau", "BauMolduras", "Bau_Ext")
ALU_PECAS = ("bau_chapa", "bau_teto", "bau_porta", "bau_moldura")
ALU_METROS = 1.0


def montar_objetos(col, tmp):
    """cria tudo; devolve (OBJS: chave -> objeto, OSSO: chave -> osso)"""
    OBJS, OSSO = {}, {}

    def reg(chave, ob, osso="chassi"):
        OBJS[chave] = ob
        OSSO[chave] = osso
        return ob

    casca, portas = casca_cabine(col, tmp)
    for o in [casca] + list(portas.values()):
        if o.name not in col.objects:
            col.objects.link(o)
        if o.name in tmp.objects:
            tmp.objects.unlink(o)
    reg("Casca", casca)
    for lado in ("E", "D"):
        renomear_pecas(portas[lado], {"pintura": "porta_pintura", "forro_cab": "forro_porta"})
        reg("Porta_" + lado, portas[lado], "porta_" + lado)
    for o in flares_cabine(col):
        reg(o.name.replace("Cam_", ""), o)
    for o in vidros_cabine(col):
        reg(o.name.replace("Cam_", ""), o, "porta_E" if o.name.endswith("_E") else "porta_D" if o.name.endswith("_D") else "chassi")
    for s, lado in ((1, "E"), (-1, "D")):
        a, b = retrovisor(s, col)
        reg("Retrovisor_" + lado, a, "porta_" + lado)
        reg("RetroEspelho_" + lado, b, "porta_" + lado)
        reg("Macaneta_" + lado, macaneta(s, col), "porta_" + lado)
        reg("ItensPorta_" + lado, itens_porta(s, col), "porta_" + lado)
    reg("Parachoque", parachoque_frente(col))
    luz = luzes_frente(col)
    reg("Luz_Farol", luz["Luz_Farol"])
    reg("Luz_Seta_E_f", luz["Luz_Seta_E"])
    reg("Luz_Seta_D_f", luz["Luz_Seta_D"])
    reg("Grade", luz["Grade"])
    for k, o in interior_cabine(col).items():
        reg(k, o)
    reg("Volante", volante(col), "volante")
    reg("Coluna", coluna_direcao(col))
    for lado, o in palhetas(col).items():
        reg(lado, o, lado)
    bau = casca_bau(col, tmp)
    col.objects.link(bau)
    tmp.objects.unlink(bau)
    reg("Bau_Int", bau)
    ext = separar_faces(bau, col, "Cam_Bau_Ext", lambda p: p.index in _idx_pecas(bau, ("bau_chapa",)))
    reg("Bau_Ext", ext)
    for o in chapas_bau(col):
        reg(o.name.replace("Cam_", ""), o)
    reg("BauMolduras", molduras_bau(col))
    reg("BauTeto", teto_bau(col))
    p, puxa = porta_de_enrolar(col)
    reg("PortaBau", p, "porta_bau")
    reg("PortaBau_puxador", puxa, "porta_bau")
    lan = lanternas_traseiras(col)
    reg("Luz_Lanterna", lan["Luz_Lanterna"])
    reg("Luz_Seta_E_t", lan["Luz_Seta_E_t"])
    reg("Luz_Seta_D_t", lan["Luz_Seta_D_t"])
    reg("Luz_Re", lan["Luz_Re"])
    reg("Refletores", refletores(col))
    ib = interior_bau(col)
    reg("BauPilares", ib["BauPilares"])
    reg("Luz_Bau", ib["Luz_Bau"])
    for k, o in carga(col).items():
        reg(k, o, k)
    for k, o in chassi_geral(col).items():
        reg(k, o)
    reg("ParachoqueTras", parachoque_traseiro(col))
    for k, o in paralamas_traseiros(col).items():
        reg(k, o)
    # placas
    reg("Placa_Frente", placa_obj(col, -2.665, 0.60, True))
    reg("Placa_Tras", placa_obj(col, 2.806, 0.64, False))
    # rodas (E construida; D espelhada depois do UV)
    for nome, fn in (("dianteira", roda_dianteira), ("traseira", roda_traseira)):
        partes = fn(col, 1)
        for o in partes:
            reg(o.name.replace("Cam_", ""), o, "roda_%s_E" % nome)
    return OBJS, OSSO


def _idx_pecas(ob, nomes):
    lay = ob.data.attributes["peca"].data
    ids = {PID[n] for n in nomes}
    return {p.index for p in ob.data.polygons if lay[p.index].value in ids}


def separar_faces(ob, col, nome, quando):
    """move para um objeto novo as faces que cumprem 'quando' (e as tira do original)"""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    sel = {p.index for p in ob.data.polygons if quando(p)}
    novo = bm.copy()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index in sel], context='FACES')
    bmesh.ops.delete(novo, geom=[f for f in novo.faces if f.index not in sel], context='FACES')
    bm.to_mesh(ob.data)
    bm.free()
    me = bpy.data.meshes.new(nome)
    novo.to_mesh(me)
    novo.free()
    o2 = bpy.data.objects.new(nome, me)
    col.objects.link(o2)
    for o in (ob, o2):
        o.data.update()
    return o2


def placa_obj(col, y, z, frente):
    bm = caixa((0, y, z), (0.40, 0.012, 0.13))
    ob = objeto(bm, "Cam_Placa_" + ("Frente" if frente else "Tras"), col, "placa")
    ob["zc"] = z
    return ob


def uv_placa(ob, frente):
    """a face da placa ocupa a textura inteira; o resto (cantos) cai num pixel de borda"""
    me = ob.data
    uvl = me.uv_layers.get("UVMap") or me.uv_layers.new(name="UVMap")
    zc = ob["zc"]
    for p in me.polygons:
        face_placa = (p.normal.y < -0.9) if frente else (p.normal.y > 0.9)
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u = (co.x + 0.2) / 0.4
            uvl.data[li].uv = ((u if frente else 1 - u), (co.z - zc + 0.065) / 0.13) if face_placa else (0.0, 0.0)


MAPA_ALU = {"BauChapa_E": "yz", "BauChapa_D": "yz", "BauFrente": "xz", "PortaBau": "xz", "BauTeto": "yx"}


def uv_triplanar(ob, modo=None):
    """UV em metros (ladrilho de ALU_METROS): projecao pelo eixo dominante da normal da face. O aluminio fica no mesmo
    sentido da ondulacao (u = ao longo do bau)"""
    me = ob.data
    uvl = me.uv_layers.get("UVMap") or me.uv_layers.new(name="UVMap")
    for p in me.polygons:
        n = p.normal
        ax = {"yz": 0, "xz": 1, "yx": 2}[modo] if modo else max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if ax == 0:
                uv = (co.y, co.z)
            elif ax == 1:
                uv = (co.x, co.z)
            else:
                uv = (co.y, co.x)
            uvl.data[li].uv = (uv[0] / ALU_METROS, uv[1] / ALU_METROS)


def suavizar(obs, angulo=40.0):
    for ob in obs:
        me = ob.data
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        if hasattr(me, "use_auto_smooth"):
            me.use_auto_smooth = True
            me.auto_smooth_angle = math.radians(angulo)
        me.update()
    # Blender 4.1+: sombreamento por angulo (vinco nas quinas) e nao mais auto smooth
    if not hasattr(bpy.types.Mesh, "use_auto_smooth"):
        selecionar_so(list(obs))
        try:
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angulo))
        except Exception as e:
            print("shade_smooth_by_angle:", e)


def uv_atlas(OBJS):
    """UV: projecao plana nas chapas, smart project no resto; o atlas e empacotado com o skyline do carro.
    As rodas D sao copias espelhadas das E (mesmas ilhas)."""
    obs = [o for k, o in OBJS.items() if not o.name.startswith(SEM_ATLAS) and k not in ALU_CHAVES]
    for k, o in OBJS.items():
        if o.name.startswith(SEM_ATLAS):
            continue
        if k in ALU_CHAVES:
            uv_triplanar(o, MAPA_ALU.get(k))
        else:
            smart_uv(o)
    for k, o in OBJS.items():
        if k == "Placa_Frente":
            uv_placa(o, True)
        elif k == "Placa_Tras":
            uv_placa(o, False)
    ilhas = preparar_ilhas(obs)
    esc = empacotar(ilhas)
    print("atlas: %.0f px/m (referencia 1.0)" % esc)
    return esc


def criar_rodas_D(OBJS, OSSO, col):
    for chave in [k for k in OBJS if k.endswith("_E") and k.startswith(("Pneu_", "Aro_", "Cubo_"))]:
        d = chave[:-2] + "_D"
        ob = espelhar_x(OBJS[chave], "Cam_" + d, col)
        OBJS[d] = ob
        OSSO[d] = OSSO[chave].replace("_E", "_D")


# ---------------------------------------------------------------- rig
def ossos_do_caminhao(OBJS):
    cima = Vector((0, 0, 1))
    C = VOLANTE["centro"]
    inc = math.radians(VOLANTE["incl"])
    eixo_col = Vector((0, math.cos(inc), math.sin(inc)))
    v_plano = eixo_col.cross(Vector((1, 0, 0))).normalized()
    R = VOLANTE["raio"]
    cp = CAB_PISO
    ossos = [
        ("raiz", Vector((0, 0, 0)), Vector((0, 0, 0.25)), None, True),
        ("chassi", Vector((0, 0, 0.55)), Vector((0, 0, 0.80)), "raiz", True),
        ("porta_E", Vector((CAB_X, DOOR_Y0 + 0.01, 1.30)), Vector((CAB_X, DOOR_Y0 + 0.01, 1.60)), "chassi", True),
        ("porta_D", Vector((-CAB_X, DOOR_Y0 + 0.01, 1.30)), Vector((-CAB_X, DOOR_Y0 + 0.01, 1.60)), "chassi", True),
        ("porta_bau", Vector((0, PORTA_BAU["y"], PORTA_BAU["z1"])), Vector((0, PORTA_BAU["y"], PORTA_BAU["z1"] + 0.25)), "chassi", True),
        ("volante", C.copy(), C + eixo_col * 0.12, "chassi", True),
        ("direcao_E", Vector((X_RD, YF, ZC)), Vector((X_RD, YF, ZC + 0.20)), "raiz", False),
        ("direcao_D", Vector((-X_RD, YF, ZC)), Vector((-X_RD, YF, ZC + 0.20)), "raiz", False),
        ("roda_dianteira_E", Vector((X_RD, YF, ZC)), Vector((X_RD, YF, ZC + 0.15)), "direcao_E", True),
        ("roda_dianteira_D", Vector((-X_RD, YF, ZC)), Vector((-X_RD, YF, ZC + 0.15)), "direcao_D", True),
        ("roda_traseira_E", Vector((0.83, YT, ZC)), Vector((0.83, YT, ZC + 0.15)), "raiz", True),
        ("roda_traseira_D", Vector((-0.83, YT, ZC)), Vector((-0.83, YT, ZC + 0.15)), "raiz", True),
    ]
    for k in (1, 2, 3):
        ossos.append(("carga_%d" % k, Vector((0, BAU_Y0 + 1.2, BAU_PISO)), Vector((0, BAU_Y0 + 1.2, BAU_PISO + 0.2)), "chassi", True))
    for nome in ("limpador_E", "limpador_D"):
        piv = Vector(OBJS[nome]["pivo"])
        n = Vector((0, -WS_T.y, WS_T.x))                                  # normal do para-brisa (para fora)
        ossos.append((nome, piv, piv + n * 0.08, "chassi", True))
    P = {
        "ponto_motorista": ("chassi", Vector((0.50, -1.45, cp + 0.40))),
        "ponto_passageiro": ("chassi", Vector((-0.50, -1.45, cp + 0.40))),
        "ponto_olhos": ("chassi", Vector((0.50, -1.60, 2.00))),
        "ponto_mao_E": ("volante", C + Vector((1, 0, 0)) * R * 0.94 + v_plano * R * 0.34),
        "ponto_mao_D": ("volante", C - Vector((1, 0, 0)) * R * 0.94 + v_plano * R * 0.34),
        "ponto_pe_E": ("chassi", Vector((0.40, -2.20, cp + 0.12))),
        "ponto_pe_D": ("chassi", Vector((0.62, -2.20, cp + 0.12))),
        "ponto_porta_E": ("raiz", Vector((1.55, -1.60, 0.0))),
        "ponto_porta_D": ("raiz", Vector((-1.55, -1.60, 0.0))),
        "ponto_farol_E": ("chassi", Vector((0.675, CAB_Y0 - 0.02, 1.03))),
        "ponto_farol_D": ("chassi", Vector((-0.675, CAB_Y0 - 0.02, 1.03))),
        "ponto_lanterna_E": ("chassi", Vector((BAU_X - 0.048, BAU_Y1 + 0.02, 1.20))),
        "ponto_lanterna_D": ("chassi", Vector((-(BAU_X - 0.048), BAU_Y1 + 0.02, 1.20))),
        "ponto_re_E": ("chassi", Vector((BAU_X - 0.048, BAU_Y1 + 0.02, 1.57))),
        "ponto_re_D": ("chassi", Vector((-(BAU_X - 0.048), BAU_Y1 + 0.02, 1.57))),
        "ponto_seta_frente_E": ("chassi", Vector((0.885, CAB_Y0 - 0.02, 1.03))),
        "ponto_seta_frente_D": ("chassi", Vector((-0.885, CAB_Y0 - 0.02, 1.03))),
        "ponto_seta_tras_E": ("chassi", Vector((BAU_X - 0.048, BAU_Y1 + 0.02, 1.42))),
        "ponto_seta_tras_D": ("chassi", Vector((-(BAU_X - 0.048), BAU_Y1 + 0.02, 1.42))),
        "ponto_placa_frente": ("chassi", Vector((0, -2.68, 0.60))),
        "ponto_placa_tras": ("chassi", Vector((0, 2.815, 0.64))),
        "ponto_escapamento": ("chassi", Vector((-0.55, 2.78, 0.56))),
        "ponto_luz_interna": ("chassi", Vector((0, -1.40, CAB_Z1 - 0.07))),
        "ponto_luz_bau": ("chassi", Vector((0, 0.9, BAU_Z_TETO_INT - 0.04))),
        "ponto_bau": ("chassi", Vector((0, 0.8, 1.7))),
        "ponto_bau_acesso": ("raiz", Vector((0, BAU_Y1 + 1.15, 0.0))),
        "ponto_bau_camera": ("raiz", Vector((0, BAU_Y1 + 2.4, 1.90))),
        "ponto_tanque": ("chassi", Vector((1.12, -0.72, 0.72))),
    }
    for nome, (pai, pos) in P.items():
        ossos.append((nome, pos, pos + cima * 0.06, pai, False))
    return ossos


def criar_rig(col, ossos):
    arm = bpy.data.armatures.new("Caminhao_Rig")
    arm.display_type = 'STICK'
    rig = bpy.data.objects.new("Caminhao_Rig", arm)
    col.objects.link(rig)
    rig.show_in_front = True
    selecionar_so([rig])
    bpy.ops.object.mode_set(mode='EDIT')
    for nome, cabeca, cauda, pai, deforma in ossos:
        b = arm.edit_bones.new(nome)
        b.head, b.tail, b.roll = cabeca, cauda, 0.0
        b.use_deform = deforma
        if pai:
            b.parent = arm.edit_bones[pai]
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def pele(ob, osso, rig):
    ob.vertex_groups.clear()
    vg = ob.vertex_groups.new(name=osso)
    vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    mod = ob.modifiers.new("Armature", 'ARMATURE')
    mod.object = rig
    ob.parent = rig


def juntar(obs, nome, col):
    obs = [o for o in obs if o]
    selecionar_so(obs, obs[0])
    if len(obs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = nome
    ob.data.name = nome
    return ob


# ---------------------------------------------------------------- materiais
def _no_principled(mat):
    return next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def material_textura(nome, img, cor=None, rugosidade=0.7, emissao=False, metal=0.0):
    mat = bpy.data.materials.get(nome)
    if mat:
        bpy.data.materials.remove(mat)
    mat = bpy.data.materials.new(nome)
    mat.use_nodes = True
    nt = mat.node_tree
    bs = _no_principled(mat)
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    saida = tex.outputs[0]
    if cor is not None:
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type, mix.blend_type = 'RGBA', 'MULTIPLY'
        mix.inputs[0].default_value = 1.0
        nt.links.new(tex.outputs[0], mix.inputs[6])
        mix.inputs[7].default_value = cor
        saida = mix.outputs[2]
    nt.links.new(saida, bs.inputs["Base Color"])
    bs.inputs["Roughness"].default_value = rugosidade
    bs.inputs["Metallic"].default_value = metal
    mat.use_backface_culling = True
    if emissao:
        nt.links.new(tex.outputs[0], bs.inputs["Emission Color"])
        bs.inputs["Emission Strength"].default_value = 1.0
    return mat


def material_vidro():
    mat = bpy.data.materials.get("Caminhao_Vidro")
    if mat:
        bpy.data.materials.remove(mat)
    mat = bpy.data.materials.new("Caminhao_Vidro")
    mat.use_nodes = True
    bs = _no_principled(mat)
    bs.inputs["Base Color"].default_value = (0.045, 0.065, 0.075, 1.0)
    bs.inputs["Alpha"].default_value = 0.38
    bs.inputs["Roughness"].default_value = 0.05
    for atr, val in (("blend_method", 'BLEND'), ("surface_render_method", 'BLENDED')):
        try:
            setattr(mat, atr, val)
        except (TypeError, AttributeError):
            pass
    mat.use_backface_culling = False
    return mat


PINTURA = ("pintura", "porta_pintura")
COR_PADRAO = (0.92, 0.92, 0.90, 1.0)
SAIDAS = {
    "Caminhao": None,
    "Caminhao_Vidros": ("Vidro_Parabrisa", "Vidro_Porta_E", "Vidro_Porta_D"),
    "Caminhao_Placas": ("Placa_Frente", "Placa_Tras"),
    "Luz_Farol": ("Luz_Farol",), "Luz_Lanterna": ("Luz_Lanterna",), "Luz_Re": ("Luz_Re",),
    "Luz_Seta_E": ("Luz_Seta_E_f", "Luz_Seta_E_t"), "Luz_Seta_D": ("Luz_Seta_D_f", "Luz_Seta_D_t"),
    "Luz_Interna": ("Luz_Bau", "Luz_Teto"),
}


def materiais(saidas, atlas, img_placa, img_alu):
    m_pint = material_textura("Caminhao_Pintura", atlas, COR_PADRAO, 0.38)
    m_atlas = material_textura("Caminhao_Atlas", atlas, None, 0.75)
    m_placa = material_textura("Caminhao_Placa", img_placa, None, 0.45)
    m_alu = material_textura("Caminhao_Aluminio", img_alu, None, 0.5, metal=0.3)
    m_alu.node_tree.nodes  # a textura repete por padrao (extensao REPEAT)
    m_vidro = material_vidro()
    ids = {PID[n] for n in PINTURA}
    for nome, ob in saidas.items():
        me = ob.data
        me.materials.clear()
        if nome == "Caminhao":
            me.materials.append(m_pint)
            me.materials.append(m_atlas)
            me.materials.append(m_alu)
            lay = me.attributes["peca"].data
            alu = {PID[n] for n in ALU_PECAS}
            me.polygons.foreach_set("material_index", [0 if lay[p.index].value in ids else 2 if lay[p.index].value in alu else 1
                                                       for p in me.polygons])
        elif nome == "Caminhao_Vidros":
            me.materials.append(m_vidro)
        elif nome == "Caminhao_Placas":
            me.materials.append(m_placa)
        else:
            me.materials.append(material_textura(nome, atlas, None, 0.25, emissao=True))


def colisao(fontes, col):
    """casco convexo da carroceria reduzido (fisica)"""
    bm = bmesh.new()
    for ob in fontes:
        for v in ob.data.vertices:
            bm.verts.new(ob.matrix_world @ v.co)
    bmesh.ops.convex_hull(bm, input=bm.verts[:])
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    ob = objeto(bm, "Caminhao_Colisao", col)
    mod = ob.modifiers.new("reduz", 'DECIMATE')
    mod.ratio = 0.25
    dg = bpy.context.evaluated_depsgraph_get()
    novo = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    velho = ob.data
    ob.data = novo
    bpy.data.meshes.remove(velho)
    novo.name = "Caminhao_Colisao"
    novo.materials.clear()
    return ob


def exportar(objs, caminho):
    selecionar_so(objs)
    bpy.ops.export_scene.gltf(filepath=caminho, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=False, export_animations=False, export_skins=True, export_def_bones=False,
                              export_image_format='JPEG', export_jpeg_quality=90, export_image_quality=90,
                              export_normals=True, export_texcoords=True, export_tangents=False, export_extras=False,
                              export_materials='EXPORT', export_rest_position_armature=True)
    for o in objs:
        o.select_set(False)
    print("exportado", caminho, os.path.getsize(caminho) // 1024, "KB")


def montar_rig_e_saidas(OBJS, OSSO, col, atlas, img_placa, img_alu):
    rig = criar_rig(col, ossos_do_caminhao(OBJS))
    for chave, ob in OBJS.items():
        pele(ob, OSSO[chave], rig)
    usados = set()
    saidas = {}
    for nome, fontes in SAIDAS.items():
        if fontes is None:
            continue
        saidas[nome] = juntar([OBJS[f] for f in fontes if f in OBJS], nome, col)
        usados |= set(fontes)
    # o que sobrar vai para "Caminhao"; pele rigida: cada objeto ja tem seu osso (juntar preserva os grupos por nome)
    saidas["Caminhao"] = juntar([ob for k, ob in OBJS.items() if k not in usados], "Caminhao", col)
    materiais(saidas, atlas, img_placa, img_alu)
    for ob in saidas.values():
        for mod in ob.modifiers:
            if mod.type == 'ARMATURE':
                mod.object = rig
        if ob.parent != rig:
            ob.parent = rig
    return rig, saidas
