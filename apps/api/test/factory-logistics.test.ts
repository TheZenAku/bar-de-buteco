import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {internalSecret} from '@bar/shared/tickets';
import {TRUCK_MODEL} from '@bar/shared';
import {createApi} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {cityTreasury,companies,factoryShipments,playerVehicles,vehicleStorage,wallets} from '../src/database/schema.js';

test('cargas do caminhão: venda paga imposto ao cofre, taxa ao funcionário e o resto ao dono ao sair da fábrica; o motorista recebe ao entregar',{timeout:120000},async t=>{
  const api=await createApi({config:{...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true},rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const headers={'x-internal-secret':internalSecret()};
  const post=(payload:object)=>api.app.inject({method:'POST',url:'/api/internal/factory',headers,payload});
  const account=async(name:string)=>(await api.app.inject({method:'POST',url:'/api/auth/register',payload:{username:name,displayName:name,email:`${name}@factory.test`,password:'SenhaBoaDeTeste2026!'}})).json().user.id as string;
  const [driver,loader,owner]=[await account('motorista'),await account('operador'),await account('dono_firma')];
  const vehicleId=randomUUID();await api.db.insert(playerVehicles).values({id:vehicleId,plate:'FBR1A23',userId:driver,model:TRUCK_MODEL,parts:'{}',mileage:0});
  const balance=async(id:string)=>(await api.db.select().from(wallets).where(eq(wallets.userId,id)))[0]?.balance??0;
  const before={driver:await balance(driver),loader:await balance(loader),owner:await balance(owner)};
  const dest={x:100,z:-40,label:'Rua das Flores, Jardim Conceição',distanceM:800};
  const company=async()=>Number((await api.db.select().from(companies))[0]?.balance??0);
  const hold=()=>api.db.select().from(vehicleStorage).where(eq(vehicleStorage.vehicleId,vehicleId));

  // The administration sets the money: price, tax, the operator's fee and who owns the firm.
  let res=await post({action:'finance.set',patch:{palletPrice:5000,taxPercent:15,employeeFee:2000,ownerUserId:owner,freightBase:400,freightPerKm:1500,freightPerPallet:200},actorId:'admin',requestId:randomUUID()});
  assert.equal(res.statusCode,200,res.body);assert.equal(res.json().finance.ownerUserId,owner);
  assert.equal((await post({action:'finance.set',patch:{taxPercent:150},actorId:'admin',requestId:randomUUID()})).statusCode,400);
  assert.equal((await post({action:'finance.set',patch:{ownerUserId:randomUUID()},actorId:'admin',requestId:randomUUID()})).statusCode,404);

  // Loading at the dock: the hold gets the pallets; a second load on the same truck is refused while the trip is on.
  const loadId=randomUUID();
  res=await post({action:'shipment.load',vehicleId,plate:'FBR1A23',driverId:driver,loaderId:loader,pallets:2,dest,requestId:loadId});assert.equal(res.statusCode,200,res.body);
  const shipment=res.json().shipment;assert.equal(shipment.status,'loaded');assert.equal(shipment.bags,36);assert.equal(shipment.driverId,driver);
  assert.equal((await hold())[0]?.quantity,36);
  assert.equal((await post({action:'shipment.load',vehicleId,plate:'FBR1A23',driverId:driver,loaderId:loader,pallets:1,dest,requestId:randomUUID()})).statusCode,409);
  assert.equal((await post({action:'shipment.load',vehicleId,plate:'FBR1A23',driverId:driver,loaderId:loader,pallets:2,dest,requestId:loadId})).json().shipment.id,shipment.id,'o mesmo pedido não carrega duas vezes');

  // Nobody is paid before the truck leaves; when it does: 2 x 5000 = 10000 -> tax 1500, operator 2000, owner 6500.
  assert.equal(await balance(owner),before.owner);
  res=await post({action:'shipment.depart',id:shipment.id});assert.equal(res.statusCode,200,res.body);assert.equal(res.json().applied,true);
  assert.deepEqual([res.json().shipment.gross,res.json().shipment.tax,res.json().shipment.staff,res.json().shipment.owner],[10000,1500,2000,6500]);
  assert.equal(await balance(loader)-before.loader,2000);assert.equal(await balance(owner)-before.owner,0,'a parte do dono vai para a carteira da empresa, não para a dele');assert.equal(await company(),6500);
  assert.equal(Number((await api.db.select().from(cityTreasury))[0]!.balance),1500);
  assert.equal((await post({action:'shipment.depart',id:shipment.id})).json().applied,false,'sair duas vezes não paga duas vezes');
  assert.equal(await balance(loader)-before.loader,2000);

  // Delivery: the cargo leaves the hold, the driver gets the freight (400 + 1500 per km + 200 per pallet), once.
  res=await post({action:'shipment.deliver',id:shipment.id});assert.equal(res.statusCode,200,res.body);assert.equal(res.json().applied,true);
  const freight=Math.round(400+1500*0.8+200*2);assert.equal(res.json().shipment.freight,freight);assert.equal(await balance(driver)-before.driver,freight);
  assert.equal((await hold()).length,0);
  assert.equal((await post({action:'shipment.deliver',id:shipment.id})).json().applied,false);assert.equal(await balance(driver)-before.driver,freight);

  // A sale cancelled before the truck leaves gives the product back (the world puts it on the racks) and pays nothing.
  res=await post({action:'shipment.load',vehicleId,plate:'FBR1A23',driverId:driver,loaderId:loader,pallets:1,dest,requestId:randomUUID()});const second=res.json().shipment;
  res=await post({action:'shipment.cancel',id:second.id,actorId:'admin'});assert.equal(res.json().applied,true);assert.deepEqual(res.json().cargo,{material:'PRODUTO',bags:18});
  assert.equal((await hold()).length,0);assert.equal(await company(),6500);

  // A pallet that is not full is still a pallet: it is loaded with the bags it has (and the count must agree with the pallets).
  assert.equal((await post({action:'shipment.load',vehicleId,plate:'FBR1A23',driverId:driver,loaderId:loader,pallets:1,bags:19,dest,requestId:randomUUID()})).statusCode,400);
  assert.equal((await post({action:'shipment.load',vehicleId,plate:'FBR1A23',driverId:driver,loaderId:loader,pallets:2,bags:18,dest,requestId:randomUUID()})).statusCode,400);
  res=await post({action:'shipment.load',vehicleId,plate:'FBR1A23',driverId:driver,loaderId:loader,pallets:1,bags:5,dest,requestId:randomUUID()});assert.equal(res.statusCode,200,res.body);
  const partial=res.json().shipment;assert.equal(partial.pallets,1);assert.equal(partial.bags,5);assert.equal((await hold())[0]?.quantity,5);
  res=await post({action:'shipment.cancel',id:partial.id,actorId:'admin'});assert.deepEqual(res.json().cargo,{material:'PRODUTO',bags:5});assert.equal((await hold()).length,0);

  // A fee larger than the sale takes it all: nothing is left for the firm.
  await post({action:'finance.set',patch:{ownerUserId:'',taxPercent:0,employeeFee:50000,palletPrice:3000},actorId:'admin',requestId:randomUUID()});
  const third=(await post({action:'shipment.load',vehicleId,plate:'FBR1A23',driverId:driver,loaderId:loader,pallets:1,dest,requestId:randomUUID()})).json().shipment;
  const settled=(await post({action:'shipment.depart',id:third.id})).json().shipment;assert.deepEqual([settled.gross,settled.tax,settled.staff,settled.owner],[3000,0,3000,0]);

  // Purchase: the driver takes an open order at the dock, collects at the supplier, the operator unloads at the dock and the driver is paid.
  await post({action:'shipment.deliver',id:third.id});
  const order=(await post({action:'order.create',kind:'purchase',material:'MALTE',pallets:1,price:0,requestId:randomUUID()})).json().order;
  const trip=(await post({action:'shipment.accept',orderId:order.id,vehicleId,plate:'FBR1A23',driverId:driver,dest,requestId:randomUUID()})).json().shipment;assert.equal(trip.status,'to_supplier');
  assert.equal((await post({action:'shipment.accept',orderId:order.id,vehicleId,driverId:driver,dest,requestId:randomUUID()})).statusCode,409);
  assert.equal((await post({action:'shipment.unload',id:trip.id,loaderId:loader})).json().applied,false,'nada a descarregar antes de coletar');
  assert.equal((await post({action:'shipment.collect',id:trip.id})).json().shipment.status,'returning');
  assert.equal((await hold())[0]?.itemId,'malte_saco');
  const driverBefore=await balance(driver);res=await post({action:'shipment.unload',id:trip.id,loaderId:loader});assert.equal(res.json().applied,true);
  assert.equal(await balance(driver)-driverBefore,res.json().shipment.freight);assert.ok(res.json().shipment.freight>=600);
  assert.equal((await hold()).length,0);

  // Ribeiro uses the same HighCargo trip, but its industrial material has its own truck-storage item.
  const ribeiroOrder=(await post({action:'order.create',kind:'ribeiro-purchase',material:'ACO',pallets:1,price:0,requestId:randomUUID()}));assert.equal(ribeiroOrder.statusCode,200,ribeiroOrder.body);
  const ribeiroTrip=(await post({action:'shipment.accept',orderId:ribeiroOrder.json().order.id,vehicleId,plate:'FBR1A23',driverId:driver,dest,requestId:randomUUID()}));assert.equal(ribeiroTrip.statusCode,200,ribeiroTrip.body);
  assert.equal((await post({action:'shipment.collect',id:ribeiroTrip.json().shipment.id})).json().shipment.status,'returning');
  assert.equal((await hold())[0]?.itemId,'aco_lote');
  res=await post({action:'shipment.unload',id:ribeiroTrip.json().shipment.id,loaderId:loader});assert.equal(res.statusCode,200,res.body);assert.equal(res.json().applied,true);assert.equal((await hold()).length,0);

  // A truck the administration spawned (no owner, no garage row, a 'moto:' key) takes cargo too; whoever drives it gets the route and the freight.
  const adminTruck='moto:abc123';
  const spawned=(await post({action:'shipment.load',vehicleId:adminTruck,loaderId:loader,pallets:1,dest,requestId:randomUUID()}));assert.equal(spawned.statusCode,200,spawned.body);
  const ship=spawned.json().shipment;assert.equal(ship.driverId,'');assert.equal(ship.plate,'');
  assert.equal((await post({action:'shipment.load',vehicleId:adminTruck,loaderId:loader,pallets:1,dest,requestId:randomUUID()})).statusCode,409,'um caminhão, uma carga por vez');
  assert.equal((await post({action:'shipment.driver',id:ship.id,driverId:driver})).json().applied,true);assert.equal((await post({action:'shipment.driver',id:ship.id,driverId:driver})).json().applied,false);
  await post({action:'finance.set',patch:{taxPercent:10,employeeFee:100,palletPrice:2000},actorId:'admin',requestId:randomUUID()});
  await post({action:'shipment.depart',id:ship.id});const driverNow=await balance(driver);
  assert.equal((await post({action:'shipment.deliver',id:ship.id})).json().applied,true);assert.ok(await balance(driver)>driverNow,'quem dirigia recebeu o frete');
  assert.equal((await api.db.select().from(vehicleStorage).where(eq(vehicleStorage.vehicleId,adminTruck))).length,0);

  // The administration adjusts the vault, with a reason; it cannot go below zero.
  res=await post({action:'treasury.adjust',amount:-1000,reason:'Obra da prefeitura',actorId:'admin',requestId:randomUUID()});assert.equal(res.statusCode,200,res.body);
  assert.equal((await post({action:'treasury.adjust',amount:-99999999,reason:'Demais',actorId:'admin',requestId:randomUUID()})).statusCode,409);
  const summary=(await post({action:'shipment.summary'})).json().summary;assert.equal(summary.sales,3);assert.equal(summary.tax,1500+200);
  assert.ok((await api.db.select().from(factoryShipments)).length>=4);
});
