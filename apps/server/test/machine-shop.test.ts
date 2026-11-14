import assert from 'node:assert/strict';
import test from 'node:test';
import {RIBEIRO_RECIPES,RIBEIRO_STAGE_MS,ribeiroOpMaterials} from '@bar/shared';
import {MachineShop} from '../src/world/machine-shop.js';

test('Ribeiro executa preparação, corte, usinagem, furação, acabamento, montagem e estoque',()=>{
  const shop=new MachineShop(),recipe=RIBEIRO_RECIPES[0]!;
  for(const [material,quantity] of Object.entries(recipe.materials))shop.addMaterial(material as keyof typeof recipe.materials,quantity);
  assert.equal(shop.start(recipe.weapon,'player-1','Operador').ok,true);
  let carry=shop.interact('player-1','Operador','preparation',null).carry!;
  assert.equal(shop.challengeFor('cut-1',carry),'cut');
  let result=shop.interact('player-1','Operador','cut-1',carry);assert.equal(result.ok,true);assert.equal(result.carry,null);
  shop.tick(Date.now()+RIBEIRO_STAGE_MS.cut+10);carry=shop.interact('player-1','Operador','cut-1',null).carry!;
  assert.equal(shop.challengeFor('machine-1',carry),'machining');
  result=shop.interact('player-1','Operador','machine-1',carry);assert.equal(result.ok,true);
  shop.tick(Date.now()+RIBEIRO_STAGE_MS.machining+10);carry=shop.interact('player-1','Operador','machine-1',null).carry!;
  assert.equal(shop.challengeFor('drill-1',carry),'drill');
  result=shop.interact('player-1','Operador','drill-1',carry);assert.equal(result.ok,true);
  shop.tick(Date.now()+RIBEIRO_STAGE_MS.drill+10);assert.equal(shop.challengeFor('drill-1',null),'finish');carry=shop.interact('player-1','Operador','drill-1',null).carry!;
  assert.equal(carry.stage,'finished');
  result=shop.interact('player-1','Operador','assembly-1',carry);assert.equal(result.ok,true);
  shop.tick(Date.now()+RIBEIRO_STAGE_MS.assembly+10);
  // Assembled is not stocked: the weapon waits on the bench until someone carries it to the shelf.
  assert.equal(shop.state.orders[0]?.status,'assembled-ready');assert.equal(shop.state.stock[recipe.weapon]??0,0);assert.equal(shop.state.completed,0);
  assert.equal(shop.interact('player-1','Operador','shelf',null).ok,false,'sem arma nas mãos a prateleira não recebe nada');
  carry=shop.interact('player-1','Operador','assembly-1',null).carry!;assert.equal(carry.stage,'assembled');assert.equal(shop.state.orders[0]?.status,'to-shelf');
  assert.equal(shop.interact('player-1','Operador','drill-1',carry).ok,false,'a arma montada não volta a uma máquina');
  result=shop.interact('player-1','Operador','shelf',carry);assert.equal(result.ok,true,result.message);assert.equal(result.carry,null);
  assert.equal(shop.state.stock[recipe.weapon],1);assert.equal(shop.state.completed,1);assert.equal(shop.state.orders[0]?.status,'completed');
  assert.equal(shop.takeStock(recipe.weapon),true);assert.equal(shop.state.stock[recipe.weapon],0);assert.equal(shop.takeStock(recipe.weapon),false);
  shop.returnStock(recipe.weapon);assert.equal(shop.state.stock[recipe.weapon],1);
});

