import {cityZone} from '@bar/shared';
import {ROAD_EDGES,ROAD_NODES} from '@bar/shared/city-roads';

/**
 * What the city sounds like where the player stands (docs/sistemas/ambient.md). Nothing here touches the audio device: it turns the place, the hour
 * and the weather into how loud each continuous layer ("bed") is, and into when and where the one-off sounds ("spots") happen. engine.ts plays it.
 */

/** What the scene tells the sound about the listener. Positions are in the game's axes; (fx, fz) is the way the camera looks. */
export interface AmbienceInput {
  x:number;z:number;fx:number;fz:number;
  /** Hour of the game's day, 0-24, and how dark it is (0 day, 1 night). */
  hour:number;night:number;
  cloud:number;rain:number;storm:number;wind:number;
  /** 0 in the open, 1 shut in a room: a roof overhead and walls around (the veranda is in between). */
  enclosed:number;
}
export const DEFAULT_INPUT:AmbienceInput={x:0,z:0,fx:0,fz:1,hour:12,night:0,cloud:0,rain:0,storm:0,wind:.12,enclosed:0};

export interface CatalogEntry {
  id:string;url:string;duration:number;description?:string;
  source?:{id:number;author:string;title:string;license:string;page:string};
  /** Spots only: the slices of the recording worth playing, in seconds. */
  segments?:Array<[number,number]>;
}
export interface CitySounds {version:number;beds:CatalogEntry[];spots:CatalogEntry[]}

const clamp=(value:number,low=0,high=1)=>Math.max(low,Math.min(high,value));
const smooth=(edge0:number,edge1:number,value:number)=>{const t=clamp((value-edge0)/(edge1-edge0));return t*t*(3-2*t);};

/** The neighbourhoods: how much of each kind of sound they carry. Unnamed ground (the old block around the bar) is in between. */
interface Traits {urban:number;green:number;residential:number;industrial:number}
const ZONES:Record<string,Traits>={
  'Centro':{urban:1,green:.15,residential:.35,industrial:0},
  'Parque Olaria':{urban:.25,green:1,residential:.45,industrial:0},
  'Jardim Conceição':{urban:.35,green:.5,residential:1,industrial:0},
  'Distrito Industrial':{urban:.45,green:.1,residential:.05,industrial:1},
};
const AROUND:Traits={urban:.55,green:.4,residential:.7,industrial:0};

/** How busy each kind of street is (cidade_vias.json types). */
const TRAFFIC:Record<string,number>={av:1,rot:.9,anel:.8,ind:.9,centro:1,antiga:.5,col:.55,local:.25,local10:.25,ind_loc:.3};

interface Segment {ax:number;az:number;bx:number;bz:number;length:number;dx:number;dz:number;traffic:number;half:number}
const SEGMENTS:Segment[]=ROAD_EDGES.map(edge=>{
  const [ax,az]=ROAD_NODES[edge.a]!,[bx,bz]=ROAD_NODES[edge.b]!,length=Math.hypot(bx-ax,bz-az)||1;
  return {ax,az,bx,bz,length,dx:(bx-ax)/length,dz:(bz-az)/length,traffic:TRAFFIC[edge.type]??.3,half:edge.width/2};
});
/** Distance from a point to a segment, and where on it the nearest point lies (0-1). */
function toSegment(segment:Segment,x:number,z:number):{distance:number;at:number} {
  const along=clamp(((x-segment.ax)*segment.dx+(z-segment.az)*segment.dz)/segment.length);
  const px=segment.ax+(segment.bx-segment.ax)*along,pz=segment.az+(segment.bz-segment.az)*along;
  return {distance:Math.hypot(x-px,z-pz),at:along};
}

