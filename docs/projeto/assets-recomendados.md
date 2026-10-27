# Assets recomendados

Catálogo prático de assets reais (3D, animação, áudio e UI) para o B.A.R., um boteco multiplayer no navegador (PlayCanvas 2.23, WebGL2, glTF/GLB, meshopt, KTX2 previsto).

Este documento **não aprova nenhum asset**. Ele indica candidatos. Valem as regras de [auditoria/05-PIPELINE-ASSETS.md](../auditoria/05-PIPELINE-ASSETS.md) e [auditoria/09-ASSETS-E-FERRAMENTAS.md](../auditoria/09-ASSETS-E-FERRAMENTAS.md):

- direção visual **PS2 estilizado**: silhueta forte, materiais simples, texturas pequenas de propósito;
- Quaternius e Avatar V2/Antonia foram **rejeitados artisticamente** como avatar. Aqui só aparecem as *animações* CC0 do Quaternius, que dependem só do rig;
- todo asset entra no `assets-manifest.yml` com autor, URL, licença, cópia da licença e data da verificação. Asset com status `unknown` não vai para produção.

Pesquisa feita em outubro de 2026. Licenças mudam: o que estiver marcado **verificar licença** não foi confirmado numa fonte primária e precisa ser conferido antes do uso.

## Legenda de licenças

| Rótulo | Significado prático | Pode ficar no repositório aberto? |
| --- | --- | --- |
| **CC0** | Domínio público. Sem atribuição (embora seja bem-vinda). | Sim |
| **CC-BY** | Uso livre, inclusive comercial, com crédito obrigatório (autor, link e licença) | Sim, com o crédito no `CREDITS.md` e no jogo |
| **CC-BY-NC** | Proibido uso comercial | **Não usar** |
| **MIT / ISC / OFL** | Licenças de software e de fontes. Exigem manter o texto da licença. | Sim, com o arquivo `LICENSE` junto |
| **Royalty-free (EULA)** | Pode usar no jogo, mas o arquivo bruto não pode ser redistribuído | **Não**: guardar fora do repositório público e publicar só o build |
| **Restrito** | Depende de conta, plano ou receita | Avaliar caso a caso |

> **Marcas registradas:** não modelar nem texturizar logotipos reais (Brahma, Skol, Heineken, Coca-Cola, iFood, Rappi, Honda, Marlboro). Usar marcas fictícias, como "Cerveja Buteco" ou "Rango Já". Mesmo um asset CC0 com logo real continua infringindo a marca.

---

## 1. Personagens, skins e roupas modulares

### 1.1 Esqueleto canônico: nomenclatura do UE5 Mannequin

**Recomendação:** adotar a nomenclatura e a hierarquia do **Unreal Engine 5 Mannequin (Manny/Quinn)** como esqueleto canônico da *biblioteca de animação*. Cada clipe é autorado ou limpo uma vez nesse esqueleto e depois retargetado offline para cada rig nativo (Quaternius Standard enquanto existir, AccuRig/ActorCore e o rig do Character Creator/Unreal do Rafael).

Motivos:

- o rig do Rafael já segue o padrão Unreal;
- o AccuRig e o Character Creator têm preset de exportação FBX para Unreal;
- o Quaternius Universal Animation Library declara compatibilidade com Unreal e retarget;
- Mixamo e CMU mapeiam para ele 1:1 no Rokoko Retarget ou no IK Retargeter do Unreal;
- os nomes não têm o prefixo `mixamorig:`, cujo `:` costuma ser trocado por `_` em alguns exportadores e quebra o mapeamento.

Ossos obrigatórios (subconjunto, sem twist nem IK):

```text
root > pelvis > spine_01 > spine_02 > spine_03 > neck_01 > head
spine_03 > clavicle_l > upperarm_l > lowerarm_l > hand_l > (thumb/index/middle/ring/pinky _01.._03_l)
pelvis > thigh_l > calf_l > foot_l > ball_l        (espelhado em _r)
sockets: hand_r_prop, hand_l_prop, head_prop, spine_03_back, pelvis_hip
```

Regras:

- pose de bind em **A-pose** (a do UE5). Clipes do Mixamo (T-pose) são retargetados com correção de pose de repouso;
- `root` fica no chão. O root motion é removido da locomoção de rede, como manda o pipeline;
- dedos são mantidos, porque segurar copo, cigarro, cartas e espetinho precisa de grip. Os ossos de twist e IK do UE5 são descartados;
- no máximo 4 influências por vértice e no máximo cerca de 70 ossos por skin.

