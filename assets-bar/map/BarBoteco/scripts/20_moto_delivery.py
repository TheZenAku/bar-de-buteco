# 20_moto_delivery.py
# Moto de entrega "Highland Bar Delivery" para o jogo no PlayCanvas, feita a partir do GLB do Sketchfab
# (Downloads\pizza_delivery_bike.glb: scooter estilo Vespa, 1 malha de 2298 triangulos em 351 pedacos soltos, atlas
# JPG de 512 px). Roda com exec no Blender MCP (refaz tudo a cada execucao; o import original que estiver na cena vai
# para a colecao "Moto_Original", excluida da view layer) ou em segundo plano, numa cena vazia:
#   "D:\SteamLibrary\steamapps\common\Blender\blender.exe" -b --factory-startup -P 20_moto_delivery.py -- --exportar
#
# Etapas:
#   1. solda os vertices, escala para tamanho real (ESCALA: banco a ~0,79 m do chao) e poe as rodas no chao, com a
#      origem no chao entre os eixos. Frente da moto = -Y no Blender = +Z no glTF/PlayCanvas (padrao glTF; o
#      personagem do Mixamo tambem olha para +Z, entao os dois encaixam sem girar)
#   2. arredonda: rodas refeitas com LADOS_RODA lados, pneu abaulado e cubo rebaixado (mesmo mapeamento do atlas);
#      carenagem, guidao, farol, espelhos e para-lamas com 1 nivel de Catmull-Clark (quinas > ANG_VINCO vincadas);
#      banco, bau e tapete ja eram lisos/retos e ficam como estao
#   3. atlas novo 1024x512: metade esquerda = atlas original (sem o painel da pizzaria), metade direita = painel do
#      bau com o emblema (laterais do bau); frente e tras do bau ficam vermelhas como a tampa
#   4. rig "Moto_Rig": pele rigida (cada vertice 100% em 1 osso), 1 malha e 1 material = 1 draw call
#        raiz > chassi > direcao > roda_dianteira          direcao gira no proprio eixo Y (inclinado como a coluna)
#                      > roda_traseira, bau               rodas giram no eixo X local
#      pontos de encaixe (ossos sem deformacao, apontando para cima = rotacao identidade no glTF):
#        ponto_piloto (assento), ponto_mao_E/D (manoplas, seguem a direcao), ponto_pe_E/D (assoalho),
#        ponto_farol (segue a direcao), ponto_lanterna, ponto_escapamento, ponto_entrega (tampa do bau)
#      E/D = esquerda/direita do piloto (esquerda = +X)
#   5. exporta export\moto\moto_delivery.glb (+ moto_delivery_colisao.glb: casco convexo simples, sem espelhos) e
#      salva uma copia do .blend em Desktop\BAR\2.0\moto\
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
GLB_FONTE = r"C:\Users\rafael\Downloads\pizza_delivery_bike.glb"
LOGO = r"C:\Users\rafael\Desktop\BAR\2.0\logo\Emblema Neon Highland Bar Delivery.png"
SAIDA = r"C:\Users\rafael\BarBoteco\export\moto"
BLEND_COPIA = r"C:\Users\rafael\Desktop\BAR\2.0\moto\moto_delivery.blend"
if "--exportar" in ARGS:
    bpy.ops.wm.read_factory_settings(use_empty=True)

SC = bpy.context.scene
ESCALA = 0.8                 # o GLB vem ~25% grande (banco a 0,99 m do chao, 2,5 m de comprimento)
LADOS_RODA = 32
ANG_VINCO = 55               # quinas mais fechadas que isso ficam vincadas no Catmull-Clark
ANG_SUAVE = 50               # auto smooth da malha final
ATLAS_PX = 512               # lado do atlas original
# medidas do GLB original (coordenadas de mundo do import, metros, antes da ESCALA)
TOPO_COLUNA = Vector((0.002, -0.715, 0.485))     # centro do topo da coluna = pivo da mesa do guidao
Y_PILOTO, Y_PES, X_PES = 0.36, -0.22, 0.11       # quadril no banco / pes no assoalho
PONTOS_FIXOS = {"ponto_lanterna": Vector((-0.02, 1.19, -0.11)), "ponto_escapamento": Vector((-0.22, 1.05, -0.62))}
PAINEL_ANTIGO = (290, 117, 500, 333)             # px do atlas (x0, y0, x1, y1, y a partir do topo): logo da pizzaria
VERMELHO_TAMPA = (196, 211, 214, 229)            # px do atlas: vermelho liso da tampa do bau
COLS = ["Moto_Delivery", "Moto_Colisao"]


