Integração da moto v4 e da bag v3, verificada em 04/11/2026 no servidor local de testes, com API, sala multiplayer e navegador Edge/Playwright. O servidor de desenvolvimento do usuário e seus dados não foram usados como fixtures.

A moto usa o GLB v4 original, sem alterações nos nós, malhas ou texturas. A bag é criada separadamente, só aparece após `moto.encaixarBag(bag)`, abre por `bag.script.motoBag.aberta = true` e é removida por `bag.destroy()`. Nenhum script do Blender foi executado.

Medidas confirmadas pelo GLB: largura total 0,840067 m, altura 1,199489 m e comprimento 2,002950 m. `SCALE = 1`; `WHEELBASE = 1.361`, `WHEEL_RADIUS = .30`, `HALF_WIDTH = .421`, `HALF_LENGTH = 1.002`, `CENTRE_Z = -.0155`, `HEIGHT = 1.2`. A caixa compartilhada arredonda a caixa visual para fora, incluindo espelhos. O arquivo exportado tem o eixo dianteiro em Z +0,686 e o traseiro em −0,675; esses nós foram preservados, com entre-eixos de 1,361 m.

Arquivos alterados/criados:

- `apps/web/public/moto/moto_delivery.glb`, `moto_delivery_colisao.glb`, `moto_delivery.js`: cópias da v4.
- `apps/web/public/moto/moto_bag.glb`, `moto_bag.js`: cópias da v3, com textura embutida original.
- `apps/web/src/engine/moto-delivery.ts`: campos e animações da v4, API de luzes/encaixe, criação separada da bag e placa no ponto correto.
- `apps/web/src/engine/moto-bag.ts`: controlador da tampa, portado do script v3, com API `script.motoBag`.
- `apps/web/src/engine/moto-lights.ts`: malhas emissivas da v4 e pontos corretos de farol, lanterna, freio, placa e setas.
- `apps/web/src/engine/BarScene.ts`, `apps/web/src/main.ts`: telemetria da pose e controle de inspeção da bag, exposto por `barDebug` somente em desenvolvimento.
- `packages/shared/src/moto.ts`: escala e seis dimensões compartilhadas entre servidor e cliente.
- `tools/assets/import-moto.mjs`: publicação v4/v3 e validação dos nós, malhas e texturas.
- `tests/integration/moto-model.test.ts`: identidade dos arquivos, separação da bag, dimensões e caixa do modelo.
- `tests/integration/moto-crash.test.ts`: início da batida de raspão calculado fora da nova caixa, para não começar sobreposto.
- `apps/server/test/moto.integration.test.ts`: comparação de posição com tolerância de 1e−9 m, pois o spawn calculado passou a resultar em `13.600000000000001`, em vez de `13.6`.
- `tests/e2e/moto-v4.spec.ts`, `playwright.config.ts`: cenário real com/sem bag, pose, luzes, tampa, remoção, curva e parede.
- `docs/sistemas/moto.md` e este relatório: medidas, APIs, decisões e resultados.

Verificações:

| Verificação | Resultado |
| --- | --- |
| `npm run build` | Passou, incluindo typecheck de todos os workspaces; aviso de bundle grande do Vite |
| `npx tsc -p tsconfig.json` após finalizar o teste novo | Passou |
| Assets, física, colisão, movimento e peças (`moto-model`, `moto`, `moto-motion`, `moto-crash`, `moto-parts`) | 39 testes passaram |
| `tests/e2e/moto-v4.spec.ts` | Passou pelo servidor: parada, andando e curva à direita com e sem bag; luzes; tampa; remoção; parede em baixa velocidade; console sem erros |
| `tests/e2e/moto-crash.spec.ts` | Passou com dois jogadores: luzes, batida forte, queda, recuperação do piloto e da moto |
| `apps/server/test/moto-parts.integration.test.ts` | Passou: motor, desgaste, atropelamento e conserto por WebSockets |
| `apps/server/test/moto.integration.test.ts` | Passou em execução isolada: spawn, permissões, previsão, montar/descer, batida, atropelamento e despawn por WebSockets. Com o navegador executando em paralelo, uma tentativa divergiu na comparação temporal entre previsão e sala |
| `tests/e2e/moto.spec.ts` antigo | Não passou: uma execução falhou no percentil de suavidade do observador; outra não atingiu a velocidade esperada no prazo. As verificações não foram relaxadas |

