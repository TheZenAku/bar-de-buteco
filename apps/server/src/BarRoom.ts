import {vrArmsSchema,encodeVrArms} from '@bar/shared';
import {STOPPED_VEHICLE,vehicleSpeed,vehicleMotionSpeed,vehicleMoving,vehicleVelocity,stepWheelie,HORSE_REAR} from '@bar/shared';
import { randomInt, randomUUID } from 'node:crypto';
import {FIREWORK,fireworkFireSchema,fireworkOrigin,fireworkFlightMs,type FireworkShot,type FireworkVector} from '@bar/shared';
import {CAR_MODEL,CAR_SEATS,NEW_CAR_PARTS,NEW_MOTO_PARTS,isCar,isPassenger,passengerInteraction,readDriveParts,readVehicleParts,seatPosition,vehicleMileageWear,vehicleName,vehicleOccupants,vehicleOfInteraction,vehicleParts,vehiclePhysics,vehicleRepair,vehicleSeat,wearVehicleParts,writeVehicleParts} from '@bar/shared';
import {applyCityWeather,applyEnvironmentPatch,environmentPatchSchema,gameHour,weatherAt,WEATHER_CITY} from '@bar/shared';
import {CityWeather} from './world/city-weather.js';
import {HORSE,horseFits,isRidingHorse,moveHorse,normalizeHeading} from '@bar/shared';
import {ServerPerformanceSampler} from './performance.js';
import { Client, Room, ServerError } from '@colyseus/core';
import { ArraySchema, Schema, StateView } from '@colyseus/schema';
import { z } from 'zod';
import { AOI_RADIUS, crowdSkinIndex, BLACKJACK_SEATS, CHAT_RADIUS, DEFAULT_SKIN, skillById, skinBase, WAVE_DURATION_MS, USE_DURATION_MS, RECOVER_DURATION_MS, INTERACTABLES, PATCH_MS, TICK_MS, canInteract, interactionReach, distance, findSpawn, standingPosition, flyPlayer, fallPlayer, groundBelow, floorHeight, inputSchema, movePlayer, skinMessageSchema, skinSchema, type AnimationState, type ChatMessage, type PlayerInput, VOICE, decodeVoicePacket, voiceStateSchema, wrapVoice, DOORS, PLAYER_RADIUS, inDoorSweep, isWalkable, setDoorStates, DRINK_ITEMS, type DrinkItem, ITEM_IDS, itemById, INVENTORY_CAPACITY, type InventoryStack, type InventoryView, type ItemId } from '@bar/shared';
import { verifyTicket, type GameTicket } from '@bar/shared/tickets';
import { Access, InternalApiError, internal, validateAccess, type Control } from './internal.js';
import { BarState, CardState, DoorState, FoosballSlotState, FoosballState, HandState, JobSlotState, Moto, Npc, Player, RagdollState, SeatState, TableState } from './state.js';
import { HighfoodDesk, customerLine, type FoodOrder } from './world/highfood.js';
import { TradeDesk, type Trade } from './world/trades.js';
import { vehicleFuelUse, vehiclePowered, GARAGE, GARAGES, TRADE, garageById, makePlate, offerIsEmpty, tradeCancelSchema, tradeConfirmSchema, tradeOfferMessageSchema, tradeReadySchema, tradeRequestSchema, tradeRespondSchema, type GarageView, type OwnedVehicle, type TradeOffer, type TradeResult } from '@bar/shared';
import { WALK_SPEED, type Position } from '@bar/shared';
import { HIGHFOOD, HIGHFOOD_CUSTOMERS, HIGHFOOD_NPC_PREFIX, atPickup, foodCodeSchema, foodEmptySchema, foodOrderSchema, isCustomerNpc, deliveryStars, mileageWear, motoDistance, sanitizeCustomers, type CustomerProfile, type HighfoodReceipt, type HighfoodState } from '@bar/shared';
import { KICK, KICKS, kickAim, kickClear, kickLaunch, kickTouches, kickWindow } from '@bar/shared';
import { MOTO_CRANK_MS, MOTO_ENGINE, MOTO_REPAIR, MOTO_RETRY_MS, MOTO_WEAR_FROM, canRepairMoto, isRepairingMoto, motoCrank, motoHandling, motoHitArea, motoRepairInteraction, motoRepairSchema, motoStallChance, motoStrikeHp, readMotoParts, repairOf, wearMotoParts, writeMotoParts, type MotoHitArea, type MotoPartId } from '@bar/shared';
import { MOTO, MOTO_LIGHT, NO_MOTO_INTENT, Ragdoll, advanceMoto, blendQuat, canLiftMoto, canMountMoto, isRidingMoto, loosePose, motoDespawnSchema, motoDismountSpot, motoInputSchema, motoInteraction, motoLeanSide, motoLiftSpot, motoMountSchema, motoObstacle, motoSpawnSchema, motoSpawnSpot, motoStrikes, motoUprightSpot, parkedMoto, startWreck, stepLoose, stepWreck, uprightQuat, wreckPose, type LooseBike, type MotoHit, type MotoInput, type MotoIntent, type MotoPose, type MotoWreck, type RagdollStart } from '@bar/shared';
import { BlackjackTable, type Result, type RoundSummary } from './minigames/blackjack.js';
import { TrucoTable, type TrucoSummary } from './minigames/truco.js';
import { BlackjackBank, GameBank, type BankEntry } from './minigames/blackjack-bank.js';
import { FoosballTable, type FoosballSummary } from './minigames/foosball.js';
import { PoolTable, type PoolSummary } from './minigames/pool.js';
import { TRUCO_SEATS, betLimits, blackjackActionSchema, blackjackBetSchema, blackjackInsuranceSchema, trucoAnswerSchema, trucoConfigSchema, trucoElevenSchema, trucoJoinSchema, trucoPlaySchema, trucoReadySchema, trucoSeatSchema, trucoSignalSchema, trucoStakes } from '@bar/shared';
import { FOOSBALL, FOOSBALL_TABLES, TEAM_NAMES, foosballBetLimits, foosballConfigSchema, foosballCpuSchema, foosballExit, foosballInputSchema, foosballJoinSchema, foosballKickSchema,
  foosballReadySchema, foosballSlotSchema, foosballSpot, foosballWatchSchema, type FoosballFrame } from '@bar/shared';
import { POOL_TABLES, poolStakes, poolAimSchema, poolChoiceSchema, poolConfigSchema, poolCpuSchema, poolExit, poolJoinSchema, poolReadySchema, poolSeatSchema, poolShotSchema, poolSpot,
  poolWatchSchema, type PoolShotView } from '@bar/shared';
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
import { CrowdPlanner, type CrowdEntry } from './world/crowd.js';
import {Refueling,type FuelJournal} from './world/refueling.js';
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
import { AchievementTracker } from './world/achievements.js';
import { DeathDirector } from './world/death.js';
import { DEATH_GONE_STATE, DEATH_STATE, SCENE_AUDIO_RADIUS, SERIES_CATEGORY, deathInputSchema, dominantCategory, type DeathPlan, type MorteCategory } from '@bar/shared';
import { ACHIEVEMENT_BLADDER_MIN, ACHIEVEMENT_CALL_MS, seriesOfItem, type Badge } from '@bar/shared';
import { PHONE, isJpeg, phoneCallIdSchema, phoneCallSchema, phonePingSchema, type PhoneCallEnd, type PhoneCallView, type PhonePing } from '@bar/shared';

// Interactions need the player to touch the object; the server tolerates a little drift from latency.
const INTERACTION_SLACK = 0.3;
/** A video its platform refuses within its first seconds never really played: its coins go back. */
const MEDIA_REFUND_WITHIN_S = 30;

/** Bike inputs kept waiting, and the most that time saved up by a gap may run at once (half a second). */
const MOTO_QUEUE = 12, MOTO_BURST = 10;
/** How often what counts by its duration is read (countTime). */
const ACHIEVEMENT_SAMPLE_MS = 5000;
/** A knock that only stops the bike wears it once in this time; a fall counts as this share of the speed it had. */
const MOTO_KNOCK_GAP_MS = 500, MOTO_FALL_FORCE = .4;
/** The Player.interactionState of a body thrown by a crash, until it has got up; and of someone lifting a fallen bike. */
const THROWN = 'thrown', LIFTING = 'moto-lift:';
/** What a kick can interrupt: being free, and what ends with nothing left hanging (another kick, a cigarette). */
const KICKABLE = new Set(['', 'kick', 'smoke', 'cigarette']);
/** Taking the bag out of the box, and the customer's dialog. */
const FOOD_UNLOAD = 'food-unload', FOOD_TALK = 'food-talk', FOOD_LOCKER = 'food-locker';
/** How often the customers' profiles are read again from the API. */
const CUSTOMERS_EVERY_MS = 60_000;
const RECOVER_HIPS_BEHIND = .42;
interface Presence {
  /** When the API last confirmed this session (maintenance spreads the checks out: config.accessRecheckMs). */
  validatedAt?:number;
  /** The skills this player bought (SKILLS). */
  skills:Set<string>;
  joinedAt:number;
  ticket: GameTicket;
  client: Client;
  blocked: Set<string>;
  queue: PlayerInput[];
  /** On a delivery bike, its inputs instead (simulated like walking: at most one a tick); when the last one came. */
  motoQueue: MotoInput[];
  horseRearHeld?:boolean;
  /** An administrator in flight (admin.fly): moves by flyPlayer, ignoring the map's solids. */
  flying?:boolean;
  /** Let go of the flight (B again): falls until it meets a surface (stepFall), then lands. */
  falling?:boolean;
  motoInputAt: number;
  /** How many bike inputs real time allows right now, and when that was counted (stepMotos). */
  motoBudget: number;
  motoBudgetAt: number;
  lastReceived: number;
  lastInputAt: number;
  seen: Set<Schema>;
  /** The sprites last sent (shared/crowd.ts): an identical set is not sent again. */
  crowdSent?: Uint8Array;
  revoked: boolean;
  rejectReconnect?: () => void;
  interactionEndsAt?: number;
  /** Just got up: nobody can kick this player again until then. */
  kickSafeUntil?: number;
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
  fireworkAt?:number;
  /** Coins as last confirmed by the API (the API decides every change; this only feeds the HUD and messages). */
  balance:number;
  /** The counter drink paid for and not yet served; refunded if the order is dropped. */
  counterCharge?:{requestId:string;amount:number};
  /** A stage pass being charged: a second click meanwhile must not buy (and charge) another. */
  stageBusy?:boolean;
  /** The pebolim or pool table this player watches from beside it (its frames and views come to them), '' or undefined otherwise. */
  watching?:string;
  /** Each pool table's view revision and stroke this player last got (pool.view, pool.shot). */
  poolSeen?:Map<string,{revision:number;shot:number}>;
  /** The vehicles whose key this player holds (the API keeps them); what they were last seen with. */
  vehicles:OwnedVehicle[];
  /** The customer's dialog is open, and it closes by itself at this time. */
  dialogUntil?:number;
}
// Actions that need a conscious character; chat, voice and movement input stay available (input is ignored).
/** What is in hand is had 5% at a time, like what is served at a table (served.ts). */
const HOLDING_SIP = .05;
const holdingName = (item: string) => catalogItem(item)?.name ?? item;
const NEEDS_CONSCIOUS = new Set(['food.start', 'garage.take', 'garage.store', 'moto.lock', 'trade.request', 'trade.respond', 'trade.ready', 'trade.confirm', 'moto.repair', 'table.order', 'job.start', 'job.work', 'player.interact', 'player.emote', 'player.skin', 'player.appearance', 'inventory.use', 'inventory.discard', 'blackjack.join', 'blackjack.bet', 'blackjack.action', 'blackjack.insurance', 'truco.join', 'truco.seat', 'truco.config', 'truco.ready', 'truco.again', 'truco.play', 'truco.call', 'truco.answer', 'truco.eleven', 'truco.signal', 'foosball.join', 'foosball.slot', 'foosball.config', 'foosball.cpu', 'foosball.ready', 'pool.join', 'pool.seat', 'pool.config', 'pool.cpu', 'pool.ready', 'pool.shot', 'pool.choice', 'jukebox.command', 'tv.command', 'stage.buy', 'phone.call', 'show.set', 'show.cue']);
const eventTypes: Record<EventKind, string> = { blackout: 'BLACKOUT', troublemaker: 'DRUNK_NPC', party: 'PARTY' };
const centre = (spots: readonly { x: number; z: number }[]) => ({ x: spots.reduce((sum, s) => sum + s.x, 0) / spots.length, z: spots.reduce((sum, s) => sum + s.z, 0) / spots.length });
const eventKinds: Record<string, EventKind> = { BLACKOUT: 'blackout', DRUNK_NPC: 'troublemaker', PARTY: 'party' };

/** How often a session is confirmed with the API, and how many go out per 3 s round and at the same time. */
const ACCESS_RECHECKS_PER_ROUND = 24, ACCESS_RECHECK_PARALLEL = 6;

/** Promise.allSettled over `items` with at most `limit` running at once, in order. */
async function mapLimit<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) {
      try { results[i] = { status: 'fulfilled', value: await work(items[i]!) }; } catch (reason) { results[i] = { status: 'rejected', reason }; }
    }
  }));
  return results;
}