# ---------------------------------------------------------------- limpeza
def limpar():
    for nome in COLS + ["TMP_partes"]:
        col = bpy.data.collections.get(nome)
        if col:
            for o in list(col.objects):
                bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.collections.remove(col)
    for dados in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images):
        for d in list(dados):
            if d.users == 0 and (d.name.startswith(("Moto_", "moto_", "P0", "TMP_")) or dados is bpy.data.meshes):
                dados.remove(d)


def guardar_original():
    raiz = bpy.data.objects.get("Sketchfab_model")
    if not raiz:
        return
    col = bpy.data.collections.get("Moto_Original") or bpy.data.collections.new("Moto_Original")
    if col.name not in SC.collection.children:
        SC.collection.children.link(col)
    for o in [raiz] + list(raiz.children_recursive):
        for c in list(o.users_collection):
            if c != col:
                c.objects.unlink(o)
        if o.name not in col.objects:
            col.objects.link(o)
    lc = bpy.context.view_layer.layer_collection.children.get(col.name)
    if lc:
        lc.exclude = True


def colecao(nome):
    col = bpy.data.collections.new(nome)
    SC.collection.children.link(col)
    return col


# ---------------------------------------------------------------- fonte
def importar_fonte():
    bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=GLB_FONTE)
    novos = [o for o in bpy.data.objects if o not in antes]
    fonte = next(o for o in novos if o.type == 'MESH')
    me = fonte.data.copy()
    me.transform(fonte.matrix_world)
    mat = fonte.active_material
    img = next(n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE')
    w, h = img.size
    atlas = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(atlas)
    malha_import = fonte.data
    for o in novos:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.meshes.remove(malha_import)
    bpy.data.materials.remove(mat)
    bpy.data.images.remove(img)
    return me, atlas.reshape(h, w, 4)


def componentes(bm):
    bm.faces.index_update()
    bm.faces.ensure_lookup_table()
    visto, comps = set(), []
    for f in bm.faces:
        if f.index in visto:
            continue
        pilha, comp = [f], []
        visto.add(f.index)
        while pilha:
            g = pilha.pop()
            comp.append(g.index)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in visto:
                        visto.add(h.index)
                        pilha.append(h)
        comps.append(comp)
    return comps


def caixa(bm, faces):
    pts = [v.co for i in faces for v in bm.faces[i].verts]
    return (Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))),
            Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))))


def classificar(mn, mx, n):
    """(osso, tipo) de um pedaco da malha original; tipo: roda / cc (arredondar) / liso (fica como esta)"""
    c = (mn + mx) / 2
    if mn.z < -0.85 and mx.z < -0.35 and abs(c.x) < 0.12:
        return ("roda_dianteira" if c.y < 0 else "roda_traseira"), "roda"
    if mn.y > 0.55 and mn.z > -0.12:
        return "bau", "liso"
    if n > 200 and mn.y > 0.05 and mx.y < 0.7 and mn.z > -0.15 and mx.z < 0.1:
        return "chassi", "liso"                       # banco
    if n <= 40 and mn.z > -0.47 and mx.z < -0.38:
        return "chassi", "liso"                       # tapete do assoalho
    if mn.y < -1.2 and mx.z < -0.2:
        return "direcao", "cc"                        # para-lama dianteiro (gira com a roda, como na Vespa)
    if mn.z > 0.44 and c.y < -0.4:
        return "direcao", "cc"                        # mesa, guidao, farol, espelhos, manetes
    return "chassi", "cc"


# ---------------------------------------------------------------- arredondar
def objeto(me, nome, col):
    ob = bpy.data.objects.new(nome, me)
    col.objects.link(ob)
    return ob


def malha_do_grupo(bm, faces, nome):
    bm2 = bm.copy()
    manter = set(faces)
    bmesh.ops.delete(bm2, geom=[f for i, f in enumerate(bm2.faces) if i not in manter], context='FACES')
    me = bpy.data.meshes.new(nome)
    bm2.to_mesh(me)
    bm2.free()
    return me


