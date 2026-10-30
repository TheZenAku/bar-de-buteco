/**
 * What the stage show's laser draws on the telão (stage-show.ts): a single-stroke font for the letreiro and a few
 * drawings, as polylines a laser traces one after another. Units: a capital is 6 tall, sitting on y = 0.
 */

/** A polyline: x, y, x, y… */
type Stroke = number[];
interface Glyph {width:number;strokes:Stroke[]}
/** A drawing centred on (0, 0): its segments in tracing order, with where each starts along the whole trace. */
export interface Drawing {
  /** Per segment: x0, y0, x1, y1, start, length. */
  segments:Float32Array;
  /** Where each stroke starts along the trace (the laser blanks between strokes). */
  strokes:number[];
  length:number;width:number;height:number;
}

const RAD = Math.PI/180;
/** An elliptical arc from `a0` to `a1` degrees (either way round), about every 15°. */
function arc(cx:number,cy:number,rx:number,ry:number,a0:number,a1:number):Stroke {
  const n = Math.max(2,Math.ceil(Math.abs(a1-a0)/15)),out:Stroke = [];
  for (let i = 0; i <= n; i++) {const a = (a0+(a1-a0)*i/n)*RAD;out.push(cx+rx*Math.cos(a),cy+ry*Math.sin(a));}
  return out;
}
const join = (...parts:Stroke[]):Stroke => parts.flat();
const heart = (cx:number,cy:number,size:number):Stroke => {
  const out:Stroke = [];
  for (let i = 0; i <= 36; i++) {
    const t = i/36*Math.PI*2;
    out.push(cx+size*Math.sin(t)**3,cy+size*(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))/17);
  }
  return out;
};

const O:Stroke = arc(2.1,3,2.1,3,90,450);
const P:Stroke[] = [join([0,0,0,6,2.3,6],arc(2.3,4.5,1.5,1.5,90,-90),[0,3])];
const GLYPHS:Record<string,Glyph> = {
  A:{width:4,strokes:[[0,0,2,6,4,0],[.67,2,3.33,2]]},
  B:{width:4,strokes:[join([0,0,0,6,2.3,6],arc(2.3,4.55,1.45,1.45,90,-90),[0,3.1]),join([0,3.1,2.4,3.1],arc(2.4,1.55,1.6,1.55,90,-90),[0,0])]},
  C:{width:4,strokes:[arc(2,3,2,3,45,315)]},
  D:{width:4,strokes:[join([0,0,0,6,1.4,6],arc(1.4,3,2.6,3,90,-90),[0,0])]},
  E:{width:3.6,strokes:[[3.6,6,0,6,0,0,3.6,0],[0,3,2.8,3]]},
  F:{width:3.6,strokes:[[3.6,6,0,6,0,0],[0,3,2.8,3]]},
  G:{width:4,strokes:[join(arc(2,3,2,3,45,360),[2.3,3])]},
  H:{width:4,strokes:[[0,0,0,6],[4,0,4,6],[0,3,4,3]]},
  I:{width:2,strokes:[[1,0,1,6],[0,6,2,6],[0,0,2,0]]},
  J:{width:3.6,strokes:[join([3.6,6,3.6,1.8],arc(1.8,1.8,1.8,1.8,0,-180))]},
  K:{width:3.8,strokes:[[0,0,0,6],[3.8,6,0,2.2],[1.25,3.1,3.8,0]]},
  L:{width:3.4,strokes:[[0,6,0,0,3.4,0]]},
  M:{width:4.6,strokes:[[0,0,0,6,2.3,2.4,4.6,6,4.6,0]]},
  N:{width:4,strokes:[[0,0,0,6,4,0,4,6]]},
  O:{width:4.2,strokes:[O]},
  P:{width:3.8,strokes:P},
  Q:{width:4.2,strokes:[O,[2.6,1.3,4.3,-.3]]},
  R:{width:3.8,strokes:[...P,[2.1,3,3.8,0]]},
  S:{width:4,strokes:[join(arc(2,4.5,1.9,1.5,15,270),arc(2,1.5,2,1.5,90,-165))]},
  T:{width:4,strokes:[[0,6,4,6],[2,6,2,0]]},
  U:{width:4,strokes:[join([0,6,0,2],arc(2,2,2,2,180,360),[4,6])]},
  V:{width:4,strokes:[[0,6,2,0,4,6]]},
  W:{width:5,strokes:[[0,6,1.25,0,2.5,4,3.75,0,5,6]]},
  X:{width:4,strokes:[[0,0,4,6],[0,6,4,0]]},
  Y:{width:4,strokes:[[0,6,2,3,4,6],[2,3,2,0]]},
  Z:{width:4,strokes:[[0,6,4,6,0,0,4,0]]},
  0:{width:3.6,strokes:[arc(1.8,3,1.8,3,90,450),[.5,1,3.1,5]]},
  1:{width:2.6,strokes:[[0,4.6,1.5,6,1.5,0],[0,0,2.6,0]]},
  2:{width:3.8,strokes:[join(arc(1.9,4.2,1.9,1.8,165,-25),[0,0,3.8,0])]},
  3:{width:3.8,strokes:[join(arc(1.9,4.5,1.8,1.5,150,-90),arc(1.9,1.5,1.9,1.5,90,-150))]},
  4:{width:4,strokes:[[3,0,3,6,0,1.8,4,1.8]]},
  5:{width:3.8,strokes:[join([3.6,6,.5,6,.3,3.3],arc(1.9,1.9,1.9,1.9,120,-145))]},
  6:{width:3.8,strokes:[join(arc(2,3,1.95,3,60,180),arc(1.95,1.85,1.9,1.85,180,540))]},
  7:{width:3.8,strokes:[[0,6,3.8,6,1.3,0]]},
  8:{width:3.8,strokes:[join(arc(1.9,4.55,1.6,1.45,-90,270),arc(1.9,1.55,1.9,1.55,90,450))]},
  9:{width:3.8,strokes:[join(arc(1.9,4.1,1.9,1.9,0,360),[3,0])]},
  '!':{width:1,strokes:[[.5,6,.5,1.8],[.5,.35,.5,0]]},
  '?':{width:3.6,strokes:[join(arc(1.8,4.3,1.8,1.7,160,-60),[1.8,2.1,1.8,1.5]),[1.8,.35,1.8,0]]},
  '.':{width:1,strokes:[[.5,.35,.5,0]]},
  '-':{width:3,strokes:[[.3,3,2.7,3]]},
  '♥':{width:4.6,strokes:[heart(2.3,3.2,2.3)]},
  ' ':{width:2.4,strokes:[]},
};
/** Space between letters, and between the two lines of a long letreiro. */
const TRACKING = 1.3,LEADING = 2.6;
export const LASER_GLYPHS = Object.keys(GLYPHS);

