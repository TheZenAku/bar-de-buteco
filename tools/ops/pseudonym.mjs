// Prints the pseudonym the world logs use for an account id, to find that player's lines.
// Same formula as apps/server/src/observability.ts; requires the INTERNAL_SECRET of the environment that wrote the logs.
// Usage: node tools/ops/pseudonym.mjs <userId> [<userId> ...]
import {createHmac} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const ids=process.argv.slice(2);
if(!ids.length){console.error('Uso: node tools/ops/pseudonym.mjs <userId> [<userId> ...]');process.exit(2);}
let secret=process.env.INTERNAL_SECRET;
const env=fileURLToPath(new URL('../../.env',import.meta.url));
if(!secret&&existsSync(env)){
  const contents=readFileSync(env,'utf8');
  secret=contents.match(/^INTERNAL_SECRET=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g,'');
  // Local migration compatibility only; production must always set INTERNAL_SECRET.
  if(process.env.NODE_ENV!=='production')secret||=contents.match(/^AUTH_SECRET=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g,'');
}
if(!secret&&process.env.NODE_ENV!=='production')secret=process.env.AUTH_SECRET||'local-development-only-change-before-deploying';
if(!secret){console.error('INTERNAL_SECRET é obrigatório para consultar pseudônimos de produção.');process.exit(2);}
for(const id of ids)console.log(`${id} ${createHmac('sha256',secret).update(`log:${id}`).digest('hex').slice(0,12)}`);
