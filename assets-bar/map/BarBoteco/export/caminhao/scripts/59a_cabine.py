# 59a_cabine.py - cabine, portas, vidros, luzes, retrovisores, para-choque, interior da cabine (exec dentro do 59_caminhao.py)

# perfil lateral da cabine (y, z): frente reta, para-brisa inclinado, teto plano, fundo reto
PERFIL_CAB = [(CAB_Y0, CAB_Z0), (CAB_Y0, 1.20), (-2.47, 1.29), (-2.08, 1.52), (-1.55, CAB_Z1), (CAB_Y1, CAB_Z1), (CAB_Y1, CAB_Z0)]
WS_A, WS_B = Vector((-2.08, 1.52)), Vector((-1.55, CAB_Z1))                 # base e topo do para-brisa
WS_T = (WS_B - WS_A).normalized()
WS_ANG = math.atan2(WS_T.y, WS_T.x)                                           # inclinacao (rad)
DOOR_Y0, DOOR_Y1, DOOR_Z0, DOOR_Z1 = -2.02, -1.14, 1.04, 2.17                # janela da porta (caixa)
JANELA = [(-1.96, 1.47), (-1.24, 1.47), (-1.24, 2.07), (-1.60, 2.07)]        # vidro da porta (y, z)


def inset(pts, d):
    """desloca um poligono convexo para dentro por d (intersecao das arestas deslocadas)"""
    P = [Vector(p) for p in pts]
    n = len(P)
    area = sum(P[i].x * P[(i + 1) % n].y - P[(i + 1) % n].x * P[i].y for i in range(n))
    s = 1 if area > 0 else -1
    linhas = []
    for i in range(n):
        a, b = P[i], P[(i + 1) % n]
        t = (b - a).normalized()
        nrm = Vector((-t.y, t.x)) * s
        linhas.append((a + nrm * d, t))
    out = []
    for i in range(n):
        (p0, t0), (p1, t1) = linhas[i - 1], linhas[i]
        den = t0.x * t1.y - t0.y * t1.x
        if abs(den) < 1e-9:
            out.append(p1)
            continue
        k = ((p1.x - p0.x) * t1.y - (p1.y - p0.y) * t1.x) / den
        out.append(p0 + t0 * k)
    return [(p.x, p.y) for p in out]


def caixa_inclinada(centro, tam, ang_x):
    bm = caixa((0, 0, 0), tam)
    girar_bm(bm, math.degrees(ang_x), 'X')
    return deslocar(bm, centro)


def corte_parabrisa(folga=0.0, espessura=0.40):
    """caixa inclinada na mesma linha do para-brisa (recorte do vidro)"""
    m = (WS_A + WS_B) / 2
    L = (WS_B - WS_A).length
    # eixo local Z -> tangente do para-brisa: rotacao em X de (ang - 90 graus)
    return caixa_inclinada((0, m.x, m.y), (1.88 - 2 * folga, espessura, L - 0.18 - 2 * folga), WS_ANG - math.pi / 2)


def casca_cabine(col, tmp):
    """cabine = (solido externo - solido interno) com recortes; devolve (corpo, portaE, portaD)"""
    ext = objeto(prisma_x(PERFIL_CAB, -CAB_X, CAB_X, r=0.15, seg=6), "Cam_Cab_ext", tmp)
    pi = inset(PERFIL_CAB, PAREDE)
    pi = [(y, max(z, CAB_PISO) if z < CAB_PISO + 0.01 else z) for y, z in pi]
    pi = [(y, CAB_PISO if z < 1.2 and abs(z - CAB_PISO) < 0.4 and y > CAB_Y0 + 0.5 else z) for y, z in pi]
    inn = objeto(prisma_x(pi, -(CAB_X - PAREDE), CAB_X - PAREDE, r=0.09, seg=2), "Cam_Cab_int", tmp)
    etiquetar(ext, "pintura")
    etiquetar(inn, "forro_cab")
    aplicar_booleana(ext, inn)                  # ext vira a casca (faces do interior herdam 'forro_cab' do cortador)
    bpy.data.objects.remove(inn, do_unlink=True)
    casca = ext
    casca.name = "Cam_Casca"
    # portas: parte da casca dentro da caixa da porta (menos a folga)
    portas = {}
    for lado, s in (("E", 1), ("D", -1)):
        me = casca.data.copy()
        p = bpy.data.objects.new("Cam_Porta_" + lado, me)
        tmp.objects.link(p)
        cx = s * (CAB_X - 0.09)
        caixa_p = caixa((cx, (DOOR_Y0 + DOOR_Y1) / 2, (DOOR_Z0 + DOOR_Z1) / 2),
                        (0.50, DOOR_Y1 - DOOR_Y0 - 2 * FOLGA, DOOR_Z1 - DOOR_Z0 - 2 * FOLGA))
        cortar(p, [caixa_p], tmp, 'INTERSECT')
        # janela da porta (recorte atravessando a chapa)
        jan = prisma_x(JANELA, s * 0.70 if s > 0 else -1.30, s * 1.30 if s > 0 else -0.70, r=0.025, seg=2)
        cortar(p, [jan], tmp)
        portas[lado] = p
    cortes = []
    for s in (1, -1):
        cx = s * (CAB_X - 0.09)
        cortes.append(caixa((cx, (DOOR_Y0 + DOOR_Y1) / 2, (DOOR_Z0 + DOOR_Z1) / 2),
                            (0.50, DOOR_Y1 - DOOR_Y0 + 2 * FOLGA, DOOR_Z1 - DOOR_Z0 + 2 * FOLGA)))
        # caixa de roda
        cortes.append(cilindro((s * 0.45, YF, ZC), (s * 1.30, YF, ZC), 0.53, n=30))
    cortes.append(corte_parabrisa())
    # nichos de farol e grade (frente)
    for s in (1, -1):
        cortes.append(caixa((s * 0.74, CAB_Y0 - 0.015, 1.03), (0.42, 0.09, 0.25), r=0.02))
    cortes.append(caixa((0, CAB_Y0 - 0.015, 1.0), (0.90, 0.09, 0.27), r=0.02))
    cortar(casca, cortes, tmp)
    return casca, portas


