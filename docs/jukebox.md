# Jukebox e TV do salão

## Arquitetura e integração

O cliente existente usa TypeScript, DOM/Vite 8 e PlayCanvas 2.23.3. O mapa é um container GLB, os avatares usam previsão e reconciliação e o servidor Colyseus 0.18 valida movimento e interações. A API Fastify/PostgreSQL continua cuidando das contas. Este recurso reutiliza esses sistemas; não adiciona servidor, banco, dependência npm, serviço pago ou chave de API.

A jukebox já existia em `(12.3, 0.3, -10.3)`, com colisor próprio. Sua antiga interação apenas forçava uma dança. Agora `E` solicita a abertura dos controles; o servidor verifica distância, andar, paredes e ausência de outra interação. A janela usa o modal do jogo e bloqueia movimento. Fechar/ESC restaura os controles e preserva o player.

O GLB contém **quatro TVs**, com telas de aproximadamente `1.06 × 0.60 m`. As telas usam o material `Tela_TV`, reunidas nos meshes de mobília dos dois pavimentos; não são entidades independentes. Foram medidas diretamente dos vértices do GLB. O mapa, seus materiais, móveis e colisores não foram substituídos.

`JUKEBOX_SYSTEMS` associa o ID estável `jukebox` a `tv-hall`, a TV do fundo do salão, centro `(7.3, 2.33, -11.447)`. `TELEVISIONS` registra também `tv-left`, `tv-counter` e `tv-upstairs`, preservadas sem conteúdo. A associação e o estado são por ID, preparados para novos conjuntos. Ao adicionar outra jukebox, cadastre também seu objeto interativo/colisor; não basta duplicar o player no cliente.

## Player e superfície da TV

Um único `YT.Player` oficial reproduz imagem e som por conjunto ativo. A API é carregada sob demanda, com timeout e tentativa explícita posterior. Trocar vídeo reutiliza a instância; fechar a janela de controle não a destrói. O iframe permanece no mesmo pai DOM: mudar entre TV e painel altera apenas CSS, pois reparentar um iframe reinicia seu contexto no navegador. Desligar, sair do bar ou remover o conjunto destrói o player, limpa timers e remove o iframe.

O iframe **não é uma textura WebGL**. A tela recebe um plano com material GLSL que escreve alpha zero e participa do teste de profundidade. O canvas WebGL possui alpha. Atrás dele, o iframe recebe uma transformação projetiva CSS `matrix3d` calculada dos quatro cantos da tela pela câmera real. Assim, o vídeo fica limitado à superfície original, acompanha posição, orientação e perspectiva e pode ser ocultado pela geometria desenhada à frente. Não há leitura dos pixels do YouTube, captura de mídia nem extração de áudio/vídeo.

O player mantém proporção, controles, identificação e links do YouTube. Ao passar o ponteiro sobre a superfície projetada, o canvas libera o mouse para os controles oficiais. **Assistir na TV** aproxima somente a câmera da TV, mantém o personagem no lugar e permite voltar com o botão ou ESC. O movimento fica bloqueado nessa visão.

### Compromissos necessários

