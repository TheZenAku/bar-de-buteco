import {z} from 'zod';
import type {OwnedVehicle} from './garage.js';
import type {PriceTable} from './prices.js';
import {priceOf} from './prices.js';

/**
 * Highfood (docs/sistemas/highfood.md): deliveries on an owned bike or Tião's purchased horse. The room runs the shift and the order
 * (apps/server/src/world/highfood.ts), the API keeps the money, the history and the customers' profiles (apps/api/src/highfood-service.ts).
 */
export const HIGHFOOD={
  /** Where a shift starts: the spot the administration chose standing there (2026-11-01). */
  BASE:{x:-3.99,y:0,z:-13.97,rotation:1.594},
  /** How far from the base's centre the ring can be used. */
  BASE_REACH:1.6,
  /** How long a new order takes to come up after the last one ended (a good rating shortens it, a bad one stretches it). */
  WAIT_MIN_MS:25_000,WAIT_MAX_MS:70_000,
  /** How long an order waits for an answer in the app, and how many ignored in a row take the player offline. */
  OFFER_MS:45_000,MAX_IGNORED:3,
  /** The phone vibrates this often while an order is waiting and has not been seen. */
  BUZZ_EVERY_MS:9_000,
  /** How far the next customer is: in a straight line, then along the streets (what the pay is measured by). */
  SPOT_MIN:80,SPOT_MAX:420,ROUTE_MIN:110,ROUTE_MAX:620,
  /** The promise to the customer: the time to get going plus the way at this speed (m/s). */
  PROMISE_START_MS:30_000,PROMISE_SPEED:7.5,
  /** Past this many times the promise, the customer gives up and the order is lost. */
  GIVE_UP_FACTOR:3,
  /** How close to a pickup point's middle (metres, on the side its screen faces) the code can be typed. */
  PICKUP_REACH:2.2,
  /** What the promise allows at the pickup point: getting off, walking up, finding the code in the app, typing it. */
  PICKUP_MS:20_000,
  /** From this close to the customer (metres) the bag can come out of the box. */
  UNLOAD_REACH:35,
  /** How close to the customer the player hands it over (metres). */
  HAND_REACH:1.9,
  /** How long the bag takes to come out of the box or the locker, and the customer stays after getting it (ms). */
  UNLOAD_MS:2000,HANDOVER_MS:1200,THANK_MS:3000,LEAVE_MS:9000,
  /** The customer's patience at the dialog before it closes by itself. */
  DIALOG_MS:60_000,
  /** The box in this state or worse lets the food get knocked about. */
  BOX_WORN:35,
  /** Metres between marks of wear on an owned bike: tyres, brakes and so on go down with use and are mended with parts (moto-parts.ts). */
  WEAR_EVERY_M:300,
  /** A bike of someone who left stays on the map for this long, in case they come back. */
  ABSENT_OWNER_MS:60_000,
} as const;

export const HIGHFOOD_NPC_PREFIX='cliente-';
export const isCustomerNpc=(id:string)=>id.startsWith(HIGHFOOD_NPC_PREFIX);
export const inHighfoodBase=(position:{x:number;z:number;y?:number},slack=0)=>Math.abs((position.y??0)-HIGHFOOD.BASE.y)<.6&&Math.hypot(position.x-HIGHFOOD.BASE.x,position.z-HIGHFOOD.BASE.z)<=HIGHFOOD.BASE_REACH+slack;
/** Standing at a pickup point's screen: near it and on the side it faces, not behind the locker. */
export const atPickup=(point:{x:number;z:number;frontX:number;frontZ:number},position:{x:number;z:number},slack=0)=>{
  const dx=position.x-point.x,dz=position.z-point.z;
  return Math.hypot(dx,dz)<=HIGHFOOD.PICKUP_REACH+slack&&dx*point.frontX+dz*point.frontZ>0;
};
export const MOTO_MODEL='moto-delivery';
export const MOTO_NAME='Highland Bar Delivery';

