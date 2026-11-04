import {CAR} from './vehicle-models.js';
import type {MotoBody,MotoIntent} from './moto.js';
import type {MotoHandling} from './moto-parts.js';

const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
const STEER_CURVE=[[0,CAR.MAX_STEER],[5,32*Math.PI/180],[10,18*Math.PI/180],[15,10*Math.PI/180],
  [20,5.8*Math.PI/180],[30,2.7*Math.PI/180],[39,1.7*Math.PI/180]] as const;
/** Steering assistance is separate from tyre grip. Angles are radians, speed is m/s. */
export function carSteerAngle(speed:number):number {
  const v=Math.abs(speed);
  for(let i=1;i<STEER_CURVE.length;i++){
    const [a,da]=STEER_CURVE[i-1]!,[b,db]=STEER_CURVE[i]!;
    if(v<=b)return da+(db-da)*(v-a)/(b-a);
  }
  return STEER_CURVE[STEER_CURVE.length-1][1];
}

/** Body-local +X is left, +Z is forward; positive yaw turns towards +X (A).
 * Forces act at two axles, so the handbrake can let the rear slide without
 * rotating the velocity magically with the chassis. Call with dt <= .01 s.
 */
export function stepCarDynamics(body:MotoBody,input:MotoIntent,dt:number,handling:MotoHandling):MotoBody {
  const wanted=clamp(input.steer,-1,1),rate=(wanted===0||wanted*body.steer<0?CAR.STEER_RETURN:CAR.STEER_RATE)*dt;
  const steer=body.steer+clamp(wanted-body.steer,-rate,rate);
  let u=body.speed,v=body.lateralSpeed??0,r=body.yawRate??0;
  const throttle=clamp(input.throttle,-1,1);
  let drive=0,stop=CAR.ROLLING*handling.rolling+CAR.DRAG*u*u;
  if(input.brake)stop+=CAR.HANDBRAKE*handling.brake;
  else if(throttle>0){if(u<-.1)stop+=CAR.BRAKE*handling.brake*throttle;else drive=CAR.ENGINE*handling.power*throttle;}
  else if(throttle<0){if(u>.1)stop-=CAR.BRAKE*handling.brake*throttle;else if(u>-CAR.REVERSE_SPEED)drive=CAR.REVERSE*handling.power*throttle;}
  u+=drive/CAR.MASS*dt;
  const loss=stop/CAR.MASS*dt;
  u=Math.abs(u)<=loss?0:u-Math.sign(u)*loss;
  // A passive tyre must never add translational energy, including at the
  // kinematic/dynamic transition. Only the drivetrain above can add it.
  const available=Math.hypot(u,v),delta=-clamp(steer+handling.pull,-1,1)*handling.turn*carSteerAngle(u);
  const axle=CAR.WHEELBASE/2,inertia=CAR.MASS*(CAR.HALF_LENGTH**2+CAR.HALF_WIDTH**2)/3;
  const frontGrip=handling.frontGrip??1,rearGrip=(handling.rearGrip??1)*(input.brake ? .22 : 1);
  const stiffness=CAR.MASS*95/2,limit=CAR.MASS*CAR.GRIP/2;
  const frontSlip=Math.atan2(v+axle*r,Math.max(2,Math.abs(u)))-delta;
  const rearSlip=Math.atan2(v-axle*r,Math.max(2,Math.abs(u)));
  const front=clamp(-stiffness*frontSlip*frontGrip,-limit*frontGrip,limit*frontGrip);
  const rear=clamp(-stiffness*rearSlip*rearGrip,-limit*rearGrip,limit*rearGrip);
  const side=front*Math.cos(delta)+rear;
  const dynamicR=r+(axle*(front*Math.cos(delta)-rear)/inertia-r*.35)*dt;
  const dynamicV=v+(side/CAR.MASS-u*r)*dt;
  const dynamicU=u+(r*v-front*Math.sin(delta)/CAR.MASS)*dt;
  // Reverse and walking-speed manoeuvres are kinematic. Fade into tyre forces
  // over 1..3 m/s; pure sideways motion still dissipates through the tyres.
  const blend=u<-.1?0:clamp((Math.hypot(u,v)-1)/2,0,1),targetR=u*Math.tan(delta)/CAR.WHEELBASE;
  r=targetR*(1-blend)+dynamicR*blend;
  v=(v+(axle*targetR-v)*(1-Math.exp(-12*dt)))*(1-blend)+dynamicV*blend;
  u=u*(1-blend)+dynamicU*blend;
  const magnitude=Math.hypot(u,v);
  if(magnitude>available&&magnitude>0){u*=available/magnitude;v*=available/magnitude;}
  if(!drive&&Math.hypot(u,v)<.025){u=0;v=0;r=0;}
  return {...body,speed:u,lateralSpeed:v,yawRate:r,steer};
}
