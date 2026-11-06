/**
 * A picture of the game's interface (HTML) for the VR headset, which cannot show a web page while it draws the 3D world.
 *
 * The page is cloned, the style sheets it needs are written into the clone, and the whole thing is drawn by the browser itself
 * as an SVG image (<foreignObject>), then copied to a canvas that becomes a texture. Nothing about the interface is rebuilt for
 * VR: every window, the phone, the tables and the chat are the same HTML, and the laser pointer clicks it where it is
 * (vr-panels.ts).
 *
 * What an SVG image cannot do, and what is done instead:
 *  - it loads nothing from the network: <img> are inlined as data URLs (the first picture of a new address shows up on the next
 *    capture), canvases are copied with toDataURL, video and iframes are left out;
 *  - it does not know the page's inline state: typed values, checked boxes and scroll positions are written into the clone;
 *  - it has its own :root: `html`, `:root` and `body` selectors are pointed at the wrapper that stands for them;
 *  - it starts animations at zero: they are switched off, so what is drawn is the resting state;
 *  - it loads no web fonts from the network: the page's own @font-face files are read once and written into the clone as data URLs
 *    (the first picture after start still uses the system font; the next one has the game's).
 *
 * The browser draws the image on the main thread, and a headset that stops for a frame is felt in the stomach. So a capture is
 * as small as it can be: only the style rules whose classes, ids and attributes exist in the clone are written (the sheets are
 * ~400 KB), and the hud and the watch capture only their own parts of the page (`parts`), not the whole of it.
 */
const SVG='http://www.w3.org/2000/svg',XHTML='http://www.w3.org/1999/xhtml';
/** Not part of the interface: the world, the names over it (3D has its own) and what is hidden. */
const DROP='script,style,link,noscript,video,audio,iframe,template,canvas#world,#labels,.vignette,[hidden],.hidden,[data-vr-skip]';
/** The largest picture the headset gets: text stays sharp, and the upload stays small. */
const MAX_WIDTH=1600,MAX_HEIGHT=1800,MAX_SCALE=2;
/** Makes a bare copy of an ancestor lay out nothing: no box of its own, nothing that would move or clip a part pinned inside it. */
const PLAIN=';position:static!important;transform:none!important;translate:none!important;rotate:none!important;scale:none!important;filter:none!important;perspective:none!important;contain:none!important;will-change:auto!important;display:block!important;width:auto!important;height:auto!important;min-width:0!important;max-width:none!important;max-height:none!important;overflow:visible!important;inset:auto!important;margin:0!important;padding:0!important;border:0!important;background:none!important;box-shadow:none!important;opacity:1!important;';
/** Characters XML does not allow at all: one in a chat line would stop the whole picture. */
const NOT_XML=/[\x00-\x08\x0B\x0C\x0E-\x1F]/g;
const escape=(text:string)=>text.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
/** UTF-8 text as base64 (btoa takes bytes, not characters). */
function toBase64(text:string):string {
  const bytes=new TextEncoder().encode(text);
  let binary='';
  for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(binary);
}

