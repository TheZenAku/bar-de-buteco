import {DEATH,DEATH_BUTTONS,type DeathPlan,type DeathScreen} from '@bar/shared';
import type {DeathAudio} from './death-audio';
import './death.css';

/** The four buttons: each has its own colour, shape and number, so colour alone never tells them apart. */
const BUTTONS=[
  {name:'Triângulo',key:'1',colour:'#ff5a4f',icon:'<polygon points="50,14 90,84 10,84"/>'},
  {name:'Círculo',key:'2',colour:'#3fa7ff',icon:'<circle cx="50" cy="50" r="34"/>'},
  {name:'Quadrado',key:'3',colour:'#4be08a',icon:'<rect x="17" y="17" width="66" height="66" rx="4"/>'},
  {name:'Losango',key:'4',colour:'#ffc83d',icon:'<polygon points="50,10 90,50 50,90 10,50"/>'},
] as const;
/** Arrows and number keys, as the room numbers the buttons. */
const KEYS:Record<string,number>={Digit1:0,Digit2:1,Digit3:2,Digit4:3,Numpad1:0,Numpad2:1,Numpad3:2,Numpad4:3,ArrowUp:0,ArrowRight:1,ArrowDown:2,ArrowLeft:3};

export interface DeathUiOptions {
  send(type:string,payload:unknown):void;
  /** Server time (ms) now. */
  now():number;
  audio:DeathAudio;
  /** Low graphics level: a light vignette, no blur or desaturation of the picture. */
  lite():boolean;
  /** The dark and the buttons are up (the game must stop taking keys and clicks as movement). */
  active(on:boolean):void;
}

