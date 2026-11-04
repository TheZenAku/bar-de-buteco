# 54_moto_tripo.py
# Moto de entrega Highland Bar Delivery (naked 125 cc, estilo PS2/PS3) refeita a partir da moto vermelha da Tripo
# (cena do Blender: 1 malha de 9,4k triangulos soltos, 1.729 ilhas, 11,9k arestas de borda, textura 1024 estilhacada).
# A malha da Tripo so serve de medida (entre-eixos, rodas, alturas); tudo aqui e refeito em quads, simetrico, com
# UV unica, atlas assado+pintado, luzes separadas, rig completo e saidas para o PlayCanvas / jogo.
#
# Roda com exec no Blender MCP (SO_FUNCOES=True so carrega as funcoes) ou em segundo plano:
#   "D:\SteamLibrary\steamapps\common\Blender\blender.exe" -b --factory-startup -P 54_moto_tripo.py -- --exportar
#
# Convencoes (iguais as da moto antiga 20_moto_delivery.py e do carro 21_carro_hatch.py):
#   frente = -Y no Blender = +Z no glTF; origem no chao, no meio do entre-eixos; Z para cima
#   esquerda do piloto = +X (sufixo _E), direita = -X (_D); ossos que apontam para cima = rotacao identidade no glTF
#   rig: raiz > chassi > direcao > suspensao_diant > roda_dianteira ; chassi > balanca > roda_traseira ; descanso ;
#        bau > bau_tampa ; manetes, punho_acelerador, ponteiro_velocimetro ; pontos de encaixe ponto_*
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
for _a in ARGS:
    if _a.startswith("--guardar-bake="):
        GUARDAR_BAKE = _a.split("=", 1)[1]
SAIDA = r"C:\Users\rafael\BarBoteco\export\moto_v2"
BLEND_COPIA = r"C:\Users\rafael\Desktop\BAR\2.0\veiculos\moto\moto_delivery_v2.blend"
LOGO = r"C:\Users\rafael\Desktop\BAR\2.0\logo\Emblema Neon Highland Bar Delivery.png"
SCRIPTS = "C:/Users/rafael/BarBoteco/scripts"
if "--exportar" in ARGS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene
COLS = ["Moto_Delivery", "Moto_Colisao", "Moto_TMP"]
V = Vector

# ---------------------------------------------------------------- cotas (metros)
YF, YT, ZC = -0.69, 0.69, 0.29           # eixos (entre-eixos 1,38 m) e altura do eixo
R_PNEU = 0.29
RAKE = math.radians(27.0)                # inclinacao da coluna de direcao
AX = V((0, math.sin(RAKE), math.cos(RAKE)))   # eixo da direcao, de baixo para cima (inclinado para tras)
X_GARFO = 0.08                           # semi-distancia das pernas do garfo
PIVO_BAL = V((0, 0.26, 0.40))            # pivo da balanca
PIVO_DESC = V((0.10, 0.20, 0.30))        # pivo do descanso lateral
BAU_Y0, BAU_Y1, BAU_Z0 = 0.55, 0.97, 0.838


def eixo(t):
    """ponto da coluna de direcao a t metros do eixo da roda dianteira"""
    return V((0, YF, ZC)) + AX * t


def tab(t, pts):
    if t <= pts[0][0]:
        return pts[0][1]
    for (a, va), (b, vb) in zip(pts, pts[1:]):
        if t <= b:
            return va + (vb - va) * (t - a) / (b - a)
    return pts[-1][1]


# ---------------------------------------------------------------- pecas (etiquetas das faces; a pintura usa estes nomes)
PECAS = ["tanque", "carenagem", "banco", "pneu", "aro", "raio", "cubo", "disco", "cromo", "aco", "motor", "aleta",
         "quadro", "borracha", "plastico", "escapamento", "corrente", "farol_casco", "mostrador", "painel",
         "espelho_vidro", "espelho_casco", "mola", "amortecedor", "bagageiro", "pinca", "coroa", "tambor", "pedal",
         "descanso", "manete", "ponteiro", "bau", "bau_interno", "tampa_bau", "lente", "placa", "lanterna_casco"]
PID = {n: i for i, n in enumerate(PECAS)}
PINTURA = ("tanque", "carenagem")
COR_PADRAO = (0.78, 0.055, 0.045, 1.0)   # vermelho do modelo de referencia (o jogo pode trocar)


# ---------------------------------------------------------------- construtor de pecas
def circ(n=16, expo=2.0):
    """perfil fechado de diametro 1 (superelipse; expo > 2 deixa quadradinho)"""
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        pts.append((0.5 * math.copysign(abs(c) ** (2 / expo), c), 0.5 * math.copysign(abs(s) ** (2 / expo), s)))
    return pts


RET = circ(16, 4.0)
RET4 = [(-.5, -.5), (.5, -.5), (.5, .5), (-.5, .5)]


def suave(pts, vezes=2):
    """chaikin com as pontas fixas"""
    pts = [V(p) for p in pts]
    for _ in range(vezes):
        n = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            n += [a * 0.75 + b * 0.25, a * 0.25 + b * 0.75]
        n.append(pts[-1])
        pts = n
    return pts


def arco(cy, cz, R, a0, a1, n, frente=False):
    """pontos (0, y, z) de um arco em torno de (cy, cz); angulo medido da vertical, positivo para tras (+y)"""
    out = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        out.append(V((0, cy + R * math.sin(a), cz + R * math.cos(a))))
    return out


class P:
    """bmesh de uma peca (varias formas soltas); cada face recebe a etiqueta 'peca'"""

    def __init__(self):
        self.bm = bmesh.new()
        self.lay = self.bm.faces.layers.int.new("peca")

    def face(self, vs, peca):
        try:
            f = self.bm.faces.new(vs)
        except ValueError:
            return None
        f[self.lay] = PID[peca]
        return f

    def anel(self, pts):
        return [self.bm.verts.new(p) for p in pts]

    def ligar(self, a, b, peca, fechado=True):
        m = len(a)
        for k in range(m if fechado else m - 1):
            self.face([a[k], a[(k + 1) % m], b[(k + 1) % m], b[k]], peca)

    def varrer(self, perfil, est, peca, up=(0, 0, 1), tampa_a=None, tampa_b=None):
        """perfil fechado [(u, v)] de diametro 1 varrido por estacoes [(pos, su, sv)] (su, sv = dimensoes totais);
        tampa_x = None (tampa plana) ou [(desloc, escala)...]: aneis que fecham a ponta arredondando"""
        pts = [V(e[0]) for e in est]
        n = len(pts)
        tg = []
        for i in range(n):
            t = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
            t.normalize()
            tg.append(t)

        def quadro(t):
            r = t.cross(V(up))
            if r.length < 1e-3:
                r = t.cross(V((1, 0, 0)) if abs(up[0]) < 0.9 else V((0, 1, 0)))
            r.normalize()
            return r, r.cross(t)
        seq = []                                   # (pos, su, sv, t)
        if tampa_a:
            for d, f in reversed(tampa_a):
                m = min(est[0][1], est[0][2])
                seq.append((pts[0] - tg[0] * d * m, est[0][1] * f, est[0][2] * f, tg[0]))
        for i in range(n):
            seq.append((pts[i], est[i][1], est[i][2], tg[i]))
        if tampa_b:
            for d, f in tampa_b:
                m = min(est[-1][1], est[-1][2])
                seq.append((pts[-1] + tg[-1] * d * m, est[-1][1] * f, est[-1][2] * f, tg[-1]))
        aneis = []
        for p, su, sv, t in seq:
            r, v = quadro(t)
            aneis.append(self.anel([p + r * (u * su) + v * (w * sv) for u, w in perfil]))
        for a, b in zip(aneis, aneis[1:]):
            self.ligar(a, b, peca)
        self.face(list(reversed(aneis[0])), peca)
        self.face(aneis[-1], peca)

    def tubo(self, pts, d, peca, lados=6, up=(1, 0, 0), suavizar=2, tampa=False):
        cam = suave(pts, suavizar) if suavizar else [V(p) for p in pts]
        c = [(0.6, 0.8), (0.9, 0.5)] if tampa else None
        self.varrer(circ(lados), [(p, d, d) for p in cam], peca, up=up, tampa_a=c, tampa_b=c)

    def barra(self, p0, p1, w, h, peca, up=(0, 0, 1), perfil=None):
        self.varrer(perfil or RET4, [(p0, w, h), (p1, w, h)], peca, up=up)

    def cilindro(self, p0, p1, d, peca, lados=10, d1=None, tampas=True):
        a = [(p0, d, d), (p1, d if d1 is None else d1, d if d1 is None else d1)]
        self.varrer(circ(lados), a, peca, up=(1, 0, 0) if abs(V(p1)[0] - V(p0)[0]) < 1e-6 else (0, 0, 1))

    def caixa(self, centro, tam, peca, chanfro=0.0, rot=None, seg=1):
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        vs = r["verts"]
        bmesh.ops.scale(self.bm, vec=tam, verts=vs)
        faces = list({f for v in vs for f in v.link_faces})
        for f in faces:
            f[self.lay] = PID[peca]
        if chanfro > 0:
            es = list({e for v in vs for e in v.link_edges})
            ret = bmesh.ops.bevel(self.bm, geom=vs + es, offset=chanfro, segments=seg, affect='EDGES', profile=0.6)
            for f in ret["faces"]:
                f[self.lay] = PID[peca]
            vs = list({v for f in faces + ret["faces"] if f.is_valid for v in f.verts})
        if rot is not None:
            bmesh.ops.transform(self.bm, matrix=rot, verts=vs)
        bmesh.ops.translate(self.bm, vec=V(centro), verts=vs)
        return vs

    def revolucao(self, perfil, centro, eixo_v, lados, peca, ref=(0, 0, 1), fechar=False, tampas=True):
        """perfil [(raio, a)] em torno de um eixo; raio 0 nas pontas vira tampa plana; fechar liga o fim ao comeco"""
        ex = V(eixo_v).normalized()
        e1 = V(ref) - ex * V(ref).dot(ex)
        if e1.length < 1e-3:
            e1 = V((1, 0, 0)) - ex * ex[0]
        e1.normalize()
        e2 = ex.cross(e1)
        c = V(centro)
        aneis = []
        for r, a in perfil:
            if r < 1e-6:
                aneis.append(None)
                continue
            aneis.append(self.anel([c + ex * a + (e1 * math.cos(2 * math.pi * i / lados) +
                                                  e2 * math.sin(2 * math.pi * i / lados)) * r for i in range(lados)]))
        ok = [a for a in aneis if a]
        for a, b in zip(aneis, aneis[1:]):
            if a and b:
                self.ligar(a, b, peca)
        if fechar:
            self.ligar(ok[-1], ok[0], peca)
        elif not tampas:
            pass
        elif aneis[0] is None and len(ok):
            self.face(ok[0], peca)
        elif aneis[0]:
            self.face(list(reversed(aneis[0])), peca)
        if not fechar and tampas:
            if aneis[-1] is None:
                self.face(list(reversed(ok[-1])), peca)
            elif aneis[-1]:
                self.face(aneis[-1], peca)

    def objeto(self, nome, col, orientar=True):
        bm = self.bm
        if orientar:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(nome)
        bm.to_mesh(me)
        bm.free()
        self.bm = None
        ob = bpy.data.objects.new(nome, me)
        col.objects.link(ob)
        return ob


