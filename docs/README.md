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

- [Cavalo do Tião: habilidade, controles e animações](sistemas/cavalo.md)
- [Administração](sistemas/admin.md)
- [Análise de desempenho e HUD](sistemas/desempenho.md)
- [Blackjack: regras de cassino, apostas e o painel da mesa](sistemas/blackjack.md)
- [Câmera: primeira e terceira pessoa, suavização e raio-X](sistemas/camera.md)
- [Truco: regras da Copag, duplas, NPCs e sinais de rosto](sistemas/truco.md)
- [Pebolim: regras oficiais, física, Zé do Totó e partidas valendo moedas](sistemas/pebolim.md)
- [Sinuca: bola 8 pelas regras da Noel Snooker, física e Juca da Sinuca](sistemas/sinuca.md)
- [Celular: ligações, Highzap, Highgram, câmera e HighBank](sistemas/celular.md)
- [Perfil do jogador: janela, emblemas e skills](sistemas/perfil.md)
- [Sons dos golpes: origem, licença e como tocam](assets/sons-golpes.md)
- [Som de galope: origem, licença e reprodução](assets/sons-cavalo.md)
- [Conquistas: emblemas ganhos jogando, em séries de quatro níveis](sistemas/conquistas.md)
- [Som ambiente](sistemas/ambient.md)
- [Tempo e clima: dia e noite, chuva, tempestades e controles de administrador](sistemas/day-night.md)
- [Economia: moedas, balcão, mesa, empregos e mídia](sistemas/economia.md)
- [Configurações gráficas](sistemas/graficos.md)
- [Portas](sistemas/doors.md)
- [Cerveja: garrafa e copo de chopp](sistemas/drinks.md)
- [Interface Midnight Neon](sistemas/interface.md)
- [Inventário](sistemas/inventory.md)
- [Jukebox e TVs](sistemas/jukebox.md)
- [Necessidades do personagem](sistemas/needs.md)
- [Moto de entrega: controles, física e rede](sistemas/moto.md)
- [Hatch 80: quatro lugares, pintura, garagem e estado das peças](sistemas/carro.md)
- [Highfood: entregas, HighMotors, GPS e o balanço das moedas](sistemas/highfood.md)
- [Garagem: veículos guardados, estado salvo, placa, chave e tranca](sistemas/garagem.md)
- [Troca entre jogadores: como negociar e por que não duplica](sistemas/troca.md)
- [Cidade: setores, streaming, LOD, colisão e publicação](sistemas/cidade.md)
- [Músicos do palco](sistemas/palco.md)
- [Skins e coleção](sistemas/skins.md)
- [Chat de voz por proximidade](sistemas/voice.md)

## Assets

- [Animações](assets/animations.md)
- [Mapa BarBoteco](assets/map.md)
- [Animações nos esqueletos nativos](assets/native-rigs.md)
- [Diagnóstico e estabilização de rigs](assets/rig-troubleshooting.md)
- [Skins Mixamo](assets/skins-mixamo.md)
- [Caminhada com bengala](assets/old-cane.md)

## Validação

- [Validação de 21/10/2026](validacao/validation.md)
- [Mapa BarBoteco](validacao/validation-map.md)
- [Abastecimento com frentista NPC](sistemas/abastecimento.md)
