import {compact,e,n} from './kit';

/**
 * The economy's charts, drawn as inline SVG (no library): thin marks, hairline grid, one axis, the value at the end of
 * the line and a tooltip on every mark. Colours come from admin.css (--viz-up blue, --viz-down red), validated for
 * colour blindness against the panel's violet. Every chart also has its numbers in a table next to it.
 */
const PAD={top:14,right:56,bottom:24,left:44};
/** Three or four round ticks from 0 up to at least `max`. */
function ticks(max:number):number[] {
  if(max<=0)return [0];
  const raw=max/3,power=10**Math.floor(Math.log10(raw)),step=[1,2,2.5,5,10].map(m=>m*power).find(s=>s>=raw)!;
  return Array.from({length:Math.ceil(max/step)+1},(_,i)=>i*step);
}
const shortDay=(day:string)=>`${day.slice(8,10)}/${day.slice(5,7)}`;
/** Data-end rounded (4 px), square at the baseline; `up`: the rounded end on top. */
function bar(x:number,y:number,w:number,h:number,up:boolean):string {
  if(h<=0)return '';
  const r=Math.min(4,w/2,h);
  return up?`M${x},${y+h}V${y+r}Q${x},${y} ${x+r},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${y+h}Z`
    :`M${x},${y}V${y+h-r}Q${x},${y+h} ${x+r},${y+h}H${x+w-r}Q${x+w},${y+h} ${x+w},${y+h-r}V${y}Z`;
}
const xLabels=(days:string[],x:(i:number)=>number,height:number)=>{
  const picks=days.length<=8?days.map((_,i)=>i):[0,Math.floor((days.length-1)/2),days.length-1];
  return picks.map(i=>`<text x="${x(i)}" y="${height-6}" text-anchor="middle" class="viz-axis">${shortDay(days[i]!)}</text>`).join('');
};

/** One series over time (coins in circulation): a 2 px line, a 10% wash and the last value at the end. */
export function lineChart(points:ReadonlyArray<{day:string;value:number}>,width:number,label:string,height=190):string {
  if(!points.length)return '';
  const max=Math.max(...points.map(p=>p.value),1),scale=ticks(max),top=scale[scale.length-1]!;
  const innerW=width-PAD.left-PAD.right,innerH=height-PAD.top-PAD.bottom;
  const x=(i:number)=>PAD.left+(points.length===1?innerW/2:i/(points.length-1)*innerW),y=(v:number)=>PAD.top+innerH-(v/top)*innerH;
  const line=points.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const last=points[points.length-1]!,band=innerW/Math.max(1,points.length-1);
  return `<svg class="admin-chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${e(label)}">
    ${scale.map(t=>`<line class="viz-grid" x1="${PAD.left}" x2="${width-PAD.right}" y1="${y(t)}" y2="${y(t)}"/><text class="viz-axis" x="${PAD.left-6}" y="${y(t)+3}" text-anchor="end">${compact(t)}</text>`).join('')}
    <path class="viz-area" d="${line}L${x(points.length-1)},${y(0)}L${x(0)},${y(0)}Z"/>
    <path class="viz-line" d="${line}"/>
    <line class="viz-crosshair" x1="0" x2="0" y1="${PAD.top}" y2="${PAD.top+innerH}" hidden/>
    <circle class="viz-dot" cx="${x(points.length-1)}" cy="${y(last.value)}" r="4"/>
    <text class="viz-value" x="${x(points.length-1)+8}" y="${y(last.value)+4}">${compact(last.value)}</text>
    ${xLabels(points.map(p=>p.day),x,height)}
    ${points.map((p,i)=>`<rect class="viz-hit" x="${Math.max(PAD.left,x(i)-band/2)}" y="${PAD.top}" width="${Math.max(6,band)}" height="${innerH}" tabindex="-1" data-cross="${x(i)}" data-tip="${e(`${shortDay(p.day)} · ${n(p.value)} moedas`)}"/>`).join('')}
  </svg>`;
}

