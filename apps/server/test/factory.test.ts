import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FactoryDirector,validateFactoryAssets} from '../src/world/factory/index.js';

/** A production order approved and started (a fixed draw), so the tanks may be started. */
function runOrder(factory:FactoryDirector,batches=3):void {
  const offers=factory.drawOffers('teste',()=>0,()=>`op-${Math.random()}`);const offer=offers[0]!;offer.batches=batches;
  factory.approveOffer(offer.id,'gerente');factory.startProduction('operador');
}

const folder=fileURLToPath(new URL('../data/factory/',import.meta.url));
const markers=JSON.parse(fs.readFileSync(path.join(folder,'empresa_brasil_marcadores.json'),'utf8'));
const stock=JSON.parse(fs.readFileSync(path.join(folder,'empresa_brasil_estoque.json'),'utf8'));

test('assets da fábrica têm os 48 marcadores e as 25 vagas esperadas',()=>{
  assert.doesNotThrow(()=>validateFactoryAssets(markers,stock));
  assert.throws(()=>validateFactoryAssets({...markers,n:47},stock),/48 marcadores/);
  assert.throws(()=>validateFactoryAssets(markers,{...stock,vagas:stock.vagas.slice(1)}),/25 vagas/);
});

test('fábrica nasce vazia, valida capacidade e reset restaura o estado',()=>{
  const factory=new FactoryDirector({markers,stock});
  assert.equal(factory.snapshot().slots.length,25);assert.equal(factory.snapshot().slots.reduce((sum,slot)=>sum+slot.quantity,0),0);
  const marker=stock.vagas[0].marcador;factory.setStock(marker,18,'PRODUTO');assert.equal(factory.snapshot().slots[0]?.quantity,18);
  assert.throws(()=>factory.setStock(marker,19),/entre 0 e 18/);
  factory.reset();assert.equal(factory.snapshot().slots[0]?.quantity,0);
});

test('processo só avança com operador e em passos de 4 Hz',()=>{
  const factory=new FactoryDirector({markers,stock});factory.tanks[0]={...factory.tanks[0]!,state:'DISSOLVENDO',agitatorRpm:120};
  factory.tick(100);assert.equal(factory.tanks[0]?.state,'DISSOLVENDO');
  factory.setOperators(1);factory.tick(89.9);assert.equal(factory.tanks[0]?.state,'DISSOLVENDO');factory.tick(.25);assert.equal(factory.tanks[0]?.state,'HOMOGENEIZANDO');
});

test('ciclo autoritativo prepara, seca, ensaca e completa um palete',()=>{
  const factory=new FactoryDirector({markers,stock});factory.setOperators(1);factory.balance.timeScale=60;runOrder(factory);
  factory.command('tank1.water');factory.tick(1);assert.equal(factory.tanks[0]?.state,'AQUECENDO');factory.tick(3);assert.equal(factory.tanks[0]?.state,'AGUARDANDO_INSUMOS');factory.command('tank1.agitator');factory.command('tank1.lid');
  factory.setStock('Ponto_EB_Rack_V1N1P1',8);factory.setStock('Ponto_EB_Rack_V3N1P1',4);
  for(let i=0;i<8;i++)factory.pourBag(1,factory.takeBag('Ponto_EB_Rack_V1N1P1'));for(let i=0;i<4;i++)factory.pourBag(1,factory.takeBag('Ponto_EB_Rack_V3N1P1'));
  factory.tick(3);factory.tick(1);assert.equal(factory.tanks[0]?.state,'AGUARDANDO_QUALIDADE');factory.command('tank1.approve');factory.command('dryer.preheat');factory.tick(4);assert.equal(factory.dryer.state,'PRONTO');factory.command('dryer.feed','1');factory.tick(70);assert.equal(factory.dryer.state,'PRONTO');assert.equal(factory.dryer.sourceTank,null);assert.ok(factory.dryer.powderKg>250&&factory.dryer.powderKg<300);
  factory.dryer.powderKg=450;factory.bagging.emptyBags=18;for(let i=0;i<18;i++){factory.command('bag.empty');factory.command('bag.start');factory.tick(1);factory.command('bag.sew');factory.command('bag.stack');}
  assert.equal(factory.slots.find(slot=>slot.marker==='Ponto_EB_PA_Ensaque')?.quantity,18);assert.equal(factory.bagging.producedBags,18);
});

