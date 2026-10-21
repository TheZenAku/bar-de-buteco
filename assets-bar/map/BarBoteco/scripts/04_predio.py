# Bar da Esquina ocupando o quarteirao inteiro (lote 0..32 x 0..26).
#   A  predio principal de esquina (2 pavimentos)  x 3.5..24  y 3.5..15
#   B  anexo de servico (cozinha/deposito) + terraco na laje  x 23.8..32  y 0..15
#   V  varanda colonial em L (frentes sul e oeste)
#   Q  quintal com palco, pergolado e churrasqueira  x 0..32  y 15..26
import math
import bpy
from mathutils import Vector, Matrix
import barlib as B

COL = "Predio_Estrutura"
B.coll(COL)
B.clear(COL, "Portas")
B.clear_colliders("Predio")

ZP, T1, ZP2, T2, L2, PL = B.Z_PISO, B.Z_TETO1, B.Z_PISO2, B.Z_TETO2, B.Z_LAJE2, B.Z_PLAT
ZC = B.Z_CALCADA
TE, TI = B.TE, B.TI
OC, CR, AZ, BR, TJ = "Reboco_Ocre", "Reboco_Creme", "Azulejo", "Reboco_Branco", "Tijolo"
D_TOP = 2.70
P_TOP = ZP + 2.10
P2_TOP = ZP2 + 2.10
E = 0.65
HI = B.ROOF_HI
zE = HI - (3.5 + E) * B.SLOPE
SX, SY = 13.25, 11.65                      # canto da escada em U
VX = 23.8                                  # face oeste da parede A/B


def roof_y(y):                             # altura do telhado sul na coordenada y
    return HI - (3.5 - y) * B.SLOPE


portas = []                                # (nome, M, s0, s1, z0, t, lado, dupla)

# =====================================================================  TERREO: PREDIO A + ANEXO B
w = B.Mesh("Predio_Paredes_Terreo")
P = "Predio_Parede"
Ms = w.wall((3.5, 3.5), (VX, 3.5), ZP, T1, TE, OC, CR, mat_e=OC, cut_ends=(False, True), skip_top=True, name=P,
            openings=[(1.5, 4.5, ZP, D_TOP), (6.0, 9.0, ZP, D_TOP), (10.5, 13.1, ZP, D_TOP)])
Mn1 = w.wall((VX, 15.0), (11.025, 15.0), ZP, T1, TE, OC, CR, mat_e=OC, cut_ends=True, skip_top=True, name=P,
             openings=[(1.5, 2.3, ZP, P_TOP), (3.8, 6.3, 1.2, 2.2), (10.8, 12.4, ZP, P_TOP)])
Mn2 = w.wall((11.025, 15.0), (3.5, 15.0), ZP, T1, TE, OC, AZ, mat_e=OC, cut_ends=(True, False), skip_top=True, name=P,
             openings=[(1.425, 2.025, 2.0, 2.5), (5.425, 6.025, 2.0, 2.5)])
Mw1 = w.wall((3.5, 14.8), (3.5, 11.575), ZP, T1, TE, OC, AZ, mat_e=OC, skip_top=True, name=P, openings=[(1.3, 1.9, 2.0, 2.5)])
Mw2 = w.wall((3.5, 11.575), (3.5, 3.7), ZP, T1, TE, OC, CR, mat_e=OC, skip_top=True, name=P, openings=[(3.575, 6.575, ZP, D_TOP)])
# parede A/B (x 23.8..24.0): face +x = anexo, face -x = varanda / predio A
w.wall((24.0, 0.2), (24.0, 3.5), ZP, T1, TE, AZ, OC, skip_top=True, name=P)
Mab2 = w.wall((24.0, 3.5), (24.0, 9.075), ZP, T1, TE, AZ, CR, skip_top=True, name=P, openings=[(4.2, 5.0, ZP, P_TOP)])
w.wall((24.0, 9.075), (24.0, 11.575), ZP, T1, TE, CR, CR, skip_top=True, name=P)
Mab4 = w.wall((24.0, 11.575), (24.0, 14.8), ZP, T1, TE, CR, CR, skip_top=True, name=P, openings=[(1.025, 1.825, ZP, P_TOP)])
# anexo B: fachadas
Mbs = w.wall((VX, 0.0), (32.0, 0.0), ZP, T1, TE, OC, AZ, mat_e=OC, cut_ends=False, skip_top=True, name=P,
             openings=[(1.7, 3.2, 1.8, 2.6), (4.7, 6.2, 1.8, 2.6)])
Mbe1 = w.wall((32.0, 0.2), (32.0, 9.075), ZP, T1, TE, OC, AZ, mat_e=OC, skip_top=True, name=P, openings=[(1.8, 2.6, ZP, P_TOP)])
Mbe2 = w.wall((32.0, 9.075), (32.0, 14.8), ZP, T1, TE, OC, CR, mat_e=OC, skip_top=True, name=P, openings=[(0.525, 2.725, ZP, D_TOP)])
Mbn = w.wall((32.0, 15.0), (VX, 15.0), ZP, T1, TE, OC, CR, mat_e=OC, cut_ends=(False, True), skip_top=True, name=P,
             openings=[(6.2, 7.0, ZP, P_TOP)])
Mbp = w.wall((24.0, 9.0), (31.8, 9.0), ZP, T1, TI, AZ, CR, mat_e=CR, skip_top=True, name=P, openings=[(6.0, 6.8, ZP, P_TOP)])
Mcf = w.wall((28.6, 12.0), (31.8, 12.0), ZP, T1, 0.12, "Inox", "Plastico_Branco", mat_e="Inox", cut_ends=(False, True),
             skip_top=True, name=P, openings=[(1.0, 1.8, ZP, P_TOP)])
w.wall((28.6, 14.8), (28.6, 12.12), ZP, T1, 0.12, "Inox", "Plastico_Branco", skip_top=True, name=P)
# divisorias do predio A (fundos: banheiros / corredor / escada / deposito)
Mp1 = w.wall((3.7, 11.5), (11.1, 11.5), ZP, T1, TI, CR, AZ, mat_e=CR, skip_top=True, name=P,
             openings=[(1.3, 2.1, ZP, P_TOP), (5.1, 5.9, ZP, P_TOP)])
