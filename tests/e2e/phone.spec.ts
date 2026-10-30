import {test,expect,type Browser,type Page} from '@playwright/test';
// Chromium's fake microphone (launch flags in playwright.config.ts) feeds the call's voice and the voice notes.
const password='ButecoTeste2026!';
async function enter(browser:Browser,name:string):Promise<{page:Page;id:string;username:string}>{
  const context=await browser.newContext({permissions:['microphone']});const page=await context.newPage();
  const id=`${name}_${Date.now().toString(36)}`,username=id.slice(0,24).toLowerCase();
  await page.goto('/');
  await page.getByRole('button',{name:'Criar conta',exact:true}).click();
  await page.getByLabel('Seu nome',{exact:true}).fill(name);
  await page.getByLabel('Usuário',{exact:true}).fill(username);
  await page.getByLabel('E-mail',{exact:true}).fill(`${id.toLowerCase()}@example.com`);
  await page.getByLabel('Senha',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Criar minha conta'}).click();
  await expect(page.locator('#game')).toBeVisible({timeout:60000});await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  return {page,username,id:await page.evaluate(()=>(window as any).barDebug.snapshot().localId)};
}
/** From any screen of the phone: home, then the app's icon. */
async function openApp(page:Page,app:string):Promise<void>{
  if(!await page.locator('#phone.open').count())await page.keyboard.press('k');
  await page.locator('#phone [data-phone-home]').click();
  await page.locator(`#phone .ph-home .ph-icon[data-app="${app}"]`).click();
  await expect(page.locator(`#phone .ph-app-${app}`)).toBeVisible();
}
/** Pessoas no bar → Ficha: the other player's number, saved to the agenda. */
async function saveFromCard(page:Page,id:string):Promise<string>{
  if(await page.locator('#phone.open').count())await page.keyboard.press('Escape');
  await page.locator('[data-action="people"]').first().click();
  await page.locator(`[data-action="player-card"][data-id="${id}"]`).click();
  await expect(page.locator('.player-card')).toBeVisible({timeout:20000});
  const number=(await page.locator('.card-number').textContent())!.replace(/\D/g,'');
  await page.locator('[data-action="card-save"]').click();
  await expect(page.locator('.card-actions')).toContainText('Na sua agenda',{timeout:20000});
  await page.locator('[data-action="close-modal"]').first().click();
  return number;
}

test('the phone: numbers from the player card, Highzap with photos, voice notes and videos, a video call and Pix',async({browser})=>{
  test.setTimeout(420000);
  const a=await enter(browser,'Ligadora'),b=await enter(browser,'Atendente');

  // Nobody is in the phone until their number is saved: Highzap's new conversation lists the agenda only.
  await openApp(a.page,'highzap');
  await a.page.locator('#phone [data-zap="new"]').click();
  await expect(a.page.locator(`#phone [data-zap="open"][data-id="${b.id}"]`)).toHaveCount(0);
  await expect(a.page.locator('#phone .ph-app-highzap .ph-empty')).toContainText('ficha');
  // Your own card shows your number; the other player's card saves theirs.
  await a.page.keyboard.press('Escape');
  await a.page.locator('[data-action="people"]').first().click();
  await a.page.locator('[data-action="people-tab"][data-tab="account"]').click();
  await a.page.locator(`[data-action="player-card"][data-id="${a.id}"]`).click();
  await expect(a.page.locator('.player-card h3')).toHaveText('Ligadora',{timeout:20000});
  const aNumber=(await a.page.locator('.card-number').textContent())!.replace(/\D/g,'');
  expect(aNumber).toMatch(/^9\d{8}$/);
  await a.page.locator('[data-action="close-modal"]').first().click();
  await saveFromCard(a.page,b.id);

  // Highzap: a text, then the stranger's side shows the number and can answer without saving it.
  await openApp(a.page,'highzap');
  await a.page.locator('#phone [data-zap="new"]').click();
  await a.page.locator(`#phone [data-zap="open"][data-id="${b.id}"]`).click();
  await a.page.locator('#phone .zap-compose input').fill('Chega na mesa 5!');
  await a.page.keyboard.press('Enter');
  await openApp(b.page,'highzap');
  const thread=b.page.locator(`#phone [data-zap="open"][data-id="${a.id}"]`);
  await expect(thread.locator('.ph-count')).toHaveText('1',{timeout:20000});
  await expect(thread).toContainText(`${aNumber.slice(0,5)}-${aNumber.slice(5)}`);
  await thread.click();
  await expect(b.page.locator('#phone .zap-unknown')).toBeVisible();
  await b.page.locator('#phone .zap-compose input').fill('Já vou!');
  await b.page.keyboard.press('Enter');
  await expect(a.page.locator('#phone .zap-bubble:not(.me)')).toContainText('Já vou!',{timeout:20000});
  await expect(a.page.locator('#phone .zap-bubble.me .zap-tick').first()).toHaveClass(/read/,{timeout:20000});

  // A photo from the camera, through the preview, lands as a picture in the other phone.
  await a.page.locator('#phone [data-zap="attach"]').click();
  await a.page.locator('#phone [data-zap="camera"]').click();
  await a.page.locator('#phone [data-cam="shoot"]').click();
  await a.page.locator('#phone [data-zap="send-staged"]').click();
  const photo=b.page.locator('#phone .zap-bubble .zap-photo img');
  await expect.poll(()=>photo.evaluate(img=>(img as HTMLImageElement).naturalWidth).catch(()=>0),{timeout:30000}).toBe(540);

  // A voice note: tap the microphone, talk, send; the other side plays it.
  await a.page.locator('#phone [data-zap="record"]').click();
  await expect(a.page.locator('#phone .zap-recording')).toBeVisible();
  await a.page.waitForTimeout(1600);
  await a.page.locator('#phone [data-zap="rec-send"]').click();
  const note=b.page.locator('#phone .zap-audio').last();
  await expect(note).toBeVisible({timeout:30000});
  await note.locator('[data-zap="play"]').click();
  await expect.poll(()=>note.locator('audio').evaluate(audio=>(audio as HTMLAudioElement).currentTime),{timeout:15000}).toBeGreaterThan(0);

  // A video recorded with the camera (zoomed in), sent from the conversation.
  await a.page.locator('#phone [data-zap="attach"]').click();
  await a.page.locator('#phone [data-zap="camera"]').click();
  await a.page.locator('#phone [data-cam="zoom"][data-zoom="2"]').click();
  await expect(a.page.locator('#phone [data-cam="zoom"][data-zoom="2"]')).toHaveAttribute('aria-pressed','true');
  await a.page.locator('#phone [data-cam="mode"][data-mode="video"]').click();
  await a.page.locator('#phone [data-cam="shoot"]').click();
  await expect(a.page.locator('#phone .cam-rec')).toBeVisible();
  await a.page.waitForTimeout(2200);
  await a.page.locator('#phone [data-cam="shoot"]').click();
  await a.page.locator('#phone [data-zap="send-staged"]').click({timeout:20000});
  const clip=b.page.locator('#phone .zap-video').last();
  await expect(clip).toBeVisible({timeout:40000});
  await expect.poll(()=>clip.locator('video').evaluate(video=>(video as HTMLVideoElement).readyState),{timeout:20000}).toBeGreaterThan(0);

  // A video call: each side gets the other's camera frames.
  await a.page.locator('#phone .zap-head [data-zap="video"]').click();
  await expect(b.page.locator('#phone .ph-call.incoming')).toBeVisible({timeout:20000});
  await expect(b.page.locator('#phone .ph-call [data-call-status]')).toHaveText('Chamada de vídeo');
  await b.page.locator('#phone [data-call="answer"]').click();
  await expect(b.page.locator('#phone .ph-call.video.remote')).toBeVisible({timeout:30000});
  await expect(a.page.locator('#phone .ph-call.video.remote')).toBeVisible({timeout:30000});
  // The far camera switched off shows as such.
  await b.page.locator('#phone [data-call="camera"]').click();
  await expect(a.page.locator('#phone .ph-call.video')).not.toHaveClass(/remote/,{timeout:10000});
  await a.page.locator('#phone [data-call="hangup"]').click();
  await expect(b.page.locator('#phone .ph-call.ended')).toBeVisible({timeout:10000});

  // Pix: the saved contact is listed; a number not saved is typed.
  const before=Number((await b.page.locator('#hud-balance').textContent())!.replace(/\D/g,''));
  await openApp(a.page,'highbank');
  await a.page.locator('#phone [data-bank="pix"]').click();
  await a.page.locator(`#phone [data-bank="to"][data-id="${b.id}"]`).click();
  await a.page.locator('#phone [name="amount"]').fill('25');
  await a.page.locator('#phone [data-bank-form="amount"] [type="submit"]').click();
  await a.page.locator('#phone [data-bank="send"]').click();
  await expect(a.page.locator('#phone .bank-done')).toBeVisible({timeout:20000});
  await expect.poll(async()=>Number((await b.page.locator('#hud-balance').textContent())!.replace(/\D/g,'')),{timeout:20000}).toBe(before+25);
  await openApp(b.page,'highbank');
  await b.page.locator('#phone [data-bank="pix"]').click();
  await expect(b.page.locator('#phone [data-bank="to"]')).toHaveCount(0);
  await b.page.locator('#phone [data-bank-form="number"] input').fill(aNumber);
  await b.page.locator('#phone [data-bank-form="number"] [type="submit"]').click();
  await expect(b.page.locator('#phone .bank-pix')).toContainText('Ligadora',{timeout:20000});
});

test('Highgram: a profile with name, handle, bio and photo, a filtered photo, search, follows and suggestions',async({browser})=>{
  test.setTimeout(300000);
  const a=await enter(browser,'Fotografa'),b=await enter(browser,'Seguidor');
  const handle=`foto.${a.username.slice(-6)}`;

  // A selfie for the profile photo, then name, handle and bio.
  await openApp(a.page,'highgram');
  await a.page.locator('#phone [data-gr="mine"]').click();
  await a.page.locator('#phone [data-gr="edit"]').first().click();
  await a.page.locator('#phone [data-gr="photo-pick"]').click();
  await a.page.locator('#phone [data-gr="selfie"]').click();
  await a.page.locator('#phone [data-cam="shoot"]').click();
  await expect(a.page.locator('#phone .gr-edit-photo img')).toBeVisible({timeout:20000});
  await a.page.locator('#phone [name="name"]').fill('Fotógrafa do Highland');
  await a.page.locator('#phone [name="handle"]').fill(handle);
  await a.page.locator('#phone [name="bio"]').fill('Mesa 5, sempre.');
  await a.page.locator('#phone [data-gr-form="profile"] [type="submit"]').click();
  await expect(a.page.locator('#phone .ph-app-highgram .ph-head h2')).toHaveText(handle,{timeout:20000});
  await expect(a.page.locator('#phone .gr-bio')).toContainText('Mesa 5, sempre.');
  await expect(a.page.locator('#phone .gr-profile .ph-avatar img')).toBeVisible();

  // A photo with the black-and-white filter: what is posted is grey.
  await a.page.locator('#phone [data-gr="compose"]').click();
  await a.page.locator('#phone [data-gr="pick"]').first().click();
  await a.page.locator('#phone [data-gr="filter"][data-id="moon"]').click();
  await a.page.locator('#phone [data-gr-form="post"] textarea').fill('Em preto e branco');
  await a.page.locator('#phone [data-gr-form="post"] [type="submit"]').click();
  await expect(a.page.locator('#phone .gr-post').first()).toContainText('Em preto e branco',{timeout:30000});

  // Search finds the handle; following shows the post at home and tells the other phone.
  await openApp(b.page,'highgram');
  await b.page.locator('#phone [data-gr="explore"]').first().click();
  await b.page.locator('#phone [data-gr-input="search"]').fill(handle);
  const row=b.page.locator(`#phone .gr-person:has([data-id="${a.id}"])`);
  await expect(row).toContainText('Fotógrafa do Highland',{timeout:20000});
  await row.locator('[data-gr="follow"]').click();
  await expect(row.locator('[data-gr="follow"]')).toHaveText('Seguindo');
  await expect(a.page.locator('#phone .ph-banner')).toContainText('começou a seguir você',{timeout:20000});
  await b.page.locator('#phone [data-gr="feed"]').click();
  const posted=b.page.locator('#phone .gr-post').first();
  await expect(posted).toContainText('Em preto e branco',{timeout:20000});
  await expect(posted.locator('.gr-author')).toContainText(handle);
  const grey=await posted.locator('.gr-photo img').evaluate(async img=>{
    const image=img as HTMLImageElement;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext('2d')!;context.drawImage(image,0,0);
    const data=context.getImageData(0,0,canvas.width,canvas.height).data;let spread=0;
    for(let i=0;i<data.length;i+=4*97)spread=Math.max(spread,Math.abs(data[i]!-data[i+1]!),Math.abs(data[i+1]!-data[i+2]!));
    return spread;
  });
  expect(grey).toBeLessThan(12);

  // The followed side sees the follower, and is told to follow back.
  await a.page.locator('#phone [data-gr="mine"]').click();
  await expect(a.page.locator('#phone .gr-profile [data-list="followers"] b')).toHaveText('1',{timeout:20000});
  await a.page.locator('#phone [data-gr="explore"]').first().click();
  await expect(a.page.locator(`#phone .gr-person:has([data-id="${b.id}"])`)).toContainText('Segue você',{timeout:20000});
  await expect(a.page.locator(`#phone .gr-person:has([data-id="${b.id}"]) [data-gr="follow"]`)).toHaveText('Seguir de volta');
});
