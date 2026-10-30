# Funcionalidades: situação e plano

Comparação da lista de funcionalidades desejadas com o código em 27/10/2026. **Pronto** quer dizer implementado e coberto por testes. **Parcial** quer dizer que funciona, mas falta parte do pedido. **Falta** quer dizer que não existe ainda. A coluna "Onde" aponta o código ou o documento.

| Funcionalidade | Situação | Onde / o que falta |
| --- | --- | --- |
| Bar multiplayer | Pronto | Colyseus autoritativo, AOI de 18 m, predição e reconciliação ([rede](../arquitetura/networking.md)) |
| Sentar nas mesas | Pronto | 172 lugares: 124 cadeiras nos dois andares e, desde 29/10, os bancos das 8 mesas de piquenique do quintal (24–31, 6 lugares cada), com pedido, entrega e limpeza como nas outras ([mapa](../assets/map.md#mesas-numeradas)) |
| Pedir comida e bebida sentado, pagar, e o Tonico entregar | **Pronto** | [economia](../sistemas/economia.md): cardápio (P), cobrança, A* do balcão até a mesa, entrega na bandeja e estorno. Desde 28/10 (noite): cada item dura minutos na mesa e faz efeito aos poucos; quem pede fica na mesa até chegar (cancela só enquanto está no balcão); o que termina é recolhido pelo ajudante ou, sem ninguém trabalhando, pelo Tonico; dá para pedir a quem trabalha no bar, que pega no balcão e leva na bandeja; o Tonico acha o caminho até o terraço de qualquer ponto |
| Objetos do bar no cenário | **Pronto (novo)** | [decoração](../sistemas/drinks.md#decoração-do-bar): geladeiras de cerveja com porta de vidro e long necks, águas e refris reais; coxinhas e pastéis na estufa; copos na chopeira e cafés no caixa |
| Sombras | **Corrigido (28/10)** | [dia e noite](../sistemas/day-night.md): o céu panorâmico fazia sombra no mapa inteiro (de dia nada tinha sombra do sol); pessoas deixavam sombras "fantasmas" nas lâmpadas; agora têm sombra de contato e sombra real ao sol |
| Magrão no balcão prepara e cobra | **Pronto (animado, 28/10)** | O balcão cobra o preço do item e estorna o pedido que cair. Desde 28/10 (noite), o Magrão tira o chopp na chopeira e busca a long neck no freezer, com os clipes do mapa, e deixa a bebida no balcão ([animações do bar](../sistemas/animacoes-bar.md)) |
| Jukebox com som 3D, custando moedas | **Pronto (cobrança nova)** | Volume pela distância ([jukebox](../sistemas/jukebox.md)); 15 moedas por vídeo. O YouTube não entra no Web Audio, então não há pan estéreo, só atenuação |
| TV com YouTube para todos, custando moedas | **Pronto (cobrança nova)** | 25 moedas por vídeo |
| Telão na área de show | **Pronto (palco novo, 28/10)** | O telão de LED do mapa (`Telao_Tela`, 5,76 × 3,24 m) no fundo do palco, controlado no blip turquesa da frente do palco (ou na borda da frente, de cima dele); som pelo quintal todo, sem tocar por cima da jukebox e das TVs; 50 moedas por vídeo ([jukebox e TVs](../sistemas/jukebox.md)) |
| Palco com acesso pago | **Pronto (novo, 28/10)** | Ingresso de 200 moedas, vale 30 min, comprado na escada (blip magenta; os blips do palco só aparecem no quintal). Todas as luzes do palco (lentes, fita de LED, contraluz, spots da treliça, luz frontal e luz de festa) com as cores do vídeo do telão ([economia](../sistemas/economia.md)) |
| Show de luzes no palco | **Pronto (novo, 30/10)** | Lasers, moving heads com luz de verdade, blinders, estrobo e desenhos a laser no telão enquanto o telão toca ou alguém toca no palco: dezesseis programas (entre eles o Letreiro, que escreve HIGHLAND, e os Desenhos) e oito paletas no compasso do relógio do servidor, iguais para todos ([show de luzes](../sistemas/palco.md#show-de-luzes)) |
| Mesa de luz do palco | **Pronto (novo, 30/10)** | Blip violeta em cima do palco, ao lado da mesa de som: painel com cenas prontas e salvas, rodízio ou programa fixo, paletas, tap tempo, níveis, texto do letreiro e efeitos (flash, blackout, drop, letreiro), valendo para todo mundo; câmera de plateia enquanto o painel está aberto ([mesa de luz](../sistemas/palco.md#mesa-de-luz)) |
| Tela de entrada com a logo animada | **Pronto (novo, 30/10)** | Letreiro de neon vivo ao lado do menu, com brinde no clique e bolhas de cerveja ([interface](../sistemas/interface.md#a-logo-na-entrada)) |
| Músicos no palco | **Pronto (novo, 28/10)** | Violão, cavaquinho, bateria e vocal: um jogador por lugar, E para tocar e para parar, instrumento na mão, servidor dono das fases, quem chega no meio vê o show ([músicos do palco](../sistemas/palco.md)) |
| Animações e estilos de andar por jogador | Parcial | Andar normal, correr, bêbado, bengala (`/velho`), dança, aceno, karatê. Faltam estilos escolhíveis (gingado, feminino etc.); veja "Animações" |
| Fumar, beber e comer com props | **Pronto (28/10, noite)** | Beber com o objeto real na mão ([bebidas e comidas em 3D](../sistemas/drinks.md)). [Animações do bar](../sistemas/animacoes-bar.md): fumar (F, cigarro, brasa e fumaça), fumar um cigarro inteiro (Shift+F, do maço à bituca pisada, 29/10), comer com garfo o que foi servido na mesa, sentar puxando a cadeira do mapa, levantar, urinar no mictório, vomitar ao beber demais, cair e levantar do chão, limpar a mesa pela quina. Falta o cigarro como item da mochila |
| Skins com encaixe fácil de ossos | Pronto | Esqueleto nativo por skin, calibração e retarget automáticos (`npm run assets:retarget`, [esqueletos nativos](../assets/native-rigs.md)) |
| Interface limpa para PC e celular | Parcial | Painéis móveis, layout de celular. Falta **controle por toque** (joystick virtual e botões de ação) |
| Câmera em primeira e terceira pessoa | **Pronto (atualizado, 29/10)** | Rodinha com zoom contínuo fino e distância exata nas configurações; Q alterna primeira/terceira pessoa preservando o zoom, sem toast. Giro horizontal e vertical livre; a câmera atravessa os colisores sem encurtar a distância, com raio-X em volta do personagem. Preferências salvas no navegador ([câmera](../sistemas/camera.md)) |
| Fluido e fácil de navegar | Parcial | Predição a 20 Hz. Faltam o touch e as metas de FPS medidas em hardware de referência |
| Minigame de entrega (moto, mapa procedural) | Falta | Plano abaixo |
| Celular com apps paródia | **Pronto (29/10, ampliado 30/10)** | [Celular](../sistemas/celular.md) estilo iPhone 18 Pro na tecla K: ligações e chamadas de vídeo, Highzap com fotos, áudios e vídeos, Highgram com perfis, filtros, seguir e sugestões, HighBank com Pix, câmera com zoom, selfie e vídeo, mapa do bairro e os apps de sempre. Os números vêm da ficha do jogador (clique na pessoa no bar) |
| Pôquer | Falta | Plano abaixo, com uma ressalva legal |
| Emprego no espetinho, cardápio e preço do jogador | Falta | Plano abaixo; o mapa já tem o `Carrinho_Espeto` |
| Emprego no bar com poucas vagas | **Pronto (novo)** | Ajudante do Magrão: 2 vagas, tarefas por estação, pagamento por tarefa, teto diário |
| Sistema que gerencia os empregos e painéis de admin para depurar | **Pronto (novo)** | `JOBS` orientado a dados e **Administração → Mundo ao vivo** (empregos, pedidos, mídia, NPCs, jogadores) |
| Indicação de assets | **Pronto (novo)** | [assets recomendados](assets-recomendados.md) |
| Sistema resiliente, baixa latência, mapa maior | Parcial | Veja "Escala e latência" |
| Skybox, névoa atmosférica, iluminação | Pronto | Céu procedural com sol, lua e estrelas, névoa de borda, ciclo de 40 min ([dia e noite](../sistemas/day-night.md)) |
| Configurações gráficas e tecnologias modernas | **Pronto (novo)** | [gráficos](../sistemas/graficos.md): presets, escala de renderização, resolução dinâmica, sombras, névoa e limite de FPS |
| Scripts `.bat` para ligar e desligar | Pronto (+4 novos) | [ferramentas](../../tools/README.md): `abrir-jogo`, `atualizar`, `testar` e `contas-demo` |

## Próximas entregas, em ordem

A ordem segue o que destrava mais coisas: as próximas três reaproveitam a carteira, o A* e o framework de empregos desta entrega.

### 1. Controle por toque

Joystick virtual à esquerda e botões contextuais (E, T, J, correr) à direita, ligados ao mesmo `getInput()` da cena, com a câmera arrastada no lado direito. Sem isso, o jogo abre no celular mas não se joga.

### 2. Espetinho do jogador

- **Estação:** o `Carrinho_Espeto` vira um emprego com 1 vaga, do tipo "loja do jogador".
- **Ingredientes:** catálogo compartilhado com itens comuns (carne, frango, queijo coalho, linguiça) e engraçados (rato, cigarro, chiclete, meia), cada um com efeitos nas necessidades. Montar um espeto escolhe de 1 a 4 ingredientes e gera um item `espeto:<hash dos ingredientes>` com o nome que o vendedor der.
- **Cardápio e preço livres:** o vendedor publica até 8 receitas com preço entre 1 e 500. Os nomes passam por um filtro de palavrões e limite de tamanho, e a administração pode ocultá-los.
- **Troca entre jogadores:** a transação entre carteiras já existe (o Pix do HighBank, `PhoneService.pix`: debita e credita na mesma transação, uma vez por `requestId`). O espetinho a reaproveita, com uma taxa opcional da casa como sink.
- **Preparo:** cada pedido exige que o vendedor fique na churrasqueira por alguns segundos (estação com animação), para não virar clique infinito.

### 3. Pôquer (Texas Hold'em)

- Regras inteiramente no servidor, como o blackjack: baralho com `crypto.randomInt`, cartas fechadas enviadas só ao dono, potes laterais, blinds, timeout por turno e reconexão sem perder a cadeira.
- **Ressalva:** se as moedas puderem ser compradas com dinheiro real, apostar essas moedas em jogo de azar cria risco jurídico no Brasil (e nas lojas de apps). A recomendação é usar **fichas de mesa gratuitas e não conversíveis**: todo mundo senta com o mesmo número de fichas, e o ranking e as conquistas são o prêmio. Apostas em moedas só depois de uma avaliação jurídica.
- Peças a reaproveitar: interface `Activity` (join, leave, start, command, tick, visões pública e privada, resultado), outbox de resultados e as estatísticas.

### 4. Celular no jogo (pronto em 29/10)

Entregue como um aparelho no estilo do iPhone 18 Pro, aberto com **K** (a tecla P ficou com o pedido na mesa), com os apps em `apps/web/src/phone/` ([celular](../sistemas/celular.md)):

| App | Paródia de | Situação |
| --- | --- | --- |
| Telefone | — | Ligações e chamadas de vídeo entre jogadores, voz a qualquer distância entre quem atendeu, recentes, agenda e teclado com números de 9 dígitos. A agenda só tem quem você salvou pela ficha do jogador ou pelo número |
| Highzap | WhatsApp | Conversas de um para um com os contatos salvos, fotos, mensagens de voz, vídeos, tiques de enviada e lida, chamada de vídeo, avisos em tempo real pela sala |
| Highgram | Instagram | Perfil com nome, @, bio e foto; seguir, buscar e sugestões; Início com quem você segue e Explorar; fotos da câmera do jogo com 12 filtros, curtidas, comentários, apagar e denunciar |
| HighBank | Nubank | Saldo e extrato reais e Pix para um contato salvo ou um número digitado (operação `transfer` na API, com limites por Pix e por dia) |
| Câmera, Fotos, Mapas, Contatos, Notas, Calendário, Relógio, Calculadora, Ajustes | — | Funções normais de um celular, com dados reais do jogo onde existem |

Falta, do plano original: Crush (Tinder), conversas em grupo e o personagem segurando o celular (precisa do clipe e do modelo do aparelho). As fotos, áudios e vídeos ficam no Postgres (60 publicações e 150 MB de mídia do Highzap por conta); com muitos jogadores, o próximo passo é um armazenamento S3 compatível, e para muitas chamadas de vídeo, WebRTC.

### 5. Entregas de moto (minigame)

- **Sala separada:** `DeliveryRoom` no Colyseus, uma instância por jogador ou por grupo. O bar continua leve, e o minigame pode ter física própria.
- **Mapa procedural:** uma seed por sessão gera uma grade de quarteirões (ruas, calçadas, casas) a partir de peças modulares de cidade low-poly CC0 ([assets](assets-recomendados.md)). A mesma seed gera colisores no servidor e malhas no cliente, então só a seed trafega.
- **Moto:** veículo arcade autoritativo no servidor (velocidade, curva, freio), com predição no cliente como a do jogador.
- **Loop:** pegar o pedido no restaurante, entregar no endereço sorteado dentro de um tempo, receber moedas pelo framework de empregos (`job:delivery:...`) com teto diário. Quantas entregas quiser, sem dinheiro real.
- **Entrada e saída:** a moto estacionada na rua do bar é um interactable que transfere a pessoa de sala com um ticket novo. Sair do minigame devolve a pessoa ao ponto da moto.

### 6. Animações, fumar e comer

Fumar, comer sentado, sentar e levantar, mictório, vomitar, cair e o Magrão no balcão já estão prontos ([animações do bar](../sistemas/animacoes-bar.md)). Falta:

- Clipes novos convertidos pelo pipeline atual (`npm run assets:animations`), com a origem e a licença de cada um em [assets recomendados](assets-recomendados.md): comer em pé, segurar o celular e estilos de andar.
- **Estilo de andar escolhível:** campo `walkStyle` no personagem, salvo na conta, que troca o clipe `Walk` pelo do estilo (como já acontece com a bengala).
- **Props:** cigarro com partícula de fumaça e prato ou espeto na mão, presos pela mesma lógica de mão de `drink-props.ts`. O cigarro entra como item da mochila com efeito próprio.

## Escala e latência

O que já protege a sala: estado autoritativo a 20 Hz com patch a 10 Hz, AOI de 18 m, limite de mensagens por comando, outbox durável de resultados, créditos com novas tentativas e idempotência em toda moeda. Para crescer:

1. **Mapa maior:** a colisão já usa uma grade espacial de 8 m, e o A* não depende do tamanho do mapa. O passo seguinte é carregar o cenário por setores no cliente, com LOD e KTX2/meshopt (Marco 2 do [plano](../execucao/PLANO.md)).
2. **Mais jogadores:** uma sala por bar (instâncias "Bar 1", "Bar 2"), com o Colyseus em vários processos e o Redis como presence e driver. A carteira e o inventário já estão na API, então várias salas compartilham a mesma conta sem conflito.
3. **Minigames em salas próprias** (entregas, pôquer de torneio), para não pesar no tick do bar.
4. **Latência:** WebSocket com msgpack, o padrão do Colyseus, e servidor perto dos jogadores (São Paulo). WebTransport só quando estiver estável em todos os navegadores.
5. **Observabilidade:** as métricas novas `bar_world_wallet_credits_pending`, `bar_world_table_orders_pending` e `bar_world_job_workers` somam-se às de tick, rejeições e manutenção.
