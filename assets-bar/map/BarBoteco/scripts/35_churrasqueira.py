# Churrasqueiras refeitas do zero (substitui a malha Predio_Churrasqueiras do 04_predio.py, mesmo nome e colecao).
#   varanda oeste: 1,2 m encostada na parede do predio  |  quintal: 2,0 m + bancada com pia de 2,5 m
# Base de tijolo aparente com nicho de lenha, bancada de granito chanfrada, fogareiro com carvao em brasa (emissivo),
# grelha com carnes, trilhos com espetos, verga de concreto, coifa inclinada, chamine com chapeu de telha.
# Quintal: pia de inox embutida, torneira gooseneck, armario de madeira e frontao de granito.
# Colisores COL_Predio_Churrasqueira refeitos com o novo volume. Texturas: 33_texturas_pbr.py.
import math, random
import bpy
from mathutils import Vector, Matrix
import barlib as B
import pollib as P

P.materiais()
ZP = B.Z_PISO
TJ, FU, GR, CO = "Pol_Tijolo", "Pol_Tijolo_Fuligem", "Pol_Granito", "Concreto"
for o in list(bpy.data.objects):
    if o.name.startswith("COL_Predio_Churrasqueira"):
        bpy.data.objects.remove(o, do_unlink=True)
c = B.Mesh("Predio_Churrasqueiras")
rnd = random.Random(3)


