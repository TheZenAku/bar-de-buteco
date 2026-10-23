# Ruas e calcadas do bairro ampliado: grade de 7x7 quadras (5x5 jogaveis + anel externo decorativo).
# Cada quadra (i, j) gera sua propria malha de calcada e de asfalto -> o export agrupa em pedacos (chunks)
# para o jogo poder fazer frustum culling.
import math
import bpy
import barlib as B

COL = "Exterior_Rua"
B.coll(COL)
B.clear(COL)
B.clear_colliders("Rua")

W, CURB, ZC = 3.0, 0.12, B.Z_CALCADA
RING = 3
IDX = range(-RING, RING + 1)
q = B.quadra
X0, X1 = q(-RING, 0)[0], q(RING, 0)[1]
Y0, Y1 = q(0, -RING)[2], q(0, RING)[3]
SEM_CHAO = {(0, 0), (0, 1), (1, -1)}                 # bar, praca e campinho tem piso proprio (07_exterior)


def quad(m, x0, y0, x1, y1, z, mat):
    m.face([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], mat, facing=(0, 0, 1))


def bar(m, x0, y0, x1, y1, z=0.006):
    quad(m, x0, y0, x1, y1, z, "Pintura_Branca")


for i in IDX:
    for j in IDX:
        x0, x1, y0, y1 = q(i, j)
        S, N, Wd, Ed = j > -RING, j < RING, i > -RING, i < RING
        cal = B.Mesh("Rua_Calcada_%d_%d" % (i, j))
        asf = B.Mesh("Rua_Asfalto_%d_%d" % (i, j))
        xi0, xi1 = x0 + (W if Wd else 0), x1 - (W if Ed else 0)
        yi0, yi1 = y0 + (W if S else 0), y1 - (W if N else 0)
        if (i, j) not in SEM_CHAO:
            quad(cal, xi0, yi0, xi1, yi1, ZC, "Concreto")
        if S:
            quad(cal, xi0, y0 + CURB, xi1, y0 + W, ZC, "Pedra_Portuguesa")
            quad(cal, xi0, y0, xi1, y0 + CURB, ZC, "Concreto")
            cal.face([(xi0, y0, 0), (xi1, y0, 0), (xi1, y0, ZC), (xi0, y0, ZC)], "Concreto", facing=(0, -1, 0))
        if N:
            quad(cal, xi0, y1 - W, xi1, y1 - CURB, ZC, "Pedra_Portuguesa")
            quad(cal, xi0, y1 - CURB, xi1, y1, ZC, "Concreto")
            cal.face([(xi0, y1, 0), (xi1, y1, 0), (xi1, y1, ZC), (xi0, y1, ZC)], "Concreto", facing=(0, 1, 0))
        if Wd:
            quad(cal, x0 + CURB, yi0, x0 + W, yi1, ZC, "Pedra_Portuguesa")
            quad(cal, x0, yi0, x0 + CURB, yi1, ZC, "Concreto")
            cal.face([(x0, yi0, 0), (x0, yi1, 0), (x0, yi1, ZC), (x0, yi0, ZC)], "Concreto", facing=(-1, 0, 0))
        if Ed:
            quad(cal, x1 - W, yi0, x1 - CURB, yi1, ZC, "Pedra_Portuguesa")
            quad(cal, x1 - CURB, yi0, x1, yi1, ZC, "Concreto")
            cal.face([(x1, yi0, 0), (x1, yi1, 0), (x1, yi1, ZC), (x1, yi0, ZC)], "Concreto", facing=(1, 0, 0))
        corners = []
        if S and Wd:
            corners.append(((x0 + W, y0 + W), 180, (x0, y0)))
        if S and Ed:
            corners.append(((x1 - W, y0 + W), 270, (x1, y0)))
        if N and Ed:
            corners.append(((x1 - W, y1 - W), 0, (x1, y1)))
        if N and Wd:
            corners.append(((x0 + W, y1 - W), 90, (x0, y1)))
        for (cx, cy), a0, (px, py) in corners:
            angs = [math.radians(a0 + 90 * k / 10) for k in range(11)]
            pin = [(cx + (W - CURB) * math.cos(a), cy + (W - CURB) * math.sin(a)) for a in angs]
            pout = [(cx + W * math.cos(a), cy + W * math.sin(a)) for a in angs]
            cal.face([(cx, cy, ZC)] + [(x, y, ZC) for x, y in pin], "Pedra_Portuguesa", facing=(0, 0, 1))
            for k in range(10):
                cal.face([(*pout[k], ZC), (*pout[k + 1], ZC), (*pin[k + 1], ZC), (*pin[k], ZC)], "Concreto", facing=(0, 0, 1))
                cal.face([(*pout[k], 0), (*pout[k + 1], 0), (*pout[k + 1], ZC), (*pout[k], ZC)], "Concreto", away=(cx, cy, 0.07))
            asf.face([(px, py, 0)] + [(x, y, 0) for x, y in pout], "Asfalto", facing=(0, 0, 1))
        B.add_collider("Rua_Quadra", (x0, y0, 0.0), (x1, y1, ZC))
        # asfalto: rua ao norte, rua a leste e o cruzamento NE desta quadra (cobre tudo uma unica vez)
        if N:
            ya, yb = y1, q(i, j + 1)[2]
            quad(asf, x0, ya, x1, yb, 0.0, "Asfalto")
            yc = (ya + yb) / 2
            x = x0 + 9.0
            while x + 1.8 < x1 - 9.0:
                bar(asf, x, yc - 0.08, x + 1.8, yc + 0.08); x += 3.2
        if Ed:
            xa, xb = x1, q(i + 1, j)[0]
            quad(asf, xa, y0, xb, y1, 0.0, "Asfalto")
            xc = (xa + xb) / 2
            y = y0 + 9.0
            while y + 1.8 < y1 - 9.0:
                bar(asf, xc - 0.08, y, xc + 0.08, y + 1.8); y += 3.2
        if N and Ed:
            quad(asf, x1, y1, q(i + 1, j)[0], q(i, j + 1)[2], 0.0, "Asfalto")
        # bocas de lobo junto ao meio-fio, perto das esquinas
        for t in [(x0 + 6, y0 - 0.25, 0) if S else None, (x1 - 6, y1 + 0.25, 0) if N else None,
                  (x0 - 0.25, y1 - 6, 90) if Wd else None, (x1 + 0.25, y0 + 6, 90) if Ed else None]:
            if t is None:
                continue
            bx, by, rot = t
            hx, hy = (0.45, 0.18) if rot == 0 else (0.18, 0.45)
            quad(asf, bx - hx, by - hy, bx + hx, by + hy, 0.004, "Metal_Escuro")
            for k in range(6):
                o = -hx + 0.08 + k * 0.15 if rot == 0 else -hy + 0.08 + k * 0.15
                if rot == 0:
                    quad(asf, bx + o, by - hy + 0.04, bx + o + 0.06, by + hy - 0.04, 0.006, "Borracha_Preta")
                else:
                    quad(asf, bx - hx + 0.04, by + o, bx + hx - 0.04, by + o + 0.06, 0.006, "Borracha_Preta")
        cal.build(COL)
        if asf.bm.faces:
            asf.build(COL)
        else:
            asf.bm.free()

