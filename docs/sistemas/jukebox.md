# Jukebox e TVs

A jukebox e as TVs são **sistemas independentes**. Cada um tem seu próprio objeto no cenário, sua janela de controle, seu link do YouTube, seu estado compartilhado, suas mensagens de rede, seu player e seu volume. Tocar, pausar, parar ou desligar um nunca altera o outro, e cada um funciona mesmo que o outro nunca tenha sido usado.

| | Jukebox | TVs |
| --- | --- | --- |
| Objeto | Jukebox do salão, em `(12.3, 0.3, -10.3)` | As 4 TVs do mapa: salão, parede lateral, balcão e andar de cima |
| Interação | Encostar na frente da jukebox e apertar **E** (*Tocar a jukebox*) | Ficar no chão diante da tela e apertar **E** (*Usar a TV…*) |
| Imagem | Card do player no canto da tela | Na **tela física da TV**, com perspectiva; card no canto quando a tela não está visível |
| Som | Pela distância até a jukebox (cheio até 5 m, mudo a partir de 20 m) | Pela distância até a TV usada (cheio até 3 m, mudo a partir de 14 m) |
| Estado na sala | `BarState.jukeboxes` | `BarState.televisions` (um por TV) |
| Mensagens | `jukebox.command`, `jukebox.ended`, `jukebox.open`, `jukebox.result` | `tv.command`, `tv.ended`, `tv.open`, `tv.result` |
| Volume pessoal | Configurações → *Jukebox* (`bar:jukebox:volume`) | Configurações → *TVs* (`bar:tv:volume`) |

Antes, a jukebox tocava sempre na TV do salão, com um único player para os dois. Essa ligação foi removida: `JUKEBOX_SYSTEMS` não tem TV (`tvId` vazio) e `TV_SYSTEMS` tem uma entrada por TV, cada uma ligada apenas à sua tela.

## Código

- `packages/shared/src/jukebox.ts`: `JUKEBOX_SYSTEMS`, `TV_SYSTEMS`, curvas de volume (`JUKEBOX_AUDIO`, `TV_AUDIO`), validação de links, linha do tempo e redução de comandos (*compare-and-swap*). As funções são compartilhadas; o estado não.
- `packages/shared/src/world.ts`: interações. O ponto de uso de cada TV é o primeiro ponto livre do chão diante da tela (`TV_SPOTS`); a TV do balcão é usada pelo corredor entre a parede e o balcão.
- `apps/server/src/BarRoom.ts`: um par de handlers por tipo, cada um com seu mapa de estado; `requireMedia` confere a distância até o aparelho certo.
- `apps/web/src/jukebox.ts`: `MediaController` com duas instâncias, `JukeboxController` e `TelevisionController`. Cada uma tem seus players, painéis (IDs `#jukebox-*` e `#tv-*`), mensagens e volume.
- `apps/web/src/engine/television-surface.ts`: projeção do player na tela da TV.

## Player e tela da TV

Cada fonte ativa tem **um** `YT.Player` oficial, que é reutilizado ao trocar de vídeo. Fechar a janela de controle não destrói o player nem interrompe a reprodução; desligar, sair do bar ou remover a fonte destrói o player e limpa timers e iframe.

O vídeo da TV não é uma textura WebGL. A tela recebe um plano que "abre" o canvas (alpha zero, com teste de profundidade), e o iframe atrás dele recebe uma transformação projetiva CSS calculada a partir dos quatro cantos da tela pela câmera real. O vídeo fica na superfície da TV, com posição, tamanho, orientação e perspectiva corretos, e é escondido pelo que estiver na frente. **Assistir na TV**, no painel da TV, aproxima a câmera daquela tela; ESC volta.

A API do YouTube exige um player visível de pelo menos 200 × 200 px. Quando a tela da TV está pequena demais, fora da câmera, atrás de paredes ou sob uma janela, o mesmo iframe passa para um card no canto. A jukebox, que não tem tela, sempre usa o card. Com mais de uma fonte ativa, os cards se empilham. Reprodução invisível e separação do áudio contrariam as [políticas do YouTube](https://developers.google.com/youtube/terms/developer-policies) (seções III.I.7 e III.I.9).

## Som

O volume de cada fonte é calculado pela distância do personagem local, incluindo a altura, **até aquela fonte**: a jukebox pela posição da jukebox, cada TV pela posição da própria tela. Há suavização de 0,25 s, silêncio total fora do alcance e o volume geral das configurações por cima. O som ambiente baixa enquanto a jukebox ou uma TV estiver em uso.

**Limitação:** isto é atenuação por distância, não posicionamento estéreo (esquerda/direita). O áudio de um iframe do YouTube não pode ser ligado ao Web Audio (`PannerNode`). O navegador não expõe esse som à página e a política do YouTube proíbe extraí-lo. O chat de voz, que é áudio do próprio jogo, é posicional.

## Multiplayer

Os estados são públicos na sala, inclusive para quem chega depois. São efêmeros como o resto do mundo: reiniciar o servidor desliga a jukebox e as TVs. Cada comando leva a revisão que o jogador viu; uma revisão antiga é recusada (*Outra pessoa alterou a reprodução*), o que evita duas pessoas sobrescreverem uma à outra. São quatro comandos por segundo por tipo e por jogador. Os links aceitos são só os de `youtube.com`, `www.youtube.com`, `m.youtube.com` e `youtu.be`. O fim de um vídeo só é aceito se vier de quem o pôs para tocar, com revisão, vídeo e tempo coerentes.

O estado compartilhado representa a intenção do bar; o painel mostra à parte o que acontece **neste navegador** (carregando, reproduzindo, bloqueado pelo autoplay, erro). Quando o navegador pede um clique, use **Ativar reprodução neste navegador** ou o botão **Ativar** do card.

## Testes

- `tests/integration/jukebox.test.ts`: links, linha do tempo, curva de volume e independência das definições (a jukebox sem TV; cada TV só com a sua tela).
- `apps/server/test/jukebox.integration.test.ts`: conexões reais. Proximidade, entrada tardia, revisões conflitantes e, para as TVs, distância própria, tocar e pausar a TV sem mudar a jukebox, demais TVs desligadas e um id de jukebox recusado pelos comandos de TV.
- `tests/e2e/jukebox.spec.ts` (projeto `media`):
  - **YouTube real:** a jukebox toca no card sem tela; a TV do salão toca outro vídeo na tela física, em perspectiva; pausar e desligar a TV deixam a jukebox tocando; dois ouvintes com volumes diferentes.
  - **Dublê da API:** erros, autoplay, limites de volume, distância, troca rápida e encerramento.
  - **API inacessível:** falha de conexão e nova tentativa limpa.

Capturas: [TV](../previews/jukebox-tv.png), [TV em perspectiva](../previews/jukebox-tv-angle.png) e [controles da jukebox](../previews/jukebox-controls.png).
