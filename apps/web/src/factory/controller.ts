import type * as pc from 'playcanvas';
import {CITY_MARKERS,JOB_DAILY_CAP,type Position} from '@bar/shared';
import {CLEAN_TASKS,DIRT_CLEAN,DIRT_PENDING,FACTORY_IDLE_PAY,FACTORY_NPC_DELIVERY_MIN,FACTORY_QUALITY_MIN,SHIPMENT_ACTIVE,cleanTaskOf,pendingCleaning,type CleanTask} from '@bar/shared/factory';
import {floatingWindow,type FloatingWindow} from '../profile/floating-window';
import {api,escape as e} from '../api';
import {uiIcon} from '../ui-icons';
import './factory.css';
import {FactoryVisuals} from './visuals';
import {createFactorySounds} from './sounds';
import {patchHtml} from './dompatch';
import {FACTORY_SPOTS,distanceToFactory,type FactorySpot} from './spots';
import {baggingActions,canReach,dryerActions,fixed,label,nearDock,nextStep,REACH_HINT,tankActions,tankName,tone,volumeOf,type Action,type Station,type Step} from './logic';
import type {DockTruck,EmploymentView,FactoryPaid,FactoryResult,FactoryShipmentView,FactoryView,Material,RouteView,TankView} from './types';

export interface FactoryHooks {
  send:(type:string,payload?:unknown)=>void;
  /** A notice over the game; the same `id` is shown once at a time. */
  notify:(title:string,text:string,warning:boolean,id?:string)=>void;
  app:()=>pc.Application|undefined;
  /** The local avatar's root, for the bag it carries. */
  localRoot:()=>pc.Entity|undefined;
  lowQuality:()=>boolean;
  volume:()=>number;
  userId:()=>string|undefined;
}

type Tab='overview'|'tanks'|'dryer'|'bagging'|'stock'|'dock'|'alarms'|'employment';
/** Two windows: the control room's computer (tanks, dryer, stock, dock, alarms, job) and the bagging station's own controls (only there). */
type Kind='control'|'bagging';
const TABS:ReadonlyArray<readonly [Tab,string]>=[['overview','Início'],['tanks','Tanques'],['dryer','Secador'],['stock','Estoque'],['dock','Doca e cargas'],['alarms','Alarmes'],['employment','Emprego']];
const HEAD:Record<Kind,string>={control:'<b>EMPRESA BRASIL</b><small>Sala de controle</small>',bagging:'<b>EMPRESA BRASIL</b><small>Estação de ensaque</small>'};
/** The panel follows the plant while the player is this close, and lets go beyond the second distance (so it does not flicker at the edge). */
const WATCH_IN=80,WATCH_OUT=100;
/** Where the guide's ring shows, from the plant's centre. */
const GUIDE_RANGE=120;
const rid=()=>crypto.randomUUID();
const MATERIAL_COLOR:Record<Material,string>={MALTE:'#d6924a',MIX:'#46a3d6',PRODUTO:'#ebe6bf'};
const clamp=(value:number,low=0,high=100)=>Math.max(low,Math.min(high,value));
const time=(at:number)=>new Date(at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});

/** The plant's screen, sounds and 3D: the room is the authority, this only asks and shows what it confirmed. */
export class FactoryController {
  private view?:FactoryView;private employment?:EmploymentView;private win?:FloatingWindow;private tab:Tab='overview';private kind:Kind='control';
  private self?:Position;private watching=false;private watchAt=0;private askedEmployment=false;private lastStateAt=0;
  private visuals?:FactoryVisuals;private readonly sounds;private hum=0;
  private pending=new Map<string,{key:string;at:number}>();private last?:{ok:boolean;text:string;at:number};private flash=new Set<string>();
  private seenEvent?:number;private alarmsSeen=new Set<string>();private lastResultSound=0;private shiftWanted?:boolean;
  private pressing=false;private dirty=false;private hud?:HTMLElement;private scrollTo?:number;
  /** The cleaning task in progress as the room last said, with when it arrived (the progress runs from there). */
  private cleaning:null|{task:string;from:number;duration:number;at:number}=null;
  private nearSpot?:FactorySpot;private guideStep?:Step;private hudAt=0;private reachKey='';private routeView:RouteView|null=null;

  constructor(private hooks:FactoryHooks){this.sounds=createFactorySounds(()=>hooks.volume());}

  // ---- what the room sends ----
  stateMessage(view:FactoryView):void {
    const first=!this.view;this.view=view;this.lastStateAt=performance.now();
    const clean=view.me.clean;
    this.cleaning=clean?{task:clean.task,duration:Math.max(1,clean.endsAt-clean.startedAt),from:Math.max(0,((clean as {now?:number}).now??clean.startedAt)-clean.startedAt)/Math.max(1,clean.endsAt-clean.startedAt),at:performance.now()}:null;
    this.ensureVisuals();this.visuals?.update(view,this.hooks.lowQuality());
    this.notifyEvents(view);this.notifyAlarms(view);
    if(first&&!this.askedEmployment)this.askEmployment();
    this.render();this.updateHud();
  }
  employmentMessage(view:EmploymentView):void {this.employment=view;this.render();this.updateHud();}
  /** The driver's trip changed (null: none): the GPS follows it (main.ts) and the status line says where to go. */
  routeMessage(route:RouteView|null):void {
    const arrived=!!this.routeView&&!route;this.routeView=route;this.updateHud();this.render();
    if(route&&!arrived)this.sounds.stage();
  }
  route():RouteView|null {return this.routeView;}
  /** The answer to something the player did: it says what happened (or why not), with a sound. */
  resultMessage(result:FactoryResult):void {
    for(const [id,entry] of this.pending)if(id===result.requestId||entry.key.startsWith(`${result.action}|`)&&!result.requestId)this.pending.delete(id);
    this.last={ok:result.ok,text:result.message,at:performance.now()};this.lastResultSound=performance.now();
    if(result.ok){
      const a=result.action;
      if(a==='ring')this.sounds.doorbell();
      else if(a==='shift'){(this.shiftWanted===false?this.sounds.clockOut():this.sounds.clockIn());}
      else if(a==='ppe')this.sounds.ppe();else if(a==='take'||a==='drop')this.sounds.pick();else if(a==='pour')this.sounds.pour();
      else if(a==='clean')(/limpo\./.test(result.message)?this.sounds.stack():this.sounds.water());
      else if(/water$/.test(a))this.sounds.water();else if(a==='bag.sew')this.sounds.seam();else if(a==='bag.stack'||a==='pallet.store'||a==='dock.load'||a==='dock.unload')this.sounds.stack();
      else if(a==='emergency')this.sounds.emergency();else if(a.startsWith('dryer.')||/\.(lid|agitator)(\.|$)/.test(a))this.sounds.valve();else this.sounds.ok();
    }else{
      this.sounds.deny();
      // Standing at the tank with a bag it would not take: the tanks' tab opens (with the bag in hand) to show what the tank is waiting for.
      if(result.action==='pour')this.open('tanks');
    }
    const section=this.sectionOf(result.action);if(section&&result.ok){this.flash.add(section);setTimeout(()=>{this.flash.delete(section);this.render();},900);}
    if(!this.win)this.hooks.notify(result.action==='ring'?'Interfone':result.ok?'Fábrica':'Não foi possível',result.message,!result.ok,`factory-${result.action}`);
    this.render();this.updateHud();
    setTimeout(()=>{if(this.last&&performance.now()-this.last.at>=5900){this.last=undefined;this.render();}},6000);
  }
  /** A wage came in (or the day's job limit stopped it). */
  paidMessage(paid:FactoryPaid):void {
    if(paid.capped){this.hooks.notify('Sem pagamento','Você atingiu o limite diário de ganhos de trabalho.',true,'factory-capped');this.pop('limite diário',true);return;}
    this.sounds.coin();this.pop(`+${paid.amount}`,false);
    if(paid.amount>=100)this.hooks.notify('Pagamento recebido',`+${paid.amount} moedas · ${paid.label}`,false,`factory-paid-${paid.label}`);
  }
  /** Floating text where the player looks: over the panel when it is open, otherwise over the scene. */
  private pop(text:string,capped:boolean):void {
    const node=document.createElement('div');node.textContent=text;
    if(this.win){node.className=`fc-pay${capped?' capped':''}`;this.win.element.append(node);}
    else{node.className='fc-pay-world';(document.querySelector('#app')??document.body).append(node);}
    setTimeout(()=>node.remove(),1700);
  }
  private notifyEvents(view:FactoryView):void {
    const top=view.events.reduce((most,event)=>Math.max(most,event.id),0);
    if(this.seenEvent===undefined||top<this.seenEvent){this.seenEvent=top;return;}
    const fresh=view.events.filter(event=>event.id>this.seenEvent!);this.seenEvent=top;
    if(!fresh.length||!view.me.onShift)return;
    const sound=performance.now()-this.lastResultSound>700;
    for(const event of fresh)if(event.kind==='ok'&&sound)this.sounds.stage();else if(event.kind==='warn'&&sound)this.sounds.warning();
    // With the panel closed the feed is not in sight: the important lines come as notices.
    if(!this.win)for(const event of fresh.filter(each=>each.kind!=='info').slice(-2))this.hooks.notify('Fábrica',event.text,event.kind!=='ok',`factory-event-${event.id}`);
  }
  private notifyAlarms(view:FactoryView):void {
    const live=view.alarms.filter(alarm=>alarm.active!==false&&!alarm.acknowledged&&alarm.severity!=='info');
    for(const alarm of live)if(!this.alarmsSeen.has(alarm.id)){
      this.alarmsSeen.add(alarm.id);
      if(view.me.onShift||this.win){alarm.severity==='warning'?this.sounds.warning():this.sounds.alarm();}
    }
    for(const id of this.alarmsSeen)if(!view.alarms.some(alarm=>alarm.id===id))this.alarmsSeen.delete(id);
  }
  private sectionOf(action:string):string|undefined {const tank=/^tank(\d)/.exec(action);return tank?`tank${tank[1]}`:action.startsWith('dryer.')?'dryer':action.startsWith('bag.')||action==='pallet.store'?'bagging':undefined;}

