// Video calls: the JPEG encoding of one frame, off the page's thread (frame-encoder.ts). The page hands over a bitmap cut
// from the game view; this draws it to an OffscreenCanvas and answers with the file's bytes.
// (No `lib: webworker` reference: it would retype the page's own globals for the whole project.)
interface Scope {onmessage:((event:MessageEvent<{id:number;bitmap:ImageBitmap;quality:number}>)=>void)|null;postMessage(message:unknown,transfer?:Transferable[]):void}
const scope=self as unknown as Scope;
let canvas:OffscreenCanvas|undefined,context:OffscreenCanvasRenderingContext2D|null=null;
scope.onmessage=async event=>{
  const {id,bitmap,quality}=event.data;
  try{
    if(!canvas||canvas.width!==bitmap.width||canvas.height!==bitmap.height){canvas=new OffscreenCanvas(bitmap.width,bitmap.height);context=canvas.getContext('2d');}
    if(!context)throw new Error('no 2d context');
    context.drawImage(bitmap,0,0);
    const blob=await canvas.convertToBlob({type:'image/jpeg',quality}),bytes=await blob.arrayBuffer();
    scope.postMessage({id,bytes},[bytes]);
  }catch{scope.postMessage({id,bytes:null});}
  finally{bitmap.close();}
};
