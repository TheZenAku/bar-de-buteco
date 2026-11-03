# Paredes e escada do bar. Roda no Blender do mapa (exec pelo MCP), depois do 38_materiais_poliigon e do 43_texturas_bar.
#   - Bar_Reboco_{Ocre,Creme,Branco,Marrom}: reboco com relevo (bar_reboco.jpg + normal, tile 1,2 m) so nas malhas do bar.
#     Os Reboco_* originais continuam na cidade/bairro (centenas de malhas), que nao mudam. As UVs das faces trocadas
#     sao reescaladas do tile antigo para 1,2 m (mesma regra do 38).
#   - Predio_Escada refeita: degraus e patamar de granito com bocel chanfrado (2,5 cm de balanco sobre o espelho),
#     espelhos de reboco. Mesmos niveis, pisadas e espelhos do 04_predio: as colisoes (COL_Predio_Escada_*) continuam.
# Idempotente: rodar de novo so refaz o que ja e do bar.
import sys
import bpy
import numpy as np

DIR = r"C:\Users\rafael\BarBoteco\scripts"
if DIR not in sys.path:
    sys.path.insert(0, DIR)
import barlib as B
import pollib as P

BAR = {"Predio_Estrutura", "Interior_Terreo", "Interior_Superior", "Varanda_Mobiliario", "Terraco_Mobiliario",
       "Quintal_Mobiliario", "Palco", "Portas", "Mesas", "Interativos_Bar", "Interativos", "Iluminacao"}
TILE = 1.2
# material: (fator de cor, rugosidade) - as mesmas cores do 38_materiais_poliigon
REBOCOS = {
    "Reboco_Ocre":   ((0.86, 0.60, 0.22), 0.92),
    "Reboco_Creme":  ((0.93, 0.87, 0.74), 0.92),
    "Reboco_Branco": ((1.0, 1.0, 1.0), 0.92),
    "Reboco_Marrom": ((0.36, 0.20, 0.12), 0.9),
}


def materiais():
    for nome, (cor, rough) in REBOCOS.items():
        B.material("Bar_" + nome, tex="bar_reboco.jpg", color=cor, tile=(TILE, TILE), rough=rough,
                   normal="bar_reboco_n.jpg", nstr=1.0)
    for img in bpy.data.images:                                # o 43 regravou/reduziu os arquivos: recarrega
        if img.filepath and not img.packed_file and img.name.startswith(("bar_reboco", "pol_", "telha")):
            img.reload()


def malhas_do_bar():
    col_de = {}
    for c in bpy.data.collections:
        for o in c.objects:
            col_de.setdefault(o, set()).add(c.name)
    usos = {}
    for o in bpy.data.objects:
        if o.type == 'MESH':
            usos.setdefault(o.data, []).append(bool(col_de.get(o, set()) & BAR))
    out = []
    for me, flags in usos.items():
        if all(flags):
            out.append(me)
        elif any(flags) and any(m and m.name in REBOCOS for m in me.materials):
            print("  aviso: malha %s e do bar e de fora; nao mexi" % me.name)
    return out


def trocar_reboco(me):
    """Troca Reboco_X por Bar_Reboco_X nos slots da malha e reescala a UV dessas faces para o tile novo."""
    fat = []
    for i, m in enumerate(me.materials):
        if m and m.name in REBOCOS:
            novo = bpy.data.materials["Bar_" + m.name]
            fat.append((m.get("tile_u", 1.0) / TILE, m.get("tile_v", 1.0) / TILE))
            me.materials[i] = novo
        else:
            fat.append(None)
    if not any(fat) or not me.uv_layers:
        return 0
    tab = np.array([f or (1.0, 1.0) for f in fat] + [(1.0, 1.0)], np.float32)
    n = len(me.polygons)
    mi = np.empty(n, np.int32); me.polygons.foreach_get("material_index", mi)
    tot = np.empty(n, np.int32); me.polygons.foreach_get("loop_total", tot)
    ini = np.empty(n, np.int32); me.polygons.foreach_get("loop_start", ini)
    mi = np.where(mi < len(fat), mi, len(fat))
    ordem = np.argsort(ini, kind="stable")
    f_loop = np.repeat(tab[mi[ordem]], tot[ordem], axis=0)
    for uvl in me.uv_layers:
        uv = np.empty(len(me.loops) * 2, np.float32)
        uvl.data.foreach_get("uv", uv)
        uvl.data.foreach_set("uv", (uv.reshape(-1, 2) * f_loop).ravel())
    me.update()
    return sum(1 for f in fat if f)


