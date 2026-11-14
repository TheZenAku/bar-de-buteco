import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';import {eq} from 'drizzle-orm';
import {upgradeCost} from '@bar/shared';import {internalSecret} from '@bar/shared/tickets';
import {createApi} from '../src/app.js';import {readConfig} from '../src/config.js';
import {currencyLedger,wallets,weaponArsenal,weaponParts} from '../src/database/schema.js';

test('the persistent arsenal contains only real weapons, keeps equipment and charges upgrades once',{timeout:120000},async t=>{
  const api=await createApi({config:{...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true},rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const internal={'x-internal-secret':internalSecret()};
  const registered=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{username:'armas_dono',displayName:'armas_dono',email:'armas_dono@armas.test',password:'SenhaBoaDeTeste2026!'}});
  assert.equal(registered.statusCode,201,registered.body);const userId=registered.json().user.id as string;
  const post=(path:string,payload:Record<string,unknown>,headers:Record<string,string>=internal)=>api.app.inject({method:'POST',url:`/api/internal/arsenal/${path}`,headers,payload});

  assert.equal((await post('load',{userId},{})).statusCode,401,'only the world may load an arsenal');
  assert.equal((await post('load',{userId,testKit:true})).statusCode,400,'the removed test kit cannot be requested again');
  const empty=(await post('load',{userId})).json();assert.deepEqual([empty.weapons.length,empty.parts.length,empty.test,empty.infinite],[0,0,false,false]);

  for(const weapon of ['fuzil','revolver','pistola'] as const){const granted=await post('grant',{userId,weapon,requestId:randomUUID()});assert.equal(granted.statusCode,200,granted.body);assert.equal(granted.json().applied,true);}
  const repeated=await post('grant',{userId,weapon:'fuzil',requestId:randomUUID()});assert.equal(repeated.statusCode,200,repeated.body);assert.equal(repeated.json().applied,false);
  const stored=await api.db.select().from(weaponArsenal).where(eq(weaponArsenal.userId,userId));assert.equal(stored.length,3);assert.ok(stored.every(row=>row.source==='ribeiro'));

  await api.db.insert(weaponParts).values([{userId,partId:'silenciador',source:'ribeiro'},{userId,partId:'acog',source:'ribeiro'}]);
  const fitted=await post('configure',{userId,weapon:'fuzil',slot:'boca',part:'silenciador'});assert.equal(fitted.statusCode,200,fitted.body);
  assert.equal(fitted.json().weapons.find((weapon:{id:string})=>weapon.id==='fuzil').parts.boca,'silenciador');
  const wrong=await post('configure',{userId,weapon:'revolver',slot:'mira',part:'acog'});assert.equal(wrong.statusCode,409);assert.equal(wrong.json().error,'Essa arma não tem esse encaixe.');

  const equipped=await post('equip',{userId,weapon:'fuzil',equipped:true,test:false});assert.equal(equipped.statusCode,200,equipped.body);
  assert.equal(equipped.json().weapons.find((weapon:{id:string})=>weapon.id==='fuzil').equipped,true);
  const unequipped=await post('equip',{userId,weapon:'fuzil',equipped:false,test:false});assert.equal(unequipped.statusCode,200,unequipped.body);
  assert.equal(unequipped.json().weapons.find((weapon:{id:string})=>weapon.id==='fuzil').equipped,false);

  await api.db.insert(wallets).values({userId,balance:100_000}).onConflictDoUpdate({target:wallets.userId,set:{balance:100_000}});
  const requestId=randomUUID(),price=upgradeCost('pistola',1),paid=await post('upgrade',{userId,weapon:'pistola',track:'dano',free:false,requestId});
  assert.equal(paid.statusCode,200,paid.body);assert.deepEqual([paid.json().cost,paid.json().balance],[price,100_000-price]);
  const retry=await post('upgrade',{userId,weapon:'pistola',track:'dano',free:false,requestId});assert.deepEqual([retry.json().cost,retry.json().balance],[price,100_000-price]);
  const ledger=await api.db.select().from(currencyLedger).where(eq(currencyLedger.id,`weapon:${requestId}`));assert.deepEqual([ledger.length,ledger[0]!.amount,ledger[0]!.reason],[1,-price,'weapon:upgrade']);
  assert.equal((await post('load',{userId:randomUUID()})).statusCode,404);
});
