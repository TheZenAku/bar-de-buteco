# 68_limpar_export.py - Python do SISTEMA:  python -I 68_limpar_export.py [pasta_export]
# Pos-processa o export (08_export.py + 28_cidade_export.py): a propriedade de cena `cid_vis_usuario` (estado da viewport,
# ~77 KB, usada so por 29_cidade_visibilidade.py) vai parar nos extras da cena de TODO .gltf/.glb. Aqui ela e retirada,
# o JSON dos .gltf e compactado, e o JSON dos .glb e regravado (chunk alinhado a 4 bytes). Nao mexe em geometria/texturas.
import json, os, struct, sys

RAIZ = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\rafael\BarBoteco\export"
CHAVES = ("cid_vis_usuario",)
SKIP = {"anterior", "capturas"}

def limpa(j):
    n = 0
    for s in j.get("scenes", []):
        ex = s.get("extras")
        if isinstance(ex, dict):
            for k in CHAVES:
                if k in ex: del ex[k]; n += 1
            if not ex: del s["extras"]
    return n

def glb(path):
    b = open(path, "rb").read()
    if b[:4] != b"glTF": return 0
    ver, total = struct.unpack("<II", b[4:12])
    jl, jt = struct.unpack("<II", b[12:20]); j = json.loads(b[20:20 + jl])
    if not limpa(j): return 0
    novo = json.dumps(j, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    novo += b" " * ((4 - len(novo) % 4) % 4)
    resto = b[20 + jl:]
    out = b"glTF" + struct.pack("<II", ver, 12 + 8 + len(novo) + len(resto)) + struct.pack("<II", len(novo), jt) + novo + resto
    open(path, "wb").write(out)
    return len(b) - len(out)

def sem_geometria(path, j):
    """Setor inteiro dentro do bairro original (sem silhuetas e sem LOD sobreposto desde a v5.5) sai do exportador sem buffer
    e com nos sem malha. O importador do jogo exige UM buffer e le a malha de todo no _LOD2: tira os nos vazios (sem malha,
    sem filhos) e grava um buffer minimo de 4 bytes. Retorna 1 se mexeu."""
    if j.get("meshes"): return 0
    mexeu = 0
    vazios = [i for i, nd in enumerate(j.get("nodes", [])) if "mesh" not in nd and not nd.get("children")]
    if vazios:
        novo_idx = {}; nos = []
        for i, nd in enumerate(j["nodes"]):
            if i in vazios: continue
            novo_idx[i] = len(nos); nos.append(nd)
        for nd in nos:
            if "children" in nd: nd["children"] = [novo_idx[c] for c in nd["children"] if c in novo_idx]
        j["nodes"] = nos
        for s in j.get("scenes", []): s["nodes"] = [novo_idx[c] for c in s.get("nodes", []) if c in novo_idx]
        mexeu = 1                                         # "nodes" fica (vazia): o importador percorre a lista
    j.setdefault("nodes", [])
    if len(j.get("buffers", [])) != 1:
        nome = os.path.splitext(os.path.basename(path))[0] + ".bin"
        open(os.path.join(os.path.dirname(path), nome), "wb").write(b"\0\0\0\0")
        j["buffers"] = [{"byteLength": 4, "uri": nome}]
        mexeu = 1
    return mexeu

def gltf(path):
    t = open(path, encoding="utf-8").read(); j = json.loads(t)
    n = limpa(j) + sem_geometria(path, j)
    novo = json.dumps(j, separators=(",", ":"), ensure_ascii=False)
    if n == 0 and len(novo) >= len(t): return 0
    open(path, "w", encoding="utf-8").write(novo)
    return len(t.encode("utf-8")) - len(novo.encode("utf-8"))

ganho, arqs = 0, 0
def candidatos():
    for f in os.listdir(RAIZ):                                   # so o mapa: bar_boteco*.glb na raiz e tudo em cidade/
        if f.startswith("bar_boteco") and f.endswith(".glb"): yield os.path.join(RAIZ, f)
    for d, ds, fs in os.walk(os.path.join(RAIZ, "cidade")):
        ds[:] = [x for x in ds if not any(x.startswith(s) for s in SKIP)]
        for f in fs: yield os.path.join(d, f)
for p in candidatos():
    f = os.path.basename(p)
    if True:
        try:
            g = glb(p) if f.lower().endswith(".glb") else gltf(p) if f.lower().endswith(".gltf") else 0
        except Exception as e:
            print("ERRO", p, e); continue
        if g: ganho += g; arqs += 1
print("arquivos limpos:", arqs, " economia: %.1f MB" % (ganho / 1e6))