Mp2 = w.wall((11.1, 11.5), (VX, 11.5), ZP, T1, TI, CR, CR, mat_e=CR, skip_top=True, name=P,
             openings=[(0.0, 2.0, ZP, 2.7), (2.15, 5.35, ZP, T1), (8.4, 9.2, ZP, P_TOP)])
for (x, ma, mb) in ((7.4, AZ, AZ), (11.1, CR, AZ), (13.25, CR, CR), (16.6, CR, CR)):
    w.wall((x, 11.65), (x, 14.8), ZP, T1, TI, ma, mb, skip_top=True, name=P)
w.box((SX + 1.5, SY, ZP), (SX + 1.7, SY + 2.16, ZP2 + 1.0), CR, skip=('nz',))
B.add_collider("Predio_Escada_Parede", (SX + 1.5, SY, ZP), (SX + 1.7, SY + 2.16, ZP2 + 1.0))
for x in (4.93, 8.58, 9.76):                                    # divisorias das cabines dos banheiros
    w.box((x, 13.4, ZP), (x + 0.04, 14.8, ZP + 2.0), "Plastico_Branco", skip=('nz', 'py'))
w.build(COL)
portas += [("Porta_WC_Masc", Mp1, 1.3, 2.1, ZP, TI, 'b', False), ("Porta_WC_Fem", Mp1, 5.1, 5.9, ZP, TI, 'b', False),
           ("Porta_Deposito_Bar", Mp2, 8.4, 9.2, ZP, TI, 'b', False), ("Porta_Cozinha", Mab2, 4.2, 5.0, ZP, TE, 'a', False),
           ("Porta_Deposito_Anexo", Mab4, 1.025, 1.825, ZP, TE, 'a', False),
           ("Porta_Cozinha_Deposito", Mbp, 6.0, 6.8, ZP, TI, 'b', False), ("Porta_Camara_Fria", Mcf, 1.0, 1.8, ZP, 0.12, 'b', False),
           ("Porta_Servico_Cozinha", Mbe1, 1.8, 2.6, ZP, TE, 'b', False), ("Porta_Quintal_Deposito", Mn1, 1.5, 2.3, ZP, TE, 'b', False),
           ("Porta_Quintal_Anexo", Mbn, 6.2, 7.0, ZP, TE, 'b', False), ("Porta_Quintal_Corredor", Mn1, 10.8, 12.4, ZP, TE, 'a', True)]

# =====================================================================  SUPERIOR + TERRACO
u = B.Mesh("Predio_Paredes_Superior")
P = "Predio_Parede2"
Mu_s = u.wall((3.5, 3.5), (24.0, 3.5), ZP2, T2, TE, TJ, BR, mat_e=BR, cut_ends=False, skip_top=True, name=P,
              openings=[(1.3, 2.8, 4.45, 5.65), (4.2, 5.7, 4.45, 5.65), (11.0, 12.5, 4.45, 5.65), (18.8, 20.0, 4.45, 5.65),
                        (7.5, 9.5, 3.65, 5.75), (15.5, 17.5, 3.65, 5.75)])
Mu_n = u.wall((24.0, 15.0), (3.5, 15.0), ZP2, T2, TE, TJ, BR, mat_e=BR, cut_ends=False, skip_top=True, name=P,
              openings=[(1.5, 3.0, 4.45, 5.65), (4.5, 6.0, 4.45, 5.65), (11.3, 12.5, 4.45, 5.65),
                        (14.4, 15.0, 4.95, 5.55), (18.4, 19.0, 4.95, 5.55)])
Mu_w = u.wall((3.5, 14.8), (3.5, 3.7), ZP2, T2, TE, TJ, BR, mat_e=BR, skip_top=True, name=P,
              openings=[(1.3, 1.9, 4.95, 5.55), (6.0, 7.5, 4.45, 5.65), (8.5, 10.0, 4.45, 5.65)])
Mu_e = u.wall((24.0, 3.7), (24.0, 14.8), ZP2, T2, TE, TJ, BR, mat_e=BR, skip_top=True, name=P,
              openings=[(1.3, 3.1, ZP2, 5.55), (5.3, 6.7, 4.45, 5.65), (9.1, 10.3, 4.45, 5.65)])
Mq1 = u.wall((3.7, 11.5), (11.1, 11.5), ZP2, T2, TI, BR, AZ, mat_e=BR, skip_top=True, name=P,
             openings=[(1.3, 2.1, ZP2, P2_TOP), (5.1, 5.9, ZP2, P2_TOP)])
Mq2 = u.wall((11.1, 11.5), (SX, 11.5), ZP2, T2, TI, BR, BR, cut_ends=(True, False), skip_top=True, name=P,
             openings=[(0.6, 1.4, ZP2, P2_TOP)])
Mq3 = u.wall((SX + 3.2, 11.5), (VX, 11.5), ZP2, T2, TI, BR, BR, cut_ends=(False, True), skip_top=True, name=P,
             openings=[(3.05, 3.85, ZP2, P2_TOP)])
for (x, ma, mb) in ((7.4, AZ, AZ), (11.1, BR, AZ), (13.25, BR, BR), (16.6, BR, BR)):
    u.wall((x, 11.65), (x, 14.8), ZP2, T2, TI, ma, mb, skip_top=True, name=P)
for i in range(11):                                             # guarda-corpo do vazio da escada
    x = SX + 0.05 + i * 0.14
    u.box((x, 11.585, ZP2), (x + 0.025, 11.61, ZP2 + 0.95), "Metal_Escuro", skip=('nz', 'pz'))