  // ---- the player's own position: following the plant, spots, the guide, the hum ----
  /** Every frame. */
  frame(self:Position|undefined,dtSeconds:number,gateOpen?:boolean):void {
    this.self=self;if(!self){return;}
    const now=performance.now(),distance=distanceToFactory(self.x,self.z);
    if(!this.watching&&distance<=WATCH_IN){this.watching=true;this.watchAt=now;this.hooks.send('factory.watch',{on:true});}
    else if(this.watching&&!this.win&&distance>WATCH_OUT){this.watching=false;this.hooks.send('factory.watch',{on:false});this.view=undefined;this.visuals?.hide();this.updateHud();}
    // A subscription the room dropped (it restarted): ask again.
    else if(this.watching&&now-this.lastStateAt>4000&&now-this.watchAt>4000){this.watchAt=now;this.hooks.send('factory.watch',{on:true});}
    if(!this.askedEmployment&&distance<=WATCH_IN)this.askEmployment();
    this.visuals?.tick(Math.min(dtSeconds,.1),self,this.view?.me.carrying??null,this.hooks.localRoot(),gateOpen);
    this.nearSpot=this.spotAt(self);
    if(now-this.hum>250){this.hum=now;this.updateHum(self);}
    if(now-this.hudAt>400){
      this.hudAt=now;this.updateHud();
      // Which controls the player can reach changed (walked up to a platform): the buttons say so at once.
      const reach=(['panel','tank1','tank2','tank3','dryer','bagging'] as Station[]).map(group=>canReach(group,self)?1:0).join('')+(this.spotAt(self)?.id??'');
      if(reach!==this.reachKey){this.reachKey=reach;if(this.win)this.render();}
    }
    this.guideStep=this.view&&this.employment!==undefined?nextStep(this.view,this.employment.employment?.status==='hired',this.view.me.carrying):undefined;
  }
  /** 0..1 of the cleaning in progress (null: none). */
  private cleanProgress():number|null {
    const c=this.cleaning;if(!c)return null;
    return Math.min(1,c.from+(performance.now()-c.at)/c.duration);
  }
  /** The dirty place within reach that E washes now (the room checks again): nothing while the hands carry a bag, the shift or the PPE is missing, or a wash is on. */
  private cleanTarget(self:Position|undefined):CleanTask|undefined {
    const view=this.view;
    if(!self||!view?.dirt||!view.me.onShift||!view.me.ppe||view.me.carrying||this.cleaning)return;
    let best:CleanTask|undefined,bestD=Infinity;
    for(const task of CLEAN_TASKS){
      if(task.kind==='dryer')continue;
      const dirt=view.dirt.levels[task.id]??0,tank=task.kind==='tank'?view.tanks[Number(task.id[4])-1]:undefined;
      if(!(dirt>=DIRT_PENDING||tank?.state==='SUJO'))continue;
      if(tank&&!['SUJO','VAZIO'].includes(tank.state))continue;
      if(task.kind==='line'&&!['PARADO','AGUARDANDO_SACO'].includes(view.bagging.state))continue;
      for(const spot of task.spots){
        const d=Math.hypot(self.x-spot.x,self.z-spot.z);
        if(d<=task.reach&&Math.abs((self.y??0)-spot.y)<=1.6&&d<bestD){bestD=d;best=task;}
      }
    }
    return best;
  }
  private askEmployment():void {this.askedEmployment=true;this.hooks.send('employment.view');}
  /** The hum of each machine group: loud near it, silent beyond twenty-odd metres, only while it runs. */
  private updateHum(self:Position):void {
    const view=this.view;
    if(!view){this.sounds.hum(0,0,0);return;}
    const near=(marker:string,range:number)=>{const at=CITY_MARKERS[marker];return at?clamp(1-Math.hypot(self.x-at.x,self.z-at.z)/range,0,1):0;};
    const agitators=view.tanks.some(tank=>tank.agitatorRpm>0)?Math.max(near('Ponto_EB_Tanque_1',22),near('Ponto_EB_Tanque_2',22),near('Ponto_EB_Tanque_3',22)):0;
    const dryer=['PRE_AQUECENDO','PRODUZINDO','RESFRIANDO'].includes(view.dryer.state)?near('Ponto_EB_Secador_Base',28):0;
    const bagging=view.bagging.state==='ENCHENDO'?near('Ponto_EB_Ensaque',18):0;
    const stopped=view.emergency||!view.activeOperators;
    this.sounds.hum(stopped?0:dryer,stopped?0:agitators,stopped?0:bagging);
  }
  /** The spot the player stands at (nearest by its own reach); racks hold several levels, so their height does not count. */
  private spotAt(self:Position):FactorySpot|undefined {
    let best:FactorySpot|undefined,bestScore=Infinity;
    for(const spot of FACTORY_SPOTS){
      const d=Math.hypot(self.x-spot.x,self.z-spot.z);
      if(d>spot.reach||(!spot.id.startsWith('rack')&&Math.abs((self.y??0)-spot.y)>1.8))continue;
      if(d/spot.reach<bestScore){bestScore=d/spot.reach;best=spot;}
    }
    return best;
  }
  /** The badge to draw at a station: the nearest one within a few metres (the scene projects it). */
  blipSpot(self:Position|undefined):FactorySpot|undefined {
    if(!self||distanceToFactory(self.x,self.z)>WATCH_OUT)return;
    let best:FactorySpot|undefined,bestD=Infinity;
    // The guide's own spot wears the guide's badge (the step's title), not the station's name.
    const guided=this.guideStep?.spot;
    for(const spot of FACTORY_SPOTS){
      const d=Math.hypot(self.x-spot.x,self.z-spot.z);
      if(d<bestD&&spot.id!==guided&&Math.abs((self.y??0)-spot.y)<=2.2){bestD=d;best=spot;}
    }
    return best;
  }
  /** Where the next step is, for the scene's guide ring, the badge on the edge and the minimap. */
  guide():{x:number;y:number;z:number;title:string}|null {
    const step=this.guideStep,self=this.self;
    if(!(step?.spot||step?.at)||!self||distanceToFactory(self.x,self.z)>GUIDE_RANGE)return null;
    if(step.at)return {...step.at,title:step.title};
    const spot=FACTORY_SPOTS.find(each=>each.id===step.spot);
    return spot?{x:spot.x,y:spot.y,z:spot.z,title:step.title}:null;
  }

