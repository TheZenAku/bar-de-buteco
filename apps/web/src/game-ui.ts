import {CHAT_RADIUS} from '@bar/shared';
import {uiIcon as icon} from './ui-icons';
import {needsMarkup,faintMarkup} from './needs-hud';
import {lobbyMore} from './lobby-menu';
import {lobbyBubbles,lobbyHero} from './lobby-hero';
// The player's own state is not a panel: its cores sit on the rim of the minimap (.status-hud), in the bottom-left corner. The actions are a hotbar panel, one row of icons along the bottom (wrapped in two on narrow screens).
export const HUD_PANELS=[
  {id:'actions',title:'Ações',icon:'sparkles',width:560},
  {id:'chat',title:'Papo no Balcão',icon:'chat',width:340},
  // Only during a shift (hud-panels setAvailable); it can be hidden and shown again from the Turno button on top.
  {id:'job',title:'Turno',icon:'briefcase',width:290,contextual:true},
] as const;
export type PanelId=typeof HUD_PANELS[number]['id'];
/**
 * A panel as the reference's detail card: title and pink icon on top, content, and an optional mono footer. The header
 * ends with the button that collapses it, or with `end` instead (the chat's, which hides it).
 */
function panel(id:PanelId,content:string,heading='',foot='',end?:string):string{
  const p=HUD_PANELS.find(p=>p.id===id)!;
  return `<section class="hud-panel" data-panel="${id}" aria-label="${p.title}"><header class="panel-heading" tabindex="0" aria-label="Mover painel ${p.title}" aria-describedby="panel-instructions"><span class="panel-grip">${icon('grip')}</span><h2>${p.title}</h2>${heading}${icon(p.icon)}${end??`<button type="button" data-hud-collapse="${id}" aria-label="Recolher ${p.title}" aria-expanded="true" aria-controls="${id}-body">${icon('chevron')}</button>`}</header><div class="hud-content" id="${id}-body">${content}${foot?`<footer class="panel-foot">${foot}</footer>`:''}</div></section>`;
}
/** The reference's backdrop: vaporwave sky, perspective grid, blurred sun and scanlines. */
const neonBackdrop='<div class="horizon" aria-hidden="true"></div><div class="sun" aria-hidden="true"></div><div class="scanlines" aria-hidden="true"></div>';
const keyHints=(hints:Array<[string,string]>)=>`<footer class="key-hints">${hints.map(([key,label])=>`<span><kbd>${key}</kbd>${label}</span>`).join('')}</footer>`;
export function gameUi():string{return `
  <canvas id="world" aria-label="Cenário tridimensional do B.A.R."></canvas><div id="labels" aria-hidden="true"></div><div class="vignette"></div>
  <main id="lobby" class="lobby neon-stage" data-stage="intro">${neonBackdrop}${lobbyBubbles()}
    <div class="lobby-cut" aria-hidden="true"></div><div class="lobby-fade" aria-hidden="true"></div>
    <h1 class="sr-only">Highland Bar</h1>
    <div class="lobby-center">
      <p class="lobby-status" id="lobby-status">${icon('signal')}<span>Aberto pra resenha</span></p>
      <section class="access-card" id="lobby-account" aria-label="Acesso à conta"><div id="auth-content"></div></section>
      ${lobbyMore()}
    </div>
    ${lobbyHero()}
    <section class="clicker" aria-label="Brinde da galera"><div class="clicker-score"><span>Brindes</span><b id="clicker-count">0</b><small id="clicker-rank"></small></div>
      <p class="clicker-combo" id="clicker-combo" aria-live="polite"></p>
      <button type="button" class="clicker-exit" data-clicker-exit>${icon('close')} Voltar à entrada <kbd>Esc</kbd></button></section>
    ${keyHints([['Tab','Navegar'],['Enter','Selecionar']])}${icon('crosshair').replace('class="ui-icon"','class="ui-icon crosshair"')}
  </main>
  <main id="game" class="game hidden" aria-label="Interface do bar">
    <header class="game-header"><h1 class="boteco-logo"><img src="/ui/logo-highland-hud.webp" alt="Highland Bar" width="128" height="128"></h1>
    <button type="button" class="hud-mic" id="voice-mic" data-action="voice-mic" aria-pressed="false" title="Desligar microfone (M)" aria-label="Desligar microfone">${icon('mic')}</button>
    <div class="lv-hud" id="level-hud" role="group" aria-label="Seu nível"></div><div class="money-panel hud-wallet" role="group" aria-label="Carteira"><p class="cash">${icon('wallet')}<b id="hud-balance">…</b></p></div><button type="button" class="hud-menu" data-action="menu" aria-label="Menu" title="Menu (Esc)">${icon('menu')}</button>
    </header>
    <p id="panel-instructions" class="sr-only">Arraste o cabeçalho para mover. Com ele em foco, use as setas. As posições são salvas neste navegador.</p>
    <section class="minimap" aria-label="Mapa"><div class="minimap-dial"><div class="minimap-bezel"><canvas id="minimap" aria-hidden="true"></canvas></div></div><p class="minimap-zone" id="minimap-zone"></p>
      <section class="status-hud" aria-label="Seu estado">${needsMarkup()}</section></section>
    ${panel('actions',`<nav class="action-bar" aria-label="Ações do personagem"><button class="hud-btn" data-action="interact">${icon('sparkles')}<span class="tip">Interagir</span><kbd>E</kbd></button><button class="hud-btn" data-action="drink">${icon('beer')}<span class="tip">Pedir gelada <small>no balcão</small></span><kbd>E</kbd></button><button class="hud-btn" data-action="table-menu">${icon('food')}<span class="tip">Pedir na mesa <small>sentado</small></span><kbd>P</kbd></button><button class="hud-btn" data-action="dance" id="dance-button" aria-pressed="false">${icon('music')}<span class="tip">Dançar</span><kbd>G</kbd></button><button class="hud-btn" data-action="wave">${icon('hand')}<span class="tip">Acenar</span><kbd>V</kbd></button><button class="hud-btn" data-action="smoke" id="smoke-button" aria-pressed="false">${icon('smoke')}<span class="tip">Fumar</span><kbd>F</kbd></button><button class="hud-btn" data-action="chat">${icon('chat')}<span class="tip">Resenhar</span><kbd>T</kbd></button><button class="hud-btn" data-action="phone">${icon('smartphone')}<span class="tip">Celular</span><kbd>K</kbd></button><button class="hud-btn" data-action="inventory">${icon('bag')}<span class="tip">Mochila</span><kbd>I</kbd></button><button class="hud-btn" data-action="skins">${icon('shirt')}<span class="tip">Coleção</span><kbd>C</kbd></button><button class="hud-btn" data-action="jobs">${icon('briefcase')}<span class="tip">Trabalhar</span><kbd>J</kbd></button><button class="hud-btn hidden" data-action="skill" id="skill-button"></button></nav>`)}
    ${panel('chat',`<div id="messages" class="messages" role="log" aria-label="Mensagens por proximidade" tabindex="-1"></div><form id="chat-form"><input id="chat-input" name="message" autocomplete="off" maxlength="240" placeholder="Fala aí…" aria-label="Mensagem por proximidade"><button class="hud-btn" type="submit" aria-label="Enviar mensagem">${icon('send')}</button></form>`,'',`<span>${icon('signal')} Papo por perto</span><span>até ${CHAT_RADIUS} m · Esc fecha</span>`,`<button type="button" data-hud-hide="chat" aria-label="Ocultar chat" title="Ocultar chat · T mostra de novo">${icon('eyeOff')}</button>`)}
    ${panel('job','',`<small class="panel-summary" id="job-summary"></small><button type="button" data-hud-hide="job" aria-label="Esconder painel do turno" title="Esconder · Esc › Ajustes › Interface mostra de novo">${icon('eyeOff')}</button>`)}
    ${faintMarkup()}<div id="event-banner" class="event-banner hidden" role="status"></div><div id="connection" class="connection hidden" role="status"></div>
    <canvas id="job-blip" class="job-blip" hidden aria-hidden="true"></canvas><canvas id="food-blip" class="job-blip" hidden aria-hidden="true"></canvas><canvas id="garage-blip" class="job-blip" hidden aria-hidden="true"></canvas><canvas id="stage-blip" class="job-blip" hidden aria-hidden="true"></canvas><canvas id="telao-blip" class="job-blip" hidden aria-hidden="true"></canvas><canvas id="shop-blip" class="job-blip" hidden aria-hidden="true"></canvas><canvas id="desk-blip" class="job-blip" hidden aria-hidden="true"></canvas>
    <div class="prompts"><section id="consuming" class="consuming hidden" aria-label="Consumindo"></section><div class="prompt-row"><button id="table-cta" data-action="table-menu" class="context table-cta hidden"><kbd>P</kbd><span><small>Na mesa</small><b id="table-cta-label">Pedir ao Tonico</b></span></button><button id="context" data-action="interact" class="context hidden"><kbd>E</kbd><span><small>Chega mais</small><b id="context-label"></b></span></button></div></div>
    <section id="firework-hud" class="firework-hud hidden" aria-label="Rojão equipado"><div class="firework-reticle" aria-hidden="true"></div><div class="firework-controls"><span><b>Rojão de festa · <span id="firework-count">0</span></b><small>Aponte a câmera · clique ou toque para soltar</small></span><button class="button primary" data-action="firework-fire">Soltar</button><button class="button secondary" data-action="firework-stow">Guardar <kbd>R</kbd></button></div></section>
    <section id="vehicle-hud" class="vehicle-hud hidden" aria-label="Painel do veículo"></section>
    <section id="blackjack" class="blackjack hud-panel hidden" aria-label="Mesa de blackjack"></section>
    <section id="truco" class="truco hud-panel hidden" aria-label="Mesa de truco"></section>
    <section id="foosball" class="foosball hud-panel hidden" aria-label="Mesa de pebolim"></section>
    <section id="pool" class="pool hud-panel hidden" aria-label="Mesa de sinuca"></section>
    <div id="waiting" class="waiting neon-stage hidden">${neonBackdrop}<div class="waiting-card"><img class="waiting-logo" src="/ui/logo-highland.webp" alt="" width="720" height="720"><p class="eyebrow">Highland Bar</p><h2>Já estamos abrindo a porta.</h2><span class="loader" aria-hidden="true"></span><p id="waiting-message"></p><button data-action="leave" class="button secondary">Voltar à entrada</button></div></div>
  </main>
  <div id="modal" class="modal-backdrop hidden"><section class="modal hud-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title"></h2><button data-action="close-modal" aria-label="Fechar janela">${icon('close')}</button></div><div class="menu-line" aria-hidden="true"></div><div id="modal-content"></div></section></div>
  <div id="toasts" class="toasts" aria-label="Notificações"></div>
  ${import.meta.env.DEV?`<button class="dev-mail" data-action="mail">${icon('mail')} Caixa de e-mail local</button>`:''}
`;}
