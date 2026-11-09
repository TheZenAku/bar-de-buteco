import {uiIcon} from '../ui-icons';

/** What the player is doing with their hands: each of these gets its own set of buttons. */
export type TouchKind='walk'|'bike'|'car'|'horse';
export interface TouchHost {
  /** The controls show only while the world takes input: no window, phone or minigame in front of it. */
  visible():boolean;
  /** On foot, on a bike, in a car or on a horse. */
  context():TouchKind;
  /** The stick: x right, y down (-1 to 1); the scene turns it into walking, or steering and throttle. */
  axis(x:number,y:number):void;
  /** Running on foot, or galloping (Shift). */
  sprint(on:boolean):void;
  /** The active skill's button, when the player has one on a key (it hides itself otherwise). */
  skillButton():HTMLButtonElement|null;
  /** The fist fight's guard is up: the punch buttons show (docs/sistemas/luta.md). */
  guard?():boolean;
  /** Firearms (docs/sistemas/armas.md#toque): a weapon is in hand (fire, aim, reload, weapon show), it is aimed (the aim button lit), through a scope (zoom and breath show). */
  armed?():boolean;aiming?():boolean;scoped?():boolean;
  /** A finger dragged on the fire button turns the view (BarScene.touchLook). */
  look?(dx:number,dy:number):void;
}

interface Tile {id:string;icon:string;label:string;code?:string;shift?:boolean;hold?:boolean;run?:()=>void;kinds:readonly TouchKind[]}
const ALL:readonly TouchKind[]=['walk','bike','car','horse'];
const WHEELED:readonly TouchKind[]=['bike','car'];
const keyOf=(code:string)=>code.startsWith('Key')?code.slice(3).toLowerCase():code==='Space'?' ':code.startsWith('Shift')?'Shift':code;

/** Everything the "mais" sheet offers: the hotbar's buttons, and the switches a vehicle has (they press the same keys). */
const TILES:readonly Tile[]=[
  {id:'table',icon:'food',label:'Pedir na mesa',code:'KeyP',kinds:['walk']},
  {id:'dance',icon:'music',label:'Dançar',code:'KeyG',kinds:['walk']},
  {id:'wave',icon:'hand',label:'Acenar',code:'KeyV',kinds:['walk']},
  {id:'guard',icon:'shield',label:'Luta (guarda)',code:'KeyR',kinds:['walk']},
  {id:'smoke',icon:'smoke',label:'Fumar',code:'KeyF',kinds:['walk']},
  {id:'cigarette',icon:'flame',label:'Um cigarro',code:'KeyF',shift:true,kinds:['walk']},
  {id:'skins',icon:'shirt',label:'Coleção',code:'KeyC',kinds:['walk','horse']},
  {id:'jobs',icon:'briefcase',label:'Trabalhar',code:'KeyJ',kinds:['walk']},
  {id:'engine',icon:'bolt',label:'Motor',code:'KeyR',kinds:WHEELED},
  {id:'headlights',icon:'sun',label:'Farol',code:'KeyH',kinds:WHEELED},
  {id:'blink-left',icon:'chevronLeft',label:'Pisca esq.',code:'KeyZ',kinds:['bike']},
  {id:'hazard',icon:'alert',label:'Alerta',code:'KeyX',kinds:['bike']},
  {id:'blink-right',icon:'chevronRight',label:'Pisca dir.',code:'KeyC',kinds:['bike']},
  {id:'wipers',icon:'drop',label:'Limpador',code:'KeyN',kinds:['car']},
  {id:'hood',icon:'wrench',label:'Capô',code:'KeyO',kinds:['car']},
  {id:'trunk',icon:'package',label:'Porta-malas',code:'KeyU',kinds:['car']},
  {id:'door',icon:'door',label:'Porta',code:'KeyY',kinds:['car']},
  {id:'lock',icon:'lock',label:'Trancar',code:'KeyL',kinds:ALL},
  {id:'phone',icon:'smartphone',label:'Celular',code:'KeyK',kinds:ALL},
  {id:'bag',icon:'bag',label:'Mochila',code:'KeyI',kinds:ALL},
  {id:'camera',icon:'switchCamera',label:'Câmera',code:'KeyQ',kinds:ALL},
  {id:'mic',icon:'mic',label:'Microfone',code:'KeyM',kinds:ALL},
];

