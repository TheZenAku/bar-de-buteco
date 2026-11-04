import {randomUUID} from 'node:crypto';
import {FUEL,FUEL_PUMPS,fillerStand,fuelCost,pumpDock,pumpHome,pumpNear,pumpStand,vehicleFiller,vehicleMotionSpeed,vehicleOccupants,vehicleTank,MOTO_ENGINE,motoObstacle,boxContains,type FuelPhase,type FuelPoint,type FuelPump,type FuelReceipt} from '@bar/shared';
import {FuelService,Npc,type Moto} from '../state.js';
import {walkSegment,findPath} from './navigation.js';
import type {FileOutbox} from './outbox.js';
import type {WalletOwner} from './wallet.js';

export interface FuelJournal {userId:string;total:number}
interface Hooks {
  vehicles:()=>Iterable<Moto>;
  connected:(id:string)=>boolean;
  reserve:(owner:WalletOwner,id:string,maximum:number)=>Promise<{budget:number}>;
  settle:(userId:string,id:string,total:number)=>Promise<{balance:number;applied:number}>;
  paid:(userId:string,balance:number,receipt:FuelReceipt)=>void;
  changed:(vehicle:Moto)=>void;
}
interface Service {
  id:string;owner:WalletOwner;pump:FuelPump;state:FuelService;npc:Npc;vehicle:Moto;budget:number;began:number;
  initial:number;limit:number;cancelled:boolean;path:FuelPoint[];toCar:FuelPoint[];back:FuelPoint[];toHome:FuelPoint[];pending:boolean;retryAt:number;
}
const distance=(a:FuelPoint,b:FuelPoint)=>Math.hypot(a.x-b.x,a.z-b.z);

/** Visibility paths use the existing map navigation and skirt parked vehicle hulls. No teleports. */
export function fuelPath(from:FuelPoint,to:FuelPoint,vehicles:Iterable<Moto>):FuelPoint[]|undefined {
  const boxes=[...vehicles].filter(v=>distance(v,from)<15||distance(v,to)<15).map(motoObstacle);
  const clear=(a:FuelPoint,b:FuelPoint)=>{
    if(!walkSegment(a,b))return false;
    const count=Math.ceil(distance(a,b)/.1);
    for(let i=0;i<=count;i++){const t=count?i/count:0;if(boxes.some(c=>boxContains(c,a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,.35)))return false;}
    return true;
  };
  if(clear(from,to))return [to];
  const nodes=[from,to];
  for(const c of boxes){const ux=c.turn?.ux??1,uz=c.turn?.uz??0,hx=(c.turn?.lx??c.hx)+.42,hz=(c.turn?.lz??c.hz)+.42;
    for(const sx of [-1,1])for(const sz of [-1,1])nodes.push({x:c.x+ux*hx*sx-uz*hz*sz,y:from.y,z:c.z+uz*hx*sx+ux*hz*sz});}
  const costs=nodes.map(()=>Infinity),parents=nodes.map(()=>-1),done=new Set<number>();costs[0]=0;
  for(let n=0;n<nodes.length;n++){
    let at=-1;for(let i=0;i<nodes.length;i++)if(!done.has(i)&&(at<0||costs[i]!<costs[at]!))at=i;
    if(at<0||!Number.isFinite(costs[at]!))break;
    if(at===1){const path:FuelPoint[]=[];for(let i=1;i>0;i=parents[i]!)path.unshift(nodes[i]!);return path;}
    done.add(at);
    for(let i=0;i<nodes.length;i++)if(!done.has(i)&&clear(nodes[at]!,nodes[i]!)){
      const cost=costs[at]!+distance(nodes[at]!,nodes[i]!);if(cost<costs[i]!){costs[i]=cost;parents[i]=at;}
    }
  }
  const path=findPath(from,p=>distance(p,to)<.12,to,3000);
  if(path&&path.every((p,i)=>i===0||clear(path[i-1]!,p)))return path.slice(1);
}

