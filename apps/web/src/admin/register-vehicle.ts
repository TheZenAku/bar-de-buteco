import {VEHICLE_CATALOG,vehicleDefinition,type AdminOverview,type AdminVehicleRegistration} from '@bar/shared';
import {card,e,reasonField,requestId,type SectionFactory} from './kit';

export const registerVehicleSection:SectionFactory=(root,ctx,params)=>{
  let disposed=false,search='',players:AdminOverview['users']=[],playerId=params.player??'',model:string=VEHICLE_CATALOG[0].model;
  let color:string=VEHICLE_CATALOG[0].defaultColor,plate='',reason='',pending='',generation=0;
  function render():void {
    if(disposed)return;
    const definition=vehicleDefinition(model)!;
    root.innerHTML=card('Registrar veículo para um jogador',`<p class="admin-note">Cria um veículo novo, com peças e tanque em 100%, na garagem do jogador. A chave é entregue sem cobrar moedas.</p>
      <form data-register-search class="admin-fields"><label>Buscar jogador para registro<input name="search" aria-label="Buscar jogador para registro" value="${e(search)}" maxlength="100" placeholder="Nome, usuário ou e-mail"></label><button type="submit" class="mini-button">Buscar jogador</button></form>
      <form data-register-vehicle class="admin-inline-form"><label>Proprietário do veículo<select name="playerId" aria-label="Proprietário do veículo" required><option value="">Selecione um jogador</option>${players.map(p=>`<option value="${e(p.id)}" ${p.id===playerId?'selected':''}>${e(p.displayName)} (@${e(p.username)})</option>`).join('')}</select></label>
      <div class="admin-fields"><label>Modelo para registro<select name="model" aria-label="Modelo para registro">${VEHICLE_CATALOG.map(v=>`<option value="${v.model}" ${v.model===model?'selected':''}>${e(v.name)}</option>`).join('')}</select></label>
      <label>Cor do registro<input name="color" type="color" aria-label="Cor do registro" value="${e(color)}" ${definition.paintable?'':'disabled'}></label></div>
      <label>Placa do registro (opcional)<input name="plate" aria-label="Placa do registro (opcional)" value="${e(plate)}" maxlength="7" pattern="[A-Za-z]{3}[0-9][A-Za-z][0-9]{2}" placeholder="ABC1D23" style="text-transform:uppercase"></label><p class="fine-print">Deixe a placa vazia para gerar uma automaticamente. Placas personalizadas seguem o formato ABC1D23 e precisam ser únicas.</p>
      ${reasonField('Motivo do registro')}<button type="submit" class="button primary">Registrar veículo</button></form>`,{icon:'key'});
    root.querySelector<HTMLTextAreaElement>('[name="reason"]')!.value=reason;
  }
  async function find():Promise<void>{
    const version=++generation;
    try{
      const result=await ctx.api<AdminOverview>(`/admin/overview?${new URLSearchParams({search,limit:'25',filter:'all'})}`);
      if(disposed||version!==generation)return;players=result.users.filter(p=>p.verified&&p.canEditWallet);render();
    }catch(error){if(!disposed)ctx.message(error instanceof Error?error.message:'Erro ao buscar jogadores.',true);}
  }
  const input=(event:Event)=>{
    const field=event.target as HTMLInputElement;pending='';
    if(field.name==='search')search=field.value;else if(field.name==='reason')reason=field.value;else if(field.name==='plate')plate=field.value.toUpperCase();else if(field.name==='color')color=field.value;
  };
  const change=(event:Event)=>{
    const field=event.target as HTMLSelectElement;pending='';
    if(field.name==='playerId')playerId=field.value;
    if(field.name==='model'){model=field.value;color=vehicleDefinition(model)!.defaultColor;render();}
  };
  const submit=(event:SubmitEvent)=>{
    const form=event.target as HTMLFormElement;if(!form.matches('[data-register-search],[data-register-vehicle]'))return;
    event.preventDefault();event.stopPropagation();
    if(form.matches('[data-register-search]')){void find();return;}
    const definition=vehicleDefinition(model)!;
    const body:AdminVehicleRegistration={playerId,model,...(definition.paintable?{color}:{}),...(plate?{plate}:{}),reason,requestId:pending||=requestId()};
    void ctx.run(async()=>{
      await ctx.api('/admin/vehicles/register',body);if(disposed)return;
      pending='';plate='';reason='';render();ctx.requestWorld();
    },'Veículo registrado na garagem do jogador. A chave já pertence a ele.');
  };
  root.addEventListener('input',input);root.addEventListener('change',change);root.addEventListener('submit',submit);render();void find();
  return {destroy(){disposed=true;root.removeEventListener('input',input);root.removeEventListener('change',change);root.removeEventListener('submit',submit);}};
};
