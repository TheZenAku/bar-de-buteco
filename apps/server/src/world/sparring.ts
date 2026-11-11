import {SPARRING,SPARRING_FOE_PREFIX,SPARRING_NPC,FIGHT,FIGHT_MOVES,realMs,TICK_MS,isWalkable,movePlayer,nearSparring,normalizeHeading,punchAim,punchAllowed,punchById,sparringTier,streamOf,
  type Collider,type PlayerInput,type PressKind,type SparringClaim,type SparringDialog,type SparringResult,type SparringState,type SparringStatus,type SparringTier} from '@bar/shared';
import {Player} from '../state.js';
import type {FightDirector} from './fight.js';

/** What the sparring needs from the room (a test gives it a stand-in, see test/sparring.test.ts). */
export interface SparringHost {
  now():number;
  random():number;
  /** The foe's body enters and leaves the room's players, and the idle Zeca of the terrace steps out and back. */
  addFoe(foe:Player):void;
  removeFoe(id:string):void;
  idleNpc(present:boolean):void;
  /** A message to one player. */
  send(userId:string,type:string,message:unknown):void;
  /** Why the guard cannot go up for this player now ('' if it can). */
  guardRefusal(player:Player):string;
  /** The API's ladder (apps/api/src/sparring-service.ts): where the player is, and the prize of a win (rejects with `status` 409 while they wait). */
  status(userId:string):Promise<SparringStatus>;
  win(userId:string,requestId:string):Promise<SparringClaim>;
  /** A prize was paid: the wallet, the badges and the XP follow. */
  paid(userId:string,claim:SparringClaim):void;
  obstacles():readonly Collider[];
  log(event:string,details:Record<string,unknown>):void;
  takeSlot():number;
  randomId():string;
}

const LINES={
  waiting:(left:string)=>`Hoje já levou o prêmio, hein? Volta daqui a ${left}. Se quiser treinar de graça, tem o saco de pancada ali... brincadeira, não tem.`,
  busy:'Calma, tô no meio de uma luta aqui. Espera o rapaz terminar.',
  first:['E aí, parceiro! Tá me olhando torto? Então bora resolver isso no braço: um sparring, valendo moedas.','Ô de casa! Falam que você bate bem. Quer provar? Sobe a guarda que eu pago o prêmio se você me derrubar.','Tô precisando treinar. Que tal uns socos comigo? Se me derrubar, saio daqui mais pobre.'],
  again:['Já de volta? Gostei. Vamos de novo, e dessa vez eu não pego leve.','Você aprendeu a bater. Agora vamos ver se aprendeu a se defender.','Mais uma rodada? Então levanta a guarda.'],
};
export const waitText=(ms:number):string=>{
  const minutes=Math.ceil(ms/60_000),hours=Math.floor(minutes/60),rest=minutes%60;
  return hours?`${hours} h${rest?` ${rest} min`:''}`:`${Math.max(1,minutes)} min`;
};

/** The foe's thinking, one input per tick (SPARRING_TIERS says how sharp): face the player, keep the distance, throw combos, and see blows coming. */
export class SparringAI {
  private nextComboAt:number;
  private combo:readonly PressKind[]=[];private step=0;
  private seenBlowAt=0;
  private plan?:{startAt:number;endAt:number};
  private blocking=false;
  private wasStunned=false;
  private count=0;
  private side=1;private sideAt=0;
  constructor(private readonly tier:SparringTier,private readonly random:()=>number,now:number){this.nextComboAt=now+600+this.random()*500;}
  private between(range:readonly [number,number]):number {return range[0]+(range[1]-range[0])*this.random();}