  // ---- the E key ----
  /** What E does where the player stands, as the context bar says it; undefined: nothing here. */
  prompt(self:Position|undefined,truckRear=false):string|undefined {
    // Standing at the back of your own truck, E is the truck's hold (main.ts), wherever in the plant that is.
    if(truckRear)return;
    const progress=this.cleanProgress();
    if(progress!==null)return `Limpando… ${Math.round(progress*100)}% (fique no lugar)`;
    const wash=this.cleanTarget(self);if(wash)return `${wash.verb}: ${wash.label} (${wash.durationS} s)`;
    const spot=self&&distanceToFactory(self.x,self.z)<WATCH_OUT?this.spotAt(self):undefined;if(!spot)return;
    const carrying=this.view?.me.carrying;
    if(spot.id==='interfone')return 'Tocar o interfone da EMPRESA BRASIL';
    if(spot.id==='entrada')return 'Entrada de pessoal: expediente e EPI';
    if(spot.id==='painel')return 'Abrir o painel de controle';
    if(spot.id.startsWith('tanque'))return carrying?`Despejar o saco de ${carrying} no ${tankName(Number(spot.id.slice(6)))} (abre a tampa e liga o agitador)`:`Controles do ${tankName(Number(spot.id.slice(6)))}`;
    if(spot.id.startsWith('rack'))return carrying?'Devolver o saco à prateleira':`Pegar um saco de ${spot.id==='rack3'?'MIX':'MALTE'}`;
    if(spot.id==='secador')return 'Controles do secador';
    if(spot.id==='doca')return 'Doca: caminhões e cargas';
    if(spot.id==='ensaque'||spot.id==='palete')return 'Controles do ensaque';
  }
  interact(self:Position,truckRear=false):boolean {
    if(truckRear||distanceToFactory(self.x,self.z)>WATCH_OUT)return false;
    this.sounds.unlock();
    if(this.cleanProgress()!==null)return true;
    const wash=this.cleanTarget(self);
    if(wash){this.hooks.send('factory.clean',{task:wash.id,requestId:rid()});return true;}
    const spot=this.spotAt(self);if(!spot)return false;
    const carrying=this.view?.me.carrying;
    if(spot.id==='interfone')this.hooks.send('factory.ring');
    else if(spot.id==='entrada')this.open('employment');
    else if(spot.id==='painel')this.open('overview');
    else if(spot.id.startsWith('tanque')){
      const id=Number(spot.id.slice(6));
      if(carrying)this.hooks.send('factory.pour',{tank:id,requestId:rid()});else this.open('tanks');
    }else if(spot.id.startsWith('rack')){
      if(carrying)this.hooks.send('factory.drop',{requestId:rid()});
      else{
        const marker=Object.keys(CITY_MARKERS).filter(name=>name.startsWith('Ponto_EB_Rack_')).map(name=>({name,d:Math.hypot(self.x-CITY_MARKERS[name]!.x,self.z-CITY_MARKERS[name]!.z)})).sort((a,b)=>a.d-b.d)[0];
        if(marker)this.hooks.send('factory.take',{marker:marker.name,requestId:rid()});
      }
    }else if(spot.id==='doca'){this.open('dock');
    }else if(spot.id==='secador')this.open('dryer');
    else if(spot.id==='ensaque'||spot.id==='palete')this.open('bagging');
    else return false;
    return true;
  }

  // ---- the window ----
  private open(tab:Tab):void {
    const kind:Kind=tab==='bagging'?'bagging':'control';
    // The bagging station and the control room are different places: asking for the other one swaps the window.
    if(this.win&&this.kind!==kind)this.win.close();
    this.tab=tab;this.kind=kind;this.scrollTo=0;this.sounds.tick();
    if(!this.win){
      this.win=floatingWindow({className:'factory-scada',label:kind==='bagging'?'Estação de ensaque':'Sala de controle',onClose:()=>{this.win=undefined;this.updateHud();}});
      this.win.head.innerHTML=HEAD[kind];
      const element=this.win.element;
      element.addEventListener('click',event=>this.click(event));
      // A press whose pointerup never reaches the panel (released outside it, a lost capture) must not freeze it: the hold ends by itself.
      let hold:ReturnType<typeof setTimeout>|undefined;
      const release=()=>{clearTimeout(hold);this.pressing=false;if(this.dirty)this.render();};
      element.addEventListener('pointerdown',()=>{this.pressing=true;clearTimeout(hold);hold=setTimeout(release,700);});
      element.addEventListener('pointerup',release);element.addEventListener('pointercancel',release);
      if(!this.watching){this.watching=true;this.watchAt=performance.now();}
      this.hooks.send('factory.watch',{on:true});this.hooks.send('employment.view');
    }
    this.render();this.win.front();this.updateHud();
  }
  close():void {this.win?.close();}
  /** Leaving the game: nothing of the plant stays on screen. */
  reset():void {
    this.win?.close();this.view=undefined;this.employment=undefined;this.watching=false;this.askedEmployment=false;this.seenEvent=undefined;this.alarmsSeen.clear();this.pending.clear();
    this.routeView=null;this.visuals?.destroy();this.visuals=undefined;this.sounds.hum(0,0,0);this.hud?.classList.remove('show');this.guideStep=undefined;this.nearSpot=undefined;
  }
  private ensureVisuals():void {
    const app=this.hooks.app();if(!this.visuals&&app)this.visuals=new FactoryVisuals(app);
  }

  private click(event:MouseEvent):void {
    const button=(event.target as HTMLElement).closest<HTMLElement>('[data-factory]');if(!button)return;
    const action=button.dataset.factory!;this.sounds.unlock();
    if(button.getAttribute('aria-disabled')==='true'){this.last={ok:false,text:button.dataset.why||'Ainda não é possível.',at:performance.now()};this.sounds.deny();this.render();return;}
    switch(action){
      case 'tab':if(this.kind==='bagging')return;this.tab=button.dataset.tab as Tab;this.scrollTo=0;this.sounds.tick();this.render();return;
      case 'shift':this.shiftWanted=!this.view?.me.onShift;this.hooks.send('employment.shift',{on:this.shiftWanted,requestId:rid()});this.sounds.click();return;
      case 'gate':this.hooks.send('factory.gate',{action:button.dataset.do});this.sounds.click();return;
      case 'ppe':this.hooks.send('factory.ppe',{on:!this.view?.me.ppe});this.sounds.click();return;
      case 'hire':void this.employmentApi('hire');return;
      case 'withdraw':void this.employmentApi('withdraw');return;
      case 'resign':if(confirm('Pedir demissão? Você só poderá se candidatar de novo depois do tempo de espera.'))void this.employmentApi('resign');return;
      case 'dock.load':this.hooks.send('factory.dock.load',{vehicleId:button.dataset.vehicle,pallets:Number(button.dataset.pallets),requestId:rid()});this.sounds.click();return;
      case 'dock.unload':this.hooks.send('factory.dock.unload',{vehicleId:button.dataset.vehicle,requestId:rid()});this.sounds.click();return;
      case 'dock.accept':this.hooks.send('factory.dock.accept',{orderId:button.dataset.order,vehicleId:button.dataset.vehicle,requestId:rid()});this.sounds.click();return;
      case 'shipment.cancel':if(confirm(button.dataset.sure||'Cancelar essa carga?'))this.hooks.send('factory.shipment.cancel',{id:button.dataset.shipment});return;
      case 'cmd':{
        const name=button.dataset.action!;
        if(name==='emergency'&&!confirm('Acionar a PARADA DE EMERGÊNCIA? Toda a linha para.'))return;
        const id=rid(),key=`${name}|${button.dataset.target??''}`;
        this.pending.set(id,{key,at:performance.now()});setTimeout(()=>{if(this.pending.delete(id))this.render();},4000);
        this.hooks.send('factory.cmd',{action:name,target:button.dataset.target,requestId:id});this.sounds.click();this.render();return;
      }
    }
  }
  private async employmentApi(action:'hire'|'resign'|'withdraw'):Promise<void> {
    try{
      await api(`/employment/${action}`,{requestId:rid()});
      this.sounds[action==='resign'?'clockOut':'clockIn']();
      this.last={ok:true,text:action==='hire'?'Candidatura enviada! Um dono ou gerente da empresa vai avaliar; depois entre em expediente.':action==='withdraw'?'Candidatura cancelada.':'Demissão registrada. Boa sorte!',at:performance.now()};
      this.hooks.send('employment.view');
    }catch(error){this.last={ok:false,text:error instanceof Error?error.message:'Não foi possível concluir.',at:performance.now()};this.sounds.deny();}
    this.render();
  }

