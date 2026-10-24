# Relatório técnico — Avatar V2 / PlayCanvas 2.23.3

Data da execução: 24/10/2026

Status: **laboratório funcional e Avatar V2 ativo no jogo local de desenvolvimento; não aprovado para produção**.

## Isolamento e preservação

O V2 foi integrado em `avatar-v2-lab.html` e, posteriormente, no `BarScene` e no criador do jogo normal durante desenvolvimento. A porta 5173 serve os arquivos diretamente de `BAR_Avatar_V2/export` por middleware restrito a essa raiz. Nenhum GLB, PNG ou banco de animação V2 foi copiado para `apps/web/public` ou para o `dist` de produção.

No desenvolvimento, avatares personalizados usam a montagem V2 no criador e dentro do mapa. Movimentação, login, sincronização existente e skins especiais continuam no mesmo fluxo. Há fallback automático para o personagem legado se manifests ou GLBs falharem. O build de produção mantém o visual legado e continua tendo somente `index.html` como entrada enquanto as licenças das animações V2 não forem verificadas.

As animações continuam marcadas como **licença não verificada** e só são acessíveis no servidor local do laboratório. Elas não devem ser distribuídas.

## O que foi executado

`npm run test:avatar-v2` executou quatro cenários reais no Edge/Chromium headless com WebGL:

- carregamento masculino e feminino;
- 61 montagens corpo/peça, cobrindo as 31 entradas do catálogo (saia apenas feminina);
- troca das duas variantes de textura;
- um único `BAR_HUMANOID_V2` e um único componente `anim` por avatar;
- peças deformáveis religadas por `render.rootBone` e cópias de juntas descartadas;
- acessórios nos três sockets usados pelo catálogo;
- materiais de pele, olhos, cabelo, roupas, lentes, cores e texturas compartilhadas;
- morph targets, presets de rosto e três estilos de sobrancelha;
- máscara de 28 regiões, incluindo `waist` apenas com TOP + BOTTOM;
- todos os 18 clipes e seus flags de loop/one-shot;
- bloqueios do `compatibility.json` e troca de peças em tempo real;
- carga com 1, 4, 8 e 16 personagens.

Resultado final: **4 testes passaram, zero erros de página e zero erros de console**. O typecheck e o build web também passaram.

Depois da ativação no jogo real, `npm run test:avatar-v2:game` também passou na porta normal: prévia V2 visível, entrada no mapa como `v2-male`, 18 tracks disponíveis e transição `Idle` → `Walk` durante movimentação. Evidências: `game-creator-v2.png` e `game-world-v2.png`.

## Componentes funcionais

| Componente | Resultado | Observação |
| --- | --- | --- |
| Corpos masculino/feminino | Funcionou | Texturas externas relativas resolvidas. |
| Montagem modular | Funcionou | 61 montagens executadas. |
| Skinning em esqueleto único | Funcionou estruturalmente | 1 armature e 1 avaliação de animação por avatar. |
| Acessórios rígidos | Funcionou | Óculos, cabeça e pulso acompanharam os sockets. |
| Materiais e cores | Funcionou | Skin/eyes/clothing chunks, lentes BLEND e overrides funcionaram. |
| Texturas compartilhadas | Funcionou | `hair_v2.png` e `eye_v2.png` são compartilhadas entre containers. |
| Máscara corporal | Funcionou com limite artístico | `opacityMap` em UV1 e sombras respeitam a máscara; bordas continuam dependentes da topologia. |
| Morphs e sobrancelhas | Funcionou | Aplicação por nome no corpo e peças compatíveis. |
| Animações | Funcionou no laboratório | Distribuição bloqueada por licença. |
| Hot swap | Funcionou | Materiais das peças removidas são liberados na troca. |
| Compatibilidade | Funcionou | Combinações `blocked`, sockets exclusivos e saia sem TOP são impedidos. |

## Desempenho medido

Cada linha usa seis amostras de 500 ms. O contador inclui passe principal, sombras e piso do laboratório; por isso não equivale diretamente aos 8–10 draw calls de geometria por avatar previstos no pacote.

| Avatares | FPS médio | Frame | Draw calls | Primitivas |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 54,2 | 18,44 ms | 19 | 18.904 |
| 4 | 52,7 | 18,98 ms | 73 | 75.610 |
| 8 | 56,1 | 17,82 ms | 145 | 151.218 |
| 16 | 52,9 | 18,92 ms | 289 | 302.434 |

Esses números são indicativos do ambiente headless desta máquina. Eles **não aprovam desempenho móvel**. O crescimento é linear e o pacote não possui LOD, então será necessário medir GPUs físicas e definir limite simultâneo ou LOD antes da migração.

## Defeitos dos assets que precisam voltar ao Blender

1. **Bloqueador visual — saia em `Sit`:** `bottom_skirt_female.glb` vira um volume rígido/tubular atrás e ao redor das coxas. Frente e perfil não têm qualidade de produção. Revisar pesos de quadril/coxa e criar uma correção específica para sentado, depois conferir frente, perfil e costas.
2. **Cobertura sob a saia:** a faixa da virilha e as bordas serrilhadas de `pelvis`/`waist` continuam expostas em ângulos baixos. Reparticionar faces das regiões ou ampliar um forro interno na saia.
3. **Clipping menor já medido:** mangas longas, barras sentadas, cabelo sob boné e pares `minor_clipping` continuam sendo defeitos geométricos permitidos pelo manifest, não falhas do binder PlayCanvas. Refinar pela prioridade visual indicada em `compatibility.json`.
4. **Contato dos pés:** os até 2,2 cm de penetração documentados em Walk, Run, AngrySit e CardsSit devem ser corrigidos nas curvas/contato antes do polimento final.
5. **Props ausentes:** Drink, Cards e OldCane reproduzem o esqueleto, mas o pacote não inclui copo, cartas ou bengala. A validação semântica dessas ações permanece incompleta.

## Problemas de integração encontrados e corrigidos

- O corpo instanciado pode ser ele próprio o nó `BAR_HUMANOID_V2`; `findByName` não inclui o receptor. A detecção agora aceita armature direta ou aninhada.
- Os clones de material de peças removidas eram mantidos até destruir o avatar. Agora são destruídos no hot swap.
- `hair_v2.png` e `eye_v2.png` inicialmente seriam duplicadas por container. Agora entram pelo `processAsync` como assets compartilhados.

Não restaram erros de integração no teste executado.

## Pendente antes de qualquer migração

- verificar documentalmente as licenças das 18 animações;
- testar hardware móvel real e definir LOD/limite de avatares;
- validar assentos e props nos sockets V2;
- fazer capturas longas de todos os outfits permitidos em frente, perfil e costas;
- desenhar a serialização multiplayer V2 e a validação server-side dos manifests em uma fase posterior, sem substituir o sistema atual de uma vez.

Evidências locais foram geradas em `test-results/avatar-v2/`, incluindo `female-skirt-sit.png`, `female-skirt-sit-profile.png`, `stress-16.png` e `runtime-report.json`.
