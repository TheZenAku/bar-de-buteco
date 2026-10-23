# Pipeline dos props feitos a mao (colecao-asset PROPS-CRIADOS-MANUALMENTE).
# Para cada objeto da colecao gera uma versao de jogo "A_<nome>":
#   - malha decimada (orcamento de triangulos por tipo de objeto)
#   - escala real (altura em metros), origem no centro da base, assentos virados para -Y (encosto em +Y)
#   - texturas reduzidas (cor + normal em JPG); mapas metalico/rugosidade viram constantes
# Os originais NAO sao alterados. Itens novos colocados na colecao entram automaticamente.
# Controle opcional por objeto (propriedades personalizadas no objeto original):
#   altura_real_m  (float)  altura final em metros
#   tris_alvo      (int)    triangulos da versao de jogo
#   textura_px     (int)    resolucao maxima das texturas
import bpy, math, os, re
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
import barlib as B

SRC = "PROPS-CRIADOS-MANUALMENTE"
CAT = SRC                      # as versoes otimizadas (OTM_*) ficam dentro do proprio asset do usuario
ALTURA_HUMANA = 1.75           # as alturas da tabela REGRAS sao para uma pessoa de 1,75 m...
# ...e sao escaladas pelo personagem de referencia (objeto "rafael" ou com a propriedade referencia_escala=True)
ADIR = os.path.join(B.TEX_DIR, "assets")
os.makedirs(ADIR, exist_ok=True)

# (palavras-chave, altura real m, triangulos alvo, textura px, tipo)
REGRAS = [
    (("long-neck", "longneck", "long_neck", "garrafa", "cerveja"), 0.235, 300, 512, "objeto"),
    (("copo", "caneca", "taca", "tulipa"), 0.15, 250, 512, "objeto"),
    (("cadeira",), 0.80, 1600, 1024, "assento"),
    (("banqueta", "banquinho"), 0.75, 1200, 512, "assento"),
    (("sofa", "poltrona"), 0.85, 3000, 1024, "assento"),
    (("mesa",), 0.72, 2400, 1024, "mesa"),
    (("carrinho", "churrasqueira", "espeto"), 1.75, 3500, 1024, "fino"),   # ate o topo da chamine
    (("chopeira", "chopp", "chope"), 0.52, 2500, 1024, "objeto"),          # chopeira eletrica de balcao (2 torneiras)
    (("balcao",), 1.10, 3000, 1024, "objeto"),
    (("geladeira", "freezer"), 1.85, 2000, 1024, "objeto"),
    (("barril",), 0.60, 1200, 512, "objeto"),
    (("engradado",), 0.30, 800, 512, "objeto"),
    (("lixeira",), 0.70, 1000, 512, "objeto"),
    (("vaso", "planta"), 1.00, 2000, 1024, "objeto"),
]
PADRAO = (1.0, 2000, 1024, "objeto")


def regra(nome):
    n = nome.lower()
    for (keys, h, t, px, tipo) in REGRAS:
        if any(k in n for k in keys):
            return h, t, px, tipo
    return PADRAO


def slug(nome):
    return re.sub(r"[^A-Za-z0-9_-]+", "_", nome.strip())


def fonte_imagem(sock, depth=0):
    if not sock.is_linked or depth > 6:
        return None
    n = sock.links[0].from_node
    if n.type == 'TEX_IMAGE':
        return n.image
    for inp in n.inputs:
        r = fonte_imagem(inp, depth + 1)
        if r:
            return r
    return None


