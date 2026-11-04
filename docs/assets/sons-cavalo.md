# Som de galope

O cavalo do Tião toca um ciclo de cascos do pacote gratuito [Horse gallop on different surfaces](https://opengameart.org/content/horse-gallop-on-different-surfaces), adaptado por **congusbongus**. O arquivo escolhido é `ground.mp3`, derivado de [Single Horse Galopp, de D4XX](https://freesound.org/people/D4XX/sounds/564628/).

O pacote está publicado sob [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); o `credits.txt` original identifica a gravação de D4XX como [CC0](https://creativecommons.org/publicdomain/zero/1.0/). Mantemos os créditos dos dois autores e a atribuição CC BY 4.0 do pacote na distribuição do jogo, em `mounts/sound/CREDITS.txt`.

Os arquivos de origem e os créditos ficam em `assets-bar/sounds/cavalo`. Para gerar o áudio publicado:

```sh
npm run assets:horse:sound
```

O importador decodifica o MP3, normaliza seu pico e aplica fades de 1 ms nas pontas. O resultado é `apps/web/public/mounts/sound/gallop.wav`, mono de 32 kHz, com cerca de 25 kB. O WAV evita pausas de codificação entre repetições. O áudio é servido pelo próprio jogo, sem depender do banco de sons durante a partida.

`apps/web/src/engine/horse-sound.ts` toca o galope quando a animação é `horse-gallop` e há deslocamento. A cadência acompanha a velocidade: na velocidade máxima, o ciclo dura cerca de 0,407 s, como a animação. O som sai da posição do cavalo, com direção estéreo e queda de volume até 45 m; até quatro cavalos próximos podem tocar ao mesmo tempo. O volume segue a configuração Geral. Parar, caminhar, desmontar, sair do alcance ou ocultar a aba interrompe o ciclo com um fade curto. A cena libera o áudio ao ser destruída.

A escolha usa a descrição e a forma de onda da gravação; não foi feita avaliação auditiva.
