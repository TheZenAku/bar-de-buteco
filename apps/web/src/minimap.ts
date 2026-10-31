import {BLACKJACK_TABLE,FOOSBALL_TABLES,INTERACTABLES,JUKEBOX,MAP_COLLIDERS,MAP_MARKERS,SHOP_SPOT,STAGE,type Position} from '@bar/shared';
import type {MapView} from './engine/scene-types';
import {uiIconSource} from './ui-icons';

/** Above this height the player is on the bar's upper floor (its slabs are at 3.2–3.45 m). */
const UPPER=2;
/** Metres from the player to the rim: closer in and around the bar (up to NEAR metres from its lot), wider out in the street. */
const RANGE={inside:15,outside:28},NEAR=8;
/** Redrawn at most this often (ms), and only when something on it moved. */
const FRAME_MS=33;
const TAU=Math.PI*2;
/** The night of the logo: asphalt, blocks and the neighbours' houses in violets, the bar in magenta neon. */
const C={asphalt:'#0c0617',block:'#1b1130',green:'#12302a',tree:'rgba(70,170,120,.5)',house:'#291d47',houseEdge:'rgba(167,123,255,.35)',
  fence:'rgba(167,123,255,.3)',car:'rgba(190,180,235,.2)',prop:'rgba(190,180,235,.16)',lot:'#2b0f3d',slab:'#3a1552',stage:'rgba(255,71,194,.45)',
  stairs:'rgba(23,212,244,.4)',furniture:'rgba(255,220,255,.14)',furnitureFar:'rgba(255,220,255,.06)',wall:'#f15be6',wallGlow:'rgba(234,47,220,.3)',
  wallFar:'rgba(234,47,220,.22)',player:'#17d4f4',npc:'#fac416',outline:'#0c0617',job:'#5fd86c',magenta:'#ea2fdc',edge:'rgba(8,3,16,.7)'};

type Layer='block'|'green'|'tree'|'house'|'fence'|'car'|'prop'|'lot'|'slab'|'stairs'|'stage'|'furniture'|'wall';
interface Box {x:number;z:number;hx:number;hz:number;upper:boolean}
/** What each map collider is on the minimap (map-data.json ids; numbered copies share their name). Posts, bins and doors are left out. */
function layerOf(id:string):Layer|undefined {
  const name=id.replace(/\.\d+$/,'');
  if(name==='COL_Rua_Quadra')return 'block';
  if(name==='COL_Ext_Canteiro')return 'green';
  if(name==='COL_Ext_Arvore'||name==='COL_Mob_Arvore_Quintal')return 'tree';
  if(/^COL_Viz_(Casa|Loja|Escola|Igreja)$/.test(name))return 'house';
  if(/^COL_Viz_(Muro|Muro_Escola|Portao|Adro)$/.test(name)||name==='COL_Ext_Alambrado')return 'fence';
  if(/^COL_Ext_(Carro|Sedan)_/.test(name))return 'car';
  if(/^COL_Ext_(Banca|Ponto_Onibus|Arquibancada|Coreto)$/.test(name))return 'prop';
  if(name==='COL_Predio_Piso')return 'lot';
  if(name==='COL_Predio_Laje')return 'slab';
  if(/^COL_Predio_Escada_(Base|Rampa|Patamar)$/.test(name))return 'stairs';
  if(name==='COL_Palco')return 'stage';
  if(/^COL_Predio_(Parede2?|Muro|Batente|Pilar|Pilar_Portao|Portao|Escada_Parede|Divisoria_Cabine|Terraco|GuardaCorpo|Sacada_GC|Sacada_Mureta|Vidro_Fixo|Churrasqueira|Exaustao)$/.test(name))return 'wall';
  if(/^COL_(Mob|Int|Palco)_/.test(name))return 'furniture';
}
const LAYERS=new Map<Layer,Box[]>();
for(const c of MAP_COLLIDERS){
  const layer=layerOf(c.id);if(!layer)continue;
  const list=LAYERS.get(layer)??[];list.push({x:c.x,z:c.z,hx:c.hx,hz:c.hz,upper:(c.minY??0)>=3.1});LAYERS.set(layer,list);
}
const LOT=MAP_COLLIDERS.find(c=>c.id==='COL_Predio_Piso')!;
/** Behind the slabs' back edge is the backyard; past the terrace's wall, upstairs, the terrace. */
const BACKYARD_Z=Math.min(...(LAYERS.get('slab')??[]).map(s=>s.z-s.hz));
const TERRACE_X=Math.min(...MAP_COLLIDERS.filter(c=>/^COL_Predio_Terraco/.test(c.id)).map(c=>c.x-c.hx));
const inLot=(x:number,z:number,margin=0)=>Math.abs(x-LOT.x)<=LOT.hx+margin&&Math.abs(z-LOT.z)<=LOT.hz+margin;
const PLACES=[[MAP_MARKERS.Ponto_Praca,'Praça'],[MAP_MARKERS.Ponto_Igreja,'Igreja'],[MAP_MARKERS.Ponto_Campinho,'Campinho'],[MAP_MARKERS.Ponto_Escola,'Escola'],[MAP_MARKERS.Ponto_Onibus,'Ponto de ônibus']] as const;
/** The name under the map: the part of the bar the player is in, or the nearest landmark outside it. */
export function zoneName(x:number,y:number,z:number):string {
  if(inLot(x,z))return y>UPPER?(x>=TERRACE_X?'Terraço':'Andar de cima'):z<BACKYARD_Z?'Quintal':'Salão';
  let name='Rua',best=24;
  for(const [at,place] of PLACES){const d=Math.hypot(at.x-x,at.z-z);if(d<best){best=d;name=place;}}
  return name;
}

