import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {internalSecret} from '@bar/shared/tickets';
import {createApi} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {cityTreasury,companies,factoryOrders,wallets} from '../src/database/schema.js';

test('a empresa: dono, senha, carteira da firma, compra de matéria-prima com imposto, equipe e gerentes',{timeout:120000},async t=>{
  const api=await createApi({config:{...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true},rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const headers={'x-internal-secret':internalSecret()};
  const post=(path:string,payload:object)=>api.app.inject({method:'POST',url:`/api/internal/${path}`,headers,payload});
  const co=(payload:object)=>post('company',payload);
  const account=async(name:string)=>(await api.app.inject({method:'POST',url:'/api/auth/register',payload:{username:name,displayName:name,email:`${name}@company.test`,password:'SenhaBoaDeTeste2026!'}})).json().user.id as string;
  const [boss,partner,boy,ana,bia]=[await account('chefe'),await account('socio'),await account('gerente1'),await account('ana'),await account('bia')];
  const wallet=async(id:string)=>(await api.db.select().from(wallets).where(eq(wallets.userId,id)))[0]?.balance??0;
  const firm=async()=>Number((await api.db.select().from(companies))[0]?.balance??0);
  const vault=async()=>Number((await api.db.select().from(cityTreasury))[0]?.balance??0);

  // Only a member sees the firm; the administration names owners (who go on the payroll too).
  assert.equal((await co({action:'view',userId:boss})).statusCode,403);
  assert.equal((await co({action:'admin.role',userId:boss,role:'owner',actorId:'admin',requestId:randomUUID()})).statusCode,200);
  assert.equal((await co({action:'admin.role',userId:partner,role:'owner',actorId:'admin',requestId:randomUUID()})).statusCode,200);
  assert.equal((await co({action:'role',userId:partner})).json().role,'owner');
  assert.equal((await co({action:'admin.role',userId:partner,role:null,actorId:'admin',requestId:randomUUID()})).statusCode,200);
  assert.equal((await co({action:'admin.role',userId:boss,role:null,actorId:'admin',requestId:randomUUID()})).statusCode,409,'o último dono não sai');
  await co({action:'admin.role',userId:partner,role:'owner',actorId:'admin',requestId:randomUUID()});

  assert.equal((await co({action:'view',userId:boss})).json().balance,0);
  await co({action:'admin.adjust',amount:100000,reason:'Capital inicial de teste',actorId:'admin',requestId:randomUUID()});
  assert.equal(await firm(),100000);

  // Money out: to the owner's own wallet; their password protects it.
  const view=(await co({action:'view',userId:boss})).json();assert.equal(view.role,'owner');assert.equal(view.hasPassword,false);assert.equal(view.members.length,2);
  const walletBefore=await wallet(boss),transferId=randomUUID();
  let res=await co({action:'transfer',userId:boss,amount:10000,requestId:transferId});assert.equal(res.statusCode,200,res.body);assert.equal(res.json().applied,true);
  assert.equal(await firm(),90000);assert.equal(await wallet(boss),walletBefore+10000);
  assert.equal((await co({action:'transfer',userId:boss,amount:10000,requestId:transferId})).json().applied,false,'o mesmo pedido não paga duas vezes');assert.equal(await firm(),90000);
  assert.equal((await co({action:'transfer',userId:boss,amount:999999,requestId:randomUUID()})).statusCode,409,'não passa do saldo');
  assert.equal((await co({action:'transfer',userId:boss,amount:0,requestId:randomUUID()})).statusCode,400);
  assert.equal((await co({action:'password',userId:boss,password:'abc'})).statusCode,400,'senha curta');
  assert.equal((await co({action:'password',userId:boss,password:'segredo1'})).json().hasPassword,true);
  assert.equal((await co({action:'transfer',userId:boss,amount:1000,requestId:randomUUID()})).statusCode,403,'agora pede a senha');
  assert.equal((await co({action:'transfer',userId:boss,amount:1000,password:'errada',requestId:randomUUID()})).statusCode,403);
  assert.equal((await co({action:'transfer',userId:boss,amount:1000,password:'segredo1',requestId:randomUUID()})).statusCode,200);
  assert.equal(await firm(),89000);
  assert.equal((await co({action:'transfer',userId:partner,amount:1000,requestId:randomUUID()})).statusCode,200,'a senha é de cada dono');
  for(let i=0;i<5;i++)await co({action:'transfer',userId:boss,amount:1,password:'x'+i,requestId:randomUUID()});
  assert.equal((await co({action:'transfer',userId:boss,amount:1,password:'segredo1',requestId:randomUUID()})).statusCode,429);
  assert.equal((await co({action:'admin.password.clear',userId:boss})).statusCode,200);
  assert.equal((await co({action:'transfer',userId:boss,amount:1000,requestId:randomUUID()})).statusCode,200);
  assert.equal(await firm(),87000);
  assert.equal((await co({action:'deposit',userId:boss,amount:2000,requestId:randomUUID()})).json().balance,89000);
  assert.equal((await co({action:'deposit',userId:boss,amount:99999999,requestId:randomUUID()})).statusCode,409);

  // Raw material: a pallet of MALTE costs 30000 and the tax (15%) goes on top, to the city's vault; MIX 20000.
  const due=new Date(Date.now()+30*60_000).toISOString(),buyId=randomUUID(),vaultBefore=await vault();
  res=await co({action:'purchase',userId:boss,material:'MALTE',pallets:1,dueAt:due,requestId:buyId});assert.equal(res.statusCode,200,res.body);
  assert.equal(res.json().total,34500);assert.equal(await firm(),89000-34500);assert.equal((await vault())-vaultBefore,4500);
  assert.equal(res.json().order.price,30000);assert.equal(res.json().order.tax,4500);assert.equal(res.json().order.status,'open');
  assert.equal((await co({action:'purchase',userId:boss,material:'MALTE',pallets:1,dueAt:due,requestId:buyId})).json().applied,false);assert.equal(await firm(),89000-34500,'o mesmo pedido não cobra duas vezes');
  res=await co({action:'purchase',userId:boss,material:'MIX',pallets:2,dueAt:due,requestId:randomUUID()});assert.equal(res.json().total,46000);assert.equal(await firm(),89000-34500-46000);
  assert.equal((await co({action:'purchase',userId:boss,material:'MALTE',pallets:2,dueAt:due,requestId:randomUUID()})).statusCode,409,'falta saldo');
  const orderId=res.json().order.id;res=await co({action:'cancel',userId:boss,orderId});assert.equal(res.json().refunded,46000);assert.equal(await firm(),89000-34500);
  assert.equal((await co({action:'cancel',userId:boss,orderId})).statusCode,409);assert.equal((await vault())-vaultBefore,4500,'o imposto do pedido cancelado voltou');
  assert.equal((await api.db.select().from(factoryOrders).where(eq(factoryOrders.id,orderId)))[0]?.status,'cancelled');
  const afterBuy=(await co({action:'view',userId:boss})).json();assert.equal(afterBuy.totals.spent,34500);

  // People: managers admit and dismiss employees but never touch money.
  assert.equal((await co({action:'admit',actorId:ana,userId:bia,requestId:randomUUID()})).statusCode,403,'quem não é da firma não admite');
  assert.equal((await co({action:'admit',actorId:boss,userId:ana,requestId:randomUUID()})).statusCode,200);
  assert.equal((await co({action:'admit',actorId:boss,userId:boy,requestId:randomUUID()})).statusCode,200);
  assert.equal((await co({action:'manager',actorId:boss,userId:boy,manager:true})).statusCode,200);
  assert.equal((await co({action:'manager',actorId:boy,userId:ana,manager:true})).statusCode,403,'gerente não nomeia gerente');
  assert.equal((await co({action:'manager',actorId:boss,userId:bia,manager:true})).statusCode,409,'só contratado vira gerente');
  assert.equal((await co({action:'transfer',userId:boy,amount:10,requestId:randomUUID()})).statusCode,403,'gerente não mexe no dinheiro');
  assert.equal((await co({action:'purchase',userId:boy,material:'MIX',pallets:1,dueAt:due,requestId:randomUUID()})).statusCode,403);
  assert.equal((await co({action:'view',userId:boy})).json().role,'manager');
  assert.equal((await co({action:'view',userId:ana})).statusCode,403,'funcionário comum não vê a empresa');
  const people=(await co({action:'view',userId:boss})).json().members as Array<{role:string}>;
  assert.deepEqual(people.map(person=>person.role),['owner','owner','manager','employee']);
  assert.equal((await co({action:'dismiss',actorId:boy,userId:boss,requestId:randomUUID()})).statusCode,403,'ninguém demite um dono');
  assert.equal((await co({action:'dismiss',actorId:boy,userId:ana,requestId:randomUUID()})).statusCode,200);
  assert.equal((await co({action:'search',userId:boss,text:'ana'})).json().players[0]?.name,'ana');
  assert.equal((await co({action:'dismiss',actorId:boss,userId:boy,requestId:randomUUID()})).statusCode,200);
  assert.equal((await co({action:'view',userId:boy})).statusCode,403,'o gerente demitido perde o cargo');

  // The candidate: apply, be turned down, apply again, withdraw, apply, be admitted.
  const cookie=String((await api.app.inject({method:'POST',url:'/api/auth/login',payload:{email:'bia@company.test',password:'SenhaBoaDeTeste2026!'}})).headers['set-cookie']).split(';')[0]!;
  const apply=()=>api.app.inject({method:'POST',url:'/api/employment/hire',headers:{cookie},payload:{requestId:randomUUID()}});
  const first=await apply();assert.equal(first.statusCode,200,first.body);assert.equal(first.json().employment.status,'applied');
  assert.equal((await co({action:'view',userId:boss})).json().applicants[0]?.name,'bia');
  assert.equal((await co({action:'reject',actorId:boss,userId:bia,requestId:randomUUID()})).statusCode,200);
  assert.equal((await co({action:'view',userId:boss})).json().applicants.length,0);
  await apply();
  assert.equal((await api.app.inject({method:'POST',url:'/api/employment/withdraw',headers:{cookie},payload:{requestId:randomUUID()}})).statusCode,200);
  await apply();
  assert.equal((await co({action:'admit',actorId:boss,userId:bia,requestId:randomUUID()})).statusCode,200);
  assert.equal(JSON.parse((await api.app.inject({method:'GET',url:'/api/employment',headers:{cookie}})).body).employment.status,'hired');
});