const calm=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const escapeHtml=(text:string)=>text.replace(/[&<>"']/g,letter=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[letter]!));

/**
 * What only the victim sees: a dark vignette during the scene, the black screen with a phrase, and the sequence game.
 * It draws what the room says and reports which button was pressed; the room decides if it was right.
 */
export function createDeathUi(host:HTMLElement,options:DeathUiOptions){
  const root=document.createElement('section');
  root.id='death';root.className='death';root.hidden=true;root.setAttribute('aria-live','polite');
  root.innerHTML=`<div class="death-vignette"></div><div class="death-red"></div>
    <div class="death-dark"><p class="death-phrase"></p></div>
    <div class="death-game" hidden>
      <div class="death-center"><p class="death-status">Repita a sequência</p>
        <div class="death-progress" aria-hidden="true"></div>
        <div class="death-timer" aria-hidden="true"><i></i></div>
        <p class="death-hint">Teclas 1–4 ou setas</p></div>
      ${BUTTONS.map((button,index)=>`<button type="button" class="death-button" data-button="${index}" aria-label="${button.name} (${button.key})" style="--c:${button.colour}"><svg viewBox="0 0 100 100" aria-hidden="true">${button.icon}</svg><b>${button.key}</b></button>`).join('')}
    </div>
    <p class="death-error" hidden></p>`;
  host.append(root);
  const phrase=root.querySelector<HTMLElement>('.death-phrase')!,game=root.querySelector<HTMLElement>('.death-game')!,errorText=root.querySelector<HTMLElement>('.death-error')!;
  const status=root.querySelector<HTMLElement>('.death-status')!,progress=root.querySelector<HTMLElement>('.death-progress')!,timerBar=root.querySelector<HTMLElement>('.death-timer i')!;
  const pad=[...root.querySelectorAll<HTMLButtonElement>('.death-button')];
  let on=false,inputFrom=0,until=0,length=0,done=0,playing=false,locked=true,frame=0,lastTick=0,beatRate=0,timers:ReturnType<typeof setTimeout>[]=[];

  const later=(ms:number,action:()=>void)=>{timers.push(setTimeout(action,Math.max(0,ms)));};
  const clearTimers=()=>{timers.forEach(clearTimeout);timers=[];};
  const light=(index:number,ms:number,sound:boolean)=>{
    const button=pad[index];if(!button)return;
    button.classList.add('lit');if(sound)options.audio.note(index);
    setTimeout(()=>button.classList.remove('lit'),ms);
  };
  const dots=()=>{progress.innerHTML=Array.from({length},(_,index)=>`<i class="${index<done?'on':''}"></i>`).join('');};
  const setActive=(value:boolean)=>{if(on===value)return;on=value;root.hidden=!value;options.active(value);if(!value){cancelAnimationFrame(frame);window.removeEventListener('keydown',keydown,true);}else window.addEventListener('keydown',keydown,true);};

  function press(index:number):void {
    if(!on||!playing||locked||options.now()<inputFrom||options.now()>=until)return;
    light(index,180,true);
    options.send('death.input',{button:index});
  }
  function keydown(event:KeyboardEvent):void {
    // Browser shortcuts (reload, zoom) and the way out (Esc) stay with the browser and the game's menu.
    if(!on||event.ctrlKey||event.metaKey||event.altKey||event.code==='Escape')return;
    // While dead, the keys belong to the game of the dead.
    event.stopImmediatePropagation();
    const index=KEYS[event.code];
    if(index===undefined||event.repeat){if(event.code!=='F11'&&event.code!=='F12')event.preventDefault();return;}
    event.preventDefault();press(index);
  }
  // Touch and mouse: pointer events, no double-tap zoom, no text selection (CSS: touch-action none).
  for(const button of pad){
    button.addEventListener('pointerdown',event=>{event.preventDefault();press(Number(button.dataset.button));});
    button.addEventListener('dblclick',event=>event.preventDefault());
    button.addEventListener('contextmenu',event=>event.preventDefault());
  }
  game.addEventListener('touchstart',event=>event.preventDefault(),{passive:false});

  /** One frame of the attempt's clock: the bar, a tick each second, a heartbeat that quickens as the time runs out. */
  function clock():void {
    if(!on||!playing)return;
    const now=options.now(),total=Math.max(1,until-inputFrom),left=Math.max(0,until-now),share=Math.min(1,Math.max(0,left/total));
    timerBar.style.transform=`scaleX(${now<inputFrom?1:share})`;
    root.style.setProperty('--hurry',String(1-share));
    if(now>=inputFrom){
      if(now-lastTick>=1000){lastTick=now;options.audio.tick();}
      const bpm=Math.round(64+(1-share)*84);if(Math.abs(bpm-beatRate)>=8){beatRate=bpm;options.audio.heartbeat(bpm);}
    }
    frame=requestAnimationFrame(clock);
  }

  function fadeIn(dark:boolean):void {root.classList.toggle('dark',dark);}

  return {
    get active(){return on;},
    /** The scene of this player's own death starts: the vignette closes in, slowly. */
    sceneStarted(_plan:DeathPlan):void {
      clearTimers();playing=false;
      root.classList.toggle('lite',options.lite());root.classList.toggle('still',calm());
      root.classList.remove('dark','playing','failed','closing');game.hidden=true;errorText.hidden=true;phrase.textContent='';
      setActive(true);root.classList.add('scene');
    },
    screen(message:DeathScreen):void {
      switch(message.phase){
        case 'blackout':{
          clearTimers();playing=false;
          if(!on){root.classList.toggle('lite',options.lite());root.classList.toggle('still',calm());setActive(true);}
          root.classList.add('scene');game.hidden=true;errorText.hidden=true;root.classList.remove('playing','failed','closing');
          phrase.textContent=message.phrase;fadeIn(true);
          options.audio.blackout();
          break;
        }
        case 'play':{
          clearTimers();if(!on){root.classList.toggle('lite',options.lite());root.classList.toggle('still',calm());setActive(true);}
          document.exitPointerLock?.();
          playing=true;locked=false;inputFrom=message.inputFrom;until=message.until;length=message.sequence.length;done=0;dots();
          fadeIn(true);phrase.textContent='';errorText.hidden=true;game.hidden=false;root.classList.remove('failed','closing');root.classList.add('playing');
          status.textContent='Memorize a sequência';
          const step=DEATH.showStepMs+150,now=options.now();
          message.sequence.forEach((button,index)=>{
            // A step already over (the screen came back in the middle) is not shown again; one in progress shows what is left of it.
            const at=message.showStartedAt+index*step-now,left=at+DEATH.showStepMs;
            if(left<=0)return;
            later(at,()=>{light(button,Math.min(DEATH.showStepMs,left),at>=0);});
          });
          later(message.inputFrom-now,()=>{status.textContent='Repita a sequência';});
          lastTick=0;beatRate=0;cancelAnimationFrame(frame);frame=requestAnimationFrame(clock);
          break;
        }
        case 'press':done=message.progress;length=message.length;dots();break;
        case 'error':{
          clearTimers();playing=false;locked=true;options.audio.error();options.audio.stopBeat();
          errorText.textContent=message.phrase;errorText.hidden=false;game.hidden=true;root.classList.add('failed');root.classList.remove('playing');
          // The red shake restarts for each mistake.
          errorText.style.animation='none';void errorText.offsetWidth;errorText.style.animation='';
          break;
        }
        case 'won':{
          clearTimers();playing=false;locked=true;options.audio.success();game.hidden=true;errorText.hidden=true;
          root.classList.remove('playing','failed');root.classList.add('closing');root.classList.remove('dark');
          later(700,()=>{root.classList.remove('scene','closing');setActive(false);});
          break;
        }
        case 'end':this.reset();break;
      }
    },
    /** Anything left of a death is cleared (it ended, or the room was left). */
    reset():void {
      clearTimers();playing=false;locked=true;options.audio.stopAll();
      root.classList.remove('dark','playing','failed','closing','scene');game.hidden=true;errorText.hidden=true;phrase.textContent='';
      setActive(false);
    },
    destroy():void {this.reset();root.remove();},
    /** For tests: what the buttons and the phrase say right now. */
    snapshot(){return {active:on,playing,dark:root.classList.contains('dark'),phrase:phrase.textContent??'',error:errorText.hidden?'':escapeHtml(errorText.textContent??''),buttons:pad.length,lit:pad.map(button=>button.classList.contains('lit')),min:Math.min(...pad.map(button=>button.getBoundingClientRect().width)),count:DEATH_BUTTONS};},
  };
}