/** The reach of a street's noise: a continuous roar at the kerb, gone by ~90 m. */
export const ROAD_REACH=90;
/** Everything the layers and spots decide by, derived from the input. */
export interface World {
  day:number;night:number;dawn:number;dusk:number;midday:number;
  urban:number;green:number;residential:number;industrial:number;
  /** 0-1: how much street traffic is right here. */
  road:number;
  /** 0-1: how shut in the listener is. Exterior sound is muffled and the room's own tone comes up. */
  indoors:number;
  rain:number;storm:number;wind:number;cloud:number;hour:number;
}
export function worldOf(input:AmbienceInput):World {
  const hour=((input.hour%24)+24)%24;
  const traits=ZONES[cityZone(input.x,input.z)]??AROUND;
  let road=0;
  for(const segment of SEGMENTS){
    const {distance}=toSegment(segment,input.x,input.z);
    const reach=Math.max(0,1-Math.max(0,distance-segment.half)/ROAD_REACH);
    if(reach>0)road=Math.max(road,segment.traffic*reach*reach);
  }
  return {
    day:1-input.night,night:input.night,
    dawn:smooth(4.2,5.8,hour)*(1-smooth(7.2,9,hour)),
    dusk:smooth(16.6,18.2,hour)*(1-smooth(19.2,20.6,hour)),
    midday:smooth(8.5,11,hour)*(1-smooth(16,18.5,hour)),
    ...traits,road,indoors:clamp(input.enclosed),
    rain:input.rain,storm:input.storm,wind:input.wind,cloud:input.cloud,hour,
  };
}

/** A continuous layer. `weight` is how much of it belongs here and now; `level` is its loudness at full weight, against the others. */
export interface BedRule {id:string;level:number;weight:(world:World)=>number;
  /** Slow drift in loudness, as a fraction, over a period in seconds: layers of different lengths never line up the same way twice. */
  drift:{amount:number;period:number};
  /** Plays inside too (the room's own tone) instead of being muffled like the street. */
  interior?:boolean}
const dry=(world:World)=>1-world.rain*.9;
export const BEDS:readonly BedRule[]=[
  {id:'dia-a',level:.8,drift:{amount:.18,period:71},weight:w=>w.day*clamp(.45+.5*w.urban+.25*w.residential)},
  {id:'dia-b',level:.7,drift:{amount:.2,period:113},weight:w=>w.day*clamp(.4+.35*w.residential+.3*w.urban)},
  {id:'noite-a',level:.8,drift:{amount:.16,period:97},weight:w=>w.night*clamp(.5+.5*w.urban)},
  {id:'noite-b',level:.7,drift:{amount:.2,period:61},weight:w=>w.night*clamp(.4+.35*w.residential+.3*w.green)},
  {id:'via',level:1,drift:{amount:.12,period:53},weight:w=>w.road*(.55+.45*w.day)},
  {id:'fluxo',level:.75,drift:{amount:.3,period:83},weight:w=>w.road*(.35+.65*w.night)},
  {id:'grilos-a',level:.8,drift:{amount:.2,period:67},weight:w=>w.night*(.4+.6*w.green)*dry(w)},
  {id:'grilos-b',level:.65,drift:{amount:.25,period:101},weight:w=>w.night*(.3+.5*w.residential+.3*w.green)*dry(w)},
  {id:'cigarras-a',level:.7,drift:{amount:.25,period:89},weight:w=>w.midday*(.2+.8*w.green+.3*w.residential)*dry(w)},
  {id:'cigarras-b',level:.6,drift:{amount:.3,period:127},weight:w=>(w.dusk+w.midday*.3)*(.3+.7*w.green)*dry(w)},
  {id:'sapos',level:.75,drift:{amount:.25,period:79},weight:w=>w.night*w.green*(.3+.9*w.rain)},
  {id:'passaros-a',level:.8,drift:{amount:.3,period:73},weight:w=>(w.dawn+w.day*.3)*(.25+.75*w.green)*(1-w.rain*.85)*(1-w.storm)},
  {id:'passaros-b',level:.7,drift:{amount:.3,period:107},weight:w=>(w.day*.5+w.dawn*.5+w.dusk*.6)*(.2+.8*w.green)*(1-w.rain*.85)*(1-w.storm)},
  {id:'vento',level:.9,drift:{amount:.35,period:47},weight:w=>clamp(.12+w.wind*1.1+w.storm*.4)},
  {id:'industria',level:.8,drift:{amount:.1,period:59},weight:w=>w.industrial*(.4+.6*w.day)},
  {id:'salao',level:.55,drift:{amount:.1,period:41},weight:w=>w.indoors,interior:true},
];