def flares_cabine(col):
    """aba arredondada em volta das caixas de roda da cabine, como na referencia (E e D)"""
    obs = []
    for lado, s in (("E", 1), ("D", -1)):
        perfil = [(0.535, 0.93), (0.535, 1.07), (0.60, 1.075), (0.625, 1.05), (0.625, 0.95), (0.60, 0.92)]
        perfil = [(r, x) for r, x in perfil]
        bm = girar([(r, s * x) for r, x in perfil] + [(perfil[0][0], s * perfil[0][1])], (0, YF, ZC), (1, 0, 0), 48)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().z < ZC + 0.12], context='FACES')
        obs.append(objeto(bm, "Cam_Flare_" + lado, col, "porta_pintura"))
    return obs


def vidros_cabine(col):
    """para-brisa e vidros das portas (lamina fina de duas faces)"""
    m = (WS_A + WS_B) / 2
    L = (WS_B - WS_A).length
    desl = Vector((0, 0.0, 0.0))
    ws = caixa_inclinada((0, m.x + 0.012, m.y - 0.020), (1.84, 0.012, L - 0.15), WS_ANG - math.pi / 2)
    obs = [objeto(ws, "Cam_Vidro_Parabrisa", col, "vidro_pintura")]
    for lado, s in (("E", 1), ("D", -1)):
        pts = inset(JANELA, 0.012)
        x0, x1 = (0.925, 0.937) if s > 0 else (-0.937, -0.925)
        obs.append(objeto(prisma_x(pts, x0, x1), "Cam_Vidro_Porta_" + lado, col, "vidro_pintura"))
    return obs


def retrovisor(s, col):
    """retrovisor retangular de caminhao no braco duplo (osso da porta)"""
    y, z = DOOR_Y0 + 0.02, 1.70
    x0 = s * (CAB_X + 0.01)
    bms = []
    for dz in (-0.17, 0.17):                           # bracos
        bms.append(cilindro((x0, y + 0.01, z + dz), (s * 1.30, y + 0.01, z + dz), 0.014, n=8))
    carc = caixa((s * 1.33, y, z), (0.11, 0.22, 0.42), r=0.035, seg=4)
    bms.append(carc)
    ob = objeto(unir_bm(bms), "Cam_Retrovisor_" + ("E" if s > 0 else "D"), col, "plastico")
    # face espelhada (virada para tras)
    face = caixa((s * 1.33, y + 0.113, z), (0.09, 0.006, 0.38))
    fo = objeto(face, "Cam_RetroEspelho_" + ("E" if s > 0 else "D"), col, "espelho")
    return ob, fo


def macaneta(s, col):
    y = DOOR_Y1 - 0.14
    x = s * (CAB_X + 0.005)
    bm = caixa((x, y, 1.50), (0.045, 0.16, 0.035), r=0.012)
    return objeto(bm, "Cam_Macaneta_" + ("E" if s > 0 else "D"), col, "cromo")


def parachoque_frente(col):
    """para-choque de plastico preto com degrau, recorte da placa e luz de neblina"""
    perfil = [(-2.67, 0.42), (-2.67, 0.80), (-2.60, 0.89), (-2.52, 0.89), (-2.52, 0.56), (-2.60, 0.42)]
    bm = prisma_x(perfil, -1.05, 1.05, r=0.05, seg=4)
    ob = objeto(bm, "Cam_Parachoque", col, "parachoque")
    cortar(ob, [caixa((0, -2.675, 0.60), (0.44, 0.04, 0.15)), caixa((0.66, -2.67, 0.62), (0.22, 0.04, 0.07)), caixa((-0.66, -2.67, 0.62), (0.22, 0.04, 0.07))], bpy.data.collections["Cam_TMP"])
    return ob


