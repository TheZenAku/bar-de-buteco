import fs from 'node:fs';
import path from 'node:path';

const slots={Top:'top',Bottom:'bottom',Feet:'footwear',Face:'accessory'};
const names={tee:'Camiseta',sweater:'Suéter',pants:'Calça',trousers:'Calça social',sneakers:'Tênis',derby:'Sapato Derby',glasses:'Óculos'};
const reserved=new Set(['none','beard','brows-regular','brows-female','buzzed','buzzed-female','simple-parted','long','buns']);
export function discoverClothing(root){
  const directory=path.join(root,'assets-bar/Universal Base Characters[Standard]/Male-Cloth');
  const overrides=JSON.parse(fs.readFileSync(path.join(root,'tools/roupas/ajustes.json'),'utf8'));
  if(!overrides||typeof overrides!=='object'||Array.isArray(overrides))throw new Error('ajustes.json deve conter um objeto com ajustes por nome de arquivo.');
  for(const file of Object.keys(overrides))if(path.basename(file)!==file||!fs.existsSync(path.join(directory,file)))throw new Error(`Ajuste para arquivo ausente ou inválido: ${file}`);
  const entries=[],ids=new Set();
  for(const file of fs.readdirSync(directory).sort()){
    if(!file.toLowerCase().endsWith('.fbx'))continue;
    const match=/^(?:Cloth_Male_(Top|Bottom|Feet)|Acc_Male_(Face))_(.+)\.fbx$/i.exec(file);
    if(!match)throw new Error(`Nome não reconhecido: ${file}. Use Cloth_Male_Top_*, Cloth_Male_Bottom_*, Cloth_Male_Feet_* ou Acc_Male_Face_*.fbx.`);
    const config=overrides[file]??{};
    for(const key of Object.keys(config))if(!['id','name','scale','rotationY','maxDistance','coverage','roughness','metalness'].includes(key))throw new Error(`${file}: ajuste desconhecido ${key}.`);
    const id=config.id??match[3].toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    if(!/^[a-z][a-z0-9-]{0,47}$/.test(id)||reserved.has(id)||ids.has(id))throw new Error(`${file}: identificador inválido ou repetido: ${id}. Defina um id único em ajustes.json.`);
    ids.add(id);
    const category=Object.keys(slots).find(k=>k.toLowerCase()===(match[1]??match[2]).toLowerCase()),slot=slots[category];
    const name=config.name??names[id]??match[3].replaceAll('_',' ');
    if(typeof name!=='string'||name.length<1||name.length>64)throw new Error(`${file}: nome inválido.`);
    const entry={id,name,slot,source:file,scale:.01,rotationY:180,maxDistance:.06,coverage:slot!=='accessory',...config};
    for(const key of ['scale','rotationY','maxDistance','roughness','metalness'])if(entry[key]!==undefined&&(!Number.isFinite(entry[key])||(key!=='rotationY'&&entry[key]<0)))throw new Error(`${file}: ${key} inválido.`);
    if(!entry.scale||entry.maxDistance<=0||entry.maxDistance>.15||typeof entry.coverage!=='boolean')throw new Error(`${file}: escala, distância de encaixe ou cobertura inválida.`);
    for(const key of ['roughness','metalness'])if(entry[key]>1)throw new Error(`${file}: ${key} deve estar entre 0 e 1.`);
    entries.push(entry);
  }
  if(!entries.length)throw new Error('Nenhuma roupa FBX encontrada na pasta Male-Cloth.');
  const installedFile=path.join(root,'packages/shared/src/clothing-catalog.json');
  const installed=fs.existsSync(installedFile)?JSON.parse(fs.readFileSync(installedFile,'utf8')):[];
  for(const previous of installed){const current=entries.find(e=>e.id===previous.id);if(!current||current.slot!==previous.slot)throw new Error(`A peça já instalada "${previous.id}" foi removida, renomeada ou mudou de categoria. Restaure o arquivo/id para preservar os personagens salvos.`);}
  return entries;
}
export const publicCatalog=entries=>entries.map(({id,name,slot,source})=>({id,name,slot,source}));
