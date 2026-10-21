# Vizinhanca nas 8 quadras ao redor do quarteirao do bar, mobiliario urbano, fiacao, carros, luzes e marcadores.
import math, random
import bpy
from mathutils import Vector
import barlib as B

VZ, MOB, LUZ, MK = "Exterior_Vizinhanca", "Exterior_Mobiliario", "Iluminacao", "Marcadores"
for c in (VZ, MOB, LUZ, MK):
    B.coll(c)
B.clear(VZ, MOB, LUZ, MK)
B.clear_colliders("Viz")
B.clear_colliders("Ext")
ZC, ZP, ZP2 = B.Z_CALCADA, B.Z_PISO, B.Z_PISO2
rnd = random.Random(3)

# ============================================================ CASAS
casas = B.Mesh("Viz_Casas")
muros = B.Mesh("Viz_Muros")


def telhado_4aguas(b, x0, y0, x1, y1, z, h, o=0.4):
    X0, X1, Y0, Y1 = x0 - o, x1 + o, y0 - o, y1 + o
    zt = z + h
    if (X1 - X0) >= (Y1 - Y0):
        d = (Y1 - Y0) / 2; ym = (Y0 + Y1) / 2
        b.roof_face([(X0, Y0, z), (X1, Y0, z), (X1 - d, ym, zt), (X0 + d, ym, zt)], "Telha", (1, 0, 0))
        b.roof_face([(X1, Y1, z), (X0, Y1, z), (X0 + d, ym, zt), (X1 - d, ym, zt)], "Telha", (1, 0, 0))
        b.roof_face([(X0, Y1, z), (X0, Y0, z), (X0 + d, ym, zt)], "Telha", (0, 1, 0))
        b.roof_face([(X1, Y0, z), (X1, Y1, z), (X1 - d, ym, zt)], "Telha", (0, 1, 0))
    else:
        d = (X1 - X0) / 2; xm = (X0 + X1) / 2
        b.roof_face([(X0, Y1, z), (X0, Y0, z), (xm, Y0 + d, zt), (xm, Y1 - d, zt)], "Telha", (0, 1, 0))
        b.roof_face([(X1, Y0, z), (X1, Y1, z), (xm, Y1 - d, zt), (xm, Y0 + d, zt)], "Telha", (0, 1, 0))
        b.roof_face([(X0, Y0, z), (X1, Y0, z), (xm, Y0 + d, zt)], "Telha", (1, 0, 0))
        b.roof_face([(X1, Y1, z), (X0, Y1, z), (xm, Y1 - d, zt)], "Telha", (1, 0, 0))
    b.face([(X0, Y0, z), (X1, Y0, z), (X1, Y1, z), (X0, Y1, z)], "Reboco_Branco", facing=(0, 0, -1))


def casa(x0, y0, x1, y1, h, mat, frente0=None, aberturas=(), roof_h=1.3, plana=False):
    z1 = ZC + h
    casas.box((x0, y0, ZC), (x1, y1, z1), mat, skip=('nz',) if plana else ('nz', 'pz'))
    B.add_collider("Viz_Casa", (x0, y0, ZC), (x1, y1, z1))
    if plana:
        for (p0, p1) in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
            casas.wall(p0, p1, z1, z1 + 0.6, 0.15, "Reboco_Vermelho", mat, mat_e="Concreto", cut_ends=False, collide=False)
    else:
        telhado_4aguas(casas, x0, y0, x1, y1, z1, roof_h)
    for ab in aberturas:
        kind, c, w, za, zb = ab[:5]
        frente = ab[5] if len(ab) > 5 else frente0
        mm = {"J": "Janela_Escura", "P": "Madeira", "G": "Portao_Verde", "E": "Metal_Ondulado"}[kind]
        za, zb = ZC + za, ZC + zb
        if frente in ("S", "N"):
            y = y0 - 0.02 if frente == "S" else y1 + 0.02
            casas.face([(c - w / 2, y, za), (c + w / 2, y, za), (c + w / 2, y, zb), (c - w / 2, y, zb)], mm,
                       facing=(0, -1 if frente == "S" else 1, 0))
            if kind == "J":
                yy = (y0 - 0.06, y0) if frente == "S" else (y1, y1 + 0.06)
                casas.box((c - w / 2 - 0.05, yy[0], za - 0.05), (c + w / 2 + 0.05, yy[1], za), "Concreto")
        else:
            x = x0 - 0.02 if frente == "W" else x1 + 0.02
            casas.face([(x, c - w / 2, za), (x, c + w / 2, za), (x, c + w / 2, zb), (x, c - w / 2, zb)], mm,
                       facing=(-1 if frente == "W" else 1, 0, 0))
            if kind == "J":
                xx = (x0 - 0.06, x0) if frente == "W" else (x1, x1 + 0.06)
                casas.box((xx[0], c - w / 2 - 0.05, za - 0.05), (xx[1], c + w / 2 + 0.05, za), "Concreto")


