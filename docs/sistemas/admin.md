# Administração dentro do jogo

A conta confirmada **rafaelrodrigues-2017@hotmail.com** é a conta principal. A API concede a ela o papel de administrador ao iniciar, ao confirmar o e-mail ou ao concluir o cadastro com a política de ativação automática habilitada. Isso não cria outra conta, não redefine senha e não ignora a confirmação de e-mail quando ela estiver exigida.

Entre no bar e abra **Administração** no menu (Esc › Você). A janela ocupa quase a tela toda e tem um menu de categorias à esquerda; a categoria aberta fica à direita, com título, uma frase do que ela faz e uma linha de status (`.admin-feedback`) onde aparece o resultado de toda ação. Reabrir a janela volta à última categoria usada. No celular, o menu vira uma faixa rolável no topo.

No pé do menu, **Sua posição** mostra onde o seu personagem está (x, y e z em metros e a rotação em graus e radianos), atualizada ao vivo, com **Copiar**. Serve para marcar onde algo deve ficar no mapa, como um blip: pare no lugar, abra a administração e copie. Fora de HTTPS e do localhost o navegador não deixa copiar direto; o texto fica selecionado para Ctrl+C.

O código está em `apps/web/src/admin/` (um arquivo por categoria, `console.ts` monta a janela) e `apps/web/src/admin.css`; na API, `apps/api/src/admin-service.ts` (contas, carteiras, moderação, reversões), `apps/api/src/admin-console.ts` (resumo, ficha, denúncias, logs, economia, servidor) e `apps/api/src/pricing-service.ts` (preços).

## Categorias

Em **Jogadores → selecione a conta → Resumo**, o botão **Dar god** recupera uma vez vida, energia, fome, sede e suas reservas; zera álcool e bexiga, remove o cansaço e recupera desmaios e mortes. Informe o motivo no formulário. A ação vale para jogadores conectados e fica registrada no histórico e nos logs. Depois da recuperação, o desgaste normal continua.

No chat, administradores podem usar **`/god`** em si mesmos ou **`/god Nome Completo`** / **`/god ID`** em outro jogador conectado. Nomes não diferenciam maiúsculas e minúsculas; se houver nomes repetidos, use o ID. O comando é validado no servidor, responde em particular e registra administrador e jogador no log.

