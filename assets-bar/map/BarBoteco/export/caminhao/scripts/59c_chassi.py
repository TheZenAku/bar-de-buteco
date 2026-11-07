# 59c_chassi.py - chassi, eixos, molas, tanque, escape, para-choque traseiro, para-lamas, rodas

def chassi_geral(col):
    obs = {}
    bms = []
    for s in (1, -1):                                                   # longarinas
        bms.append(caixa((s * 0.42, 0.16, 0.68), (0.09, 5.00, 0.20), r=0.012, seg=2))
    for y in (-2.20, -1.30, -0.50, 0.40, 1.20, 2.00, 2.55):             # travessas
        bms.append(caixa((0, y, 0.66), (0.92, 0.09, 0.10), r=0.008, seg=1))
    for s in (1, -1):                                                   # calcos de madeira entre a longarina e o bau
        for y in (-0.55, 0.40, 1.35, 2.25):
            bms.append(caixa((s * 0.42, y, 0.87), (0.14, 0.34, 0.18), r=0.01, seg=1))
    bms.append(caixa((0, -1.80, 0.72), (0.72, 0.9, 0.40), r=0.05))        # motor/cambio sob a cabine
    obs["Chassi"] = objeto(unir_bm(bms), "Cam_Chassi", col, "chassi")
    # eixos
    eixos = [cilindro((-0.75, YF, ZC), (0.75, YF, ZC), 0.065, n=12),
             cilindro((-0.78, YT, ZC), (0.78, YT, ZC), 0.085, n=12),
             girar([(0, -0.16), (0.18, -0.12), (0.20, 0.0), (0.18, 0.12), (0, 0.16)], (0, YT, ZC), (0, 1, 0), 16)]
    eixos.append(cilindro((0, YF + 0.5 - 0.2, 0.62), (0, YT - 0.15, 0.60), 0.04, n=10))     # cardan
    for s in (1, -1):
        eixos.append(cilindro((s * 0.62, YF - 0.25, ZC + 0.24), (s * 0.62, YF - 0.25, 0.62), 0.028, n=8))   # amortecedor
        eixos.append(cilindro((s * 0.60, YT - 0.25, ZC + 0.24), (s * 0.60, YT - 0.25, 0.80), 0.028, n=8))
        eixos.append(cilindro((s * 0.55, YF + 0.20, ZC + 0.10), (s * 0.55, YF + 0.20, ZC + 0.10), 0.001, n=3)) if False else None
    eixos = [e for e in eixos if e is not None]
    obs["Eixos"] = objeto(unir_bm(eixos), "Cam_Eixos", col, "eixo")
    # molas (laminas)
    molas = []
    for s in (1, -1):
        for yc, x in ((YF, s * 0.56), (YT, s * 0.56)):
            for k in range(3):
                L = 1.25 - 0.18 * k
                bm = caixa((x, yc, ZC + 0.085 + 0.025 * k), (0.09, L, 0.022), r=0.004, seg=1)
                molas.append(bm)
    obs["Molas"] = objeto(unir_bm(molas), "Cam_Molas", col, "mola")
    # tanque de combustivel (lado esquerdo, entre a cabine e o eixo traseiro) e tampa
    tq = girar([(0, -0.55), (0.26, -0.55), (0.27, -0.50), (0.27, 0.50), (0.26, 0.55), (0, 0.55)], (0.80, -0.30, 0.70), (0, 1, 0), 36)
    cinta = [caixa((0.80, y, 0.70), (0.58, 0.06, 0.58), r=0.01, seg=1) for y in (-0.62, 0.02)]
    obs["Tanque"] = objeto(unir_bm([tq] + cinta), "Cam_Tanque", col, "tanque")
    obs["TampaTanque"] = objeto(cilindro((1.06, -0.72, 0.72), (1.10, -0.72, 0.72), 0.055, n=14), "Cam_TampaTanque", col, "cromo")
    # escape: tubo, silencioso e ponteira
    esc = [cilindro((-0.55, -1.00, 0.56), (-0.55, 0.90, 0.56), 0.05, n=10),
           girar([(0, -0.35), (0.14, -0.35), (0.15, -0.30), (0.15, 0.30), (0.14, 0.35), (0, 0.35)], (-0.55, 1.10, 0.56), (0, 1, 0), 24),
           cilindro((-0.55, 1.40, 0.56), (-0.55, 2.76, 0.56), 0.045, n=10)]
    obs["Escape"] = objeto(unir_bm(esc), "Cam_Escape", col, "escape")
    # estribos sob as portas
    est = [caixa((s * 1.06, -1.62, 0.62), (0.22, 0.95, 0.035), r=0.008, seg=2) for s in (1, -1)]
    est += [caixa((s * 1.00, -1.62, 0.60), (0.04, 0.9, 0.07), r=0.008, seg=2) for s in (1, -1)]
    obs["Estribos"] = objeto(unir_bm(est), "Cam_Estribos", col, "estribo")
    return obs


