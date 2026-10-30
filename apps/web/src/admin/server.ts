import type {AdminServerInfo} from '@bar/shared';
import {ago,badge,bytes,card,duration,e,empty,meter,n,stat,uiIcon,when,type SectionFactory,type WorldSnapshot} from './kit';

const TABLE_NAMES:Record<string,string>={users:'Contas',user_profiles:'Perfis',sessions:'Sessões',wallets:'Carteiras',currency_ledger:'Lançamentos de moedas',inventory_ledger:'Lançamentos de itens',
  item_inventory:'Mochilas',skin_inventory:'Skins compradas',moderation_actions:'Ações da administração',reports:'Denúncias',game_logs:'Log de eventos',game_controls:'Comandos para o mundo',
  economy_prices:'Preços alterados',game_results:'Resultados de partidas',game_statistics:'Estatísticas',phone_messages:'Mensagens do Highzap',phone_media:'Mídias do Highzap',gram_posts:'Posts do Highgram',
  gram_comments:'Comentários',gram_likes:'Curtidas',gram_follows:'Seguidores',gram_profiles:'Perfis do Highgram',phone_lines:'Linhas de celular',phone_contacts:'Contatos',blocks:'Bloqueios',
  email_verifications:'Confirmações de e-mail',password_resets:'Recuperações de senha',bar_schema_migrations:'Migrações aplicadas'};
