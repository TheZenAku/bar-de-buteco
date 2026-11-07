# Sons do caminhão

Gravações reais obtidas no BigSoundBank / LaSonothèque em 7 de novembro de 2026.
Todas as fontes são CC0 (domínio público equivalente), com uso comercial,
edição e redistribuição permitidos, sem atribuição obrigatória.
Licença: https://bigsoundbank.com/licenses.html
Texto CC0: https://creativecommons.org/publicdomain/zero/1.0/

| Original | Autor | Gravação | Página |
| --- | --- | --- | --- |
| 1145.wav | Joseph SARDIN | Iveco Daily 3.0 40C14 HPI diesel, marcha lenta; 48 kHz / 16 bits | https://bigsoundbank.com/truck-engine-s1145.html |
| 1146.wav | Joseph SARDIN | Acelerações leves do mesmo Iveco; 48 kHz / 16 bits | https://bigsoundbank.com/truck-engine-small-accelerations-s1146.html |
| 0967.wav | Joseph SARDIN | Partida e desligamento de diesel Kia Carnival 2.9; 48 kHz / 16 bits | https://bigsoundbank.com/big-diesel-engine-s0967.html |
| 2721.wav | Pierre SIBANARCO | Buzina de caminhão; 48 kHz / 24 bits | https://bigsoundbank.com/truck-horn-s2721.html |
| 2984.wav | Axeline T., JM et Cyril | Aviso de ré de caminhão; 48 kHz / 24 bits | https://bigsoundbank.com/reverse-beeping-9-s2984.html |

Os originais ficam nesta pasta. `npm run assets:caminhao:sound` gera os recortes
em `apps/web/public/caminhao/sound`: WAV PCM mono 48 kHz / 16 bits, sem codec
com perdas, remoção de DC, ganho com margem de pico e sobreposição nas emendas
dos loops. Não há osciladores nem redução de taxa de amostragem. Os recortes,
hashes SHA-256 e URLs dos originais estão no `manifest.json` gerado.

O motor em funcionamento é o Iveco; a partida/desligamento usa a gravação
complementar de outro motor diesel. A buzina sustenta um trecho da gravação
enquanto a tecla fica pressionada; o aviso de ré preserva o ciclo gravado.

A camada `carga` usa a aceleração leve 1146, em substituição ao trecho 1147
de grandes acelerações, que produzia um assobio repetitivo. O original 1147
permanece arquivado, mas não faz parte do áudio distribuído. O motor passa por
um filtro suave de agudos; buzina e aviso de ré mantêm seu espectro original.
