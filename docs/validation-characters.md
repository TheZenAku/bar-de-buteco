# Validação do criador e da coleção — 22/10/2026

| Verificação | Resultado |
| --- | --- |
| `npm run build` | TypeScript e build de produção aprovados |
| `npm test` — API | 10 testes aprovados |
| `npm test` — servidor | 13 testes aprovados |
| `npm test` — integração e assets | 16 testes aprovados |
| `npm run test:e2e` | 7 cenários aprovados na mesma execução, em Edge, com um worker |
| `npm run test:load` | 32 clientes durante 30 segundos, sem falhas |

Os cenários de navegador cobrem cadastro com criação obrigatória; dois corpos e cores; ajuste real do canvas em tela estreita; descarte de alterações; compra e seleção de Rafael; retorno ao personagem gratuito; alterações vistas por outro cliente; novo login; quatro skins e suas animações; X exclusivo do Rafael; percurso do mapa e escadas; bartender e assentos; chat, bloqueio, denúncia e reconexão; recuperação de senha; blackjack e eventos administrativos.

Os testes de API também verificam saldo inicial zero, ganhos desativados, rejeição de opções e preços forjados, falta de posse/saldo, persistência e compras repetidas ou simultâneas sem cobrança duplicada. Os testes de WebSocket conferem que opções de entrada não concedem skins.

O navegador usa API, jogo e Vite isolados em 3111/2677/5273 e banco em `.local/character-e2e/postgres`. As moedas de teste não são concedidas às contas do bar em 5173. Os serviços de desenvolvimento em 3001/2567 e o CSS das fontes em 5173 responderam HTTP 200 após a integração.

A simulação de carga usou API, PostgreSQL embutido, Colyseus e SDK em loopback, sem renderização 3D: 32 clientes na mesma sala, 8.062 patches, RTT mediano de 3 ms e p95 de 108 ms, com lista de falhas vazia. Relatório completo: [carga de 32 clientes](validation/characters-load-32.json).

O build mantém o aviso de tamanho do bundle principal de aproximadamente 2,35 MB, sem erro de compilação. Os resultados acima são locais; não representam um teste contínuo de duas horas ou uma medição de 32 jogadores com renderização 3D.

Capturas: [criador](previews/character-creator.png) e [personagem na partida](previews/character-in-game.png). Contratos e opções do kit: [personagens e loja](characters.md).