interface Poi {icon:string;colour:string;x:number;y:number;z:number}
const centre=(spots:readonly Position[]):Position=>({x:spots.reduce((s,p)=>s+p.x,0)/spots.length,y:spots[0]?.y??0,z:spots.reduce((s,p)=>s+p.z,0)/spots.length});
/** One blip per restroom floor: its toilets and urinals. */
const restroom=(upper:boolean)=>centre(INTERACTABLES.filter(i=>(i.type==='toilet'||i.type==='urinal')&&((i.y??0)>UPPER)===upper));
const poi=(icon:string,colour:string,at:Position):Poi=>({icon,colour,x:at.x,y:at.y??0,z:at.z});
/** What can be used in the bar, in the colours of their rings in the scene where they have one (stage, shop). */
const POIS:readonly Poi[]=[
  poi('beer','#f59847',MAP_MARKERS.Ponto_Balcao),
  poi('micVocal','#ff47c2',{x:STAGE.deck.x,y:STAGE.deck.maxY,z:STAGE.deck.z}),
  poi('music','#17d4f4',JUKEBOX),
  poi('store','#fac416',SHOP_SPOT),
  poi('cards','#a77bff',BLACKJACK_TABLE),
  poi('ball','#0386f0',centre(FOOSBALL_TABLES)),
  poi('toilet','#c9bff0',restroom(false)),
  poi('toilet','#c9bff0',restroom(true)),
];

/**
 * The round map in the bottom-left corner, GTA-style: the neighbourhood and the bar from above around the player, turned
 * with the camera (the view points up), the places to use as blips, the other people as dots and the job's station
 * (on the rim when it is out of range). It is drawn on its own canvas, and only when something on it moved: following
 * the camera with DOM elements restyled the page every frame (see objective-blip.ts). The name of the place sits under it.
 */
