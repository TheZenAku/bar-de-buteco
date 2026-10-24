# Auditoria técnica do B.A.R. — resumo executivo

Data-base: 24/10/2026. Revisão local do commit `54a4c6650ea06d6cbd2a82d0beaab8f3124581e8` (`main`).

## Veredito

**RECOMENDAÇÃO — confiança alta:** evoluir o projeto atual com uma refatoração arquitetural incremental, mantendo PlayCanvas, TypeScript, Colyseus, Fastify e PostgreSQL. Não há evidência que justifique reconstrução ou troca de engine. O produto já possui um vertical slice real: conta, personagem, mapa, movimento autoritativo, proximidade, voz, mídia, necessidades, inventário, blackjack, NPCs, eventos e administração.

O código não está pronto para publicação. O gate técnico da auditoria está vermelho:

- **TESTADO:** `npm test` executou 91 casos: 90 passaram e 1 falhou porque a fonte `assets-bar/Universal Base Characters[Standard]` não existe. A falha interrompeu os testes de ferramentas.
- **TESTADO:** `npm run build` falhou com 11 erros TS2339 em testes do laboratório Avatar V2. Como esse avatar foi rejeitado artisticamente, a correção recomendada é retirar o laboratório do produto e do gate padrão, não investir em sua integração.
- **CONFIRMADO:** `npm audit --omit=dev` encontrou 2 vulnerabilidades altas: Zod `<4.6.6` (direta) e `body-parser` 2.0–2.3 (transitiva). É preciso atualizar e retestar, não apenas executar `npm audit fix`.
- **CONFIRMADO:** o cliente publica 105 MiB; o mapa sozinho tem 16,37 MiB e o sistema de avatar definitivo ainda não foi escolhido.
- **DECISÃO DO PRODUTO:** Avatar V2 e Quaternius estão rejeitados por qualidade visual e não devem ser reutilizados no avatar final. Suas licenças pendentes reforçam a decisão de remoção.
- **NÃO VERIFICADO:** Docker/Compose, SMTP real, backup/restore, métricas de dispositivo móvel, latência WAN e carga contínua de 2 horas.

## O que preservar

- Contratos compartilhados e movimento/colisão determinísticos.
- Autoridade do servidor sobre posição, interações, economia, inventário, blackjack e moderação.
- API transacional e idempotência de compras/resultados/reversões administrativas.
- Pipeline do mapa e suas 503 colisões, superfícies, assentos e marcadores.
- Testes de integração com WebSocket real e testes E2E.
- Skins premium com rigs nativos, enquanto forem mantidas como conteúdo separado da futura base de avatar.
- UI DOM/CSS sobre o canvas, adequada à densidade de interfaces do jogo.

## O que corrigir primeiro

1. Restaurar build e testes verdes; tornar fixtures de assets autocontidas.
2. Fechar alertas de dependência e homologar produção com PostgreSQL nativo.
3. Modularizar `BarScene.ts` (1.132 linhas), `BarRoom.ts` (673) e `main.ts` (522).
4. Selecionar por prova visual um novo pacote gratuito de personagens, sem reaproveitar Avatar V2 ou Quaternius.
5. Definir orçamento de performance, compressão, carregamento por demanda e LOD para o pacote escolhido.
6. Resolver procedência/licenças de animações e assets antes de distribuição.
7. Entregar um loop de jogo pequeno: pedir, trabalhar, receber moedas e gastar, sem dinheiro real.

## Estratégias comparadas

| Estratégia | Custo | Risco de regressão | Benefício | Decisão |
| --- | ---: | ---: | --- | --- |
| A. Evolução sem refatoração | baixo agora, alto depois | médio | entrega rápida, dívida cresce | rejeitada como estratégia principal |
| B. Refatoração mantendo engine | médio | controlável por testes | preserva investimento e corrige limites | **escolhida** |
| C. Migração de engine | muito alto | muito alto | benefício ainda hipotético | somente POC se métricas futuras reprovarem PlayCanvas |

## Resultado de produto

O B.A.R. deve concentrar o MVP no ciclo: **entrar → encontrar atividade → cooperar ou causar uma situação engraçada → ganhar moedas → personalizar → voltar**. Celular completo, poker, moto e múltiplos mapas ficam depois de estabilidade, economia e primeira atividade de trabalho completas.

## Índice

- [Estado atual](01-ESTADO-ATUAL.md)
- [Problemas e riscos](02-PROBLEMAS-E-RISCOS.md)
- [Comparativo de engines](03-COMPARATIVO-ENGINES.md)
- [Arquitetura recomendada](04-ARQUITETURA-RECOMENDADA.md)
- [Pipeline de assets](05-PIPELINE-ASSETS.md)
- [Multiplayer e backend](06-MULTIPLAYER-BACKEND.md)
- [Gameplay e economia](07-GAMEPLAY-E-ECONOMIA.md)
- [UI, UX e renderização](08-UI-UX-E-RENDERIZACAO.md)
- [Assets e ferramentas](09-ASSETS-E-FERRAMENTAS.md)
- [Roadmap](10-ROADMAP.md)
- [Critérios de aceite](11-CRITERIOS-DE-ACEITE.md)
- [Decisões pendentes](12-DECISOES-PENDENTES.md)
- [Prompt mestre para implementação](PROMPT-MESTRE-CLAUDE.md)

