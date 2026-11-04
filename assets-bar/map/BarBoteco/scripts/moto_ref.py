# moto_ref.py - prepara a referencia da Tripo (moto vermelha) no sistema de coordenadas da moto v3:
# metros reais, frente = -Y, esquerda do piloto = +X, Z para cima, origem no chao no meio do entre-eixos,
# nivelada (a Tripo vinha ~2,4 graus inclinada para tras). Usada por 55_moto_v3.py para tirar secoes e medidas.
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

FONTE_BLEND = r"C:\Users\rafael\Desktop\BAR\2.0\veiculos\moto\moto_tripo_original.blend"
ESCALA = 2.0
Y_CENTRO = 0.045          # centra o entre-eixos em y = 0


def carregar_tripo():
    """devolve (objeto, imagem) da Tripo ja transformada para a moto v3"""
    ob = next((o for o in bpy.data.objects if o.name.startswith("tripo_node")), None)
    if ob is None:
        with bpy.data.libraries.load(FONTE_BLEND) as (de, para):
            para.objects = [n for n in de.objects if n.startswith("tripo_node")]
        ob = para.objects[0]
        bpy.context.scene.collection.objects.link(ob)
    me = ob.data
    # Tripo: frente = -X, esquerda = -Y  ->  v3: x = -2 ty, y = 2 tx + c, z = 2 tz
    M = Matrix(((0, -ESCALA, 0, 0), (ESCALA, 0, 0, Y_CENTRO), (0, 0, ESCALA, 0), (0, 0, 0, 1)))
    me.transform(M)
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    # nivela: pneus tocam o chao (rotacao em X em torno do ponto medio)
    fr = co[(co[:, 1] < -0.45)]
    tr = co[(co[:, 1] > 0.40)]
    zf, yf = fr[:, 2].min(), fr[np.argmin(fr[:, 2]), 1]
    zt, yt = tr[:, 2].min(), tr[np.argmin(tr[:, 2]), 1]
    ang = math.atan2(zf - zt, yt - yf)          # >0: frente mais alta
    R = Matrix.Rotation(ang, 4, 'X')            # gira a frente para baixo
    me.transform(R)
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    me.transform(Matrix.Translation((0, 0, -co[:, 2].min())))
    me.update()
    ob.matrix_world = Matrix.Identity(4)
    return ob


def bvh_de(ob, filtro_faces=None):
    me = ob.data
    verts = [v.co.copy() for v in me.vertices]
    polys = [tuple(p.vertices) for p in me.polygons if filtro_faces is None or filtro_faces(p)]
    return BVHTree.FromPolygons(verts, polys)


def cor_das_faces(ob, img):
    """cor media (linear) da textura no centro da UV de cada face -> array (n, 3)"""
    me = ob.data
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)[..., :3]
    uv = me.uv_layers.active.data
    out = np.zeros((len(me.polygons), 3), np.float32)
    for p in me.polygons:
        u = sum((uv[l].uv for l in p.loop_indices), Vector((0, 0))) / p.loop_total
        out[p.index] = px[min(h - 1, max(0, int(u.y * h))), min(w - 1, max(0, int(u.x * w)))]
    return out


# ---------------------------------------------------------------- correcao da direcao e particao em grupos
EIXO_FRENTE = np.array([0.027, -0.686, 0.301])       # eixo da roda dianteira medido na referencia nivelada
YAW_FRENTE = math.radians(12.8)                       # a Tripo veio com o guidao esterçado
RAKE = math.radians(27.0)
X_FRENTE, X_TRAS = 0.027, -0.009
YF_REF, YT_REF = -0.686, 0.675


def _vermelho(c):
    return (c[:, 0] > 0.30) & (c[:, 0] > 1.8 * c[:, 1]) & (c[:, 0] > 1.8 * c[:, 2])


def corrigir(ob):
    """desfaz o esterçamento da frente (gira em torno da coluna) e centraliza em x = 0; devolve mascara das faces da frente"""
    me = ob.data
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    frente_v = (co[:, 1] < -0.30) | ((co[:, 2] > 0.915) & (co[:, 1] < -0.15))
    eixo = Vector((0, math.sin(RAKE), math.cos(RAKE)))
    piv = Vector(EIXO_FRENTE)
    R = Matrix.Rotation(-YAW_FRENTE, 4, eixo)
    M = Matrix.Translation(piv) @ R @ Matrix.Translation(-piv)
    novo = co.copy()
    for i in np.where(frente_v)[0]:
        novo[i] = M @ Vector(co[i])
    novo[frente_v, 0] -= (X_FRENTE - 0.024)       # a frente da Tripo ainda ficava ~2,4 cm fora do eixo
    novo[~frente_v, 0] -= X_TRAS
    me.vertices.foreach_set("co", novo.ravel())
    me.update()
    return frente_v


def preparar():
    """carrega e corrige a referencia; devolve (ob, cols, grupos)"""
    ob = carregar_tripo()
    img = next(i for i in bpy.data.images if i.name.startswith("tripo_image"))
    cols = cor_das_faces(ob, img)
    corrigir(ob)
    return ob, cols, agrupar(ob, cols)


def agrupar(ob, cols):
    """grupo de cada face: roda_d, roda_t, paralama_d, tanque, rabeta, banco, resto"""
    me = ob.data
    n = len(me.polygons)
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    pv = np.array([p.vertices[:3] for p in me.polygons])
    P = co[pv]
    ctr = P.mean(1)
    verm = _vermelho(cols)
    escuro = cols.mean(1) < 0.23
    grp = np.array(["resto"] * n, dtype=object)

    def em_roda(yc):
        d = np.sqrt((P[..., 1] - yc) ** 2 + (P[..., 2] - 0.30) ** 2).max(1)
        dx = np.abs(P[..., 0]).max(1)
        return (d <= 0.305) & (dx <= 0.075)
    rd, rt = em_roda(YF_REF), em_roda(YT_REF)
    grp[rd], grp[rt] = "roda_d", "roda_t"
    livre = (~rd) & (~rt)
    grp[livre & verm & (ctr[:, 1] < -0.34) & (ctr[:, 2] < 0.66)] = "paralama_d"
    grp[livre & verm & (ctr[:, 1] >= -0.38) & (ctr[:, 1] < 0.17) & (ctr[:, 2] >= 0.60)] = "tanque"
    grp[livre & verm & (ctr[:, 1] >= 0.17) & (ctr[:, 2] >= 0.60)] = "rabeta"
    grp[livre & escuro & (ctr[:, 1] > 0.14) & (ctr[:, 1] < 0.92) & (ctr[:, 2] > 0.64)] = "banco"
    return grp
