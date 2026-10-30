import {NEEDS,drunkStage,type PlayerState} from '@bar/shared';
import {uiIcon as icon} from './ui-icons';
import type {Notice} from './notifications';

/** The meters in the corner (.status-hud). `low` meters are critical when low, the bladder when high. */
const METERS=[
  {id:'hp',label:'Vida',icon:'heart',low:true,alertAt:NEEDS.hp.alertAt},
  {id:'stamina',label:'Fôlego',icon:'bolt',low:true,alertAt:20},
  {id:'hunger',label:'Fome',icon:'food',low:true,alertAt:NEEDS.hunger.alertAt},
  {id:'thirst',label:'Sede',icon:'drop',low:true,alertAt:NEEDS.thirst.alertAt},
  {id:'bladder',label:'Bexiga',icon:'toilet',low:false,alertAt:NEEDS.bladder.alertAt},
] as const;
const STAGES=['Sóbrio','Alegrinho','Tonto','Bêbado','Apagando'];
/**
 * The only meter worth a notice: low life ends in fainting. The others turn critical in the corner meters.
 * It alerts once until life gets back to a comfortable level (no spam).
 */
const LOW_HP={title:'Você não está bem',text:'Sua vida está baixa. Se chegar a zero, você desmaia.'};

/** One row per meter: its icon, a thin bar and the value (the name is the row's tooltip and the meter's label). */
export function needsMarkup():string{
  const row=(id:string,label:string,name:string,value:string,now:number,hidden=false)=>`<div class="need" data-need="${id}" title="${label}"${hidden?' hidden':''}>${icon(name)}<div class="need-track" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${now}"><i></i></div><b>${value}</b></div>`;
  return `<div class="needs" id="hud-needs">${METERS.map(m=>row(m.id,m.label,m.icon,'100',100)).join('')}${row('drunk','Embriaguez','dizzy','Sóbrio',0,true)}</div>`;
}
export function faintMarkup():string{
  return `<div id="faint-overlay" class="faint-overlay hidden" role="alert" aria-live="assertive"><div><small id="faint-kicker">APAGOU</small><h2 id="faint-title"></h2><p id="faint-text"></p><b id="faint-timer"></b></div></div>`;
}

/** The corner meters, threshold alerts, the faint overlay and the screen effects of drunkenness. */
export function createNeedsHud(root:HTMLElement,notify:(notice:Notice)=>void,serverNow:()=>number){
  let warned=false,shownKey='',timer:ReturnType<typeof setInterval>|undefined,last:PlayerState|undefined;
  const overlay=root.querySelector<HTMLElement>('#faint-overlay')!;
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
      for(const meter of [...METERS,{id:'drunk',low:false,alertAt:NEEDS.drunk.stages[1]}]){
        const node=root.querySelector<HTMLElement>(`[data-need="${meter.id}"]`)!,value=values[meter.id]!,max=meter.id==='hp'?hpMax:100;
        const critical=meter.low?value<=meter.alertAt:value>=meter.alertAt;
        node.classList.toggle('critical',critical||(meter.id==='stamina'&&!!self.exhausted));
        node.querySelector('b')!.textContent=meter.id==='drunk'?STAGES[stage]!:String(value);
        node.querySelector<HTMLElement>('i')!.style.width=`${Math.min(100,value/max*100)}%`;
        const track=node.querySelector('.need-track')!;track.setAttribute('aria-valuenow',String(value));track.setAttribute('aria-valuemax',String(max));
      }
      root.querySelector<HTMLElement>('[data-need="drunk"]')!.hidden=values.drunk!<=0;
      for(let s=1;s<=4;s++)document.body.classList.toggle(`drunk-${s}`,stage===s);
    }
    alert(values.hp!<=NEEDS.hp.alertAt&&self.condition!=='fainted',values.hp!>NEEDS.hp.alertAt+15);
    countdown();
  }
  function reset():void{warned=false;shownKey='';last=undefined;countdown();for(let s=1;s<=4;s++)document.body.classList.remove(`drunk-${s}`);}
  return {update,reset};
}
