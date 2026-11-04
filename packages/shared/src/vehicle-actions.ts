/** Presentation actions replicated by the room; the ground hull keeps the same collision checks. */
export const WHEELIE={angle:34,minSpeed:1.2,rise:5,fall:9} as const;
export const HORSE_REAR={durationMs:1800,cooldownMs:2800,angle:48} as const;
export function stepWheelie(level:number,wanted:boolean,speed:number,brake:boolean,powered:boolean,car=false,dt=.05):number {
  const target=!car&&wanted&&powered&&!brake&&speed>WHEELIE.minSpeed?1:0;
  return Math.max(0,Math.min(1,level+(target-level)*(1-Math.exp(-(target?WHEELIE.rise:WHEELIE.fall)*dt))));
}
/** Rotation about the rear axle, so the rear tyre remains on the road. +Z is forward, -X raises the front. */
export function wheeliePose(level:number,radius=.3,rearZ=-.675){
  const angle=Math.max(0,Math.min(1,level))*WHEELIE.angle*Math.PI/180;
  return {angle:angle*180/Math.PI,y:radius*(1-Math.cos(angle))-rearZ*Math.sin(angle),z:rearZ*(1-Math.cos(angle))+radius*Math.sin(angle)};
}
export function horseRearLevel(startedAt:number,now:number):number {
  const t=(now-startedAt)/HORSE_REAR.durationMs;
  return startedAt>0&&t>0&&t<1?Math.sin(Math.PI*t)**.8:0;
}
