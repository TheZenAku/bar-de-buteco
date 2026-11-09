import {FIRE_MODE_NAMES,WEAPONS,arsenalWeapon,type Reticle} from '@bar/shared';
import {weaponPicture} from './ui/art';
import type {GunView} from './local-gun';
import type {InputDevice} from './aim-assist';
import './weapons.css';

/**
 * The firearms' HUD (docs/sistemas/armas.md#hud), shown only with a weapon in hand: the crosshair opening with the spread (a ring for shotguns),
 * an optic's reticle while aiming, the hit marker (gold for a headshot, magenta and bigger for a knockout), the marker where the bullet would really
 * stop when the muzzle is blocked, the ammo chip, the scope's overlay (mask, reticle, drift, breath, zoom), where a shot that hit you came from, a
 * red flash, and a line when you knock someone out. Nothing here transitions or blurs (software compositing): the DOM is written only when a
 * value changes, a few transforms a frame at most.
 */
export interface HudFrame {
  visible:boolean;view:GunView;
  /** Vertical field of view (degrees) and the canvas's CSS size. */
  fov:number;width:number;height:number;
  /** Where the bullet would really stop, on screen, when the muzzle's way is cut. */
  blocked?:{x:number;y:number};
  /** A gamepad lock holds a target. */
  locked:boolean;
  /** A cheaper scope on the low graphics preset. */
  lite:boolean;
  now:number;
  /** The device in use: the empty magazine's prompt names its key. */
  device?:InputDevice;
  /** The reload key's name on the keyboard ('' when the player left it unbound). */
  reloadKey?:string;
}
export type HitKind='hit'|'head'|'ko';

const RAD=Math.PI/180;
const SVG_NS='http://www.w3.org/2000/svg';
/** The reticles drawn in the scope (a 200-unit box centred on 100,100). */
const SCOPE_RETICLES:Record<'chevron'|'mil',string>={
  chevron:'<path d="M100 100 L92 114 M100 100 L108 114" class="lit"/><path d="M100 118 V170 M30 100 H80 M120 100 H170" class="thin"/><circle cx="100" cy="100" r="1.6" class="fill"/>',
  mil:'<path d="M0 100 H88 M112 100 H200 M100 0 V88 M100 112 V200" class="thin"/>'+[-4,-3,-2,-1,1,2,3,4].map(i=>`<circle cx="${100+i*10}" cy="100" r="1.4" class="fill"/><circle cx="100" cy="${100+i*10}" r="1.4" class="fill"/>`).join('')+'<path d="M0 100 H20 M180 100 H200 M100 180 V200" class="thick"/>',
};

export class WeaponHud {
  private readonly root:HTMLElement;
  private readonly scope:HTMLElement;
  private readonly cross:HTMLElement;
  private readonly optic:HTMLElement;
  private readonly hitEl:HTMLElement;
  private readonly blockEl:HTMLElement;
  private readonly ammo:HTMLElement;
  private readonly hurt:HTMLElement;
  private readonly koEl:HTMLElement;
  private readonly arcs:HTMLElement[]=[];
  private readonly reticle:SVGSVGElement;
  private readonly scopeReticle:HTMLElement;
  private readonly breath:HTMLElement;
  private readonly zoomLabel:HTMLElement;
  /** What was last written, so a frame that changes nothing writes nothing. */
  private readonly written=new Map<string,string>();
  private hitTimer=0;private koTimer=0;private hurtUntil=0;private hurtAt=0;
  private arcAt=0;
  /** The arsenal item the ammo chip's picture was last checked for (a new arsenal message makes a new object). */
  private pictureOf?:unknown;private pictureWeapon='';

