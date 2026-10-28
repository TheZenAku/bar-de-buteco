# Movimento, interesse espacial e recuperação

O cliente lê teclado a cada 50 ms, calcula a direção relativa à câmera e envia `player.input` com sequência monotônica. Aplica o mesmo integrador determinístico usado no servidor, preservando inputs ainda não reconhecidos. Cada patch autoritativo reposiciona a base e reaplica os inputs pendentes. A câmera acompanha a posição prevista; os demais avatares usam interpolação visual.

O servidor simula a 20 Hz e envia patches a 10 Hz. Consome no máximo um input por jogador a cada tick, limita a fila às seis intenções mais recentes, rejeita componentes inválidos, normaliza diagonais e impede passagem pelas paredes e móveis. Rajadas atrasadas descartam intenções antigas e são reconciliadas pela sequência reconhecida; não aceleram a simulação. Inatividade, foco em formulários e perda de foco interrompem novas intenções. Sentar e participar de uma mesa bloqueiam deslocamento e o envio contínuo de inputs.

Um `StateView` por cliente inclui o próprio jogador e entidades a até 18 metros. O mapa de jogadores pode perder e receber entidades quando cruzam esse limite. Contagem total, mesas e evento global permanecem compartilhados. O chat é enviado apenas a jogadores a até 12 metros e respeita bloqueios de ambos os lados; o texto é renderizado como conteúdo escapado.

Quedas de transporte reservam a vaga por 30 segundos. O SDK tenta reconectar, sem reenviar movimentos obsoletos acumulados durante a queda. O servidor preserva o identificador, revalida a sessão e retoma a sincronização. Logout, expulsão e banimento removem a participação. A mesma conta não ocupa outra vaga durante a janela de recuperação.

Os testes de WebSocket verificam: rejeição de ticket falso, duplicação de personagem, sala cheia sem criação de outro bar, movimento e limites, remoção por AOI, chat, ocultação da carta do dealer e reconexão forçada. A simulação de carga usa os clientes SDK reais, API e banco em memória; não inclui GPU ou redes externas.

Os contratos de mensagens e os estados públicos estão em `packages/shared`. Não existe um comando de teleporte ou distribuição de cartas no cliente. Em desenvolvimento, `window.barDebug` fornece somente cópias de estados públicos e métricas de renderização para diagnóstico e testes de teclado.

A aparência do jogador é a skin vestida no perfil autorizado pela API. A entrada ignora seleções cosméticas enviadas pelo navegador. `player.skin` valida a posse e persiste a seleção pela API interna; `player.appearance` solicita a leitura da skin salva, sem aceitar dados do navegador. Saldo e inventário não são transmitidos nos patches públicos. O inventário usa mensagens privadas `inventory.state`/`inventory.result` e mutações internas autenticadas; a reconexão relê a API. A manutenção periódica reaplica a aparência autorizada, mantendo o bloqueio visual durante o golpe do Rafael.
