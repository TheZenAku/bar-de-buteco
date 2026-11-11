# 81p_props_fabrica.py - modulo do 81_empresa_brasil.py (executado no MESMO namespace dele: usa K, M, col, marcador, FZ, ...).
# Equipamentos detalhados da fabrica EMPRESA BRASIL (rodada 2, 10/11/2026, a pedido do usuario: "muito low poly"):
#   kit: K.bloco (caixa chanfrada), K.prisma (extrusao de poligono), K.aletado (motor com aletas), K.toro, K.cuba (bacia
#        superelipse oca), K.placa_t (regioes do eb_telas.png)
#   props: paleteira, empilhadeira patolada, balanca com indicador, lavatorio sanitario, compressor de pistao, bomba sanitaria,
#          bomba de alta pressao triplex, quadros eletricos (QGBT e CCM), console de controle com monitores, cadeira,
#          porta-paletes (estoque de materia-prima), tanques abertos com tampa bipartida, interior e agitador, ensacadeira
#          completa, cerca eletrica.
# Pecas moveis do jogo (agitador que gira, nivel da emulsao) vao para a colecao EB_Empresa_Brasil_DINAMICO (fora do setor;
# exportadas pelo 81b).
import bpy, bmesh, math, json
from mathutils import Vector as V, Matrix

REGT = CAT.get("telas", {})
COR = lambda n: "EB_Paleta#" + n
LUZ = lambda n: "EB_Paleta_Luz#" + n
CD = colecao("EB_Empresa_Brasil_DINAMICO", None)


# =============================================================================== kit
def _injetar(s, tb, m, mats=None):
    vmap = {v: s.bm.verts.new(v.co) for v in tb.verts}
    out = []
    for f in tb.faces:
        try: nf = s.bm.faces.new([vmap[v] for v in f.verts])
        except ValueError: continue
        nf.normal_update()
        mk = m
        if mats:
            n = nf.normal; ax = max(range(3), key=lambda i: abs(n[i]))
            if abs(n[ax]) > 0.9:
                mk = mats.get(("xyz" if n[ax] < 0 else "XYZ")[ax]) or m
        nf.material_index = s.mi(mk)
        s._uv_caixa(nf, mk)
        out.append(nf)
    tb.free()
    return out


def _bloco_m(s, Mx, m, r=0.006, seg=2, mats=None):
    tb = bmesh.new()
    bmesh.ops.create_cube(tb, size=1.0)
    bmesh.ops.transform(tb, matrix=Mx, verts=tb.verts)
    sc = Mx.to_scale()
    rr = min(r, 0.45 * min(abs(sc.x), abs(sc.y), abs(sc.z)))
    if rr > 2e-4 and seg > 0:
        try:
            bmesh.ops.bevel(tb, geom=list(tb.edges), offset=rr, offset_type="OFFSET", segments=seg, profile=0.5, affect="EDGES",
                            clamp_overlap=True)
        except TypeError:
            bmesh.ops.bevel(tb, geom=list(tb.edges), offset=rr, segments=seg, profile=0.5)
    return s._injetar(tb, m, mats)


def _bloco(s, x0, y0, z0, x1, y1, z1, m, r=0.006, seg=2, mats=None, Mpai=None):
    x0, x1 = sorted((x0, x1)); y0, y1 = sorted((y0, y1)); z0, z1 = sorted((z0, z1))
    Mx = Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)) @ Matrix.Diagonal((x1 - x0, y1 - y0, z1 - z0, 1))
    if Mpai is not None: Mx = Mpai @ Mx
    return s.bloco_m(Mx, m, r, seg, mats)


def _prisma(s, pts2d, z0, z1, Mx, m, mats=None):
    """Extrusao de um poligono simples do plano local XY (z0..z1), levado por Mx."""
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts2d, pts2d[1:] + pts2d[:1]))
    if area < 0: pts2d = list(reversed(pts2d))
    if z1 < z0: z0, z1 = z1, z0
    tb = bmesh.new()
    b = [tb.verts.new(Mx @ V((x, y, z0))) for x, y in pts2d]
    t = [tb.verts.new(Mx @ V((x, y, z1))) for x, y in pts2d]
    tb.faces.new(list(reversed(b))); tb.faces.new(t)
    n = len(pts2d)
    for i in range(n):
        j = (i + 1) % n
        tb.faces.new([b[i], b[j], t[j], t[i]])
    return s._injetar(tb, m, mats)


def _quadro(p0, eixo):
    """Matriz com Z ao longo do eixo e origem em p0."""
    z = V(eixo).normalized()
    x = V((1, 0, 0)) if abs(z.x) < 0.9 else V((0, 1, 0))
    x = (x - z * x.dot(z)).normalized(); y = z.cross(x)
    M = Matrix((x, y, z)).transposed().to_4x4(); M.translation = V(p0)
    return M


def _aletado(s, p0, p1, r, m, nf=16, h=0.012):
    """Carcaca de motor eletrico com aletas longitudinais."""
    p0, p1 = V(p0), V(p1)
    pts = []
    w = math.pi / nf * 0.42
    for k in range(nf):
        a = 2 * math.pi * k / nf
        pts += [(r * math.cos(a - w), r * math.sin(a - w)), ((r + h) * math.cos(a - w * 0.55), (r + h) * math.sin(a - w * 0.55)),
                ((r + h) * math.cos(a + w * 0.55), (r + h) * math.sin(a + w * 0.55)), (r * math.cos(a + w), r * math.sin(a + w)),
                (r * math.cos(a + math.pi / nf), r * math.sin(a + math.pi / nf))]
    return s.prisma(pts, 0.0, (p1 - p0).length, _quadro(p0, p1 - p0), m)


def _toro(s, c, eixo, R, r, m, n1=24, n2=8, arco=None, ang0=0.0):
    c = V(c); Mq = _quadro(c, eixo)
    x = Mq.col[0].xyz; y = Mq.col[1].xyz; z = Mq.col[2].xyz
    cheio = arco is None
    arco = 2 * math.pi if cheio else arco
    N1 = n1 if cheio else n1 + 1
    rings = []
    for i in range(N1):
        a = ang0 + arco * i / n1
        d = x * math.cos(a) + y * math.sin(a)
        rings.append([s.bm.verts.new(c + d * (R + r * math.cos(2 * math.pi * j / n2)) + z * (r * math.sin(2 * math.pi * j / n2)))
                      for j in range(n2)])
    fs = []
    for i in range(n1):
        A, B = rings[i], rings[(i + 1) % N1]
        for j in range(n2):
            f = s.bm.faces.new([A[j], B[j], B[(j + 1) % n2], A[(j + 1) % n2]]); fs.append(f)
    for f in fs: f.normal_update()
    a = ang0 + arco * 0.5 / n1
    cen = c + (x * math.cos(a) + y * math.sin(a)) * R
    if (fs[0].calc_center_median() - cen).dot(fs[0].normal) < 0:
        for f in fs: f.normal_flip()
    if not cheio:
        for ring, sg in ((rings[0], 1), (rings[-1], -1)):
            f = s.bm.faces.new(ring); f.normal_update(); fs.append(f)
            cc = sum((v.co for v in ring), V()) / n2
            tang = (x * -math.sin(ang0 if sg > 0 else ang0 + arco) + y * math.cos(ang0 if sg > 0 else ang0 + arco))
            if f.normal.dot(tang) * sg > 0: f.normal_flip()
    mi = s.mi(m)
    for f in fs:
        f.material_index = mi; s._uv_caixa(f, m)
    return fs


def _cuba(s, c, hx, hy, perfil, m, n=32, e=0.3, Mx=None):
    """Superficie de revolucao com secao superelipse (cuba, bacia, almofada). perfil [(r normalizado, z)]: ver K.torno para a
    orientacao. Mx (opcional) leva os pontos locais (ja somados a c) para o mundo."""
    c = V(c)
    if Mx is not None:
        _vn = s.bm.verts.new
        nv = lambda co: _vn(Mx @ V(co))
    else:
        nv = lambda co: s.bm.verts.new(co)
    sg = lambda w, ex: math.copysign(abs(w) ** ex, w)
    aneis = []
    for r, z in perfil:
        if r < 1e-6: aneis.append(("p", nv(c + V((0, 0, z)))))
        else:
            aneis.append(("r", [nv(c + V((hx * r * sg(math.cos(2 * math.pi * k / n), e), hy * r * sg(math.sin(2 * math.pi * k / n), e), z)))
                                for k in range(n)]))
    fs = []
    for (ta, a), (tb_, b) in zip(aneis, aneis[1:]):
        for i in range(n):
            j = (i + 1) % n
            if ta == "r" and tb_ == "r": q = [a[i], a[j], b[j], b[i]]
            elif ta == "p" and tb_ == "r": q = [a, b[j], b[i]]
            elif ta == "r" and tb_ == "p": q = [a[i], a[j], b]
            else: continue
            try: fs.append(s.bm.faces.new(q))
            except ValueError: pass
    mi = s.mi(m)
    for f in fs:
        f.normal_update(); f.material_index = mi; s._uv_caixa(f, m)
    return fs


def _placa_t(s, c, du, dv, w, h, nome, m="EB_Telas"):
    x0, y0, x1, y1 = REGT[nome]
    c, du, dv = V(c), V(du).normalized(), V(dv).normalized()
    pts = [c - du * w / 2 - dv * h / 2, c + du * w / 2 - dv * h / 2, c + du * w / 2 + dv * h / 2, c - du * w / 2 + dv * h / 2]
    uv = lambda u, v: ((x0 + 0.5 + (x1 - x0 - 1) * u) / 1024.0, 1.0 - (y1 - 0.5 - (y1 - y0 - 1) * v) / 1024.0)
    return s.face(pts, m, [uv(0, 0), uv(1, 0), uv(1, 1), uv(0, 1)])


K._injetar = _injetar; K.bloco_m = _bloco_m; K.bloco = _bloco; K.prisma = _prisma; K.aletado = _aletado
K.toro = _toro; K.cuba = _cuba; K.placa_t = _placa_t


# =============================================================================== ajudantes de colocacao
def malha(k, suave=50):
    o = k.fechar(suave); me = o.data; bpy.data.objects.remove(o)
    return me


def pos(nome, me, x, y, z=None, yaw=0.0, colecao_=None):
    o = bpy.data.objects.new(nome, me)
    o.location = (x, y, FZ if z is None else z); o.rotation_euler = (0, 0, math.radians(yaw))
    o["cid_etapa"] = ETAPA; o["setor"] = SETOR
    (colecao_ or CV).objects.link(o)
    return o


def W2(ox, oy, yaw, lx, ly):
    a = math.radians(yaw)
    return (ox + lx * math.cos(a) - ly * math.sin(a), oy + lx * math.sin(a) + ly * math.cos(a))


def W3(ox, oy, oz, yaw, p):
    x, y = W2(ox, oy, yaw, p[0], p[1])
    return V((x, y, oz + p[2]))


def col_local(tipo, ox, oy, yaw, lx0, ly0, lx1, ly1, z0, z1):
    cx_, cy_ = W2(ox, oy, yaw, (lx0 + lx1) / 2, (ly0 + ly1) / 2)
    return col_giro(tipo, cx_, cy_, z0, abs(lx1 - lx0), abs(ly1 - ly0), z1, math.radians(yaw))


def roda(k, c, eixo, r, larg, m_pneu, m_cubo, n=18):
    c, e = V(c), V(eixo).normalized()
    k.torno(c - e * larg / 2, e, [(r * 0.55, 0.0), (r * 0.93, 0.0), (r, larg * 0.15), (r, larg * 0.85), (r * 0.93, larg), (r * 0.55, larg)],
            n, m_pneu, False, False)
    k.cil(c - e * (larg / 2 + 0.004), c + e * (larg / 2 + 0.004), r * 0.56, m_cubo, n, True)
    k.cil(c - e * (larg / 2 + 0.012), c + e * (larg / 2 + 0.012), r * 0.18, m_cubo, 8, True)


def motor(k, p0, p1, r, m_carc, nf=16, caixa=True, plaqueta=True):
    """Motor eletrico fechado: carcaca aletada, tampa, ventoinha com grade, pes, caixa de ligacao e plaqueta."""
    p0, p1 = V(p0), V(p1); d = (p1 - p0); L = d.length; e = d.normalized()
    Mq = _quadro(p0, e); x = Mq.col[0].xyz; y = Mq.col[1].xyz
    k.aletado(p0 + e * 0.02 * L, p1 - e * 0.06 * L, r, m_carc, nf, r * 0.11)
    k.torno(p0, e, [(r * 0.35, -0.02), (r * 0.9, 0.0), (r * 1.02, 0.03 * L)], 20, m_carc, True, False)
    k.torno(p1 - e * 0.06 * L, e, [(r * 1.05, 0.0), (r * 1.06, 0.25 * L), (r * 0.95, 0.32 * L), (r * 0.5, 0.34 * L)], 20, COR("cinza_medio"), False, True)
    k.cil(p0 - e * 0.05, p0, r * 0.12, "EB_Aco_Inox", 10)                       # ponta de eixo
    for sgn in (-1, 1):                                                          # pes
        b = p0 + e * 0.25 * L
        pe = V((0, 0, -1))
        lado = e.cross(pe).normalized() * sgn
        for t in (0.2, 0.7):
            q = p0 + e * t * L
            k.viga(q + lado * r * 0.55 + pe * r * 0.6, q + lado * r * 0.85 + pe * r * 1.05, 0.03, 0.05, m_carc)
    if caixa:
        topo = p0 + e * 0.45 * L + V((0, 0, r * 1.02))
        k.bloco(topo.x - r * 0.35, topo.y - r * 0.35, topo.z - 0.01, topo.x + r * 0.35, topo.y + r * 0.35, topo.z + r * 0.45, m_carc, 0.006)
        k.cil(topo + V((0, 0, r * 0.2)) + x * r * 0.35, topo + V((0, 0, r * 0.2)) + x * r * 0.5, r * 0.07, COR("preto"), 8)
    if plaqueta and abs(e.z) < 0.5:
        nrm = -e.cross(V((0, 0, 1))).normalized()
        c = p0 + e * 0.5 * L + nrm * (r * 1.13) + V((0, 0, r * 0.1))
        k.placa_t(c, V((0, 0, 1)).cross(nrm), V((0, 0, 1)), 0.3 * L, 0.15 * L, "PLAQUETA", "EB_Telas_Fosco")


def manometro(k, c, normal, r=0.05):
    c, n = V(c), V(normal).normalized()
    k.torno(c - n * 0.03, n, [(r * 0.98, 0.0), (r, 0.025), (r * 1.05, 0.03), (r * 0.9, 0.032)], 16, "EB_Aco_Inox", True, True)
    up = V((0, 0, 1)) if abs(n.z) < 0.9 else V((0, 1, 0))
    du = up.cross(n).normalized(); dv = n.cross(du)
    k.placa_t(c + n * 0.0335, du, dv, r * 1.7, r * 1.7, "MANOMETRO", "EB_Telas_Fosco")
    k.cil(c - n * 0.03, c - n * 0.03 - up * 0.05, 0.008, "EB_Aco_Inox", 6)


def botao(k, c, n, tipo, rotulo=None):
    """Botoeira de 22 mm em painel (n = normal da porta)."""
    c, n = V(c), V(n).normalized()
    if tipo == "emergencia":
        k.cil(c, c + n * 0.004, 0.045, COR("amarelo"), 16)
        k.cil(c, c + n * 0.03, 0.016, COR("cinza_medio"), 12)
        k.torno(c + n * 0.03, n, [(0.02, 0.0), (0.03, 0.006), (0.028, 0.02), (0.0, 0.024)], 16, COR("vermelho_vivo"), True, False)
    elif tipo == "seletor":
        k.cil(c, c + n * 0.012, 0.02, COR("cinza_medio"), 12)
        k.cil(c + n * 0.012, c + n * 0.03, 0.016, COR("preto"), 12)
        up = V((0, 0, 1)) if abs(n.z) < 0.9 else V((0, 1, 0))
        k.viga(c + n * 0.03 - up * 0.014, c + n * 0.03 + up * 0.014, 0.006, 0.012, COR("preto"))
    elif tipo in ("led_verde", "led_vermelho", "led_amarelo", "led_azul", "led_branco"):
        k.cil(c, c + n * 0.012, 0.018, COR("cinza_medio"), 12)
        k.torno(c + n * 0.012, n, [(0.014, 0.0), (0.014, 0.006), (0.0, 0.01)], 12, LUZ(tipo), True, False)
    else:                                                                        # pulsador (cor)
        k.cil(c, c + n * 0.012, 0.02, COR("cinza_medio"), 12)
        k.cil(c + n * 0.008, c + n * 0.016, 0.016, COR(tipo), 12)
    if rotulo:
        up = V((0, 0, 1)) if abs(n.z) < 0.9 else V((0, 1, 0))
        du = up.cross(n).normalized()
        k.placa_t(c - up * 0.055 + n * 0.0015, du, up, 0.07, 0.018, rotulo, "EB_Telas_Fosco")


