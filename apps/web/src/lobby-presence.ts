/**
 * The entry's live line: how many people are in the bar now, from the world's public /game/health (the same answer the
 * edge's health check reads: a count and a capacity, nothing else is shown). It polls only while the entry is on screen
 * and the tab is visible; if the world does not answer, the line keeps its default text.
 */
const EVERY_MS=15_000;
export function createLobbyPresence(root:HTMLElement):void{
  const found=root.querySelector<HTMLElement>('#lobby-status');if(!found)return;const line:HTMLElement=found;
  const text=line.querySelector<HTMLElement>('span')!,idle=text.textContent!;
  let timer=0;
  const words=(players:number)=>players===0?'Bar vazio · chegue primeiro':players===1?'1 pessoa no bar agora':`${players} pessoas no bar agora`;
  async function poll():Promise<void>{
    if(root.classList.contains('hidden')||document.hidden)return;
    try{
      const response=await fetch('/game/health',{cache:'no-store',signal:AbortSignal.timeout(4000)});
      const body=await response.json() as {ok?:boolean;players?:number};
      if(response.ok&&body.ok&&Number.isFinite(body.players)){text.textContent=words(body.players!);line.classList.add('live');return;}
    }catch{/* No answer: the default line stays. */}
    text.textContent=idle;line.classList.remove('live');
  }
  const schedule=()=>{clearInterval(timer);timer=window.setInterval(()=>void poll(),EVERY_MS);};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void poll();});
  void poll();schedule();
}
