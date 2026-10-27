# Jukebox e TVs

A jukebox e as TVs são **sistemas independentes**. Cada um tem seu próprio objeto no cenário, sua janela de controle, seu link do YouTube, seu estado compartilhado, suas mensagens de rede, seus players e seu volume. Tocar, pausar, parar ou desligar um nunca altera o outro, e cada um funciona mesmo que o outro nunca tenha sido usado.

| | Jukebox | TVs |
| --- | --- | --- |
| Objeto | Encostada na base da escada do térreo, virada para o salão, em `(15.7, 0.3, -11.33)` | Dois grupos: **TVs do salão** (salão, parede lateral e balcão) e **TV do andar de cima** |
| Interação | Encostar na frente da jukebox e apertar **E** (*Tocar a jukebox*) | Ficar no chão diante de qualquer tela do grupo e apertar **E** (*Usar a TV…*) |
| Imagem | Nenhuma: a jukebox só toca o som | Sempre na **tela física da TV**, com perspectiva. As três TVs do salão mostram o mesmo vídeo |
| Som | Pela distância até a jukebox (cheio até 5 m, mudo a partir de 20 m) | Pela distância até a TV do grupo mais próxima (cheio até 3 m, mudo a partir de 14 m) |
| Estado na sala | `BarState.jukeboxes` | `BarState.televisions`: `tv-main` e `tv-upstairs` |
| Mensagens | `jukebox.command`, `jukebox.ended`, `jukebox.open`, `jukebox.result` | `tv.command`, `tv.ended`, `tv.open`, `tv.result` |
| Volume pessoal | Configurações → *Jukebox* (`bar:jukebox:volume`) | Configurações → *TVs* (`bar:tv:volume`) |

A jukebox ficava solta no piso, na frente da entrada do corredor dos fundos. Agora está encostada na parede logo à direita da escada, sem tapar o corredor nem a subida.

## Código

- `packages/shared/src/jukebox.ts`: `JUKEBOX_PLACEMENT`, `JUKEBOX_SYSTEMS`, `TV_SYSTEMS` (cada grupo lista suas telas em `screens` e as posições do som em `sources`), curvas de volume (`JUKEBOX_AUDIO`, `TV_AUDIO`, `mediaGain`), validação de links, linha do tempo e redução de comandos (*compare-and-swap*). As funções são compartilhadas; o estado não.
- `packages/shared/src/world.ts`: interações. Há um objeto por tela, com `media` apontando para o grupo. O ponto de uso de cada TV é o primeiro ponto livre do chão diante da tela (`TV_SPOTS`); a TV do balcão é usada pelo corredor entre a parede e o balcão.
- `apps/server/src/BarRoom.ts`: um par de handlers por tipo, cada um com seu mapa de estado. `requireMedia` aceita o comando de quem estiver perto de qualquer tela do grupo, e `tv.open` abre o painel do grupo.
- `apps/web/src/jukebox.ts`: `MediaController` com duas instâncias, `JukeboxController` e `TelevisionController`. Cada uma tem seus players, painéis (IDs `#jukebox-*` e `#tv-*`), mensagens e volume.
- `apps/web/src/engine/television-surface.ts`: projeção do player na tela da TV.

## Player e tela da TV

Cada fonte ativa tem um `YT.Player` oficial por tela: um para cada TV do grupo e um, invisível, para a jukebox. Todos seguem a mesma linha do tempo compartilhada, e os players são reutilizados ao trocar de vídeo. A cada 5 s, uma tela que se afastou mais de 1,5 s da linha do tempo é corrigida. Fechar a janela de controle não destrói os players nem interrompe a reprodução; desligar, sair do bar ou remover a fonte destrói os players e limpa timers e iframes.

O vídeo da TV não é uma textura WebGL. A tela recebe um plano que "abre" o canvas (alpha zero, com teste de profundidade), e o iframe atrás dele recebe uma transformação projetiva CSS calculada a partir dos quatro cantos da tela pela câmera real. O vídeo fica na superfície da TV, com posição, tamanho, orientação e perspectiva corretos, e é escondido pelo que estiver na frente: paredes, móveis, pessoas, painéis e janelas.

O vídeo **nunca sai da TV**. Ele continua na tela quando ela fica pequena, quando sai parcialmente da câmera ou quando há algo na frente. Só deixa de ser desenhado quando a câmera vê a TV por trás, porque aí não há projeção possível. A reprodução continua nesse caso. **Assistir na TV**, no painel, aproxima a câmera da tela do grupo mais próxima; ESC volta.

O mouse só passa para o player do YouTube quando o ponteiro está sobre uma tela sem parede no caminho. Uma TV escondida atrás de uma parede não rouba o arraste da câmera.

