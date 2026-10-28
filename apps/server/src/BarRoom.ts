import { randomUUID } from 'node:crypto';
import { Client, Room, ServerError } from '@colyseus/core';
import { ArraySchema, Schema, StateView } from '@colyseus/schema';
import { z } from 'zod';
import { AOI_RADIUS, BLACKJACK_SEATS, CHAT_RADIUS, DEFAULT_SKIN, DRINK_DURATION_MS, KICK_DURATION_MS, WAVE_DURATION_MS, USE_DURATION_MS, RECOVER_DURATION_MS, INTERACTABLES, PATCH_MS, TICK_MS, canInteract, interactionReach, distance, findSpawn, standingPosition, inputSchema, movePlayer, skinMessageSchema, skinSchema, type AnimationState, type ChatMessage, type PlayerInput, VOICE, decodeVoicePacket, voiceStateSchema, wrapVoice, DOORS, PLAYER_RADIUS, inDoorSweep, isWalkable, setDoorStates, DRINK_ITEMS, type DrinkItem, ITEM_IDS, itemById, INVENTORY_CAPACITY, type InventoryStack, type InventoryView, type ItemId } from '@bar/shared';
import { verifyTicket, type GameTicket } from '@bar/shared/tickets';
import { Access, internal, validateAccess, type Control } from './internal.js';
import { BarState, CardState, DoorState, JobSlotState, Player, SeatState, TableState } from './state.js';
import { BlackjackTable, type Result } from './minigames/blackjack.js';
import { EventDirector, type EventKind } from './world/events.js';
import { createNpcs, NpcDirector } from './world/npcs.js';
import { BarService } from './world/bartender.js';
import { NeedsDirector } from './world/needs.js';
import { NEEDS, MAP_MARKERS, isConscious, swayInput, type NeedsEvent } from '@bar/shared';
import {JUKEBOX_SYSTEMS,TV_SYSTEMS,initialJukebox,jukeboxCommandSchema,commandJukebox,jukeboxTime,type JukeboxState} from '@bar/shared';
import {Jukebox} from './state.js';
import { readWorldConfig } from './config.js';
import { FileOutbox } from './world/outbox.js';
import { ControlRelay, ResultRelay, type MatchResult } from './world/relays.js';
import { health, logLine, worldMetrics } from './observability.js';
import { SessionRegistry } from './room/session-registry.js';
import { TABLE_QUEUE_MAX, WaiterService, publicOrder, type TableOrder } from './world/waiter.js';
import { ServedItems, type Seated } from './world/served.js';
import { JobDirector, type Payment } from './world/jobs.js';
import { changeWallet, WalletRetries } from './world/wallet.js';
import { JOBS, USE_DURATION_MS as TASK_GESTURE_MS, itemById as catalogItem, orderTotal, tableOrderSchema, type MediaPriceKind } from '@bar/shared';
import { STAGE_PASS, hasStagePass, onStage, musicianRole, stageSpot } from '@bar/shared';
import { Musicians, type MusicianEnd } from './world/musicians.js';
import { BotRunner } from './world/bots.js';

// Interactions need the player to touch the object; the server tolerates a little drift from latency.
const INTERACTION_SLACK = 0.3;

interface Presence {
  joinedAt:number;
  ticket: GameTicket;
  client: Client;
  blocked: Set<string>;
  queue: PlayerInput[];
  lastReceived: number;
  lastInputAt: number;
  seen: Set<Schema>;
  revoked: boolean;
  rejectReconnect?: () => void;
  interactionEndsAt?: number;
  /** A short non-blocking gesture (wave/use/recovery) and the state it may safely restore. */
  gestureEndsAt?:number;
  gestureState?:AnimationState;
  rates: Map<string, number[]>;
  /** After an alcohol faint: when the fallen body is taken to the recovery point (once). */
  recoveryMoveAt?: number;
  /** Wants to hear proximity voice (the player can switch other voices off). */
  listening: boolean;
  /** Voice packets relayed in the current one-second window. */
  voicePackets: number;
  voiceWindowAt: number;
  /** Private persistent item state. It is sent only to this player, never through the room schema. */
  inventory:Map<ItemId,number>;
  inventoryBusy?:boolean;
  inventoryItem?:ItemId;
  /** Coins as last confirmed by the API (the API decides every change; this only feeds the HUD and messages). */
  balance:number;
  /** The counter drink paid for and not yet served; refunded if the order is dropped. */
  counterCharge?:{requestId:string;amount:number};
  /** A stage pass being charged: a second click meanwhile must not buy (and charge) another. */
  stageBusy?:boolean;
}
// Actions that need a conscious character; chat, voice and movement input stay available (input is ignored).
const NEEDS_CONSCIOUS = new Set(['table.order', 'job.start', 'job.work', 'player.interact', 'player.emote', 'player.skin', 'player.appearance', 'inventory.use', 'inventory.discard', 'blackjack.join', 'blackjack.start', 'blackjack.action', 'jukebox.command', 'tv.command', 'stage.buy']);
const eventTypes: Record<EventKind, string> = { blackout: 'BLACKOUT', troublemaker: 'DRUNK_NPC', party: 'PARTY' };
const eventKinds: Record<string, EventKind> = { BLACKOUT: 'blackout', DRUNK_NPC: 'troublemaker', PARTY: 'party' };

export class BarRoom extends Room<{ state: BarState }> {
  private administrativeEvent?:{commandId:string;eventId:string};
  static activeId: string | undefined;
  state = new BarState();
  /** Validated once per room (apps/server/src/config.ts); a bad variable stops the world at start. */
  private readonly config = readWorldConfig();
  private readonly sessions = new SessionRegistry<Presence>();
  private blackjack = new BlackjackTable('blackjack-1', (roundId, userId, result) => this.recordResult(roundId, userId, result), undefined,
    this.config.blackjackTurnMs);
  private events = new EventDirector(this.config.eventMinMs, this.config.eventMaxMs);
  private npcs = new NpcDirector();
  private service = new BarService();
  /** Whether a customer still sits where they ordered from (a logged-out avatar has left). */
  private readonly seated: Seated = (playerId, seatId) => { const player = this.state.players.get(playerId); return !!player?.connected && player.interactionState === seatId; };
  /** What Tonico left on the tables, Tonico's table service and the jobs (apps/server/src/world/served.ts, waiter.ts, jobs.ts). */
  private served = new ServedItems(this.state.served);
  /** Who plays at each of the stage's musicians' spots, and the phases of each show (apps/server/src/world/musicians.ts). */
  private musicians = new Musicians(this.state.musicians, this.config.musicianDropMs);
  private waiter = new WaiterService({ plan: order => this.served.plan(order, this.seated) });
  readonly jobs = new JobDirector();
  private walletRetries = new WalletRetries((event, details) => this.log(event, details));
  /** HP, stamina, hunger, thirst, bladder and drunkenness of every avatar (packages/shared/src/needs.ts). */
  readonly needs = new NeedsDirector();
  /** Administrative controls: leased from the API's outbox, applied once, then confirmed. */
  private controls = new ControlRelay(this.config.instanceId, internal);
  /** Finished rounds wait on disk until the API confirms them (survives crashes and API outages). */
  private results = new ResultRelay(new FileOutbox(this.config.outboxPath, (event, details) => this.log(event, details)), internal);
  /** Development bots added from the administration (apps/server/src/world/bots.ts); its panel follows them as they join. */
  private bots = new BotRunner({ apiUrl: this.config.apiInternalUrl, worldUrl: `http://${['0.0.0.0', '::'].includes(this.config.host) ? '127.0.0.1' : this.config.host}:${this.config.port}`,
    log: (event, details) => this.log(event, details), settled: () => { const admin = this.botsAdmin; if (admin && this.sessions.getByClient(admin)) admin.send('admin.world', this.adminSnapshot()); } });
  private botsAdmin?: Client;
  private maintenanceBusy = false;
  private lastTableJson = '';
  private resultsResetAt = 0;
  private tickCount = 0;

  onCreate(): void {
    // The primary bar persists even empty. A locked/full bar must never overflow
    // into an unrelated world through joinOrCreate's automatic create fallback.
    if (BarRoom.activeId && BarRoom.activeId !== this.roomId) throw new ServerError(503, 'BAR_FULL: O bar está cheio. Aguarde uma vaga.');
    BarRoom.activeId = this.roomId;
    this.autoDispose = false;
    this.maxClients = this.config.capacity;
    this.maxMessagesPerSecond = 100;
    this.state.capacity = this.maxClients;
    this.setPatchRate(PATCH_MS);
    this.state.tables.set('blackjack-1', new TableState());
    // Doors start open, as authored in the map; the shared physics mirrors this room's door states.
    setDoorStates(DOORS.map(door => [door.id, true] as const));
    for (const door of DOORS) this.state.doors.set(door.id, new DoorState().assign({ id: door.id, open: true }));
    for(const system of JUKEBOX_SYSTEMS)this.state.jukeboxes.set(system.id,new Jukebox().assign(initialJukebox(system.id)));
    for(const system of TV_SYSTEMS)this.state.televisions.set(system.id,new Jukebox().assign(initialJukebox(system.id)));
    for (const npc of createNpcs()) this.state.npcs.set(npc.id, npc);
    for (const job of JOBS) this.state.jobs.set(job.id, new JobSlotState());
    this.syncJobs();
    this.setFixedTimestep(() => { const started = performance.now(); this.step(); worldMetrics.observe('bar_world_tick_ms', 'Simulation step duration in ms', performance.now() - started); }, 1000 / TICK_MS);
    health.roomId = this.roomId;
    worldMetrics.gauge('bar_world_players_connected', 'Players connected to the bar', () => [...this.state.players.values()].filter(p => p.connected).length);
    worldMetrics.gauge('bar_world_avatars', 'Avatars in the bar, including those waiting offline', () => this.state.players.size);
    worldMetrics.gauge('bar_world_result_outbox_pending', 'Finished rounds waiting for the API', () => this.results.pending);
    worldMetrics.gauge('bar_world_wallet_credits_pending', 'Refunds and job pay waiting for the API', () => this.walletRetries.size);
    worldMetrics.gauge('bar_world_table_orders_pending', 'Table orders waiting for Tonico', () => this.waiter.pending);
    worldMetrics.gauge('bar_world_job_workers', 'Players working a job shift', () => JOBS.reduce((sum, job) => sum + this.jobs.workers(job.id).length, 0));
    worldMetrics.gauge('bar_world_api_last_ok_seconds', 'Seconds since the API last answered the maintenance round trip', () => health.apiOkAt ? (Date.now() - health.apiOkAt) / 1000 : undefined);
    this.clock.setInterval(() => { void this.maintenance(); }, 3000);
    this.registerMessages();
  }

