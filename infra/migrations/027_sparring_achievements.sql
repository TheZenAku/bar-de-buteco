-- Zeca's sparring series (docs/sistemas/zeca.md): they start counting with this release. Existing badges and administrator edits stay intact.
INSERT INTO badges(id,name,description,icon,color,rarity) VALUES
  ('sparring-1','Sparring do Zeca I','Somou 1 vitória contra o Zeca no terraço. Ele disse que ia pegar leve.','shield','#aeb6c8','common'),
  ('sparring-2','Sparring do Zeca II','Somou 5 vitórias contra o Zeca no terraço. Já sabe onde ele baixa a guarda.','shield','#5fd86c','uncommon'),
  ('sparring-3','Sparring do Zeca III','Somou 25 vitórias contra o Zeca no terraço. O Zeca pede revanche toda vez.','shield','#17d4f4','rare'),
  ('sparring-4','Sparring do Zeca IV','Somou 100 vitórias contra o Zeca no terraço. O terraço tem o seu nome.','shield','#fac416','legendary'),
  ('quebra-queixo-1','Quebra-Queixo I','Somou 1 vitória sobre o Zeca em sua melhor forma. Ele não esperava por essa.','bolt','#aeb6c8','common'),
  ('quebra-queixo-2','Quebra-Queixo II','Somou 5 vitórias sobre o Zeca em sua melhor forma. Aprendeu a ler a guarda dele.','bolt','#5fd86c','uncommon'),
  ('quebra-queixo-3','Quebra-Queixo III','Somou 15 vitórias sobre o Zeca em sua melhor forma. O Zeca já treina pensando em você.','bolt','#17d4f4','rare'),
  ('quebra-queixo-4','Quebra-Queixo IV','Somou 50 vitórias sobre o Zeca em sua melhor forma. Ninguém apanha do Zeca como você bate.','bolt','#fac416','legendary')
ON CONFLICT (id) DO NOTHING;
