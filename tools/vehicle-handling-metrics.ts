/** Flat-pad measurements without map collisions. Hold TOTAL ground speed while
 * the tyres settle; all forces, steering and yaw come from the game's model.
 * Run: node --import tsx tools/vehicle-handling-metrics.ts
 */
import {CAR,CAR_MODEL,FULL_HANDLING,MOTO,motoSteerAngle,vehicleSpeed,type MotoBody} from '../packages/shared/src/index.js';
import {stepCarDynamics} from '../packages/shared/src/car-dynamics.js';

const rows=[];
for(const kmh of [18,36,54,72,108]){
  const speed=kmh/3.6;
  let body:MotoBody={model:CAR_MODEL,x:0,y:0,z:0,yaw:0,pitch:0,speed,steer:0};
  for(let i=0;i<800;i++){
    const ratio=speed/(vehicleSpeed(body)||1);
    body=stepCarDynamics({...body,speed:body.speed*ratio,lateralSpeed:(body.lateralSpeed??0)*ratio},{throttle:0,steer:1,brake:false},.01,FULL_HANDLING);
  }
  rows.push({model:CAR_MODEL,kmh,beforeRadius:+Math.max(CAR.WHEELBASE/Math.tan(33*Math.PI/180),speed*speed/9).toFixed(2),
    afterRadius:+(vehicleSpeed(body)/Math.abs(body.yawRate!)).toFixed(2),lateralSpeed:+body.lateralSpeed!.toFixed(3),yawRate:+body.yawRate!.toFixed(3)});
  if(speed<=MOTO.TOP_SPEED)rows.push({model:'moto-delivery',kmh,
    beforeRadius:+Math.max(MOTO.WHEELBASE/Math.tan(MOTO.MAX_STEER),speed*speed/14).toFixed(2),
    afterRadius:+(MOTO.WHEELBASE/Math.tan(motoSteerAngle(speed))).toFixed(2)});
}
console.log(JSON.stringify({method:'Flat ground, full lock, healthy parts, total speed held for 8 seconds; radii in metres. Before: legacy bicycle model.',rows},null,2));
