import map from '../map-data.json';

/**
 * The pool table (sinuca) of the upstairs games hall: P_Sinuca in the map (36_bar_polimento.py), three of them in a row.
 * Table frame, in metres: x along the table, y across it, the playfield (between the cushions' noses) centred on 0. The
 * head (cabeceira, where the break is made from the quadro) is at -x, the foot (pé, where the balls are racked) at +x.
 * In the bar, x runs with the world's x and y with its z (POOL_TABLES).
 */
export const POOL_TABLE={
  /** Between the cushions' noses, as modelled: 1.90 × 0.90 m. */
  length:1.9,width:.9,
  /** Bar balls of 52 mm, the size Brazilian bar tables of this length use. */
  ballRadius:.026,
  /** Corner pockets: each cushion stops this far from the corner (a mouth of about 2 balls); side pockets: half the mouth. */
  cornerCut:.075,sideHalf:.058,
  /** The jaws run this long into each pocket (corner jaws at 142° to the cushion, side jaws at 104°, as on a real table). */
  jaw:.035,sideJaw:.03,
  /** A ball whose centre comes this close to a pocket's centre drops. */
  cornerDrop:.06,sideDrop:.05,
  /** The felt is this high above the floor (P_Sinuca). */
  felt:.8,
} as const;

export type PoolBallKind='cue'|'solid'|'eight'|'stripe';
export type PoolGroup='solids'|'stripes';
export const ballKind=(n:number):PoolBallKind=>n===0?'cue':n===8?'eight':n<8?'solid':'stripe';
export const groupOf=(n:number):PoolGroup|''=>n>=1&&n<=7?'solids':n>=9&&n<=15?'stripes':'';
export const otherGroup=(g:PoolGroup):PoolGroup=>g==='solids'?'stripes':'solids';
export const GROUP_BALLS:Record<PoolGroup,readonly number[]>={solids:[1,2,3,4,5,6,7],stripes:[9,10,11,12,13,14,15]};
export const GROUP_NAMES:Record<PoolGroup,string>={solids:'Lisas',stripes:'Listradas'};

const HL=POOL_TABLE.length/2,HW=POOL_TABLE.width/2,R=POOL_TABLE.ballRadius;
export const HALF_LENGTH=HL,HALF_WIDTH=HW;
/** The head string (linha de cabeceira): the break is made with the cue ball anywhere in the quadro, behind it. */
export const HEAD_STRING=-HL/2;
/** The marks: the upper one (marca superior, on the head string, the cue ball's) and the lower one (marca inferior, at the
 *  foot, where the rack's apex sits and where the 8 goes back). */
export const HEAD_SPOT={x:HEAD_STRING,y:0} as const;
export const FOOT_SPOT={x:HL/2,y:0} as const;

export interface PoolPocket {index:number;x:number;y:number;drop:number;side:boolean;
  /** A point inside the mouth that a shot aims at, and the mouth's direction into the pocket. */
  aimX:number;aimY:number;dirX:number;dirY:number}
/** The six pockets, numbered from the head: 0 head-left, 1 side-left, 2 foot-left, 3 head-right, 4 side-right, 5 foot-right
 *  (left is -y). */
export const POCKETS:readonly PoolPocket[]=(()=>{
  const out:PoolPocket[]=[],k=Math.SQRT1_2;
  for(const sy of [-1,1])for(const [sx,side] of [[-1,false],[0,true],[1,false]] as const){
    const drop=side?POOL_TABLE.sideDrop:POOL_TABLE.cornerDrop;
    const x=side?0:sx*(HL+.006),y=sy*(HW+(side?.025:.006));
    const dirX=side?0:sx*k,dirY=side?sy:sy*k;
    out.push({index:out.length,x,y,drop,side,aimX:side?0:sx*(HL-.012),aimY:side?sy*(HW+.004):sy*(HW-.012),dirX,dirY});
  }
  return out;
})();

/** A cushion's straight piece: A→B, both on the nose line or along a jaw. */
export interface PoolCushion {ax:number;ay:number;bx:number;by:number}
/**
 * The cushions: four long pieces (split by the side pockets), two short ones, and the jaws into each pocket. A ball meets
 * a piece along its length or at its ends (the jaws' points), so it can rattle in a pocket's mouth.
 */
export const CUSHIONS:readonly PoolCushion[]=(()=>{
  const c=POOL_TABLE.cornerCut,s=POOL_TABLE.sideHalf,j=POOL_TABLE.jaw,sj=POOL_TABLE.sideJaw;
  const out:PoolCushion[]=[];
  const a142=38*Math.PI/180,cos142=Math.cos(a142),sin142=Math.sin(a142),a104=14*Math.PI/180;
  for(const sy of [-1,1]){
    // The long cushions, either side of the side pocket.
    out.push({ax:-HL+c,ay:sy*HW,bx:-s,by:sy*HW},{ax:s,ay:sy*HW,bx:HL-c,by:sy*HW});
    // Side pocket jaws, narrowing slightly into it.
    for(const sx of [-1,1])out.push({ax:sx*s,ay:sy*HW,bx:sx*(s-sj*Math.sin(a104)),by:sy*(HW+sj*Math.cos(a104))});
  }
  for(const sx of [-1,1]){
    out.push({ax:sx*HL,ay:-HW+c,bx:sx*HL,by:HW-c});
    // Corner jaws: from each cushion's end, into the pocket.
    for(const sy of [-1,1]){
      out.push({ax:sx*(HL-c),ay:sy*HW,bx:sx*(HL-c+j*cos142),by:sy*(HW+j*sin142)});
      out.push({ax:sx*HL,ay:sy*(HW-c),bx:sx*(HL+j*sin142),by:sy*(HW-c+j*cos142)});
    }
  }
  return out;
})();

