import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {closeSync,existsSync,fsyncSync,linkSync,lstatSync,mkdirSync,openSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {basename,dirname,extname,isAbsolute,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const repositoryRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const backupRoot=resolve(repositoryRoot,'.local/backups');
const composeFile='infra/compose.yml';
const temporaryDatabasePattern=/^bar_restore_check_[0-9]{8}_[0-9]{6}_[a-f0-9]{12}$/;

function inside(parent,target){const rel=relative(parent,target);return rel===''||(!rel.startsWith('..')&&!isAbsolute(rel));}
function timestamp(date=new Date()){return date.toISOString().replace(/[-:]/g,'').replace('T','_').slice(0,15);}
function sqlIdentifier(value){return `"${value.replaceAll('"','""')}"`;}
function sqlLiteral(value){return `'${value.replaceAll("'","''")}'`;}

export function defaultBackupPath(date=new Date(),suffix=randomBytes(3).toString('hex')){
  return resolve(backupRoot,`bar-${timestamp(date)}-${suffix}.dump`);
}

export function resolveBackupPath(value,root=repositoryRoot){
  const allowed=resolve(root,'.local/backups');
  const target=resolve(root,value??relative(root,defaultBackupPath()));
  if(!inside(allowed,target)||extname(target).toLowerCase()!=='.dump'||basename(target).length<6)
    throw new Error('O backup deve ser um arquivo .dump dentro de .local/backups.');
  return target;
}

export function resolveEnvFile(value='.env.production',root=repositoryRoot){
  const target=resolve(root,value);
  if(!inside(root,target))throw new Error('O arquivo de ambiente deve ficar dentro do projeto.');
  if(!existsSync(target)||!lstatSync(target).isFile())throw new Error(`Arquivo de ambiente não encontrado: ${relative(root,target)}`);
  return target;
}

export function temporaryDatabaseName(date=new Date(),suffix=randomBytes(6).toString('hex')){
  return `bar_restore_check_${timestamp(date)}_${suffix}`;
}

export function assertTemporaryDatabaseName(name){
  if(!temporaryDatabasePattern.test(name))throw new Error('Nome inseguro para banco temporário de restore.');
  return name;
}

export function sha256(content){return createHash('sha256').update(content).digest('hex');}

export function systemExecutor(command,args,options={}){
  const result=spawnSync(command,args,{cwd:options.cwd??repositoryRoot,input:options.input,encoding:null,windowsHide:true,maxBuffer:1024*1024*1024});
  if(result.error)throw new Error(`Não foi possível executar ${command}: ${result.error.message}`);
  if(result.status!==0){
    const details=Buffer.from(result.stderr??[]).toString('utf8').trim();
    throw new Error(`${command} terminou com código ${result.status}${details?`: ${details}`:''}`);
  }
  return {stdout:Buffer.from(result.stdout??[]),stderr:Buffer.from(result.stderr??[])};
}

function dockerArgs(envFile,...command){return ['compose','--env-file',envFile,'-f',composeFile,'exec','-T','postgres',...command];}
function runDocker(run,envFile,command,input){return run('docker',dockerArgs(envFile,...command),{cwd:repositoryRoot,input}).stdout;}

function atomicWrite(path,content){
  const partial=`${path}.partial-${process.pid}-${randomBytes(4).toString('hex')}`;
  let descriptor;
  try{
    // Backups contain account data and password hashes. Start private regardless of the host's umask;
    // writeFileSync also completes partial low-level writes before the inode is published.
    descriptor=openSync(partial,'wx',0o600);writeFileSync(descriptor,content);fsyncSync(descriptor);closeSync(descriptor);descriptor=undefined;
    // A hard link publishes the fully flushed inode atomically and, unlike POSIX rename, never replaces a
    // destination created by another backup process between our exists check and publication.
    linkSync(partial,path);rmSync(partial);
  }finally{
    if(descriptor!==undefined)closeSync(descriptor);
    rmSync(partial,{force:true});
  }
}

export function createPostgresBackup({output,envFile='.env.production',run=systemExecutor,root=repositoryRoot}={}){
  const target=resolveBackupPath(output,root),checksumPath=`${target}.sha256`,resolvedEnv=resolveEnvFile(envFile,root);
  if(existsSync(target)||existsSync(checksumPath))throw new Error('O backup ou seu checksum já existe; nenhum arquivo será sobrescrito.');
  mkdirSync(dirname(target),{recursive:true});
  const envArgument=relative(root,resolvedEnv)||basename(resolvedEnv);
  const dump=runDocker(run,envArgument,['pg_dump','--username=bar','--dbname=bar','--format=custom','--no-owner','--no-privileges']);
  if(!dump.length)throw new Error('pg_dump retornou um arquivo vazio.');
  runDocker(run,envArgument,['pg_restore','--list'],dump);
  const digest=sha256(dump),checksum=Buffer.from(`${digest}  ${basename(target)}\n`);
  // Do not remove either destination if publication loses a race. A path that appeared after the
  // preflight check may belong to another backup process; leaving an orphan without a matching
  // checksum is safe because readVerifiedBackup refuses it, while deleting the winner is not.
  atomicWrite(target,dump);atomicWrite(checksumPath,checksum);
  return {path:target,checksumPath,digest,bytes:dump.length};
}

export function readVerifiedBackup(input,root=repositoryRoot){
  const path=resolveBackupPath(input,root),checksumPath=`${path}.sha256`;
  if(!existsSync(path)||!lstatSync(path).isFile())throw new Error('Arquivo de backup não encontrado ou inválido.');
  if(!existsSync(checksumPath)||!lstatSync(checksumPath).isFile())throw new Error('Checksum do backup não encontrado ou inválido.');
  const content=readFileSync(path),line=readFileSync(checksumPath,'utf8').trim();
  const match=/^([a-f0-9]{64})  ([^/\\]+)$/.exec(line);
  if(!match||match[2]!==basename(path)||match[1]!==sha256(content))throw new Error('Checksum do backup inválido; o restore foi recusado.');
  return {path,content,digest:match[1]};
}

export function verifyPostgresRestore({input,envFile='.env.production',run=systemExecutor,root=repositoryRoot,databaseName=temporaryDatabaseName()}={}){
  const backup=readVerifiedBackup(input,root),name=assertTemporaryDatabaseName(databaseName),resolvedEnv=resolveEnvFile(envFile,root);
  const envArgument=relative(root,resolvedEnv)||basename(resolvedEnv);
  runDocker(run,envArgument,['pg_restore','--list'],backup.content);
  const existsSql=`SELECT 1 FROM pg_database WHERE datname = ${sqlLiteral(name)};`;
  const existing=runDocker(run,envArgument,['psql','--username=bar','--dbname=postgres','--tuples-only','--no-align','--set=ON_ERROR_STOP=1','--command',existsSql]).toString('utf8').trim();
  if(existing)throw new Error('O nome temporário já existe; a verificação foi recusada sem remover nada.');
  let cleanupArmed=false,error;
  try{
    runDocker(run,envArgument,['psql','--username=bar','--dbname=postgres','--set=ON_ERROR_STOP=1','--command',`CREATE DATABASE ${sqlIdentifier(name)};`]);
    // Drop only after this exact CREATE returned success. A failed CREATE may mean another operator won a race;
    // in that case the database is not ours and must never be removed.
    cleanupArmed=true;
    runDocker(run,envArgument,['pg_restore','--username=bar','--dbname',name,'--no-owner','--no-privileges','--exit-on-error'],backup.content);
    const schemaSql="SELECT to_regclass('public.users') IS NOT NULL AND to_regclass('public.sessions') IS NOT NULL AND to_regclass('public.game_results') IS NOT NULL AND to_regclass('public.game_controls') IS NOT NULL;";
    const valid=runDocker(run,envArgument,['psql','--username=bar','--dbname',name,'--tuples-only','--no-align','--set=ON_ERROR_STOP=1','--command',schemaSql]).toString('utf8').trim();
    if(valid!=='t')throw new Error('O restore terminou, mas tabelas essenciais não foram encontradas.');
  }catch(caught){error=caught;}
  finally{
    if(cleanupArmed){
      try{runDocker(run,envArgument,['psql','--username=bar','--dbname=postgres','--set=ON_ERROR_STOP=1','--command',`DROP DATABASE IF EXISTS ${sqlIdentifier(name)} WITH (FORCE);`]);}
      catch(cleanupError){error=error?new AggregateError([error,cleanupError],'O restore falhou e o banco temporário também não pôde ser removido.'):cleanupError;}
    }
  }
  if(error)throw error;
  return {path:backup.path,digest:backup.digest,databaseName:name,verified:true};
}

export function parseArguments(argv){
  const options={};
  for(let index=0;index<argv.length;index++){
    const arg=argv[index];
    if(arg==='--output'||arg==='--input'||arg==='--env-file'){
      const value=argv[++index];if(!value||value.startsWith('--'))throw new Error(`Falta o valor de ${arg}.`);
      options[arg.slice(2).replace('-','')]=value;
    }else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  return options;
}
