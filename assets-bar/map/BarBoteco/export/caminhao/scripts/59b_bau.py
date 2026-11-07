# 59b_bau.py - bau de aluminio: casca oca aberta atras, chapa ondulada, porta de enrolar, lanternas, interior, carga

BAU_XM = BAU_X - 0.03                  # parede externa do miolo (a chapa ondulada soma 3 cm)
BAU_Z_TETO_INT = BAU_Z1 - 0.06         # teto interno
PORTA_BAU = dict(x=1.015, z0=BAU_PISO - 0.015, z1=BAU_Z_TETO_INT + 0.01, y=BAU_Y1 - 0.045)   # porta de enrolar


def casca_bau(col, tmp):
    ext = objeto(caixa(((0), (BAU_Y0 + BAU_Y1) / 2, (BAU_Z0 + BAU_Z1) / 2), (2 * BAU_XM, BAU_Y1 - BAU_Y0, BAU_Z1 - BAU_Z0),
                       r=0.035, seg=2), "Cam_Bau_ext", tmp)
    etiquetar(ext, "bau_chapa")
    inn = objeto(caixa((0, (BAU_Y0 + 0.055 + BAU_Y1 + 0.5) / 2, (BAU_PISO + BAU_Z_TETO_INT) / 2),
                       (2 * (BAU_XM - BAU_PAR), BAU_Y1 + 0.5 - BAU_Y0 - 0.055, BAU_Z_TETO_INT - BAU_PISO), r=0.02, seg=1),
                 "Cam_Bau_int", tmp)
    etiquetar(inn, "bau_forro")
    aplicar_booleana(ext, inn)
    bpy.data.objects.remove(inn, do_unlink=True)
    ext.name = "Cam_Bau"
    return ext


def chapas_bau(col):
    """chapa ondulada lateral (E e D) e frontal"""
    obs = []
    for lado, s in (("E", 1), ("D", -1)):
        bm = ondulado_x(BAU_Z0 + 0.14, BAU_Z1 - 0.12, BAU_XM, BAU_X, BAU_Y0 + 0.07, BAU_Y1 - 0.06, lado=s)
        obs.append(objeto(bm, "Cam_BauChapa_" + lado, col, "bau_chapa"))
    # frente do bau: lisa com vincos verticais (3 reforcos)
    vincos = [caixa((x, BAU_Y0 - 0.008, (BAU_Z0 + BAU_Z1) / 2 + 0.05), (0.07, 0.02, BAU_Z1 - BAU_Z0 - 0.35), r=0.008)
              for x in (-0.7, -0.35, 0.0, 0.35, 0.7)]
    obs.append(objeto(unir_bm(vincos), "Cam_BauFrente", col, "bau_chapa"))
    return obs


def molduras_bau(col):
    """quinas de aluminio, perfil do teto e batentes da porta; a quina traseira tem 10 cm (abriga as lanternas)"""
    bms = []
    zc = (BAU_Z0 + BAU_Z1) / 2
    h = BAU_Z1 - BAU_Z0
    for s in (1, -1):
        bms.append(caixa((s * (BAU_X - 0.045), BAU_Y1 - 0.04, zc), (0.11, 0.09, h), r=0.012))           # quina traseira
        bms.append(caixa((s * (BAU_X - 0.04), BAU_Y0 + 0.04, zc), (0.08, 0.08, h), r=0.012))            # quina dianteira
        bms.append(caixa((s * (BAU_X - 0.015), (BAU_Y0 + BAU_Y1) / 2, BAU_Z1 - 0.05), (0.04, BAU_Y1 - BAU_Y0 + 0.03, 0.09),
                         r=0.012))                                                                      # calha do teto
        bms.append(caixa((s * (BAU_X - 0.015), (BAU_Y0 + BAU_Y1) / 2, BAU_Z0 + 0.045), (0.04, BAU_Y1 - BAU_Y0 - 0.02, 0.09),
                         r=0.012))                                                                      # saia
    bms.append(caixa((0, BAU_Y1 - 0.015, BAU_Z1 - 0.06), (2 * BAU_XM + 0.02, 0.06, 0.10), r=0.012))     # trave superior
    bms.append(caixa((0, BAU_Y1 - 0.02, BAU_Z0 + 0.075), (2 * BAU_XM + 0.02, 0.07, 0.15), r=0.012))     # soleira
    # trilhos laterais da porta de enrolar
    for s in (1, -1):
        bms.append(caixa((s * (BAU_XM - BAU_PAR - 0.005), BAU_Y1 - 0.055, (BAU_PISO + BAU_Z_TETO_INT) / 2),
                         (0.04, 0.05, BAU_Z_TETO_INT - BAU_PISO), r=0.006))
    return objeto(unir_bm(bms), "Cam_BauMolduras", col, "bau_moldura")


