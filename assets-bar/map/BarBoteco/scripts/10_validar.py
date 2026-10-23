# Validacao automatica do predio:
#  1) VAZAMENTO: raios saindo de dentro de cada comodo que escapam (buraco na parede/teto)
#  2) FACE INVERTIDA: raio que acerta o verso de uma face de material com backface culling
#     (no jogo essa face some -> "buraco que da pra ver do lado de fora")
#  3) SEM COLISOR: ponto de parede atingido que nao esta dentro de nenhuma caixa de colisao
import math
import bpy
from mathutils import Vector
import barlib as B

ZP, ZP2 = B.Z_PISO, B.Z_PISO2
dg = bpy.context.evaluated_depsgraph_get()
scn = bpy.context.scene
col_objs = [o for o in bpy.data.collections["Colisores"].all_objects if o.type == 'MESH']


def mundo(o):
    """Matriz montada de loc/rot/escala (colisores ocultos nao sao reavaliados pelo depsgraph)."""
    if o.parent is None:
        return o.matrix_basis.copy()
    return mundo(o.parent) @ o.matrix_parent_inverse @ o.matrix_basis


inv = []
for o in col_objs:
    m = mundo(o)
    if abs(m.determinant()) > 1e-12:
        inv.append(m.inverted())
PAREDES = ("Predio_Paredes", "Predio_Lajes", "Predio_Quintal", "Predio_Escada")


def dentro_colisor(p):
    for mi in inv:
        q = mi @ p
        if abs(q.x) <= 0.52 and abs(q.y) <= 0.52 and abs(q.z) <= 0.52:
            return True
    return False


def lancar(o, d, maxd=60.0):
    """Atravessa vidro e colisores; retorna (ponto, normal, objeto, material) do primeiro acerto opaco."""
    for _ in range(6):
        ok, loc, nrm, idx, ob, _m = scn.ray_cast(dg, o, d, distance=maxd)
        if not ok:
            return None
        mat = None
        if ob.type == 'MESH' and ob.data.polygons and idx < len(ob.data.polygons):
            mi = ob.data.polygons[idx].material_index
            if mi < len(ob.material_slots):
                mat = ob.material_slots[mi].material
        nome_col = ob.users_collection[0].name if ob.users_collection else ""
        if nome_col == "Colisores" or (mat and mat.name.startswith("Vidro")):
            o = loc + d * 0.01
            continue
        return loc, nrm, ob, mat
    return None


comodos = [
    ("Salao", (8.0, 6.0, ZP)), ("Salao_Bar", (14.0, 6.0, ZP)), ("Bar", (20.0, 8.0, ZP)),
    ("WC_Masc", (5.4, 13.0, ZP)), ("WC_Fem", (9.2, 13.0, ZP)), ("Corredor", (12.1, 13.2, ZP)),
    ("Deposito_Bar", (20.0, 13.2, ZP)), ("Cozinha", (28.0, 4.5, ZP)), ("Deposito_Anexo", (26.0, 12.0, ZP)),
    ("Camara", (30.2, 13.4, ZP)),
    ("Jogos", (8.0, 7.5, ZP2)), ("Jogos2", (14.0, 7.5, ZP2)), ("Lounge", (20.5, 7.5, ZP2)),
    ("WC_Masc_Sup", (5.4, 13.2, ZP2)), ("WC_Fem_Sup", (9.2, 13.2, ZP2)), ("Escritorio", (12.1, 13.2, ZP2)),
    ("Deposito_Sup", (20.0, 13.2, ZP2)),
]
relatorio = {"vazamento": [], "face_invertida": [], "sem_colisor": []}
for nome, (x, y, z0) in comodos:
    for h in (1.5, 2.55 if z0 == ZP else 2.5):
        o = Vector((x, y, z0 + h))
        dirs = [Vector((math.cos(math.radians(a)), math.sin(math.radians(a)), 0)) for a in range(0, 360, 5)]
        dirs += [Vector((math.cos(math.radians(a)) * 0.5, math.sin(math.radians(a)) * 0.5, 0.85)).normalized() for a in range(0, 360, 30)]
        dirs += [Vector((0, 0, 1))]
        for d in dirs:
            r = lancar(o, d)
            if r is None:
                relatorio["vazamento"].append((nome, round(h, 2), tuple(round(v, 2) for v in d)))
                continue
            loc, nrm, ob, mat = r
            dist = (loc - o).length
            culled = mat is not None and mat.use_backface_culling
            if culled and nrm.dot(d) > 0.05:
                relatorio["face_invertida"].append((nome, ob.name, mat.name, tuple(round(v, 2) for v in loc)))
            if ob.name.startswith(PAREDES) and dist > 0.3 and not dentro_colisor(loc + d * 0.04):
                relatorio["sem_colisor"].append((nome, ob.name, mat.name if mat else None, tuple(round(v, 2) for v in loc)))
# ---- teste de fora para dentro (quintal, calcadas, varanda, terraco)
relatorio["face_invertida_fora"] = []
pontos_fora = [(x, 17.0, ZP + h) for x in range(1, 32, 2) for h in (1.6, 2.4)]
pontos_fora += [(x, 1.6, ZP + 1.6) for x in range(4, 24, 2)] + [(1.6, y, ZP + 1.6) for y in range(4, 15, 2)]
pontos_fora += [(x, -2.0, B.Z_CALCADA + 1.7) for x in range(0, 33, 3)] + [(-2.0, y, B.Z_CALCADA + 1.7) for y in range(0, 27, 3)]
pontos_fora += [(34.0, y, B.Z_CALCADA + 1.7) for y in range(0, 27, 3)] + [(x, 28.0, B.Z_CALCADA + 1.7) for x in range(0, 33, 3)]
pontos_fora += [(x, y, ZP2 + 1.6) for x in (25.0, 28.0, 31.0) for y in (1.5, 6.0, 10.5, 14.0)]
pontos_fora += [(x, 2.7, 3.65 + 1.6) for x in (11.5, 12.5, 19.5, 20.5)]
for p in pontos_fora:
    o = Vector(p)
    for a in range(0, 360, 6):
        for el in (-0.15, 0.0, 0.25):
            d = Vector((math.cos(math.radians(a)), math.sin(math.radians(a)), el)).normalized()
            r = lancar(o, d, maxd=40.0)
            if r is None:
                continue
            loc, nrm, ob, mat = r
            if mat is not None and mat.use_backface_culling and nrm.dot(d) > 0.05:
                relatorio["face_invertida_fora"].append((ob.name, mat.name, tuple(round(v, 1) for v in loc), tuple(round(v, 1) for v in p)))
for k, v in relatorio.items():
    print("==", k, len(v))
    vistos = set()
    for item in v:
        chave = (item[0], item[1]) if k not in ("vazamento", "face_invertida_fora") else (item[0], item[2][:2])
        if k == "vazamento" or chave not in vistos:
            print("   ", item)
            vistos.add(chave)
