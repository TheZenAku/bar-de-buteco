# Sons das armas: fontes

Tudo aqui é **CC0** (domínio público). O `tools/assets/import-weapon-sounds.mjs` (`npm run assets:weapons:sound`) lê estes arquivos e publica os clipes em `apps/web/public/armas/sons`. A explicação completa está em `docs/assets/armas.md`.

## `ffsl/`: The Free Firearm Sound Library (Still North Media)

Licença, na página do OpenGameArt (https://opengameart.org/content/the-free-firearm-sound-library): *"Our team holds CC0 NO RIGHTS RESERVED for this library. It may be used without royalty or credit (though we would love to hear how you've used our sounds) for any application, personal or professional. Have at it!"*

Os originais são gravações de 96 kHz (a biblioteca "Prepared", arquivos `*P.wav`, no `Prepared SFX Library.7z` do OpenGameArt) ou de 192 kHz/24 bits em estéreo (as "Raw Master Tracks", no archive.org: https://archive.org/details/the-free-firearm-sound-effects-library-by-still-north-media). Cada gravação traz de 2 a 5 tiros (ou manuseios). Para o repositório não crescer centenas de MB, guardamos só **os trechos usados**: `<ID>-<n>.wav` é o n-ésimo evento da gravação `<ID>`, somado em mono e reamostrado para 48 kHz/16 bits, sem ganho nem corte dentro do evento. O trecho começa 40 ms antes do evento e vai até 1,6 s depois (tiros), 2,2 s (tiros de longe) ou 1,3 s (mecânica), com 30 ms de fade no fim. `takes.json` diz de que segundo a que segundo da gravação original veio cada trecho.

| ID | Arma | Gravação | Trechos | Origem |
| --- | --- | --- | --- | --- |
| X_40 | Walther PPQ | gunshot, behind shooter, stereo | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FWalther%20PPQ%2FX_40.wav) |
| V_26 | Smith & Wesson 642 | gunshot, behind shooter, stereo | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FSmith%20%26%20Wesson%20642%2FV_26.wav) |
| G_26 | Carl Gustav M45:Swedish K | gunshot, behind shooter, stereo | 2, 3 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FCarl%20Gustav%20M45%3ASwedish%20K%2FG_26.wav) |
| D_29 | AR-15 | gunshot, behind shooter, stereo | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FAR-15%2FD_29.wav) |
| C_42 | AK-47 | gunshot, behind shooter, stereo | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FAK-47%2FC_42.wav) |
| U_15 | SKS | gunshot, behind shooter, stereo | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FSKS%2FU_15.wav) |
| O_20 | Nova | gunshot, behind shooter, stereo | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FNova%2FO_20.wav) |
| H_20 | Charles Daly | gunshot, behind shooter, stereo | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FCharles%20Daly%2FH_20.wav) |
| I_21 | Marlin 336 | gunshot, behind shooter, stereo | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FMarlin%20336%2FI_21.wav) |
| W_26 | Tikka | gunshot, behind shooter, stereo | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FTikka%2FW_26.wav) |
| X_39P | Walther PPQ | gunshot, near distance, front of shooter, left, right, stereo | 2, 3 | OGA `Prepared SFX Library.7z` |
| V_27P | Smith & Wesson 642 | gunshot, near distance, front of shooter, left, right, stereo | 1, 2 | OGA `Prepared SFX Library.7z` |
| G_31P | Carl Gustav M45 | gunshot, near distance, front of shooter, left, right, stereo | 1, 2 | OGA `Prepared SFX Library.7z` |
| D_32P | AR-15 | gunshot, near distance, front of shooter, left, right, stereo | 1, 2 | OGA `Prepared SFX Library.7z` |
| C_28P | AK-47 | gunshot, near distance, front of shooter, left, right, stereo | 2, 3 | OGA `Prepared SFX Library.7z` |
| U_14P | SKS | gunshot, near distance, front of shooter, left, right, stereo | 1, 2 | OGA `Prepared SFX Library.7z` |
| O_21P | Nova | gunshot, near distance, front of shooter, left, right, stereo | 1, 2 | OGA `Prepared SFX Library.7z` |
| H_21P | CD | gunshot, near distance, front of shooter, left, right, stereo | 1, 2 | OGA `Prepared SFX Library.7z` |
| I_22P | Marlin 336 | gunshot, near distance, front of shooter, left, right, stereo | 1, 2 | OGA `Prepared SFX Library.7z` |
| W_29P | Tikka | gunshot, near distance, front of shooter, left, right, stereo | 1, 2 | OGA `Prepared SFX Library.7z` |
| X_31 | Walther PPQ | gunshot, far distance, front of shooter, forward, back, stereo | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FWalther%20PPQ%2FX_31.wav) |
| V_21 | Smith & Wesson 642 | gunshot, far distance, front of shooter, forward, back, stereo | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FSmith%20%26%20Wesson%20642%2FV_21.wav) |
| G_19 | Carl Gustav M45:Swedish K | gunshot, far distance, front of shooter, forward, back, stereo | 2, 3 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FCarl%20Gustav%20M45%3ASwedish%20K%2FG_19.wav) |
| D_25 | AR-15 | gunshot, far distance, front of shooter, forward, back, stereo | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FAR-15%2FD_25.wav) |
| C_17 | AK-47 | gunshot, far distance, front of shooter, forward, back, stereo | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FAK-47%2FC_17.wav) |
| U_16 | SKS | gunshot, far distance, front of shooter, forward, back, stereo | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FSKS%2FU_16.wav) |
| O_15 | Nova | gunshot, far distance, front of shooter, forward, back, stereo | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FNova%2FO_15.wav) |
| H_17 | Charles Daly | gunshot, far distance, front of shooter, forward, back, stereo | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FCharles%20Daly%2FH_17.wav) |
| I_16 | Marlin 336 | gunshot, far distance, front of shooter, forward, back, stereo | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FMarlin%20336%2FI_16.wav) |
| W_23 | Tikka | gunshot, far distance, front of shooter, forward, back, stereo | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FTikka%2FW_23.wav) |
| X_44 | Walther PPQ | gunshot, behind shooter, stereo, supressed, silenced | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FWalther%20PPQ%2FX_44.wav) |
| X_45 | Walther PPQ | gunshot, near distance, front of shooter, left, right, stereo, supressed, silenced | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FWalther%20PPQ%2FX_45.wav) |
| T_30 | Savage 10 .300 Blackout | gunshot, behind shooter, stereo, supressed, silenced | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FSavage%2010%20.300%20Blackout%2FT_30.wav) |
| T_31 | Savage 10 .300 Blackout | gunshot, near distance, front of shooter, left, right, stereo, supressed, silenced | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FSavage%2010%20.300%20Blackout%2FT_31.wav) |
| T_29 | Savage 10 .300 Blackout | gunshot, near distance, front of shooter, left, right, stereo, supressed, silenced | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FSavage%2010%20.300%20Blackout%2FT_29.wav) |
| X_3 | Walther PPQ | Detach mag | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FWalther%20PPQ%2FX_3.wav) |
| X_4 | Walther PPQ | Insert loaded mag | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FWalther%20PPQ%2FX_4.wav) |
| X_8 | Walther PPQ | Pull back slide loaded mag | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FWalther%20PPQ%2FX_8.wav) |
| X_17 | Walther PPQ | Drop slide loaded mag | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FWalther%20PPQ%2FX_17.wav) |
| X_18 | Walther PPQ | Dry fire from full trigger position | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FWalther%20PPQ%2FX_18.wav) |
| V_14 | Smith & Wesson 642 | flip open cylinder loaded | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FSmith%20%26%20Wesson%20642%2FV_14.wav) |
| V_15 | Smith & Wesson 642 | flip closed cylinder loaded | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FSmith%20%26%20Wesson%20642%2FV_15.wav) |
| V_18 | Smith & Wesson 642 | load cylinder | 2, 3, 5 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FSmith%20%26%20Wesson%20642%2FV_18.wav) |
| V_5 | Smith & Wesson 642 | complete dry fire | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FSmith%20%26%20Wesson%20642%2FV_5.wav) |
| G_9 | Carl Gustav M45:Swedish K | detach empty mag | 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FCarl%20Gustav%20M45%3ASwedish%20K%2FG_9.wav) |
| G_8 | Carl Gustav M45:Swedish K | insert empty mag | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FCarl%20Gustav%20M45%3ASwedish%20K%2FG_8.wav) |
| G_10 | Carl Gustav M45:Swedish K | lock back bolt empty mag | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FCarl%20Gustav%20M45%3ASwedish%20K%2FG_10.wav) |
| D_5 | AR-15 | detach loaded mag | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FAR-15%2FD_5.wav) |
| D_4 | AR-15 | insert loaded mag | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FAR-15%2FD_4.wav) |
| D_14 | AR-15 | full rack loaded mag | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FAR-15%2FD_14.wav) |
| D_13 | AR-15 | drop bolt loaded | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FAR-15%2FD_13.wav) |
| D_20 | AR-15 | safety off | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FAR-15%2FD_20.wav) |
| C_11 | AK-47 | AK-47, rifle, fully automatic, semi automatic, machine gun, assault rifle, 7.62x39, detach empty mag | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FAK-47%2FC_11.wav) |
| C_10 | AK-47 | AK-47, rifle, fully automatic, semi automatic, machine gun, assault rifle, 7.62x39, insert empty mag | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FAK-47%2FC_10.wav) |
| C_14 | AK-47 | AK-47, rifle, fully automatic, semi automatic, machine gun, assault rifle, 7.62x39, full cycle empty mag | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FAK-47%2FC_14.wav) |
| C_6 | AK-47 | AK-47, rifle, fully automatic, semi automatic, machine gun, assault rifle, 7.62x39, switch safe to semi | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FAK-47%2FC_6.wav) |
| C_7 | AK-47 | AK-47, rifle, fully automatic, semi automatic, machine gun, assault rifle, 7.62x39, dry fire | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FAK-47%2FC_7.wav) |
| U_5 | SKS | Norinco SKS, rifle, carbine, semi automatic, 7.62x39, full rack loaded mag | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FSKS%2FU_5.wav) |
| U_6 | SKS | Norinco SKS, rifle, carbine, semi automatic, 7.62x39, dry fire | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FSKS%2FU_6.wav) |
| O_4 | Nova | open action loaded mag | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FNova%2FO_4.wav) |
| O_5 | Nova | close action loaded mag | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FNova%2FO_5.wav) |
| O_3 | Nova | load mag | 1, 2, 4 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FNova%2FO_3.wav) |
| O_8 | Nova | dry fire | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FNova%2FO_8.wav) |
| I_2 | Marlin 336 | lever down loaded mag | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FMarlin%20336%2FI_2.wav) |
| I_4 | Marlin 336 | lever up loaded mag | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FMarlin%20336%2FI_4.wav) |
| I_0 | Marlin 336 | load mag | 1, 2, 6 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FMarlin%20336%2FI_0.wav) |
| I_13 | Marlin 336 | let hammer down | 2, 4 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FMarlin%20336%2FI_13.wav) |
| W_9 | Tikka | Tikka Model T3, rifle, bolt action, .30-06, bolt back loaded mag | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FTikka%2FW_9.wav) |
| W_12 | Tikka | Tikka Model T3, rifle, bolt action, .30-06, bolt forward loaded mag | 1, 2 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FTikka%2FW_12.wav) |
| W_4 | Tikka | Tikka Model T3, rifle, bolt action, .30-06, insert loaded mag | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FTikka%2FW_4.wav) |
| W_5 | Tikka | Tikka Model T3, rifle, bolt action, .30-06, detach loaded mag | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FTikka%2FW_5.wav) |
| W_16 | Tikka | Tikka Model T3, rifle, bolt action, .30-06, full cycle loaded mag | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FTikka%2FW_16.wav) |
| W_13 | Tikka | Tikka Model T3, rifle, bolt action, .30-06, dry fire | 1 | [archive.org](https://archive.org/download/the-free-firearm-sound-effects-library-by-still-north-media/Raw%20Master%20Tracks.zip/Master%20Tracks%2FTikka%2FW_13.wav) |

## `freesound/`: Freesound (CC0 1.0)

Cópias inteiras das prévias "hq" (OGG) baixadas do Freesound. Todos sob **Creative Commons 0** (https://creativecommons.org/publicdomain/zero/1.0/).

| Arquivo | Som | Autor | Página |
| --- | --- | --- | --- |
| 138478.ogg | Bullet Blood 1 | JustInvoke | https://freesound.org/people/JustInvoke/sounds/138478/ |
| 138479.ogg | Bullet Blood 2 | JustInvoke | https://freesound.org/people/JustInvoke/sounds/138479/ |
| 138480.ogg | Bullet Blood 3 | JustInvoke | https://freesound.org/people/JustInvoke/sounds/138480/ |
| 138481.ogg | Bullet Blood 4 | JustInvoke | https://freesound.org/people/JustInvoke/sounds/138481/ |
| 182263.ogg | Foley bullet hit metal 02.wav | martian | https://freesound.org/people/martian/sounds/182263/ |
| 205126.ogg | .30 Shell Bouncing | Danwardvs | https://freesound.org/people/Danwardvs/sounds/205126/ |
| 210018.ogg | Sniper Scope zoom in | Supakid13 | https://freesound.org/people/Supakid13/sounds/210018/ |
| 221528.ogg | Glass Break | unfa | https://freesound.org/people/unfa/sounds/221528/ |
| 318964.ogg | Bouncing Shell Casings (Various Sizes) | GryffDavid | https://freesound.org/people/GryffDavid/sounds/318964/ |
| 319222.ogg | Single Rock hit Dirt.wav | worthahep88 | https://freesound.org/people/worthahep88/sounds/319222/ |
| 319226.ogg | Single rock hitting wood.wav | worthahep88 | https://freesound.org/people/worthahep88/sounds/319226/ |
| 319228.ogg | Single Rock hitting wood 2.wav | worthahep88 | https://freesound.org/people/worthahep88/sounds/319228/ |
| 321478.ogg | Concrete Hit 2 | dslrguide | https://freesound.org/people/dslrguide/sounds/321478/ |
| 351371.ogg | HeavyBulletPing.mp3 | wilhellboy | https://freesound.org/people/wilhellboy/sounds/351371/ |
| 388819.ogg | Holster Pistol | nioczkus | https://freesound.org/people/nioczkus/sounds/388819/ |
| 415304.ogg | Police 357 Pistol Unholster | nioczkus | https://freesound.org/people/nioczkus/sounds/415304/ |
| 505238.ogg | Whizzby | Daleonfire | https://freesound.org/people/Daleonfire/sounds/505238/ |
| 52202.ogg | Single Barreled Shotgun Loading.wav | sentryx86 | https://freesound.org/people/sentryx86/sounds/52202/ |
| 537643.ogg | IR_ST_Street_03.wav | Tim_Verberne | https://freesound.org/people/Tim_Verberne/sounds/537643/ |
| 537675.ogg | IR_ST_Parking_Garage_01.wav | Tim_Verberne | https://freesound.org/people/Tim_Verberne/sounds/537675/ |
| 554148.ogg | Foley_Impact_Stones_Strong_Debris_Stereo_DS.wav | Nox_Sound | https://freesound.org/people/Nox_Sound/sounds/554148/ |
| 569510.ogg | Stone Impact Rubble Debris 14 | Sheyvan | https://freesound.org/people/Sheyvan/sounds/569510/ |
| 569746.ogg | Gravel Stone Dirt Debris Falling Small 1 13 | Sheyvan | https://freesound.org/people/Sheyvan/sounds/569746/ |
| 620929.ogg | empty shotgun shells/casings hitting ground bouncing | Metrolynn | https://freesound.org/people/Metrolynn/sounds/620929/ |
| 688765.ogg | Unholster Gun | qubodup | https://freesound.org/people/qubodup/sounds/688765/ |
| 707791.ogg | Pulling_pistol_from_holster_and_securing_it_back_again_1 | TheGreenEyedGhost | https://freesound.org/people/TheGreenEyedGhost/sounds/707791/ |
| 778021.ogg | Small_Bullet_Spin_Out_Hard_07 | BlondPanda | https://freesound.org/people/BlondPanda/sounds/778021/ |
| 778028.ogg | Small_Bullet_Very_Soft_Hit_07 | BlondPanda | https://freesound.org/people/BlondPanda/sounds/778028/ |
| 789222.ogg | Fly-by whiz SFX (subsonic) | modusmogulus | https://freesound.org/people/modusmogulus/sounds/789222/ |

## `kenney/`: Kenney (CC0 1.0)

Arquivos dos pacotes [Interface Sounds](https://kenney.nl/assets/interface-sounds), [UI Audio](https://kenney.nl/assets/ui-audio) e [Impact Sounds](https://kenney.nl/assets/impact-sounds) de Kenney (www.kenney.nl), sob CC0 (`License.txt` em cada pacote).

- `click3.ogg`
- `confirmation_002.ogg`
- `glass_002.ogg`
- `impactGlass_medium_000.ogg`
- `impactGlass_medium_002.ogg`
- `impactMetal_light_001.ogg`
- `impactMetal_light_003.ogg`
- `impactSoft_medium_001.ogg`
- `impactWood_medium_000.ogg`
- `impactWood_medium_003.ogg`
- `select_002.ogg`
- `switch2.ogg`
- `switch_003.ogg`
- `tick_001.ogg`
- `tick_002.ogg`
- `tick_004.ogg`