# =============================================================================== paleteira
def malha_paleteira(M):
    k = K("P_EB_Paleteira")
    V_, PR, BO = COR("vermelho"), COR("preto"), COR("poliuretano")
    for yc in (-0.19, 0.19):
        k.bloco(0.0, yc - 0.08, 0.03, 1.08, yc + 0.08, 0.085, V_, 0.008)
        k.bloco(0.0, yc - 0.075, 0.02, 1.0, yc + 0.075, 0.03, V_, 0.004)
        k.solido([V((1.08, yc - 0.08, 0.085)), V((1.08, yc + 0.08, 0.085)), V((1.08, yc - 0.08, 0.03)), V((1.08, yc + 0.08, 0.03)),
                  V((1.16, yc - 0.06, 0.05)), V((1.16, yc + 0.06, 0.05)), V((1.16, yc - 0.06, 0.03)), V((1.16, yc + 0.06, 0.03))],
                 [(0, 1, 5, 4), (2, 3, 7, 6), (0, 2, 6, 4), (1, 3, 7, 5), (4, 5, 7, 6), (0, 1, 3, 2)], V_)
        k.cil((1.12, yc - 0.05, 0.022), (1.12, yc + 0.05, 0.022), 0.018, COR("nylon"), 10)          # roletes de entrada
        for xr in (0.93, 1.03):                                                                       # roldanas de carga em tandem
            k.cil((xr, yc - 0.035, 0.04), (xr, yc + 0.035, 0.04), 0.038, BO, 14)
            k.cil((xr, yc - 0.04, 0.04), (xr, yc + 0.04, 0.04), 0.012, "EB_Aco_Galvanizado", 8)
        k.cil((0.12, yc, 0.058), (0.9, yc, 0.058), 0.007, "EB_Aco_Galvanizado", 6)                    # tirante
    k.bloco(-0.11, -0.29, 0.03, 0.06, 0.29, 0.20, V_, 0.012)
    k.bloco(-0.05, -0.27, 0.20, 0.06, 0.27, 0.215, V_, 0.004)
    k.cil((-0.17, 0, 0.09), (-0.17, 0, 0.40), 0.066, V_, 18)                                          # bomba hidraulica
    k.torno(V((-0.17, 0, 0.40)), V((0, 0, 1)), [(0.07, 0.0), (0.078, 0.01), (0.078, 0.035), (0.05, 0.05)], 18, V_, False, True)
    k.cil((-0.17, 0, 0.44), (-0.17, 0, 0.49), 0.028, "EB_Aco_Inox", 12)
    k.bloco(-0.27, -0.10, 0.06, -0.07, 0.10, 0.10, V_, 0.008)
    for yy in (-0.065, 0.065):
        roda(k, (-0.19, yy, 0.09), (0, 1, 0), 0.09, 0.05, BO, "EB_Aco_Galvanizado", 20)
    for yy in (-0.045, 0.045):                                                                         # lanca
        k.tubo([(-0.17, yy, 0.47), (-0.30, yy, 0.82), (-0.42, yy, 1.12)], 0.013, V_, 10)
    k.bloco(-0.33, -0.05, 0.86, -0.29, 0.05, 0.9, V_, 0.006)
    k.tubo([(-0.42, -0.045, 1.12), (-0.46, -0.14, 1.17), (-0.54, -0.15, 1.24), (-0.585, -0.02, 1.27), (-0.585, 0.02, 1.27),
            (-0.54, 0.15, 1.24), (-0.46, 0.14, 1.17), (-0.42, 0.045, 1.12)], 0.015, PR, 10, raio_curva=0.05)
    k.bloco(-0.47, -0.012, 1.15, -0.40, 0.012, 1.19, PR, 0.006)                                       # gatilho
    return malha(k)


# =============================================================================== empilhadeira patolada eletrica
def malha_empilhadeira(M):
    k = K("P_EB_Empilhadeira")
    AM, CI, PR = COR("amarelo"), COR("cinza_medio"), COR("preto")
    k.bloco(-1.02, -0.40, 0.09, -0.26, 0.40, 1.28, AM, 0.05, 3)
    k.bloco(-0.98, -0.36, 1.28, -0.30, 0.36, 1.34, PR, 0.02)
    k.bloco(-1.05, -0.42, 0.06, -0.24, 0.42, 0.14, PR, 0.02)                                         # para-choque de borracha
    k.bloco(-0.80, -0.30, 1.34, -0.55, 0.30, 1.42, CI, 0.015)                                         # painel
    k.placa_t(V((-0.67, -0.0, 1.4205)), (0, -1, 0), (1, 0, 0), 0.12, 0.05, "LCD_INVERSOR")
    botao(k, (-0.62, 0.18, 1.42), (0, 0, 1), "emergencia")
    k.cil((-0.62, -0.18, 1.42), (-0.62, -0.18, 1.44), 0.018, COR("latao"), 10)                       # chave
    roda(k, (-0.66, 0, 0.13), (0, 1, 0), 0.12, 0.08, COR("poliuretano"), CI, 20)
    for yy in (-0.3, 0.3):
        roda(k, (-0.9, yy, 0.06), (0, 1, 0), 0.05, 0.04, COR("nylon"), CI, 12)
    for sg in (-1, 1):                                                                                # mastro duplo
        k.bloco(-0.26, sg * 0.30, 0.10, -0.18, sg * 0.37, 2.05, CI, 0.006)
        k.bloco(-0.18, sg * 0.25, 0.12, -0.12, sg * 0.30, 1.98, CI, 0.005)
        k.cil((-0.15, sg * 0.20, 0.3), (-0.15, sg * 0.20, 1.95), 0.012, PR, 6)                        # corrente
    for zz in (0.12, 1.25, 2.0):
        k.bloco(-0.26, -0.37, zz, -0.18, 0.37, zz + 0.06, CI, 0.005)
    k.cil((-0.22, 0, 0.18), (-0.22, 0, 1.8), 0.035, "EB_Aco_Inox", 14)                              # cilindro de elevacao
    k.cil((-0.22, 0, 1.8), (-0.22, 0, 1.92), 0.045, CI, 14)
    k.bloco(-0.12, -0.36, 0.10, -0.08, 0.36, 0.60, CI, 0.005)                                         # carro porta-garfos
    for yy in (-0.33, -0.165, 0.0, 0.165, 0.33):                                                      # grade de encosto
        k.bloco(-0.115, yy - 0.012, 0.60, -0.095, yy + 0.012, 1.20, CI, 0.004)
    k.bloco(-0.115, -0.36, 1.18, -0.095, 0.36, 1.22, CI, 0.004)
    for yc in (-0.235, 0.235):
        k.bloco(-0.08, yc - 0.05, 0.10, -0.04, yc + 0.05, 0.58, CI, 0.004)
        k.bloco(-0.08, yc - 0.05, 0.10, 1.12, yc + 0.05, 0.145, CI, 0.004)
        k.solido([V((1.12, yc - 0.05, 0.145)), V((1.12, yc + 0.05, 0.145)), V((1.12, yc - 0.05, 0.10)), V((1.12, yc + 0.05, 0.10)),
                  V((1.17, yc - 0.04, 0.115)), V((1.17, yc + 0.04, 0.115)), V((1.17, yc - 0.04, 0.10)), V((1.17, yc + 0.04, 0.10))],
                 [(0, 1, 5, 4), (2, 3, 7, 6), (0, 2, 6, 4), (1, 3, 7, 5), (4, 5, 7, 6), (0, 1, 3, 2)], CI)
    for yc in (-0.56, 0.56):                                                                          # patolas
        k.bloco(-0.30, yc - 0.06, 0.02, 1.0, yc + 0.06, 0.11, AM, 0.012)
        roda(k, (0.88, yc, 0.045), (0, 1, 0), 0.045, 0.06, COR("poliuretano"), CI, 12)
    k.tubo([(-1.0, 0, 1.0), (-1.18, 0, 1.06), (-1.38, 0, 1.02)], 0.03, CI, 10)                      # timao
    k.bloco(-1.46, -0.17, 0.96, -1.36, 0.17, 1.08, PR, 0.025)
    for yy in (-0.2, 0.2):
        k.tubo([(-1.40, yy * 0.8, 1.02), (-1.42, yy, 1.02), (-1.36, yy * 1.05, 1.03)], 0.018, PR, 8)
    botao(k, (-1.46, 0.0, 1.06), (-1, 0, 0), "led_vermelho")
    return malha(k)


# =============================================================================== balanca de plataforma
def malha_balanca(M):
    k = K("P_EB_Balanca")
    IN = "EB_Aco_Inox"
    k.bloco(-0.6, -0.6, 0.02, 0.6, 0.6, 0.09, IN, 0.01)
    k.bloco(-0.588, -0.588, 0.09, 0.588, 0.588, 0.097, M["xadrez"], 0.002)
    for sx in (-1, 1):
        for sy in (-1, 1):
            k.cil((sx * 0.52, sy * 0.52, 0.0), (sx * 0.52, sy * 0.52, 0.012), 0.045, COR("borracha"), 12)
            k.cil((sx * 0.52, sy * 0.52, 0.012), (sx * 0.52, sy * 0.52, 0.03), 0.022, "EB_Aco_Galvanizado", 10)
    k.solido([V((-0.6, -0.6, 0.097)), V((-0.6, 0.6, 0.097)), V((-0.6, -0.6, 0.0)), V((-0.6, 0.6, 0.0)),
              V((-1.05, -0.6, 0.0)), V((-1.05, 0.6, 0.0))], [(0, 1, 5, 4), (0, 2, 4), (1, 5, 3), (2, 3, 5, 4), (0, 1, 3, 2)], M["xadrez"])
    k.bloco(0.6, 0.38, 0.03, 0.66, 0.46, 0.08, COR("grafite"), 0.005)                                # caixa de juncao
    k.tubo([(0.66, 0.42, 0.05), (0.78, 0.45, 0.01), (0.83, 0.5, 0.01), (0.83, 0.5, 0.9)], 0.006, COR("preto"), 6)
    k.bloco(0.75, 0.4, 0.0, 0.95, 0.6, 0.012, COR("cinza_claro"), 0.004)
    k.bloco(0.82, 0.47, 0.012, 0.88, 0.53, 1.02, COR("cinza_claro"), 0.008)
    k.bloco(0.80, 0.46, 1.02, 0.86, 0.54, 1.05, COR("cinza_claro"), 0.004)                           # suporte
    k.bloco(0.70, 0.36, 1.03, 0.82, 0.64, 1.24, IN, 0.018, 3)                                        # indicador
    k.bloco(0.695, 0.38, 1.16, 0.70, 0.62, 1.22, COR("tela_off"), 0.002)
    k.placa_t(V((0.6945, 0.5, 1.19)), (0, -1, 0), (0, 0, 1), 0.22, 0.055, "LCD_BALANCA")
    k.placa_t(V((0.6995, 0.5, 1.09)), (0, -1, 0), (0, 0, 1), 0.11, 0.09, "TECLADO_NUM", "EB_Telas_Fosco")
    for yy in (0.40, 0.60):
        botao(k, (0.70, yy, 1.08), (-1, 0, 0), "led_verde" if yy < 0.5 else "led_amarelo")
    return malha(k)


# =============================================================================== lavatorio sanitario (parede em +y, frente para -y)
def malha_lavatorio(M):
    k = K("P_EB_Lavatorio")
    IN = "EB_Aco_Inox"
    k.cuba(V((0, -0.24, 0.0)), 0.30, 0.21,
           [(0.0, 0.66), (0.82, 0.66), (0.96, 0.68), (1.0, 0.72), (1.0, 0.86), (1.07, 0.88), (1.07, 0.895), (0.95, 0.895),
            (0.93, 0.875), (0.89, 0.72), (0.80, 0.69), (0.0, 0.685)], IN, 36, 0.28)
    k.bloco(-0.33, -0.02, 0.86, 0.33, 0.0, 1.22, IN, 0.005)
    for xx in (-0.22, 0.22):                                                                          # maos-francesas
        k.prisma([(0.0, 0.66), (-0.36, 0.66), (0.0, 0.36)], -0.006, 0.006, Matrix(((0, 0, 1, xx), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1))), IN)
    k.cil((0, -0.06, 0.895), (0, -0.06, 0.935), 0.024, IN, 14)
    k.tubo([(0, -0.06, 0.93), (0, -0.06, 1.17), (0, -0.15, 1.25), (0, -0.25, 1.21), (0, -0.27, 1.10)], 0.011, IN, 12, raio_curva=0.08)
    k.cil((0, -0.27, 1.10), (0, -0.27, 1.075), 0.014, IN, 12)
    k.bloco(-0.13, -0.42, 0.0, 0.13, -0.18, 0.02, IN, 0.006)                                          # pedal
    k.bloco(-0.11, -0.40, 0.02, 0.11, -0.22, 0.065, COR("preto"), 0.01)
    k.tubo([(0.0, -0.20, 0.04), (0.0, -0.05, 0.05), (0.0, -0.03, 0.62)], 0.008, IN, 8)
    k.tubo([(0, -0.24, 0.66), (0, -0.24, 0.44), (0, -0.14, 0.40), (0, -0.10, 0.48), (0, -0.0, 0.48)], 0.02, COR("cinza_claro"), 12, raio_curva=0.05)
    k.bloco(0.38, -0.11, 1.10, 0.50, 0.0, 1.33, COR("branco"), 0.015)                                # saboneteira
    k.bloco(0.405, -0.112, 1.17, 0.475, -0.11, 1.30, COR("tela_off"), 0.002)
    k.bloco(0.41, -0.12, 1.12, 0.47, -0.09, 1.15, COR("cinza_medio"), 0.006)
    k.bloco(-0.64, -0.14, 1.00, -0.38, 0.0, 1.40, COR("branco"), 0.02, 3)                             # papel toalha
    k.bloco(-0.60, -0.142, 1.02, -0.42, -0.13, 1.035, COR("preto"), 0.003)
    k.torno(V((-0.52, -0.30, 0.0)), V((0, 0, 1)), [(0.15, 0.0), (0.16, 0.02), (0.16, 0.48), (0.165, 0.5)], 20, IN, True, False)   # lixeira
    k.torno(V((-0.52, -0.30, 0.5)), V((0, 0, 1)), [(0.168, 0.0), (0.168, 0.02), (0.12, 0.05), (0.0, 0.06)], 20, IN, False, False)
    k.bloco(-0.58, -0.50, 0.01, -0.46, -0.43, 0.04, COR("preto"), 0.008)
    k.placa((0, -0.003, 1.55), (1, 0, 0), (0, 0, 1), 0.36, 0.36, "LAVE")
    return malha(k)


# =============================================================================== compressor de pistao (eixo do reservatorio em x)
def compressor(M, cx, cy, yaw=0.0):
    k = K("EB_Compressor_CP501")
    R = lambda p: W3(cx, cy, FZ, yaw, p)
    VE, PR, GR = COR("vermelho_vivo"), COR("preto"), COR("grafite")
    eixo = V(W3(0, 0, 0, yaw, (1, 0, 0)))
    k.torno(R((-0.9, 0, 0.55)), eixo, [(0.0, 0.0), (0.13, 0.01), (0.23, 0.04), (0.29, 0.09), (0.32, 0.16), (0.32, 1.64), (0.29, 1.71),
                                      (0.23, 1.76), (0.13, 1.79), (0.0, 1.80)], 28, VE, False, False)
    for xx in (-0.74, 0.74):
        k.toro(R((xx, 0, 0.55)), eixo, 0.321, 0.006, VE, 28, 5)
    for xx in (-0.6, 0.6):
        for yy in (-1, 1):
            k.viga(R((xx, yy * 0.17, 0.33)), R((xx, yy * 0.26, 0.02)), 0.05, 0.012, VE)
            k.cil(R((xx, yy * 0.26, 0.0)), R((xx, yy * 0.26, 0.02)), 0.04, COR("borracha"), 10)
    k.bloco_m(Matrix.Translation(R((0.0, 0, 0.868))) @ Matrix.Rotation(math.radians(yaw), 4, "Z") @ Matrix.Diagonal((1.1, 0.5, 0.016, 1)), VE, 0.004)
    for xx in (-0.45, 0.45):
        k.bloco_m(Matrix.Translation(R((xx, 0, 0.845))) @ Matrix.Rotation(math.radians(yaw), 4, "Z") @ Matrix.Diagonal((0.06, 0.4, 0.04, 1)), VE, 0.004)
    # unidade compressora em V (2 cilindros aletados)
    base = V(R((-0.25, 0, 0.876)))
    rot = Matrix.Rotation(math.radians(yaw), 4, "Z")
    k.bloco_m(Matrix.Translation(base + V((0, 0, 0.1))) @ rot @ Matrix.Diagonal((0.40, 0.30, 0.20, 1)), GR, 0.025, 3)
    for sg in (-1, 1):
        d = V(W3(0, 0, 0, yaw, (math.sin(math.radians(32)) * sg, 0, math.cos(math.radians(32)))))
        p = base + V((0, 0, 0.17)) + V(W3(0, 0, 0, yaw, (sg * 0.07, 0, 0)))
        k.cil(p, p + d * 0.24, 0.07, GR, 16)
        for i in range(7):
            q = p + d * (0.05 + i * 0.026)
            k.cil(q, q + d * 0.008, 0.108, GR, 16)
        Mh = _quadro(p + d * 0.27, d)
        k.bloco_m(Mh @ Matrix.Diagonal((0.2, 0.18, 0.06, 1)), PR, 0.012)
        k.tubo([p + d * 0.27 + V(W3(0, 0, 0, yaw, (0, 0.11, 0))), V(R((-0.25 + sg * 0.32, 0.18, 1.18))), V(R((-0.25 + sg * 0.5, 0.18, 0.95))),
                V(R((-0.25 + sg * 0.5, 0.18, 0.87)))], 0.012, COR("cobre"), 8, raio_curva=0.06)
    # volante + polia do motor + correia, protetor de correia (lado -y)
    vc = V(R((-0.25, -0.22, 1.0))); ey = V(W3(0, 0, 0, yaw, (0, 1, 0)))
    k.toro(vc, ey, 0.17, 0.022, GR, 24, 6)
    for i in range(5):
        a = 2 * math.pi * i / 5
        dd = V(W3(0, 0, 0, yaw, (math.cos(a), 0, math.sin(a))))
        k.viga(vc + dd * 0.04, vc + dd * 0.155, 0.018, 0.03, GR)
    k.cil(vc - ey * 0.03, vc + ey * 0.03, 0.045, GR, 12)
    pm = V(R((0.35, -0.22, 1.0)))
    k.cil(pm - ey * 0.025, pm + ey * 0.025, 0.05, "EB_Aco_Galvanizado", 14)
    for dz in (0.175, -0.175):
        k.viga(vc + V((0, 0, dz)), pm + V((0, 0, dz * 0.31)), 0.012, 0.02, PR)
    gx0, gx1 = -0.47, 0.44
    for (a, b) in (((gx0, 0.76), (gx1, 0.76)), ((gx0, 1.24), (gx1, 1.24)), ((gx0, 0.76), (gx0, 1.24)), ((gx1, 0.76), (gx1, 1.24))):
        k.viga(R((a[0], -0.27, a[1])), R((b[0], -0.27, b[1])), 0.02, 0.02, VE)
    k.face([R((gx0, -0.28, 0.77)), R((gx1, -0.28, 0.77)), R((gx1, -0.28, 1.23)), R((gx0, -0.28, 1.23))], M["grade"])
    k.face([R((gx0, -0.20, 1.23)), R((gx1, -0.20, 1.23)), R((gx1, -0.20, 0.77)), R((gx0, -0.20, 0.77))], M["grade"])
    k.bloco_m(Matrix.Translation(R((-0.015, -0.235, 1.245))) @ rot @ Matrix.Diagonal((0.91, 0.09, 0.012, 1)), VE, 0.003)
    motor(k, R((0.17, 0.0, 1.0)), R((0.62, 0.0, 1.0)), 0.13, COR("azul_motor"), 18)
    # pressostato, manometro, valvula de seguranca, dreno, saida
    k.bloco_m(Matrix.Translation(R((0.78, 0.0, 0.98))) @ rot @ Matrix.Diagonal((0.1, 0.12, 0.14, 1)), GR, 0.012)
    k.bloco_m(Matrix.Translation(R((0.78, 0.0, 1.06))) @ rot @ Matrix.Diagonal((0.05, 0.03, 0.04, 1)), COR("vermelho_vivo"), 0.006)
    manometro(k, R((0.78, -0.09, 0.96)), W3(0, 0, 0, yaw, (0, -1, 0)), 0.045)
    k.cil(R((0.6, 0.12, 0.87)), R((0.6, 0.12, 0.96)), 0.016, COR("latao"), 10)
    k.cil(R((0.6, 0.12, 0.96)), R((0.6, 0.12, 0.99)), 0.024, COR("latao"), 10)
    k.cil(R((0.0, 0, 0.23)), R((0.0, 0, 0.16)), 0.015, COR("latao"), 8)
    k.bloco_m(Matrix.Translation(R((0.03, 0, 0.15))) @ rot @ Matrix.Diagonal((0.06, 0.012, 0.012, 1)), COR("vermelho"), 0.004)
    k.tubo([R((0.9, 0, 0.55)), R((0.98, 0, 0.55)), R((0.98, 0, 1.0))], 0.022, "EB_Aco_Galvanizado", 10)
    k.cil(R((0.98, 0, 0.74)), R((0.98, 0, 0.8)), 0.035, COR("latao"), 10)
    k.placa_t(R((0.0, -0.3215, 0.62)), W3(0, 0, 0, yaw, (1, 0, 0)), (0, 0, 1), 0.5, 0.083, "ETQ_CP", "EB_Telas_Fosco")
    k.fechar(50)
    col_local("EB_Equipamento", cx, cy, yaw, -1.0, -0.35, 1.05, 0.35, 0.15, 1.3)
    return V(R((0.98, 0, 1.0)))


