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
| Expulsar | Encerra a participação atual; a conta pode entrar novamente |
| Banir | Revoga as sessões e impede novos acessos até a remoção do banimento |
| Desbanir | Remove o bloqueio; o jogador entra novamente com seu login |
| Dar administrador | Concede administração a uma conta confirmada e não banida |
| Remover administrador | Remove a permissão, preservando personagem, compras e moedas |

Somente a conta principal pode conceder ou remover administradores. Ela não pode ser expulsa, banida ou rebaixada pelo painel. Administradores delegados podem moderar jogadores, ajustar a própria carteira e a dos jogadores e iniciar eventos; a moderação e a carteira de outros administradores ficam sob controle da conta principal.

O botão de administração aparece e desaparece para quem recebe ou perde a permissão durante a partida, em até aproximadamente cinco segundos. A autorização da API usa o papel persistido em cada requisição, independentemente do que estiver aparecendo na interface. Uma sessão antiga não mantém acesso depois da remoção da permissão.

## Integração e validação

Os endpoints administrativos são `GET /api/admin/overview` (busca e paginação), `POST /api/admin/wallet` (ajuste idempotente), `POST /api/admin/role` (permissões) e `POST /api/admin/action` (moderação e eventos). Todos exigem sessão autenticada, e-mail confirmado e papel administrativo; a gestão de papéis exige a conta principal. O cadastro não aceita campos de privilégio enviados pelo navegador.

As tabelas de carteiras, lançamentos, ações de moderação e controles existentes são reutilizadas. A consulta do painel não expõe senhas, cookies ou tokens. Os botões usam as mesmas políticas da API e os campos de entrada são validados novamente no servidor. O identificador dos ajustes funciona também no endereço HTTP da rede local, sem depender de `crypto.randomUUID`, que exige um contexto seguro nos navegadores.

Os testes de API cobrem concessão e revogação na mesma sessão, proteção da conta principal, ativação só após confirmação, saldo zero/limites, pedidos repetidos e concorrentes, compra concorrente com ajuste, auditoria e moderação. O cenário de navegador usa dois clientes e banco de testes isolado para conferir carteira e loja, delegação, remoção de acesso, expulsão, banimento e retorno após desbanimento.

Validação em 22/10/2026: build e TypeScript aprovados; 45 testes de API, servidor e integração aprovados. O cenário de administração passou com dois clientes, tela estreita e a alternativa para navegadores sem `crypto.randomUUID`. Os cenários de criação de personagem e de blackjack/eventos também passaram durante a integração. [Captura do painel no jogo](previews/admin-panel.png).
