# B.A.R. — Especificação Técnica do MVP

Versão 1.0 do planejamento

21 de outubro de 2026

Projeto: B.A.R. Plataforma: Navegadores desktop Gênero: Multiplayer social 3D / Sandbox casual Equipe: 2 desenvolvedores Estilo visual: 3D estilizado, inspirado na geração PlayStation 2 Experiência central: Caos, humor e eventos imprevisíveis Primeiro minijogo: Blackjack Acesso: Conta obrigatória Ambiente: Bar compartilhado, com capacidade ampliada e arquitetura preparada para expansão

## 1. Visão e objetivos

O B.A.R. será um ambiente social tridimensional onde jogadores poderão circular livremente, conversar, participar de partidas de blackjack e provocar situações inusitadas por meio das interações com personagens, objetos e outros jogadores.

O jogo deverá proporcionar entretenimento mesmo quando ninguém estiver participando diretamente de um minijogo.

### Princípios de desenvolvimento

1. Diversão emergente: criar sistemas que interajam e produzam situações inesperadas.
2. Baixa barreira técnica: priorizar computadores modestos e execução diretamente no navegador.
3. Controles confiáveis: movimentação, câmera e interações precisam funcionar consistentemente.
4. Multiplayer como fundamento: o jogo deve ser concebido para múltiplos jogadores desde o início.
5. Conteúdo expansível: novos ambientes, minijogos e eventos não devem exigir a reestruturação da arquitetura.

### O que define o sucesso do MVP?

O MVP estará funcional quando uma pessoa conseguir criar uma conta, entrar no bar, encontrar outros jogadores, conversar, interagir com objetos, participar de blackjack e presenciar eventos imprevisíveis, sem precisar instalar um programa.

Isso não significa que a primeira versão precise conter dezenas de atividades. O importante é que o ciclo de experiência funcione.

## 2. Escopo fechado do MVP

O escopo abaixo é minha proposta técnica para transformar as escolhas feitas em algo executável por uma equipe de duas pessoas.

| Sistema       | Entrega obrigatória                                              |
| ------------- | ---------------------------------------------------------------- |
| Autenticação  | Cadastro, login, logout e recuperação de senha                   |
| Personagem    | Modelo 3D, movimentação, câmera e animações básicas              |
| Multiplayer   | Bar compartilhado com presença e movimentação sincronizadas      |
| Chat          | Mensagens por proximidade, com bloqueio e denúncia               |
| Interações    | Sentar, levantar, usar balcão e interagir com objetos            |
| Blackjack     | Partidas multiplayer com controle de turnos e regras no servidor |
| NPCs          | Bartender e frequentadores com comportamentos simples            |
| Eventos       | Sistema de eventos aleatórios com pelo menos 3 eventos           |
| Interface     | Login, HUD, chat, interação contextual e mesa de blackjack       |
| Administração | Logs, expulsão, banimento e controle dos eventos                 |

### Capacidade do bar

A expressão um bar compartilhado com capacidade maior exige uma distinção técnica importante.

Um mundo compartilhado não significa necessariamente que todos os jogadores precisam ser processados pela mesma instância de servidor.

Eu adotaria estes parâmetros:

Meta inicial de concorrência

# 32

Jogadores simultâneos na mesma instância do bar

Meta de expansão

# 64+

Jogadores por instância, dependendo dos testes

Esses números são metas propostas para validação, não capacidades comprovadas. O dimensionamento final dependerá do hardware, da frequência de sincronização, da quantidade de entidades e do tráfego de rede.

Na primeira versão, haverá uma instância principal do bar, com limite configurável. Caso a ocupação atinja o limite, jogadores adicionais poderão aguardar uma vaga. Instâncias adicionais só deverão ser criadas quando a demanda justificar.

Isso mantém a intenção de um espaço social compartilhado sem exigir, desde o primeiro dia, uma arquitetura de MMO.

## 3. Arquitetura técnica recomendada

Cliente Web

PlayCanvas + TypeScript + interface HTML/CSS

Renderização, câmera, controles e apresentação

HTTPS

