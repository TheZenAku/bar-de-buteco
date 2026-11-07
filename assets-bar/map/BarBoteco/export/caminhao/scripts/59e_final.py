# 59e_final.py - orquestracao do 59_caminhao: montar -> UV -> bake -> pintar -> rig -> export (+ colisao e arquivos do jogo)
import importlib, shutil, json


def pasta_blend():
    return os.path.dirname(BLEND_COPIA)


def _assinatura(ob):
    """impressao digital da malha na ordem dos loops: a booleana pode devolver a mesma forma com outra ordem de faces
    de uma execucao para outra, e a UV guardada so vale para a ordem em que foi gravada"""
    me = ob.data
    co = np.empty(len(me.vertices) * 3, np.float64)
    me.vertices.foreach_get("co", co)
    lv = np.empty(len(me.loops), np.int64)
    me.loops.foreach_get("vertex_index", lv)
    pos = co.reshape(-1, 3)[lv]
    return np.array([pos.sum(), (pos * (np.arange(len(pos))[:, None] % 97 + 1)).sum(), len(me.polygons)], np.float64)


def guardar_uv(OBJS, caminho):
    """grava as UVs finais, com a assinatura da malha (smart project e booleana podem variar de uma execucao para outra)"""
    d = {}
    for k, o in OBJS.items():
        uv = o.data.uv_layers.active
        if uv is None:                      # vidros: sem UV
            continue
        a = np.empty(len(o.data.loops) * 2, np.float32)
        uv.data.foreach_get("uv", a)
        d[k] = a
        d["sig_" + k] = _assinatura(o)
    np.savez_compressed(caminho, **d)


def aplicar_uv(OBJS, caminho):
    d = np.load(caminho)
    for k, o in OBJS.items():
        if k not in d.files:
            continue
        if k.startswith("sig_"):
            continue
        a = d[k]
        if len(a) != len(o.data.loops) * 2 or not np.allclose(d["sig_" + k], _assinatura(o), rtol=1e-9, atol=1e-6):
            raise RuntimeError("UV guardada nao confere com a malha (%s): assar de novo (sem --repintar)" % k)
        uvl = o.data.uv_layers.get("UVMap") or o.data.uv_layers.new(name="UVMap")
        uvl.data.foreach_set("uv", a)


def construir(com_bake=True, exportar_agora=False, amostras_ao=64):
    """roda a cadeia completa; devolve (rig, saidas, OBJS)"""
    if SCRIPTS not in sys.path:
        sys.path.insert(0, SCRIPTS)
    import carro_textura, caminhao_textura
    importlib.reload(carro_textura)
    importlib.reload(caminhao_textura)
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    limpar()
    os.makedirs(SAIDA, exist_ok=True)
    col = colecao("Caminhao")
    tmp = colecao("Cam_TMP")
    OBJS, OSSO = montar_objetos(col, tmp)
    suavizar(OBJS.values())
    UV_NPZ = os.path.join(SAIDA, "uv.npz")
    repintando = bool(globals().get("REPINTAR")) and os.path.exists(UV_NPZ) and not com_bake
    if repintando:
        aplicar_uv(OBJS, UV_NPZ)
    else:
        uv_atlas(OBJS)
        guardar_uv(OBJS, UV_NPZ)
    criar_rodas_D(OBJS, OSSO, col)
    for k, o in OBJS.items():
        if len(o.data.polygons) == 0:
            raise RuntimeError("objeto vazio: " + k)
    ATLAS_PNG = os.path.join(SAIDA, "caminhao_atlas.png")
    PLACA_PNG = os.path.join(SAIDA, "caminhao_placa.png")
    ALU_PNG = os.path.join(SAIDA, "caminhao_aluminio.png")
    if com_bake or not os.path.exists(ATLAS_PNG):
        alvo = [o for k, o in OBJS.items() if not o.name.startswith(SEM_ATLAS) and k not in ALU_CHAVES
                and not (k.endswith("_D") and k.startswith(("Pneu_", "Aro_", "Cubo_")))]
        vidros = [o for o in OBJS.values() if o.name.startswith("Cam_Vidro_")]
        R = bake_dados({"alvo": alvo, "vidros": vidros}, ATLAS_PX, amostras_ao)
        np.savez_compressed(os.path.join(SAIDA, "bake.npz"), **R)
        salvar_png(caminhao_textura.pintar_atlas(R, PECAS), ATLAS_PNG, "caminhao_atlas_tmp")
    elif globals().get("REPINTAR") and os.path.exists(os.path.join(SAIDA, "bake.npz")):      # repinta sem assar de novo
        R = dict(np.load(os.path.join(SAIDA, "bake.npz")))
        salvar_png(caminhao_textura.pintar_atlas(R, PECAS), ATLAS_PNG, "caminhao_atlas_tmp")
    salvar_png(carro_textura.placa()[::-1], PLACA_PNG, "caminhao_placa_tmp")
    salvar_png(caminhao_textura.aluminio(), ALU_PNG, "caminhao_aluminio_tmp")
    atlas = carregar_img(ATLAS_PNG, "caminhao_atlas")
    placa_img = carregar_img(PLACA_PNG, "caminhao_placa")
    alu = carregar_img(ALU_PNG, "caminhao_aluminio")
    col_coli = colecao("Caminhao_Colisao")
    coli = colisao([OBJS[k] for k in ("Casca", "Bau_Ext", "Parachoque", "ParachoqueTras")], col_coli)
    rig, saidas = montar_rig_e_saidas(OBJS, OSSO, col, atlas, placa_img, alu)
    tri = sum(len(p.vertices) - 2 for ob in saidas.values() for p in ob.data.polygons)
    print("triangulos:", tri, "| colisao:", sum(len(p.vertices) - 2 for p in coli.data.polygons))
    if exportar_agora:
        exportar([rig] + list(saidas.values()), os.path.join(SAIDA, "caminhao_bau.glb"))
        exportar([coli], os.path.join(SAIDA, "caminhao_bau_colisao.glb"))
        os.makedirs(pasta_blend(), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=BLEND_COPIA, copy=True)
        print("copia", BLEND_COPIA)
    return rig, saidas, OBJS


if not globals().get("SO_FUNCOES"):
    REPINTAR = "--repintar" in ARGS            # reaproveita bake.npz: so repinta o atlas (segundos em vez de minutos)
    construir(com_bake=not REPINTAR, exportar_agora="--exportar" in ARGS, amostras_ao=64 if "--exportar" in ARGS else 24)