/** What the help window says about the controls on a touch screen (main.ts help). */
export const TOUCH_KEYS:ReadonlyArray<readonly [string,string]>=[
  ['Direcional','Segure e arraste, em qualquer ponto do canto esquerdo, para andar; na ponta, corre. Dirigindo: para cima acelera, para baixo freia e dá ré, e para os lados vira'],
  ['Arrastar','Um dedo na cena gira a câmera; dois dedos, em pinça, aproximam e afastam'],
  ['Tocar','Um toque rápido numa pessoa (ou em você) ou num veículo abre o menu dele'],
  ['Interagir','O botão grande: sentar, pedir, usar, montar e desmontar (o mesmo que E)'],
  ['Correr','Liga e desliga a corrida; no cavalo, o galope; na moto, empina'],
  ['Papo','Abre o chat com o teclado do celular'],
  ['Mais','Gestos, celular, mochila, câmera, microfone e, nos veículos, motor, farol, piscas, capô e portas'],
  ['Freio · Buzina','Aparecem quando você está numa moto ou num carro'],
  ['Soco · Forte','Aparecem com a guarda alta (Mais › Luta): soco leve em sequência e o soco forte'],
];
/** The stick: past this much of its radius it is held, and past this much it runs. */
const DEAD=.14,RUN=.9;
const press=(code:string,shift=false)=>{
  document.body.dispatchEvent(new KeyboardEvent('keydown',{code,key:keyOf(code),shiftKey:shift,bubbles:true,cancelable:true}));
  document.body.dispatchEvent(new KeyboardEvent('keyup',{code,key:keyOf(code),shiftKey:shift,bubbles:true,cancelable:true}));
};
const buzz=(ms=8)=>{try{navigator.vibrate?.(ms);}catch{/* No haptics here. */}};
/**
 * A finger that pressed a control is about to lift and click whatever is under it by then: a window the press opened would be
 * closed by the click on its backdrop. The next click, in the half second after a press, is swallowed.
 */
function swallowClick():void {
  const stop=(event:Event)=>{event.stopPropagation();event.preventDefault();};
  window.addEventListener('click',stop,{capture:true,once:true});
  setTimeout(()=>window.removeEventListener('click',stop,true),500);
}

/**
 * The on-screen controls: a stick on the left (walking, or steering and throttle in a vehicle), the big interact button
 * and a few more on the right, and a sheet with everything else. Buttons do what the keys do by pressing them, so the room,
 * the scene and every handler stay the same as on a keyboard. Camera drag and pinch are the scene's (BarScene), on the
 * canvas under these.
 */
