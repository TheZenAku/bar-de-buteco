import {BLACKJACK_SEATS,CHAT_RADIUS,FOOSBALL,FOOSBALL_TABLES,JOBS,POOL_LEVELS,POOL_LEVEL_NAMES,POOL_TABLES,STAGE_PASS,TABLE_ORDER_MAX_ITEMS,VOICE} from '@bar/shared';
import {escape as e} from './api';
import {price} from './prices';
import {uiIcon as icon} from './ui-icons';

/** The keys, by group: the entry's Controles tab and the in-game help (main.ts help) read the same list. */
export const CONTROLS=[
  {label:'Movimento',icon:'keyboard',keys:[['W A S D','Caminhar pelo bar'],['Shift','Correr'],['Mouse','Arraste para olhar em qualquer ângulo. Role para ajustar a distância da câmera continuamente.'],['Botão do scroll','Em tela cheia, o mouse fica preso ao jogo e olha sem arrastar: aperte para mostrar o cursor e aperte de novo para prender'],['Q','Alternar entre primeira pessoa e sua distância de terceira pessoa']]},
  {label:'Interação',icon:'sparkles',keys:[['E','Sentar, pedir bebida, usar a jukebox ou entrar na mesa'],['Botão direito','Clique em alguém, ou em você, e abra o Perfil'],['I','Abrir a mochila, usar e descartar itens'],['P','Sentado à mesa: pedir comida e bebida ao Tonico ou a quem estiver trabalhando no bar'],['J','Trabalhar no bar e ganhar moedas'],['K','Celular: ligações, Highzap, Highgram, câmera, HighBank e mais (Esc guarda)']]},
  {label:'Gestos',icon:'hand',keys:[['Sua tecla','Usar a skill ativa da skin: compre na coleção (C), escolha a tecla no seu perfil, aba Skill'],['G','Dançar ou parar de dançar'],['V','Acenar para o pessoal'],['F','Acender e levar o cigarro \u00e0 boca; F novamente apaga. Pode caminhar e fazer outras a\u00e7\u00f5es enquanto fuma'],['C','Trocar de skin']]},
  {label:'Veículos',icon:'bike',keys:[['W S','Acelerar; frear e dar ré'],['A D','Virar'],['Espaço','Freio de mão'],['F','Segure para buzinar na moto ou no carro'],['Shift','Na moto em movimento: fazer grau. No cavalo: empinar e relinchar; com movimento depois da empinada, galopar'],['E','Subir e descer. Moto caída: levantar. Devagar no anel da garagem: guardar'],['L','Trancar e destrancar o seu veículo'],['Z C','Seta esquerda e seta direita (apagam sozinhas depois da curva)'],['X','Pisca-alerta'],['H','Faróis']]},
  {label:'Óculos VR (Quest 2)',icon:'glasses',keys:[['Direcional esquerdo','Andar (empurrado até o fim, corre); apertar o direcional corre sem segurar. Dirigindo: acelera, freia e vira'],['Direcional direito','Girar a visão aos pulos (ou suave, em Configurações); apertar o direcional recentraliza na sua posição e altura'],['Gatilho direito','Aponte para alguém e puxe para abrir o menu da pessoa; senão, interage. Nas janelas, clica. Nos veículos, buzina'],['A','Interagir (E); nas janelas, clica'],['B','Fecha a janela aberta; fora delas, acena (na moto ou no carro, liga o farol)'],['X','Celular (K); na moto ou no carro, liga o motor'],['Y','Fecha a janela, ou abre e fecha a tela com a interface'],['Gatilho esquerdo','Abre o chat (um teclado aparece na tela); nos veículos, freio de mão'],['Apertar (grip)','Esquerdo corre, direito dança; nos veículos, esquerdo é freio de mão e direito é grau/galope'],['Pulso esquerdo','Levante o controle esquerdo diante dos olhos para ver mapa, estado e carteira']]},
  {label:'Conversa',icon:'chat',keys:[['Enter ou T',`Conversar com quem está a até ${CHAT_RADIUS} metros`],['M',`Ligar ou desligar o microfone (voz por proximidade, até ${VOICE.maxDistance} metros)`],['B','Segure para falar, no modo apertar para falar'],['Esc','Fechar uma janela']]},
] as const;
export const keyGrid=(keys:ReadonlyArray<readonly [string,string]>)=>`<div class="help-grid">${keys.map(([key,text])=>`<kbd>${key}</kbd><span>${text}</span>`).join('')}</div>`;

