import { config as dotenv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';
import { authSecret } from '@bar/shared/tickets';
import { repositoryRoot } from './database/index.js';

dotenv({ path: resolve(repositoryRoot, '.env'), quiet: true });
export interface ApiConfig {
  production: boolean; host: string; port: number; webOrigin: string; authSecret: string; trustProxyHops?: number;
  databaseUrl?: string; dataPath?: string; mailEnabled: boolean; autoVerifyEmail: boolean;
  smtpHost?: string; smtpPort: number; smtpUser?: string; smtpPassword?: string; mailFrom: string;
}
// Numeric variables: empty means unset; anything else must be a valid integer or the API refuses to start.
const port = z.preprocess(value => value === '' ? undefined : value, z.coerce.number().int().min(1).max(65535).optional());
const numbers = z.object({ API_PORT: port, SMTP_PORT: port,
  TRUST_PROXY_HOPS: z.preprocess(value => value === '' ? undefined : value, z.coerce.number().int().min(0).max(10).optional()) });

export function readConfig(): ApiConfig {
  const parsed = numbers.safeParse(process.env);
  if (!parsed.success) throw new Error(`Configuração da API inválida: ${parsed.error.issues.map(issue => `${issue.path.join('.')} (${issue.message})`).join('; ')}`);
  const production = process.env.NODE_ENV === 'production';
  const databaseUrl = process.env.DATABASE_URL || undefined;
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  if (production && !databaseUrl) throw new Error('DATABASE_URL é obrigatório em produção.');
  if (production && (!process.env.SMTP_HOST || !webOrigin.startsWith('https://'))) throw new Error('Produção exige SMTP_HOST e WEB_ORIGIN HTTPS.');
  return {
    production, host: process.env.API_HOST ?? '127.0.0.1', port: parsed.data.API_PORT ?? 3001,
    webOrigin, authSecret: authSecret(), databaseUrl, dataPath: process.env.DATA_PATH || undefined,
    trustProxyHops: parsed.data.TRUST_PROXY_HOPS ?? 0,
    mailEnabled: !production && process.env.DEV_MAILBOX !== 'false',
    autoVerifyEmail: process.env.AUTO_VERIFY_EMAIL === undefined ? !production : process.env.AUTO_VERIFY_EMAIL === 'true',
    smtpHost: process.env.SMTP_HOST, smtpPort: parsed.data.SMTP_PORT ?? 1025,
    smtpUser: process.env.SMTP_USER, smtpPassword: process.env.SMTP_PASSWORD,
    mailFrom: process.env.MAIL_FROM ?? 'B.A.R. <bar@localhost>',
  };
}