WebSocket seguro

API

Node.js + TypeScript

Autenticação, contas e administração

Servidor de jogo

Node.js + Colyseus

Mundo, personagens, NPCs e minijogos

PostgreSQL

Contas, sessões, punições e dados persistentes

### Stack tecnológica

| Camada              | Tecnologia                             |
| ------------------- | -------------------------------------- |
| Engine 3D           | PlayCanvas                             |
| Linguagem principal | TypeScript                             |
| Build do cliente    | Vite                                   |
| Multiplayer         | Colyseus                               |
| API                 | Node.js + Fastify                      |
| Banco de dados      | PostgreSQL                             |
| ORM                 | Drizzle ou Prisma                      |
| Modelagem 3D        | Blender                                |
| Controle de versão  | Git                                    |
| Hospedagem inicial  | VPS Linux ou infraestrutura gerenciada |
| Contêineres         | Docker Compose                         |

O PlayCanvas suporta renderização baseada em WebGL 2.0, com possibilidade de utilizar WebGPU e fallback conforme o navegador.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://developer.playcanvas.com\&sz=32)

PlayCanvas Developer Site

+1

&#x20;O Colyseus fornece salas multiplayer, sincronização de estado e lógica autoritativa no servidor.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.colyseus.io\&sz=32)

Colyseus

+1



Decisão arquitetural: utilizar um monorepositório TypeScript para compartilhar os contratos de comunicação entre cliente, API e servidor de jogo.

Não recomendo microsserviços, Kubernetes ou uma infraestrutura distribuída complexa no MVP.

## 4. Especificação dos sistemas

### 4.1. Movimento e câmera

O personagem deverá ter movimentação WASD, rotação e câmera em terceira pessoa controlada pelo mouse.

Requisitos funcionais:

- Caminhar e correr.
- Colisão com cenário.
- Animações idle, caminhada, corrida, sentar e levantar.
- Câmera com ajuste automático para evitar atravessar paredes.
- Interação com objetos usando uma tecla contextual, como `E`.

Requisitos de rede:

O cliente envia intenções de movimento, enquanto o servidor valida velocidade, posição e transições de estado. Outros clientes recebem atualizações e aplicam interpolação.

Para evitar movimentos visivelmente atrasados, a movimentação local deverá usar predição e reconciliação. O servidor continua sendo responsável pela posição autoritativa.

Parâmetros iniciais sugeridos: simulação de 20 Hz no servidor e atualização de estado de 10 Hz para movimento de jogadores próximos, sujeitos a medições.

### 4.2. Sistema de presença e proximidade

Cada jogador terá um identificador único e um estado transitório contendo:

| Campo              | Descrição                      |
| ------------------ | ------------------------------ |
| `playerId`         | Identificador público          |
| `displayName`      | Nome de exibição               |
| `position`         | Posição X, Y e Z               |
| `rotation`         | Orientação do personagem       |
| `animationState`   | Animação ativa                 |
| `interactionState` | Estado da interação            |
| `currentTableId`   | Mesa ocupada, quando aplicável |

Deverá existir um sistema de interesse espacial, conhecido como Area of Interest (AOI).

O servidor priorizará a sincronização dos personagens e objetos próximos ao jogador, em vez de enviar continuamente todos os detalhes do mundo para todos os clientes.

Isso se torna especialmente importante quando o bar possui dezenas de jogadores.

### 4.3. Sistema de blackjack

O blackjack será o primeiro sistema competitivo completo.

Regras iniciais sugeridas:

- Mesas com até 4 jogadores humanos.
- Dealer controlado pelo servidor.
- Baralho embaralhado no servidor.
- Ações de comprar carta e parar.
- Ás com valor 1 ou 11.
- Dealer compra até atingir 17 e para em 17, inclusive soft 17.
- Rodadas com tempo máximo configurável.
- Vitória, derrota ou empate registrados para estatísticas.

No MVP, o blackjack não terá apostas com dinheiro real, conversão de fichas em dinheiro ou prêmios de valor econômico. Isso reduz a complexidade regulatória e permite validar primeiro a mecânica.

