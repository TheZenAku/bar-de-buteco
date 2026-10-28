# Administração dentro do jogo

A conta confirmada **rafaelrodrigues-2017@hotmail.com** é a conta principal. A API concede a ela o papel de administrador ao iniciar, ao confirmar o e-mail ou ao concluir o cadastro com a política de ativação automática habilitada. Isso não cria outra conta, não redefine senha e não ignora a confirmação de e-mail quando ela estiver exigida.

Entre no bar e abra **⚙ Administração**, na barra de ferramentas. O painel permite buscar contas por nome, usuário ou e-mail e navegar pelas páginas de resultados. Ele mantém os controles de eventos e apresenta denúncias e histórico com nomes, datas, motivos e alterações de saldo.

## Carteiras

Selecione uma conta, escolha **Adicionar**, **Remover** ou **Definir saldo total**, informe a quantidade e o motivo e pressione **Aplicar ajuste**. É possível ajustar a própria carteira. Valores inteiros entre zero e 1.000.000.000 são aceitos; adicionar/remover exige quantidade positiva e o resultado nunca pode ser negativo ou superar o limite.

Os ajustes são persistidos na carteira usada pela loja. O jogador recebe a atualização de saldo na coleção ou na confirmação de compra aberta em até aproximadamente cinco segundos. As regras de ganhos automáticos continuam desativadas; o painel fornece ajustes manuais para testes.

Cada ajuste usa uma transação com bloqueio da carteira, lançamento no histórico de moeda e registro administrativo com autor, motivo e saldo anterior/final. A repetição do mesmo pedido não concede nem remove moedas novamente. Definir um saldo total exige que o saldo consultado ainda seja atual, evitando sobrescrever uma compra ocorrida enquanto o formulário estava aberto. Adições e remoções operam sobre o saldo atual dentro da transação.

## Moderação e administradores

| Controle | Efeito |
| --- | --- |
| Expulsar | Encerra somente a participação atual; preserva o login e permite entrar novamente |
| Desfazer expulsão | Cancela ordens de expulsão pendentes e marca as expulsões registradas como desfeitas; não remove banimentos |
| Banir | Revoga as sessões e impede novos acessos até a remoção do banimento |
| Desbanir | Remove o bloqueio; o jogador entra novamente com seu login |
| Dar administrador | Concede administração a uma conta confirmada e não banida |
| Remover administrador | Remove a permissão, preservando skins, compras e moedas |

Após uma expulsão, o jogador volta automaticamente à entrada com uma mensagem explicando que sua conta continua liberada. Pode usar **Entrar no bar** na mesma sessão. Uma ordem de expulsão atrasada não atinge uma participação iniciada depois da emissão da ordem. Após banimento, a tela mostra a restrição e pede novo login quando o banimento for removido; sessões revogadas não são restauradas.

Buscar pelo nome, usuário ou e-mail mostra **Desbanir** quando há banimento ativo e **Desfazer expulsão** quando há expulsões ainda não marcadas como desfeitas. A indicação de expulsão é um registro de moderação, não uma restrição persistente de acesso.

## Reverter pelo histórico

Abra **Histórico de ações** e use a opção junto ao registro original. O formulário identifica o jogador, explica o efeito e exige o motivo. O histórico permanece aberto após a operação, apresenta a data da reversão e conserva a ação original. Uma nova ação `undo-*` registra quem desfez e por quê.

| Ação original | Reversão |
| --- | --- |
| Expulsão | Cancela aquela ordem se ainda estiver pendente e marca o registro como desfeito; uma conexão já encerrada precisa entrar novamente |
| Banimento | Remove aquele banimento; outros banimentos ativos continuam valendo. **Desbanir** no cadastro remove todos |
| Adicionar/remover/definir moedas | Compensa o valor efetivamente alterado sobre o saldo atual, preservando compras e outros ajustes |
| Conceder/remover administrador | Restaura o papel anterior somente se não houver alteração de permissão mais recente |
| Evento | Encerra o evento solicitado se ainda for o ativo; não interrompe um evento posterior |

