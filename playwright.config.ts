import {defineConfig} from '@playwright/test';
process.env.PLAYWRIGHT_GAME_HEALTH_URL='http://localhost:2677/health';
export default defineConfig({
  testDir:'tests/e2e',timeout:90000,expect:{timeout:15000},fullyParallel:false,workers:1,
  use:{baseURL:'http://localhost:5273',headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),viewport:{width:960,height:640},launchOptions:{args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']},trace:{mode:'retain-on-failure',screenshots:false},screenshot:'only-on-failure'},
  // Separate loopback client identities keep unrelated registrations below the
  // API's per-address limit, including observer contexts. Limits stay enabled;
  // the trusted local Vite proxy forwards these test-only headers.
  projects:[
    {name:'game',testMatch:'**/bar.spec.ts',grep:/new skeletal|new accounts|two independent/,use:{extraHTTPHeaders:{'X-Forwarded-For':'::1'}}},
    {name:'world',testMatch:['**/bar.spec.ts','**/admin.spec.ts'],grepInvert:/new skeletal|new accounts|two independent/,use:{extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.1'}}},
    {name:'interface',testMatch:['**/nova-ui.spec.ts','**/clothing.spec.ts','**/old-cane.spec.ts'],use:{extraHTTPHeaders:{'X-Forwarded-For':'::ffff:127.0.0.1'}}},
    {name:'media',testMatch:'**/jukebox.spec.ts',use:{extraHTTPHeaders:{'X-Forwarded-For':'::1'}}},
    {name:'doors',testMatch:'**/doors.spec.ts',use:{extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.3'}}},
    {name:'ambient',testMatch:'**/ambient.spec.ts',use:{extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.3'}}},
    {name:'environment',testMatch:'**/environment.spec.ts'},
    // Chromium's fake microphone; localhost is a secure context, so getUserMedia works without HTTPS.
    {name:'voice',testMatch:'**/voice.spec.ts',use:{extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.2'},launchOptions:{args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}}},
  ],
  webServer:{command:'node tools/e2e-server.mjs',url:'http://localhost:5273',reuseExistingServer:false,timeout:120000},
});