| Categoria | Para quê |
| --- | --- |
| Visão geral | Quem está no bar, contas novas, denúncias abertas, moedas em circulação e criadas/retiradas em 24 h, entradas do dia; os eventos (Apagão, O inconveniente, Festa); a saúde do sistema (API, mundo, preços sincronizados, filas); as últimas ações da administração e atalhos para contas banidas, com e-mail pendente e administradores |
| Jogadores | Busca e filtros, e a ficha completa de cada conta, com tudo o que dá para alterar nela |
| Denúncias | A fila de denúncias, para resolver com uma decisão registrada ou reabrir |
| Economia | Moedas em circulação, inflação, de onde as moedas vêm e para onde vão, distribuição e maiores saldos |
| Preços | Todos os preços e pagamentos do jogo numa tabela editável |
| Níveis e XP | Quanto XP cada ação dá e quanto vale cada dia do bônus diário, na mesma tabela editável dos preços ([niveis.md](niveis.md#na-administração)) |
| Logs | Uma linha do tempo de tudo o que ficou registrado, com filtros |
| Mundo ao vivo | O estado da sala agora: empregos, pedidos, aparelhos, palco, bots, NPCs e jogadores ([economia.md](economia.md#administração-mundo-ao-vivo)) |
| Veículos | Cadastro de veículos de todos os jogadores, incluindo offline e garagem: reparar, abastecer, recolher, transferir, pintar e excluir. Mantém também spawn/despawn dos veículos do mapa ([moto.md](moto.md#spawnar-e-despawnar)) |
| Emblemas | O catálogo de emblemas: criar, editar, apagar, conceder e retirar, com raridade, ícone da lista ou PNG enviado ([perfil.md](perfil.md#emblemas)). Os 116 emblemas ganhos jogando aparecem aqui com a quantidade que os dá, incluindo sinuca e truco ([conquistas.md](conquistas.md#na-administração)) |
| Coleção | As cartas de personagem e as habilidades: raridade, preço, texto, situação de venda, quantos donos e quanto renderam, com a carta ao vivo ([skins.md](skins.md)) |
| Servidor | Processos da API e do mundo, memória e disco da máquina, banco de dados e filas |
| Desempenho | FPS, 1% low, tempo de frame, travadas, CPU/GPU, memória, rede e tick do servidor; seleção de métricas para o HUD e relatório JSON ([desempenho.md](desempenho.md)) |

O menu mostra quantas denúncias estão abertas. Nomes de jogadores em qualquer categoria (logs, denúncias, ranking, mundo) abrem a ficha do jogador.

## Veículos dos jogadores

**Administração → Veículos** tem três abas: **Veículos dos jogadores**, **Registrar veículo** e **Spawn**. As abas aceitam as setas esquerda/direita, Home e End; a última aba aberta é lembrada durante a sessão.

Na aba **Veículos dos jogadores**, busque pela placa, nome ou usuário do dono e filtre por modelo. A lista mostra proprietário, presença no mapa desta sala, condição mínima das peças, combustível e quilometragem. Também há um atalho **Gerenciar veículos** na ficha do jogador, em **Itens e skins**.

Em **Registrar veículo**, procure e selecione o jogador, escolha qualquer modelo do catálogo, a cor quando disponível e uma placa opcional. Sem placa preenchida, o servidor gera uma automaticamente. O veículo novo entra na garagem, com todas as peças e o tanque em 100% e quilometragem zero, e sua chave pertence ao jogador, sem cobrar moedas. Funciona com contas offline e respeita o limite de dez veículos, a confirmação do e-mail e a proteção de administradores. Repetir o mesmo pedido não cria outra unidade.

Em **Spawn**, escolha o modelo e a cor quando disponível e use **Spawnar veículo**. A aba lista os veículos no mapa e permite removê-los individualmente ou todos juntos. Veículos de spawn são temporários e ficam disponíveis para quem estiver na sala; os registrados pertencem a um jogador e permanecem na garagem.

`VEHICLE_CATALOG`, em `packages/shared/src/vehicle-models.ts`, é a fonte dos modelos permitidos, nomes, fotos, cores e disponibilidade de pintura. Um novo modelo jogável registrado nesse catálogo aparece automaticamente no spawn, no registro e nos filtros, sem criar botões ou condições no menu. O servidor valida o modelo pelo mesmo catálogo.

Selecione uma ou várias linhas, ou use **Gerenciar** em uma linha. Escolha a ação e informe o motivo:

- **Reparar todas as peças:** coloca todas as peças do modelo em 100%, sem zerar a quilometragem.
- **Encher o tanque:** combustível em 100%, sem cobrar moedas.
- **Recolher para a garagem:** retira o veículo do mapa, desembarcando os ocupantes; mantém dono e chave.
- **Transferir proprietário:** procure e selecione uma conta com e-mail confirmado. O veículo e sua única chave passam ao destinatário; se estiver na rua, vai para a garagem. Respeita o limite de dez veículos por conta.
- **Alterar pintura:** aplica a cor no Hatch 80 ou na moto Caveira em Chamas.
- **Personalizar placa:** selecione um único veículo e informe uma placa Mercosul (`ABC1D23`). Letras são convertidas para maiúsculas e placas duplicadas são recusadas, inclusive em alterações concorrentes. Atualiza o cadastro, a chave e a placa visual do veículo que estiver no mapa.
- **Excluir definitivamente:** remove o veículo e a chave, inclusive do banco e da garagem, sem reembolso. A seleção e o motivo ficam explícitos no formulário antes de aplicar.

Os botões **Reparar todos os veículos**, **Abastecer todos os veículos** e **Recolher todos para a garagem** abrangem o cadastro completo, incluindo jogadores offline. Excluir, transferir e pintar exigem selecionar as linhas. As mesmas proteções de conta da carteira se aplicam: somente a conta principal pode alterar outro administrador. Ações globais de outros administradores pulam essas contas protegidas e informam a quantidade.

`apps/api/src/admin-vehicles.ts` aplica mudanças e registra autor, placas e motivo na mesma transação. Um identificador de pedido evita duplicar transferências ou exclusões numa repetição. O controle `vehicles` leva as alterações para a sala. `player_vehicles.revision` impede que um salvamento antigo da sala desfaça a alteração; transferências entre jogadores também avançam essa revisão. Reparo e abastecimento chegam ao veículo em uso, e recolhimento, transferência e exclusão retiram seus ocupantes.

As migrações **`022_vehicle_revision.sql`** e **`023_admin_vehicle_requests.sql`** são necessárias antes de iniciar a API com este código (`npm.cmd run migrate -w @bar/api`; o desenvolvimento já executa migrações no `predev`). A segunda guarda recibos duráveis de pedidos, separados dos logs. As verificações cobrem API, banco migrado, sala via WebSockets e interface no navegador: `admin-vehicles.test.ts`, `admin-vehicles.integration.test.ts` e o caso de veículos em `tests/e2e/admin.spec.ts`.

## Jogadores

À esquerda: **Buscar jogador** (nome, usuário ou e-mail), filtros **Todos**, **No bar** (quem o mundo diz que está conectado agora), **Administradores**, **Banidos** e **E-mail pendente**, a ordem (**Mais recentes**, **Nome**, **Maior saldo**), **Atualizar painel** e páginas de 20 contas. Quem está no bar tem um ponto ciano ao lado do nome.

À direita, a ficha: nome, e-mail, usuário, selos (conta principal, administrador, no bar, banido, expulsão registrada, e-mail pendente) e o **Saldo atual**, sempre à vista, e seis abas (a aba escolhida continua ao trocar de jogador):

| Aba | Conteúdo |
| --- | --- |
| Resumo | Conta criada, último login, sessões abertas, número do celular, skin em uso, partidas de blackjack, denúncias recebidas e feitas, onde está no bar agora. **Nome no jogo** com motivo (vale a partir da próxima entrada no bar), **Confirmar e-mail** e **Encerrar sessões** (desconecta a conta em todos os navegadores; se estiver no bar, sai em alguns segundos) |
| Carteira | Ganhos e gastos dos últimos 30 dias, o ajuste manual de moedas e as últimas 40 movimentações com origem e descrição |
| Nível | Nível, posto e XP com a barra do HUD. **Ajustar XP**: adicionar, retirar, definir o XP total ou definir o nível (vai para o começo dele), com prévia do resultado e motivo. **Bônus diário**: o dia da sequência e se já recebeu hoje, com **Liberar o bônus de hoje de novo** ([niveis.md](niveis.md#na-administração)) |
| Itens e skins | A mochila (quantidade de cada item), **Entregar**/**Retirar** itens respeitando o limite de cada pilha e as 12 posições da mochila; as skins da coleção, com **Dar skin**/**Retirar skin** (retirar a skin em uso veste o Nathan); as habilidades, com **Dar habilidade**/**Retirar habilidade**. O mundo relê a mochila na hora (controle `sync`) |
| Moderação | Expulsar, desfazer expulsão, banir, desbanir, dar ou remover administrador, e as denúncias contra a conta |
| Histórico | Toda ação da administração sobre a conta, com a reversão de cada uma quando ela existe |

Toda alteração pede um motivo (3 a 500 caracteres) e fica registrada em `moderation_actions` com autor e motivo (`player-rename`, `player-verify`, `player-logout`, `items-add`, `items-remove`, `skin-grant`, `skin-revoke`, `skill-grant`, `skill-revoke`). Enquanto uma ação roda, os controles da categoria ficam travados, inclusive os redesenhados durante a recarga da ficha.

### Carteiras

Escolha **Adicionar**, **Remover** ou **Definir saldo total**, informe a quantidade e o motivo e pressione **Aplicar ajuste**. É possível ajustar a própria carteira. Valores inteiros entre zero e 1.000.000.000 são aceitos; adicionar/remover exige quantidade positiva e o resultado nunca pode ser negativo ou superar o limite.

Cada ajuste usa uma transação com bloqueio da carteira, lançamento no histórico de moeda e registro administrativo com autor, motivo e saldo anterior/final. A repetição do mesmo pedido não concede nem remove moedas novamente. Definir um saldo total exige que o saldo consultado ainda seja atual, evitando sobrescrever uma compra ocorrida enquanto o formulário estava aberto. O jogador vê o saldo novo em até cerca de cinco segundos.

### Moderação e administradores

| Controle | Efeito |
| --- | --- |
| Expulsar | Encerra somente a participação atual; preserva o login e permite entrar novamente |
| Desfazer expulsão | Cancela ordens de expulsão pendentes e marca as expulsões registradas como desfeitas; não remove banimentos |
| Banir | Revoga as sessões e impede novos acessos até a remoção do banimento |
| Desbanir | Remove o bloqueio; o jogador entra novamente com seu login |
| Dar administrador | Concede administração a uma conta confirmada e não banida |
| Remover administrador | Remove a permissão, preservando skins, compras e moedas |

Após uma expulsão, o jogador volta à entrada com uma mensagem explicando que sua conta continua liberada. Uma ordem de expulsão atrasada não atinge uma participação iniciada depois da emissão da ordem. Após banimento, a tela mostra a restrição e pede novo login quando o banimento for removido; sessões revogadas não são restauradas.

Somente a conta principal pode conceder ou remover administradores. Ela não pode ser expulsa, banida, rebaixada ou alterada pelo painel. Administradores delegados moderam jogadores, ajustam a própria carteira e a dos jogadores, mudam preços, resolvem denúncias e iniciam eventos; a moderação, a carteira, a mochila e as skins de outros administradores ficam com a conta principal. O botão de administração aparece e some para quem recebe ou perde a permissão em até cerca de cinco segundos, e a API confere o papel persistido em cada requisição.

### Reverter pelo histórico

Na aba **Histórico**, use a opção junto ao registro original. O formulário identifica o jogador, explica o efeito e exige o motivo. O registro original é conservado com a data da reversão, e uma nova ação `undo-*` registra quem desfez e por quê.

| Ação original | Reversão |
| --- | --- |
| Expulsão | Cancela aquela ordem se ainda estiver pendente e marca o registro como desfeito |
| Banimento | Remove aquele banimento; outros banimentos ativos continuam valendo. **Desbanir** em Moderação remove todos |
| Adicionar/remover/definir moedas | Compensa o valor efetivamente alterado sobre o saldo atual, preservando compras e outros ajustes |
| Conceder/remover administrador | Restaura o papel anterior somente se não houver alteração de permissão mais recente |
| Evento | Encerra o evento solicitado se ainda for o ativo; não interrompe um evento posterior |

Reversões de moedas usam transação, bloqueio da carteira e identificador derivado da ação original; são recusadas se o saldo final ficar negativo ou passar do limite. Liberações, reversões, mudanças de nome, itens, skins, preços e a habilitação da conta principal não têm reversão automática: faça a mudança contrária pela ficha ou por Preços.

## Tempo e clima

Abra **Tempo e clima** no menu lateral. Defina a hora do jogo, pause/retome o relógio, ajuste a duração do dia (5–240 minutos reais) ou use os atalhos de horário. O celular e a iluminação acompanham o novo horário. Partidas, entregas e empregos continuam com seus prazos normais quando o relógio está pausado.

Escolha **Automático**, **Céu limpo**, **Nublado**, **Chuva** ou **Tempestade**. O automático alterna condições a cada seis minutos; alterações de clima transitam em 12 segundos. O estado é compartilhado por todos nesta sala, inclusive novas entradas, e dura até o servidor reiniciar. **Restaurar tempo e clima** volta ao ciclo global de 40 minutos e clima automático. Cada comando exige administração e fica registrado nos logs. Implementação e efeitos em [tempo e clima](day-night.md).

## Denúncias

Filtros **Abertas**, **Resolvidas** e **Todas**. Cada denúncia mostra quem denunciou, contra quem, quando e o motivo, com atalhos para as duas fichas. **Resolver** pede a decisão (por exemplo: advertência, banimento, sem irregularidade), que fica gravada com quem resolveu e quando; **Reabrir** volta a denúncia para a fila. Punir é feito na aba Moderação da ficha. As colunas `resolved_at`, `resolved_by` e `resolution` vêm da migração `008_admin_console.sql`; resolver e reabrir também entram no histórico (`report-resolve`, `report-reopen`).

## Economia

Períodos de **7**, **30** e **90 dias**. Os números vêm do livro de moedas (`currency_ledger`) e das carteiras:

- **Moedas em circulação**: a soma de todas as carteiras, com quantas têm saldo.
- **Inflação no período**: quanto a quantidade de moedas em circulação mudou do começo ao fim do período, e a taxa equivalente ao dia. A circulação de cada dia é reconstruída a partir do saldo de hoje, desfazendo o que entrou e saiu depois.
- **Moedas criadas** (boas-vindas, bônus, trabalho, estornos, ajustes da administração) e **retiradas** (compras no balcão, na mesa e na mochila, skins, aparelhos, palco). Pix move moedas entre jogadores e fica fora dessa conta.
- **Índice de preços**: quanto custariam hoje as compras feitas no período, comparado aos preços padrão (100 = padrão), e quantas mudanças de preço houve.
- **Giro das moedas**: moedas gastas no período sobre a média em circulação, e quantos jogadores movimentaram moedas.
- Um parágrafo com o diagnóstico em palavras (crescendo, encolhendo ou estável, e o que costuma ajudar).
- Gráficos de moedas em circulação por dia e de criadas × retiradas por dia (passe o mouse ou o foco para ver os valores), a tabela de origens e destinos, a distribuição (mediana, média, parcela dos 10% mais ricos, Gini e quantos copos de chopp a carteira mediana paga), os maiores saldos e os números de cada dia numa tabela.

## Highfood

Quanto as entregas pagaram, quem está online, os perfis dos clientes (nome, corpo, falas e foto enviada) e dar ou tirar a moto de alguém (de quem tem mais de uma, informando a [placa](garagem.md#administração)). Detalhes em [Highfood](highfood.md#administração).

## Preços

Uma tabela por grupo (**Bar e mochila**, **Skins**, **Jukebox, TVs e telão**, **Palco**, **Trabalho**, **Recompensas**) com o valor padrão, o atual e o campo **Novo valor**, a variação em relação ao padrão e **Padrão** para voltar. As linhas alteradas ficam destacadas e nada muda no jogo até **Salvar preços**, que pede o motivo e grava todas juntas. **Reajuste** aplica uma porcentagem ao grupo filtrado (ou a todos) para revisar antes de salvar.

| Grupo | Chaves | Onde vale |
| --- | --- | --- |
| Bar e mochila | `item:<id>` | Balcão do Magrão, pedidos na mesa e loja da mochila |
| Skins | `skin:<id>` | Coleção (C); quem já comprou continua com a skin |
| Jukebox, TVs e telão | `media:jukebox`, `media:tv`, `media:telao` | Cada vídeo novo |
| Palco | `stage:pass` | Ingresso de 30 minutos |
| Trabalho | `job:<id>`, `cap:job-daily` | Pagamento por tarefa e teto diário por jogador |
| Recompensas | `reward:initial`, `reward:daily` | Moedas de boas-vindas e bônus diário (0 desativa) |

Os padrões são os do código (`packages/shared/src/prices.ts` reúne todos) com as variáveis de ambiente que já existiam por cima. O que a administração muda fica em `economy_prices`; voltar ao padrão apaga a linha. A API usa a tabela efetiva em compras, skins, boas-vindas, bônus e no teto do trabalho; o mundo recebe um controle `prices`, relê a tabela (`GET /api/internal/prices`), cobra e paga com ela e manda a tabela nova aos navegadores, que atualizam os rótulos de preço. Cada gravação entra no histórico como **Preços alterados**, com cada mudança (`Coxinha: 22 → 25`).

## Logs

Uma linha do tempo única, do mais novo para o mais antigo, juntando:

| Tipo | Origem |
| --- | --- |
| Administração | `moderation_actions`: tudo o que a administração fez |
| Moedas | `currency_ledger`: cada movimentação, com origem, descrição e valor |
| Itens | `inventory_ledger`: itens iniciais, compras, uso, descarte, perda no desmaio e ajustes |
| Acessos | Contas criadas e, em `game_logs`, entradas na conta, senha errada, saídas e troca de senha |
| Denúncias | `reports` |
| Mundo | `game_logs` enviados pelo mundo: entrou e saiu do bar, reconexão, remoção, desmaio, passar mal, turnos, ingresso e música no palco, pedidos entregues ou cancelados, ligações, eventos, comandos da administração no mundo e créditos recusados |

Filtre por **texto** (nome, usuário, e-mail ou o texto do registro), **período** (última hora, 24 horas, 7 dias, 30 dias ou tudo) e **tipo** (clique em um tipo para ver só ele; outros cliques somam ou tiram tipos). Clicar no nome de um jogador mostra só os registros dele; o ícone ao lado abre a ficha. **Carregar mais antigos** pagina; **Ao vivo** recarrega a primeira página a cada 10 s; **CSV** baixa o que está carregado (abre no Excel).

O mundo guarda os eventos em uma fila e envia em lotes a cada rodada de manutenção (`POST /api/internal/logs`, segredo interno); se a API não responder, tenta de novo na próxima. Bots de teste e eventos ruidosos (portas, novas tentativas) ficam fora. O log guarda os ids reais para mostrar nomes (a saída de texto do mundo continua com pseudônimos). Linhas com mais de 90 dias são apagadas aos poucos.

## Veículos

A coluna Situação mostra quem pilota cada moto e se ela está estacionada, desgovernada, caída ou sendo levantada ([batidas](moto.md#batidas)). O mapa não tem moto até alguém criar uma aqui. **Spawnar moto** (`admin.moto.spawn`) põe uma na rua livre mais perto de você; **Despawnar** e **Despawnar todas** (`admin.moto.despawn`) tiram do mapa, e quem estiver pilotando desce na hora. A sala confere o papel `admin` em cada comando e registra `admin_moto_spawn` e `admin_moto_despawn` no log. Detalhes em [moto.md](moto.md#spawnar-e-despawnar).

## Emblemas

O catálogo mostra oito emblemas por página, com busca instantânea por nome, descrição ou identificador (sem distinguir acentos), filtros de raridade e origem (conquistas automáticas ou concessão manual) e ordenação por nome, raridade ou quantidade de jogadores. **Novo emblema** abre a criação; **Editar** abre o formulário direto no topo, sem atravessar a lista. **Catálogo** volta à página, aos filtros e à posição anteriores.

Dentro de um emblema, **Editar emblema** e **Quem tem** separam o formulário da concessão e retirada de jogadores. Os jogadores só são carregados ao abrir essa área. Nome, descrição e motivo são preservados ao mudar a aparência ou alternar entre as duas áreas; **Cancelar** descarta a edição. A barra de salvar fica acessível durante a rolagem. No celular, os cartões e o formulário ficam em uma coluna; as galerias de ícones e imagens têm rolagem própria.

## Servidor

Atualiza a cada 15 s: tempo no ar, requisições, erros 5xx e tempo de resposta p95 da API; memória e disco da máquina (com barras que ficam amarelas acima de 75% e vermelhas acima de 90%), processadores e carga; o processo do mundo (memória, tick p95, última conversa com a API, fila de resultados gravável, preços sincronizados, eventos aguardando o log); o banco de dados (motor, versão, tamanho, conexões no PostgreSQL e cada tabela com registros e tamanho); comandos para o mundo pendentes e com falha e o tamanho do log.

## Integração e validação

Rotas administrativas (sessão autenticada, e-mail confirmado e papel `admin`; a gestão de papéis exige a conta principal):

| Rota | Para quê |
| --- | --- |
| `GET /api/admin/overview` | Lista de contas (`search`, `offset`, `limit`, `filter`, `sort`, `online`) com estados, histórico e denúncias |
| `GET /api/admin/summary` | Visão geral |
| `GET /api/admin/players/:id` · `POST /api/admin/player` | Ficha e alterações (`rename`, `verify`, `logout`, `item`, `skin`) |
| `POST /api/admin/wallet` · `/role` · `/action` · `/revert` | Carteira, permissões, moderação e eventos, reversões |
| `GET /api/admin/reports` · `POST /api/admin/reports/resolve` | Denúncias |
| `GET /api/admin/logs` | Log (`categories`, `player`, `q`, `since`, `before`, `limit`) |
| `GET /api/admin/economy?days=7\|30\|90` | Economia |
| `GET` e `POST /api/admin/prices` | Preços e histórico de mudanças |
| `GET /api/admin/badges` e demais rotas de emblemas | Emblemas ([perfil.md](perfil.md#api)) |
| `GET` e `POST /api/admin/collection` | Cartas e habilidades ([skins.md](skins.md)) |
| `GET /api/admin/server` | Servidor |

Públicas e internas: `GET /api/prices` (tabela efetiva, sem login), `GET /api/internal/prices` e `POST /api/internal/logs` (segredo interno). A migração `008_admin_console.sql` cria `economy_prices` e `game_logs`, acrescenta a resolução às denúncias e índices por data; no desenvolvimento, `npm run dev` aplica (ou `npm run migrate -w @bar/api`).

Os testes cobrem: `apps/api/test/admin.test.ts` (papéis, carteiras, moderação, reversões), `apps/api/test/admin-console.test.ts` (preços aplicados a compras, skins e teto do trabalho, auditoria e volta ao padrão; ficha e alterações com a conta principal protegida; denúncias; log com filtros e paginação sem repetição; economia, resumo e servidor consistentes), `apps/server/test/admin-console.integration.test.ts` (o mundo relê preços, cobra o novo valor no balcão, avisa os navegadores, relê a mochila no controle `sync` e envia o log quando a API volta) e `tests/e2e/admin.spec.ts` (duas contas no navegador: carteira e loja, reversão, itens, delegação, expulsão, banimento, um preço novo chegando ao navegador do outro jogador e o filtro de logs).