def aplicar_cc(ob):
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.join_triangles(bm, faces=bm.faces[:], cmp_seam=False, cmp_sharp=False, cmp_uvs=True, cmp_vcols=False,
                             cmp_materials=True, angle_face_threshold=math.radians(40),
                             angle_shape_threshold=math.radians(40))
    vinco = bm.edges.layers.float.get("crease_edge") or bm.edges.layers.float.new("crease_edge")
    lim = math.radians(ANG_VINCO)
    for e in bm.edges:
        e[vinco] = 1.0 if len(e.link_faces) == 2 and e.calc_face_angle(0) > lim else 0.0
    bm.to_mesh(me)
    bm.free()
    mod = ob.modifiers.new("cc", 'SUBSURF')
    mod.levels = mod.render_levels = 1
    mod.use_creases = True
    mod.uv_smooth = 'PRESERVE_BOUNDARIES'
    novo = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    ob.modifiers.remove(mod)
    ob.data = novo
    bpy.data.meshes.remove(me)
    novo.name = ob.name
    if "crease_edge" in novo.attributes:
        novo.attributes.remove(novo.attributes["crease_edge"])


def refazer_roda(me_velha, nome):
    """Roda nova com LADOS_RODA lados: tampas planas com o cubo rebaixado (UV planar como no original) e banda do pneu
    abaulada (UV do original: u ~ |angulo|, v por anel). Devolve (malha, centro, raio)."""
    co = np.array([v.co[:] for v in me_velha.vertices])
    c = (co.min(0) + co.max(0)) / 2
    mw = (co.max(0)[0] - co.min(0)[0]) / 2                       # meia largura
    rr = np.hypot(co[:, 1] - c[1], co[:, 2] - c[2])
    rt = rr.max()                                                  # raio do pneu
    raro = rr[(np.abs(co[:, 0] - c[0]) > 0.75 * mw) & (rr > 0.3 * rt)].mean()
    xo = np.abs(co[rr > rt - 0.02 * rt, 0] - c[0]).mean()        # meia largura da banda de rodagem
    uvl = me_velha.uv_layers.active.data
    tampa = {-1: ([], []), 1: ([], [])}
    bu, bv = ([], []), {}
    for p in me_velha.polygons:
        for li in p.loop_indices:
            v = me_velha.vertices[me_velha.loops[li].vertex_index].co
            dy, dz = v.y - c[1], v.z - c[2]
            uv = uvl[li].uv
            if abs(p.normal.x) > 0.7:
                s = 1 if p.normal.x > 0 else -1
                tampa[s][0].append((dy, dz, 1.0))
                tampa[s][1].append((uv.x, uv.y))
            else:
                bu[0].append((1.0, abs(math.atan2(dz, dy))))
                bu[1].append(uv.x)
                s = 1 if v.x > c[0] else -1
                bv.setdefault((s, "aro" if math.hypot(dy, dz) < (raro + rt) / 2 else "ombro"), []).append(uv.y)
    A = {s: np.linalg.lstsq(np.array(tampa[s][0]), np.array(tampa[s][1]), rcond=None)[0] for s in (-1, 1)}
    u0, du = np.linalg.lstsq(np.array(bu[0]), np.array(bu[1]), rcond=None)[0]
    vb = {k: float(np.mean(v)) for k, v in bv.items()}
    for s in (-1, 1):
        vb[(s, "meio")] = (vb[(s, "aro")] + vb[(s, "ombro")]) / 2

    N = LADOS_RODA
    rebaixo = 0.11 * mw
    k = math.radians(45)
    perfil = [("cubo", mw - rebaixo, 0.55 * raro, "tampa"), ("talao", mw, 0.62 * raro, "tampa"),
              ("aro", mw, raro, "tampa"), ("meio", xo + (mw - xo) * math.cos(k), raro + (rt - raro) * math.sin(k), "banda"),
              ("ombro", xo, rt, "banda")]
    bm = bmesh.new()
    uvc = bm.loops.layers.uv.new("UVMap")
    meta = {}
    aneis = {}
    for s in (-1, 1):
        centro = bm.verts.new((c[0] + s * (mw - rebaixo), c[1], c[2]))
        meta[centro] = (s, "centro", 0)
        aneis[(s, "centro")] = centro
        for nome_anel, x, r, _ in perfil:
            anel = []
            for i in range(N):
                a = 2 * math.pi * i / N
                vv = bm.verts.new((c[0] + s * x, c[1] + r * math.cos(a), c[2] + r * math.sin(a)))
                meta[vv] = (s, nome_anel, i)
                anel.append(vv)
            aneis[(s, nome_anel)] = anel

    def uv_de(vv, tipo):
        s, nome_anel, i = meta[vv]
        if tipo == "tampa":
            dy, dz = vv.co.y - c[1], vv.co.z - c[2]
            return tuple(np.array((dy, dz, 1.0)) @ A[s])
        a = 2 * math.pi * i / N
        a = a if a <= math.pi else 2 * math.pi - a
        return (u0 + du * a, vb[(s, nome_anel)])

    def face(vs, tipo):
        f = bm.faces.new(vs)
        for l in f.loops:
            l[uvc].uv = uv_de(l.vert, tipo)

    for s in (-1, 1):
        cubo = aneis[(s, "cubo")]
        for i in range(N):
            face((aneis[(s, "centro")], cubo[i], cubo[(i + 1) % N]), "tampa")
        for (na, _, _, _), (nb, _, _, tipo) in zip(perfil, perfil[1:]):
            a_, b_ = aneis[(s, na)], aneis[(s, nb)]
            t = "tampa" if nb in ("talao", "aro") else "banda"
            for i in range(N):
                j = (i + 1) % N
                face((a_[i], a_[j], b_[j], b_[i]), t)
    e_, d_ = aneis[(-1, "ombro")], aneis[(1, "ombro")]
    for i in range(N):
        j = (i + 1) % N
        face((e_[i], e_[j], d_[j], d_[i]), "banda")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    return me, Vector(c), rt