**Atenção, políticas do YouTube.** A API pede um player visível de pelo menos 200 × 200 px, e as [políticas para desenvolvedores](https://developers.google.com/youtube/terms/developer-policies) (seções III.I.7 e III.I.9) proíbem reprodução invisível e separar o áudio do vídeo. A versão anterior respeitava isso com um card no canto. Este comportamento foi escolhido pelo produto: TVs pequenas ou fora da vista e a jukebox sem vídeo. Antes de publicar, revise o risco ou troque a fonte da jukebox por áudio próprio, com licença.

## Som

O volume de cada fonte é calculado pela distância do personagem local, incluindo a altura. A jukebox usa a distância até a jukebox. Um grupo de TVs usa a distância até a tela mais próxima, e só o player dessa tela fica com som; os outros ficam mudos, então o som não se repete nem ecoa. Para o som trocar de tela, a outra precisa estar pelo menos 1,5 m mais perto, o que evita que ele fique pulando de uma TV para outra entre duas telas. Há suavização de 0,25 s, silêncio total fora do alcance e o volume geral das configurações por cima. O som ambiente baixa enquanto a jukebox ou uma TV estiver em uso.

**Limitação:** isto é atenuação por distância, não posicionamento estéreo (esquerda/direita). O áudio de um iframe do YouTube não pode ser ligado ao Web Audio (`PannerNode`). O navegador não expõe esse som à página e a política do YouTube proíbe extraí-lo. O chat de voz, que é áudio do próprio jogo, é posicional.

## Multiplayer

Os estados são públicos na sala, inclusive para quem chega depois. São efêmeros como o resto do mundo: reiniciar o servidor desliga a jukebox e as TVs. Cada comando leva a revisão que o jogador viu; uma revisão antiga é recusada (*Outra pessoa alterou a reprodução*), o que evita duas pessoas sobrescreverem uma à outra. São quatro comandos por segundo por tipo e por jogador. Os links aceitos são só os de `youtube.com`, `www.youtube.com`, `m.youtube.com` e `youtu.be`. O fim de um vídeo só é aceito se vier de quem o pôs para tocar, com revisão, vídeo e tempo coerentes; num grupo, só o player com som informa o fim.

O estado compartilhado representa a intenção do bar; o painel mostra à parte o que acontece **neste navegador** (carregando, reproduzindo, bloqueado pelo autoplay, erro). Se o navegador bloquear o autoplay, qualquer clique ou tecla no jogo libera a reprodução; o painel também tem **Ativar reprodução neste navegador**.

## Testes

- `tests/integration/jukebox.test.ts`:
  - links, linha do tempo e curva de volume;
  - os grupos de TVs: as três telas do térreo num grupo e a de cima em outro, com o som vindo da tela mais próxima;
  - o lugar da jukebox: encostada na base da escada, sob o lance de cima, sem tapar corredor nem escada e com ponto de uso andável.
- `apps/server/test/jukebox.integration.test.ts`: conexões reais.
  - Proximidade, entrada tardia e revisões conflitantes.
  - Para as TVs: cada tela abre o painel do grupo, e outra tela do mesmo grupo controla o mesmo vídeo. A TV de cima não controla o térreo, e o estado da jukebox não muda.
- `tests/e2e/jukebox.spec.ts` (projeto `media`):
  - **YouTube real:** a jukebox toca só o som, sem card. As TVs do salão tocam outro vídeo nas três telas, com som só na mais próxima, e a tela física aparece em perspectiva. Pausar e desligar as TVs deixam a jukebox tocando. Dois ouvintes recebem volumes diferentes.
  - **Dublê da API:** erros, autoplay, limites de volume, distância, troca rápida e encerramento.
  - **API inacessível:** falha de conexão e nova tentativa limpa.

Capturas: [TV](../previews/jukebox-tv.png), [TV em perspectiva](../previews/jukebox-tv-angle.png) e [controles da jukebox](../previews/jukebox-controls.png).

## Telão do palco e preços

O **telão** (`telao` em `TELEVISIONS`) é um terceiro sistema de vídeo, independente das TVs: tela de 4,8 × 2,7 m entre os pilares do fundo do palco, controlada com **E** na frente do palco (`Ponto_Palco`) e com som que alcança o quintal todo (`TELAO_AUDIO`: cheio até 7 m, silêncio a 30 m). A moldura e os cabos são desenhados pela cena, porque o mapa não tem o objeto.

Escolher um vídeo novo custa moedas: 15 na jukebox, 25 nas TVs e 60 no telão. Pausar, continuar, parar e desligar são de graça. O servidor valida o comando antes de cobrar e estorna se ele falhar depois. Veja [economia](economia.md).