**Alternativa, se o time preferir:** Mixamo como canônico. É mais simples para quem baixa tudo do Mixamo, mas prende o pipeline a um serviço sem manutenção (ver 2.1).

### 1.2 Ferramentas de rig e retarget

| Ferramenta | URL | Licença | Para que serve aqui | Observação |
| --- | --- | --- | --- | --- |
| Blender (LTS atual) | https://www.blender.org | GPL (a ferramenta; o que você produz é seu) | Limpeza de rig, pesos, roupas, exportação glTF | Fonte de verdade de todos os assets |
| Rokoko Retargeting (add-on do Blender) | https://www.rokoko.com/integrations/blender | Grátis, exige conta Rokoko | Retarget de Mixamo, CMU, ActorCore e UAL para o canônico, com mapa de ossos salvo | Compatibilidade com o Blender mais recente: **verificar** (o add-on costuma atrasar em relação às versões novas) |
| AccuRig 2 (Reallusion) | https://actorcore.reallusion.com/auto-rig | Grátis, exige conta ActorCore | Auto-rig de skins novas com preset Unreal | Termos de uso comercial do FBX exportado: **verificar licença** (só há declarações de marketing) |
| Mixamo | https://www.mixamo.com | Royalty-free (Adobe) | Auto-rig rápido e fonte de animações | Ver alerta em 2.1 |
| Cascadeur | https://cascadeur.com/plans | **Restrito**: Free/Edu sem uso comercial e só exporta o formato `.casc`. Indie: comercial até US$ 100 mil/ano | Polir clipes, criar poses (moto, poker), física de pulo e tropeço | Só vale a pena com licença Indie |
| MPFB 2 (MakeHuman para Blender) | https://static.makehumancommunity.org/mpfb.html | Ferramenta GPL. Assets do sistema marcados como CC0 | Gerar corpos base e roupas contemporâneas com rig "game engine" | Precisa de decimação e de repintura para o visual PS2 |
| Ready Player Me | — | **Encerrado** | — | Comprado pela Netflix (dez/2025). API e criador saíram do ar em 31/01/2026. **Não usar.** |
| Avaturn | https://avaturn.me | **verificar licença** | Avatar a partir de selfie, exporta GLB compatível com Mixamo | Visual realista e conflitante com o PS2. Termos não confirmados. |
| Avatar SDK / MetaPerson | https://avatarsdk.com | Comercial, **verificar licença** | Alternativa paga ao RPM | Só se o produto quiser avatar por foto |

### 1.3 Candidatos de corpo e roupa

| Asset | URL | Licença | Uso | Formato | Por que serve |
| --- | --- | --- | --- | --- | --- |
| KayKit Character Pack: Adventurers | https://kaylousberg.itch.io/kaykit-adventurers | CC0 | Referência de acabamento e teste de rig | FBX, glTF | Estilizado, rig limpo. As roupas são de fantasia e servem só para benchmark. |
| MakeHuman System Assets (via MPFB) | https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html | CC0 (por item; conferir cada um) | Corpos masculino e feminino, cabelos, camiseta, bermuda, jeans, chinelo | MHCLO para Blender, depois glTF | Roupas do dia a dia, já ajustadas ao corpo, que cabem num boteco |
| Mixamo Characters | https://www.mixamo.com | Royalty-free, sem redistribuição do bruto | Só para teste de animação | FBX | Útil como "boneco de teste". Não serve de avatar final. |
| Poly Pizza (acessórios) | https://poly.pizza | Varia por modelo (CC0 ou CC-BY) | Boné, óculos, corrente e chapéu como props rígidos em socket | GLB | Filtrar por CC0. Cada modelo precisa de verificação. |

**Estratégia de roupa modular:**

1. Um corpo base por sexo no esqueleto canônico.
2. Cada peça (camiseta, regata, bermuda, calça, chinelo, tênis, boné) é uma malha separada com pesos transferidos do corpo (Data Transfer no Blender) e ajustados à mão nas axilas e na virilha.
3. Faces do corpo cobertas pela peça são escondidas por uma máscara de região (*body part mask*) para evitar clipping e poupar triângulos.
4. Em runtime, peças do mesmo avatar são combinadas num atlas de 1024² (ver "Pipeline recomendado") para atingir no máximo 8 draw calls por avatar.

---

## 2. Animações

### 2.1 Fontes

