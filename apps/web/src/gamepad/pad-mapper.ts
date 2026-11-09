import {PAD,Repeater,type PadButton,type PadFrame} from './gamepad';

/**
 * What the pad's buttons do (docs/sistemas/controle.md#botoes). In the world: left stick walks (the touch axis), L3 runs (a latch let go when the
 * stick rests) or, through a scope, holds the breath; LT aims, RT fires, X reloads (unarmed: the fist guard, as R), B holsters or draws, Y the fire
 * mode, A interacts (E), LB held opens the weapon wheel (the right stick picks, letting go chooses) and a tap goes back to the previous weapon, RB the
 * next, D-pad up and down step a scope's zoom, D-pad right opens the Arsenal, Start the pause menu (Esc), View the names (Z), R3 swaps the shoulder.
 * With the fist guard up and no weapon: RT a light punch, LT a heavy one, RB held blocks. In a menu or a window: D-pad and left stick are the
 * arrows, A Enter, B Escape, LB and RB Q and E (the pause menu's tabs), Start Escape.
 */
export interface PadHost {
  /** A window, the pause menu, the phone or a panel is in front: the pad navigates it. */
  menu():boolean;
  /** Synthetic keys, as the touch overlay presses them (a press is down and up; hold splits them). */
  press(code:string):void;
  hold(code:string,down:boolean):void;
  move(x:number,y:number):void;
  sprint(on:boolean):void;
  /** /armas is on, a weapon is in hand, the view goes through a scope, the fist guard is up. */
  system():boolean;drawn():boolean;scoped():boolean;guard():boolean;
  aim(down:boolean):void;trigger(down:boolean):void;breath(down:boolean):void;
  reload():void;holster():void;mode():void;step(direction:1|-1):void;zoom(direction:1|-1):void;arsenal():void;shoulder():void;
  /** The weapon wheel: open or let go (it picks what the pointer is on). */
  wheel(open:boolean):void;
}

// LB held this long opens the wheel; shorter is a tap (the previous weapon).
const WHEEL_HOLD_MS=220;
// The left stick in a menu: past this push it is an arrow.
const MENU_PUSH=.6;

export class PadMapper {
  private inMenu=false;
  private latched=false;
  private moving=false;
  private aimHeld=false;private fireHeld=false;private breathHeld=false;private blockHeld=false;
  private wheelOpen=false;
  private readonly repeat=new Repeater();
  constructor(private readonly host:PadHost){}

  /** Lets go of everything held (pad gone, a menu opened, the page lost focus). */
  release():void {
    const host=this.host;
    if(this.moving){host.move(0,0);this.moving=false;}
    if(this.latched){this.latched=false;host.sprint(false);}
    if(this.aimHeld){this.aimHeld=false;host.aim(false);}
    if(this.fireHeld){this.fireHeld=false;host.trigger(false);}
    if(this.breathHeld){this.breathHeld=false;host.breath(false);}
    if(this.blockHeld){this.blockHeld=false;host.hold('FightBlock',false);}
    if(this.wheelOpen){this.wheelOpen=false;host.wheel(false);}
    this.repeat.clear();
  }