def muro(p0, p1, mat, portoes=(), h=1.8):
    M = muros.wall(p0, p1, ZC, ZC + h, 0.15, mat, mat, mat_e="Concreto", cut_ends=False, name="Viz_Muro",
                   openings=[(s0, s1, ZC, ZC + h) for (s0, s1) in portoes])
    for (s0, s1) in portoes:
        muros.box((s0, 0.05, ZC + 0.02), (s1, 0.10, ZC + h - 0.05), "Portao_Verde", M=M)
        B.add_collider("Viz_Portao", (s0, 0.0, ZC), (s1, 0.15, ZC + h), M)


J1, J2 = (1.0, 2.2), (3.9, 5.0)
P_ = (0, 2.1)
# --- quadra sul (frente para o norte, y = -14)
muro((8.0, -14.0), (0.0, -14.0), "Reboco_Azul", [(0.6, 3.6), (5.0, 6.0)])
casa(0.5, -24.0, 7.5, -16.5, 3.0, "Reboco_Azul", "N", [("J", 1.9, 1.4, *J1), ("P", 3.7, 0.9, *P_), ("J", 6.0, 1.4, *J1)])
muro((17.0, -14.0), (8.0, -14.0), "Reboco_Verde", [(4.0, 5.0)])
casa(8.6, -23.0, 16.4, -15.5, 5.8, "Reboco_Verde", "N", [("P", 12.5, 0.9, *P_), ("J", 10.2, 1.2, *J1), ("J", 14.8, 1.4, *J1),
                                                         ("J", 10.2, 1.2, *J2), ("J", 12.5, 1.2, *J2), ("J", 14.8, 1.4, *J2)], roof_h=1.4)
muro((25.0, -14.0), (17.0, -14.0), "Reboco_Rosa", [(1.0, 2.0)])
casa(17.6, -24.0, 24.4, -16.2, 3.0, "Reboco_Rosa", "N", [("J", 19.0, 1.2, *J1), ("P", 21.0, 0.9, *P_), ("J", 23.0, 1.2, *J1)])
muro((32.0, -14.0), (25.0, -14.0), "Reboco_Creme", [(0.8, 3.8), (5.0, 6.0)])
casa(25.6, -24.0, 31.5, -16.0, 3.0, "Reboco_Creme", "N", [("G", 29.7, 2.6, 0, 2.3), ("P", 27.0, 0.9, *P_)])
# --- quadra norte (frente para o sul, y = 40)
muro((0.0, 40.0), (8.0, 40.0), "Reboco_Branco", [(1.0, 4.0), (5.5, 6.5)])
casa(0.6, 42.0, 7.4, 50.0, 3.0, "Reboco_Branco", "S", [("J", 2.0, 1.4, *J1), ("P", 4.4, 0.9, *P_), ("J", 6.3, 1.0, *J1)])
muro((8.0, 40.0), (16.0, 40.0), "Reboco_Azul", [(3.5, 4.5)])
casa(8.6, 42.0, 15.4, 50.5, 5.8, "Reboco_Azul", "S", [("P", 12.0, 0.9, *P_), ("J", 9.8, 1.2, *J1), ("J", 14.2, 1.2, *J1),
                                                       ("J", 9.8, 1.2, *J2), ("J", 12.0, 1.2, *J2), ("J", 14.2, 1.2, *J2)], roof_h=1.4)
