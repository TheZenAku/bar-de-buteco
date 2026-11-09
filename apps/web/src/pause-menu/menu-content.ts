import {CHAT_RADIUS,SKINS,VOICE,levelOf,rankOf,type InventoryView,type PublicUser,type WorldState} from '@bar/shared';
import {escape as e} from '../api';
import {uiIcon} from '../ui-icons';
import {rankIcon} from '../levels/rank-icon';
import {CONTROLS} from '../lobby-menu';
import {TOUCH_KEYS} from '../touch/touch-controls';
import {PRESET_LABELS} from '../graphics';
import {CAMERA_HEIGHT_LIMIT,CAMERA_LABELS,CAMERA_MODES,CAMERA_SENSITIVITY_LIMITS,CAMERA_ZOOMS,CAMERA_ZOOM_LABELS,type CameraFeel} from '../engine/camera-rig';
import {vrSettings} from '../vr/vr-mode';
import {touchPreference} from '../touch/touch-mode';
import {price} from '../prices';
import type {Settings} from '../settings';
import type {MenuEntry,MenuTab} from './pause-menu';
import {buttonRow,choiceRow,groupRow,noteRow,rangeRow,switchRow} from './rows';
import {weaponGuide,aimSettingsPage} from '../weapons/ui/settings-rows';

type Panel='chat'|'job';
export type MenuAct='dance'|'wave'|'smoke'|'cross-arms'|'guard'|'skill'|'table'|'jobs'|'chat'|'phone'|'map'|'profile'|'skins'|'inventory'|'people'|'admin'|'leave'|'logout'|'arsenal';
/** What the menu reads from the game and asks it to do (main.ts). Only real state: nothing here is made up for show. */
export interface MenuContentHost {
  settings:Settings;
  user():PublicUser|undefined;
  world():WorldState|undefined;
  inventory():InventoryView|undefined;
  balance():number|undefined;
  xp():number|undefined;
  zone():string;
  touch():boolean;
  soundOn():boolean;toggleSound():void;
  jukeboxVolume():number;televisionVolume():number;
  mic():{on:boolean;unavailable:string;status:string};
  toggleMic():void;
  inputDevices():Promise<Array<{id:string;label:string}>>;
  fullscreen():{on:boolean;browser:boolean};toggleFullscreen():void;
  panels:{hidden(id:Panel):boolean;available(id:Panel):boolean;setHidden(id:Panel,hidden:boolean):void;locked():boolean;toggleLock():void;reset():void};
  graphicsNow():{fps:number;currentScale:number}|undefined;
  vrActive():boolean;vrStatus():Promise<string>;
  net():{status:string;ping:string};
  chatUnread():boolean;
  guard():boolean;
  skill():{name:string;icon:string;key:string}|undefined;
  seated():boolean;
  admin():boolean;
  /** /armas is on for this player (docs/sistemas/armas.md): the Arsenal, the aim settings and the firearm keys show only then. */
  armsOn():boolean;
  act(name:MenuAct):void;
  /** The skin standing, as the profile window draws it (a transparent picture), and the one already drawn, if any. */
  portrait(skin:string):Promise<string|undefined>;
  portraitNow(skin:string):string|undefined;
}

const lead=(text:string)=>`<p class="pm-lead">${text}</p>`;
const pct=(value:number,scale=100)=>`${Math.round(value*scale)}%`;
const number=(value:number)=>value.toLocaleString('pt-BR');
const feelLabel=(name:keyof CameraFeel,value:number)=>name==='height'?`${value>0?'+':''}${Math.round(value*100)} cm`:`${Math.round(value*100)}%`;
const keyGrid=(keys:ReadonlyArray<readonly [string,string]>)=>`<div class="pm-keygrid">${keys.map(([key,text])=>`<kbd>${e(key)}</kbd><span>${e(text)}</span>`).join('')}</div>`;
const text=(...paragraphs:string[])=>`<div class="pm-text">${paragraphs.map(p=>`<p>${p}</p>`).join('')}</div>`;
/** The details beside the skin, standing on a soft magenta floor light. The picture arrives when drawn (live below). */
const withSkin=(host:MenuContentHost,skin:string|undefined,content:string)=>{
  if(!skin)return content;
  const src=host.portraitNow(skin);
  return `<div class="pm-split"><div>${content}</div><figure class="pm-figure"><img data-portrait="${e(skin)}" alt=""${src?` src="${src}"`:' hidden'}></figure></div>`;
};
const drawSkin=(host:MenuContentHost)=>(pane:HTMLElement)=>{
  const img=pane.querySelector<HTMLImageElement>('img[data-portrait]');if(!img||!img.hidden||img.dataset.asked)return;
  img.dataset.asked='1';void host.portrait(img.dataset.portrait!).then(src=>{if(src&&img.isConnected){img.src=src;img.hidden=false;}});
};

