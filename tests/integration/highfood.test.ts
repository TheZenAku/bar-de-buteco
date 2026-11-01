import test from 'node:test';
import assert from 'node:assert/strict';
import {GARAGES,motoSpawnSpot,DELIVERY_SPOTS,GPS_CELL,HIGHFOOD,HIGHFOOD_CUSTOMERS,MOTO_PARTS,NEW_MOTO_PARTS,STREET_LABELS,customerLookSchema,defaultPrices,deliveryPay,deliveryStars,floorHeight,gpsClass,gpsRoute,isWalkable,mileageWear,motoFits,priceOf,ratingWait,readMotoParts,routeLength,routeProgress,roadHeight,SKINS,courierLevel,fillLine} from '@bar/shared';

const prices=defaultPrices({});
const sample=<T>(list:readonly T[],count:number)=>Array.from({length:count},(_,i)=>list[Math.floor(i*list.length/count)]!);

test('the GPS finds its way from the base to every corner of the city, over ground the bike can take',()=>{
  const start=HIGHFOOD.BASE;
  for(const spot of sample(DELIVERY_SPOTS,120)){
    const route=gpsRoute(start,{x:spot.parkX,z:spot.parkZ});
    assert.ok(route,`No way to ${spot.street}, ${spot.number}`);
    assert.ok(route.length>=Math.hypot(spot.parkX-start.x,spot.parkZ-start.z)*.99,'Not shorter than a straight line');
    assert.ok(route.length<Math.hypot(spot.parkX-start.x,spot.parkZ-start.z)*2.2+150,`Not a wander: ${route.length} m to ${spot.street}`);
  }
});

test('the line itself is clear: the bike fits along almost every route, its whole length',()=>{
  const start=motoSpawnSpot(GARAGES[0],GARAGES[0].rotation+Math.PI,[])!,sampled=sample(DELIVERY_SPOTS,200);
  let clean=0;
  for(const spot of sampled){
    const {points}=gpsRoute(start,{x:spot.parkX,z:spot.parkZ})!;let ok=true;
    for(let i=1;i<points.length-2&&ok;i++){
      const [ax,az]=points[i]!,[bx,bz]=points[i+1]!,yaw=Math.atan2(bx-ax,bz-az),length=Math.hypot(bx-ax,bz-az);
      for(let d=0;d<=length&&ok;d+=.5){const x=ax+(bx-ax)*d/length,z=az+(bz-az)*d/length;ok=!!(motoFits(x,z,yaw,0)??motoFits(x,z,yaw,.15));}
    }
    if(ok)clean++;
  }
  assert.ok(clean/sampled.length>=.97,String(clean)+" of "+sampled.length+" routes clear");
});

test('a route is quick enough to plan while the bar is running',()=>{
  const started=performance.now();
  for(const spot of sample(DELIVERY_SPOTS,40))gpsRoute({x:-380,z:-340},{x:spot.parkX,z:spot.parkZ});
  const each=(performance.now()-started)/40;
  assert.ok(each<60,`${each.toFixed(1)} ms per route`);
});

test('a route follows the player: from anywhere, off the road too, and progress along it is measured',()=>{
  const inBar=gpsRoute({x:14,z:-6},{x:-100,z:60});
  assert.ok(inBar&&inBar.points[0]![0]===14,'The line starts where the player is, inside the bar');
  const line=[[0,0],[10,0],[10,20]] as const;
  assert.equal(routeLength(line),30);
  assert.deepEqual(routeProgress(line,10,10),{distance:0,segment:1,t:.5});
  assert.equal(routeProgress(line,5,3).distance,3);
});

test('the grid agrees with the map: a cell it calls open has room for the bike; streets are named',()=>{
  let open=0;
  for(let x=-390;x<390;x+=37)for(let z=-390;z<390;z+=41){
    const cx=Math.floor((x+402)/GPS_CELL)*GPS_CELL-402+GPS_CELL/2,cz=Math.floor((z+402)/GPS_CELL)*GPS_CELL-402+GPS_CELL/2,kind=gpsClass(cx,cz);
    if(!kind)continue;
    open++;
    assert.ok(motoFits(cx,cz,0,0)||motoFits(cx,cz,0,.15)||motoFits(cx,cz,Math.PI/2,0)||motoFits(cx,cz,Math.PI/2,.15)||motoFits(cx,cz,Math.PI/4,0)||motoFits(cx,cz,Math.PI/4,.15),`Cell at ${cx},${cz} (class ${kind}): run npm run assets:gps`);
  }
  assert.ok(open>200);
  assert.ok(STREET_LABELS.length>50);
});