def colecao(nome):
    col = bpy.data.collections.get(nome)
    if col is None:
        col = bpy.data.collections.new(nome)
        SC.collection.children.link(col)
    return col


def limpar():
    for nome in COLS:
        col = bpy.data.collections.get(nome)
        if col:
            for o in list(col.objects):
                bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.collections.remove(col)
    for dados in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images):
        for d in list(dados):
            if d.users == 0 and d.name.startswith(("Moto_", "TMP_", "Luz_", "moto_")):
                dados.remove(d)


# ---------------------------------------------------------------- as pecas da moto
OBJS = {}          # nome -> objeto
OSSO_DE = {}       # nome -> osso (pele rigida: 100% num osso)
SAIDA_DE = {}      # nome -> malha de saida do GLB


def parte(nome, osso, p, saida="Moto", orientar=True):
    ob = p.objeto("Moto_" + nome, COL, orientar)
    OBJS[nome] = ob
    OSSO_DE[nome] = osso
    SAIDA_DE[nome] = saida
    return ob


def roda(nome, yc, larg, osso, disco=0, tambor=0, coroa=0, raios=5):
    """pneu + aro de liga com raios + cubo + freio; eixo X; disco/tambor/coroa = lado (+1 esquerda, -1 direita)"""
    p = P()
    L = larg / 2
    lados = 20
    c = (0, yc, ZC)
    pneu = [(.212, -L * .78), (.242, -L * .97), (.270, -L * .90), (.285, -L * .55), (.290, -L * .20), (.290, L * .20),
            (.285, L * .55), (.270, L * .90), (.242, L * .97), (.212, L * .78)]
    p.revolucao(pneu, c, (1, 0, 0), lados, "pneu", tampas=False)     # aberto por dentro: os raios aparecem
    aro =[(.226, -L * .70), (.226, -L * .84), (.214, -L * .84), (.196, -L * .62), (.196, L * .62), (.214, L * .84),
           (.226, L * .84), (.226, L * .70), (.209, L * .60), (.209, -L * .60)]
    p.revolucao(aro, c, (1, 0, 0), lados, "aro", fechar=True)
    # raios: barras que afinam do cubo ao aro
    for k in range(raios):
        a = 2 * math.pi * (k + 0.5) / raios
        d = V((0, math.sin(a), math.cos(a)))
        e = [(V(c) + d * 0.030, 0.055, 0.038), (V(c) + d * 0.095, 0.040, 0.030), (V(c) + d * 0.195, 0.034, 0.030)]
        p.varrer(RET4, e, "raio", up=(1, 0, 0))
    p.revolucao([(.022, -.070), (.036, -.060), (.044, -.040), (.044, .040), (.036, .060), (.022, .070)],
                c, (1, 0, 0), lados, "cubo")
    p.revolucao([(0, -.092), (.017, -.092), (.017, .092), (0, .092)], c, (1, 0, 0), 12, "aco")
    if disco:
        s = disco
        p.revolucao([(.060, s * .050), (.090, s * .056), (.150, s * .056), (.150, s * .0605), (.090, s * .0605),
                     (.060, s * .0555)], c, (1, 0, 0), lados, "disco", fechar=True)
    if tambor:
        s = tambor
        p.revolucao([(.045, s * .044), (.095, s * .046), (.100, s * .062), (.100, s * .090), (.060, s * .092),
                     (.045, s * .075)], c, (1, 0, 0), lados, "tambor", fechar=True)
    if coroa:
        s = coroa
        p.revolucao([(.060, s * .050), (.090, s * .054), (.100, s * .058), (.100, s * .066), (.090, s * .066),
                     (.060, s * .060)], c, (1, 0, 0), lados * 2, "coroa", fechar=True)
    parte(nome, osso, p)


def paralama_diant():
    p = P()
    pts = arco(YF, ZC, 0.322, -52, 52, 12)
    # arco que se afasta da roda nas pontas
    est = [(q, 0.012, 0.118 + 0.008 * abs(i - 6) / 6) for i, q in enumerate(pts)]
    p.varrer(RET, est, "carenagem", up=(1, 0, 0), tampa_a=[(0.3, 0.8), (0.6, 0.4)], tampa_b=[(0.3, 0.8), (0.6, 0.4)])
    for s in (1, -1):      # abracadeiras presas nas pernas do garfo
        p.barra(V((s * 0.052, YF + 0.040, ZC + 0.322)), V((s * X_GARFO, YF + 0.045, ZC + 0.26)), 0.016, 0.03, "aco",
                up=(0, 1, 0))
    parte("Paralama_Diant", "suspensao_diant", p)


def garfo():
    sup = P()
    inf = P()
    for s in (1, -1):
        # tubo superior (cromado) preso as mesas; tubo inferior (liga) desliza com a roda
        sup.cilindro(V((s * X_GARFO, 0, 0)) + eixo(0.36), V((s * X_GARFO, 0, 0)) + eixo(0.80), 0.027, "cromo", 10)
        inf.cilindro(V((s * X_GARFO, 0, 0)) + eixo(0.00), V((s * X_GARFO, 0, 0)) + eixo(0.43), 0.034, "aco", 10)
        inf.cilindro(V((s * X_GARFO, 0, 0)) + eixo(0.43), V((s * X_GARFO, 0, 0)) + eixo(0.47), 0.040, "aco", 10)
        inf.cilindro(V((s * 0.058, YF, ZC)), V((s * 0.098, YF, ZC)), 0.040, "aco", 10)
    # mesas (inferior e superior) e coluna
    sup.caixa(eixo(0.60), (0.200, 0.046, 0.040), "aco", chanfro=0.008)
    sup.caixa(eixo(0.775), (0.190, 0.050, 0.034), "aco", chanfro=0.008)
    sup.cilindro(eixo(0.58), eixo(0.80), 0.032, "aco", 8)
    parte("Garfo_Superior", "direcao", sup)
    parte("Garfo_Inferior", "suspensao_diant", inf)
    # pinca de freio presa a perna esquerda
    pi = P()
    pi.caixa(V((0.062, YF + 0.105, ZC + 0.085)), (0.032, 0.062, 0.080), "pinca", chanfro=0.008,
             rot=Matrix.Rotation(math.radians(-30), 4, 'X'))
    parte("Pinca", "suspensao_diant", pi)


