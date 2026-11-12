import { createApi } from './app.js';

// The development watcher restarts this process after schema migrations.
const { app, config } = await createApi({ logger: true });
await app.listen({ host: config.host, port: config.port });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, async () => { await app.close(); process.exit(0); });
