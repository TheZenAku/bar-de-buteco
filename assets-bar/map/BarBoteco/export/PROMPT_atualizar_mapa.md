# Tarefa: atualizar o mapa do jogo (export de 02/11/2026 "b": reboco, escada, TV, freezer do balcão)

Você está na VM do servidor do jogo "bar-de-buteco" (Highland Bar). Exportei de novo o mapa do Blender e preciso que a versão nova entre no jogo, do jeito que os jogadores acessam.

## Onde estão os arquivos

A pasta do pipeline fica em `C:\Users\MuOnline\Desktop\BAR\bar-de-buteco\assets-bar\map\BarBoteco`. Acabei de colar por cima dela a versão nova, com a mesma estrutura de pastas. Se não estiver aí, procure por `bar_boteco.glb` com data de 02/11/2026 e 25,5 MB (a versão anterior, da madrugada do mesmo dia, tem 26,1 MB).

Arquivos do mapa (dentro de `export\`):

| Arquivo | O que é |
|---|---|
| `bar_boteco.glb` (25,5 MB) | bar + bairro original, sempre carregado (texturas embutidas) |
| `bar_boteco_draco.glb` (9,1 MB) | o mesmo com Draco (precisa de DRACOLoader) |
| `bar_boteco_colisao.glb` | caixas `COL_*` (escala = tamanho) + pivôs das portas `COLPORTA_*` |
| `cidade\setores\cidade_Sxx_yy.gltf/.bin`, `_lod.gltf/.bin`, `_colisao.glb` | 64 setores de 100 m (visual, LOD, colisão) |
| `cidade\texturas\` | texturas compartilhadas pelos setores. Os `.gltf` apontam para `../texturas/` |
| `cidade\cidade_anel.gltf`, `cidade\cidade_distante.gltf` | cenário externo (sem colisão) |
| `cidade\cidade_setores.json` | manifesto: limites, arquivos, tamanhos e vizinhos de cada setor |
| `cidade\cidade_vias.json`, `cidade\cidade_lotes.json`, `cidade\pontos_ifood.json` | grafo de ruas, lotes e pontos iFood (sem mudança) |
| `animacoes\bar_magrao.glb` (2,6 MB) + `animacoes\fbx\magrao_*.fbx` | animações do Magrão no balcão (chopp, chopp escuro, long-neck), reexportadas |

Não edite os GLB/glTF nem renomeie nós: o jogo acha mesas, portas, luzes, interativos e marcadores pelo nome.

## O que mudou desde a última cópia (02/11, primeira versão)

1. **Paredes de reboco do bar.** O reboco do bar saía chapado, sem textura. Agora as paredes do bar usam materiais próprios, `Bar_Reboco_Ocre`, `Bar_Reboco_Creme`, `Bar_Reboco_Branco` e `Bar_Reboco_Marrom`, com textura de reboco e mapa normal.
   - O material `Reboco_Marrom` não existe mais no `bar_boteco.glb`. Os outros `Reboco_*` continuam lá, no bairro, e na cidade. Se algum código do jogo procura material pelo nome `Reboco_*` para mexer nas paredes do bar, troque para `Bar_Reboco_*` e me diga onde estava.
2. **Escada do prédio refeita** (`Predio_Escada`, fundida em `Bar_Estrutura`): degraus de granito com bocel e o fundo do segundo lance fechado. Mesmo lugar e mesma altura; a colisão não mudou.
3. **TV da parede dos banheiros:** a tela voltou para 1,06 x 0,60 m, o tamanho do plano de vídeo que o jogo põe nela. Se o jogo tinha compensado o tamanho errado da versão anterior, desfaça.
4. **Freezer do balcão e marcadores de volta.** A versão anterior saiu sem estes nós, que agora voltaram com os mesmos nomes de antes: `Freezer_Bar_Tampa`, `Copo_Bandeja`, `Balcao_Lugar_Magrao`, `Balcao_Entrega`, `Mictorio_Lugar_1`, `Mictorio_Lugar_2` e `Mictorio_Lugar_3`. Materiais que voltaram junto: `Copo_Vidro`, `Freezer_Interno` e `Gelo_Freezer`.
   - O `animacoes_bar.js` usa esses nós (Magrão no balcão e NPC no mictório). Se o jogo deu erro ou desligou essas animações por causa da falta deles, religue.
   - `animacoes\bar_magrao.glb` foi reexportado para a tampa nova do freezer. Copie também para onde o jogo serve as animações (procure onde ele carrega `bar_magrao.glb`).
5. **Texturas mais leves.** Texturas quase lisas foram reduzidas. O `bar_boteco.glb` caiu de 26,1 para 25,5 MB. Na cidade, só mudaram 9 imagens em `cidade\texturas\` (`pol_feltro`, `pol_madeira_escura`, `pol_metal_ondulado`, `pol_metal_ondulado_n`, `pol_metal_preto`, `pol_plastico`, `pol_reboco`, `telha`, `telha_n`). Os setores (`.gltf/.bin`) são idênticos aos da versão anterior, mas publique a pasta `cidade\` inteira mesmo assim.

## O que fazer

1. **Descubra o que o jogo carrega hoje.** Procure onde ele lê `bar_boteco.glb` (ou a versão Draco), a colisão, a cidade (`cidade_setores.json` / setores) e `bar_magrao.glb`. A integração do mapa é em three.js (`export\integracao_highland.js`, função `prepararMapa`). Confirme no código.
2. **Procure referências a `Reboco_Marrom` e aos nós do item 4** (`Freezer_Bar_Tampa`, `Balcao_Lugar_Magrao`, `Mictorio_Lugar_`). Ajuste só se algo depender do nome antigo ou tiver sido desligado por falta deles.
3. **Faça backup** dos arquivos de mapa e do `bar_magrao.glb` que o jogo serve hoje, numa pasta datada, antes de sobrescrever.
4. **Copie os arquivos novos** para onde o jogo os serve. Mantenha `cidade\setores\` e `cidade\texturas\` como pastas irmãs, porque os `.gltf` usam caminho relativo `../texturas/`.
5. **Cache:** se os assets têm cache longo (servidor, CDN ou service worker), troque a versão ou o hash na URL para os jogadores receberem o mapa novo.
6. **Teste:**
   - O jogador nasce em (12; 0,15; 1,6) em glTF. Olhe a fachada e a varanda: as paredes amarelas têm que ter textura de reboco, sem nada preto, rosa ou esticado.
   - Entre no bar e suba a escada (perto da jukebox, em torno de x 13,2..16,5 e z -14,8..-11,6): degraus de granito, e ela continua subível.
   - Olhe a TV entre as portas dos banheiros (em torno de x 7,3, altura 2,0, z -11,5): o vídeo tem que preencher a tela, sem borda e sem sobrar para fora.
   - No balcão, o Magrão tem que abrir a tampa do freezer e pegar a long-neck lá dentro. O NPC do banheiro tem que ir até o mictório.
   - Ande um pouco pela cidade: os setores não podem dar 404 de textura.
   - O console não pode mostrar 404 nem erro de extensão glTF.

Pergunte antes só se algo afetar jogadores online, por exemplo reiniciar o serviço em produção. No fim, me diga em poucas linhas o que foi trocado, onde ficou o backup, se algum código precisou de ajuste e o resultado do teste.
