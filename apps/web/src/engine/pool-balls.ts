import * as pc from 'playcanvas';
import {POOL_TABLE,POOL_TABLES,decodeBalls,decodeTracks,poolPoint,trackAt,type PoolShotView,type PoolTableView,type PoolTrack} from '@bar/shared';

const R=POOL_TABLE.ballRadius;
const COLOURS=['#f4f1e8','#f2c21b','#1f5fd0','#d8262e','#5b2a9c','#f07a17','#13854d','#8c1f24','#141016'];
/** Where each pocket's hole is on P_Sinuca (table frame): the balls drop there. */
const HOLES=[[-1,-.5],[0,-.52],[1,-.5],[-1,.5],[0,.52],[1,.5]] as const;
/** P_Sinuca's decorative rack and cue lie inside this box above the cloth (table frame, metres). */
const DECOR={x:.94,z:.44,low:-.001,high:.075};

/**
 * The pool balls on the 3D tables of the games hall: whoever is near a table sees its rack and every stroke roll, from the
 * same views and recorded paths as the panel (pool.view, pool.shot). The map's own table model carries a decorative rack
 * and cue merged into its meshes: their triangles are taken out when the map loads, so only the game's balls are there.
 */
export class PoolBalls {
  private readonly tables=new Map<string,{balls:Map<number,{entity:pc.Entity;x:number;y:number}>;view?:PoolTableView;
    playback?:{tracks:Map<number,PoolTrack>;started:number;duration:number;shot:number}}>();
  private readonly materials=new Map<number,pc.StandardMaterial>();
  constructor(private readonly app:pc.Application){
    for(const place of POOL_TABLES)this.tables.set(place.id,{balls:new Map()});
  }

  /** Takes the map's decorative balls and cue off the pool tables' cloth. Returns how many triangles went. */
  hideMapDecor(map:pc.Entity):number {
    let removed=0;
    const position=new pc.Vec3(),boxes=POOL_TABLES.map(t=>({x:t.x,z:t.z,felt:t.y+POOL_TABLE.felt}));
    for(const render of map.findComponents('render') as pc.RenderComponent[])for(const instance of render.meshInstances){
      const aabb=instance.aabb,min=aabb.getMin(),max=aabb.getMax();
      if(!boxes.some(b=>min.x<b.x+DECOR.x&&max.x>b.x-DECOR.x&&min.z<b.z+DECOR.z&&max.z>b.z-DECOR.z&&min.y<b.felt+DECOR.high&&max.y>b.felt+DECOR.low))continue;
      const mesh=instance.mesh,ib=mesh?.indexBuffer[0],prim=mesh?.primitive[0];
      if(!mesh||!ib||!prim)continue;
      const positions:number[]=[];
      try{mesh.getPositions(positions);}catch{continue;}
      if(!positions.length)continue;
      const world=instance.node.getWorldTransform(),count=positions.length/3,inside=new Uint8Array(count),above=new Uint8Array(count);
      for(let i=0;i<count;i++){
        world.transformPoint(position.set(positions[i*3]!,positions[i*3+1]!,positions[i*3+2]!),position);
        for(const b of boxes){
          const dy=position.y-b.felt;
          if(Math.abs(position.x-b.x)<DECOR.x&&Math.abs(position.z-b.z)<DECOR.z&&dy>DECOR.low&&dy<DECOR.high){inside[i]=1;if(dy>.004)above[i]=1;break;}
        }
      }
      const locked=ib.lock(),buffer=locked instanceof ArrayBuffer?locked:locked.buffer as ArrayBuffer,offset=locked instanceof ArrayBuffer?0:locked.byteOffset;
      const indices=ib.format===pc.INDEXFORMAT_UINT32?new Uint32Array(buffer,offset):ib.format===pc.INDEXFORMAT_UINT16?new Uint16Array(buffer,offset):new Uint8Array(buffer,offset);
      let changed=false;
      for(let t=prim.base;t+2<prim.base+prim.count;t+=3){
        const a=indices[t]!,b=indices[t+1]!,c=indices[t+2]!;
        // A triangle wholly on the cloth's box and not lying flat on the cloth: part of a ball or the cue.
        if(inside[a]&&inside[b]&&inside[c]&&(above[a]||above[b]||above[c])){indices[t+1]=a;indices[t+2]=a;changed=true;removed++;}
      }
      if(changed)ib.unlock();
    }
    return removed;
  }

