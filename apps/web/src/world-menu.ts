import {uiIcon} from './ui-icons';

export interface WorldMenuItem {id:string;icon:string;label:string;choose:()=>void}
let closeMenu:(()=>void)|undefined;
export const worldMenuOpen=():boolean=>!!closeMenu;
/** The small menu of a right click on the world (a player, a bike), at the pointer. It goes away with any other click, Esc or the choice itself. */
export function worldMenu(at:{x:number;y:number},items:readonly WorldMenuItem[]):void {
  closeMenu?.();
  if(!items.length)return;
  const menu=document.createElement('div');
  menu.className='world-menu';menu.setAttribute('role','menu');menu.setAttribute('data-capture-input','');
  menu.innerHTML=items.map(item=>`<button type="button" role="menuitem" data-world-menu="${item.id}">${uiIcon(item.icon)}<span>${item.label}</span></button>`).join('');
  const close=()=>{menu.remove();window.removeEventListener('pointerdown',away,true);window.removeEventListener('keydown',key,true);closeMenu=undefined;};
  const away=(event:Event)=>{if(!menu.contains(event.target as Node))close();};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape')close();};
  closeMenu=close;
  menu.querySelectorAll('button').forEach((button,index)=>button.addEventListener('click',()=>{close();items[index]!.choose();}));
  document.body.append(menu);
  // Never past the window's edge.
  const {width,height}=menu.getBoundingClientRect();
  menu.style.left=`${Math.max(8,Math.min(at.x,innerWidth-width-8))}px`;menu.style.top=`${Math.max(8,Math.min(at.y,innerHeight-height-8))}px`;
  window.addEventListener('pointerdown',away,true);window.addEventListener('keydown',key,true);
}