export function createMinimap(root:HTMLElement){
  const canvas=root.querySelector<HTMLCanvasElement>('#minimap')!,label=root.querySelector<HTMLElement>('#minimap-zone')!;
  const context=canvas.getContext('2d');
  let size=0,signature='',checked=0,range:number=RANGE.inside,objective:Position|null=null,zone='',font='';
  const icons=new Map<string,HTMLImageElement>();
  const icon=(name:string)=>{
    let image=icons.get(name);
    if(!image){image=new Image();image.onload=()=>{signature='';};image.src=uiIconSource(name,'#160822',2.4);icons.set(name,image);}
    return image;
  };
  new ResizeObserver(()=>{size=canvas.clientWidth;signature='';}).observe(canvas);
  void document.fonts?.ready.then(()=>{font='';signature='';});

  function badge(ctx:CanvasRenderingContext2D,x:number,y:number,colour:string,name:string,r=7.5):void {
    ctx.beginPath();ctx.arc(x,y,r+1.5,0,TAU);ctx.fillStyle=C.edge;ctx.fill();
    ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=colour;ctx.fill();
    const image=icon(name);if(image.complete&&image.naturalWidth)ctx.drawImage(image,x-r*.7,y-r*.7,r*1.4,r*1.4);
  }
  function draw(ctx:CanvasRenderingContext2D,v:MapView,ratio:number):void {
    const c=size/2,R=c,scale=R/range,up=v.y>UPPER,px=1/scale,cos=Math.cos(v.yaw),sin=Math.sin(v.yaw);
    if(!font)font=getComputedStyle(canvas).getPropertyValue('--font-mono').trim()||'monospace';
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.save();ctx.beginPath();ctx.arc(c,c,R,0,TAU);ctx.clip();
    ctx.fillStyle=C.asphalt;ctx.fillRect(0,0,size,size);
    // The world turned with the camera (x right and z down at yaw 0), the player in the middle.
    ctx.translate(c,c);ctx.rotate(v.yaw);ctx.scale(scale,scale);ctx.translate(-v.x,-v.z);
    const near=(b:Box)=>Math.abs(b.x-v.x)<range+b.hx&&Math.abs(b.z-v.z)<range+b.hz;
    /** One path per layer; `floor`: only that floor's; `thin`: at least this half-thickness (walls stay a line wide). */
    const fill=(layer:Layer,colour:string,{floor,grow=0,thin=0}:{floor?:boolean;grow?:number;thin?:number}={})=>{
      ctx.beginPath();
      for(const b of LAYERS.get(layer)??[]){
        if((floor!==undefined&&b.upper!==floor)||!near(b))continue;
        const hx=Math.max(b.hx,thin)+grow,hz=Math.max(b.hz,thin)+grow;ctx.rect(b.x-hx,b.z-hz,hx*2,hz*2);
      }
      ctx.fillStyle=colour;ctx.fill();
    };
    fill('block',C.block);fill('green',C.green);fill('lot',C.lot);fill('stage',C.stage);
    fill('house',C.house);ctx.lineWidth=px;ctx.strokeStyle=C.houseEdge;ctx.stroke();
    fill('fence',C.fence,{thin:.6*px});fill('car',C.car);fill('prop',C.prop);
    ctx.beginPath();
    for(const b of LAYERS.get('tree')??[])if(near(b)){ctx.moveTo(b.x+1.3,b.z);ctx.arc(b.x,b.z,1.3,0,TAU);}
    ctx.fillStyle=C.tree;ctx.fill();
    // The bar: the player's floor in neon and its furniture faint. Upstairs, the slab covers the ground floor's.
    if(up){fill('furniture',C.furnitureFar,{floor:false});fill('wall',C.wallFar,{floor:false,thin:.6*px});fill('slab',C.slab);}
    fill('stairs',C.stairs);fill('furniture',C.furniture,{floor:up});
    fill('wall',C.wallGlow,{floor:up,thin:.75*px,grow:1.6*px});fill('wall',C.wall,{floor:up,thin:.75*px});
    // Blips and people upright, in screen pixels. Those on the other floor fade.
    ctx.setTransform(ratio,0,0,ratio,0,0);
    const at=(x:number,z:number)=>{const dx=x-v.x,dz=z-v.z;return {x:c+(dx*cos-dz*sin)*scale,y:c+(dx*sin+dz*cos)*scale};};
    const inside=(p:{x:number;y:number},margin:number)=>Math.hypot(p.x-c,p.y-c)<=R-margin;
    for(const poi of POIS){const p=at(poi.x,poi.z);if(!inside(p,6))continue;ctx.globalAlpha=Math.abs(poi.y-v.y)>1.6?.4:1;badge(ctx,p.x,p.y,poi.colour,poi.icon);}
    for(const o of v.others){
      const p=at(o.x,o.z);if(!inside(p,3))continue;
      ctx.globalAlpha=Math.abs(o.y-v.y)>1.6?.35:1;
      ctx.beginPath();ctx.arc(p.x,p.y,o.npc?2.8:3.4,0,TAU);ctx.fillStyle=o.npc?C.npc:C.player;ctx.fill();ctx.lineWidth=1.4;ctx.strokeStyle=C.outline;ctx.stroke();
    }
    ctx.globalAlpha=1;
    // The job's station; out of range, on the rim towards it.
    if(objective){
      let p=at(objective.x,objective.z);const dx=p.x-c,dy=p.y-c,d=Math.hypot(dx,dy),max=R-13;
      if(d>max){
        p={x:c+dx/d*max,y:c+dy/d*max};const a=Math.atan2(dy,dx);
        ctx.beginPath();ctx.moveTo(c+Math.cos(a)*(max+12),c+Math.sin(a)*(max+12));ctx.lineTo(c+Math.cos(a+.13)*(max+5),c+Math.sin(a+.13)*(max+5));ctx.lineTo(c+Math.cos(a-.13)*(max+5),c+Math.sin(a-.13)*(max+5));
        ctx.closePath();ctx.fillStyle=C.job;ctx.fill();
      }
      badge(ctx,p.x,p.y,C.job,'briefcase',8.5);
    }
    // The camera's view, a soft wedge up from the player, and the player: an arrow where the avatar faces.
    const cone=ctx.createRadialGradient(c,c,0,c,c,R*.85);cone.addColorStop(0,'rgba(255,255,255,.22)');cone.addColorStop(1,'rgba(255,255,255,0)');
    ctx.beginPath();ctx.moveTo(c,c);ctx.arc(c,c,R*.85,-Math.PI/2-.52,-Math.PI/2+.52);ctx.closePath();ctx.fillStyle=cone;ctx.fill();
    // Inner shade towards the rim, as a lens.
    const lens=ctx.createRadialGradient(c,c,R*.62,c,c,R);lens.addColorStop(0,'rgba(8,3,16,0)');lens.addColorStop(1,'rgba(8,3,16,.7)');
    ctx.fillStyle=lens;ctx.fillRect(0,0,size,size);
    ctx.save();ctx.translate(c,c);ctx.rotate(v.yaw+Math.atan2(Math.cos(v.facing),Math.sin(v.facing)));
    ctx.beginPath();ctx.moveTo(8.5,0);ctx.lineTo(-6,-6.5);ctx.lineTo(-2.8,0);ctx.lineTo(-6,6.5);ctx.closePath();
    ctx.shadowColor=C.magenta;ctx.shadowBlur=9*ratio;ctx.fillStyle='#fff';ctx.fill();ctx.shadowBlur=0;ctx.lineWidth=1.3;ctx.lineJoin='round';ctx.strokeStyle=C.magenta;ctx.stroke();
    ctx.restore();ctx.restore();
    // The rim turns with the map: a tick every 30° and the cardinal points, N in the logo's magenta.
    ctx.lineWidth=1;ctx.strokeStyle='rgba(255,255,255,.28)';ctx.beginPath();
    for(let i=0;i<12;i++){if(i%3===0)continue;const a=v.yaw-Math.PI/2+i*Math.PI/6;ctx.moveTo(c+Math.cos(a)*(R-2),c+Math.sin(a)*(R-2));ctx.lineTo(c+Math.cos(a)*(R-6),c+Math.sin(a)*(R-6));}
    ctx.stroke();
    ctx.textAlign='center';ctx.textBaseline='middle';
    ['N','L','S','O'].forEach((letter,i)=>{
      const a=v.yaw-Math.PI/2+i*Math.PI/2,x=c+Math.cos(a)*(R-10),y=c+Math.sin(a)*(R-10);
      if(i===0){ctx.beginPath();ctx.arc(x,y,7.5,0,TAU);ctx.fillStyle=C.magenta;ctx.shadowColor=C.magenta;ctx.shadowBlur=8*ratio;ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.font=`700 9px ${font}`;}
      else{ctx.fillStyle='rgba(255,255,255,.55)';ctx.font=`600 8px ${font}`;}
      ctx.fillText(letter,x,y+.5);
    });
  }
  return {
    /** Each scene frame: `view` reads where everyone is drawn (only when the map is due a check). */
    render(view:(()=>MapView|undefined)|null):void {
      const now=performance.now();
      if(!view||!context||now-checked<FRAME_MS)return;
      const elapsed=now-checked;checked=now;
      const v=view();if(!v||!size)return;
      // Eases between the ranges walking up to the bar or away from it, then settles (and stops redrawing).
      const want=inLot(v.x,v.z,NEAR)?RANGE.inside:RANGE.outside;
      range+=(want-range)*Math.min(1,elapsed/350);if(Math.abs(want-range)<.05)range=want;
      let crowd=0;for(const o of v.others)crowd+=Math.round(o.x*20)*3+Math.round(o.z*20)*7+Math.round(o.y);
      const ratio=Math.min(devicePixelRatio||1,2),backing=Math.round(size*ratio);
      const key=`${Math.round(v.x*40)}:${Math.round(v.z*40)}:${v.y>UPPER}:${Math.round(v.yaw*400)}:${Math.round(v.facing*60)}:${range.toFixed(2)}:${v.others.length}:${crowd}:${objective?`${objective.x}:${objective.z}`:''}:${backing}`;
      const name=zoneName(v.x,v.y,v.z);if(name!==zone){zone=name;label.textContent=name;}
      if(key===signature)return;
      signature=key;
      if(canvas.width!==backing){canvas.width=backing;canvas.height=backing;}
      draw(context,v,ratio);
    },
    /** The job's station (the same as the scene's objective marker), or none. */
    setObjective(target:Position|null):void {
      if(target?.x===objective?.x&&target?.z===objective?.z)return;
      objective=target;signature='';
    },
    reset():void {objective=null;signature='';zone='';label.textContent='';context?.clearRect(0,0,canvas.width,canvas.height);},
  };
}