/** What a delivery's outcome depends on, measured by the room. */
export interface DeliveryFacts {
  /** Metres along the streets from the pickup point the order was offered from. */
  length:number;
  /** Delivered within the promise. */
  onTime:boolean;
  /** Times the rider was thrown off with the order on board. */
  crashes:number;
  /** The box was worn out. */
  wornBox:boolean;
}
/** Each crash takes this much from the order's value, and no more than this in all. */
const CRASH_LOSS=.25,MOST_LOST=.5,WORN_BOX_LOSS=.15;
export interface DeliveryPay {base:number;distance:number;bonus:number;lost:number;total:number;reduced:boolean}
/**
 * What a delivery pays, from the price table. `fullToday`: how many the player has done today; past `highfood:full-per-day` the
 * pay falls to `highfood:late-pct` percent. The daily ceiling (cap:highfood-daily) is the API's to apply, against the ledger.
 */
export function deliveryPay(prices:PriceTable,facts:DeliveryFacts,fullToday:number):DeliveryPay {
  const base=priceOf(prices,'highfood:base'),distance=Math.round(facts.length/100*priceOf(prices,'highfood:per-100m'));
  const value=base+distance,bonus=facts.onTime?Math.round(value*priceOf(prices,'highfood:on-time-pct')/100):0;
  const share=Math.min(MOST_LOST,facts.crashes*CRASH_LOSS+(facts.wornBox?WORN_BOX_LOSS:0)),lost=Math.round(value*share);
  const reduced=fullToday>=priceOf(prices,'highfood:full-per-day'),before=Math.max(0,value+bonus-lost);
  return {base,distance,bonus,lost,total:reduced?Math.round(before*priceOf(prices,'highfood:late-pct')/100):before,reduced};
}
/** The customer's stars, 1 to 5. */
export function deliveryStars(facts:DeliveryFacts):number {
  return Math.max(1,5-(facts.onTime?0:1)-Math.min(2,facts.crashes)-(facts.wornBox?1:0));
}
/** A rating of 4.5 or more brings orders a little sooner, one under 3.5 keeps them away longer. It never changes what they pay. */
export const ratingWait=(rating:number)=>rating>=4.5?.85:rating<3.5?1.3:1;
/** Levels by deliveries done, for the profile in the app. */
export const COURIER_LEVELS:ReadonlyArray<readonly [number,string]>=[[0,'Novato'],[10,'Entregador'],[50,'Experiente'],[150,'Veterano'],[400,'Lenda das ruas']];
export const courierLevel=(deliveries:number)=>{
  let index=0;
  COURIER_LEVELS.forEach(([from],i)=>{if(deliveries>=from)index=i;});
  const next=COURIER_LEVELS[index+1];
  return {name:COURIER_LEVELS[index]![1],from:COURIER_LEVELS[index]![0],next:next?.[0],nextName:next?.[1]};
};

/** Restaurants of the city and what people order from them. Made up. */
export const HIGHFOOD_RESTAURANTS:ReadonlyArray<{name:string;kind:string;items:readonly string[]}>=[
  {name:'Pastelaria do Tio Akira',kind:'Pastel',items:['Pastel de carne','Pastel de queijo','Pastel de frango com catupiry','Caldo de cana','Pastel de pizza']},
  {name:'Cantina da Nonna Rosa',kind:'Italiana',items:['Lasanha à bolonhesa','Nhoque ao sugo','Espaguete ao alho e óleo','Polpetone','Tiramisù']},
  {name:'Burguer do Bigode',kind:'Lanches',items:['X-tudo','X-salada','X-bacon duplo','Batata com cheddar','Milk-shake de morango']},
  {name:'Pizzaria Forno Velho',kind:'Pizza',items:['Pizza de calabresa','Pizza portuguesa','Pizza meia muçarela','Pizza de frango','Guaraná 2 litros']},
  {name:'Marmitaria da Dona Neide',kind:'Marmita',items:['Marmita de feijoada','Marmita de bife acebolado','Marmita fit de frango','Porção de farofa','Pudim de leite']},
  {name:'Sushi do Bairro',kind:'Japonesa',items:['Combinado de 20 peças','Temaki de salmão','Hot roll','Yakissoba de carne','Guioza']},
  {name:'Açaí da Praça',kind:'Açaí',items:['Açaí de 500 ml','Açaí com banana','Cupuaçu de 300 ml','Tigela com granola','Vitamina de açaí']},
  {name:'Espetinho do Gaúcho',kind:'Churrasco',items:['Espetinho de picanha','Espetinho de frango','Pão de alho','Queijo coalho','Vinagrete']},
  {name:'Padaria Pão Quente',kind:'Padaria',items:['Pão na chapa','Misto quente','Café com leite','Bolo de fubá','Coxinha de frango']},
  {name:'Tapioca da Lagoa',kind:'Nordestina',items:['Tapioca de carne de sol','Baião de dois','Cuscuz com ovo','Macaxeira frita','Suco de cajá']},
];

