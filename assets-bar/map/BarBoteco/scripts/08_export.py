# Export para o jogo web:
#   export/bar_boteco.glb          visual: geometria estatica fundida por area/material + pedacos (chunks) do bairro
#                                  + objetos repetidos via EXT_mesh_gpu_instancing (cadeiras, mesas, copos, arvores...)
#   export/bar_boteco_draco.glb    o mesmo com compressao Draco (requer DRACOLoader)
#   export/bar_boteco_colisao.glb  caixas de colisao (COL_*: escala = tamanho) + pivos das portas (COLPORTA_*)
import os, json, struct, math
import bpy
from mathutils import Matrix
import barlib as B

os.makedirs(B.EXPORT_DIR, exist_ok=True)
scn = bpy.context.scene
vl = bpy.context.view_layer
GRUPOS_BAR = {
    "Bar_Estrutura": ["Predio_Estrutura"],
    "Bar_Mobilia": ["Interior_Terreo", "Varanda_Mobiliario", "Interior_Superior", "Terraco_Mobiliario", "Quintal_Mobiliario"],
}
EXTERIOR = ["Exterior_Rua", "Exterior_Vizinhanca", "Exterior_Mobiliario"]
DISTANTE = ["Exterior_Distante"]
LINKAR = ["Portas", "Iluminacao", "Marcadores", "Interativos", "Interativos_Bar"]   # nos separados (o jogo acha pelo nome)
INST_MIN = 6                                   # malhas usadas >= 6 vezes viram instancias de GPU...
INST_PREFIXOS = ("A_", "P_Arvore", "P_Canteiro")  # ...so as pesadas/numerosas; o resto vai pro lote estatico
CHUNKS = 1                                     # 1 = bairro num lote so (menos draw calls); 3 = pedacos 3x3 p/ frustum culling
q = B.quadra
X0, X1, Y0, Y1 = q(-3, 0)[0], q(3, 0)[1], q(0, -3)[2], q(0, 3)[3]


def tmp_coll(name):
    c = bpy.data.collections.get(name)
    if c:
        for o in list(c.objects):
            c.objects.unlink(o)
    else:
        c = bpy.data.collections.new(name)
    if c.name not in scn.collection.children.keys():
        scn.collection.children.link(c)
    return c


def drop_coll(c, delete_objects):
    for o in list(c.objects):
        if delete_objects:
            me = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if me is not None and getattr(me, "users", 1) == 0 and isinstance(me, bpy.types.Mesh):
                bpy.data.meshes.remove(me)
        else:
            c.objects.unlink(o)
    bpy.data.collections.remove(c)


def set_active(c):
    def find(lc):
        if lc.collection == c:
            return lc
        for ch in lc.children:
            r = find(ch)
            if r:
                return r
    vl.active_layer_collection = find(vl.layer_collection)


def gltf(path, **kw):
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    opts = dict(filepath=path, export_format='GLB', use_active_collection=True, use_active_collection_with_nested=True,
                export_apply=True, export_yup=True, export_texcoord=True, export_normals=True, export_tangents=False,
                export_materials='EXPORT', export_image_format='AUTO', export_cameras=False, export_lights=True,
                export_extras=True, export_animations=False, export_skins=False, export_morph=False,
                export_attributes=False, export_gpu_instances=True, will_save_settings=False)
    opts.update(kw)
    bpy.ops.export_scene.gltf(**{k: v for k, v in opts.items() if k in props})


def resumo_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    ln = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + ln])


def objs_de(cols):
    out = []
    for cn in cols:
        c = bpy.data.collections.get(cn)
        if c:
            out += [o for o in c.all_objects if o.type == 'MESH' and o.data.polygons]
    return out


def juntar(nome, objs, destino):
    copias = []
    for o in objs:
        me = o.data.copy()
        me.transform(o.matrix_world)
        c = bpy.data.objects.new(nome + "_tmp", me)
        destino.objects.link(c)
        copias.append(c)
    if not copias:
        return None
    with bpy.context.temp_override(active_object=copias[0], object=copias[0], selected_objects=copias,
                                   selected_editable_objects=copias):
        bpy.ops.object.join()
    j = copias[0]
    j.name = nome
    j.data.name = nome
    return j


# ------------------------------------------------------------------ 1) visual
if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
vl.update()
exp = tmp_coll("_EXPORT")
todos = {}
for g, cols in GRUPOS_BAR.items():
    for o in objs_de(cols):
        todos[o.name] = (o, g)
from mathutils import Vector
for o in objs_de(EXTERIOR):
    if CHUNKS <= 1:
        todos[o.name] = (o, "Mapa_Bairro")
        continue
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    mx = sum(v.x for v in bb) / 8; my = sum(v.y for v in bb) / 8
    ix = min(CHUNKS - 1, max(0, int((mx - X0) / ((X1 - X0) / CHUNKS))))
    iy = min(CHUNKS - 1, max(0, int((my - Y0) / ((Y1 - Y0) / CHUNKS))))
    todos[o.name] = (o, "Mapa_Pedaco_%d_%d" % (ix, iy))