Reversões de moedas usam transação, bloqueio da carteira, lançamento compensatório e identificador derivado da ação original. Pedidos simultâneos ou repetidos não duplicam a compensação. A operação é recusada se o saldo final ficar negativo ou superar o limite; por exemplo, moedas já gastas podem impedir desfazer uma concessão até ajustar a carteira.

As permissões são conferidas novamente no servidor, considerando o papel atual da conta. Administradores delegados não podem reverter permissões nem agir sobre contas protegidas através do histórico. Restaurar um administrador exige e-mail confirmado e ausência de banimento. Reverter uma ação já desfeita não altera restrições ou permissões criadas depois dela. Liberações (`unban`, `unkick`), reversões e a habilitação da conta principal não oferecem reversão automática; para novas alterações, use os controles do cadastro.

Somente a conta principal pode conceder ou remover administradores. Ela não pode ser expulsa, banida ou rebaixada pelo painel. Administradores delegados podem moderar jogadores, ajustar a própria carteira e a dos jogadores e iniciar eventos; a moderação e a carteira de outros administradores ficam sob controle da conta principal.

O botão de administração aparece e desaparece para quem recebe ou perde a permissão durante a partida, em até aproximadamente cinco segundos. A autorização da API usa o papel persistido em cada requisição, independentemente do que estiver aparecendo na interface. Uma sessão antiga não mantém acesso depois da remoção da permissão.

## Integração e validação

Os endpoints administrativos são `GET /api/admin/overview` (busca, estados e opções de reversão), `POST /api/admin/wallet` (ajuste idempotente), `POST /api/admin/role` (permissões), `POST /api/admin/action` (moderação, liberações e eventos) e `POST /api/admin/revert` (ação original + motivo). Todos exigem sessão autenticada, e-mail confirmado e papel administrativo; a gestão de papéis exige a conta principal. O cadastro não aceita campos de privilégio enviados pelo navegador.

As tabelas de carteiras, lançamentos, ações de moderação e controles existentes são reutilizadas, inclusive para registros anteriores a esta atualização. Nenhuma migração ou reinicialização das contas é necessária. A consulta do painel não expõe senhas, cookies ou tokens. Os botões usam as mesmas políticas da API e os campos de entrada são validados novamente no servidor. O identificador dos ajustes funciona também no endereço HTTP da rede local, sem depender de `crypto.randomUUID`, que exige um contexto seguro nos navegadores.

Os testes de API cobrem concessão e revogação na mesma sessão, proteção da conta principal, ativação só após confirmação, saldo zero/limites, pedidos repetidos e concorrentes, compra concorrente com ajuste, auditoria e moderação. O cenário de navegador usa dois clientes e banco de testes isolado para conferir carteira e loja, delegação, remoção de acesso, expulsão, banimento e retorno após desbanimento.

Validação em 22/10/2026: build e TypeScript aprovados; **96 testes** de API, servidor, integração e ferramentas passaram. Os testes incluem reversões concorrentes e repetidas, saldo insuficiente, preservação de ajustes posteriores, proteção de administradores, banimentos sobrepostos, cancelamento de ordens pendentes e controles reais por WebSocket. O cenário no navegador passou com duas contas, devolução de moedas pelo histórico, expulsão seguida de retorno com o mesmo login, desfazer expulsão pela busca, desbanimento pelo histórico e pelo cadastro, delegação e tela estreita. O administrador mantém o painel aberto enquanto a segunda conta entra, evitando renderizar dois mundos simultaneamente na GPU por software da máquina de testes. Site, API e mundo responderam HTTP 200; a nova rota de reversão respondeu HTTP 401 sem autenticação. [Captura do painel no jogo](../previews/admin-panel.png).
