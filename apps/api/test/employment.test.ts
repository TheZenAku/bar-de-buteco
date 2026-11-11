import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {internalSecret} from '@bar/shared/tickets';
import {createApi} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {employmentEvents,employmentShifts,employments,sessions} from '../src/database/schema.js';

test('emprego da fábrica: admissão e demissão são idempotentes, expediente exige vínculo e respeita cooldown',{timeout:120000},async t=>{
  const api=await createApi({config:{...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true},rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const internal={'x-internal-secret':internalSecret()};
  async function account(name:string){
    const response=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{username:name,displayName:name,email:`${name}@employment.test`,password:'SenhaBoaDeTeste2026!'}});assert.equal(response.statusCode,201,response.body);
    const userId=response.json().user.id as string,cookie=`${response.cookies[0]!.name}=${response.cookies[0]!.value}`,[session]=await api.db.select().from(sessions).where(eq(sessions.userId,userId));return {userId,cookie,sessionId:session!.id};
  }
  const worker=await account('factory_worker'),visitor=await account('factory_visitor');
  const hireId=randomUUID(),hire=()=>api.app.inject({method:'POST',url:'/api/employment/hire',headers:{cookie:worker.cookie},payload:{requestId:hireId}});
  assert.equal((await hire()).statusCode,200);assert.equal((await hire()).statusCode,200);
  const [employment]=await api.db.select().from(employments).where(eq(employments.userId,worker.userId));assert.equal(employment?.jobId,'spray-dry-operator');assert.equal(employment?.status,'hired');
  assert.equal((await api.db.select().from(employmentEvents).where(eq(employmentEvents.requestId,hireId))).length,1);

  const shiftCall=(person:typeof worker,action:string,payload:object={})=>api.app.inject({method:'POST',url:'/api/internal/employment',headers:internal,payload:{sessionId:person.sessionId,userId:person.userId,action,...payload}});
  assert.equal((await shiftCall(visitor,'start',{requestId:randomUUID(),station:'painel'})).statusCode,403);
  const shiftId=randomUUID(),started=await shiftCall(worker,'start',{requestId:shiftId,station:'painel'});assert.equal(started.statusCode,200,started.body);assert.equal(started.json().shift.station,'painel');
  assert.equal((await shiftCall(worker,'start',{requestId:shiftId,station:'painel'})).json().shift.id,started.json().shift.id);
  assert.equal((await api.db.select().from(employmentShifts).where(eq(employmentShifts.requestId,shiftId))).length,1);
  assert.equal((await shiftCall(worker,'stop')).statusCode,200);assert.equal((await shiftCall(worker,'stop')).statusCode,409);

  const resignId=randomUUID(),resign=()=>api.app.inject({method:'POST',url:'/api/employment/resign',headers:{cookie:worker.cookie},payload:{requestId:resignId}});
  assert.equal((await resign()).statusCode,200);assert.equal((await resign()).statusCode,200);
  const after=(await api.app.inject({method:'GET',url:'/api/employment',headers:{cookie:worker.cookie}})).json();assert.equal(after.employment.status,'resigned');assert.ok(new Date(after.employment.cooldownUntil).getTime()>Date.now());
  assert.equal((await api.app.inject({method:'POST',url:'/api/employment/hire',headers:{cookie:worker.cookie},payload:{requestId:randomUUID()}})).statusCode,409);
});

test('expediente limita seis operadores mesmo com entradas simultâneas',{timeout:120000},async t=>{
  const api=await createApi({config:{...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true},rateLimit:false,migrate:true});t.after(()=>api.app.close());const internal={'x-internal-secret':internalSecret()};
  const people=[];
  for(let i=0;i<7;i++){const name=`shift_${i}`,response=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{username:name,displayName:name,email:`${name}@employment.test`,password:'SenhaBoaDeTeste2026!'}}),userId=response.json().user.id as string,[session]=await api.db.select().from(sessions).where(eq(sessions.userId,userId));await api.app.inject({method:'POST',url:'/api/employment/hire',headers:{cookie:`${response.cookies[0]!.name}=${response.cookies[0]!.value}`},payload:{requestId:randomUUID()}});people.push({userId,sessionId:session!.id});}
  const starts=await Promise.all(people.map(person=>api.app.inject({method:'POST',url:'/api/internal/employment',headers:internal,payload:{...person,action:'start',requestId:randomUUID(),station:'entrada'}})));
  assert.deepEqual(starts.map(r=>r.statusCode).sort(),[200,200,200,200,200,200,409]);
});
