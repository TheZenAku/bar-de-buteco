# Texturas do bar (paredes e escada) + otimizacao de memoria das texturas que o bar usa.
# Roda FORA do Blender, com o Python do sistema:
#   python -I scripts\43_texturas_bar.py
# 1) bar_reboco.jpg / bar_reboco_n.jpg: reboco pintado com relevo. A cor da Poliigon 7664 (PlasterPainted) e lisa
#    (o detalhe dela esta so no normal), entao o pol_reboco.jpg saia cinza chapado e as paredes pareciam sem textura.
#    Aqui: normal da 7664 repetido 4x4 (tile de 1,2 m, foto de 0,3 m) + manchas suaves da 8690 (ConcreteWorn)
#    + o relevo "assado" na cor. Neutro e claro: a cor de cada parede vem do fator do material (44_bar_paredes_escada).
# 2) Reduz texturas quase lisas (medido: PSNR > 40 dB no tamanho novo) e o letreiro (2048 px para uma placa de 2 m).
#    Original guardado em texturas\_orig_1024\ (so na 1a vez). Cada 1024 px que vira 256 economiza ~5 MB de GPU no jogo.
#    O 37_texturas_poliigon.py respeita os mesmos tamanhos (TAM) se rodar de novo.
import os, shutil, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, "texturas")
ORIG = os.path.join(TEX, "_orig_1024")
POL = os.path.join(os.path.expanduser("~"), "Downloads", "poliigon")
Q = 88

# tamanho final (lado maior) das texturas que podem diminuir sem perda visivel
TAM = {
    "pol_plastico.jpg": 256, "pol_plastico_preto.jpg": 256, "pol_metal_preto.jpg": 256, "pol_inox.jpg": 256,
    "pol_feltro.jpg": 256, "pol_metal_ondulado_n.jpg": 256, "pol_reboco.jpg": 128,
    "pol_metal_ondulado.jpg": 512, "pol_madeira_escura.jpg": 512, "telha.jpg": 512, "telha_n.jpg": 512,
    "letreiro_highland.jpg": 1024,
}


def abrir(rel):
    return Image.open(os.path.join(POL, rel))


def lum(img):
    return np.asarray(img.convert("L"), np.float32) / 255


def repetir(img, k):
    w, h = img.size
    out = Image.new(img.mode, (w * k, h * k))
    for i in range(k):
        for j in range(k):
            out.paste(img, (i * w, j * h))
    return out


# ------------------------------------------------------------------ 1) reboco do bar (1024 px = 1,2 m)
N = 1024
nrm_src = abrir(r"Poliigon_PlasterPainted_7664\1K\Poliigon_PlasterPainted_7664_Normal.png").convert("RGB")
ao_src = abrir(r"Poliigon_PlasterPainted_7664\1K\Poliigon_PlasterPainted_7664_AmbientOcclusion.jpg")
manchas_src = abrir(r"Poliigon_ConcreteWorn_8690\1K\Poliigon_ConcreteWorn_8690_BaseColor.jpg")

nrm = np.asarray(repetir(nrm_src, 4).resize((N, N), Image.LANCZOS), np.float32) / 255 * 2 - 1
nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
ao = lum(repetir(ao_src, 4).resize((N, N), Image.LANCZOS))
m = lum(manchas_src.resize((N, N), Image.LANCZOS))
m = np.clip((m - m.mean()) / (m.std() + 1e-6), -2.5, 2.5)

relevo = nrm[..., 0] * 0.55 + nrm[..., 1] * 0.83          # luz rasante de cima/lado: o grao do reboco aparece na cor
relevo = relevo / (np.abs(relevo).max() + 1e-6)
base = 0.87                                                # mesma media do pol_reboco antigo: as cores das paredes nao mudam
v = base * (1 + 0.045 * m + 0.06 * relevo) * (0.85 + 0.15 * ao)
v *= base / v.mean()
cor = np.clip(np.stack([v * 1.0, v * 0.995, v * 0.985], -1), 0, 1)
Image.fromarray((cor * 255).astype(np.uint8)).save(os.path.join(TEX, "bar_reboco.jpg"), quality=Q, optimize=True)
Image.fromarray(((nrm * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)).save(os.path.join(TEX, "bar_reboco_n.jpg"),
                                                                               quality=92, optimize=True)
print("bar_reboco.jpg / bar_reboco_n.jpg %d px (tile 1,2 m), media %.3f, desvio %.3f" % (N, v.mean(), v.std()))

# ------------------------------------------------------------------ 2) reduz o que e quase liso
os.makedirs(ORIG, exist_ok=True)
for nome, lado in TAM.items():
    p = os.path.join(TEX, nome)
    if not os.path.exists(p):
        print("  falta", nome)
        continue
    bak = os.path.join(ORIG, nome)
    if not os.path.exists(bak):
        shutil.copy2(p, bak)
    img = Image.open(bak)                                  # sempre a partir do original (rodar 2x nao degrada)
    w, h = img.size
    if max(w, h) <= lado:
        continue
    k = lado / max(w, h)
    img.convert("RGB").resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS).save(p, quality=Q, optimize=True)
    print("  %-26s %4dx%-4d -> %4dx%-4d  %4d KB" % (nome, w, h, round(w * k), round(h * k), os.path.getsize(p) // 1024))
print("ok")