for o in objs_de(DISTANTE):
    todos[o.name] = (o, "Fundo_Distante")
usos = {}
for (o, g) in todos.values():
    usos[o.data.name] = usos.get(o.data.name, 0) + 1
instanciar = {m for m, n in usos.items() if n >= INST_MIN and m.startswith(INST_PREFIXOS)}
grupos = {}
n_inst = {}
raiz_inst = {}
for (o, g) in todos.values():
    if o.data.name in instanciar:
        e = raiz_inst.get(o.data.name)
        if e is None:
            e = bpy.data.objects.new("INST_" + o.data.name, None)
            exp.objects.link(e)
            raiz_inst[o.data.name] = e
        c = bpy.data.objects.new(o.data.name + "_%d" % n_inst.get(o.data.name, 0), o.data)
        n_inst[o.data.name] = n_inst.get(o.data.name, 0) + 1
        exp.objects.link(c)
        c.parent = e
        c.matrix_world = o.matrix_world.copy()
    else:
        grupos.setdefault(g, []).append(o)
stats = {}
for g, objs in sorted(grupos.items()):
    j = juntar(g, objs, exp)
    if j:
        j.data.calc_loop_triangles()
        stats[g] = (len(j.data.loop_triangles), len({p.material_index for p in j.data.polygons}))
for cn in LINKAR:
    for o in bpy.data.collections[cn].objects:
        # Interactive props must remain renderable even when their parent also owns empty FX anchors.
        # A hidden cart previously exported as only an empty node, leaving fire floating in the street.
        if o.type == 'MESH' and o.data and o.data.polygons:
            o.hide_render = False
        exp.objects.link(o)
set_active(exp)
vl.update()
extras_addon = {k: scn[k] for k in list(scn.keys()) if k.startswith("blendermcp")}       # nao vazar props do addon no glTF
for k in extras_addon:
    del scn[k]
out = os.path.join(B.EXPORT_DIR, "bar_boteco.glb")
try:
    gltf(out)
    exported = resumo_glb(out)
    cart = next((n for n in exported.get('nodes', []) if n.get('name') == 'Carrinho_Espeto'), None)
    if not cart or 'mesh' not in cart:
        raise RuntimeError('Carrinho_Espeto foi exportado sem malha renderizavel')
    gltf(os.path.join(B.EXPORT_DIR, "bar_boteco_draco.glb"), export_draco_mesh_compression_enable=True,
         export_draco_mesh_compression_level=6, export_image_format='WEBP', export_image_quality=82)
finally:
    for k, v in extras_addon.items():
        scn[k] = v
for cn in LINKAR:
    for o in bpy.data.collections[cn].objects:
        exp.objects.unlink(o)
for o in list(exp.objects):
    if o.name.startswith(("INST_",)) or o.parent is not None:
        bpy.data.objects.remove(o, do_unlink=True)
drop_coll(exp, delete_objects=True)

# ------------------------------------------------------------------ 2) colisao
colc = bpy.data.collections["Colisores"]
colc.hide_viewport = False
vl.update()
ce = tmp_coll("_EXPORT_COL")
for o in colc.objects:
    ce.objects.link(o)
set_active(ce)
outc = os.path.join(B.EXPORT_DIR, "bar_boteco_colisao.glb")
for k in extras_addon:
    del scn[k]
try:
    gltf(outc, export_materials='NONE', export_lights=False, export_normals=False, export_texcoord=False, export_gpu_instances=False)
finally:
    for k, v in extras_addon.items():
        scn[k] = v
drop_coll(ce, delete_objects=False)
colc.hide_viewport = True
set_active(bpy.data.collections["Bar_Boteco"])

# ------------------------------------------------------------------ 3) relatorio
js = resumo_glb(out)
jc = resumo_glb(outc)
prims = sum(len(m['primitives']) for m in js.get('meshes', []))
tri_inst = 0
for mname, n in n_inst.items():
    me = bpy.data.meshes[mname]
    me.calc_loop_triangles()
    tri_inst += len(me.loop_triangles) * n
tri_static = sum(t for t, _ in stats.values())
print("ESTATICO (tris, materiais):", stats)
print("INSTANCIADO: %d malhas, %d instancias, %d tris desenhados" % (len(n_inst), sum(n_inst.values()), tri_inst))
print("tris estaticos %d | tris total desenhado %d | primitivas %d | materiais %d | imagens %d | nos %d"
      % (tri_static, tri_static + tri_inst, prims, len(js.get('materials', [])), len(js.get('images', [])), len(js.get('nodes', []))))
print("extensoes usadas:", js.get('extensionsUsed'), "| obrigatorias:", js.get('extensionsRequired'))
print("cena extras:", js['scenes'][0].get('extras'))
print("colisao: nos %d | portas com pivo %d" % (len(jc.get('nodes', [])), sum(1 for n in jc['nodes'] if n.get('name', '').startswith('COLPORTA_'))))
for f in sorted(os.listdir(B.EXPORT_DIR)):
    print("  %-28s %7.2f MB" % (f, os.path.getsize(os.path.join(B.EXPORT_DIR, f)) / 1e6))
