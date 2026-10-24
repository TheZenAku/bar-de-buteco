# Comparativo de engines

## Método

Pesos refletem um jogo social 3D web operado por duas pessoas. Notas 1–5 combinam capacidade documentada e custo real de adoção; “testado” significa observado neste repositório, não apenas disponível na engine.

| Critério | Peso | PlayCanvas | Babylon.js | Three.js | Godot 4 Web |
| --- | ---: | ---: | ---: | ---: | ---: |
| Web/mobile e fallback | 15 | 5 | 5 | 5 | 3 |
| glTF, skinning e animação | 14 | 5 | 5 | 4 | 4 |
| desempenho/ferramentas 3D | 13 | 4 | 5 | 4 | 4 |
| integração HTML/CSS | 10 | 5 | 5 | 5 | 3 |
| manutenção por 2 devs | 12 | 5 | 4 | 3 | 3 |
| custo de migração | 16 | 5 | 1 | 1 | 1 |
| debugging/ecossistema | 8 | 4 | 5 | 5 | 4 |
| física/nav/recursos prontos | 6 | 3 | 5 | 2 | 5 |
| bundle/controle | 6 | 4 | 3 | 5 | 2 |
| **Total / 500** | **100** | **460** | **388** | **359** | **308** |

## Leitura

### PlayCanvas — escolhido

**TESTADO:** carrega o mapa/rigs/GLBs, anima personagens, executa sombras, fog, batching estático, áudio e shaders no jogo atual. A documentação oficial descreve WebGL2 e WebGPU, animação por estados e streaming assíncrono glTF/Draco/Basis. WebGPU é capacidade documentada; este projeto ainda não demonstrou seu uso em produção.

Vantagens: menor risco, engine focada em web, API de baixo nível suficiente, DOM/CSS natural e todo o investimento já validado. Limites: física/navmesh não são uma solução pronta no projeto; equipe precisa manter sistemas próprios; bundle atual é grande.

### Babylon.js

Alternativa tecnicamente forte: WebGL/WebGPU, cena, glTF, animação, física, navegação e tooling mais integrados. Perde principalmente no custo de portar `BarScene`, materiais, TV, testes e lifecycle. Deve ser candidata à POC apenas se PlayCanvas falhar em métricas objetivas.

### Three.js

Excelente biblioteca de renderização, ecossistema e controle de bundle, mas exigiria montar mais infraestrutura de jogo, lifecycle, animação, áudio, física e convenções. Não resolve os problemas atuais por si só. O WebGPU evolui, mas a paridade de recursos deve ser validada versão a versão.

### Godot 4 Web

Boa engine/editor para jogos nativos, porém a documentação atual limita export web ao renderer Compatibility/WebGL2; Forward+/Mobile não são suportados na web, e C# no Godot 4 não exporta para web. A integração DOM/YouTube/voz e o tamanho/boot do runtime exigiriam reconstrução. Não é recomendada para este produto browser-first.

## Decisão

**ADR proposta:** manter PlayCanvas por pelo menos os próximos três marcos. Reavaliar somente se dois ou mais critérios forem reprovados em hardware-alvo após otimização: p95 < 30 FPS; pico de memória/instabilidade; 16 avatares não sustentáveis; bloqueio de feature indispensável; ou custo de manutenção comprovadamente maior que uma POC.

## POC de migração, se acionada

Branch e app isolados, sem substituir o jogo. Importar mapa base e o novo avatar gratuito já aprovado visualmente, com idle/walk/run, terceira pessoa, colisão, uma porta, UI HTML, áudio espacial e dois clientes. Usar o mesmo asset reduzido em PlayCanvas e na candidata.

Aceitar migração somente se a candidata:

- reduzir p95 de frame em pelo menos 20% no mesmo hardware;
- reduzir draw calls/memória em pelo menos 20% sem perda visual;
- manter entrada jogável e bundle dentro do budget;
- reproduzir dois clientes, reconexão e animação remota;
- não aumentar em mais de 25% o código de integração;
- funcionar em Chrome/Edge/Firefox desktop e dois dispositivos móveis reais.

Se qualquer critério crítico falhar ou o ganho ficar abaixo de 20%, encerrar a POC e preservar PlayCanvas.

## Fontes oficiais consultadas

- [PlayCanvas Engine](https://github.com/playcanvas/engine) e [Graphics](https://developer.playcanvas.com/user-manual/graphics/)
- [Babylon.js specifications](https://www.babylonjs.com/specifications/) e [WebGPU support](https://doc.babylonjs.com/setup/support/webGPU)
- [Three.js examples](https://threejs.org/examples/)
- [Godot: exportação para Web](https://docs.godotengine.org/en/latest/tutorials/export/exporting_for_web.html) e [lista de recursos 4.5](https://docs.godotengine.org/en/4.5/about/list_of_features.html)

