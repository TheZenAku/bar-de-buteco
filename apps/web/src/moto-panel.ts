import {MOTO_ENGINE,MOTO_PARTS,MOTO_REPAIR,MOTO_STATUS_LABELS,motoPartStatus,readMotoParts,type MotoPartId,type MotoState} from '@bar/shared';
import {escape as e} from './api';
import {plateHtml} from './garage-panel';
import {uiIcon} from './ui-icons';

/** What the panel shows at this moment; nothing here is drawn from anything but the room's bike and the player's backpack. */
export interface MotoPanelView {
  moto:MotoState;selected:MotoPartId;pieces:number;
  /** This player holds the key. */
  keyHolder:boolean;
  /** Why the chosen part cannot be fixed right now ('' when it can). */
  blocked:string;
  /** The part this player is working on, and how long ago that started (ms). */
  working?:{part:MotoPartId;motoId:string;elapsed:number}|undefined;
}
/** The bike seen from above, nose up: every part a shape of its own, painted by its condition (panel's CSS). */
const OUTLINE=`<svg class="moto-plan" viewBox="0 0 200 420" role="img" aria-label="A moto vista de cima">
  <rect data-part="bau" x="62" y="302" width="76" height="84" rx="6"/>
  <rect data-part="lanterna" x="72" y="388" width="56" height="12" rx="3"/>
  <rect data-part="pneu_traseiro" x="89" y="238" width="22" height="96" rx="9"/>
  <path data-part="carenagem" d="M70 150 Q70 118 86 104 L114 104 Q130 118 130 150 L136 290 Q100 304 64 290 Z"/>
  <rect data-part="motor" x="80" y="214" width="40" height="48" rx="6"/>
  <rect data-part="bateria" x="84" y="172" width="32" height="30" rx="4"/>
  <path data-part="escapamento" d="M126 236 L146 240 L150 322 L134 322 L130 262 Z"/>
  <rect data-part="pneu_dianteiro" x="89" y="24" width="22" height="86" rx="9"/>
  <rect data-part="suspensao" x="78" y="60" width="44" height="14" rx="4"/>
  <circle data-part="freios" cx="100" cy="94" r="14"/>
  <path data-part="direcao" d="M34 116 L166 116 L166 130 L114 130 L114 142 L86 142 L86 130 L34 130 Z"/>
  <path data-part="farol" d="M80 96 Q100 76 120 96 L120 108 L80 108 Z"/>
</svg>`;

const groups=[...new Set(MOTO_PARTS.map(part=>part.group))];
/** Hue from red at 0 to green at 100, like the condition list of a survival game's mechanics window. */
const hue=(condition:number)=>Math.round(condition*1.25);
/**
 * The vehicle's panel (right click on a bike, Informações do veículo): every part and its condition on the left, the bike seen from above with
 * each part painted by how it is, and the chosen part's card: what its state means and fixing it. Anyone can open it for any bike.
 */
export function motoPanelHtml({moto,selected,pieces,blocked,working,keyHolder}:MotoPanelView):string {
  const parts=readMotoParts(moto.parts),part=MOTO_PARTS.find(each=>each.id===selected)!,condition=parts[selected],status=motoPartStatus(condition);
  const overall=Math.round(MOTO_PARTS.reduce((sum,each)=>sum+parts[each.id],0)/MOTO_PARTS.length);
  const engine=moto.engine===MOTO_ENGINE.ON?'Ligado':moto.engine===MOTO_ENGINE.CRANKING?'Dando partida':'Desligado';
  const here=working?.motoId===moto.id?working:undefined;
  const list=groups.map(group=>`<div class="moto-group"><h4>${e(group)}</h4>${MOTO_PARTS.filter(each=>each.group===group).map(each=>{
    const value=Math.round(parts[each.id]);
    return `<button type="button" class="moto-part" data-action="moto-part" data-part="${each.id}" aria-pressed="${each.id===selected}" style="--condition:${value}%;--hue:${hue(value)}"><span>${e(each.name)}</span><b>${value}%</b><i aria-hidden="true"></i></button>`;
  }).join('')}</div>`).join('');
  const action=here
    ?`<div class="moto-work" role="status"><span>${uiIcon('wrench')} Consertando: ${e(MOTO_PARTS.find(each=>each.id===here.part)!.name)}</span><div class="hud-track"><i class="moto-work-bar" style="animation-duration:${MOTO_REPAIR.ms}ms;animation-delay:-${Math.min(MOTO_REPAIR.ms,here.elapsed)}ms"></i></div></div>`
    :`<button class="button primary" data-action="moto-repair" data-part="${selected}" ${blocked?'disabled':''}>${uiIcon('wrench')} Consertar (+${MOTO_REPAIR.amount}%)</button>${blocked?`<p class="item-blocked">${e(blocked)}</p>`:''}`;
  const owner=moto.ownerId?`De <b>${e(moto.ownerName||'outro jogador')}</b>`:'Moto do bar: qualquer um pode subir';
  return `<div class="moto-panel" data-moto="${e(moto.id)}">
    <div class="moto-owner">${moto.plate?plateHtml(moto.plate):''}<span>${owner}</span>${moto.ownerId?`<span data-moto-lock>${uiIcon(moto.locked?'lock':'unlock')} ${moto.locked?'Trancada':'Destrancada'}</span>`:''}${keyHolder?`<button type="button" class="button" data-action="moto-lock">${uiIcon(moto.locked?'unlock':'lock')}${moto.locked?'Destrancar':'Trancar'}<kbd>L</kbd></button>`:''}</div>
    <div class="moto-summary"><div><small>Estado geral</small><b data-moto-overall>${overall}%</b></div><div><small>Motor</small><b data-moto-engine>${engine}</b></div><div><small>Peças na mochila</small><b data-moto-pieces>${pieces}</b></div></div>
    <div class="moto-layout">
      <div class="moto-parts" role="group" aria-label="Partes da moto">${list}</div>
      <div class="moto-side">
        <div class="moto-drawing" style="${MOTO_PARTS.map(each=>`--${each.id}:${hue(parts[each.id])}`).join(';')}" data-selected="${selected}">${OUTLINE}</div>
        <section class="item-detail moto-detail" aria-label="${e(part.name)}">
          <header class="moto-detail-head"><div><small>${e(part.group)}</small><h3>${e(part.name)}</h3></div><strong style="--hue:${hue(condition)}">${Math.round(condition)}%</strong></header>
          <p><b class="moto-status" style="--hue:${hue(condition)}">${MOTO_STATUS_LABELS[status]}.</b> ${e(part[status])}</p>
          ${action}
          <p class="fine-print">Cada conserto usa ${MOTO_REPAIR.pieces} peça e leva ${(MOTO_REPAIR.ms/1000).toLocaleString('pt-BR')} s. Por enquanto a peça é genérica, vendida na loja da casa.</p>
        </section>
      </div>
    </div>
  </div>`;
}

