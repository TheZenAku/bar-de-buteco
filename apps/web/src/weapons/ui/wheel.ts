import {CATEGORY_NAMES,PART_SLOTS,WEAPONS,arsenalStats,arsenalWeapon,type WeaponId} from '@bar/shared';
import {escape as e} from '../../api';
import {uiIcon} from '../../ui-icons';
import type {WeaponsController} from '../controller';
import type {MenuSounds} from '../../pause-menu/menu-sounds';
import {caliberText,modesText} from './stats-view';
import {partVisual,weaponPicture} from './art';
import './weapons-ui.css';

/**
 * The weapon wheel (docs/sistemas/armas.md#roda-de-armas): drawn over the running scene while the controller holds it open (Caps Lock, LB, the
 * touch Arma button). The controller owns the pointer and the choice (wheelPointer, wheelChoice); this only draws them: a ring of sectors with
 * each owned weapon's picture, short name and rounds, the highlighted sector in the active magenta, and in the hub (beside the wheel on a
 * phone) the highlighted weapon's name, calibre, modes and fitted parts. A finger taps a sector; an unlocked mouse hovers and clicks one.
 * Nothing transitions or blurs: the scene shows through a radial scrim, and the DOM is written only when the choice moves.
 */
export interface WheelHost {
  sounds:MenuSounds;
  /** Opens the Arsenal (the touch layout's button: there is no U key on a phone). */
  arsenal():void;
  /** The wheel was used (the first-use hint goes away). */
  used():void;
}

const SVG_NS='http://www.w3.org/2000/svg';
/** The ring in the SVG's units (-100…100): outer and inner radius, the gap between sectors (degrees). */
const OUTER=98,INNER=46,GAP=1.4;
const RAD=Math.PI/180;
const point=(radius:number,degrees:number)=>`${(Math.cos(degrees*RAD)*radius).toFixed(2)} ${(Math.sin(degrees*RAD)*radius).toFixed(2)}`;
function sector(from:number,to:number):string {
  const large=to-from>180?1:0;
  return `M${point(OUTER,from)} A${OUTER} ${OUTER} 0 ${large} 1 ${point(OUTER,to)} L${point(INNER,to)} A${INNER} ${INNER} 0 ${large} 0 ${point(INNER,from)} Z`;
}

export class WeaponWheel {
  private readonly root:HTMLElement;
  private readonly dial:HTMLElement;
  private readonly ring:SVGSVGElement;
  private readonly info:HTMLElement;
  private readonly arrow:HTMLElement;
  private slots:WeaponId[]=[];
  private shown:WeaponId|''|undefined;
  private arrowAt='';
  /** The arsenal the slots were drawn from: a part fitted or an upgrade bought while the wheel is open redraws them. */
  private arsenalShown?:unknown;
  private frame=0;
  private readonly offs:Array<()=>void>=[];

  constructor(game:HTMLElement,private readonly weapons:WeaponsController,private readonly host:WheelHost) {
    this.root=document.createElement('div');
    this.root.className='wp-wheel';this.root.hidden=true;
    this.root.setAttribute('role','dialog');this.root.setAttribute('aria-label','Roda de armas');
    this.root.innerHTML=`<div class="wp-wheel-scrim" data-wheel="cancel"></div>
      <div class="wp-wheel-dial"><svg class="wp-wheel-ring" viewBox="-100 -100 200 200" aria-hidden="true"></svg><i class="wp-wheel-arrow" hidden></i><div class="wp-wheel-slots"></div>
        <button type="button" class="wp-wheel-hub" data-weapon="" aria-label="Guardar arma"><span class="wp-hub-icon">${uiIcon('hand')}</span></button></div>
      <div class="wp-wheel-info" aria-live="polite"></div>`;
    game.append(this.root);
    this.dial=this.root.querySelector('.wp-wheel-dial')!;
    this.ring=this.root.querySelector('svg')!;
    this.info=this.root.querySelector('.wp-wheel-info')!;
    this.arrow=this.root.querySelector('.wp-wheel-arrow')!;
    this.offs.push(weapons.on('wheel',open=>open?this.open():this.close()));
    this.offs.push(weapons.on('change',()=>{
      if(this.root.hidden||weapons.gun.arsenal===this.arsenalShown)return;
      this.slots=weapons.wheelSlots();this.fillSlots();this.shown=undefined;
    }));
    // A finger or an unlocked mouse: the sector under it is the choice; the click picks (a click, not pointerdown: the touch that follows
    // must not land on the scene once the wheel is gone).
    this.root.addEventListener('pointerover',event=>{
      const slot=(event.target as Element).closest<HTMLElement>('[data-weapon]');
      if(slot&&event.pointerType==='mouse'&&!document.pointerLockElement)weapons.wheelAim(slot.dataset.weapon as WeaponId|'');
    });
    this.root.addEventListener('pointerdown',event=>{
      const slot=(event.target as Element).closest<HTMLElement>('[data-weapon]');
      if(slot)weapons.wheelAim(slot.dataset.weapon as WeaponId|'');
    });
    this.root.addEventListener('click',event=>{
      const target=event.target as Element;
      event.preventDefault();event.stopPropagation();
      if(target.closest('[data-wheel="arsenal"]')){this.cancel();this.host.arsenal();return;}
      const slot=target.closest<HTMLElement>('[data-weapon]');
      if(slot){weapons.wheelAim(slot.dataset.weapon as WeaponId|'');weapons.wheel(false);return;}
      if(target.closest('[data-wheel="cancel"]'))this.cancel();
    });
  }