/** A style rule, with what it needs of the page to apply: the classes, ids and attributes its selectors name (one list per selector). */
interface Rule {text:string;any?:string[][];head?:string;children?:Rule[]}
const TOKEN=/\.(-?[_a-zA-Z][\w-]*)|#([_a-zA-Z][\w-]*)|\[\s*([\w-]+)/g;
function tokens(selector:string):string[]|null {
  // Selectors that look into other elements (:is, :has, :where) cannot be judged by their names alone: always kept.
  if(/:(is|where|has|matches|-webkit-any)\(/.test(selector))return null;
  const plain=selector.replace(/:not\([^)]*\)/g,'').replace(/"[^"]*"|'[^']*'/g,'');
  const found:string[]=[];
  for(const match of plain.matchAll(TOKEN))found.push(match[1]?`.${match[1]}`:match[2]?`#${match[2]}`:`[${match[3]}`);
  return found;
}
const retarget=(text:string)=>text.replace(/:root\b/g,'.vr-root').replace(/(^|[\s,{}>+~(])html(?![\w-])/g,'$1.vr-root').replace(/(^|[\s,{}>+~(])body(?![\w-])/g,'$1.vr-body');
function describe(rules:CSSRuleList):Rule[] {
  const out:Rule[]=[];
  for(const rule of Array.from(rules)){
    if(rule instanceof CSSStyleRule){
      const per=retarget(rule.selectorText).split(/,(?![^(]*\))/).map(tokens);
      out.push({text:retarget(rule.cssText).replace(/\]\]>/g,'] ]>'),...(per.some(list=>list===null||!list.length)?{}:{any:per as string[][]})});
    }else if(rule instanceof CSSMediaRule||rule instanceof CSSSupportsRule){
      out.push({text:'',head:retarget(rule.cssText.slice(0,rule.cssText.indexOf('{'))),children:describe(rule.cssRules)});
    }else if(rule.type===CSSRule.IMPORT_RULE||rule.type===CSSRule.FONT_FACE_RULE||rule.type===CSSRule.KEYFRAMES_RULE||rule.type===CSSRule.NAMESPACE_RULE||rule.type===CSSRule.PAGE_RULE){
      continue;
    }else out.push({text:retarget(rule.cssText)});
  }
  return out;
}
/** The @font-face rules of a sheet, each with the address of its file. */
function collectFaces(rules:CSSRuleList,into:Array<{css:string;url:string}>):void {
  for(const rule of Array.from(rules)){
    if(!(rule instanceof CSSFontFaceRule))continue;
    const url=/url\(["']?([^"')]+)["']?\)/.exec(rule.style.getPropertyValue('src'))?.[1];
    if(url&&!url.startsWith('data:'))into.push({url:new URL(url,rule.parentStyleSheet?.href??location.href).href,css:rule.cssText.replace(/font-display:[^;]*;?/,'')});
  }
}
function emit(rules:Rule[],names:Set<string>):string {
  let text='';
  for(const rule of rules){
    if(rule.children){
      const inner=emit(rule.children,names);
      if(inner)text+=`${rule.head}{${inner}}\n`;
    }else if(!rule.any||rule.any.some(list=>list.every(name=>names.has(name))))text+=`${rule.text}\n`;
  }
  return text;
}

interface Region {x:number;y:number;w:number;h:number}

export class DomMirror {
  readonly canvas=document.createElement('canvas');
  /** The page's size in CSS pixels at the last capture: the laser's points are in these. */
  width=1;
  height=1;
  /** The part of the page the canvas shows, in CSS pixels (all of it, unless `parts` were asked for), and canvas pixels per CSS pixel. */
  region:Region={x:0,y:0,w:1,h:1};
  scale=1;
  /** What the last capture was: the whole page (true), or only parts of it. */
  whole=true;
  /** A capture is running (they do not overlap). */
  busy=false;
  /** Called when something a capture waited for (a picture) has arrived. */
  onLate?:()=>void;
  /** Milliseconds the last capture took by stage, and the size of the markup: for tuning. */
  timing={build:0,load:0,draw:0,bytes:0};
  private readonly context=this.canvas.getContext('2d',{alpha:true})!;
  private rules:Rule[]=[];
  private rulesAt=-1e9;
  private sheets=-1;
  private readonly images=new Map<string,string|null>();
  /** The page's @font-face rules, and once read, each as a data URL rule (null: still being read). */
  private faces:Array<{css:string;url:string}>=[];
  private fontCss:string|null=null;