# ---------------------------------------------------------------- textura
def metade_uv(me):
    uv = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv[0::2] *= 0.5
    me.uv_layers.active.data.foreach_set("uv", uv)


def px_para_uv(x, y):
    """px do atlas original (y a partir do topo) -> uv do atlas novo (metade esquerda)"""
    return (x / ATLAS_PX * 0.5, 1 - y / ATLAS_PX)


def ajustar_bau(ob):
    """Laterais (antes com o logo da pizzaria) -> painel novo na metade direita; frente e tras (que usavam as bordas do
    painel antigo) -> vermelho da tampa. Devolve a proporcao altura/largura do painel e o retangulo dele no atlas."""
    me = ob.data
    uvl = me.uv_layers.active.data
    x0, y0, x1, y1 = PAINEL_ANTIGO
    laterais, frente_tras = [], []
    for p in me.polygons:
        us = [uvl[l].uv for l in p.loop_indices]
        if all(x0 <= u.x * ATLAS_PX <= x1 and y0 <= (1 - u.y) * ATLAS_PX <= y1 for u in us):
            (laterais if abs(p.normal.x) > 0.9 else frente_tras).append(p)
    metade_uv(me)
    lados = {}
    for p in laterais:
        s = 1 if p.normal.x > 0 else -1
        lados.setdefault(s, []).extend(me.vertices[v].co for v in p.vertices)
    caixas = {s: (min(c.y for c in cs), max(c.y for c in cs), min(c.z for c in cs), max(c.z for c in cs))
              for s, cs in lados.items()}
    larg = np.mean([b[1] - b[0] for b in caixas.values()])
    alt = np.mean([b[3] - b[2] for b in caixas.values()])
    ph = int(round(ATLAS_PX * alt / larg))
    margem = 2
    pu0, pu1 = (ATLAS_PX + margem) / (2 * ATLAS_PX), (2 * ATLAS_PX - margem) / (2 * ATLAS_PX)
    pv0, pv1 = (ATLAS_PX - ph + margem) / ATLAS_PX, (ATLAS_PX - margem) / ATLAS_PX
    for p in laterais:
        s = 1 if p.normal.x > 0 else -1
        ya, yb, za, zb = caixas[s]
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u = (co.y - ya) / (yb - ya)
            u = u if s > 0 else 1 - u                  # visto de fora, +Y fica a direita no lado +X e a esquerda no -X
            v = (co.z - za) / (zb - za)
            uvl[li].uv = (pu0 + u * (pu1 - pu0), pv0 + v * (pv1 - pv0))
    xa, ya_, xb, yb_ = VERMELHO_TAMPA
    vermelho = px_para_uv((xa + xb) / 2, (ya_ + yb_) / 2)
    for p in frente_tras:
        for li in p.loop_indices:
            uvl[li].uv = vermelho
    print("bau: %d faces de painel, %d faces de frente/tras, painel %dx%d px" % (len(laterais), len(frente_tras), ATLAS_PX, ph))
    return ph


