import {defineConfig} from 'vite';
export default defineConfig({server:{port:5173,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:3001',changeOrigin:false}}},build:{target:'es2022',chunkSizeWarningLimit:1800}});
