import {Client,type Room} from '@colyseus/sdk';
import {movePlayer,TICK_MS,type WorldState,type PlayerInput,type Position,type PublicUser,type ChatMessage} from '@bar/shared';
import {api} from './api';

export interface NetworkHooks {
  state:(world:WorldState)=>void; position:(position:Position)=>void;
  chat:(message:ChatMessage)=>void; status:(message:string,connected:boolean)=>void;
  error:(message:string)=>void; ping:(ms:number)=>void;
  input:()=>Omit<PlayerInput,'seq'>;
  /** Skin to wear on arrival, so the avatar never shows the default first. */
  skin:()=>string;
}
export class BarNetwork {
  room?:Room;
  private client=new Client(import.meta.env.VITE_GAME_URL?.startsWith('/')
    ? `${location.protocol==='https:'?'wss':'ws'}://${location.host}${import.meta.env.VITE_GAME_URL}`
    : import.meta.env.VITE_GAME_URL||`${location.protocol==='https:'?'wss':'ws'}://${location.hostname}:2567`);
  private pending:PlayerInput[]=[];
  private position:Position={x:0,z:7};
  private seq=0;
  private world?:WorldState;
  private tick?:ReturnType<typeof setInterval>;
  private heartbeat?:ReturnType<typeof setInterval>;
  private stopped=true;
  private generation=0;
  private transportReady=false;
  private wasMoving=false;
  user?:PublicUser;
  constructor(private hooks:NetworkHooks){}
  async connect():Promise<void> {
    this.stopped=false;const generation=++this.generation;
    this.hooks.status('Encontrando uma mesa…',false);
    for(let attempt=0;!this.stopped&&generation===this.generation;attempt++){
      const {ticket,user}=await api<{ticket:string;user:PublicUser}>('/game-ticket',{});
      this.user=user;
      try {const room=await this.client.joinOrCreate('bar',{ticket,skin:this.hooks.skin()});if(this.stopped||generation!==this.generation){await room.leave();return;}this.attach(room);return;}
      catch(error){
        const message=error instanceof Error?error.message:String(error);
        if(/full|cheio|capacity|lotado|locked|4213/i.test(message)){
          this.hooks.status(`Bar cheio. Aguardando uma vaga… (${attempt+1})`,false);
          await new Promise(resolve=>setTimeout(resolve,3000));
        } else {this.stopped=true;throw error;}
      }
    }
  }
  private attach(room:Room):void {
    this.room=room;this.pending=[];this.seq=0;this.transportReady=true;this.wasMoving=false;
    Object.assign(room.reconnection,{minUptime:0,minDelay:500,maxDelay:2000,delay:500,maxRetries:15,maxEnqueuedMessages:0});
    this.hooks.status('Você está no bar',true);
    room.onStateChange((state:any)=>{
      const world=(typeof state.toJSON==='function'?state.toJSON():state) as WorldState;
      this.world=world;
      this.hooks.state(world);
      const self=world.players?.[this.user!.id];
      if(self){
        this.seq=Math.max(this.seq,self.lastProcessedInput);
        this.pending=this.pending.filter(input=>input.seq>self.lastProcessedInput);
        this.position={x:self.x,y:self.y,z:self.z};
        if(!self.interactionState&&!self.currentTableId) for(const input of this.pending)this.position=movePlayer(this.position,input);
        this.hooks.position(this.position);
      }
    });
    room.onMessage('chat.message',(message:ChatMessage)=>this.hooks.chat(message));
    room.onMessage('error',(payload:{message?:string})=>this.hooks.error(payload.message||'Ação indisponível.'));
    room.onMessage('pong',(payload:{at:number})=>this.hooks.ping(Math.max(0,Date.now()-payload.at)));
    room.onError((_code:number,message?:string)=>this.hooks.error(message||'A conexão encontrou um problema.'));
    room.onDrop(()=>{this.transportReady=false;this.stopTimers();this.pending=[];this.hooks.status('Conexão interrompida. Tentando reconectar…',false);});
    room.onReconnect(()=>{if(this.stopped)return;this.transportReady=true;this.pending=[];this.startTimers();this.hooks.status('Você está no bar',true);});
    room.onLeave((code:number)=>{if(!this.stopped&&this.room===room){this.transportReady=false;this.stopTimers();this.stopped=true;this.hooks.status(code===4000?'Sua participação foi encerrada. Volte à entrada para continuar.':'A conexão terminou. Volte à entrada para entrar novamente.',false);}});
    this.startTimers();
  }
  private sendInput():void {
    if(!this.transportReady||!this.room||!this.user||!this.world||this.pending.length>12)return;
    const self=this.world.players[this.user.id];
    if(!self)return;
    if(self.interactionState||self.currentTableId){this.wasMoving=false;return;}
    const intention=this.hooks.input();
    const moving=!!(intention.dx||intention.dz);
    if(!moving&&!this.wasMoving)return;
    this.wasMoving=moving;
    const input={...intention,seq:++this.seq};
    this.pending.push(input);this.position=movePlayer(this.position,input);this.hooks.position(this.position);this.send('player.input',input);
  }
  send(type:string,payload:unknown={}):void {if(this.room&&!this.stopped&&this.transportReady)this.room.send(type,payload);}
  telemetry():{sequence:number;pending:number}{return {sequence:this.seq,pending:this.pending.length};}
  private startTimers():void {this.stopTimers();this.tick=setInterval(()=>this.sendInput(),TICK_MS);this.heartbeat=setInterval(()=>this.send('ping',{at:Date.now()}),3000);}
  private stopTimers():void {clearInterval(this.tick);clearInterval(this.heartbeat);}
  async disconnect():Promise<void>{this.stopped=true;this.transportReady=false;this.generation++;this.stopTimers();const room=this.room;this.room=undefined;this.world=undefined;this.pending=[];if(room){room.reconnection.enabled=false;if(room.connection?.isOpen)await room.leave();}}
}