def compor_atlas(atlas, ph):
    h0, w0 = atlas.shape[:2]
    novo = np.zeros((h0, 2 * w0, 4), np.float32)
    novo[..., 3] = 1
    novo[:, :w0] = atlas
    xa, ya, xb, yb = VERMELHO_TAMPA
    vermelho = atlas[h0 - yb:h0 - ya, xa:xb, :3].reshape(-1, 3).mean(0)
    x0, y0, x1, y1 = PAINEL_ANTIGO
    novo[h0 - y1:h0 - y0, x0:x1, :3] = vermelho        # some com o logo da pizzaria

    # painel: fundo escuro em degrade radial, filete neon vermelho com cantos arredondados, moldura vermelha do bau
    pw = w0
    yy, xx = np.mgrid[0:ph, 0:pw].astype(np.float32)
    cx, cy = (pw - 1) / 2, (ph - 1) / 2
    t = np.clip(np.hypot((xx - cx) / pw, (yy - cy) / ph) * 2 / 1.25, 0, 1)[..., None]
    fundo = np.array((0.22, 0.03, 0.035)) * (1 - t) + np.array((0.05, 0.008, 0.012)) * t
    m, raio = 12.0, 30.0
    qx = np.abs(xx - cx) - (pw / 2 - m - raio)
    qy = np.abs(yy - cy) - (ph / 2 - m - raio)
    d = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - raio   # <0 dentro
    fora = np.clip(d / 2.0, 0, 1)[..., None]
    cor = fundo * (1 - fora) + vermelho * fora
    brilho = np.exp(-(d / 7.0) ** 2)[..., None]
    nucleo = np.clip(1 - np.abs(d) / 2.2, 0, 1)[..., None]
    cor = cor + brilho * np.array((0.9, 0.1, 0.04)) * 0.9 + nucleo * np.array((1.0, 0.72, 0.55))

    # emblema (alfa reto -> pre-multiplicado antes de reduzir, para nao escurecer a borda)
    logo = bpy.data.images.load(LOGO, check_existing=False)
    lw, lh = logo.size
    px = np.empty(lw * lh * 4, np.float32)
    logo.pixels.foreach_get(px)
    px = px.reshape(lh, lw, 4)
    px[..., :3] *= px[..., 3:4]
    logo.pixels.foreach_set(px.ravel())
    lado = int(ph - 2 * (m + 8))
    logo.scale(lado, lado)
    lp = np.empty(lado * lado * 4, np.float32)
    logo.pixels.foreach_get(lp)
    lp = lp.reshape(lado, lado, 4)
    bpy.data.images.remove(logo)
    ox, oy = (pw - lado) // 2, (ph - lado) // 2
    reg = cor[oy:oy + lado, ox:ox + lado]
    cor[oy:oy + lado, ox:ox + lado] = lp[..., :3] + reg * (1 - lp[..., 3:4])

    novo[h0 - ph:h0, w0:, :3] = np.clip(cor, 0, 1)
    novo[:h0 - ph, w0:, :3] = vermelho
    img = bpy.data.images.new("moto_delivery_atlas", 2 * w0, h0, alpha=False)
    img.pixels.foreach_set(novo.ravel())
    os.makedirs(SAIDA, exist_ok=True)
    img.filepath_raw = os.path.join(SAIDA, "moto_delivery_atlas.png")
    img.file_format = 'PNG'
    img.save()
    img.source = 'FILE'
    img.reload()
    return img


