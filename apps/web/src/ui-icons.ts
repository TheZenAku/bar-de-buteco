// Outline icons matching the supplied UI. No external requests or icon font required.
const paths:Record<string,string>={
  activity:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  beer:'<path d="M5 8h12v12H5zM17 9h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3M8 11v6m5-6v6M5 8a3 3 0 0 1 0-6 3 3 0 0 1 5-1 3 3 0 0 1 5 2 3 3 0 0 1 2 5"/>',
  music:'<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>',
  chat:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H3l2-5a8.5 8.5 0 1 1 16-3.5Z"/><path d="M8 10h8m-8 4h5"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
  bag:'<path d="M6 7h12l2 14H4L6 7Zm3 0V5a3 3 0 0 1 6 0v2m-7 7h8v4H8z"/>',
  map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/>',
  sparkles:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Zm8-1v4m-2-2h4M3 18v4m-2-2h4"/>',
  send:'<path d="m22 2-7 20-4-9-9-4L22 2ZM22 2 11 13"/>',
  lock:'<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
  unlock:'<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 7-2"/>',
  panels:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  reset:'<path d="M3 10a9 9 0 1 1 2 9M3 3v7h7"/>',
  eye:'<path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:'<path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/>',
  coins:'<ellipse cx="9" cy="6" rx="7" ry="3"/><path d="M2 6v5c0 4 14 4 14 0V6M2 11v5c0 4 14 4 14 0v-5m2-2c6 0 6 5 0 6m3-3v6c0 2-4 3-7 3"/>',
  hand:'<path d="M8 13V5a2 2 0 0 1 4 0v7-9a2 2 0 0 1 4 0v9-6a2 2 0 0 1 4 0v9a7 7 0 0 1-12 5L3 14a2 2 0 0 1 3-3l2 2Z"/>',
  shirt:'<path d="m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4a4 4 0 0 1-8 0Z"/>',
  cards:'<rect x="6" y="4" width="14" height="17" rx="2"/><path d="m3 16-1-12a2 2 0 0 1 2-2h10m-1 7-3 4 3 4 3-4-3-4Z"/>',
  help:'<circle cx="12" cy="12" r="10"/><path d="M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 4h.01"/>',
  settings:'<path d="m9 3 1-2h4l1 2 3 2 3 1v4l-2 2 2 2v4l-3 1-3 2-1 2h-4l-1-2-3-2-3-1v-4l2-2-2-2V6l3-1 3-2Z"/><circle cx="12" cy="12" r="3"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4m-4 0h8"/>',
  micOff:'<path d="M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 5 2.2M19 10v1a7 7 0 0 1-1.1 3.8M5 10v1a7 7 0 0 0 11.6 5.3M12 18v4m-4 0h8M2 2l20 20"/>',
  headphones:'<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-7h3v5ZM3 19a2 2 0 0 0 2 2h1v-7H3v5Z"/>',
  headphonesOff:'<path d="M3 18v-6a9 9 0 0 1 15-6.7M21 12v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-7h3v5ZM3 19a2 2 0 0 0 2 2h1v-7H3v5ZM2 2l20 20"/>',
  sliders:'<path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',
  alert:'<path d="m12 3 10 18H2L12 3Zm0 6v5m0 3h.01"/>',
  party:'<path d="m3 21 4-14 10 10L3 21Zm7-18 1 3m5-5-1 4m6-1-3 3m4 4-4 1M7 11l6 6"/>',
  grip:'<path d="M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01"/>',
  heart:'<path d="M12 20s-7.5-4.6-9.3-9.2C1.4 7.4 3.6 4 7 4c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8C19.5 15.4 12 20 12 20Z"/>',
  bolt:'<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  drop:'<path d="M12 3s7 7.6 7 12a7 7 0 0 1-14 0c0-4.4 7-12 7-12Z"/>',
  food:'<path d="M4 11h16a8 8 0 0 1-16 0ZM8 7c0-1 1-1.5 1-3m3 3c0-1 1-1.5 1-3m3 3c0-1 1-1.5 1-3M7 21h10"/>',
  toilet:'<path d="M6 3h5v8H6zM4 11h16a8 8 0 0 1-8 8H9l1 2H8l-2-4a6 6 0 0 1-2-6Z"/>',
  dizzy:'<circle cx="12" cy="12" r="9"/><path d="m7 8 3 3m0-3-3 3m7-3 3 3m0-3-3 3M9 16c1-1 2 1 3 0s2 1 3 0"/>',
  smoke:'<path d="M2 15h14v4H2zM18 15v4m3-4v4M17 3c0 2 2 2 2 4s-2 2-2 4m3-7c0 1.5 1 1.5 1 3"/>',
  kick:'<path d="m10 8 4 4 7-3M14 12l-1 5 5 4M10 8l-5 3-3-3m8 0 2 6-5 7"/><circle cx="13" cy="4" r="2"/>',
};
export function uiIcon(name:string):string{return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]??paths.sparkles}</svg>`;}
/** A catalog item's picture (ITEM_CATALOG.icon). Decorative: the item's name is always beside it. */
export function itemImage(item:{icon:string}):string{return `<img class="item-img" src="${import.meta.env.BASE_URL}${item.icon}" alt="" draggable="false">`;}
/** The coin after prices and earnings; read as "moedas". */
export const coinImage=`<img class="coin" src="${import.meta.env.BASE_URL}ui/moeda.png" alt="moedas" draggable="false">`;
/** An amount of coins, kept on one line with its coin. */
export const coins=(value:number)=>`<span class="coins">${value.toLocaleString('pt-BR')} ${coinImage}</span>`;
