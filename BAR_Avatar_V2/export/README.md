# B.A.R. — Avatares V2 (biblioteca modular)

Biblioteca de avatares modulares para **B.A.R. — Bar de Buteco** (PlayCanvas 2.23.3): dois corpos adultos, rig canônico `BAR_HUMANOID_V2`, 31 itens de catálogo, presets faciais por morph targets e 18 clipes de animação por corpo, com manifests e relatórios de validação.

* **Integração (para o Codex):** [INTEGRATION_CODEX.md](INTEGRATION_CODEX.md)
* **Origem e licenças:** [LICENSES.md](LICENSES.md). As animações estão como **não verificadas**.
* **Manifests:** `manifests/avatar-catalog.json`, `rig-contract.json`, `animation-catalog.json`, `compatibility.json`
* **Relatórios:** `validation/export-report.json` (arquivos, hashes, orçamento), `validation/validation-report.json` (validador independente), `validation/animation-report-blender.json`

## Conteúdo

| Categoria | Itens | Por corpo |
| --- | --- | --- |
| Corpos | `male` (1,78 m), `female` (1,67 m); 5.030 triângulos; 8 morph targets faciais; 4 presets + neutro; 3 estilos de sobrancelha | — |
| TOP | camiseta básica, **camiseta estampada** (variante de textura), camisa casual, regata, moletom, jaqueta | ambos |
| BOTTOM | calça jeans, **calça casual** (variante de textura), shorts, saia | saia só feminino |
| FOOTWEAR | tênis, sapato casual, bota, chinelo | ambos |
| HAIR | curto, raspado, repartido, médio, longo, preso (rabo de cavalo), coque, ondulado | ambos |
| FACIAL_HAIR | barba curta, barba cheia, cavanhaque, bigode | ambos |
| ACCESSORY | óculos, óculos escuros, boné, chapéu, pulseira (rígidos, em sockets) | ambos |
| Animações | Idle, Walk, Run, Sit/SeatedIdle, Drink, Dance, Wave, Use/Interact, DrunkIdle, DrunkWalk, Fallen/Faint, Recover, Wait, CardsSit, AngrySit, Pose, OldCaneWalk, OldCaneHold | banco por corpo |

O avatar completo tem entre 8,1 e 9,8 mil triângulos nas roupas validadas; o teto teórico é 11,2 mil (meta: 8–15 mil). São 8–10 draw calls por avatar. Os 63 GLBs somam 7,9 MB.

## Estado da validação

| Nível | Resultado |
| --- | --- |
| Aprovado no Blender | 61/61 entradas peça×corpo (avisos de *minor clipping* registrados no catálogo); 36/36 clipes pelos critérios explícitos (emenda de loop, in-place, pés, malha acima do chão) |
| Aprovado em reimportação glTF | 63 arquivos, **0 erros** (validador independente com `--factory-startup`); todas as peças num esqueleto único; animações ≤ 2,6 mm; acessórios ≤ 0,94 mm |
| Pendente no PlayCanvas | **tudo** (lista em INTEGRATION_CODEX.md §16) |
| Reprovado | nenhum item. As combinações *blocked* estão em `compatibility.json` e devem ser impedidas pelo editor. |

## Estrutura do projeto (`BAR_Avatar_V2/`)

```
source/BAR_Avatar_V2_master.blend         arquivo mestre editável (bodies, rigs, peças, ações <Clip>__<body>)
source/versions/                          00 probe, 01 protótipo Fase B validado, 02/03 antes das correções finais, 04 final
source/backup/                            cópia da sessão original aberta no início + export da Fase B
source/cache/                             formas, binding, regiões, presets, medições (gerados pelos scripts)
scripts/                                  pipeline completo (s01…s26), validadores e utilitários
reference/anim_src/                       cópias de trabalho das fontes FBX (não fazem parte do export)
renders/validation, renders/catalog       imagens de validação e catálogo; renders/_tmp/stale guarda renders antigos substituídos
export/                                   esta entrega
```

## Como regenerar

Dentro do Blender 4.0.2, com o master aberto: `scripts/run_all.py` (ordem documentada no arquivo). `s01_build_shapes.py` precisa do CharMorph com o objeto `cm_antonia`.

Validação independente:
```
blender -b --factory-startup --python scripts/validate_glb.py -- export export/validation/validation-report.json
```
Manifests:
```
blender -b source/BAR_Avatar_V2_master.blend --python scripts/s25_manifests.py
```

## Imagens de validação

* `renders/validation/reimport_<body>_[masked_|variant_masked_]<Clip>_<frame>.png`: GLBs reimportados e montados, com e sem a máscara de regiões e com as variantes de textura.
* `renders/validation/animation_contact_sheet_<body>.png`: 6 quadros de cada um dos 18 clipes, na ordem da tabela acima, de cima para baixo.
* `renders/validation/blender_*.png`: T-pose, Idle, caminhada lateral, sentado, braços levantados e pose de estresse.
* `renders/catalog/sheet_<categoria>_<body>.png`: cada peça no corpo, em Idle. As linhas seguem a ordem impressa por `s26_catalog_sheets.py`:
  * hair: short, buzzed, parted, medium, long, ponytail, bun, wavy;
  * facial: beard_short, beard_full, goatee, mustache;
  * tops: tee, shirt, tank, hoodie, jacket;
  * bottoms: jeans, shorts, skirt;
  * footwear: sneakers, shoes, boots, flipflops;
  * accessories: glasses, sunglasses, cap, hat, bracelet;
  * face_presets: na ordem de `facePresets`.
* `renders/catalog/outfit_0{1,2,3}_idle_{front,back}.png`: três combinações completas por corpo, com materiais de pré-visualização que emulam o tingimento do jogo.

## Limitações principais

Ver INTEGRATION_CODEX.md §18:
* clipping sentado;
* combinações bloqueadas;
* a saia exige uma blusa;
* bordas de região serrilhadas;
* pegada da dança;
* licenças das animações não verificadas;
* nenhum teste no PlayCanvas.
