# 81b_estoque_export.py - roda NO Blender (depois do 81_empresa_brasil.py).
# Exporta as pecas do ESTOQUE DINAMICO da fabrica EMPRESA BRASIL (o mapa so leva os paletes vazios e os marcadores):
#   export\empresa_brasil\empresa_brasil_estoque.glb
#       EB_Saco_Malte / EB_Saco_Mix / EB_Saco_Produto  - um saco de 25 kg de cada (origem no centro da base, comprimento em X)
#       EB_Palete_Arranjo -> EB_Arranjo_01..18        - onde cada saco fica num palete (local ao centro do palete, no piso dele)
#   export\empresa_brasil\empresa_brasil_estoque.json - vagas (marcador do mapa, tipo, capacidade), ordem de empilhar, medidas
#   export\empresa_brasil\empresa_brasil_tanques.glb + .json - pecas moveis dos 3 tanques de preparo (colecao EB_Empresa_Brasil_DINAMICO):
#       EB_Tanque_N_Agitador: eixo + 2 rotores; girar em torno do Y (glTF) do proprio no para misturar
#       EB_Tanque_N_Liquido : disco de raio 1 m (superficie da emulsao). Para um volume V: achar a altura h na tabela,
#                             posicionar o no em y = fundo + h e escalar x/z pelo raio da tabela (o casco esconde o resto)
#   Os paletes do porta-paletes tem nivel_m (0 / 1,55 / 3,10 m) no JSON do estoque.
# O jogo mostra N sacos numa vaga instanciando o saco do tipo nas N primeiras posicoes do arranjo (camada de baixo primeiro);
# o saco carregado na mao e o mesmo prototipo. Coordenadas do glTF: Y para cima (x = x Blender, y = z, z = -y).
import bpy, os, json, math, sys

SAIDA = globals().get("SAIDA", r"C:\Users\rafael\BarBoteco\export\empresa_brasil")
os.makedirs(SAIDA, exist_ok=True)
scn = bpy.context.scene
vl = bpy.context.view_layer
ns = {"__name__": "eb81_lib", "RODAR": False}
p81 = r"C:\Users\rafael\BarBoteco\scripts\81_empresa_brasil.py"
exec(compile(open(p81, encoding="utf-8").read(), p81, "exec"), ns)     # so para ler ARRANJO e as vagas (RODAR=False)
ARRANJO = ns["ARRANJO"]

tmp = bpy.data.collections.new("_EXPORT_EB_ESTOQUE")
scn.collection.children.link(tmp)
criados = []
try:
    for tipo in ("Malte", "Mix", "Produto"):
        me = bpy.data.meshes["P_EB_Saco_" + tipo]
        o = bpy.data.objects.new("EB_Saco_" + tipo, me)
        tmp.objects.link(o); criados.append(o)
    raiz = bpy.data.objects.new("EB_Palete_Arranjo", None); tmp.objects.link(raiz); criados.append(raiz)
    for i, (x, y, z, g) in enumerate(ARRANJO):
        e = bpy.data.objects.new("EB_Arranjo_%02d" % (i + 1), None)
        e.location = (x, y, z); e.rotation_euler = (0, 0, math.radians(g)); e.parent = raiz
        e["camada"] = i // 3 + 1
        tmp.objects.link(e); criados.append(e)

    def achar(lc):
        if lc.collection == tmp: return lc
        for c in lc.children:
            r = achar(c)
            if r: return r
    vl.active_layer_collection = achar(vl.layer_collection)
    extras = {k: scn[k] for k in list(scn.keys()) if k.startswith(("blendermcp", "cid_vis_usuario", "_qa", "_cam"))}
    for k in extras: del scn[k]
    try:
        props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()      # nomes mudam entre versoes: filtra
        opts = dict(filepath=os.path.join(SAIDA, "empresa_brasil_estoque.glb"), export_format="GLB", use_active_scene=True,
                    use_active_collection=True, use_active_collection_with_nested=True, export_yup=True, export_apply=True,
                    export_texcoord=True, export_normals=True, export_materials="EXPORT", export_extras=True,
                    export_animations=False, export_cameras=False, export_lights=False, will_save_settings=False)
        bpy.ops.export_scene.gltf(**{k: v for k, v in opts.items() if k in props})
    finally:
        for k, v in extras.items(): scn[k] = v
finally:
    for o in criados: bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(tmp)
    vl.active_layer_collection = vl.layer_collection

vagas = []
for o in bpy.data.collections["EB_Empresa_Brasil_MARCADORES"].objects:
    if o.get("capacidade"):
        p = o.location
        vagas.append({"marcador": o.name, "tipo": o["tipo"], "capacidade": int(o["capacidade"]),
                      "nivel_m": float(o.get("nivel_m", 0.0)), "jogo_xyz": [round(p.x, 3), round(p.z, 3), round(-p.y, 3)]})