  // ---- drawing ----
  private render():void {
    if(!this.win)return;
    if(this.pressing){this.dirty=true;return;}
    this.dirty=false;
    const view=this.view,html=`${this.header(view)}<div class="fc-scroll" data-tab="${this.tab}">${this.content(view)}</div>${this.resultStrip()}`;
    patchHtml(this.win.body,html);
    const scroll=this.win.body.querySelector<HTMLElement>('.fc-scroll');
    if(scroll&&this.scrollTo!==undefined){scroll.scrollTop=this.scrollTo;this.scrollTo=undefined;}
    this.win.settle();
  }
  private header(view:FactoryView|undefined):string {
    const me=view?.me,employed=this.employment?.employment?.status==='hired';
    const chips=[
      `<span class="fc-chip ${me?.onShift?'on':''}">${me?.onShift?'Em serviço':employed?'Fora de serviço':'Sem emprego'}</span>`,
      `<span class="fc-chip ${me?.ppe?'on':me?.onShift?'warn':''}">EPI ${me?.ppe?'colocado':'não colocado'}</span>`,
      me?.carrying?`<span class="fc-chip on">Carregando saco de ${me.carrying}</span>`:'',
      view?`<span class="fc-chip ${view.activeOperators?'on':'warn'}">${view.activeOperators} operador(es)</span>`:'',
    ].join('');
    const banner=!view?'<div class="fc-banner">Conectando à fábrica…</div>':view.emergency?'<div class="fc-banner bad">Parada de emergência acionada: a linha está parada. Rearme no painel (aba Alarmes).</div>'
      :view.pausedWithoutOperator?'<div class="fc-banner">Sem operador em serviço: o processo está pausado. Entre em expediente para ele andar.</div>':'';
    const alerts=this.tabAlerts(view);
    const tabs=this.kind==='bagging'?'':TABS.map(([id,name])=>`<button type="button" class="fc-tab" role="tab" data-factory="tab" data-tab="${id}" aria-selected="${this.tab===id}"${alerts[id]?` data-alert="${alerts[id]}"`:''}>${name}</button>`).join('');
    return `<div class="fc-chips">${chips}</div>${banner}${tabs?`<nav class="fc-tabs" role="tablist">${tabs}</nav>`:''}`;
  }
  /** The tabs with something waiting for the operator. */
  private tabAlerts(view:FactoryView|undefined):Partial<Record<Tab,'wait'|'bad'>> {
    if(!view)return {};
    const out:Partial<Record<Tab,'wait'|'bad'>>={},live=view.alarms.filter(alarm=>alarm.active!==false&&!alarm.acknowledged&&alarm.severity!=='info');
    if(view.gate?.ringing)out.overview='bad';
    if(live.length)out.alarms=view.emergency||live.some(alarm=>alarm.severity!=='warning')?'bad':'wait';
    if(view.tanks.some(tank=>tank.state==='AGUARDANDO_QUALIDADE'||tank.state==='AGUARDANDO_INSUMOS'||tank.state==='SUJO'))out.tanks='wait';
    if(view.dryer.state==='FALHA')out.dryer='bad';else if(view.dryer.state==='PRONTO'&&view.tanks.some(tank=>tank.state==='PRONTO_PARA_TRANSFERIR'))out.dryer='wait';
    const me=this.hooks.userId(),trucks=view.dock.trucks;
    if(view.production?.active?.status==='approved'&&view.me.onShift)out.overview='wait';
    if(view.dirt?.required&&pendingCleaning(view.dirt).length&&view.me.onShift)out.overview='wait';
    if(view.me.onShift&&trucks.length&&(view.shipments.some(trip=>trip.status==='returning'&&trucks.some(truck=>truck.vehicleId===trip.vehicleId))||(view.slots.filter(slot=>slot.material==='PRODUTO').reduce((sum,slot)=>sum+slot.quantity,0)>=18&&trucks.some(truck=>!view.shipments.some(trip=>trip.vehicleId===truck.vehicleId&&SHIPMENT_ACTIVE.includes(trip.status))))))out.dock='wait';
    else if(trucks.some(truck=>truck.ownerId===me)&&view.orders.some(order=>order.status==='open'))out.dock='wait';
    return out;
  }
  private resultStrip():string {
    const last=this.last;if(!last)return '<div class="fc-result" data-ok="true"><span>Pronto para operar. Use E perto das máquinas, ou os botões daqui.</span></div>';
    return `<div class="fc-result" data-ok="${last.ok}" data-fresh="${performance.now()-last.at<400}"><span>${uiIcon(last.ok?'checkCheck':'alert')}</span><span>${e(last.text)}</span></div>`;
  }
  private content(view:FactoryView|undefined):string {
    if(this.kind==='bagging'){
      if(!view)return '<p class="fc-why">Aguardando os dados da fábrica… Se demorar, chegue perto da ensacadeira.</p>';
      return `<div class="fc-grid">${this.baggingCard(view)}${this.palletCard(view)}</div>`;
    }
    if(this.tab==='employment')return this.employmentTab(view);
    if(!view)return '<p class="fc-why">Aguardando os dados da fábrica… Se demorar, chegue perto do painel de controle.</p>';
    switch(this.tab){
      case 'tanks':return `<div class="fc-grid">${view.tanks.map(tank=>this.tankCard(tank,view)).join('')}</div>`;
      case 'dryer':return `<div class="fc-grid">${this.dryerCard(view)}${this.siloCard(view)}</div>`;
      case 'stock':return this.stockTab(view);
      case 'dock':return this.dockTab(view);
      case 'alarms':return this.alarmsTab(view);
      default:return this.overviewTab(view);
    }
  }
  private gauge(name:string,value:string,percent:number,css='',moving=false):string {
    return `<div class="fc-gauge ${css}${moving?' moving':''}" style="--v:${clamp(percent).toFixed(1)}%"><i></i><div><span>${name}</span><span>${value}</span></div></div>`;
  }
  /** Why a group's buttons cannot be used right now (one line per card instead of one per button). */
  private blocked(group:Station,view:FactoryView):string {
    if(!view.me.onShift)return 'Entre em expediente na entrada de pessoal (aba Emprego).';
    if(!view.me.ppe)return 'Coloque o EPI no armário da entrada de pessoal.';
    if(!canReach(group,this.self))return REACH_HINT[group];
    return '';
  }
  private button(a:Action,group:Station,view:FactoryView):string {
    const gate=this.blocked(group,view),usable=a.enabled&&!gate&&(!view.emergency||a.action==='emergency.reset');
    const why=gate||(view.emergency&&a.action!=='emergency.reset'?'A emergência está acionada: rearme no painel.':a.why??''),key=`${a.action}|${a.target??''}`;
    const pending=[...this.pending.values()].some(entry=>entry.key===key);
    const classes=['fc-btn',a.tone??'',a.next&&usable?'next':'',pending?'pending':'',usable?'':'off'].filter(Boolean).join(' ');
    return `<button type="button" class="${classes}" data-factory="cmd" data-action="${e(a.action)}"${a.target?` data-target="${e(a.target)}"`:''} data-why="${usable?'':e(why)}" aria-disabled="${!usable}" title="${usable?'':e(why)}">${e(a.label)}</button>`;
  }
  private actions(list:Action[],group:Station,view:FactoryView):string {
    const gate=this.blocked(group,view);
    return `<div class="fc-actions">${list.map(action=>this.button(action,group,view)).join('')}</div>${gate?`<p class="fc-why">${e(gate)}</p>`:''}`;
  }