  async onAuth(_client: Client, options: unknown): Promise<GameTicket & Access> {
    const { ticket: token } = z.object({ ticket: z.string().max(4096) }).parse(options);
    let ticket: GameTicket;
    try { ticket = verifyTicket(token); } catch { throw new ServerError(401, 'Sua entrada expirou. Entre novamente.'); }
    // Reserve before awaiting so a concurrent redemption cannot reuse the nonce.
    if (!this.sessions.reserveNonce(ticket.nonce, ticket.exp)) throw new ServerError(401, 'Ticket já utilizado.');
    const access = await validateAccess(ticket.sessionId, ticket.userId);
    if (!access.valid) throw new ServerError(401, 'Sessão encerrada ou conta suspensa.');
    return { ...ticket,...access };
  }

  onJoin(client: Client, _options: unknown, auth: GameTicket & Access): void {
    worldMetrics.inc('bar_world_joins_total', 'Joins accepted');
    // A new login takes over at once: from another tab, or from a session still waiting to reconnect.
    const previous = this.sessions.getByUser(auth.userId);
    if (previous) this.replaceSession(previous);
    // The skin comes from the account, never from the join options; anything not owned falls back to the default.
    const skin=auth.ownedSkins?.includes(auth.equippedSkin??'')?auth.equippedSkin!:DEFAULT_SKIN;
    // Avatars stay in the bar after their player leaves; logging in again takes control of the same one.
    let player = this.state.players.get(auth.userId);
    if (player) {
      this.park(player);
      player.assign({ displayName: auth.displayName, color: auth.color, connected: true, lastProcessedInput: -1 });
      player.skin=skin;
    } else {
      player = new Player().assign({ id: auth.userId, displayName: auth.displayName, color: auth.color, skin,...findSpawn([...this.state.players.values()]), rotation: Math.PI / 2 });
      this.state.players.set(auth.userId, player);
    }
    this.needs.sync(player, Date.now());
    client.view = new StateView();
    const presence:Presence={joinedAt:Date.now(),ticket: auth, client, blocked: new Set(auth.blocked), queue: [], lastReceived: -1, lastInputAt: Date.now(), seen: new Set(), revoked: false, rates: new Map(), listening: true, voicePackets: 0, voiceWindowAt: 0,inventory:new Map((auth.inventory??[]).map(stack=>[stack.itemId,stack.quantity])),balance:auth.balance??0};
    this.sessions.bind(auth.userId,presence);
    this.state.occupancy = this.sessions.size;
    this.refreshViews();
    this.syncTable();
    client.send('wallet.state',{balance:presence.balance});
    this.sendJob(presence);
    this.log(previous ? 'takeover' : 'join', { playerId: auth.userId });
  }

  onDrop(client: Client): void {
    const presence = this.forClient(client);
    if (!presence || presence.revoked) return;
    const player = this.state.players.get(presence.ticket.userId);
    if (player) { player.connected = false; player.voice = false; if (!player.interactionState) player.animationState = 'idle'; }
    if (player && player.animationState !== 'drink') player.drinkItem = '';
    presence.queue.length = 0;
    // A pending order is dropped with the connection, which would otherwise leave the player waiting forever.
    this.cancelCounter(presence.ticket.userId);
    this.cancelTable(presence.ticket.userId);
    if (player) this.endShift(player, 'Você caiu da conexão e o turno foi encerrado.');
    if (player?.interactionState === 'counter' && player.animationState !== 'drink') player.interactionState = '';
    const reservation = this.allowReconnection(client, 30);
    presence.rejectReconnect = () => reservation.reject();
  }

  async onReconnect(client: Client): Promise<void> {
    const presence = this.forClient(client);
    if (!presence || presence.revoked) { client.leave(4000); return; }
    worldMetrics.inc('bar_world_reconnects_total', 'Connections resumed after a drop');
    if (!this.sessions.replaceClient(presence.ticket.userId, presence, client)) { client.leave(4000); return; }
    // An API that does not answer in time is not an ended session: keep the player. Maintenance revalidates
    // every few seconds and expels then if the session really ended.
    const access = await validateAccess(presence.ticket.sessionId, presence.ticket.userId).catch(() => undefined);
    // A login in another tab may have replaced this presence while the API request was pending.
    // Never let the continuation of the old reconnect expel or mutate the newer session/avatar.
    if (presence.revoked || !this.sessions.isCurrent(presence.ticket.userId, presence)) { client.leave(4000); return; }
    if (access && !access.valid) { if(access.banned)this.removeByAdmin(presence.ticket.userId,'ban','Sua conta está banida do bar.');else this.expel(presence.ticket.userId, 'Sua sessão terminou. Entre novamente.'); return; }
    if (!access) this.log('auth_refresh_unavailable', { playerId: presence.ticket.userId });
    if (access) {presence.blocked = new Set(access.blocked);this.setInventory(presence,access.inventory??[]);this.sendInventory(presence);if(access.balance!==undefined)presence.balance=access.balance;client.send('wallet.state',{balance:presence.balance});}
    presence.rejectReconnect = undefined;
    presence.queue.length = 0;
    const player = this.state.players.get(presence.ticket.userId)!;
    player.connected = true;
    // Without an answer, the appearance already in the room stays as it is.
    if (access) this.applyAppearance(player,access);
    // Queued movement before a transport interruption must never replay afterward.
    player.lastProcessedInput = presence.lastReceived;
    this.refreshViews();
  }

  onLeave(client: Client): void {
    const presence = this.forClient(client);
    if (!presence) return;
    const userId = presence.ticket.userId;
    worldMetrics.inc('bar_world_leaves_total', 'Participations ended');
    // Pending orders are refunded while the session is still registered (refunds go to its wallet owner).
    this.cancelCounter(userId); this.cancelTable(userId);
    this.sessions.remove(userId, presence);
    const player = this.state.players.get(userId);
    // Expelled players and development bots (tests/load/bots.ts) are removed; everyone else leaves the avatar standing
    // (or seated) where it was.
    if (presence.revoked || presence.ticket.bot) { this.blackjack.leave(userId); this.cancelCounter(userId); this.cancelTable(userId); if (player) this.endShift(player, 'Turno encerrado.'); this.musicians.release(userId); this.needs.forget(userId); this.state.players.delete(userId); }
    else if (player) { this.park(player); player.connected = false; }
    this.state.occupancy = this.sessions.size;
    this.refreshViews();
    this.syncTable();
    this.log('leave', { playerId: userId });
  }

  /** Ends what needs a connected player (blackjack seat, orders, drinks, kicks); a chair stays taken. */
  private park(player: Player): void {
    player.drinkItem = '';
    this.blackjack.leave(player.id);
    this.cancelCounter(player.id);
    this.cancelTable(player.id);
    this.endShift(player, 'Turno encerrado.');
    if (player.currentTableId) Object.assign(player, standingPosition(player, player.rotation));
    player.currentTableId = '';
    // The microphone belongs to a session; a new one switches it on again itself.
    player.voice = false;
    const presence=this.sessions.getByUser(player.id);if(presence)presence.inventoryItem=undefined;
    // A musician puts the instrument back (the stop clip plays) and the spot frees itself when it ends.
    if (player.interactionState.startsWith('stage-')) this.musicians.stop(player.id, Date.now());
    else if (player.animationState !== 'sit' && player.condition !== 'fainted') { player.interactionState = ''; player.animationState = 'idle'; }
  }

  /** Closes an older session of the same account without touching its avatar, which the new one takes. */
  private replaceSession(previous: Presence): void {
    this.cancelCounter(previous.ticket.userId); this.cancelTable(previous.ticket.userId);
    this.sessions.remove(previous.ticket.userId, previous);
    previous.rejectReconnect?.();
    if (this.state.players.get(previous.ticket.userId)?.connected)
      previous.client.send('error', { message: 'Sua conta entrou no bar em outra janela.' });
    // Also close a transport that already resumed but is still awaiting access validation. onDrop
    // marks the avatar disconnected, so tying this close to player.connected would orphan that socket.
    previous.client.leave(4000);
  }