| Fonte | URL | Licença | O que oferece | Alerta |
| --- | --- | --- | --- | --- |
| Quaternius Universal Animation Library 1 e 2 | https://quaternius.com/packs/universalanimationlibrary.html · https://quaternius.itch.io/universal-animation-library-2 | **CC0** (edição Standard grátis. O `.blend` fonte é pago, mas a licença é a mesma.) | Mais de 250 clipes: locomoção, idles, interações, sentar, combate | Melhor base CC0 para locomoção. Rig declarado compatível com Unreal e Mixamo. |
| Mixamo | https://www.mixamo.com | Royalty-free (Adobe FAQ) | Milhares de clipes, inclusive estilos de andar | **Não versionar FBX bruto no repositório público.** O FAQ proíbe redistribuir os arquivos de personagem e de animação como pacote. Guardar as fontes num armazenamento privado e publicar só o GLB do jogo. O serviço funciona em 2026, mas está sem atualizações e já teve quedas. |
| ActorCore (freebies) | https://actorcore.reallusion.com | Uso comercial declarado. Redistribuição proibida (mesmo regime da Standard License). **Verificar licença** do pacote grátis específico. | Mocap de alta qualidade, nativo do rig CC/AccuRig | Mesma regra do Mixamo: fonte privada, só o build é público |
| Rokoko Motion Library (cerca de 150 grátis) | https://www.rokoko.com/products/studio | Comercial permitido (cobertura de 2020). **Verificar licença** atual. | Mocap variado, baixado pelo Rokoko Studio | Não redistribuir o bruto |
| CMU Graphics Lab Mocap | http://mocap.cs.cmu.edu | Uso livre, inclusive comercial. Proibido revender os dados, mesmo convertidos. Agradecimento pedido. | Mais de 2.500 capturas: caminhadas estilizadas, gestos, sentar, ações do dia a dia | Usar a conversão BVH do cgspeed. Precisa de limpeza (pés, ruído). Pode ficar no repo, com crédito. |
| Bandai Namco Research Motion Dataset | https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset | **CC-BY-NC 4.0** | Estilos de andar ótimos (idoso, feminino, cansado) | **Proibido em produto comercial.** Serve só como referência visual. |

### 2.2 Mapa de clipes por feature

"Termo de busca" é o que procurar na fonte. Nomes exatos de clipes mudam, então valide no download.

| Feature | Clipe | Fonte preferida (fallback) | Termo de busca | Camada |
| --- | --- | --- | --- | --- |
| Andar normal | walk, run, idle | Quaternius UAL (Mixamo) | `walk`, `jog`, `idle` | Locomoção |
| Andar bêbado | walk bêbado + idle oscilando + tropeço | Mixamo (CMU) | `drunk walk`, `drunk idle`, `stumble` | Locomoção (blend por nível de embriaguez) |
| Andar de idoso | walk lento e curvado | Mixamo (CMU) | `old man walk`, `old man idle` | Locomoção |
| Andar gingado | swagger | Mixamo | `swagger walk`, `strut` | Locomoção |
| Andar feminino | catwalk suave, idle feminino | Mixamo (Rokoko) | `female walk`, `catwalk`, `standing idle female` | Locomoção |
| Sentar | sentar, levantar, idle sentado, conversa sentado | Quaternius UAL (Mixamo) | `sit down`, `sitting idle`, `sitting talking`, `stand up` | Corpo inteiro, com IK de quadril no `SEAT_` |
| Beber | levar o copo à boca (em pé e sentado) | Mixamo | `drinking` | Camada superior + prop em `hand_r_prop` |
| Comer | garfada, mordida de hambúrguer | Mixamo (ActorCore) | `eating` | Camada superior |
| Fumar | tragar, bater a cinza, segurar o cigarro | Mixamo | `smoking` | Camada superior + partícula na ponta |
| Celular | digitar, ligação, olhar a tela | Mixamo | `texting`, `talking on phone`, `cell phone` | Camada superior + tela emissiva |
| Poker | olhar cartas, apostar fichas, all-in, comemorar, lamentar | Mixamo (sentado) + pose própria em Cascadeur/Blender | `sitting thumbs up`, `sitting clap`, `sitting disbelief`, `sitting victory` | Camada superior com o personagem sentado |
| Churrasqueira | virar espetinho, abanar o carvão, servir | ActorCore (pago) ou clipe próprio em Blender | `cooking`, `stirring`, `fanning` | Camada superior em loop |
| Moto | pose de pilotagem, inclinação, apoiar o pé ao parar | **Pose própria** (nenhuma fonte grátis confiável) | `motorcycle`, `riding` (ActorCore pago) | Pose estática + inclinação procedural + IK nas mãos e nos pés |

