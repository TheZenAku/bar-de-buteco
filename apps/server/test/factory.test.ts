import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FactoryDirector,validateFactoryAssets} from '../src/world/factory/index.js';

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
  const factory=new FactoryDirector({markers,stock});factory.setOperators(1);factory.balance.timeScale=60;
  factory.command('tank1.water');factory.tick(1);assert.equal(factory.tanks[0]?.state,'AQUECENDO');factory.tick(3);assert.equal(factory.tanks[0]?.state,'AGUARDANDO_INSUMOS');factory.command('tank1.agitator');factory.command('tank1.lid');
  factory.setStock('Ponto_EB_Rack_V1N1P1',8);factory.setStock('Ponto_EB_Rack_V3N1P1',4);
  for(let i=0;i<8;i++)factory.pourBag(1,factory.takeBag('Ponto_EB_Rack_V1N1P1'));for(let i=0;i<4;i++)factory.pourBag(1,factory.takeBag('Ponto_EB_Rack_V3N1P1'));
  factory.tick(3);factory.tick(1);assert.equal(factory.tanks[0]?.state,'AGUARDANDO_QUALIDADE');factory.command('tank1.approve');factory.command('dryer.preheat');factory.tick(4);assert.equal(factory.dryer.state,'PRONTO');factory.command('dryer.feed','1');factory.tick(70);assert.equal(factory.dryer.state,'RESFRIANDO');assert.ok(factory.dryer.powderKg>250&&factory.dryer.powderKg<300);
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