export type Placement='around'|'road';
/** A kind of one-off sound. `sounds` are catalogue ids; `weight` scales how often it happens (0 never); `every` is the gap in seconds at weight 1. */
export interface SpotRule {
  id:string;sounds:readonly string[];
  every:readonly [number,number];
  weight:(world:World)=>number;
  /** Metres from the listener. */
  distance:readonly [number,number];
  gain:number;
  placement:Placement;
  /** Play only this many seconds of a long recording (a random slice of one of its good stretches), faded at both ends. */
  window?:readonly [number,number];
  /** A pass-by: the source travels along its street while it plays, metres per second. */
  moves?:readonly [number,number];
  /** Chance that another one of the kind answers a few seconds later (a dog sets off the next street's dog). */
  answer?:{chance:number;after:readonly [number,number]};
  /** Rain and storms mute it by this much (1: silent in a storm). */
  rainMute?:number;
}
export const SPOTS:readonly SpotRule[]=[
  {id:'cao',sounds:['cao-1','cao-2','cao-3','cao-4','cao-5','cao-6'],every:[28,75],gain:.55,placement:'around',distance:[70,260],
    weight:w=>(w.night*.8+w.dusk*.5+.15)*(w.residential*.9+w.urban*.25+.1),answer:{chance:.4,after:[2.5,8]},rainMute:.7},
  {id:'galo',sounds:['galo-1','galo-2','galo-3','galo-4'],every:[35,100],gain:.55,placement:'around',distance:[90,300],window:[3,9],
    weight:w=>(w.dawn*1+w.day*.12+w.night*.03)*(w.residential*.8+w.green*.5),answer:{chance:.5,after:[3,9]},rainMute:.6},
  {id:'buzina',sounds:['buzina-1','buzina-2','buzina-3'],every:[40,110],gain:.5,placement:'road',distance:[40,200],
    weight:w=>(w.urban*.9+.1)*(1-w.night*.5),rainMute:.3},
  {id:'moto',sounds:['moto-1','moto-2'],every:[20,55],gain:.6,placement:'road',distance:[20,150],moves:[9,16],
    weight:w=>w.road>.02?.55+.45*w.urban:0,rainMute:.4},
  {id:'carro',sounds:['carro-1','carro-2','carro-3','carro-4'],every:[10,32],gain:.55,placement:'road',distance:[15,130],moves:[8,14],
    weight:w=>w.road>.02?.5+.5*w.urban:0,rainMute:.1},
  {id:'onibus',sounds:['onibus-1'],every:[70,180],gain:.55,placement:'road',distance:[25,150],window:[14,26],moves:[6,10],
    weight:w=>w.road>.1?w.urban*.9+.1:0},
  {id:'sirene',sounds:['sirene-1','sirene-2','sirene-3'],every:[120,320],gain:.42,placement:'around',distance:[160,420],window:[9,22],
    weight:w=>w.urban*.8+.15},
  {id:'criancas',sounds:['criancas-1','criancas-2'],every:[40,110],gain:.5,placement:'around',distance:[60,190],window:[5,13],
    weight:w=>w.day*smooth(7.5,9,w.hour)*(1-smooth(18.5,20,w.hour))*(w.residential*.9+w.green*.5+.1),rainMute:1},
  {id:'passaro',sounds:['arara-1','arara-2','bemtevi','pombos'],every:[14,45],gain:.55,placement:'around',distance:[30,130],window:[3,9],
    weight:w=>(w.dawn+w.day*.55+w.dusk*.5)*(.15+.85*w.green+.2*w.residential),rainMute:.9},
  {id:'urutau',sounds:['urutau'],every:[90,210],gain:.4,placement:'around',distance:[60,200],window:[5,12],
    weight:w=>w.night*(.15+.85*w.green),rainMute:.8},
  {id:'aviao',sounds:['aviao'],every:[220,480],gain:.35,placement:'around',distance:[700,1100],window:[30,50],
    weight:w=>(1-w.cloud*.4)*(1-w.rain)*(.3+.7*w.urban),rainMute:1},
  {id:'sino',sounds:['sino-1','sino-2'],every:[160,420],gain:.4,placement:'around',distance:[150,360],window:[4,10],
    weight:w=>w.day*smooth(6,7,w.hour)*(1-smooth(19.5,20.5,w.hour))*(w.urban*.6+w.residential*.4)},
  {id:'martelo',sounds:['martelo-1','martelo-2'],every:[26,65],gain:.5,placement:'around',distance:[80,260],window:[6,16],
    weight:w=>w.day*smooth(6.8,8,w.hour)*(1-smooth(16.5,17.5,w.hour))*(w.industrial+w.urban*.15),rainMute:.8},
  {id:'campainha',sounds:['campainha'],every:[90,230],gain:.45,placement:'around',distance:[12,45],window:[1.5,4],
    weight:w=>w.day*(w.urban*.6+w.green*.5+.1),rainMute:1},
];

