# Cidade - etapa 3: vegetacao (arborizacao urbana, pracas, faixas verdes de borda), postes com fiacao, pontos de
# onibus, placas, carros estacionados, luzes reais (poucas, sem sombra) e marcadores. Tudo instanciado (malha
# vinculada) a partir de prototipos P_* do bar e do kit K_* da cidade. Colisao so no tronco/poste/abrigo/carro.
import bpy, math, random, json, os, sys
from mathutils import Vector, Matrix
SP = r"C:\Users\rafael\BarBoteco\scripts"
if SP not in sys.path:
    sys.path.insert(0, SP)
import importlib
import barlib as B
import cidadelib as C
importlib.reload(C)

ETAPA = "props"
ZC = C.ZC
print("removidos:", C.limpar_etapa(ETAPA))
G, Q = C.plano()
MM = C.Malhas(ETAPA)
DEST = {"Fiacao": "PROPS", "Sinalizacao_Extra": "ROADS", "Vegetacao_LOD2": "LOD", "Borda": "VISUAL"}
with open(os.path.join(B.EXPORT_DIR, "cidade", "cidade_lotes.json"), encoding="utf-8") as f:
    REG = json.load(f)
rnd = random.Random(424242)
stats = {}


def conta(k, n=1):
    stats[k] = stats.get(k, 0) + n


def ang(v):
    return math.degrees(math.atan2(v.y, v.x))


# ============================================================== kit (prototipos novos; LODs das arvores)
def kit():
    def ico(m, mat, M, sub=0):
        m.sphere(mat, M, subdiv=sub, smooth=True)

    def arv_lod1(nome, folhas, h_tronco, r_copa, z_copa, achata=0.8):
        if nome in bpy.data.meshes:
            return
        m = B.Mesh(nome)
        m.cyl(0.16, h_tronco, "Casca", segs=5, caps=(False, False))
        ico(m, folhas, Matrix.Translation((0, 0, z_copa)) @ Matrix.Diagonal((r_copa, r_copa, r_copa * achata, 1)), 0)
        m.mesh()
    arv_lod1("K_Arvore_LOD1", "Folhas", 2.4, 1.8, 3.2)
    arv_lod1("K_Arvore_Ipe_LOD1", "Folhas_Ipe", 2.4, 1.7, 3.3)
    if "K_Eucalipto" not in bpy.data.meshes:
        m = B.Mesh("K_Eucalipto")
        m.cyl(0.22, 15.0, "Casca", segs=6, r2=0.08, caps=(False, False))
        for (z, r) in ((11.0, 2.2), (14.5, 1.6)):
            m.sphere("Cid_Eucalipto", Matrix.Translation((0, 0, z)) @ Matrix.Diagonal((r, r, r * 1.5, 1)), subdiv=1,
                     jitter=0.25, rng=random.Random(5))
        m.mesh()
    if "K_Eucalipto_LOD1" not in bpy.data.meshes:
        m = B.Mesh("K_Eucalipto_LOD1")
        m.cyl(0.22, 15.0, "Casca", segs=4, r2=0.08, caps=(False, False))
        m.sphere("Cid_Eucalipto", Matrix.Translation((0, 0, 12.5)) @ Matrix.Diagonal((2.2, 2.2, 3.6, 1)), subdiv=0)
        m.mesh()
    if "K_Arbusto" not in bpy.data.meshes:
        m = B.Mesh("K_Arbusto")
        m.sphere("Cid_Mata", Matrix.Translation((0, 0, 0.9)) @ Matrix.Diagonal((1.8, 1.8, 1.2, 1)), subdiv=1, jitter=0.2,
                 rng=random.Random(9))
        m.mesh()
    # placas de transito (poste + chapa com regiao do atlas da cidade)
    placas = {"K_Placa_PARE": ((0, 896, 128, 1024), 'oct'), "K_Placa_40": ((128, 896, 256, 1024), 'circ'),
              "K_Placa_Proib_Est": ((256, 896, 384, 1024), 'circ'), "K_Placa_Lombada": ((384, 896, 512, 1024), 'los'),
              "K_Placa_Sentido": ((512, 896, 640, 1024), 'ret'), "K_Placa_Escola": ((640, 896, 768, 1024), 'ret'),
              "K_Placa_Distrito": ((768, 896, 1024, 1024), 'larga')}
    for nome, (reg, forma) in placas.items():
        if nome in bpy.data.meshes:
            continue
        m = B.Mesh(nome)
        m.cyl(0.035, 2.6, "Metal_Escuro", segs=6)
        u0, v0, u1, v1 = B.arect(*reg)
        larg = 1.6 if forma == 'larga' else 0.6
        alt = 0.8 if forma == 'larga' else 0.6
        zc = 2.3
        if forma == 'oct':
            pts2 = [(0.3 * math.cos(math.radians(22.5 + 45 * k)), 0.3 * math.sin(math.radians(22.5 + 45 * k))) for k in range(8)]
        elif forma == 'circ':
            pts2 = [(0.3 * math.cos(math.radians(30 * k)), 0.3 * math.sin(math.radians(30 * k))) for k in range(12)]
        elif forma == 'los':
            pts2 = [(0.0, -0.3), (0.3, 0.0), (0.0, 0.3), (-0.3, 0.0)]
        else:
            pts2 = [(-larg / 2, -alt / 2), (larg / 2, -alt / 2), (larg / 2, alt / 2), (-larg / 2, alt / 2)]
        sx, sy = (larg, alt) if forma in ('ret', 'larga') else (0.6, 0.6)
        frente = [(px, -0.05, zc + py) for (px, py) in pts2]
        uvs = [(u0 + (px / sx + 0.5) * (u1 - u0), v0 + (py / sy + 0.5) * (v1 - v0)) for (px, py) in pts2]
        m.face(frente, "Cid_Atlas", uvs=uvs)
        m.face([(px, -0.03, zc + py) for (px, py) in reversed(pts2)], "Metal_Escuro")
        m.mesh()
    for me in bpy.data.meshes:
        if me.name.startswith("K_"):
            me.use_fake_user = True
    for p, l1 in (("P_Arvore_A", "K_Arvore_LOD1"), ("P_Arvore_B", "K_Arvore_LOD1"), ("P_Arvore_Ipe", "K_Arvore_Ipe_LOD1"),
                  ("K_Eucalipto", "K_Eucalipto_LOD1")):
        bpy.data.meshes[p]["lod1"] = l1
        bpy.data.meshes[p]["lod_dist_m"] = [0, 70, 160]