muro((16.0, 40.0), (24.0, 40.0), "Reboco_Verde", [(0.8, 3.8), (5.0, 6.0)])
casa(16.6, 42.0, 23.4, 49.5, 3.0, "Reboco_Verde", "S", [("G", 18.3, 2.6, 0, 2.3), ("P", 21.5, 0.9, *P_), ("J", 22.7, 0.8, *J1)])
muro((24.0, 40.0), (32.0, 40.0), "Reboco_Rosa", [(2.0, 3.0)])
casa(24.6, 42.0, 31.4, 50.0, 3.0, "Reboco_Rosa", "S", [("J", 25.8, 1.2, *J1), ("P", 27.5, 0.9, *P_), ("J", 29.6, 1.4, *J1)])
# --- quadra oeste (frente para o leste, x = -14)
muro((-14.0, 0.0), (-14.0, 9.0), "Reboco_Rosa", [(1.0, 4.0), (5.5, 6.5)])
casa(-24.0, 0.5, -16.0, 8.5, 3.0, "Reboco_Rosa", "E", [("J", 2.0, 1.4, *J1), ("P", 4.6, 0.9, *P_), ("J", 7.0, 1.4, *J1)])
muro((-14.0, 9.0), (-14.0, 18.0), "Reboco_Branco", [(4.0, 5.0)])
casa(-25.0, 9.6, -16.4, 17.4, 5.8, "Reboco_Branco", "E", [("P", 13.5, 0.9, *P_), ("J", 11.0, 1.4, *J1), ("J", 16.0, 1.4, *J1),
                                                         ("J", 11.0, 1.4, *J2), ("J", 13.5, 1.2, *J2), ("J", 16.0, 1.4, *J2)], roof_h=1.5)
muro((-14.0, 18.0), (-14.0, 26.0), "Reboco_Verde", [(1.5, 4.5)])
casa(-24.0, 18.6, -16.5, 26.0, 3.0, "Reboco_Verde", "E", [("G", 21.0, 2.6, 0, 2.3), ("P", 23.6, 0.9, *P_), ("J", 25.2, 0.9, *J1)])
# --- quadra leste (frente para o oeste, x = 46)
muro((46.0, 9.0), (46.0, 0.0), "Reboco_Creme", [(1.0, 2.0), (4.5, 7.5)])
casa(48.0, 0.5, 56.0, 8.5, 3.0, "Reboco_Creme", "W", [("J", 2.0, 1.4, *J1), ("P", 4.3, 0.9, *P_), ("J", 7.0, 1.4, *J1)])
muro((46.0, 18.0), (46.0, 9.0), "Reboco_Rosa", [(4.0, 5.0)])
casa(48.4, 9.6, 57.0, 17.4, 5.8, "Reboco_Rosa", "W", [("P", 13.5, 0.9, *P_), ("J", 11.0, 1.4, *J1), ("J", 16.0, 1.4, *J1),
                                                      ("J", 11.0, 1.4, *J2), ("J", 13.5, 1.2, *J2), ("J", 16.0, 1.4, *J2)], roof_h=1.5)
muro((46.0, 26.0), (46.0, 18.0), "Reboco_Azul", [(2.0, 5.0)])
casa(48.0, 18.6, 56.0, 26.0, 3.0, "Reboco_Azul", "W", [("J", 19.8, 1.2, *J1), ("G", 23.0, 2.6, 0, 2.3), ("P", 25.2, 0.8, *P_)])
# --- quadras de esquina
casa(-24.0, -24.0, -14.6, -14.6, 3.6, "Reboco_Creme", "E", [("E", -19.7, 2.6, 0, 2.6), ("E", -16.4, 2.0, 0, 2.6),
                                                           ("E", -20.5, 2.6, 0, 2.6, "N"), ("E", -17.2, 2.0, 0, 2.6, "N")], plana=True)
casa(46.6, -24.0, 56.0, -14.6, 3.6, "Reboco_Azul", "W", [("E", -19.75, 2.5, 0, 2.6), ("E", -16.5, 1.8, 0, 2.6),
                                                         ("E", 49.75, 2.5, 0, 2.6, "N"), ("E", 53.0, 2.0, 0, 2.6, "N")], plana=True)
muro((-14.0, 40.0), (-14.0, 52.0), "Reboco_Rosa", [(2.0, 3.0), (5.0, 8.0)])
casa(-24.0, 41.0, -16.0, 50.0, 5.8, "Reboco_Rosa", "E", [("P", 42.5, 0.9, *P_), ("G", 46.5, 2.6, 0, 2.3), ("J", 49.0, 1.0, *J1),
                                                        ("J", 42.5, 1.2, *J2), ("J", 46.5, 1.4, *J2)], roof_h=1.5)
