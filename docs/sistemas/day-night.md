# Ciclo de dia e noite

Um dia completo do jogo dura **40 minutos reais**. Amanhecer, dia, entardecer, noite e madrugada transitam continuamente; não existe troca instantânea de presets. O ciclo usa uma época fixa e o relógio já transmitido pelo servidor, então entrar, reconectar ou reiniciar o mundo não reinicia o horário. No lobby, o ciclo continua.

Os parâmetros estão em `apps/web/src/engine/day-night.ts`: `DAY_NIGHT.durationMs`, `epochMs` e `offsetHours`. Alterar a duração muda a fase global calculada; distribua o mesmo build para todos os jogadores. O horário é acelerado e não corresponde à hora civil nem a uma simulação astronômica da cidade.

## Luz natural e luminárias

- O sol nasce do lado **+X**, cruza o arco do lado **+Z**, de frente para a fachada principal, e se põe do lado **−X**. A lua percorre o arco oposto. Fontes abaixo do horizonte não emitem luz. As direções são aplicadas ao eixo **−Y** das luzes do PlayCanvas.
- Sol e lua têm sombras direcionais com duas cascatas, mapa de 2048 e alcance de 55 m. A luz natural mantém a leitura dos exteriores sem substituir as luminárias internas.
- As 13 luminárias originais mantêm suas posições, cores e potências relativas. Tornam-se focos voltados para baixo, com sombras, para bloquear a iluminação em paredes e lajes. Os interiores mantêm iluminação durante o dia; varanda, quintal, palco e terraço acendem gradualmente ao anoitecer.
- Os **12 postes com luminária** ganham focos na posição real da lâmpada, conforme os braços e rotações de `assets-bar/map/BarBoteco/scripts/05_props.py` e `07_exterior.py`. O catálogo `streetFixtures` em `environment-lighting.ts` deve acompanhar alterações futuras na geometria dos postes, que é fundida no GLB.
- As sombras das luminárias ficam guardadas (cache): são desenhadas quando o mapa carrega, quando uma lâmpada acende, quando a qualidade muda e quando a decoração do bar termina de ser montada. Esses mapas guardam só o que não se mexe. Pessoas, o que elas seguram e carregam, e o que está servido nas mesas ficam de fora (`EnvironmentLighting.redrawLampShadows`). Antes, um mapa desenhado com alguém embaixo da lâmpada guardava a sombra dessa pessoa depois que ela saía. No quadro em que os mapas das lâmpadas são redesenhados, o sol e a lua mantêm o mapa do quadro anterior, então a sombra das pessoas ao sol não pisca. Uma lâmpada pendente é desenhada na hora, mesmo fora da vista.
- Embaixo de cada personagem há uma **sombra de contato** (um disco escuro e suave no chão, shader próprio em `BarScene.contactShadow`). Ela é forte sob um teto (salão, varanda, andar de cima) e à noite. Ao sol, a sombra real do personagem faz esse papel, e o disco fica só como um toque.
- **O que nunca projeta sombra** (`NO_SHADOW_NODES` e `NO_SHADOW_MATERIALS` em `environment-lighting.ts`): o fundo distante (`Fundo_Distante`: o céu panorâmico, um domo de ~1,5 km, mais prédios, morros e chão distantes), as sombras de contato pintadas sob os móveis (`Sombra_Contato`), lâmpadas e letreiros, e materiais transparentes (vidro). Até 28/10/2026 o domo do céu projetava sombra sobre o mapa inteiro: de dia, tudo ao ar livre ficava na sombra do sol, e nem árvores, postes, carros ou pessoas tinham sombra.
- O apagão apaga gradualmente lâmpadas e materiais luminosos, preservando sol e lua. A festa reduz a iluminação elétrica normal, acrescenta os focos coloridos com sombras e mantém a hora natural. As transições dos eventos são suavizadas.

O brilho dos materiais `Lampada` acompanha o circuito elétrico, com cópias por grupo de mobiliário para separar o exterior do interior. Nenhum arquivo GLB original foi alterado.

## Céu e névoa

O céu é procedural, com gradiente, disco solar, lua e estrelas. Compartilha o tom do horizonte e a exposição com a névoa e o chão visual externo, evitando emendas. Respeita o teste de profundidade, inclusive a abertura transparente usada pela TV do YouTube.

A névoa linear começa entre **23 e 28 m** e atinge o máximo entre **49 e 58 m**, conforme a hora. Uma segunda máscara atua nos **8 m finais de cada borda** do mapa, independente da distância da câmera. Isso evita revelar o corte do terreno quando o jogador se aproxima dos limites. Um plano visual abaixo da rua completa o horizonte; não acrescenta piso jogável nem altera os limites ou colisores.

O shader de borda é aplicado aos materiais do mapa por instância de aplicação, sem modificar globalmente os shaders. Usa o chunk de névoa da versão instalada e preserva seu cálculo de distância, combinado à máscara em coordenadas do mundo.

## Arquivos e validação

- `apps/web/src/engine/day-night.ts`: relógio, paleta, trajetória e parâmetros de névoa.
- `apps/web/src/engine/environment-lighting.ts`: aplicação de luzes, sombras, céu, brilho e névoa ao cenário.
- `BarScene.ts`: sincronização com o horário do servidor e integração com eventos, câmera e descarte de recursos.
- `tests/integration/day-night.test.ts`: periodicidade, continuidade, direções e máscara das quatro bordas.
- `tests/e2e/environment.spec.ts`: renderização do mapa em horários diferentes, direção real das luzes, sombras, eventos, bordas, transparência da TV e relógio no jogo/lobby.

Em desenvolvimento, `barDebug.environment()` expõe o estado somente para leitura. O teste visual usa um relógio controlado na sua própria página de teste, sem oferecer comandos de alteração do horário a jogadores.

Validação em 22/10/2026: build de produção e TypeScript aprovados; **90 testes** de API, servidor, contratos, assets e ferramentas aprovados. **Três cenários no navegador** passaram: renderização e eventos em vários horários, relógio no jogo/entrada e percurso completo pelo mapa com escadas, balcão e assentos. A abertura de transparência da TV permaneceu com alpha zero ao ligar a tela e voltou a ser opaca ao desligar. Site HTTPS 5173, API 3001 e mundo 2567 responderam HTTP 200 após a implementação.

Imagens geradas no navegador: [dia](../previews/day-night-noon.png), [entardecer](../previews/day-night-dusk.png), [noite](../previews/day-night-midnight.png), [interior](../previews/day-night-interior.png) e [borda encoberta](../previews/day-night-border-fog.png).

Referências oficiais conferidas para PlayCanvas 2.23: [direção, sombras e modos de atualização de LightComponent](https://api.playcanvas.com/engine/classes/LightComponent.html), [cor e distâncias de FogParams](https://api.playcanvas.com/engine/classes/FogParams.html). A implementação foi validada no WebGL2 usado atualmente pelo jogo.