  /**
   * Draws the page, or only the elements `parts` name, now. Resolves true when the canvas has a new picture.
   * Parts that are not on screen are left out; if none is, nothing is drawn.
   */
  async capture(parts?:readonly string[]):Promise<boolean> {
    if(this.busy)return false;
    this.busy=true;
    try{
      const started=performance.now();
      const W=Math.max(320,window.innerWidth),H=Math.max(240,window.innerHeight);
      let markup:string,region:Region={x:0,y:0,w:W,h:H};
      if(parts){
        const built=this.slots(parts,W,H);
        if(!built)return false;
        markup=built.markup;region=built.region;
      }else markup=this.page(W,H);
      markup=markup.replace(NOT_XML,'');
      const scale=Math.min(MAX_SCALE,MAX_WIDTH/region.w,MAX_HEIGHT/region.h);
      const built=performance.now();
      // A data: address, not a blob: one: Chrome treats a blob SVG that holds HTML as foreign and taints the canvas it is drawn on.
      const url=`data:image/svg+xml;base64,${toBase64(markup)}`;
      const image=new Image();
      await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('A interface não pôde ser desenhada para o VR.'));image.src=url;});
      const loaded=performance.now();
      const width=Math.max(2,Math.round(region.w*scale)),height=Math.max(2,Math.round(region.h*scale));
      if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
      this.context.clearRect(0,0,width,height);
      this.context.drawImage(image,0,0,width,height);
      this.timing={build:Math.round(built-started),load:Math.round(loaded-built),draw:Math.round(performance.now()-loaded),bytes:markup.length};
      this.width=W;this.height=H;this.scale=scale;this.region=region;this.whole=!parts;
      return true;
    }catch(error){
      if(import.meta.env.DEV)console.warn('[vr] captura da interface falhou',error);
      return false;
    }finally{
      this.busy=false;
    }
  }

  /** The page's fonts as @font-face rules with their files inline; '' until they are read (then the page is asked to capture again). */
  private fonts():string {
    if(this.fontCss!==null)return this.fontCss;
    const faces=this.faces;
    this.fontCss='';
    void Promise.all(faces.map(async face=>{
      const blob=await (await fetch(face.url)).blob();
      const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});
      return face.css.replace(/src:[^;}]*/,`src:url(${data}) format("woff2")`);
    })).then(rules=>{if(this.faces===faces){if(rules.length){this.fontCss=rules.join(String.fromCharCode(10))+String.fromCharCode(10);this.onLate?.();}}}).catch(()=>{/* The system font stays. */});
    return '';
  }

  /** The style rules the clone can use, as one text pointed at the wrapper. */
  private styles(root:HTMLElement):string {
    const now=performance.now();
    if(!this.rules.length||document.styleSheets.length!==this.sheets||now-this.rulesAt>20000){
      const rules:Rule[]=[],faces:Array<{css:string;url:string}>=[];
      for(const sheet of Array.from(document.styleSheets)){
        try{rules.push(...describe(sheet.cssRules));collectFaces(sheet.cssRules,faces);}catch{/* A sheet from another origin cannot be read. */}
      }
      if(faces.map(face=>face.url).join()!==this.faces.map(face=>face.url).join())this.fontCss=null;
      this.faces=faces;this.rules=rules;this.sheets=document.styleSheets.length;this.rulesAt=now;
    }
    const names=new Set<string>(['.vr-root','.vr-body']);
    const note=(element:Element)=>{
      for(const name of Array.from(element.classList))names.add(`.${name}`);
      if(element.id)names.add(`#${element.id}`);
      for(const attribute of Array.from(element.attributes))names.add(`[${attribute.name}`);
    };
    note(root);
    for(const element of Array.from(root.querySelectorAll('*')))note(element);
    for(const name of Array.from(document.documentElement.classList))names.add(`.${name}`);
    // Resting state only, and cheap to draw; the body lets the 3D world show through.
    return `${this.fonts()}${emit(this.rules,names)}
.vr-root *{animation:none !important;transition:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;caret-color:transparent}
.vr-root{background:transparent !important}.vr-body{background:transparent !important;margin:0;width:100%;height:100%;position:relative;overflow:hidden}`;
  }

  private wrap(W:number,H:number,view:Region,body:HTMLElement):string {
    const root=document.documentElement,inline=root.getAttribute('style')??'';
    return `<svg xmlns="${SVG}" width="${view.w}" height="${view.h}" viewBox="${view.x} ${view.y} ${view.w} ${view.h}"><foreignObject x="0" y="0" width="${W}" height="${H}">`+
      `<div xmlns="${XHTML}" class="vr-root ${escape(root.className)}" style="${escape(inline)};width:${W}px;height:${H}px;position:relative;overflow:hidden;">`+
      `<style><![CDATA[${this.styles(body)}]]></style>${new XMLSerializer().serializeToString(body)}</div></foreignObject></svg>`;
  }

  /** The whole page. */
  private page(W:number,H:number):string {
    const body=document.body,clone=body.cloneNode(true) as HTMLElement;
    this.copyState(body,clone);
    for(const node of Array.from(clone.querySelectorAll(DROP)))node.remove();
    clone.classList.add('vr-body');
    return this.wrap(W,H,{x:0,y:0,w:W,h:H},clone);
  }

  /**
   * Only these parts of the page: each one cloned inside a bare copy of its ancestors (so the rules that look at them still
   * apply) and pinned where it is on screen. The picture is the box that holds them all.
   */
  private slots(parts:readonly string[],W:number,H:number):{markup:string;region:Region}|null {
    const found:Array<{element:HTMLElement;rect:DOMRect}>=[];
    for(const selector of parts){
      for(const element of Array.from(document.querySelectorAll<HTMLElement>(selector))){
        const rect=element.getBoundingClientRect();
        if(rect.width>2&&rect.height>2&&getComputedStyle(element).visibility!=='hidden')found.push({element,rect});
      }
    }
    if(!found.length)return null;
    // Ancestors are shared: one bare copy of each, however many parts hang from it.
    const copies=new Map<Element,HTMLElement>();
    const bare=(element:Element):HTMLElement=>{
      let copy=copies.get(element);
      if(copy)return copy;
      copy=element.cloneNode(false) as HTMLElement;
      // Only its names matter (the rules that look at them): whatever would move, clip or contain what hangs from it is switched off
      // (a `translate` on it would become the place a pinned part is measured from).
      copy.style.cssText+=PLAIN;
      copies.set(element,copy);
      if(element!==document.body&&element.parentElement)bare(element.parentElement).append(copy);
      return copy;
    };
    // Each part is pinned in a column at the corner of the picture, whatever corner of the page it came from: the picture is as
    // small as the parts, and a panel needs no cutting.
    const GAP=6;
    let y=0;
    for(const {element,rect} of found){
      const clone=element.cloneNode(true) as HTMLElement;
      this.copyState(element,clone);
      for(const node of Array.from(clone.querySelectorAll(DROP)))node.remove();
      clone.style.cssText+=`;position:fixed;left:0;top:${y}px;width:${rect.width}px;height:${rect.height}px;margin:0;transform:none;right:auto;bottom:auto;box-sizing:border-box;`;
      y+=rect.height+GAP;
      bare(element.parentElement??document.body).append(clone);
    }
    const body=bare(document.body),region={x:0,y:0,w:Math.max(...found.map(part=>part.rect.width)),h:y-GAP};
    body.classList.add('vr-body');
    return {markup:this.wrap(W,H,region,body),region};
  }

  /**
   * What the clone does not carry over by itself: typed values, ticks, the chosen option, scroll positions, canvases and pictures.
   * The original and its clone have the same shape, so the Nth element of one is the Nth of the other (done before anything is removed).
   */
  private copyState(original:HTMLElement,clone:HTMLElement):void {
    const from=original.querySelectorAll('*'),to=clone.querySelectorAll('*');
    for(let i=0;i<from.length;i++){
      const o=from[i]!,c=to[i];
      if(!c)break;
      if(o instanceof HTMLInputElement){
        if(o.type==='checkbox'||o.type==='radio')c.toggleAttribute('checked',o.checked);
        else c.setAttribute('value',o.value);
      }else if(o instanceof HTMLTextAreaElement)c.textContent=o.value;
      else if(o instanceof HTMLSelectElement){
        const options=c.querySelectorAll('option');
        options.forEach((option,index)=>option.toggleAttribute('selected',index===o.selectedIndex));
      }else if(o instanceof HTMLCanvasElement){
        const image=document.createElement('img');
        try{
          if(o.width&&o.height&&o.width*o.height<=900000&&o.getClientRects().length){
            image.src=o.toDataURL('image/png');
            image.className=o.className;image.id=o.id;image.setAttribute('style',o.getAttribute('style')??'');
            c.replaceWith(image);continue;
          }
        }catch{/* A canvas the browser will not read is left out. */}
        c.setAttribute('data-vr-skip','');
      }else if(o instanceof HTMLImageElement){
        const source=o.currentSrc||o.src;
        if(!source||source.startsWith('data:'))continue;
        const data=this.image(source);
        if(data)c.setAttribute('src',data);else c.removeAttribute('src');
      }
      if(o instanceof HTMLElement&&o.scrollTop>0&&c instanceof HTMLElement){
        c.style.overflow='hidden';
        Array.from(o.children).forEach((source,index)=>{
          const child=c.children[index];
          if(!(child instanceof HTMLElement))return;
          const mode=getComputedStyle(source).position;
          if(mode==='static'||mode==='relative'||mode==='sticky'){child.style.position='relative';child.style.top=`${-o.scrollTop}px`;}
        });
      }
    }
  }

  /** A picture as a data URL, or null while it is on its way (the page asks again when it lands). */
  private image(source:string):string|null {
    const known=this.images.get(source);
    if(known!==undefined)return known;
    this.images.set(source,null);
    fetch(source).then(response=>response.ok?response.blob():Promise.reject(new Error(String(response.status)))).then(blob=>{
      if(blob.size>900_000)return;
      const reader=new FileReader();
      reader.onload=()=>{this.images.set(source,String(reader.result));this.onLate?.();};
      reader.readAsDataURL(blob);
    }).catch(()=>{/* Stays null: drawn without. */});
    return null;
  }
}