  constructor(game:HTMLElement) {
    this.root=document.createElement('div');
    this.root.className='wp-hud';this.root.hidden=true;this.root.setAttribute('aria-hidden','true');
    this.root.innerHTML=`
      <div class="wp-cross" data-kind="cross"><i class="wp-t wp-up"></i><i class="wp-t wp-down"></i><i class="wp-t wp-left"></i><i class="wp-t wp-right"></i><i class="wp-dot"></i><i class="wp-ring"></i><i class="wp-lock"></i></div>
      <div class="wp-optic" hidden></div>
      <div class="wp-hit" hidden><i></i><i></i><i></i><i></i></div>
      <div class="wp-block" hidden><i></i></div>
      <div class="wp-arcs">${'<i class="wp-arc" hidden></i>'.repeat(4)}</div>
      <div class="wp-hurt" hidden></div>
      <div class="wp-ko" hidden></div>
      <div class="wp-ammo" aria-live="off">
        <span class="wp-ammo-pic"></span>
        <span class="wp-name"></span>
        <span class="wp-count"><b class="wp-mag"></b><span class="wp-reserve"></span></span>
        <span class="wp-mode"></span>
        <i class="wp-reload" hidden></i>
        <span class="wp-empty" hidden></span>
      </div>`;
    game.append(this.root);
    // The scope goes under everything else of the HUD: first in #game (isolated), so the minimap, prompts and buttons stay above its mask.
    this.scope=document.createElement('div');
    this.scope.className='wp-scope';this.scope.hidden=true;this.scope.setAttribute('aria-hidden','true');
    this.scope.innerHTML=`<div class="wp-mask"></div><div class="wp-scope-reticle"><svg viewBox="0 0 200 200" aria-hidden="true"></svg></div>
      <div class="wp-scope-info"><span class="wp-zoom"></span><span class="wp-breath"><i></i></span></div>`;
    game.prepend(this.scope);
    const $=<T extends Element>(root:Element,selector:string)=>root.querySelector<T>(selector)! as T;
    this.cross=$(this.root,'.wp-cross');this.optic=$(this.root,'.wp-optic');this.hitEl=$(this.root,'.wp-hit');this.blockEl=$(this.root,'.wp-block');
    this.ammo=$(this.root,'.wp-ammo');this.hurt=$(this.root,'.wp-hurt');this.koEl=$(this.root,'.wp-ko');
    this.arcs.push(...this.root.querySelectorAll<HTMLElement>('.wp-arc'));
    this.reticle=$(this.scope,'svg');this.scopeReticle=$(this.scope,'.wp-scope-reticle');this.breath=$(this.scope,'.wp-breath');this.zoomLabel=$(this.scope,'.wp-zoom');
  }

  /** Writes `value` to `key` (an attribute, text or style) only when it changed. */
  private set(key:string,value:string,apply:()=>void):void {if(this.written.get(key)!==value){this.written.set(key,value);apply();}}
  private show(key:string,el:HTMLElement,shown:boolean):void {this.set(key,shown?'1':'0',()=>{el.hidden=!shown;});}

