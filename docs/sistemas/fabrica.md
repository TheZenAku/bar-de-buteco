# Fábrica EMPRESA BRASIL

A fábrica de Spray Dry está integrada ao setor industrial S07_04 da cidade. O servidor é a autoridade sobre estoque, tanques, secador, ensaque, alarmes, emergência, turnos, pedidos e logística. O cliente apenas solicita ações e representa o snapshot confirmado.

## Assets e marcadores

`npm run assets:fabrica` valida e publica cinco artefatos em `apps/web/public/fabrica/` e `apps/server/data/factory/`. A validação exige exatamente 48 marcadores e 25 vagas: 12 de MALTE, 6 de MIX e 7 de PRODUTO, com capacidade de 18 sacos por vaga. `empresa_brasil_marcadores.json` é a única fonte de coordenadas.

Como o GLB-base do bar está ausente neste checkout, `npm run assets:map` não pode reconstruir tudo. `npm run assets:city` publica somente a cidade sem sobrescrever o GLB-base já servido; a publicação validada possui 64 setores, 7.612 colisores, 60 texturas e 87 marcadores.

## Processo autoritativo

O `FactoryDirector` executa no máximo a 4 Hz e usa `dt` real. O ciclo cobre água, aquecimento, tampa, agitador, dosagem de MALTE/MIX, dissolução, homogeneização, amostra, aprovação/reprovação, pré-aquecimento, alimentação, secagem, resfriamento, saco vazio, enchimento, costura e paletização. Falhas, limpeza, descarte, reconhecimento de alarmes e parada de emergência têm estados explícitos.

| Parâmetro padrão | Valor |
|---|---:|
| Água / temperatura | 1.200 L / 65 °C |
| Receita | 8 MALTE + 4 MIX |
| Dissolver / homogeneizar | 90 s / 60 s |
| Pré-aquecer / resfriar | 180 s / 60 s |
| Vazão | 1.100 L/h |
| Saco / tolerância | 25 kg / ±0,2 kg |
| Palete | 18 sacos |

Estado e 25 vagas são persistidos atomicamente a cada 5 segundos. Na restauração, processos ativos voltam pausados sem perder massa. Ledger e `requestId` impedem repetir pagamento, aceite ou transição de pedido após retry/restart.

## SCADA, visual e logística

O painel abre somente na entrada, painel ou pontos de tanque e consulta `factory.view` a 2 Hz enquanto está visível. Há abas de visão geral, tanques, secador, ensaque, alarmes, estoque/pedidos, lotes, emprego e ajuda. O tutorial inicial pode ser reaberto.

Cada vaga usa no máximo uma entidade renderizável; a quantidade altera a altura, nunca cria um objeto por saco. A representação tem LOD por distância e desliga luz/sombras adicionais na qualidade baixa. Assim, o custo dinâmico industrial fica limitado a 25 entidades de vaga e uma luz de alarme.

Pedidos de compra e venda exigem aceite, caminhão real, motorista com chave, veículo parado e proximidade da doca/ponto externo. A carga fica no baú persistente do caminhão. Reserva, carga, entrega, cancelamento, expiração e pagamento são transacionais e idempotentes.

## Administração

A categoria **Fábrica** implementa os grupos A–M: estado/JSON, estoque e vagas, tanques, secador/ensaque/falhas, pedidos, balanceamento/tempo, emprego, marcadores/teleporte, equipamentos/EPI/emergência, lotes, alarmes/log, simulação/reset e documentação de comandos. Operações destrutivas exigem motivo, `requestId`, permissão de administrador e confirmação para reset.

Comandos: `/fabrica estado`, `/fabrica estoque`, `/fabrica falha`, `/fabrica tempo <n>` e `/fabrica reset`; emprego usa `/emprego <jogador> admitir|demitir|cooldown 0|expediente on|expediente off`.

## Verificação

- `npm run assets:fabrica`: 48 marcadores e 25 vagas.
- Integração cidade/fábrica: 24 testes aprovados.
- Diretor industrial: 9 testes aprovados, incluindo ciclo, falhas, concorrência, restart e carga.
- API de fábrica/emprego/veículos: 5 testes aprovados no recorte final.
- Playwright `factory`: fluxo real completo aprovado e quatro capturas em `docs/fabrica/capturas/`.
- Benchmark reproduzível: `npm run test:factory-load`.
