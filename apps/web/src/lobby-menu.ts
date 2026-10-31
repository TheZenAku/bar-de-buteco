import {BLACKJACK_SEATS,CHAT_RADIUS,FOOSBALL,FOOSBALL_TABLES,JOBS,STAGE_PASS,TABLE_ORDER_MAX_ITEMS,VOICE} from '@bar/shared';
import {escape as e} from './api';
import {price} from './prices';
import {uiIcon as icon} from './ui-icons';

/** The keys, by group: the entry's Controles tab and the in-game help (main.ts help) read the same list. */
export const CONTROLS=[
  {label:'Movimento',icon:'keyboard',keys:[['W A S D','Caminhar pelo bar'],['Shift','Correr'],['Mouse','Arraste para olhar em qualquer ângulo. Role para ajustar a distância da câmera continuamente.'],['Q','Alternar entre primeira pessoa e sua distância de terceira pessoa']]},
  {label:'Interação',icon:'sparkles',keys:[['E','Sentar, pedir bebida, usar a jukebox ou entrar na mesa'],['I','Abrir a mochila, usar e descartar itens'],['P','Sentado à mesa: pedir comida e bebida ao Tonico ou a quem estiver trabalhando no bar'],['J','Trabalhar no bar e ganhar moedas'],['K','Celular: ligações, Highzap, Highgram, câmera, HighBank e mais (Esc guarda)']]},
  {label:'Gestos',icon:'hand',keys:[['G','Dançar ou parar de dançar'],['V','Acenar para o pessoal'],['F','Acender um cigarro (F de novo, ou E, apaga)'],['Shift F','Fumar um cigarro inteiro: tira o maço, acende, traga e pisa na bituca (cerca de 18 s)'],['C','Trocar de skin']]},
  {label:'Conversa',icon:'chat',keys:[['Enter ou T',`Conversar com quem está a até ${CHAT_RADIUS} metros`],['M',`Ligar ou desligar o microfone (voz por proximidade, até ${VOICE.maxDistance} metros)`],['B','Segure para falar, no modo apertar para falar'],['Esc','Fechar uma janela']]},
] as const;
export const keyGrid=(keys:ReadonlyArray<readonly [string,string]>)=>`<div class="help-grid">${keys.map(([key,text])=>`<kbd>${key}</kbd><span>${text}</span>`).join('')}</div>`;

/** The entry's O Bar tab: the rules of @bar/shared and the live prices (prices.ts), never invented numbers. */
const features=()=>[
  {label:'Galera',icon:'users',info:'Encontre a turma e converse com quem está por perto, por texto ou por voz.',rows:[['Chat de texto',`até ${CHAT_RADIUS} m`],['Voz por proximidade',`até ${VOICE.maxDistance} m`]]},
  {label:'Blackjack',icon:'cards',info:'21 do Baiano: regras de cassino, apostas em moedas do jogo. Blackjack paga 3 para 2.',rows:[['Jogadores',`até ${BLACKJACK_SEATS.length}`],['Apostas',`${price('blackjack:min-bet')} a ${price('blackjack:max-bet')} moedas por mão`],['Jogadas','pedir, parar, dobrar, dividir, desistir e seguro']]},
  {label:'Pebolim',icon:'ball',info:'Totó de 11 bonecos no salão de jogos, com as regras oficiais. Jogue 1 contra 1, em duplas, contra o Zé do Totó ou valendo moedas.',rows:[['Mesas',`${FOOSBALL_TABLES.length}, no andar de cima`],['Jogadores','1 × 1 ou 2 × 2, o Zé completa'],['Partida',`até ${FOOSBALL.defaultGoals} gols (3 a 10), um set ou melhor de 3`],['Valendo',`${price('foosball:min-bet')} a ${price('foosball:max-bet')} moedas por jogador`]]},
  {label:'Jukebox e TVs',icon:'music',info:'Cole um link de vídeo, música ou rádio (YouTube, Spotify, SoundCloud, Twitch e outros) e todo mundo por perto ouve e assiste junto.',rows:[['Jukebox',`${price('media:jukebox')} moedas`],['TV',`${price('media:tv')} moedas`],['Telão do palco',`${price('media:telao')} moedas`]]},
  {label:'Palco',icon:'micVocal',info:'Suba no palco do quintal e toque violão, cavaquinho, bateria ou pegue o microfone.',rows:[['Ingresso',`${price('stage:pass')} moedas`],['Validade',`${STAGE_PASS.durationMs/60_000} min`]]},
  {label:'Mesa e balcão',icon:'beer',info:'Peça uma gelada ao Magrão no balcão, ou sente-se e peça comida e bebida ao Tonico.',rows:[['Pedido na mesa',`até ${TABLE_ORDER_MAX_ITEMS} itens`]]},
  {label:'Trabalho',icon:'briefcase',info:'Trabalhe no bar e ganhe moedas: cada tarefa paga na hora.',rows:JOBS.map(job=>[job.name,`${price(`job:${job.id}`)} moedas por tarefa`] as const)},
] as const;

