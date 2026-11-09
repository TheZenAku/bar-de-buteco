import type {WeaponsController} from '../controller';

/**
 * The first moments with a weapon (docs/sistemas/armas.md#hud): a small chip by the ammo counter says where the wheel and the Arsenal are, in the
 * device's own keys. It goes after a few seconds or as soon as the wheel opens, and stops coming once the wheel was used or after three
 * showings (kept in this browser). Nothing else is said: the rest is on screen or in the guide.
 */
const KEY='bar:armas:hint';
const SHOW_MS=9000,MAX_SHOWINGS=3;

export function createArmsHint(game:HTMLElement,weapons:WeaponsController):{used():void;destroy():void} {
  const chip=document.createElement('div');
  chip.className='wp-hint';chip.hidden=true;chip.setAttribute('role','status');
  let shownThisPage=false,timer=0;
  const read=()=>{try{return localStorage.getItem(KEY)??'';}catch{return '';}};
  const write=(value:string)=>{try{localStorage.setItem(KEY,value);}catch{/* Private window: the hint only comes once per page. */}};
  function hide():void {clearTimeout(timer);chip.hidden=true;}
  function show():void {
    const saved=read();
    if(shownThisPage||saved==='used'||Number(saved)>=MAX_SHOWINGS)return;
    // The chip lives on the ammo counter, which the HUD shows only with a weapon in hand.
    const ammo=game.querySelector('.wp-ammo');if(!ammo)return;
    shownThisPage=true;write(String((Number(saved)||0)+1));
    const device=weapons.device;
    chip.innerHTML=device==='touch'?'<span><b>Arma</b> abre a roda de armas e o Arsenal</span>'
      :device==='gamepad'?'<span><kbd>LB</kbd> roda de armas</span><span><kbd>D-pad →</kbd> arsenal</span>'
      :[['wheel','roda de armas'],['arsenal','arsenal']].flatMap(([action,text])=>{const key=weapons.keyName(action as 'wheel'|'arsenal');return key?[`<span><kbd>${key}</kbd> ${text}</span>`]:[];}).join('');
    if(!chip.innerHTML)return;
    ammo.append(chip);chip.hidden=false;
    // Restarts the fade (a reflow between the two class changes); without animations it simply stays until the timer.
    chip.classList.remove('wp-hint-run');void chip.offsetWidth;chip.classList.add('wp-hint-run');
    clearTimeout(timer);timer=window.setTimeout(hide,SHOW_MS);
  }
  const off=weapons.on('change',()=>{if(weapons.drawn)show();});
  return {
    used(){write('used');hide();},
    destroy(){off();hide();chip.remove();},
  };
}
