import {test,expect,type Page} from '@playwright/test';
import {enterAsAdmin} from './moto-helpers';
import {menuItem} from './menu';

const shot=async(page:Page,name:string)=>{
  await expect(page.locator('#toasts')).not.toContainText('NÃO FOI POSSÍVEL');
  await page.locator('#toasts article').evaluateAll(nodes=>nodes.forEach(node=>node.remove()));
  await page.screenshot({path:`docs/fabrica/capturas/${name}.png`,fullPage:false});
};
const place=async(page:Page,xyz:[number,number,number])=>{
  await page.evaluate(([x,y,z])=>(window as any).barDebug.send('test.player.place',{x,y,z}),xyz);
  await expect.poll(()=>page.evaluate(([x,,z])=>{const s=(window as any).barDebug.snapshot(),p=s.world.players[s.localId];return Math.hypot(p.x-x,p.z-z);},xyz)).toBeLessThan(1);
};
const debug=(page:Page,op:string,value?:number,target?:string)=>page.evaluate(({op,value,target})=>(window as any).barDebug.send('admin.factory.debug',{requestId:crypto.randomUUID(),op,value,target,reason:'Cenário E2E da fábrica'}),{op,value,target});
const closeScada=(page:Page)=>page.locator('.factory-scada .fw-close').click();

test('EMPRESA BRASIL: contratar, expediente, EPI, SCADA, processo, perfil e demissão',async({page})=>{
  test.setTimeout(180_000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await enterAsAdmin(page);
  // Repeatable even when the E2E database survived a previous resignation.
  const me=await page.evaluate(()=>(window as any).barDebug.snapshot().localId as string);
  const current=await (await page.request.get('/api/employment')).json();
  if(current.employment?.status!=='hired'){
    if(current.employment){
      await page.evaluate(id=>(window as any).barDebug.send('chat.send',{text:`/emprego ${id} cooldown 0`}),me);
      await expect.poll(async()=>((await (await page.request.get('/api/employment')).json()).employment?.cooldownUntil)).toBeFalsy();
    }
    expect((await page.request.post('/api/employment/hire',{data:{requestId:crypto.randomUUID()}})).ok()).toBe(true);
  }
  const alreadyInShift=!!((await (await page.request.get('/api/employment')).json()).shift);
  const markers=(await (await page.request.get('/fabrica/empresa_brasil_marcadores.json')).json()).marcadores as Record<string,{xyz_jogo:[number,number,number]}>;
  await place(page,markers.Ponto_EB_Entrada_Pessoal.xyz_jogo);await page.keyboard.press('KeyE');await expect(page.locator('.factory-scada')).toBeVisible();
  if(!alreadyInShift)await page.locator('.factory-scada').getByRole('button',{name:/Entrar em expediente/}).click();
  await expect(page.locator('.factory-scada')).toContainText('Em serviço');
  await page.locator('.factory-scada').getByRole('button',{name:'Colocar o EPI'}).click();
  await debug(page,'seed-full');await debug(page,'tank-ready',undefined,'1');await debug(page,'time',60);await debug(page,'empty-bags',20);
  await place(page,markers.Ponto_EB_Painel.xyz_jogo);await page.keyboard.press('KeyE');await expect(page.locator('.factory-scada')).toContainText('Início');
  await page.locator('.factory-scada').getByRole('button',{name:'Tanques'}).click();await expect(page.locator('.factory-scada')).toContainText('Aprovado');await shot(page,'01-tanque-pronto');
  // Operação de campo real: abre o tanque e leva, um a um, 8 sacos de
  // MALTE e 4 de MIX do rack até a plataforma. Quantidade e carga ficam no servidor.
  await debug(page,'tank-fill',undefined,'1');
  await page.locator('.factory-scada').getByRole('button',{name:/agitador/i}).first().click();
  await page.locator('.factory-scada').getByRole('button',{name:/tampa/i}).first().click();
  await closeScada(page);
  for(const [marker,count] of [['Ponto_EB_Rack_V1N1P1',8],['Ponto_EB_Rack_V3N1P1',4]] as const)for(let i=0;i<count;i++){
    await place(page,markers[marker].xyz_jogo);await page.keyboard.press('KeyE');
    await place(page,markers.Ponto_EB_Tanque_1_Operador.xyz_jogo);await page.keyboard.press('KeyE');
  }
  await place(page,markers.Ponto_EB_Painel.xyz_jogo);await page.keyboard.press('KeyE');
  await page.locator('.factory-scada').getByRole('button',{name:'Tanques'}).click();await expect(page.locator('.factory-scada')).toContainText(/MALTE 8\/8/);await expect(page.locator('.factory-scada')).toContainText(/MIX 4\/4/);
  await debug(page,'tank-ready',undefined,'1');
  await debug(page,'dryer-ready');
  await page.locator('.factory-scada').getByRole('button',{name:'Secador'}).click();await expect(page.locator('.factory-scada')).toContainText(/Pronto/);await shot(page,'02-secador-pronto');
  await page.locator('.factory-scada').getByRole('button',{name:'Alimentar com TQ-101'}).click();await expect(page.locator('.factory-scada')).toContainText(/Produzindo|Resfriando/);await shot(page,'03-secador-produzindo');
  // Ensaque real pelas transições do servidor; apenas o estoque inicial do silo
  // é semeado para tornar a captura determinística e rápida.
  await debug(page,'bag-reset');await debug(page,'empty-bags',20);await debug(page,'silo',100);
  // O ensaque não é do computador da sala de controle: a janela própria abre com E na ensacadeira.
  await closeScada(page);await place(page,markers.Ponto_EB_Ensaque.xyz_jogo);await page.keyboard.press('KeyE');await expect(page.locator('.factory-scada')).toContainText('Estação de ensaque');
  await page.getByRole('button',{name:'Posicionar saco'}).click();await page.getByRole('button',{name:'Iniciar enchimento'}).click();
  await expect(page.locator('.factory-scada')).toContainText(/Aguardando costura/);
  await page.getByRole('button',{name:'Costurar'}).click();await page.getByRole('button',{name:'Empilhar'}).click();
  await expect(page.locator('.factory-scada')).toContainText('1 / 18 sacos');await shot(page,'04-ensaque-primeiro-saco');
  await closeScada(page);
  await menuItem(page,'Você','Perfil');await page.getByRole('tab',{name:'Meu emprego'}).click();await expect(page.locator('.pf-panel')).toContainText(/Em serviço|Contratado/);await shot(page,'04-perfil-emprego');
  console.log('Factory rendering sample:',JSON.stringify(await page.evaluate(()=>({performance:(window as any).barDebug.performance(),city:(window as any).barDebug.city(),graphics:(window as any).barDebug.graphics()}))));
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Pedir demissão'}).click();await expect(page.locator('.pf-panel')).toContainText(/Nova candidatura disponível|Operador de Spray Dry/);expect(errors).toEqual([]);
});