export class Refueling {
  private active=new Map<string,Service>();
  private recovering=false;
  readonly states=new Map<string,FuelService>();
  readonly npcs=new Map<string,Npc>();
  constructor(private hooks:Hooks,private journal?:FileOutbox<FuelJournal>){
    for(const pump of FUEL_PUMPS){
      this.states.set(pump.id,new FuelService().assign({id:pump.id,npcId:pump.npcId,price:pump.price}));
      this.npcs.set(pump.npcId,new Npc().assign({id:pump.npcId,displayName:'Frentista',skin:'nathan',color:'#e6a12f',...pumpHome(pump),behavior:'fuel-service',rotation:Math.atan2(-pump.uz,pump.ux)}));
    }
  }
  busy(vehicleId:string):boolean{return [...this.active.values()].some(s=>s.vehicle.id===vehicleId);}
  busyPlayer(id:string):boolean{return [...this.active.values()].some(s=>vehicleOccupants(s.vehicle).includes(id));}
  async request(owner:WalletOwner,vehicle:Moto,now:number):Promise<void>{
    if(vehicle.riderId!==owner.userId)throw new Error('Somente o motorista pode solicitar abastecimento.');
    if(this.busy(vehicle.id))throw new Error('Este veículo já está em atendimento.');
    if(vehicle.phase||vehicle.engine!==MOTO_ENGINE.OFF||vehicleMotionSpeed(vehicle)>.05)throw new Error('Pare e desligue o motor para abastecer.');
    if(vehicle.fuel>=99.999)throw new Error('O tanque já está cheio.');
    const pump=pumpNear(vehicle);if(!pump)throw new Error('Estacione junto a uma bomba do posto.');
    if(this.active.has(pump.id))throw new Error('Esta bomba está ocupada.');
    const state=this.states.get(pump.id)!,npc=this.npcs.get(pump.npcId)!,stand=fillerStand(vehicle),tank=vehicleFiller(vehicle),atPump=pumpStand(pump);
    const path=fuelPath(npc,atPump,this.hooks.vehicles()),toCar=fuelPath(atPump,stand,this.hooks.vehicles()),home=fuelPath(atPump,pumpHome(pump),this.hooks.vehicles());
    if(!path||!toCar||!home||distance(atPump,stand)>5.5)throw new Error('Reposicione o veículo para deixar o tanque e a passagem do frentista acessíveis.');
    const service:Service={id:randomUUID(),owner,pump,state,npc,vehicle,budget:0,began:now,initial:vehicle.fuel,limit:0,cancelled:false,path,toCar,back:[...toCar.slice(0,-1)].reverse().concat([atPump]),toHome:home,pending:false,retryAt:0};
    this.active.set(pump.id,service);
    state.assign({playerId:owner.userId,vehicleId:vehicle.id,litres:0,total:0,message:'',tankX:tank.x,tankY:tank.y,tankZ:tank.z});
    this.phase(service,'authorizing',now);
    try{
      this.journal?.add('fuel',service.id,{userId:owner.userId,total:0});
      const {budget}=await this.hooks.reserve(owner,service.id,fuelCost((100-vehicle.fuel)*vehicleTank(vehicle.model)/100,pump.price));
      service.budget=budget;service.limit=Math.min((100-service.initial)*vehicleTank(vehicle.model)/100,budget/pump.price);
      this.phase(service,service.cancelled?'paying':'to-pump',Date.now());
    }catch(error){
      service.cancelled=true;state.message=error instanceof Error?error.message:'Não foi possível autorizar o abastecimento.';
      this.phase(service,'paying',Date.now());throw error;
    }
  }
  cancel(userId:string,message='Atendimento interrompido a pedido do motorista.'):void {
    for(const s of this.active.values())if(s.owner.userId===userId){s.cancelled=true;s.state.message=message;}
  }
  update(now:number,dt:number):void {
    for(const s of this.active.values()){
      const {state,npc,vehicle}=s;
      if(!this.hooks.connected(s.owner.userId)||vehicle.riderId!==s.owner.userId||![...this.hooks.vehicles()].includes(vehicle))this.cancel(s.owner.userId,'Atendimento interrompido.');
      if(now-s.began>FUEL.MAX_MS&&state.phase!=='paying'&&state.phase!=='home')this.cancel(s.owner.userId,'Tempo de atendimento excedido.');
      if(s.cancelled){
        if(state.phase==='fueling')this.phase(s,'remove',now);
      }
      const age=now-state.startedAt;
      switch(state.phase){
        case 'authorizing':break;
        case 'to-pump':if(this.walk(s,dt)){this.face(npc,pumpDock(s.pump));this.phase(s,s.cancelled?'paying':'take',now);}break;
        case 'take':if(age>=FUEL.ACTION_MS){s.path=[...s.toCar];this.phase(s,'to-car',now);}break;
        case 'to-car':if(this.walk(s,dt)){this.face(npc,{x:state.tankX,y:state.tankY,z:state.tankZ});if(s.cancelled){s.path=[...s.back];this.phase(s,'return',now);}else this.phase(s,'insert',now);}break;
        case 'insert':if(age>=FUEL.ACTION_MS)this.phase(s,s.cancelled?'remove':'fueling',now);break;
        case 'fueling':{
          const litres=Math.min(s.limit,state.litres+FUEL.LITRES_PER_SECOND*Math.min(dt,.1)),total=fuelCost(litres,state.price);
          try{if(total!==state.total)this.journal?.swap([s.id],{kind:'fuel',id:s.id,payload:{userId:s.owner.userId,total}});}
          catch{this.cancel(s.owner.userId,'Abastecimento interrompido: não foi possível registrar o consumo.');this.phase(s,'remove',now);break;}
          state.litres=litres;state.total=total;vehicle.fuel=Math.min(100,s.initial+litres/vehicleTank(vehicle.model)*100);this.hooks.changed(vehicle);
          if(litres>=s.limit-1e-8){if(vehicle.fuel<99.999)state.message='Limite de moedas atingido.';this.phase(s,'remove',now);}break;
        }
        case 'remove':if(age>=FUEL.ACTION_MS){s.path=[...s.back];this.phase(s,'return',now);}break;
        case 'return':if(this.walk(s,dt)){this.face(npc,pumpDock(s.pump));this.phase(s,'replace',now);}break;
        case 'replace':if(age>=FUEL.ACTION_MS)this.phase(s,'paying',now);break;
        case 'paying':if(!s.pending&&now>=s.retryAt){s.pending=true;void this.pay(s,now);}break;
        case 'home':if(this.walk(s,dt)){this.active.delete(s.pump.id);state.assign({phase:'idle',vehicleId:'',playerId:'',startedAt:now});npc.animationState='idle';npc.behavior='fuel-service';}break;
      }
    }
  }
  private async pay(s:Service,now:number):Promise<void>{
    try{
      const change=await this.hooks.settle(s.owner.userId,s.id,s.state.total);
      this.journal?.complete([s.id]);
      this.hooks.paid(s.owner.userId,change.balance,{pumpId:s.pump.id,litres:s.state.litres,paid:-change.applied,message:s.state.message||'Atendimento concluído.'});
      s.path=fuelPath(s.npc,pumpHome(s.pump),this.hooks.vehicles())??s.toHome;
      this.phase(s,'home',now);
    }catch{s.state.message='Aguardando confirmação do pagamento…';s.retryAt=now+3000;}finally{s.pending=false;}
  }
  /** Replay interrupted services with their recorded cost and the same id, without requiring a live session. */
  async recover():Promise<void>{
    if(this.recovering)return;this.recovering=true;
    try{for(const r of this.journal?.pending()??[]){if([...this.active.values()].some(s=>s.id===r.id))continue;try{const c=await this.hooks.settle(r.payload.userId,r.id,r.payload.total);this.journal?.complete([r.id]);this.hooks.paid(r.payload.userId,c.balance,{pumpId:'',litres:0,paid:-c.applied,message:'Pagamento do atendimento anterior confirmado.'});}catch{/* Retry with the same identity. */}}}finally{this.recovering=false;}
  }
  private phase(s:Service,phase:FuelPhase,now:number):void {
    s.state.phase=phase;s.state.startedAt=now;
    s.npc.animationState=['to-pump','to-car','return','home'].includes(phase)?'walk':'idle';s.npc.animationStartedAt=now;
  }
  private face(npc:Npc,p:FuelPoint){npc.rotation=Math.atan2(p.x-npc.x,p.z-npc.z);}
  private walk(s:Service,dt:number):boolean {
    let left=FUEL.SPEED*Math.min(dt,.1);
    while(s.path.length&&left>0){const target=s.path[0]!,d=distance(s.npc,target);if(d<.001){s.path.shift();continue;}
      const step=Math.min(left,d);this.face(s.npc,target);s.npc.x+=(target.x-s.npc.x)*step/d;s.npc.y+=(target.y-s.npc.y)*step/d;s.npc.z+=(target.z-s.npc.z)*step/d;left-=step;if(step>=d)s.path.shift();}
    return !s.path.length;
  }
}
