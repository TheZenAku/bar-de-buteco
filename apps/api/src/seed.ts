import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { readConfig } from './config.js';
import { connectDatabase } from './database/index.js';
import { users, profiles, statistics } from './database/schema.js';
import { hashPassword } from './auth/service.js';
import {SKINS} from '@bar/shared';
import {skinInventory} from './database/schema.js';

const config = readConfig();
if (config.production) throw new Error('Contas de demonstração não podem ser criadas em produção.');
const connection = await connectDatabase({ url: config.databaseUrl, path: config.dataPath });
const password = process.env.DEMO_PASSWORD || 'ButecoDemo2026!';
try {
  const passwordHash = await hashPassword(password);
  for (const account of [
    { username: 'admin', email: 'admin@bar.local', displayName: 'Dona do Bar', role: 'admin', color: '#d4aa56' },
    { username: 'jogador1', email: 'jogador1@bar.local', displayName: 'Chico', role: 'player', color: '#cf7549' },
    { username: 'jogador2', email: 'jogador2@bar.local', displayName: 'Bia', role: 'player', color: '#579a9b' },
  ]) {
    const [existing] = await connection.db.select().from(users).where(eq(users.email, account.email));
    if (existing) {
      for(const skin of SKINS)await connection.db.insert(skinInventory).values({userId:existing.id,skinId:skin.id}).onConflictDoNothing();
      console.log(`Conta de demonstração existente: ${account.email} (coleção de teste preparada)`);continue;
    }
    await connection.db.transaction(async (tx) => {
      const id = randomUUID();
      await tx.insert(users).values({ id, email: account.email, username: account.username, role: account.role, verified: true, passwordHash });
      await tx.insert(profiles).values({ userId: id, displayName: account.displayName, avatarConfig: { color: account.color } });
      for(const skin of SKINS)await tx.insert(skinInventory).values({userId:id,skinId:skin.id});
      await tx.insert(statistics).values({ userId: id });
    });
    console.log(`Conta de desenvolvimento criada: ${account.email}`);
  }
  console.log('Senha definida por DEMO_PASSWORD ou pela senha de demonstração documentada.');
} finally { await connection.close(); }
