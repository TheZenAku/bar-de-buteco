# Prompt para o Codex — Fábrica de Spray Dry (EMPRESA BRASIL) funcional + sistema de empregos + painel de depuração

> Todas as operações industriais deste documento são **mecânicas de videogame**: números, estados e animações de uma simulação. Nada aqui descreve procedimento químico ou industrial real. Valores (temperaturas, tempos, rendimentos) são de jogo e ficam em tabela editável pela administração.

---

## 0. Como trabalhar

1. Leia tudo antes de codar. Depois escreva um **plano curto** (arquivos que vai criar/alterar, ordem das fases, riscos) e só então implemente.
2. Entregue em **fases** (seção 14). Cada fase termina com testes passando (`npm test`, os testes de integração e o e2e da fase) e com a documentação em `docs/sistemas/` atualizada. Não avance com a fase anterior quebrada.
3. **Estenda o que já existe; não duplique sistemas.** Em especial: `apps/server/src/world/jobs.ts` (empregos por turno do bar), o inventário e o baú do caminhão (`docs/sistemas/caminhao.md`), a carteira, os níveis/XP, o painel de administração, os preços editáveis e os logs.
4. **O servidor é a autoridade.** Quantidades, estado das máquinas, pagamento e emprego nunca dependem do cliente. O cliente só mostra e pede. Toda ação que mexe em quantidade ou dinheiro tem `requestId` (UUID) e é idempotente (padrão do `inventory_ledger` e do baú do caminhão).
5. Tudo que for número de balanceamento (tempos, preços, rendimento, cooldown, vagas, capacidades) vai para **configuração editável na administração**, com valor padrão no código. Nada "mágico" espalhado.
6. Texto de interface em **português do Brasil**. Código e comentários seguem o padrão do repositório.
7. Não publique nada na VM nem rode migração em produção. Prepare a migração e diga como aplicar.

---

## 1. Leitura obrigatória no repositório

- `docs/sistemas/cidade.md`, `admin.md`, `perfil.md`, `economia.md`, `niveis.md`, `caminhao.md`, `inventory.md`, `needs.md`, `desempenho.md`
- `tools/assets/import-city.mjs` (como os marcadores `Ponto_*` chegam ao jogo, e a lista `REQUIRED_MARKERS`)
- `apps/server/src/world/jobs.ts` + `packages/shared/src/economy.ts` (`JOBS`, `JobDefinition`, `JobStation`, `jobById`, `JobSlotsView`)
- `apps/api/src/vehicle-storage-service.ts` e `infra/migrations/024_vehicle_storage.sql` (padrão de transação + ledger idempotente)
- `apps/api/src/pricing-service.ts`, `levels` (XP), `wallet-service.ts`
- `apps/web/src/admin/` (um arquivo por categoria; `console.ts` monta a janela; categoria "Mundo ao vivo" em `world.ts`)
- `apps/web/src/` o painel de perfil (`docs/sistemas/perfil.md`) e o fluxo de mensagens cliente↔sala (`storage.open/move/close` como modelo)
- Última migração existente: `028_arsenal.sql`. As novas começam em **029** e só **expandem** (re-executáveis, sem alterar chaves existentes, sem chave estrangeira onde o padrão do projeto evita).

---

## 2. O que já existe no mapa (NÃO modelar de novo)

A fábrica já está pronta no mapa: setor **S07_04**, lote da Rua da Ferrovia (x ≈ 331–363, z ≈ −48…−81). É um galpão de 26,5 × 31,1 m com interior jogável, colisão e auditado a pé (0 armadilhas, todas as zonas alcançáveis).

### 2.1 Arquivos entregues (já colocados nas pastas do repositório)

Base: `assets-bar/map/BarBoteco/export/` (a pasta que o `npm run assets:map` lê).

| Caminho | Conteúdo |
|---|---|
| `assets-bar/map/BarBoteco/export/cidade/` | Setores da cidade (o S07_04 tem a fábrica), LODs, colisão, `cidade_setores.json`. Entra pelo `npm run assets:map` |
| `assets-bar/map/BarBoteco/export/bar_boteco*.glb`, `bar_env.png` | O bar |
| `assets-bar/map/BarBoteco/export/empresa_brasil/empresa_brasil_estoque.glb/.json` | Saco de 25 kg de cada tipo (`EB_Saco_Malte`, `EB_Saco_Mix`, `EB_Saco_Produto`), arranjo de 18 sacos no palete (`EB_Palete_Arranjo` → `EB_Arranjo_01..18`, 3 por camada × 6 camadas, preencher **na ordem**), e as 25 vagas de palete com tipo, capacidade e posição |
| `.../export/empresa_brasil/empresa_brasil_tanques.glb/.json` | Agitador e líquido de cada tanque + **tabela de cubicagem** (altura → raio da superfície → litros) |
| `.../export/empresa_brasil/empresa_brasil_marcadores.json` | **Todos os 48 `Ponto_EB_*`** com posição em coordenadas do jogo, rotação e `extras` |

Esses arquivos **não** são carregados pelo `prepareCity`. Carregue-os do lado do servidor (dados: JSON; sacos e peças móveis: GLB no cliente) e crie um comando `npm run assets:fabrica` que copia para `apps/web/public/fabrica/` e para um diretório de dados do servidor, no mesmo estilo de `assets:caminhao`. Valide no start do servidor que **todos** os marcadores e vagas esperados existem (falhe com mensagem clara se faltar algum).

### 2.2 Marcadores (`Ponto_EB_*`) — fonte da verdade das posições

Use sempre o nome do marcador, nunca coordenada fixa no código.

| Marcador | Função |
|---|---|
| `Ponto_EB_Portao` | Portão de veículos (Rua da Ferrovia) |
| `Ponto_EB_Doca` | Vaga do caminhão na baia interna (traseira para oeste ou leste) |
| `Ponto_EB_Entrada_Pessoal` | Porta de pedestre (use para o balcão/placa de **contratação**, ver seção 6) |
| `Ponto_EB_Paleteira` | Paleteira manual |
| `Ponto_EB_Empilhadeira` | Empilhadeira patolada (guarda paletes no porta-paletes) |
| `Ponto_EB_Balanca` | Balança de plataforma |
| `Ponto_EB_Rack_V{1..3}N{1..3}P{1..2}` | **18 vagas de porta-paletes**: 3 vãos (V1, V2 = **MALTE**; V3 = **MIX**) × 3 níveis (N1 chão `nivel_m 0`, N2 `1,55`, N3 `3,10`) × 2 posições. Extras: `tipo`, `capacidade` (18), `nivel_m` |
| `Ponto_EB_PA_1..6` | 6 vagas de palete de **PRODUTO** acabado, no chão, junto à baia |
| `Ponto_EB_PA_Ensaque` | Palete sendo montado ao lado da ensacadeira (vaga de trabalho) |
| `Ponto_EB_Tanque_{1..3}` | Boca de carga de cada tanque (tampa basculante) |
| `Ponto_EB_Tanque_{1..3}_Operador` | Onde o jogador fica na plataforma (2 m) para despejar o saco |
| `Ponto_EB_Painel` | Console da sala de controle (cadeira do operador) |
| `Ponto_EB_Bomba_Alta_Pressao` | Bomba de alimentação do secador |
| `Ponto_EB_Secador_Base` | Válvula rotativa de descarga |
| `Ponto_EB_Secador_Topo` | Topo do secador / atomizador (plataforma a 8,6 m) |
| `Ponto_EB_Secador_Inspecao_{N,S,L,O}` | Pontos de inspeção na plataforma de 4,2 m |
| `Ponto_EB_Ensaque` | Operador da ensacadeira |
| `Ponto_EB_Ensaque_Bico` | Bico de enchimento |
| `Ponto_EB_Ensaque_Saida` | Fim da esteira (saco pronto, ao lado do palete) |

