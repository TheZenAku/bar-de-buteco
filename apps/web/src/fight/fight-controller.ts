import {FIGHT,FIGHT_MOVES,punchAim,punchAllowed,punchStep,type BlockCommand,type FightHit,type FightTarget,type PlayerState,type PressKind,type PunchCommand,type PunchId,type PunchStream} from '@bar/shared';

/**
 * The fist fight in this browser (docs/sistemas/luta.md): the guard the player asked for (R), the presses waiting for the feet to be free (the
 * input buffer), which punch each one throws and at whom (the shared rules and aim, packages/shared/src/fight.ts), and what is drawn ahead of the
 * room: the local punch from the click, the blow taken from the moment its message arrives. The room's state settles everything (`reconcile`).
 */
export interface FightControllerHooks {
  serverNow():number;
  /** Where the camera looks (a heading, as PlayerState.rotation). */
  view():number;
  /** The local avatar's predicted feet, and the others as drawn (the aim goes at what the player sees). */
  position():{x:number;y:number;z:number};
  targets():FightTarget[];
  /** The newest state the browser drew from: its serverTime, and how long ago it arrived (ms). Lag compensation (fight.ts, rewindOf). */
  seen():{seen:number;ago:number};
  /** The guard went up or down here (the mouse capture and the prompt follow it). */
  changed(guard:boolean):void;
}
/** A punch drawn ahead of the room: which, the count sent with it, the input that carried it, when it started here (performance.now). */
export interface LocalPunch {move:PunchId;n:number;seq:number;startedAt:number;landed?:boolean}
/** A blow this player took, drawn from the moment the room's message arrived (performance.now): the reaction, which way it came, until when it stuns. */
export interface LocalBlow {reaction:string;yaw:number;startedAt:number;until:number}

export class FightController {
  /** The guard as this player wants it. */
  guard=false;
  local?:LocalPunch;
  blow?:LocalBlow;
  /** The block key is held, and whether the last input built carried the block (the room is told of the press once, with how late it is). */
  blocking=false;
  /** The block as sent: up from the input that carried it (drawn at once, ahead of the room). */
  blockUp=false;
  private presses:{kind:PressKind;at:number}[]=[];
  private n=0;
  /** The first input sent with the guard up since it was raised: once the room has answered it, its state is the truth. */
  private askedAt?:number;
  constructor(private readonly hooks:FightControllerHooks){}

  /** R. Up only on foot and with free hands (the room checks again); down any time. Returns the refusal, if any. */
  toggle(self:PlayerState|undefined):string {
    if(this.guard){this.lower();return '';}
    if(!self)return '';
    const why=self.holding||self.carrying||self.parcel?'Largue o que está na mão antes de levantar a guarda.'
      :self.fireworkEquipped?'Guarde o fogo de artifício antes de lutar.'
      :(self.interactionState&&self.interactionState!=='stagger')||self.currentTableId?'Termine o que está fazendo antes de levantar a guarda.':'';
    if(why)return why;
    this.guard=true;this.askedAt=undefined;this.presses.length=0;this.blockUp=false;
    this.hooks.changed(true);
    return '';
  }
  lower():void {
    if(!this.guard)return;
    this.guard=false;this.askedAt=undefined;this.presses.length=0;this.blockUp=false;this.blocking=false;
    this.hooks.changed(false);
  }
  /** The block key went down or up (Space; the touch button). Held with the guard up; nothing happens with it down. */
  setBlock(down:boolean):void {
    this.blocking=down&&this.guard;
    if(!down)this.blockUp=false;
  }
  /** Left button: a light punch, right: the heavy one, the skill key: a kick (Rafael's). False when the guard is down (the click is the view's). */
  press(kind:PressKind):boolean {
    if(!this.guard)return false;
    // Hands up for the block: the click is spent (no punch waits for the key to be let go).
    if(this.blocking)return true;
    this.presses.push({kind,at:performance.now()});
    // Mashing does not stack up punches for later: two waiting at most.
    if(this.presses.length>2)this.presses.shift();
    return true;
  }
  /** Stunned by a blow, or held by anything else (a kick of Rafael's on its way): nothing is thrown (presses wait out their buffer). */
  private stunned(self:PlayerState):boolean {
    return (self.fist?.stunUntil??0)>this.hooks.serverNow()||(self.fist?.breakUntil??0)>this.hooks.serverNow()||!!self.interactionState||(!!this.blow&&performance.now()<this.blow.until);
  }