/** Every one-off sound's rule gain is scaled by this: the whole set of distant events, against the layers, in one place. */
export const SPOT_LEVEL=1.4;
/** How loud and how dull a sound is at a distance: nearer than the first bit is full; farther fades and loses its highs, as air does. */
export function distanceGain(distance:number):number {return 1/(1+Math.max(0,distance-8)/32);}
export function distanceCutoff(distance:number):number {return clamp(15500/(1+distance/38),1200,15500);}
/** Left-right place of a source for a listener looking along (fx, fz): -1 hard left, 1 hard right. Y is up, so the right of (fx, fz) is (-fz, fx). */
export function panOf(listener:Pick<AmbienceInput,'x'|'z'|'fx'|'fz'>,x:number,z:number):number {
  const dx=x-listener.x,dz=z-listener.z,length=Math.hypot(dx,dz);
  if(length<.01)return 0;
  const facing=Math.hypot(listener.fx,listener.fz)||1;
  const right=(dx*(-listener.fz)+dz*listener.fx)/(length*facing);
  return clamp(right*.9,-.9,.9);
}

/** Where a spot starts and where it is heading. */
export interface Position {x:number;z:number;vx:number;vz:number;distance:number}
export function placeSpot(rule:SpotRule,input:AmbienceInput,random:()=>number,seconds:number):Position|undefined {
  const [near,far]=rule.distance;
  if(rule.placement==='around'){
    const angle=random()*Math.PI*2,distance=near+(far-near)*random();
    return {x:input.x+Math.cos(angle)*distance,z:input.z+Math.sin(angle)*distance,vx:0,vz:0,distance};
  }
  // On a street near enough to be heard, in proportion to how busy it is and how close.
  const options:Array<{segment:Segment;weight:number}>=[];
  for(const segment of SEGMENTS){
    const {distance}=toSegment(segment,input.x,input.z);
    if(distance<=far)options.push({segment,weight:segment.traffic/(1+distance/50)});
  }
  if(!options.length)return;
  let pick=random()*options.reduce((sum,option)=>sum+option.weight,0),chosen=options[0]!.segment;
  for(const option of options){pick-=option.weight;if(pick<=0){chosen=option.segment;break;}}
  const speed=rule.moves?rule.moves[0]+(rule.moves[1]-rule.moves[0])*random():0,sign=random()<.5?-1:1;
  // A point on the street whose distance fits the rule; the source then drives through it for the length of the sound.
  for(let attempt=0;attempt<8;attempt++){
    const at=random(),px=chosen.ax+(chosen.bx-chosen.ax)*at,pz=chosen.az+(chosen.bz-chosen.az)*at,distance=Math.hypot(px-input.x,pz-input.z);
    if(distance<near||distance>far)continue;
    const vx=chosen.dx*sign*speed,vz=chosen.dz*sign*speed;
    return {x:px-vx*seconds/2,z:pz-vz*seconds/2,vx,vz,distance};
  }
}

/** One sound the scheduler decided on: engine.ts loads and plays it. */
export interface SpotCall {rule:SpotRule;sound:string;placement:Position;offset:number;duration:number;gain:number;fade:number;at:number}

/**
 * When the spots happen. Each kind has its own clock; the gap to the next one is drawn from the rule and stretched when the place does not suit it
 * (half the weight, twice the wait), so a quiet corner of the park has few dogs and a busy avenue has plenty of cars, and nothing marches in step.
 * No two sounds start closer than `spacing`, and no more than `limit` play at once: a street is busy, not a wall.
 */
