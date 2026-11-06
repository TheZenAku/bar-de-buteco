/** Decode one frame at a time, keeping only the newest waiting frame. A slow decoder never builds a video queue. */
export function createFrameReceiver<T extends {close():void}>(decode:(bytes:Uint8Array)=>Promise<T>,paint:(frame:T)=>void){
  let pending:Uint8Array|undefined,current:T|undefined,busy=false,generation=0;
  async function drain():Promise<void>{
    if(busy)return;
    busy=true;
    try{
      while(pending){
        const bytes=pending,epoch=generation;pending=undefined;
        try{
          const frame=await decode(bytes);
          if(epoch!==generation){frame.close();continue;}
          current?.close();current=frame;paint(frame);
        }catch{/* A damaged frame must not stop the next one. */}
      }
    }finally{busy=false;}
  }
  return {
    get current(){return current;},
    receive(bytes:Uint8Array):void {pending=bytes;void drain();},
    clear():void {generation++;pending=undefined;current?.close();current=undefined;},
  };
}
