# 20b_scooter_pontos.py - a scooter de entrega (export\moto\moto_delivery.glb, feita pelo 20) para o jogo de hoje.
# O 20 nao roda mais (a fonte do Sketchfab saiu de Downloads e ele usa a API do Blender 4.0), e a moto de entrega do
# jogo passou a ser a v4. Este script NAO usa Blender: le o GLB pronto, acrescenta os pontos que o jogo pede hoje
# (setas, freio, placa, luz da placa, bau, garupa, camera, contato com o chao), medidos na malha, e grava
# export\moto_scooter\moto_scooter.glb (+ colisao). Rodar: python -I 20b_scooter_pontos.py
import json, os, shutil, struct

ORIGEM = r"C:\Users\rafael\BarBoteco\export\moto"
SAIDA = r"C:\Users\rafael\BarBoteco\export\moto_scooter"
# glTF (metros, +X esquerda do piloto, +Y cima, +Z frente); chassi e raiz tem transformacao identidade
PONTOS = {
    "chassi": {
        "ponto_bau": (-0.017, 1.246, -0.785),            # tampa do bau (= ponto_entrega)
        "ponto_garupa": (0.0, 0.79, -0.50),
        "ponto_lanterna": (-0.02, 0.58, -0.99),          # a lente da lanterna (o 20 pos no fundo do bau)
        "ponto_freio": (-0.02, 0.58, -0.99),             # = lanterna: a lanterna tambem e o freio
        "ponto_seta_frente_E": (0.12, 0.93, 0.595),      # lentes brancas do escudo
        "ponto_seta_frente_D": (-0.12, 0.93, 0.595),
        "ponto_seta_tras_E": (0.075, 0.58, -0.99),       # pontas da lanterna (a scooter nao tem seta atras)
        "ponto_seta_tras_D": (-0.115, 0.58, -0.99),
        "ponto_luz_placa": (-0.016, 0.50, -1.03),
        "ponto_placa": (-0.016, 0.40, -1.03),            # no paralama traseiro, sob a lanterna
        "ponto_camera": (0.0, 1.6, -0.35),
    },
    "raiz": {"ponto_contato_diant": (0.0, 0.0, 0.671), "ponto_contato_tras": (0.0, 0.0, -0.671)},
}


def ler(caminho):
    b = open(caminho, "rb").read()
    assert b[:4] == b"glTF", caminho
    n = struct.unpack_from("<I", b, 12)[0]
    assert b[16:20] == b"JSON"
    return json.loads(b[20:20 + n]), b[20 + n:]


def gravar(caminho, j, resto):
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    corpo = struct.pack("<I4s", len(js), b"JSON") + js + resto
    open(caminho, "wb").write(struct.pack("<4sII", b"glTF", 2, 12 + len(corpo)) + corpo)


j, resto = ler(os.path.join(ORIGEM, "moto_delivery.glb"))
indice = {n["name"]: i for i, n in enumerate(j["nodes"])}
for pai, pontos in PONTOS.items():
    p = j["nodes"][indice[pai]]
    assert not any(k in p for k in ("rotation", "scale", "matrix")) and not any(p.get("translation", [0, 0, 0])), pai
    for nome, pos in pontos.items():
        if nome in indice:                               # ponto que ja existia: so muda o lugar
            j["nodes"][indice[nome]]["translation"] = list(pos)
            continue
        indice[nome] = len(j["nodes"])
        j["nodes"].append({"name": nome, "translation": list(pos)})
        p.setdefault("children", []).append(indice[nome])
os.makedirs(SAIDA, exist_ok=True)
gravar(os.path.join(SAIDA, "moto_scooter.glb"), j, resto)
shutil.copyfile(os.path.join(ORIGEM, "moto_delivery_colisao.glb"), os.path.join(SAIDA, "moto_scooter_colisao.glb"))
j2, _ = ler(os.path.join(SAIDA, "moto_scooter.glb"))
faltam = [n for ps in PONTOS.values() for n in ps if n not in {x["name"] for x in j2["nodes"]}]
assert not faltam, faltam
print("moto_scooter.glb", os.path.getsize(os.path.join(SAIDA, "moto_scooter.glb")) // 1024, "KB,", len(j2["nodes"]), "nos")
