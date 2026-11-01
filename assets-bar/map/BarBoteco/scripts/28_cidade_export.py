# Cidade - exportacao por setor para streaming (PlayCanvas/WebGL), no mesmo padrao do 08_export.py:
#   export\cidade\setores\cidade_Sxx_yy.gltf (+.bin) VISUAL+ROADS+PROPS+VEGETATION+MARKERS (estatico fundido por material,
#                                                     repetidos >= INST_MIN via EXT_mesh_gpu_instancing, luzes e marcadores
#                                                     como nos com o nome original)
#   export\cidade\setores\cidade_Sxx_yy_lod.gltf     LOD1/LOD2 do setor (nos separados: *_LOD1, *_LOD2)
#   export\cidade\texturas\                          texturas COMPARTILHADAS por todos os setores (gltf separado: cada
#                                                     setor so referencia a URI; nada de textura repetida dentro dos arquivos)
#   export\cidade\setores\cidade_Sxx_yy_colisao.glb  caixas COL_* (escala = tamanho), sem material
#   export\cidade\cidade_anel.gltf / cidade_distante.gltf
#   export\cidade\cidade_setores.json                manifesto (limites, arquivos, tamanhos, triangulos, vizinhos)
# O bairro original continua no bar_boteco.glb do 08_export (INCLUIR_BAIRRO_ORIGINAL = False evita duplicar).
import bpy, os, json, struct, sys, time
from mathutils import Vector
SP = r"C:\Users\rafael\BarBoteco\scripts"
if SP not in sys.path:
    sys.path.insert(0, SP)
import importlib
import barlib as B
import cidadelib as C
importlib.reload(C)

SAIDA = os.path.join(B.EXPORT_DIR, "cidade")
SET_DIR = os.path.join(SAIDA, "setores")
os.makedirs(SET_DIR, exist_ok=True)
INST_MIN = 4
INCLUIR_BAIRRO_ORIGINAL = globals().get("INCLUIR_BAIRRO_ORIGINAL", False)
SO_SETORES = globals().get("SO_SETORES")            # ex.: {"S04_05"}: exporta so esses (atualiza o manifesto existente)
EXPORTAR_FUNDO = globals().get("EXPORTAR_FUNDO", not SO_SETORES)
SEP = dict(export_format='GLTF_SEPARATE', export_texture_dir="../texturas")
scn = bpy.context.scene
vl = bpy.context.view_layer


def gltf(path, **kw):
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    opts = dict(filepath=path, export_format='GLB', use_active_scene=True, use_active_collection=True,
                use_active_collection_with_nested=True, export_apply=True, export_yup=True, export_texcoord=True,
                export_normals=True, export_tangents=False, export_materials='EXPORT', export_image_format='AUTO',
                export_cameras=False, export_lights=True, export_extras=True, export_animations=False, export_skins=False,
                export_morph=False, export_attributes=False, export_gpu_instances=True, will_save_settings=False)
    opts.update(kw)
    import io, contextlib, logging
    lg = logging.getLogger()
    nivel = lg.level
    lg.setLevel(logging.WARNING)
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            bpy.ops.export_scene.gltf(**{k: v for k, v in opts.items() if k in props})
    finally:
        lg.setLevel(nivel)


def tmp_coll(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    for o in list(c.objects):
        c.objects.unlink(o)
    if c.name not in scn.collection.children.keys():
        scn.collection.children.link(c)
    return c


def set_active(c):
    def find(lc):
        if lc.collection == c:
            return lc
        for ch in lc.children:
            r = find(ch)
            if r:
                return r
    vl.active_layer_collection = find(vl.layer_collection)


def limpar(c):
    for o in list(c.objects):
        if o.get("_tmp_export"):
            me = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if me is not None and isinstance(me, bpy.types.Mesh) and me.users == 0:
                bpy.data.meshes.remove(me)
        else:
            c.objects.unlink(o)


def juntar(nome, objs, destino):
    copias = []
    for o in objs:
        me = o.data.copy()
        me.transform(o.matrix_world)
        c = bpy.data.objects.new(nome + "_tmp", me)
        c["_tmp_export"] = True
        destino.objects.link(c)
        copias.append(c)
    if not copias:
        return None
    sobras = [c.data for c in copias[1:]]
    with bpy.context.temp_override(active_object=copias[0], object=copias[0], selected_objects=copias,
                                   selected_editable_objects=copias):
        bpy.ops.object.join()
    for me in sobras:                                       # malhas das copias que o join absorveu (orfas)
        if me.users == 0:
            bpy.data.meshes.remove(me)
    j = copias[0]
    j.name = nome
    j.data.name = nome
    return j


def tris(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)


def resumo_glb(path):
    if path.endswith(".gltf"):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    with open(path, 'rb') as f:
        data = f.read()
    ln = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + ln])


