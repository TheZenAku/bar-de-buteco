import { randomUUID } from 'node:crypto';
import { internalSecret } from '@bar/shared/tickets';
import type {InventoryStack} from '@bar/shared';
import { readWorldConfig } from './config.js';

export interface Access { valid: boolean; banned?:boolean; blocked: string[]; role: 'admin' | 'user';equippedSkin?:string;ownedSkins?:string[];inventory?:InventoryStack[];balance?:number }
export interface Control { id: string; action: 'kick' | 'ban' | 'unban' | 'event'; playerId?: string; eventType?: string; reason?: string;issuedAt?:number;expectedControlId?:string }

/** The API answered with an error status (4xx: the request itself was refused; 5xx: try again later). */
export class InternalApiError extends Error { constructor(readonly status: number, message: string, readonly requestId?: string) { super(message); } }

export async function internal<T>(path: string, body?: unknown): Promise<T> {
  // The same id appears in the API's log line for this request and in the world's log when it fails.
  const requestId = `world-${randomUUID()}`;
  const response = await fetch(`${readWorldConfig().apiInternalUrl}/api/internal/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': internalSecret(), 'x-request-id': requestId },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(4000),
  }).catch((error: unknown) => { throw Object.assign(new Error(`API interna inacessível: ${error instanceof Error ? error.message : String(error)}`), { requestId }); });
  // A refusal (4xx) carries the API's own message, shown to the player ("Moedas insuficientes.").
  if (!response.ok) {
    const refusal = response.status < 500 ? await response.json().then((body: { error?: unknown }) => typeof body.error === 'string' ? body.error : undefined).catch(() => undefined) : undefined;
    throw new InternalApiError(response.status, refusal ?? `API interna indisponível (${response.status}).`, requestId);
  }
  return response.json() as Promise<T>;
}

export function validateAccess(sessionId: string, userId: string): Promise<Access> {
  return internal<Access>('validate', { sessionId, userId });
}
