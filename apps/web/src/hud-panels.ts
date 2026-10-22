import {HUD_PANELS,type PanelId} from './game-ui';
import {uiIcon} from './ui-icons';
interface PanelState{x:number;y:number;collapsed:boolean;hidden:boolean;z:number}
type Layout=Record<PanelId,PanelState>;
const mode=()=>innerWidth<=760?'mobile':innerWidth<=1100?'compact':'desktop';
const known=(id:string):id is PanelId=>HUD_PANELS.some(p=>p.id===id);
export function createHudPanels(root:HTMLElement){
  let owner='guest',screenMode=mode(),layout:Layout,locked=false,drag:{id:PanelId;dx:number;dy:number;pointer:number;header:HTMLElement}|undefined;
  const elements=Object.fromEntries(HUD_PANELS.map(p=>[p.id,root.querySelector<HTMLElement>(`[data-panel="${p.id}"]`)!])) as Record<PanelId,HTMLElement>;
  const key=()=>`bar:nova-ui:hud:v1:${owner}:${screenMode}`;
  const width=(id:PanelId)=>screenMode==='mobile'?(id==='actions'||id==='chat'?innerWidth-20:(innerWidth-30)/2):Math.min(HUD_PANELS.find(p=>p.id===id)!.width,screenMode==='compact'?id==='actions'?300:240:Infinity,innerWidth-20);
  function defaults():Layout{
    const mobile=screenMode==='mobile',short=innerHeight<580,right=innerWidth-width('scene')-16,compactScene=screenMode==='compact'||innerHeight<700;
    const item=(x:number,y:number,collapsed=false):PanelState=>({x,y,collapsed,hidden:false,z:1});
    return mobile?{
      status:item(10,116,true),scene:item(innerWidth/2+5,116,true),friends:{...item(10,166,true),hidden:short},inventory:{...item(innerWidth/2+5,166,true),hidden:short},
      chat:item(10,short?166:216),actions:item(10,short?innerHeight-165:Math.max(255,innerHeight-221)),
    }:{status:item(16,82,short),scene:item(right,82,compactScene),friends:item(right,compactScene?140:Math.min(470,innerHeight-120),true),inventory:item(right,compactScene?198:Math.min(530,innerHeight-68),true),chat:item(16,Math.max(315,innerHeight-275)),actions:item(Math.max(width('chat')+30,(innerWidth-width('actions'))/2),innerHeight-235)};
  }
  function save(){try{localStorage.setItem(key(),JSON.stringify({locked,panels:layout}));}catch{/* Private mode or full storage: the current layout still works. */}}
  function load(){
    layout=defaults();locked=false;
    try{const saved=JSON.parse(localStorage.getItem(key())??'null');if(!saved||typeof saved!=='object')return;locked=saved.locked===true;
      for(const p of HUD_PANELS){const value=saved.panels?.[p.id];if(!value||typeof value!=='object')continue;
        if(Number.isFinite(value.x)&&Number.isFinite(value.y)&&typeof value.collapsed==='boolean'&&typeof value.hidden==='boolean')layout[p.id]={x:value.x,y:value.y,collapsed:value.collapsed,hidden:value.hidden,z:Math.max(1,Math.min(50,Number.isFinite(value.z)?value.z:1))};}
    }catch{/* Ignore malformed and older saved layouts. */}
  }
  function apply(){
    root.classList.toggle('hud-locked',locked);
    root.querySelector('[data-hud-lock]')!.setAttribute('aria-pressed',String(locked));
    root.querySelector('[data-hud-lock]')!.setAttribute('aria-label',locked?'Destravar painéis':'Travar painéis');
    root.querySelector('[data-hud-lock]')!.innerHTML=`${uiIcon(locked?'lock':'unlock')}<span class="tool-label">${locked?'Travado':'Livre'}</span>`;
    for(const p of HUD_PANELS){const state=layout[p.id],el=elements[p.id];el.style.width=`${width(p.id)}px`;el.classList.toggle('hidden',state.hidden);el.classList.toggle('is-collapsed',state.collapsed);
      state.x=Math.max(8,Math.min(innerWidth-width(p.id)-8,state.x));
      const h=el.offsetHeight||45,top=screenMode==='mobile'?110:76;
      state.y=Math.max(top,Math.min(Math.max(top,innerHeight-Math.min(h,innerHeight-top-12)-12),state.y));
      Object.assign(el.style,{left:`${state.x}px`,top:`${state.y}px`,zIndex:String(state.z)});
      el.style.maxHeight=`${Math.max(44,innerHeight-state.y-12)}px`;
      const button=el.querySelector<HTMLButtonElement>('.panel-heading button')!;button.setAttribute('aria-expanded',String(!state.collapsed));button.setAttribute('aria-label',p.id==='chat'?(state.collapsed?'Abrir chat':'Recolher chat'):`${state.collapsed?'Expandir':'Recolher'} ${p.title}`);
      el.querySelector('.hud-content')!.classList.toggle('hidden',state.collapsed);
      root.querySelector(`[data-hud-visible="${p.id}"]`)!.setAttribute('aria-pressed',String(!state.hidden));
    }
  }
  function patch(id:PanelId,value:Partial<PanelState>){Object.assign(layout[id],value);apply();save();}
  function focus(id:PanelId){const ordered=HUD_PANELS.map(p=>p.id).sort((a,b)=>layout[a].z-layout[b].z);ordered.filter(p=>p!==id).concat(id).forEach((p,i)=>layout[p].z=i+1);}
  function menu(open:boolean){root.querySelector('#panel-menu')!.classList.toggle('hidden',!open);root.querySelector('[data-hud-menu]')!.setAttribute('aria-expanded',String(open));}
  root.addEventListener('click',event=>{
    const button=(event.target as Element).closest<HTMLElement>('button');if(!button)return;
    if(button.hasAttribute('data-hud-lock')){locked=!locked;apply();save();}
    if(button.hasAttribute('data-hud-menu'))menu(root.querySelector('#panel-menu')!.classList.contains('hidden'));
    if(button.hasAttribute('data-hud-reset')){layout=defaults();locked=false;apply();save();menu(false);}
    const id=button.dataset.hudCollapse;if(id&&known(id))patch(id,{collapsed:!layout[id].collapsed});
    const visible=button.dataset.hudVisible;if(visible&&known(visible))patch(visible,{hidden:!layout[visible].hidden});
  });
  for(const p of HUD_PANELS){const el=elements[p.id],header=el.querySelector<HTMLElement>('.panel-heading')!;
    el.addEventListener('pointerdown',()=>{focus(p.id);for(const panel of HUD_PANELS)elements[panel.id].style.zIndex=String(layout[panel.id].z);});
    header.addEventListener('pointerdown',event=>{if(locked||event.button!==0||(event.target as Element).closest('button'))return;
      event.preventDefault();header.focus();header.setPointerCapture(event.pointerId);drag={id:p.id,dx:event.clientX-layout[p.id].x,dy:event.clientY-layout[p.id].y,pointer:event.pointerId,header};el.classList.add('dragging');
    });
    header.addEventListener('pointermove',event=>{if(!drag||drag.id!==p.id||event.pointerId!==drag.pointer)return;Object.assign(layout[p.id],{x:event.clientX-drag.dx,y:event.clientY-drag.dy});apply();});
    const end=()=>{if(drag?.id!==p.id)return;el.classList.remove('dragging');drag=undefined;save();};
    header.addEventListener('pointerup',end);header.addEventListener('pointercancel',end);header.addEventListener('lostpointercapture',end);
    header.addEventListener('keydown',event=>{if(event.target!==header)return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();event.stopPropagation();if(locked)return;const step=event.shiftKey?30:10;patch(p.id,{x:layout[p.id].x+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),y:layout[p.id].y+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)});}});
  }
  document.addEventListener('pointerdown',event=>{if(!(event.target as Element).closest('#panel-menu,[data-hud-menu]'))menu(false);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')menu(false);});
  window.addEventListener('resize',()=>{const next=mode();if(next!==screenMode){save();screenMode=next;load();}apply();});
  load();apply();
  void document.fonts.ready.then(apply);
  return {forUser(id:string){owner=id;load();apply();},open(id:PanelId){focus(id);patch(id,{hidden:false,collapsed:false});},collapse(id:PanelId,collapsed:boolean){patch(id,{collapsed});},isCollapsed(id:PanelId){return layout[id].collapsed;}};
}
