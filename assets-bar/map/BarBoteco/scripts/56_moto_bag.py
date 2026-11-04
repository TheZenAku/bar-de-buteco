# 56_moto_bag.py
# Bag de entrega Highland Bar Delivery: modelo SEPARADO da moto (a moto sai sem ela). Caixa termica de tecido, quinas
# arredondadas, tampa com ziper que abre, alca, tiras com fivela, faixas refletivas, logo dos dois lados e atras.
# Origem = centro da base, ja inclinada 13 graus (acompanha o banco da moto); o jogo a coloca em `ponto_bau` da moto.
# Rig: Bag_Rig > bag_raiz > bag_tampa (dobradica atras; -X abre). Saidas em export\moto_v3: moto_bag.glb, moto_bag.png,
# moto_bag.js. Rodar: blender.exe -b --factory-startup -P 56_moto_bag.py -- --exportar
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix

SCRIPTS = "C:/Users/rafael/BarBoteco/scripts"
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if "--exportar" in ARGS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
_SO = globals().get("SO_FUNCOES")
SO_FUNCOES = True
exec(compile(open(SCRIPTS + "/54_moto_tripo.py", encoding="utf-8").read(), "54_moto_tripo.py", "exec"), globals())
SO_FUNCOES = _SO
import carro_textura as ct

SAIDA = r"C:\Users\rafael\BarBoteco\export\moto_v3"
BLEND_COPIA = r"C:\Users\rafael\Desktop\BAR\2.0\veiculos\moto\moto_bag.blend"
LOGO = r"C:\Users\rafael\Desktop\BAR\2.0\logo\Emblema Neon Highland Bar Delivery.png"
COLS = ["Bag_Delivery"]
SC = bpy.context.scene
PECAS = ["tecido", "tampa", "interior", "friso", "tira", "fivela", "ziper", "refletivo", "alca"]
PID = {n: i for i, n in enumerate(PECAS)}
LX, LY, HC, HT = 0.420, 0.440, 0.300, 0.085          # largura, profundidade, altura do corpo e da tampa
INCL = math.radians(13.0)


def inflar(bm, verts, b=0.010):
    """barriga de tecido: cada face estufa um pouco para fora (parabola) em relacao as bordas"""
    for v in verts:
        c = v.co
        u = (c.x / (LX / 2), (c.y / (LY / 2)))
        zr = c.z
        # distancias normalizadas em cada eixo
        ax_ = abs(c.x) / (LX / 2)
        ay_ = abs(c.y) / (LY / 2)
        if ax_ > 0.97 and ay_ < 0.97:
            c.x += math.copysign(b * (1 - ay_ ** 2), c.x)
        if ay_ > 0.97 and ax_ < 0.97:
            c.y += math.copysign(b * (1 - ax_ ** 2), c.y)


def corpo():
    p = P()
    bm = p.bm
    cy = 0.0
    vs = p.caixa((0, cy, HC / 2), (LX, LY, HC), "tecido", chanfro=0.040, seg=3)
    inflar(bm, bm.verts)
    bm.normal_update()
    topo = [f for f in bm.faces if f.normal.z > 0.99]
    if topo:
        zt = max(f.calc_center_median().z for f in topo)
        topo = [f for f in topo if abs(f.calc_center_median().z - zt) < 1e-4]
        bmesh.ops.inset_individual(bm, faces=topo, thickness=0.028)
        r = bmesh.ops.extrude_discrete_faces(bm, faces=topo)
        bmesh.ops.translate(bm, vec=(0, 0, -0.245), verts=list({v for f in r["faces"] for v in f.verts}))
        for f in r["faces"]:
            f[p.lay] = PID["interior"]
            for e in f.edges:
                for lf in e.link_faces:
                    if lf not in r["faces"]:
                        lf[p.lay] = PID["friso"]
    # friso (vivo) preto na boca e na base
    parte("Corpo", "bag_raiz", p)
    # tiras com fivela na frente, faixas refletivas e alca lateral
    t = P()
    for xs in (-0.115, 0.115):
        t.caixa((xs, -LY / 2 - 0.004, HC * 0.52), (0.034, 0.010, HC * 0.92), "tira", chanfro=0.003)
        t.caixa((xs, -LY / 2 - 0.010, HC * 0.28), (0.050, 0.014, 0.036), "fivela", chanfro=0.004, seg=2)
    for zs in (0.075, 0.225):
        t.caixa((0, LY / 2 + 0.006, zs), (LX * 0.70, 0.004, 0.020), "refletivo")
        for sx in (-1, 1):
            t.caixa((sx * (LX / 2 + 0.005), 0, zs), (0.004, LY * 0.55, 0.020), "refletivo")
    for sx in (-1, 1):
        t.tubo([V((sx * (LX / 2 + 0.002), -0.060, HC * 0.80)), V((sx * (LX / 2 + 0.040), -0.040, HC * 0.80)),
                V((sx * (LX / 2 + 0.040), 0.040, HC * 0.80)), V((sx * (LX / 2 + 0.002), 0.060, HC * 0.80))],
               0.016, "alca", 8, up=(0, 0, 1), suavizar=2, tampa=True)
    parte("Detalhes", "bag_raiz", t)
    # tampa
    l = P()
    l.caixa((0, 0, HC + HT / 2), (LX, LY, HT), "tampa", chanfro=0.036, seg=3)
    inflar(l.bm, l.bm.verts, 0.008)
    # ziper: friso em volta da tampa (no encontro com o corpo)
    l.caixa((0, 0, HC + 0.004), (LX * 1.002, LY * 1.002, 0.008), "ziper", chanfro=0.003)
    # alca de pegar no topo
    l.tubo([V((-0.075, 0.0, HC + HT - 0.004)), V((-0.060, 0.0, HC + HT + 0.040)), V((0.060, 0.0, HC + HT + 0.040)),
            V((0.075, 0.0, HC + HT - 0.004))], 0.020, "alca", 8, up=(0, 1, 0), suavizar=2, tampa=True)
    parte("Tampa", "bag_tampa", l)