def guidao():
    g = P()
    seg = [V((0.265, -0.250, 1.025)), V((0.200, -0.298, 1.003)), V((0.090, -0.335, 0.992)), V((0, -0.335, 0.990))]
    caminho = seg + [V((-p[0], p[1], p[2])) for p in reversed(seg[:-1])]
    g.tubo(caminho, 0.023, "cromo", 8, up=(0, 0, 1), suavizar=1, tampa=True)
    g.caixa((0, -0.335, 0.995), (0.090, 0.046, 0.034), "aco", chanfro=0.007)
    g.caixa((-0.115, -0.315, 1.025), (0.050, 0.050, 0.050), "plastico", chanfro=0.010)     # reservatorio do freio
    # punho esquerdo (borracha); o direito e o acelerador (osso proprio)
    g.cilindro(V((0.160, -0.287, 1.011)), V((0.280, -0.242, 1.030)), 0.038, "borracha", 10)
    parte("Guidao", "direcao", g)
    a = P()
    a.cilindro(V((-0.160, -0.287, 1.011)), V((-0.280, -0.242, 1.030)), 0.038, "borracha", 10)
    parte("Punho_Acelerador", "punho_acelerador", a)
    # manetes (freio na direita, embreagem na esquerda)
    for nome, s, osso in (("Manete_Freio", -1, "manete_freio"), ("Manete_Embreagem", 1, "manete_embreagem")):
        m = P()
        m.tubo([V((s * 0.150, -0.318, 1.020)), V((s * 0.205, -0.352, 1.024)), V((s * 0.262, -0.330, 1.028)),
                V((s * 0.285, -0.285, 1.030))], 0.014, "manete", 6, up=(0, 0, 1), suavizar=1, tampa=True)
        parte(nome, osso, m)
    # retrovisores
    for s in (1, -1):
        e = P()
        e.tubo([V((s * 0.262, -0.255, 1.030)), V((s * 0.300, -0.252, 1.110)), V((s * 0.330, -0.246, 1.190))], 0.013,
               "cromo", 6, up=(0, 1, 0), suavizar=1, tampa=True)
        rot = Matrix.Rotation(math.radians(-14), 4, 'X') @ Matrix.Rotation(math.radians(s * 12), 4, 'Z')
        e.caixa((s * 0.342, -0.236, 1.222), (0.126, 0.030, 0.076), "espelho_casco", chanfro=0.014, rot=rot, seg=2)
        vidro = P()
        rot2 = Matrix.Rotation(math.radians(-14), 4, 'X') @ Matrix.Rotation(math.radians(s * 12), 4, 'Z')
        e.caixa((s * 0.342 + s * 0.001, -0.236 + 0.0155, 1.222 + 0.0035), (0.108, 0.004, 0.058), "espelho_vidro", rot=rot2)
        parte("Retrovisor_" + ("E" if s > 0 else "D"), "direcao", e)


def farol_e_painel():
    fy, fz = -0.500, 0.965
    h = P()
    # casco do farol (balde): eixo Y, para a frente = -Y
    h.revolucao([(.040, .105), (.072, .090), (.091, .045), (.097, .000), (.100, -.030), (.095, -.036), (.087, -.034)],
                V((0, fy, fz)), (0, -1, 0), 20, "farol_casco")
    for s in (1, -1):
        h.cilindro(V((s * 0.092, fy + 0.020, fz)), V((s * 0.080, fy + 0.150, fz - 0.010)), 0.024, "aco", 8)
        h.cilindro(V((s * 0.096, fy + 0.020, fz)), V((s * 0.150, fy + 0.020, fz - 0.025)), 0.022, "aco", 8)   # haste da seta
    parte("Farol_Casco", "direcao", h)
    luz = P()
    luz.revolucao([(.090, -.027), (.084, -.036), (.062, -.047), (.034, -.054), (.014, -.057)],
                  V((0, fy, fz)), (0, -1, 0), 20, "lente")
    parte("Luz_Farol", "direcao", luz, "Luz_Farol")
    # luz de posicao: anel em volta da lente (e o brilho do painel)
    pos = P()
    pos.revolucao([(.094, -.033), (.101, -.034), (.101, -.039), (.094, -.039)], V((0, fy, fz)), (0, -1, 0), 20,
                  "lente", fechar=True)
    # painel (velocimetro): carcaca virada para o piloto e mostrador
    n = V((0, 0.80, 0.60)).normalized()
    c = V((0, -0.372, 1.068))
    pn = P()
    pn.revolucao([(.064, -.040), (.060, -.018), (.056, .000), (.052, .004), (.050, .000)], c, n, 20, "painel", ref=(1, 0, 0),
                 fechar=False)
    pn.revolucao([(.050, .0035), (.0, .0035)], c, n, 20, "mostrador", ref=(1, 0, 0))
    pn.caixa(c + V((0, -0.040, -0.040)), (0.06, 0.06, 0.05), "painel", chanfro=0.008)
    pn.cilindro(c + V((0, -0.04, -0.04)), eixo(0.72), 0.026, "aco", 8)
    parte("Painel", "direcao", pn)
    pos.revolucao([(.056, .0030), (.060, .0030), (.060, .0050), (.056, .0050)], c, n, 20, "lente", ref=(1, 0, 0),
                  fechar=True)
    parte("Luz_Posicao", "direcao", pos, "Luz_Posicao")
    return c, n


def ponteiro(c, n):
    pt = P()
    ex = n
    # repouso apontando para o zero da escala (225 graus no sentido horario a partir de 12h, visto pelo piloto);
    # o fundo de escala fica a 270 graus no sentido horario = rotacao negativa em torno do eixo do osso
    dir_zero = V((0.7071, 0.4243, -0.5657))
    base = c + ex * 0.0055
    tip = base + dir_zero * 0.042
    tail = base - dir_zero * 0.010
    pt.varrer(RET4, [(tail, 0.005, 0.0015), (tip, 0.005, 0.0015)], "ponteiro", up=tuple(ex))
    parte("Ponteiro", "ponteiro_velocimetro", pt)


def setas():
    for s, lado in ((1, "E"), (-1, "D")):
        f = P()
        f.caixa((s * 0.205, -0.510, 0.930), (0.050, 0.060, 0.044), "lente", chanfro=0.012, seg=2)
        t = P()
        t.caixa((s * 0.100, 1.025, 0.725), (0.050, 0.048, 0.040), "lente", chanfro=0.012, seg=2)
        f.bm.verts.ensure_lookup_table()
        # junta frente (osso direcao) e tras (osso chassi) na mesma malha de saida: objetos separados, saida unica
        parte("Seta_Frente_" + lado, "direcao", f, "Luz_Seta_" + lado)
        parte("Seta_Tras_" + lado, "chassi", t, "Luz_Seta_" + lado)
        h = P()
        h.cilindro(V((s * 0.096, 0.945, 0.742)), V((s * 0.100, 1.005, 0.727)), 0.020, "aco", 8)
        parte("Haste_Seta_" + lado, "chassi", h)


def tanque_banco_rabeta():
    t = P()
    est = [((0, -0.30, 0.836), .150, .150), ((0, -0.22, 0.840), .235, .190), ((0, -0.10, 0.835), .290, .200),
           ((0, 0.02, 0.820), .270, .180), ((0, 0.11, 0.800), .200, .140)]
    t.varrer(circ(16, 2.7), est, "tanque", up=(1, 0, 0), tampa_a=[(0.18, 0.88), (0.38, 0.62), (0.55, 0.3)],
             tampa_b=[(0.15, 0.8), (0.35, 0.45)])
    parte("Tanque", "chassi", t)
    tc = P()
    tc.revolucao([(0.033, 0.0), (0.033, 0.006), (0.026, 0.010), (0.020, 0.012)], V((0, -0.10, 0.934)), (0, 0, 1), 12,
                 "cromo")
    tc.cilindro(V((0, -0.10, 0.930)), V((0, -0.10, 0.938)), 0.070, "cromo", 12)
    parte("Tampa_Tanque", "chassi", tc)
    b = P()
    est = [((0, 0.04, 0.750), .170, .080), ((0, 0.16, 0.755), .260, .090), ((0, 0.36, 0.760), .300, .090),
           ((0, 0.55, 0.765), .270, .085), ((0, 0.66, 0.775), .220, .070)]
    b.varrer(circ(16, 3.4), est, "banco", up=(1, 0, 0), tampa_a=[(0.3, 0.8), (0.55, 0.5)],
             tampa_b=[(0.3, 0.8), (0.55, 0.5)])
    parte("Banco", "chassi", b)
    r = P()
    est = [((0, 0.30, 0.700), .200, .120), ((0, 0.55, 0.712), .190, .120), ((0, 0.80, 0.738), .170, .100),
           ((0, 0.985, 0.765), .150, .080)]
    r.varrer(circ(16, 3.0), est, "carenagem", up=(1, 0, 0), tampa_a=[(0.2, 0.8)])
    # nicho da lanterna: a ponta fica plana e a lente entra por cima
    parte("Rabeta", "chassi", r)
    for s, nome in ((1, "E"), (-1, "D")):
        c = P()
        est = [((s * 0.138, 0.10, 0.690), .040, .150), ((s * 0.140, 0.30, 0.690), .046, .190),
               ((s * 0.132, 0.52, 0.708), .040, .150)]
        c.varrer(circ(12, 3.0), est, "carenagem", up=(0, 0, 1), tampa_a=[(0.25, 0.8)], tampa_b=[(0.25, 0.8)])
        parte("Tampa_Lateral_" + nome, "chassi", c)
    pf = P()
    arc = arco(YT, ZC, 0.330, -28, 92, 12)
    est = [(q, 0.012, 0.130) for q in arc]
    pf.varrer(RET, est, "carenagem", up=(1, 0, 0), tampa_a=[(0.3, 0.8), (0.6, 0.4)], tampa_b=[(0.3, 0.8), (0.6, 0.4)])
    for s in (1, -1):
        pf.barra(V((s * 0.060, YT + 0.32, 0.40)), V((s * 0.085, 0.92, 0.70)), 0.016, 0.020, "aco", up=(0, 1, 0))
    parte("Paralama_Tras", "chassi", pf)