/** What a generated avatar looks like (apps/web/src/highfood/npc-avatar.ts): indexes into its palettes and styles, the same for everyone. */
export interface CustomerLook {tone:number;hair:number;hairColor:number;facial:number;glasses:number;shirt:number;bg:number}
/** A customer as the room and the app use them. `image`: the picture sent in the administration (the same store as the badges'), else the generated avatar. */
export interface CustomerProfile {id:string;name:string;skin:string;look:CustomerLook;image:string|null;lines:string[];active:boolean}
export const customerLookSchema=z.object({tone:z.number().int().min(0).max(5),hair:z.number().int().min(0).max(7),hairColor:z.number().int().min(0).max(6),facial:z.number().int().min(0).max(3),glasses:z.number().int().min(0).max(2),shirt:z.number().int().min(0).max(7),bg:z.number().int().min(0).max(7)}).strict();
export const customerSaveSchema=z.object({
  id:z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
  name:z.string().trim().min(2).max(40),skin:z.string().min(1).max(32),look:customerLookSchema,
  image:z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  lines:z.array(z.string().trim().min(3).max(180)).min(1).max(8),active:z.boolean(),reason:z.string().trim().min(3).max(500),
}).strict();
/** What the API sends about the customers: anything malformed is left out, and the room keeps who it knows if nothing is left. */
export function sanitizeCustomers(raw:unknown):CustomerProfile[] {
  const list=Array.isArray(raw)?raw:[];
  return list.flatMap(entry=>{
    const person=entry as Partial<CustomerProfile>,look=customerLookSchema.safeParse(person?.look);
    return typeof person?.id==='string'&&typeof person.name==='string'&&typeof person.skin==='string'&&look.success&&Array.isArray(person.lines)&&person.lines.every(line=>typeof line==='string')?
      [{id:person.id,name:person.name,skin:person.skin,look:look.data,image:typeof person.image==='string'?person.image:null,lines:person.lines,active:person.active!==false}]:[];
  });
}
/** {nome}: whoever delivers; {item}: the first thing in the order. */
export const fillLine=(line:string,courier:string,item:string)=>line.replace(/\{nome\}/g,courier).replace(/\{item\}/g,item.toLowerCase());
/** Lines any customer may fall back on. */
export const HIGHFOOD_LINES:readonly string[]=['Opa, até que enfim! A fome já estava apertando.','Valeu, {nome}! Cheguei a achar que tinha esquecido de mim.','Chegou quentinho? Tava doido por {item}.','Boa, {nome}. Vai com Deus e cuidado no trânsito.'];