def parte(nome, osso, p):
    ob = p.objeto("Bag_" + nome, COL, True)
    OBJS[nome] = ob
    OSSO_DE[nome] = osso
    SAIDA_DE[nome] = "Moto_Bag"
    return ob


def inclinar_e_uv():
    """inclina tudo 13 graus em torno da origem (a base no banco) e calcula a UV de caixa: lados com logo"""
    R = Matrix.Rotation(INCL, 4, 'X')
    for k, ob in OBJS.items():
        me = ob.data
        uvl = me.uv_layers.new(name="UVMap")
        for pl in me.polygons:
            n = pl.normal
            for li in pl.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                corpo_ = k == "Corpo" and 0.0 <= pl.center.z <= HC + 1e-3
                if corpo_ and n.x > 0.8:
                    uv = (0.5 * (co.y + LY / 2) / LY, 0.5 + 0.5 * co.z / HC)
                elif corpo_ and n.x < -0.8:
                    uv = (1.0 - 0.5 * (co.y + LY / 2) / LY, 0.5 + 0.5 * co.z / HC)
                elif corpo_ and n.y > 0.8:
                    uv = (0.5 * (LX / 2 - co.x) / LX, 0.5 * co.z / HC)
                else:
                    uv = (0.52 + 0.46 * (co.x + 0.3) / 0.6, 0.02 + 0.46 * (co.y + 0.3) / 0.6)
                uvl.data[li].uv = (min(max(uv[0], 0.0), 1.0), min(max(uv[1], 0.0), 1.0))
        me.transform(R)
        me.update()


def textura_bag(px=1024):
    q = px // 2
    yy, xx = np.mgrid[0:px, 0:px].astype(np.float32)
    # tecido: trama de nylon (xadrez fino) em vermelho
    trama = 0.5 + 0.5 * np.sin(xx * 1.9) * np.sin(yy * 1.9)
    base = np.ones((px, px, 3), np.float32) * ct.cor(0.72, 0.045, 0.040)
    base *= (0.90 + 0.12 * trama + 0.05 * ct.ruido(np.stack([xx / 40.0, yy / 40.0, xx * 0], -1), 1.0))[..., None]
    # vinco/costura: borda de cada quadrante mais escura (vivo)
    for c0, r0 in ((0, 0), (q, 0), (0, q)):
        b = 10
        base[r0:r0 + b, c0:c0 + q] *= 0.55
        base[r0 + q - b:r0 + q, c0:c0 + q] *= 0.55
        base[r0:r0 + q, c0:c0 + b] *= 0.55
        base[r0:r0 + q, c0 + q - b:c0 + q] *= 0.55
    import moto_textura as mt
    logo = mt._ler_logo(LOGO)
    for c0, r0, lw, lh in ((0, 0, int(q * 0.27 / LY), int(q * 0.27 / HC)), (q, 0, int(q * 0.27 / LY), int(q * 0.27 / HC)),
                           (0, q, int(q * 0.22 / LX), int(q * 0.22 / HC))):
        lw, lh = int(lw), int(lh)
        im = mt._redimensionar(logo, lw, lh)
        x0, y0 = c0 + (q - lw) // 2, r0 + (q - lh) // 2
        a = im[..., 3:4]
        base[y0:y0 + lh, x0:x0 + lw] = base[y0:y0 + lh, x0:x0 + lw] * (1 - a) + im[..., :3] * a
    return np.clip(base, 0, 1)


def montar_bag():
    global COL
    limpar()
    COL = colecao("Bag_Delivery")
    corpo()
    suavizar(OBJS.values())
    inclinar_e_uv()
    img = os.path.join(SAIDA, "moto_bag.png")
    os.makedirs(SAIDA, exist_ok=True)
    salvar_png(textura_bag()[::-1], img, "moto_bag_tmp")
    tex = carregar_img(img, "moto_bag")
    ossos = [("bag_raiz", V((0, 0, 0)), V((0, 0, 0.12)), None, True),
             ("bag_tampa", V((0, LY / 2, HC)), V((0, LY / 2, HC + 0.08)), "bag_raiz", True)]
    # a dobradica fica atras e o conjunto inclinado
    R = Matrix.Rotation(INCL, 4, 'X')
    ossos = [(n, R @ a, R @ b, pa, d) for n, a, b, pa, d in ossos]
    rig = criar_rig(COL, ossos)
    rig.name = "Bag_Rig"
    for chave, ob in OBJS.items():
        pele(ob, OSSO_DE[chave], rig)
    saida = juntar(list(OBJS.values()), "Moto_Bag", COL)
    me = saida.data
    me.materials.clear()
    me.materials.append(material_textura("Moto_Bag", tex, None, 0.62))
    for mod in saida.modifiers:
        if mod.type == 'ARMATURE':
            mod.object = rig
    saida.parent = rig
    return rig, saida


def material_luz(nome):
    return None


if not globals().get("SO_FUNCOES"):
    RIG, BAG = montar_bag()
    tri = sum(len(p.vertices) - 2 for p in BAG.data.polygons)
    print("bag triangulos:", tri)
    if "--exportar" in ARGS or globals().get("EXPORTAR"):
        exportar([RIG, BAG], os.path.join(SAIDA, "moto_bag.glb"))
        os.makedirs(os.path.dirname(BLEND_COPIA), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=BLEND_COPIA, copy=True)
        print("copia", BLEND_COPIA)
