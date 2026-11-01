# Cidade - etapa 4: (a) LOD2/colisores do bairro original (as quadras do antigo anel decorativo agora sao jogaveis e
# nao tinham colisao); (b) anel visual externo sem colisao (canavial a oeste, mata ciliar + corrego e bairro em
# encosta ao norte, ferrovia/galpoes/silos/usina a leste, rodovia em aterro ao sul); (c) fundo distante refeito
# para a escala nova (morros, panorama, chao). Re-executavel (cid_etapa == "anel").
import bpy, bmesh, math, random, os, sys
from mathutils import Vector, Matrix
SP = r"C:\Users\rafael\BarBoteco\scripts"
if SP not in sys.path:
    sys.path.insert(0, SP)
import importlib
import barlib as B
import cidadelib as C
importlib.reload(C)

ETAPA = "anel"
ZC = C.ZC
H = C.HALF
print("removidos:", C.limpar_etapa(ETAPA))
MM = C.Malhas(ETAPA)
rnd = random.Random(31415)
stats = {}

# ============================================================== (a) bairro original: silhuetas LOD2 e colisores das casas do anel antigo
n_col = n_sil = 0
for o in bpy.data.collections["Exterior_Vizinhanca"].objects:
    if o.type != 'MESH':
        continue
    partes = o.name.split("_")
    try:
        i, j = int(partes[-2]), int(partes[-1])
    except ValueError:
        i = j = 0
    anel_antigo = abs(i) == 3 or abs(j) == 3
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.transform(o.matrix_world)
    bm.verts.ensure_lookup_table()
    vistos = set()
    for f0 in bm.faces:
        if f0.index in vistos:
            continue
        pilha = [f0]
        ilha = []
        while pilha:
            f = pilha.pop()
            if f.index in vistos:
                continue
            vistos.add(f.index)
            ilha.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in vistos:
                        pilha.append(g)
        vs = {v for f in ilha for v in f.verts}
        xs = [v.co.x for v in vs]; ys = [v.co.y for v in vs]; zs = [v.co.z for v in vs]
        x0, x1, y0, y1, z0, z1 = min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)
        if z0 > ZC + 0.3 or z1 - z0 < 2.0 or (x1 - x0) * (y1 - y0) < 6.0 or (x1 - x0) < 0.5 or (y1 - y0) < 0.5:
            continue
        mi = ilha[0].material_index
        mat = o.data.materials[mi].name if mi < len(o.data.materials) and o.data.materials[mi] else "Reboco_Branco"
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        MM.get("Silhueta_Original_LOD2", cx, cy).box((x0, y0, z0), (x1, y1, z1 + 0.7), mat, mats={'pz': "Telha"}, skip=('nz',))
        n_sil += 1
        if anel_antigo and o.name.startswith("Viz_Casas"):
            C.colisor("Cid_Viz_Antiga", (x0, y0, z0), (x1, y1, z1), ETAPA)
            n_col += 1
    bm.free()
MM.get("Silhueta_Original_LOD2", 16.0, 13.0).box((0.0, 0.0, 0.0), (32.0, 26.0, 7.0), "Reboco_Creme", mats={'pz': "Telha"}, skip=('nz',))
stats["silhuetas_bairro_original"] = n_sil
stats["colisores_casas_anel_antigo"] = n_col

# ============================================================== (b) anel visual externo
ANEL = C.coll("CITY_ANEL_EXTERNO", C.raiz())
ANEL["descricao"] = "Cenario externo ao limite jogavel (sem colisao). Pedacos por octante para culling/streaming."
DIST = C.coll("CITY_DISTANTE", C.raiz())
oct_m = {}


