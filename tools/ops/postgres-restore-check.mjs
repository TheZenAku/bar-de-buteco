#!/usr/bin/env node
import {relative} from 'node:path';
import {parseArguments,repositoryRoot,verifyPostgresRestore} from './postgres-backup-lib.mjs';

try{
  const args=parseArguments(process.argv.slice(2));
  if(!args.input)throw new Error('Informe --input .local/backups/<arquivo>.dump.');
  const result=verifyPostgresRestore({input:args.input,envFile:args.envfile});
  console.log(`Restore verificado e banco temporário removido: ${relative(repositoryRoot,result.path)}`);
  console.log(`SHA-256: ${result.digest}`);
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
