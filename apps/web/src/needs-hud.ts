import {NEEDS,drunkStage,type PlayerState} from '@bar/shared';
import type {Notice} from './notifications';

/**
 * The cores around the minimap (.status-hud), in this order along its rim. `low` meters are critical when low, the bladder
 * when high.
 */
const METERS=[
  {id:'hp',label:'Vida',low:true,alertAt:NEEDS.hp.alertAt},
  {id:'stamina',label:'Fôlego',low:true,alertAt:20},
  {id:'hunger',label:'Fome',low:true,alertAt:NEEDS.hunger.alertAt},
  {id:'thirst',label:'Sede',low:true,alertAt:NEEDS.thirst.alertAt},
  {id:'bladder',label:'Bexiga',low:false,alertAt:NEEDS.bladder.alertAt},
] as const;
const DRUNK={id:'drunk',label:'Embriaguez',low:false,alertAt:NEEDS.drunk.stages[1]!};
const STAGES=['Sóbrio','Alegrinho','Tonto','Bêbado','Apagando'];
/**
 * Solid symbols for the cores, filled so that they can fill up and drain: Lucide's heart, zap, drumstick, droplet and beer
 * (lucide-static, ISC) and a toilet drawn in the same grid. `need-cut` lines are cut out in the core's colour; the beer's
 * handle stays a line.
 */
const GLYPHS:Record<string,string>={
  hp:'<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>',
  stamina:'<path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"/>',
  hunger:'<path d="M15.4 15.63a7.875 6 135 1 1 6.23-6.23 4.3 3.3 135 0 0-6.23 6.23"/><path d="m8.29 12.71-2.6 2.6a2.5 2.5 0 1 0-1.65 4.65A2.5 2.5 0 1 0 8.7 18.3l2.59-2.59"/>',
  thirst:'<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  bladder:'<path d="M5 2h6a1.5 1.5 0 0 1 1.5 1.5V11h-9V3.5A1.5 1.5 0 0 1 5 2z"/><path d="M2.5 12.5h19c0 3.6-2.4 6.2-5.5 6.5l1 2.5H7l1-2.5c-3.1-.3-5.5-2.9-5.5-6.5z"/>',
  drunk:'<path d="M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z"/><path d="M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/><path fill="none" d="M17 11h1a3 3 0 0 1 0 6h-1"/><path class="need-cut" d="M9 12v6M13 12v6"/>',
};
/** The drunk core's ring takes the logo's line (magenta, electric blue, cyan). */
const DRUNK_LINE='<defs><linearGradient id="need-drunk-line" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ea2fdc"/><stop offset=".55" stop-color="#0386f0"/><stop offset="1" stop-color="#17d4f4"/></linearGradient></defs>';
/**
 * The only meter worth a notice: low life ends in fainting. The others turn critical in the cores around the minimap.
 * It alerts once until life gets back to a comfortable level (no spam).
 */
const LOW_HP={title:'Você não está bem',text:'Sua vida está baixa. Se chegar a zero, você desmaia.'};

/**
 * A core per meter, as Red Dead Online's: the ring around it is the meter, and the symbol inside fills up and drains with
 * it (`--level`, 0–1). `slot` is its place along the minimap's rim (`--i`). The name and value show over it on hover,
 * and it is a meter with that name and value.
 */
function core(id:string,label:string,value:string,now:number,slot:number,hidden=false):string {
  const glyph=GLYPHS[id]!,svg=(extra='')=>`<svg class="need-glyph${extra}" viewBox="2 2 20 20" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>`;
  return `<div class="need" data-need="${id}" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${now}" aria-valuetext="${value}" style="--level:${now/100};--i:${slot}"${hidden?' hidden':''}>`
    +`<svg class="need-ring" viewBox="0 0 48 48" aria-hidden="true">${id==='drunk'?DRUNK_LINE:''}<circle class="need-ring-track" cx="24" cy="24" r="21"/><circle class="need-arc" cx="24" cy="24" r="21" pathLength="100"/><circle class="need-ticks" cx="24" cy="24" r="21" pathLength="100"/></svg>`
    +`<span class="need-core" aria-hidden="true">${svg()}${svg(' need-fill')}</span><span class="need-tip" aria-hidden="true">${label}<b>${value}</b></span></div>`;
}
/** Along the minimap's rim from the left; drunkenness last, so that nothing moves when it shows. */
export function needsMarkup():string{
  return `<div class="needs" id="hud-needs">${METERS.map((m,i)=>core(m.id,m.label,m.low?'100':'0',m.low?100:0,i)).join('')}${core(DRUNK.id,DRUNK.label,STAGES[0]!,0,METERS.length,true)}</div>`;
}
export function faintMarkup():string{
  return `<div id="faint-overlay" class="faint-overlay hidden" role="alert" aria-live="assertive"><div><small id="faint-kicker">APAGOU</small><h2 id="faint-title"></h2><p id="faint-text"></p><b id="faint-timer"></b></div></div>`;
}