# =============================================================================== bomba centrifuga sanitaria (eixo +x: rotor; entrada axial em +x)
def bomba_sanitaria(k, ox, oy, yaw):
    R = lambda p: W3(ox, oy, FZ, yaw, p)
    ex = V(W3(0, 0, 0, yaw, (1, 0, 0))); IN = "EB_Aco_Inox"
    for xx in (-0.30, -0.06):
        for yy in (-0.11, 0.11):
            k.cil(R((xx, yy, 0.0)), R((xx, yy, 0.012)), 0.035, IN, 12)
            k.cil(R((xx, yy, 0.012)), R((xx, yy, 0.06)), 0.008, "EB_Aco_Galvanizado", 6)
            k.cil(R((xx, yy, 0.06)), R((xx, yy * 0.75, 0.22)), 0.016, IN, 10)
    k.bloco_m(Matrix.Translation(R((-0.18, 0, 0.215))) @ Matrix.Rotation(math.radians(yaw), 4, "Z") @ Matrix.Diagonal((0.34, 0.2, 0.015, 1)), IN, 0.004)
    k.torno(R((-0.40, 0, 0.33)), ex, [(0.0, 0.0), (0.10, 0.006), (0.13, 0.03), (0.136, 0.06), (0.136, 0.37), (0.12, 0.40), (0.06, 0.41)], 28, IN, False, True)
    k.bloco_m(Matrix.Translation(R((-0.16, 0, 0.49))) @ Matrix.Rotation(math.radians(yaw), 4, "Z") @ Matrix.Diagonal((0.12, 0.12, 0.06, 1)), IN, 0.01)
    k.cil(R((-0.16, 0.06, 0.49)), R((-0.16, 0.09, 0.49)), 0.012, COR("preto"), 8)
    k.torno(R((0.01, 0, 0.33)), ex, [(0.10, 0.0), (0.085, 0.03), (0.07, 0.09)], 20, IN, True, False)
    k.torno(R((0.10, 0, 0.33)), ex, [(0.06, 0.0), (0.15, 0.004), (0.168, 0.02), (0.168, 0.075), (0.15, 0.09), (0.07, 0.095)], 32, IN, True, True)
    k.toro(R((0.155, 0, 0.33)), ex, 0.17, 0.008, IN, 32, 6)
    k.cil(R((0.19, 0, 0.33)), R((0.34, 0, 0.33)), 0.038, IN, 16)
    k.cil(R((0.32, 0, 0.33)), R((0.34, 0, 0.33)), 0.05, IN, 18)
    k.toro(R((0.34, 0, 0.33)), ex, 0.052, 0.009, IN, 18, 6)
    k.cil(R((0.15, 0.0, 0.47)), R((0.15, 0.0, 0.60)), 0.035, IN, 16)
    k.cil(R((0.15, 0.0, 0.58)), R((0.15, 0.0, 0.60)), 0.048, IN, 18)
    k.toro(R((0.15, 0.0, 0.60)), (0, 0, 1), 0.05, 0.009, IN, 18, 6)
    k.placa_t(R((-0.2, -0.137, 0.33)), W3(0, 0, 0, yaw, (1, 0, 0)), (0, 0, 1), 0.2, 0.05, "ETQ_B201", "EB_Telas_Fosco")
    return V(R((0.34, 0, 0.33))), V(R((0.15, 0, 0.60)))


# =============================================================================== bomba de alta pressao triplex
def bomba_alta_pressao(M, ox, oy, yaw=0.0):
    k = K("EB_Bomba_Alta_Pressao_BAP301")
    R = lambda p: W3(ox, oy, FZ, yaw, p)
    rot = Matrix.Rotation(math.radians(yaw), 4, "Z")
    B = lambda c, s, m, r=0.006, seg=2: k.bloco_m(Matrix.Translation(R(c)) @ rot @ Matrix.Diagonal((*s, 1)), m, r, seg)
    CI, AZ, IN = COR("cinza_medio"), COR("azul_claro"), "EB_Aco_Inox"
    for yy in (-0.3, 0.3):
        B((-0.18, yy, 0.06), (1.56, 0.08, 0.12), CI, 0.004)
    for xx in (-0.92, 0.56):
        B((xx, 0, 0.06), (0.08, 0.6, 0.12), CI, 0.004)
    B((-0.18, 0, 0.125), (1.56, 0.68, 0.01), CI, 0.003)
    for xx in (-0.92, 0.56):
        for yy in (-0.3, 0.3):
            k.cil(R((xx, yy, 0.0)), R((xx, yy, 0.01)), 0.05, COR("borracha"), 10)
    motor(k, R((-0.43, 0.0, 0.33)), R((-0.90, 0.0, 0.33)), 0.15, COR("azul_motor"), 20)
    B((-0.335, 0, 0.30), (0.16, 0.34, 0.3), COR("amarelo"), 0.04, 3)                                    # protecao do acoplamento
    B((-0.335, -0.171, 0.30), (0.1, 0.002, 0.2), M["grade"], 0.0, 0)
    B((-0.05, 0, 0.33), (0.40, 0.44, 0.40), AZ, 0.035, 3)                                              # carter
    k.cil(R((-0.05, 0, 0.53)), R((-0.05, 0, 0.58)), 0.035, COR("amarelo"), 12)                        # tampa do oleo
    k.cil(R((-0.05, -0.22, 0.28)), R((-0.05, -0.235, 0.28)), 0.03, M["vidro"], 12)                    # visor de oleo
    B((0.25, 0, 0.32), (0.2, 0.5, 0.28), IN, 0.015, 3)                                                 # cabecote (fluid end)
    for yy in (-0.15, 0.0, 0.15):
        k.cil(R((0.25, yy, 0.46)), R((0.25, yy, 0.52)), 0.042, IN, 16)                                 # tampas das valvulas
        k.cil(R((0.25, yy, 0.52)), R((0.25, yy, 0.535)), 0.03, IN, 16)
        k.cil(R((0.35, yy, 0.32)), R((0.40, yy, 0.32)), 0.045, IN, 16)
        for a in range(6):
            q = V(R((0.40, yy, 0.32))) + V(W3(0, 0, 0, yaw, (0, 0.033 * math.cos(a * math.pi / 3), 0.033 * math.sin(a * math.pi / 3))))
            k.cil(q, q + V(W3(0, 0, 0, yaw, (0.012, 0, 0))), 0.006, "EB_Aco_Galvanizado", 6)
    # descarga: amortecedor de pulsacao, manometro, valvula de seguranca
    k.tubo([R((0.25, 0.0, 0.535)), R((0.25, 0.0, 0.72)), R((0.42, 0.0, 0.72)), R((0.42, 0.0, 1.0))], 0.022, IN, 10)
    k.cil(R((0.25, 0.0, 0.72)), R((0.25, 0.0, 0.80)), 0.012, IN, 8)
    k.esfera(R((0.25, 0.0, 0.88)), 0.09, "EB_Aco_Galvanizado", 18, 9)
    manometro(k, R((0.42, -0.06, 0.86)), W3(0, 0, 0, yaw, (0, -1, 0)), 0.05)
    k.cil(R((0.42, 0.0, 0.66)), R((0.52, 0.0, 0.66)), 0.018, COR("latao"), 10)
    k.cil(R((0.52, 0.0, 0.62)), R((0.52, 0.0, 0.72)), 0.026, COR("latao"), 10)
    # succao (lado +y)
    k.tubo([R((0.25, 0.25, 0.25)), R((0.25, 0.30, 0.25)), R((0.42, 0.30, 0.25))], 0.03, IN, 12)
    k.placa_t(R((-0.05, -0.2215, 0.40)), W3(0, 0, 0, yaw, (1, 0, 0)), (0, 0, 1), 0.36, 0.06, "ETQ_BAP", "EB_Telas_Fosco")
    k.fechar(50)
    col_local("EB_Equipamento", ox, oy, yaw, -0.98, -0.36, 0.6, 0.36, 0.15, 1.05)
    return V(R((0.42, 0.30, 0.25))), V(R((0.42, 0.0, 1.0)))


# =============================================================================== quadros eletricos (frente em -y, fundo em y=0)
def quadro(k, Mq, tipo):
    """Armario 1,2 x 0,5 x 2,2 m num quadro local (Mq leva o local para o mundo). tipo: 'qgbt', 'ihm', 'chave'."""
    B = lambda x0, y0, z0, x1, y1, z1, m, r=0.006, seg=2: k.bloco(x0, y0, z0, x1, y1, z1, m, r, seg, Mpai=Mq)
    P = lambda p: Mq @ V(p)
    n = (Mq.to_3x3() @ V((0, -1, 0))).normalized(); du = (Mq.to_3x3() @ V((1, 0, 0))).normalized(); up = V((0, 0, 1))
    CL, CM, PR = COR("cinza_claro"), COR("cinza_medio"), COR("preto")
    B(-0.6, -0.48, 0.0, 0.6, 0.0, 0.1, PR, 0.003)
    B(-0.6, -0.47, 0.1, 0.6, 0.0, 2.1, CL, 0.006)
    B(-0.61, -0.48, 2.1, 0.61, 0.01, 2.135, CL, 0.006)
    B(-0.004, -0.486, 0.13, 0.004, -0.47, 2.07, PR, 0.0, 0)
    for x0, x1 in ((-0.585, -0.004), (0.004, 0.585)):
        B(x0, -0.488, 0.13, x1, -0.47, 2.07, CL, 0.006)
        xh = -0.597 if x0 < 0 else 0.597
        for zz in (0.35, 1.1, 1.85):
            k.cil(P((xh, -0.48, zz - 0.04)), P((xh, -0.48, zz + 0.04)), 0.012, CM, 8)
        xm = x1 - 0.06 if x0 < 0 else x0 + 0.06
        B(xm - 0.02, -0.5, 1.0, xm + 0.02, -0.488, 1.2, PR, 0.006)                                      # base do fecho
        B(xm - 0.012, -0.515, 1.03, xm + 0.012, -0.5, 1.17, PR, 0.006)                                   # alavanca
        k.cil(P((xm, -0.5, 1.21)), P((xm, -0.515, 1.21)), 0.008, COR("latao"), 8)
        for zz in (0.32, 1.9):                                                                          # filtros de ventilacao
            xc = (x0 + x1) / 2
            B(xc - 0.12, -0.5, zz - 0.12, xc + 0.12, -0.488, zz + 0.12, CM, 0.006)
            k.placa_t(P((xc, -0.5005, zz)), du, up, 0.2, 0.2, "GRELHA", "EB_Telas_Fosco")
    xl = -0.29
    if tipo == "qgbt":
        for i, t in enumerate(("led_verde", "led_amarelo", "led_vermelho")):
            botao(k, P((xl - 0.12 + i * 0.12, -0.488, 1.62)), n, t)
        botao(k, P((xl, -0.488, 1.42)), n, "seletor")
        k.placa_t(P((0.29, -0.4885, 1.55)), du, up, 0.2, 0.2, "ALTA_TENSAO", "EB_Telas_Fosco")
        for i in range(2):                                                                              # amperimetro / voltimetro
            xm_ = xl - 0.07 + i * 0.14
            B(xm_ - 0.05, -0.5, 1.72, xm_ + 0.05, -0.488, 1.82, PR, 0.004)
            k.placa_t(P((xm_, -0.5005, 1.77)), du, up, 0.085, 0.085, "MANOMETRO", "EB_Telas_Fosco")
    elif tipo == "ihm":
        B(xl - 0.17, -0.5, 1.38, xl + 0.17, -0.488, 1.62, PR, 0.012)
        k.placa_t(P((xl, -0.5005, 1.505)), du, up, 0.28, 0.14, "IHM_PAINEL")
        B(xl - 0.15, -0.502, 1.405, xl + 0.15, -0.5005, 1.415, CM, 0.0, 0)
        bt = (("verde_claro", "BOT_0"), ("vermelho", "BOT_1"), ("seletor", "BOT_3"), ("azul_claro", "BOT_5"))
        for i, (t, r) in enumerate(bt):
            botao(k, P((xl - 0.16 + i * 0.105, -0.488, 1.22)), n, t, r)
        botao(k, P((0.29, -0.488, 1.45)), n, "emergencia", "BOT_2")
        for i, t in enumerate(("led_verde", "led_verde", "led_amarelo", "led_vermelho", "led_azul")):
            botao(k, P((xl - 0.16 + i * 0.08, -0.488, 1.72)), n, t)
        B(0.18, -0.5, 1.68, 0.4, -0.488, 1.82, PR, 0.008)
        k.placa_t(P((0.29, -0.5005, 1.75)), du, up, 0.19, 0.06, "LCD_INVERSOR")
    elif tipo == "chave":
        B(xl - 0.11, -0.494, 1.39, xl + 0.11, -0.488, 1.61, COR("amarelo"), 0.006)
        k.cil(P((xl, -0.494, 1.5)), P((xl, -0.53, 1.5)), 0.05, COR("vermelho_vivo"), 18)
        k.bloco_m(Matrix.Translation(P((xl, -0.54, 1.5))) @ Mq.to_3x3().to_4x4() @ Matrix.Diagonal((0.17, 0.03, 0.035, 1)), COR("vermelho_vivo"), 0.01)
        k.placa_t(P((xl, -0.4945, 1.33)), du, up, 0.14, 0.035, "BOT_4", "EB_Telas_Fosco")
        k.placa_t(P((0.29, -0.4885, 1.55)), du, up, 0.2, 0.2, "ALTA_TENSAO", "EB_Telas_Fosco")
        for i, t in enumerate(("led_branco", "led_branco", "led_branco", "led_verde")):
            botao(k, P((0.17 + i * 0.08, -0.488, 1.25)), n, t)
        for i in range(3):
            xm_ = 0.18 + i * 0.11
            B(xm_ - 0.048, -0.5, 1.72, xm_ + 0.048, -0.488, 1.82, PR, 0.004)
            k.placa_t(P((xm_, -0.5005, 1.77)), du, up, 0.08, 0.08, "MANOMETRO", "EB_Telas_Fosco")


def malha_quadro(nome, tipo):
    k = K(nome)
    quadro(k, Matrix.Identity(4), tipo)
    return malha(k)


# =============================================================================== utilidades (substitui a versao do 81)
QG_X = [335.6, 336.82, 338.04, 339.26]
BALANCA = (347.9, 60.0)
PALETEIRA = (346.3, 59.1, 90.0)
EMPILHADEIRA = (339.2, 59.0, 90.0)