/** Where an order is collected: the locker, where to stand and where the bike stops; `length`: metres along the streets from the courier. */
export interface HighfoodPickupView {x:number;y:number;z:number;frontX:number;frontZ:number;standX:number;standZ:number;parkX:number;parkZ:number;address:string;neighbourhood:string;length:number}
/** The offer in the app and the order under way. */
export interface HighfoodCustomerView {id:string;name:string;look:CustomerLook;image:string|null}
export interface HighfoodOrderView {
  id:string;customer:HighfoodCustomerView;restaurant:string;kind:string;items:string[];
  address:string;neighbourhood:string;place:string;
  x:number;y:number;z:number;parkX:number;parkZ:number;
  pickup:HighfoodPickupView;
  /** The four digits typed at the pickup point. Empty until the order is accepted. */
  code:string;
  /** Metres along the streets from the pickup point when it came up, and what it should pay (before crashes and lateness). */
  length:number;pay:number;
  /** When the offer stops waiting (offers) and when the promise runs out (orders under way), server clock. */
  expiresAt:number;promiseAt:number;
  /** The rider crashed this many times carrying it. */
  crashes:number;
  /** Where the bag travels. Older orders without this field use the bike's box. */
  transport?:'moto'|'horse';
  /** pickup: heading to the locker; collect: collecting; going: stored in the box or backpack; unload: taking it out; carrying: in hand. */
  stage:'pickup'|'collect'|'going'|'unload'|'carrying';
}
export type HighfoodStatus='off'|'waiting'|'offer'|'order';
/** What the room tells its courier, whenever it changes. */
export interface HighfoodState {status:HighfoodStatus;since:number;offer?:HighfoodOrderView;order?:HighfoodOrderView;done:number;earned:number;nextAt?:number;horseAvailable?:boolean}
/** The pickup point's screen is open for this order. */
export interface HighfoodLockerView {orderId:string}
/** The dialog when handing over. */
export interface HighfoodDialog {orderId:string;customer:HighfoodCustomerView;line:string;items:string[];restaurant:string}
/** The receipt after handing over. */
export interface HighfoodReceipt {orderId:string;pay:DeliveryPay;paid:number;stars:number;balance?:number;customer:string;capped:boolean;line:string}

/** Room messages. */
export const foodOrderSchema=z.object({orderId:z.string().uuid()}).strict();
export const foodEmptySchema=z.object({}).strict();
export const foodCodeSchema=z.object({orderId:z.string().uuid(),code:z.string().regex(/^\d{4}$/)}).strict();
/** What the world asks the API to record and pay. */
export const highfoodCompleteSchema=z.object({
  userId:z.string().uuid(),orderId:z.string().uuid(),customerId:z.string().max(40),customer:z.string().max(40),restaurant:z.string().max(60),items:z.array(z.string().max(60)).max(4),address:z.string().max(90),
  length:z.number().finite().min(0).max(2000),durationMs:z.number().int().min(0).max(86_400_000),onTime:z.boolean(),crashes:z.number().int().min(0).max(20),wornBox:z.boolean(),
}).strict();
export const highfoodCancelSchema=z.object({userId:z.string().uuid(),orderId:z.string().uuid(),customerId:z.string().max(40),customer:z.string().max(40),restaurant:z.string().max(60),items:z.array(z.string().max(60)).max(4),address:z.string().max(90),length:z.number().finite().min(0).max(2000),reason:z.enum(['cancelled','gave-up','left'])}).strict();
/** The app's views (GET /api/highfood). */
export interface HighfoodHistoryEntry {id:string;customer:string;customerId:string;restaurant:string;items:string[];address:string;length:number;paid:number;stars:number|null;status:'delivered'|'cancelled'|'gave-up'|'left';at:number;durationMs:number}
export interface HighfoodDay {day:string;count:number;earned:number}
export interface HighfoodView {
  deliveries:number;earnedTotal:number;rating:number|null;ratings:number;onTimeShare:number|null;
  today:{count:number;earned:number;cap:number;fullLeft:number;lateShare:number};
  week:HighfoodDay[];recent:HighfoodHistoryEntry[];
  /** Pictures for the customers named in `recent`. */
  customers:Record<string,{look:CustomerLook;image:string|null;name:string}>;
}
/** What HighMotors shows: the model for sale and the vehicles whose key this player holds. */
export interface VehicleView {
  models?:import('./vehicle-models.js').VehicleOffer[];
  model:string;name:string;price:number;tow:number;owned:boolean;limit:number;vehicles:OwnedVehicle[];
}

