# Cidade - etapa 1: setores, limites, ruas, calcadas, guias, sarjetas, cruzamentos, canteiros, sinalizacao e
# colisores de chao. Re-executavel (apaga so o que a propria etapa criou: cid_etapa == "base").
# Rodar no Blender MCP: exec(open(r"C:\Users\rafael\BarBoteco\scripts\22_cidade_base.py").read())
import bpy, math, random, json, os, sys
from mathutils import Vector, Matrix
SP = r"C:\Users\rafael\BarBoteco\scripts"
if SP not in sys.path:
    sys.path.insert(0, SP)
import importlib
import barlib as B
import cidadelib as C
importlib.reload(C)

ETAPA = "base"
ZC = C.ZC
scn = bpy.context.scene
rnd = random.Random(1950)

# ---------------------------------------------------------------- 0) itens do limite antigo -> obsoletos (preservados)
obs = bpy.data.collections.get("_OBSOLETO_Limite_Antigo")
if obs is None:
    obs = bpy.data.collections.new("_OBSOLETO_Limite_Antigo")
    scn.collection.children.link(obs)
    obs["descricao"] = ("Itens do mapa original que fechavam a area jogavel antiga (238 x 208 m) ou ficariam dentro da "
                        "cidade nova. Preservados aqui, fora da view layer e fora do export.")


def obsoletar(o, motivo):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    obs.objects.link(o)
    o["obsoleto"] = motivo


movidos = 0
for o in list(bpy.data.collections["Colisores"].objects):
    if o.name.startswith("COL_Rua_Limite"):
        obsoletar(o, "muro invisivel do limite antigo (bloquearia o acesso a cidade nova)"); movidos += 1
for o in list(bpy.data.collections["Exterior_Mobiliario"].objects):
    if o.type == 'MESH' and o.data.name in ("P_Cavalete", "P_Cone"):
        x, y = o.location.x, o.location.y
        if min(abs(x + 102.4), abs(x - 134.4), abs(y + 90.4), abs(y - 116.4)) < 2.0:
            obsoletar(o, "cavalete/cone fechando saida de rua no limite antigo"); movidos += 1
for o in list(bpy.data.collections["Exterior_Distante"].objects):
    obsoletar(o, "fundo distante antigo (predios a 200-360 m e morros a 430-560 m caem dentro da cidade nova)"); movidos += 1


def _acha_lc(lc, nome):
    if lc.collection.name == nome:
        return lc
    for ch in lc.children:
        r = _acha_lc(ch, nome)
        if r:
            return r


lc = _acha_lc(bpy.context.view_layer.layer_collection, obs.name)
if lc:
    lc.exclude = True
if "cid_hash_bar_original" not in scn:
    hb, nb = C.hash_bar()
    scn["cid_hash_bar_original"] = hb
    scn["cid_objs_bar_original"] = nb
if "area_jogavel_bairro_antigo" not in scn and "area_jogavel" in scn:
    scn["area_jogavel_bairro_antigo"] = list(scn["area_jogavel"])

# ---------------------------------------------------------------- 1) colecoes, materiais, limpeza
C.criar_setores()
C.materiais()
print("removidos da etapa anterior:", C.limpar_etapa(ETAPA), "| obsoletos movidos agora:", movidos)
G, Q = C.plano()
MM = C.Malhas(ETAPA)
DEST = {"Ruas": "ROADS", "Calcadas": "ROADS", "Terreno": "VISUAL", "Canteiro": "ROADS"}


def zq(q):
    return q.zona


def quad_z(m, pts, z, mat):
    if abs(C.area(pts)) < 0.003:
        return
    m.face([(p.x, p.y, z) for p in pts], mat, facing=(0, 0, 1))


def mesh_em(tipo, pts):
    c = sum(pts, Vector((0, 0))) / len(pts)
    return MM.get(tipo, c.x, c.y)