**Dica:** a moto e a churrasqueira rendem mais como uma pose-chave e um pequeno loop feitos à mão em 10 a 30 quadros do que como mocap. É barato, sai do jeito PS2 e não tem risco de licença.

---

## 3. Props

### 3.1 Bar, mesa e comida

| Prop | Asset sugerido | URL | Licença | Uso exato no jogo | Formato |
| --- | --- | --- | --- | --- | --- |
| Cadeira de plástico (monobloco) | Plastic Monobloc Chair 01 | https://polyhaven.com/a/plastic_monobloc_chair_01 | CC0 | Mesas da calçada. É *a* cadeira de boteco. | glTF/blend (decimar) |
| Banqueta de balcão | Metal Stool 01–03, Bar Chair Round 01 | https://polyhaven.com/a/metal_stool_01 · https://polyhaven.com/a/bar_chair_round_01 | CC0 | `SEAT_` do balcão | glTF |
| Mesa de bar | Round Wooden Table 01, Outdoor Table Chair Set 01 | https://polyhaven.com/a/round_wooden_table_01 · https://polyhaven.com/a/outdoor_table_chair_set_01 | CC0 | Mesas internas e externas, e base da mesa de poker | glTF |
| Engradado | Plastic Crate 01–03 | https://polyhaven.com/a/plastic_crate_01 | CC0 | Base de engradado de cerveja (remodelar as divisórias de 24 garrafas) | glTF |
| Garrafa de cerveja 600 ml | **Modelo próprio** | — | Interno | Prop de beber e item de inventário. Vidro âmbar com rótulo fictício. | Cerca de 150 tris, textura de 128² |
| Copo americano | **Modelo próprio** | — | Interno | Prop de beber. As facetas do copo são icônicas e é mais rápido modelar do que achar. | Cerca de 120 tris, material transparente simples |
| Cigarro + fumaça | Cigarro próprio + Kenney Particle Pack | https://kenney.nl/assets/particle-pack | CC0 | Sprite `smoke_*` no emissor de partículas do PlayCanvas, preso à ponta do cigarro | PNG, 12 tris para o cigarro |
| Hambúrguer | Kenney Food Kit | https://kenney.nl/assets/food-kit | CC0 | Prato do cardápio. As camadas vêm separadas (pão, carne, queijo). | glTF/FBX/OBJ |
| Pão, pratos, frutas | Hamburger Buns, Carved Wooden Plate | https://polyhaven.com/a/hamburger_buns · https://polyhaven.com/a/carved_wooden_plate | CC0 | Referência de materiais. Prato de louça branca é modelo próprio. | glTF |
| Espetinho | Carne e linguiça do Kenney Food Kit + palito próprio | https://kenney.nl/assets/food-kit | CC0 | Espetinho de carne, frango e queijo coalho na churrasqueira e no prato | glTF |
| Churrasqueira de carvão | Barrel Stove (Hidden Alley) como base | https://polyhaven.com/a/barrel_stove | CC0 | Adaptar para churrasqueira de tambor cortado ao meio, com grelha. É a churrasqueira clássica de rua. | glTF |
| Mesa, fichas e cartas de poker | Mesa própria + Kenney Boardgame Pack + Kenney Playing Cards Pack | https://kenney.nl/assets/boardgame-pack · https://kenney.nl/assets/playing-cards-pack | CC0 | Texturas das cartas e das fichas. Fichas são cilindros instanciados e o feltro vem do ambientCG (`Fabric`). | PNG 2D + malha própria |
| Celular | **Modelo próprio** | — | Interno | Prop de mão. A tela é um material emissivo trocado pela UI. | Cerca de 40 tris |
| Jukebox | **Modelo próprio** (referência: Wurlitzer anos 60) | — | Interno | Objeto interativo da jukebox atual | Cerca de 1.500 tris, 512². Modelos do Sketchfab/Poly Pizza: **verificar licença** por item. |
| TV, telão e palco | Kenney Furniture Kit (TV) + palco modular próprio | https://kenney.nl/assets/furniture-kit | CC0 (**verificar** se o kit tem TV) | Superfície da `television-surface`. O palco é caixa + praticáveis. | glTF |
| Caixa de som e rádio | Portable Cassette Player | https://polyhaven.com/a/portable_cassette_player | CC0 | Decoração do balcão | glTF |

### 3.2 Delivery e mapa procedural