  private overviewTab(view:FactoryView):string {
    const step=nextStep(view,this.employment?.employment?.status==='hired',view.me.carrying);
    const guide=step?`<div class="fc-guide">${uiIcon('flag')}<div><b>${e(step.title)}</b><p>${e(step.detail)}</p>${step.tab==='bagging'?'<p class="fc-why">Os controles do ensaque ficam na estação de ensaque (siga o marcador).</p>':step.tab&&step.tab!==this.tab?`<button type="button" class="fc-btn primary" data-factory="tab" data-tab="${step.tab}">Abrir ${e(TABS.find(([id])=>id===step.tab)?.[1]??'')}</button>`:''}</div></div>`:'';
    const nodes=[
      ...view.tanks.map(tank=>[`TQ-${100+tank.id}`,label(tank.state),tone(tank.state),['DISSOLVENDO','HOMOGENEIZANDO','AQUECENDO','ENCHENDO_AGUA','TRANSFERINDO'].includes(tank.state)] as const),
      ['Secador',label(view.dryer.state),tone(view.dryer.state),['PRODUZINDO','PRE_AQUECENDO'].includes(view.dryer.state)] as const,
      ['Silo',`${fixed(view.dryer.powderKg)} kg`,view.dryer.powderKg>=view.siloCapacityKg*.9?'wait':view.dryer.powderKg>0?'run':'idle',view.bagging.state==='ENCHENDO'] as const,
      ['Ensaque',label(view.bagging.state),tone(view.bagging.state),view.bagging.state==='ENCHENDO'] as const,
      ['Palete',`${view.bagging.palletBags}/18`,view.bagging.palletBags>0?'run':'idle',false] as const,
    ];
    const flow=nodes.map(([name,state,kind,running],index)=>`${index?`<span class="fc-arrow${nodes[index-1]![3]?' run':''}"></span>`:''}<div class="fc-node" data-tone="${kind}"><b>${e(name)}</b><small>${e(state)}</small></div>`).join('');
    const feed=[...view.events].reverse().slice(0,14).map(event=>`<p data-kind="${event.kind}" data-id="${event.id}"><time>${time(event.at)}</time><span>${e(event.text)}</span></p>`).join('')||'<p><span>Nada aconteceu ainda.</span></p>';
    const live=view.alarms.filter(alarm=>alarm.active!==false);
    return `${this.gateCard(view)}${guide}${this.productionCard(view)}<div class="fc-flow">${flow}</div><div class="fc-grid"><section class="fc-card"><h4>${uiIcon('activity')}Acontecendo agora</h4><div class="fc-feed">${feed}</div></section>
      <section class="fc-card" data-tone="${live.some(alarm=>!alarm.acknowledged&&alarm.severity!=='info')?'bad':'idle'}"><h4>${uiIcon('alert')}Alarmes <span class="fc-pill">${live.filter(alarm=>!alarm.acknowledged).length} novos</span></h4>${this.alarmList(live.slice(-4),true)}${live.length?`<div class="fc-actions"><button type="button" class="fc-btn" data-factory="tab" data-tab="alarms">Ver todos</button></div>`:''}</section>
      <section class="fc-card"><h4>${uiIcon('warehouse')}Estoque</h4>${this.stockBars(view)}</section>${this.cleaningCard(view)}</div>`;
  }
  /** The production order the plant works on: no order, nothing is produced; an approved one waits for an employee to start it here. */
  private productionCard(view:FactoryView):string {
    const order=view.production?.active;
    if(!order){
      const last=view.production?.history.at(-1);
      return `<section class="fc-card" data-tone="${view.dirt?.required?'wait':'idle'}"><h4>${uiIcon('clipboard')}Ordem de produção<span class="fc-pill">Nenhuma</span></h4>
        <p class="fc-why">Sem ordem de produção a fábrica não produz. O gerente da empresa aprova uma em Perfil → Gerenciar empresa (o dono cria as opções). ${last?`A última foi ${e(last.name)}: ${last.result==='completed'?'concluída':last.result==='closed'?'encerrada':'cancelada'}, ${last.bags} saco(s).`:''}</p>
        <p class="fc-why">Enquanto não há produção, quem está em serviço com o EPI dentro da fábrica recebe ${view.finance?.idlePay??FACTORY_IDLE_PAY.amount} moedas a cada ${view.finance?.idleEveryMin??FACTORY_IDLE_PAY.everyS/60} minutos.</p></section>`;
    }
    const approved=order.status==='approved',cleaning=view.dirt?.required?pendingCleaning(view.dirt).length:0;
    const start=this.button({action:'op.start',label:'Iniciar produção',enabled:approved&&!cleaning,why:approved?`Limpe a fábrica antes: faltam ${cleaning} lugar(es).`:'A ordem já está em andamento.',tone:'primary',next:approved&&!cleaning},'panel',view);
    return `<section class="fc-card" data-tone="${approved?'wait':'run'}"><h4>${uiIcon('clipboard')}${e(order.name)}<span class="fc-pill" data-tone="${approved?'wait':'run'}">${approved?'Aprovada':'Em andamento'}</span></h4>
      <p class="fc-why">${order.batches} lote(s) de ${order.malteBags} MALTE + ${order.mixBags} MIX (${(order.malteBags+order.mixBags)*100} L de água por tanque). ${approved?`Aprovada por ${e(order.approvedByName)}.`:`Lote ${Math.min(order.batchesStarted,order.batches)}/${order.batches} iniciado, ${order.batchesDone} seco(s), ${order.bags} saco(s) ensacado(s).`}</p>
      ${this.gauge('Lotes',`${order.batchesDone} / ${order.batches}`,order.batchesDone/Math.max(1,order.batches)*100,'ok',!approved)}
      ${approved?`<div class="fc-actions">${start}</div>`:''}</section>`;
  }
  /** What the plant needs washed (after an order ends everything is dirty): each line says where and what to do. */
  private cleaningCard(view:FactoryView):string {
    const dirt=view.dirt;if(!dirt)return '';
    const rows=CLEAN_TASKS.map(task=>{
      const level=dirt.levels[task.id]??0,tank=task.kind==='tank'?view.tanks[Number(task.id[4])-1]:undefined,sujo=tank?.state==='SUJO';
      return {task,level:sujo?Math.max(level,.8):level};
    });
    const pending=rows.filter(row=>row.level>=DIRT_PENDING),mine=view.me.clean;
    const body=rows.map(row=>`<div class="fc-gauge ${row.level>=DIRT_PENDING?'bad':'ok'}" style="--v:${clamp((1-row.level)*100).toFixed(1)}%"><i></i><div><span>${e(row.task.label)}</span><span>${row.level<DIRT_CLEAN?'limpo':`${Math.round(row.level*100)}% sujo`}</span></div></div>`).join('');
    return `<section class="fc-card" data-tone="${dirt.required?'bad':pending.length?'wait':'idle'}"><h4>${uiIcon('drop')}Limpeza<span class="fc-pill" data-tone="${dirt.required?'bad':pending.length?'wait':'idle'}">${dirt.required?'Obrigatória':pending.length?`${pending.length} suja(s)`:'Tudo limpo'}</span></h4>
      <p class="fc-why">${dirt.required?'A ordem terminou: lave os três tanques (E na plataforma), a câmara do secador (aba Secador), a linha de ensaque e os pisos (E no lugar, fique parado). Só então a próxima ordem começa.':'A fábrica suja com o trabalho. Quando um lugar passa de 25%, aparece o aviso de limpeza; lavar paga uma pequena quantia.'}</p>
      ${mine?`<p class="fc-why">Limpando: ${e(cleanTaskOf(mine.task)?.label??'')}…</p>`:''}${body}</section>`;
  }
  /** The vehicle gate and the intercom: opening and closing live at the control room's computer, and a visitor's ring waits here. */
  private gateCard(view:FactoryView):string {
    const gate=view.gate;if(!gate)return '';
    const why=this.blocked('panel',view),ring=gate.ringing;
    const btn=(label:string,action:string,css='')=>`<button type="button" class="fc-btn ${css}${why?' off':''}" data-factory="gate" data-do="${action}" aria-disabled="${!!why}" data-why="${e(why)}" title="${e(why)}">${label}</button>`;
    const bell=ring?`<div class="fc-guide" data-ring="1">${uiIcon('bell')}<div><b>Interfone tocando</b><p>${e(ring.name)} está no portão. Abra para deixar entrar ou dispense a chamada.</p></div></div>`:'';
    return `${bell}<section class="fc-card" data-tone="${ring?'bad':gate.open?'wait':'idle'}"><h4>${uiIcon('truck')}Portão de veículos<span class="fc-pill" data-tone="${gate.open?'wait':'idle'}">${gate.open?'Aberto':'Fechado'}</span></h4>
      <p class="fc-why">O portão fica fechado. Quem chega toca o interfone (poste ao lado do portão) e quem está em serviço atende por aqui. Ele fecha sozinho quando o último operador encerra o expediente e nunca fecha em cima de alguém no vão.</p>
      <div class="fc-actions">${btn(gate.open?'Fechar o portão':'Abrir o portão',gate.open?'close':'open',`primary${ring||!gate.open?' next':''}`)}${ring?btn('Dispensar a chamada','dismiss'):''}</div>${why?`<p class="fc-why">${e(why)}</p>`:''}</section>`;
  }
  private stockBars(view:FactoryView):string {
    const total=(material:Material)=>view.slots.filter(slot=>slot.material===material),sum=(list:typeof view.slots)=>list.reduce((count,slot)=>count+slot.quantity,0),capacity=(list:typeof view.slots)=>list.reduce((count,slot)=>count+slot.capacity,0);
    return (['MALTE','MIX','PRODUTO'] as const).map(material=>{const list=total(material);return this.gauge(material,`${sum(list)} / ${capacity(list)} sacos`,capacity(list)?sum(list)/capacity(list)*100:0,material==='PRODUTO'?'ok':'gold');}).join('');
  }

