import {z} from 'zod';
import {FIGHT_BODIES,type FightBody,type FistPath} from './fight-paths.js';
import {normalizeHeading} from './head-look.js';
import {skinBase} from './skins.js';
import {movePlayer,sightBlocked} from './world.js';
import type {Collider,Position} from './index.js';

export {FIGHT_BODIES,type FightBody,type FistPath} from './fight-paths.js';

/**
 * The fist fight (docs/sistemas/luta.md). R puts the guard up; the left button throws the light punches, the right one the heavy ones, and Rafael's
 * skill key his kicks; each blow offers the next ones (`then`), so the presses make combos. The room decides every punch and every hit; the browser of the one punching runs the same
 * rules below on its own inputs, so the punch starts at the click and the body never has to be put back.
 *
 * Two clocks, each where it is exact:
 * - The inputs (one every TICK_MS, numbered) say when the feet are planted and how far a punch steps in (punchStep). The browser and the room run
 *   them through the same function in the same order, as they do with walking, so the prediction holds to the centimetre.
 * - The fist's way (fight-paths.ts, measured from each skin's clip) is followed in time from the moment the room took the punch. The room checks it
 *   against the others where the puncher saw them (lag compensation: it turns their bodies back by the time the puncher was seeing the past,
 *   at most FIGHT.rewindMaxMs), so what the fist is drawn touching is what gets hit.
 */
export const FIGHT={
  /** Walking in the guard (m/s): shorter steps than a walk; with Shift (and stamina) it runs, guard still up. */
  speed:2.2,runSpeed:4.8,
  /**
   * The body a fist meets: a standing capsule from a little above the hips to past the head joint, as the skin stands in the guard (fight-paths.ts),
   * this thick. A fist or a foot is a ball around the knuckles or the ankle, as thick as the blow says (FIGHT_MOVES radius).
   */
  bodyRadius:.22,bodyFrom:.05,bodyTo:.14,
  /** How finely the fist is followed between two steps of the room (ms). */
  sweepMs:10,
  /**
   * Lag compensation: how far back the room may look for where the puncher saw the others (ms), and how far past the punch's reach the target
   * may already be for a hit seen earlier to count (m). Past that the one being punched is favoured: they got away.
   */
  rewindMaxMs:300,slack:.75,
  /** What the room keeps of where everyone was (ms). */
  historyMs:1000,
  /** Aim assist: how far and how far off the view someone is still aimed at (m, radians); how far back a punch may step when too close (m). */
  aimRange:2.6,aimCone:.9,backStep:.25,
  /** How far inside the sweet spot's reach the step in brings the target (m): margin for a body still being pushed by the last blow. */
  aimDepth:.12,
  /** A press waits this long to be thrown while the feet are still planted (ms): the input buffer. */
  bufferMs:320,
  /** The blow pushes the body away over this long (ms). */
  knockbackMs:150,
  /** Whoever got up from a knockout cannot be punched for a moment (ms), so nobody is beaten on the floor. */
  graceMs:1500,
} as const;

/**
 * Defense (docs/sistemas/luta.md#defesa): hold the block key in the guard. A block taken in the arc in front lets only a sliver of the blow through and
 * wears the guard meter down; a press just before the blow lands is a parry (nothing through, the puncher is thrown off balance and the parrier's next
 * blow hits harder). The room judges it on the blocker's own timeline (blockVerdict), see world/fight.ts.
 */