def utilidades(M):
    me_q = malha_quadro("P_EB_Painel_QGBT", "qgbt")
    et = K("EB_Utilidades_Etiquetas")
    for i, x in enumerate(QG_X):
        pos("EB_QGBT_%02d" % (i + 1), me_q, x, IY1, FZ)
        et.placa_t(V((x + 0.29, IY1 - 0.4905, FZ + 0.75)), (1, 0, 0), (0, 0, 1), 0.2, 0.1, "ETQ_QGBT_0%d" % (i + 1), "EB_Telas_Fosco")
        et.cil((x - 0.35, IY1 - 0.2, FZ + 2.135), (x - 0.35, IY1 - 0.2, FZ + 2.32), 0.03, "EB_Aco_Galvanizado", 10)
        et.cil((x + 0.3, IY1 - 0.2, FZ + 2.135), (x + 0.3, IY1 - 0.2, FZ + 2.32), 0.03, "EB_Aco_Galvanizado", 10)
    et.bloco(334.9, IY1 - 0.35, FZ + 2.32, 340.0, IY1 - 0.05, FZ + 2.42, "EB_Aco_Galvanizado", 0.004)          # eletrocalha
    et.bloco(334.95, IY1 - 0.33, FZ + 2.42, 335.25, IY1 - 0.07, CHORD, "EB_Aco_Galvanizado", 0.004)
    for i in range(10):
        et.bloco(335.05 + i * 0.5, IY1 - 0.36, FZ + 2.3, 335.09 + i * 0.5, IY1 - 0.04, FZ + 2.32, COR("cinza_medio"), 0.002)
    et.placa_t(V((337.43, IY1 - 0.004, 2.75)), (1, 0, 0), (0, 0, 1), 0.45, 0.45, "ALTA_TENSAO", "EB_Telas_Fosco")
    col("EB_Equipamento", 334.95, IY1 - 0.52, 0.15, 339.9, IY1, FZ + 2.14)
    # compressor (CP-501) + rede de ar
    saida = compressor(M, 342.2, 78.7, 0.0)
    et.tubo([saida, (saida.x, saida.y, 4.0), (saida.x, IY1 - 0.15, 4.0), (IX0 + 0.3, IY1 - 0.15, 4.0)], 0.025, "EB_Aco_Galvanizado", 8)
    et.fechar(50)
    # bancada de oficina com painel de ferramentas e abrigo de mangueira (81p: oficina)
    k = K("EB_Hidrante")
    oficina(M, k)
    k.fechar(50)
    # paleteira, empilhadeira e balanca
    x, y, g = PALETEIRA
    pos("EB_Paleteira", malha_paleteira(M), x, y, FZ, g)
    col_local("EB_Equipamento", x, y, g, -0.65, -0.29, 1.16, 0.29, 0.15, 0.45)
    x, y, g = EMPILHADEIRA
    pos("EB_Empilhadeira", malha_empilhadeira(M), x, y, FZ, g)
    col_local("EB_Equipamento", x, y, g, -1.47, -0.43, -0.08, 0.43, 0.15, 2.05)
    col_local("EB_Equipamento", x, y, g, -0.08, -0.62, 1.17, 0.62, 0.15, 0.6)
    marcador("Ponto_EB_Empilhadeira", x, y, FZ, g, funcao="empilhadeira patolada (guarda paletes no porta-paletes)")
    marcador("Ponto_EB_Paleteira", PALETEIRA[0], PALETEIRA[1], FZ, PALETEIRA[2], funcao="paleteira manual")
    bx, by = BALANCA
    pos("EB_Balanca", malha_balanca(M), bx, by, FZ, 0.0)
    col("Plataforma", bx - 0.6, by - 0.6, 0.15, bx + 0.6, by + 0.6, FZ + 0.097)
    col("EB_Equipamento", bx + 0.68, by + 0.34, 0.15, bx + 0.9, by + 0.66, 1.45)


# =============================================================================== porta-paletes (estoque de materia-prima) - substitui o estoque do 81
RACK = dict(x0=333.85, y0=61.05, y1=62.15, vao=2.7, n_vaos=3, niveis=(0.0, 1.55, 3.1), alt=4.4, montante=0.09)


def rack_posicoes():
    r = RACK; out = []
    x = r["x0"] + r["montante"]
    for b in range(r["n_vaos"]):
        for ni, zl in enumerate(r["niveis"]):
            for pi, dx in enumerate((0.73, r["vao"] - 0.73)):
                tipo = "MIX" if b == r["n_vaos"] - 1 else "MALTE"
                out.append(("Rack_V%dN%dP%d" % (b + 1, ni + 1, pi + 1), x + dx, (r["y0"] + r["y1"]) / 2, zl, tipo))
        x += r["vao"] + r["montante"]
    return out


def porta_paletes(M):
    r = RACK
    k = K("EB_Porta_Paletes")
    AZ, LA, AM, PR, GV = COR("azul_rack"), COR("laranja"), COR("amarelo"), COR("preto"), "EB_Aco_Galvanizado"
    xs = [r["x0"] + i * (r["vao"] + r["montante"]) for i in range(r["n_vaos"] + 1)]
    for xm in xs:
        for yy in (r["y0"], r["y1"] - 0.07):
            k.bloco(xm, yy, FZ, xm + r["montante"], yy + 0.07, FZ + r["alt"], AZ, 0.006, 1)
            k.bloco(xm - 0.03, yy - 0.03, FZ, xm + r["montante"] + 0.03, yy + 0.1, FZ + 0.008, GV, 0.0, 0)   # sapata
            for dx_ in (0.0, r["montante"]):
                k.cil((xm + dx_ + (-0.015 if dx_ == 0 else 0.015), yy + 0.035, FZ + 0.008), (xm + dx_ + (-0.015 if dx_ == 0 else 0.015), yy + 0.035, FZ + 0.03), 0.008, GV, 6)
        zz, i = FZ + 0.25, 0                                                                           # travamento da cabeceira
        while zz < FZ + r["alt"] - 0.4:
            z2 = zz + 0.6
            ya, yb = (r["y0"] + 0.07, r["y1"] - 0.07) if i % 2 == 0 else (r["y1"] - 0.07, r["y0"] + 0.07)
            k.viga((xm + 0.045, ya, zz), (xm + 0.045, yb, z2), 0.035, 0.02, AZ)
            k.viga((xm + 0.045, r["y0"] + 0.07, zz), (xm + 0.045, r["y1"] - 0.07, zz), 0.035, 0.02, AZ)
            zz = z2; i += 1
        k.bloco(xm - 0.07, r["y0"] - 0.16, FZ, xm + r["montante"] + 0.07, r["y0"] - 0.0, FZ + 0.4, AM, 0.02)   # protetor de coluna
        for j in range(3):
            k.bloco(xm - 0.072, r["y0"] - 0.162, FZ + 0.05 + j * 0.12, xm + r["montante"] + 0.072, r["y0"] - 0.05, FZ + 0.1 + j * 0.12, PR, 0.0, 0)
    for b in range(r["n_vaos"]):
        xa = xs[b] + r["montante"]; xb = xs[b + 1]
        for zl in r["niveis"][1:] + (r["alt"] - 0.15,):
            for yy in (r["y0"], r["y1"] - 0.05):
                k.bloco(xa, yy, FZ + zl - 0.12, xb, yy + 0.05, FZ + zl, LA, 0.006, 1)
                for xc in (xa, xb):
                    k.bloco(xc - 0.012 if xc == xb else xc, yy - 0.004, FZ + zl - 0.16, xc + 0.012 if xc == xa else xc, yy + 0.054, FZ + zl + 0.02, LA, 0.0, 0)
            if zl < r["alt"] - 0.2:
                for dx in (0.25, 1.2, 1.5, 2.45):                                                     # barras de apoio do palete
                    k.bloco(xa + dx - 0.02, r["y0"] + 0.05, FZ + zl - 0.03, xa + dx + 0.02, r["y1"] - 0.05, FZ + zl, GV, 0.0, 0)
                k.placa_t(V(((xa + xb) / 2, r["y0"] - 0.0015, FZ + zl - 0.06)), (1, 0, 0), (0, 0, 1), 0.16, 0.06, "ETQ_RACK", "EB_Telas_Fosco")
    # protecao de fim de corredor e faixas no piso
    for xe in (xs[0] - 0.15, xs[-1] + r["montante"] + 0.15):
        k.bloco(xe - 0.04, r["y0"] - 0.1, FZ + 0.35, xe + 0.04, r["y1"] - 0.05, FZ + 0.45, AM, 0.01)
        k.bloco(xe - 0.05, r["y0"] - 0.15, FZ, xe + 0.05, r["y0"] - 0.05, FZ + 0.5, AM, 0.012)
        k.bloco(xe - 0.05, r["y1"] - 0.15, FZ, xe + 0.05, r["y1"] - 0.05, FZ + 0.5, AM, 0.012)
    k.bloco(xs[0], r["y0"] - 0.32, FZ, xs[-1] + r["montante"], r["y0"] - 0.22, FZ + 0.003, COR("tinta_amarela"), 0.0, 0)
    k.fechar(50)
    col("EB_Equipamento", xs[0] - 0.2, r["y0"] - 0.16, 0.15, xs[-1] + r["montante"] + 0.2, r["y1"], FZ + r["alt"])


def estoque(M):
    me_pal = malha_palete(M)
    sacos = {"MALTE": malha_saco("P_EB_Saco_Malte", "SACO_MALTE", M), "MIX": malha_saco("P_EB_Saco_Mix", "SACO_MIX", M),
             "PRODUTO": malha_saco("P_EB_Saco_Produto", "SACO_PROD", M, 0.68, 0.44, 0.14)}
    porta_paletes(M)
    vagas = [(n, x, y, z, t) for n, x, y, z, t in rack_posicoes()]
    for i, (x, y) in enumerate(((355.8, 56.85), (357.1, 56.85), (358.4, 56.85), (355.8, 58.35), (357.1, 58.35), (358.4, 58.35))):
        vagas.append(("PA_%d" % (i + 1), x, y, 0.0, "PRODUTO"))
    pk = K("EB_Estoque_Marcacao")
    for nome, x, y, z, tipo in vagas:
        ob = pos("EB_Palete_" + nome, me_pal, x, y, FZ + z)
        if z == 0.0 and nome.startswith("PA_"):
            for sx in (-1, 1):
                for sy in (-1, 1):
                    cx, cy = x + sx * 0.6, y + sy * 0.7
                    pk.caixa(min(cx, cx - sx * 0.3), cy - 0.04, FZ, max(cx, cx - sx * 0.3), cy + 0.04, FZ + 0.003, M["tinta_amarela"], lados="Z")
                    pk.caixa(cx - 0.04, min(cy, cy - sy * 0.3), FZ, cx + 0.04, max(cy, cy - sy * 0.3), FZ + 0.003, M["tinta_amarela"], lados="Z")
        marcador("Ponto_EB_" + nome, x, y, FZ + z + 0.144, 0.0, tipo=tipo, capacidade=len(ARRANJO), nivel_m=round(z, 3))
        for j, (sx_, sy_, sz_, g) in enumerate(ARRANJO):
            so = bpy.data.objects.new("EB_Previa_%s_%02d" % (nome, j + 1), sacos[tipo])
            so.location = (x + sx_, y + sy_, FZ + z + sz_); so.rotation_euler = (0, 0, math.radians(g))
            so["cid_etapa"] = ETAPA
            CE.objects.link(so)
    for reg, x, y in (("MP_MALTE", 336.6, 60.2), ("MP_MIX", 341.2, 60.2), ("PA", 357.1, 57.6)):
        pk.placa((x, y, 4.9 if reg != "PA" else 3.6), (1, 0, 0), (0, 0, 1), 1.6, 0.78, reg, verso=True)
        zt = (4.9 if reg != "PA" else 3.6) + 0.39
        for dx in (-0.6, 0.6):
            pk.cil((x + dx, y, zt), (x + dx, y, CHORD), 0.005, M["preto"], 4, False)
        pk.caixa(x - 0.82, y - 0.02, zt, x + 0.82, y + 0.02, zt + 0.04, M["galv"])
    pk.fechar()
    STATS["vagas_palete"] = len(vagas)
    for tipo, me in sacos.items():
        ob = bpy.data.objects.new("EB_Prototipo_Saco_" + tipo.title(), me)
        ob["cid_etapa"] = ETAPA; ob["prototipo"] = True
        CE.objects.link(ob); ob.hide_viewport = True
    return vagas


# =============================================================================== lavatorio (dentro do preparo, parede sul)
def lavatorio(M):
    pos("EB_Lavatorio", malha_lavatorio(M), 341.6, PY0 + 0.1, FZ, 180.0)
    col("EB_Equipamento", 341.25, PY0 + 0.1, 0.15, 341.95, PY0 + 0.55, FZ + 0.95)
    col("EB_Equipamento", 341.95, PY0 + 0.15, 0.15, 342.3, PY0 + 0.6, FZ + 0.55)


# =============================================================================== tanques abertos (tampa bipartida), interior e agitador
TQ_RIM, TQ_FUNDO, TQ_DOBRA = 3.045, 1.01, 0.15            # aro superior, fundo interno (centro), linha da dobradica (m do centro)
PERFIL_INT = [(0.0, 1.01), (0.16, 1.03), (TR - 0.02, 1.36), (TR - 0.02, 3.045)]
NIVEIS_PREVIA = (0.72, 0.41, 0.88)


def raio_int(z):
    for (r0, z0), (r1, z1) in zip(PERFIL_INT, PERFIL_INT[1:]):
        if z0 <= z <= z1: return r0 + (r1 - r0) * (z - z0) / max(z1 - z0, 1e-9)
    return PERFIL_INT[-1][0]


def tabela_volume(passo=0.05):
    tab, vol, z = [], 0.0, TQ_FUNDO
    dz = 0.005
    while z < TQ_RIM - 1e-6:
        r_ = raio_int(z + dz / 2); vol += math.pi * r_ * r_ * dz; z += dz
        h = z - TQ_FUNDO
        if abs(h / passo - round(h / passo)) < 1e-6 or z >= TQ_RIM - 1e-6:
            tab.append([round(h, 3), round(raio_int(z), 4), round(vol * 1000.0, 1)])
    return tab


def segmento(R_, y_min, y_max, n=24):
    """Pontos de um segmento de circulo (x, y) com y entre y_min e y_max (CCW)."""
    a0 = math.asin(max(-1, min(1, y_min / R_))); a1 = math.asin(max(-1, min(1, y_max / R_)))
    if y_max >= R_ - 1e-9:                     # parte de cima: de a0 ate pi - a0 passando por pi/2
        ts = [a0 + (math.pi - 2 * a0) * i / n for i in range(n + 1)]
    else:                                       # parte de baixo: de pi - a1 ate 2pi + a1 passando por 3pi/2
        ts = [math.pi - a1 + (math.pi + 2 * a1) * i / n for i in range(n + 1)]
    return [(R_ * math.cos(t), R_ * math.sin(t)) for t in ts]


