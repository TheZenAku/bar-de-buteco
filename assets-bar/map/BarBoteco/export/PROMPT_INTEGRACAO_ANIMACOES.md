Preciso que você integre no jogo (three.js) o mapa novo do Highland Bar e as animações novas dos personagens. Os arquivos foram gerados em outra máquina (Blender) e eu acabei de copiá-los para este projeto. Faça tudo o que for preciso para funcionar no jogo de verdade, teste e me diga o que mudou.

## Arquivos que eu copiei (localize no projeto)
- `bar_boteco.glb` (ou `bar_boteco_draco.glb`, mesmo conteúdo com Draco) e `bar_boteco_colisao.glb`: o mapa, reexportado. Substitui o que o jogo já carrega.
- `integracao_highland.js`: integração do mapa que o jogo já usa (`prepararMapa(gltf.scene)`: mesas, jukebox, telão, palco). Não mudou.
- pasta `animacoes/`:
  - `animacoes_bar.js`: módulo novo; é ele que faz tudo funcionar. Leia o cabeçalho do arquivo inteiro antes de começar.
  - `bar_locomocao.glb`, `bar_fumar.glb`, `bar_vomitar.glb`, `bar_cadeira.glb`, `bar_mesa.glb`, `bar_banheiro.glb`, `bar_magrao.glb`: clipes + props + emissores de partícula.
  - `fbx/*.fbx`: um FBX por clipe (só esqueleto). Não precisa usar; o módulo usa os GLBs.
  - `palco_musicos.js` + `palco_*.glb`: músicos do palco, de uma entrega anterior. Se ainda não estiverem integrados, integre também (`criarPalco(mapa, { pasta })`, ver o cabeçalho).

Arrume os caminhos conforme a estrutura do projeto (pasta pública/static de assets e onde ficam os módulos JS). Não edite nem reexporte os GLBs.

## O que tem nas animações
Esqueleto Mixamo (ossos `mixamorig...`, qualquer prefixo), autorado com 1,90 m (é a altura do `rafael-mixamo.fbx` no three.js). O módulo converte para qualquer personagem com SkinnedMesh Mixamo, com ou sem escala, FBX ou GLB.
- Locomoção no lugar (o jogo move o objeto): parado, andar 0,85 m/s, andar bêbado 0,55 m/s. O módulo ajusta o ritmo do passo pela velocidade.
- Ações: fumar (acender, loop, apagar/pisar a bituca), vomitar (poça fica no chão), cair, levantar do chão, sentar na cadeira (puxa a cadeira real do mapa), sentado em loop, comer (garfo e batata), levantar, limpar a mesa (pela quina mais perto), urinar no mictório, e o magrão no balcão (`chopp`, `chopp_escuro`, `longneck`): vai até a chopeira ou o freezer e deixa a bebida no balcão.
- Fumaça, vômito e jato de urina são partículas do próprio módulo (THREE.Points); a escala dos nós `FX_*` é a intensidade.

## O que o mapa novo tem (o módulo procura por nome)
- `Balcao_Lugar_Magrao` (onde o magrão fica, de frente para o cliente) e `Balcao_Entrega` (onde a bebida é deixada).
- `Mictorio_Lugar_1..3`.
- `Copo_Bandeja` e `Freezer_Bar_Tampa`: o módulo esconde esses dois enquanto a cópia animada está em uso.
- `Mesa_01..39` (extras `mesa`, `area`, `lugares`). As cadeiras são o InstancedMesh `INST_A_cadeira-vermelha` (EXT_mesh_gpu_instancing). O módulo acha cada cadeira de mesa pelas instâncias e move a instância quando o personagem puxa a cadeira.

## Passos
1. Troque o mapa pelo novo. Se o jogo usa o `_draco`, o GLTFLoader precisa do DRACOLoader; passe esse mesmo loader para o módulo (`loader`). Confirme que a versão do three é r151 ou maior (EXT_mesh_gpu_instancing; testado com 0.160).
2. Ajuste os imports do `animacoes_bar.js` se o projeto não usar `three/addons/...` (por exemplo `three/examples/jsm/loaders/GLTFLoader.js`). Não mude a API.
3. Garanta que nada do jogo funde, simplifica ou recria os nós acima. Em especial, o InstancedMesh das cadeiras tem que continuar sendo InstancedMesh, com as mesmas instâncias.
4. Depois de pôr o mapa na cena, use nomes diferentes para os dois módulos (os dois costumam virar `bar`):
   ```js
   const mapaBar = prepararMapa(mapa);
   const anim = criarAnimacoesBar(mapa, { pasta: '<url da pasta animacoes>/', cena: scene, renderer, camera, loader });
   await anim.carregar();          // ou anim.carregar('locomocao', 'cadeira', ...) só com o que usar
   ```
   E no loop, todo frame: `mapaBar.atualizar(dt); anim.atualizar(dt, camera);`. Se você passar o mixer do jogo para o módulo, atualize esse mixer antes do `anim.atualizar`.