def kb(path):
    t = os.path.getsize(path)
    if path.endswith(".gltf"):
        b = path[:-5] + ".bin"
        if os.path.exists(b):
            t += os.path.getsize(b)
    return t // 1024


extras_addon = {k: scn[k] for k in list(scn.keys()) if k.startswith(("blendermcp", "cid_vis_usuario"))}
for k in extras_addon:
    del scn[k]
if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
originais = {}
if INCLUIR_BAIRRO_ORIGINAL:
    for cn in ("Exterior_Rua", "Exterior_Vizinhanca", "Exterior_Mobiliario"):
        for o in bpy.data.collections[cn].objects:
            if o.type == 'MESH' and o.get("setor"):
                originais.setdefault(o["setor"], []).append(o)
man_path = os.path.join(SAIDA, "cidade_setores.json")
manifesto = {"setor_m": C.SETOR, "n": C.NS, "origem_xy": [-C.HALF, -C.HALF], "eixos": "glTF Y-up (Blender Z-up convertido)",
             "bairro_original_incluso": INCLUIR_BAIRRO_ORIGINAL, "texturas": "texturas/ (compartilhadas)", "setores": {}}
if SO_SETORES and os.path.exists(man_path):
    with open(man_path, encoding="utf-8") as f:
        manifesto = json.load(f)
