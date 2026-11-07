import {MOTO,VEHICLE_CATALOG,vehicleDefinition,vehicleName} from '@bar/shared';
import {plateHtml} from '../garage-panel';
import {badge,card,e,empty,n,stat,uiIcon,type SectionFactory,type WorldSnapshot} from './kit';

/** Every model in the playable vehicle catalogue is automatically available here. */
export const spawnVehiclesSection:SectionFactory=(root,ctx)=>{
  let snapshot:WorldSnapshot|null=ctx.world(),model:string=VEHICLE_CATALOG[0].model,color:string=VEHICLE_CATALOG[0].defaultColor,waiting='';
  let known=new Set((snapshot?.motos??[]).map(v=>v.id));
  root.innerHTML=`<div data-spawn-stats></div>${card('Spawn de veículos',`<p class="admin-note">Escolha qualquer modelo do catálogo. O veículo aparece na rua livre mais próxima, disponível para quem estiver no mapa. Para entregar um veículo permanente a um jogador, use a aba Registrar veículo.</p>
    <form data-spawn-form class="admin-inline-form"><div class="admin-fields"><label>Modelo para spawn<select name="model" aria-label="Modelo para spawn">${VEHICLE_CATALOG.map(v=>`<option value="${v.model}">${e(v.name)} · ${v.seats} lugar(es)</option>`).join('')}</select></label>
    <label>Cor do spawn<input type="color" name="color" aria-label="Cor do spawn" value="${color}" ${VEHICLE_CATALOG[0].paintable?'':'disabled'}></label></div>
    <button type="submit" class="button primary" data-vehicle="spawn">${uiIcon('plus')}Spawnar veículo</button><p class="fine-print" data-spawn-limit></p></form>`,{icon:'car'})}<div data-spawn-list></div>`;
  const modelField=root.querySelector<HTMLSelectElement>('[name="model"]')!,colorField=root.querySelector<HTMLInputElement>('[name="color"]')!;
  function renderWorld():void {
    const s=snapshot;if(!s?.motos)return;
    const temporary=s.motos.filter(v=>!v.owner).length,full=temporary>=MOTO.LIMIT,me=s.players.find(p=>p.id===ctx.user()?.id);
    root.querySelector('[data-spawn-stats]')!.innerHTML=`<div class="admin-stats">${stat('Temporários',`${temporary}/${MOTO.LIMIT}`,'Criados pelo spawn')}${stat('De jogadores',n(s.motos.filter(v=>v.owner).length),'Veículos registrados no mapa')}</div>`;
    root.querySelector<HTMLButtonElement>('[data-vehicle="spawn"]')!.disabled=full;
    root.querySelector('[data-spawn-limit]')!.textContent=full?`Limite de ${MOTO.LIMIT} veículos temporários atingido. Remova algum antes de criar outro.`:'Todos os modelos disponíveis no jogo aparecem nesta lista.';
    root.querySelector('[data-spawn-list]')!.innerHTML=card(`Veículos no mapa (${s.motos.length})`,s.motos.length?`<div class="admin-scroll"><table class="admin-table"><thead><tr><th>Veículo</th><th>Proprietário</th><th>Situação</th><th>Distância</th><th>Velocidade</th><th></th></tr></thead><tbody>${s.motos.map(v=>`<tr><td>${v.plate?plateHtml(v.plate):e(v.id)}<br><small>${e(vehicleName(v.model??''))}</small></td><td>${v.owner?e(v.owner):'Temporário'}</td><td>${v.riderId?badge(`Com ${e(v.rider||v.riderId)}`,'cyan'):v.phase?badge('Em recuperação','gold'):badge('Estacionado','muted')}</td><td>${me?`${n(Math.hypot(v.x-me.x,v.z-me.z))} m`:'—'}</td><td>${n(Math.abs(v.speed)*3.6)} km/h</td><td><button type="button" class="mini-button" data-vehicle="despawn" data-id="${e(v.id)}">${uiIcon('trash')}Remover do mapa</button></td></tr>`).join('')}</tbody></table></div>`:empty('Nenhum veículo no mapa.'),{icon:'mapPin',actions:s.motos.length?'<button type="button" class="mini-button" data-vehicle="despawn-all">Remover todos do mapa</button>':''});
  }
  const change=()=>{model=modelField.value;color=vehicleDefinition(model)!.defaultColor;colorField.value=color;colorField.disabled=!vehicleDefinition(model)!.paintable;};
  const input=()=>{color=colorField.value;};
  const submit=(event:SubmitEvent)=>{
    if(!(event.target as HTMLElement).matches('[data-spawn-form]'))return;event.preventDefault();event.stopPropagation();
    waiting=model;ctx.send('admin.moto.spawn',{model,...(vehicleDefinition(model)!.paintable?{color}:{})});ctx.message(`Procurando uma rua livre para ${vehicleName(model)}…`);
  };
  const click=(event:MouseEvent)=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('[data-vehicle]');if(!button||button.dataset.vehicle==='spawn')return;
    ctx.send('admin.moto.despawn',button.dataset.vehicle==='despawn'?{id:button.dataset.id}:{});ctx.message('Recolhimento solicitado.');
  };
  modelField.addEventListener('change',change);colorField.addEventListener('input',input);root.addEventListener('submit',submit);root.addEventListener('click',click);renderWorld();ctx.requestWorld();
  return {world(next){
    snapshot=next;const added=(next.motos??[]).find(v=>!known.has(v.id)&&(!waiting||v.model===waiting));known=new Set((next.motos??[]).map(v=>v.id));
    if(added&&waiting){waiting='';ctx.message(`${vehicleName(added.model??model)} spawnado em ${added.x}, ${added.z}.`);}renderWorld();
  },destroy(){modelField.removeEventListener('change',change);colorField.removeEventListener('input',input);root.removeEventListener('submit',submit);root.removeEventListener('click',click);}};
};
