# Tempo, clima e ciclo de dia e noite

Um dia completo do jogo dura **40 minutos reais**. Amanhecer, dia, entardecer, noite e madrugada transitam continuamente; não existe troca instantânea de presets. O ciclo usa uma época fixa e o relógio já transmitido pelo servidor, então entrar, reconectar ou reiniciar o mundo não reinicia o horário. No lobby, o ciclo continua.

Os parâmetros padrão estão em `packages/shared/src/environment.ts`: `DAY_NIGHT.durationMs`, `epochMs` e `offsetHours`. O horário é acelerado e não corresponde à hora civil nem a uma simulação astronômica da cidade. O servidor transmite `WorldState.environment`, com a referência do relógio e o clima; o cenário e o relógio do celular usam essa mesma referência.

O cliente mantém **um único relógio do servidor** (`apps/web/src/server-clock.ts`), usado pelo cenário, celular, clima e efeitos compartilhados. Depois da primeira amostra, ele avança com `performance.now()`: mudar a hora ou a data do computador não altera o mundo. Os pacotes da sala atualizam a referência e o ping/pong corrige o atraso de transporte a cada 3 segundos. Entrar depois, recarregar e reconectar recupera o estado atual da sala.

Na entrada, `GET /game/environment` fornece o mesmo relógio e os parâmetros do ambiente, sem cache, consultados a cada 30 segundos e ao voltar à aba. Sair da sala preserva a referência até a próxima consulta, em vez de restaurar um ciclo local. O ciclo continua durando **40 minutos**, salvo alteração administrativa.

A **data civil** exibida no celular e no calendário vem do relógio do servidor no fuso **America/Sao_Paulo**, igual para todos, e não avança a cada meia-noite do ciclo acelerado. A grade do calendário usa datas sem fuso para evitar que jogadores em outros países vejam outro dia; atualiza a marca de hoje à meia-noite da cidade. Os relógios mundiais também usam o instante do servidor.

## Controles de administrador

Em **Administração → Tempo e clima**, é possível definir o horário, usar os atalhos de amanhecer/meio-dia/entardecer/meia-noite, pausar e retomar o relógio e escolher a duração de um dia entre **5 e 240 minutos reais**. Pausar congela apenas a hora do jogo: entregas, partidas, empregos, ingressos e clima seguem o relógio real do servidor. Mudar a velocidade ou retomar preserva a hora atual.

O clima pode ser **Automático**, **Céu limpo**, **Nublado**, **Chuva** ou **Tempestade**. Um clima fixo permanece até outra alteração. No automático (padrão), o servidor consulta as condições atuais de **Santa Bárbara d’Oeste** (−22,7539, −47,4136) na Open-Meteo ao abrir a sala e a cada **5 minutos**, transmitindo a mesma leitura para todos. A passagem entre condições leva **12 segundos**, inclusive quando um administrador interrompe uma transição. Alterar a hora do jogo não altera o clima. Restaurar o padrão preserva a leitura meteorológica mais recente.