  private tankCard(tank:TankView,view:FactoryView):string {
    const recipe=view.balance.recipe,name=tankName(tank.id),scale=Math.max(1,view.balance.timeScale);
    const duration=tank.state==='DISSOLVENDO'?view.balance.dissolveS:tank.state==='HOMOGENEIZANDO'?view.balance.homogenizeS:0;
    const remaining=duration?Math.max(0,Math.ceil((duration-tank.stepS)/scale)):0;
    const step=(done:boolean,text:string)=>`<li class="${done?'done':''}">${e(text)}</li>`;
    const heated=tank.temperatureC>=recipe.targetC-.6,volume=volumeOf(tank,view),solids=tank.solidsKg??(tank.malteBags+tank.mixBags)*view.balance.bagKg,full=Math.max(1,recipe.waterL+(recipe.malteBags+recipe.mixBags)*view.balance.bagKg*recipe.litresPerKg);
    return `<section class="fc-card${this.flash.has(`tank${tank.id}`)?' flash':''}" data-tone="${tone(tank.state)}"><h4>${uiIcon('drop')}${name}<span class="fc-pill" data-tone="${tone(tank.state)}">${e(label(tank.state))}</span></h4>
      ${this.gauge('Volume',`${fixed(volume)} L`,volume/full*100,'',['ENCHENDO_AGUA','TRANSFERINDO'].includes(tank.state))}
      ${this.gauge('Temperatura',`${fixed(tank.temperatureC,1)} / ${fixed(recipe.targetC)} °C`,(tank.temperatureC-20)/(recipe.targetC-20)*100,'hot',tank.state==='AQUECENDO')}
      ${duration?this.gauge(label(tank.state),`${remaining} s`,tank.stepS/duration*100,'ok',true):''}
      <ul class="fc-list">${step(tank.waterL>=recipe.waterL,'Água')}${step(heated&&tank.waterL>0,`Temperatura ${fixed(recipe.targetC)} °C`)}${step(tank.agitatorRpm>0,'Agitador ligado')}${step(tank.lidOpen||tank.malteBags>=recipe.malteBags&&tank.mixBags>=recipe.mixBags,'Tampa aberta')}${step(tank.malteBags>=recipe.malteBags,`MALTE ${tank.malteBags}/${recipe.malteBags}`)}${step(tank.mixBags>=recipe.mixBags,`MIX ${tank.mixBags}/${recipe.mixBags}`)}</ul>
      <p class="fc-why">${tank.waterL>0?`Água ${fixed(tank.waterL)} L${solids>0?` + sólidos dissolvidos ${fixed(solids*recipe.litresPerKg)} L`:''} · `:''}Qualidade ${tank.quality}%${tank.quality<FACTORY_QUALITY_MIN?' (baixa)':''}${tank.penalties.length?` · ${tank.penalties.map(penalty=>e(penalty.replaceAll('_',' '))).join(', ')}`:''}</p>
      ${this.actions(tankActions(tank,view),`tank${tank.id}` as Station,view)}</section>`;
  }
  private dryerCard(view:FactoryView):string {
    const d=view.dryer,duration=d.state==='PRE_AQUECENDO'?view.balance.preheatS:d.state==='RESFRIANDO'?view.balance.coolS:0,scale=Math.max(1,view.balance.timeScale);
    return `<section class="fc-card${this.flash.has('dryer')?' flash':''}" data-tone="${tone(d.state)}"><h4>${uiIcon('flame')}Secador spray<span class="fc-pill" data-tone="${tone(d.state)}">${e(label(d.state))}</span></h4>
      ${this.gauge('Ar de entrada',`${fixed(d.inletC)} / 190 °C`,d.inletC/190*100,'hot',d.state==='PRE_AQUECENDO')}
      ${this.gauge('Ar de saída',`${fixed(d.outletC)} / 87 °C`,d.outletC/87*100,'hot')}
      ${this.gauge('Vazão',`${fixed(d.flowLph)} L/h`,d.flowLph/Math.max(1,view.balance.recipe.waterL)*100,'',d.state==='PRODUZINDO')}
      ${duration?this.gauge(label(d.state),`${Math.max(0,Math.ceil((duration-d.stepS)/scale))} s`,d.stepS/duration*100,'ok',true):''}
      ${d.sourceTank?`<p class="fc-why">Alimentado pelo ${tankName(d.sourceTank)}.</p>`:''}${d.fault?`<p class="fc-why">Falha: ${e(d.fault.replaceAll('_',' '))}.</p>`:''}
      ${this.actions(dryerActions(view),'dryer',view)}</section>`;
  }
  private siloCard(view:FactoryView):string {
    return `<section class="fc-card"><h4>${uiIcon('package')}Silo de produto</h4>${this.gauge('Produto',`${fixed(view.dryer.powderKg,1)} / ${fixed(view.siloCapacityKg)} kg`,view.dryer.powderKg/view.siloCapacityKg*100,'gold')}
      <p class="fc-why">Cada saco leva ${fixed(view.balance.bagKg)} kg. Com o silo cheio o secador para. Se parar a produção, o que ficou no silo não se perde: ensaque um saco leve (a paga acompanha o peso).</p></section>`;
  }
  private baggingCard(view:FactoryView):string {
    const b=view.bagging;
    return `<section class="fc-card${this.flash.has('bagging')?' flash':''}" data-tone="${tone(b.state)}"><h4>${uiIcon('package')}Ensacadeira<span class="fc-pill" data-tone="${tone(b.state)}">${e(label(b.state))}</span></h4>
      ${this.gauge('Saco',`${fixed(b.weightKg,1)} / ${fixed(view.balance.bagKg)} kg`,b.weightKg/view.balance.bagKg*100,'gold',b.state==='ENCHENDO')}
      ${this.gauge('Palete',`${b.palletBags} / 18 sacos`,b.palletBags/18*100,'ok')}
      <p class="fc-why">Sacos vazios no fardo: ${b.emptyBags} · produzidos: ${b.producedBags}${b.lightBags?` (${b.lightBags} leve${b.lightBags>1?'s':''})`:''} · lote ${e(b.lot||'—')}</p>
      ${this.actions(baggingActions(view),'bagging',view)}</section>`;
  }
  private palletCard(view:FactoryView):string {
    const out=view.slots.find(slot=>slot.marker==='Ponto_EB_PA_Ensaque'),stored=view.slots.filter(slot=>slot.material==='PRODUTO'&&slot.marker!=='Ponto_EB_PA_Ensaque');
    return `<section class="fc-card" data-tone="${out?.quantity?'wait':'idle'}"><h4>${uiIcon('warehouse')}Paletes${out?.quantity?'<span class="fc-pill" data-tone="wait">Palete na saída</span>':''}</h4>
      ${out?.quantity?`<p class="fc-why">Palete completo (lote ${e(out.batchId||'—')}) esperando na saída do ensaque. Use "Armazenar palete".</p>`:'<p class="fc-why">Nenhum palete esperando na saída.</p>'}
      <div class="fc-slots">${stored.map(slot=>`<div class="fc-slot" style="--v:${slot.quantity/slot.capacity*100}%;--c:${MATERIAL_COLOR.PRODUTO}" title="${e(slot.marker.replace('Ponto_EB_',''))}${slot.batchId?` · lote ${e(slot.batchId)}`:''}"><i></i><span>${slot.quantity}</span></div>`).join('')}</div></section>`;
  }

