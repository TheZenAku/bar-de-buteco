/** Head offsets from the body's heading, in radians; pitch is positive looking down. */
export interface HeadLook { headYaw:number; headPitch:number }
export const HEAD_LOOK_YAW=80*Math.PI/180;
export const HEAD_LOOK_PITCH=50*Math.PI/180;
const clamp=(value:number,limit:number)=>Math.max(-limit,Math.min(limit,value));
export function headLookAt(viewYaw:number,viewPitch:number,bodyYaw:number):HeadLook {
  const turn=viewYaw+Math.PI-bodyYaw;
  return {headYaw:clamp(Math.atan2(Math.sin(turn),Math.cos(turn)),HEAD_LOOK_YAW),
    headPitch:clamp(Math.atan2(Math.sin(viewPitch),Math.cos(viewPitch)),HEAD_LOOK_PITCH)};
}
