# B.A.R. — Avatares V2: guia de integração para o Codex

Biblioteca modular de avatares para **PlayCanvas 2.23.3** (TypeScript + Vite, Colyseus). Este documento é o contrato de integração: nomes de arquivos, nós, ossos, materiais, regiões e regras vêm dos manifests gerados (`manifests/*.json`). Em caso de divergência, **os manifests valem**.

Estado: tudo foi validado no Blender e por reimportação glTF independente. **Nada foi testado no PlayCanvas** (seção 16). As APIs do PlayCanvas citadas foram conferidas no código-fonte do pacote `playcanvas@2.23.3`; o comportamento em execução continua pendente.

Todos os caminhos são relativos à raiz do export (a pasta que contém `manifests/`).

---

## 1. Descrição técnica da biblioteca

| Item | Valor |
| --- | --- |
| Base | CharMorph "Antonia Polygon" (CC-BY 3.0), decimada para low-poly. Masculino e feminino compartilham a **mesma topologia** (5.030 triângulos de corpo). |
| Rig | `BAR_HUMANOID_V2`, 53 juntas (`root` + 52 de deformação), T-pose, até 4 influências por vértice. |
| Corpos | `bodies/male.glb` (1,78 m) e `bodies/female.glb` (1,67 m): corpo, olhos, 3 estilos de sobrancelha, 8 morph targets faciais e 14 sockets. |
| Peças | 29 malhas por corpo (a saia só existe no feminino) e 2 variantes só de textura: 6 tops, 4 bottoms, 4 calçados, 8 cabelos, 4 barbas e 5 acessórios. |
| Animações | 1 banco por corpo (`animations/humanoid_v2_<body>.glb`) com 18 clipes a 30 fps; só rotações + translação do `hip`. |
| Materiais | PBR glTF opacos com **máscara de tingimento no alfa** da textura base (seção 8). |
| Ocultação | 28 regiões de corpo em `TEXCOORD_1`. Uma máscara 32×1 com *alpha test* esconde a pele coberta numa única draw call (seção 9). |
| Orçamento | Avatar completo: 8,1–9,8 mil triângulos nas roupas validadas; teto teórico de 11,2 mil (peça mais pesada em todos os slots); 8–10 draw calls. |

Princípio de montagem: **um esqueleto vivo por avatar** (o do GLB do corpo). As peças deformáveis trazem uma cópia idêntica das juntas, usada só para o *binding*. Depois de religar a malha ao esqueleto vivo (`render.rootBone`), essa cópia é descartada.

## 2. Estrutura dos assets

```
export/
  rigs/bar_humanoid_v2_{male,female}.glb      só armature + sockets (referência; não precisa ser carregado no jogo)
  bodies/{male,female}.glb                    armature + BAR_Body + BAR_Eyes + BAR_Brows_{regular,thin,thick} + sockets
  hair/hair_<estilo>_<body>.glb               8 estilos × 2 corpos (skinned)
  facial_hair/facial_<estilo>_<body>.glb      4 × 2 (skinned, com morph targets)
  tops/top_<id>_<body>.glb                    5 malhas × 2 (+ variante top_tee_print por textura)
  bottoms/bottom_<id>_<body>.glb              jeans, shorts × 2; skirt só female (+ variante bottom_pants por textura)
  footwear/footwear_<id>_<body>.glb           4 × 2 (skinned)
  accessories/accessory_<id>_<body>.glb       5 × 2 (rígidos, sem skin, no referencial do socket)
  animations/humanoid_v2_{male,female}.glb    18 clipes cada
  textures/*.png                              texturas externas compartilhadas + overrides de variantes + cópias-fonte
  manifests/avatar-catalog.json  rig-contract.json  animation-catalog.json  compatibility.json
  validation/export-report.json  validation-report.json  animation-report-blender.json  reference_poses.json  validate_glb.log
```

* São 63 GLBs (7,9 MB) e 11,3 MB no total, com 27 PNGs. Hashes SHA-256 e tamanhos estão em `validation/export-report.json`.
* **Texturas externas:** `hair_v2.png` e `eye_v2.png` são referenciadas com URI relativa `../textures/…` pelos GLBs de corpo, cabelo e barba. Mantenha a árvore de pastas ao publicar (por exemplo `public/avatars-v2/…`). As demais texturas vão embutidas no GLB da peça.
* **Variantes só de textura:** `top_tee_print` usa a malha `tops/top_tee_<body>.glb` com `textures/top_tee_print_<body>.png`; `bottom_pants` usa `bottoms/bottom_jeans_<body>.glb` com `textures/bottom_pants_<body>.png`. Ver `pieces[].bodies.<body>.textureOverride`.

## 3. Contrato do rig

Fonte: `manifests/rig-contract.json` (posições de repouso por corpo, TRS locais, sockets e regiões).