  private stockTab(view:FactoryView):string {
    const slots=(material:Material)=>view.slots.filter(slot=>slot.material===material).map(slot=>`<div class="fc-slot" style="--v:${slot.quantity/slot.capacity*100}%;--c:${MATERIAL_COLOR[material]}" title="${e(slot.marker.replace('Ponto_EB_',''))}"><i></i><span>${slot.quantity}</span></div>`).join('');
    return `<div class="fc-grid"><section class="fc-card"><h4>${uiIcon('warehouse')}Matéria-prima</h4>${this.stockBars(view)}<div class="fc-slots">${slots('MALTE')}${slots('MIX')}</div></section>
      <section class="fc-card"><h4>${uiIcon('package')}Produto acabado</h4><div class="fc-slots">${slots('PRODUTO')}</div></section></div>
      ${this.orderCard(view)}
      <p class="fc-why">Matéria-prima chega por compra do dono da empresa (abaixo) e produto sai pela aba Doca e cargas, nos caminhões dos motoristas.</p>`;
  }
  /** The raw material under way (bought by the firm's owners in Perfil → Gerenciar empresa): the drivers' app and the supplier's own driver bring it. */
  private orderCard(view:FactoryView):string {
    const live=view.orders.filter(order=>order.kind==='purchase'&&(order.status==='open'||order.status==='accepted'));
    const now=Date.now(),rows=live.map(order=>{
      const npc=order.dueAt?Date.parse(order.dueAt):(Date.parse(order.createdAt??order.updatedAt??'')||now)+FACTORY_NPC_DELIVERY_MIN*60_000,left=Math.max(0,Math.ceil((npc-now)/60_000));
      const accepted=order.status==='accepted',time=new Date(npc).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      return `<div class="fc-order"><header>${uiIcon('truck')}${order.pallets} palete${order.pallets>1?'s':''} de ${order.material}<span class="fc-pill" data-tone="${accepted?'run':'wait'}">${accepted?'Com motorista':'Aberto para motoristas'}</span></header>
        <p class="fc-why">${accepted?'Um motorista pegou e está buscando no fornecedor.':`Sem motorista, o fornecedor entrega às ${time} (em ${left} min).`}</p></div>`;
    }).join('');
    return `<section class="fc-card" data-tone="${live.length?'wait':'idle'}"><h4>${uiIcon('truck')}Matéria-prima a caminho</h4>
      <p class="fc-why">Quem compra matéria-prima é o dono da empresa (Perfil → Gerenciar empresa), pagando com o saldo da firma. A carga aparece no celular (app HighCargo) de quem tem caminhão; se ninguém pegar, o motorista do fornecedor entrega em até ${FACTORY_NPC_DELIVERY_MIN} minutos.</p>
      ${rows||'<p class="fc-why">Nenhum pedido em andamento.</p>'}</section>`;
  }
  /** The dock: the drivers' trucks parked at the gate, what the operator may do with them, the open pickups and the trips on the road. */
  private dockTab(view:FactoryView):string {
    const me=this.hooks.userId(),f=view.finance,trucks=view.dock.trucks,active=view.shipments.filter(trip=>SHIPMENT_ACTIVE.includes(trip.status));
    const tripOf=(truck:DockTruck)=>active.find(trip=>trip.vehicleId===truck.vehicleId);
    const product=view.slots.filter(slot=>slot.material==='PRODUTO').reduce((sum,slot)=>sum+slot.quantity,0),pallets=Math.floor(product/18);
    // The operator needs a shift, the PPE and to be at the panel or the dock; the driver only needs the truck at the dock.
    const operatorGate=!view.me.onShift?'Entre em expediente na entrada de pessoal.':!view.me.ppe?'Coloque o EPI no armário da entrada.':!(canReach('panel',this.self)||nearDock(this.self))?'Use o painel da sala de controle ou chegue perto da doca.':'';
    const button=(label:string,attrs:string,enabled:boolean,why:string,css='')=>`<button type="button" class="fc-btn ${css}${enabled?'':' off'}" ${attrs} aria-disabled="${!enabled}" data-why="${enabled?'':e(why)}" title="${enabled?'':e(why)}">${label}</button>`;
    const truckRow=(truck:DockTruck)=>{
      const trip=tripOf(truck),mine=truck.ownerId===me||truck.driverId===me,atDock=nearDock(this.self,6);
      let status='Vazio, esperando carga (qualquer caminhão na doca pode ser carregado)',actions='';
      if(trip?.status==='loaded'){
        status=`Carregado com ${trip.pallets} palete(s) de produto: a venda é paga quando ele sair da fábrica`;
        actions=button('Devolver a carga ao estoque',`data-factory="shipment.cancel" data-shipment="${e(trip.id)}" data-sure="Tirar a carga do caminhão e devolvê-la ao estoque?"`,!operatorGate,operatorGate);
      }else if(trip?.status==='returning'){
        status=`Trouxe ${trip.pallets} palete(s) de ${trip.material}: pronto para descarregar`;
        actions=button('Descarregar nas prateleiras',`data-factory="dock.unload" data-vehicle="${e(truck.vehicleId)}"`,!operatorGate,operatorGate,'primary next')+(mine?button('Desistir da coleta',`data-factory="shipment.cancel" data-shipment="${e(trip.id)}" data-sure="Desistir da coleta? A carga do baú se perde."`,true,''):'');
      }else if(trip?.status==='to_supplier'){
        status=`Em coleta de ${trip.material} (${e(trip.destLabel)})`;
        actions=mine?button('Desistir da coleta',`data-factory="shipment.cancel" data-shipment="${e(trip.id)}" data-sure="Desistir da coleta?"`,true,''):'';
      }else{
        const max=Math.min(f.maxPalletsPerTruck,pallets);
        actions=[1,2,5].filter(n=>n<=f.maxPalletsPerTruck).map(n=>button(`Carregar ${n} palete${n>1?'s':''}`,`data-factory="dock.load" data-vehicle="${e(truck.vehicleId)}" data-pallets="${n}"`,!operatorGate&&pallets>=n,operatorGate||`Só há ${pallets} palete(s) no estoque.`)).join('')
          +button(`Carregar tudo (${max})`,`data-factory="dock.load" data-vehicle="${e(truck.vehicleId)}" data-pallets="${Math.max(1,max)}"`,!operatorGate&&max>=1,operatorGate||'Não há palete no estoque.','primary');
        actions+=view.orders.filter(order=>order.status==='open').map(order=>button(`Pegar coleta: ${order.pallets} palete(s) de ${order.material}`,`data-factory="dock.accept" data-order="${e(order.id)}" data-vehicle="${e(truck.vehicleId)}"`,atDock||mine,'Chegue perto da doca para pegar a coleta.','primary')).join('');
      }
      return `<div class="fc-order"><header>${uiIcon('truck')}${e(truck.plate||'Caminhão')}${truck.ownerName?` · de ${e(truck.ownerName)}`:' · sem dono'}${truck.driverId===me?'<span class="fc-pill" data-tone="run">Você dirige</span>':truck.driverId?'<span class="fc-pill">Com motorista</span>':'<span class="fc-pill" data-tone="wait">Sem motorista</span>'}</header><p class="fc-why">${status}</p><div class="fc-actions">${actions}</div></div>`;
    };
    const trips=active.map(trip=>{
      const where=trip.status==='loaded'?'na doca, esperando sair':trip.status==='in_transit'?`a caminho de ${e(trip.destLabel)}`:trip.status==='to_supplier'?`indo buscar em ${e(trip.destLabel)}`:'voltando à doca';
      return `<tr><td>${e(trip.plate||'—')}</td><td>${e(trip.driverName||'sem motorista')}</td><td>${trip.kind==='sale'?'Venda':'Coleta'} · ${trip.pallets} palete(s) ${e(trip.material==='PRODUTO'?'de produto':trip.material)}</td><td>${where}</td><td>${trip.freight?`${trip.freight} moedas de frete`:'—'}</td></tr>`;
    }).join('');
    const open=view.orders.filter(order=>order.status==='open');
    return `<div class="fc-grid"><section class="fc-card" data-tone="${trucks.length?'wait':'idle'}"><h4>${uiIcon('truck')}Caminhões na doca<span class="fc-pill">${trucks.length}</span></h4>
        <p class="fc-why">Qualquer caminhão estacionado parado no círculo da doca recebe a carga. Quem estiver ao volante recebe a rota (GPS) e o frete, e pode trocar de motorista a qualquer hora. A venda é paga quando o caminhão sai da fábrica.</p>
        ${trucks.map(truckRow).join('')||'<p class="fc-why">Nenhum caminhão na doca. Estacione parado no círculo da doca (portão de carga).</p>'}
        <p class="fc-why">Produto pronto no estoque: ${pallets} palete(s) (${product} sacos).</p></section>
      <section class="fc-card"><h4>${uiIcon('coins')}Como o dinheiro se divide</h4><table class="fc-table"><tbody>
        <tr><td>Palete vendido</td><td>${f.palletPrice} moedas</td></tr><tr><td>Imposto (vai ao cofre da cidade)</td><td>${f.taxPercent}%</td></tr>
        <tr><td>Funcionário que carregou</td><td>${f.employeeFee} moedas por carga</td></tr><tr><td>Dono da firma</td><td>o que sobra</td></tr>
        <tr><td>Frete do motorista</td><td>${f.freightBase} + ${f.freightPerKm}/km + ${f.freightPerPallet}/palete</td></tr><tr><td>Coleta de matéria-prima</td><td>${f.purchaseFreight} + frete por km</td></tr></tbody></table>
        <p class="fc-why">Tudo isso é ajustado pela administração. Até ${f.maxPalletsPerTruck} paletes por caminhão.</p></section></div>
      ${open.length?`<h3>Coletas abertas para motoristas</h3>${open.map(order=>`<div class="fc-order"><header>${uiIcon('package')}${order.pallets} palete(s) de ${order.material}<span class="fc-pill" data-tone="wait">Aberta</span></header><p class="fc-why">O motorista aceita no app HighCargo do celular (ao volante) ou aqui, com o caminhão na doca, busca no fornecedor (rota sorteada) e volta; o operador (ou a equipe da doca) descarrega e o frete é pago. Sem motorista até o prazo, o fornecedor entrega.</p></div>`).join('')}`:''}
      <h3>Cargas na estrada</h3>${trips?`<table class="fc-table"><tbody><tr><th>Placa</th><th>Motorista</th><th>Carga</th><th>Onde</th><th>Frete</th></tr>${trips}</tbody></table>`:'<p class="fc-why">Nenhuma carga em andamento.</p>'}`;
  }

  private alarmList(alarms:FactoryView['alarms'],compact=false):string {
    if(!alarms.length)return '<p class="fc-why">Nenhum alarme ativo.</p>';
    return alarms.slice().reverse().map(alarm=>`<div class="fc-alarm${alarm.acknowledged?' ack':''}" data-sev="${alarm.severity}" data-id="${e(alarm.id)}"><p><b>${e(alarm.source)}</b> · ${e(alarm.text)}</p>${!alarm.acknowledged&&!compact?`<button type="button" class="fc-btn" data-factory="cmd" data-action="alarm.ack" data-target="${e(alarm.id)}">Reconhecer</button>`:''}</div>`).join('');
  }
  private alarmsTab(view:FactoryView):string {
    const live=view.alarms.filter(alarm=>alarm.active!==false);
    return `<div class="fc-grid"><section class="fc-card" data-tone="${live.some(alarm=>!alarm.acknowledged&&alarm.severity!=='info')?'bad':'idle'}"><h4>${uiIcon('alert')}Alarmes ativos</h4>${this.alarmList(live)}
      ${live.some(alarm=>!alarm.acknowledged)?`<div class="fc-actions"><button type="button" class="fc-btn" data-factory="cmd" data-action="alarm.ack.all">Reconhecer todos</button></div>`:''}</section>
      <section class="fc-card" data-tone="${view.emergency?'bad':'idle'}"><h4>${uiIcon('shield')}Emergência<span class="fc-pill" data-tone="${view.emergency?'bad':'idle'}">${view.emergency?'Acionada':'Normal'}</span></h4>
      <p class="fc-why">A parada de emergência congela tanques, secador e ensaque até ser rearmada no painel.</p>
      <div class="fc-actions">${this.button({action:'emergency',label:'Parada de emergência',enabled:!view.emergency,why:'Já acionada.',tone:'danger'},'panel',view)}${this.button({action:'emergency.reset',label:'Rearmar emergência',enabled:view.emergency,why:'Não há emergência.',tone:'primary',next:view.emergency},'panel',view)}</div></section></div>`;
  }

