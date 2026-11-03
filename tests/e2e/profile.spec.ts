import {test,expect,type Browser,type Page} from '@playwright/test';
import {achievementOfBadge} from '../../packages/shared/src/achievements';
import {enterAsAdmin} from './moto-helpers';

const shots=process.env.PROFILE_SHOTS;
const shot=async(page:Page,name:string)=>{if(shots)await page.screenshot({path:`${shots}/${name}.png`});};
const clip=(page:Page,id:string)=>page.evaluate(id=>(window as any).barDebug.animations().find((a:any)=>a.id===id)?.clip,id);
const myId=(page:Page)=>page.evaluate(()=>(window as any).barDebug.snapshot().localId as string);
/** A point on a player's body: under their name over the head (world labels are placed by the scene). */
async function bodyOf(page:Page,name:string):Promise<{x:number;y:number}> {
  // Read in one go: the labels are written anew several times a second.
  const box=await page.evaluate(name=>{const label=[...document.querySelectorAll('.world-label')].find(each=>each.textContent===name);if(!label)return null;const {x,y,width,height}=label.getBoundingClientRect();return {x,y,width,height};},name);
  if(!box)throw new Error(`No label for ${name}`);
  return {x:box.x+box.width/2,y:box.y+box.height+40};
}
async function openFromWorld(page:Page,name:string):Promise<void> {
  // The label follows the camera; a right click only counts when it is quick and does not drag.
  await expect(async()=>{
    const at=await bodyOf(page,name);
    await page.mouse.click(at.x,at.y,{button:'right',delay:30});
    await expect(page.locator('.world-menu [data-world-menu="profile"]')).toBeVisible({timeout:1500});
  }).toPass({timeout:30000});
  await page.locator('.world-menu [data-world-menu="profile"]').click();
  await expect(page.locator('.pf-profile h2')).toHaveText(name,{timeout:20000});
}
async function enter(browser:Browser,name:string):Promise<Page> {
  const context=await browser.newContext({viewport:{width:1280,height:800}});const page=await context.newPage();
  const username=`${name}_${Date.now().toString(36)}`.slice(0,24).toLowerCase();
  await page.goto('/');
  await page.getByRole('button',{name:'Criar conta',exact:true}).click();
  await page.getByLabel('Seu nome',{exact:true}).fill(name);
  await page.getByLabel('Usuário',{exact:true}).fill(username);
  await page.getByLabel('E-mail',{exact:true}).fill(`${username}@example.com`);
  await page.getByLabel('Senha',{exact:true}).fill('ButecoTeste2026!');
  await page.getByRole('button',{name:'Criar minha conta'}).click();
  await expect(page.locator('#game')).toBeVisible({timeout:60000});await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  return page;
}

