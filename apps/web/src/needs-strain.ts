import {reserveStrain,type PlayerState} from '@bar/shared';
import {NO_STRAIN,StrainSounds,type Strains} from './needs-strain-sound';

/**
 * How deep into its reserve each of the player's needs is (reserveStrain), all zero when there is nobody to feel it: not in the
 * world, fainted, or dead (the Morte has its own picture and sound).
 */
export function strainsOf(self:PlayerState|undefined):Strains {
  if(!self||self.condition==='fainted'||((self.hp??100)<=0&&(self.hpCore??100)<=0))return {...NO_STRAIN};
  return {
    hp:reserveStrain('hp',self.hp??100,self.hpCore??100),
    stamina:reserveStrain('stamina',self.stamina??100,self.staminaCore??100),
    hunger:reserveStrain('hunger',self.hunger??100,self.hungerCore??100),
    thirst:reserveStrain('thirst',self.thirst??100,self.thirstCore??100),
  };
}

const bump=(seconds:number)=>Math.exp(-((seconds/.07)**2));

/**
 * The screen of living on the reserve: a soft coloured border (.reserve-fx, needs.css) and a sway of the picture, with each
 * need in its own manner, plus the sounds (needs-strain-sound.ts). Everything eases in and out, however the numbers jump.
 *  - stamina: dark green, breathing in and out with a labored roll and bob.
 *  - life: dark red, beating with the heart: the border and a small thump of the picture on each beat, which also plays its sound.
 *  - hunger: ochre, a slow drift and dip, like a light head.
 *  - thirst: pale and dry, a fast faint shimmer.
 * It runs only while there is something to show or fade, and leaves the world's own style as it found it. With reduced motion the
 * border stays and the picture holds still.
 */
export class StrainEffects {
  private target:Strains={...NO_STRAIN};
  private level:Strains={...NO_STRAIN};
  private frame=0;
  private last=0;
  private beat=0;
  private idleSince=0;
  private shown=false;
  private readonly still=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):undefined;
  constructor(private sounds:StrainSounds){}

  set(strains:Strains):void {
    this.target=strains;
    // Nothing to show or fade: no loop at all (this is called with every state patch).
    const live=this.shown||Object.values(strains).some(v=>v>0)||Object.values(this.level).some(v=>v>0);
    if(!this.frame&&live)this.frame=requestAnimationFrame(this.tick);
  }
  private clear(fx:HTMLElement|null,world:HTMLElement|null):void {
    for(const name of ['--st','--hp','--hu','--th'])fx?.style.setProperty(name,'0');
    if(world)for(const name of ['rotate','translate','scale'])world.style.removeProperty(name);
    this.shown=false;
  }
  private tick=(time:number):void=>{
    this.frame=0;
    const dt=Math.min(.1,Math.max(0,(time-(this.last||time))/1000));this.last=time;
    const fx=document.querySelector<HTMLElement>('.reserve-fx'),world=document.getElementById('world');
    let top=0,busy=false;
    for(const key of ['hp','stamina','hunger','thirst'] as const){
      const goal=this.target[key],now=this.level[key];
      // In quickly, out slowly.
      const next=goal>now?Math.min(goal,now+dt*2.2):Math.max(goal,now-dt*.8);
      this.level[key]=next;top=Math.max(top,next);if(next>.002||goal>0)busy=true;
    }
    this.sounds.update(this.level,time);
    if(busy){
      this.idleSince=0;this.shown=true;
      const {hp,stamina:st,hunger:hu,thirst:th}=this.level,t=time/1000;
      // The heart sets its own pace (faster the deeper), and the picture thumps with each beat.
      const period=1.25-.35*hp;this.beat+=dt;
      if(this.beat>=period){this.beat-=period;if(hp>.03)this.sounds.heartbeat(hp);}
      const pulse=bump(this.beat)+.65*bump(this.beat-.2);
      const set=(name:string,value:number)=>fx?.style.setProperty(name,Math.min(1,Math.max(0,value)).toFixed(3));
      set('--st',st*(.72+.28*(.5+.5*Math.sin(t*3.9))));set('--hp',hp*(.45+.55*pulse));
      set('--hu',hu*(.85+.15*Math.sin(t*.8)));set('--th',th*(.9+.1*Math.sin(t*2.3)));
      if(world&&!this.still?.matches){
        const roll=st*.8*Math.sin(t*2.1)+hu*.55*Math.sin(t*.55)+th*.3*Math.sin(t*1.7);
        const x=st*3*Math.sin(t*1.9)+th*(2.2*Math.sin(t*7.3)+1.2*Math.sin(t*11.1));
        const y=st*5*Math.sin(t*3.9)+hu*6*Math.sin(t*.8+1);
        // The extra scale keeps the rolled picture's corners off the screen's edge.
        world.style.rotate=`${roll.toFixed(3)}deg`;world.style.translate=`${x.toFixed(2)}px ${y.toFixed(2)}px`;
        world.style.scale=(1+.012*Math.min(1,top*3)+.02*top+hp*.014*pulse).toFixed(4);
      }
      this.frame=requestAnimationFrame(this.tick);
    }else{
      // Nothing to show: put everything back once, then wait out the sounds' fade before stopping.
      if(this.shown)this.clear(fx,world);
      this.idleSince||=time;
      if(time-this.idleSince<3200)this.frame=requestAnimationFrame(this.tick);
      else this.last=0;
    }
  };
}

export function createStrain(volume:()=>number){return new StrainEffects(new StrainSounds(volume));}