### 2.3 Medidas úteis (já nos JSONs)

- Saco de matéria-prima 0,70 × 0,45 × 0,15 m (25 kg); saco de produto 0,68 × 0,44 × 0,14 m (25 kg); palete 1,0 × 1,2 × 0,144 m; **18 sacos por palete**.
- Tanque: volume útil **6.646,6 L**, altura útil 2,035 m. Tags `TQ-101/102/103`; `eixo_jogo_xyz` e `fundo_jogo_y` no JSON. A superfície do líquido (nó `EB_Tanque_N_Liquido`) sobe pela tabela de cubicagem: dado um volume em litros, ache a altura por interpolação linear e escale/posicione o nó.
- Nós dinâmicos do GLB dos tanques vêm com sufixo (`EB_Tanque_1_Agitador.001`, `EB_Tanque_1_Liquido.001`): **ache por prefixo**, não por nome exato.

### 2.4 Limites honestos do modelo (planeje em volta deles)

- As **telas** dos monitores, o painel da ensacadeira e os mostradores estão **assados na malha estática** (`S07_04_Estatico`, material `EB_Telas`), sem nó individual. Portanto o painel de controle vivo é uma **janela de interface** (SCADA, seção 9) aberta no `Ponto_EB_Painel`, mais **overlays leves** posicionados por marcador (luz de torre, vapor, pó, brilho do queimador). Não tente trocar a textura de monitor por monitor.
- Peças que se movem **no modelo** hoje: agitadores e líquido dos tanques e os sacos (estoque). O resto (válvula rotativa, esteira, bico, queimador, ciclone, exaustor) é malha estática: represente com **efeitos** (partículas, luzes pontuais, som, sprite) ancorados nos marcadores. Se achar que falta uma peça móvel (ex.: esteira ou bico animados), **liste no relatório final o que falta e peça nova exportação**; não improvise geometria.
- Luzes de alerta/sinaleiros: use luzes pontuais do motor nas posições dos marcadores.
- Custo do setor: 186 mil triângulos, 82 chamadas de desenho. **Não adicione geometria pesada** nem muitas luzes dinâmicas (limite sugerido: ≤ 6 luzes dinâmicas ativas na fábrica; use pool). Sacos em estoque devem usar **instanciamento** (um draw por tipo de saco), nunca um mesh por saco.

---

## 3. Visão geral do que construir

1. **Cadeia logística real, sem prateleira cheia de graça.** O galpão começa **vazio** (paletes e racks sem sacos). A matéria-prima só aparece quando um **jogador entrega** por caminhão. O produto acabado só aparece quando alguém **produz e ensaca**.
2. **Processo de fábrica de Spray Dry** (seção 5): recebimento → armazenagem → pesagem/dosagem → preparo da emulsão no tanque → transferência → secagem por atomização → coleta/peneira → ensaque → paletização → expedição.
3. **Interface e instrumentação dinâmicas** (seção 9): painel de controle com telas de tanques, secador, alarmes e ensaque; indicadores nos pontos de operação; tudo interativo.
4. **Sistema de empregos** (seção 6) com o cargo **Operador de Spray Dry**: contratação, cargo no perfil, pedir demissão com cooldown, expediente ligado/desligado e horário programado.
5. **Painel de administração "Fábrica"** (seção 10) com funções de depuração de **tudo** que for criado.
6. Persistência, segurança, testes e documentação (seções 11–13).

---

## 4. Arquitetura sugerida (ajuste ao que o repositório já tem)

- `packages/shared/src/factory/` — tipos, constantes, receitas, tabelas, **máquina de estados pura** e regras de interação (testáveis sem servidor). Exporte o que o cliente precisa pelo índice do pacote; o que for pesado fica fora do índice (como `city-roads`).
- `apps/server/src/world/factory/` — `FactoryDirector` (estado vivo + `tick`), com submódulos: `stock` (vagas/paletes), `tanks`, `dryer`, `bagging`, `orders` (ordens de compra/venda), `alarms`, `equipment` (paleteira/empilhadeira/balança). Ligado à sala e ao `tick` existentes, como o `JobDirector`.
- `apps/api/src/factory-service.ts` — dona dos **dados persistentes e do dinheiro**: estoque, ordens, lotes, histórico, pagamentos. Rota interna `POST /api/internal/factory` (ações `view | move | …`), só com segredo interno e sessão viva, como `vehicle-storage`.
- `apps/api/src/employment-service.ts` — emprego (seção 6). Rotas internas e rotas autenticadas para o perfil.
- `apps/web/src/factory/` — cliente: cenas dos sacos (instanciamento), tanques animados, efeitos, painel SCADA, HUD de tarefa, prompts de **E**.
- `apps/web/src/admin/factory.ts` — categoria de administração.
- Mensagens cliente↔sala em espaço de nomes `factory.*` e `employment.*`, com schema (zod) como `storageOpenSchema`.
- **Tick:** a simulação avança por tempo no servidor (ex.: 4 Hz para processos, 1 Hz para alarmes) com `dt` real, e continua com a sala vazia **apenas** se o lote estiver em processo contínuo seguro (decida e documente: sugestão — processos pausam, em estado seguro, quando não há operador em expediente na fábrica, e retomam; nunca "perdem" material).
- Desempenho: a fábrica só simula tempo real de equipamentos quando há algum processo ativo; o estoque é só dado.

---

## 5. O processo de fábrica (versão para o jogo)

Pesquisa-base: uma planta de **secagem por atomização (spray drying)** de pó alimentício recebe matéria-prima em sacos, dissolve/emulsiona em tanque agitado e com camisa de aquecimento, bombeia o líquido a alta pressão até um atomizador no topo de uma câmara onde passa ar quente, o pó cai ao cone, sai pela válvula rotativa, o ar sai por ciclone/exaustor, o pó é peneirado, ensacado, pesado, identificado por lote, paletizado e expedido, com amostras de controle de qualidade e limpeza entre lotes. A versão do jogo mantém a **sequência e a lógica de causa e efeito**, com números e tempos de jogo.

### 5.1 Produto e receita (padrão, tudo editável na administração)

