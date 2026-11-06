# 58_moto_fogo.py - moto "Caveira em Chamas" (chopper esqueleto da Tripo) preparada para o jogo BAR (PlayCanvas).
#
# Rodar no Blender (MCP ou -b) com Desktop\BAR\2.0\veiculos\moto\moto_fogo_origem.blend aberto:
#   exec(open(r'C:\Users\rafael\BarBoteco\scripts\58_moto_fogo.py', encoding='utf-8').read()); gerar(exportar=True)
#
# O que faz, na ordem:
#   1. transformar(): gira (frente = -Y do Blender = +Z do glTF), escala para metros e centra entre os eixos.
#   2. rotular(): separa as pecas por ilha (corpo, roda dianteira, roda traseira, direcao) e acha as faces das luzes
#      (olhos da caveira = farol, bolas ambar = setas, lente da rabeta = lanterna) pela cor da textura.
#   3. rodas: as da Tripo eram ovais e com o aro fora do centro do pneu (balancavam girando). Sao descartadas e refeitas por
#      revolucao em volta do eixo medido no cubo (Moto_Rodas: pneu, aro, cubo, 5 raios, disco/coroa), com textura nos tons
#      da original. A pinca de freio e as porcas continuam presas ao garfo (nao giram).
#   4. rig com os eixos medidos, pontos de encaixe medidos na malha (luzes, placa, escapamento), pele rigida.
#   5. separa as malhas de luz (Luz_Farol, Luz_Seta_E/D, Luz_Lanterna) com material proprio: baseColor = textura da moto,
#      emissiveTexture = mapa de brilho (so os pixels quentes dos olhos/setas e a lente vermelha), para o jogo acender a
#      propria malha (moto.luz(nome, ligada)).
#   6. exporta GLB (sem fogo: o fogo e desenhado pelo jogo, engine/moto-fire.ts, nos ossos fogo_diant/fogo_tras).
import bpy, bmesh, math, os, numpy as np
from mathutils import Vector, Matrix

# medidas na malha original (metros da Tripo, X = comprimento, frente = -X): so servem para a primeira escala
HUB_F = (-0.372, 0.139)
HUB_R = (0.339, 0.139)
R_ORIG = 0.1405
ESC = 0.30 / R_ORIG
OBJ = 'Moto'
R_RODA = 0.297            # raio das rodas reconstruidas = altura do eixo (cubo original medido: 0,296 e 0,299)
RAKE = 33.0               # inclinacao da coluna de direcao, medida no garfo
PLACA_TILT_JOGO = 15.0    # o jogo (moto-delivery.ts) inclina a placa 15 graus sobre o ponto_placa
SAIDA = r"C:\Users\rafael\BarBoteco\export\moto_fogo"
BLEND = r"C:\Users\rafael\Desktop\BAR\2.0\veiculos\moto\moto_fogo.blend"

HUBS = {}                 # medidos por medir_eixos: 'F' e 'R' -> (y, z)
PONTOS = {}               # medidos na malha


def _ymid():
    return (HUB_F[0] + HUB_R[0]) / 2 * ESC


def hub_f():
    return HUBS.get('F', (HUB_F[0] * ESC - _ymid(), HUB_F[1] * ESC))


def hub_r():
    return HUBS.get('R', (HUB_R[0] * ESC - _ymid(), HUB_R[1] * ESC))


def _fonte():
    for o in bpy.data.objects:
        if o.name.startswith('tripo_node') or o.name == OBJ + '_origem':
            return o
    raise RuntimeError('objeto da Tripo nao encontrado (abra moto_fogo_origem.blend)')


def so_ativo(objs, ativo=None):
    if getattr(bpy.context, 'object', None) and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    for ob in bpy.context.view_layer.objects:
        ob.select_set(False)
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = ativo or objs[0]


def colecao(nome):
    c = bpy.data.collections.get(nome)
    if not c:
        c = bpy.data.collections.new(nome)
        bpy.context.scene.collection.children.link(c)
    return c


# ---------------------------------------------------------------- 1. escala e orientacao
def transformar():
    """Pelo objeto + transform_apply: assim as normais customizadas da Tripo giram junto."""
    o = _fonte()
    o.name = OBJ + '_origem'
    so_ativo([o])
    o.matrix_world = (Matrix.Translation((0, -_ymid(), 0)) @ Matrix.Scale(ESC, 4) @ Matrix.Rotation(math.radians(90), 4, 'Z'))
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