  update(frame:HudFrame):void {
    const {view}=frame,stats=view.stats,visible=frame.visible&&!!stats;
    this.show('root',this.root,visible);
    const scoped=visible&&view.scoped>.7;
    this.show('scope',this.scope,scoped);
    if(!visible){this.set('blocked','',()=>{this.blockEl.hidden=true;});return;}
    const halfHeight=frame.height/2,focal=halfHeight/Math.tan(frame.fov*RAD/2);
    // The crosshair: its gap is the cone's edge on screen; a shotgun shows its pellets' circle; an optic draws its own reticle while aimed.
    const shotgun=stats.pellets>1,opticReticle:Reticle=stats.reticle;
    const showOptic=!stats.scope&&opticReticle!=='iron'&&view.ads>.6;
    const crossKind=scoped||showOptic?'none':shotgun?'ring':'cross';
    this.set('kind',crossKind,()=>{this.cross.dataset.kind=crossKind;});
    const spread=view.spread||(stats.spread.hip+(stats.spread.ads-stats.spread.hip)*view.ads);
    const gap=Math.round(Math.min(halfHeight*.6,Math.max(3,Math.tan(spread)*focal))*2)/2;
    const ring=shotgun?Math.round(Math.min(halfHeight*.7,Math.tan(spread+stats.spread.pellet)*focal)):0;
    this.set('gap',`${gap}|${ring}`,()=>{this.cross.style.setProperty('--gap',`${gap}px`);this.cross.style.setProperty('--ring',`${ring}px`);});
    const state=view.lowered?'low':view.ready?'ready':'busy';
    this.set('state',state,()=>{this.cross.dataset.state=state;});
    this.set('locked',frame.locked?'1':'0',()=>{this.cross.dataset.locked=frame.locked?'on':'off';});
    this.show('optic',this.optic,showOptic);
    if(showOptic)this.set('reticle',opticReticle,()=>{this.optic.dataset.reticle=opticReticle;});
    // The blocked marker: where the bullet would really stop.
    const blocked=frame.blocked?`${Math.round(frame.blocked.x)},${Math.round(frame.blocked.y)}`:'';
    this.set('blocked',blocked,()=>{this.blockEl.hidden=!frame.blocked;if(frame.blocked)this.blockEl.style.transform=`translate(${Math.round(frame.blocked.x)}px,${Math.round(frame.blocked.y)}px)`;});
    this.renderAmmo(view,frame.device??'mouse',frame.reloadKey??'R');
    if(scoped)this.renderScope(view,frame,focal);
    // The hurt flash fades in steps (a few writes, no transition).
    if(this.hurtUntil){
      const left=(this.hurtUntil-frame.now)/(this.hurtUntil-this.hurtAt),opacity=left<=0?0:Math.round(left*10)/10;
      this.set('hurt',String(opacity),()=>{this.hurt.style.opacity=String(opacity);this.hurt.hidden=opacity<=0;});
      if(left<=0)this.hurtUntil=0;
    }
  }

  private renderAmmo(view:GunView,device:InputDevice,reloadKey:string):void {
    const stats=view.stats!,def=WEAPONS[stats.id];
    this.set('name',def.short,()=>{this.ammo.querySelector('.wp-name')!.textContent=def.short;});
    // The weapon as fitted (parts and upgrades): rewritten only when one of them changes, so an upgrade bought in the Arsenal shows at once.
    const item=arsenalWeapon(view.arsenal,stats.id),look=item?`${stats.id}|${JSON.stringify(item.parts)}|${JSON.stringify(item.upgrades)}`:stats.id;
    if(item!==this.pictureOf||stats.id!==this.pictureWeapon)this.set('picture',look,()=>{this.ammo.querySelector('.wp-ammo-pic')!.innerHTML=weaponPicture(stats.id,item?.parts,item?.upgrades);});
    this.pictureOf=item;this.pictureWeapon=stats.id;
    const mag=String(view.mag),reserve=view.reserve===Infinity?'∞':String(view.reserve);
    this.set('mag',mag,()=>{const el=this.ammo.querySelector<HTMLElement>('.wp-mag')!;el.textContent=mag;});
    this.set('low',view.mag===0?'empty':view.mag<=Math.max(1,Math.floor(stats.mag/4))?'low':'ok',()=>{this.ammo.dataset.ammo=view.mag===0?'empty':view.mag<=Math.max(1,Math.floor(stats.mag/4))?'low':'ok';});
    this.set('reserve',reserve,()=>{this.ammo.querySelector('.wp-reserve')!.textContent=`/ ${reserve}`;});
    const mode=view.mode?FIRE_MODE_NAMES[view.mode]:'';
    this.set('mode',mode,()=>{this.ammo.querySelector('.wp-mode')!.textContent=mode;});
    const reload=this.ammo.querySelector<HTMLElement>('.wp-reload')!;
    const progress=view.reloading===undefined?'':String(Math.round(view.reloading*40)/40);
    // Dry and not reloading: what to press (or that nothing is left), pulsing beside the chip.
    const empty=view.mag===0&&view.reloading===undefined?view.reserve<=0?'Sem munição':device==='touch'?'Recarregar':`${device==='gamepad'?'X':reloadKey}|Recarregar`:'';
    this.set('empty',empty,()=>{const el=this.ammo.querySelector<HTMLElement>('.wp-empty')!;el.hidden=!empty;const [key,text]=empty.includes('|')?empty.split('|'):['',empty];el.innerHTML=key?`<kbd>${key}</kbd>${text}`:text!;el.dataset.out=view.reserve<=0?'on':'off';});
    this.set('reload',progress,()=>{reload.hidden=view.reloading===undefined;if(view.reloading!==undefined)reload.style.setProperty('--left',String(1-view.reloading));});
  }

