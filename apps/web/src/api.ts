export class ApiError extends Error { constructor(message:string,public status:number){super(message);} }
export async function api<T=Record<string,unknown>>(path:string,body?:unknown,method=body===undefined?'GET':'POST'):Promise<T> {
  const response=await fetch(`/api${path}`,{method,credentials:'include',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json().catch(()=>({error:'O servidor não respondeu como esperado.'}));
  if(!response.ok) throw new ApiError(data.error||'Não foi possível completar a solicitação.',response.status);
  return data as T;
}
export function escape(value:unknown):string {return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));}