* **Nó da armature:** `BAR_HUMANOID_V2`, raiz da cena em **todos** os GLBs skinned, sem TRS. A junta raiz é `root`, na origem.
* **Hierarquia** (pai → filhos):
  `root → hip → spine_01 → spine_02 → spine_03 → {neck → head, shoulder_l, shoulder_r}`
  `shoulder_<s> → upperarm_<s> → lowerarm_<s> → hand_<s> → {thumb,index,middle,ring,pinky}_01_<s> → _02_<s> → _03_<s>`
  `hip → upperleg_<s> → lowerleg_<s> → foot_<s> → toe_<s>`, com `<s> ∈ {l, r}`.
* **Ordem das juntas na skin:** idêntica em todos os arquivos do mesmo corpo. Verificado em 26 arquivos skinned do masculino e 27 do feminino.
* **Bind:** as `inverseBindMatrices` são idênticas entre todos os arquivos do mesmo corpo (diferença máxima 0,0). **Masculino e feminino têm proporções e binds diferentes**, então peças, rigs e bancos são sempre do corpo correspondente.
* **Pose de repouso:** T-pose, com os braços ao longo de ±X e as palmas para baixo. Sem escala nos nós e sem constraints. Não há ossos exclusivos do Blender: o metarig de origem não é exportado.
* **Ossos que o jogo já usa** (`BarScene.SKIN_BONES`): `head, upperarm_l/r, lowerarm_l/r, hand_l/r, middle_01_l/r, upperleg_l/r, lowerleg_l/r, foot_l/r`. Todos existem com esses nomes, então `BONE_ALIASES` é desnecessário.
* **Sockets:** nós vazios filhos de ossos, com rotação de mundo identidade em repouso (verificado).

| Socket | Osso pai | Uso |
| --- | --- | --- |
| `socket_hand_l` / `socket_hand_r` | `hand_l` / `hand_r` | objetos segurados (bengala em `hand_r`) |
| `socket_palm_l` / `socket_palm_r` | `hand_l` / `hand_r` | centro da palma (copo, garrafa) |
| `socket_wrist_l` / `socket_wrist_r` | `lowerarm_l` / `lowerarm_r` | pulseira |
| `socket_head_top` | `head` | boné / chapéu |
| `socket_glasses` | `head` | óculos |
| `socket_mouth` | `head` | boca |
| `socket_eye_l` / `socket_eye_r` | `head` | olhos |
| `socket_hip` | `hip` | referência do quadril |
| `socket_foot_l` / `socket_foot_r` | `foot_l` / `foot_r` | referência dos pés |

## 4. Contrato das peças modulares

Fonte: `manifests/avatar-catalog.json` → `pieces[]`.

**Peça skinned** (`attachment: "skinned"`): cena `BAR_HUMANOID_V2` → { nó de malha cujo nome é o `id` da peça (por exemplo `top_tee`), `root`… (cópia das 53 juntas) }.
* A malha usa `JOINTS_0`/`WEIGHTS_0` (no máximo 4 influências, pesos normalizados, nenhum vértice sem peso; verificado por arquivo) e um único material.
* `extras`: `bar_body` e `bar_hides` (as regiões que a peça esconde, iguais a `hidesRegions`).
* As barbas (`facial_*`) trazem os 8 morph targets faciais com os mesmos nomes do corpo.
* Os calçados `footwear_sneakers` e `footwear_shoes` incluem uma **meia** na mesma malha, em cor fixa: ela fecha a região `foot` acima da abertura do sapato.

**Peça rígida** (`attachment: "socket"`): um único nó de malha `accessory_<id>` sem skin, com a origem no socket e o referencial do socket em repouso. `extras.bar_socket` repete o socket, mas use o campo `socket` do catálogo: o PlayCanvas não expõe `extras` nas entidades. Os óculos têm 2 primitivas: armação `CharacterClothing-…` e lente `CharacterLens-…` em BLEND.

Campos por peça no catálogo:
* `id`, `name`, `category` (TOP / BOTTOM / FOOTWEAR / HAIR / FACIAL_HAIR / ACCESSORY), `slot`, `attachment`, `socket`, `meshNode`, `rigId`, `boneContractVersion`.
* `hidesRegions`, `configurableMaterials`, `requiresCategory` (a saia exige TOP) e `variantOf`.
* `bodies.<body>`:
  * `path`, `triangles`, `primitives`, `morphTargets`;
  * `coversRegions` (fração de cada região coberta, medida por raios);
  * `dependencies` (o esqueleto vivo do corpo `bodies/<body>.glb#BAR_HUMANOID_V2` ou o socket; texturas externas);
  * `validation`: `state` mais `blender` / `gltfReimport` / `playcanvas`, com testes, avisos e erros.

## 5. Contrato das animações

Fonte: `manifests/animation-catalog.json`.

* **Bancos:** `animations/humanoid_v2_male.glb` e `animations/humanoid_v2_female.glb`. **Use o banco do corpo correspondente**: a calibração de rotações e a altura do quadril são por corpo.
* Cada `glTF animation` é um clipe com o nome exato do jogo. Os canais são `rotation` das 53 juntas e `translation` só do `hip`; não há canais de escala. Os comprimentos dos ossos ficam por conta de cada esqueleto.
* As chaves foram reduzidas com tolerância de 0,1° / 0,3 mm. O erro máximo medido após reimportação é ≤ 3 mm.
* Atribuição igual à de hoje em `BarScene.assignClips`: `anim.assignAnimation(track.name, track, undefined, 1, loop)`.