export const BLOCK={
  /** Walking with the block held (m/s); it cannot run. */
  speed:1.3,
  /** A parry: a blow landing up to this long after the block went up (ms). */
  parryMs:180,
  /** A press opens a parry window only this long after the previous press (ms): holding or mashing the key is a plain block. */
  parryCooldownMs:550,
  /** Half the arc in front that a block covers (radians): from the side or behind the blow gets through whole. */
  arc:1.2,
  /** The share of a blow's life that gets through a block (light, heavy), never the last point of life. */
  chip:.15,chipHeavy:.3,
  /** The guard meter: its size, how much of a blow's life it costs, what it regains per second once the blocker has been hit-free for `regenDelayMs`. */
  meter:100,drain:1.4,regenPerS:14,regenDelayMs:900,
  /** A parry gives some of the meter back. */
  parryRefill:30,
  /** Meter broken: how long the blocker is staggered (ms) and how much of the meter is back after. */
  breakMs:1100,breakRefill:40,
  /** How much of a blow's push a block takes. */
  push:.5,
  /** What a parry does to the puncher: stun (ms), push (m); and how long the parrier's counter is stronger (ms), and by how much. */
  parryStunMs:800,parryPush:.35,riposteMs:1400,riposte:1.35,
  /**
   * Netcode: a blow on someone with the guard up is settled this much later than it was detected (their one-way trip plus a tick, at most deferMaxMs),
   * so a block pressed before it, as the blocker saw it, has reached the room. The rest of the browsers have already drawn the blow by then.
   * `lateMaxMs`: the most one-way delay the room believes a browser's own report of its trip.
   */
  deferMaxMs:150,lateMaxMs:250,
} as const;

/** A press of the block key, reported with the input that carries it (and only that one): the same `seen`/`ago` as a punch, to know how late it is. */
export interface BlockCommand {seen:number;ago:number}
export const blockCommandSchema=z.object({seen:z.number().finite().min(0),ago:z.number().finite().min(0).max(10_000)}).strict();
/**
 * One-way trip of an input (ms), from what the browser says it saw: the room's clock now (`takenAt`) less the state it had drawn (`seen`) and how long
 * it had held it (`ago`) is the way down, the wait and the way up. Half of it, less half a tick of waiting for the room's next step.
 */
export function oneWayOf(takenAt:number,command:{seen:number;ago:number},tickMs=50):number {
  if(!Number.isFinite(command.seen)||command.seen>takenAt)return 0;
  return Math.max(0,Math.min(BLOCK.lateMaxMs,(takenAt-command.seen-Math.max(0,command.ago)-tickMs/2)/2));
}
/** A stretch the block key was held, on the room's clock: from its (estimated) press to its release (Infinity while held), and whether this press opened a parry window. */
export interface BlockSpan {from:number;to:number;parry:boolean}
/**
 * What a blow landing at `hitMs` meets: a parry if the block went up at most BLOCK.parryMs before it (and that press opened a window), a plain block if
 * it was held, else nothing. The blocker's presses are on their own timeline (the press, less its trip), not the room's moment of taking the input.
 */
export function blockVerdict(spans:readonly BlockSpan[],hitMs:number):'parry'|'block'|'none' {
  for(let i=spans.length-1;i>=0;i--){
    const span=spans[i]!;
    if(hitMs<span.from||hitMs>span.to)continue;
    return span.parry&&hitMs-span.from<=BLOCK.parryMs?'parry':'block';
  }
  return 'none';
}
/** Whether the blow comes from within the arc the block covers, the blocker at `at` facing `at.rotation`, the puncher at `from`. */
export function blockCovers(at:FightPose,from:Position):boolean {
  const heading=Math.atan2(from.x-at.x,from.z-at.z);
  return Math.abs(normalizeHeading(heading-at.rotation))<=BLOCK.arc;
}
/** The life that gets through a block, never taking the last point (`left`: life left in all). */
export function chipOf(move:PunchId,left:number):number {
  const blow=FIGHT_MOVES[move];
  return Math.max(0,Math.min(Math.round(blow.damage*(blow.heavy?BLOCK.chipHeavy:BLOCK.chip)),Math.floor(left)-1));
}

/** The blows: the punches (every skin), and Rafael's kicks (only skins whose bank has them, `hasKicks`). */
export const PUNCH_IDS=['jab','cross','hook','elbow','heavy','frontKick','bodyKick','roundKick'] as const;
export type PunchId=typeof PUNCH_IDS[number];
/** How the one hit reacts: by the punch, or from behind. */
export const HIT_REACTIONS={HitLight:848,HitMedium:1000,HitSide:1121,HitHeavy:1533,HitBack:1267} as const;
export type HitReaction=keyof typeof HIT_REACTIONS;
export const FIGHT_CLIPS=['FightIdle','FightBlock','Jab','Cross','Hook','Elbow','Heavy',...Object.keys(HIT_REACTIONS),'FightBack','FightLeft','FightRight'] as const;