| Prop | Asset sugerido | URL | Licença | Uso exato | Formato |
| --- | --- | --- | --- | --- | --- |
| Moto de entrega | **Modelo próprio** (motoneta 125–160 cc genérica, sem marca). Alternativa: Poly Pizza com filtro CC0. | https://poly.pizza | Interno, ou **verificar licença** | Veículo do minigame de delivery | 1.500–3.000 tris, 512² |
| Bag de entrega | **Modelo próprio** (caixa térmica com alças, sem marca) | — | Interno | Preso ao socket `spine_03_back` ou no bagageiro da moto | Cerca de 100 tris |
| Ruas | Kenney City Kit (Roads) | https://kenney.nl/assets/city-kit-roads | CC0 | Peças de grid: retas, curvas, cruzamentos, faixa, placas e semáforos (v2.1) | glTF/FBX/OBJ |
| Casas de bairro | Kenney City Kit (Suburban) | https://kenney.nl/assets/city-kit-suburban | CC0 | Lotes residenciais do gerador procedural | glTF/FBX/OBJ |
| Comércio | Kenney City Kit (Commercial) | https://kenney.nl/assets/city-kit-commercial | CC0 | Esquinas com lojas, padaria e farmácia (retexturizar fachadas) | glTF/FBX/OBJ |
| Kit alternativo de cidade | KayKit City Builder Bits | https://kaylousberg.itch.io/city-builder-bits | CC0 | Peças com **um único atlas de gradiente** de 1024², que pode baixar para 128². Ótimo para draw calls e instancing. | glTF/FBX/OBJ |
| Postes com fiação | Modular Electricity Poles | https://polyhaven.com/a/modular_electricity_poles | CC0 | O emaranhado de fios do poste brasileiro. Decimar bastante. | glTF |
| Iluminação pública | Street Lamp 01/02 | https://polyhaven.com/a/street_lamp_01 | CC0 | Postes de luz das ruas de entrega | glTF |
| Lixeira, barreiras, alambrado | Metal Trash Can, Concrete Road Barrier, Modular Chainlink Fence | https://polyhaven.com/a/metal_trash_can | CC0 | Detalhes de calçada e terreno baldio | glTF |
| Orelhão | Korean Public Payphone 01 como base | https://polyhaven.com/a/korean_public_payphone_01 | CC0 | Remodelar a cúpula no formato "ovo" do orelhão brasileiro (não achamos orelhão CC0) | glTF |

### 3.3 Elementos brasileiros a modelar internamente

Não achamos packs CC0 confiáveis com elementos brasileiros. São peças simples, em que um modelo próprio de baixo polígono vale mais do que procurar:

- orelhão, banca de jornal, carrinho de pipoca e de churrasquinho;
- toldo listrado, grade de ferro de portão, porta de enrolar (aço ondulado);
- caixa d'água azul de laje, laje com vergalhão exposto, muro chapiscado com pichação fictícia;
- calçada de pedra portuguesa (textura própria de padrão ondulado, tileável, 512²), meio-fio pintado;
- placa de rua azul e branca, lombada e faixa de pedestre;
- letreiro de boteco pintado à mão (decal com fonte do item 6), cartaz "Fiado só amanhã".

Sketchfab tem itens brasileiros pontuais, quase todos **CC-BY** (crédito obrigatório) e de qualidade irregular. Use o filtro "Downloadable + CC0" e **verifique a licença** de cada página.

---

## 4. Ambiente

### 4.1 HDRIs (Poly Haven, CC0)

Lista conferida na API pública da Poly Haven (`api.polyhaven.com`). Todas são **CC0** e podem ser redistribuídas.

| HDRI | URL | Uso |
| --- | --- | --- |
| Warm Bar | https://polyhaven.com/a/warm_bar | IBL e reflexos do **interior** do bar (âmbar, luz artificial) |
| Warm Restaurant Night | https://polyhaven.com/a/warm_restaurant_night | Alternativa de IBL interno, mais neutra |
| Street Lamp | https://polyhaven.com/a/street_lamp | Calçada do boteco à noite, com luz de poste |
| Preller Drive | https://polyhaven.com/a/preller_drive | Rua residencial noturna, para o delivery no bairro |
| Cobblestone Street Night | https://polyhaven.com/a/cobblestone_street_night | Rua de paralelepípedo noturna |
| Courtyard Night | https://polyhaven.com/a/courtyard_night | Quintal ou área dos fundos |
| Rooftop Night | https://polyhaven.com/a/rooftop_night | Transição entre crepúsculo e noite urbana (laje) |
| Stuttgart Suburbs | https://polyhaven.com/a/stuttgart_suburbs | Fim de tarde no subúrbio, para entregas no começo da noite |
| Qwantani Moonrise (Pure Sky) | https://polyhaven.com/a/qwantani_moonrise_puresky | Céu de crepúsculo sem horizonte, para o skybox |
| Kloppenheim 02 (Pure Sky) | https://polyhaven.com/a/kloppenheim_02_puresky | Céu estrelado limpo, para o skybox da madrugada |
| Satara Night | https://polyhaven.com/a/satara_night | Noite aberta, com poucas luzes |

