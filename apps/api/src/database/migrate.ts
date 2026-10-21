import { readConfig } from '../config.js';
import { connectDatabase } from './index.js';
const config = readConfig();
const connection = await connectDatabase({ url: config.databaseUrl, path: config.dataPath });
console.log(`Migrações aplicadas (${connection.driver}).`);
await connection.close();
