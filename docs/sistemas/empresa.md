# A empresa por trás da fábrica (EMPRESA BRASIL)

Desde 2026-11-12 a EMPRESA BRASIL é uma **empresa** com donos, gerentes, carteira própria e ordens de produção. A fábrica ([fabrica.md](fabrica.md)) continua sendo a máquina; esta página descreve quem manda nela e como o dinheiro e o trabalho passam a andar.

## Quem é quem

| Papel | O que faz |
|---|---|
| **Dono** | Tudo: transfere o saldo da empresa para a própria carteira, deposita, compra matéria-prima, define a **própria senha**, admite e demite, nomeia gerentes, **cria** as opções de ordem de produção e as escolhe. Pode haver vários. Só a administração coloca ou tira um dono (a empresa nunca fica sem um). |
| **Gerente** | Admite e demite funcionários comuns, **escolhe** a ordem de produção entre as opções, cancela a ordem aprovada e encerra a que está em andamento. Não mexe no dinheiro nem compra. |
| **Funcionário** | Candidata-se (Perfil → Meu emprego ou aba Emprego da fábrica), entra em expediente, põe o EPI, inicia a ordem aprovada no painel e opera/limpa a fábrica. |

O primeiro dono é a conta que a administração escolheu para a firma (`ownerUserId` das finanças) ou, na falta dela, a conta dona do jogo (`OWNER_EMAIL`); isso só acontece **uma vez** (chave `company-seeded`), para a administração poder removê-la depois. Dono e gerente entram na folha (contratados) automaticamente.

**Candidatura.** Ninguém se contrata mais sozinho: `POST /api/employment/hire` cria uma candidatura (`employments.status = 'applied'`); um dono ou gerente **admite** (vira `hired`, respeitando as 12 vagas) ou **recusa** (a candidatura some e a pessoa pode se candidatar de novo na hora). Também dá para admitir por nome (busca entre quem ainda não trabalha lá). Demitir usa cooldown 0: a firma decide quem volta. Quem é demitido com expediente aberto sai dele na hora e perde o EPI (e o uniforme).

## Gerenciar empresa (Perfil)

Aba do perfil (só aparece para donos e gerentes; a barra de abas rola quando não cabe). Seções:

- **Resumo**: saldo, vendas, receita, gasto, estoque (sacos e paletes), o estado da produção, limpeza pendente e o extrato recente.
- **Dinheiro** (donos): transferir para mim (ou "Tudo"), depositar da minha carteira, trocar/remover a senha, extrato (30 últimos).
- **Matéria-prima** (compra só para donos): um palete cheio de **MALTE custa 30.000** e de **MIX 20.000** por padrão (`rawMaltePrice`/`rawMixPrice` das finanças; a administração muda os dois em Economia → Empresa Brasil, valem na próxima compra), **mais o imposto** (`taxPercent` das finanças, 15% por padrão) por cima. O imposto vai ao cofre da cidade; o resto some (é do fornecedor, que não tem conta). Compra de 1, 2 ou 4 paletes. Cria um pedido de compra: os motoristas veem a carga no HighCargo e, sem ninguém, o motorista do fornecedor entrega em até 30 min (como antes). Um pedido que ninguém pegou pode ser cancelado e **estornado** (o imposto volta do cofre até onde ele tiver).
- **Equipe**: candidatos (admitir/recusar), admitir por nome, lista com cargo e quem está em serviço, demitir, nomear/tirar gerente.
- **Produção**: ver abaixo.

O servidor refaz a checagem de cargo a cada ação (`CompanyDesk.need`, que pergunta à API); o cliente só mostra. Respostas: `company.result` (o que aconteceu ou por quê não) e `company.state` para todos com a aba aberta (`company.watch`).

### Carteira, senha e transferência

Toda venda de produto (`FactoryLogistics.depart`) divide como antes (imposto → cofre, taxa → quem carregou) mas a **parte do dono vai para a carteira da empresa** (`companies.balance`, extrato em `company_ledger`), não mais para a conta do jogador. O saldo nunca fica abaixo de zero (`postToCompany` trava a linha e cada movimento tem um id de extrato, então um retry conta uma vez).

Cada dono pode ter a **sua** senha (hash argon2, `company_members.password_hash`); com senha, toda transferência e compra dele a pede. Cinco erros seguidos travam por 60 s (em memória). A administração pode **remover ou definir** a senha de qualquer dono, ajustar o saldo da empresa e nomear/remover donos e gerentes (Administração → Economia → Donos e caixa, mensagem `admin.company`).

## Ordens de produção (OP)

**Sem OP não há produção.** `tankN.water` (começar um lote) é recusado sem uma OP **em andamento** e com lotes ainda por iniciar.

1. O **dono** cria as opções (`company.op.draw`): o sistema sorteia **três** produtos diferentes do catálogo (`PRODUCTION_CATALOG`: leite em pó, achocolatado, fórmula infantil, café solúvel, sopa, suco, bebida láctea, cappuccino), cada um com receita (sacos de MALTE e MIX por lote) e um número sorteado de lotes. Cada opção mostra a **estimativa de lucro**: produto previsto (de qualidade 70 a 100), matéria-prima com imposto, receita líquida (preço do palete menos imposto e taxa do funcionário) e lucro (esperado e faixa). Os preços são os de hoje (finanças).
2. O dono **ou um gerente** aprova uma (`company.op.approve`): ela vira a OP da fábrica e aparece no painel dos funcionários (aba Início → "Ordem de produção").
3. Um funcionário em serviço, com EPI, no computador da sala de controle, aperta **Iniciar produção** (`op.start`). Exige a fábrica limpa.
4. A receita da OP vale para a fábrica (sacos por lote; a água é 100 L por saco), cada lote iniciado é contado e o painel mostra o andamento. Terminada a última secagem e ensacado o pó, a OP **conclui sozinha**. O dono/gerente pode **encerrar** antes (só com tanques e secador vazios) ou **cancelar** uma OP aprovada que ninguém iniciou.
5. Um palete incompleto na saída do ensaque pode ser fechado (`pallet.close`) e armazenado para vender o que sobrou.