A [API oficial](https://developers.google.com/youtube/iframe_api_reference) exige viewport mínimo de 200 × 200 px. Como as TVs originais são pequenas, quando a projeção está menor que isso, fora da câmera, atrás de paredes ou coberta pelo modal, **o mesmo iframe é movido para um painel visível**. Ele não é copiado e não reinicia. Nesse caso a TV do cenário permanece escura; o vídeo real aparece no painel. Ao recuperar uma projeção adequada, volta à superfície. A visão **Assistir na TV** permite ver a reprodução na própria tela do modelo.

Essa alternativa é explícita: reprodução invisível de fundo e separação do áudio são incompatíveis com as [políticas do YouTube, seções III.I.7 e III.I.9](https://developers.google.com/youtube/terms/developer-policies). A aba oculta e a desconexão suspendem a reprodução local; ao retornar, o player reposiciona pela linha do tempo da sala. Fechar somente os controles da jukebox não suspende a reprodução.

A oclusão exata depende do buffer de profundidade para superfícies opacas. Paredes são verificadas também pelos colisores para escolher o painel visível. Transparências do cenário e sobreposição de avatares podem produzir diferenças breves de composição. Navegador/driver precisam de aceleração WebGL e suporte a transforms CSS 3D.

## Som por distância

`jukeboxGain` calcula a distância **do personagem local**, incluindo altura, até a fonte da jukebox. O volume é individual, salvo neste navegador, limitado a 0–100%. A curva suave usa os parâmetros de `JUKEBOX_AUDIO`:

| Distância | Ganho antes do volume pessoal |
| --- | --- |
| Até 5 m | 100% |
| 5–15 m | Redução suave até 7% |
| 15–20 m | Redução suave até zero |
| 20 m ou mais | Silêncio |

A aproximação usa suavização temporal de 0,25 s. Sair do alcance, silenciar ou desconectar aplica zero imediatamente. Afastar-se não interrompe a linha do tempo compartilhada. A música procedural antiga fica suprimida enquanto o vídeo está carregando/reproduzindo, evitando sobreposição musical.

Isto é **atenuação de volume por distância**, não espacialização estéreo, reverberação ou isolamento por parede. O áudio do iframe não pode ser conectado a um `PannerNode` Web Audio. Imagem e áudio vêm da mesma instância; não existem dois players sincronizados artificialmente.

## Estado e multiplayer

O mapa público `BarState.jukeboxes` sincroniza `id`, `tvId`, `videoId`, `status`, `position`, `updatedAt`, `updatedBy` e `revision` para toda a sala, inclusive fora do AOI dos avatares. Quem chega depois recebe o mesmo estado. Esses dados são efêmeros, como eventos e movimento: reiniciar o servidor desliga a TV. Contas e carteiras não são alteradas.

Mensagens:

| Mensagem | Uso |
| --- | --- |
| `player.interact {objectId}` | Interação existente; o servidor responde `jukebox.open {id}` |
| `jukebox.command {id, revision, action, url?}` | `play`, `pause`, `resume`, `stop`, `off`; servidor valida schema, proximidade e revisão |
| `jukebox.result {id, revision}` | Confirmação; os controles acompanham o patch autoritativo |
| `jukebox.ended {id, revision, videoId, duration}` | Aviso do controlador atual, aceito somente se revisão, vídeo e tempo forem coerentes |

Comandos são limitados a quatro por segundo por jogador. Compare-and-swap rejeita alterações concorrentes sobre uma revisão antiga. A URL só é aceita dos hosts exatos `youtube.com`, `www.youtube.com`, `m.youtube.com` e `youtu.be`, nas rotas `watch`, `shorts`, `embed` e link curto. Credenciais, portas alternativas, IDs inválidos, hosts parecidos e parâmetros `v` duplicados são recusados. Nenhuma URL recebida vira HTML executável, endpoint arbitrário ou download no servidor.

`position` mais o relógio do servidor fornece a linha do tempo aproximada. Pausar fixa a posição; continuar retoma; parar volta ao início; desligar limpa o conteúdo. O cliente corrige diferenças maiores que três segundos, no máximo a cada dez segundos durante reprodução, sem buscar continuamente durante buffering. Carregamento, anúncios, ao vivo, restrições regionais e autoplay impedem garantia de sincronia perfeita. Streams ao vivo não têm uma linha do tempo VOD determinística.

O status compartilhado representa a **intenção do bar**. A interface mostra separadamente o estado real **neste navegador**, derivado dos eventos do player: carregando, reproduzindo, pausado, bloqueado, erro ou encerrado. Um problema regional de um jogador não desliga o vídeo para todos. Um fim reportado pelo controlador fora da tolerância de oito segundos não encerra a sala; cada player ainda trata seu próprio fim. Não há confiança em duração informada por qualquer cliente para agendar automaticamente o término global.

O navegador pode exigir um clique local: use **Ativar reprodução neste navegador**, **Ativar TV** ou o controle oficial. Erros 100, 101/150, 153 e demais falhas têm mensagens distintas e tentativa explícita de nova conexão. A disponibilidade é confirmada pelo player, não apenas pelo formato da URL. O servidor de produção já usa `Referrer-Policy: strict-origin-when-cross-origin`; não troque por `no-referrer` nem bloqueie o YouTube em CSP/Permissions-Policy.

## Arquivos

Criados:

- `packages/shared/src/jukebox.ts`: configuração, contratos, URLs, timeline, redução de estado e curva de volume.
- `apps/web/src/youtube-player.ts`: carregador e contrato da API oficial, tradução de erros.
- `apps/web/src/jukebox.ts`: ciclo de vida, player, sincronização, áudio pessoal e janela de controle.
- `apps/web/src/engine/television-surface.ts`: projeção e abertura com profundidade na tela.
- `apps/web/src/jukebox.css`: controles, painel alternativo e visão da TV.
- `apps/server/test/jukebox.integration.test.ts`, `tests/integration/jukebox.test.ts`, `tests/e2e/jukebox.spec.ts`: contratos, WebSocket real, navegador real e falhas controladas.
- `tests/fixtures/youtube.html`, `jukebox-controller.html`, `youtube-api-mock.js`: diagnóstico real e dublê determinístico apenas nos testes, sem inclusão no build de produção.
- Este documento e imagens em `docs/previews/jukebox-*.png`.

Modificados:

- `packages/shared/src/index.ts` e `world.ts`: exportação do contrato e margem configurável da interação com jukebox.
- `apps/server/src/state.ts` e `BarRoom.ts`: estado Colyseus, validação, abertura e comandos.
- `apps/web/src/main.ts`, `networking.ts`, `audio.ts` e `engine/BarScene.ts`: integração com modal, controles, sessão, renderer e supressão da trilha procedural.
- `playwright.config.ts`: projeto de testes `media`, com serviços/banco isolados existentes.
- `README.md`: acesso à documentação e instruções.

## Como testar no jogo

1. Abra o jogo, entre no bar e caminhe até a jukebox, no fundo do salão do térreo, à esquerda da escada.
2. Aproxime-se até aparecer **Tocar a jukebox** e pressione **E**.
3. Cole um link de vídeo, por exemplo `https://www.youtube.com/watch?v=M7lc1UVf-VE`, e clique em **Tocar**. Aguarde o estado local; se necessário clique em **Ativar reprodução neste navegador**.
4. Clique em **Assistir na TV**. A TV do fundo mostra o vídeo real. ESC retorna ao personagem; **E** reabre os controles.
5. Pause, continue, troque o link, pare e desligue. Fechar somente a janela mantém o player.
6. Abra outra conta em perfil/janela anônima. A seleção e os controles são compartilhados; o clique de autoplay e o volume são locais.
7. Afaste um personagem e compare o volume. Fora de 20 m ele deve ficar mudo, com o vídeo ainda no painel visível. Ao voltar, o som retorna.

## Validação

Consulte os resultados registrados ao final da implementação. O teste `real YouTube` não usa mock; os testes `API double` e `unreachable YouTube API` usam falhas controladas para cobrir situações que não podem depender de vídeos públicos removidos ou bloqueados.

Comandos: `npm run build`, `npm test`, `npx playwright test --project=media`. O navegador usa os serviços isolados 3111/2677/5273 e o banco de testes existente.
