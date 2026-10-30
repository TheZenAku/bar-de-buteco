# Celular

Cada jogador tem um celular no bolso, no estilo de um iPhone 18 Pro: moldura de titânio, Dynamic Island, widgets e dock em vidro líquido (iOS 26). **K** tira o celular do bolso e guarda de novo; **Esc** também guarda. Ele aparece no canto inferior direito e o mundo continua jogável: dá para andar com o celular na mão (as teclas só vão para o celular enquanto você digita num campo dele).

## Apps

| App | O que faz | Onde ficam os dados |
| --- | --- | --- |
| **Telefone** | Recentes, Contatos e Teclado. Liga (voz ou vídeo) para quem está na sua agenda ou para um número digitado | Ligação: sala do jogo. Recentes: este navegador |
| **Highzap** | Conversas de um para um com os seus contatos: texto, fotos, mensagens de voz, vídeos, tique de enviada e tique azul de lida, ligação e chamada de vídeo | API (`phone_messages`, `phone_media`) |
| **Highgram** | Perfil com nome, @usuário, bio e foto; seguir, buscar e sugestões de quem seguir; feed de quem você segue e Explorar com o bar inteiro; fotos com filtros, curtir (também com dois toques), comentar, apagar e denunciar | API (`gram_profiles`, `gram_follows`, `gram_posts`, `gram_likes`, `gram_comments`) |
| **Câmera** | Visor ao vivo do jogo, foto, vídeo (até 30 s, com o microfone), selfie e zoom de 1× a 8× | A foto e o vídeo vão para a galeria deste navegador |
| **Fotos** | Galeria de fotos e vídeos: postar no Highgram, mandar no Highzap, usar como fundo de tela, apagar | Este navegador (IndexedDB), até 60 itens por conta |
| **Mapas** | O bairro desenhado a partir dos colisores do mapa, você como seta, as pessoas que a sala mostra, lugares e mesas pesquisáveis | `@bar/shared` (sem rede) |
| **HighBank** | Saldo real, extrato do livro-caixa e Pix para um contato salvo ou para um número digitado | API (`wallets`, `currency_ledger`) |
| **Contatos** | A agenda (o mesmo conteúdo da aba Contatos do Telefone) | API (`phone_contacts`) |
| **Notas**, **Calendário** | Notas e eventos | Este navegador |
| **Relógio** | A hora do bar (o ciclo de 40 minutos), fusos do mundo e cronômetro | — |
| **Calculadora** | As quatro operações, porcentagem e sinal; aceita o teclado físico | — |
| **Ajustes** | Modo escuro, Não perturbe, toque e volume, fundo de tela, tamanho do celular na tela, seu número | Este navegador |

A home mostra dois widgets com dados reais: a hora do bar com a fase do dia, o saldo do HighBank e as mensagens não lidas do Highzap. A barra de status mostra a hora do bar.

## Números, contatos e a ficha do jogador

Cada conta ganha um número de 9 dígitos começando com 9 (`9XXXX-XXXX`) na primeira vez que usa o celular. O número é sorteado com `crypto.randomInt` e é único (`phone_lines.number`). Ele serve para ligar pelo teclado, salvar contatos e como chave do Pix.

O celular **não lista os jogadores do servidor**. Telefone, Contatos, Highzap e o Pix mostram só a sua agenda. Para alguém entrar na agenda:

1. **Clique na pessoa no bar** (um clique, sem arrastar a câmera) ou use **Pessoas no bar → Ficha**. Abre a *ficha do jogador*: nome, @ e bio do Highgram, fotos, seguidores, seguindo e o **número do celular**.
2. **Salvar contato** põe o número na agenda. A partir daí a pessoa aparece no Highzap, no Telefone e no Pix, e a ficha ganha Mensagem e Ligar.
3. Quem tem o número por outro caminho (pediu no chat, por exemplo) digita no app Contatos (+) ou no teclado.

