import type {FreightState} from '@bar/shared/factory';

/**
 * What the room tells a truck driver about the plant's open requests (`freight.state`), and how it answered what they asked
 * (`factory.result` of `freight.*`). The phone's HighCargo app reads it; main.ts feeds it.
 */
export interface FreightFeed {
  state():FreightState|undefined;
  push(state:FreightState):void;
  /** An answer to something the app asked (accept, give up). */
  result(result:{action:string;ok:boolean;message:string}):void;
  listen(listener:(state:FreightState)=>void):()=>void;
  onResult(listener:(result:{action:string;ok:boolean;message:string})=>void):()=>void;
  reset():void;
}
export function createFreightFeed():FreightFeed {
  let state:FreightState|undefined;const listeners=new Set<(state:FreightState)=>void>(),results=new Set<(result:{action:string;ok:boolean;message:string})=>void>();
  return {
    state:()=>state,
    push(next){state=next;for(const listener of listeners)listener(next);},
    result(result){for(const listener of results)listener(result);},
    listen(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    onResult(listener){results.add(listener);return ()=>results.delete(listener);},
    reset(){state=undefined;},
  };
}
