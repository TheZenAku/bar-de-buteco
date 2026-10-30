import {USE_DURATION_MS,consumeMs,type PlayerState,type WorldState} from '@bar/shared';

/** Something the local player is having right now; times on the server clock. */
export interface Consumption {id:string;item:string;startedAt:number;durationMs:number}

/**
 * What the local player is consuming, read from the synced room state, each over the same time wherever it comes from
 * (consumeMs): what is in hand (a drink Magrão served, a drink or a snack from the backpack), and what was served at
 * their seat while they stay seated. A backpack item used at once (a bandage) shows its quick use; `usedItem` is the
 * one asked for, since the room does not sync it.
 */
export function consumptions(world:WorldState|undefined,self:PlayerState|undefined,usedItem:string,now:number):Consumption[] {
  if(!world||!self)return [];
  const list:Consumption[]=[];
  if(self.holding&&self.holdingSince&&self.holdingUntil&&now<self.holdingUntil)
    list.push({id:`hand:${self.holdingSince}`,item:self.holding,startedAt:self.holdingSince,durationMs:self.holdingUntil-self.holdingSince});
  if(self.interactionState==='inventory'&&usedItem)
    list.push({id:`use:${self.animationStartedAt}`,item:usedItem,startedAt:self.animationStartedAt,durationMs:USE_DURATION_MS});
  if(self.interactionState.startsWith('seat-')&&self.animationState==='sit')
    for(const served of Object.values(world.served??{}))
      if(served.seat===self.interactionState&&!served.doneAt&&now>=served.placedAt)
        list.push({id:served.id,item:served.item,startedAt:served.placedAt,durationMs:consumeMs(served.item)});
  return list.sort((a,b)=>a.startedAt-b.startedAt);
}