u.box((SX, 11.57, ZP2 + 0.95), (SX + 1.5, 11.625, ZP2 + 1.0), "Metal_Escuro")
B.add_collider("Predio_GuardaCorpo", (SX, 11.55, ZP2), (SX + 1.5, 11.65, ZP2 + 1.0))
# platibanda do predio A + faixa marrom
for (p0, p1) in (((3.5, 3.5), (24.0, 3.5)), ((24.0, 3.5), (24.0, 15.0)), ((24.0, 15.0), (3.5, 15.0)), ((3.5, 15.0), (3.5, 3.5))):
    u.wall(p0, p1, L2, PL, 0.15, TJ, BR, mat_e="Reboco_Marrom", cut_ends=False, collide=False)
for (mn, mx) in (((3.44, 3.44, T2), (24.06, 3.5, PL + 0.05)), ((3.44, 15.0, T2), (24.06, 15.06, PL + 0.05)),
                 ((3.44, 3.5, T2), (3.5, 15.0, PL + 0.05)), ((24.0, 3.5, T2), (24.06, 15.0, PL + 0.05))):
    u.box(mn, mx, "Reboco_Marrom")
# terraco sobre o anexo: parapeito de 1,10 m + faixa marrom na altura da laje
ZT = ZP2 + 1.10
for (p0, p1, ce) in (((VX, 0.0), (32.0, 0.0), False), ((32.0, 0.15), (32.0, 14.85), True),
                     ((32.0, 15.0), (24.0, 15.0), (False, True)), ((VX, 3.5), (VX, 0.15), True)):
    u.wall(p0, p1, ZP2, ZT, 0.15, OC, CR, mat_e="Concreto", cut_ends=ce, name="Predio_Terraco")
for (mn, mx) in (((VX - 0.04, -0.04, T1), (32.04, 0.0, ZP2)), ((32.0, 0.0, T1), (32.04, 15.04, ZP2)),
                 ((24.0, 15.0, T1), (32.0, 15.04, ZP2)), ((VX - 0.04, 0.0, T1), (VX, 3.5, ZP2))):
    u.box(mn, mx, "Reboco_Marrom")
u.build(COL)
portas += [("Porta_WC_Masc_Sup", Mq1, 1.3, 2.1, ZP2, TI, 'b', False), ("Porta_WC_Fem_Sup", Mq1, 5.1, 5.9, ZP2, TI, 'b', False),
           ("Porta_Escritorio", Mq2, 0.6, 1.4, ZP2, TI, 'b', False), ("Porta_Deposito_Sup", Mq3, 3.05, 3.85, ZP2, TI, 'b', False)]

# =====================================================================  LAJES E PISOS
s = B.Mesh("Predio_Lajes")
LX, LY = B.LOTE_X, B.LOTE_Y
for (a, b_) in (((0, 0), (LX, 0)), ((LX, 0), (LX, LY)), ((LX, LY), (0, LY)), ((0, LY), (0, 0))):
    s.face([(a[0], a[1], ZC), (b_[0], b_[1], ZC), (b_[0], b_[1], ZP), (a[0], a[1], ZP)], "Concreto", away=(LX / 2, LY / 2, 0.2))
s.face([(0, 0, ZP), (VX, 0, ZP), (VX, 3.5, ZP), (3.5, 3.5, ZP), (3.5, 15, ZP), (0, 15, ZP)], "Cimento_Queimado", facing=(0, 0, 1))
s.face([(3.5, 3.5, ZP), (VX, 3.5, ZP), (VX, 15, ZP), (3.5, 15, ZP)], "Piso_Ceramico", facing=(0, 0, 1))
s.face([(VX, 0, ZP), (LX, 0, ZP), (LX, 15, ZP), (VX, 15, ZP)], "Piso_Ceramico", facing=(0, 0, 1))
s.face([(0, 15, ZP), (LX, 15, ZP), (LX, LY, ZP), (0, LY, ZP)], "Cimento_Queimado", facing=(0, 0, 1))
B.add_collider("Predio_Piso", (0, 0, ZC), (LX, LY, ZP))
for (mn, mx) in (((3.5, 3.5), (24.0, SY)), ((3.5, SY), (SX, 15.0)), ((SX + 3.2, SY), (24.0, 15.0)), ((SX, 14.8), (SX + 3.2, 15.0))):
    s.box((mn[0], mn[1], T1), (mx[0], mx[1], ZP2), CR, mats={'nz': BR, 'pz': "Piso_Madeira"})
    B.add_collider("Predio_Laje", (mn[0], mn[1], T1), (mx[0], mx[1], ZP2))
for (mn, mx) in (((24.0, 0.0), (32.0, 15.0)), ((VX, 0.0), (24.0, 3.5))):          # laje do anexo = piso do terraco
    s.box((mn[0], mn[1], T1), (mx[0], mx[1], ZP2), "Reboco_Marrom", mats={'nz': BR, 'pz': "Piso_Ceramico"})
    B.add_collider("Predio_Laje", (mn[0], mn[1], T1), (mx[0], mx[1], ZP2))
s.box((3.5, 3.5, T2), (24.0, 15.0, L2), "Reboco_Marrom", mats={'nz': BR, 'pz': "Concreto"})
B.add_collider("Predio_Cobertura", (3.5, 3.5, T2), (24.0, 15.0, L2))
for x0 in (10.5, 18.5):                                         # sacadas
    s.box((x0, 2.3, 3.50), (x0 + 3.0, 3.5, 3.65), "Concreto", mats={'pz': "Piso_Ceramico"})
    B.add_collider("Predio_Sacada", (x0, 2.3, 3.50), (x0 + 3.0, 3.5, 3.65))
s.build(COL)

# =====================================================================  ESCADA EM U
e = B.Mesh("Predio_Escada")
R, T = 0.175, 0.27
for i in range(8):
    y0 = SY + i * T
    e.box((SX, y0, ZP), (SX + 1.5, y0 + T, ZP + R * (i + 1)), "Cimento_Queimado", mats={'ny': CR}, skip=('nz', 'py', 'nx', 'px'))
e.box((SX, SY + 2.16, ZP), (SX + 3.2, 14.8, ZP + 9 * R), "Cimento_Queimado", mats={'ny': CR}, skip=('nz', 'py', 'nx', 'px'))
for j in range(8):
    y1 = SY + 2.16 - j * T
    e.box((SX + 1.7, y1 - T, ZP), (SX + 3.2, y1, ZP + 9 * R + R * (j + 1)), "Cimento_Queimado",
          mats={'py': CR, 'ny': CR}, skip=('nz', 'nx', 'px') + (('ny',) if j < 7 else ()))
