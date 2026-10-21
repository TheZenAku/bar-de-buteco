import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
export interface GameTicket { userId:string; sessionId:string; displayName:string; color:string; role:'user'|'admin'; exp:number; nonce:string }
export function authSecret():string {
  const secret=process.env.AUTH_SECRET;
  if(process.env.NODE_ENV==='production'&&(!secret||secret.length<32||/(local-development|replace_with|change-me)/i.test(secret))) throw new Error('AUTH_SECRET seguro é obrigatório em produção.');
  return secret||'local-development-only-change-before-deploying';
}
export function signTicket(claims:Omit<GameTicket,'exp'|'nonce'>,secret=authSecret()):string {
  const payload=Buffer.from(JSON.stringify({...claims,exp:Date.now()+60000,nonce:randomBytes(18).toString('hex')})).toString('base64url');
  return `${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`;
}
export function verifyTicket(token:string,secret=authSecret()):GameTicket {
  if(typeof token!=='string'||token.length>4096) throw new Error('Ticket inválido.');
  const parts=token.split('.');
  if(parts.length!==2) throw new Error('Ticket inválido.');
  const [payload,signature]=parts;
  const expected=createHmac('sha256',secret).update(payload).digest();
  const actual=Buffer.from(signature,'base64url');
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual)) throw new Error('Ticket inválido.');
  const value=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')) as GameTicket;
  if(!value.userId||!value.sessionId||!value.nonce||!Number.isFinite(value.exp)||value.exp<Date.now()||value.exp>Date.now()+65000) throw new Error('Ticket expirado.');
  return value;
}