test('the profile: right click, Perfil, badges, status, the window dragged, and the skills on a key of your own',async({browser})=>{
  test.setTimeout(300000);
  const context=await browser.newContext({viewport:{width:1280,height:800},extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.9'}});
  // Badges granted here also arrive as notices (achievements.spec.ts covers them); hovered, one stays over what is being clicked.
  await context.addInitScript(()=>addEventListener('DOMContentLoaded',()=>document.head.append(Object.assign(document.createElement('style'),{textContent:'.comanda[data-variant="conquista"]{display:none}'}))));
  const page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await enterAsAdmin(page);
  const me=await myId(page);
  // Rafael, with the first badge.
  for(const [url,data] of [['/api/wardrobe/buy',{skin:'rafael'}],['/api/wardrobe/equip',{skin:'rafael'}],['/api/wardrobe/skill',{skill:'karate'}],['/api/wardrobe/skill',{skill:'air-kick'}]] as const)await page.request.post(url,{data});
  await page.request.post('/api/profile/skill',{data:{skill:'karate',key:'KeyX'}});
  // The test database survives runs: back to the first badge alone, granted to nobody here.
  await page.request.post('/api/admin/badges/grant',{data:{playerId:me,badgeId:'fundador',grant:false,reason:'Volta ao começo'}});
  for(const badge of (await (await page.request.get('/api/admin/badges')).json()).badges)if(badge.id!=='fundador'&&!achievementOfBadge(badge.id))await page.request.post('/api/admin/badges/delete',{data:{id:badge.id,reason:'Volta ao começo'}});
  for(const badge of (await (await page.request.get(`/api/profile/${me}`)).json()).owned)await page.request.post('/api/admin/badges/grant',{data:{playerId:me,badgeId:badge.id,grant:false,reason:'Volta ao começo'}});
  await page.request.post('/api/profile/status',{data:{status:''}});
  await page.reload();
  await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world?.players?.[d.localId]?.skin;}),{timeout:30000}).toBe('rafael');
  await expect(page.locator('#skill-button')).toBeVisible();
  await expect(page.locator('#skill-button .tip')).not.toContainText('Rafael');
  await expect(page.locator('#skill-button kbd')).toHaveText('X');

  // A left click on someone no longer opens anything.
  const other=await enter(browser,'Vizinho');
  await expect(page.locator('.world-label',{hasText:/^Vizinho$/})).toBeVisible({timeout:30000});
  const neighbour=await bodyOf(page,'Vizinho');
  await page.mouse.click(neighbour.x,neighbour.y);
  await page.waitForTimeout(600);
  await expect(page.locator('.pf-profile')).toHaveCount(0);
  await expect(page.locator('#modal')).toBeHidden();

  // A right click on yourself, then Perfil: the skin drawn standing still.
  await openFromWorld(page,'primary_admin');
  const portrait=page.locator('.pf-model img');
  await expect(portrait).toHaveAttribute('src',/^data:image\/png/,{timeout:30000});
  const drawn=await portrait.evaluate(async(image:HTMLImageElement)=>{
    await image.decode();const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const g=c.getContext('2d')!;g.drawImage(image,0,0);
    const {data}=g.getImageData(0,0,c.width,c.height);let solid=0,clear=0;for(let i=3;i<data.length;i+=4){if(data[i]===255)solid++;else if(data[i]===0)clear++;}
    return {solid:solid/(data.length/4),clear:clear/(data.length/4)};
  });
  expect(drawn.solid).toBeGreaterThan(.05);expect(drawn.clear).toBeGreaterThan(.3);
  await shot(page,'01-own-empty');

  // The window goes wherever it is dragged, and stays on the screen.
  const header=page.locator('.pf-profile .fw-head');
  const before=(await header.boundingBox())!;
  await page.mouse.move(before.x+150,before.y+20);await page.mouse.down();await page.mouse.move(before.x+150-180,before.y+20-90,{steps:4});await page.mouse.up();
  const moved=(await header.boundingBox())!;
  expect(Math.round(moved.x-before.x)).toBe(-180);expect(Math.round(moved.y-before.y)).toBe(-90);
  await page.mouse.move(moved.x+150,moved.y+20);await page.mouse.down();await page.mouse.move(-400,-400,{steps:3});await page.mouse.up();
  const corner=(await page.locator('.pf-profile').boundingBox())!;
  expect(corner.x).toBeGreaterThanOrEqual(0);expect(corner.y).toBeGreaterThanOrEqual(0);

  // Status: short, shown under the model's frame.
  await page.locator('[data-pf="status-edit"]').click();
  await page.locator('[name="status"]').fill('Sextou no Highland, a gelada é por minha conta');
  await page.keyboard.press('Enter');
  await expect(page.locator('.pf-status p')).toHaveText('Sextou no Highland, a gelada é por minha conta');
  const frame=(await page.locator('.pf-stage').boundingBox())!,status=(await page.locator('.pf-status').boundingBox())!;
  expect(status.y).toBeGreaterThanOrEqual(frame.y+frame.height);
  expect(await page.locator('[name="status"]').count()).toBe(0);

  // Badges: granted in the administration, chosen in the player's own window, described under the mouse.
  await page.getByRole('button',{name:'Administração'}).click();
  await page.locator('[data-admin-nav="badges"]').click();
  await expect(page.locator('#admin-section')).toContainText('Fundador');
  await page.locator('[data-badge-form="save"] [name="name"]').fill('Rei do Pebolim');
  await page.locator('[data-badge-form="save"] [name="description"]').fill('Ganhou dez partidas seguidas no salão de jogos.');
  await page.locator('[data-badge-icon="ball"]').click();
  await page.locator('[data-badge-color="#17d4f4"]').click();
  // The rarest: what was typed survives choosing it, and the card shows how it will look before saving.
  await page.locator('[data-badge-rarity="legendary"]').click();
  await expect(page.locator('[data-badge-rarity="legendary"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-badge-form="save"] [name="name"]')).toHaveValue('Rei do Pebolim');
  await page.locator('[data-badge="card-draft"]').click();
  await expect(page.locator('.bc-card h2')).toHaveText('Rei do Pebolim');
  await expect(page.locator('.bc-studs')).toHaveCount(1);
  await shot(page,'02-admin-card');
  await page.keyboard.press('Escape');
  await expect(page.locator('.bc-backdrop')).toHaveCount(0);
  await expect(page.locator('#admin-section'),'Esc closes the card, not the administration').toBeVisible();
  await page.locator('[data-badge-form="save"] [name="reason"]').fill('Emblema de teste');
  await page.locator('[data-badge-form="save"] button[type="submit"]').click();
  await expect(page.locator('#admin-section')).toContainText('Rei do Pebolim');
  await expect(page.locator('tr',{hasText:'Rei do Pebolim'}).locator('.admin-badge')).toHaveText('Lendário');
  await expect(page.locator('tr',{hasText:'Fundador'}).locator('.admin-badge')).toHaveText('Comum');
  await shot(page,'02-admin');
  await page.locator('[data-badge="select"][data-id="fundador"]').click();
  await page.locator('[data-badge-form="grant"] [name="search"]').pressSequentially('primary_admin');
  await page.locator('[data-badge-target]').first().click();
  await page.locator('[data-badge-form="grant"] [name="reason"]').fill('Dono do bar');
  await page.locator('[data-badge-form="grant"] button[type="submit"]').click();
  await expect(page.locator('#admin-section table').nth(1)).toContainText('primary_admin');
  await page.request.post('/api/admin/badges/grant',{data:{playerId:me,badgeId:'rei-do-pebolim',grant:true,reason:'Teste'}});
  await page.getByRole('button',{name:'Fechar janela'}).click();
  await page.locator('[data-pf="badges"]').waitFor({state:'attached'}).catch(()=>{});
  if(!await page.locator('.pf-profile').count())await openFromWorld(page,'primary_admin');
  await page.request.get(`/api/profile/${me}`);
  // Reopened, the window asks the server again.
  await page.locator('.pf-profile .fw-close').click();
  await openFromWorld(page,'primary_admin');
  await page.locator('[data-pf="badges"]').click();
  const picker=page.locator('.pf-picker');
  await expect(picker.locator('.pf-tile')).toHaveCount(2);
  // The corner button shows the card and leaves the choice alone.
  await picker.locator('[data-view="rei-do-pebolim"]').click();
  await expect(page.locator('.bc-card h2')).toHaveText('Rei do Pebolim');
  await page.keyboard.press('Escape');
  await expect(page.locator('.bc-backdrop')).toHaveCount(0);
  await expect(picker,'Esc closes the card, not the window behind it').toBeVisible();
  await expect(picker.locator('.pf-tile.on')).toHaveCount(0);
  await picker.locator('[data-pick="fundador"]').click();await picker.locator('[data-pick="rei-do-pebolim"]').click();
  await expect(picker.locator('.pf-picker-foot small')).toHaveText('2/6 em exibição');
  await shot(page,'03-picker');
  await picker.locator('[data-pick-save]').click();
  await expect(picker).toHaveCount(0);
  const slots=page.locator('.pf-grid .pf-slot.filled');
  await expect(slots).toHaveCount(2);
  await slots.first().hover();
  await expect(page.locator('.pf-tip')).toBeVisible();await expect(page.locator('.pf-tip b')).toHaveText('Fundador');
  await expect(page.locator('.pf-tip small')).toHaveText('Comum');
  await shot(page,'04-own-badges');
  // A click blows the badge up into its card; only the rarest is studded.
  await slots.first().click();
  await expect(page.locator('.bc-card h2')).toHaveText('Fundador');
  await expect(page.locator('.pf-tip')).toBeHidden();
  await expect(page.locator('.bc-studs')).toHaveCount(0);
  await page.locator('.bc-close').click();
  await expect(page.locator('.bc-backdrop')).toHaveCount(0);
  await slots.nth(1).click();
  await expect(page.locator('.bc-card')).toHaveAttribute('data-rarity','legendary');
  await expect(page.locator('.bc-studs')).toHaveCount(1);
  await page.waitForTimeout(600);
  await shot(page,'04-card-legendary');
  await page.keyboard.press('Escape');
  await expect(page.locator('.bc-backdrop')).toHaveCount(0);
  await expect(page.locator('.pf-profile'),'the window behind it stays').toBeVisible();
  await page.mouse.move(5,5);

  // Skills: both kicks, one active, on the key the player wants; the game's own keys are refused.
  await page.locator('[data-pf="tab"][data-tab="skill"]').click();
  await expect(page.locator('.pf-skill')).toHaveCount(2);
  await page.locator('[data-skill="air-kick"]').click();
  await expect(page.locator('[data-skill="air-kick"]')).toHaveAttribute('aria-checked','true');
  await expect(page.locator('#skill-button .tip')).toContainText('Chute voador');
  await page.locator('[data-pf="key"]').click();
  await page.keyboard.press('w');
  await expect(page.locator('.pf-hint')).toContainText('W já é usada');
  await page.locator('[data-pf="key"]').click();
  await page.keyboard.press('r');
  await expect(page.locator('.pf-key kbd')).toHaveText('R');
  await expect(page.locator('#skill-button kbd')).toHaveText('R');
  await shot(page,'05-skills');
  await page.keyboard.press('x');
  await page.waitForTimeout(400);
  expect(await clip(page,me)).not.toBe('AirKick');
  await page.keyboard.press('r');
  await expect.poll(()=>clip(page,me),{timeout:5000}).toBe('AirKick');
  await page.waitForTimeout(1050);
  await shot(page,'06-air-kick');
  await expect.poll(()=>clip(page,me),{timeout:15000}).not.toBe('AirKick');
  // Back to the first one, on the same key.
  await page.locator('[data-skill="karate"]').click();
  await expect(page.locator('[data-skill="karate"]')).toHaveAttribute('aria-checked','true');
  await page.keyboard.press('r');
  await expect.poll(()=>clip(page,me),{timeout:5000}).toBe('Kick');
  await expect.poll(()=>clip(page,me),{timeout:15000}).not.toBe('Kick');

  // Another player sees the badges and the status, nothing to edit, and the way to the number.
  await expect(other.locator('.world-label',{hasText:/^primary_admin$/})).toBeVisible({timeout:30000});
  await openFromWorld(other,'primary_admin');
  await expect(other.locator('.pf-grid .pf-slot.filled')).toHaveCount(2);
  await expect(other.locator('.pf-status p')).toContainText('Sextou');
  await other.locator('.pf-grid .pf-slot.filled').nth(1).click();
  await expect(other.locator('.bc-card')).toHaveAttribute('data-rarity','legendary');
  await other.keyboard.press('Escape');
  await expect(other.locator('.bc-backdrop')).toHaveCount(0);
  await expect(other.locator('[data-pf="status-edit"],[data-pf="badges"],[data-pf="tab"]')).toHaveCount(0);
  await expect(other.locator('.pf-model img')).toHaveAttribute('src',/^data:image\/png/,{timeout:30000});
  await shot(other,'07-visitor');
  await other.locator('[data-pf="save"]').click();
  await expect(other.locator('[data-pf="message"]')).toBeVisible({timeout:20000});
  // Highgram, directly.
  await other.locator('[data-pf="gram"]').click();
  await expect(other.locator('#phone.open .ph-app-highgram')).toBeVisible({timeout:20000});
  await other.keyboard.press('Escape');
  await expect(other.locator('.pf-profile')).toHaveCount(0);

  // On a phone's width it still fits, and walking works with it open.
  await page.locator('[data-pf="tab"][data-tab="profile"]').click();
  await page.setViewportSize({width:390,height:700});
  await page.waitForTimeout(300);
  const small=(await page.locator('.pf-profile').boundingBox())!;
  expect(small.x).toBeGreaterThanOrEqual(0);expect(small.x+small.width).toBeLessThanOrEqual(390);expect(small.y+small.height).toBeLessThanOrEqual(700);
  await shot(page,'08-narrow');
  await page.setViewportSize({width:1280,height:800});
  const at=await page.evaluate(()=>{const d=(window as any).barDebug.snapshot();const p=d.world.players[d.localId];return {x:p.x,z:p.z};});
  await page.keyboard.down('w');await page.waitForTimeout(700);await page.keyboard.up('w');
  await expect.poll(()=>page.evaluate(at=>{const d=(window as any).barDebug.snapshot();const p=d.world.players[d.localId];return Math.hypot(p.x-at.x,p.z-at.z);},at)).toBeGreaterThan(.1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.pf-profile')).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.request.post('/api/auth/logout');await other.request.post('/api/auth/logout');
  await context.close();await other.context().close();
});