/** Strokes (in tracing order) to a drawing centred on (0, 0). */
function drawing(strokes:Stroke[],width:number,height:number,cx:number,cy:number):Drawing {
  const segments:number[] = [],starts:number[] = [];let length = 0;
  for (const stroke of strokes) {
    starts.push(length);
    for (let i = 0; i+3 < stroke.length; i += 2) {
      const x0 = stroke[i]!-cx,y0 = stroke[i+1]!-cy,x1 = stroke[i+2]!-cx,y1 = stroke[i+3]!-cy,l = Math.hypot(x1-x0,y1-y0);
      if (l < 1e-4) continue;
      segments.push(x0,y0,x1,y1,length,l);length += l;
    }
  }
  return {segments:Float32Array.from(segments),strokes:starts,length,width,height};
}

/** One line of text laid out from x = 0, on y = `y`: its strokes and width. */
function line(text:string,y:number):{strokes:Stroke[];width:number} {
  const strokes:Stroke[] = [];let x = 0;
  for (const [i,char] of [...text].entries()) {
    const glyph = GLYPHS[char]??GLYPHS[' ']!;
    if (i) x += TRACKING;
    for (const stroke of glyph.strokes) strokes.push(stroke.map((v,k) => k%2 ? v+y : v+x));
    x += glyph.width;
  }
  return {strokes,width:x};
}

const texts = new Map<string,Drawing>();
/** The letreiro: one line, or two (split at the space nearest the middle) when it is long and has a space. */
export function textDrawing(text:string):Drawing {
  let cached = texts.get(text);
  if (cached) return cached;
  const chars = [...text],spaces = chars.map((c,i) => c === ' ' ? i : -1).filter(i => i > 0);
  const split = chars.length > 9 && spaces.length ? spaces.reduce((a,b) => Math.abs(b-chars.length/2) < Math.abs(a-chars.length/2) ? b : a) : -1;
  const rows = split < 0 ? [text] : [chars.slice(0,split).join(''),chars.slice(split+1).join('')];
  const height = rows.length*6+(rows.length-1)*LEADING,laid = rows.map((row,i) => line(row,height-6-i*(6+LEADING)));
  const width = Math.max(...laid.map(l => l.width));
  // Each row centred on the widest.
  const strokes = laid.flatMap(l => l.strokes.map(s => s.map((v,k) => k%2 ? v : v+(width-l.width)/2)));
  cached = drawing(strokes,width,height,width/2,height/2);
  if (texts.size > 32) texts.clear();
  texts.set(text,cached);
  return cached;
}

function star():Stroke {
  const out:Stroke = [];
  for (let i = 0; i <= 10; i++) {const r = i%2 ? 1.25 : 3,a = (90+i*36)*RAD;out.push(r*Math.cos(a),r*Math.sin(a));}
  return out;
}
/** The drawings, about 6 tall: a star, a heart, a mug of chopp (foam, handle, bubbles) and a pair of quavers. */
export const LASER_SHAPES:ReadonlyArray<{id:string;drawing:Drawing}> = [
  {id:'estrela',drawing:drawing([star()],6,6,0,.2)},
  {id:'coracao',drawing:drawing([heart(0,0,3.2)],6.4,6,0,.6)},
  {id:'caneca',drawing:drawing([
    [0,4.9,0,0,3.6,0,3.6,4.9],
    join(arc(.45,4.9,.75,.7,180,0),arc(1.8,4.9,.7,.85,180,0),arc(3.15,4.9,.75,.7,180,0)),
    arc(3.6,2.6,1.2,1.4,90,-90),
    arc(1,1.1,.24,.24,0,360),arc(2.3,2,.2,.2,0,360),arc(1.5,3.2,.28,.28,0,360),
  ],4.8,5.75,2.1,2.85)},
  {id:'notas',drawing:drawing([
    arc(.9,.7,.9,.6,0,360),[1.8,.7,1.8,5.4],arc(4.1,1.3,.9,.6,0,360),[5,1.3,5,6],[1.8,5.4,5,6],[1.8,4.6,5,5.2],
  ],5.9,6.6,2.5,2.9)},
];