- Produto: **"Bebida Maltada em Pó 25 kg"** (nome do jogo; `EB_Saco_Produto`).
- **Receita de 1 lote por tanque** (`recipe.default`):
  - Água: **1.200 L**, alvo **65 °C**
  - **MALTE**: 8 sacos (200 kg)
  - **MIX**: 4 sacos (100 kg)
  - Ordem obrigatória: água → malte → mix, **com o agitador ligado**.
  - Volume final = água + kg × 0,65 L/kg ≈ **1.395 L** → use a **tabela de cubicagem** para a altura do líquido (≈ 0,6 m).
- Rendimento: `sacos_de_produto = floor(kg_sólidos × rendimento / 25)`, com `rendimento` entre **0,80 e 0,97** conforme a **qualidade do lote** (seção 5.5). Com a receita padrão: até **11 sacos** por lote. O saldo de kg não ensacado fica no **silo/coletor** (estado `pó pendente`) para o próximo saco.
- Capacidade: 3 tanques podem preparar em paralelo; o secador processa **1 lote por vez**; há fila de lotes aguardando.

### 5.2 Etapas e estados (máquina de estados no servidor)

**A. Recebimento (caminhão → doca).** Ver seção 7.

**B. Armazenagem (racks).** Cada uma das 25 vagas guarda no máximo 18 sacos de **um único tipo** (MALTE só nos vãos V1/V2, MIX só no V3, PRODUTO só nas PA). Vaga sem tipo aceita o tipo do marcador. Paletes novos chegam **cheios (18)** da entrega; saco avulso pode sobrar de palete aberto.

**C. Preparo no tanque** (`Tanque N`, estados):
`VAZIO → ENCHENDO_AGUA → AQUECENDO → AGUARDANDO_INSUMOS → DISSOLVENDO → HOMOGENEIZANDO → AGUARDANDO_QUALIDADE → PRONTO_PARA_TRANSFERIR → TRANSFERINDO → VAZIO | SUJO`
  - O operador abre o **registro de água** no painel (ou na válvula do tanque): sobe o nível pela tabela; para quando atingir o volume da receita (pode errar para mais ou menos: afeta a qualidade).
  - **Aquecer** a camisa até o alvo; o termômetro do tanque sobe com inércia (primeira ordem). Aquecer demais ou de menos fora da faixa (`60–70 °C`) reduz qualidade.
  - **Despejar sacos** (seção 8.2): só com agitador ligado e tampa aberta; sacos fora da ordem ou com agitador desligado geram **grumos** (penalidade de qualidade e tempo extra de dissolução).
  - **Dissolver** (tempo de jogo ≈ 90 s com agitador ligado) → **Homogeneizar** (≈ 60 s) → **Qualidade**: o operador coleta **amostra** na válvula de amostragem e vê no painel °Brix/viscosidade/temperatura do jogo; aprova ou reprova. Reprovado: corrigir (adicionar água ou aquecer/agitar mais) ou **descartar** (perde material, vai para "resíduo").
  - Nível, temperatura e rotação do agitador são **dados reais do estado** que movem o modelo: o nó `EB_Tanque_N_Liquido` sobe/desce com a cubicagem; o agitador gira com a rotação (rad/s proporcional); se o motor desarma, para.
**D. Transferência.** Abrir válvula de fundo, ligar bomba sanitária e **bomba de alta pressão** (`Ponto_EB_Bomba_Alta_Pressao`), com pressão crescendo; o nível do tanque desce pela tabela enquanto o secador consome. Só um tanque alimenta o secador por vez.
**E. Secador** (`PARADO → PRE_AQUECENDO → PRONTO → PRODUZINDO → RESFRIANDO | FALHA | LIMPEZA`):
  - Pré-aquecer: queimador acende, ar de entrada sobe até **180–200 °C** com inércia (~3 min de jogo); ar de saída estabiliza em **80–95 °C**. Só aceita alimentação com a faixa estabilizada.
  - Produzindo: consome o líquido na vazão configurada (ex.: 1.100 L/h de jogo, acelerável pelo multiplicador de depuração). Gera **pó** na saída em kg/s proporcional à vazão × rendimento.
  - Variáveis no painel: temperatura de entrada, de saída, pressão da bomba, rotação do exaustor, ΔP do ciclone, umidade do pó (alvo 3–4%), nível do silo de pó, estado da válvula rotativa.
  - **Falhas** (probabilidade baixa, configurável, sempre com sinal e correção possível): bico entupido (pressão sobe / vazão cai → exige inspeção na plataforma de 4,2 m, `Secador_Inspecao_*`), queimador apagou (temp. cai → reacender no painel), exaustor desarmou (ΔP cai → rearmar no painel), válvula rotativa travada (pó acumula → destravar na base `Secador_Base`), alta temperatura de saída (umidade sobe/queima pó → reduzir). Operar fora da faixa **degrada a qualidade** do lote e, se grave, aciona **parada de emergência** (que é um botão real no painel e na botoeira da ensacadeira).
  - Ao terminar o lote: **resfriar** (ar frio, ~1 min) e, entre produtos/lotes ruins, **limpeza** (mini-ação na base e no painel; tanque `SUJO` exige lavar antes de reusar).
**F. Coleta e peneira.** O pó sai pela válvula rotativa para o **silo de pó** (estado numérico em kg). A peneira/ímã são verificações automáticas no jogo, com alarme de "contaminação" só se a administração injetar a falha.
**G. Ensaque** (ver 8.3): pegar saco vazio → posicionar no bico → encher até **25,0 kg** pela balança (tara/bruto, tolerância ±0,2 kg) → fechar (costura) → etiquetar com **lote + data de produção + validade + peso** → esteira → colocar no palete (`PA_Ensaque`). Palete completo (18) vira **palete de produto acabado** pronto para a paleteira.
**H. Paletização e expedição.** Mover paletes com paleteira/empilhadeira para `PA_1..6`; **ordens de venda** (seção 7.4) retiram esses paletes para o caminhão.
**I. Qualidade e rastreabilidade.** Cada lote tem registro: horário, operador(es), receita real usada, temperaturas médias/máximas, alarmes, qualidade final (0–100), rendimento, sacos produzidos, descartes. Cada saco/palete carrega o número do lote.

### 5.3 Segurança (mecânica de jogo)

- Zona do secador e plataformas: o jogador precisa estar em **expediente**, com **EPI virtual** (capacete/luva/óculos: um simples estado "EPI colocado" no armário/ponto da entrada, que também vira visual simples no avatar, se o sistema de roupas permitir) para operar equipamento. Sem EPI: o painel mostra aviso e as ações de campo ficam bloqueadas.
- **Parada de emergência** global (painel + botoeira): para bomba, queimador e agitadores em segurança, acende sirene/luz de torre (efeito + som), exige **rearme consciente** de quem está em expediente.
- Bloqueios de intertravamento (não deixe fazer o impossível): bomba não liga com tanque vazio; queimador não acende sem exaustor; alimentação não abre com ar fora da faixa; abrir tampa com agitador acima de X rpm → agitador desacelera.

### 5.4 Tempo da simulação

