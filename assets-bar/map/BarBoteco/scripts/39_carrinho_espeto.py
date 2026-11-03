# Carrinho de espetinho refeito do zero (substitui a malha importada A_carrinhoespeto).
# Gabinete de inox com placa "ESPETINHO", churrasqueira de chapa preta com carvao, espetos de carne/frango/linguica
# apoiados nas bordas, tabua com farofa, rodas de um lado, pes do outro e alca de empurrar.
# Mantem o contrato com o jogo (07_exterior.carrinho_espeto / integracao): nome da malha, origem no chao, frente -Y,
# e as propriedades fx_fogo, fx_fumaca, fx_brasas (x0, x1, y0, y1, z) usadas para os efeitos.
# Materiais Pgn_* (texturas Poliigon do 38_materiais_poliigon.py): rode o 38 antes.
import math, random
import bpy
from mathutils import Vector, Matrix
import barlib as B
import pollib as P

B.material("Pgn_Placa_Vermelha", color=(0.62, 0.04, 0.03), rough=0.35)
B.material("Pgn_Letra_Amarela", color=(1.0, 0.78, 0.08), rough=0.4, emis=(1.0, 0.7, 0.1), emis_str=0.25)
B.material("Pgn_Letra_Branca", color=(0.95, 0.95, 0.93), rough=0.4)
B.material("Pgn_Frango", color=(0.55, 0.33, 0.12), rough=0.45)
B.material("Pgn_Linguica", color=(0.36, 0.10, 0.05), rough=0.35)
B.material("Pgn_Cebola", color=(0.86, 0.80, 0.62), rough=0.5)
B.material("Pgn_Pimentao", color=(0.12, 0.40, 0.06), rough=0.4)
B.material("Pgn_Farofa", color=(0.78, 0.60, 0.32), rough=0.95)
IX, MP, FE, MD = "Pgn_Inox", "Pgn_Metal_Preto", "Pgn_Ferrugem", "Pgn_Madeira"
BR, CV = "Borracha_Preta", "Pol_Carvao"
rnd = random.Random(21)


def RX(a):
    return Matrix.Rotation(math.radians(a), 4, 'X')


def RY(a):
    return Matrix.Rotation(math.radians(a), 4, 'Y')


def RZ(a):
    return Matrix.Rotation(math.radians(a), 4, 'Z')


def T(*v):
    return Matrix.Translation(Vector(v))


def texto(m, corpo, tam, M, mat):
    """Letras planas (fonte padrao do Blender) dentro da malha m; M posiciona o plano XY do texto."""
    me = B.text_mesh("_tmp_txt", corpo, size=tam, res=4)
    for p in me.polygons:
        m.face([M @ me.vertices[i].co for i in p.vertices], mat)
    bpy.data.meshes.remove(me)


m = B.Mesh("A_carrinhoespeto")
Z_TAMPO = 0.80
# ------------------------------------------------------------ gabinete e chassi
P.caixa(m, (-0.42, -0.26, 0.20), (0.42, 0.26, Z_TAMPO), IX, r=0.012)
P.caixa(m, (-0.44, -0.28, 0.165), (0.44, 0.28, 0.20), MP, r=0.006)                 # quadro de cantoneira
P.caixa(m, (-0.43, -0.27, Z_TAMPO), (0.43, 0.27, Z_TAMPO + 0.012), IX, r=0.004)    # tampo
for x in (-0.205, 0.205):                                                          # portas do lado do vendedor (+Y)
    P.caixa(m, (x - 0.19, 0.258, 0.25), (x + 0.19, 0.268, 0.75), IX, r=0.004)
    P.tubo(m, [(x - 0.13 * (1 if x > 0 else -1), 0.268, 0.44), (x - 0.13 * (1 if x > 0 else -1), 0.29, 0.45),
               (x - 0.13 * (1 if x > 0 else -1), 0.29, 0.55), (x - 0.13 * (1 if x > 0 else -1), 0.268, 0.56)], 0.007, MP, segs=6)
# placa da frente (cliente, -Y)
P.caixa(m, (-0.39, -0.272, 0.30), (0.39, -0.258, 0.72), "Pgn_Placa_Vermelha", r=0.006)
P.caixa(m, (-0.37, -0.276, 0.505), (0.37, -0.271, 0.513), "Pgn_Letra_Amarela", r=0.0)
texto(m, "ESPETINHO", 0.125, T(0, -0.2765, 0.585) @ RX(90), "Pgn_Letra_Amarela")
texto(m, "HIGHLAND BAR", 0.058, T(0, -0.2765, 0.44) @ RX(90), "Pgn_Letra_Branca")
texto(m, "carne  frango  linguica", 0.034, T(0, -0.2765, 0.355) @ RX(90), "Pgn_Letra_Branca")

