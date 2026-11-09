# Jogo com óculos VR (Meta Quest 2 e outros headsets WebXR)

O jogo roda inteiro no navegador, então o VR é **WebXR**: no Quest 2, abra o endereço **https** do jogo no Navegador do próprio óculos, entre no bar e aperte o botão dos óculos no topo. Nada muda para quem joga no PC ou no celular: o VR é só uma troca de câmera e de controles, e a sala (servidor) nem sabe que a pessoa está de óculos.

> **Estado.** Feito e testado **sem headset** (fixture `tests/fixtures/vr.html` + `tests/e2e/vr.spec.ts`, que rodam o código real da sessão com a cabeça simulada). O que só um headset mostra (quadros WebXR, botões dos controles, vibração, conforto e desempenho no Quest 2) **não foi testado em óculos de verdade**: veja "O que falta verificar".

## Como ligar

1. Menu (Esc) › Ajustes › **Realidade virtual** › *Jogar com óculos VR* (fica salvo no navegador, `bar:vr:v1`). Isso mostra o botão dos óculos na barra de cima, só dentro do bar.
2. *Entrar no VR*, na mesma página, abre a sessão. A sessão só pode começar de um clique: por isso é um botão, e não algo automático.
3. Sair: o mesmo botão, ou o menu do sistema do Quest (a sessão acaba e o jogo volta para a janela normal).

Opções (Menu › Ajustes › Realidade virtual): giro em **passos** (15°, 30° ou 45°) ou **suave**; **anel de conforto**; **resolução do VR** (50–100 % da resolução nativa do óculos; o padrão 75 % é o que o Quest 2 aguenta melhor).

## Controles (Quest 2)

| Controle | Na rua e no bar | Em moto ou carro | Com janela aberta |
|---|---|---|---|
| **Direcional esquerdo** | Anda para onde o nariz aponta (empurrado até o fim, corre). Apertar o direcional corre sem segurar. | Acelera, freia e dá ré (para cima/baixo); vira (lados) | Rola a lista sob o laser |
| **Direcional direito** | Gira a visão (passos ou suave); apertar **recentraliza** na sua posição e altura | idem | Rola a lista sob o laser |
| **Gatilho direito** | Apontando para uma pessoa: abre o menu dela. Senão, interage (`E`). | Buzina (segure) | Clica |
| **A** | Interagir (`E`) | Desmontar (`E`) | Clica |
| **B** | Acena (`V`) | Farol (`H`) | Fecha a janela (`Esc`) |
| **X** | Celular (`K`) | Liga e desliga o motor (`R`) | — |
| **Y** | Abre/fecha a tela com a interface; fecha a janela se houver uma | idem | Fecha a janela |
| **Gatilho esquerdo** | Chat (`T`; o teclado de tela aparece) | Freio de mão (segure) | Clica |
| **Grip esquerdo** | Corre (segure) | Freio de mão (segure) | — |
| **Grip direito** | Dança (`G`) | Empinar (moto) ou galope (cavalo) (segure) | — |
| **Controle esquerdo diante dos olhos** | Mostra o **relógio**: mapa, estado (vida, energia…) e carteira | idem | — |

Cada botão faz o que a tecla do PC faz (`hooks.key`), então valem as mesmas regras, bloqueios e atalhos do jogo. O resto das teclas está em Como jogar (a aba *Óculos VR*).

## Como é feito

### A câmera e o corpo (`vr/vr-session.ts`, `engine/BarScene.ts`, `engine/camera-rig.ts`)

