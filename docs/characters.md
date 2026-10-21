# Personagens personalizados e coleção de skins

O cadastro cria uma sessão e abre imediatamente o criador. É possível personalizar antes da confirmação do e-mail; entrar no bar continua exigindo confirmação quando essa política estiver habilitada. A primeira entrada exige um personagem salvo. Contas antigas sem personagem passam pelo criador uma única vez, preservando conta, estatísticas e moderação.

O personagem gratuito usa os componentes locais de `assets-bar/Universal Base Characters[Standard]`. A [página do autor](https://quaternius.com/packs/universalbasecharacters.html) descreve o pacote completo e os shaders da versão Source; o link singular do itch.io fornecido retornou 404 durante a consulta. Esta integração usa somente os arquivos Standard presentes na pasta:

- Dois corpos, masculino e feminino, com esqueleto Humanoid de 65 juntas.
- Cinco variantes de cabelo: raspado, raspado curto, repartido, longo e coques; além de sem cabelo.
- Sobrancelhas regulares, finas ou ausentes; barba opcional em ambos os corpos.
- Sete tons de pele, oito cores de cabelo/sobrancelhas/barba e cinco cores de olhos.
- Sete cores para a roupa base já pintada no asset. O kit não fornece um guarda-roupa de roupas externas, morphs faciais ou as outras proporções da versão Source; esses controles não são simulados.

A prévia 3D permite girar com arraste ou botões, escolher cores e sortear uma combinação. Alterações só são publicadas ao salvar; fechar o editor descarta a prévia. Na partida, **C → Personalizar** permite editar novamente. **Vestir** alterna entre o personagem gratuito e uma skin adquirida sem apagar a personalização.

## Persistência e autoridade

`user_profiles.character_config` guarda a configuração versionada e validada; `equipped_skin` guarda o que está vestido. A migração `002_characters.sql` acrescenta essas colunas e as tabelas de carteira, coleção e lançamentos sem apagar dados existentes. Todas as migrações continuam idempotentes e são aplicadas ao iniciar a API.

`POST /api/character` aceita somente opções e cores instaladas. `GET /api/wardrobe` retorna personagem, seleção, catálogo, preços, posse e saldo da própria conta. `POST /api/wardrobe/buy` compra uma skin; `POST /api/wardrobe/equip` seleciona uma opção já adquirida ou `custom`. Os corpos internos `base-male` e `base-female` não são skins que o cliente possa equipar por mensagens.

O servidor consulta a API ao entrar e reconectar e revalida durante a partida. Os dados enviados na entrada pelo navegador, incluindo o antigo `bar.skin` do localStorage, não concedem posse nem definem o personagem. `player.skin` também exige autorização persistida, via API interna; `player.appearance` apenas solicita sincronização. O patch público transmite a configuração do personagem e a skin selecionada, sem expor saldo ou inventário. Alterar a configuração não altera movimento, colisões, regras do blackjack, eventos ou moderação. O karatê continua exclusivo de Rafael e a troca visual aguarda o fim do golpe.

## Loja e moeda

Nathan, Leandro, Rafael e Read são skins completas da coleção. Magrão permanece exclusivo do NPC Seu Zé. A compra é permanente, exige conta confirmada e personagem criado e usa uma transação com bloqueio da carteira. A coleção tem chave única por conta/skin. Repetir uma compra não cobra novamente; compras concorrentes não podem produzir saldo negativo. Preço, débito, posse e lançamento vêm do servidor, nunca do formulário.

**A pedido do usuário, os ganhos ficam para uma próxima etapa:** saldo inicial zero e bônus diário desativado. A loja não vende moeda nem usa dinheiro real; o blackjack continua sem apostas. Os preços iniciais são configuráveis:

| Variável | Padrão |
| --- | ---: |
| `CHARACTER_INITIAL_COINS` | 0 |
| `CHARACTER_DAILY_COINS` | 0 |
| `SKIN_PRICE_NATHAN` | 500 |
| `SKIN_PRICE_LEANDRO` | 750 |
| `SKIN_PRICE_RAFAEL` | 1000 |
| `SKIN_PRICE_READ` | 850 |

As duas primeiras opções estão preparadas para futura configuração; permanecem desativadas nesta entrega. O fluxo diário não aparece com valor zero. Não há endpoint público que conceda saldo arbitrário. A infraestrutura do futuro bônus usa um lançamento único por conta/data UTC para impedir resgates duplicados.

As contas de demonstração preparadas explicitamente pelo seed recebem a coleção de teste para conferir animações. Isso não altera o cadastro normal. O seed continua proibido em produção. Os testes de navegador usam serviços e banco separados e concedem **somente às suas contas de teste** 5.000 moedas para exercitar compras; esse valor não é aplicado ao bar em `localhost:5173`.

## Assets e renderização

`npm run assets:characters` executa `tools/import-characters.mjs` e a conversão das ações para os dois corpos. A importação preserva malhas, esqueleto e pesos; adapta Idle/Walk/Pose do Nathan e produz bancos próprios para dança, bebida e assentos. As peças ficam ligadas ao osso da cabeça, acompanhando as animações. Os dados do rig são ordenados por hierarquia e os arquivos gerados são servidos localmente em `public/characters` e `public/animations`.

As texturas compartilhadas são reduzidas para uso no navegador. As cores pintadas são neutralizadas preservando detalhes e uma máscara da roupa base; materiais separados por instância impedem que a mudança de um jogador recolora os outros. O shader dos olhos preserva a região branca. Malhas e texturas são compartilhadas entre instâncias; materiais particulares são liberados ao trocar/remover personagens. O editor tem seu próprio canvas e o libera ao fechar, sem recriar o cenário do jogo.

O mapa pausa a renderização enquanto fica coberto pelo lobby ou pelo editor. A prévia mantém o tamanho definido pelo layout e redimensiona seu buffer ao mudar de desktop para celular; no desktop acompanha a rolagem das opções. Abrir a loja carrega o catálogo e as miniaturas; os modelos completos são carregados quando usados na cena.

O importador usa Three.js offline e Chromium/Edge do Playwright para converter as texturas. O jogo permanece em PlayCanvas. A licença CC0 original do Quaternius é distribuída em `public/characters/LICENSE.txt`. Não são necessários downloads externos durante a execução do jogo.

## Verificação

Os testes de API verificam criação obrigatória, dados inválidos, persistência, posse, saldo zero, ganhos desativados e compras repetidas/concorrentes. Os testes de WebSocket verificam rejeição de seleção forjada na entrada e de skin não adquirida. Os testes de assets verificam peças presas à cabeça, hierarquia, arquivos de textura locais e clipes compatíveis. O teste de navegador cobre cadastro → criador → partida, opções de cor e corpo, prévia em tela estreita, cancelamento, troca para Rafael e retorno ao personagem gratuito, alteração vista por outro cliente e novo login.

Capturas do fluxo real: [criador](previews/character-creator.png) e [personagem na partida](previews/character-in-game.png).

Resultados e escopo das verificações: [validação do criador e da coleção](validation-characters.md).
