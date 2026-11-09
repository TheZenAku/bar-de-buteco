import {RUN_SPEED,TICK_MS,WALK_SPEED,floorHeight,isWalkable,movePlayer,normalizeHeading,sightBlocked,type Collider,type RagdollStart} from '@bar/shared';
import {Player} from '../state.js';

/** Training dummies (/alvos, docs/sistemas/armas.md#alvos): ids, how many and where, how long they stay, their lives. */
export const TARGETS={
  prefix:'alvo:',
  /** How far in front of the admin each one stands (m), and how far to the side, so the near ones do not hide the far ones. */
  distances:[6,12,22,35] as const,sides:[-1.2,1.6,-2,.6] as const,
  /** Their lives (the ring and the core, as a healthy player), how long they lie after a knockout, how long they stay at all. */
  hp:100,hpCore:100,downMs:4000,lifeMs:20*60_000,
  /** #2 walks sideways this far each way; #3 jogs back and forth this far along the line. */
  strafe:3,jog:4,
  skins:['gabriel','leandro','read','tiao'] as const,
} as const;

/** What the dummies need from the room (a test gives it a stand-in). */
export interface TargetsHost {
  /** The body enters and leaves the room's players. */
  add(body:Player):void;
  remove(id:string):void;
  takeSlot():number;
  /** A knocked-down body's ragdoll is shown (start) or taken away (undefined). */
  ragdoll(id:string,start?:RagdollStart&{startedAt:number}):void;
  /** Whether the admin who called them is still here. */
  present(adminId:string):boolean;
  obstacles():readonly Collider[];
  log(event:string,details:Record<string,unknown>):void;
}

interface Dummy {
  body:Player;index:number;
  home:{x:number;y:number;z:number};
  /** Which way it faces at rest (towards the admin), and the line it moves on (#2 across, #3 along). */
  facing:number;axis:{x:number;z:number};
  /** Where it is on its line (m from home) and which way it goes. */
  offset:number;way:1|-1;
  /** Down until (ms), 0 when up. */
  downUntil:number;
}
interface Range {adminId:string;dummies:Dummy[];until:number}

/**
 * The /alvos training dummies: four server-driven bodies in front of an admin (as the sparring's foe, players without a connection), still, strafing,
 * jogging and far. Bullets and fists hit them with the whole of the room's rules; their lives are kept here and never touch the needs; a
 * knockout throws the body (the room's ragdoll, without the Morte) and it gets up at home with full lives a few seconds later.
 */
export class TrainingTargets {
  private readonly ranges=new Map<string,Range>();
  private readonly dummies=new Map<string,Dummy>();
  constructor(private readonly host:TargetsHost){}

  isTarget(id:string):boolean {return this.dummies.has(id);}
  /** The dummies of an admin (tests, admin). */
  of(adminId:string):readonly Player[] {return this.ranges.get(adminId)?.dummies.map(dummy=>dummy.body)??[];}
  /** Whether a dummy can be hit now: not while it lies down. */
  hittable(body:Player):boolean {const dummy=this.dummies.get(body.id);return !!dummy&&!dummy.downUntil;}

  /** /alvos: the admin's dummies come (how many found a place), or go if they were there (0). */
  toggle(admin:Player,now:number):number {
    if(this.ranges.has(admin.id)){this.clear(admin.id);return 0;}
    const forward={x:Math.sin(admin.rotation),z:Math.cos(admin.rotation)},side={x:Math.cos(admin.rotation),z:-Math.sin(admin.rotation)};
    const eye={x:admin.x,y:admin.y+1.6,z:admin.z},range:Range={adminId:admin.id,dummies:[],until:now+TARGETS.lifeMs},taken:{x:number;z:number}[]=[];
    TARGETS.distances.forEach((distance,index)=>{
      const home=this.place(admin,eye,forward,side,distance,TARGETS.sides[index]!,taken);
      if(!home)return;
      taken.push(home);
      const facing=normalizeHeading(Math.atan2(admin.x-home.x,admin.z-home.z));
      const body=new Player().assign({id:`${TARGETS.prefix}${admin.id}:${index+1}`,slot:this.host.takeSlot(),displayName:`Alvo de treino ${index+1}`,color:'#d35400',
        skin:TARGETS.skins[index%TARGETS.skins.length]!,connected:true,x:home.x,y:home.y,z:home.z,rotation:facing,hp:TARGETS.hp,hpCore:TARGETS.hpCore,animationState:'idle',animationStartedAt:now});
      const dummy:Dummy={body,index,home,facing,axis:index===1?side:forward,offset:0,way:1,downUntil:0};
      range.dummies.push(dummy);this.dummies.set(body.id,dummy);
      this.host.add(body);
    });
    if(!range.dummies.length)return 0;
    this.ranges.set(admin.id,range);
    this.host.log('targets_spawn',{playerId:admin.id,count:range.dummies.length});
    return range.dummies.length;
  }