Todos os tempos usam `ms` reais com **fator global** `factory.timeScale` (padrão 1) editável na administração para testar rápido (até 60×). Um ciclo completo padrão (lote → ensaque de 11 sacos) deve durar **25–35 minutos reais** com 1 a 2 operadores. Documente os tempos padrão em tabela no doc.

### 5.5 Qualidade do lote

`qualidade = 100 − penalidades`, sempre explicáveis no registro do lote (lista "o que penalizou"): erro de volume de água, temperatura fora de faixa e por quanto tempo, ordem errada de insumos, agitador desligado ao despejar, tempo de dissolução curto, temperatura de entrada/saída do secador fora da faixa, falha não corrigida a tempo, amostra pulada. Mapeie `qualidade → rendimento (0,80–0,97)` e → preço do lote na venda (`× 0,6…1,2`). Lotes abaixo de um mínimo (padrão 40) são **reprovados** e viram "refugo" (sacos só valem como refugo).

---

## 6. Sistema de empregos (genérico) + cargo "Operador de Spray Dry"

Hoje `JobDirector` cuida de **turnos de tarefas** do bar (`Ajudante do Magrão`). Crie uma camada de **vínculo empregatício** que serve para qualquer emprego do jogo e **não quebre o fluxo do bar**: o emprego do bar continua funcionando como está (modo `shift`, sem contrato), e a camada nova suporta emprego com contrato (modo `contract`), que a fábrica usa. Deixe pronto o caminho para o bar migrar depois (não migre agora).

### 6.1 Modelo de dados (migração `029_employment.sql`, só expande)

- `employment_jobs` (id texto, nome, descrição, `mode`, `cooldown_ms`, `max_slots`, `enabled`, `pay_model` jsonb): catálogo dos empregos (semente: `spraydry` = "Operador de Spray Dry"). Pode viver só em código/`shared` com overrides persistidos — escolha o mais simples que permita edição pela administração.
- `player_employment` (`player_id`, `job_id`, `status` `employed|resigned|fired`, `hired_at`, `ended_at`, `cooldown_until`, `on_duty`, `duty_since`, `schedule` jsonb, `total_seconds_on_duty`, `total_earned`, `tasks_done`) com **uma linha ativa por jogador por emprego**.
- `employment_history` (apenas inserções): admissão, demissão, expediente (entrar/sair/automático), motivo, quem executou (jogador/sistema/administrador).
- Tudo auditável nos **logs** do admin ("Admitido como Operador de Spray Dry", "Pediu demissão", "Demitido pela administração (motivo)").

### 6.2 Regras

- **Admissão:** o jogador vai até o **balcão de RH** em `Ponto_EB_Entrada_Pessoal` (prompt de **E**: "Candidatar-se a Operador de Spray Dry") e confirma. Condições configuráveis: vagas livres (padrão **6**), emprego aberto, sem cooldown ativo, nível mínimo (padrão 0), sem outro emprego com contrato (padrão: **1 emprego com contrato por vez**; regra editável). Ao aceitar: ganha o **cargo** "Operador de Spray Dry" (aparece no perfil), recebe a ação de **EPI** disponível e pode ligar o expediente.
- **Pedir demissão:** botão no painel de emprego (com confirmação). Efeitos: sai do expediente na hora; qualquer tarefa/estação que tenha em mãos é liberada com segurança (saco na mão volta ao chão/palete de origem, tanque em processo continua com a máquina de estados, equipamento reservado liberado); entra em **cooldown** para voltar (**padrão 60 min**, editável; aviso claro do tempo restante). Se quiser voltar antes: mensagem "Você pediu demissão há X. Volte em Y min".
- **Demitido pela administração:** mesma limpeza; cooldown opcional (padrão 0, campo no formulário).
- **Expediente (em serviço / fora de serviço):** o jogador **decide** quando está trabalhando.
  - Manual: botão **"Entrar em expediente" / "Sair do expediente"** (também na própria fábrica, no `Ponto_EB_Painel` e no armário/EPI).
  - **Horário programado:** o jogador define, por dia da semana, uma janela diária (início/fim, fuso `America/Sao_Paulo`, relógio real do servidor), ex.: seg–sex 19:00–23:00. Quando ativo e "programado ligado", o sistema entra/sai do expediente sozinho e **avisa** (toast discreto; só o essencial). Um interruptor "seguir horário programado" liga/desliga a programação sem apagá-la. Entrada/saída manual **sobrepõe** a programação até a próxima janela.
  - Só **em expediente** o jogador opera equipamentos, acumula tarefas, ganha pagamento e XP, e aparece como "Em serviço" para os outros. Fora de expediente continua empregado (cargo visível), mas a fábrica o trata como visitante: não opera, não recebe.
  - Sair do jogo, desmaiar, morrer ou ficar **inativo** (padrão 10 min sem interagir na fábrica, editável) encerra o expediente com segurança.
  - Expediente tem **teto de duração por sessão** configurável (padrão 3 h) para não segurar vaga infinita; ao fim, aviso 2 min antes.
- **Vagas:** vagas por **expediente simultâneo** (não por contratados): padrão 6 operadores em serviço ao mesmo tempo, e até 12 contratados (ambos editáveis). Sem vaga em serviço: mensagem "todas as vagas em serviço ocupadas", fila opcional (não obrigatória).
- **Pagamento (padrão, tudo em Preços):** por tarefa concluída (valor por tipo: despejar saco, aprovar lote, ensacar saco, paletizar, resolver falha…) **mais** bônus por lote com qualidade ≥ 80 dividido pelos operadores que participaram, mais XP. **Teto diário de ganhos de emprego** reutilizando o mecanismo que a API já usa para o bar. Pagamento sempre pela **API**, idempotente (`reason: job:spraydry:<loteId>:<tarefa>`), com fila de reenvio como o `unpaid` do `JobDirector`.
- **Anti-abuso:** tarefas só pagam se o estado do jogo mudou de verdade (saco realmente entrou no tanque, saco realmente cheio, etc.); nunca por clique. Limite de tarefas pagas por minuto por jogador; eventos suspeitos vão para o log do admin.

### 6.3 Perfil e interface do emprego

- No **perfil** (`docs/sistemas/perfil.md`): linha "**Emprego:** Operador de Spray Dry — desde DD/MM/AAAA" e, se em expediente, um selo **"Em serviço"**. Visível aos outros jogadores (decida e documente se o tempo trabalhado também é público; padrão: só cargo e selo).
- Para o **dono do perfil**, botão **"Meu emprego"** abre a janela de gestão (arrastável, padrão das outras janelas do jogo, `Esc` fecha): cargo, data de admissão, **tempo total em serviço**, tarefas, ganhos, **botão de expediente**, **editor do horário programado** (grade por dia da semana), **"Pedir demissão"** (com confirmação e o cooldown explicado), histórico recente.
- Quando em cooldown: mostrar o contador e desabilitar a candidatura com o motivo.
- Nome acima da cabeça: respeitar o padrão de níveis/nomes existente; um indicador discreto de "em serviço" é opcional e deve ser desligável.
- Mensagens de interface: **só o essencial** (o projeto já limitou toasts); estados longos vão na janela, não em avisos repetidos.
- Celular/telas pequenas: janela ocupa a largura.

