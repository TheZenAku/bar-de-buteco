import {fileURLToPath} from 'node:url';
import {expect,test,type Page} from '@playwright/test';
import type {VehicleView} from '@bar/shared';
import {MOTO_PARTS,NEW_MOTO_PARTS} from '../../packages/shared/src/moto-parts';

const MOTO_MODEL='moto-delivery',MOTO_NAME='Highland Bar Delivery';

const fixture='/@fs/'+fileURLToPath(new URL('../fixtures/highmotors.html',import.meta.url)).replaceAll('\\','/');
const stock=():VehicleView=>({model:MOTO_MODEL,name:MOTO_NAME,price:10_000,tow:30,owned:true,limit:10,vehicles:Array.from({length:10},(_,i)=>({id:`vehicle-${i}`,model:MOTO_MODEL,name:MOTO_NAME,plate:`BAR${i}A01`,parts:i===1?'20,'+NEW_MOTO_PARTS.split(',').slice(1).join(','):NEW_MOTO_PARTS,mileage:i*1500,boughtAt:0}))});
const events=(page:Page)=>page.evaluate(()=>(window as any).fixture.events);
async function open(page:Page,data=stock()):Promise<void>{
  await page.route('**/api/vehicles',route=>route.fulfill({json:data}));
  await page.goto(fixture);await expect(page.locator('.hm-page-title')).toBeVisible();
}
const detail=(page:Page,id:string)=>page.locator(`[data-hm="detail"][data-vehicle="${id}"]`);

test('ownership and sale stay separate, including an empty garage and keyboard tab navigation',async({page})=>{
  await open(page,{...stock(),owned:false,vehicles:[]});
  await expect(page.getByRole('tab',{name:'Meus veículos'})).toHaveAttribute('aria-selected','true');
  await expect(page.getByText('Sua garagem começa aqui')).toBeVisible();
  await expect(page.locator('.hm-sale')).toHaveCount(0);
  await page.getByRole('button',{name:'Explorar a loja'}).click();
  await expect(page.locator('.hm-sale')).toBeVisible();
  await expect(page.locator('.hm-sale')).toContainText('À venda');
  await page.getByRole('tab',{name:'Loja'}).focus();await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab',{name:'Meus veículos'})).toBeFocused();
  await expect(page.locator('.hm-sale')).toHaveCount(0);
});