test('emergência, falhas, reconhecimento e correções respeitam os estados',()=>{
  const factory=new FactoryDirector({markers,stock});factory.setOperators(1);factory.command('emergency');assert.equal(factory.emergency,true);assert.equal(factory.alarms.at(-1)?.severity,'critical');const alarm=factory.alarms.at(-1)!;factory.command('alarm.ack',alarm.id);assert.equal(alarm.acknowledged,true);factory.command('emergency.reset');assert.equal(factory.emergency,false);
  factory.dryer={...factory.dryer,state:'FALHA',fault:'bico_entupido'};factory.command('dryer.retry');assert.equal(factory.dryer.state,'PARADO');assert.equal(factory.dryer.fault,'');factory.command('dryer.clean');assert.equal(factory.dryer.state,'LIMPEZA');
  factory.tanks[0]={...factory.tanks[0]!,state:'AGUARDANDO_QUALIDADE',waterL:1200};factory.command('tank1.reject');assert.equal(factory.tanks[0]?.state,'SUJO');factory.command('tank1.wash');assert.equal(factory.tanks[0]?.state,'VAZIO');
});

test('uma única unidade não pode ser retirada por dois operadores e a desconexão pode devolvê-la',()=>{
  const factory=new FactoryDirector({markers,stock}),marker='Ponto_EB_Rack_V1N1P1';factory.setStock(marker,1);const held=factory.takeBag(marker);assert.throws(()=>factory.takeBag(marker),/Não há saco/);factory.returnBag(marker,held);assert.equal(factory.slots.find(slot=>slot.marker===marker)?.quantity,1);
});

test('reinício restaura estoque e pausa processos em andamento sem perder massa',()=>{
  const before=new FactoryDirector({markers,stock});before.setStock('Ponto_EB_Rack_V1N1P1',7);before.tanks[0]={...before.tanks[0]!,state:'DISSOLVENDO',waterL:1200,malteBags:8,mixBags:4};before.dryer={...before.dryer,state:'PRODUZINDO',powderKg:91,sourceTank:1};const state=before.snapshot();const after=new FactoryDirector({markers,stock});after.restore(state,state.slots);assert.equal(after.tanks[0]?.state,'PAUSADO');assert.equal(after.dryer.state,'PAUSADO');assert.equal(after.dryer.powderKg,91);assert.equal(after.slots.find(slot=>slot.marker==='Ponto_EB_Rack_V1N1P1')?.quantity,7);
});

test('carga leve: seis operadores e dois fluxos logísticos mantêm tick estável por dez minutos simulados',()=>{
  const factory=new FactoryDirector({markers,stock});factory.setOperators(6);factory.tanks[0]={...factory.tanks[0]!,state:'DISSOLVENDO',agitatorRpm:120};factory.slots[0]!.reservedBy='truck-a';factory.slots[1]!.reservedBy='truck-b';const samples:number[]=[];for(let i=0;i<2400;i++){const start=performance.now();factory.tick(.25);samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);const p95=samples[Math.floor(samples.length*.95)]!;assert.ok(p95<5,`tick p95 ${p95.toFixed(3)} ms`);assert.equal(factory.slots.filter(slot=>slot.reservedBy).length,2);assert.ok(Number.isFinite(factory.snapshot().revision));
});

test('simulação administrativa percorre o ciclo e publica relatório auditável',()=>{
  const factory=new FactoryDirector({markers,stock});for(const slot of factory.slots)if(slot.material!=='PRODUTO')slot.quantity=slot.capacity;const report=factory.runAutomaticCycle();assert.equal(report.faults.length,0);assert.ok(report.steps.includes('secagem'));assert.ok(report.producedBags>0);assert.equal(report.stockBefore.MALTE-report.stockAfter.MALTE,factory.balance.recipe.malteBags);assert.equal(factory.snapshot().lastSimulation?.completedAt,report.completedAt);
});

