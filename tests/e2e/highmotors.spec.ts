import {fileURLToPath} from 'node:url';
import {expect,test,type Page} from '@playwright/test';
import type {VehicleView} from '@bar/shared';
import {MOTO_PARTS,NEW_MOTO_PARTS} from '../../packages/shared/src/moto-parts';
import {VEHICLE_CATALOG,vehiclePriceKey} from '../../packages/shared/src/vehicle-models';
const catalogPrices:Record<string,number>={'vehicle:moto':10000,'vehicle:moto-fogo':25000,'vehicle:moto-classica':15000,'vehicle:moto-scooter':8000,'vehicle:carro':35000,'vehicle:caminhao':60000};

const MOTO_MODEL='moto-delivery',MOTO_NAME='Highland Bar Delivery';

const fixture='/@fs/'+fileURLToPath(new URL('../fixtures/highmotors.html',import.meta.url)).replaceAll('\\','/');
const stock=():VehicleView=>({model:MOTO_MODEL,name:MOTO_NAME,price:10_000,tow:30,owned:true,limit:10,vehicles:Array.from({length:10},(_,i)=>({id:`vehicle-${i}`,model:MOTO_MODEL,name:MOTO_NAME,plate:`BAR${i}A01`,parts:i===1?'20,'+NEW_MOTO_PARTS.split(',').slice(1).join(','):NEW_MOTO_PARTS,mileage:i*1500,boughtAt:0}))});
const events=(page:Page)=>page.evaluate(()=>(window as any).fixture.events);
async function open(page:Page,data=stock()):Promise<void>{
  await page.route('**/api/vehicles',route=>route.fulfill({json:data}));
  await page.route('**/api/prices',route=>route.fulfill({json:{prices:catalogPrices}}));
  await page.goto(fixture);await expect(page.locator('.hm-page-title')).toBeVisible();
}
const detail=(page:Page,id:string)=>page.locator(`[data-hm="detail"][data-vehicle="${id}"]`);
const deliveryOffer=(page:Page)=>page.locator(`[data-hm="offer"][data-model="${MOTO_MODEL}"]`);

test('the shop restores all registered vehicles from missing or incomplete offers, with current prices and the correct purchase model',async({page})=>{
  const prices:Record<string,number>={...catalogPrices,'vehicle:caminhao':65432};
  let data:VehicleView={...stock(),owned:false,vehicles:[]};
  await page.route('**/api/vehicles',route=>route.fulfill({json:data}));
  await page.route('**/api/prices',route=>route.fulfill({json:{prices}}));
  await page.goto(fixture);await expect(page.locator('.hm-page-title')).toBeVisible();
  for(const incomplete of [undefined,[],[{model:MOTO_MODEL,name:MOTO_NAME,price:10000,seats:1,photo:'moto/foto-v4.webp'}]]){
    data={...data,models:incomplete};
    await page.evaluate(()=>(window as any).fixture.open({balance:500000}));
    await page.getByRole('tab',{name:'Loja'}).click();
    await expect(page.locator('.hm-sale')).toHaveCount(VEHICLE_CATALOG.length);
    for(const vehicle of VEHICLE_CATALOG){
      const card=page.locator(`.hm-sale[data-model="${vehicle.model}"]`);
      await expect(card.locator('h3')).toHaveText(vehicle.name);
      await expect(card.locator('.hm-price')).toContainText(prices[vehiclePriceKey(vehicle.model)]!.toLocaleString('pt-BR'));
      await card.locator('[data-hm="offer"]').click();
      await expect(page.locator('.hm-detail-title h2')).toHaveText(vehicle.name);
      await expect(page.locator('[data-hm="buy"]')).toBeEnabled();
      await page.locator('[data-ph="back"]').click();
    }
  }
  let purchased='';
  await page.route('**/api/vehicles/buy',route=>{purchased=route.request().postDataJSON().model;return route.fulfill({json:{...data,balance:434568}});});
  await page.locator('[data-hm="offer"][data-model="caminhao-bau"]').click();
  await page.locator('[data-hm="buy"]').click();await page.locator('[data-hm="confirm"]').click();
  await expect(page.getByText('O veículo é seu!')).toBeVisible();expect(purchased).toBe('caminhao-bau');
  await page.getByRole('button',{name:'Ver meus veículos'}).click();await page.getByRole('tab',{name:'Loja'}).click();
  await expect(page.locator('.hm-sale')).toHaveCount(VEHICLE_CATALOG.length);
});

