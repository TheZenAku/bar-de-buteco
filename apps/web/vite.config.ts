import {createRequire} from 'node:module';
import {defineConfig} from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import {redirectHttpToHttps} from './http-redirect.js';
// Browsers only grant the microphone (proximity voice) to secure pages, so the site is served over HTTPS
// with a self-signed certificate unless BAR_HTTPS=0. /game reaches the multiplayer server through the same
// address, because an https:// page cannot open a plain ws:// connection to another port.
const https=process.env.BAR_HTTPS!=='0';
// The dev server is what players load, and the engine's "development" export is its debug build: 22 MB unminified, with a
// validation on every draw call. It serves the release build (minified, 2.5 MB) unless BAR_PLAYCANVAS asks for another:
// "debug" for the engine's checks and messages, "profiler" for its timings (app.stats.frame, draw calls per pass).
const engineBuild={debug:'playcanvas.dbg.mjs',profiler:'playcanvas.prf.mjs'}[process.env.BAR_PLAYCANVAS??'']??'playcanvas.min.mjs';
const engine=createRequire(import.meta.url).resolve(`playcanvas/build/${engineBuild}`);
// Vite appends the engine's source map to the module it serves (6 MB of the 9): players do not need it. BAR_PLAYCANVAS keeps it.
const engineWithoutMap={name:'bar-engine-without-map',enforce:'post' as const,
  transform(code:string,id:string){return !process.env.BAR_PLAYCANVAS&&/\/\.vite\/deps\/playcanvas\.js$/.test(id.split('?')[0]!)?{code,map:{mappings:''}}:undefined;}};
const proxy={
  '/api':{target:'http://127.0.0.1:3001',changeOrigin:false,xfwd:true},
  '/game':{target:`http://127.0.0.1:${process.env.GAME_PORT||2567}`,ws:true,changeOrigin:false,xfwd:true,rewrite:(requestPath:string)=>requestPath.replace(/^\/game/,'')},
};
export default defineConfig(({command})=>({
  plugins:[...(https?[basicSsl({name:'bar-de-buteco'}),redirectHttpToHttps()]:[]),engineWithoutMap],
  // The production build picks the release engine by itself (and shakes out what the game does not use).
  resolve:command==='serve'?{alias:[{find:/^playcanvas$/,replacement:engine}]}:{},
  server:{port:5173,strictPort:true,proxy},
  // `npm run serve -w @bar/web` (vite preview): the built game, compressed and cached, at the same address and with the same routes.
  preview:{port:5173,strictPort:true,proxy},
  build:{target:'es2022',chunkSizeWarningLimit:1800},
}));
