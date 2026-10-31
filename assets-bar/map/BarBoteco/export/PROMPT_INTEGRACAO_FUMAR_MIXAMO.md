Preciso que você integre no jogo (three.js) uma animação nova dos personagens do Highland Bar: "fumar um cigarro inteiro". Os arquivos foram gerados em outra máquina (Blender) e eu copiei tudo para `C:\Users\MuOnline\Desktop\BAR\bar-de-buteco\assets-bar\map\BarBoteco`. Faça o que for preciso para funcionar no jogo de verdade, teste e me diga o que mudou.

## Arquivos (dentro de `...\BarBoteco`; se a estrutura estiver diferente, procure pelos nomes)
- `export\animacoes\bar_fumar_mixamo.glb` (NOVO, 1,1 MB): esqueleto Mixamo animado (sem malha) + props `Prop_Maco`, `Prop_Cigarro`, `Prop_Brasa`, `Prop_Isqueiro`, `Prop_Chama` + emissores `FX_Fumaca_Ponta` e `FX_Fumaca_Boca`. Um clipe só, `fumar_mixamo`, com 538 quadros a 30 fps (17,9 s).
- `export\animacoes\animacoes_bar.js` (ATUALIZADO): o módulo de animações do bar que o jogo já usa (ou deveria usar). Leia o cabeçalho inteiro.
- `export\PROMPT_INTEGRACAO_ANIMACOES.md`: instruções da integração original do módulo. Se o `animacoes_bar.js` ainda NÃO estiver integrado no jogo, faça essa integração primeiro, seguindo esse arquivo, e depois volte aqui.
- `export\animacoes\fbx\fumar_mixamo.fbx`: só o esqueleto, para outras ferramentas. O jogo não precisa dele.
- `scripts\19_fumar_mixamo.py`: script do Blender que gera o GLB. Não rode, é só referência.

Não edite nem reexporte os GLBs.

## O que mudou no `animacoes_bar.js`
A cópia que está no jogo pode ter adaptações locais (caminhos de import como `three/examples/jsm/...`, ajustes de pasta etc.). Não sobrescreva às cegas: compare a cópia do jogo com o arquivo novo e leve para o jogo exatamente estas mudanças, mantendo as adaptações locais:
1. `GRUPOS` ganhou `'fumar_mixamo'` e `GRUPO_DO_CLIPE` ganhou `fumar_mixamo: 'fumar_mixamo'`.
2. `lerAlvo()` agora também devolve `alturaQuadril` (altura do quadril do personagem em metros).
3. Em `clipe()`, o fator do deslocamento do quadril usa `F.info.quadril_m` quando o GLB tem esse campo (o esqueleto do Mixamo Smoking tem proporções bem diferentes do rafael-mixamo). Os GLBs antigos não têm esse campo e continuam com `A.altura / ALTURA_AUTORIA`, como antes.
4. Ação nova: `c.fumarCigarro = () => { c.estado = 'ocupado'; return seq(['fumar_mixamo']); };`
5. Função nova `mirarProps(a, t)`, chamada em `_tick` logo depois de `corrigirProps(a, t)`. Ela lê `info.mira` dos extras do clipe. Enquanto o personagem acende o cigarro, o cigarro na boca gira em torno do filtro para apontar para a chama, que vem da outra mão. A brasa e o emissor da ponta giram junto.
6. Correção de bug em `corrigirProps`: nas rampas de 4 quadros (prop entrando/saindo da mão), `_q.slerpQuaternions(new THREE.Quaternion(), _q, w)` zerava a rotação por aliasing. Agora é `_q.copy(_q1.identity().slerp(_q, w))`. Repare que `_q1` é declarado junto com `mirarProps`.
7. Comentários do cabeçalho (`p.fumarCigarro()` e a "mira").

