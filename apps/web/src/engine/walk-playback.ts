/** Cadence eases on top of measured ground speed so network patches and direction changes do not
 * abruptly accelerate the legs. The walk bank itself carries the slower, 1.4-second gait. */
export function walkPlaybackRate(previous:number|undefined,speed:number,dt:number,pace=1.38):number {
  const wanted=Math.max(.5,Math.min(2.2,speed/pace));
  const current=previous??.5;
  return current+(wanted-current)*(1-Math.exp(-Math.max(0,dt)/(wanted>current?.18:.24)));
}

/** Only generic locomotion shares these softer cross-fades. Object/action clips keep their own timings. */
export function walkTransitionSeconds(from:string,to:string):number|undefined {
  const generic=['Idle','Walk','Jog','Run','DrunkIdle','DrunkWalk'];
  if(!generic.includes(from)||!generic.includes(to)||from===to)return;
  if(to==='Walk'||to==='Jog')return .32;
  if(from==='Walk'||from==='Jog')return .28;
}
