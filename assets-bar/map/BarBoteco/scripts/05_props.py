# Prototipos low-poly (malhas compartilhadas por instancias). Origem no chao; frente para -Y.
import math, random
from mathutils import Vector, Matrix
import barlib as B

R = B.mat_rz
B.clear("Interior_Terreo", "Interior_Superior", "Varanda_Mobiliario", "Exterior_Mobiliario",
        "Quintal_Mobiliario", "Terraco_Mobiliario")
V = "Plastico_Vermelho"
built = []


def done(m):
    built.append(m.mesh().name)


def legs4(m, hx, hy, z0, z1, s, mat):
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((sx * hx - s, sy * hy - s, z0), (sx * hx + s, sy * hy + s, z1), mat, skip=('nz', 'pz'))


# ---------------------------------------------------------------- mobilia de bar
m = B.Mesh("P_Mesa_Plastico")
m.box((-0.35, -0.35, 0.69), (0.35, 0.35, 0.72), V)
m.box((-0.33, -0.33, 0.64), (0.33, 0.33, 0.69), V, skip=('pz',))
legs4(m, 0.29, 0.29, 0.0, 0.64, 0.025, V)
done(m)

m = B.Mesh("P_Cadeira_Plastico")
m.box((-0.22, -0.21, 0.42), (0.22, 0.21, 0.46), V)
for (x, y) in ((-0.19, -0.17), (0.19, -0.17), (-0.19, 0.17), (0.19, 0.17)):
    m.box((x - 0.02, y - 0.02, 0), (x + 0.02, y + 0.02, 0.42), V, skip=('nz', 'pz'))
m.box((-0.22, -0.02, 0), (0.22, 0.02, 0.44), V, M=R((0, 0.2, 0.46), rx_deg=-12))
for sx in (-1, 1):
    m.box((sx * 0.22 - 0.02, -0.19, 0.62), (sx * 0.22 + 0.02, 0.2, 0.65), V)
    m.box((sx * 0.22 - 0.015, -0.19, 0.46), (sx * 0.22 + 0.015, -0.16, 0.62), V, skip=('nz', 'pz'))
done(m)

m = B.Mesh("P_Banqueta")
m.cyl(0.17, 0.05, "Madeira_Escura", segs=10, M=R((0, 0, 0.70)))
legs4(m, 0.12, 0.12, 0.0, 0.70, 0.015, "Metal_Escuro")
for s in (-1, 1):
    m.box((-0.12, s * 0.12 - 0.008, 0.28), (0.12, s * 0.12 + 0.008, 0.30), "Metal_Escuro")
    m.box((s * 0.12 - 0.008, -0.12, 0.28), (s * 0.12 + 0.008, 0.12, 0.30), "Metal_Escuro")
done(m)

for nm, col in (("P_Engradado_Amarelo", "Plastico_Amarelo"), ("P_Engradado_Vermelho", V)):
    m = B.Mesh(nm)
    m.box((-0.175, -0.155, 0), (0.175, 0.155, 0.29), col, mats={'pz': "Garrafa_Ambar"}, skip=('nz',))
    m.box((-0.07, -0.157, 0.22), (0.07, -0.155, 0.26), "Borracha_Preta", skip=('py',))
    done(m)

for nm, col in (("P_Garrafa_Verde", "Garrafa_Verde"), ("P_Garrafa_Ambar", "Garrafa_Ambar"), ("P_Garrafa_Clara", "Garrafa_Clara")):
    m = B.Mesh(nm)
    m.cyl(0.035, 0.19, col, segs=10, caps=(False, False))
    m.cyl(0.035, 0.05, col, segs=10, r2=0.013, M=R((0, 0, 0.19)), caps=(False, False))
    m.cyl(0.013, 0.07, col, segs=8, M=R((0, 0, 0.24)), caps=(False, True))
    done(m)

m = B.Mesh("P_Geladeira_Expositor")
m.box((-0.35, -0.33, 0.08), (0.35, 0.33, 1.95), "Plastico_Branco", mats={'ny': "Geladeira_Frente"},
      uvrects={'ny': B.REG['geladeira']}, skip=('nz',))
m.box((-0.34, -0.30, 0), (0.34, 0.32, 0.08), "Metal_Escuro", skip=('nz', 'pz'))
done(m)

m = B.Mesh("P_Freezer")
m.box((-0.65, -0.32, 0.06), (0.65, 0.32, 0.85), "Plastico_Branco", skip=('nz',))
m.box((-0.64, -0.33, 0.78), (0.64, -0.32, 0.79), "Metal_Escuro", skip=('py',))
m.box((-0.25, -0.36, 0.70), (0.25, -0.33, 0.74), "Metal_Escuro", skip=('py',))
m.box((-0.40, -0.325, 0.30), (0.40, -0.32, 0.62), V, skip=('py',))
m.box((-0.60, -0.30, 0), (0.60, 0.30, 0.06), "Metal_Escuro", skip=('nz', 'pz'))
done(m)

m = B.Mesh("P_Caixa_Registradora")
m.box((-0.18, -0.18, 0), (0.18, 0.18, 0.10), "Metal_Escuro", skip=('nz',))
m.box((-0.14, -0.14, 0.10), (0.14, 0.02, 0.115), "Plastico_Branco", skip=('nz',))
m.box((-0.12, 0.06, 0.10), (0.12, 0.10, 0.30), "Metal_Escuro", skip=('nz',))
done(m)

m = B.Mesh("P_Chopeira")
m.box((-0.15, -0.12, 0), (0.15, 0.12, 0.40), "Inox", skip=('nz',))
for x in (-0.07, 0.07):
    m.tube((x, -0.12, 0.32), (x, -0.2, 0.32), 0.012, "Inox", segs=6)
    m.box((x - 0.012, -0.215, 0.32), (x + 0.012, -0.19, 0.42), "Borracha_Preta")
m.box((-0.15, -0.24, 0), (0.15, -0.12, 0.02), "Metal_Escuro", skip=('nz',))
done(m)

m = B.Mesh("P_Estufa")
m.box((-0.35, -0.2, 0), (0.35, 0.2, 0.08), "Inox", skip=('nz',))
m.box((-0.34, -0.19, 0.08), (0.34, 0.19, 0.40), "Vidro", skip=('nz',))
m.box((-0.35, -0.2, 0.40), (0.35, 0.2, 0.42), "Inox")
for i in range(4):
    for j in range(2):
        m.cyl(0.035, 0.08, "Salgado", segs=5, r2=0.0, M=R((-0.24 + i * 0.16, -0.07 + j * 0.14, 0.08)), caps=(False, False))
