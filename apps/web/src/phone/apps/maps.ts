import {CAFE_TABLES,JUKEBOX,MAP_COLLIDERS,MAP_MARKERS,SHOP_SPOT,distance} from '@bar/shared';
import {escape as e} from '../../api';
import {uiIcon} from '../../ui-icons';
import type {PhoneApp} from '../core';

const NAMES:Record<string,string>={Ponto_Balcao:'Balcão do Magrão',Ponto_Sinuca:'Sinuca',Ponto_Lounge:'Lounge',Ponto_Terraco:'Terraço',Ponto_Palco:'Palco do quintal',Ponto_Churrasqueira:'Churrasqueira',
  Ponto_Cozinha:'Cozinha',Ponto_Carga_Descarga:'Carga e descarga',Ponto_Portao_Quintal:'Portão do quintal',Ponto_Praca:'Praça',Ponto_Igreja:'Igreja',Ponto_Campinho:'Campinho',Ponto_Escola:'Escola',Ponto_Onibus:'Ponto de ônibus'};
interface Place {name:string;x:number;z:number;table?:boolean}
const markers=MAP_MARKERS as Record<string,{x:number;z:number}>;
const PLACES:Place[]=[...Object.entries(NAMES).filter(([id])=>markers[id]).map(([id,name])=>({name,x:markers[id]!.x,z:markers[id]!.z})),
  {name:'Loja da casa',x:SHOP_SPOT.x,z:SHOP_SPOT.z},{name:'Jukebox',x:JUKEBOX.x,z:JUKEBOX.z},
  ...CAFE_TABLES.map(table=>({name:`Mesa ${table.number}`,x:table.x,z:table.z,table:true}))];
/** Collider layers from the bottom up: streets, the neighbourhood, outdoor things, the bar's walls, furniture, doors, the stage. */
const LAYERS:Array<{prefix:string;light:string;dark:string}>=[{prefix:'COL_Rua',light:'#ffffff',dark:'#3b404c'},{prefix:'COL_Viz',light:'#ddd6c9',dark:'#2b2e37'},{prefix:'COL_Ext',light:'#c4d8b9',dark:'#26332b'},
  {prefix:'COL_Predio',light:'#c4b0d8',dark:'#4f4163'},{prefix:'COL_Int',light:'#e9dcc6',dark:'#3e3a33'},{prefix:'COL_Mob',light:'#e3d2b8',dark:'#3c362d'},{prefix:'COL_Porta',light:'#f59847',dark:'#f59847'},{prefix:'COL_Palco',light:'#ea2fdc',dark:'#c52bbb'}];
/** Each layer's rectangles as one path in metres, built once: a frame fills eight paths instead of 1,500 rectangles. */
let paths:Path2D[]|undefined;
const layerPaths=()=>paths??=LAYERS.map(layer=>{
  const path=new Path2D();
  for(const rect of MAP_COLLIDERS)if(rect.id.startsWith(layer.prefix))path.rect(rect.x-rect.hx,rect.z-rect.hz,rect.hx*2,rect.hz*2);
  return path;
});
/** How fast drawn positions catch up with the room's (which arrive ten times a second), per second. */
const CATCH_UP=14;