A sua própria ficha fica em **Pessoas no bar → Seu lugar no bar → Sua ficha e seu número**, com Copiar número e Editar perfil.

A API confere a regra: o Highzap só envia para um contato salvo ou para quem já tem uma conversa com você (quem recebeu uma mensagem pode responder sem salvar o número). Numa conversa com alguém fora da agenda, o Highzap mostra o número no lugar do nome, com o nome que a pessoa usa ao lado (`~Nome`), e oferece **Salvar**.

Bloqueios (Pessoas no bar → Bloquear) valem nos dois sentidos, como no chat e na voz: quem bloqueou ou foi bloqueado não aparece no feed, na busca nem nas sugestões, não recebe mensagem, não recebe Pix, não pode ser seguido, a ficha não abre e a ligação não toca (a outra pessoa ouve "Não foi possível completar a chamada").

## Ligações e chamadas de vídeo

1. Quem liga envia `phone.call {to, video?}` à sala. A sala recusa na hora, sem tocar do outro lado, se a pessoa estiver fora do bar (*Fora de área*), em outra ligação (*Linha ocupada*), bloqueada, ou for o próprio número.
2. O outro lado recebe a chamada com o toque escolhido e o celular abre sozinho (em Não perturbe, a chamada chega em silêncio e o celular não abre). Uma chamada de vídeo aparece como *Chamada de vídeo*. Sem atender em 30 s (`PHONE.ringMs`), vira chamada perdida.
3. Atendida (`phone.answer`), a sala passa a encaminhar a voz das duas pontas **a qualquer distância**, mesmo para quem desligou "Ouvir outras pessoas". Bloqueios continuam cortando a voz. Quem está perto de você também ouve o seu lado da conversa, pela voz por proximidade.
4. Ligar ou atender liga o microfone se ele estava desligado, e a ligação o desliga ao terminar. *Mudo* desliga o microfone durante a chamada. Sem microfone (navegador sem permissão ou sem HTTPS), a pessoa ouve, mas não é ouvida, e a tela da chamada avisa.
5. `phone.hangup` encerra. Cair da conexão, sair do bar ou entrar em outra janela também encerra (*A ligação caiu*).

**Vídeo.** Qualquer ligação atendida pode ter vídeo: a chamada de vídeo (botão de câmera no Highzap ou *vídeo* na ficha do contato) começa com a câmera ligada, e numa ligação de voz o botão **Câmera** liga a sua. A câmera do celular é o jogo: na frente, a câmera do jogo vira para o seu rosto, como na selfie; **Virar** manda a sua própria vista do bar. Enquanto a tela da chamada está na sua frente, o celular manda 8 quadros por segundo em JPEG de 168 × 224 (`PHONE.videoFps`, `videoFrameWidth/Height`), cada um abaixo de 7,6 kB para caber numa mensagem do WebSocket (a qualidade do JPEG se ajusta sozinha). A sala repassa o quadro (`phone.video`, binário) só para a outra ponta de uma chamada atendida, só se for um JPEG dentro do limite e no máximo 12 por segundo. A outra ponta vê a sua câmera em tela cheia e a própria no canto; sem quadros por 1,6 s, a tela diz que a câmera do outro lado está desligada. Guardar o celular ou ir para outra tela pausa o envio e devolve a câmera do jogo.

No cliente, a voz da outra ponta sai do mix por proximidade e passa por um canal próprio (`VoiceChat.setCallPeer`): volume cheio, centralizada e filtrada na faixa de telefone (300–3400 Hz). Com o celular guardado, uma pílula embaixo da carteira mostra quem está na linha e o tempo, com atender e encerrar; no celular, a Dynamic Island mostra a ligação quando você sai da tela da chamada. Todos veem um ícone de telefone no nome de quem está numa ligação (`Player.phone === 'call'`).

## Highzap: fotos, mensagens de voz e vídeos