done(m)

m = B.Mesh("P_TV")
m.box((-0.56, -0.05, 0), (0.56, 0.0, 0.66), "Metal_Escuro", skip=('py',))
u0, v0, u1, v1 = B.REG['tv']
m.face([(-0.53, -0.051, 0.03), (0.53, -0.051, 0.03), (0.53, -0.051, 0.63), (-0.53, -0.051, 0.63)], "Tela_TV",
       uvs=[(u0, v0), (u1, v0), (u1, v1), (u0, v1)], facing=(0, -1, 0))
done(m)

m = B.Mesh("P_Ventilador_Teto")
m.tube((0, 0, 0), (0, 0, -0.36), 0.015, "Plastico_Branco", segs=6)
m.cyl(0.11, 0.12, "Plastico_Branco", segs=10, M=R((0, 0, -0.48)))
for k in range(3):
    m.box((0.10, -0.065, -0.44), (0.70, 0.065, -0.43), "Madeira", M=R((0, 0, 0), rz_deg=k * 120))
done(m)

m = B.Mesh("P_Luminaria_Tubular")
m.box((-0.62, -0.09, -0.07), (0.62, 0.09, 0.0), "Plastico_Branco", mats={'nz': "Lampada"}, skip=('pz',))
done(m)

m = B.Mesh("P_Luminaria_Pendente")
m.tube((0, 0, 0), (0, 0, -0.75), 0.006, "Fio", segs=4)
m.cyl(0.25, 0.22, "Feltro_Verde", segs=12, r2=0.05, M=R((0, 0, -0.97)), caps=(False, True))
m.face([(0.22 * math.cos(2 * math.pi * i / 12), 0.22 * math.sin(2 * math.pi * i / 12), -0.95) for i in range(12)],
       "Lampada", facing=(0, 0, -1))
done(m)

m = B.Mesh("P_Lampada_Varanda")
m.tube((0, 0, 0), (0, 0, -0.30), 0.006, "Fio", segs=4)
m.cyl(0.03, 0.05, "Metal_Escuro", segs=6, M=R((0, 0, -0.35)))
m.sphere("Lampada", R((0, 0, -0.41), scale=(0.06, 0.06, 0.075)), subdiv=1)
done(m)

m = B.Mesh("P_Extintor")
m.cyl(0.08, 0.48, V, segs=8)
m.cyl(0.03, 0.06, "Metal_Escuro", segs=6, M=R((0, 0, 0.48)))
m.box((-0.01, -0.1, 0.50), (0.01, 0.0, 0.53), "Metal_Escuro")
m.tube((0.06, 0, 0.50), (0.09, 0, 0.15), 0.012, "Borracha_Preta", segs=4)
done(m)

m = B.Mesh("P_Lixeira")
m.cyl(0.19, 0.68, "Borracha_Preta", segs=10, caps=(False, False))
m.cyl(0.20, 0.06, "Borracha_Preta", segs=10, r2=0.17, M=R((0, 0, 0.68)), caps=(True, True))
done(m)

# ---------------------------------------------------------------- cozinha / deposito
m = B.Mesh("P_Fogao")
m.box((-0.45, -0.4, 0.12), (0.45, 0.4, 0.82), "Inox", skip=('nz',))
legs4(m, 0.40, 0.35, 0.0, 0.12, 0.03, "Metal_Escuro")
for (x, y) in ((-0.21, -0.18), (0.21, -0.18), (-0.21, 0.18), (0.21, 0.18)):
    m.box((x - 0.17, y - 0.16, 0.82), (x + 0.17, y + 0.16, 0.85), "Metal_Escuro", skip=('nz',))
    m.cyl(0.06, 0.02, "Borracha_Preta", segs=8, M=R((x, y, 0.85)), caps=(False, True), smooth=False)
for x in (-0.3, -0.1, 0.1, 0.3):
    m.box((x - 0.025, -0.43, 0.72), (x + 0.025, -0.40, 0.77), "Metal_Escuro", skip=('py',))
m.box((-0.38, -0.405, 0.22), (0.38, -0.40, 0.60), "Janela_Escura", skip=('py',))
done(m)

m = B.Mesh("P_Coifa")
b0 = [(-0.5, -0.45, 0), (0.5, -0.45, 0), (0.5, 0.45, 0), (-0.5, 0.45, 0)]
t0 = [(-0.15, -0.15, 0.45), (0.15, -0.15, 0.45), (0.15, 0.15, 0.45), (-0.15, 0.15, 0.45)]
for i in range(4):
    m.face([b0[i], b0[(i + 1) % 4], t0[(i + 1) % 4], t0[i]], "Inox", away=(0, 0, 0.1))
m.box((-0.5, -0.45, -0.08), (0.5, 0.45, 0.0), "Inox", mats={'nz': "Metal_Escuro"}, skip=('pz',))
m.box((-0.15, -0.15, 0.45), (0.15, 0.15, 1.40), "Inox", skip=('nz', 'pz'))
done(m)

m = B.Mesh("P_Pia_Cozinha")
m.box((-0.75, -0.3, 0), (0.75, 0.3, 0.86), "Inox", skip=('nz',))
m.box((-0.77, -0.31, 0.86), (0.77, 0.31, 0.90), "Inox")
m.face([(-0.55, -0.2, 0.902), (0.0, -0.2, 0.902), (0.0, 0.2, 0.902), (-0.55, 0.2, 0.902)], "Metal_Escuro", facing=(0, 0, 1))
m.tube((-0.27, 0.25, 0.9), (-0.27, 0.25, 1.18), 0.015, "Inox", segs=6)
m.tube((-0.27, 0.25, 1.18), (-0.27, 0.05, 1.18), 0.015, "Inox", segs=6)
for x in (-0.05, 0.05):
    m.box((x - 0.01, -0.33, 0.55), (x + 0.01, -0.30, 0.75), "Metal_Escuro", skip=('py',))
done(m)

m = B.Mesh("P_Mesa_Inox")
m.box((-0.7, -0.3, 0.85), (0.7, 0.3, 0.90), "Inox")
m.box((-0.66, -0.27, 0.18), (0.66, 0.27, 0.20), "Inox")
legs4(m, 0.66, 0.27, 0.0, 0.85, 0.018, "Inox")
done(m)

