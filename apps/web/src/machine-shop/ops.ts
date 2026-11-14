import {ribeiroOpLabel,type RibeiroOrder,type WeaponId} from '@bar/shared';

/** What one weapon of an OP is doing: every unit is its own order moving through the line. */
export interface OpLine {weapon:WeaponId;total:number;queued:number;/** Taken from preparation and not finished yet. */active:number;done:number;cancelled:number;orders:RibeiroOrder[]}
/** An OP as people talk about it: a customer, a number, and one line per weapon ("10 pistols, 20 revolvers"). */
export interface OpGroup {key:string;label:string;customer:string;operatorName:string;createdAt:number;lines:OpLine[];total:number;queued:number;active:number;done:number;cancelled:number}

/** The orders grouped by OP (oldest first, which is the order the preparation point serves them). */
export function opGroups(orders:readonly RibeiroOrder[]):OpGroup[] {
  const groups=new Map<string,OpGroup>();
  for(const order of orders){
    const key=order.opId??order.id;
    let group=groups.get(key);
    if(!group){group={key,label:ribeiroOpLabel(order),customer:order.customer??'',operatorName:order.operatorName,createdAt:order.createdAt,lines:[],total:0,queued:0,active:0,done:0,cancelled:0};groups.set(key,group);}
    let line=group.lines.find(item=>item.weapon===order.weapon);
    if(!line){line={weapon:order.weapon,total:0,queued:0,active:0,done:0,cancelled:0,orders:[]};group.lines.push(line);}
    const bucket=order.status==='queued'?'queued':order.status==='completed'?'done':order.status==='cancelled'?'cancelled':'active';
    line[bucket]++;line.total++;line.orders.push(order);group[bucket]++;group.total++;
  }
  return [...groups.values()].sort((a,b)=>a.createdAt-b.createdAt||a.label.localeCompare(b.label));
}
/** "10× Pistola 9mm e 20× Revolver" for the lines of an OP. */
export const opSummary=(group:OpGroup,name:(weapon:WeaponId)=>string):string=>group.lines.map(line=>`${line.total}× ${name(line.weapon)}`).join(' · ');
