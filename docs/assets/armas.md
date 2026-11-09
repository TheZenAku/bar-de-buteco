# Armas: modelos, peças, sons e medidas

Estes são os arquivos das armas de fogo (o sistema está em [docs/sistemas/armas.md](../sistemas/armas.md)): os 10 modelos, as 11 peças (equipamentos), os sons, as fotos da roda e do Arsenal, e as medidas dos corpos que as balas usam. Tudo vem de pacotes **CC0** (domínio público). O CC0 dispensa crédito e permite uso comercial, mas o crédito fica aqui mesmo assim.

## Fontes e licenças

### Modelos

Os zips estão em `assets-bar/armas/fontes`, do jeito que foram baixados. A lista e as licenças estão em `assets-bar/armas/LICENSES.md`.

| Pacote | Autor | Licença | sha256 do zip |
| --- | --- | --- | --- |
| [CC0 Flat Guns West](https://opengameart.org/content/cc0-flat-guns-west) (`flat_guns_west.zip`) | Pichuliru | CC0 | `0e83e670f7c85a2c024887662f5f6ab584daceb5c8a38bac5a3f14a0397a1d29` |
| [CC0 Flat Guns East](https://opengameart.org/content/cc0-flat-guns-east) (`flat_guns_east.zip`) | Pichuliru | CC0 | `3d989ac8e9f0f1f0efe66098fc8f09f31cfadcebb1ed51260201f691946700d4` |
| [CC0 Flat Gun Attachments](https://opengameart.org/content/cc0-flat-gun-attachments) (`flat_attachments.zip`) | Pichuliru | CC0 | `b8831bd8bb26bae1a84a4df2a8c1c3c0ad770909a5ca058a6c44497c5a62bcc1` |
| [Low Poly Guns](https://ankersassets.itch.io/low-poly-guns) (`Low_Poly_Wild_West_Guns.zip`) | Anker's Assets | CC0 | `97a09ee8be6fbe441f29ffb563e624344c68ec95c067c694cca5a85fe64661e1` |

No OpenGameArt, os pacotes da Pichuliru aparecem como "License(s): CC0". Uma das páginas do itch.io diz "Creative Commons Attribution v4.0 International". Por isso o crédito à **Pichuliru** fica registrado aqui. No itch.io, o pacote da Anker's Assets está como "Creative Commons Zero v1.0 Universal".

| Arma (`WeaponId`) | Modelo de origem |
| --- | --- |
| `pistola` | Flat West `Pistol_Full_West` |
| `revolver` | Anker `Colt Revolver` (rigged) |
| `submetralhadora` | Flat West `SMG_Compact_West` |
| `fuzil` | Flat West `Rifle_Assault_West` |
| `fuzil-ak` | Flat East `Rifle_Assault_East` |
| `dmr` | Flat West `Rifle_Battle_West`. O cano longo, de 0,84 m, lê como um fuzil de precisão semiautomático. O East é um AK mais curto. |
| `escopeta` | Flat East `Shotgun_Pump_East` |
| `cano-duplo` | Anker `Double Barrel Shotgun`, reduzido para 1,0 m (×0,74) |
| `carabina` | Anker `Repeater`, reduzido para 0,99 m (o tamanho de uma Marlin 336) |
| `precisao` | Anker `Bolt Action Rfile` (rigged), reduzido para 1,12 m: ferrolho manual de verdade (desde 09/11/2026; antes era o `Sniper_Rifle_West`, de cara semiautomática). O ferrolho e a peça de armar viram um osso só (`Bolt`). |
| `cano-duplo` com Canos serrados | Anker `Sawn-Off Shotgun` (rigged), na mesma escala do cano duplo (×0,741): `cano-duplo-serrado.glb`, em `variants` do meta do cano duplo. |

| Peça (`PartId`) | Modelo de origem |
| --- | --- |
| `reflex`, `red-dot`, `holografica` | `Reflex_West`, `RedDot_West`, `Holographic_West` |
| `acog`, `luneta` | `Magnified_West`, `Scope_West` |
| `silenciador` | `Suppressor_West` |
| `compensador` | **Construído no importador.** Não existe no pacote. É um freio de boca octogonal no estilo flat (166 triângulos): colar, corpo com três janelas escuras de cada lado e a face com o furo. |
| `empunhadura`, `empunhadura-angulada` | `Foregrip_West`, `Foregrip_East` |
| `laser` | `Laser_West`, virado de cabeça para baixo para pendurar sob o trilho |
| `lanterna` | `Flashlight_West` a 0,65: o pacote a desenha com escala 2, o que dava uma lanterna de 14 cm. |
| `carregador-estendido` | Sem modelo próprio. Pistola e submetralhadora: o cliente estica o osso do carregador (`magExtend`). Escopeta e carabina: o tubo do carregador cortado pelo importador (`cutTube`: logo depois da bomba; 3 cm à frente da telha), e a parte da frente vira o osso `TubeLong`, que só aparece com o estendido. Fuzis: tambores construídos no importador (`drum`, osso `MagDrum`): o 7,62 com um tambor redondo com chave de corda, o 5,56 com dois tambores lado a lado (estilo C-Mag). DMR: o carregador do pacote (20) é o estendido; sem ele, o osso fica com metade do comprimento (o de 10). |
| `carregador-rapido` | No revólver é o municiador rápido. Nas armas de carregador de caixa (submetralhadora, fuzis, DMR): puxador de borracha cor de areia no pé do carregador, construído no importador (`puller`, osso `MagPull`), alinhado ao fundo do carregador (inclinado no 7,62). |

### Sons

Todos são CC0. A lista arquivo por arquivo (autor, página, e de que segundo de qual gravação veio cada trecho) está em `assets-bar/sounds/armas/README.md`.

- **The Free Firearm Sound Library** (Still North Media). Licença, na [página do OpenGameArt](https://opengameart.org/content/the-free-firearm-sound-library): *"Our team holds CC0 NO RIGHTS RESERVED for this library. It may be used without royalty or credit (though we would love to hear how you've used our sounds) for any application, personal or professional. Have at it!"* Os tiros "perto" vêm da biblioteca "Prepared" (`Prepared SFX Library.7z` no OpenGameArt). Os tiros ouvidos atrás de quem atira, os de longe, os abafados e a mecânica vêm das gravações brutas ([archive.org](https://archive.org/details/the-free-firearm-sound-effects-library-by-still-north-media)).
- **Freesound**, CC0 1.0: impactos, carne, assobio da bala, cápsulas, sacar e guardar, clique da luneta, respostas ao impulso. São de JustInvoke, worthahep88, Sheyvan, Nox_Sound, dslrguide, martian, wilhellboy, unfa, modusmogulus, Daleonfire, BlondPanda, GryffDavid, Danwardvs, Metrolynn, TheGreenEyedGhost, nioczkus, qubodup, Supakid13, sentryx86 e Tim_Verberne.
- **Kenney** (Interface Sounds, UI Audio, Impact Sounds), CC0: o tique do acerto, a confirmação do abate, cliques da interface e alguns impactos.

| Arma | Atrás de quem atira (`shot`) | Perto (`near`) | Longe (`far`) | Abafado |
| --- | --- | --- | --- | --- |
| `pistola` | Walther PPQ 9 mm (X_40) | X_39P | X_31 | PPQ com silenciador (X_44, X_45) |
| `revolver` | S&W 642 .38 (V_26) | V_27P | V_21 | — |
| `submetralhadora` | Carl Gustav M45 9 mm (G_26) | G_31P | G_19 | o da pistola |
| `fuzil` | AR-15 (D_29) | D_32P | D_25 | Savage .300 BLK (T_30, T_31) |
| `fuzil-ak` | AK-47 (C_42) | C_28P | C_17 | .300 BLK |
| `dmr` | SKS (U_15) | U_14P | U_16 | .300 BLK (T_30, T_29) |
| `escopeta` | Benelli Nova (O_20) | O_21P | O_15 | — |
| `cano-duplo` | Charles Daly 12 (H_20) + Nova mais lenta por baixo | H_21P + O_21P | H_17 | — |
| `carabina` | Marlin 336 (I_21) | I_22P | I_16 | — |
| `precisao` | Tikka T3 .30-06 (W_26) | W_29P | W_23 | .300 BLK |

Para o DMR escolhi o SKS: é semiautomático e soa diferente da Tikka do rifle de precisão, que é de ferrolho. Os tiros abafados de longe não existem gravados. Eles são feitos dos abafados de perto, com um passa-baixa de 1,3 a 1,6 kHz.

**A escolha foi feita por medição, sem ouvir.** Não tenho como escutar áudio, então os sons foram escolhidos pelos metadados (arma, perspectiva) e pela análise de ataque, decaimento, espectro e saturação. Se algum soar mal, troque o trecho na tabela do importador e rode de novo.

## Como os modelos são feitos

O comando é `npm run assets:weapons`. Ele roda `tools/assets/import-weapons.mjs` e depois `render-weapon-icons.mjs`.

- **Espaço da arma:** metros, +Y para cima, o cano para −Z, +X para a direita. A origem fica no punho: o centro da palma direita, no meio da seção do punho, mais ou menos um palmo abaixo do gatilho. Nas armas sem punho de pistola (escopeta, cano duplo, carabina), a origem é o pescoço da coronha, a seção mais fina atrás do guarda-mato.
- **Uma chamada de desenho por arma:** as cores flat viram cores de vértice, com um material só. O vidro das miras é um segundo material, transparente.
- **Ossos:** cada peça que se move é um osso. Os ossos que ninguém anima (seletor, retém, miras de ferro...) foram fundidos no `Body`. Todo osso repousa **sem rotação** no espaço da arma, sobre o seu pivô. Assim o eixo do meta é também o eixo local do osso. Os ossos das Anker foram renomeados (`Hammer`, `Trigger`, `Cylinder`, `Gate`, `Barrels`, `Lever`), e os dois cães do cano duplo viraram um osso só.
- **Pontos medidos na malha:** as seções são cortes dos triângulos por um plano, porque um punho low-poly não tem vértice no meio. Os pontos são o gatilho (centro da tecla), o apoio da mão esquerda (centro da seção do guarda-mão a 17-36 cm do punho, ou da telha da escopeta), a boca (o vértice mais à frente na linha do cano), a janela de ejeção (lado direito do ferrolho), a linha de mira (topo da massa de mira, levado reto até a alça) e a soleira (centro dos últimos centímetros da coronha). As juntas `Attach_*` dos pacotes flat dão as montagens. Nas armas da Anker, as montagens e os pontos foram medidos na malha: a luneta da carabina vai sobre a caixa da culatra, e o trilho da escopeta vai sob o cano, à frente da telha.
- **Peças:** origem no ponto de montagem e orientadas como a arma. A montagem não tem rotação. As peças de trilho ficam penduradas para baixo. Os pontos das peças são `eye` (o eixo da mira na face de trás, sem contar o alívio de olho), `lens` (o vidro mais de trás), `beam` (de onde sai o laser ou a luz) e `muzzle` (a ponta do silenciador ou do compensador).
- O resultado vai para `apps/web/public/armas/modelos/<arma>.glb`, `apps/web/public/armas/pecas/<peça>.glb` e `apps/web/src/weapons/weapon-meta.ts`, que é gerado e não deve ser editado à mão.

### Conferir

`node tools/assets/render-weapon-icons.mjs --sheet folha.png [--only pistola,revolver] [--cell 700x380]` desenha uma folha. Cada arma aparece com seus pontos em bolinhas: punho vermelho, gatilho amarelo, apoio verde, boca laranja, ejeção ciano, mira magenta, soleira azul, montagens brancas, pivôs dos ossos roxos. Também aparecem as peças móveis no fim do curso e cada peça compatível montada. Olhe a folha depois de qualquer mudança.

### Fotos

`npm run assets:weapons:icons` gera as figuras em camadas, `apps/web/public/ui/armas/camadas/<arma>/<camada>.webp` (512×256, todas de uma arma no mesmo enquadramento), e `ui/armas/pecas/<peça>.webp` (256×256). Cada arma tem uma figura base por aparência dela mesma (`base`, uma por carregador, e o modelo trocado, como `canos-serrados`) e uma camada por equipamento de mira, boca e trilho que tem modelo e encaixe. A roda e o Arsenal empilham as camadas conforme o que está instalado (`weaponPicture` em `apps/web/src/weapons/ui/art.ts`), então a figura da arma muda quando se troca um equipamento. As 786 combinações possíveis não são desenhadas uma a uma. Equipamento novo com modelo: rode o comando de novo. O fundo é transparente, com luz de recorte violeta e magenta para as armas quase pretas aparecerem no painel. As fotos são desenhadas com three.js no Edge sem janela. Isso é uma ferramenta offline: o jogo continua sendo PlayCanvas. Os arquivos chegam à página pelo roteamento do Playwright, sem subir servidor.

## Como os sons são feitos

O comando é `npm run assets:weapons:sound` (`tools/assets/import-weapon-sounds.mjs`). O áudio é decodificado no Edge, como nos outros importadores de som.

- As gravações da FFSL vêm com 2 a 5 tiros cada, em 192 kHz/24 bits estéreo. Copiadas inteiras, seriam centenas de MB no Git. Por isso foram cortadas uma vez em **trechos de um evento** (`assets-bar/sounds/armas/ffsl/<ID>-<n>.wav`), somadas em mono e reamostradas para 48 kHz/16 bits. Não houve ganho nem corte dentro do evento. Os trechos ocupam 16,5 MB. O corte foi detectado pelo início do som: RMS de 5 ms acima do pico menos 32 dB, com intervalos de até 0,3 s juntados. O `takes.json` guarda de onde veio cada trecho. Os OGG do Freesound e da Kenney foram copiados inteiros (2,4 MB).
- **Saída:** WAV mono de 16 bits. Tiros perto, tiros atrás de quem atira, impactos, assobios e reverbs ficam em 32 kHz. Tiros de longe, mecânica e interface ficam em 24 kHz: num tiro de longe o ar já levou o que passava de 10 kHz.
- **Início e fim:** cada clipe começa no primeiro instante do som e acaba quando ele morre (48 dB abaixo dos 50 ms mais altos), com fade. O comprimento máximo é 1,1 s para tiros, 1,6 s para tiros de longe, 0,8 s para mecânica e 0,5 s para interface.
- **Volume por categoria:** os 50 ms mais altos são levados ao alvo da categoria, e o pico fica abaixo de −0,3 dBFS. Os tiros passam por um compressor e por um limitador (1,5 ms de antecipação, 8 ms de soltura, no máximo 15 dB). Assim o corpo do estampido carrega o volume, e não só o primeiro estalo: antes disso, tiros de armas diferentes variavam 6 dB entre si. O mix fica para o player.

| Categoria | Clipes | Tamanho | 50 ms mais altos (dBFS) | Pico |
| --- | --- | --- | --- | --- |
| Tiro, atrás de quem atira | 20 | 1376 KiB | −15,9 a −12,0 (alvo −12) | −0,3 |
| Tiro, perto | 20 | 1312 KiB | −12,9 a −12,0 | −0,3 |
| Tiro, longe | 20 | 1426 KiB | −18,2 a −14,0 (alvo −14; os calibres pequenos batem no limite do limitador) | −0,3 |
| Abafado / abafado de longe | 8 / 8 | 392 / 255 KiB | −16,6 a −15,0 / −19,9 a −18,0 | −0,3 |
| Mecânica | 56 | 1664 KiB | −26,1 a −14,0 (cliques sem compressão) | −0,3 |
| Interface, sacar e guardar | 15 | 276 KiB | −23,7 a −15,0 | −0,3 |
| Impactos (7 superfícies) | 26 | 775 KiB | −23,5 a −12,0 | −0,3 |
| Assobio, cápsulas | 3 + 7 | 398 KiB | −13 / −22 a −18 | −2,3 / −0,3 |
| Reverb (rua; garagem curta para dentro do bar) | 2 | 132 KiB | IR normalizada pelo pico | −0,9 |

São **185 clipes e 7,8 MiB ao todo**. O índice gerado é `apps/web/src/weapons/sound-meta.ts`, que não deve ser editado à mão. `--list` mostra clipe por clipe. `--events fs:52202` mostra os eventos de uma fonte; `fs:182263@.06` faz o mesmo juntando intervalos de até 60 ms.

## Medidas dos corpos

O comando é `npm run assets:gun-bodies` (`tools/assets/measure-gun-bodies.mjs`). Ele lê o primeiro quadro do `Idle` de cada banco em `apps/web/public/animations` e escreve `packages/shared/src/weapons/bodies-data.ts`, com as alturas acima dos pés e a largura dos ombros. Gravar esse arquivo reinicia o mundo.

| Skin | quadril | peito | pescoço | cabeça | topo | ombro D | ombros |
| --- | --- | --- | --- | --- | --- | --- | --- |
| flavio-hipotetico | 0,965 | 1,252 | 1,502 | 1,585 | 1,803 | 1,370 | 0,408 |
| gabriel | 0,928 | 1,292 | 1,449 | 1,547 | 1,765 | 1,387 | 0,388 |
| gilmar-gordo | 0,904 | 1,281 | 1,442 | 1,491 | 1,775 | 1,373 | 0,462 |
| leandro | 0,940 | 1,373 | 1,553 | 1,600 | 1,790* | 1,477 | 0,409 |
| magrao | 0,924 | 1,240 | 1,530 | 1,616 | 1,894 | 1,431 | 0,390 |
| nathan | 0,948 | 1,390 | 1,537 | 1,642 | 1,836 | 1,481 | 0,389 |
| primo | 1,007 | 1,348 | 1,494 | 1,590 | 1,824 | 1,395 | 0,376 |
| rafael-rose | 0,911 | 1,239 | 1,392 | 1,500 | 1,776 | 1,347 | 0,389 |
| rafael | 0,904 | 1,197 | 1,441 | 1,532 | 1,760 | 1,341 | 0,389 |
| read | 0,849 | 1,210 | 1,538 | 1,634 | 1,891 | 1,442 | 0,320 |
| tiao | 0,993 | 1,356 | 1,481 | 1,565 | 1,783 | 1,401 | 0,408 |
| tonico | 0,997 | 1,336 | 1,531 | 1,643 | 1,920 | 1,452 | 0,441 |

\* O `head_end` do Leandro fica só 12 cm acima da junta da cabeça. Nos outros rigs essa distância vai de 19 a 28 cm. A ferramenta usa no mínimo 19 cm.