m = B.Mesh("P_Geladeira_Cozinha")
m.box((-0.35, -0.35, 0.05), (0.35, 0.35, 1.80), "Plastico_Branco", skip=('nz',))
m.box((-0.34, -0.36, 1.18), (0.34, -0.35, 1.20), "Metal_Escuro", skip=('py',))
m.box((0.25, -0.40, 1.25), (0.28, -0.36, 1.60), "Inox")
m.box((0.25, -0.40, 0.70), (0.28, -0.36, 1.10), "Inox")
m.box((-0.33, -0.33, 0), (0.33, 0.33, 0.05), "Metal_Escuro", skip=('nz', 'pz'))
done(m)

m = B.Mesh("P_Prateleira")
legs4(m, 0.6, 0.2, 0.0, 1.8, 0.015, "Metal_Escuro")
for z in (0.10, 0.60, 1.10, 1.60):
    m.box((-0.6, -0.2, z), (0.6, 0.2, z + 0.025), "Inox")
done(m)

m = B.Mesh("P_Caixa_Papelao")
m.box((-0.2, -0.15, 0), (0.2, 0.15, 0.30), "Papelao", skip=('nz',))
m.box((-0.2, -0.02, 0.30), (0.2, 0.02, 0.302), "Plastico_Amarelo", skip=('nz',))
done(m)

m = B.Mesh("P_Barril")
m.cyl(0.2, 0.6, "Inox", segs=10, caps=(False, True))
for z in (0.08, 0.48):
    m.cyl(0.205, 0.04, "Inox", segs=10, M=R((0, 0, z)), caps=(False, False))
m.cyl(0.03, 0.06, "Metal_Escuro", segs=6, M=R((0, 0, 0.6)))
done(m)

# ---------------------------------------------------------------- banheiros
m = B.Mesh("P_Vaso")
m.cyl(0.13, 0.36, "Louca_Branca", segs=10, M=R((0, -0.05, 0), scale=(1, 1.25, 1)), caps=(False, False))
m.cyl(0.20, 0.06, "Louca_Branca", segs=12, M=R((0, -0.08, 0.34), scale=(0.95, 1.25, 1)), caps=(True, False))
m.cyl(0.20, 0.025, "Plastico_Branco", segs=12, M=R((0, -0.08, 0.40), scale=(0.95, 1.25, 1)), caps=(False, True))
m.box((-0.19, 0.12, 0.40), (0.19, 0.28, 0.80), "Louca_Branca")
m.box((-0.05, 0.18, 0.80), (0.05, 0.22, 0.815), "Inox", skip=('nz',))
done(m)

m = B.Mesh("P_Mictorio")
m.box((-0.17, -0.30, 0.50), (0.17, 0.0, 1.10), "Louca_Branca", skip=('py',))
m.face([(-0.12, -0.301, 0.62), (0.12, -0.301, 0.62), (0.12, -0.301, 1.0), (-0.12, -0.301, 1.0)], "Plastico_Branco", facing=(0, -1, 0))
m.tube((0, -0.03, 1.10), (0, -0.03, 1.35), 0.015, "Inox", segs=6)
done(m)

m = B.Mesh("P_Pia_Banheiro")
m.box((-0.25, -0.45, 0.78), (0.25, 0.0, 0.88), "Louca_Branca", skip=('py',))
m.face([(-0.18, -0.38, 0.882), (0.18, -0.38, 0.882), (0.18, -0.09, 0.882), (-0.18, -0.09, 0.882)], "Plastico_Branco", facing=(0, 0, 1))
m.cyl(0.07, 0.78, "Louca_Branca", segs=8, M=R((0, -0.18, 0)), caps=(False, False))
m.tube((0, -0.05, 0.88), (0, -0.05, 1.02), 0.012, "Inox", segs=6)
m.tube((0, -0.05, 1.02), (0, -0.17, 1.02), 0.012, "Inox", segs=6)
m.box((-0.30, -0.012, 1.15), (0.30, 0.0, 1.75), "Espelho", skip=('py',))
done(m)

# ---------------------------------------------------------------- pavimento superior / escritorio
m = B.Mesh("P_Sinuca")
D = "Madeira_Escura"
m.box((-1.1, -0.6, 0.62), (1.1, 0.6, 0.80), D, skip=('pz',))
m.face([(-0.98, -0.48, 0.80), (0.98, -0.48, 0.80), (0.98, 0.48, 0.80), (-0.98, 0.48, 0.80)], "Feltro_Verde", facing=(0, 0, 1))
for (mn, mx) in (((-1.1, -0.6), (1.1, -0.48)), ((-1.1, 0.48), (1.1, 0.6)), ((-1.1, -0.48), (-0.98, 0.48)), ((0.98, -0.48), (1.1, 0.48))):
    m.box((mn[0], mn[1], 0.80), (mx[0], mx[1], 0.86), D, skip=('nz',))
for (mn, mx) in (((-0.98, -0.48), (0.98, -0.45)), ((-0.98, 0.45), (0.98, 0.48)), ((-0.98, -0.45), (-0.95, 0.45)), ((0.95, -0.45), (0.98, 0.45))):
    m.box((mn[0], mn[1], 0.80), (mx[0], mx[1], 0.835), "Feltro_Verde", skip=('nz',))
for (x, y) in ((-1.04, -0.54), (0.0, -0.54), (1.04, -0.54), (-1.04, 0.54), (0.0, 0.54), (1.04, 0.54)):
    m.face([(x - 0.05, y - 0.05, 0.862), (x + 0.05, y - 0.05, 0.862), (x + 0.05, y + 0.05, 0.862), (x - 0.05, y + 0.05, 0.862)],
           "Borracha_Preta", facing=(0, 0, 1))
legs4(m, 0.88, 0.40, 0.0, 0.62, 0.07, D)
for (x, y, mat) in ((-0.5, 0.0, "Louca_Branca"), (0.45, 0.05, V), (0.52, -0.02, "Plastico_Amarelo"), (0.52, 0.12, "Borracha_Preta")):
    m.sphere(mat, R((x, y, 0.828), scale=(0.028, 0.028, 0.028)), subdiv=1)
