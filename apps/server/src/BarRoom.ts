import { randomUUID } from 'node:crypto';
import { Client, Room, ServerError } from '@colyseus/core';
import { ArraySchema, Schema, StateView } from '@colyseus/schema';
import { z } from 'zod';
import { AOI_RADIUS, BLACKJACK_SEATS, CHAT_RADIUS, DEFAULT_SKIN, DRINK_DURATION_MS, KICK_DURATION_MS, INTERACTABLES, PATCH_MS, TICK_MS, canInteract, distance, findSpawn, standingPosition, inputSchema, movePlayer, skinMessageSchema, skinSchema, type ChatMessage, type PlayerInput, VOICE, decodeVoicePacket, voiceStateSchema, wrapVoice, DOORS, PLAYER_RADIUS, inDoorSweep, isWalkable, setDoorStates, DRINK_ITEMS, type DrinkItem } from '@bar/shared';
import { verifyTicket, type GameTicket } from '@bar/shared/tickets';
import { Access, internal, validateAccess, type Control } from './internal.js';
import { BarState, CardState, DoorState, Player, SeatState, TableState } from './state.js';
import { BlackjackTable, type Result } from './minigames/blackjack.js';
import { EventDirector, type EventKind } from './world/events.js';
import { createNpcs, NpcDirector } from './world/npcs.js';
import { BarService } from './world/bartender.js';
import { NeedsDirector } from './world/needs.js';
import { NEEDS, MAP_MARKERS, isConscious, swayInput, type NeedsEvent } from '@bar/shared';
import {JUKEBOX_SYSTEMS,TV_SYSTEMS,initialJukebox,jukeboxCommandSchema,commandJukebox,jukeboxTime,type JukeboxState} from '@bar/shared';
import {Jukebox} from './state.js';

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
  rates: Map<string, number[]>;
  /** After an alcohol faint: when the fallen body is taken to the recovery point (once). */
  recoveryMoveAt?: number;
  /** Wants to hear proximity voice (the player can switch other voices off). */
  listening: boolean;
  /** Voice packets relayed in the current one-second window. */
  voicePackets: number;
  voiceWindowAt: number;
}
// Actions that need a conscious character; chat, voice and movement input stay available (input is ignored).
const NEEDS_CONSCIOUS = new Set(['player.interact', 'player.emote', 'player.skin', 'player.appearance', 'blackjack.join', 'blackjack.start', 'blackjack.action', 'jukebox.command', 'tv.command']);
const eventTypes: Record<EventKind, string> = { blackout: 'BLACKOUT', troublemaker: 'DRUNK_NPC', party: 'PARTY' };
const eventKinds: Record<string, EventKind> = { BLACKOUT: 'blackout', DRUNK_NPC: 'troublemaker', PARTY: 'party' };

