import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export function replaceIfChanged(source,target,stage){
  if(fs.existsSync(target)&&fs.readFileSync(source).equals(fs.readFileSync(target)))return false;
  fs.mkdirSync(path.dirname(target),{recursive:true});
  // Keep temporary files outside Vite/tsx watched directories. On Windows a
  // watcher can crash with EBUSY while trying to follow a just-renamed temp file.
  const directory=path.join(stage,'publicacao');fs.mkdirSync(directory,{recursive:true});
  const temporary=path.join(directory,`${randomUUID()}.tmp`);
  fs.copyFileSync(source,temporary);fs.renameSync(temporary,target);return true;
}
