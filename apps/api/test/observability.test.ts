import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../src/app.js';
import {readConfig} from '../src/config.js';

test('API: correlation ids, readiness and protected metrics with route templates only',async t=>{
  const config={...readConfig(),production:false,databaseUrl:undefined,dataPath:'memory://',autoVerifyEmail:true};
  const service=await createApi({config,rateLimit:false});t.after(()=>service.app.close());
  const correlated=await service.app.inject({url:'/api/health',headers:{'x-request-id':'world-6c1f1b9e-0000-4000-8000-000000000001'}});
  assert.equal(correlated.headers['x-request-id'],'world-6c1f1b9e-0000-4000-8000-000000000001','The caller\'s id is kept');
  const forged=await service.app.inject({url:'/api/health',headers:{'x-request-id':'bad id\nwith newline'}});
  assert.match(String(forged.headers['x-request-id']),/^[0-9a-f-]{36}$/,'Malformed ids are replaced');
  const ready=await service.app.inject({url:'/api/ready'});
  assert.equal(ready.statusCode,200);assert.deepEqual(ready.json(),{ready:true,checks:{database:true}});
  await service.app.inject({url:'/api/admin/overview?search=secret-search'});
  assert.equal((await service.app.inject({url:'/api/internal/metrics'})).statusCode,401);
  const metrics=await service.app.inject({url:'/api/internal/metrics',headers:{'x-internal-secret':config.authSecret}});
  assert.equal(metrics.statusCode,200);assert.match(String(metrics.headers['content-type']),/^text\/plain/);
  assert.match(metrics.body,/bar_api_requests_total\{method="GET",route="\/api\/health",status="2xx"\} 2/);
  assert.match(metrics.body,/route="\/api\/admin\/overview",status="4xx"/);
  assert.ok(!metrics.body.includes('secret-search'),'Queries never become labels');
  assert.match(metrics.body,/bar_api_request_ms\{quantile="0.99"\} [\d.]+/);
});

test('API readiness fails when the database does not answer',async t=>{
  const config={...readConfig(),production:false,databaseUrl:undefined,dataPath:'memory://',autoVerifyEmail:true};
  const service=await createApi({config,rateLimit:false});t.after(()=>service.app.close());
  const original=service.db.execute.bind(service.db);
  (service.db as any).execute=async()=>{throw new Error('connection refused');};
  try{const response=await service.app.inject({url:'/api/ready'});assert.equal(response.statusCode,503);assert.deepEqual(response.json(),{ready:false,checks:{database:false}});}
  finally{(service.db as any).execute=original;}
  assert.equal((await service.app.inject({url:'/api/health'})).statusCode,200,'Liveness stays up: the process answers');
});

test('API configuration refuses invalid numbers instead of starting with NaN',()=>{
  const saved={...process.env};
  try{
    for(const [name,value] of [['API_PORT','abc'],['SMTP_PORT','99999'],['TRUST_PROXY_HOPS','1.5']] as const){
      process.env={...saved,[name]:value};assert.throws(()=>readConfig(),new RegExp(name));
    }
    process.env={...saved,API_PORT:'',TRUST_PROXY_HOPS:'2'};const config=readConfig();
    assert.equal(config.port,3001);assert.equal(config.trustProxyHops,2);
  }finally{process.env=saved;}
});
