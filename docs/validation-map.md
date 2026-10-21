# Validação do mapa BarBoteco — 21 de outubro de 2026

O cenário procedural foi substituído pelo export visual otimizado de `assets-bar/map/BarBoteco`, mantendo o conteúdo e as texturas do arquivo original. Os hashes dos GLBs visual e de colisão são verificados pelos testes.

| Verificação | Resultado |
| --- | --- |
| TypeScript e build de produção | Aprovados |
| API | 9 testes aprovados |
| Servidor, regras, NPCs e WebSocket | 10 testes aprovados |
| Contratos, assets, colisões e pisos | 8 testes aprovados |
| Navegador Edge headless, banco/portas isolados | 5 cenários aprovados em 5 minutos |
| Carga local | 32 clientes por 30 segundos, sem falhas reportadas |

O novo cenário de navegador usa apenas teclado e UI para entrar pela varanda, subir os dois lances da escada, chegar ao piso superior, descer, pedir uma bebida e sentar/levantar. Os outros cenários verificam as três skins e o chute exclusivo, chat, bloqueio/denúncia, reconexão, recuperação de senha, blackjack, estatísticas e eventos administrativos. Não foram coletados erros JavaScript nesses fluxos.

Os testes também verificam 128 pontos de nascimento válidos, saídas das 44 cadeiras, barreiras do mapa, apoio nas rampas, retorno pela escada, bloqueio da câmera pelas lajes e sincronização de altura entre clientes reais. A simulação das rotas dos NPCs cobre dois minutos de tempo de jogo sem colocá-los dentro de móveis ou deixá-los presos contra eles.

O relatório de carga está em [map-load-32.json](validation/map-load-32.json). Os 32 clientes entraram no mesmo mundo em 1.088 ms. O RTT local mediano/p95 foi 3/19 ms, o atraso p95 do event loop foi 30,46 ms e o RSS do processo completo de teste foi 403 MiB. O cenário reúne API, banco em memória, servidor e clientes SDK no mesmo processo; não mede internet nem 32 navegadores renderizando.

Uma amostra do navegador ao fim do cenário de blackjack/eventos registrou 57 FPS com cinco atores visíveis. Isso não constitui garantia de FPS em outros equipamentos ou com 32 personagens renderizados. Os limites de homologação de produção, SMTP externo e teste contínuo de duas horas continuam descritos na [validação geral](validation.md).

Capturas: [exterior](previews/map-exterior.png) e [piso superior](previews/map-upper-floor.png). Detalhes da integração: [mapa](map.md).