def lanterna_e_placa():
    c = P()
    c.caixa((0, 0.990, 0.775), (0.150, 0.026, 0.085), "lanterna_casco", chanfro=0.010, seg=2)
    parte("Lanterna_Casco", "chassi", c)
    l = P()
    l.caixa((0, 1.006, 0.775), (0.124, 0.020, 0.062), "lente", chanfro=0.010, seg=2)
    l.caixa((0, 1.043, 0.700), (0.044, 0.016, 0.012), "lente", chanfro=0.003)       # lampada da placa
    parte("Luz_Lanterna", "chassi", l, "Luz_Lanterna")
    f = P()
    f.caixa((0, 1.018, 0.775), (0.056, 0.012, 0.030), "lente", chanfro=0.004)
    parte("Luz_Freio", "chassi", f, "Luz_Freio")
    s = P()
    s.tubo([V((0, 0.93, 0.700)), V((0, 1.030, 0.675)), V((0, 1.045, 0.640))], 0.022, "aco", 6, up=(1, 0, 0),
           suavizar=1, tampa=True)
    s.barra(V((0, 1.044, 0.700)), V((0, 1.046, 0.560)), 0.060, 0.012, "aco", up=(1, 0, 0))
    parte("Suporte_Placa", "chassi", s)
    # placa Mercosul de moto 20 x 17 cm, em objeto proprio (textura propria)
    pl = P()
    rot = Matrix.Rotation(math.radians(-14), 4, 'X')
    pl.caixa((0, 1.068, 0.610), (0.200, 0.004, 0.170), "placa", rot=rot)
    parte("Placa", "chassi", pl, "Moto_Placa", orientar=False)


def quadro_motor():
    q = P()
    cabeca = eixo(0.66)
    q.cilindro(eixo(0.64), eixo(0.745), 0.060, "quadro", 8)
    # coluna central e berco
    q.tubo([V((0, cabeca.y + 0.01, cabeca.z - 0.06)), V((0, -0.20, 0.770)), V((0, -0.05, 0.725)), V((0, 0.14, 0.712)),
            V((0, 0.25, 0.690))], 0.036, "quadro", 6, up=(1, 0, 0), suavizar=2, tampa=True)
    for s in (1, -1):
        q.tubo([V((s * 0.036, cabeca.y + 0.01, cabeca.z - 0.08)), V((s * 0.070, -0.31, 0.46)),
                V((s * 0.085, -0.20, 0.31)), V((s * 0.085, 0.00, 0.265)), V((s * 0.090, 0.18, 0.285)),
                V((s * 0.105, 0.26, 0.40))], 0.034, "quadro", 6, up=(1, 0, 0), suavizar=2, tampa=True)
        q.tubo([V((s * 0.090, 0.24, 0.66)), V((s * 0.105, 0.48, 0.725)), V((s * 0.092, 0.74, 0.755)),
                V((s * 0.080, 0.945, 0.765))], 0.030, "quadro", 6, up=(1, 0, 0), suavizar=2, tampa=True)
        q.tubo([V((s * 0.105, 0.28, 0.50)), V((s * 0.105, 0.42, 0.62)), V((s * 0.105, 0.60, 0.735))], 0.026, "quadro", 6,
               up=(1, 0, 0), suavizar=1, tampa=True)
        q.caixa((s * 0.112, 0.255, 0.52), (0.014, 0.115, 0.250), "quadro", chanfro=0.004)       # placa do pivo
        # pedaleiras do piloto e da garupa
        q.caixa((s * 0.150, 0.100, 0.372), (0.090, 0.040, 0.030), "aco", chanfro=0.005)
        q.cilindro(V((s * 0.150, 0.100, 0.372)), V((s * 0.250, 0.100, 0.372)), 0.026, "borracha", 8)
        q.tubo([V((s * 0.105, 0.52, 0.42)), V((s * 0.150, 0.52, 0.42)), V((s * 0.160, 0.50, 0.405))], 0.020, "aco", 6,
               up=(0, 0, 1), suavizar=0, tampa=True)
        q.cilindro(V((s * 0.160, 0.50, 0.405)), V((s * 0.255, 0.50, 0.405)), 0.024, "borracha", 8)
    parte("Quadro", "chassi", q)
    # bagageiro: plataforma e apoios
    b = P()
    b.caixa((0, 0.76, 0.822), (0.380, 0.440, 0.016), "bagageiro", chanfro=0.004)
    for s in (1, -1):
        b.tubo([V((s * 0.105, 0.58, 0.745)), V((s * 0.150, 0.60, 0.810))], 0.020, "bagageiro", 6, up=(0, 1, 0),
               suavizar=0, tampa=True)
        b.tubo([V((s * 0.082, 0.93, 0.765)), V((s * 0.160, 0.94, 0.815))], 0.020, "bagageiro", 6, up=(0, 1, 0),
               suavizar=0, tampa=True)
    parte("Bagageiro", "chassi", b)
    m = P()
    m.caixa((0, 0.02, 0.405), (0.200, 0.340, 0.250), "motor", chanfro=0.030, seg=2)
    m.caixa((0, 0.20, 0.395), (0.170, 0.110, 0.210), "motor", chanfro=0.025, seg=2)           # caixa de cambio
    m.caixa((0, -0.04, 0.600), (0.130, 0.120, 0.170), "motor", chanfro=0.010)                  # cilindro
    for i in range(5):
        m.caixa((0, -0.04, 0.545 + i * 0.030), (0.170, 0.150, 0.012), "aleta", chanfro=0.003)
    m.caixa((0, -0.04, 0.705), (0.150, 0.135, 0.062), "motor", chanfro=0.012)                  # cabecote
    m.caixa((0, 0.150, 0.650), (0.120, 0.140, 0.110), "plastico", chanfro=0.015, seg=2)          # filtro / carburador
    m.revolucao([(0.074, 0.0), (0.074, 0.014), (0.060, 0.020), (0.026, 0.022), (0.026, 0.030)], V((0.100, 0.060, 0.420)),
                (1, 0, 0), 16, "motor")                                                         # tampa da embreagem
    m.revolucao([(0.058, 0.0), (0.058, -0.012), (0.044, -0.018)], V((-0.100, -0.030, 0.430)), (1, 0, 0), 16, "motor")
    m.revolucao([(0.040, 0.0), (0.040, 0.010), (0.028, 0.014), (0.0, 0.014)], V((0.100, 0.24, 0.340)), (1, 0, 0), 14,
                "coroa")                                                                        # pinhao
    parte("Motor", "chassi", m)
    e = P()
    e.tubo([V((-0.010, -0.100, 0.630)), V((-0.050, -0.130, 0.520)), V((-0.095, -0.080, 0.340)), V((-0.130, 0.150, 0.285)),
            V((-0.170, 0.300, 0.300))], 0.046, "escapamento", 8, up=(0, 0, 1), suavizar=2, tampa=True)
    est = [(V((-0.170, 0.30, 0.300)), .060, .060), (V((-0.178, 0.40, 0.310)), .090, .090),
           (V((-0.182, 0.70, 0.350)), .100, .100), (V((-0.184, 0.96, 0.400)), .098, .098),
           (V((-0.185, 1.00, 0.410)), .090, .090)]
    e.varrer(circ(12), est, "escapamento", up=(1, 0, 0), tampa_b=[(0.2, 0.8), (0.4, 0.5)])
    e.barra(V((-0.110, 0.55, 0.440)), V((-0.186, 0.56, 0.350)), 0.020, 0.030, "aco", up=(0, 1, 0))
    parte("Escapamento", "chassi", e)
    # pedal de freio e de cambio
    pd = P()
    pd.tubo([V((-0.125, 0.220, 0.335)), V((-0.130, 0.100, 0.305)), V((-0.130, 0.010, 0.318))], 0.016, "pedal", 6, up=(1, 0, 0),
            suavizar=1, tampa=True)
    pd.caixa((-0.140, 0.000, 0.320), (0.050, 0.060, 0.012), "borracha", chanfro=0.003)
    pd.tubo([V((0.115, 0.130, 0.340)), V((0.125, 0.020, 0.345)), V((0.140, -0.030, 0.350))], 0.014, "pedal", 6, up=(1, 0, 0),
            suavizar=1, tampa=True)
    pd.caixa((0.150, -0.040, 0.352), (0.040, 0.030, 0.014), "borracha", chanfro=0.003)
    parte("Pedais", "chassi", pd)