- **+** abre Câmera (foto ou vídeo, e volta para a conversa) ou Fotos e vídeos (a galeria). Antes de enviar, uma prévia mostra o que vai.
- Com o campo de texto vazio, o botão do **microfone** grava uma mensagem de voz (até 60 s, `PHONE.audioMaxMs`); a lixeira descarta, a seta envia. A gravação usa um microfone próprio (a voz por proximidade continua como estava).
- O app Fotos também tem **Highzap** em cada foto ou vídeo: escolha o contato e envie.

O arquivo vai como bytes crus (`POST /api/phone/zap/:id/media?kind=&ms=&requestId=`, com o tipo do arquivo no `Content-Type`), uma vez por `requestId`. Tipos aceitos: JPEG para fotos (até 240 kB, refeito menor se preciso), WebM, Ogg, MP4 ou MPEG para áudio (até 900 kB) e WebM ou MP4 para vídeo (até 6 MB). A API guarda o arquivo em `phone_media` (bytea) e o serve em `GET /api/phone/zap/media/:id` só para quem enviou e para quem recebeu. Cada conta guarda até 150 MB de mídia enviada (`PHONE.mediaQuotaBytes`); passando disso, as mais antigas são apagadas e a mensagem continua na conversa dizendo que a mídia ficou indisponível.

Na conversa, uma mensagem que chega não redesenha as outras: um áudio continua tocando e um vídeo continua passando.

## Highgram: perfil, seguir e filtros

**Perfil.** Todo mundo começa com o nome de usuário da conta como @ e o nome do bar como nome. Em Perfil → lápis (ou *Editar perfil*): foto (da galeria ou uma selfie na hora, recortada em quadrado de 320 px), nome (até 40), @usuário (de 3 a 24 letras minúsculas, números, ponto ou sublinhado, único no Highgram) e bio (até 150). A foto do perfil aparece em todo o celular: feed, comentários, Highzap, contatos, a pílula de ligação e a ficha do jogador.

**Seguir.** O Início mostra as fotos de quem você segue e as suas; o **Explorar** (lupa) mostra o bar inteiro. O perfil mostra publicações, seguidores e seguindo (toque para ver as listas), *Segue você* e o botão Seguir / Seguindo / Seguir de volta. Quem ganha um seguidor recebe o aviso *Fulano começou a seguir você* (`phone.ping` `gram-follow`).

**Buscar e sugestões.** A busca acha pessoas pelo @ ou pelo nome. As sugestões aparecem no topo do Início e no Explorar, cada uma com o motivo, nesta ordem de peso: quem segue você, quem as pessoas que você segue seguem (*Seguido por @fulano*), seus contatos, quem está no bar agora, os mais seguidos e quem publica no Highland. Nunca aparece quem você já segue, você mesmo ou alguém bloqueado.

**Filtros.** Depois de escolher a foto: Normal, Clarendon, Juno, Lark, Gingham, Valencia, Boteco, Madrugada, Retrô, Sépia, Moon e Noir, com a intensidade de 0 a 100%. Cada filtro é uma matriz de cor (brilho, contraste, saturação, sépia, temperatura), um desbotado e uma vinheta (`apps/web/src/phone/filters.ts`), aplicados aos pixels no celular antes de a foto ser codificada; a miniatura de cada filtro usa a mesma conta, então o que a faixa mostra é o que vai publicado.

Publicar no Highgram envia a foto como data URL JPEG (até 240 kB, `PHONE.photoMaxBytes`). A API confere a assinatura JPEG, guarda a foto em base64 e a serve em `GET /api/phone/gram/photos/:id` com cache imutável. Cada conta guarda até 60 publicações; para postar mais, é preciso apagar uma antiga. Denunciar uma publicação usa `POST /api/reports`, com a publicação no motivo.

## Câmera, fotos e vídeos

