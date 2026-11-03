-- New series start counting with this release. Existing badges and administrator edits stay intact.
INSERT INTO badges(id,name,description,icon,color,rarity) VALUES
  ('mestre-da-sinuca-1','Mestre da Sinuca I','Venceu 1 partida de sinuca, sem W.O. A primeira bola 8 é sua.','pool','#aeb6c8','common'),
  ('mestre-da-sinuca-2','Mestre da Sinuca II','Venceu 10 partidas de sinuca, sem W.O. O Juca já conhece seu taco.','pool','#5fd86c','uncommon'),
  ('mestre-da-sinuca-3','Mestre da Sinuca III','Venceu 50 partidas de sinuca, sem W.O. As tabelas jogam a seu favor.','pool','#17d4f4','rare'),
  ('mestre-da-sinuca-4','Mestre da Sinuca IV','Venceu 200 partidas de sinuca, sem W.O. Lenda do pano verde.','pool','#fac416','legendary'),
  ('rei-do-truco-1','Rei do Truco I','Venceu 1 partida de truco até o fim. A primeira dupla vencedora.','cards','#aeb6c8','common'),
  ('rei-do-truco-2','Rei do Truco II','Venceu 10 partidas de truco até o fim. Já pede seis sem tremer.','cards','#5fd86c','uncommon'),
  ('rei-do-truco-3','Rei do Truco III','Venceu 50 partidas de truco até o fim. Seu blefe virou assunto no bar.','cards','#17d4f4','rare'),
  ('rei-do-truco-4','Rei do Truco IV','Venceu 200 partidas de truco até o fim. Até o zap pede licença.','cards','#fac416','legendary')
ON CONFLICT (id) DO NOTHING;