def octante(x, y):
    a = (math.degrees(math.atan2(y, x)) + 22.5) % 360
    return ["L", "NE", "N", "NO", "O", "SO", "S", "SE"][int(a // 45)]


def M_(x, y):
    k = octante(x, y)
    if k not in oct_m:
        oct_m[k] = B.Mesh("ANEL_" + k)
    return oct_m[k]


RMAX = 740.0


def fora(x, y, folga=0.0):
    return max(abs(x), abs(y)) > H + folga


def casa_simples(x, y, w, d, h, rot, cor, z=0.0, telhado=True):
    m = M_(x, y)
    Mx = Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(rot), 4, 'Z')
    m.box((-w / 2, -d / 2, -0.5), (w / 2, d / 2, h), cor, M=Mx, skip=('nz', 'pz') if telhado else ('nz',),
          mats={'pz': "Concreto"})
    if telhado:
        hr = min(w, d) * 0.28
        top = Mx @ Vector((0, 0, h + hr))
        cs = [Mx @ Vector((sx * (w / 2 + 0.3), sy * (d / 2 + 0.3), h)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        for k in range(4):
            a_, b_ = cs[k], cs[(k + 1) % 4]
            m.roof_face([tuple(a_), tuple(b_), tuple(top)], "Telha", tuple(b_ - a_))


def copa(x, y, z, r, mat="Cid_Mata", sub=0):
    M_(x, y).sphere(mat, Matrix.Translation((x, y, z + r * 0.9)) @ Matrix.Diagonal((r, r, r * 0.85, 1)), subdiv=sub, smooth=True)


def chao(pts, z, mat):
    cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
    M_(cx, cy).face([(p[0], p[1], z) for p in pts], mat, facing=(0, 0, 1))


def relevo(x, y):
    """Encosta suave fora da cidade (sobe ao norte e a leste)."""
    r = max(abs(x), abs(y))
    t = max(0.0, (r - H - 40) / (RMAX - H - 40))
    base = 18.0 if y > 0 else 9.0
    return t * t * base


# chao do anel: quadrado de 400 a 760 em placas por octante, com materiais por lado
xs = list(range(-760, 761, 40))
for gx in range(len(xs) - 1):
    for gy in range(len(xs) - 1):
        x0, x1, y0, y1 = xs[gx], xs[gx + 1], xs[gy], xs[gy + 1]
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        if max(abs(x0), abs(x1)) <= H and max(abs(y0), abs(y1)) <= H:
            continue                                                     # dentro da area jogavel
        if math.hypot(cx, cy) > 1000:
            continue
        if H + 10 <= cy <= H + 30:
            continue                                                     # leito do corrego
        if cx < -H and abs(cy) < 620:
            mat = "Cid_Cana" if (int(cx // 120) + int(cy // 90)) % 3 else "Cid_Grama_Seca"
        elif cy > H:
            mat = "Grama"
        elif cx > H:
            mat = "Cid_Grama_Seca"
        else:
            mat = "Grama"
        pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
        M_(cx, cy).face([(p[0], p[1], relevo(*p) - 0.02) for p in pts], mat, facing=(0, 0, 1))
# faixa de terra no pe do limite (esconde a juncao com a cidade)
for (a, b_) in (((-H - 30, -H - 30), (H + 30, -H)), ((-H - 30, H), (H + 30, H + 30)), ((-H - 30, -H), (-H, H)), ((H, -H), (H + 30, H))):
    chao([(a[0], a[1]), (b_[0], a[1]), (b_[0], b_[1]), (a[0], b_[1])], 0.01, "Terra_Batida")

# ---- OESTE: canavial, estrada de terra, quebra-vento de eucalipto, sede de sitio, usina ao longe
for k in range(-6, 7):
    y = k * 100.0 + rnd.uniform(-20, 20)
    chao([(-RMAX, y - 2.5), (-H - 30, y - 2.5), (-H - 30, y + 2.5), (-RMAX, y + 2.5)], 0.03, "Terra_Batida")
chao([(-H - 30, -620), (-H - 22, -620), (-H - 22, 620), (-H - 30, 620)], 0.03, "Terra_Batida")
y = -600.0
while y < 600:
    x = -H - 12 + rnd.uniform(-1.5, 1.5)
    M_(x, y).cyl(0.25, 14.0, "Casca", segs=4, M=Matrix.Translation((x, y, 0.0)), caps=(False, False))
    copa(x, y, 9.5, 2.4, "Cid_Eucalipto")
    y += rnd.uniform(5.0, 7.0)
for (x, y) in ((-560, 180), (-610, -260), (-520, -470)):
    casa_simples(x, y, 12, 9, 3.0, rnd.uniform(0, 90), "Reboco_Branco", relevo(x, y))
    casa_simples(x + 18, y + 6, 16, 10, 4.5, 0, "Cid_Galpao_Verde", relevo(x, y), telhado=False)
UX, UY = -650.0, -330.0                                                   # usina de acucar (marco no horizonte)
m = M_(UX, UY)
m.box((UX - 40, UY - 25, 0), (UX + 40, UY + 25, 22), "Cid_Galpao_Creme", skip=('nz',), mats={'pz': "Cid_Telha_Metal"})
m.box((UX - 25, UY + 25, 0), (UX + 10, UY + 45, 32), "Cid_Concreto_Pre", skip=('nz',), mats={'pz': "Concreto"})
for k in range(3):
    m.cyl(2.2, 55.0 + k * 6, "Cid_Concreto_Pre", segs=10, r2=1.6, M=Matrix.Translation((UX + 20 + k * 9, UY + 10, 0)))
for k in range(4):
    m.cyl(6.0, 24.0, "Metal_Branco", segs=12, M=Matrix.Translation((UX - 30 + k * 13, UY - 42, 0)))
    m.cyl(6.0, 4.0, "Metal_Branco", segs=12, r2=0.5, M=Matrix.Translation((UX - 30 + k * 13, UY - 42, 24)))

# ---- NORTE: corrego com mata ciliar, depois bairro em encosta
for x0 in range(-760, 760, 80):
    M_(x0 + 40, H + 20).face([(x0, H + 14, -0.35), (x0 + 80, H + 14, -0.35), (x0 + 80, H + 24, -0.35), (x0, H + 24, -0.35)],
                             "Cid_Agua", facing=(0, 0, 1))
    for (ya, yb, za, zb) in ((H + 10, H + 14, 0.0, -0.4), (H + 24, H + 30, -0.4, relevo(0, H + 30))):
        M_(x0 + 40, ya).face([(x0, ya, za), (x0 + 80, ya, za), (x0 + 80, yb, zb), (x0, yb, zb)], "Terra", facing=(0, 0, 1))
x = -RMAX
while x < RMAX:
    for yy in (H + 4, H + 10, H + 30, H + 38):
        xx, yy2 = x + rnd.uniform(-2, 2), yy + rnd.uniform(-2, 2)
        copa(xx, yy2, 0.0, rnd.uniform(2.5, 4.2))
    x += rnd.uniform(5.0, 7.5)
for gx in range(-12, 13):
    for gy in range(0, 9):
        x = gx * 52.0 + rnd.uniform(-6, 6)
        y = H + 70 + gy * 34.0 + rnd.uniform(-4, 4)
        if math.hypot(x, y) > RMAX + 30:
            continue
        if gy % 3 == 1:
            continue                                                     # ruas do bairro distante
        z = relevo(x, y)
        for k in range(rnd.choice((2, 3, 3, 4))):
            casa_simples(x - 14 + k * 9.5, y, 8, 9, rnd.choice((3.0, 3.0, 5.8)), rnd.uniform(-4, 4),
                         rnd.choice(C.CORES_CASA), z)
        if rnd.random() < 0.4:
            copa(x + 18, y + 8, z, 3.0, "Folhas")
for gy in range(0, 9):
    if gy % 3 != 1:
        continue
    y = H + 70 + gy * 34.0
    chao([(-RMAX, y - 4), (RMAX, y - 4), (RMAX, y + 4), (-RMAX, y + 4)], relevo(0, y) + 0.05, "Asfalto")

# ---- LESTE: ferrovia continua, patio de silos, galpoes
for (ya, yb) in ((-RMAX, -H), (H, RMAX)):
    m = M_(H + 20, (ya + yb) / 2)
    m.face([(H - 10, ya, 0.05), (H + 2, ya, 0.05), (H + 2, yb, 0.05), (H - 10, yb, 0.05)], "Cid_Brita", facing=(0, 0, 1))
    for xr in (393.0, 396.0):
        for dx in (-0.8, 0.8):
            m.box((xr + dx - 0.04, ya, 0.05), (xr + dx + 0.04, yb, 0.23), "Cid_Trilho", skip=('nz',))
chao([(H, -RMAX), (H + 14, -RMAX), (H + 14, RMAX), (H, RMAX)], 0.02, "Cid_Brita")
for xr in (406.0,):
    for dx in (-0.8, 0.8):
        M_(xr, 0).box((xr + dx - 0.04, -RMAX, 0.05), (xr + dx + 0.04, RMAX, 0.23), "Cid_Trilho", skip=('nz',))
SX, SY = 470.0, 120.0
for k in range(6):                                                       # silos de graos
    x, y = SX + (k % 3) * 15, SY + (k // 3) * 15
    M_(x, y).cyl(6.5, 26.0, "Metal_Branco", segs=12, M=Matrix.Translation((x, y, 0)))
    M_(x, y).cyl(6.5, 5.0, "Metal_Branco", segs=12, r2=0.6, M=Matrix.Translation((x, y, 26.0)))
M_(SX, SY).box((SX - 8, SY - 10, 0), (SX + 38, SY - 8, 34), "Cid_Galpao", skip=('nz',))
for k in range(26):
    x = H + 45 + (k % 5) * 58 + rnd.uniform(-5, 5)
    y = -RMAX + 60 + (k // 5) * 120 + rnd.uniform(-10, 10)
    if abs(x - SX - 15) < 40 and abs(y - SY) < 40:
        continue
    if math.hypot(x, y) > RMAX + 60:
        continue
    w, d = rnd.uniform(25, 50), rnd.uniform(30, 60)
    hg = rnd.uniform(8, 12)
    z = relevo(x, y)
    m = M_(x, y)
    m.box((x - w / 2, y - d / 2, z - 0.5), (x + w / 2, y + d / 2, z + hg), rnd.choice(("Cid_Galpao", "Cid_Galpao_Azul", "Cid_Galpao_Creme")),
          skip=('nz',), mats={'pz': "Cid_Telha_Metal"})

# ---- SUL: rodovia em aterro com mureta, bairro de baixa densidade alem
YR = -H - 45.0
M_(0, YR).face([(-RMAX, -H - 22, 0.0), (RMAX, -H - 22, 0.0), (RMAX, YR + 13, 2.2), (-RMAX, YR + 13, 2.2)], "Grama", facing=(0, 0, 1))
M_(0, YR).face([(-RMAX, YR - 13, 2.2), (RMAX, YR - 13, 2.2), (RMAX, YR - 30, 0.0), (-RMAX, YR - 30, 0.0)], "Grama", facing=(0, 0, 1))
for x0 in range(-740, 740, 80):
    x1 = x0 + 80
    m = M_(x0 + 40, YR)
    m.face([(x0, YR - 13, 2.2), (x1, YR - 13, 2.2), (x1, YR + 13, 2.2), (x0, YR + 13, 2.2)], "Asfalto", facing=(0, 0, 1))
    m.box((x0, YR - 0.3, 2.2), (x1, YR + 0.3, 3.0), "Concreto", skip=('nz',))
    for s in (-1, 1):
        m.box((x0, YR + s * 12.6 - 0.05, 2.2), (x1, YR + s * 12.6 + 0.05, 2.9), "Metal_Branco", skip=('nz',))
        for xx in range(x0, x1, 12):
            m.face([(xx, YR + s * 6.5 - 0.08, 2.21), (xx + 4, YR + s * 6.5 - 0.08, 2.21), (xx + 4, YR + s * 6.5 + 0.08, 2.21),
                    (xx, YR + s * 6.5 + 0.08, 2.21)], "Pintura_Branca", facing=(0, 0, 1))
for gx in range(-13, 14):
    for gy in range(0, 6):
        x = gx * 55.0 + rnd.uniform(-8, 8)
        y = YR - 70 - gy * 40.0 + rnd.uniform(-5, 5)
        if math.hypot(x, y) > RMAX + 20 or rnd.random() < 0.35:
            continue
        z = relevo(x, y)
        for k in range(rnd.choice((1, 2, 3))):
            casa_simples(x + k * 10, y, 8.5, 9, 3.0, rnd.uniform(-5, 5), rnd.choice(C.CORES_CASA), z)
        if rnd.random() < 0.5:
            copa(x - 8, y + 6, z, 3.2, "Folhas")
# cantos: manchas de mata
for _ in range(220):
    a = rnd.uniform(0, 2 * math.pi)
    r = rnd.uniform(H + 60, RMAX)
    x, y = r * math.cos(a), r * math.sin(a)
    if not fora(x, y, 50):
        continue
    if x < -H and abs(y) < 600:
        continue
    copa(x, y, relevo(x, y), rnd.uniform(2.5, 4.5), rnd.choice(("Cid_Mata", "Folhas")))
for k, mb in sorted(oct_m.items()):
    if not mb.bm.faces:
        mb.bm.free()
        continue
    ob = mb.build(ANEL)
    C.marcar(ob, ETAPA)
    ob["octante"] = k
    ob["colisao"] = False
    ob["lod"] = 2
stats["anel_octantes"] = len(oct_m)

# ============================================================== (c) fundo distante na escala nova
CX, CY = 0.0, 0.0
mo = B.Mesh("Distante_Morros_Cidade")
rd = random.Random(99)
for k in range(9):
    a = 2 * math.pi * k / 9 + rd.uniform(-0.2, 0.2)
    r = rd.uniform(820, 960)
    x, y = CX + r * math.cos(a), CY + r * math.sin(a)
    rx_, ry_, h = rd.uniform(150, 230), rd.uniform(110, 170), rd.uniform(55, 120)
    Mt = Matrix.Translation((x, y, -15.0)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Diagonal((ry_, rx_, h, 1.0))
    mo.sphere("Morro_Distante", Mt, subdiv=3, jitter=h * 0.10, rng=rd)
    for _ in range(2):
        a2 = a + rd.uniform(-0.15, 0.15)
        r2 = r + rd.uniform(-50, 60)
        M2 = Matrix.Translation((CX + r2 * math.cos(a2), CY + r2 * math.sin(a2), -12.0)) @ Matrix.Rotation(rd.uniform(0, 6.3), 4, 'Z') \
            @ Matrix.Diagonal((rx_ * rd.uniform(0.4, 0.7), ry_ * rd.uniform(0.4, 0.7), h * rd.uniform(0.5, 0.8), 1.0))
        mo.sphere("Morro_Distante", M2, subdiv=2, jitter=h * 0.08, rng=rd)
o = mo.build(DIST); C.marcar(o, ETAPA)
ch = B.Mesh("Distante_Chao_Cidade")
nseg = 48
ch.face([(CX + 1250 * math.cos(2 * math.pi * k / nseg), CY + 1250 * math.sin(2 * math.pi * k / nseg), -0.06) for k in range(nseg)],
        "Chao_Distante", facing=(0, 0, 1))
o = ch.build(DIST); C.marcar(o, ETAPA)
pan = B.Mesh("Distante_Panorama_Cidade")
RP, Z0p, Z1p, nseg = 1050.0, -55.0, 300.0, 64
for k in range(nseg):
    a0, a1 = 2 * math.pi * k / nseg, 2 * math.pi * (k + 1) / nseg
    p0 = (CX + RP * math.cos(a0), CY + RP * math.sin(a0)); p1 = (CX + RP * math.cos(a1), CY + RP * math.sin(a1))
    u0, u1 = k / nseg, (k + 1) / nseg
    pan.face([(p0[0], p0[1], Z0p), (p1[0], p1[1], Z0p), (p1[0], p1[1], Z1p), (p0[0], p0[1], Z1p)], "Ceu_Panorama",
             uvs=[(u0, 0.0), (u1, 0.0), (u1, 1.0), (u0, 1.0)], facing=(-math.cos(a0), -math.sin(a0), 0))
    pan.face([(p1[0], p1[1], Z1p), (p0[0], p0[1], Z1p), (CX, CY, Z1p + 220)], "Ceu_Panorama",
             uvs=[(u1, 0.995), (u0, 0.995), ((u0 + u1) / 2, 0.999)], facing=(0, 0, -1))
o = pan.build(DIST); C.marcar(o, ETAPA)
for ob in DIST.objects:
    ob["colisao"] = False
    ob["ignorar_nevoa"] = ob.name.startswith("Distante_Panorama")

# objetos LOD do bairro original
objs = MM.build({"Silhueta_LOD2": "LOD"})
for ob in objs:
    ob["lod"] = 2
bpy.context.scene["camera_far_minimo_m"] = 1700.0
print("anel ok:", stats, "| malhas LOD", len(objs))
