#!/usr/bin/env node
import {relative} from 'node:path';
import {createPostgresBackup,parseArguments,repositoryRoot} from './postgres-backup-lib.mjs';

try{
  const args=parseArguments(process.argv.slice(2));
  const result=createPostgresBackup({output:args.output,envFile:args.envfile});
  console.log(`Backup criado: ${relative(repositoryRoot,result.path)} (${result.bytes} bytes)`);
  console.log(`SHA-256: ${result.digest}`);
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