  onDispose(): void { this.bots.stop(); if (BarRoom.activeId === this.roomId) BarRoom.activeId = undefined; if (health.roomId === this.roomId) health.roomId = undefined; }

  private registerMessages(): void {
    // Proximity voice: raw packets, relayed without decoding (see relayVoice).
    this.onMessageBytes('voice', (client, bytes: Uint8Array) => this.relayVoice(client, bytes));
    this.handle('voice.state', voiceStateSchema, 4, (client, { mic, listen }) => {
      this.player(client).voice = mic;
      this.forClient(client)!.listening = listen;
    });
    this.handle('player.input', inputSchema, 55, (client, input) => {
      const p = this.forClient(client)!;
      if (input.seq <= p.lastReceived) return;
      // Keep recent intentions during a delayed packet burst. Skipped sequences
      // are acknowledged by the next processed input; simulation stays 20 Hz.
      if (p.queue.length >= 6) p.queue.shift();
      p.lastReceived = input.seq;
      p.lastInputAt = Date.now();
      p.queue.push(input);
    });
    this.handle('player.interact', z.object({ objectId: z.string().max(64), item: z.enum(DRINK_ITEMS).optional() }).strict(), 5, (client, command) => this.interact(client, command.objectId, command.item));
    this.handle('inventory.sync',z.object({}).strict(),2,async client=>{
      const presence=this.forClient(client)!;const access=await validateAccess(presence.ticket.sessionId,presence.ticket.userId);
      if(this.forClient(client)!==presence)return;if(!access.valid){this.expel(presence.ticket.userId,'Sua sessão terminou.');return;}
      this.setInventory(presence,access.inventory??[]);this.sendInventory(presence);
    });
    this.handle('inventory.use',z.object({itemId:z.enum(ITEM_IDS)}).strict(),3,(client,{itemId})=>this.useInventory(client,itemId));
    this.handle('inventory.discard',z.object({itemId:z.enum(ITEM_IDS),quantity:z.number().int().min(1).max(10)}).strict(),3,async(client,{itemId,quantity})=>{
      const player=this.player(client);if(player.interactionState||player.currentTableId)throw new Error('Encerre a ação atual antes de mexer na mochila.');
      const presence=this.forClient(client)!;const view=await this.removeInventory(presence,itemId,quantity,'discard');
      if(this.forClient(client)===presence){this.sendInventory(presence,view);client.send('inventory.result',{action:'discard',itemId,quantity});}
    });
    // The jukebox and the TVs are separate sources: own state map, own messages, same validation.
    for(const kind of ['jukebox','tv'] as const){
      const states=kind==='jukebox'?this.state.jukeboxes:this.state.televisions;
      this.handle(`${kind}.command`,jukeboxCommandSchema,4,async(client,command)=>{
        this.requireMedia(kind,client,command.id);
        const state=states.get(command.id)!,presence=this.forClient(client)!;
        // Validates the command (revision, link) before any coin moves.
        commandJukebox(state as unknown as JukeboxState,command,this.player(client).id,Date.now());
        // Choosing a new video costs coins; pausing, resuming, stopping and switching off are free.
        const price=command.action==='play'?this.config.prices[this.mediaPrice(kind,command.id)]:0,requestId=randomUUID();
        if(price)await this.charge(presence,price,`media:${command.id}`,requestId);
        try{
          if(this.forClient(client)!==presence)throw new Error('Sua sessão mudou. Moedas devolvidas.');
          this.requireMedia(kind,client,command.id);
          state.assign(commandJukebox(state as unknown as JukeboxState,command,this.player(client).id,Date.now()));
        }catch(error){if(price)this.refund(presence,requestId,price);throw error;}
        client.send(`${kind}.result`,{id:command.id,revision:state.revision,price});
      });
      // End notifications cannot overwrite a newer selection or another controller.
      this.handle(`${kind}.ended`,z.object({id:z.string().max(64),revision:z.number().int().min(0),videoId:z.string().length(11),duration:z.number().finite().positive().max(86400)}).strict(),2,(client,report)=>{
        const state=states.get(report.id);
        if(!state||state.updatedBy!==this.player(client).id||state.revision!==report.revision||state.videoId!==report.videoId||state.status!=='playing')return;
        if(Math.abs(jukeboxTime(state as unknown as JukeboxState,Date.now())-report.duration)>8)return;
        state.assign({status:'ended',position:report.duration,updatedAt:Date.now(),revision:state.revision+1});
      });
    }
    // Tonico takes orders from anyone seated at a table and brings them from the counter.
    this.handle('table.order',tableOrderSchema,2,async(client,{items})=>{
      const player=this.player(client),presence=this.forClient(client)!,seatId=player.interactionState;
      if(!seatId.startsWith('seat-')||player.animationState!=='sit')throw new Error('Sente-se a uma mesa para pedir ao Tonico.');
      if(this.waiter.has(player.id))throw new Error('Seu pedido já está com o Tonico.');
      if(this.waiter.pending>=TABLE_QUEUE_MAX)throw new Error('O Tonico está atolado de pedidos. Tente daqui a pouco.');
      const order:TableOrder={id:randomUUID(),playerId:player.id,seatId,items,total:orderTotal(items),placedAt:Date.now(),owner:{sessionId:presence.ticket.sessionId,userId:presence.ticket.userId}};
      await this.charge(presence,order.total,`table:${items.join('-')}`,order.id);
      if(this.forClient(client)!==presence||player.interactionState!==seatId){this.refund(presence,order.id,order.total);throw new Error('Você saiu da mesa. Moedas devolvidas.');}
      try{this.waiter.order(order);}catch(error){this.refund(presence,order.id,order.total);throw error;}
      client.send('table.state',{status:'ordered',order:publicOrder(order)});
      this.systemMessage(`${player.displayName} pediu ao Tonico: ${items.map(id=>catalogItem(id)?.name??id).join(', ')}.`,player);
    });
    // The stage pass is bought at its steps: charged first (the API decides), refunded if the buyer left meanwhile.
    this.handle('stage.buy',z.object({}).strict(),2,async client=>{
      const player=this.player(client),presence=this.forClient(client)!;
      if(presence.stageBusy)throw new Error('Aguarde: o ingresso está sendo pago.');
      this.requireStage(player);
      const price=this.config.prices.stage,requestId=randomUUID();
      presence.stageBusy=true;
      try{
        if(price)await this.charge(presence,price,'stage:pass',requestId);
        try{
          if(this.forClient(client)!==presence)throw new Error('Sua sessão mudou. Moedas devolvidas.');
          this.requireStage(player);
        }catch(error){if(price)this.refund(presence,requestId,price);throw error;}
      }finally{presence.stageBusy=false;}
      player.stageUntil=Date.now()+STAGE_PASS.durationMs;
      client.send('stage.state',{until:player.stageUntil,price});
      this.systemMessage(`${player.displayName} pegou o ingresso do palco.`,player);
      this.log('stage_pass',{playerId:player.id,price});
    });
    this.handle('table.cancel',z.object({}).strict(),2,client=>{
      const player=this.player(client);if(!this.waiter.has(player.id))throw new Error('Você não tem pedido com o Tonico.');
      this.cancelTable(player.id,'Pedido cancelado. Moedas devolvidas.');
    });
    this.handle('job.start',z.object({jobId:z.string().max(32)}).strict(),2,(client,{jobId})=>{
      const player=this.player(client),presence=this.forClient(client)!;
      if(player.interactionState||player.currentTableId)throw new Error('Encerre a ação atual antes de começar a trabalhar.');
      const shift=this.jobs.start(player.id,jobId,player,Date.now());
      player.job=jobId;this.syncJobs();this.sendJob(presence);
      this.log('job_start',{playerId:player.id,jobId,shiftId:shift.shiftId});
      this.systemMessage(`${player.displayName} começou o turno: ${JOBS.find(j=>j.id===jobId)!.name}.`,player);
    });
    this.handle('job.stop',z.object({}).strict(),2,client=>{
      const player=this.player(client);if(!this.jobs.shift(player.id))throw new Error('Você não está trabalhando.');
      this.endShift(player,'Turno encerrado. Valeu pela ajuda!');
    });
    this.handle('job.work',z.object({}).strict(),3,client=>{
      const player=this.player(client),presence=this.forClient(client)!;
      if(player.interactionState||player.currentTableId)throw new Error('Encerre a ação atual primeiro.');
      const task=this.jobs.begin(player.id,player,Date.now());
      const target=task.station;player.rotation=Math.atan2(target.x-player.x,target.z-player.z);
      player.interactionState='job';player.animationState='use';player.animationStartedAt=Date.now();
      presence.queue.length=0;player.lastProcessedInput=presence.lastReceived;this.sendJob(presence);
    });
    // Administration and debugging (role from the session, refreshed every maintenance round).
    this.handle('admin.world',z.object({}).strict(),2,client=>{this.requireAdmin(client);client.send('admin.world',this.adminSnapshot());});
    this.handle('admin.job',z.object({jobId:z.string().max(32),enabled:z.boolean().optional(),pay:z.number().int().min(0).max(100).optional(),slots:z.number().int().min(0).max(16).optional(),endShiftOf:z.string().max(64).optional()}).strict(),5,(client,command)=>{
      const admin=this.requireAdmin(client);
      if(command.endShiftOf){const target=this.state.players.get(command.endShiftOf);if(!target||!this.jobs.shift(target.id))throw new Error('Este jogador não está trabalhando.');this.endShift(target,'Um administrador encerrou o seu turno.');}
      this.jobs.configure(command.jobId,{enabled:command.enabled,pay:command.pay,slots:command.slots});this.syncJobs();
      this.log('admin_job',{playerId:admin,...command});
      client.send('admin.world',this.adminSnapshot());
    });
    this.handle('admin.table',z.object({cancelFor:z.string().max(64)}).strict(),5,(client,{cancelFor})=>{
      const admin=this.requireAdmin(client);this.cancelTable(cancelFor,'Um administrador cancelou o pedido. Moedas devolvidas.');
      this.log('admin_table_cancel',{playerId:admin,customer:cancelFor});client.send('admin.world',this.adminSnapshot());
    });
    this.handle('admin.media',z.object({kind:z.enum(['jukebox','tv']),id:z.string().max(64)}).strict(),5,(client,{kind,id})=>{
      const admin=this.requireAdmin(client),states=kind==='jukebox'?this.state.jukeboxes:this.state.televisions,state=states.get(id);
      if(!state)throw new Error('Aparelho desconhecido.');
      state.assign({videoId:'',status:'off',position:0,updatedAt:Date.now(),updatedBy:admin,revision:state.revision+1});
      this.log('admin_media_off',{playerId:admin,kind,id});client.send('admin.world',this.adminSnapshot());
    });
    // Development bots for performance tests: how many the bar should have (0 takes them out), never more than fit in it.
    this.handle('admin.bots',z.object({count:z.number().int().min(0).max(128)}).strict(),3,(client,{count})=>{
      const admin=this.requireAdmin(client),room=this.botRoom();
      if(count>room)throw new Error(`O bar comporta ${this.config.capacity} pessoas: cabem até ${room} bots além dos jogadores. Aumente ROOM_CAPACITY no .env e reinicie o mundo.`);
      this.bots.set(count);this.botsAdmin=client;
      this.log('admin_bots',{playerId:admin,count});client.send('admin.world',this.adminSnapshot());
    });
    this.handle('player.emote', z.object({ emote: z.enum(['dance', 'wave', 'idle', 'kick']) }).strict(), 4, (client, { emote }) => {
      const p = this.player(client);
      if (p.interactionState) throw new Error('Levante-se primeiro.');
      if (emote === 'kick') {
        if (p.skin !== 'rafael') throw new Error('O golpe de karatê é exclusivo do Rafael.');
        const presence = this.forClient(client)!;
        p.animationState = 'kick'; p.animationStartedAt = Date.now(); p.interactionState = 'kick';
        presence.interactionEndsAt = p.animationStartedAt + KICK_DURATION_MS;
        presence.queue.length = 0;
        p.lastProcessedInput = presence.lastReceived;
        return;
      }
      if(emote==='wave'){
        this.playTemporary(p,this.forClient(client)!,'wave',WAVE_DURATION_MS);
        this.systemMessage(`${p.displayName} acenou para o pessoal.`, p);
      }else{
        p.animationState=emote==='dance'?'dance':'idle';p.animationStartedAt=Date.now();
      }
    });
    this.handle('player.skin', skinMessageSchema, 2, async (client, { skin }) => {
      const player = this.player(client);
      if (player.animationState === 'kick') throw new Error('Espere o golpe terminar para trocar o visual.');
      const presence=this.forClient(client)!;
      const access=await internal<Access>('equip',{sessionId:presence.ticket.sessionId,userId:presence.ticket.userId,skin});
      if(this.forClient(client)===presence&&player.connected&&player.animationState!=='kick')this.applyAppearance(player,access);
    });
    this.handle('player.appearance',z.object({}).strict(),2,async client=>{
      const presence=this.forClient(client)!;
      const access=await validateAccess(presence.ticket.sessionId,presence.ticket.userId);
      if(this.forClient(client)!==presence)return;
      if(!access.valid){this.expel(presence.ticket.userId,'Sua sessão terminou.');return;}
      this.applyAppearance(this.player(client),access);
    });
    this.handle('chat.send', z.object({ text: z.string().trim().min(1).max(280) }).strict(), 3, (client, { text }) => {
      const sender = this.forClient(client)!;
      const player = this.player(client);
      if(text.toLowerCase()==='/velho'){
        player.oldWalk=!player.oldWalk;
        if(player.animationState==='run'&&player.oldWalk)player.animationState='walk';
        client.send('chat.message',{id:randomUUID(),playerId:'system',displayName:'B.A.R.',system:true,sentAt:Date.now(),text:player.oldWalk?'Bengala equipada. Caminhada a 0,475 m/s. Digite /velho novamente para voltar ao normal.':'Bengala guardada. Caminhada normal restaurada.'} satisfies ChatMessage);
        return;
      }
      const message: ChatMessage = { id: randomUUID(), playerId: player.id, displayName: player.displayName, text: text.replace(/[\u0000-\u001f\u007f]/g, ' '), sentAt: Date.now() };
      for (const [id, target] of this.sessions) {
        if (target.revoked || target.blocked.has(player.id) || sender.blocked.has(id)) continue;
        const recipient = this.state.players.get(id)!;
        if (recipient.connected && distance(player, recipient) <= CHAT_RADIUS) target.client.send('chat.message', message);
      }
    });
    this.handle('blackjack.join', z.object({ tableId: z.literal('blackjack-1') }).strict(), 3, (client) => this.joinTable(client));
    this.handle('blackjack.leave', z.object({}).strict(), 3, (client) => this.leaveTable(client));
    this.handle('blackjack.start', z.object({ tableId: z.literal('blackjack-1') }).strict(), 2, (client) => {
      this.cleanTable(); this.blackjack.start(this.player(client).id); this.syncTable();
    });
    this.handle('blackjack.action', z.object({ action: z.enum(['hit', 'stand']) }).strict(), 5, (client, { action }) => { this.blackjack.act(this.player(client).id, action); this.syncTable(); });
    this.handle('ping', z.object({ at: z.number().finite() }).strict(), 3, (client, { at }) => client.send('pong', { at }));
  }