No cenário novo, a moto avançou na direção do farol e as rodas giraram para a frente. Na curva à direita o guidão atingiu aproximadamente 27° e a inclinação para dentro, 9,5°, com e sem bag. No contato lento com a parede, os dez últimos registros de velocidade foram zero, `up.y = 1`, sem queda e com o piloto ainda montado. As distâncias dos ossos às referências foram aproximadamente 9,3 cm nos punhos e 9 cm nos tornozelos, compatíveis com os deslocamentos existentes para colocar palmas e solas nas manoplas/pedaleiras. A pose visual foi conferida na skin usada pelo administrador; todas as skins não foram verificadas.

Para repetir o cenário visual sem apagar as evidências anteriores: `npx playwright test --project=moto tests/e2e/moto-v4.spec.ts --output .local/moto-v4-playwright-final`. Para os testes de servidor, usar `NODE_ENV=test` e `npx tsx --tsconfig apps/server/tsconfig.json --test apps/server/test/moto.integration.test.ts apps/server/test/moto-parts.integration.test.ts`; o tsconfig do servidor é necessário para os decorators do Colyseus.

Screenshots da execução final:

| Estado | Sem bag | Com bag |
| --- | --- | --- |
| Parada | [Imagem](../../test-results/moto-v4/sem-bag-parada.png) | [Imagem](../../test-results/moto-v4/com-bag-parada.png) |
| Andando | [Imagem](../../test-results/moto-v4/sem-bag-andando.png) | [Imagem](../../test-results/moto-v4/com-bag-andando.png) |
| Virando à direita | [Imagem](../../test-results/moto-v4/sem-bag-direita.png) | [Imagem](../../test-results/moto-v4/com-bag-direita.png) |

Também foram salvas imagens do [outro lado da bag](../../test-results/moto-v4/com-bag-logo-outro-lado.png), [logo traseiro](../../test-results/moto-v4/com-bag-logo-atras.png), [tampa aberta](../../test-results/moto-v4/com-bag-tampa-aberta.png), [bag removida](../../test-results/moto-v4/bag-removida.png) e [parede](../../test-results/moto-v4/com-bag-parede.png). A [telemetria e os erros de console](../../test-results/moto-v4/observations.json) acompanham as capturas. `test-results` é uma pasta local ignorada pelo Git; executar outra suíte com o diretório de saída padrão pode limpar essas evidências.

Suposições e limites: os requisitos do iFood vieram como `[colar aqui a descrição completa]`; preservou-se a bag Highland Bar Delivery da v3. A caixa visual completa foi escolhida de forma conservadora, em vez do casco menor sem espelhos. A inclinação continua seguindo a aceleração lateral da simulação, inclusive em ré; suspensão, balança e descanso seguem o script v4. Não foi criado um fluxo novo de inventário ou sincronização multiplayer de equipamento: a API do item está disponível e sua verificação usa `barDebug`. A bag não aumenta a caixa de colisão da moto. Não há necessidade identificada de alterar ou executar os geradores do Blender para esta integração.

Complemento da integração no aplicativo HighMotors: a vitrine e os detalhes tinham mantido a foto e os textos da scooter. Foram atualizados `apps/web/src/phone/apps/motors.ts`, `packages/shared/src/vehicle-models.ts` e `apps/web/public/moto/foto-v4.webp`, com foto renderizada do GLB v4 sem bag, descrição de moto de entrega e aviso de bag não inclusa. `package.json`, `tools/assets/render-moto-photo.mjs` e `tests/fixtures/moto-card-render.{html,js}` tornam essa foto reproduzível sem Blender. O teste real de compra em `tests/e2e/highmotors.spec.ts` também verifica a retirada da moto comprada na garagem, sem bag. A compra mantém o identificador `moto-delivery` e o preço configurado no servidor.

A foto usa enquadramento completo na loja, detalhes e miniaturas (`apps/web/src/highfood/highfood.css`). Os sete testes do HighMotors passaram, incluindo confirmação de compra, saldo insuficiente, limite, guincho, filtros, telas pequenas e compra real com retirada na garagem. Evidências: [loja](../../test-results/highmotors/v4-loja.png), [detalhes](../../test-results/highmotors/v4-detalhes.png) e [moto comprada retirada da garagem](../../test-results/highmotors/v4-retirada-da-garagem.png). O comando `npm run assets:moto` e os typechecks do cliente e testes também passaram após esse complemento.
