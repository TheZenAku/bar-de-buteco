// Prints the pseudonym the world logs use for an account id, to find that player's lines.
// Same formula as apps/server/src/observability.ts; requires the AUTH_SECRET of the environment that wrote the logs.
// Usage: node tools/pseudonym.mjs <userId> [<userId> ...]
import {createHmac} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const ids=process.argv.slice(2);
if(!ids.length){console.error('Uso: node tools/pseudonym.mjs <userId> [<userId> ...]');process.exit(2);}
let secret=process.env.AUTH_SECRET;
const env=fileURLToPath(new URL('../.env',import.meta.url));
if(!secret&&existsSync(env))secret=readFileSync(env,'utf8').match(/^AUTH_SECRET=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g,'');
secret||='local-development-only-change-before-deploying';
for(const id of ids)console.log(`${id} ${createHmac('sha256',secret).update(`log:${id}`).digest('hex').slice(0,12)}`);
