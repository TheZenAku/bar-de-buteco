import {MANILHA_NAMES,manilhaRank,rankText,type TrucoCard,type TrucoRank,type TrucoSuit} from '@bar/shared';

/** Strongest first, as the legend shows them. */
export const SUITS:readonly TrucoSuit[]=['paus','copas','espadas','ouros'];
const SUIT_PATHS:Record<TrucoSuit,string>={
  copas:'M12 21.500C9.300 18.700 1.800 14 1.800 8.300 1.800 5 4.200 2.700 7.100 2.700c2.100 0 3.900 1.200 4.900 3.100 1-1.900 2.800-3.100 4.900-3.100 2.900 0 5.300 2.300 5.300 5.600 0 5.700-7.500 10.400-10.200 13.200z',
  ouros:'M12 1.500c1.900 3.700 4.700 7.200 8 10.500-3.300 3.300-6.100 6.800-8 10.500-1.900-3.700-4.700-7.200-8-10.500 3.300-3.300 6.100-6.800 8-10.500z',
  espadas:'M12 1.600c1.800 3.600 9.400 7.800 9.400 13.100 0 2.900-2.200 4.800-4.600 4.800-1.400 0-2.600-.6-3.500-1.600.2 1.900 1 3.200 2.400 4.400H8.300c1.400-1.200 2.200-2.500 2.400-4.400-.9 1-2.100 1.600-3.500 1.600-2.400 0-4.600-1.900-4.600-4.800C2.600 9.400 10.200 5.200 12 1.600z',
  paus:'M12 1.700a5 5 0 0 1 4.600 6.900 4.900 4.900 0 1 1-3.400 8.300c.2 2 1 3.400 2.500 4.700H8.300c1.500-1.300 2.300-2.700 2.500-4.700a4.900 4.900 0 1 1-3.400-8.300A5 5 0 0 1 12 1.700z',
};
/** Pip positions as in a printed deck: [x %, y %]; those in the lower half stand upside down. */
const PIPS:Partial<Record<TrucoRank,ReadonlyArray<readonly [number,number]>>>={
  A:[[50,50]],2:[[50,24],[50,76]],3:[[50,22],[50,50],[50,78]],
  4:[[37,24],[63,24],[37,76],[63,76]],5:[[37,24],[63,24],[50,50],[37,76],[63,76]],
  6:[[37,23],[63,23],[37,50],[63,50],[37,77],[63,77]],7:[[37,23],[63,23],[50,36.500],[37,50],[63,50],[37,77],[63,77]],
};
export const isRed=(suit:string)=>suit==='copas'||suit==='ouros';
export const cardName=(card:TrucoCard)=>card.rank==='?'?'Carta virada':`${rankText(card.rank)} de ${card.suit}`;
export const suitSvg=(suit:TrucoSuit,className='tc-suit')=>`<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="${SUIT_PATHS[suit]}" fill="currentColor"/></svg>`;