t0 = time.time()
exp = tmp_coll("_EXPORT_CIDADE")
try:
    for ix in range(C.NS):
        for iy in range(C.NS):
            s = C.pref(ix, iy)
            if SO_SETORES and s not in SO_SETORES:
                continue
            nome = C.nome_setor(ix, iy)
            vis = []
            for sub in ("VISUAL", "ROADS", "PROPS", "VEGETATION"):
                vis += [o for o in bpy.data.collections[nome + "_" + sub].objects]
            vis += originais.get(s, [])
            meshes = [o for o in vis if o.type == 'MESH' and o.data.polygons]
            outros = [o for o in vis if o.type in ('LIGHT',)] + list(bpy.data.collections[nome + "_MARKERS"].objects)
            usos = {}
            for o in meshes:
                usos[o.data.name] = usos.get(o.data.name, 0) + 1
            inst = {m for m, n in usos.items() if n >= INST_MIN and m.startswith(("P_", "K_", "A_", "Rua_PARE"))}
            estaticos, raizes, n_inst = [], {}, 0
            tri_inst = 0
            for o in meshes:
                if o.data.name in inst:
                    e = raizes.get(o.data.name)
                    if e is None:
                        e = bpy.data.objects.new("INST_" + o.data.name, None)
                        e["_tmp_export"] = True
                        e["lod1"] = o.data.get("lod1", "")
                        e["cull_m"] = o.data.get("cull_m", 0)
                        exp.objects.link(e)
                        raizes[o.data.name] = e
                    c = bpy.data.objects.new(o.data.name + "_%d" % n_inst, o.data)
                    c["_tmp_export"] = True
                    exp.objects.link(c)
                    c.parent = e
                    c.matrix_world = o.matrix_world.copy()
                    n_inst += 1
                    tri_inst += tris(o.data)
                else:
                    estaticos.append(o)
            j = juntar(s + "_Estatico", estaticos, exp)
            tri_est = tris(j.data) if j else 0
            for o in outros:
                exp.objects.link(o)
            set_active(exp)
            vl.update()
            arq = os.path.join(SET_DIR, "cidade_%s.gltf" % s)
            gltf(arq, **SEP)
            limpar(exp)
            # LOD
            lods = [o for o in bpy.data.collections[nome + "_LOD"].objects if o.type == 'MESH']
            for o in lods:
                exp.objects.link(o)
            set_active(exp)
            arq_lod = os.path.join(SET_DIR, "cidade_%s_lod.gltf" % s)
            gltf(arq_lod, **SEP)
            tri_lod = {o.name: tris(o.data) for o in lods}
            limpar(exp)
            # colisao
            colz = list(bpy.data.collections[nome + "_COLLISION"].objects)
            for o in colz:
                exp.objects.link(o)
            set_active(exp)
            arq_col = os.path.join(SET_DIR, "cidade_%s_colisao.glb" % s)
            gltf(arq_col, export_materials='NONE', export_lights=False, export_normals=False, export_texcoord=False,
                 export_gpu_instances=False)
            limpar(exp)
            js = resumo_glb(arq)
            viz = [C.pref(ix + dx, iy + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                   if (dx or dy) and 0 <= ix + dx < C.NS and 0 <= iy + dy < C.NS]
            manifesto["setores"][s] = {
                "limites_xy": [-C.HALF + ix * C.SETOR, -C.HALF + iy * C.SETOR, -C.HALF + (ix + 1) * C.SETOR, -C.HALF + (iy + 1) * C.SETOR],
                "zona": C.zona_de(-C.HALF + (ix + 0.5) * C.SETOR, -C.HALF + (iy + 0.5) * C.SETOR),
                "arquivos": {"visual": os.path.basename(arq), "lod": os.path.basename(arq_lod), "colisao": os.path.basename(arq_col)},
                "kb": {"visual": kb(arq), "lod": kb(arq_lod), "colisao": kb(arq_col)},
                "tris_estatico": tri_est, "tris_instancias": tri_inst, "instancias": n_inst, "malhas_instanciadas": len(inst),
                "primitivas": sum(len(m['primitives']) for m in js.get('meshes', [])), "materiais": len(js.get('materials', [])),
                "tris_lod": tri_lod, "colisores": len(colz), "vizinhos": viz}
    # anel e distante
    for nome, cn in (("cidade_anel.gltf", "CITY_ANEL_EXTERNO"), ("cidade_distante.gltf", "CITY_DISTANTE")):
        if not EXPORTAR_FUNDO:
            break
        objs = list(bpy.data.collections[cn].objects)
        for o in objs:
            exp.objects.link(o)
        set_active(exp)
        gltf(os.path.join(SAIDA, nome), export_format='GLTF_SEPARATE', export_texture_dir="texturas")
        limpar(exp)
        manifesto[nome] = {"kb": kb(os.path.join(SAIDA, nome)), "tris": sum(tris(o.data) for o in objs)}
finally:
    limpar(exp)
    bpy.data.collections.remove(exp)
    for k, v in extras_addon.items():
        scn[k] = v
    set_active(bpy.data.collections["CIDADE"])
tex_dir = os.path.join(SAIDA, "texturas")
if os.path.isdir(tex_dir):
    manifesto["texturas_kb"] = sum(os.path.getsize(os.path.join(tex_dir, f)) for f in os.listdir(tex_dir)) // 1024
    manifesto["texturas_arquivos"] = len(os.listdir(tex_dir))
with open(man_path, "w", encoding="utf-8") as f:
    json.dump(manifesto, f, ensure_ascii=False, indent=1)
tot = sum(v["kb"]["visual"] + v["kb"]["lod"] + v["kb"]["colisao"] for v in manifesto["setores"].values())
print("export ok em %.0fs: %d setores, %.1f MB (setores) | maiores:" % (time.time() - t0, len(manifesto["setores"]), tot / 1024),
      sorted(((k, v["kb"]["visual"]) for k, v in manifesto["setores"].items()), key=lambda t: -t[1])[:5])