test('ownership and sale stay separate, including an empty garage and keyboard tab navigation',async({page})=>{
  await open(page,{...stock(),owned:false,vehicles:[]});
  await expect(page.getByRole('tab',{name:'Meus veículos'})).toHaveAttribute('aria-selected','true');
  await expect(page.getByText('Sua garagem começa aqui')).toBeVisible();
  await expect(page.locator('.hm-sale')).toHaveCount(0);
  await page.getByRole('button',{name:'Explorar a loja'}).click();
  await expect(page.locator('.hm-sale')).toHaveCount(VEHICLE_CATALOG.length);
  await expect(page.locator('.hm-sale').first()).toContainText('À venda');
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
  await page.getByRole('tab',{name:'Loja'}).click();await deliveryOffer(page).click();await page.locator('[data-hm="buy"]').click();
  await expect(page.locator('.hm-confirm')).toContainText('Saldo depois');await expect(page.locator('.hm-confirm')).toContainText('15.000');
  await page.locator('[data-ph="back"]').click();await expect(page.locator('.hm-detail-title')).toContainText(MOTO_NAME);expect(purchases).toBe(0);
  await page.locator('[data-hm="buy"]').click();await page.locator('[data-hm="confirm"]').click();await expect(page.getByText('O veículo é seu!')).toBeVisible();expect(purchases).toBe(1);
  await page.getByRole('button',{name:'Ver meus veículos'}).click();await expect(page.locator('.hm-owned')).toHaveCount(1);await expect(page.locator('.hm-sale')).toHaveCount(0);
  await expect(page.locator('.hm-wallet')).toContainText('15.000');expect(await events(page)).toContainEqual({type:'owned',value:true});
  await page.getByRole('tab',{name:'Loja'}).click();await expect(page.locator('.hm-already')).toContainText('Você já tem 1 deste modelo');
});