def suspensao_traseira():
    b = P()
    for s in (1, -1):
        est = [(V((s * 0.125, 0.26, 0.40)), 0.036, 0.070), (V((s * 0.105, 0.46, 0.360)), 0.034, 0.056),
               (V((s * 0.088, 0.69, ZC)), 0.030, 0.048)]
        b.varrer(RET4, est, "quadro", up=(0, 0, 1))
        b.caixa((s * 0.100, 0.69, ZC), (0.030, 0.060, 0.044), "aco", chanfro=0.006)
        b.cilindro(V((s * 0.112, 0.69, ZC)), V((s * 0.125, 0.69, ZC)), 0.026, "aco", 8)
        b.cilindro(V((s * 0.100, 0.26, 0.40)), V((s * 0.135, 0.26, 0.40)), 0.036, "aco", 10)
    b.barra(V((-0.125, 0.40, 0.395)), V((0.125, 0.40, 0.395)), 0.030, 0.034, "quadro", up=(0, 1, 0))
    # protetor da corrente (esquerda)
    b.barra(V((0.150, 0.40, 0.365)), V((0.150, 0.60, 0.350)), 0.010, 0.045, "plastico", up=(0, 1, 0))
    parte("Balanca", "balanca", b)
    c = P()
    c.barra(V((0.075, 0.24, 0.375)), V((0.075, 0.69, 0.385)), 0.014, 0.020, "corrente", up=(1, 0, 0))
    c.barra(V((0.075, 0.24, 0.305)), V((0.075, 0.69, 0.195)), 0.014, 0.020, "corrente", up=(1, 0, 0))
    parte("Corrente", "balanca", c)
    for s, nome in ((1, "E"), (-1, "D")):
        top = V((s * 0.140, 0.50, 0.700))
        bot = V((s * 0.125, 0.60, 0.345))
        d = (bot - top).normalized()
        sp = P()
        sp.cilindro(top, top + d * 0.11, 0.030, "amortecedor", 10)
        perfil = []
        L = (bot - top).length
        a0, a1 = 0.10, L - 0.07
        n = 8
        for i in range(n):
            perfil += [(0.036, a0 + (a1 - a0) * (i + 0.2) / n), (0.044, a0 + (a1 - a0) * (i + 0.5) / n),
                       (0.036, a0 + (a1 - a0) * (i + 0.8) / n)]
        sp.revolucao(perfil, top, d, 10, "mola", ref=(1, 0, 0))
        sp.caixa(top, (0.034, 0.030, 0.030), "aco", chanfro=0.006)
        parte("Amortecedor_" + nome, "chassi", sp)
        inf = P()
        inf.cilindro(bot - d * 0.09, bot, 0.020, "amortecedor", 8)
        inf.caixa(bot, (0.034, 0.030, 0.030), "aco", chanfro=0.006)
        parte("Amortecedor_Inf_" + nome, "balanca", inf)


def descanso():
    p = P()
    pv = PIVO_DESC
    # recolhido: perna para tras (+y) e um pouco para fora; o osso gira -90 graus em X para abrir (a perna aponta para baixo)
    p.cilindro(pv - V((0.020, 0, 0)), pv + V((0.030, 0, 0)), 0.034, "descanso", 8)
    p.tubo([pv + V((0.020, 0, 0)), pv + V((0.100, 0.150, 0)), pv + V((0.215, 0.265, 0))], 0.026, "descanso", 6,
           up=(0, 0, 1), suavizar=1, tampa=True)
    p.caixa(pv + V((0.225, 0.275, 0)), (0.070, 0.050, 0.030), "borracha", chanfro=0.006)
    parte("Descanso", "descanso", p)


def bau():
    b = P()
    y0, y1 = BAU_Y0, BAU_Y1
    cy = (y0 + y1) / 2
    zb = BAU_Z0
    hc = 0.300                                   # corpo
    vs = b.caixa((0, cy, zb + hc / 2), (0.420, y1 - y0, hc), "bau", chanfro=0.022, seg=2)
    bm = b.bm
    bm.normal_update()
    topo = [f for f in bm.faces if f.normal.z > 0.99 and abs(f.calc_center_median().z - (zb + hc)) < 1e-4]
    if topo:
        r = bmesh.ops.inset_individual(bm, faces=topo, thickness=0.030)
        r2 = bmesh.ops.extrude_discrete_faces(bm, faces=topo)
        bmesh.ops.translate(bm, vec=(0, 0, -0.270), verts=list({v for f in r2["faces"] for v in f.verts}))
        for f in r2["faces"]:
            f[b.lay] = PID["bau_interno"]
            for e in f.edges:
                for lf in e.link_faces:
                    if lf not in r2["faces"]:
                        lf[b.lay] = PID["bau_interno"]
    parte("Bau", "bau", b, "Moto_Bau")
    t = P()
    zt = zb + hc
    t.caixa((0, cy, zt + 0.040), (0.420, y1 - y0, 0.080), "tampa_bau", chanfro=0.022, seg=2)
    t.caixa((0, y0 - 0.010, zt + 0.015), (0.060, 0.020, 0.040), "cromo", chanfro=0.004)       # fecho
    t.caixa((0, y1, zt + 0.020), (0.200, 0.016, 0.020), "aco", chanfro=0.003)                   # dobradica
    parte("Bau_Tampa", "bau_tampa", t, "Moto_Bau")


def montar_geometria():
    roda("Roda_Dianteira", YF, 0.092, "roda_dianteira", disco=1)
    roda("Roda_Traseira", YT, 0.112, "roda_traseira", tambor=-1, coroa=1)
    paralama_diant()
    garfo()
    guidao()
    c, n = farol_e_painel()
    ponteiro(c, n)
    setas()
    tanque_banco_rabeta()
    lanterna_e_placa()
    quadro_motor()
    suspensao_traseira()
    descanso()
    bau()
    return c, n


def suavizar(obs, angulo=40.0):
    """sombreamento suave com vinco nas quinas (auto smooth do 4.0 -> normais divididas no glTF)"""
    for ob in obs:
        me = ob.data
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        if hasattr(me, "use_auto_smooth"):
            me.use_auto_smooth = True
            me.auto_smooth_angle = math.radians(angulo)
        me.update()


# ---------------------------------------------------------------- UV (atlas unico)
ATLAS_PX = 2048
MARGEM_PX = 6
SEM_ATLAS = ("Luz_", "Moto_Placa", "Moto_Bau")          # luzes = cor lisa; placa e bau tem textura propria
# densidade relativa de texel por peca (1 = pintura); o que quase nao aparece ganha menos pixels
DENSIDADE = {"mostrador": 3.0, "painel": 1.6, "farol_casco": 1.2, "espelho_vidro": 0.8, "lanterna_casco": 0.8,
             "aleta": 0.45, "corrente": 0.3, "quadro": 0.55, "escapamento": 0.7, "mola": 0.5, "amortecedor": 0.5,
             "aco": 0.55, "motor": 0.8, "pneu": 0.85, "aro": 1.5, "raio": 1.3, "cubo": 0.9, "disco": 1.3, "tanque": 1.3,
             "banco": 1.2, "borracha": 0.5, "cromo": 0.8, "bagageiro": 0.4, "descanso": 0.4, "pedal": 0.4, "manete": 0.4,
             "ponteiro": 1.0, "pinca": 0.7, "coroa": 0.7, "tambor": 0.7, "espelho_casco": 0.6, "plastico": 0.6}


def selecionar_so(obs, ativo=None):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in obs:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = ativo or obs[0]


def smart_uv(ob, angulo=58):
    selecionar_so([ob])
    if not ob.data.uv_layers:
        ob.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angulo), island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')


