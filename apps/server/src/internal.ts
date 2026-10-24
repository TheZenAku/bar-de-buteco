import { authSecret } from '@bar/shared/tickets';
import type {CharacterConfig,InventoryStack} from '@bar/shared';

export interface Access { valid: boolean; banned?:boolean; blocked: string[]; role: 'admin' | 'user';character?:CharacterConfig|null;equippedSkin?:string;ownedSkins?:string[];inventory?:InventoryStack[] }
export interface Control { id: string; action: 'kick' | 'ban' | 'unban' | 'event'; playerId?: string; eventType?: string; reason?: string;issuedAt?:number;expectedControlId?:string }

export async function internal<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001'}/api/internal/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': authSecret() },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`API interna indisponível (${response.status}).`);
  return response.json() as Promise<T>;
}

export function validateAccess(sessionId: string, userId: string): Promise<Access> {
  return internal<Access>('validate', { sessionId, userId });
}
