import {formatPhoneNumber,type PlayerCard} from '@bar/shared';
import {escape as e} from './api';
import {uiIcon} from './ui-icons';

/**
 * The player card (click someone in the bar, or Ficha in Pessoas no bar): their phone number to save, which is how a
 * number reaches the agenda, Highzap and Pix, and their Highgram. Your own card shows the number others will see.
 */
export function playerCardHtml(card:PlayerCard):string {
  const gram=card.gram,photo=gram.author.photo;
  const picture=photo?`<img src="/api/phone/gram/avatars/${encodeURIComponent(card.id)}?v=${photo}" alt="">`:e(card.name.slice(0,1).toUpperCase());
  const follow=gram.followed?'Seguindo no Highgram':gram.followsYou?'Seguir de volta':'Seguir no Highgram';
  const actions=card.mine
    ?`<button class="button secondary" data-action="card-copy" data-number="${e(card.number)}">${uiIcon('copy')} Copiar número</button><button class="button primary" data-action="card-edit">${uiIcon('pencil')} Editar perfil</button>`
    :`${card.saved?`<button class="button secondary" disabled>${uiIcon('userCheck')} Na sua agenda</button>`:`<button class="button primary" data-action="card-save" data-id="${e(card.id)}">${uiIcon('userPlus')} Salvar contato</button>`}
      <button class="button ${gram.followed?'secondary':'primary'}" data-action="card-follow" data-id="${e(card.id)}" data-on="${!gram.followed}" aria-pressed="${gram.followed}">${uiIcon(gram.followed?'userCheck':'gram')} ${follow}</button>
      <button class="button secondary" data-action="card-gram" data-id="${e(card.id)}">${uiIcon('gram')} Ver Highgram</button>
      ${card.saved?`<button class="button secondary" data-action="card-zap" data-id="${e(card.id)}">${uiIcon('messageCircle')} Mensagem</button><button class="button secondary" data-action="card-call" data-id="${e(card.id)}">${uiIcon('phone')} Ligar</button>`:''}`;
  return `<div class="account-card player-card"><span class="profile-initial${photo?' has-photo':''}" style="--avatar:${e(card.color)}">${picture}</span><h3>${e(card.name)}</h3>
    <p>@${e(gram.author.handle)}${gram.author.name!==card.name?` · ${e(gram.author.name)}`:''}${!card.mine&&gram.followsYou?' · segue você':''}</p>${gram.bio?`<p class="card-bio">${e(gram.bio)}</p>`:''}</div>
    <div class="statistics card-stats"><div><b>${gram.posts}</b><span>fotos</span></div><div><b>${gram.followers}</b><span>seguidores</span></div><div><b>${gram.following}</b><span>seguindo</span></div></div>
    <div class="status-row card-line"><span>${uiIcon('smartphone')} Celular</span><b class="card-number">${e(formatPhoneNumber(card.number))}</b></div>
    <div class="card-actions">${actions}</div>
    <p class="fine-print">${card.mine?'Quem clicar em você no bar vê esta ficha e pode salvar seu número.':'Com o número salvo, a pessoa aparece no Highzap, no Telefone e no Pix do HighBank.'}</p>`;
}