def ilhas_uv(ob):
    """ilhas = faces ligadas por arestas cujos UVs coincidem dos dois lados"""
    me = ob.data
    uv = me.uv_layers.active.data
    pai = list(range(len(me.polygons)))

    def raiz(i):
        while pai[i] != i:
            pai[i] = pai[pai[i]]
            i = pai[i]
        return i
    aresta = {}
    for p in me.polygons:
        n = p.loop_total
        for j in range(n):
            l0, l1 = p.loop_start + j, p.loop_start + (j + 1) % n
            v0, v1 = me.loops[l0].vertex_index, me.loops[l1].vertex_index
            chave = (min(v0, v1), max(v0, v1))
            u0, u1 = tuple(uv[l0].uv), tuple(uv[l1].uv)
            if v0 > v1:
                u0, u1 = u1, u0
            if chave in aresta:
                q, w0, w1 = aresta[chave]
                if abs(w0[0] - u0[0]) + abs(w0[1] - u0[1]) + abs(w1[0] - u1[0]) + abs(w1[1] - u1[1]) < 1e-5:
                    a, b = raiz(p.index), raiz(q)
                    if a != b:
                        pai[a] = b
            else:
                aresta[chave] = (p.index, u0, u1)
    grupos = {}
    for p in me.polygons:
        grupos.setdefault(raiz(p.index), []).append(p.index)
    return list(grupos.values())


def preparar_ilhas(obs):
    """normaliza cada ilha para metros x densidade; devolve lista de ilhas (ob, loops, uv locais, w, h)"""
    ilhas = []
    for ob in obs:
        me = ob.data
        uv = me.uv_layers.active.data
        lay = me.attributes["peca"].data
        for faces in ilhas_uv(ob):
            a3 = sum(me.polygons[f].area for f in faces)
            loops = [l for f in faces for l in me.polygons[f].loop_indices]
            pts = np.array([uv[l].uv[:] for l in loops], float)
            auv = 0.0
            for f in faces:
                p = me.polygons[f]
                q = np.array([uv[l].uv[:] for l in p.loop_indices])
                x, y = q[:, 0], q[:, 1]
                auv += 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))
            if a3 < 1e-9 or auv < 1e-12:
                continue
            dens, peso = 0.0, 0.0
            for f in faces:
                p = me.polygons[f]
                dens += DENSIDADE.get(PECAS[lay[f].value], 1.0) * p.area
                peso += p.area
            dens /= peso
            pts = (pts - pts.min(0)) * math.sqrt(a3 / auv) * dens
            w, h = pts.max(0)
            if h > w * 1.15:                       # deita ilhas altas (prateleiras rendem mais): gira 90 graus
                pts = np.stack([pts[:, 1], w - pts[:, 0]], 1)
                w, h = pts.max(0)
            ilhas.append(dict(ob=ob, loops=loops, pts=pts, w=float(w), h=float(h)))
    return ilhas


def _skyline(ilhas, esc, px, m):
    """empacotamento skyline (canto de baixo a esquerda) com rotacao de 90 graus; None se nao couber"""
    linha = [[0, 0, px]]
    pos = []
    for il in ilhas:
        melhor = None
        for rot in (False, True):
            w = (il["h"] if rot else il["w"]) * esc + m
            h = (il["w"] if rot else il["h"]) * esc + m
            if w > px:
                continue
            for i in range(len(linha)):
                x = linha[i][0]
                if x + w > px:
                    break
                y, j, resto = 0, i, w
                while resto > 0:
                    y = max(y, linha[j][1])
                    resto -= linha[j][2]
                    j += 1
                if y + h > px:
                    continue
                if melhor is None or (y + h, x) < (melhor[0], melhor[1]):
                    melhor = (y + h, x, y, w, h, rot, i)
        if melhor is None:
            return None
        topo, x, y, w, h, rot, i = melhor
        pos.append((x, y, rot))
        novo = [x, topo, w]
        fim = x + w
        nl = [s_ for s_ in linha[:i]]
        nl.append(novo)
        for s_ in linha[i:]:
            sx, sy, sw = s_
            if sx + sw <= fim:
                continue
            if sx < fim:
                nl.append([fim, sy, sx + sw - fim])
            else:
                nl.append(s_)
        linha = []
        for s_ in nl:
            if linha and linha[-1][1] == s_[1]:
                linha[-1][2] += s_[2]
            else:
                linha.append(list(s_))
    return pos


def empacotar(ilhas, px=ATLAS_PX, margem_px=MARGEM_PX):
    """procura a maior escala (pixels por metro de pintura) em que todas as ilhas cabem no atlas"""
    ordem = sorted(ilhas, key=lambda i: -max(i["h"], i["w"]) * min(i["h"], i["w"]) ** 0.5)
    lo, hi = 50.0, 4000.0
    pos = None
    for _ in range(18):
        meio = (lo + hi) / 2
        r = _skyline(ordem, meio, px, margem_px)
        if r is None:
            hi = meio
        else:
            lo, pos = meio, r
    if pos is None:
        pos = _skyline(ordem, lo, px, margem_px)
    for il, (x, y, rot) in zip(ordem, pos):
        uv = il["ob"].data.uv_layers.active.data
        p = il["pts"] * lo
        if rot:
            p = np.stack([il["h"] * lo - p[:, 1], p[:, 0]], 1)
        p = (p + np.array([x + margem_px / 2, y + margem_px / 2])) / px
        for l, q in zip(il["loops"], p):
            uv[l].uv = (float(q[0]), float(q[1]))
    return lo


def uv_atlas(objs):
    obs = [o for k, o in objs.items() if not SAIDA_DE[k].startswith(SEM_ATLAS)]
    for ob in obs:
        smart_uv(ob)
    ilhas = preparar_ilhas(obs)
    esc = empacotar(ilhas)
    print("atlas: %.0f px/m (pintura), %d ilhas em %d objetos" % (esc, len(ilhas), len(obs)))
    return esc


def uv_bau_placa(objs):
    """bau: 4 quadrantes (lado E, lado D, traseira com logo, resto liso); placa: a face de tras ocupa a textura"""
    cy = (BAU_Y0 + BAU_Y1) / 2
    hc = 0.300
    for k in ("Bau", "Bau_Tampa"):
        me = objs[k].data
        uvl = me.uv_layers.new(name="UVMap")
        for p in me.polygons:
            n = p.normal
            c = p.center
            corpo = k == "Bau" and BAU_Z0 - 1e-3 <= c.z <= BAU_Z0 + hc + 1e-3
            for li in p.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                if corpo and n.x > 0.99:
                    uv = (0.5 * (co.y - BAU_Y0) / (BAU_Y1 - BAU_Y0), 0.5 + 0.5 * (co.z - BAU_Z0) / hc)
                elif corpo and n.x < -0.99:
                    uv = (1.0 - 0.5 * (co.y - BAU_Y0) / (BAU_Y1 - BAU_Y0), 0.5 + 0.5 * (co.z - BAU_Z0) / hc)
                elif corpo and n.y > 0.99:
                    uv = (0.5 * (0.21 - co.x) / 0.42, 0.5 * (co.z - BAU_Z0) / hc)
                else:                                   # resto: canto liso (quadrante de baixo a direita)
                    uv = (0.52 + 0.46 * (co.x + 0.3) / 0.6, 0.02 + 0.46 * (co.y - 0.4) / 0.8)
                uvl.data[li].uv = (min(max(uv[0], 0.0), 1.0), min(max(uv[1], 0.0), 1.0))
    me = objs["Placa"].data
    uvl = me.uv_layers.new(name="UVMap")
    rot = Matrix.Rotation(math.radians(-14), 4, 'X').inverted()
    for p in me.polygons:
        frente = p.normal.y > 0.5
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            loc = rot @ (co - V((0, 1.068, 0.610)))
            uvl.data[li].uv = (((0.1 - loc.x) / 0.2), (loc.z + 0.085) / 0.17) if frente else (0.0, 0.0)


# ---------------------------------------------------------------- bake de dados (posicao, normal, peca, AO)
def _img_dados(nome, px):
    img = bpy.data.images.get(nome)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(nome, px, px, alpha=True, float_buffer=True, is_data=True)
    img.colorspace_settings.name = 'Non-Color'
    return img


def _mat_bake(img):
    mat = bpy.data.materials.get("TMP_bake") or bpy.data.materials.new("TMP_bake")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emi = nt.nodes.new("ShaderNodeEmission")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    att = nt.nodes.new("ShaderNodeAttribute")
    att.attribute_name, att.attribute_type = "peca", 'GEOMETRY'
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.nodes.active = tex
    nt.links.new(emi.outputs[0], out.inputs[0])
    return mat, nt, emi, geo, att


