# Diagnóstico e estabilização dos personagens

A base de trabalho é conservar a malha, os pesos e a pose de bind de cada personagem. Os nomes canônicos dos ossos são o contrato entre as fontes de animação e cada skin; nomes iguais, sozinhos, não garantem poses iguais.

## Falhas encontradas em 29/10/2026

1. **Adaptação diferente dentro e fora do jogo.** Os bancos de animação eram calibrados pela direção real dos membros, mas o conversor de `mixamo-retarget.ts`, usado pelo bar e pelo palco, aplicava apenas a diferença de rotação à pose de bind. Nos modelos publicados, isso deixava braços cerca de 12,5° fora da direção da fonte. Como o jogo também usa esse conversor para ficar parado e andar, o problema aparecia mesmo sem uma ação especial.
2. **Deslocamentos herdados da ação anterior.** Os clipes nativos do Nathan movem `root`, enquanto os clipes adaptados movem `hip`. O banco exportava apenas um dos dois canais. O PlayCanvas mantém a última transformação das propriedades que o próximo clipe não anima: depois de cair, correr podia conservar o deslocamento da queda; depois de sentar, beber podia conservar a altura do quadril sentado.

As poses básicas também omitiam rotações de juntas auxiliares, incluindo rosto e torção do antebraço. No carregamento, os canais ausentes dessas poses agora recebem o repouso do modelo antes de qualquer animação tocar. Os canais que já existem são preservados.

Os testes anteriores dos bancos passavam: eles não exerciam a adaptação ativa no jogo nem a reprodução de ações em sequência no avaliador do PlayCanvas. Por isso, testar somente se o arquivo carrega ou se o nome do clipe está correto não era suficiente.

## Como inspecionar

Com o cliente de desenvolvimento aberto, acesse **`/rigs.html`** no mesmo endereço do jogo. A tela mostra os seis personagens fora do mapa, com seleção de clipe, pausa, controle de tempo, vistas e visualização dos ossos.

- **Pose de bind:** mostra o modelo antes da animação. Defeitos já visíveis aqui pertencem à malha, à importação ou aos pesos.
- **Banco:** usa os clipes de `models/` e `animations/`, específicos de cada skin.
- **Bar:** usa as mesmas fontes e o mesmo conversor em tempo de execução do jogo.
- **Fonte original (dourado):** sobrepõe o esqueleto da autoria para comparar as direções dos membros.
- **Testar sequência:** conserva a pose anterior ao trocar de clipe para expor transformações herdadas. A pose de bind sempre reinicia o modelo.

Compare frente, lado e costas no mesmo instante. Comece por parado, caminhada, corrida, sentar e beber. Depois confira queda e recuperação, mãos e objetos nas ações do bar e músicos no palco. A tela isola a pose; o encaixe com cadeira, copo e instrumento também precisa ser conferido no mapa.

## Fluxo de trabalho

1. **Uma skin e um clipe por vez.** Use Nathan como referência e Rafael para comparar o rig da autoria das animações do bar. Só amplie para os seis quando os dois estiverem corretos.
2. **Separe a origem do defeito.** Ossos seguem a direção correta, mas a roupa dobra errado: investigue pesos. Ossos apontam para outra direção: investigue calibração e eixos. A primeira ação funciona e a próxima desloca o corpo: investigue canais ausentes e transições. Pés deslizam com postura correta: compare velocidade do jogo e ritmo do clipe.
3. **Gere em uma pasta temporária primeiro.** `BAR_ANIMATION_OUTPUT` e `BAR_PROP_OUTPUT` permitem conferir bancos e props antes de substituir os publicados. Preserve as fontes em `assets-bar`.
4. **Verifique poses e sequências.** A posição final deve depender do clipe atual, e não da sequência anterior. Os comprimentos dos ossos e as matrizes de bind devem permanecer iguais. Confira a pose no PlayCanvas, além dos testes offline.
5. **Publique juntos código e bancos compatíveis.** Atualize a versão de cache em `BarScene.ts` ao mudar um banco publicado. Recarregue a página para descartar clipes já convertidos em memória.

Para conferir os caminhos corrigidos:

```powershell
node --test tests/tools/retarget.test.mjs tests/tools/animation-transitions.test.mjs
node --import tsx --test tests/integration/mixamo-retarget.test.ts tests/integration/animations.test.ts
npm.cmd run build
```

Validação desta correção: build e typecheck passaram; os testes de integração passaram, incluindo seis skins em 17 clipes de bar e palco; os 35 testes de ferramentas passaram. No navegador, passaram as 30 comparações de transição do inspetor, as ações do bar com props e cadeiras e as quatro fases dos quatro músicos com devolução dos instrumentos.

O E2E completo que caminha até o palco parou em `walk.ts` por não alcançar o destino em 90 segundos, antes de tocar uma animação de músico. A reprodução do palco foi verificada diretamente pela fixture; o percurso automático continua pendente. Para repetir as verificações de renderização sem esse percurso:

```powershell
npx.cmd playwright test --project=rigs --project=bar-animations --project=stage --grep "all six rendered|every bar animation|stage fixture"
```

## Quando reimportar um personagem

`assets:animations` altera bancos e bengalas. `assets:retarget` também recalibra os clipes básicos dos modelos existentes. `assets:skins` reimporta geometria e pesos. Escolha o comando correspondente à causa identificada; reimportar todos os personagens para corrigir uma transição introduz outras variáveis sem tratar o defeito.

Rafael tem pesos do Mixamo; Leandro, Read e Magrão usam pesos transferidos do AccuRig; Gilmar usa pesos automáticos. Se uma deformação localizada persistir com os ossos corretos, o próximo passo é corrigir os pesos daquela skin ou obter um download **With Skin** do mesmo corpo. Padronizar o esqueleto não substitui a qualidade dos pesos.

O retarget conserva proporções diferentes. Alinhar as direções dos membros não garante contato exato de todas as mãos e pés com objetos do cenário. Ajustes de pegada e, quando necessário, IK devem tratar esses contatos depois que a pose e as transições estiverem estáveis.