e.build(COL)
for (y0, z0, y1, z1, x0, x1) in ((SY, ZP, SY + 2.16, ZP + 9 * R, SX, SX + 1.5), (SY + 2.16, ZP + 9 * R, SY, ZP2, SX + 1.7, SX + 3.2)):
    L = math.hypot(y1 - y0, z1 - z0)
    M = Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)) @ Matrix.Rotation(math.atan2(z1 - z0, y1 - y0), 4, 'X')
    B.add_collider("Predio_Escada_Rampa", (-(x1 - x0) / 2, -L / 2, -0.06), ((x1 - x0) / 2, L / 2, 0.0), M)
B.add_collider("Predio_Escada_Patamar", (SX, SY + 2.16, ZP), (SX + 3.2, 14.8, ZP + 9 * R))

# =====================================================================  VARANDA
v = B.Mesh("Predio_Varanda")
south_x = [0.12 + 2.68 * k for k in range(9)]
west_y = [3.05, 6.0, 8.95, 11.9, 14.85]
for (x, y) in [(x, 0.12) for x in south_x] + [(0.12, y) for y in west_y]:
    v.box((x - 0.075, y - 0.075, ZP), (x + 0.075, y + 0.075, 2.55), "Madeira", skip=('nz', 'pz'))
    v.box((x - 0.11, y - 0.11, ZP), (x + 0.11, y + 0.11, ZP + 0.12), "Concreto", skip=('nz',))
    B.add_collider("Predio_Pilar", (x - 0.11, y - 0.11, ZP), (x + 0.11, y + 0.11, 2.55))
v.box((0.045, 0.045, 2.55), (VX, 0.195, 2.75), "Madeira", skip=('pz',))
v.box((0.045, 0.195, 2.55), (0.195, 15.0, 2.75), "Madeira", skip=('pz',))
for x in south_x[1:]:
    v.box((x - 0.05, 0.195, 2.60), (x + 0.05, 3.5, 2.75), "Madeira", skip=('pz', 'py'))
for y in west_y:
    v.box((0.195, y - 0.05, 2.60), (3.5, y + 0.05, 2.75), "Madeira", skip=('pz', 'px'))
v.face([(-0.57, -0.57, B.FORRO), (VX, -0.57, B.FORRO), (VX, 3.5, B.FORRO), (3.5, 3.5, B.FORRO),
        (3.5, 15, B.FORRO), (-0.57, 15, B.FORRO)], "Forro", facing=(0, 0, -1))
v.box((-0.6, -0.6, 2.60), (VX, -0.57, 2.76), "Madeira")
v.box((-0.6, -0.57, 2.60), (-0.57, 15.0, 2.76), "Madeira")
for fz in (1, -1):
    v.face([(-0.6, 15, 2.60), (3.5, 15, 2.60), (3.5, 15, HI), (-0.6, 15, roof_y(-0.6))], "Madeira", facing=(0, fz, 0))
    v.face([(VX, -0.6, 2.60), (VX, 0.0, 2.60), (VX, 0.0, roof_y(0.0)), (VX, -0.6, roof_y(-0.6))], "Madeira", facing=(fz, 0, 0))


def porta_enrolar(M, s0, s1):
    for (a, b_) in ((s0 - 0.06, s0), (s1, s1 + 0.06)):
        v.box((a, -0.05, ZP), (b_, 0.0, D_TOP), "Metal_Escuro", M=M, skip=('nz',))
    v.box((s0, -0.035, D_TOP - 0.28), (s1, -0.005, D_TOP), "Metal_Ondulado", M=M)
    v.box((s0 - 0.1, TE, D_TOP), (s1 + 0.1, TE + 0.32, D_TOP + 0.36), "Metal_Escuro", M=M)


for (M, a, b_) in ((Ms, 1.5, 4.5), (Ms, 6.0, 9.0), (Ms, 10.5, 13.1), (Mw2, 3.575, 6.575), (Mbe2, 0.525, 2.725)):
    porta_enrolar(M, a, b_)
v.build(COL)

# =====================================================================  TELHADO COLONIAL DA VARANDA
r = B.Mesh("Predio_Telhado")
r.roof_face([(-E, -E, zE), (VX, -E, zE), (VX, 3.5, HI), (3.5, 3.5, HI)], "Telha", (1, 0, 0))
r.roof_face([(-E, -E, zE), (3.5, 3.5, HI), (3.5, 15.0, HI), (-E, 15.0, zE)], "Telha", (0, 1, 0))
r.face([(-E, -E, zE - 0.05), (VX, -E, zE - 0.05), (VX, -E, zE), (-E, -E, zE)], "Telha", facing=(0, -1, 0))
r.face([(-E, -E, zE - 0.05), (-E, 15.0, zE - 0.05), (-E, 15.0, zE), (-E, -E, zE)], "Telha", facing=(-1, 0, 0))
r.face([(-E, 15.0, zE - 0.05), (3.5, 15.0, HI - 0.05), (3.5, 15.0, HI), (-E, 15.0, zE)], "Telha", facing=(0, 1, 0))
r.face([(VX, -E, zE - 0.05), (VX, 0.0, roof_y(0) - 0.05), (VX, 0.0, roof_y(0)), (VX, -E, zE)], "Telha", facing=(1, 0, 0))
A = Vector((-E, -E, zE)); Bp = Vector((3.5, 3.5, HI))
off = Vector((0.09, -0.09, 0)); dz = Vector((0, 0, 0.09 * B.SLOPE))
As, Bs, Aw, Bw = A + off - dz, Bp + off - dz, A - off - dz, Bp - off - dz
Ar, Br = A + Vector((0, 0, 0.07)), Bp + Vector((0, 0, 0.07))
r.face([As, Bs, Br, Ar], "Telha", facing=(0.3, -0.3, 1))
r.face([Ar, Br, Bw, Aw], "Telha", facing=(-0.3, 0.3, 1))
r.face([Aw, As, Ar], "Telha", facing=(-1, -1, 0))
r.box((3.38, 3.38, HI - 0.03), (VX, 3.5, HI + 0.06), "Concreto", skip=('py', 'nz'))
r.box((3.38, 3.5, HI - 0.03), (3.5, 15.0, HI + 0.06), "Concreto", skip=('px', 'nz'))
r.build(COL)

