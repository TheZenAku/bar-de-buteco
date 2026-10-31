import { randomInt, randomUUID } from 'node:crypto';
import { Client, Room, ServerError } from '@colyseus/core';
import { ArraySchema, Schema, StateView } from '@colyseus/schema';
import { z } from 'zod';
import { AOI_RADIUS, BLACKJACK_SEATS, CHAT_RADIUS, DEFAULT_SKIN, KICK_DURATION_MS, WAVE_DURATION_MS, USE_DURATION_MS, RECOVER_DURATION_MS, INTERACTABLES, PATCH_MS, TICK_MS, canInteract, interactionReach, distance, findSpawn, standingPosition, inputSchema, movePlayer, skinMessageSchema, skinSchema, type AnimationState, type ChatMessage, type PlayerInput, VOICE, decodeVoicePacket, voiceStateSchema, wrapVoice, DOORS, PLAYER_RADIUS, inDoorSweep, isWalkable, setDoorStates, DRINK_ITEMS, type DrinkItem, ITEM_IDS, itemById, INVENTORY_CAPACITY, type InventoryStack, type InventoryView, type ItemId } from '@bar/shared';
import { verifyTicket, type GameTicket } from '@bar/shared/tickets';
import { Access, internal, validateAccess, type Control } from './internal.js';
import { BarState, CardState, DoorState, FoosballSlotState, FoosballState, HandState, JobSlotState, Moto, Player, SeatState, TableState } from './state.js';
import { MOTO, MOTOS, NO_MOTO_INTENT, canMountMoto, isRidingMoto, motoDismountSpot, motoInputSchema, motoInteraction, motoMountSchema, parkedMoto, stepMoto, type MotoInput } from '@bar/shared';
import { BlackjackTable, type Result, type RoundSummary } from './minigames/blackjack.js';
import { BlackjackBank, GameBank, type BankEntry } from './minigames/blackjack-bank.js';
import { FoosballTable, type FoosballSummary } from './minigames/foosball.js';
import { betLimits, blackjackActionSchema, blackjackBetSchema, blackjackInsuranceSchema } from '@bar/shared';
import { FOOSBALL, FOOSBALL_TABLES, TEAM_NAMES, foosballBetLimits, foosballConfigSchema, foosballCpuSchema, foosballExit, foosballInputSchema, foosballJoinSchema, foosballKickSchema,
  foosballReadySchema, foosballSlotSchema, foosballSpot, foosballWatchSchema, type FoosballFrame } from '@bar/shared';
import { EventDirector, type EventKind } from './world/events.js';
import { createNpcs, NpcDirector } from './world/npcs.js';
import { BarService } from './world/bartender.js';
import { NeedsDirector } from './world/needs.js';
import { NEEDS, MAP_MARKERS, isConscious, swayInput, type NeedsEvent } from '@bar/shared';
import {JUKEBOX_SYSTEMS,TV_SYSTEMS,initialJukebox,jukeboxCommandSchema,commandJukebox,clearMedia,endMedia,failMedia,liveMedia,mediaEndedSchema,mediaFailedSchema,mediaLiveSchema,mediaGain,jukeboxTime,parseMediaLink,MEDIA_PLATFORMS,type JukeboxState,type MediaProvider} from '@bar/shared';
import {Jukebox,MediaEntry} from './state.js';
import {VideoCheck} from './world/media-check.js';
import { readWorldConfig } from './config.js';
import { FileOutbox } from './world/outbox.js';
import { ControlRelay, ResultRelay, type MatchResult } from './world/relays.js';
import { health, logLine, worldMetrics } from './observability.js';
import { SessionRegistry } from './room/session-registry.js';
import { TABLE_QUEUE_MAX, WaiterService, publicOrder, type TableOrder } from './world/waiter.js';
import { ServedItems, type Seated } from './world/served.js';
import { JobDirector, type Payment, type WorkerOrder } from './world/jobs.js';
import { changeWallet, WalletRetries, type WalletOwner } from './world/wallet.js';
import { JOBS, MAX_WORKER_ORDERS, USE_DURATION_MS as TASK_GESTURE_MS, itemById as catalogItem, orderTotal, tableOrderSchema, consumeMs, consumedOverTime, type MediaPriceKind } from '@bar/shared';
import { STAGE_PASS, hasStagePass, onStage, musicianRole, stageSpot } from '@bar/shared';
import { WORLD_LOG_EVENTS, defaultPrices, itemPrice, mediaPriceKey, priceOf, sanitizePrices, type PriceTable } from '@bar/shared';
import { LIGHT_DESK, applyShowPatch, fireShowCue, showCueSchema, showPatchSchema, type StageShowState } from '@bar/shared';
import { CLEANABLE_TABLES, barClipMs, cornerSpot, onBench, standUpSpot, tableCorners } from '@bar/shared';
import { Musicians, type MusicianEnd } from './world/musicians.js';
import { BotRunner } from './world/bots.js';
import { PhoneCalls, type PhoneCall } from './world/phone-calls.js';
import { PHONE, isJpeg, phoneCallIdSchema, phoneCallSchema, phonePingSchema, type PhoneCallEnd, type PhoneCallView, type PhonePing } from '@bar/shared';

// Interactions need the player to touch the object; the server tolerates a little drift from latency.
const INTERACTION_SLACK = 0.3;
/** A video its platform refuses within its first seconds never really played: its coins go back. */
const MEDIA_REFUND_WITHIN_S = 30;

interface Presence {
  joinedAt:number;
  ticket: GameTicket;
  client: Client;
  blocked: Set<string>;
  queue: PlayerInput[];
  /** On a delivery bike, its inputs instead (simulated like walking: at most one a tick); when the last one came. */
  motoQueue: MotoInput[];
  motoInputAt: number;
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
  /** Video call frames relayed in the current one-second window. */
  videoFrames?: number;
  videoWindowAt?: number;
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
  /** The pebolim table this player watches from beside it (its frames come to them), '' or undefined otherwise. */
  watching?:string;
}
// Actions that need a conscious character; chat, voice and movement input stay available (input is ignored).
/** What is in hand is had 5% at a time, like what is served at a table (served.ts). */
const HOLDING_SIP = .05;
const holdingName = (item: string) => catalogItem(item)?.name ?? item;
const NEEDS_CONSCIOUS = new Set(['table.order', 'job.start', 'job.work', 'player.interact', 'player.emote', 'player.skin', 'player.appearance', 'inventory.use', 'inventory.discard', 'blackjack.join', 'blackjack.bet', 'blackjack.action', 'blackjack.insurance', 'foosball.join', 'foosball.slot', 'foosball.config', 'foosball.cpu', 'foosball.ready', 'jukebox.command', 'tv.command', 'stage.buy', 'phone.call', 'show.set', 'show.cue']);
const eventTypes: Record<EventKind, string> = { blackout: 'BLACKOUT', troublemaker: 'DRUNK_NPC', party: 'PARTY' };
const centre = (spots: readonly { x: number; z: number }[]) => ({ x: spots.reduce((sum, s) => sum + s.x, 0) / spots.length, z: spots.reduce((sum, s) => sum + s.z, 0) / spots.length });
const eventKinds: Record<string, EventKind> = { BLACKOUT: 'blackout', DRUNK_NPC: 'troublemaker', PARTY: 'party' };