O visor é o próprio canvas do jogo, transmitido por `captureStream`. A foto é o próximo quadro desenhado, recortado no centro em 540 × 720 e salvo em JPEG (`BarScene.capture`, lido no `frameend` do mesmo quadro, então o canvas não precisa de `preserveDrawingBuffer`). A selfie vira a câmera do jogo para o rosto do personagem, a um braço de distância (`BarScene.setSelfie`); o visor fica espelhado, como no iPhone, e a foto sai sem espelho. Os nomes e a HUD não saem na foto.

**Zoom**: os botões 1×, 2×, 3× e 5× e a roda do mouse sobre o visor (de 1× a 8×). É um zoom de lente: a câmera do jogo fecha o ângulo (`BarScene.setZoom`, a partir dos 57° normais), então a imagem não perde definição. Sair da Câmera volta a 1×.

**Vídeo**: no modo Vídeo, o botão vermelho grava e para. O vídeo é o centro do visor recortado em retrato (360 × 480, 24 quadros por segundo, cerca de 0,9 Mbit/s) com o som do microfone, gravado pelo `MediaRecorder` do navegador (WebM no Chrome, Edge e Firefox; MP4 no Safari). Sem permissão do microfone, grava sem som e avisa. Para sozinho em 30 s, o limite de um vídeo no Highzap.

## Mapas

O mapa redesenha a cada quadro da tela enquanto está aberto (`requestAnimationFrame`), e não mais quatro vezes por segundo. As 1.557 caixas dos colisores viram um caminho (`Path2D`) por camada uma vez só, e cada quadro pinta oito caminhos com uma transformação. As posições que a sala manda (dez por segundo) são suavizadas no desenho, então a sua seta e os pontos das pessoas deslizam em vez de pular; um salto de mais de 6 m (um teletransporte) aparece direto.

## Mensagens, curtidas, seguidores e Pix em tempo real

O conteúdo fica na API; a sala só repassa avisos. Depois de enviar uma mensagem, curtir, comentar, seguir ou mandar um Pix, o celular envia `phone.ping {to, kind}` (`zap`, `zap-read`, `gram-like`, `gram-comment`, `gram-follow`, `pix`), e a sala o entrega ao destinatário com o nome de quem mandou. O celular do destinatário então lê da API o que mudou. Por isso, um aviso forjado não mostra nada falso. Quem bloqueou não recebe avisos. Com o Highzap aberto, a conversa também se atualiza a cada 15 s.

Com o celular aberto, o aviso aparece como notificação dentro dele. Guardado, vira um aviso da HUD, e o botão Celular da barra de ações mostra quantas novidades há.

## HighBank e Pix

O saldo e o extrato são os da carteira real (as últimas 30 movimentações do `currency_ledger`, com o motivo traduzido por `ledgerLabel`). No Pix, a lista mostra só os seus contatos; para qualquer outra pessoa, digite o número. O Pix (`POST /api/phone/bank/pix`) debita e credita as duas carteiras numa única transação, trava as duas na mesma ordem e é aplicado uma vez por `requestId`. Limites: de 1 a 5.000 moedas por Pix (`PHONE.pixMax`) e 10.000 por dia por conta (`PHONE.pixDailyMax`). A carteira de destino não passa de `MAX_COIN_BALANCE`. Depois do Pix, a HUD dos dois lados se atualiza e a sala relê o saldo (`inventory.sync`).

> Os limites existem porque o Pix permite juntar moedas de várias contas em uma. Se o abuso aparecer, o próximo passo é exigir uma idade mínima da conta para enviar.

## API

Todas as rotas exigem sessão com e-mail confirmado; as que alteram dados recusam contas banidas.