O cliente jamais deverá determinar quais cartas serão distribuídas ou quem venceu a partida. Essas decisões pertencem ao servidor.

### 4.4. NPCs

Cada NPC terá uma máquina de estados simples.

Ocioso

Caminhando

Interagindo

Reagindo a um evento

Fluxo ilustrativo. Estados podem retornar ao modo ocioso, ser interrompidos ou mudar conforme o contexto.

Os NPCs deverão utilizar pontos de navegação e posições predefinidas de interação, evitando a necessidade de um sistema sofisticado de inteligência artificial.

### 4.5. Eventos aleatórios — elemento central do B.A.R.

Este é o sistema que merece maior atenção criativa.

Cada evento deverá possuir gatilhos, condições, duração, efeitos e um período de espera antes de poder ocorrer novamente.

Três eventos adequados ao MVP:

[POLYGON - Nightclubs Pack - Art by Synty](https://images.openai.com/static-rsc-4/khwIUo7_Dm03d9SHGasc-HJAJVX0EDL4b35Q9OMVDpp-ceNWdRSacyVbjWu8BWZOVEbURCD1Mty81BR-fcXJ2a4hXYs8K3J1R2bIaqc4Nxna3H2kgxnQzz1nfr_nAY7ZiBWcQT6KcOJVkMTOm52w_uU8e41ynov59deNKh0daO4?purpose=inline)

Apagão

As luzes do bar se apagam temporariamente. NPCs reagem e o sistema de iluminação muda. O evento pode ser acompanhado de sons e falas.

[Drunk-Fu: Wasted Masters for PC image - IndieDB](https://images.openai.com/static-rsc-4/4h77C0uYOmPW7KzOhCKQD3STt8ApmWIzH1JHwbwvoQ4lRfMJQs50Fu53-cE9DY1XWOtROY9w_skNNyaOvT-i4Rkw4rW53SFCu152RmXognR1AStfcQWfGu4lT75Lae2U4rJWqvRLBj9igwINjP0tTiEcMbf0A5nUV2Rr3WGt_es?purpose=inline)

Frequentador inconveniente

Um NPC interrompe suas atividades, provoca outros frequentadores e cria uma situação que exige respostas dos jogadores.

[Worthplaying | PS2 Review - 'The Sims Bustin' Out'](https://images.openai.com/static-rsc-4/wZ6qNr_DB3l6riO45VXohmLt-s7B5NwE63CraQDT7RLzN0A_yFp8LJk5sT5LVf5q_7lwGZ0PIMFJrwWG-WLFnYRbHwxnbpCxWoiAxIwTdobaY4T2XS2I0YihLEdd-Qg2OLcFH8T4i8torieSKTUsHipzOu5KtmXAcmmoYXOITnA?purpose=inline)

Festa inesperada

A música muda, a iluminação se altera e NPCs começam a dançar. Jogadores podem aderir à situação usando animações.

O agendador de eventos deverá executar no servidor, utilizando uma seleção ponderada por probabilidade e considerando ocupação do bar, eventos anteriores e regras de incompatibilidade.

Uma proposta de configuração inicial:

- Intervalo entre eventos: 5 a 10 minutos.
- Duração de cada evento: 30 a 90 segundos.
- Apenas 1 evento global ativo simultaneamente.
- Impedir repetição imediata do mesmo evento.
- Permitir que administradores iniciem eventos manualmente.

Esses parâmetros são hipóteses de design, que deverão ser ajustadas nos testes.

Também sugiro que os eventos tenham diferentes intensidades. Interromper constantemente uma partida ou uma conversa pode ser irritante, não divertido. Eventos globais não deverão invalidar uma rodada de blackjack em andamento.

## 5. Autenticação, contas e segurança

Como vocês decidiram tornar o cadastro obrigatório, o sistema de contas passa a ser parte essencial do MVP, não uma funcionalidade secundária.

### Funcionalidades de autenticação

- Cadastro com e-mail, nome de usuário e senha.
- Confirmação de e-mail antes da participação pública.
- Login e logout.
- Recuperação de senha por e-mail.
- Sessões autenticadas com possibilidade de revogação.
- Restrição de múltiplas conexões simultâneas para o mesmo personagem.

Recomendo utilizar sessões com cookies `HttpOnly`, `Secure` e `SameSite`, conforme o fluxo de hospedagem escolhido. O servidor multiplayer deverá validar a autenticação antes de permitir a entrada no mundo.

As senhas devem ser protegidas com Argon2id, utilizando parâmetros de custo adequados ao ambiente. Nunca deverão ser armazenadas em texto puro ou utilizando apenas SHA-256.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://cheatsheetseries.owasp.org\&sz=32)

OWASP Cheat Sheet Series



### Modelo de dados inicial

| Tabela                | Campos principais                                       |
| --------------------- | ------------------------------------------------------- |
| `users`               | id, username, email, password_hash, created_at          |
| `user_profiles`       | user_id, display_name, avatar_config                    |
| `sessions`            | id, user_id, token_hash, expires_at                     |
| `email_verifications` | user_id, token_hash, expires_at                         |
| `password_resets`     | user_id, token_hash, expires_at                         |
| `moderation_actions`  | id, user_id, action, reason, expires_at                 |
| `game_statistics`     | user_id, blackjack_wins, blackjack_losses, games_played |

Movimentação, NPCs e eventos ativos não precisam ser gravados continuamente no PostgreSQL. Essas informações são estados temporários e deverão permanecer preferencialmente na memória do servidor de jogo.

### Medidas mínimas contra abuso

Além da autenticação, eu consideraria obrigatórios controles de:

- Rate limiting de login, cadastro, chat e requisições.
- Validação de mensagens e comandos recebidos pelo servidor.
- Proteção contra mensagens excessivas, conteúdo malicioso e spam.
- Bloqueio de jogadores e denúncias.
- Permissão administrativa separada das permissões comuns.
- Registro de falhas, expulsões, banimentos e ações privilegiadas.
- Segredos e credenciais armazenados fora do código-fonte.

Para um projeto multiplayer, segurança significa também impedir que um cliente alterado manipule cartas, posições ou interações de outros usuários.

## 6. Estrutura recomendada do projeto

O repositório deverá ser organizado para permitir desenvolvimento paralelo e compartilhamento de tipos.

```
bar/
├── apps/
│   ├── web/
│   │   ├── public/
│   │   │   └── assets/
│   │   │       ├── characters/
│   │   │       ├── environments/
│   │   │       ├── animations/
│   │   │       ├── audio/
│   │   │       └── textures/
│   │   └── src/
│   │       ├── engine/
│   │       ├── scenes/
│   │       ├── player/
│   │       ├── camera/
│   │       ├── networking/
│   │       ├── interactions/
│   │       ├── minigames/
│   │       │   └── blackjack/
│   │       ├── ui/
│   │       └── main.ts
│   │
│   ├── server/
│   │   └── src/
│   │       ├── rooms/
│   │       │   └── BarRoom.ts
│   │       ├── world/
│   │       ├── players/
│   │       ├── movement/
│   │       ├── npcs/
│   │       ├── events/
│   │       ├── interactions/
│   │       ├── minigames/
│   │       │   └── blackjack/
│   │       ├── moderation/
│   │       └── index.ts
│   │
│   └── api/
│       └── src/
│           ├── auth/
│           ├── users/
│           ├── sessions/
│           ├── database/
│           └── index.ts
│
├── packages/
│   ├── shared/
│   │   ├── contracts/
│   │   ├── schemas/
│   │   ├── constants/
│   │   └── types/
│   └── config/
│
├── tests/
│   ├── integration/
│   ├── e2e/
│   └── load/
│
├── docs/
│   ├── architecture.md
│   ├── game-design.md
│   └── networking.md
│
├── infra/
│   ├── docker/
│   └── migrations/
│
├── package.json
├── pnpm-workspace.yaml
├── .env.example
└── README.md
```

### Por que essa organização?

`apps/web` concentra o código executado no navegador. `apps/server` contém toda a lógica autoritativa do mundo compartilhado. `apps/api` gerencia contas, sessões e dados persistentes.

O diretório `packages/shared` é particularmente importante: ele permite definir um comando ou uma estrutura de dados uma única vez e utilizá-la no cliente e no servidor.

Por exemplo, ambos podem reconhecer os mesmos tipos de eventos:

```
type BarEventType =
  | "BLACKOUT"
  | "DRUNK_NPC"
  | "PARTY";

interface BarEvent {
  id: string;
  type: BarEventType;
  startedAt: number;
  durationMs: number;
}
```

Isso reduz incompatibilidades durante o desenvolvimento.

### Contrato mínimo de comunicação

| Mensagem           | Direção            | Responsabilidade        |
| ------------------ | ------------------ | ----------------------- |
| `player.input`     | Cliente → Servidor | Solicitar movimento     |
| `player.interact`  | Cliente → Servidor | Interagir com objeto    |
| `player.emote`     | Cliente → Servidor | Executar animação       |
| `chat.send`        | Cliente → Servidor | Enviar mensagem         |
| `blackjack.join`   | Cliente → Servidor | Entrar em uma mesa      |
| `blackjack.action` | Cliente → Servidor | Comprar carta ou parar  |
| `event.started`    | Servidor → Cliente | Notificar evento global |
| `event.ended`      | Servidor → Cliente | Encerrar evento global  |

O estado do mundo e das partidas deverá ser distribuído por sincronização de estado, evitando replicar tudo em mensagens individuais.

## 7. Divisão de responsabilidades entre dois desenvolvedores

A divisão mais produtiva é por subsistemas, mantendo uma área clara de responsabilidade para cada pessoa.

Desenvolvedor A

Cliente 3D e experiência

Responsável por:

Cenário, personagens, câmera, movimentação local, animações, interface, efeitos e apresentação dos eventos.

Entrega principal:

Cliente jogável e navegável no navegador.

Desenvolvedor B

Backend e sistemas multiplayer

Responsável por:

API, autenticação, banco de dados, salas, sincronização, NPCs, blackjack, eventos e validações.

Entrega principal:

Servidor estável e regras do jogo autoritativas.

Essa divisão é uma proposta de papéis, não uma atribuição nominal, porque ainda não foram informadas as especialidades de cada desenvolvedor.

Algumas tarefas precisam ser compartilhadas: especificação dos contratos, testes de integração, design das mecânicas, revisão de código e preparação das versões públicas.

Ponto de atenção: o Desenvolvedor B concentra mais responsabilidades críticas. Para equilibrar a carga, o Desenvolvedor A deverá assumir a maior parte dos recursos visuais, interfaces e integração dos sistemas do lado do cliente. Se um dos dois tiver mais experiência com backend, deverá assumir a responsabilidade técnica pelo servidor.

### Fluxo de trabalho recomendado

Utilizem um único repositório Git, branches de curta duração e pull requests revisados pelo outro desenvolvedor.

Cada funcionalidade deverá possuir critérios de aceite e testes proporcionais ao risco. Integrações do cliente com o servidor devem acontecer continuamente, não apenas ao final de uma etapa.

## 8. Backlog priorizado

Abaixo está uma proposta inicial de backlog com identificadores, responsáveis sugeridos e estimativas relativas.

As estimativas usam story points, não horas. Os valores representam complexidade e incerteza, sendo necessárias calibrações conforme a experiência da equipe.

Backlog interativo

16 de 23 tarefas

PrioridadeP0 · MVP

ResponsávelTodos

| ID      | Tarefa                                               | Resp. | Pts. |
| ------- | ---------------------------------------------------- | ----- | ---- |
| BAR-001 | Configurar monorepositório e CI<br>Infraestrutura    | Ambos | 3    |
| BAR-002 | Criar protótipo 3D do bar<br>Cliente 3D              | A     | 5    |
| BAR-003 | Implementar personagem e câmera<br>Cliente 3D        | A     | 8    |
| BAR-004 | Criar API de cadastro e login<br>Backend             | B     | 8    |
| BAR-005 | Implementar conexão multiplayer<br>Multiplayer       | B     | 8    |
| BAR-006 | Sincronizar movimento e animações<br>Multiplayer     | Ambos | 13   |
| BAR-007 | Implementar chat por proximidade<br>Social           | Ambos | 5    |
| BAR-008 | Implementar interações contextuais<br>Social         | A     | 8    |
| BAR-009 | Implementar lógica de blackjack<br>Minijogo          | B     | 8    |
| BAR-010 | Criar interface e animações do blackjack<br>Minijogo | A     | 8    |
| BAR-011 | Criar máquina de estados dos NPCs<br>NPCs            | B     | 8    |
| BAR-012 | Criar sistema de eventos aleatórios<br>Eventos       | B     | 8    |
| BAR-013 | Implementar três eventos com efeitos<br>Eventos      | Ambos | 8    |
| BAR-014 | Criar controles básicos de moderação<br>Segurança    | B     | 5    |
| BAR-015 | Testes de integração e carga<br>Qualidade            | Ambos | 8    |
| BAR-016 | Otimizar oclusão e interesse espacial<br>Multiplayer | Ambos | 13   |

Soma dos pontos exibidos

## 124

&#x20;Copiar backlog completo em CSV

As prioridades seguem este significado: P0 é obrigatório para validação, P1 melhora a experiência e P2 representa expansão após os primeiros testes.

A tarefa BAR-016 merece atenção especial. Uma arquitetura com AOI e filtragem de estado precisa ser pensada desde o início; não é adequado desenvolver primeiro um servidor que transmite tudo para todos e tentar corrigir isso somente no lançamento.

## 9. Cronograma sugerido

Considerando dois desenvolvedores trabalhando aproximadamente 15 a 20 horas semanais cada, eu usaria 16 semanas como horizonte inicial de planejamento, sujeito a revisão após o protótipo de rede.

Planejamento em 8 ciclos de 2 semanas

S2

S4

S6

S8

S10

S12

S14

S16

Fundação técnica

Movimentação e multiplayer

Social e interações

Blackjack

NPCs e eventos

Segurança, testes e ajustes

As atividades se sobrepõem porque os desenvolvedores trabalham em subsistemas diferentes. Este cronograma é uma estimativa de planejamento, não um compromisso de entrega.

Para tornar o cronograma viável, o cenário inicial deverá utilizar assets existentes com licenciamento compatível ou modelos próprios simples. Produzir todos os modelos, texturas, animações e sons do zero aumentará consideravelmente o esforço.

O marco mais importante acontece nas primeiras quatro semanas: dois jogadores precisam conseguir entrar simultaneamente no mesmo ambiente e enxergar os movimentos um do outro.

Se isso não estiver funcionando, não vale a pena dedicar semanas ao acabamento do bar.

## 10. Metas de qualidade e critérios de aceitação

As seguintes metas devem orientar testes, mas não podem ser tratadas como desempenho garantido antes de existir uma implementação.

| Indicador                                         | Meta inicial                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| FPS em desktop de referência                      | 60 FPS                                                              |
| FPS mínimo aceitável em hardware de teste modesto | 30 FPS                                                              |
| Concorrência no mesmo bar                         | 32 jogadores                                                        |
| Latência de referência                            | Até 100 ms de RTT                                                   |
| Recuperação de desconexão                         | Tentativa de reconexão com janela de 30 s                           |
| Teste de estabilidade                             | 2 horas sem falhas críticas                                         |
| Consistência do blackjack                         | 100% das ações validadas no servidor                                |
| Tempo de entrada após autenticação                | Medir e otimizar; alvo inicial de até 10 s em conexão de referência |

O hardware de teste e as condições de rede precisam ser documentados para que esses números tenham significado.

O Colyseus possui ferramentas para simular múltiplos clientes e realizar testes de carga, o que é adequado para avaliar o comportamento da instância compartilhada.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.colyseus.io\&sz=32)

Colyseus



### Definição de pronto

Uma tarefa não deve ser considerada concluída apenas porque funciona no computador de quem a desenvolveu.

A implementação estará pronta quando:

- Funcionar em dois navegadores ou computadores independentes.
- Não apresentar falhas críticas no fluxo principal.
- Validar corretamente mensagens e ações recebidas.
- Ter tratamento de erros e desconexões.
- Estar integrada à branch principal, com os testes relevantes executados.
- Possuir os contratos e configurações documentados.

## 11. Riscos técnicos prioritários

Escalabilidade do bar

A quantidade de jogadores simultâneos pode comprometer desempenho, tráfego e estabilidade. A mitigação envolve sincronização por proximidade, compactação do estado, controle da frequência de atualizações e testes de carga.

Complexidade do multiplayer

Corrigir atrasos, divergências de posição e desconexões costuma demandar mais esforço que a primeira implementação. A sincronização precisa ser testada desde o início.

Abuso e moderação

Ambientes sociais públicos permitem spam, assédio e exploração de falhas. Mesmo com humor ácido e liberdade de interação, o projeto precisa de ferramentas de denúncia, bloqueio e moderação.

Crescimento descontrolado do escopo

Cada minijogo introduz regras, interfaces, estados e testes adicionais. A expansão deve acontecer somente depois que o núcleo social e o blackjack estiverem estáveis.

Outro risco é o bar parecer vazio, mesmo com 32 jogadores online. Para evitar isso, o mapa precisa concentrar atividades em áreas conectadas, com boa visibilidade entre mesas, balcão e pontos de interação. Um cenário excessivamente grande prejudicaria a experiência social.

Caso vocês precisem atingir centenas de usuários simultâneos no futuro, deverão diferenciar a capacidade total do serviço da capacidade por instância. O Colyseus suporta distribuição de salas por processos, mas aumentar a quantidade de processos não transforma automaticamente várias salas isoladas em um único mundo contínuo.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.colyseus.io\&sz=32)

Colyseus



## 12. Funcionalidades previstas depois do MVP

Primeira versão pública

Login, bar compartilhado, movimentação, chat, interações, blackjack, NPCs e eventos imprevisíveis.

Primeira expansão

Mais eventos, personalização de personagens, NPCs competidores, sistema de conquistas e animações adicionais.

Expansão social

Chat de voz por proximidade, sistema de amigos, convites, grupos e novos espaços dentro do estabelecimento.

Expansão de gameplay

Bilhar, pôquer, dardos, torneios e interações físicas mais elaboradas.

## 13. Por onde começar, concretamente?

A primeira entrega técnica deve ser uma demonstração extremamente simples: um chão, algumas paredes, dois personagens e um servidor.

Nada de modelar um bar inteiro nessa fase.

Eu estabeleceria a seguinte sequência:

1. Configurar o repositório, TypeScript, PlayCanvas e Colyseus.
2. Renderizar uma cena 3D navegável com personagem e câmera.
3. Iniciar o servidor multiplayer e permitir duas conexões autenticadas de teste.
4. Sincronizar posição, orientação e animação dos personagens.
5. Validar movimentação com latência e desconexões simuladas.
6. Só então começar a construir o bar propriamente dito.

O primeiro entregável verificável deve ser dois usuários se encontrando num espaço 3D compartilhado.

### Decisão técnica final

Eu manteria a stack PlayCanvas + TypeScript + Colyseus + PostgreSQL, com arquitetura de servidor autoritativo e um monorepositório organizado por aplicações.

Mas faria uma distinção entre o objetivo criativo e o escopo inicial: o B.A.R. deve ser projetado para se tornar um espaço social caótico e imprevisível, sem tentar implementar todos os sistemas que poderiam produzir esse caos logo na primeira versão.

Minha recomendação é priorizar três pilares, nesta ordem: multiplayer funcional, interação social satisfatória e eventos imprevisíveis. O blackjack deve entrar como a primeira atividade estruturada, não como o principal propósito do jogo.

Se o bar for divertido mesmo sem uma partida em andamento, vocês terão construído a base correta para transformar o B.A.R. em algo muito maior.