# faixas de pedestres em volta do bar e da praca, linhas de retencao e PARE
fx = B.Mesh("Rua_Sinalizacao")


def faixa_h(xa, ya):          # atravessa rua horizontal (ya..ya+8)
    for k in range(9):
        y = ya + 0.45 + k * 0.85
        bar(fx, xa, y, xa + 3.0, y + 0.42)


def faixa_v(ya, xa):          # atravessa rua vertical (xa..xa+8)
    for k in range(9):
        x = xa + 0.45 + k * 0.85
        bar(fx, x, ya, x + 0.42, ya + 3.0)


for (i, j) in ((0, 0), (0, 1)):
    x0, x1, y0, y1 = q(i, j)
    for xa in (x0 + 4.0, x1 - 7.0):
        faixa_h(xa, y0 - B.RUA_W); faixa_h(xa, y1)
    for ya in (y0 + 4.0, y1 - 7.0):
        faixa_v(ya, x0 - B.RUA_W); faixa_v(ya, x1)
bar(fx, 4.6, -6.85, 5.0, -3.25)
bar(fx, -10.75, 4.6, -7.15, 5.0)
bar(fx, 27.0, 29.25, 27.4, 32.85)
bar(fx, 39.25, 21.2, 42.85, 21.6)
fx.build(COL)
me = B.text_mesh("Rua_PARE_txt", "PARE", size=1.5, res=1)
me.materials.append(bpy.data.materials["Pintura_Branca"])
for name, loc, rot in (("Rua_PARE_Sul", (7.2, -5.05, 0.006), 90.0), ("Rua_PARE_Oeste", (-8.95, 7.0, 0.006), 180.0),
                       ("Rua_PARE_Norte", (24.8, 31.05, 0.006), -90.0), ("Rua_PARE_Leste", (41.05, 18.8, 0.006), 0.0)):
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = (0, 0, math.radians(rot))
    o.scale = (1.0, 1.9, 1.0)
    B.coll(COL).objects.link(o)

# colisores: leito das ruas e limite da area jogavel (borda interna do anel externo)
B.add_collider("Rua_Leito", (X0, Y0, -0.5), (X1, Y1, 0.0))
PX0, PX1 = q(-RING, 0)[1], q(RING, 0)[0]
PY0, PY1 = q(0, -RING)[3], q(0, RING)[2]
for (a, b, c, d) in ((PX0 - 0.5, PY0, PX0, PY1), (PX1, PY0, PX1 + 0.5, PY1), (PX0, PY0 - 0.5, PX1, PY0), (PX0, PY1, PX1, PY1 + 0.5)):
    B.add_collider("Rua_Limite", (a, b, 0.0), (c, d, 8.0))
print("rua ok: mapa x %.0f..%.0f y %.0f..%.0f | jogavel x %.0f..%.0f y %.0f..%.0f" % (X0, X1, Y0, Y1, PX0, PX1, PY0, PY1))