/** What a press asks for: the left button, the right button, the kick key. */
export type PressKind='light'|'heavy'|'kick';
export const PRESS_KINDS:readonly PressKind[]=['light','heavy','kick'];
export interface PunchMove {
  id:PunchId;name:string;
  /** The clip (tools/assets/convert-animations.mjs) and its length as converted (ms). */
  clip:'Jab'|'Cross'|'Hook'|'Elbow'|'Heavy'|'KickFront'|'KickHigh'|'Kick';durationMs:number;
  /** When the fist can land (ms into the clip), and when it cuts the air (for its sound). */
  activeFrom:number;activeTo:number;swingMs:number;
  /**
   * In inputs (TICK_MS each), counting from the one that threw it: how many keep the feet planted (the next blow can be thrown from then on), and
   * up to which one a press goes on with the combo (`then`: which blow each kind of press throws next) instead of starting over (STARTERS).
   */
  lockSteps:number;chainSteps:number;then:Partial<Record<PressKind,PunchId>>;
  /** How thick the fist (or the foot) is around the point the table follows (m). */
  radius:number;
  /** The most it steps in towards the target (m), spread over its first inputs. */
  lungeMax:number;lungeSteps:number;
  /** What it does to the one hit: life, how long they cannot act (ms), how far they are pushed (m), how they react. */
  damage:number;stunMs:number;knockback:number;reaction:HitReaction;
  /** The knockout: how the body flies (ragdoll.ts). */
  launch:{speed:number;lift:number;closing:number};
  /** Sound and screen: a heavy blow weighs more. */
  heavy:boolean;
}
/**
 * The punches. The windows come from the clips themselves (npm run assets:punches prints the fist's way with --probe): the jab's fist is out from
 * 0.2 to 0.34 s, the cross steps in and lands late, the hook sweeps across, the heavy swings wide from the right after a long wind-up.
 * The light ones push little and the hook steps in far, so the chain thrown in rhythm lands whole on someone who stands there (tested).
 */