Notas de uso:

- baixe em **1K ou 2K** HDR. Para o PS2 estilizado, o skybox pode ser um cubemap de 512² e o IBL um env atlas pré-filtrado (gerado com o [texture-tool](https://github.com/playcanvas/texture-tool) da PlayCanvas ou com `EnvLighting` no build);
- prefira HDRIs **pure sky** para o skybox (sem prédios europeus no horizonte) e componha o horizonte com a geometria do bairro;
- variações de hora do dia trocam o env atlas e a cor da fog. Não troque o HDRI em tempo real em celular.

### 4.2 Texturas PBR

| Fonte | URL | Licença | Busca sugerida | Uso |
| --- | --- | --- | --- | --- |
| ambientCG | https://ambientcg.com | CC0 | `Tiles` (azulejo de cozinha e balcão), `Wood` (balcão, mesas), `Plaster` (reboco e chapisco), `Bricks` (tijolo exposto), `Concrete`, `Asphalt`, `PavingStones`, `RoofingTiles` (telha), `Metal` (porta de enrolar), `Fabric` (feltro do poker) | Superfícies do bar e do bairro |
| Poly Haven Textures | https://polyhaven.com/textures | CC0 | `asphalt`, `cobblestone`, `concrete wall`, `plaster`, `wood floor` | Complemento com scans de alta qualidade |

Para o visual PS2: reduza para **256²–512²**, use principalmente albedo (com AO assado) e normal só nas peças "hero". Descarte roughness e metalness separados (ou empacote em ORM). Aplique filtro de cor quente no interior e frio no exterior.

### 4.3 Fog e volumetria

- Use a fog nativa da cena do PlayCanvas (linear ou exponencial; confira a API de fog da 2.23). Ela marca o limite do mapa de delivery e esconde o pop-in do LOD. A cor da fog acompanha o HDRI da hora do dia.
- **Sem volumetria real no celular.** Simule fachos de luz (poste, TV, palco) com *light cards*: quads com gradiente aditivo, `depthWrite` desligado e fade pela distância à câmera.
- A fumaça de cigarro e de churrasqueira usa o emissor de partículas com sprites do Kenney Particle Pack, no máximo 32 partículas por emissor e emissores distantes desligados.
- Bloom baixo, emissivos limitados ao neon e à TV, e tone mapping estável, como manda [auditoria/08-UI-UX-E-RENDERIZACAO.md](../auditoria/08-UI-UX-E-RENDERIZACAO.md).

---

## 5. Áudio

| Som | Fonte | URL | Licença | Uso exato | Alerta |
| --- | --- | --- | --- | --- | --- |
| Ambiente de bar e murmúrio | Freesound | https://freesound.org | Por arquivo: filtrar **CC0** | Loop de fundo do interior (conversa, risadas, talheres), em 2 ou 3 camadas com crossfade | Busque `bar ambience`, `pub crowd`, `restaurant walla`. Gravações brasileiras: `boteco`, `botequim`, `bar Rio`, `feira`. CC-BY exige crédito. **Recuse CC-BY-NC e Sampling+.** |
| Tilintar de copo, abrir garrafa | Freesound + Kenney Impact Sounds | https://kenney.nl/assets/impact-sounds | CC0 (Kenney). Freesound por arquivo. | Brinde, copo no balcão, abridor de tampinha | — |
| Chiado de grelha e carvão | Freesound / Sonniss GDC | https://sonniss.com/gameaudiogdc | Sonniss: royalty-free, comercial, sem crédito. **Sem redistribuir o bruto** e sem uso para treinar IA. | Loop 3D na churrasqueira (`AUDIO_` marker) | Arquivos originais da Sonniss ficam **fora do repositório público**. Só o áudio convertido vai no build. Confira a licença do ano do bundle. |
| Moto (motor em loop) | Sonniss GDC (bundles de veículos) / Freesound CC0 | https://sonniss.com/gameaudiogdc | Ver acima | Três loops (marcha lenta, média, alta) com *pitch* e volume pela velocidade | Busque `motorcycle idle loop`, `scooter engine`. Loops precisam de ponto de corte sem clique. |
| Cartas e fichas de poker | Kenney Casino Audio | https://kenney.nl/assets/casino-audio | CC0 | 23 sons de cartas, 19 de fichas e 12 de dados | Já vem em OGG |
| Notificação de celular e UI | Kenney Interface Sounds / UI Audio | https://kenney.nl/assets/interface-sounds · https://kenney.nl/assets/ui-audio | CC0 | Notificação, pedido de delivery, clique, abrir e fechar painel | Para um "plim" próprio, use o [jsfxr](https://sfxr.me) (o resultado é seu) |
| Música da jukebox | Composição própria ou encomendada (samba, pagode, forró, brega) | — | Contrato de cessão | Faixas da jukebox | **Nunca usar músicas comerciais.** Incompetech (https://incompetech.com) é **CC-BY**, com crédito. Pixabay Music tem licença própria que proíbe redistribuir o arquivo: **verificar licença**. |

Publicação: converta para Opus/AAC com ffmpeg, normalize o loudness (cerca de −16 LUFS para ambiente e −14 para efeitos), use loops com crossfade e registre tudo no manifest.

---

## 6. UI

| Asset | URL | Licença | Uso | Alerta |
| --- | --- | --- | --- | --- |
| Phosphor Icons | https://phosphoricons.com | MIT | Ícones do HUD de necessidades, inventário e admin (pesos *duotone* e *fill* combinam com o visual "letreiro") | Manter o `LICENSE` no build |
| Lucide | https://lucide.dev | ISC | Alternativa de traço fino para menus e configurações | Manter o `LICENSE` |
| Tabler Icons | https://tabler.io/icons | MIT | Conjunto grande (mais de 5.000), bom para ícones de nicho (moto, churrasco, cartas) | Manter o `LICENSE` |
| Kenney UI Pack | https://kenney.nl/assets/ui-pack | CC0 | Botões, painéis, sliders, molduras | — |
| Kenney Game Icons / Input Prompts | https://kenney.nl/assets/game-icons · https://kenney.nl/assets/input-prompts | CC0 | Teclas e botões de interação ("E — Sentar") | — |
| game-icons.net | https://game-icons.net | **CC-BY 3.0** | Ícones temáticos (garrafa, cigarro, cartas) | Crédito obrigatório por autor |

Fontes (Google Fonts, **OFL**, todas com á, ã, â, ç, é, ê, í, ó, õ, ô, ú):

| Fonte | Uso |
| --- | --- |
| Inter ou Nunito | Texto de interface, chat, inventário (legível em tela pequena) |
| Alfa Slab One ou Bungee | Títulos e letreiros, no estilo da placa pintada de boteco |
| Pacifico ou Lobster | Detalhe manuscrito em cardápio e no "Fiado só amanhã" (uso pontual) |
| JetBrains Mono | Painel admin e debug |

Hospede as fontes no próprio servidor via [Fontsource](https://fontsource.org) (`@fontsource/inter` etc.) em vez da CDN do Google. Assim você evita a requisição a terceiros (tema de LGPD e GDPR) e o FOUT. Use o subset `latin` + `latin-ext` e mantenha o `OFL.txt` no build.

---

## 7. Pipeline recomendado

```text
Fonte (FBX/BVH/blend/glTF)
  └─ Blender LTS: limpeza, escala 1 m, +Y up, pivôs aplicados, retarget (Rokoko) para o canônico
       └─ Export glTF 2.0 (.glb): só deform bones, 1 action = 1 clipe, sample 30 fps
            └─ gltf-transform (CI, versão fixada)
                 ├─ validate (Khronos glTF Validator: zero erros)
                 ├─ dedup, prune, weld, resample (animação)
                 ├─ simplify (gerar LOD1/LOD2)
                 ├─ meshopt (EXT_meshopt_compression + quantização)
                 └─ etc1s (albedo/ORM) e uastc (normal) → KTX2 (KHR_texture_basisu)
                      └─ manifest (hash, licença, budget) → publicação atômica
```

Comandos de referência ([glTF Transform CLI](https://gltf-transform.dev/cli); o KTX2 exige o `toktx` do [KTX-Software](https://github.com/KhronosGroup/KTX-Software) no PATH):

```bash
npx @gltf-transform/cli validate in.glb
npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress ktx2
# controle fino:
npx @gltf-transform/cli etc1s in.glb tmp.glb --slots "{baseColorTexture,occlusionTexture}"
npx @gltf-transform/cli uastc tmp.glb tmp2.glb --slots "normalTexture"
npx @gltf-transform/cli meshopt tmp2.glb out.glb
```

No PlayCanvas, registre o decoder meshopt e o transcoder Basis (WASM) antes de carregar os containers, conforme a documentação do engine 2.23. Teste o fallback quando o dispositivo não tiver um formato comprimido nativo.

### Budgets iniciais (validar com medição em desktop modesto e em dois celulares)

| Item | LOD0 | LOD1 | LOD2 | Texturas | Draw calls |
| --- | --- | --- | --- | --- | --- |
| Avatar (corpo + roupas) | 6–10 mil tris | cerca de 3 mil | cerca de 1 mil (ou impostor) | Atlas de 1024² (512² no celular), no máximo 2 materiais | No máximo 8 (meta: 3) |
| Esqueleto | No máximo cerca de 70 ossos, 4 influências | — | Animação em frequência menor ao longe | — | — |
| Prop de mão (copo, cigarro, celular) | 12–300 tris | — | — | 128²–256² ou atlas compartilhado | Instanciado |
| Mobiliário (mesa, cadeira) | 300–1.500 tris | 50% | — | 256²–512² | Instancing obrigatório |
| Moto | 1,5–3 mil tris | cerca de 800 | — | 512² | No máximo 3 |
| Peça de cidade (Kenney/KayKit) | 50–800 tris | — | — | Atlas único | Batch e instancing por tipo |
| Cena estática do bar | — | — | — | Hero 2K, resto 1K/512 | No máximo 100 |
| Total no celular, por frame | — | — | — | No máximo cerca de 256 MB de VRAM | **No máximo cerca de 150–200** |

Tamanho transferido: entrada comprimida de no máximo 25 MiB, mapa essencial de no máximo 12 MiB e avatar remoto de no máximo 2 MiB (metas de [auditoria/05-PIPELINE-ASSETS.md](../auditoria/05-PIPELINE-ASSETS.md)). Um clipe de animação reamostrado e comprimido com meshopt deve ficar abaixo de cerca de 50 KB.

---

## 8. Ordem sugerida de aquisição

1. **Esqueleto canônico** (UE5 naming) + Rokoko Retarget + Quaternius UAL. Isso fecha a locomoção CC0.
2. **Bake-off de corpo base** (KayKit como referência, MPFB como matéria-prima), com aprovação visual explícita.
3. **Clipes de estilo** do Mixamo (bêbado, idoso, gingado, feminino), com o FBX bruto guardado em armazenamento privado.
4. **Props do boteco**: monobloco, banquetas, mesas e engradado da Poly Haven; garrafa, copo americano, cigarro e celular modelados internamente.
5. **Áudio**: Kenney (UI, cassino, impacto) + Freesound CC0 para o ambiente.
6. **Delivery**: Kenney City Kits ou KayKit City Builder Bits + moto e bag próprias + postes da Poly Haven.
7. **Ambiente**: Warm Bar + Street Lamp + Pure Sky, e texturas do ambientCG reduzidas.

## Fontes da verificação

- Ready Player Me encerrado: https://avatarsdk.com/blog/2026/08/31/avatar-platforms-2026-whos-alive-whos-gone/ · https://genies.com/blog/ready-player-me-shutdown
- Licença Poly Haven: https://polyhaven.com/license
- Quaternius UAL (CC0): https://quaternius.com/packs/universalanimationlibrary.html
- Kenney City Kit Suburban (CC0): https://kenney.nl/assets/city-kit-suburban
- KayKit City Builder Bits (CC0): https://kaylousberg.itch.io/city-builder-bits
- Kenney Food Kit (CC0): https://kenney-assets.itch.io/food-kit
- Kenney Casino Audio (CC0): https://opengameart.org/node/12742
- Mixamo (FAQ e situação em 2026): https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html · https://app.cinevva.com/guides/free-character-animations-rigging
- Cascadeur (planos): https://cascadeur.com/blog/general/cascadeurs-new-licensing-structure-comprehensive-faq
- CMU Mocap: http://mocap.cs.cmu.edu · https://paperswithcode.com/dataset/cmu-motion-capture
- Rokoko Motion Library: https://www.cgchannel.com/2020/03/get-150-free-mocap-moves-from-rokokos-motion-library
- AccuRig 2: https://www.cgchannel.com/?p=168596
- Sonniss GDC: https://sonniss.com/gameaudiogdc · https://rekkerd.org/sonniss-releases-gdc-2026-game-audio-bundle/
