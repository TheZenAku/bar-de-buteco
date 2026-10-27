// Browser tests have their own services, database and explicit fixture funds. Never use live accounts.
import {spawn,execFileSync} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
// The web app's Vite, wherever npm placed it (apps/web/node_modules or hoisted to the root).
const {createServer}=await import(pathToFileURL(path.join(path.dirname(createRequire(new URL('../../apps/web/package.json',import.meta.url)).resolve('vite/package.json')),'dist/node/index.js')).href);
const root=fileURLToPath(new URL('../../',import.meta.url));
const env={...process.env,NODE_ENV:'test',API_PORT:'3111',GAME_PORT:'2677',WEB_ORIGIN:'http://localhost:5273',API_INTERNAL_URL:'http://127.0.0.1:3111',
  DATA_PATH:path.join(root,'.local/character-e2e/postgres'),BAR_HTTPS:'0',DATABASE_URL:'',VITE_GAME_URL:'/game',SMTP_HOST:'',AUTO_VERIFY_EMAIL:'true',CHARACTER_INITIAL_COINS:'5000',CHARACTER_DAILY_COINS:'0',
  MIGRATION_DATABASE_URL:'',MIGRATION_ROLE:'',MIGRATION_RUNTIME_ROLE:'',MIGRATION_LOCK_TIMEOUT_MS:'',
  WORLD_OUTBOX_PATH:path.join(root,'.local/character-e2e/world-outbox.jsonl')};
execFileSync(process.execPath,['--import','tsx','apps/api/src/database/migrate.ts'],{env,cwd:root,stdio:'inherit',windowsHide:true});
execFileSync(process.execPath,['--import','tsx','apps/api/src/seed.ts'],{env,cwd:root,stdio:'inherit',windowsHide:true});
const children=['api','server'].map(app=>spawn(process.execPath,['--import','tsx',`apps/${app}/src/index.ts`],{env:{...env,TSX_TSCONFIG_PATH:path.join(root,`apps/${app}/tsconfig.json`)},cwd:root,stdio:'inherit',windowsHide:true}));
Object.assign(process.env,env);
// Exercise the supported same-origin deployment path for HTTP matchmaking and WS.
const vite=await createServer({root:path.join(root,'apps/web'),configFile:path.join(root,'apps/web/vite.config.ts'),server:{host:'127.0.0.1',port:5273,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:3111',changeOrigin:false,xfwd:true},'/game':{target:'http://127.0.0.1:2677',ws:true,changeOrigin:false,rewrite:requestPath=>requestPath.replace(/^\/game/,'')}}}});
await vite.listen();
async function close(){await vite.close();for(const child of children)child.kill();process.exit();}
process.on('SIGINT',close);process.on('SIGTERM',close);