/** The header's right side: who, the level with its progress, and the wallet. */
export function menuHeader(host:MenuContentHost):string {
  const user=host.user();if(!user)return '';
  const xp=host.xp(),balance=host.balance(),p=xp===undefined?undefined:levelOf(xp),rank=p?rankOf(p.level):undefined;
  const player=`<div class="pm-player"><span class="pm-avatar" style="--avatar:${e(user.color)}">${e(user.displayName.slice(0,1))}</span><div class="pm-who"><b>${e(user.displayName)}</b>${p&&rank?`<span class="pm-rank" style="--rank:${rank.colors[0]}">${rankIcon(p.level,20)}<span class="pm-lv">Nv ${p.level}</span><span class="pm-rank-name">${e(rank.name)}</span></span>`:''}</div></div>`;
  const progress=p?`<div class="pm-xp" style="--p:${p.need?(p.into/p.need).toFixed(3):1}"><small>${p.need?`${number(p.into)} / ${number(p.need)} XP`:`${number(p.xp)} XP`}</small><i></i></div>`:'';
  return `${player}${progress}<div class="pm-cash" aria-label="Carteira">${uiIcon('wallet')}<span>${balance===undefined?'…':number(balance)}</span></div>`;
}

// ---- Ações: what the body does, the same as its key.
function actions(host:MenuContentHost):MenuEntry[] {
  const self=()=>host.world()?.players[host.user()?.id??''];
  const busy=()=>self()?.interactionState?.startsWith('stage-')?'Você está no palco agora.':undefined;
  return [
    {id:'dance',label:'Dançar',icon:'music',key:'G',kind:'action',blocked:busy,state:()=>self()?.animationState==='dance'?'Dançando':undefined,
      detail:()=>lead('Dança no lugar. De novo, para.'),run:()=>host.act('dance')},
    {id:'wave',label:'Acenar',icon:'hand',key:'V',kind:'action',blocked:busy,detail:()=>lead('Um aceno para o pessoal.'),run:()=>host.act('wave')},
    {id:'smoke',label:'Fumar',icon:'smoke',key:'F',kind:'action',state:()=>self()?.smokingStopAt?'Apagando':self()?.smokingSince?'Fumando':undefined,
      detail:()=>lead(self()?.smokingSince?'Apaga o cigarro.':'Acende o cigarro e leva à boca. Dá para andar e fazer outras coisas fumando.'),run:()=>host.act('smoke')},
    {id:'arms',label:'Cruzar os braços',icon:'user',key:'F1',kind:'action',state:()=>self()?.armsCrossed?'Braços cruzados':undefined,
      detail:()=>lead('Cruza ou descruza. Dá para caminhar e fumar assim.'),run:()=>host.act('cross-arms')},
    {id:'guard',label:'Guarda de luta',icon:'shield',key:'R',kind:'action',state:()=>host.guard()?'Guarda alta':undefined,
      detail:()=>keyGrid([['Clique','Soco: jab, direto e gancho, no ritmo'],['Botão direito','Soco forte, lento e que empurra longe'],['W A S D','Passos curtos com a guarda alta'],['R','Baixa a guarda']]),run:()=>host.act('guard')},
    {id:'arsenal',label:'Arsenal',icon:'gun',key:'U',kind:'window',hidden:()=>!host.armsOn(),
      detail:()=>lead('Suas armas e equipamentos: troque miras, silenciadores e carregadores, veja o que cada peça muda e compre melhorias.'),run:()=>host.act('arsenal')},
    {id:'skill',label:'Habilidade',icon:'sparkles',kind:'action',hidden:()=>!host.skill(),
      state:()=>host.skill()?.name,
      detail:()=>{const skill=host.skill();return skill?`${lead(`${e(skill.name)}: a habilidade da sua skin.`)}${keyGrid([[skill.key,'Usa a habilidade sem abrir o menu']])}`:'';},
      run:()=>host.act('skill')},
    {id:'table',label:'Pedir na mesa',icon:'food',key:'P',kind:'window',blocked:()=>host.seated()?undefined:'Sente-se a uma mesa primeiro (E perto de uma cadeira).',
      detail:()=>lead('Até quatro itens, ao Tonico ou a quem estiver trabalhando no bar. Dá para cancelar enquanto o pedido está no balcão.'),run:()=>host.act('table')},
    {id:'jobs',label:'Trabalhar',icon:'briefcase',key:'J',kind:'window',detail:()=>lead('Turnos no bar: cada tarefa paga na hora.'),run:()=>host.act('jobs')},
  ];
}

