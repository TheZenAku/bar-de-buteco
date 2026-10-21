import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { readConfig } from './config.js';
import { connectDatabase } from './database/index.js';
import { moderationActions, users } from './database/schema.js';

const index = process.argv.indexOf('--email');
const email = index >= 0 ? process.argv[index + 1]?.trim().toLowerCase() : undefined;
if (!email) throw new Error('Informe a conta existente: npm run admin -w @bar/api -- --email pessoa@exemplo.com');
const config = readConfig();
const connection = await connectDatabase({ url: config.databaseUrl, path: config.dataPath });
try {
  const [user] = await connection.db.select().from(users).where(eq(users.email, email));
  if (!user?.verified) throw new Error('A conta precisa existir e ter e-mail confirmado.');
  await connection.db.transaction(async (tx) => {
    await tx.update(users).set({ role: 'admin' }).where(eq(users.id, user.id));
    await tx.insert(moderationActions).values({ id: randomUUID(), actorId: user.id, userId: user.id, action: 'admin-grant', reason: 'Permissão concedida explicitamente pelo operador via CLI.' });
  });
  console.log(`Permissão administrativa concedida a ${email}.`);
} finally { await connection.close(); }