### 6.4 Mensagens e API

- Sala: `employment.state`, `employment.apply`, `employment.resign`, `employment.duty` (`on|off`), `employment.schedule.set`, com schemas e `requestId`.
- API interna (padrão `internal.ts`): admissão, demissão, expediente, programação, leitura; validações no servidor **sempre**: cooldown, vagas, regra de um emprego por vez, existência do jogador.
- Um **serviço de relógio** do servidor avalia as programações a cada 30 s (e só dos jogadores conectados), usando fuso fixo; teste com relógio injetável.

---

## 7. Logística: matéria-prima por caminhão, estoque, produto acabado

### 7.1 Princípio

Os racks começam **vazios**. A matéria-prima **só entra** quando um jogador (com o **Caminhão Baú** ou outro veículo de carga que o jogo tiver) **cumpre uma ordem de compra** e descarrega na doca. Qualquer jogador pode ser o entregador (trabalho avulso, não exige o emprego de operador). Quem opera a fábrica pode **emitir ordens de compra** pelo painel; a administração também.

### 7.2 Ordem de compra (fornecimento)

- Estados: `ABERTA → ACEITA → CARREGADA → NA_DOCA → DESCARREGANDO → CONCLUIDA | CANCELADA | EXPIRADA`.
- Conteúdo: tipo (MALTE ou MIX), **n paletes** (cada um com 18 sacos = 450 kg), prazo, **preço pago ao entregador por palete** (tabela Preços), e quem emitiu.
- **Fornecedor:** crie um ponto de coleta configurável. **Padrão:** o marcador existente `Ponto_Transportes` (centro de transportes), com raio de interação; a administração pode trocar por coordenada (botão "usar minha posição"). Se esse marcador não existir no export, o servidor falha na validação (já está em `REQUIRED_MARKERS`).
- Fluxo do entregador:
  1. Aceita a ordem (painel da fábrica, ou app/mural, o que o jogo já tiver; no mínimo o painel em `Ponto_EB_Painel` e uma lista na administração).
  2. Vai ao fornecedor com o caminhão e **carrega** os paletes no baú (ação segurando **E** com barra de progresso, um palete por vez, com limite de **capacidade do baú**: padrão 4 paletes por viagem, editável). A carga **usa o baú do caminhão** (`vehicle_storage`): itens novos `eb:palete-malte`, `eb:palete-mix` (stack no baú, **sem** ocupar a mochila). Respeite as regras do baú (só o dono abre, parado, traseira, uma pessoa por vez). Carga visual do caminhão (`carga_1…3`) já reage ao baú.
  3. Dirige até o `Ponto_EB_Portao` e entra na baia (`Ponto_EB_Doca`; o caminhão **sai de ré**, não há manobra de retorno). A colisão do piso do galpão é `COL_Cid_Quadra` (onde veículo anda): confirme a entrada em teste.
  4. **Descarrega**: tira palete do baú pela traseira e o leva até um rack vazio compatível com o tipo (seção 8.1). A ordem só **conclui** quando o palete chega à **vaga do rack** (estado do servidor muda), e então o entregador é pago.
- **Idempotência e roubo/transferência:** o item do baú só vira estoque da fábrica por uma **transação da API** (move baú → fábrica com `requestId`, igual `storage-withdraw`), que valida o dono, a ordem e a proximidade. Nunca confie no cliente.
- **Falhas:** ordem expirada devolve nada (o jogador fica com a carga: ela é do baú dele; sugestão — palete "sem destino" pode ser guardado/descartado). Caminhão perdido (garagem/guincho) com carga de ordem: a carga acompanha o baú; a ordem expira normalmente. Documente.
- **Quando ninguém entrega:** a fábrica fica sem insumo e o painel mostra "ESTOQUE BAIXO" com contagem por tipo. A administração tem função de **entrega fantasma** (seção 10) para testar.

### 7.3 Estoque

- Fonte da verdade: tabela `factory_slots` (uma linha por vaga: `slot_id`, `tipo`, `quantidade`, `lote_id` opcional, atualizado em) e `factory_pallets` se você preferir tratar palete como entidade (decida e justifique: sugestão — palete como entidade com `id`, `tipo`, `sacos`, `lote`, `posicao`, para a paleteira/empilhadeira poderem mover paletes, **e** vaga apontando para o palete).
- No cliente: para cada vaga com N sacos, instancie o saco do tipo nas **N primeiras posições de `EB_Arranjo_01..18`**, relativas ao marcador da vaga e à altura `nivel_m`. O palete de madeira (`INST_P_EB_Palete`) já existe como instância no mapa em posições de vaga **do mapa**, então **só desenhe sacos**; para palete que está sendo movido (na paleteira), desenhe o palete+sacos como grupo móvel.
- Consumo: despejar um saco no tanque **remove 1 do palete aberto** daquela vaga. O saco que o jogador carrega **sai** da vaga (estoque) no pegar e **entra** no tanque no despejar; se o jogador largar/desistir, o saco **volta** à vaga ou fica no chão por TTL curto (decida e documente) — nunca desaparece sem registro.
- Obstáculo dinâmico: paletes/pilhas no corredor podem virar colisor dinâmico simples (opcional, só se o sistema de colisão do jogo permitir sem refatorar; senão registre como limitação).
- Persistência: reiniciar o servidor **não** esvazia nem enche a fábrica.

### 7.4 Produto acabado e ordem de venda

- Paletes de produto vão para `PA_1..6`. Para não encher para sempre, existe a **ordem de venda**: a fábrica (ou a administração) emite pedidos de **n paletes de produto**, qualquer jogador com baú as retira (mesma mecânica inversa: carrega na doca → entrega no destino configurável, padrão `Ponto_Supermercado`) e recebe pagamento por palete conforme a **qualidade** do lote; parte do valor volta como "caixa" da fábrica (apenas contador de economia do jogo, editável).
- Se o pátio estiver cheio (6 vagas de PA + `PA_Ensaque`), o ensaque **para** com alarme "SEM VAGA NO PRODUTO ACABADO".

---

## 8. Interações e manuseio (tudo "absolutamente" interativo)

Siga o padrão do jogo: prompt de **E** perto do objeto (use `canInteract`/`Interactable`), ações segurando com barra de progresso, interrupção segura ao se afastar, estado no servidor.

### 8.1 Paleteira (`Ponto_EB_Paleteira`) e empilhadeira (`Ponto_EB_Empilhadeira`)

