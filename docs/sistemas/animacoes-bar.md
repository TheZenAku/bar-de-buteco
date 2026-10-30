# Animações do bar

Os personagens fumam (um cigarro até apagar, ou um cigarro inteiro), vomitam, caem e levantam do chão, sentam à mesa puxando a cadeira do mapa, comem, levantam, limpam a mesa pela quina e usam o mictório. O Magrão tira o chopp e busca a long neck no freezer. As ações específicas vêm de `18_animacoes_bar.py` e, o cigarro inteiro, de `19_fumar_mixamo.py` (`assets-bar/map/BarBoteco/export/animacoes/bar_*.glb`); as genéricas usam os FBXs Mixamo de `assets-bar/anim`, convertidos em bancos por skin. Os lugares do mapa vêm de `17_lugares_animacao.py`.

## No jogo

| Ação | Como disparar | O que acontece |
| --- | --- | --- |
| Sentar | **E** perto de uma cadeira de mesa | `sentar`: o personagem puxa a cadeira do mapa uns 40 cm para trás, senta e a cadeira volta ao lugar. Depois entra em `sentado_loop`, cujo corpo usa `Sit` (`assets-bar/anim/Sitting.fbx`), com mistura de 0,3 s. Nos bancos das mesas de piquenique (24–31), que não têm cadeira, o corpo desliza do chão atrás do banco direto para esse repouso sentado (`onBench`). |
| Comer | Pedir comida na mesa (**P**: coxinha, pastel ou torresmo) | Quando o prato chega à mesa, o personagem come com o garfo (`comer_comecar` e `comer_loop`) até terminar o item; depois vêm `comer_terminar` e `sentado_loop`. O prato servido substitui o prato de batatas do clipe. |
| Levantar | **E** sentado (*Levantar / encerrar*) | `levantar`. Pedido no meio do `sentar`, começa quando o corpo chega à cadeira. A cadeira fica ocupada até o fim. O personagem termina em pé ao lado da cadeira, de frente para a mesa. No banco de piquenique, levanta na hora, 0,55 m atrás do banco. |
| Urinar | **E** no mictório do banheiro masculino (*Usar o mictório*) | `urinar` (11,5 s) no `Mictorio_Lugar_N`, com o jato em partículas. Esvazia a bexiga. Um por mictório. **E** sai antes e conta a parte feita. A câmera mantém o ângulo e a distância escolhidos pelo jogador, atravessando as paredes do banheiro livremente. Os vasos sanitários (*Usar o banheiro*) continuam com o clipe de espera do jogo. |
| Fumar | **F** ou o botão **Fumar** | `fumar_acender` e depois `fumar_loop`, com cigarro, brasa e fumaça. O personagem fica parado. **F** de novo ou **E** apaga: `fumar_apagar`, a bituca cai e é pisada (fica no chão 60 s). Pedido antes de acender, apaga quando o cigarro estiver aceso. |
| Fumar um cigarro inteiro | **Shift+F** ou o botão **Um cigarro** | `fumar_mixamo` (17,9 s, o "Smoking" do Mixamo): tira o maço do bolso (mão esquerda), puxa o cigarro (direita), põe na boca, guarda o maço, acende com o isqueiro (chama e brasa), traga, solta a baforada, joga o cigarro no chão e pisa. O personagem fica parado até o fim; **E** e **F** não interrompem. No meio, o corpo dá um passo à frente para pisar e volta: termina onde começou. A bituca fica no chão 60 s. |
| Vomitar | Bebedeira | Bêbado no estágio 3 (alto), terminar uma bebida alcoólica tem 40% de chance de fazer passar mal (no máximo a cada 2 min). Toca `vomitar` com partículas verdes, e a poça fica no chão 60 s. Vomitar tira 10 de embriaguez e 8 de sede (`NEEDS.drunk.vomit`). |
| Cair e levantar do chão | Desmaio (HP ou álcool) | `cair` segura a última pose enquanto o personagem está desmaiado; ao acordar, `levantar_chao`. Vale também para o Tonico no evento "O Zé acordou inspirado". |
| Limpar a mesa | Emprego *Ajudante do Magrão*, tarefa **Limpar a mesa N** | O servidor põe o ajudante na quina livre mais perto, e `limpar_mesa` passa o pano. A tarefa dura o clipe (9 s). |
| Magrão | Pedir no balcão (**E**: chopp ou long neck) | O Magrão fica em `Balcao_Lugar_Magrao`, de frente para o cliente. Chopp: vai até a chopeira (o `Copo_Bandeja` some enquanto a cópia está em uso) e a torneira corre junto com o jato. Long neck: abre o freezer (`Freezer_Bar_Tampa` some enquanto a tampa animada é usada). A bebida fica em `Balcao_Entrega` por 2,5 s e o cliente começa a beber. Um pedido por vez, cerca de 14 s cada, em fila. |

