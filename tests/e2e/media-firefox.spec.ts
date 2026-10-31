import {test,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
const tvFixture='/@fs/'+fileURLToPath(new URL('../fixtures/tv-controller.html',import.meta.url)).replaceAll('\\','/');

// Vimeo puts a bot check (Cloudflare Turnstile) in front of its player for an automated browser: Edge always, Firefox from
// the second player on. So this drives one player, directly, instead of the panel's check followed by the three screens.
test('real Vimeo: its player answers as the jukebox and the TVs expect',async({page})=>{
  test.setTimeout(90000);
  let challenged=false;page.on('response',response=>{if(response.status()===401&&/player\.vimeo\.com\/video/.test(response.url()))challenged=true;});
  await page.goto(tvFixture);await expect.poll(()=>page.evaluate(()=>!!(window as any).fixture)).toBe(true);
  await page.locator('#panel').click({position:{x:5,y:5}});
  const started=await page.evaluate(async()=>{
    const {loadPlayers}=await import('/src/media/platforms.ts' as string),factory=await loadPlayers('vimeo');
    const slot=document.createElement('div'),host=document.createElement('div');host.className='media-player';host.append(slot);document.body.append(host);
    const debug:any=(window as any).vimeoDebug={states:[],errors:[]};
    return new Promise<boolean>(resolve=>{
      setTimeout(()=>resolve(false),25000);
      factory(slot,{media:'1084537',controls:false,probe:false,label:'Vimeo',events:{
        onReady:({target}:any)=>{debug.player=target;target.mute();target.setVolume(40);target.loadVideoById({videoId:'1084537',startSeconds:0});resolve(true);},
        onStateChange:({data}:any)=>debug.states.push(data),onError:({data}:any)=>debug.errors.push(data),onAutoplayBlocked:()=>debug.errors.push('blocked'),
      }});
    });
  });
  test.skip(!started&&challenged,'o Vimeo pediu a verificação de robô a este navegador automatizado');
  expect(started).toBe(true);
  const read=()=>page.evaluate(()=>{const {player,states,errors}=(window as any).vimeoDebug;return {time:player.getCurrentTime(),duration:player.getDuration(),state:player.getPlayerState(),title:player.getVideoData().title,states,errors};});
  await expect.poll(async()=>(await read()).state,{timeout:30000}).toBe(1);
  await expect.poll(async()=>(await read()).time,{timeout:20000}).toBeGreaterThan(1);
  const playing=await read();expect(playing.duration).toBeGreaterThan(500);expect(playing.title).toBe('Big Buck Bunny');expect(playing.errors).toEqual([]);
  await page.evaluate(()=>(window as any).vimeoDebug.player.seekTo(120,true));
  await expect.poll(async()=>(await read()).time,{timeout:20000}).toBeGreaterThan(119);
  await page.evaluate(()=>(window as any).vimeoDebug.player.pauseVideo());
  await expect.poll(async()=>(await read()).state,{timeout:15000}).toBe(2);
  await page.evaluate(()=>(window as any).vimeoDebug.player.destroy());
  await expect(page.locator('.media-player iframe')).toHaveCount(0);
});