export class BarRoom extends Room<{ state: BarState }> {
  private administrativeEvent?:{commandId:string;eventId:string};
  static activeId: string | undefined;
  /** The bar this process runs (the gateway reads its occupancy from /health to place new players). */
  static active: BarRoom | undefined;
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
  private refueling=new Refueling({
    vehicles:()=>this.state.motos.values(),connected:id=>!!this.state.players.get(id)?.connected,
    reserve:(owner,id,maximum)=>internal('fuel/reserve',{userId:owner.userId,sessionId:owner.sessionId,id,maximum}),
    settle:(userId,id,total)=>internal('fuel/settle',{userId,id,total}),
    changed:vehicle=>this.markOwned(vehicle.ownerId,true),
    paid:(userId,balance,receipt)=>{const presence=this.sessions.getByUser(userId);if(presence){this.walletChanged(presence,balance,-receipt.paid,'fuel');presence.client.send('fuel.receipt',receipt);}},
  },new FileOutbox<FuelJournal>(this.config.outboxPath+'.fuel.jsonl',(event,details)=>this.log(event,details)));
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
  /** What players did since the last report to the API: goals in it give badges (docs/sistemas/conquistas.md). */
  private achievements = new AchievementTracker();
  /**
   * Death (docs/sistemas/morte.md). The game has no cause of death of its own yet (needs.ts only faints), so the one cause is the
   * administration's "Matar jogador" button, which arrives as the `kill` control.
   */
  private readonly deathActivity = new Map<string, Partial<Record<MorteCategory, number>>>();
  private readonly deaths = new DeathDirector({
    now: () => Date.now(), random: () => Math.random(),
    body: id => { const player = this.state.players.get(id); return player?.connected && this.sessions.getByUser(id) ? { x: player.x, y: player.y, z: player.z, rotation: player.rotation, name: player.displayName } : undefined; },
    hold: (id, state) => this.holdForDeath(id, state),
    scene: plan => this.broadcastDeath(plan),
    screen: (id, message) => this.sessions.getByUser(id)?.client.send('death.screen', message),
    respawn: (id, avoid) => this.respawnAfterDeath(id, avoid),
    category: id => dominantCategory(this.deathActivity.get(id)),
    log: (event, details) => this.log(event, details),
  });
  private achievementsAt = Date.now();
  private maintenanceBusy = false;
  private lastTableJson = '';
  private tickCount = 0;
  /** Who is a model and who a sprite for each client (world/crowd.ts); refreshes counted to send the sprites every third one. */
  private readonly crowd = new CrowdPlanner();
  private viewRound = 0;
  private readonly usedSlots = new Set<number>();
  private nextSlot = 1;
  private takeSlot(): number {
    for (let tries = 0; tries < 65535; tries++) {
      const slot = this.nextSlot; this.nextSlot = this.nextSlot >= 65535 ? 1 : this.nextSlot + 1;
      if (!this.usedSlots.has(slot)) { this.usedSlots.add(slot); return slot; }
    }
    return 0;
  }
  /** Numbers the bikes the administration spawns. */
  private motoSerial = 0;
  /** Highfood (docs/sistemas/highfood.md): the shifts, the customers' profiles, and what is owed to the API. */
  private customers: readonly CustomerProfile[] = HIGHFOOD_CUSTOMERS.map(person => ({ ...person, image: null, active: true }));
  private customersAt = 0;
  private readonly highfood = new HighfoodDesk(() => this.customers, () => this.prices);
  private readonly leavingCustomers = new Map<string, { at: number; walkFrom: number; yaw: number }>();
  private readonly waved = new Set<string>();
  private readonly unpaid: Array<{ body: Record<string, unknown>; attempts: number }> = [];
  /** Bought bikes on the map: the owner's bike, its metres, and when the owner left. */
  private readonly ownedMotos = new Map<string, { vehicleId: string; motoId: string; mileage: number; wearLeft: number; goneAt?: number; dirty: boolean; broken: boolean }>();
  /** Trades between players (docs/sistemas/troca.md): the conversation, and those confirmed and waiting for the API. */
  private readonly trades = new TradeDesk();
  private readonly tradeCommits = new Map<string, { trade: Trade; body: unknown; attempts: number; nextAt: number; sending: boolean }>();
  /** What a bike with nobody on it is doing (moto-crash.ts); the room's state only has how it looks. */
  private readonly fallenMotos = new Map<string, { loose?: LooseBike; wreck?: MotoWreck; lift?: { from: [number, number, number, number]; to: [number, number, number, number]; fromAt: { x: number; y: number; z: number }; at: { x: number; y: number; z: number; yaw: number; pitch: number }; startedAt: number } }>();
  /** Bodies thrown by a crash, by player: the same steps the browsers run (ragdoll.ts), and when getting up ends. */
  /** `hurt`: the life a blow still has to take when the body comes to rest (it never knocks anyone out in the air). */
  private readonly thrown = new Map<string, { sim: Ragdoll; upAt?: number; hurt: number }>();
  /** Kicks on their way, by player: when each began, how far into the clip the foot has been checked, and who it already hit. */
  private readonly kicks = new Map<string, { startedAt: number; checkedMs: number; hit: Set<string> }>();
  /** Each bike's engine: when the try at starting ends, when W may try again, when it last took a light knock. */
  private readonly motoEngines = new Map<string, { crankEnds: number; retryAt: number; knockedAt: number }>();
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
  /** The truco table (minigames/truco.ts). Each person's view goes to them alone by message: their cards never enter the room's state. */
  private trucoBank = new GameBank('truco', new FileOutbox<BankEntry>(this.config.trucoJournalPath, (event, details) => this.log(event, details)),
    userId => this.sessions.getByUser(userId)?.ticket, changeWallet, internal, {
      log: (event, details) => this.log(event, details),
      wallet: (userId, change) => { const presence = this.sessions.getByUser(userId); if (presence) this.walletChanged(presence, change.balance, change.applied, 'truco'); },
    });
  private truco = new TrucoTable('truco-1', {
    view: (playerId, view) => this.sessions.getByUser(playerId)?.client.send('truco.view', view),
    notice: (playerId, message) => this.sessions.getByUser(playerId)?.client.send('error', { message }),
    onMatch: summary => this.trucoMatch(summary),
    bank: this.trucoBank,
    stakes: () => trucoStakes(this.prices),
    random: randomInt,
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
  /**
   * The pool tables of the games hall (minigames/pool.ts), by id. Each one's view goes by message (pool.view) on every change,
   * and each stroke's recorded paths (pool.shot), to its players, whoever watches it and everyone near it on its floor.
   */
  /** The pool tables' coins, journaled like the truco's (pool:bet:<match>, /internal/pool/settle). */
  private poolBank = new GameBank('pool', new FileOutbox<BankEntry>(this.config.poolJournalPath, (event, details) => this.log(event, details)),
    userId => this.sessions.getByUser(userId)?.ticket, changeWallet, internal, {
      log: (event, details) => this.log(event, details),
      wallet: (userId, change) => { const presence = this.sessions.getByUser(userId); if (presence) this.walletChanged(presence, change.balance, change.applied, 'pool'); },
    });
  private pool = new Map(POOL_TABLES.map(place => [place.id, new PoolTable(place.id, {
    bank: this.poolBank,
    stakes: () => poolStakes(this.prices),
    onShot: shot => this.sendPoolShot(shot),
    onNotice: (playerId, message) => this.sessions.getByUser(playerId)?.client.send('error', { message }),
    onMatch: summary => this.poolMatch(summary),
  })] as const));
  private foosballTimer?: ReturnType<typeof setInterval>;
  private readonly cityWeather=new CityWeather(this.config.weatherUrl,
    reading=>this.state.environment.assign(applyCityWeather(this.state.environment,reading,Date.now())),
    error=>this.log('city_weather_error',{error:error instanceof Error?error.message:String(error)}));
  /** The tables' fixed steps catch up on the timer's real pace (Windows timers run late); frames go 30 times a second. */
  private foosballClock = { last: 0, owed: 0, frameAt: 0 };

  onCreate(): void {
    // The primary bar persists even empty. A locked/full bar must never overflow
    // into an unrelated world through joinOrCreate's automatic create fallback.
    if (BarRoom.activeId && BarRoom.activeId !== this.roomId) throw new ServerError(503, 'BAR_FULL: O bar está cheio. Aguarde uma vaga.');
    BarRoom.activeId = this.roomId; BarRoom.active = this;
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
    for(const system of JUKEBOX_SYSTEMS)this.state.jukeboxes.set(system.id,new Jukebox().assign(initialJukebox(system.id)));
    for(const system of TV_SYSTEMS)this.state.televisions.set(system.id,new Jukebox().assign(initialJukebox(system.id)));
    for (const npc of createNpcs()) this.state.npcs.set(npc.id, npc);
    for(const [id,npc] of this.refueling.npcs)this.state.npcs.set(id,npc);
    for(const [id,state] of this.refueling.states)this.state.fuelServices.set(id,state);
    void this.refueling.recover();
    for (const job of JOBS) this.state.jobs.set(job.id, new JobSlotState());
    this.syncJobs();
    // One failing step (a disk refusal, a bug in one minigame) is logged and the next tick runs: an exception out of this timer would end the whole world.
    let lastTickError = 0;
    this.setFixedTimestep(() => { const started = performance.now(); try { this.step(); } catch (error) { if (started - lastTickError > 5000) { lastTickError = started; this.log('tick_error', { error: error instanceof Error ? (error.stack ?? error.message) : String(error) }); } } const ms=performance.now()-started;this.performanceSampler.record(ms);worldMetrics.observe('bar_world_tick_ms', 'Simulation step duration in ms', ms); }, 1000 / TICK_MS);
    health.roomId = this.roomId;
    worldMetrics.gauge('bar_world_players_connected', 'Players connected to the bar', () => [...this.state.players.values()].filter(p => p.connected).length);
    worldMetrics.gauge('bar_world_avatars', 'Avatars in the bar, including those waiting offline', () => this.state.players.size);
    worldMetrics.gauge('bar_world_result_outbox_pending', 'Finished rounds waiting for the API', () => this.results.pending);
    worldMetrics.gauge('bar_world_wallet_credits_pending', 'Refunds and job pay waiting for the API', () => this.walletRetries.size);
    worldMetrics.gauge('bar_world_blackjack_settlements_pending', 'Blackjack payments waiting for the API', () => this.blackjackBank.pending);
    worldMetrics.gauge('bar_world_truco_settlements_pending', 'Truco payments waiting for the API', () => this.trucoBank.pending);
    worldMetrics.gauge('bar_world_foosball_settlements_pending', 'Pebolim payments waiting for the API', () => this.foosballBank.pending);
    worldMetrics.gauge('bar_world_pool_settlements_pending', 'Sinuca payments waiting for the API', () => this.poolBank.pending);
    worldMetrics.gauge('bar_world_foosball_matches', 'Pebolim matches being played', () => [...this.foosball.values()].filter(t => t.inMatch).length);
    // The pebolim tables' physics: 60 ticks a second, on a timer of their own (the room's clock ticks with its 20 Hz step).
    this.foosballTimer = setInterval(() => this.foosballTick(), 1000 / FOOSBALL.tickHz);
    worldMetrics.gauge('bar_world_table_orders_pending', 'Table orders waiting for Tonico', () => this.waiter.pending);
    worldMetrics.gauge('bar_world_phone_calls', 'Phone calls ringing or answered', () => this.phoneCalls.size);
    worldMetrics.gauge('bar_world_job_workers', 'Players working a job shift', () => JOBS.reduce((sum, job) => sum + this.jobs.workers(job.id).length, 0));
    worldMetrics.gauge('bar_world_api_last_ok_seconds', 'Seconds since the API last answered the maintenance round trip', () => health.apiOkAt ? (Date.now() - health.apiOkAt) / 1000 : undefined);
    this.clock.setInterval(() => { void this.maintenance(); }, 3000);
    this.clock.setInterval(() => this.countTime(Date.now()), ACHIEVEMENT_SAMPLE_MS);
    void this.cityWeather.refresh();
    this.clock.setInterval(() => { void this.cityWeather.refresh(); }, WEATHER_CITY.pollMs);
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
      player = new Player().assign({ id: auth.userId, slot: this.takeSlot(), displayName: auth.displayName, color: auth.color, skin,...findSpawn([...this.state.players.values()]), rotation: Math.PI / 2 });
      this.state.players.set(auth.userId, player);
    }
    this.needs.sync(player, Date.now());
    client.view = new StateView();
    const presence:Presence={skills:new Set(auth.ownedSkills),vehicles:auth.vehicles??[],joinedAt:Date.now(),ticket: auth, client, blocked: new Set(auth.blocked), queue: [], motoQueue: [], motoInputAt: 0, motoBudget: 0, motoBudgetAt: 0, lastReceived: -1, lastInputAt: Date.now(), seen: new Set(), revoked: false, rates: new Map(), listening: true, voicePackets: 0, voiceWindowAt: 0,inventory:new Map((auth.inventory??[]).map(stack=>[stack.itemId,stack.quantity])),balance:auth.balance??0};
    this.sessions.bind(auth.userId,presence);
    // A flight does not outlive its connection: the avatar left in the air comes down.
    const left=this.state.players.get(auth.userId);if(left?.animationState.startsWith('fly')){presence.flying=true;this.land(left,presence);}
    this.state.occupancy = this.sessions.size;
    this.refreshViews();
    this.syncTable();
    client.send('wallet.state',{balance:presence.balance});
    client.send('prices',{prices:this.prices});
    client.send('food.state',this.foodState(auth.userId));
    this.sendJob(presence);
    if (auth.bot) this.botIds.add(auth.userId);
    this.log(previous ? 'takeover' : 'join', { playerId: auth.userId });
    this.deaths.resume(auth.userId);
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
    // A pool table waits for its shooter (paused) until they are back or the wait runs out.
    for (const table of this.pool.values()) table.connection(presence.ticket.userId, false);
    // A pending order is dropped with the connection, which would otherwise leave the player waiting forever.
    this.cancelCounter(presence.ticket.userId);
    this.cancelTable(presence.ticket.userId);
    this.dropCall(presence.ticket.userId);
    if (player) this.endShift(player, 'Você caiu da conexão e o turno foi encerrado.');
    if (player&&isRidingHorse(player.interactionState)) this.dismountHorse(player);
    if (player) this.stopHighfood(player, '');
    this.leaveTrades(presence.ticket.userId, `${player?.displayName ?? 'A outra pessoa'} caiu da conexão.`);
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
    if (access) {this.setVehicles(presence,access.vehicles??[]);presence.blocked = new Set(access.blocked);this.setInventory(presence,access.inventory??[]);this.sendInventory(presence);if(access.balance!==undefined)presence.balance=access.balance;client.send('wallet.state',{balance:presence.balance});}
    presence.rejectReconnect = undefined;
    presence.queue.length = 0; presence.motoQueue.length = 0;
    const player = this.state.players.get(presence.ticket.userId)!;
    player.connected = true;
    for (const table of this.foosball.values()) table.connection(player.id, true);
    for (const table of this.pool.values()) table.connection(player.id, true);
    presence.poolSeen = undefined;
    // Back on the socket: the panel gets the table as it is now.
    if (player.interactionState.startsWith('truco:')) this.truco.refresh(player.id);
    this.syncFoosball();
    // Without an answer, the appearance already in the room stays as it is.
    if (access) this.applyAppearance(player,access);
    client.send('food.state',this.foodState(player.id));
    // Queued movement before a transport interruption must never replay afterward.
    player.lastProcessedInput = presence.lastReceived;
    this.refreshViews();
  }

  onLeave(client: Client): void {
    const presence = this.forClient(client);
    if (!presence) return;
    const userId = presence.ticket.userId;
    this.deaths.disconnected(userId);
    this.refueling.cancel(userId,'Atendimento interrompido por desconexão.');
    worldMetrics.inc('bar_world_leaves_total', 'Participations ended');
    // Pending orders are refunded while the session is still registered (refunds go to its wallet owner).
    this.cancelCounter(userId); this.cancelTable(userId); this.dropCall(userId); this.releaseMedia(userId);
    this.leaveTrades(userId, `${this.state.players.get(userId)?.displayName ?? 'A outra pessoa'} saiu do bar.`);
    this.sessions.remove(userId, presence);
    const player = this.state.players.get(userId);
    // Expelled players and development bots (tests/load/bots.ts) are removed; everyone else leaves the avatar standing
    // (or seated) where it was.
    if (presence.revoked || presence.ticket.bot) { this.blackjack.leave(userId); this.cancelCounter(userId); this.cancelTable(userId); if (player) this.endShift(player, 'Turno encerrado.'); this.musicians.release(userId); this.needs.forget(userId); if (player) this.usedSlots.delete(player.slot); this.state.players.delete(userId); }
    else if (player) { this.park(player); player.connected = false; }
    this.state.occupancy = this.sessions.size;
    this.refreshViews();
    this.syncTable();
    this.log('leave', { playerId: userId });
  }

  /** Ends what needs a connected player (blackjack seat, orders, drinks, kicks); a chair stays taken. */
  private park(player: Player): void {
    if(isRidingHorse(player.interactionState))this.dismountHorse(player);
    player.drinkItem = ''; this.dropHolding(player);
    this.blackjack.leave(player.id);
    // Off the pebolim table (a match with coins on it is lost; a friendly goes on with Zé do Totó).
    this.leaveFoosball(player);
    // Off the truco table: an NPC takes the seat.
    this.leaveTruco(player);
    // Off the pool table: leaving a match in play is giving it up.
    this.leavePool(player);
    this.cancelCounter(player.id);
    this.cancelTable(player.id);
    this.endShift(player, 'Turno encerrado.');
    this.stopHighfood(player, '');
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
    player.looking = false;
  }

  /** Closes an older session of the same account without touching its avatar, which the new one takes. */
  private replaceSession(previous: Presence): void {
    this.leaveTrades(previous.ticket.userId, 'A conta da outra pessoa entrou de outra janela.');
    this.cancelCounter(previous.ticket.userId); this.cancelTable(previous.ticket.userId); this.dropCall(previous.ticket.userId);
    this.sessions.remove(previous.ticket.userId, previous);
    previous.rejectReconnect?.();
    if (this.state.players.get(previous.ticket.userId)?.connected)
      previous.client.send('error', { message: 'Sua conta entrou no bar em outra janela.' });
    // Also close a transport that already resumed but is still awaiting access validation. onDrop
    // marks the avatar disconnected, so tying this close to player.connected would orphan that socket.
    previous.client.leave(4000);
  }

  onDispose(): void { this.cityWeather.stop();this.performanceSampler.destroy();this.keepVehicles(true); void this.saveVehicles().catch(() => {}); clearInterval(this.foosballTimer); this.bots.stop(); if (BarRoom.activeId === this.roomId) { BarRoom.activeId = undefined; BarRoom.active = undefined; } if (health.roomId === this.roomId) health.roomId = undefined; }

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
    // VR hands (docs/sistemas/vr.md): kept as a short string everyone draws the arms from; nothing in the game depends on it.
    this.handle('player.arms', vrArmsSchema, 20, (client, arms) => {
      const player = this.player(client), encoded = encodeVrArms(arms);
      if (player.vrArms !== encoded) player.vrArms = encoded;
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
      if (p.motoQueue.length >= MOTO_QUEUE) p.motoQueue.shift();
      p.lastReceived = input.seq;
      p.lastInputAt = Date.now();
      p.motoQueue.push(input);
    });
    this.handle('moto.mount', motoMountSchema, 4, (client, { motoId,seat }) => this.mountMoto(client, motoId,seat));
    this.handle('vehicle.control',z.object({vehicleId:z.string().max(32),action:z.enum(['left-door','right-door','hood','trunk','wipers','engine','headlights','ignition','lock','refuel'])}).strict(),5,(client,{vehicleId,action})=>this.controlVehicle(client,vehicleId,action));
    this.handle('fuel.cancel',z.object({}).strict(),2,client=>this.refueling.cancel(this.player(client).id));
    this.handle('moto.tow', z.object({ vehicleId: z.string().uuid().optional() }).strict(), 2, (client, { vehicleId }) => this.towOwnMoto(client, vehicleId));
    this.handle('moto.lock', z.object({ locked: z.boolean() }).strict(), 4, (client, { locked }) => this.lockMoto(client, locked));
    this.handle('garage.take', z.object({ garageId: z.string().max(32), vehicleId: z.string().uuid() }).strict(), 3, (client, { garageId, vehicleId }) => this.takeFromGarage(client, garageId, vehicleId));
    this.handle('garage.store', z.object({ garageId: z.string().max(32), recall: z.boolean() }).strict(), 3, (client, { garageId, recall }) => this.storeInGarage(client, garageId, recall));
    this.handle('trade.request', tradeRequestSchema, 3, (client, { playerId }) => this.requestTrade(client, playerId));
    this.handle('trade.respond', tradeRespondSchema, 5, (client, { inviteId, accept }) => this.respondTrade(client, inviteId, accept));
    this.handle('trade.offer', tradeOfferMessageSchema, 12, (client, { tradeId, offer }) => this.offerTrade(client, tradeId, offer));
    this.handle('trade.ready', tradeReadySchema, 6, (client, { tradeId, version, ready }) => this.readyTrade(client, tradeId, version, ready));
    this.handle('trade.confirm', tradeConfirmSchema, 6, (client, { tradeId, version }) => this.confirmTrade(client, tradeId, version));
    this.handle('trade.cancel', tradeCancelSchema, 6, (client, { tradeId }) => this.cancelTrade(client, tradeId));
    // Browser tests only (tests/e2e/server.mjs runs the world with NODE_ENV=test): a ride across the city is covered once, not at every step of a test.
    if (process.env.NODE_ENV === 'test') this.handle('test.player.place', z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite(),rotation:z.number().finite().min(-Math.PI).max(Math.PI).optional() }).strict(), 5, (client, at) => {
      const player = this.player(client), presence = this.forClient(client)!;
      Object.assign(player, at); presence.queue.length = 0; player.lastProcessedInput = presence.lastReceived;
      client.send('test.player.placed',at);
    });
    if (process.env.NODE_ENV === 'test') this.handle('test.moto.parts', z.object({ parts: z.string().max(80) }).strict(), 5, (client, { parts }) => {
      const player = this.player(client), moto = this.ownMoto(player.id);
      if (!moto) throw new Error('Sem moto.');
      moto.parts = parts; this.markOwned(player.id, true);
    });
    if (process.env.NODE_ENV === 'test') this.handle('test.moto.place', z.object({ x: z.number().finite(), z: z.number().finite() }).strict(), 5, (client, { x, z: at }) => {
      const player = this.player(client), moto = this.ownMoto(player.id);
      if (!moto) throw new Error('Sem moto.');
      moto.assign({ x, z: at, ...STOPPED_VEHICLE, steer: 0 }); moto.ticks++;
      if (moto.riderId === player.id) { player.x = x; player.z = at; }
    });
    this.handle('phone.look', z.object({ on: z.boolean() }).strict(), 6, (client, { on }) => { this.player(client).looking = on; });
    this.handle('food.start', foodEmptySchema, 3, client => this.startHighfood(client));
    this.handle('food.stop', foodEmptySchema, 3, client => this.stopHighfood(this.player(client), ''));
    this.handle('food.state', foodEmptySchema, 10, client => { client.send('food.state', this.foodState(this.player(client).id)); });
    this.handle('food.accept', foodOrderSchema, 5, (client, { orderId }) => this.acceptOrder(client, orderId));
    this.handle('food.decline', foodOrderSchema, 5, (client, { orderId }) => { const player = this.player(client); this.highfood.decline(player.id, orderId, Date.now()); this.sendFood(player.id); });
    this.handle('food.cancel', foodEmptySchema, 3, client => this.cancelFoodOrder(client));
    this.handle('food.locker', foodEmptySchema, 4, client => this.openLocker(client));
    this.handle('food.code', foodCodeSchema, 4, (client, payload) => this.typeLockerCode(client, payload.orderId, payload.code));
    this.handle('food.unload', foodEmptySchema, 4, client => this.unloadOrder(client));
    this.handle('food.talk', foodEmptySchema, 4, client => this.talkToCustomer(client));
    this.handle('food.leave', foodEmptySchema, 4, client => this.closeDialog(this.player(client), this.forClient(client)!));
    this.handle('food.deliver', foodOrderSchema, 4, (client, { orderId }) => this.handOverFood(client, orderId));
    this.handle('moto.repair', motoRepairSchema, 3, (client, { motoId, part }) => this.repairMoto(client, motoId, part));
    this.handle('player.interact', z.object({ objectId: z.string().max(64), item: z.enum(DRINK_ITEMS).optional() }).strict(), 5, (client, command) => this.interact(client, command.objectId, command.item));
    this.handle('inventory.sync',z.object({}).strict(),2,async client=>{await this.syncPresence(this.forClient(client)!);});
    this.handle('inventory.use',z.object({itemId:z.enum(ITEM_IDS)}).strict(),3,(client,{itemId})=>this.useInventory(client,itemId));
    this.handle('firework.fire',fireworkFireSchema,3,(client,{direction})=>this.fireFirework(client,direction));
    this.handle('firework.stow',z.object({}).strict(),3,client=>{this.player(client).fireworkEquipped=false;});
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
      this.achieved(player.id,'mesa-de-luz');
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
      if(player.courier)throw new Error('Saia do Highfood antes de trabalhar no bar.');
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
    this.handle('admin.environment',environmentPatchSchema,4,(client,patch)=>{
      const admin=this.requireAdmin(client),now=Date.now();
      this.state.environment.assign(applyEnvironmentPatch(this.state.environment,patch,now));
      this.log('admin_environment',{playerId:admin,...patch});
      client.send('admin.world',this.adminSnapshot());
    });
    // Flight (B): administrators only; it ends when the role goes or an activity takes the body (step).
    this.handle('admin.fly',z.object({on:z.boolean()}).strict(),3,(client,{on})=>{
      this.requireAdmin(client);
      const presence=this.forClient(client)!,player=this.player(client);
      if(!on){
        // From the air it falls (step); from a hand's breadth above the floor it simply lands.
        if(!presence.flying||presence.falling)return;
        if(player.y-(groundBelow(player.x,player.z,player.y)??0)<.3){this.land(player,presence);return;}
        presence.falling=true;presence.queue.length=0;Object.assign(player,{animationState:'fly-fall',animationStartedAt:Date.now()});return;
      }
      if(player.interactionState||player.currentTableId)throw new Error('Levante-se primeiro.');
      if(presence.flying)return;
      presence.flying=true;presence.queue.length=0;
      Object.assign(player,{y:(player.y??0)+1.5,animationState:'fly-idle',animationStartedAt:Date.now()});
      this.log('admin_fly',{playerId:player.id,on});
    });
    this.handle('admin.performance',z.object({}).strict(),1,client=>{
      this.requireAdmin(client);
      client.send('admin.performance',this.performanceSampler.snapshot({players:this.state.occupancy,capacity:this.state.capacity,npcs:this.state.npcs.size,motos:this.state.motos.size,
        walletRetries:this.walletRetries.size,resultOutbox:this.results.pending,logQueue:this.logQueue.length,apiAgeMs:health.apiOkAt?Date.now()-health.apiOkAt:null}));
    });
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
    // The delivery bikes exist only while the administration keeps them on the map.
    this.handle('admin.moto.spawn',motoSpawnSchema,5,(client,{model})=>{
      const admin=this.requireAdmin(client),player=this.player(client);
      if([...this.state.motos.values()].filter(moto=>!moto.ownerId).length>=MOTO.LIMIT)throw new Error(`O mapa já tem ${MOTO.LIMIT} motos. Despawne alguma antes.`);
      const spot=motoSpawnSpot(player,player.rotation,[...this.state.motos.values()],[],model);
      if(!spot)throw new Error('Não há rua livre perto de você. Vá para a rua e tente de novo.');
      const id=`moto-${++this.motoSerial}`;
      // Anyone's to ride, and plated like every other vehicle; the plate lasts as long as the bike does.
      this.state.motos.set(id,new Moto().assign({...parkedMoto({id,...spot}),model:model??'moto-delivery',parts:model===CAR_MODEL?NEW_CAR_PARTS:NEW_MOTO_PARTS,plate:makePlate()}));
      this.log('admin_moto_spawn',{playerId:admin,id,x:+spot.x.toFixed(1),z:+spot.z.toFixed(1)});client.send('admin.world',this.adminSnapshot());
    });
    this.handle('admin.moto.despawn',motoDespawnSchema,5,(client,{id})=>{
      const admin=this.requireAdmin(client);
      if(id&&!this.state.motos.has(id))throw new Error('Essa moto já saiu do mapa.');
      const ids=id?[id]:[...this.state.motos.keys()];
      for(const each of ids)this.despawnMoto(each);
      this.log('admin_moto_despawn',{playerId:admin,ids:ids.join(', ')});client.send('admin.world',this.adminSnapshot());
    });
    // Development bots for performance tests: how many the bar should have (0 takes them out), never more than fit in it.
    this.handle('admin.bots',z.object({count:z.number().int().min(0).max(1024)}).strict(),3,(client,{count})=>{
      const admin=this.requireAdmin(client),room=this.botRoom();
      if(count>room)throw new Error(`O bar comporta ${this.config.capacity} pessoas: cabem até ${room} bots além dos jogadores. Aumente ROOM_CAPACITY no .env e reinicie o mundo.`);
      this.bots.set(count);this.botsAdmin=client;
      this.log('admin_bots',{playerId:admin,count});client.send('admin.world',this.adminSnapshot());
    });
    this.handle('player.emote', z.object({ emote: z.enum(['dance', 'wave', 'idle', 'smoke', 'cigarette']) }).strict(), 4, (client, { emote }) => {
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
      if(emote==='wave'){
        this.playTemporary(p,this.forClient(client)!,'wave',WAVE_DURATION_MS);
        this.systemMessage(`${p.displayName} acenou para o pessoal.`, p);
        this.achieved(p.id,'gente-boa');
      }else{
        // Each dance is drawn anew; the clients map the number onto their dance clips (apps/web/public/animations/<skin>-dances.glb).
        if(emote==='dance')p.dance=randomInt(65536);
        p.animationState=emote==='dance'?'dance':'idle';p.animationStartedAt=Date.now();
      }
    });
    // A skill of the skin being worn (SKILLS): which one is active and on which key is the player's choice, kept by the API.
    this.handle('player.skill', z.object({ skill: z.string().max(32) }).strict(), 4, (client, { skill }) => {
      const p = this.player(client), chosen = skillById(skill), presence = this.forClient(client)!;
      if (!chosen || chosen.skin !== skinBase(p.skin)) throw new Error('Esta skin não tem essa skill.');
      if (!presence.skills.has(chosen.id)) throw new Error('Compre esta habilidade na coleção (C).');
      if (!isConscious(p)) throw new Error('Espere recuperar o equilíbrio.');
      if (chosen.id === HORSE.skill) {
        if (isRidingHorse(p.interactionState)) { this.dismountHorse(p,true); return; }
        const order=this.highfood.orderOf(p.id),deliveryBag=p.parcel==='bag'&&order?.stage==='carrying';
        if (p.interactionState || p.currentTableId || p.holding || p.carrying || (p.parcel&&!deliveryBag)) throw new Error('Encerre a ação atual e libere as mãos antes de montar.');
        if (!horseFits(p,p.rotation)) throw new Error('Vá para uma rua ou calçada com espaço livre para o cavalo.');
        p.skill=HORSE.skill;p.interactionState=HORSE.interaction;p.animationState='horse-idle';p.animationStartedAt=Date.now();p.horseRearAt=0;
        if(order){this.dropParcel(p);order.transport='horse';this.sendFood(p.id);}
        presence.gestureEndsAt=undefined;presence.gestureState=undefined;presence.interactionEndsAt=undefined;
        presence.queue.length=0;p.lastProcessedInput=presence.lastReceived;
        return;
      }
      if (p.interactionState) throw new Error('Levante-se primeiro.');
      const aim = kickAim(p, [...this.state.players.values()].filter(target => this.kickable(p, target, Date.now())));
      if (aim !== undefined) p.rotation = aim;
      p.skill = chosen.id; p.animationState = 'kick'; p.animationStartedAt = Date.now(); p.interactionState = 'kick';
      presence.interactionEndsAt = p.animationStartedAt + chosen.durationMs;
      if (kickWindow(chosen.id)) this.kicks.set(p.id, { startedAt: p.animationStartedAt, checkedMs: 0, hit: new Set() });
      presence.queue.length = 0;
      p.lastProcessedInput = presence.lastReceived;
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
      let heard = false;
      for (const [id, target] of this.sessions) {
        if (target.revoked || target.blocked.has(player.id) || sender.blocked.has(id)) continue;
        const recipient = this.state.players.get(id)!;
        if (recipient.connected && distance(player, recipient) <= CHAT_RADIUS) { target.client.send('chat.message', message); heard ||= id !== player.id; }
      }
      if (heard) this.achieved(player.id, 'resenha');
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
    this.handle('truco.join', trucoJoinSchema, 3, client => this.joinTruco(client));
    this.handle('truco.leave', z.object({}).strict(), 3, client => this.leaveTruco(this.player(client)));
    this.handle('truco.seat', trucoSeatSchema, 4, (client, { seat }) => { const player = this.atTruco(client); this.truco.move(player.id, seat); this.seatAtTruco(player); this.truco.tick(Date.now()); });
    this.handle('truco.config', trucoConfigSchema, 8, (client, patch) => { this.truco.configure(this.atTruco(client).id, { ...(patch.level ? { level: patch.level } : {}), ...(patch.stake !== undefined ? { stake: patch.stake } : {}), ...(patch.dark !== undefined ? { dark: patch.dark } : {}) }); this.truco.tick(Date.now()); });
    this.handle('truco.ready', trucoReadySchema, 3, (client, { ready }) => this.truco.ready(this.atTruco(client).id, ready, Date.now()));
    this.handle('truco.again', z.object({}).strict(), 3, client => this.truco.again(this.atTruco(client).id));
    this.handle('truco.play', trucoPlaySchema, 6, (client, { card, hidden }) => this.truco.play(this.atTruco(client).id, card, !!hidden, Date.now()));
    this.handle('truco.call', z.object({}).strict(), 4, client => this.truco.call(this.atTruco(client).id, Date.now()));
    this.handle('truco.answer', trucoAnswerSchema, 4, (client, { answer, to }) => this.truco.answer(this.atTruco(client).id, answer, to, Date.now()));
    this.handle('truco.eleven', trucoElevenSchema, 4, (client, { answer }) => this.truco.eleven(this.atTruco(client).id, answer, Date.now()));
    this.handle('truco.signal', trucoSignalSchema, 6, (client, { signal }) => this.truco.signal(this.atTruco(client).id, signal, Date.now()));
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
    this.handle('pool.join', poolJoinSchema, 3, (client, { tableId, seat }) => this.joinPool(client, tableId, seat));
    this.handle('pool.watch', poolWatchSchema, 3, (client, { tableId }) => {
      const presence = this.forClient(client)!;
      if (tableId && !this.nearPool(this.player(client), tableId)) throw new Error('Chegue mais perto da mesa para assistir.');
      presence.watching = tableId || undefined;
    });
    this.handle('pool.leave', z.object({}).strict(), 3, client => this.leavePool(this.player(client)));
    this.handle('pool.seat', poolSeatSchema, 4, (client, { seat }) => { const { player, table } = this.atPool(client); table.move(player.id, seat); this.syncPool(); });
    this.handle('pool.config', poolConfigSchema, 8, (client, patch) => { const { player, table } = this.atPool(client); table.configure(player.id, patch); this.syncPool(); });
    this.handle('pool.cpu', poolCpuSchema, 4, (client, { on }) => { const { player, table } = this.atPool(client); table.cpu(player.id, on); this.syncPool(); });
    this.handle('pool.ready', poolReadySchema, 4, async (client, { ready }) => {
      const { player, table } = this.atPool(client), presence = this.forClient(client)!;
      // Checked here too (the cached wallet), so nobody says yes to a stake they cannot pay; the API decides when it is taken.
      if (ready && table.stake > presence.balance) throw new Error(`Esta partida vale ${table.stake} moedas e você tem ${presence.balance}.`);
      try { await table.ready(player.id, ready); } finally { this.syncPool(); }
    });
    this.handle('pool.choice', poolChoiceSchema, 4, (client, { choice }) => { const { player, table } = this.atPool(client); table.choose(player.id, choice); this.syncPool(); });
    this.handle('pool.shot', poolShotSchema, 4, (client, stroke) => { const { player, table } = this.atPool(client); table.shoot(player.id, stroke); this.syncPool(); });
    // Where the shooter aims, to the others at the table (their cue moves on the felt as the shooter's does).
    this.handle('pool.aim', poolAimSchema, 14, (client, aim) => {
      const { player, table } = this.atPool(client), view = table.aim(player.id, aim);
      if (view) for (const [id, presence] of this.sessions) if (id !== player.id && (presence.watching === table.id || table.seatOf(id))) presence.client.send('pool.aim', view);
    });
    // Every press of the sequence game is judged by the room (world/death.ts); the client only reports which button.
    this.handle('death.input', deathInputSchema, 12, (client, { button }) => { const presence = this.forClient(client); if (presence) this.deaths.press(presence.ticket.userId, button); });
    this.handle('ping', z.object({ at: z.number().finite() }).strict(), 3, (client, { at }) => client.send('pong', { at,serverTime:Date.now() }));
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
      // A dead player does nothing but press the game's buttons.
      if (this.deaths.isDead(presence.ticket.userId) && name !== 'death.input' && name !== 'ping') {
        rejected('dead');
        // The body does not move, but the client's queue of unanswered inputs must still drain: with 12 waiting it sends no more, and would stay frozen after the respawn.
        const seq = (parsed.data as { seq?: unknown }).seq;
        if ((name === 'player.input' || name === 'moto.input') && typeof seq === 'number') { presence.lastReceived = Math.max(presence.lastReceived, seq); subject.lastProcessedInput = presence.lastReceived; }
        return;
      }
      if (presence.flying && name !== 'phone.call' && (NEEDS_CONSCIOUS.has(name) || name === 'player.skill')) { rejected('flying'); client.send('error', { message: 'Pouse (B) antes.' }); return; }
      if (NEEDS_CONSCIOUS.has(name) && !isConscious(subject)) { rejected('unconscious'); client.send('error', { message: subject.condition === 'fainted' ? 'Você está desacordado.' : 'Espere recuperar o equilíbrio.' }); return; }
      try { await handler(client, parsed.data); } catch (e) { rejected('refused'); client.send('error', { message: e instanceof Error ? e.message : 'Não foi possível executar essa ação.' }); }
    });
  }

  /** The state patch runs on its own timer, outside the tick: time it, it is the per-client encoding cost. */
  override broadcastPatch(): boolean {
    const started = performance.now();
    try { return super.broadcastPatch(); }
    finally { const ms = performance.now() - started; this.performanceSampler.recordPatch(ms); worldMetrics.observe('bar_world_patch_ms', 'State patch encode and send in ms', ms); }
  }

  private step(): void {
    const now = Date.now();
    this.state.serverTime = now;
    let lapAt = performance.now();
    const lap = (name: string) => { const t = performance.now(); this.performanceSampler.recordPhase(name, t - lapAt); worldMetrics.observe(`bar_world_phase_${name.replace(/\W/g, '_')}_ms`, `Tick phase ${name} in ms`, t - lapAt, 200); lapAt = t; };
    for (const call of this.phoneCalls.expire(now)) this.sendCall(call, 'missed');
    this.deaths.update(now);
    // The bikes do not move while the players do (stepMotos comes after): one list per tick, not one per walking player.
    let obstacles: ReturnType<typeof motoObstacle>[] | undefined;
    for (const [id, presence] of this.sessions) {
      const player = this.state.players.get(id)!;
      if(player.fireworkEquipped&&!this.canFirework(player))player.fireworkEquipped=false;
      if (!player.connected || presence.revoked) continue;
      if(presence.gestureEndsAt&&now>=presence.gestureEndsAt){
        if(player.animationState===presence.gestureState)player.animationState='idle';
        presence.gestureEndsAt=undefined;presence.gestureState=undefined;
      }
      // The drink is finished and leaves the hand together with the interaction.
      if (presence.interactionEndsAt && now >= presence.interactionEndsAt) this.finishInteraction(player, presence, now);
      if (player.holding) this.updateHolding(player, presence, now);
      // A job task keeps the hands busy for its whole duration (the use clip is shorter, so it restarts).
      if ((player.interactionState === 'job' || isRepairingMoto(player.interactionState)) && player.animationState === 'use' && now - player.animationStartedAt >= TASK_GESTURE_MS) player.animationStartedAt = now;
      if (presence.flying && (presence.ticket.role !== 'admin' || player.interactionState || player.currentTableId)) this.land(player, presence);
      if (presence.falling) {
        presence.queue.length = 0; player.lastProcessedInput = presence.lastReceived;
        const next = fallPlayer(player, TICK_MS / 1000, (now - player.animationStartedAt) / 1000);
        Object.assign(player, { y: next.y });
        if (next.landed) this.land(player, presence);
        continue;
      }
      const input = presence.queue.shift();
      if(player.animationState==='horse-rear'&&now-player.horseRearAt>=HORSE_REAR.durationMs)player.animationState='horse-idle';
      let moving = false, running = false;
      if (input) {
        player.headYaw=input.headYaw??0;player.headPitch=input.headPitch??0;
        if (isRidingHorse(player.interactionState)) {
          if(input.rear&&!presence.horseRearHeld&&(!player.horseRearAt||now-player.horseRearAt>=HORSE_REAR.cooldownMs)){
            player.horseRearAt=now;player.animationStartedAt=now;
          }
          presence.horseRearHeld=!!input.rear;
          if(player.horseRearAt&&now-player.horseRearAt<HORSE_REAR.durationMs)player.animationState='horse-rear';
          else{
            const next=moveHorse(player,player.rotation,input,TICK_MS/1000);
            moving=next.x!==player.x||next.z!==player.z;
            player.x=next.x;player.y=next.y;player.z=next.z;player.rotation=next.rotation;
            player.animationState=moving?(input.running?'horse-gallop':'horse-walk'):'horse-idle';
          }
        } else if (presence.flying) {
          const next = flyPlayer(player, input, TICK_MS / 1000);
          moving = !!(input.dx || input.dz || input.dy);
          Object.assign(player, { x: next.x, y: next.y, z: next.z, rotation: input.rotation, animationState: input.dx || input.dz ? 'fly' : 'fly-idle' });
        } else if (!player.interactionState) {
          // Running needs stamina; a drunk walk drifts. The client predicts both with the same shared rules.
          running = input.running && !player.oldWalk && this.needs.canRun(id) && !!(input.dx || input.dz);
          const position = movePlayer(player, swayInput({ ...input, running }, input.seq, player.drunk, player.id), TICK_MS/1000, player.oldWalk, hasStagePass(player), obstacles ??= [...this.state.motos.values()].map(motoObstacle));
          moving = position.x !== player.x || position.z !== player.z;
          running &&= moving;
          if (moving) this.achieved(id, 'andarilho', Math.hypot(position.x - player.x, position.z - player.z));
          player.x = position.x; player.y = position.y!; player.z = position.z; player.rotation = input.rotation;
          if (input.dx || input.dz) player.animationState = running ? 'run' : 'walk';
          else if (player.animationState === 'walk' || player.animationState === 'run') player.animationState = 'idle';
        }
        player.lastProcessedInput = input.seq;
      } else if (now - presence.lastInputAt > 250 && ['walk', 'run','horse-walk','horse-gallop','fly'].includes(player.animationState)) player.animationState = player.animationState === 'fly' ? 'fly-idle' : isRidingHorse(player.interactionState)?'horse-idle':'idle';
      if (!this.deaths.isDead(id)) for (const event of this.needs.tick(player, TICK_MS / 1000, now, { running, moving })) this.onNeeds(player, presence, event, now);
      if (player.stageUntil && now >= player.stageUntil) this.endStagePass(player, presence);
      if (presence.recoveryMoveAt && now >= presence.recoveryMoveAt) this.moveToRecovery(player, presence);
    }
    lap('players');
    this.refueling.update(now,TICK_MS/1000);
    this.stepMotos(now);
    lap('motos');
    this.syncPassengers(now);
    this.stepKicks(now);
    this.stepThrown(now);
    this.stepHighfood(now);
    this.stepTrades(now);
    lap('combat+jobs');
    for (const end of this.musicians.update(now, id => this.state.players.get(id)?.connected)) this.finishMusician(end);
    this.blackjack.tick(now);
    this.checkTruco();
    this.truco.tick(now);
    lap('minigames-a');
    this.syncTable();
    this.checkFoosball();
    this.syncFoosball();
    this.checkPool();
    for (const table of this.pool.values()) table.tick(now);
    this.syncPool();
    if (this.events.update(now, this.state.occupancy)) this.syncEvent(now);
    lap('minigames-b');
    this.serveDrinks(now);
    this.serveTables(now);
    this.runJobs(now);
    lap('service');
    this.npcs.update([...this.state.npcs.values()].filter(npc => !isCustomerNpc(npc.id)), [...this.state.players.values()].filter(p => p.connected), this.state.event.type, now);
    lap('npcs');
    // Who sees whom: 5 times a second (a thousand players packed in one place cost 25 ms a round; 10 Hz was a quarter of a core there).
    if (++this.tickCount % 4 === 0) { this.refreshViews(); lap('views'); }
  }

  /**
   * The delivery bikes. Each input is one step, the same one the browser predicted. Real time decides how many may run: this
   * timer and the browser's frames do not keep the same beat, and a late input is not lost nor a queue kept growing, while
   * nobody gets further than the clock allows. A short gap waits for the next input, a longer one (a frozen tab, a lost
   * connection) lets go of the controls. Anything that takes the rider off (fainting, leaving, a kick) lets the bike go here,
   * and it stops by itself.
   */
  private stepMotos(now: number): void {
    for (const moto of this.state.motos.values()) {
      if(this.refueling.busy(moto.id)){
        moto.assign(STOPPED_VEHICLE);moto.steer=0;moto.gas=false;moto.horn=false;
        const rider=this.state.players.get(moto.riderId),presence=rider&&this.sessions.getByUser(rider.id);
        if(rider){Object.assign(rider,{x:moto.x,y:moto.y,z:moto.z,rotation:normalizeHeading(moto.yaw)});if(presence){presence.motoQueue.length=0;rider.lastProcessedInput=presence.lastReceived;}}
        continue;
      }
      this.stepEngine(moto, now);
      if (moto.phase) { moto.horn=false;moto.wheelie=0;this.stepFallenMoto(moto, now); continue; }
      const rider = moto.riderId ? this.state.players.get(moto.riderId) : undefined;
      const presence = rider ? this.sessions.getByUser(rider.id) : undefined;
      const riding = !!rider?.connected && !!presence && !presence.revoked && rider.interactionState === motoInteraction(moto.id);
      if (moto.riderId && !riding) {
        this.freeMoto(moto, rider);
        // Still fast with nobody on it: it goes on by itself, and falls when it stops holding itself up.
        if (vehicleMotionSpeed(moto) > MOTO.DISMOUNT_SPEED) { this.letLoose(moto, (Math.random() - .5) * 1.2); continue; }
      }
      const obstacles = this.motoObstacles(moto);
      let intent = moto.riderId ? NO_MOTO_INTENT : { ...NO_MOTO_INTENT, brake: true };
      if (riding) {
        presence.motoBudget = Math.min(MOTO_BURST, presence.motoBudget + (now - presence.motoBudgetAt) / TICK_MS); presence.motoBudgetAt = now;
        let input: MotoInput | undefined, stepped = false;
        while (presence.motoBudget >= 1 && (input = presence.motoQueue.shift())) {
          presence.motoBudget--;
          moto.lights = this.motoLights(moto, input);
          // W with the engine off tries the starter; the throttle does nothing until it catches.
          if (moto.engine === MOTO_ENGINE.OFF && input.throttle > 0 && now >= this.engineOf(moto).retryAt) this.crankEngine(moto, now);
          moto.gas = moto.engine === MOTO_ENGINE.ON && input.throttle > 0;
          moto.horn=!!input.horn&&moto.ignition&&readDriveParts(moto).bateria>0;
          moto.wheelie=stepWheelie(moto.wheelie,!!input.wheelie,moto.speed,input.brake||input.throttle<0,moto.engine===MOTO_ENGINE.ON,isCar(moto));
          const crashed = this.stepRidden(moto, input, obstacles, rider);
          rider.lastProcessedInput = input.seq; presence.motoInputAt = now; stepped = true;
          if (crashed) break;
        }
        if (moto.phase) continue;
        if (stepped) { rider.x = moto.x; rider.y = moto.y; rider.z = moto.z; rider.rotation = normalizeHeading(moto.yaw); this.strikeWalkers(moto, rider); continue; }
        if (now - presence.motoInputAt < 250) continue;
        moto.gas = false;
        moto.horn=false;
      }
      if(!riding||now-(presence?.motoInputAt??0)>=250){moto.horn=false;moto.wheelie=stepWheelie(moto.wheelie,false,moto.speed,false,false);}
      if (!vehicleMoving(moto) && !moto.steer && !intent.throttle && !intent.steer) continue;
      if (this.stepRidden(moto, intent, obstacles, riding ? rider : undefined)) continue;
      if (riding) { rider.x = moto.x; rider.y = moto.y; rider.z = moto.z; rider.rotation = normalizeHeading(moto.yaw); this.strikeWalkers(moto, rider); }
    }
  }

  /** The brake light is the room's (it knows the speed), the rest are the rider's switches. */
  private motoLights(moto: Moto, input: MotoIntent): number {
    if(!vehiclePowered(moto))return 0;
    const braking = input.brake || (input.throttle < 0 && moto.speed > .1) || (input.throttle > 0 && moto.speed < -.1);
    return ((input.lights ?? 0) & ~MOTO_LIGHT.BRAKE) | (braking ? MOTO_LIGHT.BRAKE : 0);
  }

  /** One step on its wheels. True when it ended in a crash that threw the rider off. */
  private stepRidden(moto: Moto, input: MotoIntent, obstacles: ReturnType<BarRoom['motoObstacles']>, rider?: Player): boolean {
    const { body, hit } = advanceMoto(moto, input, TICK_MS / 1000, obstacles, motoHandling(moto));
    if (rider) this.achieved(rider.id, 'motoboy', Math.hypot(body.x - moto.x, body.z - moto.z));
    if (moto.ownerId) this.rodeOwned(moto, Math.hypot(body.x - moto.x, body.z - moto.z));
    moto.assign(body); moto.ticks++;
    if (!hit) return false;
    if (hit.closing >= MOTO.CRASH_SPEED && !isCar(moto)) { this.crashMoto(moto, hit, rider); return true; }
    // A knock that only stops it still marks it, once (rubbing along a wall reports one every step).
    const engine = this.engineOf(moto), now = Date.now();
    if (hit.closing >= MOTO_WEAR_FROM && now - engine.knockedAt > MOTO_KNOCK_GAP_MS) {
      engine.knockedAt = now;this.wearMoto(moto, hit.closing, motoHitArea(moto.yaw, hit.nx, hit.nz));
      if(isCar(moto)&&hit.closing>8)for(const id of vehicleOccupants(moto)){const occupant=this.state.players.get(id);if(occupant)this.needs.damage(occupant,Math.min(35,Math.round((hit.closing-8)*1.5)),now);}
    }
    return false;
  }

  private engineOf(moto: Moto) {
    let engine = this.motoEngines.get(moto.id);
    if (!engine) { engine = { crankEnds: 0, retryAt: 0, knockedAt: 0 }; this.motoEngines.set(moto.id, engine); }
    return engine;
  }
  private setEngine(moto: Moto, engine: number, now: number): void {
    if (moto.engine === engine) return;
    moto.engine = engine; moto.engineAt = now;
    if (engine !== MOTO_ENGINE.ON) {moto.gas = false;moto.lights=0;moto.headlights=0;moto.wipers=false;}
    else moto.headlights=1;
  }
  /** One try at starting: its outcome is decided here and every browser plays that clip. */
  private crankEngine(moto: Moto, now: number): void {
    if(!moto.ignition||moto.fuel<=0)return;
    moto.crank = motoCrank(readDriveParts(moto));
    this.engineOf(moto).crankEnds = now + MOTO_CRANK_MS[moto.crank]!;
    this.setEngine(moto, MOTO_ENGINE.CRANKING, now);
  }
  /** A try at starting coming to its end, and a tired engine dying by itself. */
  private stepEngine(moto: Moto, now: number): void {
    if(moto.engine===MOTO_ENGINE.ON){
      moto.fuel=Math.max(0,moto.fuel-vehicleFuelUse(moto.model,vehicleSpeed(moto),moto.gas,TICK_MS/1000));
      if(moto.ownerId)this.markOwned(moto.ownerId);
      if(moto.fuel<=0||!moto.ignition){this.setEngine(moto,MOTO_ENGINE.OFF,now);return;}
    }
    const engine = this.engineOf(moto);
    if (moto.engine === MOTO_ENGINE.CRANKING) {
      if (now < engine.crankEnds) return;
      if (moto.crank === 0) this.setEngine(moto, MOTO_ENGINE.ON, now);
      else { engine.retryAt = now + MOTO_RETRY_MS; this.setEngine(moto, MOTO_ENGINE.OFF, now); }
    } else if (moto.engine === MOTO_ENGINE.ON && moto.riderId && Math.random() < motoStallChance(readDriveParts(moto)) * TICK_MS / 1000) {
      engine.retryAt = now + MOTO_RETRY_MS;
      this.setEngine(moto, MOTO_ENGINE.OFF, now);
    }
  }
  /** A blow to the bike: its parts lose condition by how hard it was and where (moto-parts.ts). */
  private wearMoto(moto: Moto, closing: number, area: MotoHitArea): void {
    moto.parts = wearVehicleParts(moto, closing, area);
    if (moto.ownerId) this.markOwned(moto.ownerId, true);
  }

  private motoObstacles(moto: Moto) {
    return [...this.state.motos.values()].filter(other => other !== moto).map(other => motoObstacle(other));
  }

  /**
   * A crash. The rider keeps going as the bike was going, with what it had hit (ragdoll.ts); the bike takes the blow: a square hit knocks it
   * over, a glancing one leaves it rolling by itself until it falls (moto-crash.ts). A bike it ran into gets its share of the blow too.
   */
  private crashMoto(moto: Moto, hit: MotoHit, rider?: Player): void {
    if(isCar(moto)){this.wearMoto(moto,hit.closing,motoHitArea(moto.yaw,hit.nx,hit.nz));moto.assign(STOPPED_VEHICLE);return;}
    const vx = Math.sin(moto.yaw) * hit.speed, vz = Math.cos(moto.yaw) * hit.speed;
    this.wearMoto(moto, hit.closing, motoHitArea(moto.yaw, hit.nx, hit.nz));
    if (rider) this.throwRider(moto, rider, vx, vz, hit.closing);
    const other = hit.solid?.startsWith('moto:') ? this.state.motos.get(hit.solid.slice('moto:'.length)) : undefined;
    if (other && !other.phase) { this.wearMoto(other, hit.closing * .55, 'side'); this.knockMoto(other, vx * .55, vz * .55); }
    if (hit.closing < Math.abs(hit.speed) * MOTO.GLANCING) {
      moto.speed = hit.speed - hit.speed * Math.min(1, hit.closing / Math.abs(hit.speed)) * .4;
      this.letLoose(moto, (Math.random() < .5 ? -1 : 1) * (.3 + hit.closing * .12));
    } else this.knockMoto(moto, 0, 0, hit.speed);
  }

  /** Off the bike and flying, from the seat, with the speed it had. */
  private throwRider(moto: Moto, rider: Player, vx: number, vz: number, closing: number): void {
    moto.riderId = ''; moto.lights &= ~MOTO_LIGHT.BRAKE;
    this.startThrown(rider, { x: moto.x, y: moto.y, z: moto.z, yaw: moto.yaw, vx, vz, closing, seated: true, seed: Math.floor(Math.random() * 0xffffffff) });
    this.achieved(rider.id, 'barbeiro');
    if (this.highfood.crashed(rider.id)) this.sendFood(rider.id);
    this.log('moto_crash', { playerId: rider.id, moto: moto.id, speed: +Math.hypot(vx, vz).toFixed(1), closing: +closing.toFixed(1) });
  }

  /** Who a kick can throw: someone up and free, or busy with something a blow can cut short. Sitting, working, playing or riding, it passes them by. */
  private kickable(kicker: Player, target: Player, now: number): boolean {
    if (target === kicker || !target.connected || target.currentTableId || !isConscious(target)) return false;
    if (!KICKABLE.has(target.interactionState)) return false;
    return now >= (this.sessions.getByUser(target.id)?.kickSafeUntil ?? 0) && kickClear(kicker, target);
  }

  /** Each kick on its way: all the way the foot went since the last tick, against everyone it could touch. It can hit more than one. */
  private stepKicks(now: number): void {
    for (const [id, kick] of this.kicks) {
      const kicker = this.state.players.get(id);
      if (!kicker || kicker.animationState !== 'kick' || kicker.animationStartedAt !== kick.startedAt) { this.kicks.delete(id); continue; }
      const span = kickWindow(kicker.skill), ms = now - kick.startedAt;
      if (!span) { this.kicks.delete(id); continue; }
      for (const target of this.state.players.values()) {
        if (kick.hit.has(target.id) || !this.kickable(kicker, target, now) || !kickTouches(kicker.skill, kick.checkedMs, ms, kicker, target)) continue;
        kick.hit.add(target.id);
        this.landKick(kicker, target);
      }
      kick.checkedMs = ms;
      if (ms > span.to) this.kicks.delete(id);
    }
  }

  private landKick(kicker: Player, target: Player): void {
    const hurt = Math.min(KICKS[kicker.skill]!.hp, Math.max(0, target.hp - 1));
    this.startThrown(target, kickLaunch(kicker.skill, kicker.id, kicker, target, Math.floor(Math.random() * 0xffffffff)), hurt);
    this.log('kick_hit', { playerId: target.id, by: kicker.id, skill: kicker.skill, hp: hurt });
    this.sessions.getByUser(target.id)?.client.send('player.kicked', { hp: hurt, by: kicker.displayName });
  }

  /** `hurt`: the life this blow takes. All but the last point go at once; that one waits for the body to land, so nobody faints in the air. */
  private startThrown(player: Player, start: RagdollStart, hurt = 0): void {
    const presence = this.sessions.getByUser(player.id), now = Date.now(), atOnce = Math.min(hurt, Math.max(0, player.hp - 1));
    this.dropHolding(player);
    this.closeDialog(player, presence);
    this.dropParcel(player);
    if (atOnce > 0) this.needs.damage(player, atOnce, now);
    player.interactionState = THROWN; player.animationState = 'ragdoll'; player.animationStartedAt = now; player.drinkItem = '';
    this.thrown.set(player.id, { sim: new Ragdoll(start), hurt: hurt - atOnce });
    this.state.ragdolls.set(player.id, new RagdollState().assign({ ...start, startedAt: now }));
    if (presence) { presence.queue.length = 0; presence.motoQueue.length = 0; presence.interactionEndsAt = undefined; presence.gestureEndsAt = undefined; player.lastProcessedInput = presence.lastReceived; }
  }

  /** The bodies go on until they stop; then getting up, from where they lie, whichever way they lie. */
  private stepThrown(now: number): void {
    for (const [id, body] of this.thrown) {
      const player = this.state.players.get(id);
      // Anything else that takes the player (falling unconscious, leaving): the body is no longer the crash's.
      if (!player || player.interactionState !== THROWN) { this.thrown.delete(id); this.state.ragdolls.delete(id); continue; }
      if (body.upAt) {
        if (now < body.upAt) continue;
        player.interactionState = ''; player.animationState = 'idle'; player.animationStartedAt = now;
        this.thrown.delete(id); this.state.ragdolls.delete(id);
        const presence = this.sessions.getByUser(id);
        if (presence) presence.kickSafeUntil = now + KICK.graceMs;
        continue;
      }
      body.sim.advance(TICK_MS / 1000);
      const rest = body.sim.rest();
      player.x = rest.x; player.y = rest.y; player.z = rest.z;
      if (!body.sim.asleep) continue;
      if (body.hurt > 0) {
        this.needs.damage(player, body.hurt, now); body.hurt = 0;
        // No life left, ring and heart: the next tick's needs make this a death, right where the body lies.
        if (player.hp <= 0 && player.hpCore <= 0) continue;
      }
      // `levantar_chao` starts lying with the feet the way it faces and the hips behind its origin: turned and placed so it starts as the body lies.
      const x = rest.x - Math.sin(rest.heading) * RECOVER_HIPS_BEHIND, z = rest.z - Math.cos(rest.heading) * RECOVER_HIPS_BEHIND;
      // It may lie where nobody can stand (on a car, against a wall): the nearest place on foot.
      const spot = isWalkable(x, z, rest.y) ? { x, y: rest.y, z } : standingPosition({ x, y: rest.y, z }, rest.heading);
      player.x = spot.x; player.y = spot.y ?? rest.y; player.z = spot.z; player.rotation = rest.heading + Math.PI;
      player.animationState = 'recover'; player.animationStartedAt = now; body.upAt = now + barClipMs('levantar_chao');
    }
  }

  /** On foot in the way of a bike going fast enough to crash: both go down. */
  private strikeWalkers(moto: Moto, rider?: Player): void {
    const speed = vehicleSpeed(moto);
    if (speed < MOTO.CRASH_SPEED) return;
    for (const player of this.state.players.values()) {
      if (player === rider || !player.connected || player.interactionState || player.currentTableId || !motoStrikes(moto, player)) continue;
      const {x:vx,z:vz}=vehicleVelocity(moto);
      const hurt = motoStrikeHp(speed);
      this.startThrown(player, { x: player.x, y: player.y ?? moto.y, z: player.z, yaw: player.rotation, vx: vx * .95, vz: vz * .95, closing: speed * .6, seated: false, seed: Math.floor(Math.random() * 0xffffffff) }, hurt);
      this.log('moto_strike', { playerId: player.id, moto: moto.id, speed: +speed.toFixed(1), hp: hurt });
      this.sessions.getByUser(player.id)?.client.send('moto.struck', { hp: hurt, by: rider?.displayName ?? '' });
      this.crashMoto(moto, { speed: moto.speed, closing: speed * .45, nx: -vx/speed, nz: -vz/speed }, rider);
      return;
    }
  }

  private letLoose(moto: Moto, rollRate: number): void {
    if(isCar(moto)){moto.assign(STOPPED_VEHICLE);return;}
    const loose = { roll: Math.sign(rollRate) * .02, rollRate };
    this.fallenMotos.set(moto.id, { loose });
    moto.phase = 'loose'; moto.riderId = '';
    this.showMoto(moto, loosePose(moto, loose));
  }
  /** Knocked over: a rider on it comes off, and it goes down with the blow it took. */
  private knockMoto(moto: Moto, vx: number, vz: number, speed = moto.speed): void {
    if(isCar(moto)){this.wearMoto(moto,Math.hypot(vx,vz),'side');moto.assign(STOPPED_VEHICLE);return;}
    if (moto.riderId) { const rider = this.state.players.get(moto.riderId); if (rider) this.throwRider(moto, rider, Math.sin(moto.yaw) * moto.speed + vx, Math.cos(moto.yaw) * moto.speed + vz, Math.hypot(vx, vz)); }
    moto.riderId = '';
    this.setEngine(moto, MOTO_ENGINE.OFF, Date.now());
    this.wearMoto(moto, Math.max(MOTO_WEAR_FROM, Math.abs(speed) * MOTO_FALL_FORCE), 'fall');
    const wreck = startWreck(moto, 0, (Math.random() < .5 ? -1 : 1) * (.35 + Math.random() * .5), speed, { vx, vz });
    this.fallenMotos.set(moto.id, { wreck });
    moto.phase = 'tumble';
    this.showMoto(moto, wreckPose(wreck));
  }
  private showMoto(moto: Moto, pose: MotoPose): void { moto.assign(pose); moto.ticks++; }

  /** A bike nobody holds: on its wheels, down, or being lifted. */
  private stepFallenMoto(moto: Moto, now: number): void {
    const sim = this.fallenMotos.get(moto.id);
    if (moto.phase === 'down') return;
    if (!sim) { moto.phase = ''; return; }
    if (sim.lift) { this.stepLift(moto, sim.lift, now); return; }
    if (sim.loose) {
      const { body, hit, fell } = stepLoose(moto, sim.loose, TICK_MS / 1000, this.motoObstacles(moto));
      moto.assign(body);
      this.strikeWalkers(moto);
      if (!this.fallenMotos.get(moto.id)?.loose) return;
      if (hit && hit.closing >= MOTO.CRASH_SPEED) {
        this.wearMoto(moto, hit.closing, motoHitArea(moto.yaw, hit.nx, hit.nz));
        const other = hit.solid?.startsWith('moto:') ? this.state.motos.get(hit.solid.slice('moto:'.length)) : undefined;
        if (other && !other.phase) { this.wearMoto(other, hit.closing * .55, 'side'); this.knockMoto(other, Math.sin(moto.yaw) * hit.speed * .55, Math.cos(moto.yaw) * hit.speed * .55); }
        sim.wreck = startWreck(moto, sim.loose.roll, sim.loose.rollRate, hit.speed);
      } else if (fell || !vehicleMoving(moto)) sim.wreck = startWreck(moto, sim.loose.roll, sim.loose.rollRate || (Math.random() < .5 ? -.4 : .4), moto.speed);
      if (sim.wreck) {
        sim.loose = undefined; moto.phase = 'tumble';
        this.setEngine(moto, MOTO_ENGINE.OFF, now);
        this.wearMoto(moto, Math.max(MOTO_WEAR_FROM, vehicleSpeed(moto) * MOTO_FALL_FORCE), 'fall');
        this.showMoto(moto, wreckPose(sim.wreck));
      }
      else this.showMoto(moto, loosePose(moto, sim.loose));
      return;
    }
    if (!sim.wreck) return;
    const lies = stepWreck(sim.wreck, TICK_MS / 1000);
    this.showMoto(moto, wreckPose(sim.wreck));
    // Its bars flop towards the side it lies on.
    moto.steer += (motoLeanSide(moto) < 0 ? 1 : -1) * .1; moto.steer = Math.max(-1, Math.min(1, moto.steer));
    if (!lies) return;
    moto.assign(STOPPED_VEHICLE); moto.phase = 'down'; moto.lights = 0; this.fallenMotos.delete(moto.id);
  }

  /** Near a fallen bike, E lifts it: the body beside it, by the seat, and in a moment it is on its wheels. */
  private startLift(moto: Moto, player: Player, presence: Presence): void {
    const upright = motoUprightSpot(moto), side = motoLeanSide(moto), spot = motoLiftSpot(upright, side), now = Date.now();
    player.x = spot.x; player.y = spot.y; player.z = spot.z; player.rotation = Math.atan2(upright.x - spot.x, upright.z - spot.z);
    player.interactionState = `${LIFTING}${moto.id}`; player.animationState = 'moto-lift'; player.animationStartedAt = now; player.drinkItem = '';
    presence.queue.length = 0; presence.motoQueue.length = 0; player.lastProcessedInput = presence.lastReceived;
    moto.phase = 'lifting'; moto.lifterId = player.id; moto.ticks++;
    this.fallenMotos.set(moto.id, { lift: { from: [moto.qx, moto.qy, moto.qz, moto.qw], to: uprightQuat(upright.yaw, upright.pitch), fromAt: { x: moto.x, y: moto.y, z: moto.z }, at: upright, startedAt: now } });
  }
  private stepLift(moto: Moto, lift: NonNullable<ReturnType<BarRoom['fallenMotos']['get']>>['lift'] & {}, now: number): void {
    const lifter = this.state.players.get(moto.lifterId), done = (now - lift.startedAt) / MOTO.LIFT_MS;
    // Whoever was lifting it let go (left, fell unconscious): it falls back where it was.
    if (!lifter?.connected || lifter.interactionState !== `${LIFTING}${moto.id}`) {
      moto.assign({ ...lift.fromAt, qx: lift.from[0], qy: lift.from[1], qz: lift.from[2], qw: lift.from[3] });
      moto.phase = 'down'; moto.lifterId = ''; moto.ticks++; this.fallenMotos.delete(moto.id);
      return;
    }
    if (done < 1) {
      // Slowly off the ground, then the weight comes over the wheels and it rises quicker.
      const eased = done * done * (3 - 2 * done), [qx, qy, qz, qw] = blendQuat(lift.from, lift.to, eased);
      moto.assign({ x: lift.fromAt.x + (lift.at.x - lift.fromAt.x) * eased, y: lift.fromAt.y + (lift.at.y - lift.fromAt.y) * eased, z: lift.fromAt.z + (lift.at.z - lift.fromAt.z) * eased, qx, qy, qz, qw });
      moto.ticks++;
      return;
    }
    moto.assign({ ...lift.at, ...STOPPED_VEHICLE, steer: 0, qx: 0, qy: 0, qz: 0, qw: 1 });
    moto.phase = ''; moto.lifterId = ''; moto.ticks++; this.fallenMotos.delete(moto.id);
    lifter.interactionState = ''; lifter.animationState = 'idle'; lifter.animationStartedAt = now;
  }

  private mountMoto(client: Client, motoId: string,seat?:number): void {
    const player = this.player(client), presence = this.forClient(client)!, moto = this.state.motos.get(motoId);
    if (!moto) throw new Error('Essa moto não está aqui.');
    if(this.refueling.busy(motoId))throw new Error('Aguarde o frentista concluir o atendimento.');
    if (player.interactionState || player.currentTableId || player.animationState === 'kick' || !isConscious(player)) throw new Error('Encerre a ação atual antes de subir na moto.');
    if (moto.locked && moto.ownerId !== player.id && !moto.phase) throw new Error(`Essa moto está trancada. Placa ${moto.plate}, de ${moto.ownerName || 'outra pessoa'}.`);
    if(isCar(moto)){
      if(vehicleMotionSpeed(moto)>.5)throw new Error('Espere o carro parar para entrar.');
      const occupants=vehicleOccupants(moto),chosen=seat??occupants.findIndex(id=>!id);
      if(chosen<0||chosen>3||occupants[chosen])throw new Error('Este lugar já está ocupado. O carro comporta quatro pessoas.');
      if(!canMountMoto(moto,player,INTERACTION_SLACK,player.id))throw new Error('Chegue mais perto da porta do carro.');
      if(chosen===0){moto.riderId=player.id;moto.ignition=true;}else moto.passengers[chosen-1]=player.id;
      this.dropParcel(player);const order=this.highfood.orderOf(player.id);if(order){order.transport='moto';this.sendFood(player.id);}
      Object.assign(player,seatPosition(moto,chosen));player.rotation=normalizeHeading(moto.yaw);
      player.interactionState=chosen===0?motoInteraction(moto.id):passengerInteraction(moto.id,chosen);
      player.animationState='ride';player.animationStartedAt=Date.now();player.drinkItem='';
      presence.queue.length=0;presence.motoQueue.length=0;presence.motoBudget=1;presence.motoBudgetAt=Date.now();player.lastProcessedInput=presence.lastReceived;
      this.openCarDoor(moto,chosen);
      if(chosen===0)this.crankEngine(moto,Date.now());
      return;
    }
    if(seat!==undefined&&seat!==0)throw new Error('Este veículo tem apenas um lugar.');
    if (moto.riderId) throw new Error('Alguém já está nessa moto.');
    if (this.beingRepaired(moto.id)) throw new Error('Alguém está consertando essa moto.');
    if (moto.phase === 'lifting') throw new Error('Alguém já está levantando essa moto.');
    if (moto.phase === 'loose' || moto.phase === 'tumble') throw new Error('Espere a moto parar.');
    if (moto.phase === 'down') {
      if (!canLiftMoto(moto, player, INTERACTION_SLACK)) throw new Error('Chegue mais perto da moto.');
      this.startLift(moto, player, presence);
      return;
    }
    if (!canMountMoto(moto, player, INTERACTION_SLACK)) throw new Error('Chegue mais perto da moto.');
    moto.riderId = player.id; moto.lights = 0;moto.ignition=true;
    this.dropParcel(player);
    const order=this.highfood.orderOf(player.id);
    if(order){order.transport='moto';this.sendFood(player.id);}
    player.x = moto.x; player.y = moto.y; player.z = moto.z; player.rotation = normalizeHeading(moto.yaw);
    player.interactionState = motoInteraction(moto.id); player.animationState = 'ride'; player.animationStartedAt = Date.now(); player.drinkItem = '';
    presence.queue.length = 0; presence.motoQueue.length = 0; presence.motoInputAt = 0; presence.motoBudget = 1; presence.motoBudgetAt = Date.now(); player.lastProcessedInput = presence.lastReceived;
    this.crankEngine(moto, Date.now());
  }

  private readonly carDoorTimers=new Map<string,{left:number;right:number}>();
  private openCarDoor(car:Moto,seat:number):void {
    const bit=CAR_SEATS[seat]!.side===1?1:2,timer=this.carDoorTimers.get(car.id)??{left:0,right:0};
    car.doors|=bit;if(bit===1)timer.left=Date.now()+1000;else timer.right=Date.now()+1000;this.carDoorTimers.set(car.id,timer);
  }
  /** Passengers share the car's authoritative position but never feed its input queue. */
  private syncPassengers(now:number):void {
    for(const car of this.state.motos.values())if(isCar(car)){
      const timer=this.carDoorTimers.get(car.id);
      if(timer){if(timer.left&&now>=timer.left){car.doors&=~1;timer.left=0;}if(timer.right&&now>=timer.right){car.doors&=~2;timer.right=0;}if(!timer.left&&!timer.right)this.carDoorTimers.delete(car.id);}
      for(let seat=1;seat<4;seat++){
        const id=car.passengers[seat-1];if(!id)continue;
        const player=this.state.players.get(id),presence=this.sessions.getByUser(id);
        if(!player?.connected||!presence||presence.revoked||player.interactionState!==passengerInteraction(car.id,seat)){
          if(player?.interactionState===passengerInteraction(car.id,seat))this.freeMoto(car,player);
          else car.passengers[seat-1]='';
          continue;
        }
        Object.assign(player,seatPosition(car,seat));player.rotation=normalizeHeading(car.yaw);
        presence.motoQueue.length=0;presence.queue.length=0;player.lastProcessedInput=presence.lastReceived;
      }
    }
  }
  private async controlVehicle(client:Client,id:string,action:string):Promise<void> {
    const player=this.player(client),car=this.state.motos.get(id);
    if(!car)throw new Error('Esse veículo não está no mapa.');
    if(!isConscious(player))throw new Error('Espere recuperar os sentidos.');
    if(this.refueling.busy(id))throw new Error('Aguarde o frentista concluir o atendimento.');
    if(car.riderId!==player.id&&(car.ownerId!==player.id||motoDistance(car,player)>3))throw new Error('Só o motorista ou o dono perto do veículo pode fazer isso.');
    if(action==='lock'){car.locked=!car.locked;client.send('moto.locked',{plate:car.plate,locked:car.locked});return;}
    if(action==='refuel'){
      const presence=this.forClient(client)!;
      await this.refueling.request(presence.ticket,car,Date.now());return;
    }
    if(action==='ignition'){
      if(car.riderId!==player.id)throw new Error('Entre no lugar do motorista.');
      if(car.engine!==MOTO_ENGINE.OFF||vehicleMotionSpeed(car)>.05)throw new Error('Pare e desligue o motor antes de retirar a chave.');
      car.ignition=!car.ignition;return;
    }
    if(action==='engine'){
      if(car.riderId!==player.id)throw new Error('Entre no lugar do motorista.');
      if(car.engine===MOTO_ENGINE.OFF){
        if(!car.ignition)throw new Error('Coloque a chave na ignição.');
        if(car.fuel<=0)throw new Error('Tanque vazio. Abasteça no posto.');
        this.crankEngine(car,Date.now());
      }else this.setEngine(car,MOTO_ENGINE.OFF,Date.now());return;
    }
    if(action==='headlights'){
      if(!vehiclePowered(car))throw new Error('Ligue o motor para usar os faróis.');
      car.headlights=(car.headlights+1)%3;return;
    }
    if(!isCar(car))throw new Error('Este comando só está disponível em carros.');
    if(action==='wipers'){
      if(!vehiclePowered(car))throw new Error('Ligue o motor para usar os limpadores.');
      if(readVehicleParts(car.model,car.parts).limpadores!<=0)throw new Error('Os limpadores precisam de conserto.');
      car.wipers=!car.wipers;return;
    }
    if(vehicleMotionSpeed(car)>vehiclePhysics(car.model).DISMOUNT_SPEED)throw new Error('Pare o carro antes de abrir ou fechar.');
    if(action==='hood')car.hood=!car.hood;
    else if(action==='trunk')car.trunk=!car.trunk;
    else {const bit=action==='left-door'?1:2;car.doors^=bit;const timer=this.carDoorTimers.get(id);if(timer){if(bit===1)timer.left=0;else timer.right=0;}}
  }

  // ---- Bikes people own (HighMotors) ----
  /** `broken`: what can be seen on the bike changed, and it goes to the API right away; the odometer can wait for the next round. */
  private markOwned(userId: string, broken = false): void { const owned = this.ownedMotos.get(userId); if (owned) { owned.dirty = true; owned.broken ||= broken; } }
  /** Metres on the clock, and every so often a point of wear (moto-parts.ts). */
  private rodeOwned(moto: Moto, metres: number): void {
    const owned = this.ownedMotos.get(moto.ownerId);
    if (!owned) return;
    owned.mileage += metres; owned.wearLeft -= metres; owned.dirty = true;
    if (owned.wearLeft <= 0) { owned.wearLeft += HIGHFOOD.WEAR_EVERY_M; moto.parts = vehicleMileageWear(moto); owned.broken = true; }
  }
  /** Keeps what happened to it and forgets it is on the map. */
  private releaseOwned(userId: string): void {
    const owned = this.ownedMotos.get(userId);
    if (!owned) return;
    const moto = this.state.motos.get(owned.motoId);
    if (moto) { this.keepVehicle(userId, owned, moto); void this.saveVehicles().catch(() => {}); }
    this.ownedMotos.delete(userId);
  }
  /** What is on its way to the API, by vehicle: only the latest of each matters. */
  private vehicleUpdates = new Map<string, { vehicleId: string; parts: string; mileage: number; fuel:number }>();
  private savingVehicles?: Promise<void>;
  private vehiclesKeptAt = 0;
  private keepVehicle(userId: string, owned: { vehicleId: string; mileage: number; dirty: boolean; broken: boolean }, moto: Moto): void {
    owned.dirty = false; owned.broken = false;
    const update = { vehicleId: owned.vehicleId, parts: moto.parts, mileage: Math.round(owned.mileage),fuel:Math.round(moto.fuel*10000)/10000 };
    this.vehicleUpdates.set(owned.vehicleId, update);
    const held = this.sessions.getByUser(userId)?.vehicles.find(vehicle => vehicle.id === owned.vehicleId);
    if (held) { held.parts = update.parts; held.mileage = update.mileage;held.fuel=update.fuel; }
  }
  /** `all`: the odometers too (each maintenance round), otherwise only what changed on the bike itself. */
  private keepVehicles(all: boolean): void {
    for (const [userId, owned] of this.ownedMotos) {
      const moto = this.state.motos.get(owned.motoId);
      if (moto && (owned.broken || (all && owned.dirty))) this.keepVehicle(userId, owned, moto);
    }
  }
  /** One batch at a time. A batch that fails stays queued for the next try, and what changes meanwhile goes in the next one. */
  private saveVehicles(): Promise<void> {
    if (this.savingVehicles) return this.savingVehicles;
    if (!this.vehicleUpdates.size) return Promise.resolve();
    const saving = (async () => {
      while (this.vehicleUpdates.size) {
        const batch = [...this.vehicleUpdates.values()].slice(0, 256);
        await internal('vehicles', { updates: batch });
        for (const sent of batch) if (this.vehicleUpdates.get(sent.vehicleId) === sent) this.vehicleUpdates.delete(sent.vehicleId);
      }
    })().finally(() => { this.savingVehicles = undefined; });
    this.savingVehicles = saving;
    return saving;
  }
  /** The API's list, with what the room knows that the API has not heard yet. */
  private setVehicles(presence: Presence, list: readonly OwnedVehicle[]): void {
    presence.vehicles = list.map(vehicle => {
      const pending = this.vehicleUpdates.get(vehicle.id);
      return pending ? { ...vehicle, parts: pending.parts, mileage: pending.mileage,fuel:pending.fuel } : { ...vehicle };
    });
    const out=this.ownMoto(presence.ticket.userId),held=out&&presence.vehicles.find(v=>v.id===out.vehicleId);
    if(out&&held){out.color=held.color??'#ccc9c2';out.ownerName=presence.ticket.displayName;}
  }
  /** Puts a vehicle on the street nearest a point, as it was, locked. */
  private placeOwned(userId: string, vehicle: OwnedVehicle, near: Position, yaw: number): Moto {
    // Clear of the garages' rings: E beside a bike standing on a ring would open the garage instead of getting on.
    const spec=vehiclePhysics(vehicle.model);
    const spot = motoSpawnSpot(near, yaw, [...this.state.motos.values()], GARAGES.map(garage => ({ x: garage.x, z: garage.z, radius: GARAGE.REACH + spec.HALF_LENGTH + spec.REACH + .2 })),vehicle.model);
    if (!spot) throw new Error('Não há rua livre por perto para a moto.');
    const id = `moto-${++this.motoSerial}`;
    const moto = new Moto().assign({ ...parkedMoto({ id, ...spot }),model:vehicle.model,color:vehicle.color??'#ccc9c2',fuel:vehicle.fuel??100, ownerId: userId, ownerName: this.state.players.get(userId)?.displayName ?? '', plate: vehicle.plate, vehicleId: vehicle.id, locked: true, parts: vehicle.parts });
    this.state.motos.set(id, moto);
    this.ownedMotos.set(userId, { vehicleId: vehicle.id, motoId: id, mileage: vehicle.mileage, wearLeft: HIGHFOOD.WEAR_EVERY_M, dirty: false, broken: false });
    return moto;
  }
  private ownMoto(userId: string): Moto | undefined { const owned = this.ownedMotos.get(userId); return owned ? this.state.motos.get(owned.motoId) : undefined; }
  /** The phone's Guincho: for a price, the owner's bike comes to the street nearest them, wherever it was and however it was. */
  private async towOwnMoto(client: Client, vehicleId?: string): Promise<void> {
    const player = this.player(client), presence = this.forClient(client)!;
    if (!presence.vehicles.length) throw new Error('Você ainda não tem moto. Compre uma no HighMotors.');
    if (isRidingMoto(player.interactionState)) throw new Error('Você já está na moto.');
    if (player.interactionState === THROWN) throw new Error('Espere levantar.');
    if (this.trades.committing(player.id)) throw new Error('Espere a negociação terminar.');
    const current = this.ownMoto(player.id), chosen = vehicleId ?? current?.vehicleId ?? presence.vehicles[0]!.id;
    if (!presence.vehicles.some(vehicle => vehicle.id === chosen)) throw new Error('Você não tem a chave desse veículo.');
    if (current && current.vehicleId !== chosen) throw new Error(`A moto ${current.plate} já está na rua. Guarde ela na garagem antes.`);
    if (current && motoDistance(current, player) < 25 && !current.phase) throw new Error('Sua moto já está aqui perto.');
    const selectedVehicle=presence.vehicles.find(v=>v.id===chosen)!;
    const spot = motoSpawnSpot(player, player.rotation, [...this.state.motos.values()],[],selectedVehicle.model);
    if (!spot) throw new Error('Não há rua livre por perto. Vá até uma rua e chame de novo.');
    const price = priceOf(this.prices, 'vehicle:tow'), charge = randomUUID();
    if (price > 0) {
      const change = await changeWallet({ sessionId: presence.ticket.sessionId, userId: player.id }, -price, 'vehicle:tow', charge);
      presence.balance = change.balance; client.send('wallet.state', { balance: change.balance, delta: change.applied, reason: 'vehicle' });
    }
    const now = this.ownMoto(player.id);
    if (now) { const rider = now.riderId ? this.state.players.get(now.riderId) : undefined; if (rider) this.freeMoto(now, rider); this.despawnMoto(now.id, ''); }
    const vehicle = presence.vehicles.find(each => each.id === chosen);
    // Traded away or taken back while the money was on its way: the coins come back with the error.
    if (!vehicle) { if (price > 0) this.refund(presence, charge, price); throw new Error('Você não tem mais a chave desse veículo.'); }
    const moto = this.placeOwned(player.id, vehicle, player, player.rotation);
    this.log('moto_tow', { playerId: player.id, price, moto: moto.id, plate: moto.plate });
    client.send('moto.towed', { x: moto.x, z: moto.z });
  }
  /** The key's button: only the key holder, from a little way off. */
  private lockMoto(client: Client, locked: boolean): void {
    const player = this.player(client), moto = this.ownMoto(player.id);
    if (!moto) throw new Error('Sua moto não está na rua.');
    if (Math.hypot(moto.x - player.x, moto.z - player.z) > GARAGE.LOCK_REACH) throw new Error('Chegue mais perto da moto.');
    moto.locked = locked;
    this.log('moto_lock', { playerId: player.id, plate: moto.plate, locked });
    client.send('moto.locked', { plate: moto.plate, locked });
  }

  // ---- Garages (docs/sistemas/garagem.md) ----
  private atGarage(player: Player, garageId: string) {
    const garage = garageById(garageId), object = garage && INTERACTABLES.find(each => each.id === garage.id);
    if (!garage || !object || !canInteract(object, player, INTERACTION_SLACK)) throw new Error('Vá até a garagem para isso.');
    return garage;
  }
  private garageView(presence: Presence, garageId: GarageView['garageId']): GarageView {
    const garage = garageById(garageId)!, owned = this.ownedMotos.get(presence.ticket.userId), out = owned && this.state.motos.get(owned.motoId);
    return {
      garageId, towPrice: priceOf(this.prices, 'vehicle:tow'),
      vehicles: presence.vehicles.map(vehicle => out?.vehicleId === vehicle.id
        ? { ...vehicle, parts: out.parts, mileage: Math.round(owned!.mileage),fuel:out.fuel, out: true, far: Math.hypot(out.x - garage.x, out.z - garage.z) > GARAGE.STORE_REACH }
        : { ...vehicle, out: false }),
    };
  }
  private takeFromGarage(client: Client, garageId: string, vehicleId: string): void {
    const player = this.player(client), presence = this.forClient(client)!, garage = this.atGarage(player, garageId);
    if (player.interactionState || player.currentTableId) throw new Error('Encerre a ação atual antes de tirar um veículo.');
    if (this.trades.committing(player.id)) throw new Error('Espere a negociação terminar.');
    const vehicle = presence.vehicles.find(each => each.id === vehicleId);
    if (!vehicle) throw new Error('Você não tem a chave desse veículo.');
    const out = this.ownMoto(player.id);
    if (out) throw new Error(`A moto ${out.plate} já está na rua. Guarde ela antes de tirar outra.`);
    // The rings face the wall behind them: the bike comes out the other way, on the road, pointing away from it.
    const moto = this.placeOwned(player.id, vehicle, garage, garage.rotation + Math.PI);
    this.log('garage_take', { playerId: player.id, plate: moto.plate });
    client.send('garage.taken', { plate: moto.plate, x: moto.x, z: moto.z });
  }
  /** Near the garage it just goes in; from afar the tow truck brings it, at the tow's price, and only if the player said yes to that. */
  private async storeInGarage(client: Client, garageId: string, recall: boolean): Promise<void> {
    const player = this.player(client), presence = this.forClient(client)!, garage = this.atGarage(player, garageId), moto = this.ownMoto(player.id);
    if (this.trades.committing(player.id)) throw new Error('Espere a negociação terminar.');
    if (!moto) throw new Error('Você não tem veículo na rua.');
    if(this.refueling.busy(moto.id))throw new Error('Aguarde o frentista concluir o atendimento.');
    if (moto.riderId === player.id && vehicleMotionSpeed(moto) > MOTO.DISMOUNT_SPEED) throw new Error('Pare a moto para guardar.');
    const far = Math.hypot(moto.x - garage.x, moto.z - garage.z) > GARAGE.STORE_REACH, price = far ? priceOf(this.prices, 'vehicle:tow') : 0;
    if (far && !recall) throw new Error('A moto está longe: só o guincho traz.');
    const charge = randomUUID();
    if (price > 0) {
      const change = await changeWallet({ sessionId: presence.ticket.sessionId, userId: player.id }, -price, 'vehicle:tow', charge);
      presence.balance = change.balance; client.send('wallet.state', { balance: change.balance, delta: change.applied, reason: 'vehicle' });
    }
    const now = this.ownMoto(player.id);
    if (now?.vehicleId === moto.vehicleId) {
      const plate = now.plate;
      this.despawnMoto(now.id, now.riderId && now.riderId !== player.id ? `O dono guardou a moto ${plate} na garagem.` : '');
      this.log('garage_store', { playerId: player.id, plate, recalled: far, price });
    } else if (price > 0) this.refund(presence, charge, price);
    client.send('garage.state', this.garageView(presence, garage.id));
  }

  // ---- Trades between players (docs/sistemas/troca.md) ----
  /** Why these two cannot be trading right now, if so. */
  private tradeProblem(player: Player | undefined, other: Player | undefined, reach: number): string | undefined {
    if (!player?.connected || !other?.connected) return 'A outra pessoa saiu.';
    if (!isConscious(player) || !isConscious(other)) return 'Alguém perdeu os sentidos.';
    if (player.interactionState === THROWN || other.interactionState === THROWN) return 'Alguém caiu no chão.';
    if (isRidingMoto(player.interactionState) || isRidingMoto(other.interactionState)) return 'Alguém subiu numa moto.';
    if (Math.hypot(player.x - other.x, player.z - other.z) > reach || Math.abs(player.y - other.y) > 1.5) return 'Vocês se afastaram demais.';
  }
  private requestTrade(client: Client, targetId: string): void {
    const player = this.player(client), presence = this.forClient(client)!, other = this.state.players.get(targetId), theirs = this.sessions.getByUser(targetId);
    if (!other?.connected || !theirs || theirs.ticket.bot) throw new Error('Essa pessoa não pode negociar agora.');
    if (presence.blocked.has(targetId) || theirs.blocked.has(player.id)) throw new Error('Essa pessoa não pode negociar com você.');
    const problem = this.tradeProblem(player, other, TRADE.REACH);
    if (problem) throw new Error(problem === 'Vocês se afastaram demais.' ? `Chegue mais perto de ${other.displayName} para negociar.` : problem);
    const invite = this.trades.invite(player.id, player.displayName, targetId, other.displayName, Date.now());
    theirs.client.send('trade.invite', invite);
    client.send('trade.sent', { name: other.displayName, expiresAt: invite.expiresAt });
  }
  private respondTrade(client: Client, inviteId: string, accept: boolean): void {
    const player = this.player(client), { invite, trade } = this.trades.respond(player.id, inviteId, accept, Date.now());
    const asker = this.sessions.getByUser(invite.from);
    if (!trade) { asker?.client.send('trade.notice', { text: `${player.displayName} recusou a negociação.` }); return; }
    const problem = this.tradeProblem(player, this.state.players.get(invite.from), TRADE.LEAVE_REACH);
    if (problem) { this.endTrade(trade, problem); throw new Error(problem); }
    this.sendTrade(trade);
  }
  private sendTrade(trade: Trade): void {
    for (const side of [trade.a, trade.b]) this.sessions.getByUser(side.userId)?.client.send('trade.state', this.trades.viewFor(trade, side.userId));
  }
  /** Ends it with nothing moved, and says why. */
  private endTrade(trade: Trade, message: string): void {
    this.trades.close(trade);
    for (const side of [trade.a, trade.b]) this.sessions.getByUser(side.userId)?.client.send('trade.closed', { id: trade.id, status: 'cancelled', message });
  }
  private leaveTrades(userId: string, why: string): void {
    for (const invite of this.trades.dropInvites(userId)) {
      const other = invite.from === userId ? invite.to : invite.from;
      this.sessions.getByUser(other)?.client.send(invite.from === userId ? 'trade.uninvite' : 'trade.notice', invite.from === userId ? { id: invite.id } : { text: why });
    }
    const trade = this.trades.of(userId);
    // Confirmed already: it is at the API and ends there, whoever is around to hear about it.
    if (trade && trade.stage !== 'committing') this.endTrade(trade, why);
  }
  /** What this offer asks for against what the room knows the player has. The API has the last word, under locks. */
  private checkOffer(presence: Presence, offer: TradeOffer): void {
    if (offer.coins > presence.balance) throw new Error('Você não tem essas moedas.');
    for (const { itemId, quantity } of offer.items) if ((presence.inventory.get(itemId) ?? 0) < quantity) throw new Error(`Você não tem ${quantity} de ${itemById(itemId)?.name ?? itemId}.`);
    for (const id of offer.vehicles) if (!presence.vehicles.some(vehicle => vehicle.id === id)) throw new Error('Você não tem essa chave.');
  }
  private offerTrade(client: Client, tradeId: string, offer: TradeOffer): void {
    const player = this.player(client), presence = this.forClient(client)!;
    this.checkOffer(presence, offer);
    const lines = offer.vehicles.map(id => { const vehicle = presence.vehicles.find(each => each.id === id)!; return { id, plate: vehicle.plate, name: vehicle.name }; });
    this.sendTrade(this.trades.setOffer(player.id, tradeId, offer, lines, Date.now()));
  }
  private readyTrade(client: Client, tradeId: string, version: number, ready: boolean): void {
    const player = this.player(client), presence = this.forClient(client)!, now = Date.now();
    if (ready) { const current = this.trades.of(player.id); if (current?.id === tradeId) this.checkOffer(presence, (current.a.userId === player.id ? current.a : current.b).offer); }
    this.sendTrade(this.trades.setReady(player.id, tradeId, version, ready, now));
  }
  private confirmTrade(client: Client, tradeId: string, version: number): void {
    const player = this.player(client), { trade, go } = this.trades.confirm(player.id, tradeId, version, Date.now());
    this.sendTrade(trade);
    if (!go) return;
    const first = this.sessions.getByUser(trade.a.userId), second = this.sessions.getByUser(trade.b.userId);
    if (!first || !second) { this.endTrade(trade, 'A outra pessoa saiu.'); return; }
    this.tradeCommits.set(trade.id, { trade, attempts: 0, nextAt: 0, sending: false, body: {
      id: trade.id,
      a: { userId: trade.a.userId, sessionId: first.ticket.sessionId, offer: trade.a.offer },
      b: { userId: trade.b.userId, sessionId: second.ticket.sessionId, offer: trade.b.offer },
    } });
  }
  private cancelTrade(client: Client, tradeId: string): void {
    const player = this.player(client), trade = this.trades.cancel(player.id, tradeId);
    for (const side of [trade.a, trade.b]) this.sessions.getByUser(side.userId)?.client.send('trade.closed', { id: trade.id, status: 'cancelled', message: `${player.displayName} cancelou a negociação.` });
  }
  /** The clock of the trades: invitations and tables left alone, people who walked away, and what the API has not answered yet. */
  private stepTrades(now: number): void {
    for (const event of this.trades.update(now)) {
      if (event.kind === 'idle') for (const side of [event.trade.a, event.trade.b]) this.sessions.getByUser(side.userId)?.client.send('trade.closed', { id: event.trade.id, status: 'cancelled', message: 'A negociação ficou parada e foi encerrada.' });
      else {
        this.sessions.getByUser(event.invite.to)?.client.send('trade.uninvite', { id: event.invite.id });
        this.sessions.getByUser(event.invite.from)?.client.send('trade.notice', { text: `${event.invite.toName} não respondeu.` });
      }
    }
    for (const trade of [...this.trades.active()]) {
      if (trade.stage === 'committing') continue;
      const problem = this.tradeProblem(this.state.players.get(trade.a.userId), this.state.players.get(trade.b.userId), TRADE.LEAVE_REACH);
      if (problem) this.endTrade(trade, problem);
    }
    for (const commit of this.tradeCommits.values()) if (!commit.sending && now >= commit.nextAt) void this.sendCommit(commit);
  }
  /** The one call that moves things. The same id any number of times: the API does it once and always answers how it ended. */
  private async sendCommit(commit: { trade: Trade; body: unknown; attempts: number; nextAt: number; sending: boolean }): Promise<void> {
    commit.sending = true; commit.attempts++;
    // What each vehicle looks like goes first, so the new owner never gets an old picture of it.
    await this.saveVehicles().catch(() => {});
    try {
      const result = await internal<TradeResult>('trades/commit', commit.body);
      this.tradeCommits.delete(commit.trade.id);
      this.finishTrade(commit.trade, result);
    } catch (error) {
      if (error instanceof InternalApiError && error.status < 500) { this.tradeCommits.delete(commit.trade.id); this.failTrade(commit.trade, error.message); return; }
      commit.sending = false; commit.nextAt = Date.now() + TRADE.RETRY_MS;
      if (commit.attempts >= TRADE.RETRIES) { this.tradeCommits.delete(commit.trade.id); this.failTrade(commit.trade, 'O servidor não confirmou a troca. Confira sua mochila.'); }
    }
  }
  private failTrade(trade: Trade, message: string): void {
    this.trades.close(trade);
    for (const [side, other] of [[trade.a, trade.b], [trade.b, trade.a]] as const) {
      this.log('trade_failed', { playerId: side.userId, with: other.name, reason: message });
      const presence = this.sessions.getByUser(side.userId);
      presence?.client.send('trade.closed', { id: trade.id, status: 'failed', message: `A troca não aconteceu e nada mudou de mãos. ${message}` });
      if (presence) void this.syncPresence(presence).catch(() => {});
    }
  }
  private finishTrade(trade: Trade, result: TradeResult): void {
    this.trades.close(trade);
    // A vehicle out on the street goes to the garage, for its new owner to take from there: its last state goes with it.
    for (const id of [...trade.a.offer.vehicles, ...trade.b.offer.vehicles]) {
      const moto = [...this.state.motos.values()].find(each => each.vehicleId === id);
      if (moto) this.despawnMoto(moto.id, `A moto ${moto.plate} mudou de dono e foi para a garagem.`);
    }
    for (const [side, other] of [[trade.a, trade.b], [trade.b, trade.a]] as const) {
      const now = result.sides[side.userId], presence = this.sessions.getByUser(side.userId), player = this.state.players.get(side.userId);
      this.log('trade_done', { playerId: side.userId, with: other.name, gave: this.offerText(side), got: this.offerText(other) });
      if (!now || !presence) continue;
      this.setInventory(presence, now.stacks); this.setVehicles(presence, now.vehicles);
      const delta = now.balance - presence.balance;
      presence.balance = now.balance;
      this.sendInventory(presence, { balance: now.balance, keys: now.keys });
      presence.client.send('wallet.state', { balance: now.balance, delta, reason: 'trade' });
      presence.client.send('trade.closed', { id: trade.id, status: 'done', message: 'Troca feita.', gave: this.trades.viewFor(trade, side.userId).me, got: this.trades.viewFor(trade, side.userId).them });
      if (player && !now.vehicles.length && !this.canDeliverByHorse(player)) this.stopHighfood(player, 'Você negociou sua última moto.');
      // Anything that crossed this answer on the way in (a drink, say) is read again from the API.
      void this.syncPresence(presence).catch(() => {});
    }
  }
  private offerText(side: Trade['a']): string {
    if (offerIsEmpty(side.offer)) return 'nada';
    return [side.offer.coins ? `${side.offer.coins} moedas` : '', ...side.offer.items.map(({ itemId, quantity }) => `${quantity}× ${itemById(itemId)?.name ?? itemId}`), ...side.vehicles.map(line => `chave ${line.plate}`)].filter(Boolean).join(', ');
  }

  // ---- Highfood ----
  private canDeliverByHorse(player: Player): boolean { return skinBase(player.skin)==='tiao' && !!this.sessions.getByUser(player.id)?.skills.has(HORSE.skill); }
  private foodState(userId: string): HighfoodState {
    const player=this.state.players.get(userId);
    return {...this.highfood.stateOf(userId),horseAvailable:!!player&&this.canDeliverByHorse(player)};
  }
  private sendFood(userId: string): void { this.sessions.getByUser(userId)?.client.send('food.state', this.foodState(userId)); }
  private startHighfood(client: Client): void {
    const player = this.player(client), presence = this.forClient(client)!;
    if (player.courier) throw new Error('Você já está no Highfood.');
    if (!presence.vehicles.length && !this.canDeliverByHorse(player)) throw new Error('Você precisa de uma moto do HighMotors ou de Tião com a habilidade Cavalo comprada na coleção (C).');
    if (player.job) throw new Error('Encerre o turno no bar antes de entrar no Highfood.');
    // A horse courier can collect on foot without owning or taking out a bike.
    const now = Date.now();
    this.highfood.start(player.id, null, now);
    player.courier = true;
    this.sendFood(player.id);
    if (!this.ownMoto(player.id) && !this.canDeliverByHorse(player)) client.send('food.notice', { title: 'Highfood', text: 'Você está online, mas sua moto está na garagem. Tire ela de lá para os pedidos começarem a chegar.' });
    this.log('highfood_online', { playerId: player.id });
    void internal<{ rating: number | null }>('highfood/rating', { userId: player.id }).then(({ rating }) => { const shift = this.highfood.of(player.id); if (shift) shift.rating = rating; }).catch(() => {});
  }
  /** Off the shift (`why` tells the player; '' when they are gone anyway). What was under way is lost. */
  private stopHighfood(player: Player, why: string): void {
    if (!player.courier) return;
    const shift = this.highfood.of(player.id), done = shift?.done ?? 0, earned = shift?.earned ?? 0, order = this.highfood.stop(player.id), presence = this.sessions.getByUser(player.id);
    player.courier = false;
    if (presence) this.closeDialog(player, presence);
    this.dropParcel(player);
    if (order) this.loseOrder(player.id, order, 'left');
    this.sendFood(player.id);
    this.log('highfood_offline', { playerId: player.id, done, earned });
    if (why) presence?.client.send('food.notice', { title: 'Highfood', text: why });
  }
  private acceptOrder(client: Client, orderId: string): void {
    const player = this.player(client), now = Date.now();
    if (!this.ownMoto(player.id) && !this.canDeliverByHorse(player)) throw new Error('Retire sua moto da garagem ou equipe Tião com a habilidade Cavalo antes de aceitar.');
    const order = this.highfood.accept(player.id, orderId, now, player), body = order.profile.skin;
    order.transport=isRidingHorse(player.interactionState)||(!isRidingMoto(player.interactionState)&&!this.ownMoto(player.id)&&this.canDeliverByHorse(player))?'horse':'moto';
    const npc = new Npc().assign({ id: HIGHFOOD_NPC_PREFIX + order.id, displayName: order.customer.name, color: '#fac416', x: order.x, y: order.y, z: order.z, rotation: order.spot.yaw, behavior: 'customer', animationState: 'text', animationStartedAt: now, skin: body });
    this.state.npcs.set(npc.id, npc);
    this.refreshViews();
    this.sendFood(player.id);
    this.log('highfood_accept', { playerId: player.id, customer: order.customer.name, address: order.address, pickup: order.pickup.address, length: order.length });
  }
  /** The customer stops waiting: they turn and go. */
  private releaseCustomer(order: FoodOrder, now: number): void { this.leavingCustomers.set(HIGHFOOD_NPC_PREFIX + order.id, { at: now + 3000, walkFrom: now, yaw: order.spot.yaw + Math.PI }); }
  private loseOrder(userId: string, order: FoodOrder, reason: 'cancelled' | 'gave-up' | 'left'): void {
    this.releaseCustomer(order, Date.now());
    this.log('highfood_lost', { playerId: userId, customer: order.customer.name, reason: reason === 'left' ? 'Saiu do Highfood com o pedido' : reason === 'gave-up' ? 'O cliente desistiu de esperar' : 'Cancelou o pedido' });
    this.unpaid.push({ body: { path: 'highfood/lost', userId, orderId: order.id, customerId: order.customer.id, customer: order.customer.name, restaurant: order.restaurant, items: order.items, address: order.address, length: order.length, reason }, attempts: 0 });
  }
  private cancelFoodOrder(client: Client): void {
    const player = this.player(client), presence = this.forClient(client)!;
    this.closeDialog(player, presence);
    this.dropParcel(player);
    const order = this.highfood.cancel(player.id, Date.now());
    this.loseOrder(player.id, order, 'cancelled');
    this.sendFood(player.id);
  }
  /** The bag goes back to the box: thrown off the bike, back on it, off the shift. An order still at the pickup point stays there; and whoever was taking a bag out stops. */
  private dropParcel(player: Player): void {
    const order = this.highfood.orderOf(player.id);
    if (player.parcel) player.parcel = '';
    if (player.interactionState === FOOD_UNLOAD) { player.interactionState = ''; player.animationState = 'idle'; }
    if (order && order.stage !== 'going' && order.stage !== 'pickup') { order.stage = 'going'; order.unloadEndsAt = undefined; this.sendFood(player.id); }
  }
  /** E at the pickup point's screen, with the order still to be collected. */
  private openLocker(client: Client): void {
    const player = this.player(client), presence = this.forClient(client)!, order = this.highfood.orderOf(player.id);
    if (!order || order.stage !== 'pickup') throw new Error('Você não tem pedido para retirar.');
    if (player.interactionState || player.currentTableId) throw new Error('Encerre a ação atual antes.');
    if (!atPickup(order.pickup, player, INTERACTION_SLACK)) throw new Error('Chegue mais perto da tela do ponto de retirada.');
    player.interactionState = FOOD_LOCKER; player.animationState = 'idle'; player.rotation = Math.atan2(order.pickup.x - player.x, order.pickup.z - player.z);
    presence.queue.length = 0; player.lastProcessedInput = presence.lastReceived; presence.dialogUntil = Date.now() + HIGHFOOD.DIALOG_MS;
    client.send('food.locker', { orderId: order.id });
  }
  /** The code typed on the screen: right, the door opens and the bag comes out. A wrong one costs nothing but typing it again. */
  private typeLockerCode(client: Client, orderId: string, code: string): void {
    const player = this.player(client), presence = this.forClient(client)!, order = this.highfood.orderOf(player.id), now = Date.now();
    if (!order || order.id !== orderId || player.interactionState !== FOOD_LOCKER) throw new Error('Esse pedido não está mais em andamento.');
    if (code !== order.code) { client.send('food.code', { ok: false }); return; }
    presence.dialogUntil = undefined;
    player.interactionState = FOOD_UNLOAD; player.animationState = 'pick'; player.animationStartedAt = now; player.drinkItem = '';
    order.stage = 'collect'; order.unloadEndsAt = now + HIGHFOOD.UNLOAD_MS;
    client.send('food.code', { ok: true });
    this.sendFood(player.id);
    this.log('highfood_pickup', { playerId: player.id, pickup: order.pickup.address });
  }
  private startUnload(player: Player, order: FoodOrder, moto?: Moto): void {
    const now = Date.now(), presence = this.sessions.getByUser(player.id);
    player.interactionState = FOOD_UNLOAD; player.animationState = 'pick'; player.animationStartedAt = now; player.drinkItem = '';
    // Facing the box, behind the seat.
    if(moto)player.rotation = Math.atan2(moto.x - Math.sin(moto.yaw) * .7 - player.x, moto.z - Math.cos(moto.yaw) * .7 - player.z);
    if (presence) { presence.queue.length = 0; player.lastProcessedInput = presence.lastReceived; }
    order.stage = 'unload'; order.unloadEndsAt = now + HIGHFOOD.UNLOAD_MS;
    this.sendFood(player.id);
  }
  /** E beside the bike, near the customer: the bag out of the box (the bike may have been left there some other way than getting off it). */
  private unloadOrder(client: Client): void {
    const player = this.player(client), order = this.highfood.orderOf(player.id), moto = this.ownMoto(player.id);
    if (!order || order.stage !== 'going') throw new Error('Você não tem pedido para pegar no baú.');
    if (player.interactionState || player.currentTableId) throw new Error('Encerre a ação atual antes.');
    if(order.transport==='horse'){
      if(Math.hypot(order.x-player.x,order.z-player.z)>HIGHFOOD.UNLOAD_REACH)throw new Error('Chegue perto do endereço da entrega para pegar o pedido na mochila.');
      this.startUnload(player,order);return;
    }
    if (!moto || moto.phase || motoDistance(moto, player) > MOTO.REACH + 1.2) throw new Error('Chegue perto do baú da sua moto.');
    if (Math.hypot(order.x - player.x, order.z - player.z) > HIGHFOOD.UNLOAD_REACH) throw new Error('Leve a moto até o endereço da entrega.');
    this.startUnload(player, order, moto);
  }
  private talkToCustomer(client: Client): void {
    const player = this.player(client), presence = this.forClient(client)!, order = this.highfood.orderOf(player.id);
    if (!order) throw new Error('Você não tem entrega em andamento.');
    if (order.stage === 'pickup' || order.stage === 'collect') throw new Error('Retire o pedido no ponto de retirada primeiro.');
    if (order.stage !== 'carrying') throw new Error(order.transport==='horse'?'Pegue o pedido na mochila primeiro.':'Pegue o pedido no baú da moto primeiro.');
    if (player.interactionState || player.currentTableId) throw new Error('Encerre a ação atual antes.');
    if (Math.hypot(order.x - player.x, order.z - player.z) > HIGHFOOD.HAND_REACH + INTERACTION_SLACK) throw new Error(`Chegue mais perto de ${order.customer.name}.`);
    player.interactionState = FOOD_TALK; player.animationState = 'idle'; player.rotation = Math.atan2(order.x - player.x, order.z - player.z);
    presence.queue.length = 0; player.lastProcessedInput = presence.lastReceived; presence.dialogUntil = Date.now() + HIGHFOOD.DIALOG_MS;
    const npc = this.state.npcs.get(HIGHFOOD_NPC_PREFIX + order.id);
    if (npc) npc.rotation = Math.atan2(player.x - npc.x, player.z - npc.z);
    client.send('food.dialog', { orderId: order.id, customer: order.customer, line: customerLine(order, player.displayName), items: order.items, restaurant: order.restaurant });
  }
  private closeDialog(player: Player, presence: Presence | undefined): void {
    if (presence) presence.dialogUntil = undefined;
    if (player.interactionState === FOOD_TALK) { player.interactionState = ''; player.animationState = 'idle'; presence?.client.send('food.dialog', null); }
    if (player.interactionState === FOOD_LOCKER) { player.interactionState = ''; player.animationState = 'idle'; presence?.client.send('food.locker', null); }
  }
  private async handOverFood(client: Client, orderId: string): Promise<void> {
    const player = this.player(client), presence = this.forClient(client)!, order = this.highfood.orderOf(player.id), now = Date.now();
    if (!order || order.id !== orderId || player.interactionState !== FOOD_TALK) throw new Error('Essa entrega não está mais em andamento.');
    const moto = this.ownMoto(player.id), wornBox = order.transport!=='horse' && !!moto && readMotoParts(moto.parts).bau < HIGHFOOD.BOX_WORN, onTime = now <= order.promiseAt, crashes = order.crashes;
    // The bag changes hands at once; the money follows.
    presence.dialogUntil = undefined;
    player.parcel = ''; player.animationState = 'use'; player.animationStartedAt = now; presence.gestureEndsAt = now + HIGHFOOD.HANDOVER_MS; presence.gestureState = 'use'; player.interactionState = '';
    const npc = this.state.npcs.get(HIGHFOOD_NPC_PREFIX + order.id);
    if (npc) { npc.parcel = 'bag'; npc.animationState = 'thank'; npc.animationStartedAt = now; this.leavingCustomers.set(npc.id, { at: now + HIGHFOOD.LEAVE_MS, walkFrom: now + HIGHFOOD.LEAVE_MS - 3500, yaw: order.spot.yaw + Math.PI }); }
    const stars = deliveryStars({ length: order.length, onTime, crashes, wornBox });
    this.highfood.delivered(player.id, 0, stars, now);
    this.sendFood(player.id);
    this.achieved(player.id, 'entregador');
    const body = { userId: player.id, orderId: order.id, customerId: order.customer.id, customer: order.customer.name, restaurant: order.restaurant, items: order.items, address: order.address, length: order.length, durationMs: Math.max(0, now - order.acceptedAt), onTime, crashes, wornBox };
    client.send('food.delivered', { customer: order.customer.name, onTime, crashes, wornBox, stars });
    try { this.applyReceipt(await internal<HighfoodReceipt>('highfood/complete', body), player.id, order); }
    catch (error) {
      // The API is away: the same order is paid when it comes back.
      if (error instanceof InternalApiError && error.status < 500) { this.log('highfood_refused', { playerId: player.id, status: error.status }); return; }
      this.unpaid.push({ body: { path: 'highfood/complete', ...body }, attempts: 0 });
    }
  }
  private applyReceipt(receipt: HighfoodReceipt, userId: string, order?: { customer: { name: string }; address: string }): void {
    const presence = this.sessions.getByUser(userId), shift = this.highfood.of(userId);
    if (shift) shift.earned += receipt.paid;
    if (presence && receipt.balance !== undefined) { presence.balance = receipt.balance; presence.client.send('wallet.state', { balance: receipt.balance }); }
    presence?.client.send('food.receipt', receipt);
    this.sendFood(userId);
    this.log('highfood_delivered', { playerId: userId, customer: order?.customer.name ?? receipt.customer, address: order?.address ?? '', stars: receipt.stars, paid: receipt.paid });
  }
  /** The clock of the shifts and of the customers on the pavements. */
  private stepHighfood(now: number): void {
    // Tião remains available while on foot at a locker or a customer's door.
    for (const event of this.highfood.update(now, id => {const player=this.state.players.get(id);return player&&(this.ownMoto(id)||this.canDeliverByHorse(player))?player:undefined;})) {
      if (event.kind === 'changed') this.sendFood(event.userId);
      else if (event.kind === 'missed') {
        const player = this.state.players.get(event.userId);
        if (event.offline && player) { player.courier = false; this.log('highfood_offline', { playerId: player.id, done: 0, earned: 0 }); }
        this.sendFood(event.userId);
        if (event.offline) this.sessions.getByUser(event.userId)?.client.send('food.notice', { title: 'Highfood', text: 'Você ficou offline porque os pedidos ficaram sem resposta. Fique online de novo pelo app.' });
      } else {
        const player = this.state.players.get(event.userId), presence = this.sessions.getByUser(event.userId);
        if (player) { this.closeDialog(player, presence); this.dropParcel(player); }
        this.loseOrder(event.userId, event.order, 'gave-up');
        this.sendFood(event.userId);
        presence?.client.send('food.notice', { title: 'Pedido perdido', text: `${event.order.customer.name} cansou de esperar e cancelou o pedido.` });
      }
    }
    for (const [id, presence] of this.sessions) {
      const player = this.state.players.get(id), order = this.highfood.orderOf(id);
      if (presence.dialogUntil && now >= presence.dialogUntil && player) this.closeDialog(player, presence);
      if (player && (order?.stage === 'unload' || order?.stage === 'collect') && order.unloadEndsAt && now >= order.unloadEndsAt && player.interactionState === FOOD_UNLOAD) {
        const collected = order.stage === 'collect';
        order.stage = 'carrying'; order.unloadEndsAt = undefined; player.interactionState = ''; player.animationState = 'idle'; player.parcel = 'bag';
        this.sendFood(id);
        if (collected) presence.client.send('food.notice', { title: 'Pedido retirado', text: `Leve até ${order.customer.name}. ${this.canDeliverByHorse(player)?'Montando no cavalo, ele vai na mochila.':'Subindo na moto, ele vai no baú.'}` });
      }
    }
    for (const npc of this.state.npcs.values()) if (isCustomerNpc(npc.id)) this.stepCustomer(npc, now);
    // A broken lamp is written down within a second, so a world that dies takes nothing with it but the last moment.
    if (now - this.vehiclesKeptAt >= 1000) {
      this.vehiclesKeptAt = now;
      this.keepVehicles(false);
      if (this.vehicleUpdates.size && !this.savingVehicles) void this.saveVehicles().catch(() => {});
    }
    // A bike whose owner has gone for good goes home.
    for (const [userId, owned] of this.ownedMotos) {
      const player = this.state.players.get(userId);
      if (player?.connected) { owned.goneAt = undefined; continue; }
      owned.goneAt ??= now;
      const moto = this.state.motos.get(owned.motoId);
      if (!moto) { this.ownedMotos.delete(userId); continue; }
      if (now - owned.goneAt >= HIGHFOOD.ABSENT_OWNER_MS && !vehicleOccupants(moto).some(Boolean) && !vehicleMoving(moto)) this.despawnMoto(moto.id, '');
    }
  }
  /** Waiting for the bike, they look up at whoever is coming and wave once; handed over, they wave, turn and go. */
  private stepCustomer(npc: Npc, now: number): void {
    const leaving = this.leavingCustomers.get(npc.id);
    if (leaving && now >= leaving.at) { this.leavingCustomers.delete(npc.id); this.waved.delete(npc.id); this.state.npcs.delete(npc.id); return; }
    if (leaving && now >= leaving.walkFrom) {
      const pace = WALK_SPEED * .7 * TICK_MS / 1000, x = npc.x + Math.sin(leaving.yaw) * pace, z = npc.z + Math.cos(leaving.yaw) * pace;
      npc.rotation = leaving.yaw;
      if (isWalkable(x, z, npc.y)) { npc.x = x; npc.z = z; npc.animationState = 'walk'; } else npc.animationState = 'idle';
      return;
    }
    if (npc.animationState === 'wave' && now - npc.animationStartedAt > WAVE_DURATION_MS) npc.animationState = 'idle';
    if (npc.animationState === 'thank' && now - npc.animationStartedAt > HIGHFOOD.THANK_MS) npc.animationState = 'idle';
    if (leaving) return;
    const order = [...this.highfood.shifts.values()].find(shift => shift.order && HIGHFOOD_NPC_PREFIX + shift.order.id === npc.id), courier = order && this.state.players.get(order.userId);
    if (!courier) return;
    const gap = Math.hypot(courier.x - npc.x, courier.z - npc.z);
    if (gap < 16) {
      const want = Math.atan2(courier.x - npc.x, courier.z - npc.z), turn = Math.atan2(Math.sin(want - npc.rotation), Math.cos(want - npc.rotation));
      npc.rotation += turn * Math.min(1, TICK_MS / 300);
    }
    if (gap < 14 && !this.waved.has(npc.id)) { this.waved.add(npc.id); npc.animationState = 'wave'; npc.animationStartedAt = now; }
  }
  /** Each maintenance round: profiles once a minute, what the API still owes or has yet to hear about the bikes. */
  private async flushHighfood(now: number): Promise<void> {
    if (now - this.customersAt >= CUSTOMERS_EVERY_MS) {
      const { customers } = await internal<{ customers: unknown }>('highfood/customers');
      this.customersAt = now;
      const known = sanitizeCustomers(customers);
      if (known.length) this.customers = known;
    }
    this.keepVehicles(true);
    await this.saveVehicles();
    for (const entry of this.unpaid.splice(0)) {
      const { path, ...body } = entry.body as { path: string } & Record<string, unknown>;
      try {
        const answer = await internal<HighfoodReceipt>(path, body);
        if (path === 'highfood/complete') this.applyReceipt(answer, body.userId as string);
      } catch (error) {
        if (error instanceof InternalApiError && error.status < 500) { this.log('highfood_refused', { playerId: body.userId, status: error.status }); continue; }
        if (++entry.attempts < 200) this.unpaid.push(entry);
        else this.log('highfood_abandoned', { playerId: body.userId, path });
      }
    }
  }

  private beingRepaired(motoId: string): boolean {
    // Someone who left mid-repair does not hold the bike: their avatar stays for a while, working on nothing.
    for (const player of this.state.players.values()) if (player.connected && repairOf(player.interactionState)?.motoId === motoId) return true;
    return false;
  }
  /** Anyone beside a bike that is not moving: one piece from the backpack, a few seconds of work, and that part is better (moto-parts.ts). */
  private async repairMoto(client: Client, motoId: string, part: string): Promise<void> {
    const player = this.player(client), presence = this.forClient(client)!, moto = this.state.motos.get(motoId);
    if (!moto) throw new Error('Essa moto não está aqui.');
    if (player.interactionState || player.currentTableId || player.animationState === 'kick') throw new Error('Encerre a ação atual antes de consertar a moto.');
    if (moto.riderId) throw new Error('Alguém está pilotando essa moto.');
    if (!canRepairMoto(moto, player, INTERACTION_SLACK)) throw new Error('Chegue mais perto da moto, com ela parada.');
    if(!vehicleParts(moto.model).some(p=>p.id===part))throw new Error('Essa peça não pertence a este modelo.');
    const repair=vehicleRepair(moto.model);
    if (readVehicleParts(moto.model,moto.parts)[part]! >= 100) throw new Error('Essa parte está perfeita.');
    if (this.beingRepaired(motoId)) throw new Error('Alguém já está consertando essa moto.');
    if ((presence.inventory.get(repair.item) ?? 0) < repair.pieces) throw new Error(`Você precisa de uma peça de ${isCar(moto)?'carro':'moto'}. A loja da casa vende.`);
    // Taken before the piece is, so nobody gets on the bike while the backpack answers.
    const working = motoRepairInteraction(motoId, part);
    player.interactionState = working; player.animationState = 'use'; player.animationStartedAt = Date.now(); player.drinkItem = '';
    player.rotation = Math.atan2(moto.x - player.x, moto.z - player.z);
    presence.queue.length = 0; player.lastProcessedInput = presence.lastReceived;
    let view: InventoryView;
    try { view = await this.removeInventory(presence, repair.item, repair.pieces, 'use'); }
    catch (error) { if (player.interactionState === working) { player.interactionState = ''; player.animationState = 'idle'; } throw error; }
    if (this.forClient(client) !== presence) return;
    if (player.interactionState === working) presence.interactionEndsAt = Date.now() + repair.ms;
    this.sendInventory(presence, view);
  }

  /** The rider gets off on the left and the bike stays there, unless it is still going too fast. */
  private dismountMoto(player: Player): void {
    if(this.refueling.busyPlayer(player.id))throw new Error('Aguarde o frentista concluir o atendimento.');
    const moto = this.state.motos.get(vehicleOfInteraction(player.interactionState));
    if (!moto) { player.interactionState = ''; player.animationState = 'idle'; return; }
    if (vehicleMotionSpeed(moto) > vehiclePhysics(moto.model).DISMOUNT_SPEED) throw new Error('Diminua a velocidade para sair do veículo.');
    if(isPassenger(player.interactionState)){this.freeMoto(moto,player);return;}
    this.freeMoto(moto, player);
    moto.assign(STOPPED_VEHICLE); moto.steer = 0; moto.lights = 0;
    const order = this.highfood.orderOf(player.id);
    if (order?.stage === 'going' && moto.ownerId === player.id && Math.hypot(order.x - player.x, order.z - player.z) <= HIGHFOOD.UNLOAD_REACH) this.startUnload(player, order, moto);
  }

  private freeMoto(moto: Moto, rider?: Player): void {
    const seat=rider?vehicleSeat(moto,rider.id):-1;
    const riding=!!rider&&(rider.interactionState===motoInteraction(moto.id)||(seat>0&&rider.interactionState===passengerInteraction(moto.id,seat)));
    // Resolve the exit before releasing the seat, so a failed search leaves the current ride intact.
    const exit=riding?motoDismountSpot(moto,Math.max(0,seat),this.motoObstacles(moto)):undefined;
    if(seat>0)moto.passengers[seat-1]='';
    else {moto.riderId='';this.setEngine(moto,MOTO_ENGINE.OFF,Date.now());}
    if(!rider)return;
    if(exit){
      Object.assign(rider,exit);if(isCar(moto))this.openCarDoor(moto,Math.max(0,seat));
      rider.rotation=normalizeHeading(moto.yaw);rider.interactionState='';rider.animationState='idle';rider.animationStartedAt=Date.now();
    }
    const presence = this.sessions.getByUser(rider.id);
    if (presence) { presence.queue.length = 0; presence.motoQueue.length = 0; rider.lastProcessedInput = presence.lastReceived; }
  }

  /** Takes a bike off the map; whoever rides it stands beside where it was. */
  private despawnMoto(id: string, why = 'Um administrador recolheu a moto.'): void {
    const moto = this.state.motos.get(id);
    if (!moto) return;
    if(this.refueling.busy(id))throw new Error('Aguarde o frentista concluir o atendimento.');
    for(const passenger of [...moto.passengers]){const player=this.state.players.get(passenger);if(player)this.freeMoto(moto,player);}
    this.carDoorTimers.delete(id);
    if (moto.ownerId) this.releaseOwned(moto.ownerId);
    const rider = moto.riderId ? this.state.players.get(moto.riderId) : undefined;
    if (rider) {
      this.freeMoto(moto, rider);
      if (why) this.sessions.getByUser(rider.id)?.client.send('error', { message: why });
    }
    const lifter = moto.lifterId ? this.state.players.get(moto.lifterId) : undefined;
    if (lifter?.interactionState === `${LIFTING}${id}`) { lifter.interactionState = ''; lifter.animationState = 'idle'; lifter.animationStartedAt = Date.now(); }
    this.fallenMotos.delete(id);
    this.motoEngines.delete(id);
    this.state.motos.delete(id);
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
    if(this.refueling.busyPlayer(player.id))throw new Error('Aguarde o frentista concluir o atendimento.');
    if (objectId === 'stand') {
      if (isRidingHorse(player.interactionState)) { this.dismountHorse(player,true); return; }
      if (player.animationState === 'kick') throw new Error('Espere o golpe terminar.');
      if (isRidingMoto(player.interactionState)) { this.dismountMoto(player); return; }
      // On the ground after a crash, or lifting a bike: it ends by itself.
      if (player.interactionState === THROWN || player.interactionState.startsWith(LIFTING) || isRepairingMoto(player.interactionState) || player.interactionState === FOOD_UNLOAD) return;
      if (player.interactionState === FOOD_TALK || player.interactionState === FOOD_LOCKER) { this.closeDialog(player, presence); return; }
      // On the stage, standing up is putting the instrument back: the stop clip plays first.
      if (player.interactionState.startsWith('stage-')) { this.musicians.stop(player.id, now); return; }
      if (player.interactionState.startsWith('foosball:')) { this.leaveFoosball(player); return; }
      if (player.interactionState.startsWith('pool:')) { this.leavePool(player); return; }
      if (player.interactionState.startsWith('truco:')) { this.leaveTruco(player); return; }
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
    // The garage is the one place that also opens from on top of a bike.
    if (object.type === 'garage' && (!player.interactionState || isRidingMoto(player.interactionState))) { client.send('garage.state', this.garageView(presence, object.id as GarageView['garageId'])); return; }
    if (player.interactionState) throw new Error('Levante-se antes de interagir.');
    if (object.type === 'blackjack') { this.joinTable(client); return; }
    if (object.type === 'truco') { this.joinTruco(client); return; }
    if (object.type === 'foosball') { this.joinFoosball(client, object.id); return; }
    if (object.type === 'pool') { this.joinPool(client, object.id); return; }
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
    else if (object.type === 'highfood') client.send('food.base', { owned: presence.vehicles.length > 0, out: !!this.ownMoto(player.id), state: this.foodState(player.id) });
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
    this.served.update(now,this.seated,(playerId,item,portion)=>{const player=this.state.players.get(playerId);if(player)this.consume(player,item,now,portion);});
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
    this.achieved(order.playerId,'fregues');
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
        this.achieved(event.playerId,'ajudante');
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
  /** Ends the flight: down to the floor below (or the nearest standing spot if that is inside something). */
  private land(player:Player,presence:Presence):void {
    if(!presence.flying)return;
    presence.flying=false;presence.falling=false;presence.queue.length=0;
    const y=groundBelow(player.x,player.z,player.y)??floorHeight(player.x,player.z)??0,spot=standingPosition({x:player.x,y,z:player.z},player.rotation);
    Object.assign(player,{x:spot.x,y:spot.y??y,z:spot.z,animationState:'idle',animationStartedAt:Date.now()});
    player.lastProcessedInput=presence.lastReceived;
  }
  private requireAdmin(client:Client):string {
    const presence=this.forClient(client);if(presence?.ticket.role!=='admin')throw new Error('Acesso exclusivo da administração.');
    return presence.ticket.userId;
  }
  /** What the in-game administration panel shows to debug the world: people, orders, jobs, devices, queues. */
  private performanceSampler=new ServerPerformanceSampler();
  private adminSnapshot(){
    const now=Date.now();
    return {
      at:now,occupancy:this.state.occupancy,capacity:this.state.capacity,
      environment:{...this.state.environment.toJSON(),currentHour:gameHour(now,this.state.environment),currentWeather:weatherAt(now,this.state.environment)},
      players:[...this.state.players.values()].map(p=>({id:p.id,name:p.displayName,connected:p.connected,x:+p.x.toFixed(1),y:+p.y.toFixed(1),z:+p.z.toFixed(1),
        animation:p.animationState,interaction:p.interactionState,job:p.job,condition:p.condition,balance:this.sessions.getByUser(p.id)?.balance,
        stageMinutes:p.stageUntil?Math.max(0,Math.ceil((p.stageUntil-now)/60_000)):undefined})),
      npcs:[...this.state.npcs.values()].map(n=>({id:n.id,name:n.displayName,behavior:n.behavior,animation:n.animationState,x:+n.x.toFixed(1),z:+n.z.toFixed(1)})),
      waiter:this.waiter.snapshot(),servedItems:this.served.size,counterQueue:[...this.sessions].filter(([,p])=>p.counterCharge).map(([id])=>id),
      jobs:this.jobs.slots().map(slot=>({...slot,...this.jobs.totals.get(slot.id),workers:this.jobs.workers(slot.id).map(s=>({playerId:s.playerId,tasks:s.tasks,earned:s.earned,station:s.task.station.label,endsInS:Math.round((s.endsAt-now)/1000),
        orders:s.orders.map(o=>({...publicOrder(o.order),customer:o.customer,table:o.table,picked:o.picked}))}))})),
      dirtyTables:this.served.dirtyTables(),
      highfood:[...this.highfood.shifts.values()].map(s=>({playerId:s.userId,name:this.state.players.get(s.userId)?.displayName??s.userId.slice(0,8),status:s.status,done:s.done,earned:s.earned,order:s.order?.customer.name??'',address:s.order?.address??''})),
      motos:[...this.state.motos.values()].map(m=>({model:m.model,color:m.color,occupants:vehicleOccupants(m).filter(Boolean).length,owner:m.ownerId?m.ownerName||m.ownerId.slice(0,8):'',plate:m.plate,locked:m.locked,id:m.id,x:+m.x.toFixed(1),y:+m.y.toFixed(1),z:+m.z.toFixed(1),speed:+m.speed.toFixed(1),phase:m.phase,riderId:m.riderId,rider:m.riderId?this.state.players.get(m.riderId)?.displayName??'':''})),
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
    if(!presence.inventory.get('rojao')){const player=this.state.players.get(presence.ticket.userId);if(player)player.fireworkEquipped=false;}
  }
  private sendInventory(presence:Presence,view?:Partial<InventoryView>):void {
    const stacks=[...presence.inventory].map(([itemId,quantity])=>({itemId,quantity}));
    presence.client.send('inventory.state',{capacity:INVENTORY_CAPACITY,usedSlots:stacks.length,keys:presence.vehicles.map(vehicle=>({vehicleId:vehicle.id,plate:vehicle.plate,name:vehicle.name})),...view,stacks});
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
    if(itemId==='rojao'){
      if(player.fireworkEquipped){player.fireworkEquipped=false;return;}
      if(!this.canFirework(player)||presence.inventoryBusy)throw new Error('Fique de pé e libere as mãos para equipar o rojão.');
      if(!(presence.inventory.get('rojao')??0))throw new Error('Você não tem rojão na mochila.');
      player.fireworkEquipped=true;return;
    }
    if(player.fireworkEquipped)throw new Error('Guarde o rojão com R antes de usar outro item.');
    if(player.interactionState||player.currentTableId||player.animationState==='kick')throw new Error('Encerre a ação atual antes de usar um item.');
    if(item.category==='peca')throw new Error('Essa peça se usa na moto: botão direito nela, Informações do veículo.');
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

  private canFirework(player:Player):boolean {
    return player.connected&&isConscious(player)&&!this.deaths.isDead(player.id)&&!player.interactionState&&!player.currentTableId&&!player.holding&&!player.carrying&&!player.parcel&&!player.looking&&!player.phone&&['idle','walk','run'].includes(player.animationState);
  }
  private async fireFirework(client:Client,direction:FireworkVector):Promise<void> {
    const player=this.player(client),presence=this.forClient(client)!,now=Date.now();
    if(!player.fireworkEquipped||!this.canFirework(player))throw new Error('Equipe o rojão na mochila e libere as mãos para disparar.');
    if(presence.inventoryBusy||now-(presence.fireworkAt??0)<FIREWORK.cooldownMs)throw new Error('Aguarde para soltar outro rojão.');
    const length=Math.hypot(direction.x,direction.y,direction.z);
    const unit={x:direction.x/length,y:direction.y/length,z:direction.z/length};
    const origin=fireworkOrigin(player,player.rotation);
    const view=await this.removeInventory(presence,'rojao',1,'use');
    if(this.forClient(client)!==presence)return;
    presence.fireworkAt=Date.now();
    this.sendInventory(presence,view);
    const shot:FireworkShot={id:randomUUID(),playerId:player.id,launchedAt:Date.now(),origin,direction:unit,flightMs:fireworkFlightMs(origin,unit),hue:randomInt(360)};
    this.broadcast('firework.shot',shot);
    client.send('inventory.result',{action:'use',itemId:'rojao',quantity:1});
  }

  /** A backpack item used at once, a toilet or urinal visit, getting up from a chair, a cigarette put out or smoked whole, or being sick ran its full time. */
  private finishInteraction(player: Player, presence: Presence, now: number): void {
    presence.interactionEndsAt = undefined;
    if (player.animationState === 'stand-up') { this.finishStandUp(player); return; }
    if (player.animationState === 'cigarette' || player.animationState === 'smoke-stop') this.achieved(player.id, 'fumante');
    const repair = repairOf(player.interactionState), repaired = repair && this.state.motos.get(repair.motoId);
    if (repair && repaired) {
      const parts = readVehicleParts(repaired.model,repaired.parts);
      parts[repair.part] = Math.min(100, parts[repair.part]! + vehicleRepair(repaired.model).amount);
      repaired.parts = writeVehicleParts(repaired.model,parts);
      if (repaired.ownerId) this.markOwned(repaired.ownerId, true);
      this.achieved(player.id, 'mecanico');
      this.log('moto_repair', { playerId: player.id, moto: repaired.id, part: repair.part, condition: Math.round(parts[repair.part]) });
    }
    if(presence.inventoryItem){const used=presence.inventoryItem;this.consume(player,used,now);presence.client.send('inventory.result',{action:'use',itemId:used,quantity:1});presence.inventoryItem=undefined;}
    if (player.interactionState.startsWith('toilet-') || player.interactionState.startsWith('mictorio-')) {
      if (player.bladder >= ACHIEVEMENT_BLADDER_MIN) this.achieved(player.id, 'bexiga-solta');
      this.needs.relieve(player, now);
    }
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
    if (portion >= HOLDING_SIP || (progress >= 1 && portion > 0)) { this.holdingConsumed.set(player.id, progress); this.consume(player, item, now, portion); }
    if (progress < 1) return;
    this.dropHolding(player);
    if (!player.interactionState && !player.currentTableId && isConscious(player) && this.needs.sick(player, item, now)) this.startVomiting(player, presence, now);
  }
  /** Ending a toilet visit, or a backpack item used at once, early counts the part already done. */
  private consumePart(player: Player, presence: Presence, now: number): void {
    if(presence.inventoryItem){this.consume(player,presence.inventoryItem,now,(now-player.animationStartedAt)/Math.max(1,(presence.interactionEndsAt??now)-player.animationStartedAt));presence.inventoryItem=undefined;}
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
    this.achieved(player.id, 'passou-mal');
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
    if (player.interactionState.startsWith('truco:')) this.leaveTruco(player);
    if (player.interactionState.startsWith('pool:')) this.leavePool(player);
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
    // HP and its heart ran out: the Morte comes for them (and if there is no body to take, life goes on).
    if (event.type === 'died') { if (!this.deaths.kill(player.id, 'vida')) this.needs.revive(player, now); return; }
    if (event.type === 'faint' || event.type === 'stumble') {
      this.knockDown(player, presence);
      player.interactionState = event.type === 'faint' ? 'fainted' : 'stumbling';
      player.animationState = event.type==='faint'?'fallen':'stumble'; player.animationStartedAt = now;
    }
    if (event.type === 'faint') {
      this.log('faint', { playerId: player.id, cause: event.cause });
      if (event.cause === 'alcohol') { this.achieved(player.id, 'apagou'); presence.recoveryMoveAt = now + NEEDS.faint.moveAfterSeconds * 1000; this.systemMessage(`${player.displayName} bebeu demais e apagou.`, player); }
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
    // Counted as it starts: a video taken out of the queue gets its coins back and never counted.
    if(next.key&&next.key!==schema.key&&next.by)this.achieved(next.by,'dj-de-boteco');
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

  // ── Truco ────────────────────────────────────────────────────────────────────────────────────────────────────────

  /** A whole match, after the final score: only the winning people still at the table earn a victory. */
  private trucoMatch(summary: TrucoSummary): void {
    this.log('truco_match', { ...summary, score: summary.score.join(' x ') });
    for (const player of summary.players) if (player.won) this.achieved(player.id, 'rei-do-truco');
  }

  /** E at the truco table: a chair, and the panel opens. The table says where; a match in play has no chair to give. */
  private joinTruco(client: Client): void {
    const player = this.player(client), object = INTERACTABLES.find(i => i.id === 'truco-1')!;
    if (this.truco.seatOf(player.id) >= 0) { this.truco.refresh(player.id); return; }
    if (!canInteract(object, player, INTERACTION_SLACK)) throw new Error('Chegue mais perto da mesa de truco.');
    if (player.interactionState || player.currentTableId) throw new Error('Encerre a ação atual antes de jogar.');
    if (player.animationState === 'kick') throw new Error('Espere o golpe terminar.');
    this.truco.join({ id: player.id, name: player.displayName, color: player.color });
    this.seatAtTruco(player);
    player.interactionState = 'truco:truco-1'; player.drinkItem = '';
    const presence = this.forClient(client)!;
    presence.gestureEndsAt = undefined; presence.queue.length = 0; player.lastProcessedInput = presence.lastReceived;
    this.truco.refresh(player.id);
    this.systemMessage(`${player.displayName} sentou na mesa de truco.`, player);
  }
  private seatAtTruco(player: Player): void {
    const seat = TRUCO_SEATS[this.truco.seatOf(player.id)]!;
    player.x = seat.x; player.y = seat.y ?? player.y; player.z = seat.z; player.rotation = seat.rotation;
    player.animationState = 'sit'; player.animationStartedAt = Date.now();
  }
  /** Up from the table; in a match, an NPC takes the seat and the stake stays behind. */
  private leaveTruco(player: Player): void {
    if (!player.interactionState.startsWith('truco:')) return;
    this.truco.leave(player.id);
    Object.assign(player, standingPosition(player, player.rotation));
    player.interactionState = ''; player.animationState = 'idle'; player.animationStartedAt = Date.now();
    const presence = this.sessions.getByUser(player.id);
    if (presence) { presence.queue.length = 0; player.lastProcessedInput = presence.lastReceived; }
  }
  /** Whoever is no longer sitting there gives the seat up, by whatever way they left it; the avatar of someone seatless stands. */
  private checkTruco(): void {
    for (const person of this.truco.people) {
      if (this.state.players.get(person.id)?.interactionState !== 'truco:truco-1') this.truco.leave(person.id);
    }
    for (const player of this.state.players.values()) if (player.interactionState.startsWith('truco:') && this.truco.seatOf(player.id) < 0) this.leaveTruco(player);
  }
  /** The player at the truco table, or why they cannot play. */
  private atTruco(client: Client): Player {
    const player = this.player(client);
    if (!player.interactionState.startsWith('truco:')) throw new Error('Sente-se à mesa de truco primeiro.');
    return player;
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
    if (!summary.forfeit) for (const p of summary.players) if (p.result === 'win') this.achieved(p.playerId, 'craque-do-pebolim');
    const origin = this.state.players.get(summary.players[0]?.playerId ?? ''), winner = table.winner;
    if (!origin || !winner) return;
    const names = table.slots.filter(s => s.team === winner && (s.playerId || s.cpu)).map(s => s.displayName);
    this.systemMessage(`Pebolim, mesa ${place.number}: ${names.join(' e ')} (${TEAM_NAMES[winner]}) venceu por ${summary.score}${summary.forfeit ? ', por W.O.' : ''}${summary.stake ? `, valendo ${summary.stake} moedas` : ''}.`, origin);
  }

  // ── Sinuca ───────────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * E at a pool table: a free seat (the avatar goes to its side of the table), or the other seat before the match. A
   * table in a match, or full, is watched from beside it instead (pool.open says which).
   */
  private joinPool(client: Client, tableId: string, seat?: number): void {
    const player = this.player(client), presence = this.forClient(client)!, table = this.pool.get(tableId);
    if (!table) throw new Error('Mesa de sinuca desconhecida.');
    const here = table.seatOf(player.id);
    if (!here) {
      if (!this.nearPool(player, tableId)) throw new Error('Chegue mais perto da mesa de sinuca.');
      if (player.interactionState || player.currentTableId) throw new Error(player.interactionState.startsWith('pool:') ? 'Você já está em outra mesa de sinuca.' : 'Encerre a ação atual antes de jogar.');
      if (player.animationState === 'kick') throw new Error('Espere o golpe terminar.');
    }
    try {
      if (here && seat !== undefined) table.move(player.id, seat);
      else if (!here) table.join(player.id, player.displayName, seat);
    } catch (error) {
      if (here) throw error;
      presence.watching = tableId;
      client.send('pool.open', { tableId, watching: true, reason: error instanceof Error ? error.message : '' });
      this.syncPool();
      return;
    }
    presence.watching = undefined;
    player.interactionState = `pool:${tableId}`; player.animationState = 'wait'; player.animationStartedAt = Date.now(); player.drinkItem = '';
    presence.gestureEndsAt = undefined; presence.queue.length = 0; player.lastProcessedInput = presence.lastReceived;
    client.send('pool.open', { tableId, watching: false });
    this.syncPool();
    if (!here) this.systemMessage(`${player.displayName} chegou na mesa ${POOL_TABLES.find(t => t.id === tableId)!.number} da sinuca.`, player);
  }

  /** Off the table (or stops watching): a step back from its side of the table. */
  private leavePool(player: Player): void {
    const presence = this.sessions.getByUser(player.id);
    if (presence?.watching?.startsWith('sinuca-')) presence.watching = undefined;
    if (!player.interactionState.startsWith('pool:')) return;
    const id = player.interactionState.slice('pool:'.length), table = this.pool.get(id), place = POOL_TABLES.find(t => t.id === id);
    const seat = table?.seatOf(player.id)?.seat ?? 0;
    table?.leave(player.id);
    if (place) { const exit = poolExit(place, seat); Object.assign(player, isWalkable(exit.x, exit.z, exit.y) ? exit : standingPosition(player, player.rotation)); }
    player.interactionState = ''; player.animationState = 'idle'; player.animationStartedAt = Date.now();
    if (presence) { presence.queue.length = 0; player.lastProcessedInput = presence.lastReceived; }
    this.syncPool();
  }

  /** Touching the table (to play), or close by on its floor (to watch). */
  private nearPool(player: Player, tableId: string): boolean {
    const object = INTERACTABLES.find(i => i.id === tableId), place = POOL_TABLES.find(t => t.id === tableId);
    if (!object || !place) return false;
    return canInteract(object, player, INTERACTION_SLACK) || (Math.abs(player.y - place.y) < 1 && Math.hypot(player.x - place.x, player.z - place.z) < 4);
  }

  /** The player at a pool table, and the table, or why they cannot play. */
  private atPool(client: Client): { player: Player; table: PoolTable } {
    const player = this.player(client), table = player.interactionState.startsWith('pool:') ? this.pool.get(player.interactionState.slice('pool:'.length)) : undefined;
    if (!table?.seatOf(player.id)) throw new Error('Pegue um lugar numa mesa de sinuca primeiro.');
    return { player, table };
  }

  /** Seats whose player is no longer at the table (moved, knocked down) are given up; avatars left without a seat get up. */
  private checkPool(): void {
    for (const [id, table] of this.pool) for (const seat of table.humans) {
      const player = this.state.players.get(seat.playerId);
      if (!player || player.interactionState !== `pool:${id}`) table.leave(seat.playerId);
    }
    for (const player of this.state.players.values())
      if (player.interactionState.startsWith('pool:') && !this.pool.get(player.interactionState.slice('pool:'.length))?.seatOf(player.id)) this.leavePool(player);
  }

  /** Who gets a table's view and strokes: its players, whoever watches it, and everyone near it on its floor (the 3D balls). */
  private poolAudience(tableId: string): Array<[string, Presence]> {
    const place = POOL_TABLES.find(t => t.id === tableId)!, table = this.pool.get(tableId)!, out: Array<[string, Presence]> = [];
    for (const [id, presence] of this.sessions) {
      const player = this.state.players.get(id);
      if (!player?.connected || presence.revoked) continue;
      const distance = Math.hypot(player.x - place.x, player.z - place.z);
      // Whoever walked away stops watching.
      if (presence.watching === tableId && distance > 8) presence.watching = undefined;
      if (table.seatOf(id) || presence.watching === tableId || (Math.abs(player.y - place.y) < 1.5 && distance < AOI_RADIUS)) out.push([id, presence]);
    }
    return out;
  }

  /** Each table's view to whoever has not seen its latest revision (and the stroke rolling, to whoever came midway); players at their places. */
  private syncPool(): void {
    for (const [id, table] of this.pool) {
      const place = POOL_TABLES.find(t => t.id === id)!;
      for (const seat of table.humans) {
        const player = this.state.players.get(seat.playerId), spot = poolSpot(place, seat.seat);
        if (player && Math.hypot(player.x - spot.x, player.z - spot.z) + Math.abs(player.rotation - spot.rotation) > .01) Object.assign(player, spot);
      }
      let view: ReturnType<PoolTable['snapshot']> | undefined;
      for (const [, presence] of this.poolAudience(id)) {
        presence.poolSeen ??= new Map();
        const seen = presence.poolSeen.get(id) ?? { revision: -1, shot: -1 };
        if (seen.revision === table.revision) continue;
        view ??= table.snapshot();
        presence.client.send('pool.view', view);
        if (table.phase === 'rolling' && table.lastShot && seen.shot !== table.lastShot.shot) { presence.client.send('pool.shot', table.lastShot); seen.shot = table.lastShot.shot; }
        seen.revision = table.revision; presence.poolSeen.set(id, seen);
      }
    }
  }

  /** A stroke struck: its view and its recorded paths, at once, to the table's audience. */
  private sendPoolShot(shot: PoolShotView): void {
    const table = this.pool.get(shot.tableId)!, view = table.snapshot();
    for (const [, presence] of this.poolAudience(shot.tableId)) {
      presence.poolSeen ??= new Map();
      presence.client.send('pool.view', view);
      presence.client.send('pool.shot', shot);
      presence.poolSeen.set(shot.tableId, { revision: table.revision, shot: shot.shot });
    }
  }

  /** A finished rack: in the log for each player, and told to the bar around the table. */
  private poolMatch(summary: PoolSummary): void {
    const place = POOL_TABLES.find(t => t.id === summary.tableId)!;
    for (const p of summary.players) this.log('pool_match', { playerId: p.playerId, roundId: summary.matchId, table: place.number, seat: p.seat, result: p.result, rack: summary.rack,
      reason: summary.reason, forfeit: summary.forfeit, cpu: summary.cpu, stake: summary.stake, paid: p.paid, net: summary.stake ? p.paid - summary.stake : 0 });
    if (!summary.forfeit) for (const player of summary.players) if (player.result === 'win') this.achieved(player.playerId, 'mestre-da-sinuca');
    const origin = this.state.players.get(summary.players[0]?.playerId ?? '');
    if (origin) this.systemMessage(`Sinuca, mesa ${place.number}: ${summary.winner} venceu ${summary.loser} (${summary.reason.charAt(0).toLowerCase()}${summary.reason.slice(1)})${summary.stake ? `, valendo ${summary.stake} moedas` : ''}.`, origin);
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
    // The players as plain numbers, once: the nearest FULL_DETAIL_MAX of each viewer are models, the rest of the crowd sprites.
    const sendCrowd = this.viewRound++ % 2 === 0, t0 = performance.now();
    let tModels = 0, tSprites = 0, tViews = 0;
    const entries: CrowdEntry[] = [], byId = new Map<string, CrowdEntry>();
    for (const player of this.state.players.values()) {
      const state = player.interactionState;
      const grouped = player.currentTableId || /^(?:foosball|pool|truco):[^:]+/.exec(state)?.[0] || '';
      const entry: CrowdEntry = { id: player.id, slot: player.slot, x: player.x, y: player.y, z: player.z, rotation: player.rotation, skin: crowdSkinIndex(player.skin),
        gait: player.animationState === 'run' ? 2 : player.animationState === 'walk' ? 1 : 0,
        // A rider is seen as far as the bike is (the bikes have no area of interest), not a bike riding itself.
        rider: isRidingMoto(state) || state === THROWN, noSprite: state !== '' && state !== 'smoke' && !isRidingMoto(state) && state !== THROWN, group: grouped };
      entries.push(entry); byId.set(entry.id, entry);
    }
    this.crowd.build(entries, sendCrowd);
    this.performanceSampler.recordPhase('views:entries', performance.now() - t0);
    for (const [id, presence] of this.sessions) {
      const self = this.state.players.get(id), viewer = byId.get(id);
      if (!self || !viewer || !presence.client.view) continue;
      let t = performance.now();
      const models = this.crowd.models(viewer, new Set([...presence.seen].map(item => (item as { id?: string }).id ?? '')));
      const visible = new Set<Schema>();
      for (const modelId of models) { const player = this.state.players.get(modelId); if (player) visible.add(player); }
      tModels += performance.now() - t; t = performance.now();
      if (sendCrowd) {
        const sprites = this.crowd.sprites(viewer, models), last = presence.crowdSent;
        if (sprites.length !== (last?.length ?? 0) || (last && Buffer.compare(sprites, last) !== 0)) { presence.client.sendBytes('crowd', sprites); presence.crowdSent = sprites; }
      }
      tSprites += performance.now() - t; t = performance.now();
      const customer = this.highfood.orderOf(id)?.id;
      for (const npc of this.state.npcs.values()) if (distance(self, npc) <= AOI_RADIUS || (customer && npc.id === HIGHFOOD_NPC_PREFIX + customer)) visible.add(npc);
      for (const old of presence.seen) if (!visible.has(old)) presence.client.view.remove(old);
      for (const item of visible) if (!presence.seen.has(item)) presence.client.view.add(item);
      presence.seen = visible;
      tViews += performance.now() - t;
    }
    this.performanceSampler.recordPhase('views:models', tModels); this.performanceSampler.recordPhase('views:sprites', tSprites); this.performanceSampler.recordPhase('views:diff', tViews);
  }

  private async maintenance(): Promise<void> {
    if (this.maintenanceBusy) return;
    this.maintenanceBusy = true;
    try {
      this.sessions.pruneExpiredNonces(Date.now());
      // One /validate per player every 3 s was N API requests (each several queries) in one burst per round: the cost of a
      // crowd landed on the API, not on the room. Each session is confirmed every config.accessRecheckMs (12 s) instead (bans and kicks
      // do not wait for it: they arrive as controls on every round), the oldest first, a few at a time.
      const nowMs = Date.now();
      const due = [...this.sessions].filter(([, p]) => nowMs - (p.validatedAt ?? 0) >= this.config.accessRecheckMs).sort((a, b) => (a[1].validatedAt ?? 0) - (b[1].validatedAt ?? 0)).slice(0, ACCESS_RECHECKS_PER_ROUND);
      const checks = await mapLimit(due, ACCESS_RECHECK_PARALLEL, async ([id, p]) => {
        const access = await validateAccess(p.ticket.sessionId, id);
        p.validatedAt = Date.now();
        // The snapshot may be stale after a takeover. In particular, an invalid response for the
        // previous API session must never expel the presence that replaced it while this awaited.
        if (p.revoked || !this.sessions.isCurrent(id, p)) return;
        if (!access.valid){if(access.banned)this.removeByAdmin(id,'ban','Sua conta está banida do bar.');else this.expel(id, 'Sua sessão terminou ou a conta foi suspensa.');}
        else { p.blocked = new Set(access.blocked); p.ticket.role = access.role;const player=this.state.players.get(id);if(player)this.applyAppearance(player,access); }
      });
      if (checks.some(r => r.status === 'rejected')) this.log('auth_refresh_unavailable', {});
      const { applied, failed } = await this.controls.poll(control => this.applyControl(control));
      health.apiOkAt = Date.now();
      if (applied.length) worldMetrics.inc('bar_world_controls_total', 'Administrative controls confirmed', { outcome: 'applied' }, applied.length);
      if (failed.length) worldMetrics.inc('bar_world_controls_total', 'Administrative controls confirmed', { outcome: 'failed' }, failed.length);
      for (const id of failed) this.log('event_control_rejected', { id });
      await this.results.flush();
      await this.blackjackBank.flush();
      await this.foosballBank.flush();
      await this.trucoBank.flush();
      await this.poolBank.flush();
      await this.walletRetries.flush();
      await this.refueling.recover();
      // Prices and the log never hold up payments and results: they try again next round.
      if (!this.pricesLoaded) await this.reloadPrices().catch((error: unknown) => this.log('prices_unavailable', { message: error instanceof Error ? error.message : String(error) }));
      await this.flushHighfood(Date.now()).catch((error: unknown) => this.log('highfood_unavailable', { message: error instanceof Error ? error.message : String(error) }));
      await this.flushLogs().catch(() => {});
      await this.flushAchievements().catch((error: unknown) => this.log('achievements_unavailable', { message: error instanceof Error ? error.message : String(error) }));
    } catch (e) {
      worldMetrics.inc('bar_world_maintenance_failures_total', 'Maintenance rounds that failed (API unreachable or refused)');
      this.log('maintenance_retry', { message: e instanceof Error ? e.message : 'error', requestId: (e as { requestId?: string }).requestId });
    }
    finally { this.maintenanceBusy = false; }
  }

  /** Development bots earn nothing. */
  private achieved(userId: string, series: string, amount = 1): void {
    if (this.botIds.has(userId)) return;
    this.achievements.add(userId, series, amount);
    // What the Morte says to a player follows what they did most this session (SERIES_CATEGORY).
    const category = SERIES_CATEGORY[series];
    if (category) { const counts = this.deathActivity.get(userId) ?? {}; counts[category] = (counts[category] ?? 0) + (series === 'motoboy' ? amount / 50 : amount); this.deathActivity.set(userId, counts); }
  }

  /** Holds the victim's body still for the whole death, out of tables, chairs, bikes and shifts. */
  private holdForDeath(id: string, state: typeof DEATH_STATE | typeof DEATH_GONE_STATE): void {
    const player = this.state.players.get(id), presence = this.sessions.getByUser(id);
    if (!player) return;
    const now = Date.now();
    if (state === DEATH_STATE) {
      const moto = this.state.motos.get(vehicleOfInteraction(player.interactionState));
      if (moto) { const driver = !isPassenger(player.interactionState); this.freeMoto(moto, player); if (driver) { moto.assign(STOPPED_VEHICLE); moto.steer = 0; moto.lights = 0; } }
      if (presence) this.knockDown(player, presence);
      this.park(player);
      player.animationState = 'idle'; player.animationStartedAt = now; player.looking = false;
    }
    player.interactionState = state;
    if (presence) { presence.interactionEndsAt = undefined; presence.gestureEndsAt = undefined; presence.queue.length = 0; player.lastProcessedInput = presence.lastReceived; }
  }
  /** The scene goes to everyone near the victim, and to the victim. Nothing is replayed to someone who arrives later. */
  private broadcastDeath(plan: DeathPlan): void {
    for (const [id, presence] of this.sessions) {
      const other = this.state.players.get(id);
      if (!other?.connected || presence.revoked) continue;
      if (id === plan.victim || (Math.abs(other.y - plan.vy) < 6 && Math.hypot(other.x - plan.vx, other.z - plan.vz) <= Math.max(AOI_RADIUS, SCENE_AUDIO_RADIUS))) presence.client.send('death.scene', plan);
    }
  }
  /** A random walkable place, 6 m or more from where the Morte stood and clear of other players; the body stands up there, free. */
  private respawnAfterDeath(id: string, avoid: { x: number; z: number }): void {
    const player = this.state.players.get(id), presence = this.sessions.getByUser(id);
    if (!player) return;
    const others = [...this.state.players.values()].filter(p => p !== player && p.connected), anchor = MAP_MARKERS.Spawn_Jogador;
    let spot = findSpawn(others, anchor);
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = Math.random() * Math.PI * 2, reach = Math.sqrt(Math.random()) * 28;
      try {
        const candidate = findSpawn(others, { x: anchor.x + Math.cos(angle) * reach, y: anchor.y, z: anchor.z + Math.sin(angle) * reach });
        if (Math.hypot(candidate.x - avoid.x, candidate.z - avoid.z) >= 6) { spot = candidate; break; }
      } catch { /* no free place round this anchor: try another */ }
    }
    Object.assign(player, spot);
    player.rotation = Math.random() * Math.PI * 2;
    player.interactionState = ''; player.animationState = 'idle'; player.animationStartedAt = Date.now();
    this.needs.revive(player, Date.now());
    if (presence) { presence.queue.length = 0; player.lastProcessedInput = presence.lastReceived; }
  }
  /** Having something: its effects, and its part towards the badges of what is being had. */
  private consume(player: Player, item: string, now: number, portion = 1): void {
    this.needs.consume(player, item, now, portion);
    const series = seriesOfItem(item);
    if (series) this.achieved(player.id, series, portion);
  }
  /** What counts by how long it lasts is read every few seconds: being in the city, dancing, playing on the stage. */
  private countTime(now: number): void {
    const seconds = Math.min(ACHIEVEMENT_SAMPLE_MS * 2, now - this.achievementsAt) / 1000;
    this.achievementsAt = now;
    for (const [id, presence] of this.sessions) {
      const player = this.state.players.get(id);
      if (!player?.connected || presence.revoked) continue;
      this.achieved(id, 'frequentador', seconds);
      if (player.animationState === 'dance') this.achieved(id, 'pe-de-valsa', seconds);
      if (player.animationState === 'stage') this.achieved(id, 'estrela-do-palco', seconds);
    }
  }
  /** Reports what was done, and tells whoever is here about the badges they got (from any source, the phone and the administration included). */
  private async flushAchievements(): Promise<void> {
    const events = this.achievements.take(), online = [...this.sessions].filter(([, presence]) => !presence.revoked && !presence.ticket.bot).map(([id]) => id);
    if (!events.length && !online.length) return;
    let answer: { unlocked?: Array<{ userId: string; badge: Badge }> };
    try { answer = await internal('achievements', { events, online }); }
    catch (error) {
      // A refusal would be the same next time; anything else waits for the next round.
      if (!(error instanceof InternalApiError && error.status < 500)) this.achievements.giveBack(events);
      throw error;
    }
    for (const { userId, badge } of answer.unlocked ?? []) this.celebrate(userId, badge);
  }
  /** The player hears it with the card a click away; the bar hears about the rarer ones, and all of it about the rarest. */
  private celebrate(userId: string, badge: Badge): void {
    const presence = this.sessions.getByUser(userId), player = this.state.players.get(userId);
    if (!presence || !player) return;
    presence.client.send('achievement.unlocked', { badge });
    this.log('achievement', { playerId: userId, badge: badge.name });
    if (badge.rarity === 'legendary') this.systemMessage(`${player.displayName} conquistou o emblema lendário ${badge.name}!`);
    else if (badge.rarity === 'rare' || badge.rarity === 'epic') this.systemMessage(`${player.displayName} conquistou o emblema ${badge.name}.`, player);
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
    // A vehicle bought on the phone is in the garage already; one that is no longer theirs (the administration took it back) leaves the map.
    const id = presence.ticket.userId, list = access.vehicles ?? [], out = this.ownMoto(id);
    if (out && !list.some(vehicle => vehicle.id === out.vehicleId)) this.despawnMoto(out.id, '');
    this.setVehicles(presence, list);
    const owned = this.ownedMotos.get(id), moto = owned && this.state.motos.get(owned.motoId), held = owned && presence.vehicles.find(vehicle => vehicle.id === owned.vehicleId);
    if (moto && held) { held.parts = moto.parts; held.mileage = Math.round(owned!.mileage);held.fuel=moto.fuel; }
    if (player && !list.length && !this.canDeliverByHorse(player)) this.stopHighfood(player, 'Você precisa de uma moto ou de Tião com a habilidade Cavalo para continuar no Highfood.');
    this.sendInventory(presence);
    presence.client.send('food.owned', { owned: list.length > 0 });
  }

  /** One administrative control. Throws to reject it for good (the API records it as failed). */
  private applyControl(control: Control): void {
    if (control.action === 'prices') { this.pricesLoaded = false; return; }
    if (control.action === 'kill') {
      // The kill really takes the life: HP, ring and heart, to zero, and then the Morte comes.
      if (control.playerId && this.deaths.kill(control.playerId, 'admin')) { const target = this.state.players.get(control.playerId); if (target) this.needs.kill(target, Date.now()); }
      return;
    }
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
    const hadHorse=this.canDeliverByHorse(player);
    // What the skill handler checks. The API answers it with the collection, so it is always this fresh: bought in the collection, it works at once.
    const presence=access.ownedSkills?this.sessions.getByUser(player.id):undefined;
    if(presence)presence.skills=new Set(access.ownedSkills);
    // A response without the collection (invalid session) leaves the avatar as it is.
    if(player.animationState==='kick'||!access.ownedSkins)return;
    const requested=access.equippedSkin??DEFAULT_SKIN,next=access.ownedSkins.includes(requested)?requested:DEFAULT_SKIN;
    if(isRidingHorse(player.interactionState)&&(skinBase(next)!=='tiao'||!access.ownedSkills?.includes(HORSE.skill)))this.dismountHorse(player);
    player.skin=next;
    if(hadHorse!==this.canDeliverByHorse(player)){
      const vehicles=access.vehicles??this.sessions.getByUser(player.id)?.vehicles;
      if(!this.canDeliverByHorse(player)&&!vehicles?.length)this.stopHighfood(player,'Equipe Tião com a habilidade Cavalo ou tenha uma moto para continuar no Highfood.');
      this.sendFood(player.id);
    }
  }

  private dismountHorse(player:Player,unload=false):void {
    player.interactionState='';player.skill='';player.animationState='idle';player.animationStartedAt=Date.now();player.horseRearAt=0;
    const presence=this.sessions.getByUser(player.id);
    if(presence){presence.queue.length=0;presence.horseRearHeld=false;player.lastProcessedInput=presence.lastReceived;}
    const order=this.highfood.orderOf(player.id);
    if(unload&&order?.stage==='going'&&order.transport==='horse'&&Math.hypot(order.x-player.x,order.z-player.z)<=HIGHFOOD.UNLOAD_REACH)this.startUnload(player,order);
  }

  private recordResult(roundId: string, userId: string, result: Result): void {
    const outcome: MatchResult = result === 'push' ? 'draw' : result;
    if (result === 'win') this.achieved(userId, 'rei-do-21');
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
    // Frames share the socket with voice and game state. Drop new video before it can build a stale send queue.
    const socket=listener.client.ref as {bufferedAmount?:number}|undefined;
    if ((socket?.bufferedAmount??0)>PHONE.videoFrameTargetBytes*2) return;
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
  private endCall(call: PhoneCall, reason: PhoneCallEnd, by?: string): void {
    if (!this.phoneCalls.end(call.id)) return;
    if (call.answeredAt && Date.now() - call.answeredAt >= ACHIEVEMENT_CALL_MS) { this.achieved(call.from, 'telefonista'); this.achieved(call.to, 'telefonista'); }
    this.sendCall(call, reason, by);
  }
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
