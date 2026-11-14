import {RIBEIRO_ASSEMBLY,RIBEIRO_CUTTERS,RIBEIRO_DRILLS,RIBEIRO_MACHINING,RIBEIRO_MATERIAL_INFO,RIBEIRO_MATERIALS,RIBEIRO_RECIPES,WEAPONS,WHEEL_ORDER,type RibeiroAdminView,type RibeiroMaterial,type RibeiroMemberRole,type RibeiroOrder,type RibeiroOrderStatus,type WeaponId} from '@bar/shared';
import type {AdminContext,WorldSnapshot} from './kit';

/** What a tab of Administração › Ribeiro gets from the section (ribeiro.ts). */
export interface RibeiroHub {
  ctx:AdminContext;
  /** Sends admin.ribeiro with the reason typed at the top. False (and the reason why, in the status line) when nothing was sent. The section says the verdict when the room answers. */
  command(payload:Record<string,unknown>):boolean;
  /** Opens another tab of the section. */
  open(tab:string):void;
}
export interface RibeiroTab {update(view:RibeiroAdminView,world:WorldSnapshot):void;destroy?():void}
export type RibeiroTabFactory=(root:HTMLElement,hub:RibeiroHub)=>RibeiroTab;

export const weaponName=(id:string)=>WEAPONS[id as WeaponId]?.name??id;
export const materialName=(id:string)=>RIBEIRO_MATERIAL_INFO[id as RibeiroMaterial]?.name??id;
export const ROLE_NAME:Readonly<Record<RibeiroMemberRole,string>>={owner:'Dono',manager:'Gerente',employee:'Funcionário'};
export const ROLE_TONE:Readonly<Record<RibeiroMemberRole,'gold'|'cyan'|'muted'>>={owner:'gold',manager:'cyan',employee:'muted'};

export type Stage='queue'|'cut'|'machining'|'drill'|'assembly';
/** The line, in order: where each status sits. */
export const STAGE_OF:Readonly<Partial<Record<RibeiroOrderStatus,Stage>>>={queued:'queue','to-cut':'cut',cutting:'cut','cut-ready':'cut','to-machining':'machining',machining:'machining','machined-ready':'machining','to-drill':'drill',drilling:'drill','drilled-ready':'drill','to-assembly':'assembly',assembling:'assembly','assembled-ready':'assembly','to-shelf':'assembly'};
export const STAGES:ReadonlyArray<{id:Stage;label:string}>=[{id:'queue',label:'Na fila de preparação'},{id:'cut',label:'Corte e preparação'},{id:'machining',label:'Usinagem'},{id:'drill',label:'Furação e acabamento'},{id:'assembly',label:'Montagem'}];
export const isActive=(order:Pick<RibeiroOrder,'status'>)=>order.status!=='completed'&&order.status!=='cancelled';
export const READY_STATUS:readonly RibeiroOrderStatus[]=['cut-ready','machined-ready','drilled-ready','assembled-ready'];
export const statusTone=(status:RibeiroOrderStatus):''|'cyan'|'gold'|'mint'|'magenta'|'muted'=>status==='completed'?'mint':status==='cancelled'?'muted':status==='queued'?'gold':READY_STATUS.includes(status)?'cyan':status.startsWith('to-')?'gold':'magenta';

/** `short` is "Corte 01": inside a column that is already called Corte, the tile does not need the long name. */
const short=(label:string,stage:string)=>`${stage} ${/(\d+)$/.exec(label)?.[1]??''}`.trim();
export const STATIONS=[
  ...RIBEIRO_CUTTERS.map(s=>({id:s.id as string,label:s.label,short:short(s.label,'Corte'),stage:'cut' as const})),
  ...RIBEIRO_MACHINING.map(s=>({id:s.id as string,label:s.label,short:short(s.label,'Usinagem'),stage:'machining' as const})),
  ...RIBEIRO_DRILLS.map(s=>({id:s.id as string,label:s.label,short:short(s.label,'Furação'),stage:'drill' as const})),
  ...RIBEIRO_ASSEMBLY.map(s=>({id:s.id as string,label:s.label,short:short(s.label,'Montagem'),stage:'assembly' as const})),
];
export const stationLabel=(id:string)=>STATIONS.find(s=>s.id===id)?.label??'';

/** How many orders of a weapon the raw material in stock can still open, and which material runs out first. */
export function canMake(weapon:WeaponId,materials:Record<RibeiroMaterial,number>):{count:number;limit:RibeiroMaterial} {
  const recipe=RIBEIRO_RECIPES.find(item=>item.weapon===weapon)!;let count=Infinity,limit:RibeiroMaterial=RIBEIRO_MATERIALS[0];
  for(const material of RIBEIRO_MATERIALS){const possible=Math.floor(materials[material]/recipe.materials[material]);if(possible<count){count=possible;limit=material;}}
  return {count,limit};
}
/** The weapons in the order of the wheel, the same everywhere in the console. */
export const WEAPON_LIST:readonly WeaponId[]=WHEEL_ORDER;

/**
 * Charts are SVG sized to the room they have: the slots (`.admin-chart-slot[data-chart]`) are filled from `builders` after every drawing and again when the
 * panel's width changes by a few columns.
 */
export function chartPainter(root:HTMLElement,builders:()=>Record<string,((width:number)=>string)|undefined>){
  const paint=()=>{const make=builders();for(const slot of root.querySelectorAll<HTMLElement>('.admin-chart-slot')){const build=make[slot.dataset.chart??''];if(build)slot.innerHTML=build(Math.max(280,Math.floor(slot.clientWidth||520)));}};
  let width=root.clientWidth;const observer=new ResizeObserver(()=>{if(Math.abs(root.clientWidth-width)>24){width=root.clientWidth;paint();}});observer.observe(root);
  return {paint,destroy:()=>observer.disconnect()};
}
/** A list that is cut into pages: the page being shown, and the pager under it. */
export const pager=(attr:string,page:number,pages:number,note:string,icons:{left:string;right:string})=>
  `<div class="eco-pager"><button type="button" class="mini-button" data-${attr}="-1" ${page<=0?'disabled':''}>${icons.left}Mais novos</button><span>Página ${page+1} de ${pages} · ${note}</span><button type="button" class="mini-button" data-${attr}="1" ${page+1>=pages?'disabled':''}>Mais antigos${icons.right}</button></div>`;
/** A person's name may carry anything: id-looking strings are the only ones typed by hand. */
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