kit()
ARV = {'a': "P_Arvore_A", 'b': "P_Arvore_B", 'ipe': "P_Arvore_Ipe"}


def lod2_copa(x, y, z, r, h, mat="Folhas"):
    m = MM.get("Vegetacao_LOD2", x, y)
    c = Vector((x, y, z + h))
    pts = [c + Vector((r, 0, 0)), c + Vector((0, r, 0)), c + Vector((-r, 0, 0)), c + Vector((0, -r, 0))]
    top, bot = c + Vector((0, 0, r * 0.8)), c + Vector((0, 0, -r * 0.7))
    for k in range(4):
        a, b_ = pts[k], pts[(k + 1) % 4]
        m.face([a, b_, top], mat, facing=tuple(((a + b_) / 2 - c).normalized()))
        m.face([b_, a, bot], mat, facing=tuple(((a + b_) / 2 - c).normalized()))


def arvore(x, y, tipo='a', z=ZC, col=True, escala=None, sub="VEGETATION"):
    proto = ARV.get(tipo, tipo)
    s = escala or rnd.uniform(0.85, 1.2)
    o = C.inst(proto, "Arvore", sub, (x, y, z), rnd.uniform(0, 360), ETAPA, scale=(s, s, s))
    o["lod_grupo"] = "arvore"
    if col:
        C.colisor("Cid_Arvore", (x - 0.15, y - 0.15, z), (x + 0.15, y + 0.15, z + 2.5), ETAPA)
    if proto == "K_Eucalipto":
        lod2_copa(x, y, z, 2.2 * s, 12.0 * s, "Cid_Eucalipto")
    elif proto == "K_Arbusto":
        pass
    else:
        lod2_copa(x, y, z, 1.7 * s, 3.2 * s, "Folhas_Ipe" if proto == "P_Arvore_Ipe" else "Folhas")
    conta("arvore")
    return o