// ---- Você: the player's own things, and the way out.
function you(host:MenuContentHost):MenuEntry[] {
  const skinId=()=>host.world()?.players[host.user()?.id??'']?.skin;
  const skinName=()=>SKINS.find(skin=>skin.id===skinId())?.name;
  const items=()=>host.inventory()?.stacks.reduce((sum,stack)=>sum+stack.quantity,0);
  return [
    {id:'profile',label:'Perfil',icon:'idCard',kind:'action',verb:'Abrir',mark:false,live:drawSkin(host),detail:()=>{
      const xp=host.xp(),p=xp===undefined?undefined:levelOf(xp),rank=p?rankOf(p.level):undefined,balance=host.balance(),skin=skinName();
      const progress=p&&rank?`<div class="pm-progress" style="--p:${p.need?(p.into/p.need).toFixed(3):1}"><div><span style="--rank:${rank.colors[0]}">${rankIcon(p.level,22)} <b>Nível ${p.level}</b> ${e(rank.name)}</span><span>${p.need?`${number(p.into)} / ${number(p.need)} XP`:`${number(p.xp)} XP, o máximo`}</span></div><i></i></div>`:'';
      return withSkin(host,skinId(),`${progress}<div class="pm-facts"><div class="pm-money"><b>${balance===undefined?'…':number(balance)}</b><span>moedas na carteira</span></div>${skin?`<div><b>${e(skin)}</b><span>skin de agora</span></div>`:''}</div>${lead('Conquistas, habilidades e o seu cartão.')}`);
    },run:()=>host.act('profile')},
    {id:'skins',label:'Coleção',icon:'shirt',key:'C',kind:'window',mark:false,state:skinName,live:drawSkin(host),detail:()=>withSkin(host,skinId(),lead('Suas skins e as que ainda faltam, com as habilidades de cada uma.')),run:()=>host.act('skins')},
    {id:'inventory',label:'Mochila',icon:'bag',key:'I',kind:'window',state:()=>{const n=items();return n===undefined?undefined:n===1?'1 item':`${n} itens`;},
      detail:()=>{const inv=host.inventory();return inv?`<div class="pm-facts"><div><b>${inv.usedSlots} / ${inv.capacity}</b><span>espaços ocupados</span></div>${inv.keys?.length?`<div><b>${inv.keys.length}</b><span>${inv.keys.length===1?'chave de veículo':'chaves de veículo'}</span></div>`:''}</div>${lead('Use, descarte ou compre o que a casa vende.')}`:lead('Carregando a mochila…');},
      run:()=>host.act('inventory')},
    {id:'admin',label:'Administração',icon:'shield',kind:'window',tone:'gold',hidden:()=>!host.admin(),detail:()=>lead('O console da casa: mundo ao vivo, economia, veículos, conquistas e moderação.'),run:()=>host.act('admin')},
    {id:'leave',label:'Voltar à entrada',icon:'door',kind:'confirm',tone:'danger',detail:()=>lead('Sai do bar e volta à tela de entrada. Sua conta continua conectada.'),run:()=>host.act('leave')},
    {id:'logout',label:'Sair da conta',icon:'logOut',kind:'confirm',tone:'danger',detail:()=>lead('Sai do bar e da conta neste navegador.'),run:()=>host.act('logout')},
  ];
}