  /** The input this tick: `self` the foe, `player` who he fights; `seq` the foe's own count of inputs. */
  think(self:Player,player:Player,now:number,seq:number):PlayerInput {
    const dx=player.x-self.x,dz=player.z-self.z,away=Math.hypot(dx,dz)||1e-6,heading=Math.atan2(dx,dz);
    const input:PlayerInput={seq,dx:0,dz:0,running:false,rotation:normalizeHeading(heading),fight:true};
    const fist=self.fist,stream=streamOf(fist);
    if(now<fist.stunUntil||self.interactionState==='stagger'||now<fist.breakUntil){this.blocking=false;this.plan=undefined;this.wasStunned=true;return input;}
    // Back on his feet after a blow: he covers up for a moment (as often as he blocks), so a chain of blows is not free.
    if(this.wasStunned){
      this.wasStunned=false;
      if(this.random()<this.tier.block)this.plan={startAt:now,endAt:now+450+this.random()*550};
      this.combo=[];this.nextComboAt=Math.max(this.nextComboAt,now+300);
    }
    const planted=!!punchById(fist.punch)&&seq-fist.seq<FIGHT_MOVES[fist.punch as keyof typeof FIGHT_MOVES].lockSteps;

    // A blow of the player's on its way: after his reaction time he decides to block it (or to parry it, if he is quick enough).
    const theirs=punchById(player.fist.punch);
    if(theirs&&player.fist.at!==this.seenBlowAt&&now-player.fist.at<realMs(theirs.activeFrom)&&away<2.9&&!planted){
      this.seenBlowAt=player.fist.at;
      const thrownAt=player.fist.at,sees=thrownAt+this.tier.reactMs;
      if(this.random()<this.tier.block){
        // A parry goes up this long before the blow lands; only if he has seen it coming by then.
        const parryAt=thrownAt+realMs(theirs.activeFrom)-110;
        const parry=this.random()<this.tier.parry/Math.max(.01,this.tier.block)&&sees<=parryAt;
        this.plan={startAt:parry?parryAt:Math.max(sees,now),endAt:thrownAt+realMs(theirs.activeTo)+260};
      }
    }
    if(this.plan&&now>this.plan.endAt)this.plan=undefined;
    const wantsBlock=!!this.plan&&now>=this.plan.startAt&&!planted;
    if(wantsBlock){
      input.block=true;
      if(!this.blocking)input.blockAt={seen:now+1,ago:0};
    }
    this.blocking=wantsBlock;

    // Distance: close in until a punch reaches, back off when too close, circle on the hard step.
    let mx=0,mz=0;
    if(away>1.9){mx=dx/away;mz=dz/away;}
    else if(away<.85){mx=-dx/away;mz=-dz/away;}
    if(this.tier.circles&&away<2.4&&!planted){
      if(now>=this.sideAt){this.side=this.random()<.5?-1:1;this.sideAt=now+900+this.random()*1500;}
      mx+=dz/away*.7*this.side;mz+=-dx/away*.7*this.side;
    }
    const length=Math.hypot(mx,mz);
    if(length>1){mx/=length;mz/=length;}
    input.dx=+mx.toFixed(3);input.dz=+mz.toFixed(3);

    // Attack: the next press of a combo, as the shared rules allow it, aimed at the player.
    if(!wantsBlock&&now>=this.nextComboAt&&away<=FIGHT.aimRange){
      if(!this.combo.length){this.combo=this.tier.combos[Math.floor(this.random()*this.tier.combos.length)]!;this.step=0;}
      const move=punchAllowed(stream,seq,this.combo[this.step]!,self.skin);
      if(move){
        const aim=punchAim(self.skin,move,self,heading,[{id:player.id,x:player.x,y:player.y,z:player.z,skin:player.skin}]);
        // `seen` in the future: nothing to rewind, the foe sees the room as it is.
        input.punch={m:move,n:(++this.count)&255,lunge:Math.round(aim.lunge*1000)/1000,seen:now+1,ago:0};
        input.rotation=aim.yaw;
        if(++this.step>=this.combo.length){this.combo=[];this.nextComboAt=now+this.between(this.tier.gapMs);}
      }
    }
    return input;
  }
}

