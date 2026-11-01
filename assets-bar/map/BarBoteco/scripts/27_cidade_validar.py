# Cidade - validacao: preservacao do bar, spawn, conectividade, buracos no chao, cobertura de colisao, obstaculos
# nas vias, estatisticas por setor (triangulos LOD0/1/2, objetos, colisores, luzes), duplicatas, materiais
# redundantes e texturas grandes. Grava export\cidade\validacao.json.
import bpy, math, json, os, sys, collections
from mathutils import Vector, Matrix
SP = r"C:\Users\rafael\BarBoteco\scripts"
if SP not in sys.path:
    sys.path.insert(0, SP)
import importlib
import barlib as B
import cidadelib as C
importlib.reload(C)

scn = bpy.context.scene
R = {}
ZC = C.ZC
H = C.HALF
G, Q = C.plano()


def tris(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)


# ---------------------------------------------------------------- 1) preservacao do bar e marcadores
hb, nb = C.hash_bar()
R["bar_preservado"] = {"hash_igual": hb == scn.get("cid_hash_bar_original"), "objetos": nb,
                       "objetos_original": scn.get("cid_objs_bar_original")}
sp = bpy.data.objects["Spawn_Jogador"]
R["spawn"] = {"posicao": [round(v, 3) for v in sp.location], "colecao": [c.name for c in sp.users_collection]}
R["marcadores_originais"] = len(bpy.data.collections["Marcadores"].objects)
R["portas_com_pivo"] = sum(1 for o in bpy.data.objects if o.name.startswith("COLPORTA_"))
R["obsoletos"] = collections.Counter(o.get("obsoleto", "?")[:40] for o in bpy.data.collections["_OBSOLETO_Limite_Antigo"].objects)

# ---------------------------------------------------------------- 2) colisores (indice espacial)
cols = []
for o in bpy.data.objects:
    if o.type == 'MESH' and o.data and o.data.name == "COL_cubo" and not o.get("obsoleto"):
        cols.append(o)
