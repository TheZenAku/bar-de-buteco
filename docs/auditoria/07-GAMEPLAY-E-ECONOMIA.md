# Gameplay, economia, NPCs e sistemas sociais

## Loop principal

Nos primeiros cinco minutos: criar personagem, entrar, receber uma indicação contextual, cumprimentar alguém/NPC, pedir uma bebida ou sentar numa atividade e provocar uma reação visível. O jogo não deve abrir com uma lista de sistemas.

Loop: **socializar → participar de atividade/evento → ganhar reputação/moedas → consumir/personalizar → gerar nova situação social**.

Loops secundários: turno curto de trabalho; coleção visual; blackjack sem aposta; eventos de bar; fotografia/emotes; pedidos em grupo. Poucos jogadores são compensados por NPCs com agendas e convites contextuais, não por bots fingindo ser humanos.

## Economia

Manter sem dinheiro real no MVP. Moedas vêm de atividades com limite temporal e desempenho verificável, não de clique repetido. Sinks: consumíveis, roupas/skins, emotes cosméticos, decoração/efeitos temporários. Sem vantagem competitiva.

Ledger imutável continua fonte de auditoria. Toda recompensa tem `sourceId`, regra, limite e chave idempotente. Invariantes: saldo 0..máximo; compra e entrega atômicas; preço vem do servidor; recompensa não pode ser duplicada; admin é identificável/reversível.

Primeira economia recomendada: emprego no balcão cooperativo, sessões de 3–5 min, pedidos variados e bônus de grupo. Daily reward pode existir pequeno, mas não deve ser a fonte principal. Só definir preços após telemetria de tempo para ganhar e gastar.

## Framework de empregos

Definição orientada a dados: passos, estações, requisito, duração, animação, prop, recompensa, falhas engraçadas e limites. Servidor controla reserva e progressão. Primeiro trabalho reutiliza balcão, Seu Zé, inventário, necessidades e UI já existentes.

Evitar repetição: pedidos combinatórios, cooperação, eventos que mudam prioridade, avaliação por sequência/tempo com tolerância e sessão curta. Não usar barras longas sem decisão.

## NPCs

Separar percepção, agenda, estado e ação. Behavior tree simples/data-driven é suficiente; não incorporar LLM no MVP. NPCs têm necessidades ficcionais, memória curta de pedido e reações determinísticas replicáveis. Navegação começa em waypoints/navmesh gerado; servidor sempre valida destino.

## Blackjack e futuros minijogos

Blackjack atual é uma base boa: regras e sigilo no servidor, turnos e estatística idempotente. Extrair interface `Activity`: join/leave/start/command/tick/publicView/privateMessage/result`. Poker só depois de anti-collusion, reconexão, side pots e privacidade; não é próximo marco.

## Celular virtual

MVP posterior: contatos/amigos, convites e notificações internas. Feed, chamadas, marketplace e mídia aumentam moderação e custo e devem esperar. Não simular aplicativos externos nem coletar contatos reais.

## Eventos emergentes

Eventos são regras combináveis, temporárias, desativáveis e com cooldown: Seu Zé troca dois pedidos (consentimento e correção rápida), jukebox “engasga” sem trocar conteúdo, máquina fica lenta, rodada de brinde coletivo, microapagão visual, invasão de pombo cenográfica. Nunca remover saldo/item permanentemente nem interromper uma atividade crítica sem compensação.

## Priorização

Usar RICE ajustado: alcance × impacto na diversão × confiança ÷ esforço, com penalidade de risco operacional. Ordem: loop de trabalho/economia; framework de interação; performance; acessibilidade; celular básico; novos minijogos/mapas. Moto, poker e feed ficam fora do MVP.