- **Paleteira manual:** o jogador **pega** a paleteira (ela vira "objeto carregado/conduzido": ao pegar, o jogador anda mais devagar, não pula e não corre). Com a paleteira **vazia**: encostar num palete (no baú do caminhão, no chão da doca ou numa vaga de chão) e **"Engatar palete"**; com palete engatado, ele **segue a paleteira** (modelo do palete + sacos à frente do jogador, instanciado) e o jogador **solta** em vaga de **chão** compatível (`N1` dos racks, `PA_*`, `PA_Ensaque`) ou na **doca**/baú. Não sobe nível 2/3.
- **Empilhadeira patolada:** para níveis `N2` (1,55 m) e `N3` (3,10 m): o jogador chega ao ponto da empilhadeira, **seleciona o palete** (no chão da frente do rack) e a **vaga de destino** (lista das vagas livres compatíveis/ ou clique), e a ação "Guardar" (e "Retirar") dura segundos de jogo com **animação simples do palete subindo** (interpolação; sem criar rig novo) e som. Uma pessoa por vez na empilhadeira.
- Regras: um palete por paleteira; vaga ocupada por outro tipo/palete é recusada com mensagem curta; palete aberto (menos de 18) pode ser guardado e consumido.
- **Reserva e concorrência:** paleteira/empilhadeira/vaga reservadas ao operador enquanto em uso (com TTL e liberação em saída/queda); dois jogadores não movem o mesmo palete.
- Som: motor elétrico/hidráulico leves (reutilize o `audio` existente; se faltar, sintetize curtos e discretos), rodas no piso epóxi.

### 8.2 Sacaria e despejo no tanque

- **Pegar saco:** de um palete na vaga (o próprio rack em N1, ou palete no chão/paleteira): "Pegar saco" (E, curta). O jogador carrega **1 saco por vez** (25 kg), anda um pouco mais devagar, não corre, **sem pular**, e o saco aparece **na frente do torso** (use o mecanismo de itens na mão do jogo; se não existir um genérico de "carregar objeto", crie um mínimo reaproveitável e documente).
- **Subir à plataforma de 2 m** de cada tanque (escada já modelada, degraus ≤ 0,26 m): em `Ponto_EB_Tanque_N_Operador`, com tampa aberta (aberta/fechada é estado do tanque) e saco na mão, **segurar E "Despejar saco"** (2–3 s): a tampa mostra o saco esvaziando (efeito de partículas claras na boca), o saco some, o **material entra no tanque** (kg), o líquido sobe pela cubicagem (a massa dissolvida altera o volume com 0,65 L/kg).
- Saco vazio vira "papel vazio" que vai para o **lixo** (opcional: ponto de descarte) ou desaparece com som; escolha o simples e consistente, e registre.
- Se o jogador tentar despejar com condições erradas (tampa fechada, agitador desligado, tanque sem água, tanque em outra fase): mensagem curta e **sem perder o saco**.
- Contador de **sacos esperados da receita** visível na plataforma e no painel (ex.: "Malte 3/8 · Mix 0/4").

### 8.3 Ensacadeira (`Ponto_EB_Ensaque`, `_Bico`, `_Saida`, `PA_Ensaque`)

- Passos (cada um com ação de E/segurar e checagem de estado):
  1. **Pegar saco vazio** do fardo de sacos vazios (ponto no operador; estoque de sacos vazios do jogo, **consumível**, reposto por ordem de compra ou pela administração — decida e liste).
  2. **Posicionar no bico** (prender as garras: luz da coluna fica **amarela**).
  3. **Iniciar enchimento** (painel/botoeira): o peso na **balança** sobe de 0 a **25,0 kg** (visor no painel; vazão configurável ≈ 25 kg em 8–10 s de jogo); tolerância ±0,2 kg: fora disso o saco é **refugo** ("Sobrepeso/Subpeso") e o operador pode **ajustar** (abrir/fechar a dosagem fina durante o enchimento, mini-interação opcional, mantenha simples).
  4. **Soltar e costurar** (costuradeira: ação segurando E).
  5. **Etiquetar** automático com lote/validade (mostre no painel; saco carregado tem tooltip "Lote N · validade").
  6. **Esteira** até `Ponto_EB_Ensaque_Saida` (animação por interpolação/efeito; o saco aparece no fim) → operador **empilha no palete** de `PA_Ensaque` (E "Empilhar"). 18 sacos completam o palete.
- Se o silo de pó estiver vazio, o enchimento não inicia ("SEM PRODUTO NO SILO"). Se a saída estiver cheia, para.
- Luz torre (verde/amarela/vermelha) e sirene nos pontos de emergência.

### 8.4 Plataformas e inspeção do secador

- `Secador_Inspecao_{N,S,L,O}` (plataforma de 4,2 m): ações **"Inspecionar bico/atomizador", "Verificar vedação", "Conferir visor"** etc., usadas como **correção** de falhas (seção 5.2.E) e como **verificação periódica** opcional que dá bônus de qualidade.
- `Secador_Topo` (8,6 m): inspeção do atomizador e do distribuidor de ar. `Secador_Base`: válvula rotativa (destravar/limpar).
- Tudo com tempo, prompt claro, sem teleporte; as escadas já levam até lá.

### 8.5 Balança de plataforma (`Ponto_EB_Balanca`)

- Ação "Conferir peso do palete": mostra peso (n sacos × 25 kg + palete 22 kg) e permite **registrar** o recebimento (a conferência pode ser **exigida** pela ordem de compra: conferir antes de guardar dá bônus; opcional).

### 8.6 Equipamento, desgaste e manutenção (opcional, mas dê o gancho)

- Cada equipamento tem estado `ok/atenção/falha` e contador de horas; um evento de **manutenção preventiva** na bancada de oficina (a bancada e a oficina já existem no mapa) zera avisos. Implemente só o contador e uma ação simples; deixe o resto como extensão documentada.

---

## 9. Interfaces e instrumentação (SCADA do jogo)

### 9.1 Janela "Sala de controle" (abre em `Ponto_EB_Painel`, E)

Janela arrastável, estilo do jogo, atualiza **ao vivo** (mensagem de estado a ~2–4 Hz só enquanto aberta, com delta). Abas:

1. **Visão geral:** mímico simplificado da planta (tanques → bomba → secador → ciclone → silo → ensaque → palete), com cores de estado, setas de fluxo animadas e números principais.
2. **Tanques:** para TQ-101/102/103: estado, **nível (%) e litros**, temperatura, rotação do agitador, tempo na etapa, **receita** (insumos esperados × recebidos), qualidade parcial, botões **Água on/off, Aquecer on/off + alvo, Agitador on/off, Amostra, Aprovar/Reprovar, Transferir, Descartar, Lavar**.
3. **Secador:** temperaturas de entrada e saída (gráfico de tendência dos últimos minutos), pressão da bomba, vazão, exaustor, ΔP do ciclone, umidade do pó, silo (kg), queimador, válvula rotativa; botões **Pré-aquecer, Parar, Alimentar tanque N, Reacender, Rearmar exaustor, Resfriar, Limpeza**.
4. **Ensaque:** peso atual, sacos do lote, sacos no palete (n/18), lote, validade, fardo de vazios, botões **Iniciar, Pausar**.
5. **Alarmes:** lista com **severidade, hora, origem, texto, reconhecer/silenciar**; histórico; botão **EMERGÊNCIA**.
6. **Estoque e ordens:** níveis de MALTE/MIX/PRODUTO (sacos e paletes), ordens de compra e venda abertas, botão **Emitir ordem**.
7. **Lotes:** registro de lotes (qualidade, rendimento, penalidades, operadores).

