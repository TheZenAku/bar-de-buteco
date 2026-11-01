# Cidade - etapa 5: LODs complementares e metadados de distancia para o streaming.
#  - K_Poste_LOD1 (poste simplificado) e K_Carro_LOD1 (caixa) ligados aos prototipos por propriedade "lod1"
#  - "cull_m" nos prototipos pequenos (somem de longe), "lod_dist_m" = [LOD0, LOD1, LOD2] em metros
#  - Sxx_yy_Chao_LOD2: piso do setor em poucas faces (quadras + leito), para setores distantes
import bpy, math, sys
from mathutils import Vector, Matrix
SP = r"C:\Users\rafael\BarBoteco\scripts"
if SP not in sys.path:
    sys.path.insert(0, SP)
import importlib
import barlib as B
import cidadelib as C
importlib.reload(C)

ETAPA = "lod"
ZC = C.ZC
print("removidos:", C.limpar_etapa(ETAPA))
if "K_Poste_LOD1" not in bpy.data.meshes:
    m = B.Mesh("K_Poste_LOD1")
    m.box((-0.12, -0.12, 0.0), (0.12, 0.12, 9.6), "Concreto", skip=('nz',))
    m.box((0.0, -0.08, 8.6), (2.0, 0.08, 8.75), "Metal_Escuro", mats={'nz': "Lampada"}, skip=())
    m.mesh()
if "K_Carro_LOD1" not in bpy.data.meshes:
    m = B.Mesh("K_Carro_LOD1")
    m.box((-2.0, -0.9, 0.25), (2.0, 0.9, 0.85), "Carro_Prata", skip=('nz',))
    m.box((-1.0, -0.8, 0.85), (1.1, 0.8, 1.4), "Janela_Escura", skip=('nz',))
    m.mesh()
for k in ("K_Poste_LOD1", "K_Carro_LOD1"):
    bpy.data.meshes[k].use_fake_user = True
META = {
    "P_Poste_Luz": dict(lod1="K_Poste_LOD1", lod_dist_m=[0, 60, 220], cull_m=260),
    "P_Poste": dict(lod1="K_Poste_LOD1", lod_dist_m=[0, 60, 220], cull_m=260),
    "P_Poste_Trafo": dict(lod1="K_Poste_LOD1", lod_dist_m=[0, 60, 220], cull_m=260),
    "P_Arvore_A": dict(lod1="K_Arvore_LOD1", lod2="Sxx_yy_Vegetacao_LOD2", lod_dist_m=[0, 70, 160]),
    "P_Arvore_B": dict(lod1="K_Arvore_LOD1", lod2="Sxx_yy_Vegetacao_LOD2", lod_dist_m=[0, 70, 160]),
    "P_Arvore_Ipe": dict(lod1="K_Arvore_Ipe_LOD1", lod2="Sxx_yy_Vegetacao_LOD2", lod_dist_m=[0, 70, 160]),
    "K_Eucalipto": dict(lod1="K_Eucalipto_LOD1", lod2="Sxx_yy_Vegetacao_LOD2", lod_dist_m=[0, 90, 200]),
    "K_Arbusto": dict(cull_m=120),
    "P_Carro_Prata": dict(lod1="K_Carro_LOD1", lod_dist_m=[0, 50, 150], cull_m=150),
    "P_Banco_Praca": dict(cull_m=60), "P_Lixeira": dict(cull_m=50), "P_Placa_Rua_A": dict(cull_m=70),
    "P_Placa_Rua_B": dict(cull_m=70), "P_Ponto_Onibus": dict(cull_m=120), "P_Orelhao": dict(cull_m=60),
    "P_Caixa_Agua_Casa": dict(cull_m=140), "P_Antena": dict(cull_m=90), "P_AC": dict(cull_m=60), "P_Canteiro": dict(cull_m=60),
    "P_Trave": dict(cull_m=120), "K_Bomba": dict(cull_m=90), "K_Carreta": dict(cull_m=200),
    "Rua_PARE_txt": dict(cull_m=60),
}
for nome in [m.name for m in bpy.data.meshes if m.name.startswith(("P_Carro_", "P_Sedan_"))]:
    META[nome] = META["P_Carro_Prata"]
for nome in [m.name for m in bpy.data.meshes if m.name.startswith("K_Placa_")]:
    META[nome] = dict(cull_m=70)
for nome, d in META.items():
    me = bpy.data.meshes.get(nome)
    if me:
        for k, v in d.items():
            me[k] = v
# distancias de troca dos objetos fundidos por setor (o jogo escolhe pelo nome/propriedade "lod")
for o in bpy.data.objects:
    if o.get("cid_etapa") and o.type == 'MESH' and o.data and not o.data.name.startswith(("P_", "K_", "COL_", "Rua_PARE")):
        if o.get("lod") == 0:
            o["lod_dist_m"] = [0, 140] if "Edificios" in o.name else [0, 260]
        elif o.get("lod") == 1:
            o["lod_dist_m"] = [140, 300]
        elif o.get("lod") == 2:
            o["lod_dist_m"] = [300, 2000]

# piso simplificado por setor (LOD2): leito em uma placa + quadras como poligonos planos
G, Q = C.plano()
MM = C.Malhas(ETAPA)
for ix in range(C.NS):
    for iy in range(C.NS):
        x0, y0 = -C.HALF + ix * C.SETOR, -C.HALF + iy * C.SETOR
        MM.get("Chao_LOD2", (ix, iy)).face([(x0, y0, -0.02), (x0 + C.SETOR, y0, -0.02), (x0 + C.SETOR, y0 + C.SETOR, -0.02),
                                             (x0, y0 + C.SETOR, -0.02)], "Asfalto", facing=(0, 0, 1))
for q in Q:
    if q.externa or q.antiga or len(q.poly_ext) < 3:
        continue
    MM.get("Chao_LOD2", q.c.x, q.c.y).face([(p.x, p.y, ZC) for p in q.poly_ext], C.MAT_CHAO[q.zona] if not q.toda_calcada else "Concreto",
                                           facing=(0, 0, 1))
objs = MM.build({"Chao_LOD2": "LOD"})
for o in objs:
    o["lod"] = 2
    o["lod_dist_m"] = [300, 2000]
print("lod ok: metadados em %d prototipos | pisos LOD2 %d" % (len(META), len(objs)))
