import {ITEM_CATALOG,type ItemId} from './inventory.js';
import {JOBS,JOB_DAILY_CAP,MEDIA_PRICES,STAGE_PASS,type MediaPriceKind} from './economy.js';
import {BLACKJACK} from './blackjack.js';
import {FOOSBALL} from './foosball.js';
import {TRUCO_BET,TRUCO_LEVEL_INFO} from './truco/stakes.js';
import {POOL_BET,POOL_LEVEL_STAKES} from './pool/index.js';
import {DEFAULT_SKIN,SKINS} from './skins.js';
import {SKILLS} from './profile.js';

/**
 * Everything in the game that costs or pays coins, under one key each ("item:coxinha", "media:tv", "job:bar").
 * The code's numbers (and the .env variables that already existed) are the defaults; the administration changes them
 * in the panel's Preços (apps/api/src/pricing-service.ts keeps the overrides). The API answers the effective table to
 * the browser (GET /api/prices) and to the world, which charges and pays with it and tells the players when it changes.
 */
export type PriceGroup='itens'|'skins'|'midia'|'palco'|'jogos'|'trabalho'|'highfood'|'recompensas';
export interface PriceEntry {
  key:string;group:PriceGroup;label:string;
  /** Where the value is used, in the panel's words. */
  hint:string;defaultValue:number;min:number;max:number;
}
export type PriceTable=Readonly<Record<string,number>>;

export const PRICE_GROUPS:ReadonlyArray<{id:PriceGroup;label:string;description:string}>=[
  {id:'itens',label:'Bar e mochila',description:'Bebidas e petiscos: balcão do Magrão, pedidos na mesa e loja da mochila.'},
  {id:'skins',label:'Skins e habilidades',description:'As cartas da coleção e as habilidades dos personagens. Quem já comprou continua com elas.'},
  {id:'midia',label:'Jukebox, TVs e telão',description:'Cobrado a cada vídeo novo colocado no aparelho.'},
  {id:'palco',label:'Palco',description:'Ingresso para subir no palco do quintal.'},
  {id:'jogos',label:'Jogos',description:'Limites de aposta: no blackjack, por mão (dobrar e dividir repetem a aposta); no pebolim, o que cada jogador põe numa partida valendo moedas.'},
  {id:'trabalho',label:'Trabalho',description:'O que o bar paga por tarefa concluída e o teto diário por jogador.'},
  {id:'highfood',label:'Highfood e veículos',description:'A moto, o guincho e o que cada entrega paga. Veja o cálculo em docs/sistemas/highfood.md antes de mexer: é a maior torneira de moedas do jogo.'},
  {id:'recompensas',label:'Recompensas',description:'Moedas que entram na economia sem compra: boas-vindas e bônus diário.'},
];

const MEDIA_LABELS:Record<MediaPriceKind,string>={jukebox:'Jukebox',tv:'TV do salão',telao:'Telão do palco'};
const envKey=(id:string)=>id.toUpperCase().replace(/-/g,'_');

