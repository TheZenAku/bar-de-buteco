# B.A.R. — regras desta versão

O bar é compacto: balcão ao fundo, mesa de blackjack à direita, jukebox e pequenas mesas sociais. Três NPCs mantêm o ambiente ocupado. A movimentação, conversa e eventos continuam disponíveis fora dos minijogos.

Blackjack: um baralho de 52 cartas embaralhado por `crypto.randomInt`, até quatro jogadores e dealer no servidor. Ás vale 1 ou 11; figuras valem 10; blackjack natural supera 21 com mais cartas. Dealer para em qualquer 17. Empates contam separadamente. Não há aposta, dobrar, seguro ou divisão de pares. O turno dura 25 segundos; ao vencer o prazo, o jogador para automaticamente. Sair depois da distribuição não apaga a participação nem o resultado.

Eventos automáticos: 5–10 minutos entre ocorrências, 30–90 segundos de duração, pesos 3/4/3 para apagão/inconveniente/festa, ocupação mínima de uma pessoa e sem repetição consecutiva. O apagão reduz a luz; Tonico aproxima-se dos jogadores; a festa altera a iluminação e anima os NPCs. A trilha sintetizada é ativada pelo botão de som. Administradores podem substituir manualmente o evento em andamento.

O cenário, personagens articulados, letreiros e animações são gerados em código. Animações incluem idle, caminhada, corrida, transição para sentar/levantar, bebida e dança. A modelagem é deliberadamente simples e pode ser substituída por assets `.glb` sem mudar os contratos do servidor.

Itens posteriores ao MVP: personalização, voz, amigos, convites, conquistas, bilhar, pôquer, dardos, torneios e ampliação do espaço. Não há sistemas simulados na interface para essas expansões.
