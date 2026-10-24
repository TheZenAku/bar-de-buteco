import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'tests/avatar-v2-live',timeout:180000,workers:1,fullyParallel:false,
  use:{baseURL:'https://127.0.0.1:5173',ignoreHTTPSErrors:true,headless:true,channel:process.platform==='win32'?'msedge':undefined,viewport:{width:1280,height:800},launchOptions:{args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']},screenshot:'only-on-failure',trace:'retain-on-failure'},
  reporter:[['list']],
});