test('empilhar o 18º saco com a saída ocupada recusa sem consumir o saco; armazenar libera a saída',()=>{
  const factory=new FactoryDirector({markers,stock});factory.setOperators(1);
  factory.bagging={...factory.bagging,state:'AGUARDANDO_EMPILHAR',palletBags:17,lot:'L1'};Object.assign(factory.slots.find(slot=>slot.marker==='Ponto_EB_PA_Ensaque')!,{quantity:18,batchId:'L1'});
  assert.throws(()=>factory.command('bag.stack'),/palete anterior/);
  assert.equal(factory.bagging.state,'AGUARDANDO_EMPILHAR');assert.equal(factory.bagging.palletBags,17);assert.equal(factory.bagging.producedBags,0);
  assert.match(factory.command('pallet.store'),/armazenado/);
  assert.equal(factory.slots.find(slot=>slot.marker==='Ponto_EB_PA_Ensaque')?.quantity,0);assert.equal(factory.slots.find(slot=>slot.marker==='Ponto_EB_PA_1')?.quantity,18);assert.equal(factory.slots.find(slot=>slot.marker==='Ponto_EB_PA_1')?.batchId,'L1');
  assert.match(factory.command('bag.stack'),/Palete completo/);assert.equal(factory.slots.find(slot=>slot.marker==='Ponto_EB_PA_Ensaque')?.quantity,18);
  factory.command('pallet.store');assert.equal(factory.slots.find(slot=>slot.marker==='Ponto_EB_PA_2')?.quantity,18,'o segundo palete vai para a próxima vaga livre');
  for(const slot of factory.slots)if(slot.material==='PRODUTO'&&slot.marker!=='Ponto_EB_PA_Ensaque')slot.quantity=18;
  factory.slots.find(slot=>slot.marker==='Ponto_EB_PA_Ensaque')!.quantity=18;assert.throws(()=>factory.command('pallet.store'),/cheio/);
});

test('sacos vazios: o fardo começa cheio, acaba e é reposto',()=>{
  const factory=new FactoryDirector({markers,stock});assert.ok(factory.bagging.emptyBags>=30);
  assert.throws(()=>factory.command('bag.restock'),/bastante/);
  factory.bagging={...factory.bagging,emptyBags:0};assert.throws(()=>factory.command('bag.empty'),/Sem sacos/);
  factory.command('bag.restock');assert.ok(factory.bagging.emptyBags>0);factory.command('bag.empty');assert.equal(factory.bagging.state,'SACO_POSICIONADO');
});

test('parar o secador devolve o tanque que alimentava e o reinício retoma sozinho com operador',()=>{
  const factory=new FactoryDirector({markers,stock});factory.setOperators(1);
  factory.tanks[0]={...factory.tanks[0]!,state:'TRANSFERINDO',waterL:700,malteBags:8,mixBags:4};factory.dryer={...factory.dryer,state:'PRODUZINDO',sourceTank:1,flowLph:1100};
  factory.command('dryer.stop');assert.equal(factory.tanks[0]?.state,'PRONTO_PARA_TRANSFERIR');assert.equal(factory.dryer.state,'RESFRIANDO');
  const before=new FactoryDirector({markers,stock});before.tanks[0]={...before.tanks[0]!,state:'DISSOLVENDO',waterL:1200,agitatorRpm:120,malteBags:8,mixBags:4,stepS:10};
  const snapshot=before.snapshot(),after=new FactoryDirector({markers,stock});after.restore(snapshot,snapshot.slots);
  assert.equal(after.tanks[0]?.state,'PAUSADO');after.tick(5);assert.equal(after.tanks[0]?.state,'PAUSADO','sem operador continua pausado');
  after.setOperators(1);after.tick(.3);assert.equal(after.tanks[0]?.state,'DISSOLVENDO');assert.equal(after.tanks[0]?.restored,undefined);
});

test('alarmes do processo nascem sozinhos, não se repetem e somem quando a causa some',()=>{
  const factory=new FactoryDirector({markers,stock});factory.setOperators(1);
  factory.tanks[0]={...factory.tanks[0]!,state:'DISSOLVENDO',waterL:1200,agitatorRpm:0};factory.tick(1.1);
  const keys=()=>factory.alarms.filter(alarm=>alarm.active!==false).map(alarm=>alarm.key);
  assert.ok(keys().includes('agitador-1'));factory.tick(1.1);assert.equal(keys().filter(key=>key==='agitador-1').length,1);
  factory.command('tank1.agitator');factory.tick(1.1);assert.ok(!keys().includes('agitador-1'));
  assert.ok(keys().includes('estoque-MALTE'),'estoque vazio pede matéria-prima');
  factory.slots.find(slot=>slot.marker==='Ponto_EB_Rack_V1N1P1')!.quantity=18;factory.tick(1.1);assert.ok(!keys().includes('estoque-MALTE'));
  assert.ok(factory.events.some(event=>/normalizado/.test(event.text)));
});