  /** Somewhere to stand `distance` in front of the admin (nearer when the floor or a wall is in the way), seen from the admin's eyes. */
  private place(admin:Player,eye:{x:number;y:number;z:number},forward:{x:number;z:number},side:{x:number;z:number},distance:number,lateral:number,taken:readonly {x:number;z:number}[]){
    for(let ahead=distance;ahead>=2.5;ahead-=1)for(const shift of [lateral,0,-lateral]){
      const x=admin.x+forward.x*ahead+side.x*shift,z=admin.z+forward.z*ahead+side.z*shift,y=floorHeight(x,z,admin.y);
      if(y===undefined||!isWalkable(x,z,y)||taken.some(spot=>Math.hypot(spot.x-x,spot.z-z)<1.4))continue;
      if(sightBlocked(eye,{x,y:y+1.3,z}))continue;
      return {x,y,z};
    }
    return undefined;
  }

  /** Life off a dummy: the ring first, then the core. Returns whether `body` is one. */
  damage(body:Player,amount:number):boolean {
    const dummy=this.dummies.get(body.id);
    if(!dummy)return false;
    const ring=Math.min(body.hp,amount);
    body.hp=Math.max(0,Math.round(body.hp-ring));body.hpCore=Math.max(0,Math.round(body.hpCore-(amount-ring)));
    return true;
  }
  /** The knockout of a dummy: down for a while in the room's ragdoll, no Morte. Returns whether `body` is one. */
  knocked(body:Player,start:RagdollStart,now:number):boolean {
    const dummy=this.dummies.get(body.id);
    if(!dummy)return false;
    if(dummy.downUntil)return true;
    dummy.downUntil=now+TARGETS.downMs;
    body.assign({hp:0,hpCore:0,interactionState:'thrown',animationState:'ragdoll',animationStartedAt:now});
    this.host.ragdoll(body.id,{...start,startedAt:now});
    return true;
  }

  /** One tick: each dummy's move, getting up, and the dummies that go (time, the admin gone). */
  step(now:number):void {
    for(const range of [...this.ranges.values()]){
      if(now>=range.until||!this.host.present(range.adminId)){this.clear(range.adminId);continue;}
      for(const dummy of range.dummies)this.drive(dummy,now);
    }
  }

  private drive(dummy:Dummy,now:number):void {
    const {body}=dummy;
    body.lastProcessedInput++;
    if(dummy.downUntil){
      if(now<dummy.downUntil)return;
      // Up again at home, whole.
      dummy.downUntil=0;dummy.offset=0;dummy.way=1;
      this.host.ragdoll(body.id);
      body.assign({x:dummy.home.x,y:dummy.home.y,z:dummy.home.z,rotation:dummy.facing,hp:TARGETS.hp,hpCore:TARGETS.hpCore,interactionState:'',animationState:'idle',animationStartedAt:now});
      return;
    }
    // Pushed or staggered (a punch): it stands until the blow is over.
    if(body.interactionState)return;
    const moving=dummy.index===1||dummy.index===2;
    if(!moving){
      if(body.animationState!=='idle'){body.animationState='idle';body.animationStartedAt=now;}
      body.rotation=dummy.facing;
      return;
    }
    const limit=dummy.index===1?TARGETS.strafe:TARGETS.jog/2,running=dummy.index===2,pace=running?RUN_SPEED:WALK_SPEED;
    if(Math.abs(dummy.offset)>=limit)dummy.way=dummy.offset>0?-1:1;
    const dx=dummy.axis.x*dummy.way,dz=dummy.axis.z*dummy.way;
    const next=movePlayer(body,{dx,dz,running},TICK_MS/1000,false,false,this.host.obstacles(),pace);
    const moved=(next.x-body.x)*dummy.axis.x+(next.z-body.z)*dummy.axis.z;
    // Blocked (a wall, someone in the way): turn back.
    if(Math.abs(moved)<pace*TICK_MS/1000*.3)dummy.way=dummy.way===1?-1:1;
    dummy.offset+=moved;
    const state=running?'run':'walk';
    if(body.animationState!==state){body.animationState=state;body.animationStartedAt=now;}
    body.assign({x:next.x,y:next.y,z:next.z,rotation:normalizeHeading(Math.atan2(dx,dz))});
  }

  /** The admin's dummies go (the command again, the admin left, the time is up). */
  clear(adminId:string):void {
    const range=this.ranges.get(adminId);
    if(!range)return;
    this.ranges.delete(adminId);
    for(const dummy of range.dummies){
      this.dummies.delete(dummy.body.id);
      this.host.ragdoll(dummy.body.id);
      this.host.remove(dummy.body.id);
    }
    this.host.log('targets_clear',{playerId:adminId});
  }
}