def tanques(M):
    tq = K("EB_Preparo_Tanques")
    IN = "EB_Aco_Inox"
    AZM = COR("azul_motor")
    me_rotor, me_liq = None, None
    for i, (cx, cy) in enumerate(TANQUES):
        # casco: camisa externa, aro enrolado e parede interna (o tanque e aberto por cima)
        tq.torno(V((cx, cy, 0.0)), V((0, 0, 1)),
                 [(0.06, 0.62), (0.06, 0.92), (0.18, 0.98), (TR, 1.32), (TR, 3.0), (TR + 0.02, 3.0), (TR + 0.025, 3.02), (TR + 0.02, TQ_RIM),
                  (TR - 0.02, TQ_RIM), (TR - 0.02, 1.36), (0.16, 1.03), (0.0, TQ_FUNDO)], 40, IN, True, False)
        for zz in (1.55, 2.1, 2.65):
            tq.toro((cx, cy, zz), (0, 0, 1), TR + 0.004, 0.012, IN, 40, 4)
        tq.toro((cx, cy, 1.33), (0, 0, 1), TR - 0.01, 0.014, IN, 40, 4)
        for ang in (45, 135, 225, 315):                                                        # pes com reforco e sapata regulavel
            a_ = math.radians(ang); px = cx + math.cos(a_) * (TR - 0.1); py = cy + math.sin(a_) * (TR - 0.1)
            tq.cil((px, py, FZ + 0.06), (px, py, 1.5), 0.045, IN, 12)
            tq.cil((px, py, FZ + 0.015), (px, py, FZ + 0.06), 0.012, "EB_Aco_Galvanizado", 8)
            tq.cil((px, py, FZ), (px, py, FZ + 0.015), 0.07, IN, 12)
            tq.prisma([(0.0, 0.0), (0.0, 0.28), (0.14, 0.28)], -0.004, 0.004,
                      Matrix.Translation((px, py, 1.22)) @ Matrix.Rotation(a_ + math.pi, 4, "Z") @ Matrix.Rotation(math.radians(90), 4, "X"), IN)
        # tampa fixa (lado norte, leva a ponte do agitador) e tampa basculante aberta (lado da plataforma)
        Rt = TR + 0.03
        tq.prisma(segmento(Rt, -TQ_DOBRA, Rt), 0.0, 0.02, Matrix.Translation((cx, cy, TQ_RIM)), IN)
        tq.toro((cx, cy, TQ_RIM + 0.01), (0, 0, 1), Rt, 0.01, IN, 32, 4, arco=math.pi + 2 * math.asin(TQ_DOBRA / Rt), ang0=-math.asin(TQ_DOBRA / Rt))
        Mab = Matrix.Translation((cx, cy - TQ_DOBRA, TQ_RIM)) @ Matrix.Rotation(math.radians(-82), 4, "X") @ Matrix.Translation((0, TQ_DOBRA, 0))
        tq.prisma(segmento(Rt, -Rt, -TQ_DOBRA - 0.01), 0.0, 0.02, Mab, IN)
        tq.tubo([Mab @ V((-0.16, -0.78, 0.02)), Mab @ V((-0.16, -0.78, 0.09)), Mab @ V((0.16, -0.78, 0.09)), Mab @ V((0.16, -0.78, 0.02))],
                0.011, IN, 8, raio_curva=0.03)
        for xx in (-0.55, 0.55):
            tq.cil((cx + xx - 0.05, cy - TQ_DOBRA, TQ_RIM + 0.025), (cx + xx + 0.05, cy - TQ_DOBRA, TQ_RIM + 0.025), 0.016, IN, 10)
        # ponte, redutor de eixo vertical e motor horizontal (motorredutor de angulo reto)
        tq.bloco(cx - Rt - 0.02, cy - 0.06, TQ_RIM + 0.02, cx + Rt + 0.02, cy + 0.20, TQ_RIM + 0.15, IN, 0.01)
        tq.cil((cx, cy, TQ_RIM + 0.15), (cx, cy, TQ_RIM + 0.22), 0.09, IN, 20)
        tq.bloco(cx - 0.17, cy - 0.12, TQ_RIM + 0.22, cx + 0.17, cy + 0.20, TQ_RIM + 0.50, AZM, 0.025, 3)
        tq.cil((cx, cy + 0.04, TQ_RIM + 0.50), (cx, cy + 0.04, TQ_RIM + 0.55), 0.06, AZM, 12)
        motor(tq, (cx + 0.17, cy + 0.04, TQ_RIM + 0.36), (cx + 0.62, cy + 0.04, TQ_RIM + 0.36), 0.115, AZM, 16, True, False)
        # interior: chicanas, bola de lavagem CIP, sonda de nivel e regua de cubicagem
        for ang in (30, 150, 270):
            a_ = math.radians(ang)
            rr = TR - 0.02 - 0.075
            Mb = Matrix.Translation((cx + math.cos(a_) * rr, cy + math.sin(a_) * rr, 2.2)) @ Matrix.Rotation(a_, 4, "Z")
            tq.bloco_m(Mb @ Matrix.Diagonal((0.10, 0.008, 1.4, 1)), IN, 0.0, 0)
            for zz in (-0.55, 0.55):
                tq.bloco_m(Mb @ Matrix.Translation((0.065, 0, zz)) @ Matrix.Diagonal((0.04, 0.02, 0.03, 1)), IN, 0.0, 0)
        tq.cil((cx + 0.55, cy + 0.45, TQ_RIM + 0.02), (cx + 0.55, cy + 0.45, 2.75), 0.016, IN, 8)
        tq.esfera((cx + 0.55, cy + 0.45, 2.70), 0.055, IN, 14, 7)
        tq.cil((cx - 0.6, cy + 0.45, TQ_RIM + 0.06), (cx - 0.6, cy + 0.45, 1.45), 0.012, IN, 8)
        tq.cil((cx - 0.6, cy + 0.45, TQ_RIM + 0.02), (cx - 0.6, cy + 0.45, TQ_RIM + 0.12), 0.04, COR("cinza_medio"), 12)
        tq.placa_t(V((cx, cy + TR - 0.032, 2.2)), (1, 0, 0), (0, 0, 1), 0.07, 1.6, "REGUA", "EB_Telas_Fosco")
        # externos: visor de nivel, termometro, placas, saida de fundo com valvula borboleta
        tq.cil((cx + TR * 0.72, cy - TR * 0.72, 1.45), (cx + TR * 0.72, cy - TR * 0.72, 2.95), 0.018, M["vidro"], 8)
        for zz in (1.45, 2.95):
            tq.tubo([(cx + TR * 0.69, cy - TR * 0.69, zz), (cx + TR * 0.72, cy - TR * 0.72, zz)], 0.012, IN, 8)
        manometro(tq, (cx - TR * 0.78, cy - TR * 0.78, 2.4), (-0.707, -0.707, 0), 0.05)
        tq.placa((cx, cy - TR - 0.012, 2.35), (1, 0, 0), (0, 0, 1), 0.42, 0.42, "T%d" % (i + 1))
        tq.placa_t(V((cx, cy - TR - 0.012, 1.95)), (1, 0, 0), (0, 0, 1), 0.42, 0.14, "ETQ_TQ%d" % (i + 1), "EB_Telas_Fosco")
        tq.tubo([(cx, cy, 0.62), (cx, cy, 0.50), (cx, 71.9, 0.50)], 0.04, IN, 12)
        tq.cil((cx - 0.06, cy + 0.42, 0.50), (cx + 0.06, cy + 0.42, 0.50), 0.075, IN, 16)
        tq.cil((cx, cy + 0.42, 0.575), (cx, cy + 0.42, 0.62), 0.012, IN, 6)
        tq.bloco(cx - 0.02, cy + 0.42 - 0.015, 0.62, cx + 0.02, cy + 0.42 + 0.17, 0.64, COR("vermelho"), 0.006)
        col("EB_Tanque", cx - TR * 0.92, cy - TR * 0.92, 0.15, cx + TR * 0.92, cy + TR * 0.92, 4.0)
        marcador("Ponto_EB_Tanque_%d" % (i + 1), cx, cy - 0.65, TQ_RIM + 0.02, 0.0, funcao="abertura de carga do tanque %d (tampa basculante)" % (i + 1))
        marcador("Ponto_EB_Tanque_%d_Operador" % (i + 1), cx, PLAT_P[1] + 0.85, PLAT_P[4], 90.0, funcao="onde o jogador fica para despejar o saco")
        # pecas moveis (colecao DINAMICO): agitador (gira em Z) e superficie da emulsao (sobe com o volume)
        if me_rotor is None:
            r = K("P_EB_Agitador", CD)
            r.cil((0, 0, 0.0), (0, 0, -1.72), 0.03, IN, 12)
            r.cil((0, 0, 0.18), (0, 0, 0.0), 0.03, IN, 12)
            r.cil((0, 0, 0.08), (0, 0, 0.13), 0.06, IN, 14)                                      # acoplamento
            for zc, rr in ((-1.60, 0.46), (-0.72, 0.38)):
                r.cil((0, 0, zc - 0.05), (0, 0, zc + 0.05), 0.055, IN, 14)
                for b in range(4):
                    a_ = math.radians(b * 90)
                    Mp = Matrix.Translation((math.cos(a_) * (0.05 + rr / 2), math.sin(a_) * (0.05 + rr / 2), zc)) @ Matrix.Rotation(a_, 4, "Z") @ Matrix.Rotation(math.radians(45), 4, "X")
                    r.bloco_m(Mp @ Matrix.Diagonal((rr, 0.09, 0.008, 1)), IN, 0.003)
            me_rotor = malha(r, 40)
            l = K("P_EB_Emulsao", CD)
            l.face([V((math.cos(2 * math.pi * j / 48), math.sin(2 * math.pi * j / 48), 0.0)) for j in range(48)], M["emulsao"])
            me_liq = malha(l, 0)
        o = pos("EB_Tanque_%d_Agitador" % (i + 1), me_rotor, cx, cy, TQ_RIM + 0.02, 15.0 * i, CD)
        o["pivo"] = "eixo Z local (girar para misturar)"
        h = NIVEIS_PREVIA[i] * (TQ_RIM - TQ_FUNDO)
        o = pos("EB_Tanque_%d_Liquido" % (i + 1), me_liq, cx, cy, TQ_FUNDO + h, 0.0, CD)
        rr = raio_int(TQ_FUNDO + h); o.scale = (rr, rr, 1.0)
        o["nivel_previa"] = NIVEIS_PREVIA[i]
    # coletor e bomba sanitaria B-201
    ent, sai = bomba_sanitaria(tq, 344.6, 71.9, 180.0)
    tq.tubo([(TANQUES[0][0], 71.9, 0.50), (ent.x + 0.02, 71.9, 0.50)], 0.045, IN, 14)
    tq.tubo([(ent.x, ent.y, 0.50), ent], 0.038, IN, 12) if abs(ent.z - 0.50) > 0.01 else None
    tq.tubo([sai, (sai.x, sai.y, 1.0), (344.95, 71.9, 1.0), (344.95, 69.05, 1.0), (344.95, 69.05, 3.6), (348.95, 69.05, 3.6)],
            0.035, IN, 12, raio_curva=0.15)
    col("EB_Equipamento", 344.2, 71.7, 0.15, 345.05, 72.1, 0.8)
    STATS["tanque_volume_L"] = tabela_volume()[-1][2]
    tq.fechar(50)


# =============================================================================== sala de controle: console, monitores, cadeira, quadros
def malha_monitor():
    """Monitor 24": tela no centro (z = 0), base em z = -0.345, frente em -y."""
    k = K("P_EB_Monitor")
    PR, PP = COR("plastico_preto"), COR("preto")
    k.bloco(-0.285, -0.018, -0.168, 0.285, 0.004, 0.168, PP, 0.006, 2)                       # moldura
    k.bloco(-0.272, -0.0185, -0.142, 0.272, -0.012, 0.158, COR("tela_off"), 0.0, 0)           # vidro da tela (rebaixo)
    k.bloco(-0.285, -0.019, -0.168, 0.285, -0.004, -0.145, PP, 0.004, 2)                      # queixo
    k.bloco_m(Matrix.Translation((0, 0.024, 0.0)) @ Matrix.Diagonal((0.50, 0.04, 0.28, 1)), PR, 0.016, 3)   # carcaca traseira
    k.bloco_m(Matrix.Translation((0, 0.05, -0.02)) @ Matrix.Diagonal((0.2, 0.03, 0.14, 1)), PR, 0.012, 2)   # placa VESA / fonte
    for i in range(6):                                                                         # ventilacao traseira
        k.bloco(-0.17 + i * 0.03, 0.044, 0.07, -0.16 + i * 0.03, 0.046, 0.12, PP, 0.0, 0)
    k.cil((-0.06, 0.066, -0.02), (0.06, 0.066, -0.02), 0.016, PR, 12)                          # articulacao
    k.bloco_m(Matrix.Translation((0, 0.075, -0.19)) @ Matrix.Rotation(math.radians(6), 4, "X") @ Matrix.Diagonal((0.065, 0.03, 0.32, 1)), PR, 0.012, 2)
    k.bloco(-0.025, 0.088, -0.30, 0.025, 0.092, -0.12, PP, 0.002, 1)                          # passa-cabo
    k.cuba(V((0, 0.05, -0.345)), 0.13, 0.10, [(0.0, 0.0), (0.96, 0.0), (1.0, 0.004), (1.0, 0.009), (0.9, 0.013), (0.25, 0.016), (0.0, 0.017)],
           PR, 28, 0.55)
    k.cil((0.24, -0.0195, -0.156), (0.24, -0.0215, -0.156), 0.003, LUZ("led_azul"), 8)
    for i in range(3):
        k.bloco(0.15 + i * 0.022, -0.0195, -0.159, 0.162 + i * 0.022, -0.017, -0.153, PR, 0.0, 0)
    return malha(k, 40)


def malha_teclado():
    """Teclado ABNT2 com teclado numerico: teclas individuais; frente (operador) em -y."""
    k = K("P_EB_Teclado")
    CORPO, TECLA = COR("grafite"), COR("plastico_preto")
    k.prisma([(-0.08, 0.0), (0.08, 0.0), (0.08, 0.026), (-0.08, 0.013)], -0.225, 0.225,
             Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1))), CORPO)
    k.bloco(-0.225, -0.08, 0.0, 0.225, 0.08, 0.004, CORPO, 0.003, 1)
    for sx in (-0.19, 0.19):
        k.bloco(sx - 0.02, 0.06, -0.006, sx + 0.02, 0.075, 0.0, COR("borracha"), 0.0, 0)
    P = 0.0188; W = 0.0165
    topo = lambda y: 0.013 + (y + 0.08) / 0.16 * 0.013
    linhas = [[1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25], [2.25] + [1] * 11 + [1.75], [1.75] + [1] * 12 + [1.25],
              [1.5] + [1] * 12 + [1.5], [1] * 13 + [2], ["f"]]
    x_ini = -0.215
    for r, lin in enumerate(linhas):
        y = -0.06 + r * 0.021 + (0.006 if r == 5 else 0)
        zt = topo(y)
        if lin == ["f"]:
            xs = [0] + [1.5 + i for i in range(4)] + [6 + i for i in range(4)] + [10.5 + i for i in range(4)]
            for u in xs:
                xa = x_ini + u * P
                k.caixa(xa, y - 0.006, zt - 0.002, xa + W, y + 0.006, zt + 0.005, TECLA, lados="xXyYZ")
        else:
            x = x_ini
            for u in lin:
                k.caixa(x + 0.001, y - 0.0082, zt - 0.002, x + u * P - 0.0016, y + 0.0082, zt + 0.006, TECLA, lados="xXyYZ")
                x += u * P
        for c in range(4 if r < 5 else 0):                                                     # numerico
            if r == 0 and c == 1: continue
            xa = 0.138 + c * P; wa = (2 * P if (r == 0 and c == 0) else P) - 0.0026
            k.caixa(xa, y - 0.0082, zt - 0.002, xa + wa, y + 0.0082, zt + 0.006, TECLA, lados="xXyYZ")
        for c in range(3 if r in (1, 3) else 0):                                               # setas / bloco de edicao
            xa = 0.074 + c * P
            k.caixa(xa, y - 0.0082, zt - 0.002, xa + W, y + 0.0082, zt + 0.006, TECLA, lados="xXyYZ")
    for i in range(3):
        k.cil((0.15 + i * 0.012, 0.07, topo(0.07) + 0.001), (0.15 + i * 0.012, 0.07, topo(0.07) + 0.002), 0.0025, LUZ("led_verde"), 6)
    k.tubo([(0.0, 0.08, 0.012), (0.0, 0.12, 0.008), (0.03, 0.2, 0.004)], 0.0025, COR("borracha"), 5)
    return malha(k, 40)


def malha_mouse():
    k = K("P_EB_Mouse")
    k.cuba(V((0, 0, 0)), 0.031, 0.058, [(0.0, 0.0), (0.9, 0.0), (1.0, 0.005), (1.0, 0.013), (0.93, 0.024), (0.74, 0.032), (0.42, 0.037), (0.0, 0.0385)],
           COR("plastico_preto"), 28, 0.6)
    k.cil((-0.0035, 0.028, 0.034), (0.0035, 0.028, 0.034), 0.0075, COR("borracha"), 12)
    k.bloco(-0.0006, 0.012, 0.031, 0.0006, 0.058, 0.04, COR("grafite"), 0.0, 0)
    k.tubo([(0.0, 0.058, 0.01), (0.0, 0.1, 0.004), (-0.02, 0.17, 0.003)], 0.0022, COR("borracha"), 5)
    return malha(k, 40)


def malha_telefone():
    """Telefone IP de mesa: corpo inclinado, teclas, display, monofone no gancho e fio espiral; frente em -y."""
    k = K("P_EB_Telefone")
    CP, TE = COR("grafite"), COR("plastico_preto")
    k.prisma([(-0.105, 0.0), (0.105, 0.0), (0.105, 0.075), (0.05, 0.082), (-0.105, 0.028)], -0.11, 0.11,
             Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1))), CP)
    k.bloco(-0.112, -0.112, 0.0, 0.112, 0.112, 0.006, TE, 0.004, 2)
    ang = math.atan2(0.082 - 0.028, 0.05 + 0.105)
    Rs = Matrix.Rotation(ang, 4, "X")
    def sup(x, y):                                                                            # ponto sobre a face inclinada
        z = 0.028 + (y + 0.105) * math.tan(ang)
        return Matrix.Translation((x, y, z)) @ Rs
    for r in range(4):
        for c in range(3):
            k.bloco_m(sup(0.035 + c * 0.024, -0.075 + r * 0.024) @ Matrix.Translation((0, 0, 0.003)) @ Matrix.Diagonal((0.018, 0.016, 0.006, 1)), TE, 0.002, 1)
    for r in range(3):
        k.bloco_m(sup(0.088, -0.07 + r * 0.03) @ Matrix.Translation((0, 0, 0.003)) @ Matrix.Diagonal((0.012, 0.02, 0.006, 1)), TE, 0.002, 1)
    k.bloco_m(sup(0.06, 0.035) @ Matrix.Translation((0, 0, 0.001)) @ Matrix.Diagonal((0.09, 0.04, 0.003, 1)), COR("tela_off"), 0.0, 0)
    k.placa_t(sup(0.06, 0.035) @ V((0, 0, 0.0031)), Rs.to_3x3() @ V((1, 0, 0)), Rs.to_3x3() @ V((0, 1, 0)), 0.088, 0.03, "LCD_TELEFONE")
    k.bloco_m(sup(-0.06, -0.01) @ Matrix.Translation((0, 0, 0.004)) @ Matrix.Diagonal((0.06, 0.17, 0.008, 1)), TE, 0.003, 1)   # gancho
    mh = sup(-0.06, -0.01) @ Matrix.Translation((0, 0, 0.026))
    k.tubo([mh @ V((0, -0.06, 0)), mh @ V((0, 0.0, 0.004)), mh @ V((0, 0.06, 0))], 0.014, TE, 12, raio_curva=0.12)
    for sy in (-1, 1):                                                                        # fone e microfone
        k.bloco_m(mh @ Matrix.Translation((0, sy * 0.085, -0.004)) @ Matrix.Diagonal((0.05, 0.06, 0.03, 1)), TE, 0.013, 3)
    # fio espiral do monofone ate a lateral do corpo
    a0 = mh @ V((0, -0.11, -0.012)); a1 = V((-0.105, -0.04, 0.012))
    pts = []
    for i in range(121):
        t = i / 120.0
        p = a0.lerp(a1, t) + V((0, 0, -0.03 * math.sin(math.pi * t)))
        d = (a1 - a0).normalized(); e1 = d.cross(V((0, 0, 1))).normalized(); e2 = d.cross(e1)
        w = 2 * math.pi * 14 * t
        pts.append(p + (e1 * math.cos(w) + e2 * math.sin(w)) * 0.005)
    k.varrer(pts, 0.0018, COR("plastico_preto"), 4)
    return malha(k, 40)


def malha_prancheta():
    k = K("P_EB_Prancheta")
    k.bloco(-0.115, -0.16, 0.0, 0.115, 0.16, 0.004, COR("mdf"), 0.006, 2)
    k.bloco(-0.105, -0.152, 0.004, 0.105, 0.145, 0.0052, COR("papel"), 0.0, 0)
    k.placa_t(V((0, -0.004, 0.0062)), (1, 0, 0), (0, 1, 0), 0.204, 0.29, "FOLHA", "EB_Telas_Fosco")
    k.bloco(-0.06, 0.12, 0.004, 0.06, 0.15, 0.012, "EB_Aco_Galvanizado", 0.003, 2)              # prendedor
    k.cil((-0.045, 0.142, 0.014), (0.045, 0.142, 0.014), 0.004, "EB_Aco_Galvanizado", 8)
    for sx in (-0.045, 0.045):
        k.cil((sx, 0.135, 0.012), (sx, 0.135, 0.014), 0.004, "EB_Aco_Galvanizado", 8)
    k.cil((0.08, -0.05, 0.007), (0.08, 0.09, 0.009), 0.004, COR("azul_claro"), 8)                # caneta
    k.cil((0.08, 0.09, 0.009), (0.08, 0.102, 0.009), 0.0025, COR("grafite"), 6)
    return malha(k, 40)


