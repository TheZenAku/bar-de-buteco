import {cityZone,floorSurface} from '@bar/shared';

export type FootstepSurface='asphalt'|'concrete'|'tile'|'wood'|'grass'|'dirt';

/** Collision supports cover the city even when its visual sectors have not streamed in yet. */
export function footstepSurfaceAt(x:number,y:number,z:number):FootstepSurface|undefined {
  const support=floorSurface(x,z,y);
  if(!support)return;
  const id=support.id;
  if(id.startsWith('COL_Palco'))return 'wood';
  if(id.startsWith('COL_Predio'))return 'tile';
  if(id.startsWith('COL_Rua_Leito')||id.startsWith('COL_Cid_Chao'))return 'asphalt';
  if(id.startsWith('COL_Cid_Canteiro'))return 'grass';
  if(id.startsWith('COL_Cid_Quadra')&&cityZone(x,z)==='Jardim Conceição')return 'grass';
  // 07_exterior.py: the football field shares Rua_Quadra's support, with grass around its dirt pitch.
  if(id.startsWith('COL_Rua_Quadra')&&x>=46&&x<=78&&z>=14&&z<=40){
    return x>=49&&x<=75&&z>=17&&z<=36?'dirt':'grass';
  }
  return 'concrete';
}