test('Ribeiro: a arma montada devolvida ou interrompida volta à bancada e não entra no estoque',()=>{
  const shop=new MachineShop(),recipe=RIBEIRO_RECIPES[0]!;
  for(const [material,quantity] of Object.entries(recipe.materials))shop.addMaterial(material as keyof typeof recipe.materials,quantity);
  shop.start(recipe.weapon,'player-1','Operador');const order=shop.state.orders[0]!;
  Object.assign(order,{status:'assembling',stationId:'assembly-2'});shop.state.jobs.push({stationId:'assembly-2',orderId:order.id,stage:'assembly',operatorId:'player-1',startedAt:1,endsAt:2});
  shop.restore(shop.snapshot());assert.equal(shop.state.orders[0]?.status,'assembled-ready','reinício no meio da montagem deixa a arma pronta na bancada');assert.equal(shop.state.stock[recipe.weapon]??0,0);
  const carry=shop.interact('player-1','Operador','assembly-2',null).carry!;assert.equal(shop.state.orders[0]?.status,'to-shelf');
  shop.restore(shop.snapshot());assert.equal(shop.state.orders[0]?.status,'assembled-ready','reinício com a arma na mão a devolve à bancada');
  const again=shop.interact('player-1','Operador','assembly-2',null).carry!;shop.release(again);
  assert.equal(shop.state.orders[0]?.status,'assembled-ready');assert.equal(shop.state.orders[0]?.stationId,'assembly-2');void carry;
});

test('Ribeiro: o funcionário escolhe qual OP retirar na preparação',()=>{
  const shop=new MachineShop(),[first,second]=[RIBEIRO_RECIPES[0]!,RIBEIRO_RECIPES[1]!];
  for(const recipe of [first,second])for(const [material,quantity] of Object.entries(recipe.materials))shop.addMaterial(material as keyof typeof recipe.materials,quantity*3);
  shop.start(first.weapon,'boss','Chefe',2);shop.start(second.weapon,'boss','Chefe',1);
  const wanted=shop.state.orders[2]!;assert.equal(wanted.weapon,second.weapon);
  const result=shop.interact('player-1','Operador','preparation',null,wanted.id);
  assert.equal(result.ok,true);assert.equal(result.carry?.orderId,wanted.id);assert.equal(result.carry?.weapon,second.weapon,'levou a OP escolhida, não a mais antiga');
  assert.equal(wanted.status,'to-cut');assert.equal(shop.state.orders.filter(order=>order.status==='queued').length,2);
  // Somebody else already took it, or it does not exist: refused, and nothing else is taken in its place.
  const taken=shop.interact('player-2','Outro','preparation',null,wanted.id);assert.equal(taken.ok,false);assert.match(taken.message,/já foi retirada/);assert.equal(taken.carry,undefined);
  assert.equal(shop.interact('player-2','Outro','preparation',null,crypto.randomUUID()).ok,false);assert.equal(shop.state.orders.filter(order=>order.status==='queued').length,2);
  // Without a choice the oldest waiting OP still goes first.
  assert.equal(shop.interact('player-2','Outro','preparation',null).carry?.orderId,shop.state.orders[0]!.id);
});

test('Ribeiro: uma OP para o cliente leva várias armas, desconta o material de todas e numera as unidades',()=>{
  const shop=new MachineShop(),items=[{weapon:'pistola' as const,quantity:10},{weapon:'revolver' as const,quantity:20}],need=ribeiroOpMaterials(items);
  for(const material of Object.keys(need) as Array<keyof typeof need>)shop.addMaterial(material,need[material]);
  const result=shop.open(items,'  Cliente   X ','p1','Operador');
  assert.equal(result.ok,true,result.message);assert.match(result.message,/OP 0001 aberta para Cliente X: 10× .* e 20× /);
  assert.equal(shop.state.orders.length,30);assert.equal(shop.state.orders.filter(order=>order.weapon==='pistola').length,10);assert.equal(shop.state.orders.filter(order=>order.weapon==='revolver').length,20);
  assert.ok(shop.state.orders.every(order=>order.customer==='Cliente X'&&order.opNumber===1&&order.opId===shop.state.orders[0]!.opId&&order.status==='queued'));
  for(const material of Object.keys(need) as Array<keyof typeof need>)assert.equal(shop.state.materials[material],0,'o material das duas linhas saiu junto');
  for(const material of Object.keys(need) as Array<keyof typeof need>)shop.addMaterial(material,need[material]);
  assert.equal(shop.open([{weapon:'pistola',quantity:1}],'Outro','p1','Operador').ok,true);assert.equal(shop.state.orders.at(-1)!.opNumber,2,'a numeração segue');
  // A line is the same weapon twice: merged. Missing customer, missing material or too many weapons: nothing is taken or created.
  const before=shop.state.orders.length,materials={...shop.state.materials};
  assert.equal(shop.open(items,'   ','p1','Operador').ok,false);assert.equal(shop.open(items,'Cliente','p1','Operador').ok,false,'falta material para a segunda leva');
  assert.equal(shop.open([{weapon:'pistola',quantity:50},{weapon:'revolver',quantity:50},{weapon:'fuzil',quantity:1}],'Cliente','p1','Operador').ok,false,'mais de 100 armas');
  assert.equal(shop.open([],'Cliente','p1','Operador').ok,false);assert.equal(shop.open([{weapon:'pistola',quantity:0}],'Cliente','p1','Operador').ok,false);
  assert.equal(shop.state.orders.length,before);assert.deepEqual(shop.state.materials,materials);
});