def malha_cadeira():
    """Cadeira de operador: base de 5 patas com rodizios duplos, pistao, assento e encosto estofados, bracos."""
    k = K("P_EB_Cadeira")
    PR, GR, TC = COR("plastico_preto"), COR("grafite"), COR("tecido")
    for b in range(5):
        a = math.radians(90 + b * 72)
        Mb = Matrix.Rotation(a, 4, "Z") @ Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
        k.prisma([(0.04, 0.06), (0.30, 0.07), (0.31, 0.09), (0.04, 0.115)], -0.024, 0.024, Mb, PR)
        px, py = math.cos(a) * 0.29, math.sin(a) * 0.29
        k.cil((px, py, 0.06), (px, py, 0.075), 0.014, PR, 10)
        ex = V((math.cos(a + 1.5708), math.sin(a + 1.5708), 0))
        k.bloco_m(Matrix.Translation((px, py, 0.05)) @ Matrix.Rotation(a, 4, "Z") @ Matrix.Diagonal((0.05, 0.03, 0.03, 1)), PR, 0.008, 2)
        for sg in (-1, 1):
            roda(k, V((px, py, 0.026)) + ex * sg * 0.018, ex, 0.026, 0.014, COR("borracha"), GR, 10)
    k.cil((0, 0, 0.06), (0, 0, 0.12), 0.055, PR, 16)
    k.torno(V((0, 0, 0.12)), V((0, 0, 1)), [(0.04, 0.0), (0.033, 0.03), (0.033, 0.2)], 16, PR, False, False)
    k.cil((0, 0, 0.32), (0, 0, 0.43), 0.02, "EB_Aco_Inox", 14)
    k.bloco(-0.12, -0.13, 0.42, 0.12, 0.13, 0.455, GR, 0.01, 2)                               # mecanismo
    k.tubo([(0.1, -0.05, 0.435), (0.2, -0.04, 0.42), (0.23, -0.02, 0.42)], 0.006, GR, 6)       # alavanca
    k.cuba(V((0, 0.0, 0.448)), 0.245, 0.235, [(0.0, 0.0), (0.92, 0.0), (1.0, 0.012), (1.0, 0.04), (0.95, 0.066), (0.75, 0.083), (0.3, 0.09), (0.0, 0.091)],
           TC, 32, 0.32)
    Mr = Matrix(((-1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))                   # z local -> +y (para o usuario)
    Mk = Matrix.Translation((0, -0.29, 0.84)) @ Matrix.Rotation(math.radians(10), 4, "X") @ Mr
    k.cuba(V((0, 0, 0)), 0.225, 0.27, [(0.0, -0.015), (0.95, -0.015), (1.0, 0.0), (1.0, 0.03), (0.94, 0.055), (0.7, 0.07), (0.0, 0.075)], TC, 32, 0.3, Mx=Mk)
    k.tubo([(0, -0.10, 0.44), (0, -0.25, 0.46), (0, -0.30, 0.52), (0, -0.305, 0.66)], 0.022, PR, 12, raio_curva=0.08)
    for sx in (-1, 1):
        k.tubo([(sx * 0.17, -0.06, 0.45), (sx * 0.27, -0.06, 0.48), (sx * 0.275, -0.05, 0.6), (sx * 0.27, -0.03, 0.665)], 0.017, PR, 10, raio_curva=0.06)
        k.bloco_m(Matrix.Translation((sx * 0.27, -0.03, 0.675)) @ Matrix.Diagonal((0.075, 0.27, 0.032, 1)), PR, 0.016, 3)
    return malha(k, 40)


def sala_controle_mobilia(M):
    me_q_ihm = malha_quadro("P_EB_Painel_CCM_IHM", "ihm")
    me_q_ch = malha_quadro("P_EB_Painel_CCM_Chave", "chave")
    pos("EB_CCM_Secador", me_q_ihm, 347.86, SY0 + 0.1, FZ, 180.0)
    pos("EB_CCM_Geral", me_q_ch, 349.08, SY0 + 0.1, FZ, 180.0)
    k = K("EB_Sala_Controle_Console")
    k.placa_t(V((347.86 - 0.29, SY0 + 0.1 + 0.4905, FZ + 0.75)), (-1, 0, 0), (0, 0, 1), 0.2, 0.1, "ETQ_CCM_SECADOR", "EB_Telas_Fosco")
    k.placa_t(V((349.08 - 0.29, SY0 + 0.1 + 0.4905, FZ + 0.75)), (-1, 0, 0), (0, 0, 1), 0.2, 0.1, "ETQ_PAINEL_IHM", "EB_Telas_Fosco")
    col("EB_Equipamento", 347.24, SY0 + 0.1, 0.15, 349.7, SY0 + 0.62, 2.15)
    # console: rodape recuado, 6 portas com puxador, tampo com borda arredondada
    GB, PR, TP = COR("gabinete"), COR("preto"), COR("tampo")
    x0, x1, y0, y1 = 345.35, 349.65, 66.55, 67.25
    k.bloco(x0 + 0.03, y0 + 0.06, FZ, x1 - 0.03, y1, FZ + 0.08, PR, 0.004)
    k.bloco(x0, y0 + 0.02, FZ + 0.08, x1, y1, FZ + 0.70, GB, 0.008)
    for i in range(6):
        xa = x0 + i * (x1 - x0) / 6 + 0.004; xb = x0 + (i + 1) * (x1 - x0) / 6 - 0.004
        k.bloco(xa, y0, FZ + 0.09, xb, y0 + 0.022, FZ + 0.69, GB, 0.006, 2)
        xx = (xa + xb) / 2 + (0.25 if i % 2 else -0.25) * 0.5
        k.bloco(xx - 0.008, y0 - 0.018, FZ + 0.44, xx + 0.008, y0, FZ + 0.62, "EB_Aco_Inox", 0.006, 2)
        k.bloco(xa + 0.08, y0 - 0.001, FZ + 0.12, xb - 0.08, y0 + 0.001, FZ + 0.16, COR("cinza_medio"), 0.0, 0)
    k.bloco(x0 - 0.05, 66.25, FZ + 0.70, x1 + 0.05, 67.28, FZ + 0.735, TP, 0.014, 3)
    k.tubo([(x0 - 0.05, 66.262, FZ + 0.7175), (x1 + 0.05, 66.262, FZ + 0.7175)], 0.0185, PR, 12)
    zt = FZ + 0.735
    me_mon, me_tec, me_mou = malha_monitor(), malha_teclado(), malha_mouse()
    telas = (("TELA_TANQUES", 346.15, 18.0), ("TELA_SINOTICO", 347.5, 0.0), ("TELA_SECADOR", 348.85, -18.0))
    for i, (nome, xm, yaw) in enumerate(telas):
        ym = 67.0
        pos("EB_Monitor_" + nome[5:].title(), me_mon, xm, ym, zt + 0.345, yaw)                # base apoiada no tampo
        a = math.radians(yaw)
        du = V((math.cos(a), math.sin(a), 0)); nrm = V((math.sin(a), -math.cos(a), 0))
        k.placa_t(V((xm, ym, zt + 0.353)) + nrm * 0.0186, du, (0, 0, 1), 0.54, 0.27, nome)
        kc = V((xm, ym, zt)) + nrm * 0.36
        pos("EB_Teclado_%d" % (i + 1), me_tec, kc.x, kc.y, zt, yaw)
        mp = kc + du * 0.31
        pos("EB_Mouse_%d" % (i + 1), me_mou, mp.x, mp.y, zt, yaw - 4.0)
    pos("EB_Telefone", malha_telefone(), 345.62, 66.68, zt, 12.0)
    pos("EB_Prancheta", malha_prancheta(), 346.78, 66.5, zt, -8.0)
    k.bloco(349.25, 66.35, zt, 349.55, 66.62, zt + 0.06, COR("amarelo"), 0.01)                   # caixa de emergencia
    k.prisma([(66.62, 0.06), (66.95, 0.06), (66.95, 0.16)], 349.25, 349.55,
             Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, zt), (0, 0, 0, 1))), COR("amarelo"))
    botao(k, (349.40, 66.49, zt + 0.06), (0, 0, 1), "emergencia")
    botao(k, (349.33, 66.80, zt + 0.115), (0, -0.29, 0.96), "seletor")
    botao(k, (349.47, 66.80, zt + 0.115), (0, -0.29, 0.96), "led_vermelho")
    k.fechar(50)
    col("EB_Equipamento", 345.3, 66.24, 0.15, 349.7, 67.3, FZ + 0.75)
    me_c = malha_cadeira()
    pos("EB_Cadeira_Operador", me_c, 347.5, 65.75, FZ, 0.0)
    pos("EB_Cadeira_Operador_2", me_c, 346.0, 65.5, FZ, 25.0)
    marcador("Ponto_EB_Painel", 347.5, 65.95, FZ, 90.0, funcao="console do secador e dos tanques (cadeira do operador)")


# =============================================================================== ensacadeira EN-401 (substitui a do 81)
def ensacadeira(M):
    mq = K("EB_Ensaque_Maquina")
    mx, my = ENS_MAQ
    IN, VD, PR, CM = "EB_Aco_Inox", COR("verde"), COR("preto"), COR("cinza_medio")
    # estrutura
    for dx in (-0.6, 0.6):
        for dy in (-0.55, 0.55):
            mq.bloco(mx + dx - 0.05, my + dy - 0.05, FZ, mx + dx + 0.05, my + dy + 0.05, 3.18, VD, 0.006)
            mq.bloco(mx + dx - 0.1, my + dy - 0.1, FZ, mx + dx + 0.1, my + dy + 0.1, FZ + 0.012, VD, 0.003)
    for zz in (2.15, 3.12):
        for (p0, p1) in (((mx - 0.6, my - 0.55), (mx + 0.6, my - 0.55)), ((mx - 0.6, my + 0.55), (mx + 0.6, my + 0.55)),
                         ((mx - 0.6, my - 0.55), (mx - 0.6, my + 0.55)), ((mx + 0.6, my - 0.55), (mx + 0.6, my + 0.55))):
            mq.viga((p0[0], p0[1], zz), (p1[0], p1[1], zz), 0.08, 0.1, VD)
    for dy in (-0.55, 0.55):
        mq.viga((mx - 0.6, my + dy, 0.5), (mx + 0.6, my + dy, 2.1), 0.04, 0.04, VD)
    # silo pulmao (inox) com indicadores de nivel e janela de inspecao
    mq.torno(V((mx, my, 0.0)), V((0, 0, 1)), [(0.09, 2.62), (0.09, 2.70), (0.42, 2.92), (0.42, 3.16), (0.0, 3.18)], 32, IN, True, False)
    mq.toro((mx, my, 2.92), (0, 0, 1), 0.422, 0.01, IN, 32, 5)
    for zz in (2.98, 2.78):
        mq.cil((mx + 0.4, my, zz), (mx + 0.5, my, zz), 0.025, COR("cinza_claro"), 10)
    # rosca dosadora com motorredutor
    mq.cil((mx, my, 2.62), (mx, my, 2.52), 0.09, IN, 16)
    mq.cil((mx - 0.35, my, 2.45), (mx + 0.2, my, 2.45), 0.1, IN, 18)
    mq.cil((mx + 0.2, my, 2.45), (mx + 0.24, my, 2.45), 0.13, IN, 18)
    motor(mq, (mx + 0.26, my, 2.45), (mx + 0.55, my, 2.45), 0.08, COR("azul_motor"), 14, True, False)
    mq.cil((mx - 0.35, my, 2.45), (mx - 0.35, my, 2.3), 0.08, IN, 14)
    # balanca de pesagem (caixa suspensa em 3 celulas de carga) + comporta pneumatica
    mq.bloco(mx - 0.25, my - 0.24, 1.86, mx + 0.25, my + 0.24, 2.22, IN, 0.012)
    for (dx, dy) in ((-0.3, -0.3), (0.3, -0.3), (0.0, 0.3)):
        mq.bloco(mx + dx - 0.04, my + dy - 0.03, 2.10, mx + dx + 0.04, my + dy + 0.03, 2.16, COR("cinza_claro"), 0.004)
        mq.viga((mx + dx, my + dy, 2.13), (mx + dx * 0.8, my + dy * 0.8, 2.2), 0.015, 0.015, IN)
    mq.cil((mx - 0.35, my, 2.3), (mx - 0.2, my, 2.22), 0.06, IN, 12)
    mq.torno(V((mx, my, 0.0)), V((0, 0, 1)), [(0.24, 1.86), (0.09, 1.70), (0.09, 1.62)], 24, IN, False, False)
    mq.cil((mx + 0.12, my - 0.28, 1.78), (mx + 0.12, my - 0.28, 2.05), 0.035, CM, 12)
    mq.cil((mx + 0.12, my - 0.28, 1.7), (mx + 0.12, my - 0.28, 1.78), 0.01, IN, 6)
    # bico de enchimento com garras (abracadeiras pneumaticas) e anel de aspiracao
    mq.cil((mx, my, 1.62), (mx, my, 1.38), 0.085, IN, 20)
    mq.toro((mx, my, 1.5), (0, 0, 1), 0.12, 0.02, IN, 24, 6)
    for sg in (-1, 1):
        Mg = Matrix.Translation((mx + sg * 0.13, my, 1.44)) @ Matrix.Rotation(math.radians(sg * 15), 4, "Y")
        mq.bloco_m(Mg @ Matrix.Diagonal((0.035, 0.26, 0.09, 1)), IN, 0.008)
        mq.cil((mx + sg * 0.42, my, 1.66), (mx + sg * 0.16, my, 1.5), 0.025, CM, 12)
        mq.cil((mx + sg * 0.42, my, 1.66), (mx + sg * 0.5, my, 1.7), 0.03, CM, 12)
    mq.tubo([(mx + 0.12, my + 0.12, 1.52), (mx + 0.3, my + 0.3, 1.9), (mx + 0.35, my + 0.35, 3.1), (mx + 0.35, my + 0.35, EH)], 0.05,
            COR("cinza_claro"), 12, raio_curva=0.2)
    # saco valvulado sendo cheio (em pe, sobre a esteira)
    mq.torno(V((mx, my, 0.48)), V((0, 0, 1)), [(0.0, 0.0), (0.24, 0.005), (0.27, 0.08), (0.27, 0.62), (0.2, 0.82), (0.11, 0.94), (0.085, 0.95)],
             18, COR("kraft"), False, False)
    # esteira de saco: do bico para oeste ate a paletizacao
    ex0, ex1, yb0, yb1, zb = 354.75, mx + 0.45, my - 0.27, my + 0.27, 0.48
    mq.bloco(ex0, yb0, zb - 0.03, ex1, yb1, zb, COR("borracha"), 0.004)
    for yy in (yb0 - 0.03, yb1):
        mq.bloco(ex0 - 0.05, yy, zb - 0.16, ex1 + 0.05, yy + 0.03, zb + 0.02, CM, 0.006)
        mq.bloco(ex0 + 0.4, yy - 0.01 if yy < my else yy + 0.03, zb + 0.06, ex1 - 0.2, yy if yy < my else yy + 0.04, zb + 0.12, COR("amarelo"), 0.005)
    for xx in (ex0, ex1):
        mq.cil((xx, yb0, zb - 0.065), (xx, yb1, zb - 0.065), 0.065, CM, 16)
    for xx in [ex0 + 0.25 + i * 0.5 for i in range(int((ex1 - ex0) / 0.5))]:
        for yy in (yb0 - 0.03, yb1 + 0.03):
            mq.bloco(xx - 0.03, yy - 0.03, FZ, xx + 0.03, yy + 0.03, zb - 0.14, CM, 0.004)
        mq.viga((xx, yb0 - 0.03, FZ + 0.12), (xx, yb1 + 0.03, FZ + 0.12), 0.03, 0.03, CM)
    motor(mq, (ex0 + 0.1, yb1 + 0.06, zb - 0.07), (ex0 + 0.1, yb1 + 0.36, zb - 0.07), 0.07, COR("azul_motor"), 14, True, False)
    # costuradeira em coluna (sobre a esteira)
    sx, sy = 356.4, my + 0.55
    mq.cil((sx, sy, FZ), (sx, sy, 1.70), 0.05, VD, 16)
    mq.torno(V((sx, sy, FZ)), V((0, 0, 1)), [(0.2, 0.0), (0.2, 0.03), (0.06, 0.06)], 16, VD, False, True)
    mq.bloco(sx - 0.05, sy - 0.45, 1.62, sx + 0.05, sy + 0.05, 1.70, VD, 0.01)
    mq.bloco(sx - 0.17, sy - 0.62, 1.40, sx + 0.17, sy - 0.40, 1.66, COR("creme"), 0.03, 3)
    mq.bloco(sx - 0.04, sy - 0.58, 1.30, sx + 0.04, sy - 0.48, 1.40, COR("creme"), 0.012)
    mq.cil((sx, sy - 0.53, 1.30), (sx, sy - 0.53, 1.24), 0.008, IN, 6)
    mq.torno(V((sx, sy - 0.48, 1.66)), V((0, 0, 1)), [(0.045, 0.0), (0.03, 0.14), (0.008, 0.15)], 12, COR("branco"), True, True)
    mq.cil((sx + 0.17, sy - 0.5, 1.52), (sx + 0.32, sy - 0.5, 1.52), 0.06, COR("azul_motor"), 12)
    mq.bloco(sx + 0.08, sy - 0.08, 1.2, sx + 0.26, sy + 0.08, 1.32, COR("cinza_claro"), 0.01)
    botao(mq, (sx + 0.17, sy - 0.08, 1.27), (0, -1, 0), "verde_claro")
    # quadro de comando da ensacadeira com IHM e coluna luminosa
    qx, qy = IX1 - 0.12, my - 1.1
    mq.bloco(qx - 0.25, qy - 0.35, FZ + 0.9, qx, qy + 0.35, FZ + 1.75, COR("cinza_claro"), 0.01)
    mq.bloco(qx - 0.265, qy - 0.335, FZ + 0.92, qx - 0.25, qy + 0.335, FZ + 1.73, COR("cinza_claro"), 0.006)
    mq.bloco(qx - 0.28, qy - 0.16, FZ + 1.42, qx - 0.265, qy + 0.16, FZ + 1.66, PR, 0.01)
    mq.placa_t(V((qx - 0.2805, qy, FZ + 1.54)), (0, -1, 0), (0, 0, 1), 0.28, 0.14, "TELA_ENSAQUE")
    for i, t in enumerate(("verde_claro", "vermelho", "seletor")):
        botao(mq, (qx - 0.265, qy - 0.12 + i * 0.12, FZ + 1.25), (-1, 0, 0), t, ("BOT_0", "BOT_1", "BOT_3")[i])
    botao(mq, (qx - 0.265, qy + 0.24, FZ + 1.5), (-1, 0, 0), "emergencia")
    mq.bloco(qx - 0.12, qy - 0.04, FZ, qx - 0.06, qy + 0.04, FZ + 0.9, CM, 0.004)
    mq.placa_t(V((qx - 0.266, qy, FZ + 1.67)), (0, -1, 0), (0, 0, 1), 0.26, 0.065, "ETQ_EN", "EB_Telas_Fosco")
    tx, ty = mx + 0.6, my + 0.55
    mq.cil((tx, ty, 3.18), (tx, ty, 3.22), 0.04, PR, 12)
    for j, c in enumerate(("led_vermelho", "led_amarelo", "led_verde")):
        mq.cil((tx, ty, 2.9 - j * 0.08), (tx, ty, 2.97 - j * 0.08), 0.04, LUZ(c), 14)
    mq.cil((tx, ty, 2.97), (tx, ty, 3.18), 0.015, CM, 6)
    mq.cil((tx, ty, 2.66), (tx, ty, 2.74), 0.042, PR, 14)
    # paletizacao (o palete e uma vaga do estoque), fardo de sacos vazios
    pal = bpy.data.meshes.get("P_EB_Palete")
    pos("EB_Palete_PA_Ensaque", pal, 354.0, 64.0)
    marcador("Ponto_EB_PA_Ensaque", 354.0, 64.0, FZ + 0.144, 0.0, tipo="PRODUTO", capacidade=len(ARRANJO), nivel_m=0.0)
    pos("EB_Ensaque_Palete_Vazios", pal, 358.6, 61.5)
    mq.bloco(358.15, 60.95, FZ + 0.144, 359.05, 62.05, FZ + 0.62, COR("kraft"), 0.02)
    for xx in (358.3, 358.9):
        mq.bloco(xx - 0.01, 60.94, FZ + 0.144, xx + 0.01, 62.06, FZ + 0.63, COR("preto"), 0.0, 0)
    msaco = bpy.data.meshes.get("P_EB_Saco_Produto")
    for i, xx in enumerate((356.0, 355.2)):
        pos("EB_Ensaque_Saco_Esteira_%d" % (i + 1), msaco, xx, my, zb, 0.0)
    col("EB_Equipamento", mx - 0.68, my - 0.62, 0.15, mx + 0.68, my + 0.62, 3.2)
    col("EB_Equipamento", ex0 - 0.05, yb0 - 0.04, 0.15, mx - 0.68, yb1 + 0.04, zb + 0.12)
    col("EB_Equipamento", sx - 0.2, sy - 0.2, 0.15, sx + 0.26, sy + 0.2, 1.7)
    col("EB_Equipamento", qx - 0.28, qy - 0.35, 0.15, qx, qy + 0.35, FZ + 1.75)
    col("EB_Equipamento", 358.1, 60.9, 0.15, 359.1, 62.1, FZ + 0.63)
    marcador("Ponto_EB_Ensaque", mx - 0.3, my - 0.9, FZ, 90.0, funcao="operador da ensacadeira")
    marcador("Ponto_EB_Ensaque_Bico", mx, my, 1.45, 0.0, funcao="bico de enchimento")
    marcador("Ponto_EB_Ensaque_Saida", ex0 + 0.3, my, zb, 0.0, funcao="fim da esteira (saco pronto, ao lado do palete)")
    mq.fechar(50)