interface Duel {
  userId:string;player:Player;foe:Player;tier:number;ai:SparringAI;requestId:string;
  phase:'countdown'|'fight'|'over';startedAt:number;fightAt:number;endsAt:number;
  playerHp:number;seq:number;
  /** When the foe goes off the stage after the fight. */
  clearAt?:number;
}

/**
 * Zeca's sparring in the room (docs/sistemas/zeca.md): the talk, the fight against a bot made a player of the room (so the whole fist fight, with its
 * block and parry and netcode, applies to him unchanged), the end and the prize. One fight at a time; the fight's lives are its own and the real life
 * bar is never touched (`spares`).
 */
export class SparringDirector {
  private duel?:Duel;
  constructor(private readonly host:SparringHost,private readonly fights:FightDirector){}

  get active():boolean {return !!this.duel&&this.duel.phase!=='over';}
  duelOf(userId:string):Duel|undefined {return this.duel?.userId===userId?this.duel:undefined;}
  /** Whether this body is the foe of the fight in progress. */
  isFoe(id:string):boolean {return !!this.duel&&this.duel.foe.id===id;}
  /** Whether nobody can hurt the real life of this player right now: they are in the ring (the foe's life is a real one, a ko ends the fight). */
  spares(target:Player):boolean {return !!this.duel&&this.duel.phase!=='over'&&this.duel.userId===target.id;}
  /** Whether the foe can be hit: not during the count, nor once the fight is over. */
  hittable(foe:Player,now:number):boolean {return !!this.duel&&this.duel.foe===foe&&this.duel.phase==='fight'&&now>=this.duel.fightAt;}

  /** The player talks to him: what he says, and whether the fight is on offer. */
  async talk(player:Player):Promise<SparringDialog> {
    if(!nearSparring(player))return {line:'Chega mais perto, que eu não grito.',can:false};
    if(this.active&&this.duel!.userId!==player.id)return {line:LINES.busy,can:false,busy:true};
    if(this.active)return {line:'Foco na luta!',can:false,busy:true};
    const status=await this.host.status(player.id);
    if(status.cooldownMs>0)return {line:LINES.waiting(waitText(status.cooldownMs)),can:false,cooldownMs:status.cooldownMs};
    const lines=status.tier===0?LINES.first:LINES.again;
    return {line:lines[Math.floor(this.host.random()*lines.length)]!,can:true};
  }

  /** The player accepted: the fight starts (a count first), the foe takes the terrace. Returns the reason it did not, if so. */
  async accept(player:Player):Promise<string> {
    if(!nearSparring(player))return 'Chegue mais perto do Zeca.';
    if(this.active)return this.duel!.userId===player.id?'Você já está lutando.':'O Zeca está no meio de outra luta.';
    const why=this.host.guardRefusal(player);
    if(why)return why;
    const status=await this.host.status(player.id);
    if(this.active)return 'O Zeca está no meio de outra luta.';
    if(status.cooldownMs>0)return `O Zeca só paga de novo daqui a ${waitText(status.cooldownMs)}.`;
    const now=this.host.now(),tier=sparringTier(status.tier);
    const foe=new Player().assign({id:SPARRING_FOE_PREFIX+player.id,slot:this.host.takeSlot(),displayName:SPARRING.name,color:'#c0392b',skin:SPARRING.skin,connected:true,
      x:SPARRING.spot.x,y:SPARRING.spot.y,z:SPARRING.spot.z,rotation:Math.atan2(player.x-SPARRING.spot.x,player.z-SPARRING.spot.z),hp:tier.hp,hpCore:0});
    // The player is brought to a fighting distance in front of him, if the floor is there.
    const dx=player.x-foe.x,dz=player.z-foe.z,away=Math.hypot(dx,dz),yaw=away>.2?Math.atan2(dx,dz):0;
    const place={x:foe.x+Math.sin(yaw)*2.1,z:foe.z+Math.cos(yaw)*2.1};
    if(isWalkable(place.x,place.z,foe.y))Object.assign(player,{x:place.x,z:place.z});
    player.rotation=Math.atan2(foe.x-player.x,foe.z-player.z);
    this.host.idleNpc(false);
    this.host.addFoe(foe);
    this.fights.guard(foe,{fight:true});
    this.duel={userId:player.id,player,foe,tier:status.tier,ai:new SparringAI(tier,()=>this.host.random(),now+SPARRING.countdownMs),requestId:this.host.randomId(),phase:'countdown',startedAt:now,fightAt:now+SPARRING.countdownMs,
      endsAt:now+SPARRING.countdownMs+SPARRING.maxMs,playerHp:SPARRING.playerHp,seq:0};
    this.host.send(player.id,'sparring.start',{});
    this.state(this.duel);
    this.host.log('sparring_start',{playerId:player.id,tier:status.tier});
    return '';
  }