/** The entry's O Bar tab: the rules of @bar/shared and the live prices (prices.ts), never invented numbers. */
const features=()=>[
  {label:'Galera',icon:'users',info:'Encontre a turma e converse com quem está por perto, por texto ou por voz.',rows:[['Chat de texto',`até ${CHAT_RADIUS} m`],['Voz por proximidade',`até ${VOICE.maxDistance} m`]]},
  {label:'Blackjack',icon:'cards',info:'21 do Baiano: regras de cassino, apostas em moedas do jogo. Blackjack paga 3 para 2.',rows:[['Jogadores',`até ${BLACKJACK_SEATS.length}`],['Apostas',`${price('blackjack:min-bet')} a ${price('blackjack:max-bet')} moedas por mão`],['Jogadas','pedir, parar, dobrar, dividir, desistir e seguro']]},
  {label:'Truco',icon:'cards',info:'Duplas no salão de jogos, com as regras da Copag: Truco, Seis, Nove e Doze, Mão de 11, Mão de Ferro e sinais de rosto. Faltou gente, os NPCs completam a mesa.',rows:[['Jogadores','1 a 4 pessoas, os NPCs completam'],['Contra NPCs',`${price('truco:level-iniciante')}, ${price('truco:level-medio')} ou ${price('truco:level-experiente')} moedas por pessoa, conforme o nível`],['Entre jogadores',`a partir de ${price('truco:min-bet')} moedas por pessoa`],['Prêmio','o dobro do que você pôs']]},
  {label:'Pebolim',icon:'ball',info:'Totó de 11 bonecos no salão de jogos, com as regras oficiais. Jogue 1 contra 1, em duplas, contra o Zé do Totó ou valendo moedas.',rows:[['Mesas',`${FOOSBALL_TABLES.length}, no andar de cima`],['Jogadores','1 × 1 ou 2 × 2, o Zé completa'],['Partida',`até ${FOOSBALL.defaultGoals} gols (3 a 10), um set ou melhor de 3`],['Valendo',`${price('foosball:min-bet')} a ${price('foosball:max-bet')} moedas por jogador`]]},
  {label:'Sinuca',icon:'ball',info:'Bola 8 nas mesas do salão de jogos, com as regras da Noel Snooker e física de verdade: efeito, tabela, salto e as faltas apitadas pela mesa. Jogue contra outra pessoa ou contra o Juca da Sinuca.',rows:[['Mesas',`${POOL_TABLES.length}, no andar de cima`],['Jogadores','1 × 1, o Juca completa'],['Juca da Sinuca',POOL_LEVELS.map(l=>POOL_LEVEL_NAMES[l]).join(', ')]]},
  {label:'Jukebox e TVs',icon:'music',info:'Cole um link de vídeo, música ou rádio (YouTube, Spotify, SoundCloud, Twitch e outros) e todo mundo por perto ouve e assiste junto.',rows:[['Jukebox',`${price('media:jukebox')} moedas`],['TV',`${price('media:tv')} moedas`],['Telão do palco',`${price('media:telao')} moedas`]]},
  {label:'Palco',icon:'micVocal',info:'Suba no palco do quintal e toque violão, cavaquinho, bateria ou pegue o microfone.',rows:[['Ingresso',`${price('stage:pass')} moedas`],['Validade',`${STAGE_PASS.durationMs/60_000} min`]]},
  {label:'Mesa e balcão',icon:'beer',info:'Peça uma gelada ao Magrão no balcão, ou sente-se e peça comida e bebida ao Tonico.',rows:[['Pedido na mesa',`até ${TABLE_ORDER_MAX_ITEMS} itens`]]},
  {label:'Trabalho',icon:'briefcase',info:'Trabalhe no bar e ganhe moedas: cada tarefa paga na hora.',rows:JOBS.map(job=>[job.name,`${price(`job:${job.id}`)} moedas por tarefa`] as const)},
] as const;

const chip=(index:number,f:ReturnType<typeof features>[number])=>`<button type="button" class="tile" data-lobby-item="bar:${index}" aria-current="${index===0}">${icon(f.icon)}<b>${f.label}</b></button>`;
/** The line under the chips: what the pointed one is, and its leading limit or price (never an invented number). */
function detail(index:number):string{
  const f=features()[index]!;
  return `<p class="chip-info"><b>${f.label}</b> ${f.info}</p><p class="chip-stat">${e(f.rows[0]?.[0]??'')}: <b>${e(f.rows[0]?.[1]??'')}</b></p>`;
}
/** The keys a first visit needs; the rest is in the help window (CONTROLS), one click away. */
const QUICK_KEYS=[['W A S D','Caminhar'],['E','Interagir'],['T','Conversar'],['K','Celular'],['G','Dançar'],['I','Mochila']] as const;
/** Under the account card: what the bar offers as chips (the pointed one explained below) and the keys that matter. */
export function lobbyMore():string{
  const all=features();
  return `<section class="lobby-more" id="lobby-bar" aria-label="O que rola no bar"><p class="eyebrow">O que rola no bar</p>
    <div class="tiles" role="group" aria-label="Atividades do bar">${all.map((f,i)=>chip(i,f)).join('')}</div>
    <div class="chip-detail" data-lobby-detail="bar" aria-live="polite">${detail(0)}</div>
    <div class="quick-keys" aria-label="Teclas principais"><div class="quick-grid">${QUICK_KEYS.map(([key,label])=>`<span><kbd>${key}</kbd>${label}</span>`).join('')}</div>
    <button type="button" class="text-button" data-action="help">Todos os controles ${icon('chevronRight')}</button></div></section>`;
}

/** Pointing at, focusing or clicking a tile selects it (as the reference's list did); the arrows walk the grid. */
export function createLobbyMenu(root:HTMLElement):void{
  const detailBox=root.querySelector<HTMLElement>('[data-lobby-detail="bar"]')!,tiles=[...root.querySelectorAll<HTMLButtonElement>('[data-lobby-item]')];
  function select(button:HTMLButtonElement):void{
    if(button.getAttribute('aria-current')==='true')return;
    tiles.forEach(other=>other.setAttribute('aria-current',String(other===button)));
    detailBox.innerHTML=detail(Number(button.dataset.lobbyItem!.split(':')[1]));
  }
  const tileOf=(event:Event)=>(event.target as Element).closest<HTMLButtonElement>('[data-lobby-item]');
  root.addEventListener('click',event=>{const entry=tileOf(event);if(entry)select(entry);});
  root.addEventListener('pointerover',event=>{const entry=tileOf(event);if(entry)select(entry);});
  root.addEventListener('focusin',event=>{const entry=tileOf(event);if(entry)select(entry);});
  root.addEventListener('keydown',event=>{
    const entry=tileOf(event);if(!entry)return;
    const step={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[event.key as 'ArrowRight'];if(!step)return;
    event.preventDefault();tiles[(tiles.indexOf(entry)+step+tiles.length)%tiles.length]!.focus();
  });
}
