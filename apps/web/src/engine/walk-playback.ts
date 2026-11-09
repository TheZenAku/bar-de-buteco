/** Ease with ground speed, capped at about 116 steps/minute for the 1.4-second walk cycle.
 * Normal movement must still read as walking, even when its travel speed exceeds the authored stride. */
export function walkPlaybackRate(previous:number|undefined,speed:number,dt:number,pace=1.38):number {
  const wanted=Math.max(.5,Math.min(1.35,speed/pace));
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
