# Validação de 21 de outubro de 2026

## Verificações executadas

| Verificação | Resultado |
| --- | --- |
| TypeScript, incluindo scripts e testes | Aprovado |
| Build Vite de produção | Aprovado |
| Contas, persistência, autorização e recuperação | 8 testes aprovados |
| Blackjack, eventos e integração WebSocket | 8 testes aprovados |
| Colisões, velocidade e integridade de tickets | 2 testes aprovados |
| Navegador, Edge em modo headless | 3 cenários aprovados em 58,8 s |
| Dependências de produção (`npm audit --omit=dev`) | Nenhuma vulnerabilidade reportada na execução |
| Carga de 32 clientes por 30 s | Sem falhas reportadas |

Os cenários de navegador criam e confirmam contas, entram no mesmo bar em contextos independentes, conversam, bloqueiam, denunciam e recuperam acesso. A navegação por teclado chega à mesa, completa uma rodada, confirma a persistência das estatísticas e inicia os três eventos pela interface administrativa. Foram coletados erros JavaScript durante esses fluxos; nenhum foi reportado.

A integração de WebSocket provoca uma queda real de transporte e confirma a retomada da mesma sessão. Também verifica a impossibilidade de ocupar duas vagas com uma conta, recusas por lotação sem criar outro mundo, entrada falsa, rajadas de movimento, limites de velocidade, AOI e ocultação da carta do dealer.

## Simulação de carga

Relatório preservado em [load-32.json](validation/load-32.json). API, PostgreSQL embutido, servidor e 32 clientes SDK rodaram no mesmo processo de teste, em loopback, sem renderização. Entradas e sessões foram criadas em um banco isolado em memória. Cada cliente enviou movimento a 20 Hz e sondas de RTT.

| Métrica | Valor |
| --- | --- |
| Clientes simultâneos no mesmo bar | 32 |
| Duração após entrada dos clientes | 30 segundos |
| Tempo para admitir os 32 clientes | 901 ms |
| Amostras de RTT | 928 |
| RTT mediano / p95 / máximo | 3 / 8 / 11 ms |
| Patches observados | 8.719 |
| Atraso do event loop, p95 | 27,1 ms |
| Memória RSS do processo de teste completo | 422 MiB |

Ambiente reportado: Windows, Intel Core i5-13400F, dois processadores lógicos disponíveis ao ambiente e 8 GiB de RAM. Node 24.19.0. Esses números não representam a memória isolada do servidor nem latência pela internet.

No navegador, a amostra final durante o cenário de eventos registrou **58 FPS com quatro atores**. É uma leitura pontual do teste automatizado, não uma garantia de 60 FPS ou um benchmark com 32 personagens.

## Limites e homologação pendente

- O teste contínuo de **duas horas** está configurável pelo script de carga, mas não foi executado.
- Ainda precisam de medição: 30/60 FPS em máquinas de referência, carga com 32 navegadores renderizando, RTT com latência/perda externa e entrada em conexão de referência.
- **Docker não está instalado neste host.** Compose/nginx e o driver de PostgreSQL nativo foram preparados e revisados, mas não executados como implantação de produção.
- A confirmação e recuperação foram verificadas com a caixa local. **SMTP externo, TLS e domínio público** exigem homologação na hospedagem escolhida.
- O build gera um aviso sobre o tamanho do pacote principal: aproximadamente **2,28 MB minificado / 596 KB gzip**, incluindo a engine. Não há erro de build; tempo de download depende da conexão.
- A CI foi adicionada ao repositório, mas não foi executada no GitHub porque nenhum remoto foi configurado.
- Estatísticas aguardando retry permanecem em memória no jogo; uma queda antes da gravação pode perdê-las. Comandos administrativos também têm uma janela entre consumo e aplicação. Veja [arquitetura](architecture.md).

As evidências visuais em [previews](previews) foram capturadas do aplicativo em execução. A meta de 64+ jogadores permanece expansão, sem capacidade comprovada.
