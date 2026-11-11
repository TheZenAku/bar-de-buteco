# Pulo

**Espaço** pula a pé. É preciso soltar e pressionar novamente depois de tocar o chão; segurar a tecla não repete o pulo. Com a guarda levantada, Espaço continua defendendo; em veículos continua sendo freio de mão; no voo administrativo continua subindo. Campos de texto e botões focados conservam o teclado da interface.

O pulo faz parte de `movePlayer`, em `packages/shared/src/world.ts`, o mesmo controlador cinemático que já resolve movimento e colisões. Não há um segundo controlador, corpo Ammo ou simulação exclusiva do navegador. `jump.ts` reúne parâmetros, estado vertical e restrições de ação: impulso de 4,35 m/s, gravidade de 9,81 m/s², altura de aproximadamente 0,97 m, voo de 0,89 s e aterrissagem de 0,18 s. Caminhada, corrida e caminhada com bengala mantêm suas velocidades.

A detecção de apoio consulta os triângulos de colisão exportados do mapa, como um raycast vertical determinístico, com cinco amostras sob os pés. Consulta também os topos de colisores de móveis e veículos. Faces com inclinação superior a aproximadamente 50° não sustentam o personagem. A resolução vertical usa subpassos de até 1/120 s, verifica o cruzamento do piso na descida e limita a subida ao encontrar um teto. Rampas e degraus continuam usando o ajuste de altura existente enquanto há contato; sair de uma borda inicia uma queda. Pisos sobrepostos e o acesso pago ao palco são preservados.

O servidor executa a física a 20 Hz e replica `verticalVelocity`, `grounded`, `jumpHeld` e `landingTime`, junto da posição e dos estados `jump`, `fall` e `land`. O cliente prevê os mesmos subpassos e restaura esse estado ao reaplicar inputs pendentes de confirmação. A gravidade continua nos ticks sem input e durante uma queda temporária da conexão. O cliente envia somente a intenção booleana `jump`, nunca velocidade ou contato com o chão. Uma pressão curta entre duas amostras de teclado fica registrada até o próximo input.

Sentar, montar, tocar instrumentos, golpes, recuperação, recarga e outras ações incompatíveis impedem iniciar o pulo. Durante o voo, o servidor também recusa ações que tomariam o corpo, como sentar ou montar. A aterrissagem libera outro pulo apenas com novo contato e uma nova pressão; não bloqueia o deslocamento horizontal.

## Animações

O pipeline de retarget existente gera os três clipes para todos os esqueletos em `apps/web/public/animations`:

| Estado | Clipe | Fonte |
| --- | --- | --- |
| Subida | `Jump`, uma vez | `misc/jumping up.fbx` |
| Descida | `Fall`, em loop | `misc/falling idle.fbx` |
| Contato | `Land`, uma vez | `misc/Fall B Land To Standing Idle.fbx`, a partir de 0,4 s, acelerado para 0,18 s |

As fontes de subida e queda recolhem as pernas sem duplicar o deslocamento vertical da física. O retarget remove o deslocamento horizontal das fontes e conserva as particularidades de cada rig. As transições usam mistura de 0,1 s, retornando a idle, caminhada ou corrida conforme o input. Se `Fall` estiver ausente, mantém `Jump`; sem `Land`, retorna à locomoção. Para regenerar os bancos, execute `npm run assets:animations`.

## Validação

- `tests/integration/jump.test.ts`: trajetória, tecla segurada, pulo duplo, queda, teto, velocidades, repetição determinística, escadas, pisos sobrepostos e acesso ao palco.
- `apps/server/test/jump.integration.test.ts`: dois clientes WebSocket, estado observado, sequências repetidas, ações incompatíveis e gravidade sem inputs.
- `tests/integration/animations.test.ts`: presença e validade dos clipes em todos os bancos e esqueletos.
- `tests/e2e/bar-animations.spec.ts`: clipes reais no PlayCanvas em todas as skins de jogador e prioridade do teclado na interface, defesa e voo.

### Execução em 09/11/2026

`npm run build` passou, incluindo o typecheck de todos os workspaces e a build de produção. Passaram os oito testes de física do pulo, as verificações dos bancos de animação, os testes de câmera/cabeça e previsão de cavalo/veículos, os três testes WebSocket focados em pulo/luta/multidão e os 145 testes de ferramentas.

Os três E2E passaram no navegador: transições de pulo nas dez skins de jogador e prioridades do teclado; pulo conectado com previsão local e retorno à corrida; regressão de caminhada/corrida. O banco de testes padrão tinha divergência de checksum de migração; esses E2E usaram um banco descartável separado.

A suíte geral não passou integralmente. O catálogo de veículos da API retornou 500 ao comprar; os testes de saída de veículo em área ocupada e raio de curva também falharam quando executados separadamente. O teste geral de sala exige um karatê de pelo menos 2.000 ms, enquanto `KICK_DURATION_MS` está em 1.333 ms. A rodada ampla do servidor apresentou ainda falhas de temporização; luta e multidão passaram na execução focada posterior. Esses resultados limitam a validação global do projeto.