export class BarRoom extends Room<{ state: BarState }> {
  private administrativeEvent?:{commandId:string;eventId:string};
  static activeId: string | undefined;
  state = new BarState();
  private people = new Map<string, Presence>();
  private usedTickets = new Map<string, number>();
  private blackjack = new BlackjackTable('blackjack-1', (roundId, userId, result) => this.recordResult(roundId, userId, result), undefined,
    Math.max(5000, Number(process.env.BLACKJACK_TURN_MS) || 25_000));
  private eventMinimum = Math.max(1000, Number(process.env.EVENT_MIN_MS) || 300_000);
  private events = new EventDirector(
    this.eventMinimum,
    Math.max(this.eventMinimum, Number(process.env.EVENT_MAX_MS) || 600_000),
  );
  private npcs = new NpcDirector();
  private service = new BarService();
  /** HP, stamina, hunger, thirst, bladder and drunkenness of every avatar (packages/shared/src/needs.ts). */
  readonly needs = new NeedsDirector();
  private results = new Map<string, Map<string, 'win' | 'loss' | 'draw'>>();
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
    this.maxClients = Math.max(2, Math.min(128, Number(process.env.ROOM_CAPACITY || process.env.BAR_CAPACITY) || 32));
    this.maxMessagesPerSecond = 100;
    this.state.capacity = this.maxClients;
    this.setPatchRate(PATCH_MS);
    this.state.tables.set('blackjack-1', new TableState());
    // Doors start open, as authored in the map; the shared physics mirrors this room's door states.
    setDoorStates(DOORS.map(door => [door.id, true] as const));
    for (const door of DOORS) this.state.doors.set(door.id, new DoorState().assign({ id: door.id, open: true }));
    for(const system of JUKEBOX_SYSTEMS)this.state.jukeboxes.set(system.id,new Jukebox().assign(initialJukebox(system.id,system.tvId)));
    for(const system of TV_SYSTEMS)this.state.televisions.set(system.id,new Jukebox().assign(initialJukebox(system.id,system.tvId)));
    for (const npc of createNpcs()) this.state.npcs.set(npc.id, npc);
    this.setFixedTimestep(() => this.step(), 1000 / TICK_MS);
    this.clock.setInterval(() => { void this.maintenance(); }, 3000);
    this.registerMessages();
  }

  async onAuth(_client: Client, options: unknown): Promise<GameTicket & Access> {
    const { ticket: token } = z.object({ ticket: z.string().max(4096) }).parse(options);
    let ticket: GameTicket;
    try { ticket = verifyTicket(token); } catch { throw new ServerError(401, 'Sua entrada expirou. Entre novamente.'); }
    if (this.usedTickets.has(ticket.nonce)) throw new ServerError(401, 'Ticket já utilizado.');
    // Reserve before awaiting so a concurrent redemption cannot reuse the nonce.
    this.usedTickets.set(ticket.nonce, ticket.exp);
    const access = await validateAccess(ticket.sessionId, ticket.userId);
    if (!access.valid) throw new ServerError(401, 'Sessão encerrada ou conta suspensa.');
    if(!access.character)throw new ServerError(409,'Crie seu personagem antes de entrar.');
    return { ...ticket,...access };
  }

  onJoin(client: Client, _options: unknown, auth: GameTicket & Access): void {
    // A new login takes over at once: from another tab, or from a session still waiting to reconnect.
    const previous = this.people.get(auth.userId);
    if (previous) this.replaceSession(previous);
    // The browser remembers the chosen skin and sends it on join; anything unknown falls back to the default.
    const skin=auth.equippedSkin==='custom'||auth.ownedSkins?.includes(auth.equippedSkin??'')?auth.equippedSkin!:DEFAULT_SKIN;
    const character=JSON.stringify(auth.character);
    // Avatars stay in the bar after their player leaves; logging in again takes control of the same one.
    let player = this.state.players.get(auth.userId);
    if (player) {
      this.park(player);
      player.assign({ displayName: auth.displayName, color: auth.color, connected: true, lastProcessedInput: -1 });
      player.skin=skin;player.character=character;
    } else {
      player = new Player().assign({ id: auth.userId, displayName: auth.displayName, color: auth.color, skin, character,...findSpawn([...this.state.players.values()]), rotation: Math.PI / 2 });
      this.state.players.set(auth.userId, player);
    }
    this.needs.sync(player, Date.now());
    client.view = new StateView();
    this.people.set(auth.userId, { joinedAt:Date.now(),ticket: auth, client, blocked: new Set(auth.blocked), queue: [], lastReceived: -1, lastInputAt: Date.now(), seen: new Set(), revoked: false, rates: new Map(), listening: true, voicePackets: 0, voiceWindowAt: 0 });
    this.state.occupancy = this.people.size;
    this.refreshViews();
    this.syncTable();
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
    this.service.cancel(presence.ticket.userId);
    if (player?.interactionState === 'counter' && player.animationState !== 'drink') player.interactionState = '';
    const reservation = this.allowReconnection(client, 30);
    presence.rejectReconnect = () => reservation.reject();
  }

  async onReconnect(client: Client): Promise<void> {
    const presence = this.forClient(client);
    if (!presence || presence.revoked) { client.leave(4000); return; }
    presence.client = client;
    // An API that does not answer in time is not an ended session: keep the player. Maintenance revalidates
    // every few seconds and expels then if the session really ended.
    const access = await validateAccess(presence.ticket.sessionId, presence.ticket.userId).catch(() => undefined);
    if (access && !access.valid) { if(access.banned)this.removeByAdmin(presence.ticket.userId,'ban','Sua conta está banida do bar.');else this.expel(presence.ticket.userId, 'Sua sessão terminou. Entre novamente.'); return; }
    if (!access) this.log('auth_refresh_unavailable', { playerId: presence.ticket.userId });
    if (access) presence.blocked = new Set(access.blocked);
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
    this.people.delete(userId);
    const player = this.state.players.get(userId);
    // Expelled players are removed; everyone else leaves the avatar standing (or seated) where it was.
    if (presence.revoked) { this.blackjack.leave(userId); this.service.cancel(userId); this.needs.forget(userId); this.state.players.delete(userId); }
    else if (player) { this.park(player); player.connected = false; }
    this.state.occupancy = this.people.size;
    this.refreshViews();
    this.syncTable();
    this.log('leave', { playerId: userId });
  }

  /** Ends what needs a connected player (blackjack seat, orders, drinks, kicks); a chair stays taken. */
  private park(player: Player): void {
    player.drinkItem = '';
    this.blackjack.leave(player.id);
    this.service.cancel(player.id);
    if (player.currentTableId) Object.assign(player, standingPosition(player, player.rotation));
    player.currentTableId = '';
    // The microphone belongs to a session; a new one switches it on again itself.
    player.voice = false;
    if (player.animationState !== 'sit' && player.condition !== 'fainted') { player.interactionState = ''; player.animationState = 'idle'; }
  }

  /** Closes an older session of the same account without touching its avatar, which the new one takes. */
  private replaceSession(previous: Presence): void {
    this.people.delete(previous.ticket.userId);
    previous.rejectReconnect?.();
    if (this.state.players.get(previous.ticket.userId)?.connected) {
      previous.client.send('error', { message: 'Sua conta entrou no bar em outra janela.' });
      previous.client.leave(4000);
    }
  }

  onDispose(): void { if (BarRoom.activeId === this.roomId) BarRoom.activeId = undefined; }

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
    // The jukebox and the TVs are separate sources: own state map, own messages, same validation.
    for(const kind of ['jukebox','tv'] as const){
      const states=kind==='jukebox'?this.state.jukeboxes:this.state.televisions;
      this.handle(`${kind}.command`,jukeboxCommandSchema,4,(client,command)=>{
        this.requireMedia(kind,client,command.id);
        const state=states.get(command.id)!;
        state.assign(commandJukebox(state as unknown as JukeboxState,command,this.player(client).id,Date.now()));
        client.send(`${kind}.result`,{id:command.id,revision:state.revision});
      });
      // End notifications cannot overwrite a newer selection or another controller.
      this.handle(`${kind}.ended`,z.object({id:z.string().max(64),revision:z.number().int().min(0),videoId:z.string().length(11),duration:z.number().finite().positive().max(86400)}).strict(),2,(client,report)=>{
        const state=states.get(report.id);
        if(!state||state.updatedBy!==this.player(client).id||state.revision!==report.revision||state.videoId!==report.videoId||state.status!=='playing')return;
        if(Math.abs(jukeboxTime(state as unknown as JukeboxState,Date.now())-report.duration)>8)return;
        state.assign({status:'ended',position:report.duration,updatedAt:Date.now(),revision:state.revision+1});
      });
    }
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
      p.animationState = emote === 'dance' ? 'dance' : 'idle';
      if (emote === 'wave') this.systemMessage(`${p.displayName} acenou para o pessoal.`, p);
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
      for (const [id, target] of this.people) {
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
      if (recent.length >= limit) return;
      recent.push(now);
      const parsed = schema.safeParse(message);
      if (!parsed.success) { client.send('error', { message: 'Comando inválido.' }); return; }
      const subject = this.state.players.get(presence.ticket.userId)!;
      if (NEEDS_CONSCIOUS.has(name) && !isConscious(subject)) { client.send('error', { message: subject.condition === 'fainted' ? 'Você está desacordado.' : 'Espere recuperar o equilíbrio.' }); return; }
      try { await handler(client, parsed.data); } catch (e) { client.send('error', { message: e instanceof Error ? e.message : 'Não foi possível executar essa ação.' }); }
    });
  }

  private step(): void {
    const now = Date.now();
    this.state.serverTime = now;
    for (const [id, presence] of this.people) {
      const player = this.state.players.get(id)!;
      if (!player.connected || presence.revoked) continue;
      // The drink is finished and leaves the hand together with the interaction.
      if (presence.interactionEndsAt && now >= presence.interactionEndsAt) this.finishInteraction(player, presence, now);
      const input = presence.queue.shift();
      let moving = false, running = false;
      if (input) {
        if (!player.interactionState) {
          // Running needs stamina; a drunk walk drifts. The client predicts both with the same shared rules.
          running = input.running && !player.oldWalk && this.needs.canRun(id) && !!(input.dx || input.dz);
          const position = movePlayer(player, swayInput({ ...input, running }, input.seq, player.drunk, player.id), TICK_MS/1000, player.oldWalk);
          moving = position.x !== player.x || position.z !== player.z;
          running &&= moving;
          player.x = position.x; player.y = position.y!; player.z = position.z; player.rotation = input.rotation;
          if (input.dx || input.dz) player.animationState = running ? 'run' : 'walk';
          else if (player.animationState === 'walk' || player.animationState === 'run') player.animationState = 'idle';
        }
        player.lastProcessedInput = input.seq;
      } else if (now - presence.lastInputAt > 250 && ['walk', 'run'].includes(player.animationState)) player.animationState = 'idle';
      for (const event of this.needs.tick(player, TICK_MS / 1000, now, { running, moving })) this.onNeeds(player, presence, event, now);
      if (presence.recoveryMoveAt && now >= presence.recoveryMoveAt) this.moveToRecovery(player, presence);
    }
    this.blackjack.tick(now);
    this.syncTable();
    if (this.resultsResetAt && now >= this.resultsResetAt) { this.blackjack.resetRound(); this.resultsResetAt = 0; this.cleanTable(); this.syncTable(); }
    if (this.events.update(now, this.state.occupancy)) this.syncEvent(now);
    this.serveDrinks(now);
    this.npcs.update(this.state.npcs.values(), [...this.state.players.values()].filter(p => p.connected), this.state.event.type, now);
    if (++this.tickCount % 2 === 0) this.refreshViews();
  }

  private serveDrinks(now: number): void {
    const bartender = this.state.npcs.get('bartender');
    if (!bartender) return;
    const waiting = (id: string) => { const p = this.state.players.get(id); return p?.connected && p.interactionState === 'counter' ? p : undefined; };
    const served = this.service.update(bartender, waiting, now);
    const player = served ? waiting(served) : undefined, presence = served ? this.people.get(served) : undefined;
    if (!player || !presence) return;
    player.animationState = 'drink'; player.animationStartedAt = now; presence.interactionEndsAt = now + DRINK_DURATION_MS;
    this.systemMessage(`O Seu Zé serviu ${player.displayName}. Saúde!`, player);
  }

  private interact(client: Client, objectId: string, item: DrinkItem = 'garrafa'): void {
    const player = this.player(client), presence = this.forClient(client)!, now = Date.now();
    if (objectId === 'stand') {
      if (player.animationState === 'kick') throw new Error('Espere o golpe terminar.');
      if (player.currentTableId) this.leaveTable(client);
      else { this.consumePart(player, presence, now); this.service.cancel(player.id); Object.assign(player, standingPosition(player, player.rotation)); player.interactionState = ''; player.animationState = 'idle'; player.drinkItem = ''; presence.interactionEndsAt = undefined; }
      return;
    }
    const object = INTERACTABLES.find(i => i.id === objectId);
    if (!object || !canInteract(object, player, INTERACTION_SLACK)) throw new Error('Chegue mais perto para interagir.');
    if (player.interactionState) throw new Error('Levante-se antes de interagir.');
    if (object.type === 'blackjack') { this.joinTable(client); return; }
    if (object.type === 'seat') {
      if ([...this.state.players.values()].some(p => p.interactionState === object.id)) throw new Error('Esse lugar está ocupado.');
      player.x = object.x; player.y = object.y ?? player.y; player.z = object.z; player.rotation = object.rotation || 0; player.animationState = 'sit'; player.interactionState = object.id;
    } else if (object.type === 'counter') {
      // The player waits at the counter; the drink starts when Seu Zé finishes preparing it (see serveDrinks).
      player.animationState = 'idle'; player.interactionState = object.id; presence.interactionEndsAt = undefined;
      player.drinkItem = item;
      this.service.order(player.id);
      this.systemMessage(`${player.displayName} pediu ${item === 'copo' ? 'um copo americano' : 'uma long neck'} ao Seu Zé.`, player);
    } else if (object.type === 'toilet') {
      if ([...this.state.players.values()].some(p => p !== player && p.interactionState === object.id)) throw new Error('Ocupado. Espere a sua vez.');
      player.rotation = Math.atan2(object.x - player.x, object.z - player.z);
      player.animationState = 'idle'; player.interactionState = object.id; presence.interactionEndsAt = now + NEEDS.bladder.toiletSeconds * 1000;
    } else if (object.type === 'door') this.toggleDoor(player, object.id);
    else if (object.type === 'television') { this.requireMedia('tv',client,object.id);client.send('tv.open',{id:object.id}); }
    else { this.requireMedia('jukebox',client,object.id);client.send('jukebox.open',{id:object.id}); }
  }

  /** A drink or a toilet visit ran its full time. */
  private finishInteraction(player: Player, presence: Presence, now: number): void {
    if (player.animationState === 'drink' && player.drinkItem) this.needs.consume(player, player.drinkItem, now);
    if (player.interactionState.startsWith('toilet-')) this.needs.relieve(player, now);
    player.interactionState = ''; player.animationState = 'idle'; player.drinkItem = ''; presence.interactionEndsAt = undefined;
  }
  /** Ending a drink or a toilet visit early counts the part already done. */
  private consumePart(player: Player, presence: Presence, now: number): void {
    if (player.animationState === 'drink' && player.drinkItem) this.needs.consume(player, player.drinkItem, now, (now - player.animationStartedAt) / DRINK_DURATION_MS);
    if (player.interactionState.startsWith('toilet-') && presence.interactionEndsAt)
      this.needs.relieve(player, now, 1 - (presence.interactionEndsAt - now) / (NEEDS.bladder.toiletSeconds * 1000));
  }
  /** Falling ends whatever the character was doing: table, order, drink (spilled), chair, dance. */
  private knockDown(player: Player, presence: Presence): void {
    if (player.currentTableId) { this.blackjack.leave(player.id); player.currentTableId = ''; this.cleanTable(); this.syncTable(); }
    if (player.interactionState && player.interactionState !== 'fainted' && player.interactionState !== 'stumbling') Object.assign(player, standingPosition(player, player.rotation));
    this.service.cancel(player.id);
    player.drinkItem = ''; presence.interactionEndsAt = undefined; presence.queue.length = 0;
    player.lastProcessedInput = presence.lastReceived;
  }
  private onNeeds(player: Player, presence: Presence, event: NeedsEvent, now: number): void {
    if (event.type === 'faint' || event.type === 'stumble') {
      this.knockDown(player, presence);
      player.interactionState = event.type === 'faint' ? 'fainted' : 'stumbling';
      player.animationState = 'fallen'; player.animationStartedAt = now;
    }
    if (event.type === 'faint') {
      this.log('faint', { playerId: player.id, cause: event.cause });
      if (event.cause === 'alcohol') { presence.recoveryMoveAt = now + NEEDS.faint.moveAfterSeconds * 1000; this.systemMessage(`${player.displayName} bebeu demais e apagou.`, player); }
      else {
        this.systemMessage(`${player.displayName} desmaiou.`, player);
        // The future inventory decides what can be lost; without one, nothing happens.
        const lost = this.needs.loseItemOnFaint(player.id);
        if (lost) presence.client.send('needs.itemLost', { item: lost });
      }
    }
    if ((event.type === 'woke' && player.interactionState === 'fainted') || (event.type === 'steady' && player.interactionState === 'stumbling')) {
      player.interactionState = ''; player.animationState = 'idle';
    }
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
    const name=kind==='jukebox'?'a jukebox':'a TV';
    const object=INTERACTABLES.find(o=>o.id===id&&o.type===(kind==='jukebox'?'jukebox':'television')),player=this.player(client);
    const states=kind==='jukebox'?this.state.jukeboxes:this.state.televisions;
    if(!object||!states.has(id)||!canInteract(object,player,INTERACTION_SLACK))throw new Error(`Chegue mais perto d${name}.`);
    if(player.interactionState||player.currentTableId||player.animationState==='kick')throw new Error(`Encerre a interação atual antes de usar ${name}.`);
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
    for (const [id, presence] of this.people) {
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
      for (const [nonce, expiry] of this.usedTickets) if (expiry < Date.now()) this.usedTickets.delete(nonce);
      const checks = await Promise.allSettled([...this.people].map(async ([id, p]) => {
        const access = await validateAccess(p.ticket.sessionId, id);
        if (!access.valid){if(access.banned)this.removeByAdmin(id,'ban','Sua conta está banida do bar.');else this.expel(id, 'Sua sessão terminou ou a conta foi suspensa.');}
        else if(this.people.get(id)===p){ p.blocked = new Set(access.blocked); p.ticket.role = access.role;const player=this.state.players.get(id);if(player)this.applyAppearance(player,access); }
      }));
      if (checks.some(r => r.status === 'rejected')) this.log('auth_refresh_unavailable', {});
      const { controls } = await internal<{ controls: Control[] }>('controls');
      for (const control of controls) {
        if ((control.action === 'kick' || control.action === 'ban') && control.playerId){
          const presence=this.people.get(control.playerId);
          // A queued kick ends the participation that existed when it was issued, never a later join.
          if(presence&&(control.action!=='kick'||control.issuedAt===undefined||presence.joinedAt<=control.issuedAt))this.removeByAdmin(control.playerId,control.action,control.reason||'Um administrador encerrou sua participação.');
        }
        if (control.action === 'event') {
          try {
            if(control.expectedControlId&&(this.administrativeEvent?.commandId!==control.expectedControlId||this.administrativeEvent.eventId!==this.state.event.id))continue;
            if (control.eventType === 'STOP' || control.eventType === '') this.events.stop();
            else if (control.eventType && eventKinds[control.eventType]) { this.events.stop(); this.events.start(eventKinds[control.eventType]); }
            this.syncEvent(Date.now());
            this.administrativeEvent=control.eventType==='STOP'||control.eventType===''?undefined:{commandId:control.id,eventId:this.state.event.id};
          } catch { this.log('event_control_rejected', { id: control.id }); }
        }
      }
      for (const [roundId, results] of this.results) {
        await internal('stats', { roundId, results: [...results].map(([userId, result]) => ({ userId, result })) });
        this.results.delete(roundId);
      }
    } catch (e) { this.log('maintenance_retry', { message: e instanceof Error ? e.message : 'error' }); }
    finally { this.maintenanceBusy = false; }
  }

  private applyAppearance(player:Player,access:Access):void {
    if(player.animationState==='kick'||!access.character)return;
    const requested=access.equippedSkin??DEFAULT_SKIN;
    player.skin=requested==='custom'||access.ownedSkins?.includes(requested)?requested:DEFAULT_SKIN;
    player.character=JSON.stringify(access.character);
  }

  private recordResult(roundId: string, userId: string, result: Result): void {
    const record = this.results.get(roundId) || new Map<string, 'win' | 'loss' | 'draw'>();
    record.set(userId, result === 'push' ? 'draw' : result);
    this.results.set(roundId, record);
  }

  private removeByAdmin(userId:string,kind:'kick'|'ban',reason:string):void {
    const presence=this.people.get(userId);if(!presence||presence.revoked)return;
    presence.client.send('moderation.removed',{kind,reason});this.expel(userId,reason);
  }
  private expel(userId: string, reason: string): void {
    const presence = this.people.get(userId);
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
    for (const [id, listener] of this.people) {
      if (id === speaker.id || listener.revoked || !listener.listening || listener.blocked.has(speaker.id) || presence.blocked.has(id)) continue;
      const other = this.state.players.get(id);
      if (!other?.connected || distance(speaker, other) > VOICE.maxDistance) continue;
      frame ??= wrapVoice(speaker.id, bytes);
      listener.client.sendBytes('voice', frame);
    }
  }

  private forClient(client: Client): Presence | undefined { return [...this.people.values()].find(p => p.client.sessionId === client.sessionId); }
  private player(client: Client): Player { const p = this.forClient(client); if (!p) throw new Error('Sessão não encontrada.'); return this.state.players.get(p.ticket.userId)!; }
  private systemMessage(text: string, origin?: Player): void {
    const message: ChatMessage = { id: randomUUID(), playerId: 'system', displayName: 'B.A.R.', text, sentAt: Date.now(), system: true };
    for (const [id, p] of this.people) if (this.state.players.get(id)?.connected && (!origin || distance(origin, this.state.players.get(id)!) <= CHAT_RADIUS)) p.client.send('chat.message', message);
  }
  private log(event: string, details: Record<string, unknown>): void { console.log(JSON.stringify({ service: 'game', event, ...details, at: new Date().toISOString() })); }
}
