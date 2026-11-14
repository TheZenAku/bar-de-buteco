# Prompt para o Claude — placeholders 3D da RIBEIRO

Copie o conteúdo abaixo para o Claude junto do repositório do projeto.

---

Você é um artista técnico 3D e programador Blender responsável pelos assets industriais da empresa fictícia **Ribeiro Usinagem e Ferramentaria**, dentro de um jogo multiplayer brasileiro. Desenvolva seis modelos 3D low-poly que substituirão os placeholders procedurais definidos em `apps/web/src/machine-shop/placeholders.ts`.

## Entrega esperada

Crie um script Python para Blender, reproduzível e idempotente, que gere os seis assets abaixo e os exporte separadamente em GLB:

| Etapa | Arquivo | Nó raiz obrigatório | Conteúdo |
|---|---|---|---|
| Preparação | `ribeiro_preparacao_blank.glb` | `RB_PH_PREPARACAO` | Bandeja industrial com tarugos de aço/alumínio, pequena chapa, molas e blocos de polímero separados. |
| Corte | `ribeiro_peca_cortada.glb` | `RB_PH_CORTE` | Blank metálico preso em gabarito de corte, marca visual da linha de corte e poucas aparas grandes. Não criar partículas soltas. |
| Usinagem | `ribeiro_peca_usinagem.glb` | `RB_PH_USINAGEM` | Corpo metálico genérico semi-usinado preso em uma morsa CNC compacta, com canais e rebaixos visíveis. |
| Furação/acabamento | `ribeiro_peca_furacao.glb` | `RB_PH_FURACAO_ACABAMENTO` | Corpo furado preso em gabarito, broca/rebarbador ao lado e pequenos chanfros que indiquem acabamento. |
| Montagem | `ribeiro_kit_montagem.glb` | `RB_PH_MONTAGEM` | Conjunto de arma fictícia totalmente descarregada e desmontada em bandeja: corpo, cano, mola, empunhadura e fixadores organizados. Não incluir munição, carregador municiado, marca real ou instruções funcionais. |
| Produto final | `ribeiro_arma_final_caixa.glb` | `RB_PH_PRODUTO_FINAL` | Arma fictícia final descarregada, visualmente não funcional, apoiada em berço de transporte industrial com etiqueta RIBEIRO. |

## Direção visual

- Estética industrial brasileira contemporânea, usada, limpa e coerente com uma ferramentaria real.
- Formas legíveis a 3–15 metros de distância; detalhes grandes, sem microgeometria.
- Aço escovado cinza, aço escuro, alumínio fosco, polímero grafite e detalhes de segurança verde `#34d399`.
- Sem logotipos ou geometrias copiadas de fabricantes reais. O armamento deve ser claramente fictício e não deve reproduzir mecanismos internos funcionais.
- Textos permitidos: `RIBEIRO`, `OP`, `PEÇA EM PROCESSO`, `SEM MUNIÇÃO`.

## Contrato técnico

- Blender em metros; `+Z` para cima no arquivo fonte e exportação glTF padrão.
- Origem do nó raiz centralizada no piso da bandeja/gabarito; objeto orientado para frente em `-Y` no Blender.
- O jogo posiciona e gira o nó raiz. Não aplique coordenadas do mapa dentro do GLB.
- Dimensão máxima de cada asset: `0,75 m × 0,55 m × 0,45 m`.
- Máximo de 8.000 triângulos por GLB; alvo de 2.000–5.000.
- Uma única textura atlas por asset, no máximo 1024×1024; prefira materiais PBR simples e cores de vértice quando possível.
- Use metallic/roughness corretamente. Não dependa de nós proprietários do Blender.
- Aplique transforms, remova objetos ocultos, faces internas desnecessárias, doubles e materiais sem uso.
- Nomes ASCII nos subnós, prefixados com `RB_`.
- Exportar normais, tangentes quando houver normal map, UVs, materiais e animações; não exportar câmeras nem luzes.

## Animações obrigatórias

Cada GLB deve conter dois clipes com nomes exatos:

- `Idle`: loop sutil de 2 segundos, sem mover o nó raiz.
- `Operate`: loop de 1,2 a 2 segundos, específico da etapa e sem deslocamento global.

Movimentos pedidos:

- Preparação: peças da bandeja assentam suavemente/indicador pulsa.
- Corte: gabarito avança e recua poucos centímetros; a peça permanece presa.
- Usinagem: morsa vibra muito levemente e um indicador gira; não criar uma máquina CNC inteira.
- Furação/acabamento: ferramenta desce e sobe sobre os furos, sem atravessar a peça.
- Montagem: duas peças aproximam-se parcialmente e voltam à posição de exposição.
- Produto final: berço faz uma apresentação muito discreta; a arma nunca flutua livremente.

As animações devem ser mecânicas, sem deformação de malha e sem movimento do nó raiz. Coloque partes móveis sob um subnó `*_MOVEL` para que o jogo também possa animá-las proceduralmente.

## Estrutura e integração

1. Leia `apps/web/src/machine-shop/placeholders.ts` e preserve os nomes de contrato declarados em `RIBEIRO_PLACEHOLDER_SPECS`.
2. Grave o script fonte em `assets-bar/map/BarBoteco/scripts/` com nome claro, por exemplo `70_ribeiro_placeholders.py`.
3. Exporte os GLBs para `assets-bar/map/BarBoteco/export/farm_armas/placeholders/`.
4. Crie ou ajuste um importador em `tools/assets/` para copiar/otimizar os seis arquivos em `apps/web/public/farm/placeholders/`, sem sobrescrever outros assets.
5. Acrescente validação automatizada que confira: arquivos existentes, nó raiz correto, escala em metros, limite de triângulos, materiais, clipes `Idle`/`Operate` e ausência de câmera/luz.
6. Integre o carregamento no cliente com fallback seguro para os placeholders procedurais atuais: se o GLB falhar, o jogo deve continuar exibindo a geometria temporária.
7. Não altere posições das máquinas, receitas, tempos, pagamentos nem lógica autoritativa do servidor.

## Critérios de aceitação

- Os seis modelos aparecem sobre suas estações sem atravessar piso ou máquina.
- A leitura visual de cada etapa é diferente mesmo sem texto.
- `Idle` e `Operate` repetem sem salto e sem mover a origem.
- Os assets carregam de forma independente; uma falha não impede os outros cinco.
- O modo gráfico baixo pode desligar animação/sombras mantendo o objeto visível.
- O resultado deve incluir: arquivos modificados, comando de geração/importação, contagem de triângulos por asset e uma captura de cada modelo em perspectiva 3/4.

Antes de editar, inspecione os scripts e importadores existentes do repositório e siga suas convenções. Ao terminar, execute os testes e verificações de assets relevantes e relate qualquer limitação real, sem inventar resultados.

---