O chopp escuro (`magrao_chopp_escuro`) só toca pelo modo de debug: o balcão vende chopp e long neck, e ainda não há um item de chopp escuro.

Parado e andando, todo personagem usa os clipes Mixamo do banco da sua skin: `Idle` (`misc/Idle (1).fbx`), `Walk` (`misc/Standard Walk.fbx`) e, bêbado no estágio 3, `DrunkWalk` (`misc/Drunk Walk.fbx`). Os clipes `parado_loop`, `andar_loop` e `andar_bebado_loop` do módulo ficam disponíveis no export, mas não substituem a locomoção do banco. O ritmo dos passos acompanha a velocidade desenhada do avatar, entre 0,5× e 2,2×; as referências de caminhada, corrida e caminhada bêbada são aproximadamente 1,38, 3 e 0,74 m/s. A velocidade de movimento continua sob autoridade do servidor.

`Idle` usa os primeiros 4 s da fonte, com os últimos 0,5 s misturados ao início para fechar o loop. Repouso de bêbado, aceno, uso de objeto e espera também usam suas fontes Mixamo de `assets-bar/anim/misc`; espera mantém `Standing Idle 03.fbx`. A corrida é `Standard Run.fbx`, e o **G** sorteia uma das danças de `assets-bar/anim/dance`. No blackjack, a reação à derrota usa `Sitting Angry.fbx`, enquanto a pose das cartas mantém `carta-sentado.fbx`. O [mapeamento das fontes](../assets/animations.md) lista cada ação.

As ações com contatos específicos mantêm o corpo original: puxar e devolver a cadeira, comer, fumar (as duas), vomitar, usar o mictório, limpar a mesa, servir no balcão e tocar no [palco](palco.md). O par `cair`/`levantar_chao` também permanece junto para conservar a pose no chão e o deslocamento da raiz durante a recuperação. Beber, cartas, karatê e bengala mantêm suas fontes próprias.

## Servidor (autoridade)

Tudo sai do estado que já é sincronizado: `animationState`, `animationStartedAt`, `interactionState` e a posição. Por isso, outros jogadores e quem chega no meio veem a mesma ação, no mesmo tempo e no mesmo lugar.

- **Estados novos** (`AnimationState`): `stand-up`, `urinate`, `smoke`, `smoke-stop`, `cigarette`, `vomit`, `clean` e, para o Magrão, `serve-chopp`, `serve-chopp-dark` e `serve-longneck`.
- **Duração pelos clipes:** `map-data.json → barAnimations.clips` tem duração, início e fim do quadril de cada clipe. `barClipMs` dá a duração em ms. Levantar, urinar, apagar o cigarro, fumar o cigarro inteiro, vomitar, o atendimento do Magrão e a limpeza de mesa terminam quando o clipe termina.
- **Onde o corpo termina:** `levantar` deixa o corpo 0,56 m ao lado da cadeira. `standUpSpot` usa esse ponto ou, quando ele encosta 2 a 3 cm no volume da mesa, o chão livre mais perto (no máximo 10 cm). `limpar_mesa` fica na quina (`cornerSpot`, 0,67 m na diagonal do centro).
- **`BarRoom`:**
  - sentar grava `animationStartedAt`;
  - **E** sentado vira `stand-up` e só libera ao fim de `levantar`;
  - o consumo da mesa para quando o personagem começa a levantar;
  - o mictório é o `Interactable` novo do tipo `urinal` (`mictorio-1..3`);
  - fumar é o emote `smoke`, com o movimento travado;
  - o cigarro inteiro é o emote `cigarette`: `interactionState` e `animationState` `cigarette` por `barClipMs('fumar_mixamo')`, movimento travado, **E** e **F** ignorados até o fim; como o clipe termina onde começou, o servidor não move o corpo;
  - vomitar sai de `NeedsDirector.sick`, ao terminar uma bebida;
  - sair do bar no meio do `levantar` deixa o avatar em pé ao lado da cadeira.
- **Magrão** (`apps/server/src/world/bartender.ts`): não anda mais até o cliente. O clipe leva o corpo dele até a chopeira ou o freezer e de volta. Começado o clipe, um pedido cancelado é terminado do mesmo jeito, mas ninguém recebe a bebida.
- **`ServedItem.seat`:** cada item servido diz de que assento foi pedido, para os clientes saberem quem está comendo.
- **Empregos:** ao terminar **Limpar a mesa N**, a próxima tarefa nunca é a mesma mesa, que ainda constava como suja até o servidor recolher. Quando a tarefa troca sozinha, o jogador agora recebe `job.state`.

