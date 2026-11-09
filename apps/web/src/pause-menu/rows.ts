import {escape as e} from '../api';
import {uiIcon} from '../ui-icons';

/**
 * The controls of a menu page (pause-menu.ts): one per row, the name on the left and the control on the right, as in a
 * console's settings. They are the real form controls, with the same `data-setting` names the game's settings always had
 * (main.ts applies them), styled as choices with arrows, segmented bars and switches. `data-pm-act` instead calls the
 * page's own handler (MenuEntry.acts).
 */
type Attr=`data-setting="${string}"`|`data-pm-act="${string}"`;
const hint=(text?:string)=>text?`<small>${text}</small>`:'';
const label=(name:string,note?:string)=>`<span class="pm-row-label"><b>${name}</b>${hint(note)}</span>`;

/** ‹ value › : ← → or a click on the arrows steps through the options; the select itself is only the value's text. */
export function choiceRow(name:string,attr:Attr,options:ReadonlyArray<readonly [string|number,string]>,current:string|number,opts:{note?:string;disabled?:boolean;id?:string}={}):string {
  const list=options.map(([value,text])=>`<option value="${e(String(value))}"${String(value)===String(current)?' selected':''}>${e(text)}</option>`).join('');
  return `<div class="pm-row${opts.disabled?' pm-off':''}">${label(name,opts.note)}<span class="pm-choice"><button type="button" class="pm-step" data-step="-1" tabindex="-1" aria-hidden="true">${uiIcon('chevronLeft')}</button><select ${attr}${opts.id?` id="${opts.id}"`:''} aria-label="${e(name)}" data-pm-control${opts.disabled?' disabled':''}>${list}</select><button type="button" class="pm-step" data-step="1" tabindex="-1" aria-hidden="true">${uiIcon('chevronRight')}</button></span></div>`;
}
/** A segmented bar; `output` is what it reads as (the game's input handler rewrites it while it moves). */
export function rangeRow(name:string,attr:Attr,value:number,output:string,opts:{min?:number;max?:number;step?:number;note?:string;disabled?:boolean}={}):string {
  const {min=0,max=100,step=1}=opts;
  return `<div class="pm-row${opts.disabled?' pm-off':''}">${label(name,opts.note)}<span class="pm-range"><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" ${attr} aria-label="${e(name)}" data-pm-control${opts.disabled?' disabled':''}><output>${e(output)}</output></span></div>`;
}
/** On or off: the checkbox drawn as a switch, with the word beside it. */
export function switchRow(name:string,attr:Attr,checked:boolean,opts:{note?:string;disabled?:boolean}={}):string {
  // A div, not a label: the menu works the control on a click anywhere on the row, and a label would flip it a second time.
  return `<div class="pm-row${opts.disabled?' pm-off':''}">${label(name,opts.note)}<span class="pm-switch"><input type="checkbox" role="switch" ${attr} aria-label="${e(name)}" data-pm-control${checked?' checked':''}${opts.disabled?' disabled':''}><span class="pm-on-text">Ligado</span><span class="pm-off-text">Desligado</span></span></div>`;
}
/** A command inside a page (restore the layout, copy the VR log). `attr` is a data-action of the game or a data-pm-act. */
export function buttonRow(name:string,attr:string,text:string,icon='chevronRight',note?:string):string {
  return `<div class="pm-row">${label(name,note)}<span class="pm-cmd"><button type="button" class="pm-btn" ${attr} data-pm-control>${uiIcon(icon)}<span>${e(text)}</span></button></span></div>`;
}
/** A small group heading inside a long page. */
export const groupRow=(title:string)=>`<p class="pm-group">${e(title)}</p>`;
/** A line worth reading once (what a choice costs, where a thing is), never a restatement of the row above. */
export const noteRow=(html:string)=>`<p class="pm-note">${html}</p>`;
