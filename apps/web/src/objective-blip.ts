/** Where BarScene.projectObjective puts the job station: on screen or off it, its distance and height difference. */
export interface ObjectiveView {x:number;y:number;onScreen:boolean;distance:number;above:number}

// CSS pixels: the badge (12px bold text in a 2px pill), its lift above the chevron, the screen margin, the arrow, and the
// margin of a badge on screen.
const HEIGHT=26,LIFT=26,EDGE=24,ARROW=16,MARGIN=6;

/** `accent`: the nova-ui.css token (and fallback) of the badge's neon; `edge`: off screen, keep it on the edge with an arrow. */
export interface BlipStyle {accent:readonly [token:string,fallback:string];edge:boolean}
const OBJECTIVE_STYLE:BlipStyle={accent:['--neon-green','#5fd86c'],edge:true};

/**
 * The worker's objective on screen: a badge over the station's chevron when it is in view, otherwise on the screen
 * edge with an arrow pointing to it. It is drawn on its own canvas, and only when it changes. Following the camera
 * with a DOM element restyled the page on every frame; with the browser's accessibility services on (screen readers,
 * password managers, Windows UI Automation clients) that rebuilt the accessibility tree each frame and froze the game
 * during a shift. Other blips (the stage's entry and its telão) use the same badge with their own colour and title.
 */
export function createObjectiveBlip(canvas:HTMLCanvasElement,style:BlipStyle=OBJECTIVE_STYLE){
  const context=canvas.getContext('2d');
  let drawn='',theme:{accent:string;card:string;font:string}|undefined;
  // nova-ui.css tokens; a colour the canvas cannot parse leaves the fallback in place.
  const token=(css:CSSStyleDeclaration,name:string,fallback:string)=>{context!.fillStyle=fallback;context!.fillStyle=css.getPropertyValue(name).trim()||fallback;return String(context!.fillStyle);};
  void document.fonts?.ready.then(()=>{theme=undefined;drawn='';});
  /** `title`: what the blip is, before the distance (none for the job objective). */
  return {render(view:ObjectiveView|null,title=''):void {
    if(!view||!context||(!view.onScreen&&!style.edge)){if(!canvas.hidden){canvas.hidden=true;drawn='';}return;}
    const ratio=Math.min(devicePixelRatio||1,2),width=Math.round(innerWidth*ratio),height=Math.round(innerHeight*ratio);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;drawn='';}
    if(!theme){const css=getComputedStyle(canvas);theme={accent:token(css,...style.accent),card:token(css,'--card','#2e1d15e6'),font:`700 12px ${css.fontFamily}`};}
    const floor=view.above>1.5?' · suba':view.above<-1.5?' · desça':'';
    const label=`${title?`${title} · `:''}${view.distance<10?view.distance.toFixed(1).replace('.',','):Math.round(view.distance)} m${floor}`;
    context.font=theme.font;
    const w=Math.ceil(context.measureText(label).width)+36,cx=innerWidth/2,cy=innerHeight/2;
    let x=view.x,y=view.y-LIFT-HEIGHT/2,angle:number|undefined;
    if(!view.onScreen){
      // On the edge, the whole badge and its arrow stay inside the screen; the arrow leaves the badge towards the station.
      const dx=view.x-cx||1e-3,dy=view.y-cy||1e-3,scale=Math.min((cx-w/2-EDGE)/Math.abs(dx),(cy-HEIGHT/2-EDGE)/Math.abs(dy));
      x=cx+dx*scale;y=cy+dy*scale;angle=Math.atan2(dy,dx);
    }else{
      // A spot near the side of the view keeps its whole badge readable, slid in from the edge.
      x=Math.min(Math.max(x,w/2+MARGIN),innerWidth-w/2-MARGIN);y=Math.max(y,HEIGHT/2+MARGIN);
    }
    x=Math.round(x);y=Math.round(y);
    const key=`${x}:${y}:${angle?.toFixed(2)}:${label}:${width}x${height}`;
    if(key===drawn)return;
    drawn=key;if(canvas.hidden)canvas.hidden=false;
    context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,width,height);
    context.setTransform(ratio,0,0,ratio,x*ratio,y*ratio);
    const left=-w/2,pill=()=>{context.beginPath();context.roundRect(left+1,-HEIGHT/2+1,w-2,HEIGHT-2,HEIGHT/2);};
    // A soft glow under the pill, then the card, its neon border, the pulse dot and the distance.
    context.globalAlpha=.35;context.shadowColor=theme.accent;context.shadowBlur=14*ratio;context.fillStyle=theme.accent;pill();context.fill();
    context.globalAlpha=1;context.shadowBlur=0;context.fillStyle=theme.card;context.fill();
    context.lineWidth=2;context.strokeStyle=theme.accent;context.stroke();
    context.fillStyle=theme.accent;context.shadowBlur=8*ratio;context.beginPath();context.arc(left+14,0,4,0,Math.PI*2);context.fill();
    context.shadowBlur=0;context.textBaseline='middle';context.fillText(label,left+24,1);
    if(angle===undefined)return;
    const reach=Math.min(w/2/Math.max(Math.abs(Math.cos(angle)),1e-3),HEIGHT/2/Math.max(Math.abs(Math.sin(angle)),1e-3))+3;
    context.rotate(angle);context.shadowBlur=4*ratio;context.beginPath();context.moveTo(reach,-6);context.lineTo(reach+ARROW,0);context.lineTo(reach,6);context.closePath();context.fill();
    context.shadowBlur=0;
  }};
}
