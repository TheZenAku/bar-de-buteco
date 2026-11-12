import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';import {eq} from 'drizzle-orm';
import {PART_IDS,WEAPON_IDS,upgradeCost} from '@bar/shared';import {internalSecret} from '@bar/shared/tickets';
import {createApi} from '../src/app.js';import {readConfig} from '../src/config.js';
import {currencyLedger,wallets,weaponArsenal} from '../src/database/schema.js';

test('the firearms arsenal: the test kit granted once and never reset, parts checked against what is stored, upgrades free in the kit or paid once on the ledger',{timeout:120000},async t=>{
  const api=await createApi({config:{...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true},rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const internal={'x-internal-secret':internalSecret()};
  const registered=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{username:'armas_dono',displayName:'armas_dono',email:'armas_dono@armas.test',password:'SenhaBoaDeTeste2026!'}});
  assert.equal(registered.statusCode,201,registered.body);
  const userId=registered.json().user.id as string;
  const post=(path:string,payload:Record<string,unknown>,headers:Record<string,string>=internal)=>api.app.inject({method:'POST',url:`/api/internal/arsenal/${path}`,headers,payload});
  const balance=async()=>(await api.db.select().from(wallets).where(eq(wallets.userId,userId)))[0]?.balance??0;

  // Only the world may ask.
  assert.equal((await post('load',{userId,testKit:true},{})).statusCode,401);
  // Nothing owned until /armas; then everything, with the scopes that come fitted.
  const empty=(await post('load',{userId})).json();
  assert.deepEqual([empty.weapons.length,empty.parts.length,empty.test],[0,0,false]);
  const manufactured=await post('grant',{userId,weapon:'fuzil',requestId:randomUUID()});assert.equal(manufactured.statusCode,200,manufactured.body);assert.equal(manufactured.json().applied,true);assert.equal(manufactured.json().view.weapons[0]?.id,'fuzil');
  const repeated=await post('grant',{userId,weapon:'fuzil',requestId:randomUUID()});assert.equal(repeated.statusCode,200,repeated.body);assert.equal(repeated.json().applied,false);assert.equal(repeated.json().view.weapons.length,1);
  const kit=(await post('load',{userId,testKit:true})).json();
  assert.equal(kit.weapons.length,WEAPON_IDS.length);assert.equal(kit.parts.length,PART_IDS.length);
  assert.deepEqual([kit.test,kit.infinite],[true,true]);
  assert.equal(kit.weapons.find((w:{id:string})=>w.id==='precisao').parts.mira,'luneta');

  // A part fitted is kept; one that does not fit or is not owned is refused with the shared rule's words.
  const fitted=await post('configure',{userId,weapon:'fuzil',slot:'boca',part:'silenciador'});
  assert.equal(fitted.statusCode,200,fitted.body);
  assert.equal(fitted.json().weapons.find((w:{id:string})=>w.id==='fuzil').parts.boca,'silenciador');
  const wrong=await post('configure',{userId,weapon:'revolver',slot:'mira',part:'acog'});
  assert.equal(wrong.statusCode,409);assert.equal(wrong.json().error,'Essa arma não tem esse encaixe.');
  assert.equal((await post('configure',{userId,weapon:'fuzil',slot:'mira',part:'nao-existe'})).statusCode,400);

  // /armas again never resets what was set.
  const again=(await post('load',{userId,testKit:true})).json();
  assert.equal(again.weapons.find((w:{id:string})=>w.id==='fuzil').parts.boca,'silenciador');

  // Free in the kit: a level, no coins.
  const start=await balance();
  const free=await post('upgrade',{userId,weapon:'pistola',track:'dano',free:true,requestId:randomUUID()});
  assert.equal(free.statusCode,200,free.body);
  assert.deepEqual([free.json().cost,free.json().balance],[0,start]);
  assert.equal(free.json().view.weapons.find((w:{id:string})=>w.id==='pistola').upgrades.dano,1);

  // Paid: the price of level 2 once on the ledger; the same request again changes nothing; without coins it is refused.
  await api.db.update(wallets).set({balance:10_000}).where(eq(wallets.userId,userId));
  const requestId=randomUUID(),price=upgradeCost('pistola',2);
  const paid=await post('upgrade',{userId,weapon:'pistola',track:'dano',free:false,requestId});
  assert.equal(paid.statusCode,200,paid.body);
  assert.deepEqual([paid.json().cost,paid.json().balance],[price,10_000-price]);
  const retry=await post('upgrade',{userId,weapon:'pistola',track:'dano',free:false,requestId});
  assert.deepEqual([retry.json().cost,retry.json().balance],[price,10_000-price]);
  assert.equal(((await api.db.select().from(weaponArsenal).where(eq(weaponArsenal.userId,userId))).find(row=>row.weaponId==='pistola')!.upgrades as {dano?:number}).dano,2);
  const ledger=await api.db.select().from(currencyLedger).where(eq(currencyLedger.id,`weapon:${requestId}`));
  assert.deepEqual([ledger.length,ledger[0]!.amount,ledger[0]!.reason],[1,-price,'weapon:upgrade']);
  await api.db.update(wallets).set({balance:0}).where(eq(wallets.userId,userId));
  const broke=await post('upgrade',{userId,weapon:'pistola',track:'dano',free:false,requestId:randomUUID()});
  assert.equal(broke.statusCode,409);assert.equal(broke.json().error,'Moedas insuficientes.');
  // The top level is the last.
  for(let level=3;level<=5;level++)assert.equal((await post('upgrade',{userId,weapon:'pistola',track:'dano',free:true,requestId:randomUUID()})).statusCode,200);
  const top=await post('upgrade',{userId,weapon:'pistola',track:'dano',free:true,requestId:randomUUID()});
  assert.equal(top.statusCode,409);assert.equal(top.json().error,'Essa melhoria já está no máximo.');
  assert.equal((await post('load',{userId:randomUUID()})).statusCode,404);
});
