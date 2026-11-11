# Configurações gráficas

Ficam em **Menu (Esc) › Ajustes › Imagem** e são salvas neste navegador (`bar:settings:v1`). Valem na hora, sem recarregar. O código está em `apps/web/src/graphics.ts`, `BarScene.setGraphics` e `EnvironmentLighting.setQuality`.

| Opção | Efeito |
| --- | --- |
| Qualidade | Baixo, Médio, Alto ou Ultra aplicam um conjunto de valores; mudar qualquer opção passa para Personalizado. Celulares e tablets começam no Médio, e computadores no Alto |
| Resolução de renderização | Fração da resolução da tela desenhada de verdade (50–100%); o navegador amplia o resultado |
| Resolução dinâmica | Com o FPS abaixo de 80% da meta por um segundo, reduz a resolução em 10%; depois de 3 s com folga, devolve 5% até o valor escolhido |
| Sombras | Desligadas; Baixas (sol e lua a 1024 px, sem sombra das lâmpadas); Médias (2048 px e 2 cascatas, lâmpadas a 256 px); Altas (padrão anterior: 2048 px e lâmpadas a 512 px); Ultra (4096 px, 3 cascatas, lâmpadas a 1024 px) |
| Névoa atmosférica | Leve (vê mais longe), Normal ou Densa. A densa esconde mais da cidade distante e também é mais leve de rodar |
| Detalhe da cidade | Baixo, Médio, Alto ou Ultra: quantos setores em detalhe completo, até onde vão os prédios em LOD1, quando somem os objetos pequenos e se as luzes reais da cidade acendem ([cidade](cidade.md#detalhe-por-qualidade)) |
| Limite de FPS | Sem limite (segue a tela), 30, 60 ou 120. A cena continua atualizando a cada quadro da tela, mas só desenha na taxa escolhida, o que economiza bateria e GPU |
| Nitidez em telas densas | Teto do *device pixel ratio*: 1×, 1,5× ou 2× |
| Granulação | Textura de filme sobre a imagem: Desligada, Leve (padrão), Média ou Forte ([abaixo](#granulação)) |

| Preset | Escala | Dinâmica | Sombras | Névoa | FPS | Nitidez | Cidade | Granulação |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Baixo | 60% | sim | desligadas | densa | 30 | 1× | Baixo | desligada |
| Médio | 80% | sim | baixas | normal | 60 | 1× | Médio | leve |
| Alto | 100% | não | altas | normal | tela | 1,5× | Alto | leve |
| Ultra | 100% | não | ultra | leve | tela | 2× | Ultra | leve |

A escolha é por essas opções, nunca pelo tipo de aparelho: o aparelho só decide o preset inicial.

## Granulação

Um ruído fino por cima do quadro pronto (`engine/film-grain.ts`), no estilo de filme: um padrão novo 24 vezes por segundo, com grãos de cerca de 1 pixel CSS em qualquer tela e em qualquer escala de renderização. O pico, como fração do brilho total, é **3,4%** na Leve, **6%** na Média e **9,5%** na Forte; a distribuição é triangular (a maioria dos grãos é bem fraca, poucos se destacam). Medido no jogo, num trecho de céu, a diferença média entre pixels vizinhos vai de 2,0 (desligada) a 5,3 (leve), 8,2 (média) e 11,8 (forte), em 255 níveis.

São duas passagens de um quadrado do tamanho da tela, uma que soma onde o ruído é positivo e outra que subtrai onde é negativo; a imagem nunca é lida de volta, então não há cópia do quadro. O ruído é ponderado pelo alfa do próprio canvas: nas aberturas transparentes das TVs, onde o vídeo aparece por trás, nada é somado, e o alfa nunca é escrito. Fica desligado dentro do visor de realidade virtual. Quem salvou os gráficos antes da opção existir recebe a granulação do seu preset (Personalizado recebe a do aparelho). A medida dessa opção está em `barDebug.camera()` (`grain` e `grainDrawn`).

## Geração de quadros e upscaling

DLSS, FSR Frame Generation e XeSS dependem de drivers nativos e não existem em WebGL nem em WebGPU no navegador. As técnicas disponíveis aqui são a renderização em resolução menor com ampliação (escala de renderização), a resolução dinâmica e o limite de FPS. Um upscaler espacial em shader (tipo FSR 1) pode ser acrescentado depois, como passe de pós-processamento, quando houver uma cadeia de pós-processamento na cena.

`barDebug.graphics()` (em desenvolvimento) mostra a escala atual, o FPS e o *pixel ratio* efetivo.