/** Everybody the city's deliveries go to, as they come with the game; from then on the administration edits them (docs/sistemas/highfood.md). */
export const HIGHFOOD_CUSTOMERS:ReadonlyArray<Omit<CustomerProfile,'image'|'active'>>=[
  {id:'dona-cida',name:'Dona Cida',skin:'nathan',look:{tone:2,hair:5,hairColor:5,facial:0,glasses:1,shirt:3,bg:0},lines:['Ai, meu filho, que bom! Sobe um cafezinho?','Deus te abençoe, {nome}. Vá devagar nessa moto.','Pode deixar comigo. Tá cheirando bem esse {item}!']},
  {id:'seu-ademir',name:'Seu Ademir',skin:'gilmar-gordo',look:{tone:3,hair:6,hairColor:5,facial:2,glasses:0,shirt:1,bg:1},lines:['Rapaz, já ia descer pra buscar a pé.','No meu tempo a gente ia na padaria. Mas tá bom, obrigado!','Tá aqui, {nome}. Acerta o passo aí nessa moto, hein.']},
  {id:'lari-santos',name:'Lari Santos',skin:'read',look:{tone:4,hair:2,hairColor:0,facial:0,glasses:0,shirt:5,bg:2},lines:['Aêee, salvou minha vida! Tô morrendo de fome.','Vou até postar no Highgram, {nome}. Valeu!','Tá aqui! Ah, e cinco estrelas, viu?']},
  {id:'joao-pedro',name:'João Pedro',skin:'leandro',look:{tone:1,hair:1,hairColor:1,facial:0,glasses:0,shirt:2,bg:3},lines:['Fala, {nome}! Chegou na hora do jogo, cara.','Boa! Minha mãe pediu pra te agradecer também.','Top demais. Valeu, irmão!']},
  {id:'marcia-lima',name:'Márcia Lima',skin:'flavio-hipotetico',look:{tone:2,hair:3,hairColor:2,facial:0,glasses:2,shirt:6,bg:4},lines:['Graças a Deus, estou numa reunião sem fim. Obrigada!','Perfeito, {nome}. Foi rápido.','Muito obrigada. Hoje nem deu tempo de cozinhar.']},
  {id:'tiao-do-gas',name:'Tião do Gás',skin:'rafael',look:{tone:4,hair:0,hairColor:0,facial:1,glasses:0,shirt:0,bg:5},lines:['Olha só, colega de estrada! Bom trabalho.','Também vivo na rua, {nome}. Cuidado com o buraco da esquina.','Valeu, parceiro. Hoje o almoço saiu tarde.']},
  {id:'bia-ferreira',name:'Bia Ferreira',skin:'read',look:{tone:0,hair:4,hairColor:3,facial:0,glasses:1,shirt:7,bg:6},lines:['Oba! Era tudo o que eu precisava pra estudar.','Brigada, {nome}! Prova amanhã e eu sem jantar.','Ai, que cheiro bom de {item}!']},
  {id:'gui-barbosa',name:'Gui Barbosa',skin:'gabriel',look:{tone:3,hair:1,hairColor:0,facial:1,glasses:0,shirt:4,bg:7},lines:['Salve, {nome}! Tava esperando na calçada mesmo.','Boa, mano. Tá pago pelo app, né?','Chegou! Aí sim. Falou!']},
  {id:'dona-lourdes',name:'Dona Lourdes',skin:'nathan',look:{tone:1,hair:5,hairColor:4,facial:0,glasses:1,shirt:6,bg:1},lines:['Que moço educado! Toma cuidado por aí.','Meu neto pediu por mim, ele que entende desse aplicativo.','Obrigada, {nome}. Fica com Deus.']},
  {id:'nando-pereira',name:'Nando Pereira',skin:'leandro',look:{tone:5,hair:0,hairColor:0,facial:2,glasses:0,shirt:2,bg:2},lines:['Demorou nada! Valeu demais.','Na moral, {nome}, você é fera.','Tô na obra desde cedo. Esse {item} vai cair bem.']},
  {id:'carol-tavares',name:'Carol Tavares',skin:'flavio-hipotetico',look:{tone:2,hair:7,hairColor:6,facial:0,glasses:0,shirt:5,bg:3},lines:['Uhul! Pode deixar que eu pego. Obrigada!','Salvou o plantão, {nome}.','Ai, que bom. Trabalhei o dia inteiro sem comer.']},
  {id:'seu-osvaldo',name:'Seu Osvaldo',skin:'gilmar-gordo',look:{tone:0,hair:6,hairColor:4,facial:3,glasses:1,shirt:1,bg:4},lines:['Pontual, gostei. Isso é raro hoje em dia.','Fui motoboy nos anos oitenta, sabia? Boa sorte, {nome}.','Obrigado. Tá conferido, pode ir.']},
  {id:'rafa-nunes',name:'Rafa Nunes',skin:'rafael',look:{tone:3,hair:2,hairColor:2,facial:0,glasses:2,shirt:3,bg:5},lines:['Show! Tô vendo a final ali dentro, valeu!','Boa, {nome}. Volta logo que amanhã tem mais.','Cheirinho de {item}. Aí sim!']},
  {id:'vanessa-rocha',name:'Vanessa Rocha',skin:'read',look:{tone:4,hair:3,hairColor:0,facial:0,glasses:0,shirt:7,bg:6},lines:['Oi! Nossa, chegou antes do que o app falou.','Obrigada, {nome}. As crianças já estavam reclamando.','Pode deixar. Tenha uma boa noite!']},
  {id:'beto-da-esquina',name:'Beto da Esquina',skin:'gabriel',look:{tone:2,hair:0,hairColor:1,facial:2,glasses:0,shirt:0,bg:7},lines:['Ô, {nome}! Passa no bar depois, a primeira é por minha conta. Brincadeira.','Tá na mão. Tamo junto!','Valeu, chefia. O Magrão manda um abraço.']},
  {id:'helena-prado',name:'Helena Prado',skin:'flavio-hipotetico',look:{tone:1,hair:4,hairColor:1,facial:0,glasses:1,shirt:4,bg:0},lines:['Muito obrigada. Vou avaliar bem você.','Que serviço bom, {nome}. Bem embalado.','Obrigada! Trabalhar de casa dá uma fome.']},
  {id:'ze-carlos',name:'Zé Carlos',skin:'leandro',look:{tone:3,hair:6,hairColor:3,facial:3,glasses:0,shirt:6,bg:1},lines:['Tava vendo você vir lá da esquina! Boa pilotagem.','Agradecido, {nome}. Abraço aí.','É {item}? Então acertou em cheio.']},
  {id:'nina-azevedo',name:'Nina Azevedo',skin:'read',look:{tone:5,hair:2,hairColor:1,facial:0,glasses:0,shirt:2,bg:2},lines:['Ebaaa! Comida!','Obrigada, {nome}. Você é o herói da noite.','Espera, deixa eu pegar. Pronto, valeu!']},
  {id:'seu-jorge',name:'Seu Jorge',skin:'gilmar-gordo',look:{tone:4,hair:0,hairColor:0,facial:1,glasses:2,shirt:3,bg:3},lines:['Boa noite, {nome}. Obrigado pela entrega.','Meu estômago agradece. Vá com cuidado.','Aqui é assim: quem chega com comida é sempre bem-vindo.']},
  {id:'tati-mendes',name:'Tati Mendes',skin:'flavio-hipotetico',look:{tone:0,hair:7,hairColor:2,facial:0,glasses:0,shirt:1,bg:4},lines:['Ai, finalmente! Brigada, viu?','Tá bem quentinho, {nome}. Amei.','Valeu! Deixei cinco estrelas.']},
  {id:'caio-moreira',name:'Caio Moreira',skin:'gabriel',look:{tone:1,hair:1,hairColor:3,facial:1,glasses:1,shirt:5,bg:5},lines:['Opa, chegou! Tô no meio de uma partida, valeu!','Boa, {nome}. Até a próxima.','Só falta a sobremesa agora.']},
  {id:'dona-fatima',name:'Dona Fátima',skin:'nathan',look:{tone:3,hair:5,hairColor:0,facial:0,glasses:0,shirt:7,bg:6},lines:['Ah, que bênção. Entra não, que o cachorro morde.','Muito obrigada, {nome}. Vai com Deus.','Olha, tá caprichado esse {item}!']},
  {id:'igor-ramos',name:'Igor Ramos',skin:'rafael',look:{tone:2,hair:2,hairColor:0,facial:2,glasses:0,shirt:4,bg:7},lines:['Tá voando, hein, {nome}! Valeu!','Chegou na hora certa, tô saindo do treino.','Boa! Fica firme aí.']},
  {id:'sueli-campos',name:'Sueli Campos',skin:'read',look:{tone:4,hair:4,hairColor:5,facial:0,glasses:2,shirt:0,bg:0},lines:['Obrigada, querido. Hoje eu não ia cozinhar nem a pau.','Deixa eu ver… tá tudo certo, {nome}. Valeu!','Vou dormir feliz com esse {item}.']},
];
