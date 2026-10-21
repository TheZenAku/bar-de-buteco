import { config as dotenv } from 'dotenv';
import { resolve } from 'node:path';
import { authSecret } from '@bar/shared/tickets';
import { repositoryRoot } from './database/index.js';

dotenv({ path: resolve(repositoryRoot, '.env'), quiet: true });
export interface ApiConfig {
  production: boolean; host: string; port: number; webOrigin: string; authSecret: string; trustProxyHops?: number;
  databaseUrl?: string; dataPath?: string; mailEnabled: boolean; autoVerifyEmail: boolean;
  smtpHost?: string; smtpPort: number; smtpUser?: string; smtpPassword?: string; mailFrom: string;
}
export function readConfig(): ApiConfig {
  const production = process.env.NODE_ENV === 'production';
  const databaseUrl = process.env.DATABASE_URL || undefined;
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  if (production && !databaseUrl) throw new Error('DATABASE_URL é obrigatório em produção.');
  if (production && (!process.env.SMTP_HOST || !webOrigin.startsWith('https://'))) throw new Error('Produção exige SMTP_HOST e WEB_ORIGIN HTTPS.');
  return {
    production, host: process.env.API_HOST ?? '127.0.0.1', port: Number(process.env.API_PORT ?? 3001),
    webOrigin, authSecret: authSecret(), databaseUrl, dataPath: process.env.DATA_PATH || undefined,
    trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 0),
    mailEnabled: !production && process.env.DEV_MAILBOX !== 'false',
    autoVerifyEmail: process.env.AUTO_VERIFY_EMAIL === undefined ? !production : process.env.AUTO_VERIFY_EMAIL === 'true',
    smtpHost: process.env.SMTP_HOST, smtpPort: Number(process.env.SMTP_PORT ?? 1025),
    smtpUser: process.env.SMTP_USER, smtpPassword: process.env.SMTP_PASSWORD,
    mailFrom: process.env.MAIL_FROM ?? 'B.A.R. <bar@localhost>',
  };
}