  private handle<T>(name: string, schema: { safeParse(data: unknown): { success: true; data: T } | { success: false } }, limit: number, handler: (client: Client, payload: T) => void|Promise<void>): void {
    this.onMessage(name, async (client, message) => {
      const presence = this.forClient(client);
      if (!presence || presence.revoked || !this.state.players.get(presence.ticket.userId)?.connected) return;
      const now = Date.now();
      const recent = (presence.rates.get(name) || []).filter(t => now - t < 1000);
      presence.rates.set(name, recent);
      const rejected = (reason: string) => worldMetrics.inc('bar_world_commands_rejected_total', 'Commands refused by the room', { command: name, reason });
      if (recent.length >= limit) { rejected('rate_limit'); return; }
      recent.push(now);
      const parsed = schema.safeParse(message);
      if (!parsed.success) { rejected('invalid'); client.send('error', { message: 'Comando inválido.' }); return; }
      const subject = this.state.players.get(presence.ticket.userId)!;
      if (NEEDS_CONSCIOUS.has(name) && !isConscious(subject)) { rejected('unconscious'); client.send('error', { message: subject.condition === 'fainted' ? 'Você está desacordado.' : 'Espere recuperar o equilíbrio.' }); return; }
      try { await handler(client, parsed.data); } catch (e) { rejected('refused'); client.send('error', { message: e instanceof Error ? e.message : 'Não foi possível executar essa ação.' }); }
    });
  }

  private step(): void {
    const now = Date.now();
    this.state.serverTime = now;
    for (const [id, presence] of this.sessions) {
      const player = this.state.players.get(id)!;
      if (!player.connected || presence.revoked) continue;
      if(presence.gestureEndsAt&&now>=presence.gestureEndsAt){
        if(player.animationState===presence.gestureState)player.animationState='idle';
        presence.gestureEndsAt=undefined;presence.gestureState=undefined;
      }
      // The drink is finished and leaves the hand together with the interaction.
      if (presence.interactionEndsAt && now >= presence.interactionEndsAt) this.finishInteraction(player, presence, now);
      // A job task keeps the hands busy for its whole duration (the use clip is shorter, so it restarts).
      if (player.interactionState === 'job' && player.animationState === 'use' && now - player.animationStartedAt >= TASK_GESTURE_MS) player.animationStartedAt = now;
      const input = presence.queue.shift();
      let moving = false, running = false;
      if (input) {
        if (!player.interactionState) {
          // Running needs stamina; a drunk walk drifts. The client predicts both with the same shared rules.
          running = input.running && !player.oldWalk && this.needs.canRun(id) && !!(input.dx || input.dz);
          const position = movePlayer(player, swayInput({ ...input, running }, input.seq, player.drunk, player.id), TICK_MS/1000, player.oldWalk, hasStagePass(player));
          moving = position.x !== player.x || position.z !== player.z;
          running &&= moving;
          player.x = position.x; player.y = position.y!; player.z = position.z; player.rotation = input.rotation;
          if (input.dx || input.dz) player.animationState = running ? 'run' : 'walk';
          else if (player.animationState === 'walk' || player.animationState === 'run') player.animationState = 'idle';
        }
        player.lastProcessedInput = input.seq;
      } else if (now - presence.lastInputAt > 250 && ['walk', 'run'].includes(player.animationState)) player.animationState = 'idle';
      for (const event of this.needs.tick(player, TICK_MS / 1000, now, { running, moving })) this.onNeeds(player, presence, event, now);
      if (player.stageUntil && now >= player.stageUntil) this.endStagePass(player, presence);
      if (presence.recoveryMoveAt && now >= presence.recoveryMoveAt) this.moveToRecovery(player, presence);
    }
    for (const end of this.musicians.update(now, id => this.state.players.get(id)?.connected)) this.finishMusician(end);
    this.blackjack.tick(now);
    this.syncTable();
    if (this.resultsResetAt && now >= this.resultsResetAt) { this.blackjack.resetRound(); this.resultsResetAt = 0; this.cleanTable(); this.syncTable(); }
    if (this.events.update(now, this.state.occupancy)) this.syncEvent(now);
    this.serveDrinks(now);
    this.serveTables(now);
    this.runJobs(now);
    this.npcs.update(this.state.npcs.values(), [...this.state.players.values()].filter(p => p.connected), this.state.event.type, now);
    if (++this.tickCount % 2 === 0) this.refreshViews();
  }

