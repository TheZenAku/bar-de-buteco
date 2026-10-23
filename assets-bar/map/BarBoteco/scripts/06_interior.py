# Mobilia do complexo: salao, bar, banheiros, deposito (A terreo); cozinha/deposito/camara (anexo);
# salao de jogos, lounge, escritorio (A superior); terraco; quintal com palco; varanda.
import math, random
import bpy
from mathutils import Vector
import barlib as B

T0, S1, VAR, QT, TR = "Interior_Terreo", "Interior_Superior", "Varanda_Mobiliario", "Quintal_Mobiliario", "Terraco_Mobiliario"
for c in (T0, S1, VAR, QT, TR):
    B.coll(c)
B.clear(T0, S1, VAR, QT, TR)
B.clear_colliders("Mob")
ZP, ZP2, T1, T2, FORRO = B.Z_PISO, B.Z_PISO2, B.Z_TETO1, B.Z_TETO2, B.FORRO
rnd = random.Random(42)


SOMBRA = {"A_mesa-vermelha": (0.55, 0.55), "A_cadeira-vermelha": (0.36, 0.38), "P_Sinuca": (1.45, 0.85), "A_banqueta": (0.28, 0.28),
          "P_Mesa_Madeira": (1.15, 0.95), "P_Sofa": (1.1, 0.55), "P_Geladeira_Expositor": (0.45, 0.42), "P_Freezer": (0.8, 0.42),
          "P_Banqueta": (0.26, 0.26), "P_Pebolim": (0.8, 0.5), "P_Fogao": (0.6, 0.52), "P_Geladeira_Cozinha": (0.45, 0.45),
          "P_Mesa_Inox": (0.85, 0.42), "P_Prateleira": (0.75, 0.3), "P_Estante": (0.55, 0.26), "P_Mesa_Escritorio": (0.75, 0.42),
          "P_Vaso": (0.26, 0.36), "P_Caixa_Som": (0.4, 0.36), "P_Bateria": (0.95, 0.6), "P_Guarda_Sol": (1.35, 1.35),
          "P_Barril": (0.28, 0.28), "P_Vaso_Planta": (0.36, 0.36), "P_Lixeira": (0.26, 0.26), "P_Cofre": (0.32, 0.32)}
_sombras = {}


