import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../src/app.js';
import {readConfig} from '../src/config.js';

test('a character keeps its place and needs in the API: saved in batches, read back on join, never written by a stranger',async t=>{
  const config={...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true};
  const api=await createApi({config,rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const headers={'x-internal-secret':config.internalSecret};
  const register=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{email:'mundo@example.com',username:'mundo',displayName:'Mundo',password:'MundoSeguro2026!'}});
  const userId=register.json().user.id as string;
  const post=(payload:unknown)=>api.app.inject({method:'POST',url:'/api/internal/player-world',headers,payload});

  assert.deepEqual((await post({action:'load',userId})).json(),{state:null},'a new character has no save');
  const place={x:-3.5,y:0,z:12.25,rotation:1.5,needs:{hunger:12,thirst:40,dead:false}};
  assert.equal((await post({action:'save',players:[{userId,state:place}]})).json().saved,1);
  assert.deepEqual((await post({action:'load',userId})).json().state,place);
  assert.equal((await post({action:'save',players:[{userId,state:{...place,z:20}}]})).statusCode,200);
  assert.equal((await post({action:'load',userId})).json().state.z,20,'the newest save wins');
  assert.equal((await post({action:'save',players:[{userId:'nao-e-uuid',state:place}]})).statusCode,400);
  assert.equal((await api.app.inject({method:'POST',url:'/api/internal/player-world',payload:{action:'load',userId}})).statusCode,401,'internal secret required');
});