# =====================================================================  CHURRASQUEIRAS (varanda e quintal)
c = B.Mesh("Predio_Churrasqueiras")


def churrasqueira(M, w, d, ztop, extra=0.0, nome="Predio_Churrasqueira"):
    """Churrasqueira de tijolo encostada numa parede. Local: x 0..w ao longo da parede, y -d..0 (0 = parede)."""
    def bx(mn, mx, mat, **kw):
        c.box(mn, mx, mat, M=M, **kw)

    def W_(p):
        return M @ Vector(p)
    bx((0, -d, ZP), (w, 0, 0.95), TJ, skip=('nz', 'py'))
    bx((-0.06, -d - 0.06, 0.95), (w + 0.06, 0, 1.0), "Granito_Preto", skip=('py',))
    for (a, b_) in ((0, 0.1), (w - 0.1, w)):
        bx((a, -d, 1.0), (b_, 0, 1.65), TJ, skip=('py', 'nz'))
    bx((0.05, -d + 0.05, 1.25), (w - 0.05, -0.05, 1.27), "Metal_Escuro")
    c.face([W_((0.12, -d + 0.03, 1.005)), W_((w - 0.12, -d + 0.03, 1.005)), W_((w - 0.12, -0.03, 1.005)), W_((0.12, -0.03, 1.005))],
           "Borracha_Preta", facing=(0, 0, 1))
    bx((0, -d, 1.65), (w, 0, 1.82), TJ, skip=('py',))
    cw0, cw1, cd = w / 2 - 0.35, w / 2 + 0.35, 0.55
    b0 = [(0, -d, 1.82), (w, -d, 1.82), (w, 0, 1.82), (0, 0, 1.82)]
    t0 = [(cw0, -cd, 2.35), (cw1, -cd, 2.35), (cw1, 0, 2.35), (cw0, 0, 2.35)]
    ctr = W_((w / 2, -d / 2, 2.0))
    for (i, j) in ((0, 1), (1, 2), (3, 0)):
        c.face([W_(b0[i]), W_(b0[j]), W_(t0[j]), W_(t0[i])], TJ, away=ctr)
    bx((cw0, -cd, 2.35), (cw1, 0, ztop), TJ, skip=('py', 'nz'))
    bx((cw0 - 0.05, -cd - 0.05, ztop), (cw1 + 0.05, 0.05, ztop + 0.06), "Concreto")
    for (x, y) in ((cw0 + 0.02, -cd + 0.02), (cw1 - 0.02, -cd + 0.02), (cw0 + 0.02, -0.02), (cw1 - 0.02, -0.02)):
        bx((x - 0.04, y - 0.04, ztop + 0.06), (x + 0.04, y + 0.04, ztop + 0.25), TJ, skip=('nz', 'pz'))
    bx((cw0 - 0.09, -cd - 0.09, ztop + 0.25), (cw1 + 0.09, 0.09, ztop + 0.30), "Concreto")
    apex = W_((w / 2, -cd / 2, ztop + 0.52))
    hp = [(cw0 - 0.09, -cd - 0.09), (cw1 + 0.09, -cd - 0.09), (cw1 + 0.09, 0.09), (cw0 - 0.09, 0.09)]
    for k in range(4):
        p, q = hp[k], hp[(k + 1) % 4]
        c.face([W_((p[0], p[1], ztop + 0.30)), W_((q[0], q[1], ztop + 0.30)), apex], "Telha", away=W_((w / 2, -cd / 2, ztop + 0.3)))
    if extra:
        bx((w, -d, ZP), (w + extra, 0, 0.9), TJ, skip=('nz', 'py'))
        bx((w, -d - 0.04, 0.9), (w + extra + 0.04, 0, 0.95), "Granito_Preto", skip=('py',))
        c.face([W_((w + 0.5, -d + 0.12, 0.952)), W_((w + 1.1, -d + 0.12, 0.952)), W_((w + 1.1, -0.12, 0.952)), W_((w + 0.5, -0.12, 0.952))],
               "Inox", facing=(0, 0, 1))
        c.tube(W_((w + 0.8, -0.06, 0.95)), W_((w + 0.8, -0.06, 1.2)), 0.015, "Inox", segs=5)
        c.tube(W_((w + 0.8, -0.06, 1.2)), W_((w + 0.8, -0.25, 1.2)), 0.015, "Inox", segs=5)
    B.add_collider(nome, (-0.06, -d - 0.06, ZP), (w + extra + 0.06, 0, 1.82), M)


churrasqueira(B.mat_rz((3.5, 11.2, 0), rz_deg=-90), 1.2, 0.7, 5.3)                     # varanda oeste
churrasqueira(B.mat_rz((2.5, 25.8, 0)), 2.0, 0.8, 5.0, extra=2.5)                       # quintal
c.build(COL)

# =====================================================================  QUINTAL: muros, palco, pergolado, balcao externo
qm = B.Mesh("Predio_Quintal")
ZM = ZP + 2.4
Mqw = qm.wall((0.0, 25.8), (0.0, 15.0), ZP, ZM, 0.2, OC, TJ, mat_e="Reboco_Marrom", cut_ends=(True, False), name="Predio_Muro",
              openings=[(3.3, 6.3, ZP, ZM)])
qm.wall((32.0, 26.0), (0.0, 26.0), ZP, ZM, 0.2, OC, TJ, mat_e="Reboco_Marrom", cut_ends=False, name="Predio_Muro",
        openings=[(3.0, 6.0, ZP, ZM)])
