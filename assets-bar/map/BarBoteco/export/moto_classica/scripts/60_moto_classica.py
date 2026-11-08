# 60_moto_classica.py
# Moto classica (street 150 cc estilo anos 80/90) refeita a partir da moto preta da Tripo
# (Desktop\BAR\2.0\veiculos\moto\moto_classica_tripo_original.blend: 1 malha, 7,4k faces, torta 7,6 graus em Z e 3 em Y,
# rodas ovais e desalinhadas, roda traseira fundida no quadro, pecas em bolha).
#  - a Tripo serviu de MEDIDA (vistas ortogonais com grade + raycast): entre-eixos 1,37 m, coluna 26 graus, tanque com topo a
#    0,96 m, banco em dois niveis (0,84 / 0,91 m), farol redondo r 0,10 m
#  - tudo e malha propria, fechada, em quads: reaproveita a infraestrutura e o motor da v4 (57_moto_v4.py, que executa o
#    55 e o 54) e troca o que e da moto classica: rodas raiadas (36 raios, cubo com tambor), garfo com sanfonas, farol
#    redondo cromado com orelhas, setas redondas, tanque gota com joelheiras e emblema 3D, banco de dois niveis com
#    cinta, tampas laterais, alca da garupa e protetor de motor cromados, escapamento cromado, paralama traseiro preto
#  - pintura com COR ESCOLHIVEL: as faces de tinta (tanque, tampas laterais, paralama dianteiro, orelhas do farol) usam o
#    material Moto_Pintura = textura neutra x cor (baseColorFactor no glTF). No Blender: propriedade "cor_pintura" do
#    Moto_Rig (driver no no COR_PINTURA). No jogo: moto_classica.js -> moto.pintar('#8a1010').
#  - pecas moveis com osso proprio: direcao, suspensao, rodas, balanca, descanso, manetes, acelerador, pedal do freio,
#    alavanca do cambio, ponteiros, tampa do tanque, pedaleiras da garupa (dobram)
# Rodar: blender.exe -b --factory-startup -P 60_moto_classica.py -- --exportar [--sem-bake]
#        blender.exe -b --factory-startup -P 60_moto_classica.py -- --previa   (so geometria, cor lisa por peca)
# Convencoes: frente = -Y (= +Z no glTF), esquerda do piloto = +X, Z para cima, origem no chao entre os eixos.
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix

SCRIPTS = "C:/Users/rafael/BarBoteco/scripts"
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if "--exportar" in ARGS or "--previa" in ARGS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
_SO6 = globals().get("SO_FUNCOES")
SO_FUNCOES = True
exec(compile(open(SCRIPTS + "/57_moto_v4.py", encoding="utf-8").read(), "57_moto_v4.py", "exec"), globals())
SO_FUNCOES = _SO6

SAIDA = r"C:\Users\rafael\BarBoteco\export\moto_classica"
BLEND_COPIA = r"C:\Users\rafael\Desktop\BAR\2.0\veiculos\moto\moto_classica.blend"
PREVIA = r"C:\Users\rafael\Desktop\BAR\2.0\veiculos\moto\moto_classica_previa.blend"
COLS = ["Moto_Classica", "Moto_Colisao", "Moto_TMP"]

# ---------------------------------------------------------------- cotas (metros), medidas na Tripo alinhada (x 1,95)
YF, YT, ZC = -0.686, 0.686, 0.300
R_PNEU = 0.300
RAKE = math.radians(26.0)
AX = V((0, math.sin(RAKE), math.cos(RAKE)))
NF = V((0, math.cos(RAKE), -math.sin(RAKE)))
AXLE_F = V((0, YF, ZC))
AXLE_T = V((0, YT, ZC))
X_G = 0.100
T_CL, T_CU = 0.545, 0.735
PIVO_BAL = V((0, 0.235, 0.355))
PIVO_DESC = V((0.112, 0.105, 0.265))
ROT_RAKE = Matrix.Rotation(-RAKE, 4, 'X')
FAROL_C = V((0, -0.512, 0.884))      # centro do farol (frente do aro em y -0,566)
R_FAROL = 0.098
COR_PADRAO = (0.012, 0.012, 0.014, 1.0)   # preto da referencia; o jogo troca (moto.pintar)

# pecas novas (os ids continuam < 256 para o bake)
for _n in ("raio_arame", "sanfona", "emblema", "joelheira", "alca", "farol_refl", "niple", "friso"):
    if _n not in PECAS:
        PECAS.append(_n)
PID.clear()
PID.update({n: i for i, n in enumerate(PECAS)})
PINTURA = ("tinta", "carenagem")
DENSIDADE.update({"raio_arame": 0.35, "sanfona": 0.7, "emblema": 5.0, "joelheira": 1.2, "alca": 0.8, "farol_refl": 1.2,
                  "niple": 0.3, "friso": 1.5, "aro": 1.1, "cubo": 1.1, "tambor": 1.1, "tinta": 1.5, "carenagem": 1.4, "banco": 1.4})
INFO.clear()


def F(t, x=0.0):
    """ponto da coluna/bengala a t metros do eixo dianteiro"""
    return AXLE_F + AX * t + V((x, 0, 0))


# ---------------------------------------------------------------- superficie analitica das tabelas (tanque, banco)
def _cotas(tab_, y):
    ys = [t["y"] for t in tab_]
    return {k: float(np.interp(y, ys, [t[k] for t in tab_])) for k in ("zt", "zb", "w", "et", "eb")}


def x_superficie(tab_, y, z):
    """meia-largura da secao superelíptica (tabela suavizada) na altura z"""
    c = _cotas(tab_, y)
    cz, h = (c["zt"] + c["zb"]) / 2, (c["zt"] - c["zb"]) / 2
    q = max(-1.0, min(1.0, (z - cz) / h))
    e = c["et"] if q >= 0 else c["eb"]
    s = abs(q) ** (e / 2)
    cc = math.sqrt(max(0.0, 1 - s * s))
    return c["w"] * cc ** (2 / e)


def placa_conforme(p, tab_, perfil, esp, peca, lado, folga=0.0008, nr=4, raio=0.012):
    """placa fina 'colada' no costado de um volume de tabela: contorno 2D (y, z) arredondado, x = superficie + folga,
    espessura esp para fora; lado = +1 (esquerda) / -1; nr=0 usa o contorno como veio"""
    pts = arredondar(perfil, raio, nr) if nr else [np.array(q, float) for q in perfil]
    c2 = np.mean(pts, 0)
    aneis = []
    for f in (1.0, 0.66, 0.33):
        aneis.append([c2 + (q - c2) * f for q in pts])
    fora, dentro = [], []
    for anel in aneis:
        fo, de = [], []
        for (y, z) in anel:
            xs = x_superficie(tab_, y, z)
            fo.append(p.bm.verts.new((lado * (xs + folga + esp), y, z)))
            de.append(p.bm.verts.new((lado * (xs + folga), y, z)))
        fora.append(fo)
        dentro.append(de)
    cf = V((lado * (x_superficie(tab_, *c2) + folga + esp), c2[0], c2[1]))
    cd = V((lado * (x_superficie(tab_, *c2) + folga), c2[0], c2[1]))
    vf, vd = p.bm.verts.new(cf), p.bm.verts.new(cd)
    n = len(pts)
    for a, b in zip(fora, fora[1:]):
        p.ligar(a, b, peca)
    for a, b in zip(dentro, dentro[1:]):
        p.ligar(b, a, peca)
    for k in range(n):
        k2 = (k + 1) % n
        p.face([fora[-1][k], fora[-1][k2], vf], peca)
        p.face([dentro[-1][k2], dentro[-1][k], vd], peca)
        p.face([dentro[0][k], dentro[0][k2], fora[0][k2], fora[0][k]], peca)


# ---------------------------------------------------------------- rodas raiadas
def _pneu(p, c, larg, lados=56):
    L = larg / 2
    R = R_PNEU
    lat = [-.72, -.48, -.24, 0.0, .24, .48, .72]
    lado_a = [(.214, -.80), (.226, -.90), (.248, -.98), (.270, -1.0), (.285, -.93), (.292, -.82)]
    perfil = [(r, a * L) for r, a in lado_a]
    perfil += [(R - 0.007 * (f / .72) ** 2, f * L) for f in lat]
    perfil += [(r, -a * L) for r, a in reversed(lado_a)]
    base = len(lado_a)

    def mod(i, k):
        j = i - base
        if 0 <= j < len(lat) and j != 3:
            return 1.0 if ((k + abs(j - 3) * 2) % 6) < 3 else 0.975
        return 1.0
    p.lathe_uv(perfil, c, (1, 0, 0), lados, "pneu", mod=mod)