- A entidade da câmera vira filha de um **rig** (`VrSession.root`). O WebXR escreve a pose do headset na pose *local* da câmera no começo de cada quadro; o `BarScene.update` então roda o código de câmera de sempre (primeira pessoa, veículos, TV e palco) na mesma entidade, **só para saber onde os olhos devem ficar**, e `VrSession.endFrame` move o rig para que o headset caia ali. A pose do headset volta depois. O quadro desenhado vem das vistas do WebXR, não da entidade, então o que o código de câmera fez nela não aparece.
- Os olhos ficam **sobre os pés** do avatar quando ele anda (os pés andam suaves, a cabeça balança), e na posição que o código de câmera deu em veículo, sentado, TV, palco e selfie. A altura segue a do avatar, suavizada (`eyeY`, 6/s), e a **altura real da pessoa** é medida ao entrar e a cada recentralização (`refHeight`): agachar de verdade abaixa a visão, ficar em pé volta ao normal.
- Andar de verdade pela sala mexe só a cabeça; passou de 1,4 m do centro, o centro vai atrás devagar. Recentralizar (direcional direito apertado) leva o centro para a cabeça.
- O **heading** do jogo é o da cabeça mais o giro do direcional direito: `beginFrame` entrega a direção ao `CameraRig.slave(yaw, pitch)`, e daí saem o andar (`getInput`), o ouvido (`getListener`), a cabeça do avatar (`headLookAt`) e os passos. O avatar anda para onde o nariz aponta. A cabeça do avatar fica escondida (primeira pessoa fixa: `CameraRig.enterFirst`), e o rolar da bebedeira, o zoom de velocidade e o desfoque de tela ficam desligados (num headset, rolar a imagem é enjoo).
- Quando o jogo põe uma vista própria (a TV, o telão do palco, a selfie do celular), o rig vai para lá e vira o headset para a direção dela (`faceYaw`), e a pessoa olha em volta livremente.
- O **anel de conforto** escurece as bordas da visão conforme a velocidade e a cada passo do giro.
- Resolução: ao entrar, o limite de pixels do navegador sai de cena (`maxPixelRatio = devicePixelRatio`) e vale a escala do VR; a resolução dinâmica não mexe durante a sessão.
- O WebXR pede um quadro do headset mesmo com janela aberta (`autoRender` fica ligado na sessão).

### Corpo, cabeça e braços

- **Braços**: cada braço do avatar dobra (IK de dois ossos, `BarScene.poseArm`) para o pulso chegar ao controle, com o cotovelo para baixo, para fora e um pouco para trás; depois a mão gira para os dedos apontarem como o controle (−Z da pegada) e a palma ficar virada como a mão real (+X na esquerda, −X na direita). Medido pelas juntas da própria mão (`handFrame`), vale para qualquer esqueleto.
- **Os outros veem**: as mãos vão para a sala (`player.arms`, até ~12 por segundo e só quando mexem mais de ~1 cm), no referencial do corpo (pés, direita, frente). A sala guarda como um texto curto (`Player.vrArms`, `packages/shared/src/vr-arms.ts`) e cada cliente dobra os braços de quem está de VR, suavizando entre as atualizações. Ao sair do VR o texto fica vazio e os braços voltam à animação.
- **Corpo sob a cabeça**: andando a pé, o corpo desenhado desliza para ficar debaixo dos olhos (até 0,7 m) quando a pessoa se inclina ou dá passos na sala, com os olhos um pouco à frente do rosto, para não ver o peito por dentro. Parado, se a cabeça vira mais de ~43°, o corpo vira junto (e a sala recebe a nova direção). Só o desenho muda: a posição da sala é a mesma.
- **Cabeça**: no VR fica sempre escondida (também com janela aberta), menos na selfie e nas vistas de TV e palco.

### A interface dentro do headset (`vr/dom-mirror.ts`, `vr/vr-panels.ts`, `vr/vr-keyboard.ts`)

Páginas HTML não aparecem em sessão imersiva, e toda a interface do jogo (janelas, celular, mesas, chat, loja) é HTML. Em vez de refazer tudo para o VR, a própria página é **desenhada numa textura** e clicada à distância:

