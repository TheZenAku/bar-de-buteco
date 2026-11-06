/**
 * Video calls: turns the bitmap cut from the game view into a JPEG without stalling the game. The encoding runs in a worker
 * (frame-worker.ts); where a browser has no OffscreenCanvas in workers, it falls back to a canvas on the page's thread.
 */
export interface FrameEncoder {
  /** The JPEG of `bitmap` (which is consumed), or null if it could not be encoded. */
  encode(bitmap:ImageBitmap,quality:number):Promise<Uint8Array|null>;
  close():void;
}

export function createFrameEncoder():FrameEncoder {
  let worker:Worker|undefined,failed=false,next=0;
  const waiting=new Map<number,(bytes:Uint8Array|null)=>void>();
  let fallback:HTMLCanvasElement|undefined;
  function stop():void {worker?.terminate();worker=undefined;for(const resolve of waiting.values())resolve(null);waiting.clear();}
  function fail():void {failed=true;stop();}
  function start():Worker|undefined {
    if(worker||failed)return worker;
    if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'){failed=true;return undefined;}
    try{
      worker=new Worker(new URL('./frame-worker.ts',import.meta.url),{type:'module'});
      worker.onmessage=event=>{if(!event.data.bytes){fail();return;}const resolve=waiting.get(event.data.id);waiting.delete(event.data.id);resolve?.(new Uint8Array(event.data.bytes));};
      worker.onerror=fail;worker.onmessageerror=fail;
    }catch{failed=true;worker=undefined;}
    return worker;
  }
  async function onThread(bitmap:ImageBitmap,quality:number):Promise<Uint8Array|null> {
    fallback??=document.createElement('canvas');
    if(fallback.width!==bitmap.width||fallback.height!==bitmap.height){fallback.width=bitmap.width;fallback.height=bitmap.height;}
    try{const context=fallback.getContext('2d');if(!context)return null;context.drawImage(bitmap,0,0);}finally{bitmap.close();}
    const blob=await new Promise<Blob|null>(resolve=>{
      const timeout=setTimeout(()=>resolve(null),1500);
      fallback!.toBlob(blob=>{clearTimeout(timeout);resolve(blob);},'image/jpeg',quality);
    });
    return blob?new Uint8Array(await blob.arrayBuffer()):null;
  }
  return {
    async encode(bitmap,quality){
      const active=start();
      if(!active)return onThread(bitmap,quality);
      const id=++next;
      return new Promise(resolve=>{
        // A suspended or broken worker must not leave the camera waiting forever.
        const timeout=setTimeout(fail,1500);
        waiting.set(id,bytes=>{clearTimeout(timeout);resolve(bytes);});
        try{active.postMessage({id,bitmap,quality},[bitmap]);}catch{bitmap.close();fail();}
      });
    },
    close:stop,
  };
}
