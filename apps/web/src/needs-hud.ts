import {NEEDS,drunkStage,type PlayerState} from '@bar/shared';
import {uiIcon as icon} from './ui-icons';
import type {Notice} from './notifications';

/** The meters of the status panel. `low` meters are critical when low, the bladder when high. */
const METERS=[
  {id:'hp',label:'Vida',icon:'heart',low:true,alertAt:NEEDS.hp.alertAt},
  {id:'stamina',label:'Fôlego',icon:'bolt',low:true,alertAt:20},
  {id:'hunger',label:'Fome',icon:'food',low:true,alertAt:NEEDS.hunger.alertAt},
  {id:'thirst',label:'Sede',icon:'drop',low:true,alertAt:NEEDS.thirst.alertAt},
  {id:'bladder',label:'Bexiga',icon:'toilet',low:false,alertAt:NEEDS.bladder.alertAt},
] as const;
const STAGES=['Sóbrio','Alegrinho','Tonto','Bêbado','Apagando'];
/** Alerts when a meter crosses its limit, once until it gets back to a comfortable level (no spam). */
const ALERTS:Record<string,{title:string;text:string}>={
  hp:{title:'Você não está bem',text:'Sua vida está baixa. Se chegar a zero, você desmaia.'},
  hunger:{title:'Barriga roncando',text:'Com fome o fôlego rende menos e a bebida sobe mais rápido.'},
  thirst:{title:'Garganta seca',text:'Hidrate-se. Sem água, a sede começa a tirar vida.'},
  bladder:{title:'Aperto chegando',text:'Procure o banheiro: perto do balcão e no andar de cima.'},
  bladderUrgent:{title:'Não dá mais pra segurar',text:'Corra pro banheiro! Com a bexiga cheia o fôlego cai.'},
  exhausted:{title:'Sem fôlego',text:'Ande um pouco: só dá pra correr de novo quando recuperar o ar.'},
};

export function needsMarkup():string{
  return `<div class="needs" id="hud-needs">${METERS.map(m=>`<div class="need" data-need="${m.id}"><span>${icon(m.icon)}${m.label}</span><b>100</b><div class="need-track" role="meter" aria-label="${m.label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i></i></div></div>`).join('')}<div class="need drunk-meter" data-need="drunk" hidden><span>${icon('dizzy')}Embriaguez</span><b>Sóbrio</b><div class="need-track" role="meter" aria-label="Embriaguez" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div></div></div>`;
}
export function faintMarkup():string{
  return `<div id="faint-overlay" class="faint-overlay hidden" role="alert" aria-live="assertive"><div><small id="faint-kicker">APAGOU</small><h2 id="faint-title"></h2><p id="faint-text"></p><b id="faint-timer"></b></div></div>`;
}

/** Status panel meters, threshold alerts, the faint overlay and the screen effects of drunkenness. */
export function createNeedsHud(root:HTMLElement,notify:(notice:Notice)=>void,serverNow:()=>number){
  let warned=new Set<string>(),shownKey='',timer:ReturnType<typeof setInterval>|undefined,last:PlayerState|undefined;
  const overlay=root.querySelector<HTMLElement>('#faint-overlay')!;
  function alert(key:string,on:boolean,clearOn:boolean):void{
    if(on&&!warned.has(key)){warned.add(key);notify({variant:'aviso',...ALERTS[key]!,id:`needs:${key}:${Date.now()}`,duration:5200});}
    else if(clearOn)warned.delete(key);
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
        node.querySelector('b')!.textContent=meter.id==='drunk'?STAGES[stage]!:meter.id==='hp'?`${value}/${max}`:String(value);
        node.querySelector<HTMLElement>('i')!.style.width=`${Math.min(100,value/max*100)}%`;
        node.querySelector('.need-track')!.setAttribute('aria-valuenow',String(value));
      }
      root.querySelector<HTMLElement>('[data-need="drunk"]')!.hidden=values.drunk!<=0;
      for(let s=1;s<=4;s++)document.body.classList.toggle(`drunk-${s}`,stage===s);
    }
    alert('hp',values.hp!<=NEEDS.hp.alertAt&&self.condition!=='fainted',values.hp!>NEEDS.hp.alertAt+15);
    alert('hunger',values.hunger!<=NEEDS.hunger.alertAt,values.hunger!>NEEDS.hunger.alertAt+15);
    alert('thirst',values.thirst!<=NEEDS.thirst.alertAt,values.thirst!>NEEDS.thirst.alertAt+15);
    alert('bladder',values.bladder!>=NEEDS.bladder.alertAt,values.bladder!<NEEDS.bladder.alertAt-20);
    alert('bladderUrgent',values.bladder!>=NEEDS.bladder.urgentAt,values.bladder!<NEEDS.bladder.alertAt-20);
    alert('exhausted',!!self.exhausted,!self.exhausted);
    countdown();
  }
  /** What the "Agora" card says when a need is in charge; undefined when nothing special. */
  function activity(self:PlayerState|undefined):string|undefined{
    if(!self)return;
    if(self.condition==='fainted')return 'Desacordado';
    if(self.condition==='stumbling')return 'Cambaleando';
    if(self.condition==='recovering')return 'Recuperando';
    if(self.interactionState?.startsWith('toilet-'))return 'No banheiro';
    if(self.exhausted&&['walk','run','idle'].includes(self.animationState))return 'Sem fôlego';
    if(drunkStage(self.drunk??0)>=2&&self.animationState==='walk')return 'Trançando as pernas';
  }
  function reset():void{warned=new Set();shownKey='';last=undefined;countdown();for(let s=1;s<=4;s++)document.body.classList.remove(`drunk-${s}`);}
  return {update,activity,reset};
}