qm.wall((32.0, 15.0), (32.0, 25.8), ZP, ZM, 0.2, OC, TJ, mat_e="Reboco_Marrom", cut_ends=True, name="Predio_Muro")
qm.box((3.0, 25.85, ZP + 0.02), (6.0, 25.9, ZM - 0.05), "Portao_Verde", M=Matrix.Translation((23.0, 0, 0)))
B.add_collider("Predio_Portao", (26.0, 25.8, ZP), (29.0, 26.0, ZM))
for y0 in (19.15, 22.5):                                                                  # pilares do portao social
    qm.box((-0.08, y0, ZP), (0.32, y0 + 0.35, ZM + 0.35), OC, skip=('nz',))
    qm.box((-0.12, y0 - 0.04, ZM + 0.35), (0.36, y0 + 0.39, ZM + 0.42), "Reboco_Marrom")
    B.add_collider("Predio_Pilar_Portao", (-0.08, y0, ZP), (0.32, y0 + 0.35, ZM + 0.35))
for (y0, sgn) in ((19.5, 1), (22.5, -1)):                                                 # folhas do portao (abertas)
    qm.box((0.25, min(y0, y0 + sgn * 0.04), ZP + 0.05), (1.75, max(y0, y0 + sgn * 0.04), ZM - 0.1), "Portao_Verde")
# palco coberto
qm.box((21.5, 21.6, ZP), (31.8, 25.8, ZP + 0.6), "Metal_Escuro", mats={'pz': "Madeira"}, skip=('nz', 'py', 'px'))
qm.box((20.9, 22.2, ZP), (21.5, 23.4, ZP + 0.2), "Madeira", skip=('nz', 'px'))
qm.box((21.2, 22.2, ZP + 0.2), (21.5, 23.4, ZP + 0.4), "Madeira", skip=('nz', 'px'))
B.add_collider("Predio_Palco", (21.5, 21.6, ZP), (31.8, 25.8, ZP + 0.6))
B.add_collider("Predio_Palco_Degrau", (20.9, 22.2, ZP), (21.5, 23.4, ZP + 0.2))
B.add_collider("Predio_Palco_Degrau", (21.2, 22.2, ZP + 0.2), (21.5, 23.4, ZP + 0.4))
for (x, y, z1) in ((21.7, 21.8, 4.3), (31.6, 21.8, 4.3), (21.7, 25.6, 4.62), (31.6, 25.6, 4.62)):
    qm.tube((x, y, ZP + 0.6), (x, y, z1), 0.06, "Metal_Escuro", segs=6)
    B.add_collider("Predio_Palco_Pilar", (x - 0.06, y - 0.06, ZP), (x + 0.06, y + 0.06, z1))
roof = [(21.3, 21.4, 4.30), (32.0, 21.4, 4.30), (32.0, 25.95, 4.66), (21.3, 25.95, 4.66)]
qm.face(roof, "Metal_Ondulado", facing=(0, -0.1, 1))
qm.face([(x, y, z - 0.01) for (x, y, z) in roof], "Metal_Ondulado", facing=(0, 0.1, -1))
qm.box((21.7, 21.75, 4.05), (31.6, 21.85, 4.15), "Metal_Escuro")
qm.box((22.8, 25.62, ZP + 0.85), (30.2, 25.68, ZP + 2.70), "Metal_Escuro", uvrects={'ny': B.REG['placa2']}, mats={'ny': "Atlas_Placas"})
# pergolado de madeira
PXS, PYS = [1.2, 5.6, 10.0, 14.4, 18.8], [16.2, 20.0, 23.8]
for x in PXS:
    for y in PYS:
        qm.box((x - 0.075, y - 0.075, ZP), (x + 0.075, y + 0.075, 2.8), "Madeira", skip=('nz', 'pz'))
        qm.box((x - 0.1, y - 0.1, ZP), (x + 0.1, y + 0.1, ZP + 0.1), "Concreto", skip=('nz',))
        B.add_collider("Predio_Pergolado", (x - 0.1, y - 0.1, ZP), (x + 0.1, y + 0.1, 2.8))
for y in PYS:
    qm.box((1.0, y - 0.05, 2.8), (19.0, y + 0.05, 3.0), "Madeira")
for i in range(31):
    x = 1.0 + i * 0.6
    qm.box((x - 0.025, 16.0, 3.0), (x + 0.025, 24.0, 3.06), "Madeira")
# balcao externo (janela de atendimento do deposito) com toldo
qm.box((17.4, 15.0, 1.15), (20.1, 15.42, 1.2), "Granito_Preto", skip=('ny',))
for x in (17.6, 19.9):
    qm.box((x - 0.02, 15.0, 0.95), (x + 0.02, 15.35, 1.15), "Metal_Escuro", skip=('ny',))
qm.box((0, 0, 0), (3.1, 1.15, 0.02), "Plastico_Vermelho",
       M=Matrix.Translation((17.2, 15.0, 2.62)) @ Matrix.Rotation(math.radians(-17), 4, 'X'))
# varal de lampadas (fios) — as lampadas sao instancias (06_interior)
for yv in (18.1, 21.9):
    n = 12
    pts = [Vector((1.2 + 17.6 * t / n, yv, 2.85 - 0.3 * 4 * (t / n) * (1 - t / n))) for t in range(n + 1)]
    for i in range(n):
        qm.tube(pts[i], pts[i + 1], 0.008, "Fio", segs=3, smooth=False)
qm.build(COL)

