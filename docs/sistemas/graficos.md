# Configurações gráficas

Ficam em **Configurações → Gráficos** e são salvas neste navegador (`bar:settings:v1`). Valem na hora, sem recarregar. O código está em `apps/web/src/graphics.ts`, `BarScene.setGraphics` e `EnvironmentLighting.setQuality`.

| Opção | Efeito |
| --- | --- |
| Qualidade | Baixo, Médio, Alto ou Ultra aplicam um conjunto de valores; mudar qualquer opção passa para Personalizado. Celulares e tablets começam no Médio, e computadores no Alto |
| Resolução de renderização | Fração da resolução da tela desenhada de verdade (50–100%); o navegador amplia o resultado |
| Resolução dinâmica | Com o FPS abaixo de 80% da meta por um segundo, reduz a resolução em 10%; depois de 3 s com folga, devolve 5% até o valor escolhido |
| Sombras | Desligadas; Baixas (sol e lua a 1024 px, sem sombra das lâmpadas); Médias (2048 px e 2 cascatas, lâmpadas a 256 px); Altas (padrão anterior: 2048 px e lâmpadas a 512 px); Ultra (4096 px, 3 cascatas, lâmpadas a 1024 px) |
| Névoa atmosférica | Leve (vê mais longe), Normal ou Densa. A densa esconde mais da cidade distante e também é mais leve de rodar |
| Limite de FPS | Sem limite (segue a tela), 30, 60 ou 120. A cena continua atualizando a cada quadro da tela, mas só desenha na taxa escolhida, o que economiza bateria e GPU |
| Nitidez em telas densas | Teto do *device pixel ratio*: 1×, 1,5× ou 2× |

| Preset | Escala | Dinâmica | Sombras | Névoa | FPS | Nitidez |
| --- | --- | --- | --- | --- | --- | --- |
| Baixo | 60% | sim | desligadas | densa | 30 | 1× |
| Médio | 80% | sim | baixas | normal | 60 | 1× |
| Alto | 100% | não | altas | normal | tela | 1,5× |
| Ultra | 100% | não | ultra | leve | tela | 2× |

O preset Alto reproduz exatamente a qualidade anterior desta versão.

## Geração de quadros e upscaling

DLSS, FSR Frame Generation e XeSS dependem de drivers nativos e não existem em WebGL nem em WebGPU no navegador. As técnicas disponíveis aqui são a renderização em resolução menor com ampliação (escala de renderização), a resolução dinâmica e o limite de FPS. Um upscaler espacial em shader (tipo FSR 1) pode ser acrescentado depois, como passe de pós-processamento, quando houver uma cadeia de pós-processamento na cena.

`barDebug.graphics()` (em desenvolvimento) mostra a escala atual, o FPS e o *pixel ratio* efetivo.
