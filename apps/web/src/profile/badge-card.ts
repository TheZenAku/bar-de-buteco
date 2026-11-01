import {ACHIEVEMENT_TIERS,BADGE_RARITIES,BADGE_RARITY_INFO,RAREST_BADGE,achievementOfBadge,type Badge} from '@bar/shared';
import {escape as e} from '../api';
import {uiIcon} from '../ui-icons';
import './profile.css';
import './badge-card.css';

export const badgeImageUrl=(id:string):string=>`/api/badges/images/${encodeURIComponent(id)}`;
/** The level of a badge earned by playing, on its hexagon (the same icon runs through its whole series). */
const medalLevel=(id:string|undefined):string=>{const achievement=achievementOfBadge(id);return achievement?`<i class="pf-medal-level">${ACHIEVEMENT_TIERS[achievement.level]!.numeral}</i>`:'';};
/** The medal of a badge: an image stands alone, with all the room there is; an icon goes on a hexagon of its colour. */
export const badgeMedal=(badge:Pick<Badge,'icon'|'color'|'image'>&{id?:string}):string=>badge.image?`<span class="pf-art"><img src="${e(badgeImageUrl(badge.image))}" alt="" draggable="false"></span>`:`<span class="pf-medal" style="--medal:${e(badge.color)}">${uiIcon(badge.icon)}${medalLevel(badge.id)}</span>`;
/** What marks a badge's rarity where it is small: its colour, and the glints of the rarest (profile.css). */
export const rarityAttributes=(badge:Pick<Badge,'rarity'>):string=>`data-rarity="${e(badge.rarity)}" style="--rarity:${e(BADGE_RARITY_INFO[badge.rarity].color)}"`;

type CardBadge=Pick<Badge,'name'|'description'|'icon'|'color'|'image'|'rarity'>&{id?:string};
const MAX_TILT=17;
const SPRING=70,DAMPING=9;
// Facets face every way in this square, and one flares when the light falls within REACH of where it faces.
const FACING=1.1,REACH=.34;
const FRAME_INSET=6.5,FRAME_GAP=10.5,SPECKS_PER_PIXEL=1/480;
const GLINT_HUES=['#ffffff','#fff1b8','#ffd6f4','#bfefff','#d9c8ff'];
const clamp=(value:number)=>Math.max(-1,Math.min(1,value));

