# Origem dos recursos e condições de uso — B.A.R. Avatares V2

Este levantamento registra o que foi verificado e o que **não pôde ser verificado**. Ele não substitui uma avaliação jurídica. Itens marcados **NÃO VERIFICADO** não devem ser tratados como liberados para distribuição comercial.

## 1. Malha, morphs e dados de rig do corpo: Antonia Polygon — **verificado (CC-BY 3.0)**

| | |
| --- | --- |
| Origem | Personagem "Antonia Polygon" do add-on CharMorph (`CharMorph/data/characters/antonia/`), instalado localmente |
| Autores | Olaf Delgado-Friedrichs, com contribuições de phantom3D, MikeJ, DieTrying (morphs), Fenrissa e outros |
| Licença | **Creative Commons Attribution 3.0 Unported**. Fonte: `antonia/license.txt` ("This work is licensed under the Creative Commons Attribution 3.0 Unported License") e `antonia/config.yaml` (`license: CC-BY 3.0`) |
| Usado | malha `char.blend` (importada pelo CharMorph); morphs do personagem (corpos masculino e feminino); `joints/rigify.npz` (posições de juntas); `weights/rigify.npz` (pesos de deformação); hierarquia do `metarig.blend` |
| Derivados nesta entrega | `bodies/*.glb` (corpo decimado, morphs faciais, pesos transferidos); toda peça construída a partir da superfície do corpo (cascas de roupa, cabelo, barba) |
| Condição | **Atribuição obrigatória** em qualquer redistribuição ou obra derivada, sem sugerir endosso, informando os termos da licença. Texto sugerido para os créditos do jogo: *"Corpo base derivado de Antonia Polygon por Olaf Delgado-Friedrichs e colaboradores (phantom3D, MikeJ, DieTrying, Fenrissa e outros), licenciado sob CC BY 3.0 — https://sites.google.com/site/antoniapolygon/ — modificado (decimado, remodelado e reequipado) para B.A.R."* |
| Observação | Os arquivos `joints/` e `weights/rigify.npz` fazem parte da pasta do personagem no CharMorph. O `license.txt` do CharMorph diz que "Each character has its own license". A aplicação da CC-BY 3.0 a esses dados é **inferida** dessa regra; recomenda-se confirmar com o mantenedor do CharMorph. |

## 2. CharMorph (add-on) — ferramenta, código GPL-3

O código Python do CharMorph é GPL-3 (Michael Vigovsky; `CharMorph/license.txt`). Ele foi usado só como ferramenta no Blender, para importar Antonia e aplicar morphs. **Nenhum código do CharMorph é distribuído** nos GLBs. Os scripts do pipeline (`BAR_Avatar_V2/scripts`) leem os arquivos de dados do personagem diretamente.

## 3. Bases rejeitadas — **não usadas**

* **Personagens MB-Lab** (incluídos no CharMorph): AGPL-3. Segundo o `license.txt` do CharMorph, a AGPL se propaga para os modelos gerados. Não foram usados.
* **Reom e Vitruvian**: licença não verificável no ambiente. Não foram usados.

## 4. Animações — **NÃO VERIFICADO**

Os bancos `animations/humanoid_v2_*.glb` foram **retargetados** a partir de FBX que já existem no repositório do jogo (`assets-bar/anim`). O repositório não documenta a licença desses arquivos. O retarget não muda a situação de licença: os bancos herdam a condição das fontes.