| Rota | Uso |
| --- | --- |
| `GET /api/phone` | Seu número, sua agenda, as mensagens não lidas e a versão da sua foto |
| `GET /api/phone/card/:id` | A ficha do jogador: número, se está na sua agenda e o resumo do Highgram |
| `GET /api/phone/lookup?number=` | Quem tem esse número |
| `POST /api/phone/contacts` · `DELETE /api/phone/contacts/:id` | Salvar (por `userId` ou `number`) e apagar contato |
| `GET /api/phone/zap` · `GET /api/phone/zap/:id` · `POST /api/phone/zap/:id` | Conversas (com `saved`), uma conversa (marca as mensagens como lidas) e enviar texto (40/min) |
| `POST /api/phone/zap/:id/media` · `GET /api/phone/zap/media/:id` | Enviar foto, áudio ou vídeo como bytes crus (20/min) e baixar um anexo |
| `GET /api/phone/gram?scope=following\|all` · `GET /api/phone/gram/users/:id` | Feed (12 por página, `?before=`; `following` é o Início, `all` o Explorar) e perfil |
| `PATCH /api/phone/gram/me` · `GET /api/phone/gram/avatars/:id?v=` | Mudar nome, @, bio e foto (20 a cada 10 min) e a foto do perfil |
| `POST /api/phone/gram/users/:id/follow` · `GET /api/phone/gram/users/:id/followers` · `…/following` | Seguir ou deixar de seguir (60/min) e as listas |
| `GET /api/phone/gram/search?q=` · `GET /api/phone/gram/suggestions?here=` | Busca por @ ou nome e sugestões (`here`: quem o celular vê no bar) |
| `POST /api/phone/gram/posts` · `DELETE /api/phone/gram/posts/:id` | Publicar (8 a cada 10 min) e apagar (autor ou administração) |
| `POST /api/phone/gram/posts/:id/like` · `GET`/`POST /api/phone/gram/posts/:id/comments` · `DELETE /api/phone/gram/comments/:id` | Curtir, comentários e apagar comentário (autor do comentário ou da foto) |
| `GET /api/phone/bank` · `POST /api/phone/bank/pix` | Saldo, extrato e Pix (10/min) |

As tabelas vêm das migrações `infra/migrations/006_phone.sql` e `007_phone_social.sql` e estão no contrato de esquema (`apps/api/src/database/schema-contract.ts`). Em produção, o nginx aceita até 7 MB em `/api/phone/` (o resto da API continua com 32 kB); cada rota confere o próprio limite.

## Código

- Contrato compartilhado: `packages/shared/src/phone.ts` (`PHONE`, esquemas das mensagens da sala, visões da API, `ledgerLabel`).
- API: `apps/api/src/phone-service.ts` e as rotas `/api/phone` em `apps/api/src/app.ts`.
- Sala: `apps/server/src/world/phone-calls.ts` (estado das chamadas) e `BarRoom` (`phone.call`, `phone.answer`, `phone.hangup`, `phone.ping`, `phone.video`, `relayVoice`, `relayVideo`).
- Cliente: `apps/web/src/phone/phone.ts` (o aparelho, notificações, chamadas e vídeo), `core.ts` (contexto dos apps, galeria, sons sintetizados), `media.ts` (gravação, envio e download de mídia), `filters.ts` (filtros do Highgram), `apps/*.ts` (um arquivo por app ou grupo de apps) e `phone.css`. A ficha do jogador está em `apps/web/src/player-card.ts`; o clique no personagem, em `BarScene.pickPlayer`.
- Testes: `apps/api/test/phone.test.ts`, `apps/server/test/phone.integration.test.ts` e `tests/integration/phone-filters.test.ts`; os fluxos no navegador estão em `tests/e2e/phone.spec.ts`.

## Ainda não tem

- Animação do personagem segurando o celular (falta o clipe e o modelo do aparelho).
- Conversas em grupo no Highzap, vídeos no Highgram e o app de encontros do plano original.
- O vídeo das chamadas passa pela sala do jogo, quadro a quadro. Para muitas chamadas de vídeo ao mesmo tempo, o próximo passo é WebRTC (com um servidor TURN), que tira esse tráfego do servidor.
- As fotos, áudios e vídeos ficam no Postgres. Com muitos jogadores, o próximo passo é um armazenamento compatível com S3.
- O celular usa teclado e mouse; no celular de verdade, ele depende do controle por toque que ainda falta ao jogo.
