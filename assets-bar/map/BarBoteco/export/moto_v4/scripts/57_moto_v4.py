# 57_moto_v4.py
# Moto naked 160 cc Highland Bar Delivery v4: TODA a moto em malha propria, fechada e soldada (nada herdado da Tripo).
#  - tanque, banco, rodas e paralama dianteiro: os da v3 (55_moto_v3.py)
#  - quadro (coluna, espinha, berco, placas do pivo, chassi traseiro), motor (carter, tampas, cilindro aletado, cabecote,
#    carburador, motor de partida), escapamento (coletor + silencioso com protetor), garfo (bengalas, mesas), farol
#    retangular, painel com 2 relogios, guidao (manoplas, manetes, comandos, cilindro do freio, espelhos), balanca, corrente
#    e coroa, amortecedores com mola em helice, rabeta, lanterna, setas, suporte de placa, paralama interno, tampas
#    laterais, caixa do filtro, pedaleiras, pedal de freio, alavanca de cambio, descanso: procedurais
#  - a Tripo (moto_tripo_original.blend) serviu so de medida (vistas ortogonais com grade)
# Rodar: blender.exe -b --factory-startup -P 57_moto_v4.py -- --exportar [--sem-bake] [--guardar-bake=x.npz]
#        blender.exe -b --factory-startup -P 57_moto_v4.py -- --previa   (so geometria, cores por peca -> moto_v4_previa.blend)
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
_SO4 = globals().get("SO_FUNCOES")
SO_FUNCOES = True
exec(compile(open(SCRIPTS + "/55_moto_v3.py", encoding="utf-8").read(), "55_moto_v3.py", "exec"), globals())
SO_FUNCOES = _SO4

SAIDA = r"C:\Users\rafael\BarBoteco\export\moto_v4"
BLEND_COPIA = r"C:\Users\rafael\Desktop\BAR\2.0\veiculos\moto\moto_delivery_v4.blend"
PREVIA = r"C:\Users\rafael\Desktop\BAR\2.0\veiculos\moto\moto_v4_previa.blend"
SC = bpy.context.scene

# ---------------------------------------------------------------- cotas (metros)
YF, YT, ZC = -0.686, 0.675, 0.300
R_PNEU = 0.300
RAKE = math.radians(27.0)
AX = V((0, math.sin(RAKE), math.cos(RAKE)))          # coluna de direcao (sobe e vai para tras)
NF = V((0, math.cos(RAKE), -math.sin(RAKE)))         # perpendicular a coluna, para tras
AXLE_F = V((0, YF, ZC))
AXLE_T = V((0, YT, ZC))
X_G = 0.108                                          # meia distancia das bengalas
T_CL, T_CU = 0.46, 0.655                              # mesas inferior e superior (distancia do eixo pela coluna)
PIVO_BAL = V((0, 0.21, 0.37))
PIVO_DESC = V((0.115, 0.17, 0.30))
ROT_RAKE = Matrix.Rotation(-RAKE, 4, 'X')            # Z local -> AX, Y local -> NF
CIL_ANG = math.radians(12.0)                          # cilindro inclinado para a frente
CIL_B = V((0, -0.115, 0.465))
CIL_D = V((0, -math.sin(CIL_ANG), math.cos(CIL_ANG)))
CIL_E2 = V((0, math.cos(CIL_ANG), math.sin(CIL_ANG)))
ROT_CIL = Matrix.Rotation(CIL_ANG, 4, 'X')
X_CORR = 0.063                                        # linha da corrente (coroa da roda traseira)


def F(t, x=0.0):
    """ponto da coluna/bengala a t metros do eixo dianteiro"""
    return AXLE_F + AX * t + V((x, 0, 0))


PECAS = ["tinta", "banco", "pneu", "aro", "raio", "cubo", "disco", "cromo", "aco", "aluminio", "motor", "aleta", "quadro",
         "borracha", "plastico", "escapamento", "corrente", "farol_casco", "farol_vidro", "mostrador", "painel",
         "espelho_vidro", "espelho_casco", "mola", "amortecedor", "bagageiro", "pinca", "coroa", "tambor", "pedal",
         "manete", "ponteiro", "lente", "placa", "preto", "dourado", "ref_claro", "ref_medio", "ref_escuro", "ref_tinta",
         "ref_laranja", "carenagem", "coletor", "motor_escuro", "cabo", "parafuso", "refletor", "lente_refl"]
PID = {n: i for i, n in enumerate(PECAS)}
DENSIDADE.update({"tinta": 1.4, "carenagem": 1.3, "banco": 1.5, "aluminio": 0.9, "motor": 1.1, "aleta": 0.8,
                  "quadro": 0.7, "coletor": 0.9, "escapamento": 0.9, "cromo": 0.9, "mostrador": 6.0, "painel": 0.9,
                  "farol_casco": 1.0, "espelho_vidro": 1.0, "espelho_casco": 0.8, "mola": 0.6, "amortecedor": 0.8,
                  "corrente": 0.9, "parafuso": 0.6, "cabo": 0.4, "preto": 0.5, "plastico": 0.6, "pneu": 0.5,
                  "aro": 0.8, "raio": 1.2, "disco": 1.2, "coroa": 0.8, "motor_escuro": 0.8, "refletor": 1.0,
                  "lente_refl": 1.0, "pedal": 0.6, "manete": 0.8, "pinca": 0.8, "ponteiro": 2.0})
INFO = {}            # dados para a pintura (relogios, corrente)


# ---------------------------------------------------------------- utilitarios de forma
def arredondar(pts, r, n=3):
    """arredonda os cantos de um poligono 2D (bezier quadratica em cada canto); r escalar ou lista"""
    pts = [np.array(q, float) for q in pts]
    m = len(pts)
    out = []
    for i in range(m):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % m]
        d0, d1 = p0 - p1, p2 - p1
        l0, l1 = np.linalg.norm(d0), np.linalg.norm(d1)
        rr = r if np.isscalar(r) else r[i]
        k = min(rr, 0.45 * l0, 0.45 * l1)
        if k < 1e-5:
            out.append(p1)
            continue
        a, b = p1 + d0 / l0 * k, p1 + d1 / l1 * k
        for j in range(n + 1):
            t = j / n
            out.append((1 - t) ** 2 * a + 2 * (1 - t) * t * p1 + t * t * b)
    return out


def prisma(p, perfil, peca, w0, w1, O=(0, 0, 0), eu=(0, 1, 0), ev=(0, 0, 1), ew=(1, 0, 0), chanfro=0.004, seg=3,
           raio=0.0, nr=3, deform=None):
    """poligono 2D (u, v) no plano (eu, ev) extrudado de w0 a w1 ao longo de ew; quinas da silhueta arredondadas (raio)
    e bordas das tampas chanfradas; deform(co) -> co opcional nos vertices novos"""
    if np.isscalar(raio) and raio <= 0:
        pts = [np.array(q, float) for q in perfil]
    else:
        pts = arredondar(perfil, raio, nr)
    O, eu, ev, ew = V(O), V(eu), V(ev), V(ew)
    bm = p.bm
    antes = set(bm.verts)
    a = [bm.verts.new(O + eu * q[0] + ev * q[1] + ew * w0) for q in pts]
    b = [bm.verts.new(O + eu * q[0] + ev * q[1] + ew * w1) for q in pts]
    n = len(pts)
    fa = p.face(list(reversed(a)), peca)
    fb = p.face(b, peca)
    for k in range(n):
        p.face([a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]], peca)
    if chanfro > 0:
        es = list({e for f in (fa, fb) if f for e in f.edges})
        ret = bmesh.ops.bevel(bm, geom=es, offset=chanfro, segments=seg, affect='EDGES', profile=0.5,
                              clamp_overlap=True)
        for f in ret["faces"]:
            f[p.lay] = PID[peca]
    if deform:
        for v in bm.verts:
            if v not in antes:
                v.co = deform(v.co.copy())


def laco(p, pts, perfil, su, sv, up, peca):
    """perfil varrido ao longo de um caminho FECHADO (sem tampas)"""
    pts = [V(q) for q in pts]
    n = len(pts)
    aneis = []
    for i in range(n):
        t = (pts[(i + 1) % n] - pts[i - 1]).normalized()
        r = t.cross(V(up)).normalized()
        v = r.cross(t)
        aneis.append(p.anel([pts[i] + r * (u * su) + v * (w * sv) for u, w in perfil]))
    for i in range(n):
        p.ligar(aneis[i], aneis[(i + 1) % n], peca)


def helice(a, b, raio, voltas, fio, peca, p, lados=6, por_volta=18, ref=(1, 0, 0)):
    """mola: tubo em helice de a ate b"""
    a, b = V(a), V(b)
    ex = (b - a).normalized()
    e1 = V(ref) - ex * V(ref).dot(ex)
    e1.normalize()
    e2 = ex.cross(e1)
    n = int(voltas * por_volta) + 1
    pts = []
    for i in range(n):
        s = i / (n - 1)
        th = 2 * math.pi * voltas * s
        pts.append(a + (b - a) * s + (e1 * math.cos(th) + e2 * math.sin(th)) * raio)
    p.varrer(circ(lados), [(q, fio, fio) for q in pts], peca, up=tuple(ex))