test('uma fábrica ociosa não mexe na revisão a cada tick (não é salva nem enviada à toa)',()=>{
  const factory=new FactoryDirector({markers,stock});factory.setOperators(1);factory.tick(1.1);const revision=factory.revision;
  for(let i=0;i<40;i++)factory.tick(.25);assert.equal(factory.revision,revision);
});

test('um palete e as prateleiras: pegar por coluna usa o nível mais baixo com saco, e o estoque inicial só entra uma vez',()=>{
  const factory=new FactoryDirector({markers,stock});assert.ok(factory.pristine());factory.seedStarterStock();assert.equal(factory.pristine(),false);assert.equal(factory.seeded,true);
  factory.slots.find(slot=>slot.marker==='Ponto_EB_Rack_V1N1P1')!.quantity=0;factory.slots.find(slot=>slot.marker==='Ponto_EB_Rack_V1N2P1')!.quantity=3;
  const taken=factory.takeFromColumn('Ponto_EB_Rack_V1N3P1');assert.equal(taken.origin,'Ponto_EB_Rack_V1N2P1');assert.equal(taken.material,'MALTE');
  const state=factory.snapshot(),again=new FactoryDirector({markers,stock});again.restore(state,state.slots);assert.equal(again.seeded,true);
  factory.reset();assert.equal(factory.seeded,true,'reset deixa vazio de propósito');
});

/** A tank at the dryer's door: approved, with the recipe's water and solids. */
const readyTank=(factory:FactoryDirector,index:number)=>{factory.tanks[index]={...factory.tanks[index]!,state:'PRONTO_PARA_TRANSFERIR',waterL:1200,temperatureC:65,malteBags:8,mixBags:4,solidsKg:300,quality:100,lidOpen:false,agitatorRpm:120};};

test('o secador troca de tanque sem parar, e o tanque deixado guarda o que sobrou',()=>{
  const factory=new FactoryDirector({markers,stock});factory.setOperators(1);factory.dryer={...factory.dryer,state:'PRONTO',inletC:190,outletC:87};readyTank(factory,0);readyTank(factory,1);
  factory.command('dryer.feed','1');assert.equal(factory.dryer.state,'PRODUZINDO');
  factory.tick(60);const first=factory.tanks[0]!,used=1-(first.waterL+first.solidsKg!*.65)/(1200+300*.65);assert.ok(used>.01&&used<.9,`usou ${used}`);
  assert.ok(factory.dryer.powderKg>0);
  // Trocar para o TQ-102 com o secador ligado: continua PRODUZINDO, o TQ-101 volta a ficar aprovado com o resto.
  assert.match(factory.command('dryer.feed','2'),/sem parar/);assert.equal(factory.dryer.state,'PRODUZINDO');assert.equal(factory.dryer.sourceTank,2);
  assert.equal(factory.tanks[0]!.state,'PRONTO_PARA_TRANSFERIR');assert.ok(Math.abs(factory.tanks[0]!.waterL-first.waterL)<1e-6);
  assert.throws(()=>factory.command('dryer.feed','2'),/já está alimentando/);
  // Esvaziar o TQ-102 passa sozinho para o TQ-101 (ainda aprovado), sem esfriar.
  factory.balance.timeScale=60;for(let i=0;i<400&&factory.tanks[1]!.state!=='SUJO';i++){if(factory.dryer.powderKg>400)factory.dryer.powderKg=0;factory.tick(.5);}
  assert.equal(factory.tanks[1]!.state,'SUJO');assert.equal(factory.dryer.state,'PRODUZINDO');assert.equal(factory.dryer.sourceTank,1);
});

test('o volume do tanque inclui os sólidos dissolvidos (0,65 L/kg) e o secador gasta tudo, sem perder massa',()=>{
  const factory=new FactoryDirector({markers,stock});factory.setOperators(1);factory.dryer={...factory.dryer,state:'PRONTO',inletC:190};readyTank(factory,0);factory.balance.timeScale=60;
  factory.command('dryer.feed','1');let total=0;
  for(let i=0;i<4000&&factory.dryer.state==='PRODUZINDO';i++){const before=factory.dryer.powderKg;factory.tick(.5);const gained=factory.dryer.powderKg-before;if(gained>0)total+=gained;if(factory.dryer.powderKg>=499){total-=0;factory.dryer.powderKg=0;}}
  assert.equal(factory.dryer.state,'PRONTO');assert.equal(factory.tanks[0]!.state,'SUJO');
  // 300 kg de sólidos x rendimento da qualidade 100 (0,97) = 291 kg de pó, exatos.
  assert.ok(Math.abs(total-291)<.01,`total ${total}`);
});