function seeded(text:string):()=>number {
  let state=[...text].reduce((hash,char)=>Math.imul(hash^char.charCodeAt(0),16777619),2166136261);
  return ()=>{state=(state+0x6d2b79f5)|0;let mixed=Math.imul(state^state>>>15,1|state);mixed=mixed+Math.imul(mixed^mixed>>>7,61|mixed)^mixed;return ((mixed^mixed>>>14)>>>0)/4294967296;};
}
let glintSprites:HTMLCanvasElement[]|undefined;
/** A four-pointed star in its halo, one per hue; drawing a picture is far cheaper than a path, for hundreds of stones a frame. */
function glints():HTMLCanvasElement[] {
  return glintSprites??=GLINT_HUES.map(hue=>{
    const sprite=document.createElement('canvas');sprite.width=sprite.height=64;
    const g=sprite.getContext('2d')!,halo=g.createRadialGradient(32,32,0,32,32,22);
    halo.addColorStop(0,hue);halo.addColorStop(.25,`${hue}66`);halo.addColorStop(1,`${hue}00`);
    g.fillStyle=halo;g.fillRect(0,0,64,64);
    g.fillStyle=hue;g.beginPath();
    for(let i=0;i<8;i++){const angle=i*Math.PI/4,radius=i%2?3:31;g.lineTo(32+Math.sin(angle)*radius,32-Math.cos(angle)*radius);}
    g.fill();
    return sprite;
  });
}
/** The stones along a frame with cut corners, evenly spaced. */
function frameStones(width:number,height:number):Array<[number,number]> {
  const a=FRAME_INSET,b=FRAME_INSET+7,right=width-a,bottom=height-a;
  const corners:Array<[number,number]>=[[b,a],[width-b,a],[right,b],[right,height-b],[width-b,bottom],[b,bottom],[a,height-b],[a,b]];
  return corners.flatMap(([x,y],index)=>{
    const [toX,toY]=corners[(index+1)%corners.length]!,count=Math.max(1,Math.round(Math.hypot(toX-x,toY-y)/FRAME_GAP));
    return Array.from({length:count},(_,step)=>[x+(toX-x)*step/count,y+(toY-y)*step/count] as [number,number]);
  });
}
interface Stone {x:number;y:number;size:number;faceX:number;faceY:number;sprite:HTMLCanvasElement;phase:number;speed:number}
/** The rarest card's stones: set in the frame and scattered on the face, each flashing when the tilt turns it to the light, as glitter does. */
function studs(canvas:HTMLCanvasElement,seed:string):(lightX:number,lightY:number,time:number)=>void {
  const width=canvas.offsetWidth,height=canvas.offsetHeight,scale=Math.min(devicePixelRatio||1,2),random=seeded(seed),sprites=glints();
  canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
  const context=canvas.getContext('2d')!;context.scale(scale,scale);
  const stone=(x:number,y:number,size:number):Stone=>({x,y,size,faceX:(random()*2-1)*FACING,faceY:(random()*2-1)*FACING,sprite:sprites[Math.floor(random()*sprites.length)]!,phase:random()*6.3,speed:.6+random()*1.4});
  const frame=frameStones(width,height).map(([x,y])=>stone(x,y,13+random()*5));
  const specks=Array.from({length:Math.round(width*height*SPECKS_PER_PIXEL)},()=>stone(random()*width,random()*height,8+random()*random()*30));
  // What stays still: the set stones, and the dust between them. Only what flares is drawn each frame.
  const still=document.createElement('canvas');still.width=canvas.width;still.height=canvas.height;
  const base=still.getContext('2d')!;base.scale(scale,scale);
  for(const {x,y} of frame){
    const gem=base.createRadialGradient(x-.5,y-.6,0,x,y,2.3);
    gem.addColorStop(0,'#fff');gem.addColorStop(.45,'#ffe9a8');gem.addColorStop(1,'#7a5412');
    base.fillStyle=gem;base.beginPath();base.arc(x,y,2.3,0,Math.PI*2);base.fill();
  }
  base.fillStyle='rgb(255 244 214 / 42%)';
  for(const {x,y,size} of specks)base.fillRect(x,y,size>18?1.4:.9,size>18?1.4:.9);
  const stones=[...frame,...specks];
  return (lightX,lightY,time)=>{
    context.globalCompositeOperation='source-over';context.globalAlpha=1;
    context.clearRect(0,0,width,height);context.drawImage(still,0,0,width,height);
    context.globalCompositeOperation='lighter';
    for(const each of stones){
      const dx=each.faceX+Math.sin(time*each.speed+each.phase)*.07-lightX,dy=each.faceY+Math.cos(time*each.speed*.8+each.phase)*.07-lightY;
      const glint=1-(dx*dx+dy*dy)/(REACH*REACH);
      if(glint<=0)continue;
      const size=each.size*(.45+glint*.75);
      context.globalAlpha=Math.min(1,glint*1.4);
      context.drawImage(each.sprite,each.x-size/2,each.y-size/2,size,size);
    }
  };
}

let closeCurrent:(()=>void)|undefined;
/**
 * A badge blown up into a card that tilts under the pointer. The glare follows it; the rarest also has its holographic foil and
 * stones. The card floats over the game and the administration, and costs nothing once closed: all the motion is one frame loop of its own.
 */
