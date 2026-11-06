# Sons dos passos

Os passos acompanham a distância realmente percorrida pelo personagem. Andar e correr usam ritmos e intensidades diferentes; a caminhada com bengala tem passadas menores. Cada impacto sorteia uma das cinco gravações do material, sem repetir a anterior, com pequenas variações de tom e volume.

A mistura dos passos usa 25% do ganho inicial, com agudos mais suaves e entradas e saídas curtas para evitar estalos. A corrida aumenta a cadência e o peso sem elevar o tom da gravação. Variações discretas no comprimento da passada e na intensidade entre os pés suavizam a repetição.

O piso vem do mesmo índice de superfícies usado pelo movimento: asfalto das ruas, concreto das calçadas, cerâmica do bar e da escada, madeira do palco, grama e terra do campinho. O andar superior usa sua própria superfície. Na cidade, canteiros usam grama; interiores de quadras do Jardim Conceição também. Esses últimos usam o bairro do setor como aproximação do material visual. Asfalto, cerâmica e terra usam filtros e ajustes de tom sobre as gravações de concreto e grama.

O som é espacial e segue o volume geral das configurações. Até oito personagens próximos são ouvidos, dentro de 18 m da câmera. Personagens parados, sentados, dançando, montados em veículos ou cavalos, caídos ou em ações específicas não emitem passos. Teleportes e pausas longas descartam o deslocamento acumulado. Ocultar a aba, abrir uma janela que desativa a cena ou sair do jogo interrompe os sons.

As quinze gravações originais são do pacote [Impact Sounds, de Kenney](https://kenney.nl/assets/impact-sounds), sob CC0. Os arquivos e a licença estão em `apps/web/public/footsteps/`; a reprodução está em `engine/footstep-sound.ts`, com a seleção de terreno em `engine/footstep-surface.ts`.

Verificação: `tsx --test tests/integration/footsteps.test.ts` valida os pisos reais do mapa, incluindo rampas e andares sobrepostos. `playwright test --project=footsteps` verifica a saída PCM no navegador, materiais, cadência, parada, teleporte, volume, visibilidade, outras animações e descarte.