Regras: só quem está **em expediente na fábrica** manda comando; **visitantes** veem leitura (somente) se estiverem no console. Comandos são mensagens `factory.cmd` validadas no servidor (papel, expediente, intertravamentos, proximidade do console ou do ponto de campo).

### 9.2 Indicadores no mundo (leves)

- Líquido e agitador dos tanques (nós do GLB), luz torre da ensacadeira (3 cores), sinaleiro do painel, vapor na saída do ciclone e na chaminé quando o secador produz, brilho do queimador (luz pontual), sprite de pó no bico durante o enchimento, partículas na boca do tanque ao despejar, **pontos de luz de alarme** (vermelho pulsante) no `Ponto_EB_Painel` e no secador, som ambiente da fábrica por estado (motor, ar, queimador, sirene). Tudo **desligado em qualidade gráfica baixa** (use o seletor de qualidade que o jogo já tem).
- **Placas/rótulos fixos** (já no mapa) não mudam; as informações dinâmicas aparecem em **etiquetas flutuantes mínimas** só quando o jogador está a ≤ 3 m ("TQ-101 · 62 °C · 71%"). Limite o número de textos por frame.

### 9.3 HUD de tarefa do operador

- Linha discreta com o **próximo passo sugerido** ("Despejar MALTE 3/8 no TQ-101"), marcador de objetivo no mundo (padrão do `JobTaskView`/objective marker), e **tutorial inicial** curto na primeira vez (um passo a passo clicável que pode ser pulado e reaberto em "Ajuda da fábrica").

---

## 10. Administração → nova categoria "Fábrica" (depuração de tudo)

Siga o padrão das categorias existentes (um arquivo `apps/web/src/admin/factory.ts`, título, frase, linha de status `.admin-feedback`). **Toda ação** pede motivo quando altera estoque/dinheiro/emprego, registra nos **logs** e na tabela de ações da administração, e responde com resultado legível. Somente administradores (mesma política `admin-policy.ts`).

### 10.1 Painéis e funções (mínimo exigido)

**A. Estado ao vivo:** JSON legível + visão estruturada de todo o `FactoryDirector` (tanques, secador, ensaque, alarmes, reservas, equipamentos, ordens, quem está em serviço onde). Botões **Copiar estado**, **Baixar JSON**, **Auto-atualizar**.

**B. Estoque e vagas:** tabela das **25 vagas** (marcador, tipo, quantidade, nível, lote) com **editar quantidade**, **encher**, **esvaziar**, **trocar tipo**, **gerar palete**, **apagar tudo**, **encher tudo (teste)**. Totais por tipo. Mostra sacos vazios e silo de pó.

**C. Tanques:** por tanque: **definir** estado, nível (litros), temperatura, rotação, kg dissolvidos; **forçar** cada transição (encher água, aquecer, dissolver, homogeneizar, aprovar, transferir, esvaziar, lavar, marcar sujo); **injetar** grumos/falha de agitador.

**D. Secador e ensaque:** **forçar** estados (pré-aquecer instantâneo, pronto, produzindo, resfriar, limpar), **definir** temperaturas/pressão/umidade/ΔP/silo; **disparar falhas** (bico entupido, queimador apagado, exaustor desarmado, válvula travada, sobretemperatura, contaminação) e **resolvê-las**; no ensaque, **definir** peso/lote/sacos no palete, **avançar** um ciclo, **zerar**.

**E. Ordens:** listar, **criar** (compra/venda, tipo, paletes, prazo, preço), **aceitar em nome de** um jogador, **concluir**, **cancelar**, **expirar**, **entrega fantasma** (cria o estoque como se um caminhão tivesse chegado, sem mover jogador) e **retirada fantasma**.

**F. Receita e balanceamento:** editar **todos** os parâmetros do processo (receita, tempos, faixas de temperatura, vazões, rendimentos, probabilidade de falha, tolerâncias de peso, capacidades) com **valor padrão** e **"restaurar padrão"**. **Fator de tempo** (`timeScale` 1–60×). Chaves **"modo teste": ignorar expediente / ignorar EPI / ignorar intertravamentos / falhas desligadas** (somente admin, registradas, **desligam sozinhas** ao reiniciar).

**G. Empregos:** lista de **contratados** e **em serviço** (jogador, desde, tempo, ganhos, estação atual); ações **admitir**, **demitir** (motivo, cooldown opcional), **zerar cooldown**, **forçar entrada/saída de expediente**, **editar horário programado** de um jogador, **pagar/estornar** ganhos de emprego (com motivo). **Configuração do emprego:** abrir/fechar vagas, vagas em serviço e contratadas, cooldown padrão, teto de turno, inatividade, nível mínimo, regra de emprego único.

**H. Teletransporte e marcadores:** lista dos **48 marcadores** com **"Ir até"** (teleporta o admin, como outras funções de admin já fazem, se houver; senão copie a coordenada), e **"Mostrar marcadores"** (overlay de depuração em 3D com nome, vaga ocupada/livre, reserva). Mostre as **vagas e reservas** (quem reservou, até quando).

**I. Equipamentos e segurança:** estado/horas da paleteira, empilhadeira, balança, bombas; **liberar reserva travada**; **acionar/resetar emergência**; **ver EPI** de cada jogador.

**J. Lotes e rastreabilidade:** lista de lotes com detalhes completos (penalidades, tempos, médias), **reprovar/aprovar manualmente**, **excluir**, **reconstruir** estoque a partir de lotes.

**K. Logs e eventos da fábrica:** linha do tempo própria com filtros (jogador, tipo, severidade, período), exportar JSON; ligar também ao console geral de **Logs**.

**L. Simulação e testes:** botão **"Rodar ciclo completo automático"** (um operador virtual executa a sequência inteira em tempo acelerado e mostra o relatório: etapas, tempos, estoque antes/depois, falhas), **"Resetar a fábrica"** (estado de fábrica nova, vazia, com confirmação dupla) e **"Semear cenário"** (galpão cheio, galpão vazio, falha no secador, ordem pendente) para o e2e.

**M. Comandos de chat (admin):** `/fabrica estado`, `/fabrica estoque <tipo> <n>`, `/fabrica falha <tipo>`, `/fabrica tempo <x>`, `/fabrica reset`, `/emprego <jogador> <demitir|admitir|expediente on|off|cooldown 0>`. Validados no servidor, respondem em particular, e **registram** no log.

### 10.2 Visão em "Mundo ao vivo"

A categoria existente de **Mundo ao vivo** ganha um bloco "Fábrica": operadores em serviço, lote atual, alarmes ativos, estoque resumido.

### 10.3 Qualidade das funções de depuração

- Nada de depuração só no cliente: tudo passa pelo servidor com validação de admin.
- Toda função de admin tem **teste de integração** (ao menos um por grupo A–M).
- Ações destrutivas (resetar, apagar estoque, demitir) pedem **confirmação**.

---

## 11. Dados, persistência e segurança