def pixels(img):
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def reduzir(img, px, nome, normal=False):
    a = pixels(img)
    h, w = a.shape[:2]
    f = max(1, max(w, h) // px)
    if f > 1:
        a = a[:h // f * f, :w // f * f].reshape(h // f, f, w // f, f, 4).mean((1, 3))
    if normal:
        n = a[..., :3] * 2 - 1
        n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-6
        a[..., :3] = n * 0.5 + 0.5
    a[..., 3] = 1.0
    tmp = bpy.data.images.new(nome + "_gen", a.shape[1], a.shape[0], alpha=False)
    tmp.pixels.foreach_set(np.ascontiguousarray(a).ravel())
    path = os.path.join(ADIR, nome + ".jpg")
    tmp.filepath_raw = path
    tmp.file_format = 'JPEG'
    try:
        tmp.save(filepath=path, quality=90)
    except TypeError:
        tmp.save()
    bpy.data.images.remove(tmp)
    im = bpy.data.images.get(nome + ".jpg")
    if im is None:
        im = bpy.data.images.load(path)
        im.name = nome + ".jpg"
    else:
        im.filepath = path
        im.reload()
    im.colorspace_settings.name = 'Non-Color' if normal else 'sRGB'
    return im, a.shape[1]


def material_asset(nome, base_img, nrm_img, rough, metal, dupla_face=False):
    m = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (500, 0)
    bs = nt.nodes.new("ShaderNodeBsdfPrincipled"); bs.location = (200, 0)
    nt.links.new(bs.outputs[0], out.inputs["Surface"])
    bs.inputs["Roughness"].default_value = rough
    bs.inputs["Metallic"].default_value = metal
    if base_img:
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = base_img; t.location = (-400, 200)
        nt.links.new(t.outputs["Color"], bs.inputs["Base Color"])
    if nrm_img:
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = nrm_img; t.location = (-400, -200)
        nm = nt.nodes.new("ShaderNodeNormalMap"); nm.location = (-100, -200)
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bs.inputs["Normal"])
    m.use_backface_culling = not dupla_face          # plastico fino (cadeiras/mesas): dupla face evita "furos"
    m["tile_u"], m["tile_v"] = 1.0, 1.0
    return m


def _avaliar(me_in, mods):
    tc = B.coll("_tmp_assets", bpy.context.scene.collection)
    tmp = bpy.data.objects.new("_tmp_dec", me_in)
    tc.objects.link(tmp)
    for kind, kw in mods:
        md = tmp.modifiers.new("dec", 'DECIMATE')
        md.decimate_type = kind
        for k, v in kw.items():
            setattr(md, k, v)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg), preserve_all_data_layers=False, depsgraph=dg)
    bpy.data.objects.remove(tmp)
    bpy.data.collections.remove(tc)
    me.calc_loop_triangles()
    return me


def decimar(src, alvo):
    """1) funde faces coplanares sem cruzar bordas de UV (tampos, assentos planos ficam sem distorcer a estampa);
    2) colapso de arestas ate o orcamento."""
    me_src = src.data
    me_src.calc_loop_triangles()
    n = len(me_src.loop_triangles)
    tc = B.coll("_tmp_assets", bpy.context.scene.collection)
    tmp = bpy.data.objects.new("_tmp_dec", me_src)
    tc.objects.link(tmp)
    if alvo < n:
        d1 = tmp.modifiers.new("dis", 'DECIMATE')
        d1.decimate_type = 'DISSOLVE'
        d1.angle_limit = math.radians(1.0)
        d1.delimit = {'UV'}
        dg = bpy.context.evaluated_depsgraph_get()
        dg.update()
        ev = tmp.evaluated_get(dg)
        tm = ev.to_mesh()
        tm.calc_loop_triangles()
        n1 = len(tm.loop_triangles)
        ev.to_mesh_clear()
        if n1 > alvo:
            d2 = tmp.modifiers.new("col", 'DECIMATE')
            d2.decimate_type = 'COLLAPSE'
            d2.ratio = max(alvo / n1, 0.0005)
            d2.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg), preserve_all_data_layers=False, depsgraph=dg)
    bpy.data.objects.remove(tmp)
    bpy.data.collections.remove(tc)
    me.calc_loop_triangles()
    return me, n


def _salvar_img(img, path, normal=False):
    img.filepath_raw = path
    img.file_format = 'JPEG'
    try:
        img.save(filepath=path, quality=92)
    except TypeError:
        img.save()
    nm = os.path.basename(path)
    old = bpy.data.images.get(nm)
    if old is not None and old != img:
        old.user_remap(img)
        bpy.data.images.remove(old)
    img.name = nm
    img.source = 'FILE'
    img.filepath = path
    img.reload()
    img.colorspace_settings.name = 'Non-Color' if normal else 'sRGB'
    return img