export function createTouchControls(parent:HTMLElement,host:TouchHost):{sync():void;release():void} {
  // The chat rides above an on-screen keyboard: the visual viewport's top, for where a keyboard pushes the page (touch.css reads it).
  // A pinch on the view is the game's zoom, never the page's (Safari ignores user-scalable=no and sends gesture events instead).
  for(const name of ['gesturestart','gesturechange','gestureend'])document.addEventListener(name,event=>event.preventDefault(),{passive:false});
  // The screen stays on while someone plays with their thumbs, and is asked for again when the tab comes back.
  let wake:{release():Promise<void>}|null=null;
  const keepAwake=()=>{if(wake||document.hidden||!shown)return;void (navigator as Navigator&{wakeLock?:{request(type:'screen'):Promise<{release():Promise<void>;addEventListener(type:'release',listener:()=>void):void}>}}).wakeLock?.request('screen').then(lock=>{wake=lock;lock.addEventListener('release',()=>{wake=null;});}).catch(()=>{/* The browser may refuse (battery saver). */});};
  document.addEventListener('visibilitychange',keepAwake);
  const viewport=window.visualViewport;
  if(viewport){const follow=()=>document.documentElement.style.setProperty('--vv-top',`${viewport.offsetTop}px`);viewport.addEventListener('resize',follow);viewport.addEventListener('scroll',follow);}
  const root=document.createElement('div');
  root.className='tp tp-hidden';root.setAttribute('data-capture-input','');
  root.innerHTML=`
    <div class="tp-zone" data-tp-zone><div class="tp-stick tp-rest" data-tp-stick><i class="tp-knob" data-tp-knob></i></div></div>
    <div class="tp-cluster">
      <button type="button" class="tp-btn tp-main" data-tp="act" aria-label="Interagir">${uiIcon('sparkles')}<b>Interagir</b></button>
      <button type="button" class="tp-btn tp-run" data-tp="run" aria-label="Correr" aria-pressed="false">${uiIcon('bolt')}<b data-tp-run-label>Correr</b></button>
      <button type="button" class="tp-btn tp-chat" data-tp="chat" aria-label="Conversar">${uiIcon('chat')}<b>Papo</b></button>
      <button type="button" class="tp-btn tp-more" data-tp="more" aria-label="Mais ações" aria-expanded="false">${uiIcon('ellipsis')}<b>Mais</b></button>
      <button type="button" class="tp-btn tp-brake" data-tp="brake" aria-label="Freio de mão">${uiIcon('stop')}<b>Freio</b></button>
      <button type="button" class="tp-btn tp-horn" data-tp="horn" aria-label="Buzina">${uiIcon('volume')}<b>Buzina</b></button>
      <button type="button" class="tp-btn tp-punch" data-tp="punch" aria-label="Soco">${uiIcon('hand')}<b>Soco</b></button>
      <button type="button" class="tp-btn tp-heavy" data-tp="heavy" aria-label="Soco forte">${uiIcon('bolt')}<b>Forte</b></button>
      <button type="button" class="tp-btn tp-block" data-tp="block" aria-label="Defender">${uiIcon('shield')}<b>Defesa</b></button>
      <button type="button" class="tp-btn tp-fire" data-tp="fire" aria-label="Atirar">${uiIcon('crosshair')}<b>Atirar</b></button>
      <button type="button" class="tp-btn tp-aim" data-tp="aim" aria-label="Mirar" aria-pressed="false">${uiIcon('locate')}<b>Mirar</b></button>
      <button type="button" class="tp-btn tp-reload" data-tp="reload" aria-label="Recarregar">${uiIcon('reset')}<b>Recarga</b></button>
      <button type="button" class="tp-btn tp-weapon" data-tp="weapon" aria-label="Trocar de arma">${uiIcon('grid')}<b>Arma</b></button>
      <button type="button" class="tp-btn tp-zoomin" data-tp="zoom-in" aria-label="Aproximar">${uiIcon('plus')}<b>Zoom</b></button>
      <button type="button" class="tp-btn tp-zoomout" data-tp="zoom-out" aria-label="Afastar">${uiIcon('minus')}<b>Zoom</b></button>
      <button type="button" class="tp-btn tp-breath" data-tp="breath" aria-label="Segurar o fôlego">${uiIcon('timer')}<b>Fôlego</b></button>
    </div>
    <div class="tp-sheet hidden" data-tp-sheet role="menu" aria-label="Mais ações"></div>`;
  parent.append(root);
  const $=<T extends HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
  const zone=$('[data-tp-zone]'),stick=$('[data-tp-stick]'),knob=$('[data-tp-knob]'),sheet=$('[data-tp-sheet]'),more=$<HTMLButtonElement>('[data-tp="more"]'),run=$<HTMLButtonElement>('[data-tp="run"]');
  let kind:TouchKind|'' ='',shown=false,sprintLatched=false,sprinting=false;

  // ---- The stick: it appears under the thumb anywhere in the lower left, and goes back to its rest place when let go.
  let pointer=-1,cx=0,cy=0,radius=60;
  const setStick=(x:number,y:number)=>{
    const length=Math.hypot(x,y),scale=length>1?1/length:1,vx=x*scale,vy=y*scale,mag=Math.min(1,length);
    knob.style.transform=`translate(${vx*radius}px,${vy*radius}px)`;
    if(mag<DEAD){host.axis(0,0);setSprint(false);return;}
    // Out of the dead zone the push counts from its edge, so the first inch is not lost.
    const eased=(mag-DEAD)/(1-DEAD);
    host.axis(vx/mag*eased,vy/mag*eased);
    setSprint(mag>=RUN);
  };
  const setSprint=(on:boolean)=>{
    const wanted=on||sprintLatched;
    if(wanted===sprinting)return;
    sprinting=wanted;host.sprint(wanted&&(kind==='walk'||kind==='horse'));
  };
  zone.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'&&event.button!==0)return;
    if(pointer!==-1)return;
    event.preventDefault();closeSheet();
    pointer=event.pointerId;zone.setPointerCapture(pointer);
    const box=zone.getBoundingClientRect(),size=stick.offsetWidth;radius=size/2*.62;
    // The base is centred on the touch, kept inside the zone so it never half-leaves the screen.
    cx=Math.max(box.left+size/2,Math.min(box.right-size/2,event.clientX));cy=Math.max(box.top+size/2,Math.min(box.bottom-size/2,event.clientY));
    stick.classList.remove('tp-rest');stick.classList.add('tp-live');
    stick.style.left=`${cx-box.left-size/2}px`;stick.style.top=`${cy-box.top-size/2}px`;
    buzz(6);setStick((event.clientX-cx)/radius,(event.clientY-cy)/radius);
  });
  zone.addEventListener('pointermove',event=>{if(event.pointerId===pointer)setStick((event.clientX-cx)/radius,(event.clientY-cy)/radius);});
  const letGo=(event:PointerEvent)=>{
    if(event.pointerId!==pointer)return;
    pointer=-1;stick.classList.add('tp-rest');stick.classList.remove('tp-live');stick.style.left='';stick.style.top='';
    knob.style.transform='';host.axis(0,0);setSprint(false);
  };
  zone.addEventListener('pointerup',letGo);zone.addEventListener('pointercancel',letGo);zone.addEventListener('lostpointercapture',letGo);

  // ---- Buttons: pressed on the finger going down (a click waits for it to lift), never taking the focus.
  const held=new Map<number,()=>void>();
  const bind=(button:HTMLElement,down:()=>void,up?:()=>void)=>{
    button.addEventListener('pointerdown',event=>{
      if(event.pointerType==='mouse'&&event.button!==0)return;
      event.preventDefault();event.stopPropagation();
      if(event.pointerType!=='mouse')swallowClick();
      button.classList.add('tp-down');buzz();
      try{button.setPointerCapture(event.pointerId);}catch{/* Capture is a nicety. */}
      if(up)held.set(event.pointerId,()=>{button.classList.remove('tp-down');up();});
      else setTimeout(()=>button.classList.remove('tp-down'),110);
      down();
    });
    const end=(event:PointerEvent)=>{const release=held.get(event.pointerId);if(!release)return;held.delete(event.pointerId);release();};
    button.addEventListener('pointerup',end);button.addEventListener('pointercancel',end);button.addEventListener('lostpointercapture',end);
    // Nothing a long press or a tap on a button should do to the page.
    button.addEventListener('contextmenu',event=>event.preventDefault());
    button.tabIndex=-1;
  };
  const holdKey=(code:string)=>({
    down:()=>document.body.dispatchEvent(new KeyboardEvent('keydown',{code,key:keyOf(code),bubbles:true,cancelable:true})),
    up:()=>document.body.dispatchEvent(new KeyboardEvent('keyup',{code,key:keyOf(code),bubbles:true,cancelable:true})),
  });
  bind($('[data-tp="act"]'),()=>{closeSheet();press('KeyE');});
  // The chat opens on the finger lifting: a phone shows its keyboard only for a focus that a lifted finger asked for.
  bind($('[data-tp="chat"]'),closeSheet,()=>press('KeyT'));
  bind(more,()=>sheet.classList.contains('hidden')?openSheet():closeSheet());
  {const brake=holdKey('Space');bind($('[data-tp="brake"]'),brake.down,brake.up);}
  {const horn=holdKey('KeyF');bind($('[data-tp="horn"]'),horn.down,horn.up);}
  // The punches press made-up codes the scene reads only with the guard up (BarScene keydown).
  bind($('[data-tp="punch"]'),()=>{closeSheet();press('FightLight');});
  bind($('[data-tp="heavy"]'),()=>{closeSheet();press('FightHeavy');});
  // The block is held: its button holds the made-up key the scene reads (BarScene keydown).
  {const block=holdKey('FightBlock');bind($('[data-tp="block"]'),()=>{closeSheet();block.down();},block.up);}
  // Firearms, only with a weapon in hand: fire held (a finger dragged on it also turns the view), aim a toggle, reload, the weapon (its wheel), and
  // through a scope the zoom and the held breath. They press made-up codes the weapons read first (WeaponsController.key).
  const aimButton=$<HTMLButtonElement>('[data-tp="aim"]');
  {
    const fire=holdKey('WeaponFire'),button=$('[data-tp="fire"]');
    let last:{id:number;x:number;y:number}|undefined;
    bind(button,()=>{closeSheet();fire.down();},()=>{last=undefined;fire.up();});
    button.addEventListener('pointerdown',event=>{last={id:event.pointerId,x:event.clientX,y:event.clientY};});
    button.addEventListener('pointermove',event=>{
      if(!last||event.pointerId!==last.id)return;
      host.look?.(event.clientX-last.x,event.clientY-last.y);last.x=event.clientX;last.y=event.clientY;
    });
  }
  bind(aimButton,()=>{closeSheet();press('WeaponAim');});
  bind($('[data-tp="reload"]'),()=>{closeSheet();press('WeaponReload');});
  bind($('[data-tp="weapon"]'),()=>{closeSheet();press('WeaponWheel');});
  bind($('[data-tp="zoom-in"]'),()=>press('WeaponZoomIn'));
  bind($('[data-tp="zoom-out"]'),()=>press('WeaponZoomOut'));
  {const breath=holdKey('WeaponBreath');bind($('[data-tp="breath"]'),breath.down,breath.up);}
  // The run button: a latch on foot (the stick's edge runs too), and Shift held to rear up on a bike or a horse.
  {
    const shift=holdKey('ShiftLeft');
    bind(run,()=>{
      if(kind==='walk'||kind==='horse'){sprintLatched=!sprintLatched;run.setAttribute('aria-pressed',String(sprintLatched));run.classList.toggle('tp-on',sprintLatched);setSprint(sprinting);}
      else if(kind==='bike')shift.down();
    },()=>{if(kind==='bike')shift.up();});
  }

  // ---- The sheet with everything else.
  const renderSheet=()=>{
    const tiles=TILES.filter(tile=>kind&&tile.kinds.includes(kind));
    const skill=kind==='walk'?host.skillButton():null;
    sheet.innerHTML=tiles.map(tile=>`<button type="button" role="menuitem" tabindex="-1" data-tile="${tile.id}">${uiIcon(tile.icon)}<span>${tile.label}</span></button>`).join('')
      +(skill&&!skill.classList.contains('hidden')?`<button type="button" role="menuitem" tabindex="-1" data-tile="skill">${uiIcon('crosshair')}<span>${(skill.textContent||'Habilidade').trim().slice(0,16)}</span></button>`:'');
    sheet.querySelectorAll<HTMLButtonElement>('button').forEach(button=>{
      const id=button.dataset.tile,tile=TILES.find(item=>item.id===id);
      bind(button,()=>{closeSheet();if(id==='skill')host.skillButton()?.click();else if(tile?.code)press(tile.code,tile.shift);});
    });
  };
  function openSheet(){renderSheet();sheet.classList.remove('hidden');more.setAttribute('aria-expanded','true');more.classList.add('tp-on');}
  function closeSheet(){sheet.classList.add('hidden');more.setAttribute('aria-expanded','false');more.classList.remove('tp-on');}
  // A touch anywhere else (the view) closes it.
  document.addEventListener('pointerdown',event=>{if(!sheet.classList.contains('hidden')&&!(event.target instanceof Node&&(sheet.contains(event.target)||more.contains(event.target))))closeSheet();},true);

  function release(){
    if(pointer!==-1){pointer=-1;stick.classList.add('tp-rest');stick.classList.remove('tp-live');stick.style.left='';stick.style.top='';knob.style.transform='';}
    host.axis(0,0);sprinting=false;host.sprint(false);
    for(const [id,end] of [...held]){held.delete(id);end();}
    closeSheet();
  }
  function sync(){
    const visible=host.visible();
    if(visible!==shown){shown=visible;root.classList.toggle('tp-hidden',!visible);if(!visible)release();else keepAwake();}
    if(!visible)return;
    const guard=host.guard?.()?'on':'off';
    const armed=host.armed?.()?'on':'off',scoped=host.scoped?.()?'on':'off',aiming=!!host.aiming?.();
    if(root.dataset.armed!==armed)root.dataset.armed=armed;
    if(root.dataset.scoped!==scoped)root.dataset.scoped=scoped;
    if(aimButton.classList.contains('tp-on')!==aiming){aimButton.classList.toggle('tp-on',aiming);aimButton.setAttribute('aria-pressed',String(aiming));}
    if(root.dataset.guard!==guard)root.dataset.guard=guard;
    const now=host.context();
    if(now!==kind){
      kind=now;root.dataset.kind=now;
      // A stuck latch or an open sheet belongs to what the player was doing before.
      sprintLatched=false;run.classList.remove('tp-on');run.setAttribute('aria-pressed','false');
      run.querySelector('[data-tp-run-label]')!.textContent=now==='walk'?'Correr':now==='horse'?'Galope':'Empinar';
      closeSheet();setSprint(false);
    }
  }
  return {sync,release};
}
