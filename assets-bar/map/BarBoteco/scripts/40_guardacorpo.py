# Guarda-corpo da varanda refeito: era um gradil de caixas brancas lisas (Metal_Branco, sem textura).
# Agora: montantes de metalon preto fosco, gradil de barras verticais, travessa inferior e corrimao de madeira
# envernizada com chanfro. Mesmos vaos do 06_interior (entre os pilares, com as aberturas de passagem), mesma
# altura (1,0 m): os colisores Mob_GuardaCorpo continuam valendo. Substitui a malha no datablock existente.
# Materiais Pgn_* (texturas Poliigon do 38_materiais_poliigon.py): rode o 38 antes.
from mathutils import Vector
import barlib as B
import pollib as P

ZP = B.Z_PISO
MP, MD = "Pgn_Metal_Preto", "Pgn_Madeira_Escura"
south_x = [0.12 + 2.68 * k for k in range(9)] + [23.89]                 # (iguais ao 06_interior)
west_y = [0.12, 3.05, 6.0, 8.95, 11.9, 14.85]
spans = [((south_x[i], 0.12), (south_x[i + 1], 0.12)) for i in range(len(south_x) - 1) if i not in (2, 5)]
spans += [((0.12, west_y[i]), (0.12, west_y[i + 1])) for i in range(len(west_y) - 1) if i != 1]

Z_BAIXO, Z_SUB, Z_TOPO = ZP + 0.10, ZP + 0.925, ZP + 1.0
PASSO = 0.11                                                            # vao livre < 11 cm entre barras

m = B.Mesh("Varanda_GuardaCorpo")


def caixa_ao_longo(a, b, w, z0, z1, mat, r):
    """Caixa de a a b (no plano XY, eixo X ou Y), largura w, de z0 a z1."""
    mn = Vector((min(a.x, b.x), min(a.y, b.y), z0))
    mx = Vector((max(a.x, b.x), max(a.y, b.y), z1))
    if abs(b.x - a.x) > abs(b.y - a.y):
        mn.y -= w / 2; mx.y += w / 2
    else:
        mn.x -= w / 2; mx.x += w / 2
    P.caixa(m, mn, mx, mat, r=r)


n_barras = 0
for (p0, p1) in spans:
    a, c_ = Vector((p0[0], p0[1], 0)), Vector((p1[0], p1[1], 0))
    d = (c_ - a).normalized()
    a2, c2 = a + d * 0.09, c_ - d * 0.09
    L = (c2 - a2).length
    # montantes nas pontas e um no meio dos vaos longos
    nm = 2 if L > 2.0 else 1
    for i in range(nm + 1):
        q = a2 + (c2 - a2) * (i / nm)
        P.caixa(m, (q.x - 0.025, q.y - 0.025, ZP), (q.x + 0.025, q.y + 0.025, Z_TOPO - 0.045), MP, r=0.004)
        P.caixa(m, (q.x - 0.045, q.y - 0.045, ZP), (q.x + 0.045, q.y + 0.045, ZP + 0.008), MP, r=0.002)   # chapa de base
    # travessas de metal e corrimao de madeira
    caixa_ao_longo(a2, c2, 0.03, Z_BAIXO - 0.02, Z_BAIXO + 0.02, MP, 0.004)
    caixa_ao_longo(a2, c2, 0.03, Z_SUB - 0.012, Z_SUB + 0.012, MP, 0.004)
    caixa_ao_longo(a2 - d * 0.04, c2 + d * 0.04, 0.085, Z_TOPO - 0.045, Z_TOPO, MD, 0.012)
    # gradil: barras verticais entre os montantes
    for i in range(nm):
        s0, s1 = a2 + (c2 - a2) * (i / nm), a2 + (c2 - a2) * ((i + 1) / nm)
        Ls = (s1 - s0).length - 0.05
        nb = max(1, round(Ls / PASSO))
        for k in range(1, nb):
            q = s0 + d * (0.025 + Ls * k / nb)
            m.box((q.x - 0.008, q.y - 0.008, Z_BAIXO + 0.02), (q.x + 0.008, q.y + 0.008, Z_SUB - 0.012), MP, skip=('nz', 'pz'))
            n_barras += 1

me = P.substituir("Varanda_GuardaCorpo", m)
print("Varanda_GuardaCorpo: %d tris, %d vaos, %d barras" % (P.tris(me), len(spans), n_barras), [x.name for x in me.materials])
