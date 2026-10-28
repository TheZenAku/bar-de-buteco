# Documentação do B.A.R.

Comece pelo [README da raiz](../README.md), que explica como abrir, jogar e testar. Esta pasta organiza o restante por assunto.

| Pasta | Conteúdo |
| --- | --- |
| [`projeto/`](projeto/) | Regras do jogo e especificação do MVP |
| [`arquitetura/`](arquitetura/) | Como cliente, API e mundo se dividem e se comunicam |
| [`sistemas/`](sistemas/) | Um documento por funcionalidade do jogo |
| [`assets/`](assets/) | Pipeline de mapa, animações, esqueletos e skins |
| [`validacao/`](validacao/) | Resultados de validação e relatórios de carga |
| [`execucao/`](execucao/) | Estado atual, plano, decisões (ADRs), problemas e testes do trabalho em andamento |
| [`auditoria/`](auditoria/) | Auditoria técnica de 24/10/2026 que originou o plano |
| [`previews/`](previews/) | Capturas usadas pelos documentos; os E2E as regeneram com `UPDATE_PREVIEWS=1` |

## Projeto

- [Regras desta versão](projeto/game-design.md)
- [Especificação técnica do MVP](projeto/mvp-specification.md)
- [Funcionalidades: situação e plano](projeto/funcionalidades.md)
- [Assets recomendados](projeto/assets-recomendados.md)

## Arquitetura

- [Arquitetura](arquitetura/architecture.md)
- [Movimento, interesse espacial e recuperação](arquitetura/networking.md)
- [Contratos do MVP](arquitetura/implementation-contract.md)

## Sistemas do jogo

- [Administração](sistemas/admin.md)
- [Som ambiente](sistemas/ambient.md)
- [Ciclo de dia e noite](sistemas/day-night.md)
- [Economia: moedas, balcão, mesa, empregos e mídia](sistemas/economia.md)
- [Configurações gráficas](sistemas/graficos.md)
- [Portas](sistemas/doors.md)
- [Cerveja: garrafa e copo de chopp](sistemas/drinks.md)
- [Interface Boteco Social](sistemas/interface.md)
- [Inventário](sistemas/inventory.md)
- [Jukebox e TVs](sistemas/jukebox.md)
- [Necessidades do personagem](sistemas/needs.md)
- [Músicos do palco](sistemas/palco.md)
- [Skins e coleção](sistemas/skins.md)
- [Chat de voz por proximidade](sistemas/voice.md)

## Assets

- [Animações](assets/animations.md)
- [Mapa BarBoteco](assets/map.md)
- [Animações nos esqueletos nativos](assets/native-rigs.md)
- [Skins Mixamo](assets/skins-mixamo.md)
- [Caminhada com bengala](assets/old-cane.md)

## Validação

- [Validação de 21/10/2026](validacao/validation.md)
- [Mapa BarBoteco](validacao/validation-map.md)