export class SpotScheduler {
  private readonly due=new Map<string,number>();
  private readonly last=new Map<string,string>();
  private readonly echoes:Array<{rule:SpotRule;at:number}>=[];
  private lastStart=-Infinity;
  constructor(private readonly catalog:ReadonlyMap<string,CatalogEntry>,private readonly random:()=>number=Math.random,
    readonly spacing=3,readonly limit=5,private readonly rules:readonly SpotRule[]=SPOTS){}
  private gap(rule:SpotRule,weight:number):number {
    const [low,high]=rule.every;
    return (low+(high-low)*this.random())/Math.max(.08,weight);
  }
  /** Calls to start now. `playing` is how many spots are sounding; `available` says which recordings are published and not known to be broken. */
  step(now:number,input:AmbienceInput,world:World,playing:number,available:(sound:string)=>boolean):SpotCall[] {
    const calls:SpotCall[]=[];
    const muted=(rule:SpotRule)=>1-clamp((rule.rainMute??.5)*(world.rain*.8+world.storm*.4));
    for(const rule of this.rules){
      const echo=this.echoes.findIndex(entry=>entry.rule===rule&&entry.at<=now);
      let due=this.due.get(rule.id);
      if(due===undefined){
        // First time: not all at once, and not all in the first second.
        due=now+1+this.random()*Math.min(25,rule.every[0]);this.due.set(rule.id,due);
      }
      if(echo<0&&now<due)continue;
      if(echo>=0)this.echoes.splice(echo,1);
      const weight=rule.weight(world)*muted(rule);
      if(echo<0){
        if(weight<.04){this.due.set(rule.id,now+4+this.random()*4);continue;}
        this.due.set(rule.id,now+this.gap(rule,weight));
      }
      if(playing+calls.length>=this.limit||now-this.lastStart<this.spacing){
        // Not now; soon.
        if(echo<0)this.due.set(rule.id,now+1+this.random()*2);
        continue;
      }
      const call=this.make(rule,input,now,available);
      if(!call)continue;
      calls.push(call);this.lastStart=now;
      if(rule.answer&&echo<0&&this.random()<rule.answer.chance){
        const [low,high]=rule.answer.after;
        this.echoes.push({rule,at:now+low+(high-low)*this.random()});
      }
    }
    return calls;
  }
  /** One call for this kind, as the scheduler would make it (also for playing one on demand). */
  make(rule:SpotRule,input:AmbienceInput,now:number,available:(sound:string)=>boolean):SpotCall|undefined {
    const choices=rule.sounds.filter(available);
    if(!choices.length)return;
    // Never the same recording twice in a row.
    const last=this.last.get(rule.id),pool=choices.length>1?choices.filter(id=>id!==last):choices;
    const sound=pool[Math.floor(this.random()*pool.length)]!,entry=this.catalog.get(sound)!;
    const segments=entry.segments?.length?entry.segments:[[0,entry.duration] as [number,number]];
    const [from,to]=segments[Math.floor(this.random()*segments.length)]!;
    let offset=from,duration=to-from;
    if(rule.window){
      const wanted=rule.window[0]+(rule.window[1]-rule.window[0])*this.random();
      if(duration>wanted){offset=from+(duration-wanted)*this.random();duration=wanted;}
    }
    const placement=placeSpot(rule,input,this.random,duration);
    if(!placement)return;
    this.last.set(rule.id,sound);
    const fade=Math.min(rule.window?1.2:.03,duration*.3);
    return {rule,sound,placement,offset,duration,fade,at:now,gain:rule.gain*SPOT_LEVEL*(.8+.35*this.random())*distanceGain(placement.distance)};
  }
}

/**
 * A recording looped without a seam: the last `fade` seconds are blended into the first, equal power, and the loop is that much shorter.
 * The sample after the end of the loop is the one that followed the sample before it, so the join is as continuous as the recording itself.
 */
export function loopWithCrossfade(data:Float32Array,fade:number):Float32Array {
  const size=Math.max(0,Math.min(Math.floor(fade),Math.floor(data.length/3)));
  if(size<2)return data.slice();
  const length=data.length-size,out=data.slice(0,length);
  for(let i=0;i<size;i++){
    const angle=i/size*Math.PI/2;
    out[i]=data[i]!*Math.sin(angle)+data[length+i]!*Math.cos(angle);
  }
  return out;
}

/** Where a bed's gain is at a moment: its weight, its level and a slow drift of its own. */
export function bedGain(rule:BedRule,world:World,seconds:number):number {
  const weight=clamp(rule.weight(world));
  // Each layer starts its drift somewhere of its own, from its name.
  let phase=0;for(const letter of rule.id)phase=(phase*31+letter.charCodeAt(0))%628;
  phase/=100;
  return rule.level*weight*(1+rule.drift.amount*Math.sin(seconds/rule.drift.period*Math.PI*2+phase));
}
