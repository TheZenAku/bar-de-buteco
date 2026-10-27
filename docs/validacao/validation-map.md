# Validação do mapa BarBoteco — 23 de outubro de 2026

O bairro ampliado de `assets-bar/map/BarBoteco` foi publicado sem alterar os GLBs fornecidos. Os hashes dos arquivos visual e de colisão são registrados no manifesto e comparados byte a byte com os arquivos servidos pelo jogo.

| Verificação | Resultado |
| --- | --- |
| Importação do mapa | 57 nós visuais, 1.550 sólidos, 16 folhas de porta, 134 triângulos de piso e 124 assentos |
| TypeScript e build de produção | Aprovados |
| API | 21 testes aprovados |
| Servidor, regras, NPCs e WebSocket | 18 testes aprovados |
| Contratos, assets, colisões e pisos | 51 testes aprovados |
| Ferramentas de assets | 26 testes aprovados |
| Navegador: iluminação e relógio | 2 cenários aprovados |
| Navegador: percurso do mapa | 1 cenário aprovado em 2,7 min com WebGL por software |

## Cobertura do mapa

- 128 posições de entrada ficam livres de casas, carros, postes, árvores e mobiliário.
- As 16 folhas, agrupadas em 15 portas, usam as dimensões reais exportadas; todas abrem em torno da dobradiça correta e 27 das 30 travessias bidirecionais testadas ficam livres. As três restantes têm aproximação bloqueada por mobiliário, não pela folha aberta.
- As duas escadas são percorridas nos dois sentidos sem atravessar lajes ou trocar de andar por paredes.
- As rotas do navegador alcançam piso superior, blackjack, balcão, uma cadeira e jukebox.
- As 142 cadeiras instanciadas são classificadas em 124 assentos e 18 peças empilhadas; todos os assentos possuem uma posição segura para levantar.
- As rotas de Seu Zé, Tonico e Dona Lurdinha permanecem fora do novo mobiliário.
- Praça, igreja, campinho, escola e ponto de ônibus têm marcadores normalizados no manifesto.

O percurso real de navegador usa somente teclado e interface: entra pela varanda, sobe e desce os dois lances, pede uma bebida, senta e levanta. A espera entre comandos confirma cada entrada no servidor. O mapa maior exigiu pulsos de teclado um pouco mais longos no navegador headless para preservar o heartbeat sob renderização SwiftShader.

## Desempenho e imagem

A colisão estática usa uma grade espacial de 8 m. As cadeiras deixaram de ocupar a grade, reduzindo o mapa de 1.674 para 1.550 sólidos; mesas e pilhas do depósito continuam bloqueando movimento. Portas permanecem dinâmicas e reconstroem o índice quando mudam de estado.

O plano distante da câmera foi alinhado aos 1.100 m definidos pelo asset, e a névoa cobre 62–70 m até 430–520 m. As capturas de meio-dia, entardecer, meia-noite, interior e borda foram renovadas e inspecionadas. A borda real em x −103 fica completamente mascarada pela névoa.

Capturas: [meio-dia](../previews/day-night-noon.png), [entardecer](../previews/day-night-dusk.png), [meia-noite](../previews/day-night-midnight.png), [interior](../previews/day-night-interior.png) e [borda](../previews/day-night-border-fog.png). Detalhes da integração: [mapa](../assets/map.md).