let entries:PriceEntry[]|undefined;
export function priceEntries():readonly PriceEntry[]{
  return entries??=[
    ...ITEM_CATALOG.map(item=>({key:`item:${item.id}`,group:'itens' as const,label:item.name,hint:item.id==='garrafa'||item.id==='copo'?'Balcão, mesa e mochila':item.category==='saude'?'Mochila':item.category==='peca'||item.category==='fogo'?'Loja da casa':'Mesa e mochila',defaultValue:item.price,min:0,max:10_000})),
    ...SKINS.filter(skin=>skin.id!==DEFAULT_SKIN).map(skin=>({key:`skin:${skin.id}`,group:'skins' as const,label:skin.name,hint:'Coleção (C)',defaultValue:skin.price,min:0,max:1_000_000})),
    ...SKILLS.map(skill=>({key:`skill:${skill.id}`,group:'skins' as const,label:skill.name,hint:'Habilidade, na coleção (C)',defaultValue:skill.price,min:0,max:1_000_000})),
    ...(Object.keys(MEDIA_PRICES) as MediaPriceKind[]).map(kind=>({key:`media:${kind}`,group:'midia' as const,label:MEDIA_LABELS[kind],hint:'Por vídeo novo',defaultValue:MEDIA_PRICES[kind],min:0,max:10_000})),
    {key:'stage:pass',group:'palco',label:'Ingresso do palco',hint:`Vale ${STAGE_PASS.durationMs/60_000} minutos`,defaultValue:STAGE_PASS.price,min:0,max:10_000},
    {key:'blackjack:min-bet',group:'jogos',label:'Aposta mínima do blackjack',hint:'Menor aposta por rodada',defaultValue:BLACKJACK.minBet,min:1,max:100_000},
    {key:'blackjack:max-bet',group:'jogos',label:'Aposta máxima do blackjack',hint:'Maior aposta por rodada (nunca abaixo da mínima)',defaultValue:BLACKJACK.maxBet,min:1,max:100_000},
    {key:'foosball:min-bet',group:'jogos',label:'Aposta mínima do pebolim',hint:'Menor valor por jogador numa partida valendo moedas',defaultValue:FOOSBALL.minBet,min:1,max:100_000},
    {key:'foosball:max-bet',group:'jogos',label:'Aposta máxima do pebolim',hint:'Maior valor por jogador (nunca abaixo da mínima)',defaultValue:FOOSBALL.maxBet,min:1,max:100_000},
    {key:'truco:level-iniciante',group:'jogos',label:'Truco: nível Iniciante',hint:'Aposta por pessoa contra NPCs iniciantes',defaultValue:TRUCO_LEVEL_INFO.iniciante.stake,min:1,max:100_000},
    {key:'truco:level-medio',group:'jogos',label:'Truco: nível Médio',hint:'Aposta por pessoa contra NPCs de nível médio',defaultValue:TRUCO_LEVEL_INFO.medio.stake,min:1,max:100_000},
    {key:'truco:level-experiente',group:'jogos',label:'Truco: nível Experiente',hint:'Aposta por pessoa contra NPCs experientes',defaultValue:TRUCO_LEVEL_INFO.experiente.stake,min:1,max:100_000},
    {key:'truco:min-bet',group:'jogos',label:'Aposta mínima do truco entre jogadores',hint:'Menor valor por pessoa, com gente nas duas duplas',defaultValue:TRUCO_BET.minBet,min:1,max:100_000},
    {key:'truco:max-bet',group:'jogos',label:'Aposta máxima do truco entre jogadores',hint:'Maior valor por pessoa (nunca abaixo da mínima)',defaultValue:TRUCO_BET.maxBet,min:1,max:100_000},
    {key:'pool:level-facil',group:'jogos',label:'Sinuca: Juca Iniciante',hint:'Aposta por pessoa contra o Juca da Sinuca iniciante',defaultValue:POOL_LEVEL_STAKES.facil,min:1,max:100_000},
    {key:'pool:level-medio',group:'jogos',label:'Sinuca: Juca Na média',hint:'Aposta por pessoa contra o Juca da Sinuca na média',defaultValue:POOL_LEVEL_STAKES.medio,min:1,max:100_000},
    {key:'pool:level-dificil',group:'jogos',label:'Sinuca: Juca Matador',hint:'Aposta por pessoa contra o Juca da Sinuca matador',defaultValue:POOL_LEVEL_STAKES.dificil,min:1,max:100_000},
    {key:'pool:min-bet',group:'jogos',label:'Aposta mínima da sinuca entre jogadores',hint:'Menor valor por pessoa, com duas pessoas na mesa',defaultValue:POOL_BET.minBet,min:1,max:100_000},
    {key:'pool:max-bet',group:'jogos',label:'Aposta máxima da sinuca entre jogadores',hint:'Maior valor por pessoa (nunca abaixo da mínima)',defaultValue:POOL_BET.maxBet,min:1,max:100_000},
    ...JOBS.map(job=>({key:`job:${job.id}`,group:'trabalho' as const,label:job.name,hint:'Pagamento por tarefa',defaultValue:job.pay,min:0,max:1000})),
    {key:'cap:job-daily',group:'trabalho',label:'Teto diário do trabalho',hint:'Máximo que um jogador ganha trabalhando por dia',defaultValue:JOB_DAILY_CAP,min:0,max:1_000_000},
    {key:'vehicle:moto',group:'highfood',label:'Moto de entrega',hint:'Venda no app HighMotors do celular',defaultValue:10_000,min:0,max:1_000_000},
    {key:'vehicle:moto-fogo',group:'highfood',label:'Caveira em Chamas',hint:'Moto esqueleto com fogo nas rodas, no HighMotors (sem bag de entrega)',defaultValue:25_000,min:0,max:1_000_000},
    {key:'vehicle:carro',group:'highfood',label:'Hatch 80',hint:'Carro de quatro lugares no HighMotors',defaultValue:35_000,min:0,max:1_000_000},
    {key:'vehicle:tow',group:'highfood',label:'Guincho',hint:'Trazer a própria moto até a rua mais perto, pelo celular',defaultValue:30,min:0,max:10_000},
    {key:'highfood:base',group:'highfood',label:'Entrega: valor fixo',hint:'Por entrega, qualquer distância',defaultValue:8,min:0,max:1000},
    {key:'highfood:per-100m',group:'highfood',label:'Entrega: por 100 m de rota',hint:'Medido pelas ruas, de onde o pedido apareceu até o cliente',defaultValue:4,min:0,max:1000},
    {key:'highfood:on-time-pct',group:'highfood',label:'Entrega: bônus no prazo (%)',hint:'Sobre o valor da entrega, chegando dentro do prometido',defaultValue:20,min:0,max:100},
    {key:'highfood:full-per-day',group:'highfood',label:'Entregas por dia a preço cheio',hint:'Depois disso, cada entrega paga a porcentagem abaixo',defaultValue:20,min:0,max:1000},
    {key:'highfood:late-pct',group:'highfood',label:'Pagamento depois disso (%)',hint:'Porcentagem do valor normal',defaultValue:50,min:0,max:100},
    {key:'cap:highfood-daily',group:'highfood',label:'Teto diário do Highfood',hint:'Máximo que um jogador ganha entregando por dia',defaultValue:700,min:0,max:1_000_000},
    {key:'reward:initial',group:'recompensas',label:'Moedas de boas-vindas',hint:'Na primeira vez que a conta abre a carteira',defaultValue:0,min:0,max:1_000_000},
    {key:'reward:daily',group:'recompensas',label:'Bônus diário',hint:'Resgatado uma vez por dia na coleção (0 desativa)',defaultValue:0,min:0,max:1_000_000},
  ];
}
export const priceEntry=(key:string)=>priceEntries().find(entry=>entry.key===key);