def churrasqueira(M, w, d, ztop, extra=0.0, nome="Predio_Churrasqueira"):
    """Local: x 0..w ao longo da parede, y -d..0 (0 = parede), z absoluto."""
    W_ = lambda p: M @ Vector(p)
    cx = lambda *a, **k: P.caixa(c, *a, M=M, **k)
    ZB = ZP + 0.86                                   # topo da alvenaria da base
    ZG = ZB + 0.03                                   # topo do granito
    yF = -d + 0.12                                   # frente do fogareiro (sobra 12 cm de granito na frente)
    ZF = ZG + 0.62                                   # topo das paredes do fogareiro
    ZH0 = ZF + 0.14                                  # topo da verga = inicio da coifa
    cw0, cw1, cd = w / 2 - 0.34, w / 2 + 0.34, 0.50
    ZH1 = ZH0 + 0.55                                 # coifa -> chamine
    e = 0.11                                         # espessura das paredes do fogareiro

    # ---------------- base com nicho de lenha
    nw = min(0.9, w - 0.5)
    a, b = w / 2 - nw / 2, w / 2 + nw / 2
    zn0, zn1 = ZP + 0.12, ZP + 0.56
    cx((-0.01, -d - 0.012, ZP), (w + 0.01, 0, ZP + 0.07), CO, r=0.006, skip=('nz', 'py'))          # rodape
    cx((0, -d, ZP + 0.07), (a, 0, ZB), TJ, r=0.006, skip=('nz', 'py'))
    cx((b, -d, ZP + 0.07), (w, 0, ZB), TJ, r=0.006, skip=('nz', 'py'))
    cx((a, -d, ZP + 0.07), (b, 0, zn0), TJ, r=0.004, skip=('nz', 'py', 'nx', 'px'))
    cx((a - 0.03, -d - 0.015, zn1), (b + 0.03, 0, zn1 + 0.09), CO, r=0.008, skip=('py',))       # verga do nicho
    cx((a, -d, zn1 + 0.09), (b, 0, ZB), TJ, r=0.004, skip=('nx', 'px', 'py'))
    c.face([W_((a, -0.12, zn0)), W_((b, -0.12, zn0)), W_((b, -0.12, zn1)), W_((a, -0.12, zn1))], FU, facing=M.to_3x3() @ Vector((0, -1, 0)))
    for (x0, x1) in ((a, a), (b, b)):                                                              # laterais internas do nicho
        c.face([W_((x0, -d, zn0)), W_((x0, -0.12, zn0)), W_((x0, -0.12, zn1)), W_((x0, -d, zn1))], FU,
               facing=M.to_3x3() @ Vector((1 if x0 == a else -1, 0, 0)))
    c.face([W_((a, -d, zn0)), W_((b, -d, zn0)), W_((b, -0.12, zn0)), W_((a, -0.12, zn0))], FU, facing=M.to_3x3() @ Vector((0, 0, 1)))
    c.face([W_((a, -d, zn1)), W_((b, -d, zn1)), W_((b, -0.12, zn1)), W_((a, -0.12, zn1))], FU, facing=M.to_3x3() @ Vector((0, 0, -1)))
    # toras de lenha empilhadas (topo virado para frente)
    rl = 0.052
    n0 = max(3, int((nw - 0.06) / (2 * rl + 0.008)))
    for fila in range(3):
        n = n0 - fila
        z = zn0 + rl + fila * rl * 1.72
        if z + rl > zn1 - 0.01:
            break
        for k in range(n):
            x = w / 2 + (k - (n - 1) / 2) * (2 * rl + 0.008) + rnd.uniform(-0.006, 0.006)
            rr = rl * rnd.uniform(0.85, 1.0)
            y0 = -d + 0.025 + rnd.uniform(0, 0.03)
            P.torno(c, [(rr, 0.0), (rr * 0.97, d - 0.17)], "Arv_Casca", segs=7, tampa_base=True, mat_tampa="Pol_Lenha_Topo",
                    M=M @ Matrix.Translation((x, y0, z)) @ Matrix.Rotation(-math.pi / 2, 4, 'X') @ Matrix.Rotation(rnd.uniform(0, 1), 4, 'Z'))
    # ---------------- bancada de granito (frente e laterais com chanfro)
    cx((-0.04, -d - 0.05, ZB), (w + 0.04, 0, ZG), GR, r=0.008, skip=('py',))
    # ---------------- fogareiro
    cx((0, yF, ZG), (e, 0, ZF), TJ, mats={'px': FU}, r=0.008, skip=('nz', 'py'))
    cx((w - e, yF, ZG), (w, 0, ZF), TJ, mats={'nx': FU}, r=0.008, skip=('nz', 'py'))
    c.face([W_((e, -0.002, ZG)), W_((w - e, -0.002, ZG)), W_((w - e, -0.002, ZF + 0.14)), W_((e, -0.002, ZF + 0.14))], FU,
           facing=M.to_3x3() @ Vector((0, -1, 0)))                                                  # fundo enegrecido
    cx((e, yF + 0.01, ZG), (w - e, -0.004, ZG + 0.07), FU, r=0.004, skip=('nz', 'py', 'nx', 'px'))  # soleira refrataria
    c.face([W_((e, yF + 0.03, ZG + 0.075)), W_((w - e, yF + 0.03, ZG + 0.075)), W_((w - e, -0.01, ZG + 0.075)), W_((e, -0.01, ZG + 0.075))],
           "Pol_Carvao", facing=M.to_3x3() @ Vector((0, 0, 1)))                                    # brasa
    for k in range(int((w - 2 * e) / 0.09)):                                                        # pedras de carvao soltas
        x = e + 0.05 + k * 0.09 + rnd.uniform(-0.02, 0.02)
        y = rnd.uniform(yF + 0.06, -0.08)
        P.caixa(c, (-0.025, -0.02, 0), (0.025, 0.02, 0.03), "Pol_Carvao", r=0.008,
                M=M @ Matrix.Translation((x, y, ZG + 0.07)) @ Matrix.Rotation(rnd.uniform(0, 3), 4, 'Z'))
    # grelha (lado esquerdo) com moldura e varetas
    gx0, gx1 = e + 0.03, (w / 2 + 0.05 if w > 1.5 else w - e - 0.03)
    zg = ZG + 0.27
    gy0, gy1 = yF + 0.04, -0.06
    P.tubo(c, [(gx0, gy0, zg), (gx1, gy0, zg), (gx1, gy1, zg), (gx0, gy1, zg), (gx0, gy0, zg)], 0.007, "Pol_Ferro", segs=6, M=M)
    nv = int((gx1 - gx0) / 0.035)
    for k in range(1, nv):
        x = gx0 + k * (gx1 - gx0) / nv
        P.tubo(c, [(x, gy0, zg), (x, gy1, zg)], 0.0035, "Pol_Inox", segs=4, M=M)
    for sx in (gx0, gx1):                                                                           # apoios da grelha
        cx((sx - 0.012, gy0 + 0.05, zg - 0.012), (sx + 0.012, gy1 - 0.05, zg - 0.004), "Pol_Ferro", r=0.002)
    # carnes na grelha: 2 bifes e 2 linguicas
    for k in range(2):
        x = gx0 + 0.12 + k * 0.2
        P.caixa(c, (-0.08, -0.055, 0), (0.08, 0.055, 0.022), "Pol_Carne", r=0.009,
                M=M @ Matrix.Translation((x, (gy0 + gy1) / 2 + rnd.uniform(-0.05, 0.05), zg + 0.004)) @ Matrix.Rotation(rnd.uniform(-0.4, 0.4), 4, 'Z'))
    for k in range(2):
        x = gx1 - 0.10 - k * 0.07
        P.tubo(c, [(x, gy0 + 0.06, zg + 0.018), (x + 0.01, (gy0 + gy1) / 2, zg + 0.02), (x, gy1 - 0.06, zg + 0.018)],
               [0.012, 0.016, 0.012], "Pol_Carne", segs=6, M=M, tampas=True)
    # trilhos e espetos (lado direito; na churrasqueira pequena ficam sobre a grelha)
    zt = ZG + 0.40
    for y in (yF + 0.035, -0.035):
        cx((e, y - 0.006, zt - 0.025), (w - e, y + 0.006, zt), "Pol_Inox", r=0.002)
    ne = 4 if w > 1.5 else 2
    ex0 = gx1 + 0.08 if w > 1.5 else e + 0.25
    ex1 = w - e - 0.10
    for k in range(ne):
        x = ex0 + k * (ex1 - ex0) / max(1, ne - 1)
        P.tubo(c, [(x, yF - 0.07, zt + 0.004), (x, -0.02, zt + 0.004)], 0.004, "Pol_Inox", segs=4, M=M)
        cx((x - 0.013, yF - 0.17, zt - 0.009), (x + 0.013, yF - 0.06, zt + 0.017), "Pol_Madeira_Escura", r=0.005)  # cabo
        for j in range(3):                                                                          # pedacos de carne
            y = yF + 0.10 + j * ((-0.10) - (yF + 0.10)) / 2
            P.caixa(c, (-0.03, -0.032, -0.028), (0.03, 0.032, 0.028), "Pol_Carne", r=0.012,
                    M=M @ Matrix.Translation((x, y, zt + 0.004)) @ Matrix.Rotation(rnd.uniform(-0.5, 0.5), 4, 'Y'))
    # verga de concreto e coifa
    cx((-0.015, yF - 0.015, ZF), (w + 0.015, 0, ZH0), CO, r=0.01, skip=('py',))
    b0 = [(0, yF, ZH0), (w, yF, ZH0), (w, 0, ZH0), (0, 0, ZH0)]
    t0 = [(cw0, -cd, ZH1), (cw1, -cd, ZH1), (cw1, 0, ZH1), (cw0, 0, ZH1)]
    ctr = W_((w / 2, yF / 2, ZH0 + 0.2))
    for (i, j) in ((0, 1), (1, 2), (3, 0)):
        c.face([W_(b0[i]), W_(b0[j]), W_(t0[j]), W_(t0[i])], TJ, away=ctr)
    cx((cw0 - 0.02, -cd - 0.02, ZH1 - 0.04), (cw1 + 0.02, 0, ZH1 + 0.03), CO, r=0.008, skip=('py',))  # cinta
    # chamine
    cx((cw0, -cd, ZH1 + 0.03), (cw1, 0, ztop), TJ, r=0.006, skip=('nz', 'py'))
    cx((cw0 - 0.05, -cd - 0.05, ztop), (cw1 + 0.05, 0.03, ztop + 0.06), CO, r=0.012)
    for (x, y) in ((cw0 + 0.03, -cd + 0.03), (cw1 - 0.03, -cd + 0.03), (cw0 + 0.03, -0.03), (cw1 - 0.03, -0.03)):
        cx((x - 0.045, y - 0.045, ztop + 0.06), (x + 0.045, y + 0.045, ztop + 0.26), TJ, r=0.006, skip=('nz', 'pz'))
    cx((cw0 - 0.1, -cd - 0.1, ztop + 0.26), (cw1 + 0.1, 0.1, ztop + 0.31), CO, r=0.012)
    apex = W_((w / 2, -cd / 2, ztop + 0.56))
    hp = [(cw0 - 0.12, -cd - 0.12), (cw1 + 0.12, -cd - 0.12), (cw1 + 0.12, 0.12), (cw0 - 0.12, 0.12)]
    for k in range(4):
        p, q = hp[k], hp[(k + 1) % 4]
        c.face([W_((p[0], p[1], ztop + 0.31)), W_((q[0], q[1], ztop + 0.31)), apex], "Telha", away=W_((w / 2, -cd / 2, ztop + 0.3)))
    if extra:
        x0, x1 = w, w + extra
        cx((x0, -d - 0.012, ZP), (x1, 0, ZP + 0.07), CO, r=0.006, skip=('nz', 'py', 'nx'))
        cx((x0, -d + 0.02, ZP + 0.07), (x1, 0, ZB), TJ, r=0.006, skip=('nz', 'py', 'nx'))
        # armario: 2 portas de madeira com puxador
        dw = (extra - 0.5) / 2
        for k in range(2):
            px0 = x0 + 0.15 + k * (dw + 0.2)
            cx((px0, -d - 0.005, ZP + 0.14), (px0 + dw, -d + 0.03, ZB - 0.06), "Pol_Madeira_Verniz", r=0.01)
            hx = px0 + (dw - 0.04 if k == 0 else 0.04)
            P.tubo(c, [(hx, -d + 0.0, ZB - 0.30), (hx, -d - 0.03, ZB - 0.28), (hx, -d - 0.03, ZB - 0.16), (hx, -d + 0.0, ZB - 0.14)],
                   0.007, "Pol_Inox", segs=6, M=M)
        # tampo de granito com recorte da cuba
        sx0, sx1 = x0 + 0.55, x0 + 1.15
        sy0, sy1 = -d + 0.12, -0.12
        cx((x0, -d - 0.05, ZB), (sx0, 0, ZG), GR, r=0.008, skip=('py', 'nx'))
        cx((sx1, -d - 0.05, ZB), (x1 + 0.04, 0, ZG), GR, r=0.008, skip=('py',))
        cx((sx0, -d - 0.05, ZB), (sx1, sy0, ZG), GR, r=0.006, skip=('py', 'nx', 'px'))
        cx((sx0, sy1, ZB), (sx1, 0, ZG), GR, r=0.006, skip=('py', 'nx', 'px'))
        cx((-0.04, -0.025, ZG), (x1 + 0.04, 0, ZG + 0.10), GR, r=0.006, skip=('py', 'nz'))                 # frontao
        # cuba de inox (caixa aberta com fundo e ralo)
        zc = ZG - 0.19
        for (p0, p1) in (((sx0, sy0, zc), (sx1, sy0, ZG)), ((sx1, sy0, zc), (sx1, sy1, ZG)),
                         ((sx1, sy1, zc), (sx0, sy1, ZG)), ((sx0, sy1, zc), (sx0, sy0, ZG))):
            c.face([W_(p0), W_((p1[0], p1[1], zc)), W_((p1[0], p1[1], ZG)), W_((p0[0], p0[1], ZG))], "Pol_Inox",
                   facing=M.to_3x3() @ (Vector(((sx0 + sx1) / 2, (sy0 + sy1) / 2, zc)) - Vector(p0)))
        c.face([W_((sx0, sy0, zc)), W_((sx1, sy0, zc)), W_((sx1, sy1, zc)), W_((sx0, sy1, zc))], "Pol_Inox", facing=M.to_3x3() @ Vector((0, 0, 1)))
        P.torno(c, [(0.03, 0.0), (0.03, 0.002)], "Metal_Escuro", segs=10, tampa_topo=True,
                M=M @ Matrix.Translation(((sx0 + sx1) / 2, (sy0 + sy1) / 2, zc + 0.001)))
        # torneira gooseneck
        tx, ty = (sx0 + sx1) / 2, -0.07
        P.torno(c, [(0.028, 0.0), (0.028, 0.03, 'q'), (0.016, 0.04), (0.016, 0.06)], "Pol_Inox", segs=12, tampa_topo=True,
                M=M @ Matrix.Translation((tx, ty, ZG)))
        arco = [(tx, ty, ZG + 0.05), (tx, ty, ZG + 0.26)]
        for k in range(1, 8):
            a_ = math.pi * k / 7
            arco.append((tx, ty - 0.09 + 0.09 * math.cos(a_), ZG + 0.26 + 0.09 * math.sin(a_)))
        arco.append((tx, ty - 0.18, ZG + 0.20))
        P.tubo(c, arco, 0.011, "Pol_Inox", segs=8, M=M)
        P.tubo(c, [(tx + 0.02, ty, ZG + 0.10), (tx + 0.10, ty - 0.02, ZG + 0.13)], 0.007, "Pol_Inox", segs=6, M=M, tampas=True)
    B.add_collider(nome, (-0.05, -d - 0.06, ZP), (w + extra + 0.05, 0, ZH0), M)


churrasqueira(B.mat_rz((3.5, 11.2, 0), rz_deg=-90), 1.2, 0.7, 5.3)                     # varanda oeste
churrasqueira(B.mat_rz((2.5, 25.8, 0)), 2.0, 0.8, 5.0, extra=2.5)                       # quintal
me = P.substituir("Predio_Churrasqueiras", c)
if "Predio_Churrasqueiras" not in bpy.data.objects:
    ob = bpy.data.objects.new("Predio_Churrasqueiras", me)
    B.coll("Predio_Estrutura").objects.link(ob)
print("churrasqueiras: %d tris, materiais %s" % (P.tris(me), [m.name for m in me.materials]))
