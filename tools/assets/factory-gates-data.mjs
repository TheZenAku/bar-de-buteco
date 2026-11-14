// EMPRESA BRASIL: as folhas dinamicas (portao de correr, porta automatica, portas de impacto, portas manuais, portao de enrolar) e o interfone.
// Le empresa_brasil_portoes.json (v2, v6.8) e escreve packages/shared/src/factory/gates-data.json: o servidor decide abrir/fechar e a colisao
// vive no shared (cliente e servidor precisam da mesma caixa). Rodado sozinho (node tools/assets/factory-gates-data.mjs) so regrava esse arquivo;
// o import-factory.mjs chama o mesmo codigo ao publicar, e valida o JSON dos portoes. Nao ha lista fixa de folhas: vale o que o JSON descreve.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
export const GATES_DATA_FILE=path.join(root,'packages/shared/src/factory/gates-data.json');
const KINDS=['correr','giratoria','enrolar'],MODES=['interfone','automatica','impacto','manual'];

const triple=(value,label)=>{
  if(!Array.isArray(value)||value.length!==3||value.some(n=>typeof n!=='number'||!Number.isFinite(n)))throw new Error(`Portões: ${label} precisa ser [x,y,z].`);
  return value;
};
const positive=(value,label)=>{
  if(typeof value!=='number'||!(value>0))throw new Error(`Portões: ${label} precisa ser um número positivo.`);
  return value;
};
const number=(value,label)=>{
  if(typeof value!=='number'||!Number.isFinite(value))throw new Error(`Portões: ${label} precisa ser um número.`);
  return value;
};

/** Valida o JSON dos portoes (v2) e devolve os dados que o jogo usa. */
export function buildGatesData(portoes){
  if(!Array.isArray(portoes.folhas)||!portoes.folhas.length)throw new Error('Portões: o JSON não descreve nenhuma folha.');
  const boxes=portoes.colisoes_dinamicas??[],used=new Set(),gates=[];
  for(const leaf of portoes.folhas){
    const node=leaf.no;
    if(typeof node!=='string'||!node)throw new Error('Portões: uma folha sem nome do nó.');
    if(gates.some(gate=>gate.id===node))throw new Error(`Portões: ${node} aparece duas vezes.`);
    if(!KINDS.includes(leaf.tipo))throw new Error(`Portões: ${node} tem tipo "${leaf.tipo}" (esperado ${KINDS.join(', ')}).`);
    if(!MODES.includes(leaf.modo))throw new Error(`Portões: ${node} tem modo "${leaf.modo}" (esperado ${MODES.join(', ')}).`);
    if(leaf.posicao_repouso!=='FECHADO')throw new Error(`Portões: ${node} precisa ser exportado FECHADO.`);
    const box=boxes.find(item=>item.nome===leaf.colisor);
    if(!box)throw new Error(`Portões: falta a colisão dinâmica ${leaf.colisor} de ${node}.`);
    if(used.has(box.nome))throw new Error(`Portões: a caixa ${box.nome} é de mais de uma folha.`);
    used.add(box.nome);
    const min=triple(box.min_jogo,`${box.nome}.min_jogo`),max=triple(box.max_jogo,`${box.nome}.max_jogo`);
    for(let axis=0;axis<3;axis++)if(!(max[axis]>min[axis]))throw new Error(`Portões: a caixa ${box.nome} está invertida.`);
    const gate={
      id:node,kind:leaf.tipo,mode:leaf.modo,origin:triple(leaf.origem_jogo_xyz,`${node}.origem_jogo_xyz`),
      radius:positive(leaf.raio_m,`${node}.raio_m`),seconds:positive(leaf.segundos,`${node}.segundos`),box:{min,max},
    };
    if(leaf.tipo==='correr'){
      const axis=triple(leaf.eixo_deslize_jogo,`${node}.eixo_deslize_jogo`);
      if(Math.abs(Math.hypot(...axis)-1)>1e-6)throw new Error(`Portões: o eixo de ${node} não é unitário.`);
      Object.assign(gate,{axis,travel:positive(leaf.curso_m,`${node}.curso_m`),lead:leaf.antecipacao_m??0});
    }else if(leaf.tipo==='giratoria'){
      const closed=number(leaf.angulo_fechada_graus,`${node}.angulo_fechada_graus`),open=number(leaf.angulo_aberta_graus,`${node}.angulo_aberta_graus`);
      if(closed!==0)throw new Error(`Portões: ${node} precisa partir do ângulo 0 (o nó é exportado fechado, sem rotação).`);
      if(open===0||Math.abs(open)>180)throw new Error(`Portões: o ângulo aberto de ${node} precisa estar entre -180 e 180 (e não ser 0).`);
      Object.assign(gate,{angle:open,swing:!!leaf.vai_e_vem});
    }else{
      if(leaf.origem_no_topo!==true)throw new Error(`Portões: ${node} (enrolar) precisa ter a origem no topo da folha.`);
      const scale=number(leaf.escala_aberta,`${node}.escala_aberta`);
      if(!(scale>=0&&scale<1))throw new Error(`Portões: a escala aberta de ${node} precisa estar entre 0 e 1.`);
      Object.assign(gate,{travel:positive(leaf.curso_m,`${node}.curso_m`),openScale:scale});
    }
    gates.push(gate);
  }
  if(boxes.length!==gates.length)throw new Error(`Portões: eram esperadas ${gates.length} caixas de colisão dinâmicas (uma por folha), vieram ${boxes.length}.`);
  const marker=portoes.interfone?.marcador??'Ponto_EB_Interfone',bell=portoes.marcadores_novos?.marcadores?.[marker];
  if(!bell)throw new Error(`Portões: falta o marcador ${marker}.`);
  const [x,y,z]=triple(bell.xyz_jogo,`${marker}.xyz_jogo`);
  const interfone={marker,pole:portoes.interfone?.no_poste??'EB_Interfone',lamp:portoes.interfone?.no_lampada??'EB_Interfone_Lampada',x,y,z,reach:positive(bell.extras?.alcance_m,`${marker}.extras.alcance_m`)};
  return {gates,interfone};
}

export function writeGatesData(portoes){
  const data=buildGatesData(portoes);
  const text=`${JSON.stringify(data,null,1)}\n`;
  if(!fs.existsSync(GATES_DATA_FILE)||fs.readFileSync(GATES_DATA_FILE,'utf8')!==text){
    const temp=`${GATES_DATA_FILE}.tmp`;fs.writeFileSync(temp,text);fs.renameSync(temp,GATES_DATA_FILE);
  }
  return data;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const source=path.join(root,'assets-bar/map/BarBoteco/export/empresa_brasil/empresa_brasil_portoes.json');
  const data=writeGatesData(JSON.parse(fs.readFileSync(source,'utf8')));
  console.log(`Portões: ${data.gates.length} folhas e o interfone gravados em ${path.relative(root,GATES_DATA_FILE)}.`);
}
