# Emprego persistente da EMPRESA BRASIL

O cargo `spray-dry-operator` é persistente e possui 12 vagas de contrato e 6 vagas simultâneas de expediente. A API autenticada permite consultar, candidatar-se e pedir demissão. Admissão e demissão usam `requestId`, e o banco mantém vínculo, turnos e eventos nas tabelas da migração `029_employment.sql`.

O operador entra e sai do expediente no marcador de pessoal ou no painel da fábrica. O turno agendado também é reconciliado pelo relógio do mundo a cada 30 segundos. Sem operador ativo, o processo industrial pausa. Ao desconectar, o turno termina e qualquer saco carregado volta para a vaga de origem.

A candidatura, o expediente, o EPI e a demissão também estão na aba **Emprego** do painel da fábrica (`/api/employment/hire` e `resign`; expediente e EPI pela sala, na entrada de pessoal). Ao encerrar o expediente (ou desconectar) o saco volta à prateleira e o EPI sai; no boot do mundo os turnos que ficaram abertos no banco são fechados.

O perfil contém a aba **Meu emprego**, com situação, início do turno, horário e demissão. A demissão encerra o turno e inicia o cooldown de 24 horas. Administradores podem admitir, demitir, zerar cooldown e habilitar/desabilitar expediente por usuário com `/emprego <jogador> ...`; todas as ações exigem administrador e são registradas.

Regras de concorrência são transacionais: um usuário tem um vínculo, no máximo 12 contratos ficam ativos e no máximo 6 turnos ficam abertos. O teste de integração abre solicitações simultâneas e comprova o limite.

**2026-11-12:** a candidatura virou um pedido (`applied`): quem admite é um dono ou gerente da empresa ([empresa.md](empresa.md)). `POST /api/employment/withdraw` cancela a candidatura. Demissão pelo dono não tem cooldown.
