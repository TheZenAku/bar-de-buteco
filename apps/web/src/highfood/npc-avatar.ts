import type {CustomerLook} from '@bar/shared';

const TONES=['#f6d7bd','#eec39a','#d9a074','#b97a4f','#8d5a36','#5f3b24'];
const HAIR=['#1d1612','#3a2415','#6a3f1e','#b0763a','#d9d4cc','#8f8f92','#b23a6e'];
const SHIRTS=['#e0483e','#2f6fdb','#2fa36b','#7a4fd0','#e08a2e','#17a7b8','#d63d8f','#4b5563'];
const BACKS:ReadonlyArray<readonly [string,string]>=[['#ff5a3c','#b31e5a'],['#17d4f4','#3a4fd0'],['#fac416','#e0601c'],['#a77bff','#4a1f9e'],['#5fd86c','#0f7a5f'],['#ff8fb1','#a11f6a'],['#7fa8ff','#27306e'],['#ffd27a','#a15c1c']];

/** The hair of each style, drawn behind (b) and in front of (f) the head, which is centred at 50,46 with a radius near 21. */
const STYLES:ReadonlyArray<{b?:string;f:string}>=[
  // Bald with a little at the sides.
  {f:'M29 44c-1-3-1-6 0-8 1 2 2 5 2 8zM71 44c1-3 1-6 0-8-1 2-2 5-2 8z'},
  // Short.
  {f:'M28 44c-2-15 8-24 22-24s24 9 22 24c-2-7-5-11-10-13-7 3-18 3-24 0-5 2-8 6-10 13z'},
  // Curly, short.
  {f:'M27 46c-4-6-1-12 3-14-1-6 6-10 11-8 4-5 13-5 17 0 5-2 12 2 11 8 4 2 7 8 3 14-1-7-5-12-11-14-8 3-17 3-24 0-6 2-9 7-10 14z'},
  // Long and straight.
  {b:'M25 44c0-18 11-27 25-27s25 9 25 27v28H25z',f:'M28 46c-1-14 9-24 22-24s23 10 22 24c-3-9-9-14-22-14s-19 5-22 14z'},
  // Bob with a fringe.
  {b:'M26 44c0-17 10-26 24-26s24 9 24 26v14c0 4-4 6-8 5V44H34v19c-4 1-8-1-8-5z',f:'M29 42c0-12 9-20 21-20s21 8 21 20c-6-7-14-10-21-8-7-2-15 1-21 8z'},
  // A grey bun.
  {b:'M41 12a9 9 0 1 1 18 0 9 9 0 0 1-18 0z',f:'M28 45c-2-15 8-25 22-25s24 10 22 25c-3-8-8-13-22-13s-19 5-22 13z'},
  // Receding.
  {f:'M29 42c-2-9 1-15 6-19 1 6-1 12-3 19zM71 42c2-9-1-15-6-19-1 6 1 12 3 19zM39 21c7-3 15-3 22 0-7 2-15 2-22 0z'},
  // Big curls.
  {b:'M22 46c-5-9 0-18 6-21 0-8 9-13 16-10 4-4 8-4 12 0 7-3 16 2 16 10 6 3 11 12 6 21 2 8-3 15-9 15H31c-6 0-11-7-9-15z',f:'M30 44c0-11 8-20 20-20s20 9 20 20c-5-6-12-9-20-9s-15 3-20 9z'},
];

/**
 * A customer's generated portrait: flat vector art on a two-colour background, drawn from their `look`, the same for
 * everyone and sharp at any size. A picture uploaded in the administration takes its place.
 */
export function customerAvatarSvg(look:CustomerLook,id=''):string {
  const skin=TONES[look.tone]??TONES[0]!,hair=HAIR[look.hairColor]??HAIR[0]!,shirt=SHIRTS[look.shirt]??SHIRTS[0]!,[from,to]=BACKS[look.bg]??BACKS[0]!,style=STYLES[look.hair]??STYLES[0]!;
  const key=`av-${id.replace(/[^a-z0-9]/g,'')}-${look.bg}`;
  const facial=look.facial===1?`<path d="M33 54c2 11 9 17 17 17s15-6 17-17c-2 3-5 5-8 5-6-3-12-3-18 0-3 0-6-2-8-5z" fill="${hair}"/>`
    :look.facial===2?`<path d="M40 56c3-3 7-3 10-1 3-2 7-2 10 1-3 3-7 2-10 1-3 1-7 2-10-1z" fill="${hair}"/>`
    :look.facial===3?`<path d="M34 56c1 10 8 18 16 18s15-8 16-18c-5 4-10 3-16 2-6 1-11 2-16-2z" fill="${hair}" opacity=".92"/>`:'';
  const glasses=look.glasses===1?`<g fill="none" stroke="#1b1320" stroke-width="1.5"><circle cx="41.5" cy="45" r="5.5"/><circle cx="58.5" cy="45" r="5.5"/><path d="M47 45h6M36 44l-6-1M64 44l6-1"/></g>`
    :look.glasses===2?`<g fill="#1b1320" stroke="#1b1320" stroke-width="1.2"><rect x="35.5" y="41" width="11" height="7" rx="2.5" fill-opacity=".78"/><rect x="53.5" y="41" width="11" height="7" rx="2.5" fill-opacity=".78"/><path d="M46.5 44h7" fill="none"/></g>`:'';
  return `<svg class="npc-avatar" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="${key}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
    <rect width="100" height="100" fill="url(#${key})"/>${style.b?`<path d="${style.b}" fill="${hair}"/>`:''}
    <path d="M14 104c1-20 15-30 36-30s35 10 36 30z" fill="${shirt}"/><path d="M40 74c2 7 18 7 20 0l-2-8H42z" fill="${skin}"/><path d="M42 66c5 4 11 4 16 0v3c-5 4-11 4-16 0z" fill="#000" opacity=".12"/>
    <ellipse cx="29" cy="47" rx="3.5" ry="5" fill="${skin}"/><ellipse cx="71" cy="47" rx="3.5" ry="5" fill="${skin}"/>
    <path d="M29 42c0-14 9-22 21-22s21 8 21 22c0 16-10 28-21 28S29 58 29 42z" fill="${skin}"/>${facial}
    <path d="M35.5 38.5c2-2 8-2.500 10-.5M54.500 38c2-2 8-1.500 10 .5" fill="none" stroke="${hair}" stroke-width="2.200" stroke-linecap="round"/>
    <circle cx="41.500" cy="45" r="2.100" fill="#21161c"/><circle cx="58.500" cy="45" r="2.100" fill="#21161c"/><circle cx="42.200" cy="44.300" r=".7" fill="#fff"/><circle cx="59.200" cy="44.300" r=".7" fill="#fff"/>
    <path d="M50 46.500c-1 3-2 5-2.500 6.500 1 .8 3 .8 4.500.2" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="1.400" stroke-linecap="round"/>
    <path d="M43.500 59c4 3.500 9 3.500 13 0" fill="none" stroke="#7a2f34" stroke-width="2" stroke-linecap="round"/>
    <path d="${style.f}" fill="${hair}"/>${glasses}</svg>`;
}
/** The picture to show for a customer: the one sent by the administration, else their generated portrait. */
export function customerPicture(person:{id?:string;name:string;look:CustomerLook;image?:string|null},className='npc-picture'):string {
  const art=person.image?`<img src="/api/badges/images/${encodeURIComponent(person.image)}" alt="" loading="lazy" draggable="false">`:customerAvatarSvg(person.look,person.id);
  return `<span class="${className}" role="img" aria-label="${person.name.replace(/[&<>"]/g,'')}">${art}</span>`;
}