# ---------------------------------------------------------------- 2) quadras: calcadas, guias, meio-fio, sarjeta, chao
def faixas_anel(q, A, Bn, z, mat, tipo, so_reais=True, passo=20.0):
    """Tiras entre os aneis A e Bn (cantos + trechos retos), em pedacos por setor."""
    n = len(q.nos)
    for i in range(n):
        if q.real[i - 1] or q.real[i]:
            ca, cb = A[i], Bn[i]
            if len(ca) > 1 or len(cb) > 1:
                m = mesh_em(tipo, ca + cb)
                C.faixa(m, ca, cb, z, mat)
        if so_reais and not q.real[i]:
            continue
        a0, a1 = C.segmentos(q, A, i)
        b0, b1 = C.segmentos(q, Bn, i)
        fr = C.cortar(a0, a1, passo)
        for k in range(len(fr) - 1):
            pts = [a0.lerp(a1, fr[k]), a0.lerp(a1, fr[k + 1]), b0.lerp(b1, fr[k + 1]), b0.lerp(b1, fr[k])]
            quad_z(mesh_em(tipo, pts), pts, z, mat)


def meio_fio(q):
    n = len(q.nos)
    for i in range(n):
        cadeia = []
        if q.real[i - 1] or q.real[i]:
            cadeia += q.ext[i]
        if q.real[i]:
            a0, a1 = C.segmentos(q, q.ext, i)
            fr = C.cortar(a0, a1, 20.0)
            cadeia += [a0.lerp(a1, f) for f in fr]
        for p0, p1 in zip(cadeia[:-1], cadeia[1:]):
            d = p1 - p0
            if d.length < 0.02:
                continue
            m = mesh_em("Calcadas", [p0, p1])
            m.face([(p0.x, p0.y, 0.0), (p1.x, p1.y, 0.0), (p1.x, p1.y, ZC), (p0.x, p0.y, ZC)], "Concreto", facing=(d.y, -d.x, 0))


n_q = 0
for q in Q:
    if q.externa or q.antiga:
        continue
    n_q += 1
    matc = C.MAT_CALC[zq(q)]
    if abs(q.c.x - 16) < 400 and C.P[0] - 14 <= q.c.x <= C.P[1] + 14 and C.P[2] - 16 <= q.c.y <= C.P[3] + 13:
        matc = "Pedra_Portuguesa"                               # faixas em volta do bairro original
    meio_fio(q)
    faixas_anel(q, q.ext, q.guia, ZC, "Concreto", "Calcadas")                  # guia (topo do meio-fio)
    faixas_anel(q, q.ext, q.sarj, 0.004, "Cid_Sarjeta", "Ruas")               # sarjeta
    if q.ilha:                                                                  # ilha da rotatoria: grama ate a guia
        poly = C.achatar(q.guia)
        quad_z(MM.get("Calcadas", q.c.x, q.c.y), poly, ZC, "Grama")
        continue
    if q.toda_calcada:
        poly = C.achatar(q.guia)
        if len(poly) < 3 or C.area(poly) <= 1.0:
            poly = q.poly_ext
        quad_z(MM.get("Calcadas", q.c.x, q.c.y), poly, ZC, matc)
        continue
    if zq(q) == "CONCEICAO":                                                    # faixa de servico gramada
        q.gram = C.anel_de(q, lambda t: 0.95)
        faixas_anel(q, q.guia, q.gram, ZC, "Grama", "Calcadas")
        faixas_anel(q, q.gram, q.calc, ZC, matc, "Calcadas")
    else:
        faixas_anel(q, q.guia, q.calc, ZC, matc, "Calcadas")
    quad_z(MM.get("Terreno", q.c.x, q.c.y), q.poly_int, ZC, C.MAT_CHAO[zq(q)])

