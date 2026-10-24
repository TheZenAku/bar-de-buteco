import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'tests/avatar-v2',timeout:240000,expect:{timeout:30000},fullyParallel:false,workers:1,
  use:{baseURL:'http://127.0.0.1:5183',headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),viewport:{width:1440,height:900},launchOptions:{args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']},trace:'retain-on-failure',screenshot:'only-on-failure'},
  reporter:[['list'],['html',{outputFolder:'playwright-report/avatar-v2',open:'never'}]],
  webServer:{command:'node tools/avatar-v2-lab.mjs',url:'http://127.0.0.1:5183/avatar-v2-lab.html',reuseExistingServer:true,timeout:120000},
});