  get isOpen():boolean {return !this.root.hidden;}

  /** Closes keeping the weapon in hand (a tap beside the wheel). */
  private cancel():void {this.weapons.wheelAim(this.weapons.gun.want);this.weapons.wheel(false);}

  /** The slots' buttons for the weapons owned now, each with its picture as fitted (parts, upgrades). */
  private fillSlots():void {
    const weapons=this.weapons,arsenal=weapons.gun.arsenal,n=Math.max(1,this.slots.length),step=360/n,want=weapons.gun.want;
    this.arsenalShown=arsenal;
    this.root.querySelector('.wp-wheel-slots')!.innerHTML=this.slots.map((id,i)=>{
      const def=WEAPONS[id],stats=arsenalStats(arsenal,id),cap=stats?.mag??def.mag,mag=Math.min(cap,weapons.gun.magOf(id)??cap);
      const at=(-90+i*step)*RAD,item=arsenalWeapon(arsenal,id);
      return `<button type="button" class="wp-slot" data-weapon="${id}" data-i="${i}" style="--x:${Math.cos(at).toFixed(4)};--y:${Math.sin(at).toFixed(4)}"${id===want?' data-hand="on"':''} data-ammo="${mag===0?'empty':mag<=Math.max(1,Math.floor(cap/4))?'low':'ok'}" aria-label="${e(def.name)}">
        <span class="wp-slot-key">${i<10?(i+1)%10:''}</span>${weaponPicture(id,item?.parts,item?.upgrades)}
        <span class="wp-slot-foot"><b>${e(def.short)}</b><i class="wp-slot-ammo" style="--left:${(cap?mag/cap:0).toFixed(3)}" title="${mag} de ${cap} no carregador"></i></span></button>`;
    }).join('');
  }

  private open():void {
    const weapons=this.weapons;
    this.slots=weapons.wheelSlots();
    const n=Math.max(1,this.slots.length),step=360/n,touch=weapons.device==='touch';
    this.root.dataset.device=weapons.device;
    this.root.style.setProperty('--n',String(n));
    // Sectors centred on each weapon's direction, the first at the top, clockwise (wheelChoice's order).
    this.ring.innerHTML=this.slots.map((_,i)=>{const at=-90+i*step;return `<path class="wp-sector" data-i="${i}" d="${sector(at-step/2+GAP/2,at+step/2-GAP/2)}"/>`;}).join('')
      +`<defs><linearGradient id="wp-wheel-line" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ea2fdc"/><stop offset=".5" stop-color="#0386f0"/><stop offset="1" stop-color="#17d4f4"/></linearGradient></defs><circle class="wp-wheel-edge" r="${OUTER+1.2}" stroke="url(#wp-wheel-line)"/><circle class="wp-hub-ring" r="${INNER-4}"/>`;
    this.ring.setAttribute('xmlns',SVG_NS);
    const want=weapons.gun.want;
    this.fillSlots();
    this.shown=undefined;this.arrowAt='';this.arrow.hidden=true;
    this.root.hidden=false;this.root.parentElement?.classList.add('wp-wheel-open');
    // A finger starts on the weapon in hand: tapping the Arma button again changes nothing.
    if(touch)weapons.wheelAim(want);
    this.host.sounds.open();this.host.used();
    this.render();
    cancelAnimationFrame(this.frame);
    const loop=()=>{if(this.root.hidden)return;this.render();this.frame=requestAnimationFrame(loop);};
    this.frame=requestAnimationFrame(loop);
  }