# ------------------------------------------------------------ rodas (-X) e pes (+X)
XR, RR = -0.30, 0.14
for s in (-1, 1):
    y = s * 0.305
    M = T(XR, y, RR) @ RX(90)
    P.torno(m, [(0.075, -0.026), (0.115, -0.03), (0.134, -0.018, 'q'), (0.14, 0.0), (0.134, 0.018, 'q'), (0.115, 0.03), (0.075, 0.026)],
            BR, segs=20, M=M)                                                      # pneu
    P.torno(m, [(0.0, -0.024), (0.075, -0.024, 'q'), (0.075, 0.024, 'q'), (0.0, 0.024)], IX, segs=20, M=M)   # aro
    P.torno(m, [(0.0, -0.034), (0.022, -0.034, 'q'), (0.022, 0.034, 'q'), (0.0, 0.034)], MP, segs=10, M=M)  # cubo
    P.caixa(m, (XR - 0.025, s * 0.27, RR - 0.01), (XR + 0.025, s * 0.276, 0.17), MP, r=0.003)             # garfo
P.tubo(m, [(XR, -0.30, RR), (XR, 0.30, RR)], 0.009, MP, segs=8)                     # eixo
for s in (-1, 1):
    P.caixa(m, (0.33, s * 0.225 - 0.017, 0.03), (0.364, s * 0.225 + 0.017, 0.17), MP, r=0.004)
    P.torno(m, [(0.0, 0.0), (0.026, 0.0), (0.03, 0.012), (0.024, 0.032, 'q'), (0.0, 0.032)], BR, segs=10,
            M=T(0.347, s * 0.225, 0.0))                                            # sapata de borracha
P.caixa(m, (0.338, -0.225, 0.07), (0.356, 0.225, 0.09), MP, r=0.003)                # travessa dos pes

# alca de empurrar (+X)
P.tubo(m, [(0.425, -0.20, 0.70), (0.47, -0.20, 0.76), (0.53, -0.20, 0.86), (0.53, 0.20, 0.86), (0.47, 0.20, 0.76), (0.425, 0.20, 0.70)],
       0.013, MP, segs=8)
P.tubo(m, [(0.53, -0.13, 0.86), (0.53, 0.13, 0.86)], 0.019, BR, segs=10, tampas=True)

# ------------------------------------------------------------ churrasqueira (chapa preta, carvao)
X0, X1, Y0, Y1, ZC0, ZC1, E = -0.40, 0.22, -0.20, 0.20, Z_TAMPO + 0.012, 0.965, 0.012
P.caixa(m, (X0, Y0, ZC0), (X1, Y1, ZC0 + 0.012), MP, r=0.003)                       # fundo
P.caixa(m, (X0, Y0, ZC0), (X1, Y0 + E, ZC1), MP, r=0.003, mats={'py': FE})
P.caixa(m, (X0, Y1 - E, ZC0), (X1, Y1, ZC1), MP, r=0.003, mats={'ny': FE})
P.caixa(m, (X0, Y0 + E, ZC0), (X0 + E, Y1 - E, ZC1), MP, r=0.003, mats={'px': FE})
P.caixa(m, (X1 - E, Y0 + E, ZC0), (X1, Y1 - E, ZC1), MP, r=0.003, mats={'nx': FE})
for k in range(7):                                                                 # respiros na frente
    x = X0 + 0.07 + k * (X1 - X0 - 0.14) / 6
    m.box((x - 0.018, Y0 - 0.0015, ZC0 + 0.03), (x + 0.018, Y0 + 0.001, ZC0 + 0.045), BR, skip=('py',))
ZB = ZC0 + 0.05                                                                    # cama de carvao
m.face([(X0 + E, Y0 + E, ZB), (X1 - E, Y0 + E, ZB), (X1 - E, Y1 - E, ZB), (X0 + E, Y1 - E, ZB)], CV, facing=(0, 0, 1))
P.caixa(m, (X0 + E, Y0 + E, ZC0 + 0.012), (X1 - E, Y1 - E, ZB), FE, r=0.0, skip=('pz', 'nz'))
for _ in range(26):                                                                # pedacos de carvao soltos
    x, y = rnd.uniform(X0 + 0.04, X1 - 0.04), rnd.uniform(Y0 + 0.04, Y1 - 0.04)
    s = rnd.uniform(0.012, 0.022)
    P.caixa(m, (-s, -s * 0.8, -s * 0.6), (s, s * 0.8, s * 0.6), CV, r=s * 0.3,
            M=T(x, y, ZB + s * 0.3) @ RZ(rnd.uniform(0, 180)) @ RX(rnd.uniform(-25, 25)))

# espetos apoiados nas bordas da frente e de tras, cabos de madeira para o cliente (-Y)
ZE = ZC1 + 0.006
TIPOS = (("Pol_Carne", "Pgn_Cebola", "Pol_Carne", "Pgn_Pimentao", "Pol_Carne"),
         ("Pgn_Frango",) * 5, ("Pgn_Linguica",) * 4)