m.box((-0.9, -0.3, 0.80), (0.3, -0.288, 0.812), "Madeira", M=R((0, 0, 0), rz_deg=6))
done(m)

m = B.Mesh("P_Suporte_Tacos")
m.box((-0.38, -0.05, 1.20), (0.38, 0.0, 1.30), D, skip=('py',))
m.box((-0.38, -0.08, 0.10), (0.38, 0.0, 0.17), D, skip=('py',))
for i in range(6):
    x = -0.30 + i * 0.12
    m.box((x - 0.011, -0.06, 0.15), (x + 0.011, -0.038, 1.55), "Madeira", skip=('nz',))
done(m)

m = B.Mesh("P_Sofa")
T = "Tecido_Marrom"
m.box((-0.9, -0.4, 0.08), (0.9, 0.4, 0.42), T)
m.box((-0.9, 0.2, 0.42), (0.9, 0.4, 0.85), T, skip=('nz',))
for (a, b_) in ((-0.9, -0.72), (0.72, 0.9)):
    m.box((a, -0.4, 0.42), (b_, 0.2, 0.62), T, skip=('nz',))
legs4(m, 0.82, 0.32, 0.0, 0.08, 0.03, "Metal_Escuro")
done(m)

m = B.Mesh("P_Mesa_Escritorio")
m.box((-0.6, -0.3, 0.72), (0.6, 0.3, 0.75), D)
m.box((-0.6, -0.28, 0), (-0.57, 0.28, 0.72), D, skip=('nz', 'pz'))
m.box((0.15, -0.28, 0.05), (0.6, 0.28, 0.72), D, skip=('pz',))
m.box((-0.57, 0.26, 0.35), (0.15, 0.28, 0.72), D, skip=('pz',))
m.box((-0.25, 0.12, 0.83), (0.25, 0.16, 1.12), "Metal_Escuro")
m.box((-0.04, 0.13, 0.75), (0.04, 0.17, 0.83), "Metal_Escuro", skip=('nz',))
m.box((-0.2, -0.17, 0.75), (0.2, -0.03, 0.77), "Metal_Escuro", skip=('nz',))
for y in (0.0, 0.2, 0.4):
    m.box((0.33, -0.285, 0.12 + y), (0.43, -0.28, 0.15 + y), "Inox", skip=('py',))
done(m)

m = B.Mesh("P_Cadeira_Escritorio")
m.box((-0.23, -0.23, 0.44), (0.23, 0.23, 0.52), T)
m.box((-0.22, 0.2, 0.56), (0.22, 0.26, 1.0), T)
m.box((-0.03, 0.19, 0.5), (0.03, 0.23, 0.6), "Metal_Escuro")
m.tube((0, 0, 0.08), (0, 0, 0.44), 0.025, "Metal_Escuro", segs=6)
for k in range(5):
    m.box((0.0, -0.02, 0.04), (0.30, 0.02, 0.08), "Metal_Escuro", M=R((0, 0, 0), rz_deg=k * 72 + 90))
done(m)

m = B.Mesh("P_Estante")
m.box((-0.45, -0.175, 0), (-0.43, 0.175, 1.8), D)
m.box((0.43, -0.175, 0), (0.45, 0.175, 1.8), D)
m.box((-0.43, 0.155, 0), (0.43, 0.175, 1.8), D, skip=('py',))
for z in (0.0, 0.45, 0.9, 1.35, 1.78):
    m.box((-0.43, -0.175, z), (0.43, 0.155, z + 0.02), D)
rnd = random.Random(5)
for z in (0.02, 0.47, 0.92, 1.37):
    x = -0.41
    while x < 0.3:
        w = rnd.uniform(0.06, 0.25)
        h = rnd.uniform(0.22, 0.38)
        mat = rnd.choice(("Papelao", "Caixa_Agua", V, "Plastico_Branco", "Papelao"))
        m.box((x, -0.12, z), (x + w, 0.13, z + h), mat, skip=('nz',))
        x += w + rnd.uniform(0.0, 0.05)
done(m)

m = B.Mesh("P_Cofre")
m.box((-0.25, -0.25, 0), (0.25, 0.25, 0.6), "Metal_Escuro", skip=('nz',))
m.cyl(0.05, 0.02, "Inox", segs=8, M=R((0.05, -0.25, 0.35), rx_deg=90))
done(m)

# ---------------------------------------------------------------- exterior
m = B.Mesh("P_Carrinho_Churrasco")
m.box((-0.45, -0.27, 0.45), (0.45, 0.27, 0.90), "Inox")
m.box((-0.47, -0.29, 0.90), (0.47, 0.29, 0.96), "Inox")
m.tube((0.2, 0.0, 0.96), (0.2, 0.0, 1.25), 0.04, "Inox", segs=6, caps=(False, True))
for y in (-0.22, 0.22):
    m.box((-0.42, y - 0.02, 0.0), (-0.38, y + 0.02, 0.45), "Inox", skip=('nz', 'pz'))
    m.tube((-0.45, y, 0.82), (-0.80, y, 0.90), 0.015, "Inox", segs=5)
