import {fightBody} from '../fight.js';
import {GUN_BODY_TABLE} from './bodies-data.js';

/**
 * A skin standing (Idle's first frame), as the bullets see it: heights above the feet (m) of the hip joint, the chest (spine_03), the neck, the head
 * joint, the top of the head, the right shoulder; and how far the shoulders are apart. Measured from each skin's own bank by
 * tools/assets/measure-gun-bodies.mjs (bodies-data.ts); a skin missing there is estimated from its fight measures (taken in the boxing guard, a
 * few centimetres lower than standing).
 */
export interface GunBody {hip:number;chest:number;neck:number;head:number;top:number;shoulder:number;shoulderWidth:number}

export function gunBody(skin:string|undefined):GunBody {
  const measured=GUN_BODY_TABLE[skin??''];
  if(measured)return measured;
  const guard=fightBody(skin);
  const hip=guard.hip+.05,head=guard.head+.07;
  return {hip,chest:hip+(head-hip)*.62,neck:head-.05,head,top:head+.23,shoulder:head-.11,shoulderWidth:.38};
}
