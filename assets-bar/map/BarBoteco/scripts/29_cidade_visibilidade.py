# Alterna a visibilidade da viewport entre:
#   MODO = "tudo"     -> mostra a cidade inteira com o bar e o bairro original (colisores e LODs continuam ocultos)
#   MODO = "usuario"  -> restaura exatamente o estado de visibilidade que o arquivo tinha antes da cidade
#                        (gravado em scene["cid_vis_usuario"] na primeira execucao das etapas da cidade)
# Uso no Blender MCP: MODO = "tudo"; exec(open(r"C:\Users\rafael\BarBoteco\scripts\29_cidade_visibilidade.py").read())
import bpy, json

MODO = globals().get("MODO", "tudo")
scn = bpy.context.scene
estado = json.loads(scn["cid_vis_usuario"])
SEMPRE_OCULTAS = {"Colisores"}


def walk(lc, fn):
    fn(lc)
    for ch in lc.children:
        walk(ch, fn)


if MODO == "usuario":
    def aplica(lc):
        v = estado["layers"].get(lc.collection.name)
        if v is not None:
            lc.hide_viewport, lc.exclude = v[0], v[1]
    walk(bpy.context.view_layer.layer_collection, aplica)
    ocultos = set(estado["objs_ocultos"])
    for o in bpy.context.view_layer.objects:
        if o.name in ocultos:
            o.hide_set(True)
else:
    def aplica(lc):
        nome = lc.collection.name
        if nome in estado["layers"] and nome not in SEMPRE_OCULTAS and not estado["layers"][nome][1]:
            lc.hide_viewport = False
    walk(bpy.context.view_layer.layer_collection, aplica)
    for nome in estado["objs_ocultos"]:
        o = bpy.data.objects.get(nome)
        if o and o.name in bpy.context.view_layer.objects and o.hide_get():
            o.hide_set(False)
print("visibilidade:", MODO)
