# Voo (administradores)

**B** liga e desliga o voo para qualquer pessoa com papel `admin`, inclusive administradores que não são a conta principal (o servidor recusa os outros: `admin.fly`). O atalho funciona em ambos os modos do microfone; para administradores, apertar para falar usa **Alt+B**.

- Controles: WASD anda no ar, **Shift** acelera (24 m/s contra 9), **Espaço** sobe, **Ctrl** desce. Sem colisão (atravessa paredes); só o chão embaixo e o teto de 60 m limitam (`flyPlayer`, packages/shared/src/world.ts, o mesmo passo no cliente e na sala).
- Estados `fly-idle` (pairando) e `fly` (em movimento) em `animationState`; o `y` já é replicado. Ao ligar, a sala põe o corpo 1,5 m acima; o desenho sobe com o impulso da decolagem (abaixo).
- Pousar: B de novo, perder o papel, sentar/interagir ou reconectar. Desce ao chão abaixo (ou ao ponto livre mais perto).
- Enquanto voa, a sala recusa as ações de jogo (mesa, item, emote, golpe...); só o telefone segue.
- Pose (apps/web/src/engine/fly-pose.ts): o corpo inclina em torno do quadril (−5° pairando, 63° no máximo de velocidade) e os membros giram sobre o clipe Idle no eixo do corpo (independe do rig). Pairando: joelhos soltos, braços abertos, balanço lento. Em movimento: braços à frente, pernas atrás, pés apontados. Valores ajustados à mão, sem ver num óculos nem em vários skins.

## Som e a barreira do som
- Vento em laço (`fly-sound.ts`, sons em [sons-voo.md](../assets/sons-voo.md)): sobe de volume, tom e brilho com a velocidade. Só quem voa ouve.
- Passou de ~15 m/s (Shift) uma vez por arrancada: estrondo grave, corte de ar, anel de vapor branco que se abre (`BlowEffects.shock`), o campo de visão estica 12° e as bordas da tela riscam, tudo voltando em ~1 s. Reabilita ao desacelerar abaixo de 10 m/s.
- Os braços vão para trás no voo rápido, e o corpo balança (rolagem e cabeceio lentos, maiores na velocidade).

## Pose e movimento (polimento)
- **Pose vista, não adivinhada:** o `FlyPose` foi conferido num fixture (`/rigs.html`, vista lateral, 3/4 e de trás) em Rafael, Nathan e Gilmar. No voo rápido os braços ficam estendidos ao longo do corpo (12° para trás, 15° abertos, cotovelos quase retos) e a cabeça levanta 58° contra a inclinação, para os olhos olharem à frente. Pairando: braços abertos, joelhos soltos.
- **Movimento sem tranco:** o corpo do voador é movido a cada quadro, não de tick em tick. Quem voa continua na sua velocidade (a das teclas, até um tick) e o corpo segue esse ponto suavemente (`animateAvatar`); quem assiste usa a velocidade medida entre os patches da sala (até 120 ms). Antes, a 24 m/s cada tick pulava 1,2 m e o corpo "teleportava" (o limite de 1,5 m): numa simulação, a velocidade desenhada oscilava de 0 a 125 m/s com 22 teleportes em 3 s; agora oscila ~11%.
- Na queda (`fly-fall`) o corpo usa a velocidade medida dos patches, também sem degraus.
- A velocidade de quem assiste só vale de um patch em voo para o outro: o salto da decolagem não é velocidade, e um patch sem movimento zera. Antes, a última velocidade continuava sendo somada para sempre e quem pairava aparecia até 1,8 m acima (e quem parava, metros à frente).

## Decolagem, queda e pouso (08/11)
Tudo no `FlyPose`, sobre o clipe Idle, conferido de lado no fixture `crossed-arms.html` (Rafael):
- **Decolagem (~1 s):** os joelhos carregam (0,16 s, quadril desce ~8 cm, braços para trás), as pernas empurram (pés apontados, braços para frente e para cima) e o corpo sobe com uma pequena passada do ponto (~10 cm) até pairar (`liftY`, a raiz desenhada acompanha o impulso em vez do salto de 1,5 m num quadro).
- **Queda (`fly-fall`):** pernas buscando o chão, joelhos um pouco dobrados, braços abertos para equilíbrio, leve inclinação para trás.
- **Pouso (~0,7 s):** os joelhos absorvem em 0,09 s, mais fundo quanto mais rápido desceu (de 0,3 a 1, pela velocidade vertical desenhada), peito e braços à frente, e o corpo se levanta devagar. Os pés ficam no chão: o quadril desce o quanto a perna dobrada encurta.
