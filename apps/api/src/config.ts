import { config as dotenv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';
import { authSecret, internalSecret } from '@bar/shared/tickets';
import { repositoryRoot } from './database/index.js';

dotenv({ path: resolve(repositoryRoot, '.env'), quiet: true });
export interface ApiConfig {
  production: boolean; host: string; port: number; webOrigin: string; authSecret: string; internalSecret: string; trustProxyHops?: number;
  databaseUrl?: string; dataPath?: string; mailEnabled: boolean; autoVerifyEmail: boolean;
  smtpHost?: string; smtpPort: number; smtpUser?: string; smtpPassword?: string; mailFrom: string;
}
export interface MigrationConfig {url?:string;path?:string;role?:string;runtimeRole?:string;lockTimeoutMs:number}
// Numeric variables: empty means unset; anything else must be a valid integer or the API refuses to start.
const port = z.preprocess(value => value === '' ? undefined : value, z.coerce.number().int().min(1).max(65535).optional());
const migrationRoleName=z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/);
const numbers = z.object({ API_PORT: port, SMTP_PORT: port,
  TRUST_PROXY_HOPS: z.preprocess(value => value === '' ? undefined : value, z.coerce.number().int().min(0).max(10).optional()) });

function postgresUsername(value:string,variable:string):string{
  try{
    const parsed=new URL(value);
    if(parsed.protocol!=='postgres:'&&parsed.protocol!=='postgresql:')throw new Error('protocol');
    return decodeURIComponent(parsed.username);
  }catch{throw new Error(`${variable} deve ser uma URL PostgreSQL válida.`);}
}

function assertDatabaseIdentitiesSeparated(runtimeUrl?:string,migrationUrl?:string):void{
  if(!runtimeUrl||!migrationUrl)return;
  const runtimeUser=postgresUsername(runtimeUrl,'DATABASE_URL');
  const migrationUser=postgresUsername(migrationUrl,'MIGRATION_DATABASE_URL');
  if(runtimeUrl===migrationUrl||!runtimeUser||runtimeUser===migrationUser)
    throw new Error('DATABASE_URL e MIGRATION_DATABASE_URL devem usar usuários PostgreSQL diferentes.');
}

export function readConfig(): ApiConfig {
  const parsed = numbers.safeParse(process.env);
  if (!parsed.success) throw new Error(`Configuração da API inválida: ${parsed.error.issues.map(issue => `${issue.path.join('.')} (${issue.message})`).join('; ')}`);
  const production = process.env.NODE_ENV === 'production';
  const databaseUrl = process.env.DATABASE_URL || undefined;
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  if (production && !databaseUrl) throw new Error('DATABASE_URL é obrigatório em produção.');
  if(production)assertDatabaseIdentitiesSeparated(databaseUrl,process.env.MIGRATION_DATABASE_URL);
  if (production && (!process.env.SMTP_HOST || !webOrigin.startsWith('https://'))) throw new Error('Produção exige SMTP_HOST e WEB_ORIGIN HTTPS.');
  return {
    production, host: process.env.API_HOST ?? '127.0.0.1', port: parsed.data.API_PORT ?? 3001,
    webOrigin, authSecret: authSecret(), internalSecret: internalSecret(), databaseUrl, dataPath: process.env.DATA_PATH || undefined,
    trustProxyHops: parsed.data.TRUST_PROXY_HOPS ?? 0,
    mailEnabled: !production && process.env.DEV_MAILBOX !== 'false',
    autoVerifyEmail: process.env.AUTO_VERIFY_EMAIL === undefined ? !production : process.env.AUTO_VERIFY_EMAIL === 'true',
    smtpHost: process.env.SMTP_HOST, smtpPort: parsed.data.SMTP_PORT ?? 1025,
    smtpUser: process.env.SMTP_USER, smtpPassword: process.env.SMTP_PASSWORD,
    mailFrom: process.env.MAIL_FROM ?? 'B.A.R. <bar@localhost>',
  };
}

/** Minimal config for the one-shot migrator; it deliberately does not require SMTP or application secrets. */
export function readMigrationConfig(env:NodeJS.ProcessEnv=process.env):MigrationConfig{
  const production=env.NODE_ENV==='production';
  const url=env.MIGRATION_DATABASE_URL||(!production?env.DATABASE_URL:undefined)||undefined;
  if(production&&!url)throw new Error('MIGRATION_DATABASE_URL é obrigatório para migrações em produção.');
  if(production)assertDatabaseIdentitiesSeparated(env.DATABASE_URL,url);
  const timeout=z.preprocess(value=>value===''?undefined:value,z.coerce.number().int().min(1).max(300_000).default(30_000)).safeParse(env.MIGRATION_LOCK_TIMEOUT_MS);
  if(!timeout.success)throw new Error(`MIGRATION_LOCK_TIMEOUT_MS inválido: ${timeout.error.issues.map(issue=>issue.message).join('; ')}`);
  const role=env.MIGRATION_ROLE||(production?'bar_owner':undefined);
  const runtimeRole=env.MIGRATION_RUNTIME_ROLE||(production?'bar_runtime':undefined);
  if(role&&!migrationRoleName.safeParse(role).success)throw new Error('MIGRATION_ROLE inválido.');
  if(runtimeRole&&!migrationRoleName.safeParse(runtimeRole).success)throw new Error('MIGRATION_RUNTIME_ROLE inválido.');
  if(role&&runtimeRole&&role===runtimeRole)throw new Error('MIGRATION_ROLE e MIGRATION_RUNTIME_ROLE devem ser diferentes.');
  return {
    url,
    path:env.DATA_PATH||undefined,
    role,
    runtimeRole,
    lockTimeoutMs:timeout.data,
  };
}