def teto_bau(col):
    """duas nervuras longitudinais e uma tampa de ventilacao no teto"""
    bms = [caixa((x, (BAU_Y0 + BAU_Y1) / 2, BAU_Z1 + 0.008), (0.06, BAU_Y1 - BAU_Y0 - 0.15, 0.018), r=0.006) for x in (-0.55, 0.55)]
    return objeto(unir_bm(bms), "Cam_BauTeto", col, "bau_teto")


def porta_de_enrolar(col):
    P = PORTA_BAU
    bm = ondulado_y(P["y"], BAU_Y1, P["z0"], P["z1"], P["y"], BAU_Y1 - 0.006, -P["x"], P["x"], passo=0.10)
    ob = objeto(bm, "Cam_PortaBau", col, "bau_porta")
    # puxador e travessa de baixo
    puxa = unir_bm([caixa((0, BAU_Y1 + 0.012, P["z0"] + 0.30), (0.34, 0.03, 0.05), r=0.01),
                    caixa((0, BAU_Y1 - 0.02, P["z0"] + 0.035), (2 * P["x"], 0.05, 0.07), r=0.01)])
    ob2 = objeto(puxa, "Cam_PortaBau_puxador", col, "cromo")
    return [ob, ob2]


def lanternas_traseiras(col):
    """lanterna (freio), seta e re empilhadas na quina traseira de cada lado; retorna objetos por luz"""
    L, S_, R = {"E": [], "D": []}, {"E": [], "D": []}, {"E": [], "D": []}
    y = BAU_Y1 + 0.0
    for lado, s in (("E", 1), ("D", -1)):
        x = s * (BAU_X - 0.048)
        L[lado].append(caixa((x, y, 1.20), (0.075, 0.035, 0.28), r=0.008))
        S_[lado].append(caixa((x, y, 1.42), (0.075, 0.035, 0.12), r=0.008))
        R[lado].append(caixa((x, y, 1.57), (0.075, 0.035, 0.12), r=0.008))
    obs = {}
    obs["Luz_Lanterna"] = objeto(unir_bm(L["E"] + L["D"]), "Cam_Luz_Lanterna", col, "lanterna_E")
    obs["Luz_Seta_E_t"] = objeto(unir_bm(S_["E"]), "Cam_Luz_Seta_E_t", col, "seta_E")
    obs["Luz_Seta_D_t"] = objeto(unir_bm(S_["D"]), "Cam_Luz_Seta_D_t", col, "seta_D")
    obs["Luz_Re"] = objeto(unir_bm(R["E"] + R["D"]), "Cam_Luz_Re", col, "re_E")
    return obs


def refletores(col):
    """refletores vermelhos pequenos na saia do bau e na quina traseira"""
    bms = []
    for s in (1, -1):
        for y in (-0.45, 0.45, 1.35, 2.2):
            bms.append(caixa((s * (BAU_X + 0.002), y, BAU_Z0 + 0.20), (0.012, 0.22, 0.04), r=0.004, seg=1))
        for y in (BAU_Y0 + 0.02, BAU_Y1 - 0.04):
            pass
    return objeto(unir_bm(bms), "Cam_Refletores", col, "refletor")


