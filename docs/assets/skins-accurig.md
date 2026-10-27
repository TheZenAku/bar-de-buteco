# Skins AccuRig: Leandro, Read e Magrão

Três skins usam rigs AccuRig (ossos `CC_Base_*`), cada uma em sua pasta de `assets-bar`:

| Skin | FBX | Texturas | Uso |
| --- | --- | --- | --- |
| Leandro | `leandro/Meshy_AI_Green_Screen_T_Pose_Man_20261021_texture.fbx` | `leandro/` | Seletor (C) |
| Read | `read/read.fbx` | `read/read.fbm/` | Seletor (C) |
| Magrão | `magrao/magrao.fbx` | `magrao/magrao.fbm/` | Seu Zé, o bartender; não aparece no seletor |

`npm run assets:skins` executa `tools/assets/import-skins.mjs` (todas as skins, ou só as indicadas: `node tools/assets/import-skins.mjs read`) e depois `tools/assets/convert-animations.mjs`. Para acrescentar outra skin AccuRig, inclua-a na tabela do importador e na lista do conversor; skins de jogadores também entram em `SKINS` (`packages/shared/src/index.ts`) com uma miniatura 240×320 em `apps/web/public/skins`. O rig do Read não tem os dedos médio, anelar e mínimo; o copo fica preso ao indicador.

## Leandro

O FBX atualizado em `assets-bar/leandro/Meshy_AI_Green_Screen_T_Pose_Man_20261021_texture.fbx` substitui o modelo que antes recebia um esqueleto estimado a partir do Nathan. O jogo preserva agora o rig AccuRig do arquivo, incluindo ossos auxiliares, matrizes de bind e pesos: 101 nós de osso na hierarquia, dos quais 100 fazem parte da skin da malha.

O importador converte centímetros/Z-up para metros/Y-up, normaliza a altura de bind para 1,86 m e mantém a raiz da instância com escala um. As juntas recebem aliases canônicos para as interações do renderizador; o nome original continua em `extras.sourceBone`. O FBX permanece intacto.

A geometria mantém os atributos de skin e os vértices coincidentes com atributos iguais são indexados. O FBX possui vértices com mais de quatro influências: o loader conserva as quatro de maior peso, e o importador normaliza sua soma antes de exportar, conforme o limite de skin usado pelo jogo. As curvas sem uso e o aviso de geometria compartilhada do exportador FBX não impedem a importação da malha ponderada; a saída exige uma malha com skin e foi conferida visualmente.

`Material_001_Diffuse.jpg` e `Material_001_Normal.jpg`, referenciadas pelo novo material, são incorporadas no GLB. Os UVs são convertidos para a convenção de imagens glTF. O modelo final é `apps/web/public/models/leandro.glb` (aproximadamente 8,33 MiB), maior que a versão anterior por preservar a nova geometria e suas texturas.

Idle, Walk, Pose e as ações usam a mesma [calibração pelas direções dos membros](native-rigs.md), com tratamento dos ossos auxiliares e respeito às poses de origem diferentes. As ações ficam em `apps/web/public/animations/leandro.glb`; o renderizador carrega esse banco para Leandro. O quadril mantém a altura proporcional ao novo corpo e as poses sentadas usam o alinhamento existente às cadeiras. O chute continua exclusivo do Rafael.

A importação foi verificada no PlayCanvas com Idle, Walk, dança, bebida e pose de blackjack. O teste de integração verifica juntas, nomes de origem, pesos normalizados, materiais incorporados e validade das rotações de todos os bancos. O teste de navegador verifica o novo Leandro em dois clientes, incluindo escala, caminhada, dança e retorno a Idle.

Em 21/10/2026, os dois testes de integração de animações passaram, assim como typecheck/build e o teste de navegador com dois clientes (que também verifica as outras skins e o chute exclusivo do Rafael). [Prévia do Leandro atualizado no jogo](../previews/leandro-accurig.png).