// ---- Galera: people, talking and the phone.
function crowd(host:MenuContentHost):MenuEntry[] {
  return [
    {id:'people',label:'Pessoas no bar',icon:'users',kind:'window',state:()=>{const w=host.world();return w?`${w.occupancy} / ${w.capacity}`:undefined;},
      detail:()=>{
        const w=host.world(),me=host.user()?.id,others=Object.values(w?.players??{}).filter(p=>p.id!==me).sort((a,b)=>Number(b.connected!==false)-Number(a.connected!==false)),net=host.net();
        const shown=others.slice(0,8);
        const list=shown.length?`<ul class="pm-people">${shown.map(p=>`<li><span style="--avatar:${e(p.color)}">${e(p.displayName.slice(0,1))}</span>${p.level?rankIcon(p.level,18):''}<b>${e(p.displayName)}</b><small>${p.connected===false?'Ausente':p.voice?'Microfone ligado':'No bar'}</small></li>`).join('')}</ul>${others.length>shown.length?`<p class="pm-note">E mais ${others.length-shown.length} por perto.</p>`:''}`
          :'<p class="pm-empty">Por enquanto, só você por aqui.</p>';
        const occupancy=w?`<div class="pm-progress" style="--p:${w.capacity?(w.occupancy/w.capacity).toFixed(3):0}"><div><span><b>${w.occupancy}</b> de ${w.capacity} no bar</span><span>Por perto de você</span></div><i></i></div>`:'';
        return `${occupancy}${list}<div class="pm-net"><span>${uiIcon('signal')}Conexão <b data-live="net">${e(net.status)}</b></span><span>${uiIcon('activity')}Ping <b data-live="ping">${e(net.ping)}</b></span></div>`;
      },
      live:pane=>{const net=host.net();for(const [name,value] of [['net',net.status],['ping',net.ping]] as const){const node=pane.querySelector(`[data-live="${name}"]`);if(node&&node.textContent!==value)node.textContent=value;}},
      run:()=>host.act('people')},
    {id:'chat',label:'Conversar',icon:'chat',key:'T',kind:'action',verb:'Abrir',dot:()=>host.chatUnread(),detail:()=>lead(`Texto para quem está a até ${CHAT_RADIUS} metros de você.`),run:()=>host.act('chat')},
    {id:'phone',label:'Celular',icon:'smartphone',key:'K',kind:'action',verb:'Abrir',detail:()=>lead('Ligações, Highzap, Highgram, câmera, HighBank, Highfood e mapas.'),run:()=>host.act('phone')},
    {id:'map',label:'Mapa da cidade',icon:'map',kind:'action',verb:'Abrir',detail:()=>lead('A cidade inteira, com GPS: toque num lugar e siga a linha.'),run:()=>host.act('map')},
    {id:'mic',label:'Microfone',icon:'mic',key:'M',kind:'switch',on:()=>host.mic().on,toggle:()=>host.toggleMic(),blocked:()=>host.mic().unavailable||undefined,
      detail:()=>`${lead(`Quem está a até ${VOICE.maxDistance} metros ouve você, mais alto quanto mais perto.${host.settings.get().voiceMode==='ptt'?` Segure ${host.user()?.role==='admin'?'Alt+B':'B'} para falar.`:''}`)}<div class="mic-meter" role="presentation"><i id="mic-meter-fill"></i></div>`},
    {id:'voices',label:'Ouvir vozes',icon:'headphones',kind:'switch',on:()=>host.settings.get().voicesEnabled,toggle:()=>host.settings.update({voicesEnabled:!host.settings.get().voicesEnabled}),
      detail:()=>lead('Desligado, você não ouve ninguém por voz. O seu microfone continua como está.')},
    {id:'chat-panel',label:'Chat na tela',icon:'eye',kind:'switch',on:()=>!host.panels.hidden('chat'),toggle:()=>host.panels.setHidden('chat',!host.panels.hidden('chat')),
      detail:()=>lead('Escondido, T abre o chat do mesmo jeito.')},
  ];
}

