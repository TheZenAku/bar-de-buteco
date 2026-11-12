# Necessidades do personagem

Cada personagem tem seis atributos de 0 a 100: **vida**, **fôlego**, **fome**, **sede**, **bexiga** e **embriaguez**. O servidor é a autoridade. Ele mantém os valores com casas decimais e sincroniza números inteiros no estado da sala, enviando atualização só quando um ponto muda. Todos os jogadores veem os mesmos estados: queda, desmaio e cambaleio.

## Onde está cada parte

| Parte | Arquivo |
| --- | --- |
| Configuração, regras puras, consumíveis e máquina de estados | `packages/shared/src/needs.ts` |
| Estado por jogador, porta do inventário e sincronização | `apps/server/src/world/needs.ts` (`NeedsDirector`) |
| Campos sincronizados | `apps/server/src/state.ts` (`Player.hp`, `hpMax`, `stamina`, `hunger`, `thirst`, `bladder`, `drunk`, `exhausted`, `condition`, `conditionUntil`, `faintCause`) |
| Integração com o loop, as ações, o banheiro, os desmaios e o resgate | `apps/server/src/BarRoom.ts` |
| Banheiros (vasos sanitários reais do mapa, `COL_Mob_Vaso*`, e os mictórios `Mictorio_Lugar_N`) | `packages/shared/src/world.ts` |
| Predição da corrida e do andar bêbado | `apps/web/src/networking.ts` |
| Barras, alertas, tela de desmaio e efeitos de tela | `apps/web/src/needs-hud.ts`, `apps/web/src/needs.css` |
| Balanço do corpo e da câmera | `apps/web/src/engine/BarScene.ts` |

As necessidades avançam dentro do `step()` de 20 Hz que já existia. O sistema não cria temporizadores próprios. Quando um personagem é removido, seu estado é apagado com `needs.forget`. Um avatar desconectado fica pausado: retoma os valores ao voltar e, se estava desmaiado, continua caído.

## Os atributos

- **Vida.** Começa em 100. Cai por dano (`NeedsDirector.damage`) e por desidratação. Ao chegar a 0, o personagem **desmaia**:
  - cai com o clipe `Fallen`;
  - fica bloqueado (sem andar, interagir, dançar, trocar de visual, jogar ou usar a jukebox ou a TV) durante `faint.seconds`;
  - acorda com `hp.recoverTo` de vida e passa `faint.recoveringSeconds` em "recuperando".

  Cada desmaio acontece uma vez só. No mesmo momento, há 80% de chance de perder um item pelo inventário (veja abaixo). Alimentos podem dar **vida máxima temporária**: ao terminar o bônus, a vida excedente volta ao novo máximo.
- **Fôlego.**
  - **Gasto e recuperação.** Correr (Shift, na corrida que já existia) gasta fôlego, mas só quando o personagem realmente se desloca. Ele volta depois de `regenDelaySeconds` parado ou andando.
  - **Exaustão.** Ao zerar, o personagem fica "sem fôlego" e só volta a correr ao recuperar `exhaustedUntil`. Apertar e soltar o Shift não adianta: cada passo de corrida reinicia a espera.
  - **Penalidades.** Fome, sede e bexiga cheia reduzem a recuperação aos poucos, sem degrau brusco. A fome também aumenta o gasto.
  - **Predição.** O cliente prevê a mesma regra com `canRun`, por isso a corrida não "volta" na tela.
- **Fome.** Cai com o tempo e não tira vida. Abaixo de `staminaPenalties.hunger.from`, prejudica o fôlego. Também aumenta o efeito do álcool, em até `drunk.hungerSensitivity`.
- **Sede.** Cai com o tempo, `runningMultiplier` vezes mais rápido correndo. Ao zerar, tira `damagePerSecond` de vida por segundo, levando ao mesmo desmaio por vida. Depois de acordar, há `graceAfterWakingSeconds` sem esse dano, para não haver desmaios em sequência.
- **Bexiga.** Sobe com a bebida. Os vasos sanitários dos dois andares (oito no mapa) a esvaziam em `toiletSeconds`, e os três mictórios (`Mictorio_Lugar_N`), em pé, no tempo do clipe `urinar` (11,5 s; [animações do bar](animacoes-bar.md)):
  - uma pessoa por vez em cada vaso;
  - quem sai antes esvazia só a parte proporcional.

  O medidor fica crítico a partir de 70, sem aviso na tela. A bexiga não causa desmaio; cheia, apenas reduz o fôlego.
