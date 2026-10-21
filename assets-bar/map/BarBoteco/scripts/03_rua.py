# Ruas, calcadas em pedra portuguesa, meio-fio e sinalizacao.
# O bar ocupa o quarteirao inteiro (lote 0..32 x 0..26), cercado por 4 ruas.
import math
import bpy
import barlib as B

COL = "Exterior_Rua"
B.coll(COL)
B.clear(COL)
B.clear_colliders("Rua")

W, CURB, ZC = 3.0, 0.12, B.Z_CALCADA
X0, X1, Y0, Y1 = B.MAP_X0, B.MAP_X1, B.MAP_Y0, B.MAP_Y1
HS = [(-11.0, -3.0), (29.0, 37.0)]           # ruas horizontais (sul, norte)
VS = [(-11.0, -3.0), (35.0, 43.0)]           # ruas verticais (oeste, leste)

# quadras: (nome, x0, x1, y0, y1, lados com rua)
blocks = [
    ("Bar", -3.0, 35.0, -3.0, 29.0, "SNWE"),
    ("S", -3.0, 35.0, Y0, -11.0, "NWE"), ("N", -3.0, 35.0, 37.0, Y1, "SWE"),
    ("W", X0, -11.0, -3.0, 29.0, "SNE"), ("E", 43.0, X1, -3.0, 29.0, "SNW"),
    ("SW", X0, -11.0, Y0, -11.0, "NE"), ("SE", 43.0, X1, Y0, -11.0, "NW"),
    ("NW", X0, -11.0, 37.0, Y1, "SE"), ("NE", 43.0, X1, 37.0, Y1, "SW"),
]
cal = B.Mesh("Rua_Calcadas")
asf = B.Mesh("Rua_Asfalto")


def quad(m, x0, y0, x1, y1, z, mat):
    m.face([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], mat, facing=(0, 0, 1))


for (nm, x0, x1, y0, y1, st) in blocks:
    S, N, Wd, Ed = ('S' in st), ('N' in st), ('W' in st), ('E' in st)
    xi0, xi1 = x0 + (W if Wd else 0), x1 - (W if Ed else 0)
    yi0, yi1 = y0 + (W if S else 0), y1 - (W if N else 0)
    if nm != "Bar":
        quad(cal, xi0, yi0, xi1, yi1, ZC, "Concreto")           # chao dos lotes vizinhos
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
        angs = [math.radians(a0 + 90 * i / 8) for i in range(9)]
        pin = [(cx + (W - CURB) * math.cos(a), cy + (W - CURB) * math.sin(a)) for a in angs]
        pout = [(cx + W * math.cos(a), cy + W * math.sin(a)) for a in angs]
        cal.face([(cx, cy, ZC)] + [(x, y, ZC) for x, y in pin], "Pedra_Portuguesa", facing=(0, 0, 1))
        for i in range(8):
            cal.face([(*pout[i], ZC), (*pout[i + 1], ZC), (*pin[i + 1], ZC), (*pin[i], ZC)], "Concreto", facing=(0, 0, 1))
            cal.face([(*pout[i], 0), (*pout[i + 1], 0), (*pout[i + 1], ZC), (*pout[i], ZC)], "Concreto", away=(cx, cy, 0.07))
        asf.face([(px, py, 0)] + [(x, y, 0) for x, y in pout], "Asfalto", facing=(0, 0, 1))
    B.add_collider("Rua_Quadra", (x0, y0, 0.0), (x1, y1, ZC))

# leito das ruas
for (ya, yb) in HS:
    quad(asf, X0, ya, X1, yb, 0.0, "Asfalto")
segs_y = [(Y0, HS[0][0]), (HS[0][1], HS[1][0]), (HS[1][1], Y1)]
for (xa, xb) in VS:
    for (ya, yb) in segs_y:
        quad(asf, xa, ya, xb, yb, 0.0, "Asfalto")

# sinalizacao horizontal
ZP = 0.006


def bar(x0, y0, x1, y1):
    quad(asf, x0, y0, x1, y1, ZP, "Pintura_Branca")


def faixa_h(xa, ya):          # faixa de pedestres atravessando rua horizontal (ya..ya+8)
    for i in range(9):
        y = ya + 0.45 + i * 0.85
        bar(xa, y, xa + 3.0, y + 0.42)


def faixa_v(ya, xa):          # atravessando rua vertical (xa..xa+8)
    for i in range(9):
        x = xa + 0.45 + i * 0.85
        bar(x, ya, x + 0.42, ya + 3.0)


for xa in (1.0, 28.0):
    faixa_h(xa, -11.0); faixa_h(xa, 29.0)
for ya in (1.0, 22.0):
    faixa_v(ya, -11.0); faixa_v(ya, 35.0)
bar(4.6, -6.85, 5.0, -3.25)          # retencao: rua sul, sentido oeste
bar(-10.75, 4.6, -7.15, 5.0)         # rua oeste, sentido sul
bar(27.0, 29.25, 27.4, 32.85)        # rua norte, sentido leste
bar(39.25, 21.2, 42.85, 21.6)        # rua leste, sentido norte
for (ya, yb) in HS:                  # tracejado central
    yc = (ya + yb) / 2
    for (xa, xb) in ((X0, -11.0), (-3.0, 35.0), (43.0, X1)):
        x = xa + 9.0
        while x + 1.8 < xb - 9.0:
            bar(x, yc - 0.08, x + 1.8, yc + 0.08); x += 3.2
for (xa, xb) in VS:
    xc = (xa + xb) / 2
    for (ya, yb) in segs_y:
        y = ya + 9.0
        while y + 1.8 < yb - 9.0:
            bar(xc - 0.08, y, xc + 0.08, y + 1.8); y += 3.2
asf.build(COL)
cal.build(COL)

me = B.text_mesh("Rua_PARE_txt", "PARE", size=1.5, res=1)
me.materials.append(bpy.data.materials["Pintura_Branca"])
for name, loc, rot in (("Rua_PARE_Sul", (7.2, -5.05, ZP), 90.0), ("Rua_PARE_Oeste", (-8.95, 7.0, ZP), 180.0),
                       ("Rua_PARE_Norte", (24.8, 31.05, ZP), -90.0), ("Rua_PARE_Leste", (41.05, 18.8, ZP), 0.0)):
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = (0, 0, math.radians(rot))
    o.scale = (1.0, 1.9, 1.0)
    B.coll(COL).objects.link(o)

B.add_collider("Rua_Leito", (X0, Y0, -0.5), (X1, Y1, 0.0))
for (a, b, c, d) in ((X0 - 1, Y0, X0, Y1), (X1, Y0, X1 + 1, Y1), (X0, Y0 - 1, X1, Y0), (X0, Y1, X1, Y1 + 1)):
    B.add_collider("Rua_Limite", (a, b, 0.0), (c, d, 6.0))
print("rua ok")