def sombra(col, x, y, z, rx, ry, rot):
    m = _sombras.get(col)
    if m is None:
        m = _sombras[col] = B.Mesh("Sombras_" + col)
    a = math.radians(rot)
    ca, sa = math.cos(a), math.sin(a)
    pts = [(x + u * rx * ca - v * ry * sa, y + u * rx * sa + v * ry * ca, z + 0.006) for (u, v) in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    m.face(pts, "Sombra_Contato", uvs=[(0.0, 0.0), (0.5, 0.0), (0.5, 1.0), (0.0, 1.0)], facing=(0, 0, 1))


def I(proto, col, x, y, z=ZP, rot=0.0, collide=False, name=None, scale=None):
    o = B.inst(proto, name or proto[2:], col, (x, y, z), rot, scale=scale)
    if collide:
        B.collider_obj("Mob_" + proto[2:], o)
    if proto in SOMBRA and (name or "") != "Cadeira_Empilhada":
        rx, ry = SOMBRA[proto]
        sombra(col, x, y, z, rx, ry, rot)
    return o


# ---- props feitos a mao (colecao PROPS-CRIADOS-MANUALMENTE -> 09_assets.py gera as versoes A_*)
MESA, CAD, LONG, COPO = "A_mesa-vermelha", "A_cadeira-vermelha", "A_long-neck", "A_copo"
BANQ = "A_banqueta" if "A_banqueta" in bpy.data.meshes else "P_Banqueta"     # banqueta feita a mao (asset)
_m, _c = bpy.data.meshes[MESA], bpy.data.meshes[CAD]
TOPO_MESA, R_MESA = _m["topo_z"], _m["raio_tampo"]
OFF_CAD = _m["largura_m"] / 2 + _c["profundidade_m"] / 2 - 0.12


def enfeitar(col, cx, cy, z, hx, hy, rot=0.0, n=None, centro_livre=0.0):
    """Espalha copos e long-necks sobre uma superficie retangular (meia-largura hx, hy), sem sobrepor."""
    n = n if n is not None else rnd.choice((1, 2, 2, 3, 3, 4))
    a = math.radians(rot)
    pts = []
    for _ in range(n * 12):
        if len(pts) >= n:
            break
        u, v = rnd.uniform(-hx, hx), rnd.uniform(-hy, hy)
        if math.hypot(u, v) < centro_livre or any(math.hypot(u - p[0], v - p[1]) < 0.11 for p in pts):
            continue
        pts.append((u, v))
    for (u, v) in pts:
        x = cx + u * math.cos(a) - v * math.sin(a)
        y = cy + u * math.sin(a) + v * math.cos(a)
        I(LONG if rnd.random() < 0.55 else COPO, col, x, y, z + 0.002, rnd.uniform(0, 360))


def linha_enfeites(col, pts, z):
    for (x, y, k) in pts:
        I(LONG if k == 'L' else COPO, col, x, y, z + 0.002, rnd.uniform(0, 360))


def conjunto(col, x, y, z=ZP, rot=0.0, chairs=4, enfeite=0.7, centro_livre=0.06):
    rt = rot + rnd.uniform(-4, 4)
    mesa = I(MESA, col, x, y, z, rt, name="Mesa")
    hw = _m["largura_m"] / 2 * 0.6               # colisor so no miolo da mesa (deixa passar entre as cadeiras)
    B.add_collider("Mob_Mesa", (-hw, -hw, 0.0), (hw, hw, TOPO_MESA), mesa.matrix_basis.copy())
    for k in range(chairs):                     # cadeiras sem colisor: o jogador passa entre elas
        a = math.radians(rot + 90 * k + (90 if chairs == 2 else 0))
        I(CAD, col, x + OFF_CAD * math.sin(a), y - OFF_CAD * math.cos(a), z, math.degrees(a) + 180 + rnd.uniform(-10, 10),
          name="Cadeira")
    if rnd.random() < enfeite:
        enfeitar(col, x, y, z + TOPO_MESA, R_MESA - 0.12, R_MESA - 0.12, rt, centro_livre=centro_livre)


def pilha(proto, col, x, y, z, nx, ny, nz, dx=0.36, dy=0.32, rot=0.0):
    for k in range(nz):
        for i in range(nx):
            for j in range(ny):
                I(proto, col, x + i * dx, y + j * dy, z + k * 0.29, rot + rnd.uniform(-3, 3))
    B.add_collider("Mob_Pilha", (x - 0.18, y - 0.16, z), (x + (nx - 1) * dx + 0.18, y + (ny - 1) * dy + 0.16, z + nz * 0.29))


def garrafas(col, x, y0, y1, z, step=0.11):
    protos = ("P_Garrafa_Verde", "P_Garrafa_Ambar", "P_Garrafa_Clara", "P_Garrafa_Ambar")
    y = y0
    while y <= y1:
        I(rnd.choice(protos), col, x + rnd.uniform(-0.03, 0.03), y, z, rnd.uniform(0, 360))
        y += step


def luzes(col, pts, z):
    for (x, y, r) in pts:
        I("P_Luminaria_Tubular", col, x, y, z, r)


def balcao(nome, col, x0, x1, y0, y1, z, retorno=None):
    """Balcao de tijolo com tampo de granito. retorno=(x0,x1,y0,y1) opcional (formato L)."""
    b = B.Mesh(nome)
    top = z + 1.06 - ZP
    b.box((x0, y0, z), (x1, y1, top), "Tijolo", mats={'px': "Madeira_Escura"}, skip=('nz',))
    b.box((x0 - 0.1, y0 - 0.08, top), (x1 + 0.06, y1 + 0.08, top + 0.04), "Granito_Preto")
    B.add_collider("Mob_Balcao", (x0 - 0.1, y0 - 0.08, z), (x1 + 0.06, y1 + 0.08, top + 0.04))
    if retorno:
        a0, a1, c0, c1 = retorno
        b.box((a0, c0, z), (a1, c1, top), "Tijolo", mats={'py': "Madeira_Escura"}, skip=('nz', 'px'))
        b.box((x1 + 0.06, c0 - 0.08, top), (a1, c1 + 0.06, top + 0.04), "Granito_Preto", skip=('px',))
        B.add_collider("Mob_Balcao", (x1, c0 - 0.08, z), (a1, c1 + 0.06, top + 0.04))
    b.tube((x0 - 0.04, y0 + 0.05, z + 0.12), (x0 - 0.04, y1 - 0.05, z + 0.12), 0.022, "Inox", segs=6, caps=(True, True))
    k = y0 + 0.2
    while k < y1:
        b.tube((x0 - 0.04, k, z + 0.12), (x0, k, z + 0.12), 0.015, "Inox", segs=4)
        k += 1.5
    b.build(col)
    return top + 0.04


# ============================================================ TERREO — SALAO E BAR (predio A)
TOPO = balcao("Interior_Balcao", T0, 17.4, 18.0, 4.6, 10.0, ZP, retorno=(17.4, 23.8, 4.6, 5.2))
cr = B.Mesh("Interior_Cristaleira")
X0, X1, Y0, Y1 = 23.45, 23.8, 5.45, 7.4
cr.box((X0, Y0, ZP), (X1, Y1, 0.95), "Madeira_Escura", skip=('nz', 'px'))
cr.box((X0 - 0.02, Y0 - 0.02, 0.95), (X1, Y1 + 0.02, 0.98), "Granito_Preto", skip=('px',))
cr.box((23.78, Y0, 0.98), (23.8, Y1, 2.25), "Espelho", skip=('px',))
for z in (1.38, 1.78, 2.18):
    cr.box((23.5, Y0, z), (23.78, Y1, z + 0.03), "Madeira_Escura", skip=('px',))
for y in (Y0, Y1 - 0.03):
    cr.box((23.5, y, 0.98), (23.78, y + 0.03, 2.21), "Madeira_Escura", skip=('px',))
B.add_collider("Mob_Cristaleira", (X0, Y0, ZP), (X1, Y1, 2.25))
cr.build(T0)
for z in (1.41, 1.81):
    garrafas(T0, 23.64, Y0 + 0.1, Y1 - 0.1, z)
yy = Y0 + 0.1
while yy <= Y1 - 0.1:                                  # prateleira de baixo: long-necks
    I(LONG, T0, 23.62 + rnd.uniform(-0.03, 0.03), yy, 0.982, rnd.uniform(0, 360))
    yy += 0.085
for y in (9.05, 9.77, 10.49):
    I("P_Geladeira_Expositor", T0, 23.46, y, ZP, -90, collide=True)
for x in (20.2, 21.65):
    I("P_Freezer", T0, x, 5.53, ZP, 180, collide=True)
I("P_Pia_Cozinha", T0, 22.3, 11.2, ZP, 0, collide=True)
I("P_Caixa_Registradora", T0, 17.7, 5.0, TOPO, -100)
I("P_Estufa", T0, 17.7, 7.0, TOPO, -90)
INTB = "Interativos_Bar"                       # objetos que o jogo precisa achar pelo nome (no proprio no glTF)
B.coll(INTB)
B.clear(INTB)
me_ch = bpy.data.meshes.get("A_chopeira")
if me_ch is None:
    I("P_Chopeira", T0, 17.72, 9.2, TOPO, -90)
else:
    # torneiras viradas para o lado do balconista (+X); o publico ve a lateral com a marca
    ch = B.inst(me_ch, "Chopeira", INTB, (17.70, 9.2, TOPO), 90)
    ch["interativo"] = "chopeira"
    for k, pos in enumerate(me_ch.get("fx_torneiras", []), 1):
        e = bpy.data.objects.new("Chopeira_FX_Torneira_%d" % k, None)
        e.empty_display_type = 'SPHERE'
        e.empty_display_size = 0.02
        e.parent = ch
        e.location = tuple(pos)
        e["fx"] = "torneira"
        B.coll(INTB).objects.link(e)
garrafas(T0, 17.65, 5.6, 6.1, TOPO, step=0.12)
linha_enfeites(T0, [(17.6, 6.35, 'C'), (17.66, 6.55, 'L'), (17.6, 7.6, 'C'), (17.7, 7.9, 'C'), (17.62, 8.3, 'L'),
                    (17.58, 8.7, 'C'), (17.64, 9.7, 'L'), (17.6, 9.85, 'C'), (18.6, 4.85, 'C'), (19.3, 4.9, 'L'),
                    (21.9, 4.85, 'C'), (22.6, 4.9, 'C')], TOPO)
for y in (5.3, 6.1, 6.9, 7.7, 8.5, 9.3):
    I(BANQ, T0, 17.0, y, ZP, rnd.uniform(0, 90), name="Banqueta")
for (x, y) in ((5.4, 5.2), (8.0, 5.2), (10.6, 5.2), (13.2, 5.2), (5.4, 7.6), (8.0, 7.6), (10.6, 7.6), (13.2, 7.6),
               (5.4, 10.0), (8.0, 10.0), (10.6, 10.0)):
    conjunto(T0, x, y)
I("P_TV", T0, 7.3, 11.5, 2.0, 0)
I("P_TV", T0, 3.7, 10.0, 2.0, 90)
I("P_TV", T0, 20.0, 3.7, 2.0, 180)
for (x, y) in ((6.7, 6.4), (11.9, 6.4), (6.7, 8.8), (11.9, 8.8), (20.8, 8.0)):
    I("P_Ventilador_Teto", T0, x, y, T1, 0)
luzes(T0, [(5.4, 4.4, 0), (9.3, 4.4, 0), (13.2, 4.4, 0), (5.4, 10.9, 0), (9.3, 10.9, 0), (14.5, 10.9, 0), (9.3, 7.6, 90),
           (15.3, 7.6, 90), (20.8, 6.5, 90), (20.8, 9.6, 90), (12.1, 13.2, 90), (5.5, 13.2, 90), (9.2, 13.2, 90), (20.2, 13.2, 0)], T1)
I("P_Luminaria_Tubular", T0, 14.85, 13.2, T2, 90, name="Luminaria_Escada")
I("P_Extintor", T0, 11.18, 12.6, ZP + 0.95, 90)
I("P_Extintor", T0, 23.6, 4.05, ZP + 0.95, -90)
I("P_Lixeira", T0, 3.95, 11.22, ZP, 0, collide=True)
I("P_Lixeira", T0, 18.3, 11.22, ZP, 0)
I("P_Lixeira", T0, 12.85, 14.5, ZP, 0)
# banheiros (masculino com 2 cabines + mictorios, feminino com 3 cabines)
for x in (4.35, 5.55):
    I("P_Vaso", T0, x, 14.52, ZP, 0, collide=True)
for y in (12.55, 13.35):
    I("P_Mictorio", T0, 7.25, y, ZP, -90)
I("P_Pia_Banheiro", T0, 3.7, 12.3, ZP, 90)
for x in (8.0, 9.2, 10.38):
    I("P_Vaso", T0, x, 14.52, ZP, 0, collide=True)
I("P_Pia_Banheiro", T0, 7.4, 12.4, ZP, 90)
I("P_Pia_Banheiro", T0, 10.95, 12.4, ZP, -90)
# deposito de bebidas (com janela de atendimento para o quintal)
I("P_Mesa_Inox", T0, 18.75, 14.45, ZP, 0, collide=True)
I("P_Freezer", T0, 21.15, 11.97, ZP, 180, collide=True)
for x in (17.3, 18.55):
    I("P_Prateleira", T0, x, 11.87, ZP, 0, collide=True)
    for z in (0.125, 0.625, 1.125):
        I("P_Caixa_Papelao", T0, x - 0.3, 11.87, ZP + z, 0)
        I("P_Caixa_Papelao", T0, x + 0.3, 11.87, ZP + z, 0)
pilha("P_Engradado_Amarelo", T0, 23.4, 11.95, ZP, 1, 1, 4, rot=90)
pilha("P_Engradado_Vermelho", T0, 23.4, 13.85, ZP, 1, 2, 3, rot=90)
pilha("P_Engradado_Amarelo", T0, 17.0, 14.5, ZP, 1, 1, 3)
for y in (14.0, 14.45):
    I("P_Barril", T0, 22.75, y, ZP, 0)
B.add_collider("Mob_Barris", (22.55, 13.8, ZP), (22.95, 14.65, ZP + 0.66))

# ============================================================ ANEXO — COZINHA, DEPOSITO, CAMARA FRIA
for x in (25.4, 26.35, 27.3):
    I("P_Fogao", T0, x, 0.6, ZP, 180, collide=True)
    I("P_Coifa", T0, x, 0.65, 1.85, 180)
I("P_Pia_Cozinha", T0, 31.5, 5.6, ZP, -90, collide=True)
for y in (4.6, 5.22):
    I("P_Mesa_Inox", T0, 27.8, y, ZP, 0, collide=True)
for x in (26.0, 26.75):
    I("P_Geladeira_Cozinha", T0, x, 8.65, ZP, 0, collide=True)
I("P_Prateleira", T0, 28.4, 8.8, ZP, 0, collide=True)
for z in (0.125, 0.625, 1.125, 1.625):
    for dx in (-0.35, 0.35):
        if rnd.random() < 0.8:
            I("P_Caixa_Papelao", T0, 28.4 + dx, 8.8, ZP + z, 0)
I("P_Freezer", T0, 24.33, 5.0, ZP, 90, collide=True)
I("P_Lixeira", T0, 31.4, 8.5, ZP, 0)
I("P_Extintor", T0, 24.12, 6.6, ZP + 0.95, 90)
luzes(T0, [(26.0, 3.0, 0), (29.5, 3.0, 0), (26.0, 6.5, 0), (29.5, 6.5, 0), (26.2, 12.0, 90), (30.2, 10.5, 0), (30.2, 13.4, 0)], T1)
for y in (10.0, 11.3):
    I("P_Prateleira", T0, 24.22, y, ZP, 90, collide=True)
    for z in (0.125, 0.625, 1.125):
        for dy in (-0.3, 0.3):
            I("P_Caixa_Papelao", T0, 24.22, y + dy, ZP + z, 90)
pilha("P_Engradado_Amarelo", T0, 26.2, 10.0, ZP, 2, 2, 4)
pilha("P_Engradado_Vermelho", T0, 26.2, 12.4, ZP, 2, 1, 3)
pilha("P_Engradado_Amarelo", T0, 27.4, 14.4, ZP, 1, 1, 2)
for x in (27.85, 28.3):
    I("P_Barril", T0, x, 13.2, ZP, 0)
B.add_collider("Mob_Barris", (27.65, 13.0, ZP), (28.5, 13.4, ZP + 0.66))
I("P_Prateleira", T0, 30.2, 14.55, ZP, 0, collide=True)
for z in (0.125, 0.625, 1.125, 1.625):
    for dx in (-0.35, 0.35):
        I("P_Caixa_Papelao", T0, 30.2 + dx, 14.55, ZP + z, 0)
pilha("P_Engradado_Vermelho", T0, 29.2, 12.5, ZP, 1, 2, 4)

# ============================================================ SUPERIOR — SALAO DE JOGOS E LOUNGE
for x in (6.3, 10.3, 14.3):
    I("P_Sinuca", S1, x, 7.6, ZP2, 0, collide=True)
    for dx in (-0.55, 0.55):
        I("P_Luminaria_Pendente", S1, x + dx, 7.6, T2, 0)
for x in (8.5, 15.6):
    I("P_Pebolim", S1, x, 4.75, ZP2, 0, collide=True)
I("P_Alvo_Dardos", S1, 3.7, 9.4, ZP2 + 1.73, 90)
for y in (6.8, 10.6):
    I("P_Suporte_Tacos", S1, 3.7, y, ZP2, 90)
I("P_Sofa", S1, 7.3, 11.1, ZP2, 0, collide=True)
I("P_TV", S1, 17.5, 3.7, ZP2 + 1.6, 180)
TOPO2 = balcao("Interior_Balcao_Lounge", S1, 21.0, 21.6, 7.4, 10.6, ZP2)
I("P_Geladeira_Expositor", S1, 23.46, 8.0, ZP2, -90, collide=True)
lb = B.Mesh("Interior_Aparador_Lounge")
lb.box((23.45, 8.9, ZP2), (23.8, 10.5, ZP2 + 0.95), "Madeira_Escura", skip=('nz', 'px'))
lb.box((23.43, 8.88, ZP2 + 0.95), (23.8, 10.52, ZP2 + 0.98), "Granito_Preto", skip=('px',))
B.add_collider("Mob_Aparador", (23.43, 8.88, ZP2), (23.8, 10.52, ZP2 + 0.98))
lb.build(S1)
garrafas(S1, 23.62, 9.0, 10.4, ZP2 + 0.98)
for y in (7.8, 8.6, 9.4, 10.2):
    I(BANQ, S1, 20.6, y, ZP2, rnd.uniform(0, 90), name="Banqueta")
linha_enfeites(S1, [(21.25, 7.7, 'C'), (21.32, 8.45, 'L'), (21.22, 9.3, 'C'), (21.3, 9.5, 'C'), (21.28, 10.3, 'L')], TOPO2)
for (x, y) in ((18.5, 5.0), (18.5, 9.6)):
    conjunto(S1, x, y, ZP2)
I("P_Lixeira", S1, 23.4, 11.15, ZP2, 0)
I("P_Extintor", S1, 16.75, 11.42, ZP2 + 0.95, 0)
luzes(S1, [(4.8, 4.6, 0), (4.8, 10.6, 0), (12.3, 4.6, 0), (12.3, 10.6, 0), (19.5, 7.4, 90), (22.4, 5.2, 0),
           (5.5, 13.2, 90), (9.2, 13.2, 90), (12.1, 13.2, 90), (20.2, 13.2, 0)], T2)
# banheiros superiores
I("P_Vaso", S1, 4.35, 14.52, ZP2, 0, collide=True)
I("P_Mictorio", S1, 7.25, 13.2, ZP2, -90)
I("P_Pia_Banheiro", S1, 3.7, 12.3, ZP2, 90)
for x in (8.0, 9.4):
    I("P_Vaso", S1, x, 14.52, ZP2, 0, collide=True)
I("P_Pia_Banheiro", S1, 10.95, 12.4, ZP2, -90)
# escritorio
I("P_Mesa_Escritorio", S1, 12.15, 14.5, ZP2, 0, collide=True)
I("P_Cadeira_Escritorio", S1, 12.15, 13.85, ZP2, 170)
I("P_Estante", S1, 11.28, 12.9, ZP2, 90, collide=True)
I("P_Cofre", S1, 12.85, 13.0, ZP2, 0, collide=True)
linha_enfeites(S1, [(12.55, 14.62, 'L'), (11.75, 14.6, 'C')], ZP2 + 0.75)
# deposito superior (cadeiras empilhadas, engradados, barris)
for x in (17.3, 18.55):
    I("P_Prateleira", S1, x, 11.87, ZP2, 0, collide=True)
    for z in (0.125, 0.625, 1.125, 1.625):
        for dx in (-0.3, 0.3):
            if rnd.random() < 0.75:
                I("P_Caixa_Papelao", S1, x + dx, 11.87, ZP2 + z, 0)
for (x, y) in ((20.9, 14.3), (21.6, 14.3), (22.3, 14.3)):
    for k in range(6):
        I(CAD, S1, x, y + k * 0.015, ZP2 + k * 0.075, 180 + rnd.uniform(-3, 3), name="Cadeira_Empilhada")
    B.add_collider("Mob_Cadeiras_Empilhadas", (x - 0.25, y - 0.25, ZP2), (x + 0.25, y + 0.25, ZP2 + 1.4))
pilha("P_Engradado_Amarelo", S1, 23.4, 12.1, ZP2, 1, 2, 3, rot=90)
for x in (17.2, 17.65):
    I("P_Barril", S1, x, 14.4, ZP2, 0)
B.add_collider("Mob_Barris", (17.0, 14.2, ZP2), (17.85, 14.6, ZP2 + 0.66))
# sacadas: sem mesas (so um vaso de planta no canto)
for x in (10.85, 18.85):
    I("P_Vaso_Planta", S1, x, 2.62, 3.65, rnd.uniform(0, 360), collide=True)

# ============================================================ TERRACO (laje do anexo)
for (x, y) in ((26.3, 2.6), (29.6, 2.6), (26.3, 6.7), (29.6, 6.7), (26.3, 10.8), (29.6, 10.8)):
    conjunto(TR, x, y, ZP2, enfeite=0.85, centro_livre=0.09)
    I("P_Guarda_Sol", TR, x, y, ZP2, rnd.uniform(0, 45))
linha_enfeites(TR, [(31.925, 3.4, 'C'), (31.925, 8.9, 'L'), (27.6, 0.075, 'C'), (24.6, 14.925, 'C')], ZP2 + 1.10)
for (x, y) in ((31.45, 0.55), (31.45, 14.45), (24.45, 14.45), (31.45, 8.6), (24.4, 0.6)):
    I("P_Vaso_Planta", TR, x, y, ZP2, rnd.uniform(0, 360), collide=True)
I("P_Lixeira", TR, 24.45, 4.3, ZP2, 0)

# ============================================================ QUINTAL
for x in (3.4, 7.8, 12.2, 16.6):
    for y in (18.1, 21.9):
        r_ = rnd.uniform(-2, 2)
        I("P_Mesa_Madeira", QT, x, y, ZP, r_, collide=True)
        if rnd.random() < 0.8:
            enfeitar(QT, x, y, ZP + 0.77, 0.72, 0.28, r_, n=rnd.choice((2, 3, 4, 5)))
linha_enfeites(QT, [(17.7, 15.25, 'C'), (18.3, 15.2, 'L'), (19.7, 15.28, 'C')], 1.2)            # balcao externo
linha_enfeites(QT, [(6.2, 25.3, 'C'), (6.45, 25.4, 'C'), (6.8, 25.35, 'L')], 0.95)              # bancada da churrasqueira
linha_enfeites(QT, [(24.35, 25.3, 'L')], ZP + 0.6 + 0.5)                                          # em cima do amplificador
for yv in (18.1, 21.9):
    for i in range(1, 12):
        t = i / 12
        I("P_Lampada_Varal", QT, 1.2 + 17.6 * t, yv, 2.85 - 0.3 * 4 * t * (1 - t), 0)
for (x, y) in ((24.8, 17.0), (27.8, 17.0), (30.7, 17.0)):
    conjunto(QT, x, y)
I("P_Arvore_A", QT, 21.2, 18.3, ZP, 30, scale=1.35)
I("P_Canteiro", QT, 21.2, 18.3, ZP, 0, scale=(1.6, 1.6, 1.0))
B.add_collider("Mob_Arvore_Quintal", (20.95, 18.05, ZP), (21.45, 18.55, ZP + 3.0))
for (x, y) in ((0.65, 18.7), (0.65, 23.3), (31.3, 15.6), (19.4, 25.3)):
    I("P_Vaso_Planta", QT, x, y, ZP, rnd.uniform(0, 360), collide=True)
for (x, y) in ((0.7, 16.0), (20.6, 24.9), (8.6, 25.3)):
    I("P_Lixeira", QT, x, y, ZP, 0)
pilha("P_Engradado_Vermelho", QT, 20.65, 15.45, ZP, 1, 1, 3)
I("P_Extintor", QT, 13.3, 15.1, ZP + 0.95, 180)
# palco
ZS = ZP + 0.6
for x in (22.2, 31.1):
    I("P_Caixa_Som", QT, x, 22.0, ZS, 0, collide=True)
I("P_Bateria", QT, 26.6, 24.6, ZS, 0)
B.add_collider("Mob_Bateria", (25.8, 24.1, ZS), (27.4, 25.2, ZS + 1.1))
I(BANQ, QT, 26.6, 25.25, ZS, 0, name="Banqueta")
for (x, y) in ((25.0, 22.4), (27.0, 22.4), (28.8, 22.6)):
    I("P_Pedestal_Mic", QT, x, y, ZS, rnd.uniform(-10, 10))
for x in (24.2, 29.4):
    I("P_Amplificador", QT, x, 25.3, ZS, 0, collide=True)
for x in (25.0, 28.8):
    I(BANQ, QT, x, 23.3, ZS, 0, name="Banqueta")
for x in (23.0, 25.5, 28.0, 30.5):
    I("P_Refletor", QT, x, 21.8, 4.05, 0)
I("P_Luminaria_Tubular", QT, 26.6, 24.5, 4.45, 0, name="Luminaria_Palco")

# ============================================================ VARANDA
for x in (1.9, 4.3, 9.4, 11.9, 17.4, 19.8, 22.2):
    conjunto(VAR, x, 1.75)
for y in (8.3, 12.9):
    conjunto(VAR, 1.7, y)
pilha("P_Engradado_Vermelho", VAR, 3.15, 14.5, ZP, 1, 1, 4)
pilha("P_Engradado_Amarelo", VAR, 2.77, 14.5, ZP, 1, 1, 3)
I("P_Lixeira", VAR, 5.25, 0.45, ZP, 0, collide=True)
I("P_Lixeira", VAR, 0.45, 6.3, ZP, 0)
for (x, y) in ((2.2, 1.75), (6.8, 1.75), (10.7, 1.75), (15.0, 1.75), (19.8, 1.75), (1.75, 5.5), (1.75, 10.0), (1.75, 13.5)):
    I("P_Lampada_Varanda", VAR, x, y, FORRO, 0)

g = B.Mesh("Varanda_GuardaCorpo")
south_x = [0.12 + 2.68 * k for k in range(9)] + [23.89]
west_y = [0.12, 3.05, 6.0, 8.95, 11.9, 14.85]
spans = [((south_x[i], 0.12), (south_x[i + 1], 0.12)) for i in range(len(south_x) - 1) if i not in (2, 5)]
spans += [((0.12, west_y[i]), (0.12, west_y[i + 1])) for i in range(len(west_y) - 1) if i != 1]
WB = "Metal_Branco"
for (p0, p1) in spans:
    a, c_ = Vector(p0), Vector(p1)
    d = (c_ - a).normalized()
    a2, c2 = a + d * 0.09, c_ - d * 0.09
    for z in (ZP + 0.14, ZP + 0.55, ZP + 0.97):
        h = 0.025 if z < ZP + 0.9 else 0.03
        mn = Vector((min(a2.x, c2.x), min(a2.y, c2.y), z - h))
        mx = Vector((max(a2.x, c2.x), max(a2.y, c2.y), z + h))
        if abs(d.x) > 0.5:
            mn.y -= h; mx.y += h
        else:
            mn.x -= h; mx.x += h
        g.box(mn, mx, WB)
    n = max(2, round((c2 - a2).length / 0.85))
    for i in range(n + 1):
        q = a2 + (c2 - a2) * (i / n)
        g.box((q.x - 0.02, q.y - 0.02, ZP), (q.x + 0.02, q.y + 0.02, ZP + 0.94), WB, skip=('nz', 'pz'))
    B.add_collider("Mob_GuardaCorpo", (min(a2.x, c2.x) - 0.04, min(a2.y, c2.y) - 0.04, ZP),
                   (max(a2.x, c2.x) + 0.04, max(a2.y, c2.y) + 0.04, ZP + 1.0))
g.build(VAR)

for c, m in _sombras.items():
    m.build(c)
for c in (T0, S1, VAR, QT, TR):
    print(c, len(bpy.data.collections[c].objects), "objetos")