| Clipe | Duração (s) | Loop | Fonte | Movimento de raiz |
| --- | ---: | :---: | --- | --- |
| Idle | 5,10 | sim | Unarmed Idle 01.fbx | in-place (centrado) |
| Walk | 1,17 | sim | Standard Walk.fbx | in-place (deriva removida) |
| Run | 0,73 | sim | Run.fbx | in-place (deriva removida) |
| Sit (alias **SeatedIdle**) | 4,17 | sim | Seated Idle.fbx | in-place |
| Drink | 8,87 | não | bebendo.fbx | in-place |
| Dance | 19,80 | sim | Samba Dancing.fbx | in-place, mas oscila até 0,72 × 1,15 m em torno do centro |
| Wave | 1,47 | não | Waving Gesture.fbx | in-place |
| Use (alias **Interact**) | 2,00 | não | Button Pushing.fbx (0,45–2,45 s) | in-place |
| DrunkIdle | 3,97 | sim | Drunk Idle Variation.fbx | in-place |
| DrunkWalk | 3,00 | sim | Drunk Walk.fbx | in-place (oscila até 0,44 m) |
| Fallen (alias **Faint**) | 2,57 | não | Standing Death Backward 01.fbx | visual: 35 % do recuo da fonte (~0,5 m); termina deitado no chão |
| Recover | 5,00 | não | Standing Up.fbx (0–5 s) | visual relativo ao início |
| Wait | 4,00 | sim | Standing Idle 03.fbx (0–4 s) | in-place |
| CardsSit | 4,80 | sim | carta-sentado.fbx | in-place |
| AngrySit | 2,73 | sim | sit-angry.fbx | in-place |
| Pose | 0,03 | sim | quadro neutro (Idle, quadro 0) | estático |
| OldCaneWalk | 1,57 | sim | A_Male_Walk_OldCane_walkstyle.fbx | in-place |
| OldCaneHold | 5,10 | sim | Idle + braço direito da bengala | in-place |

* **One-shots:** `Drink`, `Fallen`, `Wave`, `Use` e `Recover`, como a lista `loop` atual do `BarScene`.
* **Fora do escopo** (exclusivos de skins completas): `Kick`, `Bartend`, `Shuffle` e os clipes de dealer.
* A posição autoritativa continua sendo a do servidor. Nenhum clipe aplica deslocamento de raiz na entidade.

## 6. Convenções de escala e orientação

* Unidade: 1 m. Eixo glTF +Y para cima. O personagem **olha para +Z** e o lado esquerdo dele fica em **+X**; os modelos legados e a câmera do `CharacterPreview` seguem a mesma convenção. Os pés ficam em y ≈ 0 (0,0004 / 0,0003 m).
* `PLAYER_MODEL_SCALE = 1` é compatível, sem escala adicional.
* Medidas de repouso (`avatar-catalog.json` → `bodies[].measurements`):

| | masculino | feminino |
| --- | ---: | ---: |
| altura | 1,779 m | 1,670 m |
| junta `hip` | 0,930 m | 0,862 m |
| `upperleg_l` | 0,990 m | 0,922 m |
| comprimento da perna | 0,901 m | 0,842 m |
| olhos | 1,663 m | 1,561 m |

* Os cálculos atuais de `makeSkin` (`sitDrop` a partir de `upperleg_l` e `oldCaneRate` a partir do comprimento da perna) continuam válidos, porque usam ossos com os mesmos nomes.

## 7. Regras de montagem do avatar

Algoritmo (pseudocódigo TypeScript conferido contra o código-fonte do PlayCanvas 2.23.3):

