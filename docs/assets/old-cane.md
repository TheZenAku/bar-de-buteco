# Caminhada com bengala

Digite **`/velho`** no chat para equipar a bengala e trocar a caminhada. Digite novamente para voltar ao normal. O comando é interpretado pelo servidor e a confirmação aparece somente para quem o enviou; os outros jogadores recebem a alteração pelo estado da sala.

A velocidade é **0,475 m/s**, incluindo movimento diagonal e Shift. O cálculo é compartilhado entre movimento autoritativo e previsão/reconciliação do cliente. A cadência do modelo masculino original fica em 1×; skins com pernas de outro comprimento ajustam o play rate proporcionalmente. A mistura entre o estilo comum, o estilo com bengala e a parada dura 0,35 s. O ciclo foi fechado em 1,6 s, acrescentando a amostra inicial ao final para evitar um salto na repetição.

O modo preserva a skin, o corpo, o cabelo e as roupas. Enquanto parado, mantém o Idle existente e adapta apenas o braço/mão direita para segurar a bengala. Dança, bebida, assentos, jogos e o golpe do Rafael continuam usando suas animações; a bengala fica oculta durante essas ações e retorna ao ficar em pé. A opção é mantida no avatar da sala, inclusive na reconexão e troca de skin; não cria um item permanente nem altera a configuração do personagem no banco.

## Arquivos e importação

- `assets-bar/anim/A_Male_Walk_OldCane_walkstyle.fbx`: a animação de caminhada.
- `assets-bar/anim/A_Male_Walk_OldCane.fbx`: a malha `Acc_Male_Hand_Cane`, com 200 triângulos e pesos 100% em `hand_r`. Esse arquivo não tem clipe animado.

`npm run assets:animations` usa `tools/assets/lib/old-cane.mjs` para acrescentar `OldCaneWalk` e `OldCaneHold` aos bancos existentes e produzir `public/props/old-cane-<modelo>.glb`. Cada prop contém somente a malha da bengala, sem corpo, esqueleto, roupas ou outras animações. Os canais RGB da fonte distinguem haste, cabo e ferragens/ponteira; a importação separa madeira, anel metálico e borracha.

O importador usa a [calibração dos esqueletos nativos](native-rigs.md), calculada pelas direções dos membros, e as matrizes de bind do FBX da bengala. Mantém o deslocamento para a frente sob controle do servidor, adapta a escala à mão/altura de cada rig e ancora a ponta no piso na fase de apoio. A entidade é adicionada como filha de `hand_r` e acompanha o osso, inclusive durante as misturas.

A automação de roupas também regenera os clipes e a bengala dos dois corpos customizados em staging, valida e publica os props junto dos bancos e modelos. Portanto, os dois FBX de origem precisam permanecer disponíveis para futuras importações. Os modelos das skins completas não são reescritos por essa importação de animações.

## Verificação

- Movimento compartilhado: 0,475 m em um segundo, inclusive diagonal e Shift; o cliente não pode enviar velocidade ou estilo pela mensagem de movimento.
- WebSocket: comando recebido por outro jogador, velocidade autoritativa por tick, preservação da aparência e reversão do comando.
- Assets: sete rigs, somente 200 triângulos no prop, mão direita, ponta no piso, ciclo fechado, ausência de avanço independente e preservação do Idle fora do braço direito.
- Navegador com duas contas: comando no chat, personagem personalizado, caminhada e bengala visíveis no outro cliente, trocas para Nathan/Leandro/Rafael/Read, reversão e aparência salva intacta.

[Captura na partida](../previews/old-cane.png).