test('every delivery spot: someone can stand there, it is on the pavement, and the bike fits at the kerb in front',()=>{
  assert.ok(DELIVERY_SPOTS.length>500,`${DELIVERY_SPOTS.length} spots`);
  for(const spot of DELIVERY_SPOTS){
    const y=floorHeight(spot.x,spot.z,spot.y);
    assert.ok(y!==undefined&&isWalkable(spot.x,spot.z,y),`${spot.street}, ${spot.number}: nobody can stand at ${spot.x},${spot.z}`);
    assert.ok(roadHeight(spot.parkX,spot.parkZ,0)!==undefined,`${spot.street}: the kerb point is not street`);
    const gap=Math.hypot(spot.x-spot.parkX,spot.z-spot.parkZ);
    assert.ok(gap<8,`${spot.street}: the bike stays ${gap} m away`);
    assert.ok(Math.abs(spot.x)<400&&Math.abs(spot.z)<400);
    assert.ok(spot.street.length>3&&spot.number>0&&spot.place.length>2);
    // Looking at the street.
    const facing=(Math.sin(spot.yaw)*(spot.parkX-spot.x)+Math.cos(spot.yaw)*(spot.parkZ-spot.z))/gap;
    assert.ok(facing>.95,`${spot.street}: they face away from the bike`);
  }
  // Spread around the map, not in one corner.
  const quadrants=new Set(DELIVERY_SPOTS.map(spot=>`${Math.sign(spot.x)}:${Math.sign(spot.z)}`));
  assert.equal(quadrants.size,4);
});

test('what a delivery pays: base, distance, bonus for the promise, less for crashes, less for a ruined box',()=>{
  const facts={length:300,onTime:true,crashes:0,wornBox:false};
  const pay=deliveryPay(prices,facts,0);
  assert.deepEqual(pay,{base:8,distance:12,bonus:4,lost:0,total:24,reduced:false});
  assert.equal(deliveryPay(prices,{...facts,onTime:false},0).total,20);
  assert.equal(deliveryPay(prices,{...facts,crashes:1},0).total,19);
  assert.equal(deliveryPay(prices,{...facts,crashes:9},0).lost,10,'A crash takes at most half of it');
  assert.equal(deliveryPay(prices,{...facts,wornBox:true},0).lost,3);
  assert.deepEqual(deliveryPay(prices,facts,priceOf(prices,'highfood:full-per-day')),{base:8,distance:12,bonus:4,lost:0,total:12,reduced:true});
  assert.equal(deliveryStars(facts),5);
  assert.equal(deliveryStars({...facts,onTime:false,crashes:1,wornBox:true}),2);
  assert.equal(deliveryStars({...facts,onTime:false,crashes:9,wornBox:true}),1);
});

test('the economy: a full day stays under the ceiling, the bike takes weeks to pay for itself, and nothing ever pays a lot at once',()=>{
  // A courier at a good pace, every order on the longest and shortest ways there are.
  const cap=priceOf(prices,'cap:highfood-daily'),price=priceOf(prices,'vehicle:moto');
  let earned=0,count=0,random=7;
  const next=()=>(random=random*16807%2147483647)/2147483647;
  while(count<200){
    const length=HIGHFOOD.ROUTE_MIN+next()*(HIGHFOOD.ROUTE_MAX-HIGHFOOD.ROUTE_MIN),pay=deliveryPay(prices,{length,onTime:true,crashes:0,wornBox:false},count);
    assert.ok(pay.total<=40,`A single delivery paid ${pay.total}`);
    earned=Math.min(cap,earned+pay.total);count++;
    if(earned>=cap)break;
  }
  assert.equal(earned,cap,'The ceiling is reached');
  assert.ok(count>=25,`The day's ceiling takes ${count} deliveries`);
  // Waiting, riding and handing over cannot be under about two minutes a delivery: the ceiling is close to an hour's work, not a few minutes'.
  const minutes=count*((HIGHFOOD.WAIT_MIN_MS+HIGHFOOD.WAIT_MAX_MS)/2/60_000+1);
  assert.ok(minutes>=45,`${minutes} min to the ceiling`);
  const days=price/cap;
  assert.ok(days>=10&&days<=25,`The bike pays for itself in ${days} days at the ceiling`);
  assert.equal(ratingWait(4.8),.85);assert.equal(ratingWait(4),1);assert.equal(ratingWait(3),1.3);
});

test('riding wears a bought bike a point at a time, where the road touches it, and never the box',()=>{
  let parts=readMotoParts(NEW_MOTO_PARTS);
  for(let i=0;i<1000;i++)parts=mileageWear(parts,()=>i%100/100);
  assert.equal(parts.bau,100);assert.equal(parts.farol,100);
  assert.ok(parts.pneu_traseiro<100&&parts.freios<100);
  for(const part of MOTO_PARTS)assert.ok(parts[part.id]>=0);
});

test('the customers that come with the game are complete, and levels go up with deliveries',()=>{
  assert.ok(HIGHFOOD_CUSTOMERS.length>=20);
  assert.equal(new Set(HIGHFOOD_CUSTOMERS.map(person=>person.id)).size,HIGHFOOD_CUSTOMERS.length);
  const skins=new Set(SKINS.map(skin=>skin.id) as string[]);
  for(const person of HIGHFOOD_CUSTOMERS){
    assert.match(person.id,/^[a-z0-9-]{2,40}$/);assert.ok(skins.has(person.skin),person.skin);assert.ok(customerLookSchema.safeParse(person.look).success,person.id);
    assert.ok(person.lines.length>=2);for(const line of person.lines)assert.ok(line.length<=180,line);
  }
  assert.equal(fillLine('Valeu, {nome}! Tá bom esse {item}.','Ana','Pastel'),'Valeu, Ana! Tá bom esse pastel.');
  assert.equal(courierLevel(0).name,'Novato');assert.equal(courierLevel(10).name,'Entregador');assert.equal(courierLevel(400).next,undefined);
});