# ------------------------------------------------------------------ escada em U (mesmas medidas do 04_predio)
SX, SY = 13.25, 11.65
R, T = 0.175, 0.27
ZP = B.Z_PISO
NOS, ES, CH = 0.025, 0.03, 0.008                # balanco do bocel, espessura da pedra, chanfro
GR, CR = "Granito_Preto", "Bar_Reboco_Creme"


def degrau(m, x0, x1, y_esp, d, z_base, z_top, y_fim):
    """Espelho de reboco no plano y_esp (virado para d = -1/+1 em Y) + pedra com bocel por cima ate y_fim."""
    yf = y_esp + d * NOS
    yc = yf - d * CH
    zb = z_top - ES
    if zb - z_base > 1e-4:
        m.face([(x0, y_esp, z_base), (x1, y_esp, z_base), (x1, y_esp, zb), (x0, y_esp, zb)], CR, facing=(0, d, 0))
    m.face([(x0, y_esp, zb), (x1, y_esp, zb), (x1, yf, zb), (x0, yf, zb)], GR, facing=(0, 0, -1))
    m.face([(x0, yf, zb), (x1, yf, zb), (x1, yf, z_top - CH), (x0, yf, z_top - CH)], GR, facing=(0, d, 0))
    m.face([(x0, yf, z_top - CH), (x1, yf, z_top - CH), (x1, yc, z_top), (x0, yc, z_top)], GR, facing=(0, d, 1))
    m.face([(x0, yc, z_top), (x1, yc, z_top), (x1, y_fim, z_top), (x0, y_fim, z_top)], GR, facing=(0, 0, 1))


def escada():
    m = B.Mesh("Predio_Escada")
    for i in range(8):                                         # 1o lance, sobe para +Y
        y = SY + i * T
        degrau(m, SX, SX + 1.5, y, -1, ZP + R * i, ZP + R * (i + 1), y + T)
    zpat = ZP + 9 * R                                          # patamar: bocel so na frente do 1o lance
    degrau(m, SX, SX + 1.5, SY + 8 * T, -1, ZP + 8 * R, zpat, 14.8)
    m.face([(SX + 1.5, SY + 2.16, zpat), (SX + 3.2, SY + 2.16, zpat), (SX + 3.2, 14.8, zpat), (SX + 1.5, 14.8, zpat)], GR,
           facing=(0, 0, 1))
    for j in range(8):                                         # 2o lance, volta para -Y
        y = SY + 2.16 - j * T
        degrau(m, SX + 1.7, SX + 3.2, y, 1, zpat + R * j, zpat + R * (j + 1), y - T)
    # fundo do 2o lance, visto do salao por baixo da laje (fecha o volume embaixo dos degraus)
    m.face([(SX + 1.7, SY, ZP), (SX + 3.2, SY, ZP), (SX + 3.2, SY, zpat + 8 * R), (SX + 1.7, SY, zpat + 8 * R)], CR,
           facing=(0, -1, 0))
    return P.substituir("Predio_Escada", m)


MAPA = next(s for s in bpy.data.scenes if "Bar_Boteco" in s.collection.children)
with bpy.context.temp_override(scene=MAPA, view_layer=MAPA.view_layers[0]):
    materiais()
    feitas = []
    for me in malhas_do_bar():
        k = trocar_reboco(me)
        if k:
            feitas.append("%s(%d)" % (me.name, k))
    me = escada()
    print("reboco do bar em:", ", ".join(feitas) or "nada novo")
    print("Predio_Escada: %d faces, materiais %s" % (len(me.polygons), [m.name for m in me.materials]))