test('parar a produção não perde o pó: dá para fechar um saco leve com a diferença e a paga acompanha o peso',()=>{
  const factory=new FactoryDirector({markers,stock});factory.setOperators(1);factory.dryer={...factory.dryer,state:'PARADO',powderKg:17.4};factory.bagging={...factory.bagging,emptyBags:5};
  factory.command('bag.empty');
  assert.match(factory.command('bag.start'),/saco leve/);
  factory.balance.timeScale=30;for(let i=0;i<20&&factory.bagging.state==='ENCHENDO';i++)factory.tick(1);
  assert.equal(factory.bagging.state,'AGUARDANDO_COSTURA');assert.ok(Math.abs(factory.bagging.weightKg-17.4)<1e-6,`pesou ${factory.bagging.weightKg}`);assert.ok(factory.dryer.powderKg<1e-6);
  factory.command('bag.sew');assert.match(factory.command('bag.stack'),/Saco leve \(17,4 kg\)/);assert.equal(factory.bagging.lastBagKg,17.4);assert.equal(factory.bagging.lightBags,1);assert.equal(factory.bagging.producedBags,1);
  // Um saco cheio não conta como leve.
  factory.dryer={...factory.dryer,powderKg:40};factory.command('bag.empty');factory.command('bag.start');for(let i=0;i<20&&(factory.bagging.state as string)==='ENCHENDO';i++)factory.tick(1);factory.command('bag.sew');factory.command('bag.stack');
  assert.equal(factory.bagging.lastBagKg,25);assert.equal(factory.bagging.lightBags,1);assert.ok(Math.abs(factory.dryer.powderKg-15)<1e-6);
});

test('fechar o saco no meio do enchimento (bag.finish) e o silo vazio não inventam pó',()=>{
  const factory=new FactoryDirector({markers,stock});factory.setOperators(1);factory.dryer={...factory.dryer,state:'PRODUZINDO',sourceTank:1,powderKg:.3,flowLph:0};readyTank(factory,0);factory.tanks[0]={...factory.tanks[0]!,state:'TRANSFERINDO'};factory.balance.dryerFlowLph=.001;factory.bagging={...factory.bagging,emptyBags:3};
  factory.command('bag.empty');factory.command('bag.start');factory.tick(1);
  assert.ok(factory.bagging.weightKg<=.3+.01,`pesou ${factory.bagging.weightKg}`);
  assert.equal(factory.bagging.state,'ENCHENDO','com o secador produzindo o saco espera mais pó');
  assert.match(factory.command('bag.finish'),/Saco fechado com/);assert.equal(factory.bagging.state,'AGUARDANDO_COSTURA');
  assert.throws(()=>factory.command('bag.finish'),/Não há saco enchendo/);
  // Sem secador mandando mais, o saco fecha sozinho com o que tinha.
  const dry=new FactoryDirector({markers,stock});dry.setOperators(1);dry.dryer={...dry.dryer,state:'PARADO',powderKg:3};dry.bagging={...dry.bagging,emptyBags:2};dry.command('bag.empty');dry.command('bag.start');dry.tick(5);
  assert.equal(dry.bagging.state,'AGUARDANDO_COSTURA');assert.ok(Math.abs(dry.bagging.weightKg-3)<1e-6);assert.equal(dry.dryer.powderKg,0);
});

test('despejar o saco abre a tampa e liga o agitador quando o operador está com o saco na mão',()=>{
  const factory=new FactoryDirector({markers,stock});factory.setOperators(1);runOrder(factory);factory.command('tank1.water');factory.balance.timeScale=60;factory.tick(1);factory.tick(3);
  assert.equal(factory.tanks[0]!.state,'AGUARDANDO_INSUMOS');assert.equal(factory.tanks[0]!.lidOpen,false);assert.equal(factory.tanks[0]!.agitatorRpm,0);
  const did=factory.pourBag(1,'MALTE');assert.deepEqual(did,['abriu a tampa','ligou o agitador']);assert.equal(factory.tanks[0]!.lidOpen,true);assert.equal(factory.tanks[0]!.agitatorRpm,120);assert.equal(factory.tanks[0]!.malteBags,1);assert.equal(factory.tanks[0]!.solidsKg,25);
  assert.deepEqual(factory.pourBag(1,'MALTE'),[]);
  // Num tanque que não aceita insumo nada muda.
  assert.throws(()=>factory.pourBag(2,'MALTE'),/não aceita insumos|Adicione água/);assert.equal(factory.tanks[1]!.lidOpen,false);assert.equal(factory.tanks[1]!.agitatorRpm,0);
});

