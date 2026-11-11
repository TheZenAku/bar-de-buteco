import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FactoryDirector} from '../../apps/server/src/world/factory/index.js';

const folder=fileURLToPath(new URL('../../apps/server/data/factory/',import.meta.url));
const markers=JSON.parse(fs.readFileSync(path.join(folder,'empresa_brasil_marcadores.json'),'utf8'));
const stock=JSON.parse(fs.readFileSync(path.join(folder,'empresa_brasil_estoque.json'),'utf8'));
const factory=new FactoryDirector({markers,stock});
factory.setOperators(6);
factory.tanks[0]={...factory.tanks[0]!,state:'DISSOLVENDO',agitatorRpm:120};
factory.tanks[1]={...factory.tanks[1]!,state:'HOMOGENEIZANDO',agitatorRpm:90};
factory.slots[0]!.reservedBy='truck-a';factory.slots[1]!.reservedBy='truck-b';

const samples:number[]=[];
for(let i=0;i<2400;i++){
  const started=performance.now();factory.tick(.25);samples.push(performance.now()-started);
}
samples.sort((a,b)=>a-b);
const at=(fraction:number)=>samples[Math.min(samples.length-1,Math.floor(samples.length*fraction))]!;
const result={
  simulatedMinutes:10,operators:6,logisticFlows:2,ticks:samples.length,
  tickMs:{average:samples.reduce((sum,value)=>sum+value,0)/samples.length,p50:at(.5),p95:at(.95),maximum:samples.at(-1)},
  revision:factory.snapshot().revision,reservations:factory.slots.filter(slot=>slot.reservedBy).length,
};
console.log(JSON.stringify(result,null,2));
