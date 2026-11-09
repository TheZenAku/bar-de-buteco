import {z} from 'zod';
import type {Badge,BadgeRarity} from './profile.js';

/** The four levels of every series (docs/sistemas/conquistas.md): what its badge is called and how rare it is. */
export const ACHIEVEMENT_TIERS:readonly {numeral:string;rarity:BadgeRarity}[]=[{numeral:'I',rarity:'common'},{numeral:'II',rarity:'uncommon'},{numeral:'III',rarity:'rare'},{numeral:'IV',rarity:'legendary'}];
type Four<T>=readonly [T,T,T,T];
/** Something players do in the city, counted per player; reaching each goal earns the badge `<id>-<level>`. */
export interface AchievementSeries {
  id:string;name:string;icon:string;
  /** What the player sees counted, in the singular and in the plural. */
  unit:readonly [string,string];
  /** How many reach each level, in `unit`. */
  goals:Four<number>;
  /** How many of the stored counter make one `unit` (metres in a km, seconds in a minute). */
  per?:number;
  /** Repeats closer together than this do not count, for what a key held down could farm. */
  everyMs?:number;
  /** What it counts, `{n}` being the goal with its unit, and one closing line per level, for the badge's description. */
  text:string;lines:Four<string>;
}

export const ACHIEVEMENT_SERIES:readonly AchievementSeries[]=[
  {id:'bebum',name:'Bebum',icon:'beer',unit:['cerveja','cervejas'],goals:[10,50,200,1000],text:'Tomou {n}.',lines:['Já ri de qualquer coisa.','O Magrão já sabe o pedido.','O fígado pediu demissão.','Tem cadeira com o nome no bar.']},
  {id:'boca-nervosa',name:'Boca Nervosa',icon:'food',unit:['petisco','petiscos'],goals:[10,50,200,1000],text:'Comeu {n}.',lines:['Só para forrar o estômago.','Coxinha nenhuma sobra na estufa.','Pede a porção e mais uma.','A cozinha trabalha para você.']},
  {id:'cafeinado',name:'Cafeinado',icon:'bolt',unit:['café','cafés'],goals:[5,25,100,500],text:'Tomou {n} do Seu Zé.',lines:['Para acordar.','Para continuar acordado.','Já não pisca.','Você enxerga sons.']},
  {id:'fumante',name:'Fumante',icon:'smoke',unit:['cigarro','cigarros'],goals:[5,25,100,500],text:'Fumou {n}.',lines:['Só quando bebe.','Só quando não bebe.','O isqueiro é seu e ninguém devolve.','A calçada tem o seu formato.']},
  {id:'bexiga-solta',name:'Bexiga Solta',icon:'toilet',unit:['visita','visitas'],goals:[5,25,100,500],text:'Fez {n} ao banheiro, de bexiga cheia.',lines:['A fila anda.','Já conhece os azulejos.','Tem lugar marcado no mictório.','Patrimônio do banheiro.']},
  {id:'passou-mal',name:'Passou Mal',icon:'dizzy',unit:['vez','vezes'],goals:[1,5,25,100],text:'Passou mal {n} de tanto beber.',lines:['Foi o torresmo, com certeza.','Quem limpa é o Tonico.','Nunca mais. De novo.','O chão do bar te conhece bem.']},
  {id:'apagou',name:'Apagão',icon:'moon',unit:['vez','vezes'],goals:[1,5,25,100],text:'Bebeu até apagar {n}.',lines:['Foi só um cochilo.','Acordou na calçada, de novo.','A calçada já é seu endereço.','Lenda do meio-fio.']},
  {id:'pe-de-valsa',name:'Pé de Valsa',icon:'party',unit:['minuto','minutos'],goals:[5,30,120,600],per:60,text:'Dançou por {n}.',lines:['Dois pra lá, dois pra cá.','Já chama a atenção.','O salão abre espaço.','O bar para quando você dança.']},
  {id:'estrela-do-palco',name:'Estrela do Palco',icon:'mic',unit:['minuto','minutos'],goals:[5,30,120,600],per:60,text:'Tocou no palco por {n}.',lines:['Com o afinador na mão.','Já tem até torcida.','Pedem bis.','Tem fã-clube no quintal.']},
  {id:'mesa-de-luz',name:'Mesa de Luz',icon:'sun',unit:['efeito','efeitos'],goals:[10,50,250,1000],everyMs:5000,text:'Disparou {n} na mesa de luz.',lines:['Apertou para ver o que faz.','Já sabe onde fica o blackout.','Toca a luz no compasso.','O show é seu.']},
  {id:'dj-de-boteco',name:'DJ de Boteco',icon:'music',unit:['vídeo','vídeos'],goals:[5,25,100,500],text:'Pôs {n} para tocar nas telas e na jukebox.',lines:['Só as boas.','Já tem fila.','O bar inteiro canta junto.','A playlist é sua, e pronto.']},
  {id:'ajudante',name:'Ajudante do Magrão',icon:'briefcase',unit:['tarefa','tarefas'],goals:[10,50,250,1000],text:'Fez {n} no turno do bar.',lines:['Pegou o jeito da bandeja.','Sabe onde fica tudo.','O Magrão confia em você.','Sócio, só falta o papel.']},
  {id:'fregues',name:'Freguês',icon:'seat',unit:['pedido','pedidos'],goals:[5,25,100,500],text:'Recebeu {n} na mesa.',lines:['Volta sempre.','Já tem mesa preferida.','Pede sem olhar o cardápio.','Quem manda aqui é o freguês.']},
  {id:'rei-do-21',name:'Rei do 21',icon:'cards',unit:['mão','mãos'],goals:[5,25,100,500],text:'Ganhou {n} no blackjack.',lines:['Sorte de principiante.','Já conta nos dedos.','A banca fica de olho.','A casa nem sempre ganha.']},
  {id:'craque-do-pebolim',name:'Craque do Pebolim',icon:'ball',unit:['partida','partidas'],goals:[1,10,50,200],text:'Venceu {n} de pebolim, sem W.O.',lines:['Valeu o primeiro gol.','O Zé do Totó já te respeita.','Puxada de campeão.','O Zé do Totó pede autógrafo.']},
  {id:'mestre-da-sinuca',name:'Mestre da Sinuca',icon:'pool',unit:['partida','partidas'],goals:[1,10,50,200],text:'Venceu {n} de sinuca, sem W.O.',lines:['A primeira bola 8 é sua.','O Juca já conhece seu taco.','As tabelas jogam a seu favor.','Lenda do pano verde.']},
  {id:'rei-do-truco',name:'Rei do Truco',icon:'cards',unit:['partida','partidas'],goals:[1,10,50,200],text:'Venceu {n} de truco até o fim.',lines:['A primeira dupla vencedora.','Já pede seis sem tremer.','Seu blefe virou assunto no bar.','Até o zap pede licença.']},
  {id:'motoboy',name:'Motoboy',icon:'bike',unit:['km','km'],goals:[1,10,50,250],per:1000,text:'Rodou {n} de moto pela cidade.',lines:['Ainda com rodinhas.','Conhece os atalhos.','Entrega em dez minutos.','As ruas têm o seu nome.']},
  {id:'entregador',name:'Entregador',icon:'bike',unit:['entrega','entregas'],goals:[10,100,500,2000],text:'Fez {n} pelo Highfood.',lines:['A primeira a gente nunca esquece.','O GPS já pede sua opinião.','Conhece todo cachorro do bairro.','Se a comida chegou, foi você.']},
  {id:'barbeiro',name:'Barbeiro',icon:'flame',unit:['batida','batidas'],goals:[1,10,50,200],text:'Foi lançado da moto em {n}.',lines:['Não foi nada.','Quem pôs esse poste aí?','O seguro não atende mais.','Voa melhor do que pilota.']},
  {id:'mecanico',name:'Mecânico',icon:'wrench',unit:['conserto','consertos'],goals:[1,10,50,200],text:'Fez {n} em motos.',lines:['Sobrou um parafuso.','Sabe pelo barulho.','Graxa até o cotovelo.','Motor nenhum morre na sua mão.']},
  {id:'andarilho',name:'Andarilho',icon:'compass',unit:['km','km'],goals:[1,10,50,250],per:1000,text:'Andou {n} a pé.',lines:['Foi até a esquina.','Conhece o bairro.','Conhece a cidade inteira.','Gastou a sola e o mapa.']},
  {id:'frequentador',name:'Frequentador',icon:'clock',unit:['hora','horas'],goals:[1,10,50,200],per:3600,text:'Passou {n} na cidade.',lines:['Só uma passadinha.','Já cumprimenta todo mundo.','Mora aqui, na prática.','Faz parte da mobília.']},
  {id:'resenha',name:'Resenha',icon:'chat',unit:['mensagem','mensagens'],goals:[25,100,500,2000],everyMs:10000,text:'Mandou {n} no chat, com gente por perto para ouvir.',lines:['Puxou assunto.','Tem opinião sobre tudo.','Ninguém consegue ir embora.','Dono da resenha.']},
  {id:'gente-boa',name:'Gente Boa',icon:'hand',unit:['aceno','acenos'],goals:[10,50,200,1000],everyMs:10000,text:'Deu {n} para o pessoal.',lines:['Oi, tudo bem?','Cumprimenta até o Tonico.','Candidato a vereador.','Prefeito informal do bairro.']},
  {id:'fofoqueiro',name:'Fofoqueiro',icon:'messageCircle',unit:['mensagem','mensagens'],goals:[25,100,500,2000],text:'Enviou {n} no Highzap.',lines:['Fiquei sabendo de uma coisa.','Conta tudo, mas não fala que fui eu.','Tem print de tudo.','A central de notícias do bairro.']},
  {id:'influencer',name:'Influencer',icon:'gram',unit:['foto','fotos'],goals:[1,10,50,200],text:'Publicou {n} no Highgram.',lines:['Primeiro post.','Já escolhe o filtro de olhos fechados.','Fotografa antes de beber.','Marca o bar e ganha a saideira.']},
  {id:'pix',name:'Mão Aberta',icon:'transfer',unit:['Pix','Pix'],goals:[1,10,50,200],text:'Enviou {n} pelo HighBank.',lines:['Depois você me paga.','Racha a conta certinho.','Banco informal do bairro.','Todo mundo te deve.']},
  {id:'sparring',name:'Sparring do Zeca',icon:'shield',unit:['vitória','vitórias'],goals:[1,5,25,100],text:'Somou {n} contra o Zeca no terraço.',lines:['Ele disse que ia pegar leve.','Já sabe onde ele baixa a guarda.','O Zeca pede revanche toda vez.','O terraço tem o seu nome.']},
  {id:'quebra-queixo',name:'Quebra-Queixo',icon:'bolt',unit:['vitória','vitórias'],goals:[1,5,15,50],text:'Somou {n} sobre o Zeca em sua melhor forma.',lines:['Ele não esperava por essa.','Aprendeu a ler a guarda dele.','O Zeca já treina pensando em você.','Ninguém apanha do Zeca como você bate.']},
  {id:'telefonista',name:'Telefonista',icon:'phone',unit:['ligação','ligações'],goals:[1,10,50,200],text:'Falou em {n}, de pelo menos 15 segundos.',lines:['Alô?','Liga em vez de escrever.','Fala até com a bateria no fim.','Nunca dá ocupado. Quase nunca.']},
];

