/**
 * The entry's hero: the Highland logo as a live neon sign (lobby-hero.css). It drops in with a flash, floats, flickers,
 * catches a light sweep and glitches now and then, over turning rays, a neon ring, searchlights and an equalizer; beer
 * bubbles rise behind the whole entry. The logo leans towards the pointer, and a click is a toast: a burst of bubbles,
 * stars and confetti, a glass clink and the cheer of the round (quick clicks keep the round going).
 */
const LOGO='/ui/logo-highland.webp';
const EQ_BARS=18,BUBBLES=22,SPARKLES=4;
// Quick clicks keep the round going: its cheer climbs this list, with the count from the third on.
const CHEERS=['Saúde!','Tim-tim!','Mais uma!','Ô loco!','Desce redondo!','Saideira!'];
const ROUND_MS=1300,BURST_PIECES=26,PIECE_MS=1100;
const COLOURS=['var(--hl-magenta)','var(--hl-cyan)','var(--hl-gold)','var(--hl-blue)','var(--hl-orange)','#fff'];

const repeat=(count:number,piece:(i:number)=>string)=>Array.from({length:count},(_,i)=>piece(i)).join('');

/** The hero's markup: decorative layers around the logo (role img, named for screen readers). */
export function lobbyHero():string{
  return `<aside class="lobby-hero" aria-label="Highland Bar">
    <div class="hero-stage">
      <span class="hero-beams" aria-hidden="true">${repeat(4,i=>`<i style="--i:${i}"></i>`)}</span>
      <span class="hero-rays" aria-hidden="true"></span><span class="hero-rays reverse" aria-hidden="true"></span>
      <span class="hero-halo" aria-hidden="true"></span>
      <span class="hero-ring" aria-hidden="true"></span>
      <span class="hero-orbit" aria-hidden="true">${repeat(SPARKLES,i=>`<i style="--i:${i}"></i>`)}</span>
      <div class="hero-logo" role="img" aria-label="Logo do Highland Bar">
        <div class="hero-bob"><div class="hero-tilt">
          <span class="hero-glitch cyan" aria-hidden="true"></span><span class="hero-glitch magenta" aria-hidden="true"></span>
          <img src="${LOGO}" alt="" width="720" height="720" draggable="false" fetchpriority="high">
          <span class="hero-shine" aria-hidden="true"></span>
        </div></div>
      </div>
      <span class="hero-flash" aria-hidden="true"></span>
      <span class="hero-burst" aria-hidden="true"></span>
    </div>
    <div class="hero-eq" aria-hidden="true">${repeat(EQ_BARS,i=>`<i style="--i:${i};--d:${(.42+((i*37)%11)/22).toFixed(2)}s"></i>`)}</div>
    <p class="hero-hint" aria-hidden="true">Clique na logo e <b>brinde</b></p>
  </aside>`;
}
/** Beer bubbles rising behind the entry: spread across the width, each its own size, speed and sway. */
export function lobbyBubbles():string{
  const random=(seed:number)=>{const x=Math.sin(seed*12.9898)*43758.5453;return x-Math.floor(x);};
  return `<div class="lobby-bubbles" aria-hidden="true">${repeat(BUBBLES,i=>{
    const size=6+random(i+1)*22,duration=9+random(i+7)*12;
    return `<i style="--x:${(random(i+3)*100).toFixed(1)}%;--s:${size.toFixed(0)}px;--t:${duration.toFixed(1)}s;--delay:${(-random(i+5)*duration).toFixed(1)}s;--sway:${(10+random(i+9)*30).toFixed(0)}px"></i>`;
  })}</div>`;
}