test('tampa e agitador têm comandos explícitos (ligar e desligar sempre dão o estado pedido)',()=>{
  const factory=new FactoryDirector({markers,stock});factory.setOperators(1);runOrder(factory);factory.command('tank1.water');factory.tick(1);factory.tick(3);
  factory.command('tank1.lid.open');factory.command('tank1.lid.open');assert.equal(factory.tanks[0]!.lidOpen,true);factory.command('tank1.lid.close');assert.equal(factory.tanks[0]!.lidOpen,false);factory.command('tank1.lid.close');assert.equal(factory.tanks[0]!.lidOpen,false);
  factory.command('tank1.agitator.on');factory.command('tank1.agitator.on');assert.equal(factory.tanks[0]!.agitatorRpm,120);factory.command('tank1.agitator.off');assert.equal(factory.tanks[0]!.agitatorRpm,0);
  assert.throws(()=>factory.command('tank2.agitator.on'),/vazio/);
});

test('a limpeza do secador termina sozinha e o ritmo antigo salvo vira o novo',()=>{
  const factory=new FactoryDirector({markers,stock});factory.setOperators(1);factory.command('dryer.clean');assert.equal(factory.dryer.state,'LIMPEZA');factory.balance.timeScale=60;factory.tick(2);assert.equal(factory.dryer.state,'PARADO');
  const saved=new FactoryDirector({markers,stock});saved.restore({balance:{...saved.balance,dryerFlowLph:1100}});assert.equal(saved.balance.dryerFlowLph,6000);
  const custom=new FactoryDirector({markers,stock});custom.restore({balance:{...custom.balance,dryerFlowLph:3000}});assert.equal(custom.balance.dryerFlowLph,3000);
});