# ---------------------------------------------------------------- 3) leito das ruas, cruzamentos, canteiro central
CLS = lambda t: C.VIA[t]['cls']
n_pecas = 0
vias_json = {"nos": [], "arestas": []}
for (u, v), vi in G.arestas.items():
    t = G.tipo(u, v)
    if t == 'virt':
        continue
    pecas = C.pecas_via(G, Q, u, v)
    if not pecas:
        print("aviso: via sem quadras dos dois lados", u, v)
        continue
    for (L0, L1, R1, R0) in pecas:
        pts = [L0, L1, R1, R0]
        m = mesh_em("Ruas", pts)
        quad_z(m, pts, 0.0, "Asfalto")
        n_pecas += 1
        if rnd.random() < 0.16:                                                 # remendos de asfalto
            ax = (L1 - L0)
            if ax.length > 4:
                ax.normalize()
                w = C.perp(ax)
                c = (L0 + L1 + R0 + R1) / 4 + ax * rnd.uniform(-2, 2) + w * rnd.uniform(-1.5, 1.5)
                a, b = rnd.uniform(0.8, 2.0), rnd.uniform(0.5, 1.3)
                quad_z(m, [c - ax * a - w * b, c + ax * a - w * b, c + ax * a + w * b, c - ax * a + w * b], 0.002, "Cid_Asfalto_Remendo")
    if t == 'av':                                                               # canteiro central
        cw = C.VIA['av']['canteiro'] / 2
        for k, (L0, L1, R1, R0) in enumerate(pecas):
            c0, c1 = (L0 + R0) / 2, (L1 + R1) / 2
            ax = c1 - c0
            if ax.length < 1.0:
                continue
            axn = ax.normalized()
            w = C.perp(axn)
            if k == 0 and len(G.viz[u]) >= 3:
                c0 = c0 + axn * 1.5
            if k == len(pecas) - 1 and len(G.viz[v]) >= 3:
                c1 = c1 - axn * 1.5
            if (c1 - c0).length < 1.0:
                continue
            poly = [c0 - w * cw, c1 - w * cw, c1 + w * cw, c0 + w * cw]
            m = mesh_em("Canteiro", poly)
            m.prism([(p.x, p.y) for p in poly], 0.0, ZC, "Concreto", top_mat="Grama")
            C.colisor_obb("Cid_Canteiro", (c0 + c1) / 2, axn, (c1 - c0).length, 2 * cw, 0.0, ZC, ETAPA)
    a = G.attr(u, v)
    vias_json["arestas"].append({"a": u, "b": v, "tipo": t, "largura_m": C.VIA[t]['w'], "nome": a.get("nome", ""),
                                 "mao_unica": a.get("mao_unica", 0), "eixo_mao_unica": a.get("eixo", ""),
                                 "canteiro_m": C.VIA[t].get("canteiro", 0.0)})

n_av = 0
for n, nb in G.viz.items():
    if not nb or not any(G.real(n, m) for m in nb):
        continue
    c = G.nos[n]
    pts = []
    for m_ in nb:
        fi, idx = G.semi[(n, m_)]
        q = Q[fi]
        if q.externa or q.antiga:
            pts.append(c.copy())
        else:
            pts += q.ext[idx]
    pts.sort(key=lambda p: math.atan2(p.y - c.y, p.x - c.x))
    uniq = []
    for p in pts:
        if not uniq or (uniq[-1] - p).length > 0.05:
            uniq.append(p)
    if len(uniq) > 1 and (uniq[0] - uniq[-1]).length < 0.05:
        uniq.pop()
    if len(uniq) < 3 or abs(C.area(uniq)) < 0.3:
        continue
    m = MM.get("Ruas", c.x, c.y)
    for k in range(len(uniq)):
        p0, p1 = uniq[k], uniq[(k + 1) % len(uniq)]
        tri = [c, p0, p1]
        if C.area(tri) > 1e-4:
            m.face([(p.x, p.y, 0.0) for p in tri], "Asfalto", facing=(0, 0, 1))
    n_av += 1
for i, p in enumerate(G.nos):
    vias_json["nos"].append([round(p.x, 2), round(p.y, 2)])


# ---------------------------------------------------------------- 4) sinalizacao horizontal
def eixo_via(pecas):
    return [(pc[0] + pc[3]) / 2 for pc in pecas] + [(pecas[-1][1] + pecas[-1][2]) / 2]


def tira(m, a, b, off, larg, mat, z=0.006):
    d = b - a
    if d.length < 0.05:
        return
    dn = d.normalized()
    w = C.perp(dn)
    p = [a + w * (off - larg / 2), b + w * (off - larg / 2), b + w * (off + larg / 2), a + w * (off + larg / 2)]
    m.face([(q_.x, q_.y, z) for q_ in p], mat, facing=(0, 0, 1))