def porca(p, c, eixo_v, d, h, peca="parafuso"):
    """porca sextavada + ponta do parafuso"""
    ex = V(eixo_v).normalized()
    p.revolucao([(d * 0.5, 0.0), (d * 0.5, h), (d * 0.36, h + 0.002), (0.0, h + 0.002)], V(c), ex, 6, peca)


def anel_lathe(p, c, eixo_v, r0, r1, a0, a1, peca, lados=24):
    """arruela/anel de secao retangular em torno de um eixo"""
    p.revolucao([(r0, a0), (r1, a0), (r1, a1), (r0, a1)], V(c), V(eixo_v), lados, peca, fechar=True)


def caixa_eixo(p, c, eixo_v, tam, peca, chanfro=0.0, seg=2, rolo=0.0):
    """caixa com o Z local alinhado ao eixo dado (tam = x, y, z locais)"""
    q = V((0, 0, 1)).rotation_difference(V(eixo_v).normalized())
    m = q.to_matrix().to_4x4() @ Matrix.Rotation(rolo, 4, 'Z')
    return p.caixa(V(c), tam, peca, chanfro=chanfro, rot=m, seg=seg)


# ---------------------------------------------------------------- quadro
def quadro():
    q = P()
    # coluna de direcao (no eixo, entre as mesas)
    q.lathe_uv([(.026, T_CL + .010), (.029, T_CL + .018), (.029, T_CU - .018), (.026, T_CU - .010)], AXLE_F, AX, 20,
               "quadro", fechar=True)
    # espinha: sai de tras da coluna, passa dentro do tunel do tanque e desce atras do motor
    esp = [F(0.60) + NF * 0.020, V((0, -0.37, 0.80)), V((0, -0.25, 0.752)), V((0, -0.08, 0.715)), V((0, 0.06, 0.690)),
           V((0, 0.125, 0.655)), V((0, 0.155, 0.580)), V((0, 0.166, 0.500)), V((0, 0.170, 0.452))]
    q.tubo(esp, 0.050, "quadro", 14, up=(1, 0, 0), suavizar=2, tampa=False)
    # tubo inferior (desce na frente do cilindro ate o suporte dianteiro do motor)
    inf = [F(0.50) + NF * 0.022, V((0, -0.375, 0.640)), V((0, -0.305, 0.545)), V((0, -0.245, 0.470)),
           V((0, -0.196, 0.418))]
    q.tubo(inf, 0.040, "quadro", 12, up=(1, 0, 0), suavizar=2, tampa=False)
    # reforco (chapa) entre espinha e tubo inferior, atras da coluna
    c0 = F(0.50) + NF * 0.02
    c1 = F(0.62) + NF * 0.02
    prisma(q, [(c0.y, c0.z), (c1.y, c1.z), (-0.355, 0.785), (-0.37, 0.66)], "quadro", -0.004, 0.004, chanfro=0.0015,
           seg=1, raio=0.01, ew=(1, 0, 0))
    # placas do pivo da balanca (estampadas)
    pl = [(0.13, 0.470), (0.20, 0.482), (0.262, 0.452), (0.270, 0.360), (0.242, 0.290), (0.160, 0.284), (0.130, 0.340)]
    for s in (1, -1):
        prisma(q, pl, "quadro", s * 0.106, s * 0.117, chanfro=0.0025, seg=2, raio=0.022)
        porca(q, (s * 0.117, PIVO_BAL.y, PIVO_BAL.z), (s, 0, 0), 0.026, 0.010)
        porca(q, (s * 0.117, 0.165, 0.312), (s, 0, 0), 0.016, 0.006)
        porca(q, (s * 0.117, 0.230, 0.440), (s, 0, 0), 0.016, 0.006)
    q.cilindro(V((-0.110, PIVO_BAL.y, PIVO_BAL.z)), V((0.110, PIVO_BAL.y, PIVO_BAL.z)), 0.016, "aco", 10)
    # travessas das placas (a espinha morre na de cima)
    q.cilindro(V((-0.108, 0.180, 0.452)), V((0.108, 0.180, 0.452)), 0.034, "quadro", 12)
    q.cilindro(V((-0.108, 0.200, 0.300)), V((0.108, 0.200, 0.300)), 0.028, "quadro", 12)
    # chassi traseiro: dois trilhos sob o banco unidos atras em U, travessa na frente
    trilho = [V((0.060, 0.105, 0.652)), V((0.075, 0.250, 0.662)), V((0.078, 0.500, 0.680)), V((0.074, 0.750, 0.736)),
              V((0.060, 0.880, 0.768)), V((0.025, 0.925, 0.778))]
    u = trilho + [V((-p_.x, p_.y, p_.z)) for p_ in reversed(trilho)]
    q.tubo(u, 0.026, "quadro", 10, up=(0, 0, 1), suavizar=2, tampa=True)
    q.cilindro(V((-0.075, 0.105, 0.652)), V((0.075, 0.105, 0.652)), 0.026, "quadro", 10)
    q.cilindro(V((-0.078, 0.480, 0.676)), V((0.078, 0.480, 0.676)), 0.022, "quadro", 10)
    for s in (1, -1):
        # escoras: placa do pivo -> trilho (suporte de cima do amortecedor)
        q.tubo([V((s * 0.110, 0.250, 0.440)), V((s * 0.102, 0.380, 0.560)), V((s * 0.082, 0.500, 0.672))], 0.026,
               "quadro", 10, up=(1, 0, 0), suavizar=1, tampa=True)
        q.caixa((s * 0.096, 0.480, 0.664), (0.044, 0.034, 0.036), "quadro", chanfro=0.006, seg=2)
        porca(q, (s * 0.140, 0.480, 0.655), (s, 0, 0), 0.020, 0.007)
        q.cilindro(V((s * 0.110, 0.480, 0.655)), V((s * 0.142, 0.480, 0.655)), 0.012, "aco", 8)
        # suportes da pedaleira da garupa (tambem seguram o silencioso do lado direito)
        q.tubo([V((s * 0.112, 0.255, 0.420)), V((s * 0.140, 0.420, 0.400)), V((s * 0.160, 0.560, 0.372))], 0.022,
               "quadro", 10, up=(1, 0, 0), suavizar=1, tampa=True)
        q.caixa((s * 0.163, 0.560, 0.372), (0.018, 0.040, 0.040), "quadro", chanfro=0.005, seg=2)
    # suportes do motor (frente: chapas no fim do tubo inferior)
    for s in (1, -1):
        prisma(q, [(-0.215, 0.440), (-0.175, 0.440), (-0.150, 0.400), (-0.170, 0.372), (-0.210, 0.392)], "quadro",
               s * 0.020, s * 0.030, chanfro=0.002, seg=1, raio=0.008)
    q.cilindro(V((-0.036, -0.180, 0.405)), V((0.036, -0.180, 0.405)), 0.012, "parafuso", 8)
    # buzina presa ao tubo inferior
    hb = V((0, -0.342, 0.600))
    q.barra(V((0, -0.325, 0.610)), hb + V((0, -0.012, -0.015)), 0.016, 0.006, "aco", up=(1, 0, 0))
    q.revolucao([(0.012, 0.0), (0.034, 0.004), (0.036, 0.016), (0.030, 0.020), (0.0, 0.022)], hb + V((0, -0.02, -0.02)),
                (0, -0.8, -0.6), 20, "preto")
    parte("Quadro", "chassi", q)
    return hb


def paralama_interno_e_caixa():
    pf = P()
    casca_arco(pf, AXLE_T, 0.338, -58, 14, lambda a: 0.076, 0.004, 16, 6, "plastico", coroa=0.012)
    parte("Paralama_Interno", "chassi", pf)
    # caixa do filtro de ar / bateria entre as tampas laterais
    cx = P()
    prisma(cx, [(0.035, 0.635), (0.400, 0.665), (0.372, 0.560), (0.272, 0.462), (0.130, 0.462), (0.060, 0.535)],
           "plastico", -0.088, 0.088, chanfro=0.010, seg=3, raio=0.03)
    parte("Caixa_Filtro", "chassi", cx)


def tampas_laterais():
    t = P()
    perfil = [(0.054, 0.640), (0.420, 0.668), (0.308, 0.528), (0.177, 0.500)]
    for s in (1, -1):
        def bojo(co, s=s):
            u = (co.y - 0.24) / 0.20
            w = (co.z - 0.585) / 0.10
            co.x += s * 0.010 * max(0.0, 1 - u * u) * max(0.0, 1 - 0.6 * w * w)
            return co
        prisma(t, perfil, "carenagem", s * 0.094, s * 0.108, chanfro=0.005, seg=3, raio=[0.03, 0.035, 0.045, 0.04],
               nr=4, deform=bojo)
        porca(t, (s * 0.110, 0.115, 0.610), (s, 0, 0), 0.012, 0.004)
    parte("Tampas_Laterais", "chassi", t)