def bake_high_low(src, me_low, nome, px):
    """UV nova (smart project) na malha leve + bake da cor e do normal do original (selected to active)."""
    tc = B.coll("_tmp_bake", bpy.context.scene.collection)
    low = bpy.data.objects.new("_low_" + nome, me_low)
    tc.objects.link(low)
    low.matrix_world = src.matrix_world.copy()
    vl = bpy.context.view_layer
    sel_antes = [o for o in bpy.context.selected_objects]
    for o in sel_antes:
        o.select_set(False)
    low.select_set(True)
    vl.objects.active = low
    with bpy.context.temp_override(active_object=low, object=low, selected_objects=[low], selected_editable_objects=[low]):
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, correct_aspect=True)
        bpy.ops.object.mode_set(mode='OBJECT')
    imgs = {}
    for kind in ("cor", "normal"):
        im = bpy.data.images.new("A_%s_%s_bake" % (nome, kind), px, px, alpha=False)
        im.generated_color = (0.5, 0.5, 1.0, 1.0) if kind == "normal" else (0.5, 0.5, 0.5, 1.0)
        if kind == "normal":
            im.colorspace_settings.name = 'Non-Color'
        imgs[kind] = im
    mat = bpy.data.materials.new("_bake_tmp")
    mat.use_nodes = True
    tn = mat.node_tree.nodes.new("ShaderNodeTexImage")
    me_low.materials.clear()
    me_low.materials.append(mat)
    scn = bpy.context.scene
    eng = scn.render.engine
    scn.render.engine = 'CYCLES'
    scn.cycles.samples = 4
    try:
        scn.cycles.use_denoising = False
    except Exception:
        pass
    src.select_set(True)
    low.select_set(True)
    vl.objects.active = low
    size = max(src.dimensions)
    for kind, btype in (("cor", 'DIFFUSE'), ("normal", 'NORMAL')):
        tn.image = imgs[kind]
        mat.node_tree.nodes.active = tn
        kw = dict(type=btype, use_selected_to_active=True, cage_extrusion=size * 0.015,
                  max_ray_distance=size * 0.05, margin=8)
        if btype == 'DIFFUSE':
            kw["pass_filter"] = {'COLOR'}
        else:
            kw["normal_space"] = 'TANGENT'
        with bpy.context.temp_override(active_object=low, object=low, selected_objects=[src, low],
                                       selected_editable_objects=[src, low]):
            bpy.ops.object.bake(**kw)
    scn.render.engine = eng
    out = {k: _salvar_img(im, os.path.join(ADIR, "A_%s_%s.jpg" % (nome, k)), normal=(k == "normal")) for k, im in imgs.items()}
    me_low.materials.clear()
    bpy.data.materials.remove(mat)
    for o in (src, low):
        o.select_set(False)
    for o in sel_antes:
        o.select_set(True)
    low.matrix_world = Matrix.Identity(4)
    bpy.data.objects.remove(low)
    bpy.data.collections.remove(tc)
    return out["cor"], out["normal"]


def coords(me):
    a = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", a)
    return a.reshape(-1, 3)