def linha(eixo, off, larg, mat, traco=None, vao=None, ini=0.0, fim=0.0):
    """Linha (continua ou tracejada) ao longo da polilinha `eixo`, afastada `off` (positivo = esquerda)."""
    L = [0.0]
    for a, b in zip(eixo[:-1], eixo[1:]):
        L.append(L[-1] + (b - a).length)
    tot = L[-1]

    def ponto(s):
        for j in range(len(eixo) - 1):
            if L[j + 1] >= s:
                t = 0 if L[j + 1] - L[j] < 1e-9 else (s - L[j]) / (L[j + 1] - L[j])
                return eixo[j].lerp(eixo[j + 1], t)
        return eixo[-1]
    s = ini
    while s < tot - fim - 0.5:
        e = min(s + (traco or 10.0), tot - fim)
        a, b = ponto(s), ponto(e)
        tira(MM.get("Ruas", (a.x + b.x) / 2, (a.y + b.y) / 2), a, b, off, larg, mat)
        s = e + (vao or 0.0)


SETA = [(-0.15, -1.6), (0.15, -1.6), (0.15, 0.3), (0.55, 0.3), (0.0, 1.6), (-0.55, 0.3), (-0.15, 0.3)]
pare_me = bpy.data.meshes.get("Rua_PARE_txt")
n_faixas = n_pare = 0
NOS_FAIXA = set()
for n, nb in G.viz.items():
    reais = [m for m in nb if G.real(n, m)]
    if len(reais) >= 3:
        z = C.zona_de(G.nos[n].x, G.nos[n].y)
        if z == "CENTRO" or any(G.tipo(n, m) in ('av', 'rot') for m in reais):
            NOS_FAIXA.add(n)
for (u, v), vi in G.arestas.items():
    t = G.tipo(u, v)
    if t == 'virt':
        continue
    pecas = C.pecas_via(G, Q, u, v)
    if not pecas:
        continue
    eixo = eixo_via(pecas)
    W = C.VIA[t]['w']
    if t == 'av':
        for s in (+1, -1):
            linha(eixo, s * (1.5 + 4.25), 0.12, "Pintura_Branca", 3.0, 6.0, ini=4, fim=4)
    elif t in ('anel', 'ind'):
        for off in (-0.12, 0.12):
            linha(eixo, off, 0.1, "Cid_Pintura_Amarela", ini=3, fim=3)
        for s in (+1, -1):
            linha(eixo, s * W / 4, 0.12, "Pintura_Branca", 3.0, 6.0, ini=5, fim=5)
    elif t in ('col', 'ind_loc'):
        linha(eixo, 0.0, 0.12, "Cid_Pintura_Amarela", 3.0, 5.0, ini=4, fim=4)
    elif t == 'rot':
        linha(eixo, -W / 2 + 1.0, 0.12, "Pintura_Branca", 1.5, 1.5)
    mao = G.attr(u, v).get("mao_unica", 0)
    if mao and t == 'centro':                                                   # setas de mao unica
        a_, b_ = G.nos[u], G.nos[v]
        eixo_ = G.attr(u, v).get("eixo", "y")
        sentido = (1 if (b_.y - a_.y if eixo_ == 'y' else b_.x - a_.x) * mao > 0 else -1)
        d = (b_ - a_).normalized() * sentido
        L = (b_ - a_).length
        for f in (0.35, 0.7):
            c = a_.lerp(b_, f)
            ang = math.atan2(d.y, d.x) - math.pi / 2
            ca, sa = math.cos(ang), math.sin(ang)
            pts = [Vector((c.x + x * ca - y * sa, c.y + x * sa + y * ca)) for (x, y) in SETA]
            MM.get("Ruas", c.x, c.y).face([(p.x, p.y, 0.006) for p in pts], "Pintura_Branca", facing=(0, 0, 1))
    # faixas de pedestre e PARE nas pontas
    for no_, ponta in ((u, 0), (v, 1)):
        L0, L1, R1, R0 = pecas[0] if ponta == 0 else pecas[-1]
        if ponta == 0:
            Lp, Rp, Ld, Rd = L0, R0, (L1 - L0), (R1 - R0)
        else:
            Lp, Rp, Ld, Rd = L1, R1, (L0 - L1), (R0 - R1)
        if Ld.length < 8 or Rd.length < 8:
            continue
        Ld.normalize(); Rd.normalize()
        reais = [m for m in G.viz[no_] if G.real(no_, m)]
        if len(reais) < 3:
            continue
        recuo = 0.5
        if no_ in NOS_FAIXA:
            A0, B0 = Lp + Ld * 0.6, Rp + Rd * 0.6
            A1, B1 = Lp + Ld * 3.6, Rp + Rd * 3.6
            nst = int(((A0 - B0).length - 0.6) / 0.9)
            m = MM.get("Ruas", (A0.x + B1.x) / 2, (A0.y + B1.y) / 2)
            for k in range(nst):
                f0 = (0.3 + k * 0.9) / (A0 - B0).length
                f1 = (0.3 + k * 0.9 + 0.45) / (A0 - B0).length
                quad_z(m, [A0.lerp(B0, f0), A0.lerp(B0, f1), A1.lerp(B1, f1), A1.lerp(B1, f0)], 0.006, "Pintura_Branca")
            n_faixas += 1
            recuo = 4.2
        cls_max = max(CLS(G.tipo(no_, m)) for m in reais)
        if CLS(t) < cls_max and not mao:
            # faixa de retencao + PARE na metade de quem chega (lado direito de quem anda para o no)
            lado_dir_A, lado_dir_B = (Rp, Lp) if ponta == 1 else (Lp, Rp)
            dl = Rd if ponta == 1 else Ld
            meio = (Lp + Rp) / 2
            a0, a1 = meio + dl * recuo, lado_dir_A + dl * recuo
            b0, b1 = meio + dl * (recuo + 0.45), lado_dir_A + dl * (recuo + 0.45)
            quad_z(MM.get("Ruas", a0.x, a0.y), [a0, a1, b1, b0], 0.006, "Pintura_Branca")
            if pare_me is not None and W >= 8:
                cpos = meio.lerp(lado_dir_A, 0.5) + dl * (recuo + 3.2)
                dviagem = -dl
                r_ = Vector((dviagem.y, -dviagem.x))
                o = C.inst(pare_me, "PARE", "ROADS", (cpos.x, cpos.y, 0.006), math.degrees(math.atan2(r_.y, r_.x)), ETAPA,
                           scale=(min(1.0, (lado_dir_A - meio).length / 3.2), 1.9, 1.0))
                n_pare += 1

