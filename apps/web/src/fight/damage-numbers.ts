/**
 * The damage of each punch that lands, floating up from where the fist met the body (docs/sistemas/luta.md). Everyone near sees the same number the
 * room took off, so a fight can be measured by eye. A few pooled elements over the canvas, moved with transforms only (no layout per frame).
 */
export type DamageKind='hit'|'heavy'|'ko'|'taken';
interface Floating {el:HTMLElement;x:number;y:number;z:number;born:number;life:number;drift:number;kind:DamageKind}
/** Seconds on screen, how high it floats (m), how big at 3 m (px). */
const LIFE={hit:.95,heavy:1.15,ko:1.6,taken:1.05} as const;
const RISE=.55,BASE_PX=30,MIN_PX=14,MAX_PX=46,POOL=24;

export class DamageNumbers {
  private readonly root:HTMLElement;
  private readonly live:Floating[]=[];
  private readonly free:HTMLElement[]=[];
  /** The numbers shown so far (tests). */
  readonly shown:{text:string;kind:DamageKind}[]=[];

  constructor(host:HTMLElement) {
    this.root=document.createElement('div');
    this.root.className='damage-numbers';this.root.setAttribute('aria-hidden','true');
    host.appendChild(this.root);
  }

  /** A number at this point of the world, now (seconds of the scene's clock). */
  show(at:{x:number;y:number;z:number},text:string,kind:DamageKind,now:number):void {
    let el=this.free.pop();
    if(!el){
      if(this.live.length>=POOL){const oldest=this.live.shift()!;el=oldest.el;}
      else{el=document.createElement('span');this.root.appendChild(el);}
    }
    el.className=`damage-number ${kind}`;el.textContent=text;el.style.opacity='0';
    this.live.push({el,x:at.x,y:at.y,z:at.z,born:now,life:LIFE[kind],drift:(Math.random()-.5)*.5,kind});
    this.shown.push({text,kind});if(this.shown.length>40)this.shown.shift();
  }

  /**
   * One frame. `project`: a point of the world on the screen (CSS pixels) and its distance from the eye, or undefined when behind it. `side`: the
   * screen's right in the world (a unit vector), so the drift stays sideways whichever way the camera looks.
   */
  update(now:number,project:(x:number,y:number,z:number)=>{x:number;y:number;distance:number}|undefined,side:{x:number;z:number}):void {
    for(let i=this.live.length-1;i>=0;i--){
      const item=this.live[i]!,age=(now-item.born)/item.life;
      if(age>=1||age<0){item.el.style.opacity='0';this.free.push(item.el);this.live.splice(i,1);continue;}
      const ease=1-(1-age)**3,lift=RISE*ease*(item.kind==='ko'?1.3:1),drift=item.drift*ease*.35;
      const point=project(item.x+side.x*drift,item.y+lift,item.z+side.z*drift);
      if(!point){item.el.style.opacity='0';continue;}
      // A pop as it lands, then it settles; it fades over its last third.
      const pop=age<.12?1+(item.kind==='hit'?.5:.8)*(1-age/.12):1,size=Math.max(MIN_PX,Math.min(MAX_PX,BASE_PX*3/Math.max(.8,point.distance)));
      const scale=pop*size/BASE_PX,fade=age>.66?1-(age-.66)/.34:1;
      item.el.style.opacity=fade.toFixed(3);
      item.el.style.transform=`translate3d(${point.x.toFixed(1)}px,${point.y.toFixed(1)}px,0) translate(-50%,-50%) scale(${scale.toFixed(3)})`;
    }
  }
  clear():void {
    for(const item of this.live){item.el.style.opacity='0';this.free.push(item.el);}
    this.live.length=0;
  }
  destroy():void {this.root.remove();this.live.length=0;this.free.length=0;}
}
