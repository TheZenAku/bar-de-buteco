import * as pc from 'playcanvas';
import type {BarClip} from '@bar/shared';
import {reach} from './serving-props';
import type {Target} from './mixamo-retarget';

const smooth=(t:number)=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
const window=(f:number,a:number,b:number,c:number,d:number)=>smooth((f-a)/(b-a))*(1-smooth((f-c)/(d-c)));
/** Lip centres measured against each model's bind-pose head, in model metres (+Z is forward).
 * Head joints sit at very different heights inside the meshes; body height cannot locate the lips. */
export const SMOKING_LIPS:Readonly<Record<string,readonly [number,number,number]>>={
  nathan:[0,-.028,.108],leandro:[0,-.018,.155],rafael:[0,-.019,.129],read:[0,-.033,.137],
  magrao:[0,.017,.151],'gilmar-gordo':[0,.014,.149],gabriel:[0,-.015,.131],
  'flavio-hipotetico':[0,-.022,.155],tiao:[0,-.025,.131],primo:[0,-.025,.131],tonico:[0,-.023,.139],'rafael-rose':[0,-.024,.122],
};
export const isSmoking=(clip:string)=>clip.startsWith('fumar_');

/** Smooth, deterministic contacts, including the hand-to-lips transfers. No state or frame-rate dependence. */
export function smokingContacts(clip:BarClip,f:number):{mouth:number;right:number;lighter:number;held:number;betweenFingers:boolean} {
  switch(clip){
    case 'fumar_acender':return {mouth:window(f,54,58,124,130),right:Math.max(window(f,34,52,60,72),window(f,112,124,132,152)),
      lighter:window(f,68,82,110,132),held:window(f,26,30,189,193),betweenFingers:false};
    case 'fumar_loop':return {mouth:0,right:window(f,32,56,92,118),lighter:0,held:1,betweenFingers:false};
    case 'fumar_apagar':return {mouth:0,right:window(f,18,40,62,80),lighter:0,held:1-smooth((f-92)/4),betweenFingers:false};
    case 'fumar_mixamo':return {mouth:window(f,111,117,252,256),right:Math.max(window(f,82,108,118,136),window(f,238,252,260,282)),
      lighter:window(f,175,185,221,235),held:window(f,33,37,350,354),betweenFingers:f>=254};
    default:return {mouth:0,right:0,lighter:0,held:0,betweenFingers:false};
  }
}

const CIGARETTE=['Prop_Cigarro','Prop_Brasa','FX_Fumaca_Ponta'];
const LIGHTER=['Prop_Isqueiro','Prop_Chama'];

/** Contact correction over the evaluated animation. The arms reach with their original lengths;
 * cigarette, ember and emitter always receive the same rigid transform, including during transfers. */