# =====================================================================  SACADAS, COBERTURA E TERRACO (detalhes)
g = B.Mesh("Predio_Sacada_Cobertura")
zt = 3.65
for x0 in (10.5, 18.5):
    rail = [((x0 + 0.02, 3.5), (x0 + 0.02, 2.32)), ((x0 + 0.02, 2.32), (x0 + 2.98, 2.32)), ((x0 + 2.98, 2.32), (x0 + 2.98, 3.5))]
    for (p0, p1) in rail:
        a, b_ = Vector(p0), Vector(p1)
        n = max(2, int((b_ - a).length / 0.12))
        for i in range(n + 1):
            qv = a + (b_ - a) * (i / n)
            g.box((qv.x - 0.012, qv.y - 0.012, zt), (qv.x + 0.012, qv.y + 0.012, zt + 0.95), "Metal_Escuro", skip=('nz', 'pz'))
        lo = (min(a.x, b_.x), min(a.y, b_.y)); hi = (max(a.x, b_.x), max(a.y, b_.y))
        g.box((lo[0] - 0.025, lo[1] - 0.025, zt + 0.95), (hi[0] + 0.025, hi[1] + 0.025, zt + 1.0), "Metal_Escuro")
        g.box((lo[0] - 0.015, lo[1] - 0.015, zt + 0.08), (hi[0] + 0.015, hi[1] + 0.015, zt + 0.11), "Metal_Escuro")
        B.add_collider("Predio_Sacada_GC", (lo[0] - 0.03, lo[1] - 0.03, zt), (hi[0] + 0.03, hi[1] + 0.03, zt + 1.0))
for (x, y) in ((20.6, 12.6), (22.2, 12.6)):                                               # caixas d'agua
    g.box((x - 0.7, y - 0.7, L2), (x + 0.7, y + 0.7, L2 + 0.12), "Concreto", skip=('nz',))
    g.cyl(0.62, 0.85, "Caixa_Agua", segs=14, M=B.mat_rz((x, y, L2 + 0.12)), caps=(False, False))
    g.cyl(0.65, 0.12, "Caixa_Agua", segs=14, r2=0.45, M=B.mat_rz((x, y, L2 + 0.97)))
g.box((5.0, 13.6, L2), (5.7, 14.3, L2 + 0.25), "Concreto", skip=('nz',))
g.tube((22.5, 4.2, L2), (22.5, 4.2, L2 + 0.6), 0.05, "Plastico_Branco", segs=6, caps=(False, True))
g.box((25.0, 0.3, ZP2), (27.7, 0.9, ZP2 + 1.3), "Inox", skip=('nz',))                     # exaustao da cozinha
g.box((24.9, 0.2, ZP2 + 1.3), (27.8, 1.0, ZP2 + 1.36), "Inox")
B.add_collider("Predio_Exaustao", (25.0, 0.3, ZP2), (27.7, 0.9, ZP2 + 1.36))
g.build(COL)

# =====================================================================  ESQUADRIAS
q = B.Mesh("Predio_Esquadrias")


def janela(M, s0, s1, z0, z1, t, divs=2, sill=True, glass=True, frame="Aluminio_Bronze"):
    f, yc, d = 0.05, t / 2, 0.03
    q.box((s0, yc - d, z0), (s0 + f, yc + d, z1), frame, M=M)
    q.box((s1 - f, yc - d, z0), (s1, yc + d, z1), frame, M=M)
    q.box((s0 + f, yc - d, z0), (s1 - f, yc + d, z0 + f), frame, M=M)
    q.box((s0 + f, yc - d, z1 - f), (s1 - f, yc + d, z1), frame, M=M)
    for i in range(1, divs):
        sm = s0 + (s1 - s0) * i / divs
        q.box((sm - 0.02, yc - d, z0 + f), (sm + 0.02, yc + d, z1 - f), frame, M=M)
    if glass:
        q.face([M @ Vector(p) for p in ((s0 + f, yc, z0 + f), (s1 - f, yc, z0 + f), (s1 - f, yc, z1 - f), (s0 + f, yc, z1 - f))], "Vidro")
    if sill:
        q.box((s0 - 0.05, -0.05, z0 - 0.04), (s1 + 0.05, 0.03, z0), "Concreto", M=M)


def porta_correr(M, s0, s1, z0, z1, t):
    """Porta de vidro de correr, metade aberta (passagem livre)."""
    f, yc = 0.05, t / 2
    for (a, b_) in ((s0, s0 + f), (s1 - f, s1)):
        q.box((a, yc - 0.04, z0), (b_, yc + 0.04, z1), "Aluminio_Bronze", M=M)
    q.box((s0, yc - 0.04, z1 - f), (s1, yc + 0.04, z1), "Aluminio_Bronze", M=M)
    hm = (s0 + s1) / 2
    for (a, b_, yo) in ((s0 + f, hm + 0.03, -0.015), (s0 + f + 0.04, hm + 0.07, 0.015)):
        q.box((a, yc + yo - 0.012, z0), (b_, yc + yo + 0.012, z0 + 0.04), "Aluminio_Bronze", M=M)
        q.box((a, yc + yo - 0.012, z1 - f - 0.04), (b_, yc + yo + 0.012, z1 - f), "Aluminio_Bronze", M=M)
        q.box((b_ - 0.04, yc + yo - 0.012, z0 + 0.04), (b_, yc + yo + 0.012, z1 - f - 0.04), "Aluminio_Bronze", M=M)
        q.face([M @ Vector(p) for p in ((a, yc + yo, z0 + 0.04), (b_ - 0.04, yc + yo, z0 + 0.04),
                                        (b_ - 0.04, yc + yo, z1 - f - 0.04), (a, yc + yo, z1 - f - 0.04))], "Vidro")


def batente(M, s0, s1, z0, z1, t):
    q.box((s0, -0.01, z0), (s0 + 0.05, t + 0.01, z1), "Madeira", M=M, skip=('nz',))
    q.box((s1 - 0.05, -0.01, z0), (s1, t + 0.01, z1), "Madeira", M=M, skip=('nz',))
    q.box((s0, -0.01, z1 - 0.05), (s1, t + 0.01, z1), "Madeira", M=M)


for (a, b_) in ((1.3, 2.8), (4.2, 5.7), (11.0, 12.5), (18.8, 20.0)):
    janela(Mu_s, a, b_, 4.45, 5.65, TE, divs=2 if b_ - a > 1.3 else 1)
for (a, b_) in ((1.5, 3.0), (4.5, 6.0), (11.3, 12.5)):
    janela(Mu_n, a, b_, 4.45, 5.65, TE, divs=2 if b_ - a > 1.3 else 1)
for (a, b_) in ((14.4, 15.0), (18.4, 19.0)):
    janela(Mu_n, a, b_, 4.95, 5.55, TE, divs=1)
