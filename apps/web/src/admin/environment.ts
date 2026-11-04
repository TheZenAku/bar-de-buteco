import {WEATHER_NAMES,formatGameHour,gameHour,weatherAt} from '@bar/shared';
import {card,e,n,stat,type SectionFactory,type WorldSnapshot} from './kit';

export const environmentSection:SectionFactory=(root,ctx)=>{
  let snapshot:WorldSnapshot|null=ctx.world(),receivedAt=Date.now();
  function status():void {
    const s=snapshot?.environment;if(!s)return;
    const now=snapshot!.at+Date.now()-receivedAt,w=weatherAt(now,s);
    const clock=root.querySelector('[data-environment-clock]'),climate=root.querySelector('[data-environment-weather]');
    if(clock)clock.textContent=formatGameHour(gameHour(now,s));
    if(climate)climate.textContent=WEATHER_NAMES[w.kind];
  }
  function render():void {
    const s=snapshot?.environment;
    if(!s){root.innerHTML='<p class="admin-loading">Carregando tempo e clima…</p>';return;}
    root.innerHTML=`<div class="admin-stats">
      ${stat('Hora no jogo',`<span data-environment-clock>${formatGameHour(s.currentHour)}</span>`,s.paused?'Relógio pausado':'Ciclo em andamento')}
      ${stat('Clima atual',`<span data-environment-weather>${e(WEATHER_NAMES[s.currentWeather.kind])}</span>`,s.weather==='auto'?'Ciclo automático':'Clima fixo')}
      ${stat('Duração de um dia',`${n(s.dayDurationMs/60_000)} min`,'Minutos reais para 24 horas no jogo')}
    </div><div class="admin-grid">
    ${card('Relógio do mundo',`<form class="admin-inline-form" data-environment-form="clock">
      <label>Horário<input name="hour" type="time" required value="${formatGameHour(s.currentHour)}"></label>
      <label>Duração do dia (minutos reais)<input name="dayMinutes" type="number" min="5" max="240" step="1" required value="${s.dayDurationMs/60_000}"></label>
      <label class="inline-check"><input name="paused" type="checkbox" ${s.paused?'checked':''}> Pausar passagem do tempo</label>
      <button class="mini-button" type="submit">Aplicar horário</button></form>
      <div class="row">${[[6,'Amanhecer'],[12,'Meio-dia'],[18,'Entardecer'],[0,'Meia-noite']].map(([h,label])=>`<button class="mini-button" type="button" data-environment-hour="${h}">${label}</button>`).join('')}
      <button class="mini-button" type="button" data-environment-pause="${!s.paused}">${s.paused?'Retomar relógio':'Pausar relógio'}</button></div>
      <p class="fine-print">Pausar congela o sol e a lua. Partidas, empregos, entregas e o clima continuam contando o tempo normalmente.</p>`,{icon:'clock'})}
    ${card('Clima da cidade',`<form class="admin-inline-form" data-environment-form="weather"><label for="admin-environment-weather">Condição do tempo</label><select id="admin-environment-weather" name="weather">${Object.entries(WEATHER_NAMES).map(([id,label])=>`<option value="${id}" ${s.weather===id?'selected':''}>${label}</option>`).join('')}</select>
      <button class="mini-button" type="submit">Aplicar clima</button></form>
      <p class="admin-note">Chuva com vento e céu fechado; tempestades acrescentam relâmpagos e trovões. Telhados protegem os interiores.</p>
      <p class="fine-print">No automático, o clima muda a cada 6 minutos. As transições levam 12 segundos. Um clima fixo permanece até outra alteração.</p>`,{icon:'cloud'})}
    </div>${card('Restaurar padrão',`<p class="admin-note">Volta ao horário global, ao dia de 40 minutos e ao clima automático.</p><button class="mini-button" type="button" data-environment-reset>Restaurar tempo e clima</button>`)}
    <p class="fine-print">Alterações valem para todos nesta sala e ficam no log. Os controles voltam ao padrão quando o servidor reinicia.</p>`;
    status();
  }
  const send=(patch:unknown)=>{ctx.send('admin.environment',patch);ctx.message('Comando enviado ao mundo.');};
  const click=(event:MouseEvent)=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('button');if(!button)return;
    if(button.dataset.environmentHour!==undefined)send({hour:Number(button.dataset.environmentHour)});
    else if(button.dataset.environmentPause!==undefined)send({paused:button.dataset.environmentPause==='true'});
    else if(button.hasAttribute('data-environment-reset'))send({reset:true});
  };
  const submit=(event:SubmitEvent)=>{
    const form=(event.target as HTMLElement).closest<HTMLFormElement>('[data-environment-form]');if(!form)return;
    event.preventDefault();event.stopPropagation();const values=new FormData(form);
    if(form.dataset.environmentForm==='weather')send({weather:values.get('weather')});
    else {const [h,m]=String(values.get('hour')).split(':').map(Number);send({hour:h!+m!/60,dayMinutes:Number(values.get('dayMinutes')),paused:values.get('paused')==='on'});}
    (document.activeElement as HTMLElement|null)?.blur();
  };
  root.addEventListener('click',click);root.addEventListener('submit',submit);render();ctx.requestWorld();
  const timer=setInterval(status,500);
  return {world(next){snapshot=next;receivedAt=Date.now();const active=document.activeElement;if(root.contains(active)&&(active instanceof HTMLInputElement||active instanceof HTMLSelectElement)){status();return;}render();},
    destroy(){clearInterval(timer);root.removeEventListener('click',click);root.removeEventListener('submit',submit);}};
};
