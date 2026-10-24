import {INTERACTABLES,canInteract,itemById,type PublicUser,type WorldState,type Wardrobe,type InventoryView} from '@bar/shared';
import {escape as e} from './api';
import {uiIcon} from './ui-icons';
export function createLiveHud(root:HTMLElement){
  let peopleKey='',inventoryKey='',sceneKey='';
  function update(world:WorldState|undefined,user:PublicUser|undefined,wardrobe:Wardrobe|undefined,blocked:Set<string>,inventory?:InventoryView){
    const self=world?.players[user?.id??''];
    root.querySelector('#hud-balance')!.textContent=wardrobe?wardrobe.balance.toLocaleString('pt-BR'):'…';
    const people=Object.values(world?.players??{}).filter(p=>p.id!==user?.id),npcs=Object.values(world?.npcs??{});
    const nextPeople=JSON.stringify([people.map(p=>[p.id,p.displayName,p.connected,p.animationState,blocked.has(p.id)]),npcs.map(p=>[p.id,p.displayName,p.animationState])]);
    if(nextPeople!==peopleKey){peopleKey=nextPeople;
      const states:Record<string,string>={idle:'De boa',walk:'Pelo bar',run:'Na correria',dance:'Na pista',drink:'Uma gelada',sit:'Sentado',bartend:'Atendendo',fallen:'No chão',deal:'Nas cartas',shuffle:'Nas cartas',kick:'Karatê'};
      root.querySelector('#hud-people')!.innerHTML=people.map(p=>`<div class="hud-person"><span class="avatar">${e(p.displayName[0])}</span><span><b>${e(p.displayName)}</b><small>${blocked.has(p.id)?'Chat bloqueado':p.connected?(p.voice?'Microfone ligado · ':'')+(states[p.animationState]??'No bar'):'Ausente'}</small></span><i class="live-dot ${p.connected?'':'offline'}"></i></div>`).join('')+npcs.map(p=>`<div class="hud-person"><span class="avatar npc-avatar">${e(p.displayName[0])}</span><span><b>${e(p.displayName)}</b><small>${states[p.animationState]??'Pelo bar'} · NPC</small></span></div>`).join('')||'<p class="empty-state">A galera aparece aqui quando chega perto.</p>';
    }
    const nextInventory=JSON.stringify(inventory?.stacks);
    if(nextInventory!==inventoryKey){inventoryKey=nextInventory;
      root.querySelector('#hud-inventory')!.innerHTML=inventory?.stacks.length?inventory.stacks.slice(0,6).map(stack=>{const item=itemById(stack.itemId);return item?`<button class="inventory-item" data-action="inventory-use" data-item="${e(item.id)}" title="Usar ${e(item.name)}"><i aria-hidden="true">${item.icon}</i><b>${stack.quantity}</b><span>${e(item.name)}</span></button>`:'';}).join(''):'<p class="empty-state">Seu bolso está vazio.</p>';
    }
    if(self){const places=[{type:'counter',title:'Balcão',icon:'beer'},{type:'jukebox',title:'Jukebox',icon:'music'},{type:'television',title:'TV',icon:'eye'},{type:'blackjack',title:'Blackjack',icon:'cards'},{type:'seat',title:'Assentos',icon:'map'},{type:'toilet',title:'Banheiro',icon:'toilet'}];
      const rows=places.map(place=>{const distance=(p:{x:number;y?:number;z:number})=>Math.hypot(p.x-self.x,(p.y??0)-(self.y??0),p.z-self.z);
        const object=INTERACTABLES.filter(p=>p.type===place.type).sort((a,b)=>distance(a)-distance(b))[0];
        if(!object)return '';const ready=canInteract(object,self);return `<button class="scene-place ${ready?'in-reach':''}" data-action="scene-use" data-object="${e(object.id)}">${uiIcon(place.icon)}<span><b>${place.title}</b><small>${ready?'Ao seu alcance · interagir':`${Math.ceil(distance(object))} m · aproxime-se`}</small></span><span aria-hidden="true">↗</span></button>`;}).join('');
      if(rows!==sceneKey){sceneKey=rows;root.querySelector('#hud-scene')!.innerHTML=rows;}
    }
  }
  return {update,reset(){peopleKey='';inventoryKey='';sceneKey='';root.querySelector('#hud-balance')!.textContent='…';}};
}