## Cliente

O jogo é PlayCanvas, não three.js. Por isso, `animacoes_bar.js` não é carregado: ele foi portado para `apps/web/src/engine/bar-animations.ts` com a mesma lógica. O original continua em `assets-bar/.../export/animacoes` como referência.

- **Conversão para cada skin** (`mixamo-retarget.ts`, a mesma dos [músicos do palco](palco.md)): primeiro alinha as direções reais dos membros numa referência virtual, preservando o bind; depois aplica a diferença de rotação de cada osso no mundo a partir do repouso de autoria. O quadril anda os metros do clipe nos lugares (cadeira, mictório, mesa, balcão). Nas ações no espaço do próprio corpo, anda proporcional à altura; quando o GLB traz `quadril_m` (`hipHeight` no `map-data`, 1,01 m no esqueleto do "Smoking"), anda proporcional à altura do quadril (`Target.hipHeight`), porque esse esqueleto tem outras proporções. A conversão acontece uma vez por skin e por clipe, quando a ação aparece pela primeira vez.
- **Linha do tempo** (`barTimeline`, `packages/shared/src/bar-animations.ts`): do estado sincronizado e do relógio do servidor saem o clipe e o tempo.
  - Clipes encadeados entram sem mistura: o último quadro de um é o primeiro do seguinte.
  - Em `sentado_loop`, o corpo usa `Sit` do banco Mixamo, ancorado ao assento e com entrada de 0,3 s. Seu tempo continua a partir de `step.startedAt`, mesmo que o banco carregue durante o repouso sentado. A linha do tempo e os objetos continuam usando o clipe original.
  - A entrada numa ação mistura 0,3 s; a saída de um loop (comer, levantar, apagar) mistura 0,4 s.
  - Ao terminar, um clipe que deixa o corpo longe da origem (levantar) põe o avatar onde o corpo está, sem mistura, como o `reenraizar` do módulo. Se o servidor pôs o avatar alguns centímetros adiante, ele caminha até lá.
- **Lugar** (`barFrame`): a cadeira do assento, o mictório, a quina da mesa ou o lugar do Magrão. O avatar desliza 0,3 s até lá partindo de onde o corpo estava.
- **Props:** cada avatar tem a sua cópia dos props do GLB, posta no espaço do clipe.
  - Os props seguros pela mão ou pela cabeça (`segue`) são corrigidos pelo osso real da skin, como o `corrigirProps`. Antes, os eixos do osso da skin são girados para os do osso de autoria pela rotação de eixos mais próxima (uma das 24), calculada do repouso alinhado do retarget (`alignedRest`). Nos rigs Mixamo ela é a identidade. No rig próprio do Nathan os eixos ficam uns 120° trocados, e sem isso o cigarro, o garfo e o copo orbitavam a mão e a cabeça.
  - Depois da correção, `mira` (cigarro inteiro, quadros 175–225) gira o cigarro em torno do filtro para apontar a chama do isqueiro, que vem da outra mão; a brasa e o emissor da ponta giram junto, como o `mirarProps`.
  - A cadeira do mapa é a instância de `INST_A_cadeira-vermelha`, que continua instanciada: o buffer de instâncias é reescrito enquanto o `Prop_Cadeira` a puxa. Quando ela para, as sombras das lâmpadas são redesenhadas.
  - `Copo_Bandeja` e `Freezer_Bar_Tampa` somem enquanto a cópia está em uso.
- **Partículas:** fumaça, vômito e urina são pontos de um único buffer, com os parâmetros de `FX_TIPOS`. A escala dos nós `FX_*` é a intensidade. O jato de urina é um pouco mais grosso que o de autoria (1,4 a 1,8 cm em vez de 1,0 a 1,2 cm), que quase não aparecia na câmera do jogo. Elas não mexem no alfa do canvas.
- **Restos:** a bituca (dos dois jeitos de fumar), a poça (60 s) e a bebida no balcão (2,5 s) ficam como cópias soltas no mapa. Na mesa, o prato servido é o do jogo.

## Modo de debug (só em desenvolvimento)

**F8** abre um painel que dispara cada ação no próprio jogador sem passar pelo servidor:

- fumar e parar;
- fumar um cigarro inteiro;
- vomitar;
- cair e levantar do chão;
- sentar na cadeira mais perto, comer, parar de comer e levantar;
- limpar a mesa mais perto;
- urinar no mictório mais perto.

