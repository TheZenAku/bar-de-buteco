# Animações nos esqueletos dos personagens

Cada personagem tem o próprio esqueleto Mixamo, auto-rigado no próprio corpo (veja [skins Mixamo](skins-mixamo.md)); o Nathan mantém o rig original. Todos usam os mesmos nomes canônicos de juntas (`hip`, `spine_01`, `upperarm_l`...). Compartilhamos os movimentos de origem; cada modelo recebe clipes adaptados ao seu esqueleto.

Para investigar deformações e transições, use o [diagnóstico de rigs](rig-troubleshooting.md), com a tela de inspeção e o fluxo para corrigir uma skin por vez.

| Modelo | Esqueleto | Juntas da malha | Pesos |
| --- | --- | --- | --- |
| Nathan | Nathan | 88 | Originais |
| Rafael | Mixamo | 34 | Do Mixamo |
| Leandro | Mixamo | 41 | Transferidos do rig AccuRig anterior |
| Read | Mixamo | 41 | Transferidos do rig AccuRig anterior |
| Magrão / Seu Zé | Mixamo | 41 | Transferidos do rig AccuRig anterior |
| Gilmar | Mixamo | 41 | Automáticos |

## Adaptação

`tools/assets/lib/animation-retarget.mjs` mede as direções reais dos membros de cada modelo e calcula uma referência virtual compatível com a animação; a pose de bind do modelo continua intacta. Com todos os personagens em T-pose Mixamo, os clipes Mixamo do pacote `misc` passam praticamente sem correção, e os clipes do Nathan (bebida, cartas, karatê, bartender) são alinhados pelos membros. Mãos e dedos conservam seus eixos; rosto e solas conservam a orientação neutra.

O renderizador usa os clipes do próprio modelo e o banco `animations/<id>.glb`.

## Regerar

Na raiz do projeto:

```powershell
# Reimportar todas as skins nos esqueletos Mixamo e gerar os bancos:
npm.cmd run assets:skins

# Recalibrar Idle/Walk/Pose dos modelos existentes e todos os bancos, sem reimportar geometria:
npm.cmd run assets:retarget

# Apenas os bancos de ações e as bengalas:
npm.cmd run assets:animations
```

Os scripts aceitam IDs específicos, por exemplo `node tools/assets/import-mixamo.mjs gilmar-gordo` e `node tools/assets/convert-animations.mjs gilmar-gordo`. Repetir a calibração não acumula dados de animação.

## Validação

`tests/tools/retarget.test.mjs` confere as skins em caminhada, repouso, dança, bebida e assentos: direção dos membros, comprimento dos ossos, preservação da hierarquia, matrizes de bind e repetibilidade. `tests/integration/animations.test.ts` confere esqueleto, pesos, normais, texturas, orçamento de triângulos e bancos.