export const FIGHT_MOVES:Readonly<Record<PunchId,PunchMove>>={
  jab:{id:'jab',name:'Jab',clip:'Jab',durationMs:1026,activeFrom:200,activeTo:340,swingMs:190,lockSteps:7,chainSteps:16,then:{light:'cross',heavy:'elbow',kick:'frontKick'},radius:.09,lungeMax:.35,lungeSteps:4,
    damage:7,stunMs:280,knockback:.12,reaction:'HitLight',launch:{speed:2.5,lift:1.4,closing:1},heavy:false},
  cross:{id:'cross',name:'Direto',clip:'Cross',durationMs:1156,activeFrom:300,activeTo:560,swingMs:290,lockSteps:12,chainSteps:20,then:{light:'hook',heavy:'heavy',kick:'bodyKick'},radius:.09,lungeMax:.5,lungeSteps:6,
    damage:11,stunMs:380,knockback:.22,reaction:'HitMedium',launch:{speed:3.5,lift:1.8,closing:1.5},heavy:false},
  hook:{id:'hook',name:'Gancho',clip:'Hook',durationMs:974,activeFrom:340,activeTo:500,swingMs:320,lockSteps:11,chainSteps:18,then:{light:'jab',heavy:'heavy',kick:'roundKick'},radius:.09,lungeMax:.55,lungeSteps:5,
    damage:14,stunMs:450,knockback:.35,reaction:'HitSide',launch:{speed:4,lift:2,closing:2.5},heavy:false},
  // The elbow comes across from the right after a short wind-up: quick, and it opens the way to the heavy punch or a kick.
  elbow:{id:'elbow',name:'Cotovelada',clip:'Elbow',durationMs:1000,activeFrom:240,activeTo:470,swingMs:230,lockSteps:10,chainSteps:18,then:{light:'hook',heavy:'heavy',kick:'bodyKick'},radius:.1,lungeMax:.45,lungeSteps:4,
    damage:12,stunMs:420,knockback:.3,reaction:'HitSide',launch:{speed:3.8,lift:1.9,closing:2},heavy:false},
  heavy:{id:'heavy',name:'Soco forte',clip:'Heavy',durationMs:1573,activeFrom:560,activeTo:760,swingMs:540,lockSteps:17,chainSteps:24,then:{kick:'roundKick'},radius:.09,lungeMax:.6,lungeSteps:8,
    damage:24,stunMs:650,knockback:.8,reaction:'HitHeavy',launch:{speed:6,lift:2.6,closing:3},heavy:true},
  // Rafael's kicks (docs/sistemas/luta.md): they hit harder than any punch and stun longer, push but never throw the body (the free kick outside the
  // guard does; here a knockout is the only flight). The leg is thicker than a fist, and the way it goes is the foot's.
  frontKick:{id:'frontKick',name:'Chute frontal',clip:'KickFront',durationMs:1010,activeFrom:370,activeTo:525,swingMs:355,lockSteps:11,chainSteps:17,then:{light:'cross',heavy:'heavy',kick:'bodyKick'},radius:.17,lungeMax:.45,lungeSteps:5,
    damage:16,stunMs:520,knockback:.5,reaction:'HitMedium',launch:{speed:5,lift:2.4,closing:2.5},heavy:false},
  bodyKick:{id:'bodyKick',name:'Chute no tronco',clip:'KickHigh',durationMs:1036,activeFrom:280,activeTo:410,swingMs:265,lockSteps:9,chainSteps:16,then:{light:'hook',heavy:'heavy',kick:'roundKick'},radius:.17,lungeMax:.5,lungeSteps:4,
    damage:19,stunMs:580,knockback:.6,reaction:'HitHeavy',launch:{speed:5.5,lift:2.6,closing:3},heavy:true},
  // The karate's round kick, head high with a long wind-up: the finisher, the biggest damage of the guard.
  roundKick:{id:'roundKick',name:'Chute de karatê',clip:'Kick',durationMs:1333,activeFrom:320,activeTo:507,swingMs:293,lockSteps:11,chainSteps:11,then:{},radius:.17,lungeMax:.6,lungeSteps:6,
    damage:27,stunMs:800,knockback:1,reaction:'HitHeavy',launch:{speed:7,lift:3,closing:3.5},heavy:true},
};
/** Whether a blow is one of Rafael's kicks (their clips are Kick, KickHigh, KickFront). */
export const isKick=(id:PunchId):boolean=>FIGHT_MOVES[id].clip.startsWith('Kick');
export const punchById=(id:string|undefined):PunchMove|undefined=>PUNCH_IDS.includes(id as PunchId)?FIGHT_MOVES[id as PunchId]:undefined;

/** A punch thrown with an input: which, the browser's own count of its punches (0-255), its step in (m), and how old the world it saw was. */
export interface PunchCommand {
  m:PunchId;n:number;lunge:number;
  /** The room's time (serverTime) of the newest state the browser had drawn, and how long it had had it (ms): see seenAt. */
  seen:number;ago:number;
}
export const punchCommandSchema=z.object({m:z.enum(PUNCH_IDS),n:z.number().int().min(0).max(255),lunge:z.number().finite().min(-1).max(1),seen:z.number().finite().min(0),ago:z.number().finite().min(0).max(10_000)}).strict();

/**
 * The fight as far as one body's inputs go: the last punch, the input that threw it, which way it faced, how far each of its first inputs steps
 * in, and the puncher's count. The room keeps one per player (and sends it: Player.punch...), the browser one of its own, run over the same inputs.
 */
export interface PunchStream {move:PunchId|'';seq:number;yaw:number;lunge:number;n:number}
export const NO_PUNCH:PunchStream={move:'',seq:-1e9,yaw:0,lunge:0,n:0};

/** The blow each kind of press throws when no combo is on (the first of a chain). */
export const STARTERS:Readonly<Record<PressKind,PunchId>>={light:'jab',heavy:'heavy',kick:'frontKick'};
/** Whether this skin has the kicks: its bank carries the kick clips (fight-paths.ts), which only Rafael's do. */
export const hasKicks=(skin:string|undefined):boolean=>!!fightBody(skin).moves.Kick;