# ============================================================== obstaculos ja conhecidos
PORTOES = [(Vector((p[0], p[1])), p[2]) for p in REG["portoes"]]
grade_port = {}
for (p, w) in PORTOES:
    grade_port.setdefault((int(p.x // 20), int(p.y // 20)), []).append((p, w))


def perto_portao(p, folga=1.5):
    k = (int(p.x // 20), int(p.y // 20))
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for (g, w) in grade_port.get((k[0] + dx, k[1] + dy), ()):
                if (g - p).length < w / 2 + folga:
                    return True
    return False


class Ocupado:
    """Pontos de postes/abrigos (para as arvores evitarem), em grade de 10 m."""
    def __init__(self):
        self.g = {}

    def append(self, p):
        self.g.setdefault((int(p.x // 10), int(p.y // 10)), []).append(Vector((p.x, p.y)))

    def perto(self, p, r):
        k = (int(p.x // 10), int(p.y // 10))
        return any((o - p).length < r for dx in (-1, 0, 1) for dy in (-1, 0, 1) for o in self.g.get((k[0] + dx, k[1] + dy), ()))


ocupado = Ocupado()


def livre(p, r=2.5):
    return not ocupado.perto(p, r) and not perto_portao(p)


# ============================================================== postes + fiacao
def pontos_fio(base):
    return [base + Vector((0, 0, z)) for z in (9.43, 8.95, 7.75, 6.9)]


def vao(pa, pb, n=6):
    for a, c in zip(pa, pb):
        L = (c - a).length
        if L < 0.5 or L > 48:
            continue
        sag = 0.25 + 0.012 * L
        pts = [a.lerp(c, t / n) - Vector((0, 0, sag * 4 * (t / n) * (1 - t / n))) for t in range(n + 1)]
        hz = Vector((0, 0, 0.012))
        mid = pts[n // 2]
        MM.get("Fiacao", mid.x, mid.y).face([pts[0] - hz] + [p - hz for p in pts[1:]] + [p + hz for p in reversed(pts)], "Fio")


postes_por_aresta = {}
cnt = 0
for (u, v), vi in G.arestas.items():
    t = G.tipo(u, v)
    if t in ('virt', 'rot'):
        continue
    fl, il = G.semi[(u, v)]
    q = Q[fl]
    if q.externa or q.antiga:
        continue
    s, e = C.segmentos(q, q.ext, il)
    L = (e - s).length
    if L < 14:
        continue
    d = (e - s).normalized()
    nin = C.perp(d)
    passo = 30.0 if t not in ('ind', 'ind_loc', 'av') else 34.0
    k = max(1, int((L - 10) / passo))
    lista = []
    for j in range(k + 1):
        tt = 5.0 + (L - 10.0) * j / max(1, k)
        p = s + d * tt + nin * 0.45
        if perto_portao(p, 0.8):
            p = p + d * 3.2
        cnt += 1
        alto = q.zona == "INDUSTRIAL"
        proto = "P_Poste_Trafo" if cnt % 5 == 0 else ("P_Poste_Luz" if rnd.random() < 0.85 or t in ('av', 'ind', 'anel') else "P_Poste")
        o = C.inst(proto, "Poste", "PROPS", (p.x, p.y, ZC), ang(-nin), ETAPA, scale=(1, 1, 1.25) if alto else None)
        o["lod_grupo"] = "poste"
        C.colisor("Cid_Poste", (p.x - 0.17, p.y - 0.17, ZC), (p.x + 0.17, p.y + 0.17, ZC + 10.0), ETAPA)
        ocupado.append(p)
        lista.append(Vector((p.x, p.y, ZC + (2.5 if alto else 0.0))))
    for a, b_ in zip(lista[:-1], lista[1:]):
        vao(pontos_fio(a), pontos_fio(b_))
    postes_por_aresta[(u, v)] = lista
    conta("poste", len(lista))
# ligacao entre trechos consecutivos da mesma via (fio atravessa o cruzamento)
for (u, v), lista in postes_por_aresta.items():
    vi = G.arestas[(min(u, v), max(u, v))]
    d0 = (G.nos[v] - G.nos[u]).normalized()
    for w in G.viz[v]:
        if w == u:
            continue
        k2 = (v, w) if (v, w) in postes_por_aresta else None
        if k2 is None or G.arestas[(min(v, w), max(v, w))] != vi:
            continue
        if (G.nos[w] - G.nos[v]).normalized().dot(d0) > 0.85:
            vao(pontos_fio(lista[-1]), pontos_fio(postes_por_aresta[k2][0]))
# postes de canteiro central na avenida (luminaria dupla)
for (u, v), vi in G.arestas.items():
    if G.tipo(u, v) != 'av':
        continue
    for k_, (L0, L1, R1, R0) in enumerate(C.pecas_via(G, Q, u, v)):
        c0, c1 = (L0 + R0) / 2, (L1 + R1) / 2
        if (c1 - c0).length < 12:
            continue
        p = c0.lerp(c1, 0.5)
        d = (c1 - c0).normalized()
        nn = C.perp(d)
        for sgn in (1, -1):
            o = C.inst("P_Poste_Luz", "Poste_Canteiro", "PROPS", (p.x, p.y, ZC), ang(nn * sgn), ETAPA)
            o["lod_grupo"] = "poste"
        C.colisor("Cid_Poste", (p.x - 0.17, p.y - 0.17, ZC), (p.x + 0.17, p.y + 0.17, ZC + 10.0), ETAPA)
        conta("poste_canteiro")
        for f in (0.15, 0.85):
            pa = c0.lerp(c1, f)
            arvore(pa.x, pa.y, rnd.choice(('a', 'ipe', 'b')))

# ============================================================== arborizacao das calcadas
DENS = {"CENTRO": 0.55, "OLARIA": 0.5, "CONCEICAO": 0.92, "INDUSTRIAL": 0.45}
for q in Q:
    if q.externa or q.antiga or q.ilha:
        continue
    n = len(q.nos)
    rq = random.Random(300 + q.id)
    for i in range(n):
        if not q.real[i]:
            continue
        t = q.tipos[i]
        dens = DENS[q.zona]
        if q.zona == "INDUSTRIAL" and t in ('ind', 'av'):
            dens = 0.85
        if q.toda_calcada:
            dens *= 0.8
        s, e = C.segmentos(q, q.ext, i)
        L = (e - s).length
        if L < 12:
            continue
        d = (e - s).normalized()
        nin = C.perp(d)
        tt = 6.0 + rq.uniform(0, 4)
        while tt < L - 6.0:
            p = s + d * tt + nin * 0.85
            if rq.random() < dens and livre(p):
                tipo = 'ipe' if rq.random() < (0.25 if q.zona == "CONCEICAO" else 0.12) else rq.choice(('a', 'b'))
                arvore(p.x, p.y, tipo)
                if q.zona == "CENTRO" and not q.toda_calcada:
                    C.inst("P_Canteiro", "Canteiro", "VEGETATION", (p.x, p.y, ZC), 0.0, ETAPA)
            tt += rq.uniform(9.0, 15.0)
# arvores de pracas/POIs
for (x, y, tipo) in REG["arvores_poi"]:
    arvore(x, y, tipo)
# ilha da rotatoria
for q in Q:
    if q.ilha:
        arvore(q.c.x, q.c.y, 'ipe', escala=1.4)
        for k in range(6):
            a = 2 * math.pi * k / 6
            C.inst("K_Arbusto", "Arbusto", "VEGETATION", (q.c.x + 4.0 * math.cos(a), q.c.y + 4.0 * math.sin(a), ZC), 0, ETAPA,
                   scale=(0.6, 0.6, 0.6))

# ============================================================== faixa verde nos limites (esconde a borda)
H = C.HALF
for q in Q:
    if q.externa or q.antiga or q.toda_calcada or q.ilha:
        continue
    if not any(abs(G.nos[i].x) >= H - 0.5 or abs(G.nos[i].y) >= H - 0.5 for i in q.nos):
        continue
    if q.zona == "INDUSTRIAL" and q.c.x > 377:
        continue
    rb = random.Random(700 + q.id)
    xs = [p.x for p in q.poly_int]
    ys = [p.y for p in q.poly_int]
    # faixas: sul -> eucaliptos + muro; oeste -> eucaliptos + cerca; norte -> mata ciliar
    for (lado, a0, a1) in (("S", min(xs), max(xs)), ("N", min(xs), max(xs)), ("W", min(ys), max(ys)), ("E", min(ys), max(ys))):
        if lado == "S" and min(ys) > -H + 1:
            continue
        if lado == "N" and max(ys) < H - 1:
            continue
        if lado == "W" and min(xs) > -H + 1:
            continue
        if lado == "E" and max(xs) < H - 1:
            continue
        t = a0 + 2.0
        while t < a1 - 2.0:
            for prof in ((3.0, 8.0) if lado != "N" else (2.5, 6.5, 10.5)):
                if lado == "S":
                    p = Vector((t + rb.uniform(-1, 1), -H + prof))
                elif lado == "N":
                    p = Vector((t + rb.uniform(-1.5, 1.5), H - prof))
                elif lado == "W":
                    p = Vector((-H + prof, t + rb.uniform(-1, 1)))
                else:
                    p = Vector((H - prof, t))
                if not C.dentro(p, q.poly_int):
                    continue
                if lado == "N":
                    if rb.random() < 0.75:
                        arvore(p.x, p.y, rb.choice(('a', 'b', 'b')), escala=rb.uniform(1.1, 1.6))
                    else:
                        C.inst("K_Arbusto", "Arbusto", "VEGETATION", (p.x, p.y, ZC), rb.uniform(0, 360), ETAPA)
                else:
                    arvore(p.x, p.y, "K_Eucalipto", escala=rb.uniform(0.85, 1.15))
            t += rb.uniform(4.5, 6.5) if lado != "N" else rb.uniform(3.5, 5.0)
    conta("quadra_borda")
# muro de divisa (sul), cerca de arame (oeste) e alambrado (norte) no limite
mb = None
for k in range(C.NS):
    a = -H + k * C.SETOR
    m = MM.get("Borda", (k, 0))
    m.box((a, -H + 0.2, ZC), (a + C.SETOR, -H + 0.4, ZC + 2.6), "Cid_Concreto_Pre", skip=('nz',))
    for j in range(5):
        if rnd.random() < 0.5:
            x = a + 10 + j * 18
            u0, v0, u1, v1 = B.arect(768, 768, 896, 896)
            m.face([(x, -H + 0.45, ZC + 0.3), (x + 2.5, -H + 0.45, ZC + 0.3), (x + 2.5, -H + 0.45, ZC + 2.2), (x, -H + 0.45, ZC + 2.2)],
                   "Cid_Atlas", uvs=[(u1, v0), (u0, v0), (u0, v1), (u1, v1)])
    m = MM.get("Borda", (0, k))
    y = a
    while y < a + C.SETOR:
        m.box((-H + 0.6, y, ZC), (-H + 0.72, y + 0.12, ZC + 1.6), "Madeira_Escura", skip=('nz',))
        y += 3.0
    for z in (0.6, 1.0, 1.4):
        m.box((-H + 0.64, a, ZC + z), (-H + 0.68, a + C.SETOR, ZC + z + 0.02), "Metal_Escuro", skip=('nz',))
    m = MM.get("Borda", (k, C.NS - 1))
    x = a
    while x < a + C.SETOR:
        m.cyl(0.04, 2.4, "Metal_Escuro", segs=5, M=Matrix.Translation((x, H - 0.6, ZC)), caps=(False, True))
        x += 3.0
    for z in (0.3, 1.3, 2.35):
        m.box((a, H - 0.62, ZC + z), (a + C.SETOR, H - 0.58, ZC + z + 0.03), "Metal_Escuro", skip=('nz',))

# ============================================================== pontos de onibus
def lado_calcada(q, i, f, dist):
    s, e = C.segmentos(q, q.ext, i)
    d = (e - s).normalized()
    return s.lerp(e, f) + C.perp(d) * dist, d


paradas = []
acum = {}
for (u, v), vi in sorted(G.arestas.items(), key=lambda kv: (G.nos[kv[0][0]].x, G.nos[kv[0][0]].y)):
    t = G.tipo(u, v)
    if C.VIA[t]['cls'] < 2 and t != 'centro':
        continue
    nm = G.attr(u, v).get("nome", t)
    L = (G.nos[u] - G.nos[v]).length
    acum[nm] = acum.get(nm, 0.0) + L
    alvo = 230.0 if t in ('av', 'anel', 'ind') else 260.0
    if acum[nm] < alvo or L < 40:
        continue
    acum[nm] = 0.0
    lado = (u, v) if len(paradas) % 2 == 0 else (v, u)
    fi, ii = G.semi[lado]
    q = Q[fi]
    if q.externa or q.antiga or C.VIA[q.tipos[ii]]['calc'] < 2.9:
        continue
    p, d = lado_calcada(q, ii, 0.5, 1.45)
    if perto_portao(p, 2.0):
        p, d = lado_calcada(q, ii, 0.35, 1.45)
    paradas.append((p, d, q.zona))
for (x, y, rot, terminal) in REG["pontos_onibus"]:
    pass
for k, (p, d, zona) in enumerate(paradas):
    nout = -C.perp(d)
    rot = math.degrees(math.atan2(nout.x, -nout.y))
    o = C.inst("P_Ponto_Onibus", "Ponto_Onibus", "PROPS", (p.x, p.y, ZC), rot, ETAPA)
    B_ = [o.matrix_world @ Vector(c) for c in o.bound_box]
    C.colisor_obb("Cid_Ponto_Onibus", p, d, 3.7, 1.1, ZC, ZC + 2.75, ETAPA)
    e = bpy.data.objects.new("Ponto_Onibus_%02d" % (k + 1), None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = 0.5
    e.location = (p.x, p.y, ZC)
    e.rotation_euler = (0, 0, math.radians(rot - 90))
    e["zona"] = zona
    ix, iy = C.setor_de(p.x, p.y)
    C.sub(ix, iy, "MARKERS").objects.link(e)
    C.marcar(e, ETAPA, ix, iy)
    ocupado.append(p)
    lx = p - d * 2.6
    C.inst("P_Lixeira", "Lixeira", "PROPS", (lx.x, lx.y, ZC), 0.0, ETAPA)
conta("ponto_onibus", len(paradas))

# ============================================================== placas: nome de rua, PARE, sentido unico, velocidade
CLS = lambda t: C.VIA[t]['cls']
for n, nb in G.viz.items():
    reais = [m for m in nb if G.real(n, m)]
    if len(reais) < 3:
        continue
    zona = C.zona_de(G.nos[n].x, G.nos[n].y)
    cls_max = max(CLS(G.tipo(n, m)) for m in reais)
    primeira = True
    for m_ in reais:
        fi, idx = G.semi[(n, m_)]
        q = Q[fi]
        if q.externa or q.antiga or q.ilha:
            continue
        cl = q.ext[idx]
        canto = cl[len(cl) // 2]
        dentro_ = (q.c - canto).normalized()
        if primeira and (zona == "CENTRO" or rnd.random() < 0.6):
            p = canto + dentro_ * 1.1
            C.inst("P_Placa_Rua_A" if rnd.random() < 0.5 else "P_Placa_Rua_B", "Placa_Rua", "PROPS", (p.x, p.y, ZC), ang(dentro_), ETAPA)
            primeira = False
            conta("placa_rua")
    for m_ in reais:
        t = G.tipo(n, m_)
        if CLS(t) >= cls_max or G.attr(n, m_).get("mao_unica"):
            continue
        # placa PARE no lado direito de quem chega ao no n vindo de m_
        dviagem = (G.nos[n] - G.nos[m_]).normalized()
        direita = Vector((dviagem.y, -dviagem.x))
        fi, idx = G.semi[(m_, n)]                                       # face a esquerda de m_->n ... queremos a da direita
        fi, idx = G.semi[(n, m_)]
        q = Q[fi]
        if q.externa or q.antiga:
            continue
        s_, e_ = C.segmentos(q, q.ext, idx)
        base = s_ if (s_ - G.nos[n]).length < (e_ - G.nos[n]).length else e_
        p = base - dviagem * 1.5 + (q.c - base).normalized() * 0.5
        rot = math.degrees(math.atan2(-dviagem.x, dviagem.y))
        C.inst("K_Placa_PARE", "Placa_PARE", "PROPS", (p.x, p.y, ZC), rot, ETAPA)
        conta("placa_pare")
# sentido unico e velocidade
for (u, v), vi in G.arestas.items():
    t = G.tipo(u, v)
    a = G.attr(u, v)
    if t == 'centro' and a.get("mao_unica") and rnd.random() < 0.6:
        fi, il = G.semi[(u, v)]
        q = Q[fi]
        if q.externa or q.antiga:
            continue
        p, d = lado_calcada(q, il, 0.5, 0.5)
        C.inst("K_Placa_Sentido", "Placa_Sentido", "PROPS", (p.x, p.y, ZC), ang(d) - 90, ETAPA)
        conta("placa_sentido")
    elif t in ('av', 'anel', 'ind') and rnd.random() < 0.3:
        fi, il = G.semi[(u, v)]
        q = Q[fi]
        if q.externa or q.antiga:
            continue
        p, d = lado_calcada(q, il, 0.2, 0.5)
        C.inst("K_Placa_40", "Placa_40", "PROPS", (p.x, p.y, ZC), ang(d) + 90, ETAPA)
        conta("placa_40")
for (x, y, rot) in REG.get("placas_escola", []):
    C.inst("K_Placa_Escola", "Placa_Escola", "PROPS", (x, y, ZC), rot + 180, ETAPA)
for (x, y, rot) in ((184 + 9.5, -150.0, 90.0), (184 + 9.5, 150.0, 90.0), (174.5, -160.0, -90.0)):
    C.inst("K_Placa_Distrito", "Placa_Distrito", "PROPS", (x, y, ZC), rot, ETAPA)
# transito acalmado em volta da praca do bairro original: lombadas pintadas + placas
for (cx, cy, eixo) in ((16.0, 33.0, 'x'), (-7.0, 53.0, 'y'), (39.0, 53.0, 'y'), (16.0, 73.0, 'x')):
    m = MM.get("Sinalizacao_Extra", cx, cy)
    for k in range(7):
        if eixo == 'x':
            x0 = cx - 8.5 + k * 0.0
            pts = [(cx - 1.6 + k * 0.0, cy - 3.9), (cx + 1.6, cy - 3.9), (cx + 1.6, cy + 3.9), (cx - 1.6, cy + 3.9)]
        else:
            pts = [(cx - 3.9, cy - 1.6), (cx + 3.9, cy - 1.6), (cx + 3.9, cy + 1.6), (cx - 3.9, cy + 1.6)]
    m.face([(x, y, 0.007) for (x, y) in pts], "Cid_Pintura_Amarela", facing=(0, 0, 1))
    for k in range(4):
        f = -1.2 + k * 0.8
        if eixo == 'x':
            q4 = [(cx + f, cy - 3.9), (cx + f + 0.35, cy - 3.9), (cx + f + 0.35, cy + 3.9), (cx + f, cy + 3.9)]
        else:
            q4 = [(cx - 3.9, cy + f), (cx + 3.9, cy + f), (cx + 3.9, cy + f + 0.35), (cx - 3.9, cy + f + 0.35)]
        m.face([(x, y, 0.008) for (x, y) in q4], "Pintura_Branca", facing=(0, 0, 1))
    conta("lombada_pintada")

# ============================================================== bancos, lixeiras, orelhoes
for (x, y, rot) in REG["bancos"]:
    C.inst("P_Banco_Praca", "Banco", "PROPS", (x, y, ZC + 0.02), rot, ETAPA)
    C.colisor_obb("Cid_Banco", Vector((x, y)), Vector((math.cos(math.radians(rot)), math.sin(math.radians(rot)))), 1.8, 0.6, ZC, ZC + 0.9, ETAPA)
conta("banco", len(REG["bancos"]))
for (x, y, tipo) in REG["postes_poi"]:
    if tipo == 'alto':
        o = C.inst("P_Poste_Luz", "Poste_Patio", "PROPS", (x, y, ZC), rnd.uniform(0, 360), ETAPA, scale=(1, 1, 1.35))
    else:
        o = C.inst("P_Poste", "Luminaria_Praca", "PROPS", (x, y, ZC), 0.0, ETAPA, scale=(0.6, 0.6, 0.42))
    o["lod_grupo"] = "poste"
    C.colisor("Cid_Poste", (x - 0.15, y - 0.15, ZC), (x + 0.15, y + 0.15, ZC + 4.5), ETAPA)
for q in Q:
    if q.externa or q.antiga or q.zona != "CENTRO" or q.toda_calcada:
        continue
    if q.c.y < 159:
        continue
    i = max(range(len(q.nos)), key=lambda k: q.L[k] if q.real[k] else 0)
    p, d = lado_calcada(q, i, 0.3, 0.6)
    C.inst("P_Lixeira", "Lixeira", "PROPS", (p.x, p.y, ZC), 0.0, ETAPA)
    if q.id % 3 == 0:
        p, d = lado_calcada(q, i, 0.7, 0.7)
        C.inst("P_Orelhao", "Orelhao", "PROPS", (p.x, p.y, ZC), ang(d), ETAPA)
        C.colisor("Cid_Orelhao", (p.x - 0.4, p.y - 0.4, ZC), (p.x + 0.4, p.y + 0.4, ZC + 2.2), ETAPA)

# ============================================================== carros estacionados (ruas locais e do centro)
CARROS = ["P_Carro_Prata", "P_Carro_Vermelho", "P_Carro_Branco", "P_Carro_Azul", "P_Carro_Preto", "P_Sedan_Prata",
          "P_Sedan_Branco", "P_Sedan_Preto"]
rc = random.Random(77)
n_car = 0
for (u, v), vi in G.arestas.items():
    t = G.tipo(u, v)
    if t not in ('local', 'local10', 'centro', 'col', 'ind_loc'):
        continue
    for lado in ((u, v), (v, u)):
        if rc.random() > 0.32:
            continue
        fi, ii = G.semi[lado]
        q = Q[fi]
        if q.externa or q.antiga:
            continue
        s, e = C.segmentos(q, q.ext, ii)
        L = (e - s).length
        if L < 24:
            continue
        d = (e - s).normalized()
        usados = []
        for _ in range(rc.choice((1, 1, 2))):
            tt = rc.uniform(9, L - 9)
            if any(abs(tt - u_) < 6 for u_ in usados):
                continue
            p = s + d * tt - C.perp(d) * 1.1
            if perto_portao(p + C.perp(d) * 2.0, 1.0):
                continue
            usados.append(tt)
            o = C.inst(rc.choice(CARROS), "Carro", "PROPS", (p.x, p.y, 0.0), ang(d), ETAPA)
            o["lod_grupo"] = "carro"
            C.colisor_obb("Cid_Carro", p, d, 4.1, 2.0, 0.0, 1.45, ETAPA)
            n_car += 1
conta("carro", n_car)

# ============================================================== luzes reais (poucas, sem sombra) e marcadores
def luz(nome, loc, energia, cor=(1.0, 0.85, 0.65)):
    ld = bpy.data.lights.new(nome, 'POINT')
    ld.energy = energia
    ld.color = cor
    ld.shadow_soft_size = 0.5
    ld.use_shadow = False
    try:
        ld.cutoff_distance = 30.0
        ld.use_custom_distance = True
    except Exception:
        pass
    ix, iy = C.setor_de(loc[0], loc[1])
    o = bpy.data.objects.new(nome, ld)
    o.location = loc
    o["luz_noturna"] = True
    o["sombra"] = False
    C.sub(ix, iy, "PROPS").objects.link(o)
    C.marcar(o, ETAPA, ix, iy)
    conta("luz")


for (nome, x, y, z, e) in REG["luzes"]:
    luz(nome, (x, y, z), e)
for k, (x, y) in enumerate(((-30, 212), (62, 212), (-76, 159), (108, 159))):
    luz("Luz_Centro_%d" % (k + 1), (x, y, 7.0), 300.0)
for (nome, x, y, z, rot) in REG["marcadores"]:
    e = bpy.data.objects.new(nome, None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = 0.6
    e.location = (x, y, z)
    e.rotation_euler = (0, 0, math.radians(rot))
    ix, iy = C.setor_de(x, y)
    C.sub(ix, iy, "MARKERS").objects.link(e)
    C.marcar(e, ETAPA, ix, iy)
for (nome, x, y) in (("Bairro_Centro", 16.0, 186.0), ("Bairro_Parque_Olaria", -53.0, -244.0),
                     ("Bairro_Jardim_Conceicao", -255.0, 120.0), ("Bairro_Distrito_Industrial", 290.0, 0.0)):
    e = bpy.data.objects.new(nome, None)
    e.empty_display_type = 'CIRCLE'
    e.empty_display_size = 20.0
    e.location = (x, y, 0.2)
    e["bairro"] = nome[7:].replace("_", " ")
    ix, iy = C.setor_de(x, y)
    C.sub(ix, iy, "MARKERS").objects.link(e)
    C.marcar(e, ETAPA, ix, iy)

# LOD2 das arvores do bairro original (impostor no setor; os originais nao sao alterados)
for o in bpy.data.collections["Exterior_Mobiliario"].objects:
    if o.type == 'MESH' and o.data.name in ("P_Arvore_A", "P_Arvore_B", "P_Arvore_Ipe"):
        s = o.scale.x
        lod2_copa(o.location.x, o.location.y, o.location.z, 1.7 * s, 3.2 * s, "Folhas_Ipe" if o.data.name == "P_Arvore_Ipe" else "Folhas")
        conta("arvore_original_lod2")

objs = MM.build(DEST)
for o in objs:
    o["lod"] = 2 if o.name.endswith("_LOD2") else 0
print("props ok:", sorted(stats.items()), "| malhas", len(objs))
