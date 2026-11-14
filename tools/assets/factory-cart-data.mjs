// EMPRESA BRASIL: o carrinho de plataforma (6 sacos). Le empresa_brasil_carrinho.json (v6.8) e escreve packages/shared/src/factory/cart-data.json:
// o servidor decide onde o carrinho esta e o que carrega, e o cliente (que pendura os sacos nos Slot_Saco_N do GLB) precisa dos mesmos numeros.
// Rodado sozinho (node tools/assets/factory-cart-data.mjs) so regrava esse arquivo; o import-factory.mjs chama o mesmo codigo ao publicar
// e confere o GLB (no EB_Carrinho + os Slot_Saco_N). O GLB nao muda de nome de nos entre exportacoes: o Blender acrescenta ".001" aos filhos.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
export const CART_DATA_FILE=path.join(root,'packages/shared/src/factory/cart-data.json');
const triple=(value,label)=>{
  if(!Array.isArray(value)||value.length!==3||value.some(n=>typeof n!=='number'||!Number.isFinite(n)))throw new Error(`Carrinho: ${label} precisa ser [x,y,z].`);
  return value;
};
const number=(value,label)=>{
  if(typeof value!=='number'||!Number.isFinite(value))throw new Error(`Carrinho: ${label} precisa ser um número.`);
  return value;
};

/** Valida o JSON do carrinho e devolve os dados que o jogo usa. */
export function buildCartData(carrinho){
  if(carrinho.no!=='EB_Carrinho')throw new Error(`Carrinho: o nó raiz precisa ser EB_Carrinho (veio "${carrinho.no}").`);
  const capacity=carrinho.capacidade_sacos;
  if(!Number.isInteger(capacity)||capacity<1)throw new Error('Carrinho: capacidade_sacos precisa ser um inteiro positivo.');
  if(!Array.isArray(carrinho.slots)||carrinho.slots.length!==capacity)throw new Error(`Carrinho: eram esperados ${capacity} slots de saco, vieram ${carrinho.slots?.length??0}.`);
  const slots=carrinho.slots.map((slot,index)=>{
    if(slot.no!==`Slot_Saco_${index+1}`)throw new Error(`Carrinho: o slot ${index+1} precisa se chamar Slot_Saco_${index+1} (veio "${slot.no}").`);
    const [x,y,z]=triple(slot.pos_local_jogo,`${slot.no}.pos_local_jogo`);
    return {node:slot.no,x,y,z,yawDeg:number(slot.yaw_graus,`${slot.no}.yaw_graus`)};
  });
  const deck=carrinho.caixa_conves_local_jogo,min=triple(deck?.min,'caixa_conves_local_jogo.min'),max=triple(deck?.max,'caixa_conves_local_jogo.max');
  for(let axis=0;axis<3;axis++)if(!(max[axis]>min[axis]))throw new Error('Carrinho: a caixa do convés está invertida.');
  const park=carrinho.estacionamento;
  if(park?.marcador!=='Ponto_EB_Carrinho')throw new Error('Carrinho: o estacionamento precisa ser o marcador Ponto_EB_Carrinho.');
  const [x,y,z]=triple(park.xyz_jogo,'estacionamento.xyz_jogo');
  return {
    capacity,park:{x,y,z,yawDeg:number(park.yaw_graus,'estacionamento.yaw_graus')},slots,deck:{min,max},
    handle:triple(carrinho.alca_local_jogo,'alca_local_jogo'),bag:triple(carrinho.saco_m,'saco_m'),loadedHeight:number(carrinho.altura_com_6_sacos_m,'altura_com_6_sacos_m'),
  };
}

/** Confere o GLB (um nó EB_Carrinho com os filhos Slot_Saco_N) contra o JSON. */
export function checkCartGlb(bytes,data){
  if(bytes.toString('ascii',0,4)!=='glTF')throw new Error('Carrinho: empresa_brasil_carrinho.glb precisa ser um GLB.');
  const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  if(!gltf.nodes.some(node=>node.name==='EB_Carrinho'))throw new Error('Carrinho: o GLB não tem o nó EB_Carrinho.');
  for(const slot of data.slots)if(!gltf.nodes.some(node=>node.name===slot.node||node.name.startsWith(`${slot.node}.`)))throw new Error(`Carrinho: o GLB não tem o nó ${slot.node}.`);
}

export function writeCartData(carrinho){
  const data=buildCartData(carrinho);
  const text=`${JSON.stringify(data,null,1)}\n`;
  if(!fs.existsSync(CART_DATA_FILE)||fs.readFileSync(CART_DATA_FILE,'utf8')!==text){
    const temp=`${CART_DATA_FILE}.tmp`;fs.writeFileSync(temp,text);fs.renameSync(temp,CART_DATA_FILE);
  }
  return data;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const source=path.join(root,'assets-bar/map/BarBoteco/export/empresa_brasil');
  const data=writeCartData(JSON.parse(fs.readFileSync(path.join(source,'empresa_brasil_carrinho.json'),'utf8')));
  checkCartGlb(fs.readFileSync(path.join(source,'empresa_brasil_carrinho.glb')),data);
  console.log(`Carrinho: ${data.capacity} slots gravados em ${path.relative(root,CART_DATA_FILE)}.`);
}