/** Mapas: the neighbourhood drawn from the map's own colliders, you as an arrow, the people the room shows you and the bar's places. */
export const mapas:PhoneApp={id:'mapas',name:'Mapas',icon:'map',tint:'linear-gradient(160deg,#7fe0b0,#2c86d8)',open(view,ctx){
  view.innerHTML=`<div class="map-view"><canvas aria-label="Mapa do Highland e arredores"></canvas>
    <div class="map-search"><input class="ph-search" type="search" placeholder="Buscar lugar ou mesa" aria-label="Buscar no mapa" data-map="search"><div class="map-results" role="listbox"></div></div>
    <div class="map-zoom"><button type="button" data-map="in" aria-label="Aproximar">${uiIcon('plus')}</button><button type="button" data-map="out" aria-label="Afastar">${uiIcon('minus')}</button><button type="button" data-map="me" aria-label="Centralizar em você">${uiIcon('locate')}</button></div>
    <div class="map-card" aria-live="polite"></div></div>`;
  const canvas=view.querySelector('canvas')!,graphics=canvas.getContext('2d')!,results=view.querySelector<HTMLElement>('.map-results')!,card=view.querySelector<HTMLElement>('.map-card')!;
  const me=ctx.host.user()?.id??'';
  let zoom=6,centre={x:0,z:0},follow=true,selected:Place|undefined,drag:{x:number;y:number;id:number}|undefined;
  /** Where each player is drawn: eased towards the room's position every frame, so dots glide instead of jumping. */
  const drawn=new Map<string,{x:number;z:number;rotation:number}>();
  let frame=0,lastAt=performance.now(),lastDescribed=0;
  function describe():void {
    const self=ctx.host.world()?.players[me];
    if(!selected){card.innerHTML=self?`<b>Você está aqui</b><small>${e(nearestPlace(self))}</small>`:'<b>Mapa do bairro</b>';return;}
    card.innerHTML=`<b>${e(selected.name)}</b><small>${self?`a ${Math.round(distance(self,selected))} m de você`:''}</small><button type="button" class="ph-mini" data-map="clear" aria-label="Fechar">${uiIcon('close')}</button>`;
  }
  const nearestPlace=(at:{x:number;z:number})=>{const place=PLACES.filter(p=>!p.table).sort((a,b)=>distance(at,a)-distance(at,b))[0];return place?`Perto de: ${place.name}`:'';};
  /** Moves the drawn positions towards the room's, frame-rate independent; a teleport (over 6 m) snaps. */
  function ease(dt:number):void {
    const world=ctx.host.world(),k=1-Math.exp(-CATCH_UP*dt);
    for(const player of Object.values(world?.players??{})){
      const shown=drawn.get(player.id);
      if(!shown||Math.hypot(player.x-shown.x,player.z-shown.z)>6){drawn.set(player.id,{x:player.x,z:player.z,rotation:player.rotation});continue;}
      shown.x+=(player.x-shown.x)*k;shown.z+=(player.z-shown.z)*k;
      // The shortest way round.
      const turn=Math.atan2(Math.sin(player.rotation-shown.rotation),Math.cos(player.rotation-shown.rotation));shown.rotation+=turn*k;
    }
    for(const id of drawn.keys())if(!world?.players[id])drawn.delete(id);
  }
  function draw():void {
    const dark=ctx.settings().dark,ratio=Math.min(2,devicePixelRatio||1),width=canvas.clientWidth,height=canvas.clientHeight;
    if(!width||!height)return;
    if(canvas.width!==Math.round(width*ratio)||canvas.height!==Math.round(height*ratio)){canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);}
    const world=ctx.host.world(),player=world?.players[me],self=player&&drawn.get(me)?{...player,...drawn.get(me)}:player;
    if(follow&&self)centre={x:self.x,z:self.z};
    const sx=(x:number)=>width/2+(x-centre.x)*zoom,sy=(z:number)=>height/2+(z-centre.z)*zoom;
    graphics.setTransform(ratio,0,0,ratio,0,0);
    graphics.fillStyle=dark?'#1d2026':'#ece6da';graphics.fillRect(0,0,width,height);
    // The map in metres: one transform and one fill per layer.
    graphics.setTransform(ratio*zoom,0,0,ratio*zoom,ratio*(width/2-centre.x*zoom),ratio*(height/2-centre.z*zoom));
    const layers=layerPaths();
    LAYERS.forEach((layer,i)=>{graphics.fillStyle=dark?layer.dark:layer.light;graphics.fill(layers[i]!);});
    graphics.setTransform(ratio,0,0,ratio,0,0);
    graphics.textAlign='center';graphics.font='600 11px -apple-system,"Segoe UI",sans-serif';
    // Names that would overlap one already written are left out (the chosen place always shows).
    const written:Array<{x:number;y:number;w:number}>=[];
    const label=(text:string,x:number,y:number,force=false)=>{
      const w=graphics.measureText(text).width+6;
      if(!force&&written.some(other=>Math.abs(other.x-x)<(other.w+w)/2&&Math.abs(other.y-y)<13))return;
      written.push({x,y,w});graphics.fillText(text,x,y);
    };
    const ordered=[...PLACES].sort((a,b)=>Number(b===selected)-Number(a===selected));
    for(const place of ordered){
      if(place.table&&zoom<9&&place!==selected)continue;
      const x=sx(place.x),y=sy(place.z),chosen=place===selected;
      if(x<-40||y<-20||x>width+40||y>height+20)continue;
      graphics.fillStyle=chosen?'#ea2fdc':place.table?'#8a7a66':'#d6336c';
      graphics.beginPath();graphics.arc(x,y,chosen?7:place.table?3.5:5,0,Math.PI*2);graphics.fill();
      graphics.strokeStyle='#fff';graphics.lineWidth=2;graphics.stroke();
      if(chosen||(!place.table&&zoom>=4)||zoom>=12){graphics.fillStyle=dark?'#f2f2f7':'#1c1c1e';label(place.name,x,y-10,chosen);}
    }
    for(const player of Object.values(world?.players??{})){
      if(player.id===me||!player.connected)continue;
      const at=drawn.get(player.id)??player,x=sx(at.x),y=sy(at.z);
      if(x<-30||y<-30||x>width+30||y>height+30)continue;
      graphics.fillStyle=player.color||'#888';graphics.beginPath();graphics.arc(x,y,4.5,0,Math.PI*2);graphics.fill();graphics.strokeStyle='#fff';graphics.lineWidth=1.5;graphics.stroke();
      if(zoom>=7){graphics.fillStyle=dark?'#d1d1d6':'#3a3a3c';label(player.displayName,x,y+15);}
    }
    if(self){
      // You: the direction you walk, as the arrow (rotation = atan2(dx, dz); the map draws +z downwards).
      const x=sx(self.x),y=sy(self.z),angle=self.rotation;
      graphics.fillStyle='rgba(10,132,255,.18)';graphics.beginPath();graphics.arc(x,y,18,0,Math.PI*2);graphics.fill();
      graphics.save();graphics.translate(x,y);graphics.rotate(-angle);
      graphics.fillStyle='#0a84ff';graphics.strokeStyle='#fff';graphics.lineWidth=2;
      graphics.beginPath();graphics.moveTo(0,10);graphics.lineTo(7,-7);graphics.lineTo(0,-3);graphics.lineTo(-7,-7);graphics.closePath();graphics.fill();graphics.stroke();graphics.restore();
    }
  }
  const zoomBy=(factor:number)=>{zoom=Math.max(1.2,Math.min(32,zoom*factor));draw();};
  function select(place:Place|undefined):void {selected=place;if(place){follow=false;centre={x:place.x,z:place.z};zoom=Math.max(zoom,place.table?12:6);}results.innerHTML='';describe();draw();}
  view.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('[data-map],[data-place]');if(!button)return;
    if(button.dataset.place!==undefined){select(PLACES[Number(button.dataset.place)]);const input=view.querySelector<HTMLInputElement>('[data-map="search"]');if(input){input.value='';input.blur();}return;}
    switch(button.dataset.map){case 'in':zoomBy(1.4);break;case 'out':zoomBy(1/1.4);break;case 'me':follow=true;zoom=Math.max(zoom,6);selected=undefined;describe();draw();break;case 'clear':select(undefined);break;}
  });
  view.addEventListener('input',event=>{
    const query=(event.target as HTMLInputElement).value.trim().toLowerCase();
    const found=query?PLACES.map((place,i)=>({place,i})).filter(({place})=>place.name.toLowerCase().includes(query)).slice(0,6):[];
    results.innerHTML=found.map(({place,i})=>`<button type="button" role="option" data-place="${i}">${uiIcon(place.table?'seat':'mapPin')}${e(place.name)}</button>`).join('');
  });
  canvas.addEventListener('pointerdown',event=>{drag={x:event.clientX,y:event.clientY,id:event.pointerId};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    // The phone is drawn scaled: screen pixels are turned back into the map's own.
    const scale=canvas.getBoundingClientRect().width/canvas.clientWidth||1;
    centre={x:centre.x-(event.clientX-drag.x)/scale/zoom,z:centre.z-(event.clientY-drag.y)/scale/zoom};drag.x=event.clientX;drag.y=event.clientY;follow=false;
  });
  const release=()=>{drag=undefined;};canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('wheel',event=>{event.preventDefault();event.stopPropagation();zoomBy(event.deltaY<0?1.15:1/1.15);},{passive:false});
  // Drawn every display frame while the app is open (the phone closes the app when it is put away).
  const loop=(now:number)=>{
    const dt=Math.min(.1,(now-lastAt)/1000);lastAt=now;
    ease(dt);draw();
    if(!selected&&now-lastDescribed>500){lastDescribed=now;describe();}
    frame=requestAnimationFrame(loop);
  };
  describe();frame=requestAnimationFrame(loop);
  return ()=>cancelAnimationFrame(frame);
}};
