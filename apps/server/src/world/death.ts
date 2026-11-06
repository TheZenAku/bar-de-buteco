import {DEATH,DEATH_BUTTONS,deathDurationMs,deathStarts,planDeath,pickErrorPhrase,pickPhrase,randomSequence,sequenceLength,showDurationMs,
  type DeathPlan,type DeathScreen,type MorteCategory} from '@bar/shared';

/** What the director needs from the room: bodies, the wire, the map. Kept apart so the whole sequence runs without a room (test/death.test.ts). */
export interface DeathHost {
  now():number;
  random():number;
  /** The victim's body in the room, or nothing when there is none. */
  body(id:string):{x:number;y:number;z:number;rotation:number;name:string}|undefined;
  /** Takes the body out of everything (tables, bike, chair) and holds it still: `'death'`, then `'death-gone'` once the cloud covers it. */
  hold(id:string,state:'death'|'death-gone'):void;
  /** The scene, to everybody near the victim (and to the victim). */
  scene(plan:DeathPlan):void;
  /** The dark and the buttons, to the victim only. */
  screen(id:string,message:DeathScreen):void;
  /** Stands the victim up, free of the hold, at a random walkable point away from the Morte and from others. */
  respawn(id:string,avoid:{x:number;z:number}):void;
  category(id:string):MorteCategory;
  log(event:string,details:Record<string,unknown>):void;
}

type Phase='scene'|'blackout'|'play'|'error';
interface Death {
  plan:DeathPlan;phase:Phase;phaseEndsAt:number;
  sequence:number[];progress:number;rounds:number;errors:number;
  inputFrom:number;
  /** The body has been marked gone (the cloud covered it). */
  gone:boolean;
}

/**
 * Death: the scene (the Morte rises, floats over, strikes, laughs, takes the body), five seconds in the dark with a phrase,
 * then the sequence game until it is repeated right, then a random place to stand up. One state per victim; every press is judged here.
 */
export class DeathDirector {
  private readonly deaths=new Map<string,Death>();
  /** The last phrase each player saw (this session of the room): never twice in a row. */
  private readonly lastPhrase=new Map<string,string>();
  private serial=0;
  constructor(private readonly host:DeathHost){}

  isDead(id:string):boolean {return this.deaths.has(id);}
  /** The phase of a victim, for tests and the admin's world view. */
  phaseOf(id:string):Phase|undefined {return this.deaths.get(id)?.phase;}
  sequenceOf(id:string):readonly number[]|undefined {return this.deaths.get(id)?.sequence;}
  planOf(id:string):DeathPlan|undefined {return this.deaths.get(id)?.plan;}

  /** Starts a death. Ignored (false) while one is running for this player, or when there is no body. */
  kill(id:string,cause='admin'):boolean {
    if(this.deaths.has(id))return false;
    const body=this.host.body(id);if(!body)return false;
    const now=this.host.now(),plan=planDeath(`${id}:${++this.serial}`,{id,x:body.x,y:body.y,z:body.z,rotation:body.rotation},now);
    this.deaths.set(id,{plan,phase:'scene',phaseEndsAt:now+deathDurationMs(plan),sequence:[],progress:0,rounds:0,errors:0,inputFrom:0,gone:false});
    this.host.hold(id,'death');
    this.host.scene(plan);
    this.host.log('death_start',{playerId:id,cause});
    return true;
  }

  /** Advances every death to `now`. */
  update(now=this.host.now()):void {
    for(const [id,death] of [...this.deaths]){
      if(now-death.plan.startedAt>DEATH.maxMs){this.finish(id,'timeout');continue;}
      if(death.phase==='scene'){
        if(!death.gone&&now>=deathStarts(death.plan).leave+DEATH.takenMs){death.gone=true;this.host.hold(id,'death-gone');}
        if(now>=death.phaseEndsAt)this.blackout(id,death,now);
      }else if(death.phase==='blackout'){
        if(now>=death.phaseEndsAt)this.play(id,death,now);
      }else if(death.phase==='play'){
        // The time limit of one attempt is a mistake.
        if(now>=death.phaseEndsAt)this.mistake(id,death,now);
      }else if(now>=death.phaseEndsAt)this.play(id,death,now);
    }
  }

