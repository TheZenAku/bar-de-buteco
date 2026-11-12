import {e,n} from './kit';
import type {FactoryAdminSnapshot} from './kit';

/** The pictures of the Fábrica section: tanks that fill, the process line, ring gauges and history lines. Plain SVG, coloured by classes of factory.css. */
type Tank=FactoryAdminSnapshot['tanks'][number];
const num=(value:unknown)=>Number(value)||0;
const clamp=(value:number,low=0,high=1)=>Math.min(high,Math.max(low,value));
export const label=(state:unknown)=>String(state??'—').toLowerCase().replaceAll('_',' ');

export type Tone=''|'magenta'|'cyan'|'gold'|'red'|'mint'|'muted';
export const tankTone=(state:string):Tone=>state==='VAZIO'?'muted':state==='PRONTO_PARA_TRANSFERIR'?'mint':state==='TRANSFERINDO'?'cyan':state==='SUJO'||state==='PAUSADO'?'gold':'magenta';
export const dryerTone=(state:string):Tone=>state==='FALHA'?'red':state==='PRODUZINDO'?'mint':state==='PRONTO'?'cyan':state==='PARADO'?'muted':state==='PAUSADO'||state==='LIMPEZA'?'gold':'magenta';
export const baggingTone=(state:string):Tone=>state==='PARADO'?'muted':state==='PAUSADO'?'gold':state==='ENCHENDO'?'mint':'cyan';

/** Cold water is blue, the target temperature is amber. */
const waterColor=(temperature:number,target:number)=>`color-mix(in oklab,hsl(205 90% 58%) ${Math.round(100-clamp((temperature-20)/Math.max(1,target-20))*100)}%,hsl(28 95% 56%))`;

/** One tank: the water level against the recipe's volume, its temperature, the lid and the agitator (it stirs while it turns). */
export function tankShape(tank:Tank,recipeL:number,targetC:number,uid:string,x=0,y=0,scale=1):string {
  const water=num(tank.waterL),level=clamp(water/Math.max(1,recipeL)),height=96*level,temperature=num(tank.temperatureC),rpm=num(tank.agitatorRpm);
  const clip=`fx-clip-${uid}`,lid=tank.lidOpen;
  return `<g transform="translate(${x} ${y}) scale(${scale})" class="fx-tank" role="img" aria-label="Tanque ${tank.id}: ${n(water)} litros a ${n(temperature,1)} graus">
    <clipPath id="${clip}"><rect x="14" y="24" width="62" height="96" rx="3"/></clipPath>
    <rect class="fx-tank-body" x="14" y="24" width="62" height="96" rx="3"/>
    <g clip-path="url(#${clip})"><rect class="fx-water" x="14" y="${120-height}" width="62" height="${height}" style="fill:${waterColor(temperature,targetC)}"/>
      ${rpm>0?`<g class="fx-stir"><rect x="43" y="30" width="4" height="80"/><rect class="fx-paddle" x="30" y="60" width="30" height="4"/><rect class="fx-paddle" x="30" y="88" width="30" height="4"/></g>`:''}</g>
    <path class="fx-tank-lid ${lid?'open':''}" d="${lid?'M10 22 L48 6':'M10 22 H80'}"/>
    <text class="fx-tank-temp" x="45" y="76" text-anchor="middle">${water>0?`${n(temperature)}°`:''}</text>
    <text class="fx-tank-name" x="45" y="139" text-anchor="middle">TQ-${100+num(tank.id)}</text>
  </g>`;
}
export function tankPicture(tank:Tank,recipeL:number,targetC:number):string {
  return `<svg class="fx-tank-svg" viewBox="0 0 90 146" aria-hidden="false">${tankShape(tank,recipeL,targetC,`card-${tank.id}`)}</svg>`;
}

