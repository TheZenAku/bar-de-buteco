import type {Socket} from 'node:net';
import type {Plugin} from 'vite';

/**
 * The HTTPS dev server also answers plain http:// on the same port with a redirect to https://, so old
 * links and addresses typed without the scheme still reach the bar. The first byte tells them apart:
 * every TLS connection starts with a handshake record (0x16).
 */
export function redirectHttpToHttps():Plugin {
  return {name:'bar-http-to-https',configureServer(server){
    const httpServer=server.httpServer;
    if(!httpServer||!('setSecureContext' in httpServer))return;
    const tlsListeners=httpServer.listeners('connection') as Array<(socket:Socket)=>void>;
    httpServer.removeAllListeners('connection');
    httpServer.on('connection',(socket:Socket)=>{
      socket.once('readable',()=>{
        const first=socket.read(1) as Buffer|null;
        if(!first){socket.destroy();return;}
        socket.unshift(first);
        if(first[0]===0x16){for(const listener of tlsListeners)listener.call(httpServer,socket);return;}
        redirect(socket);
      });
    });
  }};
}

function redirect(socket:Socket):void {
  let head='';
  socket.setTimeout(5000,()=>socket.destroy());
  socket.on('error',()=>socket.destroy());
  socket.on('data',(chunk:Buffer)=>{
    head+=chunk.toString('latin1');
    if(head.length>16384){socket.destroy();return;}
    if(!head.includes('\r\n\r\n'))return;
    socket.removeAllListeners('data');
    const path=head.match(/^[A-Z]+ (\/[^ \r\n]*) HTTP\//)?.[1]??'/';
    const host=head.match(/^host:[ \t]*([^\r\n]+)/im)?.[1]?.trim();
    // Only a plain host[:port]; anything else gets a page without a redirect.
    if(!host||!/^[A-Za-z0-9.\-:[\]]+$/.test(host)){socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');return;}
    const location=`https://${host}${path}`;
    socket.end(`HTTP/1.1 301 Moved Permanently\r\nLocation: ${location}\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  });
}