def bake_dados(objs, px=ATLAS_PX, amostras_ao=48):
    """assa no atlas: posicao (mundo), normal (mundo), id da peca e oclusao ambiente; devolve arrays numpy"""
    alvo = [o for k, o in objs.items() if not SAIDA_DE[k].startswith(SEM_ATLAS)]
    sc = bpy.context.scene
    motor_antes = sc.render.engine
    try:
        sc.render.engine = 'CYCLES'
    except TypeError as e:
        print(e)
    sc.cycles.device = 'CPU'
    sc.cycles.use_denoising = False
    sc.render.bake.margin = 4
    sc.render.bake.margin_type = 'EXTEND'
    sc.render.bake.use_clear = True
    chao = bpy.data.objects.new("TMP_chao", bpy.data.meshes.new("TMP_chao"))
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6.0)
    bm.to_mesh(chao.data)
    bm.free()
    sc.collection.objects.link(chao)
    img = _img_dados("TMP_bake_dados", px)
    mat, nt, emi, geo, att = _mat_bake(img)
    guardados = {o.name: [m for m in o.data.materials] for o in alvo}
    for o in alvo:
        o.data.materials.clear()
        o.data.materials.append(mat)
    selecionar_so(alvo)
    res = {}

    def ler():
        a = np.empty(px * px * 4, np.float32)
        img.pixels.foreach_get(a)
        return a.reshape(px, px, 4).copy()

    def ligar(saida):
        for l in list(nt.links):
            if l.to_node == emi:
                nt.links.remove(l)
        nt.links.new(saida, emi.inputs[0])

    sc.cycles.samples = 1
    vm = nt.nodes.new("ShaderNodeVectorMath")
    vm.operation = 'MULTIPLY_ADD'
    vm.inputs[1].default_value = (0.125, 0.125, 0.125)
    vm.inputs[2].default_value = (0.5, 0.5, 0.5)
    nt.links.new(geo.outputs["Position"], vm.inputs[0])
    ligar(vm.outputs[0])
    bpy.ops.object.bake(type='EMIT')
    a = ler()
    res["pos"] = a[..., :3] * 8.0 - 4.0
    res["cobre"] = a[..., 3] > 0.5
    vn = nt.nodes.new("ShaderNodeVectorMath")
    vn.operation = 'MULTIPLY_ADD'
    vn.inputs[1].default_value = (0.5, 0.5, 0.5)
    vn.inputs[2].default_value = (0.5, 0.5, 0.5)
    nt.links.new(geo.outputs["True Normal"], vn.inputs[0])
    ligar(vn.outputs[0])
    bpy.ops.object.bake(type='EMIT')
    res["nor"] = ler()[..., :3] * 2.0 - 1.0
    mm = nt.nodes.new("ShaderNodeMath")
    mm.operation = 'DIVIDE'
    mm.inputs[1].default_value = 256.0
    nt.links.new(att.outputs["Fac"], mm.inputs[0])
    ligar(mm.outputs[0])
    bpy.ops.object.bake(type='EMIT')
    res["peca"] = np.rint(ler()[..., 0] * 256.0).astype(np.int32)
    sc.cycles.samples = amostras_ao
    if sc.world is None:
        sc.world = bpy.data.worlds.new("TMP_mundo")
    sc.world.light_settings.distance = 0.30
    bpy.ops.object.bake(type='AO')
    res["ao"] = ler()[..., 0]
    for o in alvo:
        o.data.materials.clear()
        for m in guardados[o.name]:
            o.data.materials.append(m)
    bpy.data.objects.remove(chao, do_unlink=True)
    bpy.data.materials.remove(mat)
    bpy.data.images.remove(img)
    try:
        sc.render.engine = motor_antes
    except TypeError:
        pass
    return res


# ---------------------------------------------------------------- rig
def ossos_da_moto():
    cima = V((0, 0, 1))
    c_pn, n_pn = PAINEL
    ossos = []   # nome, cabeca, cauda, pai, deforma

    def osso(nome, cab, cau, pai, deforma=True):
        ossos.append((nome, V(cab), V(cau), pai, deforma))
    osso("raiz", (0, 0, 0), (0, 0, 0.25), None)
    osso("chassi", (0, 0, 0.55), (0, 0, 0.80), "raiz")
    osso("direcao", eixo(0.60), eixo(0.85), "chassi")
    osso("suspensao_diant", eixo(0.0), eixo(0.20), "direcao")
    osso("roda_dianteira", (0, YF, ZC), (0, YF, ZC + 0.12), "suspensao_diant")
    osso("balanca", PIVO_BAL, PIVO_BAL + V((0, 0, 0.12)), "chassi")
    osso("roda_traseira", (0, YT, ZC), (0, YT, ZC + 0.12), "balanca")
    osso("descanso", PIVO_DESC, PIVO_DESC + V((0, 0, 0.08)), "chassi")
    osso("manete_freio", (-0.150, -0.318, 1.020), (-0.150, -0.318, 1.060), "direcao")
    osso("manete_embreagem", (0.150, -0.318, 1.020), (0.150, -0.318, 1.060), "direcao")
    osso("punho_acelerador", (-0.160, -0.287, 1.011), (-0.280, -0.242, 1.030), "direcao")
    osso("ponteiro_velocimetro", c_pn + n_pn * 0.0055, c_pn + n_pn * 0.035, "direcao")
    zt = BAU_Z0 + 0.300
    osso("bau", (0, (BAU_Y0 + BAU_Y1) / 2, BAU_Z0), (0, (BAU_Y0 + BAU_Y1) / 2, BAU_Z0 + 0.12), "chassi")
    osso("bau_tampa", (0, BAU_Y1, zt), (0, BAU_Y1, zt + 0.08), "bau")
    # pontos de encaixe (sem deformacao, apontando para cima = rotacao identidade no glTF)
    pontos = {
        "ponto_piloto": ("chassi", (0, 0.300, 0.806)),
        "ponto_garupa": ("chassi", (0, 0.480, 0.810)),
        "ponto_mao_E": ("direcao", (0.215, -0.274, 1.017)),
        "ponto_mao_D": ("direcao", (-0.215, -0.274, 1.017)),
        "ponto_pe_E": ("chassi", (0.205, 0.100, 0.385)),
        "ponto_pe_D": ("chassi", (-0.205, 0.100, 0.385)),
        "ponto_pe_garupa_E": ("chassi", (0.205, 0.500, 0.417)),
        "ponto_pe_garupa_D": ("chassi", (-0.205, 0.500, 0.417)),
        "ponto_farol": ("direcao", (0, -0.540, 0.965)),
        "ponto_farol_alto": ("direcao", (0, -0.540, 0.975)),
        "ponto_painel": ("direcao", tuple(c_pn)),
        "ponto_seta_frente_E": ("direcao", (0.215, -0.515, 0.930)),
        "ponto_seta_frente_D": ("direcao", (-0.215, -0.515, 0.930)),
        "ponto_seta_tras_E": ("chassi", (0.100, 1.045, 0.725)),
        "ponto_seta_tras_D": ("chassi", (-0.100, 1.045, 0.725)),
        "ponto_lanterna": ("chassi", (0, 1.020, 0.775)),
        "ponto_freio": ("chassi", (0, 1.030, 0.775)),
        "ponto_luz_placa": ("chassi", (0, 1.050, 0.700)),
        "ponto_placa": ("chassi", (0, 1.072, 0.610)),
        "ponto_escapamento": ("chassi", (-0.185, 1.020, 0.410)),
        "ponto_tanque": ("chassi", (0, -0.100, 0.942)),
        "ponto_buzina": ("direcao", (0, -0.440, 0.800)),
        "ponto_motor": ("chassi", (0, 0.020, 0.420)),
        "ponto_entrega": ("bau", (0, (BAU_Y0 + BAU_Y1) / 2, zt + 0.085)),
        "ponto_descanso_chao": ("raiz", (0.31, 0.46, 0.0)),
        "ponto_contato_diant": ("raiz", (0, YF, 0.0)),
        "ponto_contato_tras": ("raiz", (0, YT, 0.0)),
        "ponto_camera": ("chassi", (0, 0.35, 1.55)),
    }
    for nome, (pai, pos) in pontos.items():
        osso(nome, pos, V(pos) + cima * 0.06, pai, False)
    return ossos


def criar_rig(col, ossos):
    arm = bpy.data.armatures.new("Moto_Rig")
    arm.display_type = 'STICK'
    rig = bpy.data.objects.new("Moto_Rig", arm)
    col.objects.link(rig)
    rig.show_in_front = True
    selecionar_so([rig])
    bpy.ops.object.mode_set(mode='EDIT')
    for nome, cabeca, cauda, pai, deforma in ossos:
        b = arm.edit_bones.new(nome)
        b.head, b.tail, b.roll = cabeca, cauda, 0.0
        b.use_deform = deforma
        if pai:
            b.parent = arm.edit_bones[pai]
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def pele(ob, osso, rig):
    ob.vertex_groups.clear()
    vg = ob.vertex_groups.new(name=osso)
    vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    mod = ob.modifiers.new("Armature", 'ARMATURE')
    mod.object = rig
    ob.parent = rig


