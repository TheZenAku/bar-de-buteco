import * as pc from 'playcanvas';
import {FOOSBALL,FOOSBALL_TABLES,decodeFrame,tablePoint,type FoosballFrame} from '@bar/shared';

/** Frames are drawn this far behind the room, as in the panel, so there is one on each side to blend. */
const DELAY_MS=90;
/** Without a frame for this long (the match ended, the player walked away), the ball goes. */
const STALE_MS=1500;

/**
 * The pebolim balls on the 3D tables of the games hall: whoever is near a match sees its ball run over the felt, blended
 * between the room's frames (foosball.frame) like the panel does. The table's rods and figures are part of the map.
 */
export class FoosballBalls {
  private readonly balls=new Map<string,{entity:pc.Entity;frames:Array<{t:number;x:number;y:number;frozen:boolean}>;seenAt:number}>();
  constructor(app:pc.Application,material:pc.StandardMaterial){
    for(const place of FOOSBALL_TABLES){
      const entity=new pc.Entity(`Pebolim ball ${place.id}`);
      entity.addComponent('render',{type:'sphere',material,castShadows:true,receiveShadows:false});
      entity.setLocalScale(FOOSBALL.ballRadius*2,FOOSBALL.ballRadius*2,FOOSBALL.ballRadius*2);
      entity.enabled=false;app.root.addChild(entity);
      this.balls.set(place.id,{entity,frames:[],seenAt:0});
    }
  }
  frame(frame:FoosballFrame):void {
    const ball=this.balls.get(frame.id);if(!ball)return;
    const decoded=decodeFrame(frame);
    if(ball.frames.length&&decoded.t<=ball.frames[ball.frames.length-1]!.t)return;
    ball.frames.push({t:decoded.t,x:decoded.ball.x,y:decoded.ball.y,frozen:decoded.frozen});
    while(ball.frames.length>8)ball.frames.shift();
    ball.seenAt=performance.now();
  }
  update(serverNow:number):void {
    const at=serverNow-DELAY_MS;
    for(const [id,ball] of this.balls){
      const live=ball.frames.length>0&&performance.now()-ball.seenAt<STALE_MS;
      ball.entity.enabled=live;
      if(!live){ball.frames.length=0;continue;}
      let i=ball.frames.length-1;
      while(i>0&&ball.frames[i]!.t>at)i--;
      const a=ball.frames[i]!,b=ball.frames[i+1],t=b?Math.max(0,Math.min(1,(at-a.t)/Math.max(1,b.t-a.t))):0;
      const x=b?a.x+(b.x-a.x)*t:a.x,y=b?a.y+(b.y-a.y)*t:a.y,place=FOOSBALL_TABLES.find(p=>p.id===id)!,point=tablePoint(place,x,y);
      ball.entity.setPosition(point.x,point.y,point.z);
    }
  }
  destroy():void {for(const ball of this.balls.values())ball.entity.destroy();this.balls.clear();}
}