## Passos
1. Copie `bar_fumar_mixamo.glb` para a mesma pasta pública onde já estão os outros `bar_*.glb` (a `pasta` passada para `criarAnimacoesBar`).
2. Atualize o `animacoes_bar.js` do jogo como descrito acima.
3. Carregamento:
   - Se o jogo chama `anim.carregar()` sem argumentos, ele agora carrega 8 GLBs.
   - Se passa a lista de grupos, inclua `'fumar_mixamo'`.
   - Confira que `anim.fontes.fumar_mixamo.info.quadril_m === 1.01`.
4. Disparo: `await p.fumarCigarro()`. A Promise resolve quando o personagem fica livre de novo, no fim do clipe.
   - Ligue a ação onde fizer sentido no jogo: no mesmo lugar em que hoje ficam `p.fumar()` / `p.pararDeFumar()` (tecla, menu de interação, sistema de bebedeira/status).
   - Ponha a ação também no modo de debug que dispara cada animação.
   - Ela é uma ação "livre": não precisa de lugar do mapa.
5. Durante a ação (`p.estado !== 'livre'`), não aplique input, física nem controller ao objeto do personagem.
   - No meio da ação o corpo dá um passo à frente (uns 25 cm, para pisar na bituca) e volta. No fim, o módulo recoloca o objeto onde o corpo terminou.
   - Quando a Promise resolver, sincronize o corpo físico/controller com `obj.position` e `obj.quaternion`.
6. A bituca pisada fica no chão:
   - O módulo chama `aoDeixar(objeto, 'fumar_mixamo')` das opções de `anim.personagem(obj, {...})` e remove a bituca depois de `restos` segundos (padrão 60).
   - Se o jogo já trata as bitucas do `pararDeFumar()`, use o mesmo tratamento.
7. A fumaça (ponta do cigarro e baforada) são as partículas do próprio módulo (tipos `fumaca` e `fumaca_boca`). Elas precisam do `anim.atualizar(dt, camera)` todo frame, que o jogo já deve chamar.
8. Multiplayer, se houver: replique a chamada `fumarCigarro` para os outros clientes chamarem no personagem remoto, como as outras ações.

## Roteiro da animação (para conferir)
| Tempo | O que acontece |
|---|---|
| ~0,6 s | sai o maço do bolso (mão esquerda) |
| ~1,3 s | puxa o cigarro (mão direita) |
| ~3,8 s | cigarro na boca |
| ~4,8 s | guarda o maço; ~5 s pega o isqueiro |
| ~6,1–7,3 s | chama acesa; ~6,6 s a brasa acende |
| ~8,5 s | tira o cigarro da boca |
| ~8,6–10,7 s | baforada |
| ~11,7 s | joga o cigarro no chão |
| ~12,5 s | pisa e gira o pé |
| 17,9 s | fim, personagem livre |

## Como conferir
- Console sem erros ao carregar `bar_fumar_mixamo.glb` e ao rodar `p.fumarCigarro()`.
- O maço aparece na mão esquerda, o cigarro na pinça da direita, depois na boca, depois entre os dedos.
- O isqueiro aparece na mão esquerda com a chama, a brasa brilha, sai fumaça da ponta e uma baforada da boca.
- O cigarro cai perto do pé direito e o pé pisa em cima. A bituca fica no chão depois do fim.
- No fim: `p.estado === 'livre'`, a Promise resolveu e o personagem não salta de posição, não afunda nem flutua.
- As ações antigas continuam funcionando: `fumar`/`pararDeFumar`, `sentar`/`comer`/`levantar`, `vomitar`, `urinar`, magrão `atender('chopp')`.

## Limitação conhecida (não tente corrigir)
Na skin rafael-mixamo, durante o acendimento a mão esquerda fica na frente da boca. É como a animação do Mixamo cai nas proporções dele. O isqueiro fica parcialmente escondido e a chama encosta no meio do cigarro. Se em outra skin ficar muito estranho, me diga qual skin e o tempo do clipe. Não edite o GLB: ele é gerado no Blender pelo `scripts\19_fumar_mixamo.py`.

No final, me mande a lista de arquivos alterados, onde e como disparar a nova animação no jogo, e qualquer coisa que não funcionou como descrito aqui.