/**
 * The blow a press may throw with input `seq`: the one the last blow offers for this kind of press while the combo window is open (`then`), else the
 * kind's own first blow (STARTERS); undefined while the last blow still has the feet planted (the browser keeps the press for FIGHT.bufferMs), or for a
 * kick press from a skin without kicks.
 */
export function punchAllowed(stream:PunchStream,seq:number,kind:PressKind,skin?:string):PunchId|undefined {
  if(kind==='kick'&&!hasKicks(skin))return undefined;
  const last=punchById(stream.move),steps=seq-stream.seq;
  if(last&&steps<last.lockSteps)return undefined;
  return (last&&steps<=last.chainSteps?last.then[kind]:undefined)??STARTERS[kind];
}
/** Whether `move` is a blow the rules allow at input `seq`, by whichever press (the room checks what the browser threw). */
export const punchThrowable=(stream:PunchStream,seq:number,move:PunchId,skin?:string):boolean=>PRESS_KINDS.some(kind=>punchAllowed(stream,seq,kind,skin)===move);
/** The stream after a punch is thrown with input `seq`, facing `yaw`, asking to step `lunge` metres (clamped to what the punch allows). */
export function throwPunch(command:Pick<PunchCommand,'m'|'n'|'lunge'>,seq:number,yaw:number):PunchStream {
  const move=FIGHT_MOVES[command.m],lunge=Math.max(-FIGHT.backStep,Math.min(move.lungeMax,command.lunge));
  return {move:command.m,seq,yaw:normalizeHeading(yaw),lunge:lunge/move.lungeSteps,n:command.n&255};
}
/** How far forward a skin's punch has carried its body after `steps` inputs (fight-paths.ts root: the clip's own step, m). */
export function punchRoot(skin:string|undefined,move:PunchId,steps:number):number {
  // A skin without this blow's clip (a kick, for anyone but Rafael) has no step of its own.
  const root=fightBody(skin).moves[FIGHT_MOVES[move].clip]?.root??[];
  return root.length?root[Math.max(0,Math.min(root.length-1,steps))]!:0;
}
/**
 * Input `seq` while the last punch holds: whether the feet are planted, and how far the body goes along the punch (m): the step in towards the target
 * over its first inputs, and the clip's own step (punchRoot) all the while the feet are planted.
 */
export function punchStep(stream:PunchStream,seq:number,skin?:string):{locked:boolean;step:number} {
  const move=punchById(stream.move),steps=seq-stream.seq;
  if(!move||steps<0||steps>=move.lockSteps)return {locked:false,step:0};
  return {locked:true,step:(steps<move.lungeSteps?stream.lunge:0)+punchRoot(skin,move.id,steps+1)-punchRoot(skin,move.id,steps)};
}
/**
 * Whether the last punch's own way (punchRoot) still carries the body at input `seq`: from the input that threw it, through the planted ones, and then
 * while the player stands still, as the clip plays on; the player's own step ends it for good. The room reads the same from animationState 'punch'.
 */
export function punchCarries(carry:boolean,stream:PunchStream,seq:number,input:{dx:number;dz:number}):boolean {
  if(stream.seq===seq&&punchById(stream.move))return true;
  return carry&&(punchStep(stream,seq).locked||(!input.dx&&!input.dz));
}
/**
 * Where an input takes a body in the guard, the same in the room and in the browser: planted (and stepping) while a punch holds it, carried on by
 * the punch's own way while `carry` (punchCarries) and standing still, else walking at FIGHT.speed, or running at FIGHT.runSpeed (`running`: already
 * checked against stamina). `dt`: the input's time (TICK_MS).
 */