grade = collections.defaultdict(list)
for o in cols:
    M = o.matrix_world
    inv = M.inverted()
    cs = [M @ Vector((x, y, z)) for x in (-0.5, 0.5) for y in (-0.5, 0.5) for z in (-0.5, 0.5)]
    x0, x1 = min(c.x for c in cs), max(c.x for c in cs)
    y0, y1 = min(c.y for c in cs), max(c.y for c in cs)
    if x1 - x0 > 150 or y1 - y0 > 150:
        grade["grande"].append((o, inv))
        continue
    for gx in range(int(x0 // 10), int(x1 // 10) + 1):
        for gy in range(int(y0 // 10), int(y1 // 10) + 1):
            grade[(gx, gy)].append((o, inv))


def colisores_em(p, ignorar=("COL_Cid_Chao", "COL_Rua_Leito")):
    out = []
    for (o, inv) in grade.get((int(p.x // 10), int(p.y // 10)), []) + grade["grande"]:
        if o.name.startswith(ignorar):
            continue
        q = inv @ p
        if abs(q.x) <= 0.5 and abs(q.y) <= 0.5 and abs(q.z) <= 0.5:
            out.append(o)
    return out


sp_p = sp.location + Vector((0, 0, 0.9))
R["spawn"]["dentro_de_colisor"] = [o.name for o in colisores_em(sp_p)]

# ---------------------------------------------------------------- 3) conectividade viaria
reais = collections.defaultdict(set)
for (u, v), vi in G.arestas.items():
    if G.tipo(u, v) != 'virt':
        reais[u].add(v); reais[v].add(u)
inicio = min(reais, key=lambda n: (G.nos[n] - Vector((-7.0, -123.0))).length)        # boca da rua do bar no anel
vis = {inicio}
fila = [inicio]
while fila:
    n = fila.pop()
    for m in reais[n]:
        if m not in vis:
            vis.add(m); fila.append(m)
R["vias"] = {"nos_com_rua": len(reais), "alcancaveis_a_partir_do_bar": len(vis), "componentes_isoladas": len(reais) - len(vis),
             "ruas_sem_saida": len([n for n in reais if len(reais[n]) == 1 and not (C.P[0] - 0.5 <= G.nos[n].x <= C.P[1] + 0.5 and C.P[2] - 0.5 <= G.nos[n].y <= C.P[3] + 0.5)]),
             "bocas_no_bairro_original": len([n for n in reais if len(reais[n]) == 1]),
             "arestas_reais": sum(1 for (u, v) in G.arestas if G.tipo(u, v) != 'virt'),
             "km_de_vias": round(sum((G.nos[u] - G.nos[v]).length for (u, v) in G.arestas if G.tipo(u, v) != 'virt') / 1000, 2)}
zonas_ok = {}
for q in Q:
    if q.externa or q.antiga:
        continue
    if any(n in vis for n in q.nos):
        zonas_ok[q.zona] = zonas_ok.get(q.zona, 0) + 1
R["vias"]["quadras_conectadas_por_bairro"] = zonas_ok
# rotas entre os 4 bairros (menor caminho no grafo, metros)
import heapq


def dijkstra(a):
    dist = {a: 0.0}
    h = [(0.0, a)]
    while h:
        d, n = heapq.heappop(h)
        if d > dist[n]:
            continue
        for m in reais[n]:
            nd = d + (G.nos[n] - G.nos[m]).length
            if nd < dist.get(m, 1e18):
                dist[m] = nd; heapq.heappush(h, (nd, m))
    return dist


centros = {"CENTRO": Vector((16, 186)), "OLARIA": Vector((-53, -244)), "CONCEICAO": Vector((-255, 120)), "INDUSTRIAL": Vector((290, 0))}
nos_c = {k: min(reais, key=lambda n: (G.nos[n] - p).length) for k, p in centros.items()}
rotas = {}
for a in centros:
    d = dijkstra(nos_c[a])
    for b in centros:
        if a < b:
            rotas["%s-%s" % (a, b)] = round(d.get(nos_c[b], -1), 1)
R["vias"]["rota_mais_curta_m"] = rotas

# ---------------------------------------------------------------- 4) buracos no chao (raycast) e cobertura de colisao
esconder = []
for nm in ("CITY_DISTANTE", "CITY_ANEL_EXTERNO"):
    for o in bpy.data.collections[nm].all_objects:
        if not o.hide_get():
            o.hide_set(True); esconder.append(o)
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
falhas, alturas, sem_col, amostras_calc = [], collections.Counter(), [], 0
passo = 4.0
x = -H + 2.0
while x < H:
    y = -H + 2.0
    while y < H:
        ok, loc, nrm, idx, ob, _ = scn.ray_cast(dg, Vector((x, y, 60.0)), Vector((0, 0, -1)), distance=120.0)
        if not ok or loc.z < -0.2:
            falhas.append((round(x, 1), round(y, 1)))
        else:
            alturas["%.2f" % round(loc.z, 2) if loc.z < 0.5 else "acima"] += 1
            if abs(loc.z - ZC) < 0.03 or abs(loc.z - (ZC + 0.01)) < 0.03:
                amostras_calc += 1
                if not colisores_em(Vector((x, y, ZC - 0.04))):
                    sem_col.append((round(x, 1), round(y, 1)))
        y += passo
    x += passo
for o in esconder:
    o.hide_set(False)
R["chao"] = {"amostras": int((2 * H / passo) ** 2), "sem_superficie": len(falhas), "exemplos_sem_superficie": falhas[:15],
             "pontos_em_calcada_ou_quadra": amostras_calc, "sem_colisor_na_altura_da_calcada": len(sem_col),
             "pct_cobertura_colisao_calcada": round(100.0 * (1 - len(sem_col) / max(1, amostras_calc)), 1),
             "exemplos_sem_colisor": sem_col[:10]}

# ---------------------------------------------------------------- 5) obstaculos nas vias e no leito
pecas = []
for (u, v), vi in G.arestas.items():
    if G.tipo(u, v) == 'virt':
        continue
    for pc in C.pecas_via(G, Q, u, v):
        pecas.append(pc)
gp = collections.defaultdict(list)
for pc in pecas:
    xs = [p.x for p in pc]; ys = [p.y for p in pc]
    for gx in range(int(min(xs) // 10), int(max(xs) // 10) + 1):
        for gy in range(int(min(ys) // 10), int(max(ys) // 10) + 1):
            gp[(gx, gy)].append(pc)


def na_via(p):
    return any(C.dentro(p, pc) for pc in gp.get((int(p.x // 10), int(p.y // 10)), ()))


bloqueios = collections.Counter()
for o in bpy.data.objects:
    if o.get("cid_etapa") in ("props", "edificios") and o.type == 'MESH' and o.data.name.startswith(("P_", "K_")):
        if o.data.name.startswith(("P_Carro", "P_Sedan", "Rua_PARE")):
            continue
        if na_via(Vector((o.location.x, o.location.y))):
            bloqueios[o.data.name] += 1
col_via = collections.Counter()
for pc in pecas[::3]:
    c = sum(pc, Vector((0, 0))) / 4
    for o in colisores_em(Vector((c.x, c.y, 0.6))):
        if not o.name.startswith(("COL_Cid_Carro", "COL_Cid_Canteiro")):
            col_via[o.name.split(".")[0]] += 1
R["obstaculos"] = {"props_sobre_o_leito": dict(bloqueios), "colisores_no_meio_do_leito": dict(col_via),
                   "largura_livre_minima_calcada_m": round(min(C.VIA[t]['calc'] for t in C.VIA if t != 'virt') - 1.2, 2)}
# colisores novos invadindo ruas do bairro original
inv_ant = []
x0, x1, y0, y1 = C.P
for o in cols:
    if not o.get("cid_etapa") or o.name.startswith(("COL_Cid_Chao", "COL_Cid_Limite", "COL_Cid_Viz_Antiga")):
        continue
    t = o.matrix_world.translation
    if x0 + 1 < t.x < x1 - 1 and y0 + 1 < t.y < y1 - 1:
        inv_ant.append(o.name)
R["obstaculos"]["colisores_novos_dentro_do_bairro_original"] = inv_ant[:20]

# ---------------------------------------------------------------- 6) estatisticas por setor
setor = collections.defaultdict(lambda: collections.Counter())
inst_count = collections.Counter()
for o in bpy.data.objects:
    if o.type not in ('MESH', 'LIGHT', 'EMPTY'):
        continue
    s = o.get("setor")
    if not s or o.get("obsoleto"):
        continue
    if o.type == 'LIGHT':
        setor[s]["luzes"] += 1
        continue
    if o.type == 'EMPTY':
        setor[s]["marcadores"] += 1
        continue
    if o.data.name == "COL_cubo":
        setor[s]["colisores"] += 1
        continue
    t = tris(o.data)
    lod = o.get("lod")
    cn = o.users_collection[0].name if o.users_collection else ""
    if lod == 1 or o.name.endswith("_LOD1"):
        setor[s]["tris_lod1"] += t
    elif lod == 2 or o.name.endswith("_LOD2") or cn.endswith("_LOD"):
        setor[s]["tris_lod2"] += t
    else:
        setor[s]["tris_lod0"] += t
        setor[s]["objetos"] += 1
        if o.data.users > 1:
            inst_count[o.data.name] += 1
            setor[s]["instancias"] += 1
        if not o.get("cid_etapa"):
            setor[s]["tris_lod0_bairro_original"] += t
for ix in range(C.NS):
    for iy in range(C.NS):
        s = C.pref(ix, iy)
        sc = bpy.data.collections.get(C.nome_setor(ix, iy))
        setor[s]["zona"] = C.zona_de(-H + (ix + 0.5) * 100, -H + (iy + 0.5) * 100)
R["setores"] = {k: dict(v) for k, v in sorted(setor.items())}
ordem = sorted(R["setores"].items(), key=lambda kv: -kv[1].get("tris_lod0", 0))
R["setores_mais_pesados"] = [(k, v.get("tris_lod0", 0), v.get("tris_lod0_bairro_original", 0)) for k, v in ordem[:8]]
lod0 = [v.get("tris_lod0", 0) for v in R["setores"].values()]
R["tris_lod0_por_setor"] = {"media": int(sum(lod0) / len(lod0)), "max": max(lod0), "min": min(lod0)}
# anel e distante
R["anel_externo_tris"] = sum(tris(o.data) for o in bpy.data.collections["CITY_ANEL_EXTERNO"].objects)
R["distante_tris"] = sum(tris(o.data) for o in bpy.data.collections["CITY_DISTANTE"].objects)

# ---------------------------------------------------------------- 7) contagens globais, instancias, duplicatas, materiais, texturas
cid_objs = [o for o in bpy.data.objects if o.get("cid_etapa")]
R["global"] = {
    "objetos_total": len(bpy.data.objects), "objetos_cidade_nova": len(cid_objs), "malhas": len(bpy.data.meshes),
    "materiais": len(bpy.data.materials), "materiais_novos_Cid": sum(1 for m in bpy.data.materials if m.name.startswith("Cid_")),
    "imagens": len(bpy.data.images), "luzes": sum(1 for o in bpy.data.objects if o.type == 'LIGHT' and not o.get("obsoleto")),
    "luzes_novas": sum(1 for o in cid_objs if o.type == 'LIGHT'),
    "luzes_com_sombra": [o.name for o in bpy.data.objects if o.type == 'LIGHT' and o.data.use_shadow and o.data.type != 'SUN'],
    "colisores_total": len(cols), "colisores_novos": sum(1 for o in cols if o.get("cid_etapa")),
    "colecoes_setor": sum(1 for c in bpy.data.collections if c.name.startswith("CITY_S")),
    "unidade": [scn.unit_settings.system, scn.unit_settings.scale_length, scn.unit_settings.length_unit]}
R["instanciados_top"] = inst_count.most_common(25)
sig = collections.defaultdict(list)
for me in bpy.data.meshes:
    if me.users == 0 or me.name.startswith(("COL_",)):
        continue
    if not me.vertices:
        continue
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    k = (len(me.vertices), len(me.polygons), round(max(xs) - min(xs), 2), round(max(ys) - min(ys), 2), round(max(zs) - min(zs), 2),
         tuple(m.name if m else "" for m in me.materials))
    sig[k].append(me.name)
R["malhas_duplicadas"] = [v for v in sig.values() if len(v) > 1][:20]


def assinatura(m):
    if not m.use_nodes:
        return ("sem_nos", tuple(round(c, 3) for c in m.diffuse_color))
    bs = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    tex = tuple(sorted(n.image.name for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image))
    mix = [n for n in m.node_tree.nodes if n.type == 'MIX']
    fac = tuple(round(v, 3) for v in [s for s in mix[0].inputs if s.type == 'RGBA'][1].default_value[:3]) if mix else None
    if bs is None:
        return ("outro", tex, fac)
    return (tex, fac, tuple(round(v, 3) for v in bs.inputs['Base Color'].default_value[:3]), round(bs.inputs['Roughness'].default_value, 2),
            round(bs.inputs['Metallic'].default_value, 2), round(bs.inputs['Emission Strength'].default_value, 2))


ms = collections.defaultdict(list)
for m in bpy.data.materials:
    if m.users:
        ms[assinatura(m)].append(m.name)
R["materiais_redundantes"] = [v for v in ms.values() if len(v) > 1]
R["texturas_grandes"] = [(im.name, list(im.size), "embutida" if im.packed_file else "externa", im.users)
                         for im in bpy.data.images if max(im.size) >= 2048]
R["texturas_cidade"] = [(im.name, list(im.size)) for im in bpy.data.images if im.name in ("atlas_cidade.jpg",)]
os.makedirs(os.path.join(B.EXPORT_DIR, "cidade"), exist_ok=True)
with open(os.path.join(B.EXPORT_DIR, "cidade", "validacao.json"), "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=1, default=str)
for k in ("bar_preservado", "spawn", "vias", "chao", "obstaculos", "tris_lod0_por_setor", "setores_mais_pesados", "global",
          "anel_externo_tris", "distante_tris"):
    print("==", k, ":", R[k])
print("== instanciados_top:", R["instanciados_top"][:12])
print("== malhas_duplicadas:", len(R["malhas_duplicadas"]), R["malhas_duplicadas"][:5])
print("== materiais_redundantes:", R["materiais_redundantes"])
print("== texturas_grandes:", len(R["texturas_grandes"]), R["texturas_grandes"][:6])