- **Embriaguez.** É independente da bexiga e cai `soberPerMinute` por minuto. Os estágios são definidos em `drunk.stages`:
  1. tela com vinheta quente e câmera levemente inclinada;
  2. o andar desvia de forma determinística (`swayInput`, igual no servidor e na predição), a câmera balança e o personagem ganha um repouso embriagado próprio;
  3. sem corrida, com caminhada bêbada e tropeços de `stumbleSeconds`, no máximo um a cada `stumbleCooldownSeconds`; terminar uma bebida alcoólica nesse estágio faz passar mal com 40% de chance, no máximo a cada 2 min (`drunk.vomit`): o personagem vomita parado por 7,3 s e perde 10 de embriaguez e 8 de sede ([animações do bar](animacoes-bar.md));
  4. desmaio por álcool: depois de `moveAfterSeconds`, o corpo é levado **uma vez** ao ponto `faint.alcoholRecoveryMarker`, a calçada do `Spawn_Jogador`, em chão livre. A pessoa acorda com no máximo `soberAfterFaintTo` de embriaguez, levanta durante os cinco segundos de recuperação e não entra em um novo ciclo.

Estados possíveis em `condition`:

- `normal`, `stumbling`, `fainted` ou `recovering`;
- "correndo" e "cansado" (`exhausted`) vêm da corrida e do fôlego;
- "bêbado" vem do estágio.

## Consumíveis

Todos os efeitos passam por uma única função, `applyConsumable(state, effects, now, portion)`. A estrutura dos efeitos é:

```ts
{ name, hunger?, thirst?, hp?, maxHp?: { amount, seconds }, drunk?, bladder? }
```

O catálogo `CONSUMABLES` é derivado do catálogo real do inventário e inclui água, refrigerante, café, long neck, copo de chopp, coxinha, pastel, torresmo e curativo. A cerveja hidrata pouco e de forma explícita: álcool não é tratado como água. Nomes, efeitos, preços e limites ficam em `packages/shared/src/inventory.ts`.

Comida, bebida e curativo aplicam todos os ganhos e perdas de uma vez no início do consumo. Isso vale para a mochila, para a bebida recebida no balcão e para cada item que chega à mesa enquanto a pessoa está sentada. Terminar ou interromper a animação não reaplica nem reduz o efeito. Desmaiado ou cambaleando, não é possível consumir.

## Como ajustar

Todos os valores ficam no objeto `NEEDS`, em `packages/shared/src/needs.ts`, que vale para o servidor, o cliente e os testes. Os valores iniciais são pontos de partida para testar o ritmo do jogo:

- fome zera em cerca de 4 horas;
- sede zera em cerca de 2 h 30;
- o fôlego dura cerca de 11 s de corrida;
- cada long neck dá 12 de embriaguez e 18 de bexiga.

## Inventário

O inventário principal é persistido pela API e integrado em `BarRoom`. Uso, descarte e perda removem a unidade em transação antes de atualizar a cópia privada da sala. Após a remoção confirmada pela API, `room.needs.consume(player, itemId, Date.now())` aplica o efeito completo ao iniciar o uso. Veja [inventário](inventory.md).

`InventoryPort`, em `apps/server/src/world/needs.ts`, permanece como um adaptador síncrono pequeno para simulações e modos alternativos:

```ts
interface InventoryPort {
  eligibleItems(playerId: string): readonly string[];   // o que pode ser perdido ao desmaiar
  remove(playerId: string, itemId: string): boolean;
}
```

- **Sala principal.** Usa a API assíncrona e autoritativa; o adaptador fica em `NO_INVENTORY`.
- **Item perdido.** O cliente recebe `needs.itemLost`, atualiza a mochila privada e mostra um aviso.

## Assets e sistemas que ainda não existem

| O que falta | Como o jogo resolve hoje |
| --- | --- |
| Animação própria de exaustão | A falta de fôlego impede a corrida e mantém a caminhada normal; ainda não há um clipe separado de cansaço. Levantar, tropeçar, embriaguez e uso do banheiro já têm estados e clipes próprios. |
| Props próprios para cada comida | Comidas e curativo usam `Use`; bebidas reutilizam o copo ou a garrafa existentes. |

## Testes

- `tests/integration/needs.test.ts`: regras puras dos itens 1 a 11 do pedido, além de limites, NaN e valores absurdos.
- `apps/server/test/needs.integration.test.ts`: sala Colyseus real com dois clientes. Cobre:
  - corrida e exaustão;
  - cerveja com efeitos completos no início e sem duplicação no fim;
  - banheiro ocupado e esvaziado;
  - desmaio por vida bloqueando ações e entradas;
  - porta de inventário com perda de item;
  - desmaio por álcool com um único resgate;
  - sincronização com o outro cliente.

## Anel e coração (2026-11-06)

Vida, fôlego, fome e sede têm **dois valores**: o **anel** (o nível: `hp`, `stamina`, `hunger`, `thirst`) e o **coração** (a reserva por trás: `hpCore`, `staminaCore`, `hungerCore`, `thirstCore`). Bexiga e embriaguez continuam como eram. Tudo em `NEEDS.cores` (packages/shared/src/needs.ts).

