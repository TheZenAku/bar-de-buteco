# Necessidades do personagem

Cada personagem tem seis atributos de 0 a 100: **vida**, **fôlego**, **fome**, **sede**, **bexiga** e **embriaguez**. O servidor é a autoridade. Ele mantém os valores com casas decimais e sincroniza números inteiros no estado da sala, enviando atualização só quando um ponto muda. Todos os jogadores veem os mesmos estados: queda, desmaio e cambaleio.

## Onde está cada parte

| Parte | Arquivo |
| --- | --- |
| Configuração, regras puras, consumíveis e máquina de estados | `packages/shared/src/needs.ts` |
| Estado por jogador, porta do inventário e sincronização | `apps/server/src/world/needs.ts` (`NeedsDirector`) |
| Campos sincronizados | `apps/server/src/state.ts` (`Player.hp`, `hpMax`, `stamina`, `hunger`, `thirst`, `bladder`, `drunk`, `exhausted`, `condition`, `conditionUntil`, `faintCause`) |
| Integração com o loop, as ações, o banheiro, os desmaios e o resgate | `apps/server/src/BarRoom.ts` |
| Banheiros (vasos sanitários reais do mapa, `COL_Mob_Vaso*`) | `packages/shared/src/world.ts` |
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
- **Bexiga.** Sobe com a bebida. Os vasos sanitários dos dois andares (oito no mapa) a esvaziam em `toiletSeconds`:
  - uma pessoa por vez em cada vaso;
  - quem sai antes esvazia só a parte proporcional.

  O medidor fica crítico a partir de 70, sem aviso na tela. A bexiga não causa desmaio; cheia, apenas reduz o fôlego.
- **Embriaguez.** É independente da bexiga e cai `soberPerMinute` por minuto. Os estágios são definidos em `drunk.stages`:
  1. tela com vinheta quente e câmera levemente inclinada;
  2. o andar desvia de forma determinística (`swayInput`, igual no servidor e na predição), a câmera balança e o personagem ganha um repouso embriagado próprio;
  3. sem corrida, com caminhada bêbada e tropeços de `stumbleSeconds`, no máximo um a cada `stumbleCooldownSeconds`;
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

O catálogo `CONSUMABLES` é derivado do catálogo real do inventário e inclui água, refrigerante, café, long neck, copo americano, coxinha, pastel, torresmo e curativo. A cerveja hidrata pouco e de forma explícita: álcool não é tratado como água. Nomes, efeitos, preços e limites ficam em `packages/shared/src/inventory.ts`.

A bebida conta ao terminar o gole. Se a pessoa levanta no meio, conta a fração já bebida. Desmaiado ou cambaleando, não é possível consumir.

## Como ajustar

Todos os valores ficam no objeto `NEEDS`, em `packages/shared/src/needs.ts`, que vale para o servidor, o cliente e os testes. Os valores iniciais são pontos de partida para testar o ritmo do jogo:

- fome zera em cerca de 4 horas;
- sede zera em cerca de 2 h 30;
- o fôlego dura cerca de 11 s de corrida;
- cada long neck dá 12 de embriaguez e 18 de bexiga.

## Inventário

O inventário principal é persistido pela API e integrado em `BarRoom`. Uso, descarte e perda removem a unidade em transação antes de atualizar a cópia privada da sala. Ao terminar a animação, `room.needs.consume(player, itemId, Date.now())` aplica o efeito. Veja [inventário](inventory.md).

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
  - cerveja pela metade;
  - banheiro ocupado e esvaziado;
  - desmaio por vida bloqueando ações e entradas;
  - porta de inventário com perda de item;
  - desmaio por álcool com um único resgate;
  - sincronização com o outro cliente.