def luzes_frente(col):
    """lentes dos farois + setas (nos nichos da frente) e grade com travessas"""
    obs = {}
    far, seta = [], []
    for s in (1, -1):
        far.append(caixa((s * 0.675, CAB_Y0 + 0.0115, 1.03), (0.25, 0.035, 0.21), r=0.012, seg=3))
        seta.append(caixa((s * 0.885, CAB_Y0 + 0.0115, 1.03), (0.10, 0.035, 0.21), r=0.012, seg=3))
    obs["Luz_Farol"] = objeto(unir_bm(far), "Cam_Luz_Farol", col, "farol_E")
    obs["Luz_Seta_E"] = objeto(unir_bm([seta[0]]), "Cam_Luz_Seta_E_f", col, "seta_E")
    obs["Luz_Seta_D"] = objeto(unir_bm([seta[1]]), "Cam_Luz_Seta_D_f", col, "seta_D")
    barras = []
    for i in range(5):
        barras.append(caixa((0, CAB_Y0 + 0.0, 0.91 + i * 0.045), (0.86, 0.03, 0.02), r=0.004))
    barras.append(caixa((0, CAB_Y0 + 0.0215, 1.0), (0.88, 0.016, 0.25)))
    obs["Grade"] = objeto(unir_bm(barras), "Cam_Grade", col, "grade")
    return obs


def interior_cabine(col):
    obs = {}
    cp = CAB_PISO
    # ---- painel de instrumentos
    painel = [(-2.44, cp), (-2.44, 1.17), (-2.33, 1.25), (-2.14, 1.23), (-2.04, 1.16), (-2.07, 1.08), (-2.16, cp + 0.10), (-2.16, cp)]
    bm = prisma_x(painel, -(CAB_X - PAREDE - 0.01), CAB_X - PAREDE - 0.01, r=0.045, seg=4)
    capelo = caixa((0.50, -2.12, 1.27), (0.46, 0.22, 0.09), r=0.04, seg=4)       # quadro de instrumentos (frente do motorista)
    bms = [bm, capelo]
    for xv in (-0.55, 0.0, 0.55):                                          # saidas de ar
        bms.append(cilindro((xv, -2.28, 1.27), (xv, -2.23, 1.21), 0.05, n=12))
    obs["Painel"] = objeto(unir_bm(bms), "Cam_Painel", col, "painel")
    # ---- console central
    console = [(-2.05, cp), (-2.05, 1.02), (-1.65, 1.05), (-1.40, 1.0), (-1.40, cp)]
    bm = prisma_x(console, -0.17, 0.17, r=0.03, seg=4)
    alav = cilindro((0, -1.86, 1.05), (0, -1.80, 1.36), 0.012, n=8)
    punho = caixa((0, -1.795, 1.40), (0.05, 0.05, 0.08), r=0.02, seg=3)
    freio = caixa((0.0, -1.55, 1.05), (0.05, 0.22, 0.05), r=0.015)
    obs["Console"] = objeto(unir_bm([bm, alav, punho, freio]), "Cam_Console", col, "plastico")
    # ---- bancos (motorista a esquerda = +X)
    for nome, xc in (("Banco_E", 0.50), ("Banco_D", -0.50)):
        yc = -1.50
        base = caixa((xc, yc, cp + 0.09), (0.50, 0.46, 0.18), r=0.02)
        almof = caixa((xc, yc, cp + 0.25), (0.52, 0.50, 0.14), r=0.05, seg=4)
        enc = caixa((xc, yc + 0.27, cp + 0.56), (0.52, 0.12, 0.60), r=0.05, seg=4)
        girar_bm(enc, -10, 'X', (xc, yc + 0.27, cp + 0.30))
        apoio = caixa((xc, yc + 0.32, cp + 0.93), (0.30, 0.09, 0.20), r=0.04, seg=4)
        girar_bm(apoio, -10, 'X', (xc, yc + 0.27, cp + 0.30))
        obs[nome] = objeto(unir_bm([base, almof, enc, apoio]), "Cam_" + nome, col, "banco")
    # ---- pedais
    ped = [caixa((0.40 + i * 0.11, -2.23, cp + 0.10), (0.07, 0.03, 0.10), r=0.008) for i in range(3)]
    ped.append(caixa((0.28, -2.22, cp + 0.04), (0.14, 0.12, 0.05), r=0.01))
    obs["Pedais"] = objeto(unir_bm(ped), "Cam_Pedais", col, "borracha")
    # ---- quebra-sois
    qs = []
    for s in (1, -1):
        qs.append(caixa((s * 0.50, -1.50, 2.12), (0.44, 0.03, 0.18), r=0.012))
    qs.append(caixa((0.0, -1.62, 2.06), (0.20, 0.03, 0.07), r=0.01))
    obs["Quebra_Sol"] = objeto(unir_bm(qs), "Cam_Quebra_Sol", col, "teto_cab")
    obs["Tapete"] = objeto(caixa((0, -1.80, cp + 0.004), (1.74, 1.20, 0.008)), "Cam_Tapete", col, "tapete")
    obs["Luz_Teto"] = objeto(caixa((0, -1.40, CAB_Z1 - PAREDE - 0.008), (0.20, 0.10, 0.016), r=0.004),
                             "Cam_Luz_Teto", col, "luz_bau")
    return obs