```ts
const BASE = `${import.meta.env.BASE_URL}avatars-v2/`;        // cópia de export/ (mantém a árvore)
const containers = new Map<string, Promise<pc.ContainerResource>>();
function load(app: pc.Application, rel: string) {
  let p = containers.get(rel);
  if (!p) { p = new Promise((ok, fail) => app.assets.loadFromUrl(BASE + rel, 'container', (e, a) => e || !a ? fail(e) : ok(a.resource as pc.ContainerResource))); containers.set(rel, p); }
  return p;
}

async function buildAvatar(app: pc.Application, cfg: AvatarConfigV2, catalog: AvatarCatalog) {
  const body = catalog.bodies.find(b => b.id === cfg.body)!;
  const [bodyC, bankC] = await Promise.all([load(app, body.path), load(app, body.animations)]);
  const root = bodyC.instantiateRenderEntity({ castShadows: true, receiveShadows: true }); // entidade da cena
  const armature = root.findByName('BAR_HUMANOID_V2')!;                                    // esqueleto VIVO
  root.addComponent('anim', { activate: true });
  for (const a of bankC.animations) { const t = a.resource as pc.AnimTrack; root.anim!.assignAnimation(t.name, t, undefined, 1, LOOPS.has(t.name)); }

  // sobrancelhas: deixe só uma ligada (ou nenhuma)
  for (const s of ['regular', 'thin', 'thick']) (root.findByName(`BAR_Brows_${s}`) as pc.Entity).enabled = cfg.brows === s;

  for (const sel of selectedPieces(cfg)) {                  // top, bottom, footwear, hair, facialHair, acessórios
    const piece = catalog.pieces.find(p => p.id === sel.id)!;
    const entry = piece.bodies[cfg.body];                   // ausente => peça incompatível com o corpo
    const c = await load(app, entry.path);
    const inst = c.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
    if (piece.attachment === 'skinned') {
      const mesh = inst.findByName(piece.meshNode) as pc.Entity;
      mesh.reparent(armature);                              // reparent mantém o TRS local (identidade no export)
      mesh.setLocalPosition(0, 0, 0); mesh.setLocalRotation(pc.Quat.IDENTITY); mesh.setLocalScale(1, 1, 1);
      mesh.render!.rootBone = root;                         // setter: limpa e recria as skin instances; ossos por rootBone.findByName
      inst.destroy();                                       // descarta a cópia das juntas da peça
    } else {
      const socket = root.findByName(piece.socket!) as pc.Entity;
      socket.addChild(inst); inst.setLocalPosition(0, 0, 0); inst.setLocalRotation(pc.Quat.IDENTITY);
    }
  }
  applyFace(root, cfg);        // morphs (abaixo)
  applyMaterials(root, cfg);   // clones + chunks + cores (seção 8)
  applyRegionMask(root, cfg);  // seção 9
  return root;
}
```

* Os pontos relevantes do código-fonte: `GlbContainerResource.instantiateRenderEntity` cria cada `SkinInstance` com `rootBone` = raiz da cena, e `SkinInstance.resolve` procura cada osso com `rootBone.findByName(boneName)`. O setter `RenderComponent.rootBone` chama `_clearSkinInstances` e depois `_cloneSkinInstances`, o que permite religar a peça ao esqueleto vivo.
* **Morphs:** `meshInstance.morphInstance.setWeight('face_jaw_wide', 0.6)` resolve por nome, a partir de `extras.targetNames` (verificado em `morph-instance.js` / `glb-parser.js`). Aplique os **mesmos pesos** em `BAR_Body`, nas 3 sobrancelhas e na peça `facial_*` vestida. Os presets estão em `bodies[].facePresets` e os nomes em `bodies[].morphTargets`.
* **Variante de textura:** carregue o PNG como textura sRGB e troque o `diffuseMap` do clone do material indicado em `textureOverride.material`:
  `const a = new pc.Asset(id, 'texture', { url: BASE + entry.textureOverride.baseColorTexture }, { srgb: true }); app.assets.add(a); app.assets.load(a);` → `clone.diffuseMap = a.resource`.
* Uma peça por slot e as regras de `compatibility.json` (seção 10) são validadas **antes** da montagem, no cliente e no servidor.

## 8. Mapeamento de materiais e cores

As texturas base são PNG sRGB em materiais OPAQUE. O **alfa é máscara de tingimento, não opacidade**. Clone os materiais por avatar, como o `applyCharacter` atual já faz: material começa com `Character`, cache por material original e `shaderChunksVersion = pc.version`.

| Material (nome exportado) | Campo de cor | Regra | Implementação |
| --- | --- | --- | --- |
| `CharacterSkin` | `skinTone` (+ `outfitColor`) | `tex.rgb * mix(outfitColor, skinTone, tex.a)`: A=1 pele, A=0 roupa de baixo base | **o mesmo `skinDiffuse` do legado** (`character-materials.ts`), sem mudança |
| `CharacterEyes` | `eyeColor` | `tex.rgb * mix(1, eyeColor, tex.a)`: A=1 íris | **chunk novo** abaixo; o chunk legado detecta a íris por luminância e **não funciona** com `eye_v2.png` |
| `CharacterHair` | `hairColor` | `tex.rgb * hairColor` | diffuse padrão: `material.diffuse` multiplica o mapa (conferido em `diffuse.js`). Vale para cabelo, sobrancelhas e barba. |
| `CharacterClothing-<pieceId>` com textura | `topColor` / `bottomColor` / `footwearColor` | `tex.rgb * mix(1, color, tex.a)`: A=0 partes de cor fixa (botões, sola, meia) | **chunk novo "clothing"** abaixo |
| `CharacterClothing-accessory_*` (sem textura) | `accessoryColor` | `albedo = color` | diffuse padrão |
| `CharacterLens-accessory_*` | — | cor e alfa fixos (BLEND) | não tingir: o código atual já pula `CharacterLens-` |

