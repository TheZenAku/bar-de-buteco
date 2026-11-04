export class ApiError extends Error { constructor(message:string,public status:number){super(message);} }
/** Default wait for a response. Long uploads can pass a larger value. */
export const API_TIMEOUT_MS=30_000;
export async function api<T=Record<string,unknown>>(path:string,body?:unknown,method=body===undefined?'GET':'POST',timeoutMs=API_TIMEOUT_MS):Promise<T> {
  // One timer covers the request and the body read, so a stalled server cannot leave the caller pending forever.
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    let response:Response;
    try{
      response=await fetch(`/api${path}`,{method,credentials:'include',signal:controller.signal,headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    }catch(error){
      if(controller.signal.aborted) throw new ApiError('O servidor demorou para responder. Tente de novo.',0);
      throw error;
    }
    const data=await response.json().catch(()=>({error:'O servidor não respondeu como esperado.'}));
    if(!response.ok) throw new ApiError(data.error||'Não foi possível completar a solicitação.',response.status);
    return data as T;
  }finally{
    clearTimeout(timer);
  }
}
export function escape(value:unknown):string {return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));}
