# Jogo no celular e no tablet (controles de toque)

O jogo nasceu para teclado e mouse. No celular e no tablet, os mesmos comandos vêm de controles na tela, que **apertam as mesmas teclas**: o cenário, a sala e os atalhos continuam sendo os de sempre, e o caminho do PC não muda.

## Quando liga

`apps/web/src/touch/touch-mode.ts` põe a classe `touch-ui` no `<html>`. Todo CSS de toque (`touch/touch.css`) depende dela, então quem joga com mouse não vê nada disso.

- **Automático** (padrão): liga quando o ponteiro principal é um dedo (`pointer: coarse`). Um notebook com tela de toque continua com mouse.
- **Sempre ligados** ou **Desligados**: Menu › Ajustes › Controles de toque (o botão de menu fica no canto de cima, à direita). A escolha fica no navegador (`bar:touch-ui:v1`).
- Os controles aparecem só enquanto o mundo recebe comandos: somem com uma janela, o celular, uma TV, o menu de uma pessoa ou um minijogo na frente, e voltam sozinhos.

## O que tem na tela

| Controle | O que faz |
|---|---|
| **Direcional** (canto esquerdo) | Aparece sob o dedo em qualquer ponto do canto inferior esquerdo. Arrastar anda; empurrar até a ponta corre. Com moto ou carro: para cima acelera, para baixo freia e dá ré, para os lados vira (valores analógicos, de −1 a 1). |
| **Arrastar a cena** | Um dedo gira a câmera (mesma lógica do mouse, mesma sensibilidade das Configurações). |
| **Pinça** | Dois dedos aproximam e afastam a câmera (os mesmos passos da rodinha: perto, médio, longe). |
| **Toque rápido** em uma pessoa, em você ou num veículo | Abre o menu dele, como o botão direito. |
| **Interagir** (botão grande) | `E`: sentar, pedir, usar, montar e desmontar. |
| **Correr** | Liga e desliga a corrida. No cavalo vira **Galope**, na moto vira **Empinar** (segurar), no carro some. |
| **Papo** | `T`: abre o chat. A caixa ganha foco quando o dedo levanta, o que faz o teclado do celular subir. |
| **Mais** | Folha com o resto: pedir na mesa, dançar, acenar, fumar, cigarro, coleção, trabalhar, trancar, celular, mochila, câmera, microfone e a skill ativa. Na moto e no carro ainda motor, farol, piscas, alerta, limpador, capô, porta-malas e porta. |
| **Freio** e **Buzina** | Só em moto e carro (`Espaço` e `F` seguros). |

## Como é feito

- `touch/touch-controls.ts`: monta o overlay dentro de `#game`. Os botões disparam `keydown`/`keyup` sintéticos em `document.body`, com `code` igual ao da tecla, então valem todos os atalhos que já existem (`KeyE`, `KeyT`, `KeyG`, `KeyK`, `KeyI`...). Quem segura (Espaço, F, Shift) manda `keydown` ao apertar e `keyup` ao soltar.
- O direcional não usa teclas: chama `BarScene.setTouchAxis(x, y)` e `setTouchSprint()`, que somam ao que o teclado diz em `getInput()` (andar) e `getMotoInput()` (acelerar e virar). `BarScene.touchContext()` diz se a pessoa está a pé, de moto, de carro ou a cavalo, e os botões mudam com isso.
- Câmera por dedos: `BarScene.touchDown/touchMove/touchUp`, no mesmo canvas. O mouse continua usando os ouvintes de sempre (os de toque só agem com `pointerType === 'touch'`).
- `mouse-capture.ts` não prende o ponteiro quando `touch-ui` está ligada (um ponteiro preso pararia o arrastar da câmera).
- A tela fica acesa enquanto se joga (Wake Lock) e o gesto de pinça da página é bloqueado (`gesturestart`, `user-scalable=no`, `touch-action: none` na cena).
- `manifest.webmanifest` permite instalar o jogo na tela inicial em tela cheia e paisagem. Menu › Ajustes › Interface › Tela cheia tenta travar a orientação em paisagem.
- Primeira vez no bar com toque: um aviso diz onde está o direcional (`bar:touch-hint:v1`). A janela de ajuda ganha a seção "No toque".

## Armadilhas já resolvidas

