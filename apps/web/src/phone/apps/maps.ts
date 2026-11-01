import {CAFE_TABLES,CITY_MARKERS,GARAGES,HIGHFOOD,JUKEBOX,MAP_MARKERS,SHOP_SPOT,STREET_LABELS,cityZone,distance} from '@bar/shared';
import {escape as e} from '../../api';
import {MAP_LAYERS,cityPlaces,type MapLayerBox,type MapLayerName} from '../../minimap';
import {uiIcon} from '../../ui-icons';
import type {PhoneApp} from '../core';

const NAMES:Record<string,string>={Ponto_Balcao:'Balcão do Magrão',Ponto_Sinuca:'Sinuca',Ponto_Lounge:'Lounge',Ponto_Terraco:'Terraço',Ponto_Palco:'Palco do quintal',Ponto_Churrasqueira:'Churrasqueira',
  Ponto_Cozinha:'Cozinha',Ponto_Carga_Descarga:'Carga e descarga',Ponto_Portao_Quintal:'Portão do quintal',Ponto_Praca:'Praça',Ponto_Igreja:'Igreja',Ponto_Campinho:'Campinho',Ponto_Escola:'Escola',Ponto_Onibus:'Ponto de ônibus'};
interface Place {name:string;x:number;z:number;table?:boolean;bar?:boolean}
const markers=MAP_MARKERS as Record<string,{x:number;z:number}>;
const BAR_ONLY=new Set(['Ponto_Balcao','Ponto_Sinuca','Ponto_Lounge','Ponto_Terraco','Ponto_Palco','Ponto_Churrasqueira','Ponto_Cozinha','Ponto_Carga_Descarga','Ponto_Portao_Quintal']);
const PLACES:Place[]=[...Object.entries(NAMES).filter(([id])=>markers[id]).map(([id,name])=>({name,x:markers[id]!.x,z:markers[id]!.z,bar:BAR_ONLY.has(id)})),
  ...cityPlaces(),{name:'Base Highfood',x:HIGHFOOD.BASE.x,z:HIGHFOOD.BASE.z},...GARAGES.map(garage=>({name:garage.name,x:garage.x,z:garage.z})),
  {name:'Loja da casa',x:SHOP_SPOT.x,z:SHOP_SPOT.z,bar:true},{name:'Jukebox',x:JUKEBOX.x,z:JUKEBOX.z,bar:true},
  ...CAFE_TABLES.map(table=>({name:`Mesa ${table.number}`,x:table.x,z:table.z,table:true,bar:true}))];