def interior_bau(col):
    """pilares, trilhos de amarracao, luminaria; o piso e as paredes ja vem da casca"""
    obs = {}
    xi = BAU_XM - BAU_PAR                               # face interna da parede
    ys = [BAU_Y0 + 0.18 + k * 0.82 for k in range(4)]
    bms = []
    for s in (1, -1):
        for y in ys:
            bms.append(caixa((s * (xi - 0.014), y, (BAU_PISO + BAU_Z_TETO_INT) / 2), (0.028, 0.07, BAU_Z_TETO_INT - BAU_PISO), r=0.004, seg=1))
        for z in (1.45, 2.00):                          # trilhos de amarracao
            bms.append(caixa((s * (xi - 0.006), (BAU_Y0 + BAU_Y1) / 2 + 0.1, z), (0.012, BAU_Y1 - BAU_Y0 - 0.45, 0.04), r=0.003, seg=1))
    obs["BauPilares"] = objeto(unir_bm(bms), "Cam_BauPilares", col, "trilho")
    # luminarias do teto
    luz = [caixa((0, y, BAU_Z_TETO_INT - 0.01), (0.12, 0.40, 0.02), r=0.006, seg=1) for y in (0.1, 1.6)]
    obs["Luz_Bau"] = objeto(unir_bm(luz), "Cam_Luz_Bau", col, "luz_bau")
    return obs


def engradado(c, s, r=0.012):
    return caixa(c, s, r=r, seg=1)


def carga(col):
    """tres niveis de carga (osso carga_1..3): caixas de papelao e engradados; o jogo liga por ocupacao do inventario"""
    z0 = BAU_PISO
    niveis = {1: [], 2: [], 3: []}
    # nivel 1: fileira baixa junto a parede da frente
    y = BAU_Y0 + 0.40
    for i, x in enumerate((-0.78, -0.26, 0.26, 0.78)):
        niveis[1].append(engradado((x, y, z0 + 0.20), (0.46, 0.52, 0.40)))
    niveis[1].append(engradado((-0.52, y + 0.55, z0 + 0.14), (0.50, 0.50, 0.28)))
    niveis[1].append(engradado((0.52, y + 0.55, z0 + 0.14), (0.50, 0.50, 0.28)))
    # nivel 2: segunda camada sobre o nivel 1 e fileira do meio
    for x in (-0.52, 0.0, 0.52):
        niveis[2].append(engradado((x, y, z0 + 0.50), (0.46, 0.50, 0.40)))
    niveis[2].append(engradado((-0.60, y + 1.25, z0 + 0.22), (0.58, 0.60, 0.44)))
    niveis[2].append(engradado((0.0, y + 1.25, z0 + 0.22), (0.58, 0.60, 0.44)))
    niveis[2].append(engradado((0.60, y + 1.25, z0 + 0.22), (0.58, 0.60, 0.44)))
    # nivel 3: pilha alta e barris no fundo
    niveis[3].append(engradado((-0.60, y + 1.25, z0 + 0.66), (0.54, 0.56, 0.40)))
    niveis[3].append(engradado((0.0, y + 1.25, z0 + 0.66), (0.54, 0.56, 0.40)))
    niveis[3].append(engradado((0.60, y + 1.25, z0 + 0.66), (0.54, 0.56, 0.40)))
    for x in (-0.55, 0.55):
        niveis[3].append(cilindro((x, y + 2.35, z0), (x, y + 2.35, z0 + 0.80), 0.27, n=14))
    obs = {}
    for k, bms in niveis.items():
        obs["carga_%d" % k] = objeto(unir_bm(bms), "Cam_Carga_%d" % k, col, "carga")
    return obs