/** Where a ball centre may be on the cloth (touching the cushions). */
export const onCloth=(x:number,y:number)=>Math.abs(x)<=HL-R+1e-9&&Math.abs(y)<=HW-R+1e-9;
/** Where the cue ball may be put for the break: on the cloth, in the quadro (behind the head string). */
export const inQuadro=(x:number,y:number)=>onCloth(x,y)&&x<=HEAD_STRING+1e-9;

export interface PoolBallSpot {n:number;x:number;y:number}
/** Whether a ball fits at (x, y) without touching any other. */
export function freeAt(balls:readonly PoolBallSpot[],x:number,y:number,except=-1):boolean {
  for(const b of balls)if(b.n!==except&&Math.hypot(b.x-x,b.y-y)<2*R-1e-6)return false;
  return true;
}
/**
 * A ball back on a mark (Noel Snooker: the 8 to its mark, the cue ball "the same"): on the mark when free; else on the
 * table's long line, as close as possible to the ball in the way, towards `towards` (the foot cushion for the 8, the head
 * cushion for the cue ball), and the other way if that side has no room.
 */
export function spotBall(balls:readonly PoolBallSpot[],mark:{x:number;y:number},towards:1|-1,except=-1):{x:number;y:number} {
  if(freeAt(balls,mark.x,mark.y,except))return {x:mark.x,y:mark.y};
  for(const dir of [towards,-towards as 1|-1])for(let d=.0005;d<HL;d+=.0005){
    const x=mark.x+dir*d;
    if(!onCloth(x,0))break;
    if(freeAt(balls,x,0,except))return {x,y:0};
  }
  // A table full along the line: anywhere free near the mark.
  for(let r=.01;r<.5;r+=.01)for(let a=0;a<Math.PI*2;a+=.2){const x=mark.x+Math.cos(a)*r,y=mark.y+Math.sin(a)*r;if(onCloth(x,y)&&freeAt(balls,x,y,except))return {x,y};}
  return {x:mark.x,y:mark.y};
}

/**
 * The rack (Noel Snooker): fifteen balls in a triangle, the 1 at the front on the foot mark, the 8 in the middle, a solid
 * at one end of the base and a stripe at the other, the rest at random. A hair apart, as a racked triangle is.
 */
export function rackBalls(random:()=>number=Math.random):PoolBallSpot[] {
  const pick=<T>(list:T[]):T=>list.splice(Math.floor(random()*list.length),1)[0]!;
  const solids=[2,3,4,5,6,7],stripes=[9,10,11,12,13,14,15];
  const corners=random()<.5?[pick(solids),pick(stripes)]:[pick(stripes),pick(solids)];
  const rest=[...solids,...stripes];
  const gap=2*R+.0001,rowStep=gap*Math.sqrt(3)/2,out:PoolBallSpot[]=[{n:0,x:HEAD_SPOT.x,y:HEAD_SPOT.y}];
  for(let row=0;row<5;row++)for(let k=0;k<=row;k++){
    const n=row===0?1:row===2&&k===1?8:row===4&&k===0?corners[0]!:row===4&&k===4?corners[1]!:pick(rest);
    // A rack is never perfect: each ball sits up to 0.02 mm off its place (less than the hair between them).
    out.push({n,x:FOOT_SPOT.x+row*rowStep+(random()-.5)*4e-5,y:(k-row/2)*gap+(random()-.5)*4e-5});
  }
  return out;
}

// ── The tables in the bar ─────────────────────────────────────────────────────────────────────────────────────────────

export interface PoolTablePlace {id:string;number:number;x:number;y:number;z:number;collider:string;hx:number;hz:number}
/** The map's tables (COL_Mob_Sinuca*), numbered from the stairs' side (lowest x first). */
export const POOL_TABLES:readonly PoolTablePlace[]=map.colliders.filter(c=>/^COL_Mob_Sinuca(\.\d+)?$/.test(c.id))
  .sort((a,b)=>a.x-b.x).map((c,i)=>({id:`sinuca-${i+1}`,number:i+1,x:c.x,y:c.minY,z:c.z,collider:c.id,hx:c.hx,hz:c.hz}));
export const POOL_TABLE_IDS=POOL_TABLES.map(t=>t.id) as [string,...string[]];
/** A table-frame point in the bar (a ball on the 3D table), `lift` above the cloth. */
export const poolPoint=(table:PoolTablePlace,x:number,y:number,lift=0)=>({x:table.x+x,y:table.y+POOL_TABLE.felt+R+lift,z:table.z+y});
/** Where each player stands at the table: one on each long side, facing it. */
export function poolSpot(table:PoolTablePlace,seat:number):{x:number;y:number;z:number;rotation:number} {
  const side=seat===0?-1:1;
  return {x:table.x+side*.45,y:table.y,z:table.z+side*(table.hz+.42),rotation:seat===0?0:Math.PI};
}
/** Where a player stands after leaving the table: a step back from where they played. */
export const poolExit=(table:PoolTablePlace,seat:number)=>{const spot=poolSpot(table,seat);return {x:spot.x,y:spot.y,z:spot.z+(seat===0?-.35:.35)};};