export function fightMove(position:Position,stream:PunchStream,seq:number,input:{dx:number;dz:number;running?:boolean;block?:boolean},dt:number,stagePass:boolean,obstacles:readonly Collider[],skin?:string,carry=false):Required<Position> {
  const {locked,step}=punchStep(stream,seq,skin),move=punchById(stream.move),steps=seq-stream.seq;
  const along=locked?step:carry&&move&&!input.dx&&!input.dz?punchRoot(skin,move.id,steps+1)-punchRoot(skin,move.id,steps):0;
  if(locked||along){
    if(!along)return {x:position.x,y:position.y??0,z:position.z};
    const sign=Math.sign(along);
    return movePlayer(position,{dx:Math.sin(stream.yaw)*sign,dz:Math.cos(stream.yaw)*sign,running:false},dt,false,stagePass,obstacles,Math.abs(along)/dt);
  }
  return movePlayer(position,{dx:input.dx,dz:input.dz,running:false},dt,false,stagePass,obstacles,input.block?BLOCK.speed:input.running?FIGHT.runSpeed:FIGHT.speed);
}

/** The moment of the room a browser draws the others at (ms): its newest state, less the glide towards it (PATCH_GLIDE in BarScene: 120 ms for 100). */
export function seenAt(seen:number,ago:number,patchMs=100):number {
  return seen-patchMs+Math.min(Math.max(0,ago),patchMs*1.2)/1.2;
}
/** How far back the room looks for the others when judging a punch taken at `takenAt` (ms). */
export function rewindOf(takenAt:number,command:Pick<PunchCommand,'seen'|'ago'>,patchMs=100):number {
  const seen=seenAt(command.seen,command.ago,patchMs);
  if(!Number.isFinite(seen)||command.seen>takenAt)return 0;
  return Math.max(0,Math.min(FIGHT.rewindMaxMs,takenAt-seen));
}

/** A skin's body in the guard: its own measures, or its base skin's, or the default body's for a skin the table does not have yet. */
export function fightBody(skin:string|undefined):FightBody {
  return FIGHT_BODIES[skin??'']??FIGHT_BODIES[skinBase(skin??'')]??FIGHT_BODIES.nathan??Object.values(FIGHT_BODIES)[0]!;
}
export function fistPath(skin:string|undefined,move:PunchId):FistPath {return fightBody(skin).moves[FIGHT_MOVES[move].clip]!;}
/** The knuckles (or the foot of a kick) `ms` into the blow, in the puncher's axes (+X its left, +Z its front); clamped to the table's ends. */
export function fistAt(path:FistPath,ms:number):[number,number,number] {
  const last=path.fist.length/3-1,at=Math.max(0,Math.min(last,(ms-path.from)/path.step)),i=Math.min(last-1,Math.floor(at)),f=at-i,k=i*3,way=path.fist;
  return [way[k]!+(way[k+3]!-way[k]!)*f,way[k+1]!+(way[k+4]!-way[k+1]!)*f,way[k+2]!+(way[k+5]!-way[k+2]!)*f];
}

/** A body where it stood: feet, and which way it faced (radians; forward is (sin, cos)). */
export interface FightPose {x:number;y:number;z:number;rotation:number}
/** From the puncher's axes to the world. */
export function toWorld(pose:FightPose,local:readonly [number,number,number]):[number,number,number] {
  const s=Math.sin(pose.rotation),c=Math.cos(pose.rotation);
  return [pose.x+c*local[0]+s*local[2],pose.y+local[1],pose.z-s*local[0]+c*local[2]];
}
/** The capsule a fist meets on this body: the axis's bottom and top (world y) and radius. */
export function hurtbox(skin:string|undefined,at:Pick<FightPose,'y'>):{from:number;to:number;radius:number} {
  const body=fightBody(skin);
  return {from:at.y+body.hip+FIGHT.bodyFrom,to:at.y+body.head+FIGHT.bodyTo,radius:FIGHT.bodyRadius};
}

