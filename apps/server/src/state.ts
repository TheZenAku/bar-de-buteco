import { Schema, type, view, MapSchema, ArraySchema } from '@colyseus/schema';
import type { MotoPhase } from '@bar/shared';
import { DEFAULT_ENVIRONMENT, DEFAULT_SHOW, DEFAULT_SKIN, NEW_MOTO_PARTS, type EnvironmentState } from '@bar/shared';

/**
 * A player's fist fight (docs/sistemas/luta.md, FistState in packages/shared/src/fight.ts). The guard; the last punch as the inputs threw it (the input,
 * its facing, its step in per input, the puncher's own count) and when the room took it; the last blow taken and until when it stuns.
 */
export class Fist extends Schema {
  @type('boolean') fight = false;
  @type('string') punch = '';
  @type('int32') seq = -1_000_000_000;
  @type('float32') yaw = 0;
  @type('float32') lunge = 0;
  @type('uint8') n = 0;
  @type('number') at = 0;
  @type('number') hitAt = 0;
  @type('string') hit = '';
  @type('float32') hitYaw = 0;
  @type('number') stunUntil = 0;
}
export class Player extends Schema {
  @type('string') id = '';
  /** A short number for this avatar in the crowd records (shared/crowd.ts), so a sprite and its model are known to be one player. */
  @type('uint16') slot = 0;
  @type('string') displayName = '';
  @type('string') color = '#e6a23b';
  @type('string') skin: string = DEFAULT_SKIN;
  @type('boolean') oldWalk = false;
  @type('boolean') fireworkEquipped = false;
  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('float32') z = 8;
  @type('float32') rotation = 0;
  @type('float32') headYaw = 0;
  @type('float32') headPitch = 0;
  /** VR hands (packages/shared/src/vr-arms.ts): '' unless the player is in a headset. */
  @type('string') vrArms = '';
  @type('string') animationState = 'idle';
  @type('number') animationStartedAt = 0;
  /** Drawn at random each time the player starts dancing; every client plays the same clip of its dance bank with it. */
  @type('uint16') dance = 0;
  /** The skill being played while animationState is 'kick' (SKILLS in packages/shared). */
  @type('string') skill = '';
  @type('string') interactionState = '';
  @type('string') currentTableId = '';
  @type('int32') lastProcessedInput = -1;
  @type('boolean') connected = true;
  /** Microphone on, so others can show who may speak. */
  @type('boolean') voice = false;
  /** The drink ordered at the counter, until Magrão serves it ('' otherwise). */
  @type('string') drinkItem = '';
  /**
   * What the player has in hand and is having (a drink from the counter, anything eaten or drunk from the backpack), and
   * since/until when (server clock): the same time as at a table (consumeMs). '' and 0 with empty hands.
   */
  @type('string') holding = '';
  @type('number') holdingSince = 0;
  @type('number') holdingUntil = 0;
  /** Independent cigarette: lighting start and optional extinguishing start, on the room clock. */
  @type('number') smokingSince = 0;
  @type('number') smokingStopAt = 0;
  /** F1 pose: only the arms change, so movement and independent props keep working. */
  @type('boolean') armsCrossed = false;
  // Needs, as whole points (precise values live in NeedsDirector). Everyone sees drunkenness and the
  // condition; the HUD shows the rest to the player.
  @type('uint8') hp = 100;
  @type('uint8') hpMax = 100;
  @type('uint8') stamina = 100;
  /** The cores behind hp, stamina, hunger and thirst (shared/needs.ts). */
  @type('uint8') hpCore = 100;
  @type('uint8') staminaCore = 100;
  @type('uint8') hungerCore = 100;
  @type('uint8') thirstCore = 100;
  @type('uint8') hunger = 100;
  @type('uint8') thirst = 100;
  @type('uint8') bladder = 0;
  @type('uint8') drunk = 0;
  @type('boolean') exhausted = false;
  /** normal, stumbling, fainted or recovering. */
  @type('string') condition = 'normal';
  @type('number') conditionUntil = 0;
  @type('string') faintCause = '';
  /** The job being worked ('' when not working), shown to everyone. */
  @type('string') job = '';
  /** Until when the stage pass lasts (server ms); cleared to 0 when it runs out. Client prediction gates the stage on it. */
  @type('number') stageUntil = 0;
  /** A worker's tray: the table order picked up for a customer, comma-separated ('' when empty), and its id. */
  @type('string') carrying = '';
  @type('string') carryingOrder = '';
  /** 'call' while on an answered phone call ('' otherwise), so everyone sees who is on the line. */
  @type('string') phone = '';
  /** On a Highfood shift, and the bag in hand ('' or 'bag'): both are drawn for everyone. */
  @type('boolean') courier = false;
  @type('number') horseRearAt = 0;
  @type('string') parcel = '';
  /** Has the phone out, so everyone sees them look at it while standing. */
  @type('boolean') looking = false;
  /** Level 1-100 (packages/shared/src/levels.ts), shown beside the name; 0 until the API reports it. */
  @type('uint8') level = 0;
  /** The fist fight (packages/shared/src/fight.ts, FistState): nested, a Schema holds at most 63 fields. */
  @type(Fist) fist = new Fist();
}
export class Npc extends Schema {
  @type('string') id = '';
  @type('string') displayName = '';
  @type('string') color = '#ddaa66';
  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('float32') z = 0;
  @type('float32') rotation = 0;
  @type('string') animationState = 'idle';
  @type('number') animationStartedAt = 0;
  @type('string') behavior = 'idle';
  /** Tonico's tray: the items of the order he carries, comma-separated ('' when empty), and its id. */
  @type('string') carrying = '';
  @type('string') carryingOrder = '';
  /** A Highfood customer's body and what they have in hand. */
  @type('string') skin = '';
  @type('string') parcel = '';
}
export class FuelService extends Schema {
  @type('string') id='';
  @type('string') npcId='';
  @type('string') phase:import('@bar/shared').FuelPhase='idle';
  @type('number') startedAt=0;
  @type('string') playerId='';
  @type('string') vehicleId='';
  @type('float64') litres=0;
  @type('uint32') total=0;
  @type('number') price=6;
  @type('string') message='';
  @type('float32') tankX=0;
  @type('float32') tankY=0;
  @type('float32') tankZ=0;
}
/** Something served on a table top (apps/server/src/world/served.ts). */
export class ServedItem extends Schema {
  @type('string') id = '';
  @type('string') item = '';
  @type('uint8') table = 0;
  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('float32') z = 0;
  @type('float32') rotation = 0;
  /** When it touches the table; until then it travels from the tray, where it was the order's `slot`-th item. */
  @type('number') placedAt = 0;
  @type('string') orderId = '';
  @type('uint8') slot = 0;
  /** The seat it was ordered from: whoever sits there eats it (the bar animations' `comer`). */
  @type('string') seat = '';
  /** When the customer finished it or left it behind (0 while they are on it): from then on it waits to be collected. */
  @type('number') doneAt = 0;
}
/** A blackjack card (BlackjackCard in @bar/shared); the dealer's hole card is rank '?' until it is turned. */
export class CardState extends Schema {
  @type('string') rank = '?';
  @type('string') suit = '';
  @type('uint16') seq = 0;
}
export class HandState extends Schema {
  @type([CardState]) cards = new ArraySchema<CardState>();
  @type('uint32') bet = 0;
  @type('uint8') total = 0;
  @type('boolean') soft = false;
  @type('boolean') split = false;
  @type('boolean') doubled = false;
  @type('string') status = 'playing';
  @type('string') outcome = '';
  @type('uint32') payout = 0;
}
/** A chair at the blackjack table (BlackjackSeat in @bar/shared). */
export class SeatState extends Schema {
  @type('string') playerId = '';
  @type('string') displayName = '';
  @type('uint8') chair = 0;
  @type('uint32') bet = 0;
  @type('uint32') lastBet = 0;
  @type([HandState]) hands = new ArraySchema<HandState>();
  @type('uint32') insurance = 0;
  @type('string') insured = '';
  @type('uint32') staked = 0;
  @type('uint32') paid = 0;
  @type('int32') net = 0;
  @type('string') status = 'watching';
  @type('string') result = '';
}
/** The blackjack table (apps/server/src/minigames/blackjack.ts): never the shoe, never the hole card before it turns. */
export class TableState extends Schema {
  @type('string') id = 'blackjack-1';
  @type('string') phase = 'waiting';
  @type('uint32') round = 0;
  @type('uint32') move = 0;
  @type([SeatState]) seats = new ArraySchema<SeatState>();
  @type([CardState]) dealerCards = new ArraySchema<CardState>();
  @type('uint8') dealerTotal = 0;
  @type('boolean') dealerSoft = false;
  @type('string') turnPlayerId = '';
  @type('int8') turnHand = -1;
  @type('number') deadline = 0;
  @type('string') roundId = '';
  @type('uint32') minBet = 0;
  @type('uint32') maxBet = 0;
}
/** A place at a pebolim table (FoosballSlotView in @bar/shared). */
export class FoosballSlotState extends Schema {
  @type('uint8') slot = 0;
  @type('string') team = 'red';
  @type('string') role = 'solo';
  @type('string') playerId = '';
  @type('string') displayName = '';
  /** Zé do Totó's level when he holds the place, '' otherwise. */
  @type('string') cpu = '';
  @type('boolean') ready = false;
  @type('boolean') connected = true;
}
/**
 * A pebolim table (apps/server/src/minigames/foosball.ts): places, settings, score and phase. The ball and the rods move
 * too fast for patches: they go as foosball.frame messages, 30 a second, to whoever is near or watching.
 */