export const achievementSeries=(id:string):AchievementSeries|undefined=>ACHIEVEMENT_SERIES.find(series=>series.id===id);
export const achievementBadgeId=(series:string,level:number):string=>`${series}-${level+1}`;
const stored=(series:AchievementSeries,level:number):number=>series.goals[level]!*(series.per??1);
/** The levels a counter going from `before` to `after` passes. Only those: a badge taken away is not given back by the next beer. */
export function crossedLevels(series:AchievementSeries,before:number,after:number):number[]{
  return ACHIEVEMENT_TIERS.flatMap((_,level)=>before<stored(series,level)&&after>=stored(series,level)?[level]:[]);
}
/** The series and level a badge belongs to; undefined for one created in the administration. */
export function achievementOfBadge(id:string|undefined):{series:AchievementSeries;level:number}|undefined {
  const match=id?/^(.+)-([1-4])$/.exec(id):null,series=match&&achievementSeries(match[1]!);
  return series?{series,level:Number(match![2])-1}:undefined;
}
/** `10 cervejas`, `1 km`. */
export const achievementAmount=(series:AchievementSeries,amount:number):string=>`${amount.toLocaleString('pt-BR')} ${series.unit[amount===1?0:1]}`;
/** The badge of each level as it comes with the game; afterwards it belongs to the administration, which can edit it. */
export function achievementBadges():Array<Omit<Badge,'image'>>{
  return ACHIEVEMENT_SERIES.flatMap(series=>ACHIEVEMENT_TIERS.map((tier,level)=>({
    id:achievementBadgeId(series.id,level),name:`${series.name} ${tier.numeral}`,icon:series.icon,rarity:tier.rarity,
    color:tier.rarity==='common'?'#aeb6c8':tier.rarity==='uncommon'?'#5fd86c':tier.rarity==='rare'?'#17d4f4':'#fac416',
    description:`${series.text.replace('{n}',achievementAmount(series,series.goals[level]!))} ${series.lines[level]}`,
  })));
}

/** What the items count for, by the whole item: half a beer is half a beer towards the next. */
const ITEM_SERIES:Readonly<Record<string,string>>={garrafa:'bebum',copo:'bebum',coxinha:'boca-nervosa',pastel:'boca-nervosa',torresmo:'boca-nervosa',cafe:'cafeinado'};
export const seriesOfItem=(item:string):string|undefined=>ITEM_SERIES[item];
/** A real toilet visit needs at least this in the bladder; an empty one counts for nothing. */
export const ACHIEVEMENT_BLADDER_MIN=10;
/** How long a phone call lasts before it counts. */
export const ACHIEVEMENT_CALL_MS=15_000;

export interface AchievementEvent {userId:string;series:string;amount:number}
export const achievementReportSchema=z.object({
  events:z.array(z.object({userId:z.string().min(1).max(64),series:z.string().min(1).max(40),amount:z.number().int().min(1).max(1_000_000)}).strict()).max(2000),
  online:z.array(z.string().min(1).max(64)).max(512),
}).strict();
/** One series as its player sees it (GET /api/profile/achievements), `value` in its unit. */
export interface AchievementView {id:string;name:string;unit:readonly [string,string];value:number;tiers:Array<{goal:number;badge:Badge;owned:boolean}>}
