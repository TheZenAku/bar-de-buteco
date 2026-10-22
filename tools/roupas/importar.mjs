import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {discoverClothing,publicCatalog} from './catalogo.mjs';
import {validateClothingBuild} from './validacao.mjs';
import {replaceIfChanged} from './publicacao.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const args=new Set(process.argv.slice(2));
for(const flag of args)if(!['--listar','--validar','--sem-pausa'].includes(flag))throw new Error(`Opção desconhecida: ${flag}`);
const local=path.join(root,'.local/roupas');fs.mkdirSync(local,{recursive:true});
const lock=path.join(local,'import.lock');let locked=false,stage,published=false,plan=[],log;
const say=message=>{console.log(message);if(log)fs.appendFileSync(log,message+'\n');};
const run=(file,parameters=[],env={})=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[file,...parameters],{cwd:root,env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{process.stdout.write(data);if(log)fs.appendFileSync(log,data);});
  child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`${path.basename(file)} terminou com código ${code}.`)));
});
const files=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(directory,entry.name)):[path.join(directory,entry.name)]);
const replace=(source,target)=>replaceIfChanged(source,target,stage);
try{
  const catalog=discoverClothing(root);
  for(const item of catalog)say(`${item.slot.padEnd(10)} ${item.name.padEnd(18)} ${item.source}`);
  if(args.has('--listar'))process.exit(0);
  if(fs.existsSync(lock)){
    const previous=JSON.parse(fs.readFileSync(lock,'utf8'));let alive=true;try{process.kill(previous.pid,0);}catch{alive=false;}
    if(alive)throw new Error(`Já existe uma importação em andamento (PID ${previous.pid}).`);
    fs.unlinkSync(lock);
  }
  fs.writeFileSync(lock,JSON.stringify({pid:process.pid}),{flag:'wx'});locked=true;
  stage=path.join(local,new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8));fs.mkdirSync(stage);
  log=path.join(stage,'importacao.log');
  const env={BAR_CHARACTER_OUTPUT:path.join(stage,'characters'),BAR_ANIMATION_OUTPUT:path.join(stage,'animations'),BAR_PROP_OUTPUT:path.join(stage,'props')};
  say('\nConvertendo os modelos e vinculando as peças ao esqueleto...');
  await run(path.join(root,'tools/import-characters.mjs'),[],env);
  await run(path.join(root,'tools/convert-animations.mjs'),['base-male','base-female'],env);
  validateClothingBuild(stage,catalog,root);
  fs.writeFileSync(path.join(stage,'catalogo.json'),JSON.stringify(publicCatalog(catalog),null,2)+'\n');
  if(args.has('--validar'))say(`\nValidação concluída. O jogo não foi alterado. Relatório: ${stage}`);
  else{
    const destinations=[...files(env.BAR_CHARACTER_OUTPUT).map(source=>({source,target:path.join(root,'apps/web/public/characters',path.relative(env.BAR_CHARACTER_OUTPUT,source))})),
      ...['base-male','base-female'].map(id=>({source:path.join(env.BAR_ANIMATION_OUTPUT,`${id}.glb`),target:path.join(root,'apps/web/public/animations',`${id}.glb`)})),
      ...files(env.BAR_PROP_OUTPUT).map(source=>({source,target:path.join(root,'apps/web/public/props',path.relative(env.BAR_PROP_OUTPUT,source))})),
      {source:path.join(stage,'catalogo.json'),target:path.join(root,'packages/shared/src/clothing-catalog.json')}];
    for(const [index,item] of destinations.entries()){
      const exists=fs.existsSync(item.target),backup=path.join(stage,'backup',String(index));fs.mkdirSync(path.dirname(backup),{recursive:true});
      if(exists)fs.copyFileSync(item.target,backup);plan.push({...item,exists,backup});
    }
    fs.writeFileSync(path.join(stage,'backup.json'),JSON.stringify(plan,null,2));
    say('\nInstalando modelos, animações e catálogo...');published=true;
    // Publish the shared catalog last, after its models and banks are available.
    for(const item of plan)replace(item.source,item.target);
    const npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
    if(!fs.existsSync(npm))throw new Error('npm não encontrado junto do Node.js. Execute usando npm run assets:characters na raiz.');
    await run(npm,['run','build']);
    say(`\nPronto: ${catalog.length} peças instaladas. Abra C → Personalizar.\nBackup e relatório: ${stage}`);
    fs.writeFileSync(path.join(local,'ultima-importacao.json'),JSON.stringify({stage,catalog:publicCatalog(catalog),completedAt:new Date().toISOString()},null,2));
  }
}catch(error){
  if(published){for(const item of plan){if(item.exists)replace(item.backup,item.target);else if(fs.existsSync(item.target))fs.unlinkSync(item.target);}say('Os modelos, animações e catálogo foram restaurados para a versão anterior.');}
  say(`ERRO: ${error.message}`);if(stage)say(`Detalhes: ${stage}`);process.exitCode=1;
}finally{if(locked)fs.unlinkSync(lock);}