# ---------------------------------------------------------------- 2. ilhas e rotulos
def _ilhas(me, tol=0.001):
    """Ilha (componente conexa por posicao soldada) de cada face."""
    n = len(me.vertices)
    co = np.empty(n * 3, np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    key = np.round(co / tol).astype(np.int64)
    _, rep = np.unique(key, axis=0, return_inverse=True)
    rep = rep.ravel()
    parent = np.arange(rep.max() + 1)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    lp = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get('vertex_index', lp)
    starts = np.empty(len(me.polygons), np.int32)
    tot = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get('loop_start', starts)
    me.polygons.foreach_get('loop_total', tot)
    for s, t in zip(starts, tot):
        r = rep[lp[s:s + t]]
        a = find(r[0])
        for b in r[1:]:
            b = find(b)
            if a != b:
                parent[b] = a
    roots = np.array([find(rep[lp[s]]) for s in starts])
    _, ilha = np.unique(roots, return_inverse=True)
    return ilha.ravel(), co, lp, starts, tot


def _vertices_da_ilha(ilha, lp, st, tot, k):
    f = np.where(ilha == k)[0]
    return f, np.unique(np.concatenate([lp[st[i]:st[i] + tot[i]] for i in f]))


def _cor_faces(me, st, tot):
    """Cor da textura em cada face: media do centro e dos cantos (amostra no mapa UV)."""
    img = [n.image for n in me.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE'][0]
    W, H = img.size
    px = np.array(img.pixels[:], np.float32).reshape(H, W, 4)[..., :3]
    uv = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers[0].data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2)
    cores = np.zeros((len(st), 3), np.float32)
    quente = np.zeros(len(st), np.float32)
    for i, (s, t) in enumerate(zip(st, tot)):
        us = np.vstack([uv[s:s + t], uv[s:s + t].mean(0, keepdims=True)])
        c = px[((us[:, 1] % 1) * (H - 1)).astype(int), ((us[:, 0] % 1) * (W - 1)).astype(int)]
        cores[i] = c.mean(0)
        quente[i] = ((c[:, 0] - c[:, 2] > 0.35) & (c[:, 0] > 0.6)).mean()
    return cores, quente, img, uv


# rotulos de face
CORPO, RODA_F, RODA_R, DIRECAO = 0, 1, 2, 3
FAROL, SETA_E_F, SETA_E_T, SETA_D_F, SETA_D_T, LANTERNA = 10, 11, 12, 13, 14, 15
OSSO_DO_ROTULO = {CORPO: 'chassi', RODA_F: 'roda_dianteira', RODA_R: 'roda_traseira', DIRECAO: 'direcao',
                  FAROL: 'direcao', SETA_E_F: 'direcao', SETA_D_F: 'direcao', SETA_E_T: 'chassi', SETA_D_T: 'chassi',
                  LANTERNA: 'chassi'}
MALHA_DO_ROTULO = {FAROL: 'Luz_Farol', SETA_E_F: 'Luz_Seta_E', SETA_E_T: 'Luz_Seta_E', SETA_D_F: 'Luz_Seta_D',
                   SETA_D_T: 'Luz_Seta_D', LANTERNA: 'Luz_Lanterna'}


def rotular(o):
    me = o.data
    ilha, co, lp, st, tot = _ilhas(me)
    cen = np.array([co[lp[s:s + t]].mean(0) for s, t in zip(st, tot)])
    nor = np.array([p.normal[:] for p in me.polygons])
    esp = np.bincount(ilha)
    lab = np.zeros(len(st), np.int8)
    yf, zf = hub_f()
    yr, zr = hub_r()
    # rodas: ilhas inteiras dentro do raio do pneu e da largura da roda, CONCENTRICAS ao eixo
    # (a pinca de freio fica dentro do raio mas fora do centro: nao gira)
    for k in range(len(esp)):
        f, vi = _vertices_da_ilha(ilha, lp, st, tot, k)
        p = co[vi]
        if abs(p[:, 0]).max() >= 0.115:
            continue
        for rot, (yc, zc) in ((RODA_F, (yf, zf)), (RODA_R, (yr, zr))):
            d = np.hypot(p[:, 1] - yc, p[:, 2] - zc)
            c = p.mean(0)
            if d.max() < 0.31:
                lab[f] = rot if math.hypot(c[1] - yc, c[2] - zc) < 0.05 else (DIRECAO if rot == RODA_F else CORPO)
    # direcao: corredor do garfo dentro da ilha grande do quadro + ilhas da frente (paralama, caveira, guidao, espelhos)
    th = math.radians(RAKE)
    A = np.array([yf, zf])
    d_ = np.array([math.sin(th), math.cos(th)])
    n_ = np.array([math.cos(th), -math.sin(th)])
    p2 = cen[:, 1:3] - A
    s = p2 @ n_
    t = p2 @ d_
    livre = lab == CORPO
    grande = esp[ilha] > 1500
    lab[livre & grande & (s < 0.035) & (s > -0.06) & (t > 0.05) & (cen[:, 2] > 0.2) & (cen[:, 1] < -0.2)] = DIRECAO
    for k in range(len(esp)):
        f = ilha == k
        if esp[k] > 1500 or np.any((lab[f] == RODA_F) | (lab[f] == RODA_R)):
            continue
        c = cen[f].mean(0)
        sk = (c[1:3] - A) @ n_
        _, vi = _vertices_da_ilha(ilha, lp, st, tot, k)
        if c[1] < -0.2 and sk < 0.08 and c[2] > 0.2:
            lab[f] = DIRECAO
        elif c[2] > 0.5 and c[1] < 0.15 and np.abs(co[vi][:, 0]).max() > 0.2:
            lab[f] = DIRECAO      # guidao e espelhos
        elif 0.05 < abs(c[0]) < 0.12 and -0.1 < c[1] < 0.05 and c[2] > 0.5:
            lab[f] = DIRECAO      # manoplas
    # luzes, pela cor da textura
    cores, quente, img, uv = _cor_faces(me, st, tot)
    for k in range(len(esp)):
        f = np.where(ilha == k)[0]
        if esp[k] > 90 or (quente[f] > 0.3).sum() < 8:
            continue
        c = cen[f].mean(0)
        tam = cen[f].max(0) - cen[f].min(0)
        if tam.max() > 0.09 or abs(c[0]) < 0.1:
            continue
        frente = c[1] < 0
        lab[f] = (SETA_E_F if frente else SETA_E_T) if c[0] > 0 else (SETA_D_F if frente else SETA_D_T)
    olhos = (lab == DIRECAO) & (quente >= 0.25) & (cen[:, 1] > -0.65) & (cen[:, 1] < -0.4) & (cen[:, 2] > 0.77) & \
        (cen[:, 2] < 0.87) & (abs(cen[:, 0]) < 0.13)
    lab[olhos] = FAROL
    lente = (lab == CORPO) & (cen[:, 1] > 0.995) & (cen[:, 1] < 1.01) & (nor[:, 1] > 0.95) & (abs(cen[:, 0]) < 0.07) & \
        (cen[:, 2] > 0.58) & (cen[:, 2] < 0.66)
    lab[lente] = LANTERNA
    print('faces por rotulo:', {k: int((lab == k).sum()) for k in sorted(set(lab.tolist()))})
    return lab, dict(ilha=ilha, cen=cen, nor=nor, img=img, uv=uv, st=st, tot=tot)


def cortar_por_rotulo(o, lab):
    """Duplica os vertices nas fronteiras entre rotulos (cada vertice fica numa peca so) e grava o rotulo nas faces."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.faces.ensure_lookup_table()
    camada = bm.faces.layers.int.new('rotulo')
    for f in bm.faces:
        f[camada] = int(lab[f.index])
    arestas = [e for e in bm.edges if len(e.link_faces) == 2 and e.link_faces[0][camada] != e.link_faces[1][camada]]
    bmesh.ops.split_edges(bm, edges=arestas)
    bm.verts.ensure_lookup_table()
    rot_v = np.array([v.link_faces[0][camada] if v.link_faces else 0 for v in bm.verts], np.int16)
    bm.to_mesh(o.data)
    bm.free()
    return rot_v


# ---------------------------------------------------------------- 3. rodas reconstruidas
def medir_eixos(o, lab):
    """Centro do cubo de cada roda original: a pecinha concentrica (anel dos parafusos / disco) que fica mais para fora
    em X. As rodas da Tripo eram ovais e com o aro fora do centro do pneu; so este centro serve de eixo."""
    me = o.data
    ilha, co, lp, st, tot = _ilhas(me)
    for chave, rot in (('F', RODA_F), ('R', RODA_R)):
        melhor = None
        for k in np.unique(ilha[lab == rot]):
            f, vi = _vertices_da_ilha(ilha, lp, st, tot, k)
            p = co[vi]
            xmin = np.abs(p[:, 0]).min()
            if len(f) < 120 and (melhor is None or xmin > melhor[0]):
                melhor = (xmin, p)
        p = melhor[1]
        c = (p.min(0) + p.max(0)) / 2
        HUBS[chave] = (float(c[1]), R_RODA)
        print('eixo', chave, 'cubo medido (y,z)', c[1:].round(4), '-> eixo', HUBS[chave])


def _textura_rodas(caminho, pneu, metal):
    """512x512: [0,.5) banda de rodagem com blocos, [.5,.75) flanco, [.75,1) metal escovado.
    Tons = mediana dos pixels da textura original sob o pneu e sob o aro (ruido proprio por cima)."""
    N = 512
    img = np.zeros((N, N, 3), np.float32)
    yy, xx = np.mgrid[0:N, 0:N]
    u = xx / N
    v = yy / N

    def ruido(f, seed):
        r = np.random.default_rng(seed).random((f, f))
        return np.kron(r, np.ones((N // f, N // f)))
    gran = 0.55 * ruido(64, 1) + 0.3 * ruido(128, 2) + 0.15 * ruido(256, 3)
    vv = v / 0.5
    bloco = np.abs(((u * 40 + np.abs(vv - 0.5) * 3.2) % 1.0) - 0.5) * 2
    sulco = np.clip((bloco - 0.72) / 0.18, 0, 1)
    canal = np.clip(1 - np.abs(vv - 0.5) / 0.035, 0, 1) * 0.8
    pneu = np.asarray(pneu, np.float32)
    tread = pneu[None, None] * (0.72 + 0.55 * gran[..., None]) * (1 - 0.7 * np.maximum(sulco, canal))[..., None]
    img[: N // 2] = tread[: N // 2]
    fl = (v - 0.5) / 0.25
    anel = 0.82 + 0.09 * np.sin(fl * np.pi * 7) + 0.2 * np.exp(-((fl - 0.5) ** 2) / 0.01)
    side = pneu[None, None] * (anel * (0.75 + 0.5 * gran))[..., None]
    img[N // 2:3 * N // 4] = side[N // 2:3 * N // 4]
    metal = np.asarray(metal, np.float32)
    risco = 0.8 + 0.25 * np.tile(np.random.default_rng(5).random((N, 1)), (1, N))
    mancha = 0.75 + 0.5 * ruido(32, 6)
    m = metal[None, None] * (risco * mancha)[..., None]
    img[3 * N // 4:] = m[3 * N // 4:]
    img = np.clip(img, 0, 1)
    im = bpy.data.images.get('moto_fogo_rodas') or bpy.data.images.new('moto_fogo_rodas', N, N, alpha=False)
    rgba = np.ones((N, N, 4), np.float32)
    rgba[..., :3] = img          # linha 0 = v 0 (embaixo): banda de rodagem v 0..0.5, flanco 0.5..0.75, metal 0.75..1
    im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw = caminho
    im.file_format = 'PNG'
    im.save()
    return im


def _lathe(bm, uvl, perfil, n, yc, zc, mat, uv_u=1.0, smooth=True):
    """Gira um perfil [(x, r, v)] em volta do eixo X que passa por (yc, zc): quads com UV (u em volta, v do perfil)."""
    aneis = []
    for (x, r, v) in perfil:
        aneis.append([bm.verts.new((x, yc + r * math.cos(2 * math.pi * i / n), zc + r * math.sin(2 * math.pi * i / n)))
                      for i in range(n)])
    for k in range(len(perfil) - 1):
        for i in range(n):
            j = (i + 1) % n
            try:
                f = bm.faces.new([aneis[k][i], aneis[k][j], aneis[k + 1][j], aneis[k + 1][i]])
            except ValueError:
                continue
            f.material_index = mat
            f.smooth = smooth
            for lp, (ii, kk) in zip(f.loops, ((i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1))):
                lp[uvl].uv = ((ii / n) * uv_u, perfil[kk][2])


def _prisma(bm, uvl, p0, p1, w0, w1, e0, e1, yc, zc, ang, x0, mat, uv0):
    """Raio plano de r=p0 a r=p1 na direcao ang: largura tangencial w0->w1, espessura axial x0 +- e."""
    ca, sa = math.cos(ang), math.sin(ang)

    def pt(r, w, x):
        return bm.verts.new((x, yc + r * ca - w * sa, zc + r * sa + w * ca))
    v = [pt(p0, -w0 / 2, x0 - e0), pt(p0, w0 / 2, x0 - e0), pt(p1, w1 / 2, x0 - e1), pt(p1, -w1 / 2, x0 - e1),
         pt(p0, -w0 / 2, x0 + e0), pt(p0, w0 / 2, x0 + e0), pt(p1, w1 / 2, x0 + e1), pt(p1, -w1 / 2, x0 + e1)]
    for q in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
        f = bm.faces.new([v[i] for i in q])
        f.material_index = 0
        f.smooth = False
        for lp, (uu, vv) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            lp[uvl].uv = (uv0[0] + uu * 0.2, uv0[1] + vv * 0.18)


def construir_rodas(col, cores, lab, info):
    """Uma malha 'Moto_Rodas' com as duas rodas novas, perfeitamente concentricas no eixo medido (HUBS)."""
    ilha = info['ilha']
    pneu_ids, aro_ids = [], []
    for rot in (RODA_F, RODA_R):
        ks = np.unique(ilha[lab == rot])
        tam = {k: int(((ilha == k) & (lab == rot)).sum()) for k in ks}
        pneu_ids.append(max(tam, key=tam.get))
        aro_ids += [k for k in ks if k != pneu_ids[-1]]
    roda = (lab == RODA_F) | (lab == RODA_R)
    pneu_rgb = np.median(cores[np.isin(ilha, pneu_ids) & roda], 0)
    metal_rgb = np.percentile(cores[np.isin(ilha, aro_ids) & roda], 85, axis=0)      # as partes claras do aro (a mediana pega as sombras)
    metal_rgb = np.clip(metal_rgb * 1.25, 0, 1)      # o aro original e um pouco mais claro que a borracha
    print('tons originais (sRGB 0..1): pneu', pneu_rgb.round(3), '| aro e cubo', metal_rgb.round(3))
    img = _textura_rodas(os.path.join(SAIDA, 'moto_fogo_rodas.png'), pneu_rgb, metal_rgb)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    N = 72
    R = R_RODA
    for chave, hw in (('F', 0.097), ('R', 0.089)):
        yc, zc = HUBS[chave]
        # pneu: flancos (v .52..) e banda de rodagem (v 0..0.5) em tres faixas, ombros arredondados
        flanco_e = [(-hw * .80, .205, .52), (-hw * .97, .228, .56), (-hw, .250, .62), (-hw * .94, .274, .70), (-hw * .88, .288, .74)]
        tread = [(-hw * .88, .288, .0), (-hw * .62, R - .002, .08), (-hw * .22, R, .2), (hw * .22, R, .3), (hw * .62, R - .002, .42),
                 (hw * .88, .288, .5)]
        flanco_d = [(hw * .88, .288, .74), (hw * .94, .274, .70), (hw, .250, .62), (hw * .97, .228, .56), (hw * .80, .205, .52)]
        for per in (flanco_e, tread, flanco_d):
            _lathe(bm, uvl, per, N, yc, zc, 0)
        aro = [(-hw * .86, .212, .8), (-hw * .80, .190, .84), (-hw * .55, .178, .88), (hw * .55, .178, .92), (hw * .80, .190, .96),
               (hw * .86, .212, .98)]
        _lathe(bm, uvl, aro, N, yc, zc, 0)
        cubo = [(-.078, .010, .8), (-.078, .040, .84), (-.058, .058, .88), (.058, .058, .92), (.078, .040, .96), (.078, .010, .98)]
        _lathe(bm, uvl, cubo, N // 2, yc, zc, 0)
        for k in range(5):
            ang = 2 * math.pi * k / 5 + math.pi / 10
            _prisma(bm, uvl, .045, .186, .066, .046, .024, .015, yc, zc, ang, 0.0, 0, (0.1 + 0.15 * k, 0.78))
        # disco de freio (frente) / coroa (tras) do lado +X, preso ao cubo por quatro bracos
        r0, r1 = (.098, .180) if chave == 'F' else (.088, .150)
        xd = .088
        disco = [(xd - .004, r0, .8), (xd - .004, r1, .85), (xd + .004, r1, .9), (xd + .004, r0, .95), (xd - .004, r0, .98)]
        _lathe(bm, uvl, disco, N, yc, zc, 0)
        for k in range(4):
            _prisma(bm, uvl, .05, r0 + .004, .030, .026, .004, .004, yc, zc, 2 * math.pi * k / 4 + .3, xd, 0, (0.2 + 0.2 * k, 0.8))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new('Moto_Rodas')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('Moto_Rodas', me)
    col.objects.link(ob)
    mat = bpy.data.materials.get('Moto_Rodas') or bpy.data.materials.new('Moto_Rodas')
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    bs = nt.nodes.new('ShaderNodeBsdfPrincipled')
    tx = nt.nodes.new('ShaderNodeTexImage')
    tx.image = img
    tx.extension = 'REPEAT'
    nt.links.new(tx.outputs[0], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = 0.72
    bs.inputs['Metallic'].default_value = 0.0
    nt.links.new(bs.outputs[0], out.inputs[0])
    me.materials.append(mat)
    for chave, osso in (('F', 'roda_dianteira'), ('R', 'roda_traseira')):
        vg = ob.vertex_groups.new(name=osso)
        yc = HUBS[chave][0]
        vg.add([v.index for v in me.vertices if abs(v.co.y - yc) < 0.35], 1.0, 'REPLACE')
    return ob


# ---------------------------------------------------------------- 4. pontos de encaixe medidos
def medir_pontos(o, rot_v):
    me = o.data
    co = np.array([v.co[:] for v in me.vertices])

    def centro(rot):
        p = co[rot_v == rot]
        return (p.min(0) + p.max(0)) / 2
    olhos = co[rot_v == FAROL]
    PONTOS['farol'] = (0.0, float(olhos[:, 1].min()) - 0.012, float(olhos[:, 2].mean()))
    for nome, rot in (('seta_frente_E', SETA_E_F), ('seta_frente_D', SETA_D_F), ('seta_tras_E', SETA_E_T),
                      ('seta_tras_D', SETA_D_T)):
        c = centro(rot)
        PONTOS[nome] = tuple(float(x) for x in c)
    lente = co[rot_v == LANTERNA]
    lc = (lente.min(0) + lente.max(0)) / 2
    PONTOS['lanterna'] = (0.0, float(lente[:, 1].max()) + 0.008, float(lc[2]))
    PONTOS['freio'] = PONTOS['lanterna']
    PONTOS['luz_placa'] = (0.0, float(lente[:, 1].max()) + 0.02, float(lente[:, 2].min()) - 0.02)
    # placa: a rabeta abaixo da lente desce inclinada para tras (34 graus virada para o chao), sem face vertical. A placa
    # fica em pe, pendurada na ponta da rabeta como num chopper: borda de cima encostada na ponta, 7 cm atras do pneu.
    corpo = rot_v == CORPO
    m = corpo & (np.abs(co[:, 0]) < 0.08) & (co[:, 2] > 0.38) & (co[:, 2] < 0.56) & (co[:, 1] > 0.9)
    ponta = co[m][np.argmax(co[m][:, 1])]
    PONTOS['ponta_rabeta'] = tuple(float(x) for x in ponta)
    PONTOS['placa'] = (0.0, float(ponta[1]) + 0.007, float(ponta[2]) - 0.085 + 0.025)   # topo 2,5 cm acima da ponta: parece presa
    PONTOS['placa_ang'] = 0.0
    # olhos da caveira: um ponto por olho (centro das faces FAROL de cada lado), um pouco a frente
    for nome, sinal in (('olho_E', 1), ('olho_D', -1)):
        p = co[(rot_v == FAROL) & (co[:, 0] * sinal > 0)]
        c = p.mean(0)
        PONTOS[nome] = (float(c[0]), float(p[:, 1].min()) - 0.006, float(c[2]))
    # escapamento: as duas ponteiras empilhadas do lado +X (o outro lado nao tem cano); y mais para tras de cada uma
    m = (co[:, 0] > 0.115) & (co[:, 1] > 0.85) & (co[:, 2] > 0.2) & (co[:, 2] < 0.5) & np.isin(rot_v, [CORPO])
    p = co[m]
    for nome, sel in (('escape_1', p[:, 2] < 0.355), ('escape_2', p[:, 2] >= 0.355)):
        q = p[sel]
        ponta = q[q[:, 1] > q[:, 1].max() - 0.02]
        c = ponta.mean(0)
        PONTOS[nome] = (float(c[0]), float(q[:, 1].max()) - 0.035, float(c[2]))   # boca do cano, antes da ponta de espeto
    print('pontos medidos:', {k: (tuple(round(x, 3) for x in v) if isinstance(v, tuple) else round(v, 2)) for k, v in PONTOS.items()})


def pontos():
    yf, zf = hub_f()
    yr, zr = hub_r()
    P = PONTOS
    return {
        "ponto_piloto": ("chassi", (0, 0.52, 0.66)), "ponto_garupa": ("chassi", (0, 0.82, 0.745)),
        "ponto_mao_E": ("direcao", (0.40, -0.14, 1.03)), "ponto_mao_D": ("direcao", (-0.40, -0.14, 1.03)),
        "ponto_pe_E": ("chassi", (0.19, 0.07, 0.23)), "ponto_pe_D": ("chassi", (-0.19, 0.07, 0.23)),
        "ponto_pe_garupa_E": ("chassi", (0.20, 0.75, 0.30)), "ponto_pe_garupa_D": ("chassi", (-0.20, 0.75, 0.30)),
        "ponto_farol": ("direcao", P['farol']), "ponto_farol_alto": ("direcao", (0, P['farol'][1], P['farol'][2] + 0.02)),
        "ponto_seta_frente_E": ("direcao", P['seta_frente_E']), "ponto_seta_frente_D": ("direcao", P['seta_frente_D']),
        "ponto_seta_tras_E": ("chassi", P['seta_tras_E']), "ponto_seta_tras_D": ("chassi", P['seta_tras_D']),
        "ponto_lanterna": ("chassi", P['lanterna']), "ponto_freio": ("chassi", P['freio']),
        "ponto_luz_placa": ("chassi", P['luz_placa']), "ponto_placa": ("chassi", P['placa']),
        "ponto_escapamento": ("chassi", P['escape_1']), "ponto_escape_1": ("chassi", P['escape_1']),
        "ponto_escape_2": ("chassi", P['escape_2']),
        "ponto_olho_E": ("direcao", P['olho_E']), "ponto_olho_D": ("direcao", P['olho_D']),
        "ponto_tanque": ("chassi", (0, 0.0, 0.90)), "ponto_buzina": ("direcao", (0, -0.45, 0.62)),
        "ponto_motor": ("chassi", (0, 0.0, 0.42)), "ponto_bau": ("chassi", (0, 0.85, 0.78)),
        "ponto_contato_diant": ("raiz", (0, yf, 0.0)), "ponto_contato_tras": ("raiz", (0, yr, 0.0)),
        "ponto_camera": ("chassi", (0, 0.35, 1.65)),
    }


def lista_ossos():
    th = math.radians(RAKE)
    yf, zf = hub_f()
    yr, zr = hub_r()
    A = Vector((0, yf, zf))
    Rr = Vector((0, yr, zr))
    AX = Vector((0, math.sin(th), math.cos(th)))
    cima = Vector((0, 0, 1))
    pivo_bal = Vector((0, 0.25, 0.32))
    ossos = []

    def osso(nome, cab, cau, pai, deforma=True):
        ossos.append((nome, Vector(cab), Vector(cau), pai, deforma))
    osso("raiz", (0, 0, 0), (0, 0, 0.25), None)
    osso("chassi", (0, 0, 0.55), (0, 0, 0.80), "raiz")
    osso("direcao", A + AX * 0.60, A + AX * 0.85, "chassi")
    osso("suspensao_diant", A, A + AX * 0.20, "direcao")
    osso("roda_dianteira", A, A + cima * 0.12, "suspensao_diant")
    osso("fogo_diant", A, A + cima * 0.12, "suspensao_diant", False)    # ancora do fogo: segue garfo, nao gira
    osso("balanca", pivo_bal, pivo_bal + cima * 0.12, "chassi")
    osso("roda_traseira", Rr, Rr + cima * 0.12, "balanca")
    osso("fogo_tras", Rr, Rr + cima * 0.12, "balanca", False)
    for nome, (pai, pos) in pontos().items():
        cau = Vector(pos) + cima * 0.06
        if nome == 'ponto_placa':
            # o jogo inclina a placa 15 graus sobre este no; o resto da inclinacao da rabeta vai no proprio osso
            d = math.radians(PONTOS['placa_ang'] - PLACA_TILT_JOGO)
            cau = Vector(pos) + Vector((0, -math.sin(d), math.cos(d))) * 0.06
        osso(nome, pos, cau, pai, False)
    return ossos


def criar_rig(col, ossos):
    arm = bpy.data.armatures.new("Moto_Rig")
    arm.display_type = 'STICK'
    rig = bpy.data.objects.new("Moto_Rig", arm)
    col.objects.link(rig)
    rig.show_in_front = True
    so_ativo([rig])
    bpy.ops.object.mode_set(mode='EDIT')
    for nome, cab, cau, pai, deforma in ossos:
        b = arm.edit_bones.new(nome)
        b.head, b.tail, b.roll = cab, cau, 0.0
        b.use_deform = deforma
        if pai:
            b.parent = arm.edit_bones[pai]
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


# ---------------------------------------------------------------- 5. luzes: mapa de brilho e malhas separadas
def mapa_brilho(img, uv, me, rotulos_face, caminho):
    """Emissiva das luzes no mesmo UV da textura: olhos e setas = so os pixels quentes (laranja/amarelo), normalizados;
    lente da lanterna = vermelho com a grade da textura. O resto e preto."""
    W, H = img.size
    px = np.array(img.pixels[:], np.float32).reshape(H, W, 4)[..., :3]
    R, G, B = px[..., 0], px[..., 1], px[..., 2]
    sat = R - B

    def suave(a, b, x):
        t = np.clip((x - a) / (b - a), 0, 1)
        return t * t * (3 - 2 * t)
    brilho = suave(0.22, 0.45, sat) * suave(0.45, 0.75, R)
    cor = px / np.maximum(px.max(-1, keepdims=True), 1e-3)
    out = cor * brilho[..., None]
    # mascara da lente (rasteriza os triangulos UV das faces da lanterna)
    mask = np.zeros((H, W), bool)
    uv = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers[0].data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2)
    st = np.empty(len(me.polygons), np.int32)
    tot = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get('loop_start', st)
    me.polygons.foreach_get('loop_total', tot)
    yy, xx = np.mgrid[0:H, 0:W]
    for i in np.where(rotulos_face == LANTERNA)[0]:
        t = uv[st[i]:st[i] + tot[i]] * [W - 1, H - 1]
        for k in range(1, len(t) - 1):
            a, b, c = t[0], t[k], t[k + 1]
            x0, x1 = int(max(min(a[0], b[0], c[0]) - 1, 0)), int(min(max(a[0], b[0], c[0]) + 2, W))
            y0, y1 = int(max(min(a[1], b[1], c[1]) - 1, 0)), int(min(max(a[1], b[1], c[1]) + 2, H))
            X, Y = xx[y0:y1, x0:x1] + 0.5, yy[y0:y1, x0:x1] + 0.5
            d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(d) < 1e-9:
                continue
            l1 = ((b[1] - c[1]) * (X - c[0]) + (c[0] - b[0]) * (Y - c[1])) / d
            l2 = ((c[1] - a[1]) * (X - c[0]) + (a[0] - c[0]) * (Y - c[1])) / d
            l3 = 1 - l1 - l2
            dentro = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
            mask[y0:y1, x0:x1] |= dentro
    lum = px.mean(-1)
    if mask.any():
        lo, hi = np.percentile(lum[mask], [5, 95])
        grade = 0.55 + 0.45 * np.clip((lum - lo) / max(hi - lo, 1e-3), 0, 1)
        out[mask] = np.stack([grade, grade * 0.10, grade * 0.06], -1)[mask]
    im = bpy.data.images.get('moto_fogo_luz') or bpy.data.images.new('moto_fogo_luz', W, H, alpha=False)
    rgba = np.ones((H, W, 4), np.float32)
    rgba[..., :3] = np.clip(out, 0, 1)
    im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw = caminho
    im.file_format = 'PNG'
    im.save()
    im.colorspace_settings.name = 'sRGB'
    return im


def material_base(img):
    mat = bpy.data.materials.get('Moto_Caveira') or bpy.data.materials.new('Moto_Caveira')
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    bs = nt.nodes.new('ShaderNodeBsdfPrincipled')
    tx = nt.nodes.new('ShaderNodeTexImage')
    tx.image = img
    nt.links.new(tx.outputs[0], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = 0.72
    bs.inputs['Metallic'].default_value = 0.0
    nt.links.new(bs.outputs[0], out.inputs[0])
    return mat


def material_luzes(img, img_luz):
    """baseColor = textura da moto (a lente apagada fica igual ao resto), emissiveTexture = mapa de brilho, emissiveFactor 1.
    O jogo controla a intensidade (moto.luz): apagada = 0."""
    mat = material_base(img).copy()
    mat.name = 'Moto_Caveira_Luzes'
    nt = mat.node_tree
    bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    te = nt.nodes.new('ShaderNodeTexImage')
    te.image = img_luz
    nt.links.new(te.outputs[0], bs.inputs['Emission Color'])
    bs.inputs['Emission Strength'].default_value = 1.0
    return mat


def separar_luzes(o, col):
    """Separa as faces de cada rotulo de luz numa malha propria (vertex groups e normais vao junto)."""
    me = o.data
    camada = me.attributes['rotulo']
    vals = np.empty(len(me.polygons), np.int32)
    camada.data.foreach_get('value', vals)
    luzes = {}
    for nome in ('Luz_Farol', 'Luz_Seta_E', 'Luz_Seta_D', 'Luz_Lanterna'):
        rots = [r for r, n in MALHA_DO_ROTULO.items() if n == nome]
        sel = np.isin(vals, rots)
        if not sel.any():
            print('AVISO: sem faces para', nome)
            continue
        so_ativo([o])
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='DESELECT')
        bpy.ops.object.mode_set(mode='OBJECT')
        me.polygons.foreach_set('select', sel)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.separate(type='SELECTED')
        bpy.ops.object.mode_set(mode='OBJECT')
        novo = [ob for ob in bpy.context.selected_objects if ob != o][0]
        novo.name = nome
        novo.data.name = nome
        luzes[nome] = novo
        vals = np.empty(len(me.polygons), np.int32)
        me.attributes['rotulo'].data.foreach_get('value', vals)
    return luzes


# ---------------------------------------------------------------- colisao e export
def colisao(objs, col):
    bm = bmesh.new()
    for ob in objs:
        for v in ob.data.vertices:
            if abs(v.co.x) <= 0.30 and v.co.z < 1.02:
                bm.verts.new(v.co)
    bmesh.ops.convex_hull(bm, input=bm.verts[:])
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    me = bpy.data.meshes.new("Moto_Colisao")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("Moto_Colisao", me)
    col.objects.link(ob)
    mod = ob.modifiers.new("reduz", 'DECIMATE')
    mod.ratio = 0.10
    dg = bpy.context.evaluated_depsgraph_get()
    novo = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    velho = ob.data
    ob.data = novo
    bpy.data.meshes.remove(velho)
    novo.name = "Moto_Colisao"
    ob.hide_render = True
    return ob


def exportar(objs, caminho):
    so_ativo(objs)
    bpy.ops.export_scene.gltf(filepath=caminho, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=False, export_animations=False, export_skins=True, export_def_bones=False,
                              export_image_format='AUTO', export_jpeg_quality=90, export_image_quality=90,
                              export_normals=True, export_texcoords=True, export_tangents=False, export_extras=False,
                              export_materials='EXPORT', export_rest_position_armature=True)
    for ob in objs:
        ob.select_set(False)
    print("exportado", caminho, os.path.getsize(caminho) // 1024, "KB")


def separar_faces(o, rots, nome):
    """Separa as faces com rotulo em rots numa malha nova (mantem grupos de vertices e normais)."""
    me = o.data
    vals = np.empty(len(me.polygons), np.int32)
    me.attributes['rotulo'].data.foreach_get('value', vals)
    sel = np.isin(vals, rots)
    if not sel.any():
        return None
    so_ativo([o])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    me.polygons.foreach_set('select', sel)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    novo = [ob for ob in bpy.context.selected_objects if ob != o][0]
    novo.name = nome
    novo.data.name = nome
    return novo


def gerar(exportar_glb=True):
    os.makedirs(SAIDA, exist_ok=True)
    HUBS.clear()
    for nome in ('Moto', 'Moto_Rig', 'Moto_Colisao', 'Moto_Rodas', 'Luz_Farol', 'Luz_Seta_E', 'Luz_Seta_D', 'Luz_Lanterna',
                 'Fogo_Dianteira', 'Fogo_Traseira'):
        ob = bpy.data.objects.get(nome)
        if ob:
            bpy.data.objects.remove(ob)
    o = transformar()
    lab, info = rotular(o)
    medir_eixos(o, lab)
    cores, _, img, uv = _cor_faces(o.data, info['st'], info['tot'])
    rot_v = cortar_por_rotulo(o, lab)
    medir_pontos(o, rot_v)
    o.name = OBJ
    o.data.name = OBJ
    col = colecao("Moto_Fogo")
    for c in list(o.users_collection):
        c.objects.unlink(o)
    col.objects.link(o)
    base_jpg = os.path.join(SAIDA, 'moto_fogo_base.jpg')
    sc = bpy.context.scene
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = 92
    img.save_render(base_jpg, scene=sc)
    base = bpy.data.images.load(base_jpg, check_existing=False)
    base.name = 'moto_fogo_base'
    luz = mapa_brilho(img, None, o.data, lab, os.path.join(SAIDA, 'moto_fogo_luz.png'))
    rodas_novas = construir_rodas(col, cores, lab, info)
    o.data.materials.clear()
    o.data.materials.append(material_base(base))
    rig = criar_rig(col, lista_ossos())
    o.vertex_groups.clear()
    for osso in sorted(set(OSSO_DO_ROTULO.values())):
        idx = np.where(np.isin(rot_v, [r for r, b in OSSO_DO_ROTULO.items() if b == osso]))[0].tolist()
        vg = o.vertex_groups.new(name=osso)
        if idx:
            vg.add(idx, 1.0, 'REPLACE')
    velhas = separar_faces(o, [RODA_F, RODA_R], 'rodas_velhas')
    if velhas:
        bpy.data.objects.remove(velhas)
    luzes = separar_luzes(o, col)
    m_luz = material_luzes(base, luz)
    for ob in [o, rodas_novas] + list(luzes.values()):
        if ob in luzes.values():
            ob.data.materials.clear()
            ob.data.materials.append(m_luz)
        for vg in list(ob.vertex_groups):
            if not any(vg.index == g.group for v in ob.data.vertices for g in v.groups):
                ob.vertex_groups.remove(vg)
        mod = ob.modifiers.new("Armature", 'ARMATURE')
        mod.object = rig
        ob.parent = rig
        if 'rotulo' in ob.data.attributes:
            ob.data.attributes.remove(ob.data.attributes['rotulo'])
    coli = colisao([o, rodas_novas] + list(luzes.values()), colecao("Moto_Colisao"))
    todos = [o, rodas_novas] + list(luzes.values())
    tri = sum(len(p.vertices) - 2 for ob in todos for p in ob.data.polygons)
    print('triangulos', tri, '| rodas', len(rodas_novas.data.polygons), 'faces | eixos', HUBS)
    if exportar_glb:
        exportar([rig] + todos, os.path.join(SAIDA, 'moto_fogo.glb'))
        exportar([coli], os.path.join(SAIDA, 'moto_fogo_colisao.glb'))
        bpy.ops.wm.save_as_mainfile(filepath=BLEND, copy=True)
    return rig, o, rodas_novas, luzes