  /**
   * For every input the network builds, in order (`seq` is the one being built, `stream` the punches as predicted so far): the guard, and the
   * punch a waiting press throws now, if the rules allow it, facing whom the aim found; while a punch plants the feet, its facing.
   */
  decorate(seq:number,stream:PunchStream,self:PlayerState):{fight:boolean;punch?:PunchCommand;rotation?:number;block?:boolean;blockAt?:BlockCommand} {
    if(!this.guard)return {fight:false};
    this.askedAt??=seq;
    const now=performance.now();
    // The block, by the same rule as the room (world/fight.ts move): held with the feet free and not stunned. It takes the hands: no punch with it.
    const planted=punchStep(stream,seq,self.skin).locked;
    if(this.blocking&&!planted&&!this.stunned(self)){
      const edge=!this.blockUp;
      this.blockUp=true;this.presses.length=0;
      if(edge){const {seen,ago}=this.hooks.seen();return {fight:true,block:true,blockAt:{seen,ago:Math.min(10_000,Math.round(ago))}};}
      return {fight:true,block:true};
    }
    this.blockUp=false;
    this.presses=this.presses.filter(press=>now-press.at<=FIGHT.bufferMs);
    if(this.presses.length&&!this.stunned(self)){
      const move=punchAllowed(stream,seq,this.presses[0]!.kind,self.skin);
      if(move){
        this.presses.shift();
        const aim=punchAim(self.skin,move,this.hooks.position(),this.hooks.view(),this.hooks.targets()),{seen,ago}=this.hooks.seen();
        this.n=(this.n+1)&255;
        this.local={move,n:this.n,seq,startedAt:now};
        return {fight:true,punch:{m:move,n:this.n,lunge:Math.round(aim.lunge*1000)/1000,seen,ago:Math.min(10_000,Math.round(ago))},rotation:aim.yaw};
      }
    }
    return punchStep(stream,seq).locked?{fight:true,rotation:stream.yaw}:{fight:true};
  }

  /** The room's word, with each state: `acked` is the last input it ran. A guard it lowered or refused, a punch it did not take, the end of what is drawn ahead. */
  reconcile(self:PlayerState,acked:number):void {
    if(this.guard&&this.askedAt!==undefined&&acked>=this.askedAt&&!self.fist?.fight)this.lower();
    if(this.local){
      const move=FIGHT_MOVES[this.local.move];
      if((acked>=this.local.seq&&self.fist?.n!==this.local.n)||performance.now()-this.local.startedAt>move.durationMs)this.local=undefined;
    }
    if(this.blow&&performance.now()-this.blow.startedAt>2000)this.blow=undefined;
    // Thrown or out: what was drawn ahead is the room's now.
    if(self.interactionState==='thrown'||(self.interactionState&&self.interactionState!=='stagger'&&self.interactionState!=='kick')){this.local=undefined;this.blow=undefined;}
  }

  /** A punch landed near this player (fight.hit): on them, they react and are held from now, before the state says so. */
  hit(hit:FightHit,me:string):void {
    const now=performance.now();
    if(hit.guard==='parry'){
      // Parried: the puncher recoils (the room's word, drawn from its message); the one who parried carries on.
      if(hit.by!==me)return;
      this.local=undefined;this.presses.length=0;this.blockUp=false;
      this.blow={reaction:hit.reaction,yaw:hit.yaw,startedAt:now,until:now+Math.max(0,hit.stunUntil-hit.at)};
      return;
    }
    if(hit.to!==me)return;
    // A block that held leaves the one defending up; one that broke stuns them like a blow.
    if(hit.guard==='block')return;
    this.local=undefined;this.presses.length=0;this.blockUp=false;
    if(hit.ko){this.blow=undefined;this.lower();return;}
    this.blow={reaction:hit.reaction,yaw:hit.yaw,startedAt:now,until:now+Math.max(0,hit.stunUntil-hit.at)};
  }
}