# ---------------------------------------------------------------- motor
def motor():
    m = P()
    # carter (bloco do virabrequim) e caixa de cambio mais estreita do lado da corrente
    prisma(m, [(-0.165, 0.300), (-0.177, 0.360), (-0.162, 0.430), (-0.130, 0.468), (-0.060, 0.478), (0.060, 0.474),
               (0.060, 0.262), (-0.080, 0.258), (-0.140, 0.272)], "motor", -0.092, 0.092, chanfro=0.010, seg=3,
           raio=[0.03, 0.03, 0.03, 0.03, 0.03, 0.0, 0.0, 0.03, 0.03])
    prisma(m, [(0.000, 0.472), (0.090, 0.458), (0.150, 0.432), (0.188, 0.392), (0.192, 0.330), (0.168, 0.285),
               (0.100, 0.263), (0.000, 0.258)], "motor", -0.088, 0.045, chanfro=0.010, seg=3,
           raio=[0.0, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.0])
    # tampa da embreagem (direita) com parafusos e tampa do filtro de oleo
    cc = V((-0.092, -0.045, 0.368))
    m.lathe_uv([(.0985, -.004), (.0985, .010), (.094, .022), (.082, .030), (.050, .034), (.020, .0355), (.001, .0358)],
               cc, (-1, 0, 0), 40, "motor")
    m.lathe_uv([(.030, .033), (.032, .037), (.030, .041), (.001, .0415)], cc + V((0, 0.012, -0.010)), (-1, 0, 0), 20,
               "motor")
    for k in range(8):
        a = 2 * math.pi * k / 8 + 0.2
        porca(m, cc + V((-0.026, 0.087 * math.cos(a), 0.087 * math.sin(a))), (-1, 0, 0), 0.009, 0.004)
    m.lathe_uv([(.040, -.003), (.040, .006), (.036, .014), (.001, .016)], V((-0.088, 0.105, 0.330)), (-1, 0, 0), 24,
               "motor")
    # vareta do oleo
    m.lathe_uv([(.012, -.004), (.012, .010), (.016, .012), (.016, .024), (.010, .028), (.001, .029)],
               V((-0.090, 0.040, 0.452)), (-0.7, 0, 0.7), 8, "preto")
    # tampa do estator (esquerda) e tampa do pinhao
    cs = V((0.092, -0.075, 0.375))
    m.lathe_uv([(.088, -.004), (.088, .008), (.083, .020), (.070, .027), (.036, .030), (.001, .0305)], cs, (1, 0, 0), 40,
               "motor")
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.5
        porca(m, cs + V((0.022, 0.079 * math.cos(a), 0.079 * math.sin(a))), (1, 0, 0), 0.009, 0.004)
    prisma(m, [(0.035, 0.455), (0.120, 0.440), (0.175, 0.410), (0.185, 0.360), (0.165, 0.315), (0.100, 0.300),
               (0.040, 0.330)], "motor", 0.045, 0.098, chanfro=0.008, seg=3, raio=0.03)
    # pinhao (aparece na saida da corrente)
    m.lathe_uv([(.028, -.006), (.036, -.006), (.038, -.003), (.038, .003), (.036, .006), (.028, .006)],
               V((X_CORR, 0.150, 0.370)), (1, 0, 0), 28, "coroa", fechar=True,
               mod=lambda i, k: (1.0 if k % 2 == 0 else 0.92) if i in (2, 3) else 1.0)
    # cilindro: nucleo, aletas, cabecote, tampa de valvulas
    m.varrer(circ(16, 3.0), [(CIL_B - CIL_D * 0.01, 0.098, 0.098), (CIL_B + CIL_D * 0.092, 0.098, 0.098)], "motor_escuro",
             up=(1, 0, 0))
    for i in range(8):
        a = 0.012 + i * 0.0108
        m.caixa(CIL_B + CIL_D * a, (0.150, 0.138, 0.0045), "aleta", chanfro=0.0018, rot=ROT_CIL, seg=1)
    m.varrer(circ(16, 3.4), [(CIL_B + CIL_D * 0.090, 0.122, 0.118), (CIL_B + CIL_D * 0.140, 0.122, 0.118)], "motor",
             up=(1, 0, 0))
    for i in range(4):
        a = 0.098 + i * 0.0105
        m.caixa(CIL_B + CIL_D * a, (0.160, 0.148, 0.0045), "aleta", chanfro=0.0018, rot=ROT_CIL, seg=1)
    m.caixa(CIL_B + CIL_D * 0.150, (0.132, 0.120, 0.024), "motor", chanfro=0.008, rot=ROT_CIL, seg=3)
    m.caixa(CIL_B + CIL_D * 0.158, (0.100, 0.090, 0.016), "motor", chanfro=0.006, rot=ROT_CIL, seg=2)
    for s in (1, -1):
        porca(m, CIL_B + CIL_D * 0.166 + V((s * 0.040, 0, 0)) + CIL_E2 * 0.034, CIL_D, 0.010, 0.004)
        porca(m, CIL_B + CIL_D * 0.166 + V((s * 0.040, 0, 0)) - CIL_E2 * 0.034, CIL_D, 0.010, 0.004)
    # tampas de regulagem das valvulas (frente e tras do cabecote)
    for s in (1, -1):
        c = CIL_B + CIL_D * 0.118 + CIL_E2 * (s * 0.074)
        m.lathe_uv([(.020, -.004), (.020, .006), (.017, .010), (.001, .011)], c, CIL_E2 * s, 16, "motor")
    # vela e cachimbo (lado esquerdo do cabecote) + cabo ate a bobina sob o tanque
    vc = CIL_B + CIL_D * 0.118 + V((0.060, 0, 0))
    vd = V((0.85, 0, 0.53)).normalized()
    m.cilindro(vc, vc + vd * 0.028, 0.022, "borracha", 10)
    m.cilindro(vc + vd * 0.028, vc + vd * 0.040, 0.018, "borracha", 10)
    m.tubo([vc + vd * 0.038, vc + vd * 0.05 + V((0, 0.02, 0.01)), V((0.06, 0.030, 0.615)), V((0.045, 0.080, 0.640))],
           0.008, "cabo", 6, up=(1, 0, 0), suavizar=2, tampa=True)
    # coletor de admissao, carburador (cuba, tampa) e coifa de borracha ate a caixa do filtro
    pin = CIL_B + CIL_D * 0.112 + CIL_E2 * 0.068
    m.cilindro(pin - V((0, 0.010, 0)), pin + V((0, 0.032, -0.004)), 0.034, "motor", 12)
    cb = pin + V((0, 0.056, -0.008))
    m.caixa(cb, (0.052, 0.046, 0.050), "motor", chanfro=0.010, seg=2)
    m.lathe_uv([(.022, .000), (.024, -.006), (.024, -.026), (.018, -.032), (.001, -.033)], cb + V((0, 0, -0.022)),
               (0, 0, 1), 16, "motor")
    m.lathe_uv([(.016, .000), (.018, .010), (.012, .016), (.001, .017)], cb + V((0, 0, 0.022)), (0, 0, 1), 12, "cromo")
    m.lathe_uv([(.020, .00), (.024, .008), (.021, .016), (.024, .024), (.021, .032), (.024, .040), (.026, .050)],
               cb + V((0, 0.020, 0.004)), (0, 1, 0), 16, "borracha")
    # motor de partida (atras do cilindro, em cima do cambio)
    m.lathe_uv([(.001, -.060), (.024, -.060), (.028, -.054), (.028, .050), (.022, .056), (.001, .056)],
               V((0, 0.036, 0.495)), (1, 0, 0), 18, "motor_escuro")
    parte("Motor", "chassi", m)
    return pin