# =============================================================================== cerca eletrica sobre o muro
CERCA_Z = (0.14, 0.27, 0.40, 0.53, 0.66, 0.79)


def malha_haste():
    k = K("P_EB_Cerca_Haste")
    GV, PR, BR = "EB_Aco_Galvanizado", COR("preto"), COR("branco")
    k.bloco(-0.06, -0.06, 0.0, 0.06, 0.06, 0.006, GV, 0.0, 0)                 # 43 hastes: pecas sem chanfro (~250 tris cada)
    k.bloco(-0.012, -0.0025, 0.006, 0.012, 0.0025, 0.92, GV, 0.0, 0)
    k.bloco(-0.003, -0.02, 0.006, 0.003, 0.0, 0.12, GV, 0.0, 0)
    for z in CERCA_Z:
        k.bloco(-0.018, -0.003, z - 0.02, 0.018, 0.016, z + 0.02, PR, 0.0, 0)
        k.cil((0.0, 0.016, z), (0.0, 0.03, z), 0.009, BR, 6)
    return malha(k, 40)


def cerca(M):
    me = malha_haste()
    k = K("EB_Cerca_Eletrica")
    GV, PR = "EB_Aco_Galvanizado", COR("preto")
    H = 2.73                                                                          # topo da capa dos pilaretes (muro 2,55 + 0,18)
    corridas = [((332.4, 48.075), (362.92, 48.075), True), ((332.4, 81.305), (362.92, 81.305), False),
                ((332.395, 48.15), (332.395, 81.23), False), ((362.925, 57.8), (362.925, 81.23), True)]
    n_h = 0
    for (a, b, rua) in corridas:
        a, b = V((a[0], a[1], 0)), V((b[0], b[1], 0)); d = b - a; L = d.length; e = d.normalized()
        fora = V((e.y, -e.x, 0))
        if (a + fora - V((347.5, 64.8, 0))).length < (a - V((347.5, 64.8, 0))).length: fora = -fora
        n = max(1, int(round(L / 3.0)))
        yaw = math.degrees(math.atan2(e.y, e.x))
        yaw_h = math.degrees(math.atan2(fora.y, fora.x)) - 90.0
        pts = [a + d * (i / n) for i in range(n + 1)]
        for i, p in enumerate(pts):
            pos("EB_Cerca_Haste_%03d" % n_h, me, p.x, p.y, H, yaw_h); n_h += 1
            if i in (0, n):                                                                         # haste de canto: isoladores de tracao
                sg = 1 if i == 0 else -1
                for z in CERCA_Z:
                    q = p + fora * 0.023 + V((0, 0, H + z))
                    k.cil(q, q + e * 0.06 * sg, 0.012, COR("branco"), 8)
                    k.cil(q + e * 0.06 * sg, q + e * 0.11 * sg, 0.005, GV, 6)
        for z in CERCA_Z:                                                                           # fios de aco inox
            p0 = a + fora * 0.023 + V((0, 0, H + z)); p1 = b + fora * 0.023 + V((0, 0, H + z))
            k.cil(p0, p1, 0.0016, "EB_Aco_Inox", 4, False)
        if rua:                                                                                      # placas na corrida da rua
            for i in range(n):
                if i % 2: continue
                c = (pts[i] + pts[i + 1]) / 2 + fora * 0.03 + V((0, 0, H + 0.335))
                k.placa_t(c + fora * 0.002, V((0, 0, 1)).cross(fora), (0, 0, 1), 0.3, 0.15, "CERCA", "EB_Telas_Fosco")
                k.placa_t(c - fora * 0.002, V((0, 0, 1)).cross(-fora), (0, 0, 1), 0.3, 0.15, "CERCA", "EB_Telas_Fosco")
                for dz in (0.13, -0.13):
                    k.cil(c + V((0, 0, dz * 0.55)), c + V((0, 0, dz * 0.55)) + fora * 0.004, 0.006, GV, 6)
    # central de choque no lado de dentro do muro sul, junto do portao
    cx, cy, cz = 360.2, 48.075 + 0.075, 1.75
    k.bloco(cx - 0.17, cy, cz - 0.21, cx + 0.17, cy + 0.11, cz + 0.21, COR("cinza_claro"), 0.015, 3)
    k.bloco(cx - 0.12, cy + 0.11, cz + 0.04, cx + 0.12, cy + 0.112, cz + 0.16, COR("tela_off"), 0.0, 0)
    for i, t in enumerate(("led_verde", "led_vermelho", "led_amarelo")):
        botao(k, (cx - 0.07 + i * 0.07, cy + 0.112, cz - 0.05), (0, 1, 0), t)
    k.placa_t(V((cx, cy + 0.113, cz - 0.15)), (-1, 0, 0), (0, 0, 1), 0.3, 0.05, "ETQ_CERCA", "EB_Telas_Fosco")
    k.torno(V((cx + 0.32, cy + 0.0, cz + 0.2)), V((0, 1, 0)), [(0.05, 0.0), (0.05, 0.02), (0.09, 0.13), (0.085, 0.14)], 16, COR("vermelho_vivo"), True, False)  # sirene
    k.tubo([(cx, cy + 0.05, cz + 0.21), (cx, cy + 0.05, 2.62), (cx, cy - 0.04, 2.7), (cx, cy - 0.04, H + 0.1)], 0.012, COR("cinza_claro"), 8, raio_curva=0.05)
    k.tubo([(cx - 0.1, cy + 0.05, cz - 0.21), (cx - 0.1, cy + 0.05, 0.35), (cx - 0.1, cy + 0.25, FZ + 0.02)], 0.008, COR("verde_claro"), 6)
    k.cil((cx - 0.1, cy + 0.25, FZ - 0.1), (cx - 0.1, cy + 0.25, FZ + 0.12), 0.008, COR("cobre"), 6)  # haste de aterramento
    k.fechar(50)
    STATS["cerca_hastes"] = n_h


# =============================================================================== oficina: extintores, hidrante, bancada com painel
REGO = CAT.get("oficina", {})
FERR = CAT.get("oficina_ferramentas", [])


def _placa_o(s, c, du, dv, w, h, nome, m="EB_Oficina"):
    x0, y0, x1, y1 = REGO[nome]
    c, du, dv = V(c), V(du).normalized(), V(dv).normalized()
    pts = [c - du * w / 2 - dv * h / 2, c + du * w / 2 - dv * h / 2, c + du * w / 2 + dv * h / 2, c - du * w / 2 + dv * h / 2]
    uv = lambda u, v: ((x0 + 0.5 + (x1 - x0 - 1) * u) / 1024.0, 1.0 - (y1 - 0.5 - (y1 - y0 - 1) * v) / 512.0)
    return s.face(pts, m, [uv(0, 0), uv(1, 0), uv(1, 1), uv(0, 1)])


K.placa_o = _placa_o


def malha_extintor():
    """Extintor de PQS 6 kg de parede (padrao brasileiro): parede em y = 0, extintor na frente (-y), topo a 1,60 m."""
    k = K("P_EB_Extintor")
    VM, PR, GV = COR("vermelho_vivo"), COR("plastico_preto"), "EB_Aco_Galvanizado"
    cy = -0.125
    k.bloco(-0.045, -0.012, 1.18, 0.045, 0.0, 1.36, GV, 0.004, 2)                              # suporte de parede
    k.bloco(-0.03, -0.06, 1.33, 0.03, -0.012, 1.35, GV, 0.003, 1)
    k.tubo([(-0.05, -0.06, 1.34), (-0.06, cy, 1.34), (0.06, cy, 1.34), (0.05, -0.06, 1.34)], 0.006, GV, 6, raio_curva=0.03)
    k.torno(V((0, cy, 0.0)), V((0, 0, 1)), [(0.0, 0.98), (0.07, 0.98), (0.084, 0.99), (0.09, 1.01), (0.09, 1.43), (0.086, 1.47),
                                           (0.068, 1.505), (0.04, 1.52), (0.022, 1.525)], 24, VM, False, False)
    k.torno(V((0, cy, 0.0)), V((0, 0, 1)), [(0.093, 0.965), (0.093, 1.0), (0.0, 1.0)], 24, PR, True, False)   # base plastica
    k.placa_o(V((0, cy - 0.0905, 1.21)), (1, 0, 0), (0, 0, 1), 0.11, 0.14, "ROTULO_PQS")
    k.cil((0, cy, 1.52), (0, cy, 1.575), 0.022, COR("latao"), 14)                              # valvula
    k.bloco(-0.03, cy - 0.02, 1.57, 0.03, cy + 0.02, 1.60, COR("latao"), 0.006, 2)
    k.bloco_m(Matrix.Translation((0.05, cy, 1.61)) @ Matrix.Rotation(math.radians(-12), 4, "Y") @ Matrix.Diagonal((0.11, 0.022, 0.012, 1)), PR, 0.004, 2)  # gatilho
    k.bloco_m(Matrix.Translation((0.045, cy, 1.585)) @ Matrix.Rotation(math.radians(8), 4, "Y") @ Matrix.Diagonal((0.10, 0.022, 0.01, 1)), PR, 0.004, 2)   # alca
    k.cil((0.0, cy - 0.022, 1.585), (0.0, cy - 0.04, 1.585), 0.004, COR("amarelo"), 6)          # pino + lacre
    k.toro((0.0, cy - 0.048, 1.585), (0, 1, 0), 0.012, 0.0025, COR("amarelo"), 12, 4)
    manometro(k, (-0.035, cy - 0.025, 1.57), (0, -1, 0), 0.016)
    k.tubo([(-0.02, cy, 1.56), (-0.06, cy - 0.03, 1.55), (-0.1, cy - 0.04, 1.42), (-0.1, cy - 0.06, 1.2), (-0.09, cy - 0.06, 1.12)], 0.009, PR, 8, raio_curva=0.05)
    k.torno(V((-0.09, cy - 0.06, 1.12)), V((0, 0, -1)), [(0.012, 0.0), (0.015, 0.02), (0.01, 0.06)], 10, PR, False, True)   # difusor
    return malha(k, 40)


EXTINTORES = [(IX1, 56.4, (-1, 0)), (340.2, 62.4, (0, 1)), (345.6, 62.3, (0, -1)), (345.2, 69.8, (1, 0)),
              (351.65, 60.6, (0, -1)), (IX0, 73.6, (1, 0)), (352.2, IY1, (0, -1)), (IX0, 51.6, (1, 0))]


def extintores(M):
    me = malha_extintor()
    k = K("EB_Placas_Seguranca")
    for i, (x, y, n) in enumerate(EXTINTORES):
        n = V((n[0], n[1], 0))
        yaw = math.degrees(math.atan2(n.x, -n.y))
        pos("EB_Extintor_%02d" % (i + 1), me, x, y, 0.0, yaw)
        du = V((0, 0, 1)).cross(n)
        k.placa_o(V((x, y, 1.95)) + n * 0.004, du, (0, 0, 1), 0.22, 0.22, "PLACA_EXTINTOR")        # placa na parede, acima
        z_p = FZ + (0.0075 if (PX0 < x < PX1 and PY0 < y < PY1) or (SX0 < x < SX1 and SY0 < y < SY1) or (EX0 < x < EX1 and EY0 < y < EY1) else 0.005)
        c = V((x, y, z_p)) + n * 0.42
        k.placa_o(c, du, -n, 0.7, 0.7, "PISO_INCENDIO")                                            # demarcacao no piso
        col_local("EB_Equipamento", x, y, yaw, -0.11, -0.24, 0.11, 0.0, 0.95, 1.65)
    k.fechar(40)


def hidrante(k, x, y0, y1):
    """Abrigo de mangueira na parede oeste (frente em +x), com registro, mangueira aduchada, esguicho e placa."""
    VM, VV = COR("vermelho_vivo"), COR("vermelho")
    z0, z1, p = FZ + 0.85, FZ + 1.75, 0.27
    k.bloco(x, y0, z0, x + p - 0.02, y1, z1, VM, 0.008, 2)
    k.bloco(x + p - 0.025, y0 - 0.005, z0 - 0.005, x + p, y1 + 0.005, z0 + 0.06, VM, 0.004, 1)    # moldura da porta
    k.bloco(x + p - 0.025, y0 - 0.005, z1 - 0.06, x + p, y1 + 0.005, z1 + 0.005, VM, 0.004, 1)
    k.bloco(x + p - 0.025, y0 - 0.005, z0, x + p, y0 + 0.055, z1, VM, 0.004, 1)
    k.bloco(x + p - 0.025, y1 - 0.055, z0, x + p, y1 + 0.005, z1, VM, 0.004, 1)
    k.face([V((x + p - 0.015, y0 + 0.055, z0 + 0.06)), V((x + p - 0.015, y1 - 0.055, z0 + 0.06)), V((x + p - 0.015, y1 - 0.055, z1 - 0.06)),
            V((x + p - 0.015, y0 + 0.055, z1 - 0.06))], "EB_Vidro")
    k.placa_o(V((x + p - 0.013, (y0 + y1) / 2, z1 - 0.16)), (0, 1, 0), (0, 0, 1), (y1 - y0) - 0.14, 0.09, "VIDRO_INCENDIO")
    k.bloco(x + p, y1 - 0.12, (z0 + z1) / 2 - 0.04, x + p + 0.025, y1 - 0.09, (z0 + z1) / 2 + 0.04, COR("preto"), 0.004, 2)  # fecho
    for j in range(5):                                                                          # mangueira aduchada
        k.toro((x + 0.13, (y0 + y1) / 2, z0 + 0.22 + j * 0.055), (0, 0, 1), 0.2 - j * 0.012, 0.026, COR("bege"), 24, 6)
    k.cil((x + 0.13, y1 - 0.1, z0 + 0.5), (x + 0.13, y1 - 0.1, z0 + 0.62), 0.03, COR("latao"), 10)   # esguicho
    k.cil((x + 0.02, y0 + 0.12, z1 - 0.12), (x + 0.14, y0 + 0.12, z1 - 0.12), 0.035, COR("latao"), 12)   # registro angular
    k.toro((x + 0.18, y0 + 0.12, z1 - 0.12), (1, 0, 0), 0.06, 0.009, VV, 16, 5)
    k.cil((x + 0.14, y0 + 0.12, z1 - 0.12), (x + 0.18, y0 + 0.12, z1 - 0.12), 0.012, COR("latao"), 8)
    k.placa_o(V((x + 0.004, (y0 + y1) / 2, z1 + 0.22)), (0, 1, 0), (0, 0, 1), 0.24, 0.24, "PLACA_HIDRANTE")
    k.placa_o(V((x + 0.55, (y0 + y1) / 2, FZ + 0.005)), (1, 0, 0), (0, 1, 0), 1.0, 1.0, "PISO_INCENDIO")