def processar(src):
    nome = slug(src.name)
    h_def, t_def, px_def, tipo = regra(src.name)
    altura = float(src.get("altura_real_m", h_def * FATOR))
    alvo = int(src.get("tris_alvo", t_def))
    px = int(src.get("textura_px", px_def))
    me, n_orig = decimar(src, alvo)
    # rugosidade / metalico do original viram constantes
    sm = src.material_slots[0].material if src.material_slots else None
    rough, metal = 0.5, 0.0
    if sm and sm.use_nodes:
        bs = next((n for n in sm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bs:
            rimg, mimg = fonte_imagem(bs.inputs["Roughness"]), fonte_imagem(bs.inputs["Metallic"])
            rough = float(pixels(rimg)[..., 0].mean()) if rimg else bs.inputs["Roughness"].default_value
            metal = float(pixels(mimg)[..., 0].mean()) if mimg else bs.inputs["Metallic"].default_value
    base, nrm = bake_high_low(src, me, nome, px)
    me.transform(src.matrix_world)
    co = coords(me)
    mn, mx = co.min(0), co.max(0)
    ctr = (mn + mx) / 2
    rot = 0
    if tipo == "assento":
        top = co[co[:, 2] > mn[2] + 0.7 * (mx[2] - mn[2])]
        c = top[:, :2].mean(0) - ctr[:2]
        if max(abs(c[0]), abs(c[1])) < 0.15 * max(mx[0] - mn[0], mx[1] - mn[1]):
            rot = 0                                  # simetrico (sem encosto, ex.: banqueta): nao gira
        elif abs(c[0]) > abs(c[1]):
            rot = 90 if c[0] > 0 else -90
        else:
            rot = 0 if c[1] > 0 else 180
    me.transform(Matrix.Rotation(math.radians(rot), 4, 'Z') @ Matrix.Translation(Vector((-ctr[0], -ctr[1], -mn[2]))))
    co = coords(me)
    s = altura / max(co[:, 2].max() - co[:, 2].min(), 1e-6)
    me.transform(Matrix.Scale(s, 4))
    for p in me.polygons:
        p.use_smooth = True
    if hasattr(me, "use_auto_smooth"):
        me.use_auto_smooth = True
        me.auto_smooth_angle = math.radians(60)
    # material otimizado (texturas vindas do bake)
    metal = metal if metal > 0.2 else 0.0
    mat = material_asset("A_" + nome, base, nrm, round(min(max(rough, 0.05), 1.0), 3), round(metal, 3),
                         dupla_face=bool(src.get("dupla_face", tipo in ("assento", "mesa", "fino"))))
    me.materials.clear()
    me.materials.append(mat)
    # medidas uteis para o posicionamento
    co = coords(me)
    mn, mx = co.min(0), co.max(0)
    me["altura_m"] = float(mx[2] - mn[2])
    me["largura_m"] = float(mx[0] - mn[0])
    me["profundidade_m"] = float(mx[1] - mn[1])
    me["origem"] = src.name
    me["tipo"] = tipo
    if tipo == "mesa":
        bvh = BVHTree.FromPolygons([v.co for v in me.vertices], [p.vertices[:] for p in me.polygons])
        hits = [bvh.ray_cast(Vector((x, y, mx[2] + 1)), Vector((0, 0, -1))) for x in (-0.1, 0.0, 0.1) for y in (-0.1, 0.0, 0.1)]
        zs = [h[0].z for h in hits if h[0] is not None]
        me["topo_z"] = float(max(zs) if zs else mx[2])
        me["raio_tampo"] = float(min(mx[0] - mn[0], mx[1] - mn[1]) / 2)
    me.calc_loop_triangles()
    alvo_nome = "A_" + nome
    old = bpy.data.meshes.get(alvo_nome)
    if old is not None and old != me:
        old.user_remap(me)
        bpy.data.meshes.remove(old)
    me.name = alvo_nome
    cat = bpy.data.collections[CAT]
    ob = bpy.data.objects.get("OTM_" + nome)
    if ob is None:
        ob = bpy.data.objects.new("OTM_" + nome, me)
        cat.objects.link(ob)
    ob.data = me
    ob["otimizado"] = True
    ob["origem"] = src.name
    ob["altura_m"] = round(float(me["altura_m"]), 3)
    if ob.asset_data is None:
        ob.asset_mark()
    ob.asset_data.description = "Versao de jogo de '%s' (%d tris, escala do personagem de referencia)" % (src.name, len(me.loop_triangles))
    for t in ("otimizado", "bar", tipo):
        if t not in ob.asset_data.tags:
            ob.asset_data.tags.new(t)
    for img in (base, nrm):
        if img is not None and img.packed_file is None:
            img.pack()                                    # asset autossuficiente (texturas embutidas no .blend)
    return dict(nome=alvo_nome, origem=src.name, tipo=tipo, rot=rot, tris=len(me.loop_triangles), tris_orig=n_orig,
                dims=tuple(round(v, 3) for v in (mx - mn)), tex=px, rough=mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value
                if "Principled BSDF" in mat.node_tree.nodes else rough, topo=me.get("topo_z"))


def fx_churrasqueira(nome, ob):
    """Acha braseiro (camada mais densa na parte de baixo da caixa) e saida da chamine pela geometria e cria
    os pontos de efeito como filhos do asset otimizado:
      FX_Fogo   (empty)  centro do braseiro -> luz/brilho do fogo
      FX_Fumaca (empty)  saida da chamine, eixo +Z = direcao da fumaca -> emissor de particulas
      FX_Brasas (malha)  placa emissiva das brasas (o jogo pode animar a intensidade)"""
    me = ob.data
    co = coords(me)
    H = float(co[:, 2].max())
    caixa = co[(co[:, 2] > 0.40 * H) & (co[:, 2] < 0.72 * H)]
    if len(caixa) < 50:
        return
    bx0, bx1 = np.percentile(caixa[:, 0], [4, 96])
    by0, by1 = np.percentile(caixa[:, 1], [4, 96])
    # braseiro = maior superficie horizontal voltada para cima na metade de baixo da caixa
    me.calc_loop_triangles()
    areas = {}
    for t in me.loop_triangles:
        if t.normal.z > 0.9:
            z = sum(me.vertices[i].co.z for i in t.vertices) / 3
            if 0.38 * H < z < 0.50 * H:
                k = round(z / H, 2)
                areas[k] = areas.get(k, 0.0) + t.area
    z_brasa = float(max(areas, key=areas.get) * H) if areas else 0.43 * H
    chm = co[(co[:, 2] > 0.82 * H) & (co[:, 2] < 0.94 * H)]
    if len(chm) > 10:
        chx, chy = np.percentile(chm[:, 0], [5, 95]).mean(), np.percentile(chm[:, 1], [5, 95]).mean()
    else:
        chx, chy = (bx0 + bx1) / 2, (by0 + by1) / 2
    z_fumaca = 0.945 * H
    cxb, cyb = float((bx0 + bx1) / 2), float((by0 + by1) / 2)
    me["fx_fogo"] = [cxb, cyb, z_brasa + 0.08]
    me["fx_fumaca"] = [float(chx), float(chy), float(z_fumaca)]
    ix, iy = (bx1 - bx0) * 0.42, (by1 - by0) * 0.40
    me["fx_brasas"] = [cxb - ix, cxb + ix, cyb - iy, cyb + iy, z_brasa + 0.006]
    # placa das brasas (malha compartilhada entre asset e mapa)
    bm_ = B.Mesh("A_" + nome + "_brasas")
    x0, x1, y0, y1, zb = me["fx_brasas"]
    bm_.face([(x0, y0, zb), (x1, y0, zb), (x1, y1, zb), (x0, y1, zb)], "Brasa_Fogo",
             uvs=[(0, 0), (2, 0), (2, 1.2), (0, 1.2)], facing=(0, 0, 1))
    mb = bm_.mesh()
    old = bpy.data.meshes.get("A_" + nome + "_brasas")
    if old is not None and old != mb:
        old.user_remap(mb); bpy.data.meshes.remove(old); mb.name = "A_" + nome + "_brasas"
    cat = bpy.data.collections[CAT]
    filhos = {"FX_Fogo": ('SPHERE', 0.10, me["fx_fogo"], "fogo", "Centro do braseiro: coloque aqui a luz do fogo (PointLight laranja, piscando)"),
              "FX_Fumaca": ('SINGLE_ARROW', 0.30, me["fx_fumaca"], "fumaca", "Saida da chamine: emissor de fumaca; o eixo +Z (Y no glTF) aponta a direcao")}
    for base_nome, (disp, tam, pos, tipo_fx, desc) in filhos.items():
        nm = "%s_%s" % (base_nome, nome)
        e = bpy.data.objects.get(nm) or bpy.data.objects.new(nm, None)
        if e.name not in cat.objects:
            cat.objects.link(e)
        e.empty_display_type = disp
        e.empty_display_size = tam
        e.parent = ob
        e.matrix_parent_inverse = Matrix.Identity(4)
        e.location = pos
        e["fx"] = tipo_fx
        e["descricao"] = desc
    nb = "FX_Brasas_%s" % nome
    pb = bpy.data.objects.get(nb) or bpy.data.objects.new(nb, mb)
    pb.data = mb
    if pb.name not in cat.objects:
        cat.objects.link(pb)
    pb.parent = ob
    pb.matrix_parent_inverse = Matrix.Identity(4)
    pb.location = (0, 0, 0)
    pb["fx"] = "brasas"
    pb["descricao"] = "Placa emissiva das brasas (anime emissiveIntensity para tremular)"
    print("FX %s: fogo %s | fumaca %s | altura %.2f" % (nome, [round(v, 3) for v in me["fx_fogo"]], [round(v, 3) for v in me["fx_fumaca"]], H))


def fx_chopeira(nome, ob):
    """Acha as bicas das torneiras (saliencias da frente, -Y, na faixa de altura das torneiras) e cria
    FX_Torneira_N como filhos do asset: ponto de onde o chopp sai (cai para baixo, -Z / -Y no glTF)."""
    me = ob.data
    co = coords(me)
    H = float(co[:, 2].max())
    reg = co[(co[:, 2] > 0.35 * H) & (co[:, 2] < 0.70 * H)]
    if len(reg) < 20:
        return
    sal = reg[reg[:, 1] < np.percentile(reg[:, 1], 8) + 0.005]
    bicas = []
    for sel in (sal[sal[:, 0] < 0], sal[sal[:, 0] >= 0]):
        if len(sel) >= 5:
            p = sel[sel[:, 2].argmin()]
            bicas.append([float(sel[:, 0].mean()), float(p[1]), float(p[2])])
    if not bicas:
        return
    me["fx_torneiras"] = bicas
    cat = bpy.data.collections[CAT]
    for k, pos in enumerate(bicas, 1):
        nm = "FX_Torneira_%d_%s" % (k, nome)
        e = bpy.data.objects.get(nm) or bpy.data.objects.new(nm, None)
        if e.name not in cat.objects:
            cat.objects.link(e)
        e.empty_display_type = 'SPHERE'
        e.empty_display_size = 0.02
        e.parent = ob
        e.matrix_parent_inverse = Matrix.Identity(4)
        e.location = pos
        e["fx"] = "torneira"
        e["descricao"] = "Bica da torneira %d: o chopp sai daqui e cai na vertical (copo embaixo)" % k
    print("FX %s: torneiras %s" % (nome, [[round(v, 3) for v in b] for b in bicas]))


src_col = bpy.data.collections.get(SRC)
assert src_col, "colecao %s nao encontrada" % SRC
ref = next((o for o in src_col.all_objects if o.get("referencia_escala")), None) or \
    next((o for o in src_col.all_objects if o.name.lower() == "rafael"), None)
FATOR = 1.0
if ref is not None:
    bb = [ref.matrix_world @ Vector(v) for v in ref.bound_box]
    h_ref = max(v.z for v in bb) - min(v.z for v in bb)
    FATOR = h_ref / ALTURA_HUMANA
    ref["referencia_escala"] = True
    print("personagem de referencia: %s (%.3f m) -> fator %.3f" % (ref.name, h_ref, FATOR))
fontes = [o.name for o in src_col.all_objects if o.type == 'MESH' and o is not ref
          and not o.get("otimizado") and not o.get("fx") and not o.name.startswith(("OTM_", "ASSET_", "FX_"))]
# fileira das versoes otimizadas ao lado dos originais
rel = []
SO = globals().get("SO_ASSETS")                  # opcional: processar so estes nomes (os outros ficam como estao)
for k, n in enumerate(sorted(fontes)):
    if SO and n not in SO:
        continue
    rel.append(processar(bpy.data.objects[n]))
    if any(k in n.lower() for k in ("carrinho", "churrasqueira", "espeto")):
        fx_churrasqueira(slug(n), bpy.data.objects["OTM_" + slug(n)])
    if any(k in n.lower() for k in ("chopeira", "chopp", "chope")):
        fx_chopeira(slug(n), bpy.data.objects["OTM_" + slug(n)])
for k, n in enumerate(sorted(fontes)):           # fileira organizada ao lado dos originais (ordem alfabetica)
    ob = bpy.data.objects.get("OTM_" + slug(n))
    if ob is not None:
        ob.location = (1.5 + k * 1.3, 0.0, 0.0)
# catalogo antigo (oculto) substituido pelo asset do usuario
velho = bpy.data.collections.get("Assets_Otimizados")
if velho is not None:
    for o in list(velho.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(velho)
for r in rel:
    print(r)
