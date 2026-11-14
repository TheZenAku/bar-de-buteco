Você é o Claude da VM do Bar de Buteco (repositório bar-de-buteco). Converse com o Rafael em português. Este prompt substitui o anterior (o que falava de entrega_servidor_v6.7): **não existe pacote para copiar, o export já está no lugar.**

ONDE ESTÁ TUDO
- `assets-bar/map/BarBoteco/export/` já tem o mapa v6.7 inteiro reexportado: `cidade/` (64 setores), `empresa_brasil/` (estoque, tanques, 48 marcadores, `empresa_brasil_portoes.glb` e `.json` NOVOS), `farm_armas/` (dinâmicos e portas). O bar não mudou. Leia `LEIA-ME_v6.7.md` nessa pasta.
- Você já copiou o pacote anterior e já publicou S07_00, S07_04, a fábrica e a farm por volta das 13:25. Continue de onde parou, sem refazer o backup.
- Às 14:20 a `cidade/` foi trocada pela reexportação COMPLETA do mapa: todos os 64 setores, com o 82 aplicado em todos. A cidade anterior está em `anterior_2026-11-12/cidade/`. empresa_brasil/ e farm_armas/ não mudaram (idênticos ao que você já tem). Rode o import-city de novo para publicar a cidade inteira, junto com o resto da publicação.

OBJETIVO
1. Remover TODA a lógica do portão antigo da EMPRESA BRASIL e substituir pelo portão novo.
2. Ligar a porta automática da sala de controle.
3. Adaptar o código ao resto do export v6.7.
4. Validar e publicar só com o OK do Rafael.

REGRAS
- Não faça commit nem push sem pedido explícito.
- Antes de editar, faça o backup datado que você mesmo propôs (apps, packages, tools, tests, docs) e diga onde ficou. assets-bar já tem backup em anterior_2026-11-12.
- Os .ts são CRLF: preserve \r\n.
- npm não roda nesta máquina: chame tsc e os .mjs com node direto.
- Rodar os importadores reescreve public/ e city-data/map-data e derruba quem está online. Rode-os só depois do OK do Rafael e sem jogadores conectados.

DECISÕES JÁ TOMADAS (respostas ao seu reconhecimento; não pergunte de novo)
- O Rafael pediu para substituir toda a lógica do portão pelo novo. Então: sai o interfone (ring, doorbell, lâmpada, spot e notificação), sai o controle abrir/fechar pelo operador (factory.gate, gateCard) e sai a regra de fechar sem operador em expediente. O portão novo abre e fecha só por proximidade (jogador ou veículo), controlado pelo servidor. factoryGate() (expediente e EPI) fica.
- apps/server/test/factory-gate.test.ts: pode apagar. Crie no lugar um teste do portão novo que cubra: abre por proximidade (jogador e caminhão), não fecha com alguém sob a folha e bloqueia a passagem quando fechado. Faça o mesmo para a porta automática.
- floor-doca em packages/shared/src/factory/company.ts:140: troque para spot(351.5,.2,-52.6) com comentário apontando para Ponto_EB_Doca. Crie também um teste que compare esse valor com o marcador em apps/server/data/factory/empresa_brasil_marcadores.json depois do import, para pegar divergência futura.
- docs/sistemas/fabrica.md:76: reescreva a parte do portão e do interfone com o comportamento novo.

O QUE REMOVER (do seu reconhecimento)
- packages/shared/src/factory/index.ts: FACTORY_GATE (linhas ~100-106, com intercom, ringCooldownS, ringTtlS, keepClear). Troque por uma definição nova derivada do empresa_brasil_portoes.json (item a seguir), ou carregue o JSON.
- packages/shared/src/world.ts: linhas 6, 55-56 e 88 (gateBox e o portão antigo em doorBoxes). A colisão nova passa por aqui.
- apps/server/src/BarRoom.ts: import (62), ringAt em Presence (185-186), estado (534), setInterval(gateTick) (572), handlers factory.ring e factory.gate (1192-1199), gateWanted e gateRing (3633-3635), gateTick, gateRingBy e gateControl (3637-3681), gate na view (~3845) e na assinatura (~3854), logs factory_gate e factory_gate_ring.
- apps/web/src/factory/visuals.ts: import, GATE_SLIDE_S, gateSeen, gate, bellLamp, ringing, lampAt, buildGate, buildIntercom, placeGate, slideGate, a lâmpada do interfone e o gateOpen de tick.
- apps/web/src/factory/controller.ts: ring e doorbell (78), notificação Interfone (90), gateOpen em frame (129-137), spot do interfone (224, 241), case 'gate' (298), view.gate?.ringing (355), gateCard (421, 454-462).
- apps/web/src/factory/types.ts:23-24, spots.ts:2 e 27-29, sounds.ts:86-87 (doorbell), main.ts:105 e 1582 (world.doors[FACTORY_GATE.id]).
- apps/server/test/doors.integration.test.ts:26-28: passa a esperar os ids novos.
Mantenha: Ponto_EB_Portao (REQUIRED_FIXED e city.test.ts), factoryGate(), todos os usos de Ponto_EB_Doca e RIBEIRO_DOCK.