- **Migrações** (029 em diante, só expandem): `029_employment.sql`, `030_factory.sql` (`factory_slots`/`factory_pallets`, `factory_orders`, `factory_batches`, `factory_events`, `factory_settings`). Sem alterar chaves de tabelas existentes. Re-executáveis. Atualize o aviso de "Schema do banco desatualizado".
- **Idempotência:** `requestId` por ação que muda quantidade/dinheiro; `inventory_ledger`/ledger da fábrica; transações que travam a linha do recurso (vaga/palete/ordem), padrão do baú do caminhão.
- **Autoridade e proximidade:** o servidor confere posição, expediente, EPI, reservas, estado da máquina e intertravamentos em **todo** comando.
- **Concorrência:** dois jogadores nunca pegam o mesmo saco, palete, vaga, ordem ou empilhadeira; teste com duas ações simultâneas (como o `vehicle-storage.test.ts`).
- **Limites e anti-spam:** taxa por jogador por tipo de ação; tamanho máximo de mensagens; schemas estritos.
- **Recuperação:** ao reiniciar o servidor, restaurar estoque, ordens, lotes e estados das máquinas em estado seguro (processos em andamento voltam para `PAUSADO` e retomam ao primeiro operador em serviço; nada some).
- **Desconexão:** objetos reservados e sacos na mão são resolvidos (devolvidos à vaga de origem ou colocados no chão por TTL), documentando a regra.

---

## 12. Desempenho e qualidade gráfica

- Instanciamento para sacos/paletes; um objeto de cena por **vaga**, nunca por saco, e só para vagas visíveis (LOD simples por distância à fábrica).
- Efeitos e luzes seguem o seletor de qualidade do jogo; teste em "baixa".
- Mensagens de estado por **delta**, só para quem está na fábrica (interesse por área) ou com o painel aberto.
- Não aumentar o número de chamadas de desenho do S07_04 de forma perceptível: meça com as ferramentas de desempenho (`docs/sistemas/desempenho.md`) antes e depois e **reporte os números**.

---

## 13. Testes e validação (obrigatórios)

1. **Unitários (`@bar/shared`)**: máquina de estados dos tanques, secador, ensaque; interpolação da cubicagem (valores de borda e meio); cálculo de qualidade/rendimento; regras de receita; intertravamentos; cooldown e janelas de horário (com fuso e virada de dia/semana).
2. **Integração do servidor (`apps/server/test/`)**: fábrica real: ordem de compra do início ao fim (aceitar, carregar, descarregar, estoque, pagamento), ciclo completo (despejar → preparar → secar → ensacar → paletizar → vender), falhas e correções, emergência, concorrência, reinício do servidor com persistência, desconexão no meio de cada ação.
3. **API (`apps/api/test/`)**: emprego (admissão, vagas, regra de emprego único, demissão com cooldown, expediente manual e programado, histórico), pagamentos idempotentes, limites diários, transações do estoque e do baú.
4. **E2E (`tests/e2e/factory.spec.ts`, projeto próprio):** com a fixture do vite como nos outros sistemas: contratar, entrar em serviço, pegar saco, despejar, painel, secador, ensaque, perfil mostrando cargo e "Em serviço", pedir demissão e ver cooldown. Capture **imagens** da fábrica em ação (tanques cheios, secador produzindo, painel, perfil) e anexe ao relatório.
5. **City test:** atualize `tests/integration/city.test.ts` conforme o LEIA-ME do servidor (60 texturas, 0 silhuetas, 64 setores, 7.612 colisores, 87 marcadores) e acrescente verificação dos `Ponto_EB_*` e das 25 vagas.
6. **Teste de carga leve:** 6 operadores simulados + 2 caminhoneiros ao mesmo tempo por 10 minutos sem exceções, sem vazamento de reserva e com tick estável (reporte tempo de tick).
7. **Rodar tudo** (`npm test`, os projetos e2e relevantes) e **colar a saída** no relatório final. Se algo não foi possível rodar, **diga qual e por quê**; não afirme sucesso sem rodar.

---

## 14. Fases de entrega (cada fase fecha com testes + doc + resumo)

1. **Base:** assets (`assets:fabrica`), validação de marcadores/vagas, tipos compartilhados, migrações 029/030, `FactoryDirector` vazio com persistência, categoria "Fábrica" na administração com estado/estoque/reset (B, A, L-reset).
2. **Emprego:** camada de vínculo empregatício, cargo "Operador de Spray Dry", candidatura no `Ponto_EB_Entrada_Pessoal`, perfil + janela "Meu emprego", expediente manual e programado, demissão com cooldown, admin G.
3. **Logística e estoque:** ordens de compra/venda, carga no baú do caminhão, descarga, paleteira/empilhadeira, vagas e instanciamento dos sacos, balança, admin E/H.
4. **Preparo no tanque:** água, aquecimento, agitador, despejo de saco, cubicagem animada, qualidade, amostra, admin C.
5. **Secador e ensaque:** pré-aquecimento, produção, falhas e correções, silo, peneira, ensaque completo, paletização, emergência, admin D/I/J.
6. **Painel SCADA e HUD:** janela de sala de controle com todas as abas, indicadores no mundo, tutorial, som e efeitos.
7. **Acabamento:** balanceamento, "ciclo completo automático", comandos de chat, logs, documentação (`docs/sistemas/fabrica.md` e `docs/sistemas/emprego.md`), relatório com **números de desempenho** e **lista do que falta/limitações**.

---

## 15. O que entregar ao final (checklist)

- [ ] Código das 7 fases, com migrações 029/030 e instruções para aplicar (`npm run migrate -w @bar/api`) **antes** de subir a API nova.
- [ ] `docs/sistemas/fabrica.md` (processo, estados, tabelas de tempos/valores, marcadores usados, mensagens, rotas, administração) e `docs/sistemas/emprego.md` (regras, dados, API, perfil), e entradas novas em `admin.md`, `perfil.md`, `cidade.md` e `economia.md`.
- [ ] Categoria **Fábrica** completa (A–M) e bloco em **Mundo ao vivo**.
- [ ] Testes (shared, servidor, API, e2e, city) passando, com a saída colada.
- [ ] Capturas de tela da fábrica funcionando.
- [ ] Números de desempenho antes/depois.
- [ ] Lista **honesta** do que ficou de fora e do que pede nova exportação do Blender (peças móveis, telas dinâmicas, etc.).
- [ ] Nada publicado na VM.

---

## 16. Regras finais

- Não invente coordenadas: use `Ponto_EB_*` e os JSONs.
- Não reduza o escopo sem avisar: se algo for inviável, explique o motivo e proponha a alternativa mais próxima, e registre no relatório.
- Cada "amostra de interação" (pegar saco, despejar, empilhar, ensacar) precisa ser **possível de ponta a ponta no jogo real**, com colisão e alcance conferidos (as plataformas, escadas e a baia já foram auditadas a pé).
- Se uma decisão de design for ambígua, escolha a opção **mais simples que preserve a jogabilidade**, documente-a no doc e deixe o parâmetro editável.