  private employmentTab(view:FactoryView|undefined):string {
    const job=this.employment?.employment,shift=this.employment?.shift,hired=job?.status==='hired';
    const cooldown=job?.cooldownUntil?new Date(job.cooldownUntil):undefined,waiting=!!cooldown&&cooldown.getTime()>Date.now();
    const atEntrance=!!this.self&&(canReach('panel',this.self)||(()=>{const at=CITY_MARKERS.Ponto_EB_Entrada_Pessoal;return !!at&&Math.hypot(this.self!.x-at.x,this.self!.z-at.z)<=3;})());
    const atCloset=!!this.self&&(()=>{const at=CITY_MARKERS.Ponto_EB_Entrada_Pessoal;return !!at&&Math.hypot(this.self!.x-at.x,this.self!.z-at.z)<=3;})();
    const on=view?.me.onShift,ppe=view?.me.ppe;
    let status:string;
    if(!this.employment)status='<p class="fc-why">Carregando seu vínculo…</p>';
    else if(job?.status==='applied')status=`<p><b>Candidatura enviada.</b> Os donos e gerentes da EMPRESA BRASIL vão avaliar; quando você for admitido, entre em expediente na entrada de pessoal.</p><div class="fc-actions"><button type="button" class="fc-btn" data-factory="withdraw">Cancelar candidatura</button></div>`;
    else if(!hired)status=`<p>${job?(job.status==='resigned'?'Você pediu demissão.':'Você foi desligado.'):'Você não trabalha na EMPRESA BRASIL.'} O cargo é <b>Operador de Spray Dry</b>: você prepara os lotes nos tanques, seca no secador, ensaca, paletiza e limpa a fábrica. Quem admite é o dono ou um gerente da empresa.</p>
      ${waiting?`<p class="fc-why">Nova candidatura liberada em ${cooldown!.toLocaleString('pt-BR')}.</p>`:''}<div class="fc-actions"><button type="button" class="fc-btn primary${waiting?' off':' next'}" data-factory="hire" aria-disabled="${waiting}" data-why="Espere o tempo de espera terminar.">Candidatar-se à vaga</button></div>`;
    else status=`<p><b>Contratado</b> desde ${new Date(job!.hiredAt).toLocaleDateString('pt-BR')}.${shift?` Em serviço desde ${new Date(shift.startedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} · ganhos no turno: <b>${shift.earned}</b> moedas.`:' Fora de serviço.'}</p>
      <div class="fc-actions"><button type="button" class="fc-btn primary${atEntrance?'':' off'}${!on&&atEntrance?' next':''}" data-factory="shift" aria-disabled="${!atEntrance}" data-why="Vá até a entrada de pessoal ou o painel.">${on?'Encerrar expediente':'Entrar em expediente'}</button>
      <button type="button" class="fc-btn${atCloset?'':' off'}${on&&!ppe&&atCloset?' next':''}" data-factory="ppe" aria-disabled="${!atCloset}" data-why="Pegue o EPI no armário da entrada de pessoal.">${ppe?'Guardar o EPI':'Colocar o EPI'}</button>
      <button type="button" class="fc-btn danger" data-factory="resign">Pedir demissão</button></div>${atEntrance?'':'<p class="fc-why">Expediente e EPI: na entrada de pessoal (ou no painel, para o expediente).</p>'}`;
    return `<div class="fc-grid"><section class="fc-card" data-tone="${hired?(on?'run':'wait'):'idle'}"><h4>${uiIcon('briefcase')}Meu emprego</h4>${status}</section>
      <section class="fc-card"><h4>${uiIcon('coins')}Quanto paga</h4><table class="fc-table"><tbody>
        <tr><td>Cada carga de caminhão que você carrega</td><td>${view?`${view.finance.employeeFee} moedas`:'—'}</td></tr><tr><td>Saco empilhado</td><td>3 moedas</td></tr><tr><td>Palete completo (bônus)</td><td>+20</td></tr><tr><td>Lote aprovado</td><td>até 12 (pela qualidade)</td></tr><tr><td>Limpar um lugar da fábrica</td><td>12 a 40 moedas</td></tr><tr><td>Presença sem produção rodando (com EPI, na fábrica)</td><td>${FACTORY_IDLE_PAY.amount} a cada ${FACTORY_IDLE_PAY.everyS/60} min</td></tr></tbody></table>
        <p class="fc-why">A taxa da carga é paga assim que o caminhão sai da fábrica; o que sobra da venda, depois do imposto, é do dono da firma. Os ganhos de trabalho (sacos, paletes, lotes) têm limite diário (${JOB_DAILY_CAP} moedas); a taxa da carga fica fora dele.</p></section>
      <section class="fc-card"><h4>${uiIcon('help')}Como funciona</h4><ol class="fc-list num"><li>Candidate-se (o dono ou um gerente admite), entre em expediente e coloque o EPI (entrada de pessoal).</li><li>Sem ordem de produção (OP) a fábrica não produz: o gerente aprova uma e você a inicia no painel (aba Início).</li><li>Encha um tanque de água: ele aquece sozinho.</li><li>Ligue o agitador, abra a tampa, pegue sacos nas prateleiras (E) e despeje no tanque (E, na plataforma).</li><li>Espere dissolver e homogeneizar; colha a amostra e aprove.</li><li>Pré-aqueça o secador e alimente com o tanque aprovado.</li><li>Posicione sacos vazios, ensaque, costure e empilhe; armazene o palete pronto.</li><li>Com paletes prontos, um motorista estaciona o caminhão na doca: carregue-o pela aba Doca e cargas. Quando ele sair, você recebe a taxa da carga.</li><li>Ao fim da ordem a fábrica fica suja: lave os tanques, o secador, a linha e os pisos antes da próxima.</li></ol></section></div>`;
  }

  /** The small status over the scene while on shift with the panel closed: what to do next, in the guide's words. */
  private updateHud():void {
    const view=this.view,self=this.self;
    if(!this.hud){this.hud=document.createElement('div');this.hud.className='fc-hud';this.hud.setAttribute('role','status');(document.querySelector('#app')??document.body).append(this.hud);}
    const route=this.routeView;
    if(route&&!this.win){
      const html=`<b>${e(route.title)}</b><span>${e(route.label)} · ${route.pallets} palete(s)${route.status==='loaded'?'':` · frete ${route.freight}`}</span>`;
      if(this.hud.innerHTML!==html)this.hud.innerHTML=html;this.hud.dataset.sev='ok';this.hud.classList.add('show');return;
    }
    const progress=this.cleanProgress();
    if(progress!==null&&!this.win){
      const task=cleanTaskOf(this.cleaning!.task),html=`<b>Limpando: ${e(task?.label??'')}</b><span>${Math.round(progress*100)}% · fique no lugar</span><i class="fc-hud-bar" style="--v:${(progress*100).toFixed(0)}%"></i>`;
      if(this.hud.innerHTML!==html)this.hud.innerHTML=html;this.hud.dataset.sev='ok';this.hud.classList.add('show');return;
    }
    const show=!!view?.me.onShift&&!this.win&&!!self&&distanceToFactory(self.x,self.z)<=WATCH_OUT&&!!this.guideStep;
    if(!show){this.hud.classList.remove('show');return;}
    const live=view!.alarms.filter(alarm=>alarm.active!==false&&!alarm.acknowledged&&alarm.severity!=='info');
    const step=this.guideStep!;
    const sev=view!.emergency||live.some(alarm=>alarm.severity!=='warning')?'bad':live.length?'warn':'ok';
    const html=`<b>${e(step.title)}</b><span>${view!.me.carrying?`com saco de ${view!.me.carrying} · `:''}${view!.me.ppe?'EPI ✓':'sem EPI'}</span>`;
    if(this.hud.innerHTML!==html)this.hud.innerHTML=html;
    this.hud.dataset.sev=sev;this.hud.classList.add('show');
  }
}