const item=(group:string,index:number,label:string,iconName:string)=>`<button type="button" data-lobby-item="${group}:${index}" aria-current="${index===0}">${icon(iconName)}<span>${label}</span>${icon('chevronRight')}</button>`;
/** The reference's detail card: title and pink icon, content, and a mono footer with the position in the list. */
export const detailCard=(title:string,iconName:string,body:string,foot:string,position='')=>`<header class="detail-head"><h2>${title}</h2>${icon(iconName)}</header><div class="detail-body">${body}</div><footer class="detail-foot"><span>${foot}</span><span>${position}</span></footer>`;
function detail(group:'bar'|'controls',index:number):string{
  if(group==='bar'){const all=features(),f=all[index]!;return detailCard(f.label,f.icon,`<p class="detail-info">${f.info}</p><dl class="detail-rows">${f.rows.map(([name,value])=>`<div><dt>${e(name)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>`,`${icon('signal')} Sessão pública`,`${index+1} / ${all.length}`);}
  const c=CONTROLS[index]!;return detailCard(c.label,c.icon,keyGrid(c.keys),`${icon('keyboard')} Teclado e mouse`,`${index+1} / ${CONTROLS.length}`);
}
/** The entry's O Bar and Controles tabs (the Conta tab is the account form of main.ts renderAuth). */
export function lobbyPanels():string{
  return `<div class="menu-columns" id="lobby-bar" role="tabpanel" aria-labelledby="lobby-tab-bar" hidden><nav class="menu-list" aria-label="O que tem no bar">${features().map((f,i)=>item('bar',i,f.label,f.icon)).join('')}</nav><section class="menu-detail" data-lobby-detail="bar" aria-live="polite">${detail('bar',0)}</section></div>
    <div class="menu-columns" id="lobby-controls" role="tabpanel" aria-labelledby="lobby-tab-controls" hidden><nav class="menu-list" aria-label="Grupos de teclas">${CONTROLS.map((c,i)=>item('controls',i,c.label,c.icon)).join('')}</nav><section class="menu-detail" data-lobby-detail="controls" aria-live="polite">${detail('controls',0)}</section></div>`;
}

/** Tabs (arrows left and right), lists (arrows up and down) and, as in the reference, pointing at an item selects it. */
export function createLobbyMenu(root:HTMLElement):void{
  const tabs=[...root.querySelectorAll<HTMLButtonElement>('[data-lobby-tab]')];
  function selectTab(tab:HTMLButtonElement,focus=false):void{
    for(const other of tabs){const on=other===tab;other.setAttribute('aria-selected',String(on));other.tabIndex=on?0:-1;root.querySelector<HTMLElement>(`#${other.getAttribute('aria-controls')}`)!.hidden=!on;}
    if(focus)tab.focus();
  }
  function selectItem(button:HTMLButtonElement):void{
    if(button.getAttribute('aria-current')==='true')return;
    const [group,index]=button.dataset.lobbyItem!.split(':') as ['bar'|'controls',string];
    button.parentElement!.querySelectorAll('[data-lobby-item]').forEach(other=>other.setAttribute('aria-current',String(other===button)));
    root.querySelector(`[data-lobby-detail="${group}"]`)!.innerHTML=detail(group,Number(index));
  }
  root.addEventListener('click',event=>{
    const target=event.target as Element,tab=target.closest<HTMLButtonElement>('[data-lobby-tab]'),entry=target.closest<HTMLButtonElement>('[data-lobby-item]');
    if(tab)selectTab(tab);if(entry)selectItem(entry);
  });
  root.addEventListener('pointerover',event=>{const entry=(event.target as Element).closest<HTMLButtonElement>('[data-lobby-item]');if(entry)selectItem(entry);});
  root.addEventListener('focusin',event=>{const entry=(event.target as Element).closest<HTMLButtonElement>('[data-lobby-item]');if(entry)selectItem(entry);});
  root.addEventListener('keydown',event=>{
    const target=event.target as HTMLElement;
    if(target.matches('[data-lobby-tab]')&&(event.key==='ArrowLeft'||event.key==='ArrowRight')){
      event.preventDefault();const index=tabs.indexOf(target as HTMLButtonElement),next=tabs[(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length]!;selectTab(next,true);return;
    }
    const list=target.closest('.menu-list');
    if(list&&target.matches('button')&&(event.key==='ArrowDown'||event.key==='ArrowUp')){
      event.preventDefault();const buttons=[...list.querySelectorAll<HTMLButtonElement>('button:not([disabled])')],index=buttons.indexOf(target as HTMLButtonElement);
      buttons[(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();
    }
  });
}