Chunk para `CharacterEyes` e `CharacterClothing-*` com textura (mesmo padrão do `skinDiffuse` legado):
```glsl
uniform vec3 material_diffuse;
void getAlbedo(){
  dAlbedo=material_diffuse;
  #ifdef STD_DIFFUSE_TEXTURE
    vec4 s=texture2DBias({STD_DIFFUSE_TEXTURE_NAME},{STD_DIFFUSE_TEXTURE_UV},{STD_TEXTURE_BIAS});
    vec3 tex={STD_DIFFUSE_TEXTURE_DECODE}(s).{STD_DIFFUSE_TEXTURE_CHANNEL};
    dAlbedo=tex*mix(vec3(1.0),material_diffuse,s.a);
  #endif
}
```
* Defina o `material.diffuse` com a cor hex escolhida, como hoje (`diffuse.fromString`). Uniforms personalizados como `barClothingColor` precisam de `.linear()`, como no código atual.
* As cores padrão de cada peça estão em `configurableMaterials[].defaultColor` e também vão como `baseColorFactor` no GLB. As paletas do jogo (`SKIN_TONES`, `HAIR_COLORS`, `EYE_COLORS`, `OUTFIT_COLORS`) continuam válidas.
* Categorias de material (`category`): Skin, Hair, Eyes, Fabric, Denim, Leather, Metal, Glass e Rubber (chinelo).

## 9. Regras de visibilidade de regiões do corpo

* `BAR_Body` carrega `TEXCOORD_1` com `u = (id + 0.5) / 32` e `v = 0.5`. O valor é uniforme por triângulo e os ids vão de 0 a 27 (verificado no GLB).
* Regiões (id: nome):
  * cabeça e tronco: 0 head, 1 neck, 2 chest, 3 shoulder_l, 4 shoulder_r, 5 torso_lower, 6 pelvis;
  * lado esquerdo: 7 upperarm_a_l, 8 upperarm_b_l, 9 lowerarm_a_l, 10 lowerarm_b_l, 11 hand_l, 12 thigh_a_l, 13 thigh_b_l, 14 shin_a_l, 15 shin_b_l, 16 foot_l;
  * lado direito: 17–26 com os mesmos nomes `_r`;
  * **27 waist**.
* **Conjunto oculto** = união de `hidesRegions` das peças vestidas + `regionRules`. Hoje há uma regra: **`waist` só é oculta quando há um TOP e um BOTTOM vestidos**. No corpo decimado essa faixa atravessa a barra das blusas e o cós; nenhuma peça a cobre sozinha, mas juntas cobrem (medido por raios no centro e nos cantos de cada face).
* Implementação recomendada, só com recursos padrão do StandardMaterial (conferidos em 2.23.3):
```ts
// por avatar (ou cache por máscara): textura 32×1, sem mipmaps, filtro NEAREST, CLAMP
const tex = new pc.Texture(device, { width: 32, height: 1, format: pc.PIXELFORMAT_RGBA8, mipmaps: false,
  minFilter: pc.FILTER_NEAREST, magFilter: pc.FILTER_NEAREST, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE });
const px = tex.lock() as Uint8Array;
for (let i = 0; i < 32; i++) { const v = hidden.has(i) ? 0 : 255; px.set([v, v, v, 255], i * 4); }
tex.unlock();
skinClone.opacityMap = tex; skinClone.opacityMapUv = 1; skinClone.opacityMapChannel = 'r';
skinClone.alphaTest = 0.5; skinClone.update();
```
* **Atenção:** o parser glTF atribui `opacityMap = baseColorTexture` com canal `a` (`glb-parser.js`). Se o `alphaTest` for ligado sem substituir o `opacityMap`, a máscara de tingimento (A=0 da roupa de baixo) **vai sumir**. O `alphaTest` também vale no passe de sombra, então partes ocultas não projetam sombra.
* Olhos e sobrancelhas não usam máscara.
* Limitações: a faixa da virilha (faces `pelvis` entre as coxas, viradas para baixo) só fica visível por baixo de uma saia. O topo da meia segue a borda serrilhada da região `foot`.

## 10. Compatibilidade das peças

Fonte: `manifests/compatibility.json`. A métrica é a contagem de pares de triângulos que se cruzam (`BVHTree.overlap`) entre as malhas deformadas, em rest, Walk, Sit, Dance, Drink e Wave.

* **Status:** `ok` ≤ 10 pares em pé; `minor_clipping` ≤ 60, permitido com clipping pequeno; `blocked` > 60, o editor deve impedir; `by_design` (sola do pé dentro do chinelo); `untested`. O `Sit` é publicado à parte (`seated`) e não entra no status.
* **Regras:**
  * `onePerSlot` em top, bottom, footwear, hair e facialHair.
  * `socketExclusive`: `socket_glasses` (óculos × óculos escuros) e `socket_head_top` (boné × chapéu).
  * `bodyRestriction`: `bottom_skirt` só existe no feminino.
  * `requiresCategory`: `bottom_skirt` exige TOP. Sozinha, a faixa `waist` fica visível e atravessa o cós (128 pares); com TOP, 35.
  * `regionRule` `waist` (seção 9).
  * `inherits`: `top_tee_print` herda de `top_tee` e `bottom_pants` de `bottom_jeans`.