def parachoque_traseiro(col):
    bms = [caixa((0, 2.74, 0.64), (2.12, 0.12, 0.22), r=0.04, seg=4)]
    for s in (1, -1):
        bms.append(caixa((s * 0.60, 2.66, 0.80), (0.10, 0.10, 0.28), r=0.01, seg=2))   # suportes
        bms.append(caixa((s * 1.05, 2.74, 0.64), (0.10, 0.14, 0.24), r=0.03, seg=4))           # pontas
    return objeto(unir_bm(bms), "Cam_ParachoqueTras", col, "parachoque")


def paralamas_traseiros(col):
    """arco acima das rodas duplas + lama (abas de borracha)"""
    obs = {}
    for lado, s in (("E", 1), ("D", -1)):
        perfil = [(R_RODA + 0.06, s * 0.55), (R_RODA + 0.09, s * 0.55), (R_RODA + 0.09, s * 1.085), (R_RODA + 0.06, s * 1.085)]
        # casco aberto: revolve e mantem so a metade de cima
        bm = girar(perfil + [perfil[0]], (0, YT, ZC), (1, 0, 0), 24)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().z < ZC + 0.12], context='FACES')
        obs["Paralama_" + lado] = objeto(bm, "Cam_Paralama_" + lado, col, "plastico")
        aba = caixa((s * 0.96, YT + 0.58, 0.42), (0.50, 0.012, 0.50), r=0.004, seg=1)
        obs["Aba_" + lado] = objeto(aba, "Cam_Aba_" + lado, col, "borracha")
    return obs


def roda_dianteira(col, s):
    """pneu simples + roda de aco + tambor; centrada em (s*X_RD, YF, ZC), face de fora para +X (E) ou -X (D)"""
    return _roda([(X_RD, 1)], YF, s, col, "dianteira")


def roda_traseira(col, s):
    return _roda([(X_RT[0], 1), (X_RT[1], 1)], YT, s, col, "traseira")


def _pneu(xc):
    t = [(0.205, -0.112), (0.30, -0.118), (0.385, -0.11), (0.418, -0.092), (0.428, -0.07), (0.428, -0.045), (0.418, -0.040),
         (0.418, -0.012), (0.428, -0.006), (0.428, 0.006), (0.418, 0.012), (0.418, 0.040), (0.428, 0.045), (0.428, 0.07),
         (0.418, 0.092), (0.385, 0.11), (0.30, 0.118), (0.205, 0.112), (0.205, -0.112)]
    return t


def _roda(centros, yc, s, col, nome):
    pneus, rodas, cubos = [], [], []
    for xc, _ in centros:
        P = [(r * 1.023, xc + a) for r, a in _pneu(0)]
        pneus.append(girar(P, (0, yc, ZC), (1, 0, 0), 56))
        # aro de aco: prato com friso e saida das porcas
        R = [(0.0, xc + 0.085), (0.07, xc + 0.085), (0.085, xc + 0.115), (0.11, xc + 0.115), (0.125, xc + 0.085),
             (0.185, xc + 0.085), (0.205, xc + 0.10), (0.213, xc + 0.115), (0.213, xc - 0.10), (0.0, xc - 0.10)]
        rodas.append(girar(R, (0, yc, ZC), (1, 0, 0), 56))
        for k in range(10):                                                # porcas
            a = k * math.tau / 10
            c = Vector((xc + 0.115, yc + 0.10 * math.cos(a), ZC + 0.10 * math.sin(a)))
            cubos.append(cilindro(c, c + Vector((0.03, 0, 0)), 0.017, n=6))
        cubos.append(cilindro((xc + 0.115, yc, ZC), (xc + 0.14, yc, ZC), 0.065, n=16))
    # tambor de freio e cubo, atras da roda interna
    xi = min(c[0] for c in centros)
    cubos.append(cilindro((xi - 0.20, yc, ZC), (xi - 0.09, yc, ZC), 0.19, n=20))
    obs = {}
    if len(centros) > 1:
        cubos.append(cilindro((centros[0][0] - 0.10, yc, ZC), (centros[1][0] + 0.10, yc, ZC), 0.11, n=16))  # separador das duplas
    p = objeto(unir_bm(pneus), "Cam_Pneu_%s_%s" % (nome, "E"), col, "pneu")
    r = objeto(unir_bm(rodas), "Cam_Aro_%s_%s" % (nome, "E"), col, "roda")
    c = objeto(unir_bm(cubos), "Cam_Cubo_%s_%s" % (nome, "E"), col, "cubo")
    return [p, r, c]