/** The corner cores, threshold alerts, the faint overlay and the screen effects of drunkenness. */
export function createNeedsHud(root:HTMLElement,notify:(notice:Notice)=>void,serverNow:()=>number){
  let warned=false,shownKey='',timer:ReturnType<typeof setInterval>|undefined,last:PlayerState|undefined;
  const overlay=root.querySelector<HTMLElement>('#faint-overlay')!;
  // The last value drawn per core: a better one (eating, drinking, resting, the toilet) flashes it for a moment.
  const shown=new Map<string,number>(),flashes=new Map<string,ReturnType<typeof setTimeout>>();
  function flash(node:HTMLElement,id:string):void{
    clearTimeout(flashes.get(id));node.classList.remove('gain');void node.offsetWidth;node.classList.add('gain');
    flashes.set(id,setTimeout(()=>node.classList.remove('gain'),900));
  }
  function alert(on:boolean,clearOn:boolean):void{
    if(on&&!warned){warned=true;notify({variant:'aviso',...LOW_HP,id:`needs:hp:${Date.now()}`,duration:5200});}
    else if(clearOn)warned=false;
  }
  function countdown():void{
    const self=last;
    if(!self||self.condition!=='fainted'){overlay.classList.add('hidden');document.body.classList.remove('fainted');if(timer){clearInterval(timer);timer=undefined;}return;}
    overlay.classList.remove('hidden');document.body.classList.add('fainted');
    const alcohol=self.faintCause==='alcohol';
    root.querySelector('#faint-title')!.textContent=alcohol?'Você bebeu demais e apagou':'Você desmaiou';
    root.querySelector('#faint-text')!.textContent=alcohol?'A galera vai te levar pra tomar um ar na calçada. Quando acordar, vá com calma.':'Você caiu de fraqueza. Quando acordar, coma e beba alguma coisa.';
    const seconds=Math.max(0,Math.ceil(((self.conditionUntil??0)-serverNow())/1000));
    root.querySelector('#faint-timer')!.textContent=seconds?`Acordando em ${seconds}s`:'Acordando…';
    if(!timer)timer=setInterval(countdown,250);
  }
  function update(self:PlayerState|undefined):void{
    last=self;
    if(!self){countdown();return;}
    const values:Record<string,number>={hp:self.hp??100,stamina:self.stamina??100,hunger:self.hunger??100,thirst:self.thirst??100,bladder:self.bladder??0,drunk:self.drunk??0};
    const hpMax=Math.max(1,self.hpMax??100),stage=drunkStage(values.drunk!);
    const key=JSON.stringify([values,hpMax,self.exhausted,self.condition,self.faintCause]);
    if(key!==shownKey){shownKey=key;
      for(const meter of [...METERS,DRUNK]){
        const node=root.querySelector<HTMLElement>(`[data-need="${meter.id}"]`)!,value=values[meter.id]!,max=meter.id==='hp'?hpMax:100;
        const critical=meter.low?value<=meter.alertAt:value>=meter.alertAt,text=meter.id==='drunk'?STAGES[stage]!:String(value);
        node.classList.toggle('critical',critical||(meter.id==='stamina'&&!!self.exhausted));
        node.style.setProperty('--level',String(Math.max(0,Math.min(1,value/max))));
        node.querySelector('.need-tip b')!.textContent=text;
        node.setAttribute('aria-valuenow',String(value));node.setAttribute('aria-valuemax',String(max));node.setAttribute('aria-valuetext',text);
        const before=shown.get(meter.id);shown.set(meter.id,value);
        if(before!==undefined&&meter.id!=='drunk'&&(meter.low?value-before:before-value)>=2)flash(node,meter.id);
      }
      root.querySelector<HTMLElement>('[data-need="drunk"]')!.hidden=values.drunk!<=0;
      for(let s=1;s<=4;s++)document.body.classList.toggle(`drunk-${s}`,stage===s);
    }
    alert(values.hp!<=NEEDS.hp.alertAt&&self.condition!=='fainted',values.hp!>NEEDS.hp.alertAt+15);
    countdown();
  }
  function reset():void{warned=false;shownKey='';last=undefined;shown.clear();countdown();for(let s=1;s<=4;s++)document.body.classList.remove(`drunk-${s}`);}
  return {update,reset};
}