# ---------------------------------------------------------------- ferramentas do painel (local: painel no plano y = -0.02, frente -y)
def ferramenta(k, tipo, x, z, L):
    """Pendura uma ferramenta com o topo em (x, z) (z = altura do topo do desenho no painel)."""
    y = -0.034
    AC, GV = "EB_Aco_Inox", "EB_Aco_Galvanizado"
    k.tubo([(x, -0.02, z + 0.02), (x, -0.045, z + 0.02), (x, -0.05, z + 0.035)], 0.0025, GV, 5, raio_curva=0.01)   # gancho
    if tipo == "martelo":
        k.bloco(x - 0.014, y - 0.012, z - L, x + 0.014, y + 0.012, z, M_MAD, 0.008, 2)
        k.bloco(x - 0.055, y - 0.014, z - 0.01, x + 0.045, y + 0.014, z + 0.025, AC, 0.004, 2)
        k.prisma([(0.045, -0.01), (0.075, 0.0), (0.075, 0.012), (0.045, 0.025)], -0.01, 0.01, Matrix.Translation((x, y, z)) @ Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))), AC)
        k.cil((x, y, z - L * 0.62), (x, y, z - L), 0.017, COR("preto"), 10)
    elif tipo == "chave_comb":
        k.bloco(x - 0.008, y - 0.0025, z - L + 0.012, x + 0.008, y + 0.0025, z - 0.012, AC, 0.002, 1)
        k.toro((x, y, z), (0, 1, 0), 0.011, 0.004, AC, 14, 4)
        k.prisma([(-0.012, 0.0), (-0.016, -0.025), (-0.006, -0.025), (-0.005, -0.008), (0.005, -0.008), (0.006, -0.025), (0.016, -0.025), (0.012, 0.0)],
                 -0.003, 0.003, Matrix.Translation((x, y, z - L + 0.012)) @ Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))), AC)
    elif tipo == "fenda":
        cor = ("vermelho_vivo", "amarelo", "azul_claro", "verde_claro", "laranja")[int(x * 100) % 5]
        k.torno(V((x, y, z - L * 0.45)), V((0, 0, 1)), [(0.006, 0.0), (0.014, 0.01), (0.015, L * 0.4), (0.011, L * 0.45), (0.0, L * 0.45 + 0.002)], 8, COR(cor), True, False)
        k.cil((x, y, z - L * 0.45), (x, y, z - L), 0.0035, AC, 6)
        k.bloco(x - 0.004, y - 0.001, z - L - 0.006, x + 0.004, y + 0.001, z - L, AC, 0.0, 0)
    elif tipo == "alicate":
        for sg in (-1, 1):
            k.prisma([(-0.006, 0.0), (0.006, 0.0), (sg * 0.03 + 0.006, -L), (sg * 0.03 - 0.006, -L)], -0.004, 0.004,
                     Matrix.Translation((x, y, z - 0.05)) @ Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))), COR("vermelho_vivo"))
        k.prisma([(-0.007, 0.0), (0.007, 0.0), (0.004, 0.055), (-0.004, 0.055)], -0.005, 0.005,
                 Matrix.Translation((x, y, z - 0.055)) @ Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))), AC)
        k.cil((x, y - 0.006, z - 0.05), (x, y + 0.006, z - 0.05), 0.006, AC, 8)
    elif tipo == "inglesa":
        k.bloco(x - 0.01, y - 0.004, z - L, x + 0.01, y + 0.004, z - 0.035, AC, 0.003, 1)
        k.cil((x, y - 0.006, z - 0.012), (x, y + 0.006, z - 0.012), 0.03, AC, 16)
        k.bloco(x - 0.006, y - 0.007, z - 0.004, x + 0.006, y + 0.007, z + 0.03, AC, 0.002, 1)
        k.cil((x - 0.012, y, z - 0.04), (x + 0.012, y, z - 0.04), 0.007, AC, 8)
        k.bloco(x - 0.012, y - 0.0025, z - L, x + 0.012, y + 0.0025, z - L + 0.01, AC, 0.002, 1)
    elif tipo == "serra":
        k.tubo([(x - L / 2, y, z - 0.09), (x - L / 2, y, z), (x + L / 2, y, z), (x + L / 2, y, z - 0.09)], 0.008, COR("azul_claro"), 8, raio_curva=0.02)
        k.bloco(x - L / 2, y - 0.0006, z - 0.095, x + L / 2, y + 0.0006, z - 0.082, AC, 0.0, 0)
        k.bloco_m(Matrix.Translation((x + L / 2 + 0.03, y, z - 0.12)) @ Matrix.Rotation(math.radians(-25), 4, "Y") @ Matrix.Diagonal((0.03, 0.024, 0.11, 1)), COR("preto"), 0.01, 2)
    elif tipo == "trena":
        k.bloco(x - L / 2, y - 0.022, z - L / 2, x + L / 2, y + 0.016, z + L / 2, COR("amarelo"), 0.014, 3)
        k.cil((x, y - 0.023, z), (x, y - 0.025, z), 0.025, COR("preto"), 14)
        k.bloco(x + L / 2 - 0.004, y - 0.004, z - L / 2 - 0.002, x + L / 2 + 0.006, y + 0.004, z - L / 2 + 0.012, AC, 0.002, 1)


M_MAD = "EB_Madeira_Palete"


def malha_bancada(M):
    """Bancada de oficina 2,4 x 0,75 m (parede em y = 0, frente em -y) com painel de ferramentas e acessorios."""
    k = K("P_EB_Bancada")
    ES, GB, PR, GV = COR("azul_claro"), COR("gabinete"), COR("plastico_preto"), "EB_Aco_Galvanizado"
    L2, P = 1.2, 0.75
    for x in (-L2 + 0.04, L2 - 0.04):                                                           # pes de tubo 50 x 50
        for y in (-0.04, -P + 0.04):
            k.bloco(x - 0.025, y - 0.025, 0.012, x + 0.025, y + 0.025, 0.86, ES, 0.004, 1)
            k.cil((x, y, 0.0), (x, y, 0.012), 0.03, COR("borracha"), 10)
    for z in (0.18, 0.82):                                                                      # travessas
        k.bloco(-L2 + 0.04, -0.06, z - 0.02, L2 - 0.04, -0.02, z + 0.02, ES, 0.003, 1)
        k.bloco(-L2 + 0.04, -P + 0.02, z - 0.02, L2 - 0.04, -P + 0.06, z + 0.02, ES, 0.003, 1)
        for x in (-L2 + 0.04, L2 - 0.04):
            k.bloco(x - 0.02, -P + 0.04, z - 0.02, x + 0.02, -0.04, z + 0.02, ES, 0.003, 1)
    k.bloco(-L2 + 0.065, -P + 0.065, 0.2, L2 - 0.065, -0.065, 0.212, GB, 0.002, 1)              # prateleira
    k.bloco(-L2 - 0.02, -P - 0.02, 0.86, L2 + 0.02, 0.0, 0.905, M_MAD, 0.006, 2)                 # tampo de madeira
    k.bloco(-L2 - 0.022, -P - 0.026, 0.86, L2 + 0.022, -P - 0.018, 0.905, GV, 0.002, 1)          # cantoneira da borda
    # gaveteiro suspenso (3 gavetas)
    gx0, gx1 = 0.45, 1.12
    k.bloco(gx0, -P + 0.04, 0.42, gx1, -0.05, 0.86, GB, 0.006, 2)
    for j in range(3):
        za, zb = 0.44 + j * 0.14, 0.565 + j * 0.14
        k.bloco(gx0 + 0.015, -P + 0.03, za, gx1 - 0.015, -P + 0.045, zb, GB, 0.005, 2)
        k.bloco((gx0 + gx1) / 2 - 0.07, -P + 0.012, (za + zb) / 2 - 0.008, (gx0 + gx1) / 2 + 0.07, -P + 0.03, (za + zb) / 2 + 0.008, GV, 0.004, 2)
        k.placa_o(V(((gx0 + gx1) / 2, -P + 0.0295, zb - 0.025)), (1, 0, 0), (0, 0, 1), 0.06, 0.03, "ETQ_GAVETA")
    # painel perfurado com ferramentas
    k.bloco(-1.2, -0.02, 1.02, 1.2, -0.012, 1.95, GB, 0.003, 1)
    k.placa_o(V((0, -0.0205, 1.485)), (1, 0, 0), (0, 0, 1), 2.38, 0.892, "PAINEL")
    for x in (-1.15, 0.0, 1.15):
        for z in (1.06, 1.91):
            k.cil((x, -0.012, z), (x, 0.0, z), 0.01, GV, 6)
    for tipo, xm, zm, L, ang in FERR:
        ferramenta(k, tipo, xm, 1.94 - zm, L)
    k.bloco(-1.0, -0.12, 2.0, 1.0, -0.02, 2.06, GB, 0.006, 2)                                    # luminaria do painel
    k.bloco(-0.98, -0.121, 2.003, 0.98, -0.11, 2.012, LUZ("luz"), 0.0, 0)
    zt = 0.905
    # morsa de bancada (lado esquerdo, na borda)
    mx, my = -0.95, -P + 0.12
    k.cil((mx, my, zt), (mx, my, zt + 0.03), 0.075, ES, 16)
    k.bloco(mx - 0.08, my - 0.06, zt + 0.03, mx + 0.08, my + 0.07, zt + 0.12, ES, 0.012, 2)
    k.bloco(mx - 0.075, my - 0.11, zt + 0.06, mx + 0.075, my - 0.06, zt + 0.16, ES, 0.01, 2)      # mordente fixo
    k.bloco(mx - 0.075, my - 0.17, zt + 0.06, mx + 0.075, my - 0.13, zt + 0.16, ES, 0.01, 2)      # mordente movel
    for jx in (my - 0.112, my - 0.128):
        k.bloco(mx - 0.07, jx - 0.004, zt + 0.1, mx + 0.07, jx + 0.004, zt + 0.165, M["xadrez"], 0.001, 1)
    for dx in (-0.045, 0.045):
        k.cil((mx + dx, my - 0.25, zt + 0.08), (mx + dx, my - 0.06, zt + 0.08), 0.012, "EB_Aco_Inox", 10)
    k.cil((mx, my - 0.31, zt + 0.1), (mx, my - 0.06, zt + 0.1), 0.01, "EB_Aco_Inox", 10)
    k.cil((mx - 0.13, my - 0.3, zt + 0.1), (mx + 0.13, my - 0.3, zt + 0.1), 0.008, "EB_Aco_Inox", 8)
    for sx in (-0.13, 0.13):
        k.esfera((mx + sx, my - 0.3, zt + 0.1), 0.014, "EB_Aco_Inox", 10, 5)
    # caixa de ferramentas sanfonada
    tx, ty = -0.45, -0.25
    k.bloco(tx - 0.25, ty - 0.11, zt, tx + 0.25, ty + 0.11, zt + 0.16, COR("vermelho_vivo"), 0.01, 2)
    for sg in (-1, 1):
        k.bloco(tx - 0.245, ty + sg * 0.055 - 0.052, zt + 0.16, tx + 0.245, ty + sg * 0.055 + 0.052, zt + 0.21, COR("vermelho_vivo"), 0.01, 2)
        k.bloco(tx - 0.12, ty + sg * 0.11 - 0.006, zt + 0.09, tx - 0.08, ty + sg * 0.11 + 0.006, zt + 0.135, GV, 0.003, 1)
        k.bloco(tx + 0.08, ty + sg * 0.11 - 0.006, zt + 0.09, tx + 0.12, ty + sg * 0.11 + 0.006, zt + 0.135, GV, 0.003, 1)
    k.tubo([(tx - 0.1, ty, zt + 0.21), (tx - 0.1, ty, zt + 0.26), (tx + 0.1, ty, zt + 0.26), (tx + 0.1, ty, zt + 0.21)], 0.011, PR, 10, raio_curva=0.03)
    # furadeira a bateria deitada
    fx, fy = 0.05, -0.3
    k.cil((fx - 0.09, fy, zt + 0.06), (fx + 0.09, fy, zt + 0.06), 0.035, COR("azul_claro"), 14)
    k.torno(V((fx + 0.09, fy, zt + 0.06)), V((1, 0, 0)), [(0.03, 0.0), (0.025, 0.04), (0.012, 0.06)], 12, PR, True, True)
    k.cil((fx + 0.15, fy, zt + 0.06), (fx + 0.21, fy, zt + 0.06), 0.004, "EB_Aco_Inox", 6)
    k.bloco_m(Matrix.Translation((fx - 0.02, fy - 0.08, zt + 0.045)) @ Matrix.Rotation(math.radians(-10), 4, "Z") @ Matrix.Diagonal((0.05, 0.13, 0.05, 1)), PR, 0.015, 2)
    k.bloco(fx - 0.07, fy - 0.2, zt, fx + 0.04, fy - 0.12, zt + 0.07, PR, 0.01, 2)
    # almotolia, gaveteiro de pecas, estopa
    k.torno(V((0.3, -0.18, zt)), V((0, 0, 1)), [(0.05, 0.0), (0.055, 0.01), (0.055, 0.06), (0.03, 0.1), (0.008, 0.12)], 14, COR("vermelho"), True, False)
    k.cil((0.3, -0.18, zt + 0.12), (0.37, -0.22, zt + 0.26), 0.003, GV, 6)
    for r in range(3):
        for c in range(6):
            bx = 0.42 + c * 0.11; bz = zt + r * 0.09
            k.bloco(bx, -0.18, bz, bx + 0.1, -0.01, bz + 0.08, COR(("azul_claro", "amarelo", "vermelho_vivo")[r]), 0.006, 2)
            k.bloco(bx + 0.02, -0.181, bz + 0.04, bx + 0.08, -0.179, bz + 0.07, COR("tela_off"), 0.0, 0)
    k.cuba(V((-0.08, -0.54, zt)), 0.08, 0.06, [(0.0, 0.0), (0.9, 0.0), (1.0, 0.01), (0.9, 0.03), (0.6, 0.042), (0.0, 0.045)], COR("papel"), 14, 0.7)   # estopa
    # luminaria articulada presa na borda
    lx, ly = 0.9, -0.08
    k.bloco(lx - 0.03, ly - 0.03, zt - 0.06, lx + 0.03, ly + 0.03, zt + 0.02, PR, 0.004, 1)
    k.tubo([(lx, ly, zt + 0.02), (lx, ly - 0.05, zt + 0.42), (lx - 0.05, ly - 0.38, zt + 0.55)], 0.008, PR, 8, raio_curva=0.03)
    k.torno(V((lx - 0.05, ly - 0.38, zt + 0.55)), V((0, -0.3, -1)), [(0.03, 0.0), (0.075, 0.1), (0.078, 0.11)], 16, PR, True, False)
    k.cil(V((lx - 0.05, ly - 0.38, zt + 0.55)) + V((0, -0.3, -1)).normalized() * 0.095, V((lx - 0.05, ly - 0.38, zt + 0.55)) + V((0, -0.3, -1)).normalized() * 0.1, 0.07, LUZ("luz"), 16)
    # prateleira de baixo: caixa plastica com pecas, motor de reserva, balde
    # caixa plastica vazada (bacia com aba, parede interna e pecas dentro)
    k.cuba(V((-0.8, -0.375, 0.212)), 0.25, 0.22, [(0.0, 0.0), (0.92, 0.0), (0.97, 0.02), (1.0, 0.22), (1.04, 0.235), (1.04, 0.245), (0.95, 0.245),
                                                (0.93, 0.225), (0.9, 0.03), (0.85, 0.015), (0.0, 0.015)], COR("azul_claro"), 28, 0.18)
    for i in range(6):
        k.bloco(-1.0 + i * 0.075, -0.598, 0.27, -0.97 + i * 0.075, -0.592, 0.40, COR("azul_claro"), 0.0, 0)   # nervuras
    for i, (dx, dy) in enumerate(((-0.1, -0.06), (0.05, 0.04), (0.1, -0.08), (-0.05, 0.08))):
        k.cil((-0.8 + dx, -0.375 + dy, 0.23), (-0.8 + dx, -0.375 + dy, 0.27), 0.035, "EB_Aco_Inox", 14)      # rolamentos
        k.cil((-0.8 + dx, -0.375 + dy, 0.229), (-0.8 + dx, -0.375 + dy, 0.271), 0.016, COR("grafite"), 10)
    motor(k, (-0.25, -0.38, 0.33), (0.15, -0.38, 0.33), 0.1, COR("azul_motor"), 14, True, True)
    # balde com parede interna, aba e alca
    k.torno(V((0.62, -0.4, 0.212)), V((0, 0, 1)), [(0.0, 0.0), (0.1, 0.0), (0.125, 0.25), (0.135, 0.26), (0.135, 0.27), (0.12, 0.265), (0.095, 0.015), (0.0, 0.015)],
            20, COR("cinza_claro"), False, False)
    k.tubo([(0.49, -0.4, 0.44), (0.5, -0.4, 0.6), (0.62, -0.4, 0.66), (0.74, -0.4, 0.6), (0.75, -0.4, 0.44)], 0.004, "EB_Aco_Galvanizado", 6, raio_curva=0.08)
    return malha(k, 40)


BANCADA = (IX0, 75.9, 90.0)


def oficina(M, k_hid):
    x, y, g = BANCADA
    pos("EB_Bancada_Oficina", malha_bancada(M), x, y, FZ, g)
    col_local("EB_Equipamento", x, y, g, -1.22, -0.78, 1.22, 0.0, 0.15, FZ + 0.95)
    hidrante(k_hid, IX0, 52.6, 53.4)
    col("EB_Equipamento", IX0, 52.55, 0.15, IX0 + 0.3, 53.45, FZ + 1.75)


def ralo_linear(k, x0, x1, y, larg=0.15):
    """Ralo linear sanitario: moldura de inox, grelha com fendas (eb_oficina GRELHA_RALO, em gomos de 0,5 m) e caixa sifonada."""
    IN = "EB_Aco_Inox"
    z = FZ + 0.004
    k.bloco(x0 - 0.02, y - larg / 2 - 0.02, FZ, x1 + 0.02, y - larg / 2, z + 0.004, IN, 0.002, 1)        # abas da moldura
    k.bloco(x0 - 0.02, y + larg / 2, FZ, x1 + 0.02, y + larg / 2 + 0.02, z + 0.004, IN, 0.002, 1)
    k.bloco(x0 - 0.02, y - larg / 2, FZ, x0, y + larg / 2, z + 0.004, IN, 0.002, 1)
    k.bloco(x1, y - larg / 2, FZ, x1 + 0.02, y + larg / 2, z + 0.004, IN, 0.002, 1)
    n = max(1, int(round((x1 - x0 - 0.3) / 0.5)))
    seg = (x1 - x0 - 0.3) / n
    for i in range(n):
        cx = x0 + seg * (i + 0.5)
        k.placa_o(V((cx, y, z + 0.002)), (1, 0, 0), (0, 1, 0), seg - 0.004, larg, "GRELHA_RALO")
        k.bloco(cx + seg / 2 - 0.002, y - larg / 2, z, cx + seg / 2 + 0.002, y + larg / 2, z + 0.003, IN, 0.0, 0)   # junta
    k.placa_o(V((x1 - 0.15, y, z + 0.002)), (1, 0, 0), (0, 1, 0), 0.296, larg, "CAIXA_RALO")             # caixa sifonada