  private renderScope(view:GunView,frame:HudFrame,focal:number):void {
    const stats=view.stats!,kind=stats.reticle==='mil'?'mil':'chevron';
    this.set('scopeKind',`${kind}|${frame.lite}`,()=>{this.reticle.innerHTML=SCOPE_RETICLES[kind];this.scope.dataset.lite=frame.lite?'on':'off';this.reticle.setAttribute('xmlns',SVG_NS);});
    // The reticle drifts with the sway (the bullet goes where it points); the mask stays.
    const x=Math.round(Math.tan(view.sway.x)*focal*2)/2,y=Math.round(Math.tan(view.sway.y)*focal*2)/2;
    this.set('sway',`${x},${y}`,()=>{this.scopeReticle.style.transform=`translate(${x}px,${y}px)`;});
    const zoom=`${Math.round(view.zoom*10)/10}×`.replace('.',',');
    this.set('zoom',zoom,()=>{this.zoomLabel.textContent=zoom;});
    const meter=Math.round(view.breath.meter*20)/20,breathState=view.breath.shaking?'shaking':view.breath.holding?'holding':'free';
    this.set('breath',`${meter}|${breathState}`,()=>{this.breath.style.setProperty('--breath',String(meter));this.breath.dataset.state=breathState;});
  }

  /** The hit marker for a shot of ours that landed (gold on the head, magenta and bigger for a knockout). */
  hit(kind:HitKind):void {
    clearTimeout(this.hitTimer);
    this.hitEl.dataset.kind=kind;this.hitEl.hidden=false;
    // Restarting the pop: a reflow between the two class changes.
    this.hitEl.classList.remove('wp-pop');void this.hitEl.offsetWidth;this.hitEl.classList.add('wp-pop');
    this.hitTimer=window.setTimeout(()=>{this.hitEl.hidden=true;},kind==='ko'?420:220);
  }
  /** A shot hit the local player from `angle` (radians on screen, clockwise from straight ahead). */
  hurtFrom(angle:number,strength:number,now:number):void {
    const arc=this.arcs[this.arcAt++%this.arcs.length]!;
    arc.style.transform=`rotate(${(angle/RAD).toFixed(1)}deg)`;arc.hidden=false;
    arc.classList.remove('wp-fade');void arc.offsetWidth;arc.classList.add('wp-fade');
    window.setTimeout(()=>{arc.hidden=true;},1400);
    this.hurtAt=now;this.hurtUntil=now+350+250*Math.min(1,strength);
    this.hurt.style.opacity='1';this.hurt.hidden=false;this.written.set('hurt','1');
  }
  /** "Você derrubou <nome>". */
  knockout(text:string):void {
    clearTimeout(this.koTimer);
    this.koEl.textContent=text;this.koEl.hidden=false;
    this.koTimer=window.setTimeout(()=>{this.koEl.hidden=true;},1800);
  }
  destroy():void {clearTimeout(this.hitTimer);clearTimeout(this.koTimer);this.root.remove();this.scope.remove();}
}
