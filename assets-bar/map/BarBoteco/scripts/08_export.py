# Exporta o mapa para o jogo web:
#   export/bar_boteco.glb          -> visual otimizado (geometria estatica fundida por area/material)
#   export/bar_boteco_draco.glb    -> mesmo conteudo com compressao Draco (requer DRACOLoader)
#   export/bar_boteco_colisao.glb  -> so caixas de colisao (nos COL_* com escala = tamanho da caixa)
import os, json, struct
import bpy
import barlib as B

os.makedirs(B.EXPORT_DIR, exist_ok=True)
scn = bpy.context.scene
GRUPOS = {
    "Mapa_Exterior": ["Exterior_Rua", "Exterior_Vizinhanca", "Exterior_Mobiliario"],
    "Bar_Estrutura": ["Predio_Estrutura"],
    "Bar_Terreo_Mobilia": ["Interior_Terreo", "Varanda_Mobiliario"],
    "Bar_Superior_Mobilia": ["Interior_Superior", "Terraco_Mobiliario"],
    "Bar_Quintal_Mobilia": ["Quintal_Mobiliario"],
}
LINKAR = ["Portas", "Iluminacao", "Marcadores"]      # exportados como nos separados (sem fundir)


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
            if me is not None and me.users == 0:
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
    bpy.context.view_layer.active_layer_collection = find(bpy.context.view_layer.layer_collection)


def gltf(path, **kw):
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    opts = dict(filepath=path, export_format='GLB', use_active_collection=True, export_apply=True,
                export_yup=True, export_texcoord=True, export_normals=True, export_tangents=False,
                export_materials='EXPORT', export_image_format='AUTO', export_cameras=False,
                export_lights=True, export_extras=True, export_animations=False, export_skins=False,
                export_morph=False, export_attributes=False, will_save_settings=False)
    opts.update(kw)
    bpy.ops.export_scene.gltf(**{k: v for k, v in opts.items() if k in props})


def resumo_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    ln = struct.unpack_from('<I', data, 12)[0]
    js = json.loads(data[20:20 + ln])
    prims = sum(len(m['primitives']) for m in js.get('meshes', []))
    return js, prims


# ------------------------------------------------------------------ 1) visual otimizado
bpy.ops.object.mode_set(mode='OBJECT') if bpy.context.object and bpy.context.object.mode != 'OBJECT' else None
exp = tmp_coll("_EXPORT")
stats = {}
for gname, cols in GRUPOS.items():
    copies = []
    for cn in cols:
        for o in bpy.data.collections[cn].all_objects:
            if o.type != 'MESH' or not o.data.polygons:
                continue
            me = o.data.copy()
            me.transform(o.matrix_world)
            c = bpy.data.objects.new(gname + "_tmp", me)
            exp.objects.link(c)
            copies.append(c)
    with bpy.context.temp_override(active_object=copies[0], object=copies[0],
                                   selected_objects=copies, selected_editable_objects=copies):
        bpy.ops.object.join()
    j = copies[0]
    j.name = gname
    j.data.name = gname
    j.data.calc_loop_triangles()
    used = {p.material_index for p in j.data.polygons}
    stats[gname] = (len(j.data.loop_triangles), len(used))
for cn in LINKAR:
    for o in bpy.data.collections[cn].objects:
        exp.objects.link(o)
set_active(exp)
out = os.path.join(B.EXPORT_DIR, "bar_boteco.glb")
gltf(out)
gltf(os.path.join(B.EXPORT_DIR, "bar_boteco_draco.glb"), export_draco_mesh_compression_enable=True,
     export_draco_mesh_compression_level=6)
for cn in LINKAR:
    for o in bpy.data.collections[cn].objects:
        exp.objects.unlink(o)
drop_coll(exp, delete_objects=True)

# ------------------------------------------------------------------ 2) colisao
colc = bpy.data.collections["Colisores"]
colc.hide_viewport = False
ce = tmp_coll("_EXPORT_COL")
for o in colc.objects:
    ce.objects.link(o)
set_active(ce)
outc = os.path.join(B.EXPORT_DIR, "bar_boteco_colisao.glb")
gltf(outc, export_materials='NONE', export_lights=False, export_normals=False, export_texcoord=False)
drop_coll(ce, delete_objects=False)
colc.hide_viewport = True
set_active(bpy.data.collections["Bar_Boteco"])

# ------------------------------------------------------------------ 3) relatorio
js, prims = resumo_glb(out)
tris = sum(t for t, _ in stats.values())
print("GRUPOS (triangulos, materiais):", stats)
print("total triangulos: %d | primitivas (draw calls estaticos+portas): %d | materiais: %d | texturas: %d | nos: %d | luzes: %d"
      % (tris, prims, len(js.get('materials', [])), len(js.get('images', [])), len(js.get('nodes', [])),
         len(js.get('extensions', {}).get('KHR_lights_punctual', {}).get('lights', []))))
print("extensoes:", js.get('extensionsUsed'), "| obrigatorias:", js.get('extensionsRequired'))
print("imagens:", sorted({(i.get('name'), i.get('mimeType')) for i in js.get('images', [])}))
for m in js['materials']:
    if m['name'] in ("Reboco_Ocre", "Vidro", "Lampada", "Tela_TV"):
        print("  mat", m['name'], {k: v for k, v in m.items() if k != 'name'})
for f in sorted(os.listdir(B.EXPORT_DIR)):
    print("  %-28s %7.2f MB" % (f, os.path.getsize(os.path.join(B.EXPORT_DIR, f)) / 1e6))
