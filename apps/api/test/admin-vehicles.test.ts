import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {CAR_MODEL,GARAGE,MOTO_MODEL,NEW_CAR_PARTS,NEW_MOTO_PARTS,PLATE,VEHICLE_CATALOG,readVehicleParts} from '@bar/shared';
import {createApi} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {OWNER_EMAIL} from '../src/admin-policy.js';
import {controls,moderationActions,playerVehicles,wallets} from '../src/database/schema.js';

test('administrators manage stored and offline vehicles, with permissions, durable changes and request replay',async t=>{
  const config={...readConfig(),production:false,databaseUrl:undefined,dataPath:'memory://',autoVerifyEmail:true};
  const service=await createApi({config,rateLimit:false,migrate:true});t.after(()=>service.app.close());
  const call=(method:'GET'|'POST',url:string,payload:object|undefined,cookie:string)=>service.app.inject({method,url,...(payload?{payload}:{}),headers:{cookie}});
  async function register(username:string,email=`${username}@vehicles.test`){
    const response=await call('POST','/api/auth/register',{username,email,displayName:username,password:'VehiclesTesting2026!'},'');
    assert.equal(response.statusCode,201,response.body);
    return {id:response.json().user.id as string,cookie:`${response.cookies[0]!.name}=${response.cookies[0]!.value}`};
  }
  const owner=await register('principal',OWNER_EMAIL),staff=await register('equipe'),player=await register('motorista'),receiver=await register('destinatario');
  assert.equal((await call('POST','/api/admin/role',{playerId:staff.id,role:'admin',reason:'Equipe de veículos'},owner.cookie)).statusCode,200);
  const bike=randomUUID(),car=randomUUID(),protectedCar=randomUUID();
  await service.db.insert(playerVehicles).values([
    {id:bike,plate:'TST1A01',userId:player.id,model:MOTO_MODEL,parts:NEW_MOTO_PARTS.replace(/^100/,'0'),mileage:4567,fuel:12},
    {id:car,plate:'TST1A02',userId:player.id,model:CAR_MODEL,parts:NEW_CAR_PARTS.replace(/^100/,'0'),mileage:8910,fuel:4},
    {id:protectedCar,plate:'TST1A03',userId:owner.id,model:CAR_MODEL,parts:NEW_CAR_PARTS.replace(/^100/,'0'),fuel:2},
  ]);
  const row=async(id:string)=>(await service.db.select().from(playerVehicles).where(eq(playerVehicles.id,id)))[0];
  const command=(body:object,cookie=staff.cookie)=>call('POST','/api/admin/vehicles',{requestId:randomUUID(),reason:'Manutenção administrativa',...body},cookie);
  const save=(id:string,revision?:number)=>service.app.inject({method:'POST',url:'/api/internal/vehicles',headers:{'x-internal-secret':config.internalSecret},
    payload:{updates:[{vehicleId:id,revision,parts:'0,0,0',mileage:1,fuel:0}]}});

  await t.test('listing includes offline owners, searches names and plates, paginates and marks protected owners',async()=>{
    assert.equal((await call('GET','/api/admin/vehicles',undefined,player.cookie)).statusCode,403);
    assert.equal((await command({operation:'repair',ids:[bike]},player.cookie)).statusCode,403);
    const list=(await call('GET','/api/admin/vehicles',undefined,staff.cookie)).json();
    assert.equal(list.total,3);assert.equal(list.vehicles.find((v:any)=>v.id===protectedCar).canEdit,false);
    const found=(await call('GET','/api/admin/vehicles?search=motorista&limit=1&offset=1',undefined,staff.cookie)).json();
    assert.equal(found.total,2);assert.equal(found.vehicles.length,1);assert.equal(found.vehicles[0].ownerUsername,'motorista');
    assert.equal((await call('GET','/api/admin/vehicles?search=TST1A01',undefined,staff.cookie)).json().vehicles[0].id,bike);
    assert.equal((await call('GET',`/api/admin/vehicles?ownerId=${owner.id}&model=${CAR_MODEL}`,undefined,staff.cookie)).json().total,1);
  });
  await t.test('repair-all fixes every part for every permitted owner; stale world saves cannot undo it',async()=>{
    const repair=await command({operation:'repair',all:true});assert.equal(repair.statusCode,200,repair.body);
    assert.deepEqual(repair.json(),{changed:2,skipped:1,replayed:false});
    for(const id of [bike,car]){const vehicle=(await row(id))!;assert.ok(Object.values(readVehicleParts(vehicle.model,vehicle.parts)).every(v=>v===100));assert.equal(vehicle.revision,1);}
    assert.equal((await row(bike))!.mileage,4567);assert.equal((await row(bike))!.fuel,12);
    assert.ok((await row(protectedCar))!.parts.startsWith('0,'));
    assert.equal((await save(bike)).statusCode,200);assert.equal((await save(car,0)).statusCode,200);
    assert.equal((await row(bike))!.parts,NEW_MOTO_PARTS);assert.equal((await row(car))!.mileage,8910);
    assert.equal((await command({operation:'repair',ids:[protectedCar]})).statusCode,403);
  });
  await t.test('refuel, repaint and recall are stored, audited and queued for the live room',async()=>{
    assert.equal((await command({operation:'refuel',ids:[bike,car]})).statusCode,200);
    assert.equal((await row(bike))!.fuel,100);assert.equal((await row(car))!.fuel,100);
    assert.equal((await command({operation:'paint',ids:[car],color:'#123abc'})).statusCode,200);
    assert.equal((await row(car))!.color,'#123abc');
    assert.equal((await command({operation:'recall',ids:[car]})).statusCode,200);
    assert.equal((await command({operation:'delete',all:true})).statusCode,400);
    assert.equal((await command({operation:'transfer',ids:[car]})).statusCode,400);
    assert.equal((await command({operation:'paint',ids:[car],color:'red'})).statusCode,400);
    assert.equal((await command({operation:'paint',ids:[bike],color:'#123abc'})).statusCode,400,'the original delivery-bike material has no paint option');
    const queued=(await service.db.select().from(controls)).map(c=>c.payload as any).filter(c=>c.action==='vehicles');
    assert.ok(queued.some(c=>c.operation==='recall'&&c.vehicles.some((v:any)=>v.id===car)));
    assert.ok(queued.some(c=>c.operation==='refuel'&&c.vehicles.every((v:any)=>v.fuel===100)));
    assert.ok((await service.db.select().from(moderationActions)).some(a=>a.action==='vehicle-repair'));
  });
  await t.test('transfers move the key once; full or protected recipient accounts are rejected atomically',async()=>{
    assert.equal((await command({operation:'transfer',ids:[bike],targetId:owner.id})).statusCode,403);
    assert.equal((await command({operation:'transfer',ids:[bike],targetId:player.id})).statusCode,409);
    const requestId=randomUUID(),body={operation:'transfer',ids:[bike],targetId:receiver.id,requestId};
    const moved=await command(body);assert.equal(moved.statusCode,200,moved.body);assert.equal((await row(bike))!.userId,receiver.id);
    const revision=(await row(bike))!.revision;
    assert.equal((await command(body)).json().replayed,true);assert.equal((await row(bike))!.revision,revision);
    assert.equal((await command({...body,targetId:player.id})).statusCode,409);
    await save(bike,revision-1);assert.equal((await row(bike))!.fuel,100);
    const keys=(await call('GET','/api/inventory',undefined,receiver.cookie)).json().keys;
    assert.equal(keys[0].vehicleId,bike);
    assert.equal((await call('GET','/api/inventory',undefined,player.cookie)).json().keys.some((k:any)=>k.vehicleId===bike),false);
    for(let i=1;i<GARAGE.VEHICLE_LIMIT;i++)await service.db.insert(playerVehicles).values({id:randomUUID(),plate:`LIM1A${String(i).padStart(2,'0')}`,userId:receiver.id,model:MOTO_MODEL,parts:NEW_MOTO_PARTS});
    assert.equal((await command({operation:'transfer',ids:[car],targetId:receiver.id})).statusCode,409);assert.equal((await row(car))!.userId,player.id);
  });
  await t.test('delete is permanent, removes the key, survives delayed saves and can be retried safely',async()=>{
    const body={operation:'delete',ids:[car],requestId:randomUUID()};
    assert.equal((await command(body)).statusCode,200);assert.equal(await row(car),undefined);
    assert.equal((await command(body)).json().replayed,true);
    await save(car,4);assert.equal(await row(car),undefined);
    assert.equal((await call('GET','/api/inventory',undefined,player.cookie)).json().keys.length,0);
    const after=(await call('GET','/api/admin/vehicles',undefined,owner.cookie)).json();assert.equal(after.vehicles.some((v:any)=>v.id===car),false);
  });
  const registered:string[]=[];
  await t.test('register any catalogue model for an offline player with automatic or custom plates, without charging or duplicating',async()=>{
    const balance=async()=>(await service.db.select().from(wallets).where(eq(wallets.userId,player.id)))[0]!.balance;
    const before=await balance();
    for(const [index,model] of VEHICLE_CATALOG.entries()){
      const data={playerId:player.id,model:model.model,...(index===0?{plate:'reg1a23'}:{}),...(model.paintable?{color:'#112233'}:{}),reason:'Registro administrativo de teste',requestId:randomUUID()};
      const response=await call('POST','/api/admin/vehicles/register',data,staff.cookie);assert.equal(response.statusCode,200,response.body);
      const id=response.json().vehicleId;registered.push(id);const vehicle=(await row(id))!;
      assert.equal(vehicle.userId,player.id);assert.equal(vehicle.model,model.model);assert.equal(vehicle.fuel,100);assert.equal(vehicle.mileage,0);
      assert.ok(PLATE.test(vehicle.plate));if(index===0)assert.equal(vehicle.plate,'REG1A23');
      assert.ok(Object.values(readVehicleParts(model.model,vehicle.parts)).every(value=>value===100));
      if(model.paintable)assert.equal(vehicle.color,'#112233');
      assert.equal((await call('POST','/api/admin/vehicles/register',data,staff.cookie)).json().replayed,true);
      assert.equal((await call('POST','/api/admin/vehicles/register',{...data,reason:'Outra finalidade'},staff.cookie)).statusCode,409);
    }
    assert.equal(await balance(),before,'registration never charges the player');
    const keys=(await call('GET','/api/inventory',undefined,player.cookie)).json().keys;
    assert.equal(keys.length,VEHICLE_CATALOG.length);assert.ok(registered.every(id=>keys.some((k:any)=>k.vehicleId===id)));
    const base={playerId:player.id,model:MOTO_MODEL,reason:'Validar registro',requestId:randomUUID()};
    assert.equal((await call('POST','/api/admin/vehicles/register',base,player.cookie)).statusCode,403);
    assert.equal((await call('POST','/api/admin/vehicles/register',{...base,playerId:owner.id},staff.cookie)).statusCode,403);
    assert.equal((await call('POST','/api/admin/vehicles/register',{...base,playerId:receiver.id},staff.cookie)).statusCode,409,'full garages reject a new registration');
    assert.equal((await call('POST','/api/admin/vehicles/register',{...base,model:'unknown-model'},staff.cookie)).statusCode,400);
    assert.equal((await call('POST','/api/admin/vehicles/register',{...base,plate:'bad'},staff.cookie)).statusCode,400);
    assert.equal((await call('POST','/api/admin/vehicles/register',{...base,plate:'REG1A23'},staff.cookie)).statusCode,409);
  });
  await t.test('custom plates are unique, update the key, are audited and queued for the live vehicle',async()=>{
    const id=registered[0]!,body={operation:'plate',ids:[id],plate:'new2x34',requestId:randomUUID()};
    const response=await command(body);assert.equal(response.statusCode,200,response.body);assert.equal((await row(id))!.plate,'NEW2X34');
    assert.equal((await command(body)).json().replayed,true);
    assert.equal((await command({operation:'plate',ids:[id],plate:(await row(registered[1]!))!.plate})).statusCode,409);
    assert.equal((await command({operation:'plate',ids:registered.slice(0,2),plate:'ABC1D23'})).statusCode,400);
    assert.equal((await command({operation:'plate',ids:[id],plate:'invalid'})).statusCode,400);
    const key=(await call('GET','/api/inventory',undefined,player.cookie)).json().keys.find((k:any)=>k.vehicleId===id);assert.equal(key.plate,'NEW2X34');
    const queued=(await service.db.select().from(controls)).find(c=>(c.payload as any).operation==='plate');assert.equal((queued!.payload as any).vehicles[0].plate,'NEW2X34');
    const logs=await service.db.select().from(moderationActions);assert.ok(logs.some(a=>a.action==='vehicle-register'));assert.ok(logs.some(a=>a.action==='vehicle-plate'&&a.reason.includes('REG1A23 → NEW2X34')));
  });
});