/** A short glass clink (two bright partials ringing out), only ever after a click. */
function clink(context:AudioContext):void{
  const now=context.currentTime,out=context.createGain();out.gain.value=.12;out.connect(context.destination);
  for(const [frequency,level,decay] of [[2637,1,.55],[3951,.55,.35],[5274,.25,.2]] as const)for(const at of [0,.07]){
    const tone=context.createOscillator(),gain=context.createGain();
    tone.type='sine';tone.frequency.value=frequency*(at?1.012:1);
    gain.gain.setValueAtTime(0,now+at);gain.gain.linearRampToValueAtTime(level*(at?.6:1),now+at+.004);gain.gain.exponentialRampToValueAtTime(.0001,now+at+decay);
    tone.connect(gain).connect(out);tone.start(now+at);tone.stop(now+at+decay+.05);
  }
}

/** Pointer lean and the toast on click. Everything else is CSS. */
export function createLobbyHero(root:HTMLElement):void{
  const hero=root.querySelector<HTMLElement>('.lobby-hero'),logo=hero?.querySelector<HTMLElement>('.hero-logo'),tilt=hero?.querySelector<HTMLElement>('.hero-tilt');
  const burst=hero?.querySelector<HTMLElement>('.hero-burst');
  if(!hero||!logo||!tilt||!burst)return;
  const still=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The logo leans towards the pointer anywhere on the entry (one write per frame at most).
  let lean:[number,number]|undefined,frame=0;
  const apply=()=>{frame=0;const [x,y]=lean??[0,0];hero.style.setProperty('--lean-x',x.toFixed(3));hero.style.setProperty('--lean-y',y.toFixed(3));};
  root.addEventListener('pointermove',event=>{
    if(event.pointerType!=='mouse'||still())return;
    const box=logo.getBoundingClientRect(),cx=box.left+box.width/2,cy=box.top+box.height/2;
    const clampUnit=(v:number)=>Math.max(-1,Math.min(1,v));
    lean=[clampUnit((event.clientX-cx)/(innerWidth/2)),clampUnit((event.clientY-cy)/(innerHeight/2))];
    frame||=requestAnimationFrame(apply);
  });
  root.addEventListener('pointerleave',()=>{lean=undefined;frame||=requestAnimationFrame(apply);});

  let round=0,lastToast=0,audio:AudioContext|undefined;
  logo.addEventListener('click',event=>{
    const now=performance.now();round=now-lastToast<ROUND_MS?round+1:0;lastToast=now;
    try{audio??=new AudioContext();if(audio.state==='suspended')void audio.resume();clink(audio);}catch{/* No sound: the toast still shows. */}
    // Restart the squash, and the halo's flash with it.
    hero.classList.remove('toasting');void hero.offsetWidth;hero.classList.add('toasting');
    const box=burst.getBoundingClientRect(),x=event.clientX?event.clientX-box.left:box.width/2,y=event.clientY?event.clientY-box.top:box.height/2;
    burst.querySelectorAll('.hero-cheer').forEach(node=>node.remove());
    const cheer=document.createElement('b');cheer.className='hero-cheer';
    cheer.textContent=round>=2?`${CHEERS[round%CHEERS.length]} ×${round+1}`:CHEERS[round]!;
    cheer.style.setProperty('--tilt',`${(Math.random()*16-8).toFixed(1)}deg`);burst.append(cheer);
    if(!still())for(let i=0;i<BURST_PIECES;i++){
      const piece=document.createElement('i'),angle=Math.random()*Math.PI*2,distance=90+Math.random()*170;
      piece.className=`piece ${['bubble','star','confetti'][i%3]}`;
      piece.style.cssText=`left:${x}px;top:${y}px;--dx:${(Math.cos(angle)*distance).toFixed(0)}px;--dy:${(Math.sin(angle)*distance-60).toFixed(0)}px;--spin:${(Math.random()*720-360).toFixed(0)}deg;--c:${COLOURS[i%COLOURS.length]};--size:${(6+Math.random()*10).toFixed(0)}px`;
      burst.append(piece);
    }
    // Timers, not animationend: with reduced motion nothing animates and the pieces must still go.
    const made=[...burst.children].slice(-1-(still()?0:BURST_PIECES));
    setTimeout(()=>made.forEach(node=>node.remove()),PIECE_MS);
  });
}