const rows=(list:Array<[string,string]>)=>`<dl class="admin-rows">${list.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

/** Servidor: the API's and the world's processes, the host's memory and disk, the database and the queues between them. */
export const serverSection:SectionFactory=(root,ctx)=>{
  let info:AdminServerInfo|undefined,disposed=false;
  function worldCard(w:WorldSnapshot|null):string {
    const p=w?.process;
    if(!p)return empty('Aguardando o mundo responder…');
    const apiAge=Date.now()-p.apiOkAt;
    return rows([['Situação',`${badge(apiAge<15000?'Conversando com a API':'Sem contato com a API',apiAge<15000?'mint':'red')}`],['No ar há',duration(p.uptimeS)],['Node',e(p.node)],['PID',String(p.pid)],
      ['Memória (RSS)',bytes(p.rss)],['Heap usado',bytes(p.heapUsed)],['Tick p95',p.tickP95===undefined?'—':`${n(p.tickP95,1)} ms`],['Última conversa com a API',ago(p.apiOkAt)],
      ['Fila de resultados em disco',p.outboxWritable?'Gravável':badge('Sem escrita','red')],['Preços',w.pricesLoaded===false?'Recarregando':'Sincronizados'],['Eventos aguardando o log',n(w.logQueue??0)]]);
  }
  function render():void {
    if(disposed)return;
    if(!info){root.innerHTML='<p class="admin-loading">Consultando o servidor…</p>';return;}
    const i=info,usedMem=i.host.totalMem-i.host.freeMem,diskUsed=i.disk?i.disk.total-i.disk.free:0,maxTable=Math.max(1,...i.database.tables.map(t=>t.bytes??0));
    const load=i.host.load.some(v=>v>0)?i.host.load.map(v=>n(v,2)).join(' · '):'indisponível neste sistema';
    root.innerHTML=`<div class="admin-toolbar"><small>Consultado ${when(i.at)} · atualiza a cada 15 s</small><span class="admin-toolbar-end"><button class="mini-button" data-server-refresh>${uiIcon('refresh')}Atualizar</button></span></div>
      <div class="admin-stats">
        ${stat('API no ar há',duration(i.api.uptimeS),`${n(i.api.requests)} requisições · ${n(i.api.errors)} erros 5xx`,i.api.errors?'warn':'')}
        ${stat('Memória do servidor',`${Math.round(usedMem/i.host.totalMem*100)}%`,`${bytes(usedMem)} de ${bytes(i.host.totalMem)}`,usedMem/i.host.totalMem>.9?'warn':'')}
        ${stat('Disco',i.disk?`${Math.round(diskUsed/i.disk.total*100)}%`:'—',i.disk?`${bytes(i.disk.free)} livres de ${bytes(i.disk.total)}`:'Indisponível',i.disk&&i.disk.free/i.disk.total<.1?'warn':'')}
        ${stat('Banco de dados',bytes(i.database.size),`${i.database.tables.length} tabelas`)}
        ${stat('Comandos pendentes',n(i.queues.controlsPending),i.queues.controlsFailed?`${n(i.queues.controlsFailed)} falharam`:'Nenhuma falha',i.queues.controlsFailed?'warn':'')}
        ${stat('Log de eventos',n(i.queues.gameLogs),i.queues.oldestLog?`desde ${when(i.queues.oldestLog)}`:'vazio')}
      </div>
      <div class="admin-grid">
        ${card('Máquina',`${rows([['Nome',e(i.host.hostname)],['Sistema',`${e(i.host.platform)} ${e(i.host.release)}`],['Processadores',`${i.host.cpus} · ${e(i.host.cpuModel)}`],['Carga (1, 5, 15 min)',load],['Ligada há',duration(i.host.uptimeS)]])}
          <p class="admin-meter-label">Memória · ${bytes(usedMem)} de ${bytes(i.host.totalMem)}</p>${meter(usedMem/i.host.totalMem,'Memória usada')}
          ${i.disk?`<p class="admin-meter-label">Disco (${e(i.disk.path)}) · ${bytes(diskUsed)} de ${bytes(i.disk.total)}</p>${meter(diskUsed/i.disk.total,'Disco usado')}`:''}`,{icon:'hardDrive'})}
        ${card('Processo da API',`${rows([['Node',e(i.api.node)],['PID',String(i.api.pid)],['Memória (RSS)',bytes(i.api.rss)],['Heap',`${bytes(i.api.heapUsed)} de ${bytes(i.api.heapTotal)}`],
          ['Requisições desde o início',n(i.api.requests)],['Erros 5xx',n(i.api.errors)],['Tempo de resposta p95',i.api.p95Ms===null?'—':`${n(i.api.p95Ms,1)} ms`]])}`,{icon:'server'})}
      </div>
      <div class="admin-grid">
        ${card('Processo do mundo',`<div id="server-world">${worldCard(ctx.world())}</div>`,{icon:'activity'})}
        ${card('Banco de dados',`${rows([['Motor',i.database.driver==='pglite'?'PostgreSQL embutido (PGlite)':i.database.driver==='postgres'?'PostgreSQL':e(i.database.driver)],['Versão',e(i.database.version)],['Tamanho',bytes(i.database.size)],
            ...(i.database.connections===null?[]:[['Conexões abertas',n(i.database.connections)] as [string,string]])])}
          <div class="admin-scroll"><table class="admin-table admin-db"><thead><tr><th>Tabela</th><th class="num">Registros</th><th>Tamanho</th></tr></thead><tbody>
          ${i.database.tables.map(t=>`<tr><td>${e(TABLE_NAMES[t.name]??t.name)}<small>${e(t.name)}</small></td><td class="num">${n(t.rows)}</td><td><span class="admin-bar up" style="--w:${(t.bytes??0)/maxTable*100}%"></span>${bytes(t.bytes)}</td></tr>`).join('')}</tbody></table></div>`,{icon:'database'})}
      </div>`;
  }
  async function load():Promise<void> {
    try{info=await ctx.api<AdminServerInfo>('/admin/server');if(!disposed)render();}
    catch(error){if(!disposed){if(!info)root.innerHTML=empty('Não foi possível consultar o servidor.');ctx.message(error instanceof Error?error.message:'Erro ao consultar o servidor.',true);}}
  }
  const click=(event:MouseEvent)=>{if((event.target as HTMLElement).closest('[data-server-refresh]'))void load();};
  const timer=setInterval(()=>{if(!document.hidden)void load();},15_000);
  root.addEventListener('click',click);render();void load();
  return {
    world(w){const slot=root.querySelector('#server-world');if(slot)slot.innerHTML=worldCard(w);},
    destroy(){disposed=true;clearInterval(timer);root.removeEventListener('click',click);},
  };
};