janela(Mu_w, 1.3, 1.9, 4.95, 5.55, TE, divs=1)
for (a, b_) in ((6.0, 7.5), (8.5, 10.0)):
    janela(Mu_w, a, b_, 4.45, 5.65, TE)
for (a, b_) in ((5.3, 6.7), (9.1, 10.3)):
    janela(Mu_e, a, b_, 4.45, 5.65, TE, divs=2 if b_ - a > 1.3 else 1)
janela(Mw1, 1.3, 1.9, 2.0, 2.5, TE, divs=1)
for (a, b_) in ((1.425, 2.025), (5.425, 6.025)):
    janela(Mn2, a, b_, 2.0, 2.5, TE, divs=1)
for (a, b_) in ((1.7, 3.2), (4.7, 6.2)):
    janela(Mbs, a, b_, 1.8, 2.6, TE)
janela(Mn1, 3.8, 6.3, 1.2, 2.2, TE, divs=1, sill=False, glass=False)                    # janela de atendimento
for (a, b_) in ((7.5, 9.5), (15.5, 17.5)):
    porta_correr(Mu_s, a, b_, 3.65, 5.75, TE)                                            # sacadas
porta_correr(Mu_e, 1.3, 3.1, ZP2, 5.55, TE)                                              # saida para o terraco
for (nm, M, s0, s1, z0, t, side, dupla) in portas:
    batente(M, s0, s1, z0, z0 + 2.10, t)
q.box((17.4, 14.98, 1.15), (20.1, 15.0, 1.2), "Granito_Preto")
q.build(COL)

# =====================================================================  PLACAS
pl = B.Mesh("Predio_Placas")
zs = HI - (3.5 + 0.35) * B.SLOPE
pl.box((7.0, -0.38, zs + 0.05), (12.0, -0.32, zs + 1.30), "Metal_Escuro", uvrects={'ny': B.REG['placa']}, mats={'ny': "Atlas_Placas"})
for x in (7.6, 11.4):
    pl.tube((x, -0.33, zs + 1.15), (x, 1.2, B.roof_z(2.3)), 0.025, "Metal_Escuro", segs=4)
    pl.tube((x, -0.33, zs + 0.1), (x, -0.33, zs - 0.02), 0.025, "Metal_Escuro", segs=4)
pl.box((-0.38, 4.0, zs + 0.05), (-0.32, 9.0, zs + 1.30), "Metal_Escuro", uvrects={'nx': B.REG['placa']}, mats={'nx': "Atlas_Placas"})
for y in (4.6, 8.4):
    pl.tube((-0.33, y, zs + 1.15), (1.2, y, B.roof_z(2.3)), 0.025, "Metal_Escuro", segs=4)
    pl.tube((-0.33, y, zs + 0.1), (-0.33, y, zs - 0.02), 0.025, "Metal_Escuro", segs=4)
pl.box((3.75, 3.44, 0.95), (4.55, 3.5, 2.45), "Madeira", uvrects={'ny': B.REG['cardapio']}, mats={'ny': "Atlas_Placas"})
pl.box((-0.07, 23.2, 0.95), (0.0, 24.0, 2.45), "Madeira", uvrects={'nx': B.REG['cardapio']}, mats={'nx': "Atlas_Placas"})


def placa_parede(x, y, z, key, wdt, hgt, face='ny'):
    if face == 'ny':
        pl.box((x - wdt / 2, y - 0.015, z), (x + wdt / 2, y, z + hgt), "Plastico_Branco", uvrects={'ny': B.REG[key]},
               mats={'ny': "Atlas_Placas"}, skip=('py',))
    else:          # parede voltada para -x
        pl.box((x - 0.015, y - wdt / 2, z), (x, y + wdt / 2, z + hgt), "Plastico_Branco", uvrects={'nx': B.REG[key]},
               mats={'nx': "Atlas_Placas"}, skip=('px',))


for (x, z) in ((5.4, 2.55), (5.4, ZP2 + 2.25)):
    placa_parede(x, 11.5, z, 'wc_m', 0.44, 0.22)
for (x, z) in ((9.2, 2.55), (9.2, ZP2 + 2.25)):
    placa_parede(x, 11.5, z, 'wc_f', 0.44, 0.22)
placa_parede(19.9, 11.5, 2.55, 'deposito', 0.48, 0.12)
placa_parede(12.1, 11.5, ZP2 + 2.25, 'escritorio', 0.48, 0.12)
placa_parede(19.9, 11.5, ZP2 + 2.25, 'deposito', 0.48, 0.12)
placa_parede(VX, 8.1, 2.55, 'cozinha', 0.48, 0.12, face='nx')
pl.build(COL)

# =====================================================================  FOLHAS DAS PORTAS (objetos separados, pivo na dobradica)
b = B.Mesh("P_Porta")
b.box((0.0, -0.0175, 0.0), (0.70, 0.0175, 2.08), "Madeira")
for sy in (-1, 1):
    b.box((0.60, sy * 0.0175, 0.98), (0.66, sy * 0.05, 1.02), "Inox")
me = b.mesh()
B.coll("Portas")
for (nm, M, s0, s1, z0, t, side, dupla) in portas:
    d = Vector((M[0][0], M[1][0], 0.0))
    ang = math.degrees(math.atan2(d.y, d.x))
    sgn = 95.0 if side == 'b' else -95.0
    h = M @ Vector((s0 + 0.05, t / 2, z0))
    o = B.inst(me, nm if not dupla else nm + "_E", "Portas", (h.x, h.y, z0), rot=ang + sgn)
    o["porta"] = True
    o["angulo_fechada_graus"] = round(ang, 1)
    if dupla:
        h2 = M @ Vector((s1 - 0.05, t / 2, z0))
        o2 = B.inst(me, nm + "_D", "Portas", (h2.x, h2.y, z0), rot=ang + 180.0 - sgn)
        o2["porta"] = True
        o2["angulo_fechada_graus"] = round(ang + 180.0, 1)
print("predio ok:", {o.name: len(o.data.polygons) for o in B.coll(COL).objects}, "| portas:", len(B.coll("Portas").objects))