export function openBadgeCard(badge:CardBadge,from?:HTMLElement):void {
  closeCurrent?.();
  const info=BADGE_RARITY_INFO[badge.rarity],level=BADGE_RARITIES.indexOf(badge.rarity),rarest=badge.rarity===RAREST_BADGE;
  const still=matchMedia('(prefers-reduced-motion:reduce)').matches;
  const opener=document.activeElement instanceof HTMLElement?document.activeElement:undefined;
  const backdrop=document.createElement('div');
  backdrop.className='bc-backdrop';backdrop.setAttribute('role','dialog');backdrop.setAttribute('aria-modal','true');backdrop.setAttribute('aria-label',`Emblema ${badge.name}, ${info.name}`);
  backdrop.innerHTML=`<div class="bc-scene"><article class="bc-card" data-rarity="${e(badge.rarity)}" style="--rarity:${e(info.color)}">
      <header class="bc-rarity"><span>${e(info.name)}</span><i aria-hidden="true">${BADGE_RARITIES.map((_,index)=>`<b class="${index<=level?'on':''}"></b>`).join('')}</i></header>
      <div class="bc-art">${badgeMedal(badge)}</div>
      ${rarest?'<canvas class="bc-studs" aria-hidden="true"></canvas><i class="bc-holo" aria-hidden="true"></i>':''}
      <i class="bc-glare" aria-hidden="true"></i>
      <div class="bc-text"><h2>${e(badge.name)}</h2><p>${e(badge.description)}</p></div>
    </article></div><button type="button" class="bc-close" aria-label="Fechar">${uiIcon('close')}</button>`;
  document.body.append(backdrop);
  const scene=backdrop.querySelector<HTMLElement>('.bc-scene')!,card=backdrop.querySelector<HTMLElement>('.bc-card')!,canvas=backdrop.querySelector<HTMLCanvasElement>('.bc-studs');
  backdrop.querySelector<HTMLElement>('.bc-close')!.focus({preventScroll:true});

  let drawStuds=canvas?studs(canvas,badge.name):undefined;
  let box=scene.getBoundingClientRect();
  let pointer:{x:number;y:number}|undefined,x=0,y=0,speedX=0,speedY=0,frame=0,last=performance.now(),closed=false;
  const paint=(time:number)=>{
    card.style.transform=`rotateX(${(y*MAX_TILT).toFixed(2)}deg) rotateY(${(-x*MAX_TILT).toFixed(2)}deg)`;
    card.style.setProperty('--mx',x.toFixed(3));card.style.setProperty('--my',y.toFixed(3));
    card.style.setProperty('--px',`${(50+x*50).toFixed(1)}%`);card.style.setProperty('--py',`${(50+y*50).toFixed(1)}%`);
    card.style.setProperty('--hyp',Math.min(1,Math.hypot(x,y)).toFixed(3));
    drawStuds?.(x*FACING,y*FACING,time);
  };
  const tick=(now:number)=>{
    const step=Math.min(.033,(now-last)/1000),time=now/1000;last=now;
    // Left alone, it sways a little, so the glare and the stones keep playing.
    const targetX=pointer?pointer.x:Math.sin(time*.7)*.34,targetY=pointer?pointer.y:Math.cos(time*.53)*.28;
    speedX+=(SPRING*(targetX-x)-DAMPING*speedX)*step;speedY+=(SPRING*(targetY-y)-DAMPING*speedY)*step;
    x+=speedX*step;y+=speedY*step;
    paint(time);
    frame=requestAnimationFrame(tick);
  };
  const aim=(event:PointerEvent)=>{pointer={x:clamp((event.clientX-box.left)/box.width*2-1),y:clamp((event.clientY-box.top)/box.height*2-1)};};
  const measure=()=>{box=scene.getBoundingClientRect();};
  scene.addEventListener('pointerenter',event=>{measure();aim(event);});
  scene.addEventListener('pointermove',aim);
  // Touch: the finger keeps the card until it lifts.
  scene.addEventListener('pointerdown',event=>{measure();scene.setPointerCapture(event.pointerId);aim(event);});
  scene.addEventListener('pointerleave',()=>{pointer=undefined;});
  const resized=()=>{measure();if(canvas)drawStuds=studs(canvas,badge.name);if(still)paint(0);};
  addEventListener('resize',resized);

  const close=()=>{
    if(closed)return;
    closed=true;closeCurrent=undefined;
    cancelAnimationFrame(frame);removeEventListener('resize',resized);removeEventListener('keydown',key,true);
    backdrop.style.pointerEvents='none';
    const back=from?.isConnected?from:opener?.isConnected?opener:undefined;
    back?.focus({preventScroll:true});
    if(still){backdrop.remove();return;}
    const leave=[{transform:'none',opacity:1},{...shrunk(),opacity:0}];
    backdrop.animate([{opacity:1},{opacity:0}],{duration:170,easing:'ease-in'});
    void scene.animate(leave,{duration:170,easing:'ease-in',fill:'forwards'}).finished.finally(()=>backdrop.remove());
  };
  /** Where the card sits when it is the size of the medal it came from. */
  const shrunk=():{transform:string}=>{
    if(!from?.isConnected)return {transform:'scale(.82)'};
    const source=from.getBoundingClientRect(),target=box;
    return {transform:`translate(${(source.left+source.width/2-target.left-target.width/2).toFixed(1)}px,${(source.top+source.height/2-target.top-target.height/2).toFixed(1)}px) scale(${(source.width/target.width).toFixed(3)})`};
  };
  // Before the game's own Esc, which would close the window behind the card.
  const key=(event:KeyboardEvent)=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
    else if(event.key==='Tab'){event.preventDefault();event.stopPropagation();backdrop.querySelector<HTMLElement>('.bc-close')!.focus();}
  };
  addEventListener('keydown',key,true);
  backdrop.addEventListener('click',event=>{if(event.target===backdrop||(event.target as HTMLElement).closest('.bc-close'))close();});
  closeCurrent=close;

  if(still){paint(0);return;}
  paint(last/1000);
  backdrop.animate([{opacity:0},{opacity:1}],{duration:200,easing:'ease-out'});
  void scene.animate([{...shrunk(),opacity:.4},{transform:'none',opacity:1}],{duration:420,easing:'cubic-bezier(.2,.85,.25,1.08)'}).finished.then(measure,()=>{});
  frame=requestAnimationFrame(tick);
}
