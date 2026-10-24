import {defineConfig} from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import {redirectHttpToHttps} from './http-redirect';
import {createReadStream,existsSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// Browsers only grant the microphone (proximity voice) to secure pages, so the site is served over HTTPS
// with a self-signed certificate unless BAR_HTTPS=0. /game reaches the multiplayer server through the same
// address, because an https:// page cannot open a plain ws:// connection to another port.
const https=process.env.BAR_HTTPS!=='0';
const avatarV2Root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..','BAR_Avatar_V2','export');
const avatarV2Assets={name:'avatar-v2-development-assets',configureServer(server:{middlewares:{use:(route:string,handler:(request:{url?:string},response:{statusCode:number;setHeader:(name:string,value:string)=>void;end:(body:string)=>void},next:(error?:unknown)=>void)=>void)=>void}}){
  server.middlewares.use('/avatars-v2',(request,response,next)=>{try{
    const relative=decodeURIComponent((request.url??'/').split('?')[0]).replace(/^\/+/,''),target=path.resolve(avatarV2Root,relative);
    if(target!==avatarV2Root&&!target.startsWith(avatarV2Root+path.sep)){response.statusCode=403;response.end('Forbidden');return;}
    if(!existsSync(target)||!statSync(target).isFile()){next();return;}
    const types:Record<string,string>={'.glb':'model/gltf-binary','.png':'image/png','.json':'application/json; charset=utf-8'};
    response.setHeader('Content-Type',types[path.extname(target).toLowerCase()]??'application/octet-stream');response.setHeader('Cache-Control','no-store');createReadStream(target).pipe(response as never);
  }catch(error){next(error);}});
}};
export default defineConfig({
  plugins:[avatarV2Assets,...(https?[basicSsl({name:'bar-de-buteco'}),redirectHttpToHttps()]:[])],
  server:{port:5173,strictPort:true,proxy:{
    '/api':{target:'http://127.0.0.1:3001',changeOrigin:false,xfwd:true},
    '/game':{target:`http://127.0.0.1:${process.env.GAME_PORT||2567}`,ws:true,changeOrigin:false,xfwd:true,rewrite:requestPath=>requestPath.replace(/^\/game/,'')},
  }},
  build:{target:'es2022',chunkSizeWarningLimit:1800},
});