* **Bloqueios medidos:**
  * `hair_long`, `hair_wavy` e (masculino) `hair_medium` com `top_hoodie`: o capuz.
  * `footwear_boots` com `bottom_jeans`/`bottom_pants`: o cano atravessa a perna da calça.
  * (feminino) `accessory_bracelet` com `top_hoodie`.
* **Clipping pequeno relevante:**
  * todos os cabelos com `accessory_cap`;
  * `hair_ponytail` com tops;
  * `top_jacket`/`top_shirt` com bottoms;
  * a pulseira com mangas longas;
  * tops com a saia.
* **Pares de categoria não medidos:** FOOTWEAR|TOP, FOOTWEAR|ACCESSORY, FACIAL_HAIR|BOTTOM, HAIR|BOTTOM e HAIR|FOOTWEAR (regiões que não se tocam nos clipes medidos).
* `pieceVsSkin` / `pieceVsSkinWithTop`: interseção de cada peça com a pele que continua visível.

## 11. Estratégia de carregamento e cache

* **Um container por URL**, compartilhado entre todos os avatares (malhas, skins e texturas compartilhadas). Por avatar ficam só as entidades, os clones de material e a máscara de região.
* **Pré-carregar** `bodies/<body>.glb` e `animations/humanoid_v2_<body>.glb` (≈ 0,68 + 1,3 MB por corpo). As peças carregam sob demanda (10–180 KB cada). `rigs/` serve só de referência.
* **Texturas compartilhadas externas** (`hair_v2.png`, `eye_v2.png`): por padrão cada GLB cria o próprio asset de textura (`glb-parser.js` → `loadTexture`, sem deduplicação por URL). Para compartilhar, carregue a textura uma vez (`{ srgb: true }`) e use o gancho do container:
```ts
const asset = new pc.Asset(rel, 'container', { url: BASE + rel });
asset.options = { image: { processAsync: (img: any, cb: (e: any, t?: pc.Asset | null) => void) =>
  cb(null, img.uri?.endsWith('hair_v2.png') ? hairTex : img.uri?.endsWith('eye_v2.png') ? eyeTex : null) } };
app.assets.add(asset); app.assets.load(asset);
```
  `cb(null, null)` cai no carregamento padrão (verificado). **Cuidado:** `GlbContainerResource.destroy()` descarrega *todos* os assets de textura do container, inclusive um compartilhado injetado assim. Mantenha esses containers no cache durante a sessão, ou remova a textura compartilhada de `container.textures` antes do `destroy`.
* As miniaturas do editor podem reaproveitar os containers em cache.

## 12. Estratégia para evitar múltiplos esqueletos ativos

* Cada avatar tem **uma** hierarquia de juntas (a do GLB do corpo) e **um** componente `anim` na raiz. As peças skinned são religadas com `render.rootBone = root`, e a cópia das juntas delas é destruída na hora (`inst.destroy()`).
* Os acessórios não têm skin: são filhos de sockets do esqueleto vivo.
* Uma avaliação de animação por avatar, independentemente do número de peças.
* **Otimização opcional (validar no PlayCanvas):** cada GLB tem o próprio objeto `Skin`, então cada peça gera uma paleta de 53 matrizes. A ordem das juntas e as IBMs são idênticas em todos os arquivos do mesmo corpo (`rig-contract.json` → `bindMatrices.sameBodyAcrossFiles.sameJointOrder = true`, `maxAbsDiff = 0`). Por isso dá para atribuir `meshInstance.mesh.skin = bodyMesh.skin` **antes** de definir `rootBone`; o `SkinInstanceCache` então reutiliza uma única skin instance por (skin, rootBone), ou seja, uma paleta por avatar. Como `Mesh` é compartilhado entre avatares do mesmo container, faça isso uma vez por container e só para o mesmo corpo.

## 13. Requisitos de descarte de recursos

* Ao trocar uma peça: `entity.destroy()` na entidade da peça (o `RenderComponent` limpa as skin instances) e remova as referências.
* Ao remover o avatar: destrua os clones de material (`disposeCharacter`), a textura de máscara (se não estiver em cache compartilhado) e `root.destroy()`.
* Containers: contagem de referências por URL. Só chame `container.destroy()` quando nenhum avatar usar a peça, observando a ressalva das texturas compartilhadas (seção 11).
* As cópias de juntas das peças são destruídas na montagem: nada de esqueletos órfãos.
* Clones de material criados para miniaturas no editor também devem ser liberados ao fechar o editor, como hoje.

## 14. Exemplos de configuração JSON

