# Problemas, dívida técnica e riscos

## Achados prioritários

| ID | Evidência | Problema | Impacto | Prioridade |
| --- | --- | --- | --- | --- |
| ENG-01 | TESTADO | build inclui testes de um laboratório de avatar rejeitado e falha em `window.avatarV2Lab` | gate poluído por código sem futuro no produto | P0 |
| ENG-02 | TESTADO | teste de roupa depende de pasta-fonte removida | pipeline não reprodutível; CI falha | P0 |
| SEC-01 | CONFIRMADO | Zod `<4.6.6`, GHSA-mrhx-c7xc-m3w5 | DoS por coleções grandes se limite externo falhar | P0 antes de publicar |
| SEC-02 | CONFIRMADO | `body-parser` 2.0–2.3 transitivo, GHSA-27r3-jxmh-p828 | DoS com corpo comprimido malformado se rota exposta | P0 antes de publicar |
| ART-01 | DECISÃO DO PRODUTO | Avatar V2 e Quaternius são visualmente inadequados | investir neles prolongaria uma direção artística rejeitada | P0 de direção |
| LEG-01 | CONFIRMADO | animações do laboratório sem licença verificável | conteúdo rejeitado também não pode ser redistribuído | P0 legal |
| PERF-01 | CONFIRMADO | 105 MiB públicos e mapa 16,37 MiB | entrada lenta, memória alta em mobile | P1 |
| ART-02 | NÃO VERIFICADO | substituto gratuito ainda não passou por POC visual/técnica | risco de repetir escolha ruim | P1 |
| ARC-01 | CONFIRMADO | três arquivos concentram cena, sala e app | alto custo de mudança e conflito entre 2 devs | P1 |
| OPS-01 | NÃO VERIFICADO | Compose, SMTP, backup/restore e TLS externo não homologados | publicação arriscada | P1 |
| REL-01 | CONFIRMADO | retry de estatística e controle têm janela volátil | comando/resultado pode se perder em crash | P1/P2 |
| GAME-01 | CONFIRMADO | ganho normal de moedas = 0 | loja existe sem ciclo econômico | P1 de produto |
| QA-01 | CONFIRMADO | CI inclui E2E/carga em job único de 15 min | provável timeout/flakiness conforme suíte cresce | P1 |

## Segurança: controles e lacunas

Controles presentes: validação Zod estrita; Argon2id; tokens aleatórios com hashes; HMAC e expiração de tickets; tickets consumidos uma vez; cookies HttpOnly/SameSite=Lax/Secure em produção; verificação de Origin em mutações; rate limit; autorização persistida; segredo interno comparado em tempo constante; consultas Drizzle parametrizadas; economia transacional; XSS mitigado por escape/textContent nos dados de usuários.

Lacunas e ações:

- Atualizar Zod em todos os workspaces e a cadeia que traz `body-parser`; testar contratos porque há Zod 3 e 4 simultaneamente.
- Definir `bodyLimit`, limites de frame WebSocket e orçamento de comandos por tipo; hoje existem limites pontuais, não uma política uniforme documentada.
- Adicionar headers no nginx: CSP compatível com YouTube, HSTS no terminador TLS, `X-Content-Type-Options`, `Referrer-Policy` e `Permissions-Policy` para microfone.
- Separar `AUTH_SECRET` de assinatura de ticket e autenticação interna; a mesma chave amplia o impacto de vazamento.
- Definir retenção e exclusão de denúncias, logs, voz efêmera e conta; LGPD/privacidade não está operacionalizada.
- A varredura Codex Security ficou **NÃO VERIFICADA** por falta de Python; não apresentar esta revisão manual como pentest.

## Concorrência e confiabilidade

- Bom: locks/transações/idempotência em carteira, inventário e reversões; revisão de comando usa CAS; uma conta não ocupa duas vagas.
- Risco: `DELETE RETURNING` consome todos os controles antes da aplicação; queda depois do consumo perde o comando. Usar estados `pending/leased/applied/failed`, lease expirável e confirmação.
- Risco: retry de estatísticas vive em memória. Persistir outbox local ou fazer mundo enviar evento idempotente para uma fila/tabela.
- Risco: sala única é ponto de falha e limite de escala. Para o MVP isso é aceitável; precisa graceful shutdown, readiness e drenagem.
- Risco: PGlite admite um processo e não é alvo de produção. Scripts precisam detectar serviço ativo e recusar concorrência.

## Código e manutenção

`BarScene.ts`, `BarRoom.ts` e `main.ts` são hotspots. A recomendação não é criar dezenas de abstrações: extrair sistemas com lifecycle explícito, dependências por construtor e contratos compartilhados. O uso de `innerHTML` é aceitável apenas onde dados externos passam por `escape`; adicionar testes de XSS e preferir DOM/textContent em novas interfaces.

Há divergência de versões: Zod 3 no shared e 4 no servidor/API, `dotenv` duplicado, PGlite distante da versão mais recente. Atualização deve ser por lote pequeno com changelog e rollback de lockfile.

## Matriz de riscos

Escala: probabilidade (P) e impacto (I), 1–5; prioridade = P×I.

| Risco | P | I | Prioridade | Mitigação |
| --- | ---: | ---: | ---: | --- |
| Escopo excessivo para 2 pessoas | 5 | 5 | 25 | vertical slices e WIP=1 por domínio |
| Perda de licença de animação/assets | 4 | 5 | 20 | registro de procedência e substituição antes de release |
| Mobile abaixo da meta | 4 | 5 | 20 | budgets, LOD, KTX2, streaming, testes físicos |
| Build/CI não reproduzível | 5 | 4 | 20 | fixtures versionadas e gate P0 |
| Exploit de economia | 3 | 5 | 15 | autoridade, ledger, idempotência, invariantes/fuzz |
| Dependência YouTube | 4 | 3 | 12 | degradação explícita e mídia não essencial |
| Migração de engine desnecessária | 3 | 5 | 15 | somente POC com critérios objetivos |
| Falha da sala única | 3 | 4 | 12 | restart/drenagem/reconexão e persistência de outbox |
| Moderação insuficiente | 3 | 4 | 12 | mute, bloqueio, denúncia, retenção e SOP |
| Custos de mídia/banda | 3 | 4 | 12 | CDN/cache/compressão e métricas de egress |
| Falta de observabilidade | 4 | 4 | 16 | métricas, erros, dashboards e alertas mínimos |
| Regressão ao refatorar hotspots | 4 | 4 | 16 | characterization tests e extrações pequenas |

## Revisão adversarial

Objeção: “PlayCanvas limita o futuro”. Resposta: capacidade não é o gargalo demonstrado; assets, arquitetura e operação são. Uma troca agora descarta testes e integrações.

Objeção: “A suíte já é grande, então está seguro”. Resposta: o gate atual está vermelho e mobile/produção/carga longa seguem não verificados.

Objeção: “Monólito modular não escala”. Resposta: a meta atual é uma sala de 32 e dois desenvolvedores. Microsserviços aumentariam falhas operacionais sem necessidade. Separar serviços só com medição e fronteira de dados estável.

Objeção: “Avatar V2 já passou no laboratório”. Resposta: qualidade técnica mínima não supera a rejeição artística explícita. Ele deve ser removido, e o novo asset só avança após aprovação visual antes de qualquer integração longa.