/** Two thermometers: inlet and outlet of the dryer, with the safe band marked. */
export function dryerPicture(dryer:FactoryAdminSnapshot['dryer']):string {
  const bars=[['Entrada',num(dryer.inletC),'fx-hot'],['Saída',num(dryer.outletC),'fx-warm']] as const;
  return `<svg class="fx-dryer-svg" viewBox="0 0 150 130" role="img" aria-label="Secador: entrada ${n(num(dryer.inletC))} graus, saída ${n(num(dryer.outletC))} graus">
    ${bars.map(([name,value,cls],i)=>{const x=22+i*64,h=88*clamp(value/250);return `<rect class="fx-therm" x="${x}" y="12" width="26" height="88"/><rect class="${cls}" x="${x}" y="${100-h}" width="26" height="${h}"/><text class="fx-axis" x="${x+13}" y="115" text-anchor="middle">${name}</text><text class="fx-value" x="${x+13}" y="${Math.max(24,100-h-5)}" text-anchor="middle">${n(value)}°</text>`;}).join('')}
  </svg>`;
}

/** A ring: `ratio` 0–1 of a stock, a level or a pallet. */
export function ring(ratio:number,center:string,caption:string,tone:Tone):string {
  const r=36,c=2*Math.PI*r,value=clamp(ratio);
  return `<figure class="fx-ring ${tone}" role="img" aria-label="${e(caption)}: ${Math.round(value*100)}%"><svg viewBox="0 0 90 90"><circle class="fx-ring-bg" cx="45" cy="45" r="${r}"/><circle class="fx-ring-fg" cx="45" cy="45" r="${r}" stroke-dasharray="${(c*value).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 45 45)"/><text x="45" y="50" text-anchor="middle">${e(center)}</text></svg><figcaption>${e(caption)}</figcaption></figure>`;
}

/** A pallet: 18 bags in a 6×3 grid, filled ones lit. */
export function pallet(bags:number,capacity=18):string {
  return `<svg class="fx-pallet" viewBox="0 0 120 64" role="img" aria-label="Palete com ${bags} de ${capacity} sacos">${Array.from({length:capacity},(_,i)=>`<rect class="${i<bags?'on':''}" x="${(i%6)*20+1}" y="${Math.floor(i/6)*21+1}" width="18" height="19"/>`).join('')}</svg>`;
}

/** The whole line in one picture: tanks → dryer → bagging → pallet; the pipe in use glows. */
export function processLine(f:FactoryAdminSnapshot):string {
  const recipe=num((f.balance.recipe as Record<string,unknown>|undefined)?.waterL)||1200,target=num((f.balance.recipe as Record<string,unknown>|undefined)?.targetC)||65;
  const dryerOn=String(f.dryer.state)==='PRODUZINDO',source=Number(f.dryer.sourceTank)||0,bag=String(f.bagging.state);
  const active=bag==='ENCHENDO',bagKg=num(f.bagging.weightKg),pallets=num(f.bagging.palletBags);
  const pipe=(d:string,on:boolean)=>`<path class="fx-pipe ${on?'on':''}" d="${d}"/>`;
  return `<svg class="fx-line" viewBox="0 0 960 190" role="img" aria-label="Linha de produção: tanques, secador, ensaque e palete">
    ${f.tanks.map((tank,i)=>tankShape(tank,recipe,target,`line-${tank.id}`,16+i*104,6,1)).join('')}
    ${f.tanks.map((tank,i)=>pipe(`M${84+i*104} 126 V162 H388`,dryerOn&&source===Number(tank.id))).join('')}
    <g transform="translate(388 20)"><rect class="fx-machine ${String(f.dryer.state)==='FALHA'?'fault':dryerOn?'on':''}" x="0" y="0" width="150" height="150"/>
      <text class="fx-machine-name" x="75" y="22" text-anchor="middle">SECADOR</text>
      <text class="fx-machine-state" x="75" y="42" text-anchor="middle">${e(label(f.dryer.state))}</text>
      <text class="fx-value" x="75" y="86" text-anchor="middle">${n(num(f.dryer.inletC))}° → ${n(num(f.dryer.outletC))}°</text>
      <text class="fx-axis" x="75" y="108" text-anchor="middle">entrada → saída</text>
      <text class="fx-axis" x="75" y="138" text-anchor="middle">silo ${n(num(f.dryer.powderKg))} kg</text></g>
    ${pipe('M538 95 H600',dryerOn&&active)}
    <g transform="translate(600 20)"><rect class="fx-machine ${active?'on':''}" x="0" y="0" width="150" height="150"/>
      <text class="fx-machine-name" x="75" y="22" text-anchor="middle">ENSAQUE</text>
      <text class="fx-machine-state" x="75" y="42" text-anchor="middle">${e(label(f.bagging.state))}</text>
      <text class="fx-value" x="75" y="86" text-anchor="middle">${n(bagKg,1)} kg</text>
      <text class="fx-axis" x="75" y="108" text-anchor="middle">${n(num(f.bagging.emptyBags))} sacos vazios</text>
      <text class="fx-axis" x="75" y="138" text-anchor="middle">${n(num(f.bagging.producedBags))} feitos · ${n(num(f.bagging.rejectedBags))} recusados</text></g>
    ${pipe('M750 95 H800',active)}
    <g transform="translate(804 52)">${pallet(pallets).replace('<svg ','<svg x="0" y="0" width="140" height="75" ')}<text class="fx-axis" x="70" y="100" text-anchor="middle">palete ${pallets}/18</text></g>
  </svg>`;
}