| Clipe(s) V2 | Arquivo-fonte | Indício de origem | Licença |
| --- | --- | --- | --- |
| Idle, OldCaneHold (base) | `misc/Unarmed Idle 01.fbx` | esqueleto `mixamorig` (provável Adobe Mixamo) | **NÃO VERIFICADO** |
| Walk | `misc/Standard Walk.fbx` | `mixamorig` | **NÃO VERIFICADO** |
| Run | `misc/Run.fbx` | `mixamorig` | **NÃO VERIFICADO** |
| Sit | `misc/Seated Idle.fbx` | `mixamorig` | **NÃO VERIFICADO** |
| Dance | `misc/Samba Dancing.fbx` | `mixamorig` | **NÃO VERIFICADO** |
| Wave | `misc/Waving Gesture.fbx` | `mixamorig` | **NÃO VERIFICADO** |
| Use | `misc/Button Pushing.fbx` | `mixamorig` | **NÃO VERIFICADO** |
| DrunkIdle | `misc/Drunk Idle Variation.fbx` | `mixamorig` | **NÃO VERIFICADO** |
| DrunkWalk | `misc/Drunk Walk.fbx` | `mixamorig` | **NÃO VERIFICADO** |
| Fallen | `misc/Standing Death Backward 01.fbx` | `mixamorig` | **NÃO VERIFICADO** |
| Recover | `misc/Standing Up.fbx` | `mixamorig` | **NÃO VERIFICADO** |
| Wait | `misc/Standing Idle 03.fbx` | `mixamorig` | **NÃO VERIFICADO** |
| Drink | `bebendo.fbx` | rig com nomes do Nathan (skin do jogo) | **NÃO VERIFICADO**, origem desconhecida |
| CardsSit | `carta-sentado.fbx` | idem | **NÃO VERIFICADO**, origem desconhecida |
| AngrySit | `sit-angry.fbx` | idem | **NÃO VERIFICADO**, origem desconhecida |
| OldCaneWalk, OldCaneHold (braço) | `A_Male_Walk_OldCane_walkstyle.fbx` | esqueleto do UE4 Mannequin (prefixo `A_`) | **NÃO VERIFICADO**, origem desconhecida |

* Os termos do Mixamo não puderam ser consultados nesta sessão: a página de FAQ da Adobe respondeu HTTP 403. Nenhuma conclusão foi tirada sobre eles.
* O responsável pelo projeto deve confirmar a origem e os termos de cada FBX, em especial os de origem desconhecida, **antes de qualquer distribuição comercial**. Se não forem confirmados, os clipes devem ser substituídos por animações de licença conhecida. O pipeline (`s12_retarget.py`) aceita outros FBX.
* As cópias desses FBX em `BAR_Avatar_V2/reference/anim_src` servem só de fonte de trabalho e não fazem parte do export.

## 5. Roupas, cabelos, barbas, calçados, acessórios e texturas — **originais desta produção**

* Toda a geometria das peças foi **gerada pelos scripts do pipeline** (`s09`, `s10`, `s16`, `s16b`, `s17`, `s18`, `s19`) a partir da superfície do corpo Antonia ou de perfis paramétricos. As cascas derivadas da superfície do corpo são obras derivadas de Antonia e carregam a mesma atribuição (seção 1).
* Todas as texturas (`textures/*.png` e as embutidas) foram **pintadas proceduralmente** pelos scripts `s07`, `s11` e `s21`: ruído, faixas e estampa geradas por código. Nenhuma imagem de terceiros foi usada.
* A licença de distribuição desses itens cabe ao responsável pelo projeto. Respeite a atribuição CC-BY da base.

## 6. Ferramentas (não incorporadas aos assets)

* Blender 4.0.2 (GPL): os arquivos produzidos não ficam sujeitos à GPL.
* Exportador glTF do Blender (Khronos glTF Blender I/O v4.0.44).
* PlayCanvas Engine 2.23.3 (MIT): o código-fonte foi consultado só para documentar o contrato de carregamento.

## 7. Resumo

| Item | Estado |
| --- | --- |
| Corpo base (Antonia) | Verificado: CC-BY 3.0, atribuição obrigatória |
| Dados de juntas e pesos do CharMorph para Antonia | CC-BY 3.0 **inferida** pela regra por personagem do CharMorph |
| Peças e texturas geradas | Originais (derivadas de Antonia onde construídas sobre o corpo) |
| Animações (todas) | **NÃO VERIFICADO**: confirmar antes de uso comercial |
| MB-Lab, Reom, Vitruvian | Não usados |
