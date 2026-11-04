# Cavalo do Tião

Habilidade de Tião, comprada na coleção (C), com tecla configurável no perfil. A tecla padrão é **X**: chama o cavalo e monta; outra pressão ou **E** desmonta. **WASD** anda a 3,2 m/s; **Shift + WASD** galopa a 9 m/s (32,4 km/h). É necessário estar numa rua ou calçada com espaço para o cavalo, sem outra interação e com as mãos livres. A sacola de uma entrega Highfood é guardada na mochila automaticamente ao montar.

Tião pode [trabalhar no Highfood](highfood.md#entregas-a-cavalo) sem comprar moto: fique online pelo app ou na base, desmonte para retirar o pedido no armário e leve-o na mochila. Desmontando perto do cliente, Tião pega a sacola em 2 s; se já estiver a pé, **E** perto do endereço faz o mesmo. O minimapa mostra a rota com o alcance ampliado enquanto estiver montado.

O servidor verifica a habilidade comprada, a skin e o espaço ocupado pelo conjunto cavalo/cavaleiro, inclusive nas curvas. Movimento e colisões usam a mesma função no servidor e na previsão local. Desmontar, trocar de personagem, sair do jogo ou desmaiar remove a montaria.

O arquivo original `assets-bar/skins/Tiao/cavalo/Cavalo.glb` contém um esqueleto Tripo e textura incorporada, mas **nenhuma animação**. `npm run assets:horse` gera `apps/web/public/mounts/tiao-horse.glb`, preservando a malha e o esqueleto, com os ciclos `HorseIdle`, `HorseWalk` e `HorseGallop`. A caminhada de quatro tempos usa cinemática inversa nas patas, com apoio no solo e balanço do corpo, cabeça e cauda. O galope tem impulsão das patas traseiras, apoio das dianteiras e uma fase com as quatro patas no ar. A solução inclui ombros e quadris, mantendo o tronco próximo da altura normal, sem agachar para alcançar o chão. O balanço vertical é suavizado ao longo do ciclo, e o retorno das patas acompanha a velocidade do apoio, com amostragem a 120 Hz. A cadência acompanha a velocidade de deslocamento, com transições suaves entre os três ciclos. O modelo é convertido para metros e para a frente +Z do jogo.

A postura do cavaleiro usa o clipe `Sit` do banco de Tião, convertido de `assets-bar/anim/Sitting.fbx`. A cada quadro, o quadril segue `HorseSaddle`, as pernas se abrem ao redor da sela, os pés ficam junto aos estribos e as mãos ficam à frente do corpo. Ao ganhar velocidade, o cavaleiro se inclina levemente à frente e ajusta as mãos nas rédeas, mantendo o olhar para a rua. Não é necessário baixar animações.

O galope tem [som de cascos de um banco gratuito](../assets/sons-cavalo.md), com cadência conforme a velocidade e áudio espacial para os jogadores próximos. O volume segue a configuração Geral; parar ou desmontar interrompe o som.

Validação: testes de movimento/colisão, testes do GLB e dos ciclos e testes no navegador com a montaria real e dois jogadores. Imagens de teste ficam em `test-results/previews/`.
