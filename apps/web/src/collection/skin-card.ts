import {RARITIES,RARITY_INFO,RAREST,type Rarity} from '@bar/shared';
import {escape as e} from '../api';
import {studs} from '../profile/badge-card';
import './collection.css';

// Change after rendering the art again (npm run assets:cards): the files are cached for long.
const CARD_ART='20261105';
const art=(folder:string,id:string)=>`${import.meta.env.BASE_URL}skins/${folder}/${encodeURIComponent(id)}.webp?v=${CARD_ART}`;
export const cardArt=(id:string)=>art('cards',id);
const turnArt=(id:string)=>art('turn',id);
// The sheet made by tools/assets/render-skin-cards.mjs: the card's own picture is its first cell.
const TURN_FRAMES=24,TURN_COLUMNS=6,TURN_ROWS=4;
// Pixels of drag for one frame of the turn, and how fast a throw dies out (per second).
const DRAG_PER_FRAME=9,THROW_DAMPING=2.6;
const RETURN_AFTER_MS=1400,RETURN_SPEED=7;
const MAX_TILT=15,SPRING=70,DAMPING=9;
// How far (in pixels at the card's width of 400) each layer slides under the tilt, against the frame.
const ART_SLIDE=.018,BACK_SLIDE=-.03;
const FACING=1.1;
const clamp=(value:number)=>Math.max(-1,Math.min(1,value));

export interface CardFace {id:string;name:string;variant:string;rarity:Rarity;accent:string}
export const isHolographic=(rarity:Rarity)=>rarity==='epic'||rarity===RAREST;
export const cardStyle=(face:Pick<CardFace,'rarity'|'accent'>)=>`--rarity:${e(RARITY_INFO[face.rarity].color)};--accent:${e(face.accent)}`;
const pips=(rarity:Rarity)=>{const level=RARITIES.indexOf(rarity);return `<i class="sc-pips" aria-hidden="true">${RARITIES.map((_,index)=>`<b class="${index<=level?'on':''}"></b>`).join('')}</i>`;};

/** A card. `size`: `big` carries the layers a tilting card needs; `tag` goes in the footer (price, in use). The text scales with the card's width. */
export function skinCardHtml(face:CardFace,{size,locked=false,tag=''}:{size:'big'|'small';locked?:boolean;tag?:string}):string {
  const big=size==='big',info=RARITY_INFO[face.rarity];
  return `<article class="sc-card sc-${size}" data-rarity="${e(face.rarity)}" data-skin="${e(face.id)}"${locked?' data-locked':''} style="${cardStyle(face)}">
    <i class="sc-bg" aria-hidden="true"></i>
    <img class="sc-art" src="${e(cardArt(face.id))}" alt="" draggable="false" decoding="async">
    ${big?'<i class="sc-sprite" aria-hidden="true"></i><i class="sc-shade" aria-hidden="true"></i>':''}
    ${big&&isHolographic(face.rarity)?'<span class="sc-holo" aria-hidden="true"><i></i></span>':''}
    ${big&&face.rarity===RAREST?'<canvas class="sc-studs" aria-hidden="true"></canvas>':''}
    ${big?'<span class="sc-glare" aria-hidden="true"><i></i></span>':''}
    <header class="sc-top"><span>${e(info.name)}</span>${pips(face.rarity)}</header>
    <footer class="sc-foot"><h3>${e(face.name)}</h3><small>${e(face.variant)}</small><span class="sc-tag">${tag}</span></footer>
  </article>`;
}

export interface LiveCard {
  /** One whole turn of the character, by itself. */
  spin():void;
  destroy():void;
}
const cachedTurns=new Set<string>();
/** Asks for the turning sheet; answers when it can be shown. Only the card in focus asks: a sheet is what it costs to look at a card up close. */
function loadTurn(id:string):Promise<void> {
  const image=new Image();image.src=turnArt(id);
  return image.decode().then(()=>{cachedTurns.add(id);},()=>{});
}

