import {readMigrationConfig} from '../config.js';
import {migrateDatabase} from './index.js';

const config=readMigrationConfig();
const result=await migrateDatabase({
  url:config.url,
  path:config.path,
  migrationRole:config.role,
  migrationRuntimeRole:config.runtimeRole,
  migrationLockTimeoutMs:config.lockTimeoutMs,
});
console.log(result.applied.length?`Migrações aplicadas: ${result.applied.join(', ')}.`:`Schema já está atualizado (${result.alreadyApplied.length} migrações verificadas).`);
