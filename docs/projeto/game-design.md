# B.A.R. — regras desta versão

O bar é compacto: balcão ao fundo, mesa de blackjack à direita, jukebox e pequenas mesas sociais. Três NPCs mantêm o ambiente ocupado. A movimentação, conversa e eventos continuam disponíveis fora dos minijogos.

Blackjack (desde 30/10/2026): regras de cassino com apostas em moedas do jogo, até quatro jogadores e dealer no servidor. Seis baralhos embaralhados por `crypto.randomInt` a cada rodada, dealer para em qualquer 17, blackjack paga 3:2, seguro 2:1, dobrar (também depois de dividir), dividir até quatro mãos e desistência tardia. Aposta de 10 a 500 moedas por mão (tabela de preços), 20 segundos por decisão; ao vencer o prazo, a mão para. Sair depois da distribuição não apaga a aposta nem o resultado. Detalhes em [Blackjack](../sistemas/blackjack.md).

Eventos automáticos: 5–10 minutos entre ocorrências, 30–90 segundos de duração, pesos 3/4/3 para apagão/inconveniente/festa, ocupação mínima de uma pessoa e sem repetição consecutiva. O apagão reduz a luz; Tonico aproxima-se dos jogadores; a festa altera a iluminação e anima os NPCs. A trilha sintetizada é ativada pelo botão de som. Administradores podem substituir manualmente o evento em andamento.

O cenário, personagens articulados, letreiros e animações são gerados em código. Animações incluem idle, caminhada, corrida, transição para sentar/levantar, bebida e dança. A modelagem é deliberadamente simples e pode ser substituída por assets `.glb` sem mudar os contratos do servidor.

Itens posteriores ao MVP: personalização, voz, amigos, convites, conquistas, bilhar, pôquer, dardos, torneios e ampliação do espaço. Não há sistemas simulados na interface para essas expansões.