# ---------------------------------------------------------------- 5) colisores: chao por setor, calcadas, quadras, limite
for ix in range(C.NS):
    for iy in range(C.NS):
        x0, y0 = -C.HALF + ix * C.SETOR, -C.HALF + iy * C.SETOR
        C.colisor("Cid_Chao", (x0, y0, -0.5), (x0 + C.SETOR, y0 + C.SETOR, 0.0), ETAPA, setor=(ix, iy))
n_col_calc = 0
for q in Q:
    if q.externa or q.antiga:
        continue
    if q.toda_calcada or q.ilha:
        poly = q.poly_ext
        r = C.obb_inscrito(poly)
        if r:
            c, u_, a_, b_ = r
            C.colisor_obb("Cid_Calcada", c, u_, a_, b_, 0.0, ZC, ETAPA)
            n_col_calc += 1
        continue
    n = len(q.nos)
    for i in range(n):
        if not q.real[i]:
            continue
        a0, a1 = C.segmentos(q, q.ext, i)
        b0, b1 = C.segmentos(q, q.calc, i)
        ax = a1 - a0
        if ax.length < 0.5:
            continue
        u_ = ax.normalized()
        c = (a0 + a1 + b0 + b1) / 4
        prof = C.VIA[q.tipos[i]]['calc']
        C.colisor_obb("Cid_Calcada", c, u_, ax.length + 0.3, prof + 0.1, 0.0, ZC, ETAPA)
        n_col_calc += 1
    r = C.obb_inscrito(q.poly_int, q.poly_ext)
    if r:
        c, u_, a_, b_ = r
        C.colisor_obb("Cid_Quadra", c, u_, a_, b_, 0.0, ZC, ETAPA)
        n_col_calc += 1
    # faixas internas ao longo de cada aresta (patios, fundos de lote e faixas de borda que a caixa central nao cobre)
    for i in range(n):
        b0, b1 = C.segmentos(q, q.calc, i)
        ax = b1 - b0
        if ax.length < 6.0:
            continue
        u_ = ax.normalized()
        w_ = C.perp(u_)
        feito = False
        for pd in (18.0, 12.0, 8.0, 4.0):
            for enc in (0.3, 2.0, 5.0):
                Lx = ax.length - 2 * enc
                if Lx < 3.0:
                    continue
                c = (b0 + b1) / 2 + w_ * (pd / 2 + 0.02)
                cs = [c + u_ * (sx * Lx / 2) + w_ * (sy * pd / 2) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
                if all(C.dentro(p, q.poly_int) or C.dist_poly(p, q.poly_int) < 0.06 for p in cs):
                    C.colisor_obb("Cid_Quadra_Faixa", c, u_, Lx, pd, 0.0, ZC, ETAPA)
                    n_col_calc += 1
                    feito = True
                    break
            if feito:
                break
# limite da area jogavel: paredes invisiveis por setor de borda (altas, para nao pular para fora)
H = C.HALF
for k in range(C.NS):
    a = -H + k * C.SETOR
    C.colisor("Cid_Limite_Sul", (a, -H - 1.0, -1.0), (a + C.SETOR, -H, 40.0), ETAPA, setor=(k, 0))
    C.colisor("Cid_Limite_Norte", (a, H, -1.0), (a + C.SETOR, H + 1.0, 40.0), ETAPA, setor=(k, C.NS - 1))
    C.colisor("Cid_Limite_Oeste", (-H - 1.0, a, -1.0), (-H, a + C.SETOR, 40.0), ETAPA, setor=(0, k))
    C.colisor("Cid_Limite_Leste", (H, a, -1.0), (H + 1.0, a + C.SETOR, 40.0), ETAPA, setor=(C.NS - 1, k))

objs = MM.build(DEST)
for o in objs:
    o["lod"] = 0

# ---------------------------------------------------------------- 6) setor nos objetos do mapa original, cena, json
n_tag = 0
for cn in C.COLS_BAR + ["Exterior_Distante"]:
    c = bpy.data.collections.get(cn)
    if not c:
        continue
    for o in c.objects:
        if o.type == 'MESH' and o.data and len(o.data.vertices):
            bb = [o.matrix_world @ Vector(cc) for cc in o.bound_box]
            x, y = sum(p.x for p in bb) / 8, sum(p.y for p in bb) / 8
        else:
            x, y = o.matrix_world.translation.x, o.matrix_world.translation.y
        ix, iy = C.setor_de(x, y)
        o["setor"] = C.pref(ix, iy)
        n_tag += 1
scn["area_jogavel"] = [-H, -H, H, H]
scn["setores"] = {"tamanho_m": C.SETOR, "n": C.NS, "origem_xy": [-H, -H], "nome": "CITY_Sxx_yy (xx = coluna O->L, yy = linha S->N)"}
scn["nevoa"] = {"cor": [0.80, 0.85, 0.90], "inicio_m": 90.0, "fim_m": 650.0, "ignorar_materiais": ["Ceu_Panorama"]}
scn["camera_far_minimo_m"] = 1700.0
os.makedirs(os.path.join(B.EXPORT_DIR, "cidade"), exist_ok=True)
with open(os.path.join(B.EXPORT_DIR, "cidade", "cidade_vias.json"), "w", encoding="utf-8") as f:
    json.dump({"descricao": "Malha viaria da cidade (eixos em metros, Blender Z-up: x leste, y norte). "
                            "Ruas do bairro original ficam dentro do retangulo 'bairro_original'.",
               "bairro_original": list(C.P), "area_jogavel": [-H, -H, H, H], **vias_json}, f, ensure_ascii=False)
C.esconder_subs()
dbg = bpy.data.collections.get("_DEBUG_PLANO")
if dbg:
    for o in list(dbg.objects):
        me = o.data
        bpy.data.objects.remove(o)
        if me and me.users == 0:
            bpy.data.meshes.remove(me)
    bpy.data.collections.remove(dbg)
print("base ok: quadras %d | pecas de rua %d | cruzamentos %d | faixas de pedestre %d | PARE %d | colisores calcada/quadra %d | objetos %d | setor marcado em %d objs do mapa original"
      % (n_q, n_pecas, n_av, n_faixas, n_pare, n_col_calc, len(objs), n_tag))