export class BarRoom extends Room<{ state: BarState }> {
  private administrativeEvent?:{commandId:string;eventId:string};
  static activeId: string | undefined;
  state = new BarState();
  /** Validated once per room (apps/server/src/config.ts); a bad variable stops the world at start. */
  private readonly config = readWorldConfig();
  private readonly sessions = new SessionRegistry<Presence>();
  private events = new EventDirector(this.config.eventMinMs, this.config.eventMaxMs);
  private npcs = new NpcDirector();
  private service = new BarService();
  /** Whether a customer still sits where they ordered from (a logged-out avatar has left). */
  private readonly seated: Seated = (playerId, seatId) => { const player = this.state.players.get(playerId); return !!player?.connected && player.interactionState === seatId && player.animationState === 'sit'; };
  /** What was served on the tables, Tonico's table service and the jobs (apps/server/src/world/served.ts, waiter.ts, jobs.ts). */
  private served = new ServedItems(this.state.served);
  /** Who plays at each of the stage's musicians' spots, and the phases of each show (apps/server/src/world/musicians.ts). */
  private musicians = new Musicians(this.state.musicians, this.config.musicianDropMs);
  /** Phone calls between players (apps/server/src/world/phone-calls.ts); an answered call's voice ignores distance. */
  private phoneCalls = new PhoneCalls();
  private waiter = new WaiterService({ plan: order => this.served.plan(order, this.seated), dirtyTables: () => this.served.dirtyTables(), takeOne: table => this.served.takeOne(table) });
  readonly jobs = new JobDirector({ dirtyTables: () => this.served.dirtyTables(), isDirty: table => this.served.isDirty(table) });
  private walletRetries = new WalletRetries((event, details) => this.log(event, details));
  /** Whether YouTube lets a video play on other sites, asked before it is queued (world/media-check.ts). */
  private videoCheck = new VideoCheck(this.config.videoCheckUrl, (event, details) => this.log(event, details));
  /**
   * What each queued or playing video cost, by its queue key, with the wallet that paid: given back when its owner takes
   * it out of the queue, the administration empties the queue, or YouTube refuses to play it.
   */
  private mediaPayments = new Map<string, { owner: WalletOwner; amount: number }>();
  /** HP, stamina, hunger, thirst, bladder and drunkenness of every avatar (packages/shared/src/needs.ts). */
  readonly needs = new NeedsDirector();
  /** How much of what each player holds (Player.holding) they have had so far, 0–1: its effects come in 5% at a time. */
  private readonly holdingConsumed = new Map<string, number>();
  /** Administrative controls: leased from the API's outbox, applied once, then confirmed. */
  private controls = new ControlRelay(this.config.instanceId, internal);
  /** Finished rounds wait on disk until the API confirms them (survives crashes and API outages). */
  private results = new ResultRelay(new FileOutbox(this.config.outboxPath, (event, details) => this.log(event, details)), internal);
  /** Development bots added from the administration (apps/server/src/world/bots.ts); its panel follows them as they join. */
  private bots = new BotRunner({ apiUrl: this.config.apiInternalUrl, worldUrl: `http://${['0.0.0.0', '::'].includes(this.config.host) ? '127.0.0.1' : this.config.host}:${this.config.port}`,
    log: (event, details) => this.log(event, details), settled: () => { const admin = this.botsAdmin; if (admin && this.sessions.getByClient(admin)) admin.send('admin.world', this.adminSnapshot()); } });
  private botsAdmin?: Client;
  /**
   * What things cost and pay (packages/shared/src/prices.ts): the .env defaults until the API answers, then the API's
   * table, read again whenever the administration changes a price (a `prices` control).
   */
  private prices: PriceTable = sanitizePrices({ ...defaultPrices(process.env), 'media:jukebox': this.config.prices.jukebox, 'media:tv': this.config.prices.tv, 'media:telao': this.config.prices.telao, 'stage:pass': this.config.prices.stage });
  private pricesLoaded = false;
  /** Events for the administration's log (WORLD_LOG_EVENTS), sent to the API with each maintenance round. */
  private logQueue: Array<{ event: string; userId?: string; details: Record<string, unknown>; at: number }> = [];
  /** Development bots stay out of the administration's log. */
  private botIds = new Set<string>();
  private maintenanceBusy = false;
  private lastTableJson = '';
  private tickCount = 0;
  /** When each bike was left parked: left alone long enough, it goes back to its spot (MOTOS). */
  private readonly motoLeftAt = new Map<string, number>();
  /**
   * The blackjack table's coins (minigames/blackjack-bank.ts): every bet and every payment is on disk before the API is
   * asked, so a crash or an outage delays them and never loses them. Declared after the log queue it writes to.
   */
  private blackjackBank = new BlackjackBank(new FileOutbox<BankEntry>(this.config.blackjackJournalPath, (event, details) => this.log(event, details)),
    userId => this.sessions.getByUser(userId)?.ticket, changeWallet, internal, {
      log: (event, details) => this.log(event, details),
      wallet: (userId, change) => { const presence = this.sessions.getByUser(userId); if (presence) this.walletChanged(presence, change.balance, change.applied, 'blackjack'); },
    });
  private blackjack = new BlackjackTable('blackjack-1', {
    bank: this.blackjackBank,
    onResult: (roundId, userId, result) => this.recordResult(roundId, userId, result),
    onRound: summary => this.logRound(summary),
    onNotice: (playerId, message) => this.sessions.getByUser(playerId)?.client.send('error', { message }),
    limits: () => betLimits(this.prices),
    timing: { turnMs: this.config.blackjackTurnMs },
  });
  /** The pebolim tables' coins: stakes and payments journaled like blackjack's (foosball:bet:<match>, /internal/foosball/settle). */
  private foosballBank = new GameBank('foosball', new FileOutbox<BankEntry>(this.config.foosballJournalPath, (event, details) => this.log(event, details)),
    userId => this.sessions.getByUser(userId)?.ticket, changeWallet, internal, {
      log: (event, details) => this.log(event, details),
      wallet: (userId, change) => { const presence = this.sessions.getByUser(userId); if (presence) this.walletChanged(presence, change.balance, change.applied, 'foosball'); },
    });
  /** The pebolim tables of the games hall (minigames/foosball.ts), by id; their physics run at FOOSBALL.tickHz. */
  private foosball = new Map(FOOSBALL_TABLES.map(place => [place.id, new FoosballTable(place.id, {
    bank: this.foosballBank,
    limits: () => foosballBetLimits(this.prices),
    onNotice: (playerId, message) => this.sessions.getByUser(playerId)?.client.send('error', { message }),
    onMatch: summary => this.foosballMatch(summary),
  })] as const));
  private foosballShown = new Map<string, string>();
  private foosballTimer?: ReturnType<typeof setInterval>;
  /** The tables' fixed steps catch up on the timer's real pace (Windows timers run late); frames go 30 times a second. */
  private foosballClock = { last: 0, owed: 0, frameAt: 0 };

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
    for (const place of FOOSBALL_TABLES) this.state.foosball.set(place.id, new FoosballState().assign({ id: place.id }));
    this.syncFoosball();
    // Doors start open, as authored in the map; the shared physics mirrors this room's door states.
    setDoorStates(DOORS.map(door => [door.id, true] as const));
    for (const door of DOORS) this.state.doors.set(door.id, new DoorState().assign({ id: door.id, open: true }));
    for (const spot of MOTOS) this.state.motos.set(spot.id, new Moto().assign(parkedMoto(spot)));
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
    worldMetrics.gauge('bar_world_blackjack_settlements_pending', 'Blackjack payments waiting for the API', () => this.blackjackBank.pending);
    worldMetrics.gauge('bar_world_foosball_settlements_pending', 'Pebolim payments waiting for the API', () => this.foosballBank.pending);
    worldMetrics.gauge('bar_world_foosball_matches', 'Pebolim matches being played', () => [...this.foosball.values()].filter(t => t.inMatch).length);
    // The pebolim tables' physics: 60 ticks a second, on a timer of their own (the room's clock ticks with its 20 Hz step).
    this.foosballTimer = setInterval(() => this.foosballTick(), 1000 / FOOSBALL.tickHz);
    worldMetrics.gauge('bar_world_table_orders_pending', 'Table orders waiting for Tonico', () => this.waiter.pending);
    worldMetrics.gauge('bar_world_phone_calls', 'Phone calls ringing or answered', () => this.phoneCalls.size);
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
    const presence:Presence={joinedAt:Date.now(),ticket: auth, client, blocked: new Set(auth.blocked), queue: [], motoQueue: [], motoInputAt: 0, lastReceived: -1, lastInputAt: Date.now(), seen: new Set(), revoked: false, rates: new Map(), listening: true, voicePackets: 0, voiceWindowAt: 0,inventory:new Map((auth.inventory??[]).map(stack=>[stack.itemId,stack.quantity])),balance:auth.balance??0};
    this.sessions.bind(auth.userId,presence);
    this.state.occupancy = this.sessions.size;
    this.refreshViews();
    this.syncTable();
    client.send('wallet.state',{balance:presence.balance});
    client.send('prices',{prices:this.prices});
    this.sendJob(presence);
    if (auth.bot) this.botIds.add(auth.userId);
    this.log(previous ? 'takeover' : 'join', { playerId: auth.userId });
  }

  onDrop(client: Client): void {
    const presence = this.forClient(client);
    if (!presence || presence.revoked) return;
    const player = this.state.players.get(presence.ticket.userId);
    if (player) { player.connected = false; player.voice = false; if (!player.interactionState) player.animationState = 'idle'; }
    if (player && player.animationState !== 'drink') player.drinkItem = '';
    presence.queue.length = 0; presence.motoQueue.length = 0;
    // A pebolim match waits for its player (paused) until they are back or the wait runs out.
    for (const table of this.foosball.values()) table.connection(presence.ticket.userId, false);
    this.syncFoosball();
    // A pending order is dropped with the connection, which would otherwise leave the player waiting forever.
    this.cancelCounter(presence.ticket.userId);
    this.cancelTable(presence.ticket.userId);
    this.dropCall(presence.ticket.userId);
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
    presence.queue.length = 0; presence.motoQueue.length = 0;
    const player = this.state.players.get(presence.ticket.userId)!;
    player.connected = true;
    for (const table of this.foosball.values()) table.connection(player.id, true);
    this.syncFoosball();
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
    this.cancelCounter(userId); this.cancelTable(userId); this.dropCall(userId); this.releaseMedia(userId);
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
    player.drinkItem = ''; this.dropHolding(player);
    this.blackjack.leave(player.id);
    // Off the pebolim table (a match with coins on it is lost; a friendly goes on with Zé do Totó).
    this.leaveFoosball(player);
    this.cancelCounter(player.id);
    this.cancelTable(player.id);
    this.endShift(player, 'Turno encerrado.');
    if (player.currentTableId) Object.assign(player, standingPosition(player, player.rotation));
    player.currentTableId = '';
    // The microphone belongs to a session; a new one switches it on again itself.
    player.voice = false;
    const presence=this.sessions.getByUser(player.id);if(presence)presence.inventoryItem=undefined;
    // Halfway out of a chair: the avatar is left standing beside it.
    if (player.animationState === 'stand-up') this.finishStandUp(player);
    // A musician puts the instrument back (the stop clip plays) and the spot frees itself when it ends.
    if (player.interactionState.startsWith('stage-')) this.musicians.stop(player.id, Date.now());
    else if (player.animationState !== 'sit' && player.condition !== 'fainted') { player.interactionState = ''; player.animationState = 'idle'; }
  }

  /** Closes an older session of the same account without touching its avatar, which the new one takes. */
  private replaceSession(previous: Presence): void {
    this.cancelCounter(previous.ticket.userId); this.cancelTable(previous.ticket.userId); this.dropCall(previous.ticket.userId);
    this.sessions.remove(previous.ticket.userId, previous);
    previous.rejectReconnect?.();
    if (this.state.players.get(previous.ticket.userId)?.connected)
      previous.client.send('error', { message: 'Sua conta entrou no bar em outra janela.' });
    // Also close a transport that already resumed but is still awaiting access validation. onDrop
    // marks the avatar disconnected, so tying this close to player.connected would orphan that socket.
    previous.client.leave(4000);
  }

  onDispose(): void { clearInterval(this.foosballTimer); this.bots.stop(); if (BarRoom.activeId === this.roomId) BarRoom.activeId = undefined; if (health.roomId === this.roomId) health.roomId = undefined; }

  private registerMessages(): void {
    // Proximity voice: raw packets, relayed without decoding (see relayVoice).
    this.onMessageBytes('voice', (client, bytes: Uint8Array) => this.relayVoice(client, bytes));
    this.handle('voice.state', voiceStateSchema, 4, (client, { mic, listen }) => {
      this.player(client).voice = mic;
      this.forClient(client)!.listening = listen;
    });
    // The phone: calls ring here; Highzap, Highgram and Pix live in the API, and the room only forwards their pings.
    this.handle('phone.call', phoneCallSchema, 2, (client, { to, video }) => this.startCall(client, to, video));
    // A video call's frames: whole JPEGs, relayed to the other end of an answered call only (see relayVideo).
    this.onMessageBytes('phone.video', (client, bytes: Uint8Array) => this.relayVideo(client, bytes));
    this.handle('phone.answer', phoneCallIdSchema, 3, (client, { id }) => {
      const call = this.phoneCalls.answer(id, this.player(client).id, Date.now());
      this.sendCall(call);
    });
    this.handle('phone.hangup', phoneCallIdSchema, 3, (client, { id }) => {
      const call = this.phoneCalls.get(id), userId = this.player(client).id;
      if (!call || (call.from !== userId && call.to !== userId)) return;
      // Turning down a ringing call is declining it; the caller giving up leaves a missed call.
      this.endCall(call, call.answeredAt ? 'hangup' : userId === call.to ? 'declined' : 'hangup', userId);
    });
    this.handle('phone.ping', phonePingSchema, 8, (client, { to, kind }) => {
      const presence = this.forClient(client)!, sender = this.player(client), target = this.sessions.getByUser(to);
      if (!target || target.revoked || to === sender.id || target.blocked.has(sender.id) || presence.blocked.has(to)) return;
      target.client.send('phone.ping', { kind, from: sender.id, fromName: sender.displayName } satisfies PhonePing);
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
    this.handle('moto.input', motoInputSchema, 55, (client, input) => {
      const p = this.forClient(client)!;
      if (input.seq <= p.lastReceived) return;
      if (p.motoQueue.length >= 6) p.motoQueue.shift();
      p.lastReceived = input.seq;
      p.lastInputAt = Date.now();
      p.motoQueue.push(input);
    });
    this.handle('moto.mount', motoMountSchema, 4, (client, { motoId }) => this.mountMoto(client, motoId));
    this.handle('player.interact', z.object({ objectId: z.string().max(64), item: z.enum(DRINK_ITEMS).optional() }).strict(), 5, (client, command) => this.interact(client, command.objectId, command.item));
    this.handle('inventory.sync',z.object({}).strict(),2,async client=>{await this.syncPresence(this.forClient(client)!);});
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
        const schema=states.get(command.id),player=this.player(client),presence=this.forClient(client)!,actor={id:player.id,name:player.displayName};
        if(!schema)throw new Error('Aparelho desconhecido.');
        if(command.action==='play'){
          this.requireMedia(kind,client,command.id);
          // The link, the queue and its limits are checked before its platform is asked and before any coin moves.
          commandJukebox(this.media(schema),command,actor,Date.now());
          const link=parseMediaLink(command.url);if('error' in link)throw new Error(link.error);
          if(!this.config.mediaProviders.has(link.provider))throw new Error(`Links de ${MEDIA_PLATFORMS[link.provider].label} estão desativados neste bar.`);
          const {title,thumb}=await this.videoCheck.check(link);
          // Choosing a new video costs coins; pausing, resuming, seeking and skipping are free.
          const price=priceOf(this.prices,mediaPriceKey(kind,command.id)),key=randomUUID();
          if(price)await this.charge(presence,price,`media:${command.id}`,key);
          try{
            if(this.forClient(client)!==presence)throw new Error('Sua sessão mudou. Moedas devolvidas.');
            this.requireMedia(kind,client,command.id);
            this.assignMedia(schema,commandJukebox(this.media(schema),command,actor,Date.now(),{key,title,thumb}));
          }catch(error){if(price)this.refund(presence,key,price);throw error;}
          if(price)this.mediaPayments.set(key,{owner:{sessionId:presence.ticket.sessionId,userId:presence.ticket.userId},amount:price});
          client.send(`${kind}.result`,{id:command.id,revision:schema.revision,price,queued:schema.key!==key});
          return;
        }
        if(command.action==='remove'){
          // One's own video, from anywhere: its coins go back.
          const next=commandJukebox(this.media(schema),command,actor,Date.now());
          this.refundMedia(command.entry);this.assignMedia(schema,next);
        } else {
          this.requireMediaControl(kind,client,command.id);
          this.assignMedia(schema,commandJukebox(this.media(schema),command,actor,Date.now()));
        }
        client.send(`${kind}.result`,{id:command.id,revision:schema.revision,price:0});
      });
      // What the players see (the end, a refusal, a live broadcast) comes from whoever controls the video, or from anyone
      // while nobody does. A stale report never touches a newer video.
      this.handle(`${kind}.ended`,mediaEndedSchema,2,(client,report)=>{
        const schema=states.get(report.id),next=schema&&endMedia(this.media(schema),report,this.player(client).id,Date.now());
        if(next)this.assignMedia(schema!,next);
      });
      this.handle(`${kind}.failed`,mediaFailedSchema,2,(client,report)=>{
        const schema=states.get(report.id);if(!schema)return;
        const state=this.media(schema),now=Date.now(),next=failMedia(state,report,this.player(client).id,now);if(!next)return;
        // A video refused before it really played is given back; one refused midway is not.
        const refunded=jukeboxTime(state,now)<MEDIA_REFUND_WITHIN_S&&this.mediaPayments.has(state.key);
        if(refunded)this.refundMedia(state.key);
        this.assignMedia(schema,next);
        this.sessions.getByUser(state.by)?.client.send('error',{message:`${MEDIA_PLATFORMS[(state.provider||'youtube') as MediaProvider].named} não deixou ${state.title?`"${state.title}"`:'o seu vídeo'} tocar aqui. Ele foi pulado${refunded?' e as moedas voltaram':''}.`});
        this.log('media_refused',{playerId:state.by,id:report.id,videoId:report.videoId,code:report.code,refunded});
      });
      this.handle(`${kind}.live`,mediaLiveSchema,2,(client,report)=>{
        const schema=states.get(report.id),next=schema&&liveMedia(this.media(schema),report,this.player(client).id,Date.now());
        if(next)this.assignMedia(schema!,next);
      });
    }
    // Anyone seated at a table orders from Tonico, or from a player working the bar (`to`), who brings it from the counter.
    this.handle('table.order',tableOrderSchema,2,async(client,{items,to})=>{
      const player=this.player(client),presence=this.forClient(client)!,seatId=player.interactionState;
      if(!seatId.startsWith('seat-')||player.animationState!=='sit')throw new Error('Sente-se a uma mesa para fazer um pedido.');
      if(this.orderPending(player.id))throw new Error('Seu pedido ainda não chegou.');
      const worker=to?this.requireWorker(player,to):undefined,table=INTERACTABLES.find(i=>i.id===seatId)?.table;
      if(!worker&&this.waiter.pending>=TABLE_QUEUE_MAX)throw new Error('O Tonico está atolado de pedidos. Tente daqui a pouco.');
      const order:TableOrder={id:randomUUID(),playerId:player.id,seatId,items,total:orderTotal(items,id=>itemPrice(this.prices,id)),placedAt:Date.now(),owner:{sessionId:presence.ticket.sessionId,userId:presence.ticket.userId}};
      await this.charge(presence,order.total,`table:${items.join('-')}`,order.id);
      if(this.forClient(client)!==presence||player.interactionState!==seatId){this.refund(presence,order.id,order.total);throw new Error('Você saiu da mesa. Moedas devolvidas.');}
      try{
        if(worker){this.requireWorker(player,worker.id);this.jobs.take(worker.id,order,player.displayName,table??0,Date.now());}
        else this.waiter.order(order);
      }catch(error){this.refund(presence,order.id,order.total);throw error;}
      const names=items.map(id=>catalogItem(id)?.name??id).join(', ');
      client.send('table.state',{status:'ordered',order:{...publicOrder(order),waiter:worker?.displayName??'Tonico',stage:'queued'}});
      if(worker){const workerPresence=this.sessions.getByUser(worker.id);if(workerPresence)workerPresence.client.send('job.state',{...this.jobView(worker.id),message:`${player.displayName} pediu para você: ${names}. Pegue no balcão e leve à mesa ${table}.`});}
      this.systemMessage(`${player.displayName} pediu ${worker?`para ${worker.displayName}`:'ao Tonico'}: ${names}.`,player);
    });
    // The stage pass is bought at its steps: charged first (the API decides), refunded if the buyer left meanwhile.
    this.handle('stage.buy',z.object({}).strict(),2,async client=>{
      const player=this.player(client),presence=this.forClient(client)!;
      if(presence.stageBusy)throw new Error('Aguarde: o ingresso está sendo pago.');
      this.requireStage(player);
      const price=priceOf(this.prices,'stage:pass'),requestId=randomUUID();
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
    // The stage show, from its light desk: settings and cues are for everyone in the backyard at once (StageShowState).
    this.handle('show.set',showPatchSchema,12,(client,patch)=>{
      const player=this.requireLightDesk(client);
      this.state.stageShow.assign(applyShowPatch(this.state.stageShow.toJSON() as StageShowState,patch,Date.now(),player.displayName));
    });
    this.handle('show.cue',showCueSchema,3,(client,{cue})=>{
      const player=this.requireLightDesk(client);
      this.state.stageShow.assign(fireShowCue(this.state.stageShow.toJSON() as StageShowState,cue,Date.now(),player.displayName));
    });
    // Only while the order is still at the counter: once on its way, it is coming to the table.
    this.handle('table.cancel',z.object({}).strict(),2,client=>{
      const player=this.player(client);
      if(!this.orderPending(player.id))throw new Error('Você não tem pedido em andamento.');
      if(!this.waiter.cancellable(player.id)&&this.jobs.holder(player.id)?.entry.picked!==false)throw new Error('O pedido já está a caminho da sua mesa.');
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
      const now=Date.now(),task=this.jobs.begin(player.id,player,now);
      let target:{x:number;z:number}=task.station;
      // Serving a customer: the order goes down on their table, one item at a time, as Tonico does it.
      if(task.kind==='deliver'&&task.order){
        const plan=this.served.plan(task.order.order,this.seated);
        if(plan){this.served.place(task.order.order,plan,now);target=centre(plan.spots);}
      }
      player.rotation=Math.atan2(target.x-player.x,target.z-player.z);
      // Clearing a table: from its corner nearest to the worker, where `limpar_mesa` stands the body.
      const corner=task.kind==='station'&&task.station.table!==undefined?this.cleaningCorner(task.station.table,player):undefined;
      if(corner)Object.assign(player,{x:corner.x,y:corner.y,z:corner.z,rotation:corner.rotation});
      player.interactionState='job';player.animationState=corner?'clean':'use';player.animationStartedAt=now;
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
      // The videos still waiting never played: their coins go back.
      for(const entry of state.queue)this.refundMedia(entry.key);
      this.assignMedia(state,clearMedia(this.media(state),Date.now(),admin));
      this.log('admin_media_off',{playerId:admin,kind,id});client.send('admin.world',this.adminSnapshot());
    });
    // Development bots for performance tests: how many the bar should have (0 takes them out), never more than fit in it.
    this.handle('admin.bots',z.object({count:z.number().int().min(0).max(128)}).strict(),3,(client,{count})=>{
      const admin=this.requireAdmin(client),room=this.botRoom();
      if(count>room)throw new Error(`O bar comporta ${this.config.capacity} pessoas: cabem até ${room} bots além dos jogadores. Aumente ROOM_CAPACITY no .env e reinicie o mundo.`);
      this.bots.set(count);this.botsAdmin=client;
      this.log('admin_bots',{playerId:admin,count});client.send('admin.world',this.adminSnapshot());
    });
    this.handle('player.emote', z.object({ emote: z.enum(['dance', 'wave', 'idle', 'kick', 'smoke', 'cigarette']) }).strict(), 4, (client, { emote }) => {
      const p = this.player(client);
      // A cigarette: lit and smoked where the player stands (movement held), put out and stepped on when asked again.
      if (emote === 'smoke' && p.interactionState === 'smoke') { this.stopSmoking(p, this.forClient(client)!, Date.now()); return; }
      if (p.interactionState) throw new Error('Levante-se primeiro.');
      if (emote === 'smoke') {
        if (p.animationState === 'kick') throw new Error('Espere o golpe terminar.');
        const presence = this.forClient(client)!;
        p.interactionState = 'smoke'; p.animationState = 'smoke'; p.animationStartedAt = Date.now(); p.drinkItem = '';
        presence.gestureEndsAt = undefined; presence.queue.length = 0; p.lastProcessedInput = presence.lastReceived;
        return;
      }
      // A whole cigarette (`fumar_mixamo`): pack, lighter, a drag, the butt stepped on; held still until the clip ends.
      if (emote === 'cigarette') {
        if (p.animationState === 'kick') throw new Error('Espere o golpe terminar.');
        const presence = this.forClient(client)!;
        p.interactionState = 'cigarette'; p.animationState = 'cigarette'; p.animationStartedAt = Date.now(); p.drinkItem = '';
        presence.interactionEndsAt = p.animationStartedAt + barClipMs('fumar_mixamo');
        presence.gestureEndsAt = undefined; presence.queue.length = 0; p.lastProcessedInput = presence.lastReceived;
        return;
      }
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
        // Each dance is drawn anew; the clients map the number onto their dance clips (apps/web/public/animations/<skin>-dances.glb).
        if(emote==='dance')p.dance=randomInt(65536);
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
    // Bets and decisions name the player from the session, never from the message; the table checks the rest.
    this.handle('blackjack.bet', blackjackBetSchema, 4, (client, { amount }) => {
      const player = this.atTable(client), presence = this.forClient(client)!;
      if (amount > presence.balance) throw new Error('Moedas insuficientes para essa aposta.');
      this.blackjack.bet(player.id, amount); this.syncTable();
    });
    this.handle('blackjack.action', blackjackActionSchema, 4, async (client, { action, hand, move }) => {
      try { await this.blackjack.act(this.atTable(client).id, action, { hand, move }); } finally { this.syncTable(); }
    });
    this.handle('blackjack.insurance', blackjackInsuranceSchema, 2, async (client, { take }) => {
      try { await this.blackjack.insure(this.atTable(client).id, take); } finally { this.syncTable(); }
    });
    // Pebolim: E at a table takes a free place (or watches a full one); then the table's lobby, the pointer and the kicks.
    this.handle('foosball.join', foosballJoinSchema, 3, (client, { tableId, slot }) => this.joinFoosball(client, tableId, slot));
    this.handle('foosball.watch', foosballWatchSchema, 3, (client, { tableId }) => {
      const presence = this.forClient(client)!;
      if (tableId && !this.nearFoosball(this.player(client), tableId)) throw new Error('Chegue mais perto da mesa para assistir.');
      presence.watching = tableId || undefined;
    });
    this.handle('foosball.leave', z.object({}).strict(), 3, client => this.leaveFoosball(this.player(client)));
    this.handle('foosball.slot', foosballSlotSchema, 4, (client, { slot }) => { const { player, table } = this.atFoosball(client); table.move(player.id, slot); this.syncFoosball(); });
    this.handle('foosball.config', foosballConfigSchema, 8, (client, patch) => { const { player, table } = this.atFoosball(client); table.configure(player.id, patch); this.syncFoosball(); });
    this.handle('foosball.cpu', foosballCpuSchema, 4, (client, { slot, on }) => { const { player, table } = this.atFoosball(client); table.cpu(player.id, slot, on); this.syncFoosball(); });
    this.handle('foosball.ready', foosballReadySchema, 4, async (client, { ready }) => {
      const { player, table } = this.atFoosball(client), presence = this.forClient(client)!;
      // Checked here too (the cached wallet), so nobody marks ready for a match they cannot pay; the API decides at the start.
      if (ready && table.stake > presence.balance) throw new Error(`Esta partida vale ${table.stake} moedas e você tem ${presence.balance}.`);
      try { await table.ready(player.id, ready); } finally { this.syncFoosball(); }
    });
    this.handle('foosball.input', foosballInputSchema, 45, (client, { y, lift }) => { const { player, table } = this.atFoosball(client); table.input(player.id, y, lift); });
    this.handle('foosball.kick', foosballKickSchema, 10, (client, { power }) => { const { player, table } = this.atFoosball(client); table.kick(player.id, power); });
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
    for (const call of this.phoneCalls.expire(now)) this.sendCall(call, 'missed');
    for (const [id, presence] of this.sessions) {
      const player = this.state.players.get(id)!;
      if (!player.connected || presence.revoked) continue;
      if(presence.gestureEndsAt&&now>=presence.gestureEndsAt){
        if(player.animationState===presence.gestureState)player.animationState='idle';
        presence.gestureEndsAt=undefined;presence.gestureState=undefined;
      }
      // The drink is finished and leaves the hand together with the interaction.
      if (presence.interactionEndsAt && now >= presence.interactionEndsAt) this.finishInteraction(player, presence, now);
      if (player.holding) this.updateHolding(player, presence, now);
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
    this.stepMotos(now);
    for (const end of this.musicians.update(now, id => this.state.players.get(id)?.connected)) this.finishMusician(end);
    this.blackjack.tick(now);
    this.syncTable();
    this.checkFoosball();
    this.syncFoosball();
    if (this.events.update(now, this.state.occupancy)) this.syncEvent(now);
    this.serveDrinks(now);
    this.serveTables(now);
    this.runJobs(now);
    this.npcs.update(this.state.npcs.values(), [...this.state.players.values()].filter(p => p.connected), this.state.event.type, now);
    if (++this.tickCount % 2 === 0) this.refreshViews();
  }

  /**
   * The delivery bikes. Like walking, the rider's bike moves one input a tick, so it is the same step the browser predicted;
   * a short gap waits for the next input, a longer one (a frozen tab, a lost connection) lets go of the controls. Anything
   * that takes the rider off (fainting, leaving, a kick) lets the bike go here, and it stops by itself.
   */
  private stepMotos(now: number): void {
    for (const moto of this.state.motos.values()) {
      const rider = moto.riderId ? this.state.players.get(moto.riderId) : undefined;
      const presence = rider ? this.sessions.getByUser(rider.id) : undefined;
      const riding = !!rider?.connected && !!presence && !presence.revoked && rider.interactionState === motoInteraction(moto.id);
      if (moto.riderId && !riding) this.freeMoto(moto, rider);
      let intent = moto.riderId ? NO_MOTO_INTENT : { ...NO_MOTO_INTENT, brake: true };
      if (riding) {
        const input = presence.motoQueue.shift();
        if (input) { intent = input; rider.lastProcessedInput = input.seq; presence.motoInputAt = now; }
        else if (now - presence.motoInputAt < 250) continue;
      }
      if (!moto.speed && !moto.steer && !intent.throttle && !intent.steer) {
        const spot = MOTOS.find(m => m.id === moto.id), left = this.motoLeftAt.get(moto.id);
        if (spot && !moto.riderId && left && now - left >= MOTO.RETURN_MS) { moto.assign(parkedMoto(spot)); this.motoLeftAt.delete(moto.id); }
        continue;
      }
      moto.assign(stepMoto(moto, intent, TICK_MS / 1000));
      if (riding) { rider.x = moto.x; rider.y = moto.y; rider.z = moto.z; rider.rotation = moto.yaw; }
    }
  }

  private mountMoto(client: Client, motoId: string): void {
    const player = this.player(client), presence = this.forClient(client)!, moto = this.state.motos.get(motoId);
    if (!moto) throw new Error('Essa moto não está aqui.');
    if (player.interactionState || player.currentTableId || player.animationState === 'kick' || !isConscious(player)) throw new Error('Encerre a ação atual antes de subir na moto.');
    if (moto.riderId) throw new Error('Alguém já está nessa moto.');
    if (!canMountMoto(moto, player, INTERACTION_SLACK)) throw new Error('Chegue mais perto da moto.');
    moto.riderId = player.id;
    player.x = moto.x; player.y = moto.y; player.z = moto.z; player.rotation = moto.yaw;
    player.interactionState = motoInteraction(moto.id); player.animationState = 'ride'; player.animationStartedAt = Date.now(); player.drinkItem = '';
    presence.queue.length = 0; presence.motoQueue.length = 0; presence.motoInputAt = 0; player.lastProcessedInput = presence.lastReceived;
    this.motoLeftAt.delete(moto.id);
  }

  /** The rider gets off on the left and the bike stays there, unless it is still going too fast. */
  private dismountMoto(player: Player): void {
    const moto = this.state.motos.get(player.interactionState.slice('moto:'.length));
    if (!moto) { player.interactionState = ''; player.animationState = 'idle'; return; }
    if (Math.abs(moto.speed) > MOTO.DISMOUNT_SPEED) throw new Error('Diminua a velocidade para descer da moto.');
    moto.speed = 0; moto.steer = 0;
    this.freeMoto(moto, player);
  }

  private freeMoto(moto: Moto, rider?: Player): void {
    moto.riderId = ''; this.motoLeftAt.set(moto.id, Date.now());
    if (!rider) return;
    if (rider.interactionState === motoInteraction(moto.id)) {
      Object.assign(rider, motoDismountSpot(moto));
      rider.rotation = moto.yaw; rider.interactionState = ''; rider.animationState = 'idle'; rider.animationStartedAt = Date.now();
    }
    const presence = this.sessions.getByUser(rider.id);
    if (presence) { presence.queue.length = 0; presence.motoQueue.length = 0; rider.lastProcessedInput = presence.lastReceived; }
  }

  private serveDrinks(now: number): void {
    const bartender = this.state.npcs.get('bartender');
    if (!bartender) return;
    const waiting = (id: string) => { const p = this.state.players.get(id); return p?.connected && p.interactionState === 'counter' ? p : undefined; };
    const served = this.service.update(bartender, waiting, now);
    const player = served ? waiting(served) : undefined, presence = served ? this.sessions.getByUser(served) : undefined;
    if (!player || !presence) return;
    presence.counterCharge = undefined;
    // The drink goes into the hand: free to walk away with it, having it over the same time as at a table.
    const item = player.drinkItem || 'garrafa';
    player.interactionState = ''; player.animationState = 'idle'; player.animationStartedAt = now; player.drinkItem = ''; presence.interactionEndsAt = undefined;
    this.startHolding(player, item, now);
    this.systemMessage(`O Magrão serviu ${player.displayName}. Saúde!`, player);
  }

  private async interact(client: Client, objectId: string, item: DrinkItem = 'garrafa'): Promise<void> {
    const player = this.player(client), presence = this.forClient(client)!, now = Date.now();
    if (objectId === 'stand') {
      if (player.animationState === 'kick') throw new Error('Espere o golpe terminar.');
      if (isRidingMoto(player.interactionState)) { this.dismountMoto(player); return; }
      // On the stage, standing up is putting the instrument back: the stop clip plays first.
      if (player.interactionState.startsWith('stage-')) { this.musicians.stop(player.id, now); return; }
      if (player.interactionState.startsWith('foosball:')) { this.leaveFoosball(player); return; }
      // Already getting up, putting the cigarette out, smoking a whole one or being sick: it ends by itself.
      if (['stand-up', 'smoke-stop', 'cigarette', 'vomit'].includes(player.animationState)) return;
      if (player.interactionState === 'smoke') { this.stopSmoking(player, presence, now); return; }
      // Out of a chair: `levantar` plays (once `sentar` is over) before the body is free, the chair taken until then.
      if (player.interactionState.startsWith('seat-') && player.animationState === 'sit') {
        if (this.orderPending(player.id)) throw new Error(this.waiter.cancellable(player.id) || this.jobs.holder(player.id)?.entry.picked === false ? 'Espere o seu pedido chegar (ou cancele enquanto ele está no balcão).' : 'Seu pedido está a caminho. Espere chegar para levantar.');
        // A picnic bench has no chair to push back: the body steps out behind the bench at once.
        if (onBench(player.interactionState)) { this.finishStandUp(player); return; }
        const from = Math.max(now, player.animationStartedAt + barClipMs('sentar'));
        player.animationState = 'stand-up'; player.animationStartedAt = from; presence.interactionEndsAt = from + barClipMs('levantar');
        return;
      }
      if (player.currentTableId) this.leaveTable(client);
      else {
        // An order on its way keeps the customer at the table; the order a worker is putting down keeps the worker there.
        if (player.interactionState.startsWith('seat-') && this.orderPending(player.id)) throw new Error(this.waiter.cancellable(player.id) || this.jobs.holder(player.id)?.entry.picked === false ? 'Espere o seu pedido chegar (ou cancele enquanto ele está no balcão).' : 'Seu pedido está a caminho. Espere chegar para levantar.');
        if (player.interactionState === 'job' && this.jobs.shift(player.id)?.task.kind === 'deliver') throw new Error('Termine de servir a mesa.');
        this.consumePart(player, presence, now); this.cancelCounter(player.id); if (player.interactionState === 'job') this.jobs.interrupt(player.id); Object.assign(player, standingPosition(player, player.rotation)); player.interactionState = ''; player.animationState = 'idle'; player.drinkItem = ''; presence.interactionEndsAt = undefined;
      }
      return;
    }
    const object = INTERACTABLES.find(i => i.id === objectId);
    if (!object || !canInteract(object, player, INTERACTION_SLACK)) throw new Error('Chegue mais perto para interagir.');
    if (player.interactionState) throw new Error('Levante-se antes de interagir.');
    if (object.type === 'blackjack') { this.joinTable(client); return; }
    if (object.type === 'foosball') { this.joinFoosball(client, object.id); return; }
    if(object.type!=='seat'){
      const target=interactionReach(object,player);
      if(Math.hypot(target.x-player.x,target.z-player.z)>.01)player.rotation=Math.atan2(target.x-player.x,target.z-player.z);
    }
    if (object.type === 'seat') {
      if ([...this.state.players.values()].some(p => p.interactionState === object.id)) throw new Error('Esse lugar está ocupado.');
      // `sentar` pulls the chair back and seats the body from beside it; the clips time from animationStartedAt.
      player.x = object.x; player.y = object.y ?? player.y; player.z = object.z; player.rotation = object.rotation || 0; player.animationState = 'sit'; player.animationStartedAt = now; player.interactionState = object.id;
    } else if (object.type === 'counter') {
      if (player.holding) throw new Error(`Ainda na mão: ${holdingName(player.holding)}. Termine antes de pedir outra bebida.`);
      // Magrão charges first (the API decides); the player then waits and the drink starts when he finishes
      // preparing it (see serveDrinks). Anything that drops the order before that refunds it (cancelCounter).
      const price = itemPrice(this.prices, item), requestId = randomUUID();
      if (price) await this.charge(presence, price, `counter:${item}`, requestId);
      if (this.forClient(client) !== presence || !player.connected || player.interactionState || !canInteract(object, player, INTERACTION_SLACK)) {
        if (price) this.refund(presence, requestId, price);
        throw new Error('Você saiu do balcão. Moedas devolvidas.');
      }
      if (price) presence.counterCharge = { requestId, amount: price };
      player.animationState = 'wait'; player.animationStartedAt=Date.now();player.interactionState = object.id; presence.interactionEndsAt = undefined;
      player.drinkItem = item;
      this.service.order(player.id, item);
      this.systemMessage(`${player.displayName} pediu ${item === 'copo' ? 'um copo de chopp' : 'uma long neck'} ao Magrão.`, player);
    } else if (object.type === 'toilet') {
      if ([...this.state.players.values()].some(p => p !== player && p.interactionState === object.id)) throw new Error('Ocupado. Espere a sua vez.');
      player.animationState = 'toilet';player.animationStartedAt=now;player.interactionState = object.id; presence.interactionEndsAt = now + NEEDS.bladder.toiletSeconds * 1000;
    } else if (object.type === 'urinal') {
      // At the spot in front of it, facing it, for the whole `urinar` clip.
      if ([...this.state.players.values()].some(p => p !== player && p.interactionState === object.id)) throw new Error('Ocupado. Espere a sua vez.');
      Object.assign(player, { x: object.x, y: object.y ?? player.y, z: object.z, rotation: object.rotation ?? player.rotation });
      player.animationState = 'urinate'; player.animationStartedAt = now; player.interactionState = object.id; presence.interactionEndsAt = now + barClipMs('urinar');
      presence.queue.length = 0; player.lastProcessedInput = presence.lastReceived;
    } else if (object.type === 'door') {this.toggleDoor(player, object.id);this.playTemporary(player,presence,'use',USE_DURATION_MS);}
    else if (object.type === 'stage') client.send('stage.open', { until: player.stageUntil, price: priceOf(this.prices, 'stage:pass') });
    // The house's shop: buying goes through the API (POST /api/inventory/buy), as from any shop window.
    else if (object.type === 'shop') client.send('shop.open', {});
    // The light desk: up on the deck, facing the sound desk; the panel sends show.set and show.cue from then on.
    else if (object.type === 'lights') {
      if (!onStage(player)) throw new Error('A mesa de luz fica em cima do palco.');
      player.rotation = LIGHT_DESK.rotation; this.playTemporary(player, presence, 'use', USE_DURATION_MS); client.send('lights.open', {});
    }
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
  /** Drops a counter order not served yet, refunding what Magrão charged. */
  private cancelCounter(playerId:string):void {
    this.service.cancel(playerId);
    const presence=this.sessions.getByUser(playerId),charge=presence?.counterCharge;
    if(presence&&charge){presence.counterCharge=undefined;this.refund(presence,charge.requestId,charge.amount);}
  }
  /** Whether a customer has a table order on its way (with Tonico or a worker). */
  private orderPending(playerId:string):boolean {return this.waiter.has(playerId)||!!this.jobs.holder(playerId);}
  /** A player working the bar who can take a customer's order now. */
  private requireWorker(customer:Player,workerId:string):Player {
    if(workerId===customer.id)throw new Error('Você não pode fazer um pedido para você mesmo.');
    const worker=this.state.players.get(workerId),shift=this.jobs.shift(workerId);
    if(!worker?.connected||!shift)throw new Error('Essa pessoa não está mais trabalhando. Peça ao Tonico.');
    if(shift.orders.length>=MAX_WORKER_ORDERS)throw new Error(`${worker.displayName} já está com pedidos demais. Peça ao Tonico.`);
    return worker;
  }
  /** Drops a customer's table order wherever it is (Tonico or a worker) and refunds it. */
  private cancelTable(playerId:string,message?:string):void {
    const presence=this.sessions.getByUser(playerId),now=Date.now();
    const held=this.jobs.drop(playerId,now),orders=[...this.waiter.cancel(playerId),...held?[held.entry.order]:[]];
    if(held){
      const worker=this.state.players.get(held.shift.playerId);
      if(worker){
        if(worker.carryingOrder===held.entry.order.id){worker.carrying='';worker.carryingOrder='';}
        // Stopped in the middle of putting it down: the worker is free again.
        if(worker.interactionState==='job'&&!held.shift.task.startedAt){worker.interactionState='';worker.animationState='idle';}
        const workerPresence=this.sessions.getByUser(worker.id);
        if(workerPresence)workerPresence.client.send('job.state',{...this.jobView(worker.id),message:`O pedido de ${held.entry.customer} foi cancelado.`});
      }
    }
    for(const order of orders){
      this.refundOrder(order);this.served.removeOrder(order.id);
      if(presence&&message)presence.client.send('table.state',{status:'cancelled',order:publicOrder(order),message});
    }
  }
  /** A worker's shift ended with orders still to deliver: Tonico takes them, nobody pays twice. */
  private handOver(workerId:string,orders:readonly WorkerOrder[]):void {
    const worker=this.state.players.get(workerId);
    if(worker&&(worker.carrying||worker.carryingOrder)){worker.carrying='';worker.carryingOrder='';}
    for(const {order} of orders){
      this.served.removeOrder(order.id);this.waiter.adopt(order);
      this.sessions.getByUser(order.playerId)?.client.send('table.state',{status:'ordered',order:{...publicOrder(order),waiter:'Tonico',stage:'queued'},
        message:`${worker?.displayName??'Quem pegou o seu pedido'} encerrou o turno. O Tonico vai levar o seu pedido.`});
    }
  }
  /** A table order carries the wallet it was charged to, so its refund never depends on the session still being here. */
  private refundOrder(order:TableOrder):void {
    void this.walletRetries.credit(order.owner,order.total,`refund:${order.id}`,randomUUID(),change=>{const presence=this.sessions.getByUser(order.playerId);if(presence)this.walletChanged(presence,change.balance,change.applied,'refund');});
  }
  private serveTables(now:number):void {
    const tonico=this.state.npcs.get('tonico');if(!tonico)return;
    // With nobody working the bar, clearing the tables is Tonico's.
    const events=this.waiter.update(tonico,order=>{
      const player=this.state.players.get(order.playerId),seat=INTERACTABLES.find(i=>i.id===order.seatId);
      return player?.connected&&player.interactionState===order.seatId&&seat?{x:seat.x,y:seat.y??player.y,z:seat.z}:undefined;
    },now,this.jobs.working===0);
    if(events.picked)this.sessions.getByUser(events.picked.playerId)?.client.send('table.state',{status:'ordered',order:{...publicOrder(events.picked),waiter:'Tonico',stage:'carrying'}});
    if(events.placing)this.served.place(events.placing.order,events.placing.plan,now);
    // Seated customers have what is in front of them, a little at a time.
    this.served.update(now,this.seated,(playerId,item,portion)=>{const player=this.state.players.get(playerId);if(player)this.needs.consume(player,item,now,portion);});
    if(events.delivered)this.tableDelivered(events.delivered,'O Tonico',now);
    if(events.dropped){
      const {order,reason}=events.dropped,presence=this.sessions.getByUser(order.playerId);
      this.refundOrder(order);this.served.removeOrder(order.id);presence?.client.send('table.state',{status:'cancelled',order:publicOrder(order),message:reason});
      this.log('table_dropped',{playerId:order.playerId,orderId:order.id,reason});
    }
  }
  /** An order reached its table (its items are there): the customer is told, and starts on it. */
  private tableDelivered(order:TableOrder,by:string,now:number,workerId?:string):void {
    const player=this.state.players.get(order.playerId);
    this.sessions.getByUser(order.playerId)?.client.send('table.state',{status:'delivered',order:publicOrder(order),message:`${by} deixou tudo na mesa. Bom apetite!`});
    if(player)this.systemMessage(`${by} entregou o pedido de ${player.displayName}. Bom apetite!`,player);
    this.log('table_delivered',{playerId:order.playerId,orderId:order.id,total:order.total,waitMs:now-order.placedAt,...workerId?{workerId}:{}});
  }
  private runJobs(now:number):void {
    for(const event of this.jobs.tick(now)){
      const player=this.state.players.get(event.playerId),presence=this.sessions.getByUser(event.playerId);
      if(event.type==='paid'){
        if(player?.interactionState==='job'){player.interactionState='';player.animationState='idle';}
        // Clearing a table takes away what was finished on it.
        if(event.kind==='station'&&event.station.table!==undefined)this.served.clearTable(event.station.table);
        // An order picked up at the counter goes on the worker's tray, and off it onto the customer's table.
        const order=event.order?.order;
        if(order&&player&&event.kind==='pickup'){
          player.carrying=order.items.join(',');player.carryingOrder=order.id;
          this.sessions.getByUser(order.playerId)?.client.send('table.state',{status:'ordered',order:{...publicOrder(order),waiter:player.displayName,stage:'carrying'}});
        }
        if(order&&event.kind==='deliver'){
          if(player){player.carrying='';player.carryingOrder='';}
          this.tableDelivered(order,player?.displayName??'O ajudante',now,event.playerId);
        }
        this.payJob(event.payment);
        if(presence)this.sendJob(presence);
      }else if(event.type==='changed'){if(presence)this.sendJob(presence);}
      else{
        this.handOver(event.playerId,event.orders);
        if(!player)continue;
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
    this.handOver(player.id,shift.orders);
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
      jobs:this.jobs.slots().map(slot=>({...slot,...this.jobs.totals.get(slot.id),workers:this.jobs.workers(slot.id).map(s=>({playerId:s.playerId,tasks:s.tasks,earned:s.earned,station:s.task.station.label,endsInS:Math.round((s.endsAt-now)/1000),
        orders:s.orders.map(o=>({...publicOrder(o.order),customer:o.customer,table:o.table,picked:o.picked}))}))})),
      dirtyTables:this.served.dirtyTables(),
      media:[...[...this.state.jukeboxes.values()].map(m=>({kind:'jukebox',...m.toJSON()})),...[...this.state.televisions.values()].map(m=>({kind:'tv',...m.toJSON()}))],
      musicians:this.musicians.snapshot(),prices:this.prices,pricesLoaded:this.pricesLoaded,logQueue:this.logQueue.length,walletRetries:this.walletRetries.size,
      process:{uptimeS:Math.round(process.uptime()),node:process.version,pid:process.pid,rss:process.memoryUsage().rss,heapUsed:process.memoryUsage().heapUsed,
        tickP95:worldMetrics.window('bar_world_tick_ms')?.percentile(95),apiOkAt:health.apiOkAt,outboxWritable:health.outboxWritable},resultOutbox:this.results.pending,event:this.state.event.type,
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
    const inHand=consumedOverTime(itemId);
    if(inHand&&player.holding)throw new Error(`Ainda na mão: ${holdingName(player.holding)}. Termine antes de pegar outro item.`);
    const view=await this.removeInventory(presence,itemId,1,'use');
    if(this.forClient(client)!==presence||!player.connected)return;
    if(inHand){
      // In hand, like Magrão's drinks: had over the same time as at a table, walking around meanwhile.
      this.startHolding(player,itemId,Date.now());presence.client.send('inventory.result',{action:'use',itemId,quantity:1});
    }else{
      presence.inventoryItem=itemId;player.interactionState='inventory';player.animationStartedAt=Date.now();
      player.animationState='use';player.drinkItem='';presence.interactionEndsAt=player.animationStartedAt+USE_DURATION_MS;
    }
    this.sendInventory(presence,view);
  }

  /** A backpack item used at once, a toilet or urinal visit, getting up from a chair, a cigarette put out or smoked whole, or being sick ran its full time. */
  private finishInteraction(player: Player, presence: Presence, now: number): void {
    presence.interactionEndsAt = undefined;
    if (player.animationState === 'stand-up') { this.finishStandUp(player); return; }
    if(presence.inventoryItem){const used=presence.inventoryItem;this.needs.consume(player,used,now);presence.client.send('inventory.result',{action:'use',itemId:used,quantity:1});presence.inventoryItem=undefined;}
    if (player.interactionState.startsWith('toilet-') || player.interactionState.startsWith('mictorio-')) this.needs.relieve(player, now);
    player.interactionState = ''; player.animationState = 'idle'; player.drinkItem = '';
  }
  /**
   * What is in hand goes into the hand: drinks Magrão served and anything from the backpack that is had over time. It
   * lasts consumeMs, whatever the player does meanwhile (walking, sitting, dancing).
   */
  private startHolding(player: Player, item: string, now: number): void {
    player.holding = item; player.holdingSince = now; player.holdingUntil = now + consumeMs(item);
    this.holdingConsumed.set(player.id, 0);
  }
  /** Empty hands: finished, spilled in a fall, or the player gone. What was had so far already counted. */
  private dropHolding(player: Player): void {
    player.holding = ''; player.holdingSince = 0; player.holdingUntil = 0;
    this.holdingConsumed.delete(player.id);
  }
  /**
   * Its effects come in as it goes, in 5% portions like at a table. Finished, it leaves the hand; a drink too many
   * comes back up (NEEDS.drunk.vomit), unless the body is busy with something else (seated, on the stage...).
   */
  private updateHolding(player: Player, presence: Presence, now: number): void {
    const item = player.holding, progress = Math.min(1, (now - player.holdingSince) / Math.max(1, player.holdingUntil - player.holdingSince));
    const portion = progress - (this.holdingConsumed.get(player.id) ?? 0);
    if (portion >= HOLDING_SIP || (progress >= 1 && portion > 0)) { this.holdingConsumed.set(player.id, progress); this.needs.consume(player, item, now, portion); }
    if (progress < 1) return;
    this.dropHolding(player);
    if (!player.interactionState && !player.currentTableId && isConscious(player) && this.needs.sick(player, item, now)) this.startVomiting(player, presence, now);
  }
  /** Ending a toilet visit, or a backpack item used at once, early counts the part already done. */
  private consumePart(player: Player, presence: Presence, now: number): void {
    if(presence.inventoryItem){this.needs.consume(player,presence.inventoryItem,now,(now-player.animationStartedAt)/Math.max(1,(presence.interactionEndsAt??now)-player.animationStartedAt));presence.inventoryItem=undefined;}
    if (player.interactionState.startsWith('toilet-') && presence.interactionEndsAt)
      this.needs.relieve(player, now, 1 - (presence.interactionEndsAt - now) / (NEEDS.bladder.toiletSeconds * 1000));
    if (player.interactionState.startsWith('mictorio-') && presence.interactionEndsAt)
      this.needs.relieve(player, now, 1 - (presence.interactionEndsAt - now) / barClipMs('urinar'));
  }
  /** `levantar` ended, or a bench was left: the body stands where the clip left it, beside the chair, or behind the bench (standUpSpot). */
  private finishStandUp(player: Player): void {
    const exit = standUpSpot(player.interactionState), spot = exit ?? standingPosition(player, player.rotation);
    player.x = spot.x; player.y = spot.y ?? player.y; player.z = spot.z;
    if (exit) player.rotation = exit.rotation;
    player.interactionState = ''; player.animationState = 'idle'; player.animationStartedAt = Date.now();
  }
  /** Puts the cigarette out (`fumar_apagar`), once it has been lit. */
  private stopSmoking(player: Player, presence: Presence, now: number): void {
    if (player.animationState !== 'smoke') return;
    const from = Math.max(now, player.animationStartedAt + barClipMs('fumar_acender'));
    player.animationState = 'smoke-stop'; player.animationStartedAt = from; presence.interactionEndsAt = from + barClipMs('fumar_apagar');
  }
  /** Sick where they stand, held still for the whole clip; the puddle is the clip's. */
  private startVomiting(player: Player, presence: Presence, now: number): void {
    player.interactionState = 'vomit'; player.animationState = 'vomit'; player.animationStartedAt = now; player.drinkItem = '';
    presence.interactionEndsAt = now + barClipMs('vomitar'); presence.gestureEndsAt = undefined;
    presence.queue.length = 0; player.lastProcessedInput = presence.lastReceived;
    this.systemMessage(`${player.displayName} bebeu além da conta e passou mal.`, player);
    this.log('vomit', { playerId: player.id, drunk: player.drunk });
  }
  /** The free corner of a table nearest to the worker, where `limpar_mesa` stands the body; none for other tables. */
  private cleaningCorner(tableNumber: number, worker: Player) {
    const table = CLEANABLE_TABLES.find(t => t.number === tableNumber);
    if (!table) return;
    return tableCorners(table).map(cornerSpot).filter(spot => isWalkable(spot.x, spot.z, spot.y))
      .sort((a, b) => Math.hypot(a.x - worker.x, a.z - worker.z) - Math.hypot(b.x - worker.x, b.z - worker.z))[0];
  }
  /** Falling ends whatever the character was doing: table, order, drink (spilled), chair, dance. */
  private knockDown(player: Player, presence: Presence): void {
    this.dropHolding(player);
    if (player.currentTableId) { this.blackjack.leave(player.id); player.currentTableId = ''; this.cleanTable(); this.syncTable(); }
    if (player.interactionState.startsWith('foosball:')) this.leaveFoosball(player);
    if (player.interactionState && player.interactionState !== 'fainted' && player.interactionState !== 'stumbling') Object.assign(player, standingPosition(player, player.rotation));
    // A musician who falls drops out at once: the spot is free and the instrument is back on its stand.
    this.musicians.release(player.id);
    this.cancelCounter(player.id);
    this.cancelTable(player.id);
    // A worker who falls while putting an order down takes it back on the tray (and starts over at the table).
    if (player.interactionState === 'job') { const task = this.jobs.interrupt(player.id); if (task?.kind === 'deliver' && task.order) this.served.removeOrder(task.order.order.id); }
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

  /** The plain state of a source, for the shared reducers (packages/shared/src/jukebox.ts). */
  private media(schema:Jukebox):JukeboxState {return schema.toJSON() as JukeboxState;}
  /**
   * Writes a reducer's result back. A video whose owner already left the bar starts with nobody controlling it, and a
   * video that left the source (played, skipped) takes its payment record along.
   */
  private assignMedia(schema:Jukebox,next:JukeboxState):void {
    const before=[schema.key,...schema.queue.map(entry=>entry.key)],{queue,...playback}=next;
    if(playback.by&&!this.state.players.get(playback.by)?.connected)Object.assign(playback,{by:'',byName:''});
    schema.assign(playback);
    if(queue.map(entry=>entry.key).join()!==schema.queue.map(entry=>entry.key).join())schema.queue=new ArraySchema(...queue.map(entry=>new MediaEntry().assign(entry)));
    const after=new Set([next.key,...queue.map(entry=>entry.key)]);
    for(const key of before)if(key&&!after.has(key))this.mediaPayments.delete(key);
  }
  /** Gives a video's coins back to the wallet that paid them, wherever its owner is now. */
  private refundMedia(key:string):void {
    const payment=this.mediaPayments.get(key);if(!payment)return;this.mediaPayments.delete(key);
    void this.walletRetries.credit(payment.owner,payment.amount,`refund:${key}`,randomUUID(),change=>{const presence=this.sessions.getByUser(payment.owner.userId);if(presence)this.walletChanged(presence,change.balance,change.applied,'refund');});
  }
  /** Whoever leaves the bar stops controlling their video: anyone at the screen takes it over. Their queue entries stay. */
  private releaseMedia(playerId:string):void {
    for(const states of [this.state.jukeboxes,this.state.televisions])for(const media of states.values())if(media.by===playerId)media.assign({by:'',byName:''});
  }
  /**
   * Pausing, resuming, seeking and skipping. The video's controller does it from anywhere they can hear it, even seated;
   * while nobody controls it, anyone at the screen takes it over (requireMedia).
   */
  private requireMediaControl(kind:'jukebox'|'tv',client:Client,id:string):void {
    const player=this.player(client),media=(kind==='jukebox'?this.state.jukeboxes:this.state.televisions).get(id),system=(kind==='jukebox'?JUKEBOX_SYSTEMS:TV_SYSTEMS).find(s=>s.id===id);
    if(!media||!system||!media.by||media.by!==player.id){this.requireMedia(kind,client,id);return;}
    if(mediaGain(player,system)<=0)throw new Error(`Chegue mais perto d${kind==='jukebox'?'a jukebox':id==='telao'?'o telão':'a TV'} para controlar o vídeo.`);
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
  /** Whoever changes the show stands at the light desk, up on the stage. */
  private requireLightDesk(client:Client):Player {
    const player=this.player(client),desk=INTERACTABLES.find(i=>i.type==='lights')!;
    if(!onStage(player)||!canInteract(desk,player,INTERACTION_SLACK))throw new Error('Volte para a mesa de luz do palco para mexer no show.');
    return player;
  }
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

  /** Sits at the free chair nearest to where the player stands; a round in play is watched until the next deal. */
  private joinTable(client: Client): void {
    const player = this.player(client);
    const object = INTERACTABLES.find(i => i.id === 'blackjack-1')!;
    if (!canInteract(object, player, INTERACTION_SLACK)) throw new Error('Chegue mais perto da mesa.');
    if (player.interactionState && !player.currentTableId) throw new Error('Levante-se primeiro.');
    this.cleanTable();
    const nearest = BLACKJACK_SEATS.map((seat, chair) => ({ chair, d: Math.hypot(seat.x - player.x, seat.z - player.z) })).sort((a, b) => a.d - b.d)[0]!.chair;
    const seat = BLACKJACK_SEATS[this.blackjack.join(player.id, player.displayName, nearest)]!;
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

  /** Seats whose player is no longer at the table (logged out, knocked down) are given up; coins in play stay settled. */
  private cleanTable(): void {
    for (const seat of [...this.blackjack.seats]) if (!seat.left && this.state.players.get(seat.playerId)?.currentTableId !== 'blackjack-1') this.blackjack.leave(seat.playerId);
  }
  /** The player sitting at the blackjack table, or why they cannot play. */
  private atTable(client: Client): Player {
    const player = this.player(client);
    if (player.currentTableId !== 'blackjack-1') throw new Error('Sente-se à mesa de blackjack primeiro.');
    return player;
  }
  private logRound(summary: RoundSummary): void {
    for (const { playerId, staked, paid, outcomes } of summary.players)
      this.log('blackjack_round', { playerId, roundId: summary.roundId, staked, paid, net: paid - staked, outcomes: outcomes.join(', ') });
  }

  private syncTable(): void {
    const snapshot = this.blackjack.snapshot();
    const json = JSON.stringify(snapshot);
    if (json === this.lastTableJson) return;
    this.lastTableJson = json;
    const state = this.state.tables.get('blackjack-1')!, card = (c: { rank: string; suit: string; seq: number }) => new CardState().assign({ rank: c.rank, suit: c.suit, seq: c.seq });
    state.assign({ phase: snapshot.phase, round: snapshot.round, move: snapshot.move, roundId: snapshot.roundId, deadline: snapshot.deadline,
      turnPlayerId: snapshot.turnPlayerId, turnHand: snapshot.turnHand, dealerTotal: snapshot.dealerTotal, dealerSoft: snapshot.dealerSoft, minBet: snapshot.minBet, maxBet: snapshot.maxBet });
    state.dealerCards = new ArraySchema(...snapshot.dealer.map(card));
    state.seats = new ArraySchema(...snapshot.seats.map(seat => new SeatState().assign({
      playerId: seat.playerId, displayName: seat.displayName, chair: seat.chair, bet: seat.bet, lastBet: seat.lastBet, insurance: seat.insurance, insured: seat.insured,
      staked: seat.staked, paid: seat.paid, net: seat.net, status: seat.status, result: seat.result,
      hands: new ArraySchema(...seat.hands.map(hand => new HandState().assign({ cards: new ArraySchema(...hand.cards.map(card)), bet: hand.bet, total: Math.min(255, hand.total), soft: hand.soft,
        split: hand.split, doubled: hand.doubled, status: hand.status, outcome: hand.outcome ?? '', payout: hand.payout }))),
    })));
    const dealer = this.state.npcs.get('dealer');
    const animation = ['dealing', 'insurance', 'playing', 'dealer'].includes(snapshot.phase) ? 'deal' : snapshot.phase === 'results' ? 'shuffle' : 'idle';
    if (dealer && dealer.animationState !== animation) { dealer.animationState = animation; dealer.animationStartedAt = Date.now(); }
  }

  // ── Pebolim ──────────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * E at a pebolim table: a free place (the avatar goes to its handles and stays there), or another place at the same
   * table before the match. A table in a match, or full, is watched from beside it instead (foosball.open says which).
   */
  private joinFoosball(client: Client, tableId: string, slot?: number): void {
    const player = this.player(client), presence = this.forClient(client)!, table = this.foosball.get(tableId);
    if (!table) throw new Error('Mesa de pebolim desconhecida.');
    const here = table.seat(player.id);
    if (!here) {
      if (!this.nearFoosball(player, tableId)) throw new Error('Chegue mais perto da mesa de pebolim.');
      if (player.interactionState || player.currentTableId) throw new Error(player.interactionState.startsWith('foosball:') ? 'Você já está em outra mesa de pebolim.' : 'Encerre a ação atual antes de jogar.');
      if (player.animationState === 'kick') throw new Error('Espere o golpe terminar.');
    }
    try {
      if (here && slot !== undefined) table.move(player.id, slot);
      else if (!here) table.join(player.id, player.displayName, slot);
    } catch (error) {
      if (here) throw error;
      presence.watching = tableId;
      client.send('foosball.open', { tableId, watching: true, reason: error instanceof Error ? error.message : '' });
      return;
    }
    presence.watching = undefined;
    player.interactionState = `foosball:${tableId}`; player.animationState = 'wait'; player.animationStartedAt = Date.now(); player.drinkItem = '';
    presence.gestureEndsAt = undefined; presence.queue.length = 0; player.lastProcessedInput = presence.lastReceived;
    this.syncFoosball();
    client.send('foosball.open', { tableId, watching: false });
    if (!here) this.systemMessage(`${player.displayName} chegou na mesa ${FOOSBALL_TABLES.find(t => t.id === tableId)!.number} do pebolim.`, player);
  }

  /** Off the table (or stops watching): out on the room's side of it, where it was played. */
  private leaveFoosball(player: Player): void {
    const presence = this.sessions.getByUser(player.id);
    if (presence) presence.watching = undefined;
    if (!player.interactionState.startsWith('foosball:')) return;
    const id = player.interactionState.slice('foosball:'.length), table = this.foosball.get(id), place = FOOSBALL_TABLES.find(t => t.id === id);
    table?.leave(player.id);
    if (place) { const exit = foosballExit(place, player.x); Object.assign(player, isWalkable(exit.x, exit.z, exit.y) ? exit : standingPosition(player, player.rotation)); }
    player.interactionState = ''; player.animationState = 'idle'; player.animationStartedAt = Date.now();
    if (presence) { presence.queue.length = 0; player.lastProcessedInput = presence.lastReceived; }
    this.syncFoosball();
  }

  /** Touching the table (to play), or close by on its floor (to watch). */
  private nearFoosball(player: Player, tableId: string): boolean {
    const object = INTERACTABLES.find(i => i.id === tableId), place = FOOSBALL_TABLES.find(t => t.id === tableId);
    if (!object || !place) return false;
    return canInteract(object, player, INTERACTION_SLACK) || (Math.abs(player.y - place.y) < 1 && Math.hypot(player.x - place.x, player.z - place.z) < 4);
  }

  /** The player at a pebolim table, and the table, or why they cannot play. */
  private atFoosball(client: Client): { player: Player; table: FoosballTable } {
    const player = this.player(client), table = player.interactionState.startsWith('foosball:') ? this.foosball.get(player.interactionState.slice('foosball:'.length)) : undefined;
    if (!table?.seat(player.id)) throw new Error('Pegue um lugar numa mesa de pebolim primeiro.');
    return { player, table };
  }

  /** Each table's places in the room's state, and every player at its handles (a new format or place moves them). */
  private syncFoosball(): void {
    for (const [id, table] of this.foosball) {
      const snapshot = table.snapshot(), json = JSON.stringify(snapshot);
      if (this.foosballShown.get(id) === json) continue;
      this.foosballShown.set(id, json);
      const { slots, ...rest } = snapshot, state = this.state.foosball.get(id)!;
      state.assign(rest);
      if (state.slots.length !== slots.length) state.slots = new ArraySchema(...slots.map(slot => new FoosballSlotState().assign(slot)));
      else slots.forEach((slot, i) => state.slots[i]!.assign(slot));
      const place = FOOSBALL_TABLES.find(t => t.id === id)!;
      for (const slot of table.humans) {
        const player = this.state.players.get(slot.playerId), spot = foosballSpot(place, slot.team, slot.role);
        if (player && Math.hypot(player.x - spot.x, player.z - spot.z) + Math.abs(player.rotation - spot.rotation) > .01) Object.assign(player, spot);
      }
    }
  }

  /** Places whose player is no longer at the table (moved, knocked down) are given up; avatars left without a place get up. */
  private checkFoosball(): void {
    for (const [id, table] of this.foosball) for (const slot of table.humans) {
      const player = this.state.players.get(slot.playerId);
      if (!player || player.interactionState !== `foosball:${id}`) table.leave(slot.playerId);
    }
    for (const player of this.state.players.values())
      if (player.interactionState.startsWith('foosball:') && !this.foosball.get(player.interactionState.slice('foosball:'.length))?.seat(player.id)) this.leaveFoosball(player);
  }

  /** The tables' fixed physics steps, catching up on the timer's real pace, and their frames 30 times a second. */
  private foosballTick(): void {
    const now = Date.now(), step = 1000 / FOOSBALL.tickHz, clock = this.foosballClock;
    clock.owed = Math.min(clock.owed + (clock.last ? now - clock.last : step), step * 6); clock.last = now;
    const active = [...this.foosball.values()].filter(table => table.phase !== 'lobby');
    if (!active.length) { clock.owed = 0; return; }
    while (clock.owed >= step) { clock.owed -= step; for (const table of active) table.tick(now); }
    if (now - clock.frameAt >= 1000 / 30 - 2) {
      clock.frameAt = now;
      for (const table of active) { const frame = table.frame(now); if (frame) this.sendFoosballFrame(frame); }
    }
    this.syncFoosball();
  }

  /** To the table's players, whoever watches it and everyone near it on its floor (the ball on the 3D table). */
  private sendFoosballFrame(frame: FoosballFrame): void {
    const place = FOOSBALL_TABLES.find(t => t.id === frame.id)!, table = this.foosball.get(frame.id)!;
    for (const [id, presence] of this.sessions) {
      const player = this.state.players.get(id);
      if (!player?.connected || presence.revoked) continue;
      const far = Math.abs(player.y - place.y) > 1.5 || Math.hypot(player.x - place.x, player.z - place.z) > AOI_RADIUS;
      // Whoever walked away stops watching.
      if (presence.watching === frame.id && Math.hypot(player.x - place.x, player.z - place.z) > 8) presence.watching = undefined;
      if (!far || presence.watching === frame.id || table.seat(id)) presence.client.send('foosball.frame', frame);
    }
  }

  /** A finished match: in the log for each player, and told to the bar around the table. */
  private foosballMatch(summary: FoosballSummary): void {
    const place = FOOSBALL_TABLES.find(t => t.id === summary.tableId)!, table = this.foosball.get(summary.tableId)!;
    for (const p of summary.players) this.log('foosball_match', { playerId: p.playerId, roundId: summary.matchId, table: place.number, team: p.team, result: p.result,
      score: summary.score, forfeit: summary.forfeit, stake: summary.stake, paid: p.paid, net: summary.stake ? p.paid - summary.stake : 0 });
    const origin = this.state.players.get(summary.players[0]?.playerId ?? ''), winner = table.winner;
    if (!origin || !winner) return;
    const names = table.slots.filter(s => s.team === winner && (s.playerId || s.cpu)).map(s => s.displayName);
    this.systemMessage(`Pebolim, mesa ${place.number}: ${names.join(' e ')} (${TEAM_NAMES[winner]}) venceu por ${summary.score}${summary.forfeit ? ', por W.O.' : ''}${summary.stake ? `, valendo ${summary.stake} moedas` : ''}.`, origin);
  }

  private syncEvent(now: number): void {
    const current = this.events.current;
    this.state.event.type = current.kind === 'none' ? '' : eventTypes[current.kind];
    this.state.event.id = current.kind === 'none' ? '' : randomUUID();
    this.state.event.startedAt = current.kind === 'none' ? 0 : now;
    this.state.event.durationMs = current.kind === 'none' ? 0 : current.endsAt - now;
    if (current.kind !== 'none') this.systemMessage(`${current.title} ${current.description}`);
    this.log('world_event', { type: this.state.event.type });
  }

  private refreshViews(): void {
    for (const [id, presence] of this.sessions) {
      const self = this.state.players.get(id);
      if (!self || !presence.client.view) continue;
      const visible = new Set<Schema>();
      // A rider is seen as far as the bike is (the bikes have no area of interest), not a bike riding itself.
      for (const player of this.state.players.values()) if (player.id === id || isRidingMoto(player.interactionState) || distance(self, player) <= AOI_RADIUS) visible.add(player);
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
      await this.blackjackBank.flush();
      await this.foosballBank.flush();
      await this.walletRetries.flush();
      // Prices and the log never hold up payments and results: they try again next round.
      if (!this.pricesLoaded) await this.reloadPrices().catch((error: unknown) => this.log('prices_unavailable', { message: error instanceof Error ? error.message : String(error) }));
      await this.flushLogs().catch(() => {});
    } catch (e) {
      worldMetrics.inc('bar_world_maintenance_failures_total', 'Maintenance rounds that failed (API unreachable or refused)');
      this.log('maintenance_retry', { message: e instanceof Error ? e.message : 'error', requestId: (e as { requestId?: string }).requestId });
    }
    finally { this.maintenanceBusy = false; }
  }

  /** Reads the price table again and tells everyone in the bar; job pay follows its `job:<id>` price. */
  private async reloadPrices(): Promise<void> {
    const { prices } = await internal<{ prices: unknown }>('prices');
    const next = sanitizePrices(prices), changed = JSON.stringify(next) !== JSON.stringify(this.prices);
    this.prices = next; this.pricesLoaded = true;
    for (const job of JOBS) this.jobs.configure(job.id, { pay: priceOf(next, `job:${job.id}`) });
    if (changed) { this.syncJobs(); this.broadcast('prices', { prices: next }); this.log('prices_loaded', {}); }
  }
  /** Sends what is queued for the log; a failed batch is kept for the next round (the queue is bounded). */
  private async flushLogs(): Promise<void> {
    while (this.logQueue.length) {
      const batch = this.logQueue.slice(0, 200);
      await internal('logs', { events: batch.map(({ event, userId, details, at }) => ({ event, ...(userId ? { userId } : {}), details, at })) });
      this.logQueue.splice(0, batch.length);
    }
  }
  /** The player's items and coins read again from the API (inventory.sync, or the administration changed them). */
  private async syncPresence(presence: Presence): Promise<void> {
    const access = await validateAccess(presence.ticket.sessionId, presence.ticket.userId);
    if (this.sessions.getByUser(presence.ticket.userId) !== presence) return;
    if (!access.valid) { this.expel(presence.ticket.userId, 'Sua sessão terminou.'); return; }
    this.setInventory(presence, access.inventory ?? []); this.sendInventory(presence);
    // Coins can change outside the room too (a Pix on the phone, the administration).
    if (access.balance !== undefined && access.balance !== presence.balance) { presence.balance = access.balance; presence.client.send('wallet.state', { balance: presence.balance }); }
    const player = this.state.players.get(presence.ticket.userId); if (player) this.applyAppearance(player, access);
  }

  /** One administrative control. Throws to reject it for good (the API records it as failed). */
  private applyControl(control: Control): void {
    if (control.action === 'prices') { this.pricesLoaded = false; return; }
    if (control.action === 'sync') { const presence = control.playerId ? this.sessions.getByUser(control.playerId) : undefined; if (presence) void this.syncPresence(presence).catch(() => {}); return; }
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
    // The other end of an answered phone call hears the speaker wherever they are, even with other voices switched off.
    const callPeer = this.phoneCalls.peerOf(speaker.id);
    for (const [id, listener] of this.sessions) {
      const onCall = id === callPeer;
      if (id === speaker.id || listener.revoked || (!listener.listening && !onCall) || listener.blocked.has(speaker.id) || presence.blocked.has(id)) continue;
      const other = this.state.players.get(id);
      if (!other?.connected || (!onCall && distance(speaker, other) > VOICE.maxDistance)) continue;
      frame ??= wrapVoice(speaker.id, bytes);
      listener.client.sendBytes('voice', frame);
    }
  }

  /** The camera of a call goes to its other end, whatever the distance, at most PHONE.videoFps (with some slack) a second. */
  private relayVideo(client: Client, bytes: Uint8Array): void {
    const presence = this.forClient(client);
    if (!presence || presence.revoked || bytes.length > PHONE.videoFrameMaxBytes || !isJpeg(bytes)) return;
    const speaker = presence.ticket.userId, peer = this.phoneCalls.peerOf(speaker), listener = peer ? this.sessions.getByUser(peer) : undefined;
    if (!peer || !listener || listener.revoked || listener.blocked.has(speaker) || presence.blocked.has(peer)) return;
    const now = Date.now();
    if (now - (presence.videoWindowAt ?? 0) >= 1000) { presence.videoWindowAt = now; presence.videoFrames = 0; }
    presence.videoFrames = (presence.videoFrames ?? 0) + 1;
    if (presence.videoFrames > PHONE.videoFps + 4) return;
    listener.client.sendBytes('phone.video', bytes);
  }

  private startCall(client: Client, to: string, video = false): void {
    const presence = this.forClient(client)!, caller = this.player(client), callee = this.state.players.get(to), target = this.sessions.getByUser(to), now = Date.now();
    if (this.phoneCalls.of(caller.id)) throw new Error('Você já está em uma ligação.');
    // Refused calls never ring: the caller hears why, and the other side is not told (a block stays private).
    const refused: PhoneCallEnd | undefined = to === caller.id ? 'self' : presence.blocked.has(to) || target?.blocked.has(caller.id) ? 'blocked'
      : !target || target.revoked || !callee?.connected ? 'offline' : this.phoneCalls.of(to) ? 'busy' : undefined;
    if (refused) {
      client.send('phone.call', { id: randomUUID(), state: 'ended', peerId: to, peerName: callee?.displayName ?? '', peerColor: callee?.color ?? '', startedAt: now, reason: refused } satisfies PhoneCallView);
      return;
    }
    this.sendCall(this.phoneCalls.start(caller.id, to, now, video));
    this.log('phone_call', { playerId: caller.id, to, video });
  }
  /** Each end gets the call as they see it; `ended` closes it (a caller giving up is a missed call for the other side). */
  private sendCall(call: PhoneCall, ended?: PhoneCallEnd, by?: string): void {
    for (const [self, peer] of [[call.from, call.to], [call.to, call.from]] as const) {
      const player = this.state.players.get(self), other = this.state.players.get(peer);
      if (player) player.phone = !ended && call.answeredAt ? 'call' : '';
      const presence = this.sessions.getByUser(self);
      if (!presence || presence.revoked) continue;
      const reason = ended === 'hangup' && !call.answeredAt && by === call.from && self === call.to ? 'missed' : ended;
      presence.client.send('phone.call', { id: call.id, state: ended ? 'ended' : call.answeredAt ? 'active' : self === call.from ? 'outgoing' : 'incoming',
        peerId: peer, peerName: other?.displayName ?? '', peerColor: other?.color ?? '', startedAt: call.startedAt,
        ...(call.answeredAt ? { answeredAt: call.answeredAt } : {}), ...(reason ? { reason } : {}), ...(call.video ? { video: true } : {}) } satisfies PhoneCallView);
    }
  }
  private endCall(call: PhoneCall, reason: PhoneCallEnd, by?: string): void { if (this.phoneCalls.end(call.id)) this.sendCall(call, reason, by); }
  /** A player who drops or leaves ends their call: the other side hears it fall. */
  private dropCall(userId: string): void { const call = this.phoneCalls.of(userId); if (call) this.endCall(call, 'dropped', userId); }

  private forClient(client: Client): Presence | undefined { return this.sessions.getByClient(client); }
  private player(client: Client): Player { const p = this.forClient(client); if (!p) throw new Error('Sessão não encontrada.'); return this.state.players.get(p.ticket.userId)!; }
  private systemMessage(text: string, origin?: Player): void {
    const message: ChatMessage = { id: randomUUID(), playerId: 'system', displayName: 'B.A.R.', text, sentAt: Date.now(), system: true };
    for (const [id, p] of this.sessions) if (this.state.players.get(id)?.connected && (!origin || distance(origin, this.state.players.get(id)!) <= CHAT_RADIUS)) p.client.send('chat.message', message);
  }
  /** JSON lines with the room and pseudonymous player ids (apps/server/src/observability.ts). */
  private log(event: string, details: Record<string, unknown>): void {
    console.log(logLine(event, details, this.roomId));
    // The administration's log keeps real ids (it shows names); bots and unknown events stay out.
    const { playerId, ...rest } = details, userId = typeof playerId === 'string' ? playerId : undefined;
    if (!WORLD_LOG_EVENTS[event] || (userId && this.botIds.has(userId))) return;
    if (this.logQueue.length >= 2000) this.logQueue.shift();
    this.logQueue.push({ event, userId, details: rest, at: Date.now() });
  }
}
