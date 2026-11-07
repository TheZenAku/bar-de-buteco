/** Cigarettes are independent of locomotion and interactions. All phases use the room clock. */
export const SMOKING={lightMs:3600,putOutMs:1800} as const;
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
const window=(t:number,a:number,b:number,c:number,d:number)=>smooth((t-a)/(b-a))*(1-smooth((t-c)/(d-c)));
export interface SmokingState {smokingSince?:number;smokingStopAt?:number}
export function smokingTimeline(state:SmokingState,now:number,id=''){
  const since=state.smokingSince??0,stop=state.smokingStopAt??0,age=Math.max(0,(now-since)/1000);
  const off={phase:'off' as const,age,right:0,left:0,mouth:0,flame:0,visible:0,inhale:0,exhale:0,lit:0,transfer:0};
  if(!since||now<since)return off;
  if(stop&&now>=stop){
    const t=(now-stop)/1000;if(t>=SMOKING.putOutMs/1000)return off;
    return {phase:'extinguishing' as const,age:t,right:window(t,0,.35,1.3,1.8),left:0,mouth:1-smooth((t-.55)/.2),flame:0,
      visible:1-smooth((t-1.25)/.3),inhale:0,exhale:0,lit:1-smooth((t-.8)/.3),transfer:smooth((t-.75)/.6)};
  }
  if(age<SMOKING.lightMs/1000)return {phase:'lighting' as const,age,right:window(age,0,.45,2.6,3.6),left:window(age,1.2,1.7,2.6,3.35),
    mouth:smooth((age-1.35)/.2),flame:window(age,1.8,1.95,2.5,2.7),visible:smooth((age-.35)/.15),inhale:window(age,2,2.2,2.65,2.95),exhale:0,lit:smooth((age-2)/.4),transfer:smooth((age-.5)/1)};
  let seed=0;for(const c of id)seed=(Math.imul(seed,31)+c.charCodeAt(0))>>>0;
  const first=9+(seed%3000)/1000,period=13+((seed>>>4)%4000)/1000,t=age-SMOKING.lightMs/1000-first;
  const cycle=t<0?-100:t%period;
  return {phase:'lit' as const,age,right:0,left:0,mouth:1,flame:0,visible:1,inhale:window(cycle,0,.2,1,1.35),exhale:window(cycle,1.9,2.25,3.3,3.9),lit:1,transfer:1};
}