  private serveDrinks(now: number): void {
    const bartender = this.state.npcs.get('bartender');
    if (!bartender) return;
    const waiting = (id: string) => { const p = this.state.players.get(id); return p?.connected && p.interactionState === 'counter' ? p : undefined; };
    const served = this.service.update(bartender, waiting, now);
    const player = served ? waiting(served) : undefined, presence = served ? this.sessions.getByUser(served) : undefined;
    if (!player || !presence) return;
    presence.counterCharge = undefined;
    player.animationState = 'drink'; player.animationStartedAt = now; presence.interactionEndsAt = now + DRINK_DURATION_MS;
    this.systemMessage(`O Magrão serviu ${player.displayName}. Saúde!`, player);
  }

  private async interact(client: Client, objectId: string, item: DrinkItem = 'garrafa'): Promise<void> {
    const player = this.player(client), presence = this.forClient(client)!, now = Date.now();
    if (objectId === 'stand') {
      if (player.animationState === 'kick') throw new Error('Espere o golpe terminar.');
      // On the stage, standing up is putting the instrument back: the stop clip plays first.
      if (player.interactionState.startsWith('stage-')) { this.musicians.stop(player.id, now); return; }
      if (player.currentTableId) this.leaveTable(client);
      else { this.consumePart(player, presence, now); this.cancelCounter(player.id); if (player.interactionState.startsWith('seat-')) this.cancelTable(player.id); if (player.interactionState === 'job') this.jobs.interrupt(player.id); Object.assign(player, standingPosition(player, player.rotation)); player.interactionState = ''; player.animationState = 'idle'; player.drinkItem = ''; presence.interactionEndsAt = undefined; }
      return;
    }
    const object = INTERACTABLES.find(i => i.id === objectId);
    if (!object || !canInteract(object, player, INTERACTION_SLACK)) throw new Error('Chegue mais perto para interagir.');
    if (player.interactionState) throw new Error('Levante-se antes de interagir.');
    if (object.type === 'blackjack') { this.joinTable(client); return; }
    if(object.type!=='seat'){
      const target=interactionReach(object,player);
      if(Math.hypot(target.x-player.x,target.z-player.z)>.01)player.rotation=Math.atan2(target.x-player.x,target.z-player.z);
    }
    if (object.type === 'seat') {
      if ([...this.state.players.values()].some(p => p.interactionState === object.id)) throw new Error('Esse lugar está ocupado.');
      player.x = object.x; player.y = object.y ?? player.y; player.z = object.z; player.rotation = object.rotation || 0; player.animationState = 'sit'; player.interactionState = object.id;
    } else if (object.type === 'counter') {
      // Magrão charges first (the API decides); the player then waits and the drink starts when he finishes
      // preparing it (see serveDrinks). Anything that drops the order before that refunds it (cancelCounter).
      const price = catalogItem(item)?.price ?? 0, requestId = randomUUID();
      if (price) await this.charge(presence, price, `counter:${item}`, requestId);
      if (this.forClient(client) !== presence || !player.connected || player.interactionState || !canInteract(object, player, INTERACTION_SLACK)) {
        if (price) this.refund(presence, requestId, price);
        throw new Error('Você saiu do balcão. Moedas devolvidas.');
      }
      if (price) presence.counterCharge = { requestId, amount: price };
      player.animationState = 'wait'; player.animationStartedAt=Date.now();player.interactionState = object.id; presence.interactionEndsAt = undefined;
      player.drinkItem = item;
      this.service.order(player.id);
      this.systemMessage(`${player.displayName} pediu ${item === 'copo' ? 'um copo de chopp' : 'uma long neck'} ao Magrão.`, player);
    } else if (object.type === 'toilet') {
      if ([...this.state.players.values()].some(p => p !== player && p.interactionState === object.id)) throw new Error('Ocupado. Espere a sua vez.');
      player.animationState = 'toilet';player.animationStartedAt=now;player.interactionState = object.id; presence.interactionEndsAt = now + NEEDS.bladder.toiletSeconds * 1000;
    } else if (object.type === 'door') {this.toggleDoor(player, object.id);this.playTemporary(player,presence,'use',USE_DURATION_MS);}
    else if (object.type === 'stage') client.send('stage.open', { until: player.stageUntil, price: this.config.prices.stage });
    else if (object.type === 'musician') this.startMusician(player, presence, object.spot!, now);
    else if (object.type === 'television') { this.requireMedia('tv',client,object.media!);this.playTemporary(player,presence,'use',USE_DURATION_MS);client.send('tv.open',{id:object.media}); }
    else { this.requireMedia('jukebox',client,object.media!);this.playTemporary(player,presence,'use',USE_DURATION_MS);client.send('jukebox.open',{id:object.media}); }
  }