test('Ribeiro: cancelar uma OP devolve só o que ainda está na fila e deixa o resto produzir',()=>{
  const shop=new MachineShop(),items=[{weapon:'pistola' as const,quantity:2},{weapon:'revolver' as const,quantity:1}],need=ribeiroOpMaterials(items);
  for(const material of Object.keys(need) as Array<keyof typeof need>)shop.addMaterial(material,need[material]);
  shop.open(items,'Cliente X','p1','Operador');const opId=shop.state.orders[0]!.opId!;
  const taken=shop.interact('p1','Operador','preparation',null).carry!;assert.equal(taken.orderId,shop.state.orders[0]!.id);
  const result=shop.cancelOp(opId);assert.equal(result.ok,true);assert.match(result.message,/2 unidade/);
  assert.equal(shop.state.orders.filter(order=>order.status==='cancelled').length,2);assert.equal(shop.state.orders[0]!.status,'to-cut','a que já foi retirada segue');
  const pistola=RIBEIRO_RECIPES.find(recipe=>recipe.weapon==='pistola')!,revolver=RIBEIRO_RECIPES.find(recipe=>recipe.weapon==='revolver')!;
  assert.equal(shop.state.materials.ACO,pistola.materials.ACO+revolver.materials.ACO,'só duas unidades voltaram: a segunda pistola e o revólver');
  assert.equal(shop.cancelOp(opId).ok,false);assert.equal(shop.cancelOp(crypto.randomUUID()).message,'OP não encontrada.');
});

test('Ribeiro: ordens antigas sem OP ganham número, uma OP por lote, sem cliente',()=>{
  const shop=new MachineShop(),fresh=(id:string,weapon:'pistola'|'revolver',at:number,by='p1')=>({id,weapon,status:'queued' as const,operatorId:by,operatorName:'Op',stationId:'',createdAt:at,updatedAt:at});
  shop.restore({orders:[fresh('a','pistola',100),fresh('b','pistola',100),fresh('c','revolver',100),fresh('d','pistola',200)]});
  const [a,b,c,d]=shop.state.orders as [typeof shop.state.orders[number],...typeof shop.state.orders];
  assert.equal(a.opId,b.opId);assert.notEqual(a.opId,c.opId);assert.notEqual(a.opId,d.opId);assert.deepEqual([a.opNumber,c.opNumber,d.opNumber].sort(),[1,2,3]);assert.equal(a.customer,'');
  const numbers=shop.state.orders.map(order=>order.opNumber);shop.restore(shop.snapshot());assert.deepEqual(shop.state.orders.map(order=>order.opNumber),numbers,'reiniciar de novo não renumera');
  assert.equal(shop.open([],'x','p','n').ok,false);
});

test('Ribeiro abre uma OP com a quantidade escolhida e desconta o lote inteiro de forma atômica',()=>{
  const shop=new MachineShop(),recipe=RIBEIRO_RECIPES[0]!,quantity=4;
  for(const [material,perWeapon] of Object.entries(recipe.materials))shop.addMaterial(material as keyof typeof recipe.materials,perWeapon*quantity);
  const result=shop.start(recipe.weapon,'player-1','Operador',quantity);
  assert.equal(result.ok,true);assert.match(result.message,/4/);assert.equal(shop.state.orders.length,quantity);
  assert.ok(shop.state.orders.every(order=>order.weapon===recipe.weapon&&order.status==='queued'));
  for(const material of Object.keys(recipe.materials) as Array<keyof typeof recipe.materials>)assert.equal(shop.state.materials[material],0);
});