/** The closest points of two segments (p0-p1, q0-q1): their distance and where along the first (0-1). */
function segmentGap(p0:readonly number[],p1:readonly number[],q0:readonly number[],q1:readonly number[]):{gap:number;s:number;near:[number,number,number]} {
  const d1=[p1[0]!-p0[0]!,p1[1]!-p0[1]!,p1[2]!-p0[2]!],d2=[q1[0]!-q0[0]!,q1[1]!-q0[1]!,q1[2]!-q0[2]!],r=[p0[0]!-q0[0]!,p0[1]!-q0[1]!,p0[2]!-q0[2]!];
  const dot=(a:number[],b:number[])=>a[0]!*b[0]!+a[1]!*b[1]!+a[2]!*b[2]!;
  const a=dot(d1,d1),e=dot(d2,d2),f=dot(d2,r);
  let s=0,t=0;
  if(a<=1e-9&&e<=1e-9){s=0;t=0;}
  else if(a<=1e-9){s=0;t=Math.max(0,Math.min(1,f/e));}
  else{
    const c=dot(d1,r);
    if(e<=1e-9){t=0;s=Math.max(0,Math.min(1,-c/a));}
    else{
      const b=dot(d1,d2),denominator=a*e-b*b;
      s=denominator>1e-9?Math.max(0,Math.min(1,(b*f-c*e)/denominator)):0;
      t=(b*s+f)/e;
      if(t<0){t=0;s=Math.max(0,Math.min(1,-c/a));}
      else if(t>1){t=1;s=Math.max(0,Math.min(1,(b-c)/a));}
    }
  }
  const p:[number,number,number]=[p0[0]!+d1[0]!*s,p0[1]!+d1[1]!*s,p0[2]!+d1[2]!*s],q=[q0[0]!+d2[0]!*t,q0[1]!+d2[1]!*t,q0[2]!+d2[2]!*t];
  return {gap:Math.hypot(p[0]-q[0]!,p[1]-q[1]!,p[2]-q[2]!),s,near:p};
}

/** Where a fist met a body: the moment (ms into the punch) and the point of contact, on the body's surface. */
export interface PunchContact {ms:number;x:number;y:number;z:number}
/**
 * Whether the fist meets the body between `fromMs` and `toMs` into the punch (clamped to the moments it can land), all along the way it went and not
 * only where it ended up. `puncher(ms)` and `target(ms)`: where each was at that moment of the punch; the room passes their history, turned back
 * for the target by the puncher's lag, a browser what it draws.
 */
export function punchContact(skin:string|undefined,move:PunchId,fromMs:number,toMs:number,puncher:(ms:number)=>FightPose,targetSkin:string|undefined,target:(ms:number)=>FightPose):PunchContact|undefined {
  const blow=FIGHT_MOVES[move],path=fistPath(skin,move),start=Math.max(fromMs,blow.activeFrom),end=Math.min(toMs,blow.activeTo);
  if(start>end)return undefined;
  const reach=blow.radius+FIGHT.bodyRadius;
  let previous=toWorld(puncher(start),fistAt(path,start));
  for(let ms=start;;){
    const next=Math.min(end,ms+FIGHT.sweepMs),fist=toWorld(puncher(next),fistAt(path,next)),body=target(next),box=hurtbox(targetSkin,body);
    const {gap,near}=segmentGap(previous,fist,[body.x,box.from,body.z],[body.x,box.to,body.z]);
    if(gap<=reach){
      // On the body's surface, towards the fist: where the blow shows.
      const y=Math.max(box.from,Math.min(box.to,near[1])),dx=near[0]-body.x,dz=near[2]-body.z,away=Math.hypot(dx,dz)||1,skin=Math.min(away,box.radius);
      return {ms:next,x:body.x+dx/away*skin,y,z:body.z+dz/away*skin};
    }
    previous=fist;
    if(next>=end)return undefined;
    ms=next;
  }
}
/** Whether a wall stands between them: a punch does not go through one (posts and low furniture do not count, as for the kick). */
export function punchClear(puncher:Position,target:Position):boolean {
  return !sightBlocked({x:puncher.x,y:(puncher.y??0)+1.2,z:puncher.z},{x:target.x,y:(target.y??0)+1.2,z:target.z},0);
}
/** Whether the target is still within this punch's reach now, give or take FIGHT.slack: past it, a hit seen in the past no longer counts. */
export function punchInReach(skin:string|undefined,move:PunchId,puncher:Position,target:Position):boolean {
  const path=fistPath(skin,move),most=Math.max(path.reach,...Array.from({length:path.fist.length/3},(_,i)=>Math.hypot(path.fist[i*3]!,path.fist[i*3+2]!)+Math.max(0,...path.root)));
  return Math.hypot(target.x-puncher.x,target.z-puncher.z)<=most+FIGHT_MOVES[move].radius+FIGHT.bodyRadius+FIGHT.slack&&Math.abs((target.y??0)-(puncher.y??0))<1.2;
}

