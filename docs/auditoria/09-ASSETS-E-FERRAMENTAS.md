# Assets e ferramentas recomendadas

## Ferramentas

| Uso | Recomendação | Motivo |
| --- | --- | --- |
| DCC/rig | Blender 4 LTS | gratuito, pipeline já existe |
| Validação glTF | Khronos glTF Validator | erros estruturais reproduzíveis |
| Otimização | glTF Transform + meshoptimizer | compressão, prune, inspect e CI |
| Textura | KTX-Software/BasisU | KTX2 transcodificável |
| Perfil gráfico | PlayCanvas Profiler + DevTools | draw calls, GPU/CPU e memória |
| Áudio | ffmpeg + Audacity | conversão, loudness e edição |
| Rede/carga | testes Colyseus existentes + k6 para HTTP | reuso e métricas separadas |
| Banco | pg_dump/pg_restore + cliente PostgreSQL | backup/restore operacional |
| Observabilidade | OpenTelemetry + Prometheus/Grafana ou serviço simples | padrões abertos; começar pequeno |
| QA | Node test + Playwright | stack já dominada |

Não adicionar ferramenta se o pipeline não tiver comando determinístico, versão fixada e documentação.

## Assets atuais

- Mapa BarBoteco: reutilizar; validar licença/procedência de fontes e texturas.
- Quaternius Standard: rejeitado artisticamente; não recuperar como direção do produto. Substituir testes dependentes por fixtures técnicas neutras até sua remoção.
- Avatar V2/Antonia: rejeitado artisticamente; não corrigir nem promover. Manter isolado somente até a migração permitir sua exclusão segura.
- Skins premium e objetos: tecnicamente integrados; cada item ainda precisa entrada no manifest de licença.
- Sons ambientes: integração correta, mas procedência/licença deve constar no manifest.

## Candidatos gratuitos para avaliação visual

Nenhum candidato está automaticamente aprovado. A escolha deve ocorrer por screenshots dentro do BarBoteco antes de trabalho de integração completo.

| Candidato | Licença declarada | Pontos favoráveis | Limites para o B.A.R. |
| --- | --- | --- | --- |
| [KayKit Character Pack: Adventurers](https://kaylousberg.itch.io/kaykit-adventurers) | CC0, uso comercial e sem atribuição | cinco personagens gratuitos, rig, animações, acessórios, FBX/glTF e acabamento estilizado consistente | roupas são de fantasia; usar para avaliar qualidade/rig, não como tema final sem remodelar |
| [Kenney Character Assets — demo](https://kaylousberg.com/work/kenney-character-assets) | verificar licença do download específico | sistema modular, quatro corpos, skins, acessórios e animações; visual limpo | a página informa demo gratuita, não o pacote completo gratuito; não assumir direito sobre o conteúdo pago |
| [MakeHuman System Assets](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html) | itens listados como CC0 | variedade de corpos, idades, cabelos e roupas contemporâneas; fonte modificável | visual padrão não combina automaticamente com PS2 estilizado e exigiria direção artística/decimação própria |
| [Poly Pizza](https://poly.pizza/) | varia por modelo | catálogo amplo para complementar cabelos, roupas e props | licença e qualidade precisam ser verificadas item a item; não serve sozinho como sistema modular |
| [itch.io: personagens 3D gratuitos](https://itch.io/game-assets/free/tag-3d/tag-characters) | varia por produto | fonte de amostras PSX/low-poly e packs independentes | “gratuito” não significa licença comercial; aceitar somente página com licença explícita e pack coerente |

**Recomendação inicial:** testar visualmente KayKit como referência de acabamento e MakeHuman somente como matéria-prima modificável. Se nenhum dos dois atingir a identidade desejada, selecionar três amostras PSX/low-poly de licença explícita no itch.io e fazer um bake-off. Não integrar dezenas de assets isolados de autores diferentes, pois isso recriaria uma direção visual inconsistente.

## Política de aquisição

Aceitar apenas asset com URL/origem, autor, licença comercial, prova arquivada, formato-fonte e orçamento técnico. Rejeitar “free” sem licença. Não copiar marcas, músicas ou modelos de Resident Evil; usar apenas atmosfera como referência.

## Automação

Cada importador roda em diretório temporário, valida antes de publicar, usa hash para não reprocessar, gera manifest/relatório e só substitui a saída ao sucesso. Testes não podem depender de Avatar V2, Quaternius ou de uma pasta baixada manualmente; usar fixture técnica pequena e licenciada, nunca ENOENT inesperado.

