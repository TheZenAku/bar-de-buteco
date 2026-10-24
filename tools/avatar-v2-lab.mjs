import {createReadStream,existsSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const exportRoot=path.join(repo,'BAR_Avatar_V2','export');
const webRoot=path.join(repo,'apps','web');
const port=Number(process.env.AVATAR_V2_PORT||5183);
const mime=new Map([
  ['.glb','model/gltf-binary'],['.png','image/png'],['.json','application/json; charset=utf-8'],
  ['.md','text/markdown; charset=utf-8'],['.txt','text/plain; charset=utf-8'],
]);

if(!existsSync(exportRoot))throw new Error(`Export V2 ausente: ${exportRoot}`);

const exportPlugin={
  name:'bar-avatar-v2-isolated-assets',
  configureServer(server){
    server.middlewares.use('/avatars-v2',(request,response,next)=>{
      try{
        const relative=decodeURIComponent((request.url||'/').split('?')[0]).replace(/^\/+/, '');
        const target=path.resolve(exportRoot,relative);
        if(target!==exportRoot&&!target.startsWith(exportRoot+path.sep)){
          response.statusCode=403;response.end('Forbidden');return;
        }
        if(!existsSync(target)||!statSync(target).isFile()){next();return;}
        response.setHeader('Content-Type',mime.get(path.extname(target).toLowerCase())||'application/octet-stream');
        response.setHeader('Cache-Control','no-store');
        response.setHeader('X-Avatar-V2-Lab','isolated');
        createReadStream(target).pipe(response);
      }catch(error){next(error);}
    });
  },
};

const server=await createServer({
  root:webRoot,
  configFile:false,
  plugins:[exportPlugin],
  server:{host:'127.0.0.1',port,strictPort:true},
  build:{target:'es2022'},
  appType:'spa',
});
await server.listen();
server.printUrls();
console.log('Avatar V2 LAB isolado: animações com licença não verificada; não usar em produção.');