PORTÃO NOVO E PORTA AUTOMÁTICA (dados em empresa_brasil/empresa_brasil_portoes.json)
- EB_Portao: tipo correr; origem_jogo_xyz [362.42, 0.17, -48.6]; curso 9,0 m no eixo [0,0,-1]; exportado FECHADO; raio 11 m; 7 s; antecipação 4,3 m.
- EB_Porta_Auto_Folha: tipo correr; origem e curso_m conforme o JSON; eixo [1,0,0]; raio 3,2 m; 0,9 s; antecipação 0,6 m.
- Colisão: colisoes_dinamicas (COL_Cid_Din_EB_Portao, COL_Cid_Din_EB_Porta_Auto) com min_jogo e max_jogo. O mapa estático não tem colisão nesses vãos.
- Marcadores novos: marcadores_novos dentro do JSON dos portões (Ponto_EB_Portao_Sistema e Ponto_EB_Oficina). O empresa_brasil_marcadores.json continua com 48 por causa do validateFactoryAssets.
Requisitos:
a) O servidor decide abrir e fechar pela proximidade de jogadores e veículos e publica o estado nas portas sincronizadas. Um tick no lugar do gateTick serve.
b) Fechada, a caixa bloqueia, pelo mesmo caminho do doorBoxes em world.ts e de isDoorOpen. Aberta, libera. Não fecha com alguém dentro da caixa da folha mais uma folga (o papel do keepClear antigo).
c) Cliente: arquivo novo no padrão de apps/web/src/engine/farm-gates.ts. Carrega fabrica/empresa_brasil_portoes.glb, acha os nós EB_Portao e EB_Porta_Auto_Folha e desliza a origem pelo eixo × curso × estado (anima com suavização, a partir do estado do servidor, não da proximidade local). Instancie onde o FarmGates é criado (city-streaming.ts). Aplique dressMetal como no farm-gates.
d) O caminhão a caminho da doca (Ponto_EB_Doca, agora x 351,5) abre o portão ao se aproximar.
e) tools/assets/import-factory.mjs: inclua empresa_brasil_portoes.glb e .json nos arquivos copiados para apps/web/public/fabrica e apps/server/data/factory, com checagem (GLB válido, 2 nós com os nomes acima, sem escala, 2 caixas de colisão). Mantenha a regra dos 48 marcadores e das 25 vagas.

RESTO DO EXPORT v6.7 (conferir, sem lógica nova)
- Estoque e tanques: os sacos novos mantêm nomes (EB_Saco_Malte/Mix/Produto), arranjo de 18 por palete e palete de 0,144 m. Confira o bags.ts contra o GLB novo. Tanques: mesmos nós (Agitador, Liquido, Tampa).
- Farm: rode as checagens do import-farm.mjs contra farm_armas/ (15 nós, 4 colisões). FA_Porta_Expedicao_D mudou de origem; confira o TUNING do farm-gates.ts.
- Fábrica no mapa (estático, no setor S07_04): oficina mecânica nova no canto sudoeste (entrada pela parede norte, x 336,4-337,5; porta de enrolar leste fechada, com colisão), portas de alto impacto no preparo e no ensaque (vão livre, sem colisão), quadros, empilhadeira e paleteira refeitos. Se algum spot ou alcance do código depender de posição de peça que mudou (empilhadeira e paleteira continuam nos mesmos marcadores), ajuste.
- Cidade: depois da validação, atualize tests/integration/city.test.ts com os números que o prepareCity der.

VALIDAÇÃO (antes de pedir o OK)
- tsc --noEmit em shared, server e web.
- Testes do servidor: doors, factory-dock, factory-freight, factory, factory-uniform e os testes novos do portão e da porta.
- prepareCity sobre assets-bar/map/BarBoteco/export sem publicar. Mostre counts.
- Não afirme que viu o visual da fábrica no fixture (ele não carrega). Diga o que o Rafael deve conferir no jogo.

PUBLICAÇÃO (só com OK do Rafael, sem jogadores online)
- import-city (ou assets:map), import-factory e import-farm. Mostre as saídas.

RELATÓRIO
- Arquivos alterados com caminho:linha, símbolos removidos, saídas do tsc e dos testes (erros completos), counts do prepareCity e o que ficou sem verificar.
