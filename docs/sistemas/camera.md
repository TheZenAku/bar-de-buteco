# Câmera

O jogador escolhe entre quatro visões. **Q** passa para a próxima, a **rodinha do mouse** aproxima ou afasta uma visão por vez (de *longe* até a *primeira pessoa*) e **Configurações → Câmera** escolhe direto. A escolha fica salva no navegador (`bar:settings:v1`, campo `camera`) e um aviso curto mostra o nome da visão ao trocar.

| Visão | Como fica |
| --- | --- |
| Primeira pessoa | Nos olhos do personagem: logo acima e à frente da articulação da cabeça, então acompanha o corpo sentado, no mictório ou fumando. A cabeça do próprio personagem some (a articulação é encolhida depois que os clipes posam o corpo), mas mãos, braços e o que elas seguram aparecem. Parado, o corpo vira junto com a visão. O nome e o anel do próprio jogador não aparecem. |
| Terceira pessoa · próxima | Braço de 3 m, olhando na altura dos ombros (1,45 m). |
| Terceira pessoa · padrão | Braço de 6,4 m, olhando a 1,25 m. É a visão de quem entra pela primeira vez. |
| Terceira pessoa · longe | Braço de 10,5 m, olhando a 1,1 m: mais cenário em volta. |

Arrastar o mouse gira a visão. Em terceira pessoa, arrastar para cima e para baixo sobe e desce o braço; em primeira pessoa, olha para cima e para baixo.

## Movimento suave

Tudo é suavizado por amortecimento exponencial (`camera-rig.ts`):

- o giro e a inclinação seguem o mouse um pouco atrás da mão;
- trocar de visão desliza o braço até o novo comprimento, e entrar ou sair da primeira pessoa leva a câmera dos olhos para trás do personagem (e vice-versa) em cerca de meio segundo;
- o ponto que a câmera olha segue o corpo com um pequeno atraso; um salto grande (renascer, ser levado de volta) muda direto;
- uma parede encolhe o braço em poucos quadros, e ele volta devagar quando o caminho fica livre;
- no mictório a câmera gira até o lado com mais espaço, também deslizando.

## Raio-X

Só o prédio e a vizinhança param o braço da câmera: paredes, lajes, forros, telhados, portas e o tablado do palco. Móveis, objetos, árvores, carros e o equipamento do palco não puxam a câmera para perto do personagem (`cameraFraction(…, true)` em `packages/shared/src/world.ts`).

Quando alguma coisa sólida fica entre a câmera e o corpo (um teste de visão até a cabeça, o peito e o quadril, `sightBlocked`), abre-se uma janela em volta do personagem: tudo o que está na frente dele, dentro dessa janela, deixa de ser desenhado, do mesmo jeito para qualquer material. A janela tem o formato do corpo (0,8 m para cada lado e 40% mais alta que larga), o miolo totalmente aberto e uma borda fina pontilhada para não ter corte seco. Ela abre em cerca de um décimo de segundo e fecha em um quarto de segundo quando a visão fica livre.

Regras da janela (`camera-xray.ts`):

- só corta o que está mais de 0,5 m à frente do centro do corpo, então os braços e o copo na mão nunca somem;
- nunca corta o piso em que o personagem pisa (nada abaixo de 12 cm acima dos pés), então não aparece um buraco no chão;
- vale só para a imagem: as sombras continuam inteiras;
- não funciona em primeira pessoa, assistindo a uma tela ou na porta do bar.

O recorte é um trecho de shader (`litUserMainStartPS`) aplicado a todos os materiais iluminados antes de o primeiro ser desenhado. Ele descarta pixels com um padrão Bayer 4×4, sem transparência nem ordenação. Na medição com GPU (Edge headless, D3D11), o quadro ficou em ~52 FPS com e sem o trecho compilado.

## Onde está

| Arquivo | Papel |
| --- | --- |
| `apps/web/src/engine/camera-rig.ts` | Visões, suavização, braço contra o prédio e quando abrir o raio-X |
| `apps/web/src/engine/camera-xray.ts` | O recorte no shader e seus parâmetros |
| `apps/web/src/engine/BarScene.ts` | Liga a câmera à cena: Q, rodinha, arrasto, cabeça escondida, nome e anel do jogador |
| `packages/shared/src/world.ts` | `cameraFraction` (o que para o braço) e `sightBlocked` (o que esconde o jogador) |
| `apps/web/src/settings.ts`, `apps/web/src/main.ts` | Preferência salva, opção em Configurações e o aviso ao trocar |

`tests/integration/map.test.ts` confere que o braço atravessa o balcão mas não a laje nem as paredes, e que o balcão esconde o quadril de quem está atrás dele.