  /** Damage on one of the two: it is the fight's life, not the real one. Returns whether it was taken here. */
  damage(target:Player,amount:number):boolean {
    const duel=this.duel;
    if(!duel||duel.phase==='over')return false;
    if(target===duel.foe){duel.foe.hp=Math.max(1,duel.foe.hp-amount);this.state(duel);return true;}
    if(target.id===duel.userId){
      duel.playerHp=Math.max(0,duel.playerHp-Math.max(1,Math.round(amount*sparringTier(duel.tier).damage)));
      this.state(duel);
      if(duel.playerHp<=0)void this.end(duel,false,'down');
      return true;
    }
    return false;
  }
  /** The blow that would empty the foe's life: the fight is won (the room throws nobody). Returns whether it was the foe. */
  knocked(target:Player):boolean {
    const duel=this.duel;
    if(!duel||target!==duel.foe||duel.phase==='over')return false;
    duel.foe.hp=0;this.state(duel);
    void this.end(duel,true,'ko');
    return true;
  }

  /** Someone left the room (or dropped): their fight is over. */
  left(userId:string):void {
    const duel=this.duel;
    if(duel&&duel.userId===userId&&duel.phase!=='over')void this.end(duel,false,'left');
  }
  /** The player gave up (or stepped away): lost, without a prize. */
  quit(userId:string):void {this.left(userId);}

  /** One tick, before the fist fight's own: the foe's input, and the fight's limits. */
  step(now:number):void {
    const duel=this.duel;
    if(!duel)return;
    if(duel.phase==='over'){if(duel.clearAt&&now>=duel.clearAt)this.clear();return;}
    const {player,foe}=duel;
    if(!player.connected||(player.interactionState&&!['stagger','kick'].includes(player.interactionState))||player.currentTableId){void this.end(duel,false,'left');return;}
    if(Math.hypot(player.x-SPARRING.spot.x,player.z-SPARRING.spot.z)>SPARRING.leash||Math.abs(player.y-SPARRING.spot.y)>1.5){void this.end(duel,false,'left');return;}
    if(duel.phase==='countdown'&&now>=duel.fightAt){duel.phase='fight';this.state(duel);}
    if(duel.phase==='fight'&&now>=duel.endsAt){void this.end(duel,false,'time');return;}
    // The foe's inputs: still through the count, then the bot's.
    // The player may have walked into him since last tick: he gives way before he thinks, so the bot sees the real distance.
    this.separate(foe,player);
    const input=duel.phase==='fight'?duel.ai.think(foe,player,now,++duel.seq):{seq:++duel.seq,dx:0,dz:0,running:false,rotation:foe.rotation,fight:true} satisfies PlayerInput;
    this.fights.guard(foe,input);
    if(!foe.interactionState&&foe.fist.fight)this.fights.move(foe,input,now,false,this.host.obstacles() as Collider[]);
    // And what his own step (a lunge, the clip's way) carried him into.
    this.separate(foe,player);
    foe.lastProcessedInput=input.seq;
  }