  /** Charges coins through the API; refuses the action when the wallet cannot pay. */
  private async charge(presence:Presence,amount:number,reason:string,requestId:string):Promise<void> {
    const change=await changeWallet(presence.ticket,-amount,reason,requestId);
    this.walletChanged(presence,change.balance,change.applied,reason);
  }
  /** Gives a charge back; retried until the API takes it (WalletRetries). */
  private refund(presence:Presence,requestId:string,amount:number):void {
    void this.walletRetries.credit(presence.ticket,amount,`refund:${requestId}`,randomUUID(),change=>this.walletChanged(presence,change.balance,change.applied,'refund'));
  }
  private walletChanged(presence:Presence,balance:number,delta:number,reason:string):void {
    presence.balance=balance;
    if(this.sessions.getByUser(presence.ticket.userId)===presence)presence.client.send('wallet.state',{balance,delta,reason:reason.split(':')[0]});
  }
  private mediaPrice(kind:'jukebox'|'tv',id:string):MediaPriceKind {return kind==='jukebox'?'jukebox':id==='telao'?'telao':'tv';}
  /** Drops a counter order not served yet, refunding what Magrão charged. */
  private cancelCounter(playerId:string):void {
    this.service.cancel(playerId);
    const presence=this.sessions.getByUser(playerId),charge=presence?.counterCharge;
    if(presence&&charge){presence.counterCharge=undefined;this.refund(presence,charge.requestId,charge.amount);}
  }
  private cancelTable(playerId:string,message?:string):void {
    const presence=this.sessions.getByUser(playerId);
    for(const order of this.waiter.cancel(playerId)){
      this.refundOrder(order);this.served.removeOrder(order.id);
      if(presence&&message)presence.client.send('table.state',{status:'cancelled',order:publicOrder(order),message});
    }
  }
  /** A table order carries the wallet it was charged to, so its refund never depends on the session still being here. */
  private refundOrder(order:TableOrder):void {
    void this.walletRetries.credit(order.owner,order.total,`refund:${order.id}`,randomUUID(),change=>{const presence=this.sessions.getByUser(order.playerId);if(presence)this.walletChanged(presence,change.balance,change.applied,'refund');});
  }
  private serveTables(now:number):void {
    const tonico=this.state.npcs.get('tonico');if(!tonico)return;
    const events=this.waiter.update(tonico,order=>{
      const player=this.state.players.get(order.playerId),seat=INTERACTABLES.find(i=>i.id===order.seatId);
      return player?.connected&&player.interactionState===order.seatId&&seat?{x:seat.x,y:seat.y??player.y,z:seat.z}:undefined;
    },now);
    if(events.placing)this.served.place(events.placing.order,events.placing.plan,now);
    this.served.update(now,this.seated);
    if(events.delivered){
      const order=events.delivered,player=this.state.players.get(order.playerId),presence=this.sessions.getByUser(order.playerId);
      if(player)for(const id of order.items)this.needs.consume(player,id,now);
      presence?.client.send('table.state',{status:'delivered',order:publicOrder(order)});
      if(player)this.systemMessage(`O Tonico entregou o pedido de ${player.displayName}. Bom apetite!`,player);
      this.log('table_delivered',{playerId:order.playerId,orderId:order.id,total:order.total,waitMs:now-order.placedAt});
    }
    if(events.dropped){
      const {order,reason}=events.dropped,presence=this.sessions.getByUser(order.playerId);
      this.refundOrder(order);this.served.removeOrder(order.id);presence?.client.send('table.state',{status:'cancelled',order:publicOrder(order),message:reason});
      this.log('table_dropped',{playerId:order.playerId,orderId:order.id,reason});
    }
  }
  private runJobs(now:number):void {
    for(const event of this.jobs.tick(now)){
      const player=this.state.players.get(event.playerId),presence=this.sessions.getByUser(event.playerId);
      if(event.type==='paid'){
        if(player?.interactionState==='job'){player.interactionState='';player.animationState='idle';}
        // Wiping a table takes away what customers who left had on it.
        const table=/^mesa-(d+)$/.exec(event.stationId)?.[1];
        if(table)this.served.clearTable(Number(table),this.seated);
        this.payJob(event.payment);
        if(presence)this.sendJob(presence);
      }else if(player){
        if(player.interactionState==='job'){player.interactionState='';player.animationState='idle';}
        player.job='';presence?.client.send('job.state',{task:null,message:event.reason});this.syncJobs();
      }
    }
  }
  private payJob(payment:Payment):void {
    const presence=this.sessions.getByUser(payment.playerId);
    if(!presence){this.log('job_pay_without_session',{playerId:payment.playerId,reason:payment.reason});return;}
    void this.walletRetries.credit(presence.ticket,payment.amount,payment.reason,payment.requestId,change=>{
      this.jobs.paid(payment,change.applied);this.walletChanged(presence,change.balance,change.applied,'job');
      if(!change.applied&&this.sessions.getByUser(payment.playerId)===presence)presence.client.send('job.state',{...this.jobView(payment.playerId),message:'Você já atingiu o limite de ganhos por trabalho de hoje.'});
      else if(this.sessions.getByUser(payment.playerId)===presence)this.sendJob(presence);
    });
  }
  private endShift(player:Player,message:string):void {
    const shift=this.jobs.stop(player.id,Date.now());if(!shift)return;
    if(player.interactionState==='job'){player.interactionState='';player.animationState='idle';}
    player.job='';this.syncJobs();
    this.sessions.getByUser(player.id)?.client.send('job.state',{task:null,message});
    this.log('job_end',{playerId:player.id,jobId:shift.jobId,tasks:shift.tasks,earned:shift.earned});
  }
  private jobView(playerId:string){return {task:this.jobs.view(playerId)??null};}
  private sendJob(presence:Presence):void {presence.client.send('job.state',this.jobView(presence.ticket.userId));}
  private syncJobs():void {for(const view of this.jobs.slots())this.state.jobs.get(view.id)?.assign(view);}
  private requireAdmin(client:Client):string {
    const presence=this.forClient(client);if(presence?.ticket.role!=='admin')throw new Error('Acesso exclusivo da administração.');
    return presence.ticket.userId;
  }
  /** What the in-game administration panel shows to debug the world: people, orders, jobs, devices, queues. */
  private adminSnapshot(){
    const now=Date.now();
    return {
      at:now,occupancy:this.state.occupancy,capacity:this.state.capacity,
      players:[...this.state.players.values()].map(p=>({id:p.id,name:p.displayName,connected:p.connected,x:+p.x.toFixed(1),y:+p.y.toFixed(1),z:+p.z.toFixed(1),
        animation:p.animationState,interaction:p.interactionState,job:p.job,condition:p.condition,balance:this.sessions.getByUser(p.id)?.balance,
        stageMinutes:p.stageUntil?Math.max(0,Math.ceil((p.stageUntil-now)/60_000)):undefined})),
      npcs:[...this.state.npcs.values()].map(n=>({id:n.id,name:n.displayName,behavior:n.behavior,animation:n.animationState,x:+n.x.toFixed(1),z:+n.z.toFixed(1)})),
      waiter:this.waiter.snapshot(),servedItems:this.served.size,counterQueue:[...this.sessions].filter(([,p])=>p.counterCharge).map(([id])=>id),
      jobs:this.jobs.slots().map(slot=>({...slot,...this.jobs.totals.get(slot.id),workers:this.jobs.workers(slot.id).map(s=>({playerId:s.playerId,tasks:s.tasks,earned:s.earned,station:s.task.station.label,endsInS:Math.round((s.endsAt-now)/1000)}))})),
      media:[...[...this.state.jukeboxes.values()].map(m=>({kind:'jukebox',...m.toJSON()})),...[...this.state.televisions.values()].map(m=>({kind:'tv',...m.toJSON()}))],
      musicians:this.musicians.snapshot(),prices:this.config.prices,walletRetries:this.walletRetries.size,resultOutbox:this.results.pending,event:this.state.event.type,
      bots:{...this.bots.snapshot(),inBar:[...this.sessions].filter(([,p])=>p.ticket.bot).length,max:this.botRoom(),tickP95:worldMetrics.window('bar_world_tick_ms')?.percentile(95)},
    };
  }
  /** Places in the bar for bots: the capacity less the people who are not bots. */
  private botRoom():number {return Math.max(0,this.config.capacity-[...this.sessions].filter(([,p])=>!p.ticket.bot).length);}

  private setInventory(presence:Presence,stacks:readonly InventoryStack[]):void {
    presence.inventory=new Map(stacks.filter(stack=>stack.quantity>0&&itemById(stack.itemId)).map(stack=>[stack.itemId,stack.quantity]));
  }
  private sendInventory(presence:Presence,view?:Partial<InventoryView>):void {
    const stacks=[...presence.inventory].map(([itemId,quantity])=>({itemId,quantity}));
    presence.client.send('inventory.state',{capacity:INVENTORY_CAPACITY,usedSlots:stacks.length,...view,stacks});
  }
  private async removeInventory(presence:Presence,itemId:ItemId,quantity:number,reason:'use'|'discard'|'faint'):Promise<InventoryView>{
    if(presence.inventoryBusy)throw new Error('Aguarde a operação anterior da mochila.');
    if((presence.inventory.get(itemId)??0)<quantity)throw new Error('Você não tem este item na mochila.');
    presence.inventoryBusy=true;
    try{
      const view=await internal<InventoryView>('inventory',{sessionId:presence.ticket.sessionId,userId:presence.ticket.userId,itemId,quantity,reason,requestId:randomUUID()});
      this.setInventory(presence,view.stacks);return view;
    }finally{presence.inventoryBusy=false;}
  }
  private async useInventory(client:Client,itemId:ItemId):Promise<void>{
    const item=itemById(itemId);if(!item)throw new Error('Item inválido.');
    const player=this.player(client),presence=this.forClient(client)!;
    if(player.interactionState||player.currentTableId||player.animationState==='kick')throw new Error('Encerre a ação atual antes de usar um item.');
    const view=await this.removeInventory(presence,itemId,1,'use');
    if(this.forClient(client)!==presence||!player.connected)return;
    presence.inventoryItem=itemId;player.interactionState='inventory';player.animationStartedAt=Date.now();
    if(item.drink){player.animationState=item.prop?'drink':'use';player.drinkItem=item.prop??'';}
    else {player.animationState='use';player.drinkItem='';}
    presence.interactionEndsAt=player.animationStartedAt+(item.prop?DRINK_DURATION_MS:USE_DURATION_MS);
    this.sendInventory(presence,view);
  }

  /** A drink or a toilet visit ran its full time. */
  private finishInteraction(player: Player, presence: Presence, now: number): void {
    if(presence.inventoryItem){const used=presence.inventoryItem;this.needs.consume(player,used,now);presence.client.send('inventory.result',{action:'use',itemId:used,quantity:1});presence.inventoryItem=undefined;}
    else if (player.animationState === 'drink' && player.drinkItem) this.needs.consume(player, player.drinkItem, now);
    if (player.interactionState.startsWith('toilet-')) this.needs.relieve(player, now);
    player.interactionState = ''; player.animationState = 'idle'; player.drinkItem = ''; presence.interactionEndsAt = undefined;
  }
  /** Ending a drink or a toilet visit early counts the part already done. */
  private consumePart(player: Player, presence: Presence, now: number): void {
    if(presence.inventoryItem){this.needs.consume(player,presence.inventoryItem,now,(now-player.animationStartedAt)/Math.max(1,(presence.interactionEndsAt??now)-player.animationStartedAt));presence.inventoryItem=undefined;}
    else if (player.animationState === 'drink' && player.drinkItem) this.needs.consume(player, player.drinkItem, now, (now - player.animationStartedAt) / DRINK_DURATION_MS);
    if (player.interactionState.startsWith('toilet-') && presence.interactionEndsAt)
      this.needs.relieve(player, now, 1 - (presence.interactionEndsAt - now) / (NEEDS.bladder.toiletSeconds * 1000));
  }
  /** Falling ends whatever the character was doing: table, order, drink (spilled), chair, dance. */
  private knockDown(player: Player, presence: Presence): void {
    if (player.currentTableId) { this.blackjack.leave(player.id); player.currentTableId = ''; this.cleanTable(); this.syncTable(); }
    if (player.interactionState && player.interactionState !== 'fainted' && player.interactionState !== 'stumbling') Object.assign(player, standingPosition(player, player.rotation));
    // A musician who falls drops out at once: the spot is free and the instrument is back on its stand.
    this.musicians.release(player.id);
    this.cancelCounter(player.id);
    this.cancelTable(player.id);
    if (player.interactionState === 'job') this.jobs.interrupt(player.id);
    presence.inventoryItem=undefined;
    player.drinkItem = ''; presence.interactionEndsAt = undefined; presence.queue.length = 0;
    player.lastProcessedInput = presence.lastReceived;
  }
  private onNeeds(player: Player, presence: Presence, event: NeedsEvent, now: number): void {
    if (event.type === 'faint' || event.type === 'stumble') {
      this.knockDown(player, presence);
      player.interactionState = event.type === 'faint' ? 'fainted' : 'stumbling';
      player.animationState = event.type==='faint'?'fallen':'stumble'; player.animationStartedAt = now;
    }
    if (event.type === 'faint') {
      this.log('faint', { playerId: player.id, cause: event.cause });
      if (event.cause === 'alcohol') { presence.recoveryMoveAt = now + NEEDS.faint.moveAfterSeconds * 1000; this.systemMessage(`${player.displayName} bebeu demais e apagou.`, player); }
      else {
        this.systemMessage(`${player.displayName} desmaiou.`, player);
        // Keep the injectable inventory port useful for isolated modes/tests; the normal room uses the
        // persistent API-backed inventory below.
        const localLost=this.needs.loseItemOnFaint(player.id);
        if(localLost)presence.client.send('needs.itemLost',{item:localLost});
        else void this.loseInventoryOnFaint(presence);
      }
    }
    if ((event.type === 'woke' && player.interactionState === 'fainted') || (event.type === 'steady' && player.interactionState === 'stumbling')) {
      player.interactionState = '';
      if(event.type==='woke')this.playTemporary(player,presence,'recover',RECOVER_DURATION_MS);
      else player.animationState = 'idle';
    }
  }