vagas.sort(key=lambda v: v["marcador"])
info = {"descricao": "Estoque dinamico da fabrica EMPRESA BRASIL (setor S07_04). Ver map/relatorios/EMPRESA_BRASIL_2026-11-10.md.",
        "glb": "empresa_brasil_estoque.glb", "saco_kg": 25,
        "sacos": {"MALTE": "EB_Saco_Malte", "MIX": "EB_Saco_Mix", "PRODUTO": "EB_Saco_Produto"},
        "arranjo": "EB_Palete_Arranjo (18 posicoes EB_Arranjo_01..18, 3 por camada, 6 camadas; preencher na ordem)",
        "medidas_m": {"saco_materia_prima": [0.70, 0.45, 0.15], "saco_produto": [0.68, 0.44, 0.14], "palete": [1.0, 1.2, 0.144]},
        "vagas": vagas}
with open(os.path.join(SAIDA, "empresa_brasil_estoque.json"), "w", encoding="utf-8") as f:
    json.dump(info, f, ensure_ascii=False, indent=1)
print("estoque exportado:", os.path.getsize(os.path.join(SAIDA, "empresa_brasil_estoque.glb")) // 1024, "KB;", len(vagas), "vagas")


# ------------------------------------------------------------------ tanques: agitador e nivel da emulsao
cd = bpy.data.collections.get("EB_Empresa_Brasil_DINAMICO")
tmp = bpy.data.collections.new("_EXPORT_EB_TANQUES")
scn.collection.children.link(tmp)
copias = []
try:
    for o in cd.objects:
        c = bpy.data.objects.new(o.name, o.data)
        c.matrix_world = o.matrix_world.copy()
        if o.name.endswith("_Liquido"):
            c.location.z = ns["TQ_FUNDO"]; c.scale = (1.0, 1.0, 1.0)          # exporta vazio (nivel 0) e com raio 1
        tmp.objects.link(c); copias.append(c)
    def achar2(lc):
        if lc.collection == tmp: return lc
        for ch in lc.children:
            r = achar2(ch)
            if r: return r
    vl.active_layer_collection = achar2(vl.layer_collection)
    extras = {k: scn[k] for k in list(scn.keys()) if k.startswith(("blendermcp", "cid_vis_usuario", "_qa", "_cam"))}
    for k in extras: del scn[k]
    try:
        props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
        opts = dict(filepath=os.path.join(SAIDA, "empresa_brasil_tanques.glb"), export_format="GLB", use_active_scene=True,
                    use_active_collection=True, use_active_collection_with_nested=True, export_yup=True, export_apply=True,
                    export_texcoord=True, export_normals=True, export_materials="EXPORT", export_extras=True,
                    export_animations=False, export_cameras=False, export_lights=False, will_save_settings=False)
        bpy.ops.export_scene.gltf(**{k: v for k, v in opts.items() if k in props})
    finally:
        for k, v in extras.items(): scn[k] = v
finally:
    for o in copias: bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(tmp)
    vl.active_layer_collection = vl.layer_collection

tab = ns["tabela_volume"]()
tanques = []
for i, (cx, cy) in enumerate(ns["TANQUES"]):
    tanques.append({"tanque": i + 1, "tag": "TQ-10%d" % (i + 1), "agitador": "EB_Tanque_%d_Agitador" % (i + 1),
                    "liquido": "EB_Tanque_%d_Liquido" % (i + 1), "marcador_carga": "Ponto_EB_Tanque_%d" % (i + 1),
                    "eixo_jogo_xyz": [round(cx, 3), round(ns["TQ_RIM"] + 0.02, 3), round(-cy, 3)],
                    "fundo_jogo_y": round(ns["TQ_FUNDO"], 3)})
info_t = {"descricao": "Tanques de preparo da EMPRESA BRASIL: cubicagem e pecas moveis. Altura h em metros acima do fundo interno.",
          "glb": "empresa_brasil_tanques.glb", "volume_util_L": tab[-1][2], "altura_util_m": tab[-1][0],
          "colunas_tabela": ["altura_m", "raio_superficie_m", "volume_L"], "tabela": tab,
          "sugestao": "1 saco de 25 kg + agua da receita: some o volume em litros e ache h por interpolacao na tabela",
          "tanques": tanques}
with open(os.path.join(SAIDA, "empresa_brasil_tanques.json"), "w", encoding="utf-8") as f:
    json.dump(info_t, f, ensure_ascii=False, indent=1)
print("tanques exportados:", os.path.getsize(os.path.join(SAIDA, "empresa_brasil_tanques.glb")) // 1024, "KB; volume util", tab[-1][2], "L")