- `DomMirror` clona a página, escreve no clone só as regras de CSS cujas classes, ids e atributos existem nele (as folhas têm ~400 KB; o clone usa ~10–50 KB), e o navegador desenha o clone como imagem SVG (`<foreignObject>`) num canvas. Imagens viram `data:`, canvases viram imagem, valores digitados, marcações e rolagens são copiados; animações ficam desligadas. A imagem tem de ser `data:` (não `blob:`): com `blob:` o Chrome marca o canvas como contaminado e a textura não sobe.
- **A tela**: a página inteira, grande (2,1 m a 1,5 m de distância) à frente da pessoa. **Abre sozinha** quando abre uma janela, o celular, uma mesa, o menu de uma pessoa ou o teclado, e **fecha sozinha** quando eles fecham (se foi aberta à mão com Y, fica até Y de novo). Recaptura quando a página muda (até ~4 por segundo) e logo depois de cada clique.
- **O laser** (cada controle tem um raio): acerta a tela, o ponto vira coordenada da página, e `pointerover/move/down/up`, `mousedown/up` e `click` chegam ao elemento de verdade (`document.elementFromPoint`, que já respeita `pointer-events`). Barras deslizantes (`<input type=range>`) seguem o laser enquanto o gatilho está apertado; listas suspensas (`<select>`) que um script não consegue abrir andam uma opção a cada clique (no quarto esquerdo, voltam); o direcional rola a lista sob o laser.
- **O HUD** (dica de tecla "E Interagir", avisos, banner de evento, mesa, consumo): só as próprias peças são desenhadas (cada uma presa num canto da imagem), numa plaquinha à frente e abaixo dos olhos que acompanha a cabeça devagar. Só redesenha quando o texto muda.
- **O relógio** (mapa, vida e necessidades, carteira): idem, na face do controle esquerdo, só quando ele está diante dos olhos, a ~1 por segundo.
- **Nomes** sobre as pessoas e NPCs até 18 m (os 10 mais próximos), sempre virados para os olhos (os nomes do HTML estão presos à tela e não valem no headset).
- **O teclado** (`#vr-keyboard`) é HTML comum no pé da página, que o mesmo espelho desenha: sobe sozinho quando um campo de texto ganha foco, e as teclas escrevem no campo (maiúscula, acento, apagar, enviar, fechar).
- Para não travar o mundo: a imagem é desenhada pelo navegador na thread principal, e um quadro parado no headset se sente. Cada captura mede o próprio custo e a seguinte espera várias vezes isso (`cost`), e o HUD e o relógio capturam só as próprias peças.

## Arquivos

| Arquivo | O que tem |
|---|---|
| `apps/web/src/vr/vr-mode.ts` | Preferências (`bar:vr:v1`), suporte do navegador, classe `vr-active` no `<html>` |
| `apps/web/src/vr/vr-session.ts` | A sessão WebXR, o rig, os controles, o anel de conforto |
| `apps/web/src/vr/vr-panels.ts` | A tela, o HUD, o relógio, os nomes e o laser |
| `apps/web/src/vr/dom-mirror.ts` | A página como textura |
| `apps/web/src/vr/vr-keyboard.ts`, `vr/vr.css` | O teclado e o CSS do VR |
| `apps/web/src/engine/BarScene.ts` | `enterVr`, `exitVr`, `recentreVr`, `simulateVr`, a âncora dos olhos em `update`, `pickPlayerRay`, `vrNames` |
| `apps/web/src/main.ts`, `apps/web/src/pause-menu/menu-content.ts` | A página Realidade virtual do menu, `vrWindowOpen` (quando a tela abre sozinha; o menu do Esc conta como janela) |
| `tests/fixtures/vr.html`, `tests/e2e/vr.spec.ts` | Sessão simulada (sem headset) |

## O que falta verificar (só num Quest 2)

- Que o WebXR abra e que `app.xr.start` aceite as opções no Navegador do Quest (o código usa `local-floor` e `framebufferScaleFactor`).
- **Desempenho**: o bar e a cidade são pesados para o chip do Quest 2. Se não segurar 72 Hz, baixe a *resolução do VR* e os gráficos (a opção *gráficos leves no VR* já troca para o preset Baixo ao entrar). As capturas da interface foram medidas no PC (10–50 ms por captura pequena, ~20–400 ms a página inteira conforme o efeito na tela); no Quest serão mais lentas, e é isso que o `cost` segura.
- Mapa dos botões (`xr-standard`: gatilho 0, grip 1, direcional 3, A/X 4, B/Y 5, eixos 2 e 3), conforto e altura da pessoa.
- Fontes da interface (2026-11-06): o espelho lê os `@font-face` da própria página, baixa os arquivos uma vez e os escreve na imagem como `data:` (a primeira captura ainda usa a fonte do sistema, a seguinte já tem Chakra Petch e JetBrains Mono). Custo medido no PC: cerca de +4 ms por captura e ~110 kB a mais de marcação; no Quest será maior, e o `cost` segura o ritmo. Conferido no Edge, não no óculos.
- Apontar para **veículos**: o gatilho direito, a pé, também abre o menu de uma moto ou carro (o mesmo do botão direito do mouse); vale o que estiver mais perto no raio. Conferido só no tipo e na sessão simulada (que não tem veículos).
- Ainda não tem: escolher o ombro (mão) de apontar, e rolagem suave do mundo com a tela aberta.