/** One half of a court figure (the print is mirrored, as on a real card): crown for the Rei, tiara for the Dama, cap for the Valete. */
function courtHalf(rank:TrucoRank,ink:string,gold:string,robe:string):string {
  const hat=rank==='K'?`<path d="M18 21l-1.500-9 5 4.500L26 9l4 7.500 5-4.500L33.500 21z" fill="${gold}" stroke="${ink}" stroke-width=".8"/><circle cx="26" cy="9" r="1.300" fill="${robe}"/>`
    :rank==='Q'?`<path d="M19.500 20c.5-5 3-8 6.500-8s6 3 6.500 8l-2.500-3-2 2.500-2-3.500-2 3.500-2-2.500z" fill="${gold}" stroke="${ink}" stroke-width=".8"/><path d="M16 26c-1 7-.5 12 1 15l4-3V21zM36 26c1 7 .5 12-1 15l-4-3V21z" fill="${ink}"/>`
    :`<path d="M17 20c1-6 5-9 10-9 4 0 7 2 9 5l-4 1 1 3z" fill="${robe}" stroke="${ink}" stroke-width=".8"/><path d="M34 15c3-3 6-4 9-3-2 2-4 4-8 5z" fill="${gold}" stroke="${ink}" stroke-width=".6"/>`;
  return `<path d="M3 44V37c6-3 10-5 14-6l9 6 9-6c4 1 8 3 14 6v7z" fill="${robe}" stroke="${ink}" stroke-width=".8"/>
    <path d="M26 37v7M17 31l3 13M35 31l-3 13" stroke="${gold}" stroke-width="1.400" fill="none"/>
    <path d="M21 28v4l5 4 5-4v-4z" fill="#f4d9bd" stroke="${ink}" stroke-width=".6"/>
    <path d="M18.500 20h15v5c0 4.500-3.300 7.500-7.500 7.500s-7.500-3-7.500-7.500z" fill="#f8e3cc" stroke="${ink}" stroke-width=".8"/>
    <circle cx="23" cy="24.500" r=".9" fill="${ink}"/><circle cx="29" cy="24.500" r=".9" fill="${ink}"/><path d="M23.500 28.500c1.500 1 3.500 1 5 0" stroke="${ink}" stroke-width=".8" fill="none"/>
    ${rank==='K'?`<path d="M20.500 28c1 4 3 6 5.500 6s4.500-2 5.500-6c-1.700 1-3.500 1.300-5.500 1.300s-3.800-.3-5.500-1.300z" fill="${ink}"/>`:''}${hat}`;
}
function courtMarkup(rank:TrucoRank,suit:TrucoSuit):string {
  const red=isRed(suit),ink=red?'#7c1230':'#1d1626',robe=red?'#c41e3a':'#3a2a8c',half=courtHalf(rank,ink,'#e7ae18',robe);
  return `<span class="tc-court"><svg viewBox="0 0 52 88" aria-hidden="true"><rect width="52" height="88" fill="#fbf1dc"/>${half}<g transform="rotate(180 26 44)">${half}</g><path d="M0 44h52" stroke="${ink}" stroke-width=".9"/></svg>
    <span class="tc-court-suit">${suitSvg(suit)}</span><span class="tc-court-suit end">${suitSvg(suit)}</span></span>`;
}
function faceMarkup(rank:TrucoRank,suit:TrucoSuit):string {
  const corner=`<b>${rank}</b>${suitSvg(suit)}`,pips=PIPS[rank];
  const body=pips?`<span class="tc-pips${rank==='A'?' ace':''}">${pips.map(([x,y])=>`<span class="tc-pip${y>50?' flip':''}" style="left:${x}%;top:${y}%">${suitSvg(suit)}</span>`).join('')}</span>`:courtMarkup(rank,suit);
  return `<span class="tc-corner">${corner}</span>${body}<span class="tc-corner end">${corner}</span>`;
}
/** A card's element: a face and a back on one turning leaf. `manilha` puts the gold edge and the name on it. */
export function makeCard(card:TrucoCard,manilha:string|undefined=undefined):HTMLElement {
  const el=document.createElement('div');
  el.className='tc-card';el.setAttribute('role','img');
  el.innerHTML='<div class="tc-card-inner"><div class="tc-face"></div><div class="tc-back"></div></div>';
  paintCard(el,card,manilha);
  return el;
}
/** Writes what the card shows; a card that was face down and now has a face just stops being `.down`, and the leaf turns. */
export function paintCard(el:HTMLElement,card:TrucoCard,manilha:string|undefined=undefined):void {
  const hidden=card.rank==='?',key=`${card.rank}:${card.suit}:${manilha??''}`;
  el.classList.toggle('down',hidden);
  if(el.dataset.face===key)return;
  el.dataset.face=key;el.setAttribute('aria-label',manilha?`${cardName(card)}, ${manilha}`:cardName(card));
  el.classList.toggle('red',isRed(card.suit));el.classList.toggle('manilha',!!manilha);
  if(!hidden)el.querySelector('.tc-face')!.innerHTML=faceMarkup(card.rank as TrucoRank,card.suit as TrucoSuit)+(manilha?`<em class="tc-manilha">${manilha}</em>`:'');
}
/** The manilha's name, when this card is one under this vira. */
export function manilhaOf(card:TrucoCard,vira:TrucoCard|null):string|undefined {
  if(!vira||vira.rank==='?'||card.rank==='?'||card.suit==='')return undefined;
  return card.rank===manilhaRank(vira.rank as TrucoRank)?MANILHA_NAMES[card.suit as TrucoSuit]:undefined;
}