test('insufficient coins, the ownership limit and request failures keep actions recoverable',async({page})=>{
  await open(page);
  await page.getByRole('tab',{name:'Loja'}).click();await deliveryOffer(page).click();await expect(page.locator('[data-hm="buy"]')).toBeDisabled();await expect(page.locator('[data-hm="buy"]')).toContainText('Limite de 10');
  await page.unroute('**/api/vehicles');
  await page.route('**/api/vehicles',route=>route.fulfill({json:{...stock(),vehicles:stock().vehicles.slice(0,1)}}));
  await page.evaluate(()=>(window as any).fixture.open({balance:20,motos:{}}));await expect(page.locator('.hm-owned')).toHaveCount(1);
  await detail(page,'vehicle-0').click();await expect(page.locator('[data-hm="tow"]')).toBeDisabled();
  await page.locator('[data-ph="back"]').click();await page.getByRole('tab',{name:'Loja'}).click();await deliveryOffer(page).click();await expect(page.locator('[data-hm="buy"]')).toContainText('Faltam 9.980');
  await page.unroute('**/api/vehicles');let failed=true;
  await page.route('**/api/vehicles',route=>failed?route.fulfill({status:503,json:{error:'Conexão indisponível.'}}):route.fulfill({json:{...stock(),vehicles:[]}}));
  await page.evaluate(()=>(window as any).fixture.open());await expect(page.getByText('Conexão indisponível.')).toBeVisible();failed=false;
  await page.getByRole('button',{name:'Tentar novamente'}).click();await expect(page.getByText('Sua garagem começa aqui')).toBeVisible();
  await page.evaluate(()=>(window as any).fixture.open({balance:25000}));await expect(page.getByText('Sua garagem começa aqui')).toBeVisible();
  await page.route('**/api/vehicles/buy',route=>route.fulfill({status:409,json:{error:'Tente novamente.'}}));
  await page.getByRole('tab',{name:'Loja'}).click();await deliveryOffer(page).click();await page.locator('[data-hm="buy"]').click();await page.locator('[data-hm="confirm"]').click();
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
      await page.getByRole('tab',{name:'Loja'}).click();await expect(page.locator('.hm-sale').first()).toBeVisible();
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
  await page.getByRole('button',{name:'Explorar a loja'}).click();
  const offer=page.locator(`.hm-sale[data-model="${MOTO_MODEL}"]`);
  await expect(offer).toContainText('Moto de entrega');await expect(offer).toContainText('Bag não inclusa');
  await expect(offer.locator('img')).toHaveAttribute('src','/moto/foto-v4.webp');
  await expect.poll(()=>offer.locator('img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>100)).toBe(true);
  await page.screenshot({path:'test-results/highmotors/v4-loja.png'});
  await offer.getByRole('button',{name:'Ver detalhes'}).click();
  await expect(page.locator('.hm-detail')).toContainText('A bag é um item separado e não acompanha a moto.');
  await page.screenshot({path:'test-results/highmotors/v4-detalhes.png'});
  await page.locator('[data-hm="buy"]').click();await page.locator('[data-hm="confirm"]').click();
  await expect(page.getByText('O veículo é seu!')).toBeVisible();await page.getByRole('button',{name:'Ver meus veículos'}).click();
  const owned:VehicleView=await page.request.get('/api/vehicles').then(response=>response.json());
  expect(owned.vehicles).toHaveLength(1);expect(owned.vehicles[0]!.model).toBe(MOTO_MODEL);await expect(page.locator('.hm-owned')).toHaveAttribute('data-plate',owned.vehicles[0]!.plate);
  await expect(page.locator('.hm-owned img')).toHaveAttribute('src','/moto/foto-v4.webp');
  await expect(page.locator('.hm-owned')).toContainText('Na garagem');await expect(page.locator('.hm-sale')).toHaveCount(0);
  await page.screenshot({path:'test-results/highmotors/in-game-garage.png'});
  await page.locator('[data-phone-home]').click();await page.locator('.ph-home [data-app="highmotors"]').click();
  await expect(page.locator('.hm-owned')).toHaveAttribute('data-plate',owned.vehicles[0]!.plate);
  await page.getByRole('tab',{name:'Loja'}).click();await expect(page.locator('.hm-already')).toContainText('Você já tem 1 deste modelo');
  await page.screenshot({path:'test-results/highmotors/in-game-shop.png'});
  // The phone purchase must produce the actual v4 in the world, through the player's garage action.
  await page.keyboard.press('k');
  await page.evaluate(()=>(window as any).barDebug.send('test.player.place',{x:-13.25,y:.15,z:-8.3}));
  await expect.poll(()=>page.locator('#context-label').textContent()).toContain('Garagem');
  await page.keyboard.press('e');
  const item=page.locator(`.garage-vehicle[data-plate="${owned.vehicles[0]!.plate}"]`);
  await expect(item).toBeVisible();await item.locator('[data-action="garage-take"]').click();
  await expect.poll(()=>page.evaluate(vehicleId=>{
    const d=(window as any).barDebug,world=d.snapshot().world;
    return Object.values(world.motos).some((m:any)=>m.vehicleId===vehicleId);
  },owned.vehicles[0]!.id)).toBe(true);
  const drawn=await page.evaluate(()=>(window as any).barDebug.motos()[0]);
  expect(drawn.rig.bag).toBeNull();expect(drawn.points.ponto_bau).toHaveLength(3);
  await page.screenshot({path:'test-results/highmotors/v4-retirada-da-garagem.png'});
  expect(errors).toEqual([]);
});