test('ten vehicles can be searched and filtered without losing focus, and details preserve the list position',async({page})=>{
  const data=stock();data.vehicles[2]!.name='Moto Ágil';
  await open(page,data);await expect(page.locator('.hm-owned')).toHaveCount(10);
  await expect(page.locator('.hm-sale')).toHaveCount(0);
  const search=page.getByRole('searchbox');
  await search.fill('agil');await expect(search).toBeFocused();await expect(page.locator('.hm-owned')).toHaveCount(1);
  await search.fill('bar-1a01');await expect(page.locator('.hm-owned')).toHaveAttribute('data-plate','BAR1A01');
  await page.getByRole('button',{name:'Na garagem',exact:true}).click();await expect(page.locator('.hm-owned')).toHaveCount(1);
  await search.fill('');await page.getByRole('button',{name:'Atenção',exact:true}).click();await expect(page.locator('.hm-owned')).toHaveCount(1);
  await detail(page,'vehicle-1').click();await expect(page.locator('.hm-detail')).toContainText('20%');await expect(page.locator('.hm-parts li')).toHaveCount(MOTO_PARTS.length);
  await page.locator('[data-ph="back"]').click();await expect(page.getByRole('button',{name:'Atenção',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Todos',exact:true}).click();
  await detail(page,'vehicle-9').scrollIntoViewIfNeeded();
  const before=await page.locator('.hm-body').evaluate(el=>el.scrollTop);expect(before).toBeGreaterThan(0);
  await detail(page,'vehicle-9').click();await expect(page.locator('.hm-detail-title')).toContainText('BAR9A01');
  await page.locator('[data-ph="back"]').click();expect(await page.locator('.hm-body').evaluate(el=>el.scrollTop)).toBe(before);
  await search.fill('inexistente');await expect(page.getByText('Nenhum veículo encontrado')).toBeVisible();
  await page.getByRole('button',{name:'Limpar busca e filtros'}).click();await expect(search).toHaveValue('');await expect(page.locator('.hm-owned')).toHaveCount(10);
});

test('each vehicle gets its own location and tow action, with live parts and the other-vehicle restriction',async({page})=>{
  await open(page);
  await page.evaluate(()=>{const f=(window as any).fixture;f.open({motos:{street:{ownerId:'me',vehicleId:'vehicle-0',x:4,y:1,z:8,riderId:'me',parts:'0,'+Array(10).fill(100).join(',')}}});});
  await expect(page.locator('.hm-owned')).toHaveCount(10);
  await page.getByRole('button',{name:'Na rua',exact:true}).click();await expect(page.locator('.hm-owned')).toHaveCount(1);await expect(page.locator('.hm-owned')).toContainText('Em uso');
  await detail(page,'vehicle-0').click();await expect(page.locator('.hm-parts li').first()).toContainText('0%');
  await page.getByRole('button',{name:'Marcar no mapa'}).click();
  expect(await events(page)).toContainEqual({type:'waypoint',data:{x:4,y:1,z:8,source:'bike',label:MOTO_NAME}});
  await page.locator('[data-ph="back"]').click();await page.getByRole('button',{name:'Todos',exact:true}).click();await detail(page,'vehicle-1').click();
  await expect(page.locator('[data-hm="tow"]')).toBeDisabled();await expect(page.locator('.hm-detail')).toContainText('Guarde o outro veículo');
  await page.locator('[data-ph="back"]').click();await detail(page,'vehicle-0').click();await page.locator('[data-hm="tow"]').click();
  expect(await events(page)).toContainEqual({type:'moto.tow',data:{vehicleId:'vehicle-0'}});
  await expect(page.locator('[data-hm="tow"]')).toBeDisabled();
});

test('a purchase confirms the balance, updates ownership and lands in the garage',async({page})=>{
  const data={...stock(),owned:false,vehicles:[]};await open(page,data);
  let purchases=0;
  await page.route('**/api/vehicles/buy',async route=>{purchases++;await route.fulfill({json:{...stock(),vehicles:stock().vehicles.slice(0,1),balance:15000}});});
  await page.getByRole('tab',{name:'Loja'}).click();await page.getByRole('button',{name:'Ver detalhes'}).click();await page.locator('[data-hm="buy"]').click();
  await expect(page.locator('.hm-confirm')).toContainText('Saldo depois');await expect(page.locator('.hm-confirm')).toContainText('15.000');
  await page.locator('[data-ph="back"]').click();await expect(page.locator('.hm-detail-title')).toContainText(MOTO_NAME);expect(purchases).toBe(0);
  await page.locator('[data-hm="buy"]').click();await page.locator('[data-hm="confirm"]').click();await expect(page.getByText('O veículo é seu!')).toBeVisible();expect(purchases).toBe(1);
  await page.getByRole('button',{name:'Ver meus veículos'}).click();await expect(page.locator('.hm-owned')).toHaveCount(1);await expect(page.locator('.hm-sale')).toHaveCount(0);
  await expect(page.locator('.hm-wallet')).toContainText('15.000');expect(await events(page)).toContainEqual({type:'owned',value:true});
  await page.getByRole('tab',{name:'Loja'}).click();await expect(page.locator('.hm-already')).toContainText('Você já tem 1 deste modelo');
});

test('insufficient coins, the ownership limit and request failures keep actions recoverable',async({page})=>{
  await open(page);
  await page.getByRole('tab',{name:'Loja'}).click();await page.getByRole('button',{name:'Ver detalhes'}).click();await expect(page.locator('[data-hm="buy"]')).toBeDisabled();await expect(page.locator('[data-hm="buy"]')).toContainText('Limite de 10');
  await page.unroute('**/api/vehicles');
  await page.route('**/api/vehicles',route=>route.fulfill({json:{...stock(),vehicles:stock().vehicles.slice(0,1)}}));
  await page.evaluate(()=>(window as any).fixture.open({balance:20,motos:{}}));await expect(page.locator('.hm-owned')).toHaveCount(1);
  await detail(page,'vehicle-0').click();await expect(page.locator('[data-hm="tow"]')).toBeDisabled();
  await page.locator('[data-ph="back"]').click();await page.getByRole('tab',{name:'Loja'}).click();await page.getByRole('button',{name:'Ver detalhes'}).click();await expect(page.locator('[data-hm="buy"]')).toContainText('Faltam 9.980');
  await page.unroute('**/api/vehicles');let failed=true;
  await page.route('**/api/vehicles',route=>failed?route.fulfill({status:503,json:{error:'Conexão indisponível.'}}):route.fulfill({json:{...stock(),vehicles:[]}}));
  await page.evaluate(()=>(window as any).fixture.open());await expect(page.getByText('Conexão indisponível.')).toBeVisible();failed=false;
  await page.getByRole('button',{name:'Tentar novamente'}).click();await expect(page.getByText('Sua garagem começa aqui')).toBeVisible();
  await page.evaluate(()=>(window as any).fixture.open({balance:25000}));await expect(page.getByText('Sua garagem começa aqui')).toBeVisible();
  await page.route('**/api/vehicles/buy',route=>route.fulfill({status:409,json:{error:'Tente novamente.'}}));
  await page.getByRole('tab',{name:'Loja'}).click();await page.getByRole('button',{name:'Ver detalhes'}).click();await page.locator('[data-hm="buy"]').click();await page.locator('[data-hm="confirm"]').click();
  await expect(page.locator('[data-hm="buy"]')).toBeEnabled();expect(await events(page)).toContainEqual({type:'error',text:'Tente novamente.'});
});

test('dark and light layouts fit the phone on desktop and a small viewport',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const data=stock();data.vehicles[0]!.model='future-model';data.vehicles[0]!.name='Veículo com nome bem comprido para conferir o catálogo';
  await open(page,data);
  for(const viewport of [{width:1280,height:960},{width:375,height:667}]){
    await page.setViewportSize(viewport);
    for(const dark of [true,false]){
      await page.evaluate(value=>(window as any).fixture.theme(value),dark);
      const panel=page.locator('.hm-body');expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
      await expect(detail(page,'vehicle-0')).toBeVisible();
      await expect(page.locator('.hm-owned').first().locator('img')).toHaveCount(0);
      await page.screenshot({path:`test-results/highmotors/garage-${viewport.width}-${dark?'dark':'light'}.png`});
      await page.getByRole('tab',{name:'Loja'}).click();await expect(page.locator('.hm-sale')).toBeVisible();
      expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
      await page.screenshot({path:`test-results/highmotors/shop-${viewport.width}-${dark?'dark':'light'}.png`});
      await page.getByRole('tab',{name:'Meus veículos'}).click();
    }
  }
  expect(errors).toEqual([]);
});

test('the real in-game phone buys a vehicle and keeps it separate from the shop after reopening',async({page})=>{
  test.setTimeout(150_000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await expect.poll(async()=>(await page.request.get('/api/ready')).ok(),{timeout:90_000}).toBe(true);
  const username=`motors_${Date.now().toString(36)}`;
  const registered=await page.request.post('/api/auth/register',{data:{username,displayName:'Piloto HighMotors',email:`${username}@example.com`,password:'ButecoTeste2026!'}});
  expect(registered.status(),await registered.text()).toBe(201);
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#game')).toBeVisible();await expect(page.locator('#waiting')).toBeHidden({timeout:60_000});
  await page.keyboard.press('k');await page.locator('.ph-home [data-app="highmotors"]').click();
  await expect(page.getByText('Sua garagem começa aqui')).toBeVisible();
  await page.getByRole('button',{name:'Explorar a loja'}).click();await page.getByRole('button',{name:'Ver detalhes'}).click();
  await page.locator('[data-hm="buy"]').click();await page.locator('[data-hm="confirm"]').click();
  await expect(page.getByText('O veículo é seu!')).toBeVisible();await page.getByRole('button',{name:'Ver meus veículos'}).click();
  const owned:VehicleView=await page.request.get('/api/vehicles').then(response=>response.json());
  expect(owned.vehicles).toHaveLength(1);await expect(page.locator('.hm-owned')).toHaveAttribute('data-plate',owned.vehicles[0]!.plate);
  await expect(page.locator('.hm-owned')).toContainText('Na garagem');await expect(page.locator('.hm-sale')).toHaveCount(0);
  await page.screenshot({path:'test-results/highmotors/in-game-garage.png'});
  await page.locator('[data-phone-home]').click();await page.locator('.ph-home [data-app="highmotors"]').click();
  await expect(page.locator('.hm-owned')).toHaveAttribute('data-plate',owned.vehicles[0]!.plate);
  await page.getByRole('tab',{name:'Loja'}).click();await expect(page.locator('.hm-already')).toContainText('Você já tem 1 deste modelo');
  await page.screenshot({path:'test-results/highmotors/in-game-shop.png'});
  expect(errors).toEqual([]);
});
