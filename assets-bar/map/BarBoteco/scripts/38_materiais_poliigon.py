# Liga as texturas Poliigon (pol_*.jpg do 37_texturas_poliigon.py) aos materiais do bar.
# Ordem: depois do 36_bar_polimento (que recria os Pol_*) e antes do 39/40/41. Pode rodar de novo a cada zip novo
# baixado (rode o 37 antes): so muda o que mudou.
# Escala: as UVs do pipeline estao em metros/tile do material (barlib._auto_uv). Quando um slot vem da Poliigon,
# o tile do material passa a ser o tamanho fisico da foto e as UVs das faces com esse material sao reescaladas
# (old_tile / new_tile) em todas as malhas, inclusive as da cidade que dividem o material.
# Slot ainda provisorio (copia da textura antiga) mantem o tile original de cada material.
# Rodar o 02_materiais de novo desfaz isto (volta texturas e tiles antigos): rode o 38 em seguida.
import json, os
import bpy
import numpy as np
import barlib as B

ST = json.load(open(os.path.join(B.TEX_DIR, "pol_status.json"), encoding="utf8"))

# material: (slot, fator de cor, rugosidade, metal, forca do normal)
MAPA = {
    "Tijolo":              ("pol_tijolo", (1, 1, 1), 0.9, 0.0, 0.8),
    "Pol_Tijolo":          ("pol_tijolo", (1, 1, 1), 0.9, 0.0, 0.8),
    "Pol_Tijolo_Fuligem":  ("pol_tijolo", (0.26, 0.23, 0.21), 0.95, 0.0, 0.8),
    "Reboco_Ocre":         ("pol_reboco", (0.86, 0.60, 0.22), 0.92, 0.0, 0),
    "Reboco_Creme":        ("pol_reboco", (0.93, 0.87, 0.74), 0.92, 0.0, 0),
    "Reboco_Branco":       ("pol_reboco", (1, 1, 1), 0.92, 0.0, 0),
    "Reboco_Marrom":       ("pol_reboco", (0.36, 0.20, 0.12), 0.9, 0.0, 0),
    "Reboco_Verde":        ("pol_reboco", (0.66, 0.78, 0.62), 0.92, 0.0, 0),
    "Reboco_Azul":         ("pol_reboco", (0.60, 0.72, 0.86), 0.92, 0.0, 0),
    "Reboco_Rosa":         ("pol_reboco", (0.92, 0.70, 0.64), 0.92, 0.0, 0),
    "Reboco_Vermelho":     ("pol_reboco", (0.62, 0.10, 0.08), 0.9, 0.0, 0),
    "Concreto":            ("pol_concreto", (1, 1, 1), 0.95, 0.0, 0),
    "Cimento_Queimado":    ("pol_microcimento", (0.85, 0.86, 0.85), 0.55, 0.0, 0),
    "Madeira":             ("pol_carvalho", (1, 1, 1), 0.6, 0.0, 0),
    "Madeira_Escura":      ("pol_madeira_escura", (1, 1, 1), 0.5, 0.0, 0),
    "Piso_Palco":          ("pol_madeira_escura", (0.8, 0.8, 0.8), 0.55, 0.0, 0),
    "Forro":               ("pol_freixo", (0.85, 0.75, 0.65), 0.7, 0.0, 0),
    "Piso_Madeira":        ("pol_carvalho", (0.80, 0.66, 0.54), 0.45, 0.0, 0),
    "Pol_Madeira_Verniz":  ("pol_carvalho", (1, 1, 1), 0.38, 0.0, 0),
    "Pol_Madeira_Escura":  ("pol_madeira_escura", (1, 1, 1), 0.45, 0.0, 0),
    "Pol_Madeira_Rustica": ("pol_freixo", (0.70, 0.55, 0.40), 0.8, 0.0, 0),
    "Azulejo":             ("pol_azulejo", (1, 1, 1), 0.2, 0.0, 0),
    "Piso_Ceramico":       ("pol_piso", (1, 1, 1), 0.4, 0.0, 0),
    "Pol_Granito":         ("pol_granito", (0.55, 0.55, 0.57), 0.22, 0.0, 0),
    "Granito_Preto":       ("pol_granito", (0.55, 0.55, 0.57), 0.2, 0.0, 0),
    "Pol_Inox":            ("pol_inox", (1, 1, 1), 0.3, 0.9, 0),
    "Inox":                ("pol_inox", (1, 1, 1), 0.28, 1.0, 0),
    "Pol_Ferro":           ("pol_metal_preto", (1, 1, 1), 0.5, 0.6, 0),
    "Metal_Escuro":        ("pol_metal_preto", (1, 1, 1), 0.45, 0.5, 0),
    "Metal_Ondulado":      ("pol_metal_ondulado", (0.85, 0.87, 0.9), 0.45, 0.6, 1.0),
    "Portao_Verde":        ("pol_metal_ondulado", (0.30, 0.50, 0.32), 0.5, 0.4, 1.0),
    "Pol_Feltro":          ("pol_feltro", (1, 1, 1), 0.95, 0.0, 0),
    "Feltro_Verde":        ("pol_feltro", (1, 1, 1), 0.95, 0.0, 0),
    "Tapete_Palco":        ("pol_tapete", (0.40, 0.09, 0.08), 0.95, 0.0, 0),
    "Tecido_Amp":          ("pol_tecido", (0.09, 0.09, 0.09), 0.9, 0.0, 0),
    "Plastico_Branco":     ("pol_plastico", (0.90, 0.90, 0.88), 0.4, 0.0, 0),
    "Plastico_Vermelho":   ("pol_plastico", (0.72, 0.05, 0.04), 0.45, 0.0, 0),
    "Plastico_Amarelo":    ("pol_plastico", (0.90, 0.68, 0.05), 0.5, 0.0, 0),
    "Plastico_Laranja":    ("pol_plastico", (0.95, 0.35, 0.04), 0.5, 0.0, 0),
    "Grama":               ("pol_grama", (1, 1, 1), 0.95, 0.0, 0),
    "Terra_Batida":        ("pol_terra", (1, 1, 1), 1.0, 0.0, 0.8),
    "Asfalto":             ("pol_asfalto", (1, 1, 1), 0.95, 0.0, 0),
}
# materiais novos dos props refeitos (39 carrinho, 40 guarda-corpo, 41 geladeira)
NOVOS = {
    "Pgn_Inox":           ("pol_inox", (1, 1, 1), 0.32, 0.9, 0),
    "Pgn_Metal_Preto":    ("pol_metal_preto", (1, 1, 1), 0.55, 0.7, 0),
    "Pgn_Ferrugem":       ("pol_ferrugem", (0.55, 0.45, 0.40), 0.9, 0.3, 0),
    "Pgn_Madeira":        ("pol_carvalho", (1, 1, 1), 0.42, 0.0, 0),
    "Pgn_Madeira_Escura": ("pol_madeira_escura", (1, 1, 1), 0.35, 0.0, 0),
    "Pgn_Plastico_Preto": ("pol_plastico_preto", (1, 1, 1), 0.55, 0.0, 0),
    "Pgn_Plastico_Branco": ("pol_plastico", (0.92, 0.92, 0.90), 0.35, 0.0, 0),
    "Pgn_Plastico_Vermelho": ("pol_plastico", (0.75, 0.05, 0.04), 0.4, 0.0, 0),
}