  private close():void {
    if(this.root.hidden)return;
    cancelAnimationFrame(this.frame);
    this.root.hidden=true;this.root.parentElement?.classList.remove('wp-wheel-open');
    // The controller picks right after this event (or not at all: a window opened, Esc): the sound follows what happened.
    const before=this.weapons.gun.want;
    queueMicrotask(()=>{if(this.weapons.gun.want!==before)this.host.sounds.select();else this.host.sounds.close();});
  }

  /** Each frame while open: the highlight and the info follow the controller's choice; the arrow its pointer. */
  private render():void {
    const weapons=this.weapons,choice=weapons.wheelChoice(),pointer=weapons.wheelPointer();
    const length=Math.hypot(pointer.x,pointer.y),arrow=length>.12?String(Math.round(Math.atan2(pointer.y,pointer.x)/RAD)):'';
    if(arrow!==this.arrowAt){
      this.arrowAt=arrow;this.arrow.hidden=!arrow;
      if(arrow)this.arrow.style.transform=`rotate(${arrow}deg)`;
    }
    if(choice===this.shown)return;
    const first=this.shown===undefined;
    this.shown=choice;
    const index=choice?this.slots.indexOf(choice):-1;
    for(const path of this.ring.querySelectorAll<SVGPathElement>('.wp-sector'))path.classList.toggle('on',Number(path.dataset.i)===index);
    for(const slot of this.root.querySelectorAll<HTMLElement>('.wp-slot'))slot.toggleAttribute('data-on',slot.dataset.weapon===choice);
    this.dial.classList.toggle('wp-hub-on',!choice);
    this.info.innerHTML=this.infoHtml(choice);
    if(!first)this.host.sounds.move(index+1);
  }

  private infoHtml(choice:WeaponId|''):string {
    const weapons=this.weapons,device=weapons.device;
    const arsenalKey=device==='gamepad'?'D-pad →':weapons.keyName('arsenal');
    const hint=device==='touch'?`<button type="button" class="wp-wheel-arsenal" data-wheel="arsenal">${uiIcon('wrench')}<span>Arsenal</span></button>`
      :arsenalKey?`<span class="wp-wheel-hint"><kbd>${arsenalKey}</kbd>Arsenal</span>`:'';
    if(!choice)return `<small class="wp-eyebrow">Mãos livres</small><strong>Guardar arma</strong><span class="wp-wheel-facts">${device==='touch'?'Toque no centro para guardar':'Solte no centro para guardar'}</span>${hint}`;
    const arsenal=weapons.gun.arsenal,def=WEAPONS[choice],stats=arsenalStats(arsenal,choice),fitted=arsenalWeapon(arsenal,choice)?.parts??{};
    const parts=PART_SLOTS.flatMap(slot=>{const id=fitted[slot];return id?[partVisual(id)]:[];});
    const cap=stats?.mag??def.mag,mag=Math.min(cap,weapons.gun.magOf(choice)??cap),reserve=arsenal?.infinite?'∞':String(Math.max(0,arsenal?.ammo[def.caliber]??0));
    return `<small class="wp-eyebrow">${e(CATEGORY_NAMES[def.category])}</small><strong>${e(def.name)}</strong>
      <span class="wp-wheel-facts"><span>${e(stats?caliberText(stats):def.caliber)}</span><span>${e(stats?modesText(stats):'')}</span><span class="wp-wheel-rounds"><b>${mag}</b>/ ${reserve}</span></span>
      ${parts.length?`<span class="wp-wheel-parts">${parts.join('')}</span>`:''}${hint}`;
  }

  destroy():void {cancelAnimationFrame(this.frame);for(const off of this.offs)off();this.root.remove();}
}