const AREAS=Object.values(CITY_MARKERS).filter((marker):marker is {x:number;y:number;z:number;label:string}=>!!marker.label).map(({x,z,label})=>({x,z,name:label.replace('Conceicao','Conceição')}));
/** The whole city, bottom up: light and dark. Each layer is one path, built once; a frame fills the paths with a transform. */
const LAYER_STYLE:ReadonlyArray<readonly [MapLayerName,string,string]>=[['block','#efe9dd','#262a33'],['green','#bfe0b0','#1f3a2b'],['lot','#e7d6f0','#3b2a4d'],['tree','#a4d39a','#26503a'],['house','#d9d1c2','#3a3f4c'],['fence','#c9bfae','#333742'],['car','#c2c7cf','#4a4f5a'],['prop','#ccc6b8','#3a3e49'],['stage','#ea2fdc','#c52bbb'],['stairs','#7ad0e0','#2d6a78'],['wall','#a07fc4','#7a5fa6']];
let paths:Map<MapLayerName,Path2D>|undefined;
const addBox=(path:Path2D,box:MapLayerBox)=>{
  if(box.corners){const c=box.corners;path.moveTo(c[0]!,c[1]!);path.lineTo(c[2]!,c[3]!);path.lineTo(c[4]!,c[5]!);path.lineTo(c[6]!,c[7]!);path.closePath();return;}
  path.rect(box.x-box.hx,box.z-box.hz,box.hx*2,box.hz*2);
};
const layerPaths=()=>paths??=new Map(LAYER_STYLE.map(([name])=>{const path=new Path2D();for(const box of MAP_LAYERS.get(name)??[])if(!box.upper)addBox(path,box);return [name,path] as const;}));
/** The whole city at this many pixels a metre, kept as a picture: when zoomed out, redrawing thousands of boxes every frame is wasted work. */
const BASE_SCALE=2,CITY_SIZE=808;
const bases:Record<'light'|'dark',HTMLCanvasElement|undefined>={light:undefined,dark:undefined};
function basePicture(dark:boolean):HTMLCanvasElement {
  const key=dark?'dark':'light',existing=bases[key];if(existing)return existing;
  const picture=document.createElement('canvas');picture.width=picture.height=CITY_SIZE*BASE_SCALE;
  const g=picture.getContext('2d')!;
  g.fillStyle=dark?'#14161b':'#fbfaf6';g.fillRect(0,0,picture.width,picture.height);
  g.setTransform(BASE_SCALE,0,0,BASE_SCALE,CITY_SIZE/2*BASE_SCALE,CITY_SIZE/2*BASE_SCALE);
  const layers=layerPaths();
  for(const [name,light,night] of LAYER_STYLE){g.fillStyle=dark?night:light;g.fill(layers.get(name)!);}
  return bases[key]=picture;
}
/** How fast drawn positions catch up with the room's (which arrive ten times a second), per second. */
const CATCH_UP=14;
const ROUTE_COLOUR={delivery:'#ff3d5a',waypoint:'#0a84ff',bike:'#ff9f0a'} as const;
const metres=(value:number)=>value>=1000?`${(value/1000).toFixed(1).replace('.',',')} km`:`${Math.round(value)} m`;
/** The bike's usual speed through the city's corners, for the estimate. */
const BIKE_PACE=9;