Configuração proposta (v2):
```json
{
  "version": 2,
  "body": "female",
  "face": { "preset": "suave" },
  "brows": "thin",
  "skinTone": "#e8b894", "eyeColor": "#4e7a9a", "hairColor": "#b88742", "outfitColor": "#24363d",
  "hair": "hair_long",
  "facialHair": "none",
  "top": { "id": "top_tank", "color": "#873e37" },
  "bottom": { "id": "bottom_skirt", "color": "#24363d" },
  "footwear": { "id": "footwear_flipflops", "color": "#51645b" },
  "accessories": [ { "id": "accessory_bracelet", "color": "#b18c4d" } ]
}
```
Arquivos resolvidos para essa configuração (feminino):
```json
{
  "body": "bodies/female.glb", "animations": "animations/humanoid_v2_female.glb",
  "skinned": ["hair/hair_long_female.glb", "tops/top_tank_female.glb", "bottoms/bottom_skirt_female.glb", "footwear/footwear_flipflops_female.glb"],
  "sockets": { "socket_wrist_l": "accessories/accessory_bracelet_female.glb" },
  "morphWeights": { "face_lips_full": 0.6, "face_nose_small": 0.5 },
  "hiddenRegions": ["torso_lower", "pelvis", "thigh_a_l", "thigh_a_r", "waist"],
  "textures": ["textures/hair_v2.png", "textures/eye_v2.png"]
}
```
Variante de textura: `"top": { "id": "top_tee_print", "color": "#111820" }` resolve para `tops/top_tee_<body>.glb` + override `textures/top_tee_print_<body>.png` no material `CharacterClothing-top_tee`.

## 15. Lista dos testes executados

Todos os testes são reproduzíveis com os scripts de `BAR_Avatar_V2/scripts`. Os resultados estão em `validation/`.

**Leitura bruta do glTF** (`validate_glb.py`, 63 arquivos, **0 erros**):
* acessores, incluindo os *sparse* que o Blender usa nos morphs (todos decodificados);
* pesos normalizados, ≤ 4 influências, índices de junta válidos e nenhum vértice sem peso;
* sem canais de escala e translação só no `hip`;
* URIs externas relativas e existentes;
* nenhum caminho absoluto;
* nomes de nó únicos.

**Contrato entre arquivos:**
* IBMs idênticas (dif. 0), ordem e caminhos de juntas iguais em 26 e 27 arquivos;
* materiais de cada malha iguais aos do master (67 nós).

**Reimportação Blender independente** (`--factory-startup`, uma cena por corpo):
* corpo, morphs e sockets corretos;
* **todas** as peças montadas num único esqueleto (1 armature na cena), com juntas de repouso idênticas;
* 5 acessórios presos aos sockets, com erro de centro ≤ 1 mm em rest, Walk e Dance;
* os 18 clipes de cada banco tocados no esqueleto do corpo: erro máximo de junta ≤ 3 mm em 0/25/50/75/100 %, mesmo número de quadros;
* override das duas variantes de textura (mesmo tamanho);
* renders com a máscara de regiões aplicada.

**Blender (master):**
* `compatibility.json`: pares entre peças e peça × pele visível, em 6 poses;
* critérios dos clipes:
  * emenda de loop ≤ 1° / 5 mm;
  * in-place ≤ 1 cm;
  * juntas dos pés ≥ −1 cm;
  * malha do corpo ≥ −2,5 cm (Fallen/Recover ≥ 0 após a correção s12b);
* cobertura das regiões por raios;
* uniformidade de `TEXCOORD_1` por triângulo;
* faixa `waist` coberta por TOP+BOTTOM;
* contact sheets de animação e folhas por categoria no pose Idle.

Os principais renders:
* `renders/validation/reimport_*` (sem máscara, `masked_`, `variant_masked_`);
* `renders/validation/animation_contact_sheet_{male,female}.png`;
* `renders/validation/blender_*`;
* `renders/catalog/sheet_*_{male,female}.png` e `outfit_0{1,2,3}_idle_{front,back}.png`.

## 16. Lista dos testes pendentes no PlayCanvas

1. `loadFromUrl(..., 'container')` dos GLBs, com URIs relativas `../textures/…` resolvidas a partir da pasta publicada.
2. Religar as peças com `render.rootBone`, destruir as juntas duplicadas e conferir o *culling* (AABB das malhas skinned) com o personagem em movimento.
3. Bancos de animação nos corpos V2: resolução de caminhos pelo binder, crossfades e one-shots.
4. `morphInstance.setWeight` por nome no corpo, nas sobrancelhas e nas barbas (acessores *sparse*).
5. Chunks `skinDiffuse` (existente), olhos e clothing; cores sRGB/linear; lentes BLEND.
6. Máscara de regiões com `opacityMap`/`alphaTest` (incluindo sombras) e a regra `waist`.
7. Compartilhamento de texturas via `processAsync` e o descarte de containers.
8. Desempenho com N avatares: paletas de skin (com e sem a otimização da seção 12), draw calls (8–10 por avatar), memória de textura e dispositivos móveis.
9. Assentos e props:
   * `sitDrop` nas cadeiras (0,47 m);
   * copo e garrafa (`drink-props.ts` usa `middle_01_*`);
   * cartas;
   * bengala (o prop legado foi ajustado à mão do rig antigo: reajustar ou usar `socket_hand_r`).
10. Pegada do `Dance` (até 1,15 m) e do `DrunkWalk` perto de mesas; transições `Fallen` → `Recover`.
11. Sincronização multiplayer da configuração v2 e validação no servidor pelo catálogo.

## 17. Instruções para migração do criador legado