A precipitação acumulada é convertida para **mm/h** usando o intervalo informado pela API. A densidade cresce continuamente da garoa (mínimo visual de 8%) até chuva de 20 mm/h (100% do limite de gotas). Precipitação zero interrompe a chuva; somente códigos meteorológicos de tempestade (95–99), acompanhados de precipitação, ativam relâmpagos. Nuvens e vento também acompanham a leitura. A fonte usa modelos meteorológicos e, nesta região, dados horários interpolados: consultar a cada 5 minutos não garante detecção instantânea de chuva na rua. [Documentação da Open-Meteo](https://open-meteo.com/en/docs).

Falhas da API mantêm a última leitura válida por até **30 minutos contados do horário meteorológico**, depois suavizam para tempo seco, sem inventar chuva. Cada consulta tem limite de 8 segundos e não se sobrepõe à anterior. `WEATHER_API_URL` permite um endpoint compatível; `off` desliga as consultas. Testes usam fontes locais e não acessam a API externa. Climas fixos do administrador prevalecem sobre as atualizações meteorológicas até retornar ao automático.

O comando `admin.environment` valida tipos e limites, exige o papel de administrador e registra `admin_environment` no log. As configurações são replicadas a todos os jogadores, incluindo reconexões e novas entradas. Valem por sala até o servidor reiniciar. **Restaurar tempo e clima** retoma o relógio global, o dia de 40 minutos e o clima automático.

## Chuva e tempestades

Nuvens procedurais se movem com o vento e reduzem a luz do sol, da lua e das estrelas. Chuva fecha a névoa e tempestades intensificam vento, precipitação e escurecimento. Relâmpagos amplos e breves seguem o relógio compartilhado; o trovão vem depois, sem reproduzir trovões antigos ao entrar na sala.

A chuva é uma malha com uma chamada de desenho e movimento na GPU, em torno da câmera. A quantidade máxima varia de 650 a 2.400 gotas conforme a qualidade de sombras. Os pisos, sólidos, telhados e os tetos da varanda limitam a altura das gotas; elas não atravessam os interiores. O som procedural fica abafado sob cobertura, respeita o volume geral e silencia ao sair ou esconder a aba. Chuva e trovões usam ganho 40% menor para permitir ouvir os demais sons. Não há download de gravações para esses efeitos.

## Luz natural e luminárias

- O sol nasce do lado **+X**, cruza o arco do lado **+Z**, de frente para a fachada principal, e se põe do lado **−X**. A lua percorre o arco oposto. Fontes abaixo do horizonte não emitem luz. As direções são aplicadas ao eixo **−Y** das luzes do PlayCanvas.
- Sol e lua têm sombras direcionais com duas cascatas, mapa de 2048 e alcance de 55 m. A luz natural mantém a leitura dos exteriores sem substituir as luminárias internas.
- As 13 luminárias originais mantêm suas posições, cores e potências relativas. Tornam-se focos voltados para baixo, com sombras, para bloquear a iluminação em paredes e lajes. Os interiores mantêm iluminação durante o dia; varanda, quintal, palco e terraço acendem gradualmente ao anoitecer.
- Os **12 postes com luminária** ganham focos na posição real da lâmpada, conforme os braços e rotações de `assets-bar/map/BarBoteco/scripts/05_props.py` e `07_exterior.py`. O catálogo `streetFixtures` em `environment-lighting.ts` deve acompanhar alterações futuras na geometria dos postes, que é fundida no GLB.
- As sombras das luminárias ficam guardadas (cache): são desenhadas quando o mapa carrega, quando uma lâmpada acende, quando a qualidade muda e quando a decoração do bar termina de ser montada. Esses mapas guardam só o que não se mexe. Pessoas, o que elas seguram e carregam, e o que está servido nas mesas ficam de fora (`EnvironmentLighting.redrawLampShadows`). Antes, um mapa desenhado com alguém embaixo da lâmpada guardava a sombra dessa pessoa depois que ela saía. No quadro em que os mapas das lâmpadas são redesenhados, o sol e a lua mantêm o mapa do quadro anterior, então a sombra das pessoas ao sol não pisca. Uma lâmpada pendente é desenhada na hora, mesmo fora da vista.
- Embaixo de cada personagem há uma **sombra de contato** (um disco escuro e suave no chão, shader próprio em `BarScene.contactShadow`). Ela é forte sob um teto (salão, varanda, andar de cima) e à noite. Ao sol, a sombra real do personagem faz esse papel, e o disco fica só como um toque.
- **O que nunca projeta sombra** (`NO_SHADOW_MATERIALS` em `environment-lighting.ts`): as sombras de contato pintadas sob os móveis (`Sombra_Contato`), lâmpadas e letreiros, e materiais transparentes (vidro). O anel e o fundo distante da cidade também não projetam (`city-streaming.ts`).
- As nove luzes `luz_noturna` da cidade e os postes dos setores seguem a noite ([cidade](cidade.md#noite)).
- O apagão apaga gradualmente lâmpadas e materiais luminosos, preservando sol e lua. A festa reduz a iluminação elétrica normal, acrescenta os focos coloridos com sombras e mantém a hora natural. As transições dos eventos são suavizadas.

O brilho dos materiais `Lampada` acompanha o circuito elétrico, com cópias por grupo de mobiliário para separar o exterior do interior. Nenhum arquivo GLB original foi alterado.

## Céu e névoa

O céu é procedural, com gradiente, disco solar, lua e estrelas. Compartilha o tom do horizonte e a exposição com a névoa, evitando emendas. Respeita o teste de profundidade, inclusive a abertura transparente usada pela TV do YouTube. A esfera fica logo antes do plano distante (1.700 m): é desenhada depois dos opacos e cobriria tudo que estivesse além dela. Abaixo de 26° de elevação quem aparece é o panorama da cidade, tingido pela hora; sol e lua baixos ficam atrás dele.

A névoa linear vem dos extras da cena da cidade: de **90 a 650 m** de dia, fechando até **80 a 540 m** à noite (`cityFog`), multiplicada pela opção de névoa. O fim do mapa não precisa de máscara: em volta dele estão o anel e o fundo distante. Um plano visual abaixo do chão, sem colisão, cobre o horizonte até o fundo distante carregar.

## Arquivos e validação

- `packages/shared/src/environment.ts`: relógio, comandos, clima automático, transições e relâmpagos determinísticos.
- `apps/server/src/world/city-weather.ts`: consulta meteorológica, validação, conversão de mm/h e controle de requisições.
- `apps/web/src/server-clock.ts` e `networking.ts`: relógio monotônico único, sincronização por estado, ping/pong e entrada.
- `apps/server/src/http.ts`: amostra pública do relógio e ambiente para a entrada.
- `apps/web/src/admin/environment.ts`: controles em Tempo e clima.
- `apps/web/src/engine/day-night.ts`: paleta e trajetória solar/lunar.
- `apps/web/src/engine/weather-effects.ts` e `weather-sound.ts`: precipitação e áudio procedural.
- `apps/web/src/engine/environment-lighting.ts`: aplicação de luzes, sombras, céu, brilho e névoa ao cenário.
- `BarScene.ts`: sincronização com o horário do servidor e integração com eventos, câmera e descarte de recursos.
- `tests/integration/day-night.test.ts`: periodicidade, continuidade, direções e névoa.
- `tests/integration/environment.test.ts`: relógio controlado, transições, comandos, relâmpagos e coberturas.
- `apps/server/test/environment.integration.test.ts`: permissões e replicação para observadores e novas entradas.
- `apps/server/test/city-weather.test.ts`: intensidade, unidades, validade, falhas e descarte das consultas.
- `tests/integration/server-clock.test.ts`: computadores com relógios divergentes, suspensão, compensação de atraso e viradas da data civil.
- `tests/e2e/environment-sync.spec.ts`: dois jogadores em fusos e datas locais diferentes, mudanças dia/noite e tempestade, calendário, nova entrada e retorno ao lobby.
- `tests/e2e/weather.spec.ts` e cenário de tempo e clima em `admin.spec.ts`: renderização e controles no navegador.
- `tests/e2e/environment.spec.ts`: renderização do mapa em horários diferentes, direção real das luzes, sombras, eventos, transparência da TV e relógio no jogo/lobby.

Em desenvolvimento, `barDebug.environment()` expõe o estado somente para leitura. O teste visual usa um relógio controlado na sua própria página de teste, sem oferecer comandos de alteração do horário a jogadores.

Validação em 22/10/2026: build de produção e TypeScript aprovados; **90 testes** de API, servidor, contratos, assets e ferramentas aprovados. **Três cenários no navegador** passaram: renderização e eventos em vários horários, relógio no jogo/entrada e percurso completo pelo mapa com escadas, balcão e assentos. A abertura de transparência da TV permaneceu com alpha zero ao ligar a tela e voltou a ser opaca ao desligar. Site HTTPS 5173, API 3001 e mundo 2567 responderam HTTP 200 após a implementação.

Imagens geradas no navegador: [dia](../previews/day-night-noon.png), [entardecer](../previews/day-night-dusk.png), [noite](../previews/day-night-midnight.png), e [interior](../previews/day-night-interior.png).

Referências oficiais conferidas para PlayCanvas 2.23: [direção, sombras e modos de atualização de LightComponent](https://api.playcanvas.com/engine/classes/LightComponent.html), [cor e distâncias de FogParams](https://api.playcanvas.com/engine/classes/FogParams.html). A implementação foi validada no WebGL2 usado atualmente pelo jogo.