test('Ribeiro rejeita quantidade inválida ou lote sem insumos sem abrir parte da OP',()=>{
  const shop=new MachineShop(),recipe=RIBEIRO_RECIPES[0]!;
  for(const [material,perWeapon] of Object.entries(recipe.materials))shop.addMaterial(material as keyof typeof recipe.materials,perWeapon*2);
  assert.equal(shop.start(recipe.weapon,'player-1','Operador',0).ok,false);
  assert.equal(shop.start(recipe.weapon,'player-1','Operador',3).ok,false);
  assert.equal(shop.state.orders.length,0);
  for(const [material,perWeapon] of Object.entries(recipe.materials))assert.equal(shop.state.materials[material as keyof typeof recipe.materials],perWeapon*2);
});

test('Ribeiro devolve a peça ao último ponto válido quando o operador desconecta',()=>{
  const shop=new MachineShop(),recipe=RIBEIRO_RECIPES[0]!;
  for(const [material,quantity] of Object.entries(recipe.materials))shop.addMaterial(material as keyof typeof recipe.materials,quantity);
  shop.start(recipe.weapon,'player-1','Operador');
  const raw=shop.interact('player-1','Operador','preparation',null).carry!;
  shop.release(raw);
  assert.equal(shop.state.orders[0]?.status,'queued','matéria-prima volta à preparação');

  const picked=shop.interact('player-1','Operador','preparation',null).carry!;
  shop.interact('player-1','Operador','cut-1',picked);
  shop.tick(Date.now()+RIBEIRO_STAGE_MS.cut+10);
  const cut=shop.interact('player-1','Operador','cut-1',null).carry!;
  shop.release(cut);
  assert.equal(shop.state.orders[0]?.status,'cut-ready');
  assert.equal(shop.state.orders[0]?.stationId,'cut-1','a etapa pronta reaparece na máquina de origem');
  assert.equal(shop.interact('player-2','Outro operador','cut-1',null).carry?.stage,'cut');
});

test('Ribeiro recupera uma OP em transporte depois de reiniciar o mundo',()=>{
  const shop=new MachineShop(),recipe=RIBEIRO_RECIPES[0]!;
  for(const [material,quantity] of Object.entries(recipe.materials))shop.addMaterial(material as keyof typeof recipe.materials,quantity);
  shop.start(recipe.weapon,'player-1','Operador');
  const raw=shop.interact('player-1','Operador','preparation',null).carry!;
  shop.interact('player-1','Operador','cut-1',raw);shop.tick(Date.now()+RIBEIRO_STAGE_MS.cut+10);
  shop.interact('player-1','Operador','cut-1',null);
  assert.equal(shop.state.orders[0]?.status,'to-machining');
  const restored=new MachineShop();restored.restore(shop.snapshot());
  assert.equal(restored.state.orders[0]?.status,'cut-ready');
  assert.equal(restored.state.orders[0]?.stationId,'cut-1');
});

test('Ribeiro mantém gestão, cargos e folha no estado persistente',()=>{
  const shop=new MachineShop();
  assert.equal(shop.bootstrap('owner','Dona',false).ok,false);
  assert.equal(shop.bootstrap('owner','Dona',true).ok,true);
  assert.equal(shop.hire('visitor','worker','Operário').ok,false);
  assert.equal(shop.hire('owner','worker','Operário').ok,true);
  assert.equal(shop.setManager('owner','worker',true).ok,true);
  shop.recordPay('worker',110,'Etapa machining','order-1');
  assert.equal(shop.roleOf('worker'),'manager');
  assert.equal(shop.state.members.find(member=>member.userId==='worker')?.earned,110);
  const restored=new MachineShop();restored.restore(shop.snapshot());
  assert.equal(restored.roleOf('owner'),'owner');
  assert.equal(restored.state.payroll.at(-1)?.amount,110);
});

