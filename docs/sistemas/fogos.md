# Rojão e fogos de artifício

Na **Loja da casa**, no quintal, pressione **E** e compre **Rojão de festa** (35 moedas por unidade por padrão; ajustável em Administração → Preços). A mochila guarda até dez na mesma pilha.

Abra a mochila com **I**, selecione o rojão e clique em **Equipar na mão**. O personagem segura o tubo na mão direita e acompanha a direção da câmera. Arraste para mirar; a mira dourada no centro indica a direção. Clique com o botão esquerdo, toque na cena ou use **Soltar** para disparar. **R** ou **Guardar** recolhe o rojão. Equipar e guardar não gastam unidades; cada disparo confirmado consome uma. O último disparo esvazia a mão automaticamente.

O rojão voa na direção apontada, deixa um rastro luminoso e explode em faíscas coloridas com som por distância, visíveis para todos na sala. Paredes, tetos e o chão interrompem o voo. É um efeito de festa, sem dano. O jogador pode andar enquanto mira; sentar, usar o celular, dançar, cair ou ocupar as mãos guarda o rojão.

O servidor valida posse, estado do jogador, direção finita normalizada e intervalo de 1,2 segundo. A origem é calculada a partir do personagem. A remoção passa pela API transacional antes da transmissão de `firework.shot`; falhas da API não produzem disparos. O equipamento usa `Player.fireworkEquipped`, separado das comidas e bebidas consumidas ao longo do tempo.

O renderer usa um único mesh para rastros e explosões, com limite de doze efeitos simultâneos. Os efeitos se encerram pelo relógio do servidor; sons respeitam o volume geral e a distância, e os recursos são liberados ao sair.

Validação: `tests/integration/fireworks.test.ts`, `apps/api/test/inventory.test.ts`, `apps/server/test/fireworks.integration.test.ts` e o cenário de rojão em `tests/e2e/inventory.spec.ts`.
