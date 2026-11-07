import {VEHICLE_CATALOG,readVehicleParts,vehicleName,type AdminOverview,type AdminVehicleCommand,type AdminVehicleOperation,type AdminVehicles} from '@bar/shared';
import {plateHtml} from '../garage-panel';
import {badge,card,e,empty,n,reasonField,requestId,uiIcon,type SectionFactory} from './kit';

const LABELS:Record<AdminVehicleOperation,string>={repair:'Reparar todas as peças',refuel:'Encher o tanque',recall:'Recolher para a garagem',transfer:'Transferir proprietário',delete:'Excluir definitivamente',paint:'Alterar pintura',plate:'Personalizar placa'};
const PAGE=20;

/** Persistent ownership, including stored vehicles and offline players; independent of the live map list. */
export const ownedVehiclesSection:SectionFactory=(root,ctx,params)=>{
  let data:AdminVehicles|undefined,search='',model='',offset=0,disposed=false,generation=0,operation:AdminVehicleOperation='repair',all=false;
  let targetSearch='',targets:AdminOverview['users']=[],targetId='',reason='',color='#ccc9c2',plate='',pendingId='';
  const selected=new Set<string>();
  const onMap=(id:string)=>ctx.world()?.motos?.find(m=>m.vehicleId===id);
  const selection=()=>all?'todos os veículos permitidos':`${selected.size} veículo(s) selecionado(s)`;
  function actionHtml():string {
    if(!all&&!selected.size)return '<p class="admin-note">Selecione veículos para reparar, abastecer, recolher, transferir, pintar ou excluir.</p>';
    return `<form data-owned-form="action" class="admin-inline-form"><h4>Gerenciar ${e(selection())}</h4>
      <label>Ação nos veículos<select name="operation" aria-label="Ação nos veículos">${Object.entries(LABELS).filter(([key])=>(!all||['repair','refuel','recall'].includes(key))&&(key!=='plate'||selected.size===1)).map(([key,label])=>`<option value="${key}" ${key===operation?'selected':''}>${label}</option>`).join('')}</select></label>
      ${operation==='transfer'?`<label>Buscar destinatário<input name="targetSearch" aria-label="Buscar destinatário" value="${e(targetSearch)}" maxlength="100" placeholder="Nome, usuário ou e-mail"></label><button type="button" class="mini-button" data-owned="targets">Buscar jogador</button>
        <label>Novo proprietário<select name="targetId" aria-label="Novo proprietário" required><option value="">Selecione o jogador</option>${targets.map(p=>`<option value="${e(p.id)}" ${p.id===targetId?'selected':''}>${e(p.displayName)} (@${e(p.username)})</option>`).join('')}</select></label>
        <p class="fine-print">As chaves passam ao novo proprietário. Veículos que estiverem no mapa serão recolhidos para a garagem.</p>`:''}
      ${operation==='paint'?`<label>Cor do veículo<input type="color" name="color" aria-label="Cor do veículo" value="${e(color)}"></label><p class="fine-print">Modelos com pintura: ${e(VEHICLE_CATALOG.filter(v=>v.paintable).map(v=>v.name).join(', '))}.</p>`:''}
      ${operation==='plate'?`<label>Nova placa<input name="plate" aria-label="Nova placa" value="${e(plate)}" placeholder="ABC1D23" minlength="7" maxlength="7" pattern="[A-Za-z]{3}[0-9][A-Za-z][0-9]{2}" required style="text-transform:uppercase"></label><p class="fine-print">Use o formato Mercosul ABC1D23. A placa precisa ser única; o veículo e a chave serão atualizados.</p>`:''}
      ${operation==='delete'?'<p class="admin-note">Exclusão permanente: remove o veículo e sua chave, inclusive da garagem. Não devolve moedas.</p>':''}
      ${operation==='repair'?'<p class="fine-print">Deixa todas as peças em 100%, preservando a quilometragem. Para completar o combustível, use Encher o tanque.</p>':''}
      ${reasonField('Motivo da alteração nos veículos')}
      <div class="admin-confirm-buttons"><button class="button ${operation==='delete'?'danger':'primary'}" type="submit">${e(LABELS[operation])} · ${all?'todos':selected.size}</button><button class="mini-button" type="button" data-owned="cancel">Cancelar seleção</button></div></form>`;
  }
  function renderAction():void {
    const slot=root.querySelector('[data-owned-action]');if(!slot)return;slot.innerHTML=actionHtml();
    const area=slot.querySelector<HTMLTextAreaElement>('textarea[name="reason"]');if(area)area.value=reason;
  }
  function render():void {
    if(disposed)return;
    root.innerHTML=card('Veículos de todos os jogadores',`<form data-owned-form="search" class="admin-fields"><label>Buscar veículos<input name="search" aria-label="Buscar veículos" value="${e(search)}" maxlength="100" placeholder="Placa, nome ou usuário do proprietário"></label>
      <label>Modelo<select name="model" aria-label="Modelo do veículo"><option value="">Todos os modelos</option>${VEHICLE_CATALOG.map(v=>`<option value="${v.model}" ${v.model===model?'selected':''}>${e(v.name)}</option>`).join('')}</select></label><button type="submit" class="mini-button">Buscar</button></form>
      <div class="admin-player-actions"><button class="mini-button" data-owned="all-repair">Reparar todos os veículos</button><button class="mini-button" data-owned="all-refuel">Abastecer todos os veículos</button><button class="mini-button" data-owned="all-recall">Recolher todos para a garagem</button><button class="mini-button" data-owned="refresh">${uiIcon('refresh')}Atualizar lista</button></div>
      <p class="fine-print">Inclui veículos na garagem e de jogadores offline. Ações em todos abrangem o cadastro completo e respeitam a proteção das contas administrativas.</p>
      ${data?`<p>${n(data.total)} veículo(s) encontrado(s)</p>${data.vehicles.length?`<div class="admin-scroll"><table class="admin-table"><thead><tr><th><input type="checkbox" data-owned-check="page" aria-label="Selecionar veículos desta página" ${data.vehicles.filter(v=>v.canEdit).length>0&&data.vehicles.filter(v=>v.canEdit).every(v=>selected.has(v.id))?'checked':''}></th><th>Veículo</th><th>Proprietário</th><th>Estado</th><th>Peças</th><th>Tanque</th><th>Quilometragem</th><th></th></tr></thead><tbody>${data.vehicles.map(v=>{
        const parts=Object.values(readVehicleParts(v.model,v.parts)),condition=Math.min(...parts);
        return `<tr><td><input type="checkbox" data-owned-check="${e(v.id)}" aria-label="Selecionar ${e(v.plate)}" ${selected.has(v.id)?'checked':''} ${v.canEdit?'':'disabled'}></td><td>${plateHtml(v.plate)}<br><small>${e(v.name)}</small></td><td><button class="mini-button" data-owned-player="${e(v.ownerId)}">${e(v.ownerName)}</button><br><small>@${e(v.ownerUsername)}</small></td><td data-owned-map="${e(v.id)}">${onMap(v.id)?badge('No mapa','cyan'):badge('Fora desta sala','muted')}</td><td>${badge(`${Math.round(condition)}% mín.`,condition<30?'red':condition<100?'gold':'mint')}</td><td>${n(v.fuel??100,1)}%</td><td>${n(v.mileage/1000,1)} km</td><td><button class="mini-button" data-owned-manage="${e(v.id)}" ${v.canEdit?'':'disabled'}>${v.canEdit?'Gerenciar':'Conta protegida'}</button></td></tr>`;
      }).join('')}</tbody></table></div>`:empty('Nenhum veículo encontrado.')}
      <div class="admin-pagination"><button class="mini-button" data-owned="previous" ${offset===0?'disabled':''}>Anterior</button><small>${data.total?offset+1:0}–${Math.min(offset+data.vehicles.length,data.total)} de ${data.total}</small><button class="mini-button" data-owned="next" ${offset+PAGE>=data.total?'disabled':''}>Próxima</button></div>`:'<p class="admin-loading">Carregando veículos dos jogadores…</p>'}
      <div data-owned-action></div>`,{icon:'bike'});
    renderAction();
  }
  async function load():Promise<void>{
    const request=++generation;
    const query=new URLSearchParams({search,offset:String(offset),limit:String(PAGE)});if(model)query.set('model',model);if(params.player)query.set('ownerId',params.player);
    try{const result=await ctx.api<AdminVehicles>(`/admin/vehicles?${query}`);if(disposed||request!==generation)return;data=result;render();}
    catch(error){if(!disposed&&request===generation){root.innerHTML=empty('Não foi possível carregar os veículos.');ctx.message(error instanceof Error?error.message:'Erro ao carregar veículos.',true);}}
  }
  function resetSelection():void {selected.clear();all=false;pendingId='';reason='';targetId='';plate='';if(operation==='plate')operation='repair';}
  const click=(event:MouseEvent)=>{
    const el=event.target as HTMLElement,player=el.closest<HTMLElement>('[data-owned-player]');
    if(player){ctx.go('players',{player:player.dataset.ownedPlayer!});return;}
    const manage=el.closest<HTMLElement>('[data-owned-manage]');
    if(manage){resetSelection();selected.add(manage.dataset.ownedManage!);plate=data?.vehicles.find(v=>v.id===manage.dataset.ownedManage)?.plate??'';render();root.querySelector('[data-owned-action]')?.scrollIntoView({block:'nearest'});return;}
    const action=el.closest<HTMLElement>('[data-owned]')?.dataset.owned;if(!action)return;
    if(action.startsWith('all-')){resetSelection();all=true;operation=action.slice(4) as AdminVehicleOperation;render();return;}
    if(action==='cancel'){resetSelection();render();return;}
    if(action==='targets'){
      void ctx.api<AdminOverview>(`/admin/overview?${new URLSearchParams({search:targetSearch,limit:'25',filter:'all'})}`).then(result=>{if(!disposed){targets=result.users.filter(p=>p.verified&&p.canEditWallet);renderAction();}}).catch(error=>ctx.message(error instanceof Error?error.message:'Erro ao buscar jogador.',true));return;
    }
    if(action==='previous'||action==='next'){offset=Math.max(0,offset+(action==='next'?PAGE:-PAGE));resetSelection();}
    if(['previous','next','refresh'].includes(action))void load();
  };
  const change=(event:Event)=>{
    const field=event.target as HTMLInputElement;
    if(field.dataset.ownedCheck){
      all=false;pendingId='';
      const ids=field.dataset.ownedCheck==='page'?data?.vehicles.filter(v=>v.canEdit).map(v=>v.id)??[]:[field.dataset.ownedCheck];
      for(const id of ids)if(field.checked)selected.add(id);else selected.delete(id);
      if(selected.size!==1&&operation==='plate')operation='repair';
      if(selected.size===1)plate=data?.vehicles.find(v=>selected.has(v.id))?.plate??'';
      render();return;
    }
    if(field.name==='operation'){operation=field.value as AdminVehicleOperation;pendingId='';renderAction();}
    else if(field.name==='targetId'){targetId=field.value;pendingId='';}
  };
  const input=(event:Event)=>{const field=event.target as HTMLInputElement;if(field.name==='reason')reason=field.value;else if(field.name==='targetSearch')targetSearch=field.value;else if(field.name==='color')color=field.value;else if(field.name==='plate')plate=field.value.toUpperCase();pendingId='';};
  const submit=(event:SubmitEvent)=>{
    const form=event.target as HTMLFormElement;if(!form.dataset.ownedForm)return;event.preventDefault();event.stopPropagation();
    if(form.dataset.ownedForm==='search'){const fields=new FormData(form);search=String(fields.get('search')??'');model=String(fields.get('model')??'');offset=0;resetSelection();void load();return;}
    if(!all&&!selected.size)return;
    const command:AdminVehicleCommand={operation,...(all?{all:true}:{ids:[...selected]}),reason,requestId:pendingId||=requestId(),...(operation==='transfer'?{targetId}:{}),...(operation==='paint'?{color}:{}),...(operation==='plate'?{plate}:{})};
    let result:{changed:number;skipped:number}|undefined;
    void ctx.run(async()=>{
      result=await ctx.api<{changed:number;skipped:number}>('/admin/vehicles',command);
      resetSelection();await load();ctx.requestWorld();
    },'Alteração nos veículos concluída.').then(ok=>{if(!disposed&&ok&&result)ctx.message(`${result.changed} veículo(s) atualizado(s).${result.skipped?` ${result.skipped} protegido(s) não foram alterados.`:''}`);});
  };
  root.addEventListener('click',click);root.addEventListener('change',change);root.addEventListener('input',input);root.addEventListener('submit',submit);
  render();void load();
  return {world(){for(const cell of root.querySelectorAll<HTMLElement>('[data-owned-map]'))cell.innerHTML=onMap(cell.dataset.ownedMap!)?badge('No mapa','cyan'):badge('Fora desta sala','muted');},
    destroy(){disposed=true;root.removeEventListener('click',click);root.removeEventListener('change',change);root.removeEventListener('input',input);root.removeEventListener('submit',submit);}};
};
