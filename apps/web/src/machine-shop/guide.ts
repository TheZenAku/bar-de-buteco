import {RIBEIRO_ASSEMBLY,RIBEIRO_COMPUTER,RIBEIRO_SHELF,RIBEIRO_CUTTERS,RIBEIRO_DRILLS,RIBEIRO_MACHINING,RIBEIRO_PREP,RIBEIRO_SPOTS,type RibeiroSpotId,type RibeiroView} from '@bar/shared';

export interface RibeiroGuide {spot:typeof RIBEIRO_SPOTS[number];title:string;waiting?:boolean}

const at=(id:string)=>RIBEIRO_SPOTS.find(spot=>spot.id===id);

/** The one next physical task for this employee. Busy stations are skipped in authored order. */
export function ribeiroGuide(view:RibeiroView|undefined):RibeiroGuide {
  if(!view)return {spot:RIBEIRO_COMPUTER,title:'Ribeiro · abrir ordem de produção'};
  const busy=new Set<RibeiroSpotId>(view.busyStations??view.jobs.map(job=>job.stationId as RibeiroSpotId));
  const choose=(spots:readonly (typeof RIBEIRO_SPOTS[number])[],title:string):RibeiroGuide=>{
    const free=spots.find(spot=>!busy.has(spot.id));
    if(free)return {spot:free,title:`${title} · ${free.label}`};
    const soonest=[...view.jobs].filter(job=>spots.some(spot=>spot.id===job.stationId)).sort((a,b)=>a.endsAt-b.endsAt)[0],fallback=at(soonest?.stationId??'')??spots[0]!;
    return {spot:fallback,title:`${title} · aguarde a próxima máquina`,waiting:true};
  };
  const carry=view.me.carrying;
  if(carry?.stage==='raw')return choose(RIBEIRO_CUTTERS,'Próxima tarefa: corte');
  if(carry?.stage==='cut')return choose(RIBEIRO_MACHINING,'Próxima tarefa: usinagem');
  if(carry?.stage==='machined')return choose(RIBEIRO_DRILLS,'Próxima tarefa: furação');
  if(carry?.stage==='finished')return choose(RIBEIRO_ASSEMBLY,'Próxima tarefa: montagem');
  if(carry?.stage==='assembled')return {spot:RIBEIRO_SHELF,title:'Próxima tarefa: guardar a arma na prateleira do estoque'};
  const mine=view.orders.filter(order=>order.operatorId===view.me.userId&&!['completed','cancelled'].includes(order.status));
  const ready=mine.find(order=>order.status.endsWith('-ready'));
  if(ready){const spot=at(ready.stationId);if(spot)return {spot,title:`Próxima tarefa: retirar peça · ${spot.label}`};}
  const job=[...view.jobs].filter(item=>item.operatorId===view.me.userId).sort((a,b)=>a.endsAt-b.endsAt)[0];
  if(job){const spot=at(job.stationId);if(spot)return {spot,title:`Etapa em andamento · ${spot.label}`,waiting:true};}
  const teamReady=view.orders.find(order=>order.status.endsWith('-ready'));
  if(teamReady){const spot=at(teamReady.stationId);if(spot)return {spot,title:`Próxima tarefa da equipe: retirar peça · ${spot.label}`};}
  if(view.orders.some(order=>order.status==='queued'))return {spot:RIBEIRO_PREP,title:'Próxima tarefa: retirar material da OP'};
  return {spot:RIBEIRO_COMPUTER,title:'Ribeiro · abrir ordem de produção'};
}
