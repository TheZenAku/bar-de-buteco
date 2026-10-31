import {HUD_PANELS,type PanelId} from './game-ui';
import {uiIcon} from './ui-icons';
/**
 * Where a panel sits, from the screen's sides it is nearest, so it follows them when the window changes size (F11, full
 * screen, a dragged window): `x` from the left or right side, or its middle from the screen's middle; `y` from the top or
 * the bottom, or its middle from the screen's middle. Kept as placed: a smaller window only squeezes it on screen, and it
 * is back when the window grows again.
 */
interface PanelState{ax:'left'|'center'|'right';x:number;ay:'top'|'middle'|'bottom';y:number;collapsed:boolean;hidden:boolean;z:number}
type Layout=Record<PanelId,PanelState>;
type Placement=Pick<PanelState,'ax'|'x'|'ay'|'y'>;
/** The placement of a panel shown at `left`/`top`, `w`×`h` px: anchored to the nearest third across and down. */
function anchored(left:number,top:number,w:number,h:number):Placement{
  const middle=left+w/2,ax=middle<innerWidth/3?'left':middle>innerWidth*2/3?'right':'center';
  const centre=top+h/2,ay=centre<innerHeight/3?'top':centre>innerHeight*2/3?'bottom':'middle';
  return {ax,x:ax==='left'?left:ax==='right'?innerWidth-left-w:middle-innerWidth/2,ay,y:ay==='top'?top:ay==='bottom'?innerHeight-top-h:centre-innerHeight/2};
}
const mode=()=>innerWidth<=760?'mobile':innerWidth<=1100?'compact':'desktop';
const known=(id:string):id is PanelId=>HUD_PANELS.some(p=>p.id===id);
export function createHudPanels(root:HTMLElement){
  let owner='guest',screenMode=mode(),layout:Layout,locked=false,drag:{id:PanelId;dx:number;dy:number;pointer:number;header:HTMLElement}|undefined;
  const elements=Object.fromEntries(HUD_PANELS.map(p=>[p.id,root.querySelector<HTMLElement>(`[data-panel="${p.id}"]`)!])) as Record<PanelId,HTMLElement>;
  // Contextual panels (the job shift) exist only while they have something to show; hiding one is still the player's choice.
  const available=new Set<PanelId>(HUD_PANELS.filter(p=>!('contextual' in p)).map(p=>p.id));
  // v4: the chat moved to the right side, halfway down, and the job panel under the logo (the minimap took the bottom-left
  // corner); layouts saved for an older arrangement start over, as with v2 (the hotbar) and v3 (anchored to the sides).
  const key=()=>`bar:nova-ui:hud:v4:${owner}:${screenMode}`;
  // Where each panel is drawn now (after squeezing onto the screen), and its height: drags and arrow keys start from it.
  const shown=Object.fromEntries(HUD_PANELS.map(p=>[p.id,{left:0,top:0,h:45}])) as Record<PanelId,{left:number;top:number;h:number}>;
  // Wider than a phone, the hotbar is as wide as its buttons (CSS max-content, capped clear of the minimap and its cores):
  // measured once it shows. On phones it spans the screen like the chat.
  const width=(id:PanelId)=>id==='actions'&&screenMode!=='mobile'&&elements.actions.offsetWidth?elements.actions.offsetWidth
    :screenMode==='mobile'?(id==='actions'||id==='chat'?innerWidth-20:(innerWidth-30)/2)
    :Math.min(HUD_PANELS.find(p=>p.id===id)!.width,screenMode==='compact'&&id!=='actions'?(id==='chat'?280:240):Infinity,id==='actions'?innerWidth-(screenMode==='desktop'?420:380):innerWidth-20);
  function defaults():Layout{
    const mobile=screenMode==='mobile',short=innerHeight<580;
    const item=(ax:PanelState['ax'],x:number,ay:PanelState['ay'],y:number,collapsed=false):PanelState=>({ax,x,ay,y,collapsed,hidden:false,z:1});
    // The chat sits by the right side, halfway down; the hotbar 12 px over the bottom, centred, clear of the minimap and
    // the player's cores on its rim (bottom left, .status-hud). The job panel stays off the middle of the view,
    // where the toasts and event banners also appear: top left under the logo, or under the chat on phones (the chat
    // spans the top there).
    return mobile?{chat:item('left',10,'top',98),actions:item('left',10,'bottom',12),job:item('left',10,'top',short?250:356,true)}
      :{chat:item('right',16,'middle',0),actions:item('center',0,'bottom',12),job:item('left',16,'top',80)};
  }
  function save(){try{localStorage.setItem(key(),JSON.stringify({locked,panels:layout}));}catch{/* Private mode or full storage: the current layout still works. */}}
  function load(){
    layout=defaults();locked=false;
    try{const saved=JSON.parse(localStorage.getItem(key())??'null');if(!saved||typeof saved!=='object')return;locked=saved.locked===true;
      for(const p of HUD_PANELS){const value=saved.panels?.[p.id];if(!value||typeof value!=='object')continue;
        if(!Number.isFinite(value.x)||!Number.isFinite(value.y)||typeof value.collapsed!=='boolean'||typeof value.hidden!=='boolean')continue;
        if(!['left','center','right'].includes(value.ax)||!['top','middle','bottom'].includes(value.ay))continue;
        layout[p.id]={ax:value.ax,x:value.x,ay:value.ay,y:value.y,collapsed:value.collapsed,hidden:value.hidden,z:Math.max(1,Math.min(50,Number.isFinite(value.z)?value.z:1))};}
    }catch{/* Ignore malformed saved layouts. */}
  }
  function apply(){
    root.classList.toggle('hud-locked',locked);
    root.querySelector('[data-hud-lock]')!.setAttribute('aria-pressed',String(locked));
    root.querySelector('[data-hud-lock]')!.setAttribute('aria-label',locked?'Destravar painéis':'Travar painéis');
    root.querySelector('[data-hud-lock]')!.innerHTML=`${uiIcon(locked?'lock':'unlock')}<span>${locked?'Destravar painéis':'Travar painéis'}</span>`;
    for(const p of HUD_PANELS){const state=layout[p.id],el=elements[p.id],w=width(p.id);el.style.width=`${w}px`;el.classList.toggle('hidden',state.hidden||!available.has(p.id));el.classList.toggle('is-collapsed',state.collapsed);
      const left=Math.max(8,Math.min(innerWidth-w-8,state.ax==='left'?state.x:state.ax==='right'?innerWidth-w-state.x:innerWidth/2+state.x-w/2));
      const content=el.querySelector<HTMLElement>('.hud-content')!;content.classList.toggle('hidden',state.collapsed);
      // On wide screens it is lifted to fit its natural height (header and whole content), not the one an earlier max-height
      // squeezed it to. Narrower layouts keep it in place and let it scroll, rather than cover the middle of the scene.
      // The hotbar lays its heading beside the buttons, not above them, and never scrolls: it is always lifted to fit,
      // also when a narrower layout wraps it into two rows. It is measured free of the last max-height: squeezed (as it
      // is when first laid out hidden), each measure would only grow it by a pixel.
      if(p.id==='actions')el.style.maxHeight='';
      const heading=el.querySelector<HTMLElement>('.panel-heading')!.offsetHeight,body=state.collapsed?0:content.scrollHeight+1;
      const h=p.id==='actions'&&el.offsetHeight?el.offsetHeight:screenMode==='desktop'&&el.offsetHeight?heading+body:el.offsetHeight||45,top=screenMode==='mobile'?96:76;
      const y=Math.max(top,Math.min(Math.max(top,innerHeight-Math.min(h,innerHeight-top-12)-12),state.ay==='top'?state.y:state.ay==='bottom'?innerHeight-h-state.y:innerHeight/2+state.y-h/2));
      shown[p.id]={left,top:y,h};
      Object.assign(el.style,{left:`${left}px`,top:`${y}px`,zIndex:String(state.z)});
      el.style.maxHeight=`${Math.max(44,innerHeight-y-12)}px`;
      // The chat has no collapse button: its header hides it (data-hud-hide).
      const button=el.querySelector<HTMLButtonElement>('.panel-heading button[aria-expanded]');button?.setAttribute('aria-expanded',String(!state.collapsed));button?.setAttribute('aria-label',`${state.collapsed?'Expandir':'Recolher'} ${p.title}`);
      root.querySelectorAll(`[data-hud-visible="${p.id}"]`).forEach(toggle=>{toggle.setAttribute('aria-pressed',String(!state.hidden));toggle.classList.toggle('hidden',!available.has(p.id));});
    }
  }
  function patch(id:PanelId,value:Partial<PanelState>){Object.assign(layout[id],value);apply();save();}
  /** Moves a panel to `left`/`top` on screen, anchored to its nearest sides there. */
  function moveTo(id:PanelId,left:number,top:number){Object.assign(layout[id],anchored(left,top,width(id),shown[id].h));}
  function focus(id:PanelId){const ordered=HUD_PANELS.map(p=>p.id).sort((a,b)=>layout[a].z-layout[b].z);ordered.filter(p=>p!==id).concat(id).forEach((p,i)=>layout[p].z=i+1);}
  function menu(open:boolean){root.querySelector('#panel-menu')!.classList.toggle('hidden',!open);root.querySelector('[data-hud-menu]')!.setAttribute('aria-expanded',String(open));}
  root.addEventListener('click',event=>{
    const button=(event.target as Element).closest<HTMLElement>('button');if(!button)return;
    if(button.hasAttribute('data-hud-lock')){locked=!locked;apply();save();}
    if(button.hasAttribute('data-hud-menu'))menu(root.querySelector('#panel-menu')!.classList.contains('hidden'));
    if(button.hasAttribute('data-hud-reset')){layout=defaults();locked=false;apply();save();menu(false);}
    const id=button.dataset.hudCollapse;if(id&&known(id))patch(id,{collapsed:!layout[id].collapsed});
    const visible=button.dataset.hudVisible;if(visible&&known(visible)){if(layout[visible].hidden){focus(visible);elements[visible].style.maxHeight='';}patch(visible,{hidden:!layout[visible].hidden});}
    // Hidden from its own header: keyboard focus goes to the toolbar button that shows it again.
    const hide=button.dataset.hudHide;if(hide&&known(hide)){patch(hide,{hidden:true});root.querySelector<HTMLElement>(`.game-tools [data-hud-visible="${hide}"]`)?.focus();}
  });
  for(const p of HUD_PANELS){const el=elements[p.id],header=el.querySelector<HTMLElement>('.panel-heading')!;
    el.addEventListener('pointerdown',()=>{focus(p.id);for(const panel of HUD_PANELS)elements[panel.id].style.zIndex=String(layout[panel.id].z);});
    header.addEventListener('pointerdown',event=>{if(locked||event.button!==0||(event.target as Element).closest('button'))return;
      event.preventDefault();header.focus();header.setPointerCapture(event.pointerId);drag={id:p.id,dx:event.clientX-shown[p.id].left,dy:event.clientY-shown[p.id].top,pointer:event.pointerId,header};el.classList.add('dragging');
    });
    header.addEventListener('pointermove',event=>{if(!drag||drag.id!==p.id||event.pointerId!==drag.pointer)return;moveTo(p.id,event.clientX-drag.dx,event.clientY-drag.dy);apply();});
    // Dropped past an edge, it stays where it was shown, inside the screen.
    const end=()=>{if(drag?.id!==p.id)return;el.classList.remove('dragging');drag=undefined;moveTo(p.id,shown[p.id].left,shown[p.id].top);apply();save();};
    header.addEventListener('pointerup',end);header.addEventListener('pointercancel',end);header.addEventListener('lostpointercapture',end);
    header.addEventListener('keydown',event=>{if(event.target!==header)return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();event.stopPropagation();if(locked)return;const step=event.shiftKey?30:10;moveTo(p.id,shown[p.id].left+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),shown[p.id].top+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0));apply();save();}});
  }
  document.addEventListener('pointerdown',event=>{if(!(event.target as Element).closest('#panel-menu,[data-hud-menu]'))menu(false);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')menu(false);});
  window.addEventListener('resize',()=>{const next=mode();if(next!==screenMode){save();screenMode=next;load();}apply();});
  load();apply();
  void document.fonts.ready.then(apply);
  return {forUser(id:string){owner=id;load();apply();},open(id:PanelId){focus(id);patch(id,{hidden:false,collapsed:false});},isHidden(id:PanelId){return layout[id].hidden;},
    // Appearing, the panel is measured at its natural height (not the one it was squeezed to while hidden) and lifted to fit.
    setAvailable(id:PanelId,on:boolean){if(available.has(id)===on)return;if(on){available.add(id);elements[id].style.maxHeight='';}else available.delete(id);apply();}};
}
