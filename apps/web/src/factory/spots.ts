import {CITY_MARKERS,floorHeight} from '@bar/shared';
import {FACTORY_CART,FACTORY_INTERCOM,FACTORY_REACH} from '@bar/shared/factory';

/** A place of the plant worth marking: its ring on the floor, its badge on screen and (some) its blip on the minimap. */
export interface FactorySpot {id:string;label:string;x:number;y:number;z:number;reach:number;icon:string;/** Also a blip on the minimap. */map:boolean}
/** Metres from the cart's middle within which its ring is the player's (E there is the cart's). */
export const CART_SPOT_REACH=2.2;
/** The colour of every station's ring and badge (industrial amber); the next step's own is the job green. */
export const FACTORY_COLOR='#ffb020';

const at=(name:string)=>CITY_MARKERS[name];
function spot(id:string,label:string,marker:string,reach:number,icon:string,map:boolean,lift=0):FactorySpot|undefined {
  const point=at(marker);return point?{id,label,x:point.x,y:point.y+lift,z:point.z,reach,icon,map}:undefined;
}
const middle=(a:string,b:string)=>{const p=at(a),q=at(b);return p&&q?{x:(p.x+q.x)/2,y:p.y,z:(p.z+q.z)/2}:undefined;};

/** Every station, built from the city's own markers (the same ones the room checks distances against). */
export function buildFactorySpots():FactorySpot[] {
  const spots:Array<FactorySpot|undefined>=[
    spot('entrada','Entrada de pessoal','Ponto_EB_Entrada_Pessoal',FACTORY_REACH.entrance,'briefcase',true),
    spot('painel','Painel de controle','Ponto_EB_Painel',FACTORY_REACH.panel,'gauge',true),
    ...[1,2,3].map(id=>spot(`tanque${id}`,`TQ-${100+id} · plataforma`,`Ponto_EB_Tanque_${id}_Operador`,FACTORY_REACH.tank,'drop',id===2)),
    spot('secador','Secador','Ponto_EB_Secador_Base',FACTORY_REACH.dryer,'flame',true),
    spot('ensaque','Ensaque','Ponto_EB_Ensaque_Saida',FACTORY_REACH.bagging,'package',true),
    spot('palete','Palete pronto','Ponto_EB_PA_Ensaque',FACTORY_REACH.pallet,'warehouse',false),
    // The dock: E opens its panel, unless a truck's rear is what you stand at (then E is the truck's own: its hold).
    spot('doca','Doca de carga','Ponto_EB_Doca',6,'truck',true),
  ];
  // The platform cart: its ring follows it (the controller moves this spot to wherever the room says the cart is; parked, it stands at Ponto_EB_Carrinho).
  spots.push({id:'carrinho',label:'Carrinho de plataforma',x:FACTORY_CART.park.x,y:FACTORY_CART.park.y,z:FACTORY_CART.park.z,reach:CART_SPOT_REACH,icon:'package',map:false});
  // The intercom post on the pavement by the vehicle gate (Ponto_EB_Interfone of the gates' JSON, not a marker of the city): staff ring it to get the gate opened, outsiders only call.
  const bell=FACTORY_INTERCOM;
  spots.push({id:'interfone',label:'Interfone do portão',x:bell.x,y:floorHeight(bell.x,bell.z,.5)??bell.y,z:bell.z,reach:bell.reach,icon:'bell',map:true});
  // Each rack column's three levels share one spot on the floor; the shelves are labelled by what they hold.
  for(const [id,label,a,b,map] of [['rack1','MALTE · prateleira','Ponto_EB_Rack_V1N1P1','Ponto_EB_Rack_V1N1P2',false],['rack2','MALTE · prateleira','Ponto_EB_Rack_V2N1P1','Ponto_EB_Rack_V2N1P2',true],['rack3','MIX · prateleira','Ponto_EB_Rack_V3N1P1','Ponto_EB_Rack_V3N1P2',false]] as const){
    const point=middle(a,b);if(point)spots.push({id,label,x:point.x,y:point.y,z:point.z,reach:FACTORY_REACH.rack,icon:'warehouse',map});
  }
  return spots.filter((each):each is FactorySpot=>!!each);
}
export const FACTORY_SPOTS=buildFactorySpots();
/** The cart's spot, moved by the controller as the cart moves (the scene draws its ring from it). */
export const CART_SPOT=FACTORY_SPOTS.find(spot=>spot.id==='carrinho')!;

/** The plant's centre (the panel): how far the player is from the plant decides whether the panel follows its state. */
export const FACTORY_CENTER=at('Ponto_EB_Painel')??{x:0,y:0,z:0};
export const distanceToFactory=(x:number,z:number)=>Math.hypot(x-FACTORY_CENTER.x,z-FACTORY_CENTER.z);