export class FoosballState extends Schema {
  @type('string') id = '';
  @type('string') phase = 'lobby';
  @type('string') format = '1x1';
  @type('uint8') goals = 5;
  @type('uint8') sets = 1;
  @type('uint32') stake = 0;
  @type('string') level = 'medio';
  @type('string') hostId = '';
  @type([FoosballSlotState]) slots = new ArraySchema<FoosballSlotState>();
  @type('uint8') red = 0;
  @type('uint8') blue = 0;
  @type('uint8') setsRed = 0;
  @type('uint8') setsBlue = 0;
  @type('uint8') set = 1;
  @type('string') serve = 'red';
  @type('number') deadline = 0;
  @type('string') matchId = '';
  @type('string') message = '';
  @type('string') goalTeam = '';
  @type('string') goalBy = '';
  @type('string') goalRod = '';
  @type('float32') goalSpeed = 0;
  @type('string') possTeam = '';
  @type('string') possRod = '';
  @type('number') possSince = 0;
  @type('string') winner = '';
  @type('uint32') minBet = 0;
  @type('uint32') maxBet = 0;
  @type('uint32') revision = 0;
}
export class EventState extends Schema {
  @type('string') id = '';
  @type('string') type = '';
  @type('number') startedAt = 0;
  @type('number') durationMs = 0;
}
/** A video waiting in a source's queue (MediaQueueEntry in packages/shared/src/jukebox.ts). */
export class MediaEntry extends Schema {
  @type('string') key='';
  @type('string') provider='';
  @type('string') videoId='';
  @type('string') title='';
  @type('string') thumb='';
  @type('string') by='';
  @type('string') byName='';
}
/** Playback of one source: the jukebox, or one TV group (separate maps in BarState); see JukeboxState. */
export class Jukebox extends Schema {
  @type('string') id='';
  @type('string') provider='';
  @type('string') videoId='';
  @type('string') status='off';
  @type('number') position=0;
  @type('number') updatedAt=0;
  @type('string') updatedBy='';
  @type('number') revision=0;
  @type('string') key='';
  @type('string') title='';
  @type('string') thumb='';
  /** Who controls the video playing ('' when nobody does). */
  @type('string') by='';
  @type('string') byName='';
  @type('boolean') live=false;
  @type([MediaEntry]) queue=new ArraySchema<MediaEntry>();
}
/** A hinged door (one or two leaves), open or closed; clients animate the swing from changedAt. */
export class DoorState extends Schema {
  @type('string') id = '';
  @type('boolean') open = true;
  @type('number') changedAt = 0;
}
/** One of the stage's musicians' spots (apps/server/src/world/musicians.ts): who plays there and since when. */
export class MusicianSpot extends Schema {
  @type('string') id = '';
  /** '' while the spot is free. */
  @type('string') playerId = '';
  /** entrando, comecando, loop or saindo ('' while free); see packages/shared/src/musicians.ts. */
  @type('string') phase = '';
  /** When the phase began (server ms). */
  @type('number') startedAt = 0;
  @type('boolean') stopping = false;
}
/** A delivery bike (MotoState in packages/shared/src/moto.ts). */
export class Moto extends Schema {
  @type('string') model = 'moto-delivery';
  @type('string') color = '#ccc9c2';
  @type(['string']) passengers = new ArraySchema<string>('','','');
  /** Open left/right doors (bits 1/2), hood, hatch and wipers. */
  @type('uint8') doors = 0;
  @type('boolean') hood = false;
  @type('boolean') trunk = false;
  @type('boolean') wipers = false;
  @type('boolean') horn = false;
  @type('float32') wheelie = 0;
  @type('uint8') headlights = 0;
  @type('boolean') ignition = false;
  @type('float32') fuel = 100;
  @type('string') id = '';
  /** Whoever holds its key ('' for the administration's), their name, the plate on its back and its row in the API. */
  @type('string') ownerId = '';
  @type('string') ownerName = '';
  @type('string') plate = '';
  @type('string') vehicleId = '';
  /** Only the key holder gets on it. */
  @type('boolean') locked = false;
  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('float32') z = 0;
  @type('float32') yaw = 0;
  @type('float32') pitch = 0;
  @type('float32') speed = 0;
  @type('float32') steer = 0;
  @type('float32') lateralSpeed = 0;
  @type('float32') yawRate = 0;
  /** '' while parked. */
  @type('string') riderId = '';
  /** Its steps so far. */
  @type('uint32') ticks = 0;
  /** '' on its wheels and rideable; loose, tumble, down or lifting (moto-crash.ts). */
  @type('string') phase: MotoPhase = '';
  @type('string') lifterId = '';
  /** MOTO_LIGHT's bits. */
  @type('uint8') lights = 0;
  /** How it lies, while `phase` is not empty. */
  @type('float32') qx = 0;
  @type('float32') qy = 0;
  @type('float32') qz = 0;
  @type('float32') qw = 1;
  /** MOTO_ENGINE, and when that last changed (server ms): the browsers play the sounds from these. */
  @type('uint8') engine = 0;
  @type('number') engineAt = 0;
  /** How the last try at starting ends: 0 catches, 1 to 4 which failure. */
  @type('uint8') crank = 0;
  @type('boolean') gas = false;
  /** Each part's condition, whole percents in MOTO_PARTS's order. */
  @type('string') parts = NEW_MOTO_PARTS;
  /** How full a truck's hold is, 0..3: the crates drawn in it (packages/shared/src/vehicle-storage.ts). */
  @type('uint8') load = 0;
  /** Space held by the rider; observers use it for brake audio. */
  @type('boolean') handbrake = false;
}
/** A body thrown from a bike or by a kick (RagdollStart in packages/shared/src/ragdoll.ts): the same steps run from here in the room and in each browser. */
export class RagdollState extends Schema {
  @type('float64') startedAt = 0;
  @type('float64') x = 0;
  @type('float64') y = 0;
  @type('float64') z = 0;
  @type('float64') yaw = 0;
  @type('float64') vx = 0;
  @type('float64') vz = 0;
  @type('float64') closing = 0;
  @type('boolean') seated = false;
  @type('uint32') seed = 0;
  /** Kicked: how fast it went up, and who did it. */
  @type('float64') lift = 0;
  @type('string') by = '';
}
/** The stage show's settings from the light desk (packages/shared/src/stage-show.ts, StageShowState). */
export class StageShowState extends Schema {
  @type('string') power = DEFAULT_SHOW.power;
  @type('string') mode = DEFAULT_SHOW.mode;
  @type('string') program = DEFAULT_SHOW.program;
  /** Comma-separated program ids. */
  @type('string') playlist = DEFAULT_SHOW.playlist;
  @type('uint8') bars = DEFAULT_SHOW.bars;
  @type('string') palette = DEFAULT_SHOW.palette;
  @type('uint8') bpm = DEFAULT_SHOW.bpm;
  /** A beat (server ms): the show's beat counts from it. */
  @type('number') beatAt = DEFAULT_SHOW.beatAt;
  @type('uint8') speed = DEFAULT_SHOW.speed;
  @type('uint8') master = DEFAULT_SHOW.master;
  @type('uint8') lasers = DEFAULT_SHOW.lasers;
  @type('uint8') heads = DEFAULT_SHOW.heads;
  @type('uint8') strobe = DEFAULT_SHOW.strobe;
  @type('string') text = DEFAULT_SHOW.text;
  @type('string') cue = DEFAULT_SHOW.cue;
  @type('number') cueAt = DEFAULT_SHOW.cueAt;
  @type('string') preset = DEFAULT_SHOW.preset;
  @type('string') updatedBy = DEFAULT_SHOW.updatedBy;
  @type('number') updatedAt = DEFAULT_SHOW.updatedAt;
  @type('uint32') revision = DEFAULT_SHOW.revision;
}
/** Public occupancy of a job's slots (apps/server/src/world/jobs.ts). */
export class JobSlotState extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('uint8') slots = 0;
  @type('uint8') workers = 0;
  @type('uint16') pay = 0;
  @type('boolean') enabled = true;
}
export class Environment extends Schema {
  @type('number') anchorMs = DEFAULT_ENVIRONMENT.anchorMs;
  @type('number') hour = DEFAULT_ENVIRONMENT.hour;
  @type('number') dayDurationMs = DEFAULT_ENVIRONMENT.dayDurationMs;
  @type('boolean') paused = DEFAULT_ENVIRONMENT.paused;
  @type('string') weather:EnvironmentState['weather'] = DEFAULT_ENVIRONMENT.weather;
  @type('number') weatherChangedAt = 0;
  @type('number') fromCloud = DEFAULT_ENVIRONMENT.fromCloud;
  @type('number') fromRain = DEFAULT_ENVIRONMENT.fromRain;
  @type('number') fromStorm = DEFAULT_ENVIRONMENT.fromStorm;
  @type('number') fromWind = DEFAULT_ENVIRONMENT.fromWind;
  @type('number') realWeatherAt = DEFAULT_ENVIRONMENT.realWeatherAt;
  @type('number') realCloud = DEFAULT_ENVIRONMENT.realCloud;
  @type('number') realRain = DEFAULT_ENVIRONMENT.realRain;
  @type('number') realStorm = DEFAULT_ENVIRONMENT.realStorm;
  @type('number') realWind = DEFAULT_ENVIRONMENT.realWind;
  @type('number') realPrecipitationMmH = DEFAULT_ENVIRONMENT.realPrecipitationMmH;
}
export class BarState extends Schema {
  @type(Environment) environment = new Environment();
  @view() @type({ map: Player }) players = new MapSchema<Player>();
  @view() @type({ map: Npc }) npcs = new MapSchema<Npc>();
  @type({ map: TableState }) tables = new MapSchema<TableState>();
  @type({ map: FoosballState }) foosball = new MapSchema<FoosballState>();
  @type({ map: Jukebox }) jukeboxes = new MapSchema<Jukebox>();
  @type({ map: Jukebox }) televisions = new MapSchema<Jukebox>();
  @type({ map: DoorState }) doors = new MapSchema<DoorState>();
  @type({ map: JobSlotState }) jobs = new MapSchema<JobSlotState>();
  @type({ map: ServedItem }) served = new MapSchema<ServedItem>();
  @type({ map: MusicianSpot }) musicians = new MapSchema<MusicianSpot>();
  @type({ map: Moto }) motos = new MapSchema<Moto>();
  @type({ map: FuelService }) fuelServices = new MapSchema<FuelService>();
  @type({ map: RagdollState }) ragdolls = new MapSchema<RagdollState>();
  @type(StageShowState) stageShow = new StageShowState();
  @type(EventState) event = new EventState();
  @type('uint16') occupancy = 0;
  @type('uint16') capacity = 32;
  @type('number') serverTime = 0;
}