export function polishSmoking(clip:BarClip,frame:number,skin:string,bones:Map<string,pc.GraphNode>,target:Target,props:Map<string,pc.Entity>):void {
  const head=bones.get('head'),rest=target.rest.get('head'),cigarette=props.get('Prop_Cigarro');
  if(!head||!rest||!cigarette)return;
  const contacts=smokingContacts(clip,frame);
  const headTurn=head.getRotation().clone().mul(rest.q.clone().invert());
  const lip=SMOKING_LIPS[skin]??[0,-.02,.135];
  const mouth=headTurn.transformVector(new pc.Vec3(...lip)).add(head.getPosition());
  const front=headTurn.transformVector(new pc.Vec3(0,0,1)),up=headTurn.transformVector(pc.Vec3.UP);
  const outward=headTurn.transformVector(new pc.Vec3(-.12,-.22,1).normalize());
  const shift=(names:readonly string[],delta:pc.Vec3)=>{for(const name of names){const prop=props.get(name);if(prop)prop.setPosition(prop.getPosition().clone().add(delta));}};
  const rotate=(names:readonly string[],origin:pc.Vec3,turn:pc.Quat)=>{
    for(const name of names){const prop=props.get(name);if(prop){
      prop.setPosition(turn.transformVector(prop.getPosition().clone().sub(origin)).add(origin));
      prop.setRotation(turn.clone().mul(prop.getRotation()));
    }}
  };
  const grip=()=>{
    const point=(finger:string)=>{
      const distal=bones.get(`${finger}_03_r`),end=bones.get(`${finger}_end_r`)??bones.get(`${finger}_04_r`);
      return distal?(end?new pc.Vec3().lerp(distal.getPosition(),end.getPosition(),.65):distal.getPosition().clone()):undefined;
    };
    const index=point('index'),other=point(contacts.betweenFingers?'middle':'thumb');
    if(index&&other)return new pc.Vec3().lerp(index,other,.5);
    return index??bones.get('hand_r')?.getPosition().clone();
  };
  const moveArm=(side:'l'|'r',goal:pc.Vec3,weight:number)=>{
    const upper=bones.get(`upperarm_${side}`),lower=bones.get(`lowerarm_${side}`),hand=bones.get(`hand_${side}`);
    if(!upper||!lower||!hand)return;
    const rotation=hand.getRotation().clone();
    // Keep the elbow down and outside the chest; the animated wrist roll is preserved through IK.
    const pole=front.clone().mulScalar(.18).sub(up.clone().mulScalar(.75));
    pole.add(headTurn.transformVector(new pc.Vec3(side==='r'?-.5:.5,0,0)));
    reach(upper as pc.Entity,lower as pc.Entity,hand as pc.Entity,goal,pole,weight);
    hand.setRotation(rotation);
  };
  if(contacts.held>0&&cigarette.getLocalScale().x>1e-3){
    const hand=bones.get('hand_r');
    // When carried, the filter sits just behind the pinch; when in the lips it follows the face.
    if(hand&&contacts.right>0){
      const before=grip();
      if(before){
        // Turn the wrist together with the cigarette instead of sliding the prop across a bent hand.
        const axis=cigarette.getRotation().transformVector(pc.Vec3.UP);
        const turn=new pc.Quat().setFromDirections(axis,outward);
        turn.slerp(pc.Quat.IDENTITY,turn,contacts.right*(1-contacts.mouth));
        hand.setRotation(turn.clone().mul(hand.getRotation()));
        rotate(CIGARETTE,hand.getPosition().clone(),turn);
        const index=bones.get('index_01_r');
        if(index){
          // Resolve the remaining roll from anatomy: fingertips approach from beside the mouth,
          // rather than standing vertically over the nose while the cigarette points correctly.
          const project=(v:pc.Vec3)=>v.sub(outward.clone().mulScalar(v.dot(outward))).normalize();
          const fingers=project(index.getPosition().clone().sub(hand.getPosition()));
          const wanted=project(headTurn.transformVector(new pc.Vec3(1,.25,0)));
          if(fingers.lengthSq()>.5&&wanted.lengthSq()>.5){
            const roll=new pc.Quat().setFromDirections(fingers,wanted);roll.slerp(pc.Quat.IDENTITY,roll,contacts.right);
            hand.setRotation(roll.clone().mul(hand.getRotation()));rotate(CIGARETTE,hand.getPosition().clone(),roll);
          }
        }
        const pinch=grip()!,goal=mouth.clone().add(outward.clone().mulScalar(.018));
        moveArm('r',hand.getPosition().clone().add(goal.sub(pinch)),contacts.right);
      }
    }
    const axis=cigarette.getRotation().transformVector(pc.Vec3.UP);
    const carried=grip()?.sub(axis.clone().mulScalar(.018));
    const base=carried?new pc.Vec3().lerp(carried,mouth,contacts.mouth):mouth;
    const delta=base.sub(cigarette.getPosition()).mulScalar(contacts.held);
    shift(CIGARETTE,delta);
    if(contacts.mouth>0){
      const turn=new pc.Quat().setFromDirections(axis,outward);turn.slerp(pc.Quat.IDENTITY,turn,contacts.mouth);
      rotate(CIGARETTE,cigarette.getPosition().clone(),turn);
    }
  }
  // Exhalation originates at the lips, with the direction following the head instead of its bone axes.
  const smoke=props.get('FX_Fumaca_Boca');
  if(smoke){smoke.setPosition(mouth);smoke.setRotation(new pc.Quat().setFromDirections(pc.Vec3.UP,front.clone().sub(up.clone().mulScalar(.12)).normalize()));}
  if(contacts.lighter>0){
    const hand=bones.get('hand_l'),lighter=props.get('Prop_Isqueiro'),flame=props.get('Prop_Chama');
    if(hand&&lighter&&flame){
      const oldHand=hand.getPosition().clone();
      const turn=new pc.Quat().setFromDirections(lighter.getRotation().transformVector(pc.Vec3.UP),up);
      turn.slerp(pc.Quat.IDENTITY,turn,contacts.lighter);
      hand.setRotation(turn.clone().mul(hand.getRotation()));rotate(LIGHTER,oldHand,turn);
      const tip=cigarette.getPosition().clone().add(cigarette.getRotation().transformVector(pc.Vec3.UP).mulScalar(.082));
      const goal=tip.sub(up.clone().mulScalar(.008));
      // Hidden authored props live at the origin; use the lighter's nozzle before the flame appears.
      const flamePoint=flame.getLocalScale().x>1e-3?flame.getPosition():lighter.getPosition().clone().add(
        lighter.getRotation().transformVector(pc.Vec3.UP).mulScalar(clip==='fumar_mixamo'?.071:.068));
      moveArm('l',oldHand.clone().add(goal.sub(flamePoint)),contacts.lighter);
      shift(LIGHTER,hand.getPosition().clone().sub(oldHand));
    }
  }
}