muro((46.0, 52.0), (46.0, 40.0), "Reboco_Verde", [(3.0, 4.0)])
casa(48.0, 41.0, 56.0, 50.0, 3.0, "Reboco_Verde", "W", [("J", 42.5, 1.4, *J1), ("P", 48.5, 0.9, *P_), ("J", 45.6, 1.4, *J1)])
casas.build(VZ)
muros.build(VZ)


# ============================================================ MOBILIARIO URBANO
def I(proto, x, y, z=ZC, rot=0.0, collide=False, pad=0.0):
    o = B.inst(proto, proto[2:], MOB, (x, y, z), rot)
    if collide:
        B.collider_obj("Ext_" + proto[2:], o, pad)
    return o


arv = [((2.6, -2.1), "A"), ((13.2, -2.1), "B"), ((20.8, -2.1), "A"), ((28.0, -2.1), "B"),
       ((-2.1, 4.3), "B"), ((-2.1, 10.8), "A"), ((-2.1, 17.0), "B"), ((-2.1, 25.0), "A"),
       ((3.5, 28.1), "A"), ((11.0, 28.1), "B"), ((18.5, 28.1), "A"), ((31.0, 28.1), "B"),
       ((34.1, 5.5), "A"), ((34.1, 16.0), "B"), ((34.1, 22.5), "A"),
       ((4.5, -12.6), "B"), ((20.0, -12.6), "A"), ((-12.6, 6.0), "A"), ((-12.6, 21.0), "B"),
       ((44.6, 6.0), "B"), ((44.6, 20.0), "A"), ((6.0, 38.6), "A"), ((22.0, 38.6), "B")]
for (x, y), k in arv:
    I("P_Arvore_" + k, x, y, ZC, rnd.uniform(0, 360))
    I("P_Canteiro", x, y, ZC, 0)
    B.add_collider("Ext_Arvore", (x - 0.15, y - 0.15, ZC), (x + 0.15, y + 0.15, ZC + 2.5))

postes = {
    "SW": ((-1.9, -1.9), 225, "P_Poste_Trafo"), "S1": ((12.0, -2.62), -90, "P_Poste_Luz"), "S2": ((23.5, -2.62), -90, "P_Poste"),
    "SE": ((33.9, -1.9), -45, "P_Poste_Luz"), "E1": ((34.62, 13.0), 0, "P_Poste_Luz"), "NE": ((33.9, 27.9), 45, "P_Poste_Luz"),
    "N2": ((23.5, 28.62), 90, "P_Poste"), "N1": ((12.0, 28.62), 90, "P_Poste_Luz"), "NW": ((-1.9, 27.9), 135, "P_Poste_Luz"),
    "W1": ((-2.62, 13.0), 180, "P_Poste_Luz"),
    "oS": ((12.0, -11.38), 90, "P_Poste_Luz"), "oW": ((-11.38, 13.0), 0, "P_Poste_Luz"),
    "oE": ((43.38, 13.0), 180, "P_Poste_Luz"), "oN": ((12.0, 37.38), -90, "P_Poste_Luz"),
}
for k, ((x, y), r, proto) in postes.items():
    o = I(proto, x, y, ZC, r)
    o.name = "Poste_" + k
    B.add_collider("Ext_Poste", (x - 0.17, y - 0.17, ZC), (x + 0.17, y + 0.17, ZC + 10.0))


def pontos(k):
    (x, y), r, _ = postes[k]
    a = math.radians(r)
    ly = Vector((-math.sin(a), math.cos(a), 0))
    base = Vector((x, y, ZC))
    return [base + ly * s + Vector((0, 0, 9.43)) for s in (-0.8, 0.0, 0.8)] + [base + Vector((0, 0, 7.75))]


fios = B.Mesh("Ext_Fiacao")


def vao(pa, pb, n=6):
    for a, c in zip(pa, pb):
        L = (c - a).length
        sag = 0.25 + 0.012 * L
        pts = [a.lerp(c, t / n) - Vector((0, 0, sag * 4 * (t / n) * (1 - t / n))) for t in range(n + 1)]
        for i in range(n):
            fios.tube(pts[i], pts[i + 1], 0.012, "Fio", segs=3, smooth=False)


anel = ["SW", "S1", "S2", "SE", "E1", "NE", "N2", "N1", "NW", "W1"]
for i in range(len(anel)):
    vao(pontos(anel[i]), pontos(anel[(i + 1) % len(anel)]))
for (a, b_) in (("oS", "S1"), ("oW", "W1"), ("oE", "E1"), ("oN", "N1")):
    vao(pontos(a), pontos(b_))