/** Several lines over time, same scale; the last point is dotted. `max` fixes the top of the chart (0 = from the data). */
export function history(series:ReadonlyArray<{name:string;tone:Tone;values:readonly number[]}>,options:{unit?:string;max?:number;height?:number}={}):string {
  const w=420,h=options.height??120,left=34,bottom=16,top=8;
  if(!series.some(s=>s.values.length))return `<p class="admin-empty">Coletando amostras…</p>`;
  // One sample is a flat line until the next arrives.
  series=series.map(s=>s.values.length===1?{...s,values:[s.values[0]!,s.values[0]!]}:s);
  const peak=options.max??Math.max(1,...series.flatMap(s=>s.values)),top1=niceTop(peak);
  const x=(i:number,len:number)=>left+(w-left-8)*(len<2?1:i/(len-1)),y=(v:number)=>top+(h-top-bottom)*(1-clamp(v/top1));
  return `<svg class="fx-history" viewBox="0 0 ${w} ${h}" role="img" aria-label="${e(series.map(s=>s.name).join(', '))} nas últimas amostras">
    ${[0,.5,1].map(t=>`<line class="fx-grid" x1="${left}" x2="${w-8}" y1="${y(top1*t)}" y2="${y(top1*t)}"/><text class="fx-axis" x="${left-6}" y="${y(top1*t)+3}" text-anchor="end">${n(top1*t)}</text>`).join('')}
    ${series.map(s=>{const pts=s.values.map((v,i)=>`${x(i,s.values.length).toFixed(1)},${y(v).toFixed(1)}`).join(' '),last=s.values.at(-1)??0;return `<polyline class="fx-line-series ${s.tone}" points="${pts}"/><circle class="fx-dot ${s.tone}" cx="${x(s.values.length-1,s.values.length).toFixed(1)}" cy="${y(last).toFixed(1)}" r="3"/>`;}).join('')}
  </svg><ul class="fx-legend">${series.map(s=>`<li class="${s.tone}"><i></i>${e(s.name)} <b>${n(s.values.at(-1)??0,1)}${options.unit??''}</b></li>`).join('')}</ul>`;
}
const niceTop=(value:number)=>{const step=10**Math.floor(Math.log10(Math.max(1,value)));return Math.ceil(value/step*2)/2*step||1;};