def roda_raiada(nome, yc, larg, osso, s_tambor, r_tambor, coroa=False):
    """pneu com banda em geometria, aro de aco cromado, 36 raios cruzados, cubo com tambor do lado s_tambor (+1 = +X)"""
    p = P()
    c = V((0, yc, ZC))
    _pneu(p, c, larg)
    rw = larg * 0.40
    ext = [(.234, -rw * 1.12), (.229, -rw * 1.02), (.226, -rw * 0.60), (.214, -rw * 0.38), (.214, rw * 0.38),
           (.226, rw * 0.60), (.229, rw * 1.02), (.234, rw * 1.12)]
    interno = [(.227, rw * 1.06), (.208, rw * 0.36), (.208, -rw * 0.36), (.227, -rw * 1.06)]
    p.lathe_uv(ext + interno, c, (1, 0, 0), 48, "aro", fechar=True)
    # cubo: corpo, flanges dos raios e tambor (casca com aletas) do lado do freio
    s = s_tambor
    hub = [(.016, -.078), (.022, -.076), (.024, -.062), (.030, -.052), (.046, -.049), (.049, -.044), (.046, -.038),
           (.031, -.034), (.029, 0.0), (.031, .034), (.046, .038), (.049, .044), (.046, .049), (.030, .052), (.024, .062),
           (.022, .076), (.016, .078)]
    p.lathe_uv(hub, c, (1, 0, 0), 24, "cubo")
    rt = r_tambor
    # tambor (gira com a roda) entre o cubo e o espelho; a flange dos raios do lado do freio e a borda do tambor
    tamb = [(.040, s * .022), (rt * 0.90, s * .024), (rt + .004, s * .027), (rt + .004, s * .032), (rt, s * .034),
            (rt, s * .050), (rt * 0.97, s * .053), (rt * 0.60, s * .054)]
    p.lathe_uv(tamb, c, (1, 0, 0), 32, "tambor")
    for k in range(2):     # aletas de refrigeracao em volta do tambor
        xa = s * (.039 + k * .007)
        p.lathe_uv([(rt - .001, xa - .0012), (rt + .005, xa - .0010), (rt + .005, xa + .0010), (rt - .001, xa + .0012)],
                   c, (1, 0, 0), 32, "tambor", fechar=True)
    # 36 raios: metade em cada flange, cruzados (sai tangente do flange)
    n = 36
    for k in range(n):
        lado = 1 if k % 2 == 0 else -1
        a_h = 2 * math.pi * k / n
        sentido = 1 if (k // 2) % 2 == 0 else -1
        a_r = a_h + sentido * 0.52
        xh, rh = (s * 0.029, rt + 0.001) if lado == s else (-s * 0.044, 0.046)
        ph = c + V((xh, rh * math.sin(a_h), rh * math.cos(a_h)))
        pr = c + V((lado * 0.009, 0.212 * math.sin(a_r), 0.212 * math.cos(a_r)))
        p.cilindro(ph, pr, 0.0036, "raio_arame", 5)
        d = (pr - ph).normalized()
        p.cilindro(pr - d * 0.004, pr + d * 0.006, 0.0062, "niple", 4)
    # bico da camara
    a = 0.3
    p.cilindro(c + V((0.0, 0.212 * math.sin(a), 0.212 * math.cos(a))), c + V((0.0, 0.232 * math.sin(a), 0.232 * math.cos(a))),
               0.007, "borracha", 8)
    if coroa:
        p.lathe_uv([(.060, .052), (.104, .055), (.108, .060), (.104, .0655), (.060, .0625)], c, (1, 0, 0), 76, "coroa",
                   mod=lambda i, k: ((1.0 if k % 2 == 0 else 0.935) if i in (1, 2, 3) else 1.0), fechar=True)
        for k in range(6):
            aa = 2 * math.pi * k / 6
            porca(p, c + V((.0655, .078 * math.sin(aa), .078 * math.cos(aa))), (1, 0, 0), 0.010, 0.004)
    parte(nome, osso, p)


def espelho_freio(nome, centro, s, rt, osso, braco_para, braco_ang):
    """espelho do tambor (nao gira): tampa com nervuras, porca do eixo e alavanca do freio"""
    p = P()
    c = V(centro)
    # fica entre o tambor (ate x 0,054) e a bengala/balanca (face interna em x 0,0745)
    p.lathe_uv([(.018, s * .053), (rt * 0.985, s * .054), (rt * 0.99, s * .059), (rt * 0.80, s * .064), (rt * 0.45, s * .067),
                (.024, s * .069), (.018, s * .073)], c, (1, 0, 0), 44, "tambor")
    for k in range(6):
        aa = 2 * math.pi * k / 6 + 0.3
        q0 = c + V((s * .066, .030 * math.sin(aa), .030 * math.cos(aa)))
        q1 = c + V((s * .060, (rt * .9) * math.sin(aa), (rt * .9) * math.cos(aa)))
        p.barra(q0, q1, 0.006, 0.006, "tambor", up=(1, 0, 0))
    porca(p, c + V((s * .073, 0, 0)), (s, 0, 0), 0.022, 0.006)
    # eixo do came + alavanca (por dentro da bengala)
    ca = c + V((s * .066, rt * 0.62 * math.sin(braco_ang), rt * 0.62 * math.cos(braco_ang)))
    p.cilindro(ca - V((s * 0.004, 0, 0)), ca + V((s * 0.006, 0, 0)), 0.016, "aco", 10)
    p.barra(ca + V((s * 0.002, 0, 0)), V(braco_para), 0.016, 0.006, "aco", up=(1, 0, 0))
    parte(nome, osso, p)
    return ca


# ---------------------------------------------------------------- paralama dianteiro (pintado) e hastes
def paralama_diant_classico():
    p = P()
    casca_arco(p, AXLE_F, 0.338, -48, 78, lambda a: 0.058 + 0.008 * (abs(a - 15) / 63) ** 2, 0.0035, 32, 12, "tinta",
               coroa=0.020)
    parte("Paralama_Diant", "suspensao_diant", p)
    h = P()
    for sg in (1, -1):
        for ang in (-22.0, 40.0):
            a = math.radians(ang)
            q = AXLE_F + V((sg * 0.056, 0.312 * math.sin(a), 0.312 * math.cos(a)))   # sob a borda (coroa baixa o lado)
            alvo = F(0.090 if ang > 0 else 0.150, sg * (X_G - 0.006))
            h.tubo([q, (q + alvo) * 0.5 + V((sg * 0.012, 0, 0)), alvo], 0.0075, "cromo", 6, up=(1, 0, 0), suavizar=2,
                   tampa=True)
    parte("Paralama_Hastes", "suspensao_diant", h)


# ---------------------------------------------------------------- tanque gota, joelheiras, emblema, tampa
TANQUE = [(-0.336, .900, .812, .060, 2.6, 2.4), (-0.322, .934, .776, .112, 2.6, 2.4), (-0.300, .950, .752, .148, 2.5, 2.4),
          (-0.260, .958, .734, .170, 2.4, 2.4), (-0.200, .962, .724, .180, 2.3, 2.4), (-0.140, .964, .719, .178, 2.3, 2.4),
          (-0.080, .963, .719, .169, 2.3, 2.4), (-0.020, .955, .722, .153, 2.4, 2.4), (0.040, .935, .728, .134, 2.5, 2.4),
          (0.085, .905, .738, .117, 2.6, 2.4), (0.120, .868, .750, .099, 2.7, 2.4), (0.150, .832, .764, .078, 2.9, 2.4)]
YTC = -0.118     # tampa do tanque
EMB_Y, EMB_Z, EMB_A, EMB_B = -0.248, 0.872, 0.046, 0.029     # emblema oval do tanque (centro y, z e semi-eixos)


def faixa_conforme(p, tab_, caminho, larg, lado, peca, folga=0.0010):
    """fita fina colada no costado (friso): caminho [(y, z)], largura larg no plano (y, z); pontas afinam"""
    n = len(caminho)
    ant = None
    for i, (y, z) in enumerate(caminho):
        a = caminho[max(i - 1, 0)]
        b = caminho[min(i + 1, n - 1)]
        t = np.array([b[0] - a[0], b[1] - a[1]])
        t /= np.linalg.norm(t)
        nn = np.array([-t[1], t[0]])
        f = min(1.0, i / 3.0, (n - 1 - i) / 3.0) * 0.8 + 0.2
        par = []
        for sg in (-1, 1):
            q = np.array([y, z]) + nn * sg * larg * 0.5 * f
            par.append(p.bm.verts.new((lado * (x_superficie(tab_, q[0], q[1]) + folga), q[0], q[1])))
        if ant:
            p.face([ant[0], ant[1], par[1], par[0]], peca)
        ant = par


def tanque_classico():
    an = aneis_de_tabela(interpolar(_tab(TANQUE), 36), lados=40, passes=2)
    p = P()
    malha_de_aneis(p, an, "tinta", ponta_a=((0.10, 0.84), (0.22, 0.58), (0.32, 0.30)),
                   ponta_b=((0.14, 0.84), (0.30, 0.55), (0.44, 0.25)))
    parte("Tanque", "chassi", p)
    tab_ = interpolar(_tab(TANQUE), 36)
    # suavizacao igual a dos aneis (2 passes) para a superficie analitica bater com a malha
    suav = [dict(t) for t in tab_]
    for k in ("zt", "zb", "w", "et", "eb"):
        a = np.array([t[k] for t in suav])
        for _ in range(2):
            b = a.copy()
            b[1:-1] = 0.25 * a[:-2] + 0.5 * a[1:-1] + 0.25 * a[2:]
            a = b
        for t, v_ in zip(suav, a):
            t[k] = float(v_)
    INFO["tanque_tab"] = suav
    INFO["emblema"] = (EMB_Y, EMB_Z, EMB_A, EMB_B)
    # joelheiras de borracha (frisos em geometria) e emblema cromado oval, nos dois lados
    j = P()
    e = P()
    fr = P()
    for lado in (1, -1):
        placa_conforme(j, suav, [(-0.035, 0.770), (0.075, 0.778), (0.088, 0.850), (-0.030, 0.868)], 0.004, "joelheira", lado,
                       nr=3, raio=0.022)
        el = [(EMB_Y + EMB_A * math.cos(2 * math.pi * k / 28), EMB_Z + EMB_B * math.sin(2 * math.pi * k / 28))
              for k in range(28)]
        placa_conforme(e, suav, el, 0.0035, "emblema", lado, nr=0)
        # frisos dourados (geometria colada no tanque: nao pegam a cor da pintura)
        for desl, larg in ((0.0, 0.0042), (-0.0085, 0.0018)):
            caminho = []
            for i in range(41):     # desce da frente (sob o emblema) e corre por baixo da joelheira
                y = -0.300 + 0.380 * i / 40
                c = _cotas(suav, y)
                t = (y + 0.300) / 0.380
                caminho.append((y, c["zb"] + (c["zt"] - c["zb"]) * (0.13 + 0.37 * (1 - t) ** 2) + desl))
            faixa_conforme(fr, suav, caminho, larg, lado, "friso")
    parte("Joelheiras", "chassi", j)
    parte("Emblemas", "chassi", e)
    parte("Frisos", "chassi", fr)
    # bocal (fixo) e tampa (osso tampa_tanque, articula na frente)
    zt = float(np.interp(YTC, [t["y"] for t in suav], [t["zt"] for t in suav]))
    b = P()
    b.revolucao([(0.050, -0.006), (0.050, 0.003), (0.046, 0.005), (0.0, 0.005)], V((0, YTC, zt - 0.004)), (0, 0, 1), 28,
                "cromo")
    parte("Bocal_Tanque", "chassi", b)
    tc = P()
    tc.lathe_uv([(.001, .006), (.040, .006), (.043, .009), (.043, .015), (.038, .020), (.026, .023), (.001, .0235)],
                V((0, YTC, zt - 0.004)), (0, 0, 1), 28, "cromo")
    tc.caixa(V((0, YTC, zt + 0.021)), (0.044, 0.010, 0.006), "cromo", chanfro=0.002)
    tc.caixa(V((0, YTC - 0.045, zt + 0.006)), (0.020, 0.012, 0.008), "aco", chanfro=0.002)
    parte("Tampa_Tanque", "tampa_tanque", tc)
    INFO["tampa_pivo"] = (0.0, YTC - 0.046, zt + 0.006)
    return an


# ---------------------------------------------------------------- banco de dois niveis + base + cinta
BANCO = [(0.118, .842, .772, .070, 3.0, 4.0), (0.150, .850, .766, .104, 3.0, 4.0), (0.200, .849, .762, .126, 3.0, 4.0),
         (0.280, .843, .760, .140, 3.0, 4.0), (0.360, .846, .762, .145, 3.0, 4.0), (0.420, .866, .766, .145, 3.0, 4.0),
         (0.470, .897, .772, .142, 3.0, 4.0), (0.520, .908, .777, .138, 3.0, 4.0), (0.600, .910, .786, .134, 3.0, 4.0),
         (0.680, .911, .796, .128, 3.0, 4.0), (0.740, .904, .806, .113, 3.2, 4.0), (0.780, .886, .814, .086, 3.4, 4.0)]
Y_CINTA = 0.505


def banco_classico():
    an = aneis_de_tabela(interpolar(_tab(BANCO), 38), lados=34, passes=2)
    p = P()
    malha_de_aneis(p, an, "banco", ponta_a=((0.12, 0.88), (0.26, 0.62), (0.38, 0.30)),
                   ponta_b=((0.12, 0.88), (0.26, 0.62), (0.38, 0.30)))
    parte("Banco", "chassi", p)
    tb = [dict(t, zt=t["zb"] + 0.014, zb=t["zb"] - 0.018, w=t["w"] * 0.94, et=3.0, eb=3.0) for t in interpolar(_tab(BANCO), 24)]
    pb = P()
    malha_de_aneis(pb, aneis_de_tabela(tb, lados=24, passes=2), "plastico", ponta_a=((0.2, 0.7),), ponta_b=((0.2, 0.7),))
    parte("Banco_Base", "chassi", pb)
    # cinta da garupa: faixa da secao do banco em Y_CINTA, por cima (lado a lado), 3 mm para fora
    an2 = aneis_de_tabela(interpolar(_tab(BANCO), 38), lados=34, passes=2)
    i = int(np.argmin(np.abs(an2[:, 0, 1] - Y_CINTA)))
    ring = an2[i]
    cz = (ring[:, 2].max() + ring[:, 2].min()) / 2
    topo = [q for q in ring if q[2] > cz]
    topo.sort(key=lambda q: math.atan2(q[2] - cz, q[0]))
    ci = P()
    a0, a1 = [], []
    for q in topo:
        d = V((q[0], 0, q[2] - cz)).normalized()
        base = V((q[0], Y_CINTA, q[2])) + d * 0.003
        a0.append(ci.bm.verts.new(base + V((0, -0.016, 0))))
        a1.append(ci.bm.verts.new(base + V((0, 0.016, 0))))
    b0 = [ci.bm.verts.new(v.co - V((q[0], 0, q[2] - cz)).normalized() * 0.0025) for v, q in zip(a0, topo)]
    b1 = [ci.bm.verts.new(v.co - V((q[0], 0, q[2] - cz)).normalized() * 0.0025) for v, q in zip(a1, topo)]
    for k in range(len(topo) - 1):
        ci.face([a0[k], a0[k + 1], a1[k + 1], a1[k]], "banco")
        ci.face([b1[k], b1[k + 1], b0[k + 1], b0[k]], "banco")
        ci.face([a0[k + 1], a0[k], b0[k], b0[k + 1]], "banco")
        ci.face([a1[k], a1[k + 1], b1[k + 1], b1[k]], "banco")
    for k in (0, len(topo) - 1):
        ci.face([a0[k], a1[k], b1[k], b0[k]], "banco")
    parte("Banco_Cinta", "chassi", ci)
    INFO["banco_tab"] = BANCO


# ---------------------------------------------------------------- quadro (berco simples, coluna alta)
def quadro_classico():
    q = P()
    q.lathe_uv([(.026, T_CL + .012), (.030, T_CL + .020), (.030, T_CU - .020), (.026, T_CU - .012)], AXLE_F, AX, 20,
               "quadro", fechar=True)
    esp = [F(0.665) + NF * 0.022, V((0, -0.300, 0.840)), V((0, -0.200, 0.808)), V((0, -0.060, 0.782)),
           V((0, 0.070, 0.758)), V((0, 0.140, 0.700)), V((0, 0.168, 0.600)), V((0, 0.176, 0.500)), V((0, 0.178, 0.452))]
    q.tubo(esp, 0.052, "quadro", 14, up=(1, 0, 0), suavizar=2, tampa=False)
    inf = [F(0.565) + NF * 0.024, V((0, -0.392, 0.700)), V((0, -0.318, 0.580)), V((0, -0.250, 0.478)),
           V((0, -0.196, 0.418))]
    q.tubo(inf, 0.042, "quadro", 12, up=(1, 0, 0), suavizar=2, tampa=False)
    c0 = F(0.565) + NF * 0.02
    c1 = F(0.680) + NF * 0.02
    prisma(q, [(c0.y, c0.z), (c1.y, c1.z), (-0.300, 0.832), (-0.385, 0.712)], "quadro", -0.004, 0.004, chanfro=0.0015,
           seg=1, raio=0.01, ew=(1, 0, 0))
    dy, dz = PIVO_BAL.y - 0.21, PIVO_BAL.z - 0.37
    pl = [(0.13 + dy, 0.470 + dz), (0.20 + dy, 0.482 + dz), (0.262 + dy, 0.452 + dz), (0.270 + dy, 0.360 + dz),
          (0.242 + dy, 0.290 + dz), (0.160 + dy, 0.284 + dz), (0.130 + dy, 0.340 + dz)]
    for s in (1, -1):
        prisma(q, pl, "quadro", s * 0.106, s * 0.117, chanfro=0.0025, seg=2, raio=0.022)
        porca(q, (s * 0.117, PIVO_BAL.y, PIVO_BAL.z), (s, 0, 0), 0.026, 0.010)
        porca(q, (s * 0.117, 0.165 + dy, 0.312 + dz), (s, 0, 0), 0.016, 0.006)
        porca(q, (s * 0.117, 0.230 + dy, 0.440 + dz), (s, 0, 0), 0.016, 0.006)
    q.cilindro(V((-0.110, PIVO_BAL.y, PIVO_BAL.z)), V((0.110, PIVO_BAL.y, PIVO_BAL.z)), 0.016, "aco", 10)
    q.cilindro(V((-0.108, 0.180 + dy, 0.452 + dz)), V((0.108, 0.180 + dy, 0.452 + dz)), 0.034, "quadro", 12)
    q.cilindro(V((-0.108, 0.200 + dy, 0.300 + dz)), V((0.108, 0.200 + dy, 0.300 + dz)), 0.028, "quadro", 12)
    # espinha -> placas (desce atras do motor ate a travessa de cima)
    q.tubo([V((0, 0.178, 0.452)), V((0, 0.180 + dy, 0.452 + dz))], 0.034, "quadro", 12, up=(1, 0, 0), suavizar=0)
    trilho = [V((0.062, 0.110, 0.738)), V((0.078, 0.280, 0.742)), V((0.082, 0.500, 0.762)), V((0.078, 0.700, 0.790)),
              V((0.062, 0.800, 0.800)), V((0.025, 0.835, 0.802))]
    u = trilho + [V((-p_.x, p_.y, p_.z)) for p_ in reversed(trilho)]
    q.tubo(u, 0.026, "quadro", 10, up=(0, 0, 1), suavizar=2, tampa=True)
    q.cilindro(V((-0.075, 0.110, 0.738)), V((0.075, 0.110, 0.738)), 0.026, "quadro", 10)
    q.cilindro(V((-0.082, 0.480, 0.760)), V((0.082, 0.480, 0.760)), 0.022, "quadro", 10)
    for s in (1, -1):
        q.tubo([V((s * 0.110, 0.270, 0.430)), V((s * 0.104, 0.400, 0.600)), V((s * 0.086, 0.505, 0.752))], 0.026,
               "quadro", 10, up=(1, 0, 0), suavizar=1, tampa=True)
        q.caixa((s * 0.100, SHOCK_TOP.y, SHOCK_TOP.z + 0.008), (0.044, 0.034, 0.036), "quadro", chanfro=0.006, seg=2)
        porca(q, (s * 0.148, SHOCK_TOP.y, SHOCK_TOP.z), (s, 0, 0), 0.020, 0.007)
        q.cilindro(V((s * 0.112, SHOCK_TOP.y, SHOCK_TOP.z)), V((s * 0.150, SHOCK_TOP.y, SHOCK_TOP.z)), 0.012, "aco", 8)
        # suportes da pedaleira da garupa
        q.tubo([V((s * 0.112, 0.280, 0.420)), V((s * 0.140, 0.420, 0.404)), V((s * 0.158, 0.535, Z_PG))], 0.022,
               "quadro", 10, up=(1, 0, 0), suavizar=1, tampa=True)
        q.caixa((s * 0.161, 0.535, Z_PG), (0.018, 0.040, 0.040), "quadro", chanfro=0.005, seg=2)
        prisma(q, [(-0.215, 0.440), (-0.175, 0.440), (-0.150, 0.400), (-0.170, 0.372), (-0.210, 0.392)], "quadro",
               s * 0.020, s * 0.030, chanfro=0.002, seg=1, raio=0.008)
    q.cilindro(V((-0.036, -0.180, 0.405)), V((0.036, -0.180, 0.405)), 0.012, "parafuso", 8)
    hb = V((0, -0.352, 0.640))
    q.barra(V((0, -0.338, 0.652)), hb + V((0, -0.012, -0.015)), 0.016, 0.006, "aco", up=(1, 0, 0))
    q.revolucao([(0.012, 0.0), (0.034, 0.004), (0.036, 0.016), (0.030, 0.020), (0.0, 0.022)], hb + V((0, -0.02, -0.02)),
                (0, -0.8, -0.6), 20, "preto")
    parte("Quadro", "chassi", q)
    return hb


Z_PG = 0.390                          # altura das pedaleiras da garupa (acima do silencioso)
SHOCK_TOP = V((0.122, 0.505, 0.705))
SHOCK_BOT = V((0.122, 0.612, 0.352))


def protetor_motor():
    """protetor de motor cromado em U, preso no tubo inferior e embaixo do berco"""
    g = P()
    for s in (1, -1):
        # desce na frente do cilindro e volta ate o carter (passa por cima do coletor)
        g.tubo([V((s * 0.022, -0.345, 0.640)), V((s * 0.120, -0.335, 0.600)), V((s * 0.205, -0.305, 0.500)),
                V((s * 0.212, -0.270, 0.400)), V((s * 0.180, -0.215, 0.332)), V((s * 0.112, -0.172, 0.320))],
               0.024, "cromo", 10, up=(0, 1, 0), suavizar=2, tampa=True)
        g.caixa((s * 0.030, -0.343, 0.640), (0.024, 0.030, 0.034), "aco", chanfro=0.004)
        porca(g, (s * 0.100, -0.170, 0.320), (s, 0, 0), 0.016, 0.006)
    parte("Protetor_Motor", "chassi", g)


def paralama_interno_caixa():
    pf = P()
    casca_arco(pf, AXLE_T, 0.338, -60, 12, lambda a: 0.072, 0.004, 16, 6, "plastico", coroa=0.012)
    parte("Paralama_Interno", "chassi", pf)
    cx = P()
    prisma(cx, [(0.030, 0.712), (0.400, 0.735), (0.372, 0.580), (0.272, 0.478), (0.130, 0.478), (0.060, 0.560)],
           "plastico", -0.086, 0.086, chanfro=0.010, seg=3, raio=0.03)
    parte("Caixa_Filtro", "chassi", cx)


def tampas_laterais_classicas():
    t = P()
    perfil = [(0.025, 0.738), (0.430, 0.755), (0.330, 0.540), (0.155, 0.505), (0.040, 0.585)]
    for s in (1, -1):
        def bojo(co, s=s):
            u = (co.y - 0.24) / 0.22
            w = (co.z - 0.630) / 0.13
            co.x += s * 0.012 * max(0.0, 1 - u * u) * max(0.0, 1 - 0.6 * w * w)
            return co
        prisma(t, perfil, "carenagem", s * 0.092, s * 0.106, chanfro=0.005, seg=3, raio=[0.03, 0.045, 0.05, 0.05, 0.04],
               nr=4, deform=bojo)
        porca(t, (s * 0.112, 0.200, 0.700), (s, 0, 0), 0.012, 0.004)
    parte("Tampas_Laterais", "chassi", t)
    # plaqueta cromada "150" na tampa lateral (relevo)
    e = P()
    for s in (1, -1):
        prisma(e, [(0.155, 0.640), (0.265, 0.644), (0.262, 0.672), (0.158, 0.668)], "emblema", s * 0.1188, s * 0.1218,
               chanfro=0.0012, seg=1, raio=0.008)
    parte("Emblemas_Tampa", "chassi", e)


# ---------------------------------------------------------------- escapamento cromado classico (lado direito)
def escapamento_classico():
    e = P()
    porto = CIL_B + CIL_D * 0.112 - CIL_E2 * 0.070 + V((-0.022, 0, 0))
    e.caixa(porto, (0.050, 0.014, 0.040), "parafuso", chanfro=0.004, rot=ROT_CIL @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    col = [porto, porto + V((-0.018, -0.032, -0.020)), V((-0.058, -0.268, 0.470)), V((-0.074, -0.262, 0.365)),
           V((-0.094, -0.226, 0.282)), V((-0.118, -0.160, 0.238)), V((-0.140, -0.050, 0.226)), V((-0.160, 0.080, 0.232)),
           V((-0.176, 0.200, 0.250)), V((-0.182, 0.262, 0.262))]
    e.tubo(col, 0.038, "coletor", 14, up=(1, 0, 0), suavizar=2, tampa=False)
    a, b = V((-0.182, 0.250, 0.258)), V((-0.190, 0.930, 0.378))
    d = (b - a).normalized()

    def em(y):
        return a + d * ((y - a.y) / d.y)
    est = [(em(0.250), .038, .038), (em(0.280), .050, .050), (em(0.340), .080, .080), (em(0.380), .088, .088),
           (em(0.800), .088, .088), (em(0.840), .084, .084), (em(0.880), .070, .070), (em(0.905), .058, .058)]
    e.varrer(circ(24), est, "escapamento", up=(1, 0, 0))
    e.lathe_uv([(.030, -.004), (.030, .012), (.027, .014), (.016, .016), (.015, .036), (.017, .038), (.001, .039)],
               em(0.900), d, 18, "cromo")
    for yy in (0.395, 0.785):
        e.lathe_uv([(.0450, -.006), (.0460, .000), (.0460, .008), (.0450, .014)], em(yy), d, 24, "cromo", fechar=True)
    # protetor de calor perfurado sobre o coletor (meia lua)
    lua = []
    for k in range(11):
        f = math.radians(-90 - 70 + 140 * k / 10)
        lua.append((0.0275 * math.cos(f), 0.0275 * math.sin(f)))
    for k in range(11):
        f = math.radians(-90 + 70 - 140 * k / 10)
        lua.append((0.0245 * math.cos(f), 0.0245 * math.sin(f)))
    e.varrer(lua, [(V((-0.141, -0.040, 0.226)), 1, 1), (V((-0.162, 0.100, 0.234)), 1, 1)], "cromo", up=(0, 0, -1))
    e.barra(V((-0.160, 0.535, Z_PG - 0.012)), em(0.535) + V((0.020, 0, 0.030)), 0.030, 0.008, "quadro", up=(0, 1, 0))
    parte("Escapamento", "chassi", e)
    return em(0.900) + d * 0.039


# ---------------------------------------------------------------- frente: garfo com sanfonas, farol redondo, painel, guidao
def garfo_classico():
    d = P()     # direcao
    s_ = P()    # suspensao (desliza)
    for s in (1, -1):
        base = AXLE_F + V((s * X_G, 0, 0))
        d.lathe_uv([(.0170, .300), (.0170, T_CU + .020), (.0158, T_CU + .024)], base, AX, 18, "cromo")
        d.lathe_uv([(.0158, T_CU + .022), (.0195, T_CU + .024), (.0195, T_CU + .036), (.0150, T_CU + .040),
                    (.001, T_CU + .041)], base, AX, 6, "aco")
        s_.lathe_uv([(.001, -.052), (.019, -.052), (.0240, -.044), (.0255, -.020), (.0255, .100), (.0245, .275),
                     (.0265, .287), (.0265, .305), (.0210, .312)], base, AX, 20, "aluminio")
        # sanfona: 12 dobras entre a perna e a mesa inferior (fica na perna: comprime com o curso)
        pf = []
        z0, z1 = 0.300, T_CL - 0.030
        n = 12
        for k in range(n + 1):
            t = z0 + (z1 - z0) * k / n
            pf.append((.0262 if k % 2 == 0 else .0215, t))
        s_.lathe_uv(pf, base, AX, 16, "sanfona")
        s_.cilindro(V((s * (X_G - 0.024), YF, ZC)), V((s * (X_G + 0.026), YF, ZC)), 0.036, "aluminio", 14)
        porca(s_, (s * (X_G + 0.026), YF, ZC), (s, 0, 0), 0.020, 0.008)
        for t in (0.090, 0.150):
            caixa_eixo(s_, F(t, s * (X_G - 0.012)), AX, (0.014, 0.030, 0.024), "aluminio", chanfro=0.003)
    s_.cilindro(V((-X_G - 0.020, YF, ZC)), V((X_G + 0.020, YF, ZC)), 0.014, "aco", 10)
    mesa = [(-0.132, -0.026), (0.132, -0.026), (0.132, 0.026), (0.050, 0.030), (0.030, 0.046), (-0.030, 0.046),
            (-0.050, 0.030), (-0.132, 0.026)]
    for t, h in ((T_CL, 0.034), (T_CU, 0.028)):
        prisma(d, mesa, "aluminio" if t == T_CU else "quadro", -h / 2, h / 2, O=F(t), eu=(1, 0, 0), ev=NF, ew=AX,
               chanfro=0.006, seg=3, raio=[0.026, 0.026, 0.026, 0.02, 0.02, 0.02, 0.02, 0.026])
    porca(d, F(T_CU + 0.014), AX, 0.030, 0.010)
    parte("Garfo_Mesas", "direcao", d)
    parte("Garfo_Pernas", "suspensao_diant", s_)


def farol_classico():
    """farol redondo: concha cromada, aro, lente com refletor; orelhas pintadas nas bengalas; setas redondas"""
    h = P()
    c = FAROL_C
    yf_ = c.y - 0.054                   # frente do aro
    R = R_FAROL
    # concha (bucket): calota esferica para tras
    perfil = [(0.100, -0.050), (0.101, -0.030), (0.098, -0.005), (0.090, 0.020), (0.076, 0.042), (0.056, 0.060),
              (0.030, 0.071), (0.001, 0.075)]
    h.lathe_uv(perfil, c, (0, 1, 0), 32, "cromo", ref=(0, 0, 1))
    # aro cromado (frente)
    h.lathe_uv([(.094, .012), (.104, .010), (.107, .002), (.106, -.006), (.100, -.010), (.092, -.008)],
               V((0, yf_ + 0.010, c.z)), (0, -1, 0), 32, "cromo", ref=(0, 0, 1), fechar=True)
    # orelhas (pintadas) das bengalas ate a concha + parafusos
    for s in (1, -1):
        anel_lathe(h, F(0.650, s * X_G), AX, 0.0172, 0.0240, -0.026, 0.026, "tinta", 18)
        anel_lathe(h, F(0.585, s * X_G), AX, 0.0172, 0.0230, -0.014, 0.014, "tinta", 18)
        h.barra(F(0.625, s * (X_G + 0.006)) + V((0, -0.012, 0)), V((s * 0.101, c.y + 0.004, c.z + 0.004)), 0.014, 0.060,
                "tinta", up=(1, 0, 0))
        porca(h, (s * 0.104, c.y + 0.004, c.z + 0.004), (s, 0, 0), 0.018, 0.006)
        # haste da seta + seta redonda (lente propria)
        hs = V((s * 0.118, c.y + 0.040, c.z + 0.002))
        ps = V((s * 0.178, c.y + 0.050, c.z + 0.004))
        h.tubo([F(0.625, s * (X_G + 0.020)), hs, ps], 0.013, "cromo", 8, up=(0, 0, 1), suavizar=1, tampa=False)
        h.lathe_uv([(.009, .000), (.022, .004), (.026, .014), (.027, .024)], ps + V((0, 0.010, 0)), (0, -1, 0), 16, "cromo")
        lz = P()
        lz.lathe_uv([(.027, .0), (.027, .010), (.024, .020), (.014, .027), (.001, .029)], ps + V((0, -0.014, 0)), (0, -1, 0),
                    16, "lente")
        parte("Seta_Frente_" + ("E" if s > 0 else "D"), "direcao", lz, "Luz_Seta_" + ("E" if s > 0 else "D"))
        INFO["seta_frente_" + ("E" if s > 0 else "D")] = tuple(ps + V((0, -0.034, 0)))
    parte("Farol_Casco", "direcao", h)
    # refletor (atras da lente, aparece pelo vidro) e lente com abaulado
    rf = P()
    rf.lathe_uv([(.001, -.045), (.030, -.040), (.060, -.027), (.088, -.008), (.094, 0.0)], V((0, yf_ + 0.012, c.z)),
                (0, -1, 0), 32, "farol_refl", ref=(0, 0, 1))
    parte("Farol_Refletor", "direcao", rf)
    lf = P()
    lf.lathe_uv([(.095, -.002), (.095, .004), (.080, .012), (.050, .018), (.001, .021)], V((0, yf_ + 0.006, c.z)),
                (0, -1, 0), 32, "lente", ref=(0, 0, 1))
    parte("Farol_Lente", "direcao", lf, "Luz_Farol")
    return V((0, yf_ - 0.016, c.z))


def painel_classico():
    pn = P()
    nrm = V((0, 0.62, 0.785)).normalized()
    e1 = V((1, 0, 0))
    e2 = nrm.cross(e1)
    INFO["relogios"] = []
    cbase = F(T_CU) + AX * 0.050 + NF * -0.040
    for s, tipo in ((1, "velocimetro"), (-1, "conta_giros")):
        c = V((s * 0.054, cbase.y - 0.020, cbase.z + 0.030))
        pn.lathe_uv([(.001, -.060), (.032, -.060), (.044, -.050), (.0495, -.026), (.0495, -.002), (.0465, .003),
                     (.0435, .001)], c, nrm, 28, "cromo", ref=(1, 0, 0))
        pn.revolucao([(.0435, .0005), (0.0, .0005)], c, nrm, 28, "mostrador", ref=(1, 0, 0))
        pn.lathe_uv([(.0435, .000), (.0492, .004), (.0492, .008), (.0435, .007)], c, nrm, 28, "cromo", ref=(1, 0, 0),
                    fechar=True)
        pn.revolucao([(.0045, .003), (.0045, .0055), (0.0, .0060)], c, nrm, 10, "preto", ref=(1, 0, 0))
        INFO["relogios"].append((tuple(c), tuple(nrm), tuple(e1), tuple(e2), tipo))
        # ponteiro: peca propria (osso ponteiro_*), em repouso no zero
        pt = P()
        dz = e1 * 0.7071 + e2 * 0.7071
        base = c + nrm * 0.0035
        pt.varrer(RET4, [(base - dz * 0.006, 0.0025, 0.0015), (base + dz * 0.034, 0.0015, 0.0012)], "ponteiro",
                  up=tuple(nrm))
        parte("Ponteiro_" + tipo, "ponteiro_" + tipo, pt)
        INFO["ponteiro_" + tipo] = (tuple(c), tuple(nrm))
    pn.caixa(V((0, cbase.y - 0.014, cbase.z + 0.010)), (0.060, 0.040, 0.036), "painel", chanfro=0.010,
             rot=Matrix.Rotation(-0.66, 4, 'X'))
    pn.barra(V((0, cbase.y - 0.010, cbase.z + 0.005)), F(T_CU, 0) + NF * -0.022 + AX * 0.006, 0.040, 0.008, "aco",
             up=(1, 0, 0))
    pn.caixa(V((0, cbase.y - 0.030, cbase.z + 0.044)), (0.024, 0.010, 0.016), "preto", chanfro=0.003,
             rot=Matrix.Rotation(-0.66, 4, 'X'))
    parte("Painel", "direcao", pn)
    # cabos que descem do guidao e somem atras do farol
    mg = P()
    for x0, x1 in ((0.230, 0.060), (-0.255, -0.055), (-0.265, -0.070)):
        sg = 1 if x0 > 0 else -1
        mg.tubo([V((x0, -0.290, 1.030)), V((x0 - sg * 0.03, -0.350, 0.990)), V((x0 - sg * 0.10, -0.400, 0.930)),
                 V((x1, -0.430, 0.880))], 0.008, "cabo", 6, up=(1, 0, 0), suavizar=2, tampa=True)
    # cabo do freio dianteiro: manete direita -> braco do tambor (lado +X) pela frente da bengala
    INFO["cabo_freio_f"] = mg
    parte("Cabos_Frente", "direcao", mg)


GUIDAO = [V((0.000, -0.352, 1.000)), V((0.060, -0.352, 1.001)), V((0.130, -0.340, 1.012)), V((0.200, -0.300, 1.040)),
          V((0.255, -0.272, 1.054)), V((0.400, -0.258, 1.060))]


def guidao_classico():
    g = P()
    meia = GUIDAO
    caminho = [V((-q.x, q.y, q.z)) for q in reversed(meia)] + meia[1:]
    g.tubo(caminho, 0.0222, "cromo", 14, up=(0, 0, 1), suavizar=2, tampa=True)
    for s in (1, -1):
        g.lathe_uv([(.014, .000), (.016, .004), (.016, .032), (.001, .033)], F(T_CU + 0.014, s * 0.034), AX, 12, "aco")
        caixa_eixo(g, V((s * 0.034, -0.352, 1.000)), (1, 0, 0), (0.034, 0.036, 0.032), "aluminio", chanfro=0.007)
    ext = (meia[-1] - meia[-2]).normalized()
    maos = {}
    for s, lado in ((1, "E"), (-1, "D")):
        def em(x):
            q0, q1 = meia[-2], meia[-1]
            t = (x - q0.x) / (q1.x - q0.x)
            r = q0 + (q1 - q0) * t
            return V((s * r.x, r.y, r.z))
        ev = V((s * ext.x, ext.y, ext.z))
        pf = [(.0115, -.004), (.0175, -.002)]
        for k in range(10):
            pf += [(.0175, .006 + k * .0115), (.0162, .0105 + k * .0115)]
        pf += [(.0175, .121), (.0205, .123), (.0205, .131), (.0150, .134), (.001, .135)]
        manopla = P() if s < 0 else g
        manopla.lathe_uv(pf, em(0.262), ev, 12, "borracha")
        if s < 0:
            parte("Punho_Acelerador", "punho_acelerador", manopla)
            INFO["punho"] = (tuple(em(0.262)), tuple(ev))
        maos[lado] = em(0.262) + ev * 0.068
        caixa_eixo(g, em(0.238), ev, (0.042, 0.048, 0.034), "plastico", chanfro=0.009)
        g.caixa(em(0.238) + V((0, 0.020, 0.006)), (0.012, 0.010, 0.010), "preto", chanfro=0.002)
        caixa_eixo(g, em(0.212), ev, (0.030, 0.032, 0.028), "manete", chanfro=0.006)
        if s < 0:
            g.caixa(em(0.212) + V((0, 0.004, 0.030)), (0.034, 0.028, 0.024), "plastico", chanfro=0.005, seg=2)
            g.caixa(em(0.212) + V((0, 0.004, 0.043)), (0.030, 0.024, 0.004), "preto", chanfro=0.0015)
        # manete (peca propria, gira no pino)
        p0 = em(0.220) + V((0, -0.024, 0.004))
        mn = P()
        mn.tubo([p0, p0 + V((s * 0.040, -0.030, 0.004)), p0 + V((s * 0.110, -0.026, 0.008)),
                 p0 + V((s * 0.160, -0.010, 0.010))], 0.012, "manete", 8, up=(0, 0, 1), suavizar=1, tampa=True)
        mn.lathe_uv([(.001, -.003), (.007, -.003), (.007, .003), (.001, .003)], p0 + V((s * 0.160, -0.010, 0.010)),
                    ev, 8, "manete")
        parte("Manete_" + lado, "manete_" + ("embreagem" if s > 0 else "freio"), mn)
        INFO["manete_" + lado] = tuple(p0)
        g.cilindro(p0 + V((0, 0.006, -0.012)), p0 + V((0, 0.006, 0.014)), 0.012, "parafuso", 8)
        # retrovisor redondo classico
        b0 = em(0.212) + V((0, 0.010, 0.024))
        b1 = b0 + V((s * 0.016, 0.010, 0.080))
        b2 = b1 + V((s * 0.034, 0.012, 0.050))
        g.tubo([b0, b1, b2], 0.010, "cromo", 8, up=(0, 1, 0), suavizar=2, tampa=True)
        cab = b2 + V((s * 0.010, 0.010, 0.042))
        nrm = V((s * -0.15, 1.0, 0.10)).normalized()
        g.lathe_uv([(.001, -.020), (.030, -.018), (.048, -.010), (.054, .000), (.054, .006), (.050, .008)], cab, nrm, 24,
                   "cromo", ref=(0, 0, 1))
        g.revolucao([(.050, .0075), (0.0, .0075)], cab, nrm, 24, "espelho_vidro", ref=(0, 0, 1))
    parte("Guidao", "direcao", g)
    return maos


# ---------------------------------------------------------------- traseira: paralama preto, lanterna, placa, setas, alca
def traseira_classica():
    base = P()
    cam = [(0.740, 0.812), (0.820, 0.806), (0.885, 0.775), (0.935, 0.715), (0.968, 0.640), (0.988, 0.560)]
    off = []
    for i, (y, z) in enumerate(cam):
        a = cam[max(i - 1, 0)]
        b = cam[min(i + 1, len(cam) - 1)]
        t = np.array([b[0] - a[0], b[1] - a[1]])
        t /= np.linalg.norm(t)
        off.append((y + t[1] * 0.006, z - t[0] * 0.006))
    prisma(base, cam + list(reversed(off)), "plastico", -0.072, 0.072, chanfro=0.003, seg=2)
    # lanterna: caixa preta com aro cromado; lente vermelha (Luz_Lanterna) e luz de freio no centro (Luz_Freio)
    rot = Matrix.Rotation(math.radians(20), 4, 'X')
    cl = V((0, 0.872, 0.778))
    base.caixa(cl, (0.150, 0.060, 0.066), "plastico", chanfro=0.016, rot=rot, seg=3)
    base.caixa(cl + rot @ V((0, 0.030, 0)), (0.140, 0.006, 0.058), "cromo", chanfro=0.004, rot=rot, seg=2)
    ln = P()
    ln.caixa(cl + rot @ V((0, 0.035, 0)), (0.126, 0.008, 0.046), "lente", chanfro=0.006, rot=rot, seg=2)
    parte("Lanterna_Lente", "chassi", ln, "Luz_Lanterna")
    fr = P()
    fr.caixa(cl + rot @ V((0, 0.0395, 0.000)), (0.060, 0.004, 0.022), "lente", chanfro=0.003, rot=rot, seg=1)
    parte("Freio_Lente", "chassi", fr, "Luz_Freio")
    # placa e suporte
    ang = math.atan2(cam[-1][0] - cam[-3][0], cam[-3][1] - cam[-1][1])
    rp = Matrix.Rotation(ang, 4, 'X')
    cp = V((0, 0.982, 0.600))
    base.caixa(cp + rp @ V((0, -0.002, 0)), (0.214, 0.006, 0.178), "plastico", chanfro=0.003, rot=rp, seg=2)
    base.caixa(V((0, 0.952, 0.705)), (0.060, 0.026, 0.020), "plastico", chanfro=0.005, rot=rp, seg=2)
    lp = P()
    lp.caixa(V((0, 0.955, 0.694)), (0.040, 0.016, 0.006), "lente", chanfro=0.002, rot=rp)
    parte("Luz_Placa", "chassi", lp, "Luz_Lanterna")
    base.caixa(V((0, 0.928, 0.735)), (0.060, 0.010, 0.020), "lente_refl", chanfro=0.003, rot=rp, seg=2)
    setas = {}
    for s in (1, -1):
        ps = V((s * 0.150, 0.862, 0.765))
        base.tubo([V((s * 0.060, 0.858, 0.770)), V((s * 0.110, 0.860, 0.768)), ps], 0.013, "cromo", 8, up=(0, 1, 0),
                  suavizar=0, tampa=False)
        base.lathe_uv([(.009, .000), (.022, .004), (.026, .014), (.027, .024)], ps + V((0, -0.010, 0)), (0, 1, 0), 16,
                      "cromo")
        st = P()
        st.lathe_uv([(.027, .0), (.027, .010), (.024, .020), (.014, .027), (.001, .029)], ps + V((0, 0.014, 0)), (0, 1, 0),
                    16, "lente")
        parte("Seta_Tras_" + ("E" if s > 0 else "D"), "chassi", st, "Luz_Seta_" + ("E" if s > 0 else "D"))
        setas[s] = ps + V((0, 0.034, 0))
    parte("Rabeta_Base", "chassi", base)
    pl = P()
    cpl = cp + rp @ V((0, 0.004, 0))
    pl.caixa(cpl, (0.200, 0.004, 0.170), "placa", rot=rp)
    parte("Placa", "chassi", pl, "Moto_Placa", orientar=False)
    me = OBJS["Placa"].data
    uvl = me.uv_layers.new(name="UVMap")
    inv = rp.inverted()
    for pol in me.polygons:
        fr_ = pol.normal.dot(rp @ V((0, 1, 0))) > 0.5
        for li in pol.loop_indices:
            q = inv @ (me.vertices[me.loops[li].vertex_index].co - cpl)
            uvl.data[li].uv = ((0.1 - q.x) / 0.2, (q.z + 0.085) / 0.17) if fr_ else (0.0, 0.0)
    # alca da garupa cromada: acompanha o banco e fecha em U atras
    a = P()
    # fica abaixo da borda do banco (o banco estreita em baixo: superelipse de expoente 4)
    lado = [V((0.092, 0.300, 0.762)), V((0.124, 0.420, 0.775)), V((0.130, 0.600, 0.792)), V((0.124, 0.730, 0.818)),
            V((0.092, 0.805, 0.850)), V((0.040, 0.838, 0.862))]
    u = lado + [V((-q.x, q.y, q.z)) for q in reversed(lado)]
    a.tubo(u, 0.022, "alca", 10, up=(0, 0, 1), suavizar=2, tampa=True)
    for s in (1, -1):
        a.tubo([V((s * 0.082, 0.480, 0.760)), V((s * 0.127, 0.500, 0.782))], 0.016, "alca", 8, up=(0, 1, 0), suavizar=0,
               tampa=True)
        a.tubo([V((s * 0.075, 0.700, 0.790)), V((s * 0.125, 0.710, 0.812))], 0.016, "alca", 8, up=(0, 1, 0), suavizar=0,
               tampa=True)
    parte("Alca_Garupa", "chassi", a)
    return {"lanterna": cl + rot @ V((0, 0.045, 0)), "freio": cl + rot @ V((0, 0.046, 0)), "placa": cpl,
            "luz_placa": V((0, 0.955, 0.690)), "seta_E": setas[1], "seta_D": setas[-1]}


# ---------------------------------------------------------------- balanca, corrente, amortecedores
def balanca_classica():
    b = P()
    for s in (1, -1):
        est = [(V((s * 0.092, PIVO_BAL.y - 0.035, PIVO_BAL.z + 0.001)), 0.048, 0.024),
               (V((s * 0.098, PIVO_BAL.y + 0.040, PIVO_BAL.z - 0.006)), 0.050, 0.024),
               (V((s * 0.106, 0.400, 0.338)), 0.046, 0.024), (V((s * 0.106, 0.600, 0.312)), 0.040, 0.022),
               (V((s * 0.106, 0.712, 0.294)), 0.034, 0.022)]
        b.varrer(circ(16, 4.0), est, "quadro", up=(1, 0, 0), tampa_b=[(0.12, 0.85)])
        b.caixa((s * 0.106, 0.716, 0.294), (0.028, 0.016, 0.030), "aco", chanfro=0.003)
        b.cilindro(V((s * 0.106, 0.724, 0.294)), V((s * 0.106, 0.760, 0.294)), 0.008, "parafuso", 6)
        porca(b, (s * 0.120, YT, ZC), (s, 0, 0), 0.022, 0.008)
        b.caixa((s * 0.112, SHOCK_BOT.y, SHOCK_BOT.z - 0.012), (0.014, 0.034, 0.052), "quadro", chanfro=0.004)
    b.lathe_uv([(.019, -.104), (.019, .104)], PIVO_BAL, (1, 0, 0), 18, "quadro")
    b.barra(V((-0.098, 0.360, 0.343)), V((0.098, 0.360, 0.343)), 0.034, 0.030, "quadro", up=(0, 1, 0))
    b.cilindro(V((-0.124, YT, ZC)), V((0.124, YT, ZC)), 0.016, "aco", 10)
    # protetor da corrente (lado esquerdo, por cima)
    prisma(b, [(0.045, 0.426), (0.092, 0.426), (0.092, 0.384), (0.086, 0.384), (0.086, 0.420), (0.045, 0.420)],
           "plastico", 0.270, 0.620, eu=(1, 0, 0), ev=(0, 0, 1), ew=(0, 1, 0), chanfro=0.0015, seg=1)
    b.caixa((0.094, 0.320, 0.395), (0.010, 0.020, 0.030), "plastico", chanfro=0.002)
    b.caixa((0.094, 0.570, 0.372), (0.010, 0.020, 0.040), "plastico", chanfro=0.002)
    # tirante do freio traseiro (pedal -> alavanca do tambor, lado direito) e barra de reacao
    b.tubo([V((-0.112, 0.612, 0.242)), V((-0.112, 0.400, 0.262)), V((-0.112, 0.170, 0.290))], 0.008, "aco", 6,
           up=(1, 0, 0), suavizar=0, tampa=True)
    b.barra(V((-0.104, 0.660, 0.262)), V((-0.106, 0.440, 0.320)), 0.012, 0.006, "aco", up=(1, 0, 0))
    # corrente: casco convexo pinhao/coroa
    pts = []
    for (cy, cz, r) in ((0.150, 0.370, 0.037), (YT, ZC, 0.105)):
        for k in range(180):
            a = 2 * math.pi * k / 180
            pts.append((cy + r * math.cos(a), cz + r * math.sin(a)))
    pts = sorted(set(pts))

    def cruz(o, a, b_):
        return (a[0] - o[0]) * (b_[1] - o[1]) - (a[1] - o[1]) * (b_[0] - o[0])
    baixo, cima = [], []
    for q in pts:
        while len(baixo) >= 2 and cruz(baixo[-2], baixo[-1], q) <= 0:
            baixo.pop()
        baixo.append(q)
    for q in reversed(pts):
        while len(cima) >= 2 and cruz(cima[-2], cima[-1], q) <= 0:
            cima.pop()
        cima.append(q)
    casco = np.array(baixo[:-1] + cima[:-1])
    seg_ = np.linalg.norm(np.roll(casco, -1, 0) - casco, axis=1)
    s_ac = np.concatenate([[0], np.cumsum(seg_)])
    tot = s_ac[-1]
    n = 220
    ss = np.linspace(0, tot, n, endpoint=False)
    fech = np.vstack([casco, casco[:1]])
    ys = np.interp(ss, s_ac, fech[:, 0])
    zs = np.interp(ss, s_ac, fech[:, 1])
    c = P()
    laco(c, [V((X_CORR, y, z)) for y, z in zip(ys, zs)], RET4, 0.010, 0.016, (1, 0, 0), "corrente")
    INFO["corrente"] = dict(x=X_CORR, comprimento=float(tot))
    parte("Corrente", "balanca", c)
    parte("Balanca", "balanca", b)
    for s, lado in ((1, "E"), (-1, "D")):
        top = V((s * SHOCK_TOP.x, SHOCK_TOP.y, SHOCK_TOP.z))
        bot = V((s * SHOCK_BOT.x, SHOCK_BOT.y, SHOCK_BOT.z))
        u = (bot - top).normalized()
        L = (bot - top).length
        a = P()
        a.cilindro(top - V((s * 0.013, 0, 0)), top + V((s * 0.013, 0, 0)), 0.030, "borracha", 12)
        a.lathe_uv([(.012, .008), (.020, .014), (.024, .030), (.024, .085), (.031, .087), (.031, .095), (.018, .097)],
                   top, u, 18, "cromo")
        a.lathe_uv([(.0068, .095), (.0068, L * 0.66)], top, u, 10, "cromo")
        helice(top + u * 0.098, top + u * (L - 0.050), 0.0245, 9.5, 0.0080, "mola", a, lados=5, por_volta=12)
        parte("Amortecedor_" + lado, "chassi", a)
        bi = P()
        bi.lathe_uv([(.012, L * 0.58), (.020, L * 0.585), (.020, L - .030), (.012, L - .012)], top, u, 16, "amortecedor")
        bi.lathe_uv([(.020, L - .052), (.031, L - .049), (.031, L - .043), (.020, L - .041)], top, u, 18, "cromo",
                    fechar=True)
        bi.cilindro(bot - V((s * 0.013, 0, 0)), bot + V((s * 0.013, 0, 0)), 0.030, "borracha", 12)
        porca(bi, bot + V((s * 0.013, 0, 0)), (s, 0, 0), 0.018, 0.007)
        parte("Amortecedor_Inf_" + lado, "balanca", bi)


# ---------------------------------------------------------------- pedaleiras e pedais (pecas moveis separadas)
PIVO_FREIO = V((-0.100, 0.150, 0.305))
PIVO_CAMBIO = V((0.105, 0.050, 0.300))


def pedaleiras_classicas():
    p = P()
    for s in (1, -1):
        p.barra(V((s * 0.085, 0.130, 0.300)), V((s * 0.168, 0.130, 0.300)), 0.030, 0.026, "aco", up=(0, 1, 0))
        p.cilindro(V((s * 0.158, 0.115, 0.300)), V((s * 0.158, 0.145, 0.300)), 0.022, "aco", 10)
        pf = [(.001, 0.0), (.0150, 0.0)]
        for k in range(7):
            pf += [(.0175, .010 + k * .016), (.0160, .018 + k * .016)]
        pf += [(.0180, .120), (.0150, .126), (.001, .127)]
        p.lathe_uv(pf, V((s * 0.168, 0.130, 0.300)), (s, 0, 0), 14, "borracha")
        # pedaleira da garupa: dobra para cima (osso pedaleira_garupa_E/D)
        pg_ = P()
        pg_.cilindro(V((s * 0.168, 0.523, Z_PG)), V((s * 0.168, 0.547, Z_PG)), 0.020, "aco", 10)
        pg = [(.001, 0.0), (.0140, 0.0)] + [(.0160, .010 + k * .015) for k in range(6)] + [(.0150, .095), (.001, .098)]
        pg_.lathe_uv(pg, V((s * 0.170, 0.535, Z_PG - 0.006)), (s, 0, 0), 12, "borracha")
        parte("Pedaleira_Garupa_" + ("E" if s > 0 else "D"), "pedaleira_garupa_" + ("E" if s > 0 else "D"), pg_)
    p.caixa((PIVO_DESC.x - 0.004, PIVO_DESC.y, PIVO_DESC.z + 0.022), (0.020, 0.050, 0.050), "quadro", chanfro=0.006)
    parte("Pedaleiras", "chassi", p)
    pf_ = P()
    pv = PIVO_FREIO
    pf_.cilindro(pv + V((0.010, 0, 0)), pv - V((0.015, 0, 0)), 0.022, "aco", 10)
    pf_.tubo([pv - V((0.012, 0, 0)), pv + V((-0.022, -0.060, -0.022)), pv + V((-0.040, -0.130, -0.030)),
              pv + V((-0.044, -0.172, -0.024))], 0.016, "pedal", 8, up=(1, 0, 0), suavizar=1, tampa=True)
    pf_.caixa(pv + V((-0.066, -0.176, -0.022)), (0.050, 0.030, 0.012), "pedal", chanfro=0.004, seg=2)
    pf_.barra(pv + V((-0.012, 0.002, -0.005)), pv + V((-0.008, 0.012, -0.024)), 0.014, 0.008, "pedal", up=(1, 0, 0))
    parte("Pedal_Freio", "pedal_freio", pf_)
    pc_ = P()
    pv = PIVO_CAMBIO
    pc_.cilindro(pv - V((0.007, 0, 0)), pv + V((0.007, 0, 0)), 0.016, "aco", 8)
    pc_.tubo([pv + V((0.003, 0, 0)), pv + V((0.013, -0.060, -0.018)), pv + V((0.019, -0.130, -0.014))], 0.013, "pedal", 8,
             up=(1, 0, 0), suavizar=1, tampa=True)
    pc_.lathe_uv([(.001, 0.0), (.010, 0.0), (.011, .010), (.010, .040), (.001, .041)], pv + V((0.017, -0.138, -0.012)),
                 (1, 0, 0), 10, "borracha")
    parte("Pedal_Cambio", "pedal_cambio", pc_)


def descanso_classico():
    p = P()
    pv = PIVO_DESC
    perna = V((0.105, 0.255, 0.0))
    p.cilindro(pv - V((0.020, 0, 0)), pv + V((0.034, 0, 0)), 0.034, "preto", 12)
    p.tubo([pv + V((0.020, 0, 0)), pv + perna * 0.5 + V((0.006, 0, 0)), pv + perna], 0.026, "preto", 10,
           up=(0, 0, 1), suavizar=2, tampa=True)
    p.caixa(pv + perna + V((0.010, 0.012, 0)), (0.062, 0.052, 0.030), "borracha", chanfro=0.007, seg=2)
    p.tubo([pv + perna * 0.35 + V((0, 0, 0.012)), pv + perna * 0.35 + V((-0.02, 0.01, 0.035))], 0.008, "aco", 6,
           up=(1, 0, 0), suavizar=0, tampa=True)
    parte("Descanso", "descanso", p)


# ---------------------------------------------------------------- montagem
PONTOS = {}


def montar_classica():
    roda_raiada("Roda_Dianteira", YF, 0.080, "roda_dianteira", 1, 0.070)
    roda_raiada("Roda_Traseira", YT, 0.098, "roda_traseira", -1, 0.074, coroa=True)
    ang_f = math.radians(40)
    braco_f = V((0.064, YF + 0.093, ZC + 0.018))           # ponta da alavanca do freio dianteiro (atras da bengala)
    espelho_freio("Tambor_Dianteiro", AXLE_F, 1, 0.070, "suspensao_diant", braco_f, ang_f)
    espelho_freio("Tambor_Traseiro", AXLE_T, -1, 0.074, "balanca", V((-0.112, 0.615, 0.240)), math.radians(170))
    paralama_diant_classico()
    tanque_classico()
    banco_classico()
    hb = quadro_classico()
    protetor_motor()
    paralama_interno_caixa()
    tampas_laterais_classicas()
    motor()
    ponta_escape = escapamento_classico()
    garfo_classico()
    farol = farol_classico()
    painel_classico()
    maos = guidao_classico()
    # cabo do freio dianteiro: da manete direita passa atras do farol e desce por dentro da bengala esquerda ate a
    # alavanca do tambor (fica na direcao: no mergulho do garfo so a ponta de baixo desliza, escondida pela bengala)
    cf = P()
    m0 = V((-0.215, -0.300, 1.030))
    cf.tubo([m0, V((-0.150, -0.330, 0.990)), V((-0.040, -0.400, 0.930)), F(0.62, 0.064) + NF * 0.050,
             F(0.45, 0.064) + NF * 0.036, F(0.25, 0.064) + NF * 0.030, braco_f + V((0, 0.004, 0.008))], 0.008, "cabo", 6,
            up=(1, 0, 0), suavizar=2, tampa=True)
    parte("Cabo_Freio", "direcao", cf)
    tras = traseira_classica()
    balanca_classica()
    pedaleiras_classicas()
    descanso_classico()
    PONTOS.update(dict(buzina=hb, escape=ponta_escape, farol=farol, mao_E=maos["E"], mao_D=maos["D"], **tras))


def ossos_classica():
    cima = V((0, 0, 1))
    ossos = []

    def osso(nome, cab, cau, pai, deforma=True):
        ossos.append((nome, V(cab), V(cau), pai, deforma))
    osso("raiz", (0, 0, 0), (0, 0, 0.25), None)
    osso("chassi", (0, 0, 0.55), (0, 0, 0.80), "raiz")
    osso("direcao", AXLE_F + AX * 0.66, AXLE_F + AX * 0.90, "chassi")
    osso("suspensao_diant", AXLE_F, AXLE_F + AX * 0.20, "direcao")
    osso("roda_dianteira", AXLE_F, AXLE_F + cima * 0.12, "suspensao_diant")
    osso("balanca", PIVO_BAL, PIVO_BAL + cima * 0.12, "chassi")
    osso("roda_traseira", AXLE_T, AXLE_T + cima * 0.12, "balanca")
    osso("descanso", PIVO_DESC, PIVO_DESC + cima * 0.08, "chassi")
    # pecas moveis pequenas: manetes (giram no pino, eixo quase vertical), punho (gira no eixo do guidao),
    # pedais (eixo X), ponteiros (eixo normal ao mostrador), tampa do tanque (dobradica X), pedaleiras da garupa
    for lado, nome in (("E", "manete_embreagem"), ("D", "manete_freio")):
        p0 = V(INFO["manete_" + lado]) + V((0, 0.006, 0))
        osso(nome, p0, p0 + cima * 0.05, "direcao")
    c_, ev = INFO["punho"]
    osso("punho_acelerador", V(c_), V(c_) + V(ev) * 0.10, "direcao")
    osso("pedal_freio", PIVO_FREIO, PIVO_FREIO + cima * 0.05, "chassi")
    osso("pedal_cambio", PIVO_CAMBIO, PIVO_CAMBIO + cima * 0.05, "chassi")
    for tipo in ("velocimetro", "conta_giros"):
        c_, n_ = INFO["ponteiro_" + tipo]
        osso("ponteiro_" + tipo, V(c_), V(c_) + V(n_) * 0.03, "direcao")
    tp = V(INFO["tampa_pivo"])
    osso("tampa_tanque", tp, tp + cima * 0.04, "chassi")
    for s, l in ((1, "E"), (-1, "D")):
        pg = V((s * 0.168, 0.535, Z_PG))
        osso("pedaleira_garupa_" + l, pg, pg + cima * 0.04, "chassi")
    P_ = {k: tuple(v) for k, v in PONTOS.items()}
    pontos = {
        "ponto_piloto": ("chassi", (0, 0.300, 0.846)),
        "ponto_garupa": ("chassi", (0, 0.600, 0.912)),
        "ponto_mao_E": ("direcao", P_["mao_E"]), "ponto_mao_D": ("direcao", P_["mao_D"]),
        "ponto_pe_E": ("chassi", (0.235, 0.130, 0.300)), "ponto_pe_D": ("chassi", (-0.235, 0.130, 0.300)),
        "ponto_pe_garupa_E": ("chassi", (0.215, 0.535, Z_PG)), "ponto_pe_garupa_D": ("chassi", (-0.215, 0.535, Z_PG)),
        "ponto_farol": ("direcao", P_["farol"]), "ponto_farol_alto": ("direcao", tuple(V(P_["farol"]) + V((0, 0, 0.02)))),
        "ponto_seta_frente_E": ("direcao", INFO["seta_frente_E"]), "ponto_seta_frente_D": ("direcao", INFO["seta_frente_D"]),
        "ponto_seta_tras_E": ("chassi", P_["seta_E"]), "ponto_seta_tras_D": ("chassi", P_["seta_D"]),
        "ponto_lanterna": ("chassi", P_["lanterna"]), "ponto_freio": ("chassi", P_["freio"]),
        "ponto_luz_placa": ("chassi", P_["luz_placa"]), "ponto_placa": ("chassi", P_["placa"]),
        "ponto_escapamento": ("chassi", P_["escape"]),
        "ponto_tanque": ("chassi", (0, YTC, 0.985)), "ponto_buzina": ("chassi", P_["buzina"]),
        "ponto_motor": ("chassi", (0, -0.03, 0.40)),
        "ponto_bau": ("chassi", (0, 0.700, 0.930)),
        "ponto_descanso_chao": ("raiz", (PIVO_DESC.x + 0.115, PIVO_DESC.y, 0.0)),
        "ponto_contato_diant": ("raiz", (0, YF, 0.0)), "ponto_contato_tras": ("raiz", (0, YT, 0.0)),
        "ponto_camera": ("chassi", (0, 0.35, 1.60)),
    }
    for nome, (pai, pos) in pontos.items():
        osso(nome, pos, V(pos) + cima * 0.06, pai, False)
    return ossos


ossos_da_moto = ossos_classica
COR_LUZ.clear()
COR_LUZ.update({"Luz_Farol": (0.86, 0.88, 0.82), "Luz_Seta_E": (0.92, 0.48, 0.05), "Luz_Seta_D": (0.92, 0.48, 0.05),
                "Luz_Lanterna": (0.55, 0.035, 0.03), "Luz_Freio": (0.70, 0.03, 0.025)})


# ---------------------------------------------------------------- materiais: pintura (cor escolhivel) + atlas
def material_pintura(atlas, mr_img, cor):
    mat = material_pbr("Moto_Pintura", atlas, mr_img, cor)
    nt = mat.node_tree
    mix = next(n for n in nt.nodes if n.type == "MIX")
    rgb = nt.nodes.new("ShaderNodeRGB")
    rgb.name = rgb.label = "COR_PINTURA"
    rgb.outputs[0].default_value = cor
    nt.links.new(rgb.outputs[0], mix.inputs[7])
    return mat


def materiais(saidas, atlas, mr_img, img_placa):
    m_pint = material_pintura(atlas, mr_img, COR_PADRAO)
    m_moto = material_pbr("Moto_Atlas", atlas, mr_img, None)
    for nome, ob in saidas.items():
        me = ob.data
        me.materials.clear()
        if nome == "Moto":
            me.materials.append(m_pint)
            me.materials.append(m_moto)
            lay = me.attributes["peca"].data
            ids = {PID[n] for n in PINTURA}
            me.polygons.foreach_set("material_index", [0 if lay[p.index].value in ids else 1 for p in me.polygons])
        elif nome == "Moto_Placa":
            me.materials.append(material_textura("Moto_Placa", img_placa, None, 0.45))
        else:
            me.materials.append(material_luz(nome))


def ligar_cor_ao_rig(rig):
    """propriedade cor_pintura no Moto_Rig (seletor de cor no painel Object > Custom Properties) -> no COR_PINTURA"""
    rig["cor_pintura"] = list(COR_PADRAO)
    ui = rig.id_properties_ui("cor_pintura")
    ui.update(subtype='COLOR', min=0.0, max=1.0, soft_min=0.0, soft_max=1.0,
              description="cor da pintura (tanque, tampas laterais, paralama, orelhas do farol)")
    mat = bpy.data.materials["Moto_Pintura"]
    caminho = 'nodes["COR_PINTURA"].outputs[0].default_value'
    for i in range(3):
        fc = mat.node_tree.driver_add(caminho, i)
        dr = fc.driver
        dr.type = 'AVERAGE'
        v = dr.variables.new()
        v.name = "c"
        v.targets[0].id_type = 'OBJECT'
        v.targets[0].id = rig
        v.targets[0].data_path = '["cor_pintura"][%d]' % i


def uv_atlas_classica(objs):
    obs = [o for k, o in objs.items() if not SAIDA_DE[k].startswith(SEM_ATLAS)]
    for ob in obs:
        uv_completar(ob)
    ilhas = preparar_ilhas(obs)
    esc = empacotar(ilhas)
    print("atlas: %.0f px/m (pintura), %d ilhas em %d objetos" % (esc, len(ilhas), len(obs)))
    return esc


CORES_PREVIA.update({"tinta": (0.02, 0.02, 0.022), "carenagem": (0.02, 0.02, 0.022), "raio_arame": (0.8, 0.8, 0.82),
                     "sanfona": (0.02, 0.02, 0.02), "emblema": (0.9, 0.9, 0.92), "joelheira": (0.03, 0.03, 0.03),
                     "alca": (0.85, 0.87, 0.9), "farol_refl": (0.8, 0.8, 0.82), "niple": (0.6, 0.6, 0.62),
                     "aro": (0.85, 0.87, 0.9), "cubo": (0.65, 0.66, 0.68), "tambor": (0.6, 0.61, 0.63),
                     "friso": (0.85, 0.68, 0.32)})


if not globals().get("SO_FUNCOES"):
    import importlib
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    limpar()
    COL = colecao("Moto_Classica")
    montar_classica()
    suavizar(OBJS.values())
    tri = sum(len(p.vertices) - 2 for ob in OBJS.values() for p in ob.data.polygons)
    print("triangulos:", tri)
    for k, ob in OBJS.items():
        print("  %-26s %-20s %6d faces" % (k, OSSO_DE[k], len(ob.data.polygons)))
    if "--previa" in ARGS:
        previa(OBJS)
        os.makedirs(os.path.dirname(PREVIA), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=PREVIA, copy=True)
        print("previa", PREVIA)
    else:
        import moto_textura_classica as mtc
        importlib.reload(mtc)
        os.makedirs(SAIDA, exist_ok=True)
        uv_atlas_classica(OBJS)
        ATLAS_PNG = os.path.join(SAIDA, "moto_classica_atlas.png")
        MR_PNG = os.path.join(SAIDA, "moto_classica_metal_rugosidade.png")
        PLACA_PNG = os.path.join(SAIDA, "moto_classica_placa.png")
        if ("--exportar" in ARGS and "--sem-bake" not in ARGS) or not os.path.exists(ATLAS_PNG):
            R = bake_dados(OBJS, ATLAS_PX, 64)
            R["ref"] = np.zeros(R["pos"].shape, np.float32)
            npz = [a.split("=", 1)[1] for a in ARGS if a.startswith("--guardar-bake=")]
            if npz:
                np.savez_compressed(npz[0], **R)
            albedo, mrmap = mtc.pintar(R, PECAS, INFO)
            salvar_png(albedo, ATLAS_PNG, "moto_atlas_tmp")
            salvar_png(mrmap, MR_PNG, "moto_mr_tmp")
            import moto_textura as mt2
            salvar_png(mt2.placa()[::-1], PLACA_PNG, "moto_placa_tmp")
        ATLAS = carregar_img(ATLAS_PNG, "moto_classica_atlas")
        MRIMG = carregar_img(MR_PNG, "moto_classica_mr")
        MRIMG.colorspace_settings.name = 'Non-Color'
        PLACA = carregar_img(PLACA_PNG, "moto_classica_placa")
        COL_COLI = colecao("Moto_Colisao")
        COLI = colisao_v3(COL_COLI)
        COLI.hide_set(True)
        RIG, SAIDAS_OBS = montar_rig_e_saidas(COL, ATLAS, MRIMG, PLACA)
        RIG.name = "Moto_Rig"
        ligar_cor_ao_rig(RIG)
        tri = sum(len(p.vertices) - 2 for ob in SAIDAS_OBS.values() for p in ob.data.polygons)
        print("triangulos finais:", tri, "| colisao:", sum(len(p.vertices) - 2 for p in COLI.data.polygons))
        if "--exportar" in ARGS:
            exportar([RIG] + list(SAIDAS_OBS.values()), os.path.join(SAIDA, "moto_classica.glb"))
            exportar([COLI], os.path.join(SAIDA, "moto_classica_colisao.glb"))
            os.makedirs(os.path.dirname(BLEND_COPIA), exist_ok=True)
            bpy.ops.wm.save_as_mainfile(filepath=BLEND_COPIA, copy=True)
            print("copia", BLEND_COPIA)