vao([pontos("S1")[3]], [Vector((12.6, 3.42, 6.0))], n=5)                 # ramal de entrada do bar
fios.box((12.45, 3.36, 5.7), (12.75, 3.5, 6.1), "Metal_Escuro", skip=('py',))
fios.build(MOB)

I("P_Carro_Prata", 18.5, -4.0, 0.0, 180, collide=True)
I("P_Carro_Vermelho", -4.0, 19.5, 0.0, 90, collide=True)
I("P_Carro_Prata", 36.0, 6.0, 0.0, -90, collide=True)
I("P_Carro_Vermelho", 14.0, 30.0, 0.0, 0, collide=True)
I("P_Carrinho_Churrasco", 8.7, -1.5, ZC, 8, collide=True)
I("P_Lixeira", 16.5, -2.4, ZC, 0, collide=True)
I("P_Lixeira", -2.4, 22.8, ZC, 0, collide=True)


# ============================================================ LUZES (sol + pontos principais)
def luz(nome, tipo, loc, energia, cor=(1.0, 0.92, 0.8), raio=0.2, rot=None):
    ld = bpy.data.lights.new(nome, tipo)
    ld.energy = energia
    ld.color = cor
    if tipo == 'SUN':
        ld.angle = math.radians(1.5)
    else:
        ld.shadow_soft_size = raio
    o = bpy.data.objects.new(nome, ld)
    o.location = loc
    if rot:
        o.rotation_euler = [math.radians(v) for v in rot]
    B.coll(LUZ).objects.link(o)
    return o


luz("Sol", 'SUN', (10, -10, 25), 3.5, (1.0, 0.96, 0.9), rot=(40, 0, -35))
for (n, loc, e, cor) in (("Luz_Salao_1", (7.0, 6.8, 3.0), 200, None), ("Luz_Salao_2", (12.5, 6.8, 3.0), 200, None),
                         ("Luz_Bar", (20.8, 8.0, 3.0), 130, None), ("Luz_Cozinha", (27.8, 4.5, 3.0), 130, None),
                         ("Luz_Fundos", (12.0, 13.2, 3.0), 90, None), ("Luz_Jogos", (10.3, 7.6, 5.4), 220, None),
                         ("Luz_Lounge", (20.5, 8.0, 5.9), 110, None), ("Luz_Varanda_Sul", (11.0, 1.8, 2.55), 160, None),
                         ("Luz_Varanda_Oeste", (1.8, 9.0, 2.55), 100, None), ("Luz_Quintal_1", (6.0, 20.0, 2.7), 170, None),
                         ("Luz_Quintal_2", (14.5, 20.0, 2.7), 170, None), ("Luz_Palco", (26.6, 22.6, 3.9), 220, (1.0, 0.75, 0.85)),
                         ("Luz_Terraco", (28.0, 7.5, 6.2), 130, None)):
    luz(n, 'POINT', loc, e, cor or (1.0, 0.92, 0.8))

w = bpy.context.scene.world or bpy.data.worlds.new("World")
bpy.context.scene.world = w
w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs[0].default_value = (0.52, 0.68, 0.90, 1.0)
bg.inputs[1].default_value = 0.7

# ============================================================ MARCADORES PARA O JOGO
for (n, loc, rot) in (("Spawn_Jogador", (12.0, -1.6, ZC), 90), ("Ponto_Balcao", (16.4, 7.5, ZP), 0),
                      ("Ponto_Sinuca", (10.3, 9.6, ZP2), 0), ("Ponto_Lounge", (19.8, 7.4, ZP2), 0),
                      ("Ponto_Terraco", (28.0, 8.7, ZP2), 0), ("Ponto_Palco", (26.6, 19.8, ZP), 90),
                      ("Ponto_Churrasqueira", (4.5, 23.9, ZP), 90), ("Ponto_Cozinha", (28.5, 3.0, ZP), 0),
                      ("Ponto_Carga_Descarga", (36.5, 10.7, 0.0), 180), ("Ponto_Portao_Quintal", (-1.5, 21.0, ZC), 0)):
    e = bpy.data.objects.new(n, None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = 0.5
    e.location = loc
    e.rotation_euler = (0, 0, math.radians(rot))
    B.coll(MK).objects.link(e)
print("exterior ok:", len(B.coll(VZ).objects), len(B.coll(MOB).objects), "colisores:", len(B.coll("Colisores").objects))