/**
 * The card in focus: it tilts under the pointer, its layers slide against each other, and dragging turns the character round. Only one runs at a time,
 * and each frame moves layers by `transform` alone, so that nothing is painted again (the foil's rainbow, too, is a picture sliding under a still mask).
 */
export function liveCard(scene:HTMLElement,skin:string):LiveCard {
  const card=scene.querySelector<HTMLElement>('.sc-card')!;
  const artImage=card.querySelector<HTMLElement>('.sc-art')!,back=card.querySelector<HTMLElement>('.sc-bg')!,sprite=card.querySelector<HTMLElement>('.sc-sprite')!;
  const glare=card.querySelector<HTMLElement>('.sc-glare i'),holo=card.querySelector<HTMLElement>('.sc-holo i'),canvas=card.querySelector<HTMLCanvasElement>('.sc-studs');
  const still=matchMedia('(prefers-reduced-motion:reduce)').matches;
  let drawStuds=canvas?studs(canvas,skin):undefined;
  let box=scene.getBoundingClientRect(),width=box.width||400;
  let pointer:{x:number;y:number}|undefined,x=0,y=0,speedX=0,speedY=0,frame=0,last=performance.now(),destroyed=false,odd=false;
  // The turn, in frames (not wrapped). `drag` holds where the drag began while the pointer is down.
  let angle=0,spinSpeed=0,drag:{x:number;angle:number;at:number;lastX:number}|undefined,lastMove=0,autoLeft=0,shown=0,sheetReady=false;
  const showFrame=(value:number)=>{
    const cell=((Math.round(value)%TURN_FRAMES)+TURN_FRAMES)%TURN_FRAMES;
    if(cell===shown)return;
    shown=cell;
    // The first cell is the card's own picture, sharper than the sheet's.
    const front=cell===0||!sheetReady;
    artImage.style.visibility=front?'':'hidden';sprite.style.visibility=front?'hidden':'visible';
    if(!front)sprite.style.backgroundPosition=`${(cell%TURN_COLUMNS)/(TURN_COLUMNS-1)*100}% ${Math.floor(cell/TURN_COLUMNS)/(TURN_ROWS-1)*100}%`;
  };
  let asked=false;
  const askSheet=()=>{
    if(asked)return;asked=true;
    void loadTurn(skin).then(()=>{if(destroyed)return;sprite.style.backgroundImage=`url("${turnArt(skin)}")`;sheetReady=true;shown=-1;showFrame(angle);});
  };
  const paint=(time:number)=>{
    card.style.transform=`rotateX(${(y*MAX_TILT).toFixed(2)}deg) rotateY(${(-x*MAX_TILT).toFixed(2)}deg)`;
    const slideX=x*width,slideY=y*width;
    const artMove=`translate3d(${(slideX*ART_SLIDE).toFixed(1)}px,${(slideY*ART_SLIDE).toFixed(1)}px,0)`;
    artImage.style.transform=artMove;sprite.style.transform=artMove;
    back.style.transform=`translate3d(${(slideX*BACK_SLIDE).toFixed(1)}px,${(slideY*BACK_SLIDE).toFixed(1)}px,0) scale(1.08)`;
    if(glare)glare.style.transform=`translate3d(${(50*x).toFixed(1)}%,${(50*y).toFixed(1)}%,0)`;
    if(holo)holo.style.transform=`translate3d(${(-28*x-10).toFixed(1)}%,${(-28*y-10).toFixed(1)}%,0)`;
    drawStuds?.(x*FACING,y*FACING,time);
  };
  const tick=(now:number)=>{
    frame=requestAnimationFrame(tick);
    const step=Math.min(.05,(now-last)/1000),time=now/1000;
    // Left alone it only sways, slowly: half the frames do.
    odd=!odd;
    if(!pointer&&!drag&&!autoLeft&&!spinSpeed&&odd&&Math.abs(speedX)+Math.abs(speedY)<.2&&angle===0)return;
    last=now;
    const targetX=drag?0:pointer?pointer.x:Math.sin(time*.7)*.3,targetY=drag?0:pointer?pointer.y:Math.cos(time*.53)*.24;
    speedX+=(SPRING*(targetX-x)-DAMPING*speedX)*step;speedY+=(SPRING*(targetY-y)-DAMPING*speedY)*step;
    x+=speedX*step;y+=speedY*step;
    if(autoLeft>0){const moved=Math.min(autoLeft,Math.max(1.5,autoLeft*4)*step*4);angle+=moved;autoLeft-=moved;if(autoLeft<.01){autoLeft=0;angle=Math.round(angle/TURN_FRAMES)*TURN_FRAMES;}}
    else if(!drag&&spinSpeed){angle+=spinSpeed*step;spinSpeed*=Math.exp(-THROW_DAMPING*step);if(Math.abs(spinSpeed)<1){spinSpeed=0;lastMove=now;}}
    else if(!drag&&angle!==0&&!pointer&&now-lastMove>RETURN_AFTER_MS){
      // Back to the front by the shorter way.
      const home=Math.round(angle/TURN_FRAMES)*TURN_FRAMES,gap=home-angle;
      angle+=gap*Math.min(1,RETURN_SPEED*step);if(Math.abs(gap)<.2)angle=0;
    }
    if(sheetReady||angle===0)showFrame(angle);
    paint(time);
  };
  const aim=(event:PointerEvent)=>{
    if(drag){
      angle=drag.angle+(drag.x-event.clientX)/DRAG_PER_FRAME;
      const now=performance.now(),elapsed=(now-drag.at)/1000;
      if(elapsed>.016){spinSpeed=(drag.lastX-event.clientX)/DRAG_PER_FRAME/elapsed;drag.at=now;drag.lastX=event.clientX;}
      lastMove=now;
      if(still)showFrame(angle);
      return;
    }
    pointer={x:clamp((event.clientX-box.left)/box.width*2-1),y:clamp((event.clientY-box.top)/box.height*2-1)};
  };
  const measure=()=>{box=scene.getBoundingClientRect();width=box.width||400;};
  const enter=(event:PointerEvent)=>{measure();askSheet();aim(event);};
  const down=(event:PointerEvent)=>{
    if(event.button!==0)return;
    measure();askSheet();spinSpeed=0;autoLeft=0;
    scene.setPointerCapture(event.pointerId);
    drag={x:event.clientX,angle,at:performance.now(),lastX:event.clientX};scene.classList.add('turning');
  };
  const up=()=>{
    if(!drag)return;
    if(performance.now()-drag.at>120)spinSpeed=0;
    drag=undefined;lastMove=performance.now();scene.classList.remove('turning');
  };
  const leave=()=>{pointer=undefined;lastMove=performance.now();};
  const resized=()=>{measure();if(canvas)drawStuds=studs(canvas,skin);paint(performance.now()/1000);};
  scene.addEventListener('pointerenter',enter);scene.addEventListener('pointermove',aim);scene.addEventListener('pointerdown',down);
  scene.addEventListener('pointerup',up);scene.addEventListener('pointercancel',up);scene.addEventListener('pointerleave',leave);
  addEventListener('resize',resized);
  sprite.style.visibility='hidden';
  paint(last/1000);
  if(!still)frame=requestAnimationFrame(tick);
  return {
    spin(){askSheet();if(!still&&!drag)autoLeft=TURN_FRAMES;},
    destroy(){
      destroyed=true;cancelAnimationFrame(frame);removeEventListener('resize',resized);
      scene.removeEventListener('pointerenter',enter);scene.removeEventListener('pointermove',aim);scene.removeEventListener('pointerdown',down);
      scene.removeEventListener('pointerup',up);scene.removeEventListener('pointercancel',up);scene.removeEventListener('pointerleave',leave);scene.classList.remove('turning');
      drawStuds=undefined;
    },
  };
}
