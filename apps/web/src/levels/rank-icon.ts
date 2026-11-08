import {MAX_LEVEL,rankOf} from '@bar/shared';

/**
 * The badge of each level, drawn here instead of 100 pictures: the rank (every ten levels) gives the shape and the
 * colours, the level is written in the middle, and the notches over it count the steps inside the rank.
 */
const C=32;
const point=(radius:number,angle:number)=>`${(C+radius*Math.cos(angle)).toFixed(2)},${(C+radius*Math.sin(angle)).toFixed(2)}`;
/** A regular polygon, or a star when `inner` is given, with its first point straight up. */
function polygon(sides:number,radius:number,inner?:number,turn=0):string {
  const points:string[]=[],count=inner?sides*2:sides;
  for(let i=0;i<count;i++)points.push(point(inner&&i%2?inner:radius,-Math.PI/2+turn+i*Math.PI*2/count));
  return `<polygon points="${points.join(' ')}"/>`;
}
const SHIELD='<path d="M32 5 L55 13 V31 C55 45 45 54 32 60 C19 54 9 45 9 31 V13 Z"/>';
const WINGS='<path d="M14 26 C6 24 2 18 1 12 C6 16 10 16 14 15 M50 26 C58 24 62 18 63 12 C58 16 54 16 50 15" fill="none" stroke-width="3" stroke-linecap="round"/>';
const CROWN='<path d="M20 9 L24 2 L28 7 L32 0 L36 7 L40 2 L44 9 Z"/>';
/** The outline of each rank, from the plainest to the grandest. */
const SHAPES:readonly string[]=[
  '<circle cx="32" cy="32" r="25"/>',
  SHIELD,
  polygon(6,27),
  polygon(4,29),
  polygon(8,27,undefined,Math.PI/8),
  polygon(5,30,17),
  polygon(6,29,19),
  polygon(8,29,21),
  SHIELD,
  polygon(12,30,23),
];
// Gradient ids are global to the page: a prefix of its own keeps two copies of this module from sharing them.
const PREFIX=`rk${Math.random().toString(36).slice(2,7)}`;
let serial=0;

/** The SVG of a level's badge; `size` in CSS pixels. Decorative: whoever shows it also writes the level as text. */
export function rankIcon(level:number,size=24):string {
  const lv=Math.max(1,Math.min(MAX_LEVEL,Math.floor(level)||1)),rank=rankOf(lv),[light,dark]=rank.colors,id=`${PREFIX}-${++serial}`;
  const notches=Array.from({length:10},(_,i)=>{
    const angle=-Math.PI*.82+i*Math.PI*.64/9;
    return `<circle cx="${(C+21*Math.cos(angle)).toFixed(2)}" cy="${(C+21*Math.sin(angle)+3).toFixed(2)}" r="1.7" class="${i<rank.step?'on':''}"/>`;
  }).join('');
  const shape=SHAPES[rank.index]!,digits=String(lv).length;
  return `<svg class="rank-icon rank-${rank.index}" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>
    ${rank.index>=8?`<g fill="none" stroke="${light}" opacity=".9">${WINGS}</g>`:''}
    <g fill="url(#${id})" stroke="#0b0614" stroke-width="2.5" stroke-linejoin="round">${shape}</g>
    <g fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.2" transform="translate(32 32) scale(.78) translate(-32 -32)">${shape}</g>
    ${rank.index===9?`<g fill="${light}" stroke="#0b0614" stroke-width="1.5" stroke-linejoin="round">${CROWN}</g>`:''}
    <g class="rank-notches" fill="#0b0614" fill-opacity=".45">${notches}</g>
    <text x="32" y="${digits>2?40:42}" text-anchor="middle" font-family="Chakra Petch, system-ui, sans-serif" font-weight="700" font-size="${digits>2?17:digits>1?21:24}" fill="#fff" stroke="#0b0614" stroke-width="3.5" paint-order="stroke">${lv}</text>
  </svg>`;
}
