import {CAR,TRUCK,TRUCK_MODEL,carSpec} from './vehicle-models.js';
import type {MotoBody,MotoIntent} from './moto.js';
import type {MotoHandling} from './moto-parts.js';

const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
const STEER_CURVE=[[0,CAR.MAX_STEER],[5,32*Math.PI/180],[10,18*Math.PI/180],[15,10*Math.PI/180],
  [20,5.8*Math.PI/180],[30,2.7*Math.PI/180],[39,1.7*Math.PI/180]] as const;
/** The truck's wheel lock closes sooner: 32° at a walk, a couple of degrees at its 24 m/s. */
const TRUCK_STEER_CURVE=[[0,TRUCK.MAX_STEER],[4,22*Math.PI/180],[8,12*Math.PI/180],[12,7*Math.PI/180],[18,3.6*Math.PI/180],[24,2*Math.PI/180]] as const;
/** Steering assistance is separate from tyre grip. Angles are radians, speed is m/s. */
export function carSteerAngle(speed:number,model?:string):number {
  const v=Math.abs(speed),curve:ReadonlyArray<readonly [number,number]>=model===TRUCK_MODEL?TRUCK_STEER_CURVE:STEER_CURVE;
  for(let i=1;i<curve.length;i++){
    const [a,da]=curve[i-1]!,[b,db]=curve[i]!;
    if(v<=b)return da+(db-da)*(v-a)/(b-a);
  }
  return curve[curve.length-1]![1];
}

/** Body-local +X is left, +Z is forward; positive yaw turns towards +X (A).
 * Forces act at two axles, so the handbrake can let the rear slide without
 * rotating the velocity magically with the chassis. Call with dt <= .01 s.
 */
export function stepCarDynamics(body:MotoBody,input:MotoIntent,dt:number,handling:MotoHandling):MotoBody {
  const SPEC=carSpec(body.model),wanted=clamp(input.steer,-1,1),rate=(wanted===0||wanted*body.steer<0?SPEC.STEER_RETURN:SPEC.STEER_RATE)*dt;
  const steer=body.steer+clamp(wanted-body.steer,-rate,rate);
  let u=body.speed,v=body.lateralSpeed??0,r=body.yawRate??0;
  const throttle=clamp(input.throttle,-1,1);
  let drive=0,stop=SPEC.ROLLING*handling.rolling+SPEC.DRAG*u*u;
  if(input.brake)stop+=SPEC.HANDBRAKE*handling.brake;
  else if(throttle>0){if(u<-.1)stop+=SPEC.BRAKE*handling.brake*throttle;else drive=SPEC.ENGINE*handling.power*throttle;}
  else if(throttle<0){if(u>.1)stop-=SPEC.BRAKE*handling.brake*throttle;else if(u>-SPEC.REVERSE_SPEED)drive=SPEC.REVERSE*handling.power*throttle;}
  u+=drive/SPEC.MASS*dt;
  const loss=stop/SPEC.MASS*dt;
  u=Math.abs(u)<=loss?0:u-Math.sign(u)*loss;
  // A passive tyre must never add translational energy, including at the
  // kinematic/dynamic transition. Only the drivetrain above can add it.
  const available=Math.hypot(u,v),delta=-clamp(steer+handling.pull,-1,1)*handling.turn*carSteerAngle(u,body.model);
  const axle=SPEC.WHEELBASE/2,inertia=SPEC.MASS*(SPEC.HALF_LENGTH**2+SPEC.HALF_WIDTH**2)/3;
  const frontGrip=handling.frontGrip??1,rearGrip=(handling.rearGrip??1)*(input.brake ? .22 : 1);
  const stiffness=SPEC.MASS*95/2,limit=SPEC.MASS*SPEC.GRIP/2;
  const frontSlip=Math.atan2(v+axle*r,Math.max(2,Math.abs(u)))-delta;
  const rearSlip=Math.atan2(v-axle*r,Math.max(2,Math.abs(u)));
  const front=clamp(-stiffness*frontSlip*frontGrip,-limit*frontGrip,limit*frontGrip);
  const rear=clamp(-stiffness*rearSlip*rearGrip,-limit*rearGrip,limit*rearGrip);
  const side=front*Math.cos(delta)+rear;
  const dynamicR=r+(axle*(front*Math.cos(delta)-rear)/inertia-r*.35)*dt;
  const dynamicV=v+(side/SPEC.MASS-u*r)*dt;
  const dynamicU=u+(r*v-front*Math.sin(delta)/SPEC.MASS)*dt;
  // Reverse and walking-speed manoeuvres are kinematic. Fade into tyre forces
  // over 1..3 m/s; pure sideways motion still dissipates through the tyres.
  const blend=u<-.1?0:clamp((Math.hypot(u,v)-1)/2,0,1),targetR=u*Math.tan(delta)/SPEC.WHEELBASE;
  r=targetR*(1-blend)+dynamicR*blend;
  v=(v+(axle*targetR-v)*(1-Math.exp(-12*dt)))*(1-blend)+dynamicV*blend;
  u=u*(1-blend)+dynamicU*blend;
  const magnitude=Math.hypot(u,v);
  if(magnitude>available&&magnitude>0){u*=available/magnitude;v*=available/magnitude;}
  if(!drive&&Math.hypot(u,v)<.025){u=0;v=0;r=0;}
  return {...body,speed:u,lateralSpeed:v,yawRate:r,steer};
}