NE = 8
for k in range(NE):
    x = X0 + 0.055 + k * (X1 - X0 - 0.11) / (NE - 1)
    P.tubo(m, [(x, Y0 - 0.05, ZE), (x, Y1 + 0.02, ZE)], 0.0028, IX, segs=5)
    P.caixa(m, (x - 0.009, Y0 - 0.14, ZE - 0.008), (x + 0.009, Y0 - 0.045, ZE + 0.008), MD, r=0.003)
    tipo = TIPOS[k % 3] if k != 5 else TIPOS[0]
    n = len(tipo)
    for i, mat in enumerate(tipo):
        y = -0.13 + (i + 0.5) * 0.26 / n
        if mat == "Pgn_Linguica":
            P.torno(m, [(0.0, -0.028), (0.012, -0.026), (0.017, -0.016), (0.018, 0.0), (0.017, 0.016), (0.012, 0.026), (0.0, 0.028)],
                    mat, segs=8, M=T(x, y, ZE) @ RX(90))
        else:
            s = 0.019 if mat in ("Pgn_Cebola", "Pgn_Pimentao") else rnd.uniform(0.019, 0.024)
            P.caixa(m, (-s, -s * 0.8, -s), (s, s * 0.8, s), mat, r=s * 0.35,
                    M=T(x, y, ZE + 0.002) @ RY(rnd.uniform(-30, 30)) @ RX(rnd.uniform(-15, 15)))

# ------------------------------------------------------------ bancada lateral (+X): tabua, farofa, sal
ZT = Z_TAMPO + 0.012
P.caixa(m, (0.245, -0.19, ZT), (0.415, 0.15, ZT + 0.022), MD, r=0.005)
P.torno(m, [(0.0, 0.0), (0.035, 0.0), (0.05, 0.01), (0.062, 0.05, 'q'), (0.056, 0.05, 'q'), (0.0, 0.042)], "Louca_Branca",
        segs=16, M=T(0.33, 0.07, ZT + 0.022), mats=["Louca_Branca", "Louca_Branca", "Louca_Branca", "Louca_Branca", "Pgn_Farofa"])
P.torno(m, [(0.0, 0.0), (0.018, 0.0), (0.018, 0.07), (0.013, 0.08), (0.0, 0.083)], "Pgn_Letra_Branca", segs=10,
        M=T(0.38, -0.12, ZT + 0.022), tampa_base=False)
P.torno(m, [(0.0, 0.0), (0.022, 0.0), (0.024, 0.11), (0.016, 0.13), (0.006, 0.15), (0.0, 0.152)], "Pgn_Placa_Vermelha", segs=10,
        M=T(0.30, -0.13, ZT + 0.022))                                              # bisnaga de molho
P.caixa(m, (0.26, -0.06, ZT + 0.022), (0.30, 0.03, ZT + 0.03), IX, r=0.002)         # faca (lamina)
P.caixa(m, (0.30, -0.055, ZT + 0.022), (0.345, 0.025, ZT + 0.032), MD, r=0.003)

# ------------------------------------------------------------ gravar no datablock existente
me = P.substituir("A_carrinhoespeto", m)
xs = [v.co for v in me.vertices]
mn = Vector([min(c[i] for c in xs) for i in range(3)])
mx = Vector([max(c[i] for c in xs) for i in range(3)])
me["largura_m"], me["profundidade_m"], me["altura_m"] = mx.x - mn.x, mx.y - mn.y, mx.z - mn.z
me["tipo"], me["origem"] = "fino", "39_carrinho_espeto"
CX = (X0 + X1) / 2
me["fx_fogo"] = (CX, 0.0, ZB + 0.02)
me["fx_fumaca"] = (CX, 0.0, ZE + 0.06)
bx = (X0 + E + 0.01, X1 - E - 0.01, Y0 + E + 0.01, Y1 - E - 0.01, ZB + 0.004)
me["fx_brasas"] = bx
mb = bpy.data.meshes.get("A_carrinhoespeto_brasas")
if mb is not None and len(mb.vertices) == 4:                                       # plano de brasas (Brasa_Fogo)
    for v, (x, y) in zip(mb.vertices, ((bx[0], bx[2]), (bx[1], bx[2]), (bx[1], bx[3]), (bx[0], bx[3]))):
        v.co = (x, y, bx[4])
    mb.update()
# objetos ja instanciados: efeitos filhos e colisor
for ob in [o for o in bpy.data.objects if o.data == me]:
    for ch in ob.children:
        if ch.get("fx") == "fogo":
            ch.location = me["fx_fogo"]
        elif ch.get("fx") == "fumaca":
            ch.location = me["fx_fumaca"]
    col = bpy.data.objects.get("COL_Int_" + ob.name)
    if col is not None:
        bpy.data.objects.remove(col)
        B.collider_obj("Int_" + ob.name, ob)
print("A_carrinhoespeto: %d tris, %.2f x %.2f x %.2f m" % (P.tris(me), me["largura_m"], me["profundidade_m"], me["altura_m"]),
      "mats:", [mt.name for mt in me.materials])