// ---- Ajustes: the game's settings, a page per subject. The controls carry the data-setting names main.ts applies.
function settingsPages(host:MenuContentHost):MenuEntry[] {
  const s=()=>host.settings.get();
  // Steps of 5%: a bar of 20 segments, one per press (Shift: five).
  const volume=(key:string,name:string,value:number,scale=100)=>rangeRow(name,`data-setting="${key}"`,Math.round(value*100),pct(value,scale),{step:5});
  const feel=(name:keyof CameraFeel,label:string,min:number,max:number)=>{const value=s().cameraFeel[name];return rangeRow(label,`data-setting="cameraFeel.${name}"`,Math.round(value*100),feelLabel(name,value),{min:Math.round(min*100),max:Math.round(max*100),step:5});};
  return [
    {id:'sound',label:'Som',icon:'volume',kind:'page',detail:()=>
      switchRow('Som da casa','data-pm-act="sound"',host.soundOn(),{note:'Música ambiente, jukebox e TVs'})
      +volume('master','Geral',s().master)+volume('music','Ambiente',s().music)+volume('jukebox','Jukebox',host.jukeboxVolume())+volume('television','TVs',host.televisionVolume())+volume('voice','Vozes',s().voice)+volume('ui','Sons do menu',s().ui),
      acts:{sound:()=>host.toggleSound()}},
    {id:'graphics',label:'Imagem',icon:'image',kind:'page',detail:()=>{
      const g=s().graphics;
      return choiceRow('Qualidade','data-setting="graphics.preset"',(['low','medium','high','ultra','custom'] as const).map(p=>[p,PRESET_LABELS[p]] as const),g.preset)
        +rangeRow('Resolução','data-setting="graphics.renderScale"',Math.round(g.renderScale*100),pct(g.renderScale),{min:50,max:100,step:5})
        +choiceRow('Sombras','data-setting="graphics.shadows"',[['off','Desligadas'],['low','Baixas'],['medium','Médias'],['high','Altas'],['ultra','Ultra']],g.shadows)
        +choiceRow('Névoa','data-setting="graphics.fog"',[['light','Leve'],['normal','Normal'],['dense','Densa']],g.fog,{note:'Densa pesa menos; leve vê mais longe'})
        +choiceRow('Detalhe da cidade','data-setting="graphics.city"',[['low','Baixo'],['medium','Médio'],['high','Alto'],['ultra','Ultra']],g.city)
        +choiceRow('Limite de FPS','data-setting="graphics.fpsCap"',[[0,'Sem limite'],[30,'30'],[60,'60'],[120,'120']],g.fpsCap)
        +choiceRow('Nitidez em telas densas','data-setting="graphics.pixelRatioCap"',[[1,'1×'],[1.5,'1,5×'],[2,'2×']],g.pixelRatioCap,{note:'1× é o mais rápido'})
        +switchRow('Resolução dinâmica','data-setting="graphics.dynamicResolution"',g.dynamicResolution,{note:'Baixa a resolução quando o FPS cai'})
        +'<p class="pm-note" id="graphics-status"></p>';
    },live:pane=>{const now=host.graphicsNow(),node=pane.querySelector('#graphics-status');if(!node||!now)return;const value=`Agora: ${now.fps} FPS, com ${Math.round(now.currentScale*100)}% da resolução.`;if(node.textContent!==value)node.textContent=value;}},
    {id:'camera',label:'Câmera',icon:'eye',kind:'page',detail:()=>
      choiceRow('Visão','data-setting="camera"',CAMERA_MODES.map(mode=>[mode,CAMERA_LABELS[mode]] as const),s().camera)
      +choiceRow('Zoom','data-setting="cameraDistance"',CAMERA_ZOOMS.map((zoom,i)=>[zoom,CAMERA_ZOOM_LABELS[i]!] as const),s().cameraDistance)
      +feel('height','Altura',-CAMERA_HEIGHT_LIMIT,CAMERA_HEIGHT_LIMIT)+feel('sensitivity','Sensibilidade do mouse',CAMERA_SENSITIVITY_LIMITS[0],CAMERA_SENSITIVITY_LIMITS[1])+feel('smoothing','Suavização',0,1)},
    // Admins see it even with /armas off, to tune the weapon camera before testing.
    {id:'armas',label:'Armas e mira',icon:'crosshair',kind:'page',hidden:()=>!host.armsOn()&&!host.admin(),detail:()=>aimSettingsPage(s(),host.touch())},
    {id:'voice',label:'Voz',icon:'mic',kind:'page',detail:()=>{
      const current=s(),mic=host.mic(),open=current.voiceMode==='open',threshold=current.sensitivity*40/60*100;
      return switchRow('Microfone','data-setting="micEnabled"',mic.on,{disabled:!!mic.unavailable,note:mic.unavailable||'Atalho: M'})
        +switchRow('Ouvir outras pessoas','data-setting="voicesEnabled"',current.voicesEnabled)
        +choiceRow('Quando transmitir','data-setting="voiceMode"',[['open','Ao detectar voz'],['ptt',`Segurando ${host.user()?.role==='admin'?'Alt+B':'B'}`]],current.voiceMode)
        +rangeRow('Sensibilidade','data-setting="sensitivity"',Math.round(current.sensitivity*100),pct(current.sensitivity),{step:5,disabled:!open,note:'Maior, só a fala alta passa'})
        +rangeRow('Volume do microfone','data-setting="mic"',Math.round(current.mic*100),pct(current.mic,200),{step:5})
        +`<div class="mic-meter" role="presentation"><i id="mic-meter-fill"></i>${open?`<b style="left:${threshold.toFixed(1)}%" title="Acima desta marca, sua voz é transmitida"></b>`:''}</div><p id="voice-status" class="pm-note" role="status">${e(mic.status)}</p>`
        +choiceRow('Dispositivo','data-setting="inputDevice"',[['','Padrão do sistema']],'',{id:'voice-device'})
        +noteRow(`Quem está a até ${VOICE.maxDistance} metros ouve você. A voz passa pelo servidor do bar e não é gravada.`);
    },live:pane=>{
      const select=pane.querySelector<HTMLSelectElement>('#voice-device');
      if(select&&!select.dataset.filled){select.dataset.filled='1';void host.inputDevices().then(devices=>{
        for(const device of devices){const option=document.createElement('option');option.value=device.id;option.textContent=device.label;select.append(option);}
        const wanted=host.settings.get().inputDevice;select.value=[...select.options].some(o=>o.value===wanted)?wanted:'';
      });}
    }},
    {id:'interface',label:'Interface',icon:'panels',kind:'page',detail:()=>{
      const fs=host.fullscreen(),p=host.panels;
      return switchRow('Tela cheia','data-pm-act="fullscreen"',fs.on,{note:fs.browser&&fs.on?'É a do navegador: F11 sai':'Prende o mouse no jogo; a rodinha solta'})
        +switchRow('Chat na tela','data-pm-act="chat"',!p.hidden('chat'),{note:'Escondido, T abre do mesmo jeito'})
        +(p.available('job')?switchRow('Painel do turno','data-pm-act="job"',!p.hidden('job')):'')
        +switchRow('Travar painéis','data-pm-act="lock"',p.locked(),{note:'Ninguém arrasta o chat sem querer'})
        +buttonRow('Posição dos painéis','data-pm-act="reset"','Restaurar','reset');
    },acts:{
      fullscreen:()=>host.toggleFullscreen(),
      chat:control=>host.panels.setHidden('chat',!(control as HTMLInputElement).checked),
      job:control=>host.panels.setHidden('job',!(control as HTMLInputElement).checked),
      lock:()=>host.panels.toggleLock(),
      reset:()=>host.panels.reset(),
    }},
    {id:'touch',label:'Controles de toque',icon:'smartphone',kind:'page',detail:()=>
      choiceRow('Controles na tela','data-setting="touchUi"',[['auto','Automático'],['on','Sempre ligados'],['off','Desligados']],touchPreference(),{note:'Automático liga em celulares e tablets'})},
    {id:'vr',label:'Realidade virtual',icon:'glasses',kind:'page',detail:()=>{
      const vr=vrSettings(),active=host.vrActive();
      return switchRow('Jogar com óculos VR','data-setting="vr.enabled"',vr.enabled,{note:'Meta Quest 2, no navegador dos óculos, por https'})
        +'<p class="pm-note" id="vr-status">Verificando os óculos…</p>'
        +buttonRow(active?'Sair do VR':'Entrar no VR','data-action="vr"',active?'Sair':'Entrar','glasses')
        +choiceRow('Girar com o direcional direito','data-setting="vr.turn"',[['snap','Em passos'],['smooth','Suave']],vr.turn,{note:'Em passos enjoa menos'})
        +choiceRow('Tamanho do passo','data-setting="vr.snapDegrees"',[[15,'15°'],[30,'30°'],[45,'45°']],vr.snapDegrees)
        +switchRow('Gráficos leves','data-setting="vr.light"',vr.lightGraphics,{note:'Preset Baixo enquanto estiver de óculos'})
        +switchRow('Anel de conforto','data-setting="vr.comfort"',vr.comfort,{note:'Escurece as bordas ao andar ou girar'})
        +rangeRow('Resolução do VR','data-setting="vr.resolution"',Math.round(vr.resolution*100),pct(vr.resolution),{min:50,max:100,step:5})
        +groupRow('Diagnóstico')
        +buttonRow('Log do VR','data-action="vr-log-copy"','Copiar','copy')
        +buttonRow('Arquivo do log','data-action="vr-log-save"','Baixar','download')
        +buttonRow('Apagar o log','data-action="vr-log-clear"','Limpar','trash');
    },live:pane=>{const node=pane.querySelector<HTMLElement>('#vr-status');if(node&&!node.dataset.asked){node.dataset.asked='1';void host.vrStatus().then(text=>{node.textContent=text;});}}},
  ];
}

