# Decisões pendentes e registro de confiança

| Decisão | Estado | Dono sugerido | Evidência necessária |
| --- | --- | --- | --- |
| Hardware mínimo e navegadores | REQUER DECISÃO | produto+técnica | 4 dispositivos reais e métricas |
| Licenças dos FBX/animações | BLOQUEADOR | produto/legal | comprovantes por arquivo |
| Quaternius como avatar final | REJEITADO | produto | remover após migração; não investir |
| Avatar V2 como avatar final | REJEITADO | produto | remover laboratório/artefatos após migração; não investir |
| Novo pacote gratuito | REQUER DECISÃO | produto+arte | bake-off visual de até 3 candidatos, depois licença e POC técnica |
| Regras de ganho/preços | REQUER DECISÃO | game design | playtest e telemetria |
| Provedor/país de hospedagem | REQUER DECISÃO | operação | latência, custo, LGPD e egress |
| SMTP e domínio | NÃO VERIFICADO | operação | staging com entrega real |
| Retenção/exclusão de dados | REQUER DECISÃO | produto/legal | política LGPD/moderação |
| Conteúdo/idade | REQUER DECISÃO | produto | política, classificação e termos |
| Meta acima de 32 jogadores | HIPÓTESE | produto+técnica | load/soak e render real |
| WebGPU default | NÃO VERIFICADO | gráficos | matriz browser e fallback |
| POC de outra engine | NÃO NECESSÁRIA agora | arquitetura | só por gatilho objetivo |

## Perguntas de produto

- Qual é a fantasia principal: frequentador, trabalhador, anfitrião ou caos social?
- Quanto deve durar uma sessão típica?
- Quais comportamentos são proibidos e qual é o fluxo de recurso de ban?
- Haverá conteúdo criado pelo usuário além de texto/voz/link do YouTube?
- As skins premium serão apenas moeda de jogo permanentemente?
- Quais regiões/idiomas e faixa etária serão atendidos no beta?

## Limitações desta auditoria

- Docker, SMTP, WAN, dispositivos móveis e soak não foram executados.
- E2E não foi repetido após os gates de build/teste falharem.
- A varredura Codex Security formal não iniciou: o host não possui Python real.
- Não foi feita opinião jurídica; licenças/privacidade exigem validação competente.
- Preços de nuvem não foram estimados sem tráfego, região e SLO definidos.

## Conclusão

**CONFIRMADO:** existe investimento substancial reutilizável. **INFERIDO com alta confiança:** refatorar mantendo a engine é o caminho de menor risco e maior valor. **REQUER DECISÃO:** licenças, hardware-alvo e economia determinam o release. Até build/testes/licenças estarem verdes, qualquer expansão grande aumenta o risco sem fortalecer a fundação.

