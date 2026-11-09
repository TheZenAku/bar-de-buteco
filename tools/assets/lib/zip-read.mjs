// Reads files out of a .zip (stored or deflated) with Node alone: the asset tools keep the downloaded packs zipped in
// assets-bar and take what they need from them, so nothing has to be unpacked by hand.
import fs from 'node:fs';
import zlib from 'node:zlib';

/** Every file of the archive by its path inside it (folders left out), read lazily. */
export function readZip(file){
  const zip=fs.readFileSync(file);
  // The end of central directory record: the last 'PK\5\6' (a comment may follow it).
  let end=zip.length-22;while(end>=0&&zip.readUInt32LE(end)!==0x06054b50)end--;
  if(end<0)throw new Error(`${file}: não é um zip`);
  const count=zip.readUInt16LE(end+10);let at=zip.readUInt32LE(end+16);
  const entries=new Map();
  for(let i=0;i<count;i++){
    if(zip.readUInt32LE(at)!==0x02014b50)throw new Error(`${file}: diretório central inválido`);
    const method=zip.readUInt16LE(at+10),size=zip.readUInt32LE(at+20),nameLength=zip.readUInt16LE(at+28),extra=zip.readUInt16LE(at+30),comment=zip.readUInt16LE(at+32);
    const local=zip.readUInt32LE(at+42),name=zip.toString('utf8',at+46,at+46+nameLength);
    at+=46+nameLength+extra+comment;
    if(name.endsWith('/'))continue;
    entries.set(name,()=>{
      const start=local+30+zip.readUInt16LE(local+26)+zip.readUInt16LE(local+28),data=zip.subarray(start,start+size);
      if(method===0)return Buffer.from(data);
      if(method===8)return zlib.inflateRawSync(data);
      throw new Error(`${name}: compressão ${method} não suportada`);
    });
  }
  return {
    names:[...entries.keys()],
    /** The file at `name` (exact path, or the only one ending with it). */
    read(name){
      const exact=entries.get(name);if(exact)return exact();
      const found=[...entries.keys()].filter(key=>key.endsWith(name));
      if(found.length!==1)throw new Error(`${file}: ${found.length?'mais de um':'nenhum'} arquivo termina com ${name}`);
      return entries.get(found[0])();
    },
  };
}
