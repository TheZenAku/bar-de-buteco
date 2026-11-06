import { hostname, tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { authSecret, internalSecret } from '@bar/shared/tickets';
import { BLACKJACK, MEDIA_PLATFORMS, MEDIA_PRICES, MUSICIANS, STAGE_PASS, type MediaPriceKind } from '@bar/shared';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
// An empty variable counts as unset, as before; anything else must be valid or the world refuses to start.
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(value => value === '' ? undefined : value, schema.optional());
const integer = optional(z.coerce.number().int());

const environmentSchema = z.object({
  GAME_PORT: optional(z.coerce.number().int().min(1).max(65535)),
  HOST: optional(z.string().min(1)),
  API_INTERNAL_URL: optional(z.url({ protocol: /^https?$/ })),
  ROOM_CAPACITY: integer, BAR_CAPACITY: integer,
  BLACKJACK_TURN_MS: integer, EVENT_MIN_MS: integer, EVENT_MAX_MS: integer,
  WORLD_OUTBOX_PATH: optional(z.string().min(1)),
  WORLD_INSTANCE_ID: optional(z.string().min(1).max(128)),
  PRICE_JUKEBOX: optional(z.coerce.number().int().min(0).max(10_000)),
  PRICE_TV: optional(z.coerce.number().int().min(0).max(10_000)),
  PRICE_TELAO: optional(z.coerce.number().int().min(0).max(10_000)),
  PRICE_STAGE: optional(z.coerce.number().int().min(0).max(10_000)),
  MUSICIAN_DROP_MS: optional(z.coerce.number().int().min(0).max(600_000)),
  /** YouTube's oEmbed endpoint, asked whether a video may play on other sites before it is queued; `off` skips the check. */
  YOUTUBE_OEMBED_URL: optional(z.union([z.literal('off'), z.url({ protocol: /^https?$/ })])),
  WEATHER_API_URL: optional(z.union([z.literal('off'), z.url({ protocol: /^https?$/ })])),
  MEDIA_PROVIDERS: optional(z.string().max(200)),
  /** How often each session is confirmed with the API, in ms (0: every maintenance round). */
  ACCESS_RECHECK_MS: optional(z.coerce.number().int().min(0).max(600_000)),
  /** How many world processes (bars) run behind the gateway on GAME_PORT; 1 is the single process as always. */
  WORLD_SHARDS: optional(z.coerce.number().int().min(1).max(32)),
  /** Set by the gateway on each world it starts: which one this process is. */
  WORLD_SHARD: optional(z.coerce.number().int().min(0).max(31)),
});

export interface WorldConfig {
  port: number; host: string; apiInternalUrl: string;
  /** Players per bar; 2–MAX_CAPACITY (1024: the crowd keeps each client to 32 models, see shared/crowd.ts). */
  capacity: number;
  blackjackTurnMs: number; eventMinMs: number; eventMaxMs: number;
  /** Durable local outbox for results the API has not confirmed yet (JSON lines). */
  outboxPath: string;
  /** The blackjack table's journal of bets and payments (minigames/blackjack-bank.ts), beside the outbox. */
  blackjackJournalPath: string;
  /** The pebolim tables' journal of stakes and payments (a GameBank, like blackjack's), beside the outbox. */
  foosballJournalPath: string;
  trucoJournalPath: string;
  poolJournalPath: string;
  /** Owner name of this process's leases on the API's control outbox. */
  instanceId: string;
  /** Coins per new video on the jukebox, a TV and the stage screen, and for a stage pass (packages/shared/src/economy.ts). */
  prices: Record<MediaPriceKind | 'stage', number>;
  /** How long a stage musician whose connection dropped keeps playing before the spot is given up (packages/shared/src/musicians.ts). */
  musicianDropMs: number;
  /** Where a video's embedding is checked before it is queued (apps/server/src/world/media-check.ts); '' skips the check. */
  videoCheckUrl: string;
  /** Open-Meteo-compatible current conditions endpoint; empty disables polling in isolated tests. */
  weatherUrl: string;
  /** The platforms whose links are accepted (MEDIA_PROVIDERS; every one by default). */
  mediaProviders: ReadonlySet<string>;
  /** How often each session is confirmed with the API (ACCESS_RECHECK_MS); bans and kicks do not wait for it. */
  accessRecheckMs: number;
  /** Worlds behind the gateway (WORLD_SHARDS) and, in a world the gateway started, its number (WORLD_SHARD; undefined when alone). */
  shards: number; shard: number | undefined;
}

/** Most people one bar takes. */
export const MAX_CAPACITY = 1024;

export class WorldConfigError extends Error {}

export function readWorldConfig(env: NodeJS.ProcessEnv = process.env): WorldConfig {
  const parsed = environmentSchema.safeParse(env);
  if (!parsed.success) throw new WorldConfigError(`Configuração do mundo inválida: ${parsed.error.issues.map(issue => `${issue.path.join('.')} (${issue.message})`).join('; ')}`);
  // Both processes fail before accepting traffic if production secrets are missing, weak or shared.
  try { authSecret(env); internalSecret(env); }
  catch (error) { throw new WorldConfigError(error instanceof Error ? error.message : 'Segredos inválidos.'); }
  const e = parsed.data, eventMinMs = Math.max(1000, e.EVENT_MIN_MS || 300_000);
  // Under `node --test` (NODE_TEST_CONTEXT) a room never writes to the development outbox.
  const outboxPath = e.WORLD_OUTBOX_PATH ? resolve(repositoryRoot, e.WORLD_OUTBOX_PATH)
    : env.NODE_TEST_CONTEXT ? join(tmpdir(), `bar-world-outbox-${process.pid}-${randomBytes(4).toString('hex')}.jsonl`)
    : resolve(repositoryRoot, '.data/world/outbox.jsonl');
  const shard = e.WORLD_SHARD;
  // Each world keeps its own outbox and journals (the other paths derive from this one).
  const worldOutbox = shard ? outboxPath.replace(/(\.jsonl)?$/, `.s${shard}$1`) : outboxPath;
  return {
    port: e.GAME_PORT ?? 2567,
    host: e.HOST ?? '0.0.0.0',
    apiInternalUrl: (e.API_INTERNAL_URL ?? 'http://127.0.0.1:3001').replace(/\/+$/, ''),
    capacity: Math.max(2, Math.min(MAX_CAPACITY, e.ROOM_CAPACITY || e.BAR_CAPACITY || 32)),
    blackjackTurnMs: Math.max(5000, e.BLACKJACK_TURN_MS || BLACKJACK.turnMs),
    eventMinMs, eventMaxMs: Math.max(eventMinMs, e.EVENT_MAX_MS || 600_000),
    outboxPath: worldOutbox, blackjackJournalPath: worldOutbox.replace(/(\.jsonl)?$/, '.blackjack.jsonl'), foosballJournalPath: worldOutbox.replace(/(\.jsonl)?$/, '.foosball.jsonl'), trucoJournalPath: worldOutbox.replace(/(\.jsonl)?$/, '.truco.jsonl'), poolJournalPath: worldOutbox.replace(/(\.jsonl)?$/, '.pool.jsonl'),
    prices: { jukebox: e.PRICE_JUKEBOX ?? MEDIA_PRICES.jukebox, tv: e.PRICE_TV ?? MEDIA_PRICES.tv, telao: e.PRICE_TELAO ?? MEDIA_PRICES.telao, stage: e.PRICE_STAGE ?? STAGE_PASS.price },
    musicianDropMs: e.MUSICIAN_DROP_MS ?? MUSICIANS.dropMs,
    // Under `node --test` the world never calls YouTube unless a test points it somewhere.
    videoCheckUrl: e.YOUTUBE_OEMBED_URL === 'off' ? '' : e.YOUTUBE_OEMBED_URL ?? (env.NODE_TEST_CONTEXT ? '' : 'https://www.youtube.com/oembed'),
    weatherUrl: e.WEATHER_API_URL === 'off' ? '' : e.WEATHER_API_URL ?? (env.NODE_TEST_CONTEXT || env.NODE_ENV === 'test' ? '' : 'https://api.open-meteo.com/v1/forecast'),
    mediaProviders: new Set(e.MEDIA_PROVIDERS ? e.MEDIA_PROVIDERS.split(',').map(provider => provider.trim()).filter(Boolean) : Object.keys(MEDIA_PLATFORMS)),
    accessRecheckMs: e.ACCESS_RECHECK_MS ?? 12_000,
    shards: e.WORLD_SHARDS ?? 1, shard,
    instanceId: e.WORLD_INSTANCE_ID ?? `${hostname()}${shard === undefined ? '' : `:s${shard}`}:${process.pid}:${randomBytes(3).toString('hex')}`,
  };
}
