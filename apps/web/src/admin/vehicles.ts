import {MOTO} from '@bar/shared';
import {CAR_MODEL,vehicleName} from '@bar/shared';
import {plateHtml} from '../garage-panel';
import {badge,card,e,empty,n,stat,uiIcon,type SectionFactory,type WorldSnapshot} from './kit';

/** Veículos: the delivery bikes on the map. There are none until an administrator spawns one (admin.moto.spawn). */
export const vehiclesSection:SectionFactory=(root,ctx)=>{
  let snapshot:WorldSnapshot|null=ctx.world(),disposed=false,waiting=false,known=new Set((snapshot?.motos??[]).map(moto=>moto.id));
  function render():void {
    if(disposed)return;
    const s=snapshot;if(!s?.motos){root.innerHTML='<p class="admin-loading">Carregando o estado do mundo…</p>';return;}
    const me=s.players.find(p=>p.id===ctx.user()?.id),ridden=s.motos.filter(moto=>moto.riderId).length,full=s.motos.filter(moto=>!moto.owner).length>=MOTO.LIMIT;
    const far=(moto:{x:number;z:number})=>me?`${n(Math.hypot(moto.x-me.x,moto.z-me.z))} m`:'—';
    root.innerHTML=`<div class="admin-stats">
        ${stat('No mapa',`${s.motos.filter(moto=>!moto.owner).length}/${MOTO.LIMIT}`,`Spawnadas · mais ${s.motos.filter(moto=>moto.owner).length} de jogadores`)}
        ${stat('Em uso',n(ridden),'Com alguém pilotando')}
      </div>
      ${card('Spawnar moto',`<p class="admin-note">Ela aparece estacionada na rua livre mais perto de você, virada na mesma direção que você. Qualquer jogador perto dela pode subir com E.</p>
        <button type="button" class="mini-button" data-vehicle="spawn" ${full?'disabled':''}>${uiIcon('plus')}Spawnar moto</button>
        <button type="button" class="mini-button" data-vehicle="spawn-car" ${full?'disabled':''}>${uiIcon('plus')}Spawnar carro de 4 lugares</button>
        ${full?`<p class="fine-print">O mapa já tem o máximo de ${MOTO.LIMIT} motos. Despawne alguma para criar outra.</p>`:''}`,{icon:'bike'})}
      ${card(`Motos no mapa (${s.motos.length})`,s.motos.length?`<div class="admin-scroll"><table class="admin-table"><thead><tr><th>Moto</th><th>Situação</th><th>Posição</th><th class="num">Distância de você</th><th class="num">Velocidade</th><th></th></tr></thead><tbody>
        ${s.motos.map(moto=>`<tr><td>${moto.plate?plateHtml(moto.plate):e(moto.id)}${moto.owner?`<br><small>de ${e(moto.owner)}${moto.locked?' · trancada':' · destrancada'}</small>`:''}</td><td>${moto.riderId?badge(`Com ${e(moto.rider||moto.riderId.slice(0,8))}`,'cyan'):moto.phase==='down'?badge('Caída','red'):moto.phase==='lifting'?badge('Sendo levantada','gold'):moto.phase?badge('Desgovernada','red'):badge('Estacionada','muted')}</td><td>${moto.x}, ${moto.y}, ${moto.z}</td><td class="num">${far(moto)}</td><td class="num">${n(Math.abs(moto.speed)*3.6)} km/h</td>
          <td><button type="button" class="mini-button" data-vehicle="despawn" data-id="${e(moto.id)}" title="${moto.riderId?'Quem está pilotando desce na hora':'Tira a moto do mapa'}">${uiIcon('trash')}Despawnar</button></td></tr>`).join('')}</tbody></table></div>`:empty('Nenhuma moto no mapa.'),
        {icon:'mapPin',actions:s.motos.length>1?`<button type="button" class="mini-button" data-vehicle="despawn-all">${uiIcon('trash')}Despawnar todas</button>`:''})}
      <p class="fine-print">Atualizado às ${new Date(s.at).toLocaleTimeString('pt-BR')} (a cada 5 s). As motos ficam só nesta sala: quando o mundo reinicia, o mapa volta sem nenhuma. As motos de jogadores voltam para a garagem com o estado salvo. Tudo fica registrado no log.</p>`;
  }
  const click=(event:MouseEvent)=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('[data-vehicle]');if(!button)return;
    const {vehicle,id}=button.dataset;
    if(vehicle==='spawn'||vehicle==='spawn-car'){waiting=true;ctx.send('admin.moto.spawn',vehicle==='spawn-car'?{model:CAR_MODEL}:{});ctx.message('Procurando uma rua livre…');}
    else{ctx.send('admin.moto.despawn',vehicle==='despawn'?{id}:{});ctx.message(vehicle==='despawn'?'Moto despawnada.':'Motos despawnadas.');}
  };
  root.addEventListener('click',click);
  render();ctx.requestWorld();
  return {
    world(next){
      snapshot=next;
      const added=(next.motos??[]).find(moto=>!known.has(moto.id));
      known=new Set((next.motos??[]).map(moto=>moto.id));
      if(added&&waiting){waiting=false;ctx.message(`Moto spawnada em ${added.x}, ${added.z}.`);}
      render();
    },
    destroy(){disposed=true;root.removeEventListener('click',click);},
  };
};