5. Para cada personagem (jogador, NPCs, outros jogadores): `const p = anim.personagem(obj, { mixer, locomocao, aoComecar, aoTerminar, aoDeixar })`. `obj` é o Object3D que o jogo move e tem a SkinnedMesh.
   - Veja como o jogo anima hoje o idle e o andar. Se der para usar a locomoção do módulo, use: `p.locomover(velocidadeHorizontal, { bebado })` todo frame. Ela emenda sem salto com o fim de todas as ações.
   - Se o jogo precisar manter as animações de andar dele, use `{ mixer: mixerDoJogo, locomocao: false, aoComecar: () => esmaecer idle/walk do jogo em 0,3 s, aoTerminar: () => tocar o idle do jogo com peso 1 na hora }`.
6. Enquanto `p.estado !== 'livre'`, não aplique input, física nem controller ao objeto do personagem. O módulo leva o personagem até o lugar (0,3 s) e, no fim de cada ação, recoloca o objeto onde o corpo terminou. Quando a Promise da ação resolver, sincronize o corpo físico/controller com `obj.position` e `obj.quaternion`. Durante sentar, limpar a mesa e urinar, desligue a colisão desse personagem com a mobília (ele encosta na cadeira e na mesa).
7. Interações (use o padrão de interação que o jogo já tem, por exemplo tecla E com aviso na tela):
   - perto de uma cadeira de mesa: `p.sentar(anim.maisPerto(anim.cadeiras, pos, 1.5))`; sentado: `p.comer()`, `p.pararDeComer()`, `p.levantar()`;
   - perto de uma mesa: `p.limparMesa(anim.maisPerto(anim.mesas, pos, 1.5))`;
   - no banheiro: `p.urinar(anim.maisPerto(anim.mictorios, pos, 1.5))`;
   - livres: `p.fumar()` / `p.pararDeFumar()`, `p.vomitar()`, `p.cair()` / `p.levantarDoChao()`; ligue isso ao sistema de bebedeira/status do jogo, se existir.
   Todas devolvem Promise: as que entram em loop (fumar, sentar, comer) resolvem quando o loop começa, as outras quando o personagem fica livre.
8. Magrão: crie um NPC com uma skin Mixamo parado em `anim.balcao`. Quando um cliente pedir no balcão (perto do `Ponto_Balcao` ou da `Balcao_Entrega`), chame `const bebida = await magrao.atender('chopp' | 'chopp_escuro' | 'longneck')`. `bebida` é um Object3D no balcão (`userData.bebida`); entregue ao cliente do jeito que o jogo fizer sentido e remova depois. Faça uma fila se chegarem dois pedidos ao mesmo tempo (o magrão faz um de cada vez; cada atendimento leva cerca de 14 s).
9. Multiplayer, se houver: replique a chamada (nome do método + nome do lugar: `cadeira.name`, `mesa.name`, `mictorio.name`) para os outros clientes chamarem o mesmo método no personagem remoto. Os nomes das cadeiras são determinísticos para o mesmo mapa.
10. Crie um modo de debug (teclas ou menu, só em desenvolvimento) que dispare cada ação no jogador e no magrão, para eu testar tudo.

## Como conferir
- No console, sem o aviso "nenhuma instancia de cadeira": `anim.cadeiras.length` deve dar cerca de 124, `anim.mesas.length` 31, `anim.mictorios.length` 3, e `anim.balcao` não pode ser nulo.
- Se aparecer o aviso de altura do personagem, me diga qual skin e qual altura.
- Andar: os pés não escorregam a 0,85 m/s.
- Sentar: a cadeira do mapa sai uns 40 cm para trás e volta ao lugar.
- Magrão: `Copo_Bandeja` some durante o chopp e volta no fim, a tampa do freezer abre na long-neck, e a bebida fica em `Balcao_Entrega`.
- Fumaça, vômito verde e o jato aparecem.
- Nenhuma ação deixa o personagem afundado no chão, flutuando ou com salto de posição ao terminar.

No final, me mande a lista de arquivos alterados, como disparar cada animação no jogo e qualquer coisa que não funcionou do jeito descrito aqui.
