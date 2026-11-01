-- Highfood (docs/sistemas/highfood.md): the vehicles players buy on the phone, the deliveries they make and the people they deliver to.
CREATE TABLE IF NOT EXISTS player_vehicles (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model text NOT NULL,
  parts text NOT NULL,
  mileage integer NOT NULL DEFAULT 0 CHECK(mileage>=0),
  bought_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,model)
);
-- The customers' profiles: from here on they belong to the administration. image_id is a picture from the same store as the badges'; without one the app draws the avatar from look.
CREATE TABLE IF NOT EXISTS highfood_customers (
  id text PRIMARY KEY,
  name text NOT NULL,
  skin text NOT NULL,
  look jsonb NOT NULL,
  image_id text REFERENCES badge_images(id) ON DELETE SET NULL,
  lines jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- status: delivered, or how it was lost. Names are copied so the history survives a profile changing.
CREATE TABLE IF NOT EXISTS highfood_deliveries (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id text NOT NULL,
  customer text NOT NULL,
  restaurant text NOT NULL,
  items jsonb NOT NULL,
  address text NOT NULL,
  length_m integer NOT NULL,
  duration_ms integer NOT NULL,
  paid integer NOT NULL DEFAULT 0 CHECK(paid>=0),
  stars smallint,
  on_time boolean NOT NULL DEFAULT false,
  crashes smallint NOT NULL DEFAULT 0,
  status text NOT NULL CHECK(status IN ('delivered','cancelled','gave-up','left')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS highfood_deliveries_user_idx ON highfood_deliveries(user_id,created_at);
INSERT INTO highfood_customers(id,name,skin,look,lines) VALUES
  ('dona-cida','Dona Cida','nathan','{"tone":2,"hair":5,"hairColor":5,"facial":0,"glasses":1,"shirt":3,"bg":0}'::jsonb,'["Ai, meu filho, que bom! Sobe um cafezinho?","Deus te abençoe, {nome}. Vá devagar nessa moto.","Pode deixar comigo. Tá cheirando bem esse {item}!"]'::jsonb),
  ('seu-ademir','Seu Ademir','gilmar-gordo','{"tone":3,"hair":6,"hairColor":5,"facial":2,"glasses":0,"shirt":1,"bg":1}'::jsonb,'["Rapaz, já ia descer pra buscar a pé.","No meu tempo a gente ia na padaria. Mas tá bom, obrigado!","Tá aqui, {nome}. Acerta o passo aí nessa moto, hein."]'::jsonb),
  ('lari-santos','Lari Santos','read','{"tone":4,"hair":2,"hairColor":0,"facial":0,"glasses":0,"shirt":5,"bg":2}'::jsonb,'["Aêee, salvou minha vida! Tô morrendo de fome.","Vou até postar no Highgram, {nome}. Valeu!","Tá aqui! Ah, e cinco estrelas, viu?"]'::jsonb),
  ('joao-pedro','João Pedro','leandro','{"tone":1,"hair":1,"hairColor":1,"facial":0,"glasses":0,"shirt":2,"bg":3}'::jsonb,'["Fala, {nome}! Chegou na hora do jogo, cara.","Boa! Minha mãe pediu pra te agradecer também.","Top demais. Valeu, irmão!"]'::jsonb),
  ('marcia-lima','Márcia Lima','flavio-hipotetico','{"tone":2,"hair":3,"hairColor":2,"facial":0,"glasses":2,"shirt":6,"bg":4}'::jsonb,'["Graças a Deus, estou numa reunião sem fim. Obrigada!","Perfeito, {nome}. Foi rápido.","Muito obrigada. Hoje nem deu tempo de cozinhar."]'::jsonb),
  ('tiao-do-gas','Tião do Gás','rafael','{"tone":4,"hair":0,"hairColor":0,"facial":1,"glasses":0,"shirt":0,"bg":5}'::jsonb,'["Olha só, colega de estrada! Bom trabalho.","Também vivo na rua, {nome}. Cuidado com o buraco da esquina.","Valeu, parceiro. Hoje o almoço saiu tarde."]'::jsonb),
  ('bia-ferreira','Bia Ferreira','read','{"tone":0,"hair":4,"hairColor":3,"facial":0,"glasses":1,"shirt":7,"bg":6}'::jsonb,'["Oba! Era tudo o que eu precisava pra estudar.","Brigada, {nome}! Prova amanhã e eu sem jantar.","Ai, que cheiro bom de {item}!"]'::jsonb),
  ('gui-barbosa','Gui Barbosa','gabriel','{"tone":3,"hair":1,"hairColor":0,"facial":1,"glasses":0,"shirt":4,"bg":7}'::jsonb,'["Salve, {nome}! Tava esperando na calçada mesmo.","Boa, mano. Tá pago pelo app, né?","Chegou! Aí sim. Falou!"]'::jsonb),
  ('dona-lourdes','Dona Lourdes','nathan','{"tone":1,"hair":5,"hairColor":4,"facial":0,"glasses":1,"shirt":6,"bg":1}'::jsonb,'["Que moço educado! Toma cuidado por aí.","Meu neto pediu por mim, ele que entende desse aplicativo.","Obrigada, {nome}. Fica com Deus."]'::jsonb),
  ('nando-pereira','Nando Pereira','leandro','{"tone":5,"hair":0,"hairColor":0,"facial":2,"glasses":0,"shirt":2,"bg":2}'::jsonb,'["Demorou nada! Valeu demais.","Na moral, {nome}, você é fera.","Tô na obra desde cedo. Esse {item} vai cair bem."]'::jsonb),
  ('carol-tavares','Carol Tavares','flavio-hipotetico','{"tone":2,"hair":7,"hairColor":6,"facial":0,"glasses":0,"shirt":5,"bg":3}'::jsonb,'["Uhul! Pode deixar que eu pego. Obrigada!","Salvou o plantão, {nome}.","Ai, que bom. Trabalhei o dia inteiro sem comer."]'::jsonb),
  ('seu-osvaldo','Seu Osvaldo','gilmar-gordo','{"tone":0,"hair":6,"hairColor":4,"facial":3,"glasses":1,"shirt":1,"bg":4}'::jsonb,'["Pontual, gostei. Isso é raro hoje em dia.","Fui motoboy nos anos oitenta, sabia? Boa sorte, {nome}.","Obrigado. Tá conferido, pode ir."]'::jsonb),
  ('rafa-nunes','Rafa Nunes','rafael','{"tone":3,"hair":2,"hairColor":2,"facial":0,"glasses":2,"shirt":3,"bg":5}'::jsonb,'["Show! Tô vendo a final ali dentro, valeu!","Boa, {nome}. Volta logo que amanhã tem mais.","Cheirinho de {item}. Aí sim!"]'::jsonb),
  ('vanessa-rocha','Vanessa Rocha','read','{"tone":4,"hair":3,"hairColor":0,"facial":0,"glasses":0,"shirt":7,"bg":6}'::jsonb,'["Oi! Nossa, chegou antes do que o app falou.","Obrigada, {nome}. As crianças já estavam reclamando.","Pode deixar. Tenha uma boa noite!"]'::jsonb),
  ('beto-da-esquina','Beto da Esquina','gabriel','{"tone":2,"hair":0,"hairColor":1,"facial":2,"glasses":0,"shirt":0,"bg":7}'::jsonb,'["Ô, {nome}! Passa no bar depois, a primeira é por minha conta. Brincadeira.","Tá na mão. Tamo junto!","Valeu, chefia. O Magrão manda um abraço."]'::jsonb),
  ('helena-prado','Helena Prado','flavio-hipotetico','{"tone":1,"hair":4,"hairColor":1,"facial":0,"glasses":1,"shirt":4,"bg":0}'::jsonb,'["Muito obrigada. Vou avaliar bem você.","Que serviço bom, {nome}. Bem embalado.","Obrigada! Trabalhar de casa dá uma fome."]'::jsonb),
  ('ze-carlos','Zé Carlos','leandro','{"tone":3,"hair":6,"hairColor":3,"facial":3,"glasses":0,"shirt":6,"bg":1}'::jsonb,'["Tava vendo você vir lá da esquina! Boa pilotagem.","Agradecido, {nome}. Abraço aí.","É {item}? Então acertou em cheio."]'::jsonb),
  ('nina-azevedo','Nina Azevedo','read','{"tone":5,"hair":2,"hairColor":1,"facial":0,"glasses":0,"shirt":2,"bg":2}'::jsonb,'["Ebaaa! Comida!","Obrigada, {nome}. Você é o herói da noite.","Espera, deixa eu pegar. Pronto, valeu!"]'::jsonb),
  ('seu-jorge','Seu Jorge','gilmar-gordo','{"tone":4,"hair":0,"hairColor":0,"facial":1,"glasses":2,"shirt":3,"bg":3}'::jsonb,'["Boa noite, {nome}. Obrigado pela entrega.","Meu estômago agradece. Vá com cuidado.","Aqui é assim: quem chega com comida é sempre bem-vindo."]'::jsonb),
  ('tati-mendes','Tati Mendes','flavio-hipotetico','{"tone":0,"hair":7,"hairColor":2,"facial":0,"glasses":0,"shirt":1,"bg":4}'::jsonb,'["Ai, finalmente! Brigada, viu?","Tá bem quentinho, {nome}. Amei.","Valeu! Deixei cinco estrelas."]'::jsonb),
  ('caio-moreira','Caio Moreira','gabriel','{"tone":1,"hair":1,"hairColor":3,"facial":1,"glasses":1,"shirt":5,"bg":5}'::jsonb,'["Opa, chegou! Tô no meio de uma partida, valeu!","Boa, {nome}. Até a próxima.","Só falta a sobremesa agora."]'::jsonb),
  ('dona-fatima','Dona Fátima','nathan','{"tone":3,"hair":5,"hairColor":0,"facial":0,"glasses":0,"shirt":7,"bg":6}'::jsonb,'["Ah, que bênção. Entra não, que o cachorro morde.","Muito obrigada, {nome}. Vai com Deus.","Olha, tá caprichado esse {item}!"]'::jsonb),
  ('igor-ramos','Igor Ramos','rafael','{"tone":2,"hair":2,"hairColor":0,"facial":2,"glasses":0,"shirt":4,"bg":7}'::jsonb,'["Tá voando, hein, {nome}! Valeu!","Chegou na hora certa, tô saindo do treino.","Boa! Fica firme aí."]'::jsonb),
  ('sueli-campos','Sueli Campos','read','{"tone":4,"hair":4,"hairColor":5,"facial":0,"glasses":2,"shirt":0,"bg":0}'::jsonb,'["Obrigada, querido. Hoje eu não ia cozinhar nem a pau.","Deixa eu ver… tá tudo certo, {nome}. Valeu!","Vou dormir feliz com esse {item}."]'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO badges(id,name,description,icon,color,rarity) VALUES
  ('entregador-1','Entregador I','Fez 10 entregas pelo Highfood. A primeira a gente nunca esquece.','bike','#aeb6c8','common'),
  ('entregador-2','Entregador II','Fez 100 entregas pelo Highfood. O GPS já pede sua opinião.','bike','#5fd86c','uncommon'),
  ('entregador-3','Entregador III','Fez 500 entregas pelo Highfood. Conhece todo cachorro do bairro.','bike','#17d4f4','rare'),
  ('entregador-4','Entregador IV','Fez 2.000 entregas pelo Highfood. Se a comida chegou, foi você.','bike','#fac416','legendary')
ON CONFLICT (id) DO NOTHING;