test('a administração muda cargos sem terminal e nunca deixa a equipe sem dono',()=>{
  const shop=new MachineShop();
  assert.equal(shop.adminSetRole('dona','Dona','owner').ok,true,'cria a primeira diretoria sem ser dona');
  assert.equal(shop.adminSetRole('op','Operário','employee').ok,true,'contrata quem nem está conectado');
  assert.equal(shop.adminSetRole('op','Operário','employee').ok,false,'repetir o mesmo cargo é recusado');
  assert.equal(shop.adminSetRole('op','Operário','manager').ok,true);assert.equal(shop.roleOf('op'),'manager');
  assert.equal(shop.adminSetRole('dona','Dona','manager').ok,false,'o último dono não pode ser rebaixado havendo equipe');
  assert.equal(shop.adminSetRole('dona','Dona',null).ok,false);
  assert.equal(shop.adminSetRole('op','Operário','owner').ok,true);
  assert.equal(shop.adminSetRole('dona','Dona',null).ok,true,'com outro dono, o primeiro pode sair');
  assert.equal(shop.adminSetRole('fantasma','Fantasma',null).ok,false);
});

test('a administração ajusta insumos e estoque sem passar de zero',()=>{
  const shop=new MachineShop(),weapon=RIBEIRO_RECIPES[0]!.weapon;
  assert.equal(shop.adminAdjustMaterial('ACO',18).ok,true);assert.equal(shop.state.materials.ACO,18);
  assert.equal(shop.adminAdjustMaterial('ACO',-19).ok,false);assert.equal(shop.state.materials.ACO,18);
  assert.equal(shop.adminAdjustMaterial('ACO',-18).ok,true);assert.equal(shop.state.materials.ACO,0);
  assert.equal(shop.adminAdjustStock(weapon,2).ok,true);assert.equal(shop.adminAdjustStock(weapon,-3).ok,false);assert.equal(shop.state.stock[weapon],2);
});

test('descartar uma OP no meio da linha libera a máquina e a tira da contagem',()=>{
  const shop=new MachineShop(),recipe=RIBEIRO_RECIPES[0]!;
  for(const [material,quantity] of Object.entries(recipe.materials))shop.addMaterial(material as keyof typeof recipe.materials,quantity);
  shop.start(recipe.weapon,'p','Operador');
  const raw=shop.interact('p','Operador','preparation',null).carry!;shop.interact('p','Operador','cut-1',raw);
  assert.equal(shop.state.jobs.length,1);
  const id=shop.state.orders[0]!.id;assert.equal(shop.abort(id).ok,true);
  assert.equal(shop.state.jobs.length,0,'a máquina foi liberada');assert.equal(shop.state.orders[0]!.status,'cancelled');
  assert.equal(shop.abort(id).ok,false,'ordem que já terminou não é descartada de novo');
  assert.equal(shop.abort('nao-existe').ok,false);
});

test('o resumo da administração conta ordens por estado, dia e arma e soma a folha por etapa',()=>{
  const shop=new MachineShop(),recipe=RIBEIRO_RECIPES[0]!,now=Date.now();
  shop.adminSetRole('dona','Dona','owner');
  for(const [material,quantity] of Object.entries(recipe.materials))shop.addMaterial(material as keyof typeof recipe.materials,quantity*2);
  shop.start(recipe.weapon,'dona','Dona');shop.start(recipe.weapon,'dona','Dona');
  const [first,second]=shop.state.orders as [typeof shop.state.orders[number],typeof shop.state.orders[number]];
  first.status='completed';first.updatedAt=first.createdAt+6*60_000;second.status='cutting';
  shop.recordPay('dona',80,'Etapa cut · ABC123','x');shop.recordPay('dona',160,'Etapa assembly · ABC123','x');
  const view=shop.adminView({online:id=>id==='dona',purchaseOrders:[],carriers:[]},now);
  assert.equal(view.totalOrders,2);assert.equal(view.statusCount.completed,1);assert.equal(view.statusCount.cutting,1);
  assert.equal(view.producedByWeapon[recipe.weapon],1);assert.equal(Math.round(view.averageMinutes!),6);
  assert.equal(view.daily.length,14);assert.equal(view.daily.at(-1)!.opened,2);assert.equal(view.daily.at(-1)!.paid,240);
  assert.equal(view.paidByStage.cut,80);assert.equal(view.paidByStage.assembly,160);assert.equal(view.paidTotal,240);
  assert.equal(view.members[0]!.online,true);assert.equal(view.payroll[0]!.amount,160,'a folha vem do mais novo para o mais antigo');
});