m.tube((-0.80, -0.24, 0.90), (-0.80, 0.24, 0.90), 0.02, "Borracha_Preta", segs=5)
for y in (-0.34, 0.28):
    m.cyl(0.18, 0.06, "Borracha_Preta", segs=10, M=Matrix.Translation((0.35, y, 0.18)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'), cap_mat="Inox")
done(m)


def arvore(name, seed, folha="Folhas", escala=1.0):
    """Arvore com tronco ramificado e copa de varios volumes (mais cheia que a versao anterior)."""
    rnd = random.Random(seed)
    a = B.Mesh(name)
    s_ = escala
    pts = [(0, 0, -0.05), (0.08, 0.03, 1.0 * s_), (0.02, 0.1, 1.9 * s_), (-0.05, 0.05, 2.6 * s_)]
    for i, rr in enumerate((0.14, 0.115, 0.09)):
        a.tube(pts[i], pts[i + 1], rr * s_, "Casca", segs=8)
    for (dx, dy, dz) in ((0.7, 0.3, 0.8), (-0.6, -0.3, 0.9), (0.1, -0.7, 0.85), (-0.2, 0.65, 0.95)):
        a.tube((0.02, 0.1, 1.9 * s_), (dx * s_, dy * s_, (1.9 + dz) * s_), 0.055 * s_, "Casca", segs=5)
    vols = [((0, 0.05, 3.2), (1.65, 1.6, 1.15), 2), ((0.75, 0.35, 2.95), (1.0, 0.95, 0.8), 2),
            ((-0.7, -0.3, 3.0), (1.0, 1.05, 0.8), 1), ((0.15, -0.75, 3.05), (0.9, 0.85, 0.75), 1),
            ((-0.2, 0.7, 3.1), (0.9, 0.9, 0.75), 1), ((0.05, -0.05, 3.85), (1.0, 1.0, 0.6), 1)]
    for (c, sc, sd) in vols:
        cc = (c[0] * s_ + rnd.uniform(-0.1, 0.1), c[1] * s_ + rnd.uniform(-0.1, 0.1), c[2] * s_)
        a.sphere(folha, R(cc, rz_deg=rnd.uniform(0, 360), scale=tuple(v * s_ for v in sc)), subdiv=sd, jitter=0.10 * s_, rng=rnd)
    done(a)


arvore("P_Arvore_A", 11)
arvore("P_Arvore_B", 23, escala=1.12)
arvore("P_Arvore_Ipe", 37, folha="Folhas_Ipe", escala=1.05)

m = B.Mesh("P_Canteiro")
m.face([(-0.5, -0.5, 0.004), (0.5, -0.5, 0.004), (0.5, 0.5, 0.004), (-0.5, 0.5, 0.004)], "Terra", facing=(0, 0, 1))
for (mn, mx) in (((-0.56, -0.56), (0.56, -0.5)), ((-0.56, 0.5), (0.56, 0.56)), ((-0.56, -0.5), (-0.5, 0.5)), ((0.5, -0.5), (0.56, 0.5))):
    m.box((mn[0], mn[1], 0), (mx[0], mx[1], 0.06), "Concreto", skip=('nz',))
done(m)


def poste(name, luz=False, trafo=False):
    p = B.Mesh(name)
    p.cyl(0.17, 10.0, "Concreto", segs=12, r2=0.09, caps=(False, True))
    p.box((-0.06, -0.95, 9.25), (0.06, 0.95, 9.37), "Concreto")
    for y in (-0.8, 0.0, 0.8):
        p.cyl(0.035, 0.12, "Louca_Branca", segs=6, M=R((0, y, 9.37)))
    p.box((-0.04, -0.10, 7.45), (0.16, 0.10, 7.95), "Metal_Escuro")
    if luz:
        p.tube((0.1, 0, 8.3), (1.7, 0, 8.75), 0.04, "Metal_Branco", segs=5)
        p.box((1.55, -0.13, 8.62), (2.10, 0.13, 8.80), "Metal_Escuro", mats={'nz': "Lampada"})
    if trafo:
        p.cyl(0.32, 0.9, "Metal_Escuro", segs=10, M=R((-0.48, 0, 6.6)))
        p.box((-0.2, -0.1, 7.0), (-0.12, 0.1, 7.2), "Metal_Escuro")
    done(p)


poste("P_Poste")
poste("P_Poste_Luz", luz=True)
poste("P_Poste_Trafo", luz=True, trafo=True)


def carro(name, paint, sedan=False):
    """Carro com perfil mais arredondado, caixa de roda, retrovisores, para-choques e rodas de 14 lados."""
    c = B.Mesh(name)
    Wd, Wt = 0.84, 0.70                      # meia largura da carroceria / do teto (tumblehome)
    if sedan:
        low = [(-2.25, 0.34), (2.2, 0.34), (2.27, 0.48), (2.24, 0.66), (2.1, 0.80), (1.15, 0.92)]
        top = [(0.55, 1.34), (0.25, 1.40), (-0.95, 1.40), (-1.35, 1.30)]
        back = [(-1.75, 0.98), (-2.2, 0.95), (-2.28, 0.78), (-2.3, 0.55)]
        win = [(0.98, 0.98), (0.5, 1.30), (-0.95, 1.32), (-1.30, 1.0)]
    else:
        low = [(-1.9, 0.34), (1.85, 0.34), (1.95, 0.50), (1.93, 0.66), (1.8, 0.82), (0.9, 0.94)]
        top = [(0.3, 1.33), (0.0, 1.41), (-1.2, 1.42), (-1.55, 1.36)]
        back = [(-1.83, 1.05), (-1.92, 0.80), (-1.94, 0.58)]
        win = [(0.78, 0.99), (0.22, 1.30), (-1.35, 1.34), (-1.68, 1.02)]
    prof = low + top + back
    nlow = len(low)
    for sy in (-1, 1):                       # lateral da carroceria (abaixo da linha de cintura)
        c.face([(x, sy * Wd, z) for x, z in low] + [(x, sy * Wd, z) for x, z in back], paint, facing=(0, sy, 0))
    for i in range(len(prof)):
        (x0, z0), (x1, z1) = prof[i], prof[(i + 1) % len(prof)]
        in_top0, in_top1 = nlow <= i < nlow + len(top), nlow <= (i + 1) % len(prof) < nlow + len(top)
        w0, w1 = (Wt if in_top0 else Wd), (Wt if in_top1 else Wd)
        mat = paint
        if i == 0:
            mat = "Borracha_Preta"
        elif i == nlow - 1 or i == nlow + len(top) - 1:
            mat = "Janela_Escura"
        c.face([(x0, -w0, z0), (x1, -w1, z1), (x1, w1, z1), (x0, w0, z0)], mat, away=(0, 0, 0.85))
    for sy in (-1, 1):
        ys = sy * Wd
        # estufa lateral (vidros) inclinada
        g = [(win[0][0], ys * 0.995, win[0][1]), (win[1][0], sy * (Wt + 0.005), win[1][1]),
             (win[2][0], sy * (Wt + 0.005), win[2][1]), (win[3][0], ys * 0.995, win[3][1])]
        c.face(g, "Janela_Escura", facing=(0, sy, 0.3))
        c.face([(low[-1][0], ys, low[-1][1])] + [(x, sy * Wt, z) for (x, z) in top] + [(back[0][0], ys, back[0][1])],
               paint, facing=(0, sy, 0.3))                                   # estufa segue a curva do teto (sem frestas)
        c.box((low[2][0] - 0.1, sy * 0.52 - 0.15, 0.60), (low[2][0] - 0.01, sy * 0.52 + 0.15, 0.72), "Farol")
        c.box((back[-1][0] - 0.01, sy * 0.60 - 0.12, 0.70), (back[-1][0] + 0.07, sy * 0.60 + 0.12, 0.86), V)
        c.box((win[0][0] - 0.12, sy * Wd, 0.98), (win[0][0] - 0.02, sy * (Wd + 0.14), 1.06), "Borracha_Preta")   # retrovisor
        c.box((-0.7, sy * (Wd + 0.002), 0.78), (-0.55, sy * (Wd + 0.012), 0.81), "Inox")                          # macaneta
        for x in ((1.38, -1.45) if sedan else (1.22, -1.22)):
            y0 = -0.92 if sy < 0 else 0.72
            c.cyl(0.31, 0.20, "Borracha_Preta", segs=14, M=Matrix.Translation((x, y0, 0.31)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'),
                  cap_mat="Inox", smooth=True)
            c.box((x - 0.42, sy * Wd - 0.02, 0.34), (x + 0.42, sy * Wd + 0.01, 0.62), "Borracha_Preta", skip=('nz',))  # caixa de roda
    xf, xb = low[2][0], back[-1][0]
    c.box((xf - 0.02, -0.80, 0.36), (xf + 0.07, 0.80, 0.52), "Borracha_Preta")                                     # para-choques
    c.box((xb - 0.07, -0.80, 0.36), (xb + 0.02, 0.80, 0.52), "Borracha_Preta")
    c.box((xf + 0.07, -0.25, 0.40), (xf + 0.08, 0.25, 0.50), "Plastico_Branco")                                    # placas
    c.box((xb - 0.08, -0.25, 0.55), (xb - 0.07, 0.25, 0.65), "Plastico_Branco")
    c.face([(xf - 0.2, -0.75, 0.33), (xb + 0.2, -0.75, 0.33), (xb + 0.2, 0.75, 0.33), (xf - 0.2, 0.75, 0.33)],
           "Borracha_Preta", facing=(0, 0, -1))
    done(c)


for cor in ("Prata", "Vermelho", "Branco", "Azul", "Preto"):
    carro("P_Carro_" + cor, "Carro_" + cor)
for cor in ("Prata", "Branco", "Preto"):
    carro("P_Sedan_" + cor, "Carro_" + cor, sedan=True)

# ---------------------------------------------------------------- mobiliario urbano do bairro
MD = "Madeira"


m = B.Mesh("P_Banco_Praca")                            # banco de praca (ripas de madeira e pes de ferro)
for k in range(4):
    m.box((-0.9, -0.22 + k * 0.11, 0.42), (0.9, -0.14 + k * 0.11, 0.46), MD)
for k in range(3):
    m.box((-0.9, 0.20, 0.55 + k * 0.12), (0.9, 0.24, 0.63 + k * 0.12), MD, M=R((0, 0, 0), rx_deg=-8))
for x in (-0.75, 0.75):
    m.box((x - 0.03, -0.24, 0), (x + 0.03, 0.22, 0.42), "Metal_Escuro", skip=('nz',))
    m.box((x - 0.03, 0.18, 0.42), (x + 0.03, 0.26, 0.92), "Metal_Escuro", M=R((0, 0, 0), rx_deg=-8))
done(m)

m = B.Mesh("P_Banca_Jornal")                           # banca de jornal com toldo
m.box((-1.4, -1.0, 0), (1.4, 1.0, 2.5), "Metal_Escuro", mats={'ny': "Metal_Ondulado"}, skip=('nz',))
m.box((-1.5, -1.6, 2.5), (1.5, 1.1, 2.6), "Plastico_Amarelo")
m.box((-1.2, -1.02, 2.6), (1.2, -0.99, 3.1), "Plastico_Amarelo", mats={'ny': "Atlas_Bairro"}, uvrects={'ny': B.arect(512, 896, 768, 1024)})
for x in (-1.45, 1.45):
    m.tube((x, -1.55, 0), (x, -1.55, 2.5), 0.03, "Metal_Escuro", segs=5)
done(m)

m = B.Mesh("P_Ponto_Onibus")                           # abrigo de onibus
for x in (-1.6, 1.6):
    m.box((x - 0.05, 0.35, 0), (x + 0.05, 0.45, 2.4), "Metal_Escuro", skip=('nz',))
m.box((-1.8, -0.4, 2.4), (1.8, 0.6, 2.5), "Metal_Escuro")
m.face([(-1.55, 0.42, 0.3), (1.55, 0.42, 0.3), (1.55, 0.42, 2.3), (-1.55, 0.42, 2.3)], "Vidro")
m.box((-1.4, 0.05, 0.42), (1.4, 0.35, 0.47), MD)
for x in (-1.2, 1.2):
    m.box((x - 0.03, 0.15, 0), (x + 0.03, 0.25, 0.42), "Metal_Escuro", skip=('nz',))
m.tube((1.85, -0.2, 0), (1.85, -0.2, 2.7), 0.035, "Metal_Escuro", segs=6)
m.box((1.85 - 0.02, -0.5, 2.3), (1.85 + 0.02, 0.1, 2.75), "Metal_Escuro", mats={'nx': "Atlas_Bairro", 'px': "Atlas_Bairro"},
      uvrects={'nx': B.arect(0, 896, 256, 1024), 'px': B.arect(0, 896, 256, 1024)})
done(m)

m = B.Mesh("P_Orelhao")                                # telefone publico (orelhao)
m.tube((0, 0, 0), (0, 0, 1.6), 0.04, "Metal_Escuro", segs=6)
m.sphere("Plastico_Laranja", R((0, -0.1, 1.75), scale=(0.42, 0.40, 0.50)), subdiv=2)
m.box((-0.12, -0.15, 1.35), (0.12, -0.05, 1.7), "Caixa_Agua")
done(m)

for k, (nm, reg) in enumerate((("P_Placa_Rua_A", ((512, 768, 768, 832), (512, 832, 768, 896))),
                                ("P_Placa_Rua_B", ((768, 768, 1024, 832), (768, 832, 1024, 896))))):
    m = B.Mesh(nm)
    m.tube((0, 0, 0), (0, 0, 2.9), 0.03, "Metal_Escuro", segs=6)
    m.box((-0.02, -0.5, 2.55), (0.02, 0.5, 2.8), "Metal_Escuro", mats={'nx': "Atlas_Bairro", 'px': "Atlas_Bairro"},
          uvrects={'nx': B.arect(*reg[0]), 'px': B.arect(*reg[0])})
    m.box((-0.5, -0.02, 2.25), (0.5, 0.02, 2.5), "Metal_Escuro", mats={'ny': "Atlas_Bairro", 'py': "Atlas_Bairro"},
          uvrects={'ny': B.arect(*reg[1]), 'py': B.arect(*reg[1])})
    done(m)

m = B.Mesh("P_Cavalete")                               # cavalete de obra (fecha as saidas do mapa)
m.box((-1.0, -0.03, 0.55), (1.0, 0.03, 0.85), "Atlas_Bairro", uvrects={'ny': B.arect(256, 896, 512, 1024), 'py': B.arect(256, 896, 512, 1024)})
m.box((-1.0, -0.03, 0.15), (1.0, 0.03, 0.35), "Atlas_Bairro", uvrects={'ny': B.arect(256, 896, 512, 1024), 'py': B.arect(256, 896, 512, 1024)})
for x in (-0.85, 0.85):
    for sy in (-1, 1):
        m.tube((x, sy * 0.25, 0), (x, 0, 0.9), 0.03, "Metal_Branco", segs=4)
done(m)

m = B.Mesh("P_Cone")
m.cyl(0.18, 0.7, "Plastico_Laranja", segs=10, r2=0.03, caps=(False, False))
m.box((-0.2, -0.2, 0), (0.2, 0.2, 0.03), "Borracha_Preta", skip=('nz',))
m.cyl(0.115, 0.08, "Metal_Branco", segs=10, r2=0.09, M=R((0, 0, 0.30)), caps=(False, False))
done(m)

m = B.Mesh("P_Trave")                                  # trave de futebol (gol)
for y in (-1.5, 1.5):
    m.tube((0, y, 0), (0, y, 2.0), 0.05, "Metal_Branco", segs=8)
m.tube((0, -1.5, 2.0), (0, 1.5, 2.0), 0.05, "Metal_Branco", segs=8)
for y in (-1.5, 1.5):
    m.tube((0, y, 2.0), (0.9, y, 0.0), 0.025, "Metal_Branco", segs=5)
m.tube((0.9, -1.5, 0.02), (0.9, 1.5, 0.02), 0.025, "Metal_Branco", segs=5)
done(m)

m = B.Mesh("P_AC")                                     # ar-condicionado de janela/split na fachada
m.box((-0.42, -0.30, 0), (0.42, 0.0, 0.32), "Plastico_Branco", mats={'ny': "Metal_Ondulado"}, skip=('py',))
m.box((-0.38, -0.32, -0.04), (0.38, -0.02, 0.0), "Metal_Escuro")
done(m)

m = B.Mesh("P_Antena")                                 # antena parabolica
m.tube((0, 0, 0), (0, 0, 0.8), 0.025, "Metal_Escuro", segs=5)
m.cyl(0.40, 0.14, "Plastico_Branco", segs=12, r2=0.05, M=Matrix.Translation((0, -0.05, 0.9)) @ Matrix.Rotation(math.radians(-60), 4, 'X'),
      caps=(True, False), smooth=True)
done(m)

m = B.Mesh("P_Caixa_Agua_Casa")
m.cyl(0.55, 0.75, "Caixa_Agua", segs=14, caps=(False, False))
m.cyl(0.58, 0.12, "Caixa_Agua", segs=14, r2=0.4, M=R((0, 0, 0.75)))
done(m)

m = B.Mesh("P_Bueiro")                                 # boca de lobo (grelha junto ao meio-fio)
m.face([(-0.45, -0.18, 0.004), (0.45, -0.18, 0.004), (0.45, 0.18, 0.004), (-0.45, 0.18, 0.004)], "Metal_Escuro", facing=(0, 0, 1))
for k in range(7):
    x = -0.39 + k * 0.13
    m.face([(x, -0.15, 0.006), (x + 0.06, -0.15, 0.006), (x + 0.06, 0.15, 0.006), (x, 0.15, 0.006)], "Borracha_Preta", facing=(0, 0, 1))
done(m)


# ---------------------------------------------------------------- quintal / palco / jogos / terraco
def circulo(m, r, y, z, mat, n=12, x=0.0):
    """Disco vertical voltado para -Y (frente)."""
    m.face([(x + r * math.cos(2 * math.pi * i / n), y, z + r * math.sin(2 * math.pi * i / n)) for i in range(n)], mat, facing=(0, -1, 0))


MD = "Madeira"
m = B.Mesh("P_Mesa_Madeira")                  # mesa de madeira com bancos (tipo piquenique)
m.box((-0.9, -0.4, 0.72), (0.9, 0.4, 0.77), MD)
for x in (-0.7, 0.7):
    m.box((x - 0.04, -0.35, 0), (x + 0.04, 0.35, 0.72), MD, skip=('nz', 'pz'))
    m.box((x - 0.04, -0.75, 0.36), (x + 0.04, 0.75, 0.40), MD)
    for sy in (-1, 1):
        m.box((x - 0.04, sy * 0.62 - 0.04, 0), (x + 0.04, sy * 0.62 + 0.04, 0.42), MD, skip=('nz', 'pz'))
for sy in (-1, 1):
    m.box((-0.9, sy * 0.62 - 0.15, 0.42), (0.9, sy * 0.62 + 0.15, 0.46), MD)
done(m)

m = B.Mesh("P_Pebolim")
m.box((-0.6, -0.36, 0.62), (0.6, 0.36, 0.92), D, skip=('pz',))
m.face([(-0.56, -0.32, 0.80), (0.56, -0.32, 0.80), (0.56, 0.32, 0.80), (-0.56, 0.32, 0.80)], "Feltro_Verde", facing=(0, 0, 1))
legs4(m, 0.52, 0.28, 0.0, 0.62, 0.04, D)
for i in range(8):
    x = -0.49 + i * 0.14
    m.tube((x, -0.52, 0.88), (x, 0.52, 0.88), 0.008, "Inox", segs=4)
    m.box((x - 0.02, -0.58 if i % 2 else 0.52, 0.86), (x + 0.02, -0.52 if i % 2 else 0.58, 0.90), "Borracha_Preta")
    team = V if i in (0, 1, 3, 5) else "Caixa_Agua"
    for k in range((1, 2, 3, 5, 5, 3, 2, 1)[i]):
        y = (k - ((1, 2, 3, 5, 5, 3, 2, 1)[i] - 1) / 2) * 0.12
        m.box((x - 0.015, y - 0.012, 0.80), (x + 0.015, y + 0.012, 0.91), team, skip=('nz',))
done(m)

m = B.Mesh("P_Alvo_Dardos")                    # origem no centro do alvo, encostado na parede (y=0)
m.box((-0.32, -0.04, -0.32), (0.32, 0.0, 0.32), D, skip=('py',))
for k, (r, mat) in enumerate(((0.23, "Borracha_Preta"), (0.17, "Louca_Branca"), (0.12, V), (0.08, "Louca_Branca"),
                              (0.03, "Garrafa_Verde"), (0.012, V))):
    circulo(m, r, -0.042 - 0.002 * k, 0.0, mat, n=16 if r > 0.1 else 8)
done(m)

m = B.Mesh("P_Guarda_Sol")
m.tube((0, 0, 0), (0, 0, 2.45), 0.025, "Metal_Branco", segs=6)
m.cyl(1.35, 0.45, "Plastico_Amarelo", segs=8, r2=0.0, M=R((0, 0, 2.05)), caps=(False, False), smooth=False)
m.face([(1.35 * math.cos(math.pi / 8 + 2 * math.pi * i / 8), 1.35 * math.sin(math.pi / 8 + 2 * math.pi * i / 8), 2.049) for i in range(8)],
       "Plastico_Amarelo", facing=(0, 0, -1))
m.cyl(0.04, 0.08, "Metal_Branco", segs=6, M=R((0, 0, 2.48)))
done(m)

m = B.Mesh("P_Vaso_Planta")
B.material("Ceramica_Vaso", color=(0.62, 0.24, 0.14), rough=0.8, double=True)
m.cyl(0.22, 0.45, "Ceramica_Vaso", segs=10, r2=0.28, caps=(False, False))
m.face([(0.27 * math.cos(2 * math.pi * i / 8), 0.27 * math.sin(2 * math.pi * i / 8), 0.42) for i in range(8)], "Terra", facing=(0, 0, 1))
rp = random.Random(9)
m.sphere("Folhas", R((0, 0, 0.82), scale=(0.40, 0.40, 0.45)), subdiv=1, jitter=0.05, rng=rp)
m.sphere("Folhas", R((0.12, 0.08, 1.15), scale=(0.25, 0.25, 0.3)), subdiv=1, jitter=0.04, rng=rp)
done(m)

m = B.Mesh("P_Caixa_Som")
m.box((-0.3, -0.25, 0), (0.3, 0.25, 1.0), "Metal_Escuro", mats={'ny': "Borracha_Preta"})
circulo(m, 0.2, -0.252, 0.35, "Janela_Escura", n=12)
circulo(m, 0.07, -0.252, 0.80, "Janela_Escura", n=8)
done(m)

m = B.Mesh("P_Amplificador")
m.box((-0.3, -0.15, 0), (0.3, 0.15, 0.5), "Metal_Escuro", mats={'ny': "Borracha_Preta"}, skip=('nz',))
m.box((-0.28, -0.155, 0.42), (0.28, -0.15, 0.47), "Inox", skip=('py',))
done(m)

m = B.Mesh("P_Pedestal_Mic")
m.cyl(0.14, 0.02, "Metal_Escuro", segs=8)
m.tube((0, 0, 0.02), (0, 0, 1.45), 0.012, "Metal_Escuro", segs=4)
m.tube((0, 0, 1.45), (0, -0.18, 1.55), 0.01, "Metal_Escuro", segs=4)
m.cyl(0.022, 0.1, "Metal_Escuro", segs=6, M=Matrix.Translation((0, -0.18, 1.55)) @ Matrix.Rotation(math.radians(70), 4, 'X'))
done(m)

m = B.Mesh("P_Bateria")
RX = Matrix.Rotation(math.pi / 2, 4, 'X')
m.cyl(0.28, 0.40, V, segs=12, M=Matrix.Translation((0, 0.2, 0.28)) @ RX, cap_mat="Plastico_Branco")
for x in (-0.16, 0.16):
    m.cyl(0.12, 0.15, V, segs=10, M=R((x, 0.0, 0.58)), cap_mat="Plastico_Branco")
m.cyl(0.18, 0.14, "Inox", segs=10, M=R((-0.48, -0.12, 0.50)), cap_mat="Plastico_Branco")
m.tube((-0.48, -0.12, 0.0), (-0.48, -0.12, 0.50), 0.012, "Metal_Escuro", segs=4)
m.cyl(0.20, 0.35, V, segs=10, M=R((0.52, 0.12, 0.22)), cap_mat="Plastico_Branco")
for (x, y, z) in ((-0.55, 0.32, 1.05), (0.62, 0.35, 1.15), (-0.72, -0.05, 0.85)):
    m.tube((x, y, 0.0), (x, y, z), 0.012, "Metal_Escuro", segs=4)
    m.cyl(0.22 if z > 0.9 else 0.17, 0.012, "Plastico_Amarelo", segs=10, M=R((x, y, z)), smooth=False)
done(m)

m = B.Mesh("P_Refletor")                       # pendurado na trelica, mirando para baixo/frente (-Y)
m.box((-0.03, -0.03, -0.12), (0.03, 0.03, 0.0), "Metal_Escuro")
Ml = Matrix.Translation((0, 0, -0.16)) @ Matrix.Rotation(math.radians(143), 4, 'X')
m.cyl(0.11, 0.24, "Metal_Escuro", segs=8, M=Ml, caps=(True, False))
m.face([Ml @ Vector((0.11 * math.cos(2 * math.pi * i / 8), 0.11 * math.sin(2 * math.pi * i / 8), 0.24)) for i in range(8)],
       "Lampada", facing=Ml.to_3x3() @ Vector((0, 0, 1)))
done(m)

m = B.Mesh("P_Lampada_Varal")
m.cyl(0.015, 0.035, "Metal_Escuro", segs=6, M=R((0, 0, -0.035)), caps=(False, False))
m.sphere("Lampada", R((0, 0, -0.08), scale=(0.045, 0.045, 0.055)), subdiv=1)
done(m)

import bpy
print("prototipos:", {n: len(bpy.data.meshes[n].polygons) for n in built})
