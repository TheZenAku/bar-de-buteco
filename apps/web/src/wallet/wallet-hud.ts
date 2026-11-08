const still=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const money=(value:number)=>value.toLocaleString('pt-BR');
const ease=(t:number)=>1-(1-t)**3;

/**
 * The wallet in the header, finished like the level chip (levels/level-hud.ts): every coin that comes in or goes out —
 * shop, games, Pix, trades, jobs, the daily bonus — rolls the balance to its new value, floats "+N"/"−N" off the panel and
 * flashes it; what comes in also throws a few coins. It reads only the balance, so no transaction has to call it.
 */
export function createWalletHud(panel:HTMLElement){
  const value=panel.querySelector<HTMLElement>('#hud-balance')!;
  panel.insertAdjacentHTML('beforeend','<div class="wl-pops" aria-hidden="true"></div><p class="sr-only" aria-live="polite"></p>');
  const pops=panel.querySelector<HTMLElement>('.wl-pops')!,spoken=panel.querySelector<HTMLElement>('[aria-live]')!;
  let shown:number|undefined,target:number|undefined,frame=0;

  function pop(delta:number):void {
    const node=document.createElement('span'),gain=delta>0;
    node.className=`wl-pop ${gain?'up':'down'}`;node.textContent=`${gain?'+':'−'}${money(Math.abs(delta))}`;
    node.style.setProperty('--dx',`${Math.round(Math.random()*16-8)}px`);
    if(gain&&!still()){
      // More coins the more it was: 3 for a tip, 9 for a jackpot.
      const count=Math.min(9,3+Math.floor(Math.log10(delta))*2);
      node.insertAdjacentHTML('beforeend',Array.from({length:count},(_,i)=>`<i class="wl-coin" style="--a:${(-70+i*140/Math.max(1,count-1)+Math.random()*12).toFixed(0)}deg;--d:${(26+Math.random()*22).toFixed(0)}px;--t:${(i*.035).toFixed(2)}s"></i>`).join(''));
    }
    pops.append(node);node.addEventListener('animationend',event=>{if(event.target===node)node.remove();});
    if(pops.childElementCount>4)pops.firstElementChild?.remove();
    panel.classList.remove('wl-gain','wl-loss');void panel.offsetWidth;panel.classList.add(gain?'wl-gain':'wl-loss');
    spoken.textContent=`${gain?'Entrou':'Saiu'} ${money(Math.abs(delta))} moedas. Saldo: ${money(target!)}.`;
  }
  /** Rolls the number from what it shows to the new balance; bigger changes roll a little longer. */
  function roll(to:number):void {
    cancelAnimationFrame(frame);
    const from=shown??to,start=performance.now(),duration=still()?0:Math.min(1400,450+Math.log10(Math.abs(to-from)+1)*160);
    // The panel is as wide as the number and sits beside the level chip: hold the widest text so the header does not shift at each digit.
    value.style.minWidth=`${Math.max(money(from).length,money(to).length)}ch`;
    const step=(now:number)=>{
      const t=duration?Math.min(1,(now-start)/duration):1;
      shown=Math.round(from+(to-from)*ease(t));value.textContent=money(shown);
      if(t<1)frame=requestAnimationFrame(step);else value.style.minWidth=`${money(to).length}ch`;
    };
    frame=requestAnimationFrame(step);
  }

  return {
    /** The balance as the game knows it now (undefined: not in the bar). Called on every patch, so the same value is a no-op. */
    set(balance:number|undefined):void {
      if(balance===target)return;
      const before=target;target=balance;
      if(balance===undefined||before===undefined){
        // Arriving or leaving: just the value, nothing earned.
        cancelAnimationFrame(frame);shown=balance;value.textContent=balance===undefined?'…':money(balance);
        if(balance===undefined)pops.replaceChildren();
        return;
      }
      pop(balance-before);roll(balance);
    },
  };
}
export type WalletHud=ReturnType<typeof createWalletHud>;