# volante (pivo no centro; eixo = coluna de direcao, inclinada)
VOLANTE = dict(centro=Vector((0.50, -1.78, 1.30)), incl=36.0, raio=0.205)


def volante(col):
    C = VOLANTE["centro"]
    R = VOLANTE["raio"]
    inc = math.radians(VOLANTE["incl"])
    eixo = Vector((0, math.cos(inc), math.sin(inc)))              # da coluna para o motorista
    base = girar([(R - 0.014, -0.014), (R + 0.014, -0.014), (R + 0.014, 0.014), (R - 0.014, 0.014), (R - 0.014, -0.014)],
                 (0, 0, 0), (0, 0, 1), 20)
    # aro (secao quadrada arredondada revolvida em Z) -> orientar para o eixo da coluna
    bm = base
    bmesh.ops.rotate(bm, verts=bm.verts[:], cent=(0, 0, 0), matrix=Matrix.Rotation(-(math.pi / 2 - inc), 3, 'X'))
    bms = [bm]
    # raios e cubo
    u = Vector((1, 0, 0))
    v = eixo.cross(u).normalized()
    for ang in (90, 210, 330):
        d = u * math.cos(math.radians(ang)) + v * math.sin(math.radians(ang))
        bms.append(cilindro(Vector((0, 0, 0)), d * (R - 0.01), 0.013, n=8))
    bms.append(cilindro(-eixo * 0.03, eixo * 0.03, 0.055, n=14))
    bm = unir_bm(bms)
    bmesh.ops.translate(bm, vec=C, verts=bm.verts[:])
    return objeto(bm, "Cam_Volante", col, "volante")


def coluna_direcao(col):
    C = VOLANTE["centro"]
    inc = math.radians(VOLANTE["incl"])
    eixo = Vector((0, math.cos(inc), math.sin(inc)))
    p0 = C - eixo * 0.30
    return objeto(unir_bm([cilindro(p0, C - eixo * 0.03, 0.04, n=12), caixa((C.x, p0.y - 0.02, p0.z - 0.03), (0.16, 0.14, 0.14), r=0.03)]),
                  "Cam_Coluna", col, "plastico")


def itens_porta(s, col):
    """apoio de braco, maçaneta interna e manivela na parte de dentro da porta"""
    xi = s * (CAB_X - PAREDE - 0.012)
    bms = [caixa((xi - s * 0.02, -1.80, 1.30), (0.05, 0.60, 0.07), r=0.02),
           caixa((xi - s * 0.012, -1.48, 1.40), (0.025, 0.12, 0.03), r=0.01)]
    ob = objeto(unir_bm(bms), "Cam_ItensPorta_" + ("E" if s > 0 else "D"), col, "forro_porta")
    return ob


def palhetas(col):
    """palhetas de para-brisa: pivo na base do vidro; osso com eixo na normal do vidro"""
    n = Vector((0, -WS_T.y, WS_T.x))                         # normal do para-brisa, para fora (frente/cima)
    obs = {}
    for lado, s in (("E", 1), ("D", -1)):
        piv3 = Vector((0, WS_A.x, WS_A.y)) + Vector((0, WS_T.x, WS_T.y)) * 0.09 + n * -0.008
        piv = Vector((s * 0.66, piv3.y, piv3.z))
        # lamina de 0,56 m deitada sobre o vidro, do pivo para o centro do para-brisa
        bm = caixa((-s * 0.28, 0, 0), (0.56, 0.022, 0.012), r=0.003, seg=1)
        girar_bm(bm, math.degrees(WS_ANG), 'X')
        deslocar(bm, piv)
        bm2 = cilindro(piv - n * 0.0, piv + n * 0.03, 0.012, n=8)               # eixo do braco
        ob = objeto(unir_bm([bm, bm2]), "Cam_Palheta_" + lado, col, "palheta")
        ob["pivo"] = tuple(piv)
        obs["limpador_" + lado] = ob
    return obs