  /** One press of one of the four buttons. Anything out of turn (before the sequence is shown, after the time) is ignored. */
  press(id:string,button:number,now=this.host.now()):void {
    const death=this.deaths.get(id);
    if(!death||death.phase!=='play'||now<death.inputFrom||now>=death.phaseEndsAt)return;
    if(!Number.isInteger(button)||button<0||button>=DEATH_BUTTONS)return;
    if(button!==death.sequence[death.progress]){this.mistake(id,death,now);return;}
    death.progress++;
    this.host.screen(id,{id:death.plan.id,phase:'press',button,progress:death.progress,length:death.sequence.length});
    if(death.progress<death.sequence.length)return;
    death.rounds++;
    if(death.rounds>=DEATH.roundsToWin){this.host.screen(id,{id:death.plan.id,phase:'won'});this.finish(id,'won');}
    else this.play(id,death,now);
  }

  /** The player left (or was removed): the death ends, and the player comes back alive at the respawn point. */
  disconnected(id:string):void {if(this.deaths.has(id))this.finish(id,'disconnected');}

  /** What a client that (re)connects in the middle needs: nothing is replayed, the screen resumes where it is. */
  resume(id:string):void {
    const death=this.deaths.get(id);if(!death)return;
    if(death.phase==='blackout')this.host.screen(id,{id:death.plan.id,phase:'blackout',until:death.phaseEndsAt,phrase:this.lastPhrase.get(id)??''});
    else if(death.phase==='play')this.host.screen(id,{id:death.plan.id,phase:'play',sequence:death.sequence,showStartedAt:death.inputFrom-showDurationMs(death.sequence.length),inputFrom:death.inputFrom,until:death.phaseEndsAt,round:death.rounds});
  }

  private blackout(id:string,death:Death,now:number):void {
    const body=this.host.body(id),phrase=pickPhrase(this.host.category(id),body?.name??'',this.lastPhrase.get(id),this.host.random);
    this.lastPhrase.set(id,phrase);
    death.phase='blackout';death.phaseEndsAt=now+DEATH.blackoutMs;
    this.host.screen(id,{id:death.plan.id,phase:'blackout',until:death.phaseEndsAt,phrase});
  }

  /** A new sequence (the length follows the rounds won), shown, then the time to repeat it. */
  private play(id:string,death:Death,now:number):void {
    death.sequence=randomSequence(sequenceLength(death.rounds),this.host.random);death.progress=0;death.phase='play';
    death.inputFrom=now+showDurationMs(death.sequence.length);death.phaseEndsAt=death.inputFrom+DEATH.inputLimitMs;
    this.host.screen(id,{id:death.plan.id,phase:'play',sequence:death.sequence,showStartedAt:now,inputFrom:death.inputFrom,until:death.phaseEndsAt,round:death.rounds});
  }

  private mistake(id:string,death:Death,now:number):void {
    death.errors++;death.phase='error';death.phaseEndsAt=now+DEATH.errorHoldMs;death.progress=0;
    const phrase=pickErrorPhrase(this.host.body(id)?.name??'',undefined,this.host.random);
    this.host.screen(id,{id:death.plan.id,phase:'error',until:death.phaseEndsAt,phrase});
  }

  private finish(id:string,reason:'won'|'disconnected'|'timeout'):void {
    const death=this.deaths.get(id);if(!death)return;
    this.deaths.delete(id);
    this.host.respawn(id,{x:death.plan.ax,z:death.plan.az});
    if(reason!=='won')this.host.screen(id,{id:death.plan.id,phase:'end'});
    this.host.log('death_end',{playerId:id,reason,errors:death.errors});
  }
}
