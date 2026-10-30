import {BarScene} from './engine/BarScene';

/**
 * Development only (loaded by main.ts under import.meta.env.DEV): F8 opens a panel that plays every bar animation on the
 * local player and on Magrão without the room (BarScene.debugBarAnimation), and shows what the module found in the map.
 */
const LABELS:Record<typeof BarScene.BAR_DEBUG_ACTIONS[number],string>={
  fumar:'Fumar','parar-fumar':'Parar de fumar',cigarro:'Cigarro inteiro',vomitar:'Vomitar',cair:'Cair','levantar-chao':'Levantar do chão',
  sentar:'Sentar (cadeira mais perto)',comer:'Comer','parar-comer':'Parar de comer',levantar:'Levantar',
  'limpar-mesa':'Limpar a mesa (mais perto)',urinar:'Urinar (mictório mais perto)',
  chopp:'Magrão · chopp','chopp-escuro':'Magrão · chopp escuro',longneck:'Magrão · long neck',parar:'Voltar ao servidor',
};

export function barAnimationsDebug(scene:()=>BarScene|undefined):void {
  const panel=document.createElement('aside');
  panel.id='bar-animations-debug';panel.hidden=true;panel.setAttribute('aria-label','Debug das animações do bar');
  panel.style.cssText='position:fixed;right:12px;top:72px;z-index:60;width:260px;max-height:calc(100vh - 96px);overflow:auto;padding:10px;border-radius:10px;'
    +'background:rgba(14,12,20,.92);color:#f1ead8;font:12px/1.35 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4)';
  const status=document.createElement('pre');status.style.cssText='white-space:pre-wrap;margin:8px 0 0;font:11px/1.3 ui-monospace,monospace;color:#c9bfa8';
  const message=document.createElement('p');message.style.cssText='margin:6px 0 0;color:#5fd86c;min-height:1.3em';
  panel.innerHTML='<b>Animações do bar · F8</b>';
  const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:8px';
  for(const action of BarScene.BAR_DEBUG_ACTIONS){
    const button=document.createElement('button');button.type='button';button.textContent=LABELS[action];button.dataset.barDebug=action;
    button.style.cssText='padding:5px 6px;border:1px solid #4a4256;border-radius:6px;background:#241f2e;color:inherit;font:inherit;text-align:left;cursor:pointer';
    // Clicking must not steal the keyboard from the game (WASD stays with the scene).
    button.addEventListener('mousedown',event=>event.preventDefault());
    button.addEventListener('click',()=>{message.textContent=scene()?.debugBarAnimation(action)??'O 3D ainda não carregou.';});
    grid.append(button);
  }
  panel.append(grid,message,status);document.body.append(panel);
  const refresh=()=>{
    if(panel.hidden)return;
    const map=scene()?.getMapStatus().barAnimations;
    status.textContent=map?`cadeiras ${map.cadeiras} · mesas ${map.mesas} · mictórios ${map.mictorios} · balcão ${map.balcao?'sim':'NÃO'}\n`
      +`arquivos: ${Object.entries(map.groups).map(([g,s])=>`${g} ${s}`).join(', ')}\n`
      +`partículas ${map.particles} · no mapa ${map.leftovers.length} · escondidos ${map.hidden.join(', ')||'—'}\n`
      +Object.entries(map.actors).map(([id,a])=>`${id.slice(0,10)}: ${a.clip} ${a.time.toFixed(1)}s`).join('\n'):'mapa carregando…';
  };
  setInterval(refresh,250);
  document.addEventListener('keydown',event=>{if(event.code==='F8'){event.preventDefault();panel.hidden=!panel.hidden;refresh();}});
}