  /**
   * Nobody stands inside anybody (FIGHT.bodyGap). The foe is a bot: no browser predicts his body, so he is the one who yields, straight away from the player.
   * Inside each other the block's arc, the aim and the fist's way all fall apart (the blow comes "from behind", the fist starts past the body), and he could
   * end up behind the player. A wall at his back leaves him where he is.
   */
  private separate(foe:Player,player:Player):void {
    const dx=foe.x-player.x,dz=foe.z-player.z,away=Math.hypot(dx,dz);
    if(away>=FIGHT.bodyGap||Math.abs(foe.y-player.y)>1.2)return;
    // Right on top of him: out through his own front, as he was facing.
    const x=away>.01?dx/away:Math.sin(foe.rotation),z=away>.01?dz/away:Math.cos(foe.rotation),dt=TICK_MS/1000;
    // Straight away first; with a wall there, along it to either side.
    for(const [dx2,dz2] of [[x,z],[-z,x],[z,-x]] as const){
      const next=movePlayer(foe,{dx:dx2,dz:dz2,running:false},dt,false,false,this.host.obstacles(),(FIGHT.bodyGap-away)/dt);
      if(Math.hypot(next.x-player.x,next.z-player.z)<=away+1e-3)continue;
      foe.x=next.x;foe.y=next.y;foe.z=next.z;
      return;
    }
  }

  private state(duel:Duel):void {
    const tier=sparringTier(duel.tier);
    const state:SparringState={phase:duel.phase==='over'?'off':duel.phase,foe:{name:SPARRING.name,hp:Math.max(0,Math.round(duel.foe.hp)),max:tier.hp},you:{hp:Math.round(duel.playerHp),max:SPARRING.playerHp},
      until:duel.phase==='countdown'?duel.fightAt:duel.endsAt};
    this.host.send(duel.userId,'sparring.state',state);
  }

  private async end(duel:Duel,won:boolean,reason:SparringResult['reason']):Promise<void> {
    if(duel.phase==='over')return;
    duel.phase='over';
    const now=this.host.now(),{foe}=duel;
    this.fights.lower(foe);
    foe.animationState=won?'fallen':'idle';foe.animationStartedAt=now;
    duel.clearAt=now+SPARRING.afterMs;
    this.host.send(duel.userId,'sparring.state',{phase:won?'won':'lost',foe:{name:SPARRING.name,hp:Math.max(0,Math.round(foe.hp)),max:sparringTier(duel.tier).hp},you:{hp:Math.round(duel.playerHp),max:SPARRING.playerHp},until:0} satisfies SparringState);
    let result:SparringResult;
    if(won){
      try{
        const claim=await this.host.win(duel.userId,duel.requestId);
        this.host.paid(duel.userId,claim);
        result={won:true,reason,prize:claim.prize,balance:claim.balance,message:`Você derrubou o Zeca e levou ${claim.prize} moedas!`,cooldownMs:claim.unlimited?0:claim.cooldownMs};
        this.host.log('sparring_win',{playerId:duel.userId,tier:claim.beaten,prize:claim.prize});
      }catch(error){
        // Won, but the prize was refused (a wait that started meanwhile) or the API is away: the fight counts for nothing else.
        const refused=(error as {status?:number}).status===409;
        result={won:true,reason,prize:0,message:refused?'Você ganhou, mas o Zeca só paga uma vez a cada 6 horas.':'Você ganhou, mas o prêmio não pôde ser pago agora.'};
        this.host.log('sparring_unpaid',{playerId:duel.userId,refused});
      }
    }else{
      result={won:false,reason,prize:0,message:reason==='down'?'O Zeca te derrubou. Tente de novo quando quiser!':reason==='time'?'O tempo acabou. Vale mais tentar de novo!':'A luta foi encerrada.'};
      this.host.log('sparring_lost',{playerId:duel.userId,reason});
    }
    this.host.send(duel.userId,'sparring.result',result);
  }

  private clear():void {
    const duel=this.duel;
    if(!duel)return;
    this.fights.forget(duel.foe.id);
    this.host.removeFoe(duel.foe.id);
    this.host.idleNpc(true);
    this.duel=undefined;
  }
}
export {SPARRING_NPC};