test('sem ordem de produção não há produção: aprovar, iniciar, lotes contados, e ao fim a fábrica fica suja até ser limpa',()=>{
  const factory=new FactoryDirector({markers,stock});factory.setOperators(1);
  assert.throws(()=>factory.command('tank1.water'),/Sem ordem de produção/);
  const offers=factory.drawOffers('Dono',()=>0.5,()=>`op-${Math.random()}`);assert.equal(offers.length,3);assert.equal(new Set(offers.map(offer=>offer.productId)).size,3);
  assert.throws(()=>factory.command('tank1.water'),/Sem ordem de produção/,'opção sorteada ainda não é ordem');
  assert.throws(()=>factory.approveOffer('nao-existe','Gerente'),/não existe/);
  const offer=offers[1]!;offer.batches=1;
  factory.approveOffer(offer.id,'Gerente');assert.equal(factory.board.active?.status,'approved');assert.equal(factory.board.offers.length,0);
  assert.throws(()=>factory.drawOffers('Dono'),/Já há uma ordem/);
  assert.throws(()=>factory.command('tank1.water'),/ainda não foi iniciada/);
  // The recipe the process runs by is the order's.
  assert.equal(factory.eff.recipe.malteBags,offer.malteBags);assert.equal(factory.eff.recipe.waterL,(offer.malteBags+offer.mixBags)*100);assert.equal(factory.snapshot().balance.recipe.mixBags,offer.mixBags);
  factory.startProduction('Operador');assert.equal(factory.board.active?.status,'running');
  factory.command('tank1.water');assert.equal(factory.board.active?.batchesStarted,1);
  assert.throws(()=>factory.command('tank2.water'),/já iniciou os 1 lote/);
  // The batch runs to the dryer: the tank is left dirty and, with the last batch bagged, the order ends and the whole plant is filthy.
  factory.balance.timeScale=60;factory.tick(1);factory.tick(3);factory.command('tank1.agitator');factory.command('tank1.lid');
  const bags=offer.malteBags+offer.mixBags;factory.setStock('Ponto_EB_Rack_V1N1P1',Math.min(18,offer.malteBags));factory.setStock('Ponto_EB_Rack_V3N1P1',Math.min(18,offer.mixBags));
  for(let i=0;i<offer.malteBags;i++)factory.pourBag(1,factory.takeBag('Ponto_EB_Rack_V1N1P1'));for(let i=0;i<offer.mixBags;i++)factory.pourBag(1,factory.takeBag('Ponto_EB_Rack_V3N1P1'));
  factory.tick(3);factory.tick(1);factory.command('tank1.approve');factory.command('dryer.preheat');factory.tick(4);factory.command('dryer.feed','1');
  for(let i=0;i<4000&&factory.tanks[0]!.state!=='SUJO';i++)factory.tick(.5);
  assert.equal(factory.tanks[0]!.state,'SUJO');assert.equal(factory.board.active?.batchesDone,1);assert.ok(factory.dirt.levels.dryer>0.05,'o secador sujou com o pó que passou');
  assert.ok(factory.dryer.powderKg>0);assert.equal(factory.board.active?.status,'running','ainda falta ensacar o pó');
  factory.dryer.powderKg=0;factory.tick(.5);factory.tick(.5);
  assert.equal(factory.board.active,null);assert.equal(factory.dirt.required,true);assert.equal(factory.board.history.at(-1)?.result,'completed');
  for(const level of Object.values(factory.dirt.levels))assert.ok(level>=.7);assert.equal(factory.eff.recipe.malteBags,8,'a receita volta à da fábrica');
  void bags;
  // Nothing new starts until every place is clean; the dryer's wash is its own cycle, the rest are timed tasks completed by the room.
  const next=factory.drawOffers('Dono')[0]!;factory.approveOffer(next.id,'Gerente');
  assert.throws(()=>factory.startProduction('Operador'),/Limpe a fábrica/);
  assert.match(factory.cleanProblem('dryer'),/Lavar o secador/);assert.equal(factory.cleanProblem('tank1'),'');
  for(const id of ['tank1','tank2','tank3','line','floor-tanques','floor-secador','floor-ensaque','floor-estoque','floor-doca'] as const){
    if(factory.cleanProblem(id))continue;
    factory.completeClean(id,'Operador');assert.equal(factory.dirt.levels[id],0);assert.match(factory.cleanProblem(id),/já está limpo/);
  }
  assert.equal(factory.dirt.required,true,'faltam o secador e a sala');
  factory.command('dryer.cool');for(let i=0;i<10;i++)factory.tick(1);assert.equal(factory.dryer.state,'PARADO');
  factory.command('dryer.clean');for(let i=0;i<10&&(factory.dryer.state as string)==='LIMPEZA';i++)factory.tick(1);assert.equal(factory.dirt.levels.dryer,0);
  factory.completeClean('floor-sala','Operador');
  assert.equal(factory.dirt.required,false);assert.equal(factory.tanks[0]!.state,'VAZIO','lavar o tanque o deixa pronto');
  factory.startProduction('Operador');assert.equal((factory.board.active as {status:string}|null)?.status,'running');
  // Cancelling is only for an approved order nobody started; closing early needs idle tanks.
  assert.throws(()=>factory.cancelApproved('Gerente'),/aprovada e ainda não iniciada/);factory.closeProduction('Gerente');assert.equal(factory.board.history.at(-1)?.result,'closed');assert.equal(factory.dirt.required,true);
});

test('o estado das ordens e da sujeira sobrevive ao reinício; o palete incompleto fecha com o que há',()=>{
  const factory=new FactoryDirector({markers,stock});factory.setOperators(1);runOrder(factory,2);factory.soil('floor-doca',.4);
  const saved=JSON.parse(JSON.stringify(factory.snapshot()));
  const again=new FactoryDirector({markers,stock});again.restore(saved,[]);
  assert.equal(again.board.active?.status,'running');assert.equal(again.board.active?.batches,2);assert.ok(again.dirt.levels['floor-doca']>.39);assert.equal(again.balance.recipe.malteBags,8,'a receita da fábrica não vira a da ordem');assert.equal(again.eff.recipe.malteBags,again.board.active?.malteBags);
  again.bagging={...again.bagging,palletBags:5,state:'AGUARDANDO_SACO'};
  again.command('pallet.close');assert.equal(again.slots.find(slot=>slot.marker==='Ponto_EB_PA_Ensaque')?.quantity,5);assert.equal(again.bagging.palletBags,0);
  again.command('pallet.store');assert.equal(again.slots.filter(slot=>slot.material==='PRODUTO').reduce((sum,slot)=>sum+slot.quantity,0),5);
});
