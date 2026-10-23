import {defineConfig} from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import {redirectHttpToHttps} from './http-redirect';
// Browsers only grant the microphone (proximity voice) to secure pages, so the site is served over HTTPS
// with a self-signed certificate unless BAR_HTTPS=0. /game reaches the multiplayer server through the same
// address, because an https:// page cannot open a plain ws:// connection to another port.
const https=process.env.BAR_HTTPS!=='0';
export default defineConfig({
  plugins:https?[basicSsl({name:'bar-de-buteco'}),redirectHttpToHttps()]:[],
  server:{port:5173,strictPort:true,proxy:{
    '/api':{target:'http://127.0.0.1:3001',changeOrigin:false,xfwd:true},
    '/game':{target:`http://127.0.0.1:${process.env.GAME_PORT||2567}`,ws:true,changeOrigin:false,xfwd:true,rewrite:requestPath=>requestPath.replace(/^\/game/,'')},
  }},
  build:{target:'es2022',chunkSizeWarningLimit:1800},
});