/** Coins created (up, blue) and taken out (down, red) per day, around one zero line. */
export function flowChart(days:ReadonlyArray<{day:string;created:number;destroyed:number}>,width:number,height=200):string {
  if(!days.length)return '';
  const max=Math.max(1,...days.map(d=>Math.max(d.created,d.destroyed))),scale=ticks(max),top=scale[scale.length-1]!;
  const innerW=width-PAD.left-PAD.right,innerH=height-PAD.top-PAD.bottom,zero=PAD.top+innerH/2;
  const slot=innerW/days.length,w=Math.max(2,Math.min(24,slot-2)),h=(v:number)=>v/top*(innerH/2);
  const x=(i:number)=>PAD.left+i*slot+slot/2;
  return `<svg class="admin-chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Moedas criadas e retiradas por dia">
    ${scale.filter(t=>t>0).map(t=>`<line class="viz-grid" x1="${PAD.left}" x2="${width-PAD.right}" y1="${zero-h(t)}" y2="${zero-h(t)}"/><line class="viz-grid" x1="${PAD.left}" x2="${width-PAD.right}" y1="${zero+h(t)}" y2="${zero+h(t)}"/>
      <text class="viz-axis" x="${PAD.left-6}" y="${zero-h(t)+3}" text-anchor="end">${compact(t)}</text><text class="viz-axis" x="${PAD.left-6}" y="${zero+h(t)+3}" text-anchor="end">−${compact(t)}</text>`).join('')}
    <line class="viz-baseline" x1="${PAD.left}" x2="${width-PAD.right}" y1="${zero}" y2="${zero}"/>
    ${days.map((d,i)=>{const left=x(i)-w/2,up=h(d.created),down=h(d.destroyed);
      return `<g class="viz-bar" tabindex="-1" data-tip="${e(`${shortDay(d.day)} · criadas ${n(d.created)} · retiradas ${n(d.destroyed)} · saldo ${d.created-d.destroyed>=0?'+':'−'}${n(Math.abs(d.created-d.destroyed))}`)}">
        <rect class="viz-hit" x="${x(i)-slot/2}" y="${PAD.top}" width="${slot}" height="${innerH}"/>
        <path class="viz-up" d="${bar(left,zero-1-up,w,up,true)}"/><path class="viz-down" d="${bar(left,zero+1,w,down,false)}"/></g>`;}).join('')}
    ${xLabels(days.map(d=>d.day),x,height)}
  </svg>`;
}

/** The tooltip and crosshair of every chart inside `root` (pointer and keyboard focus). */
export function chartHover(root:HTMLElement):()=>void {
  const tip=document.createElement('div');tip.className='admin-tooltip';tip.hidden=true;tip.setAttribute('role','status');root.append(tip);
  const show=(target:Element,clientX:number,clientY:number)=>{
    const text=target.getAttribute('data-tip');if(!text)return;
    tip.textContent=text;tip.hidden=false;
    const box=root.getBoundingClientRect(),own=tip.getBoundingClientRect();
    tip.style.left=`${Math.min(box.width-own.width-4,Math.max(4,clientX-box.left+12))}px`;tip.style.top=`${Math.max(4,clientY-box.top-own.height-10)}px`;
    const svg=target.closest('svg'),cross=svg?.querySelector<SVGLineElement>('.viz-crosshair'),at=target.getAttribute('data-cross');
    if(cross&&at){cross.setAttribute('x1',at);cross.setAttribute('x2',at);cross.removeAttribute('hidden');}
  };
  const hide=()=>{tip.hidden=true;root.querySelectorAll('.viz-crosshair').forEach(line=>line.setAttribute('hidden',''));};
  const move=(event:PointerEvent)=>{const target=(event.target as Element).closest('[data-tip]');if(target&&root.contains(target))show(target,event.clientX,event.clientY);else hide();};
  const focus=(event:FocusEvent)=>{const target=(event.target as Element).closest?.('[data-tip]');if(!target)return;const r=target.getBoundingClientRect();show(target,r.left+r.width/2,r.top);};
  root.addEventListener('pointermove',move);root.addEventListener('pointerleave',hide);root.addEventListener('focusin',focus);root.addEventListener('focusout',hide);
  return ()=>{root.removeEventListener('pointermove',move);root.removeEventListener('pointerleave',hide);root.removeEventListener('focusin',focus);root.removeEventListener('focusout',hide);tip.remove();};
}