/** Mapas: the whole city from the map's own data, you as an arrow, the people the room shows you, places, street names and a GPS: tap anywhere to mark where you want to go. */
export const mapas:PhoneApp={id:'mapas',name:'Mapas',icon:'map',tint:'linear-gradient(160deg,#7fe0b0,#2c86d8)',open(view,ctx){
  view.innerHTML=`<div class="map-view"><canvas aria-label="Mapa da cidade. Toque para marcar um destino."></canvas>
    <div class="map-search"><input class="ph-search" type="search" placeholder="Buscar lugar ou mesa" aria-label="Buscar no mapa" data-map="search"><div class="map-results" role="listbox"></div></div>
    <div class="map-zoom"><button type="button" data-map="in" aria-label="Aproximar">${uiIcon('plus')}</button><button type="button" data-map="out" aria-label="Afastar">${uiIcon('minus')}</button><button type="button" data-map="me" aria-label="Centralizar em você">${uiIcon('locate')}</button><button type="button" data-map="city" aria-label="Ver a cidade inteira">${uiIcon('map')}</button></div>
    <div class="map-card" aria-live="polite"></div></div>`;
  const canvas=view.querySelector('canvas')!,graphics=canvas.getContext('2d')!,results=view.querySelector<HTMLElement>('.map-results')!,card=view.querySelector<HTMLElement>('.map-card')!;
  const me=ctx.host.user()?.id??'',gps=ctx.host.gps;
  let zoom=3,centre={x:0,z:0},follow=true,selected:Place|undefined,drag:{x:number;y:number;id:number;moved:number}|undefined;
  /** Where each player is drawn: eased towards the room's position every frame, so dots glide instead of jumping. */
  const drawn=new Map<string,{x:number;z:number;rotation:number}>();
  let frame=0,lastAt=performance.now(),lastDescribed=0,lastCard='';
  function describe():void {
    const self=ctx.host.world()?.players[me],target=gps.target;
    let html:string;
    if(target){
      const left=gps.remaining||Math.hypot(target.x-(self?.x??target.x),target.z-(self?.z??target.z)),name=target.label||'Destino marcado';
      html=`<b>${e(name)}</b><small>${metres(left)} pelas ruas · cerca de ${Math.max(1,Math.round(left/BIKE_PACE/60))} min de moto · ${e(cityZone(target.x,target.z))}</small>${target.source==='delivery'?'':`<button type="button" class="ph-mini" data-map="clear-target" aria-label="Remover destino">${uiIcon('close')}</button>`}`;
    }else if(selected)html=`<b>${e(selected.name)}</b><small>${self?`a ${Math.round(distance(self,selected))} m de você`:''}</small><button type="button" class="ph-mini route" data-map="route" aria-label="Traçar rota">${uiIcon('compass')}</button><button type="button" class="ph-mini" data-map="clear" aria-label="Fechar">${uiIcon('close')}</button>`;
    else html=self?`<b>Toque no mapa para marcar um destino</b><small>${e(nearestPlace(self))}</small>`:'<b>Mapa da cidade</b>';
    if(html!==lastCard){lastCard=html;card.innerHTML=html;}
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
    graphics.fillStyle=dark?'#14161b':'#fbfaf6';graphics.fillRect(0,0,width,height);
    if(zoom*ratio<=BASE_SCALE*1.4){
      // Zoomed out: the picture of the city.
      graphics.imageSmoothingEnabled=true;
      graphics.setTransform(ratio*zoom/BASE_SCALE,0,0,ratio*zoom/BASE_SCALE,ratio*(width/2-(centre.x+CITY_SIZE/2)*zoom),ratio*(height/2-(centre.z+CITY_SIZE/2)*zoom));
      graphics.drawImage(basePicture(dark),0,0);
    }else{
      // The map in metres: one transform and one fill per layer.
      graphics.setTransform(ratio*zoom,0,0,ratio*zoom,ratio*(width/2-centre.x*zoom),ratio*(height/2-centre.z*zoom));
      const layers=layerPaths();
      for(const [name,light,night] of LAYER_STYLE){graphics.fillStyle=dark?night:light;graphics.fill(layers.get(name)!);}
    }
    // The GPS line, under the names.
    const route=gps.route,target=gps.target;
    if(route.length>1&&target){
      graphics.setTransform(ratio,0,0,ratio,0,0);graphics.lineCap='round';graphics.lineJoin='round';
      const trace=()=>{graphics.beginPath();route.forEach(([x,z],i)=>i?graphics.lineTo(sx(x),sy(z)):graphics.moveTo(sx(x),sy(z)));graphics.stroke();};
      graphics.strokeStyle='rgba(255,255,255,.9)';graphics.lineWidth=7;trace();
      graphics.strokeStyle=ROUTE_COLOUR[target.source];graphics.lineWidth=4.5;trace();
    }
    graphics.setTransform(ratio,0,0,ratio,0,0);
    graphics.textAlign='center';graphics.textBaseline='alphabetic';
    // Names that would overlap one already written are left out (the chosen place always shows).
    const written:Array<{x:number;y:number;w:number}>=[];
    const label=(text:string,x:number,y:number,force=false)=>{
      const w=graphics.measureText(text).width+6;
      if(!force&&written.some(other=>Math.abs(other.x-x)<(other.w+w)/2&&Math.abs(other.y-y)<13))return;
      written.push({x,y,w});graphics.fillText(text,x,y);
    };
    if(zoom<1.2){
      graphics.font='700 12px -apple-system,"Segoe UI",sans-serif';graphics.fillStyle=dark?'rgba(255,255,255,.6)':'rgba(0,0,0,.55)';
      for(const area of AREAS)label(area.name,sx(area.x),sy(area.z));
    }else if(zoom>=1.6){
      // Street names along their street.
      graphics.font='500 10px -apple-system,"Segoe UI",sans-serif';graphics.fillStyle=dark?'rgba(235,235,245,.62)':'rgba(40,40,50,.66)';
      const named:Array<{name:string;x:number;y:number}>=[];
      for(const street of STREET_LABELS){
        const x=sx(street.x),y=sy(street.z);if(x<-60||y<-60||x>width+60||y>height+60)continue;
        // The same street once in view.
        if(named.some(other=>other.name===street.name&&Math.hypot(other.x-x,other.y-y)<220))continue;
        named.push({name:street.name,x,y});
        graphics.save();graphics.translate(x,y);graphics.rotate(street.angle);graphics.fillText(street.name,0,3);graphics.restore();
      }
    }
    graphics.font='600 11px -apple-system,"Segoe UI",sans-serif';
    const ordered=[...PLACES].sort((a,b)=>Number(b===selected)-Number(a===selected));
    for(const place of ordered){
      if(place.bar&&zoom<4&&place!==selected)continue;
      if(place.table&&zoom<9&&place!==selected)continue;
      const x=sx(place.x),y=sy(place.z),chosen=place===selected;
      if(x<-40||y<-20||x>width+40||y>height+20)continue;
      graphics.fillStyle=chosen?'#ea2fdc':place.table?'#8a7a66':place.name==='Base Highfood'?'#ff3d5a':'#d6336c';
      graphics.beginPath();graphics.arc(x,y,chosen?7:place.table?3.5:5,0,Math.PI*2);graphics.fill();
      graphics.strokeStyle='#fff';graphics.lineWidth=2;graphics.stroke();
      if(chosen||(!place.table&&zoom>=1.6)||zoom>=12){graphics.fillStyle=dark?'#f2f2f7':'#1c1c1e';label(place.name,x,y-10,chosen);}
    }
    // Your bike, when it is out there.
    const bike=Object.values(world?.motos??{}).find(moto=>moto.ownerId===me&&moto.riderId!==me);
    if(bike){
      const x=sx(bike.x),y=sy(bike.z);
      graphics.fillStyle='#ff9f0a';graphics.beginPath();graphics.arc(x,y,6,0,Math.PI*2);graphics.fill();graphics.strokeStyle='#fff';graphics.lineWidth=2;graphics.stroke();
      if(zoom>=1.6){graphics.fillStyle=dark?'#f2f2f7':'#1c1c1e';label('Sua moto',x,y+18,true);}
    }
    for(const player of Object.values(world?.players??{})){
      if(player.id===me||!player.connected)continue;
      const at=drawn.get(player.id)??player,x=sx(at.x),y=sy(at.z);
      if(x<-30||y<-30||x>width+30||y>height+30)continue;
      graphics.fillStyle=player.color||'#888';graphics.beginPath();graphics.arc(x,y,4.5,0,Math.PI*2);graphics.fill();graphics.strokeStyle='#fff';graphics.lineWidth=1.5;graphics.stroke();
      if(zoom>=7){graphics.fillStyle=dark?'#d1d1d6':'#3a3a3c';label(player.displayName,x,y+15);}
    }
    if(target){
      // The pin of where the line goes.
      const x=sx(target.x),y=sy(target.z);
      graphics.fillStyle=ROUTE_COLOUR[target.source];graphics.strokeStyle='#fff';graphics.lineWidth=2.5;
      graphics.beginPath();graphics.moveTo(x,y);graphics.bezierCurveTo(x-12,y-14,x-9,y-26,x,y-26);graphics.bezierCurveTo(x+9,y-26,x+12,y-14,x,y);graphics.closePath();graphics.fill();graphics.stroke();
      graphics.fillStyle='#fff';graphics.beginPath();graphics.arc(x,y-17,3.4,0,Math.PI*2);graphics.fill();
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
  const zoomBy=(factor:number)=>{zoom=Math.max(.32,Math.min(32,zoom*factor));draw();};
  function select(place:Place|undefined):void {selected=place;if(place){follow=false;centre={x:place.x,z:place.z};zoom=Math.max(zoom,place.bar?(place.table?12:6):2.5);}results.innerHTML='';describe();draw();}
  function mark(x:number,z:number,label:string):void {selected=undefined;gps.setWaypoint({x,y:0,z,source:'waypoint',label});lastCard='';describe();}
  /** A tap: the place it landed on, or that spot of the map. */
  function tapped(event:PointerEvent):void {
    const rect=canvas.getBoundingClientRect(),scale=rect.width/canvas.clientWidth||1,px=(event.clientX-rect.left)/scale,py=(event.clientY-rect.top)/scale;
    const x=centre.x+(px-canvas.clientWidth/2)/zoom,z=centre.z+(py-canvas.clientHeight/2)/zoom;
    const near=PLACES.filter(place=>!place.table&&(!place.bar||zoom>=4)).map(place=>({place,gap:Math.hypot(place.x-x,place.z-z)*zoom})).sort((a,b)=>a.gap-b.gap)[0];
    if(near&&near.gap<14)mark(near.place.x,near.place.z,near.place.name);
    else mark(x,z,'Destino marcado');
  }
  view.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('[data-map],[data-place]');if(!button)return;
    if(button.dataset.place!==undefined){select(PLACES[Number(button.dataset.place)]);const input=view.querySelector<HTMLInputElement>('[data-map="search"]');if(input){input.value='';input.blur();}return;}
    switch(button.dataset.map){
      case 'in':zoomBy(1.4);break;case 'out':zoomBy(1/1.4);break;
      case 'me':follow=true;zoom=Math.max(zoom,3);selected=undefined;describe();draw();break;
      case 'city':follow=false;centre={x:0,z:0};zoom=Math.min(canvas.clientWidth,canvas.clientHeight)/CITY_SIZE;break;
      case 'clear':select(undefined);break;
      case 'route':if(selected)mark(selected.x,selected.z,selected.name);break;
      case 'clear-target':gps.setWaypoint(null);lastCard='';describe();break;
    }
  });
  view.addEventListener('input',event=>{
    const query=(event.target as HTMLInputElement).value.trim().toLowerCase();
    const found=query?PLACES.map((place,i)=>({place,i})).filter(({place})=>place.name.toLowerCase().includes(query)).slice(0,6):[];
    results.innerHTML=found.map(({place,i})=>`<button type="button" role="option" data-place="${i}">${uiIcon(place.table?'seat':'mapPin')}${e(place.name)}</button>`).join('');
  });
  canvas.addEventListener('pointerdown',event=>{drag={x:event.clientX,y:event.clientY,id:event.pointerId,moved:0};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    drag.moved+=Math.hypot(event.clientX-drag.x,event.clientY-drag.y);
    if(drag.moved<5)return;
    // The phone is drawn scaled: screen pixels are turned back into the map's own.
    const scale=canvas.getBoundingClientRect().width/canvas.clientWidth||1;
    centre={x:centre.x-(event.clientX-drag.x)/scale/zoom,z:centre.z-(event.clientY-drag.y)/scale/zoom};drag.x=event.clientX;drag.y=event.clientY;follow=false;
  });
  canvas.addEventListener('pointerup',event=>{if(drag&&drag.moved<5)tapped(event);drag=undefined;});
  canvas.addEventListener('pointercancel',()=>{drag=undefined;});
  canvas.addEventListener('wheel',event=>{event.preventDefault();event.stopPropagation();zoomBy(event.deltaY<0?1.15:1/1.15);},{passive:false});
  // Drawn every display frame while the app is open (the phone closes the app when it is put away).
  const loop=(now:number)=>{
    const dt=Math.min(.1,(now-lastAt)/1000);lastAt=now;
    ease(dt);draw();
    if(now-lastDescribed>500){lastDescribed=now;describe();}
    frame=requestAnimationFrame(loop);
  };
  describe();frame=requestAnimationFrame(loop);
  return ()=>cancelAnimationFrame(frame);
}};