A lista, a OP ativa e o histórico vivem no `FactoryDirector` (`board`) e são salvos com o resto do estado da fábrica.

**Estimativa x realidade.** O preço de venda é o preço fixo do palete (`palletPrice`), então a estimativa usa a mesma conta que a venda real (`estimateProduction` em `packages/shared/src/factory/company.ts`); o que varia é o rendimento do lote (qualidade). O preço padrão do palete passou de 5.000 para **60.000** (a matéria-prima agora custa dinheiro: com 5.000 toda OP dava prejuízo). **Se a administração já tinha salvo um preço, o valor salvo continua valendo** (Economia → Empresa Brasil). Esse formulário agora mostra **Lucro por receita** (as 8 receitas, com os valores digitados) e o menor preço do palete em que nenhuma dá prejuízo; no servidor vivo o palete estava salvo em 27.360 com imposto de 20%, e a esse preço toda OP perdia dinheiro.

## Salário de presença

Funcionário em serviço, com EPI, dentro da fábrica (a até 90 m do painel) **e sem OP em andamento** recebe **500 moedas a cada 30 minutos** por padrão (`idlePay` e `idleEveryMin` das finanças, editáveis na administração; `FACTORY_IDLE_PAY` é só o padrão; `factoryIdleTick`, pagamento de trabalho `job:factory-presenca`, sujeito ao limite diário). Com a produção rodando valem os pagamentos por tarefa. A paga é cunhada pelo jogo, não sai da carteira da empresa (decisão minha, fácil de inverter).

## Sujeira e limpeza

Detalhes do shader em [fabrica.md](fabrica.md#sujeira-shader-e-nível-do-líquido-2026-11-12). Regras:

- Cada lugar tem um nível de sujeira de 0 a 1 (`FactoryDirt`, `CLEAN_TASKS`): os três tanques, o secador, a linha de ensaque e seis zonas de piso (tanques, secador, ensaque, estoque, doca, sala de controle). Sobe com o trabalho (tanque com lote, pó que passa no secador, sacos empilhados e despejados, caminhão na doca).
- Todo tanque que o secador esvazia fica **SUJO** e precisa ser lavado antes do próximo lote.
- Ao **fim de uma OP** tudo fica sujo (pisos pelo menos 70%) e `dirt.required` liga: **nenhuma OP nova começa** até todos os lugares ficarem limpos.
- Lavar é trabalho de pé: **E** no lugar sujo (com expediente e EPI, sem saco na mão) começa uma tarefa de 10 a 12 s (`factory.clean`); o jogador precisa **ficar no lugar** (sair, tirar o EPI ou encerrar o expediente cancela). O servidor termina a tarefa (`factoryTaskTick`) e paga (tanque 20, linha 25, piso 12). O **secador** se lava pelo painel ("Lavar o secador", ele parado): é o ciclo `LIMPEZA` da máquina (paga 40 se estava sujo). O botão Lavar do painel do tanque só avisa onde lavar.

## Mensagens

Cliente → sala: `company.watch|search|transfer|deposit|password|purchase|cancel|admit|reject|dismiss|manager|op.draw|op.approve|op.cancel|op.close`, `factory.clean|clean.cancel`, `factory.cmd` com `op.start`, `pallet.close`. Sala → cliente: `company.state|result|search`, `employment.refresh`, `factory.state` (agora com `dirt`, `production`, `me.clean`). Administração: `admin.company`, `admin.factory.board`. `factory.order.request|cancel` (o computador da fábrica) agora só respondem que a compra é do dono.

## Banco e API

Migração `032_company.sql`: `companies`, `company_members` (cargo e senha), `company_ledger`, `factory_orders.tax/paid_by`, `employments.status` aceita `applied`. Rode `npm run migrate -w @bar/api` e reinicie a API. Serviços: `apps/api/src/company-service.ts` (dinheiro, cargos, pessoas), `company-ledger.ts` (única porta do saldo), rota interna `/api/internal/company`. Mundo: `apps/server/src/company-desk.ts`. Cliente: `apps/web/src/profile/company-tab.ts`.

## Testes

`apps/api/test/company.test.ts` (papéis, senha e bloqueio, transferência, depósito, compra com imposto, estorno, equipe, candidatura), `factory-logistics.test.ts` (a parte do dono vai para a empresa), `apps/server/test/factory.test.ts` (OP, sujeira, limpeza, restauração), `factory.integration.test.ts` (sala real: sem OP o tanque recusa, `op.start`, lavagem) e `factory-freight.integration.test.ts` (compra pelo dono). Fixture da aba: `tests/fixtures/company-tab.html`.

## Não verificado ao vivo

A aba dentro da janela real de perfil (só pelo fixture), a lavagem em jogo com dois jogadores, o salário de presença (um período de 30 min nunca foi esperado de verdade), o shader sob a luz noturna do jogo e o desempenho em máquina fraca.
