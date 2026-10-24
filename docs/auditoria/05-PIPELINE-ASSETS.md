# Pipeline de mapa, avatares, animação e áudio

## Mapa

Preservar o Blender como fonte visual e exportar gameplay separadamente. Convenção:

- `GEO_`: render estático; `COL_`: colisão simplificada; `INT_`: interativo;
- `SEAT_`, `SPAWN_`, `NPC_`, `NAV_`, `AUDIO_`, `LIGHT_`, `DOOR_`;
- metros, +Y para cima, pivôs aplicados, escala 1, transforms congeladas onde estático;
- IDs estáveis e únicos; renomear um ID é mudança de contrato.

O importador deve produzir: GLB visual otimizado, GLB/JSON de colisão, manifest com hash/versão, relatório de orçamento e `map-data.json`. Gameplay referencia IDs do manifest, nunca índice de nó. Reimportação falha se um marcador obrigatório desaparecer e não sobrescreve configurações sem diff legível.

Gates: glTF Validator sem erro; texturas/caminhos válidos; spawn e rotas navegáveis; colisores sem NaN; escadas/portas/assentos testados; orçamento de tamanho/draw calls; screenshot de regressão.

## Render e otimização

- Converter texturas para KTX2/Basis com fallback apenas onde necessário; limitar 2K a elementos hero, 1K/512 nos demais.
- Meshopt/Draco conforme medição de decode; cache com nomes content-hash.
- Separar bootstrap/lobby, mapa essencial e conteúdo sob demanda.
- Batching/instancing para mobiliário repetido; atlas só quando não destrói reuso e mipmaps.
- LOD0/1/2 e impostor/culling para avatar/NPC; reduzir frequência de animação distante.
- Perfis Baixo/Médio/Alto: pixel ratio, sombras, luzes, partículas, pós-processamento.
- Budgets iniciais, a validar: entrada comprimida ≤25 MiB, mapa essencial ≤12 MiB, avatar remoto médio ≤2 MiB transferido/cacheado, ≤100 draw calls de cena estática e ≤8 por avatar no passe principal.

## Avatar e rig

**Decisão artística:** não reutilizar Avatar V2, Antonia nem Quaternius como corpo base, sistema modular ou fallback final. Eles foram rejeitados visualmente. Não corrigir saia, pesos, clipping ou materiais desses pacotes; esse esforço deve ir para a escolha e adaptação de uma base melhor.

O contrato canônico só será batizado depois de aprovar um substituto. Requisitos para qualquer candidato: visual coerente com PS2 estilizado, corpos masculino e feminino convincentes, roupa contemporânea adaptável ao bar, rig humano documentado, FBX ou glTF, licença comercial clara, possibilidade legal de modificação e custo web aceitável.

Regras técnicas independentes do asset: nomes/hierarquia/axes/escala documentados; até 4 influências por vértice; pesos normalizados; root motion removido da locomoção de rede; sockets de mãos/cabeça/costas/quadril; props rígidos separados; LOD e materiais simples.

Processo obrigatório:

1. selecionar no máximo três candidatos gratuitos;
2. produzir screenshots comparáveis no mapa, sem alterar o jogo principal;
3. obter aprovação visual explícita do responsável pelo produto;
4. verificar licença e guardar sua cópia;
5. somente então testar rig, animações, roupas, props, performance e multiplayer;
6. migrar atrás de feature flag e remover os dois sistemas rejeitados após paridade.

## Animação orientada a dados

Manifest por rig: clipe, fonte/licença, loop, duração, velocidade nominal, blend, máscara, prioridade, locks, prop e fallback. State machine separa locomoção, ação de corpo inteiro e camada superior. Conflitos são resolvidos por prioridade e tags, não por `if` espalhado.

Feet sliding: velocidade do personagem deriva da velocidade nominal ou play rate = velocidade real/nominal. One-shots têm start server-time, duração e cancelamento explícito. Remotos interpolam estado e horário, sem sincronizar pose por frame.

## Áudio

Fontes preservadas; publicação em AAC/Opus conforme suporte medido, loudness normalizado e loops/crossfades testados. Cada arquivo entra num manifest com licença, hash, duração, loudness e uso. Não publicar áudio sem procedência.

## Procedência

Criar `assets-manifest.yml`: autor, origem, URL, licença, arquivo da licença, modificações, permissão comercial e data da verificação. Bloquear CI de produção para status `unknown`. Arquivos do Avatar V2/Antonia e Quaternius não devem entrar no novo pacote apenas porque já existem no repositório.