test('a badge with a PNG of your own: sent to the server, in the medal and in the profile, and still there after a reload',async({browser})=>{
  test.setTimeout(240000);
  const context=await browser.newContext({viewport:{width:1280,height:800},extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.10'}});
  const page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await enterAsAdmin(page);
  const me=await myId(page);
  // The test database survives runs.
  await page.request.post('/api/admin/badges/delete',{data:{id:'emblema-com-png',reason:'Volta ao começo'}});
  for(const id of (await (await page.request.get('/api/admin/badges')).json()).images)await page.request.post('/api/admin/badges/images/delete',{data:{id,reason:'Volta ao começo'}});
  await page.request.post('/api/profile/badges',{data:{badges:[]}});
  // Transparent corners, and bigger than what the server keeps.
  const art=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=800;const g=canvas.getContext('2d')!;
    g.fillStyle='#ff2d55';g.beginPath();g.arc(400,400,380,0,7);g.fill();g.fillStyle='#fff';g.fillRect(360,120,80,560);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  const file=(name:string,mimeType:string)=>({name,mimeType,buffer:Buffer.from(art,'base64')});
  await page.getByRole('button',{name:'Administração'}).click();
  await page.locator('[data-admin-nav="badges"]').click();
  await expect(page.locator('#admin-section')).toContainText('Fundador');
  const form=page.locator('[data-badge-form="save"]');
  await form.locator('[name="name"]').fill('Emblema com PNG');
  await page.locator('[data-badge-file]').setInputFiles(file('foto.jpg','image/jpeg'));
  await expect(page.getByText('Envie um arquivo PNG.')).toBeVisible();
  await expect(page.locator('.admin-badge-preview img')).toHaveCount(0);

  await page.locator('[data-badge-file]').setInputFiles(file('emblema.png','image/png'));
  const preview=page.locator('.admin-badge-preview .pf-art img');
  await expect.poll(()=>preview.evaluate((image:HTMLImageElement)=>image.naturalWidth),{timeout:20000}).toBe(256);
  await expect(form.locator('[name="name"]'),'what was typed survives the upload').toHaveValue('Emblema com PNG');
  await expect(page.locator('[data-badge-image]')).toHaveCount(1);
  await expect(page.locator('[data-badge-image]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-badge="image-delete"]')).toBeVisible();
  await expect(page.locator('[data-badge-color]'),'a colour only serves the hexagon').toHaveCount(0);
  // The transparency arrives: a corner of the image is clear, its middle is not.
  const alpha=await preview.evaluate((image:HTMLImageElement)=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const g=canvas.getContext('2d')!;g.drawImage(image,0,0);
    return [g.getImageData(2,2,1,1).data[3],g.getImageData(128,128,1,1).data[3]];
  });
  expect(alpha).toEqual([0,255]);

  await form.locator('[name="description"]').fill('Tem um PNG enviado no lugar do ícone.');
  await form.locator('[name="reason"]').fill('Emblema de teste');
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('.admin-badge-cell .pf-art img')).toHaveCount(1);
  await shot(page,'10-admin-image');
  // Picking an icon takes the image out of the draft; the image stays on the list.
  await page.locator('[data-badge="edit"][data-id="emblema-com-png"]').click();
  await expect(page.locator('[data-badge="image-delete"]'),'it is in use').toHaveCount(0);
  await page.locator('[data-badge-icon="heart"]').click();
  await expect(page.locator('.admin-badge-preview img')).toHaveCount(0);
  await page.locator('[data-badge="cancel"]').click();

  await page.request.post('/api/admin/badges/grant',{data:{playerId:me,badgeId:'emblema-com-png',grant:true,reason:'Teste'}});
  await page.request.post('/api/profile/badges',{data:{badges:['emblema-com-png']}});
  // A new page: nothing here comes from what this session sent.
  await page.reload();
  await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await page.getByRole('button',{name:'Administração'}).click();
  await page.locator('[data-admin-nav="badges"]').click();
  await expect(page.locator('[data-badge-image]')).toHaveCount(1);
  await expect.poll(()=>page.locator('.admin-badge-cell .pf-art img').evaluate((image:HTMLImageElement)=>image.naturalWidth),{timeout:20000}).toBe(256);
  await page.getByRole('button',{name:'Fechar janela'}).click();
  await openFromWorld(page,'primary_admin');
  const medal=page.locator('.pf-grid .pf-slot.filled .pf-art img');
  await expect.poll(()=>medal.evaluate((image:HTMLImageElement)=>image.naturalWidth),{timeout:20000}).toBe(256);
  // No hexagon around it: the image takes the whole slot.
  await expect(page.locator('.pf-grid .pf-slot.filled .pf-medal')).toHaveCount(0);
  const [drawn,slot]=await Promise.all([medal.boundingBox(),page.locator('.pf-grid .pf-slot.filled').boundingBox()]);
  expect(drawn!.width).toBeGreaterThan(slot!.width*.9);
  await shot(page,'11-profile-image');
  // The card shows the same image, big; closed by mouse, it leaves no tip behind.
  await page.locator('.pf-grid .pf-slot.filled').click();
  await expect.poll(()=>page.locator('.bc-art .pf-art img').evaluate((image:HTMLImageElement)=>image.naturalWidth),{timeout:20000}).toBe(256);
  await page.waitForTimeout(600);
  await shot(page,'12-card-image');
  await page.mouse.click(1200,400);
  await expect(page.locator('.bc-backdrop')).toHaveCount(0);
  await page.mouse.move(1200,500);
  await expect(page.locator('.pf-tip')).toBeHidden();
  expect(errors).toEqual([]);
  await context.close();
});