O painel também faz o Magrão tirar chopp ou chopp escuro, ou pegar uma long neck. Ele mostra o que o módulo achou no mapa (cadeiras, mesas, mictórios, balcão), os arquivos carregados, as partículas, os restos e os objetos escondidos. Durante a ação, o jogador fica parado. Quando a ação termina, ou com *Voltar ao servidor*, vale de novo o estado da sala. No console: `barDebug.barAnimation('sentar')`, `barDebug.map().barAnimations`, `barDebug.barChair('seat-9')` e `barDebug.barProp(id, 'Prop_Cigarro')`.

## Assets

`npm run assets:map`:

- copia `export/animacoes/bar_*.glb` para `apps/web/public/animacoes` (oito grupos, com `bar_fumar_mixamo.glb`);
- valida o contrato:
  - os 21 clipes e as durações em quadros;
  - os props;
  - `mixamorig:Hips` preso ao nó do esqueleto: `Personagem` nos GLBs do `18_animacoes_bar.py`, `Armature` em centímetros com escala 0,01 no do `19_fumar_mixamo.py` (a escala entra no início e no fim do quadril);
  - `Balcao_Lugar_Magrao`, `Balcao_Entrega` e `Mictorio_Lugar_N`;
  - `Copo_Bandeja` e `Freezer_Bar_Tampa` como nós de malha próprios;
  - cada cadeira de mesa virada para a sua mesa;
- grava em `barAnimations`: arquivos e hash, duração, início e fim do quadril de cada clipe, `segue`, `mira`, `substitui`, `entrega`, `fica`, `hipHeight` (`quadril_m`), partículas e lugares.

Cada assento ganha a instância da sua cadeira (`chair`) e o ângulo real dela (`rotation`, com o desvio de até 10° da autoria). Cada mesa ganha o nó `Mesa_NN` e o seu enquadramento (`anchor`).

O PlayCanvas descarta os `extras` da cena de um GLB, por isso os metadados vão para o `map-data`. Os FBX de `export/animacoes/fbx` não são usados. O jogo carrega o `bar_boteco.glb` sem Draco.

## Testes

- `apps/server/test/bar-animations.integration.test.ts`, por WebSocket real:
  - mictório ocupado e esvaziado no tempo do clipe;
  - levantar pedido no meio do `sentar`, com o corpo ao lado da cadeira;
  - cigarro aceso, movimento travado e apagado só depois de aceso;
  - cigarro inteiro: corpo travado pelo `fumar_mixamo` inteiro, visto pelo outro jogador, **E** e **F** sem efeito, livre no mesmo lugar;
  - Magrão tirando o chopp do lugar dele, e o cliente bebendo ao fim do clipe;
  - vomitar ao terminar a bebida.
- `apps/server/test/bartender.test.ts`: chopp e long neck pelos clipes, fila e pedido cancelado no meio.
- `tests/integration/bar-animations.test.ts`:
  - GLBs publicados iguais ao export;
  - 124 cadeiras, 31 mesas, 3 mictórios e o lugar do Magrão;
  - todo assento levanta em chão livre a até 10 cm do fim do clipe;
  - toda mesa tem quina livre;
  - a linha do tempo;
  - o grupo `fumar_mixamo` (538 quadros, `hipHeight` 1,01, `mira`, bituca que fica, fim no lugar do início).
- `tests/e2e/bar-animations.spec.ts` (projeto `bar-animations`):
  - todas as ações ao mesmo tempo em skins diferentes, na página de fixture: cadeira puxada e de volta, props na mão, copo e tampa trocados, partículas, poça e bebida deixadas, comer com o prato servido;
  - o cigarro inteiro nas seis skins: maço, isqueiro, chama e brasa no acendimento, a chama a menos de 20 cm do cigarro, fumaça, seis bitucas no chão depois do fim;
  - ao vivo: **F** acende e apaga pelo servidor, **Shift+F** fuma o cigarro inteiro e libera no mesmo lugar deixando a bituca, e o painel F8 faz o Magrão tirar o chopp e dispara o cigarro inteiro.

### Limitações conhecidas do cigarro inteiro

- Na skin do Rafael, durante o acendimento (por volta de 6,1 a 7,3 s), a mão esquerda fica na frente da boca: o isqueiro some em parte e a chama encosta no meio do cigarro (a uns 5 cm do filtro). É como o "Smoking" do Mixamo cai nas proporções dele, e o GLB não deve ser editado.
- Na skin do Read, a chama fica a uns 13–15 cm do filtro no mesmo trecho, ou seja, um pouco além da ponta do cigarro.