* **Hoje:**
  * `apps/web/public/characters/base-<body>.glb` (Quaternius, 65 juntas) com peças ligadas/desligadas por `part-<nome>`;
  * cobertura por `body-coverage-*`;
  * catálogo `packages/shared/src/clothing-catalog.json`, só masculino.
* **V2:** os arquivos deste export, montados como na seção 7. As skins completas (Nathan, Leandro, Rafael, Read, Magrão) não mudam.
* **Esquema:** `characterSchema` v1 → v2 (exemplo na seção 14). Leia o v1 e converta:

| v1 | v2 |
| --- | --- |
| `body` | igual |
| `hair: buzzed` | `hair_buzzed` |
| `hair: buzzed-female` | `hair_buzzed` (no V2 o corte raspado é o mesmo nos dois corpos) |
| `hair: simple-parted` | `hair_parted` |
| `hair: long` | `hair_long` |
| `hair: buns` | `hair_bun` |
| `hair: none` | `none` |
| `eyebrows: regular` | `brows: regular` |
| `eyebrows: female` | `brows: thin` |
| `eyebrows: none` | `none` |
| `beard: true` | `facialHair: facial_beard_full` |
| `beard: false` | `none` |
| `top: tee` | `top_tee` |
| `top: sweater` | `top_hoodie` (mais próximo; não há suéter no V2) |
| `bottom: pants` | `bottom_pants` |
| `bottom: trousers` | `bottom_pants` (não há calça social no V2) |
| `footwear: sneakers` | `footwear_sneakers` |
| `footwear: derby` | `footwear_shoes` |
| `accessory: glasses` | `accessory_glasses` |
| `skinTone`, `hairColor`, `eyeColor`, `outfitColor`, `topColor`, `bottomColor`, `footwearColor`, `accessoryColor` | mesmas paletas e o mesmo significado |

* **Servidor/API:** validar ids e corpo contra `avatar-catalog.json` (como hoje com `clothing-catalog.json`) e aplicar as regras de `compatibility.json` (peça bloqueada → recusar, saia sem TOP → recusar ou incluir um TOP).
* **Editor:**
  * as opções vêm do catálogo filtrado por corpo; o feminino agora tem roupas;
  * os presets de rosto vêm de `facePresets`;
  * sobrancelhas `regular`/`thin`/`thick`.
* **Animações:** `animations/<id>.glb` dos corpos base → `animations/humanoid_v2_<body>.glb`. A lista de one-shots continua a mesma.
* **Testes do repositório:** `tests/integration/characters.test.ts` espera `CharacterClothing-${id}`, e os nomes V2 seguem o padrão `CharacterClothing-<pieceId>`. Os testes de "65 juntas" e de `part-*` precisam de versões V2.
* Nada do código do jogo foi alterado nesta entrega.

## 18. Problemas conhecidos e limitações

* **Validação:** nenhuma no PlayCanvas (seção 16). As licenças das animações não foram verificadas (`LICENSES.md`) e precisam ser confirmadas antes de distribuição comercial.
* **Sentado** (skinning linear, sem simulação de tecido):
  * as barras afundam nas coxas (pares em `seated`);
  * a saia sentada deixa a parte de trás pendurada sob as coxas e faz uma dobra lateral.
* **Combinações:** bloqueios e *minor clipping* conforme a seção 10. A saia exige TOP.
* **Tops:** são justos ao corpo (casca com afastamento); atrás, a barra acompanha o volume dos glúteos.
* **Cabelos:**
  * o painel traseiro do longo fica alguns cm afastado das costas de perfil (folga para golas e capuzes);
  * todos os cabelos clipam um pouco sob o boné.
* **Regiões e máscara:**
  * o corpo decimado tem bordas de região serrilhadas;
  * a meia segue essa borda;
  * a regra `waist` existe por causa disso;
  * a faixa da virilha não é coberta por baixo da saia.
* **Animações:**
  * os cantos de calcanhar e ponta do pé afundam até 2,2 cm no chão em Walk, Run, AngrySit e CardsSit;
  * `Dance` oscila até 1,15 m e `DrunkWalk` até 0,44 m (in-place, mas com pegada);
  * a redução de chaves introduz no máximo 3 mm de erro;
  * `Pose` é um clipe estático;
  * as fontes `Idle` e `Fallen` diferem das do jogo atual, por qualidade.
* **Props:** sem props (bengala, copo, cartas) nesta biblioteca. Os sockets estão prontos, mas os props legados precisam de reajuste.
* **Desempenho:**
  * sem LODs;
  * uma primitiva por peça (8–10 draw calls por avatar);
  * texturas de 512 px por peça e pele de 1024 px;
  * as texturas externas se duplicam por container se a seção 11 não for aplicada.
* **Corpos e barbas:** a altura feminina é de 1,67 m, abaixo do intervalo de referência de 1,70–1,80 m. As barbas existem também para o corpo feminino, como no legado.
* **Renders de validação:** são Workbench/EEVEE com materiais de pré-visualização que emulam a regra de tingimento. Não são o shader do jogo.