  frame(pad:PadFrame|undefined,now:number):void {
    if(!pad){this.release();return;}
    const host=this.host,menu=host.menu();
    if(menu!==this.inMenu){this.release();this.inMenu=menu;}
    if(menu){this.navigate(pad,now);return;}
    const tap=(button:PadButton,code:string)=>{if(pad.pressed(button))host.press(code);};
    // Walking: the stick is the touch axis (y down); it stays the keyboard's when the pad rests.
    if(pad.left.m>0){host.move(pad.left.x,pad.left.y);this.moving=true;}
    else if(this.moving){host.move(0,0);this.moving=false;if(this.latched){this.latched=false;host.sprint(false);}}
    const scoped=host.scoped(),drawn=host.drawn(),system=host.system(),guard=!drawn&&host.guard();
    // L3: run (a latch), or through a scope hold the breath.
    if(scoped){
      if(this.latched){this.latched=false;host.sprint(false);}
      const breath=pad.down(PAD.L3);
      if(breath!==this.breathHeld){this.breathHeld=breath;host.breath(breath);}
    } else {
      if(this.breathHeld){this.breathHeld=false;host.breath(false);}
      if(pad.pressed(PAD.L3)&&pad.left.m>0){this.latched=!this.latched;host.sprint(this.latched);}
    }
    if(guard){
      // The fist fight: RT light, LT heavy, RB held blocks.
      if(pad.pressed(PAD.RT))host.press('FightLight');
      if(pad.pressed(PAD.LT))host.press('FightHeavy');
      const block=pad.down(PAD.RB);
      if(block!==this.blockHeld){this.blockHeld=block;host.hold('FightBlock',block);}
    } else {
      if(this.blockHeld){this.blockHeld=false;host.hold('FightBlock',false);}
      const aim=drawn&&pad.down(PAD.LT),fire=drawn&&pad.down(PAD.RT);
      if(aim!==this.aimHeld){this.aimHeld=aim;host.aim(aim);}
      if(fire!==this.fireHeld){this.fireHeld=fire;host.trigger(fire);}
    }
    tap(PAD.A,'KeyE');
    // X: reload with a weapon in hand; without one, R (the fist guard).
    if(pad.pressed(PAD.X)){if(drawn)host.reload();else host.press('KeyR');}
    tap(PAD.VIEW,'KeyZ');
    tap(PAD.START,'Escape');
    if(pad.pressed(PAD.Y)){if(drawn)host.mode();else host.press('KeyV');}
    if(system){
      if(pad.pressed(PAD.B))host.holster();
      if(!guard&&pad.pressed(PAD.RB))host.step(1);
      // LB: held, the wheel; a tap, the previous weapon.
      if(!this.wheelOpen&&pad.down(PAD.LB)&&pad.heldFor(PAD.LB)>=WHEEL_HOLD_MS){this.wheelOpen=true;host.wheel(true);}
      if(pad.released(PAD.LB)){
        if(this.wheelOpen){this.wheelOpen=false;host.wheel(false);}
        else if(pad.heldWas(PAD.LB)<WHEEL_HOLD_MS)host.step(-1);
      }
      if(pad.pressed(PAD.RIGHT))host.arsenal();
    }
    if(drawn&&scoped){if(pad.pressed(PAD.UP))host.zoom(1);if(pad.pressed(PAD.DOWN))host.zoom(-1);}
    if(pad.pressed(PAD.R3))host.shoulder();
  }

  /** In a menu: arrows (D-pad or left stick, repeating while held), Enter, Escape, Q and E. */
  private navigate(pad:PadFrame,now:number):void {
    const host=this.host,stick=pad.left;
    const dir={up:pad.down(PAD.UP)||(stick.m>MENU_PUSH&&-stick.y>Math.abs(stick.x)),down:pad.down(PAD.DOWN)||(stick.m>MENU_PUSH&&stick.y>Math.abs(stick.x)),
      left:pad.down(PAD.LEFT)||(stick.m>MENU_PUSH&&-stick.x>Math.abs(stick.y)),right:pad.down(PAD.RIGHT)||(stick.m>MENU_PUSH&&stick.x>Math.abs(stick.y))};
    if(this.repeat.step('up',dir.up,now))host.press('ArrowUp');
    if(this.repeat.step('down',dir.down,now))host.press('ArrowDown');
    if(this.repeat.step('left',dir.left,now))host.press('ArrowLeft');
    if(this.repeat.step('right',dir.right,now))host.press('ArrowRight');
    if(pad.pressed(PAD.A))host.press('Enter');
    if(pad.pressed(PAD.B)||pad.pressed(PAD.START))host.press('Escape');
    if(pad.pressed(PAD.LB))host.press('KeyQ');
    if(pad.pressed(PAD.RB))host.press('KeyE');
  }
}
