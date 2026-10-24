# UI/UX, acessibilidade e renderização

## UI

Manter DOM/CSS sobre canvas. Isso favorece formulários, admin, responsividade e acessibilidade. Refatorar para componentes pequenos sem introduzir framework apenas por preferência. Estado de sessão/mundo fica fora do template; todo dado não confiável usa `textContent` ou escape centralizado.

Hierarquia: HUD mostra somente estado urgente, contexto e ação disponível. Inventário/admin/roupa são modais. Toast serve confirmação transitória, nunca substitui erro persistente. Controles exibem teclado/controle/toque de acordo com dispositivo.

Adicionar focus trap, retorno de foco, navegação por teclado, nomes acessíveis, contraste AA, escala de fonte, redução de movimento, legendas/indicadores visuais, remapeamento básico e modo sem tremor/câmera agressiva. Criar controles touch: stick esquerdo, câmera direita, ação contextual e atalhos reduzidos.

## Direção visual

PS2 estilizado significa silhueta forte, materiais simples coerentes, texturas pequenas deliberadas e iluminação artística; não significa baixa qualidade acidental. Paleta: interior quente (âmbar/vermelho/madeira), exterior noturno frio, neon pontual. Bloom baixo, fog para profundidade/limite, tone mapping estável e emissivos limitados.

## Luz e pós-processamento

Preservar ciclo atual, mas perfis de qualidade controlam cascatas, resolução e número de sombras locais. Preferir luz baked/mista no interior estático; sol/lua, personagens e eventos permanecem dinâmicos. AO/bloom/color grade só entram se o perfil baixo mantiver legibilidade sem eles. Reflexos seletivos/cubemap, não SSR obrigatório.

## Qualidade adaptativa

Medir média/p95 de frame por janela. Reduzir pixel ratio, sombras, luzes, partículas e distância/LOD em degraus com histerese. Nunca mascarar travamento com “frame generation”; DLSS não é pressuposto web. FSR/upsampling por shader só após POC e comparação visual em WebGL2/WebGPU.

## Budgets e gates

Alvos iniciais, sujeitos a hardware definido:

- desktop modesto: 60 FPS médio, p95 ≤22 ms; mínimo suportado 30 FPS;
- mobile alvo: 30 FPS, p95 ≤38 ms, sem crash térmico em 15 min;
- nenhum frame longo >250 ms durante troca já cacheada;
- carregamento mostra progresso real e permite entrar antes de conteúdo opcional;
- memória e contexto WebGL sobrevivem a entrar/sair/criador três vezes.

Testar visualmente meio-dia/noite/apagão, 1/8/16 avatares, interior/exterior, modal e viewport 390 px. Capturas automatizadas ajudam, mas hardware físico é gate.