  view(view:PoolTableView):void {
    const table=this.tables.get(view.id);if(!table)return;
    table.view=view;
    if(!table.playback)this.place(view.id);
  }
  shot(shot:PoolShotView,serverNow:number):void {
    const table=this.tables.get(shot.tableId);if(!table)return;
    const late=Math.max(0,Math.min(shot.duration,serverNow-shot.startAt-200));
    table.playback={tracks:new Map(decodeTracks(shot.tracks).map(t=>[t.n,t])),started:performance.now()-late,duration:shot.duration,shot:shot.shot};
  }
  update():void {
    const now=performance.now();
    for(const [id,table] of this.tables){
      const play=table.playback;
      if(!play)continue;
      const elapsed=now-play.started,place=POOL_TABLES.find(t=>t.id===id)!;
      for(const [n,track] of play.tracks){
        const ball=this.ball(id,n),at=trackAt(track,elapsed);
        if(at.gone){
          const since=elapsed-(track.t[track.t.length-1]??0),hole=HOLES[track.pocket];
          if(track.end==='pocket'&&hole&&since<350){
            // Into the hole, and down.
            const k=Math.min(1,since/200),x=at.x+(hole[0]-at.x)*k,y=at.y+(hole[1]-at.y)*k,p=poolPoint(place,x,y,-Math.max(0,since-150)/200*.07);
            ball.entity.enabled=true;ball.entity.setPosition(p.x,p.y,p.z);
          }else ball.entity.enabled=false;
          continue;
        }
        this.move(place,ball,at.x,at.y);
      }
      if(elapsed>play.duration+60&&table.view&&(table.view.phase!=='rolling'||table.view.shot>play.shot+1)){table.playback=undefined;this.place(id);}
    }
  }
  destroy():void {for(const table of this.tables.values())for(const ball of table.balls.values())ball.entity.destroy();this.tables.clear();for(const m of this.materials.values()){m.diffuseMap?.destroy();m.destroy();}}

  /** Every ball where the view says (rolled there, so its number keeps turning the right way); the others put away. */
  private place(id:string):void {
    const table=this.tables.get(id)!,view=table.view;if(!view)return;
    const place=POOL_TABLES.find(t=>t.id===id)!,on=decodeBalls(view.balls),here=new Set(on.map(b=>b.n));
    for(const b of on){const ball=this.ball(id,b.n);ball.entity.enabled=true;this.move(place,ball,b.x,b.y,Math.hypot(ball.x-b.x,ball.y-b.y)>.2);}
    for(const [n,ball] of table.balls)if(!here.has(n))ball.entity.enabled=false;
  }
  private move(place:(typeof POOL_TABLES)[number],ball:{entity:pc.Entity;x:number;y:number},x:number,y:number,jump=false):void {
    const dx=x-ball.x,dy=y-ball.y,d=Math.hypot(dx,dy);
    // Rolling on the cloth: about the axis across its way (up × d), by its distance over the radius.
    if(d>1e-6&&!jump){
      const turn=new pc.Quat().setFromAxisAngle(new pc.Vec3(dy/d,0,-dx/d),d/R*pc.math.RAD_TO_DEG);
      ball.entity.setRotation(turn.mul(ball.entity.getRotation()));
    }
    ball.x=x;ball.y=y;
    const p=poolPoint(place,x,y);ball.entity.setPosition(p.x,p.y,p.z);
  }
  private ball(id:string,n:number):{entity:pc.Entity;x:number;y:number} {
    const table=this.tables.get(id)!;
    let ball=table.balls.get(n);
    if(ball)return ball;
    const entity=new pc.Entity(`Pool ball ${n} ${id}`);
    entity.addComponent('render',{type:'sphere',material:this.material(n),castShadows:true,receiveShadows:true});
    entity.setLocalScale(R*2,R*2,R*2);
    entity.setRotation(new pc.Quat().setFromEulerAngles((n*47)%360,(n*131)%360,(n*73)%360));
    this.app.root.addChild(entity);
    ball={entity,x:Number.NaN,y:Number.NaN};table.balls.set(n,ball);
    return ball;
  }
  /** A ball's cloth: its colour (a band for the stripes), its number on two white discs; the cue ball's red dots. */
  private material(n:number):pc.StandardMaterial {
    const existing=this.materials.get(n);if(existing)return existing;
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
    const c=canvas.getContext('2d')!,colour=COLOURS[n===0?0:n===8?8:n>8?n-8:n]!;
    c.fillStyle=n>8||n===0?'#f4f1e8':colour;c.fillRect(0,0,256,128);
    if(n>8){c.fillStyle=colour;c.fillRect(0,34,256,60);}
    if(n===0){c.fillStyle='#c41e2e';for(const [u,v] of [[32,64],[96,64],[160,64],[224,64],[128,6],[128,122]])c.beginPath(),c.ellipse(u,v,v===64?6:40,6,0,0,Math.PI*2),c.fill();}
    else for(const u of [64,192]){
      c.fillStyle='#f6f3ec';c.beginPath();c.ellipse(u,64,22,20,0,0,Math.PI*2);c.fill();
      c.fillStyle='#16111c';c.font='700 24px system-ui, sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(String(n),u,65);
    }
    const texture=new pc.Texture(this.app.graphicsDevice,{name:`Pool ball ${n}`,width:256,height:128,format:pc.PIXELFORMAT_SRGBA8,mipmaps:true,minFilter:pc.FILTER_LINEAR_MIPMAP_LINEAR,
      magFilter:pc.FILTER_LINEAR,anisotropy:4,addressU:pc.ADDRESS_REPEAT,addressV:pc.ADDRESS_CLAMP_TO_EDGE});
    texture.setSource(canvas);
    const material=new pc.StandardMaterial();
    material.diffuseMap=texture;material.gloss=.86;material.useMetalness=false;material.specular=new pc.Color(.35,.35,.35);
    material.update();
    this.materials.set(n,material);
    return material;
  }
}