def tile_de(slot, mat):
    if ST[slot]["origem"] == "poliigon":
        return ST[slot]["tile"]
    m = bpy.data.materials.get(mat)
    return m.get("tile_u", 1.0) if m else 1.0


novos_tiles = {}
for nome, (slot, cor, rough, metal, nstr) in {**MAPA, **NOVOS}.items():
    m = bpy.data.materials.get(nome)
    if m is None and nome in MAPA:
        continue
    old = (m.get("tile_u", 1.0), m.get("tile_v", 1.0)) if m else None
    t = tile_de(slot, nome)
    nrm = ST[slot].get("normal") if nstr else None
    B.material(nome, tex=slot + ".jpg", color=cor, tile=(t, t), rough=rough, metal=metal,
               normal=nrm, nstr=nstr or 1.0, double=(m.use_backface_culling is False) if m else False)
    if old and (abs(old[0] - t) > 1e-6 or abs(old[1] - t) > 1e-6):
        novos_tiles[nome] = (old[0] / t, old[1] / t)

# reescala as UVs das faces que usam os materiais com tile novo
for img in bpy.data.images:                                  # o 37 regravou os arquivos: recarrega os pixels
    if img.name.startswith("pol_") and img.filepath:
        img.reload()

n_malhas = 0
for me in bpy.data.meshes:
    fat = [novos_tiles.get(m.name) if m else None for m in me.materials]
    if not any(fat) or not me.uv_layers or not me.polygons:
        continue
    n_malhas += 1
    tab = np.array([f or (1.0, 1.0) for f in fat] + [(1.0, 1.0)], np.float32)   # ultimo: indice fora da lista
    np_ = len(me.polygons)
    mi = np.empty(np_, np.int32); me.polygons.foreach_get("material_index", mi)
    tot = np.empty(np_, np.int32); me.polygons.foreach_get("loop_total", tot)
    mi = np.where(mi < len(fat), mi, len(fat))
    ini = np.empty(np_, np.int32); me.polygons.foreach_get("loop_start", ini)
    ordem = np.argsort(ini, kind="stable")
    f_loop = np.repeat(tab[mi[ordem]], tot[ordem], axis=0)  # fator por loop, na ordem dos loops
    for uvl in me.uv_layers:
        uv = np.empty(len(me.loops) * 2, np.float32)
        uvl.data.foreach_get("uv", uv)
        uv = (uv.reshape(-1, 2) * f_loop).ravel()
        uvl.data.foreach_set("uv", uv)
    me.update()

prov = sorted({s for s, i in ST.items() if i["origem"] != "poliigon"})
print("materiais:", len(MAPA) + len(NOVOS), "| tiles reescalados:", len(novos_tiles), "em", n_malhas, "malhas")
print("slots Poliigon:", len(ST) - len(prov), "| provisorios:", len(prov), prov)
