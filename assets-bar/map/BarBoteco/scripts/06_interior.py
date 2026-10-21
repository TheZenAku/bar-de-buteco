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


def I(proto, col, x, y, z=ZP, rot=0.0, collide=False, name=None, scale=None):
    o = B.inst(proto, name or proto[2:], col, (x, y, z), rot, scale=scale)
    if collide:
        B.collider_obj("Mob_" + proto[2:], o)
    return o


def conjunto(col, x, y, z=ZP, rot=0.0, chairs=4):
    I("P_Mesa_Plastico", col, x, y, z, rot + rnd.uniform(-4, 4), collide=True)
    for k in range(chairs):
        a = math.radians(rot + 90 * k + (90 if chairs == 2 else 0))
        I("P_Cadeira_Plastico", col, x + 0.62 * math.sin(a), y - 0.62 * math.cos(a), z, math.degrees(a) + 180 + rnd.uniform(-10, 10))


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
for z in (0.98, 1.41, 1.81):
    garrafas(T0, 23.64, Y0 + 0.1, Y1 - 0.1, z)
for y in (8.9, 9.62, 10.34):
    I("P_Geladeira_Expositor", T0, 23.46, y, ZP, -90, collide=True)
for x in (20.2, 21.65):
    I("P_Freezer", T0, x, 5.53, ZP, 180, collide=True)
I("P_Pia_Cozinha", T0, 22.3, 11.2, ZP, 0, collide=True)
I("P_Caixa_Registradora", T0, 17.7, 5.0, TOPO, -100)
I("P_Estufa", T0, 17.7, 7.0, TOPO, -90)
I("P_Chopeira", T0, 17.72, 9.2, TOPO, -90)
garrafas(T0, 17.65, 5.6, 6.1, TOPO, step=0.12)
for y in (5.3, 6.1, 6.9, 7.7, 8.5, 9.3):
    I("P_Banqueta", T0, 17.02, y, ZP, rnd.uniform(0, 90))
for (x, y) in ((5.4, 5.3), (8.0, 5.3), (10.6, 5.3), (13.2, 5.3), (5.4, 7.6), (8.0, 7.6), (10.6, 7.6), (13.2, 7.6),
               (5.4, 9.9), (8.0, 9.9), (10.6, 9.9)):
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
    I("P_Banqueta", S1, 20.62, y, ZP2, rnd.uniform(0, 90))
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
I("P_Cofre", S1, 12.85, 12.05, ZP2, 0, collide=True)
# deposito superior (cadeiras empilhadas, engradados, barris)
for x in (17.3, 18.55):
    I("P_Prateleira", S1, x, 11.87, ZP2, 0, collide=True)
    for z in (0.125, 0.625, 1.125, 1.625):
        for dx in (-0.3, 0.3):
            if rnd.random() < 0.75:
                I("P_Caixa_Papelao", S1, x + dx, 11.87, ZP2 + z, 0)
for (x, y) in ((20.9, 14.3), (21.6, 14.3), (22.3, 14.3)):
    for k in range(6):
        I("P_Cadeira_Plastico", S1, x, y, ZP2 + k * 0.09, 180 + rnd.uniform(-4, 4))
    B.add_collider("Mob_Cadeiras_Empilhadas", (x - 0.25, y - 0.25, ZP2), (x + 0.25, y + 0.25, ZP2 + 1.4))
pilha("P_Engradado_Amarelo", S1, 23.4, 12.1, ZP2, 1, 2, 3, rot=90)
for x in (17.2, 17.65):
    I("P_Barril", S1, x, 14.4, ZP2, 0)
B.add_collider("Mob_Barris", (17.0, 14.2, ZP2), (17.85, 14.6, ZP2 + 0.66))
# sacadas
for x in (12.0, 20.0):
    conjunto(S1, x, 2.9, 3.65, rot=90, chairs=2)

# ============================================================ TERRACO (laje do anexo)
for (x, y) in ((26.3, 2.6), (29.6, 2.6), (26.3, 6.7), (29.6, 6.7), (26.3, 10.8), (29.6, 10.8)):
    conjunto(TR, x, y, ZP2)
    I("P_Guarda_Sol", TR, x, y, ZP2, rnd.uniform(0, 45))
for (x, y) in ((31.45, 0.55), (31.45, 14.45), (24.45, 14.45), (31.45, 8.6), (24.4, 0.6)):
    I("P_Vaso_Planta", TR, x, y, ZP2, rnd.uniform(0, 360), collide=True)
I("P_Lixeira", TR, 24.45, 4.3, ZP2, 0)

# ============================================================ QUINTAL
for x in (3.4, 7.8, 12.2, 16.6):
    for y in (18.1, 21.9):
        I("P_Mesa_Madeira", QT, x, y, ZP, rnd.uniform(-2, 2), collide=True)
for yv in (18.1, 21.9):
    for i in range(1, 12):
        t = i / 12
        I("P_Lampada_Varal", QT, 1.2 + 17.6 * t, yv, 2.85 - 0.3 * 4 * t * (1 - t), 0)
for (x, y) in ((24.8, 17.0), (28.0, 17.0), (30.9, 17.0)):
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
I("P_Banqueta", QT, 26.6, 25.25, ZS, 0)
for (x, y) in ((25.0, 22.4), (27.0, 22.4), (28.8, 22.6)):
    I("P_Pedestal_Mic", QT, x, y, ZS, rnd.uniform(-10, 10))
for x in (24.2, 29.4):
    I("P_Amplificador", QT, x, 25.3, ZS, 0, collide=True)
for x in (25.0, 28.8):
    I("P_Banqueta", QT, x, 23.3, ZS, 0)
for x in (23.0, 25.5, 28.0, 30.5):
    I("P_Refletor", QT, x, 21.8, 4.05, 0)
I("P_Luminaria_Tubular", QT, 26.6, 24.5, 4.45, 0, name="Luminaria_Palco")

# ============================================================ VARANDA
for x in (2.2, 4.0, 9.5, 11.9, 17.5, 19.8, 22.1):
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

for c in (T0, S1, VAR, QT, TR):
    print(c, len(bpy.data.collections[c].objects), "objetos")