  private async loseInventoryOnFaint(presence:Presence):Promise<void>{
    if(Math.random()>=NEEDS.faint.itemLossChance)return;
    const candidates=[...presence.inventory].filter(([id,quantity])=>quantity>0&&itemById(id)?.loseOnFaint);
    if(!candidates.length)return;
    const [itemId]=candidates[Math.floor(Math.random()*candidates.length)]!;
    try{const view=await this.removeInventory(presence,itemId,1,'faint');if(this.sessions.getByUser(presence.ticket.userId)!==presence)return;this.sendInventory(presence,view);presence.client.send('needs.itemLost',{item:itemId});}
    catch(error){this.log('inventory_loss_failed',{playerId:presence.ticket.userId,itemId,error:error instanceof Error?error.message:String(error)});}
  }

  /** Plays a synced gesture without claiming a chair/object. Movement may cancel it and is never reset later. */
  private playTemporary(player:Player,presence:Presence,state:AnimationState,duration:number):void {
    player.animationState=state;player.animationStartedAt=Date.now();
    presence.gestureState=state;presence.gestureEndsAt=player.animationStartedAt+duration;
  }
  /** Once per alcohol faint, after the fall: the body is taken to free floor around the recovery marker. */
  private moveToRecovery(player: Player, presence: Presence): void {
    presence.recoveryMoveAt = undefined;
    const marker = MAP_MARKERS[NEEDS.faint.alcoholRecoveryMarker as keyof typeof MAP_MARKERS];
    if (!marker || player.condition !== 'fainted') return;
    Object.assign(player, findSpawn([...this.state.players.values()].filter(p => p !== player), marker));
    presence.queue.length = 0; player.lastProcessedInput = presence.lastReceived;
    this.systemMessage(`Levaram ${player.displayName} para tomar um ar na calçada.`, player);
  }

  /**
   * Opens or closes a door. A leaf never swings through anybody: if the only one in its way is the
   * player using it, they step back out of the swing first; anyone else blocks the door.
   */
  private toggleDoor(player: Player, id: string): void {
    const door = DOORS.find(d => d.id === id)!, state = this.state.doors.get(id)!, open = !state.open;
    const bodies = [...this.state.players.values(), ...this.state.npcs.values()].filter(body => inDoorSweep(door, body, PLAYER_RADIUS));
    if (bodies.some(body => body !== player)) throw new Error(open ? 'Tem alguém atrás da porta.' : 'Tem alguém no caminho da porta.');
    setDoorStates([[id, open]]);
    if (bodies.length) {
      const away = Math.atan2(player.x - door.x, player.z - door.z), y = player.y;
      const spot = [0, .6, -.6, 1.2, -1.2].flatMap(turn => [.15, .3, .45, .6, .8, 1].map(step => ({ x: player.x + Math.sin(away + turn) * step, y, z: player.z + Math.cos(away + turn) * step })))
        .find(p => isWalkable(p.x, p.z, y) && !inDoorSweep(door, p, PLAYER_RADIUS));
      if (!spot) { setDoorStates([[id, !open]]); throw new Error('Dê um passo para trás para a porta passar.'); }
      player.x = spot.x; player.z = spot.z;
    }
    state.open = open; state.changedAt = Date.now();
    this.log('door', { playerId: player.id, door: id, open });
  }

  private requireMedia(kind:'jukebox'|'tv',client:Client,id:string):void {
    const name=kind==='jukebox'?'a jukebox':id==='telao'?'o telão':'a TV';
    // A TV group is controlled from any of its screens.
    const objects=INTERACTABLES.filter(o=>o.media===id&&o.type===(kind==='jukebox'?'jukebox':'television')),player=this.player(client);
    const states=kind==='jukebox'?this.state.jukeboxes:this.state.televisions;
    if(!states.has(id)||!objects.some(object=>canInteract(object,player,INTERACTION_SLACK)))throw new Error(`Chegue mais perto d${name}.`);
    if(player.interactionState||player.currentTableId||player.animationState==='kick')throw new Error(`Encerre a interação atual antes de usar ${name}.`);
  }

  /** At the stage's steps, free to act and without a valid pass: what buying one needs, before and after the charge. */
  private requireStage(player:Player):void {
    const steps=INTERACTABLES.find(i=>i.type==='stage')!;
    if(!canInteract(steps,player,INTERACTION_SLACK))throw new Error('Chegue à escada do palco para pegar o ingresso.');
    if(player.interactionState||player.currentTableId||player.animationState==='kick')throw new Error('Encerre a ação atual antes de subir no palco.');
    if(hasStagePass(player))throw new Error('Seu ingresso do palco ainda está valendo.');
  }
  /**
   * Takes one of the stage's musicians' spots (E within reach of it, up on the deck). The avatar goes to the spot, facing
   * its +Z, and stays there with movement locked until the stop clip ends (finishMusician); the clips move the body.
   */
  private startMusician(player:Player,presence:Presence,spotId:string,now:number):void {
    const spot=stageSpot(spotId);
    if(!spot)throw new Error('Esse lugar do palco não existe.');
    if(!onStage(player))throw new Error('Suba no palco para tocar.');
    this.musicians.start(spot.id,player.id,now);
    Object.assign(player,{x:spot.x,y:spot.y,z:spot.z,rotation:spot.yaw*Math.PI/180});
    player.interactionState=`stage-${spot.id}`;player.animationState='stage';player.animationStartedAt=now;player.drinkItem='';
    presence.gestureEndsAt=undefined;presence.queue.length=0;player.lastProcessedInput=presence.lastReceived;
    this.systemMessage(`${player.displayName} ${musicianRole(spot.id).taken} no palco.`,player);
    this.log('stage_musician',{playerId:player.id,spot:spot.id});
  }
  /** The stop clip ended: the musician stands where it left them, stepping out of the drum kit when that is where it was. */
  private finishMusician({playerId,spotId}:MusicianEnd):void {
    const player=this.state.players.get(playerId);
    if(!player||player.interactionState!==`stage-${spotId}`)return;
    Object.assign(player,standingPosition(player,player.rotation));
    player.interactionState='';player.animationState='idle';player.animationStartedAt=Date.now();
    const presence=this.sessions.getByUser(playerId);
    if(presence){presence.queue.length=0;player.lastProcessedInput=presence.lastReceived;}
  }
  /** A pass ran out: whoever is up there may stay until they come down; going up again takes a new one. */
  private endStagePass(player:Player,presence:Presence):void {
    player.stageUntil=0;
    presence.client.send('stage.state',{until:0,message:onStage(player)
      ?'Seu tempo no palco acabou. Pode ficar até descer; para subir de novo, pegue outro ingresso.':'Seu ingresso do palco venceu.'});
  }

  private joinTable(client: Client): void {
    const player = this.player(client);
    const object = INTERACTABLES.find(i => i.id === 'blackjack-1')!;
    if (!canInteract(object, player, INTERACTION_SLACK)) throw new Error('Chegue mais perto da mesa.');
    if (player.interactionState && !player.currentTableId) throw new Error('Levante-se primeiro.');
    this.cleanTable();
    this.blackjack.join(player.id, player.displayName);
    const seat = BLACKJACK_SEATS[this.blackjack.seats.findIndex(s => s.playerId === player.id)]!;
    player.x = seat.x; player.y = seat.y ?? player.y; player.z = seat.z; player.rotation = seat.rotation;
    player.currentTableId = object.id; player.interactionState = object.id; player.animationState = 'sit';
    this.syncTable();
  }

  private leaveTable(client: Client): void {
    const player = this.player(client);
    if (player.animationState === 'kick') throw new Error('Espere o golpe terminar.');
    this.blackjack.leave(player.id);
    Object.assign(player, standingPosition(player, player.rotation));
    player.currentTableId = ''; player.interactionState = ''; player.animationState = 'idle';
    this.cleanTable(); this.syncTable();
  }

  private cleanTable(): void {
    if (this.blackjack.phase === 'playing') return;
    for (const seat of [...this.blackjack.seats]) if (this.state.players.get(seat.playerId)?.currentTableId !== 'blackjack-1') this.blackjack.leave(seat.playerId);
  }