- **Classe `.tp`, não `.tc`**: `.tc` é a mesa de truco (`truco/table.ts`), que também usa `data-tc`. A colisão escondia os botões de veículo.
- **O clique que sobra do dedo**: o dedo que aperta "Mochila" levanta e clica no que estiver embaixo; se a janela já abriu, o clique cai no fundo dela e a fecha. Todo botão engole o próximo clique por 500 ms (`swallowClick`).
- **Teclado do celular**: o chat abre ao *soltar* o dedo (um `focus()` no `pointerdown` não faz o iOS mostrar o teclado). Enquanto digita, o painel sobe para o topo e segue o viewport visual (`--vv-top`); o rodapé do chat se esconde para sobrar espaço.
- **Painel de tela curta**: em paisagem com menos de 560 px de altura, as janelas perdem margem e cabeçalho; o hero do lobby some para o menu aparecer sem rolar.
- **Minimapa e direcional**: o minimapa fica no canto, menor, e o direcional repousa ao lado dele; em retrato o minimapa sobe acima do direcional.

## O celular (K) no toque

- **Fechar sem teclado**: o botão **X** ao lado do aparelho (só com `touch-ui`; fica à esquerda, em cima ou, sem espaço, sobre o canto, conforme `layout()` em `phone/phone.ts`), o **botão de energia** da lateral (agora é um botão de verdade) e a **barra inicial**: um toque nela volta para a tela inicial e, já na tela inicial, fecha o celular. Uma chamada continua tocando na pílula.
- **Em paisagem** (altura até 560 px) o aparelho fica **mais baixo** (`--ph-h`, classe `compact`): em vez de 864 px lógicos, cerca de 1,55 vezes a altura da tela, então a escala sobe de 0,42 para 0,63 e as letras ficam legíveis. Os widgets da tela inicial somem nesse modo.

### Chamada de vídeo

O quadro era um JPEG de 168×224 preso a 7,6 kB (o socket do mundo aceita 8 kB por mensagem), tirado com `toBlob` na thread da página, e o canto "Sua câmera" era `canvas.captureStream` do jogo inteiro. No celular isso pesava no jogo e a qualidade caía a 0,2, que é o quadriculado.

- **Sem leitura na thread da página**: `BarScene.captureBitmap` faz o recorte e a redução na GPU (`createImageBitmap` com `resizeQuality: 'high'`) no mesmo quadro desenhado, e a codificação JPEG roda num worker (`phone/frame-worker.ts`, `frame-encoder.ts`, com saída na thread da página onde não há OffscreenCanvas).
- **O canto "Sua câmera"** é o próprio quadro que vai ser enviado, desenhado num canvas pequeno: nada de `captureStream`.
- **Escada de tamanho e qualidade**: 96×128, 120×160, 144×192, 168×224. Passou de 7,6 kB: baixa a qualidade (até 0,42) e depois o tamanho. Sobrou folga: sobe a qualidade (até 0,8) e depois o tamanho, com 240 quadros (cerca de 30 s) de espera depois de uma descida para não oscilar. Quem recebe desenha qualquer tamanho.
- **Linha lenta**: se o socket tem mais de 3 quadros parados (`NetworkClient.backlog()`), o quadro é pulado, para a imagem não ficar velha.
- Medido (celular emulado de lado contra um desktop): cerca de 7,6 quadros por segundo recebidos, ~4,9 kB cada em 144×192, e o jogo caiu de ~37 para ~33 quadros por segundo com a câmera ligada.
- 2026-11-06: o limite subiu de 8 para 24 kB (`maxPayload` em `apps/server/src/index.ts`, `PHONE.videoFrameMaxBytes` 22 000, alvo 16 000, 12 quadros por segundo, escada de 192×256 a 336×448), porque a imagem seguia quadriculada. Subir o `maxPayload` exige reiniciar o mundo.

## O que foi verificado e o que não foi

Verificado no jogo real (https://localhost:5173), com Edge emulando celular, toque pelo protocolo do navegador: andar, correr (ponta do direcional), girar, pinça, toque em si mesmo (menu Perfil), Papo com foco na caixa, folha Mais abrindo a Mochila sem fechá-la, janelas escondendo os controles, celular (K) em 844×390, retrato 390×844, 667×375, desligar nas Configurações, e o PC sem nenhuma mudança (W e arrastar com o mouse). `tests/e2e/touch.spec.ts` cobre isso (projeto `touch`).

**Não verificado**: dirigir moto e carro por toque (precisa de admin para chamar o veículo; o layout dos botões foi conferido forçando o contexto, e a soma analógica está em `getMotoInput`); aparelhos reais (teclado virtual do iOS, vibração, Wake Lock, bloqueio de orientação, instalação do manifesto); desempenho em celular fraco (o jogo já escolhe o preset Médio e limita texturas em ponteiro `coarse`, ver [Gráficos](graficos.md)); push-to-talk por toque (use o botão de microfone, ou a tecla `B` com teclado).