def juntar(obs, nome, col):
    selecionar_so(obs, obs[0])
    if len(obs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = nome
    ob.data.name = nome
    return ob


# ---------------------------------------------------------------- materiais
def _no_principled(mat):
    return next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def material_textura(nome, img, cor=None, rugosidade=0.7, metal=0.0):
    mat = bpy.data.materials.get(nome)
    if mat:
        bpy.data.materials.remove(mat)
    mat = bpy.data.materials.new(nome)
    mat.use_nodes = True
    nt = mat.node_tree
    bs = _no_principled(mat)
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.location = (-600, 200)
    saida = tex.outputs[0]
    if cor is not None:                          # textura x cor (vira baseColorFactor no glTF)
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type, mix.blend_type = 'RGBA', 'MULTIPLY'
        mix.inputs[0].default_value = 1.0
        mix.location = (-300, 200)
        nt.links.new(tex.outputs[0], mix.inputs[6])
        mix.inputs[7].default_value = cor
        saida = mix.outputs[2]
    nt.links.new(saida, bs.inputs["Base Color"])
    bs.inputs["Roughness"].default_value = rugosidade
    bs.inputs["Metallic"].default_value = metal
    mat.use_backface_culling = True
    return mat


COR_LUZ = {   # cor da lente apagada; o jogo acende pelo emissive (moto_delivery.js: luz())
    "Luz_Farol": (0.86, 0.88, 0.82), "Luz_Posicao": (0.80, 0.82, 0.78), "Luz_Seta_E": (0.90, 0.50, 0.06),
    "Luz_Seta_D": (0.90, 0.50, 0.06), "Luz_Lanterna": (0.55, 0.035, 0.03), "Luz_Freio": (0.70, 0.03, 0.025)}


def material_luz(nome):
    mat = bpy.data.materials.get(nome)
    if mat:
        bpy.data.materials.remove(mat)
    mat = bpy.data.materials.new(nome)
    mat.use_nodes = True
    bs = _no_principled(mat)
    bs.inputs["Base Color"].default_value = (*COR_LUZ[nome], 1.0)
    bs.inputs["Roughness"].default_value = 0.18
    bs.inputs["Specular IOR Level" if "Specular IOR Level" in bs.inputs else "Specular"].default_value = 0.6
    mat.use_backface_culling = True
    return mat


def materiais(saidas, atlas, img_placa, img_bau):
    m_pint = material_textura("Moto_Pintura", atlas, COR_PADRAO, 0.38)
    m_atlas = material_textura("Moto_Atlas", atlas, None, 0.62)
    for nome, ob in saidas.items():
        me = ob.data
        me.materials.clear()
        if nome == "Moto":
            me.materials.append(m_pint)
            me.materials.append(m_atlas)
            lay = me.attributes["peca"].data
            ids = {PID[n] for n in PINTURA}
            me.polygons.foreach_set("material_index", [0 if lay[p.index].value in ids else 1 for p in me.polygons])
        elif nome == "Moto_Placa":
            me.materials.append(material_textura("Moto_Placa", img_placa, None, 0.45))
        elif nome == "Moto_Bau":
            me.materials.append(material_textura("Moto_Bau", img_bau, None, 0.5))
        else:
            me.materials.append(material_luz(nome))


def colisao(fontes, col):
    """casco convexo da moto (sem espelhos), reduzido para fisica"""
    bm = bmesh.new()
    for ob in fontes:
        for v in ob.data.vertices:
            bm.verts.new(ob.matrix_world @ v.co)
    bmesh.ops.convex_hull(bm, input=bm.verts[:])
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    me = bpy.data.meshes.new("Moto_Colisao")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("Moto_Colisao", me)
    col.objects.link(ob)
    mod = ob.modifiers.new("reduz", 'DECIMATE')
    mod.ratio = 0.2
    dg = bpy.context.evaluated_depsgraph_get()
    novo = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    velho = ob.data
    ob.data = novo
    bpy.data.meshes.remove(velho)
    novo.name = "Moto_Colisao"
    novo.materials.clear()
    return ob


def exportar(objs, caminho):
    selecionar_so(objs)
    bpy.ops.export_scene.gltf(filepath=caminho, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=False, export_animations=False, export_skins=True, export_def_bones=False,
                              export_image_format='JPEG', export_jpeg_quality=90, export_image_quality=90,
                              export_normals=True, export_texcoords=True, export_tangents=False, export_extras=False,
                              export_materials='EXPORT', export_rest_position_armature=True)
    for o in objs:
        o.select_set(False)
    print("exportado", caminho, os.path.getsize(caminho) // 1024, "KB")


def salvar_png(rgb, caminho, nome):
    h, w = rgb.shape[:2]
    img = bpy.data.images.get(nome)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(nome, w, h, alpha=False)
    rgba = np.ones((h, w, 4), np.float32)
    rgba[..., :3] = np.clip(rgb, 0, 1)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = caminho
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def carregar_img(caminho, nome):
    img = bpy.data.images.get(nome)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.load(caminho)
    img.name = nome
    return img


def montar_rig_e_saidas(col, atlas, img_placa, img_bau):
    rig = criar_rig(col, ossos_da_moto())
    for chave, ob in OBJS.items():
        pele(ob, OSSO_DE[chave], rig)
    grupos = {}
    for chave, ob in OBJS.items():
        grupos.setdefault(SAIDA_DE[chave], []).append(ob)
    saidas = {nome: juntar(obs, nome, col) for nome, obs in grupos.items()}
    materiais(saidas, atlas, img_placa, img_bau)
    for ob in saidas.values():
        for mod in ob.modifiers:
            if mod.type == 'ARMATURE':
                mod.object = rig
        if ob.parent != rig:
            ob.parent = rig
    return rig, saidas


if not globals().get("SO_FUNCOES"):
    import importlib
    if SCRIPTS not in sys.path:
        sys.path.insert(0, SCRIPTS)
    import moto_textura
    importlib.reload(moto_textura)
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    limpar()
    os.makedirs(SAIDA, exist_ok=True)
    COL = colecao("Moto_Delivery")
    PAINEL = montar_geometria()
    suavizar(OBJS.values())
    uv_atlas(OBJS)
    uv_bau_placa(OBJS)
    for g, ob in OBJS.items():
        print("  %-22s %5d faces" % (g, len(ob.data.polygons)))
    ATLAS_PNG = os.path.join(SAIDA, "moto_atlas.png")
    PLACA_PNG = os.path.join(SAIDA, "moto_placa.png")
    BAU_PNG = os.path.join(SAIDA, "moto_bau.png")
    if ("--exportar" in ARGS and "--sem-bake" not in ARGS) or globals().get("ASSAR") or not os.path.exists(ATLAS_PNG):
        R = bake_dados(OBJS, ATLAS_PX, 64 if "--exportar" in ARGS else globals().get("AMOSTRAS_AO", 64))
        if globals().get("GUARDAR_BAKE"):
            np.savez_compressed(GUARDAR_BAKE, **R)
        salvar_png(moto_textura.pintar_atlas(R, PECAS), ATLAS_PNG, "moto_atlas_tmp")
        salvar_png(moto_textura.placa()[::-1], PLACA_PNG, "moto_placa_tmp")
        salvar_png(moto_textura.textura_bau(LOGO)[::-1], BAU_PNG, "moto_bau_tmp")
    ATLAS = carregar_img(ATLAS_PNG, "moto_atlas")
    PLACA = carregar_img(PLACA_PNG, "moto_placa")
    BAU = carregar_img(BAU_PNG, "moto_bau")
    COL_COLI = colecao("Moto_Colisao")
    COLI = colisao([OBJS[k] for k in ("Tanque", "Banco", "Rabeta", "Motor", "Roda_Dianteira", "Roda_Traseira", "Bau",
                                      "Bau_Tampa", "Paralama_Diant", "Paralama_Tras", "Escapamento", "Farol_Casco",
                                      "Guidao")], COL_COLI)
    RIG, SAIDAS_OBS = montar_rig_e_saidas(COL, ATLAS, PLACA, BAU)
    tri = sum(len(p.vertices) - 2 for ob in SAIDAS_OBS.values() for p in ob.data.polygons)
    print("triangulos:", tri, "| colisao:", sum(len(p.vertices) - 2 for p in COLI.data.polygons))
    if "--exportar" in ARGS or globals().get("EXPORTAR"):
        exportar([RIG] + list(SAIDAS_OBS.values()), os.path.join(SAIDA, "moto_delivery.glb"))
        exportar([COLI], os.path.join(SAIDA, "moto_delivery_colisao.glb"))
        os.makedirs(os.path.dirname(BLEND_COPIA), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=BLEND_COPIA, copy=True)
        print("copia", BLEND_COPIA)