  private syncTable(): void {
    const snapshot = this.blackjack.snapshot();
    const json = JSON.stringify(snapshot);
    if (json === this.lastTableJson) return;
    this.lastTableJson = json;
    const state = this.state.tables.get('blackjack-1')!;
    state.phase = snapshot.phase === 'finished' ? 'results' : snapshot.phase;
    state.roundId = snapshot.roundId; state.turnPlayerId = snapshot.turnPlayerId || ''; state.deadline = snapshot.turnEndsAt; state.dealerTotal = snapshot.dealerTotal || 0;
    state.dealerCards = new ArraySchema(...snapshot.dealer.map(card => new CardState().assign(card || { rank: '?', suit: '' })));
    state.seats = new ArraySchema(...snapshot.seats.map(seat => new SeatState().assign({
      playerId: seat.playerId, displayName: seat.displayName, total: seat.total,
      status: seat.result ? 'finished' : seat.total > 21 ? 'bust' : seat.blackjack ? 'blackjack' : seat.stood ? 'stand' : snapshot.turnPlayerId === seat.playerId ? 'turn' : 'waiting',
      result: seat.result === 'push' ? 'draw' : seat.result || '',
      cards: new ArraySchema(...seat.cards.map(card => new CardState().assign(card))),
    })));
    if (snapshot.phase === 'finished' && !this.resultsResetAt) this.resultsResetAt = Date.now() + 10_000;
    if (snapshot.phase !== 'finished') this.resultsResetAt = 0;
    const dealer = this.state.npcs.get('dealer');
    const animation = snapshot.phase === 'playing' ? 'deal' : snapshot.phase === 'finished' ? 'shuffle' : 'idle';
    if (dealer && dealer.animationState !== animation) { dealer.animationState = animation; dealer.animationStartedAt = Date.now(); }
  }

  private syncEvent(now: number): void {
    const current = this.events.current;
    this.state.event.type = current.kind === 'none' ? '' : eventTypes[current.kind];
    this.state.event.id = current.kind === 'none' ? '' : randomUUID();
    this.state.event.startedAt = current.kind === 'none' ? 0 : now;
    this.state.event.durationMs = current.kind === 'none' ? 0 : current.endsAt - now;
    if (current.kind !== 'none') this.systemMessage(`${current.title} ${current.description}`);
  }

  private refreshViews(): void {
    for (const [id, presence] of this.sessions) {
      const self = this.state.players.get(id);
      if (!self || !presence.client.view) continue;
      const visible = new Set<Schema>();
      for (const player of this.state.players.values()) if (player.id === id || distance(self, player) <= AOI_RADIUS) visible.add(player);
      for (const npc of this.state.npcs.values()) if (distance(self, npc) <= AOI_RADIUS) visible.add(npc);
      for (const old of presence.seen) if (!visible.has(old)) presence.client.view.remove(old);
      for (const item of visible) if (!presence.seen.has(item)) presence.client.view.add(item);
      presence.seen = visible;
    }
  }

  private async maintenance(): Promise<void> {
    if (this.maintenanceBusy) return;
    this.maintenanceBusy = true;
    try {
      this.sessions.pruneExpiredNonces(Date.now());
      const checks = await Promise.allSettled([...this.sessions].map(async ([id, p]) => {
        const access = await validateAccess(p.ticket.sessionId, id);
        // The snapshot may be stale after a takeover. In particular, an invalid response for the
        // previous API session must never expel the presence that replaced it while this awaited.
        if (p.revoked || !this.sessions.isCurrent(id, p)) return;
        if (!access.valid){if(access.banned)this.removeByAdmin(id,'ban','Sua conta está banida do bar.');else this.expel(id, 'Sua sessão terminou ou a conta foi suspensa.');}
        else { p.blocked = new Set(access.blocked); p.ticket.role = access.role;const player=this.state.players.get(id);if(player)this.applyAppearance(player,access); }
      }));
      if (checks.some(r => r.status === 'rejected')) this.log('auth_refresh_unavailable', {});
      const { applied, failed } = await this.controls.poll(control => this.applyControl(control));
      health.apiOkAt = Date.now();
      if (applied.length) worldMetrics.inc('bar_world_controls_total', 'Administrative controls confirmed', { outcome: 'applied' }, applied.length);
      if (failed.length) worldMetrics.inc('bar_world_controls_total', 'Administrative controls confirmed', { outcome: 'failed' }, failed.length);
      for (const id of failed) this.log('event_control_rejected', { id });
      await this.results.flush();
      await this.walletRetries.flush();
    } catch (e) {
      worldMetrics.inc('bar_world_maintenance_failures_total', 'Maintenance rounds that failed (API unreachable or refused)');
      this.log('maintenance_retry', { message: e instanceof Error ? e.message : 'error', requestId: (e as { requestId?: string }).requestId });
    }
    finally { this.maintenanceBusy = false; }
  }

  /** One administrative control. Throws to reject it for good (the API records it as failed). */
  private applyControl(control: Control): void {
    if ((control.action === 'kick' || control.action === 'ban') && control.playerId){
      const presence=this.sessions.getByUser(control.playerId);
      // A queued kick ends the participation that existed when it was issued, never a later join.
      if(presence&&(control.action!=='kick'||control.issuedAt===undefined||presence.joinedAt<=control.issuedAt))this.removeByAdmin(control.playerId,control.action,control.reason||'Um administrador encerrou sua participação.');
    }
    if (control.action === 'event') {
      // An undo for an event that is no longer the current one has nothing left to stop: done, not failed.
      if(control.expectedControlId&&(this.administrativeEvent?.commandId!==control.expectedControlId||this.administrativeEvent.eventId!==this.state.event.id))return;
      if (control.eventType === 'STOP' || control.eventType === '') this.events.stop();
      else if (control.eventType && eventKinds[control.eventType]) { this.events.stop(); this.events.start(eventKinds[control.eventType]); }
      else throw new Error(`Evento desconhecido: ${control.eventType}`);
      this.syncEvent(Date.now());
      this.administrativeEvent=control.eventType==='STOP'||control.eventType===''?undefined:{commandId:control.id,eventId:this.state.event.id};
    }
  }

  private applyAppearance(player:Player,access:Access):void {
    // A response without the collection (invalid session) leaves the avatar as it is.
    if(player.animationState==='kick'||!access.ownedSkins)return;
    const requested=access.equippedSkin??DEFAULT_SKIN;
    player.skin=access.ownedSkins.includes(requested)?requested:DEFAULT_SKIN;
  }

  private recordResult(roundId: string, userId: string, result: Result): void {
    const outcome: MatchResult = result === 'push' ? 'draw' : result;
    try { this.results.record(roundId, userId, outcome); health.outboxWritable = true; }
    catch (error) {
      health.outboxWritable = false; this.log('result_outbox_unavailable', { roundId, playerId: userId, error: error instanceof Error ? error.message : String(error) }); }
  }

  private removeByAdmin(userId:string,kind:'kick'|'ban',reason:string):void {
    const presence=this.sessions.getByUser(userId);if(!presence||presence.revoked)return;
    presence.client.send('moderation.removed',{kind,reason});this.expel(userId,reason);
  }
  private expel(userId: string, reason: string): void {
    const presence = this.sessions.getByUser(userId);
    if (!presence) return;
    presence.revoked = true;
    presence.client.send('error', { message: reason });
    presence.rejectReconnect?.();
    presence.client.leave(4000);
    if (!this.state.players.get(userId)?.connected) this.onLeave(presence.client);
    this.log('expel', { playerId: userId, reason });
  }
  /** Sends a speaker's packet to every connected listener in earshot who has not blocked them (or been blocked). */
  private relayVoice(client: Client, bytes: Uint8Array): void {
    const presence = this.forClient(client);
    if (!presence || presence.revoked) return;
    const speaker = this.state.players.get(presence.ticket.userId);
    if (!speaker?.connected || !speaker.voice || !decodeVoicePacket(bytes)) return;
    const now = Date.now();
    if (now - presence.voiceWindowAt >= 1000) { presence.voiceWindowAt = now; presence.voicePackets = 0; }
    if (++presence.voicePackets > VOICE.maxPacketsPerSecond) return;
    let frame: Uint8Array | undefined;
    for (const [id, listener] of this.sessions) {
      if (id === speaker.id || listener.revoked || !listener.listening || listener.blocked.has(speaker.id) || presence.blocked.has(id)) continue;
      const other = this.state.players.get(id);
      if (!other?.connected || distance(speaker, other) > VOICE.maxDistance) continue;
      frame ??= wrapVoice(speaker.id, bytes);
      listener.client.sendBytes('voice', frame);
    }
  }

  private forClient(client: Client): Presence | undefined { return this.sessions.getByClient(client); }
  private player(client: Client): Player { const p = this.forClient(client); if (!p) throw new Error('Sessão não encontrada.'); return this.state.players.get(p.ticket.userId)!; }
  private systemMessage(text: string, origin?: Player): void {
    const message: ChatMessage = { id: randomUUID(), playerId: 'system', displayName: 'B.A.R.', text, sentAt: Date.now(), system: true };
    for (const [id, p] of this.sessions) if (this.state.players.get(id)?.connected && (!origin || distance(origin, this.state.players.get(id)!) <= CHAT_RADIUS)) p.client.send('chat.message', message);
  }
  /** JSON lines with the room and pseudonymous player ids (apps/server/src/observability.ts). */
  private log(event: string, details: Record<string, unknown>): void { console.log(logLine(event, details, this.roomId)); }
}