def material(img):
    mat = bpy.data.materials.new("Moto_Delivery_Mat")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.location = (-400, 200)
    nt.links.new(tex.outputs[0], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.55       # o original era 1.0 (fosco); a pintura pede algum brilho
    bsdf.inputs["Metallic"].default_value = 0.0
    return mat


# ---------------------------------------------------------------- rig
def criar_rig(col, ossos):
    arm = bpy.data.armatures.new("Moto_Rig")
    arm.display_type = 'STICK'
    rig = objeto(arm, "Moto_Rig", col)
    rig.show_in_front = True
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for nome, cabeca, cauda, pai, deforma in ossos:
        b = arm.edit_bones.new(nome)
        b.head, b.tail, b.roll = cabeca, cauda, 0.0
        b.use_deform = deforma
        if pai:
            b.parent = arm.edit_bones[pai]
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def exportar(objs, caminho):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=caminho, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=False, export_animations=False, export_skins=True, export_def_bones=False,
                              export_image_format='JPEG', export_jpeg_quality=90, export_image_quality=90,
                              export_normals=True, export_texcoords=True, export_tangents=False, export_extras=False,
                              export_materials='EXPORT', export_rest_position_armature=True)
    for o in objs:
        o.select_set(False)
    print("exportado", caminho, os.path.getsize(caminho) // 1024, "KB")


# ---------------------------------------------------------------- principal
if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
limpar()
guardar_original()
me_fonte, atlas = importar_fonte()
bm = bmesh.new()
bm.from_mesh(me_fonte)
bpy.data.meshes.remove(me_fonte)
tri0 = len(bm.faces)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
comps = componentes(bm)
grupos, pecas = {}, []
for comp in comps:
    mn, mx = caixa(bm, comp)
    osso, tipo = classificar(mn, mx, len(comp))
    grupos.setdefault((osso, tipo), []).extend(comp)
    pecas.append((osso, tipo, mn, mx, comp))

# medidas no espaco original -> transformacao para o espaco final
roda_f = next(p for p in pecas if p[0] == "roda_dianteira")
roda_t = next(p for p in pecas if p[0] == "roda_traseira")
y_meio = ((roda_f[2].y + roda_f[3].y) + (roda_t[2].y + roda_t[3].y)) / 4
z_chao = min(roda_f[2].z, roda_t[2].z)
MT = Matrix.Scale(ESCALA, 4) @ Matrix.Translation((0, -y_meio, -z_chao))


def centro(mn, mx):
    return (mn + mx) / 2


manoplas = [p for p in pecas if p[0] == "direcao" and p[2].z > 0.44 and (p[2].x > 0.5 or p[3].x < -0.5) and p[3].z < 0.65]
farol = next(p for p in pecas if p[0] == "direcao" and p[2].z > 0.44 and p[2].y < -0.80 and abs(centro(p[2], p[3]).x) < 0.05)
banco = next(p for p in pecas if p[1] == "liso" and len(p[4]) > 200)
tapete = next(p for p in pecas if p[1] == "liso" and p[0] == "chassi" and len(p[4]) <= 40)
bau_mn = Vector(np.min([p[2] for p in pecas if p[0] == "bau"], 0))
bau_mx = Vector(np.max([p[3] for p in pecas if p[0] == "bau"], 0))
topo_banco = max(v.co.z for i in banco[4] for v in bm.faces[i].verts if abs(v.co.y - Y_PILOTO) < 0.06 and abs(v.co.x) < 0.08)
pontos = {
    "ponto_piloto": ("chassi", Vector((0, Y_PILOTO, topo_banco))),
    "ponto_pe_E": ("chassi", Vector((X_PES, Y_PES, tapete[3].z))),
    "ponto_pe_D": ("chassi", Vector((-X_PES, Y_PES, tapete[3].z))),
    "ponto_farol": ("direcao", Vector((centro(farol[2], farol[3]).x, farol[2].y, centro(farol[2], farol[3]).z))),
    "ponto_entrega": ("bau", Vector(((bau_mn.x + bau_mx.x) / 2, (bau_mn.y + bau_mx.y) / 2, bau_mx.z))),
}
for p in manoplas:
    c = centro(p[2], p[3])
    pontos["ponto_mao_E" if c.x > 0 else "ponto_mao_D"] = ("direcao", c)
for nome, pos in PONTOS_FIXOS.items():
    pontos[nome] = ("chassi", pos)
bau_base = Vector(((bau_mn.x + bau_mx.x) / 2, (bau_mn.y + bau_mx.y) / 2, bau_mn.z))

bmesh.ops.transform(bm, matrix=MT, verts=bm.verts[:])
COL = colecao("Moto_Delivery")
partes = []
for (osso, tipo), faces in sorted(grupos.items()):
    nome = "TMP_%s_%s" % (osso, tipo)
    ob = objeto(malha_do_grupo(bm, faces, nome), nome, COL)
    ob["osso"] = osso
    partes.append(ob)
bm.free()

rodas = {}
for ob in partes:
    if ob.name.endswith("_roda"):
        me_nova, c, r = refazer_roda(ob.data, ob.name)
        velha = ob.data
        ob.data = me_nova
        bpy.data.meshes.remove(velha)
        rodas[ob["osso"]] = (c, r)
    elif ob.name.endswith("_cc"):
        aplicar_cc(ob)
ph = None
for ob in partes:
    if ob["osso"] == "bau":
        ph = ajustar_bau(ob)
    else:
        metade_uv(ob.data)
img = compor_atlas(atlas, ph)
mat = material(img)

for ob in partes:
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    vg = ob.vertex_groups.new(name=ob["osso"])
    vg.add(range(len(ob.data.vertices)), 1.0, 'REPLACE')
moto = partes[0]
with bpy.context.temp_override(active_object=moto, object=moto, selected_objects=partes, selected_editable_objects=partes):
    bpy.ops.object.join()
moto.name = moto.data.name = "Moto_Delivery"
del moto["osso"]
me = moto.data
me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
me.use_auto_smooth = True
me.auto_smooth_angle = math.radians(ANG_SUAVE)
me.validate()

# rig
cf, rf = rodas["roda_dianteira"]
ct, rtr = rodas["roda_traseira"]
eixo_topo = MT @ TOPO_COLUNA
cima = Vector((0, 0, 1))
ossos = [
    ("raiz", Vector((0, 0, 0)), Vector((0, 0, 0.25)), None, False),
    ("chassi", Vector((0, 0, 0)), Vector((0, 0, 0.45)), "raiz", True),
    ("direcao", cf, eixo_topo, "chassi", True),
    ("roda_dianteira", cf, cf + cima * rf, "direcao", True),
    ("roda_traseira", ct, ct + cima * rtr, "chassi", True),
    ("bau", MT @ bau_base, MT @ bau_base + cima * 0.3, "chassi", True),
]
for nome, (pai, pos) in sorted(pontos.items()):
    ossos.append((nome, MT @ pos, MT @ pos + cima * 0.08, pai, False))
rig = criar_rig(COL, ossos)
moto.parent = rig
mod = moto.modifiers.new("Armature", 'ARMATURE')
mod.object = rig
rig["raio_roda_dianteira"] = round(rf, 4)
rig["raio_roda_traseira"] = round(rtr, 4)

# colisao: casco convexo sem espelhos e manoplas, reduzido
COL_C = colecao("Moto_Colisao")
bmc = bmesh.new()
for v in me.vertices:
    if abs(v.co.x) < 0.4 * ESCALA:
        bmc.verts.new(v.co)
casco = bmesh.ops.convex_hull(bmc, input=bmc.verts[:])
bmesh.ops.delete(bmc, geom=list({g for g in casco["geom_interior"] + casco["geom_unused"] if isinstance(g, bmesh.types.BMVert)}), context='VERTS')
me_c = bpy.data.meshes.new("Moto_Delivery_Colisao")
bmc.to_mesh(me_c)
bmc.free()
colisao = objeto(me_c, "Moto_Delivery_Colisao", COL_C)
dec = colisao.modifiers.new("dec", 'DECIMATE')
dec.ratio = min(1.0, 120 / max(1, len(me_c.polygons)))
me_c2 = bpy.data.meshes.new_from_object(colisao.evaluated_get(bpy.context.evaluated_depsgraph_get()))
colisao.modifiers.remove(dec)
colisao.data = me_c2
bpy.data.meshes.remove(me_c)
me_c2.name = "Moto_Delivery_Colisao"
colisao.display_type = 'WIRE'

tris = sum(len(p.vertices) - 2 for p in me.polygons)
print("triangulos: original %d -> %d (%d vertices); colisao %d tri" % (
    tri0, tris, len(me.vertices), sum(len(p.vertices) - 2 for p in me_c2.polygons)))
dims = [round(x, 3) for x in moto.dimensions]
print("dimensoes (x, y, z) m:", dims, "| rodas r=%.3f / %.3f | entre-eixos %.3f" % (rf, rtr, (ct - cf).length))
for b in rig.data.bones:
    print("  osso %-18s pai %-10s cabeca %s" % (b.name, b.parent.name if b.parent else "-", tuple(round(x, 3) for x in b.head_local)))

exportar([rig, moto], os.path.join(SAIDA, "moto_delivery.glb"))
exportar([colisao], os.path.join(SAIDA, "moto_delivery_colisao.glb"))
colisao.hide_set(True)
if bpy.context.screen:
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.shading.color_type = 'MATERIAL'
os.makedirs(os.path.dirname(BLEND_COPIA), exist_ok=True)
if "--exportar" not in ARGS:
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_COPIA, copy=True)
    print("copia salva", BLEND_COPIA)