- **O anel se enche gastando o coração.** Fome e sede caem com o tempo (o coração dura 40 min e 25 min; correndo, a sede gasta o dobro) e o anel puxa do coração a 3 pontos por segundo. O fôlego cai ao correr e volta gastando 0,05 de coração por ponto (uma barra cheia custa 5). A vida cura do coração a 1,5 por segundo.
- **Comer ou beber altera as reservas imediatamente:** todos os pontos positivos e negativos do item entram de uma vez no início do consumo, sem fila de absorção nem espera pelo fim da animação. O que tira (torresmo dá sede) também sai do coração na hora. O café, a coxinha, o pastel, o torresmo e o refrigerante agora também dão fôlego; o curativo e a comida dão vida ao coração, não ao anel.
- **Anel zerado não mata:** o dano passa para o coração (primeiro o anel, depois o coração). Fome ou sede com anel e coração em zero tiram vida aos poucos (0,25 e 0,35 por segundo, depois de 1 min de carência ao acordar). Fôlego com o coração vazio ainda volta, a 20% do ritmo, para ninguém ficar parado para sempre.
- **Só a vida mata:** anel e coração de vida em zero = a Morte ([morte.md](morte.md)), não mais um desmaio. Ao voltar, o anel fica em 35 e o coração vazio. Só a embriaguez desmaia agora.
- **Matar pela administração** (painel e menu de contexto) zera os dois (`NeedsDirector.kill`) e chama a Morte.
- **HUD** (`needs-hud.ts`, `needs.css`): o anel de cada medidor mostra o nível e o símbolo no meio, o coração. A dica mostra "92 · reserva 64". O que fica crítico é o menor dos dois; o aviso de vida baixa vem do coração.

## Vivendo da reserva (2026-11-12)

Zerar o anel não trava mais o personagem: ele **passa a gastar a reserva**.

- **Fôlego.** Com o anel em 0 e reserva sobrando, a corrida continua **na mesma velocidade** (`canRun` aceita `staminaCore > 0`). O gasto que passa do anel sai da reserva a `reserve.staminaCoreCost` (0,27 de reserva por ponto: ~2,4 por segundo, uma reserva cheia dura ~40 s correndo). Só quando anel **e** reserva zeram vem o travamento de antes (`exhausted`, volta a correr com `exhaustedUntil`). A lentidão, portanto, só chega no fim da reserva, nunca de imediato.
- **Tensão (`reserveStrain`, 0 a 1).** Função pura em `needs.ts`, lida igual pelo teste, pela tela e pelo som. É o maior entre a rampa do anel (abaixo de `ringBelow`) e a da reserva (abaixo de `coreBelow`), em `NEEDS.reserve.strain`. Fome e sede têm o anel recarregado da reserva na hora, então nelas o que aparece é o **fim da reserva** (abaixo de 30). Vida: anel baixo depois de dano ou reserva abaixo de 25. Fôlego: só o anel vazio.
- **Tela** (`apps/web/src/needs-strain.ts`, `.reserve-fx` em `needs.css`): borda suave por necessidade, que entra rápido e sai devagar, mais um balanço do `#world` (propriedades `rotate`/`translate`/`scale`, que não brigam com o `transform` da embriaguez). Com `prefers-reduced-motion` a borda fica e a imagem não mexe. O loop só roda enquanto há algo a mostrar.

  | Necessidade | Borda | Balanço | Som (`needs-strain-sound.ts`, sintetizado) |
  | --- | --- | --- | --- |
  | Fôlego | verde escuro, respirando | rolagem e sobe-e-desce cansados | zumbido grave de máquina que perde força (tom e filtro caem a cada ~1,8 s), tremor e chiado |
  | Vida | vermelho escuro, pulsa no batimento | a imagem dá um solavanco a cada batida | coração abafado "tum-tum" (mais rápido quanto pior), zumbido agudo fino e fluxo de sangue |
  | Fome | ocre | deriva lenta, cabeça leve | ronco de estômago de tempos em tempos, com gorgolejo |
  | Sede | azul pálido e seco | tremor rápido e fraco | vento fino e seco e estalinhos |

  O batimento da vida é disparado pelo mesmo quadro que desenha o pulso, então som e imagem andam juntos. Os medidores ganham o halo da cor de cada um (`.strained`). Desmaiado, morto ou fora do mundo, tudo zera.
- **Não ouvido por uma pessoa.** Os sons foram desenhados no papel e nunca tocados num alto-falante: ajustar `peak`s e frequências em `needs-strain-sound.ts` de ouvido.

Valores escolhidos à mão, para os medidores se mexerem de verdade: ajustar em `NEEDS` (`drainPerMinute`, `cores.*`). Não testado num jogo de verdade com jogadores.