/**
 * The defaults with the .env variables that set them before the panel existed (SKIN_PRICE_*, WALLET_INITIAL_COINS,
 * WALLET_DAILY_COINS, PRICE_JUKEBOX/TV/TELAO/STAGE). Invalid or out-of-range values are ignored.
 */
export function defaultPrices(env:Record<string,string|undefined>={}):PriceTable{
  const read=(name:string,entry:PriceEntry)=>{const raw=env[name];if(raw===undefined||raw==='')return undefined;const n=Number(raw);return Number.isSafeInteger(n)&&n>=entry.min&&n<=entry.max?n:undefined;};
  const variable=(entry:PriceEntry)=>{
    const [kind,id]=entry.key.split(':');
    if(kind==='skin')return `SKIN_PRICE_${envKey(id!)}`;
    if(kind==='media')return `PRICE_${envKey(id!)}`;
    return ({'stage:pass':'PRICE_STAGE','reward:initial':'WALLET_INITIAL_COINS','reward:daily':'WALLET_DAILY_COINS'} as Record<string,string>)[entry.key];
  };
  return Object.fromEntries(priceEntries().map(entry=>{const name=variable(entry);return [entry.key,(name?read(name,entry):undefined)??entry.defaultValue];}));
}

export const priceOf=(table:PriceTable,key:string)=>table[key]??priceEntry(key)?.defaultValue??0;
export const itemPrice=(table:PriceTable,item:ItemId|string)=>priceOf(table,`item:${item}`);
/** The jukebox, a TV or the stage screen (the TV whose id is `telao`). */
export const mediaPriceKey=(kind:'jukebox'|'tv',id:string)=>kind==='jukebox'?'media:jukebox':id==='telao'?'media:telao':'media:tv';
/** Keeps only known keys, each clamped to its range: what the API sends is never trusted blindly by the world or the page. */
export function sanitizePrices(raw:unknown):PriceTable{
  const source=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};
  return Object.fromEntries(priceEntries().map(entry=>{const value=source[entry.key];return [entry.key,typeof value==='number'&&Number.isSafeInteger(value)?Math.max(entry.min,Math.min(entry.max,value)):entry.defaultValue];}));
}
