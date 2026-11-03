# Remove os carros estaticos (bairro original + cidade) e as caixas de colisao deles.
# Os carros agora sao veiculos reais do jogo; nada de carro parado fundido no mapa.
#   visuais:   objetos com malha P_Carro_*, P_Sedan_*, K_Carreta (Exterior_Mobiliario e CITY_Sxx_yy_PROPS)
#   colisao:   COL_Ext_Carro_*, COL_Cid_Carro*, COL_Cid_Carreta*
#   LOD:       K_Carro_LOD1 (so existia para os carros)
# Pode rodar de novo sem efeito (idempotente).
import bpy, bmesh

MALHAS = ("P_Carro_", "P_Sedan_", "K_Carreta", "K_Carro_LOD1")
COLS = ("COL_Ext_Carro_", "COL_Cid_Carro", "COL_Cid_Carreta")
n_vis = n_col = 0
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.data.name.startswith(MALHAS):
        bpy.data.objects.remove(o, do_unlink=True)
        n_vis += 1
    elif o.name.startswith(COLS):
        bpy.data.objects.remove(o, do_unlink=True)
        n_col += 1
n_me = 0
for me in list(bpy.data.meshes):
    if me.name.startswith(MALHAS):
        me.use_fake_user = False
        if me.users == 0:
            bpy.data.meshes.remove(me)
            n_me += 1
for me in bpy.data.meshes:                                  # nenhuma malha pode apontar para o LOD removido
    if me.get("lod1") == "K_Carro_LOD1":
        del me["lod1"]
# sombras de contato dos carros do bairro (07_exterior: quad 4,8 x 2,3 m no asfalto, z = 0,012; as demais ficam na calcada)
n_sb = 0
for o in bpy.data.objects:
    if o.type != 'MESH' or not o.name.startswith("Sombras"):
        continue
    mi = [i for i, m in enumerate(o.data.materials) if m and m.name == "Sombra_Contato"]
    if not mi:
        continue
    bm = bmesh.new()
    bm.from_mesh(o.data)
    mw = o.matrix_world
    rm = [f for f in bm.faces if f.material_index in mi and len(f.verts) == 4
          and max((mw @ v.co).z for v in f.verts) < 0.05 and 10.0 < f.calc_area() < 12.0]
    if rm:
        bmesh.ops.delete(bm, geom=rm, context='FACES')
        bm.to_mesh(o.data)
        n_sb += len(rm)
    bm.free()
print("carros removidos: %d objetos visuais, %d colisores, %d malhas, %d sombras" % (n_vis, n_col, n_me, n_sb))