def escapamento():
    e = P()
    porto = CIL_B + CIL_D * 0.112 - CIL_E2 * 0.070 + V((-0.022, 0, 0))
    e.caixa(porto, (0.050, 0.014, 0.040), "parafuso", chanfro=0.004, rot=ROT_CIL @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    col = [porto, porto + V((-0.020, -0.030, -0.018)), V((-0.060, -0.262, 0.480)), V((-0.075, -0.252, 0.375)),
           V((-0.092, -0.218, 0.292)), V((-0.112, -0.150, 0.246)), V((-0.132, -0.050, 0.234)), V((-0.152, 0.080, 0.236)),
           V((-0.172, 0.170, 0.243)), V((-0.180, 0.215, 0.248))]
    e.tubo(col, 0.036, "coletor", 14, up=(1, 0, 0), suavizar=2, tampa=False)
    # silencioso: cone de entrada, corpo, cone de saida e ponteira
    a, b = V((-0.180, 0.205, 0.247)), V((-0.186, 0.765, 0.302))
    d = (b - a).normalized()

    def em(y):
        return a + d * ((y - a.y) / d.y)
    est = [(em(0.205), .036, .036), (em(0.235), .048, .048), (em(0.275), .078, .078), (em(0.300), .090, .090),
           (em(0.320), .093, .093), (em(0.680), .093, .093), (em(0.700), .090, .090), (em(0.735), .076, .076),
           (em(0.750), .064, .064)]
    e.varrer(circ(22), est, "escapamento", up=(1, 0, 0))
    e.lathe_uv([(.034, -.004), (.034, .012), (.030, .014), (.018, .016), (.017, .040), (.019, .042), (.001, .043)],
               em(0.744), d, 18, "cromo")
    e.lathe_uv([(.0475, -.006), (.0485, .000), (.0485, .010), (.0475, .016)], em(0.330), d, 22, "cromo", fechar=True)
    e.lathe_uv([(.0475, -.006), (.0485, .000), (.0485, .010), (.0475, .016)], em(0.665), d, 22, "cromo", fechar=True)
    # protetor de calor (casca em meia lua do lado de fora)
    lua = []
    for k in range(13):
        f = math.radians(-90 - 72 + 144 * k / 12)
        lua.append((0.0525 * math.cos(f), 0.0525 * math.sin(f)))
    for k in range(13):
        f = math.radians(-90 + 72 - 144 * k / 12)
        lua.append((0.0490 * math.cos(f), 0.0490 * math.sin(f)))
    e.varrer(lua, [(em(0.40), 1, 1), (em(0.62), 1, 1)], "cromo", up=(1, 0, 0))
    # suporte no braco da pedaleira da garupa
    e.barra(V((-0.163, 0.560, 0.360)), em(0.560) + V((0.004, 0, 0.040)), 0.030, 0.008, "quadro", up=(0, 1, 0))
    parte("Escapamento", "chassi", e)
    return em(0.744) + d * 0.043


# ---------------------------------------------------------------- frente
def garfo_e_mesas():
    d = P()     # direcao (gira com o guidao)
    s_ = P()    # suspensao (desliza na coluna)
    for s in (1, -1):
        # tubo cromado, tampa de cima
        d.lathe_uv([(.0172, .330), (.0172, T_CU + .020), (.0160, T_CU + .024)], AXLE_F + V((s * X_G, 0, 0)), AX, 18,
                   "cromo")
        d.lathe_uv([(.0160, T_CU + .022), (.0195, T_CU + .024), (.0195, T_CU + .036), (.0150, T_CU + .040),
                    (.001, T_CU + .041)], AXLE_F + V((s * X_G, 0, 0)), AX, 6, "aco")
        # perna de aluminio + guarda-po
        s_.lathe_uv([(.001, -.052), (.019, -.052), (.0235, -.044), (.0250, -.020), (.0250, .100), (.0242, .300),
                     (.0262, .312), (.0262, .332), (.0205, .340), (.0180, .345)], AXLE_F + V((s * X_G, 0, 0)), AX, 20,
                    "aluminio")
        s_.lathe_uv([(.0178, .338), (.0228, .340), (.0230, .352), (.0185, .362), (.0174, .366)],
                    AXLE_F + V((s * X_G, 0, 0)), AX, 18, "borracha")
        # mancal do eixo
        s_.cilindro(V((s * (X_G - 0.024), YF, ZC)), V((s * (X_G + 0.026), YF, ZC)), 0.036, "aluminio", 14)
        porca(s_, (s * (X_G + 0.026), YF, ZC), (s, 0, 0), 0.020, 0.008)
        # suporte do paralama (preso por dentro da perna)
        caixa_eixo(s_, F(0.300, s * 0.085), AX, (0.012, 0.040, 0.050), "aluminio", chanfro=0.003)
        porca(s_, F(0.300, s * 0.079), (-s, 0, 0), 0.009, 0.003)
        # ponteira da bengala (abaixo da mesa) - tubo dentro da mesa
    s_.cilindro(V((-X_G - 0.020, YF, ZC)), V((X_G + 0.020, YF, ZC)), 0.014, "aco", 10)
    # mesas (inferior e superior) em volta das bengalas e da coluna
    mesa = [(-0.138, -0.026), (0.138, -0.026), (0.138, 0.026), (0.050, 0.030), (0.030, 0.046), (-0.030, 0.046),
            (-0.050, 0.030), (-0.138, 0.026)]
    for t, h in ((T_CL, 0.034), (T_CU, 0.028)):
        prisma(d, mesa, "aluminio" if t == T_CU else "quadro", -h / 2, h / 2, O=F(t), eu=(1, 0, 0), ev=NF, ew=AX,
               chanfro=0.006, seg=3, raio=[0.026, 0.026, 0.026, 0.02, 0.02, 0.02, 0.02, 0.026])
    porca(d, F(T_CU + 0.014), AX, 0.030, 0.010)
    # pinça do freio a disco (lado esquerdo, atras da perna) e mangueira ate a perna
    ang = math.radians(62)
    pc = AXLE_F + V((0, 0.150 * math.sin(ang), 0.150 * math.cos(ang)))
    tg = V((0, math.cos(ang), -math.sin(ang)))
    rot = Matrix.Rotation(-ang, 4, 'X')
    s_.caixa(pc + V((0.066, 0, 0)), (0.040, 0.078, 0.046), "pinca", chanfro=0.010, rot=rot, seg=2)
    s_.caixa(pc + V((0.050, 0, 0)) + V((0, math.sin(ang), math.cos(ang))) * 0.012, (0.016, 0.070, 0.030), "pinca",
             chanfro=0.006, rot=rot, seg=2)
    s_.barra(pc + V((0.080, 0, 0)) - tg * 0.020, F(0.220, X_G - 0.015), 0.020, 0.012, "pinca", up=(1, 0, 0))
    s_.barra(pc + V((0.080, 0, 0)) + tg * 0.025, F(0.090, X_G - 0.015), 0.020, 0.012, "pinca", up=(1, 0, 0))
    topo_pinca = pc + V((0.072, 0, 0)) - tg * 0.035 + V((0, math.sin(ang), math.cos(ang))) * 0.02
    s_.tubo([topo_pinca, topo_pinca + V((0.020, -0.010, 0.040)), F(0.300, X_G + 0.032), F(0.345, X_G + 0.030)], 0.009,
            "cabo", 8, up=(1, 0, 0), suavizar=2, tampa=True)
    parte("Garfo_Mesas", "direcao", d)
    parte("Garfo_Pernas", "suspensao_diant", s_)
    return F(0.345, X_G + 0.030)


def farol_painel_setas(fim_mangueira):
    h = P()
    yb, yf_, zc = -0.452, -0.546, 0.832
    est = [(V((0, yb, zc + 0.006)), 0.150, 0.104), (V((0, -0.470, zc + 0.003)), 0.178, 0.126),
           (V((0, -0.500, zc)), 0.196, 0.142), (V((0, -0.530, zc)), 0.204, 0.150), (V((0, yf_, zc)), 0.206, 0.152)]
    h.varrer(circ(28, 5.0), est, "farol_casco", up=(0, 0, 1), tampa_a=[(0.06, 0.9)])
    # aro cromado em volta da lente
    prisma(h, [(-0.100, -0.073), (0.100, -0.073), (0.100, 0.073), (-0.100, 0.073)], "cromo", -0.004, 0.003,
           O=(0, yf_ - 0.002, zc), eu=(1, 0, 0), ev=(0, 0, 1), ew=(0, -1, 0), chanfro=0.002, seg=2, raio=0.018)
    # orelhas (abracadeiras nas bengalas) + hastes das setas
    for s in (1, -1):
        anel_lathe(h, F(0.585, s * X_G), AX, 0.0172, 0.0235, -0.018, 0.018, "preto", 18)
        h.barra(F(0.585, s * (X_G - 0.012)) + V((0, -0.010, 0)), V((s * 0.090, -0.478, zc + 0.005)), 0.016, 0.040,
                "preto", up=(1, 0, 0))
        porca(h, (s * 0.100, -0.476, zc + 0.005), (s, 0, 0), 0.014, 0.005)
        h.tubo([F(0.585, s * (X_G + 0.020)), V((s * 0.160, -0.440, 0.838)), V((s * 0.175, -0.445, 0.838))], 0.014,
               "preto", 8, up=(0, 0, 1), suavizar=1, tampa=False)
        h.lathe_uv([(.012, .000), (.016, .004), (.020, .014), (.020, .018)], V((s * 0.172, -0.445, 0.838)), (s, 0, 0), 12,
                   "preto")
        lz = P()
        lz.caixa(V((s * 0.215, -0.447, 0.838)), (0.058, 0.048, 0.040), "lente", chanfro=0.014, seg=3)
        parte("Seta_Frente_" + ("E" if s > 0 else "D"), "direcao", lz, "Luz_Seta_" + ("E" if s > 0 else "D"))
    lf = P()
    lf.caixa(V((0, yf_ - 0.005, zc)), (0.186, 0.010, 0.134), "lente", chanfro=0.004, seg=2)
    lf.caixa(V((0, yf_ - 0.0095, zc)), (0.150, 0.004, 0.098), "lente", chanfro=0.0015, seg=1)
    parte("Farol_Lente", "direcao", lf, "Luz_Farol")
    # painel: dois relogios inclinados para o piloto, suporte na mesa superior
    pn = P()
    nrm = V((0, 0.70, 0.714)).normalized()
    e1 = V((1, 0, 0))
    e2 = nrm.cross(e1)
    INFO["relogios"] = []
    for s, tipo in ((1, "velocimetro"), (-1, "conta_giros")):
        c = V((s * 0.052, -0.432, 0.952))
        pn.lathe_uv([(.001, -.056), (.030, -.056), (.043, -.046), (.0485, -.024), (.0485, -.002), (.0455, .003),
                     (.0425, .001)], c, nrm, 28, "painel", ref=(1, 0, 0))
        pn.revolucao([(.0425, .0005), (0.0, .0005)], c, nrm, 28, "mostrador", ref=(1, 0, 0))
        pn.lathe_uv([(.0425, .000), (.0482, .004), (.0482, .008), (.0425, .007)], c, nrm, 28, "cromo", ref=(1, 0, 0),
                    fechar=True)
        # ponteiro em repouso no zero (7 horas)
        dz = e1 * 0.7071 + e2 * 0.7071          # e1 = esquerda e e2 = baixo para quem olha: zero da escala (7h30)
        base = c + nrm * 0.0035
        pn.varrer(RET4, [(base - dz * 0.006, 0.0025, 0.0015), (base + dz * 0.034, 0.0015, 0.0012)], "ponteiro", up=tuple(nrm))
        pn.revolucao([(.0045, .003), (.0045, .0055), (0.0, .0060)], c, nrm, 10, "preto", ref=(1, 0, 0))
        INFO["relogios"].append((tuple(c), tuple(nrm), tuple(e1), tuple(e2), tipo))
    pn.caixa(V((0, -0.428, 0.935)), (0.030, 0.040, 0.050), "painel", chanfro=0.008, rot=Matrix.Rotation(-0.8, 4, 'X'))
    pn.barra(V((0, -0.420, 0.930)), F(T_CU, 0) + NF * -0.020 + AX * 0.005, 0.030, 0.008, "aco", up=(1, 0, 0))
    # luzes-espia entre os relogios
    pn.caixa(V((0, -0.447, 0.968)), (0.022, 0.010, 0.018), "preto", chanfro=0.003, rot=Matrix.Rotation(-0.8, 4, 'X'))
    parte("Painel", "direcao", pn)
    parte("Farol_Casco", "direcao", h)
    # mangueira do freio: do cilindro mestre (direita) por tras do farol ate a perna esquerda
    mg = P()
    mg.tubo([V((-0.200, -0.330, 0.985)), V((-0.175, -0.372, 0.955)), V((-0.128, -0.405, 0.905)),
             V((-0.082, -0.432, 0.850)), V((-0.050, -0.440, 0.800))],
            0.009, "cabo", 8, up=(1, 0, 0), suavizar=2, tampa=True)
    mg.tubo([V((0.040, -0.470, 0.760)), V((0.100, -0.500, 0.700)), V((0.140, -0.520, 0.640)), fim_mangueira],
            0.009, "cabo", 8, up=(1, 0, 0), suavizar=2, tampa=True)
    # cabos da embreagem e do acelerador fazem a curva na frente e somem atras do farol
    for x0, x1 in ((0.222, 0.070), (-0.252, -0.060), (-0.262, -0.075)):
        sg = 1 if x0 > 0 else -1
        mg.tubo([V((x0, -0.335, 0.995)), V((x0 - sg * 0.02, -0.392, 0.955)), V((x0 - sg * 0.07, -0.425, 0.890)),
                 V((x1, -0.440, 0.815))], 0.008, "cabo", 6, up=(1, 0, 0), suavizar=2, tampa=True)
    parte("Cabos_Frente", "direcao", mg)
    return V((0, yf_ - 0.010, zc))


def guidao():
    g = P()
    meia = [V((0.000, -0.360, 0.947)), V((0.060, -0.360, 0.948)), V((0.130, -0.350, 0.966)), V((0.190, -0.322, 0.990)),
            V((0.245, -0.301, 1.000)), V((0.388, -0.287, 1.006))]
    caminho = [V((-q.x, q.y, q.z)) for q in reversed(meia)] + meia[1:]
    g.tubo(caminho, 0.0222, "cromo", 14, up=(0, 0, 1), suavizar=2, tampa=True)
    # abracadeira do guidao sobre a mesa (2 torres)
    for s in (1, -1):
        g.lathe_uv([(.014, .000), (.016, .004), (.016, .030), (.001, .031)], F(T_CU + 0.014, s * 0.034), AX, 12, "aco")
        caixa_eixo(g, V((s * 0.034, -0.360, 0.947)), (1, 0, 0), (0.034, 0.036, 0.032), "aluminio", chanfro=0.007)
    ext = (meia[-1] - meia[-2]).normalized()
    maos = {}
    for s, lado in ((1, "E"), (-1, "D")):
        def em(x):
            q0, q1 = meia[-2], meia[-1]
            t = (x - q0.x) / (q1.x - q0.x)
            r = q0 + (q1 - q0) * t
            return V((s * r.x, r.y, r.z))
        ev = V((s * ext.x, ext.y, ext.z))
        # manopla com frisos
        pf = [(.0115, -.004), (.0175, -.002)]
        for k in range(10):
            pf += [(.0175, .006 + k * .0115), (.0162, .0105 + k * .0115)]
        pf += [(.0175, .121), (.0205, .123), (.0205, .131), (.0150, .134), (.001, .135)]
        g.lathe_uv(pf, em(0.257), ev, 12, "borracha")
        maos[lado] = em(0.257) + ev * 0.068
        # comando de luz/seta (caixinha preta) e acelerador/cilindro mestre
        caixa_eixo(g, em(0.232), ev, (0.042, 0.048, 0.034), "plastico", chanfro=0.009, rolo=0.0)
        g.caixa(em(0.232) + V((0, 0.020, 0.006)), (0.012, 0.010, 0.010), "preto", chanfro=0.002)
        if s > 0:   # embreagem
            caixa_eixo(g, em(0.206), ev, (0.030, 0.030, 0.026), "manete", chanfro=0.006)
        else:       # cilindro mestre + reservatorio
            caixa_eixo(g, em(0.206), ev, (0.034, 0.034, 0.030), "manete", chanfro=0.006)
            g.caixa(em(0.206) + V((0, 0.004, 0.030)), (0.034, 0.028, 0.024), "plastico", chanfro=0.005, seg=2)
            g.caixa(em(0.206) + V((0, 0.004, 0.043)), (0.030, 0.024, 0.004), "preto", chanfro=0.0015)
        # manete
        p0 = em(0.214) + V((0, -0.022, 0.004))
        g.tubo([p0, p0 + V((s * 0.040, -0.030, 0.004)), p0 + V((s * 0.110, -0.026, 0.008)),
                p0 + V((s * 0.160, -0.010, 0.010))], 0.012, "manete", 8, up=(0, 0, 1), suavizar=1, tampa=True)
        g.cilindro(p0 + V((0, 0.006, -0.010)), p0 + V((0, 0.006, 0.012)), 0.012, "parafuso", 8)
        # retrovisor: haste + cabeca + espelho
        b0 = em(0.214) + V((0, 0.012, 0.022))
        b1 = b0 + V((s * 0.030, 0.006, 0.090))
        b2 = b1 + V((s * 0.060, 0.004, 0.034))
        g.tubo([b0, b1, b2], 0.011, "preto", 8, up=(0, 1, 0), suavizar=1, tampa=True)
        rot = Matrix.Rotation(math.radians(s * -10), 4, 'Z') @ Matrix.Rotation(math.radians(-8), 4, 'X')
        cab = b2 + V((s * 0.052, 0.004, 0.018))
        g.caixa(cab, (0.128, 0.026, 0.074), "espelho_casco", chanfro=0.012, rot=rot, seg=3)
        g.caixa(cab + rot @ V((0, 0.0125, 0)), (0.112, 0.004, 0.058), "espelho_vidro", chanfro=0.006, rot=rot, seg=2)
    parte("Guidao", "direcao", g)
    return maos


# ---------------------------------------------------------------- traseira
RABETA = [(0.440, .708, .655, .080, 2.6, 2.4), (0.480, .728, .662, .104, 2.6, 2.4), (0.550, .762, .675, .124, 2.8, 2.4),
          (0.650, .797, .695, .138, 2.8, 2.4), (0.750, .828, .719, .146, 2.8, 2.4), (0.850, .866, .746, .148, 2.8, 2.4),
          (0.905, .884, .764, .142, 2.8, 2.4)]
LANTERNA = [(0.895, .881, .761, .143, 2.8, 2.4), (0.925, .891, .779, .134, 2.8, 2.4), (0.950, .897, .795, .121, 2.8, 2.4),
            (0.968, .900, .808, .104, 2.8, 2.4)]


def rabeta_lanterna_placa():
    r = P()
    an = aneis_de_tabela(interpolar(_tab(RABETA), 28), lados=36, passes=2)
    malha_de_aneis(r, an, "carenagem", ponta_a=((0.05, 0.86), (0.10, 0.62), (0.14, 0.30)), ponta_b=((0.02, 0.9),))
    parte("Rabeta", "chassi", r)
    # lanterna: o ultimo trecho da rabeta e a propria lente (continua a forma), luz de freio no centro da ponta
    ln = P()
    an_l = aneis_de_tabela(interpolar(_tab(LANTERNA), 8), lados=36, passes=1)
    malha_de_aneis(ln, an_l, "lente", ponta_a=None, ponta_b=((0.05, 0.90), (0.10, 0.70), (0.15, 0.40)))
    parte("Lanterna_Lente", "chassi", ln, "Luz_Lanterna")
    rot = Matrix.Rotation(math.radians(24), 4, 'X')
    cl = V((0, 0.979, 0.852))
    fr = P()
    fr.caixa(cl, (0.074, 0.010, 0.030), "lente", chanfro=0.004, rot=rot, seg=2)
    parte("Freio_Lente", "chassi", fr, "Luz_Freio")
    base = P()
    # suporte da placa / para-lama traseiro (plastico preto): bandeja sob a rabeta + aba inclinada
    cam = [(0.800, 0.783), (0.880, 0.772), (0.935, 0.735), (0.968, 0.668), (0.992, 0.585), (1.006, 0.520)]
    off = []
    for i, (y, z) in enumerate(cam):
        a = cam[max(i - 1, 0)]
        b = cam[min(i + 1, len(cam) - 1)]
        t = np.array([b[0] - a[0], b[1] - a[1]])
        t /= np.linalg.norm(t)
        off.append((y + t[1] * 0.006, z - t[0] * 0.006))
    perfil = cam + list(reversed(off))
    prisma(base, perfil, "plastico", -0.058, 0.058, chanfro=0.003, seg=2)
    # placa de fundo da placa (mais larga) e luz da placa
    ang = math.atan2(cam[-1][0] - cam[-3][0], cam[-3][1] - cam[-1][1])
    rp = Matrix.Rotation(ang, 4, 'X')
    cp = V((0, 0.990, 0.600))
    base.caixa(cp + rp @ V((0, -0.002, 0)), (0.214, 0.006, 0.178), "plastico", chanfro=0.003, rot=rp, seg=2)
    base.caixa(V((0, 0.958, 0.703)), (0.060, 0.026, 0.020), "plastico", chanfro=0.005, rot=rp, seg=2)
    lp = P()
    lp.caixa(V((0, 0.960, 0.692)), (0.040, 0.016, 0.006), "lente", chanfro=0.002, rot=rp)
    parte("Luz_Placa", "chassi", lp, "Luz_Lanterna")
    # olho de gato (refletor vermelho) sob a lanterna
    base.caixa(V((0, 0.940, 0.746)), (0.060, 0.010, 0.020), "lente_refl", chanfro=0.003, rot=rp, seg=2)
    # setas traseiras
    for s in (1, -1):
        base.tubo([V((s * 0.050, 0.880, 0.748)), V((s * 0.110, 0.882, 0.746)), V((s * 0.150, 0.883, 0.745))], 0.014,
                  "preto", 8, up=(0, 1, 0), suavizar=0, tampa=False)
        base.lathe_uv([(.012, .000), (.016, .004), (.020, .014), (.020, .018)], V((s * 0.148, 0.883, 0.745)), (s, 0, 0),
                      12, "preto")
        st = P()
        st.caixa(V((s * 0.190, 0.883, 0.745)), (0.058, 0.046, 0.038), "lente", chanfro=0.013, seg=3)
        parte("Seta_Tras_" + ("E" if s > 0 else "D"), "chassi", st, "Luz_Seta_" + ("E" if s > 0 else "D"))
    parte("Rabeta_Base", "chassi", base)
    # placa Mercosul de moto 20 x 17 cm (objeto proprio)
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
    return {"lanterna": V((0, 0.985, 0.855)), "freio": cl + rot @ V((0, 0.012, 0)), "placa": cpl,
            "luz_placa": V((0, 0.960, 0.690)), "seta_E": V((0.190, 0.883, 0.745)), "seta_D": V((-0.190, 0.883, 0.745))}


def balanca_corrente_amortecedores():
    b = P()
    for s in (1, -1):
        est = [(V((s * 0.092, 0.200, 0.371)), 0.050, 0.024), (V((s * 0.096, 0.270, 0.364)), 0.052, 0.024),
               (V((s * 0.105, 0.360, 0.348)), 0.048, 0.024), (V((s * 0.105, 0.600, 0.312)), 0.042, 0.022),
               (V((s * 0.105, 0.712, 0.294)), 0.036, 0.022)]
        b.varrer(circ(16, 4.0), est, "aluminio", up=(1, 0, 0), tampa_b=[(0.12, 0.85)])
        # esticador da corrente + porca do eixo
        b.caixa((s * 0.105, 0.716, 0.294), (0.028, 0.016, 0.030), "aco", chanfro=0.003)
        b.cilindro(V((s * 0.105, 0.724, 0.294)), V((s * 0.105, 0.760, 0.294)), 0.008, "parafuso", 6)
        porca(b, (s * 0.118, YT, ZC), (s, 0, 0), 0.022, 0.008)
        # orelha do amortecedor
        b.caixa((s * 0.112, 0.610, 0.330), (0.014, 0.034, 0.052), "aluminio", chanfro=0.004)
    b.lathe_uv([(.019, -.104), (.019, .104)], PIVO_BAL, (1, 0, 0), 18, "aluminio")
    b.barra(V((-0.096, 0.335, 0.354)), V((0.096, 0.335, 0.354)), 0.034, 0.030, "aluminio", up=(0, 1, 0))
    b.cilindro(V((-0.122, YT, ZC)), V((0.122, YT, ZC)), 0.016, "aco", 10)
    # protetor da corrente (em cima da corrente, lado esquerdo)
    prisma(b, [(0.045, 0.426), (0.090, 0.426), (0.090, 0.386), (0.085, 0.386), (0.085, 0.420), (0.045, 0.420)],
           "plastico", 0.250, 0.610, eu=(1, 0, 0), ev=(0, 0, 1), ew=(0, 1, 0), chanfro=0.0015, seg=1)
    b.caixa((0.092, 0.300, 0.400), (0.010, 0.020, 0.030), "plastico", chanfro=0.002)
    b.caixa((0.092, 0.560, 0.380), (0.010, 0.020, 0.040), "plastico", chanfro=0.002)
    # freio traseiro (tambor, lado direito): espelho, alavanca, tirante e barra de reacao
    b.lathe_uv([(.020, .000), (.104, .000), (.110, .004), (.110, .010), (.020, .012)], AXLE_T + V((-0.093, 0, 0)),
               (-1, 0, 0), 40, "tambor", fechar=True)
    b.barra(V((-0.103, 0.660, 0.360)), V((-0.103, 0.610, 0.222)), 0.020, 0.008, "aco", up=(1, 0, 0))
    b.tubo([V((-0.106, 0.612, 0.226)), V((-0.106, 0.400, 0.252)), V((-0.106, 0.150, 0.284))], 0.008, "aco", 6,
           up=(1, 0, 0), suavizar=0, tampa=True)
    b.barra(V((-0.102, 0.680, 0.250)), V((-0.104, 0.440, 0.318)), 0.012, 0.006, "aco", up=(1, 0, 0))
    # corrente: casco convexo do pinhao e da coroa
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
    # amortecedores: olhal, corpo de cima, mola em helice, haste (chassi) / corpo de baixo, olhal (balanca)
    for s, lado in ((1, "E"), (-1, "D")):
        top = V((s * 0.125, 0.480, 0.655))
        bot = V((s * 0.125, 0.610, 0.345))
        u = (bot - top).normalized()
        L = (bot - top).length
        a = P()
        a.cilindro(top - V((s * 0.013, 0, 0)), top + V((s * 0.013, 0, 0)), 0.030, "borracha", 12)
        a.lathe_uv([(.012, .008), (.020, .014), (.022, .030), (.022, .070), (.030, .072), (.030, .080), (.018, .082)],
                   top, u, 18, "amortecedor")
        a.lathe_uv([(.0068, .080), (.0068, .230)], top, u, 10, "cromo")
        helice(top + u * 0.084, top + u * 0.268, 0.0235, 8.5, 0.0078, "mola", a, lados=6, por_volta=16)
        parte("Amortecedor_" + lado, "chassi", a)
        bi = P()
        bi.lathe_uv([(.012, .200), (.019, .204), (.019, L - .030), (.012, L - .012)], top, u, 16, "amortecedor")
        bi.lathe_uv([(.019, .262), (.030, .265), (.030, .272), (.019, .274)], top, u, 18, "amortecedor", fechar=True)
        bi.cilindro(bot - V((s * 0.013, 0, 0)), bot + V((s * 0.013, 0, 0)), 0.030, "borracha", 12)
        porca(bi, bot + V((s * 0.013, 0, 0)), (s, 0, 0), 0.018, 0.007)
        parte("Amortecedor_Inf_" + lado, "balanca", bi)


def pedaleiras_pedais():
    p = P()
    for s in (1, -1):
        # pedaleira do piloto: suporte no carter, articulacao e borracha com frisos
        p.barra(V((s * 0.085, 0.115, 0.300)), V((s * 0.168, 0.115, 0.300)), 0.030, 0.026, "aco", up=(0, 1, 0))
        p.cilindro(V((s * 0.158, 0.100, 0.300)), V((s * 0.158, 0.130, 0.300)), 0.022, "aco", 10)
        pf = [(.001, 0.0), (.0150, 0.0)]
        for k in range(7):
            pf += [(.0175, .010 + k * .016), (.0160, .018 + k * .016)]
        pf += [(.0180, .120), (.0150, .126), (.001, .127)]
        p.lathe_uv(pf, V((s * 0.168, 0.115, 0.300)), (s, 0, 0), 14, "borracha")
        # pedaleira da garupa
        p.cilindro(V((s * 0.170, 0.548, 0.372)), V((s * 0.170, 0.572, 0.372)), 0.020, "aco", 10)
        pg = [(.001, 0.0), (.0140, 0.0)] + [(.0160, .010 + k * .015) for k in range(6)] + [(.0150, .095), (.001, .098)]
        p.lathe_uv(pg, V((s * 0.172, 0.560, 0.366)), (s, 0, 0), 12, "borracha")
    # pedal do freio (direita)
    p.cilindro(V((-0.090, 0.140, 0.305)), V((-0.115, 0.140, 0.305)), 0.022, "aco", 10)
    p.tubo([V((-0.112, 0.140, 0.305)), V((-0.120, 0.080, 0.296)), V((-0.126, 0.010, 0.292)), V((-0.130, -0.030, 0.300))],
           0.016, "pedal", 8, up=(1, 0, 0), suavizar=1, tampa=True)
    p.caixa((-0.152, -0.034, 0.302), (0.050, 0.030, 0.012), "pedal", chanfro=0.004, seg=2)
    p.barra(V((-0.112, 0.142, 0.300)), V((-0.108, 0.150, 0.282)), 0.014, 0.008, "pedal", up=(1, 0, 0))
    # alavanca do cambio (esquerda)
    p.cilindro(V((0.098, 0.050, 0.300)), V((0.112, 0.050, 0.300)), 0.016, "aco", 8)
    p.tubo([V((0.108, 0.050, 0.300)), V((0.118, -0.010, 0.282)), V((0.124, -0.080, 0.286))], 0.013, "pedal", 8,
           up=(1, 0, 0), suavizar=1, tampa=True)
    p.lathe_uv([(.001, 0.0), (.010, 0.0), (.011, .010), (.010, .040), (.001, .041)], V((0.122, -0.088, 0.288)), (1, 0, 0),
               10, "borracha")
    # suporte do descanso (na placa do pivo esquerda)
    p.caixa((PIVO_DESC.x - 0.004, PIVO_DESC.y, PIVO_DESC.z + 0.020), (0.020, 0.050, 0.050), "quadro", chanfro=0.006)
    parte("Pedaleiras", "chassi", p)


def paralama_diant_v4():
    p = P()
    casca_arco(p, AXLE_F, 0.326, -34, 84, lambda a: 0.080 + 0.010 * (abs(a - 25) / 60) ** 2, 0.010, 30, 12, "tinta",
               coroa=0.026)
    parte("Paralama_Diant", "suspensao_diant", p)


def descanso_v4():
    """descanso lateral: recolhido quase paralelo a moto (para tras); o jogo gira -90 graus em X para abrir"""
    p = P()
    pv = PIVO_DESC
    perna = V((0.112, 0.270, 0.0))
    p.cilindro(pv - V((0.020, 0, 0)), pv + V((0.034, 0, 0)), 0.034, "preto", 12)
    p.tubo([pv + V((0.020, 0, 0)), pv + perna * 0.5 + V((0.006, 0, 0)), pv + perna], 0.026, "preto", 10,
           up=(0, 0, 1), suavizar=2, tampa=True)
    p.caixa(pv + perna + V((0.010, 0.012, 0)), (0.062, 0.052, 0.030), "borracha", chanfro=0.007, seg=2)
    p.tubo([pv + perna * 0.35 + V((0, 0, 0.012)), pv + perna * 0.35 + V((-0.02, 0.01, 0.035))], 0.008, "aco", 6,
           up=(1, 0, 0), suavizar=0, tampa=True)
    parte("Descanso", "descanso", p)


def montar_v4():
    roda_v3("Roda_Dianteira", YF, 0.100, "roda_dianteira", disco=1)
    roda_v3("Roda_Traseira", YT, 0.130, "roda_traseira", tambor=-1, coroa=1, rw=0.044)
    paralama_diant_v4()
    tanque()
    banco()
    buz = quadro()
    paralama_interno_e_caixa()
    tampas_laterais()
    motor()
    ponta_escape = escapamento()
    fim_mg = garfo_e_mesas()
    farol = farol_painel_setas(fim_mg)
    maos = guidao()
    tras = rabeta_lanterna_placa()
    balanca_corrente_amortecedores()
    pedaleiras_pedais()
    descanso_v4()
    PONTOS.update(dict(buzina=buz, escape=ponta_escape, farol=farol, mao_E=maos["E"], mao_D=maos["D"], **tras))


PONTOS = {}


def ossos_v4():
    cima = V((0, 0, 1))
    ossos = []

    def osso(nome, cab, cau, pai, deforma=True):
        ossos.append((nome, V(cab), V(cau), pai, deforma))
    osso("raiz", (0, 0, 0), (0, 0, 0.25), None)
    osso("chassi", (0, 0, 0.55), (0, 0, 0.80), "raiz")
    osso("direcao", AXLE_F + AX * 0.60, AXLE_F + AX * 0.85, "chassi")
    osso("suspensao_diant", AXLE_F, AXLE_F + AX * 0.20, "direcao")
    osso("roda_dianteira", AXLE_F, AXLE_F + V((0, 0, 0.12)), "suspensao_diant")
    osso("balanca", PIVO_BAL, PIVO_BAL + V((0, 0, 0.12)), "chassi")
    osso("roda_traseira", AXLE_T, AXLE_T + V((0, 0, 0.12)), "balanca")
    osso("descanso", PIVO_DESC, PIVO_DESC + V((0, 0, 0.08)), "chassi")
    P_ = {k: tuple(v) for k, v in PONTOS.items()}
    pontos = {
        "ponto_piloto": ("chassi", (0, 0.300, 0.803)),
        "ponto_garupa": ("chassi", (0, 0.640, 0.868)),
        "ponto_mao_E": ("direcao", P_["mao_E"]), "ponto_mao_D": ("direcao", P_["mao_D"]),
        "ponto_pe_E": ("chassi", (0.235, 0.115, 0.300)), "ponto_pe_D": ("chassi", (-0.235, 0.115, 0.300)),
        "ponto_pe_garupa_E": ("chassi", (0.215, 0.560, 0.366)), "ponto_pe_garupa_D": ("chassi", (-0.215, 0.560, 0.366)),
        "ponto_farol": ("direcao", P_["farol"]), "ponto_farol_alto": ("direcao", tuple(V(P_["farol"]) + V((0, 0, 0.02)))),
        "ponto_seta_frente_E": ("direcao", (0.215, -0.447, 0.838)),
        "ponto_seta_frente_D": ("direcao", (-0.215, -0.447, 0.838)),
        "ponto_seta_tras_E": ("chassi", P_["seta_E"]), "ponto_seta_tras_D": ("chassi", P_["seta_D"]),
        "ponto_lanterna": ("chassi", P_["lanterna"]), "ponto_freio": ("chassi", P_["freio"]),
        "ponto_luz_placa": ("chassi", P_["luz_placa"]), "ponto_placa": ("chassi", P_["placa"]),
        "ponto_escapamento": ("chassi", P_["escape"]),
        "ponto_tanque": ("chassi", (0, -0.095, 0.895)), "ponto_buzina": ("chassi", P_["buzina"]),
        "ponto_motor": ("chassi", (0, -0.03, 0.40)),
        "ponto_bau": ("chassi", (0, 0.700, 0.885)),
        "ponto_descanso_chao": ("raiz", (PIVO_DESC.x + 0.122, PIVO_DESC.y, 0.0)),
        "ponto_contato_diant": ("raiz", (0, YF, 0.0)), "ponto_contato_tras": ("raiz", (0, YT, 0.0)),
        "ponto_camera": ("chassi", (0, 0.35, 1.55)),
    }
    for nome, (pai, pos) in pontos.items():
        osso(nome, pos, V(pos) + cima * 0.06, pai, False)
    return ossos


ossos_da_moto = ossos_v4          # montar_rig_e_saidas (55) chama ossos_da_moto()

COR_LUZ.clear()
COR_LUZ.update({"Luz_Farol": (0.86, 0.88, 0.82), "Luz_Seta_E": (0.90, 0.50, 0.06), "Luz_Seta_D": (0.90, 0.50, 0.06),
                "Luz_Lanterna": (0.60, 0.04, 0.03), "Luz_Freio": (0.72, 0.03, 0.025)})


# ---------------------------------------------------------------- UV: completa as faces sem UV (pecas mistas)
def uv_completar(ob):
    me = ob.data
    if not me.uv_layers:
        smart_uv(ob)
        return
    uv = me.uv_layers.active.data
    ruins = set()
    for p in me.polygons:
        q = [uv[l].uv for l in p.loop_indices]
        a = sum(q[i - 1].x * q[i].y - q[i].x * q[i - 1].y for i in range(len(q)))
        if abs(a) < 1e-12:
            ruins.add(p.index)
    if not ruins:
        return
    if len(ruins) == len(me.polygons):
        smart_uv(ob)
        return
    selecionar_so([ob])
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(me)
    bm.faces.ensure_lookup_table()
    for f in bm.faces:
        f.select_set(False)
    for f in bm.faces:
        if f.index in ruins:
            f.select_set(True)
    bmesh.update_edit_mesh(me)
    bpy.ops.uv.smart_project(angle_limit=math.radians(58), island_margin=0.0, area_weight=0.0, correct_aspect=True,
                             scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')


def uv_atlas_v4(objs):
    obs = [o for k, o in objs.items() if not SAIDA_DE[k].startswith(SEM_ATLAS)]
    for ob in obs:
        uv_completar(ob)
    ilhas = preparar_ilhas(obs)
    esc = empacotar(ilhas)
    print("atlas: %.0f px/m (pintura), %d ilhas em %d objetos" % (esc, len(ilhas), len(obs)))
    return esc


# ---------------------------------------------------------------- previa: cor lisa por peca (conferir a geometria)
CORES_PREVIA = {"tinta": (0.7, 0.05, 0.04), "carenagem": (0.7, 0.05, 0.04), "banco": (0.04, 0.04, 0.045),
                "pneu": (0.03, 0.03, 0.03), "aro": (0.7, 0.72, 0.75), "raio": (0.75, 0.77, 0.8), "cubo": (0.6, 0.6, 0.62),
                "disco": (0.55, 0.55, 0.57), "cromo": (0.85, 0.87, 0.9), "aco": (0.4, 0.41, 0.44),
                "aluminio": (0.5, 0.51, 0.53), "motor": (0.62, 0.63, 0.65), "aleta": (0.55, 0.56, 0.58),
                "quadro": (0.03, 0.03, 0.035), "borracha": (0.02, 0.02, 0.02), "plastico": (0.05, 0.05, 0.055),
                "escapamento": (0.06, 0.06, 0.065), "coletor": (0.5, 0.45, 0.4), "corrente": (0.2, 0.19, 0.18),
                "farol_casco": (0.03, 0.03, 0.035), "mostrador": (0.02, 0.02, 0.02), "painel": (0.04, 0.04, 0.04),
                "espelho_vidro": (0.6, 0.7, 0.8), "espelho_casco": (0.03, 0.03, 0.03), "mola": (0.08, 0.08, 0.09),
                "amortecedor": (0.8, 0.82, 0.85), "pinca": (0.2, 0.2, 0.22), "coroa": (0.3, 0.3, 0.32),
                "tambor": (0.45, 0.46, 0.48), "pedal": (0.4, 0.4, 0.42), "manete": (0.7, 0.71, 0.73),
                "ponteiro": (0.9, 0.3, 0.05), "lente": (0.9, 0.5, 0.06), "placa": (0.9, 0.9, 0.9),
                "preto": (0.035, 0.035, 0.04), "motor_escuro": (0.12, 0.12, 0.13), "cabo": (0.02, 0.02, 0.02),
                "parafuso": (0.6, 0.61, 0.63), "lente_refl": (0.6, 0.02, 0.02)}


def previa(objs):
    mats = {}
    for nome, cor_ in CORES_PREVIA.items():
        m = bpy.data.materials.new("PV_" + nome)
        m.use_nodes = True
        bs = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bs.inputs["Base Color"].default_value = (*cor_, 1)
        m.diffuse_color = (*cor_, 1)
        mats[nome] = m
    for k, ob in objs.items():
        me = ob.data
        me.materials.clear()
        usados = sorted({PECAS[a.value] for a in me.attributes["peca"].data})
        for u in usados:
            me.materials.append(mats.get(u) or mats["aco"])
        idx = [usados.index(PECAS[a.value]) for a in me.attributes["peca"].data]
        me.polygons.foreach_set("material_index", idx)
        if SAIDA_DE[k].startswith("Luz_"):
            cor_ = COR_LUZ[SAIDA_DE[k]]
            m = bpy.data.materials.new("PV_" + k)
            m.diffuse_color = (*cor_, 1)
            me.materials.clear()
            me.materials.append(m)


if not globals().get("SO_FUNCOES"):
    import importlib
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    limpar()
    COL = colecao("Moto_Delivery")
    montar_v4()
    suavizar(OBJS.values())
    tri = sum(len(p.vertices) - 2 for ob in OBJS.values() for p in ob.data.polygons)
    print("triangulos:", tri)
    for k, ob in OBJS.items():
        print("  %-24s %-16s %6d faces" % (k, OSSO_DE[k], len(ob.data.polygons)))
    if "--previa" in ARGS:
        previa(OBJS)
        bpy.ops.wm.save_as_mainfile(filepath=PREVIA, copy=True)
        print("previa", PREVIA)
    else:
        import moto_textura4
        importlib.reload(moto_textura4)
        os.makedirs(SAIDA, exist_ok=True)
        uv_atlas_v4(OBJS)
        ATLAS_PNG = os.path.join(SAIDA, "moto_atlas.png")
        MR_PNG = os.path.join(SAIDA, "moto_metal_rugosidade.png")
        PLACA_PNG = os.path.join(SAIDA, "moto_placa.png")
        if ("--exportar" in ARGS and "--sem-bake" not in ARGS) or not os.path.exists(ATLAS_PNG):
            R = bake_dados(OBJS, ATLAS_PX, 64)
            R["ref"] = np.zeros(R["pos"].shape, np.float32)
            npz = [a.split("=", 1)[1] for a in ARGS if a.startswith("--guardar-bake=")]
            if npz:
                np.savez_compressed(npz[0], **R)
            albedo, mrmap = moto_textura4.pintar(R, PECAS, INFO)
            salvar_png(albedo, ATLAS_PNG, "moto_atlas_tmp")
            salvar_png(mrmap, MR_PNG, "moto_mr_tmp")
            import moto_textura as mt2
            salvar_png(mt2.placa()[::-1], PLACA_PNG, "moto_placa_tmp")
        ATLAS = carregar_img(ATLAS_PNG, "moto_atlas")
        MRIMG = carregar_img(MR_PNG, "moto_mr")
        MRIMG.colorspace_settings.name = 'Non-Color'
        PLACA = carregar_img(PLACA_PNG, "moto_placa")
        COL_COLI = colecao("Moto_Colisao")
        COLI = colisao_v3(COL_COLI)
        RIG, SAIDAS_OBS = montar_rig_e_saidas(COL, ATLAS, MRIMG, PLACA)
        tri = sum(len(p.vertices) - 2 for ob in SAIDAS_OBS.values() for p in ob.data.polygons)
        print("triangulos finais:", tri, "| colisao:", sum(len(p.vertices) - 2 for p in COLI.data.polygons))
        if "--exportar" in ARGS:
            exportar([RIG] + list(SAIDAS_OBS.values()), os.path.join(SAIDA, "moto_delivery.glb"))
            exportar([COLI], os.path.join(SAIDA, "moto_delivery_colisao.glb"))
            os.makedirs(os.path.dirname(BLEND_COPIA), exist_ok=True)
            bpy.ops.wm.save_as_mainfile(filepath=BLEND_COPIA, copy=True)
            print("copia", BLEND_COPIA)