/** Someone the aim may turn to. */
export interface FightTarget extends Position {id:string;skin?:string}
/**
 * The aim assist: whom the punch goes at, among those near and roughly where the camera looks (`view`, radians); which way to face so its sweet spot
 * meets them (fight-paths.ts: the hook and the haymaker come from the side), and how far to step to bring them to that reach. Nobody: straight
 * along the view, without stepping.
 */
export function punchAim(skin:string|undefined,move:PunchId,from:Position,view:number,targets:readonly FightTarget[]):{yaw:number;lunge:number;target?:string} {
  const path=fistPath(skin,move);
  let best:{yaw:number;lunge:number;target:string}|undefined,bestScore=Infinity;
  for(const target of targets){
    const dx=target.x-from.x,dz=target.z-from.z,away=Math.hypot(dx,dz);
    if(away<.05||away>FIGHT.aimRange||Math.abs((target.y??0)-(from.y??0))>1)continue;
    const heading=Math.atan2(dx,dz),off=Math.abs(normalizeHeading(heading-view));
    if(off>FIGHT.aimCone)continue;
    const score=off*1.2+away*.45;
    if(score>=bestScore)continue;
    bestScore=score;
    // The knuckles into the body's surface at the sweet spot, by a margin: someone still sliding back from the last blow stays in reach.
    const ideal=path.reach+FIGHT.bodyRadius-FIGHT.aimDepth;
    best={yaw:normalizeHeading(heading+path.aim),lunge:Math.max(-FIGHT.backStep,Math.min(FIGHT_MOVES[move].lungeMax,away-ideal)),target:target.id};
  }
  return best??{yaw:normalizeHeading(view),lunge:0};
}

/** How the one hit reacts: from behind (more than ~110° off where they face) they lurch forward, else as the punch says. */
export function hitReaction(move:PunchId,puncher:Position,target:FightPose):HitReaction {
  const heading=Math.atan2(puncher.x-target.x,puncher.z-target.z);
  return Math.abs(normalizeHeading(heading-target.rotation))>1.9?'HitBack':FIGHT_MOVES[move].reaction;
}

/**
 * A player's fight as the room shares it (Player.fist): the guard up; the last punch thrown as its PunchStream (punch, seq, yaw, lunge, n) and when
 * the room took it (at); the last blow taken: when, the reaction, which way it was going, and until when it stuns.
 */
export interface FistState {fight:boolean;punch:string;seq:number;yaw:number;lunge:number;n:number;at:number;hitAt:number;hit:string;hitYaw:number;stunUntil:number;block:boolean;guard:number;breakUntil:number}
/** The PunchStream the room has for a player (the browser starts from it and runs its unanswered inputs on top). */
export function streamOf(fist:Partial<FistState>|undefined):PunchStream {
  return fist?.punch&&punchById(fist.punch)?{move:fist.punch as PunchId,seq:fist.seq??NO_PUNCH.seq,yaw:fist.yaw??0,lunge:fist.lunge??0,n:fist.n??0}:NO_PUNCH;
}

/** A punch that landed, as the room tells everyone near (fight.hit). */
export interface FightHit {
  /** Who punched and who was hit; the punch, and the puncher's count of it (the puncher's browser matches it to what it drew). */
  by:string;to:string;move:PunchId;n:number;
  /** Life taken, and what is left (ring). */
  damage:number;hp:number;
  /** Where the fist landed, and which way the blow was going (radians). */
  x:number;y:number;z:number;yaw:number;
  reaction:HitReaction;
  /** The room's time of the hit, and until when the one hit cannot act. */
  at:number;stunUntil:number;
  /** The blow that knocked them out: they fly (ragdoll) and, out of life, the Morte comes. */
  ko:boolean;
  /**
   * Set when the one hit (`to`) defended: 'block' (`damage` is what got through), 'break' (the meter broke: `stunUntil` is theirs) or 'parry' (nothing
   * got through; `stunUntil` is the puncher's `by`, thrown off balance).
   */
  guard?:'block'|'break'|'parry';
}