// ---- Guia: how the house works, and the keys.
const guide=():Array<{id:string;label:string;icon:string;html:()=>string}>=>[
  {id:'g-coins',label:'Moedas e trabalho',icon:'coins',html:()=>text(
    'Trabalhe no bar (J) para ganhar moedas. Durante o turno, o painel Turno mostra a tarefa e o marcador verde leva até ela. Quem está sentado pode pedir para você: pegue o pedido no balcão e leve até a mesa. As mesas só aparecem para limpar quando têm o que recolher.',
    'Gaste com bebidas no balcão, pedidos na mesa, músicas na jukebox e vídeos nas TVs e no telão do palco. Pedido cancelado volta para a carteira.',
    'A gelada do Magrão e o que você come ou bebe da mochila ficam na mão: dá para andar enquanto isso. Uma coisa por vez na mão; na mesa, o pedido inteiro de uma vez. Cada coisa vira um ícone com um anel que esvazia.')},
  {id:'g-table',label:'Pedido na mesa',icon:'food',html:()=>text(
    'Sentado, aperte P e escolha até quatro itens. Você fica na mesa até o pedido chegar; dá para cancelar enquanto ele ainda está no balcão.',
    'Na mesa, cada coisa dura alguns minutos e faz efeito aos poucos. O que sobrar fica na mesa até alguém recolher: quem estiver trabalhando ou, sem ninguém no turno, o Tonico.')},
  {id:'g-shop',label:'Loja da casa',icon:'store',html:()=>text('No quintal, pise no anel dourado e aperte E para comprar bebidas, comidas e curativos. O que você compra vai para a mochila.')},
  {id:'g-stage',label:'Palco do quintal',icon:'micVocal',html:()=>text(
    `Só sobe no palco quem tem ingresso: ${price('stage:pass')} moedas, vale 30 minutos. Siga o marcador magenta até o pé da escada e aperte E. O telão é à parte: encoste na frente do palco e aperte E (${price('media:telao')} moedas por vídeo).`,
    'Lá em cima, chegue perto do violão, do cavaquinho, da bateria ou do microfone e aperte E para tocar. E de novo guarda o instrumento. Cada lugar tem um músico por vez.')},
  {id:'g-phone',label:'Celular',icon:'smartphone',html:()=>text(
    'K tira o celular do bolso (Esc guarda) e dá para andar com ele na mão. No Telefone, ligue para quem está no bar ou para um número da agenda: a voz chega de qualquer canto.',
    'No Highzap você conversa por mensagem, no Highgram publica as fotos da Câmera (tem selfie) e no HighBank manda Pix de moedas. Fotos, notas e ajustes ficam neste navegador.')},
  {id:'g-blackjack',label:'Blackjack',icon:'cards',html:()=>text(
    'Suba ao salão de jogos, chegue perto da mesa e aperte E. Monte a aposta com as fichas e confirme em Apostar: a primeira aposta abre a rodada para a mesa toda.',
    'Chegue o mais perto possível de 21 sem passar. O ás vale 1 ou 11; figuras valem 10. Na sua vez: Pedir (1), Parar (2), Dobrar (3), Dividir (4) ou Desistir (5). Blackjack paga 3 para 2; com um ás do dealer à mostra, dá para fazer seguro. O dealer para em 17.',
    `Apostas de ${price('blackjack:min-bet')} a ${price('blackjack:max-bet')} moedas por mão. O ícone de ajuda da mesa mostra todas as regras.`)},
  {id:'g-foosball',label:'Pebolim',icon:'ball',html:()=>text(
    'As duas mesas ficam no salão de jogos, no andar de cima. Encoste numa e aperte E para pegar um lugar; mesa cheia ou com partida rolando, você assiste.',
    `Quem abre a mesa escolhe 1 × 1 ou 2 × 2, quantos gols, um set ou melhor de 3, e pode chamar o Zé do Totó para as vagas ou marcar a partida valendo moedas (${price('foosball:min-bet')} a ${price('foosball:max-bet')} por jogador; quem vence leva o dobro).`,
    'Os bonecos seguem o mouse (ou o dedo); clique ou Espaço chuta, segurar carrega a bomba; botão direito ou Shift levanta os bonecos. Posse: 10 s no meio e 15 s nas outras linhas. Sair de uma partida valendo é W.O.')},
  {id:'g-pool',label:'Sinuca',icon:'pool',html:()=>text(
    'Três mesas no salão de jogos. Encoste numa e aperte E; com partida rolando, você assiste. Jogue contra outra pessoa ou chame o Juca da Sinuca (iniciante, na média ou matador).',
    'Regras da bola 8 da Noel Snooker: a moeda decide a saída e a primeira bola encaçapada define lisas e listradas. Mire com o mouse, segure o botão esquerdo para encher a força e solte; o direito cancela e a roda faz o ajuste fino. Efeito e inclinação do taco ficam embaixo da mesa.')},
  {id:'g-events',label:'Imprevistos',icon:'party',html:()=>text('Apagões, festa e um frequentador inconveniente aparecem durante a noite. Sua partida continua valendo.')},
];
function guideEntries(host:MenuContentHost):MenuEntry[] {
  const topics:MenuEntry[]=guide().map(topic=>({id:topic.id,label:topic.label,icon:topic.icon,kind:'info',group:'Como funciona',detail:topic.html}));
  const keys:MenuEntry[]=[
    ...(host.touch()?[{id:'k-touch',label:'Na tela de toque',icon:'smartphone',kind:'info' as const,group:'Teclas',detail:()=>keyGrid(TOUCH_KEYS)}]:[]),
    ...CONTROLS.map((group,i)=>({id:`k-${i}`,label:group.label,icon:group.icon,kind:'info' as const,group:'Teclas',detail:()=>keyGrid(group.keys)})),
    {id:'k-armas',label:'Controles das armas',icon:'gun',kind:'info',group:'Teclas',hidden:()=>!host.armsOn(),detail:()=>{
      const guide=weaponGuide(host.settings.get().weaponKeys);
      const parts=[['Teclado e mouse',guide.teclado],['Controle',guide.controle],['Toque',guide.toque]] as const;
      return (host.touch()?[parts[2],parts[0],parts[1]]:parts).map(([title,keys])=>groupRow(title)+keyGrid(keys)).join('');
    }},
  ];
  return [...topics,...keys];
}

export function menuTabs(host:MenuContentHost):MenuTab[] {
  return [
    {id:'acoes',label:'Ações',icon:'sparkles',entries:actions(host)},
    {id:'voce',label:'Você',icon:'user',entries:you(host)},
    {id:'galera',label:'Galera',icon:'users',entries:crowd(host)},
    {id:'ajustes',label:'Ajustes',icon:'sliders',entries:settingsPages(host)},
    {id:'guia',label:'Guia',icon:'help',entries:guideEntries(host)},
  ];
}
