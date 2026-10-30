import {CHAT_RADIUS} from '@bar/shared';
import {uiIcon as icon} from './ui-icons';
import {needsMarkup,faintMarkup} from './needs-hud';
import {lobbyPanels} from './lobby-menu';
import {lobbyBubbles,lobbyHero} from './lobby-hero';
// The player's own state is not a panel: its meters sit in the bottom-right corner (.status-hud). The actions are a hotbar
// panel, one row of icons along the bottom (wrapped in two on narrow screens).
export const HUD_PANELS=[
  {id:'actions',title:'Ações',icon:'sparkles',width:560},
  {id:'chat',title:'Papo no Balcão',icon:'chat',width:320},
  // Only during a shift (hud-panels setAvailable); it can be hidden and shown again from the Turno button on top.
  {id:'job',title:'Turno',icon:'briefcase',width:290,contextual:true},
] as const;
export type PanelId=typeof HUD_PANELS[number]['id'];
/** A panel as the reference's detail card: title and pink icon on top, content, and an optional mono footer. */
function panel(id:PanelId,content:string,heading='',foot=''):string{
  const p=HUD_PANELS.find(p=>p.id===id)!;
  return `<section class="hud-panel" data-panel="${id}" aria-label="${p.title}"><header class="panel-heading" tabindex="0" aria-label="Mover painel ${p.title}" aria-describedby="panel-instructions"><span class="panel-grip">${icon('grip')}</span><h2>${p.title}</h2>${heading}${icon(p.icon)}<button type="button" ${id==='chat'?'id="chat-toggle" data-action="chat-toggle"':'data-hud-collapse="'+id+'"'} aria-label="${id==='chat'?'Recolher chat':'Recolher '+p.title}" aria-expanded="true" aria-controls="${id}-body">${icon('chevron')}</button></header><div class="hud-content" id="${id}-body">${content}${foot?`<footer class="panel-foot">${foot}</footer>`:''}</div></section>`;
}
/** The reference's backdrop: vaporwave sky, perspective grid, blurred sun and scanlines. */
const neonBackdrop='<div class="horizon" aria-hidden="true"></div><div class="sun" aria-hidden="true"></div><div class="scanlines" aria-hidden="true"></div>';
const keyHints=(hints:Array<[string,string]>)=>`<footer class="key-hints">${hints.map(([key,label])=>`<span><kbd>${key}</kbd>${label}</span>`).join('')}</footer>`;
export function gameUi():string{return `
  <canvas id="world" aria-label="Cenário tridimensional do B.A.R."></canvas><div id="labels" aria-hidden="true"></div><div class="vignette"></div>
  <main id="lobby" class="lobby neon-stage">${neonBackdrop}${lobbyBubbles()}
    <div class="lobby-layout"><div class="lobby-main">
    <header class="menu-header"><div><p class="eyebrow">O seu bar · A sua galera</p><h1 class="menu-title">Highland Bar</h1></div>
      <div class="money-panel"><p class="cash">${icon('signal')} Aberto pra resenha</p><p>${icon('users')} Sem instalação · só chegar</p></div></header>
    <section class="menu-section" aria-label="Entrada">
      <nav class="menu-tabs" role="tablist" aria-label="Seções da entrada"><button role="tab" id="lobby-tab-account" data-lobby-tab="account" aria-selected="true" aria-controls="lobby-account">Conta</button><button role="tab" id="lobby-tab-bar" data-lobby-tab="bar" aria-selected="false" aria-controls="lobby-bar" tabindex="-1">O Bar</button><button role="tab" id="lobby-tab-controls" data-lobby-tab="controls" aria-selected="false" aria-controls="lobby-controls" tabindex="-1">Controles</button></nav>
      <div class="menu-line" aria-hidden="true"></div>
      <div class="menu-columns" id="lobby-account" role="tabpanel" aria-labelledby="lobby-tab-account"><nav class="menu-list" id="auth-list" aria-label="Acesso"></nav><section class="menu-detail entry-card" aria-label="Acesso à conta"><div id="auth-content"></div></section></div>
      ${lobbyPanels()}
    </section></div>
    ${lobbyHero()}</div>
    ${keyHints([['Tab','Navegar'],['Enter','Selecionar']])}${icon('crosshair').replace('class="ui-icon"','class="ui-icon crosshair"')}
  </main>
  <main id="game" class="game hidden" aria-label="Interface do bar">
    <header class="game-header"><h1 class="boteco-logo"><img src="/ui/logo-highland-hud.webp" alt="Highland Bar" width="128" height="128"></h1>
    <nav class="game-tools" aria-label="Ferramentas"><button class="hud-btn job-toggle hidden" data-hud-visible="job" title="Mostrar ou esconder o painel do turno" aria-label="Painel do turno" aria-pressed="true">${icon('briefcase')}<span class="tool-label">Turno</span></button><button class="hud-btn" data-hud-menu aria-label="Painéis" aria-expanded="false" aria-controls="panel-menu">${icon('panels')}<span class="tool-label">Painéis</span></button><button class="hud-btn" data-action="people" title="Pessoas no bar" aria-label="Pessoas no bar">${icon('users')}</button><button class="hud-btn" data-action="audio" id="audio-button" title="Ativar música" aria-label="Ativar música" aria-pressed="false">${icon('volume')}<i class="muted-mark"></i></button><span class="voice-tools" role="group" aria-label="Chat de voz"><button class="hud-btn voice-btn" data-action="voice-mic" id="voice-mic" title="Ligar microfone (M)" aria-label="Ligar microfone" aria-pressed="false"><span class="voice-icon">${icon('micOff')}</span><i class="voice-level" aria-hidden="true"></i></button><button class="hud-btn voice-btn" data-action="voice-listen" id="voice-listen" title="Silenciar vozes" aria-label="Silenciar vozes" aria-pressed="true"><span class="voice-icon">${icon('headphones')}</span></button></span><button class="hud-btn" data-action="settings" title="Configurações" aria-label="Configurações">${icon('sliders')}</button><button class="hud-btn" data-action="help" title="Como jogar" aria-label="Como jogar">${icon('help')}</button><button class="hud-btn hidden" data-action="admin" id="admin-button" title="Administração" aria-label="Administração">${icon('shield')}</button></nav>
    <div class="money-panel hud-wallet" role="group" aria-label="Carteira"><p class="cash">${icon('wallet')}<b id="hud-balance">…</b></p></div>
    <div id="panel-menu" class="hud-panel panel-menu hidden" aria-label="Organizar painéis"><p class="eyebrow">Seu bar, do seu jeito</p><button data-fullscreen aria-pressed="false">${icon('maximize')}<span>Tela cheia</span></button><button data-hud-lock aria-label="Travar painéis" aria-pressed="false">${icon('unlock')}<span>Travar painéis</span></button>${HUD_PANELS.map(p=>`<button data-hud-visible="${p.id}" aria-pressed="true">${icon(p.icon)}<span>${p.title}</span>${icon('eye')}</button>`).join('')}<button class="hud-btn" data-hud-reset>${icon('reset')} Restaurar layout</button></div></header>
    <p id="panel-instructions" class="sr-only">Arraste o cabeçalho para mover. Com ele em foco, use as setas. As posições são salvas neste navegador.</p>
    <section class="status-hud" aria-label="Seu estado">${needsMarkup()}</section>
    ${panel('actions',`<nav class="action-bar" aria-label="Ações do personagem"><button class="hud-btn" data-action="interact">${icon('sparkles')}<span class="tip">Interagir</span><kbd>E</kbd></button><button class="hud-btn" data-action="drink">${icon('beer')}<span class="tip">Pedir gelada <small>no balcão</small></span><kbd>E</kbd></button><button class="hud-btn" data-action="table-menu">${icon('food')}<span class="tip">Pedir na mesa <small>sentado</small></span><kbd>P</kbd></button><button class="hud-btn" data-action="dance" id="dance-button" aria-pressed="false">${icon('music')}<span class="tip">Dançar</span><kbd>G</kbd></button><button class="hud-btn" data-action="wave">${icon('hand')}<span class="tip">Acenar</span><kbd>V</kbd></button><button class="hud-btn" data-action="smoke" id="smoke-button" aria-pressed="false">${icon('smoke')}<span class="tip">Fumar</span><kbd>F</kbd></button><button class="hud-btn" data-action="cigarette" id="cigarette-button" aria-pressed="false">${icon('flame')}<span class="tip">Um cigarro <small>inteiro</small></span><kbd>⇧F</kbd></button><button class="hud-btn" data-action="chat">${icon('chat')}<span class="tip">Resenhar</span><kbd>T</kbd></button><button class="hud-btn" data-action="phone">${icon('smartphone')}<span class="tip">Celular</span><kbd>K</kbd></button><button class="hud-btn" data-action="inventory">${icon('bag')}<span class="tip">Mochila</span><kbd>I</kbd></button><button class="hud-btn" data-action="skins">${icon('shirt')}<span class="tip">Meu visual</span><kbd>C</kbd></button><button class="hud-btn" data-action="jobs">${icon('briefcase')}<span class="tip">Trabalhar</span><kbd>J</kbd></button><button class="hud-btn hidden" data-action="kick" id="kick-button">${icon('kick')}<span class="tip">Karatê <small>só o Rafael</small></span><kbd>X</kbd></button></nav>`)}
    ${panel('chat',`<div id="messages" class="messages" role="log" aria-label="Mensagens por proximidade"></div><form id="chat-form"><input id="chat-input" name="message" autocomplete="off" maxlength="240" placeholder="Fala aí…" aria-label="Mensagem por proximidade"><button class="hud-btn" type="submit" aria-label="Enviar mensagem">${icon('send')}</button></form>`,'',`<span>${icon('signal')} Papo por perto</span><span>até ${CHAT_RADIUS} m</span>`)}
    ${panel('job','',`<small class="panel-summary" id="job-summary"></small><button type="button" data-hud-hide="job" aria-label="Esconder painel do turno" title="Esconder · o botão Turno, no topo, mostra de novo">${icon('eyeOff')}</button>`)}
    ${faintMarkup()}<div id="event-banner" class="event-banner hidden" role="status"></div><div id="connection" class="connection hidden" role="status"></div>
    <canvas id="job-blip" class="job-blip" hidden aria-hidden="true"></canvas><canvas id="stage-blip" class="job-blip" hidden aria-hidden="true"></canvas><canvas id="telao-blip" class="job-blip" hidden aria-hidden="true"></canvas><canvas id="shop-blip" class="job-blip" hidden aria-hidden="true"></canvas><canvas id="desk-blip" class="job-blip" hidden aria-hidden="true"></canvas>
    <div class="prompts"><section id="consuming" class="consuming hidden" aria-label="Consumindo"></section><div class="prompt-row"><button id="table-cta" data-action="table-menu" class="context table-cta hidden"><kbd>P</kbd><span><small>Na mesa</small><b id="table-cta-label">Pedir ao Tonico</b></span></button><button id="context" data-action="interact" class="context hidden"><kbd>E</kbd><span><small>Chega mais</small><b id="context-label"></b></span></button></div></div>
    <section id="blackjack" class="blackjack hud-panel hidden" aria-label="Mesa de blackjack"></section>
    <div id="waiting" class="waiting neon-stage hidden">${neonBackdrop}<div class="waiting-card"><img class="waiting-logo" src="/ui/logo-highland.webp" alt="" width="720" height="720"><p class="eyebrow">Highland Bar</p><h2>Já estamos abrindo a porta.</h2><span class="loader" aria-hidden="true"></span><p id="waiting-message"></p><button data-action="leave" class="button secondary">Voltar à entrada</button></div></div>
  </main>
  <div id="modal" class="modal-backdrop hidden"><section class="modal hud-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title"></h2><button data-action="close-modal" aria-label="Fechar janela">${icon('close')}</button></div><div class="menu-line" aria-hidden="true"></div><div id="modal-content"></div></section></div>
  <div id="toasts" class="toasts" aria-label="Notificações"></div>
  ${import.meta.env.DEV?`<button class="dev-mail" data-action="mail">${icon('mail')} Caixa de e-mail local</button>`:''}
`;}
